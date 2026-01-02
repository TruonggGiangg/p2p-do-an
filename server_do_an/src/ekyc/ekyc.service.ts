import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';

export interface KycImagesResult {
    success: boolean;
    hasImages: boolean;
    identifierId?: number;
    identifierInfo?: {
        documentKey: string;
        description: string;
    };
    images: Array<{
        id: number;
        name: string;
        fileName: string;
        description: string;
        downloadUrl: string;
    }>;
    message?: string;
}

interface UploadCccdResult {
    success: boolean;
    frontDocId?: number;
    backDocId?: number;
    identifierId?: number;
    error?: string;
}

@Injectable()
export class EkycService {
    private readonly logger = new Logger(EkycService.name);

    private readonly fineractBaseUrl: string;
    private readonly tenantId: string;
    private readonly oauthClientId: string;
    private readonly oauthClientSecret: string;
    private readonly username: string;
    private readonly password: string;
    private readonly keycloakUrl: string;

    // eKYC Python service config
    private readonly ekycServiceUrl: string;

    // Bypass flag cho face matching
    private readonly bypassFaceMatching: boolean;

    private accessToken: string | null = null;
    private tokenExpiry: Date | null = null;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.fineractBaseUrl = this.configService.get<string>('FINERACT_BASE_URL') || 'http://localhost:8080';
        this.tenantId = this.configService.get<string>('FINERACT_TENANT_ID') || 'default';
        this.username = this.configService.get<string>('FINERACT_USERNAME') || 'mifos';
        this.password = this.configService.get<string>('FINERACT_PASSWORD') || 'password';
        this.oauthClientId = this.configService.get<string>('FINERACT_OAUTH_CLIENT_ID') || 'community-app';
        this.oauthClientSecret = this.configService.get<string>('FINERACT_OAUTH_CLIENT_SECRET') || '123';
        this.keycloakUrl = this.configService.get<string>('KEYCLOAK_BASE_URL') || 'http://118.69.41.95:9000';

        // eKYC Python service - chung với p2p project
        this.ekycServiceUrl = this.configService.get<string>('EKYC_SERVICE_URL') || 'http://10.10.3.114:8000';

        // ⚠️ BYPASS FLAG - Set true để tạm thời bỏ qua face matching
        // Set false (hoặc bỏ env var) để bật kiểm tra face matching
        this.bypassFaceMatching = this.configService.get<string>('EKYC_BYPASS_FACE_MATCHING') === 'true';

