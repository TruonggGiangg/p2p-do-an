import {
    Controller, Get, Post, Param, Body, UseGuards, Query,
    HttpStatus, Req, UseInterceptors, UploadedFile, Res, ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LoanService } from './loan.service';
import { RepaymentService } from './repayment.service';
import { RatePreviewDto } from './dto/rate-preview.dto';
import { ApplyLoanDto } from './dto/apply-loan.dto';

@ApiTags('loan')
@ApiBearerAuth()
@Controller('loan')
@UseGuards(JwtAuthGuard)
export class LoanController {
    constructor(
        private readonly loanService: LoanService,
        private readonly repaymentService: RepaymentService,
    ) { }

    // =============================================
    // LOAN CREATION & INFO
    // =============================================

    @Get('purposes')
    @ApiOperation({ summary: 'Lấy danh sách mục đích vay từ Fineract CodeValues' })
    @ApiResponse({ status: 200, description: 'Danh sách mục đích vay' })
    async getLoanPurposes() {
        const purposes = await this.loanService.getLoanPurposes();
        return {
            statusCode: HttpStatus.OK,
            message: 'OK',
            data: { purposes },
        };
    }

    @Get('products')
    @ApiOperation({ summary: 'Lấy danh sách sản phẩm vay từ Fineract' })
    @ApiResponse({ status: 200, description: 'Trả về danh sách sản phẩm vay' })
    async getLoanProducts() {
        const products = await this.loanService.getLoanProducts();

        return {
            statusCode: HttpStatus.OK,
            message: 'Danh sách sản phẩm vay',
            data: {
                products,
                count: products.length,
            },
        };
    }

    @Get('products/:productId/config')
    @ApiOperation({ summary: 'Lấy cấu hình sản phẩm vay (lãi suất mặc định, bội số làm tròn, loại lãi)' })
    @ApiResponse({ status: 200, description: 'Cấu hình sản phẩm' })
    async getProductConfig(@Param('productId', ParseIntPipe) productId: number) {
        const config = await this.loanService.getProductConfig(productId);
        return {
            statusCode: HttpStatus.OK,
            message: 'OK',
            data: config,
        };
    }

    @Get('products/:productId/document-types')
    @ApiOperation({ summary: 'Lấy danh sách loại tài liệu cần nộp theo sản phẩm vay' })
    @ApiResponse({ status: 200, description: 'Danh sách loại tài liệu' })
    async getProductDocumentTypes(@Param('productId', ParseIntPipe) productId: number) {
        const documentTypes = await this.loanService.getDocumentTypesByProduct(productId);
        return {
            statusCode: HttpStatus.OK,
            message: 'OK',
            data: { documentTypes },
        };
    }

    @Get('products/:productId/charges')
    @ApiOperation({ summary: 'Lấy danh sách phí của sản phẩm vay từ Fineract' })
    @ApiResponse({ status: 200, description: 'Danh sách phí sản phẩm' })
    async getProductCharges(@Param('productId', ParseIntPipe) productId: number) {
        const charges = await this.loanService.getProductCharges(productId);
        return {
            statusCode: HttpStatus.OK,
            message: 'OK',
            data: { charges },
        };
    }

