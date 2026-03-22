import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletsService } from './wallets.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TransferDto } from './dto/transfer.dto';
import { TransferByPhoneDto } from './dto/transfer-by-phone.dto';
import { TransferByAccountDto } from './dto/transfer-by-account.dto';

@ApiTags('wallets')
@ApiBearerAuth('access-token')
@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) { }

  @Get()
  @ApiOperation({ summary: 'Get all wallets for current user' })
  @ApiResponse({ status: 200, description: 'Returns list of wallets' })
  async getWallets(@CurrentUser('id') userId: string) {
    const wallets = await this.walletsService.getWalletsByUserId(userId);
    const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);

    return {
      wallets,
      totalBalance,
      count: wallets.length,
    };
  }

  @Get('balance')
  @ApiOperation({ summary: 'Get total balance across all wallets' })
  @ApiResponse({ status: 200, description: 'Returns total balance' })
  async getTotalBalance(@CurrentUser('id') userId: string) {
    return this.walletsService.getTotalBalance(userId);
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
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('walletId') walletId?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    return this.walletsService.getWalletTransactions(userId, limitNum, offsetNum, walletId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get specific wallet by ID' })
  @ApiResponse({ status: 200, description: 'Returns wallet details' })
  async getWallet(@Param('id') id: string) {
    return this.walletsService.getWalletById(id);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Sync wallets from Fineract' })
  @ApiResponse({ status: 200, description: 'Wallets synced successfully' })
  async syncWallets(@CurrentUser('id') userId: string) {
    const result = await this.walletsService.syncWalletsFromFineract(userId);

    return {
      message: `Synced ${result.synced} wallet(s)`,
      data: {
        synced: result.synced,
        wallets: result.wallets,
      },
    };
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Chuyển tiền giữa các ví Fineract' })
  @ApiResponse({ status: 200, description: 'Chuyển khoản thành công' })
  async transfer(
    @CurrentUser('id') userId: string,
    @Body() body: TransferDto,
  ) {
    const { fromWalletId, toWalletId, amount, description } = body;
    const result = await this.walletsService.transferBetweenWallets(fromWalletId, toWalletId, amount, description);

    return result;
  }

  @Post('transfer/phone')
  @ApiOperation({ summary: 'Chuyển tiền qua số điện thoại' })
  @ApiResponse({ status: 200, description: 'Chuyển khoản thành công' })
  async transferByPhone(
    @CurrentUser('id') userId: string,
    @Body() body: TransferByPhoneDto,
  ) {
    const { fromWalletId, recipientPhone, amount, description } = body;
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    const result = await this.walletsService.transferByPhone(
      userId,
      fromWalletId,
      cleanPhone,
      amount,
      description,
    );

    return result;
  }

  @Patch(':id/default')
  @ApiOperation({ summary: 'Set a wallet as default' })
  @ApiResponse({ status: 200, description: 'Wallet set as default successful' })
  async setDefaultWallet(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    const wallet = await this.walletsService.setDefaultWallet(userId, id);

    return wallet;
  }

  @Post('transfer/account')
  @ApiOperation({ summary: 'Chuyển tiền qua số tài khoản Fineract' })
  @ApiResponse({ status: 200, description: 'Chuyển khoản thành công' })
  async transferByAccount(
    @CurrentUser('id') userId: string,
    @Body() body: TransferByAccountDto,
  ) {
    const { fromWalletId, recipientAccountNo, amount, description } = body;
    const result = await this.walletsService.transferByAccountNumber(
      userId,
      fromWalletId,
      recipientAccountNo,
      amount,
      description,
    );

    return result;
  }
}
