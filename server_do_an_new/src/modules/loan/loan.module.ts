import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoanController } from './loan.controller';
import { LoanService } from './loan.service';
import { LoanApplication, LoanApplicationSchema } from './schemas/loan-application.schema';
import { FineractModule } from '../fineract/fineract.module';
import { AdminModule } from '../admin/admin.module';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';
import { SmartOtpModule } from '../smart-otp/smart-otp.module';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: LoanApplication.name, schema: LoanApplicationSchema }]),
        FineractModule,
        AdminModule,
        WalletsModule,
        UsersModule,
        SmartOtpModule,
    ],
    controllers: [LoanController],
    providers: [LoanService],
    exports: [LoanService],
})
export class LoanModule { }
