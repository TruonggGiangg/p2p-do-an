import { Controller, Get, Param, UseGuards, Logger } from '@nestjs/common';
import { FabricService } from './fabric.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('blockchain')
@UseGuards(JwtAuthGuard)
export class FabricController {
  private readonly logger = new Logger(FabricController.name);

  constructor(private readonly fabricService: FabricService) {}

  @Get('status')
  async getNetworkStatus() {
    const status = this.fabricService.getNetworkStatus();
    return { data: status };
  }

  @Get('stats')
  async getStats() {
    try {
      const [loans, investments] = await Promise.allSettled([
        this.fabricService.evaluateTransaction('queryAllLoanContracts'),
        this.fabricService.evaluateTransaction('queryAllInvestmentContracts'),
      ]);

      const loanContracts = loans.status === 'fulfilled' ? (Array.isArray(loans.value) ? loans.value : JSON.parse(loans.value || '[]')) : [];
      const investmentContracts = investments.status === 'fulfilled' ? (Array.isArray(investments.value) ? investments.value : JSON.parse(investments.value || '[]')) : [];

      const totalLoanVolume = loanContracts.reduce((sum: number, c: any) => {
        const record = c.Record || c;
        return sum + (record.principalAmount || 0);
      }, 0);

      const totalInvestmentVolume = investmentContracts.reduce((sum: number, c: any) => {
        const record = c.Record || c;
        return sum + (record.capital || 0);
      }, 0);

      return {
        data: {
          totalLoanContracts: loanContracts.length,
          totalInvestmentContracts: investmentContracts.length,
          totalTransactions: loanContracts.length + investmentContracts.length,
          totalLoanVolume,
          totalInvestmentVolume,
          networkConnected: this.fabricService.isConnected(),
        },
      };
    } catch (error: any) {
      this.logger.warn(`[getStats] ${error.message}`);
      return {
        data: {
          totalLoanContracts: 0,
          totalInvestmentContracts: 0,
          totalTransactions: 0,
          totalLoanVolume: 0,
          totalInvestmentVolume: 0,
          networkConnected: this.fabricService.isConnected(),
        },
      };
    }
  }

  @Get('contracts')
  async getAllContracts() {
    try {
      const [loans, investments, allSettlements] = await Promise.allSettled([
        this.fabricService.evaluateTransaction('queryAllLoanContracts'),
        this.fabricService.evaluateTransaction('queryAllInvestmentContracts'),
        Promise.resolve([]), // settlements need a specific loanContractId
      ]);

      const loanList = loans.status === 'fulfilled' ? (Array.isArray(loans.value) ? loans.value : JSON.parse(loans.value || '[]')) : [];
      const investList = investments.status === 'fulfilled' ? (Array.isArray(investments.value) ? investments.value : JSON.parse(investments.value || '[]')) : [];

      // Normalize to unified format
      const allContracts = [
        ...loanList.map((c: any) => {
          const r = c.Record || c;
          return {
            key: c.Key || r.contractId,
            type: 'LoanContract',
            contractId: r.contractId,
            status: r.status,
            amount: r.principalAmount || 0,
            dataHash: r.dataHash,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            details: r,
          };
        }),
        ...investList.map((c: any) => {
          const r = c.Record || c;
          return {
            key: c.Key || r.contractId,
            type: 'InvestmentContract',
            contractId: r.contractId,
            status: r.status,
            amount: r.capital || 0,
            dataHash: r.dataHash,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            details: r,
          };
        }),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return { data: allContracts };
    } catch (error: any) {
      this.logger.error(`[getAllContracts] ${error.message}`);
      return { data: [] };
    }
  }

  @Get('contracts/:id')
  async getContract(@Param('id') id: string) {
    // Try loan first, then investment, then settlement
    for (const fn of ['queryLoanContract', 'queryInvestmentContract', 'querySettlementContract']) {
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
}
