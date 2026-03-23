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

            this.logger.debug(`[EkycService] ocrFrontID response data (PYTHON): ${JSON.stringify(response.data)}`);

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

            this.logger.debug(`[EkycService] ocrBackID response data (PYTHON): ${JSON.stringify(response.data)}`);

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
        frontImageBuffer: Buffer | null,
        backImageBuffer: Buffer | null,
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

            const ocrData = frontOCRData?.data || frontOCRData?.result || frontOCRData;
            const backData = backOCRData?.data || backOCRData?.result || backOCRData;

            // Map dates (dob) from DD/MM/YYYY to YYYY-MM-DD for standardizing
            const parseDate = (dateStr?: string) => {
                if (!dateStr) return undefined;
                if (dateStr.includes('/')) {
                    const parts = dateStr.split('/');
                    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`; // DD/MM/YYYY -> YYYY-MM-DD
                }
                return dateStr;
            };

            const issueDateRaw = backData?.init_date || backData?.issue_date || backData?.issueDate;

            const extractedData = {
                fullName: ocrData.fullName || ocrData.name,
                ssn: ocrData.idNumber || ocrData.id,
                dateOfBirth: parseDate(ocrData.dob),
                address: ocrData.address,
                sex: ocrData.gender,
                issueDate: issueDateRaw ? parseDate(issueDateRaw) || issueDateRaw : undefined,
            };

            const kycMetadata: Record<string, any> = {
                kycCompletedAt: new Date(),
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

                // B. Upload CCCD to clients/{id}/documents
                try {
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
                    this.logger.log(`[EkycService] Fineract sync done: client docs`);
                } catch (docErr: any) {
                    const errDetail = docErr.response?.data || docErr.message;
                    this.logger.error(
                        `[EkycService] Fineract document upload failed: ${docErr.message}`,
                        typeof errDetail === 'object' ? JSON.stringify(errDetail) : errDetail,
                    );
                    // Lưu lỗi vào metadata để debug (không throw - user vẫn có kycStatus PENDING)
                    kycMetadata.uploadError = docErr.response?.data?.errors?.[0]?.defaultUserMessage || docErr.message;
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
                    if (extractedData.issueDate) updateAttributes.issueDate = extractedData.issueDate;

                    if (kycMetadata.fineractClientDocs?.front) updateAttributes.ssnFrontImg = String(kycMetadata.fineractClientDocs.front);
                    if (kycMetadata.fineractClientDocs?.back) updateAttributes.ssnBackImg = String(kycMetadata.fineractClientDocs.back);

                    await this.keycloakService.updateUser(user.keycloakId, updateAttributes);
                } catch (kcError: any) {
                    this.logger.warn(`[EkycService] Keycloak update failed, proceeding anyway: ${kcError.message}`);
                }
            }

            // 3. Update MongoDB User Document - chỉ lưu dữ liệu cần thiết
            user.kycStatus = 'PENDING';
            const meta = kycMetadata as Record<string, any>;
            const hasClientDocs = meta.fineractClientDocs?.front ?? meta.fineractClientDocs?.back;
            const metadata: Record<string, any> = {
                kycCompletedAt: meta.kycCompletedAt,
            };
            if (hasClientDocs) metadata.fineractClientDocs = meta.fineractClientDocs;
            if (meta.uploadError) metadata.uploadError = meta.uploadError;

            user.kycData = {
                fullName: extractedData.fullName,
                ssn: extractedData.ssn,
                dateOfBirth: extractedData.dateOfBirth,
                address: extractedData.address,
                sex: extractedData.sex,
                issueDate: extractedData.issueDate,
                metadata,
            };

            await user.save();
            this.logger.log(`[EkycService] Successfully saved KYC config for user ${userId}`);

            return {
                success: true,
                message: 'Hồ sơ đã được gửi lưu trữ thành công và đang chờ phê duyệt.',
                data: {
                    kycStatus: user.kycStatus,
                    fineractClientDocs: kycMetadata.fineractClientDocs,
                },
            };
        } catch (error: any) {
            this.logger.error(`[EkycService] saveKycData error: ${error.message}`);
            throw new Error(`Failed to save KYC: ${error.message}`);
        }
    }
}
