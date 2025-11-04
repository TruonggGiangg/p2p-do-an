import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@auth/decorators/roles.decorator';
import { Role } from '@auth/roles/role.enum';

@Injectable()
export class EnhancedRolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    // If no roles are required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { user } = request;
    
    // Must be authenticated
    if (!user || !user.role) {
      return false;
    }

    // Check if user has required role
    const hasRole = requiredRoles.includes(user.role as Role);
    if (!hasRole) {
      return false;
    }

    // Additional checks based on role (like old AuthBorrowerMiddleware)
    if (user.role === Role.BORROWER) {
      // For borrowers, check if profile is declared
      if (!user.profile?.declared) {
        throw new ForbiddenException('Thông tin cá nhân chưa được khai báo đầy đủ');
      }
      
      // Attach user detail to request for controllers to use
      request.userDetail = user.profile;
    }

    // For lenders, no additional checks needed (like old AuthLenderMiddleware)
    if (user.role === Role.LENDER) {
      request.userDetail = null;
    }

    // For admin, no additional checks needed
    if (user.role === Role.ADMIN) {
      request.userDetail = null;
    }

    return true;
  }
}

/**
 * Specific guard for borrower-only endpoints
 * Equivalent to old AuthBorrowerMiddleware
 */
@Injectable()
export class BorrowerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const { user } = request;
    
    if (!user || user.role !== Role.BORROWER) {
      return false;
    }

    if (!user.profile?.declared) {
      throw new ForbiddenException('Thông tin cá nhân chưa được khai báo đầy đủ');
    }

    request.userDetail = user.profile;
    return true;
  }
}

/**
 * Specific guard for lender-only endpoints
 * Equivalent to old AuthLenderMiddleware
 */
@Injectable()
export class LenderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const { user } = request;
    
    if (!user || user.role !== Role.LENDER) {
      return false;
    }

    request.userDetail = null;
    return true;
  }
}

/**
 * Guard for endpoints that allow both borrower and lender
 * Equivalent to old AuthBothRolesMiddleware
 */
@Injectable()
export class BothRolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const { user } = request;
    
    if (!user || (user.role !== Role.BORROWER && user.role !== Role.LENDER)) {
      return false;
    }

    // If borrower, check profile declaration and attach detail
    if (user.role === Role.BORROWER && user.profile?.declared) {
      request.userDetail = user.profile;
    } else {
      request.userDetail = null;
    }

    return true;
  }
}

/**
 * Specific guard for admin-only endpoints
 * Equivalent to old AuthAdminMiddleware
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const { user } = request;
    
    if (!user || user.role !== Role.ADMIN) {
      return false;
    }

    request.userDetail = null;
    return true;
  }
}