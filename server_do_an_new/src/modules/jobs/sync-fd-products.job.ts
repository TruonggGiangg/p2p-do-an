/**
 * SyncFDProductsJob — Đồng bộ sản phẩm Quỹ đầu tư có kỳ hạn (Fixed Deposit) giữa Fineract ↔ MongoDB
 * Sử dụng AdminService.compareAndSyncFD() để so sánh + lưu snapshot + ghi drift log
 */

import { BaseJob } from './base-job';
import { AdminService } from '../admin/admin.service';

export class SyncFDProductsJob extends BaseJob {
  constructor(private readonly adminService: AdminService) {
    super({
      name: 'SyncFDProducts',
      description: 'So sánh danh sách sản phẩm Quỹ đầu tư có kỳ hạn (Fixed Deposit) giữa Fineract và MongoDB, phát hiện thay đổi (thêm / xóa / sửa)',
      intervalMs: 30 * 60 * 1000, // 30 phút
      enabled: true,
      runOnStart: true,
      params: {},
      paramsSchema: [
        {
          key: 'intervalMs',
          label: 'Tần suất chạy',
          description: 'Khoảng cách giữa mỗi lần đồng bộ sản phẩm quỹ đầu tư có kỳ hạn',
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

  async execute(): Promise<{
    added: number;
    removed: number;
    modified: number;
    details: any[];
  }> {
    this.logger.log('[execute] Comparing Fixed Deposit products with Fineract...');

    const result = await this.adminService.compareAndSyncFD(true);

    const details = [
      ...result.added.map(p => ({ action: 'added', id: p.id, name: p.name })),
      ...result.removed.map(p => ({ action: 'removed', id: p.id, name: p.name })),
      ...result.modified.map(p => ({ action: 'modified', id: p.id, name: p.name, changes: (p as any).fieldChanges?.length || 0 })),
    ];

    return {
      added: result.added.length,
      removed: result.removed.length,
      modified: result.modified.length,
      details,
    };
  }
}
