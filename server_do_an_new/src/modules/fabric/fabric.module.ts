import { Module, Global } from '@nestjs/common';
import { FabricService } from './fabric.service';
import { FabricController } from './fabric.controller';

@Global()
@Module({
  controllers: [FabricController],
  providers: [FabricService],
  exports: [FabricService],
})
export class FabricModule {}
