import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AdminService } from './admin.service';

/**
 * Cron job: sync active loans from Fineract to MongoDB (overdue/delinquency data).
 * Runs daily at 2:00 AM.
 */
@Injectable()
export class LoanSyncScheduler {
  private readonly logger = new Logger(LoanSyncScheduler.name);

  constructor(private readonly adminService: AdminService) {}

  @Cron('0 2 * * *')
  async handleSyncAllActiveLoans() {
    this.logger.log('[handleSyncAllActiveLoans] Starting batch sync (disbursed loans from Fineract)');
    try {
      const result = await this.adminService.syncDisbursedLoansFromFineract(300, { trigger: 'cron' });
      this.logger.log(
        `[handleSyncAllActiveLoans] Finished. synced=${result.synced} errors=${result.errors} skipped=${result.skipped}`,
      );
    } catch (err: any) {
      this.logger.error(`[handleSyncAllActiveLoans] Failed: ${err?.message}`);
    }
  }
}
