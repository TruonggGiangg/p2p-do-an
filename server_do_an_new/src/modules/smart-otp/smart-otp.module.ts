import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SmartOtpController } from './smart-otp.controller';
import { SmartOtpService } from './services/smart-otp.service';
import { TotpService } from './services/totp.service';
import { SignatureService } from './services/signature.service';
import { DeviceBindingService } from './services/device-binding.service';
import { OtpSessionService } from './services/otp-session.service';
import { DeviceBinding, DeviceBindingSchema } from './schemas/device-binding.schema';
import { TransactionOtp, TransactionOtpSchema } from './schemas/transaction-otp.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DeviceBinding.name, schema: DeviceBindingSchema },
      { name: TransactionOtp.name, schema: TransactionOtpSchema },
    ]),
    UsersModule,
  ],
  controllers: [SmartOtpController],
  providers: [
    SmartOtpService,
    TotpService,
    SignatureService,
    DeviceBindingService,
    OtpSessionService,
  ],
  exports: [SmartOtpService],
})
export class SmartOtpModule {}
