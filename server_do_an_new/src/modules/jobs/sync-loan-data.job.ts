/**
 * SyncLoanDataJob — Đồng bộ TOÀN BỘ dữ liệu khoản vay từ Fineract → MongoDB
 *
 * Lấy full data: schedule, transactions, charges, collateral, delinquency...
 * Sử dụng existing syncLoanFromFineract() cho mỗi khoản vay.
 *
 * Xử lý: batch + concurrent (Promise.allSettled) + thanh tiến trình
 */

import { BadRequestException } from '@nestjs/common';
import { BaseJob } from './base-job';
import { AdminService } from '../admin/admin.service';

export class SyncLoanDataJob extends BaseJob {
  constructor(private readonly adminService: AdminService) {
    super({
      name: 'SyncLoanData',
      description: 'Đồng bộ toàn bộ dữ liệu khoản vay (schedule, transactions, delinquency...) — nặng, chạy từng nhóm',
      intervalMs: 30 * 60 * 1000, // 30 phút
      enabled: false,
      runOnStart: false,
      params: {
        batchSize: 5,
        concurrency: 3,
        maxLoans: 500,
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
          description: 'Số request Fineract gửi đồng thời (tránh quá tải Fineract)',
          type: 'number',
          unit: 'luồng',
        },
        {
          key: 'maxLoans',
          label: 'Giới hạn khoản vay',
          description: 'Số khoản vay tối đa lấy từ Fineract mỗi lần chạy',
          type: 'number',
          unit: 'khoản',
        },
        {
          key: 'intervalMs',
          label: 'Tần suất chạy',
          description: 'Khoảng cách giữa mỗi lần chạy đồng bộ toàn phần',
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
    const batchSize = this.params.batchSize || 5;
    const concurrency = this.params.concurrency || 3;
    const maxLoans = this.params.maxLoans || 500;

    // 1. Lấy danh sách khoản vay từ Fineract
    this.setProgress(0, 0, 'Đang lấy danh sách khoản vay từ Fineract...');
    const fineractLoans = await (this.adminService as any).fineractLoanService.getAllLoans(maxLoans);
    const loanIds: number[] = (fineractLoans || [])
      .map((l: any) => l.id ?? l.loanId)
      .filter((id: any) => id != null)
      .map(Number);

    const total = loanIds.length;
    let synced = 0, errors = 0, skipped = 0;
    const details: any[] = [];

    this.setProgress(0, total, `Sẽ đồng bộ ${total} khoản vay, mỗi nhóm ${batchSize} (${concurrency} luồng)...`);

    // 2. Chia thành từng batch
    for (let i = 0; i < total; i += batchSize) {
      const batch = loanIds.slice(i, i + batchSize);

      // 3. Chia batch thành chunks theo concurrency
      const chunks: number[][] = [];
      for (let j = 0; j < batch.length; j += concurrency) {
        chunks.push(batch.slice(j, j + concurrency));
      }

      for (const chunk of chunks) {
        const results = await Promise.allSettled(
          chunk.map(async (fid) => {
            try {
              await this.adminService.syncLoanFromFineract(fid);
              return { fid, status: 'synced' as const };
            } catch (err: any) {
              if (err instanceof BadRequestException && err.message?.includes('No local user found')) {
                return { fid, status: 'skipped' as const, message: 'Không có user local' };
              }
              return { fid, status: 'error' as const, message: err.message };
            }
          }),
        );

        for (const r of results) {
          if (r.status === 'fulfilled') {
            if (r.value.status === 'synced') synced++;
            else if (r.value.status === 'skipped') skipped++;
            else {
              errors++;
              details.push(r.value);
            }
          } else {
            errors++;
            details.push({ status: 'error', message: r.reason?.message });
          }
        }
      }

      const processed = Math.min(i + batchSize, total);
      const percent = Math.round((processed / total) * 100);
      this.setProgress(processed, total, `${processed}/${total} (${percent}%) — ${synced} OK, ${errors} lỗi, ${skipped} bỏ qua`);
    }

    return {
      total,
      synced,
      errors,
      skipped,
      details: details.slice(0, 20),
    };
  }
}
