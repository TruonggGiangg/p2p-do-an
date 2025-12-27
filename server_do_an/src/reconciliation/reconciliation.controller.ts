import { Controller, Get, Param, Post, UseGuards, HttpStatus, HttpCode } from '@nestjs/common';
import { ReconciliationService } from './services/reconciliation.service';
import { ReconciliationCron } from './services/reconciliation.cron';

/**
 * Reconciliation Controller
 * Endpoints để admin kiểm tra đối soát
 */
@Controller('reconciliation')
export class ReconciliationController {
    constructor(
        private readonly reconciliationService: ReconciliationService,
        private readonly reconciliationCron: ReconciliationCron,
    ) { }

    /**
     * Reconcile một loan cụ thể
     * GET /reconciliation/loan/:loanId
     */
    @Get('loan/:loanId')
    async reconcileLoan(@Param('loanId') loanId: string) {
        return await this.reconciliationService.reconcileLoan(loanId);
    }

    /**
     * Get Fixed Deposits cho một loan
     * GET /reconciliation/loan/:loanId/fixed-deposits
     */
    @Get('loan/:loanId/fixed-deposits')
    async getFixedDepositsByLoan(@Param('loanId') loanId: string) {
        return await this.reconciliationService.getFixedDepositsByLoan(loanId);
    }

    /**
     * Get Fixed Deposits của một lender
     * GET /reconciliation/lender/:fineractClientId
     */
    @Get('lender/:fineractClientId')
    async getLenderFixedDeposits(@Param('fineractClientId') fineractClientId: string) {
        const clientId = parseInt(fineractClientId, 10);
        return await this.reconciliationService.getLenderFixedDeposits(clientId);
    }

    /**
     * Trigger daily reconciliation job manually (admin only)
     * POST /reconciliation/run-daily
     */
    @Post('run-daily')
    @HttpCode(HttpStatus.OK)
    async runDailyReconciliation() {
        const result = await this.reconciliationCron.reconcileLoans();
        return {
            success: true,
            message: 'Daily reconciliation job completed',
            statistics: result,
        };
    }
}
