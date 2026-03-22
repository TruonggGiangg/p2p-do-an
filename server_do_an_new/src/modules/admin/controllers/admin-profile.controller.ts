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
import { CaslAbilityFactory } from '../../casl/casl-ability.factory';
import { ActivityLogService } from '../../activity-log/activity-log.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard, PoliciesGuard)
export class AdminProfileController {
  constructor(
    private readonly adminService: AdminService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly activityLogService: ActivityLogService,
  ) {}

  @Get('me/permissions')
  @ApiOperation({ summary: 'Lấy danh sách quyền của user hiện tại (cho frontend CASL)' })
  @ApiResponse({ status: 200 })
  async getMyPermissions(@CurrentUser() user: UserPayload) {
    if (!user?._id) throw new UnauthorizedException('Unauthorized');
    const ability = await this.caslAbilityFactory.createForUser(user);
    return { rules: ability.rules, roles: user.roles ?? [] };
  }

  @Get('me/profile')
  @ApiOperation({ summary: 'Lấy thông tin cá nhân của user hiện tại' })
  @ApiResponse({ status: 200 })
  async getMyProfile(@CurrentUser('id') userId: string) {
    return this.adminService.getMyProfile(userId);
  }

  @Put('me/profile')
  @ApiOperation({ summary: 'Cập nhật hồ sơ cá nhân' })
  @ApiResponse({ status: 200 })
  async updateMyProfile(
    @CurrentUser('id') userId: string,
    @Body() body: { firstName?: string; lastName?: string; email?: string; phoneNumber?: string },
  ) {
    return this.adminService.updateMyProfile(userId, body);
  }

  @Get('me/activity-logs')
  @ApiOperation({ summary: 'Lịch sử hoạt động của user hiện tại' })
  @ApiResponse({ status: 200 })
  async getMyActivityLogs(@CurrentUser('id') userId: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.activityLogService.findByUser(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
    );
  }

  @Put('me/password')
  @ApiOperation({ summary: 'Đổi mật khẩu cá nhân' })
  @ApiResponse({ status: 200 })
  async changeMyPassword(@CurrentUser('id') userId: string, @Body() body: { currentPassword: string; newPassword: string }) {
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException('Vui lòng nhập mật khẩu hiện tại và mật khẩu mới');
    }
    if (body.newPassword.length < 6) {
      throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự');
    }
    return this.adminService.changeMyPassword(userId, body.currentPassword, body.newPassword);
  }

  @Get('me/preferences')
  @ApiOperation({ summary: 'Lấy cài đặt giao diện (fontSize, v.v.) của user hiện tại' })
  @ApiResponse({ status: 200 })
  async getMyPreferences(@CurrentUser('id') userId: string) {
    return this.adminService.getMyPreferences(userId);
  }

  @Patch('me/preferences')
  @ApiOperation({ summary: 'Cập nhật cài đặt giao diện (fontSize, v.v.)' })
  @ApiResponse({ status: 200 })
  async updateMyPreferences(@CurrentUser('id') userId: string, @Body() body: { fontSize?: 'compact' | 'default' | 'large' }) {
    return this.adminService.updateMyPreferences(userId, body);
  }
}
