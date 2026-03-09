import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SmartCAService } from './smartca.service';
import { DigitalSignature } from './schemas/digital-signature.schema';
import { LoanContract } from '../loan/schemas/loan-contract.schema';
import { generateLoanContractHTML } from '../loan/templates/loan-contract.template';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * DigitalSignatureController
 *
 * Expose endpoints dung cho client mobile:
 *   POST /api/digital-signature/initiate       - Khoi tao phien ky (v1 flow)
 *   POST /api/digital-signature/sign-v2        - Ky truc tiep voi password+OTP (v2 flow)
 *   POST /api/digital-signature/confirm        - Xac nhan ky (v2 confirm)
 *   GET  /api/digital-signature/:id/status     - Check trang thai ky
 *   POST /api/digital-signature/retry/:id      - Retry phien ky
 *   GET  /api/digital-signature/contract/:code - Lay thong tin chu ky cua hop dong
 *   GET  /api/digital-signature/:id/verify     - Verify tinh toan ven
 *   GET  /api/digital-signature/certificates   - Lay danh sach chung thu so
 */
@ApiTags('Digital Signature')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('digital-signature')
export class DigitalSignatureController {
  constructor(
    private readonly smartCAService: SmartCAService,
    @InjectModel(DigitalSignature.name) private signatureModel: Model<DigitalSignature>,
    @InjectModel(LoanContract.name) private contractModel: Model<LoanContract>,
  ) {}

  // ================================================================
  // GET /digital-signature/certificates
  // ================================================================
  @Get('certificates')
  @ApiOperation({ summary: 'Lay danh sach chung thu so cua user' })
  async getCertificates(@Req() req: any) {
    const userId = this.getUserCccd(req);
    const result = await this.smartCAService.getCertificates(userId);
    return {
      success: result.success,
      data: {
        certificates: result.certificates.map((c) => ({
          serialNumber: c.serialNumber,
          status: c.status,
          statusCode: c.statusCode,
          subject: c.subject,
          issuer: c.issuer,
          validFrom: c.validFrom,
          validTo: c.validTo,
        })),
        selectedSerial: result.selectedSerial,
      },
    };
  }