        if (this.bypassFaceMatching) {
            this.logger.warn('⚠️ BYPASS MODE: Face matching check is DISABLED');
        }
    }

    /**
     * Get OAuth2 token from Keycloak for Fineract API
     */
    private async getOAuth2Token(): Promise<string> {
        if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
            return this.accessToken;
        }

        try {
            const tokenUrl = `${this.keycloakUrl}/realms/fineract/protocol/openid-connect/token`;

            const params = new URLSearchParams();
            params.append('grant_type', 'password');
            params.append('client_id', this.oauthClientId);
            params.append('client_secret', this.oauthClientSecret);
            params.append('username', this.username);
            params.append('password', this.password);

            const response = await firstValueFrom(
                this.httpService.post(tokenUrl, params.toString(), {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 15000,
                }),
            );

            this.accessToken = response.data.access_token;
            const expiresIn = (response.data.expires_in || 3600) - 60;
            this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);

            return this.accessToken as string;
        } catch (error: any) {
            this.logger.error(`Failed to get OAuth2 token: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get headers for Fineract API
     */
    private async getFineractHeaders(): Promise<Record<string, string>> {
        const token = await this.getOAuth2Token();
        return {
            'Authorization': `Bearer ${token}`,
            'Fineract-Platform-TenantId': this.tenantId,
            'Content-Type': 'application/json',
        };
    }

    /**
     * Check if bypass mode is enabled
     */
    isBypassEnabled(): boolean {
        return this.bypassFaceMatching;
    }

    /**
     * Get existing CCCD images from Fineract Client Identifiers
     */
    async getKycImages(fineractClientId: number): Promise<KycImagesResult> {
        if (!fineractClientId) {
            return {
                success: true,
                hasImages: false,
                images: [],
                message: 'Chưa có thông tin CCCD',
            };
        }

        try {
            const headers = await this.getFineractHeaders();

            // 1. Get client identifiers
            const identifiersRes = await firstValueFrom(
                this.httpService.get(
                    `${this.fineractBaseUrl}/fineract-provider/api/v1/clients/${fineractClientId}/identifiers`,
                    { headers },
                ),
            );

            const identifiers = identifiersRes.data || [];
            if (identifiers.length === 0) {
                return {
                    success: true,
                    hasImages: false,
                    images: [],
                    message: 'Chưa có thông tin CCCD',
                };
            }

            // 2. Find CCCD identifier (Passport type = 1)
            const cccdIdentifier = identifiers.find(
                (id: any) => id.documentType?.id === 1 || id.documentTypeId === 1,
            );

            if (!cccdIdentifier) {
                return {
                    success: true,
                    hasImages: false,
                    images: [],
                    message: 'Chưa có thông tin CCCD',
                };
            }

            // 3. Get documents of identifier
            const docsRes = await firstValueFrom(
                this.httpService.get(
                    `${this.fineractBaseUrl}/fineract-provider/api/v1/client_identifiers/${cccdIdentifier.id}/documents`,
                    { headers },
                ),
            );

            const documents = docsRes.data || [];
            if (documents.length === 0) {
                return {
                    success: true,
                    hasImages: false,
                    identifierId: cccdIdentifier.id,
                    identifierInfo: {
                        documentKey: cccdIdentifier.documentKey,
                        description: cccdIdentifier.description,
                    },
                    images: [],
                    message: 'Có identifier nhưng chưa có ảnh',
                };
            }

            // 4. Map documents to response
            const images = documents.map((doc: any) => ({
                id: doc.id,
                name: doc.name,
                fileName: doc.fileName,
                description: doc.description,
                downloadUrl: `/ekyc/images/${cccdIdentifier.id}/${doc.id}`,
            }));

            this.logger.log(`[getKycImages] Found ${images.length} images for client ${fineractClientId}`);

            return {
                success: true,
                hasImages: true,
                identifierId: cccdIdentifier.id,
                identifierInfo: {
                    documentKey: cccdIdentifier.documentKey,
                    description: cccdIdentifier.description,
                },
                images,
            };
        } catch (error: any) {
            this.logger.error(`[getKycImages] Error: ${error.message}`);
            return {
                success: false,
                hasImages: false,
                images: [],
                message: 'Lỗi khi lấy thông tin CCCD',
            };
        }
    }

    /**
     * Download CCCD image from Fineract (proxy)
     */
    async downloadKycImage(identifierId: number, documentId: number): Promise<Buffer | null> {
        try {
            const headers = await this.getFineractHeaders();
            delete headers['Content-Type']; // Remove for binary response

            const response = await firstValueFrom(
                this.httpService.get(
                    `${this.fineractBaseUrl}/fineract-provider/api/v1/client_identifiers/${identifierId}/documents/${documentId}/attachment`,
                    { headers, responseType: 'arraybuffer' },
                ),
            );

            return Buffer.from(response.data);
        } catch (error: any) {
            this.logger.error(`[downloadKycImage] Error: ${error.message}`);
            return null;
        }
    }

    /**
     * Upload CCCD images to Fineract Client Identifiers
     */
    async uploadCccdToFineract(
        fineractClientId: number,
        frontBase64: string,
        backBase64: string,
        ocrData: any,
    ): Promise<UploadCccdResult> {
        try {
            const headers = await this.getFineractHeaders();
            const result: UploadCccdResult = { success: false };

            // 1. Find or create identifier
            let identifierId: number | null = null;

            const identifiersRes = await firstValueFrom(
                this.httpService.get(
                    `${this.fineractBaseUrl}/fineract-provider/api/v1/clients/${fineractClientId}/identifiers`,
                    { headers },
                ),
            );

            const identifiers = identifiersRes.data || [];
            const existing = identifiers.find(
                (id: any) => id.documentType?.id === 1 || id.documentTypeId === 1,
            );

            if (existing) {
                identifierId = existing.id;
                this.logger.log(`[uploadCccd] Found existing identifier: ${identifierId}`);
            } else {
                // Create new identifier
                const createRes = await firstValueFrom(
                    this.httpService.post(
                        `${this.fineractBaseUrl}/fineract-provider/api/v1/clients/${fineractClientId}/identifiers`,
                        {
                            documentTypeId: 1,
                            documentKey: 'CCCD',
                            description: `CCCD - ${ocrData?.idNumber || ocrData?.fullName || 'KYC'}`,
                            status: 'Active',
                        },
                        { headers },
                    ),
                );
                identifierId = createRes.data?.resourceId;
                this.logger.log(`[uploadCccd] Created new identifier: ${identifierId}`);
            }

            if (!identifierId) {
                return { success: false, error: 'Failed to get/create identifier' };
            }

            result.identifierId = identifierId;

            // 2. Upload documents
            const uploadDoc = async (base64: string, docName: string, description: string): Promise<number | null> => {
                if (!base64) return null;

                // Delete old doc if exists
                try {
                    const docsRes = await firstValueFrom(
                        this.httpService.get(
                            `${this.fineractBaseUrl}/fineract-provider/api/v1/client_identifiers/${identifierId}/documents`,
                            { headers },
                        ),
                    );
                    const oldDoc = (docsRes.data || []).find((d: any) => d.name === docName);
                    if (oldDoc) {
                        await firstValueFrom(
                            this.httpService.delete(
                                `${this.fineractBaseUrl}/fineract-provider/api/v1/client_identifiers/${identifierId}/documents/${oldDoc.id}`,
                                { headers },
                            ),
                        );
                        this.logger.log(`[uploadCccd] Deleted old document: ${docName}`);
                    }
                } catch (e) {
                    // Ignore
                }

                // Upload new doc
                const imageBuffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');

                const formData = new FormData();
                formData.append('file', imageBuffer, {
                    filename: `${docName}.jpg`,
                    contentType: 'image/jpeg',
                });
                formData.append('name', docName);
                formData.append('description', description);

                const uploadHeaders = await this.getFineractHeaders();
                delete uploadHeaders['Content-Type'];

                const uploadRes = await firstValueFrom(
                    this.httpService.post(
                        `${this.fineractBaseUrl}/fineract-provider/api/v1/client_identifiers/${identifierId}/documents`,
                        formData,
                        { headers: { ...uploadHeaders, ...formData.getHeaders() } },
                    ),
                );

                this.logger.log(`[uploadCccd] Uploaded ${docName}, resourceId: ${uploadRes.data?.resourceId}`);
                return uploadRes.data?.resourceId;
            };

            // Upload front and back
            result.frontDocId = (await uploadDoc(frontBase64, 'CCCD_FRONT', `CCCD mặt trước - ${ocrData?.idNumber || ''}`)) ?? undefined;
            result.backDocId = (await uploadDoc(backBase64, 'CCCD_BACK', 'CCCD mặt sau')) ?? undefined;
            result.success = true;

            return result;
        } catch (error: any) {
            this.logger.error(`[uploadCccd] Error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Call eKYC Python service for hybrid liveness detection
     * Returns face_matching result (or bypassed result)
     */
    async processHybridLiveness(
        frontImageBuffer: Buffer,
        portraitBuffers: Buffer[],
    ): Promise<{
        success: boolean;
        faceMatching: boolean;
        liveness: boolean;
        spoofScore?: number;
        motionVariance?: number;
        error?: string;
        bypassed?: boolean;
    }> {
        // Check bypass mode
        if (this.bypassFaceMatching) {
            this.logger.warn('⚠️ BYPASS: Face matching check skipped');
            return {
                success: true,
                faceMatching: true,
                liveness: true,
                spoofScore: 1.0,
                bypassed: true,
            };
        }

        try {
            const formData = new FormData();

            // Add front CCCD image
            formData.append('frontID', frontImageBuffer, {
                filename: 'front_cccd.jpg',
                contentType: 'image/jpeg',
            });

            // Add portrait images
            portraitBuffers.forEach((buffer, idx) => {
                formData.append('portraitImages', buffer, {
                    filename: `portrait_${idx}.jpg`,
                    contentType: 'image/jpeg',
                });
            });

            const response = await firstValueFrom(
                this.httpService.post(`${this.ekycServiceUrl}/api/ekyc/liveness`, formData, {
                    headers: formData.getHeaders(),
                    timeout: 60000,
                }),
            );

            const result = response.data?.results || response.data;

            return {
                success: result.success !== false,
                faceMatching: result.face_matching === true,
                liveness: result.liveness === true,
                spoofScore: result.spoof_score,
                motionVariance: result.motion_variance,
                error: result.error,
            };
        } catch (error: any) {
            this.logger.error(`[processHybridLiveness] Error: ${error.message}`);
            return {
                success: false,
                faceMatching: false,
                liveness: false,
                error: error.message,
            };
        }
    }
}
