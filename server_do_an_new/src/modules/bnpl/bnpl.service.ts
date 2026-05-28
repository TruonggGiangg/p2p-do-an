import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { BnplWallet, BnplWalletStatus } from './schemas/bnpl-wallet.schema';
import { BnplLoan, BnplLoanStatus } from './schemas/bnpl-loan.schema';
import { BnplApplication, BnplApplicationStatus } from './schemas/bnpl-application.schema';
import { BnplPolicyConfig, BnplInterestType } from './schemas/bnpl-policy-config.schema';
import {
  BnplPaymentOperation,
  BnplPaymentOperationStatus,
  BnplPaymentOperationType,
} from './schemas/bnpl-payment-operation.schema';
import { User } from '../users/schemas/user.schema';
import { FineractService } from '../fineract/fineract.service';
import { FineractLoanService } from '../fineract/services/fineract-loan.service';
import { FineractSavingsService } from '../fineract/services/fineract-savings.service';
import { CreateBnplLoanDto } from './dto/create-bnpl-loan.dto';
import { CreateBnplApplicationDto } from './dto/create-bnpl-application.dto';
import { CreateBnplPolicyConfigDto } from './dto/create-bnpl-policy-config.dto';
import { roundToCurrency } from '../../utils/RoundingUtils';

export interface BnplWalletInfo {
  id: string;
  creditLimit: number;
  usedCredit: number;
  availableCredit: number;
  balance: number; // Negative value when in debt
  status: string;
  activeLoansCount: number;
}

export interface BnplApplicationInfo {
  id: string;
  userId: string;
  status: string;
  requestedLimit?: number;
  approvedLimit?: number;
  income?: number;
  occupation?: string;
  purpose?: string;
  address?: string;
  requestedTermMonths?: number;
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  signedAt?: Date;
  signatureText?: string;
  rejectReason?: string;
  riskDecision?: Record<string, any> | null;
  riskReasons: string[];
}

