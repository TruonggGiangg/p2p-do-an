import { Injectable, Logger } from '@nestjs/common';
import { FineractLoanService } from '../fineract/services/fineract-loan.service';
import { AdminService } from '../admin/admin.service';

@Injectable()
export class LoanService {
    private readonly logger = new Logger(LoanService.name);

    constructor(
        private readonly fineractLoanService: FineractLoanService,
        private readonly adminService: AdminService,
    ) { }

    async getLoanProducts() {
        this.logger.log('Fetching loan products from Fineract');
        const allProducts = await this.fineractLoanService.getLoanProducts();

        // Sync: compare with snapshot and log drift for admin (reuse fetched list)
        try {
            await this.adminService.compareAndSync(true, allProducts);
        } catch (e) {
            this.logger.warn('Sync/snapshot failed (non-blocking)', e);
        }

        // Filter products that start with 'P' (similar to original p2p logic)
        return allProducts.filter((p: any) =>
            (p.shortName || '').trim().toUpperCase().startsWith('P') ||
            (p.name || '').trim().toUpperCase().includes('P2P')
        );
    }

    /**
     * Document types required for a loan product (for app - user submitting loan).
     */
    async getDocumentTypesByProduct(productId: number) {
        const links = await this.adminService.getDocumentTypesByProduct(productId);
        return links
            .filter((l: any) => l.documentType)
            .map((l: any) => ({
                id: (l.documentType?._id ?? l.documentTypeId)?.toString?.() ?? l.documentTypeId,
                name: l.documentType?.name ?? '',
                required: l.required ?? l.documentType?.required ?? false,
                sortOrder: l.sortOrder ?? l.documentType?.sortOrder ?? 0,
            }));
    }
}
