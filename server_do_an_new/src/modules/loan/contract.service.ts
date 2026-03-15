import { Injectable, Logger, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LoanContract,
  BorrowerInfo,
  RepaymentScheduleItem,
  FeeStructureItem,
  DelinquencyPolicySnapshotItem,
} from './schemas/loan-contract.schema';
import { LoanApplication } from './schemas/loan-application.schema';
import { Notification } from './schemas/notification.schema';
import { User } from '../users/schemas/user.schema';
import { DelinquencyPolicy } from '../delinquency/entities/delinquency-policy.schema';
import { FineractLoanService } from '../fineract/services/fineract-loan.service';
import { generateLoanContractHTML } from './templates/loan-contract.template';
import { SmartCAService } from '../digital-signature/smartca.service';

@Injectable()
export class ContractService {
  private readonly logger = new Logger(ContractService.name);

  constructor(
    @InjectModel(LoanContract.name) private contractModel: Model<LoanContract>,
    @InjectModel(LoanApplication.name) private loanApplicationModel: Model<LoanApplication>,
    @InjectModel(Notification.name) private notificationModel: Model<Notification>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(DelinquencyPolicy.name) private delinquencyPolicyModel: Model<DelinquencyPolicy>,
    private readonly fineractLoanService: FineractLoanService,
    @Optional() private readonly smartCAService: SmartCAService,
  ) {}

  /**
   * Tạo mã hợp đồng duy nhất
   */
  private generateContractId(): string {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `P2P-LC-${ts}-${rand}`;
  }

  private async buildDelinquencyPolicySnapshot(): Promise<DelinquencyPolicySnapshotItem[]> {
    const policies = await this.delinquencyPolicyModel.find({ is_active: true }).sort({ debt_group: 1 }).lean().exec();
    const ranges = await this.fineractLoanService.getDelinquencyRanges().catch(() => []);
    const rangeMap = new Map<number, { min_days: number; max_days: number }>();
    for (const range of ranges || []) {
      const id = Number(range?.id);
      if (!Number.isFinite(id)) continue;
      rangeMap.set(id, {
        min_days: Number(range?.minimumAgeDays ?? 0),
        max_days: Number(range?.maximumAgeDays ?? 99999),
      });
    }

    return (policies as any[]).map(policy => ({
      ...(rangeMap.get(Number(policy.debt_group)) ?? { min_days: 0, max_days: 99999 }),
      debt_group: Number(policy.debt_group ?? 0),
      debt_group_name: String(policy.debt_group_name ?? ''),
      send_email: !!policy.send_email,
      send_sms: !!policy.send_sms,
      send_notification: !!policy.send_notification,
      apply_penalty: !!policy.apply_penalty,
      block_new_loan: !!policy.block_new_loan,
      collection_stage: String(policy.collection_stage ?? 'NONE') as DelinquencyPolicySnapshotItem['collection_stage'],
      legal_escalation: !!policy.legal_escalation,
      is_active: !!policy.is_active,
      description: policy.description ?? undefined,
    }));
  }

