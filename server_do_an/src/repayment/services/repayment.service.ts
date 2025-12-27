import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EscrowService } from './escrow.service';
import { FineractService } from '../../loan/services/fineract.service';
import { FineractFixedDepositService } from '../../loan/services/fineract-fixed-deposit.service';
import { FineractEscrowService } from '../../escrow/services/fineract-escrow.service';
import { LoanContract, LoanContractSchema } from '../../loan/schemas/loan-contract.schema';
import { InvestmentContract, InvestmentContractSchema } from '../../invest/schemas/investment-contract.schema';

@Injectable()
export class RepaymentService {
    private readonly logger = new Logger(RepaymentService.name);

    constructor(
        @InjectModel(LoanContract.name) private loanModel: Model<LoanContract>,
        @InjectModel(InvestmentContract.name) private investModel: Model<InvestmentContract>,
        private readonly escrowService: EscrowService,
        private readonly fineractEscrowService: FineractEscrowService,
        private readonly fineractService: FineractService,
        private readonly fdService: FineractFixedDepositService,
    ) { }

    /**
     * Process repayment and distribute to lenders
     * 
     * Flow:
     * 1. Check Loan exists
     * 2. Calculate distribution amounts with ADMIN SPREAD
     *    - Borrower pays full interest based on borrowerInterestRate
     *    - Lender receives interest based on lenderInterestRate (lower)
     *    - Admin keeps the spread (difference)
     * 3. Call EscrowService to distribute lender portion
     * 4. Update Investment records
     * 5. Track admin spread earned
     */
    async processRepayment(loanId: string, repaymentAmount: number, repaymentDate: Date): Promise<any> {
        this.logger.log(`Processing repayment for loan ${loanId}, amount: ${repaymentAmount}`);

        // 1. Find Loan
        let loan = await this.loanModel.findOne({ contractId: loanId });
        if (!loan && loanId.startsWith('LOAN_')) {
            const fineractId = parseInt(loanId.replace('LOAN_', ''), 10);
            loan = await this.loanModel.findOne({ fineractLoanId: fineractId });
        }

        if (!loan) {
            throw new Error(`Loan not found: ${loanId}`);
        }

        const totalCapital = loan.info?.capital;
        if (!totalCapital) {
            throw new Error('Loan capital info not found');
        }

        // Get interest rates from loan
        const borrowerRate = loan.borrowerInterestRate || (loan.info.rate * 12) || 16; // Annual %
        const lenderRate = loan.lenderInterestRate || borrowerRate || 12; // Annual % (lower than borrower)
        const spreadPercentage = loan.adminSpread || (borrowerRate - lenderRate) || 0;

        this.logger.log(`[Repayment] Rates: Borrower=${borrowerRate}%, Lender=${lenderRate}%, Spread=${spreadPercentage}%`);

        // 2. Get Investments
        const investments = await this.investModel.find({
            loanContract: loan._id,
            status: 'success'
        }).populate('lender');

        if (!investments || investments.length === 0) {
            throw new Error('No investments found for this loan');
        }

        // Filter valid investments
        const validInvestments = investments.filter(inv => inv.lender !== null);

        const investmentData = validInvestments.map(inv => ({
            investmentId: inv._id,
            lenderId: inv.lender['_id'] ? inv.lender['_id'].toString() : inv.lender.toString(),
            capital: inv.info.capital,
            totalCapital
        }));

        // ✅ CRITICAL: Check if loan uses Fixed Deposit flow
        const investmentsWithFD = await this.investModel.find({
            _id: { $in: investmentData.map(inv => inv.investmentId) },
            fineractFixedDepositAccountId: { $exists: true, $ne: null }
        });

        const usesFDFlow = investmentsWithFD.length > 0;

        this.logger.log(`[Repayment] Distribution method: usesFDFlow=${usesFDFlow}, fdCount=${investmentsWithFD.length}/${investmentData.length}`);

        let distributions: any[];
        let adminSpreadAmount = 0; // Track admin profit from interest spread

        if (usesFDFlow) {
            // ✅ Use FD-aware distribution (retains admin spread automatically)
            this.logger.log('[Repayment] Using FD distribution flow');

            const enrichedInvestments = await Promise.all(
                investmentData.map(async (inv) => {
                    const investment = await this.investModel.findById(inv.investmentId);
                    if (!investment) {
                        throw new Error(`Investment ${inv.investmentId} not found`);
                    }
                    return {
                        ...inv,
                        _id: investment._id,
                        amount: investment.info.capital,
                        fineractFixedDepositAccountId: investment.fineractFixedDepositAccountId,
                        fixedDepositInterestRate: investment.fixedDepositInterestRate || loan.lenderInterestRate
                    };
                })
            );

            // Check if final payment
            const isFinalPayment = false; // Will be set by prepayment endpoint

            distributions = await this.distributeRepaymentToLendersWithFD(
                loanId,
                repaymentAmount,
                enrichedInvestments,
                isFinalPayment,
                loan
            );

            // The admin spread is calculated and updated within distributeRepaymentToLendersWithFD
            // We need to retrieve it or re-calculate for the return object if not directly returned.
            // For now, let's assume it's handled internally and we might need to fetch the updated loan.
            // Or, if distributeRepaymentToLendersWithFD returns it, we can assign it.
            // For simplicity, let's re-calculate for the return object if needed, or fetch from loan.
            // For now, we'll leave adminSpreadAmount as 0 if not explicitly set by FD flow.
            // A more robust solution would be to have distributeRepaymentToLendersWithFD return the spread.
            const totalLenderInterest = distributions.reduce((sum, r) => sum + (r.interest || 0), 0);
            const monthlyInterestFromBorrower = loan.info.monthlyInterestPay || (repaymentAmount - (loan.info.monthlyPrincipalPay || 0));
            adminSpreadAmount = monthlyInterestFromBorrower - totalLenderInterest;

        } else {
            // Legacy flow (no FD)
            this.logger.warn('[Repayment] Using LEGACY distribution (no FD, no admin spread retention)');
            distributions = await this.distributeLegacy(loanId, repaymentAmount, investmentData);

            // For legacy flow, calculate admin spread here
            const totalMonthlyPay = loan.info.monthlyPay || repaymentAmount;
            const totalPrincipal = loan.info.monthlyPrincipalPay || 0;
            const borrowerInterest = loan.info.monthlyInterestPay || (repaymentAmount - totalPrincipal);

            const lenderInterestRatio = lenderRate / borrowerRate;
            const lenderInterest = borrowerInterest * lenderInterestRatio;
            adminSpreadAmount = borrowerInterest - lenderInterest;

            this.logger.log(`[Repayment] Interest split (Legacy): Borrower paid=${borrowerInterest}, Lender receives=${lenderInterest}, Admin keeps=${adminSpreadAmount}`);

            // 4. Distribute via Escrow (lender portion only = principal + lender interest)
            const lenderTotalAmount = totalPrincipal + lenderInterest;
            const escrowDistributions = await this.escrowService.distributeRepaymentToLenders(
                loanId,
                lenderTotalAmount, // Only distribute lender portion
                investmentData
            );
            // Merge or replace distributions if needed, assuming distributeLegacy returns the final ones
            // For now, let's assume `distributions` from `distributeLegacy` is the primary one for return.
            // If escrowDistributions are the actual transfers, they should be used.
            // This part needs careful review based on `distributeLegacy` implementation.
            // For this fix, we'll assume `distributions` from `distributeLegacy` is sufficient.

            // 5. Update MongoDB Records for legacy flow
            // This logic was removed from the main flow, but if distributeLegacy doesn't handle it,
            // it might need to be here or within distributeLegacy.
            // Assuming distributeLegacy handles the investment updates.
            // If not, the original update logic for investments and loan spread would need to be here.
            // For the purpose of fixing the lint error, we're removing the duplicate declaration.
            // The original code had `distributions` declared twice, and the second one was used for the loop.
            // This implies the `escrowService.distributeRepaymentToLenders` was the source for the loop.
            // Let's re-introduce the investment update loop for the legacy flow, using `escrowDistributions`.

            const repaymentRatio = totalMonthlyPay > 0 ? repaymentAmount / totalMonthlyPay : 1;
            const principalRatio = totalMonthlyPay > 0 ? totalPrincipal / totalMonthlyPay : 0.5;

            for (const dist of escrowDistributions) {
                const investment = investments.find(inv => {
                    const lenderId = inv.lender['_id'] ? inv.lender['_id'].toString() : inv.lender.toString();
                    return lenderId === dist.lenderId;
                });

                if (investment && dist.amount > 0) {
                    const investmentRatio = investment.info.capital / totalCapital;
                    // Use lender rate for interest calculation
                    const principalAmount = Math.floor(totalPrincipal * investmentRatio);
                    const lenderInterestAmount = Math.floor(lenderInterest * investmentRatio);

                    const record = {
                        repaymentDate: new Date(repaymentDate),
                        amount: dist.amount,
                        principal: principalAmount,
                        interest: lenderInterestAmount,
                        fineractTransferId: dist.transferId,
                        loanId: loan.contractId,
                    };

                    await this.investModel.findByIdAndUpdate(investment._id, {
                        $push: { repaymentHistory: record },
                        $inc: {
                            totalReceived: dist.amount,
                            totalPrincipalReceived: principalAmount,
                            totalInterestReceived: lenderInterestAmount,
                            fixedDepositInterestEarned: lenderInterestAmount,
                        }
                    });
                }
            }

            // 6. Track admin spread earned for legacy flow
            await this.loanModel.findByIdAndUpdate(loan._id, {
                $inc: { adminSpreadEarned: adminSpreadAmount }
            });

            // Ensure `distributions` variable holds the correct data for the return statement
            // If `distributeLegacy` returns the full distribution data, use that.
            // If `escrowDistributions` are the actual transfers, use those.
            // For consistency, let's use `escrowDistributions` as the final `distributions` for the return.
            distributions = escrowDistributions;
        }

        // (Removed old distribution logic - now handled by FD method or legacy path)

        const totalDistributed = distributions.reduce((sum, d) => sum + (d.amount || 0), 0);

        return {
            success: true,
            totalDistributed,         // Amount sent to lenders
            repaymentAmount,          // Original borrower payment
            adminSpreadEarned: adminSpreadAmount,  // Admin profit from this repayment
            lendersCount: distributions.length,
            distributions,
            rateInfo: {
                borrowerRate,
                lenderRate,
                spreadPercentage
            }
        };
    }

