import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EscrowService } from './escrow.service';
import { FineractService } from '../../loan/services/fineract.service';
import { FineractFixedDepositService } from '../../loan/services/fineract-fixed-deposit.service';
import { FineractEscrowService } from '../../escrow/services/fineract-escrow.service';
import { LoanContract, LoanContractSchema } from '../../loan/schemas/loan-contract.schema';
import { InvestmentContract, InvestmentContractSchema } from '../../invest/schemas/investment-contract.schema';
import { TransactionLogService } from '../../reconciliation/services/transaction-log.service';

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
        private readonly transactionLogService: TransactionLogService, // Inject Transaction Log service
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
        // Fallback: Check if loanId is ObjectId
        if (!loan && loanId.match(/^[0-9a-fA-F]{24}$/)) {
            loan = await this.loanModel.findById(loanId);
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

        // 2. Get Investments and Populate Lender (Crucial for fallback ID resolution)
        const investments = await this.investModel.find({
            loanContract: loan._id,
            status: 'success'
        }).populate('lender');

        if (!investments || investments.length === 0) {
            throw new Error('No investments found for this loan');
        }

        // Check if loan uses Fixed Deposit flow
        const investmentsWithFD = investments.filter(inv => inv.fineractFixedDepositAccountId != null);
        const usesFDFlow = investmentsWithFD.length > 0;

        this.logger.log(`[Repayment] Distribution method: usesFDFlow=${usesFDFlow}, fdCount=${investmentsWithFD.length}/${investments.length}`);

        let distributions: any[] = [];
        let adminSpreadAmount = 0; // Track admin profit from interest spread

        if (usesFDFlow) {
            // ✅ Use FD-aware distribution (retains admin spread automatically)
            this.logger.log('[Repayment] Using FD distribution flow');

            // Map to expected structure for distributeRepaymentToLendersWithFD
            const enrichedInvestments = investmentsWithFD.map(inv => ({
                _id: inv._id,
                investmentId: inv._id,
                lenderId: inv.lender['_id'] ? inv.lender['_id'].toString() : inv.lender.toString(),
                lender: inv.lender, // Keep full lender object for username resolution
                amount: inv.info.capital,
                fineractFixedDepositAccountId: inv.fineractFixedDepositAccountId,
                fixedDepositInterestRate: inv.fixedDepositInterestRate || lenderRate,
                lenderFineractClientId: inv.lenderFineractClientId
            }));

            distributions = await this.distributeRepaymentToLendersWithFD(
                loan.contractId,
                repaymentAmount,
                enrichedInvestments,
                false, // isFinalPayment (default false for regular repayment)
                loan
            );

            // Calculate admin spread for return object
            const totalLenderInterest = distributions.reduce((sum, r) => sum + (r.interest || 0), 0);
            // Borrower interest (rough access from loan info for this period)
            const monthlyInterest = loan.info.monthlyInterestPay || (repaymentAmount - (loan.info.monthlyPrincipalPay || 0));
            adminSpreadAmount = monthlyInterest - totalLenderInterest;

        } else {
            // Legacy flow (no FD)
            this.logger.warn('[Repayment] Using LEGACY distribution (no FD, no admin spread retention)');

            const investmentData = investments.map(inv => ({
                investmentId: inv._id,
                lenderId: inv.lender['_id'] ? inv.lender['_id'].toString() : inv.lender.toString(),
                capital: inv.info.capital,
                totalCapital
            }));

            distributions = await this.distributeLegacy(loan.contractId, repaymentAmount, investmentData);

            // For legacy flow, calculate admin spread here
            const borrowerInterest = loan.info.monthlyInterestPay || 0;
            const lenderInterestRatio = lenderRate / borrowerRate;
            const lenderInterest = borrowerInterest * lenderInterestRatio;
            adminSpreadAmount = borrowerInterest - lenderInterest;

            // Legacy distribution update logic is handled inside distributeLegacy or assumed done
            // 6. Track admin spread earned for legacy flow
            await this.loanModel.findByIdAndUpdate(loan._id, {
                $inc: { adminSpreadEarned: adminSpreadAmount }
            });
        }

        const totalDistributed = distributions.reduce((sum, d) => sum + (d.amount || 0), 0);

        // ✅ LOG REPAYMENT TO TRANSACTION LOG
        await this.transactionLogService.logRepayment({
            loanId: loan.contractId,
            borrowerId: loan.borrower.toString(),
            amount: repaymentAmount,
            principalPortion: repaymentAmount - (distributions.reduce((sum, d) => sum + (d.interest || 0), 0)),
            interestPortion: distributions.reduce((sum, d) => sum + (d.interest || 0), 0),
            status: 'SUCCESS',
        }).catch(err => {
            this.logger.error(`Failed to log repayment: ${err.message}`);
        });

        return {
            success: true,
            totalDistributed,         // Amount sent to lenders
            repaymentAmount,          // Original borrower payment
            adminSpreadEarned: adminSpreadAmount,  // Admin profit from this repayment
            lendersCount: distributions.length,
            distributions,
            rateInfo: {
                borrowerRate,
                lenderRate
            }
        };
    }

    /**
     * Distribute to lenders using FD flow
     * Handles both Regular Repayment and Prepayment (Final)
     */
    private async distributeRepaymentToLendersWithFD(
        loanId: string,
        repaymentAmount: number,
        investments: any[],
        isFinalPayment: boolean,
        loan: any,
        interestPortion?: number
    ): Promise<any[]> {
        this.logger.log(`[FD Distribution] Amount: ${repaymentAmount}, lenders: ${investments.length}, final: ${isFinalPayment}`);

        const results: any[] = [];
        const totalCapital = investments.reduce((sum, inv) => sum + inv.amount, 0);
        const borrowerRate = loan.borrowerInterestRate || 12.0;

        let monthlyPrincipal: number;
        let monthlyInterest: number;

        if (isFinalPayment && interestPortion != null) {
            // PREPAYMENT: Use exact interest from Fineract
            monthlyInterest = interestPortion;
            monthlyPrincipal = repaymentAmount - interestPortion;
            this.logger.log(`[FD Distribution] ✅ Using EXACT interest from Fineract: ${interestPortion}`);
        } else {
            // REGULAR: Formula
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

                // Resolve Lender Client ID (with Fallback)
                let lenderFineractClientId = investment.lenderFineractClientId;
                if (!lenderFineractClientId) {
                    this.logger.warn(`Investment ${investment._id} missing lenderFineractClientId, trying fallback...`);
                    try {
                        let usernameToResolve = String(investment.lenderId);
                        if (investment.lender && typeof investment.lender === 'object' && investment.lender.username) {
                            usernameToResolve = investment.lender.username;
                        }

                        this.logger.log(`[Fallback] Resolving client ID for username: ${usernameToResolve}`);
                        lenderFineractClientId = await this.fineractService.resolveClientId(usernameToResolve);
                        this.logger.log(`[Fallback] Resolved: ${lenderFineractClientId}`);
                    } catch (e: any) {
                        this.logger.error(`[Fallback] Failed: ${e.message}`);
                    }
                }

                if (!lenderFineractClientId) {
                    this.logger.error(`Cannot resolve Fineract Client ID for investment ${investment._id}, skipping payout.`);
                    continue;
                }

                if (isFinalPayment) {
                    // PREPAYMENT: Close FD
                    const savingsAccount = await this.fineractService.getClientSavingsAccount(lenderFineractClientId);
                    const lenderMainSavingsId = savingsAccount?.id;
                    if (!lenderMainSavingsId) throw new Error('Lender main savings account not found');

                    const closureResult = await this.fdService.closeFixedDepositAccount(fdAccountId, lenderMainSavingsId);
                    this.logger.log(`✓ Closed FD ${fdAccountId}, amount: ${closureResult.closureAmount}`);

                    // ✅ LOG FD CLOSURE
                    await this.transactionLogService.logFDTransfer({
                        fdAccountId: fdAccountId,
                        investmentId: investment.contractId || String(investment._id),
                        lenderId: investment.lenderId,
                        amount: closureResult.closureAmount,
                        action: 'FD_CLOSE',
                        fineractTransactionId: closureResult.transactionId
                    });

                    if (interestShare > 0) {
                        const distTxnId = await this.transferFromEscrowToLender(String(lenderFineractClientId), lenderMainSavingsId, interestShare, loanId);

                        // ✅ LOG INTEREST DISTRIBUTION
                        await this.transactionLogService.logDistribution({
                            loanId,
                            lenderId: investment.lenderId,
                            amount: interestShare,
                            type: 'INTEREST',
                            fineractTransactionId: distTxnId
                        });
                    }

                    withdrawalResult = { transactionId: closureResult.transactionId, remainingBalance: 0, note: 'FD closed' };
                } else {
                    // REGULAR: Direct transfer ONLY (No postInterest to avoid double counting)

                    // PARTIAL PRINCIPAL SYNC: Withdraw from FD if principal is repaid
                    if (principalShare > 0) {
                        try {
                            await this.fdService.withdrawFixedDeposit(fdAccountId, principalShare, 'Partial Principal Repayment');
                        } catch (e: any) {
                            this.logger.warn(`Failed to sync partial principal withdrawal for FD ${fdAccountId}: ${e.message}`);
                        }
                    }

                    const savingsAccount = await this.fineractService.getClientSavingsAccount(lenderFineractClientId);
                    const lenderMainSavingsId = savingsAccount?.id;
                    if (!lenderMainSavingsId) throw new Error('Lender main savings account not found');

                    const distTxnId = await this.transferFromEscrowToLender(String(lenderFineractClientId), lenderMainSavingsId, principalShare, loanId);

                    // ✅ LOG PRINCIPAL DISTRIBUTION
                    await this.transactionLogService.logDistribution({
                        loanId,
                        lenderId: investment.lenderId,
                        amount: principalShare,
                        type: 'PRINCIPAL',
                        fineractTransactionId: distTxnId
                    });

                    withdrawalResult = { transactionId: null, remainingBalance: null, note: 'Direct transfer' };
                }

                // Update Local Record
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
                    isFinalPayment
                });

            } catch (error: any) {
                this.logger.error(`Error distributing to lender ${investment.lenderId}: ${error.message}`);
                results.push({ lenderId: investment.lenderId, amount: 0, error: error.message });
            }
        }

        // Log Admin Profit
        const totalLenderInterest = results.reduce((sum, r) => sum + (r.interest || 0), 0);
        const adminSpreadEarned = monthlyInterest - totalLenderInterest;
        this.logger.log(`[Admin Profit] Spread Earned: ${adminSpreadEarned}`);

        await this.loanModel.updateOne({ contractId: loanId }, { $inc: { adminSpreadEarned: adminSpreadEarned } });

        return results;
    }

    private async distributeLegacy(loanId: string, amount: number, investments: any[]): Promise<any[]> {
        return await this.escrowService.distributeRepaymentToLenders(loanId, amount, investments);
    }

    private async getLenderMainSavingsAccountId(lenderId: string): Promise<number | null> {
        try {
            const clientId = await this.fineractService.resolveClientId(lenderId);
            if (!clientId) return null;
            const savingsAccount = await this.fineractService.getClientSavingsAccount(clientId);
            return savingsAccount?.id || null;
        } catch (error: any) {
            this.logger.error(`Failed to get lender savings account: ${error.message}`);
            return null;
        }
    }

    private async transferFromEscrowToLender(
        lenderFineractClientId: string, // Changed param name to reflect reality
        lenderSavingsAccountId: number,
        amount: number,
        loanId: string
    ): Promise<number> {
        const adminClientId = this.fineractService['adminClientId'] || 1;
        const escrowAccountId = this.fineractService['escrowAccountId'] || 2;

        let lenderClientId = parseInt(lenderFineractClientId);
        if (isNaN(lenderClientId)) {
            // Try to resolve if passed as string/id
            const resolvedId = await this.fineractService.resolveClientId(lenderFineractClientId);
            lenderClientId = resolvedId || 0;
        }

        if (!lenderClientId) throw new Error(`Cannot resolve client ID ${lenderFineractClientId}`);

        const result = await this.fineractService.transferFunds(
            adminClientId,
            lenderClientId,
            escrowAccountId,
            lenderSavingsAccountId,
            amount,
            `Distribution for loan ${loanId}` // Match reference P2P pattern
        );

        return result?.resourceId || 0;
    }
}
