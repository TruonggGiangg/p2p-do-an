import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { LoanContract, LoanContractSchema } from '../loan/schemas/loan-contract.schema';
import {
    InvestmentContract,
    InvestmentContractSchema,
} from '../invest/schemas/investment-contract.schema';
import {
    TransactionLog,
    TransactionLogSchema,
} from './schemas/transaction-log.schema';
import { ReconciliationService } from './services/reconciliation.service';
import { ReconciliationCron } from './services/reconciliation.cron';
import { TransactionLogService } from './services/transaction-log.service';
import { ReconciliationController } from './reconciliation.controller';
import { FineractService } from '../loan/services/fineract.service';
import { FixedDepositService } from '../loan/services/fixed-deposit.service';
import { LoanModule } from '../loan/loan.module';

@Module({
    imports: [
        // Import ScheduleModule để enable cron jobs
        ScheduleModule.forRoot(),

        // MongoDB schemas
        MongooseModule.forFeature([
            { name: LoanContract.name, schema: LoanContractSchema },
            { name: InvestmentContract.name, schema: InvestmentContractSchema },
            { name: TransactionLog.name, schema: TransactionLogSchema },
        ]),

        // Import LoanModule để có FineractService, FixedDepositService, InterestRateCalculatorService
        LoanModule,

        // Dependencies from other modules
        HttpModule,
        ConfigModule,
    ],
    controllers: [ReconciliationController],
    providers: [
        ReconciliationService,
        ReconciliationCron,
        TransactionLogService,
        // FineractService và FixedDepositService đã được provide bởi LoanModule
    ],
    exports: [ReconciliationService, ReconciliationCron, TransactionLogService],
})
export class ReconciliationModule { }
