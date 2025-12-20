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
        disbursementDate: Date;
        maturityDate: Date;
        monthlyPrincipalPay: number;
        monthlyInterestPay: number;
        monthlyPay: number;
        entirelyPay: number;
        interestType: string;
    };
    status: string;
    totalNotes: number;
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

        // 6. Create blockchain contract (if enabled)
        let blockchainTxId: string | undefined;
        const isBlockchainEnabled = this.blockchainService.isBlockchainEnabled();
        this.logger.log(`[DEBUG] Blockchain Enabled: ${isBlockchainEnabled}`);

        if (isBlockchainEnabled) {
            try {
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
                    },
                );
                blockchainTxId = blockchainData.contractId;
                this.logger.log(`Blockchain contract created: ${blockchainTxId}`);
            } catch (error) {
                this.logger.warn(`Blockchain failed, continuing with database: ${error}`);
            }
        }

        // 7. Save to MongoDB
        // Use username or keycloakUserId as borrower identifier (Keycloak users don't have MongoDB ObjectId)

        const loanContract = new this.loanContractModel({
            contractId: blockchainTxId || contractId,
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
            blockchainSynced: !!blockchainTxId,
            blockchainTxId,
        });

        await loanContract.save();
        this.logger.log(`Loan saved to MongoDB: ${loanContract.contractId}`);

        // 8. Create Fineract loan (if enabled)
        let fineractLoanId: number | undefined;
        const isFineractEnabled = this.fineractService.isFineractEnabled();
        const isLoanCreationEnabled = this.fineractService.isLoanCreationEnabled();
        this.logger.log(`[DEBUG] Fineract Sync: Enabled=${isFineractEnabled}, Creation=${isLoanCreationEnabled}`);

        if (isFineractEnabled && isLoanCreationEnabled) {
            try {
                // Resolve Fineract Client ID if missing
                let clientId = user.fineractClientId;
                this.logger.log(`Initial User: ${JSON.stringify(user)} | ClientId: ${clientId}`);

                // Check if clientId is a valid number (Fineract uses integer IDs)
                if (clientId && isNaN(Number(clientId))) {
                    this.logger.warn(`Invalid Fineract Client ID in token: ${clientId} (not a number). Ignoring.`);
                    clientId = undefined;
                }

                if (!clientId && user.username) {
                    this.logger.log(`Fineract Client ID missing for ${user.username}, attempting to lookup by externalId`);
                    const client = await this.fineractService.getClientByExternalId(user.username);
                    if (client) {
                        clientId = client.id;
                        this.logger.log(`Found Fineract Client ID: ${clientId}`);
                    } else {
                        // Auto-create client if not found
                        this.logger.log(`Client not found. Creating new Fineract Client for ${user.username}...`);
                        const names = (user.name || user.username || 'User').split(' ');
                        const lastName = names.pop() || 'User';
                        const firstName = names.join(' ') || 'New';

                        try {
                            const newClient = await this.fineractService.createClient(firstName, lastName, user.username);
                            clientId = newClient.id;
                            this.logger.log(`Created new Fineract Client ID: ${clientId}`);
                        } catch (err) {
                            this.logger.error(`Failed to auto-create client: ${err}`);
                        }
                    }
                }

                if (!clientId) {
                    throw new Error(`Cannot find or create Fineract Client ID for user ${user.username}`);
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
                throw new Error('Failed to sync with Fineract. Please try again.');
            }
        }

        this.logger.log(`Loan created successfully: ${loanContract.contractId}`);

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
            blockchainSynced: loanContract.blockchainSynced,
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
     */
    async getMyLoans(userId: string): Promise<LoanContract[]> {
        this.logger.log(`[getMyLoans] userId received: ${userId}`);

        // Try to find loans with different borrower field formats
        let loans: LoanContract[] = [];

        // Try 1: Match as ObjectId
        if (Types.ObjectId.isValid(userId)) {
            loans = await this.loanContractModel
                .find({ borrower: new Types.ObjectId(userId) })
                .sort({ createdAt: -1 })
                .exec();
            this.logger.log(`[getMyLoans] Found ${loans.length} loans with ObjectId`);
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
            this.logger.log(`[getMyLoans] Found ${loans.length} loans with string match`);
        }

        // Try 3: Get ALL loans for debugging
        if (loans.length === 0) {
            const allLoans = await this.loanContractModel.find().limit(5).exec();
            this.logger.log(`[getMyLoans] Sample loans in DB: ${allLoans.map(l => JSON.stringify({ contractId: l.contractId, borrower: l.borrower })).join(', ')}`);

        }

        return loans;
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
        // Try to get loan from DB first to get fineractLoanId
        const loan = await this.loanContractModel.findOne({
            $or: [
                { contractId: loanIdOrContractId },
                { _id: Types.ObjectId.isValid(loanIdOrContractId) ? new Types.ObjectId(loanIdOrContractId) : undefined },
            ],
        });

        let fineractLoanId: number;
        if (loan?.fineractLoanId) {
            fineractLoanId = loan.fineractLoanId;
        } else {
            // Assume loanIdOrContractId is Fineract loan ID
            fineractLoanId = parseInt(loanIdOrContractId.replace('LOAN_', ''), 10);
        }

        if (!fineractLoanId || isNaN(fineractLoanId)) {
            throw new BadRequestException('Invalid loan ID');
        }

        try {
            const fineractDetails = await this.fineractService.getLoanDetails(fineractLoanId);
            return this.fineractService.extractLoanInfo(fineractDetails);
        } catch (error) {
            if (error.response && error.response.status === 404) {
                this.logger.warn(`Loan ${fineractLoanId} not found in Fineract`);
                return null;
            }
            throw error;
        }
    }

    /**
     * Get repayment schedule for a loan
     */
    async getRepaymentSchedule(loanId: string): Promise<any> {
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
}

