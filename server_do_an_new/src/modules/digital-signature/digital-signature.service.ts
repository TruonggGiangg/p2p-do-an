import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

import { DigitalSignature, SignatureProvider, DigitalSignatureStatus } from './schemas/digital-signature.schema';
import { LoanContract } from '../loan/schemas/loan-contract.schema';
import { Notification } from '../loan/schemas/notification.schema';

/**
 * VNPT SmartCA SDK Flow (Cách 2 — Ký embedded trong app):
 *
 * 1. Client gọi POST /digital-signature/initiate → Server tạo bản ghi + gọi VNPT API tạo phiên ký
 * 2. Server trả về { signingSessionId, transactionId, credentialId } cho client
 * 3. Client dùng SDK SmartCA nhúng (react-native) để mở phiên ký với signingSessionId
 * 4. User xác nhận ký trên app VNPT SmartCA (PIN/biometric)
 * 5. SDK SmartCA trả kết quả cho client → client gọi POST /digital-signature/confirm
 * 6. Server verify kết quả, update trạng thái, update hợp đồng → done
 *
 * Hoặc VNPT gọi webhook callback về server song song.
 */

// ===================== VNPT SmartCA API Response Types =====================
interface SmartCaAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SmartCaCredential {
  credentialId: string;
  alias: string;
  status: string;
  certData?: {
    subject: string;
    issuer: string;
    serialNumber: string;
    notBefore: string;
    notAfter: string;
  };
}

interface SmartCaSigningSession {
  transactionId: string;
  signingSessionId: string;
  status: string;
}

interface SmartCaSignResult {
  status: 'SUCCESS' | 'FAILED' | 'REJECTED' | 'TIMEOUT';
  signatureValue?: string;
  signerCertificate?: string;
  signerInfo?: {
    commonName?: string;
    serialNumber?: string;
    organization?: string;
    validFrom?: string;
    validTo?: string;
  };
  signedFileUrl?: string;
  errorCode?: string;
  errorMessage?: string;
}

@Injectable()
export class DigitalSignatureService {
  private readonly logger = new Logger(DigitalSignatureService.name);
  private cachedToken: { token: string; expiresAt: number } | null = null;

  // Config
  private readonly apiUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUrl: string;
  private readonly signingTimeoutMs: number;
  private readonly maxRetries: number;

  constructor(
    @InjectModel(DigitalSignature.name) private signatureModel: Model<DigitalSignature>,
    @InjectModel(LoanContract.name) private contractModel: Model<LoanContract>,
    @InjectModel(Notification.name) private notificationModel: Model<Notification>,
    private configService: ConfigService,
  ) {
    this.apiUrl = this.configService.get<string>('smartca.apiUrl', 'https://gwsca.vnpt.vn');
    this.clientId = this.configService.get<string>('smartca.clientId', '');
    this.clientSecret = this.configService.get<string>('smartca.clientSecret', '');
    this.callbackUrl = this.configService.get<string>('smartca.callbackUrl', '');
    this.signingTimeoutMs = this.configService.get<number>('smartca.signingTimeoutMs', 15 * 60 * 1000); // 15 phút
    this.maxRetries = this.configService.get<number>('smartca.maxRetries', 3);
  }

  // =====================================================================
  //  1. KHỞI TẠO PHIÊN KÝ SỐ
  // =====================================================================

