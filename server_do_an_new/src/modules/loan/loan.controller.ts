import { Controller, Get, Post, Param, Body, ParseIntPipe, UseGuards, HttpStatus, Req, UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LoanService } from './loan.service';
import { RatePreviewDto } from './dto/rate-preview.dto';
import { ApplyLoanDto } from './dto/apply-loan.dto';

@ApiTags('loan')
@ApiBearerAuth()
@Controller('loan')
@UseGuards(JwtAuthGuard)
export class LoanController {
    constructor(private readonly loanService: LoanService) { }

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
    @ApiOperation({ summary: 'Lấy lịch sử khoản vay theo user (MongoDB + Fineract)' })
    @ApiResponse({ status: 200, description: 'Danh sách khoản vay' })
    async getApplications(@Req() req: any) {
        const userId = req.user?._id ?? req.user?.sub ?? req.user?.userId ?? req.user?.id;
        if (!userId) {
            return { statusCode: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' };
        }
        const list = await this.loanService.getApplicationHistory(userId);
        return {
            statusCode: HttpStatus.OK,
            message: 'OK',
            data: { applications: list },
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
}