  /**
   * Tạo hợp đồng khi admin phê duyệt khoản vay
   * Được gọi từ AdminService.approveLoan()
   */
  async createContractOnApproval(fineractLoanId: number, charges?: any[]): Promise<LoanContract> {
    this.logger.log(`[createContractOnApproval] fineractLoanId=${fineractLoanId}`);

    // 1. Tìm loan application
    const app = await this.loanApplicationModel.findOne({ fineractLoanId }).lean();
    if (!app) {
      throw new BadRequestException(`Khoản vay Fineract #${fineractLoanId} không tồn tại`);
    }

    // 2. Kiểm tra xem đã có contract chưa
    const existing = await this.contractModel.findOne({ loanId: app._id }).lean();
    if (existing) {
      this.logger.warn(`[createContractOnApproval] Contract already exists: ${existing.contractId}`);
      return existing as LoanContract;
    }

    // 3. Lấy thông tin người vay
    const user = await this.userModel.findById(app.userId).lean();
    if (!user) {
      throw new BadRequestException(`Người vay không tồn tại: ${app.userId}`);
    }

    const kycData = user.kycData || {};
    const borrowerInfo: BorrowerInfo = {
      fullName: [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' ') || user.username,
      idNumber: kycData.idNumber || kycData.cccd || '',
      dateOfBirth: kycData.dateOfBirth || kycData.dob || '',
      address: kycData.address || kycData.permanentAddress || '',
      phone: user.username || '',
      email: user.email || '',
    };

    // 4. Chuyển đổi schedule preview sang RepaymentScheduleItem
    const repaymentSchedule: RepaymentScheduleItem[] = (app.schedulePreview || []).map((item, idx) => ({
      period: item.period || idx + 1,
      dueDate: item.dueDate || '',
      principal: item.principal || 0,
      interest: item.interest || 0,
      total: item.total || 0,
      remainingAfter: item.remainingAfter || 0,
    }));

    // 5. Chuyển đổi phí (nếu có)
    const feeStructure: FeeStructureItem[] = (charges || []).map((c: any) => ({
      name: c.name || 'Phí',
      amount: c.amount || 0,
      type: /percent/i.test(c.chargeCalculationType) ? ('percentage' as const) : ('fixed' as const),
      percentage: c.percentage || c.amount || 0,
      chargeTime: c.chargeTimeType || 'disbursement',
    }));

    // 5.1 Snapshot chính sách nợ xấu tại thời điểm phát hành hợp đồng
    const delinquencyPolicySnapshot = await this.buildDelinquencyPolicySnapshot();

    // 6. Tạo hợp đồng
    const contract = await this.contractModel.create({
      contractId: this.generateContractId(),
      loanId: app._id,
      userId: app.userId,
      fineractLoanId,
      borrowerInfo,
      principalAmount: app.capital,
      interestRate: app.monthlyRatePercent,
      tenure: app.periodMonth,
      repaymentSchedule,
      totalPayable: app.entirelyPay || 0,
      monthlyPayment: app.monthlyPay || 0,
      feeStructure,
      delinquencyPolicySnapshot,
      productName: app.willing || 'Vay tiêu dùng',
      status: 'pending_signature',
      legalApprovalAt: new Date(),
      disbursementDate: app.disbursementDate,
    });

    this.logger.log(`[createContractOnApproval] Created contract: ${contract.contractId}`);

    // 7. Gửi thông báo cho người vay
    await this.notificationModel.create({
      userId: app.userId,
      title: 'Khoản vay đã được phê duyệt!',
      message: `Khoản vay ${formatMoney(app.capital)} đã được phê duyệt. Vui lòng ký xác nhận hợp đồng để tiến hành giải ngân.`,
      type: 'contract_ready',
      data: {
        contractId: contract.contractId,
        contractObjectId: contract._id?.toString(),
        loanId: app._id?.toString(),
        fineractLoanId,
        amount: app.capital,
      },
    });

    return contract;
  }

  /**
   * Lấy danh sách hợp đồng của user
   */
  async getUserContracts(userId: string): Promise<LoanContract[]> {
    return this.contractModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec() as Promise<LoanContract[]>;
  }

  /**
   * Lấy chi tiết hợp đồng theo ID
   */
  async getContractById(contractId: string, userId: string): Promise<LoanContract> {
    // Tìm theo contractId (mã hợp đồng) hoặc _id (ObjectId)
    const query = Types.ObjectId.isValid(contractId) ? { $or: [{ _id: contractId }, { contractId }] } : { contractId };

    let contract = await this.contractModel
      .findOne({
        ...query,
        userId: new Types.ObjectId(userId),
      })
      .lean()
      .exec();

    // Fallback: userId in JWT may differ from the one stored (e.g. re-created user)
    if (!contract) {
      contract = await this.contractModel.findOne(query).lean().exec();
      if (contract) {
        this.logger.warn(
          `[getContractById] Found contract ${contractId} via fallback (stored userId=${contract.userId}, jwt userId=${userId}). Updating...`,
        );
        // Fix the userId mismatch permanently
        await this.contractModel.updateOne({ _id: contract._id }, { $set: { userId: new Types.ObjectId(userId) } });
      }
    }

    if (!contract) {
      throw new NotFoundException('Không tìm thấy hợp đồng');
    }

    return contract as LoanContract;
  }

