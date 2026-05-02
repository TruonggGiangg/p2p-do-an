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
import { ReminderScheduler } from '../reminder.scheduler';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard, PoliciesGuard)
export class AdminLoanController {
  constructor(
    private readonly adminService: AdminService,
    private readonly reminderScheduler: ReminderScheduler,
  ) {}

  @Get('fix-is-full-match')
  @Public()
  @ApiOperation({ summary: 'Fix bad MongoDB data where isFullMatch was incorrectly set to true based on nodeMatch' })
  async fixIsFullMatch() {
    return this.adminService['loanService'].fixIsFullMatch();
  }

  @Get('loans/stats')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Thống kê khoản vay theo trạng thái' })
  @ApiResponse({ status: 200 })
  async getLoansStats() {
    const stats = await this.adminService.getLoansStats();
    return stats ;
  }

  @Get('dashboard/overview')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Dashboard admin: KPI + biểu đồ giải ngân + phân bổ sản phẩm + hoạt động gần đây' })
  @ApiResponse({ status: 200 })
  async getDashboardOverview() {
    return this.adminService.getDashboardOverview();
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
    return result ;
  }

  @Get('loans/pending')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Danh sách khoản vay chờ phê duyệt (sản phẩm P*)' })
  @ApiResponse({ status: 200 })
  async getPendingLoans() {
    const loans = await this.adminService.getAllPendingLoans();
    return { loans  };
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
    return result ;
  }

  @Get('loan-sync-runs')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Lấy lịch sử chạy đồng bộ khoản vay (truy vết từng thay đổi)' })
  @ApiResponse({ status: 200 })
  async getLoanSyncRuns(@Query('limit') limit?: string) {
    const limitNum = limit != null ? Math.min(parseInt(limit, 10) || 30, 100) : 30;
    const runs = await this.adminService.getLoanSyncRuns(limitNum);
    return runs ;
  }

  @Post('loans/:fineractLoanId/approve')
  @CheckPolicies(ability => ability.can(Action.Approve, 'Loan'))
  @ApiOperation({ summary: 'Phê duyệt khoản vay' })
  @ApiResponse({ status: 200 })
  async approveLoan(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const result = await this.adminService.approveLoan(fineractLoanId);
    return result ;
  }

  @Post('loans/:fineractLoanId/disburse')
  @CheckPolicies(ability => ability.can(Action.Disburse, 'Loan'))
  @ApiOperation({ summary: 'Giải ngân khoản vay' })
  @ApiResponse({ status: 200 })
  async disburseLoan(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const result = await this.adminService.disburseLoan(fineractLoanId);
    return result ;
  }

  @Post('loans/:fineractLoanId/reject')
  @CheckPolicies(ability => ability.can(Action.Reject, 'Loan'))
  @ApiOperation({ summary: 'Từ chối khoản vay' })
  @ApiResponse({ status: 200 })
  async rejectLoan(
    @Param('fineractLoanId', ParseIntPipe) fineractLoanId: number,
    @Body('note') note?: string,
  ) {
    const result = await this.adminService.rejectLoan(fineractLoanId, note);
    return result;
  }

  @Post('loans/:fineractLoanId/undo-approval')
  @CheckPolicies(ability => ability.can(Action.Approve, 'Loan'))
  @ApiOperation({ summary: 'Hoàn tác duyệt khoản vay' })
  @ApiResponse({ status: 200 })
  async undoApproval(
    @Param('fineractLoanId', ParseIntPipe) fineractLoanId: number,
    @Body('note') note?: string,
  ) {
    const result = await this.adminService.undoApproval(fineractLoanId, note);
    return result;
  }

  @Get('loans/:fineractLoanId/contract-status')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Kiểm tra trạng thái hợp đồng (đã ký chưa)' })
  @ApiResponse({ status: 200 })
  async getContractStatus(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const result = await this.adminService.getContractStatus(fineractLoanId);
    return result ;
  }

  @Get('loans/:fineractLoanId/details')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Chi tiết khoản vay từ Fineract (bao gồm lịch trả nợ)' })
  @ApiResponse({ status: 200 })
  async getLoanDetails(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number, @Query('sync') sync?: string) {
    const details = await this.adminService.getLoanDetails(fineractLoanId, sync === 'true');
    return details ;
  }

  @Post('loans/:fineractLoanId/sync')
  @CheckPolicies(ability => ability.can(Action.Update, 'Loan'))
  @ApiOperation({ summary: 'Đồng bộ dữ liệu khoản vay từ Fineract' })
  @ApiResponse({ status: 200 })
  async syncLoan(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const result = await this.adminService.syncLoanFromFineract(fineractLoanId);
    return result ;
  }

