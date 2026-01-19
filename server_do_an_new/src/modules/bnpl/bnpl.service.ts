import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { BnplWallet, BnplWalletStatus } from './schemas/bnpl-wallet.schema';
import { BnplLoan, BnplLoanStatus } from './schemas/bnpl-loan.schema';
import { User } from '../users/schemas/user.schema';
import { FineractService } from '../fineract/fineract.service';
import { CreateBnplLoanDto } from './dto/create-bnpl-loan.dto';
import { roundToCurrency } from '../../utils/RoundingUtils';

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
    @InjectModel(BnplWallet.name)
    private readonly walletModel: Model<BnplWallet>,
    @InjectModel(BnplLoan.name) private readonly loanModel: Model<BnplLoan>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly fineractService: FineractService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get or create BNPL wallet for user
   */
  async getOrCreateWallet(userId: string): Promise<BnplWallet> {
    let wallet = await this.walletModel.findOne({ userId: new Types.ObjectId(userId) }).exec();

    if (!wallet) {
      const creditLimit = this.configService.getOrThrow<number>('bnpl.creditLimit');
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
  async previewLoan(
    amount: number,
    numberOfRepayments?: number,
  ): Promise<{
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
    const productId = this.configService.getOrThrow<number>('bnpl.loanProductId');
    const defaultRepayments = this.configService.get<number>('bnpl.defaultRepayments') || 3;
    const repayments = numberOfRepayments || defaultRepayments;

    // Calculate schedule using Fineract product configuration
    const schedule = await this.fineractService.calculateBnplSchedule({
      productId,
      principal: amount,
      numberOfRepayments: repayments,
    });

    return {
      amount,
      numberOfRepayments: repayments, // Use calculated repayments, not input parameter
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

    const productId = this.configService.getOrThrow<number>('bnpl.loanProductId');
    const defaultRepayments = this.configService.get<number>('bnpl.defaultRepayments') || 3;
    const numberOfRepayments = dto.numberOfRepayments || defaultRepayments;

    // Preview loan to get accurate total repayment for credit limit check
    const preview = await this.previewLoan(dto.amount, numberOfRepayments);
    const estimatedTotal = preview.totalRepayment;

    // Check credit limit with accurate total repayment from Fineract
    if (wallet.usedCredit + estimatedTotal > wallet.creditLimit) {
      throw new BadRequestException(
        `Vượt quá hạn mức thấu chi. Còn lại: ${(wallet.creditLimit - wallet.usedCredit).toLocaleString()} VND`,
      );
    }

    try {
      // Create, approve, and disburse loan in Fineract
      const { loanId, repaymentSchedule } = await this.fineractService.createAndDisburseLoan({
        clientId: Number(user.fineractClientId),
        productId,
        principal: dto.amount,
        numberOfRepayments,
      });

      // Get totals from Fineract repayment schedule (source of truth)
      const scheduleSummary = repaymentSchedule || {};
      const totalRepayment = scheduleSummary.totalRepaymentExpected || 0;
      const totalInterest = scheduleSummary.totalInterestCharged || 0;

      // Create local record - CHỈ lưu những thứ không thể fetch từ Fineract
      const loan = await this.loanModel.create({
        walletId: wallet._id,
        userId: new Types.ObjectId(userId),
        fineractLoanId: loanId.toString(), // ID để fetch từ Fineract
        principal: dto.amount, // Có thể lấy từ Fineract nhưng lưu để query nhanh
        totalInterest, // Cache tạm thời, sẽ lấy từ Fineract khi cần
        totalRepayment, // Cache tạm thời, sẽ lấy từ Fineract khi cần
        paidAmount: 0, // Sẽ lấy từ Fineract khi cần
        numberOfRepayments, // Có thể lấy từ Fineract nhưng lưu để query nhanh
        status: BnplLoanStatus.ACTIVE,
        description: dto.description, // CHỈ có trong MongoDB
        disbursedAt: new Date(), // CHỈ có trong MongoDB
      });

      // Update wallet used credit (sử dụng totalRepayment từ Fineract)
      const currencyMultiples = this.configService.get<number>('bnpl.currencyMultiples') || 1000;
      await this.walletModel.updateOne(
        { _id: wallet._id },
        {
          $inc: {
            usedCredit: roundToCurrency(totalRepayment, currencyMultiples),
          },
        },
      );

      this.logger.log(
        `Created BNPL loan ${loanId} for user ${userId}, amount: ${dto.amount}, total: ${totalRepayment}`,
      );

      // Return với data từ Fineract
      const periods = repaymentSchedule?.periods || [];
      return {
        id: loan._id.toString(),
        fineractLoanId: loan.fineractLoanId,
        principal: loan.principal,
        totalInterest, // Từ Fineract
        totalRepayment, // Từ Fineract
        paidAmount: 0,
        outstandingBalance: totalRepayment,
        numberOfRepayments: loan.numberOfRepayments,
        status: loan.status,
        description: loan.description,
        disbursedAt: loan.disbursedAt,
        repaymentSchedule: periods.filter((p: any) => p.period !== 0), // Exclude disbursement period
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
   * Lấy tất cả thông tin từ Fineract, chỉ lấy metadata từ MongoDB
   */
  async getLoanDetails(userId: string, loanId: string): Promise<BnplLoanInfo> {
    const loan = await this.loanModel
      .findOne({
        _id: new Types.ObjectId(loanId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (!loan) {
      throw new NotFoundException('Không tìm thấy khoản vay');
    }

    // Fetch real-time data from Fineract (source of truth)
    const fineractData = await this.fineractService.getLoanDetails(loan.fineractLoanId);
    const schedule = fineractData.repaymentSchedule?.periods || [];

    // Extract summary from Fineract repayment schedule
    const scheduleSummary = fineractData.repaymentSchedule || {};
    const totalInterest = scheduleSummary.totalInterestCharged || 0;
    const totalRepayment = scheduleSummary.totalRepaymentExpected || 0;
    const paidAmount = scheduleSummary.totalRepayment || 0;
    const outstandingBalance = scheduleSummary.totalOutstanding || 0;

    return {
      id: loan._id.toString(),
      fineractLoanId: loan.fineractLoanId,
      principal: fineractData.principal || loan.principal,
      totalInterest, // Lấy từ Fineract, không lưu trong MongoDB
      totalRepayment, // Lấy từ Fineract
      paidAmount, // Lấy từ Fineract
      outstandingBalance, // Lấy từ Fineract
      numberOfRepayments: fineractData.numberOfRepayments || loan.numberOfRepayments,
      status: this.mapFineractStatus(fineractData.status?.id),
      description: loan.description, // Chỉ có trong MongoDB
      disbursedAt: loan.disbursedAt, // Chỉ có trong MongoDB
      repaymentSchedule: schedule.filter((p: any) => p.period !== 0), // Exclude disbursement period
    };
  }

  /**
   * Get consolidated repayment schedule across all active loans
   * Groups payments by month
   * Lấy lịch trả nợ từ Fineract, không dùng data trong MongoDB
   */
  async getConsolidatedSchedule(userId: string): Promise<ConsolidatedScheduleItem[]> {
    const loans = await this.getLoans(userId, BnplLoanStatus.ACTIVE);
    if (loans.length === 0) return [];

    const scheduleMap = new Map<string, ConsolidatedScheduleItem>();

    for (const loan of loans) {
      try {
        // Lấy lịch trả nợ từ Fineract (source of truth)
        const repaymentSchedule = await this.fineractService.getRepaymentSchedule(loan.fineractLoanId);
        const periods = repaymentSchedule?.periods || [];

        for (const period of periods) {
          // Skip disbursement period (period 0) and completed periods
          if (period.period === 0 || period.complete) continue;

          // Parse due date from Fineract format [year, month, day]
          let dueDate: Date;
          if (Array.isArray(period.dueDate)) {
            dueDate = new Date(period.dueDate[0], period.dueDate[1] - 1, period.dueDate[2]);
          } else if (typeof period.dueDate === 'string') {
            dueDate = new Date(period.dueDate);
          } else {
            continue; // Skip if invalid date
          }

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
          const principalDue = period.principalDue || 0;
          const interestDue = period.interestDue || 0;
          const periodTotal = principalDue + interestDue;

          // Sử dụng RoundingUtils để đảm bảo đồng bộ
          const currencyMultiples = this.configService.get<number>('bnpl.currencyMultiples') || 1000;
          item.totalDue = roundToCurrency(item.totalDue + periodTotal, currencyMultiples);
          item.principal = roundToCurrency(item.principal + principalDue, currencyMultiples);
          item.interest = roundToCurrency(item.interest + interestDue, currencyMultiples);
          item.loans.push({
            loanId: loan.fineractLoanId,
            amount: roundToCurrency(periodTotal, currencyMultiples),
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
   * Đồng bộ status và paidAmount từ Fineract (source of truth)
   */
  async syncLoanStatus(userId: string, loanId: string): Promise<BnplLoanInfo> {
    const loan = await this.loanModel
      .findOne({
        _id: new Types.ObjectId(loanId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (!loan) {
      throw new NotFoundException('Không tìm thấy khoản vay');
    }

    // Lấy data từ Fineract (source of truth)
    const fineractData = await this.fineractService.getLoanDetails(loan.fineractLoanId);
    const scheduleSummary = fineractData.repaymentSchedule || {};
    const newStatus = this.mapFineractStatus(fineractData.status?.id);
    const newPaidAmount = scheduleSummary.totalRepayment || 0;
    const newTotalInterest = scheduleSummary.totalInterestCharged || 0;
    const newTotalRepayment = scheduleSummary.totalRepaymentExpected || 0;

    // Update local record if changed (chỉ cache, không phải source of truth)
    if (loan.status !== newStatus || loan.paidAmount !== newPaidAmount) {
      await this.loanModel.updateOne(
        { _id: loan._id },
        {
          status: newStatus,
          paidAmount: newPaidAmount,
          totalInterest: newTotalInterest, // Cache từ Fineract
          totalRepayment: newTotalRepayment, // Cache từ Fineract
        },
      );

      // If loan is closed, update wallet credit (giảm usedCredit)
      if (newStatus === BnplLoanStatus.CLOSED && loan.status !== BnplLoanStatus.CLOSED) {
        // Sử dụng totalRepayment từ Fineract để tính chính xác
        const currencyMultiples = this.configService.get<number>('bnpl.currencyMultiples') || 1000;
        await this.walletModel.updateOne(
          { _id: loan.walletId },
          {
            $inc: {
              usedCredit: -roundToCurrency(newTotalRepayment, currencyMultiples),
            },
          },
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
      case 100:
        return BnplLoanStatus.PENDING_APPROVAL;
      case 200:
        return BnplLoanStatus.APPROVED;
      case 300:
        return BnplLoanStatus.ACTIVE;
      case 600:
        return BnplLoanStatus.CLOSED;
      case 601:
        return BnplLoanStatus.OVERPAID;
      case 700:
        return BnplLoanStatus.WRITTEN_OFF;
      default:
        return BnplLoanStatus.ACTIVE;
    }
  }
}
