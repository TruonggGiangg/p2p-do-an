import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Res,
    UseGuards,
    UploadedFiles,
    UseInterceptors,
    Request,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { EkycService, KycImagesResult } from './ekyc.service';
import { DualAuthGuard } from '../auth/guard/dual-auth.guard';

// Multer file type
interface MulterFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    buffer: Buffer;
    size: number;
}

interface SaveKycDto {
    frontOCRData?: any;
    backOCRData?: any;
    frontImageBase64?: string;
    backImageBase64?: string;
    faceMatchingResult?: boolean;
    livenessResult?: any;
}

@Controller('ekyc')
export class EkycController {
    constructor(private readonly ekycService: EkycService) { }

    /**
     * GET /ekyc/images - Lấy danh sách ảnh CCCD đã upload
     */
    @Get('images')
    @UseGuards(DualAuthGuard)
    async getImages(@Request() req: any) {
        const user = req.user;
        const fineractClientId = user?.fineractClientId;

        if (!fineractClientId) {
            return {
                success: true,
                hasImages: false,
                images: [],
                message: 'Chưa có fineractClientId',
            };
        }

        return this.ekycService.getKycImages(Number(fineractClientId));
    }

    /**
     * GET /ekyc/images/:identifierId/:documentId - Download ảnh CCCD cụ thể
     */
    @Get('images/:identifierId/:documentId')
    @UseGuards(DualAuthGuard)
    async downloadImage(
        @Param('identifierId') identifierId: string,
        @Param('documentId') documentId: string,
        @Res() res: Response,
    ) {
        const buffer = await this.ekycService.downloadKycImage(
            Number(identifierId),
            Number(documentId),
        );

        if (!buffer) {
            return res.status(404).json({
                success: false,
                message: 'Image not found',
            });
        }

        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Disposition', `attachment; filename="cccd_${documentId}.jpg"`);
        res.send(buffer);
    }

    /**
     * GET /ekyc/bypass-status - Kiểm tra bypass mode có bật không
     */
    @Get('bypass-status')
    getBypassStatus() {
        return {
            bypassEnabled: this.ekycService.isBypassEnabled(),
            message: this.ekycService.isBypassEnabled()
                ? '⚠️ BYPASS MODE: Face matching is DISABLED'
                : '✅ Face matching is ENABLED',
        };
    }

    /**
     * POST /ekyc/save - Lưu KYC và upload CCCD lên Fineract
     */
    @Post('save')
    @UseGuards(DualAuthGuard)
    @UseInterceptors(FilesInterceptor('files', 10))
    async saveKyc(
        @Request() req: any,
        @Body() body: SaveKycDto,
        @UploadedFiles() files?: MulterFile[],
    ) {
        const user = req.user;
        const fineractClientId = user?.fineractClientId;

        console.log('[EkycController] saveKyc - user:', user?.username);
        console.log('[EkycController] saveKyc - fineractClientId:', fineractClientId);

        // Parse JSON strings if needed (from FormData)
        let frontOCRData = body.frontOCRData;
        let backOCRData = body.backOCRData;
        let faceMatchingResult = body.faceMatchingResult;
        let livenessResult = body.livenessResult;

        if (typeof frontOCRData === 'string') {
            try { frontOCRData = JSON.parse(frontOCRData); } catch (e) { }
        }
        if (typeof backOCRData === 'string') {
            try { backOCRData = JSON.parse(backOCRData); } catch (e) { }
        }
        if (typeof faceMatchingResult === 'string') {
            faceMatchingResult = faceMatchingResult === 'true';
        }
        if (typeof livenessResult === 'string') {
            try { livenessResult = JSON.parse(livenessResult); } catch (e) { }
        }

        // Get images from files or base64
        let frontBase64 = body.frontImageBase64;
        let backBase64 = body.backImageBase64;

        if (files) {
            const frontFile = files.find((f) => f.fieldname === 'frontImage');
            const backFile = files.find((f) => f.fieldname === 'backImage');

            if (frontFile) {
                frontBase64 = `data:${frontFile.mimetype};base64,${frontFile.buffer.toString('base64')}`;
            }
            if (backFile) {
                backBase64 = `data:${backFile.mimetype};base64,${backFile.buffer.toString('base64')}`;
            }
        }

        // Validate
        if (!frontOCRData) {
            return {
                success: false,
                message: 'Thiếu thông tin OCR CCCD mặt trước',
            };
        }

        // Upload to Fineract if has clientId
        let fineractResult = { success: false };
        if (fineractClientId && frontBase64) {
            const ocrData = frontOCRData?.data || frontOCRData;
            fineractResult = await this.ekycService.uploadCccdToFineract(
                Number(fineractClientId),
                frontBase64,
                backBase64 || '',
                ocrData,
            );
            console.log('[EkycController] Fineract upload result:', fineractResult);
        }

        // TODO: Update user profile with OCR data (Keycloak user model)
        // This would require injecting KeycloakUserService

        return {
            success: true,
            message: 'KYC đã được lưu',
            fineractUpload: fineractResult,
            ocrData: frontOCRData?.data || frontOCRData,
            faceMatchingResult,
        };
    }

    /**
     * POST /ekyc/liveness - Gọi Python eKYC service để kiểm tra face matching
     */
    @Post('liveness')
    @UseGuards(DualAuthGuard)
    @UseInterceptors(FilesInterceptor('files', 10))
    async processLiveness(
        @UploadedFiles() files: MulterFile[],
    ) {
        if (!files || files.length === 0) {
            return {
                success: false,
                error: 'Không có file được upload',
            };
        }

        // Find front CCCD and portrait images
        const frontFile = files.find((f) => f.fieldname === 'frontID');
        const portraitFiles = files.filter((f) => f.fieldname === 'portraitImages');

        if (!frontFile) {
            return {
                success: false,
                error: 'Thiếu file frontID (CCCD mặt trước)',
            };
        }

        if (portraitFiles.length === 0) {
            return {
                success: false,
                error: 'Thiếu portraitImages (ảnh chân dung)',
            };
        }

        const result = await this.ekycService.processHybridLiveness(
            frontFile.buffer,
            portraitFiles.map((f) => f.buffer),
        );

        return {
            success: result.success,
            results: {
                face_matching: result.faceMatching,
                liveness: result.liveness,
                spoof_score: result.spoofScore,
                motion_variance: result.motionVariance,
                bypassed: result.bypassed,
            },
            error: result.error,
        };
    }
}
