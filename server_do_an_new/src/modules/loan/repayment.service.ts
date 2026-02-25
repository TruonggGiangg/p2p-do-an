import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { FineractLoanService } from '../fineract/services/fineract-loan.service';
import { FineractSavingsService } from '../fineract/services/fineract-savings.service';
import { WalletsService } from '../wallets/wallets.service';
import { LoanApplication } from './schemas/loan-application.schema';
import { User } from '../users/schemas/user.schema';

/**
 * RepaymentService - Xử lý thanh toán khoản vay (repayment & prepayment)
 * 
 * Flow:
 * 1. Kiểm tra ownership (loan thuộc user)
 * 2. Kiểm tra loan status (phải là 'disbursed' hoặc active trên Fineract)
 * 3. Gọi Fineract repayment API
 * 4. Chuyển tiền từ ví borrower (nếu có)
 * 5. Lưu lịch sử thanh toán vào MongoDB
 * 
 * NOTE: Phí giao dịch được lấy động từ Fineract product charges, không hardcode.
 * NOTE: Bước phân phối cho nhà đầu tư (lender distribution) chưa implement.
 */
@Injectable()
export class RepaymentService {
    private readonly logger = new Logger(RepaymentService.name);

    constructor(
        private readonly fineractLoanService: FineractLoanService,
        private readonly fineractSavingsService: FineractSavingsService,
        private readonly walletsService: WalletsService,
        @InjectModel(LoanApplication.name) private readonly loanApplicationModel: Model<LoanApplication>,
        @InjectModel(User.name) private readonly userModel: Model<User>,
    ) { }

    /**
     * Thanh toán theo kỳ (Repayment)
     */
    async makeRepayment(userId: string, loanId: string, amount: number, repaymentDate?: string): Promise<any> {
        this.logger.log(`[makeRepayment] START | userId=${userId} loanId=${loanId} amount=${amount}`);

        // 1. Validate input
        if (!amount || amount <= 0) {
            throw new BadRequestException('Số tiền thanh toán phải lớn hơn 0');
        }

        // 2. Tìm loan trong MongoDB
        const loan = await this.findAndValidateLoan(userId, loanId);
        const fineractLoanId = loan.fineractLoanId;
        if (!fineractLoanId) {
            throw new BadRequestException('Khoản vay chưa được tạo trên Fineract');
        }

        // 3. Kiểm tra dư nợ trên Fineract
        const outstanding = await this.fineractLoanService.getOutstandingBalance(fineractLoanId);
        if (outstanding.totalOutstanding <= 0) {
            throw new BadRequestException('Khoản vay đã được thanh toán hoàn tất');
        }
        if (amount > outstanding.totalOutstanding) {
            throw new BadRequestException(
                `Số tiền thanh toán (${amount}) vượt quá dư nợ còn lại (${outstanding.totalOutstanding}). Hãy sử dụng tính năng Tất Toán nếu muốn trả hết.`
            );
        }

        // 4. Gọi Fineract repayment API
        const date = repaymentDate || new Date().toISOString().split('T')[0];
        let fineractResult: any;
        try {
            fineractResult = await this.fineractLoanService.makeRepayment(
                fineractLoanId,
                amount,
                date,
                `Repayment for MongoDB loan ${loanId}`,
            );
            this.logger.log(`[makeRepayment] Fineract repayment success | transactionId=${fineractResult.transactionId}`);
        } catch (error: any) {
            this.logger.error(`[makeRepayment] Fineract repayment failed: ${error.message}`);
            throw new BadRequestException(`Thanh toán trên Fineract thất bại: ${error.message}`);
        }

        // 5. Kiểm tra nếu loan đã đóng (outstanding = 0)
        let newStatus = loan.status;
        try {
            const updatedOutstanding = await this.fineractLoanService.getOutstandingBalance(fineractLoanId);
            if (updatedOutstanding.totalOutstanding <= 0) {
                newStatus = 'closed' as any;
                this.logger.log(`[makeRepayment] Loan fully paid, marking as closed`);
            }
        } catch { }

        // 6. Lưu lịch sử thanh toán vào MongoDB
        const repaymentRecord = {
            amount,
            date,
            type: 'repayment',
            fineractTransactionId: fineractResult.transactionId,
            createdAt: new Date(),
        };

        await this.loanApplicationModel.findByIdAndUpdate(loan._id, {
            $push: { repaymentHistory: repaymentRecord },
            ...(newStatus !== loan.status ? { status: newStatus } : {}),
        });

        this.logger.log(`[makeRepayment] SUCCESS | loanId=${loanId} amount=${amount}`);

        return {
            success: true,
            transactionId: fineractResult.transactionId,
            amount,
            date,
            loanStatus: newStatus,
        };
    }

