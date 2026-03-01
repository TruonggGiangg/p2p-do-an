import {
    Controller,
    Post,
    UploadedFiles,
    UseInterceptors,
    BadRequestException,
    UseGuards,
    Logger,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { EkycService } from './ekyc.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('ekyc')
@UseGuards(JwtAuthGuard)
export class EkycController {
    private readonly logger = new Logger(EkycController.name);

    constructor(private readonly ekycService: EkycService) { }

    @Post('front-id')
    @UseInterceptors(AnyFilesInterceptor())
    async ocrFrontID(@UploadedFiles() files: any[]) {
        const file = files?.find((f) => f.fieldname === 'frontID');
        if (!file) {
            throw new BadRequestException('Thiếu ảnh mặt trước CCCD (frontID)');
        }

        return this.ekycService.ocrFrontID(file.buffer, file.originalname);
    }

    @Post('back-id')
    @UseInterceptors(AnyFilesInterceptor())
    async ocrBackID(@UploadedFiles() files: any[]) {
        const file = files?.find((f) => f.fieldname === 'backID');
        if (!file) {
            throw new BadRequestException('Thiếu ảnh mặt sau CCCD (backID)');
        }

        return this.ekycService.ocrBackID(file.buffer, file.originalname);
    }

    @Post('process')
    @UseInterceptors(AnyFilesInterceptor())
    async processEkyc(@UploadedFiles() files: any[]) {
        const portraitFiles = files?.filter((f) => f.fieldname === 'portraitImages');
        const frontIDFile = files?.find((f) => f.fieldname === 'frontID');

        if (!portraitFiles || portraitFiles.length === 0) {
            throw new BadRequestException('Thiếu ảnh chân dung (portraitImages)');
        }
        if (!frontIDFile) {
            throw new BadRequestException('Thiếu ảnh mặt trước CCCD để đối soát (frontID)');
        }

        const portraitBuffers = portraitFiles.map((f) => f.buffer);
        return this.ekycService.checkLiveness(portraitBuffers, frontIDFile.buffer);
    }
}
