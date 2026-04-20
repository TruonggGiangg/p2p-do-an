/**
 * AdminMarketController — P2P Market Dashboard endpoints
 * ──────────────────────────────────────────────────────────
 * 6 endpoints cho Market Dashboard (admin web).
 * Pattern: GET /api/admin/market/*
 */
import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../guards/admin.guard';
import { PoliciesGuard } from '../../casl/policies.guard';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { Action } from '../../casl/actions.enum';
import { AdminMarketService } from '../services/admin-market.service';

@ApiTags('admin-market')
@ApiBearerAuth()
@Controller('admin/market')
@UseGuards(JwtAuthGuard, AdminGuard, PoliciesGuard)
export class AdminMarketController {
  constructor(private readonly marketService: AdminMarketService) {}

  // ─── STATS ──────────────────────────────────────────────

  @Get('stats')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Thống kê tổng quan Market' })
  @ApiResponse({ status: 200 })
  async getStats() {
    const stats = await this.marketService.getStats();
    return { stats };
  }

  // ─── LIVE ASKS ──────────────────────────────────────────

  @Get('asks')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Danh sách khoản vay đang chờ khớp (Live Asks)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'q', required: false, type: String })
  async getAsks(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
    @Query('q') q?: string,
  ) {
    return this.marketService.getAsks({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sortBy,
      order: order as 'asc' | 'desc',
      q: q?.trim() || undefined,
    });
  }

  // ─── LIVE BIDS ──────────────────────────────────────────

  @Get('bids')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Danh sách lệnh đầu tư đang mở (Live Bids)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'q', required: false, type: String })
  async getBids(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
    @Query('q') q?: string,
  ) {
    return this.marketService.getBids({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sortBy,
      order: order as 'asc' | 'desc',
      q: q?.trim() || undefined,
    });
  }

  // ─── TAPE ───────────────────────────────────────────────

  @Get('tape')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Lịch sử khớp lệnh gần đây (Live Tape)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  async getTape(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
  ) {
    return this.marketService.getTape({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sortBy,
      order: order as 'asc' | 'desc',
    });
  }

  // ─── MATCHED ASKS ──────────────────────────────────────

  @Get('matched-asks')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Hồ sơ vay đã khớp 100%' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'q', required: false, type: String })
  async getMatchedAsks(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
    @Query('q') q?: string,
  ) {
    return this.marketService.getMatchedAsks({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sortBy,
      order: order as 'asc' | 'desc',
      q: q?.trim() || undefined,
    });
  }

  // ─── MATCHED BIDS ──────────────────────────────────────

  @Get('matched-bids')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Lệnh đầu tư đã khớp đủ' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'q', required: false, type: String })
  async getMatchedBids(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
    @Query('q') q?: string,
  ) {
    return this.marketService.getMatchedBids({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sortBy,
      order: order as 'asc' | 'desc',
      q: q?.trim() || undefined,
    });
  }

  // ─── BID DETAIL ────────────────────────────────────────

  @Get('bid/:id')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Chi tiết lệnh đầu tư P2P' })
  async getBidDetail(@Param('id') id: string) {
    return this.marketService.getBidDetail(id);
  }
}
