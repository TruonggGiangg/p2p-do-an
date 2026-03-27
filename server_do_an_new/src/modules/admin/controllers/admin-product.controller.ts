import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../guards/admin.guard';
import { AdminService } from '../admin.service';
import { PoliciesGuard } from '../../casl/policies.guard';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { Action } from '../../casl/actions.enum';
import { CreateDocumentTypeDto } from '../dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from '../dto/update-document-type.dto';
import { SetProductDocumentTypesDto } from '../dto/set-product-document-types.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard, PoliciesGuard)
export class AdminProductController {
  constructor(private readonly adminService: AdminService) {}

  @Get('credit-score/weights')
  @CheckPolicies(ability => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Lấy cấu hình trọng số chấm điểm tín dụng' })
  @ApiResponse({ status: 200 })
  async getCreditScoreWeights() {
    const data = await this.adminService.getCreditScoreWeightConfig();
    return data;
  }

  @Put('credit-score/weights')
  @CheckPolicies(ability => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Cập nhật cấu hình trọng số chấm điểm tín dụng' })
  @ApiResponse({ status: 200 })
  async updateCreditScoreWeights(
    @Body()
    body: {
      paymentHistory: number;
      debtLevel: number;
      creditAge: number;
      creditMix: number;
      newCredit: number;
    },
  ) {
    const data = await this.adminService.updateCreditScoreWeightConfig(body);
    return data;
  }

  @Get('credit-score/weight-configs')
  @CheckPolicies(ability => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Lấy danh sách cấu hình trọng số điểm tín dụng' })
  @ApiResponse({ status: 200 })
  async listCreditScoreWeightConfigs() {
    const data = await this.adminService.listCreditScoreWeightConfigs();
    return data;
  }

  @Post('credit-score/weight-configs')
  @CheckPolicies(ability => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Tạo cấu hình trọng số điểm tín dụng' })
  @ApiResponse({ status: 201 })
  async createCreditScoreWeightConfig(
    @Body()
    body: {
      name: string;
      description?: string;
      paymentHistory: number;
      debtLevel: number;
      creditAge: number;
      creditMix: number;
      newCredit: number;
    },
  ) {
    const data = await this.adminService.createCreditScoreWeightConfig(body);
    return data;
  }

  @Put('credit-score/weight-configs/:id')
  @CheckPolicies(ability => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Cập nhật cấu hình trọng số điểm tín dụng theo id' })
  @ApiResponse({ status: 200 })
  async updateCreditScoreWeightConfigById(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      isActive?: boolean;
      paymentHistory: number;
      debtLevel: number;
      creditAge: number;
      creditMix: number;
      newCredit: number;
    },
  ) {
    const data = await this.adminService.updateCreditScoreWeightConfigById(id, body);
    return data;
  }

  @Post('credit-score/weight-configs/:id/apply')
  @CheckPolicies(ability => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Áp dụng cấu hình trọng số điểm tín dụng làm mặc định' })
  @ApiResponse({ status: 200 })
  async applyCreditScoreWeightConfig(@Param('id') id: string) {
    const data = await this.adminService.applyCreditScoreWeightConfig(id);
    return data;
  }

  @Get('loan-products')
  @CheckPolicies(ability => ability.can(Action.Read, 'LoanProduct'))
  @ApiOperation({ summary: 'Danh sách sản phẩm vay từ Fineract (cho admin)' })
  @ApiResponse({ status: 200, description: 'Danh sách sản phẩm vay' })
  async getLoanProducts() {
    const products = await this.adminService.getLoanProductsForAdmin();
    return { products };
  }

  @Get('loan-products/:productId/details')
  @CheckPolicies(ability => ability.can(Action.Read, 'LoanProduct'))
  @ApiOperation({ summary: 'Chi tiết cấu hình sản phẩm vay từ Fineract' })
  @ApiResponse({ status: 200 })
  async getLoanProductDetails(@Param('productId', ParseIntPipe) productId: number) {
    const details = await this.adminService.getLoanProductDetails(productId);
    return details;
  }

  @Get('document-types')
  @CheckPolicies(ability => ability.can(Action.Read, 'DocumentType'))
  @ApiOperation({ summary: 'Danh sách loại tài liệu' })
  @ApiResponse({ status: 200 })
  async getDocumentTypes() {
    const list = await this.adminService.findAllDocumentTypes();
    return list;
  }

  @Post('document-types')
  @CheckPolicies(ability => ability.can(Action.Create, 'DocumentType'))
  @ApiOperation({ summary: 'Tạo loại tài liệu' })
  @ApiResponse({ status: 201 })
  async createDocumentType(@Body() dto: CreateDocumentTypeDto) {
    const doc = await this.adminService.createDocumentType(dto);
    return doc;
  }

  @Get('document-types/:id')
  @CheckPolicies(ability => ability.can(Action.Read, 'DocumentType'))
  @ApiOperation({ summary: 'Chi tiết loại tài liệu' })
  @ApiResponse({ status: 200 })
  async getDocumentType(@Param('id') id: string) {
    const doc = await this.adminService.findOneDocumentType(id);
    return doc;
  }

  @Put('document-types/:id')
  @CheckPolicies(ability => ability.can(Action.Update, 'DocumentType'))
  @ApiOperation({ summary: 'Cập nhật loại tài liệu' })
  @ApiResponse({ status: 200 })
  async updateDocumentType(@Param('id') id: string, @Body() dto: UpdateDocumentTypeDto) {
    const doc = await this.adminService.updateDocumentType(id, dto);
    return doc;
  }

  @Delete('document-types/:id')
  @CheckPolicies(ability => ability.can(Action.Delete, 'DocumentType'))
  @ApiOperation({ summary: 'Xóa loại tài liệu' })
  @ApiResponse({ status: 200 })
  async removeDocumentType(@Param('id') id: string) {
    await this.adminService.removeDocumentType(id);
    return { success: true };
  }

  @Get('loan-products/:fineractProductId/document-types')
  @CheckPolicies(ability => ability.can(Action.Read, 'DocumentType'))
  @ApiOperation({ summary: 'Lấy cấu hình loại tài liệu theo sản phẩm vay' })
  @ApiResponse({ status: 200 })
  async getProductDocumentTypes(@Param('fineractProductId', ParseIntPipe) fineractProductId: number) {
    const list = await this.adminService.getDocumentTypesByProduct(fineractProductId);
    return list;
  }

  @Put('loan-products/:fineractProductId/document-types')
  @CheckPolicies(ability => ability.can(Action.Update, 'DocumentType'))
  @ApiOperation({ summary: 'Gắn loại tài liệu cho sản phẩm vay' })
  @ApiResponse({ status: 200 })
  async setProductDocumentTypes(
    @Param('fineractProductId', ParseIntPipe) fineractProductId: number,
    @Body() dto: SetProductDocumentTypesDto,
  ) {
    const result = await this.adminService.setDocumentTypesForProduct(fineractProductId, dto.items);
    return result;
  }

  @Get('sync-drift')
  @CheckPolicies(ability => ability.can(Action.Read, 'SyncDrift'))
  @ApiOperation({ summary: 'Lịch sử đồng bộ / cảnh báo lệch với Fineract' })
  @ApiResponse({ status: 200 })
  async getSyncDriftLogs(@Query('limit') limit?: string, @Query('scope') scope?: 'loan' | 'savings') {
    const limitNum = limit ? Math.min(parseInt(limit, 10) || 20, 100) : 20;
    const logs = await this.adminService.getSyncDriftLogs(limitNum, scope);
    return logs;
  }

  @Post('sync-compare')
  @CheckPolicies(ability => ability.can(Action.Manage, 'SyncDrift'))
  @ApiOperation({ summary: 'So sánh danh sách sản phẩm vay với Fineract (và ghi log)' })
  @ApiResponse({ status: 200 })
  async syncCompare() {
    const diff = await this.adminService.compareAndSync(true);
    return diff;
  }

  @Get('savings-products')
  @CheckPolicies(ability => ability.can(Action.Read, 'SavingsProduct'))
  @ApiOperation({ summary: 'Danh sách sản phẩm tiết kiệm từ Fineract (cho admin)' })
  @ApiResponse({ status: 200, description: 'Danh sách sản phẩm tiết kiệm' })
  async getSavingsProducts() {
    const products = await this.adminService.getSavingsProductsForAdmin();
    return { products };
  }

  @Get('savings-products/:productId/details')
  @CheckPolicies(ability => ability.can(Action.Read, 'SavingsProduct'))
  @ApiOperation({ summary: 'Chi tiết cấu hình sản phẩm tiết kiệm từ Fineract' })
  @ApiResponse({ status: 200 })
  async getSavingsProductDetails(@Param('productId', ParseIntPipe) productId: number) {
    const details = await this.adminService.getSavingsProductDetails(productId);
    return details;
  }

  @Post('sync-compare-savings')
  @CheckPolicies(ability => ability.can(Action.Manage, 'SyncDrift'))
  @ApiOperation({ summary: 'So sánh danh sách sản phẩm tiết kiệm với Fineract (và ghi log)' })
  @ApiResponse({ status: 200 })
  async syncCompareSavings() {
    const diff = await this.adminService.compareAndSyncSavings(true);
    return diff;
  }

  @Get('fd-products')
  @CheckPolicies(ability => ability.can(Action.Read, 'SavingsProduct'))
  @ApiOperation({ summary: 'Danh sách sản phẩm quỹ đầu tư có kỳ hạn từ Fineract' })
  @ApiResponse({ status: 200 })
  async getFDProducts() {
    const products = await this.adminService.getFDProductsForAdmin();
    return { products };
  }

  @Get('fd-products/:productId/details')
  @CheckPolicies(ability => ability.can(Action.Read, 'SavingsProduct'))
  @ApiOperation({ summary: 'Chi tiết cấu hình sản phẩm quỹ đầu tư có kỳ hạn từ Fineract' })
  @ApiResponse({ status: 200 })
  async getFDProductDetails(@Param('productId', ParseIntPipe) productId: number) {
    const details = await this.adminService.getFDProductDetails(productId);
    return details;
  }

  @Post('sync-compare-fd')
  @CheckPolicies(ability => ability.can(Action.Manage, 'SyncDrift'))
  @ApiOperation({ summary: 'So sánh danh sách sản phẩm quỹ đầu tư có kỳ hạn với Fineract (và ghi log)' })
  @ApiResponse({ status: 200 })
  async syncCompareFD() {
    const diff = await this.adminService.compareAndSyncFD(true);
    return diff;
  }
}
