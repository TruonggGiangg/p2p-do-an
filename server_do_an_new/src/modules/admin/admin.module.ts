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
import { AdminController } from './admin.controller';
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

@Module({
  imports: [
    FineractModule,
    AuthModule,
    EkycModule,
    CaslModule,
    UsersModule,
    forwardRef(() => LoanModule),
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
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService, LoanSyncScheduler, ReminderScheduler, PushNotificationService],
  exports: [AdminService],
})
export class AdminModule {}
