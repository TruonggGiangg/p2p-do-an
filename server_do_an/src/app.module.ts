import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { softDeletePlugin } from 'soft-delete-plugin-mongoose';
import { UsersModule } from '@users/users.module';
import { LoansModule } from './loans/loans.module';
import { ConfigRateModule } from './config-rate/config-rate.module';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { JwtAuthGuard } from '@auth/guard/jwt-guard.strategy';
import { AuthModule } from '@auth/auth.module';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CombinedAuthGuard } from '@guard/combined-auth.guard';
import { RolesGuard } from '@auth/guard/roles.guard';
import { ResponseInterceptor } from './common/interceptor/response.interceptor';
import { AllExceptionsFilter } from './common/filter/all-exceptions.filter';
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    CommonModule, // Import CommonModule để FabricService có thể dùng toàn cục
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('URL_MONGODB'),
        connectionFactory: (connection) => {
          connection.plugin(softDeletePlugin);
          return connection;
        },
      }),
      inject: [ConfigService],
    }),
    ConfigModule.forRoot({
      isGlobal: true, // Đảm bảo có thể dùng ở mọi module
    }),

    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
        new winston.transports.File({ filename: 'app.log' }),
      ],
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          limit: 3, // Số yêu cầu tối đa trong TTL
          ttl: 1000,
          blockDuration: 2000, // Thời gian bị chặn nếu vượt quá giới hạn
        },
      ],
    }),
    UsersModule,
    AuthModule,
    LoansModule,
    ConfigRateModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    JwtAuthGuard,
    CombinedAuthGuard,
    RolesGuard,
    ThrottlerGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: CombinedAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