  @Post('loans/:fineractLoanId/trigger-score')
  @CheckPolicies(ability => ability.can(Action.Approve, 'Loan'))
  @ApiOperation({ summary: 'Trigger tính điểm AI Score cho khoản vay' })
  @ApiResponse({ status: 200 })
  async triggerAIScore(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const result = await this.adminService.triggerAIScoreForLoan(fineractLoanId);
    return result;
  }

  @Get('loans/:fineractLoanId/documents')
  @CheckPolicies(ability => ability.can(Action.Read, 'LoanDocument'))
  @ApiOperation({ summary: 'Danh sách tài liệu của khoản vay' })
  @ApiResponse({ status: 200 })
  async getLoanDocuments(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const list = await this.adminService.getLoanDocuments(fineractLoanId);
    return list ;
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
    return result ;
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
    return result ;
  }

  @Patch('loans/:fineractLoanId/documents/:documentId/classify')
  @CheckPolicies(ability => ability.can(Action.Update, 'LoanDocument'))
  @ApiOperation({ summary: 'Phân loại lại tài liệu (gán document type)' })
  @ApiResponse({ status: 200 })
  async classifyDocument(
    @Param('fineractLoanId', ParseIntPipe) fineractLoanId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body('documentTypeId') documentTypeId: string,
  ) {
    const result = await this.adminService.classifyDocument(fineractLoanId, documentId, documentTypeId);
    return result ;
  }

  @Get('loans/:fineractLoanId/can-approve')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Kiểm tra đã duyệt đủ tài liệu bắt buộc chưa' })
  @ApiResponse({ status: 200 })
  async canApproveLoan(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const result = await this.adminService.canApproveLoan(fineractLoanId);
    return result ;
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

  @Get('loan-support-requests')
  @CheckPolicies(ability => ability.can(Action.Read, 'LoanApplication'))
  @ApiOperation({ summary: 'Lấy danh sách yêu cầu hỗ trợ nợ (Waive/Reschedule)' })
  @ApiResponse({ status: 200 })
  async getSupportRequests(@Query() query: any) {
    const result = await this.adminService.getSupportRequests(query);
    return result ;
  }

  @Post('loan-support-requests/:id/approve-waive')
  @CheckPolicies(ability => ability.can(Action.Update, 'LoanApplication'))
  @ApiOperation({ summary: 'Phê duyệt yêu cầu miễn giảm phí phạt' })
  @ApiResponse({ status: 200 })
  async approveWaivePenalty(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    if (!adminId) throw new UnauthorizedException('Unauthorized');
    return this.adminService.approveWaivePenalty(id, adminId);
  }

  @Post('loan-support-requests/:id/approve-reschedule')
  @CheckPolicies(ability => ability.can(Action.Update, 'LoanApplication'))
  @ApiOperation({ summary: 'Phê duyệt yêu cầu cơ cấu lại nợ' })
  @ApiResponse({ status: 200 })
  async approveReschedule(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body('note') note?: string) {
    if (!adminId) throw new UnauthorizedException('Unauthorized');
    return this.adminService.approveReschedule(id, adminId, note);
  }

  @Post('loan-support-requests/:id/approve-write-off')
  @CheckPolicies(ability => ability.can(Action.Update, 'LoanApplication'))
  @ApiOperation({ summary: 'Phê duyệt yêu cầu xóa nợ (write-off)' })
  @ApiResponse({ status: 200 })
  async approveWriteOff(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body('note') note?: string) {
    if (!adminId) throw new UnauthorizedException('Unauthorized');
    return this.adminService.approveWriteOff(id, adminId, note);
  }

  @Post('loan-support-requests/:id/approve-waive-interest')
  @CheckPolicies(ability => ability.can(Action.Update, 'LoanApplication'))
  @ApiOperation({ summary: 'Phê duyệt yêu cầu xóa lãi' })
  @ApiResponse({ status: 200 })
  async approveWaiveInterest(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body('note') note?: string) {
    if (!adminId) throw new UnauthorizedException('Unauthorized');
    return this.adminService.approveWaiveInterest(id, adminId, note);
  }

  @Post('test-reminders')
  @CheckPolicies(ability => ability.can(Action.Manage, 'Loan'))
  @ApiOperation({ summary: 'Trigger reminder cron jobs manually for testing' })
  async triggerReminders() {
    await Promise.all([
      this.reminderScheduler.handleRepaymentDueReminders(),
      this.reminderScheduler.handleOverdueReminders(),
    ]);
    return { message: 'Reminders triggered' };
  }
}
