import {
  Controller,
  Post,
  Req,
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

  constructor(private readonly ekycService: EkycService) {}

  @Post('front-id')
  @UseInterceptors(AnyFilesInterceptor())
  async ocrFrontID(@UploadedFiles() files: any[]) {
    this.logger.log(
      `[ocrFrontID] Received ${files?.length ?? 0} files: ${files?.map(f => `${f.fieldname}(${f.buffer?.length ?? 0}b, ${f.mimetype})`).join(', ') || 'none'}`,
    );
    const file = files?.find(f => f.fieldname === 'frontID');
    if (!file) {
      throw new BadRequestException(
        'Thiếu ảnh mặt trước CCCD (frontID). Received fields: ' + (files?.map(f => f.fieldname).join(', ') || 'none'),
      );
    }
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('File ảnh mặt trước rỗng (0 bytes)');
    }

    return this.ekycService.ocrFrontID(file.buffer, file.originalname);
  }

  @Post('back-id')
  @UseInterceptors(AnyFilesInterceptor())
  async ocrBackID(@UploadedFiles() files: any[]) {
    this.logger.log(
      `[ocrBackID] Received ${files?.length ?? 0} files: ${files?.map(f => `${f.fieldname}(${f.buffer?.length ?? 0}b, ${f.mimetype})`).join(', ') || 'none'}`,
    );
    const file = files?.find(f => f.fieldname === 'backID');
    if (!file) {
      throw new BadRequestException(
        'Thiếu ảnh mặt sau CCCD (backID). Received fields: ' + (files?.map(f => f.fieldname).join(', ') || 'none'),
      );
    }
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('File ảnh mặt sau rỗng (0 bytes)');
    }

    return this.ekycService.ocrBackID(file.buffer, file.originalname);
  }

  @Post('process')
  @UseInterceptors(AnyFilesInterceptor())
  async processEkyc(@UploadedFiles() files: any[]) {
    const portraitFiles = files?.filter(f => f.fieldname === 'portraitImages');
    const frontIDFile = files?.find(f => f.fieldname === 'frontID');

    if (!portraitFiles || portraitFiles.length === 0) {
      throw new BadRequestException('Thiếu ảnh chân dung (portraitImages)');
    }
    if (!frontIDFile) {
      throw new BadRequestException('Thiếu ảnh mặt trước CCCD để đối soát (frontID)');
    }

    const portraitBuffers = portraitFiles.map(f => f.buffer);
    return this.ekycService.checkLiveness(portraitBuffers, frontIDFile.buffer);
  }

  @Post('save')
  @UseInterceptors(AnyFilesInterceptor())
  async saveKyc(@Req() req: any, @UploadedFiles() files: any[]) {
    const userId = req.user.id || req.user._id || req.user.keycloakUserId; // Map from JWT Payload
    if (!userId) {
      throw new BadRequestException('Không tìm thấy thông tin định danh người dùng');
    }

    const body = req.body;

    let frontOCRData: any = body.frontOCRData;
    let backOCRData: any = body.backOCRData;
    let faceMatchingResult: any = body.faceMatchingResult;
    let livenessResult: any = body.livenessResult;

    // Parse JSON strings if they were sent as form fields
    if (typeof frontOCRData === 'string')
      try {
        frontOCRData = JSON.parse(frontOCRData);
      } catch (e) {}
    if (typeof backOCRData === 'string')
      try {
        backOCRData = JSON.parse(backOCRData);
      } catch (e) {}
    if (typeof faceMatchingResult === 'string')
      try {
        faceMatchingResult = JSON.parse(faceMatchingResult);
      } catch (e) {}
    if (typeof livenessResult === 'string')
      try {
        livenessResult = JSON.parse(livenessResult);
      } catch (e) {}

    if (!frontOCRData) {
      throw new BadRequestException('Thiếu thông tin OCR mặt trước CCCD');
    }

    const frontFile = files?.find(f => f.fieldname === 'frontImage');
    const backFile = files?.find(f => f.fieldname === 'backImage');
    const frontImageBuffer = frontFile?.buffer;
    const backImageBuffer = backFile?.buffer;
    if (files?.length) {
      this.logger.log(`[saveKyc] Files: ${files.map(f => `${f.fieldname}(${f.buffer?.length || 0}b)`).join(', ')}`);
    }

    return this.ekycService.saveKycData(
      userId,
      frontOCRData,
      backOCRData,
      frontImageBuffer,
      backImageBuffer,
      faceMatchingResult,
      livenessResult,
    );
  }
}
