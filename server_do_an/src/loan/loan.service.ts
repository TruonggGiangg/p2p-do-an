import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
    ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as moment from 'moment-timezone';

import { LoanContract } from './schemas';
import { CreateLoanDto, CheckRateDto } from './dto';
import { BlockchainService } from './services/blockchain.service';
import { FineractService } from './services/fineract.service';

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
 * Loan creation response
 */
export interface CreateLoanResponse {
    contractId: string;
    info: {
        capital: number;
        rate: number;
        annualRate: number;
        periodMonth: number;
        willing: string;
        disbursementDate?: Date;
        maturityDate?: Date;
        monthlyPrincipalPay?: number;
        monthlyInterestPay?: number;
        monthlyPay?: number;
        entirelyPay?: number;
        interestType?: string;
        createdDate?: Date;
    };
    status: string;
    totalNotes?: number;
    fineractLoanId?: number;
    blockchainSynced: boolean;
}

/**
 * Rate check response
 */
export interface RateCheckResponse {
    rate: number;
    annualRate: number;
    monthlyPrincipalPay: number;
    monthlyInterestPay: number;
    monthlyPay: number;
    entirelyPay: number;
    capital: number;
    periodMonth: number;
    disbursementDate?: string;
    maturityDate?: string;
    interestType: string;
    rateSource: string;
}

@Injectable()
export class LoanService {
    private readonly logger = new Logger(LoanService.name);
    private readonly timezone: string;

    constructor(
        @InjectModel(LoanContract.name)
        private readonly loanContractModel: Model<LoanContract>,
        private readonly configService: ConfigService,
        private readonly blockchainService: BlockchainService,
        private readonly fineractService: FineractService,
    ) {
        this.timezone = this.configService.get<string>('TIMEZONE') || 'Asia/Ho_Chi_Minh';
    }

    /**
     * Check loan rate (preview before creation)
     * Gets rate from Fineract Loan Product - NO local calculation
     */
    async checkRate(dto: CheckRateDto): Promise<RateCheckResponse> {
        const { capital, periodMonth, disbursementDate } = dto;

        // Get rate from Fineract Loan Product
        const schedule = await this.fineractService.calculateLoanSchedule(capital, periodMonth);

        // Calculate dates if disbursementDate provided
        let disbursementDateStr: string | undefined;
        let maturityDateStr: string | undefined;

        if (disbursementDate) {
            const disbDate = moment.tz(disbursementDate, this.timezone);
            disbursementDateStr = disbDate.format('YYYY-MM-DD');

            const maturityDate = disbDate.clone().add(periodMonth, 'months');
            maturityDateStr = maturityDate.format('YYYY-MM-DD');
        }

        return {
            rate: schedule.rate,
            annualRate: schedule.annualRate,
            monthlyPrincipalPay: schedule.monthlyPrincipalPay,
            monthlyInterestPay: schedule.monthlyInterestPay,
            monthlyPay: schedule.monthlyPay,
            entirelyPay: schedule.entirelyPay,
            capital,
            periodMonth,
            disbursementDate: disbursementDateStr,
            maturityDate: maturityDateStr,
            interestType: schedule.interestType,
            rateSource: 'Fineract Loan Product',
        };
    }

