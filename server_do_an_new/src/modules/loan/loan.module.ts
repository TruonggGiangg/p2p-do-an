import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoanController } from './loan.controller';
import { LoanService } from './loan.service';
import { RepaymentService } from './repayment.service';
import { ContractService } from './contract.service';
import { LoanApplication, LoanApplicationSchema } from './schemas/loan-application.schema';
import { LoanContract, LoanContractSchema } from './schemas/loan-contract.schema';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { FineractModule } from '../fineract/fineract.module';
import { AdminModule } from '../admin/admin.module';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';
import { SmartOtpModule } from '../smart-otp/smart-otp.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LoanApplication.name, schema: LoanApplicationSchema },
      { name: LoanContract.name, schema: LoanContractSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
    FineractModule,
    forwardRef(() => AdminModule),
    WalletsModule,
    UsersModule,
    SmartOtpModule,
  ],
  controllers: [LoanController],
  providers: [LoanService, RepaymentService, ContractService],
  exports: [LoanService, RepaymentService, ContractService],
})
export class LoanModule {}
