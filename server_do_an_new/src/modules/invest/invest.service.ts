/**
 * InvestService — Business logic for InvestmentOrder CRUD + auto-matching + available loans
 */
import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { InvestmentOrder } from './schemas/investment-order.schema';
import { LoanApplication } from '../loan/schemas/loan-application.schema';
import { MatchingService } from './matching.service';
import { FineractFDService } from '../fineract/services/fineract-fd.service';
import { CreateInvestmentOrderDto } from './dto/create-investment-order.dto';
import { UpdateInvestmentOrderDto } from './dto/update-investment-order.dto';
import { LoanDelinquency } from '../delinquency/entities/loan-delinquency.schema';
import { InvestmentContract } from './schemas/investment-contract.schema';

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
    @InjectModel(LoanDelinquency.name) private readonly loanDelinquencyModel: Model<LoanDelinquency>,
    @InjectConnection() private readonly connection: Connection,
    private readonly matchingService: MatchingService,
    private readonly configService: ConfigService,
    private readonly fineractFDService: FineractFDService,
    @InjectModel(InvestmentContract.name) private readonly contractModel: Model<InvestmentContract>,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Resolve FabricService lazily to avoid circular dependency */
  private getFabricService(): any {
    try {
      const { FabricService } = require('../fabric/fabric.service');
      const svc = this.moduleRef.get(FabricService, { strict: false });
      return svc?.isConnected() ? svc : null;
    } catch { return null; }
  }

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

    // ── Blockchain: ghi Investment Order ──
    try {
      const fabric = this.getFabricService();
      if (fabric) {
        const orderId = `ORDER_${order._id}`;
        await fabric.submitTransaction('createInvestmentOrder', orderId, JSON.stringify({
          lenderId,
          name: name || '',
          capital,
          maxCapital,
          totalNodes,
          interestRange,
          periodRange,
          purpose,
          status: 'open',
        }));
        this.logger.log(`[Blockchain] ✅ Created InvestmentOrder ${orderId}`);
      }
    } catch (bcErr: any) {
      this.logger.warn(`[Blockchain] Failed to create InvestmentOrder: ${bcErr?.message}`);
    }

    sendProgress('Đang tìm khoản vay phù hợp...', 10);
    this.logger.log(`[InvestService] createOrderWithMatching - Start finding loans for order ${order._id}`);

    const queryFilters: any = {
      status: 'approved',
      isFullMatch: { $ne: true },
      $expr: {
        $lt: [
          { $add: [{ $ifNull: ['$investedNotes', 0] }, { $ifNull: ['$nodeMatch', 0] }] },
          { $max: ['$totalNotes', { $ceil: { $divide: ['$capital', this.matchingService.unitPrice] } }] },
        ],
      },
      monthlyRatePercent: { $gte: interestRange.min, $lte: interestRange.max },
      periodMonth: { $gte: periodRange.min, $lte: periodRange.max },
      capital: { $lte: maxCapital },
    };

    this.logger.log(`[InvestService] Querying available loans with filters: ${JSON.stringify(queryFilters)}`);

    // Query: học từ HD-AMC P2P — thêm $expr guard (investedNotes < totalNotes)
    const availableLoans = await this.loanModel
      .find(queryFilters)
      .select(
        '_id capital willing periodMonth monthlyRatePercent productId status nodeMatch investedNotes totalNotes aiScore creditScore',
      )
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    this.logger.log(`[InvestService] Found ${availableLoans.length} available approved loans for matching.`);
    if (availableLoans.length > 0) {
      this.logger.log(`[InvestService] Loan IDs to match: ${availableLoans.map(l => String(l._id)).join(', ')}`);
    }

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

      const totalLoanNotes =
        (loan as any).totalNotes > 0 ? (loan as any).totalNotes : this.matchingService.calculateNodes(loan.capital);
      const existingNodeMatch = (loan as any).nodeMatch || 0;
      const existingInvestedNotes = (loan as any).investedNotes || 0;
      const existingClaimed = existingNodeMatch + existingInvestedNotes;
      const remainingLoanNodes = Math.max(0, totalLoanNotes - existingClaimed);
      const availableOrderNodes = currentOrder.totalNodes - currentOrder.matchedNodes;
      const nodesToMatch = Math.min(remainingLoanNodes, availableOrderNodes);

      // Guard: nodeMatch không được vượt giới hạn (học từ HD-AMC P2P line 190-193)
      const maxAllowedNodeMatch = totalLoanNotes - existingInvestedNotes;
      const newNodeMatch = existingNodeMatch + nodesToMatch;
      if (newNodeMatch > maxAllowedNodeMatch) {
        this.logger.warn(
          `nodeMatch (${newNodeMatch}) exceeds limit (${maxAllowedNodeMatch}) for loan ${loan._id}, skipping`,
        );
        sendProgress(`Bỏ qua — nodeMatch sẽ vượt giới hạn`, stepPct);
        continue;
      }

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
          $set: { updatedAt: new Date() },
        },
        { new: true },
      );

      if (!updatedOrder) {
        this.logger.warn(`Atomic update failed for order ${order._id}`);
        continue;
      }

      // Cập nhật nodeMatch trên loan (atomic có guard)
      const loanUpdateResult = await this.loanModel.findOneAndUpdate(
        {
          _id: loan._id,
          $expr: {
            $gte: [
              '$totalNotes',
              { $add: [{ $ifNull: ['$investedNotes', 0] }, { $ifNull: ['$nodeMatch', 0] }, nodesToMatch] }
            ]
          }
        },
        {
          $inc: { nodeMatch: nodesToMatch },
          $set: { totalNotes: totalLoanNotes }
        },
        { new: true }
      );

      if (!loanUpdateResult) {
        this.logger.warn(`Atomic lock on Loan ${loan._id} failed. Reverting order ${order._id}.`);
        await this.investmentOrderModel.findByIdAndUpdate(order._id, {
          $inc: { matchedNodes: -nodesToMatch, matchedCapital: -matchedAmount },
          $pull: { loans: { loanId: String(loan._id) } },
          $set: { status: 'open' }
        });
        sendProgress(`Bỏ qua — Khoản vay đã đủ người giữ chỗ, thử lại sau (Race condition)`, stepPct);
        continue;
      }

      const finalInvestedNotes = (loanUpdateResult as any).investedNotes || 0;
      const finalNodeMatch = (loanUpdateResult as any).nodeMatch || 0;
      const newTotalClaimed = finalNodeMatch + finalInvestedNotes;
      const newMatchPercentage = Math.min(100, Math.round((newTotalClaimed / totalLoanNotes) * 100));
      // CRITICAL: isFullMatch = TRUE CHỈ KHI tiền thật đã thanh toán (investedNotes) >= totalNotes
      const newIsFullMatch = finalInvestedNotes >= totalLoanNotes;
      
      await this.loanModel.updateOne(
        { _id: loan._id },
        { $set: { isFullMatch: newIsFullMatch, matchPercentage: newMatchPercentage } }
      );

      this.logger.log(
        `Loan ${loan._id}: nodeMatch ${existingNodeMatch}→${finalNodeMatch}, ` +
          `investedNotes=${finalInvestedNotes}, totalClaimed=${newTotalClaimed}/${totalLoanNotes}, ` +
          `matchPercentage=${newMatchPercentage}%, isFullMatch=${newIsFullMatch}`,
      );

      matchResults.push({
        loanId: String(loan._id),
        nodeMatch: nodesToMatch,
        matchPercentage: newMatchPercentage,
        isFullMatch: newIsFullMatch,
      });

      // ── Blockchain: ghi Matching Event ──
      try {
        const fabric = this.getFabricService();
        if (fabric) {
          const eventId = `MATCH_${order._id}_${loan._id}_${Date.now()}`;
          await fabric.submitTransaction('createMatchingEvent', eventId, JSON.stringify({
            investmentOrderId: `ORDER_${order._id}`,
            loanApplicationId: String(loan._id),
            direction: 'order_to_loan',
            nodesMatched: nodesToMatch,
            amountMatched: matchedAmount,
            loanNodeMatchBefore: existingNodeMatch,
            loanNodeMatchAfter: finalNodeMatch,
            loanTotalNodes: totalLoanNotes,
            loanMatchPercentage: newMatchPercentage,
            isLoanFullMatch: newIsFullMatch,
            orderMatchedNodesBefore: updatedOrder.matchedNodes - nodesToMatch,
            orderMatchedNodesAfter: updatedOrder.matchedNodes,
            orderTotalNodes: updatedOrder.totalNodes,
            isOrderClosed: updatedOrder.matchedNodes >= updatedOrder.totalNodes,
            lenderId,
            loanCapital: loan.capital,
            loanRate: loan.monthlyRatePercent,
            loanPeriod: loan.periodMonth,
          }));
          this.logger.log(`[Blockchain] ✅ MatchingEvent ${eventId}: ${nodesToMatch} nodes → loan ${loan._id}`);
        }
      } catch (bcErr: any) {
        this.logger.warn(`[Blockchain] Failed to create MatchingEvent: ${bcErr?.message}`);
      }

      // Kiểm tra order đã đầy chưa dựa trên dữ liệu THỰC TẾ sau atomic update
      const isOrderFull = updatedOrder.matchedNodes >= updatedOrder.totalNodes;
      if (isOrderFull && updatedOrder.status !== 'closed') {
        await this.investmentOrderModel.updateOne(
          { _id: order._id, matchedNodes: { $gte: updatedOrder.totalNodes } },
          { $set: { status: 'closed' } },
        );
        this.logger.log(`Order ${order._id} closed: matchedNodes=${updatedOrder.matchedNodes} >= totalNodes=${updatedOrder.totalNodes}`);

        // ── Blockchain: ghi Order closed ──
        try {
          const fabric = this.getFabricService();
          if (fabric) {
            await fabric.submitTransaction('updateInvestmentOrder', `ORDER_${order._id}`, 'closed', JSON.stringify({
              matchedNodes: updatedOrder.matchedNodes,
              matchedCapital: updatedOrder.matchedCapital,
            }));
            this.logger.log(`[Blockchain] ✅ InvestmentOrder ORDER_${order._id} → closed`);
          }
        } catch (bcErr: any) {
          this.logger.warn(`[Blockchain] Failed to close InvestmentOrder: ${bcErr?.message}`);
        }
      }

      if (isOrderFull) {
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

  async getAvailableLoans(
    query: {
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
    } = {},
  ) {
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
      // Guard: chỉ hiện khoản vay còn slot khả dụng (nodeMatch + investedNotes < totalNotes)
      $expr: {
        $lt: [
          { $add: [{ $ifNull: ['$investedNotes', 0] }, { $ifNull: ['$nodeMatch', 0] }] },
          { $max: ['$totalNotes', { $ceil: { $divide: ['$capital', this.matchingService.unitPrice] } }] },
        ],
      },
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

    this.logger.log(`[getAvailableLoans] filter: ${JSON.stringify(filters)}`);

    const [totalCount, loans] = await Promise.all([
      this.loanModel.countDocuments(filters),
      this.loanModel
        .find(filters)
        .select(
          '-documents -repaymentHistory -transactions -repaymentSchedule -charges -collateral -guarantors -delinquencyActions -delinquencyTags -installmentLevelDelinquency -delinquencyTag',
        )
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
    ]);

    this.logger.log(
      `[getAvailableLoans] Lấy được ${loans.length} khoản vay: ` +
        JSON.stringify(
          loans.map(l => ({
            id: l._id,
            status: l.status,
            capital: l.capital,
            totalNotes: l.totalNotes,
            investedNotes: (l as any).investedNotes,
            nodeMatch: (l as any).nodeMatch,
          })),
        ),
    );

    const baseUnitPrice = this.configService.get<number>('invest.baseUnitPrice') || 500_000;

    // ── Enrich: cảnh báo nợ xấu cho nhà đầu tư (Nhóm 2+) ──
    const borrowerIds = [...new Set(loans.map(l => l.userId?.toString()).filter(Boolean))];
    const delinquencyDocs = borrowerIds.length
      ? await this.loanDelinquencyModel
          .find({
            borrowerId: { $in: borrowerIds.map(id => new Types.ObjectId(id)) },
            status: { $in: ['overdue', 'defaulted'] },
            debtGroup: { $gte: 2 },
            isDeleted: { $ne: true },
          })
          .select('borrowerId debtGroup overdueAmount delinquentDays')
          .lean()
      : [];
    const delinquencyMap = new Map<string, { debtGroup: number; overdueAmount: number; delinquentDays: number }>();
    for (const d of delinquencyDocs) {
      const key = d.borrowerId.toString();
      const existing = delinquencyMap.get(key);
      if (!existing || d.debtGroup > existing.debtGroup) {
        delinquencyMap.set(key, {
          debtGroup: d.debtGroup,
          overdueAmount: d.overdueAmount,
          delinquentDays: d.delinquentDays,
        });
      }
    }

    // ── Resolve FD product interest rates ──
    // Build map: loanProductId → FD annual interest rate
    const fdRateMap = await this.buildFDRateMap(loans);

    // ── Borrower contract verification snapshot (SmartCA) ──
    const loanIds = loans.map(l => l._id).filter(Boolean);
    const loanContractModel = this.connection.model('LoanContract');
    const loanContracts = loanIds.length
      ? await loanContractModel
          .find({ loanId: { $in: loanIds } })
          .select('loanId contractId status signedAt smartCASignatureVerified signatureProvider')
          .lean()
      : [];
    const contractByLoanId = new Map<string, any>(loanContracts.map((c: any) => [String(c.loanId), c]));

    // Enrich with investment progress (like HD-AMC)
    const safeLoans = loans.map(loan => {
      const obj = { ...loan } as any;

      const loanContract = contractByLoanId.get(String(obj._id));
      if (loanContract) {
        const borrowerSignedVerified = Boolean(
          loanContract.smartCASignatureVerified ||
          (loanContract.signatureProvider === 'vnpt_smartca' &&
            ['signed', 'active'].includes(String(loanContract.status || ''))),
        );
        (obj as any).borrowerContractId = loanContract.contractId;
        (obj as any).borrowerContractStatus = loanContract.status;
        (obj as any).borrowerSignedVerified = borrowerSignedVerified;
        (obj as any).borrowerSignedAt = loanContract.signedAt || null;
      }

      // ── Cảnh báo nợ xấu cho nhà đầu tư ──
      const borrowerId = (obj as any).userId?.toString();
      const delinquency = borrowerId ? delinquencyMap.get(borrowerId) : null;
      if (delinquency) {
        (obj as any).borrowerDelinquencyWarning = {
          debtGroup: delinquency.debtGroup,
          overdueAmount: delinquency.overdueAmount,
          delinquentDays: delinquency.delinquentDays,
          message: `Cảnh báo: Người vay đang có khoản nợ quá hạn ${delinquency.delinquentDays} ngày (Nhóm nợ ${delinquency.debtGroup}). Dư nợ quá hạn: ${delinquency.overdueAmount?.toLocaleString('vi-VN')} đ.`,
        };
      }

      delete (obj as any).userId;
      delete (obj as any).disbursementWalletId;
      delete (obj as any).fineractLoanId;
      delete (obj as any).clientDisplayName;

      // ── FD interest rate (what investor earns) ──
      const loanProductId = (obj as any).productId;
      const fdRate = fdRateMap.get(loanProductId);
      if (fdRate !== undefined) {
        (obj as any).fdInterestRate = fdRate; // % năm (e.g. 18)
        (obj as any).fdMonthlyRate = +(fdRate / 12).toFixed(2); // % tháng (e.g. 1.5)
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
      const computedTotalNotes =
        (obj as any).totalNotes > 0 ? (obj as any).totalNotes : Math.ceil((obj as any).capital / baseUnitPrice);
      (obj as any).totalNotes = computedTotalNotes;

      // Ensure nodeMatch + investedNotes fields
      const nodeMatch = (obj as any).nodeMatch || 0;
      const investedNotes = (obj as any).investedNotes || 0;
      const totalClaimed = nodeMatch + investedNotes;
      const availableNotes = Math.max(0, computedTotalNotes - totalClaimed);

      (obj as any).nodeMatch = nodeMatch;
      (obj as any).investedNotes = investedNotes;
      (obj as any).availableNotes = availableNotes;
      (obj as any).investedPercent = computedTotalNotes > 0 ? Math.round((totalClaimed / computedTotalNotes) * 100) : 0;

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
      const uniqueProductIds = [...new Set(loans.map(l => l.productId as number).filter(Boolean))];

      // 4. For each loan product, get shortName from Fineract and match (parallel)
      const loanProdResults = await Promise.all(
        uniqueProductIds.map(pid => fdClient.get(`/loanproducts/${pid}`).catch(() => null)),
      );
      for (let i = 0; i < uniqueProductIds.length; i++) {
        const loanProd = loanProdResults[i];
        if (!loanProd) continue;
        const sn = (loanProd.data?.shortName || '').toUpperCase().trim();
        if (sn && shortNameToFDRate.has(sn)) {
          map.set(uniqueProductIds[i], shortNameToFDRate.get(sn)!);
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

  async getOrdersByLender(
    lenderId: string,
    query: {
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: string;
      status?: string;
    } = {},
  ) {
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
      this.investmentOrderModel.find(filters).sort(sort).skip(skip).limit(pageSize).lean().exec(),
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

    await this.releaseUnusedNodes(order);
    await this.investmentOrderModel.findByIdAndDelete(orderId);
  }

  async closeOrder(orderId: string, userId: string): Promise<InvestmentOrder> {
    const order = await this.investmentOrderModel.findById(orderId);
    if (!order) throw new NotFoundException('Không tìm thấy lệnh đầu tư');
    if (String(order.lenderId) !== userId) throw new ForbiddenException('Không có quyền');

    await this.releaseUnusedNodes(order);
    order.status = 'closed';
    return order.save();
  }

  /** Giải phóng các node giữ chỗ chưa thanh toán để kho khôi phục lại khả năng huy động */
  private async releaseUnusedNodes(order: InvestmentOrder) {
    if (!order.loans || order.loans.length === 0) return;

    for (const loanInfo of order.loans) {
      if (!loanInfo.isInvested && loanInfo.nodeMatch > 0) {
        // Hoàn trả nodeMatch lại cho Khoản Vay
        const updatedLoan = await this.loanModel.findByIdAndUpdate(
          loanInfo.loanId,
          { $inc: { nodeMatch: -loanInfo.nodeMatch } },
          { new: true },
        );

        if (updatedLoan) {
          // Tính toán lại các phần trăm dựa trên capacity thực tế
          const totalClaimed = (updatedLoan as any).investedNotes + ((updatedLoan as any).nodeMatch || 0);
          const newMatchPercentage = Math.min(100, Math.round((totalClaimed / updatedLoan.totalNotes) * 100));
          const isFullMatch = (updatedLoan as any).investedNotes >= updatedLoan.totalNotes;

          await this.loanModel.updateOne(
            { _id: updatedLoan._id },
            { $set: { isFullMatch, matchPercentage: newMatchPercentage } },
          );

          this.logger.log(
            `Released ${loanInfo.nodeMatch} nodes from Loan ${loanInfo.loanId} due to Order ${order._id} cancellation`,
          );
        }
      }
    }
  }

  async fixIsFullMatch() {
    const loans = await this.loanModel.find({ isFullMatch: true }).lean().exec();
    let fixCount = 0;
    for (const loan of loans) {
      const totalNotes = loan.totalNotes || Math.ceil((loan.capital || 0) / 500000);
      const investedNotes = (loan as any).investedNotes || 0;
      if (investedNotes < totalNotes) {
        await this.loanModel.updateOne({ _id: loan._id }, { $set: { isFullMatch: false } });
        fixCount++;
      }
    }
    return { success: true, fixed: fixCount };
  }
}
