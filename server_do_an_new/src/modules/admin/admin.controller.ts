import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { AdminService } from './admin.service';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { SetProductDocumentTypesDto } from './dto/set-product-document-types.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { RegisterDto } from 'src/modules/auth/dto/register.dto';
import { PoliciesGuard } from '../casl/policies.guard';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { Action } from '../casl/actions.enum';
import { CaslAbilityFactory } from '../casl/casl-ability.factory';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ReminderScheduler } from './reminder.scheduler';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard, PoliciesGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly activityLogService: ActivityLogService,
    private readonly reminderScheduler: ReminderScheduler,
  ) {}

  /**
   * Returns the raw CASL rules for the current user so the
   * admin-web front-end can build a matching Ability instance.
   */
  @Get('me/permissions')
  @ApiOperation({ summary: 'Lấy danh sách quyền của user hiện tại (cho frontend CASL)' })
  @ApiResponse({ status: 200 })
  async getMyPermissions(@Req() req: any) {
    const ability = await this.caslAbilityFactory.createForUser(req.user);
    return {
      statusCode: 200,
      message: 'OK',
      data: { rules: ability.rules, roles: req.user.roles ?? [] },
    };
  }

  @Get('me/profile')
  @ApiOperation({ summary: 'Lấy thông tin cá nhân của user hiện tại' })
  @ApiResponse({ status: 200 })
  async getMyProfile(@Req() req: any) {
    const profile = await this.adminService.getMyProfile(req.user._id?.toString());
    return { statusCode: 200, message: 'OK', data: profile };
  }

  @Put('me/profile')
  @ApiOperation({ summary: 'Cập nhật hồ sơ cá nhân' })
  @ApiResponse({ status: 200 })
  async updateMyProfile(
    @Req() req: any,
    @Body() body: { firstName?: string; lastName?: string; email?: string; phoneNumber?: string },
  ) {
    const result = await this.adminService.updateMyProfile(req.user._id.toString(), body);
    return { statusCode: 200, message: 'Cập nhật thành công', data: result };
  }

  @Get('me/activity-logs')
  @ApiOperation({ summary: 'Lịch sử hoạt động của user hiện tại' })
  @ApiResponse({ status: 200 })
  async getMyActivityLogs(@Req() req: any, @Query('page') page?: string, @Query('limit') limit?: string) {
    const result = await this.activityLogService.findByUser(
      req.user._id?.toString(),
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
    );
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Put('me/password')
  @ApiOperation({ summary: 'Đổi mật khẩu cá nhân' })
  @ApiResponse({ status: 200 })
  async changeMyPassword(@Req() req: any, @Body() body: { currentPassword: string; newPassword: string }) {
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException('Vui lòng nhập mật khẩu hiện tại và mật khẩu mới');
    }
    if (body.newPassword.length < 6) {
      throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự');
    }
    const result = await this.adminService.changeMyPassword(
      req.user._id.toString(),
      body.currentPassword,
      body.newPassword,
    );
    return { statusCode: 200, message: 'Đổi mật khẩu thành công', data: result };
  }

  // ── User Preferences ─────────────────────────────────────────────────────

  @Get('me/preferences')
  @ApiOperation({ summary: 'Lấy cài đặt giao diện (fontSize, v.v.) của user hiện tại' })
  @ApiResponse({ status: 200 })
  async getMyPreferences(@Req() req: any) {
    const prefs = await this.adminService.getMyPreferences(req.user._id?.toString());
    return { statusCode: 200, message: 'OK', data: prefs };
  }

  @Patch('me/preferences')
  @ApiOperation({ summary: 'Cập nhật cài đặt giao diện (fontSize, v.v.)' })
  @ApiResponse({ status: 200 })
  async updateMyPreferences(@Req() req: any, @Body() body: { fontSize?: 'compact' | 'default' | 'large' }) {
    const prefs = await this.adminService.updateMyPreferences(req.user._id.toString(), body);
    return { statusCode: 200, message: 'Cập nhật thành công', data: prefs };
  }

  @Get('credit-score/weights')
  @CheckPolicies(ability => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Lấy cấu hình trọng số chấm điểm tín dụng' })
  @ApiResponse({ status: 200 })
  async getCreditScoreWeights() {
    const data = await this.adminService.getCreditScoreWeightConfig();
    return { statusCode: 200, message: 'OK', data };
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
    return { statusCode: 200, message: 'Cập nhật thành công', data };
  }

  @Get('loan-products')
  @CheckPolicies(ability => ability.can(Action.Read, 'LoanProduct'))
  @ApiOperation({ summary: 'Danh sách sản phẩm vay từ Fineract (cho admin)' })
  @ApiResponse({ status: 200, description: 'Danh sách sản phẩm vay' })
  async getLoanProducts() {
    const products = await this.adminService.getLoanProductsForAdmin();
    return { statusCode: 200, message: 'OK', data: { products } };
  }

  @Get('loan-products/:productId/details')
  @CheckPolicies(ability => ability.can(Action.Read, 'LoanProduct'))
  @ApiOperation({ summary: 'Chi tiết cấu hình sản phẩm vay từ Fineract' })
  @ApiResponse({ status: 200 })
  async getLoanProductDetails(@Param('productId', ParseIntPipe) productId: number) {
    const details = await this.adminService.getLoanProductDetails(productId);
    return { statusCode: 200, message: 'OK', data: details };
  }

  @Get('document-types')
  @CheckPolicies(ability => ability.can(Action.Read, 'DocumentType'))
  @ApiOperation({ summary: 'Danh sách loại tài liệu' })
  @ApiResponse({ status: 200 })
  async getDocumentTypes() {
    const list = await this.adminService.findAllDocumentTypes();
    return { statusCode: 200, message: 'OK', data: list };
  }

  @Post('document-types')
  @CheckPolicies(ability => ability.can(Action.Create, 'DocumentType'))
  @ApiOperation({ summary: 'Tạo loại tài liệu' })
  @ApiResponse({ status: 201 })
  async createDocumentType(@Body() dto: CreateDocumentTypeDto) {
    const doc = await this.adminService.createDocumentType(dto);
    return { statusCode: 201, message: 'Created', data: doc };
  }

  @Get('document-types/:id')
  @CheckPolicies(ability => ability.can(Action.Read, 'DocumentType'))
  @ApiOperation({ summary: 'Chi tiết loại tài liệu' })
  @ApiResponse({ status: 200 })
  async getDocumentType(@Param('id') id: string) {
    const doc = await this.adminService.findOneDocumentType(id);
    return { statusCode: 200, message: 'OK', data: doc };
  }

  @Put('document-types/:id')
  @CheckPolicies(ability => ability.can(Action.Update, 'DocumentType'))
  @ApiOperation({ summary: 'Cập nhật loại tài liệu' })
  @ApiResponse({ status: 200 })
  async updateDocumentType(@Param('id') id: string, @Body() dto: UpdateDocumentTypeDto) {
    const doc = await this.adminService.updateDocumentType(id, dto);
    return { statusCode: 200, message: 'OK', data: doc };
  }

  @Delete('document-types/:id')
  @CheckPolicies(ability => ability.can(Action.Delete, 'DocumentType'))
  @ApiOperation({ summary: 'Xóa loại tài liệu' })
  @ApiResponse({ status: 200 })
  async removeDocumentType(@Param('id') id: string) {
    await this.adminService.removeDocumentType(id);
    return { statusCode: 200, message: 'Deleted' };
  }

  @Get('loan-products/:fineractProductId/document-types')
  @CheckPolicies(ability => ability.can(Action.Read, 'DocumentType'))
  @ApiOperation({ summary: 'Lấy cấu hình loại tài liệu theo sản phẩm vay' })
  @ApiResponse({ status: 200 })
  async getProductDocumentTypes(@Param('fineractProductId', ParseIntPipe) fineractProductId: number) {
    const list = await this.adminService.getDocumentTypesByProduct(fineractProductId);
    return { statusCode: 200, message: 'OK', data: list };
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
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Get('sync-drift')
  @CheckPolicies(ability => ability.can(Action.Read, 'SyncDrift'))
  @ApiOperation({ summary: 'Lịch sử đồng bộ / cảnh báo lệch với Fineract' })
  @ApiResponse({ status: 200 })
  async getSyncDriftLogs(@Query('limit') limit?: string, @Query('scope') scope?: 'loan' | 'savings') {
    const limitNum = limit ? Math.min(parseInt(limit, 10) || 20, 100) : 20;
    const logs = await this.adminService.getSyncDriftLogs(limitNum, scope);
    return { statusCode: 200, message: 'OK', data: logs };
  }

  @Post('sync-compare')
  @CheckPolicies(ability => ability.can(Action.Manage, 'SyncDrift'))
  @ApiOperation({ summary: 'So sánh danh sách sản phẩm vay với Fineract (và ghi log)' })
  @ApiResponse({ status: 200 })
  async syncCompare() {
    const diff = await this.adminService.compareAndSync(true);
    return { statusCode: 200, message: 'OK', data: diff };
  }

  @Get('savings-products')
  @CheckPolicies(ability => ability.can(Action.Read, 'SavingsProduct'))
  @ApiOperation({ summary: 'Danh sách sản phẩm tiết kiệm từ Fineract (cho admin)' })
  @ApiResponse({ status: 200, description: 'Danh sách sản phẩm tiết kiệm' })
  async getSavingsProducts() {
    const products = await this.adminService.getSavingsProductsForAdmin();
    return { statusCode: 200, message: 'OK', data: { products } };
  }

  @Get('savings-products/:productId/details')
  @CheckPolicies(ability => ability.can(Action.Read, 'SavingsProduct'))
  @ApiOperation({ summary: 'Chi tiết cấu hình sản phẩm tiết kiệm từ Fineract' })
  @ApiResponse({ status: 200 })
  async getSavingsProductDetails(@Param('productId', ParseIntPipe) productId: number) {
    const details = await this.adminService.getSavingsProductDetails(productId);
    return { statusCode: 200, message: 'OK', data: details };
  }

  @Post('sync-compare-savings')
  @CheckPolicies(ability => ability.can(Action.Manage, 'SyncDrift'))
  @ApiOperation({ summary: 'So sánh danh sách sản phẩm tiết kiệm với Fineract (và ghi log)' })
  @ApiResponse({ status: 200 })
  async syncCompareSavings() {
    const diff = await this.adminService.compareAndSyncSavings(true);
    return { statusCode: 200, message: 'OK', data: diff };
  }

  // ── Customers ──────────────────────────────────────────────────────────────

  @Get('customers')
  @CheckPolicies(ability => ability.can(Action.Read, 'Customer'))
  @ApiOperation({ summary: 'Danh sách khách hàng (phân trang)' })
  @ApiResponse({ status: 200 })
  async getCustomers(@Query('page') page?: string, @Query('limit') limit?: string, @Query('keyword') keyword?: string) {
    const result = await this.adminService.getCustomers(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
      keyword?.trim() || undefined,
    );
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Get('customers/pending-approval')
  @CheckPolicies(ability => ability.can(Action.Read, 'Customer'))
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
  @CheckPolicies(ability => ability.can(Action.Read, 'Customer'))
  @ApiOperation({ summary: 'Chi tiết khách hàng' })
  @ApiResponse({ status: 200 })
  async getCustomer(@Param('id') id: string) {
    const user = await this.adminService.getCustomerById(id);
    return { statusCode: 200, message: 'OK', data: user };
  }

  @Get('customers/:id/detail')
  @CheckPolicies(ability => ability.can(Action.Read, 'Customer'))
  @ApiOperation({ summary: 'Chi tiết đầy đủ khách hàng (như Mifos: summary, savings, charges)' })
  @ApiResponse({ status: 200 })
  async getCustomerDetail(@Param('id') id: string) {
    const detail = await this.adminService.getCustomerDetail(id);
    return { statusCode: 200, message: 'OK', data: detail };
  }

  @Get('customers/:id/loans')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Khoản vay của khách hàng (chỉ sản phẩm P*)' })
  @ApiResponse({ status: 200 })
  async getCustomerLoans(@Param('id') id: string) {
    const loans = await this.adminService.getCustomerLoans(id);
    return { statusCode: 200, message: 'OK', data: { loans } };
  }

  // ── Loan Management ──────────────────────────────────────────────────────────

  @Get('loans/stats')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Thống kê khoản vay theo trạng thái' })
  @ApiResponse({ status: 200 })
  async getLoansStats() {
    const stats = await this.adminService.getLoansStats();
    return { statusCode: 200, message: 'OK', data: stats };
  }

  @Get('loans')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Danh sách khoản vay thống nhất với filter' })
  @ApiResponse({ status: 200 })
  async getLoans(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('productId') productId?: string,
    @Query('classification') classification?: string,
    @Query('keyword') keyword?: string,
    @Query('delinquentDaysMin') delinquentDaysMin?: string,
    @Query('delinquentDaysMax') delinquentDaysMax?: string,
    @Query('minOverdueAmount') minOverdueAmount?: string,
    @Query('maxOverdueAmount') maxOverdueAmount?: string,
    @Query('disbursementDateFrom') disbursementDateFrom?: string,
    @Query('disbursementDateTo') disbursementDateTo?: string,
  ) {
    const filters: any = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status: status as any,
      classification: classification || undefined,
      keyword: keyword?.trim() || undefined,
      disbursementDateFrom: disbursementDateFrom || undefined,
      disbursementDateTo: disbursementDateTo || undefined,
    };
    if (productId) filters.productId = parseInt(productId, 10);
    if (delinquentDaysMin != null) filters.delinquentDaysMin = parseInt(delinquentDaysMin, 10);
    if (delinquentDaysMax != null) filters.delinquentDaysMax = parseInt(delinquentDaysMax, 10);
    if (minOverdueAmount != null) filters.minOverdueAmount = parseFloat(minOverdueAmount);
    if (maxOverdueAmount != null) filters.maxOverdueAmount = parseFloat(maxOverdueAmount);
    const result = await this.adminService.getLoans(filters);
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Get('loans/pending')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Danh sách khoản vay chờ phê duyệt (sản phẩm P*)' })
  @ApiResponse({ status: 200 })
  async getPendingLoans() {
    const loans = await this.adminService.getAllPendingLoans();
    return { statusCode: 200, message: 'OK', data: { loans } };
  }

  @Post('sync-disbursed-loans')
  @CheckPolicies(ability => ability.can(Action.Update, 'Loan'))
  @ApiOperation({
    summary:
      'Đồng bộ tất cả khoản vay đã giải ngân từ Fineract vào Mongo; báo cáo từng thay đổi và lưu vào loan_sync_runs',
  })
  @ApiResponse({ status: 200 })
  async syncDisbursedLoans(@Query('limit') limit?: string) {
    const max = limit != null ? Math.min(parseInt(limit, 10) || 300, 500) : 300;
    const result = await this.adminService.syncDisbursedLoansFromFineract(max, { trigger: 'manual' });
    return { statusCode: 200, message: 'Đồng bộ xong', data: result };
  }

  @Get('loan-sync-runs')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Lấy lịch sử chạy đồng bộ khoản vay (truy vết từng thay đổi)' })
  @ApiResponse({ status: 200 })
  async getLoanSyncRuns(@Query('limit') limit?: string) {
    const limitNum = limit != null ? Math.min(parseInt(limit, 10) || 30, 100) : 30;
    const runs = await this.adminService.getLoanSyncRuns(limitNum);
    return { statusCode: 200, message: 'OK', data: runs };
  }

  @Post('loans/:fineractLoanId/approve')
  @CheckPolicies(ability => ability.can(Action.Approve, 'Loan'))
  @ApiOperation({ summary: 'Phê duyệt khoản vay' })
  @ApiResponse({ status: 200 })
  async approveLoan(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const result = await this.adminService.approveLoan(fineractLoanId);
    return { statusCode: 200, message: 'Đã phê duyệt', data: result };
  }

  @Post('loans/:fineractLoanId/disburse')
  @CheckPolicies(ability => ability.can(Action.Disburse, 'Loan'))
  @ApiOperation({ summary: 'Giải ngân khoản vay' })
  @ApiResponse({ status: 200 })
  async disburseLoan(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const result = await this.adminService.disburseLoan(fineractLoanId);
    return { statusCode: 200, message: 'Đã giải ngân', data: result };
  }

  @Get('loans/:fineractLoanId/contract-status')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Kiểm tra trạng thái hợp đồng (đã ký chưa)' })
  @ApiResponse({ status: 200 })
  async getContractStatus(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const result = await this.adminService.getContractStatus(fineractLoanId);
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Get('loans/:fineractLoanId/details')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Chi tiết khoản vay từ Fineract (bao gồm lịch trả nợ)' })
  @ApiResponse({ status: 200 })
  async getLoanDetails(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number, @Query('sync') sync?: string) {
    const details = await this.adminService.getLoanDetails(fineractLoanId, sync === 'true');
    return { statusCode: 200, message: 'OK', data: details };
  }

  @Post('loans/:fineractLoanId/sync')
  @CheckPolicies(ability => ability.can(Action.Update, 'Loan'))
  @ApiOperation({ summary: 'Đồng bộ dữ liệu khoản vay từ Fineract' })
  @ApiResponse({ status: 200 })
  async syncLoan(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const result = await this.adminService.syncLoanFromFineract(fineractLoanId);
    return { statusCode: 200, message: 'Đồng bộ thành công', data: result };
  }

  @Post('customers/:id/sync-loans')
  @CheckPolicies(ability => ability.can(Action.Update, 'Customer'))
  @ApiOperation({ summary: 'Đồng bộ toàn bộ khoản vay của khách hàng từ Fineract' })
  @ApiResponse({ status: 200 })
  async syncCustomerLoans(@Param('id') id: string) {
    const result = await this.adminService.syncClientLoansFromFineract(id);
    return { statusCode: 200, message: 'Đồng bộ hoàn tất', data: result };
  }

  @Get('loans/:fineractLoanId/documents')
  @CheckPolicies(ability => ability.can(Action.Read, 'LoanDocument'))
  @ApiOperation({ summary: 'Danh sách tài liệu của khoản vay' })
  @ApiResponse({ status: 200 })
  async getLoanDocuments(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const list = await this.adminService.getLoanDocuments(fineractLoanId);
    return { statusCode: 200, message: 'OK', data: list };
  }

  @Post('loans/:fineractLoanId/documents/:documentId/approve')
  @CheckPolicies(ability => ability.can(Action.Approve, 'LoanDocument'))
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
  @CheckPolicies(ability => ability.can(Action.Update, 'LoanDocument'))
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
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Kiểm tra đã duyệt đủ tài liệu bắt buộc chưa' })
  @ApiResponse({ status: 200 })
  async canApproveLoan(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const result = await this.adminService.canApproveLoan(fineractLoanId);
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Get('loans/:fineractLoanId/documents/:documentId')
  @CheckPolicies(ability => ability.can(Action.Read, 'LoanDocument'))
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
  @CheckPolicies(ability => ability.can(Action.Read, 'Kyc'))
  @ApiOperation({ summary: 'Danh sách KYC chờ phê duyệt' })
  @ApiResponse({ status: 200 })
  async getPendingKyc() {
    const list = await this.adminService.getPendingKycUsers();
    return { statusCode: 200, message: 'OK', data: { users: list } };
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
    return { statusCode: 200, message: 'OK', data: result };
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
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Post('kyc/:userId/save')
  @CheckPolicies(ability => ability.can(Action.Create, 'Kyc'))
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({ summary: 'Lưu KYC (nhân viên làm giúp khách hàng)' })
  async saveKyc(@Param('userId') userId: string, @UploadedFiles() files: any[], @Req() req: any) {
    const body = req.body;
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
    return { statusCode: 200, message: 'Đã lưu hồ sơ KYC', data: result };
  }

  @Get('kyc/:userId')
  @CheckPolicies(ability => ability.can(Action.Read, 'Kyc'))
  @ApiOperation({ summary: 'Chi tiết KYC (OCR + tài liệu)' })
  @ApiResponse({ status: 200 })
  async getKycDetail(@Param('userId') userId: string) {
    const detail = await this.adminService.getKycDetail(userId);
    return { statusCode: 200, message: 'OK', data: detail };
  }

  @Post('kyc/:userId/approve')
  @CheckPolicies(ability => ability.can(Action.Approve, 'Kyc'))
  @ApiOperation({ summary: 'Phê duyệt KYC' })
  @ApiResponse({ status: 200 })
  async approveKyc(@Param('userId') userId: string) {
    const result = await this.adminService.approveKyc(userId);
    return { statusCode: 200, message: 'Đã phê duyệt KYC', data: result };
  }

  @Post('kyc/:userId/reject')
  @CheckPolicies(ability => ability.can(Action.Update, 'Kyc'))
  @ApiOperation({ summary: 'Từ chối KYC' })
  @ApiResponse({ status: 200 })
  async rejectKyc(@Param('userId') userId: string) {
    const result = await this.adminService.rejectKyc(userId);
    return { statusCode: 200, message: 'Đã từ chối KYC', data: result };
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

  // ── Staff Management ──────────────────────────────────────────────────────

  @Post('staff')
  @CheckPolicies(ability => ability.can(Action.Create, 'Staff'))
  @ApiOperation({ summary: 'Tạo nhân viên (Keycloak → Fineract → MongoDB)' })
  @ApiResponse({ status: 201 })
  async createStaff(@Body() dto: RegisterDto) {
    const result = await this.adminService.createStaff(dto);
    return { statusCode: 201, message: 'Đã tạo nhân viên', data: result };
  }

  @Get('staff')
  @CheckPolicies(ability => ability.can(Action.Read, 'Staff'))
  @ApiOperation({ summary: 'Danh sách nhân viên (phân trang)' })
  @ApiResponse({ status: 200 })
  async getStaffList(@Query('page') page?: string, @Query('limit') limit?: string, @Query('keyword') keyword?: string) {
    const result = await this.adminService.getStaffList(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
      keyword?.trim() || undefined,
    );
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Get('staff/:id')
  @CheckPolicies(ability => ability.can(Action.Read, 'Staff'))
  @ApiOperation({ summary: 'Chi tiết nhân viên' })
  @ApiResponse({ status: 200 })
  async getStaffById(@Param('id') id: string) {
    const staff = await this.adminService.getStaffById(id);
    return { statusCode: 200, message: 'OK', data: staff };
  }

  @Put('staff/:id')
  @CheckPolicies(ability => ability.can(Action.Update, 'Staff'))
  @ApiOperation({ summary: 'Cập nhật nhân viên' })
  @ApiResponse({ status: 200 })
  async updateStaff(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    const result = await this.adminService.updateStaff(id, dto);
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Delete('staff/:id')
  @CheckPolicies(ability => ability.can(Action.Delete, 'Staff'))
  @ApiOperation({ summary: 'Khóa nhân viên (soft delete)' })
  @ApiResponse({ status: 200 })
  async deleteStaff(@Param('id') id: string) {
    const result = await this.adminService.deleteStaff(id);
    return { statusCode: 200, message: 'Đã khóa nhân viên', data: result };
  }

  @Post('staff/:id/restore')
  @CheckPolicies(ability => ability.can(Action.Update, 'Staff'))
  @ApiOperation({ summary: 'Khôi phục nhân viên đã khóa' })
  @ApiResponse({ status: 200 })
  async restoreStaff(@Param('id') id: string) {
    const result = await this.adminService.restoreStaff(id);
    return { statusCode: 200, message: 'Đã khôi phục nhân viên', data: result };
  }

  @Get('staff-deleted')
  @CheckPolicies(ability => ability.can(Action.Read, 'Staff'))
  @ApiOperation({ summary: 'Danh sách nhân viên đã khóa' })
  @ApiResponse({ status: 200 })
  async getDeletedStaffList(@Query('page') page?: string, @Query('limit') limit?: string) {
    const result = await this.adminService.getDeletedStaffList(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
    );
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Post('migrate-phone-numbers')
  @CheckPolicies(ability => ability.can(Action.Manage, 'Migration'))
  @ApiOperation({ summary: 'Migration: Set phoneNumber = username cho tất cả user' })
  @ApiResponse({ status: 200 })
  async migratePhoneNumbers() {
    const result = await this.adminService.migratePhoneNumbers();
    return { statusCode: 200, message: 'Migration hoàn tất', data: result };
  }

  // ── Activity Logs ─────────────────────────────────────────────────────────

  @Get('activity-logs')
  @CheckPolicies(ability => ability.can(Action.Read, 'Staff'))
  @ApiOperation({ summary: 'Lấy danh sách lịch sử hoạt động (phân trang)' })
  @ApiResponse({ status: 200 })
  async getActivityLogs(@Query('page') page?: string, @Query('limit') limit?: string) {
    const result = await this.activityLogService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
    );
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Get('activity-logs/user/:userId')
  @CheckPolicies(ability => ability.can(Action.Read, 'Staff'))
  @ApiOperation({ summary: 'Lấy lịch sử hoạt động theo userId' })
  @ApiResponse({ status: 200 })
  async getActivityLogsByUser(
    @Param('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.activityLogService.findByUser(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
    );
    return { statusCode: 200, message: 'OK', data: result };
  }

  // ── Loan Support Requests ──────────────────────────────────────────────────

  @Get('loan-support-requests')
  @CheckPolicies(ability => ability.can(Action.Read, 'LoanApplication'))
  @ApiOperation({ summary: 'Lấy danh sách yêu cầu hỗ trợ nợ (Waive/Reschedule)' })
  @ApiResponse({ status: 200 })
  async getSupportRequests(@Query() query: any) {
    const result = await this.adminService.getSupportRequests(query);
    return { statusCode: 200, message: 'OK', data: result };
  }

  @Post('loan-support-requests/:id/approve-waive')
  @CheckPolicies(ability => ability.can(Action.Update, 'LoanApplication'))
  @ApiOperation({ summary: 'Phê duyệt yêu cầu miễn giảm phí phạt' })
  @ApiResponse({ status: 200 })
  async approveWaivePenalty(@Req() req: any, @Param('id') id: string) {
    const adminId = req.user?._id ?? req.user?.sub;
    const result = await this.adminService.approveWaivePenalty(id, adminId);
    return { statusCode: 200, message: 'Miễn giảm phí phạt thành công', data: result };
  }

  @Post('loan-support-requests/:id/approve-reschedule')
  @CheckPolicies(ability => ability.can(Action.Update, 'LoanApplication'))
  @ApiOperation({ summary: 'Phê duyệt yêu cầu cơ cấu lại nợ' })
  @ApiResponse({ status: 200 })
  async approveReschedule(@Req() req: any, @Param('id') id: string, @Body('note') note?: string) {
    const adminId = req.user?._id ?? req.user?.sub;
    const result = await this.adminService.approveReschedule(id, adminId, note);
    return { statusCode: 200, message: 'Cơ cấu nợ thành công', data: result };
  }

  @Post('loan-support-requests/:id/approve-write-off')
  @CheckPolicies(ability => ability.can(Action.Update, 'LoanApplication'))
  @ApiOperation({ summary: 'Phê duyệt yêu cầu xóa nợ (write-off)' })
  @ApiResponse({ status: 200 })
  async approveWriteOff(@Req() req: any, @Param('id') id: string, @Body('note') note?: string) {
    const adminId = req.user?._id ?? req.user?.sub;
    const result = await this.adminService.approveWriteOff(id, adminId, note);
    return { statusCode: 200, message: 'Xóa nợ thành công', data: result };
  }

  @Post('loan-support-requests/:id/approve-waive-interest')
  @CheckPolicies(ability => ability.can(Action.Update, 'LoanApplication'))
  @ApiOperation({ summary: 'Phê duyệt yêu cầu xóa lãi' })
  @ApiResponse({ status: 200 })
  async approveWaiveInterest(@Req() req: any, @Param('id') id: string, @Body('note') note?: string) {
    const adminId = req.user?._id ?? req.user?.sub;
    const result = await this.adminService.approveWaiveInterest(id, adminId, note);
    return { statusCode: 200, message: 'Xóa lãi thành công', data: result };
  }
  @Post('test-reminders')
  @CheckPolicies(ability => ability.can(Action.Manage, 'Loan'))
  @ApiOperation({ summary: 'Trigger reminder cron jobs manually for testing' })
  async triggerReminders() {
    await Promise.all([
      this.reminderScheduler.handleRepaymentDueReminders(),
      this.reminderScheduler.handleOverdueReminders(),
    ]);
    return { statusCode: 200, message: 'Reminders triggered' };
  }
}
