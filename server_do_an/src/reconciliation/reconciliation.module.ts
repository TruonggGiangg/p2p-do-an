import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { LoanModule } from '../loan/loan.module'; // Import LoanModule to use its services
import { LoanContract, LoanContractSchema } from '../loan/schemas/loan-contract.schema';
import { InvestmentContract, InvestmentContractSchema } from '../invest/schemas/investment-contract.schema';
import { TransactionLog, TransactionLogSchema } from './schemas/transaction-log.schema';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationJob } from './jobs/reconciliation.job';
import { FDReconciliationService } from './services/fd-reconciliation.service';
import { TransactionLogService } from './services/transaction-log.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: LoanContract.name, schema: LoanContractSchema },
            { name: InvestmentContract.name, schema: InvestmentContractSchema },
            { name: TransactionLog.name, schema: TransactionLogSchema },
        ]),
        ConfigModule,
        LoanModule, // For FineractService
    ],
    controllers: [ReconciliationController],
    providers: [
        ReconciliationJob,
        FDReconciliationService,
        TransactionLogService,
    ],
    exports: [
        ReconciliationJob,
        FDReconciliationService,
        TransactionLogService,
    ],
})
export class ReconciliationModule { }
