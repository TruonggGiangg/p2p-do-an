import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoansController } from './loans.controller';
import { LoansService } from './services/loans.service';
import { HyperledgerService } from './services/hyperledger.service';
import { Loan, LoanSchema } from './schemas/loan.schema';
import { AuthModule } from '@auth/auth.module';
import { ConfigRateModule } from '../config-rate/config-rate.module';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Loan.name, schema: LoanSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
    ThrottlerModule,
    ConfigRateModule, // Import ConfigRateModule để dùng ConfigRateService
  ],
  controllers: [LoansController],
  providers: [LoansService, HyperledgerService],
  exports: [LoansService, HyperledgerService],
})
export class LoansModule {}

