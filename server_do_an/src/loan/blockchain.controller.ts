import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoanService } from './loan.service';
import { BlockchainService } from './services/blockchain.service';
import { Public } from '../decorator/customize';

@ApiTags('Blockchain UI')
@Controller('blockchain')
export class BlockchainController {
    constructor(
        private readonly loanService: LoanService,
        private readonly blockchainService: BlockchainService,
    ) { }

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
    @ApiOperation({ summary: 'Get channel info from blockchain' })
    async getChannelInfo() {
        try {
            // Check if blockchain is connected
            const isConnected = await this.blockchainService.ensureConnection();

            if (!isConnected) {
                return {
                    success: false,
                    error: 'Blockchain not connected',
                    latestBlock: 0,
                    txCount: 0
                };
            }

            // Get total loans from DB as proxy for tx count
            const stats = await this.loanService.getBlockchainStats();
            const totalLoans = stats.data?.totalLoans || 0;

            // Since Fabric SDK doesn't directly expose block height easily,
            // we use the loan count as a proxy for activity
            // In production, you could query the peer for actual block height
            return {
                success: true,
                latestBlock: totalLoans + 5, // Genesis + config blocks + transactions
                txCount: totalLoans,
                chaincodeName: 'p2plending',
                channelName: 'mychannel',
                connected: true
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                latestBlock: 0,
                txCount: 0,
                connected: false
            };
        }
    }

    @Public()
    @Get('status')
    @ApiOperation({ summary: 'Get blockchain connection status' })
    async getStatus() {
        return this.loanService.checkBlockchainStatus();
    }
}
