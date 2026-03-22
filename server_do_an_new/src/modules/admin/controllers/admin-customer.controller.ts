import { Controller, Get, Post, Put, Delete, Patch, Param, Body, Query, Req, Res, UploadedFiles, UseGuards, UseInterceptors, ParseIntPipe, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../guards/admin.guard';
import { AdminService } from '../admin.service';
import { PoliciesGuard } from '../../casl/policies.guard';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { Action } from '../../casl/actions.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../auth/interfaces/auth.interface';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard, PoliciesGuard)
export class AdminCustomerController {
  constructor(
    private readonly adminService: AdminService,
  ) {}

  @Get('customers')
  @CheckPolicies(ability => ability.can(Action.Read, 'Customer'))
  @ApiOperation({ summary: 'Danh sách khách hàng (phân trang)' })
  @ApiResponse({ status: 200 })
  async getCustomers(@Query('page') page?: string, @Query('limit') limit?: string, @Query('keyword') keyword?: string) {
    const result = await this.adminService.getCustomers(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
      keyword?.trim() || undefined,
    );
    return result ;
  }

  @Get('customers/pending-approval')
  @CheckPolicies(ability => ability.can(Action.Read, 'Customer'))
  @ApiOperation({ summary: 'Danh sách khách hàng chờ phê duyệt (inactive clients)' })
  @ApiResponse({ status: 200 })
  async getPendingApprovalCustomers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('keyword') keyword?: string,
  ) {
    const result = await this.adminService.getPendingApprovalClients(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
      keyword?.trim() || undefined,
    );
    return result ;
  }

  @Get('customers/:id')
  @CheckPolicies(ability => ability.can(Action.Read, 'Customer'))
  @ApiOperation({ summary: 'Chi tiết khách hàng' })
  @ApiResponse({ status: 200 })
  async getCustomer(@Param('id') id: string) {
    const user = await this.adminService.getCustomerById(id);
    return user ;
  }

  @Get('customers/:id/detail')
  @CheckPolicies(ability => ability.can(Action.Read, 'Customer'))
  @ApiOperation({ summary: 'Chi tiết đầy đủ khách hàng (như Mifos: summary, savings, charges)' })
  @ApiResponse({ status: 200 })
  async getCustomerDetail(@Param('id') id: string) {
    const detail = await this.adminService.getCustomerDetail(id);
    return detail ;
  }

  @Get('customers/:id/loans')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Khoản vay của khách hàng (chỉ sản phẩm P*)' })
  @ApiResponse({ status: 200 })
  async getCustomerLoans(@Param('id') id: string) {
    const loans = await this.adminService.getCustomerLoans(id);
    return { loans  };
  }

  @Post('customers/:id/sync-loans')
  @CheckPolicies(ability => ability.can(Action.Update, 'Customer'))
  @ApiOperation({ summary: 'Đồng bộ toàn bộ khoản vay của khách hàng từ Fineract' })
  @ApiResponse({ status: 200 })
  async syncCustomerLoans(@Param('id') id: string) {
    const result = await this.adminService.syncClientLoansFromFineract(id);
    return result ;
  }
}
