import { Controller, Post, Get, Body, Logger, Headers, Req } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import type { Request } from 'express';

@Controller('webhooks/fineract')
export class WebhooksController {
    private readonly logger = new Logger(WebhooksController.name);

    constructor(private readonly webhooksService: WebhooksService) { }

    @Get()
    async fineractPing() {
        return { status: 'ok', message: 'Fineract Webhook is alive' };
    }

    @Post()
    async handleFineractWebhook(@Body() payload: any, @Headers() headers: any, @Req() req: Request) {
        this.logger.log(`Received Fineract Webhook Payload`);

        // Process asynchronously to avoid blocking the webhook sender
        this.webhooksService.processWebhook(payload).catch((err) => {
            this.logger.error(`Error processing webhook: ${err.message}`);
        });

        return { status: 'received' };
    }
}
