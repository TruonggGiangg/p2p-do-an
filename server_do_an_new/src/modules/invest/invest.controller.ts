import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InvestService } from './invest.service';
import { InvestmentContractService } from './investment-contract.service';
import { InvestPaymentService } from './invest-payment.service';
import { InvestStatsService } from './invest-stats.service';
import { CreateInvestmentOrderDto } from './dto/create-investment-order.dto';
import { UpdateInvestmentOrderDto } from './dto/update-investment-order.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { KycVerifiedGuard } from '../../common/guards/kyc-verified.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SmartOtpService } from '../smart-otp/services/smart-otp.service';
import { OtpActionType } from '../smart-otp/enums/otp-action-type.enum';

@ApiTags('invest')
@ApiBearerAuth()
@UseGuards(RolesGuard, KycVerifiedGuard)
@Roles('lender')
@Controller('invest')
export class InvestController {
  constructor(
    private readonly investService: InvestService,
    private readonly contractService: InvestmentContractService,
    private readonly paymentService: InvestPaymentService,
    private readonly statsService: InvestStatsService,
    private readonly smartOtpService: SmartOtpService,
  ) {}

  // ═══════════════════════════════════════════════════════
  //  CREATE
  // ═══════════════════════════════════════════════════════

  @Post('investment-order')
  @ApiOperation({ summary: 'Tạo lệnh đầu tư mới + auto-match' })
  @ApiResponse({ status: 201, description: 'Lệnh đầu tư đã tạo (kèm kết quả match)' })
  async createOrder(@CurrentUser('id') userId: string, @Body() dto: CreateInvestmentOrderDto) {
    return this.investService.createOrderWithMatching(userId, dto);
  }