    @Post('rate-preview')
    @ApiOperation({ summary: 'Tính lịch trả nợ dự kiến (lãi phẳng / dư nợ giảm dần, làm tròn theo bội số)' })
    @ApiResponse({ status: 200, description: 'Lịch trả nợ dự kiến' })
    async ratePreview(@Body() dto: RatePreviewDto) {
        const result = await this.loanService.ratePreview(dto);
        return {
            statusCode: HttpStatus.OK,
            message: 'OK',
            data: result,
        };
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
        @Req() req: any,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
        @Query('status') status?: string,
        @Query('sortBy') sortBy?: string,
        @Query('sortOrder') sortOrder?: string,
    ) {
        const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
        if (!userId) {
            return { statusCode: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' };
        }
        const result = await this.loanService.getApplicationHistoryPaginated(userId, {
            page: page ? parseInt(page, 10) : 1,
            pageSize: pageSize ? parseInt(pageSize, 10) : 10,
            status: status || undefined,
            sortBy: sortBy || 'createdAt',
            sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
        });
        return {
            statusCode: HttpStatus.OK,
            message: 'OK',
            data: result,
        };
    }

    @Post('apply')
    @ApiOperation({ summary: 'Tạo đơn vay (MongoDB + Fineract create→approve→disburse)' })
    @ApiResponse({ status: 201, description: 'Đơn vay đã tạo' })
    async apply(@Req() req: any, @Body() dto: ApplyLoanDto) {
        const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
        if (!userId) {
            return { statusCode: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' };
        }
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
        return {
            statusCode: HttpStatus.CREATED,
            message: 'Đơn vay đã tạo thành công',
            data: result,
        };
    }

    @Post(':id/documents')
    @UseInterceptors(FileInterceptor('file'))
    @ApiOperation({ summary: 'Upload tài liệu cho khoản vay' })
    async uploadDocument(
        @Req() req: any,
        @Param('id') loanId: string,
        @UploadedFile() file: any,
        @Body('documentTypeId') documentTypeId: string,
    ) {
        const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
        const result = await this.loanService.uploadDocument(userId, loanId, file, documentTypeId);
        return {
            statusCode: HttpStatus.OK,
            message: 'Tải tài liệu lên thành công',
            data: result,
        };
    }

    @Get(':id/documents/:docId')
    @ApiOperation({ summary: 'Lấy stream tài liệu từ Fineract' })
    async getDocumentStream(
        @Req() req: any,
        @Param('id') loanId: string,
        @Param('docId') docId: string,
        @Res() res: Response,
    ) {
        const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
        const response = await this.loanService.getFileStream(userId, loanId, docId);

        res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
        res.setHeader('Content-Disposition', response.headers['content-disposition'] || 'inline');
        res.send(response.data);
    }

    // =============================================
    // REPAYMENT & PREPAYMENT
    // =============================================

    @Post('repay')
    @ApiOperation({ summary: 'Thanh toán nợ theo kỳ' })
    @ApiResponse({ status: 200, description: 'Thanh toán thành công' })
    async repay(@Req() req: any, @Body() body: { loanId: string; amount: number; repaymentDate?: string }) {
        const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
        if (!userId) {
            return { statusCode: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' };
        }
        const result = await this.repaymentService.makeRepayment(userId, body.loanId, body.amount, body.repaymentDate);
        return {
            statusCode: HttpStatus.OK,
            message: 'Thanh toán thành công',
            data: result,
        };
    }

    @Post('prepay')
    @ApiOperation({ summary: 'Tất toán sớm (trả hết dư nợ)' })
    @ApiResponse({ status: 200, description: 'Tất toán thành công' })
    async prepay(@Req() req: any, @Body() body: { loanId: string; repaymentDate?: string }) {
        const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
        if (!userId) {
            return { statusCode: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' };
        }
        const result = await this.repaymentService.prepayLoan(userId, body.loanId, body.repaymentDate);
        return {
            statusCode: HttpStatus.OK,
            message: 'Tất toán thành công',
            data: result,
        };
    }

    @Get(':loanId/prepay-amount')
    @ApiOperation({ summary: 'Lấy số tiền cần trả để tất toán sớm' })
    @ApiResponse({ status: 200, description: 'Thông tin tất toán' })
    async getPrepayAmount(@Req() req: any, @Param('loanId') loanId: string) {
        const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
        if (!userId) {
            return { statusCode: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' };
        }
        const result = await this.repaymentService.getPrepayAmount(userId, loanId);
        return {
            statusCode: HttpStatus.OK,
            message: 'OK',
            data: result,
        };
    }

    @Get(':loanId/outstanding')
    @ApiOperation({ summary: 'Lấy dư nợ còn lại' })
    @ApiResponse({ status: 200, description: 'Thông tin dư nợ' })
    async getOutstanding(@Req() req: any, @Param('loanId') loanId: string) {
        const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
        if (!userId) {
            return { statusCode: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' };
        }
        const result = await this.repaymentService.getOutstandingBalance(userId, loanId);
        return {
            statusCode: HttpStatus.OK,
            message: 'OK',
            data: result,
        };
    }

    @Get(':loanId/schedule')
    @ApiOperation({ summary: 'Lấy lịch trả nợ từ Fineract' })
    @ApiResponse({ status: 200, description: 'Lịch trả nợ' })
    async getSchedule(@Req() req: any, @Param('loanId') loanId: string) {
        const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
        if (!userId) {
            return { statusCode: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' };
        }
        const result = await this.repaymentService.getRepaymentSchedule(userId, loanId);
        return {
            statusCode: HttpStatus.OK,
            message: 'OK',
            data: result,
        };
    }
}
