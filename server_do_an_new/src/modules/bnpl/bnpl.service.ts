import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { BnplWallet, BnplWalletStatus } from './schemas/bnpl-wallet.schema';
import { BnplLoan, BnplLoanStatus } from './schemas/bnpl-loan.schema';
import { User } from '../users/schemas/user.schema';
import { FineractService } from '../fineract/fineract.service';
import { CreateBnplLoanDto } from './dto/create-bnpl-loan.dto';

export interface BnplWalletInfo {
    id: string;
    creditLimit: number;
    usedCredit: number;
    availableCredit: number;
    balance: number; // Negative value when in debt
    status: string;
    activeLoansCount: number;
}

export interface ConsolidatedScheduleItem {
    dueDate: string;
    month: string; // YYYY-MM format for grouping
    totalDue: number;
    principal: number;
    interest: number;
    loans: Array<{
        loanId: string;
        amount: number;
    }>;
}

export interface BnplLoanInfo {
    id: string;
    fineractLoanId: string;
    principal: number;
    totalInterest: number;
    totalRepayment: number;
    paidAmount: number;
    outstandingBalance: number;
    numberOfRepayments: number;
    status: string;
    description?: string;
    disbursedAt?: Date;
    repaymentSchedule?: any[];
}

@Injectable()
export class BnplService {
    private readonly logger = new Logger(BnplService.name);

    constructor(
        @InjectModel(BnplWallet.name) private readonly walletModel: Model<BnplWallet>,
        @InjectModel(BnplLoan.name) private readonly loanModel: Model<BnplLoan>,
        @InjectModel(User.name) private readonly userModel: Model<User>,
        private readonly fineractService: FineractService,
        private readonly configService: ConfigService,
    ) { }

    /**
     * Get or create BNPL wallet for user
     */
    async getOrCreateWallet(userId: string): Promise<BnplWallet> {
        let wallet = await this.walletModel.findOne({ userId: new Types.ObjectId(userId) }).exec();

        if (!wallet) {
            const creditLimit = this.configService.get<number>('bnpl.creditLimit') || 5000000;
            wallet = await this.walletModel.create({
                userId: new Types.ObjectId(userId),
                creditLimit,
                usedCredit: 0,
                status: BnplWalletStatus.ACTIVE,
            });
            this.logger.log(`Created BNPL wallet for user ${userId} with limit ${creditLimit}`);
        }

        return wallet;
    }

    /**
     * Get wallet info with computed fields
     */
    async getWalletInfo(userId: string): Promise<BnplWalletInfo> {
        const wallet = await this.getOrCreateWallet(userId);
        const activeLoansCount = await this.loanModel.countDocuments({
            walletId: wallet._id,
            status: { $in: [BnplLoanStatus.ACTIVE, BnplLoanStatus.APPROVED] },
        });

        return {
            id: wallet._id.toString(),
            creditLimit: wallet.creditLimit,
            usedCredit: wallet.usedCredit,
            availableCredit: wallet.creditLimit - wallet.usedCredit,
            balance: -wallet.usedCredit, // Negative when in debt
            status: wallet.status,
            activeLoansCount,
        };
    }

    /**
     * Preview BNPL loan - Calculate schedule before creation
     * Public endpoint - no userId required
     */
    async previewLoan(amount: number, numberOfRepayments: number = 3): Promise<{
        amount: number;
        numberOfRepayments: number;
        monthlyRate: number;
        annualRate: number;
        monthlyPayment: number;
        totalRepayment: number;
        totalInterest: number;
        interestType: string;
        schedulePreview: Array<{
            period: number;
            principal: number;
            interest: number;
            total: number;
            dueDate: string;
        }>;
    }> {
        const productId = this.configService.get<number>('bnpl.loanProductId') || 1;

        // Calculate schedule using Fineract product configuration
        const schedule = await this.fineractService.calculateBnplSchedule({
            productId,
            principal: amount,
            numberOfRepayments,
        });

        return {
            amount,
            numberOfRepayments,
            monthlyRate: schedule.monthlyRate,
            annualRate: schedule.annualRate,
            monthlyPayment: schedule.monthlyPay,
            totalRepayment: schedule.totalRepayment,
            totalInterest: schedule.totalInterest,
            interestType: schedule.interestType,
            schedulePreview: schedule.schedulePreview,
        };
    }

