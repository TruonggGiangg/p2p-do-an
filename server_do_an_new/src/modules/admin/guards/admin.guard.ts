import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserPayload } from '../../auth/interfaces/auth.interface';

export const ADMIN_ROLE = 'admin';

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
    if (!roles.includes(ADMIN_ROLE)) {
      throw new ForbiddenException('Chỉ admin mới được truy cập');
    }
    return true;
  }
}
