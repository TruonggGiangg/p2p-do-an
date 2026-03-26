import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/* ──────────────────────────────────────────────────────────────
 * Rule Engine – Cấu hình đánh giá khoản vay (Versioned, INSERT-only)
 *
 * Mỗi lần admin lưu → tạo document mới (version++).
 * Document có version cao nhất = cấu hình đang active.
 * Không bao giờ UPDATE document cũ → đảm bảo audit trail minh bạch.
 * configHash (SHA-256) được ghi kèm để chứng minh tính toàn vẹn.
 * ──────────────────────────────────────────────────────────── */

/** Hạng tín dụng (Credit Grade) — sub-document */
export interface CreditGrade {
  grade: string; // 'A', 'B', 'C', …
  label: string; // 'Rủi ro cực thấp', …
  minScore: number; // Lower bound (inclusive)
  maxScore: number; // Upper bound (inclusive)
  maxLoanAmount: number; // VND
  baseInterestRate: number; // % / năm
}

/** Trọng số tính điểm — sub-document */
export interface ScoreWeights {
  paymentHistory: number; // %
  debtLevel: number;
  creditAge: number;
  creditMix: number;
  newCredit: number;
}

@Schema({ collection: 'loan_evaluation_configs', timestamps: true })
export class LoanEvaluationConfig extends Document {
  /** Phiên bản cấu hình, tự tăng: 1, 2, 3 … */
  @Prop({ type: Number, required: true, index: true })
  version: number;

  // ── Block 1: Global Thresholds ────────────────────────────────
  /** Điểm dưới ngưỡng này → tự động từ chối (REJECTED) */
  @Prop({ type: Number, required: true, min: 0, max: 100 })
  autoRejectScore: number;

  /** Điểm >= ngưỡng này → tự động duyệt (APPROVED) */
  @Prop({ type: Number, required: true, min: 0, max: 100 })
  autoApproveScore: number;

  // ── Block 2: Credit Grading ───────────────────────────────────
  @Prop({
    type: [
      {
        grade: String,
        label: String,
        minScore: Number,
        maxScore: Number,
        maxLoanAmount: Number,
        baseInterestRate: Number,
      },
    ],
    required: true,
  })
  creditGrades: CreditGrade[];

  // ── Block 3: Score Weights ────────────────────────────────────
  @Prop({
    type: { paymentHistory: Number, debtLevel: Number, creditAge: Number, creditMix: Number, newCredit: Number },
    required: true,
  })
  scoreWeights: ScoreWeights;

  // ── Block 4: Audit & Integrity ────────────────────────────────
  /** SHA-256 hash toàn bộ payload config (dùng để verify trên blockchain) */
  @Prop({ type: String, required: true })
  configHash: string;

  /** Transaction hash trên blockchain (nếu ghi thành công) */
  @Prop({ type: String, default: '' })
  blockchainTxHash: string;

  /** Admin tạo phiên bản này */
  @Prop({ type: String })
  changedBy?: string;

  @Prop({ type: String })
  changeNote?: string;
}

export const LoanEvaluationConfigSchema = SchemaFactory.createForClass(LoanEvaluationConfig);
LoanEvaluationConfigSchema.index({ version: -1 });