  /**
   * Lấy hợp đồng theo loanId (MongoDB ObjectId of LoanApplication)
   * Fallback: tìm LoanApplication → lấy fineractLoanId → search contract
   * Nếu loan đã approved nhưng chưa có contract → tự động tạo
   */
  async getContractByLoanId(loanId: string, userId: string): Promise<LoanContract | null> {
    // 1. Direct lookup by loanId
    if (Types.ObjectId.isValid(loanId)) {
      const direct = await this.contractModel
        .findOne({
          loanId: new Types.ObjectId(loanId),
          userId: new Types.ObjectId(userId),
        })
        .lean()
        .exec();
      if (direct) return direct as LoanContract;
    }

    // 2. Fallback: find the LoanApplication, then search by fineractLoanId
    let app: LoanApplication | null = null;
    if (Types.ObjectId.isValid(loanId)) {
      app = await this.loanApplicationModel.findById(loanId).lean().exec();
    }
    // Try by fineractLoanId — handle both numeric "21" and "fineract-21" formats
    if (!app) {
      const numericId = /^fineract-(\d+)$/.test(loanId) ? Number(loanId.replace('fineract-', '')) : Number(loanId);
      if (!isNaN(numericId) && numericId > 0) {
        app = await this.loanApplicationModel.findOne({ fineractLoanId: numericId }).lean().exec();
      }
    }
    if (!app) return null;

    // Search by app._id (in case loanId param was fineractLoanId)
    let contract = await this.contractModel
      .findOne({ loanId: (app as any)._id, userId: new Types.ObjectId(userId) })
      .lean()
      .exec();

    // Also try by fineractLoanId
    if (!contract && app.fineractLoanId) {
      contract = await this.contractModel
        .findOne({ fineractLoanId: app.fineractLoanId, userId: new Types.ObjectId(userId) })
        .lean()
        .exec();
    }

    // Fallback: try without userId filter (handles userId mismatch)
    if (!contract) {
      contract = await this.contractModel
        .findOne({ loanId: (app as any)._id })
        .lean()
        .exec();
      if (!contract && app.fineractLoanId) {
        contract = await this.contractModel.findOne({ fineractLoanId: app.fineractLoanId }).lean().exec();
      }
      if (contract) {
        this.logger.warn(
          `[getContractByLoanId] Found contract via fallback (stored userId=${contract.userId}, jwt userId=${userId})`,
        );
      }
    }

    if (contract) return contract as LoanContract;

    // 3. Auto-create contract if loan is approved/disbursed but contract is missing
    const eligibleStatuses = ['approved', 'pending_signature', 'disbursed', 'success'];
    if (app.fineractLoanId && eligibleStatuses.includes(app.status)) {
      this.logger.warn(
        `[getContractByLoanId] No contract found for loan ${loanId} (fineract #${app.fineractLoanId}). Auto-creating...`,
      );
      try {
        const created = await this.createContractOnApproval(app.fineractLoanId);
        return created;
      } catch (err) {
        this.logger.error(`[getContractByLoanId] Auto-create failed: ${err?.message}`);
      }
    }

    return null;
  }

