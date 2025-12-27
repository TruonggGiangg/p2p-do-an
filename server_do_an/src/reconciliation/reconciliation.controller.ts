import { Controller, Get, Param, Query, UseGuards, Logger } from '@nestjs/common';
import { DualAuthGuard } from '../auth/guard/dual-auth.guard';
import { FDReconciliationService } from './services/fd-reconciliation.service';
import { ReconciliationJob } from './jobs/reconciliation.job';

@Controller('reconciliation')
export class ReconciliationController {
    private readonly logger = new Logger(ReconciliationController.name);

    constructor(
        private readonly fdReconciliationService: FDReconciliationService,
        private readonly reconciliationJob: ReconciliationJob,
    ) { }

    /**
     * GET /reconciliation/loan/:loanId
     * Reconcile a specific loan with its Fixed Deposits
     */
    @Get('loan/:loanId')
    @UseGuards(DualAuthGuard)
    async reconcileLoan(@Param('loanId') loanId: string) {
        this.logger.log(`[reconcileLoan] Request for loan: ${loanId}`);

        try {
            const report = await this.fdReconciliationService.reconcileLoan(loanId);

            return {
                success: true,
                data: report,
            };
        } catch (error: any) {
            this.logger.error(`[reconcileLoan] Error: ${error.message}`);
            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * GET /reconciliation/loan/:loanId/fd-accounts
     * Get Fixed Deposit accounts for a loan
     */
    @Get('loan/:loanId/fd-accounts')
    @UseGuards(DualAuthGuard)
    async getLoanFDAccounts(@Param('loanId') loanId: string) {
        this.logger.log(`[getLoanFDAccounts] Request for loan: ${loanId}`);

        try {
            const fdAccounts = await this.fdReconciliationService.getFixedDepositsByLoan(loanId);

            return {
                success: true,
                data: {
                    loanId,
                    fdAccounts,
                    totalFDAccounts: fdAccounts.length,
                    totalFDBalance: fdAccounts.reduce((sum, fd) => sum + fd.fdBalance, 0),
                },
            };
        } catch (error: any) {
            this.logger.error(`[getLoanFDAccounts] Error: ${error.message}`);
            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * GET /reconciliation/admin-transactions
     * Get all transactions from Admin account (for full reconciliation view)
     */
    @Get('admin-transactions')
    @UseGuards(DualAuthGuard)
    async getAdminTransactions(@Query('loanId') loanId?: string) {
        this.logger.log(`[getAdminTransactions] Request for admin transactions`);

        try {
            const transactions = await this.fdReconciliationService.getAdminTransactions(loanId);

            return {
                success: true,
                data: {
                    transactions,
                    count: transactions.length,
                },
            };
        } catch (error: any) {
            this.logger.error(`[getAdminTransactions] Error: ${error.message}`);
            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * GET /reconciliation/trigger-sync
     * Manually trigger loan status sync (admin only)
     */
    @Get('trigger-sync')
    @UseGuards(DualAuthGuard)
    async triggerSync() {
        this.logger.log(`[triggerSync] Manual sync triggered`);

        try {
            const result = await this.reconciliationJob.triggerManualReconciliation();

            return {
                success: true,
                message: 'Reconciliation job triggered',
                data: result,
            };
        } catch (error: any) {
            this.logger.error(`[triggerSync] Error: ${error.message}`);
            return {
                success: false,
                message: error.message,
            };
        }
    }
}
