import { Controller, Get, Post, Put, Delete, Patch, Param, Body, Query, Req, Res, UploadedFiles, UseGuards, UseInterceptors, ParseIntPipe, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../guards/admin.guard';
import { AdminService } from '../admin.service';
import { PoliciesGuard } from '../../casl/policies.guard';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { Action } from '../../casl/actions.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../auth/interfaces/auth.interface';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard, PoliciesGuard)
export class AdminKycController {
  constructor(
    private readonly adminService: AdminService,
  ) {}

  @Get('kyc/pending')
  @CheckPolicies(ability => ability.can(Action.Read, 'Kyc'))
  @ApiOperation({ summary: 'Danh sách KYC chờ phê duyệt' })
  @ApiResponse({ status: 200 })
  async getPendingKyc() {
    const list = await this.adminService.getPendingKycUsers();
    return { users: list  };
  }

  @Post('kyc/:userId/ocr-front')
  @CheckPolicies(ability => ability.can(Action.Create, 'Kyc'))
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({ summary: 'OCR mặt trước CCCD (nhân viên tải lên giúp khách hàng)' })
  async ocrFront(@Param('userId') userId: string, @UploadedFiles() files: any[]) {
    const file = files?.find((f: any) => f.fieldname === 'frontID');
    if (!file?.buffer) {
      throw new BadRequestException('Thiếu ảnh mặt trước CCCD (frontID)');
    }
    const result = await this.adminService.ocrFrontForUser(userId, file.buffer, file.originalname || 'front.jpg');
    return result ;
  }

  @Post('kyc/:userId/ocr-back')
  @CheckPolicies(ability => ability.can(Action.Create, 'Kyc'))
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({ summary: 'OCR mặt sau CCCD' })
  async ocrBack(@Param('userId') userId: string, @UploadedFiles() files: any[]) {
    const file = files?.find((f: any) => f.fieldname === 'backID');
    if (!file?.buffer) {
      throw new BadRequestException('Thiếu ảnh mặt sau CCCD (backID)');
    }
    const result = await this.adminService.ocrBackForUser(userId, file.buffer, file.originalname || 'back.jpg');
    return result ;
  }

  @Post('kyc/:userId/save')
  @CheckPolicies(ability => ability.can(Action.Create, 'Kyc'))
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({ summary: 'Lưu KYC (nhân viên làm giúp khách hàng)' })
  async saveKyc(@Param('userId') userId: string, @UploadedFiles() files: any[], @Body() body: any) {
        let frontOCRData = body.frontOCRData;
    let backOCRData = body.backOCRData;
    if (typeof frontOCRData === 'string') {
      try {
        frontOCRData = JSON.parse(frontOCRData);
      } catch (error) {
        console.error('Lỗi parse frontOCRData:', error);
      }
    }
    if (typeof backOCRData === 'string') {
      try {
        backOCRData = JSON.parse(backOCRData);
      } catch (error) {
        console.error('Lỗi parse backOCRData:', error);
      }
    }
    if (!frontOCRData) {
      throw new BadRequestException('Thiếu thông tin OCR mặt trước CCCD');
    }
    const frontFile = files?.find((f: any) => f.fieldname === 'frontImage');
    const backFile = files?.find((f: any) => f.fieldname === 'backImage');
    const result = await this.adminService.saveKycForUser(
      userId,
      frontOCRData,
      backOCRData || frontOCRData,
      frontFile?.buffer || null,
      backFile?.buffer || null,
    );
    return result ;
  }

  @Get('kyc/:userId')
  @CheckPolicies(ability => ability.can(Action.Read, 'Kyc'))
  @ApiOperation({ summary: 'Chi tiết KYC (OCR + tài liệu)' })
  @ApiResponse({ status: 200 })
  async getKycDetail(@Param('userId') userId: string) {
    const detail = await this.adminService.getKycDetail(userId);
    return detail ;
  }

  @Post('kyc/:userId/approve')
  @CheckPolicies(ability => ability.can(Action.Approve, 'Kyc'))
  @ApiOperation({ summary: 'Phê duyệt KYC' })
  @ApiResponse({ status: 200 })
  async approveKyc(@Param('userId') userId: string) {
    const result = await this.adminService.approveKyc(userId);
    return result ;
  }

  @Post('kyc/:userId/reject')
  @CheckPolicies(ability => ability.can(Action.Update, 'Kyc'))
  @ApiOperation({ summary: 'Từ chối KYC' })
  @ApiResponse({ status: 200 })
  async rejectKyc(@Param('userId') userId: string) {
    const result = await this.adminService.rejectKyc(userId);
    return result ;
  }

  @Get('kyc/:userId/documents/:entityType/:entityId/:documentId')
  @CheckPolicies(ability => ability.can(Action.Read, 'Kyc'))
  @ApiOperation({ summary: 'Tải tài liệu KYC (CCCD) từ Fineract' })
  async getKycDocumentStream(
    @Param('userId') userId: string,
    @Param('entityType') entityType: string,
    @Param('entityId', ParseIntPipe) entityId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Res() res: Response,
  ) {
    const response = await this.adminService.getKycDocumentStream(userId, entityType, entityId, documentId);
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Disposition', response.headers['content-disposition'] || 'inline');
    res.send(response.data);
  }
}
