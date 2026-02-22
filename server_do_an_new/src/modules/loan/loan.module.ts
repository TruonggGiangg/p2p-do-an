import { Module } from '@nestjs/common';
import { LoanController } from './loan.controller';
import { LoanService } from './loan.service';
import { FineractModule } from '../fineract/fineract.module';
import { AdminModule } from '../admin/admin.module';

@Module({
    imports: [FineractModule, AdminModule],
    controllers: [LoanController],
    providers: [LoanService],
    exports: [LoanService],
})
export class LoanModule { }
