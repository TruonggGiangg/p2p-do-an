import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentType, DocumentTypeSchema } from './schemas/document-type.schema';
import { LoanProductDocumentType, LoanProductDocumentTypeSchema } from './schemas/loan-product-document-type.schema';
import { LoanProductSnapshot, LoanProductSnapshotSchema } from './schemas/loan-product-snapshot.schema';
import { SavingsProductSnapshot, SavingsProductSnapshotSchema } from './schemas/savings-product-snapshot.schema';
import { SyncDriftLog, SyncDriftLogSchema } from './schemas/sync-drift-log.schema';
import { LoanSyncRun, LoanSyncRunSchema } from './schemas/loan-sync-run.schema';
import { LoanDelinquency, LoanDelinquencySchema } from '../delinquency/entities/loan-delinquency.schema';
import { DelinquencyPolicy, DelinquencyPolicySchema } from '../delinquency/entities/delinquency-policy.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { LoanApplication, LoanApplicationSchema } from '../loan/schemas/loan-application.schema';
import { LoanSupportRequest, LoanSupportRequestSchema } from '../loan/schemas/loan-support-request.schema';
import { Wallet, WalletSchema } from '../wallets/schemas/wallet.schema';
import { Notification, NotificationSchema } from '../loan/schemas/notification.schema';
import { LoanContract, LoanContractSchema } from '../loan/schemas/loan-contract.schema';
import { InvestmentOrder, InvestmentOrderSchema } from '../invest/schemas/investment-order.schema';
import { InvestmentContract, InvestmentContractSchema } from '../invest/schemas/investment-contract.schema';
import { Role, RoleSchema } from '../rbac/schemas/role.schema';
import { AdminProfileController } from './controllers/admin-profile.controller';
import { AdminProductController } from './controllers/admin-product.controller';
import { AdminCustomerController } from './controllers/admin-customer.controller';
import { AdminKycController } from './controllers/admin-kyc.controller';
import { AdminStaffController } from './controllers/admin-staff.controller';
import { AdminLoanController } from './controllers/admin-loan.controller';
import { AdminMarketController } from './controllers/admin-market.controller';
import { AdminService } from './admin.service';
import { LoanSyncScheduler } from './loan-sync.scheduler';
import { ReminderScheduler } from './reminder.scheduler';
import { FineractModule } from '../fineract/fineract.module';
import { LoanModule } from '../loan/loan.module';
import { EkycModule } from '../ekyc/ekyc.module';
import { AuthModule } from 'src/modules/auth/auth.module';
import { CaslModule } from '../casl/casl.module';
import { PushNotificationService } from '../loan/services/push-notification.service';
import { UsersModule } from '../users/users.module';
import { CreditScoreModule } from '../credit-score/credit-score.module';
import { InvestModule } from '../invest/invest.module';

import {
  AdminProductService,
  AdminCustomerService,
  AdminKycService,
  AdminStaffService,
} from './services';
import { AdminLoanService } from './services/admin-loan.service';
import { AdminMarketService } from './services/admin-market.service';

@Module({
  imports: [
    FineractModule,
    AuthModule,
    EkycModule,
    CaslModule,
    UsersModule,
    CreditScoreModule,
    forwardRef(() => LoanModule),
    forwardRef(() => InvestModule),
    MongooseModule.forFeature([
      { name: DocumentType.name, schema: DocumentTypeSchema },
      { name: LoanProductDocumentType.name, schema: LoanProductDocumentTypeSchema },
      { name: LoanProductSnapshot.name, schema: LoanProductSnapshotSchema },
      { name: SavingsProductSnapshot.name, schema: SavingsProductSnapshotSchema },
      { name: SyncDriftLog.name, schema: SyncDriftLogSchema },
      { name: LoanSyncRun.name, schema: LoanSyncRunSchema },
      { name: LoanDelinquency.name, schema: LoanDelinquencySchema },
      { name: DelinquencyPolicy.name, schema: DelinquencyPolicySchema },
      { name: User.name, schema: UserSchema },
      { name: LoanApplication.name, schema: LoanApplicationSchema },
      { name: LoanSupportRequest.name, schema: LoanSupportRequestSchema },
      { name: Wallet.name, schema: WalletSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: LoanContract.name, schema: LoanContractSchema },
      { name: Role.name, schema: RoleSchema },
      { name: InvestmentOrder.name, schema: InvestmentOrderSchema },
      { name: InvestmentContract.name, schema: InvestmentContractSchema },
    ]),
  ],
  controllers: [
    AdminProfileController,
    AdminProductController,
    AdminCustomerController,
    AdminKycController,
    AdminStaffController,
    AdminLoanController,
    AdminMarketController,
  ],
  providers: [
    AdminService,
    AdminProductService,
    AdminCustomerService,
    AdminKycService,
    AdminStaffService,
    AdminLoanService,
    AdminMarketService,
    LoanSyncScheduler,
    ReminderScheduler,
    PushNotificationService,
  ],
  exports: [AdminService],
})
export class AdminModule {}
