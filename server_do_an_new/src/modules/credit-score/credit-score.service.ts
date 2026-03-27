import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash } from 'crypto';
import { Cron } from '@nestjs/schedule';
import { CreditScore } from './schemas/credit-score.schema';
import { CreditScoreHistory } from './schemas/credit-score-history.schema';
import { LoanEvaluationConfig } from './schemas/loan-evaluation-config.schema';
import { LoanApplication } from '../loan/schemas/loan-application.schema';
import { User } from '../users/schemas/user.schema';
import { LoanDelinquency } from '../delinquency/entities/loan-delinquency.schema';
import { DelinquencyPolicy } from '../delinquency/entities/delinquency-policy.schema';
import { FineractLoanService } from '../fineract/services/fineract-loan.service';
import { OVERDUE_PENALTY_CHARGE_ID, DEFAULT_OVERDUE_PENALTY_RATE_PER_DAY } from '../fineract/fineract.constants';

const SCORE_MIN = 150;
const SCORE_MAX = 750;
const DEFAULT_CREDIT_SCORE = 570;

type CreditRiskLevel = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';

export interface CreditRiskClassification {
  scoreMin: number;
  scoreMax: number;
  riskLevel: CreditRiskLevel;
  label: string;
  description: string;
}

export interface CreditScoreRepaymentEventInput {
  userId: string | Types.ObjectId;
  isLatePayment: boolean;
  overdueDays?: number;
  isPrepayment?: boolean;
  isLoanClosed?: boolean;
  trigger?: string;
  note?: string;
}

export interface CreditScoreRepaymentEventResult {
  beforeScore: number;
  afterScore: number;
  changeAmount: number;
  reason: CreditScoreHistory['reason'];
  risk: CreditRiskClassification;
  factors: {
    paymentHistory: number;
    debtLevel: number;
    creditAge: number;
    creditMix: number;
    newCredit: number;
  };
}

