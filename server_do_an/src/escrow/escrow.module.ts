import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Escrow, EscrowSchema } from './schemas/escrow.schema';
import { EscrowLog, EscrowLogSchema } from './schemas/escrow-log.schema';
import { FineractEscrowService } from './services/fineract-escrow.service';
import { LoanModule } from '../loan/loan.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Escrow.name, schema: EscrowSchema },
            { name: EscrowLog.name, schema: EscrowLogSchema },
        ]),
        LoanModule, // For FineractService
    ],
    providers: [FineractEscrowService],
    exports: [FineractEscrowService],
})
export class EscrowModule { }
