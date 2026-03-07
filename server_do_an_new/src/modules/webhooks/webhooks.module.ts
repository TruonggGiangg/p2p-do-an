import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { LoanApplication, LoanApplicationSchema } from '../loan/schemas/loan-application.schema';
import { FineractModule } from '../fineract/fineract.module';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: LoanApplication.name, schema: LoanApplicationSchema }]),
        FineractModule,
    ],
    controllers: [WebhooksController],
    providers: [WebhooksService],
    exports: [WebhooksService],
})
export class WebhooksModule { }
