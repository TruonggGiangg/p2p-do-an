import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SmartCAService } from './smartca.service';
import { DigitalSignature } from './schemas/digital-signature.schema';
import { LoanContract } from '../loan/schemas/loan-contract.schema';
import { generateLoanContractHTML } from '../loan/templates/loan-contract.template';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KycVerifiedGuard } from '../../common/guards/kyc-verified.guard';
import type { UserPayload } from '../auth/interfaces/auth.interface';

@ApiTags('Digital Signature')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, KycVerifiedGuard)
@Controller('digital-signature')
export class DigitalSignatureController {
  constructor(
    private readonly smartCAService: SmartCAService,
    @InjectModel(DigitalSignature.name) private signatureModel: Model<DigitalSignature>,
    @InjectModel(LoanContract.name) private contractModel: Model<LoanContract>,
  ) {}

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

    const contractHTML = generateLoanContractHTML({ contract });
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

    const contractHTML = generateLoanContractHTML({ contract });
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

    await this.contractModel.updateOne(
      { _id: contract._id },
      {
        $set: {
          status: 'signed',
          signedAt: new Date(),
          signatureData: result.signatures?.[0]?.signatureValue,
        },
      },
    );

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

      await this.contractModel.updateOne(
        { _id: signature.contractId },
        { $set: { status: 'signed', signedAt: new Date(), signatureData: signature.signatureValue } },
      );

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

      await this.contractModel.updateOne(
        { _id: signature.contractId },
        { $set: { status: 'signed', signedAt: new Date(), signatureData: signature.signatureValue } },
      );

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

        await this.contractModel.updateOne(
          { _id: signature.contractId },
          { $set: { status: 'signed', signedAt: new Date(), signatureData: signature.signatureValue } },
        );
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

    const contract = await this.contractModel.findById(oldSignature.contractId);
    if (!contract) throw new BadRequestException('Không tìm thấy hợp đồng');
    if (contract.status !== 'pending_signature') {
      throw new BadRequestException(`Hợp đồng đã ở trạng thái: ${contract.status}`);
    }

    oldSignature.status = 'cancelled';
    await oldSignature.save();

    const contractHTML = generateLoanContractHTML({ contract });
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

    const contract = await this.contractModel.findById(signature.contractId);
    if (!contract) throw new BadRequestException('Không tìm thấy hợp đồng');

    const contractHTML = generateLoanContractHTML({ contract });
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

  private async findContract(contractId: string, userId: string): Promise<any> {
    const query = Types.ObjectId.isValid(contractId) ? { $or: [{ _id: contractId }, { contractId }] } : { contractId };

    let contract = await this.contractModel.findOne({ ...query, userId: new Types.ObjectId(userId) }).lean();

    if (!contract) {
      contract = await this.contractModel.findOne(query).lean();
    }

    if (!contract) throw new BadRequestException('Không tìm thấy hợp đồng');
    return contract;
  }
}
