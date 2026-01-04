import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as moment from 'moment-timezone';

import { InvestmentContract } from './schemas';
import { CreateInvestmentDto } from './dto';
import { LoanContract } from '../loan/schemas';
import { FineractService } from '../loan/services/fineract.service';
import { FineractEscrowService } from '../escrow/services/fineract-escrow.service';
import { FixedDepositService } from '../loan/services/fixed-deposit.service';
import { TransactionLogService } from '../reconciliation/services/transaction-log.service';

/**
 * User interface from authentication
 */
export interface AuthUser {
    _id: string;
    keycloakUserId: string;
    username: string;
    email?: string;
    name?: string;
    roles?: string[];
    fineractClientId?: number | string;
}

/**
 * Investment statistics response
 */
export interface InvestmentStats {
    totalInvested: number;
    totalEarned: number;
    pendingReturns: number;
    activeInvestments: number;
    completedInvestments: number;
}

@Injectable()
export class InvestService {
    private readonly logger = new Logger(InvestService.name);
    private readonly timezone: string;
    private readonly noteValue: number = 500000; // 500k VND per note

    constructor(
        @InjectModel(InvestmentContract.name)
        private readonly investmentModel: Model<InvestmentContract>,
        @InjectModel(LoanContract.name)
        private readonly loanContractModel: Model<LoanContract>,
        private readonly fineractService: FineractService,
        private readonly escrowService: FineractEscrowService,
        private readonly configService: ConfigService,
        private readonly fixedDepositService: FixedDepositService, // NEW: Inject FD service
        private readonly transactionLogService: TransactionLogService, // NEW: Inject Transaction Log service
    ) {
        this.timezone = this.configService.get<string>('TIMEZONE') || 'Asia/Ho_Chi_Minh';
    }

