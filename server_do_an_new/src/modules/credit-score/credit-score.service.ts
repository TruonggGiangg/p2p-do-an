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
import { FabricService } from '../fabric/fabric.service';

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

// ══════════════════════════════════════════════════════════════════
//  SCORECARD 2.0 — WOE + Logistic Regression Interfaces
// ══════════════════════════════════════════════════════════════════

/** Một bin trong WOE binning: [min, max) → woe */
interface WoeBin {
  /** Inclusive lower bound (dùng -Infinity cho bin đầu tiên) */
  min: number;
  /** Exclusive upper bound (dùng +Infinity cho bin cuối cùng) */
  max: number;
  /** Giá trị WOE: dương = an toàn, âm = rủi ro */
  woe: number;
  /** Nhãn hiển thị */
  label?: string;
}

interface ScorecardCoefficients {
  paymentHistory: number;
  debtLevel: number;
  creditAge: number;
  creditMix: number;
  newCredit: number;
}

/** Tham số Scorecard 2.0 (WOE + Logistic Regression) */
interface ScorecardParams {
  /** Points to Double the Odds — số điểm cần thiết để Odds tăng gấp đôi */
  pdo: number;
  /** Điểm cơ sở tương ứng với baseOdds */
  baseScore: number;
  /** Tỷ lệ Odds tham chiếu tại baseScore */
  baseOdds: number;
  /** Hệ số chặn β₀ (logistic regression intercept) */
  intercept: number;
  /** Hệ số hồi quy βᵢ cho từng tiêu chí */
  coefficients: ScorecardCoefficients;
  /** WOE bin definitions cho từng tiêu chí */
  woeBins: {
    paymentHistory: WoeBin[];
    debtLevel: WoeBin[];
    creditAge: WoeBin[];
    creditMix: WoeBin[];
    newCredit: WoeBin[];
  };
}

/** Giá trị thô của 5 tiêu chí, trước khi qua WOE binning */
interface RawFeatureValues {
  /** Điểm thanh toán 0-100 (sau penalty + thin-file cap) */
  paymentScore: number;
  /** Tỷ lệ sử dụng tín dụng (0-1+) */
  utilizationRatio: number;
  /** User có hồ sơ tín dụng (disbursed/closed) hay chưa */
  hasCreditHistory: boolean;
  /** Số tháng tín dụng (tính từ khoản vay đầu tiên) */
  ageMonths: number;
  /** Số sản phẩm vay duy nhất */
  uniqueProducts: number;
  /** Số khoản vay mới trong 90 ngày */
  recentLoans: number;
}

/** Kết quả tính điểm Scorecard 2.0 */
interface ScoringResult {
  /** Điểm thành phần 0-100 cho hiển thị (backward compatible) */
  factors: CreditFactorScores;
  /** Điểm CIC 150-750 từ WOE + Logistic Regression */
  scorecardScore: number;
  /** Giá trị thô của 5 tiêu chí */
  rawFeatures: RawFeatureValues;
}

