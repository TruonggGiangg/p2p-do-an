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
    private readonly noteValue: number = 100000; // 100k VND per note

    constructor(
        @InjectModel(InvestmentContract.name)
        private readonly investmentModel: Model<InvestmentContract>,
        @InjectModel(LoanContract.name)
        private readonly loanContractModel: Model<LoanContract>,
        private readonly fineractService: FineractService,
        private readonly configService: ConfigService,
    ) {
        this.timezone = this.configService.get<string>('TIMEZONE') || 'Asia/Ho_Chi_Minh';
    }

    /**
     * Get loans available for investment (waiting status, not fully funded)
     */
    async getAvailableLoans(user: AuthUser, page = 1, limit = 10): Promise<any> {
        const skip = (page - 1) * limit;

        const loans = await this.loanContractModel
            .find({
                status: 'waiting',
                borrower: { $ne: new Types.ObjectId(user._id) }, // Exclude own loans
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await this.loanContractModel.countDocuments({
            status: 'waiting',
            borrower: { $ne: new Types.ObjectId(user._id) },
        });

        // Calculate available notes for each loan
        const loansWithAvailable = loans.map(loan => ({
            ...loan,
            availableNotes: (loan.totalNotes || 0) - (loan.investedNotes || 0),
            availableAmount: ((loan.totalNotes || 0) - (loan.investedNotes || 0)) * this.noteValue,
            fundedPercentage: loan.totalNotes
                ? Math.round(((loan.investedNotes || 0) / loan.totalNotes) * 100)
                : 0,
        }));

        return {
            data: loansWithAvailable,
            pagination: {
                page,
                limit,
                total,
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
        this.logger.log(`Creating investment for user ${user.username}: ${JSON.stringify(dto)}`);

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

        // Check available notes
        const availableNotes = loanContract.totalNotes - (loanContract.investedNotes || 0);
        if (numNotes > availableNotes) {
            throw new BadRequestException(
                `Chỉ còn ${availableNotes} notes có thể đầu tư (${availableNotes * this.noteValue} VND)`
            );
        }

        // 2.5. Transfer from Lender Savings → Escrow (deposit investment)
        let escrowTransferId: number | string | null = null;

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

                // Check balance
                if (lenderSavingsAccount.balance < investmentCapital) {
                    throw new BadRequestException(
                        `Số dư không đủ. Số dư hiện tại: ${lenderSavingsAccount.balance.toLocaleString('vi-VN')}, Cần: ${investmentCapital.toLocaleString('vi-VN')} VND`
                    );
                }

                // Get escrow account
                const escrowAccountId = this.fineractService.getEscrowAccountId();
                const adminClientId = this.fineractService.getAdminClientId();

                this.logger.log(`Transferring ${investmentCapital} VND from Lender ${lenderFineractClientId} to Escrow...`);

                // Transfer: Lender → Escrow
                const transferResult = await this.fineractService.transferBetweenAccounts(
                    lenderSavingsAccount.id,
                    escrowAccountId,
                    investmentCapital,
                    `Đầu tư khoản vay ${loanContract.contractId}`,
                    lenderFineractClientId,
                    adminClientId,
                );

                escrowTransferId = transferResult?.resourceId;
                this.logger.log(`Lender fund deposited to escrow: ${escrowTransferId}`);
            } catch (transferError: any) {
                this.logger.error(`Failed to transfer from lender to escrow: ${transferError.message}`);
                throw new BadRequestException(`Không thể trừ tiền từ tài khoản: ${transferError.message}`);
            }
        } else {
            this.logger.warn(`Lender ${user.username} has no Fineract account, skipping escrow deposit`);
        }

        // 3. Calculate profit based on loan info
        const loanRate = loanContract.info.rate || 1.5; // Monthly rate %
        const periodMonth = loanContract.info.periodMonth || 6;

        const monthlyInterestIncome = (investmentCapital * loanRate) / 100;
        const monthlyPrincipalIncome = investmentCapital / periodMonth;
        const monthlyIncome = monthlyPrincipalIncome + monthlyInterestIncome;
        const entirelyProfit = monthlyInterestIncome * periodMonth;

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


        // 5. Create investment
        const investment = new this.investmentModel({
            contractId,
            lender: new Types.ObjectId(user._id),
            lenderFineractClientId: getLenderFineractClientId(),
            loanContract: loanContract._id,
            loanContractId: loanContract.contractId,
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
            escrowStatus: 'pending',
        });


        await investment.save();

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

        if (isFullMatch) {
            this.logger.log(`Loan ${loanContract.contractId} is now 100% funded!`);

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
            this.handleFullMatchDisbursement(loanContract).catch((err) => {
                this.logger.error(`Auto-disburse failed for ${loanContract.contractId}: ${err.message}`);
            });
        }

        this.logger.log(`Investment created: ${contractId}`);
        return investment;
    }

    /**
     * Handle auto-disbursement when loan is 100% funded
     */
    private async handleFullMatchDisbursement(loanContract: any): Promise<void> {
        try {
            // Check if loan has Fineract ID
            if (!loanContract.fineractLoanId) {
                this.logger.warn(`Loan ${loanContract.contractId} has no fineractLoanId, skipping auto-disburse`);
                return;
            }

            this.logger.log(`Starting auto-disbursement for loan ${loanContract.contractId}...`);

            // 1. Approve loan on Fineract
            const approveResult = await this.fineractService.approveLoan(loanContract.fineractLoanId);
            this.logger.log(`Loan ${loanContract.contractId} approved on Fineract: ${JSON.stringify(approveResult)}`);

            // 2. Disburse loan on Fineract (changes loan status to ACTIVE)
            const disburseResult = await this.fineractService.disburseLoan(loanContract.fineractLoanId);
            this.logger.log(`Loan ${loanContract.contractId} disbursed on Fineract: ${JSON.stringify(disburseResult)}`);

            // 3. Transfer funds from Escrow to Borrower's Savings Account
            if (loanContract.borrowerFineractClientId) {
                try {
                    // Get borrower's savings account
                    const borrowerSavingsAccount = await this.fineractService.getClientSavingsAccount(
                        loanContract.borrowerFineractClientId,
                    );

                    // Get escrow account ID and admin client ID from config
                    const escrowAccountId = this.fineractService.getEscrowAccountId();
                    const adminClientId = this.fineractService.getAdminClientId();

                    if (borrowerSavingsAccount?.id && escrowAccountId && adminClientId) {
                        const loanCapital = loanContract.info?.capital || 0;

                        // Transfer from Escrow → Borrower Savings (with clientIds)
                        const transferResult = await this.fineractService.transferBetweenAccounts(
                            escrowAccountId,
                            borrowerSavingsAccount.id,
                            loanCapital,
                            `Giải ngân khoản vay ${loanContract.contractId}`,
                            adminClientId,
                            Number(loanContract.borrowerFineractClientId),
                        );


                        this.logger.log(`Funds transferred to borrower: ${loanCapital} VND, txId: ${transferResult?.resourceId}`);
                    } else {
                        this.logger.warn(`Missing escrow (${escrowAccountId}) or borrower savings (${borrowerSavingsAccount?.id}), skipping transfer`);
                    }
                } catch (transferError: any) {
                    this.logger.error(`Failed to transfer funds to borrower: ${transferError.message}`);
                    // Don't throw - loan is already active on Fineract
                }
            } else {
                this.logger.warn(`Loan ${loanContract.contractId} has no borrowerFineractClientId, skipping fund transfer`);
            }

            // 4. Update loan status in MongoDB
            await this.loanContractModel.updateOne(
                { _id: loanContract._id },
                {
                    $set: {
                        fineractStatus: 'ACTIVE',
                        disburse_done: true,
                        disburse_date: new Date(),
                    },
                },
            );

            this.logger.log(`Auto-disbursement completed for loan ${loanContract.contractId}`);
        } catch (error: any) {
            this.logger.error(`Auto-disbursement failed: ${error.message}`);
            throw error;
        }
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
        const query: any = { lender: new Types.ObjectId(user._id) };

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

        return {
            data: investments,
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
            .find({ lender: new Types.ObjectId(user._id) })
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
                lender: new Types.ObjectId(user._id),
            })
            .populate('loanContract');

        if (!investment) {
            throw new NotFoundException(`Investment ${investmentId} not found`);
        }

        return investment;
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
}

