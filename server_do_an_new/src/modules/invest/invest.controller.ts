import {
  Controller, Get, Post, Put, Delete, Param, Body, Query,
  Req, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InvestService } from './invest.service';
import { InvestmentContractService } from './investment-contract.service';
import { CreateInvestmentOrderDto } from './dto/create-investment-order.dto';
import { UpdateInvestmentOrderDto } from './dto/update-investment-order.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('invest')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('lender')
@Controller('invest')
export class InvestController {
  constructor(
    private readonly investService: InvestService,
    private readonly contractService: InvestmentContractService,
  ) {}

  // ═══════════════════════════════════════════════════════
  //  CREATE
  // ═══════════════════════════════════════════════════════

  @Post('investment-order')
  @ApiOperation({ summary: 'Tạo lệnh đầu tư mới + auto-match' })
  @ApiResponse({ status: 201, description: 'Lệnh đầu tư đã tạo (kèm kết quả match)' })
  async createOrder(@Req() req: any, @Body() dto: CreateInvestmentOrderDto) {
    const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
    if (!userId) {
      return { statusCode: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' };
    }

    const result = await this.investService.createOrderWithMatching(userId, dto);

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Lệnh đầu tư đã tạo thành công',
      data: result,
    };
  }

  @Post('investment-order/with-progress')
  @ApiOperation({ summary: 'Tạo lệnh đầu tư + auto-match (JSON, progress logs)' })
  async createOrderWithProgress(@Req() req: any, @Body() dto: CreateInvestmentOrderDto) {
    const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
    if (!userId) {
      return { statusCode: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' };
    }

    const progressLogs: Array<{ message: string; step: number }> = [];

    const result = await this.investService.createOrderWithMatching(
      userId,
      dto,
      (message, step) => {
        progressLogs.push({ message, step });
      },
    );

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Lệnh đầu tư đã tạo thành công',
      data: {
        ...result,
        progressLogs,
      },
    };
  }

  // ═══════════════════════════════════════════════════════
  //  AVAILABLE LOANS (khoản vay đang cho phép đầu tư)
  // ═══════════════════════════════════════════════════════

  @Get('available-loans')
  @ApiOperation({ summary: 'Danh sách khoản vay đang cho phép đầu tư' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['createdAt', 'capital', 'monthlyRatePercent', 'periodMonth'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'minRate', required: false, type: Number })
  @ApiQuery({ name: 'maxRate', required: false, type: Number })
  @ApiQuery({ name: 'minPeriod', required: false, type: Number })
  @ApiQuery({ name: 'maxPeriod', required: false, type: Number })
  async getAvailableLoans(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('minRate') minRate?: string,
    @Query('maxRate') maxRate?: string,
    @Query('minPeriod') minPeriod?: string,
    @Query('maxPeriod') maxPeriod?: string,
  ) {
    const result = await this.investService.getAvailableLoans({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sortBy,
      sortOrder,
      minRate: minRate ? parseFloat(minRate) : undefined,
      maxRate: maxRate ? parseFloat(maxRate) : undefined,
      minPeriod: minPeriod ? parseInt(minPeriod, 10) : undefined,
      maxPeriod: maxPeriod ? parseInt(maxPeriod, 10) : undefined,
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'OK',
      data: result,
    };
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
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('status') status?: string,
  ) {
    const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
    if (!userId) {
      return { statusCode: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' };
    }

    const result = await this.investService.getOrdersByLender(userId, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sortBy,
      sortOrder,
      status,
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'OK',
      data: result,
    };
  }

  @Get('investment-order/:id')
  @ApiOperation({ summary: 'Chi tiết lệnh đầu tư' })
  async getOrder(@Param('id') id: string) {
    const order = await this.investService.getOrderById(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'OK',
      data: order,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  INVESTMENT CONTRACTS (hợp đồng ký quỹ)
  // ═══════════════════════════════════════════════════════

  @Post('contract')
  @ApiOperation({ summary: 'Tạo hợp đồng ký quỹ đầu tư' })
  @ApiResponse({ status: 201, description: 'Hợp đồng đã tạo' })
  async createContract(
    @Req() req: any,
    @Body() body: { loanApplicationId: string; numNotes: number; investmentOrderId?: string },
  ) {
    const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
    if (!userId) return { statusCode: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' };

    const contract = await this.contractService.createContract(
      userId, body.loanApplicationId, body.numNotes, body.investmentOrderId,
    );

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Hợp đồng ký quỹ đã tạo thành công',
      data: contract,
    };
  }

  @Get('contracts')
  @ApiOperation({ summary: 'Danh sách hợp đồng ký quỹ của lender' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'active', 'matured', 'closed'] })
  async listContracts(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
    if (!userId) return { statusCode: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' };

    const result = await this.contractService.getContractsByLender(userId, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      status,
    });

    return { statusCode: HttpStatus.OK, message: 'OK', data: result };
  }

  @Get('contract/:id')
  @ApiOperation({ summary: 'Chi tiết hợp đồng ký quỹ' })
  async getContract(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
    if (!userId) return { statusCode: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' };

    const contract = await this.contractService.getContractById(id, userId);
    return { statusCode: HttpStatus.OK, message: 'OK', data: contract };
  }

  // ═══════════════════════════════════════════════════════
  //  UPDATE / DELETE / CLOSE
  // ═══════════════════════════════════════════════════════

  @Put('investment-order/:id')
  @ApiOperation({ summary: 'Cập nhật lệnh đầu tư' })
  async updateOrder(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateInvestmentOrderDto) {
    const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
    const order = await this.investService.updateOrder(id, userId, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật thành công',
      data: order,
    };
  }

  @Delete('investment-order/:id')
  @ApiOperation({ summary: 'Xóa lệnh đầu tư' })
  async deleteOrder(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
    await this.investService.deleteOrder(id, userId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Đã xóa lệnh đầu tư',
    };
  }

  @Post('investment-order/:id/close')
  @ApiOperation({ summary: 'Đóng lệnh đầu tư' })
  async closeOrder(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
    const order = await this.investService.closeOrder(id, userId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Đã đóng lệnh đầu tư',
      data: order,
    };
  }
}
