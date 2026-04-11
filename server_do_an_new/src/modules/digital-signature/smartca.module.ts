import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { SmartCAService } from './smartca.service';
import { DigitalSignatureController } from './smartca.controller';
import { DigitalSignature, DigitalSignatureSchema } from './schemas/digital-signature.schema';
import { LoanContract, LoanContractSchema } from '../loan/schemas/loan-contract.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import smartcaConfig from 'src/config/smartca.config';

@Module({
  imports: [
    ConfigModule.forFeature(smartcaConfig),
    MongooseModule.forFeature([
      { name: DigitalSignature.name, schema: DigitalSignatureSchema },
      { name: LoanContract.name, schema: LoanContractSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [SmartCAService],
  controllers: [DigitalSignatureController],
  exports: [SmartCAService],
})
export class SmartCAModule {}