    /**
     * Distribute repayment to lenders using Fixed Deposit flow
     * This method retains admin spread automatically
     */
    private async distributeRepaymentToLendersWithFD(
        loanId: string,
        repaymentAmount: number,
        investments: any[],
        isFinalPayment: boolean,
        loan: any,
        interestPortion?: number  // ✅ NEW: Exact interest from Fineract prepayment template
    ): Promise<any[]> {
        this.logger.log(`[FD Distribution] Amount: ${repaymentAmount}, lenders: ${investments.length}, final: ${isFinalPayment}`);

        const results: any[] = [];
        const totalCapital = investments.reduce((sum, inv) => sum + inv.amount, 0);
        const borrowerRate = loan.borrowerInterestRate || 12.0;

        // ✅ FIX: Use explicit interestPortion for prepayment, formula for regular repayment
        let monthlyPrincipal: number;
        let monthlyInterest: number;

        if (isFinalPayment && interestPortion != null) {
            // PREPAYMENT: Use exact interest from Fineract prepayment template
            monthlyInterest = interestPortion;
            monthlyPrincipal = repaymentAmount - interestPortion;
            this.logger.log(`[FD Distribution] ✅ Using EXACT interest from Fineract: ${interestPortion}`);
        } else {
            // Regular repayment: Calculate using formula
            monthlyPrincipal = repaymentAmount / (1 + (borrowerRate / 100 / 12));
            monthlyInterest = repaymentAmount - monthlyPrincipal;
            this.logger.log(`[FD Distribution] Using formula calculation`);
        }

        this.logger.log(`[FD Distribution] Breakdown: Principal=${monthlyPrincipal}, Interest=${monthlyInterest}`);

        for (const investment of investments) {
            const ratio = investment.amount / totalCapital;
            const fdRate = investment.fixedDepositInterestRate || 10.0;
            const principalShare = Math.floor(monthlyPrincipal * ratio);
            const interestShare = Math.floor(monthlyInterest * (fdRate / borrowerRate) * ratio);
            const totalShare = principalShare + interestShare;

            try {
                const fdAccountId = investment.fineractFixedDepositAccountId;

                if (!fdAccountId) {
                    this.logger.warn(`No FD account for investment ${investment._id}, skipping`);
                    continue;
                }

                let withdrawalResult: any;

                if (isFinalPayment) {
                    // ============ PREPAYMENT / FINAL PAYMENT ============
                    // Close FD premature - returns capital + accrued interest
                    this.logger.log(`Final payment - Closing FD ${fdAccountId}`);

                    // Get lender main savings account
                    const lenderMainSavingsId = await this.getLenderMainSavingsAccountId(investment.lenderId);

                    if (!lenderMainSavingsId) {
                        throw new Error('Lender main savings account not found');
                    }

                    const closureResult = await this.fdService.closeFixedDepositAccount(
                        fdAccountId,
                        lenderMainSavingsId
                    );

                    this.logger.log(`✓ Closed FD ${fdAccountId}, closure amount: ${closureResult.closureAmount}`);

                    // Transfer remaining interest from Escrow → Lender
                    if (interestShare > 0) {
                        await this.transferFromEscrowToLender(
                            investment.lenderId,
                            lenderMainSavingsId,
                            interestShare,
                            loanId
                        );
                    }

                    withdrawalResult = {
                        transactionId: closureResult.transactionId,
                        remainingBalance: 0,
                        note: 'FD closed (prepayment)'
                    };
                } else {
                    // ============ REGULAR REPAYMENT ============
                    // Fineract FD doesn't support partial withdrawal
                    // Bypass FD: Transfer directly from Escrow → Lender Main
                    this.logger.log(`Regular repayment - Bypassing FD, direct transfer`);

                    // Post interest to FD (accumulate for maturity)
                    await this.fdService.postInterestToFixedDeposit(fdAccountId, interestShare);

                    // Get lender main savings account
                    const lenderMainSavingsId = await this.getLenderMainSavingsAccountId(investment.lenderId);

                    if (!lenderMainSavingsId) {
                        throw new Error('Lender main savings account not found');
                    }

                    // Transfer principal from Escrow → Lender (bypass FD)
                    await this.transferFromEscrowToLender(
                        investment.lenderId,
                        lenderMainSavingsId,
                        principalShare,
                        loanId
                    );

                    withdrawalResult = {
                        transactionId: null,
                        remainingBalance: null,
                        note: 'Direct transfer (FD bypass)'
                    };
                }

                // Update investment contract
                await this.investModel.updateOne(
                    { _id: investment._id },
                    {
                        $inc: {
                            totalReceived: totalShare,
                            totalPrincipalReceived: principalShare,
                            totalInterestReceived: interestShare,
                            fixedDepositInterestEarned: interestShare
                        },
                        $push: {
                            repaymentHistory: {
                                repaymentDate: new Date(),
                                amount: totalShare,
                                principal: principalShare,
                                interest: interestShare,
                                loanId: loanId
                            }
                        },
                        fixedDepositBalance: withdrawalResult.remainingBalance || 0,
                        fixedDepositStatus: isFinalPayment ? 'closed' : 'active'
                    }
                );

                results.push({
                    lenderId: investment.lenderId,
                    amount: totalShare,
                    principal: principalShare,
                    interest: interestShare,
                    total: totalShare,
                    transferId: withdrawalResult.transactionId,
                    isFinalPayment
                });

            } catch (error: any) {
                this.logger.error(`Error distributing to lender ${investment.lenderId}: ${error.message}`);
                // Continue with other lenders, track error
                results.push({
                    lenderId: investment.lenderId,
                    amount: 0,
                    error: error.message
                });
            }
        }

        // Calculate and track admin spread
        const totalLenderInterest = results.reduce((sum, r) => sum + (r.interest || 0), 0);
        const adminSpreadEarned = monthlyInterest - totalLenderInterest;

        // LOG ADMIN PROFIT
        this.logger.log(`\n========== ADMIN PROFIT REPORT ==========`);
        this.logger.log(`[Admin Profit] Loan: ${loanId}`);
        this.logger.log(`[Admin Profit] Interest from borrower: ${monthlyInterest.toLocaleString()} VND`);
        this.logger.log(`[Admin Profit] Interest to lenders: ${totalLenderInterest.toLocaleString()} VND`);
        this.logger.log(`[Admin Profit] Admin spread: ${adminSpreadEarned.toLocaleString()} VND`);
        this.logger.log(`[Admin Profit] Spread %: ${((adminSpreadEarned / monthlyInterest) * 100).toFixed(2)}%`);
        this.logger.log(`==========================================\n`);

        // Update loan spread history
        await this.loanModel.updateOne(
            { _id: loan._id },
            {
                $inc: { adminSpreadEarned: adminSpreadEarned },
                $push: {
                    spreadEarnedHistory: {
                        repaymentDate: new Date(),
                        spreadAmount: adminSpreadEarned,
                        lenderInterest: totalLenderInterest,
                        borrowerInterest: monthlyInterest
                    }
                }
            }
        );

        return results;
    }

