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
    return { statusCode: 200, data: this.rbacService.getMetadata() };
  }

  // ═══════════════════ ROLES ═══════════════════════

  @Get('roles')
  @ApiOperation({ summary: 'Danh sách tất cả roles' })
  async listRoles() {
    const roles = await this.rbacService.listRoles();
    return { statusCode: 200, data: roles };
  }

  @Post('roles')
  @ApiOperation({ summary: 'Tạo role mới' })
  async createRole(@Body() body: { name: string; description?: string }) {
    const role = await this.rbacService.createRole(body.name, body.description);
    return { statusCode: 201, data: role };
  }

  @Put('roles/:id')
  @ApiOperation({ summary: 'Cập nhật role' })
  async updateRole(@Param('id') id: string, @Body() body: { name?: string; description?: string; isActive?: boolean }) {
    const role = await this.rbacService.updateRole(id, body);
    return { statusCode: 200, data: role };
  }

  @Delete('roles/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xóa role (chỉ role tự tạo)' })
  async deleteRole(@Param('id') id: string) {
    const result = await this.rbacService.deleteRole(id);
    return { statusCode: 200, data: result };
  }

  // ═══════════════════ PERMISSIONS ═════════════════

  @Get('roles/:id/permissions')
  @ApiOperation({ summary: 'Lấy danh sách permissions của role' })
  async getPermissions(@Param('id') id: string) {
    const perms = await this.rbacService.getPermissionsByRole(id);
    return { statusCode: 200, data: perms };
  }

  @Put('roles/:id/permissions')
  @ApiOperation({ summary: 'Cập nhật toàn bộ permissions cho role (bulk)' })
  async setPermissions(
    @Param('id') id: string,
    @Body() body: { permissions: { action: string; subject: string; allowed: boolean }[] },
  ) {
    const perms = await this.rbacService.setPermissions(id, body.permissions);
    return { statusCode: 200, message: 'Cập nhật quyền thành công', data: perms };
  }

  @Post('roles/:id/permissions/toggle')
  @ApiOperation({ summary: 'Bật/tắt một quyền cụ thể' })
  async togglePermission(@Param('id') id: string, @Body() body: { action: string; subject: string; allowed: boolean }) {
    const perm = await this.rbacService.togglePermission(id, body.action, body.subject, body.allowed);
    return { statusCode: 200, data: perm };
  }
}
