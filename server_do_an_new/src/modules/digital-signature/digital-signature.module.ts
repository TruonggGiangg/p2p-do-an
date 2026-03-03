import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DigitalSignatureController } from './digital-signature.controller';
import { DigitalSignatureService } from './digital-signature.service';
import { DigitalSignature, DigitalSignatureSchema } from './schemas/digital-signature.schema';
import { LoanContract, LoanContractSchema } from '../loan/schemas/loan-contract.schema';
import { Notification, NotificationSchema } from '../loan/schemas/notification.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DigitalSignature.name, schema: DigitalSignatureSchema },
      { name: LoanContract.name, schema: LoanContractSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [DigitalSignatureController],
  providers: [DigitalSignatureService],
  exports: [DigitalSignatureService],
})
export class DigitalSignatureModule {}