    /**
     * Create loan automatically
     * Main entry point for loan creation
     * Gets rate from Fineract Loan Product - NO local calculation
     */
    async createLoanAuto(
        dto: CreateLoanDto,
        user: AuthUser,
    ): Promise<CreateLoanResponse> {
        // 0. Cleanup failed loans (waiting but not in Fineract) to prevent 409 Conflict
        await this.cleanupFailedLoans(user);

        const { capital, periodMonth, willing, disbursementDate } = dto;

        this.logger.log(`[DEBUG] Creating loan for user: ${user.username} | DTO: ${JSON.stringify(dto)}`);

        // 1. Validate disbursement date
        this.validateDisbursementDate(disbursementDate);

        // 2. Check existing active loan (use username for Keycloak compatibility)
        const devMode = this.configService.get<string>('DEV_MODE');
        const isDevMode = devMode && devMode.trim() === 'true';

        const borrowerId = user.username || user.keycloakUserId || user._id;

        if (!isDevMode) {
            const hasActiveLoan = await this.hasActiveLoans(borrowerId);
            if (hasActiveLoan) {
                throw new ConflictException(
                    'Bạn đã có khoản vay đang hoạt động. Vui lòng thanh toán trước khi tạo khoản vay mới.',
                );
            }
        } else {
            this.logger.log('DEV_MODE: Skipping active loan check');
        }

        // 3. Get rate from Fineract Loan Product (NOT local calculation)
        const schedule = await this.fineractService.calculateLoanSchedule(capital, periodMonth);
        this.logger.log(`[DEBUG] Calculated Schedule: Rate=${schedule.rate}%, Annual=${schedule.annualRate}%, MonthlyPay=${schedule.monthlyPay}`);

        this.logger.log(`Using Fineract rate: ${schedule.rate}% (${schedule.interestType})`);

        // 4. Generate contract ID
        const contractId = `LOAN_${Date.now()}`;

        // 5. Calculate dates
        const disbDate = moment.tz(disbursementDate, this.timezone);
        const maturityDate = disbDate.clone().add(periodMonth, 'months');

        // 6. Save to MongoDB FIRST (as Waiting)
        // Use username or keycloakUserId as borrower identifier (Keycloak users don't have MongoDB ObjectId)

        const loanContract = new this.loanContractModel({
            contractId: contractId,
            borrower: borrowerId, // Store as string for Keycloak compatibility
            info: {
                capital,
                rate: schedule.rate,
                periodMonth,
                willing,
                disbursementDate: disbDate.toDate(),
                maturityDate: maturityDate.toDate(),
                createdDate: new Date(),
                monthlyPrincipalPay: schedule.monthlyPrincipalPay,
                monthlyInterestPay: schedule.monthlyInterestPay,
                monthlyPay: schedule.monthlyPay,
                entirelyPay: schedule.entirelyPay,
                annualRate: schedule.annualRate,
                interestType: schedule.interestType,
            },
            totalNotes: Math.ceil(capital / 500000),
            status: 'waiting',
            // Rate source tracking
            rateSource: 'fineract_product',
            blockchainSynced: false,
        });

        await loanContract.save();
        this.logger.log(`Loan saved to MongoDB (Pending): ${loanContract.contractId}`);

        // 7. Create Fineract loan (Source of Truth)
        let fineractLoanId: number | undefined;
        let blockchainTxId: string | undefined;

        if (this.fineractService.isFineractEnabled() && this.fineractService.isLoanCreationEnabled()) {
            try {
                // Resolve Fineract Client ID
                let clientId: number | null = null;

                if (user.fineractClientId && !isNaN(Number(user.fineractClientId))) {
                    clientId = Number(user.fineractClientId);
                } else if (user.username) {
                    clientId = await this.resolveFineractClientId(user.username);

                    // Auto-create client if not found
                    if (!clientId) {
                        this.logger.log(`Creating new Fineract Client for ${user.username}...`);
                        const names = (user.name || user.username || 'User').split(' ');
                        const lastName = names.pop() || 'User';
                        const firstName = names.join(' ') || 'New';
                        try {
                            const newClient = await this.fineractService.createClient(firstName, lastName, user.username);
                            clientId = newClient.id;
                            this.logger.log(`Created Fineract Client: ${clientId}`);
                        } catch (err) {
                            this.logger.error(`Failed to auto-create client: ${err}`);
                        }
                    }
                }

                if (!clientId) {
                    throw new Error(`Cannot resolve Fineract Client ID for user ${user.username}`);
                }

                const result = await this.fineractService.createLoanApplication(
                    clientId,
                    {
                        capital: loanContract.info.capital,
                        periodMonth: loanContract.info.periodMonth,
                        disbursementDate: loanContract.info.disbursementDate.toISOString(),
                        willing: loanContract.info.willing,
                        contractId: loanContract.contractId,
                    },
                );

                fineractLoanId = result.fineractLoanId;

                // Update MongoDB with Fineract data
                await this.loanContractModel.updateOne(
                    { _id: loanContract._id },
                    {
                        $set: {
                            fineractLoanId: result.fineractLoanId,
                            fineractStatus: result.status,
                        },
                    },
                );

                this.logger.log(`Fineract loan created: ${fineractLoanId}`);
            } catch (error) {
                this.logger.error(`Failed to create Fineract loan: ${error}`);
                // Rollback MongoDB loan to prevent inconsistent state
                await this.loanContractModel.deleteOne({ _id: loanContract._id });
                this.logger.log(`Rolled back MongoDB loan ${loanContract.contractId} due to Fineract failure`);
                // RE-THROW to notify user
                throw new Error('Failed to sync with Fineract. Please try again.');
            }
        }

        // 8. Create blockchain contract (Wait for Fineract Success)
        // Only run if Mongo + Fineract success
        const isBlockchainEnabled = this.blockchainService.isBlockchainEnabled();

        if (isBlockchainEnabled) {
            try {
                this.logger.log(`[Blockchain] Creating contract audit record...`);
                const blockchainData = await this.blockchainService.createLoanContract(
                    {
                        id: user._id,
                        username: user.username,
                        email: user.email,
                        name: user.name,
                    },
                    {
                        capital,
                        periodMonth,
                        willing,
                        rate: schedule.rate,
                        annualRate: schedule.annualRate,
                        lenderRate: 0,          // Not used - rate from Fineract
                        annualLenderRate: 0,    // Not used
                        adminSpread: 0,         // Not used
                        monthlyPrincipalPay: schedule.monthlyPrincipalPay,
                        monthlyInterestPay: schedule.monthlyInterestPay,
                        monthlyPay: schedule.monthlyPay,
                        entirelyPay: schedule.entirelyPay,
                        disbursementDate: disbDate.toISOString(),
                        maturityDate: maturityDate.toISOString(),
                        // fineractProductId: this.configService.get<number>('FINERACT_P2P_LOAN_PRODUCT_ID') || 1, // field not in LoanInfo type, removed to fix lint
                    },
                    fineractLoanId, // Link Fineract ID
                );

                blockchainTxId = blockchainData.contractId;

                // Update Mongo with Blockchain TX
                await this.loanContractModel.updateOne(
                    { _id: loanContract._id },
                    {
                        $set: {
                            blockchainSynced: true,
                            blockchainTxId: blockchainTxId,
                        },
                    },
                );

                this.logger.log(`Blockchain contract created Audit: ${blockchainTxId}`);
            } catch (error) {
                // Do NOT rollback Mongo/Fineract because the valid loan exists.
                // Just log checking failure. We can sync later.
                this.logger.warn(`Blockchain audit failed (loan still valid): ${error}`);

                // Mark as not synced
                await this.loanContractModel.updateOne(
                    { _id: loanContract._id },
                    { $set: { blockchainSynced: false } },
                );
            }
        }

        this.logger.log(`Loan process completed: ${loanContract.contractId}`);

        return {
            contractId: loanContract.contractId,
            info: {
                capital: loanContract.info.capital,
                rate: loanContract.info.rate,
                annualRate: schedule.annualRate,
                periodMonth: loanContract.info.periodMonth,
                willing: loanContract.info.willing,
                disbursementDate: loanContract.info.disbursementDate,
                maturityDate: loanContract.info.maturityDate,
                monthlyPrincipalPay: loanContract.info.monthlyPrincipalPay,
                monthlyInterestPay: loanContract.info.monthlyInterestPay,
                monthlyPay: loanContract.info.monthlyPay,
                entirelyPay: loanContract.info.entirelyPay,
                interestType: schedule.interestType,
            },
            status: loanContract.status,
            totalNotes: loanContract.totalNotes,
            fineractLoanId,
            blockchainSynced: !!blockchainTxId,
        };
    }

