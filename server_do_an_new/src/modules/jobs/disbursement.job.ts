/**
 * DisbursementJob — Tự động giải ngân khoản vay đủ match + đến ngày
 * Pattern: HD-AMC DisbursementJob.js, adapted for NestJS
 *
 * Logic:
 *  1. Tìm LoanApplication có status='approved', isFullMatch=true, disbursementDate <= now
 *  2. Approve trên Fineract (idempotent)
 *  3. Disburse trên Fineract
 *  4. Cập nhật MongoDB status → 'disbursed'
 */

import { BaseJob } from './base-job';
import { Model } from 'mongoose';
import { LoanApplication } from '../loan/schemas/loan-application.schema';
import { FineractLoanService } from '../fineract/services/fineract-loan.service';

export class DisbursementJob extends BaseJob {
  constructor(
    private readonly loanModel: Model<LoanApplication>,
    private readonly fineractLoanService: FineractLoanService,
  ) {
    super({
      name: 'Disbursement',
      description: 'Tự động giải ngân khoản vay đủ match + đến ngày (học theo HD-AMC)',
      intervalMs: 60 * 1000, // 1 phút
      enabled: true,
      runOnStart: true,
      params: {
        maxPerRun: 50,
      },
      paramsSchema: [
        {
          key: 'maxPerRun',
          label: 'Tối đa mỗi lần chạy',
          description: 'Số khoản giải ngân tối đa trong 1 lần',
          type: 'number',
          unit: 'khoản',
        },
        {
          key: 'intervalMs',
          label: 'Tần suất chạy',
          description: 'Khoảng cách giữa mỗi lần kiểm tra',
          type: 'interval',
        },
        {
          key: 'scheduleTime',
          label: 'Giờ chạy cố định',
          description: 'Nếu đặt, chỉ chạy 1 lần/ngày vào giờ này (HH:mm). Bỏ trống = chạy theo tần suất',
          type: 'time',
        },
      ],
    });
  }

  /**
   * Kiểm tra và giải ngân các khoản vay đủ match + đến ngày giải ngân
   * Logic y hệt HD-AMC DisbursementJob.execute()
   */
  async execute() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // 'yyyy-MM-dd'

    // Tìm khoản vay approved + đủ vốn (isFullMatch) + đến ngày giải ngân
    const loansToDisburse = await this.loanModel
      .find({
        status: 'approved',
        isFullMatch: true,
        disbursementDate: { $lte: todayStr },
        fineractLoanId: { $ne: null },
      })
      .select('_id fineractLoanId capital disbursementDate')
      .limit(this.params.maxPerRun || 50)
      .lean();

    const report = {
      found: loansToDisburse.length,
      disbursed: 0,
      failed: 0,
      details: [] as any[],
    };

    if (loansToDisburse.length === 0) return report;

    const total = loansToDisburse.length;
    this.setProgress(0, total, `Đang xử lý ${total} khoản vay...`);

    for (let i = 0; i < loansToDisburse.length; i++) {
      const loan = loansToDisburse[i];
      const loanId = (loan as any)._id.toString();
      const fineractLoanId = loan.fineractLoanId!;

      try {
        // 1. Approve trên Fineract (idempotent - skip nếu đã approved)
        await this.fineractLoanService.approveLoan(
          fineractLoanId,
          loan.disbursementDate, // approvedOnDate phải <= disbursementDate
        );

        // 2. Disburse trên Fineract
        await this.fineractLoanService.disburseLoan(fineractLoanId, loan.capital);

        // 3. Cập nhật MongoDB
        await this.loanModel.updateOne(
          { _id: (loan as any)._id },
          { $set: { status: 'disbursed', lastSyncedAt: new Date() } },
        );

        report.disbursed++;
        report.details.push({
          loanId,
          fineractLoanId,
          status: 'success',
        });

        this.logger.log(`✓ Disbursed loan ${loanId} (Fineract #${fineractLoanId})`);
      } catch (err: any) {
        report.failed++;
        report.details.push({
          loanId,
          fineractLoanId,
          status: 'error',
          reason: err.message,
        });
        this.logger.error(`✗ Failed loan ${loanId}: ${err.message}`);
      }

      this.setProgress(i + 1, total, `${i + 1}/${total} — ${report.disbursed} OK, ${report.failed} lỗi`);
    }

    return report;
  }
}
