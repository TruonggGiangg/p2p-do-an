import { Injectable, Logger, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LoanContract, BorrowerInfo, RepaymentScheduleItem, FeeStructureItem } from './schemas/loan-contract.schema';
import { LoanApplication } from './schemas/loan-application.schema';
import { Notification } from './schemas/notification.schema';
import { User } from '../users/schemas/user.schema';
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

    const contract = await this.contractModel
      .findOne({
        ...query,
        userId: new Types.ObjectId(userId),
      })
      .lean()
      .exec();

    if (!contract) {
      throw new NotFoundException('Không tìm thấy hợp đồng');
    }

    return contract as LoanContract;
  }

  /**
   * Lấy hợp đồng theo loanId (MongoDB ObjectId of LoanApplication)
   */
  async getContractByLoanId(loanId: string, userId: string): Promise<LoanContract | null> {
    return this.contractModel
      .findOne({
        loanId: new Types.ObjectId(loanId),
        userId: new Types.ObjectId(userId),
      })
      .lean()
      .exec() as Promise<LoanContract | null>;
  }

  /**
   * Ký hợp đồng (người vay xác nhận)
   */
  async signContract(contractId: string, userId: string, signatureData?: string): Promise<LoanContract> {
    const contract = await this.contractModel
      .findOne({
        contractId,
        userId: new Types.ObjectId(userId),
      })
      .exec();

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
