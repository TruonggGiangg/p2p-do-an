import { Controller, Post, Body, Res, Req, UseGuards, HttpStatus, Logger, Get, Query } from '@nestjs/common';
import type { Response, Request } from 'express';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DualAuthGuard } from '../auth/guard/dual-auth.guard';
import { WalletService } from './services/wallet.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Wallet, WalletDocument } from '../invest/schemas/wallet.schema';
import { FineractService } from '../loan/services/fineract.service';

@Controller('wallet')
@UseGuards(DualAuthGuard)
export class WalletController {
    private readonly logger = new Logger(WalletController.name);

    constructor(
        private readonly walletService: WalletService,
        private readonly fineractService: FineractService,
        @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    ) { }

    @Get('balance')
    async getBalance(@Req() req: Request, @Res() res: Response) {
        try {
            const user = req.user as any;
            const userId = user.username || user.keycloakUserId || user._id; // Use username first!

            const balance = await this.walletService.getWalletBalance(userId);
            return res.status(HttpStatus.OK).json({ success: true, ...balance });
        } catch (error) {
            this.logger.error(`Get balance error: ${error.message}`);
            return res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
        }
    }

    @Get('transactions')
    async getTransactions(@Req() req: Request, @Query() query: any, @Res() res: Response) {
        try {
            const user = req.user as any;
            const userId = user.username || user.keycloakUserId || user._id; // Use username first!
            const { limit, offset } = query;

            const transactions = await this.walletService.getWalletTransactions(userId, limit, offset);
            return res.status(HttpStatus.OK).json({ success: true, ...transactions });
        } catch (error) {
            this.logger.error(`Get transactions error: ${error.message}`);
            return res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
        }
    }

    @Post('link')
    async linkWallet(@Body() body: any, @Req() req: Request, @Res() res: Response) {
        try {
            const { fineractClientId, phone } = body;
            const user = req.user as any;
            const userId = user.username || user.keycloakUserId || user._id; // Use username first!

            // Simple linking logic for demo: Create or update Wallet record
            // In prod, verify OTP or Fineract ownership

            let wallet = await this.walletModel.findOne({ p2pUserId: userId });
            if (!wallet) {
                wallet = new this.walletModel({
                    p2pUserId: userId,
                    fineractClientId,
                    phone,
                    isLinked: true,
                    metadata: {}
                });
            } else {
                wallet.fineractClientId = fineractClientId;
                wallet.phone = phone;
                wallet.isLinked = true;
            }

            await wallet.save();
            return res.status(HttpStatus.OK).json({ success: true, message: 'Wallet linked successfully', wallet });

        } catch (error) {
            this.logger.error(`Link wallet error: ${error.message}`);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
        }
    }

    @Post('transfer')
    async transfer(@Body() body: any, @Req() req: Request, @Res() res: Response) {
        try {
            const { recipientPhone, amount, note } = body;
            const user = req.user as any;
            const senderUsername = user.username || user.keycloakUserId;

            this.logger.log(`[transfer] Request: ${senderUsername} → ${recipientPhone}, ${amount} VND`);

            if (!recipientPhone || !amount) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    message: 'Thiếu thông tin: recipientPhone hoặc amount'
                });
            }

            const result = await this.walletService.transfer(senderUsername, recipientPhone, amount, note);

            return res.status(HttpStatus.OK).json({
                success: true,
                ...result
            });

        } catch (error) {
            this.logger.error(`Transfer error: ${error.message}`);
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: error.message
            });
        }
    }
}
