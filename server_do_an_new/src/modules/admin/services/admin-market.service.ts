/**
 * AdminMarketService — P2P Market Dashboard data
 * ──────────────────────────────────────────────────────────
 * Cung cấp 6 query cho Market Dashboard (admin):
 *  1. getStats()        — tổng quan thống kê
 *  2. getAsks(params)   — hồ sơ vay đang chờ khớp (live)
 *  3. getBids(params)   — lệnh đầu tư đang mở (live)
 *  4. getTape(params)   — lịch sử khớp lệnh gần đây
 *  5. getMatchedAsks()  — hồ sơ vay đã khớp 100%
 *  6. getMatchedBids()  — lệnh đầu tư đã đóng (khớp hết)
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';

import { LoanApplication } from '../../loan/schemas/loan-application.schema';
import { InvestmentOrder } from '../../invest/schemas/investment-order.schema';
import { InvestmentContract } from '../../invest/schemas/investment-contract.schema';
import { User } from '../../users/schemas/user.schema';

// ── Types ─────────────────────────────────────────────────

export interface MarketQueryParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
  q?: string;
}

export interface PaginationMeta {
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}

export interface MarketStats {
  totalMatched: number;
  availableInvestment: number;
  pendingLoans: number;
  pendingLoansCount: number;
  activeOrders: number;
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class AdminMarketService {
  private readonly logger = new Logger(AdminMarketService.name);
  private readonly baseUnitPrice: number;

  constructor(
    @InjectModel(LoanApplication.name) private readonly loanModel: Model<LoanApplication>,
    @InjectModel(InvestmentOrder.name) private readonly orderModel: Model<InvestmentOrder>,
    @InjectModel(InvestmentContract.name) private readonly contractModel: Model<InvestmentContract>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly configService: ConfigService,
  ) {
    this.baseUnitPrice = this.configService.get<number>('invest.baseUnitPrice') || 500_000;
  }

  // ═══════════════════════════════════════════════════════
  //  1. STATS
  // ═══════════════════════════════════════════════════════

  async getStats(): Promise<MarketStats> {
    // Tổng vốn đã khớp thành công (từ contracts)
    const matchedAgg = await this.contractModel.aggregate([
      { $match: { status: { $in: ['active', 'matured', 'closed', 'pending_signature'] } } },
      { $group: { _id: null, total: { $sum: '$capital' } } },
    ]);
    const totalMatched = matchedAgg[0]?.total || 0;

    // Vốn đầu tư sẵn sàng (orders mở, tính phần chưa match)
    const availableAgg = await this.orderModel.aggregate([
      { $match: { $expr: { $lt: [{ $ifNull: ['$matchedNodes', 0] }, { $ifNull: ['$totalNodes', 1] }] } } },
      {
        $group: {
          _id: null,
          total: { $sum: { $multiply: [{ $subtract: [{ $ifNull: ['$totalNodes', 1] }, { $ifNull: ['$matchedNodes', 0] }] }, this.baseUnitPrice] } },
        },
      },
    ]);
    const availableInvestment = availableAgg[0]?.total || 0;

    // Vốn vay chờ khớp
    const pendingAgg = await this.loanModel.aggregate([
      { $match: { status: 'approved', isFullMatch: false } },
      { $group: { _id: null, total: { $sum: '$capital' }, count: { $sum: 1 } } },
    ]);
    const pendingLoans = pendingAgg[0]?.total || 0;
    const pendingLoansCount = pendingAgg[0]?.count || 0;

    // Lệnh hoạt động (asks chưa full + bids mở)
    const activeAsks = await this.loanModel.countDocuments({
      status: 'approved',
      isFullMatch: false,
    });
    const activeBids = await this.orderModel.countDocuments({
      $expr: { $lt: [{ $ifNull: ['$matchedNodes', 0] }, { $ifNull: ['$totalNodes', 1] }] }
    });

    return {
      totalMatched,
      availableInvestment,
      pendingLoans,
      pendingLoansCount,
      activeOrders: activeAsks + activeBids,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  2. ASKS — Khoản vay đang chờ khớp (Live)
  // ═══════════════════════════════════════════════════════

  async getAsks(params: MarketQueryParams = {}) {
    const { page = 1, pageSize = 15, sortBy = 'createdAt', order = 'desc', q } = params;

    const filter: any = {
      status: 'approved',
      isFullMatch: { $ne: true },
      $expr: {
        $lt: [
          { $add: [{ $ifNull: ['$investedNotes', 0] }, { $ifNull: ['$nodeMatch', 0] }] },
          { $ifNull: ['$totalNotes', { $ceil: { $divide: ['$capital', 500000] } }] }
        ]
      }
    };

    if (q) {
      filter.$or = [
        { fineractLoanId: !isNaN(Number(q)) ? Number(q) : -1 },
        { willing: { $regex: q, $options: 'i' } },
      ];
    }

    const totalCount = await this.loanModel.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / pageSize);

    const sortObj: any = {};
    sortObj[sortBy] = order === 'asc' ? 1 : -1;

    const loans = await this.loanModel
      .find(filter)
      .populate('userId', 'username profile phoneNumber')
      .sort(sortObj)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    const asks = loans.map((loan: any) => ({
      id: loan._id,
      loanCode: loan.fineractLoanId ? `LOAN_${loan.fineractLoanId}` : `LA_${String(loan._id).slice(-6)}`,
      fineractLoanId: loan.fineractLoanId || null,
      rate: loan.monthlyRatePercent || 0,
      capital: loan.capital || 0,
      period: loan.periodMonth || 0,
      purpose: loan.willing || '',
      matchPercent: loan.matchPercentage || 0,
      remainingNodes: Math.max(0, (loan.totalNotes || 0) - (loan.investedNotes || 0) - (loan.nodeMatch || 0)),
      phone: loan.userId?.phoneNumber || loan.userId?.username || null,
      createdAt: loan.createdAt,
    }));

    return {
      asks,
      pagination: { totalCount, totalPages, currentPage: page, pageSize } as PaginationMeta,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  3. BIDS — Lệnh đầu tư đang mở (Live)
  // ═══════════════════════════════════════════════════════

  async getBids(params: MarketQueryParams = {}) {
    const { page = 1, pageSize = 15, sortBy = 'createdAt', order = 'desc', q } = params;

    const filter: any = {
      $expr: { $lt: [{ $ifNull: ['$matchedNodes', 0] }, { $ifNull: ['$totalNodes', 1] }] }
    };

    if (q) {
      // Tìm user trước theo keyword
      const users = await this.userModel
        .find({
          $or: [
            { username: { $regex: q, $options: 'i' } },
            { phoneNumber: { $regex: q, $options: 'i' } },
          ],
        })
        .select('_id')
        .lean();
      if (users.length > 0) {
        filter.lenderId = { $in: users.map((u: any) => u._id) };
      } else {
        // Không khớp user → trả rỗng
        return {
          bids: [],
          pagination: { totalCount: 0, totalPages: 0, currentPage: page, pageSize } as PaginationMeta,
        };
      }
    }

    const totalCount = await this.orderModel.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / pageSize);

    const sortObj: any = {};
    sortObj[sortBy] = order === 'asc' ? 1 : -1;

    const orders = await this.orderModel
      .find(filter)
      .populate('lenderId', 'username profile phoneNumber')
      .sort(sortObj)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    const bids = orders.map((order: any) => {
      const availableNodes = Math.max(0, (order.totalNodes || 0) - (order.matchedNodes || 0));
      return {
        id: order._id,
        investorCode: order.lenderId?.username || `INV_${String(order._id).slice(-6)}`,
        phone: order.lenderId?.phoneNumber || null,
        maxRate: order.interestRange?.max || 0,
        minRate: order.interestRange?.min || 0,
        availableCapital: availableNodes * this.baseUnitPrice,
        totalCapital: order.capital || 0,
        matchedCapital: order.matchedCapital || 0,
        remainingNodes: availableNodes,
        purpose: order.purpose || [],
        period: order.periodRange || { min: 0, max: 0 },
        createdAt: order.createdAt,
      };
    });

    return {
      bids,
      pagination: { totalCount, totalPages, currentPage: page, pageSize } as PaginationMeta,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  4. TAPE — Lịch sử khớp lệnh (Live)
  // ═══════════════════════════════════════════════════════

  async getTape(params: MarketQueryParams = {}) {
    const { page = 1, pageSize = 15, sortBy = 'updatedAt', order = 'desc' } = params;

    // Lấy tất cả orders có loans[] không rỗng
    const ordersWithMatches = await this.orderModel
      .find({ 'loans.0': { $exists: true } })
      .populate('lenderId', 'username profile phoneNumber')
      .sort({ updatedAt: -1 })
      .lean();

    // Flatten tất cả matched loans
    const allEntries: any[] = [];
    for (const order of ordersWithMatches) {
      const lender = order.lenderId as any;
      for (const matchedLoan of order.loans || []) {
        allEntries.push({
          roomId: String(order._id),
          investorCode: lender?.username || `INV_${String(order._id).slice(-6)}`,
          loanId: matchedLoan.loanId,
          nodeMatch: matchedLoan.nodeMatch || 0,
          matchedAmount: (matchedLoan.nodeMatch || 0) * this.baseUnitPrice,
          isInvested: matchedLoan.isInvested || false,
          matchedAt: matchedLoan.matchedAt,
          interestMax: order.interestRange?.max || 0,
        });
      }
    }

    // Sort
    allEntries.sort((a, b) => {
      const dateA = new Date(a.matchedAt).getTime();
      const dateB = new Date(b.matchedAt).getTime();
      return order === 'desc' ? dateB - dateA : dateA - dateB;
    });

    const totalCount = allEntries.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const paged = allEntries.slice((page - 1) * pageSize, page * pageSize);

    // Enrich with loan info
    const loanIds = [...new Set(paged.map(e => e.loanId))];
    const loans = await this.loanModel
      .find({ _id: { $in: loanIds } })
      .select('_id fineractLoanId capital willing monthlyRatePercent')
      .lean();
    const loanMap = new Map(loans.map((l: any) => [String(l._id), l]));

    const tape = paged.map(entry => {
      const loan = loanMap.get(entry.loanId);
      return {
        ...entry,
        loanCode: loan?.fineractLoanId ? `LOAN_${loan.fineractLoanId}` : `LA_${entry.loanId.slice(-6)}`,
        fineractLoanId: loan?.fineractLoanId || null,
      };
    });

    return {
      tape,
      pagination: { totalCount, totalPages, currentPage: page, pageSize } as PaginationMeta,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  5. MATCHED ASKS — Hồ sơ vay đã khớp 100%
  // ═══════════════════════════════════════════════════════

  async getMatchedAsks(params: MarketQueryParams = {}) {
    const { page = 1, pageSize = 15, sortBy = 'updatedAt', order = 'desc', q } = params;

    const filter: any = {
      status: { $in: ['approved', 'disbursed'] },
      $or: [
        { isFullMatch: true },
        {
          $expr: {
            $gte: [
              { $add: [{ $ifNull: ['$investedNotes', 0] }, { $ifNull: ['$nodeMatch', 0] }] },
              { $ifNull: ['$totalNotes', { $ceil: { $divide: ['$capital', 500000] } }] }
            ]
          }
        }
      ]
    };

    if (q) {
      filter.$or = [
        { fineractLoanId: !isNaN(Number(q)) ? Number(q) : -1 },
        { willing: { $regex: q, $options: 'i' } },
      ];
    }

    const totalCount = await this.loanModel.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / pageSize);

    const sortObj: any = {};
    sortObj[sortBy] = order === 'asc' ? 1 : -1;

    const loans = await this.loanModel
      .find(filter)
      .sort(sortObj)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    const asks = loans.map((loan: any) => ({
      id: loan._id,
      loanCode: loan.fineractLoanId ? `LOAN_${loan.fineractLoanId}` : `LA_${String(loan._id).slice(-6)}`,
      fineractLoanId: loan.fineractLoanId || null,
      rate: loan.monthlyRatePercent || 0,
      capital: loan.capital || 0,
      period: loan.periodMonth || 0,
      status: loan.status || 'approved',
      fineractStatus: loan.fineractStatusString || null,
      matchedAt: loan.updatedAt,
    }));

    return {
      asks,
      pagination: { totalCount, totalPages, currentPage: page, pageSize } as PaginationMeta,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  6. MATCHED BIDS — Lệnh đầu tư đã đóng (khớp đủ)
  // ═══════════════════════════════════════════════════════

  async getMatchedBids(params: MarketQueryParams = {}) {
    const { page = 1, pageSize = 15, sortBy = 'updatedAt', order = 'desc', q } = params;

    // Trigger NestJS hot-reload 3
    const filter: any = {
      $expr: { $gte: [{ $ifNull: ['$matchedNodes', 0] }, { $ifNull: ['$totalNodes', 1] }] }
    };

    if (q) {
      const users = await this.userModel
        .find({
          $or: [
            { username: { $regex: q, $options: 'i' } },
            { phoneNumber: { $regex: q, $options: 'i' } },
          ],
        })
        .select('_id')
        .lean();
      if (users.length > 0) {
        filter.lenderId = { $in: users.map((u: any) => u._id) };
      } else {
        return {
          bids: [],
          pagination: { totalCount: 0, totalPages: 0, currentPage: page, pageSize } as PaginationMeta,
        };
      }
    }

    const totalCount = await this.orderModel.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / pageSize);

    const sortObj: any = {};
    sortObj[sortBy] = order === 'asc' ? 1 : -1;

    const orders = await this.orderModel
      .find(filter)
      .populate('lenderId', 'username profile phoneNumber')
      .sort(sortObj)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    const bids = orders.map((order: any) => ({
      id: order._id,
      investorCode: order.lenderId?.username || `INV_${String(order._id).slice(-6)}`,
      phone: order.lenderId?.phoneNumber || null,
      totalCapital: order.capital || 0,
      matchedCapital: order.matchedCapital || 0,
      rate: order.interestRange?.max || 0,
      nodes: `${order.matchedNodes || 0}/${order.totalNodes || 0}`,
      matchedAt: order.updatedAt,
    }));

    return {
      bids,
      pagination: { totalCount, totalPages, currentPage: page, pageSize } as PaginationMeta,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  7. BID DETAIL
  // ════════════════════════════════════════────────────────
  async getBidDetail(id: string) {
    const order = await this.orderModel
      .findById(id)
      .populate('lenderId', 'username profile phoneNumber email')
      .lean();

    if (!order) {
      throw new Error('Lệnh đầu tư không tồn tại');
    }

    // Enrich matched loans with LoanApplication info
    const enrichedLoans = await Promise.all(
      (order.loans || []).map(async (item: any) => {
        const loan = await this.loanModel
          .findById(item.loanId)
          .select('fineractLoanId capital willing monthlyRatePercent periodMonth status isFullMatch createdAt')
          .lean();

        return {
          ...item,
          loanCode: loan?.fineractLoanId ? `LOAN_${loan.fineractLoanId}` : `LA_${String(item.loanId).slice(-6)}`,
          fineractLoanId: loan?.fineractLoanId || null,
          loanCapital: loan?.capital || 0,
          loanPurpose: loan?.willing || '',
          loanRate: loan?.monthlyRatePercent || 0,
          loanPeriod: loan?.periodMonth || 0,
          loanStatus: loan?.status || 'approved',
          loanIsFullMatch: loan?.isFullMatch || false,
          loanCreatedAt: (loan as any)?.createdAt,
        };
      }),
    );

    const availableNodes = Math.max(0, (order.totalNodes || 0) - (order.matchedNodes || 0));

    return {
      id: order._id,
      investor: {
        id: order.lenderId?._id,
        username: (order.lenderId as any)?.username,
        displayName: (order.lenderId as any)?.profile?.firstName
          ? `${(order.lenderId as any).profile.firstName} ${(order.lenderId as any).profile.lastName}`
          : (order.lenderId as any)?.username,
        phone: (order.lenderId as any)?.phoneNumber,
        email: (order.lenderId as any)?.email,
      },
      config: {
        totalCapital: order.capital,
        maxCapitalPerLoan: order.maxCapital,
        totalNodes: order.totalNodes,
        matchedNodes: order.matchedNodes,
        availableNodes,
        matchedCapital: order.matchedCapital,
        availableCapital: availableNodes * this.baseUnitPrice,
        interestRange: order.interestRange,
        periodRange: order.periodRange,
        purpose: order.purpose || [],
        status: order.status,
        createdAt: (order as any).createdAt,
      },
      matchedLoans: enrichedLoans,
    };
  }
}
