import { Injectable, Logger } from '@nestjs/common';
import { FineractService } from '../fineract/fineract.service';
import { FineractLoanService } from '../fineract/services/fineract-loan.service';

@Injectable()
export class LoanService {
    private readonly logger = new Logger(LoanService.name);

    constructor(
        private readonly fineractService: FineractService,
        private readonly fineractLoanService: FineractLoanService,
    ) { }

    async getLoanProducts() {
        this.logger.log('Fetching loan products from Fineract');
        const products = await this.fineractLoanService.getLoanProducts();

        // Filter products that start with 'P' (similar to original p2p logic)
        return products.filter(p =>
            (p.shortName || '').trim().toUpperCase().startsWith('P') ||
            (p.name || '').trim().toUpperCase().includes('P2P')
        );
    }
}