    /**
     * Lấy số tiền cần trả để tất toán sớm
     */
    async getPrepayAmount(userId: string, loanId: string): Promise<any> {
        this.logger.log(`[getPrepayAmount] START | userId=${userId} loanId=${loanId}`);

        const loan = await this.findAndValidateLoan(userId, loanId);
        if (!loan.fineractLoanId) {
            throw new BadRequestException('Khoản vay chưa được tạo trên Fineract');
        }

        const prepayInfo = await this.fineractLoanService.getPrepaymentAmount(loan.fineractLoanId);

        // Lấy phí từ Fineract product charges
        let charges: any[] = [];
        try {
            charges = await this.fineractLoanService.getProductCharges(loan.productId);
        } catch { }

        return {
            ...prepayInfo,
            charges,
            loanId: loan._id,
            fineractLoanId: loan.fineractLoanId,
            capital: loan.capital,
        };
    }

    /**
     * Tất toán sớm (Prepayment - trả hết dư nợ)
     */
    async prepayLoan(userId: string, loanId: string, repaymentDate?: string): Promise<any> {
        this.logger.log(`[prepayLoan] START | userId=${userId} loanId=${loanId}`);

        const loan = await this.findAndValidateLoan(userId, loanId);
        if (!loan.fineractLoanId) {
            throw new BadRequestException('Khoản vay chưa được tạo trên Fineract');
        }

        // 1. Lấy số tiền tất toán
        const prepayInfo = await this.fineractLoanService.getPrepaymentAmount(loan.fineractLoanId);
        if (!prepayInfo.amount || prepayInfo.amount <= 0) {
            throw new BadRequestException('Khoản vay đã được thanh toán hoàn tất');
        }

        this.logger.log(`[prepayLoan] Prepay amount=${prepayInfo.amount} (principal=${prepayInfo.principalPortion} interest=${prepayInfo.interestPortion} fees=${prepayInfo.feesPortion} penalty=${prepayInfo.penaltyPortion})`);

        // 2. Gọi Fineract prepay
        const date = repaymentDate || new Date().toISOString().split('T')[0];
        let fineractResult: any;
        try {
            fineractResult = await this.fineractLoanService.prepayLoan(
                loan.fineractLoanId,
                prepayInfo.amount,
                date,
                `Prepayment (full settlement) for MongoDB loan ${loanId}`,
            );
            this.logger.log(`[prepayLoan] Fineract prepay success | transactionId=${fineractResult.transactionId}`);
        } catch (error: any) {
            this.logger.error(`[prepayLoan] Fineract prepay failed: ${error.message}`);
            throw new BadRequestException(`Tất toán trên Fineract thất bại: ${error.message}`);
        }

        // 3. Cập nhật MongoDB: status = closed, lưu lịch sử
        const repaymentRecord = {
            amount: prepayInfo.amount,
            date,
            type: 'prepayment',
            fineractTransactionId: fineractResult.transactionId,
            breakdown: {
                principal: prepayInfo.principalPortion,
                interest: prepayInfo.interestPortion,
                fees: prepayInfo.feesPortion,
                penalty: prepayInfo.penaltyPortion,
            },
            createdAt: new Date(),
        };

        await this.loanApplicationModel.findByIdAndUpdate(loan._id, {
            status: 'closed',
            $push: { repaymentHistory: repaymentRecord },
        });

        this.logger.log(`[prepayLoan] SUCCESS | loanId=${loanId} amount=${prepayInfo.amount}`);

        return {
            success: true,
            transactionId: fineractResult.transactionId,
            amount: prepayInfo.amount,
            date,
            loanStatus: 'closed',
            breakdown: repaymentRecord.breakdown,
        };
    }