    /**
     * Validate disbursement date
     */
    private validateDisbursementDate(disbursementDate: string): void {
        const now = moment.tz(this.timezone);
        const disbDate = moment.tz(disbursementDate, this.timezone);

        if (!disbDate.isValid()) {
            throw new BadRequestException('Ngày giải ngân không hợp lệ');
        }

        // Must be at least today
        if (disbDate.isBefore(now, 'day')) {
            throw new BadRequestException('Ngày giải ngân không được ở quá khứ');
        }

        // Must be within 30 days
        const maxDays = this.configService.get<number>('MAX_DISBURSEMENT_DAYS') || 30;
        const maxDate = now.clone().add(maxDays, 'days');
        if (disbDate.isAfter(maxDate, 'day')) {
            throw new BadRequestException(
                `Ngày giải ngân không được quá ${maxDays} ngày kể từ hôm nay`,
            );
        }
    }

    /**
     * Check if user has active loans
     */
    async hasActiveLoans(userId: string): Promise<boolean> {
        // Support both ObjectId and string (username/keycloakUserId) matching
        const query: any = {
            status: { $nin: ['clean', 'fail'] },
        };

        if (Types.ObjectId.isValid(userId)) {
            query.$or = [
                { borrower: new Types.ObjectId(userId) },
                { borrower: userId },
            ];
        } else {
            query.borrower = userId;
        }

        const activeLoans = await this.loanContractModel.countDocuments(query);
        return activeLoans > 0;
    }