export interface CreditScoreHistoryPaginationResult {
  items: CreditScoreHistory[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface CreditFactorScores {
  paymentHistory: number;
  debtLevel: number;
  creditAge: number;
  creditMix: number;
  newCredit: number;
}

export interface CreditScoreWeightConfigInput {
  paymentHistory: number;
  debtLevel: number;
  creditAge: number;
  creditMix: number;
  newCredit: number;
}

export interface CreditScoreWeightConfigValue extends CreditScoreWeightConfigInput {
  total: number;
}

export interface CreditGradeInput {
  grade: string;
  label: string;
  minScore: number;
  maxScore: number;
  maxLoanAmount: number;
  baseInterestRate: number;
}

export interface ScoreWeightsInput {
  paymentHistory: number;
  debtLevel: number;
  creditAge: number;
  creditMix: number;
  newCredit: number;
}

export interface LoanEvaluationConfigInput {
  autoRejectScore: number;
  autoApproveScore: number;
  creditGrades: CreditGradeInput[];
  scoreWeights: ScoreWeightsInput;
  changeNote?: string;
}

export interface LoanEvaluationConfigValue {
  version: number;
  autoRejectScore: number;
  autoApproveScore: number;
  creditGrades: CreditGradeInput[];
  scoreWeights: ScoreWeightsInput;
  configHash: string;
  blockchainTxHash: string;
  changedBy?: string;
  changeNote?: string;
  createdAt?: Date;
}

export interface LoanEvaluationConfigHistoryItem extends LoanEvaluationConfigValue {
  _id: string;
}

/**
 * Service xử lý tính toán và quản lý điểm tín dụng (Credit Score).
 * Mô tả thuật toán chấm điểm nội bộ CIC (150-750) dựa trên 5 yếu tố cốt lõi:
 * Lịch sử thanh toán, dư nợ hiện tại, thời gian tín dụng, đa dạng tín dụng và tín dụng mới.
 */
@Injectable()
export class CreditScoreService implements OnModuleInit {
  private readonly logger = new Logger(CreditScoreService.name);
  private readonly defaultWeights: CreditScoreWeightConfigInput = {
    paymentHistory: 35,
    debtLevel: 30,
    creditAge: 15,
    creditMix: 10,
    newCredit: 10,
  };

  private readonly riskTable: CreditRiskClassification[] = [
    {
      scoreMin: 150,
      scoreMax: 321,
      riskLevel: 'VERY_HIGH',
      label: 'Rủi ro rất cao',
      description: 'Không đủ điều kiện vay vốn',
    },
    {
      scoreMin: 322,
      scoreMax: 430,
      riskLevel: 'HIGH',
      label: 'Rủi ro cao',
      description: 'Khả năng trả nợ thấp',
    },
    {
      scoreMin: 431,
      scoreMax: 569,
      riskLevel: 'MEDIUM',
      label: 'Rủi ro trung bình',
      description: 'Có thể vay nhưng điều kiện xét duyệt chặt hơn',
    },
    {
      scoreMin: 570,
      scoreMax: 679,
      riskLevel: 'LOW',
      label: 'Rủi ro thấp',
      description: 'Khả năng trả nợ tốt, điều kiện vay thuận lợi',
    },
    {
      scoreMin: 680,
      scoreMax: 750,
      riskLevel: 'VERY_LOW',
      label: 'Rủi ro rất thấp',
      description: 'Khả năng được duyệt hạn mức cao và lãi suất tốt',
    },
  ];

  constructor(
    @InjectModel(CreditScore.name)
    private readonly creditScoreModel: Model<CreditScore>,
    @InjectModel(CreditScoreHistory.name)
    private readonly creditScoreHistoryModel: Model<CreditScoreHistory>,
    @InjectModel(LoanApplication.name)
    private readonly loanApplicationModel: Model<LoanApplication>,
    @InjectModel(LoanEvaluationConfig.name)
    private readonly loanEvaluationConfigModel: Model<LoanEvaluationConfig>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(LoanDelinquency.name)
    private readonly loanDelinquencyModel: Model<LoanDelinquency>,
    @InjectModel(DelinquencyPolicy.name)
    private readonly delinquencyPolicyModel: Model<DelinquencyPolicy>,
    private readonly fineractLoanService: FineractLoanService,
  ) {}

  async onModuleInit() {
    // Drop legacy key_1 unique index that causes E11000 duplicate key errors
    try {
      await this.loanEvaluationConfigModel.collection.dropIndex('key_1');
      this.logger.log('Dropped legacy key_1 index from loan_evaluation_configs');
    } catch {
      // Index doesn't exist — ignore
    }
  }

  /** Resolve admin MongoDB _id → display name */
  private async resolveAdminName(adminId?: string): Promise<string> {
    if (!adminId) return '';
    try {
      const admin = await this.userModel.findById(adminId).select('profile username').lean();
      if (!admin) return adminId;
      const p = (admin as any).profile;
      if (p?.firstName || p?.lastName) {
        return [p.firstName, p.lastName].filter(Boolean).join(' ');
      }
      return (admin as any).username || adminId;
    } catch {
      return adminId;
    }
  }

  /**
   * Event 2 — Batch Job: Rà quét nợ quá hạn mỗi đêm 0h.
   * Phân loại theo 5 Nhóm Nợ chuẩn CIC:
   *   Nhóm 1 (1-9 ngày):   Trừ nhẹ điểm, vẫn cho vay.
   *   Nhóm 2 (10-29 ngày): Trừ mạnh điểm, ép lãi phạt, giảm hạn mức.
   *   Nhóm 3 (30-89 ngày): Auto-Reject mọi hồ sơ vay mới (5 năm).
   *   Nhóm 4 (90-179 ngày): Blacklist, đóng băng tài khoản.
   *   Nhóm 5 (>=180 ngày): Permanent Ban.
   * Chỉ trừ 1 lần/ngày cho mỗi khoản quá hạn.
   */
  @Cron('0 0 * * *')
  async handleDelinquencyBatchJob() {
    this.logger.log('[delinquency-batch] Starting midnight delinquency scan...');

    // Query cả loans có delinquentDays > 0 VÀ loans có totalOverdue > 0 (fallback khi Fineract trả delinquentDays = 0)
    const overdueLoans = await this.loanApplicationModel
      .find({
        status: 'disbursed',
        $or: [{ delinquentDays: { $gt: 0 } }, { totalOverdue: { $gt: 0 } }],
      })
      .select('_id userId fineractLoanId delinquentDays totalOverdue repaymentSchedule')
      .lean();

    if (!overdueLoans.length) {
      this.logger.log('[delinquency-batch] No overdue loans found.');
      await this.handleRetentionCleanup();
      return;
    }

    // Load delinquency policies (active) để kiểm tra apply_penalty, block_new_loan, etc.
    const policies = await this.delinquencyPolicyModel.find({ is_active: true }).lean();
    const policyByGroup = new Map<number, any>();
    for (const p of policies) {
      const existing = policyByGroup.get(p.debt_group);
      if (!existing || p.apply_penalty || p.block_new_loan || p.freeze_account || p.permanent_ban) {
        policyByGroup.set(p.debt_group, p);
      }
    }

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    let penalized = 0;
    let penaltyChargesApplied = 0;
    for (const loan of overdueLoans) {
      try {
        const uid = loan.userId;

        // Compute overdueDays with fallback from schedule periods
        let overdueDays = Math.max(0, Number(loan.delinquentDays || 0));
        if (overdueDays === 0 && (loan.totalOverdue || 0) > 0) {
          overdueDays = this.computeOverdueDaysFromSchedule(loan.repaymentSchedule);
        }
        if (overdueDays <= 0) continue;

        const alreadyPenalized = await this.creditScoreHistoryModel.findOne({
          userId: uid,
          reason: 'late_payment',
          trigger: 'delinquency_batch',
          note: { $regex: `#${loan.fineractLoanId}` },
          createdAt: { $gte: oneDayAgo },
        });
        if (alreadyPenalized) continue;

        const debtGroup = this.classifyDebtGroup(overdueDays);
        const groupLabel = this.getDebtGroupLabel(debtGroup);
        const policy = policyByGroup.get(debtGroup);

        // ── Fetch existing delinquency record to check if status changed ──
        const existingDelinquency = await this.loanDelinquencyModel
          .findOne({
            fineractLoanId: loan.fineractLoanId,
          })
          .lean();
        const previousDebtGroup = existingDelinquency?.debtGroup ?? 0;
        const previousStatus = existingDelinquency?.status ?? 'normal';

        // ── Upsert LoanDelinquency record ──
        const delinquencyStatus = debtGroup >= 3 ? 'defaulted' : 'overdue';
        const collectionStage =
          debtGroup >= 5
            ? 'legal'
            : debtGroup >= 4
              ? 'collection'
              : debtGroup >= 3
                ? 'warning'
                : debtGroup >= 2
                  ? 'reminder'
                  : 'none';
        await this.loanDelinquencyModel.findOneAndUpdate(
          { fineractLoanId: loan.fineractLoanId },
          {
            $set: {
              loanId: loan._id,
              borrowerId: uid,
              delinquentDays: overdueDays,
              debtGroup,
              overdueAmount: loan.totalOverdue || 0,
              status: delinquencyStatus,
              collectionStage,
              lastSyncedAt: new Date(),
              isDeleted: false,
              resolvedAt: null,
              deletedAt: null,
            },
            $setOnInsert: {
              firstOverdueDate: new Date(),
            },
          },
          { upsert: true, new: true },
        );

        // Cập nhật delinquentDays trên loan_applications nếu Fineract trả 0
        if ((loan.delinquentDays || 0) !== overdueDays) {
          await this.loanApplicationModel.updateOne({ _id: loan._id }, { $set: { delinquentDays: overdueDays } });
        }

        // ── Only recalculate credit score if debtGroup or status changed ──
        const statusChanged = previousStatus !== delinquencyStatus;
        const debtGroupChanged = previousDebtGroup !== debtGroup;
        if (statusChanged || debtGroupChanged) {
          this.logger.log(
            `[delinquency-batch] Loan #${loan.fineractLoanId}: status ${previousStatus}→${delinquencyStatus}, group ${previousDebtGroup}→${debtGroup}. Recalculating credit score.`,
          );
          await this.applyRepaymentEvent({
            userId: uid,
            isLatePayment: true,
            overdueDays,
            isPrepayment: false,
            trigger: 'delinquency_batch',
            note: `Khoản vay #${loan.fineractLoanId} quá hạn ${overdueDays} ngày — ${groupLabel} (nhóm ${previousDebtGroup}→${debtGroup})`,
          });
        } else {
          this.logger.debug(
            `[delinquency-batch] Loan #${loan.fineractLoanId}: no change (group=${debtGroup}, status=${delinquencyStatus}). Skipping credit score recalc.`,
          );
        }

        // ── Apply penalty charge on Fineract if policy says apply_penalty ──
        if (policy?.apply_penalty && loan.fineractLoanId) {
          try {
            await this.applyOverduePenaltyCharge(loan.fineractLoanId, loan.totalOverdue || 0, overdueDays);
            penaltyChargesApplied++;
          } catch (penaltyErr) {
            this.logger.warn(
              `[delinquency-batch] Failed to apply penalty charge for loan #${loan.fineractLoanId}: ${(penaltyErr as Error).message}`,
            );
          }
        }

        // Nhóm 4-5: Đóng băng tài khoản
        if (debtGroup >= 4) {
          await this.userModel.updateOne(
            { _id: uid },
            {
              $set: { 'metadata.accountFrozen': true, 'metadata.frozenReason': `Nợ nhóm ${debtGroup}: ${groupLabel}` },
            },
          );
          this.logger.warn(`[delinquency-batch] FROZEN account for user ${uid} — debt group ${debtGroup}`);
        }

        // Nhóm 5: Permanent Ban
        if (debtGroup >= 5) {
          await this.userModel.updateOne(
            { _id: uid },
            {
              $set: {
                'metadata.permanentBan': true,
                'metadata.banReason': `Nợ có khả năng mất vốn (>=${overdueDays} ngày)`,
              },
            },
          );
          this.logger.warn(`[delinquency-batch] PERMANENT BAN for user ${uid} — debt group 5`);
        }

        penalized++;
      } catch (err) {
        this.logger.warn(`[delinquency-batch] Failed for loan #${loan.fineractLoanId}: ${(err as Error).message}`);
      }
    }

    this.logger.log(
      `[delinquency-batch] Penalized ${penalized}/${overdueLoans.length} overdue loans. Penalty charges applied: ${penaltyChargesApplied}.`,
    );

    // ── Resolve: khoản vay đã trả hết nợ → resolved ──
    const overdueFineractIds = overdueLoans.map(l => l.fineractLoanId).filter((id): id is number => id != null);
    await this.loanDelinquencyModel.updateMany(
      {
        status: { $in: ['overdue', 'defaulted'] } as any,
        isDeleted: false,
        fineractLoanId: { $nin: overdueFineractIds },
      },
      {
        $set: { status: 'resolved', resolvedAt: new Date() },
      },
    );

    // ── Retention cleanup: soft-delete resolved records past retention period ──
    await this.handleRetentionCleanup();
  }

  /**
   * Tính số ngày quá hạn từ lịch trả nợ (repaymentSchedule) khi Fineract trả delinquentDays = 0.
   * Lấy kỳ hạn chưa trả có dueDate lâu nhất so với hôm nay.
   */
  private computeOverdueDaysFromSchedule(repaymentSchedule?: any[] | any): number {
    const periods = Array.isArray(repaymentSchedule) ? repaymentSchedule : repaymentSchedule?.periods || [];
    if (!periods.length) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let maxOverdueDays = 0;

    for (const p of periods) {
      if (p.period == null || Number(p.period) <= 0) continue;
      const complete = p.complete === true || p.obligationsMetOnDate != null;
      if (complete) continue;
      const due = p.dueDate;
      if (!due) continue;
      let dueDate: Date | null = null;
      if (Array.isArray(due) && due.length >= 3) {
        dueDate = new Date(due[0], due[1] - 1, due[2]);
      } else if (typeof due === 'string') {
        dueDate = new Date(due);
      }
      if (dueDate && !isNaN(dueDate.getTime()) && dueDate < today) {
        const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
        if (diffDays > maxOverdueDays) maxOverdueDays = diffDays;
      }
    }
    return maxOverdueDays;
  }

  /**
   * Áp dụng phí phạt trễ hạn lên Fineract cho khoản vay quá hạn.
   * Theo quy định NHNN (Thông tư 39/2016/TT-NHNN):
   *   Lãi suất phạt quá hạn = 150% lãi suất trong hạn (tối đa).
   * Công thức: penaltyAmount = overdueAmount × dailyPenaltyRate × overdueDays
   * Chỉ apply 1 lần/ngày (kiểm tra qua existing charges trên Fineract).
   */
  private async applyOverduePenaltyCharge(
    fineractLoanId: number,
    overdueAmount: number,
    overdueDays: number,
  ): Promise<void> {
    if (overdueAmount <= 0 || overdueDays <= 0) return;

    // Kiểm tra xem đã apply penalty charge hôm nay chưa (qua Fineract loan charges)
    const existingCharges = await this.fineractLoanService.getLoanCharges(fineractLoanId);
    const today = new Date().toISOString().split('T')[0];
    const alreadyAppliedToday = existingCharges.some((c: any) => {
      if (!c.penalty) return false;
      const chargeDue = c.dueDate;
      if (!chargeDue) return false;
      const dueStr = Array.isArray(chargeDue)
        ? `${chargeDue[0]}-${String(chargeDue[1]).padStart(2, '0')}-${String(chargeDue[2]).padStart(2, '0')}`
        : String(chargeDue);
      return dueStr === today;
    });

    if (alreadyAppliedToday) {
      this.logger.debug(
        `[applyOverduePenaltyCharge] Loan #${fineractLoanId}: penalty already applied today. Skipping.`,
      );
      return;
    }

    // Tính tiền phạt: overdueAmount × rate/ngày × số ngày quá hạn (tính theo ngày cuối cùng — incremental)
    // Chỉ tính phạt cho 1 ngày (batch chạy daily), không tính cộng dồn toàn bộ
    let dailyRate = DEFAULT_OVERDUE_PENALTY_RATE_PER_DAY / 100; // 0.05% → 0.0005
    try {
      const chargeConfig = await this.fineractLoanService.getChargeDetails(OVERDUE_PENALTY_CHARGE_ID);
      if (chargeConfig?.amount && chargeConfig.amount > 0) {
        const calcType = chargeConfig.chargeCalculationType?.value?.toLowerCase() || '';
        if (calcType.includes('percent') || calcType.includes('%')) {
          dailyRate = chargeConfig.amount / 100 / 365; // annual rate → daily rate
        }
      }
    } catch {
      this.logger.debug(`[applyOverduePenaltyCharge] Could not fetch charge config, using default rate.`);
    }

    const penaltyAmount = Math.round(overdueAmount * dailyRate);
    if (penaltyAmount <= 0) return;

    const dueDate = today;
    await this.fineractLoanService.addLoanCharge(fineractLoanId, {
      chargeId: OVERDUE_PENALTY_CHARGE_ID,
      amount: penaltyAmount,
      dueDate,
    });

    this.logger.log(
      `[applyOverduePenaltyCharge] Loan #${fineractLoanId}: Applied penalty ${penaltyAmount} VNĐ (overdue=${overdueAmount}, rate=${(dailyRate * 100).toFixed(4)}%/day)`,
    );
  }

  /**
   * Soft-delete hồ sơ nợ xấu đã resolved khi hết thời gian lưu vết (retention_months).
   * isDeleted = true, deletedAt = now. KHÔNG xóa vật lý — luôn giữ audit trail.
   */
  private async handleRetentionCleanup() {
    const resolvedRecords = await this.loanDelinquencyModel
      .find({ status: 'resolved', isDeleted: false, resolvedAt: { $ne: null } })
      .select('debtGroup resolvedAt fineractLoanId')
      .lean();

    if (!resolvedRecords.length) return;

    // Load retention policies by debt_group
    const policies = await this.delinquencyPolicyModel
      .find({ is_active: true })
      .select('debt_group retention_months')
      .lean();
    const retentionMap = new Map<number, number | null>();
    for (const p of policies) {
      retentionMap.set(p.debt_group, p.retention_months ?? null);
    }

    const now = new Date();
    let cleaned = 0;
    for (const rec of resolvedRecords) {
      const retentionMonths = retentionMap.get(rec.debtGroup);
      // null or undefined = vĩnh viễn (permanent) → never soft-delete
      if (retentionMonths == null) continue;

      const expiresAt = new Date(rec.resolvedAt!);
      expiresAt.setMonth(expiresAt.getMonth() + retentionMonths);
      if (now >= expiresAt) {
        await this.loanDelinquencyModel.updateOne({ _id: rec._id }, { $set: { isDeleted: true, deletedAt: now } });
        cleaned++;
        this.logger.log(
          `[retention-cleanup] Soft-deleted delinquency record for loan #${rec.fineractLoanId} (group ${rec.debtGroup}, resolved ${retentionMonths}m ago)`,
        );
      }
    }

    if (cleaned > 0) {
      this.logger.log(`[retention-cleanup] Soft-deleted ${cleaned} expired delinquency records.`);
    }
  }

  /** Phân loại nhóm nợ theo số ngày trễ — chuẩn CIC */
  private classifyDebtGroup(overdueDays: number): number {
    if (overdueDays >= 180) return 5;
    if (overdueDays >= 90) return 4;
    if (overdueDays >= 30) return 3;
    if (overdueDays >= 10) return 2;
    return 1;
  }

  private getDebtGroupLabel(group: number): string {
    switch (group) {
      case 1:
        return 'Nhóm 1 — Nợ đủ tiêu chuẩn (1-9 ngày)';
      case 2:
        return 'Nhóm 2 — Nợ cần chú ý (10-29 ngày)';
      case 3:
        return 'Nhóm 3 — Nợ dưới tiêu chuẩn (30-89 ngày)';
      case 4:
        return 'Nhóm 4 — Nợ nghi ngờ (90-179 ngày)';
      case 5:
        return 'Nhóm 5 — Nợ có khả năng mất vốn (≥180 ngày)';
      default:
        return `Nhóm ${group}`;
    }
  }

  /**
   * Event 3 — Khoản vay giải ngân: Debt Level và New Credit thay đổi.
   * Tính lại điểm dựa trên toàn bộ dữ liệu hiện tại (neutral event).
   */
  async applyDisbursementEvent(userId: string | Types.ObjectId): Promise<{
    beforeScore: number;
    afterScore: number;
    changeAmount: number;
  }> {
    const uid = this.toObjectId(userId);
    const scoreDoc = await this.ensureCreditScoreForUser(uid);
    const beforeScore = scoreDoc.score;

    const factors = await this.buildWeightedFactors(uid, {
      userId: uid,
      isLatePayment: false,
      isPrepayment: false,
      overdueDays: 0,
    });
    const weights = await this.getWeightConfig();
    const afterScore = this.calculateCompositeScore(factors, weights);

    scoreDoc.score = afterScore;
    scoreDoc.factors = { ...factors };
    scoreDoc.totalLoans = await this.loanApplicationModel.countDocuments({ userId: uid });
    scoreDoc.lastUpdated = new Date();
    await scoreDoc.save();

    await this.creditScoreHistoryModel.create({
      userId: uid,
      creditScoreId: scoreDoc._id,
      beforeScore,
      afterScore,
      changeAmount: afterScore - beforeScore,
      reason: 'system_recalculation',
      trigger: 'loan_disbursed',
      factors: { ...factors },
      note: `Khoản vay mới giải ngân — cập nhật Dư nợ & Tín dụng mới | ${this.buildFactorNote(factors)}`,
    });

    this.logger.log(
      `[applyDisbursementEvent] user=${uid.toString()} score ${beforeScore} -> ${afterScore} (${afterScore - beforeScore})`,
    );

    return { beforeScore, afterScore, changeAmount: afterScore - beforeScore };
  }

  /**
   * Lấy trọng số tính điểm từ LoanEvaluationConfig (version cao nhất).
   * Nếu chưa có config → dùng default weights.
   */
  async getWeightConfig(): Promise<CreditScoreWeightConfigValue> {
    const doc = await this.loanEvaluationConfigModel.findOne().sort({ version: -1 }).lean();
    if (doc?.scoreWeights) {
      const w = doc.scoreWeights;
      const total =
        (w.paymentHistory || 0) + (w.debtLevel || 0) + (w.creditAge || 0) + (w.creditMix || 0) + (w.newCredit || 0);
      return {
        paymentHistory: w.paymentHistory || 0,
        debtLevel: w.debtLevel || 0,
        creditAge: w.creditAge || 0,
        creditMix: w.creditMix || 0,
        newCredit: w.newCredit || 0,
        total,
      };
    }
    const dw = this.defaultWeights;
    return { ...dw, total: dw.paymentHistory + dw.debtLevel + dw.creditAge + dw.creditMix + dw.newCredit };
  }

  private toObjectId(userId: string | Types.ObjectId): Types.ObjectId {
    return typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
  }

  private clampScore(score: number): number {
    return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(score)));
  }

