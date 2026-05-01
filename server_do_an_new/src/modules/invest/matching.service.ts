/**
 * MatchingService — Consolidated matching engine
 * ──────────────────────────────────────────────────────────
 * Gộp logic từ 2 file HD-AMC (matchingService.js + WaitingRoomService.js)
 * thành 1 Injectable NestJS service, type-safe, DRY.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { InvestmentOrder } from './schemas/investment-order.schema';
import { LoanApplication } from '../loan/schemas/loan-application.schema';

// ── Types ─────────────────────────────────────────────────
export interface LoanMatchData {
  loanId: string;
  capital: number;
  rate: number;
  periodMonth: number;
  purpose: string;
  existingNodeMatch?: number;
  existingInvestedNotes?: number;
}

export interface MatchResult {
  success: boolean;
  nodeMatch: number;
  matchedAmount: number;
  matchPercentage: number;
  isFullMatch: boolean;
  investmentOrderId?: string;
  message: string;
}

export interface SequentialMatchResult extends MatchResult {
  investmentOrderIds: string[];
  ordersCount: number;
}

// ── Service ───────────────────────────────────────────────
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);
  private readonly baseUnitPrice: number;

  constructor(
    @InjectModel(InvestmentOrder.name) private readonly investmentOrderModel: Model<InvestmentOrder>,
    @InjectModel(LoanApplication.name) private readonly loanModel: Model<LoanApplication>,
    private readonly configService: ConfigService,
  ) {
    this.baseUnitPrice = this.configService.get<number>('invest.baseUnitPrice') || 500_000;
  }

  // ═══════════════════════════════════════════════════════
  //  NLP UTILITIES
  // ═══════════════════════════════════════════════════════

  /** Chuẩn hóa chuỗi tiếng Việt: bỏ dấu, chữ thường, loại ký tự đặc biệt */
  normalizeVietnamese(str: string): string {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Tách thành tokens (>= 2 ký tự, chứa chữ cái) */
  tokenize(normalized: string): string[] {
    if (!normalized) return [];
    return normalized.split(' ').filter(w => w.length >= 2 && /[a-z]/.test(w));
  }

  /** Tạo bigrams (cặp 2 từ liên tiếp) */
  getBigrams(tokens: string[]): string[] {
    const result: string[] = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      result.push(`${tokens[i]} ${tokens[i + 1]}`);
    }
    return result;
  }

  /** Tính number of nodes */
  calculateNodes(amount: number): number {
    return Math.ceil(amount / this.baseUnitPrice);
  }

  get unitPrice(): number {
    return this.baseUnitPrice;
  }

  // ═══════════════════════════════════════════════════════
  //  PURPOSE MATCHING
  // ═══════════════════════════════════════════════════════

  /**
   * Kiểm tra loan purpose có khớp với order purposes không.
   * Dùng token overlap + bigram overlap scoring.
   * @returns score >= 70 nếu match, 0 nếu không
   */
  scorePurposeMatch(loanPurpose: string, orderPurposes: string[]): number {
    const normalizedLoan = this.normalizeVietnamese(loanPurpose);
    const loanTokens = this.tokenize(normalizedLoan);
    const loanBigrams = this.getBigrams(loanTokens);

    let highestScore = 0;

    for (const rp of orderPurposes) {
      const normalizedOrder = this.normalizeVietnamese(rp);
      const orderTokens = this.tokenize(normalizedOrder);
      const orderBigrams = this.getBigrams(orderTokens);

      const tokenOverlap = loanTokens.filter(t => orderTokens.includes(t));
      const bigramOverlap = loanBigrams.filter(b => orderBigrams.includes(b));

      const isShortOrderMatch =
        orderTokens.length > 0 &&
        orderTokens.length <= 2 &&
        orderTokens.every(rt => loanTokens.includes(rt));

      const pass =
        tokenOverlap.length >= 2 ||
        bigramOverlap.length >= 1 ||
        isShortOrderMatch;

      if (!pass) continue;

      const score = bigramOverlap.length >= 1 ? 90 : 70;
      if (score > highestScore) highestScore = score;
    }

    return highestScore;
  }

  /** Boolean convenience */
  checkPurposeMatch(loanPurpose: string, orderPurposes: string[]): boolean {
    return this.scorePurposeMatch(loanPurpose, orderPurposes) >= 70;
  }

  // ═══════════════════════════════════════════════════════
  //  FIND MATCHING ORDERS
  // ═══════════════════════════════════════════════════════

  async findMatchingOrders(loanData: LoanMatchData): Promise<InvestmentOrder[]> {
    this.logger.log(`[findMatchingOrders] loanData: rate=${loanData.rate}, period=${loanData.periodMonth}, purpose="${loanData.purpose}"`);
    
    const orders = await this.investmentOrderModel
      .find({
        status: 'open',
        $expr: { $lt: [{ $ifNull: ['$matchedNodes', 0] }, { $ifNull: ['$totalNodes', 1] }] },
      })
      .sort({ createdAt: 1 }) // FIFO
      .exec();

    this.logger.log(`[findMatchingOrders] Found ${orders.length} open orders with available nodes before filters.`);

    const matchingOrders: InvestmentOrder[] = [];
    for (const order of orders) {
      const minRate = order.interestRange?.min || 0;
      const maxRate = order.interestRange?.max || 100;
      const minPeriod = order.periodRange?.min || 0;
      const maxPeriod = order.periodRange?.max || 120;

      const rateMatch = loanData.rate >= minRate && loanData.rate <= maxRate;
      const periodMatch = loanData.periodMonth >= minPeriod && loanData.periodMonth <= maxPeriod;
      
      const purposes = Array.isArray(order.purpose) ? order.purpose : [];
      const purposeMatch = purposes.length > 0 ? this.checkPurposeMatch(loanData.purpose, purposes) : false;

      this.logger.log(
        `Order ${order._id} - rateMatch: ${rateMatch} (${minRate}-${maxRate} vs ${loanData.rate}), ` +
        `periodMatch: ${periodMatch} (${minPeriod}-${maxPeriod} vs ${loanData.periodMonth}), ` +
        `purposeMatch: ${purposeMatch} ("${loanData.purpose}" vs [${purposes.join(',')}])`
      );

      if (rateMatch && periodMatch && purposeMatch) {
        matchingOrders.push(order);
      }
    }
    
    return matchingOrders;
  }

  // ═══════════════════════════════════════════════════════
  //  PROCESS SINGLE MATCH (ATOMIC)
  // ═══════════════════════════════════════════════════════

  /** Ghép 1 loan với 1 order bằng atomic findOneAndUpdate */
  async processMatch(order: InvestmentOrder, loanData: LoanMatchData): Promise<MatchResult> {
    const totalLoanNodes = this.calculateNodes(loanData.capital);
    const existingClaimed = (loanData.existingNodeMatch || 0) + (loanData.existingInvestedNotes || 0);
    const loanNeedsNodes = Math.max(0, totalLoanNodes - existingClaimed);
    const availableNodes = order.totalNodes - order.matchedNodes;

    const maxNodesByCapital = order.maxCapital
      ? Math.floor(order.maxCapital / this.baseUnitPrice)
      : availableNodes;

    const nodesToMatch = Math.min(loanNeedsNodes, availableNodes, maxNodesByCapital);

    if (nodesToMatch <= 0) {
      return { success: false, nodeMatch: 0, matchedAmount: 0, matchPercentage: 0, isFullMatch: false, message: 'Không còn node khả dụng' };
    }

    // Guard: nodeMatch không được vượt giới hạn (học từ HD-AMC P2P)
    const maxAllowedNodeMatch = totalLoanNodes - (loanData.existingInvestedNotes || 0);
    const pendingNewNodeMatch = (loanData.existingNodeMatch || 0) + nodesToMatch;
    if (pendingNewNodeMatch > maxAllowedNodeMatch) {
      this.logger.warn(`nodeMatch (${pendingNewNodeMatch}) exceeds limit (${maxAllowedNodeMatch}) for loan ${loanData.loanId}`);
      return { success: false, nodeMatch: 0, matchedAmount: 0, matchPercentage: 0, isFullMatch: false, message: 'nodeMatch sẽ vượt giới hạn' };
    }

    // Atomic update — KHÔNG pre-calculate willBeFull vì order.matchedNodes có thể stale
    const updateOp: any = {
      $inc: {
        matchedNodes: nodesToMatch,
        matchedCapital: nodesToMatch * this.baseUnitPrice,
      },
      $push: {
        loans: {
          loanId: loanData.loanId,
          nodeMatch: nodesToMatch,
          isInvested: false,
          matchedAt: new Date(),
        },
      },
      $set: { updatedAt: new Date() },
    };

    const result = await this.investmentOrderModel.findOneAndUpdate(
      {
        _id: order._id,
        $expr: { $gte: [{ $subtract: ['$totalNodes', '$matchedNodes'] }, nodesToMatch] },
      },
      updateOp,
      { new: true, runValidators: true },
    );

    if (!result) {
      this.logger.warn(`Atomic update failed for order ${order._id} — race condition detected`);
      return { success: false, nodeMatch: 0, matchedAmount: 0, matchPercentage: 0, isFullMatch: false, message: 'Race condition — thử lại' };
    }

    // Kiểm tra willBeFull dựa trên dữ liệu THỰC TẾ sau khi atomic update (không dùng giá trị stale)
    const actualMatchedNodes = result.matchedNodes;
    const actualTotalNodes = result.totalNodes;
    if (actualMatchedNodes >= actualTotalNodes && result.status !== 'closed') {
      await this.investmentOrderModel.updateOne(
        { _id: order._id, matchedNodes: { $gte: actualTotalNodes } },
        { $set: { status: 'closed' } },
      );
      this.logger.log(`Order ${order._id} closed: matchedNodes=${actualMatchedNodes} >= totalNodes=${actualTotalNodes}`);
    }

    const matchedAmount = nodesToMatch * this.baseUnitPrice;

    const totalLoanNotesForLoan = this.calculateNodes(loanData.capital);
    
    // Atomic update cho loanModel để tránh over-reserving (race condition)
    const loanUpdateResult = await this.loanModel.findOneAndUpdate(
      {
        _id: loanData.loanId,
        $expr: {
          $gte: [
            '$totalNotes',
            { $add: [{ $ifNull: ['$investedNotes', 0] }, { $ifNull: ['$nodeMatch', 0] }, nodesToMatch] }
          ]
        }
      },
      {
        $inc: { nodeMatch: nodesToMatch }
      },
      { new: true }
    );

    if (!loanUpdateResult) {
      // Revert the order update if loan is full
      this.logger.warn(`Atomic lock on Loan ${loanData.loanId} failed for order ${order._id} — capacity exceeded. Reverting order.`);
      await this.investmentOrderModel.findByIdAndUpdate(order._id, {
         $inc: {
            matchedNodes: -nodesToMatch,
            matchedCapital: -(nodesToMatch * this.baseUnitPrice),
         },
         $pull: { loans: { loanId: loanData.loanId } },
         $set: { status: 'open' }
      });
      return { success: false, nodeMatch: 0, matchedAmount: 0, matchPercentage: 0, isFullMatch: false, message: 'Khoản vay đã đủ người giữ chỗ, thử lại sau' };
    }

    // Update derived fields after atomic increment
    const newTotalClaimed = (loanUpdateResult as any).investedNotes + ((loanUpdateResult as any).nodeMatch || 0);
    const newMatchPercentage = Math.min(100, Math.round((newTotalClaimed / loanUpdateResult.totalNotes) * 100));
    // CRITICAL: isFullMatch = TRUE CHỈ KHI tiền thật đã thanh toán (investedNotes) >= totalNotes
    const newIsFullMatch = (loanUpdateResult as any).investedNotes >= loanUpdateResult.totalNotes;

    await this.loanModel.updateOne(
      { _id: loanData.loanId },
      { $set: { isFullMatch: newIsFullMatch, matchPercentage: newMatchPercentage } }
    );

    return {
      success: true,
      nodeMatch: nodesToMatch,
      matchedAmount,
      matchPercentage: newMatchPercentage,
      isFullMatch: newIsFullMatch,
      investmentOrderId: String(result._id),
      message: `Ghép ${nodesToMatch} node = ${matchedAmount.toLocaleString()} VND`,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  SEQUENTIAL MATCHING (MULTI-ORDER)
  // ═══════════════════════════════════════════════════════

  /** Ghép tuần tự qua nhiều orders (FIFO). Cho phép partial match. */
  async performSequentialMatching(loanData: LoanMatchData): Promise<SequentialMatchResult> {
    const totalNotesRequired = this.calculateNodes(loanData.capital);
    let remainingNotes = totalNotesRequired;
    let aggregateNodeMatch = 0;
    let aggregateMatchedAmount = 0;
    const matchedOrderIds: string[] = [];

    const orders = await this.findMatchingOrders(loanData);
    this.logger.log(`Sequential matching: ${totalNotesRequired} nodes needed, found ${orders.length} orders`);

    for (const order of orders) {
      if (remainingNotes <= 0) break;

      const iterationData: LoanMatchData = {
        ...loanData,
        capital: remainingNotes * this.baseUnitPrice,
      };

      const result = await this.processMatch(order, iterationData);

      if (result.success && result.nodeMatch > 0) {
        aggregateNodeMatch += result.nodeMatch;
        aggregateMatchedAmount += result.matchedAmount;
        if (result.investmentOrderId && !matchedOrderIds.includes(result.investmentOrderId)) {
          matchedOrderIds.push(result.investmentOrderId);
        }
        remainingNotes = Math.max(0, remainingNotes - result.nodeMatch);
      }
    }

    const matchPercentage = totalNotesRequired > 0
      ? parseFloat(((aggregateNodeMatch / totalNotesRequired) * 100).toFixed(2))
      : 0;
    const isFullMatch = aggregateNodeMatch >= totalNotesRequired;

    return {
      success: aggregateNodeMatch > 0,
      nodeMatch: aggregateNodeMatch,
      matchedAmount: aggregateMatchedAmount,
      matchPercentage,
      isFullMatch,
      investmentOrderIds: matchedOrderIds,
      ordersCount: matchedOrderIds.length,
      message: isFullMatch
        ? 'Khoản vay đã ghép đủ'
        : aggregateNodeMatch > 0
          ? `Ghép một phần (${matchPercentage}%)`
          : 'Không tìm thấy lệnh đầu tư phù hợp',
    };
  }
}
