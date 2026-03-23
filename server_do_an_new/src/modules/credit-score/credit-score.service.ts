import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreditScore } from './schemas/credit-score.schema';
import { CreditScoreHistory } from './schemas/credit-score-history.schema';
import { CreditScoreWeightConfig } from './schemas/credit-score-weight-config.schema';
import { LoanApplication } from '../loan/schemas/loan-application.schema';

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

interface CreditFactorScores {
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

export interface CreditScoreWeightConfigItem extends CreditScoreWeightConfigValue {
  _id: string;
  name: string;
  description?: string;
  key: string;
  isDefault: boolean;
  isActive: boolean;
  appliedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateCreditScoreWeightConfigInput extends CreditScoreWeightConfigInput {
  name: string;
  description?: string;
}

export interface UpdateCreditScoreWeightConfigInput extends CreditScoreWeightConfigInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

@Injectable()
export class CreditScoreService {
  private readonly logger = new Logger(CreditScoreService.name);
  private readonly legacyConfigKey = 'default';
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
    @InjectModel(CreditScoreWeightConfig.name)
    private readonly creditScoreWeightConfigModel: Model<CreditScoreWeightConfig>,
    @InjectModel(LoanApplication.name)
    private readonly loanApplicationModel: Model<LoanApplication>,
  ) {}

  private sanitizeWeights(weights: CreditScoreWeightConfigInput): CreditScoreWeightConfigInput {
    return {
      paymentHistory: Number(Number(weights.paymentHistory || 0).toFixed(2)),
      debtLevel: Number(Number(weights.debtLevel || 0).toFixed(2)),
      creditAge: Number(Number(weights.creditAge || 0).toFixed(2)),
      creditMix: Number(Number(weights.creditMix || 0).toFixed(2)),
      newCredit: Number(Number(weights.newCredit || 0).toFixed(2)),
    };
  }

  private validateWeights(weights: CreditScoreWeightConfigInput): CreditScoreWeightConfigInput {
    const sanitized = this.sanitizeWeights(weights);

    const values = Object.entries(sanitized) as Array<[keyof CreditScoreWeightConfigInput, number]>;
    for (const [key, value] of values) {
      if (!Number.isFinite(value)) {
        throw new BadRequestException(`Trọng số ${key} không hợp lệ`);
      }
      if (value < 0 || value > 100) {
        throw new BadRequestException(`Trọng số ${key} phải nằm trong khoảng 0-100`);
      }
    }

    const total =
      sanitized.paymentHistory + sanitized.debtLevel + sanitized.creditAge + sanitized.creditMix + sanitized.newCredit;

    if (Math.abs(total - 100) > 0.01) {
      throw new BadRequestException(`Tổng trọng số phải bằng 100%, hiện tại là ${total.toFixed(2)}%`);
    }

    return sanitized;
  }

  private toWeightValue(weights: CreditScoreWeightConfigInput): CreditScoreWeightConfigValue {
    const validated = this.validateWeights(weights);
    const total =
      validated.paymentHistory + validated.debtLevel + validated.creditAge + validated.creditMix + validated.newCredit;

    return {
      ...validated,
      total: Number(total.toFixed(4)),
    };
  }

  private toConfigItem(doc: any): CreditScoreWeightConfigItem {
    const value = this.toWeightValue({
      paymentHistory: Number(doc.paymentHistory || 0),
      debtLevel: Number(doc.debtLevel || 0),
      creditAge: Number(doc.creditAge || 0),
      creditMix: Number(doc.creditMix || 0),
      newCredit: Number(doc.newCredit || 0),
    });

    return {
      _id: String(doc._id),
      name: String(doc.name || 'Unnamed'),
      description: doc.description || '',
      key: String(doc.key || ''),
      isDefault: Boolean(doc.isDefault),
      isActive: doc.isActive !== false,
      appliedAt: doc.appliedAt || null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      ...value,
    };
  }

  private buildKey(name: string): string {
    const base = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    const suffix = Date.now().toString(36);
    return `${base || 'weight-config'}-${suffix}`;
  }

  async getWeightConfig(): Promise<CreditScoreWeightConfigValue> {
    const current = await this.getDefaultWeightConfigItem();
    if (!current) {
      return this.toWeightValue(this.defaultWeights);
    }

    return {
      paymentHistory: current.paymentHistory,
      debtLevel: current.debtLevel,
      creditAge: current.creditAge,
      creditMix: current.creditMix,
      newCredit: current.newCredit,
      total: current.total,
    };
  }

