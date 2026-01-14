import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { KeycloakService } from '@auth/keycloak/keycloak.service';
import { DualAuthGuard } from '@auth/guard/dual-auth.guard';
import { FineractSignupService } from './services/fineract-signup.service';
import { LoanModule } from '../loan/loan.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    LoanModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: (configService.get<string>('JWT_EXPIRE') || '15m') as any },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, KeycloakService, DualAuthGuard, FineractSignupService],
  exports: [AuthService, KeycloakService, DualAuthGuard],
})
export class AuthModule { }
