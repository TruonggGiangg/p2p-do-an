import { Module } from '@nestjs/common';
import { SmartCAService } from './smartca.service';
import { SmartCAController } from './smartca.controller';
import { ConfigModule } from '@nestjs/config';
import smartcaConfig from 'src/config/smartca.config';

@Module({
  imports: [ConfigModule.forFeature(smartcaConfig)],
  providers: [SmartCAService],
  controllers: [SmartCAController],
  exports: [SmartCAService],
})
export class SmartCAModule {}