  /**
   * Khởi tạo yêu cầu ký số cho 1 hợp đồng.
   * - Idempotent: cùng contractId chỉ tạo 1 phiên active
   * - Tự động expire phiên cũ nếu quá hạn
   */
  async initiateSigningRequest(
    contractId: string,
    userId: string,
    options?: { clientIp?: string; userAgent?: string },
  ): Promise<{
    signatureId: string;
    transactionId: string;
    signingSessionId: string;
    credentialId: string;
    expiresAt: Date;
  }> {
    // 1. Validate hợp đồng
    const contract = await this.contractModel.findOne({ contractId, userId: new Types.ObjectId(userId) }).exec();

    if (!contract) {
      throw new NotFoundException('Không tìm thấy hợp đồng');
    }

    if (contract.status !== 'pending_signature') {
      throw new BadRequestException(`Hợp đồng đang ở trạng thái "${contract.status}", không thể ký`);
    }

    // 2. Tạo idempotency key — ngăn duplicate request
    const timeBucket = Math.floor(Date.now() / this.signingTimeoutMs);
    const idempotencyKey = `sign:${contractId}:${timeBucket}`;

    // 3. Kiểm tra phiên ký đang active (chưa hết hạn, chưa failed/cancelled)
    const existingActive = await this.signatureModel
      .findOne({
        contractCode: contractId,
        status: { $in: ['initiated', 'pending'] },
        expiresAt: { $gt: new Date() },
      })
      .exec();

    if (existingActive) {
      this.logger.log(`[initiateSigningRequest] Returning existing active session: ${existingActive._id}`);
      return {
        signatureId: existingActive._id.toString(),
        transactionId: existingActive.transactionId || '',
        signingSessionId: existingActive.providerMetadata?.signingSessionId || '',
        credentialId: existingActive.credentialId || '',
        expiresAt: existingActive.expiresAt!,
      };
    }

    // 4. Expire các phiên cũ chưa kết thúc
    await this.signatureModel.updateMany(
      {
        contractCode: contractId,
        status: { $in: ['initiated', 'pending'] },
      },
      { $set: { status: 'expired' as DigitalSignatureStatus } },
    );

    // 5. Tạo document hash (SHA-256 of contract HTML)
    const documentHash = await this.generateDocumentHash(contract);

    // 6. Gọi VNPT SmartCA API tạo phiên ký
    let signingSession: SmartCaSigningSession;
    let credentialId = '';

    try {
      // 6a. Get access token
      const accessToken = await this.getSmartCaAccessToken();

      // 6b. Get user credential (chứng thư số)
      const credential = await this.getSmartCaCredential(accessToken, userId);
      credentialId = credential.credentialId;

      // 6c. Tạo phiên ký
      signingSession = await this.createSmartCaSigningSession(accessToken, credentialId, documentHash, contractId);
    } catch (error) {
      this.logger.error(`[initiateSigningRequest] VNPT SmartCA API error: ${error.message}`, error.stack);

      // Tạo bản ghi failed để track
      await this.signatureModel.create({
        contractId: contract._id,
        userId: new Types.ObjectId(userId),
        contractCode: contractId,
        provider: SignatureProvider.VNPT_SMARTCA,
        status: 'failed' as DigitalSignatureStatus,
        documentHash,
        idempotencyKey: `${idempotencyKey}:fail:${Date.now()}`,
        lastError: error.message,
        clientIp: options?.clientIp,
        userAgent: options?.userAgent,
      });

      throw new InternalServerErrorException('Không thể kết nối dịch vụ ký số VNPT SmartCA. Vui lòng thử lại sau.');
    }

    // 7. Lưu bản ghi chữ ký số
    const expiresAt = new Date(Date.now() + this.signingTimeoutMs);
    let signature: DigitalSignature;

    try {
      signature = await this.signatureModel.create({
        contractId: contract._id,
        userId: new Types.ObjectId(userId),
        contractCode: contractId,
        provider: SignatureProvider.VNPT_SMARTCA,
        transactionId: signingSession.transactionId,
        credentialId,
        status: 'initiated' as DigitalSignatureStatus,
        documentHash,
        idempotencyKey,
        expiresAt,
        clientIp: options?.clientIp,
        userAgent: options?.userAgent,
        providerMetadata: {
          signingSessionId: signingSession.signingSessionId,
          rawStatus: signingSession.status,
        },
      });
    } catch (error) {
      // Duplicate key → phiên đã tồn tại (race condition)
      if (error.code === 11000) {
        const existing = await this.signatureModel.findOne({ idempotencyKey }).exec();
        if (existing) {
          return {
            signatureId: existing._id.toString(),
            transactionId: existing.transactionId || '',
            signingSessionId: existing.providerMetadata?.signingSessionId || '',
            credentialId: existing.credentialId || '',
            expiresAt: existing.expiresAt!,
          };
        }
      }
      throw error;
    }

    this.logger.log(
      `[initiateSigningRequest] Created signing session: signatureId=${signature._id}, ` +
        `txId=${signingSession.transactionId}, contractId=${contractId}`,
    );

    return {
      signatureId: signature._id.toString(),
      transactionId: signingSession.transactionId,
      signingSessionId: signingSession.signingSessionId,
      credentialId,
      expiresAt,
    };
  }

