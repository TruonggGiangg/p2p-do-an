/**
 * InvestService — Business logic for InvestmentOrder CRUD + auto-matching + available loans
 */
import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { InvestmentOrder } from './schemas/investment-order.schema';
import { LoanApplication } from '../loan/schemas/loan-application.schema';
import { MatchingService } from './matching.service';
import { FineractFDService } from '../fineract/services/fineract-fd.service';
import { CreateInvestmentOrderDto } from './dto/create-investment-order.dto';
import { UpdateInvestmentOrderDto } from './dto/update-investment-order.dto';

export interface ProgressCallback {
  (message: string, step: number): void;
}

export interface CreateOrderResult {
  order: InvestmentOrder;
  matchResults: Array<{
    loanId: string;
    nodeMatch: number;
    matchPercentage: number;
    isFullMatch: boolean;
  }>;
  matchCount: number;
}

@Injectable()
export class InvestService {
  private readonly logger = new Logger(InvestService.name);

  constructor(
    @InjectModel(InvestmentOrder.name) private readonly investmentOrderModel: Model<InvestmentOrder>,
    @InjectModel(LoanApplication.name) private readonly loanModel: Model<LoanApplication>,
    @InjectConnection() private readonly connection: Connection,
    private readonly matchingService: MatchingService,
    private readonly configService: ConfigService,
    private readonly fineractFDService: FineractFDService,
  ) {}

  // ═══════════════════════════════════════════════════════
  //  CREATE + AUTO-MATCH
  // ═══════════════════════════════════════════════════════

  async createOrderWithMatching(
    lenderId: string,
    dto: CreateInvestmentOrderDto,
    onProgress?: ProgressCallback,
  ): Promise<CreateOrderResult> {
    const { capital, maxCapital, interestRange, purpose, periodRange, name } = dto;
    const totalNodes = this.matchingService.calculateNodes(capital);

    const sendProgress = (msg: string, step: number) => {
      this.logger.log(`[PROGRESS] step=${step} ${msg}`);
      onProgress?.(msg, step);
    };

    sendProgress('Đang tạo lệnh đầu tư...', 0);

    const order = await this.investmentOrderModel.create({
      lenderId: new Types.ObjectId(lenderId),
      name: name || '',
      capital,
      maxCapital,
      totalNodes,
      matchedNodes: 0,
      matchedCapital: 0,
      interestRange,
      purpose,
      periodRange,
      loans: [],
    });

    sendProgress('Đang tìm khoản vay phù hợp...', 10);

    const availableLoans = await this.loanModel
      .find({
        status: 'approved',
        isFullMatch: { $ne: true },
        monthlyRatePercent: { $gte: interestRange.min, $lte: interestRange.max },
        periodMonth: { $gte: periodRange.min, $lte: periodRange.max },
        capital: { $lte: maxCapital },
      })
      .sort({ createdAt: 1 })
      .exec();

    sendProgress(`Tìm thấy ${availableLoans.length} khoản vay có thể ghép. Đang kiểm tra...`, 20);

    const matchResults: CreateOrderResult['matchResults'] = [];
    let checkedCount = 0;

    for (const loan of availableLoans) {
      const currentOrder = await this.investmentOrderModel.findById(order._id);
      if (!currentOrder || currentOrder.status === 'closed') break;

      checkedCount++;
      const stepPct = 20 + Math.min(70, Math.floor((checkedCount / Math.max(availableLoans.length, 1)) * 70));

      const loanPurpose = (loan as any).willing || '';
      if (!this.matchingService.checkPurposeMatch(loanPurpose, purpose)) {
        sendProgress(`Bỏ qua — không khớp mục đích`, stepPct);
        continue;
      }

      const totalLoanNotes = this.matchingService.calculateNodes(loan.capital);
      const existingClaimed = ((loan as any).nodeMatch || 0) + ((loan as any).investedNotes || 0);
      const remainingLoanNodes = Math.max(0, totalLoanNotes - existingClaimed);
      const availableOrderNodes = currentOrder.totalNodes - currentOrder.matchedNodes;
      const nodesToMatch = Math.min(remainingLoanNodes, availableOrderNodes);

      if (nodesToMatch <= 0) continue;

      const matchedAmount = nodesToMatch * this.matchingService.unitPrice;
      sendProgress(`Ghép khoản vay: ${nodesToMatch} node, ${matchedAmount.toLocaleString()} VND`, stepPct);

      const updatedOrder = await this.investmentOrderModel.findOneAndUpdate(
        {
          _id: order._id,
          $expr: { $gte: [{ $subtract: ['$totalNodes', '$matchedNodes'] }, nodesToMatch] },
        },
        {
          $inc: { matchedNodes: nodesToMatch, matchedCapital: matchedAmount },
          $push: {
            loans: {
              loanId: String(loan._id),
              nodeMatch: nodesToMatch,
              isInvested: false,
              matchedAt: new Date(),
              loanDetails: {
                willing: loan.willing,
                capital: loan.capital,
                periodMonth: loan.periodMonth,
                monthlyRatePercent: loan.monthlyRatePercent,
                productId: loan.productId,
                aiScore: (loan as any).aiScore || 0,
                creditScore: (loan as any).creditScore || 0,
                status: loan.status,
              },
            },
          },
          $set: {
            ...(currentOrder.matchedNodes + nodesToMatch >= currentOrder.totalNodes
              ? { status: 'closed' as const }
              : {}),
          },
        },
        { new: true },
      );

      if (!updatedOrder) {
        this.logger.warn(`Atomic update failed for order ${order._id}`);
        continue;
      }

      // Cập nhật nodeMatch trên loan (atomic)
      const newNodeMatch = ((loan as any).nodeMatch || 0) + nodesToMatch;
      const newTotalClaimed = newNodeMatch + ((loan as any).investedNotes || 0);
      await this.loanModel.findByIdAndUpdate(loan._id, {
        $inc: { nodeMatch: nodesToMatch },
        $set: {
          totalNotes: totalLoanNotes,
          isFullMatch: newTotalClaimed >= totalLoanNotes,
        },
      });

      matchResults.push({
        loanId: String(loan._id),
        nodeMatch: nodesToMatch,
        matchPercentage: Math.round(Math.min(100, (nodesToMatch / totalLoanNotes) * 100)),
        isFullMatch: nodesToMatch >= totalLoanNotes,
      });

      if (updatedOrder.status === 'closed') {
        sendProgress('Lệnh đầu tư đã ghép đủ vốn, đóng lệnh.', 95);
        break;
      }
    }

    const finalOrder = await this.investmentOrderModel.findById(order._id);

    sendProgress(
      matchResults.length > 0
        ? `Hoàn tất. Đã ghép ${matchResults.length} khoản vay, tổng ${(finalOrder?.matchedCapital || 0).toLocaleString()} VND.`
        : 'Hoàn tất. Chưa ghép được khoản vay nào phù hợp.',
      100,
    );

    return {
      order: finalOrder || order,
      matchResults,
      matchCount: matchResults.length,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  AVAILABLE LOANS (cho lender duyệt)
  // ═══════════════════════════════════════════════════════

  async getAvailableLoans(query: {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: string;
    minRate?: number;
    maxRate?: number;
    minPeriod?: number;
    maxPeriod?: number;
    minCapital?: number;
    maxCapital?: number;
    search?: string;
    riskLevel?: string; // LOW | MEDIUM | HIGH | VERY_HIGH
  } = {}) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize || 10));
    const skip = (page - 1) * pageSize;

