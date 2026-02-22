import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { AdminService } from './admin.service';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { SetProductDocumentTypesDto } from './dto/set-product-document-types.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('loan-products')
  @ApiOperation({ summary: 'Danh sách sản phẩm vay từ Fineract (cho admin)' })
  @ApiResponse({ status: 200, description: 'Danh sách sản phẩm vay' })
  async getLoanProducts() {
    const products = await this.adminService.getLoanProductsForAdmin();
    return { statusCode: 200, message: 'OK', data: { products } };
  }

  @Get('document-types')
  @ApiOperation({ summary: 'Danh sách loại tài liệu' })
  @ApiResponse({ status: 200 })
  async getDocumentTypes() {
    const list = await this.adminService.findAllDocumentTypes();
    return { statusCode: 200, message: 'OK', data: list };
  }

  @Post('document-types')
  @ApiOperation({ summary: 'Tạo loại tài liệu' })
  @ApiResponse({ status: 201 })
  async createDocumentType(@Body() dto: CreateDocumentTypeDto) {
    const doc = await this.adminService.createDocumentType(dto);
    return { statusCode: 201, message: 'Created', data: doc };
  }

  @Get('document-types/:id')
  @ApiOperation({ summary: 'Chi tiết loại tài liệu' })
  @ApiResponse({ status: 200 })
  async getDocumentType(@Param('id') id: string) {
    const doc = await this.adminService.findOneDocumentType(id);
    return { statusCode: 200, message: 'OK', data: doc };
  }

  @Put('document-types/:id')
  @ApiOperation({ summary: 'Cập nhật loại tài liệu' })
  @ApiResponse({ status: 200 })
  async updateDocumentType(@Param('id') id: string, @Body() dto: UpdateDocumentTypeDto) {
    const doc = await this.adminService.updateDocumentType(id, dto);
    return { statusCode: 200, message: 'OK', data: doc };
  }

  @Delete('document-types/:id')
  @ApiOperation({ summary: 'Xóa loại tài liệu' })
  @ApiResponse({ status: 200 })
  async removeDocumentType(@Param('id') id: string) {
    await this.adminService.removeDocumentType(id);
    return { statusCode: 200, message: 'Deleted' };
  }

  @Get('loan-products/:fineractProductId/document-types')
  @ApiOperation({ summary: 'Lấy cấu hình loại tài liệu theo sản phẩm vay' })
  @ApiResponse({ status: 200 })
  async getProductDocumentTypes(@Param('fineractProductId', ParseIntPipe) fineractProductId: number) {
    const list = await this.adminService.getDocumentTypesByProduct(fineractProductId);
    return { statusCode: 200, message: 'OK', data: list };
  }

  @Put('loan-products/:fineractProductId/document-types')
  @ApiOperation({ summary: 'Gắn loại tài liệu cho sản phẩm vay' })
  @ApiResponse({ status: 200 })
  async setProductDocumentTypes(
    @Param('fineractProductId', ParseIntPipe) fineractProductId: number,
    @Body() dto: SetProductDocumentTypesDto,
  ) {
    const result = await this.adminService.setDocumentTypesForProduct(fineractProductId, dto.items);
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Get('sync-drift')
  @ApiOperation({ summary: 'Lịch sử đồng bộ / cảnh báo lệch với Fineract' })
  @ApiResponse({ status: 200 })
  async getSyncDriftLogs(@Query('limit') limit?: string) {
    const limitNum = limit ? Math.min(parseInt(limit, 10) || 20, 100) : 20;
    const logs = await this.adminService.getSyncDriftLogs(limitNum);
    return { statusCode: 200, message: 'OK', data: logs };
  }

  @Post('sync-compare')
  @ApiOperation({ summary: 'So sánh danh sách sản phẩm vay với Fineract (và ghi log)' })
  @ApiResponse({ status: 200 })
  async syncCompare() {
    const diff = await this.adminService.compareAndSync(true);
    return { statusCode: 200, message: 'OK', data: diff };
  }
}
