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
import { CreditScoringService } from './services/credit-scoring.service';
import { InterestRateCalculatorService } from './services/interest-rate-calculator.service';
import { calculateRates as calculateDynamicRates } from '../utils/interest-rate-calculator';
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
 * Schedule period for preview (WYSIWYG)
 */
export interface SchedulePeriod {
    period: number;
    principal: number;
    interest: number;
    total: number;
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
    schedulePreview?: SchedulePeriod[]; // NEW: For UI display
}

import { FixedDepositService } from './services/fixed-deposit.service';
import { InvestmentContract } from '../invest/schemas/investment-contract.schema';

@Injectable()
export class LoanService {
    private readonly logger = new Logger(LoanService.name);
    private readonly timezone: string;

    constructor(
        @InjectModel(LoanContract.name)
        private readonly loanContractModel: Model<LoanContract>,
        @InjectModel(InvestmentContract.name)
        private readonly investmentContractModel: Model<InvestmentContract>,
        private readonly configService: ConfigService,
        private readonly blockchainService: BlockchainService,
        private readonly fineractService: FineractService,
        private readonly creditScoringService: CreditScoringService,
        private readonly rateCalculator: InterestRateCalculatorService,
        private readonly fixedDepositService: FixedDepositService,
        private readonly transactionLogService: TransactionLogService,
    ) {
        this.timezone = this.configService.get<string>('TIMEZONE') || 'Asia/Ho_Chi_Minh';
    }

    /**
     * Check loan rate (preview before creation)
     * Uses Fineract Loan Product configuration (respects interestType: FLAT or Declining Balance)
     */
    async checkRate(dto: CheckRateDto): Promise<RateCheckResponse> {
        const { capital, periodMonth, disbursementDate } = dto;

        // Use Fineract to get rate & calculation based on Loan Product settings
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
            schedulePreview: schedule.schedulePreview, // NEW: WYSIWYG schedule
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

        // 3. 🔍 CREDIT ASSESSMENT (Pre-Loan via Fineract /predict API)
        this.logger.log(`\n========== CREDIT ASSESSMENT START ==========`);
        const creditAssessment = await this.creditScoringService.assessPreLoan(
            (dto.digitalFootprint || {
                battery_level: 50,
                submission_hour: new Date().getHours(),
                connection_type: 'unknown',
                location_match: 'false',
            }) as any,
            capital,
            periodMonth,
        );

        this.logger.log(`[Credit Score] ${creditAssessment.score} / 850 (Grade: ${creditAssessment.grade})`);
        this.logger.log(`[Risk Level] ${creditAssessment.riskLevel}`);
        this.logger.log(`[Source] ${creditAssessment.source} | Predicted Risk: ${creditAssessment.predictedRisk}`);

        // ❌ REJECT if not approved
        if (!creditAssessment.isApproved) {
            this.logger.error(`\n❌ LOAN REJECTED - Insufficient Credit Score`);
            this.logger.error(`Reasons: ${creditAssessment.rejectionReasons?.join(', ')}`);
            this.logger.log(`==========================================\n`);

            throw new BadRequestException({
                message: 'Khoản vay bị từ chối do điểm tín dụng không đủ',
                creditScore: creditAssessment.score,
                grade: creditAssessment.grade,
                reasons: creditAssessment.rejectionReasons,
                recommendations: creditAssessment.recommendations
            });
        }

        this.logger.log(`✅ Credit Assessment PASSED`);
        this.logger.log(`Recommendations: ${creditAssessment.recommendations.join(', ')}`);
        this.logger.log(`==========================================\n`);

        // 4. Rate Calculation (Standard Fineract Product)
        // Get Fineract schedule which dictates the rate based on Loan Product configuration
        const schedule = await this.fineractService.calculateLoanSchedule(capital, periodMonth);
        this.logger.log(`\n========== LOAN PRODUCT RATE ==========`);
        this.logger.log(`[Source] Fineract Loan Product`);
        this.logger.log(`[Rate] ${schedule.rate}% (Annual: ${schedule.annualRate}%)`);
        this.logger.log(`[Monthly Payment] ${schedule.monthlyPay.toLocaleString()}`);
        this.logger.log(`=======================================\n`);

        // Standard Logic for P2P: Lender gets (BorrowerRate - AdminSpread)
        // Admin Spread is fixed at 3% usually, or configured
        const adminSpread = 3;
        const borrowerAnnualRate = schedule.annualRate;
        const lenderAnnualRate = borrowerAnnualRate - adminSpread;

        // Convert to monthly for display/storage consistency
        const lenderMonthlyRate = Number((lenderAnnualRate / 12).toFixed(2));
        const adminSpreadMonthly = Number((adminSpread / 12).toFixed(2));

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
                rate: schedule.rate, // Fineract rate for loan product (Borrower Rate)
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
                // Lender rates (Calculated from Product Rate - Spread)
                lenderRate: lenderMonthlyRate,
                annualLenderRate: lenderAnnualRate,
                spread: adminSpread,
                interestType: schedule.interestType,
            },
            totalNotes: Math.ceil(capital / 500000),
            status: 'waiting',
            // Standard Rates
            borrowerInterestRate: schedule.annualRate,
            lenderInterestRate: lenderAnnualRate,
            adminSpread: adminSpread,
            adminSpreadPercentage: 0, // Not percentage of rate anymore, fixed spread
            loanSizeTier: 'STANDARD', // No tiering
            spreadCalculationMethod: 'fixed_spread_3_percent',
            // Credit Assessment Data (Still kept for reference/risk audit, but doesn't affect rate)
            creditScore: creditAssessment.score,
            creditGrade: creditAssessment.grade,
            riskLevel: creditAssessment.riskLevel,
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

