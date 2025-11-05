import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '@users/users.module';
import { OtpService } from '@auth/otp/otp.service';
import { JwtStrategy } from '@auth/passport/jwt.strategy';
import { LocalStrategy } from '@auth/passport/local.strategy';
import { GoogleStrategy } from '@auth/passport/google.strategy';
import { JwtAuthGuard } from '@auth/guard/jwt-guard.strategy';
import { RolesGuard } from '@auth/guard/roles.guard';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'JUSTSECRET',
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRE') || '15m') as any,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    JwtStrategy,
    LocalStrategy,
    GoogleStrategy,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, OtpService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
