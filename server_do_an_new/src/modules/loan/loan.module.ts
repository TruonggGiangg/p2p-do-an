import { Module } from '@nestjs/common';
import { LoanController } from './loan.controller';
import { LoanService } from './loan.service';
import { FineractModule } from '../fineract/fineract.module';

@Module({
    imports: [FineractModule],
    controllers: [LoanController],
    providers: [LoanService],
    exports: [LoanService],
})
export class LoanModule { }
