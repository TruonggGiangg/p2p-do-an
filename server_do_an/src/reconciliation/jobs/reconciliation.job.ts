import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { FineractService } from '../../loan/services/fineract.service';
import { LoanContract } from '../../loan/schemas/loan-contract.schema';

/**
 * Reconciliation Job
 * Runs periodically to sync loan status between MongoDB and Fineract
 */
@Injectable()
export class ReconciliationJob implements OnModuleInit {
    private readonly logger = new Logger(ReconciliationJob.name);
    private isRunning = false;
    private intervalId: NodeJS.Timeout | null = null;

    constructor(
        @InjectModel(LoanContract.name) private loanModel: Model<LoanContract>,
        private readonly fineractService: FineractService,
        private readonly configService: ConfigService,
    ) { }

    onModuleInit() {
        const enabled = this.configService.get<boolean>('RECONCILIATION_ENABLED', true);

        if (enabled) {
            this.start();
        } else {
            this.logger.log('[ReconciliationJob] Disabled via config');
        }
    }

    start() {
        this.logger.log('[ReconciliationJob] Job scheduler started');

        // Run after 1 minute startup delay
        setTimeout(() => this.reconcileLoans(), 1 * 60 * 1000);

        // Schedule daily run (24 hours)
        this.intervalId = setInterval(() => this.reconcileLoans(), 24 * 60 * 60 * 1000);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.logger.log('[ReconciliationJob] Job stopped');
        }
    }

    /**
     * Main reconciliation logic
     * Syncs loan status from Fineract to MongoDB
     */
    async reconcileLoans(): Promise<void> {
        if (this.isRunning) {
            this.logger.warn('[ReconciliationJob] Job already running, skipping');
            return;
        }
        this.isRunning = true;

        try {
            this.logger.log('[ReconciliationJob] Starting daily reconciliation...');

            // Find loans in intermediate states that need sync
            const loans = await this.loanModel.find({
                fineractLoanId: { $ne: null },
                status: { $in: ['pending', 'approved', 'funding', 'disbursing'] }
            });

            this.logger.log(`[ReconciliationJob] Found ${loans.length} loans to check`);

            let synced = 0;
            let errors = 0;

            for (const loan of loans) {
                try {
                    const fineractLoan = await this.fineractService.getLoanDetails(loan.fineractLoanId!);

                    if (!fineractLoan || !fineractLoan.status) {
                        continue;
                    }

                    // Map Fineract status to our status
                    const fineractStatus = this.mapFineractStatus(fineractLoan.status);

                    if (fineractStatus && fineractStatus !== loan.status) {
                        this.logger.log(`[ReconciliationJob] Loan ${loan.contractId} status mismatch: MongoDB=${loan.status}, Fineract=${fineractStatus}`);

                        // Update MongoDB to match Fineract (source of truth)
                        loan.status = fineractStatus;

                        // If Active, ensure disbursement is marked complete
                        if (fineractStatus === 'active' || fineractStatus === 'disbursed') {
                            (loan as any).disburse_done = true;
                        }

                        await loan.save();
                        synced++;
                        this.logger.log(`[ReconciliationJob] Loan ${loan.contractId} synced to status: ${fineractStatus}`);
                    }
                } catch (err: any) {
                    errors++;
                    this.logger.error(`[ReconciliationJob] Error checking loan ${loan.contractId}: ${err.message}`);
                }
            }

            this.logger.log(`[ReconciliationJob] Job finished. Synced: ${synced}, Errors: ${errors}`);
        } catch (error: any) {
            this.logger.error('[ReconciliationJob] Job failed:', error.message);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Map Fineract status to our internal status
     */
    private mapFineractStatus(fineractStatusObj: any): string | null {
        const value = fineractStatusObj.value?.toLowerCase() || '';
        const code = fineractStatusObj.code?.toLowerCase() || '';

        if (value.includes('active') || code.includes('active')) {
            return 'active';
        }
        if (value.includes('approved') || code.includes('approved')) {
            return 'approved';
        }
        if (value.includes('closed') && value.includes('obligations met')) {
            return 'closed';
        }
        if (value.includes('closed') || code.includes('closed')) {
            return 'closed';
        }
        if (value.includes('pending') || code.includes('pending')) {
            return 'pending';
        }

        return null;
    }

    /**
     * Manual trigger for reconciliation (used by controller)
     */
    async triggerManualReconciliation(): Promise<{ synced: number; errors: number }> {
        if (this.isRunning) {
            return { synced: 0, errors: 0 };
        }

        await this.reconcileLoans();
        return { synced: 0, errors: 0 }; // TODO: Return actual counts
    }
}
