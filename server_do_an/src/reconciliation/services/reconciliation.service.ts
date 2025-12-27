import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LoanContract } from '../../loan/schemas/loan-contract.schema';
import { InvestmentContract } from '../../invest/schemas/investment-contract.schema';
import { FineractService } from '../../loan/services/fineract.service';
import { FixedDepositService } from '../../loan/services/fixed-deposit.service';

/**
 * Reconciliation Service
 * Port từ FineractFDReconciliationService.js
 */
@Injectable()
export class ReconciliationService {
    private readonly logger = new Logger(ReconciliationService.name);

    constructor(
        @InjectModel(LoanContract.name) private loanModel: Model<LoanContract>,
        @InjectModel(InvestmentContract.name) private investmentModel: Model<InvestmentContract>,
        private readonly fineractService: FineractService,
        private readonly fixedDepositService: FixedDepositService,
    ) { }

    /**
     * Get all Fixed Deposits for a loan
     * Port từ getFixedDepositsByLoan() trong FineractFDReconciliationService.js
     */
    async getFixedDepositsByLoan(loanId: string): Promise<Array<any>> {
        // 1. Get all investments for this loan
        const investments = await this.investmentModel.find({ loanId }).exec();

        if (investments.length === 0) {
            this.logger.warn(`[getFixedDepositsByLoan] No investments found for loan ${loanId}`);
            return [];
        }

        // 2. Get FD details from Fineract for each investment
        const fdAccounts: Array<any> = [];

        for (const inv of investments) {
            if (inv.fineractFixedDepositAccountId) {
                try {
                    const fdDetails = await this.fixedDepositService.getFDAccountDetails(
                        inv.fineractFixedDepositAccountId
                    );

                    fdAccounts.push({
                        // Investment info
                        investmentContractId: inv.contractId,
                        lenderId: inv.lender,

                        // FD info from Fineract
                        fdAccountId: fdDetails.id,
                        fdAccountNo: fdDetails.accountNo,
                        fdExternalId: null, // getFDAccountDetails doesn't return externalId
                        fdBalance: fdDetails.accountBalance || 0,
                        fdInterestRate: fdDetails.nominalAnnualInterestRate,
                        fdStatus: fdDetails.status?.value,
                        fdMaturityDate: fdDetails.maturityDate,

                        // MongoDB tracking
                        principalVND: inv.info?.capital || 0,
                        fixedDepositInterestRate: inv.fixedDepositInterestRate,
                    });
                } catch (error) {
                    this.logger.error(
                        `[getFixedDepositsByLoan] Error getting FD ${inv.fineractFixedDepositAccountId}: ${error.message}`
                    );
                }
            }
        }

        return fdAccounts;
    }

