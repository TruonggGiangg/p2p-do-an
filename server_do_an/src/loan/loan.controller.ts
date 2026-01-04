import {
    Controller,
    Post,
    Get,
    Body,
    Param,
    Query,
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
import { FineractService } from './services/fineract.service';
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
    constructor(
        private readonly loanService: LoanService,
        private readonly fineractService: FineractService,
    ) { }

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

    // ==================== WALLET ENDPOINTS ====================

    /**
     * GET /loan/wallet/balance
     * Get wallet balance for authenticated user
     * Pattern from legacy WalletController.getWalletBalance
     */
    @Get('wallet/balance')
    @UseGuards(DualAuthGuard, BorrowerOrLenderGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Lấy số dư ví của user' })
    @ApiResponse({
        status: 200,
        description: 'Số dư ví',
        schema: {
            example: {
                balance: 5000000,
                availableBalance: 5000000,
                accountId: 12,
                accountNo: 'SA0000012',
            },
        },
    })
    async getWalletBalance(@User() user: AuthUser) {
        const username = user.username;

        // Resolve Fineract client ID
        const clientId = await this.fineractService.resolveClientId(username, user.email);

        if (!clientId) {
            return {
                statusCode: HttpStatus.OK,
                message: 'Chưa liên kết Fineract',
                data: { balance: 0, availableBalance: 0 },
            };
        }

        const walletData = await this.fineractService.getWalletBalance(clientId);

        return {
            statusCode: HttpStatus.OK,
            message: 'Lấy số dư ví thành công',
            data: walletData,
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
     * Get current borrower's loans with pagination
     */
    @Get('me')
    @UseGuards(DualAuthGuard, BorrowerGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Lấy danh sách khoản vay của tôi (Borrower)' })
    @ApiResponse({
        status: 200,
        description: 'Danh sách khoản vay phân trang',
    })
    async getMyLoans(
        @User() user: AuthUser,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
        @Query('status') status?: string,
    ) {
        const result = await this.loanService.getMyLoans(user, Number(page), Number(limit), status);
        return {
            statusCode: HttpStatus.OK,
            message: 'Danh sách khoản vay của bạn',
            data: result,
        };
    }

    /**
     * GET /loan/debug/fineract-user
     * Test Fineract user lookup (Debug endpoint)
     */
    @Get('debug/fineract-user')
    @UseGuards(DualAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: '[DEBUG] Test Fineract user lookup' })
    async testFineractUser(@User() user: AuthUser) {
        const username = user.username;
        const keycloakUserId = user.keycloakUserId;
        const fineractClientIdFromToken = user.fineractClientId;

        // Try to resolve Fineract client
        let resolvedClient: any = null;
        let lookupMethod = 'none';

        // Try KEYCLOAK_{username} first
        resolvedClient = await this.fineractService.getClientByExternalId(`KEYCLOAK_${username}`);
        if (resolvedClient && resolvedClient.id) {
            lookupMethod = `KEYCLOAK_${username}`;
        } else {
            // Fallback to plain username
            resolvedClient = await this.fineractService.getClientByExternalId(username);
            if (resolvedClient && resolvedClient.id) {
                lookupMethod = username;
            }
        }

        return {
            statusCode: HttpStatus.OK,
            message: 'Fineract User Debug Info',
            data: {
                keycloak: {
                    username,
                    keycloakUserId,
                    fineractClientIdFromToken,
                    nameFromToken: user.name,
                },
                fineract: {
                    resolved: !!resolvedClient,
                    lookupMethod,
                    clientId: resolvedClient?.id || null,
                    clientName: resolvedClient ? `${resolvedClient.firstname || ''} ${resolvedClient.lastname || ''}`.trim() : null,
                    externalId: resolvedClient?.externalId || null,
                    mobileNo: resolvedClient?.mobileNo || null,
                    officeId: resolvedClient?.officeId || null,
                    status: resolvedClient?.status?.value || null,
                },
            },
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


    // ==================== DISBURSE ENDPOINT ====================
    // Note: Repayment endpoints moved to /repayment/* for proper distribution and logging

    /**
     * POST /loan/:id/disburse
     * Disburse loan (Admin or Lender usually, but here we allow Borrower for demo/auto flow if needed, 
     * or we can restrict to Admin. In reference it was Admin/Lender.)
     */
    @Post(':id/disburse')
    @UseGuards(DualAuthGuard, BorrowerOrLenderGuard)
    @ApiBearerAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Giải ngân khoản vay' })
    @ApiParam({ name: 'id', description: 'Contract ID hoặc MongoDB ID' })
    async disburseLoan(@Param('id') id: string) {
        const result = await this.loanService.disburseLoan(id);
        return {
            statusCode: HttpStatus.OK,
            message: 'Giải ngân thành công',
            data: result,
        };
    }

    // ==================== CREDIT SCORECARD ENDPOINTS ====================

    /**
     * GET /loan/:id/scorecard
     * Get credit scorecard history for a loan
     */
    @Get(':id/scorecard')
    @UseGuards(DualAuthGuard, BorrowerOrLenderGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Lấy lịch sử chấm điểm tín dụng' })
    @ApiParam({ name: 'id', description: 'Fineract Loan ID hoặc Contract ID' })
    async getScorecardHistory(@Param('id') id: string) {
        const fineractLoanId = await this.loanService.resolveFineractLoanIdPublic(id);
        if (!fineractLoanId) {
            return {
                statusCode: HttpStatus.OK,
                message: 'Chưa có lịch sử chấm điểm',
                data: { scorecards: [], count: 0 },
            };
        }

        const scorecards = await this.loanService.getScorecardHistory(fineractLoanId);
        return {
            statusCode: HttpStatus.OK,
            message: scorecards.length > 0 ? 'Lịch sử chấm điểm' : 'Chưa có lịch sử',
            data: {
                scorecards,
                count: scorecards.length,
                latest: scorecards.length > 0 ? scorecards[0] : null,
            },
        };
    }

    /**
     * POST /loan/:id/assess
     * Assess credit score using Digital Footprint
     */
    @Post(':id/assess')
    @UseGuards(DualAuthGuard, BorrowerGuard)
    @ApiBearerAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Chấm điểm tín dụng với Digital Footprint' })
    @ApiParam({ name: 'id', description: 'Fineract Loan ID hoặc Contract ID' })
    async assessCreditScore(
        @Param('id') id: string,
        @Body() body: {
            battery_level?: number;
            submission_hour?: number;
            connection_type?: 'wifi' | '4g' | 'unknown';
            location_match?: 'true' | 'false';
            device_score?: number;
        },
        @User() user: AuthUser,
    ) {
        const fineractLoanId = await this.loanService.resolveFineractLoanIdPublic(id);
        if (!fineractLoanId) {
            return {
                statusCode: HttpStatus.BAD_REQUEST,
                message: 'Không tìm thấy khoản vay trên Fineract',
                data: null,
            };
        }

        const result = await this.loanService.assessCreditScore(
            fineractLoanId,
            user._id,
            body,
        );

        return {
            statusCode: HttpStatus.OK,
            message: 'Đã chấm điểm tín dụng',
            data: result,
        };
    }
}

