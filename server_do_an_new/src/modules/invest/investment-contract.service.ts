/**
 * InvestmentContractService
 * ──────────────────────────────────────────────────────────
 * Tạo và quản lý hợp đồng ký quỹ đầu tư cho lender.
 * Tham khảo HD-AMC InvestContractService.js — NestJS type-safe.
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { InvestmentContract, LenderScheduleItem } from './schemas/investment-contract.schema';
import { LoanApplication } from '../loan/schemas/loan-application.schema';
import { InvestmentOrder } from './schemas/investment-order.schema';

@Injectable()
export class InvestmentContractService {
  private readonly logger = new Logger(InvestmentContractService.name);
  private readonly baseUnitPrice: number;

  constructor(
    @InjectModel(InvestmentContract.name) private readonly contractModel: Model<InvestmentContract>,
    @InjectModel(LoanApplication.name) private readonly loanModel: Model<LoanApplication>,
    @InjectModel(InvestmentOrder.name) private readonly orderModel: Model<InvestmentOrder>,
    private readonly configService: ConfigService,
  ) {
    this.baseUnitPrice = this.configService.get<number>('invest.baseUnitPrice') || 500_000;
  }

  // ═══════════════════════════════════════════════════════
  //  GENERATE CONTRACT ID
  // ═══════════════════════════════════════════════════════

  private generateContractId(loanId: string): string {
    return `INV_${loanId.slice(-6).toUpperCase()}_${Date.now()}`;
  }

  // ═══════════════════════════════════════════════════════
  //  CALCULATE LENDER SCHEDULE
  // ═══════════════════════════════════════════════════════

  /**
   * Tính lịch nhận tiền cho lender dựa trên schedulePreview của LoanApplication.
   * Scale principal theo investmentRatio = investCapital / loanCapital.
   */
  private calculateLenderSchedule(
    loan: any,
    investCapital: number,
  ): { schedule: LenderScheduleItem[]; summary: { totalPrincipal: number; totalInterest: number; totalIncome: number; periodCount: number } } {
    const borrowerSchedule: any[] = loan.schedulePreview || [];
    const loanCapital = loan.capital || 1;
    const investmentRatio = investCapital / loanCapital;
    const inMultiplesOf = loan.inMultiplesOf || 1000;

    if (borrowerSchedule.length === 0) {
      return {
        schedule: [],
        summary: { totalPrincipal: 0, totalInterest: 0, totalIncome: 0, periodCount: 0 },
      };
    }

    // Bắt đầu xây schedule
    let accumulatedPrincipal = 0;
    const schedule: LenderScheduleItem[] = borrowerSchedule.map((p, index) => {
      const isLast = index === borrowerSchedule.length - 1;

      const borrowerPrincipal = p.principal || p.principalDue || 0;
      const borrowerInterest = p.interest || p.interestDue || 0;

      // Scale principal
      let lenderPrincipal: number;
      if (isLast) {
        lenderPrincipal = investCapital - accumulatedPrincipal;
      } else {
        lenderPrincipal = this.roundToCurrency(borrowerPrincipal * investmentRatio, inMultiplesOf);
      }
      accumulatedPrincipal += lenderPrincipal;

      // Scale interest
      const lenderInterest = this.roundToCurrency(borrowerInterest * investmentRatio, inMultiplesOf);

      // Due date
      let dueDate = '';
      if (p.dueDate) {
        const d = new Date(p.dueDate);
        if (!isNaN(d.getTime())) {
          dueDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        }
      }
      if (!dueDate) {
        // Fallback: base + period months
        const base = new Date(loan.disbursementDate || loan.createdAt || new Date());
        base.setMonth(base.getMonth() + (p.period || index + 1));
        dueDate = `${String(base.getDate()).padStart(2, '0')}/${String(base.getMonth() + 1).padStart(2, '0')}/${base.getFullYear()}`;
      }

      return {
        period: p.period || index + 1,
        dueDate,
        principal: lenderPrincipal,
        interest: lenderInterest,
        total: lenderPrincipal + lenderInterest,
        status: 'pending' as const,
      };
    });

    const summary = {
      totalPrincipal: schedule.reduce((s, p) => s + p.principal, 0),
      totalInterest: schedule.reduce((s, p) => s + p.interest, 0),
      totalIncome: schedule.reduce((s, p) => s + p.total, 0),
      periodCount: schedule.length,
    };

    return { schedule, summary };
  }

  private roundToCurrency(amount: number, inMultiplesOf: number): number {
    if (inMultiplesOf <= 0) return Math.round(amount);
    return Math.round(amount / inMultiplesOf) * inMultiplesOf;
  }

  // ═══════════════════════════════════════════════════════
  //  CREATE CONTRACT
  // ═══════════════════════════════════════════════════════

  async createContract(
    lenderId: string,
    loanApplicationId: string,
    numNotes: number,
    investmentOrderId?: string,
  ): Promise<InvestmentContract> {
    // 1. Validate loan
    const loan = await this.loanModel.findById(loanApplicationId);
    if (!loan) throw new NotFoundException('Không tìm thấy khoản vay');

    if (!['approved', 'disbursed'].includes(loan.status)) {
      throw new BadRequestException('Khoản vay không ở trạng thái cho phép đầu tư');
    }

    // 2. Check available notes
    const totalLoanNotes = Math.ceil(loan.capital / this.baseUnitPrice);
    const investedSoFar = (loan as any).investedNotes || 0;
    const availableNotes = totalLoanNotes - investedSoFar;

    if (numNotes > availableNotes) {
      throw new BadRequestException(`Chỉ còn ${availableNotes} notes khả dụng (yêu cầu ${numNotes})`);
    }

    // 3. Calculate financials
    const capital = numNotes * this.baseUnitPrice;
    const monthlyRatePercent = loan.monthlyRatePercent;
    const annualRatePercent = monthlyRatePercent * 12;
    const periodMonth = loan.periodMonth;

    // Simple declining balance calculation
    const monthlyRate = monthlyRatePercent / 100;
    let entirelyPay = 0;
    if (monthlyRate > 0 && periodMonth > 0) {
      const factor = Math.pow(1 + monthlyRate, periodMonth);
      const monthlyPay = capital * (monthlyRate * factor) / (factor - 1);
      entirelyPay = this.roundToCurrency(monthlyPay * periodMonth, loan.inMultiplesOf || 1000);
    } else {
      entirelyPay = capital;
    }
    const entirelyProfit = entirelyPay - capital;
    const monthlyIncome = this.roundToCurrency(entirelyPay / Math.max(1, periodMonth), loan.inMultiplesOf || 1000);

    // 4. Calculate lender schedule
    const { schedule, summary } = this.calculateLenderSchedule(loan, capital);

    // 5. Generate contract ID
    const contractId = this.generateContractId(String(loan._id));

    // 6. Create contract
    const contract = new this.contractModel({
      contractId,
      lenderId: new Types.ObjectId(lenderId),
      loanApplicationId: loan._id,
      investmentOrderId: investmentOrderId ? new Types.ObjectId(investmentOrderId) : null,
      capital,
      numNotes,
      periodMonth,
      monthlyRatePercent,
      annualRatePercent,
      monthlyIncome,
      entirelyProfit,
      entirelyPay,
      serviceFee: 0,
      status: 'active',
      // Lender schedule
      lenderSchedule: schedule,
      scheduleTotalPrincipal: summary.totalPrincipal,
      scheduleTotalInterest: summary.totalInterest,
      scheduleTotalIncome: summary.totalIncome,
      schedulePeriodCount: summary.periodCount,
    });

    await contract.save();
    this.logger.log(`Created InvestmentContract ${contractId}: ${capital.toLocaleString()} VND, ${numNotes} notes, ${periodMonth} months`);

    // 7. Update loan investedNotes
    const newInvestedNotes = investedSoFar + numNotes;
    await this.loanModel.findByIdAndUpdate(loanApplicationId, {
      $inc: { investedNotes: numNotes },
      $set: {
        totalNotes: totalLoanNotes,
        isFullMatch: newInvestedNotes >= totalLoanNotes,
      },
    });

    this.logger.log(`Loan ${loanApplicationId}: investedNotes ${investedSoFar} → ${newInvestedNotes}/${totalLoanNotes}`);

    return contract;
  }

  // ═══════════════════════════════════════════════════════
  //  QUERY CONTRACTS
  // ═══════════════════════════════════════════════════════

  async getContractsByLender(
    lenderId: string,
    query: { page?: number; pageSize?: number; status?: string } = {},
  ) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize || 10));
    const skip = (page - 1) * pageSize;

    const filters: Record<string, any> = { lenderId: new Types.ObjectId(lenderId) };
    if (query.status) filters.status = query.status;

    const [contracts, totalCount] = await Promise.all([
      this.contractModel
        .find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate('loanApplicationId', 'willing capital periodMonth monthlyRatePercent status')
        .exec(),
      this.contractModel.countDocuments(filters),
    ]);

    return {
      contracts,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  }

  async getContractById(contractId: string, lenderId: string): Promise<InvestmentContract> {
    const contract = await this.contractModel
      .findOne({
        $or: [
          { _id: contractId },
          { contractId: contractId },
        ],
        lenderId: new Types.ObjectId(lenderId),
      })
      .populate('loanApplicationId', 'willing capital periodMonth monthlyRatePercent status disbursementDate')
      .exec();

    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng đầu tư');
    return contract;
  }

  async getContractsByLoan(loanApplicationId: string) {
    return this.contractModel
      .find({ loanApplicationId: new Types.ObjectId(loanApplicationId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  // ═══════════════════════════════════════════════════════
  //  SCHEDULE PREVIEW (không tạo contract)
  // ═══════════════════════════════════════════════════════

  /**
   * Preview lender schedule trước khi đầu tư.
   * Tính toán schedule dựa trên loan và số notes, nhưng KHÔNG tạo contract.
   */
  async getSchedulePreview(
    loanApplicationId: string,
    numNotes: number,
  ): Promise<{
    capital: number;
    numNotes: number;
    periodMonth: number;
    monthlyRatePercent: number;
    annualRatePercent: number;
    monthlyIncome: number;
    entirelyProfit: number;
    entirelyPay: number;
    schedule: LenderScheduleItem[];
    summary: { totalPrincipal: number; totalInterest: number; totalIncome: number; periodCount: number };
  }> {
    const loan = await this.loanModel.findById(loanApplicationId);
    if (!loan) throw new NotFoundException('Không tìm thấy khoản vay');

    // Check available
    const totalLoanNotes = Math.ceil(loan.capital / this.baseUnitPrice);
    const investedSoFar = (loan as any).investedNotes || 0;
    const availableNotes = totalLoanNotes - investedSoFar;
    if (numNotes > availableNotes) {
      throw new BadRequestException(`Chỉ còn ${availableNotes} notes khả dụng (yêu cầu ${numNotes})`);
    }

    const capital = numNotes * this.baseUnitPrice;
    const monthlyRatePercent = loan.monthlyRatePercent;
    const annualRatePercent = monthlyRatePercent * 12;
    const periodMonth = loan.periodMonth;

    // PMT calculation
    const monthlyRate = monthlyRatePercent / 100;
    let entirelyPay = 0;
    if (monthlyRate > 0 && periodMonth > 0) {
      const factor = Math.pow(1 + monthlyRate, periodMonth);
      const monthlyPay = capital * (monthlyRate * factor) / (factor - 1);
      entirelyPay = this.roundToCurrency(monthlyPay * periodMonth, loan.inMultiplesOf || 1000);
    } else {
      entirelyPay = capital;
    }
    const entirelyProfit = entirelyPay - capital;
    const monthlyIncome = this.roundToCurrency(entirelyPay / Math.max(1, periodMonth), loan.inMultiplesOf || 1000);

    const { schedule, summary } = this.calculateLenderSchedule(loan, capital);

    return {
      capital,
      numNotes,
      periodMonth,
      monthlyRatePercent,
      annualRatePercent,
      monthlyIncome,
      entirelyProfit,
      entirelyPay,
      schedule,
      summary,
    };
  }
}
