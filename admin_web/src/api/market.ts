/**
 * Market API — admin_web
 * Gọi API P2P Server để lấy dữ liệu Market Dashboard
 *
 * Server dùng TransformInterceptor wrap mọi response:
 * { success, statusCode, data: <controller_return>, message, timestamp }
 * → axios: r.data = { success, data, ... }
 * → r.data.data = controller return value
 */
import { api } from './client';

// ── Types ──

export interface MarketAsk {
  id: string;
  loanCode: string;
  fineractLoanId?: number | null;
  rate: number;
  capital: number;
  period: number;
  purpose: string;
  matchPercent: number;
  remainingNodes: number;
  phone?: string | null;
  createdAt: string;
}

export interface MatchedAsk {
  id: string;
  loanCode: string;
  fineractLoanId?: number | null;
  rate: number;
  capital: number;
  period: number;
  status: string;
  fineractStatus?: string | null;
  matchedAt: string;
}

export interface MarketBid {
  id: string;
  investorCode: string;
  phone: string | null;
  maxRate: number;
  minRate: number;
  availableCapital: number;
  totalCapital: number;
  matchedCapital: number;
  remainingNodes: number;
  purpose: string[];
  period: { min: number; max: number };
  createdAt: string;
}

export interface MatchedBid {
  id: string;
  investorCode: string;
  phone: string | null;
  totalCapital: number;
  matchedCapital: number;
  rate: number;
  nodes: string;
  matchedAt: string;
}

export interface MarketTapeEntry {
  roomId: string;
  investorCode: string;
  loanCode: string;
  fineractLoanId?: number | null;
  nodeMatch: number;
  matchedAmount: number;
  isInvested: boolean;
  interestMax: number;
  matchedAt: string;
}

export interface InvestmentOrderDetail {
  id: string;
  investor: {
    id: string;
    username: string;
    displayName: string;
    phone: string;
    email: string;
  };
  config: {
    totalCapital: number;
    maxCapitalPerLoan: number;
    totalNodes: number;
    matchedNodes: number;
    availableNodes: number;
    matchedCapital: number;
    availableCapital: number;
    interestRange: { min: number; max: number };
    periodRange: { min: number; max: number };
    purpose: string[];
    status: 'open' | 'closed';
    createdAt: string;
  };
  matchedLoans: Array<{
    loanId: string;
    nodeMatch: number;
    isInvested: boolean;
    matchedAt: string;
    loanCode: string;
    fineractLoanId: number | null;
    loanCapital: number;
    loanPurpose: string;
    loanRate: number;
    loanPeriod: number;
    loanStatus: string;
    loanIsFullMatch: boolean;
    loanCreatedAt: string;
  }>;
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

export interface MarketQueryParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
  q?: string;
}

// ── API ──
// TransformInterceptor wraps: { success, data: <controller_return>, ... }
// Controller returns { stats } → r.data.data = { stats }

export const marketApi = {
  getStats: (signal?: AbortSignal) =>
    api
      .get('/api/admin/market/stats', { signal })
      .then((r) => r.data.data.stats as MarketStats),

  getAsks: (params?: MarketQueryParams, signal?: AbortSignal) =>
    api
      .get('/api/admin/market/asks', { params, signal })
      .then((r) => r.data.data as { asks: MarketAsk[]; pagination: PaginationMeta }),

  getBids: (params?: MarketQueryParams, signal?: AbortSignal) =>
    api
      .get('/api/admin/market/bids', { params, signal })
      .then((r) => r.data.data as { bids: MarketBid[]; pagination: PaginationMeta }),

  getTape: (params?: MarketQueryParams, signal?: AbortSignal) =>
    api
      .get('/api/admin/market/tape', { params, signal })
      .then((r) => r.data.data as { tape: MarketTapeEntry[]; pagination: PaginationMeta }),

  getMatchedAsks: (params?: MarketQueryParams, signal?: AbortSignal) =>
    api
      .get('/api/admin/market/matched-asks', { params, signal })
      .then((r) => r.data.data as { asks: MatchedAsk[]; pagination: PaginationMeta }),

  getMatchedBids: (params?: MarketQueryParams, signal?: AbortSignal) =>
    api
      .get('/api/admin/market/matched-bids', { params, signal })
      .then((r) => r.data.data as { bids: MatchedBid[]; pagination: PaginationMeta }),

  getBidDetail: (id: string, signal?: AbortSignal) =>
    api
      .get(`/api/admin/market/bid/${id}`, { signal })
      .then((r) => r.data.data as InvestmentOrderDetail),
};
