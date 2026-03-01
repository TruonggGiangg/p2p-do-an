import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserStatus } from '../users/schemas/user.schema';
import { KeycloakService } from '../auth/services/keycloak.service';
import { FineractService } from '../fineract/fineract.service';

const FormData = require('form-data');

@Injectable()
export class EkycService {
    private readonly logger = new Logger(EkycService.name);
    private readonly baseUrl: string;
    private readonly timeout: number;

    private readonly bypassFaceMatch: boolean;

    constructor(
        private readonly configService: ConfigService,
        @InjectModel(User.name) private userModel: Model<User>,
        private readonly keycloakService: KeycloakService,
        private readonly fineractService: FineractService,
    ) {
        this.baseUrl = this.configService.get<string>('EKYC_SERVICE_URL', 'http://localhost:8000');
        this.timeout = this.configService.get<number>('EKYC_TIMEOUT', 20000);
        this.bypassFaceMatch = this.configService.get<string>('EKYC_BYPASS_FACE_MATCH', 'false').toLowerCase() === 'true';
    }

    /**
     * OCR Front ID Card
     */
    async ocrFrontID(imageBuffer: Buffer, filename = 'front.jpg'): Promise<any> {
        try {
            this.logger.log(`[EkycService] ocrFrontID for ${filename}, size: ${imageBuffer.length}`);

            const formData = new FormData();
            formData.append('frontID', imageBuffer, {
                filename,
                contentType: 'image/jpeg',
            });

            const response = await axios.post(`${this.baseUrl}/api/ekyc/frontID`, formData, {
                headers: formData.getHeaders(),
                timeout: this.timeout,
            });

            return response.data;
        } catch (error) {
            const errorDetail = error.response?.data?.error || error.message;
            this.logger.error(`[EkycService] ocrFrontID error: ${errorDetail}`);
            throw new Error(errorDetail);
        }
    }

    /**
     * OCR Back ID Card
     */
    async ocrBackID(imageBuffer: Buffer, filename = 'back.jpg'): Promise<any> {
        try {
            this.logger.log(`[EkycService] ocrBackID for ${filename}, size: ${imageBuffer.length}`);

            const formData = new FormData();
            formData.append('backID', imageBuffer, {
                filename,
                contentType: 'image/jpeg',
            });

            const response = await axios.post(`${this.baseUrl}/api/ekyc/backID`, formData, {
                headers: formData.getHeaders(),
                timeout: this.timeout,
            });

            return response.data;
        } catch (error) {
            const errorDetail = error.response?.data?.error || error.message;
            this.logger.error(`[EkycService] ocrBackID error: ${errorDetail}`);
            throw new Error(errorDetail);
        }
    }

    /**
     * Liveness & Face Matching
     */
    async checkLiveness(portraitBuffers: Buffer[], frontIDBuffer: Buffer): Promise<any> {
        try {
            this.logger.log(`[EkycService] checkLiveness with ${portraitBuffers.length} portraits`);

            const formData = new FormData();

            // Append portrait images
            portraitBuffers.forEach((buffer, index) => {
                formData.append('portraitImages', buffer, {
                    filename: `portrait_${index}.jpg`,
                    contentType: 'image/jpeg',
                });
            });

            // Append front ID for matching
            formData.append('frontID', frontIDBuffer, {
                filename: 'front_for_matching.jpg',
                contentType: 'image/jpeg',
            });

            if (this.bypassFaceMatch) {
                this.logger.warn('[EkycService] EKYC_BYPASS_FACE_MATCH=true: bypassing Python, returning success');
                return { success: true, face_matching: true, liveness: true, bypassed: true };
            }

            const response = await axios.post(`${this.baseUrl}/api/ekyc-process`, formData, {
                headers: formData.getHeaders(),
                timeout: this.timeout,
            });

            // Python returns { results: {...} }, flatten for client
            const data = response.data;
            const result = data?.results ?? data?.result ?? data;
            return typeof result === 'object' && result !== null ? result : data;
        } catch (error) {
            const errorDetail = error.response?.data?.error || error.message;
            this.logger.error(`[EkycService] checkLiveness error: ${errorDetail}`);
            throw new Error(errorDetail);
        }
    }