  // =====================================================================
  //  2. XÁC NHẬN KẾT QUẢ KÝ TỪ CLIENT (SDK SmartCA trả về)
  // =====================================================================

  /**
   * Client gọi sau khi SDK SmartCA trả kết quả ký.
   * Verify + update trạng thái.
   */
  async confirmSigningResult(
    signatureId: string,
    userId: string,
    result: SmartCaSignResult,
  ): Promise<DigitalSignature> {
    const signature = await this.signatureModel
      .findOne({
        _id: signatureId,
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (!signature) {
      throw new NotFoundException('Không tìm thấy phiên ký');
    }

    if (!['initiated', 'pending'].includes(signature.status)) {
      throw new BadRequestException(`Phiên ký đã ở trạng thái: ${signature.status}`);
    }

    return this.processSigningResult(signature, result);
  }

  // =====================================================================
  //  3. VNPT SmartCA WEBHOOK CALLBACK
  // =====================================================================

  /**
   * VNPT SmartCA gọi callback khi user hoàn thành ký.
   * Dùng transactionId để map về bản ghi.
   */
  async handleCallback(transactionId: string, callbackData: any): Promise<void> {
    const signature = await this.signatureModel
      .findOne({
        transactionId,
        status: { $in: ['initiated', 'pending'] },
      })
      .exec();

    if (!signature) {
      this.logger.warn(`[handleCallback] No active signature found for txId=${transactionId}`);
      return;
    }

    const result: SmartCaSignResult = {
      status: this.mapCallbackStatus(callbackData.status),
      signatureValue: callbackData.signatureValue,
      signerCertificate: callbackData.signerCertificate,
      signerInfo: callbackData.signerInfo,
      signedFileUrl: callbackData.signedFileUrl,
      errorCode: callbackData.errorCode,
      errorMessage: callbackData.errorMessage,
    };

    await this.processSigningResult(signature, result);
    this.logger.log(`[handleCallback] Processed callback for txId=${transactionId}, status=${result.status}`);
  }

  // =====================================================================
  //  4. POLLING TRẠNG THÁI
  // =====================================================================

  /**
   * Client polling trạng thái ký (fallback nếu callback không đến)
   */
  async checkSigningStatus(
    signatureId: string,
    userId: string,
  ): Promise<{
    status: DigitalSignatureStatus;
    transactionId?: string;
    completedAt?: Date;
    signedFileUrl?: string;
  }> {
    const signature = await this.signatureModel
      .findOne({
        _id: signatureId,
        userId: new Types.ObjectId(userId),
      })
      .lean()
      .exec();

    if (!signature) {
      throw new NotFoundException('Không tìm thấy phiên ký');
    }

    // Nếu đang pending, thử poll VNPT API
    if (['initiated', 'pending'].includes(signature.status) && signature.transactionId) {
      try {
        const accessToken = await this.getSmartCaAccessToken();
        const vnptStatus = await this.pollSmartCaStatus(accessToken, signature.transactionId);

        if (vnptStatus && vnptStatus.status !== 'TIMEOUT') {
          // Status changed — update
          const sigDoc = await this.signatureModel.findById(signatureId).exec();
          if (sigDoc && ['initiated', 'pending'].includes(sigDoc.status)) {
            await this.processSigningResult(sigDoc, vnptStatus);
            const updated = await this.signatureModel.findById(signatureId).lean().exec();
            return {
              status: updated?.status || signature.status,
              transactionId: updated?.transactionId,
              completedAt: updated?.completedAt,
              signedFileUrl: updated?.signedFileUrl,
            };
          }
        }
      } catch (error) {
        this.logger.warn(`[checkSigningStatus] VNPT polling error: ${error.message}`);
        // Non-fatal — trả lại status hiện tại
      }
    }

    return {
      status: signature.status,
      transactionId: signature.transactionId,
      completedAt: signature.completedAt,
      signedFileUrl: signature.signedFileUrl,
    };
  }

  // =====================================================================
  //  5. RETRY LOGIC — AN TOÀN
  // =====================================================================

  /**
   * Retry phiên ký bị fail.
   * - Chỉ retry nếu chưa vượt maxRetries
   * - Tạo phiên mới, giữ lại bản ghi cũ để audit
   */
  async retrySigningRequest(
    signatureId: string,
    userId: string,
    options?: { clientIp?: string; userAgent?: string },
  ): Promise<{
    signatureId: string;
    transactionId: string;
    signingSessionId: string;
    credentialId: string;
    expiresAt: Date;
  }> {
    const oldSignature = await this.signatureModel
      .findOne({
        _id: signatureId,
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (!oldSignature) {
      throw new NotFoundException('Không tìm thấy phiên ký');
    }

    if (!['failed', 'expired', 'cancelled'].includes(oldSignature.status)) {
      throw new BadRequestException(
        `Chỉ có thể retry phiên ký đã thất bại/hết hạn. Trạng thái hiện tại: ${oldSignature.status}`,
      );
    }

    if (oldSignature.retryCount >= this.maxRetries) {
      throw new BadRequestException(`Đã vượt quá số lần retry tối đa (${this.maxRetries}). Vui lòng liên hệ CSKH.`);
    }

    // Tăng retry count ở bản ghi cũ
    oldSignature.retryCount += 1;
    oldSignature.lastRetryAt = new Date();
    await oldSignature.save();

    // Tạo phiên ký mới (initiate lại)
    return this.initiateSigningRequest(oldSignature.contractCode, userId, options);
  }

  // =====================================================================
  //  6. QUERY HELPERS
  // =====================================================================

  /**
   * Lấy thông tin chữ ký số của hợp đồng
   */
  async getSignatureByContract(contractCode: string, userId: string): Promise<DigitalSignature | null> {
    return this.signatureModel
      .findOne({
        contractCode,
        userId: new Types.ObjectId(userId),
        status: 'signed',
      })
      .lean()
      .exec() as Promise<DigitalSignature | null>;
  }

  /**
   * Lấy lịch sử chữ ký số (bao gồm cả failed) cho audit
   */
  async getSignatureHistory(contractCode: string, userId: string): Promise<DigitalSignature[]> {
    return this.signatureModel
      .find({
        contractCode,
        userId: new Types.ObjectId(userId),
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec() as Promise<DigitalSignature[]>;
  }

  /**
   * Lấy chi tiết 1 bản ghi chữ ký
   */
  async getSignatureById(signatureId: string, userId: string): Promise<DigitalSignature> {
    const sig = await this.signatureModel
      .findOne({
        _id: signatureId,
        userId: new Types.ObjectId(userId),
      })
      .lean()
      .exec();

    if (!sig) {
      throw new NotFoundException('Không tìm thấy chữ ký số');
    }

    return sig as DigitalSignature;
  }

  /**
   * Verify tính toàn vẹn chữ ký (so sánh document hash)
   */
  async verifySignatureIntegrity(signatureId: string): Promise<{
    valid: boolean;
    documentHash: string;
    currentHash: string;
  }> {
    const sig = await this.signatureModel.findById(signatureId).exec();
    if (!sig || sig.status !== 'signed') {
      throw new BadRequestException('Chữ ký không tồn tại hoặc chưa hoàn thành');
    }

    const contract = await this.contractModel.findById(sig.contractId).exec();
    if (!contract) {
      throw new NotFoundException('Hợp đồng không tồn tại');
    }

    const currentHash = await this.generateDocumentHash(contract);
    return {
      valid: currentHash === sig.documentHash,
      documentHash: sig.documentHash,
      currentHash,
    };
  }

  // =====================================================================
  //  PRIVATE METHODS — VNPT SmartCA API CLIENT
  // =====================================================================

  /**
   * Xử lý kết quả ký — logic chung cho cả confirm và callback
   */
  private async processSigningResult(
    signature: DigitalSignature,
    result: SmartCaSignResult,
  ): Promise<DigitalSignature> {
    const now = new Date();

    switch (result.status) {
      case 'SUCCESS':
        signature.status = 'signed';
        signature.completedAt = now;
        signature.signatureValue = result.signatureValue;
        signature.signerCertificate = result.signerCertificate;
        signature.signedFileUrl = result.signedFileUrl;
        if (result.signerInfo) {
          signature.signerInfo = {
            commonName: result.signerInfo.commonName,
            serialNumber: result.signerInfo.serialNumber,
            organization: result.signerInfo.organization,
            validFrom: result.signerInfo.validFrom ? new Date(result.signerInfo.validFrom) : undefined,
            validTo: result.signerInfo.validTo ? new Date(result.signerInfo.validTo) : undefined,
          };
        }
        break;

      case 'REJECTED':
        signature.status = 'rejected';
        signature.completedAt = now;
        signature.lastError = 'User rejected signing';
        break;

      case 'TIMEOUT':
        signature.status = 'expired';
        signature.completedAt = now;
        signature.lastError = 'Signing session timed out';
        break;

      case 'FAILED':
      default:
        signature.status = 'failed';
        signature.completedAt = now;
        signature.lastError = result.errorMessage || result.errorCode || 'Unknown error';
        break;
    }

    signature.providerMetadata = {
      ...signature.providerMetadata,
      rawResult: result,
      processedAt: now.toISOString(),
    };

    await signature.save();

    // Nếu ký thành công → update hợp đồng
    if (signature.status === 'signed') {
      await this.onSigningSuccess(signature);
    }

    // Nếu thất bại → thông báo user
    if (['rejected', 'failed'].includes(signature.status)) {
      await this.notifySigningFailed(signature);
    }

    return signature;
  }

  /**
   * Xử lý sau khi ký thành công — update hợp đồng + thông báo
   */
  private async onSigningSuccess(signature: DigitalSignature): Promise<void> {
    const contract = await this.contractModel.findById(signature.contractId).exec();
    if (!contract) {
      this.logger.error(`[onSigningSuccess] Contract not found: ${signature.contractId}`);
      return;
    }

    // Chỉ update nếu hợp đồng đang pending_signature
    if (contract.status !== 'pending_signature') {
      this.logger.warn(`[onSigningSuccess] Contract ${contract.contractId} already in status: ${contract.status}`);
      return;
    }

    contract.status = 'signed';
    contract.signedAt = signature.completedAt || new Date();
    contract.signatureData = signature.signatureValue || `SMARTCA:${signature.transactionId}`;
    await contract.save();

    this.logger.log(`[onSigningSuccess] Contract ${contract.contractId} signed via SmartCA`);

    // Thông báo
    await this.notificationModel.create({
      userId: signature.userId,
      title: 'Ký hợp đồng thành công!',
      message: `Hợp đồng ${contract.contractId} đã được ký số thành công qua VNPT SmartCA. Khoản vay sẽ được giải ngân trong thời gian sớm nhất.`,
      type: 'contract_signed',
      data: {
        contractId: contract.contractId,
        contractObjectId: contract._id?.toString(),
        signatureId: signature._id?.toString(),
        provider: 'vnpt_smartca',
      },
    });
  }

  /**
   * Thông báo khi ký thất bại
   */
  private async notifySigningFailed(signature: DigitalSignature): Promise<void> {
    const statusMessages: Record<string, string> = {
      rejected: 'Bạn đã từ chối ký hợp đồng. Nếu cần ký lại, vui lòng mở lại hợp đồng.',
      failed: `Ký hợp đồng thất bại: ${signature.lastError || 'Lỗi không xác định'}. Vui lòng thử lại.`,
    };

    await this.notificationModel.create({
      userId: signature.userId,
      title: 'Ký hợp đồng không thành công',
      message: statusMessages[signature.status] || 'Đã xảy ra lỗi khi ký hợp đồng.',
      type: 'signing_failed',
      data: {
        contractCode: signature.contractCode,
        signatureId: signature._id?.toString(),
        status: signature.status,
        canRetry: signature.retryCount < this.maxRetries,
      },
    });
  }

  /**
   * Hash nội dung hợp đồng (SHA-256) để đảm bảo tính toàn vẹn
   */
  private async generateDocumentHash(contract: LoanContract): Promise<string> {
    // Hash dựa trên các fields quan trọng, không phải HTML (vì HTML có thể thay đổi format)
    const payload = JSON.stringify({
      contractId: contract.contractId,
      userId: contract.userId?.toString(),
      fineractLoanId: contract.fineractLoanId,
      principalAmount: contract.principalAmount,
      interestRate: contract.interestRate,
      tenure: contract.tenure,
      totalPayable: contract.totalPayable,
      monthlyPayment: contract.monthlyPayment,
      borrowerInfo: contract.borrowerInfo,
      repaymentSchedule: contract.repaymentSchedule,
      feeStructure: contract.feeStructure,
    });

    return createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  // ===================== VNPT SmartCA HTTP Client =====================

  /**
   * Lấy access token từ VNPT SmartCA (OAuth2 client credentials)
   * Cache token cho đến khi hết hạn
   */
  private async getSmartCaAccessToken(): Promise<string> {
    // Check cache
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 30_000) {
      return this.cachedToken.token;
    }

    const url = `${this.apiUrl}/oauth2/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const response = await this.httpPost<SmartCaAuthResponse>(url, body.toString(), {
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    this.cachedToken = {
      token: response.access_token,
      expiresAt: Date.now() + (response.expires_in || 3600) * 1000,
    };

    return response.access_token;
  }

  /**
   * Lấy credential (chứng thư số) của user
   * Trong production, userId map với tài khoản SmartCA (qua số CCCD/phone)
   */
  private async getSmartCaCredential(accessToken: string, userId: string): Promise<SmartCaCredential> {
    const url = `${this.apiUrl}/v2/credentials/list`;

    const response = await this.httpPost<{ credentials: SmartCaCredential[] }>(
      url,
      JSON.stringify({ userId, maxResults: 1 }),
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    );

    if (!response.credentials?.length) {
      throw new BadRequestException(
        'Bạn chưa có chứng thư số VNPT SmartCA. Vui lòng đăng ký tại ứng dụng VNPT SmartCA.',
      );
    }

    return response.credentials[0];
  }

  /**
   * Tạo phiên ký trên VNPT SmartCA
   */
  private async createSmartCaSigningSession(
    accessToken: string,
    credentialId: string,
    documentHash: string,
    contractCode: string,
  ): Promise<SmartCaSigningSession> {
    const url = `${this.apiUrl}/v2/signatures/signHash`;

    const response = await this.httpPost<SmartCaSigningSession>(
      url,
      JSON.stringify({
        credentialId,
        hash: documentHash,
        hashAlgo: 'SHA-256',
        signAlgo: 'RSA',
        callbackUrl: this.callbackUrl,
        clientData: contractCode,
        operationMode: 'A', // Asynchronous — user xác nhận trên SmartCA app
      }),
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    );

    return response;
  }

  /**
   * Poll trạng thái ký từ VNPT SmartCA
   */
  private async pollSmartCaStatus(accessToken: string, transactionId: string): Promise<SmartCaSignResult | null> {
    const url = `${this.apiUrl}/v2/signatures/status`;

    try {
      const response = await this.httpPost<SmartCaSignResult>(url, JSON.stringify({ transactionId }), {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      });
      return response;
    } catch {
      return null;
    }
  }

  /**
   * Map VNPT callback status → internal SmartCaSignResult status
   */
  private mapCallbackStatus(vnptStatus: string): SmartCaSignResult['status'] {
    const map: Record<string, SmartCaSignResult['status']> = {
      SUCCESS: 'SUCCESS',
      COMPLETED: 'SUCCESS',
      SIGNED: 'SUCCESS',
      FAILED: 'FAILED',
      ERROR: 'FAILED',
      REJECTED: 'REJECTED',
      DECLINED: 'REJECTED',
      TIMEOUT: 'TIMEOUT',
      EXPIRED: 'TIMEOUT',
    };
    return map[vnptStatus?.toUpperCase()] || 'FAILED';
  }

  /**
   * Generic HTTP POST helper with timeout & error handling
   */
  private async httpPost<T>(url: string, body: string, headers: Record<string, string>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000); // 15s timeout

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown');
        throw new Error(`VNPT SmartCA API error: ${response.status} ${response.statusText} — ${errorText}`);
      }

      return (await response.json()) as T;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('VNPT SmartCA API timeout (15s)');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