    /**
     * Get loans for current borrower
     * Prefer getting from Fineract if enabled
     */
    async getMyLoans(user: AuthUser): Promise<any[]> {
        const userId = user.username || user.keycloakUserId || user._id;

        // 1. Try to get from Fineract if enabled
        if (this.fineractService.isFineractEnabled() && user.fineractClientId) {
            try {
                let clientId: number | null = null;

                // If fineractClientId is a valid number, use it directly
                if (!isNaN(Number(user.fineractClientId))) {
                    clientId = Number(user.fineractClientId);
                } else if (user.username) {
                    // Resolve via username lookup
                    clientId = await this.resolveFineractClientId(user.username);
                }

                if (clientId) {
                    const response = await this.fineractService.getLoans({ limit: 1000 });
                    if (response?.pageItems) {
                        // Filter loans by clientId (Fineract sqlSearch is unreliable)
                        const clientLoans = response.pageItems.filter(
                            (loan: any) => loan.clientId === clientId
                        );
                        this.logger.log(`[getMyLoans] Found ${clientLoans.length} loans for client ${clientId}`);
                        return clientLoans.map(l => this.mapFineractLoanToContract(l));
                    }
                }
            } catch (error) {
                this.logger.warn(`[getMyLoans] Fineract fetch failed: ${error.message}. Falling back to DB.`);
            }
        }

        // 2. Fallback to MongoDB
        this.logger.log(`[getMyLoans] Fetching from MongoDB...`);
        let loans: LoanContract[] = [];

        // Try 1: Match as ObjectId
        if (Types.ObjectId.isValid(userId)) {
            loans = await this.loanContractModel
                .find({ borrower: new Types.ObjectId(userId) })
                .sort({ createdAt: -1 })
                .exec();
        }

        // Try 2: If no results, also try matching as string (keycloakUserId)
        if (loans.length === 0) {
            loans = await this.loanContractModel
                .find({
                    $or: [
                        { 'borrower': userId },
                        { 'borrower.keycloakUserId': userId },
                    ]
                })
                .sort({ createdAt: -1 })
                .exec();
        }

        return loans;
    }

    /**
     * Helper: Resolve Fineract Loan ID from contractId, MongoDB ID, or numeric ID
     */
    private async resolveFineractLoanId(loanIdOrContractId: string): Promise<number | null> {
        const loan = await this.loanContractModel.findOne({
            $or: [
                { contractId: loanIdOrContractId },
                { _id: Types.ObjectId.isValid(loanIdOrContractId) ? new Types.ObjectId(loanIdOrContractId) : undefined },
            ],
        });

        if (loan?.fineractLoanId) return loan.fineractLoanId;
        if (!isNaN(Number(loanIdOrContractId))) return Number(loanIdOrContractId);

        // Search in Fineract by externalId
        if (loanIdOrContractId.startsWith('LOAN_')) {
            try {
                const response = await this.fineractService.getLoans({ limit: 1000 });
                const match = response?.pageItems?.find((l: any) => l.externalId === loanIdOrContractId);
                if (match) return match.id;
            } catch (err) {
                this.logger.warn(`Failed to search loan by externalId: ${err}`);
            }
        }
        return null;
    }

