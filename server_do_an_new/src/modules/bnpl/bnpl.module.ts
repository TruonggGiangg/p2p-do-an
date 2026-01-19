import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BnplController } from './bnpl.controller';
import { BnplService } from './bnpl.service';
import { BnplWallet, BnplWalletSchema } from './schemas/bnpl-wallet.schema';
import { BnplLoan, BnplLoanSchema } from './schemas/bnpl-loan.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { FineractModule } from '../fineract/fineract.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: BnplWallet.name, schema: BnplWalletSchema },
            { name: BnplLoan.name, schema: BnplLoanSchema },
            { name: User.name, schema: UserSchema },
        ]),
        FineractModule,
    ],
    controllers: [BnplController],
    providers: [BnplService],
    exports: [BnplService],
})
export class BnplModule { }
