import { Injectable, Logger, Inject, BadRequestException } from '@nestjs/common';
import { type AxiosInstance } from 'axios';

import { FINERACT_AXIOS_CLIENT } from './fineract.constants';

import { ConfigService } from '@nestjs/config';

export interface FineractClientData {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email?: string;
    officeId?: number;
    legalFormId?: number;
}

@Injectable()
export class FineractService {
    private readonly logger = new Logger(FineractService.name);

    constructor(
        @Inject(FINERACT_AXIOS_CLIENT) private readonly client: AxiosInstance,
        private readonly configService: ConfigService,
    ) { }

    /**
     * Create a new client in Fineract
     */
    async createClient(data: FineractClientData): Promise<number> {
        const today = new Date().toLocaleDateString('en-GB', {
            day: '2-digit', month: 'long', year: 'numeric',
        });

        const officeId = data.officeId || this.configService.get<number>('defaults.officeId') || 1;
        const legalFormId = data.legalFormId || this.configService.get<number>('defaults.legalFormId') || 1;

        try {
            const response = await this.client.post('/clients', {
                officeId,
                legalFormId,
                firstname: data.firstName,
                lastname: data.lastName,
                externalId: data.phoneNumber,
                mobileNo: data.phoneNumber,
                emailAddress: data.email,
                active: true,
                activationDate: today,
                locale: this.configService.get<string>('defaults.locale'),
                dateFormat: this.configService.get<string>('defaults.dateFormat'),
            });


            return response.data.resourceId || response.data.clientId;
        } catch (error: any) {
            this.handleError(error, 'Failed to create Fineract client');
        }
    }

    async findClientByIdentifier(identifier: string): Promise<any | null> {
        try {
            this.logger.debug(`Searching for Fineract client using: ${identifier}`);

            // 1. Search by externalId (direct match)
            const extResponse = await this.client.get('/clients', { params: { externalId: identifier } });
            const extClients = extResponse.data?.pageItems || extResponse.data || [];
            const matchByExt = extClients.find((c: any) => c.externalId === identifier);
            if (matchByExt) return matchByExt;

            // 2. Try heuristic transformation (borrower1 -> BORROWER_1)
            const heuristicId = identifier.toUpperCase().replace(/(\D+)(\d+)/, '$1_$2');
            if (heuristicId !== identifier.toUpperCase()) {
                const hResponse = await this.client.get('/clients', { params: { externalId: heuristicId } });
                const hClients = hResponse.data?.pageItems || hResponse.data || [];
                const matchByH = hClients.find((c: any) => c.externalId === heuristicId);
                if (matchByH) return matchByH;
            }

            // 3. Search by mobileNo
            const searchPhone = identifier.replace(/\D/g, '');
            if (searchPhone.length >= 9) {
                const mobileResponse = await this.client.get('/clients', { params: { mobileNo: searchPhone } });
                const mobileClients = mobileResponse.data?.pageItems || mobileResponse.data || [];
                const matchByPhone = mobileClients.find((c: any) => (c.mobileNo || '').replace(/\D/g, '') === searchPhone);
                if (matchByPhone) return matchByPhone;
            }

            return null;
        } catch (error: any) {
            this.logger.error(`Error finding client by identifier ${identifier}: ${error.message}`);
            return null;
        }
    }


    /**
     * Get all savings accounts for a client
     */
    async getSavingsAccounts(clientId: number): Promise<any[]> {
        try {
            const response = await this.client.get(`/clients/${clientId}/accounts`);
            return response.data?.savingsAccounts || [];
        } catch (error) {
            this.logger.error(`Failed to get savings accounts for client ${clientId}`);
            return [];
        }
    }

    /**
     * Get detailed savings account info
     */
    async getSavingsAccountDetails(savingsId: string): Promise<any> {
        try {
            const response = await this.client.get(`/savingsaccounts/${savingsId}`);
            return response.data;
        } catch (error: any) {
            this.handleError(error, `Failed to get savings account ${savingsId}`);
        }
    }

    /**
     * Determine wallet type based on Fineract account data
     */
    getWalletType(savingsData: any): 'credit_wallet' | 'e_wallet' {
        // match by Product ID
        const productId = savingsData.savingsProductId || savingsData.productId;
        const configCreditId = this.configService.get<number>('defaults.creditWalletProductId');
        const configEwalletId = this.configService.get<number>('defaults.ewalletProductId');

        if (productId && productId === configCreditId) return 'credit_wallet';
        if (productId && productId === configEwalletId) return 'e_wallet';

        return 'e_wallet';
    }


    /**
     * Common error handler for senior-level logging and exceptions
     */
    private handleError(error: any, context: string): never {

        const errorData = error.response?.data;
        this.logger.error(`${context}: ${JSON.stringify(errorData || error.message)}`);

        if (errorData?.errors?.length > 0) {
            throw new BadRequestException(errorData.errors[0].defaultUserMessage || context);
        }

        throw new BadRequestException(context);
    }
}