    /**
     * Get loans available for investment (waiting status, not fully funded)
     */
    async getAvailableLoans(user: AuthUser, page = 1, limit = 10): Promise<any> {
        const skip = (page - 1) * limit;

        // 1. Get potential loans from Mongo
        const loans = await this.loanContractModel
            .find({
                status: 'waiting',
                borrower: { $ne: user._id }, // Exclude own loans
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit) // Fetch slightly more to account for filtering? No, simple limit for now.
            .lean();

        // 2. Validate against Fineract Status
        const validLoans: any[] = [];
        for (const loan of loans) {
            try {
                if (loan.fineractLoanId) {
                    const fineractLoan = await this.fineractService.getLoanDetails(loan.fineractLoanId);

                    // Filter: Only allow if Pending Approval (100) or Approved/Waiting Disbursal (200)
                    // Reject if Active (300), Closed (600), Withdrawn, Rejected, etc.
                    const status = fineractLoan.status;
                    if (status.pendingApproval || status.waitingForDisbursal) {
                        validLoans.push(loan);
                    } else {
                        this.logger.warn(`[getAvailableLoans] Skipping loan ${loan.contractId}: Fineract status is ${status.value} (ID: ${status.id})`);
                    }
                } else {
                    // No Fineract ID yet (local only) - keep it
                    validLoans.push(loan);
                }
            } catch (err) {
                this.logger.error(`[getAvailableLoans] Failed to check Fineract for ${loan.contractId}: ${err.message}`);
                // decide whether to keep or drop. Let's keep to avoid hiding data on network error, 
                // but mark it? For safety in P2P, maybe drop or keep. 
                // Let's keep it but log error.
                validLoans.push(loan);
            }
        }

        const total = await this.loanContractModel.countDocuments({
            status: 'waiting',
            borrower: { $ne: user._id },
        });

        // 3. Calculate available notes and include lender rates
        const loansWithAvailable = validLoans.map(loan => {
            // Calculate lender interest rate (borrower rate - admin spread)
            const borrowerAnnualRate = loan.borrowerInterestRate || (loan.info?.rate * 12) || 18;
            const adminSpread = 3; // 3% spread for admin
            const lenderAnnualRate = borrowerAnnualRate - adminSpread;

            return {
                ...loan,
                availableNotes: (loan.totalNotes || 0) - (loan.investedNotes || 0),
                availableAmount: ((loan.totalNotes || 0) - (loan.investedNotes || 0)) * this.noteValue,
                fundedPercentage: loan.totalNotes
                    ? Math.round(((loan.investedNotes || 0) / loan.totalNotes) * 100)
                    : 0,
                // Include calculated rates for UI display
                borrowerInterestRate: borrowerAnnualRate,
                lenderInterestRate: lenderAnnualRate,
                adminSpread: adminSpread,
            };
        });

        return {
            data: loansWithAvailable,
            pagination: {
                page,
                limit,
                total: validLoans.length, // Update total to reflect filtered count (approx)
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Create new investment
     */
    async createInvestment(
        user: AuthUser,
        dto: CreateInvestmentDto,
    ): Promise<InvestmentContract> {
        this.logger.log(`\n========== [MONEY_FLOW] INVESTMENT CREATION START ==========`);
        this.logger.log(`[MONEY_FLOW] Lender: ${user.username} | Capital: ${dto.capital?.toLocaleString('vi-VN')} VND`);
        this.logger.log(`[MONEY_FLOW] Loan Contract ID: ${dto.loanContractId}`);

        // 1. Find loan contract
        const loanContract = await this.loanContractModel.findOne({
            $or: [
                { contractId: dto.loanContractId },
                { _id: Types.ObjectId.isValid(dto.loanContractId) ? dto.loanContractId : null },
            ],
        });

        if (!loanContract) {
            throw new NotFoundException(`Loan ${dto.loanContractId} not found`);
        }

        this.logger.log(`[MONEY_FLOW] 📋 Loan Found: ${loanContract.contractId}`);
        this.logger.log(`[MONEY_FLOW]    - Status: ${loanContract.status}`);
        this.logger.log(`[MONEY_FLOW]    - Capital: ${loanContract.info?.capital?.toLocaleString('vi-VN')} VND`);
        this.logger.log(`[MONEY_FLOW]    - Total Notes: ${loanContract.totalNotes} | Invested Notes: ${loanContract.investedNotes || 0}`);
        this.logger.log(`[MONEY_FLOW]    - Fineract Loan ID: ${loanContract.fineractLoanId || 'N/A'}`);

        if (loanContract.status !== 'waiting') {
            throw new BadRequestException('Khoản vay không còn ở trạng thái chờ đầu tư');
        }

        // Check if user is the borrower
        if (loanContract.borrower.toString() === user._id) {
            throw new BadRequestException('Bạn không thể đầu tư vào khoản vay của chính mình');
        }

        // 2. Calculate notes
        const numNotes = dto.numNotes || Math.floor(dto.capital / this.noteValue);
        const investmentCapital = numNotes * this.noteValue;

        this.logger.log(`[MONEY_FLOW] 💰 Investment Amount: ${investmentCapital.toLocaleString('vi-VN')} VND (${numNotes} notes @ ${this.noteValue.toLocaleString('vi-VN')} VND each)`);

        // Check available notes
        const availableNotes = loanContract.totalNotes - (loanContract.investedNotes || 0);
        if (numNotes > availableNotes) {
            throw new BadRequestException(
                `Chỉ còn ${availableNotes} notes có thể đầu tư (${availableNotes * this.noteValue} VND)`
            );
        }

        // 2.5. Create escrow and transfer funds: Lender → Escrow
        let escrowId: string | null = null;
        let escrowTransferId: string | null = null;
        let lenderSavingsAccountId: number | undefined;

        // Resolve lender's Fineract client ID
        let lenderFineractClientId = await this.fineractService.resolveClientId(user.username);

        if (!lenderFineractClientId && user.fineractClientId) {
            const id = Number(user.fineractClientId);
            if (!isNaN(id) && id > 0) lenderFineractClientId = id;
        }

        if (lenderFineractClientId) {
            try {
                // Get lender's savings account
                const lenderSavingsAccount = await this.fineractService.getClientSavingsAccount(lenderFineractClientId);

                if (!lenderSavingsAccount) {
                    throw new BadRequestException('Lender không có tài khoản tiết kiệm Fineract');
                }

                // Store for FD creation (Auto-debit source)
                lenderSavingsAccountId = lenderSavingsAccount.id;

                // Check balance
                if (lenderSavingsAccount.balance < investmentCapital) {
                    throw new BadRequestException(
                        `Số dư không đủ. Số dư hiện tại: ${lenderSavingsAccount.balance.toLocaleString('vi-VN')}, Cần: ${investmentCapital.toLocaleString('vi-VN')} VND`
                    );
                }

                // Step 1: Create escrow record (Local tracking only)
                const borrowerId = loanContract.borrower.toString();
                const escrowRecord = await this.escrowService.createEscrow(
                    loanContract.contractId,
                    user._id,
                    borrowerId,
                    investmentCapital,
                    {
                        fineractLenderClientId: lenderFineractClientId,
                        loanRate: loanContract.info.rate,
                        periodMonth: loanContract.info.periodMonth,
                    }
                );
                escrowId = escrowRecord.escrowId;
                this.logger.log(`[Escrow] Created escrow ${escrowId} for loan ${loanContract.contractId}`);

                // ===== P2P REFERENCE 2-STEP INVESTMENT FLOW =====
                // Step 1: Lender Main → Lender Main (internal transfer) = "Đầu tư vào khoản vay"
                // Step 2: Lender Main → Admin Escrow = "Ký quỹ đầu tư"
                // This creates BOTH labels visible in Fineract UI for reconciliation

                const adminClientId = parseInt(process.env.FINERACT_ADMIN_CLIENT_ID || '1');
                const adminEscrowAccountId = parseInt(process.env.FINERACT_ESCROW_ACCOUNT_ID || '1');

                // ===== TRANSFER 1: "Đầu tư vào khoản vay" (for reconciliation) =====
                // Internal transfer: Lender → Lender (same client, same account)
                // NOTE: This is for reconciliation tracking only - net balance change is 0
                const transfer1Result = await this.fineractService.transferFunds(
                    lenderFineractClientId,    // fromClientId: Lender
                    lenderFineractClientId,    // toClientId: Same Lender (internal)
                    lenderSavingsAccount.id,   // fromAccountId: Lender Main
                    lenderSavingsAccount.id,   // toAccountId: Same account (symbolic)
                    investmentCapital,
                    `Investment funding for loan ${loanContract.contractId} [Fineract:${loanContract.fineractLoanId}]`,
                    true, // deductFeeFromAmount
                    true  // skipFee - internal transfer
                );

                const transfer1TxnId = transfer1Result?.savingsId || transfer1Result?.resourceId;
                this.logger.log(`[Investment] Transfer 1 (Đầu tư vào khoản vay): ${transfer1TxnId}`);

                // ✅ LOG INVEST TRANSFER (Đầu tư vào khoản vay)
                await this.transactionLogService.logInvestment({
                    investmentId: `INV_${Date.now()}`,
                    loanId: loanContract.contractId,
                    lenderId: user._id,
                    amount: investmentCapital,
                    fineractTransferId: Number(transfer1TxnId),
                    status: 'SUCCESS',
                });

                // ===== TRANSFER 2: "Ký quỹ đầu tư" =====
                // Actual transfer: Lender Main → Admin Escrow
                const transfer2Result = await this.fineractService.transferFunds(
                    lenderFineractClientId,    // fromClientId: Lender
                    adminClientId,             // toClientId: Admin
                    lenderSavingsAccount.id,   // fromAccountId: Lender Main
                    adminEscrowAccountId,      // toAccountId: Admin Escrow
                    investmentCapital,
                    `Escrow for loan ${loanContract.contractId} [Fineract:${loanContract.fineractLoanId}]`,
                    true, // deductFeeFromAmount
                    true  // skipFee - TO escrow
                );

                const transfer2TxnId = transfer2Result?.savingsId || transfer2Result?.resourceId;
                this.logger.log(`[Escrow] Transfer 2 (Ký quỹ đầu tư): ${transfer2TxnId}`);

                // Store escrow transfer ID for later use
                escrowTransferId = String(transfer2TxnId);

                // Update escrow record
                await this.escrowService['escrowModel'].updateOne(
                    { escrowId },
                    {
                        status: 'funded',
                        fundTransactionId: String(transfer2TxnId),
                        'metadata.fundedAt': new Date(),
                        'metadata.fineractLenderClientId': lenderFineractClientId,
                        'metadata.transfer1TxnId': transfer1TxnId,
                        'metadata.transfer2TxnId': transfer2TxnId,
                    }
                );

                // ✅ LOG ESCROW TRANSFER (Ký quỹ đầu tư)
                await this.transactionLogService.logEscrowTransfer({
                    loanId: loanContract.contractId,
                    lenderId: String(user._id),
                    amount: investmentCapital,
                    fineractTransactionId: Number(transfer2TxnId)
                });



            } catch (transferError: any) {
                this.logger.error(`[Escrow] Failed to fund escrow: ${transferError.message}`);
                throw new BadRequestException(`Không thể trừ tiền từ tài khoản: ${transferError.message}`);
            }
        } else {
            this.logger.warn(`Lender ${user.username} has no Fineract account, skipping escrow deposit`);
        }

        // 3. Calculate profit based on LENDER rate (not borrower rate)
        // Lender receives lower rate than borrower pays (admin keeps the spread)
        const lenderAnnualRate = loanContract.lenderInterestRate || (loanContract.info.rate * 12) || 12; // Annual %
        const lenderMonthlyRate = lenderAnnualRate / 12; // Monthly %
        const periodMonth = loanContract.info.periodMonth || 6;

        const monthlyInterestIncome = (investmentCapital * lenderMonthlyRate) / 100;
        const monthlyPrincipalIncome = investmentCapital / periodMonth;
        const monthlyIncome = monthlyPrincipalIncome + monthlyInterestIncome;
        const entirelyProfit = monthlyInterestIncome * periodMonth;

        this.logger.log(`[Investment] Using lender rate: ${lenderAnnualRate}%/year (${lenderMonthlyRate.toFixed(2)}%/month)`);

        // 4. Generate contract ID
        const contractId = `INV_${Date.now()}`;

        // Helper to safely get numeric fineractClientId
        const getLenderFineractClientId = (): number | undefined => {
            if (lenderFineractClientId) return lenderFineractClientId;
            if (user.fineractClientId) {
                const id = Number(user.fineractClientId);
                if (!isNaN(id) && id > 0) return id;
            }
            return undefined;
        };


        // 5. Create investment with Fixed Deposit fields
        const investment = new this.investmentModel({
            contractId,
            lender: user._id,
            lenderFineractClientId: getLenderFineractClientId(),
            loanContract: loanContract._id,
            loanContractId: loanContract.contractId,
            escrowId: escrowId, // Track escrow for this investment
            escrowTransactionId: escrowTransferId, // Track fund transaction
            info: {
                capital: investmentCapital,
                numNotes,
                serviceFee: 0,
                monthlyPrincipalIncome,
                monthlyInterestIncome,
                monthlyIncome,
                monthlyProfit: monthlyInterestIncome,
                entirelyProfit,
                createdDate: new Date(),
            },
            status: 'waiting_other',
            escrowStatus: escrowId ? 'escrowed' : 'pending',
            // Fixed Deposit fields - lender rate from loan
            fixedDepositInterestRate: lenderAnnualRate,
            fixedDepositStatus: 'pending',
            fixedDepositBalance: investmentCapital,
            totalPrincipalDistributed: 0,
            fixedDepositTrackedBalance: investmentCapital,
        });

        // ✅ 5.5 Calculate and save lender schedule (HỢP ĐỒNG LỊCH NHẬN TIỀN)
        if (loanContract.fineractLoanId) {
            try {
                const lenderSchedule = await this.calculateLenderScheduleForCreate(
                    investmentCapital,
                    loanContract
                );

                if (lenderSchedule.length > 0) {
                    investment.lenderSchedule = lenderSchedule;
                    investment.scheduleTotalPrincipal = lenderSchedule.reduce((sum, p) => sum + p.principal, 0);
                    investment.scheduleTotalInterest = lenderSchedule.reduce((sum, p) => sum + p.interest, 0);
                    investment.scheduleTotalIncome = lenderSchedule.reduce((sum, p) => sum + p.total, 0);
                    investment.schedulePeriodCount = lenderSchedule.length;

                    this.logger.log(`[Investment] ✅ Lender Schedule saved: ${lenderSchedule.length} periods, ` +
                        `Total Interest: ${investment.scheduleTotalInterest.toLocaleString()} VND`);
                }
            } catch (scheduleError: any) {
                this.logger.warn(`[Investment] ⚠️ Failed to calculate lender schedule: ${scheduleError.message}`);
                // Non-blocking - investment still proceeds
            }
        }

        // ✅ DEBUG: Verify lenderFineractClientId is being saved
        this.logger.debug(`[Investment] Creating investment ${contractId} with lenderFineractClientId: ${investment.lenderFineractClientId}`);

        await investment.save();

        // 7. [ENABLED] Create Fixed Deposit Account on Fineract (Primary Funding Source)
        if (investment.lenderFineractClientId && this.fineractService.isFineractEnabled()) {
            try {
                this.logger.log(`[Investment] Creating Fixed Deposit for ${contractId}...`);
                const fdResult = await this.fixedDepositService.createFixedDepositForLender({
                    investmentContract: investment,
                    loanContract: loanContract,
                    capitalAmount: investmentCapital,
                    lenderFineractClientId: investment.lenderFineractClientId,
                    investmentSavingsAccountId: lenderSavingsAccountId // Pass Linked Account for Auto-Debit
                });

                // Update investment with FD details
                investment.fineractFixedDepositAccountId = fdResult.fdAccountId;
                investment.fixedDepositInterestRate = fdResult.fdRate;
                investment.fixedDepositMaturityDate = fdResult.maturityDate;
                investment.fixedDepositStatus = 'active';

                await investment.save();

                this.logger.log(`[Investment] ✅ Fixed Deposit created: ${fdResult.fdAccountId}`);

                // Log FD Creation
                await this.transactionLogService.logFDTransfer({
                    fdAccountId: fdResult.fdAccountId,
                    investmentId: investment.contractId,
                    lenderId: String(user._id),
                    amount: investmentCapital,
                    action: 'FD_CREATE',
                    status: 'SUCCESS',
                    fineractTransactionId: 0 // FD Creation is the transaction
                });

            } catch (error) {
                this.logger.error(`[Investment] ❌ Failed to create Fixed Deposit: ${error.message}`);
                // Don't rollback investment, but maybe mark as 'fd_failed' or rely on reconciliation to fix
            }
        }

        // 6. Update loan contract
        await this.loanContractModel.updateOne(
            { _id: loanContract._id },
            {
                $inc: { investedNotes: numNotes, matchedAmount: investmentCapital },
                $set: {
                    matchPercentage: Math.round(
                        ((loanContract.investedNotes + numNotes) / loanContract.totalNotes) * 100
                    ),
                    isFullMatch: (loanContract.investedNotes + numNotes) >= loanContract.totalNotes,
                },
            },
        );

        // 7. If fully funded, trigger auto-disbursement
        const newInvestedNotes = (loanContract.investedNotes || 0) + numNotes;
        const isFullMatch = newInvestedNotes >= loanContract.totalNotes;

        this.logger.log(`[MONEY_FLOW] 📊 Match Status: ${newInvestedNotes}/${loanContract.totalNotes} notes (${Math.round((newInvestedNotes / loanContract.totalNotes) * 100)}%)`);

        if (isFullMatch) {
            this.logger.log(`[MONEY_FLOW] ✅ FULL MATCH TRIGGERED for loan ${loanContract.contractId}`);
            this.logger.log(`[MONEY_FLOW] → Will auto-disburse to borrower after investment is saved`);

            // Update loan status to 'success'
            await this.loanContractModel.updateOne(
                { _id: loanContract._id },
                {
                    $set: {
                        status: 'success',
                        isFullMatch: true,
                    },
                },
            );

            // Update all investments for this loan to 'success'
            await this.investmentModel.updateMany(
                { loanContract: loanContract._id },
                { $set: { status: 'success' } },
            );

            // Auto-disburse to borrower (async, non-blocking)
            this.logger.log(`[MONEY_FLOW] 🚀 STARTING DISBURSEMENT FLOW (async)...`);
            this.handleFullMatchDisbursement(loanContract).catch((err) => {
                this.logger.error(`[MONEY_FLOW] ❌ Auto-disburse failed for ${loanContract.contractId}: ${err.message}`);
            });
        } else {
            this.logger.log(`[MONEY_FLOW] ⏳ Waiting for more investments. ${loanContract.totalNotes - newInvestedNotes} notes remaining.`);
        }

        this.logger.log(`[MONEY_FLOW] ✅ Investment saved: ${contractId}`);
        this.logger.log(`========== [MONEY_FLOW] INVESTMENT CREATION END ==========\n`);

        // Note: logInvestment is now called earlier during investment funding transfer (line 228)
        // to ensure it's logged with the correct Fineract transaction ID

        return investment;
    }

    /**
     * Handle auto-disbursement when loan is 100% funded
     * Uses escrow service to release funds: Escrow → Borrower (SINGLE TRANSFER)
     * Implements idempotency pattern to prevent duplicate disbursements
     */
    private async handleFullMatchDisbursement(loanContract: any): Promise<void> {
        this.logger.log(`\n========== [MONEY_FLOW] DISBURSEMENT START ==========`);
        this.logger.log(`[MONEY_FLOW] Loan: ${loanContract.contractId}`);
        this.logger.log(`[MONEY_FLOW] Capital: ${loanContract.info?.capital?.toLocaleString('vi-VN')} VND`);
        this.logger.log(`[MONEY_FLOW] Borrower Fineract Client ID: ${loanContract.borrowerFineractClientId}`);
        this.logger.log(`[MONEY_FLOW] Fineract Loan ID: ${loanContract.fineractLoanId}`);

        try {
            // === IDEMPOTENCY CHECK: Atomic check-and-set ===
            // Prevents duplicate disbursements from race conditions
            this.logger.log(`[MONEY_FLOW] 🔒 IDEMPOTENCY CHECK: Acquiring lock...`);
            const updateResult = await this.loanContractModel.updateOne(
                {
                    _id: loanContract._id,
                    $or: [
                        { 'disbursementInfo.status': { $exists: false } },
                        { 'disbursementInfo.status': 'pending' },
                        { 'disbursementInfo.status': 'failed' },
                        { 'disbursementInfo.status': null },
                    ],
                },
                {
                    $set: {
                        'disbursementInfo.status': 'processing',
                        'disbursementInfo.startedAt': new Date(),
                    },
                },
            );

            if (updateResult.modifiedCount === 0) {
                // Check if already disbursed or processing
                const existingLoan = await this.loanContractModel.findById(loanContract._id);
                if (existingLoan?.disbursementInfo?.status === 'completed') {
                    this.logger.log(`[MONEY_FLOW] ⏩ SKIP: Loan ${loanContract.contractId} already disbursed`);
                    return;
                }
                if (existingLoan?.disbursementInfo?.status === 'processing') {
                    this.logger.warn(`[MONEY_FLOW] ⏩ SKIP: Loan ${loanContract.contractId} disbursement in progress`);
                    return;
                }
            }
            this.logger.log(`[MONEY_FLOW] 🔓 Lock acquired, proceeding...`);

            // Check if loan has Fineract ID
            if (!loanContract.fineractLoanId) {
                this.logger.warn(`[MONEY_FLOW] ❌ No fineractLoanId, skipping auto-disburse`);
                await this.updateDisbursementStatus(loanContract._id, 'failed', 'No Fineract Loan ID');
                return;
            }

            // 1. Approve loan on Fineract
            this.logger.log(`[MONEY_FLOW] 📝 Step 1: Approving loan on Fineract...`);
            await this.fineractService.approveLoan(loanContract.fineractLoanId);
            this.logger.log(`[MONEY_FLOW] ✅ Loan approved on Fineract`);

            // 2. Disburse loan on Fineract (changes loan status to ACTIVE)
            this.logger.log(`[MONEY_FLOW] 📝 Step 2: Disbursing loan on Fineract...`);
            await this.fineractService.disburseLoan(loanContract.fineractLoanId);
            this.logger.log(`[MONEY_FLOW] ✅ Loan status → ACTIVE on Fineract`);

            // 3. Release escrow funds to borrower - SINGLE BATCH TRANSFER
            if (loanContract.borrowerFineractClientId) {
                try {
                    // Get borrower's savings account
                    const borrowerSavingsAccount = await this.fineractService.getClientSavingsAccount(
                        loanContract.borrowerFineractClientId,
                    );

                    if (!borrowerSavingsAccount?.id) {
                        this.logger.warn(`[Disbursement] Borrower ${loanContract.borrowerFineractClientId} has no savings account`);
                        return;
                    }

                    // FD-CENTRIC FLOW: No escrow funding, use loan capital for direct transfer
                    // Since FD auto-debited lender's savings, we transfer from Admin Account to Borrower
                    const loanCapital = loanContract.info?.capital || 0;

                    if (loanCapital <= 0) {
                        this.logger.warn(`[Disbursement] Loan ${loanContract.contractId} has no capital, skipping transfer`);
                        return;
                    }

                    this.logger.log(`[Disbursement] FD-centric flow: Transferring ${loanCapital.toLocaleString('vi-VN')} VND to borrower`);

                    // Direct transfer: Admin Account → Borrower Savings
                    const adminClientId = parseInt(process.env.FINERACT_ADMIN_CLIENT_ID || '1');
                    const adminAccountId = parseInt(process.env.FINERACT_ESCROW_ACCOUNT_ID || '1');

                    const disbursementResult = await this.fineractService.transferFunds(
                        adminClientId,
                        loanContract.borrowerFineractClientId,
                        adminAccountId,
                        borrowerSavingsAccount.id,
                        loanCapital,
                        `Disbursement for loan ${loanContract.contractId} [Fineract:${loanContract.fineractLoanId}]`, // Match reference P2P pattern
                        true, // deductFeeFromAmount
                        true  // skipFee - FROM escrow (p2p ref line 622)
                    );

                    const releaseTransactionId = disbursementResult.savingsId || disbursementResult.resourceId;
                    this.logger.log(`[MONEY_FLOW] ✅ TRANSFER SUCCESSFUL!`);
                    this.logger.log(`[MONEY_FLOW]    - Amount: ${loanCapital.toLocaleString('vi-VN')} VND`);
                    this.logger.log(`[MONEY_FLOW]    - Transaction ID: ${releaseTransactionId}`);

                    // Log Disbursement
                    await this.transactionLogService.logDisbursement({
                        loanId: loanContract.contractId,
                        borrowerId: loanContract.borrowerId,
                        amount: loanCapital,
                        fineractLoanId: loanContract.fineractLoanId,
                        fineractDisbursementId: Number(releaseTransactionId),
                        status: 'SUCCESS'
                    });

                    // [LEGACY ESCROW LOGIC REMOVED - FD-CENTRIC FLOW]
                    // Previously, funds were transferred from escrow to borrower via batchReleaseEscrow.
                    // Now, FD auto-debits lender's savings and we transfer directly from Admin Account.

                } catch (transferError: any) {
                    this.logger.error(`[MONEY_FLOW] ❌ Transfer failed: ${transferError.message}`);
                    // Don't throw - loan is already active on Fineract
                }
            } else {
                this.logger.warn(`[MONEY_FLOW] ⚠️ No borrowerFineractClientId, skipping fund transfer`);
            }

            // 4. Update loan status in MongoDB with disbursement completion
            this.logger.log(`[MONEY_FLOW] 📝 Step 4: Updating MongoDB status...`);
            await this.loanContractModel.updateOne(
                { _id: loanContract._id },
                {
                    $set: {
                        fineractStatus: 'ACTIVE',
                        disburse_done: true,
                        disburse_date: new Date(),
                        'disbursementInfo.status': 'completed',
                        'disbursementInfo.completedAt': new Date(),
                    },
                },
            );

            this.logger.log(`[MONEY_FLOW] ✅ DISBURSEMENT COMPLETE for ${loanContract.contractId}`);
            this.logger.log(`========== [MONEY_FLOW] DISBURSEMENT END ==========\n`);
        } catch (error: any) {
            this.logger.error(`[MONEY_FLOW] ❌ DISBURSEMENT FAILED: ${error.message}`);
            this.logger.log(`========== [MONEY_FLOW] DISBURSEMENT END (ERROR) ==========\n`);
            // Update disbursement status to failed
            await this.updateDisbursementStatus(loanContract._id, 'failed', error.message);
            throw error;
        }
    }

    /**
     * Helper: Update disbursement status
     */
    private async updateDisbursementStatus(
        loanId: any,
        status: 'pending' | 'processing' | 'completed' | 'failed',
        error?: string,
    ): Promise<void> {
        const updateData: any = { 'disbursementInfo.status': status };
        if (status === 'completed') {
            updateData['disbursementInfo.completedAt'] = new Date();
        }
        if (error) {
            updateData['disbursementInfo.error'] = error;
        }
        await this.loanContractModel.updateOne({ _id: loanId }, { $set: updateData });
    }



    /**
     * Get my investments
     */
    async getMyInvestments(
        user: AuthUser,
        status?: string,
        page = 1,
        limit = 10,
    ): Promise<any> {
        const skip = (page - 1) * limit;
        const query: any = { lender: user._id };

        if (status) {
            query.status = status;
        }

        const investments = await this.investmentModel
            .find(query)
            .populate('loanContract')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await this.investmentModel.countDocuments(query);

        // ✅ NEW: Enrich each investment with real-time FD data
        const enrichedInvestments = await Promise.all(
            investments.map(inv => this.enrichInvestmentWithFD(inv))
        );

        return {
            data: enrichedInvestments, // Return enriched data
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get investment statistics
     */
    async getInvestmentStats(user: AuthUser): Promise<InvestmentStats> {
        const investments = await this.investmentModel
            .find({ lender: user._id })
            .lean();

        let totalInvested = 0;
        let totalEarned = 0;
        let pendingReturns = 0;
        let activeInvestments = 0;
        let completedInvestments = 0;

        for (const inv of investments) {
            totalInvested += inv.info?.capital || 0;
            totalEarned += inv.totalReceived || 0;

            if (['waiting_other', 'waiting_transfer', 'success'].includes(inv.status)) {
                activeInvestments++;
                pendingReturns += (inv.info?.entirelyProfit || 0) - (inv.totalInterestReceived || 0);
            } else if (inv.status === 'clean') {
                completedInvestments++;
            }
        }

        return {
            totalInvested,
            totalEarned,
            pendingReturns,
            activeInvestments,
            completedInvestments,
        };
    }

    /**
     * Get investment by ID
     */
    async getInvestmentById(user: AuthUser, investmentId: string): Promise<InvestmentContract> {
        const investment = await this.investmentModel
            .findOne({
                $or: [
                    { contractId: investmentId },
                    { _id: Types.ObjectId.isValid(investmentId) ? investmentId : null },
                ],
                lender: user._id,
            })
            .populate('loanContract');

        if (!investment) {
            throw new NotFoundException(`Investment ${investmentId} not found`);
        }

        // ✅ NEW: Enrich with real-time FD data before returning
        return await this.enrichInvestmentWithFD(investment.toObject());
    }

    /**
     * Calculate lender income schedule using Distributed Accumulation Algorithm
     * Matches loan repayment schedule structure with 3%/year admin spread deducted
     */
    private async calculateLenderSchedule(
        investment: any,
        loanContract: any,
    ): Promise<Array<{
        period: number;
        dueDate: string;
        principal: number;
        interest: number;
        total: number;
    }>> {
        if (!loanContract?.fineractLoanId) {
            this.logger.warn(`[LenderSchedule] No fineractLoanId for loan ${loanContract?.contractId}`);
            return [];
        }

        try {
            // 1. Get loan repayment schedule from Fineract
            const repaymentSchedule = await this.fineractService.getLoanRepaymentSchedule(
                loanContract.fineractLoanId
            );

            if (!repaymentSchedule?.periods) {
                this.logger.warn(`[LenderSchedule] No repayment schedule for loan ${loanContract.fineractLoanId}`);
                return [];
            }

            // 2. Calculate rates and ratios
            const borrowerMonthlyRate = loanContract.info?.rate || 1.5;
            const borrowerAnnualRate = borrowerMonthlyRate * 12; // e.g., 18%
            const adminSpread = this.configService.get<number>('ADMIN_SPREAD_PERCENTAGE') || 3;
            const lenderAnnualRate = Math.max(0.5, borrowerAnnualRate - adminSpread); // e.g., 15%

            // Ratio of lender interest to borrower interest
            const rateRatio = lenderAnnualRate / borrowerAnnualRate;

            // Investment share of total loan
            const investmentCapital = investment.info?.capital || 0;
            const loanCapital = loanContract.info?.capital || 1;
            const investmentRatio = investmentCapital / loanCapital;

            // 3. Rounding config (match Fineract)
            const inMultiplesOf = 1000; // VND rounding

            // 4. Distributed Accumulation Algorithm
            // Smooths out rounding errors by tracking cumulative targets
            let accumulatedBorrowerInterest = 0;
            let accumulatedLenderInterest = 0;
            let accumulatedLenderPrincipal = 0;

            const validPeriods = repaymentSchedule.periods.filter(
                (p: any) => p.period && p.period > 0 && !p.complete
            );

            this.logger.log(`[LenderSchedule] Calculating for ${investment.contractId}: ` +
                `${validPeriods.length} periods, rateRatio=${rateRatio.toFixed(4)}, ` +
                `investmentRatio=${investmentRatio.toFixed(4)}`);

            const lenderSchedule = validPeriods.map((p: any, index: number) => {
                const isLastPeriod = index === validPeriods.length - 1;

                // Parse dueDate array [YYYY, MM, DD]
                let dueDateStr = '';
                if (Array.isArray(p.dueDate)) {
                    const [year, month, day] = p.dueDate;
                    dueDateStr = `${day}/${month}/${year}`;
                } else if (p.dueDate) {
                    dueDateStr = p.dueDate;
                }

                // Borrower values for this period
                const borrowerPrincipal = p.principalDue || 0;
                const borrowerInterest = p.interestDue || 0;

                // Accumulate borrower interest
                accumulatedBorrowerInterest += borrowerInterest;

                // Target cumulative lender interest (rounded)
                const targetCumulativeLenderInterest = this.roundToCurrency(
                    accumulatedBorrowerInterest * rateRatio * investmentRatio,
                    inMultiplesOf
                );

                // This period's lender interest = difference to reach target
                const lenderInterest = Math.max(0, targetCumulativeLenderInterest - accumulatedLenderInterest);
                accumulatedLenderInterest += lenderInterest;

                // Lender principal share
                let lenderPrincipal: number;
                if (isLastPeriod) {
                    // CRITICAL: Adjust last period to ensure total principal = investment capital
                    lenderPrincipal = investmentCapital - accumulatedLenderPrincipal;
                } else {
                    lenderPrincipal = this.roundToCurrency(
                        borrowerPrincipal * investmentRatio,
                        inMultiplesOf
                    );
                }
                accumulatedLenderPrincipal += lenderPrincipal;

                return {
                    period: p.period,
                    dueDate: dueDateStr,
                    principal: lenderPrincipal,
                    interest: lenderInterest,
                    total: lenderPrincipal + lenderInterest,
                };
            });

            // Log first and last periods for debugging
            if (lenderSchedule.length > 0) {
                this.logger.log(`[LenderSchedule] First: ${JSON.stringify(lenderSchedule[0])}`);
                this.logger.log(`[LenderSchedule] Last: ${JSON.stringify(lenderSchedule[lenderSchedule.length - 1])}`);
                this.logger.log(`[LenderSchedule] Total Principal: ${accumulatedLenderPrincipal.toLocaleString()} VND (Capital: ${investmentCapital.toLocaleString()} VND)`);
                this.logger.log(`[LenderSchedule] Total Interest: ${accumulatedLenderInterest.toLocaleString()} VND`);
            }

            return lenderSchedule;

        } catch (error: any) {
            this.logger.error(`[LenderSchedule] Error: ${error.message}`);
            return [];
        }
    }

    /**
     * Round to currency multiples (Fineract rounding rule)
     */
    private roundToCurrency(amount: number, inMultiplesOf: number): number {
        return Math.round(amount / inMultiplesOf) * inMultiplesOf;
    }

    /**
     * Calculate lender schedule for use during investment creation
     * Similar to calculateLenderSchedule but takes capital directly
     */
    private async calculateLenderScheduleForCreate(
        investmentCapital: number,
        loanContract: any,
    ): Promise<Array<{
        period: number;
        dueDate: string;
        principal: number;
        interest: number;
        total: number;
        status: string;
    }>> {
        if (!loanContract?.fineractLoanId) {
            return [];
        }

        try {
            // 1. Get loan repayment schedule from Fineract
            const repaymentSchedule = await this.fineractService.getLoanRepaymentSchedule(
                loanContract.fineractLoanId
            );

            if (!repaymentSchedule?.periods) {
                return [];
            }

            // 2. Calculate rates and ratios
            const borrowerMonthlyRate = loanContract.info?.rate || 1.5;
            const borrowerAnnualRate = borrowerMonthlyRate * 12;
            const adminSpread = this.configService.get<number>('ADMIN_SPREAD_PERCENTAGE') || 3;
            const lenderAnnualRate = Math.max(0.5, borrowerAnnualRate - adminSpread);

            const rateRatio = lenderAnnualRate / borrowerAnnualRate;
            const loanCapital = loanContract.info?.capital || 1;
            const investmentRatio = investmentCapital / loanCapital;

            const inMultiplesOf = 1000;

            // 3. Distributed Accumulation Algorithm
            let accumulatedBorrowerInterest = 0;
            let accumulatedLenderInterest = 0;
            let accumulatedLenderPrincipal = 0;

            const validPeriods = repaymentSchedule.periods.filter(
                (p: any) => p.period && p.period > 0
            );

            return validPeriods.map((p: any, index: number) => {
                const isLastPeriod = index === validPeriods.length - 1;

                let dueDateStr = '';
                if (Array.isArray(p.dueDate)) {
                    const [year, month, day] = p.dueDate;
                    dueDateStr = `${day}/${month}/${year}`;
                } else if (p.dueDate) {
                    dueDateStr = p.dueDate;
                }

                const borrowerPrincipal = p.principalDue || 0;
                const borrowerInterest = p.interestDue || 0;

                accumulatedBorrowerInterest += borrowerInterest;
                const targetCumulativeLenderInterest = this.roundToCurrency(
                    accumulatedBorrowerInterest * rateRatio * investmentRatio,
                    inMultiplesOf
                );
                const lenderInterest = Math.max(0, targetCumulativeLenderInterest - accumulatedLenderInterest);
                accumulatedLenderInterest += lenderInterest;

                // CRITICAL: Adjust last period to ensure total principal = investment capital
                let lenderPrincipal: number;
                if (isLastPeriod) {
                    lenderPrincipal = investmentCapital - accumulatedLenderPrincipal;
                } else {
                    lenderPrincipal = this.roundToCurrency(
                        borrowerPrincipal * investmentRatio,
                        inMultiplesOf
                    );
                }
                accumulatedLenderPrincipal += lenderPrincipal;

                return {
                    period: p.period,
                    dueDate: dueDateStr,
                    principal: lenderPrincipal,
                    interest: lenderInterest,
                    total: lenderPrincipal + lenderInterest,
                    status: 'pending',
                };
            });

        } catch (error: any) {
            this.logger.error(`[LenderScheduleForCreate] Error: ${error.message}`);
            return [];
        }
    }

    /**
     * Enrich investment with real-time Fixed Deposit data AND lender schedule
     * ✅ FIX: Fetch actual profit from Fineract FD account + income schedule
     */
    private async enrichInvestmentWithFD(investment: any): Promise<any> {
        const loanContract = investment.loanContract;

        // Calculate lender schedule (always try, even without FD)
        let lenderSchedule: any[] = [];
        if (loanContract?.fineractLoanId) {
            lenderSchedule = await this.calculateLenderSchedule(investment, loanContract);
        }

        // Calculate totals from schedule
        const totalPrincipal = lenderSchedule.reduce((sum, p) => sum + p.principal, 0);
        const totalInterest = lenderSchedule.reduce((sum, p) => sum + p.interest, 0);
        const totalIncome = lenderSchedule.reduce((sum, p) => sum + p.total, 0);
        const periodCount = lenderSchedule.length || (loanContract?.info?.periodMonth || 12);

        // If no FD account, return with schedule only
        if (!investment.fineractFixedDepositAccountId) {
            return {
                ...investment,
                info: {
                    ...investment.info,
                    // Update with schedule-derived values if available
                    entirelyProfit: totalInterest > 0 ? totalInterest : investment.info?.entirelyProfit,
                    monthlyProfit: totalInterest > 0 ? Math.round(totalInterest / periodCount) : investment.info?.monthlyProfit,
                    monthlyIncome: totalIncome > 0 ? Math.round(totalIncome / periodCount) : investment.info?.monthlyIncome,
                    monthlyPrincipalIncome: totalPrincipal > 0 ? Math.round(totalPrincipal / periodCount) : investment.info?.monthlyPrincipalIncome,
                },
                lenderSchedule,
                scheduleSummary: {
                    totalPrincipal,
                    totalInterest,
                    totalIncome,
                    periodCount,
                },
            };
        }

        try {
            // Get real-time FD account details from Fineract
            const fdDetails = await this.fixedDepositService.getFDAccountDetails(
                investment.fineractFixedDepositAccountId
            );

            // Calculate real-time profit from FD
            const accruedInterest = fdDetails.totalInterestEarned || 0;
            const currentBalance = fdDetails.accountBalance || investment.info.capital;

            // Enrich investment info with FD data + schedule
            const enriched = {
                ...investment,
                info: {
                    ...investment.info,
                    // ✅ Update with schedule-derived values (more accurate than simple calculations)
                    entirelyProfit: totalInterest > 0 ? totalInterest : Math.round(accruedInterest),
                    monthlyProfit: totalInterest > 0 ? Math.round(totalInterest / periodCount) : Math.round(accruedInterest / periodCount),
                    monthlyIncome: totalIncome > 0 ? Math.round(totalIncome / periodCount) : investment.info?.monthlyIncome,
                    monthlyPrincipalIncome: totalPrincipal > 0 ? Math.round(totalPrincipal / periodCount) : investment.info?.monthlyPrincipalIncome,
                    accruedInterest: accruedInterest,
                    currentBalance: currentBalance,
                },
                // Add FD metadata
                fdDetails: {
                    accountNo: fdDetails.accountNo,
                    accountId: fdDetails.id,
                    nominalAnnualInterestRate: fdDetails.nominalAnnualInterestRate,
                    maturityDate: fdDetails.maturityDate,
                    status: fdDetails.status,
                },
                // Add lender schedule
                lenderSchedule,
                scheduleSummary: {
                    totalPrincipal,
                    totalInterest,
                    totalIncome,
                    periodCount,
                },
            };

            this.logger.log(`[FD Enrichment] Investment ${investment.contractId}: ` +
                `FD profit=${accruedInterest.toLocaleString()}, ` +
                `Schedule profit=${totalInterest.toLocaleString()} VND`);

            return enriched;

        } catch (error: any) {
            this.logger.error(`[FD Enrichment] Failed to fetch FD data for investment ${investment.contractId}: ${error.message}`);
            // Return with schedule but without FD data
            return {
                ...investment,
                lenderSchedule,
                scheduleSummary: {
                    totalPrincipal,
                    totalInterest,
                    totalIncome,
                    periodCount,
                },
            };
        }
    }

    /**
     * Get lender wallet balance from Fineract
     */
    async getMyBalance(user: AuthUser): Promise<any> {
        // First try to resolve via username (most reliable)
        const clientId = await this.fineractService.resolveClientId(user.username);

        if (clientId && !isNaN(clientId)) {
            const balance = await this.fineractService.getWalletBalance(clientId);
            return balance;
        }

        // Fallback to fineractClientId from token (if valid number)
        if (user.fineractClientId) {
            const numericClientId = Number(user.fineractClientId);
            if (!isNaN(numericClientId) && numericClientId > 0) {
                const balance = await this.fineractService.getWalletBalance(numericClientId);
                return balance;
            }
        }

        this.logger.warn(`Cannot resolve Fineract client ID for user ${user.username}`);
        return { balance: 0, availableBalance: 0 };
    }

    /**
     * Get investment history time-series data for charts
     * @param user - Authenticated user
     * @param range - Time range: 1W, 1M, 3M, 1Y
     */
    async getInvestmentHistory(user: AuthUser, range: string = '1M'): Promise<any> {
        this.logger.log(`[getInvestmentHistory] User: ${user.username}, Range: ${range}`);

        // Calculate date range using native Date
        const now = new Date();
        let startDate: Date;
        let daysToGenerate: number;

        switch (range) {
            case '1W':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                daysToGenerate = 7;
                break;
            case '3M':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                daysToGenerate = 90;
                break;
            case '1Y':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                daysToGenerate = 12; // Monthly for 1Y
                break;
            case '1M':
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                daysToGenerate = 30;
                break;
        }

        // Fetch ALL investments for this user
        const investments = await this.investmentModel
            .find({ lender: user._id })
            .sort({ createdAt: 1 })
            .lean();

        this.logger.log(`[getInvestmentHistory] Found ${investments.length} total investments`);

        // Get current balance from Fineract (real portfolio value)
        let currentFineractBalance = 0;
        try {
            const balanceData = await this.getMyBalance(user);
            currentFineractBalance = balanceData?.availableBalance || balanceData?.balance || 0;
            this.logger.log(`[getInvestmentHistory] Fineract balance: ${currentFineractBalance}`);
        } catch (err: any) {
            this.logger.warn(`[getInvestmentHistory] Could not get Fineract balance: ${err.message}`);
        }

        // Calculate cumulative balance over time
        let cumulativeBalance = 0;
        let cumulativeProfit = 0;

        // Build date-to-value map
        const dateMap = new Map<string, { balance: number; profit: number }>();

        for (const inv of investments) {
            const invDate = new Date((inv as any).createdAt || Date.now());
            const dateKey = invDate.toISOString().split('T')[0]; // YYYY-MM-DD

            cumulativeBalance += inv.info?.capital || 0;
            cumulativeProfit += inv.info?.entirelyProfit || 0;

            dateMap.set(dateKey, {
                balance: cumulativeBalance,
                profit: cumulativeProfit,
            });
            // Detailed log for debugging (limit to first 5 and last 5 to avoid flooding)
            if (investments.length < 20 || investments.indexOf(inv) < 5 || investments.indexOf(inv) > investments.length - 5) {
                this.logger.log(`[getInvestmentHistory] Inv at ${dateKey}: +${inv.info?.capital}, Sum=${cumulativeBalance}`);
            }
        }

        // Generate chart data points with FIXED number of points for smooth chart
        const chartData: Array<{ label: string; value: number; profit: number; date: string }> = [];
        let lastBalance = 0;
        let lastProfit = 0;

        // Convert map to sorted array data for reliable traversal and optimization
        const sortedDataPoints = Array.from(dateMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        this.logger.log(`[getInvestmentHistory] Sorted data points: ${sortedDataPoints.length}`);

        // Find initial balance before startDate
        const startDateStr = startDate.toISOString().split('T')[0];

        // Find best match for initial balance
        for (const [dateKey, data] of sortedDataPoints) {
            if (dateKey < startDateStr) {
                lastBalance = data.balance;
                lastProfit = data.profit;
            } else {
                break; // Since it is sorted, we can stop early
            }
        }
        this.logger.log(`[getInvestmentHistory] Initial balance at ${startDateStr}: ${lastBalance}`);



        // Fixed number of data points for each range for smooth charts
        const targetPoints = {
            '1W': 7,
            '1M': 15,
            '3M': 18,
            '1Y': 12,
        };

        const numPoints = targetPoints[range as keyof typeof targetPoints] || 15;
        const totalMs = now.getTime() - startDate.getTime();
        const intervalMs = totalMs / (numPoints - 1);

        // Optimization: keep track of last scanned index
        let lastScannedIndex = 0;

        for (let i = 0; i < numPoints; i++) {
            const pointDate = new Date(startDate.getTime() + i * intervalMs);
            const dateKey = pointDate.toISOString().split('T')[0];

            // Find the state for this specific date
            let foundMatch = false;
            for (let j = lastScannedIndex; j < sortedDataPoints.length; j++) {
                const [dk, data] = sortedDataPoints[j];
                if (dk <= dateKey) {
                    lastBalance = data.balance;
                    lastProfit = data.profit;
                    lastScannedIndex = j;
                    foundMatch = true;
                } else {
                    break;
                }
            }

            // Debug log for each point
            this.logger.log(`[getInvestmentHistory] Point ${i} (${dateKey}): Balance=${lastBalance}, Match=${foundMatch}`);

            // Format label based on range
            let label: string;
            if (range === '1Y') {
                const months = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
                label = months[pointDate.getMonth()];
            } else if (range === '3M') {
                label = `${pointDate.getDate()}/${pointDate.getMonth() + 1}`;
            } else {
                label = `${pointDate.getDate()}/${pointDate.getMonth() + 1}`;
            }

            chartData.push({
                label,
                value: lastBalance,
                profit: lastProfit,
                date: dateKey,
            });
        }

        // Get current stats for summary
        const stats = await this.getInvestmentStats(user);

        this.logger.log(`[getInvestmentHistory] Returning ${chartData.length} data points`);

        return {
            range,
            startDate: startDate.toISOString().split('T')[0],
            endDate: now.toISOString().split('T')[0],
            data: chartData,
            summary: {
                ...stats,
                totalInvested: cumulativeBalance,
                totalProfit: cumulativeProfit,
                currentBalance: currentFineractBalance,
                investmentCount: investments.length,
            },
        };
    }

    /**
     * Get Projected Income based on active loan schedules
     */
    async getProjectedIncome(lenderId: string): Promise<any[]> {
        this.logger.log(`[getProjectedIncome] START - Lender: ${lenderId}`);
        try {
            // 1. Find all active investments
            const investments = await this.investmentModel.find({
                lender: lenderId,
                status: 'success'
            }).populate('loanContract');

            this.logger.log(`[getProjectedIncome] Found ${investments.length} active investments`);

            const projectionMap = new Map<string, { principal: number, interest: number, count: number }>();
            const today = new Date();

            let processedCount = 0;
            let skippedNoLoan = 0;
            let skippedNoSchedule = 0;

            for (const inv of investments) {
                const loan = inv.loanContract as any;
                if (!loan || !loan.fineractLoanId) {
                    skippedNoLoan++;
                    continue;
                }

                const repaymentSchedule = await this.fineractService.getLoanRepaymentSchedule(loan.fineractLoanId);
                if (!repaymentSchedule || !repaymentSchedule.periods) {
                    skippedNoSchedule++;
                    continue;
                }

                // Rates
                const borrowerRate = loan.borrowerInterestRate || 12;
                let lenderRate = Number(loan.lenderInterestRate) || 10;

                // Override with FD rate if applicable
                if (inv.fineractFixedDepositAccountId && inv.fixedDepositInterestRate) {
                    lenderRate = inv.fixedDepositInterestRate;
                }

                // Ratio
                const investmentAmount = inv.info.capital;
                const totalLoanAmount = loan.info.capital;
                const ratio = investmentAmount / totalLoanAmount;

                let futurePeriods = 0;
                for (const period of repaymentSchedule.periods) {
                    if (period.complete || !period.dueDate) continue;

                    // Parse date array [YYYY, MM, DD]
                    const dateArr = period.dueDate;
                    const dateStr = `${dateArr[0]}-${String(dateArr[1]).padStart(2, '0')}-${String(dateArr[2]).padStart(2, '0')}`;
                    const dueDate = new Date(dateStr);

                    if (dueDate <= today) continue;

                    futurePeriods++;
                    const monthKey = `${dateArr[0]}-${String(dateArr[1]).padStart(2, '0')}`; // YYYY-MM

                    // Calculate Shares
                    const principalShare = (period.principalDue || 0) * ratio;
                    const totalInterestDue = period.interestDue || 0;
                    const interestShare = totalInterestDue * (lenderRate / borrowerRate) * ratio;

                    if (!projectionMap.has(monthKey)) {
                        projectionMap.set(monthKey, { principal: 0, interest: 0, count: 0 });
                    }

                    const entry = projectionMap.get(monthKey)!;
                    entry.principal += principalShare;
                    entry.interest += interestShare;
                    entry.count += 1;
                }

                if (futurePeriods > 0) {
                    processedCount++;
                    this.logger.log(`[getProjectedIncome] Inv ${inv._id}: ${futurePeriods} future periods, ratio=${ratio.toFixed(2)}, lenderRate=${lenderRate}%`);
                }
            }

            this.logger.log(`[getProjectedIncome] Summary: Processed=${processedCount}, SkippedNoLoan=${skippedNoLoan}, SkippedNoSchedule=${skippedNoSchedule}`);

            // Convert Map to Array & Sort
            const results = Array.from(projectionMap.entries())
                .map(([date, data]) => {
                    // Get last day of the month for label (e.g., "31/01" for January)
                    const [year, month] = date.split('-').map(Number);
                    const lastDay = new Date(year, month, 0).getDate(); // 0 = last day of previous month
                    const label = `${String(lastDay).padStart(2, '0')}/${String(month).padStart(2, '0')}`;

                    return {
                        label,
                        date,
                        value: Math.floor(data.principal + data.interest),
                        principal: Math.floor(data.principal),
                        interest: Math.floor(data.interest)
                    };
                })
                .sort((a, b) => a.date.localeCompare(b.date));

            this.logger.log(`[getProjectedIncome] Lender: ${lenderId}, Total Months: ${results.length}`);
            results.slice(0, 6).forEach(r => {
                this.logger.log(`  -> ${r.label} (${r.date}): Total=${r.value}, Principal=${r.principal}, Interest=${r.interest}`);
            });

            // Return top 6 months
            return results.slice(0, 6);
        } catch (error) {
            this.logger.error(`Failed to calculate projected income: ${error.message}`);
            return [];
        }
    }
}

