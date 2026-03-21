/**
 * ReconciliationJob — Đồng bộ trạng thái khoản vay Fineract → MongoDB
 * Pattern: HD-AMC ReconciliationJob.js
 *
 * Lấy tất cả loans từ Fineract, so sánh status với MongoDB,
 * cập nhật nếu có thay đổi (dùng existing syncLoanFromFineract).
 */

import { BaseJob } from './base-job';
import { AdminService } from '../admin/admin.service';

export class ReconciliationJob extends BaseJob {
  constructor(private readonly adminService: AdminService) {
    super({
      name: 'Reconciliation',
      description: 'Đồng bộ trạng thái khoản vay giữa Fineract và MongoDB',
      intervalMs: 5 * 60 * 1000, // 5 phút
      enabled: false,
      runOnStart: false,
      params: {
        batchSize: 100,
      },
      paramsSchema: [
        {
          key: 'batchSize',
          label: 'Số lượng mỗi lần',
          description: 'Số khoản vay kiểm tra tối đa trong 1 lần chạy',
          type: 'number',
          unit: 'khoản',
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
          description: 'Nếu đặt, chỉ chạy 1 lần/ngày vào giờ này (HH:mm). Bỏ trống = chạy theo tần suất',
          type: 'time',
        },
      ],
    });
  }

  /**
   * Đồng bộ tất cả khoản vay Fineract → MongoDB
   * Sử dụng existing AdminService.syncDisbursedLoansFromFineract
   */
  async execute(): Promise<{
    totalFromFineract: number;
    synced: number;
    errors: number;
    skipped: number;
  }> {
    const batchSize = this.params.batchSize || 100;

    this.logger.log(`[execute] Starting sync with batchSize=${batchSize}`);

    const result = await this.adminService.syncDisbursedLoansFromFineract(
      batchSize,
      { trigger: 'cron' },
    );

    return {
      totalFromFineract: result.synced + result.errors + result.skipped,
      synced: result.synced,
      errors: result.errors,
      skipped: result.skipped,
    };
  }
}
