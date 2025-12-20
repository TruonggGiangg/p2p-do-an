import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoanService } from './loan.service';
import { Public } from '../decorator/customize';

@ApiTags('Blockchain UI')
@Controller('blockchain')
export class BlockchainController {
    constructor(private readonly loanService: LoanService) { }

    @Public()
    @Get('stats')
    @ApiOperation({ summary: 'Get blockchain stats' })
    async getStats() {
        return this.loanService.getBlockchainStats();
    }

    @Public()
    @Get('loans')
    @ApiOperation({ summary: 'Get loans' })
    async getLoans(@Query('page') page: number = 1, @Query('limit') limit: number = 10) {
        return this.loanService.getLoansPaginated(page, limit);
    }

    @Public()
    @Get('transactions/recent')
    @ApiOperation({ summary: 'Get recent transactions' })
    async getRecentTransactions(@Query('page') page: number = 1, @Query('limit') limit: number = 10) {
        return this.loanService.getTransactionsRecent(page, limit);
    }

    @Public()
    @Get('investments')
    @ApiOperation({ summary: 'Get investments' })
    async getInvestments() {
        return { success: true, data: [], total: 0, page: 1, totalPages: 0 };
    }

    @Public()
    @Get('channel/info')
    @ApiOperation({ summary: 'Get channel info' })
    async getChannelInfo() {
        // Mock channel info for UI
        return {
            success: true,
            latestBlock: 120 + Math.floor(Math.random() * 10),
            txCount: 50 + Math.floor(Math.random() * 10)
        };
    }
}
