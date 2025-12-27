import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

import { InvestController } from './invest.controller';
import { InvestService } from './invest.service';
import { InvestmentContract, InvestmentContractSchema } from './schemas';
import { LoanContract, LoanContractSchema } from '../loan/schemas';
import { FineractService } from '../loan/services/fineract.service';
import { EscrowModule } from '../escrow/escrow.module';
import { LoanModule } from '../loan/loan.module'; // Import for FixedDepositService
import { ReconciliationModule } from '../reconciliation/reconciliation.module'; // Import for TransactionLogService

@Module({
    imports: [
        ConfigModule,
        HttpModule.register({
            timeout: 30000,
            maxRedirects: 5,
        }),
        MongooseModule.forFeature([
            { name: InvestmentContract.name, schema: InvestmentContractSchema },
            { name: LoanContract.name, schema: LoanContractSchema },
        ]),
        EscrowModule, // Import for FineractEscrowService
        LoanModule, // Import for FixedDepositService
        forwardRef(() => ReconciliationModule), // Import for TransactionLogService (avoid circular dependency)
    ],
    controllers: [InvestController],
    providers: [InvestService, FineractService],
    exports: [InvestService],
})
export class InvestModule { }