    /**
     * Save KYC Data Flow
     */
    async saveKycData(
        userId: string,
        frontOCRData: any,
        backOCRData: any,
        frontImageBuffer: Buffer,
        backImageBuffer: Buffer,
        faceMatchingResult: any,
        livenessResult: any,
    ): Promise<any> {
        try {
            this.logger.log(`[EkycService] Processing saveKycData for user: ${userId}`);

            // Find user in MongoDB
            const user = await this.userModel.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            const ocrData = frontOCRData?.data || frontOCRData;

            // Map dates (dob) from DD/MM/YYYY to YYYY-MM-DD for standardizing
            const parseDate = (dateStr?: string) => {
                if (!dateStr) return undefined;
                if (dateStr.includes('/')) {
                    const parts = dateStr.split('/');
                    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`; // DD/MM/YYYY -> YYYY-MM-DD
                }
                return dateStr;
            };

            const extractedData = {
                fullName: ocrData.fullName || ocrData.name,
                ssn: ocrData.idNumber || ocrData.id,
                dateOfBirth: parseDate(ocrData.dob),
                address: ocrData.address,
                sex: ocrData.gender,
            };

            const kycMetadata = {
                kycCompletedAt: new Date(),
                faceMatchingResult,
                livenessResult,
                fineractIdentifiers: { front: null, back: null, identifierId: null },
                fineractClientDocs: { front: null, back: null },
            };

            // 1. Update Fineract client info + upload documents (if user has fineractClientId)
            if (user.fineractClientId) {
                this.logger.log(`[EkycService] Syncing KYC to Fineract for clientId: ${user.fineractClientId}`);
                const clientIdNum = parseInt(user.fineractClientId);
                const clientService = (this.fineractService as any).clientService;

                // A. Update client information (name, SSN, DOB) - optional, don't block document upload
                try {
                    const nameParts = (extractedData.fullName || '').trim().split(/\s+/);
                    const firstName = nameParts.slice(0, -1).join(' ') || extractedData.fullName;
                    const lastName = nameParts.slice(-1)[0] || '';
                    await this.fineractService.updateClient(clientIdNum, {
                        firstname: firstName,
                        lastname: lastName,
                        dateOfBirth: extractedData.dateOfBirth,
                        externalId: extractedData.ssn || user.username,
                    });
                } catch (updateErr: any) {
                    this.logger.warn(`[EkycService] Fineract updateClient failed (continuing with docs): ${updateErr.message}`);
                }

                // B. Upload documents - chạy dù updateClient fail
                try {
                    // B1. Check for existing Passport identifier (documentTypeId = 1 = Passport/ID)
                    const identifiers = await clientService.getClientIdentifiers(clientIdNum);
                    let identifierId = identifiers.find((id: any) => id.documentType?.id === 1 || id.documentTypeId === 1)?.id;

                    if (!identifierId) {
                        identifierId = await clientService.createClientIdentifier(
                            clientIdNum,
                            1,
                            'CCCD',
                            `CCCD - ${extractedData.ssn || extractedData.fullName}`
                        );
                    }
                    kycMetadata.fineractIdentifiers.identifierId = identifierId;

                    // C. Upload CCCD to client_identifiers (identifier documents)
                    if (identifierId) {
                        if (frontImageBuffer) {
                            kycMetadata.fineractIdentifiers.front = await clientService.uploadDocument(
                                'client_identifiers', identifierId, 'CCCD_FRONT', `CCCD mặt trước - ${extractedData.ssn}`, frontImageBuffer, 'front_cccd.jpg'
                            );
                        }
                        if (backImageBuffer) {
                            kycMetadata.fineractIdentifiers.back = await clientService.uploadDocument(
                                'client_identifiers', identifierId, 'CCCD_BACK', 'CCCD mặt sau', backImageBuffer, 'back_cccd.jpg'
                            );
                        }
                    }

                    // D. Upload documents to client (clients/{id}/documents) - tài liệu người dùng
                    if (frontImageBuffer) {
                        kycMetadata.fineractClientDocs.front = await clientService.uploadDocument(
                            'clients', clientIdNum, 'CCCD_FRONT', `CCCD mặt trước - ${extractedData.ssn}`, frontImageBuffer, 'front_cccd.jpg'
                        );
                    }
                    if (backImageBuffer) {
                        kycMetadata.fineractClientDocs.back = await clientService.uploadDocument(
                            'clients', clientIdNum, 'CCCD_BACK', 'CCCD mặt sau', backImageBuffer, 'back_cccd.jpg'
                        );
                    }

                    this.logger.log(`[EkycService] Fineract sync done: identifiers + client docs`);
                } catch (docErr: any) {
                    this.logger.warn(`[EkycService] Fineract document upload failed: ${docErr.message}`);
                }
            }

            // 2. Update Keycloak Profile (kycStatus to pending)
            if (user.keycloakId) {
                try {
                    this.logger.log(`[EkycService] Updating Keycloak profile for: ${user.keycloakId}`);

                    user.profile = {
                        ...(user.profile || {}),
                        firstName: extractedData.fullName ? extractedData.fullName.split(' ').slice(0, -1).join(' ') : user.profile?.firstName,
                        lastName: extractedData.fullName ? extractedData.fullName.split(' ').slice(-1).join(' ') : user.profile?.lastName,
                    };

                    const updateAttributes: any = {
                        kycStatus: "pending",
                        declared: "true"
                    };

                    if (extractedData.fullName) updateAttributes.fullName = extractedData.fullName;
                    if (extractedData.ssn) updateAttributes.ssn = extractedData.ssn;
                    if (extractedData.dateOfBirth) updateAttributes.dateOfBirth = extractedData.dateOfBirth;
                    if (extractedData.address) updateAttributes.address = extractedData.address;
                    if (extractedData.sex) updateAttributes.sex = extractedData.sex;

                    if (kycMetadata.fineractIdentifiers.front) updateAttributes.ssnFrontImg = String(kycMetadata.fineractIdentifiers.front);
                    if (kycMetadata.fineractIdentifiers.back) updateAttributes.ssnBackImg = String(kycMetadata.fineractIdentifiers.back);

                    await this.keycloakService.updateUser(user.keycloakId, updateAttributes);
                } catch (kcError: any) {
                    this.logger.warn(`[EkycService] Keycloak update failed, proceeding anyway: ${kcError.message}`);
                }
            }

            // 3. Update MongoDB User Document
            user.kycStatus = 'PENDING';
            user.kycData = {
                ...extractedData,
                metadata: kycMetadata,
            };

            await user.save();
            this.logger.log(`[EkycService] Successfully saved KYC config for user ${userId}`);

            return {
                success: true,
                message: 'Hồ sơ đã được gửi lưu trữ thành công và đang chờ phê duyệt.',
                data: {
                    kycStatus: user.kycStatus,
                    fineractIdentifiers: kycMetadata.fineractIdentifiers
                }
            };
        } catch (error: any) {
            this.logger.error(`[EkycService] saveKycData error: ${error.message}`);
            throw new Error(`Failed to save KYC: ${error.message}`);
        }
    }
}
