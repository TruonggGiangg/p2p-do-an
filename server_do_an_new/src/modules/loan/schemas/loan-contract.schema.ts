import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Trạng thái hợp đồng vay
 * - pending_signature: Chờ người vay ký xác nhận
 * - signed: Đã ký xác nhận
 * - active: Đang hoạt động (sau khi giải ngân)
 * - completed: Đã hoàn thành
 * - cancelled: Đã hủy
 */
export type LoanContractStatus = 'pending_signature' | 'signed' | 'active' | 'completed' | 'cancelled';

export interface BorrowerInfo {
  fullName: string;
  idNumber: string; // CCCD / CMND
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  issueDate?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface RepaymentScheduleItem {
  period: number;
  dueDate: string;
  principal: number;
  interest: number;
  total: number;
  remainingAfter: number;
}

export interface FeeStructureItem {
  name: string;
  amount: number;
  type: 'fixed' | 'percentage';
  percentage?: number;
  chargeTime: string; // e.g. 'disbursement', 'monthly'
}

export interface DelinquencyPolicySnapshotItem {
  debt_group: number;
  debt_group_name: string;
  min_days: number;
  max_days: number | null;
  send_email: boolean;
  send_sms: boolean;
  send_notification: boolean;
  apply_penalty: boolean;
  block_new_loan: boolean;
  collection_stage: 'NONE' | 'REMINDER' | 'WARNING' | 'COLLECTION' | 'LEGAL' | 'WRITE_OFF';
  legal_escalation: boolean;
  is_active: boolean;
  description?: string;
}

@Schema({ timestamps: true, collection: 'loan_contracts' })
export class LoanContract extends Document {
  /** Mã hợp đồng duy nhất: P2P-LC-{timestamp}-{random} */
  @Prop({ required: true, unique: true, index: true })
  contractId: string;

  /** Reference đến LoanApplication */
  @Prop({ type: Types.ObjectId, ref: 'LoanApplication', required: true, index: true })
  loanId: Types.ObjectId;

  /** userId của người vay */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  /** Fineract loan ID */
  @Prop({ required: false })
  fineractLoanId?: number;

  /** Thông tin người vay */
  @Prop({ type: Object, required: true })
  borrowerInfo: BorrowerInfo;

  /** Số tiền gốc vay */
  @Prop({ required: true })
  principalAmount: number;

  /** Lãi suất (%/tháng) */
  @Prop({ required: true })
  interestRate: number;

  /** Kỳ hạn vay (số tháng) */
  @Prop({ required: true })
  tenure: number;

  /** Lịch trả nợ chi tiết */
  @Prop({ type: [Object], default: [] })
  repaymentSchedule: RepaymentScheduleItem[];

  /** Tổng số tiền phải trả (gốc + lãi + phí) */
  @Prop({ required: true })
  totalPayable: number;

  /** Số tiền trả hàng tháng */
  @Prop({ required: true })
  monthlyPayment: number;

  /** Cấu trúc phí */
  @Prop({ type: [Object], default: [] })
  feeStructure: FeeStructureItem[];

  /** Snapshot chính sách nợ xấu tại thời điểm tạo hợp đồng (không bị ảnh hưởng bởi thay đổi policy sau này) */
  @Prop({ type: [Object], default: [] })
  delinquencyPolicySnapshot: DelinquencyPolicySnapshotItem[];

  /** Tên sản phẩm vay */
  @Prop({ required: false })
  productName?: string;

  /** Trạng thái hợp đồng */
  @Prop({ type: String, default: 'pending_signature' })
  status: LoanContractStatus;

  /** Thời điểm người vay ký hợp đồng */
  @Prop({ required: false })
  signedAt?: Date;

  /** Chữ ký số (base64 image hoặc signature hash) – để trống chờ ký */
  @Prop({ required: false })
  signatureData?: string;

  /**
   * true khi hợp đồng đã được ký và xác minh qua SmartCA (không phải ký nội bộ/test)
   */
  @Prop({ required: false, default: false })
  smartCASignatureVerified?: boolean;

  /** Nhà cung cấp chữ ký gần nhất: vnpt_smartca | manual */
  @Prop({ required: false })
  signatureProvider?: string;

  /** Thời điểm chữ ký SmartCA được xác minh */
  @Prop({ required: false })
  signatureVerifiedAt?: Date;

  /** Thời điểm phê duyệt pháp lý (admin approve) */
  @Prop({ required: false })
  legalApprovalAt?: Date;

  /** Ngày giải ngân dự kiến */
  @Prop({ required: false })
  disbursementDate?: string;

  /** Ngày bắt đầu trả nợ */
  @Prop({ required: false })
  firstRepaymentDate?: string;
}

export const LoanContractSchema = SchemaFactory.createForClass(LoanContract);
LoanContractSchema.index({ userId: 1, status: 1 });
LoanContractSchema.index({ contractId: 1 });
LoanContractSchema.index({ createdAt: -1 });
