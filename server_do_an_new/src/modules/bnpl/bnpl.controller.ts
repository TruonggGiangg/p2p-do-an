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
}