  private clampPercent(value: number): number {
    return Math.max(0, Math.min(100, value));
  }

  private scoreFromDebtRatio(debtRatio: number): number {
    if (debtRatio <= 0.3) return 95;
    if (debtRatio <= 0.5) return 80;
    if (debtRatio <= 0.7) return 65;
    if (debtRatio <= 1.0) return 45;
    return 25;
  }

  private scoreFromCreditAgeMonths(ageMonths: number): number {
    if (ageMonths >= 36) return 95;
    if (ageMonths >= 24) return 85;
    if (ageMonths >= 12) return 70;
    if (ageMonths >= 6) return 55;
    return 40;
  }

  private scoreFromRecentLoanCount(recentLoanCount: number): number {
    if (recentLoanCount <= 0) return 95;
    if (recentLoanCount === 1) return 80;
    if (recentLoanCount === 2) return 65;
    if (recentLoanCount === 3) return 45;
    return 25;
  }

  private scoreFromCreditMix(uniqueProductCount: number, hasClosedLoan: boolean): number {
    let score = 50;
    if (uniqueProductCount >= 3) score += 30;
    else if (uniqueProductCount === 2) score += 20;
    else if (uniqueProductCount === 1) score += 10;

    if (hasClosedLoan) score += 15;
    return this.clampPercent(score);
  }

