import { LoanSupportRequest, SupportRequestType } from './schemas/loan-support-request.schema';
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Query,
  UseInterceptors,
  UploadedFile,
  Res,
  ParseIntPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LoanService } from './loan.service';
import { RepaymentService } from './repayment.service';
import { ContractService } from './contract.service';
import { RatePreviewDto } from './dto/rate-preview.dto';
import { ApplyLoanDto } from './dto/apply-loan.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('loan')
@ApiBearerAuth()
@Controller('loan')
@UseGuards(JwtAuthGuard)
export class LoanController {
  constructor(
    private readonly loanService: LoanService,
    private readonly repaymentService: RepaymentService,
    private readonly contractService: ContractService,
  ) {}

  // =============================================
  // LOAN CREATION & INFO
  // =============================================

  @Get('purposes')
  @ApiOperation({ summary: 'Lấy danh sách mục đích vay từ Fineract CodeValues' })
  @ApiResponse({ status: 200, description: 'Danh sách mục đích vay' })
  async getLoanPurposes() {
    const purposes = await this.loanService.getLoanPurposes();
    return { purposes };
  }

  @Get('products')
  @ApiOperation({ summary: 'Lấy danh sách sản phẩm vay từ Fineract' })
  @ApiResponse({ status: 200, description: 'Trả về danh sách sản phẩm vay' })
  async getLoanProducts() {
    const products = await this.loanService.getLoanProducts();
    return {
      products,
      count: products.length,
    };
  }

  @Get('products/:productId/config')
  @ApiOperation({ summary: 'Lấy cấu hình sản phẩm vay (lãi suất mặc định, bội số làm tròn, loại lãi)' })
  @ApiResponse({ status: 200, description: 'Cấu hình sản phẩm' })
  async getProductConfig(@Param('productId', ParseIntPipe) productId: number) {
    return this.loanService.getProductConfig(productId);
  }

  @Get('products/:productId/document-types')
  @ApiOperation({ summary: 'Lấy danh sách loại tài liệu cần nộp theo sản phẩm vay' })
  @ApiResponse({ status: 200, description: 'Danh sách loại tài liệu' })
  async getProductDocumentTypes(@Param('productId', ParseIntPipe) productId: number) {
    const documentTypes = await this.loanService.getDocumentTypesByProduct(productId);
    return { documentTypes };
  }

  @Get('products/:productId/charges')
  @ApiOperation({ summary: 'Lấy danh sách phí của sản phẩm vay từ Fineract' })
  @ApiResponse({ status: 200, description: 'Danh sách phí sản phẩm' })
  async getProductCharges(@Param('productId', ParseIntPipe) productId: number) {
    const charges = await this.loanService.getProductCharges(productId);
    return { charges };
  }

  @Get('delinquency-policies')
  @ApiOperation({ summary: 'Lấy chính sách xử lý nợ xấu để hiển thị trong xác nhận đơn vay' })
  @ApiResponse({ status: 200, description: 'Danh sách chính sách nợ xấu' })
  @ApiQuery({ name: 'loan_product_id', required: false, type: Number })
  async getDelinquencyPolicySummary(@Query('loan_product_id') loanProductId?: string) {
    const productId = loanProductId != null ? Number(loanProductId) : undefined;
    const policies = await this.loanService.getDelinquencyPolicySummary(
      Number.isFinite(productId) ? productId : undefined,
    );
    return { policies };
  }

  @Post('rate-preview')
  @ApiOperation({ summary: 'Tính lịch trả nợ dự kiến (lãi phẳng / dư nợ giảm dần, làm tròn theo bội số)' })
  @ApiResponse({ status: 200, description: 'Lịch trả nợ dự kiến' })
  async ratePreview(@Body() dto: RatePreviewDto) {
    return this.loanService.ratePreview(dto);
  }

