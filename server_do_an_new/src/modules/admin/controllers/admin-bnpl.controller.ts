import { Body, Controller, Get, Param, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../guards/admin.guard';
import { PoliciesGuard } from '../../casl/policies.guard';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { Action } from '../../casl/actions.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AdminService } from '../admin.service';
import { CreateBnplPolicyConfigDto } from '../../bnpl/dto/create-bnpl-policy-config.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard, PoliciesGuard)
export class AdminBnplController {
  constructor(private readonly adminService: AdminService) {}

  @Get('bnpl/applications')
  @CheckPolicies(ability => ability.can(Action.Read, 'BnplApplication'))
  @ApiOperation({ summary: 'Danh sach ho so BNPL' })
  @ApiResponse({ status: 200 })
  async getBnplApplications(@Query('status') status?: string) {
    const applications = await this.adminService.getBnplApplications(status);
    return { applications };
  }

  @Get('bnpl/applications/:applicationId')
  @CheckPolicies(ability => ability.can(Action.Read, 'BnplApplication'))
  @ApiOperation({ summary: 'Chi tiet ho so BNPL' })
  @ApiResponse({ status: 200 })
  async getBnplApplicationById(@Param('applicationId') applicationId: string) {
    return this.adminService.getBnplApplicationById(applicationId);
  }

  @Post('bnpl/applications/:applicationId/approve')
  @CheckPolicies(ability => ability.can(Action.Approve, 'BnplApplication'))
  @ApiOperation({ summary: 'Phe duyet ho so BNPL' })
  @ApiResponse({ status: 200 })
  async approveBnplApplication(
    @CurrentUser('id') adminId: string,
    @Param('applicationId') applicationId: string,
    @Body('approvedLimit') approvedLimit?: number,
  ) {
    if (!adminId) {
      throw new UnauthorizedException('Unauthorized');
    }

    return this.adminService.approveBnplApplication(applicationId, adminId, approvedLimit);
  }

  @Post('bnpl/applications/:applicationId/reject')
  @CheckPolicies(ability => ability.can(Action.Reject, 'BnplApplication'))
  @ApiOperation({ summary: 'Tu choi ho so BNPL' })
  @ApiResponse({ status: 200 })
  async rejectBnplApplication(
    @CurrentUser('id') adminId: string,
    @Param('applicationId') applicationId: string,
    @Body('reason') reason?: string,
  ) {
    if (!adminId) {
      throw new UnauthorizedException('Unauthorized');
    }

    return this.adminService.rejectBnplApplication(applicationId, adminId, reason);
  }

  @Get('bnpl/policy')
  @CheckPolicies(ability => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Cấu hình BNPL hiện tại' })
  @ApiResponse({ status: 200 })
  async getBnplPolicyConfig() {
    return this.adminService.getBnplPolicyConfig();
  }

  @Get('bnpl/policy/history')
  @CheckPolicies(ability => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Lịch sử cấu hình BNPL' })
  @ApiResponse({ status: 200 })
  async getBnplPolicyConfigHistory() {
    const items = await this.adminService.getBnplPolicyConfigHistory();
    return { items };
  }

  @Post('bnpl/policy')
  @CheckPolicies(ability => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Tạo version mới cấu hình BNPL' })
  @ApiResponse({ status: 201 })
  async createBnplPolicyConfig(
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateBnplPolicyConfigDto,
  ) {
    if (!adminId) {
      throw new UnauthorizedException('Unauthorized');
    }

    return this.adminService.createBnplPolicyConfig(dto, adminId);
  }

  @Get('bnpl/dashboard')
  @CheckPolicies(ability => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Tong quan BNPL' })
  @ApiResponse({ status: 200 })
  async getBnplDashboardSummary() {
    return this.adminService.getBnplDashboardSummary();
  }

  @Get('bnpl/wallets')
  @CheckPolicies(ability => ability.can(Action.Read, 'BnplWallet'))
  @ApiOperation({ summary: 'Danh sach vi BNPL' })
  @ApiResponse({ status: 200 })
  async getBnplWallets(@Query('status') status?: string) {
    const wallets = await this.adminService.getBnplWallets(status);
    return { wallets };
  }

  @Post('bnpl/wallets/:walletId/activate')
  @CheckPolicies(ability => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Kich hoat vi BNPL' })
  @ApiResponse({ status: 200 })
  async activateBnplWallet(
    @CurrentUser('id') adminId: string,
    @Param('walletId') walletId: string,
  ) {
    if (!adminId) {
      throw new UnauthorizedException('Unauthorized');
    }

    return this.adminService.activateBnplWallet(walletId, adminId);
  }

  @Post('bnpl/wallets/:walletId/suspend')
  @CheckPolicies(ability => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Tam ngung vi BNPL' })
  @ApiResponse({ status: 200 })
  async suspendBnplWallet(
    @CurrentUser('id') adminId: string,
    @Param('walletId') walletId: string,
    @Body('reason') reason?: string,
  ) {
    if (!adminId) {
      throw new UnauthorizedException('Unauthorized');
    }

    return this.adminService.suspendBnplWallet(walletId, adminId, reason);
  }

  @Get('bnpl/loans')
  @CheckPolicies(ability => ability.can(Action.Read, 'BnplLoan'))
  @ApiOperation({ summary: 'Danh sach khoan BNPL' })
  @ApiResponse({ status: 200 })
  async getBnplLoans(@Query('status') status?: string) {
    const loans = await this.adminService.getBnplLoans(status);
    return { loans };
  }

  @Post('bnpl/loans/:loanId/sync')
  @CheckPolicies(ability => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Dong bo trang thai khoan BNPL' })
  @ApiResponse({ status: 200 })
  async syncBnplLoan(@Param('loanId') loanId: string) {
    return this.adminService.syncBnplLoan(loanId);
  }
}
