import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { LoansService } from './services/loans.service';
import { CreateLoanAutoDto } from './dto/create-loan-auto.dto';
import { Roles } from '@auth/decorators/roles.decorator';
import { Role } from '@auth/roles/role.enum';
import { RolesGuard } from '@auth/guard/roles.guard';
import { ResponseMessage } from '@decorator/customize';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Loans')
@ApiBearerAuth()
@Controller('loans')
@UseGuards(RolesGuard)
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post('create-auto')
  @Roles(Role.BORROWER)
  @ResponseMessage('Tạo khoản vay thành công')
  @ApiOperation({
    summary: 'Tạo khoản vay tự động',
    description:
      'Tạo khoản vay với tính toán tự động lãi suất trên blockchain. Sau khi blockchain trả về thông tin, tự động lưu vào MongoDB.',
  })
  @ApiBody({ type: CreateLoanAutoDto })
  @ApiResponse({
    status: 201,
    description: 'Tạo khoản vay thành công',
    schema: {
      example: {
        statusCode: 201,
        message: 'Tạo khoản vay thành công',
        data: {
          contractId: 'LOAN_1234567890',
          info: {
            capital: 10000000,
            periodMonth: 12,
            score: 750,
            willing: 'Mua nhà',
            rate: 12.5,
            monthlyPrincipalPay: 833333,
            monthlyInterestPay: 104167,
            monthlyPay: 937500,
            entirelyPay: 11250000,
            disbursementDate: '2025-01-15T00:00:00.000Z',
            maturityDate: '2026-01-15T00:00:00.000Z',
            createdAt: '2025-01-10T10:00:00.000Z',
          },
          totalNotes: 20,
          status: 'waiting',
          borrower: {
            _id: '507f1f77bcf86cd799439011',
            phone: '0912345678',
            category: 'BORROWER',
            detail: {},
          },
          matchingStatus: {
            nodeMatch: 0,
            matchedAmount: 0,
            matchPercentage: 0,
            isFullMatch: false,
            waitingRoomId: null,
            waitingRooms: [],
            message: 'Waiting for matching',
          },
        },
        timestamp: '2025-01-10T10:00:00.000Z',
        path: '/loans/create-auto',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ',
  })
  @ApiResponse({
    status: 401,
    description: 'Chưa đăng nhập hoặc token không hợp lệ',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền truy cập (chỉ BORROWER)',
  })
  async createLoanAuto(
    @Request() req: any,
    @Body() createLoanDto: CreateLoanAutoDto,
  ) {
    console.log('=== [LoansController] createLoanAuto - START ===');
    console.log('[LoansController] Request body:', JSON.stringify(createLoanDto, null, 2));
    
    const borrower = req.user;
    const userDetail = req.userDetail || { score: 0 };
    
    console.log('[LoansController] Borrower ID:', borrower._id);
    console.log('[LoansController] User detail score:', userDetail.score);

    const result = await this.loansService.createLoanAuto(
      borrower,
      userDetail,
      createLoanDto,
    );

    console.log('[LoansController] Result contractId:', result?.contractId);
    console.log('=== [LoansController] createLoanAuto - END ===');

    return result;
  }

  @Get(':id')
  @Roles(Role.BORROWER, Role.LENDER, Role.ADMIN)
  @ResponseMessage('Lấy chi tiết khoản vay thành công')
  @ApiOperation({
    summary: 'Lấy chi tiết khoản vay',
    description: 'Lấy thông tin chi tiết khoản vay từ MongoDB theo contractId',
  })
  @ApiParam({
    name: 'id',
    description: 'Contract ID của khoản vay',
    example: 'LOAN_1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy chi tiết khoản vay thành công',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy khoản vay',
  })
  async getLoanDetail(@Param('id') contractId: string) {
    console.log('=== [LoansController] getLoanDetail - START ===');
    console.log('[LoansController] Contract ID:', contractId);

    const result = await this.loansService.findOne(contractId);

    console.log('[LoansController] Found loan:', result ? 'Yes' : 'No');
    if (result) {
      console.log('[LoansController] Loan status:', result.status);
      console.log('[LoansController] Loan capital:', result.info?.capital);
    }
    console.log('=== [LoansController] getLoanDetail - END ===');

    return result;
  }

  @Get('borrower/:borrowerId')
  @Roles(Role.BORROWER, Role.ADMIN)
  @ResponseMessage('Lấy danh sách khoản vay thành công')
  @ApiOperation({
    summary: 'Lấy danh sách khoản vay của borrower',
    description:
      'Lấy tất cả khoản vay của một borrower. Borrower chỉ xem được khoản vay của mình.',
  })
  @ApiParam({
    name: 'borrowerId',
    description: 'ID của borrower',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy danh sách khoản vay thành công',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền xem khoản vay của borrower khác',
  })
  async getBorrowerLoans(
    @Param('borrowerId') borrowerId: string,
    @Request() req: any,
  ) {
    console.log('=== [LoansController] getBorrowerLoans - START ===');
    console.log('[LoansController] Borrower ID:', borrowerId);
    console.log('[LoansController] Request user ID:', req.user._id);
    console.log('[LoansController] Request user role:', req.user.role);

    // Kiểm tra quyền: borrower chỉ xem được khoản vay của mình
    if (
      req.user.role === Role.BORROWER &&
      req.user._id.toString() !== borrowerId
    ) {
      console.log('[LoansController] Unauthorized: Borrower cannot view other loans');
      throw new Error('Unauthorized');
    }

    const result = await this.loansService.findByBorrower(borrowerId);

    console.log('[LoansController] Found loans count:', result?.length || 0);
    console.log('=== [LoansController] getBorrowerLoans - END ===');

    return result;
  }
}