  /**
   * Ký hợp đồng (người vay xác nhận)
   */
  async signContract(contractId: string, userId: string, signatureData?: string): Promise<LoanContract> {
    let contract = await this.contractModel
      .findOne({
        contractId,
        userId: new Types.ObjectId(userId),
      })
      .exec();

    // Fallback: userId mismatch (e.g. user re-created)
    if (!contract) {
      contract = await this.contractModel.findOne({ contractId }).exec();
    }

    if (!contract) {
      throw new NotFoundException('Không tìm thấy hợp đồng');
    }

    if (contract.status !== 'pending_signature') {
      throw new BadRequestException(`Hợp đồng đã ở trạng thái: ${contract.status}`);
    }

    contract.status = 'signed';
    contract.signedAt = new Date();
    if (signatureData) {
      contract.signatureData = signatureData;
    }
    await contract.save();

    this.logger.log(`[signContract] Contract signed: ${contractId} by userId=${userId}`);

    // Gửi thông báo
    await this.notificationModel.create({
      userId: new Types.ObjectId(userId),
      title: 'Hợp đồng đã được ký',
      message: `Hợp đồng ${contractId} đã được ký xác nhận thành công. Khoản vay sẽ được giải ngân trong thời gian sớm nhất.`,
      type: 'contract_signed',
      data: {
        contractId,
        contractObjectId: contract._id?.toString(),
      },
    });

    return contract;
  }

  /**
   * Ký hợp đồng bằng chữ ký số VNPT SmartCA (Cách 2 — embedded SDK)
   * Flow: Server tạo phiên ký → trả thông tin cho client → client mở SDK → confirm kết quả
   */
  // async initiateSmartCaSigning(
  //   contractId: string,
  //   userId: string,
  //   options?: { clientIp?: string; userAgent?: string },
  // ): Promise<{
  //   signatureId: string;
  //   transactionId: string;
  //   signingSessionId: string;
  //   credentialId: string;
  //   expiresAt: Date;
  // }> {
  //   if (!this.smartCAService) {
  //     throw new BadRequestException('Dịch vụ ký số chưa được cấu hình');
  //   }
  //   return this.smartCAService.initiateSigningRequest(contractId, userId, options);
  // }

  /**
   * Lấy trạng thái chữ ký số của hợp đồng
   */
  // async getContractSignatureInfo(contractCode: string, userId: string) {
  //   if (!this.smartCAService) {
  //     return null;
  //   }
  //   return this.smartCAService.getSignatureByContract(contractCode, userId);
  // }

  /**
   * Sinh HTML hợp đồng (dùng cho hiển thị trên client hoặc xuất PDF)
   */
  async getContractHTML(contractId: string, userId: string): Promise<string> {
    const contract = await this.getContractById(contractId, userId);

    // Backfill cho hợp đồng cũ chưa có snapshot để PDF luôn hiển thị rõ chính sách trước khi ký.
    if (
      (!Array.isArray((contract as any).delinquencyPolicySnapshot) ||
        (contract as any).delinquencyPolicySnapshot.length === 0) &&
      contract.status === 'pending_signature'
    ) {
      const delinquencyPolicySnapshot = await this.buildDelinquencyPolicySnapshot();
      if (delinquencyPolicySnapshot.length > 0) {
        await this.contractModel.updateOne({ _id: (contract as any)._id }, { $set: { delinquencyPolicySnapshot } });
        (contract as any).delinquencyPolicySnapshot = delinquencyPolicySnapshot;
      }
    }

    return generateLoanContractHTML({ contract });
  }

  /**
   * Lấy danh sách thông báo của user
   */
  async getUserNotifications(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{
    notifications: Notification[];
    total: number;
    unreadCount: number;
  }> {
    const uid = new Types.ObjectId(userId);
    const [notifications, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find({ userId: uid })
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      this.notificationModel.countDocuments({ userId: uid }),
      this.notificationModel.countDocuments({ userId: uid, read: false }),
    ]);

    return { notifications: notifications as Notification[], total, unreadCount };
  }

  /**
   * Đánh dấu thông báo đã đọc
   */
  async markNotificationRead(notificationId: string, userId: string): Promise<void> {
    await this.notificationModel.updateOne(
      { _id: notificationId, userId: new Types.ObjectId(userId) },
      { $set: { read: true } },
    );
  }

  /**
   * Đánh dấu tất cả thông báo đã đọc
   */
  async markAllNotificationsRead(userId: string): Promise<void> {
    await this.notificationModel.updateMany(
      { userId: new Types.ObjectId(userId), read: false },
      { $set: { read: true } },
    );
  }
}

function formatMoney(amount: number): string {
  return Math.round(amount).toLocaleString('vi-VN') + ' đ';
}