    /**
     * Helper: Resolve Fineract Client ID from username
     * Uses FineractService.resolveClientId with multiple fallback methods:
     * 1. KEYCLOAK_{username} externalId
     * 2. Plain username externalId
     * 3. Phone number lookup (mobileNo)
     * 4. Email lookup (if provided)
     */
    private async resolveFineractClientId(username: string, email?: string): Promise<number | null> {
        return this.fineractService.resolveClientId(username, email);
    }

    /**
     * Helper: Map Fineract Loan to internal LoanContract structure
     */
    private parseFineractDate(dateArr: any): Date | undefined {
        if (!dateArr || !Array.isArray(dateArr) || dateArr.length < 3) return undefined;
        // Fineract returns [year, month, day]. Month is 1-based.
        // Javascript Date month is 0-based.
        return new Date(dateArr[0], dateArr[1] - 1, dateArr[2]);
    }

    private mapFineractLoanToContract(fLoan: any): LoanContract {
        const statusMap = {
            100: 'pending', // Submitted and pending approval
            200: 'approved', // Approved
            300: 'active',   // Active
            400: 'withdrawn', // Withdrawn
            500: 'rejected', // Rejected
            600: 'closed',   // Closed
            601: 'written-off',
            602: 'rescheduled',
            700: 'overpaid'
        };

        const status = statusMap[fLoan.status.id] || 'pending';
        const fStatus = fLoan.status;

        return {
            contractId: fLoan.externalId || `LOAN_F${fLoan.id}`,
            borrower: fLoan.clientId, // Just ID
            info: {
                capital: fLoan.principal || 0,
                rate: fLoan.interestRatePerPeriod || 0,
                annualRate: fLoan.annualInterestRate || 0, // Approximate
                periodMonth: fLoan.numberOfRepayments || 0, // Assuming months
                willing: fLoan.loanPurposeName || 'Personal',
                disbursementDate: this.parseFineractDate(fLoan.timeline?.actualDisbursementDate),
                maturityDate: this.parseFineractDate(fLoan.timeline?.expectedMaturityDate),
                monthlyPay: (fLoan.totalExpectedRepayment || 0) / (fLoan.numberOfRepayments || 1), // Approx
                entirelyPay: fLoan.totalExpectedRepayment || 0,
                createdDate: this.parseFineractDate(fLoan.timeline?.submittedOnDate) || new Date(),
            },
            status: status,
            fineractLoanId: fLoan.id,
            fineractStatus: fStatus.value,
            blockchainSynced: true // Assume synced if exists in Core
        } as any;
    }


    /**
     * Get loan by ID
     */
    async getLoanById(loanId: string, userId?: string): Promise<LoanContract> {
        const query: any = {};

        // Try to find by contractId or MongoDB _id
        if (Types.ObjectId.isValid(loanId)) {
            query.$or = [
                { _id: new Types.ObjectId(loanId) },
                { contractId: loanId },
            ];
        } else {
            query.contractId = loanId;
        }

        // If userId provided, verify ownership
        if (userId) {
            query.borrower = new Types.ObjectId(userId);
        }

        const loan = await this.loanContractModel.findOne(query).exec();

        if (!loan) {
            throw new NotFoundException('Không tìm thấy khoản vay');
        }

        return loan;
    }

    /**
     * Get waiting loans (for lenders)
     */
    async getWaitingLoans(): Promise<LoanContract[]> {
        return this.loanContractModel
            .find({
                status: 'waiting',
                $expr: { $lt: ['$investedNotes', '$totalNotes'] },
            })
            .populate('borrower', 'username email name')
            .sort({ createdAt: -1 })
            .exec();
    }

