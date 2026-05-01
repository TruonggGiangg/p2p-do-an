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
            const errorDetail = error.response?.data?.error || error.response?.data?.message || error.message;
            this.logger.error(`[EkycService] ocrFrontID error [${this.baseUrl}]: ${errorDetail}`);
            if (error.response?.data) {
                this.logger.debug(`[EkycService] ocrFrontID error response: ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`OCR Front ID failed: ${errorDetail}`);
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
            const errorDetail = error.response?.data?.error || error.response?.data?.message || error.message;
            this.logger.error(`[EkycService] ocrBackID error [${this.baseUrl}]: ${errorDetail}`);
            if (error.response?.data) {
                this.logger.debug(`[EkycService] ocrBackID error response: ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`OCR Back ID failed: ${errorDetail}`);
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

            const response = await axios.post(`${this.baseUrl}/api/ekyc/liveness`, formData, {
                headers: formData.getHeaders(),
                timeout: this.timeout,
            });

            // Python returns { results: {...} }, flatten for client
            const data = response.data;
            const result = data?.results ?? data?.result ?? data;
            return typeof result === 'object' && result !== null ? result : data;
        } catch (error) {
            const errorDetail = error.response?.data?.error || error.response?.data?.message || error.message;
            this.logger.error(`[EkycService] checkLiveness error [${this.baseUrl}]: ${errorDetail}`);
            if (error.response?.data) {
                this.logger.debug(`[EkycService] checkLiveness error response: ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`Liveness check failed: ${errorDetail}`);
        }
    }

    /**
     * Save KYC Data Flow (Enhanced: Fineract Identifier + Document upload, learned from HD-AMC)
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

            this.logger.debug(`[EkycService] saveKycData: backData incoming = ${JSON.stringify(backOCRData)}`);

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
                faceMatchingResult: faceMatchingResult || null,
                livenessResult: livenessResult || null,
                fineractIdentifiers: { front: null, back: null, identifierId: null },
                fineractClientDocs: { front: null, back: null },
                // Back OCR metadata - Robust mapping for both snake_case and camelCase and nested data from Python
                issueDate: backData?.issue_date || backData?.init_date || backData?.issueDate || 
                          backData?.data?.issue_date || backData?.data?.init_date || 
                          backData?.result?.data?.issue_date || backData?.result?.data?.init_date || null,
                expiryDate: backData?.expiry_date || backData?.expiryDate || 
                           backData?.data?.expiry_date || 
                           backData?.result?.data?.expiry_date || null,
                placeOfIssue: backData?.place_of_issue || backData?.issueLoc || 
                             backData?.data?.place_of_issue || 
                             backData?.result?.data?.place_of_issue || null,
                issuer: backData?.issuer || backData?.Issuer || backData?.data?.issuer || 
                       backData?.result?.data?.issuer || backData?.result?.data?.Issuer || 
                       backData?.issuer_name || null,
                placeOfBirth: backData?.place_of_birth || backData?.birthplace || 
                             backData?.data?.place_of_birth || 
                             backData?.result?.data?.place_of_birth || ocrData?.birthplace || null,
                personalIdentification: backData?.personalIdentification || backData?.personal_identification || 
                                       backData?.data?.personal_identification || 
                                       backData?.result?.data?.personal_identification || 
                                       backData?.result?.data?.Personal_identification || null,
                mrz: backData?.mrz || backData?.MRZ || backData?.data?.mrz || 
                    backData?.result?.data?.mrz || backData?.result?.data?.MRZ || null,
                idNumberBack: backData?.idNumber || backData?.id || 
                             backData?.data?.idNumber || 
                             backData?.result?.data?.idNumber || null,
                fingerprintDetected: backData?.fingerprint_detected ?? backData?.fingerprintDetected ?? 
                                    backData?.data?.fingerprint_detected ?? 
                                    backData?.result?.data?.fingerprint_detected ?? null,
            };

            this.logger.debug(`[EkycService] saveKycData: kycMetadata prepared = ${JSON.stringify(kycMetadata)}`);

            if (user.fineractClientId) {
                this.logger.log(`[EkycService] Syncing KYC to Fineract for clientId: ${user.fineractClientId}`);
                const clientIdNum = parseInt(user.fineractClientId);
                const clientService = (this.fineractService as any).clientService as typeof import('../fineract/services/fineract-client.service').FineractClientService.prototype;

                // A. Update client information (name, SSN, DOB)
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

                // B. Upload CCCD qua Fineract Identifier (giống HD-AMC _uploadCCCDToFineract)
                const identifierResult = await this._uploadCCCDViaIdentifier(
                    clientIdNum, frontImageBuffer, backImageBuffer, extractedData,
                );
                kycMetadata.fineractIdentifiers = identifierResult;

                // C. Fallback: nếu identifier upload fail, dùng client documents
                if (!identifierResult.front && !identifierResult.back) {
                    this.logger.warn(`[EkycService] Identifier upload failed, falling back to client documents`);
                    try {
                        if (frontImageBuffer) {
                            kycMetadata.fineractClientDocs.front = await (this.fineractService as any).clientService.uploadDocument(
                                'clients', clientIdNum, 'CCCD_FRONT', `CCCD mặt trước - ${extractedData.ssn}`, frontImageBuffer, 'front_cccd.jpg'
                            );
                        }
                        if (backImageBuffer) {
                            kycMetadata.fineractClientDocs.back = await (this.fineractService as any).clientService.uploadDocument(
                                'clients', clientIdNum, 'CCCD_BACK', 'CCCD mặt sau', backImageBuffer, 'back_cccd.jpg'
                            );
                        }
                        this.logger.log(`[EkycService] Fallback client docs upload done`);
                    } catch (docErr: any) {
                        this.logger.error(`[EkycService] Fallback document upload also failed: ${docErr.message}`);
                        kycMetadata.uploadError = docErr.response?.data?.errors?.[0]?.defaultUserMessage || docErr.message;
                    }
                }
            }

            // 2. Overwrite profile name from CCCD (luôn ghi đè tên đăng ký)
            if (extractedData.fullName) {
                const nameParts = extractedData.fullName.trim().split(/\s+/);
                user.profile = {
                    ...(user.profile || {}),
                    firstName: nameParts.slice(0, -1).join(' ') || extractedData.fullName,
                    lastName: nameParts.slice(-1).join(' '),
                };
                this.logger.log(`[EkycService] Profile name overwritten: "${user.profile.firstName} ${user.profile.lastName}"`);
            }

            // 3. Update Keycloak Profile (kycStatus to pending)
            if (user.keycloakId) {
                try {
                    this.logger.log(`[EkycService] Updating Keycloak profile for: ${user.keycloakId}`);

                    const updateAttributes: any = {
                        kycStatus: "pending",
                        declared: "true",
                    };

                    if (extractedData.fullName) {
                        updateAttributes.fullName = extractedData.fullName;
                        updateAttributes.firstName = user.profile?.firstName;
                        updateAttributes.lastName = user.profile?.lastName;
                    }
                    if (extractedData.ssn) updateAttributes.ssn = extractedData.ssn;
                    if (extractedData.dateOfBirth) updateAttributes.dateOfBirth = extractedData.dateOfBirth;
                    if (extractedData.address) updateAttributes.address = extractedData.address;
                    if (extractedData.sex) updateAttributes.sex = extractedData.sex;
                    if (extractedData.issueDate) updateAttributes.issueDate = extractedData.issueDate;

                    if (kycMetadata.fineractIdentifiers?.front?.documentId) updateAttributes.ssnFrontImg = String(kycMetadata.fineractIdentifiers.front.documentId);
                    if (kycMetadata.fineractIdentifiers?.back?.documentId) updateAttributes.ssnBackImg = String(kycMetadata.fineractIdentifiers.back.documentId);

                    await this.keycloakService.updateUser(user.keycloakId, updateAttributes);
                } catch (kcError: any) {
                    this.logger.warn(`[EkycService] Keycloak update failed, proceeding anyway: ${kcError.message}`);
                }
            }

            // 4. Update MongoDB User Document
            user.kycStatus = 'PENDING';
            user.kycRejectReason = undefined; // Clear any previous reject reason
            const meta = kycMetadata;
            const metadata: Record<string, any> = {
                kycCompletedAt: meta.kycCompletedAt,
                faceMatchingResult: meta.faceMatchingResult,
                livenessResult: meta.livenessResult,
                // Back OCR metadata
                issueDate: meta.issueDate,
                expiryDate: meta.expiryDate,
                placeOfIssue: meta.placeOfIssue,
                issuer: meta.issuer,
                placeOfBirth: meta.placeOfBirth,
                personalIdentification: meta.personalIdentification,
                mrz: meta.mrz,
                idNumberBack: meta.idNumberBack,
                fingerprintDetected: meta.fingerprintDetected,
            };
            if (meta.fineractIdentifiers?.identifierId) metadata.fineractIdentifiers = meta.fineractIdentifiers;
            if (meta.fineractClientDocs?.front || meta.fineractClientDocs?.back) metadata.fineractClientDocs = meta.fineractClientDocs;
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
                    fineractIdentifiers: kycMetadata.fineractIdentifiers,
                    fineractClientDocs: kycMetadata.fineractClientDocs,
                },
            };
        } catch (error: any) {
            this.logger.error(`[EkycService] saveKycData error: ${error.message}`);
            throw new Error(`Failed to save KYC: ${error.message}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Fineract Identifier Upload (ported from HD-AMC IdentityService)
    // ═══════════════════════════════════════════════════════════════════

    /** Fineract Document Type IDs */
    private readonly DOC_TYPE = { PASSPORT: 1, NATIONAL_ID: 2 };

    /**
     * Upload CCCD qua Fineract Identifier API (giống HD-AMC _uploadCCCDToFineract)
     * Flow: findOrCreate identifier → upload front/back docs
     */
    private async _uploadCCCDViaIdentifier(
        clientId: number,
        frontBuffer: Buffer | null,
        backBuffer: Buffer | null,
        extractedData: { ssn?: string; fullName?: string },
    ): Promise<{ front: any; back: any; identifierId: number | null }> {
        const results = { front: null as any, back: null as any, identifierId: null as number | null };
        try {
            const clientService = (this.fineractService as any).clientService;
            const uniqueKey = extractedData.ssn || `CCCD-${clientId}-${Date.now()}`;
            const description = `CCCD - ${extractedData.fullName || 'KYC'}`;

            // Step 1: Tìm hoặc tạo identifier
            const identifierId = await this._findOrCreateIdentifier(clientService, clientId, uniqueKey, description);
            if (!identifierId) {
                this.logger.warn(`[_uploadCCCDViaIdentifier] Could not create identifier for client ${clientId}`);
                return results;
            }
            results.identifierId = identifierId;

            // Step 2: Upload front doc
            if (frontBuffer) {
                results.front = await this._uploadIdentifierDoc(clientService, identifierId, frontBuffer, 'CCCD_FRONT', 'CCCD mặt trước');
            }

            // Step 3: Upload back doc
            if (backBuffer) {
                results.back = await this._uploadIdentifierDoc(clientService, identifierId, backBuffer, 'CCCD_BACK', 'CCCD mặt sau');
            }

            this.logger.log(`[_uploadCCCDViaIdentifier] Done: identifierId=${identifierId}, front=${!!results.front}, back=${!!results.back}`);
            return results;
        } catch (error: any) {
            this.logger.error(`[_uploadCCCDViaIdentifier] Upload CCCD to Fineract failed: ${error.message}`);
            return results;
        }
    }

    /**
     * Tìm identifier hiện có hoặc tạo mới, xử lý duplicate (4 strategies từ HD-AMC)
     */
    private async _findOrCreateIdentifier(
        clientService: any,
        clientId: number,
        uniqueKey: string,
        description: string,
    ): Promise<number | null> {
        // Step 1: Tìm identifier đã tồn tại
        try {
            const existing = await clientService.getClientIdentifiers(clientId);
            const found = this._findMatchingIdentifier(existing, uniqueKey);
            if (found) {
                this.logger.log(`[_findOrCreateIdentifier] Found existing identifier ${found} for client ${clientId}`);
                return found;
            }
        } catch (e: any) {
            this.logger.warn(`[_findOrCreateIdentifier] getClientIdentifiers error: ${e.message}`);
        }

        // Step 2: Tạo mới
        try {
            const id = await clientService.createClientIdentifier(clientId, this.DOC_TYPE.PASSPORT, uniqueKey, description);
            this.logger.log(`[_findOrCreateIdentifier] Created new identifier ${id} for client ${clientId}`);
            return id;
        } catch (err: any) {
            const isDuplicate = err.response?.status === 403 || err.response?.data?.httpStatusCode === '403';
            if (isDuplicate) {
                this.logger.warn(`[_findOrCreateIdentifier] Duplicate key: ${uniqueKey}, trying fallback strategies...`);
                return this._handleDuplicateIdentifier(clientService, clientId, uniqueKey, description);
            }
            this.logger.error(`[_findOrCreateIdentifier] Create identifier error: ${err.message}`);
            return null;
        }
    }

    /**
     * Xử lý Fineract 403 duplicate identifier (4 strategies từ HD-AMC)
     */
    private async _handleDuplicateIdentifier(
        clientService: any,
        clientId: number,
        uniqueKey: string,
        description: string,
    ): Promise<number | null> {
        // Strategy 1: Re-fetch identifiers list
        try {
            const list = await clientService.getClientIdentifiers(clientId);
            const found = this._findMatchingIdentifier(list, uniqueKey);
            if (found) return found;
        } catch {}

        // Strategy 2: Fetch client with associations=identifiers
        try {
            const client = await clientService.getClientById(clientId, 'identifiers');
            const embedded = client?.identifiers ?? client?.clientIdentifiers ?? [];
            const found = this._findMatchingIdentifier(embedded, uniqueKey);
            if (found) return found;
        } catch {}

        // Strategy 3: Thử documentTypeId khác (National ID thay vì Passport)
        try {
            const id = await clientService.createClientIdentifier(clientId, this.DOC_TYPE.NATIONAL_ID, uniqueKey, description);
            if (id) return id;
        } catch {}

        // Strategy 4: Modified key (thêm timestamp)
        try {
            const altKey = `${uniqueKey}-${Date.now()}`;
            const id = await clientService.createClientIdentifier(clientId, this.DOC_TYPE.PASSPORT, altKey, `${description} (retry)`);
            if (id) return id;
        } catch (err: any) {
            this.logger.error(`[_handleDuplicateIdentifier] All strategies exhausted: ${err.message}`);
        }

        return null;
    }

    /**
     * Tìm identifier phù hợp từ danh sách (giống HD-AMC _findMatchingIdentifier)
     */
    private _findMatchingIdentifier(identifiers: any[], uniqueKey: string): number | null {
        if (!Array.isArray(identifiers) || identifiers.length === 0) return null;

        // 1) By documentType (Passport=1 or National ID=2)
        const byType = identifiers.find((id: any) => {
            const typeId = id.documentType?.id ?? id.documentTypeId;
            return [this.DOC_TYPE.PASSPORT, this.DOC_TYPE.NATIONAL_ID].includes(Number(typeId));
        });
        if (byType) return byType.id;

        // 2) By documentKey
        const byKey = identifiers.find((id: any) => id.documentKey === uniqueKey);
        if (byKey) return byKey.id;

        // 3) Single identifier fallback
        return identifiers.length === 1 ? identifiers[0].id : null;
    }

    /**
     * Upload 1 document (front/back) vào identifier trên Fineract
     * (giống HD-AMC _uploadIdentifierDoc)
     */
    private async _uploadIdentifierDoc(
        clientService: any,
        identifierId: number,
        buffer: Buffer,
        docName: string,
        description: string,
    ): Promise<{ success: boolean; documentId: number } | null> {
        try {
            const docId = await clientService.uploadDocument(
                'client_identifiers', identifierId, docName, description, buffer, `${docName}.jpg`,
            );
            this.logger.log(`[_uploadIdentifierDoc] Uploaded ${docName}, documentId: ${docId}`);
            return { success: true, documentId: docId };
        } catch (err: any) {
            this.logger.error(`[_uploadIdentifierDoc] Upload ${docName} error: ${err.message}`);
            return null;
        }
    }
}

