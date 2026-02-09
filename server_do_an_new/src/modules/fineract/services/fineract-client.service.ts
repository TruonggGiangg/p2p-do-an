import { Injectable, Inject } from '@nestjs/common';
import { type AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';

import { FINERACT_AXIOS_CLIENT } from '../fineract.constants';
import { FineractBaseService } from './fineract-base.service';

export interface FineractClientData {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email?: string;
    officeId?: number;
    legalFormId?: number;
}

/**
 * FineractClientService - Client management operations
 */
@Injectable()
export class FineractClientService extends FineractBaseService {
    constructor(
        @Inject(FINERACT_AXIOS_CLIENT) private readonly client: AxiosInstance,
        configService: ConfigService,
    ) {
        super(configService);
    }

    /**
     * Create a new client in Fineract
     */
    async createClient(data: FineractClientData): Promise<number> {
        const today = this.getTodayFormatted('display');
        const officeId = data.officeId || this.getDefaultConfig<number>('officeId');
        const legalFormId = data.legalFormId || this.getDefaultConfig<number>('legalFormId');

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
                ...this.getCommonLocaleParams('display'),
            });

            return response.data.resourceId || response.data.clientId;
        } catch (error: any) {
            this.handleError(error, 'Failed to create Fineract client');
        }
    }

    /**
     * Search clients by parameters
     */
    private async searchClients(params: any): Promise<any | null> {
        const response = await this.client.get('/clients', { params });
        const data = response.data?.pageItems || (Array.isArray(response.data) ? response.data : []);
        return data.length > 0 ? data[0] : null;
    }

    /**
     * Find client by identifier (externalId, phone, etc.)
     */
    async findClientByIdentifier(identifier: string): Promise<any | null> {
        try {
            this.logger.debug(`Searching for Fineract client using: ${identifier}`);

            // 1. Search by externalId (direct match)
            const matchByExt = await this.searchClients({ externalId: identifier });
            if (matchByExt) return matchByExt;

            // 2. Try heuristic transformation (borrower1 -> BORROWER_1)
            const heuristicId = identifier.toUpperCase().replace(/(\D+)(\d+)/, '$1_$2');
            if (heuristicId !== identifier.toUpperCase()) {
                const matchByH = await this.searchClients({ externalId: heuristicId });
                if (matchByH) return matchByH;
            }

            // 3. Search by mobileNo
            const searchPhone = identifier.replace(/\D/g, '');
            if (searchPhone.length >= 9) {
                const matchByPhone = await this.searchClients({ mobileNo: searchPhone });
                if (matchByPhone && (matchByPhone.mobileNo || '').replace(/\D/g, '') === searchPhone) {
                    return matchByPhone;
                }
            }

            return null;
        } catch (error: any) {
            this.logger.error(`Error finding client by identifier ${identifier}: ${error.message}`);
            return null;
        }
    }
}
