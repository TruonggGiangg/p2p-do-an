import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentType, DocumentTypeSchema } from './schemas/document-type.schema';
import { LoanProductDocumentType, LoanProductDocumentTypeSchema } from './schemas/loan-product-document-type.schema';
import { LoanProductSnapshot, LoanProductSnapshotSchema } from './schemas/loan-product-snapshot.schema';
import { SyncDriftLog, SyncDriftLogSchema } from './schemas/sync-drift-log.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { LoanApplication, LoanApplicationSchema } from '../loan/schemas/loan-application.schema';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { FineractModule } from '../fineract/fineract.module';

@Module({
  imports: [
    FineractModule,
    MongooseModule.forFeature([
      { name: DocumentType.name, schema: DocumentTypeSchema },
      { name: LoanProductDocumentType.name, schema: LoanProductDocumentTypeSchema },
      { name: LoanProductSnapshot.name, schema: LoanProductSnapshotSchema },
      { name: SyncDriftLog.name, schema: SyncDriftLogSchema },
      { name: User.name, schema: UserSchema },
      { name: LoanApplication.name, schema: LoanApplicationSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule { }
