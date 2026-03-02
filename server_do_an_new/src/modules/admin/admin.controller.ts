import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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
  constructor(private readonly adminService: AdminService) { }

  @Get('loan-products')
  @ApiOperation({ summary: 'Danh sách sản phẩm vay từ Fineract (cho admin)' })
  @ApiResponse({ status: 200, description: 'Danh sách sản phẩm vay' })
  async getLoanProducts() {
    const products = await this.adminService.getLoanProductsForAdmin();
    return { statusCode: 200, message: 'OK', data: { products } };
  }

  @Get('loan-products/:productId/details')
  @ApiOperation({ summary: 'Chi tiết cấu hình sản phẩm vay từ Fineract' })
  @ApiResponse({ status: 200 })
  async getLoanProductDetails(@Param('productId', ParseIntPipe) productId: number) {
    const details = await this.adminService.getLoanProductDetails(productId);
    return { statusCode: 200, message: 'OK', data: details };
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

  // ── Customers ──────────────────────────────────────────────────────────────

  @Get('customers')
  @ApiOperation({ summary: 'Danh sách khách hàng (phân trang)' })
  @ApiResponse({ status: 200 })
  async getCustomers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('keyword') keyword?: string,
  ) {
    const result = await this.adminService.getCustomers(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
      keyword?.trim() || undefined,
    );
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Get('customers/pending-approval')
  @ApiOperation({ summary: 'Danh sách khách hàng chờ phê duyệt (inactive clients)' })
  @ApiResponse({ status: 200 })
  async getPendingApprovalCustomers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('keyword') keyword?: string,
  ) {
    const result = await this.adminService.getPendingApprovalClients(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
      keyword?.trim() || undefined,
    );
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Get('customers/:id')
  @ApiOperation({ summary: 'Chi tiết khách hàng' })
  @ApiResponse({ status: 200 })
  async getCustomer(@Param('id') id: string) {
    const user = await this.adminService.getCustomerById(id);
    return { statusCode: 200, message: 'OK', data: user };
  }

  @Get('customers/:id/detail')
  @ApiOperation({ summary: 'Chi tiết đầy đủ khách hàng (như Mifos: summary, savings, charges)' })
  @ApiResponse({ status: 200 })
  async getCustomerDetail(@Param('id') id: string) {
    const detail = await this.adminService.getCustomerDetail(id);
    return { statusCode: 200, message: 'OK', data: detail };
  }

  @Get('customers/:id/loans')
  @ApiOperation({ summary: 'Khoản vay của khách hàng (chỉ sản phẩm P*)' })
  @ApiResponse({ status: 200 })
  async getCustomerLoans(@Param('id') id: string) {
    const loans = await this.adminService.getCustomerLoans(id);
    return { statusCode: 200, message: 'OK', data: { loans } };
  }

  // ── Loan Approvals ──────────────────────────────────────────────────────────

  @Get('loans/pending')
  @ApiOperation({ summary: 'Danh sách khoản vay chờ phê duyệt (sản phẩm P*)' })
  @ApiResponse({ status: 200 })
  async getPendingLoans() {
    const loans = await this.adminService.getAllPendingLoans();
    return { statusCode: 200, message: 'OK', data: { loans } };
  }

  @Post('loans/:fineractLoanId/approve')
  @ApiOperation({ summary: 'Phê duyệt khoản vay' })
  @ApiResponse({ status: 200 })
  async approveLoan(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const result = await this.adminService.approveLoan(fineractLoanId);
    return { statusCode: 200, message: 'Đã phê duyệt', data: result };
  }

  @Post('loans/:fineractLoanId/disburse')
  @ApiOperation({ summary: 'Giải ngân khoản vay' })
  @ApiResponse({ status: 200 })
  async disburseLoan(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const result = await this.adminService.disburseLoan(fineractLoanId);
    return { statusCode: 200, message: 'Đã giải ngân', data: result };
  }

  @Get('loans/:fineractLoanId/details')
  @ApiOperation({ summary: 'Chi tiết khoản vay từ Fineract (bao gồm lịch trả nợ)' })
  @ApiResponse({ status: 200 })
  async getLoanDetails(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const details = await this.adminService.getLoanDetails(fineractLoanId);
    return { statusCode: 200, message: 'OK', data: details };
  }

  @Get('loans/:fineractLoanId/documents')
  @ApiOperation({ summary: 'Danh sách tài liệu của khoản vay' })
  @ApiResponse({ status: 200 })
  async getLoanDocuments(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const list = await this.adminService.getLoanDocuments(fineractLoanId);
    return { statusCode: 200, message: 'OK', data: list };
  }

  @Post('loans/:fineractLoanId/documents/:documentId/approve')
  @ApiOperation({ summary: 'Duyệt tài liệu' })
  @ApiResponse({ status: 200 })
  async approveDocument(
    @Param('fineractLoanId', ParseIntPipe) fineractLoanId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    const result = await this.adminService.approveDocument(fineractLoanId, documentId);
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Post('loans/:fineractLoanId/documents/:documentId/reject')
  @ApiOperation({ summary: 'Từ chối tài liệu' })
  @ApiResponse({ status: 200 })
  async rejectDocument(
    @Param('fineractLoanId', ParseIntPipe) fineractLoanId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    const result = await this.adminService.rejectDocument(fineractLoanId, documentId);
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Get('loans/:fineractLoanId/can-approve')
  @ApiOperation({ summary: 'Kiểm tra đã duyệt đủ tài liệu bắt buộc chưa' })
  @ApiResponse({ status: 200 })
  async canApproveLoan(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const result = await this.adminService.canApproveLoan(fineractLoanId);
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Get('loans/:fineractLoanId/documents/:documentId')
  @ApiOperation({ summary: 'Tải tài liệu của khoản vay' })
  async getLoanDocumentStream(
    @Param('fineractLoanId', ParseIntPipe) fineractLoanId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Res() res: Response,
  ) {
    const response = await this.adminService.getLoanDocumentStream(fineractLoanId, documentId);
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Disposition', response.headers['content-disposition'] || 'inline');
    res.send(response.data);
  }

  // ── KYC Approvals ──────────────────────────────────────────────────────────

  @Get('kyc/pending')
  @ApiOperation({ summary: 'Danh sách KYC chờ phê duyệt' })
  @ApiResponse({ status: 200 })
  async getPendingKyc() {
    const list = await this.adminService.getPendingKycUsers();
    return { statusCode: 200, message: 'OK', data: { users: list } };
  }

  @Get('kyc/:userId')
  @ApiOperation({ summary: 'Chi tiết KYC (OCR + tài liệu)' })
  @ApiResponse({ status: 200 })
  async getKycDetail(@Param('userId') userId: string) {
    const detail = await this.adminService.getKycDetail(userId);
    return { statusCode: 200, message: 'OK', data: detail };
  }

  @Post('kyc/:userId/approve')
  @ApiOperation({ summary: 'Phê duyệt KYC' })
  @ApiResponse({ status: 200 })
  async approveKyc(@Param('userId') userId: string) {
    const result = await this.adminService.approveKyc(userId);
    return { statusCode: 200, message: 'Đã phê duyệt KYC', data: result };
  }

  @Post('kyc/:userId/reject')
  @ApiOperation({ summary: 'Từ chối KYC' })
  @ApiResponse({ status: 200 })
  async rejectKyc(@Param('userId') userId: string) {
    const result = await this.adminService.rejectKyc(userId);
    return { statusCode: 200, message: 'Đã từ chối KYC', data: result };
  }

  @Get('kyc/:userId/documents/:entityType/:entityId/:documentId')
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
