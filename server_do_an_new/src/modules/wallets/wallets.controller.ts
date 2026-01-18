import {
    Controller,
    Get,
    Post,
    Param,
    UseGuards,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletsService } from './wallets.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('wallets')
@ApiBearerAuth()
@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
    constructor(private readonly walletsService: WalletsService) { }

    @Get()
    @ApiOperation({ summary: 'Get all wallets for current user' })
    @ApiResponse({ status: 200, description: 'Returns list of wallets' })
    async getWallets(@CurrentUser() user: any) {
        const userId = user._id;
        const wallets = await this.walletsService.getWalletsByUserId(userId);
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
    @ApiResponse({ status: 501, description: 'Not implemented - wallets are created via Fineract' })
    async createWallet() {
        return {
            statusCode: HttpStatus.NOT_IMPLEMENTED,
            message: 'Tạo ví mới phải thông qua Fineract. Vui lòng sử dụng POST /api/wallets/sync để đồng bộ ví.',
        };
    }

    @Get('balance')
    @ApiOperation({ summary: 'Get total balance across all wallets' })
    @ApiResponse({ status: 200, description: 'Returns total balance' })
    async getTotalBalance(@CurrentUser() user: any) {
        const balance = await this.walletsService.getTotalBalance(user._id);

        return {
            statusCode: HttpStatus.OK,
            data: balance,
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
    async syncWallets(@CurrentUser() user: any) {
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
}
