import { BadRequestException, Inject, Injectable, Logger, NotFoundException, RequestTimeoutException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';
import smartcaConfig from 'src/config/smartca.config';

/**
 * SmartCAService - VNPT SmartCA Digital Signature Integration
 */

function utcTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export interface CertificateInfo {
  serialNumber: string;
  status: string;
  statusCode: string;
  subject?: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  raw: any;
}

export interface SignResult {
  signatures?: Array<{ signatureValue: string; docId: string }>;
  transactionId?: string;
  tranCode?: string;
  sad?: string;
  rawResponse?: any;
}

export interface SigningSession {
  transactionId: string;
  docId: string;
  documentHash: string;
  status: 'initiated' | 'pending' | 'signed' | 'failed' | 'expired' | 'rejected';
  serialNumber?: string;
  tranCode?: string;
  sad?: string;
  createdAt: Date;
  expiresAt: Date;
}

@Injectable()
export class SmartCAService {
  private readonly logger = new Logger(SmartCAService.name);

  constructor(
    @Inject(smartcaConfig.KEY)
    private readonly config: ConfigType<typeof smartcaConfig>,
  ) {
    this.logger.log(`SmartCA environment: ${this.config.environment} | API: ${this.config.apiUrl}`);
  }

  // ================================================================
  // 1. Get certificates
  // ================================================================
  async getCertificates(userId?: string): Promise<{
    certificates: CertificateInfo[];
    selectedSerial?: string;
    rawResponse?: any;
  }> {
    const user_id = userId || this.config.defaultUserId;
    if (!user_id) {
      throw new BadRequestException('Thiếu user_id (số CCCD)');
    }

    const url = `${this.config.apiUrl}${this.config.certPath}`;
    const payload = {
      sp_id: this.config.spId,
      sp_password: this.config.spPassword,
      user_id,
      transaction_id: `SP_CA_${Date.now()}`,
    };

    this.logger.log(`[getCertificates] POST ${url} | user_id=${user_id}`);

    const res = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
      validateStatus: () => true,
    });

    const body = res.data ?? {};
    const list = body?.data?.user_certificates ?? [];

    if (!Array.isArray(list) || list.length === 0) {
      this.logger.warn(`[getCertificates] No certificates. Response: ${JSON.stringify(body).slice(0, 300)}`);
      throw new NotFoundException('Không tìm thấy chứng thư số nào của người dùng này');
    }

    const certificates: CertificateInfo[] = list.map((cert: any) => ({
      serialNumber: cert.serial_number ?? '',
      status: cert.cert_status ?? '',
      statusCode: cert.cert_status_code ?? '',
      subject: cert.subject ?? '',
      issuer: cert.issuer ?? '',
      validFrom: cert.valid_from ?? '',
      validTo: cert.valid_to ?? '',
      raw: cert,
    }));

    const active = certificates.find(
      c =>
        c.statusCode?.toUpperCase() === 'VALID' ||
        c.status?.toUpperCase().includes('ACTIVE') ||
        c.status?.includes('hoat dong'),
    );
    const selectedSerial = active?.serialNumber || certificates[certificates.length - 1]?.serialNumber;

    this.logger.log(`[getCertificates] Found ${certificates.length} certs, selected: ${selectedSerial}`);
    return { certificates, selectedSerial, rawResponse: body };
  }

  // ================================================================
  // 2. Request sign v1 (user confirms on SmartCA app)
  // ================================================================
  async requestSignV1(options: {
    userId?: string;
    serialNumber: string;
    documentHash: string;
    docId?: string;
    transactionId?: string;
  }): Promise<SignResult> {
    const user_id = options.userId || this.config.defaultUserId;
    const transaction_id = options.transactionId || `CA_${Date.now()}`;
    const doc_id = options.docId || `doc-${Date.now()}`;

    const url = `${this.config.apiUrl}${this.config.signV1Path}`;
    const payload = {
      sp_id: this.config.spId,
      sp_password: this.config.spPassword,
      user_id,
      transaction_id,
      transaction_desc: 'Ky hop dong vay P2P',
      time_stamp: utcTimestamp(),
      serial_number: options.serialNumber,
      sign_files: [
        {
          doc_id,
          file_type: 'pdf',
          sign_type: 'hash',
          data_to_be_signed: options.documentHash,
        },
      ],
    };

    this.logger.log(`[requestSignV1] POST ${url} | txn=${transaction_id}`);

    const res = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
      validateStatus: () => true,
    });

    const body = res.data ?? {};
    this.logger.log(`[requestSignV1] status=${res.status}, body=${JSON.stringify(body).slice(0, 500)}`);

    const isSuccess = res.status === 200 && (body.status_code === 200 || body.status_code === 0);
    if (!isSuccess) {
      throw new BadRequestException(body.message || 'Không thể gửi yêu cầu ký v1');
    }

    const data = body.data ?? {};
    return {
      transactionId: data.transaction_id || transaction_id,
      tranCode: data.tran_code,
      sad: data.sad,
      rawResponse: body,
    };
  }

  // ================================================================
  // 3. Request sign v2 (SmartCA integrated - password + OTP)
  // ================================================================
  async requestSignV2(options: {
    userId?: string;
    serialNumber: string;
    password: string;
    otp: string;
    documentHash: string;
    docId?: string;
    transactionId?: string;
  }): Promise<SignResult> {
    const user_id = options.userId || this.config.defaultUserId;
    const transaction_id = options.transactionId || `CA_${Date.now()}`;
    const doc_id = options.docId || `doc-${Date.now()}`;

    const url = `${this.config.apiUrl}${this.config.signV2Path}`;
    const payload = {
      sp_id: this.config.spId,
      sp_password: this.config.spPassword,
      user_id,
      password: options.password,
      otp: options.otp,
      transaction_id,
      serial_number: options.serialNumber,
      sign_files: [
        {
          doc_id,
          file_type: 'pdf',
          sign_type: 'hash',
          data_to_be_signed: options.documentHash,
        },
      ],
    };

    this.logger.log(`[requestSignV2] POST ${url} | txn=${transaction_id}`);

    const res = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
      validateStatus: () => true,
    });

    const body = res.data ?? {};
    this.logger.log(`[requestSignV2] status=${res.status}, body=${JSON.stringify(body).slice(0, 500)}`);

    const isSuccess = res.status === 200 && (body.status_code === 200 || body.status_code === 0);
    if (!isSuccess) {
      throw new BadRequestException(body.message || 'Yêu cầu ký v2 bị từ chối do API lỗi');
    }

    const data = body.data ?? {};
    const sigs = (data.signatures ?? []).map((s: any) => ({
      signatureValue: s.signature_value,
      docId: s.doc_id || doc_id,
    }));

    return {
      transactionId: data.transaction_id || transaction_id,
      tranCode: data.tran_code,
      sad: data.sad,
      signatures: sigs.length ? sigs : undefined,
      rawResponse: body,
    };
  }

  // ================================================================
  // 4. Confirm sign v2
  // ================================================================
  async confirmSignV2(options: {
    userId?: string;
    password: string;
    transactionId: string;
    sad: string;
  }): Promise<SignResult> {
    const user_id = options.userId || this.config.defaultUserId;
    const url = `${this.config.apiUrl}${this.config.confirmV2Path}`;
    const payload = {
      sp_id: this.config.spId,
      sp_password: this.config.spPassword,
      user_id,
      password: options.password,
      transaction_id: options.transactionId,
      sad: options.sad,
    };

    this.logger.log(`[confirmSignV2] POST ${url} | txn=${options.transactionId}`);

    const res = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
      validateStatus: () => true,
    });

    const body = res.data ?? {};
    this.logger.log(`[confirmSignV2] status=${res.status}, body=${JSON.stringify(body).slice(0, 500)}`);

    const isSuccess = res.status === 200 && (body.status_code === 200 || body.status_code === 0);
    if (!isSuccess) {
      throw new BadRequestException(body.message || 'Xác nhận ký số v2 thất bại.');
    }

    const data = body.data ?? {};
    const sigs = (data.signatures ?? []).map((s: any) => ({
      signatureValue: s.signature_value,
      docId: s.doc_id,
    }));

    return {
      signatures: sigs.length ? sigs : undefined,
      transactionId: options.transactionId,
      rawResponse: body,
    };
  }

  // ================================================================
  // 5. Check sign status
  // ================================================================
  async checkSignStatus(transactionId: string): Promise<{
    status: 'pending' | 'signed' | 'failed' | 'expired' | 'rejected';
    signatures?: Array<{ signatureValue: string; docId: string }>;
    rawResponse?: any;
  }> {
    const urlPath = this.config.statusPathTmpl.replace('{transactionId}', encodeURIComponent(transactionId));
    const url = `${this.config.apiUrl}${urlPath}`;

    this.logger.log(`[checkSignStatus] POST ${url}`);

    const statusPayload = { sp_id: this.config.spId, sp_password: this.config.spPassword };
    const res = await axios.post(url, statusPayload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
      validateStatus: () => true,
    });

    const body = res.data ?? {};
    const data = body.data ?? {};
    const message = String(body.message ?? '').toLowerCase();

    const sigArray: Array<{ signatureValue: string; docId: string }> = [];

    if (data.signature_value) {
      sigArray.push({ signatureValue: data.signature_value, docId: data.doc_id || '' });
    }
    if (Array.isArray(data.signatures)) {
      for (const s of data.signatures) {
        if (s.signature_value) {
          sigArray.push({ signatureValue: s.signature_value, docId: s.doc_id || '' });
        }
      }
    }

    let status: 'pending' | 'signed' | 'failed' | 'expired' | 'rejected' = 'pending';

    if ((body.status_code === 200 || body.status_code === 0) && sigArray.length > 0) {
      status = 'signed';
    } else if (message.includes('expire')) {
      status = 'expired';
    } else if (message.includes('deny') || message.includes('reject')) {
      status = 'rejected';
    } else if (res.status >= 400 && res.status !== 409) {
      status = 'failed';
    }

    return { status, signatures: sigArray.length > 0 ? sigArray : undefined, rawResponse: body };
  }

  // ================================================================
  // 6. Poll for v1 flow (wait for user confirmation)
  // ================================================================
  async pollSignResult(transactionId: string, intervalMs?: number, timeoutMs?: number): Promise<SignResult> {
    const interval = intervalMs ?? this.config.pollingIntervalMs;
    const timeout = timeoutMs ?? this.config.signingTimeoutMs;
    const startedAt = Date.now();

    this.logger.log(`[pollSignResult] Polling txn=${transactionId}, timeout=${timeout}ms`);

    while (true) {
      const result = await this.checkSignStatus(transactionId);

      if (result.status === 'signed' && result.signatures?.length) {
        return { signatures: result.signatures, transactionId, rawResponse: result.rawResponse };
      }
      if (result.status === 'expired') {
        throw new BadRequestException('Phiên ký đã hết hạn');
      }
      if (result.status === 'rejected') {
        throw new BadRequestException('Người dùng đã từ chối ký');
      }
      if (result.status === 'failed') {
        throw new BadRequestException('Ký số thất bại trên server VNPT');
      }
      if (Date.now() - startedAt > timeout) {
        throw new RequestTimeoutException('Hết thời gian chờ ký');
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  // ================================================================
  // 7. Hash document content (SHA-256 hex — required by SmartCA API)
  // ================================================================
  hashDocument(data: Buffer | string): string {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // ================================================================
  // 8. High-level: Initiate v1 signing session
  // ================================================================
  async initiateSigningSession(options: {
    documentData: string;
    userId?: string;
    contractId?: string;
  }): Promise<SigningSession> {
    const certResult = await this.getCertificates(options.userId);
    if (!certResult.selectedSerial) {
      throw new BadRequestException('Khong tim thay chung thu so. Vui long dang ky chu ky so VNPT SmartCA.');
    }

    const documentHash = this.hashDocument(options.documentData);
    const transactionId = `CA_${Date.now()}`;
    const docId = options.contractId ? `doc-${options.contractId}` : `doc-${Date.now()}`;

    const signResult = await this.requestSignV1({
      userId: options.userId,
      serialNumber: certResult.selectedSerial,
      documentHash,
      docId,
      transactionId,
    });

    return {
      transactionId: signResult.transactionId || transactionId,
      docId,
      documentHash,
      status: 'initiated',
      serialNumber: certResult.selectedSerial,
      tranCode: signResult.tranCode,
      sad: signResult.sad,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.signingTimeoutMs),
    };
  }

  // ================================================================
  // 9. High-level: Complete v2 signing (password + OTP)
  // ================================================================
  async signDocumentV2(options: {
    documentData: string;
    userId?: string;
    password: string;
    otp: string;
    contractId?: string;
  }): Promise<SignResult> {
    const certResult = await this.getCertificates(options.userId);
    if (!certResult.selectedSerial) {
      throw new BadRequestException('Không tìm thấy chứng thư số.');
    }

    const documentHash = this.hashDocument(options.documentData);
    const transactionId = `CA_${Date.now()}`;
    const docId = options.contractId ? `doc-${options.contractId}` : `doc-${Date.now()}`;

    const signResult = await this.requestSignV2({
      userId: options.userId,
      serialNumber: certResult.selectedSerial,
      password: options.password,
      otp: options.otp,
      documentHash,
      docId,
      transactionId,
    });

    if (signResult.signatures?.length) {
      return signResult;
    }

    if (signResult.sad) {
      return this.confirmSignV2({
        userId: options.userId,
        password: options.password,
        transactionId: signResult.transactionId || transactionId,
        sad: signResult.sad,
      });
    }

    throw new BadRequestException('Ký số không thành công. Thiếu sad hoặc signature.');
  }
}
