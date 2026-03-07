import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LoanApplication } from '../loan/schemas/loan-application.schema';
import { FineractLoanService } from '../fineract/services/fineract-loan.service';

@Injectable()
export class WebhooksService {
    private readonly logger = new Logger(WebhooksService.name);

    constructor(
        @InjectModel(LoanApplication.name) private loanApplicationModel: Model<LoanApplication>,
        private readonly fineractLoanService: FineractLoanService,
    ) { }

    async processWebhook(payload: any) {
        const action = payload.actionName?.toUpperCase();
        const entity = payload.entityName?.toUpperCase();
        const loanId = payload.resourceId || payload.entityId || payload.loanId;

        if (entity === 'LOAN' || entity === 'LOANPRODUCT') {
            this.logger.log(`Processing Webhook for LOAN ${loanId} - Action: ${action}`);
            await this.syncLoanData(loanId);
        } else {
            this.logger.log(`Ignoring webhook for entity: ${entity}, action: ${action}`);
        }
    }

    async syncLoanData(fineractLoanId: number) {
        if (!fineractLoanId) return;

        try {
            const loanDetails = await this.fineractLoanService.getLoanDetails(fineractLoanId.toString());
            if (!loanDetails) {
                this.logger.warn(`Could not fetch details for Fineract loan ${fineractLoanId}`);
                return;
            }

            const summary = loanDetails.summary || {};
            const outstandingAmount = summary.totalOutstanding || 0;
            const totalPenaltyExpected = summary.penaltyChargesOutstanding || 0;
            const totalFeeExpected = summary.feeChargesOutstanding || 0;
            const totalOverdue = summary.totalOverdue || 0;

            const fineractStatusString = loanDetails.status?.value || '';

            const delinquentDays = loanDetails.delinquent?.delinquentDays || 0;
            const delinquencyClassification = loanDetails.delinquencyRange?.classification || null;

            await this.loanApplicationModel.updateOne(
                { fineractLoanId },
                {
                    $set: {
                        outstandingAmount,
                        totalPenaltyExpected,
                        totalFeeExpected,
                        totalOverdue,
                        delinquentDays,
                        delinquencyClassification,
                        fineractStatusString
                    }
                }
            );

            this.logger.log(`[Sync] Updated Local Loan (FineractID: ${fineractLoanId}) - Overdue: ${totalOverdue}, Days: ${delinquentDays}, Group: ${delinquencyClassification}`);
        } catch (error: any) {
            this.logger.error(`Failed to sync loan data for ${fineractLoanId}: ${error.message}`);
        }
    }
}
