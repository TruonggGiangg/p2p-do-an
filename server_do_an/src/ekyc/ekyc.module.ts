import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { EkycController } from './ekyc.controller';
import { EkycService } from './ekyc.service';

@Module({
    imports: [
        HttpModule.register({
            timeout: 60000,
            maxRedirects: 5,
        }),
        ConfigModule,
    ],
    controllers: [EkycController],
    providers: [EkycService],
    exports: [EkycService],
})
export class EkycModule { }