    /**
     * Lấy lịch trả nợ từ Fineract (repayment schedule)
     */
    async getRepaymentSchedule(userId: string, loanId: string): Promise<any> {
        const loan = await this.findAndValidateLoan(userId, loanId);
        if (!loan.fineractLoanId) {
            // Fallback: trả về schedule từ MongoDB
            return {
                source: 'mongo',
                periods: (loan.schedulePreview || []).map((s: any, i: number) => ({
                    period: s.period || i + 1,
                    principalDue: s.principal,
                    interestDue: s.interest,
                    totalDue: s.total,
                    dueDate: s.dueDate,
                    complete: false,
                })),
            };
        }

        const schedule = await this.fineractLoanService.getRepaymentSchedule(loan.fineractLoanId);
        if (!schedule) {
            return { source: 'mongo', periods: loan.schedulePreview || [] };
        }

        return {
            source: 'fineract',
            totalPrincipalExpected: schedule.totalPrincipalExpected,
            totalInterestCharged: schedule.totalInterestCharged,
            totalRepaymentExpected: schedule.totalRepaymentExpected,
            totalOutstanding: schedule.totalOutstanding,
            totalFeeChargesCharged: schedule.totalFeeChargesCharged || 0,
            totalPenaltyChargesCharged: schedule.totalPenaltyChargesCharged || 0,
            periods: (schedule.periods || []).map((p: any) => ({
                period: p.period || 0,
                dueDate: p.dueDate,
                principalDue: p.principalDue || 0,
                principalPaid: p.principalPaid || 0,
                interestDue: p.interestDue || 0,
                interestPaid: p.interestPaid || 0,
                feeChargesDue: p.feeChargesDue || 0,
                feeChargesPaid: p.feeChargesPaid || 0,
                penaltyChargesDue: p.penaltyChargesDue || 0,
                totalDue: p.totalDueForPeriod || 0,
                totalPaid: p.totalPaidForPeriod || 0,
                totalOutstanding: p.totalOutstandingForPeriod || 0,
                complete: p.complete || false,
            })),
        };
    }

    /**
     * Lấy dư nợ còn lại
     */
    async getOutstandingBalance(userId: string, loanId: string): Promise<any> {
        const loan = await this.findAndValidateLoan(userId, loanId);
        if (!loan.fineractLoanId) {
            throw new BadRequestException('Khoản vay chưa được tạo trên Fineract');
        }

        const outstanding = await this.fineractLoanService.getOutstandingBalance(loan.fineractLoanId);
        return {
            ...outstanding,
            loanId: loan._id,
            fineractLoanId: loan.fineractLoanId,
            capital: loan.capital,
            status: loan.status,
        };
    }

    // =============================================
    // Private helpers
    // =============================================

    /**
     * Tìm và validate loan thuộc user
     */
    private async findAndValidateLoan(userId: string, loanId: string): Promise<LoanApplication> {
        let loan: LoanApplication | null = null;

        // Tìm bằng MongoDB _id
        if (Types.ObjectId.isValid(loanId)) {
            loan = await this.loanApplicationModel.findById(loanId);
        }

        // Fallback: tìm bằng fineractLoanId
        if (!loan) {
            loan = await this.loanApplicationModel.findOne({ fineractLoanId: Number(loanId) });
        }

        if (!loan) {
            throw new NotFoundException(`Không tìm thấy khoản vay ${loanId}`);
        }

        // Kiểm tra ownership
        if (loan.userId.toString() !== userId.toString()) {
            throw new BadRequestException('Khoản vay không thuộc về bạn');
        }

        // Kiểm tra status
        const activeStatuses = ['disbursed', 'approved', 'pending'];
        if (!activeStatuses.includes(loan.status) && loan.status !== 'closed') {
            throw new BadRequestException(`Khoản vay đang ở trạng thái "${loan.status}", không thể thực hiện thanh toán`);
        }

        return loan;
    }
}
