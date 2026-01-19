import { Controller, Get, Post, Param, Body, Query, UseGuards, HttpStatus, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletsService } from './wallets.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../auth/interfaces/auth.interface';

@ApiTags('wallets')
@ApiBearerAuth()
@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all wallets for current user' })
  @ApiResponse({ status: 200, description: 'Returns list of wallets' })
  async getWallets(@CurrentUser() user: UserPayload) {
    if (!user._id) {
      throw new UnauthorizedException('User ID not found');
    }
    const wallets = await this.walletsService.getWalletsByUserId(user._id);
    const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);

    return {
      statusCode: HttpStatus.OK,
      data: {
        wallets,
        totalBalance,
        count: wallets.length,
      },
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create new wallet (placeholder)' })
  @ApiResponse({
    status: 501,
    description: 'Not implemented - wallets are created via Fineract',
  })
  async createWallet() {
    return {
      statusCode: HttpStatus.NOT_IMPLEMENTED,
      message: 'Tạo ví mới phải thông qua Fineract. Vui lòng sử dụng POST /api/wallets/sync để đồng bộ ví.',
    };
  }

  @Get('balance')
  @ApiOperation({ summary: 'Get total balance across all wallets' })
  @ApiResponse({ status: 200, description: 'Returns total balance' })
  async getTotalBalance(@CurrentUser() user: UserPayload) {
    if (!user._id) {
      throw new UnauthorizedException('User ID not found');
    }
    const balance = await this.walletsService.getTotalBalance(user._id);

    return {
      statusCode: HttpStatus.OK,
      data: balance,
    };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get wallet transaction history' })
  @ApiResponse({ status: 200, description: 'Returns transaction history' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of transactions to return (default: 20)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of transactions to skip (default: 0)' })
  @ApiQuery({
    name: 'walletId',
    required: false,
    type: String,
    description: 'Specific wallet Fineract ID to filter transactions for a single wallet',
  })
  async getTransactions(
    @CurrentUser() user: UserPayload,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('walletId') walletId?: string,
  ) {
    if (!user._id) {
      throw new UnauthorizedException('User ID not found');
    }

    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    // walletId is Fineract Savings ID (not MongoDB ID)
    const result = await this.walletsService.getWalletTransactions(user._id, limitNum, offsetNum, walletId);

    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get specific wallet by ID' })
  @ApiResponse({ status: 200, description: 'Returns wallet details' })
  async getWallet(@Param('id') id: string) {
    const wallet = await this.walletsService.getWalletById(id);

    return {
      statusCode: HttpStatus.OK,
      data: wallet,
    };
  }

  @Post('sync')
  @ApiOperation({ summary: 'Sync wallets from Fineract' })
  @ApiResponse({ status: 200, description: 'Wallets synced successfully' })
  async syncWallets(@CurrentUser() user: UserPayload) {
    if (!user._id) {
      throw new UnauthorizedException('User ID not found');
    }
    const result = await this.walletsService.syncWalletsFromFineract(user._id);

    return {
      statusCode: HttpStatus.OK,
      message: `Synced ${result.synced} wallet(s)`,
      data: {
        synced: result.synced,
        wallets: result.wallets,
      },
    };
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Transfer money between wallets' })
  @ApiResponse({ status: 200, description: 'Transfer successful' })
  async transfer(
    @CurrentUser() user: UserPayload,
    @Body() body: { fromWalletId: string; toWalletId: string; amount: number; description?: string },
  ) {
    if (!user._id) {
      throw new UnauthorizedException('User ID not found');
    }

    const { fromWalletId, toWalletId, amount, description } = body;

    if (!fromWalletId || !toWalletId || !amount || amount < 1000) {
      throw new BadRequestException('Thông tin không hợp lệ. Số tiền tối thiểu là 1,000 đ');
    }

    const result = await this.walletsService.transferBetweenWallets(fromWalletId, toWalletId, amount, description);

    return {
      statusCode: HttpStatus.OK,
      message: 'Chuyển khoản thành công',
      data: result,
    };
  }

  @Post('transfer/phone')
  @ApiOperation({ summary: 'Transfer money by phone number' })
  @ApiResponse({ status: 200, description: 'Transfer successful' })
  async transferByPhone(
    @CurrentUser() user: UserPayload,
    @Body() body: { fromWalletId: string; recipientPhone: string; amount: number; description?: string },
  ) {
    if (!user._id) {
      throw new UnauthorizedException('User ID not found');
    }

    const { fromWalletId, recipientPhone, amount, description } = body;

    if (!fromWalletId || !recipientPhone || !amount || amount < 1000) {
      throw new BadRequestException('Thông tin không hợp lệ. Số tiền tối thiểu là 1,000 đ');
    }

    const cleanPhone = recipientPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      throw new BadRequestException('Số điện thoại phải có 10 chữ số');
    }

    const result = await this.walletsService.transferByPhone(fromWalletId, cleanPhone, amount, description);

    return {
      statusCode: HttpStatus.OK,
      message: `Chuyển ${amount.toLocaleString('vi-VN')} VND thành công đến ${cleanPhone}`,
      data: result,
    };
  }
}
