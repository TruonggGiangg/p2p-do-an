import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Settlement, SettlementSchema } from './schemas/settlement.schema';
import { SettlementsService } from './settlements.service';
import { SettlementsController } from './settlements.controller';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Settlement.name, schema: SettlementSchema }]),
    CommonModule,
  ],
  providers: [SettlementsService],
  controllers: [SettlementsController],
  exports: [SettlementsService],
})
export class SettlementsModule {}