    const allowedSorts = new Set(['createdAt', 'capital', 'monthlyRatePercent', 'periodMonth', 'entirelyPay']);
    const sortBy = allowedSorts.has(query.sortBy || '') ? query.sortBy! : 'createdAt';
    const sortOrderVal = (query.sortOrder || '').toLowerCase() === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrderVal };

    const filters: Record<string, any> = {
      // Chỉ hiện khoản vay đã phê duyệt, đang chờ giải ngân
      status: 'approved',
      isFullMatch: { $ne: true },
    };

    if (query.minRate !== undefined || query.maxRate !== undefined) {
      filters.monthlyRatePercent = {};
      if (query.minRate !== undefined) filters.monthlyRatePercent.$gte = query.minRate;
      if (query.maxRate !== undefined) filters.monthlyRatePercent.$lte = query.maxRate;
    }

    if (query.minPeriod !== undefined || query.maxPeriod !== undefined) {
      filters.periodMonth = {};
      if (query.minPeriod !== undefined) filters.periodMonth.$gte = query.minPeriod;
      if (query.maxPeriod !== undefined) filters.periodMonth.$lte = query.maxPeriod;
    }

    // ── Capital range filter ──
    if (query.minCapital !== undefined || query.maxCapital !== undefined) {
      filters.capital = {};
      if (query.minCapital !== undefined) filters.capital.$gte = query.minCapital;
      if (query.maxCapital !== undefined) filters.capital.$lte = query.maxCapital;
    }

    // ── Search by willing (mục đích vay) ──
    if (query.search && query.search.trim()) {
      filters.willing = { $regex: query.search.trim(), $options: 'i' };
    }

    // ── Risk level filter ──
    if (query.riskLevel) {
      filters['aiScore.riskLevel'] = query.riskLevel.toUpperCase();
    }

    const [totalCount, loans] = await Promise.all([
      this.loanModel.countDocuments(filters),
      this.loanModel
        .find(filters)
        .select('-documents -repaymentHistory -transactions -repaymentSchedule -charges -collateral -guarantors -delinquencyActions -delinquencyTags -installmentLevelDelinquency -delinquencyTag')
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
        .exec(),
    ]);

    const baseUnitPrice = this.configService.get<number>('invest.baseUnitPrice') || 500_000;

    // ── Resolve FD product interest rates ──
    // Build map: loanProductId → FD annual interest rate
    const fdRateMap = await this.buildFDRateMap(loans);

    // Enrich with investment progress (like HD-AMC)
    const safeLoans = loans.map(loan => {
      const obj = loan.toObject();
      delete (obj as any).userId;
      delete (obj as any).disbursementWalletId;
      delete (obj as any).fineractLoanId;
      delete (obj as any).clientDisplayName;

      // ── FD interest rate (what investor earns) ──
      const loanProductId = (obj as any).productId;
      const fdRate = fdRateMap.get(loanProductId);
      if (fdRate !== undefined) {
        (obj as any).fdInterestRate = fdRate;                    // % năm (e.g. 18)
        (obj as any).fdMonthlyRate = +(fdRate / 12).toFixed(2);  // % tháng (e.g. 1.5)
      }

      // Compute entirelyPay nếu chưa có (backward compat cho loans synced từ Fineract)
      // Dùng FD rate nếu có, nếu không fallback loan rate
      const effectiveMonthlyRate = (obj as any).fdMonthlyRate || (obj as any).monthlyRatePercent || 0;
      if (!(obj as any).entirelyPay || (obj as any).entirelyPay === 0) {
        const schedule = (obj as any).schedulePreview || [];
        if (schedule.length > 0) {
          (obj as any).entirelyPay = schedule.reduce((s: number, it: any) => s + (it.total || 0), 0);
        } else {
          const capital = (obj as any).capital || 0;
          const rate = effectiveMonthlyRate / 100;
          const period = (obj as any).periodMonth || 1;
          if (rate > 0 && capital > 0) {
            const emi = (capital * rate * Math.pow(1 + rate, period)) / (Math.pow(1 + rate, period) - 1);
            (obj as any).entirelyPay = Math.round(emi * period);
          }
        }
      }
      if (!(obj as any).monthlyPay || (obj as any).monthlyPay === 0) {
        const ep = (obj as any).entirelyPay || 0;
        const pm = (obj as any).periodMonth || 1;
        if (ep > 0) (obj as any).monthlyPay = Math.round(ep / pm);
      }

      // Compute totalNotes nếu chưa có (backward compat)
      const computedTotalNotes = (obj as any).totalNotes > 0
        ? (obj as any).totalNotes
        : Math.ceil((obj as any).capital / baseUnitPrice);
      (obj as any).totalNotes = computedTotalNotes;

      // Ensure nodeMatch + investedNotes fields
      const nodeMatch = (obj as any).nodeMatch || 0;
      const investedNotes = (obj as any).investedNotes || 0;
      const totalClaimed = nodeMatch + investedNotes;
      const availableNotes = Math.max(0, computedTotalNotes - totalClaimed);

      (obj as any).nodeMatch = nodeMatch;
      (obj as any).investedNotes = investedNotes;
      (obj as any).availableNotes = availableNotes;
      (obj as any).investedPercent = computedTotalNotes > 0
        ? Math.round((totalClaimed / computedTotalNotes) * 100)
        : 0;

      return obj;
    });

    return {
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
      currentPage: page,
      pageSize,
      loans: safeLoans,
    };
  }

  /**
   * Build a map: loanProductId → FD annual interest rate (%)
   * Strategy:
   *   1. Fetch all FD products (with details for interestRateCharts)
   *   2. Build shortName → FD rate map
   *   3. Get unique loanProductIds from loans
   *   4. For each loanProductId, get loan product shortName from Fineract
   *   5. Match shortName → FD rate
   */
  private async buildFDRateMap(loans: any[]): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    try {
      // 1. Get all FD products with interest rate details
      const fdProducts = await this.fineractFDService.getFDProducts();
      if (!fdProducts.length) return map;

      // Get detailed info for each FD product (need activeChart for real rates)
      const fdClient = (this.fineractFDService as any).client;
      const fdDetailedPromises = fdProducts.map(async (p: any) => {
        try {
          const res = await fdClient.get(`/fixeddepositproducts/${p.id}`);
          return res.data;
        } catch {
          return p;
        }
      });
      const fdDetailed = await Promise.all(fdDetailedPromises);

      // 2. Build shortName → FD annual rate map
      const shortNameToFDRate = new Map<string, number>();
      for (const fd of fdDetailed) {
        const sn = (fd.shortName || '').toUpperCase().trim();
        if (!sn) continue;
        const activeChart = fd.activeChart || fd.interestRateCharts?.[0];
        const chartSlabs = activeChart?.chartSlabs || [];
        const rate = chartSlabs[0]?.annualInterestRate ?? fd.nominalAnnualInterestRate ?? 0;
        shortNameToFDRate.set(sn, rate);
      }

      // 3. Get unique loan product IDs
      const uniqueProductIds = [...new Set(loans.map(l => (l as any).productId as number).filter(Boolean))];

      // 4. For each loan product, get shortName from Fineract and match
      for (const pid of uniqueProductIds) {
        try {
          const loanProd = await fdClient.get(`/loanproducts/${pid}`);
          const sn = (loanProd.data?.shortName || '').toUpperCase().trim();
          if (sn && shortNameToFDRate.has(sn)) {
            map.set(pid, shortNameToFDRate.get(sn)!);
          }
        } catch {
          // Ignore — loan product may not exist in Fineract
        }
      }

      this.logger.log(`[buildFDRateMap] Resolved ${map.size} FD rates for ${uniqueProductIds.length} loan products`);
    } catch (err: any) {
      this.logger.warn(`[buildFDRateMap] Failed to build FD rate map: ${err.message}`);
    }
    return map;
  }

  // ═══════════════════════════════════════════════════════
  //  INVESTMENT ORDER LIST / DETAIL
  // ═══════════════════════════════════════════════════════

  async getOrdersByLender(lenderId: string, query: {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: string;
    status?: string;
  } = {}) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 10));
    const skip = (page - 1) * pageSize;

    const allowedSorts = new Set(['createdAt', 'capital', 'maxCapital', 'status']);
    const sortBy = allowedSorts.has(query.sortBy || '') ? query.sortBy! : 'createdAt';
    const sortOrderVal = (query.sortOrder || '').toLowerCase() === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrderVal };

    const filters: Record<string, any> = { lenderId: new Types.ObjectId(lenderId) };
    if (query.status && ['open', 'closed'].includes(query.status)) {
      filters.status = query.status;
    }

    const [totalCount, orders] = await Promise.all([
      this.investmentOrderModel.countDocuments(filters),
      this.investmentOrderModel.find(filters).sort(sort).skip(skip).limit(pageSize).exec(),
    ]);

    return {
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
      currentPage: page,
      pageSize,
      orders,
    };
  }

  async getOrderById(orderId: string): Promise<InvestmentOrder> {
    const order = await this.investmentOrderModel.findById(orderId);
    if (!order) throw new NotFoundException('Không tìm thấy lệnh đầu tư');
    return order;
  }

  // ═══════════════════════════════════════════════════════
  //  UPDATE / DELETE / CLOSE
  // ═══════════════════════════════════════════════════════

  async updateOrder(orderId: string, userId: string, dto: UpdateInvestmentOrderDto): Promise<InvestmentOrder> {
    const order = await this.investmentOrderModel.findById(orderId);
    if (!order) throw new NotFoundException('Không tìm thấy lệnh đầu tư');
    if (String(order.lenderId) !== userId) throw new ForbiddenException('Không có quyền');

    const updateFields: Record<string, any> = {};
    const allowed = ['name', 'capital', 'maxCapital', 'interestRange', 'purpose', 'periodRange'] as const;
    for (const key of allowed) {
      if ((dto as any)[key] !== undefined) updateFields[key] = (dto as any)[key];
    }

    if (updateFields.capital !== undefined) {
      updateFields.totalNodes = this.matchingService.calculateNodes(updateFields.capital);
    }

    const updated = await this.investmentOrderModel.findByIdAndUpdate(orderId, updateFields, { new: true });
    if (!updated) throw new NotFoundException('Cập nhật thất bại');
    return updated;
  }

  async deleteOrder(orderId: string, userId: string): Promise<void> {
    const order = await this.investmentOrderModel.findById(orderId);
    if (!order) throw new NotFoundException('Không tìm thấy lệnh đầu tư');
    if (String(order.lenderId) !== userId) throw new ForbiddenException('Không có quyền');
    await this.investmentOrderModel.findByIdAndDelete(orderId);
  }

  async closeOrder(orderId: string, userId: string): Promise<InvestmentOrder> {
    const order = await this.investmentOrderModel.findById(orderId);
    if (!order) throw new NotFoundException('Không tìm thấy lệnh đầu tư');
    if (String(order.lenderId) !== userId) throw new ForbiddenException('Không có quyền');
    order.status = 'closed';
    return order.save();
  }
}
