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
import { User } from '../users/schemas/user.schema';
import { FineractFDService } from '../fineract/services/fineract-fd.service';
import { generateInvestmentContractHTML } from './templates/investment-contract.template';

@Injectable()
export class InvestmentContractService {
  private readonly logger = new Logger(InvestmentContractService.name);
  private readonly baseUnitPrice: number;

  constructor(
    @InjectModel(InvestmentContract.name) private readonly contractModel: Model<InvestmentContract>,
    @InjectModel(LoanApplication.name) private readonly loanModel: Model<LoanApplication>,
    @InjectModel(InvestmentOrder.name) private readonly orderModel: Model<InvestmentOrder>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly fineractFDService: FineractFDService,
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
  ): {
    schedule: LenderScheduleItem[];
    summary: { totalPrincipal: number; totalInterest: number; totalIncome: number; periodCount: number };
  } {
    let borrowerSchedule: any[] = loan.schedulePreview || [];
    const loanCapital = loan.capital || 1;
    const investmentRatio = investCapital / loanCapital;
    const inMultiplesOf = loan.inMultiplesOf || 1000;

    // ── FALLBACK: tự generate schedule từ PMT nếu schedulePreview rỗng ──
    if (borrowerSchedule.length === 0 && loan.periodMonth > 0) {
      const monthlyRate = (loan.monthlyRatePercent || 0) / 100;
      const periods = loan.periodMonth;
      const cap = loanCapital;

      if (monthlyRate > 0) {
        const factor = Math.pow(1 + monthlyRate, periods);
        const monthlyPay = (cap * (monthlyRate * factor)) / (factor - 1);
        let remaining = cap;
        const generated: any[] = [];

        for (let i = 1; i <= periods; i++) {
          const interest = this.roundToCurrency(remaining * monthlyRate, inMultiplesOf);
          let principal: number;
          if (i === periods) {
            principal = remaining; // last period: clear remaining
          } else {
            principal = this.roundToCurrency(monthlyPay - interest, inMultiplesOf);
          }
          remaining -= principal;
          const baseDate = new Date(loan.disbursementDate || loan.createdAt || new Date());
          baseDate.setMonth(baseDate.getMonth() + i);
          generated.push({
            period: i,
            principal,
            interest,
            total: principal + interest,
            dueDate: baseDate.toISOString(),
          });
        }
        borrowerSchedule = generated;
        this.logger.log(`[calculateLenderSchedule] Generated ${generated.length} periods from PMT fallback`);
      }
    }

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
    const LOG = '[createContract]';
    this.logger.log(`${LOG} ── BẮT ĐẦU tạo hợp đồng đầu tư ──`);
    this.logger.log(`${LOG} Input: lenderId=${lenderId}, loanId=${loanApplicationId}, numNotes=${numNotes}, orderId=${investmentOrderId || 'N/A'}`);

    // 1. Validate loan
    const loan = await this.loanModel.findById(loanApplicationId);
    if (!loan) throw new NotFoundException('Không tìm thấy khoản vay');

    if (!['approved', 'disbursed'].includes(loan.status)) {
      throw new BadRequestException('Khoản vay không ở trạng thái cho phép đầu tư');
    }
    this.logger.log(`${LOG} ✅ Loan valid: capital=${(loan.capital || 0).toLocaleString()}, status=${loan.status}, productId=${loan.productId}`);

    // 2. Check available notes (must consider BOTH nodeMatch and investedNotes)
    const totalLoanNotes = Math.ceil(loan.capital / this.baseUnitPrice);
    const investedSoFar = (loan as any).investedNotes || 0;
    const nodeMatchSoFar = (loan as any).nodeMatch || 0;

    // Nếu đầu tư từ Order → những node đã match được "giải phóng" khi invest
    // nên không cần trừ nodeMatch cho phần đang invest
    let effectiveNodeMatch = nodeMatchSoFar;
    let orderMatchedNodes = 0;

    if (investmentOrderId) {
      // Tìm order để biết bao nhiêu node match trên loan này thuộc order đó
      const order = await this.orderModel.findById(investmentOrderId);
      if (order) {
        const matchedLoan = order.loans?.find((l: any) => String(l.loanId) === String(loan._id));
        orderMatchedNodes = matchedLoan?.nodeMatch || 0;
        this.logger.log(`${LOG}    Order ${investmentOrderId}: matched ${orderMatchedNodes} nodes cho loan này`);

        if (numNotes !== orderMatchedNodes) {
          throw new BadRequestException(
            `Yêu cầu số lượng (${numNotes}) phải bằng đúng số lượng đã giữ (${orderMatchedNodes}).`,
          );
        }

        // Trừ bớt toàn bộ nodeMatch thuộc order này
        effectiveNodeMatch = Math.max(0, nodeMatchSoFar - orderMatchedNodes);
      }
    }

    const availableNotes = totalLoanNotes - investedSoFar - effectiveNodeMatch;
    this.logger.log(`${LOG}    Notes: total=${totalLoanNotes}, invested=${investedSoFar}, nodeMatch=${nodeMatchSoFar}, effective=${effectiveNodeMatch}, available=${availableNotes}, requested=${numNotes}`);
    if (numNotes > availableNotes) {
      throw new BadRequestException(`Chỉ còn ${availableNotes} notes khả dụng (yêu cầu ${numNotes})`);
    }

    // Resolve FD Interest Rate (Investor's Rate)
    let annualRatePercent = 0;
    try {
      this.logger.log(`${LOG}    Resolving FD rate from loan productId=${loan.productId}...`);
      const loanProdRes = await (this.fineractFDService as any).client.get(`/loanproducts/${loan.productId}`);
      const shortName = loanProdRes.data?.shortName;
      this.logger.log(`${LOG}    Loan product shortName="${shortName || 'N/A'}"`);
      if (shortName) {
        const fdRate = await this.fineractFDService.getFDProductAnnualRate(shortName);
        if (fdRate !== null) {
          annualRatePercent = fdRate;
          this.logger.log(`${LOG}    ✅ FD rate resolved: ${fdRate}% /năm (from FD product "${shortName}")`);
        } else {
          this.logger.warn(`${LOG}    ⚠️ FD product "${shortName}" không có rate, sẽ fallback dùng loan rate`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`${LOG}    ⚠️ Failed to resolve FD rate: ${err.message}`);
    }

    // Fallback to loan rate if FD rate not found
    if (!annualRatePercent) {
      annualRatePercent = loan.monthlyRatePercent * 12;
      this.logger.log(`${LOG}    Fallback: annualRate = loan.monthlyRate(${loan.monthlyRatePercent}%) × 12 = ${annualRatePercent}%`);
    }
    const monthlyRatePercent = +(annualRatePercent / 12).toFixed(2);

    // 3. Calculate financials
    const capital = numNotes * this.baseUnitPrice;
    const periodMonth = loan.periodMonth;

    // Simple declining balance calculation
    const monthlyRate = monthlyRatePercent / 100;
    let entirelyPay = 0;
    if (monthlyRate > 0 && periodMonth > 0) {
      const factor = Math.pow(1 + monthlyRate, periodMonth);
      const monthlyPay = (capital * (monthlyRate * factor)) / (factor - 1);
      entirelyPay = this.roundToCurrency(monthlyPay * periodMonth, loan.inMultiplesOf || 1000);
    } else {
      entirelyPay = capital;
    }
    const entirelyProfit = entirelyPay - capital;
    const monthlyIncome = this.roundToCurrency(entirelyPay / Math.max(1, periodMonth), loan.inMultiplesOf || 1000);

    this.logger.log(`${LOG}    Financials: capital=${capital.toLocaleString()}, rate=${monthlyRatePercent}%/tháng (${annualRatePercent}%/năm), period=${periodMonth}m`);
    this.logger.log(`${LOG}    entirelyPay=${entirelyPay.toLocaleString()}, profit=${entirelyProfit.toLocaleString()}, monthlyIncome=${monthlyIncome.toLocaleString()}`);

    // 4. Calculate lender schedule
    const { schedule, summary } = this.calculateLenderSchedule(loan, capital);
    this.logger.log(`${LOG}    Lender schedule: ${schedule.length} periods, totalIncome=${summary.totalIncome.toLocaleString()}, totalInterest=${summary.totalInterest.toLocaleString()}`);

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
      status: 'pending_signature',
      // Lender schedule
      lenderSchedule: schedule,
      scheduleTotalPrincipal: summary.totalPrincipal,
      scheduleTotalInterest: summary.totalInterest,
      scheduleTotalIncome: summary.totalIncome,
      schedulePeriodCount: summary.periodCount,
    });

    // 7. Update loan atomically: investedNotes++, nodeMatch-- (if from order)
    //    We do this BEFORE saving contract to revert easily if constraints fail.
    const nodeMatchDecrement = investmentOrderId ? orderMatchedNodes : 0;
    this.logger.log(`${LOG}    Atomic update loan: investedNotes += ${numNotes}, nodeMatch -= ${nodeMatchDecrement}`);
    const updateResult = await this.loanModel.findOneAndUpdate(
      {
        _id: loanApplicationId,
        $expr: {
          $gte: ['$totalNotes', { $add: [{ $ifNull: ['$investedNotes', 0] }, numNotes] }],
        },
      },
      {
        $inc: {
          investedNotes: numNotes,
          ...(nodeMatchDecrement > 0 ? { nodeMatch: -nodeMatchDecrement } : {}),
        },
      },
      { new: true },
    );

    if (!updateResult) {
      this.logger.error(`${LOG} ❌ Atomic update FAILED — race condition hoặc hết room`);
      throw new BadRequestException('Lỗi hệ thống: Khoản vay đã hết room khả dụng (race condition). Vui lòng thử lại.');
    }

    // After atomic increment, update derived fields
    const totalClaimed = (updateResult as any).investedNotes + ((updateResult as any).nodeMatch || 0);
    const newMatchPercentage = Math.min(100, Math.round((totalClaimed / updateResult.totalNotes) * 100));
    const isFullMatch = (updateResult as any).investedNotes >= updateResult.totalNotes;

    await this.loanModel.updateOne(
      { _id: loanApplicationId },
      { $set: { isFullMatch, matchPercentage: newMatchPercentage } },
    );

    this.logger.log(
      `${LOG}    Loan ${loanApplicationId} updated: investedNotes ${investedSoFar}→${(updateResult as any).investedNotes}, ` +
        `totalClaimed ${totalClaimed}/${updateResult.totalNotes}, matchPercentage=${newMatchPercentage}%` +
        `${isFullMatch ? ' 🎯 (FULL MATCH — READY FOR DISBURSEMENT)' : ''}`,
    );

    // Save contract
    await contract.save();
    this.logger.log(`${LOG} ✅ InvestmentContract saved: ${contractId}, capital=${capital.toLocaleString()} VND, ${numNotes} notes`);

    // Update order loan entry as invested
    if (investmentOrderId) {
      await this.orderModel.updateOne(
        { _id: investmentOrderId, 'loans.loanId': String(loan._id) },
        { $set: { 'loans.$.isInvested': true } },
      );
      this.logger.log(`${LOG}    Order ${investmentOrderId}: loan ${loan._id} marked as isInvested=true`);
    }

    // Return contract + isFullMatch flag (để payment service trigger disbursement)
    (contract as any)._isFullMatch = isFullMatch;
    (contract as any)._loanApplicationId = loanApplicationId;
    this.logger.log(`${LOG} ── KẾT THÚC tạo hợp đồng ──`);
    return contract;
  }