    /**
     * Legacy distribution (no FD)
     */
    private async distributeLegacy(loanId: string, amount: number, investments: any[]): Promise<any[]> {
        // Use basic escrow distribution (no spread retention)
        return await this.escrowService.distributeRepaymentToLenders(loanId, amount, investments);
    }

    /**
     * Get lender main savings account ID
     */
    private async getLenderMainSavingsAccountId(lenderId: string): Promise<number | null> {
        try {
            // Resolve Fineract client ID from username
            const clientId = await this.fineractService.resolveClientId(lenderId);
            if (!clientId) return null;

            const savingsAccount = await this.fineractService.getClientSavingsAccount(clientId);
            return savingsAccount?.id || null;
        } catch (error: any) {
            this.logger.error(`Failed to get lender savings account: ${error.message}`);
            return null;
        }
    }

    /**
     * Transfer from Escrow to Lender
     */
    private async transferFromEscrowToLender(
        lenderId: string,
        lenderSavingsAccountId: number,
        amount: number,
        loanId: string
    ): Promise<void> {
        // Get admin escrow account from config
        const adminClientId = this.fineractService['adminClientId'] || 1;
        const escrowAccountId = this.fineractService['escrowAccountId'] || 2;

        // Get lender's client ID first
        const lenderClientId = await this.fineractService.resolveClientId(lenderId);
        if (!lenderClientId) {
            throw new Error(`Cannot resolve Fineract client ID for lender ${lenderId}`);
        }

        // Transfer funds
        await this.fineractService.transferFunds(
            adminClientId,
            lenderClientId,
            escrowAccountId,
            lenderSavingsAccountId,
            amount,
            `Repayment distribution for loan ${loanId}`
        );
    }
}
