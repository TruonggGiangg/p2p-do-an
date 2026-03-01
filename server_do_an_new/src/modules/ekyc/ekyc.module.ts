import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EkycController } from './ekyc.controller';
import { EkycService } from './ekyc.service';
import { UsersModule } from '../users/users.module';
import { FineractModule } from '../fineract/fineract.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [ConfigModule, UsersModule, FineractModule, AuthModule],
    controllers: [EkycController],
    providers: [EkycService],
    exports: [EkycService],
})
export class EkycModule { }
