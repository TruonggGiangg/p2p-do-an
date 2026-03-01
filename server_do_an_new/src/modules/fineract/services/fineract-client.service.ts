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

    /**
     * Get all Fineract clients for a given officeId (default: 1 = Head Office).
     * Returns map keyed by externalId AND numeric clientId (as string) → client object.
     */
    async getClientsByOffice(officeId = 1): Promise<Map<string, any>> {
        const map = new Map<string, any>();
        try {
            let offset = 0;
            const limit = 200;
            while (true) {
                const response = await this.client.get('/clients', {
                    params: { officeId, limit, offset, orderBy: 'id', sortOrder: 'ASC' },
                });
                const items: any[] = response.data?.pageItems ?? (Array.isArray(response.data) ? response.data : []);
                if (items.length === 0) break;
                for (const c of items) {
                    if (c.externalId) map.set(c.externalId, c);
                    map.set(String(c.id), c);
                }
                if (items.length < limit) break;
                offset += limit;
            }
        } catch (error: any) {
            this.logger.warn(`[getClientsByOffice] officeId=${officeId}: ${error.message}`);
        }
        return map;
    }

    /**
     * Get Fineract loan status for a single loanId.
     * Returns { id, code, value } e.g. { id: 100, code: 'loanStatusType.pendingApproval', value: 'Submitted and pending approval' }
     */
    async getFineractLoanStatus(loanId: number): Promise<{ id: number; code: string; value: string } | null> {
        try {
            const response = await this.client.get(`/loans/${loanId}`, { params: { fields: 'id,status' } });
            return response.data?.status ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Get Fineract loan statuses for multiple loan IDs (batched 10 at a time).
     */
    async getFineractLoanStatuses(loanIds: number[]): Promise<Map<number, { id: number; code: string; value: string }>> {
        const result = new Map<number, { id: number; code: string; value: string }>();
        const chunks: number[][] = [];
        for (let i = 0; i < loanIds.length; i += 10) chunks.push(loanIds.slice(i, i + 10));
        for (const chunk of chunks) {
            await Promise.all(chunk.map(async id => {
                const status = await this.getFineractLoanStatus(id);
                if (status) result.set(id, status);
            }));
        }
        return result;
    }

    /**
     * Update client information in Fineract (PUT /clients/{clientId})
     */
    async updateClient(clientId: number, data: Record<string, any>): Promise<void> {
        try {
            const payload: any = { ...this.getCommonLocaleParams('display') };
            const allowed = ['firstname', 'lastname', 'dateOfBirth', 'externalId', 'mobileNo', 'emailAddress'];
            for (const k of allowed) {
                if (data[k] != null) payload[k] = data[k];
            }
            if (Object.keys(payload).length <= 2) return;
            await this.client.put(`/clients/${clientId}`, payload);
            this.logger.log(`[updateClient] Updated client ${clientId}`);
        } catch (error: any) {
            this.logger.warn(`[updateClient] Failed to update client ${clientId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get client identifiers for a specific Fineract client
     */
    async getClientIdentifiers(clientId: number): Promise<any[]> {
        try {
            const response = await this.client.get(`/clients/${clientId}/identifiers`);
            return response.data || [];
        } catch (error: any) {
            this.handleError(error, `Failed to get identifiers for client ${clientId}`);
            return [];
        }
    }

    /**
     * Create a new client identifier in Fineract
     */
    async createClientIdentifier(clientId: number, documentTypeId: number, documentKey: string, description: string): Promise<number> {
        try {
            const response = await this.client.post(`/clients/${clientId}/identifiers`, {
                documentTypeId,
                documentKey,
                description,
                status: 'Active',
            });
            return response.data?.resourceId;
        } catch (error: any) {
            this.handleError(error, `Failed to create identifier for client ${clientId}`);
        }
    }

    /**
     * Delete a generic Fineract Document attached to an entity
     */
    async deleteDocument(entityType: string, entityId: number, documentId: number): Promise<void> {
        try {
            await this.client.delete(`/${entityType}/${entityId}/documents/${documentId}`);
        } catch (error: any) {
            this.logger.warn(`Failed to delete document ${documentId} for ${entityType} ${entityId}: ${error.message}`);
        }
    }

    /**
     * Download/stream document content from Fineract (clients or client_identifiers)
     */
    async downloadDocument(entityType: string, entityId: number, documentId: number): Promise<any> {
        try {
            this.logger.log(`[downloadDocument] entityType=${entityType} entityId=${entityId} documentId=${documentId}`);
            const response = await this.client.get(`/${entityType}/${entityId}/documents/${documentId}/attachment`, {
                responseType: 'arraybuffer',
            });
            return response;
        } catch (error: any) {
            this.logger.error(`[downloadDocument] FAILED ${entityType}/${entityId}/documents/${documentId}: ${error.message}`);
            this.handleError(error, `Failed to download document ${documentId}`);
        }
    }

    /**
     * Get documents attached to a specific entity
     */
    async getEntityDocuments(entityType: string, entityId: number): Promise<any[]> {
        try {
            const response = await this.client.get(`/${entityType}/${entityId}/documents`);
            return response.data || [];
        } catch (error: any) {
            this.logger.warn(`Failed to get documents for ${entityType} ${entityId}: ${error.message}`);
            return [];
        }
    }

    /**
     * Upload a document to an entity in Fineract (e.g., client_identifiers)
     */
    async uploadDocument(entityType: string, entityId: number, name: string, description: string, fileBuffer: Buffer, filename: string): Promise<number> {
        try {
            // Check if document with same name exists and delete it
            const existingDocs = await this.getEntityDocuments(entityType, entityId);
            const oldDoc = existingDocs.find(d => d.name === name);
            if (oldDoc) {
                await this.deleteDocument(entityType, entityId, oldDoc.id);
            }

            const FormData = require('form-data');
            const formData = new FormData();

            formData.append('name', name);
            formData.append('description', description);
            formData.append('file', fileBuffer, {
                filename,
                contentType: 'image/jpeg',
            });

            const response = await this.client.post(`/${entityType}/${entityId}/documents`, formData, {
                headers: formData.getHeaders(),
            });

            return response.data?.resourceId;
        } catch (error: any) {
            this.handleError(error, `Failed to upload document ${name} to ${entityType} ${entityId}`);
        }
    }
}