    /**
     * Create a new BNPL loan with auto-approve and auto-disburse
     */
    async createLoan(userId: string, dto: CreateBnplLoanDto): Promise<BnplLoanInfo> {
        const user = await this.userModel.findById(userId).exec();
        if (!user || !user.fineractClientId) {
            throw new BadRequestException('User chưa được liên kết với Fineract');
        }

        const wallet = await this.getOrCreateWallet(userId);

        if (wallet.status !== BnplWalletStatus.ACTIVE) {
            throw new BadRequestException('Ví trả sau đang bị tạm ngưng');
        }

        // Check credit limit
        const estimatedTotal = dto.amount * 1.045; // ~4.5% interest for 3 months
        if (wallet.usedCredit + estimatedTotal > wallet.creditLimit) {
            throw new BadRequestException(
                `Vượt quá hạn mức thấu chi. Còn lại: ${(wallet.creditLimit - wallet.usedCredit).toLocaleString()} VND`
            );
        }

        const productId = this.configService.get<number>('bnpl.loanProductId') || 1;
        const numberOfRepayments = dto.numberOfRepayments || 3;

        try {
            // Create, approve, and disburse loan in Fineract
            const { loanId, repaymentSchedule } = await this.fineractService.createAndDisburseLoan({
                clientId: Number(user.fineractClientId),
                productId,
                principal: dto.amount,
                numberOfRepayments,
            });

            // Calculate totals from Fineract schedule
            const periods = repaymentSchedule?.periods || [];
            const totalInterest = periods.reduce((sum: number, p: any) => sum + (p.interestDue || 0), 0);
            const totalRepayment = dto.amount + totalInterest;

            // Create local record
            const loan = await this.loanModel.create({
                walletId: wallet._id,
                userId: new Types.ObjectId(userId),
                fineractLoanId: loanId.toString(),
                principal: dto.amount,
                totalInterest,
                totalRepayment,
                paidAmount: 0,
                numberOfRepayments,
                status: BnplLoanStatus.ACTIVE,
                description: dto.description,
                disbursedAt: new Date(),
            });

            // Update wallet used credit
            await this.walletModel.updateOne(
                { _id: wallet._id },
                { $inc: { usedCredit: totalRepayment } }
            );

            this.logger.log(`Created BNPL loan ${loanId} for user ${userId}, amount: ${dto.amount}, total: ${totalRepayment}`);

            return {
                id: loan._id.toString(),
                fineractLoanId: loan.fineractLoanId,
                principal: loan.principal,
                totalInterest: loan.totalInterest,
                totalRepayment: loan.totalRepayment,
                paidAmount: loan.paidAmount,
                outstandingBalance: loan.totalRepayment - loan.paidAmount,
                numberOfRepayments: loan.numberOfRepayments,
                status: loan.status,
                description: loan.description,
                disbursedAt: loan.disbursedAt,
                repaymentSchedule: periods,
            };
        } catch (error: any) {
            this.logger.error(`Failed to create BNPL loan: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all loans for a user's wallet
     */
    async getLoans(userId: string, status?: string): Promise<BnplLoanInfo[]> {
        const wallet = await this.walletModel.findOne({ userId: new Types.ObjectId(userId) }).exec();
        if (!wallet) return [];

        const query: any = { walletId: wallet._id };
        if (status) {
            query.status = status;
        }

        const loans = await this.loanModel.find(query).sort({ createdAt: -1 }).exec();

        return loans.map(loan => ({
            id: loan._id.toString(),
            fineractLoanId: loan.fineractLoanId,
            principal: loan.principal,
            totalInterest: loan.totalInterest,
            totalRepayment: loan.totalRepayment,
            paidAmount: loan.paidAmount,
            outstandingBalance: loan.totalRepayment - loan.paidAmount,
            numberOfRepayments: loan.numberOfRepayments,
            status: loan.status,
            description: loan.description,
            disbursedAt: loan.disbursedAt,
        }));
    }

    /**
     * Get loan details with repayment schedule from Fineract
     */
    async getLoanDetails(userId: string, loanId: string): Promise<BnplLoanInfo> {
        const loan = await this.loanModel.findOne({
            _id: new Types.ObjectId(loanId),
            userId: new Types.ObjectId(userId),
        }).exec();

        if (!loan) {
            throw new NotFoundException('Không tìm thấy khoản vay');
        }

        // Fetch real-time data from Fineract
        const fineractData = await this.fineractService.getLoanDetails(loan.fineractLoanId);
        const schedule = fineractData.repaymentSchedule?.periods || [];

        return {
            id: loan._id.toString(),
            fineractLoanId: loan.fineractLoanId,
            principal: loan.principal,
            totalInterest: fineractData.summary?.totalInterestCharged || loan.totalInterest,
            totalRepayment: fineractData.summary?.totalExpectedRepayment || loan.totalRepayment,
            paidAmount: fineractData.summary?.totalRepayment || loan.paidAmount,
            outstandingBalance: fineractData.summary?.totalOutstanding || (loan.totalRepayment - loan.paidAmount),
            numberOfRepayments: loan.numberOfRepayments,
            status: this.mapFineractStatus(fineractData.status?.id),
            description: loan.description,
            disbursedAt: loan.disbursedAt,
            repaymentSchedule: schedule.filter((p: any) => p.period !== 0), // Exclude disbursement period
        };
    }

    /**
     * Get consolidated repayment schedule across all active loans
     * Groups payments by month
     */
    async getConsolidatedSchedule(userId: string): Promise<ConsolidatedScheduleItem[]> {
        const loans = await this.getLoans(userId, BnplLoanStatus.ACTIVE);
        if (loans.length === 0) return [];

        const scheduleMap = new Map<string, ConsolidatedScheduleItem>();

        for (const loan of loans) {
            try {
                const details = await this.getLoanDetails(userId, loan.id);
                const schedule = details.repaymentSchedule || [];

                for (const period of schedule) {
                    if (!period.dueDate || period.complete) continue;

                    const dueDate = new Date(period.dueDate[0], period.dueDate[1] - 1, period.dueDate[2]);
                    const monthKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;
                    const dueDateStr = dueDate.toISOString().split('T')[0];

                    if (!scheduleMap.has(monthKey)) {
                        scheduleMap.set(monthKey, {
                            dueDate: dueDateStr,
                            month: monthKey,
                            totalDue: 0,
                            principal: 0,
                            interest: 0,
                            loans: [],
                        });
                    }

                    const item = scheduleMap.get(monthKey)!;
                    const periodTotal = (period.principalDue || 0) + (period.interestDue || 0);

                    item.totalDue += periodTotal;
                    item.principal += period.principalDue || 0;
                    item.interest += period.interestDue || 0;
                    item.loans.push({
                        loanId: loan.fineractLoanId,
                        amount: periodTotal,
                    });
                }
            } catch (error) {
                this.logger.warn(`Failed to get schedule for loan ${loan.id}: ${(error as Error).message}`);
            }
        }

        return Array.from(scheduleMap.values()).sort((a, b) => a.month.localeCompare(b.month));
    }

    /**
     * Sync loan statuses from Fineract
     */
    async syncLoanStatus(userId: string, loanId: string): Promise<BnplLoanInfo> {
        const loan = await this.loanModel.findOne({
            _id: new Types.ObjectId(loanId),
            userId: new Types.ObjectId(userId),
        }).exec();

        if (!loan) {
            throw new NotFoundException('Không tìm thấy khoản vay');
        }

        const fineractData = await this.fineractService.getLoanDetails(loan.fineractLoanId);
        const newStatus = this.mapFineractStatus(fineractData.status?.id);
        const newPaidAmount = fineractData.summary?.totalRepayment || 0;

        // Update local record if changed
        if (loan.status !== newStatus || loan.paidAmount !== newPaidAmount) {
            await this.loanModel.updateOne(
                { _id: loan._id },
                {
                    status: newStatus,
                    paidAmount: newPaidAmount,
                    totalInterest: fineractData.summary?.totalInterestCharged || loan.totalInterest,
                }
            );

            // If loan is closed, update wallet credit
            if (newStatus === BnplLoanStatus.CLOSED && loan.status !== BnplLoanStatus.CLOSED) {
                await this.walletModel.updateOne(
                    { _id: loan.walletId },
                    { $inc: { usedCredit: -(loan.totalRepayment) } }
                );
            }
        }

        return this.getLoanDetails(userId, loanId);
    }

    /**
     * Map Fineract status ID to our enum
     */
    private mapFineractStatus(statusId: number): BnplLoanStatus {
        switch (statusId) {
            case 100: return BnplLoanStatus.PENDING_APPROVAL;
            case 200: return BnplLoanStatus.APPROVED;
            case 300: return BnplLoanStatus.ACTIVE;
            case 600: return BnplLoanStatus.CLOSED;
            case 601: return BnplLoanStatus.OVERPAID;
            case 700: return BnplLoanStatus.WRITTEN_OFF;
            default: return BnplLoanStatus.ACTIVE;
        }
    }
}
