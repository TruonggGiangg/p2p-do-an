import { Injectable, Logger } from '@nestjs/common';
// import { Cron } from '@nestjs/schedule';
import { AdminService } from './admin.service';

/**
 * LoanSyncScheduler — DEPRECATED
 * Đã thay thế bởi ReconciliationJob trong JobsModule.
 * Giữ lại class để không break AdminModule providers nhưng không chạy cron.
 */
@Injectable()
export class LoanSyncScheduler {
  private readonly logger = new Logger(LoanSyncScheduler.name);

  constructor(private readonly adminService: AdminService) {
    this.logger.log('LoanSyncScheduler DEPRECATED — use ReconciliationJob via JobsModule');
  }
}
