import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Wallet, WalletSchema } from './schemas/wallet.schema';
import { WalletTransaction, WalletTransactionSchema } from './schemas/wallet-transaction.schema';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Wallet.name, schema: WalletSchema },
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
    ]),
    UsersModule,
  ],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [MongooseModule, WalletsService],
})
export class WalletsModule {}