  private calculateCompositeScore(factors: CreditFactorScores, weights: CreditScoreWeightConfigValue): number {
    const weighted100 =
      factors.paymentHistory * (weights.paymentHistory / 100) +
      factors.debtLevel * (weights.debtLevel / 100) +
      factors.creditAge * (weights.creditAge / 100) +
      factors.creditMix * (weights.creditMix / 100) +
      factors.newCredit * (weights.newCredit / 100);

    return this.clampScore(SCORE_MIN + (weighted100 / 100) * (SCORE_MAX - SCORE_MIN));
  }

  private buildFactorNote(factors: CreditFactorScores): string {
    return `F(payment=${factors.paymentHistory.toFixed(1)}, debt=${factors.debtLevel.toFixed(1)}, age=${factors.creditAge.toFixed(1)}, mix=${factors.creditMix.toFixed(1)}, new=${factors.newCredit.toFixed(1)})`;
  }

  private async buildWeightedFactors(
    userId: Types.ObjectId,
    input: CreditScoreRepaymentEventInput,
  ): Promise<CreditFactorScores> {
    const [loanDocs, repaymentEventCount] = await Promise.all([
      this.loanApplicationModel
        .find({ userId })
        .select('capital totalOutstanding productId status createdAt delinquentDays')
        .lean(),
      this.creditScoreHistoryModel.countDocuments({
        userId,
        reason: { $in: ['loan_repayment', 'loan_prepayment', 'late_payment'] },
      }),
    ]);

    const totalCapital = loanDocs.reduce((acc, loan: any) => acc + Number(loan?.capital || 0), 0);
    const totalOutstanding = loanDocs.reduce((acc, loan: any) => acc + Number(loan?.totalOutstanding || 0), 0);
    const debtRatio = totalCapital > 0 ? totalOutstanding / totalCapital : 0;

    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const recentLoanCount = loanDocs.filter((loan: any) => {
      const createdAt = new Date(loan?.createdAt || 0).getTime();
      return createdAt > 0 && now - createdAt <= ninetyDaysMs;
    }).length;

    const oldestLoanTime = loanDocs
      .map((loan: any) => new Date(loan?.createdAt || 0).getTime())
      .filter((t: number) => t > 0)
      .sort((a: number, b: number) => a - b)[0];
    const ageMonths = oldestLoanTime ? Math.max(0, (now - oldestLoanTime) / (30 * 24 * 60 * 60 * 1000)) : 0;

    const uniqueProductCount = new Set(loanDocs.map((loan: any) => String(loan?.productId || ''))).size;
    const hasClosedLoan = loanDocs.some((loan: any) => String(loan?.status || '').toLowerCase() === 'closed');

    const severeLateCount = loanDocs.filter((loan: any) => Number(loan?.delinquentDays || 0) >= 30).length;
    const historicalLateCount = Math.max(0, Number(repaymentEventCount || 0));
    const denominator = Math.max(1, historicalLateCount + (input.isLatePayment ? 1 : 0) + 2);
    const lateRatio = (historicalLateCount + (input.isLatePayment ? 1 : 0)) / denominator;

    let paymentScore = 100 - lateRatio * 80 - severeLateCount * 4;
    if (input.isLatePayment) {
      paymentScore -= Math.min(25, Math.max(6, Number(input.overdueDays || 0) * 1.2));
    } else {
      paymentScore += input.isPrepayment ? 5 : 3;
    }

    // ── Volume Penalty Factor (Thin Credit File Protection) ──
    // Người dùng có ít giao dịch không thể được 100/100 ngay.
    // Level 1: 1-4 giao dịch  → W = 0.60 (tối đa 60/100)
    // Level 2: 5-10 giao dịch → W = 0.80 (tối đa 80/100)
    // Level 3: >10 giao dịch  → W = 1.00 (toàn bộ 100/100)
    const totalTransactions = loanDocs.length;
    let volumePenalty = 1.0;
    if (totalTransactions <= 4) {
      volumePenalty = 0.6;
    } else if (totalTransactions <= 10) {
      volumePenalty = 0.8;
    }
    paymentScore *= volumePenalty;

    return {
      paymentHistory: this.clampPercent(paymentScore),
      debtLevel: this.scoreFromDebtRatio(debtRatio),
      creditAge: this.scoreFromCreditAgeMonths(ageMonths),
      creditMix: this.scoreFromCreditMix(uniqueProductCount, hasClosedLoan),
      newCredit: this.scoreFromRecentLoanCount(recentLoanCount),
    };
  }

