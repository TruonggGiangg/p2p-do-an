import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EscrowService } from './escrow.service';
import { FineractService } from '../../loan/services/fineract.service';
import { LoanContract, LoanContractSchema } from '../../loan/schemas/loan-contract.schema';
import { InvestmentContract, InvestmentContractSchema } from '../../invest/schemas/investment-contract.schema';

@Injectable()
export class RepaymentService {
    private readonly logger = new Logger(RepaymentService.name);

    constructor(
        @InjectModel(LoanContract.name) private loanModel: Model<LoanContract>,
        @InjectModel(InvestmentContract.name) private investModel: Model<InvestmentContract>,
        private readonly escrowService: EscrowService,
        private readonly fineractService: FineractService,
    ) { }

    /**
     * Process repayment and distribute to lenders
     * 
     * Flow:
     * 1. Check Loan exists
     * 2. Calculate distribution amounts
     * 3. Call EscrowService to distribute
     * 4. Update Investment records
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

        // 2. Get Investments
        const investments = await this.investModel.find({
            loanContract: loan._id,
            status: 'success'
        }).populate('lender'); // Ensure populate lender to get ID

        if (!investments || investments.length === 0) {
            throw new Error('No investments found for this loan');
        }

        // Filter valid investments
        const validInvestments = investments.filter(inv => inv.lender !== null);

        const investmentData = validInvestments.map(inv => ({
            investmentId: inv._id,
            lenderId: inv.lender['_id'] ? inv.lender['_id'].toString() : inv.lender.toString(), // Use string ID
            capital: inv.info.capital,
            totalCapital
        }));

        // 3. Distribute via Escrow
        const distributions = await this.escrowService.distributeRepaymentToLenders(
            loanId,
            repaymentAmount,
            investmentData
        );

        // 4. Update MongoDB Records
        const totalRepayment = repaymentAmount;
        const totalPrincipal = loan.info.monthlyPrincipalPay || 0;
        const totalInterest = loan.info.monthlyInterestPay || 0;
        const totalMonthlyPay = loan.info.monthlyPay || totalRepayment;

        const repaymentRatio = totalMonthlyPay > 0 ? totalRepayment / totalMonthlyPay : 1;
        const principalRatio = totalMonthlyPay > 0 ? totalPrincipal / totalMonthlyPay : 0;
        const interestRatio = totalMonthlyPay > 0 ? totalInterest / totalMonthlyPay : 0;

        for (const dist of distributions) {
            // Find corresponding investment
            const investment = investments.find(inv => {
                const lenderId = inv.lender['_id'] ? inv.lender['_id'].toString() : inv.lender.toString();
                return lenderId === dist.lenderId;
            });

            if (investment && dist.amount > 0) {
                const investmentRatio = investment.info.capital / totalCapital;
                const principalAmount = Math.floor(totalRepayment * principalRatio * investmentRatio);
                const interestAmount = Math.floor(totalRepayment * interestRatio * investmentRatio);

                const record = {
                    repaymentDate: new Date(repaymentDate),
                    amount: dist.amount,
                    principal: principalAmount,
                    interest: interestAmount,
                    fineractTransferId: dist.transferId,
                    loanId: loan.contractId,
                };

                // Add to history
                await this.investModel.findByIdAndUpdate(investment._id, {
                    $push: { repaymentHistory: record },
                    $inc: {
                        totalReceived: dist.amount,
                        totalPrincipalReceived: principalAmount,
                        totalInterestReceived: interestAmount
                    }
                });
            }
        }

        const totalDistributed = distributions.reduce((sum, d) => sum + (d.amount || 0), 0);

        return {
            success: true,
            totalDistributed,
            repaymentAmount,
            lendersCount: distributions.length,
            distributions
        };
    }
}