/**
 * Service xử lý tính toán và quản lý điểm tín dụng (Credit Score).
 *
 * Mô hình Scorecard 2.0 (WOE + Logistic Regression):
 * - Feature Engineering: trích xuất 5 tiêu chí (Payment History, Debt Level,
 *   Credit Age, Credit Mix, New Credit) từ dữ liệu nền tảng.
 * - WOE Binning: map raw values → WOE values thông qua các bins đã calibrate.
 * - Logistic Regression: logit(P) = β₀ + Σ(βᵢ × WOEᵢ) → Odds.
 * - Scorecard Conversion: Score = Offset - Factor × logit(P).
 * - Output: Điểm CIC nội bộ 150-750.
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

  /**
   * ═══════════════════════════════════════════════════════════════
   *  SCORECARD 2.0 — WOE Bins + Logistic Regression Coefficients
   * ═══════════════════════════════════════════════════════════════
   *
   * Calibrated để Score range ≈ 150-740 trên thang CIC.
   * βᵢ (coefficients) < 0: WOE dương → giảm logit(P) → tăng điểm.
   * Trọng số tương đối: PH(35%), DL(30%), CA(15%), CM(10%), NC(10%).
   *
   * Công thức:
   *   Factor = pdo / ln(2)
   *   Offset = baseScore - Factor × ln(baseOdds)
   *   logit(P) = β₀ + Σ(βᵢ × WOEᵢ)
   *   Score = Offset - Factor × logit(P)
   */
  private readonly defaultScorecardParams: ScorecardParams = {
    pdo: 40,
    baseScore: 450,
    baseOdds: 1.0,
    intercept: 0,
    coefficients: {
      paymentHistory: -1.651,
      debtLevel: -1.415,
      creditAge: -0.708,
      creditMix: -0.472,
      newCredit: -0.472,
    },
    woeBins: {
      // Payment History: rawPaymentScore (0-100), cao = tốt
      paymentHistory: [
        { min: 85, max: Infinity, woe: 1.2, label: 'Xuất sắc' },
        { min: 70, max: 85, woe: 0.7, label: 'Tốt' },
        { min: 55, max: 70, woe: 0.2, label: 'Khá' },
        { min: 35, max: 55, woe: -0.3, label: 'Trung bình' },
        { min: 15, max: 35, woe: -0.8, label: 'Yếu' },
        { min: -Infinity, max: 15, woe: -1.5, label: 'Rất yếu' },
      ],
      // Debt Level: CUR (0-1+), thấp = tốt
      debtLevel: [
        { min: -Infinity, max: 0.1, woe: 1.1, label: 'Rất thấp' },
        { min: 0.1, max: 0.3, woe: 0.6, label: 'Thấp — Lý tưởng' },
        { min: 0.3, max: 0.5, woe: 0.0, label: 'Trung bình' },
        { min: 0.5, max: 0.7, woe: -0.5, label: 'Cảnh giác' },
        { min: 0.7, max: 0.9, woe: -1.0, label: 'Cao' },
        { min: 0.9, max: Infinity, woe: -1.6, label: 'Khát vốn' },
      ],
      // Credit Age: tháng, cao = tốt
      creditAge: [
        { min: 36, max: Infinity, woe: 1.0, label: 'Lão làng' },
        { min: 12, max: 36, woe: 0.5, label: 'Lâu năm' },
        { min: 6, max: 12, woe: 0.0, label: 'Trung bình' },
        { min: 3, max: 6, woe: -0.5, label: 'Mới' },
        { min: -Infinity, max: 3, woe: -1.2, label: 'Tân binh' },
      ],
      // Credit Mix: số product duy nhất, cao = tốt
      creditMix: [
        { min: 3, max: Infinity, woe: 0.8, label: 'Đa dạng cao' },
        { min: 2, max: 3, woe: 0.3, label: 'Đa dạng trung bình' },
        { min: 1, max: 2, woe: -0.3, label: 'Đơn loại' },
        { min: -Infinity, max: 1, woe: -0.9, label: 'Không có' },
      ],
      // New Credit: số khoản vay mới 90 ngày, thấp = tốt
      newCredit: [
        { min: -Infinity, max: 1, woe: 0.8, label: 'Ổn định' },
        { min: 1, max: 2, woe: 0.2, label: 'Bình thường' },
        { min: 2, max: 3, woe: -0.5, label: 'Cảnh giác' },
        { min: 3, max: Infinity, woe: -1.2, label: 'Khát vốn' },
      ],
    },
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
    private readonly fabricService: FabricService,
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

    // ── Batch pre-fetch: avoid N+1 queries in the loop ──
    const overdueUserIds = [...new Set(overdueLoans.map(l => l.userId))];
    const overdueFineractIds = overdueLoans.map(l => l.fineractLoanId).filter((id): id is number => id != null);

    const [recentHistory, existingDelinquencies] = await Promise.all([
      this.creditScoreHistoryModel
        .find({
          userId: { $in: overdueUserIds },
          reason: 'late_payment',
          trigger: 'delinquency_batch',
          createdAt: { $gte: oneDayAgo },
        })
        .select('userId note')
        .lean(),
      this.loanDelinquencyModel
        .find({ fineractLoanId: { $in: overdueFineractIds } })
        .select('fineractLoanId debtGroup status')
        .lean(),
    ]);

    // Build lookup: "userId:fineractLoanId" → already penalized today
    const penalizedSet = new Set<string>();
    for (const h of recentHistory) {
      const match = (h.note || '').match(/#(\d+)/);
      if (match) penalizedSet.add(`${h.userId}:${match[1]}`);
    }
    // Build lookup: fineractLoanId → existing delinquency record
    const delinquencyByLoanId = new Map<number, { debtGroup: number; status: string }>();
    for (const d of existingDelinquencies) {
      delinquencyByLoanId.set(d.fineractLoanId, d);
    }

    this.logger.log(
      `[delinquency-batch] Pre-fetched ${recentHistory.length} history records, ${existingDelinquencies.length} delinquency records.`,
    );

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

        // Check already penalized today (batch lookup instead of per-loan query)
        if (penalizedSet.has(`${uid}:${loan.fineractLoanId}`)) continue;

        const debtGroup = this.classifyDebtGroup(overdueDays);
        const groupLabel = this.getDebtGroupLabel(debtGroup);
        const policy = policyByGroup.get(debtGroup);

        // ── Lookup existing delinquency from batch (instead of per-loan query) ──
        const existingDelinquency =
          loan.fineractLoanId != null ? delinquencyByLoanId.get(loan.fineractLoanId) : undefined;
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

        // ── Dynamic policy enforcement: freeze_account, permanent_ban, legal_escalation ──
        if (policy?.freeze_account) {
          await this.userModel.updateOne(
            { _id: uid },
            {
              $set: {
                'metadata.accountFrozen': true,
                'metadata.frozenReason': `Nợ nhóm ${debtGroup}: ${groupLabel}`,
                'metadata.frozenDebtGroup': debtGroup,
              },
            },
          );
          this.logger.warn(
            `[delinquency-batch] FROZEN account for user ${uid} — debt group ${debtGroup} (policy.freeze_account=true)`,
          );
        }

        if (policy?.permanent_ban) {
          await this.userModel.updateOne(
            { _id: uid },
            {
              $set: {
                'metadata.permanentBan': true,
                'metadata.banReason': `Nợ có khả năng mất vốn (>=${overdueDays} ngày)`,
                'metadata.banDebtGroup': debtGroup,
              },
            },
          );
          this.logger.warn(
            `[delinquency-batch] PERMANENT BAN for user ${uid} — debt group ${debtGroup} (policy.permanent_ban=true)`,
          );
        }

        if (policy.legal_escalation) {
          await this.userModel.updateOne(
            { _id: uid },
            {
              $set: {
                'metadata.legalEscalation': true,
                'metadata.legalEscalationReason': `Nợ nhóm ${debtGroup}: ${groupLabel} — Chuyển xử lý pháp lý`,
              },
            },
          );
          this.logger.warn(`[delinquency-batch] LEGAL ESCALATION for user ${uid} — debt group ${debtGroup}`);
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
      const numericRetention = Number(p.retention_months);
      const normalizedRetention = Number.isFinite(numericRetention) && numericRetention > 0 ? Math.trunc(numericRetention) : null;
      const hasExistingRetention = retentionMap.has(p.debt_group);
      const existingRetention = retentionMap.get(p.debt_group);
      if (normalizedRetention == null) {
        retentionMap.set(p.debt_group, null);
      } else if (!hasExistingRetention) {
        retentionMap.set(p.debt_group, normalizedRetention);
      } else if (existingRetention != null) {
        retentionMap.set(p.debt_group, Math.max(existingRetention, normalizedRetention));
      } else {
        retentionMap.set(p.debt_group, null);
      }
    }

    const now = new Date();
    let cleaned = 0;
    for (const rec of resolvedRecords) {
      const retentionMonths = retentionMap.get(rec.debtGroup);
      // null, undefined, or 0 = vĩnh viễn (permanent) → never soft-delete
      if (retentionMonths == null || retentionMonths <= 0) continue;

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

    const { factors, scorecardScore } = await this.buildWeightedFactors(uid, {
      userId: uid,
      isLatePayment: false,
      isPrepayment: false,
      overdueDays: 0,
    });
    const afterScore = scorecardScore;

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
      note: `Khoản vay mới giải ngân — Scorecard 2.0 (WOE+LR) | ${this.buildFactorNote(factors)}`,
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

  /**
   * Dư nợ tín dụng — Credit Utilization Ratio.
   * Giữ lại cho backward compatibility (display tooltips).
   * Scoring thực tế dùng WOE binning.
   */
  private scoreFromDebtRatio(debtRatio: number, hasCreditHistory: boolean): number {
    if (!hasCreditHistory) return 55;
    if (!Number.isFinite(debtRatio) || debtRatio <= 0) return 95;
    if (debtRatio <= 0.1) return 100;
    if (debtRatio <= 0.2) return 90;
    if (debtRatio <= 0.3) return 75;
    if (debtRatio <= 0.5) return 55;
    if (debtRatio <= 0.7) return 35;
    if (debtRatio <= 0.9) return 20;
    return 5;
  }

  /**
   * Tuổi tín dụng — Tiered scoring theo thời gian gắn bó.
   * Giữ lại cho backward compatibility (display tooltips).
   */
  private scoreFromCreditAgeMonths(ageMonths: number): number {
    if (ageMonths >= 36) return 100;
    if (ageMonths >= 12) return 85;
    if (ageMonths >= 6) return 60;
    if (ageMonths >= 3) return 30;
    return 10;
  }

  /**
   * Tín dụng mới — Phạt cho sự "khát tiền".
   * Giữ lại cho backward compatibility (display tooltips).
   */
  private scoreFromRecentLoanCount(recentLoanCount: number): number {
    if (recentLoanCount <= 0) return 100;
    if (recentLoanCount === 1) return 80;
    if (recentLoanCount === 2) return 40;
    return 10;
  }

  /**
   * Đa dạng tín dụng — Đếm số lượng ProductID duy nhất đã giải ngân.
   * Giữ lại cho backward compatibility (display tooltips).
   */
  private scoreFromCreditMix(uniqueProductCount: number, _hasClosedLoan: boolean): number {
    if (uniqueProductCount >= 3) return 100;
    if (uniqueProductCount === 2) return 75;
    if (uniqueProductCount >= 1) return 40;
    return 20;
  }

  // ══════════════════════════════════════════════════════════════
  //  SCORECARD 2.0 — WOE Binning + Logistic Regression Methods
  // ══════════════════════════════════════════════════════════════

  /**
   * WOE Bin Lookup — tìm bin chứa rawValue và trả về giá trị WOE.
   * Bins phải cover toàn bộ miền giá trị (dùng -Infinity/+Infinity).
   */
  private lookupWoe(bins: WoeBin[], rawValue: number): number {
    for (const bin of bins) {
      if (rawValue >= bin.min && rawValue < bin.max) return bin.woe;
    }
    // Fallback: trả WOE của bin cuối cùng
    return bins[bins.length - 1].woe;
  }

  /**
   * Chuyển đổi giá trị WOE → điểm hiển thị 0-100 (backward compatible).
   * Map tuyến tính: woeMin → 0, woeMax → 100.
   */
  private woeToDisplayScore(woe: number, woeMin: number, woeMax: number): number {
    if (woeMax === woeMin) return 50;
    const score = ((woe - woeMin) / (woeMax - woeMin)) * 100;
    return this.clampPercent(Math.round(score));
  }

  /**
   * Tính WOE range (min/max) cho một bộ bins.
   */
  private getWoeRange(bins: WoeBin[]): { min: number; max: number } {
    const woes = bins.map(b => b.woe);
    return { min: Math.min(...woes), max: Math.max(...woes) };
  }

  /**
   * ═══════════════════════════════════════════════════════════
   *  SCORECARD 2.0 — Tính điểm CIC từ WOE + Logistic Regression
   * ═══════════════════════════════════════════════════════════
   *
   * Pipeline: Raw Features → WOE Binning → Logistic Regression → Scorecard
   *
   * logit(P) = β₀ + Σ(βᵢ × WOEᵢ)
   * Factor = pdo / ln(2)
   * Offset = baseScore - Factor × ln(baseOdds)
   * Score = Offset - Factor × logit(P)
   *
   * Score_i = -(βᵢ × WOEᵢ + β₀/n) × Factor + Offset/n
   */
  private calculateScorecardScore(rawFeatures: RawFeatureValues): number {
    const params = this.defaultScorecardParams;
    const { coefficients, intercept, pdo, baseScore, baseOdds } = params;
    const bins = params.woeBins;

    // Step 1: WOE Binning — map raw features → WOE values
    const woePayment = this.lookupWoe(bins.paymentHistory, rawFeatures.paymentScore);
    const woeDebt = rawFeatures.hasCreditHistory ? this.lookupWoe(bins.debtLevel, rawFeatures.utilizationRatio) : 0.1; // Neutral WOE cho user chưa có hồ sơ tín dụng
    const woeAge = this.lookupWoe(bins.creditAge, rawFeatures.ageMonths);
    const woeMix = this.lookupWoe(bins.creditMix, rawFeatures.uniqueProducts);
    const woeNew = this.lookupWoe(bins.newCredit, rawFeatures.recentLoans);

    // Step 2: Logistic Regression — logit(P) = β₀ + Σ(βᵢ × WOEᵢ)
    const logit =
      intercept +
      coefficients.paymentHistory * woePayment +
      coefficients.debtLevel * woeDebt +
      coefficients.creditAge * woeAge +
      coefficients.creditMix * woeMix +
      coefficients.newCredit * woeNew;

    // Step 3: Scorecard Conversion — Score = Offset - Factor × logit(P)
    const factor = pdo / Math.log(2);
    const offset = baseScore - factor * Math.log(Math.max(baseOdds, 1e-15));
    const score = offset - factor * logit;

    this.logger.debug(
      `[Scorecard2.0] WOE(PH=${woePayment.toFixed(2)}, DL=${woeDebt.toFixed(2)}, CA=${woeAge.toFixed(2)}, CM=${woeMix.toFixed(2)}, NC=${woeNew.toFixed(2)}) → logit=${logit.toFixed(4)} → score=${score.toFixed(1)}`,
    );

    return this.clampScore(score);
  }

  /**
   * Chuyển đổi rawFeatures → display factors (0-100) thông qua WOE mapping.
   * Giữ format CreditFactorScores cho backward compatibility với frontend.
   */
  private rawFeaturesToDisplayFactors(rawFeatures: RawFeatureValues): CreditFactorScores {
    const params = this.defaultScorecardParams;
    const bins = params.woeBins;

    const woePayment = this.lookupWoe(bins.paymentHistory, rawFeatures.paymentScore);
    const woeDebt = rawFeatures.hasCreditHistory ? this.lookupWoe(bins.debtLevel, rawFeatures.utilizationRatio) : 0.1;
    const woeAge = this.lookupWoe(bins.creditAge, rawFeatures.ageMonths);
    const woeMix = this.lookupWoe(bins.creditMix, rawFeatures.uniqueProducts);
    const woeNew = this.lookupWoe(bins.newCredit, rawFeatures.recentLoans);

    const rangePayment = this.getWoeRange(bins.paymentHistory);
    const rangeDebt = this.getWoeRange(bins.debtLevel);
    const rangeAge = this.getWoeRange(bins.creditAge);
    const rangeMix = this.getWoeRange(bins.creditMix);
    const rangeNew = this.getWoeRange(bins.newCredit);

    return {
      paymentHistory: this.woeToDisplayScore(woePayment, rangePayment.min, rangePayment.max),
      debtLevel: this.woeToDisplayScore(woeDebt, rangeDebt.min, rangeDebt.max),
      creditAge: this.woeToDisplayScore(woeAge, rangeAge.min, rangeAge.max),
      creditMix: this.woeToDisplayScore(woeMix, rangeMix.min, rangeMix.max),
      newCredit: this.woeToDisplayScore(woeNew, rangeNew.min, rangeNew.max),
    };
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

  /**
   * ═══════════════════════════════════════════════════════════
   *  CORE FEATURE ENGINEERING + SCORECARD 2.0
   * ═══════════════════════════════════════════════════════════
   *
   * Trích xuất 5 tiêu chí thô (Feature Engineering):
   *   1. Payment History: Penalty deduction → rawPaymentScore (0-100)
   *   2. Debt Level: Credit Utilization Ratio (0-1+)
   *   3. Credit Age: Months since oldest loan
   *   4. Credit Mix: Distinct product count
   *   5. New Credit: Recent loan count in 90 days
   *
   * Sau đó WOE Binning → Logistic Regression → Scorecard Conversion.
   * Trả về: { factors (0-100 display), scorecardScore (150-750), rawFeatures }
   */
  private async buildWeightedFactors(
    userId: Types.ObjectId,
    _input: CreditScoreRepaymentEventInput,
  ): Promise<ScoringResult> {
    // ── 1. Fetch all loan data + delinquency records ──
    const [loanDocs, delinquencyDocs] = await Promise.all([
      this.loanApplicationModel
        .find({ userId })
        .select('capital totalOutstanding principalOutstanding productId status createdAt delinquentDays')
        .lean(),
      this.loanDelinquencyModel
        .find({ borrowerId: userId, isDeleted: { $ne: true } })
        .select('debtGroup status lastSyncedAt resolvedAt firstOverdueDate')
        .lean(),
    ]);

    const now = Date.now();

    // Chỉ dùng hồ sơ tín dụng đã thực sự phát sinh nghĩa vụ (disbursed/closed)
    const creditProfileLoans = loanDocs.filter((loan: any) => {
      const status = String(loan?.status || '').toLowerCase();
      return status === 'disbursed' || status === 'closed';
    });
    const activeExposureLoans = creditProfileLoans.filter(
      (loan: any) => String(loan?.status || '').toLowerCase() === 'disbursed',
    );
    const totalCreditAccounts = creditProfileLoans.length;

    // ════════════════════════════════════════════════════
    //  S_payment — Lịch sử thanh toán (Penalty Deduction)
    // ════════════════════════════════════════════════════
    // Severity penalty theo nhóm nợ CIC + recency penalty cho các case mới phát sinh.
    const groupPenaltyMap: Record<number, number> = {
      1: 8,
      2: 20,
      3: 35,
      4: 50,
      5: 65,
    };

    const toDaysSince = (value: unknown): number | null => {
      if (!value) return null;
      const t = new Date(value as any).getTime();
      if (!Number.isFinite(t) || t <= 0) return null;
      return Math.max(0, (now - t) / (24 * 60 * 60 * 1000));
    };

    let paymentPenalty = 0;
    for (const d of delinquencyDocs as any[]) {
      const group = Number(d?.debtGroup || 0);
      if (group < 1) continue;

      const basePenalty = groupPenaltyMap[Math.min(5, group)] || 0;
      if (basePenalty <= 0) continue;

      const status = String(d?.status || '').toLowerCase();
      const recencyDays = toDaysSince(d?.lastSyncedAt || d?.resolvedAt || d?.firstOverdueDate);
      let recencyFactor = 1.0;
      if (status === 'overdue' || status === 'defaulted' || recencyDays == null || recencyDays <= 90) {
        recencyFactor = 1.25;
      } else if (recencyDays <= 180) {
        recencyFactor = 1.1;
      }

      paymentPenalty += basePenalty * recencyFactor;
    }

    const rawPaymentScore = Math.max(0, 100 - paymentPenalty);

    // Thin-file cap: hồ sơ ít khoản vay không được full 100 quá sớm.
    let thinFileCap = 100;
    if (totalCreditAccounts <= 2) thinFileCap = 55;
    else if (totalCreditAccounts <= 5) thinFileCap = 70;
    else if (totalCreditAccounts <= 10) thinFileCap = 85;

    const paymentScore = Math.min(rawPaymentScore, thinFileCap);

    // ════════════════════════════════════════════════════
    //  S_debt — Dư nợ tín dụng (Credit Utilization Ratio)
    // ════════════════════════════════════════════════════
    // U = totalOutstanding / totalCreditLimit
    // totalCreditLimit lấy theo tổng hạn mức đã giải ngân của chính user,
    // tránh dùng ceiling toàn hệ thống làm mẫu số bị phình và score bị inflated.
    const totalOutstanding = activeExposureLoans.reduce(
      (acc, loan: any) => acc + Number(loan?.principalOutstanding || loan?.totalOutstanding || 0),
      0,
    );

    const totalActiveLimit = activeExposureLoans.reduce(
      (acc, loan: any) => acc + Math.max(Number(loan?.capital || 0), Number(loan?.principalOutstanding || 0), 0),
      0,
    );
    const totalHistoricalLimit = creditProfileLoans.reduce(
      (acc, loan: any) => acc + Math.max(Number(loan?.capital || 0), 0),
      0,
    );
    const totalCreditLimit = Math.max(totalActiveLimit, totalHistoricalLimit, 1);
    const utilizationRatio = totalOutstanding / totalCreditLimit;

    // ════════════════════════════════════════════════════
    //  S_age — Tuổi tín dụng
    // ════════════════════════════════════════════════════
    const oldestLoanTime = creditProfileLoans
      .map((loan: any) => new Date(loan?.createdAt || 0).getTime())
      .filter((t: number) => t > 0)
      .sort((a: number, b: number) => a - b)[0];
    const ageMonths = oldestLoanTime ? Math.max(0, (now - oldestLoanTime) / (30 * 24 * 60 * 60 * 1000)) : 0;

    // ════════════════════════════════════════════════════
    //  S_mix — Đa dạng tín dụng
    // ════════════════════════════════════════════════════
    // Count distinct productIds from disbursed/closed loans
    const disbursedOrClosed = creditProfileLoans.filter((loan: any) =>
      ['disbursed', 'closed'].includes(String(loan?.status || '').toLowerCase()),
    );
    const uniqueProductCount = new Set(disbursedOrClosed.map((loan: any) => String(loan?.productId || ''))).size;
    const _hasClosedLoan = creditProfileLoans.some(
      (loan: any) => String(loan?.status || '').toLowerCase() === 'closed',
    );

    // ════════════════════════════════════════════════════
    //  S_new — Tín dụng mới (90 ngày)
    // ════════════════════════════════════════════════════
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const recentLoanCount = creditProfileLoans.filter((loan: any) => {
      const createdAt = new Date(loan?.createdAt || 0).getTime();
      return createdAt > 0 && now - createdAt <= ninetyDaysMs;
    }).length;

    // ════════════════════════════════════════════════════
    //  Build raw features + Scorecard 2.0
    // ════════════════════════════════════════════════════
    const rawFeatures: RawFeatureValues = {
      paymentScore: this.clampPercent(paymentScore),
      utilizationRatio,
      hasCreditHistory: totalCreditAccounts > 0,
      ageMonths,
      uniqueProducts: uniqueProductCount,
      recentLoans: recentLoanCount,
    };

    // WOE + Logistic Regression → Scorecard Score (150-750)
    const scorecardScore = this.calculateScorecardScore(rawFeatures);

    // Display factors (0-100) for backward compatibility with frontend
    const factors = this.rawFeaturesToDisplayFactors(rawFeatures);

    return { factors, scorecardScore, rawFeatures };
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
    const { factors, scorecardScore } = await this.buildWeightedFactors(uid, input);

    const beforeScore = scoreDoc.score;
    let afterScore = scorecardScore;

    // ── Directional Enforcement (FICO-style behavioral guardrail) ──
    // Late payment events can NEVER increase the score.
    // On-time repayment/prepayment events can NEVER decrease the score.
    // This prevents confusing scenarios like "Chậm thanh toán +86".
    // Full recalculation (login, manual recalc) still uses raw calculated score.
    if (isLatePayment && afterScore > beforeScore) {
      this.logger.log(
        `[applyRepaymentEvent] Directional cap: late_payment would increase ${beforeScore}→${afterScore}, capping at ${beforeScore}`,
      );
      afterScore = beforeScore;
    } else if (!isLatePayment && afterScore < beforeScore) {
      this.logger.log(
        `[applyRepaymentEvent] Directional floor: repayment would decrease ${beforeScore}→${afterScore}, flooring at ${beforeScore}`,
      );
      afterScore = beforeScore;
    }

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
    const { factors, scorecardScore } = await this.buildWeightedFactors(uid, {
      userId: uid,
      isLatePayment: false,
      isPrepayment: false,
      overdueDays: 0,
    });
    const afterScore = scorecardScore;

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
        note: `Tính lại điểm tín dụng — Scorecard 2.0 (WOE+LR) | ${this.buildFactorNote(factors)}`,
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

  private toLoanEvaluationConfigValue(doc: any): LoanEvaluationConfigValue {
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
      createdAt: doc.createdAt,
    };
  }

  private getLoanEvalConfigTxHash(result: any): string {
    return result?.transactionId || result?.txId || result?.configId || '';
  }

  private async syncLoanEvalConfigToBlockchain(
    created: LoanEvaluationConfig,
    input: LoanEvaluationConfigInput,
    configHash: string,
    adminId?: string,
  ): Promise<string> {
    const configId = `LOAN_EVAL_CONFIG_v${created.version}`;
    const payload = {
      version: created.version,
      configHash,
      autoRejectScore: input.autoRejectScore,
      autoApproveScore: input.autoApproveScore,
      creditGrades: input.creditGrades,
      scoreWeights: input.scoreWeights,
      changedBy: created.changedBy || adminId || '',
      changedById: adminId || '',
      changeNote: created.changeNote || input.changeNote || '',
      sourceCollection: 'loan_evaluation_configs',
      sourceId: created._id?.toString?.() || '',
    };

    try {
      if (!this.fabricService?.isConnected()) {
        this.logger.warn('[createLoanEvaluationConfig] Fabric is not connected; saved config without blockchain tx hash');
        return '';
      }

      const result = await this.fabricService.submitTransaction(
        'createLoanEvaluationConfig',
        configId,
        JSON.stringify(payload),
      );
      const txHash = this.getLoanEvalConfigTxHash(result) || configId;
      this.logger.log(`[createLoanEvaluationConfig] Blockchain synced ${configId} tx=${txHash}`);
      return txHash;
    } catch (error: any) {
      if (String(error?.message || '').includes('already exists')) {
        try {
          const existing = await this.fabricService.evaluateTransaction('queryLoanEvaluationConfig', configId);
          const txHash = this.getLoanEvalConfigTxHash(existing) || configId;
          this.logger.log(`[createLoanEvaluationConfig] Blockchain record already existed ${configId} tx=${txHash}`);
          return txHash;
        } catch (queryError: any) {
          this.logger.warn(`[createLoanEvaluationConfig] Could not query existing blockchain config ${configId}: ${queryError.message}`);
        }
      }
      this.logger.warn(`[createLoanEvaluationConfig] Blockchain sync failed: ${error.message}`);
      return '';
    }
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
    return this.toLoanEvaluationConfigValue(doc);
  }

  async syncLoanEvaluationConfigBlockchain(version?: number, adminId?: string): Promise<LoanEvaluationConfigValue> {
    const query = version ? { version } : {};
    const doc = await this.loanEvaluationConfigModel.findOne(query).sort({ version: -1 });
    if (!doc) {
      throw new BadRequestException('Không tìm thấy cấu hình đánh giá khoản vay để ghi blockchain');
    }
    if (doc.blockchainTxHash) {
      return this.toLoanEvaluationConfigValue(doc);
    }

    const input: LoanEvaluationConfigInput = {
      autoRejectScore: doc.autoRejectScore,
      autoApproveScore: doc.autoApproveScore,
      creditGrades: doc.creditGrades,
      scoreWeights: doc.scoreWeights,
      changeNote: doc.changeNote,
    };
    const blockchainTxHash = await this.syncLoanEvalConfigToBlockchain(doc, input, doc.configHash, adminId);
    if (!blockchainTxHash) {
      throw new BadRequestException('Chưa ghi được cấu hình lên blockchain. Vui lòng thử lại sau khi Fabric sẵn sàng.');
    }

    doc.blockchainTxHash = blockchainTxHash;
    await doc.save();
    return this.toLoanEvaluationConfigValue(doc);
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

    const blockchainTxHash = await this.syncLoanEvalConfigToBlockchain(created, input, configHash, adminId);
    if (blockchainTxHash) {
      created.blockchainTxHash = blockchainTxHash;
      await created.save();
    }

    this.logger.log(
      `[createLoanEvaluationConfig] v${nextVersion} by admin=${adminId} hash=${configHash.slice(0, 16)}… blockchain=${blockchainTxHash || 'not_synced'}`,
    );

    return this.toLoanEvaluationConfigValue(created);
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