  @Post('investment-order/with-progress')
  @ApiOperation({ summary: 'Tạo lệnh đầu tư + auto-match (JSON, progress logs)' })
  async createOrderWithProgress(@CurrentUser('id') userId: string, @Body() dto: CreateInvestmentOrderDto) {
    const progressLogs: Array<{ message: string; step: number }> = [];

    const result = await this.investService.createOrderWithMatching(userId, dto, (message, step) => {
      progressLogs.push({ message, step });
    });

    return {
      ...result,
      progressLogs,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  AVAILABLE LOANS (khoản vay đang cho phép đầu tư)
  // ═══════════════════════════════════════════════════════

  @Get('fix-is-full-match')
  @Public()
  @ApiOperation({ summary: 'Fix bad MongoDB data where isFullMatch was incorrectly set to true based on nodeMatch' })
  async fixIsFullMatch() {
    return this.investService.fixIsFullMatch();
  }

  @Get('available-loans')
  @ApiOperation({ summary: 'Danh sách khoản vay đang cho phép đầu tư' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['createdAt', 'capital', 'monthlyRatePercent', 'periodMonth', 'entirelyPay'],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'minRate', required: false, type: Number })
  @ApiQuery({ name: 'maxRate', required: false, type: Number })
  @ApiQuery({ name: 'minPeriod', required: false, type: Number })
  @ApiQuery({ name: 'maxPeriod', required: false, type: Number })
  @ApiQuery({ name: 'minCapital', required: false, type: Number })
  @ApiQuery({ name: 'maxCapital', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'riskLevel', required: false, enum: ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'] })
  async getAvailableLoans(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('minRate') minRate?: string,
    @Query('maxRate') maxRate?: string,
    @Query('minPeriod') minPeriod?: string,
    @Query('maxPeriod') maxPeriod?: string,
    @Query('minCapital') minCapital?: string,
    @Query('maxCapital') maxCapital?: string,
    @Query('search') search?: string,
    @Query('riskLevel') riskLevel?: string,
  ) {
    return this.investService.getAvailableLoans({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sortBy,
      sortOrder,
      minRate: minRate ? parseFloat(minRate) : undefined,
      maxRate: maxRate ? parseFloat(maxRate) : undefined,
      minPeriod: minPeriod ? parseInt(minPeriod, 10) : undefined,
      maxPeriod: maxPeriod ? parseInt(maxPeriod, 10) : undefined,
      minCapital: minCapital ? parseFloat(minCapital) : undefined,
      maxCapital: maxCapital ? parseFloat(maxCapital) : undefined,
      search,
      riskLevel,
    });
  }

  // ═══════════════════════════════════════════════════════
  //  LIST / DETAIL
  // ═══════════════════════════════════════════════════════

  @Get('investment-order')
  @ApiOperation({ summary: 'Danh sách lệnh đầu tư' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'closed'] })
  async listOrders(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('status') status?: string,
  ) {
    return this.investService.getOrdersByLender(userId, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sortBy,
      sortOrder,
      status,
    });
  }

  @Get('investment-order/:id')
  @ApiOperation({ summary: 'Chi tiết lệnh đầu tư' })
  async getOrder(@Param('id') id: string) {
    return this.investService.getOrderById(id);
  }

  // ═══════════════════════════════════════════════════════
  //  INVESTMENT CONTRACTS (hợp đồng ký quỹ)
  // ═══════════════════════════════════════════════════════

  @Post('contract')
  @ApiOperation({ summary: 'Tạo hợp đồng ký quỹ đầu tư (chỉ cho đầu tư trực tiếp vào khoản vay đang mở)' })
  @ApiResponse({ status: 201, description: 'Hợp đồng đã tạo + chờ ký SmartCA' })
  async createContract(
    @CurrentUser('id') userId: string,
    @Body() body: { loanApplicationId: string; numNotes: number; investmentOrderId?: string; otpSessionId?: string },
  ) {
    // CHẶN: lệnh đầu tư (đặt lệnh) KHÔNG bao giờ tạo hợp đồng đầu tư qua endpoint này.
    // Logic ghép lệnh chỉ reserve nodeMatch, không trừ tiền và không sinh contract.
    // Chỉ "đầu tư trực tiếp" vào khoản vay đang mở mới tạo hợp đồng để ký SmartCA.
    if (body.investmentOrderId) {
      throw new BadRequestException(
        'Lệnh đầu tư không tạo hợp đồng. Hợp đồng chỉ được tạo khi đầu tư trực tiếp vào khoản vay đang mở.',
      );
    }
    if (!body.otpSessionId) {
      throw new UnauthorizedException('Vui lòng xác thực Smart OTP trước khi đầu tư');
    }
    const consumeResult = await this.smartOtpService.consumeSession(
      userId,
      body.otpSessionId,
      OtpActionType.INVESTMENT,
    );
    if (!consumeResult.valid) {
      throw new UnauthorizedException(consumeResult.message);
    }
    return this.paymentService.processInvestment(userId, body.loanApplicationId, body.numNotes);
  }

  // ═══════════════════════════════════════════════════════
  //  SCHEDULE PREVIEW & STATS
  // ═══════════════════════════════════════════════════════

  @Post('schedule-preview')
  @ApiOperation({ summary: 'Preview lịch nhận tiền trước khi đầu tư' })
  async schedulePreview(@Body() body: { loanApplicationId: string; numNotes: number; investmentOrderId?: string }) {
    console.log(`[schedulePreview API] body=`, body);
    return this.contractService.getSchedulePreview(body.loanApplicationId, body.numNotes, body.investmentOrderId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Thống kê đầu tư của lender' })
  async getStats(@CurrentUser('id') userId: string) {
    return this.statsService.getLenderStats(userId);
  }

  @Get('my-balance')
  @ApiOperation({ summary: 'Số dư ví đầu tư của lender' })
  async getMyBalance(@CurrentUser('id') userId: string) {
    return this.paymentService.getLenderBalance(userId);
  }

  @Get('contracts')
  @ApiOperation({ summary: 'Danh sách hợp đồng ký quỹ của lender' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'pending_signature', 'active', 'matured', 'closed'] })
  async listContracts(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    return this.contractService.getContractsByLender(userId, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      status,
    });
  }

  @Get('contract/:id/html')
  @ApiOperation({ summary: 'Lấy nội dung HTML hợp đồng đầu tư (render PDF trên client)' })
  @ApiResponse({ status: 200, description: 'HTML hợp đồng đầu tư' })
  async getContractHTML(@CurrentUser('id') userId: string, @Param('id') id: string) {
    const html = await this.contractService.getContractHTML(id, userId);
    return { html };
  }

  @Get('contract/:id')
  @ApiOperation({ summary: 'Chi tiết hợp đồng ký quỹ' })
  async getContract(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.contractService.getContractById(id, userId);
  }

  @Get('contract/loan/:loanId')
  @ApiOperation({ summary: 'Chi tiết hợp đồng ký quỹ theo khoản vay' })
  async getContractByLoanId(@CurrentUser('id') userId: string, @Param('loanId') loanId: string) {
    return this.contractService.getContractByLoanId(loanId, userId);
  }

  // ═══════════════════════════════════════════════════════
  //  UPDATE / DELETE / CLOSE
  // ═══════════════════════════════════════════════════════

  @Put('investment-order/:id')
  @ApiOperation({ summary: 'Cập nhật lệnh đầu tư' })
  async updateOrder(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: UpdateInvestmentOrderDto) {
    return this.investService.updateOrder(id, userId, dto);
  }

  @Delete('investment-order/:id')
  @ApiOperation({ summary: 'Xóa lệnh đầu tư' })
  async deleteOrder(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.investService.deleteOrder(id, userId);
    return null;
  }

  @Post('investment-order/:id/close')
  @ApiOperation({ summary: 'Đóng lệnh đầu tư' })
  async closeOrder(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.investService.closeOrder(id, userId);
  }
}
