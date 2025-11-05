import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { User, ResponseMessage } from '@decorator/customize';
import { Roles } from '@auth/decorators/roles.decorator';
import { Role } from '@auth/roles/role.enum';
import { RolesGuard } from '@auth/guard/roles.guard';

@Controller('settlement')
@UseGuards(RolesGuard)
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Post('check')
  @ResponseMessage('Kiểm tra kỳ hạn thành công')
  @Roles(Role.BORROWER)
  async check(@User() borrower: any) {
    return this.settlementsService.checkAndRemind(borrower._id.toString());
  }

  @Post('pay')
  @ResponseMessage('Thanh toán kỳ hạn thành công')
  @Roles(Role.BORROWER)
  async pay(@Body() body: { settledId: string; amount: number; realpaidDate?: string }) {
    // Delegate to HyperledgerService directly (evaluate/submit)
    // Intentionally simple: client passes settledId and amount, server forwards to BC
    // The SettlementsService focuses on DB mirror and reminders
    throw new Error('Not implemented yet');
  }

  @Get('loan/:loanId')
  @ResponseMessage('Lấy danh sách kỳ hạn theo loan thành công')
  @Roles(Role.BORROWER, Role.LENDER, Role.ADMIN)
  async getByLoan(@Param('loanId') loanId: string) {
    return this.settlementsService.getByLoanId(loanId);
  }
}


