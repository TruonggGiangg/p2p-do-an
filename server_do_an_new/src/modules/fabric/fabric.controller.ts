import { Controller, Get, Param, UseGuards, Logger } from '@nestjs/common';
import { FabricService } from './fabric.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('blockchain')
@UseGuards(JwtAuthGuard)
export class FabricController {
  private readonly logger = new Logger(FabricController.name);

  constructor(private readonly fabricService: FabricService) {}

  private safeParse(raw: any): any[] {
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw || '[]'); } catch { return []; }
  }

  @Get('status')
  async getNetworkStatus() {
    const status = this.fabricService.getNetworkStatus();
    return { data: status };
  }

  @Get('stats')
  async getStats() {
    try {
      const [loans, investments, orders, matchingEvents, settlements, configs] = await Promise.allSettled([
        this.fabricService.evaluateTransaction('queryAllLoanContracts'),
        this.fabricService.evaluateTransaction('queryAllInvestmentContracts'),
        this.fabricService.evaluateTransaction('queryAllInvestmentOrders'),
        this.fabricService.evaluateTransaction('queryAllMatchingEvents'),
        this.fabricService.evaluateTransaction('queryAllSettlementContracts'),
        this.fabricService.evaluateTransaction('queryAllLoanEvaluationConfigs'),
      ]);

      const loanContracts = loans.status === 'fulfilled' ? this.safeParse(loans.value) : [];
      const investmentContracts = investments.status === 'fulfilled' ? this.safeParse(investments.value) : [];
      const investmentOrders = orders.status === 'fulfilled' ? this.safeParse(orders.value) : [];
      const matchEvents = matchingEvents.status === 'fulfilled' ? this.safeParse(matchingEvents.value) : [];
      const settlementContracts = settlements.status === 'fulfilled' ? this.safeParse(settlements.value) : [];
      const loanEvaluationConfigs = configs.status === 'fulfilled' ? this.safeParse(configs.value) : [];

      const totalLoanVolume = loanContracts.reduce((sum: number, c: any) => {
        const record = c.Record || c;
        return sum + (record.principalAmount || 0);
      }, 0);

      const totalInvestmentVolume = investmentContracts.reduce((sum: number, c: any) => {
        const record = c.Record || c;
        return sum + (record.capital || 0);
      }, 0);

      const totalSettlementVolume = settlementContracts.reduce((sum: number, c: any) => {
        const record = c.Record || c;
        return sum + (record.amountPaid || 0);
      }, 0);

      return {
        data: {
          totalLoanContracts: loanContracts.length,
          totalInvestmentContracts: investmentContracts.length,
          totalInvestmentOrders: investmentOrders.length,
          totalMatchingEvents: matchEvents.length,
          totalSettlements: settlementContracts.length,
          totalLoanEvaluationConfigs: loanEvaluationConfigs.length,
          totalTransactions: loanContracts.length + investmentContracts.length + investmentOrders.length + matchEvents.length + settlementContracts.length + loanEvaluationConfigs.length,
          totalLoanVolume,
          totalInvestmentVolume,
          totalSettlementVolume,
          networkConnected: this.fabricService.isConnected(),
        },
      };
    } catch (error: any) {
      this.logger.warn(`[getStats] ${error.message}`);
      return {
        data: {
          totalLoanContracts: 0, totalInvestmentContracts: 0, totalInvestmentOrders: 0,
          totalMatchingEvents: 0, totalSettlements: 0, totalLoanEvaluationConfigs: 0, totalTransactions: 0,
          totalLoanVolume: 0, totalInvestmentVolume: 0, totalSettlementVolume: 0,
          networkConnected: this.fabricService.isConnected(),
        },
      };
    }
  }

  @Get('contracts')
  async getAllContracts() {
    try {
      const [loans, investments, orders, matchEvents, settlements, configs] = await Promise.allSettled([
        this.fabricService.evaluateTransaction('queryAllLoanContracts'),
        this.fabricService.evaluateTransaction('queryAllInvestmentContracts'),
        this.fabricService.evaluateTransaction('queryAllInvestmentOrders'),
        this.fabricService.evaluateTransaction('queryAllMatchingEvents'),
        this.fabricService.evaluateTransaction('queryAllSettlementContracts'),
        this.fabricService.evaluateTransaction('queryAllLoanEvaluationConfigs'),
      ]);

      const normalize = (list: any[], type: string, idField: string, amountField: string) =>
        list.map((c: any) => {
          const r = c.Record || c;
          return {
            key: c.Key || r[idField],
            type,
            contractId: r[idField],
            status: r.status,
            amount: r[amountField] || 0,
            dataHash: r.dataHash,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            details: r,
          };
        });

      const normalizeConfig = (list: any[]) =>
        list.map((c: any) => {
          const r = c.Record || c;
          return {
            key: c.Key || r.configId,
            type: 'LoanEvaluationConfig',
            contractId: r.configId,
            status: 'committed',
            amount: r.version || 0,
            dataHash: r.configHash || r.dataHash,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            details: r,
          };
        });

      const allContracts = [
        ...normalize(loans.status === 'fulfilled' ? this.safeParse(loans.value) : [], 'LoanContract', 'contractId', 'principalAmount'),
        ...normalize(investments.status === 'fulfilled' ? this.safeParse(investments.value) : [], 'InvestmentContract', 'contractId', 'capital'),
        ...normalize(orders.status === 'fulfilled' ? this.safeParse(orders.value) : [], 'InvestmentOrder', 'orderId', 'capital'),
        ...normalize(matchEvents.status === 'fulfilled' ? this.safeParse(matchEvents.value) : [], 'MatchingEvent', 'eventId', 'amountMatched'),
        ...normalize(settlements.status === 'fulfilled' ? this.safeParse(settlements.value) : [], 'SettlementContract', 'settlementId', 'amountPaid'),
        ...normalizeConfig(configs.status === 'fulfilled' ? this.safeParse(configs.value) : []),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return { data: allContracts };
    } catch (error: any) {
      this.logger.error(`[getAllContracts] ${error.message}`);
      return { data: [] };
    }
  }

  @Get('contracts/:id')
  async getContract(@Param('id') id: string) {
    // Try all docTypes
    for (const fn of ['queryLoanContract', 'queryInvestmentContract', 'queryInvestmentOrder', 'queryMatchingEvent', 'querySettlementContract', 'queryLoanEvaluationConfig']) {
      try {
        const result = await this.fabricService.evaluateTransaction(fn, id);
        return { data: result };
      } catch {
        continue;
      }
    }
    return { data: null, message: 'Contract not found on ledger' };
  }

  @Get('contracts/:id/history')
  async getContractHistory(@Param('id') id: string) {
    try {
      const result = await this.fabricService.evaluateTransaction('getContractHistory', id);
      return { data: result };
    } catch (error: any) {
      this.logger.warn(`[getContractHistory] ${error.message}`);
      return { data: [] };
    }
  }

  // ── Dedicated query endpoints ──

  @Get('orders')
  async getAllOrders() {
    try {
      const result = await this.fabricService.evaluateTransaction('queryAllInvestmentOrders');
      return { data: this.safeParse(result) };
    } catch (error: any) {
      this.logger.warn(`[getAllOrders] ${error.message}`);
      return { data: [] };
    }
  }

  @Get('matching-events')
  async getAllMatchingEvents() {
    try {
      const result = await this.fabricService.evaluateTransaction('queryAllMatchingEvents');
      return { data: this.safeParse(result) };
    } catch (error: any) {
      this.logger.warn(`[getAllMatchingEvents] ${error.message}`);
      return { data: [] };
    }
  }

  @Get('matching-events/loan/:loanId')
  async getMatchingEventsByLoan(@Param('loanId') loanId: string) {
    try {
      const result = await this.fabricService.evaluateTransaction('queryMatchingEventsByLoan', loanId);
      return { data: this.safeParse(result) };
    } catch (error: any) {
      this.logger.warn(`[getMatchingEventsByLoan] ${error.message}`);
      return { data: [] };
    }
  }

  @Get('matching-events/order/:orderId')
  async getMatchingEventsByOrder(@Param('orderId') orderId: string) {
    try {
      const result = await this.fabricService.evaluateTransaction('queryMatchingEventsByOrder', orderId);
      return { data: this.safeParse(result) };
    } catch (error: any) {
      this.logger.warn(`[getMatchingEventsByOrder] ${error.message}`);
      return { data: [] };
    }
  }

  @Get('settlements')
  async getAllSettlements() {
    try {
      const result = await this.fabricService.evaluateTransaction('queryAllSettlementContracts');
      return { data: this.safeParse(result) };
    } catch (error: any) {
      this.logger.warn(`[getAllSettlements] ${error.message}`);
      return { data: [] };
    }
  }

  @Get('settlements/loan/:loanContractId')
  async getSettlementsByLoan(@Param('loanContractId') loanContractId: string) {
    try {
      const result = await this.fabricService.evaluateTransaction('querySettlementsByLoan', loanContractId);
      return { data: this.safeParse(result) };
    } catch (error: any) {
      this.logger.warn(`[getSettlementsByLoan] ${error.message}`);
      return { data: [] };
    }
  }

  @Get('loan-evaluation-configs')
  async getAllLoanEvaluationConfigs() {
    try {
      const result = await this.fabricService.evaluateTransaction('queryAllLoanEvaluationConfigs');
      return { data: this.safeParse(result) };
    } catch (error: any) {
      this.logger.warn(`[getAllLoanEvaluationConfigs] ${error.message}`);
      return { data: [] };
    }
  }
}
