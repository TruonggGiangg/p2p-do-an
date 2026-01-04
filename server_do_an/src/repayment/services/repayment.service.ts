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
    async processRepayment(loanId: string | number, repaymentAmount: number, repaymentDate: Date): Promise<any> {
        this.logger.log(`Processing repayment for loan ${loanId}, amount: ${repaymentAmount}`);

        // 1. Find Loan - convert loanId to string for safe operations
        const loanIdStr = String(loanId);
        let loan = await this.loanModel.findOne({ contractId: loanIdStr });

        if (!loan && loanIdStr.startsWith('LOAN_')) {
            const fineractId = parseInt(loanIdStr.replace('LOAN_', ''), 10);
            loan = await this.loanModel.findOne({ fineractLoanId: fineractId });
        }

        // Try by numeric fineractLoanId directly  
        if (!loan) {
            const numericId = parseInt(loanIdStr, 10);
            if (!isNaN(numericId)) {
                loan = await this.loanModel.findOne({ fineractLoanId: numericId });
            }
        }

        // Fallback: Check if loanId is ObjectId
        if (!loan && loanIdStr.match(/^[0-9a-fA-F]{24}$/)) {
            loan = await this.loanModel.findById(loanIdStr);
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

            // ✅ AUTO-DETECT PREPAYMENT: Check if this payment closes the loan
            // Query Fineract for current loan status after repayment
            let isFinalPayment = false;
            let interestPortion: number | undefined = undefined;

            try {
                if (!loan.fineractLoanId) {
                    this.logger.warn('[Repayment] No fineractLoanId, cannot auto-detect final payment');
                } else {
                    const loanDetails = await this.fineractService.getLoanDetails(loan.fineractLoanId);
                    const outstanding = loanDetails.summary?.totalOutstanding || 0;

                    // If outstanding is 0 or very small (rounding), this is final payment
                    if (outstanding <= 1000) {
                        isFinalPayment = true;
                        this.logger.log(`[Repayment] AUTO-DETECTED FINAL PAYMENT: Outstanding balance = ${outstanding}`);

                        // Get exact interest from repayment breakdown
                        const lastTransaction = loanDetails.transactions?.find((t: any) =>
                            t.type?.repayment && t.amount === repaymentAmount
                        );
                        if (lastTransaction) {
                            interestPortion = lastTransaction.interestPortion || 0;
                            this.logger.log(`[Repayment] Exact interest from Fineract: ${interestPortion}`);
                        }
                    }
                }
            } catch (err) {
                this.logger.warn(`[Repayment] Could not auto-detect final payment: ${err.message}`);
            }

            distributions = await this.distributeRepaymentToLendersWithFD(
                loan.contractId,
                repaymentAmount,
                enrichedInvestments,
                isFinalPayment,
                loan,
                interestPortion
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
            // REGULAR: Calculate actual borrower interest based on outstanding principal
            // For Declining Balance: Interest = Outstanding Principal × Monthly Rate
            // We need to estimate the outstanding principal based on loan progress

            // Get current period from schedule (first lender's schedule)
            const firstInvestment = investments[0];
            const fullFirstInv = await this.investModel.findById(firstInvestment._id);
            const currentPeriod = this.getCurrentPeriodFromSchedule(fullFirstInv?.lenderSchedule);
            const periodNumber = currentPeriod?.period || 1;

            // Calculate borrower interest for this period
            // Borrower schedule interest decreases over time as principal is paid
            // Use ratio: borrowerRate / lenderRate to estimate borrower interest from lender interest
            const lenderRate = fullFirstInv?.fixedDepositInterestRate || 15.0;
            const rateRatio = borrowerRate / lenderRate; // 18/15 = 1.2

            // Total lender interest from schedule for this period
            const totalLenderInterestFromSchedule = investments.length * (currentPeriod?.interest || 6000);

            // Borrower interest = Lender interest × rate ratio
            monthlyInterest = Math.round(totalLenderInterestFromSchedule * rateRatio);
            monthlyPrincipal = repaymentAmount - monthlyInterest;

            this.logger.log(`[FD Distribution] Using Declining Balance calculation: Period ${periodNumber}, RateRatio=${rateRatio.toFixed(2)}`);
        }

        this.logger.log(`[FD Distribution] Breakdown: Principal=${monthlyPrincipal}, Interest=${monthlyInterest}`);

        for (const investment of investments) {
            // ✅ NEW: Get amounts from stored lenderSchedule instead of recalculating
            const fullInvestment = await this.investModel.findById(investment._id);
            const currentPeriod = this.getCurrentPeriodFromSchedule(fullInvestment?.lenderSchedule);

            let principalShare: number;
            let interestShare: number;

            if (currentPeriod) {
                // Use schedule values (HỢP ĐỒNG)
                principalShare = currentPeriod.principal;
                interestShare = currentPeriod.interest;
                this.logger.log(`[FD Distribution] Using SCHEDULE for ${investment._id}: Period ${currentPeriod.period}, P=${principalShare}, I=${interestShare}`);

                // ✅ PREPAYMENT OVERRIDE: Use proportional interest based on actual borrower interest
                // Schedule Period 1 interest ≠ actual prepayment interest
                // Lender should receive: borrowerInterest × (lenderRate / borrowerRate) × investmentRatio
                if (isFinalPayment && interestPortion != null && interestPortion > 0) {
                    const lenderAnnualRate = fullInvestment?.fixedDepositInterestRate || 15.0;
                    const ratio = investment.amount / totalCapital;
                    // Proportional interest: borrowerInterest × (lenderRate / borrowerRate) × ratio
                    const proportionalInterest = Math.floor((interestPortion * (lenderAnnualRate / borrowerRate) * ratio) / 1000) * 1000;
                    this.logger.log(`[Prepayment] OVERRIDE interest: Schedule=${interestShare} → Proportional=${proportionalInterest} (ratio=${ratio.toFixed(2)}, lenderRate=${lenderAnnualRate}%, borrowerRate=${borrowerRate}%)`);
                    interestShare = proportionalInterest;
                    // Also override principal for prepayment: full investment amount
                    principalShare = investment.amount;
                }
            } else {
                // Fallback: Calculate if no schedule (legacy investments)
                const ratio = investment.amount / totalCapital;
                const fdRate = investment.fixedDepositInterestRate || 10.0;
                principalShare = Math.floor(monthlyPrincipal * ratio);
                const rawInterest = monthlyInterest * (fdRate / borrowerRate) * ratio;
                interestShare = Math.floor(rawInterest / 1000) * 1000;
                this.logger.warn(`[FD Distribution] No schedule for ${investment._id}, using FALLBACK calculation`);
            }

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
                        // p2p-do-an schema: 'lender' is Keycloak UUID string (NOT ObjectId like P2P reference)
                        // Use 'lender' field directly as username for resolveClientId
                        let usernameToResolve = String(investment.lender || '');

                        // Handle case where lender might be populated as object (future-proofing)
                        if (investment.lender && typeof investment.lender === 'object') {
                            usernameToResolve = (investment.lender as any).username || (investment.lender as any)._id?.toString() || '';
                        }

                        if (!usernameToResolve || usernameToResolve === 'undefined') {
                            throw new Error('Lender field is empty or undefined');
                        }

                        this.logger.log(`[Fallback] Resolving client ID for lender: ${usernameToResolve}`);
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
                    const fdAccountIdNum = Number(investment.fineractFixedDepositAccountId);
                    if (isNaN(fdAccountIdNum)) throw new Error('Invalid FD Account ID');

                    // PREPAYMENT: Close FD. proceeds go to ADMIN (Reimbursement)
                    // Lender already received periodic principal from Escrow
                    const savingsAccount = await this.fineractService.getClientSavingsAccount(lenderFineractClientId);
                    const lenderMainSavingsId = savingsAccount?.id;
                    if (!lenderMainSavingsId) throw new Error('Lender main savings account not found');

                    // 1. Post final interest to FD (tracked logically, borrower interest from Fineract prepay template)
                    if (interestShare > 0) {
                        await this.fdService.postInterestToFD(fdAccountIdNum, interestShare);
                        this.logger.log(`✓ Posted interest ${interestShare} to FD ${fdAccountIdNum}`);
                    }

                    // 2. CLOSE FD TO ADMIN (REIMBURSEMENT)
                    // Lender has already received principal through direct distribution
                    // FD proceeds must return to Admin/Escrow to cover those advanced payments
                    const adminSavingsAccount = await this.fineractService.getClientSavingsAccount(this.escrowService['adminClientId']);
                    const adminSavingsId = adminSavingsAccount?.id as number;

                    this.logger.log(`[FD Closure] Closing FD ${fdAccountIdNum} to ADMIN ${this.escrowService['adminClientId']} (Account ${adminSavingsId}) for REIMBURSEMENT`);
                    const closureResult = await this.fdService.closeFixedDepositAccount(fdAccountIdNum, adminSavingsId, `REIMBURSEMENT for loan ${loan.contractId}`);
                    this.logger.log(`✓ Closed FD ${fdAccountIdNum}, Reimbursement amount: ${closureResult.closureAmount}`);

                    // 3. LOG REIMBURSEMENT
                    await this.transactionLogService.logFDTransfer({
                        fdAccountId: fdAccountIdNum,
                        investmentId: investment.contractId || String(investment._id),
                        lenderId: investment.lender,
                        amount: closureResult.closureAmount,
                        action: 'FD_CLOSE_REIMBURSE',
                        fineractTransactionId: closureResult.transactionId
                    });

                    // 4. Transfer final interest from Escrow → Lender Main Savings
                    if (interestShare > 0) {
                        this.logger.log(`[Interest Transfer] Transferring final interest ${interestShare} from Escrow to Lender ${investment.lender}`);

                        const interestTransferId = await this.transferFromEscrowToLender(
                            String(lenderFineractClientId),
                            lenderMainSavingsId,
                            interestShare,
                            loan.contractId || loanId
                        );

                        this.logger.log(`✓ Final interest transferred from Escrow: ${interestShare}, txId: ${interestTransferId}`);

                        // 5. LOG INTEREST DISTRIBUTION
                        await this.transactionLogService.logDistribution({
                            loanId,
                            lenderId: investment.lender,
                            amount: interestShare,
                            type: 'INTEREST',
                            fineractTransactionId: interestTransferId
                        });
                    }

                    this.logger.log(`[Final Payment] Lender received interest: ${interestShare}. FD Principal ${closureResult.closureAmount} returned to Admin.`);

                    withdrawalResult = {
                        transactionId: closureResult.transactionId,
                        remainingBalance: 0,
                        note: `FD closed for reimbursement: ${closureResult.closureAmount}, Interest from Escrow: ${interestShare}`
                    };
                } else {
                    // REGULAR REPAYMENT: Distribute FULL (P+I) from Escrow → Lender
                    const savingsAccount = await this.fineractService.getClientSavingsAccount(lenderFineractClientId);
                    const lenderMainSavingsId = savingsAccount?.id;
                    if (!lenderMainSavingsId) throw new Error('Lender main savings account not found');

                    const totalDistribute = principalShare + interestShare;

                    if (totalDistribute > 0) {
                        this.logger.log(`[Regular Repayment] Distributing FULL: ${totalDistribute} (P: ${principalShare}, I: ${interestShare}) from Escrow to Lender ${investment.lender}`);

                        const distTxnId = await this.transferFromEscrowToLender(
                            String(lenderFineractClientId),
                            lenderMainSavingsId,
                            totalDistribute,
                            loan.contractId || loanId
                        );

                        this.logger.log(`✓ Full distribution completed: ${totalDistribute}, txId: ${distTxnId}`);

                        // LOG DISTRIBUTION (Both P+I)
                        await this.transactionLogService.logDistribution({
                            loanId,
                            lenderId: investment.lender,
                            amount: totalDistribute,
                            type: principalShare > 0 && interestShare > 0 ? 'BOTH' : (principalShare > 0 ? 'PRINCIPAL' : 'INTEREST'),
                            fineractTransactionId: distTxnId
                        });
                    }

                    this.logger.log(`[Regular Repayment] Distributed ${totalDistribute} to lender. FD ${fdAccountId} balance remains as record.`);
                    withdrawalResult = { transactionId: null, remainingBalance: investment.fixedDepositBalance - principalShare, note: `Full distribution: ${totalDistribute}` };
                }

                // Update Local Record
                await this.investModel.updateOne(
                    { _id: investment._id },
                    {
                        $inc: {
                            totalReceived: totalShare,
                            totalPrincipalReceived: principalShare,
                            totalInterestReceived: interestShare,
                            fixedDepositInterestEarned: interestShare,
                            totalPrincipalDistributed: principalShare // Tracking
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
                        fixedDepositTrackedBalance: (fullInvestment?.fixedDepositTrackedBalance ?? investment.fixedDepositBalance) - principalShare,
                        fixedDepositStatus: isFinalPayment ? 'closed' : 'active'
                    }
                );

                results.push({
                    lenderId: investment.lender,
                    amount: totalShare,
                    principal: principalShare,
                    interest: interestShare,
                    total: totalShare,
                    isFinalPayment
                });

                // ✅ Update lenderSchedule status to 'paid'
                if (currentPeriod) {
                    await this.updateScheduleStatus(String(investment._id), currentPeriod.period, totalShare);
                }

            } catch (error: any) {
                this.logger.error(`Error distributing to lender ${investment.lender}: ${error.message}`);
                results.push({ lenderId: investment.lender, amount: 0, error: error.message });
            }
        }

        // Calculate Admin Profit correctly based on payment type
        // For Regular Repayment: Lenders only receive INTEREST, principal stays in FD
        // For Final Payment: Lenders receive FD closure (principal) + interest
        const totalLenderInterest = results.reduce((sum, r) => sum + (r.interest || 0), 0);

        let adminSpreadEarned: number;
        let totalActuallyDistributed: number;

        if (isFinalPayment) {
            // Final payment: Borrower pays remaining principal + interest
            // Lenders receive: FD closure (principal) + interest from Escrow
            // Admin spread = borrowerInterest - lenderInterest (principal is 1:1)
            const borrowerInterestPortion = interestPortion || monthlyInterest;
            adminSpreadEarned = borrowerInterestPortion - totalLenderInterest;
            totalActuallyDistributed = repaymentAmount; // Full prepay amount (includes FD closures handled separately)
            this.logger.log(`[Admin Profit] FINAL: BorrowerInterest=${borrowerInterestPortion}, LenderInterest=${totalLenderInterest}, Spread=${adminSpreadEarned}`);
        } else {
            // Regular repayment: Only INTEREST distributed from Escrow
            // Principal schedule portion goes to escrow but lender doesn't receive it yet (it's in FD)
            // Interest portion of borrower payment - interest distributed to lenders = admin spread
            const totalLenderInterest = results.reduce((sum, r) => sum + r.interest, 0);
            // Recalculate rates for spread estimation block
            const bRate = loan.borrowerInterestRate || (loan.info?.rate * 12) || 16;
            const lRate = loan.lenderInterestRate || bRate || 12;

            const borrowerInterestEstimate = Math.round(totalLenderInterest * (bRate / lRate));
            adminSpreadEarned = borrowerInterestEstimate - totalLenderInterest;

            this.logger.log(`[Admin Profit] FULL_DIST: BorrowerInterest=${borrowerInterestEstimate}, LenderInterest=${totalLenderInterest}, Spread=${adminSpreadEarned}`);
        }

        await this.loanModel.updateOne({ contractId: loanId }, { $inc: { adminSpreadEarned: adminSpreadEarned } });

        return results;
    }

    private async distributeLegacy(loanId: string, amount: number, investments: any[]): Promise<any[]> {
        return await this.escrowService.distributeRepaymentToLenders(loanId, amount, investments);
    }

    /**
     * Get current pending period from lenderSchedule
     * Returns the first period with status = 'pending'
     */
    private getCurrentPeriodFromSchedule(schedule: any[] | undefined): { period: number; principal: number; interest: number; total: number } | null {
        if (!schedule || schedule.length === 0) {
            return null;
        }
        // Find first pending period
        const pendingPeriod = schedule.find(p => p.status === 'pending');
        if (pendingPeriod) {
            return {
                period: pendingPeriod.period,
                principal: pendingPeriod.principal,
                interest: pendingPeriod.interest,
                total: pendingPeriod.total,
            };
        }
        return null;
    }

    /**
     * Update lenderSchedule status after payment
     */
    private async updateScheduleStatus(investmentId: string, period: number, paidAmount: number): Promise<void> {
        try {
            await this.investModel.updateOne(
                { _id: investmentId, 'lenderSchedule.period': period },
                {
                    $set: {
                        'lenderSchedule.$.status': 'paid',
                        'lenderSchedule.$.paidDate': new Date(),
                        'lenderSchedule.$.paidAmount': paidAmount,
                    }
                }
            );
            this.logger.log(`[Schedule Update] Period ${period} marked as PAID for investment ${investmentId}`);
        } catch (error: any) {
            this.logger.error(`[Schedule Update] Failed to update period ${period}: ${error.message}`);
        }
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
        loanId: string,
        fineractLoanId?: number // NEW: Optional Fineract ID for better note
    ): Promise<number> {
        const adminClientId = parseInt(process.env.FINERACT_ADMIN_CLIENT_ID || '1');
        const escrowAccountId = parseInt(process.env.FINERACT_ESCROW_ACCOUNT_ID || '1');

        let lenderClientId = parseInt(lenderFineractClientId);
        if (isNaN(lenderClientId)) {
            // Try to resolve if passed as string/id
            const resolvedId = await this.fineractService.resolveClientId(lenderFineractClientId);
            lenderClientId = resolvedId || 0;
        }

        if (!lenderClientId) throw new Error(`Cannot resolve client ID ${lenderFineractClientId}`);

        // Lookup Fineract ID if not provided
        let fLoanId = fineractLoanId;
        if (!fLoanId) {
            const loan = await this.loanModel.findOne({ contractId: loanId });
            fLoanId = loan?.fineractLoanId;
        }
        const loanIdSuffix = fLoanId ? ` [Fineract:${fLoanId}]` : '';

        const result = await this.fineractService.transferFunds(
            adminClientId,
            lenderClientId,
            escrowAccountId,
            lenderSavingsAccountId,
            amount,
            `Interest distribution for loan: ${loanId}${loanIdSuffix}`, // Match web app regex pattern
            true, // deductFeeFromAmount
            true  // skipFee - CRITICAL: Skip fee for escrow transfers (p2p ref line 898, 948)
        );

        return result?.resourceId || 0;
    }
}

