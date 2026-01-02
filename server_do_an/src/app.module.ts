import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '@auth/auth.module';
import { LoanModule } from './loan/loan.module';
import { InvestModule } from './invest/invest.module';
import { RepaymentModule } from './repayment/repayment.module';
import { WalletModule } from './wallet/wallet.module';
import { EscrowModule } from './escrow/escrow.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { EkycModule } from './ekyc/ekyc.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // MongoDB connection
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI') || 'mongodb://localhost:27017/p2p_lending',
      }),
      inject: [ConfigService],
    }),
    // Rate limiting: 100 requests per minute globally (increased for development)
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    AuthModule,
    LoanModule,
    InvestModule,
    RepaymentModule,
    WalletModule,
    EscrowModule,
    ReconciliationModule,
    EkycModule,
  ],

  controllers: [AppController],
  providers: [
    AppService,
    // Apply rate limiting globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
