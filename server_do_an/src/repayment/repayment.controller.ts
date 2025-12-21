import { Controller, Post, Body, Res, Req, UseGuards, HttpStatus, Logger, Get, Param } from '@nestjs/common';
import type { Response, Request } from 'express';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Use DualAuthGuard instead
import { DualAuthGuard } from '../auth/guard/dual-auth.guard';
import { RepaymentService } from './services/repayment.service';
import { FineractService } from '../loan/services/fineract.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LoanContract, LoanContractSchema } from '../loan/schemas/loan-contract.schema';
import { Wallet, WalletDocument } from '../invest/schemas/wallet.schema';
import { EscrowService } from './services/escrow.service';

@Controller('repayment')
@UseGuards(DualAuthGuard)
export class RepaymentController {
    private readonly logger = new Logger(RepaymentController.name);

    constructor(
        private readonly repaymentService: RepaymentService,
        private readonly fineractService: FineractService,
        private readonly escrowService: EscrowService,
        @InjectModel(LoanContract.name) private loanModel: Model<LoanContract>,
        @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    ) { }

    @Post('repay')
    async makeRepayment(@Body() body: any, @Req() req: Request, @Res() res: Response) {
        try {
            const { loanId, amount } = body;
            const user = req.user as any;
            const userId = user.id || user._id || user.keycloakUserId; // userId from DualAuthGuard

            this.logger.log(`Repayment request: loanId=${loanId}, amount=${amount}, user=${userId}`);

            // 1. Validate Input
            if (!loanId || !amount || amount <= 0) {
                return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Invalid loanId or amount' });
            }

            // 2. Find Loan
            let loan = await this.loanModel.findOne({ contractId: loanId });
            // ... (helper to find by fineract ID if needed)
            if (!loan && loanId.startsWith('LOAN_')) {
                const fineractId = parseInt(loanId.replace('LOAN_', ''), 10);
                loan = await this.loanModel.findOne({ fineractLoanId: fineractId });
            }

            if (!loan) {
                return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Loan not found' });
            }

            // 4. Check Fineract Loan Status
            if (loan.fineractLoanId) {
                const loanDetails = await this.fineractService.getLoanDetails(loan.fineractLoanId);
                // Status 300 = Active
                if (!loanDetails.status?.active) {
                    return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Loan is not Active on Fineract' });
                }
            }

            // 5. Get Borrower Wallet & Balance
            const wallet = await this.walletModel.findOne({ p2pUserId: userId });
            if (!wallet || !wallet.fineractClientId) {
                return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Borrower wallet not linked via Fineract' });
            }

            const clientDetails = await this.fineractService.getClientDetails(Number(wallet.fineractClientId));
            // Find active savings account
            const savingsAccount = clientDetails.savingsAccounts?.find((acc: any) => acc.status?.active === true);

            if (!savingsAccount) {
                return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Borrower has no active savings account' });
            }

            if (savingsAccount.accountBalance < amount) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    message: `Insufficient balance. Available: ${savingsAccount.accountBalance}, Required: ${amount}`
                });
            }

            // 6. Make Repayment on Fineract (Record the repayment)
            let fineractRepaymentResult: any = null;
            if (loan.fineractLoanId) {
                fineractRepaymentResult = await this.fineractService.makeRepayment(
                    loan.fineractLoanId,
                    amount,
                    new Date().toISOString().split('T')[0],
                    `P2P Repayment for ${loanId}`
                );
            }

            // 7. Transfer Borrower -> Escrow
            const transferRes = await this.fineractService.transferFunds(
                Number(wallet.fineractClientId),
                this.escrowService['adminClientId'], // access via service or config
                savingsAccount.id,
                this.escrowService['adminEscrowAccountId'],
                amount,
                `Repayment escrow for ${loanId}`
            );

            // 8. Distribute to Lenders
            const distributionResult = await this.repaymentService.processRepayment(
                loanId,
                amount,
                new Date()
            );

            // 9. Update Loan History
            await this.loanModel.findByIdAndUpdate(loan._id, {
                $push: {
                    repaymentHistory: {
                        date: new Date(),
                        amount,
                        fineractTransactionId: fineractRepaymentResult?.transactionId,
                        escrowTransferId: transferRes.resourceId
                    }
                }
            });

            return res.status(HttpStatus.OK).json({
                success: true,
                loanId,
                amount,
                fineractRepayment: fineractRepaymentResult,
                distribution: distributionResult
            });

        } catch (error) {
            this.logger.error(`Repayment error: ${error.message}`);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
        }
    }
}
