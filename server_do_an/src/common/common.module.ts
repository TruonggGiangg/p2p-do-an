import { Global, Module } from '@nestjs/common';
import { FabricService } from './services/fabric.service';

@Global() // Để FabricService có thể dùng ở mọi module mà không cần import
@Module({
  providers: [FabricService],
  exports: [FabricService], // Export để các module khác có thể dùng
})
export class CommonModule {}

