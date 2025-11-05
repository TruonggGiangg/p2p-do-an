import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigRateController } from './config-rate.controller';
import { ConfigRateService } from './services/config-rate.service';
import { ConfigRate, ConfigRateSchema } from './schemas/config-rate.schema';
import { AuthModule } from '@auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ConfigRate.name, schema: ConfigRateSchema },
    ]),
    AuthModule,
  ],
  controllers: [ConfigRateController],
  providers: [ConfigRateService],
  exports: [ConfigRateService],
})
export class ConfigRateModule {}

