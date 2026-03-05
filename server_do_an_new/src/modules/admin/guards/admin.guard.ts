import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserPayload } from '../../auth/interfaces/auth.interface';

export const ADMIN_ROLE = 'admin';
export const STAFF_ROLE = 'staff';

/**
 * Allows both `admin` and `staff` roles to enter the admin controller.
 * Fine-grained permission checks are handled by PoliciesGuard + CASL.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as UserPayload | undefined;
    if (!user) {
      throw new ForbiddenException('Bạn cần đăng nhập');
    }
    const roles = user.roles ?? [];
    if (!roles.includes(ADMIN_ROLE) && !roles.includes(STAFF_ROLE)) {
      throw new ForbiddenException('Chỉ admin hoặc nhân viên mới được truy cập');
    }
    return true;
  }
}
