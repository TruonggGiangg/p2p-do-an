import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Query,
    UseGuards,
    HttpStatus,
    HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BnplService } from './bnpl.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CreateBnplLoanDto } from './dto/create-bnpl-loan.dto';
import { PreviewBnplLoanDto } from './dto/preview-bnpl-loan.dto';

@ApiTags('bnpl')
@ApiBearerAuth()
@Controller('bnpl')
@UseGuards(JwtAuthGuard)
export class BnplController {
    constructor(private readonly bnplService: BnplService) { }

    // ==================== PUBLIC PREVIEW ENDPOINT ====================

    @Public()
    @Post('preview')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Xem trước lịch trả nợ BNPL (không cần đăng nhập)' })
    @ApiResponse({
        status: 200,
        description: 'Trả về lịch trả nợ chi tiết dựa trên Loan Product',
        schema: {
            example: {
                amount: 5000000,
                numberOfRepayments: 3,
                monthlyRate: 1.5,
                annualRate: 18,
                monthlyPayment: 1741667,
                totalRepayment: 5225000,
                totalInterest: 225000,
                interestType: 'Flat',
                schedulePreview: [
                    { period: 1, principal: 1666667, interest: 75000, total: 1741667, dueDate: '2026-02-19' },
                    { period: 2, principal: 1666667, interest: 75000, total: 1741667, dueDate: '2026-03-19' },
                    { period: 3, principal: 1666666, interest: 75000, total: 1741666, dueDate: '2026-04-19' },
                ],
            },
        },
    })
    async previewLoan(@Body() dto: PreviewBnplLoanDto) {
        const preview = await this.bnplService.previewLoan(
            dto.amount,
            dto.numberOfRepayments || 3,
        );

        return {
            statusCode: HttpStatus.OK,
            message: 'Thông tin preview khoản vay',
            data: preview,
        };
    }

    // ==================== WALLET ENDPOINTS ====================

    @Get('wallet')
    @ApiOperation({ summary: 'Lấy thông tin ví trả sau' })
    @ApiResponse({ status: 200, description: 'Trả về thông tin ví BNPL' })
    async getWallet(@CurrentUser() user: any) {
        const wallet = await this.bnplService.getWalletInfo(user._id);

        return {
            statusCode: HttpStatus.OK,
            data: wallet,
        };
    }

    @Get('wallet/balance')
    @ApiOperation({ summary: 'Lấy số dư ví trả sau' })
    @ApiResponse({ status: 200, description: 'Trả về số dư (âm khi có nợ)' })
    async getWalletBalance(@CurrentUser() user: any) {
        const wallet = await this.bnplService.getWalletInfo(user._id);

        return {
            statusCode: HttpStatus.OK,
            data: {
                balance: wallet.balance,
                creditLimit: wallet.creditLimit,
                usedCredit: wallet.usedCredit,
                availableCredit: wallet.availableCredit,
            },
        };
    }

    // ==================== LOAN ENDPOINTS ====================

    @Post('loans')
    @ApiOperation({ summary: 'Tạo khoản vay BNPL mới (auto-disburse)' })
    @ApiResponse({ status: 201, description: 'Khoản vay được tạo và giải ngân thành công' })
    @ApiResponse({ status: 400, description: 'Vượt quá hạn mức hoặc dữ liệu không hợp lệ' })
    async createLoan(
        @CurrentUser() user: any,
        @Body() dto: CreateBnplLoanDto,
    ) {
        const loan = await this.bnplService.createLoan(user._id, dto);

        return {
            statusCode: HttpStatus.CREATED,
            message: 'Tạo khoản vay thành công',
            data: loan,
        };
    }

    @Get('loans')
    @ApiOperation({ summary: 'Danh sách khoản vay BNPL' })
    @ApiQuery({ name: 'status', required: false, description: 'Lọc theo trạng thái' })
    @ApiResponse({ status: 200, description: 'Trả về danh sách khoản vay' })
    async getLoans(
        @CurrentUser() user: any,
        @Query('status') status?: string,
    ) {
        const loans = await this.bnplService.getLoans(user._id, status);

        return {
            statusCode: HttpStatus.OK,
            data: {
                loans,
                count: loans.length,
            },
        };
    }

    @Get('loans/:id')
    @ApiOperation({ summary: 'Chi tiết khoản vay với lịch trả nợ' })
    @ApiResponse({ status: 200, description: 'Trả về chi tiết khoản vay' })
    @ApiResponse({ status: 404, description: 'Không tìm thấy khoản vay' })
    async getLoanDetails(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {
        const loan = await this.bnplService.getLoanDetails(user._id, id);

        return {
            statusCode: HttpStatus.OK,
            data: loan,
        };
    }

    @Post('loans/:id/sync')
    @ApiOperation({ summary: 'Đồng bộ trạng thái khoản vay từ Fineract' })
    @ApiResponse({ status: 200, description: 'Đồng bộ thành công' })
    async syncLoanStatus(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {
        const loan = await this.bnplService.syncLoanStatus(user._id, id);

        return {
            statusCode: HttpStatus.OK,
            message: 'Đồng bộ trạng thái thành công',
            data: loan,
        };
    }

    // ==================== SCHEDULE ENDPOINTS ====================

    @Get('schedule')
    @ApiOperation({ summary: 'Lịch trả nợ tổng hợp (gộp từ nhiều khoản vay)' })
    @ApiResponse({ status: 200, description: 'Trả về lịch trả nợ theo tháng' })
    async getConsolidatedSchedule(@CurrentUser() user: any) {
        const schedule = await this.bnplService.getConsolidatedSchedule(user._id);

        const totalDue = schedule.reduce((sum, item) => sum + item.totalDue, 0);

        return {
            statusCode: HttpStatus.OK,
            data: {
                schedule,
                summary: {
                    totalMonths: schedule.length,
                    totalDue,
                },
            },
        };
    }
}
