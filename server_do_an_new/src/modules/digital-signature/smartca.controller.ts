import { BadRequestException, Body, Controller, Get, Logger, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { ModuleRef } from '@nestjs/core';
import { Model, Types } from 'mongoose';
import { SmartCAService } from './smartca.service';
import { DigitalSignature } from './schemas/digital-signature.schema';
import { LoanContract } from '../loan/schemas/loan-contract.schema';
import { InvestmentContract } from '../invest/schemas/investment-contract.schema';
import { generateLoanContractHTML } from '../loan/templates/loan-contract.template';
import { generateInvestmentContractHTML } from '../invest/templates/investment-contract.template';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KycVerifiedGuard } from '../../common/guards/kyc-verified.guard';
import type { UserPayload } from '../auth/interfaces/auth.interface';

@ApiTags('Digital Signature')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, KycVerifiedGuard)
@Controller('digital-signature')
export class DigitalSignatureController {
  private readonly logger = new Logger(DigitalSignatureController.name);

  constructor(
    private readonly smartCAService: SmartCAService,
    private readonly moduleRef: ModuleRef,
    @InjectModel(DigitalSignature.name) private signatureModel: Model<DigitalSignature>,
    @InjectModel(LoanContract.name) private contractModel: Model<LoanContract>,
    @InjectModel(InvestmentContract.name) private investContractModel: Model<InvestmentContract>,
  ) {}

  private async triggerAutoDisburseIfEligible(contractMongoId: any, userId: string): Promise<void> {
    try {
      const contract = await this.contractModel.findById(contractMongoId).select('loanId').lean();
      if (!contract?.loanId) return;

      const investPaymentService = this.moduleRef.get('InvestPaymentService', { strict: false }) as any;
      if (!investPaymentService?.handleFullMatchDisbursement) return;

      investPaymentService.handleFullMatchDisbursement(String(contract.loanId), userId).catch((err: any) => {
        this.logger.warn(`[triggerAutoDisburseIfEligible] Auto-disburse trigger failed: ${err?.message}`);
      });
    } catch (err: any) {
      this.logger.warn(`[triggerAutoDisburseIfEligible] Failed: ${err?.message}`);
    }
  }

  @Get('certificates')
  @ApiOperation({ summary: 'Lấy danh sách chứng thư số của user' })
  async getCertificates(@CurrentUser() user: UserPayload) {
    const userCccd = this.getUserCccd(user);
    const result = await this.smartCAService.getCertificates(userCccd);
    return {
      certificates: result.certificates.map(c => ({
        serialNumber: c.serialNumber,
        status: c.status,
        statusCode: c.statusCode,
        subject: c.subject,
        issuer: c.issuer,
        validFrom: c.validFrom,
        validTo: c.validTo,
      })),
      selectedSerial: result.selectedSerial,
    };
  }

  @Post('initiate')
  @ApiOperation({ summary: 'Khởi tạo phiên ký số (v1 - user xác nhận trên app)' })
  async initiateSigning(@Body() body: { contractId: string }, @CurrentUser() user: UserPayload) {
    const { contractId } = body;
    if (!contractId) throw new BadRequestException('contractId is required');

    const userId = user._id || (user as any).sub || (user as any).userId;
    const userCccd = this.getUserCccd(user);

    const contract = await this.findContract(contractId, userId);
    if (contract.status !== 'pending_signature') {
      throw new BadRequestException(`Hợp đồng đã ở trạng thái: ${contract.status}`);
    }

    const contractHTML = this.generateContractHTML(contract);
    const documentHash = this.smartCAService.hashDocument(contractHTML);

    const session = await this.smartCAService.initiateSigningSession({
      documentData: contractHTML,
      userId: userCccd,
      contractId: contract.contractId,
    });

    const signature = await this.signatureModel.create({
      contractId: contract._id,
      userId: new Types.ObjectId(userId),
      contractCode: contract.contractId,
      provider: 'vnpt_smartca',
      transactionId: session.transactionId,
      status: 'initiated',
      documentHash,
      idempotencyKey: `sign:${contract.contractId}:${Math.floor(Date.now() / 60000)}`,
      expiresAt: session.expiresAt,
    });

    return {
      signatureId: signature._id?.toString(),
      transactionId: session.transactionId,
      signingSessionId: session.transactionId,
      credentialId: session.serialNumber || '',
      expiresAt: session.expiresAt.toISOString(),
      flow: 'v1',
    };
  }