    /**
     * Reconcile loan với Fixed Deposits
     * Port từ reconcileLoan() trong FineractFDReconciliationService.js
     */
    async reconcileLoan(loanId: string): Promise<{
        loanId: string;
        loanPrincipal: number;
        investmentCount: number;
        totalInvestedMongoDB: number;
        fdCount: number;
        totalFDBalance: number;
        isBalanced: boolean;
        mismatches: Array<{
            type: string;
            expected?: number;
            actual?: number;
            difference?: number;
            total?: number;
            withExternalId?: number;
            missing?: number;
        }>;
        fdAccounts: Array<any>;
        summary: any;
    }> {
        // 1. Get loan details
        const loan = await this.loanModel.findOne({ contractId: loanId }).exec();
        if (!loan) {
            throw new Error(`Loan ${loanId} not found`);
        }

        // 2. Get all investments
        const investments = await this.investmentModel.find({ loanId }).exec();

        // 3. Get FD accounts
        const fdAccounts = await this.getFixedDepositsByLoan(loanId);

        // 4. Calculate totals
        const totalInvestedMongoDB = investments.reduce(
            (sum, inv) => sum + (inv.info?.capital || 0),
            0
        );
        const totalFDBalance = fdAccounts.reduce((sum, fd) => sum + fd.fdBalance, 0);
        const totalFDsWithExternalId = fdAccounts.filter((fd) => fd.fdExternalId).length;

        // 5. Check mismatches
        const mismatches: Array<{
            type: string;
            expected?: number;
            actual?: number;
            difference?: number;
            total?: number;
            withExternalId?: number;
            missing?: number;
        }> = [];

        // Check if total invested = loan principal
        if (totalInvestedMongoDB !== loan.info.capital) {
            mismatches.push({
                type: 'LOAN_INVESTMENT_MISMATCH',
                expected: loan.info.capital,
                actual: totalInvestedMongoDB,
                difference: totalInvestedMongoDB - loan.info.capital,
            });
        }

        // Check if FD balance = invested amount
        if (totalFDBalance !== totalInvestedMongoDB) {
            mismatches.push({
                type: 'FD_INVESTMENT_MISMATCH',
                expected: totalInvestedMongoDB,
                actual: totalFDBalance,
                difference: totalFDBalance - totalInvestedMongoDB,
            });
        }

        // Check if all FDs have externalId
        if (totalFDsWithExternalId !== fdAccounts.length) {
            mismatches.push({
                type: 'MISSING_EXTERNAL_ID',
                total: fdAccounts.length,
                withExternalId: totalFDsWithExternalId,
                missing: fdAccounts.length - totalFDsWithExternalId,
            });
        }

        const result = {
            loanId: loanId,
            loanPrincipal: loan.info.capital,
            investmentCount: investments.length,
            totalInvestedMongoDB,
            fdCount: fdAccounts.length,
            totalFDBalance,
            isBalanced: mismatches.length === 0,
            mismatches,
            fdAccounts,
            summary: {
                loan: `${loan.info.capital.toLocaleString('vi-VN')} VND`,
                invested: `${totalInvestedMongoDB.toLocaleString('vi-VN')} VND`,
                fdBalance: `${totalFDBalance.toLocaleString('vi-VN')} VND`,
                status: mismatches.length === 0 ? '✅ MATCHED' : '❌ MISMATCHED',
            },
        };

        this.logger.log(`[reconcileLoan] ${loanId}: ${result.summary.status}`);
        if (mismatches.length > 0) {
            this.logger.warn(`[reconcileLoan] Mismatches:`, JSON.stringify(mismatches));
        }

        return result;
    }

    /**
     * Get FD by externalId
     * Port từ getFDByExternalId() trong FineractFDReconciliationService.js
     */
    async getFDByExternalId(externalId: string): Promise<any> {
        // Extract investment contract ID from externalId
        const investmentContractId = externalId.replace('FD_INV_', '');

        const investment = await this.investmentModel
            .findOne({ contractId: investmentContractId })
            .exec();

        if (!investment || !investment.fineractFixedDepositAccountId) {
            return null;
        }

        // Get FD details
        const fdDetails = await this.fixedDepositService.getFDAccountDetails(
            investment.fineractFixedDepositAccountId
        );

        return {
            investmentContract: investment.contractId,
            loanId: investment.loanContractId,
            lenderId: investment.lender,
            fdAccount: fdDetails,
        };
    }

    /**
     * Query all FDs của một lender
     * Port từ getLenderFixedDeposits() trong FineractFDReconciliationService.js
     */
    async getLenderFixedDeposits(fineractClientId: number): Promise<Array<any>> {
        // Get client details from Fineract
        const clientDetails = await this.fineractService.getClientDetails(fineractClientId);

        const fdAccounts =
            clientDetails.savingsAccounts?.filter(
                (acc) =>
                    acc.depositType?.id === 200 && // Fixed Deposit
                    acc.productId === 3 // FD Product
            ) || [];

        // Enrich với MongoDB data
        const enrichedFDs = await Promise.all(
            fdAccounts.map(async (fd) => {
                // Find investment contract
                const investment = await this.investmentModel
                    .findOne({ fineractFixedDepositAccountId: fd.id })
                    .exec();

                return {
                    fdAccountId: fd.id,
                    fdAccountNo: fd.accountNo,
                    fdExternalId: fd.externalId,
                    fdBalance: fd.accountBalance || 0,
                    fdStatus: fd.status?.value,

                    // Link to investment
                    investmentContractId: investment?.contractId,
                    loanId: investment?.loanContractId,
                    principalVND: investment?.info?.capital,
                    interestRate: investment?.fixedDepositInterestRate,
                };
            })
        );

        return enrichedFDs;
    }
}
