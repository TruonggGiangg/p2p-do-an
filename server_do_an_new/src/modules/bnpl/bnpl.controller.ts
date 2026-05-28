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
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BnplService } from './bnpl.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CreateBnplLoanDto } from './dto/create-bnpl-loan.dto';
import { CreateBnplApplicationDto } from './dto/create-bnpl-application.dto';
import { PreviewBnplLoanDto } from './dto/preview-bnpl-loan.dto';

@ApiTags('bnpl')
@ApiBearerAuth()
@Controller('bnpl')
@UseGuards(JwtAuthGuard)
export class BnplController {
  constructor(private readonly bnplService: BnplService) {}

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
          {
            period: 1,
            principal: 1666667,
            interest: 75000,
            total: 1741667,
            dueDate: '2026-02-19',
          },
          {
            period: 2,
            principal: 1666667,
            interest: 75000,
            total: 1741667,
            dueDate: '2026-03-19',
          },
          {
            period: 3,
            principal: 1666666,
            interest: 75000,
            total: 1741666,
            dueDate: '2026-04-19',
          },
        ],
      },
    },
  })
  async previewLoan(@Body() dto: PreviewBnplLoanDto) {
    return this.bnplService.previewLoan(
      dto.amount,
      dto.numberOfRepayments, // Will use default from config if undefined
    );
  }

  // ==================== APPLICATION ENDPOINTS ====================

  @Post('applications')
  @ApiOperation({ summary: 'Dang ky ho so BNPL' })
  @ApiResponse({ status: 201, description: 'Ho so BNPL da duoc ghi nhan' })
  async submitApplication(@CurrentUser('id') userId: string, @Body() dto: CreateBnplApplicationDto) {
    if (!userId) {
      throw new UnauthorizedException('User ID not found');
    }
    return this.bnplService.submitApplication(userId, dto);
  }

  @Get('applications/current')
  @ApiOperation({ summary: 'Lay ho so BNPL hien tai cua user' })
  @ApiResponse({ status: 200, description: 'Tra ve ho so BNPL moi nhat cua user' })
  async getCurrentApplication(@CurrentUser('id') userId: string) {
    if (!userId) {
      throw new UnauthorizedException('User ID not found');
    }
    return {
      application: await this.bnplService.getCurrentApplication(userId),
    };
  }

  // ==================== WALLET ENDPOINTS ====================

  @Get('wallet')
  @ApiOperation({ summary: 'Lấy thông tin ví trả sau' })
  @ApiResponse({ status: 200, description: 'Trả về thông tin ví BNPL' })
  async getWallet(@CurrentUser('id') userId: string) {
    if (!userId) {
      throw new UnauthorizedException('User ID not found');
    }
    return this.bnplService.getWalletInfo(userId);
  }

  @Get('wallet/balance')
  @ApiOperation({ summary: 'Lấy số dư ví trả sau' })
  @ApiResponse({ status: 200, description: 'Trả về số dư (âm khi có nợ)' })
  async getWalletBalance(@CurrentUser('id') userId: string) {
    if (!userId) {
      throw new UnauthorizedException('User ID not found');
    }
    const wallet = await this.bnplService.getWalletInfo(userId);

    return {
      balance: wallet.balance,
      creditLimit: wallet.creditLimit,
      usedCredit: wallet.usedCredit,
      availableCredit: wallet.availableCredit,
    };
  }

  @Post('wallet/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xac nhan hop dong va kich hoat vi BNPL' })
  @ApiResponse({ status: 200, description: 'Vi BNPL da duoc kich hoat' })
  async activateWallet(
    @CurrentUser('id') userId: string,
    @Body() body: { signatureText?: string },
  ) {
    if (!userId) {
      throw new UnauthorizedException('User ID not found');
    }

    return this.bnplService.activateWallet(userId, body.signatureText);
  }

  // ==================== LOAN ENDPOINTS ====================

  @Post('loans')
  @ApiOperation({ summary: 'Tạo khoản vay BNPL mới (auto-disburse)' })
  @ApiResponse({
    status: 201,
    description: 'Khoản vay được tạo và giải ngân thành công',
  })
  @ApiResponse({
    status: 400,
    description: 'Vượt quá hạn mức hoặc dữ liệu không hợp lệ',
  })
  async createLoan(@CurrentUser('id') userId: string, @Body() dto: CreateBnplLoanDto) {
    if (!userId) {
      throw new UnauthorizedException('User ID not found');
    }
    return this.bnplService.createLoan(userId, dto);
  }

  @Get('loans')
  @ApiOperation({ summary: 'Danh sách khoản vay BNPL' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Lọc theo trạng thái',
  })
  @ApiResponse({ status: 200, description: 'Trả về danh sách khoản vay' })
  async getLoans(@CurrentUser('id') userId: string, @Query('status') status?: string) {
    if (!userId) {
      throw new UnauthorizedException('User ID not found');
    }
    const loans = await this.bnplService.getLoans(userId, status);

    return {
      loans,
      count: loans.length,
    };
  }

  @Get('loans/:id')
  @ApiOperation({ summary: 'Chi tiết khoản vay với lịch trả nợ' })
  @ApiResponse({ status: 200, description: 'Trả về chi tiết khoản vay' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy khoản vay' })
  async getLoanDetails(@CurrentUser('id') userId: string, @Param('id') id: string) {
    if (!userId) {
      throw new UnauthorizedException('User ID not found');
    }
    return this.bnplService.getLoanDetails(userId, id);
  }

  @Post('loans/:id/sync')
  @ApiOperation({ summary: 'Đồng bộ trạng thái khoản vay từ Fineract' })
  @ApiResponse({ status: 200, description: 'Đồng bộ thành công' })
  async syncLoanStatus(@CurrentUser('id') userId: string, @Param('id') id: string) {
    if (!userId) {
      throw new UnauthorizedException('User ID not found');
    }
    return this.bnplService.syncLoanStatus(userId, id);
  }

  // ==================== SCHEDULE ENDPOINTS ====================

  @Get('schedule')
  @ApiOperation({ summary: 'Lịch trả nợ tổng hợp (gộp từ nhiều khoản vay)' })
  @ApiResponse({ status: 200, description: 'Trả về lịch trả nợ theo tháng' })
  async getConsolidatedSchedule(@CurrentUser('id') userId: string) {
    if (!userId) {
      throw new UnauthorizedException('User ID not found');
    }
    const schedule = await this.bnplService.getConsolidatedSchedule(userId);
    const totalDue = schedule.reduce((sum, item) => sum + item.totalDue, 0);

    return {
      schedule,
      summary: {
        totalMonths: schedule.length,
        totalDue,
      },
    };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Lịch sử giao dịch BNPL' })
  @ApiQuery({ name: 'limit', required: false, description: 'Số giao dịch tối đa' })
  @ApiQuery({ name: 'offset', required: false, description: 'Bỏ qua bao nhiêu giao dịch đầu' })
  @ApiResponse({ status: 200, description: 'Trả về lịch sử giao dịch BNPL' })
  async getTransactions(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!userId) {
      throw new UnauthorizedException('User ID not found');
    }

    return this.bnplService.getTransactions(userId, Number(limit) || 20, Number(offset) || 0);
  }

  @Post('loans/:id/repay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Thanh toán một kỳ BNPL' })
  @ApiResponse({ status: 200, description: 'Thanh toán thành công' })
  async repayLoan(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: { amount: number; repaymentDate?: string; idempotencyKey?: string },
  ) {
    if (!userId) {
      throw new UnauthorizedException('User ID not found');
    }
    return this.bnplService.repayLoan(userId, id, body.amount, body.repaymentDate, body.idempotencyKey);
  }

  @Get('loans/:id/prepay-amount')
  @ApiOperation({ summary: 'Lấy số tiền tất toán sớm BNPL' })
  @ApiResponse({ status: 200, description: 'Trả về số tiền tất toán sớm' })
  async getPrepayAmount(@CurrentUser('id') userId: string, @Param('id') id: string) {
    if (!userId) {
      throw new UnauthorizedException('User ID not found');
    }
    return this.bnplService.getPrepayAmount(userId, id);
  }

  @Post('loans/:id/prepay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tất toán sớm BNPL' })
  @ApiResponse({ status: 200, description: 'Tất toán sớm thành công' })
  async prepayLoan(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: { repaymentDate?: string; idempotencyKey?: string },
  ) {
    if (!userId) {
      throw new UnauthorizedException('User ID not found');
    }
    return this.bnplService.prepayLoan(userId, id, body.repaymentDate, body.idempotencyKey);
  }
}