  async upsertWeightConfig(input: CreditScoreWeightConfigInput): Promise<CreditScoreWeightConfigValue> {
    const validated = this.validateWeights(input);

    const currentDefault = await this.creditScoreWeightConfigModel
      .findOne({ isDefault: true })
      .sort({ updatedAt: -1 })
      .exec();

    if (currentDefault) {
      currentDefault.paymentHistory = validated.paymentHistory;
      currentDefault.debtLevel = validated.debtLevel;
      currentDefault.creditAge = validated.creditAge;
      currentDefault.creditMix = validated.creditMix;
      currentDefault.newCredit = validated.newCredit;
      currentDefault.isActive = true;
      currentDefault.appliedAt = new Date();
      await currentDefault.save();
      return this.toWeightValue(validated);
    }

    await this.creditScoreWeightConfigModel.findOneAndUpdate(
      { key: this.legacyConfigKey },
      {
        $set: {
          ...validated,
          key: this.legacyConfigKey,
          name: 'Cấu hình mặc định',
          description: 'Auto-created default config',
          isDefault: true,
          isActive: true,
          appliedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return this.toWeightValue(validated);
  }

  async listWeightConfigs(): Promise<CreditScoreWeightConfigItem[]> {
    const items = await this.creditScoreWeightConfigModel.find({}).sort({ isDefault: -1, updatedAt: -1 }).lean();

    return items.map((item: any) => this.toConfigItem(item));
  }

  async createWeightConfig(input: CreateCreditScoreWeightConfigInput): Promise<CreditScoreWeightConfigItem> {
    const name = String(input.name || '').trim();
    if (!name) {
      throw new BadRequestException('Tên cấu hình là bắt buộc');
    }

    const exists = await this.creditScoreWeightConfigModel
      .findOne({ name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } })
      .lean();
    if (exists) {
      throw new BadRequestException('Tên cấu hình đã tồn tại');
    }

    const validated = this.validateWeights(input);
    const created = await this.creditScoreWeightConfigModel.create({
      ...validated,
      name,
      description: String(input.description || '').trim(),
      key: this.buildKey(name),
      isDefault: false,
      isActive: true,
    });

    return this.toConfigItem(created.toObject());
  }

  async updateWeightConfig(
    id: string,
    input: UpdateCreditScoreWeightConfigInput,
  ): Promise<CreditScoreWeightConfigItem> {
    const doc = await this.creditScoreWeightConfigModel.findById(id);
    if (!doc) {
      throw new NotFoundException('Không tìm thấy cấu hình trọng số');
    }

    if (input.name != null) {
      const nextName = String(input.name).trim();
      if (!nextName) {
        throw new BadRequestException('Tên cấu hình không hợp lệ');
      }

      const exists = await this.creditScoreWeightConfigModel
        .findOne({
          _id: { $ne: doc._id },
          name: { $regex: `^${nextName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
        })
        .lean();
      if (exists) {
        throw new BadRequestException('Tên cấu hình đã tồn tại');
      }
      doc.name = nextName;
    }

    if (input.description != null) {
      doc.description = String(input.description).trim();
    }

    if (input.isActive != null) {
      doc.isActive = Boolean(input.isActive);
    }

    const validated = this.validateWeights(input);
    doc.paymentHistory = validated.paymentHistory;
    doc.debtLevel = validated.debtLevel;
    doc.creditAge = validated.creditAge;
    doc.creditMix = validated.creditMix;
    doc.newCredit = validated.newCredit;

    await doc.save();
    return this.toConfigItem(doc.toObject());
  }

  async applyWeightConfig(id: string): Promise<CreditScoreWeightConfigItem> {
    const target = await this.creditScoreWeightConfigModel.findById(id);
    if (!target) {
      throw new NotFoundException('Không tìm thấy cấu hình trọng số để áp dụng');
    }
    if (!target.isActive) {
      throw new BadRequestException('Không thể áp dụng cấu hình đang bị vô hiệu hóa');
    }

    await this.creditScoreWeightConfigModel.updateMany(
      { _id: { $ne: target._id }, isDefault: true },
      { $set: { isDefault: false } },
    );

    target.isDefault = true;
    target.appliedAt = new Date();
    await target.save();

    return this.toConfigItem(target.toObject());
  }

  async getDefaultWeightConfigItem(): Promise<CreditScoreWeightConfigItem | null> {
    let current = await this.creditScoreWeightConfigModel.findOne({ isDefault: true }).sort({ updatedAt: -1 }).lean();

    if (!current) {
      current = await this.creditScoreWeightConfigModel.findOne({ key: this.legacyConfigKey }).lean();
      if (current) {
        await this.creditScoreWeightConfigModel.updateOne(
          { _id: current._id },
          { $set: { isDefault: true, isActive: true, appliedAt: current.appliedAt || new Date() } },
        );
        current.isDefault = true;
        current.isActive = true;
      }
    }

    if (!current) {
      current = await this.creditScoreWeightConfigModel.findOne({}).sort({ updatedAt: -1 }).lean();
      if (current) {
        await this.creditScoreWeightConfigModel.updateOne(
          { _id: current._id },
          { $set: { isDefault: true, isActive: true, appliedAt: current.appliedAt || new Date() } },
        );
        current.isDefault = true;
        current.isActive = true;
      }
    }

    return current ? this.toConfigItem(current) : null;
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
}
