import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LoanContract } from '../../loan/schemas/loan-contract.schema';
import { FineractService } from '../../loan/services/fineract.service';

/**
 * Reconciliation Cron Job
 * Port từ ReconciliationJob.js
 * Chạy định kỳ hàng ngày để đồng bộ Loan status từ Fineract
 */
@Injectable()
export class ReconciliationCron {
    private readonly logger = new Logger(ReconciliationCron.name);
    private isRunning = false;

    constructor(
        @InjectModel(LoanContract.name) private loanModel: Model<LoanContract>,
        private readonly fineractService: FineractService,
    ) { }

    /**
     * Run daily at midnight
     * Cron format: second (optional) minute hour day month day-of-week
     */
    @Cron('0 0 * * *', {
        name: 'reconciliation-daily',
        timeZone: 'Asia/Ho_Chi_Minh',
    })
    async handleDailyReconciliation() {
        await this.reconcileLoans();
    }

    /**
     * Reconcile loans với Fineract (có thể call manually)
     * Port từ reconcileLoans() trong ReconciliationJob.js
     */
    async reconcileLoans(): Promise<{ processed: number; updated: number; errors: number }> {
        if (this.isRunning) {
            this.logger.log('[ReconciliationCron] Job already running, skipping.');
            return { processed: 0, updated: 0, errors: 0 };
        }

        this.isRunning = true;
        let processedCount = 0;
        let updatedCount = 0;
        let errorCount = 0;

        try {
            this.logger.log('[ReconciliationCron] Starting daily reconciliation job...');

            // Find loans that are in intermediate states
            const loans = await this.loanModel
                .find({
                    fineractLoanId: { $ne: null },
                    fineractStatus: {
                        $in: ['SUBMITTED_AND_PENDING_APPROVAL', 'APPROVED'],
                    },
                })
                .exec();

            this.logger.log(`[ReconciliationCron] Found ${loans.length} loans to check.`);

            for (const loan of loans) {
                processedCount++;
                try {
                    if (!loan.fineractLoanId) {
                        this.logger.warn(`[ReconciliationCron] Loan ${loan.contractId} has no fineractLoanId, skipping`);
                        continue;
                    }

                    const fineractLoan = await this.fineractService.getLoanDetails(
                        loan.fineractLoanId
                    );

                    // Map Fineract status to our enum
                    let fineractStatus = fineractLoan.status?.value
                        ?.toUpperCase()
                        .replace(/ /g, '_');

                    // Handle specific Fineract status mappings
                    if (fineractLoan.status?.value === 'Active') fineractStatus = 'ACTIVE';
                    if (fineractLoan.status?.value === 'Approved') fineractStatus = 'APPROVED';
                    if (fineractLoan.status?.value === 'Closed (Obligations met)')
                        fineractStatus = 'CLOSED_OBLIGATIONS_MET';

                    if (fineractStatus !== loan.fineractStatus) {
                        this.logger.log(
                            `[ReconciliationCron] Loan ${loan.contractId} status mismatch. Mongo: ${loan.fineractStatus}, Fineract: ${fineractStatus}`
                        );

                        // Update Mongo to match Fineract (Source of Truth for financial status)
                        loan.fineractStatus = fineractStatus;

                        // If Active, ensure disburse_done is true
                        if (fineractStatus === 'ACTIVE') {
                            loan.disburse_done = true;
                            if (!loan.disburse_date) {
                                loan.disburse_date = new Date();
                            }
                        }

                        await loan.save();
                        updatedCount++;
                        this.logger.log(`[ReconciliationCron] Loan ${loan.contractId} updated.`);
                    }
                } catch (err) {
                    errorCount++;
                    this.logger.error(
                        `[ReconciliationCron] Error checking loan ${loan.contractId}: ${err.message}`
                    );
                }
            }

            this.logger.log('[ReconciliationCron] Job finished.');
            this.logger.log(
                `[ReconciliationCron] Stats: Processed=${processedCount}, Updated=${updatedCount}, Errors=${errorCount}`
            );

            return { processed: processedCount, updated: updatedCount, errors: errorCount };
        } catch (error) {
            this.logger.error(`[ReconciliationCron] Job failed: ${error}`);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }
}
