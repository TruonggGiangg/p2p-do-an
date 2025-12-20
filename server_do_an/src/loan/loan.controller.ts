import {
    Controller,
    Post,
    Get,
    Body,
    Param,
    UseGuards,
    HttpCode,
    HttpStatus,
    ValidationPipe,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiParam,
} from '@nestjs/swagger';

import { LoanService } from './loan.service';
import { CreateLoanDto, CheckRateDto } from './dto';
import { BorrowerGuard, LenderGuard, BorrowerOrLenderGuard } from './guards';
import { DualAuthGuard } from '@auth/guard/dual-auth.guard';
import { Public, User } from '@decorator/customize';

/**
 * User interface from authentication
 */
interface AuthUser {
    _id: string;
    keycloakUserId: string;
    username: string;
    email?: string;
    name?: string;
    roles?: string[];
    fineractClientId?: number | string;
}

@ApiTags('Loan')
@Controller('loan')
export class LoanController {
    constructor(private readonly loanService: LoanService) { }

    // ==================== PUBLIC ENDPOINTS ====================

    /**
     * POST /loan/rate
     * Check/preview loan rate (public endpoint)
     */
    @Public()
    @Post('rate')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Kiểm tra lãi suất khoản vay (preview)' })
    @ApiResponse({
        status: 200,
        description: 'Thông tin lãi suất và số tiền trả',
        schema: {
            example: {
                rate: 5.5,
                annualRate: 66,
                monthlyPrincipalPay: 833333,
                monthlyInterestPay: 45833,
                monthlyPay: 879166,
                entirelyPay: 10549992,
                capital: 10000000,
                periodMonth: 12,
                disbursementDate: '2025-01-15',
                maturityDate: '2026-01-15',
            },
        },
    })
    async checkRate(@Body(ValidationPipe) dto: CheckRateDto) {
        const result = await this.loanService.checkRate(dto);
        return {
            statusCode: HttpStatus.OK,
            message: 'Thông tin lãi suất',
            data: result,
        };
    }

    /**
     * GET /loan/blockchain/status
     */
    @Public()
    @Get('blockchain/status')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Check blockchain connection status' })
    async getBlockchainStatus() {
        const result = await this.loanService.checkBlockchainStatus();
        return {
            statusCode: HttpStatus.OK,
            message: 'Blockchain status',
            data: result,
        };
    }

    // ==================== BORROWER ENDPOINTS ====================

