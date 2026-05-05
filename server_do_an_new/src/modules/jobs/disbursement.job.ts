/**
 * DisbursementJob — Retry giải ngân khoản vay đủ điều kiện đa bên + đến ngày
 * Pattern: HD-AMC DisbursementJob.js, adapted for NestJS
 *
 * Logic:
 *  1. Tìm LoanApplication có status='approved', isFullMatch=true, disbursementDate <= now
 *  2. Delegate sang InvestPaymentService.handleFullMatchDisbursement()
 *  3. Service này kiểm đủ: đã duyệt, đủ 100% vốn thật, tất cả NĐT ký, người vay ký SmartCA
 *  4. Chỉ khi gate pass mới disburse Fineract + cập nhật MongoDB status → 'disbursed'
 */

import { BaseJob } from './base-job';
import { Model } from 'mongoose';
import { LoanApplication } from '../loan/schemas/loan-application.schema';
import { InvestPaymentService } from '../invest/invest-payment.service';

export class DisbursementJob extends BaseJob {
  constructor(
    private readonly loanModel: Model<LoanApplication>,
    private readonly investPaymentService: InvestPaymentService,
  ) {
    super({
      name: 'Disbursement',
      description: 'Retry giải ngân khoản vay đã đủ vốn + đủ chữ ký đa bên + đến ngày',
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
    * Kiểm tra và retry giải ngân các khoản vay đủ vốn + đến ngày giải ngân.
    * Không tự gọi Fineract trực tiếp để tránh bỏ qua điều kiện chữ ký người vay/NĐT.
   */
  async execute() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // 'yyyy-MM-dd'

    // Tìm khoản vay approved + đủ vốn thật (isFullMatch) + đến ngày giải ngân
    const loansToDisburse = await this.loanModel
      .find({
        status: 'approved',
        isFullMatch: true,
        disbursementDate: { $lte: todayStr },
        fineractLoanId: { $ne: null },
      })
      .select('_id fineractLoanId capital disbursementDate status isFullMatch investedNotes totalNotes')
      .limit(this.params.maxPerRun || 50)
      .lean();

    const report = {
      found: loansToDisburse.length,
      disbursed: 0,
      skipped: 0,
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
        await this.investPaymentService.handleFullMatchDisbursement(loanId, 'disbursement-job');

        const refreshed = await this.loanModel.findById(loanId).select('status').lean();
        if (refreshed?.status === 'disbursed') {
          report.disbursed++;
          report.details.push({ loanId, fineractLoanId, status: 'success' });
          this.logger.log(`✓ Disbursed loan ${loanId} (Fineract #${fineractLoanId})`);
        } else {
          report.skipped++;
          report.details.push({
            loanId,
            fineractLoanId,
            status: 'skipped',
            reason: 'not_ready_for_multi_party_disbursement',
          });
          this.logger.log(`Loan ${loanId} not ready for disbursement yet`);
        }
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

      this.setProgress(
        i + 1,
        total,
        `${i + 1}/${total} — ${report.disbursed} giải ngân, ${report.skipped} chờ, ${report.failed} lỗi`,
      );
    }

    return report;
  }
}