  classifyRisk(score: number): CreditRiskClassification {
    const clamped = this.clampScore(score);
    return (
      this.riskTable.find(item => clamped >= item.scoreMin && clamped <= item.scoreMax) ||
      this.riskTable[this.riskTable.length - 1]
    );
  }

  async ensureCreditScoreForUser(userId: string | Types.ObjectId): Promise<CreditScore> {
    const uid = this.toObjectId(userId);

    const existing = await this.creditScoreModel.findOne({ userId: uid });
    if (existing) {
      const normalizedScore = this.clampScore(existing.score);
      if (normalizedScore !== existing.score) {
        const beforeScore = existing.score;
        existing.score = normalizedScore;
        existing.lastUpdated = new Date();
        await existing.save();

        await this.creditScoreHistoryModel.create({
          userId: uid,
          creditScoreId: existing._id,
          beforeScore,
          afterScore: normalizedScore,
          changeAmount: normalizedScore - beforeScore,
          reason: 'system_recalculation',
          trigger: 'credit_score_migration',
          note: 'Chuẩn hóa điểm cũ về thang CIC nội bộ 150-750',
        });
      }

      return existing;
    }

    const created = await this.creditScoreModel.create({
      userId: uid,
      score: DEFAULT_CREDIT_SCORE,
      totalLoans: 0,
      latePayments: 0,
      lastUpdated: new Date(),
    });

    await this.creditScoreHistoryModel.create({
      userId: uid,
      creditScoreId: created._id,
      beforeScore: null,
      afterScore: created.score,
      changeAmount: 0,
      reason: 'initial_account_creation',
      trigger: 'system',
      note: 'Khởi tạo điểm tín dụng theo thang CIC nội bộ (150-750)',
    });

    this.logger.log(`[ensureCreditScoreForUser] Created initial credit score for user ${uid.toString()}`);
    return created;
  }