  @Get('applications')
  @ApiOperation({ summary: 'Lấy lịch sử khoản vay theo user - hỗ trợ pagination, filter, sort' })
  @ApiResponse({ status: 200, description: 'Danh sách khoản vay phân trang' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async getApplications(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.loanService.getApplicationHistoryPaginated(userId, {
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 10,
      status: status || undefined,
      sortBy: sortBy || 'createdAt',
      sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
    });
  }

  @Post('apply')
  @ApiOperation({ summary: 'Tạo đơn vay (MongoDB + Fineract create→approve→disburse)' })
  @ApiResponse({ status: 201, description: 'Đơn vay đã tạo' })
  async apply(@CurrentUser('id') userId: string, @Body() dto: ApplyLoanDto) {
    const result = await this.loanService.createApplication(userId, {
      capital: dto.capital,
      periodMonth: dto.periodMonth,
      productId: dto.productId,
      monthlyRatePercent: dto.monthlyRatePercent,
      willing: dto.willing,
      disbursementDate: dto.disbursementDate,
      disbursementWalletId: dto.disbursementWalletId,
      documents: dto.documents,
      otpSessionId: dto.otpSessionId,
    });
    return result;
  }

  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload tài liệu cho khoản vay' })
  async uploadDocument(
    @CurrentUser('id') userId: string,
    @Param('id') loanId: string,
    @UploadedFile() file: any,
    @Body('documentTypeId') documentTypeId: string,
  ) {
    const result = await this.loanService.uploadDocument(userId, loanId, file, documentTypeId);
    return result;
  }

  @Get(':id/documents/:docId')
  @ApiOperation({ summary: 'Lấy stream tài liệu từ Fineract' })
  async getDocumentStream(
    @CurrentUser('id') userId: string,
    @Param('id') loanId: string,
    @Param('docId') docId: string,
    @Res() res: Response,
  ) {
    const response = await this.loanService.getFileStream(userId, loanId, docId);

    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Content-Disposition', response.headers['content-disposition'] || 'inline');
    res.send(response.data);
  }

  @Post(':loanId/withdraw')
  @ApiOperation({ summary: 'Hủy đơn vay đang chờ duyệt' })
  @ApiResponse({ status: 200, description: 'Hủy đơn vay thành công' })
  async withdrawLoan(
    @CurrentUser('id') userId: string,
    @Param('loanId') loanId: string,
    @Body('reason') reason?: string,
  ) {
    const result = await this.loanService.withdrawLoan(userId, loanId, reason);
    return result;
  }

  // =============================================
  // REPAYMENT & PREPAYMENT
  // =============================================

  @Post('repay')
  @ApiOperation({ summary: 'Thanh toán nợ theo kỳ' })
  @ApiResponse({ status: 200, description: 'Thanh toán thành công' })
  async repay(
    @CurrentUser('id') userId: string,
    @Body() body: { loanId: string; amount: number; repaymentDate?: string },
  ) {
    const result = await this.repaymentService.makeRepayment(userId, body.loanId, body.amount, body.repaymentDate);
    return result;
  }

  @Post('prepay')
  @ApiOperation({ summary: 'Tất toán sớm (trả hết dư nợ)' })
  @ApiResponse({ status: 200, description: 'Tất toán thành công' })
  async prepay(@CurrentUser('id') userId: string, @Body() body: { loanId: string; repaymentDate?: string }) {
    const result = await this.repaymentService.prepayLoan(userId, body.loanId, body.repaymentDate);
    return result;
  }

  @Get(':loanId/prepay-amount')
  @ApiOperation({ summary: 'Lấy số tiền cần trả để tất toán sớm' })
  @ApiResponse({ status: 200, description: 'Thông tin tất toán' })
  async getPrepayAmount(@CurrentUser('id') userId: string, @Param('loanId') loanId: string) {
    return this.repaymentService.getPrepayAmount(userId, loanId);
  }

  @Get(':loanId/outstanding')
  @ApiOperation({ summary: 'Lấy dư nợ còn lại' })
  @ApiResponse({ status: 200, description: 'Thông tin dư nợ' })
  async getOutstanding(@CurrentUser('id') userId: string, @Param('loanId') loanId: string) {
    return this.repaymentService.getOutstandingBalance(userId, loanId);
  }

  @Get(':loanId/schedule')
  @ApiOperation({ summary: 'Lấy lịch trả nợ từ Fineract' })
  @ApiResponse({ status: 200, description: 'Lịch trả nợ' })
  async getSchedule(@CurrentUser('id') userId: string, @Param('loanId') loanId: string) {
    return this.repaymentService.getRepaymentSchedule(userId, loanId);
  }

  @Get(':loanId/transactions')
  @ApiOperation({ summary: 'Lấy lịch sử giao dịch từ Fineract' })
  @ApiResponse({ status: 200, description: 'Danh sách giao dịch' })
  async getTransactions(@CurrentUser('id') userId: string, @Param('loanId') loanId: string) {
    return this.repaymentService.getLoanTransactions(userId, loanId);
  }

  @Post(':loanId/support-request')
  @ApiOperation({ summary: 'Gửi yêu cầu hỗ trợ (Xóa phạt / Cơ cấu nợ) cho khoản vay quá hạn' })
  @ApiResponse({ status: 201, description: 'Yêu cầu được gửi thành công' })
  async submitSupportRequest(
    @CurrentUser('id') userId: string,
    @Param('loanId') loanId: string,
    @Body()
    body: {
      requestType: SupportRequestType;
      reason: string;
      proposedRescheduleDate?: string;
      proposedExtraPeriods?: number;
    },
  ) {
    const result = await this.loanService.submitSupportRequest(userId, loanId, body);
    return result;
  }

  // =============================================
  // CONTRACTS
  // =============================================

  @Get('contracts')
  @ApiOperation({ summary: 'Lấy danh sách hợp đồng vay của user' })
  @ApiResponse({ status: 200, description: 'Danh sách hợp đồng' })
  async getContracts(@CurrentUser('id') userId: string) {
    const contracts = await this.contractService.getUserContracts(userId);
    return { contracts };
  }

  // ⚠️ PHẢI đặt `by-loan/:loanId` TRƯỚC `/:contractId` để NestJS
  //    không nhầm "by-loan" thành contractId param
  @Get('contracts/by-loan/:loanId')
  @ApiOperation({ summary: 'Lấy hợp đồng theo loanId (MongoDB ObjectId)' })
  @ApiResponse({ status: 200, description: 'Hợp đồng' })
  async getContractByLoan(@CurrentUser('id') userId: string, @Param('loanId') loanId: string) {
    return this.contractService.getContractByLoanId(loanId, userId);
  }

  @Get('contracts/:contractId')
  @ApiOperation({ summary: 'Chi tiết hợp đồng vay' })
  @ApiResponse({ status: 200, description: 'Chi tiết hợp đồng' })
  async getContractDetail(@CurrentUser('id') userId: string, @Param('contractId') contractId: string) {
    return this.contractService.getContractById(contractId, userId);
  }

  @Get('contracts/:contractId/html')
  @ApiOperation({ summary: 'Lấy nội dung HTML hợp đồng vay (dùng render PDF trên client)' })
  @ApiResponse({ status: 200, description: 'HTML hợp đồng' })
  async getContractHTML(@CurrentUser('id') userId: string, @Param('contractId') contractId: string) {
    const html = await this.contractService.getContractHTML(contractId, userId);
    return { html };
  }

  @Post('contracts/:contractId/sign')
  @ApiOperation({ summary: 'Ký xác nhận hợp đồng vay' })
  @ApiResponse({ status: 200, description: 'Hợp đồng đã ký' })
  async signContract(
    @CurrentUser('id') userId: string,
    @Param('contractId') contractId: string,
    @Body() body: { signatureData?: string },
  ) {
    const result = await this.contractService.signContract(contractId, userId, body.signatureData);
    return result;
  }

  // =============================================
  // NOTIFICATIONS
  // =============================================

  @Get('notifications')
  @ApiOperation({ summary: 'Lấy danh sách thông báo' })
  @ApiResponse({ status: 200 })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async getNotifications(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.contractService.getUserNotifications(
      userId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Post('notifications/:id/read')
  @ApiOperation({ summary: 'Đánh dấu thông báo đã đọc' })
  @ApiResponse({ status: 200 })
  async markNotificationRead(@CurrentUser('id') userId: string, @Param('id') notificationId: string) {
    await this.contractService.markNotificationRead(notificationId, userId);
    return null;
  }

  @Post('notifications/read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo đã đọc' })
  @ApiResponse({ status: 200 })
  async markAllNotificationsRead(@CurrentUser('id') userId: string) {
    await this.contractService.markAllNotificationsRead(userId);
    return null;
  }
}
