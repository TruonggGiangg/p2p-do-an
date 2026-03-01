import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EkycController } from './ekyc.controller';
import { EkycService } from './ekyc.service';

@Module({
    imports: [ConfigModule],
    controllers: [EkycController],
    providers: [EkycService],
    exports: [EkycService],
})
export class EkycModule { }