    /**
     * Get loan statistics
     */
    async getLoanStatistics(loanId: string): Promise<{
        totalPaid: number;
        totalRemaining: number;
        progressPercentage: number;
    }> {
        const loan = await this.getLoanById(loanId);

        // If has Fineract loan, get from Fineract
        if (loan.fineractLoanId && this.fineractService.isFineractEnabled()) {
            try {
                const outstanding = await this.fineractService.getOutstandingBalance(
                    loan.fineractLoanId,
                );
                const totalDue = loan.info.entirelyPay;
                const paid = totalDue - outstanding.totalOutstanding;

                return {
                    totalPaid: paid,
                    totalRemaining: outstanding.totalOutstanding,
                    progressPercentage: Math.round((paid / totalDue) * 100),
                };
            } catch (error) {
                this.logger.warn(`Failed to get Fineract statistics, using local data`);
            }
        }

        // Fallback to funding percentage
        const fundedPercentage =
            loan.totalNotes > 0
                ? Math.round((loan.investedNotes / loan.totalNotes) * 100)
                : 0;

        return {
            totalPaid: 0,
            totalRemaining: loan.info.entirelyPay,
            progressPercentage: fundedPercentage,
        };
    }

    // ==================== FINERACT WRAPPER METHODS ====================

    /**
     * Get loan purposes from Fineract
     */
    async getLoanPurposes(): Promise<Array<{ id: number; name: string; position: number }>> {
        if (!this.fineractService.isFineractEnabled()) {
            return [];
        }
        return this.fineractService.getLoanPurposeCodeValues();
    }

