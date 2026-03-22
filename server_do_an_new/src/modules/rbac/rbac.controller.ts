import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { RbacService } from './rbac.service';

@ApiTags('RBAC')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  // ═══════════════════ METADATA ═══════════════════

  @Get('metadata')
  @ApiOperation({ summary: 'Lấy danh sách actions + subjects hệ thống' })
  async getMetadata() {
    return this.rbacService.getMetadata();
  }

  // ═══════════════════ ROLES ═══════════════════════

  @Get('roles')
  @ApiOperation({ summary: 'Danh sách tất cả roles' })
  async listRoles() {
    return this.rbacService.listRoles();
  }

  @Post('roles')
  @ApiOperation({ summary: 'Tạo role mới' })
  async createRole(@Body() body: { name: string; description?: string }) {
    return this.rbacService.createRole(body.name, body.description);
  }

  @Put('roles/:id')
  @ApiOperation({ summary: 'Cập nhật role' })
  async updateRole(@Param('id') id: string, @Body() body: { name?: string; description?: string; isActive?: boolean }) {
    return this.rbacService.updateRole(id, body);
  }

  @Delete('roles/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xóa role (chỉ role tự tạo)' })
  async deleteRole(@Param('id') id: string) {
    return this.rbacService.deleteRole(id);
  }

  // ═══════════════════ PERMISSIONS ═════════════════

  @Get('roles/:id/permissions')
  @ApiOperation({ summary: 'Lấy danh sách permissions của role' })
  async getPermissions(@Param('id') id: string) {
    return this.rbacService.getPermissionsByRole(id);
  }

  @Put('roles/:id/permissions')
  @ApiOperation({ summary: 'Cập nhật toàn bộ permissions cho role (bulk)' })
  async setPermissions(
    @Param('id') id: string,
    @Body() body: { permissions: { action: string; subject: string; allowed: boolean }[] },
  ) {
    return this.rbacService.setPermissions(id, body.permissions);
  }

  @Post('roles/:id/permissions/toggle')
  @ApiOperation({ summary: 'Bật/tắt một quyền cụ thể' })
  async togglePermission(@Param('id') id: string, @Body() body: { action: string; subject: string; allowed: boolean }) {
    return this.rbacService.togglePermission(id, body.action, body.subject, body.allowed);
  }
}