  // ================================================================
  // POST /digital-signature/initiate
  // Flow v1: Gui yeu cau ky -> User xac nhan tren app VNPT SmartCA
  // ================================================================
  @Post('initiate')
  @ApiOperation({ summary: 'Khoi tao phien ky so (v1 - user xac nhan tren app)' })
  async initiateSigning(@Body() body: { contractId: string }, @Req() req: any) {
    const { contractId } = body;
    if (!contractId) throw new BadRequestException('contractId is required');

    const userId = req.user?.sub || req.user?._id || req.user?.userId;
    const userCccd = this.getUserCccd(req);

    // Find contract
    const contract = await this.findContract(contractId, userId);
    if (contract.status !== 'pending_signature') {
      throw new BadRequestException(`Hop dong da o trang thai: ${contract.status}`);
    }

    // Generate HTML and hash it
    const contractHTML = generateLoanContractHTML({ contract });
    const documentHash = this.smartCAService.hashDocument(contractHTML);

    // Send sign request to VNPT SmartCA
    const session = await this.smartCAService.initiateSigningSession({
      documentData: contractHTML,
      userId: userCccd,
      contractId: contract.contractId,
    });

    // Save to DB
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
      success: true,
      data: {
        signatureId: signature._id?.toString(),
        transactionId: session.transactionId,
        signingSessionId: session.transactionId,
        credentialId: session.serialNumber || '',
        expiresAt: session.expiresAt.toISOString(),
        flow: 'v1',
      },
    };
  }

  // ================================================================
  // POST /digital-signature/sign-v2
  // Flow v2: Ky truc tiep voi password + OTP (SmartCA tich hop)
  // ================================================================
  @Post('sign-v2')
  @ApiOperation({ summary: 'Ky so truc tiep v2 (password + OTP)' })
  async signV2(
    @Body() body: { contractId: string; password: string; otp: string },
    @Req() req: any,
  ) {
    const { contractId, password, otp } = body;
    if (!contractId) throw new BadRequestException('contractId is required');
    if (!password) throw new BadRequestException('password is required');
    if (!otp) throw new BadRequestException('otp is required');

    const userId = req.user?.sub || req.user?._id || req.user?.userId;
    const userCccd = this.getUserCccd(req);

    const contract = await this.findContract(contractId, userId);
    if (contract.status !== 'pending_signature') {
      throw new BadRequestException(`Hop dong da o trang thai: ${contract.status}`);
    }

    const contractHTML = generateLoanContractHTML({ contract });
    const documentHash = this.smartCAService.hashDocument(contractHTML);

    // Sign directly with v2 API
    const result = await this.smartCAService.signDocumentV2({
      documentData: contractHTML,
      userId: userCccd,
      password,
      otp,
      contractId: contract.contractId,
    });

    // Save to DB
    const signatureDoc = await this.signatureModel.create({
      contractId: contract._id,
      userId: new Types.ObjectId(userId),
      contractCode: contract.contractId,
      provider: 'vnpt_smartca',
      transactionId: result.transactionId,
      status: result.success ? 'signed' : 'failed',
      documentHash,
      signatureValue: result.signatures?.[0]?.signatureValue,
      completedAt: result.success ? new Date() : undefined,
      lastError: result.error,
      idempotencyKey: `sign:${contract.contractId}:${Math.floor(Date.now() / 60000)}`,
    });

    // If success, update contract status
    if (result.success) {
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
    }

    return {
      success: result.success,
      data: {
        signatureId: signatureDoc._id?.toString(),
        transactionId: result.transactionId,
        status: result.success ? 'signed' : 'failed',
        completedAt: result.success ? new Date().toISOString() : undefined,
        error: result.error,
      },
    };
  }

  // ================================================================
  // POST /digital-signature/confirm
  // For v2 flow that needs a confirm step, or for v1 flow result submission
  // ================================================================
  @Post('confirm')
  @ApiOperation({ summary: 'Xac nhan ket qua ky so' })
  async confirmSigning(
    @Body() body: { signatureId: string; result?: any; password?: string; sad?: string },
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?._id || req.user?.userId;

    const signature = await this.signatureModel.findOne({
      _id: body.signatureId,
      userId: new Types.ObjectId(userId),
    });

    if (!signature) throw new BadRequestException('Khong tim thay phien ky');

    // If v2 confirm with sad
    if (body.sad && body.password && signature.transactionId) {
      const userCccd = this.getUserCccd(req);
      const confirmResult = await this.smartCAService.confirmSignV2({
        userId: userCccd,
        password: body.password,
        transactionId: signature.transactionId,
        sad: body.sad,
      });

      if (confirmResult.success) {
        signature.status = 'signed';
        signature.signatureValue = confirmResult.signatures?.[0]?.signatureValue;
        signature.completedAt = new Date();
        await signature.save();

        // Update contract
        await this.contractModel.updateOne(
          { _id: signature.contractId },
          { $set: { status: 'signed', signedAt: new Date(), signatureData: signature.signatureValue } },
        );
      } else {
        signature.status = 'failed';
        signature.lastError = confirmResult.error;
        await signature.save();
      }

      return {
        success: confirmResult.success,
        data: {
          status: confirmResult.success ? 'signed' : 'failed',
          completedAt: confirmResult.success ? signature.completedAt?.toISOString() : undefined,
          error: confirmResult.error,
        },
      };
    }

    // For v1 flow: client reports the result from polling
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

      return { success: true, data: { status: 'signed', completedAt: signature.completedAt?.toISOString() } };
    }

    // Failed/rejected
    signature.status = body.result?.status === 'REJECTED' ? 'rejected' : 'failed';
    signature.lastError = body.result?.errorMessage || 'Ky that bai';
    await signature.save();

    return { success: false, data: { status: signature.status, error: signature.lastError } };
  }

  // ================================================================
  // GET /digital-signature/:id/status
  // ================================================================
  @Get(':id/status')
  @ApiOperation({ summary: 'Kiem tra trang thai ky so' })
  async checkStatus(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.sub || req.user?._id || req.user?.userId;

    const signature = await this.signatureModel.findOne({
      _id: id,
      userId: new Types.ObjectId(userId),
    });

    if (!signature) throw new BadRequestException('Khong tim thay phien ky');

    // If already terminal
    if (['signed', 'failed', 'rejected', 'expired', 'cancelled'].includes(signature.status)) {
      return {
        success: true,
        data: {
          status: signature.status,
          transactionId: signature.transactionId,
          completedAt: signature.completedAt?.toISOString(),
        },
      };
    }

    // Poll VNPT for live status
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
        success: true,
        data: {
          status: signature.status,
          transactionId: signature.transactionId,
          completedAt: signature.completedAt?.toISOString(),
        },
      };
    }

    return {
      success: true,
      data: { status: signature.status, transactionId: signature.transactionId },
    };
  }

  // ================================================================
  // POST /digital-signature/retry/:id
  // ================================================================
  @Post('retry/:id')
  @ApiOperation({ summary: 'Thu lai phien ky so' })
  async retrySigning(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.sub || req.user?._id || req.user?.userId;
    const userCccd = this.getUserCccd(req);

    const oldSignature = await this.signatureModel.findOne({
      _id: id,
      userId: new Types.ObjectId(userId),
    });

    if (!oldSignature) throw new BadRequestException('Khong tim thay phien ky');

    // Find contract
    const contract = await this.contractModel.findById(oldSignature.contractId);
    if (!contract) throw new BadRequestException('Khong tim thay hop dong');
    if (contract.status !== 'pending_signature') {
      throw new BadRequestException(`Hop dong da o trang thai: ${contract.status}`);
    }

    // Mark old signature as cancelled
    oldSignature.status = 'cancelled';
    await oldSignature.save();

    // Create new signing session
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
      success: true,
      data: {
        signatureId: newSignature._id?.toString(),
        transactionId: session.transactionId,
        signingSessionId: session.transactionId,
        credentialId: session.serialNumber || '',
        expiresAt: session.expiresAt.toISOString(),
      },
    };
  }

  // ================================================================
  // GET /digital-signature/contract/:contractCode
  // ================================================================
  @Get('contract/:contractCode')
  @ApiOperation({ summary: 'Lay thong tin chu ky so cua hop dong' })
  async getContractSignature(@Param('contractCode') contractCode: string, @Req() req: any) {
    const userId = req.user?.sub || req.user?._id || req.user?.userId;

    const signature = await this.signatureModel
      .findOne({
        contractCode,
        userId: new Types.ObjectId(userId),
        status: 'signed',
      })
      .sort({ completedAt: -1 })
      .lean();

    return { success: true, data: signature || null };
  }

  // ================================================================
  // GET /digital-signature/:id/verify
  // ================================================================
  @Get(':id/verify')
  @ApiOperation({ summary: 'Xac minh tinh toan ven chu ky so' })
  async verifySignature(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.sub || req.user?._id || req.user?.userId;

    const signature = await this.signatureModel.findOne({
      _id: id,
      userId: new Types.ObjectId(userId),
    });

    if (!signature) throw new BadRequestException('Khong tim thay chu ky');

    const contract = await this.contractModel.findById(signature.contractId);
    if (!contract) throw new BadRequestException('Khong tim thay hop dong');

    const contractHTML = generateLoanContractHTML({ contract });
    const currentHash = this.smartCAService.hashDocument(contractHTML);

    const valid = currentHash === signature.documentHash;

    return {
      success: true,
      data: {
        valid,
        documentHash: signature.documentHash,
        currentHash,
        message: valid
          ? 'Chu ky so hop le. Noi dung hop dong khong bi thay doi.'
          : 'CANH BAO: Noi dung hop dong da bi thay doi sau khi ky!',
      },
    };
  }

  // ================================================================
  // Helpers
  // ================================================================
  private getUserCccd(req: any): string {
    // Try to get CCCD from user's KYC data, fallback to default
    const kycData = req.user?.kycData || {};
    return kycData.idNumber || kycData.cccd || this.smartCAService['config'].defaultUserId || '';
  }

  private async findContract(contractId: string, userId: string): Promise<any> {
    const query = Types.ObjectId.isValid(contractId)
      ? { $or: [{ _id: contractId }, { contractId }] }
      : { contractId };

    const contract = await this.contractModel
      .findOne({ ...query, userId: new Types.ObjectId(userId) })
      .lean();

    if (!contract) throw new BadRequestException('Khong tim thay hop dong');
    return contract;
  }
}