export interface BnplPolicyConfigInfo {
  id?: string;
  version: number;
  loanProductId: number;
  creditLimit: number;
  defaultRepayments: number;
  minRepayments: number;
  maxRepayments: number;
  minAmount: number;
  maxAmount: number;
  monthlyRate: number;
  interestType: BnplInterestType;
  lateFeeRate: number;
  lateFeeFlat: number;
  gracePeriodDays: number;
  maxActiveLoans: number;
  allowEarlyRepayment: boolean;
  currencyMultiples: number;
  configHash: string;
  blockchainTxHash?: string;
  changedBy?: string;
  changeNote?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ConsolidatedScheduleItem {
  dueDate: string;
  month: string; // YYYY-MM format for grouping
  totalDue: number;
  principal: number;
  interest: number;
  loans: Array<{
    loanId: string;
    amount: number;
  }>;
}

export interface BnplLoanInfo {
  id: string;
  fineractLoanId: string;
  principal: number;
  totalInterest: number;
  totalRepayment: number;
  paidAmount: number;
  outstandingBalance: number;
  numberOfRepayments: number;
  status: string;
  description?: string;
  purpose?: string;
  disbursedAt?: Date;
  repaymentSchedule?: any[];
}

export interface BnplTransactionInfo {
  id: string;
  loanId: string;
  fineractLoanId: string;
  type: 'disbursement' | 'repayment' | 'prepayment' | 'fee' | 'adjustment' | 'other';
  amount: number;
  date: string;
  description: string;
  loanStatus: string;
  source: 'fineract';
}

export interface BnplAdminWalletInfo extends BnplWalletInfo {
  userId: string;
  userName?: string;
  email?: string;
  phoneNumber?: string;
  approvedAt?: Date;
  approvedBy?: string;
  suspendedAt?: Date;
  suspendedReason?: string;
  lastSyncedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BnplAdminLoanInfo extends BnplLoanInfo {
  walletId: string;
  userId: string;
  userName?: string;
  email?: string;
  phoneNumber?: string;
  walletStatus?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BnplAdminDashboardSummary {
  totalWallets: number;
  activeWallets: number;
  pendingWallets: number;
  suspendedWallets: number;
  totalLoans: number;
  activeLoans: number;
  approvedLoans: number;
  pendingLoans: number;
  closedLoans: number;
  overdueLoans: number;
  totalCreditLimit: number;
  totalUsedCredit: number;
  totalOutstanding: number;
}

@Injectable()
export class BnplService {
  private readonly logger = new Logger(BnplService.name);

  constructor(
    @InjectModel(BnplWallet.name)
    private readonly walletModel: Model<BnplWallet>,
    @InjectModel(BnplLoan.name) private readonly loanModel: Model<BnplLoan>,
    @InjectModel(BnplApplication.name)
    private readonly applicationModel: Model<BnplApplication>,
    @InjectModel(BnplPolicyConfig.name)
    private readonly policyConfigModel: Model<BnplPolicyConfig>,
    @InjectModel(BnplPaymentOperation.name)
    private readonly paymentOperationModel: Model<BnplPaymentOperation>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly fineractService: FineractService,
    private readonly fineractLoanService: FineractLoanService,
    private readonly fineractSavingsService: FineractSavingsService,
    private readonly configService: ConfigService,
  ) {}

  private buildDefaultPolicyConfig(): BnplPolicyConfigInfo {
    return {
      version: 0,
      loanProductId: this.configService.get<number>('bnpl.loanProductId') || 1,
      creditLimit: this.configService.get<number>('bnpl.creditLimit') || 5000000,
      defaultRepayments: this.configService.get<number>('bnpl.defaultRepayments') || 3,
      minRepayments: 1,
      maxRepayments: this.configService.get<number>('bnpl.maxRepayments') || 12,
      minAmount: this.configService.get<number>('bnpl.minAmount') || 500000,
      maxAmount: this.configService.get<number>('bnpl.maxAmount') || 50000000,
      monthlyRate: 1.5,
      interestType: BnplInterestType.DECLINING_BALANCE,
      lateFeeRate: 0,
      lateFeeFlat: 0,
      gracePeriodDays: 0,
      maxActiveLoans: 3,
      allowEarlyRepayment: true,
      currencyMultiples: this.configService.get<number>('bnpl.currencyMultiples') || 1000,
      configHash: '',
    };
  }

  private normalizeCreditScore(user: User): number | null {
    const profile = user.creditProfile;
    const rawScore = profile?.evaluationScore ?? profile?.creditScore ?? null;
    if (rawScore == null || Number.isNaN(Number(rawScore))) {
      return null;
    }

    const score = Number(rawScore);
    if (score <= 100) {
      return Math.max(0, Math.min(100, score));
    }

    if (score >= 150 && score <= 750) {
      const normalized = ((score - 150) / (750 - 150)) * 100;
      return Math.max(0, Math.min(100, normalized));
    }

    return Math.max(0, Math.min(100, score));
  }

  private getBnplTier(score: number | null): { name: string; minScore: number; maxLimit: number; eligible: boolean } {
    if (score == null) {
      return { name: 'unknown', minScore: 0, maxLimit: 0, eligible: false };
    }

    if (score >= 80) {
      return { name: 'platinum', minScore: 80, maxLimit: 20_000_000, eligible: true };
    }
    if (score >= 65) {
      return { name: 'gold', minScore: 65, maxLimit: 10_000_000, eligible: true };
    }
    if (score >= 50) {
      return { name: 'silver', minScore: 50, maxLimit: 5_000_000, eligible: true };
    }
    if (score >= 35) {
      return { name: 'basic', minScore: 35, maxLimit: 2_000_000, eligible: true };
    }

    return { name: 'rejected', minScore: 0, maxLimit: 0, eligible: false };
  }

  private async getOverdueSummary(user: User): Promise<{ overdueAmount: number; overdueLoans: number }> {
    if (!user.fineractClientId) {
      return { overdueAmount: 0, overdueLoans: 0 };
    }

    try {
      const loans = await this.fineractLoanService.getLoansByClientId(Number(user.fineractClientId));
      let overdueAmount = 0;
      let overdueLoans = 0;

      for (const loan of loans || []) {
        const loanId = loan?.id ?? loan?.loanId ?? loan?.accountNo;
        if (loanId == null) continue;

        try {
          const details = await this.fineractService.getLoanDetails(String(loanId));
          const summary = details?.summary || details?.repaymentSchedule || {};
          const totalOverdue = Number(summary.totalOverdue ?? summary.overdueAmount ?? summary.totalOverdueAmount ?? 0);
          if (totalOverdue > 0) {
            overdueAmount += totalOverdue;
            overdueLoans += 1;
          }
        } catch (error: any) {
          this.logger.warn(`[getOverdueSummary] Failed for loan ${loanId}: ${error?.message}`);
        }
      }

      return { overdueAmount, overdueLoans };
    } catch (error: any) {
      this.logger.warn(`[getOverdueSummary] Failed for user ${user._id}: ${error?.message}`);
      return { overdueAmount: 0, overdueLoans: 0 };
    }
  }

  private hashPolicyPayload(payload: Omit<BnplPolicyConfigInfo, 'id' | 'version' | 'configHash' | 'blockchainTxHash' | 'changedBy' | 'changeNote' | 'createdAt' | 'updatedAt'>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private toPolicyConfigInfo(doc: any): BnplPolicyConfigInfo {
    return {
      id: doc._id?.toString?.(),
      version: doc.version ?? 0,
      loanProductId: doc.loanProductId ?? (this.configService.get<number>('bnpl.loanProductId') || 1),
      creditLimit: doc.creditLimit ?? (this.configService.get<number>('bnpl.creditLimit') || 5000000),
      defaultRepayments: doc.defaultRepayments ?? (this.configService.get<number>('bnpl.defaultRepayments') || 3),
      minRepayments: doc.minRepayments ?? 1,
      maxRepayments: doc.maxRepayments ?? (this.configService.get<number>('bnpl.maxRepayments') || 12),
      minAmount: doc.minAmount ?? (this.configService.get<number>('bnpl.minAmount') || 500000),
      maxAmount: doc.maxAmount ?? (this.configService.get<number>('bnpl.maxAmount') || 50000000),
      monthlyRate: doc.monthlyRate ?? 1.5,
      interestType: doc.interestType ?? BnplInterestType.DECLINING_BALANCE,
      lateFeeRate: doc.lateFeeRate ?? 0,
      lateFeeFlat: doc.lateFeeFlat ?? 0,
      gracePeriodDays: doc.gracePeriodDays ?? 0,
      maxActiveLoans: doc.maxActiveLoans ?? 3,
      allowEarlyRepayment: doc.allowEarlyRepayment ?? true,
      currencyMultiples: doc.currencyMultiples ?? (this.configService.get<number>('bnpl.currencyMultiples') || 1000),
      configHash: doc.configHash ?? '',
      blockchainTxHash: doc.blockchainTxHash ?? '',
      changedBy: doc.changedBy,
      changeNote: doc.changeNote,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async getActivePolicyConfig(): Promise<BnplPolicyConfigInfo> {
    const doc = await this.policyConfigModel.findOne().sort({ version: -1 }).lean().exec();
    return doc ? this.toPolicyConfigInfo(doc) : this.buildDefaultPolicyConfig();
  }

  async listPolicyConfigs(): Promise<BnplPolicyConfigInfo[]> {
    const docs = await this.policyConfigModel.find().sort({ version: -1 }).lean().exec();
    if (!docs.length) {
      return [this.buildDefaultPolicyConfig()];
    }
    return docs.map(doc => this.toPolicyConfigInfo(doc));
  }

  async createPolicyConfig(dto: CreateBnplPolicyConfigDto, adminUserId?: string): Promise<BnplPolicyConfigInfo> {
    this.validatePolicyConfig(dto);

    const latest = await this.policyConfigModel.findOne().sort({ version: -1 }).lean().exec();
    const nextVersion = (latest?.version ?? 0) + 1;
    const payload = {
      loanProductId: dto.loanProductId,
      creditLimit: dto.creditLimit,
      defaultRepayments: dto.defaultRepayments,
      minRepayments: dto.minRepayments,
      maxRepayments: dto.maxRepayments,
      minAmount: dto.minAmount,
      maxAmount: dto.maxAmount,
      monthlyRate: dto.monthlyRate,
      interestType: dto.interestType,
      lateFeeRate: dto.lateFeeRate ?? 0,
      lateFeeFlat: dto.lateFeeFlat ?? 0,
      gracePeriodDays: dto.gracePeriodDays ?? 0,
      maxActiveLoans: dto.maxActiveLoans ?? 3,
      allowEarlyRepayment: dto.allowEarlyRepayment ?? true,
      currencyMultiples: dto.currencyMultiples ?? 1000,
    };
    const configHash = this.hashPolicyPayload(payload);

    const created = await this.policyConfigModel.create({
      version: nextVersion,
      ...payload,
      configHash,
      blockchainTxHash: '',
      changedBy: adminUserId || '',
      changeNote: dto.changeNote || `BNPL policy v${nextVersion}`,
    });

    return this.toPolicyConfigInfo(created);
  }

  private validatePolicyConfig(dto: CreateBnplPolicyConfigDto) {
    if (dto.minRepayments > dto.maxRepayments) {
      throw new BadRequestException('Kỳ hạn tối thiểu không được lớn hơn kỳ hạn tối đa');
    }
    if (dto.defaultRepayments < dto.minRepayments || dto.defaultRepayments > dto.maxRepayments) {
      throw new BadRequestException('Kỳ hạn mặc định phải nằm trong khoảng kỳ hạn cho phép');
    }
    if (dto.minAmount > dto.maxAmount) {
      throw new BadRequestException('Số tiền tối thiểu không được lớn hơn số tiền tối đa');
    }
  }

  /**
   * Get or create BNPL wallet for user
   */
  async getOrCreateWallet(userId: string): Promise<BnplWallet> {
    let wallet = await this.walletModel.findOne({ userId: new Types.ObjectId(userId) }).exec();

    if (!wallet) {
      const policy = await this.getActivePolicyConfig();
      const creditLimit = policy.creditLimit;
      wallet = await this.walletModel.create({
        userId: new Types.ObjectId(userId),
        creditLimit,
        usedCredit: 0,
        status: BnplWalletStatus.PENDING,
      });
      this.logger.log(`Created BNPL wallet for user ${userId} with limit ${creditLimit}`);
    }

    return wallet;
  }

  async submitApplication(userId: string, dto: CreateBnplApplicationDto): Promise<BnplApplicationInfo> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.kycStatus !== 'VERIFIED') {
      throw new BadRequestException('BNPL requires verified KYC');
    }

    if (!user.fineractClientId) {
      throw new BadRequestException('User is not linked to Fineract');
    }

    const creditScore = this.normalizeCreditScore(user);
    const tier = this.getBnplTier(creditScore);
    if (!tier.eligible) {
      throw new BadRequestException('Điểm tín dụng chưa đủ để mở BNPL');
    }

    const existing = await this.applicationModel
      .findOne({
        userId: new Types.ObjectId(userId),
        status: { $in: [BnplApplicationStatus.SUBMITTED, BnplApplicationStatus.APPROVED] },
      })
      .sort({ createdAt: -1 })
      .exec();

    if (existing) {
      return this.toApplicationInfo(existing);
    }

    const policy = await this.getActivePolicyConfig();
    const wallet = await this.getOrCreateWallet(userId);
    const overdueSummary = await this.getOverdueSummary(user);
    if (overdueSummary.overdueLoans > 0 || overdueSummary.overdueAmount > 0) {
      throw new BadRequestException('User đang có nợ quá hạn, chưa đủ điều kiện mở BNPL');
    }

    const requestedLimit = Math.min(dto.requestedLimit || policy.creditLimit, policy.maxAmount, tier.maxLimit);
    const requestedTermMonths = Math.min(
      Math.max(dto.requestedTermMonths || policy.defaultRepayments, policy.minRepayments),
      policy.maxRepayments,
    );

    const activeLoansCount = await this.loanModel.countDocuments({
      userId: new Types.ObjectId(userId),
      status: { $in: [BnplLoanStatus.ACTIVE, BnplLoanStatus.APPROVED] },
    });
    if (activeLoansCount >= policy.maxActiveLoans) {
      throw new BadRequestException(`Vượt quá số khoản BNPL active tối đa (${policy.maxActiveLoans})`);
    }

    const application = await this.applicationModel.create({
      userId: new Types.ObjectId(userId),
      status: BnplApplicationStatus.SUBMITTED,
      requestedLimit,
      income: dto.income,
      occupation: dto.occupation,
      purpose: dto.purpose,
      address: dto.address,
      requestedTermMonths,
      kycSnapshot: {
        status: user.kycStatus,
        completedAt: user.kycData?.completedAt || user.kycData?.verifiedAt || null,
      },
      creditScoreSnapshot: user.creditProfile || null,
      incomeSnapshot: dto.income != null ? { declaredMonthlyIncome: dto.income } : null,
      existingDebtSnapshot: {
        usedCredit: wallet.usedCredit,
        creditLimit: wallet.creditLimit,
        activeLoansCount,
      },
      riskDecision: {
        decision: 'manual_review',
        reason: 'Initial BNPL application requires staff approval',
        creditScore,
        tier: tier.name,
        maxLimitByTier: tier.maxLimit,
      },
      riskReasons: [
        `creditScore=${creditScore ?? 'n/a'}`,
        `tier=${tier.name}`,
        `maxLimitByTier=${tier.maxLimit}`,
        `overdueLoans=${overdueSummary.overdueLoans}`,
      ],
      submittedAt: new Date(),
    });

    await this.walletModel.updateOne(
      { _id: wallet._id },
      {
        $set: {
          status: wallet.status === BnplWalletStatus.ACTIVE ? BnplWalletStatus.ACTIVE : BnplWalletStatus.PENDING,
          creditLimit: requestedLimit,
        },
      },
    );

    return this.toApplicationInfo(application);
  }

  async getCurrentApplication(userId: string): Promise<BnplApplicationInfo | null> {
    const application = await this.applicationModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();

    return application ? this.toApplicationInfo(application) : null;
  }

  async listApplications(status?: string): Promise<BnplApplicationInfo[]> {
    const query: any = {};
    if (status) {
      query.status = status;
    }

    const applications = await this.applicationModel.find(query).sort({ createdAt: -1 }).exec();
    return applications.map(application => this.toApplicationInfo(application));
  }

  async getApplicationById(applicationId: string): Promise<BnplApplicationInfo> {
    const application = await this.applicationModel.findById(applicationId).exec();
    if (!application) {
      throw new NotFoundException('Không tìm thấy hồ sơ BNPL');
    }

    return this.toApplicationInfo(application);
  }

  async approveApplication(
    applicationId: string,
    adminUserId: string,
    approvedLimit?: number,
  ): Promise<BnplApplicationInfo> {
    const application = await this.applicationModel.findById(applicationId).exec();
    if (!application) {
      throw new NotFoundException('Không tìm thấy hồ sơ BNPL');
    }

    if (application.status === BnplApplicationStatus.APPROVED) {
      return this.toApplicationInfo(application);
    }

    if (application.status !== BnplApplicationStatus.SUBMITTED) {
      throw new BadRequestException('Chỉ hồ sơ đang chờ duyệt mới có thể phê duyệt');
    }

    const wallet = await this.getOrCreateWallet(application.userId.toString());
    const applicant = await this.userModel.findById(application.userId).exec();
    if (!applicant) {
      throw new NotFoundException('Không tìm thấy người dùng của hồ sơ BNPL');
    }

    const creditScore = this.normalizeCreditScore(applicant);
    const tier = this.getBnplTier(creditScore);
    if (!tier.eligible) {
      throw new BadRequestException('Điểm tín dụng không đủ để phê duyệt BNPL');
    }

    const limitToApprove = Math.max(
      0,
      approvedLimit ?? application.approvedLimit ?? application.requestedLimit ?? wallet.creditLimit,
    );
    const safeApprovedLimit = Math.min(limitToApprove, tier.maxLimit);

    if (safeApprovedLimit <= 0) {
      throw new BadRequestException('Hạn mức phê duyệt không hợp lệ');
    }

    await this.applicationModel.updateOne(
      { _id: application._id },
      {
        $set: {
          status: BnplApplicationStatus.APPROVED,
          approvedLimit: safeApprovedLimit,
          reviewedAt: new Date(),
          reviewedBy: new Types.ObjectId(adminUserId),
          rejectReason: null,
          riskDecision: {
            ...(application.riskDecision || {}),
            decision: 'approved',
            creditScore,
            tier: tier.name,
            maxLimitByTier: tier.maxLimit,
            approvedLimit: safeApprovedLimit,
            reviewedBy: adminUserId,
            reviewedAt: new Date(),
          },
        },
      },
    );

    await this.walletModel.updateOne(
      { _id: wallet._id },
      {
        $set: {
          creditLimit: safeApprovedLimit,
          status: BnplWalletStatus.PENDING,
          approvedAt: new Date(),
          approvedBy: new Types.ObjectId(adminUserId),
          suspendedAt: null,
          suspendedReason: null,
        },
      },
    );

    const updated = await this.applicationModel.findById(applicationId).exec();
    if (!updated) {
      throw new NotFoundException('Không tìm thấy hồ sơ BNPL');
    }

    return this.toApplicationInfo(updated);
  }

  async activateWallet(userId: string, signatureText?: string): Promise<BnplWalletInfo> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const wallet = await this.getOrCreateWallet(userId);
    if (wallet.status === BnplWalletStatus.ACTIVE) {
      return this.getWalletInfo(userId);
    }

    const application = await this.applicationModel
      .findOne({
        userId: new Types.ObjectId(userId),
        status: BnplApplicationStatus.APPROVED,
      })
      .sort({ reviewedAt: -1, createdAt: -1 })
      .exec();

    if (!application) {
      throw new BadRequestException('Khong tim thay ho so BNPL da duoc duyet');
    }

    await this.applicationModel.updateOne(
      { _id: application._id },
      {
        $set: {
          signedAt: new Date(),
          signatureText: signatureText?.trim() || [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' ') || user.username || '',
          riskDecision: {
            ...(application.riskDecision || {}),
            decision: 'signed',
            signedAt: new Date(),
          },
        },
      },
    );

    await this.walletModel.updateOne(
      { _id: wallet._id },
      {
        $set: {
          status: BnplWalletStatus.ACTIVE,
        },
      },
    );

    this.logger.log(`Activated BNPL wallet for user ${userId} after signature`);
    return this.getWalletInfo(userId);
  }

  async rejectApplication(
    applicationId: string,
    adminUserId: string,
    reason?: string,
  ): Promise<BnplApplicationInfo> {
    const application = await this.applicationModel.findById(applicationId).exec();
    if (!application) {
      throw new NotFoundException('Không tìm thấy hồ sơ BNPL');
    }

    if (application.status === BnplApplicationStatus.REJECTED) {
      return this.toApplicationInfo(application);
    }

    if (application.status !== BnplApplicationStatus.SUBMITTED) {
      throw new BadRequestException('Chỉ hồ sơ đang chờ duyệt mới có thể từ chối');
    }

    const wallet = await this.getOrCreateWallet(application.userId.toString());
    const rejectReason = reason?.trim() || 'Hồ sơ BNPL bị từ chối bởi admin';

    await this.applicationModel.updateOne(
      { _id: application._id },
      {
        $set: {
          status: BnplApplicationStatus.REJECTED,
          reviewedAt: new Date(),
          reviewedBy: new Types.ObjectId(adminUserId),
          rejectReason,
          riskDecision: {
            ...(application.riskDecision || {}),
            decision: 'rejected',
            reviewedBy: adminUserId,
            reviewedAt: new Date(),
            reason: rejectReason,
          },
        },
      },
    );

    await this.walletModel.updateOne(
      { _id: wallet._id },
      {
        $set: {
          status: BnplWalletStatus.SUSPENDED,
          creditLimit: 0,
          usedCredit: 0,
          suspendedAt: new Date(),
          suspendedReason: rejectReason,
        },
      },
    );

    const updated = await this.applicationModel.findById(applicationId).exec();
    if (!updated) {
      throw new NotFoundException('Không tìm thấy hồ sơ BNPL');
    }

    return this.toApplicationInfo(updated);
  }

  private normalizeIsoDate(input?: string): string {
    if (!input) {
      return new Date().toISOString().split('T')[0];
    }

    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString().split('T')[0];
    }

    return parsed.toISOString().split('T')[0];
  }

  private async findLoanRecord(userId: string, loanId: string): Promise<BnplLoan> {
    let loan: BnplLoan | null = null;

    if (Types.ObjectId.isValid(loanId)) {
      loan = await this.loanModel.findOne({
        _id: new Types.ObjectId(loanId),
        userId: new Types.ObjectId(userId),
      }).exec();
    }

    if (!loan) {
      const numericId = Number(loanId);
      if (!Number.isNaN(numericId)) {
        loan = await this.loanModel.findOne({
          fineractLoanId: String(numericId),
          userId: new Types.ObjectId(userId),
        }).exec();
      }
    }

    if (!loan) {
      throw new NotFoundException('Không tìm thấy khoản vay');
    }

    return loan;
  }

  private mapTransactionType(raw: any): BnplTransactionInfo['type'] {
    const label = String(raw?.transactionType?.value || raw?.type || raw?.transactionType?.code || '').toLowerCase();
    if (label.includes('disbur')) return 'disbursement';
    if (label.includes('prepay')) return 'prepayment';
    if (label.includes('repay') || label.includes('payment')) return 'repayment';
    if (label.includes('fee') || label.includes('charge')) return 'fee';
    if (label.includes('adjust')) return 'adjustment';
    return 'other';
  }

  private mapLoanTransaction(loan: BnplLoan, txn: any): BnplTransactionInfo {
    const amount = Number(txn?.amount ?? txn?.transactionAmount ?? 0) || 0;
    const type = this.mapTransactionType(txn);
    const description =
      txn?.note ||
      txn?.description ||
      txn?.transfer?.transferDescription ||
      txn?.paymentDetailData?.paymentType?.name ||
      txn?.transactionType?.value ||
      'Giao dịch BNPL';

    let date = this.normalizeIsoDate();
    if (txn?.date && Array.isArray(txn.date) && txn.date.length >= 3) {
      date = new Date(Number(txn.date[0]), Number(txn.date[1]) - 1, Number(txn.date[2])).toISOString();
    } else if (typeof txn?.date === 'string') {
      const parsed = new Date(txn.date);
      if (!Number.isNaN(parsed.getTime())) {
        date = parsed.toISOString();
      }
    } else if (typeof txn?.createdDate === 'string') {
      const parsed = new Date(txn.createdDate);
      if (!Number.isNaN(parsed.getTime())) {
        date = parsed.toISOString();
      }
    }

    const signedAmount = type === 'disbursement' ? Math.abs(amount) : -Math.abs(amount);

    return {
      id: String(txn?.id ?? txn?.transactionId ?? `${loan._id.toString()}-${date}`),
      loanId: loan._id.toString(),
      fineractLoanId: loan.fineractLoanId,
      type,
      amount: signedAmount,
      date,
      description,
      loanStatus: loan.status,
      source: 'fineract',
    };
  }

  private async withdrawFromEWallet(userId: string, amount: number, note: string): Promise<{ savingsId: number }> {
    const user = await this.userModel.findById(userId).exec();
    if (!user?.fineractClientId) {
      throw new BadRequestException('User chÆ°a Ä‘Æ°á»£c liÃªn káº¿t vá»›i Fineract');
    }

    const eWallet = await this.fineractSavingsService.getActiveEWalletAccount(Number(user.fineractClientId));
    if (!eWallet) {
      throw new BadRequestException('KhÃ´ng tÃ¬m tháº¥y vÃ­ Ä‘iá»‡n tá»­ active');
    }

    const balance = Number(eWallet.summary?.accountBalance ?? eWallet.accountBalance ?? 0);
    if (balance < amount) {
      throw new BadRequestException(
        `Sá»‘ dÆ° vÃ­ khÃ´ng Ä‘á»§. Hiá»‡n táº¡i: ${balance.toLocaleString('vi-VN')} Ä‘, cáº§n: ${amount.toLocaleString('vi-VN')} Ä‘`,
      );
    }

    await this.fineractSavingsService.withdrawFromSavings(Number(eWallet.id), amount, note);
    return { savingsId: Number(eWallet.id) };
  }

  private async refundToEWallet(savingsId: number, amount: number, note: string): Promise<void> {
    try {
      await this.fineractSavingsService.depositToSavings(savingsId, amount, note);
    } catch (error: any) {
      this.logger.warn(`[refundToEWallet] Failed to refund ${amount} to savings ${savingsId}: ${error?.message}`);
    }
  }

  private buildPaymentOperationKey(
    operationType: BnplPaymentOperationType,
    loanId: string,
    amount: number,
    repaymentDate?: string,
    idempotencyKey?: string,
  ): string {
    if (idempotencyKey?.trim()) {
      return idempotencyKey.trim();
    }

    return [
      operationType,
      loanId,
      amount.toString(),
      repaymentDate || this.normalizeIsoDate(),
    ].join(':');
  }

  private async findPaymentOperation(
    userId: string,
    loanId: string,
    operationType: BnplPaymentOperationType,
    idempotencyKey: string,
  ) {
    return this.paymentOperationModel.findOne({
      userId: new Types.ObjectId(userId),
      loanId: new Types.ObjectId(loanId),
      operationType,
      idempotencyKey,
    }).exec();
  }

  private async createPaymentOperation(
    userId: string,
    loanId: string,
    operationType: BnplPaymentOperationType,
    idempotencyKey: string,
    requestPayload: Record<string, any>,
  ): Promise<BnplPaymentOperation> {
    try {
      return await this.paymentOperationModel.create({
        userId: new Types.ObjectId(userId),
        loanId: new Types.ObjectId(loanId),
        operationType,
        idempotencyKey,
        status: BnplPaymentOperationStatus.PENDING,
        requestPayload,
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        const existing = await this.findPaymentOperation(userId, loanId, operationType, idempotencyKey);
        if (existing) {
          return existing as BnplPaymentOperation;
        }
      }
      throw error;
    }
  }

  private async finalizePaymentOperation(
    operationId: Types.ObjectId | string,
    status: BnplPaymentOperationStatus,
    responsePayload?: Record<string, any> | null,
    errorMessage?: string,
    fineractTransactionId?: number,
  ) {
    await this.paymentOperationModel.updateOne(
      { _id: operationId },
      {
        $set: {
          status,
          responsePayload: responsePayload ?? null,
          errorMessage: errorMessage || null,
          fineractTransactionId,
        },
      },
    );
  }

  /**
   * Get wallet info with computed fields
   */
  async getWalletInfo(userId: string): Promise<BnplWalletInfo> {
    const wallet = await this.getOrCreateWallet(userId);
    const activeLoansCount = await this.loanModel.countDocuments({
      walletId: wallet._id,
      status: { $in: [BnplLoanStatus.ACTIVE, BnplLoanStatus.APPROVED] },
    });

    return {
      id: wallet._id.toString(),
      creditLimit: wallet.creditLimit,
      usedCredit: wallet.usedCredit,
      availableCredit: wallet.creditLimit - wallet.usedCredit,
      balance: -wallet.usedCredit, // Negative when in debt
      status: wallet.status,
      activeLoansCount,
    };
  }

  async listWallets(status?: string): Promise<BnplAdminWalletInfo[]> {
    const query: any = {};
    if (status) {
      query.status = status;
    }

    const wallets = await this.walletModel.find(query).sort({ updatedAt: -1 }).lean().exec();
    const userIds = wallets.map((wallet: any) => wallet.userId).filter(Boolean);
    const users = userIds.length
      ? await this.userModel.find({ _id: { $in: userIds } }).select('firstName lastName email phoneNumber').lean().exec()
      : [];
    const userMap = new Map(users.map((user: any) => [String(user._id), user]));

    const loanCounts = await this.loanModel.aggregate([
      {
        $match: {
          walletId: { $in: wallets.map((wallet: any) => wallet._id) },
          status: { $in: [BnplLoanStatus.ACTIVE, BnplLoanStatus.APPROVED] },
        },
      },
      {
        $group: {
          _id: '$walletId',
          count: { $sum: 1 },
        },
      },
    ]);
    const loanCountMap = new Map(loanCounts.map((row: any) => [String(row._id), row.count]));

    return wallets.map((wallet: any) => {
      const user = userMap.get(String(wallet.userId));
      return {
        id: String(wallet._id),
        userId: String(wallet.userId),
        userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined : undefined,
        email: user?.email,
        phoneNumber: user?.phoneNumber,
        creditLimit: wallet.creditLimit,
        usedCredit: wallet.usedCredit,
        availableCredit: wallet.creditLimit - wallet.usedCredit,
        balance: -(wallet.usedCredit || 0),
        status: wallet.status,
        activeLoansCount: loanCountMap.get(String(wallet._id)) || 0,
        approvedAt: wallet.approvedAt,
        approvedBy: wallet.approvedBy ? String(wallet.approvedBy) : undefined,
        suspendedAt: wallet.suspendedAt,
        suspendedReason: wallet.suspendedReason,
        lastSyncedAt: wallet.lastSyncedAt,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
      };
    });
  }

  async listLoansAdmin(status?: string): Promise<BnplAdminLoanInfo[]> {
    const query: any = {};
    if (status) {
      query.status = status;
    }

    const loans = await this.loanModel.find(query).sort({ createdAt: -1 }).lean().exec();
    const userIds = loans.map((loan: any) => loan.userId).filter(Boolean);
    const walletIds = loans.map((loan: any) => loan.walletId).filter(Boolean);
    const users = userIds.length
      ? await this.userModel.find({ _id: { $in: userIds } }).select('firstName lastName email phoneNumber').lean().exec()
      : [];
    const wallets = walletIds.length
      ? await this.walletModel.find({ _id: { $in: walletIds } }).select('status').lean().exec()
      : [];
    const userMap = new Map(users.map((user: any) => [String(user._id), user]));
    const walletMap = new Map(wallets.map((wallet: any) => [String(wallet._id), wallet]));

    return loans.map((loan: any) => {
      const user = userMap.get(String(loan.userId));
      const wallet = walletMap.get(String(loan.walletId));
      return {
        id: String(loan._id),
        walletId: String(loan.walletId),
        userId: String(loan.userId),
        userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined : undefined,
        email: user?.email,
        phoneNumber: user?.phoneNumber,
        walletStatus: wallet?.status,
        fineractLoanId: loan.fineractLoanId,
        principal: loan.principal,
        totalInterest: loan.totalInterest,
        totalRepayment: loan.totalRepayment,
        paidAmount: loan.paidAmount,
        outstandingBalance: loan.totalRepayment - loan.paidAmount,
        numberOfRepayments: loan.numberOfRepayments,
        status: loan.status,
        description: loan.description,
        purpose: loan.purpose,
        disbursedAt: loan.disbursedAt,
        repaymentSchedule: undefined,
        createdAt: loan.createdAt,
        updatedAt: loan.updatedAt,
      };
    });
  }

  async getAdminDashboardSummary(): Promise<BnplAdminDashboardSummary> {
    const [wallets, loans] = await Promise.all([
      this.walletModel.find().lean().exec(),
      this.loanModel.find().lean().exec(),
    ]);

    const totalOutstanding = loans.reduce(
      (sum: number, loan: any) => sum + Math.max(0, Number(loan.totalRepayment || 0) - Number(loan.paidAmount || 0)),
      0,
    );

    return {
      totalWallets: wallets.length,
      activeWallets: wallets.filter((wallet: any) => wallet.status === BnplWalletStatus.ACTIVE).length,
      pendingWallets: wallets.filter((wallet: any) => wallet.status === BnplWalletStatus.PENDING).length,
      suspendedWallets: wallets.filter((wallet: any) => wallet.status === BnplWalletStatus.SUSPENDED).length,
      totalLoans: loans.length,
      activeLoans: loans.filter((loan: any) => loan.status === BnplLoanStatus.ACTIVE).length,
      approvedLoans: loans.filter((loan: any) => loan.status === BnplLoanStatus.APPROVED).length,
      pendingLoans: loans.filter((loan: any) => loan.status === BnplLoanStatus.PENDING_APPROVAL).length,
      closedLoans: loans.filter((loan: any) => loan.status === BnplLoanStatus.CLOSED).length,
      overdueLoans: loans.filter((loan: any) => loan.status === BnplLoanStatus.OVERPAID || loan.status === BnplLoanStatus.WRITTEN_OFF).length,
      totalCreditLimit: wallets.reduce((sum: number, wallet: any) => sum + Number(wallet.creditLimit || 0), 0),
      totalUsedCredit: wallets.reduce((sum: number, wallet: any) => sum + Number(wallet.usedCredit || 0), 0),
      totalOutstanding,
    };
  }

  async suspendWalletByAdmin(walletId: string, adminId: string, reason?: string): Promise<BnplAdminWalletInfo> {
    const wallet = await this.walletModel.findById(walletId).exec();
    if (!wallet) {
      throw new NotFoundException('Không tìm thấy ví BNPL');
    }

    wallet.status = BnplWalletStatus.SUSPENDED;
    wallet.suspendedAt = new Date();
    wallet.suspendedReason = reason || 'Suspended by admin';
    await wallet.save();
    return (await this.listWallets()).find((item) => item.id === walletId) || {
      id: wallet._id.toString(),
      userId: wallet.userId.toString(),
      creditLimit: wallet.creditLimit,
      usedCredit: wallet.usedCredit,
      availableCredit: wallet.creditLimit - wallet.usedCredit,
      balance: -wallet.usedCredit,
      status: wallet.status,
      activeLoansCount: 0,
      suspendedAt: wallet.suspendedAt,
      suspendedReason: wallet.suspendedReason,
    };
  }

  async activateWalletByAdmin(walletId: string, adminId: string): Promise<BnplAdminWalletInfo> {
    const wallet = await this.walletModel.findById(walletId).exec();
    if (!wallet) {
      throw new NotFoundException('Không tìm thấy ví BNPL');
    }

    wallet.status = BnplWalletStatus.ACTIVE;
    wallet.approvedAt = new Date();
    wallet.approvedBy = new Types.ObjectId(adminId);
    wallet.suspendedAt = null as any;
    wallet.suspendedReason = null as any;
    await wallet.save();
    return (await this.listWallets()).find((item) => item.id === walletId) || {
      id: wallet._id.toString(),
      userId: wallet.userId.toString(),
      creditLimit: wallet.creditLimit,
      usedCredit: wallet.usedCredit,
      availableCredit: wallet.creditLimit - wallet.usedCredit,
      balance: -wallet.usedCredit,
      status: wallet.status,
      activeLoansCount: 0,
      approvedAt: wallet.approvedAt,
      approvedBy: wallet.approvedBy ? String(wallet.approvedBy) : undefined,
    };
  }

  async syncLoanStatusByAdmin(loanId: string): Promise<BnplLoanInfo> {
    const loan = await this.loanModel.findById(loanId).exec();
    if (!loan) {
      throw new NotFoundException('Không tìm thấy khoản vay BNPL');
    }

    return this.syncLoanStatus(loan.userId.toString(), loanId);
  }

  /**
   * Preview BNPL loan - Calculate schedule before creation
   * Public endpoint - no userId required
   */
  async previewLoan(
    amount: number,
    numberOfRepayments?: number,
  ): Promise<{
    amount: number;
    numberOfRepayments: number;
    monthlyRate: number;
    annualRate: number;
    monthlyPayment: number;
    totalRepayment: number;
    totalInterest: number;
    totalFees: number;
    interestType: string;
    schedulePreview: Array<{
      period: number;
      principal: number;
      interest: number;
      total: number;
      dueDate: string;
    }>;
  }> {
    const policy = await this.getActivePolicyConfig();
    const productId = policy.loanProductId;
    const repayments = numberOfRepayments || policy.defaultRepayments;
    if (repayments < policy.minRepayments || repayments > policy.maxRepayments) {
      throw new BadRequestException(`Kỳ hạn BNPL phải từ ${policy.minRepayments} đến ${policy.maxRepayments} tháng`);
    }
    if (amount < policy.minAmount || amount > policy.maxAmount) {
      throw new BadRequestException(`Số tiền BNPL phải từ ${policy.minAmount.toLocaleString()} đến ${policy.maxAmount.toLocaleString()} VND`);
    }

    const product = await this.fineractService.getLoanProductDetails(productId);
    const monthlyRate = product?.interestRatePerPeriod ?? policy.monthlyRate;
    const interestType = product?.interestType?.value
      ?? (policy.interestType === BnplInterestType.FLAT ? 'Flat' : 'Declining Balance');

    // Calculate schedule using Fineract product configuration
    const schedule = await this.fineractService.calculateBnplSchedule({
      productId,
      principal: amount,
      numberOfRepayments: repayments,
      monthlyRateOverride: monthlyRate,
      interestTypeOverride: interestType,
    });

    return {
      amount,
      numberOfRepayments: repayments, // Use calculated repayments, not input parameter
      monthlyRate: schedule.monthlyRate || monthlyRate,
      annualRate: schedule.annualRate || monthlyRate * 12,
      monthlyPayment: schedule.monthlyPay,
      totalRepayment: schedule.totalRepayment,
      totalInterest: schedule.totalInterest,
      totalFees: 0,
      interestType: schedule.interestType || interestType,
      schedulePreview: schedule.schedulePreview,
    };
  }

  /**
   * Create a new BNPL loan with auto-approve and auto-disburse
   */
  async createLoan(userId: string, dto: CreateBnplLoanDto): Promise<BnplLoanInfo> {
    const user = await this.userModel.findById(userId).exec();
    if (!user || !user.fineractClientId) {
      throw new BadRequestException('User chưa được liên kết với Fineract');
    }

    if (user.kycStatus !== 'VERIFIED') {
      throw new BadRequestException('BNPL requires verified KYC');
    }

    const creditScore = this.normalizeCreditScore(user);
    const tier = this.getBnplTier(creditScore);
    if (!tier.eligible) {
      throw new BadRequestException('Điểm tín dụng chưa đủ để tạo khoản BNPL');
    }

    const overdueSummary = await this.getOverdueSummary(user);
    if (overdueSummary.overdueLoans > 0 || overdueSummary.overdueAmount > 0) {
      throw new BadRequestException('User đang có nợ quá hạn, không thể tạo khoản BNPL mới');
    }

    const policy = await this.getActivePolicyConfig();
    const wallet = await this.getOrCreateWallet(userId);

    if (wallet.status !== BnplWalletStatus.ACTIVE) {
      throw new BadRequestException('Ví trả sau đang bị tạm ngưng');
    }

    const activeLoansCount = await this.loanModel.countDocuments({
      walletId: wallet._id,
      status: { $in: [BnplLoanStatus.ACTIVE, BnplLoanStatus.APPROVED] },
    });
    if (activeLoansCount >= policy.maxActiveLoans) {
      throw new BadRequestException(`Vượt quá số khoản BNPL active tối đa (${policy.maxActiveLoans})`);
    }

    const productId = policy.loanProductId;
    const numberOfRepayments = dto.numberOfRepayments || policy.defaultRepayments;
    if (numberOfRepayments < policy.minRepayments || numberOfRepayments > policy.maxRepayments) {
      throw new BadRequestException(`Kỳ hạn BNPL phải từ ${policy.minRepayments} đến ${policy.maxRepayments} tháng`);
    }
    if (dto.amount < policy.minAmount || dto.amount > policy.maxAmount) {
      throw new BadRequestException(`Số tiền BNPL phải từ ${policy.minAmount.toLocaleString()} đến ${policy.maxAmount.toLocaleString()} VND`);
    }

    // Preview loan to get accurate total repayment for credit limit check
    const preview = await this.previewLoan(dto.amount, numberOfRepayments);
    const estimatedTotal = preview.totalRepayment;

    // Check credit limit with accurate total repayment from Fineract
    if (wallet.usedCredit + estimatedTotal > wallet.creditLimit) {
      throw new BadRequestException(
        `Vượt quá hạn mức thấu chi. Còn lại: ${(wallet.creditLimit - wallet.usedCredit).toLocaleString()} VND`,
      );
    }

    try {
      // Create, approve, and disburse loan in Fineract
      const { loanId, repaymentSchedule } = await this.fineractService.createAndDisburseLoan({
        clientId: Number(user.fineractClientId),
        productId,
        principal: dto.amount,
        numberOfRepayments,
      });

      // Get totals from Fineract repayment schedule (source of truth)
      const scheduleSummary = repaymentSchedule || {};
      const totalRepayment = scheduleSummary.totalRepaymentExpected || 0;
      const totalInterest = scheduleSummary.totalInterestCharged || 0;

      // Create local record - CHỈ lưu những thứ không thể fetch từ Fineract
      const loan = await this.loanModel.create({
        walletId: wallet._id,
        userId: new Types.ObjectId(userId),
        fineractLoanId: loanId.toString(), // ID để fetch từ Fineract
        principal: dto.amount, // Có thể lấy từ Fineract nhưng lưu để query nhanh
        totalInterest, // Cache tạm thời, sẽ lấy từ Fineract khi cần
        totalRepayment, // Cache tạm thời, sẽ lấy từ Fineract khi cần
        paidAmount: 0, // Sẽ lấy từ Fineract khi cần
        numberOfRepayments, // Có thể lấy từ Fineract nhưng lưu để query nhanh
        status: BnplLoanStatus.ACTIVE,
        description: dto.description, // CHỈ có trong MongoDB
        purpose: dto.purpose,
        disbursedAt: new Date(), // CHỈ có trong MongoDB
      });

      // Update wallet used credit (sử dụng totalRepayment từ Fineract)
      const currencyMultiples = policy.currencyMultiples || this.configService.get<number>('bnpl.currencyMultiples') || 1000;
      await this.walletModel.updateOne(
        { _id: wallet._id },
        {
          $inc: {
            usedCredit: roundToCurrency(totalRepayment, currencyMultiples),
          },
        },
      );

      this.logger.log(
        `Created BNPL loan ${loanId} for user ${userId}, amount: ${dto.amount}, total: ${totalRepayment}`,
      );

      // Return với data từ Fineract
      const periods = repaymentSchedule?.periods || [];
      return {
        id: loan._id.toString(),
        fineractLoanId: loan.fineractLoanId,
        principal: loan.principal,
        totalInterest, // Từ Fineract
        totalRepayment, // Từ Fineract
        paidAmount: 0,
        outstandingBalance: totalRepayment,
        numberOfRepayments: loan.numberOfRepayments,
        status: loan.status,
        description: loan.description,
        purpose: loan.purpose,
        disbursedAt: loan.disbursedAt,
        repaymentSchedule: periods.filter((p: any) => p.period !== 0), // Exclude disbursement period
      };
    } catch (error: any) {
      this.logger.error(`Failed to create BNPL loan: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all loans for a user's wallet
   */
  async getLoans(userId: string, status?: string): Promise<BnplLoanInfo[]> {
    const wallet = await this.walletModel.findOne({ userId: new Types.ObjectId(userId) }).exec();
    if (!wallet) return [];

    const query: any = { walletId: wallet._id };
    if (status) {
      query.status = status;
    }

    const loans = await this.loanModel.find(query).sort({ createdAt: -1 }).exec();

    return loans.map(loan => ({
      id: loan._id.toString(),
      fineractLoanId: loan.fineractLoanId,
      principal: loan.principal,
      totalInterest: loan.totalInterest,
      totalRepayment: loan.totalRepayment,
      paidAmount: loan.paidAmount,
      outstandingBalance: loan.totalRepayment - loan.paidAmount,
      numberOfRepayments: loan.numberOfRepayments,
      status: loan.status,
      description: loan.description,
      purpose: loan.purpose,
      disbursedAt: loan.disbursedAt,
    }));
  }

  /**
   * Get loan details with repayment schedule from Fineract
   * Lấy tất cả thông tin từ Fineract, chỉ lấy metadata từ MongoDB
   */
  async getLoanDetails(userId: string, loanId: string): Promise<BnplLoanInfo> {
    const loan = await this.loanModel
      .findOne({
        _id: new Types.ObjectId(loanId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (!loan) {
      throw new NotFoundException('Không tìm thấy khoản vay');
    }

    // Fetch real-time data from Fineract (source of truth)
    const fineractData = await this.fineractService.getLoanDetails(loan.fineractLoanId);
    const schedule = fineractData.repaymentSchedule?.periods || [];

    // Extract summary from Fineract repayment schedule
    const scheduleSummary = fineractData.repaymentSchedule || {};
    const totalInterest = scheduleSummary.totalInterestCharged || 0;
    const totalRepayment = scheduleSummary.totalRepaymentExpected || 0;
    const paidAmount = scheduleSummary.totalRepayment || 0;
    const outstandingBalance = scheduleSummary.totalOutstanding || 0;

    return {
      id: loan._id.toString(),
      fineractLoanId: loan.fineractLoanId,
      principal: fineractData.principal || loan.principal,
      totalInterest, // Lấy từ Fineract, không lưu trong MongoDB
      totalRepayment, // Lấy từ Fineract
      paidAmount, // Lấy từ Fineract
      outstandingBalance, // Lấy từ Fineract
      numberOfRepayments: fineractData.numberOfRepayments || loan.numberOfRepayments,
      status: this.mapFineractStatus(fineractData.status?.id),
      description: loan.description, // Chỉ có trong MongoDB
      purpose: loan.purpose,
      disbursedAt: loan.disbursedAt, // Chỉ có trong MongoDB
      repaymentSchedule: schedule.filter((p: any) => p.period !== 0), // Exclude disbursement period
    };
  }

  /**
   * Get consolidated repayment schedule across all active loans
   * Groups payments by month
   * Lấy lịch trả nợ từ Fineract, không dùng data trong MongoDB
   */
  async getConsolidatedSchedule(userId: string): Promise<ConsolidatedScheduleItem[]> {
    const policy = await this.getActivePolicyConfig();
    const loans = await this.getLoans(userId, BnplLoanStatus.ACTIVE);
    if (loans.length === 0) return [];

    const scheduleMap = new Map<string, ConsolidatedScheduleItem>();

    for (const loan of loans) {
      try {
        // Lấy lịch trả nợ từ Fineract (source of truth)
        const repaymentSchedule = await this.fineractService.getRepaymentSchedule(loan.fineractLoanId);
        const periods = repaymentSchedule?.periods || [];

        for (const period of periods) {
          // Skip disbursement period (period 0) and completed periods
          if (period.period === 0 || period.complete) continue;

          // Parse due date from Fineract format [year, month, day]
          let dueDate: Date;
          if (Array.isArray(period.dueDate)) {
            dueDate = new Date(period.dueDate[0], period.dueDate[1] - 1, period.dueDate[2]);
          } else if (typeof period.dueDate === 'string') {
            dueDate = new Date(period.dueDate);
          } else {
            continue; // Skip if invalid date
          }

          const monthKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;
          const dueDateStr = dueDate.toISOString().split('T')[0];

          if (!scheduleMap.has(monthKey)) {
            scheduleMap.set(monthKey, {
              dueDate: dueDateStr,
              month: monthKey,
              totalDue: 0,
              principal: 0,
              interest: 0,
              loans: [],
            });
          }

          const item = scheduleMap.get(monthKey)!;
          const principalDue = period.principalDue || 0;
          const interestDue = period.interestDue || 0;
          const periodTotal = principalDue + interestDue;

          // Sử dụng RoundingUtils để đảm bảo đồng bộ
          const currencyMultiples = policy.currencyMultiples || this.configService.get<number>('bnpl.currencyMultiples') || 1000;
          item.totalDue = roundToCurrency(item.totalDue + periodTotal, currencyMultiples);
          item.principal = roundToCurrency(item.principal + principalDue, currencyMultiples);
          item.interest = roundToCurrency(item.interest + interestDue, currencyMultiples);
          item.loans.push({
            loanId: loan.fineractLoanId,
            amount: roundToCurrency(periodTotal, currencyMultiples),
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to get schedule for loan ${loan.id}: ${(error as Error).message}`);
      }
    }

    return Array.from(scheduleMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Sync loan statuses from Fineract
   * Đồng bộ status và paidAmount từ Fineract (source of truth)
   */
  async getTransactions(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ transactions: BnplTransactionInfo[]; total: number }> {
    const wallet = await this.walletModel.findOne({ userId: new Types.ObjectId(userId) }).exec();
    if (!wallet) {
      return { transactions: [], total: 0 };
    }

    const loans = await this.loanModel.find({ walletId: wallet._id }).sort({ createdAt: -1 }).exec();
    const txGroups = await Promise.all(
      loans.map(async loan => {
        try {
          const fineractTransactions = await this.fineractLoanService.getLoanTransactions(Number(loan.fineractLoanId));
          return (fineractTransactions || []).map((txn: any) => this.mapLoanTransaction(loan, txn));
        } catch (error: any) {
          this.logger.warn(`[getTransactions] Failed for loan ${loan._id}: ${error?.message}`);
          return [] as BnplTransactionInfo[];
        }
      }),
    );

    const allTransactions = txGroups
      .flat()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      transactions: allTransactions.slice(offset, offset + limit),
      total: allTransactions.length,
    };
  }

  async repayLoan(
    userId: string,
    loanId: string,
    amount: number,
    repaymentDate?: string,
    idempotencyKey?: string,
  ): Promise<{
    success: boolean;
    transactionId: number;
    amount: number;
    date: string;
    loanStatus: string;
  }> {
    if (!amount || amount <= 0) {
      throw new BadRequestException('Số tiền thanh toán phải lớn hơn 0');
    }

    const loan = await this.findLoanRecord(userId, loanId);
    const operationKey = this.buildPaymentOperationKey(
      BnplPaymentOperationType.REPAYMENT,
      loanId,
      amount,
      repaymentDate,
      idempotencyKey,
    );
    const existingOperation = await this.findPaymentOperation(
      userId,
      loanId,
      BnplPaymentOperationType.REPAYMENT,
      operationKey,
    );
    if (existingOperation?.status === BnplPaymentOperationStatus.SUCCEEDED && existingOperation.responsePayload) {
      return existingOperation.responsePayload as any;
    }
    if (existingOperation?.status === BnplPaymentOperationStatus.PENDING) {
      throw new BadRequestException('Yêu cầu thanh toán đang được xử lý, vui lòng không gửi lại');
    }
    if (existingOperation?.status === BnplPaymentOperationStatus.FAILED) {
      throw new BadRequestException('Yêu cầu thanh toán với mã idempotency này đã thất bại trước đó, hãy dùng mã khác');
    }

    const outstanding = await this.fineractLoanService.getOutstandingBalance(Number(loan.fineractLoanId));
    if (outstanding.totalOutstanding <= 0) {
      throw new BadRequestException('Khoản vay đã được thanh toán hoàn tất');
    }
    if (amount > outstanding.totalOutstanding) {
      throw new BadRequestException('Số tiền thanh toán vượt quá dư nợ còn lại');
    }

    const operation =
      existingOperation ||
      (await this.createPaymentOperation(
        userId,
        loanId,
        BnplPaymentOperationType.REPAYMENT,
        operationKey,
        { amount, repaymentDate },
      ));

    const repaymentDay = this.normalizeIsoDate(repaymentDate);
    let savingsId: number;
    try {
      ({ savingsId } = await this.withdrawFromEWallet(userId, amount, `BNPL repayment for loan ${loanId}`));
    } catch (error: any) {
      await this.finalizePaymentOperation(operation._id, BnplPaymentOperationStatus.FAILED, null, error.message);
      throw error;
    }

    let fineractResult: { success: boolean; resourceId: number; transactionId: number };
    try {
      fineractResult = await this.fineractLoanService.makeRepayment(
        Number(loan.fineractLoanId),
        amount,
        repaymentDay,
        `BNPL repayment for loan ${loanId}`,
      );
    } catch (error: any) {
      await this.refundToEWallet(savingsId, amount, `Rollback BNPL repayment for loan ${loanId}`);
      await this.finalizePaymentOperation(operation._id, BnplPaymentOperationStatus.FAILED, null, error.message);
      throw new BadRequestException(`Thanh toán trên Fineract thất bại: ${error.message}`);
    }

    const updatedOutstanding = await this.fineractLoanService.getOutstandingBalance(Number(loan.fineractLoanId));
    const isClosed = updatedOutstanding.totalOutstanding <= 0;
    const policy = await this.getActivePolicyConfig();
    const currencyMultiples = policy.currencyMultiples || this.configService.get<number>('bnpl.currencyMultiples') || 1000;
    const creditReduction = Math.min(
      roundToCurrency(amount, currencyMultiples),
      roundToCurrency(loan.totalRepayment - loan.paidAmount, currencyMultiples),
    );

    const response = {
      success: true,
      transactionId: fineractResult.transactionId,
      amount,
      date: repaymentDay,
      loanStatus: isClosed ? BnplLoanStatus.CLOSED : BnplLoanStatus.ACTIVE,
    };

    await this.loanModel.updateOne(
      { _id: loan._id },
      {
        $inc: { paidAmount: amount },
        ...(isClosed ? { $set: { status: BnplLoanStatus.CLOSED } } : {}),
      },
    );

    await this.walletModel.updateOne(
      { _id: loan.walletId },
      {
        $inc: {
          usedCredit: -creditReduction,
        },
      },
    );

    await this.finalizePaymentOperation(
      operation._id,
      BnplPaymentOperationStatus.SUCCEEDED,
      response as any,
      undefined,
      fineractResult.transactionId,
    );

    return response;
  }

  async getPrepayAmount(userId: string, loanId: string): Promise<{
    amount: number;
    principalPortion: number;
    interestPortion: number;
    penaltyPortion: number;
    feesPortion: number;
    date: string;
    loanId: string;
    fineractLoanId: string;
    capital: number;
  }> {
    const loan = await this.findLoanRecord(userId, loanId);
    const prepayInfo = await this.fineractLoanService.getPrepaymentAmount(Number(loan.fineractLoanId));
    return {
      ...prepayInfo,
      loanId: loan._id.toString(),
      fineractLoanId: loan.fineractLoanId,
      capital: loan.principal,
    };
  }

  async prepayLoan(
    userId: string,
    loanId: string,
    repaymentDate?: string,
    idempotencyKey?: string,
  ): Promise<{
    success: boolean;
    transactionId: number;
    amount: number;
    date: string;
    loanStatus: string;
    breakdown: { principal: number; interest: number; fees: number; penalty: number };
  }> {
    const loan = await this.findLoanRecord(userId, loanId);
    const operationKey = this.buildPaymentOperationKey(
      BnplPaymentOperationType.PREPAYMENT,
      loanId,
      0,
      repaymentDate,
      idempotencyKey,
    );
    const existingOperation = await this.findPaymentOperation(
      userId,
      loanId,
      BnplPaymentOperationType.PREPAYMENT,
      operationKey,
    );
    if (existingOperation?.status === BnplPaymentOperationStatus.SUCCEEDED && existingOperation.responsePayload) {
      return existingOperation.responsePayload as any;
    }
    if (existingOperation?.status === BnplPaymentOperationStatus.PENDING) {
      throw new BadRequestException('Yêu cầu tất toán đang được xử lý, vui lòng không gửi lại');
    }
    if (existingOperation?.status === BnplPaymentOperationStatus.FAILED) {
      throw new BadRequestException('Yêu cầu tất toán với mã idempotency này đã thất bại trước đó, hãy dùng mã khác');
    }

    const prepayInfo = await this.fineractLoanService.getPrepaymentAmount(Number(loan.fineractLoanId));
    if (!prepayInfo.amount || prepayInfo.amount <= 0) {
      throw new BadRequestException('Khoản vay đã được thanh toán hoàn tất');
    }

    const operation =
      existingOperation ||
      (await this.createPaymentOperation(
        userId,
        loanId,
        BnplPaymentOperationType.PREPAYMENT,
        operationKey,
        { repaymentDate },
      ));

    const repaymentDay = this.normalizeIsoDate(repaymentDate);
    let savingsId: number;
    try {
      ({ savingsId } = await this.withdrawFromEWallet(userId, prepayInfo.amount, `BNPL prepayment for loan ${loanId}`));
    } catch (error: any) {
      await this.finalizePaymentOperation(operation._id, BnplPaymentOperationStatus.FAILED, null, error.message);
      throw error;
    }

    let fineractResult: { success: boolean; resourceId: number; transactionId: number };
    try {
      fineractResult = await this.fineractLoanService.prepayLoan(
        Number(loan.fineractLoanId),
        prepayInfo.amount,
        repaymentDay,
        `BNPL prepayment for loan ${loanId}`,
      );
    } catch (error: any) {
      await this.refundToEWallet(savingsId, prepayInfo.amount, `Rollback BNPL prepayment for loan ${loanId}`);
      await this.finalizePaymentOperation(operation._id, BnplPaymentOperationStatus.FAILED, null, error.message);
      throw new BadRequestException(`Tất toán trên Fineract thất bại: ${error.message}`);
    }

    const policy = await this.getActivePolicyConfig();
    const currencyMultiples = policy.currencyMultiples || this.configService.get<number>('bnpl.currencyMultiples') || 1000;
    const amountToReduce = Math.min(
      roundToCurrency(prepayInfo.amount, currencyMultiples),
      roundToCurrency(loan.totalRepayment - loan.paidAmount, currencyMultiples),
    );

    await this.loanModel.updateOne(
      { _id: loan._id },
      {
        $inc: { paidAmount: prepayInfo.amount },
        $set: { status: BnplLoanStatus.CLOSED },
      },
    );

    await this.walletModel.updateOne(
      { _id: loan.walletId },
      {
        $inc: {
          usedCredit: -amountToReduce,
        },
      },
    );

    const response = {
      success: true,
      transactionId: fineractResult.transactionId,
      amount: prepayInfo.amount,
      date: repaymentDay,
      loanStatus: BnplLoanStatus.CLOSED,
      breakdown: {
        principal: prepayInfo.principalPortion || 0,
        interest: prepayInfo.interestPortion || 0,
        fees: prepayInfo.feesPortion || 0,
        penalty: prepayInfo.penaltyPortion || 0,
      },
    };
    await this.finalizePaymentOperation(
      operation._id,
      BnplPaymentOperationStatus.SUCCEEDED,
      response as any,
      undefined,
      fineractResult.transactionId,
    );

    return response;
  }

  async syncLoanStatus(userId: string, loanId: string): Promise<BnplLoanInfo> {
    const loan = await this.loanModel
      .findOne({
        _id: new Types.ObjectId(loanId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (!loan) {
      throw new NotFoundException('Không tìm thấy khoản vay');
    }

    // Lấy data từ Fineract (source of truth)
    const fineractData = await this.fineractService.getLoanDetails(loan.fineractLoanId);
    const scheduleSummary = fineractData.repaymentSchedule || {};
    const newStatus = this.mapFineractStatus(fineractData.status?.id);
    const newPaidAmount = scheduleSummary.totalRepayment || 0;
    const newTotalInterest = scheduleSummary.totalInterestCharged || 0;
    const newTotalRepayment = scheduleSummary.totalRepaymentExpected || 0;

    // Update local record if changed (chỉ cache, không phải source of truth)
    if (loan.status !== newStatus || loan.paidAmount !== newPaidAmount) {
      await this.loanModel.updateOne(
        { _id: loan._id },
        {
          status: newStatus,
          paidAmount: newPaidAmount,
          totalInterest: newTotalInterest, // Cache từ Fineract
          totalRepayment: newTotalRepayment, // Cache từ Fineract
        },
      );

      // If loan is closed, update wallet credit (giảm usedCredit)
      if (newStatus === BnplLoanStatus.CLOSED && loan.status !== BnplLoanStatus.CLOSED) {
        // Sử dụng totalRepayment từ Fineract để tính chính xác
        const policy = await this.getActivePolicyConfig();
        const currencyMultiples = policy.currencyMultiples || this.configService.get<number>('bnpl.currencyMultiples') || 1000;
        await this.walletModel.updateOne(
          { _id: loan.walletId },
          {
            $inc: {
              usedCredit: -roundToCurrency(newTotalRepayment, currencyMultiples),
            },
          },
        );
      }
    }

    return this.getLoanDetails(userId, loanId);
  }

  /**
   * Map Fineract status ID to our enum
   */
  private mapFineractStatus(statusId: number): BnplLoanStatus {
    switch (statusId) {
      case 100:
        return BnplLoanStatus.PENDING_APPROVAL;
      case 200:
        return BnplLoanStatus.APPROVED;
      case 300:
        return BnplLoanStatus.ACTIVE;
      case 600:
        return BnplLoanStatus.CLOSED;
      case 601:
        return BnplLoanStatus.OVERPAID;
      case 700:
        return BnplLoanStatus.WRITTEN_OFF;
      default:
        return BnplLoanStatus.ACTIVE;
    }
  }

  private toApplicationInfo(application: BnplApplication): BnplApplicationInfo {
    return {
      id: application._id.toString(),
      userId: application.userId?.toString?.() || '',
      status: application.status,
      requestedLimit: application.requestedLimit,
      approvedLimit: application.approvedLimit,
      income: application.income,
      occupation: application.occupation,
      purpose: application.purpose,
      address: application.address,
      requestedTermMonths: application.requestedTermMonths,
      submittedAt: application.submittedAt,
      reviewedAt: application.reviewedAt,
      reviewedBy: application.reviewedBy?.toString?.(),
      signedAt: application.signedAt,
      signatureText: application.signatureText,
      rejectReason: application.rejectReason,
      riskDecision: application.riskDecision,
      riskReasons: application.riskReasons || [],
    };
  }
}