  async getByUserId(userId: string | Types.ObjectId): Promise<CreditScore | null> {
    const uid = this.toObjectId(userId);
    return this.creditScoreModel.findOne({ userId: uid }).lean() as any;
  }

  async getHistoryByUserId(userId: string | Types.ObjectId, limit = 20): Promise<CreditScoreHistory[]> {
    const uid = this.toObjectId(userId);
    const safeLimit = Math.max(1, Math.min(100, limit));

    return this.creditScoreHistoryModel.find({ userId: uid }).sort({ createdAt: -1 }).limit(safeLimit).lean() as any;
  }

  async getHistoryPageByUserId(
    userId: string | Types.ObjectId,
    page = 1,
    limit = 20,
  ): Promise<CreditScoreHistoryPaginationResult> {
    const uid = this.toObjectId(userId);
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      this.creditScoreHistoryModel.find({ userId: uid }).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      this.creditScoreHistoryModel.countDocuments({ userId: uid }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / safeLimit));

    return {
      items: items as any,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
      hasNextPage: safePage < totalPages,
    };
  }

  async applyRepaymentEvent(input: CreditScoreRepaymentEventInput): Promise<CreditScoreRepaymentEventResult> {
    const uid = this.toObjectId(input.userId);
    const scoreDoc = await this.ensureCreditScoreForUser(uid);

    const overdueDays = Math.max(0, Number(input.overdueDays || 0));
    const isLatePayment = !!input.isLatePayment;
    const isPrepayment = !!input.isPrepayment;
    const factors = await this.buildWeightedFactors(uid, input);
    const weights = await this.getWeightConfig();

    const beforeScore = scoreDoc.score;
    const afterScore = this.calculateCompositeScore(factors, weights);

    const reason: CreditScoreHistory['reason'] = isLatePayment
      ? 'late_payment'
      : isPrepayment
        ? 'loan_prepayment'
        : 'loan_repayment';

    scoreDoc.score = afterScore;
    scoreDoc.factors = { ...factors };
    if (isLatePayment) {
      scoreDoc.latePayments = (scoreDoc.latePayments || 0) + 1;
    }
    scoreDoc.totalLoans = await this.loanApplicationModel.countDocuments({ userId: uid });
    scoreDoc.lastUpdated = new Date();
    await scoreDoc.save();

    await this.creditScoreHistoryModel.create({
      userId: uid,
      creditScoreId: scoreDoc._id,
      beforeScore,
      afterScore,
      changeAmount: afterScore - beforeScore,
      reason,
      trigger: input.trigger || 'loan_service',
      factors: { ...factors },
      note: `${
        input.note ||
        (isLatePayment
          ? `Giao dịch trả nợ trễ hạn ${overdueDays} ngày`
          : isPrepayment
            ? 'Tất toán trước hạn hoặc trả vượt kế hoạch'
            : 'Giao dịch trả nợ đúng hạn')
      } | ${this.buildFactorNote(factors)}`,
    });

    const risk = this.classifyRisk(afterScore);

    this.logger.log(
      `[applyRepaymentEvent] user=${uid.toString()} reason=${reason} score ${beforeScore} -> ${afterScore} (${afterScore - beforeScore})`,
    );

    return {
      beforeScore,
      afterScore,
      changeAmount: afterScore - beforeScore,
      reason,
      risk,
      factors,
    };
  }

  /**
   * Tính lại điểm tín dụng cho user dựa trên toàn bộ dữ liệu hiện tại.
   * Gọi từ mobile app hoặc hệ thống để refresh score.
   */
  async recalculateScore(userId: string | Types.ObjectId): Promise<{
    score: number;
    factors: CreditFactorScores;
    risk: CreditRiskClassification;
  }> {
    const uid = this.toObjectId(userId);
    const scoreDoc = await this.ensureCreditScoreForUser(uid);
    const beforeScore = scoreDoc.score;

    // Build factors from current loan data (neutral event — not late, not prepay)
    const factors = await this.buildWeightedFactors(uid, {
      userId: uid,
      isLatePayment: false,
      isPrepayment: false,
      overdueDays: 0,
    });
    const weights = await this.getWeightConfig();
    const afterScore = this.calculateCompositeScore(factors, weights);

    scoreDoc.score = afterScore;
    scoreDoc.factors = { ...factors };
    scoreDoc.totalLoans = await this.loanApplicationModel.countDocuments({ userId: uid });
    scoreDoc.lastUpdated = new Date();
    await scoreDoc.save();

    if (afterScore !== beforeScore) {
      await this.creditScoreHistoryModel.create({
        userId: uid,
        creditScoreId: scoreDoc._id,
        beforeScore,
        afterScore,
        changeAmount: afterScore - beforeScore,
        reason: 'system_recalculation',
        trigger: 'recalculate_api',
        factors: { ...factors },
        note: `Tính lại điểm tín dụng | ${this.buildFactorNote(factors)}`,
      });
    }

    return { score: afterScore, factors, risk: this.classifyRisk(afterScore) };
  }

  /**
   * Chuẩn hóa điểm từ thang 150-750 về thang 0-100 để so sánh với Rule Engine.
   */
  private normalizeScore(rawScore: number): number {
    return Math.round(((rawScore - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100);
  }

  // ══════════════════════════════════════════════════════════════
  // LOAN EVALUATION CONFIG — Rule Engine cấu hình đánh giá khoản vay
  // ══════════════════════════════════════════════════════════════

  private readonly defaultLoanEvalConfig: LoanEvaluationConfigInput = {
    autoRejectScore: 40,
    autoApproveScore: 80,
    creditGrades: [
      {
        grade: 'A',
        label: 'Rủi ro cực thấp',
        minScore: 80,
        maxScore: 100,
        maxLoanAmount: 100_000_000,
        baseInterestRate: 12,
      },
      {
        grade: 'B',
        label: 'Rủi ro trung bình',
        minScore: 60,
        maxScore: 79,
        maxLoanAmount: 50_000_000,
        baseInterestRate: 15,
      },
      { grade: 'C', label: 'Rủi ro cao', minScore: 40, maxScore: 59, maxLoanAmount: 20_000_000, baseInterestRate: 18 },
    ],
    scoreWeights: { paymentHistory: 35, debtLevel: 30, creditAge: 15, creditMix: 10, newCredit: 10 },
  };

  /** Tính SHA-256 hash cho toàn bộ payload config (dùng để verify trên blockchain). */
  private computeConfigHash(input: LoanEvaluationConfigInput): string {
    const payload = JSON.stringify({
      autoRejectScore: input.autoRejectScore,
      autoApproveScore: input.autoApproveScore,
      creditGrades: input.creditGrades,
      scoreWeights: input.scoreWeights,
    });
    return createHash('sha256').update(payload).digest('hex');
  }

  private validateLoanEvalConfig(input: LoanEvaluationConfigInput): void {
    const { autoRejectScore, autoApproveScore, creditGrades, scoreWeights } = input;

    // Validate thresholds
    if (!Number.isFinite(autoRejectScore) || autoRejectScore < 0 || autoRejectScore > 100) {
      throw new BadRequestException('Ngưỡng từ chối tự động phải từ 0 đến 100');
    }
    if (!Number.isFinite(autoApproveScore) || autoApproveScore < 0 || autoApproveScore > 100) {
      throw new BadRequestException('Ngưỡng duyệt tự động phải từ 0 đến 100');
    }
    if (autoRejectScore >= autoApproveScore) {
      throw new BadRequestException('Ngưỡng từ chối phải nhỏ hơn ngưỡng duyệt tự động');
    }

    // Validate credit grades
    if (!Array.isArray(creditGrades) || creditGrades.length === 0) {
      throw new BadRequestException('Phải có ít nhất 1 hạng tín dụng');
    }
    const sorted = [...creditGrades].sort((a, b) => b.maxScore - a.maxScore);
    for (let i = 0; i < sorted.length; i++) {
      const g = sorted[i];
      if (g.minScore > g.maxScore) {
        throw new BadRequestException(`Hạng ${g.grade}: Điểm tối thiểu phải <= tối đa`);
      }
      if (g.maxLoanAmount < 0) {
        throw new BadRequestException(`Hạng ${g.grade}: Hạn mức phải >= 0`);
      }
      if (g.baseInterestRate < 0 || g.baseInterestRate > 100) {
        throw new BadRequestException(`Hạng ${g.grade}: Lãi suất phải từ 0-100%`);
      }
      // Check no gaps / overlaps between adjacent grades
      if (i > 0) {
        const prev = sorted[i - 1];
        if (g.maxScore !== prev.minScore - 1) {
          throw new BadRequestException(
            `Dải điểm bị hổng hoặc chồng lấn giữa hạng ${prev.grade} (${prev.minScore}-${prev.maxScore}) và ${g.grade} (${g.minScore}-${g.maxScore})`,
          );
        }
      }
    }
    // Top grade must reach autoApproveScore, bottom grade must reach autoRejectScore
    if (sorted[0].maxScore !== 100) {
      throw new BadRequestException('Hạng cao nhất phải có điểm tối đa = 100');
    }
    if (sorted[sorted.length - 1].minScore !== autoRejectScore) {
      throw new BadRequestException(`Hạng thấp nhất phải bắt đầu từ ngưỡng từ chối (${autoRejectScore})`);
    }

    // Validate score weights sum = 100
    if (!scoreWeights) {
      throw new BadRequestException('Thiếu cấu hình trọng số');
    }
    const wSum =
      (scoreWeights.paymentHistory || 0) +
      (scoreWeights.debtLevel || 0) +
      (scoreWeights.creditAge || 0) +
      (scoreWeights.creditMix || 0) +
      (scoreWeights.newCredit || 0);
    if (wSum !== 100) {
      throw new BadRequestException(`Tổng trọng số phải = 100% (hiện tại: ${wSum}%)`);
    }
    for (const [key, val] of Object.entries(scoreWeights)) {
      if (!Number.isFinite(val) || val < 0 || val > 100) {
        throw new BadRequestException(`Trọng số ${key} phải từ 0 đến 100`);
      }
    }
  }

  async getLoanEvaluationConfig(): Promise<LoanEvaluationConfigValue> {
    const doc = await this.loanEvaluationConfigModel.findOne().sort({ version: -1 }).lean();
    if (!doc) {
      return {
        version: 0,
        ...this.defaultLoanEvalConfig,
        configHash: this.computeConfigHash(this.defaultLoanEvalConfig),
        blockchainTxHash: '',
      };
    }
    return {
      version: doc.version,
      autoRejectScore: doc.autoRejectScore,
      autoApproveScore: doc.autoApproveScore,
      creditGrades: doc.creditGrades,
      scoreWeights: doc.scoreWeights,
      configHash: doc.configHash,
      blockchainTxHash: doc.blockchainTxHash || '',
      changedBy: doc.changedBy,
      changeNote: doc.changeNote,
      createdAt: (doc as any).createdAt,
    };
  }

  async createLoanEvaluationConfig(
    input: LoanEvaluationConfigInput,
    adminId?: string,
  ): Promise<LoanEvaluationConfigValue> {
    this.validateLoanEvalConfig(input);

    // Tìm version cao nhất hiện tại
    const latest = await this.loanEvaluationConfigModel.findOne().sort({ version: -1 }).lean();
    const nextVersion = (latest?.version ?? 0) + 1;

    const configHash = this.computeConfigHash(input);
    const adminName = await this.resolveAdminName(adminId);

    // INSERT-only: tạo document mới, không bao giờ update document cũ
    const created = await this.loanEvaluationConfigModel.create({
      version: nextVersion,
      autoRejectScore: input.autoRejectScore,
      autoApproveScore: input.autoApproveScore,
      creditGrades: input.creditGrades,
      scoreWeights: input.scoreWeights,
      configHash,
      blockchainTxHash: '',
      changedBy: adminName || adminId,
      changeNote: input.changeNote || `Cấu hình phiên bản ${nextVersion}`,
    });

    this.logger.log(
      `[createLoanEvaluationConfig] v${nextVersion} by admin=${adminId} hash=${configHash.slice(0, 16)}…`,
    );

    return {
      version: created.version,
      autoRejectScore: created.autoRejectScore,
      autoApproveScore: created.autoApproveScore,
      creditGrades: created.creditGrades,
      scoreWeights: created.scoreWeights,
      configHash: created.configHash,
      blockchainTxHash: created.blockchainTxHash || '',
      changedBy: created.changedBy,
      changeNote: created.changeNote,
      createdAt: (created as any).createdAt,
    };
  }

  async getLoanEvaluationConfigHistory(
    page = 1,
    limit = 20,
  ): Promise<{ items: LoanEvaluationConfigHistoryItem[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.loanEvaluationConfigModel.find().sort({ version: -1 }).skip(skip).limit(limit).lean(),
      this.loanEvaluationConfigModel.countDocuments(),
    ]);

    // Resolve admin names for records that still store raw ObjectId
    const resolvedItems = await Promise.all(
      items.map(async (doc: any) => {
        let displayName = doc.changedBy ?? '';
        // If changedBy looks like a MongoDB ObjectId (24 hex chars), resolve to name
        if (displayName && /^[a-f0-9]{24}$/i.test(displayName)) {
          displayName = await this.resolveAdminName(displayName);
        }
        return {
          _id: doc._id.toString(),
          version: doc.version ?? 0,
          autoRejectScore: doc.autoRejectScore ?? doc.autoRejectThreshold ?? null,
          autoApproveScore: doc.autoApproveScore ?? doc.autoApprovalScore ?? doc.autoApproveThreshold ?? null,
          creditGrades: doc.creditGrades ?? [],
          scoreWeights: doc.scoreWeights ?? null,
          configHash: doc.configHash ?? '',
          blockchainTxHash: doc.blockchainTxHash || '',
          changedBy: displayName,
          changeNote: doc.changeNote ?? (doc.key ? `Legacy config (key=${doc.key})` : ''),
          createdAt: doc.createdAt,
        };
      }),
    );

    return {
      items: resolvedItems,
      total,
      page,
      limit,
    };
  }

  /**
   * Đánh giá khoản vay dựa trên điểm tín dụng và cấu hình Rule Engine hiện tại.
   * Trả về: hạng tín dụng, hạn mức, lãi suất, trạng thái tự động, version cấu hình.
   */
  async evaluateLoanByScore(creditScore: number): Promise<{
    decision: 'auto_approved' | 'pending_review' | 'auto_rejected';
    grade?: string;
    gradeLabel?: string;
    maxLoanAmount: number;
    baseInterestRate: number;
    creditScore: number;
    normalizedScore: number;
    configVersion: number;
  }> {
    const config = await this.getLoanEvaluationConfig();
    // Rule Engine operates on 0-100 scale; credit scores are 150-750
    const norm = this.normalizeScore(creditScore);

    // Auto-reject
    if (norm < config.autoRejectScore) {
      return {
        decision: 'auto_rejected',
        maxLoanAmount: 0,
        baseInterestRate: 0,
        creditScore,
        normalizedScore: norm,
        configVersion: config.version,
      };
    }

    // Tìm grade phù hợp
    const sorted = [...config.creditGrades].sort((a, b) => b.maxScore - a.maxScore);
    const matched = sorted.find(g => norm >= g.minScore && norm <= g.maxScore);

    const decision = norm >= config.autoApproveScore ? 'auto_approved' : 'pending_review';

    if (matched) {
      return {
        decision,
        grade: matched.grade,
        gradeLabel: matched.label,
        maxLoanAmount: matched.maxLoanAmount,
        baseInterestRate: matched.baseInterestRate,
        creditScore,
        normalizedScore: norm,
        configVersion: config.version,
      };
    }

    // Fallback — score nằm ngoài tất cả grades (shouldn't happen with valid config)
    return {
      decision: 'pending_review',
      maxLoanAmount: 0,
      baseInterestRate: 0,
      creditScore,
      normalizedScore: norm,
      configVersion: config.version,
    };
  }
}