    /**
     * Get full loan details from Fineract (including schedule and transactions)
     */
    async getFineractLoanDetails(loanIdOrContractId: string): Promise<any> {
        const fineractLoanId = await this.resolveFineractLoanId(loanIdOrContractId);

        if (!fineractLoanId) {
            this.logger.warn(`[getFineractDetails] Could not resolve Fineract Loan ID for: ${loanIdOrContractId}`);
            return null;
        }

        try {
            const fineractDetails = await this.fineractService.getLoanDetails(fineractLoanId);
            return this.fineractService.extractLoanInfo(fineractDetails);
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Get repayment schedule for a loan
     */
    async getRepaymentSchedule(loanId: string): Promise<any> {
        const fineractLoanId = await this.resolveFineractLoanId(loanId);

        if (!fineractLoanId) {
            this.logger.warn(`[getRepaymentSchedule] Could not resolve Fineract Loan ID for: ${loanId}`);
            return null;
        }

        try {
            return await this.fineractService.getRepaymentSchedule(fineractLoanId);
        } catch (error) {
            if (error.response && error.response.status === 404) return null;
            throw error;
        }
    }

    /**
     * Get transaction history for a loan
     */
    async getTransactions(loanId: string): Promise<any[]> {
        const fineractLoanId = await this.resolveFineractLoanId(loanId);

        if (!fineractLoanId) {
            this.logger.warn(`[getTransactions] Could not resolve Fineract Loan ID for: ${loanId}`);
            return [];
        }

        try {
            return await this.fineractService.getLoanTransactions(fineractLoanId);
        } catch (error) {
            if (error.response && error.response.status === 404) return [];
            throw error;
        }
    }

    /**
     * Get outstanding balance for a loan
     */
    async getOutstandingBalance(loanId: string): Promise<any> {
        const fineractLoanId = await this.resolveFineractLoanId(loanId);

        if (!fineractLoanId) {
            this.logger.warn(`[getOutstandingBalance] Could not resolve Fineract Loan ID for: ${loanId}`);
            return null;
        }

        try {
            return await this.fineractService.getOutstandingBalance(fineractLoanId);
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Get prepayment amount for early loan closure
     */
    async getPrepayAmount(loanId: string): Promise<any> {
        // Resolve ID
        const loan = await this.loanContractModel.findOne({
            $or: [
                { contractId: loanId },
                { _id: Types.ObjectId.isValid(loanId) ? new Types.ObjectId(loanId) : undefined },
            ],
        });
        const fineractLoanId = loan?.fineractLoanId || parseInt(loanId.replace('LOAN_', ''), 10);

        if (!fineractLoanId || isNaN(fineractLoanId)) {
            throw new BadRequestException('Invalid loan ID');
        }

        try {
            return await this.fineractService.getPrepaymentAmount(fineractLoanId);
        } catch (error) {
            if (error.response && error.response.status === 404) return null;
            throw error;
        }
    }

    /**
     * Make a repayment on a loan
     */
    async makeRepayment(
        fineractLoanId: number,
        transactionAmount: number,
        transactionDate?: string,
        note?: string,
    ): Promise<any> {
        if (!fineractLoanId || !transactionAmount) {
            throw new BadRequestException('fineractLoanId and transactionAmount are required');
        }
        return this.fineractService.makeRepayment(fineractLoanId, transactionAmount, transactionDate, note);
    }

    /**
     * Early repayment / prepay loan
     */
    async prepayLoan(
        fineractLoanId: number,
        transactionAmount?: number,
        transactionDate?: string,
        note?: string,
    ): Promise<any> {
        if (!fineractLoanId) {
            throw new BadRequestException('fineractLoanId is required');
        }

        // If no amount specified, get from prepay template
        let amount = transactionAmount;
        if (!amount) {
            const prepayInfo = await this.fineractService.getPrepaymentAmount(fineractLoanId);
            amount = prepayInfo.amount;
        }

        return this.fineractService.prepayLoan(fineractLoanId, amount, transactionDate, note);
    }
    /**
     * Cleanup failed loans (waiting but missing Fineract ID)
     */
    async cleanupFailedLoans(user: AuthUser): Promise<void> {
        if (!this.fineractService.isFineractEnabled()) return;

        const userId = user._id || user.keycloakUserId || user.username;
        const query: any = {
            status: 'waiting',
            fineractLoanId: { $exists: false }
        };

        if (Types.ObjectId.isValid(userId)) {
            query.$or = [{ borrower: new Types.ObjectId(userId) }, { borrower: userId }];
        } else {
            query.borrower = userId;
        }

        const result = await this.loanContractModel.deleteMany(query);
        if (result.deletedCount > 0) {
            this.logger.log(`Auto-cleaned ${result.deletedCount} stuck loans for ${user.username}`);
        }
    }

    /**
     * Check blockchain status
     */
    async checkBlockchainStatus(): Promise<{ enabled: boolean; connected: boolean }> {
        const enabled = this.blockchainService.isBlockchainEnabled();
        const connected = enabled ? await this.blockchainService.ensureConnection() : false;
        return { enabled, connected };
    }

    // ==================== BLOCKCHAIN UI HELPERS ====================

    async getBlockchainStats() {
        const totalLoans = await this.loanContractModel.countDocuments();
        // Since investment logic is not fully implemented in DB, we use 0 or mock
        const totalInvestments = 0;
        return { success: true, data: { totalLoans, totalInvestments } };
    }

    async getLoansPaginated(page: number, limit: number) {
        const skip = (page - 1) * limit;
        const [loans, total] = await Promise.all([
            this.loanContractModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
            this.loanContractModel.countDocuments()
        ]);

        const data = loans.map(l => ({
            contractId: l.contractId,
            amount: l.info.capital,
            interestRate: l.info.rate,
            term: l.info.periodMonth,
            createdAt: l.info.createdDate || l['createdAt'],
            status: l.status,
            disbursementDate: l.info.disbursementDate,
            maturityDate: l.info.maturityDate,
            totalNotes: l.totalNotes,
            monthlyPayment: l.info.monthlyPay,
            totalPayment: l.info.entirelyPay
        }));

        return {
            success: true,
            page: Number(page),
            totalPages: Math.ceil(total / limit),
            total,
            data
        };
    }

    async getTransactionsRecent(page: number, limit: number) {
        // Mock transactions from Loans for now (Creation events)
        const { data, total, totalPages } = await this.getLoansPaginated(page, limit);

        const txs = data.map(l => ({
            txhash: l.contractId + '_tx', // Mock hash
            type: 'createLoanContract',
            status: l.status,
            amount: l.amount,
            createdt: l.createdAt,
            blockid: Math.floor(Math.random() * 1000) + 100, // Mock block
            chaincodename: 'p2plending'
        }));

        return {
            success: true,
            page: Number(page),
            totalPages,
            total,
            data: txs
        };
    }
}

