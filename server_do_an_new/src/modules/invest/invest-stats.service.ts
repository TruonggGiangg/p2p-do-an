/**
 * InvestStatsService — Investment statistics for lender dashboard
 * ──────────────────────────────────────────────────────────
 * Port from HD-AMC InvestmentManagementService.getLenderDetailedStats.
 * Provides: financial, health, diversification, performance stats.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { InvestmentContract } from './schemas/investment-contract.schema';
import { InvestmentOrder } from './schemas/investment-order.schema';
import { LoanApplication } from '../loan/schemas/loan-application.schema';

export interface LenderStats {
  financial: {
    totalInvested: number;
    totalReceived: number;
    totalPrincipalReceived: number;
    totalInterestReceived: number;
    expectedTotalProfit: number;
    actualProfit: number;
  };
  health: {
    active: { count: number; amount: number };
    pending: { count: number; amount: number };
    matured: { count: number; amount: number };
    closed: { count: number; amount: number };
  };
  diversification: Array<{
    label: string;
    count: number;
    amount: number;
    percentage: string;
  }>;
  performance: {
    averageRate: number;
    weightedAverageRate: string;
    totalContracts: number;
    totalOrders: number;
  };
}

@Injectable()
export class InvestStatsService {
  private readonly logger = new Logger(InvestStatsService.name);

  constructor(
    @InjectModel(InvestmentContract.name) private readonly contractModel: Model<InvestmentContract>,
    @InjectModel(InvestmentOrder.name) private readonly orderModel: Model<InvestmentOrder>,
    @InjectModel(LoanApplication.name) private readonly loanModel: Model<LoanApplication>,
  ) {}

  /**
   * Get detailed investment statistics for a lender.
   */
  async getLenderStats(lenderId: string): Promise<LenderStats> {
    const lenderOid = new Types.ObjectId(lenderId);

    // Fetch all contracts for this lender with loan info
    const contracts = await this.contractModel
      .find({ lenderId: lenderOid })
      .populate('loanApplicationId', 'willing capital periodMonth monthlyRatePercent status')
      .exec();

    // Fetch order count
    const totalOrders = await this.orderModel.countDocuments({ lenderId: lenderOid });

    const stats: LenderStats = {
      financial: {
        totalInvested: 0,
        totalReceived: 0,
        totalPrincipalReceived: 0,
        totalInterestReceived: 0,
        expectedTotalProfit: 0,
        actualProfit: 0,
      },
      health: {
        active: { count: 0, amount: 0 },
        pending: { count: 0, amount: 0 },
        matured: { count: 0, amount: 0 },
        closed: { count: 0, amount: 0 },
      },
      diversification: [],
      performance: {
        averageRate: 0,
        weightedAverageRate: '0',
        totalContracts: contracts.length,
        totalOrders,
      },
    };

    let totalWeightedRate = 0;
    let totalActiveCapital = 0;
    const purposeMap: Record<string, { count: number; amount: number }> = {};

    for (const contract of contracts) {
      const capital = contract.capital || 0;
      const loan = contract.loanApplicationId as any;

      // ── Financial ──
      stats.financial.totalInvested += capital;
      stats.financial.totalReceived += contract.totalReceived || 0;
      stats.financial.totalPrincipalReceived += contract.totalPrincipalReceived || 0;
      stats.financial.totalInterestReceived += contract.totalInterestReceived || 0;
      stats.financial.expectedTotalProfit += contract.entirelyProfit || 0;

      // ── Health by contract status ──
      const status = contract.status;
      if (status === 'active') {
        stats.health.active.count++;
        stats.health.active.amount += capital;

        // Weighted rate
        const rate = contract.monthlyRatePercent || 0;
        totalWeightedRate += rate * capital;
        totalActiveCapital += capital;
      } else if (status === 'pending') {
        stats.health.pending.count++;
        stats.health.pending.amount += capital;
      } else if (status === 'matured') {
        stats.health.matured.count++;
        stats.health.matured.amount += capital;
      } else if (status === 'closed') {
        stats.health.closed.count++;
        stats.health.closed.amount += capital;
      }

      // ── Diversification by purpose ──
      const purpose = loan?.willing || 'Khác';
      if (!purposeMap[purpose]) {
        purposeMap[purpose] = { count: 0, amount: 0 };
      }
      purposeMap[purpose].count++;
      purposeMap[purpose].amount += capital;
    }

    // ── Compute final stats ──
    stats.financial.actualProfit = stats.financial.totalInterestReceived;

    if (totalActiveCapital > 0) {
      stats.performance.weightedAverageRate = (totalWeightedRate / totalActiveCapital).toFixed(2);
    }

    if (contracts.length > 0) {
      const sumRates = contracts.reduce((s, c) => s + (c.monthlyRatePercent || 0), 0);
      stats.performance.averageRate = parseFloat((sumRates / contracts.length).toFixed(2));
    }

    // Convert diversification to sorted array
    stats.diversification = Object.keys(purposeMap)
      .map(label => ({
        label,
        count: purposeMap[label].count,
        amount: purposeMap[label].amount,
        percentage: stats.financial.totalInvested > 0
          ? ((purposeMap[label].amount / stats.financial.totalInvested) * 100).toFixed(1)
          : '0',
      }))
      .sort((a, b) => b.amount - a.amount);

    return stats;
  }
}
