import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Wallet, WalletSchema } from './schemas/wallet.schema';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { UsersModule } from '../users/users.module';
import { SmartOtpModule } from '../smart-otp/smart-otp.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Wallet.name, schema: WalletSchema }]), 
    UsersModule, 
    SmartOtpModule
  ],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [MongooseModule, WalletsService],
})
export class WalletsModule {}
