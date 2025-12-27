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
                statusCode: HttpStatus.OK,
                message: 'Repayment processed successfully',
                data: {
                    success: true,
                    loanId,
                    amount,
                    fineractRepayment: fineractRepaymentResult,
                    distribution: distributionResult
                }
            });

        } catch (error) {
            this.logger.error(`Repayment error: ${error.message}`);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
        }
    }

    /**
     * Prepayment endpoint - Borrower pays off entire remaining loan
     * This will close all Fixed Deposit accounts prematurely
     */
    @Post('prepay')
    async prepayLoan(@Body() body: any, @Req() req: Request, @Res() res: Response) {
        try {
            const { loanId } = body;
            const user = req.user as any;
            const userId = user.id || user._id || user.keycloakUserId;

            this.logger.log(`Prepayment request: loanId=${loanId}, user=${userId}`);

            // ✅ Validate loanId
            if (!loanId) {
                return res.status(HttpStatus.BAD_REQUEST).json({ message: 'loanId is required' });
            }

            // 1. Find Loan - support multiple ID formats
            let loan = await this.loanModel.findOne({ contractId: loanId });

            // Try by LOAN_xxx format
            if (!loan && typeof loanId === 'string' && loanId.startsWith('LOAN_')) {
                const fineractId = parseInt(loanId.replace('LOAN_', ''), 10);
                loan = await this.loanModel.findOne({ fineractLoanId: fineractId });
            }

            // ✅ Try by fineractLoanId if loanId is numeric
            if (!loan) {
                const numericId = parseInt(String(loanId), 10);
                if (!isNaN(numericId)) {
                    loan = await this.loanModel.findOne({ fineractLoanId: numericId });
                }
            }

            if (!loan) {
                return res.status(HttpStatus.NOT_FOUND).json({ message: 'Loan not found' });
            }

            // 2. Check ownership - support multiple ID formats
            const loanData = loan as any; // Cast to access dynamic properties
            const borrowerId = loanData.borrower?.toString();
            const borrowerKeycloakId = loanData.borrowerKeycloakId || loanData.borrowerKeycloakUserId;
            const userKeycloakId = user.keycloakUserId || user.sub || user.id;
            const userUsername = user.username || user.preferred_username; // ✅ Phone number

            this.logger.debug(`[Prepay] Checking ownership: borrowerId=${borrowerId}, userUsername=${userUsername}, userId=${userId}`);

            // ✅ Compare with username (phone number) as well
            const isOwner = borrowerId === userId ||
                borrowerId === userUsername ||  // ✅ Phone number match
                borrowerKeycloakId === userKeycloakId ||
                borrowerKeycloakId === userId ||
                borrowerId === userKeycloakId;

            if (!isOwner) {
                this.logger.warn(`[Prepay] Authorization failed for loan ${loan.contractId}`);
                return res.status(HttpStatus.FORBIDDEN).json({ message: 'Not authorized to prepay this loan' });
            }

            // 3. Get remaining balance from Fineract
            if (!loan.fineractLoanId) {
                return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Loan not linked to Fineract' });
            }

            const loanDetails = await this.fineractService.getLoanDetails(loan.fineractLoanId);

            if (!loanDetails.status?.active) {
                return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Loan is not active' });
            }

            // ✅ FIX: Get prepayment amount from Fineract prepayment template (accurate interest)
            // This gives us the ACTUAL interest portion, not an estimate
            const prepayInfo = await this.fineractService.getPrepaymentAmount(loan.fineractLoanId);

            const principalOutstanding = prepayInfo.principalPortion || loanDetails.summary?.principalOutstanding || 0;
            const interestPortion = prepayInfo.interestPortion || 0; // EXACT interest from Fineract
            const totalPrepayAmount = prepayInfo.amount || (principalOutstanding + interestPortion);

            this.logger.log(`[Prepayment] Using Fineract prepayment template:`);
            this.logger.log(`  - Principal: ${principalOutstanding}`);
            this.logger.log(`  - Interest (EXACT): ${interestPortion}`);
            this.logger.log(`  - Total: ${totalPrepayAmount}`);
 
            // 4. Validate borrower - use loan's borrowerFineractClientId or resolve from wallet
            let borrowerFineractClientId = loanData.borrowerFineractClientId;

            if (!borrowerFineractClientId) {
                // Try finding wallet by multiple ID formats
                let wallet = await this.walletModel.findOne({ p2pUserId: userId });
                if (!wallet) {
                    wallet = await this.walletModel.findOne({ p2pUserId: userUsername }); // phone number
                }

                if (wallet?.fineractClientId) {
                    borrowerFineractClientId = wallet.fineractClientId;
                } else {
                    // ✅ Try to resolve via Fineract service
                    try {
                        borrowerFineractClientId = await this.fineractService.resolveClientId(userUsername || userId);
                    } catch (e) {
                        this.logger.warn(`[Prepay] Could not resolve Fineract client: ${e}`);
                    }
                }
            }

            if (!borrowerFineractClientId) {
                return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Wallet not linked to Fineract' });
            }

            const clientDetails = await this.fineractService.getClientDetails(Number(borrowerFineractClientId));
            const savingsAccount = clientDetails.savingsAccounts?.find((acc: any) => acc.status?.active === true);

            if (!savingsAccount || savingsAccount.accountBalance < totalPrepayAmount) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    message: `Insufficient balance for prepayment. Required: ${totalPrepayAmount}, Available: ${savingsAccount?.accountBalance || 0}`
                });
            }

            // 5. Make prepayment on Fineract
            const fineractPrepayment = await this.fineractService.makeRepayment(
                loan.fineractLoanId,
                totalPrepayAmount,
                new Date().toISOString().split('T')[0],
                `Người vay trả nợ [${loan.contractId}]` // P2P Context with LOAN_ID
            );

            // 6. Transfer Borrower → Escrow
            const transferRes = await this.fineractService.transferFunds(
                Number(borrowerFineractClientId),
                this.escrowService['adminClientId'],
                savingsAccount.id,
                this.escrowService['adminEscrowAccountId'],
                totalPrepayAmount,
                `Người vay trả nợ [${loan.contractId}]` // P2P Context with LOAN_ID
            );

            // 7. ✅ Fetch investments and prepare for FD distribution
            const investments = await this.repaymentService['investModel'].find({
                loanContract: loan._id,
                status: 'success'
            }).populate('lender');

            if (!investments || investments.length === 0) {
                throw new Error('No investments found for this loan');
            }

            // Enrich investments with FD data (same as processRepayment logic)
            const enrichedInvestments = await Promise.all(
                investments.map(async (inv) => {
                    const lenderId = inv.lender['_id'] ? inv.lender['_id'].toString() : inv.lender.toString();
                    return {
                        _id: inv._id,
                        contractId: inv.contractId, // ✅ Pass contractId for logging
                        lenderId,
                        amount: inv.info.capital,
                        lenderFineractClientId: inv.lenderFineractClientId, // ✅ Pass existing client ID
                        fineractFixedDepositAccountId: inv.fineractFixedDepositAccountId,
                        fixedDepositInterestRate: inv.fixedDepositInterestRate || loan.lenderInterestRate
                    };
                })
            );

            this.logger.log(`[Prepayment] Distributing to ${enrichedInvestments.length} lenders with exact interest: ${interestPortion}`);

            // Pass the exact interest portion from Fineract for accurate distribution
            const distributionResult = await this.repaymentService['distributeRepaymentToLendersWithFD'](
                loanId,
                totalPrepayAmount,
                enrichedInvestments,  // ✅ Now passing actual investments data
                true, // isFinalPayment
                loan,
                interestPortion  // ✅ Pass the exact interest portion from Fineract
            );

            // 8. Update Loan status to closed
            await this.loanModel.findByIdAndUpdate(loan._id, {
                $set: {
                    status: 'closed',
                    fineractStatus: 'CLOSED',
                    closedDate: new Date()
                },
                $push: {
                    repaymentHistory: {
                        date: new Date(),
                        amount: totalPrepayAmount,
                        type: 'prepayment',
                        fineractTransactionId: fineractPrepayment?.transactionId,
                        escrowTransferId: transferRes.resourceId
                    }
                }
            });

            this.logger.log(`✓ Loan ${loanId} prepaid and closed successfully`);

            return res.status(HttpStatus.OK).json({
                statusCode: HttpStatus.OK,
                message: 'Prepayment processed successfully',
                data: {
                    success: true,
                    loanId,
                    prepaymentAmount: totalPrepayAmount,
                    principalOutstanding,
                    interestPortion, // Changed from interestOutstanding
                    distribution: distributionResult,
                    loanStatus: 'closed'
                }
            });

        } catch (error: any) {
            this.logger.error(`Prepayment error: ${error.message}`);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
        }
    }

    /**
     * Get repayment schedule for a loan
     */
    @Get('schedule/:loanId')
    async getRepaymentSchedule(@Param('loanId') loanId: string, @Res() res: Response) {
        try {
            // Find loan
            let loan = await this.loanModel.findOne({ contractId: loanId });
            if (!loan && loanId.startsWith('LOAN_')) {
                const fineractId = parseInt(loanId.replace('LOAN_', ''), 10);
                loan = await this.loanModel.findOne({ fineractLoanId: fineractId });
            }

            if (!loan) {
                return res.status(HttpStatus.NOT_FOUND).json({ message: 'Loan not found' });
            }

            // Get schedule from Fineract
            let schedule: any = null;
            if (loan.fineractLoanId) {
                const loanDetails = await this.fineractService.getLoanDetails(loan.fineractLoanId);
                schedule = loanDetails.repaymentSchedule;
            }

            // Fallback to MongoDB cached schedule
            if (!schedule && loan.fineractRepaymentSchedule) {
                schedule = loan.fineractRepaymentSchedule;
            }

            return res.status(HttpStatus.OK).json({
                statusCode: HttpStatus.OK,
                message: 'Repayment schedule retrieved successfully',
                data: {
                    loanId,
                    schedule: schedule || { periods: [] },
                    source: schedule ? 'fineract' : 'mongodb'
                }
            });

        } catch (error: any) {
            this.logger.error(`Get schedule error: ${error.message}`);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
        }
    }
}
