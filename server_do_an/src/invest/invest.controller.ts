import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    UseGuards,
    Request,
    Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

import { InvestService, AuthUser } from './invest.service';
import { CreateInvestmentDto } from './dto';
import { DualAuthGuard } from '../auth/guard/dual-auth.guard';

@ApiTags('invest')
@Controller('invest')
@UseGuards(DualAuthGuard)
@ApiBearerAuth()

export class InvestController {
    private readonly logger = new Logger(InvestController.name);

    constructor(private readonly investService: InvestService) { }

    /**
     * Get loans available for investment
     */
    @Get('available-loans')
    @ApiOperation({ summary: 'Get loans available for investment' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getAvailableLoans(
        @Request() req,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        const user = req.user as AuthUser;
        return this.investService.getAvailableLoans(user, page || 1, limit || 10);
    }

    /**
     * Create new investment
     */
    @Post('create')
    @ApiOperation({ summary: 'Create new investment in a loan' })
    async createInvestment(
        @Request() req,
        @Body() dto: CreateInvestmentDto,
    ) {
        const user = req.user as AuthUser;
        return this.investService.createInvestment(user, dto);
    }

    /**
     * Get my investments
     */
    @Get('my-investments')
    @ApiOperation({ summary: 'Get my investment list' })
    @ApiQuery({ name: 'status', required: false, type: String })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getMyInvestments(
        @Request() req,
        @Query('status') status?: string,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        const user = req.user as AuthUser;
        return this.investService.getMyInvestments(user, status, page || 1, limit || 10);
    }

    /**
     * Get investment statistics
     */
    @Get('stats')
    @ApiOperation({ summary: 'Get investment statistics' })
    async getInvestmentStats(@Request() req) {
        const user = req.user as AuthUser;
        return this.investService.getInvestmentStats(user);
    }

    /**
     * Get investment history for chart
     */
    @Get('history')
    @ApiOperation({ summary: 'Get investment history time-series data for charts' })
    @ApiQuery({ name: 'range', required: false, type: String, description: '1W, 1M, 3M, 1Y' })
    async getInvestmentHistory(
        @Request() req,
        @Query('range') range?: string,
    ) {
        const user = req.user as AuthUser;
        return this.investService.getInvestmentHistory(user, range || '1M');
    }

    /**
     * Get my wallet balance
     */
    @Get('my-balance')
    @ApiOperation({ summary: 'Get lender wallet balance from Fineract' })
    async getMyBalance(@Request() req) {
        const user = req.user as AuthUser;
        return this.investService.getMyBalance(user);
    }

    /**
     * Get investment by ID
     */
    @Get(':id')
    @ApiOperation({ summary: 'Get investment details by ID' })
    async getInvestmentById(
        @Request() req,
        @Param('id') id: string,
    ) {
        const user = req.user as AuthUser;
        return this.investService.getInvestmentById(user, id);
    }
}
