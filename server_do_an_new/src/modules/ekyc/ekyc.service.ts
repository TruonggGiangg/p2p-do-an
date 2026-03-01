import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
const FormData = require('form-data');

@Injectable()
export class EkycService {
    private readonly logger = new Logger(EkycService.name);
    private readonly baseUrl: string;
    private readonly timeout: number;

    constructor(private readonly configService: ConfigService) {
        this.baseUrl = this.configService.get<string>('EKYC_SERVICE_URL', 'http://localhost:8000');
        this.timeout = this.configService.get<number>('EKYC_TIMEOUT', 20000);
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

            const response = await axios.post(`${this.baseUrl}/api/ekyc/process`, formData, {
                headers: formData.getHeaders(),
                timeout: this.timeout,
            });

            return response.data;
        } catch (error) {
            const errorDetail = error.response?.data?.error || error.message;
            this.logger.error(`[EkycService] checkLiveness error: ${errorDetail}`);
            throw new Error(errorDetail);
        }
    }
}
