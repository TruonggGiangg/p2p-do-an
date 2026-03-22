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
import { RegisterDto } from 'src/modules/auth/dto/register.dto';
import { UpdateStaffDto } from '../dto/update-staff.dto';
import { ActivityLogService } from '../../activity-log/activity-log.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard, PoliciesGuard)
export class AdminStaffController {
  constructor(
    private readonly adminService: AdminService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  @Post('staff')
  @CheckPolicies(ability => ability.can(Action.Create, 'Staff'))
  @ApiOperation({ summary: 'Tạo nhân viên (Keycloak → Fineract → MongoDB)' })
  @ApiResponse({ status: 201 })
  async createStaff(@Body() dto: RegisterDto) {
    const result = await this.adminService.createStaff(dto);
    return result ;
  }

  @Get('staff')
  @CheckPolicies(ability => ability.can(Action.Read, 'Staff'))
  @ApiOperation({ summary: 'Danh sách nhân viên (phân trang)' })
  @ApiResponse({ status: 200 })
  async getStaffList(@Query('page') page?: string, @Query('limit') limit?: string, @Query('keyword') keyword?: string) {
    const result = await this.adminService.getStaffList(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
      keyword?.trim() || undefined,
    );
    return result ;
  }

  @Get('staff/:id')
  @CheckPolicies(ability => ability.can(Action.Read, 'Staff'))
  @ApiOperation({ summary: 'Chi tiết nhân viên' })
  @ApiResponse({ status: 200 })
  async getStaffById(@Param('id') id: string) {
    const staff = await this.adminService.getStaffById(id);
    return staff ;
  }

  @Put('staff/:id')
  @CheckPolicies(ability => ability.can(Action.Update, 'Staff'))
  @ApiOperation({ summary: 'Cập nhật nhân viên' })
  @ApiResponse({ status: 200 })
  async updateStaff(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    const result = await this.adminService.updateStaff(id, dto);
    return result ;
  }

  @Delete('staff/:id')
  @CheckPolicies(ability => ability.can(Action.Delete, 'Staff'))
  @ApiOperation({ summary: 'Khóa nhân viên (soft delete)' })
  @ApiResponse({ status: 200 })
  async deleteStaff(@Param('id') id: string) {
    const result = await this.adminService.deleteStaff(id);
    return result ;
  }

  @Post('staff/:id/restore')
  @CheckPolicies(ability => ability.can(Action.Update, 'Staff'))
  @ApiOperation({ summary: 'Khôi phục nhân viên đã khóa' })
  @ApiResponse({ status: 200 })
  async restoreStaff(@Param('id') id: string) {
    const result = await this.adminService.restoreStaff(id);
    return result ;
  }

  @Get('staff-deleted')
  @CheckPolicies(ability => ability.can(Action.Read, 'Staff'))
  @ApiOperation({ summary: 'Danh sách nhân viên đã khóa' })
  @ApiResponse({ status: 200 })
  async getDeletedStaffList(@Query('page') page?: string, @Query('limit') limit?: string) {
    const result = await this.adminService.getDeletedStaffList(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
    );
    return result ;
  }

  @Post('migrate-phone-numbers')
  @CheckPolicies(ability => ability.can(Action.Manage, 'Migration'))
  @ApiOperation({ summary: 'Migration: Set phoneNumber = username cho tất cả user' })
  @ApiResponse({ status: 200 })
  async migratePhoneNumbers() {
    const result = await this.adminService.migratePhoneNumbers();
    return result ;
  }

  @Get('activity-logs')
  @CheckPolicies(ability => ability.can(Action.Read, 'Staff'))
  @ApiOperation({ summary: 'Lấy danh sách lịch sử hoạt động (phân trang)' })
  @ApiResponse({ status: 200 })
  async getActivityLogs(@Query('page') page?: string, @Query('limit') limit?: string) {
    const result = await this.activityLogService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
    );
    return result ;
  }

  @Get('activity-logs/user/:userId')
  @CheckPolicies(ability => ability.can(Action.Read, 'Staff'))
  @ApiOperation({ summary: 'Lấy lịch sử hoạt động theo userId' })
  @ApiResponse({ status: 200 })
  async getActivityLogsByUser(
    @Param('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.activityLogService.findByUser(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
    );
    return result ;
  }
}