                const fineractPayload = {
                    capital: loanContract.info.capital,
                    periodMonth: loanContract.info.periodMonth,
                    disbursementDate: loanContract.info.disbursementDate.toISOString(),
                    willing: loanContract.info.willing,
                    contractId: loanContract.contractId,
                };

                this.logger.log(`[Fineract] Sending Loan Application Payload: ${JSON.stringify(fineractPayload)}`);

                const result = await this.fineractService.createLoanApplication(
                    clientId,
                    fineractPayload,
                );

                fineractLoanId = result.fineractLoanId;

                // Update MongoDB with Fineract data
                await this.loanContractModel.updateOne(
                    { _id: loanContract._id },
                    {
                        $set: {
                            fineractLoanId: result.fineractLoanId,
                            fineractStatus: result.status,
                            borrowerFineractClientId: clientId,
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

        // === LOG LOAN CREATION FOR RECONCILIATION ===
        await this.transactionLogService.logLoanCreation({
            loanId: loanContract.contractId,
            borrowerId: user._id,
            capital: loanContract.info.capital,
            periodMonth: loanContract.info.periodMonth,
            rate: loanContract.info.rate,
            fineractLoanId: fineractLoanId || undefined,
            status: 'PENDING', // Loan is pending until fully matched and disbursed
        });

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
     * Get loans for current borrower with pagination
     * Prefer getting from Fineract if enabled
     */
    async getMyLoans(
        user: AuthUser,
        page: number = 1,
        limit: number = 10,
        status?: string
    ): Promise<{ data: LoanContract[]; total: number; page: number; limit: number; totalPages: number }> {
        const userId = user.username || user.keycloakUserId || user._id;
        const offset = (page - 1) * limit;

        this.logger.log(`[getMyLoans] START: userId=${userId}, page=${page}, limit=${limit}, status=${status}`);

        // 1. Try to get from Fineract if enabled
        if (this.fineractService.isFineractEnabled() && user.fineractClientId) {
            this.logger.log(`[getMyLoans] Trying Fineract path...`);
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
                    // Check if we need to filter status - if so, we must fetch ALL loans then filter & paginate manually
                    const isFiltering = status && status !== 'all';

                    // IF Filtering: Fetch up to 1000 items to ensure we get enough candidates
                    // IF Not Filtering: Fetch just the requested page
                    const fetchLimit = isFiltering ? 1000 : limit;
                    const fetchOffset = isFiltering ? 0 : offset;

                    this.logger.log(`[getMyLoans] Fineract clientId=${clientId}, requesting offset=${fetchOffset}, limit=${fetchLimit}, isFiltering=${isFiltering}`);

                    const response = await this.fineractService.getLoans({
                        offset: fetchOffset,
                        limit: fetchLimit,
                        clientId,
                        orderBy: 'id', // Use id for deterministic pagination (submittedOnDate can have duplicates)
                        sortOrder: 'DESC'
                    });

                    this.logger.log(`[getMyLoans] Fineract response keys: ${Object.keys(response || {}).join(', ')}`);

                    // Handle both Fineract response formats:
                    // 1. Paginated: { pageItems: [...], totalFilteredRecords: N }
                    // 2. Direct array: [...] (some Fineract versions)
                    let loanItems: any[] = [];
                    let total = 0;

                    if (response?.pageItems && Array.isArray(response.pageItems)) {
                        loanItems = response.pageItems;
                        // For manual filtering, total is length of fetched items initially
                        total = isFiltering ? loanItems.length : (response.totalFilteredRecords || response.totalRecords || loanItems.length);

                        // If NOT filtering and native pagination seems incomplete, apply heuristic
                        if (!isFiltering && total === loanItems.length && loanItems.length === limit) {
                            total = (page * limit) + limit;
                        }
                    } else if (Array.isArray(response)) {
                        // Direct array response
                        loanItems = response;
                        total = response.length;
                    }

                    if (loanItems.length > 0) {
                        let loans = loanItems.map(l => this.mapFineractLoanToContract(l));

                        // Apply status filter if provided (filter after mapping)
                        if (isFiltering) {
                            const statusFilters = status!.split(',').map(s => s.trim().toLowerCase());
                            this.logger.log(`[getMyLoans] Applying status filter: ${statusFilters.join(', ')}`);

                            const beforeCount = loans.length;
                            loans = loans.filter(loan => {
                                const loanStatus = (loan.status || '').toLowerCase();
                                return statusFilters.some(sf => loanStatus.includes(sf) || sf.includes(loanStatus));
                            });
                            this.logger.log(`[getMyLoans] Filtered: ${beforeCount} -> ${loans.length} loans`);

                            // Update total to actual filtered count
                            total = loans.length;

                            // Perform Manual Pagination on the filtered result
                            // Because we fetched a large batch (page 1 huge limit), we need to slice it for the requested page
                            // Note: If user has > 1000 loans, this simplistic approach might miss some, but sufficient for now.
                            // Real production would need to fetch ALL pages or use Fineract Search API if available.
                            const startIndex = (page - 1) * limit;
                            const endIndex = startIndex + limit;
                            loans = loans.slice(startIndex, endIndex);

                            this.logger.log(`[getMyLoans] Manual Pagination: Sliced ${startIndex}-${endIndex}, returning ${loans.length} items`);
                        }

                        this.logger.log(`[getMyLoans] Returning ${loans.length} loans for client ${clientId} (Page ${page})`);

                        return {
                            data: loans,
                            total,
                            page,
                            limit,
                            totalPages: Math.ceil(total / limit)
                        };
                    }
                }
            } catch (error) {
                this.logger.warn(`[getMyLoans] Fineract fetch failed: ${error.message}. Falling back to DB.`);
            }
        } else {
            this.logger.log(`[getMyLoans] Fineract disabled or no clientId, using MongoDB...`);
        }

        // 2. Fallback to MongoDB
        this.logger.log(`[getMyLoans] Fetching from MongoDB...`);
        let query: any = {};

        // Build query for borrower
        if (Types.ObjectId.isValid(userId)) {
            query = { borrower: new Types.ObjectId(userId) };
        } else {
            query = {
                $or: [
                    { 'borrower': userId },
                    { 'borrower.keycloakUserId': userId },
                ]
            };
        }

        // Add status filter if provided
        if (status && status !== 'all') {
            // Check if status is a comma-separated list or single status
            const statuses = status.split(',').map(s => s.trim());
            if (statuses.length > 0) {
                // Map frontend status to backend/Fineract status values if needed
                // But MongoDB stores string status like 'active', 'waiting'
                query.status = { $in: statuses };
            }
        }

        const [loans, total] = await Promise.all([
            this.loanContractModel
                .find(query)
                .sort({ createdAt: -1 })
                .skip(offset)
                .limit(limit)
                .exec(),
            this.loanContractModel.countDocuments(query)
        ]);

        this.logger.log(`[getMyLoans] MongoDB result: ${loans.length} loans, total=${total}, page=${page}, totalPages=${Math.ceil(total / limit)}`);

        return {
            data: loans,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
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
     * Public method to resolve Fineract Loan ID
     * Used by controller for scorecard endpoints
     */
    async resolveFineractLoanIdPublic(loanIdOrContractId: string): Promise<number | null> {
        return this.resolveFineractLoanId(loanIdOrContractId);
    }

    /**
     * Get credit scorecard history for a loan
     * @param fineractLoanId - Fineract loan ID
     * @returns Array of scorecards, newest first
     */
    async getScorecardHistory(fineractLoanId: number): Promise<any[]> {
        return this.creditScoringService.getScorecardHistory(fineractLoanId);
    }

    /**
     * Assess credit score using Digital Footprint
     * @param fineractLoanId - Fineract loan ID
     * @param userId - User ID for logging
     * @param footprint - Digital footprint data
     */
    async assessCreditScore(
        fineractLoanId: number,
        userId: string,
        footprint: any,
    ): Promise<any> {
        const result = await this.creditScoringService.assessCreditworthiness(
            userId,
            0, // requestedAmount not used for assessment
            footprint,
            fineractLoanId,
        );
        return result;
    }

    /**
     * Pre-Assess Credit Score (before loan creation)
     * Chấm điểm TRƯỚC khi tạo khoản vay.
     * HIGH_RISK → Từ chối, MEDIUM/LOW → Cho phép
     * 
     * @param userId - User ID for logging
     * @param capital - Loan amount
     * @param periodMonth - Loan term
     * @param footprint - Digital footprint data
     */
    async preAssessCreditScore(
        userId: string,
        capital: number,
        periodMonth: number,
        footprint: any,
    ): Promise<any> {
        this.logger.log(`[PreAssess] User ${userId} requesting ${capital} VND for ${periodMonth} months`);

        const result = await this.creditScoringService.assessPreLoan(
            footprint,
            capital,
            periodMonth,
        );

        this.logger.log(`[PreAssess] Result: Score=${result.score}, CanProceed=${result.canProceed}`);
        return result;
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

        // DEBUG: Log loanPurposeName from Fineract
        this.logger.log(`[DEBUG mapFineract] Loan ${fLoan.id}: loanPurposeName="${fLoan.loanPurposeName}", loanPurposeId=${fLoan.loanPurposeId}, loanPurpose=${JSON.stringify(fLoan.loanPurpose)}`);

        const createdDate = this.parseFineractDate(fLoan.timeline?.submittedOnDate) || new Date();
        const disbursementDate = this.parseFineractDate(fLoan.timeline?.actualDisbursementDate);
        const maturityDate = this.parseFineractDate(fLoan.timeline?.expectedMaturityDate);

        return {
            contractId: fLoan.externalId || `LOAN_F${fLoan.id}`,
            borrower: fLoan.clientId, // Just ID
            info: {
                capital: fLoan.principal || 0,
                rate: fLoan.interestRatePerPeriod || 0,
                annualRate: fLoan.annualInterestRate || 0, // Approximate
                periodMonth: fLoan.numberOfRepayments || 0, // Assuming months
                willing: fLoan.loanPurposeName || 'Khoản vay',
                disbursementDate: disbursementDate?.toISOString(),
                maturityDate: maturityDate?.toISOString(),
                monthlyPay: (fLoan.totalExpectedRepayment || 0) / (fLoan.numberOfRepayments || 1), // Approx
                entirelyPay: fLoan.totalExpectedRepayment || 0,
                createdDate: createdDate.toISOString(),
            },
            status: status,
            createdAt: createdDate.toISOString(), // Populate root field for LoanListScreen
            fineractLoanId: fLoan.id,
            fineractStatus: fStatus.value,
            blockchainSynced: true // Assume synced if exists in Core
        } as any;
    }


    /**
     * Get loan by ID
     */
    async getLoanById(loanId: string, userId?: string): Promise<LoanContract> {
        this.logger.log(`========== GET LOAN BY ID DEBUG ==========`);
        this.logger.log(`[getLoanById] Input: loanId=${loanId}, userId=${userId}`);

        const query: any = {};

        // Try to find by contractId or MongoDB _id
        if (Types.ObjectId.isValid(loanId)) {
            query.$or = [
                { _id: new Types.ObjectId(loanId) },
                { contractId: loanId },
            ];
            this.logger.log(`[getLoanById] Valid ObjectId, searching by _id OR contractId`);
        } else {
            query.contractId = loanId;
            this.logger.log(`[getLoanById] Not ObjectId, searching by contractId only`);
        }

        // If userId provided, verify ownership
        if (userId) {
            query.borrower = new Types.ObjectId(userId);
            this.logger.log(`[getLoanById] Adding borrower filter: ${userId}`);
        }

        this.logger.log(`[getLoanById] Final query: ${JSON.stringify(query)}`);

        const loan = await this.loanContractModel.findOne(query).exec();

        if (!loan) {
            this.logger.warn(`[getLoanById] ❌ Loan NOT FOUND`);
            throw new NotFoundException('Không tìm thấy khoản vay');
        }

        this.logger.log(`[getLoanById] ✅ Found loan:`);
        this.logger.log(`  - contractId: ${loan.contractId}`);
        this.logger.log(`  - borrower: ${loan.borrower}`);
        this.logger.log(`  - status: ${loan.status}`);
        this.logger.log(`  - fineractLoanId: ${loan.fineractLoanId}`);
        this.logger.log(`  - info.rate: ${loan.info?.rate}%`);
        this.logger.log(`  - info.capital: ${loan.info?.capital}`);
        this.logger.log(`==========================================`);

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
            this.logger.warn(`[getFineractLoanDetails] ❌ Could not resolve Fineract Loan ID`);
            return null;
        }

        try {
            const fineractDetails = await this.fineractService.getLoanDetails(fineractLoanId);
            const extracted = this.fineractService.extractLoanInfo(fineractDetails);



            return extracted;
        } catch (error) {
            this.logger.error(`[getFineractLoanDetails] ❌ Error: ${error.message}`);
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
            this.logger.warn(`[getRepaymentSchedule] ❌ Could not resolve Fineract Loan ID`);
            return null;
        }

        try {
            const schedule = await this.fineractService.getRepaymentSchedule(fineractLoanId);



            return schedule;
        } catch (error) {
            this.logger.error(`[getRepaymentSchedule] ❌ Error: ${error.message}`);
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
    async getOutstandingBalance(id: string | number): Promise<any> {
        let fineractId = Number(id);
        if (isNaN(fineractId) || id.toString().length > 10) {
            // Assume MongoID or ContractID
            const query = id.toString().match(/^[0-9a-fA-F]{24}$/)
                ? { _id: id }
                : { contractId: id };

            const loan = await this.loanContractModel.findOne(query);

            if (!loan || !loan.fineractLoanId) {
                // Try parsing as number again just in case string was numeric
                if (!isNaN(Number(id))) fineractId = Number(id);
                else throw new NotFoundException('Loan not found or not synced with Fineract');
            } else {
                fineractId = loan.fineractLoanId;
            }
        }

        return this.fineractService.getOutstandingBalance(fineractId);
    }

    /**
     * Get prepayment amount for early loan closure
     */
    async getPrepayAmount(id: string | number): Promise<any> {
        let fineractId = Number(id);
        if (isNaN(fineractId) || id.toString().length > 10) {
            const query = id.toString().match(/^[0-9a-fA-F]{24}$/)
                ? { _id: id }
                : { contractId: id };

            const loan = await this.loanContractModel.findOne(query);

            if (!loan || !loan.fineractLoanId) {
                if (!isNaN(Number(id))) fineractId = Number(id);
                else throw new NotFoundException('Loan not found');
            } else {
                fineractId = loan.fineractLoanId;
            }
        }
        return this.fineractService.getPrepaymentAmount(fineractId);
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
        return this.fineractService.makeLoanRepayment(fineractLoanId, transactionAmount, transactionDate);
    }
    /**
     * Early repayment / prepay loan
     * 1. Get prepay amount from Fineract
     * 2. Transfer from Borrower Savings → Escrow Account
     * 3. Make repayment in Fineract
     * 4. Update status in MongoDB
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

        // Find loan by fineractLoanId to get borrower info
        const loan = await this.loanContractModel.findOne({ fineractLoanId });
        if (!loan) {
            throw new NotFoundException(`Loan with fineractLoanId ${fineractLoanId} not found`);
        }

        // If no amount specified, get from prepay template or outstanding balance
        let amount = transactionAmount;
        if (!amount) {
            try {
                const prepayInfo = await this.fineractService.getPrepaymentAmount(fineractLoanId);
                amount = prepayInfo.amount;
            } catch {
                // Fallback to outstanding balance
                const outstanding = await this.fineractService.getOutstandingBalance(fineractLoanId);
                amount = outstanding.totalOutstanding;
            }
        }

        // Transfer from Borrower Savings → Escrow
        let transferResult: any = null;
        try {
            const borrowerFineractClientId = loan.borrowerFineractClientId;

            if (borrowerFineractClientId) {
                const borrowerSavingsAccount = await this.fineractService.getClientSavingsAccount(
                    Number(borrowerFineractClientId)
                );

                if (borrowerSavingsAccount) {
                    // Check balance
                    if (borrowerSavingsAccount.balance < amount) {
                        throw new BadRequestException(
                            `Số dư không đủ. Số dư hiện tại: ${borrowerSavingsAccount.balance}, Số tiền cần trả: ${amount}`
                        );
                    }

                    const escrowAccountId = this.fineractService.getEscrowAccountId();
                    const adminClientId = this.fineractService.getAdminClientId();

                    this.logger.log(`Transferring ${amount} VND from Borrower ${borrowerSavingsAccount.id} to Escrow ${escrowAccountId}...`);

                    transferResult = await this.fineractService.transferBetweenAccounts(
                        borrowerSavingsAccount.id,             // from Borrower Savings
                        escrowAccountId,                       // to Escrow
                        amount,
                        `Tất toán sớm khoản vay ${loan.contractId}`,
                        Number(borrowerFineractClientId),      // fromClientId
                        adminClientId                          // toClientId
                    );

                    this.logger.log(`Transfer successful: ${JSON.stringify(transferResult)}`);
                }
            }
        } catch (error) {
            this.logger.error(`Failed to transfer funds from borrower: ${error.message}`);
            throw error; // For prepay, we should fail if transfer fails
        }

        // Make repayment with full amount in Fineract
        const result = await this.fineractService.makeLoanRepayment(fineractLoanId, amount, transactionDate);

        // Update status to closed
        await this.loanContractModel.updateOne(
            { fineractLoanId },
            {
                $set: {
                    status: 'closed',
                    prepay_transfer_id: transferResult?.resourceId || null,
                }
            }
        );

        return {
            ...result,
            transferResult,
            message: 'Tất toán sớm thành công',
        };
    }

    /**
     * Disburse loan
     * 1. Approve loan in Fineract
     * 2. Disburse loan in Fineract
     * 3. Transfer funds: Escrow Account → Borrower Savings Account
     * 4. Update status in MongoDB and Blockchain
     */
    async disburseLoan(loanId: string): Promise<any> {
        const loan = await this.getLoanById(loanId);

        if (!loan.fineractLoanId) {
            throw new BadRequestException('Khoản vay chưa được đồng bộ với Fineract');
        }

        // 1. Approve loan in Fineract
        try {
            this.logger.log(`Approving loan ${loan.fineractLoanId} in Fineract...`);
            await this.fineractService.approveLoan(loan.fineractLoanId);
        } catch (error) {
            this.logger.error(`Failed to approve loan in Fineract: ${error.message}`);
            // If already approved, we can continue
            if (!error.message.includes('already approved')) {
                throw new Error(`Không thể phê duyệt khoản vay trên Fineract: ${error.message}`);
            }
        }

        // 2. Disburse loan in Fineract
        try {
            this.logger.log(`Disbursing loan ${loan.fineractLoanId} in Fineract...`);
            const disbursementDate = moment.tz(this.timezone).format('YYYY-MM-DD');
            await this.fineractService.disburseLoan(loan.fineractLoanId, disbursementDate);
        } catch (error) {
            this.logger.error(`Failed to disburse loan in Fineract: ${error.message}`);
            throw new Error(`Không thể giải ngân khoản vay trên Fineract: ${error.message}`);
        }

        // 3. [NEW] Transfer Funds: FD -> Escrow (Activate Funds)
        try {
            const investments = await this.investmentContractModel.find({ loanContract: loan._id });
            this.logger.log(`[disburseLoan] Found ${investments.length} investments. Processing FD withdrawals...`);

            for (const investment of investments) {
                if (investment.fineractFixedDepositAccountId) {
                    try {
                        await this.fixedDepositService.withdrawToEscrow(
                            investment.fineractFixedDepositAccountId,
                            investment.info.capital
                        );
                    } catch (fdError) {
                        this.logger.error(`Failed to withdraw FD ${investment.fineractFixedDepositAccountId}: ${fdError.message}`);
                        // Continue to ensure loan disbursement happens (reconciliation will fix later)
                    }
                }
            }
        } catch (error) {
            this.logger.warn(`Error processing FD withdrawals: ${error.message}`);
        }

        // 4. Transfer funds from Escrow → Borrower Savings Account
        let transferResult: any = null;
        try {
            this.logger.log(`Transferring ${loan.info.capital} VND from Escrow to Borrower...`);

            // Get borrower's Fineract client ID from loan
            const borrowerFineractClientId = loan.borrowerFineractClientId;

            if (!borrowerFineractClientId) {
                this.logger.warn(`Borrower has no fineractClientId, skipping transfer`);
            } else {
                // Get borrower's savings account
                const borrowerSavingsAccount = await this.fineractService.getClientSavingsAccount(
                    Number(borrowerFineractClientId)
                );

                if (!borrowerSavingsAccount) {
                    this.logger.warn(`Borrower has no active savings account, skipping transfer`);
                } else {
                    const escrowAccountId = this.fineractService.getEscrowAccountId();
                    const adminClientId = this.fineractService.getAdminClientId();

                    transferResult = await this.fineractService.transferBetweenAccounts(
                        escrowAccountId,                       // from Escrow
                        borrowerSavingsAccount.id,             // to Borrower Savings
                        loan.info.capital,                     // amount
                        `Giải ngân khoản vay ${loan.contractId}`,
                        adminClientId,                         // fromClientId (Escrow)
                        Number(borrowerFineractClientId)       // toClientId (Borrower)
                    );

                    this.logger.log(`Transfer successful: ${JSON.stringify(transferResult)}`);
                }
            }
        } catch (error) {
            this.logger.error(`Failed to transfer funds to borrower: ${error.message}`);
            // Don't fail the whole disbursement if transfer fails
            // The loan is still disbursed in Fineract, just manual transfer needed
        }


        // 4. Update status in MongoDB
        await this.loanContractModel.updateOne(
            { _id: loan._id },
            {
                $set: {
                    status: 'disbursed',
                    disburse_done: true,
                    disburse_date: new Date(),
                    disburse_transfer_id: transferResult?.resourceId || null,
                }
            }
        );

        // 5. Update status in Blockchain
        if (this.blockchainService.isBlockchainEnabled()) {
            try {
                await this.blockchainService.updateLoanStatus(loan.contractId, 'disbursed');
            } catch (error) {
                this.logger.warn(`Failed to update blockchain status: ${error.message}`);
            }
        }

        return {
            success: true,
            message: 'Giải ngân thành công',
            loanId: loan.contractId,
            fineractLoanId: loan.fineractLoanId,
            transferResult: transferResult,
        };
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

