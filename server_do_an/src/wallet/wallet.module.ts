import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { WalletController } from './wallet.controller';
import { WalletService } from './services/wallet.service';
import { FineractService } from '../loan/services/fineract.service';
import { Wallet, WalletSchema } from '../invest/schemas/wallet.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Wallet.name, schema: WalletSchema },
        ]),
        ConfigModule,
        HttpModule,
    ],
    controllers: [WalletController],
    providers: [
        WalletService,
        FineractService,
    ],
    exports: [WalletService]
})
export class WalletModule { }