  @Post('sign-v2')
  @ApiOperation({ summary: 'Ký số trực tiếp v2 (password + OTP)' })
  async signV2(@Body() body: { contractId: string; password: string; otp: string }, @CurrentUser() user: UserPayload) {
    const { contractId, password, otp } = body;
    if (!contractId) throw new BadRequestException('contractId is required');
    if (!password) throw new BadRequestException('password is required');
    if (!otp) throw new BadRequestException('otp is required');

    const userId = user._id || (user as any).sub || (user as any).userId;
    const userCccd = this.getUserCccd(user);

    const contract = await this.findContract(contractId, userId);
    if (contract.status !== 'pending_signature') {
      throw new BadRequestException(`Hợp đồng đã ở trạng thái: ${contract.status}`);
    }

    const contractHTML = this.generateContractHTML(contract);
    const documentHash = this.smartCAService.hashDocument(contractHTML);

    const result = await this.smartCAService.signDocumentV2({
      documentData: contractHTML,
      userId: userCccd,
      password,
      otp,
      contractId: contract.contractId,
    });

    const signatureDoc = await this.signatureModel.create({
      contractId: contract._id,
      userId: new Types.ObjectId(userId),
      contractCode: contract.contractId,
      provider: 'vnpt_smartca',
      transactionId: result.transactionId,
      status: 'signed',
      documentHash,
      signatureValue: result.signatures?.[0]?.signatureValue,
      completedAt: new Date(),
      idempotencyKey: `sign:${contract.contractId}:${Math.floor(Date.now() / 60000)}`,
    });

    await this.updateContractSigned(contract, result.signatures?.[0]?.signatureValue);

    return {
      signatureId: signatureDoc._id?.toString(),
      transactionId: result.transactionId,
      status: 'signed',
      completedAt: new Date().toISOString(),
    };
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Xác nhận kết quả ký số' })
  async confirmSigning(
    @Body() body: { signatureId: string; result?: any; password?: string; sad?: string },
    @CurrentUser() user: UserPayload,
  ) {
    const userId = user._id || (user as any).sub || (user as any).userId;

    const signature = await this.signatureModel.findOne({
      _id: body.signatureId,
      userId: new Types.ObjectId(userId),
    });

    if (!signature) throw new BadRequestException('Không tìm thấy phiên ký');

    if (body.sad && body.password && signature.transactionId) {
      const userCccd = this.getUserCccd(user);
      const confirmResult = await this.smartCAService.confirmSignV2({
        userId: userCccd,
        password: body.password,
        transactionId: signature.transactionId,
        sad: body.sad,
      });

      signature.status = 'signed';
      signature.signatureValue = confirmResult.signatures?.[0]?.signatureValue;
      signature.completedAt = new Date();
      await signature.save();

      // Find the contract to determine type and update
      const confirmContract = await this.findContractByMongoId(signature.contractId);
      if (confirmContract) {
        await this.updateContractSigned(confirmContract, signature.signatureValue);
      }

      return {
        status: 'signed',
        completedAt: signature.completedAt?.toISOString(),
      };
    }

    if (body.result?.status === 'SUCCESS' || body.result?.status === 'signed') {
      signature.status = 'signed';
      signature.signatureValue = body.result?.signatureValue;
      signature.completedAt = new Date();
      if (body.result?.signerInfo) {
        signature.signerInfo = {
          commonName: body.result.signerInfo.commonName,
          serialNumber: body.result.signerInfo.serialNumber,
          organization: body.result.signerInfo.organization,
        };
      }
      await signature.save();

      // Find the contract to determine type and update
      const successContract = await this.findContractByMongoId(signature.contractId);
      if (successContract) {
        await this.updateContractSigned(successContract, signature.signatureValue);
      }

      return { status: 'signed', completedAt: signature.completedAt?.toISOString() };
    }

    signature.status = body.result?.status === 'REJECTED' ? 'rejected' : 'failed';
    signature.lastError = body.result?.errorMessage || 'Ký thất bại';
    await signature.save();

    throw new BadRequestException(signature.lastError);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Kiểm tra trạng thái ký số' })
  async checkStatus(@Param('id') id: string, @CurrentUser() user: UserPayload) {
    const userId = user._id || (user as any).sub || (user as any).userId;

    const signature = await this.signatureModel.findOne({
      _id: id,
      userId: new Types.ObjectId(userId),
    });

    if (!signature) throw new BadRequestException('Không tìm thấy phiên ký');

    if (['signed', 'failed', 'rejected', 'expired', 'cancelled'].includes(signature.status)) {
      return {
        status: signature.status,
        transactionId: signature.transactionId,
        completedAt: signature.completedAt?.toISOString(),
      };
    }

    if (signature.transactionId) {
      const liveStatus = await this.smartCAService.checkSignStatus(signature.transactionId);

      if (liveStatus.status === 'signed' && liveStatus.signatures?.length) {
        signature.status = 'signed';
        signature.signatureValue = liveStatus.signatures[0].signatureValue;
        signature.completedAt = new Date();
        await signature.save();

        const statusContract = await this.findContractByMongoId(signature.contractId);
        if (statusContract) {
          await this.updateContractSigned(statusContract, signature.signatureValue);
        }
      } else if (liveStatus.status !== 'pending') {
        signature.status = liveStatus.status;
        await signature.save();
      }

      return {
        status: signature.status,
        transactionId: signature.transactionId,
        completedAt: signature.completedAt?.toISOString(),
      };
    }

    return { status: signature.status, transactionId: signature.transactionId };
  }

  @Post('retry/:id')
  @ApiOperation({ summary: 'Thử lại phiên ký số' })
  async retrySigning(@Param('id') id: string, @CurrentUser() user: UserPayload) {
    const userId = user._id || (user as any).sub || (user as any).userId;
    const userCccd = this.getUserCccd(user);

    const oldSignature = await this.signatureModel.findOne({
      _id: id,
      userId: new Types.ObjectId(userId),
    });

    if (!oldSignature) throw new BadRequestException('Không tìm thấy phiên ký');

    // Try finding contract in both models
    let contract: any = await this.contractModel.findById(oldSignature.contractId);
    let retryContractType: 'loan' | 'invest' = 'loan';
    if (!contract) {
      contract = await this.investContractModel.findById(oldSignature.contractId);
      retryContractType = 'invest';
    }
    if (!contract) throw new BadRequestException('Không tìm thấy hợp đồng');
    if (contract.status !== 'pending_signature') {
      throw new BadRequestException(`Hợp đồng đã ở trạng thái: ${contract.status}`);
    }

    oldSignature.status = 'cancelled';
    await oldSignature.save();

    const contractObj = contract.toJSON ? contract.toJSON() : contract;
    (contractObj as any).__contractType = retryContractType;
    const contractHTML = this.generateContractHTML(contractObj);
    const documentHash = this.smartCAService.hashDocument(contractHTML);

    const session = await this.smartCAService.initiateSigningSession({
      documentData: contractHTML,
      userId: userCccd,
      contractId: contract.contractId,
    });

    const newSignature = await this.signatureModel.create({
      contractId: contract._id,
      userId: new Types.ObjectId(userId),
      contractCode: contract.contractId,
      provider: 'vnpt_smartca',
      transactionId: session.transactionId,
      status: 'initiated',
      documentHash,
      idempotencyKey: `sign:${contract.contractId}:${Math.floor(Date.now() / 60000)}`,
      expiresAt: session.expiresAt,
      retryCount: (oldSignature.retryCount || 0) + 1,
    });

    return {
      signatureId: newSignature._id?.toString(),
      transactionId: session.transactionId,
      signingSessionId: session.transactionId,
      credentialId: session.serialNumber || '',
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  @Get('contract/:contractCode')
  @ApiOperation({ summary: 'Lấy thông tin chữ ký số của hợp đồng' })
  async getContractSignature(@Param('contractCode') contractCode: string, @CurrentUser() user: UserPayload) {
    const userId = user._id || (user as any).sub || (user as any).userId;

    const signature = await this.signatureModel
      .findOne({
        contractCode,
        userId: new Types.ObjectId(userId),
        status: 'signed',
      })
      .sort({ completedAt: -1 })
      .lean();

    return signature || null;
  }

  @Get(':id/verify')
  @ApiOperation({ summary: 'Xác minh tính toàn vẹn chữ ký số' })
  async verifySignature(@Param('id') id: string, @CurrentUser() user: UserPayload) {
    const userId = user._id || (user as any).sub || (user as any).userId;

    const signature = await this.signatureModel.findOne({
      _id: id,
      userId: new Types.ObjectId(userId),
    });

    if (!signature) throw new BadRequestException('Không tìm thấy chữ ký');

    const verifyContract = await this.findContractByMongoId(signature.contractId);
    if (!verifyContract) throw new BadRequestException('Không tìm thấy hợp đồng');

    const contractHTML = this.generateContractHTML(verifyContract);
    const currentHash = this.smartCAService.hashDocument(contractHTML);

    const valid = currentHash === signature.documentHash;

    return {
      valid,
      documentHash: signature.documentHash,
      currentHash,
      message: valid
        ? 'Chữ ký số hợp lệ. Nội dung hợp đồng không bị thay đổi.'
        : 'CẢNH BÁO: Nội dung hợp đồng đã bị thay đổi sau khi ký!',
    };
  }

  private getUserCccd(user: any): string {
    const kycData = user?.kycData || {};
    return kycData.idNumber || kycData.cccd || this.smartCAService['config'].defaultUserId || '';
  }

  private async findContractByMongoId(contractMongoId: any): Promise<any | null> {
    let contract = await this.contractModel.findById(contractMongoId).lean();
    if (contract) {
      (contract as any).__contractType = 'loan';
      return contract;
    }
    const investContract = await this.investContractModel.findById(contractMongoId).lean();
    if (investContract) {
      (investContract as any).__contractType = 'invest';
      return investContract;
    }
    return null;
  }

  private async findContract(contractId: string, userId: string): Promise<any> {
    const query = Types.ObjectId.isValid(contractId) ? { $or: [{ _id: contractId }, { contractId }] } : { contractId };

    // Search LoanContract first
    let contract = await this.contractModel.findOne({ ...query, userId: new Types.ObjectId(userId) }).lean();
    if (!contract) {
      contract = await this.contractModel.findOne(query).lean();
    }
    if (contract) {
      (contract as any).__contractType = 'loan';
      return contract;
    }

    // Search InvestmentContract (lenderId instead of userId)
    let investContract = await this.investContractModel
      .findOne({ ...query, lenderId: new Types.ObjectId(userId) })
      .lean();
    if (!investContract) {
      investContract = await this.investContractModel.findOne(query).lean();
    }
    if (investContract) {
      (investContract as any).__contractType = 'invest';
      return investContract;
    }

    throw new BadRequestException('Không tìm thấy hợp đồng');
  }

  private getContractType(contract: any): 'loan' | 'invest' {
    return contract.__contractType || (contract.lenderId ? 'invest' : 'loan');
  }

  private generateContractHTML(contract: any): string {
    if (this.getContractType(contract) === 'invest') {
      return generateInvestmentContractHTML({ contract });
    }
    return generateLoanContractHTML({ contract });
  }

  private getContractModel(contract: any): Model<any> {
    return this.getContractType(contract) === 'invest' ? this.investContractModel : this.contractModel;
  }

  private async updateContractSigned(contract: any, signatureValue?: string): Promise<void> {
    const model = this.getContractModel(contract);
    const isInvest = this.getContractType(contract) === 'invest';

    await model.updateOne(
      { _id: contract._id },
      {
        $set: {
          status: isInvest ? 'active' : 'signed',
          signedAt: new Date(),
          signatureData: signatureValue,
          smartCASignatureVerified: true,
          signatureProvider: 'vnpt_smartca',
          signatureVerifiedAt: new Date(),
        },
      },
    );

    // Only trigger auto-disburse for loan contracts
    if (!isInvest) {
      await this.triggerAutoDisburseIfEligible(contract._id, String(contract.userId));
    }
  }
}
