import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

import { LoanController } from './loan.controller';
import { BlockchainController } from './blockchain.controller';

import { LoanService } from './loan.service';
import { LoanContract, LoanContractSchema } from './schemas';
import { BlockchainService, FineractService } from './services';
import { FineractFixedDepositService } from './services/fineract-fixed-deposit.service';
import { FixedDepositService } from './services/fixed-deposit.service';
import { CreditScoringService } from './services/credit-scoring.service';
import { InterestRateCalculatorService } from './services/interest-rate-calculator.service';
import {
    BorrowerGuard,
    LenderGuard,
    BorrowerOrLenderGuard,
    AdminGuard,
} from './guards';

// Import Investment schema for credit scoring
import { InvestmentContract, InvestmentContractSchema } from '../invest/schemas/investment-contract.schema';
// Import ReconciliationModule for TransactionLogService (use forwardRef to resolve circular dependency)
import { ReconciliationModule } from '../reconciliation/reconciliation.module';

@Module({
    imports: [
        ConfigModule,
        HttpModule.register({
            timeout: 30000,
            maxRedirects: 5,
        }),
        MongooseModule.forFeature([
            { name: LoanContract.name, schema: LoanContractSchema },
            { name: InvestmentContract.name, schema: InvestmentContractSchema }, // For credit scoring
        ]),
        forwardRef(() => ReconciliationModule), // Circular dependency resolution
    ],
    controllers: [LoanController, BlockchainController],
    providers: [
        LoanService,
        BlockchainService,
        FineractService,
        FineractFixedDepositService,
        FixedDepositService,
        CreditScoringService,
        InterestRateCalculatorService,
        // Guards
        BorrowerGuard,
        LenderGuard,
        BorrowerOrLenderGuard,
        AdminGuard,
    ],
    exports: [LoanService, BlockchainService, FineractService, FineractFixedDepositService, FixedDepositService, CreditScoringService, InterestRateCalculatorService],
})
export class LoanModule { }
