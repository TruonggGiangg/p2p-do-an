import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FineractSignupService } from './services/fineract-signup.service';
import { UserSyncService } from './services/user-sync.service';
import { PinService } from './services/pin.service';

import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { WalletsModule } from '../wallets/wallets.module';
import { Wallet, WalletSchema } from '../wallets/schemas/wallet.schema';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { SmartOtpModule } from '../smart-otp/smart-otp.module';

@Module({
  imports: [
    PassportModule,
    UsersModule,
    WalletsModule,
    MongooseModule.forFeature([{ name: Wallet.name, schema: WalletSchema }]),
    TwoFactorModule,
    SmartOtpModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRE') || '1h') as any,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, FineractSignupService, UserSyncService, PinService, JwtStrategy],

  exports: [AuthService, JwtStrategy, FineractSignupService, PinService],
})
export class AuthModule {}
