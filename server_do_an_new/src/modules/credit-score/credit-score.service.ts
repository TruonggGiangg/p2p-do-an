import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreditScore } from './schemas/credit-score.schema';
import { CreditScoreHistory } from './schemas/credit-score-history.schema';

const DEFAULT_CREDIT_SCORE = 650;

@Injectable()
export class CreditScoreService {
  private readonly logger = new Logger(CreditScoreService.name);

  constructor(
    @InjectModel(CreditScore.name)
    private readonly creditScoreModel: Model<CreditScore>,
    @InjectModel(CreditScoreHistory.name)
    private readonly creditScoreHistoryModel: Model<CreditScoreHistory>,
  ) {}

  private toObjectId(userId: string | Types.ObjectId): Types.ObjectId {
    return typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
  }

  async ensureCreditScoreForUser(userId: string | Types.ObjectId): Promise<CreditScore> {
    const uid = this.toObjectId(userId);

    const existing = await this.creditScoreModel.findOne({ userId: uid });
    if (existing) return existing;

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
      note: 'Khoi tao diem tin dung mac dinh khi tao hoac dong bo tai khoan',
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
}
