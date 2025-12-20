import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

import { LoanController } from './loan.controller';
import { BlockchainController } from './blockchain.controller';

import { LoanService } from './loan.service';
import { LoanContract, LoanContractSchema } from './schemas';
import { BlockchainService, FineractService } from './services';
import {
    BorrowerGuard,
    LenderGuard,
    BorrowerOrLenderGuard,
    AdminGuard,
} from './guards';

@Module({
    imports: [
        ConfigModule,
        HttpModule.register({
            timeout: 30000,
            maxRedirects: 5,
        }),
        MongooseModule.forFeature([
            { name: LoanContract.name, schema: LoanContractSchema },
        ]),
    ],
    controllers: [LoanController, BlockchainController],
    providers: [
        LoanService,
        BlockchainService,
        FineractService,
        // Guards
        BorrowerGuard,
        LenderGuard,
        BorrowerOrLenderGuard,
        AdminGuard,
    ],
    exports: [LoanService, BlockchainService, FineractService],
})
export class LoanModule { }