    /**
     * POST /loan/create-auto
     * Create loan automatically (Borrower only)
     */
    @Post('create-auto')
    @UseGuards(DualAuthGuard, BorrowerGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Tạo khoản vay tự động (Borrower)' })
    @ApiResponse({
        status: 201,
        description: 'Tạo khoản vay thành công',
        schema: {
            example: {
                statusCode: 201,
                message: 'Tạo khoản vay thành công',
                data: {
                    contractId: 'LOAN_1703123456789',
                    info: {
                        capital: 10000000,
                        rate: 5.5,
                        periodMonth: 12,
                        willing: 'Mua sắm',
                        disbursementDate: '2025-01-15T00:00:00.000Z',
                        maturityDate: '2026-01-15T00:00:00.000Z',
                        monthlyPay: 879166,
                        entirelyPay: 10549992,
                    },
                    status: 'waiting',
                    totalNotes: 20,
                    fineractLoanId: 123,
                    blockchainSynced: true,
                },
            },
        },
    })
    @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
    @ApiResponse({ status: 403, description: 'Không có quyền Borrower' })
    @ApiResponse({ status: 409, description: 'Đã có khoản vay đang hoạt động' })
    async createLoanAuto(
        @Body(ValidationPipe) dto: CreateLoanDto,
        @User() user: AuthUser,
    ) {
        const result = await this.loanService.createLoanAuto(dto, user);
        return {
            statusCode: HttpStatus.CREATED,
            message: 'Tạo khoản vay thành công',
            data: result,
        };
    }

    /**
     * GET /loan/me
     * Get current borrower's loans
     */
    @Get('me')
    @UseGuards(DualAuthGuard, BorrowerGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Lấy danh sách khoản vay của tôi (Borrower)' })
    @ApiResponse({
        status: 200,
        description: 'Danh sách khoản vay',
    })
    async getMyLoans(@User() user: AuthUser) {
        // Use username as primary identifier to match DB storage
        const userId = user.username || user.keycloakUserId || user._id;
        const loans = await this.loanService.getMyLoans(userId);
        return {
            statusCode: HttpStatus.OK,
            message: 'Danh sách khoản vay của bạn',
            data: loans,
        };
    }


    /**
     * GET /loan/:id
     * Get loan details (Borrower sees own, Lender sees all waiting)
     */
    @Get(':id')
    @UseGuards(DualAuthGuard, BorrowerOrLenderGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Xem chi tiết khoản vay' })
    @ApiParam({ name: 'id', description: 'Contract ID hoặc MongoDB ID' })
    @ApiResponse({
        status: 200,
        description: 'Chi tiết khoản vay',
    })
    @ApiResponse({ status: 404, description: 'Không tìm thấy khoản vay' })
    async getLoanDetail(
        @Param('id') id: string,
        @User() user: AuthUser,
    ) {
        // Get user roles
        const isBorrower = user.roles?.some((r) =>
            ['borrower', 'Borrower', 'BORROWER'].includes(r),
        );

        // Borrower can only see own loans
        const userId = isBorrower ? user._id : undefined;

        const loan = await this.loanService.getLoanById(id, userId);
        return {
            statusCode: HttpStatus.OK,
            message: 'Chi tiết khoản vay',
            data: loan,
        };
    }

    /**
     * GET /loan/:id/statistics
     * Get loan statistics
     */
    @Get(':id/statistics')
    @UseGuards(DualAuthGuard, BorrowerOrLenderGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Thống kê khoản vay' })
    @ApiParam({ name: 'id', description: 'Contract ID hoặc MongoDB ID' })
    async getLoanStatistics(@Param('id') id: string) {
        const stats = await this.loanService.getLoanStatistics(id);
        return {
            statusCode: HttpStatus.OK,
            message: 'Thống kê khoản vay',
            data: stats,
        };
    }

    // ==================== LENDER ENDPOINTS ====================

    /**
     * GET /loan/current
     * Get waiting loans for investment (Lender only)
     */
    @Get('current/waiting')
    @UseGuards(DualAuthGuard, LenderGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Lấy danh sách khoản vay đang chờ đầu tư (Lender)' })
    @ApiResponse({
        status: 200,
        description: 'Danh sách khoản vay đang chờ',
    })
    async getWaitingLoans() {
        const loans = await this.loanService.getWaitingLoans();
        return {
            statusCode: HttpStatus.OK,
            message: 'Danh sách khoản vay đang chờ đầu tư',
            data: loans,
        };
    }

    // ==================== FINERACT DETAIL ENDPOINTS ====================

    /**
     * GET /loan/purposes
     * Get loan purpose options from Fineract
     */
    @Public()
    @Get('purposes')
    @ApiOperation({ summary: 'Lấy danh sách mục đích vay từ Fineract' })
    async getLoanPurposes() {
        const purposes = await this.loanService.getLoanPurposes();
        return {
            statusCode: HttpStatus.OK,
            message: 'Danh sách mục đích vay',
            data: { purposes },
        };
    }

    /**
     * GET /loan/:id/fineract-details
     * Get full loan details from Fineract (including schedule and transactions)
     */
    @Get(':id/fineract-details')
    @UseGuards(DualAuthGuard, BorrowerOrLenderGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Chi tiết khoản vay từ Fineract (bao gồm lịch trả và giao dịch)' })
    @ApiParam({ name: 'id', description: 'Fineract Loan ID hoặc Contract ID' })
    async getFineractDetails(@Param('id') id: string) {
        const details = await this.loanService.getFineractLoanDetails(id);
        return {
            statusCode: HttpStatus.OK,
            message: 'Chi tiết khoản vay từ Fineract',
            data: details,
        };
    }

    /**
     * GET /loan/:id/repayment-schedule
     * Get repayment schedule for a loan
     */
    @Get(':id/repayment-schedule')
    @UseGuards(DualAuthGuard, BorrowerOrLenderGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Lịch trả tiền của khoản vay' })
    @ApiParam({ name: 'id', description: 'Fineract Loan ID' })
    async getRepaymentSchedule(@Param('id') id: string) {
        const schedule = await this.loanService.getRepaymentSchedule(id);
        return {
            statusCode: HttpStatus.OK,
            message: 'Lịch trả tiền',
            data: schedule,
        };
    }

    /**
     * GET /loan/:id/transactions
     * Get transaction history for a loan
     */
    @Get(':id/transactions')
    @UseGuards(DualAuthGuard, BorrowerOrLenderGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Lịch sử giao dịch của khoản vay' })
    @ApiParam({ name: 'id', description: 'Fineract Loan ID' })
    async getTransactions(@Param('id') id: string) {
        const transactions = await this.loanService.getTransactions(id);
        return {
            statusCode: HttpStatus.OK,
            message: 'Lịch sử giao dịch',
            data: transactions,
        };
    }

    /**
     * GET /loan/:id/outstanding
     * Get outstanding balance for a loan
     */
    @Get(':id/outstanding')
    @UseGuards(DualAuthGuard, BorrowerOrLenderGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Số dư nợ còn lại' })
    @ApiParam({ name: 'id', description: 'Fineract Loan ID' })
    async getOutstandingBalance(@Param('id') id: string) {
        const balance = await this.loanService.getOutstandingBalance(id);
        return {
            statusCode: HttpStatus.OK,
            message: 'Số dư nợ còn lại',
            data: balance,
        };
    }

    /**
     * GET /loan/:id/prepay-amount
     * Get prepayment amount for early loan closure
     */
    @Get(':id/prepay-amount')
    @UseGuards(DualAuthGuard, BorrowerGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Số tiền cần trả để tất toán sớm' })
    @ApiParam({ name: 'id', description: 'Fineract Loan ID' })
    async getPrepayAmount(@Param('id') id: string) {
        const prepayInfo = await this.loanService.getPrepayAmount(id);
        return {
            statusCode: HttpStatus.OK,
            message: 'Thông tin tất toán sớm',
            data: prepayInfo,
        };
    }

    // ==================== REPAYMENT ENDPOINTS ====================

    /**
     * POST /loan/repay
     * Make a repayment on a loan (Borrower only)
     */
    @Post('repay')
    @UseGuards(DualAuthGuard, BorrowerGuard)
    @ApiBearerAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Trả nợ thường' })
    async makeRepayment(
        @Body() body: { fineractLoanId: number; transactionAmount: number; transactionDate?: string; note?: string },
        @User() user: AuthUser,
    ) {
        const result = await this.loanService.makeRepayment(
            body.fineractLoanId,
            body.transactionAmount,
            body.transactionDate,
            body.note,
        );
        return {
            statusCode: HttpStatus.OK,
            message: 'Trả nợ thành công',
            data: result,
        };
    }

    /**
     * POST /loan/prepay
     * Early repayment / prepay loan (Borrower only)
     */
    @Post('prepay')
    @UseGuards(DualAuthGuard, BorrowerGuard)
    @ApiBearerAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Tất toán sớm' })
    async prepayLoan(
        @Body() body: { fineractLoanId: number; transactionAmount?: number; transactionDate?: string; note?: string },
        @User() user: AuthUser,
    ) {
        const result = await this.loanService.prepayLoan(
            body.fineractLoanId,
            body.transactionAmount,
            body.transactionDate,
            body.note,
        );
        return {
            statusCode: HttpStatus.OK,
            message: 'Tất toán sớm thành công',
            data: result,
        };
    }
}