  // ═══════════════════════════════════════════════════════
  //  QUERY CONTRACTS
  // ═══════════════════════════════════════════════════════

  async getContractsByLender(lenderId: string, query: { page?: number; pageSize?: number; status?: string } = {}) {
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
    const query = Types.ObjectId.isValid(contractId)
      ? { $or: [{ _id: contractId }, { contractId: contractId }] }
      : { contractId: contractId };

    const contract = await this.contractModel
      .findOne({
        ...query,
        lenderId: new Types.ObjectId(lenderId),
      })
      .populate('loanApplicationId', 'willing capital periodMonth monthlyRatePercent status disbursementDate')
      .exec();

    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng đầu tư');
    return contract;
  }

  async getContractByLoanId(loanApplicationId: string, lenderId: string): Promise<InvestmentContract> {
    const contract = await this.contractModel
      .findOne({
        loanApplicationId: new Types.ObjectId(loanApplicationId),
        lenderId: new Types.ObjectId(lenderId),
      })
      .populate('loanApplicationId', 'willing capital periodMonth monthlyRatePercent status disbursementDate')
      .exec();

    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng đầu tư cho khoản vay này');
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
    investmentOrderId?: string,
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
    fdConfig?: any;
  }> {
    const loan = await this.loanModel.findById(loanApplicationId);
    if (!loan) throw new NotFoundException('Không tìm thấy khoản vay');

    // Check available (must consider BOTH nodeMatch and investedNotes)
    const totalLoanNotes = Math.ceil(loan.capital / this.baseUnitPrice);
    const investedSoFar = (loan as any).investedNotes || 0;
    const nodeMatchSoFar = (loan as any).nodeMatch || 0;

    let effectiveNodeMatch = nodeMatchSoFar;
    if (investmentOrderId) {
      const order = await this.orderModel.findById(investmentOrderId);
      if (order) {
        const matchedLoan = order.loans?.find((l: any) => String(l.loanId) === String(loan._id));
        const orderMatchedNodes = matchedLoan?.nodeMatch || 0;
        effectiveNodeMatch = Math.max(0, nodeMatchSoFar - Math.min(orderMatchedNodes, numNotes));
      }
    }

    console.log(
      `[getSchedulePreview calc] invOrdId=${investmentOrderId}, nodeMatchSoFar=${nodeMatchSoFar}, effectiveNodeMatch=${effectiveNodeMatch}, availableNotes=${totalLoanNotes - investedSoFar - effectiveNodeMatch}, numNotes=${numNotes}`,
    );

    const availableNotes = totalLoanNotes - investedSoFar - effectiveNodeMatch;
    if (numNotes > availableNotes) {
      throw new BadRequestException(`Chỉ còn ${availableNotes} notes khả dụng (yêu cầu ${numNotes})`);
    }

    const capital = numNotes * this.baseUnitPrice;
    const periodMonth = loan.periodMonth;

    // ── Fetch FD product config dynamically ──
    let fdConfig: any = null;
    let annualRatePercent = 0;

    try {
      const loanProdRes = await (this.fineractFDService as any).client.get(`/loanproducts/${loan.productId}`);
      const shortName = loanProdRes.data?.shortName;
      if (shortName) {
        fdConfig = await this.fineractFDService.getFDProductConfig(shortName);
        if (fdConfig) {
          annualRatePercent = fdConfig.annualInterestRate;
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to fetch FD config for loan ${loan._id}: ${err.message}`);
    }

    // Fallback to loan rate if FD config not available
    if (!annualRatePercent) {
      annualRatePercent = loan.monthlyRatePercent * 12;
    }
    const monthlyRatePercent = +(annualRatePercent / 12).toFixed(4);

    // ── Calculate FD schedule using compound interest ──
    const inMultiplesOf = fdConfig?.inMultiplesOf || loan.inMultiplesOf || 1000;
    const daysInYear = fdConfig?.daysInYear || 365;
    const compounding = fdConfig?.compoundingPeriod || 'Monthly';

    const schedule: LenderScheduleItem[] = [];
    let compoundedBalance = capital; // balance grows with compounded interest
    let totalInterestEarned = 0;

    const baseDate = new Date(loan.disbursementDate || (loan as any).createdAt || new Date());

    for (let i = 1; i <= periodMonth; i++) {
      const isLast = i === periodMonth;

      // Calculate monthly interest
      let periodInterest: number;

      if (compounding === 'Daily' || fdConfig?.calculationType === 'Daily Balance') {
        // Daily balance: interest = balance × (annualRate / 100) / daysInYear × daysInMonth
        const monthDate = new Date(baseDate);
        monthDate.setMonth(monthDate.getMonth() + i);
        const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 0).getDate();
        periodInterest = ((compoundedBalance * (annualRatePercent / 100)) / daysInYear) * daysInMonth;
      } else {
        // Monthly compounding: interest = balance × (annualRate / 100 / 12)
        periodInterest = (compoundedBalance * (annualRatePercent / 100)) / 12;
      }

      periodInterest = this.roundToCurrency(periodInterest, inMultiplesOf);
      totalInterestEarned += periodInterest;

      // In FD: principal stays locked, only returned at maturity
      const periodPrincipal = isLast ? capital : 0;

      // Due date
      const dueDate = new Date(baseDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      const dueDateStr = `${String(dueDate.getDate()).padStart(2, '0')}/${String(dueDate.getMonth() + 1).padStart(2, '0')}/${dueDate.getFullYear()}`;

      schedule.push({
        period: i,
        dueDate: dueDateStr,
        principal: periodPrincipal,
        interest: periodInterest,
        total: periodPrincipal + periodInterest,
        status: 'pending' as const,
      });

      // Compound: add interest to balance for next period's calculation
      compoundedBalance += periodInterest;
    }

    const summary = {
      totalPrincipal: capital,
      totalInterest: totalInterestEarned,
      totalIncome: capital + totalInterestEarned,
      periodCount: periodMonth,
    };

    const entirelyPay = summary.totalIncome;
    const entirelyProfit = summary.totalInterest;
    const monthlyIncome = this.roundToCurrency(entirelyPay / Math.max(1, periodMonth), inMultiplesOf);

    // ── DEBUG LOG ──
    this.logger.log(`[getSchedulePreview] FD Compound Interest calculation`);
    this.logger.log(
      `[DEBUG] capital=${capital}, rate=${annualRatePercent}%, period=${periodMonth}m, compounding=${compounding}`,
    );
    this.logger.log(`[DEBUG] daysInYear=${daysInYear}, inMultiplesOf=${inMultiplesOf}`);
    this.logger.log(
      `[DEBUG] entirelyPay=${entirelyPay}, entirelyProfit=${entirelyProfit}, monthlyIncome=${monthlyIncome}`,
    );
    this.logger.log(`[DEBUG] schedule length=${schedule.length}, summary=${JSON.stringify(summary)}`);
    // ── END DEBUG ──

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
      fdConfig,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  CONTRACT HTML (render hợp đồng dạng HTML)
  // ═══════════════════════════════════════════════════════

  async getContractHTML(contractId: string, lenderId: string): Promise<string> {
    const contract = await this.getContractById(contractId, lenderId);

    // Fetch investor user info
    const user = await this.userModel.findById(contract.lenderId).lean().exec();
    const kyc = (user as any)?.kycData || {};
    const profile = (user as any)?.profile || {};

    const investorInfo = {
      fullName: kyc.fullName || `${profile.lastName || ''} ${profile.firstName || ''}`.trim() || undefined,
      idNumber: kyc.idNumber || kyc.cccd || undefined,
      phone: (user as any)?.username || (user as any)?.phoneNumber || undefined,
      email: (user as any)?.email || undefined,
      address: kyc.address || kyc.permanentAddress || undefined,
      dateOfBirth: kyc.dateOfBirth || kyc.dob || undefined,
    };

    // Fetch loan info for borrower summary
    const loan = await this.loanModel.findById(contract.loanApplicationId).lean().exec();
    const borrowerSummary = loan
      ? {
          creditScore: (loan as any).creditScore || undefined,
          creditGrade: (loan as any).creditGrade || undefined,
          loanPurpose: (loan as any).willing || undefined,
          loanProductName: (loan as any).productName || undefined,
        }
      : {};

    return generateInvestmentContractHTML({
      contract: contract.toJSON ? contract.toJSON() : contract,
      investorInfo,
      borrowerSummary,
    });
  }
}
