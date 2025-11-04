import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '@users/users.module';
import { OtpService } from './otp/otp.service';
import { JwtStrategy } from './passport/jwt.strategy';
import { LocalStrategy } from './passport/local.strategy';
import { GoogleStrategy } from './passport/google.strategy';

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
  ],
  exports: [AuthService, OtpService],
})
export class AuthModule {}
