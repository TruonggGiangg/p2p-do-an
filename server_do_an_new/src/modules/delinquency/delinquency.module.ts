import { Module, forwardRef } from '@nestjs/common';
import { DelinquencyController } from './delinquency.controller';
import { DelinquencyService } from './delinquency.service';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [forwardRef(() => AdminModule)],
  controllers: [DelinquencyController],
  providers: [DelinquencyService],
  exports: [DelinquencyService],
})
export class DelinquencyModule {}
