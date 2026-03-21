/**
 * SyncLoanStatusJob — Đồng bộ TRẠNG THÁI khoản vay (nhẹ, nhanh)
 *
 * Chỉ query Fineract với associations=summary (không lấy schedule, transactions, charges)
 * Cập nhật status, outstanding, overdue vào MongoDB.
 *
 * Xử lý: batch + concurrent (Promise.allSettled) + thanh tiến trình
 */

import { BaseJob } from './base-job';
import { AdminService } from '../admin/admin.service';

export class SyncLoanStatusJob extends BaseJob {
  constructor(private readonly adminService: AdminService) {
    super({
      name: 'SyncLoanStatus',
      description: 'Đồng bộ nhanh trạng thái khoản vay (status, outstanding, overdue) — nhẹ, không lấy full data',
      intervalMs: 5 * 60 * 1000, // 5 phút
      enabled: false,
      runOnStart: false,
      params: {
        batchSize: 10,
        concurrency: 5,
      },
      paramsSchema: [
        {
          key: 'batchSize',
          label: 'Kích thước nhóm',
          description: 'Số khoản vay xử lý trong mỗi batch',
          type: 'number',
          unit: 'khoản',
        },
        {
          key: 'concurrency',
          label: 'Số luồng',
          description: 'Số request Fineract gửi đồng thời trong mỗi batch',
          type: 'number',
          unit: 'luồng',
        },
        {
          key: 'intervalMs',
          label: 'Tần suất chạy',
          description: 'Khoảng cách giữa mỗi lần đồng bộ',
          type: 'interval',
        },
        {
          key: 'scheduleTime',
          label: 'Giờ chạy cố định',
          description: 'Chạy 1 lần/ngày vào giờ này (HH:mm). Bỏ trống = chạy theo tần suất',
          type: 'time',
        },
      ],
    });
  }

  async execute() {
    const batchSize = this.params.batchSize || 10;
    const concurrency = this.params.concurrency || 5;

    // 1. Lấy tất cả khoản vay local có fineractLoanId
    const localLoans = await (this.adminService as any).loanApplicationModel
      .find({ fineractLoanId: { $ne: null } })
      .select('fineractLoanId status')
      .lean();

    const total = localLoans.length;
    let synced = 0, errors = 0;
    const errorDetails: any[] = [];

    this.setProgress(0, total, `Đang chuẩn bị ${total} khoản vay...`);

    // 2. Xử lý từng batch
    for (let i = 0; i < total; i += batchSize) {
      const batch = localLoans.slice(i, i + batchSize);

      // 3. Chia batch thành chunks theo concurrency
      const chunks: any[][] = [];
      for (let j = 0; j < batch.length; j += concurrency) {
        chunks.push(batch.slice(j, j + concurrency));
      }

      for (const chunk of chunks) {
        const results = await Promise.allSettled(
          chunk.map(async (loan: any) => {
            const fid = loan.fineractLoanId;
            try {
              // Query nhẹ: chỉ summary + status (không lấy schedule, transactions)
              const fl = await (this.adminService as any).fineractLoanService.client
                .get(`/loans/${fid}?associations=summary`)
                .then((r: any) => r.data);
              if (!fl) return { fid, status: 'error' as const, message: 'No data' };

              // Map status
              const fStatus = fl.status || {};
              let internalStatus = 'pending';
              if (fStatus.active) internalStatus = 'disbursed';
              if (fStatus.closed) internalStatus = 'closed';
              if (fStatus.waitingForDisbursal) internalStatus = 'approved';
              if (fStatus.overpaid) internalStatus = 'closed';

              const summary = fl.summary || {};
              const update: any = {
                status: internalStatus,
                fineractStatusString: fStatus.value || fStatus.code,
                outstandingAmount: summary.totalOutstanding || 0,
                totalOverdue: summary.totalOverdue || 0,
                totalPenaltyExpected: summary.penaltyChargesOverdue || 0,
                totalFeeExpected: summary.feeChargesOverdue || 0,
                principalPaid: summary.principalPaid || 0,
                principalOutstanding: summary.principalOutstanding || 0,
                interestPaid: summary.interestPaid || 0,
                interestOutstanding: summary.interestOutstanding || 0,
                totalPaid: summary.totalRepaymentExpected ? (summary.totalRepaymentExpected - (summary.totalOutstanding || 0)) : 0,
                totalOutstanding: summary.totalOutstanding || 0,
                lastSyncedAt: new Date(),
              };

              // Sync purpose nếu chưa có
              if (fl.loanPurposeName || fl.loanPurpose?.name) {
                update.willing = fl.loanPurposeName || fl.loanPurpose?.name;
              }

              await (this.adminService as any).loanApplicationModel.updateOne(
                { fineractLoanId: fid },
                { $set: update },
              );
              return { fid, status: 'synced' as const };
            } catch (err: any) {
              return { fid, status: 'error' as const, message: err.message };
            }
          }),
        );

        for (const r of results) {
          if (r.status === 'fulfilled') {
            if (r.value.status === 'synced') synced++;
            else { errors++; errorDetails.push(r.value); }
          } else {
            errors++;
          }
        }
      }

      const processed = Math.min(i + batchSize, total);
      const percent = Math.round((processed / total) * 100);
      this.setProgress(processed, total, `${processed}/${total} (${percent}%) — ${synced} OK, ${errors} lỗi`);
    }

    return { total, synced, errors, errorDetails: errorDetails.slice(0, 10) };
  }
}
