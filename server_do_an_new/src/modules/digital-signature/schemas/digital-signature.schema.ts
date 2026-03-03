import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Trạng thái giao dịch ký số
 * - initiated: Server đã tạo yêu cầu ký, chờ client mở SDK SmartCA
 * - pending: SDK đã mở, user đang xác nhận trên app VNPT SmartCA
 * - signed: Ký thành công, đã nhận chữ ký
 * - rejected: User từ chối ký trên app SmartCA
 * - expired: Hết thời gian chờ ký (timeout)
 * - failed: Lỗi hệ thống (VNPT API lỗi, network, etc.)
 * - cancelled: User hoặc hệ thống hủy trước khi ký
 */
export type DigitalSignatureStatus =
  | 'initiated'
  | 'pending'
  | 'signed'
  | 'rejected'
  | 'expired'
  | 'failed'
  | 'cancelled';

/**
 * Provider chữ ký số
 * Hiện tại hỗ trợ VNPT SmartCA, có thể mở rộng FPT.CA, VIETTEL-CA...
 */
export enum SignatureProvider {
  VNPT_SMARTCA = 'vnpt_smartca',
  // FPT_CA = 'fpt_ca',
  // VIETTEL_CA = 'viettel_ca',
}

@Schema({ timestamps: true, collection: 'digital_signatures' })
export class DigitalSignature extends Document {
  /** Reference đến LoanContract */
  @Prop({ type: Types.ObjectId, ref: 'LoanContract', required: true, index: true })
  contractId: Types.ObjectId;

  /** Reference đến User */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  /** Mã hợp đồng hiển thị (P2P-LC-xxx) để tra cứu nhanh */
  @Prop({ required: true, index: true })
  contractCode: string;

  /** Nhà cung cấp chữ ký số */
  @Prop({ type: String, enum: SignatureProvider, required: true, default: SignatureProvider.VNPT_SMARTCA })
  provider: SignatureProvider;

  /**
   * Transaction ID từ VNPT SmartCA
   * Dùng để polling trạng thái, retry, và đối soát
   */
  @Prop({ required: false, index: true })
  transactionId?: string;

  /**
   * Credential ID (VNPT SmartCA) — mã chứng thư số của user
   * Lấy từ bước getCredential sau khi user đăng nhập SmartCA
   */
  @Prop({ required: false })
  credentialId?: string;

  /** Trạng thái giao dịch ký */
  @Prop({
    type: String,
    enum: ['initiated', 'pending', 'signed', 'rejected', 'expired', 'failed', 'cancelled'],
    default: 'initiated',
  })
  status: DigitalSignatureStatus;

  /**
   * SHA-256 hash của file PDF / HTML hợp đồng trước khi ký
   * Dùng để xác minh tính toàn vẹn (integrity verification)
   */
  @Prop({ required: true })
  documentHash: string;

  /** URL / path file đã ký (chứa chữ ký nhúng) — set sau khi ký xong */
  @Prop({ required: false })
  signedFileUrl?: string;

  /** Data chữ ký raw (base64 PKCS#7 / CMS signature) */
  @Prop({ required: false })
  signatureValue?: string;

  /** Certificate chain (PEM) của người ký — lưu để audit */
  @Prop({ required: false })
  signerCertificate?: string;

  /** Thông tin chủ thể chứng thư số (Subject DN) */
  @Prop({ type: Object, required: false })
  signerInfo?: {
    commonName?: string; // Họ tên
    serialNumber?: string; // Số CCCD/CMND
    organization?: string; // Tổ chức cấp CA
    validFrom?: Date;
    validTo?: Date;
  };

  /**
   * Idempotency key — chống duplicate request khi retry
   * Format: `sign:{contractCode}:{timestamp_bucket}`
   */
  @Prop({ required: true, unique: true })
  idempotencyKey: string;

  /** Số lần retry đã thực hiện */
  @Prop({ default: 0 })
  retryCount: number;

  /** Lần retry cuối cùng */
  @Prop({ required: false })
  lastRetryAt?: Date;

  /** Lỗi cuối cùng (nếu failed) */
  @Prop({ required: false })
  lastError?: string;

  /** Thời điểm ký thành công */
  @Prop({ required: false })
  completedAt?: Date;

  /** Thời điểm hết hạn giao dịch ký (default 15 phút) */
  @Prop({ required: false })
  expiresAt?: Date;

  /** IP address của client khi khởi tạo ký */
  @Prop({ required: false })
  clientIp?: string;

  /** User-Agent của client */
  @Prop({ required: false })
  userAgent?: string;

  /** Metadata bổ sung từ VNPT SmartCA response */
  @Prop({ type: Object, default: {} })
  providerMetadata: Record<string, any>;
}

export const DigitalSignatureSchema = SchemaFactory.createForClass(DigitalSignature);

// Compound indexes for common queries
DigitalSignatureSchema.index({ contractId: 1, status: 1 });
DigitalSignatureSchema.index({ userId: 1, createdAt: -1 });
DigitalSignatureSchema.index({ transactionId: 1 }, { sparse: true });
DigitalSignatureSchema.index({ idempotencyKey: 1 }, { unique: true });
DigitalSignatureSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { status: { $in: ['initiated', 'pending'] } } },
);
