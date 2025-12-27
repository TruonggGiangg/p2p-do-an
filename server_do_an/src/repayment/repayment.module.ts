import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { RepaymentController } from './repayment.controller';
import { RepaymentService } from './services/repayment.service';
import { EscrowService } from './services/escrow.service';
import { Escrow, EscrowSchema } from './schemas/escrow.schema';
import { EscrowLog, EscrowLogSchema } from '../escrow/schemas/escrow-log.schema';
import { FineractService } from '../loan/services/fineract.service';
import { FineractFixedDepositService } from '../loan/services/fineract-fixed-deposit.service';
import { FineractEscrowService } from '../escrow/services/fineract-escrow.service';
import { LoanContract, LoanContractSchema } from '../loan/schemas/loan-contract.schema';
import { InvestmentContract, InvestmentContractSchema } from '../invest/schemas/investment-contract.schema';
import { Wallet, WalletSchema } from '../invest/schemas/wallet.schema';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Escrow.name, schema: EscrowSchema },
            { name: EscrowLog.name, schema: EscrowLogSchema },
            { name: LoanContract.name, schema: LoanContractSchema },
            { name: InvestmentContract.name, schema: InvestmentContractSchema },
            { name: Wallet.name, schema: WalletSchema },
        ]),
        ConfigModule,
        HttpModule,
        forwardRef(() => ReconciliationModule), // Import for TransactionLogService
    ],
    controllers: [RepaymentController],
    providers: [
        RepaymentService,
        EscrowService,
        FineractService,
        FineractFixedDepositService,
        FineractEscrowService,
    ],
    exports: [RepaymentService, EscrowService]
})
export class RepaymentModule { }
