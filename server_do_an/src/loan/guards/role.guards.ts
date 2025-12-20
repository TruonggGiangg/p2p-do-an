import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';

/**
 * Roles configuration
 * Có thể cấu hình từ Keycloak hoặc local
 */
export const ROLES = {
    BORROWER: ['borrower', 'Borrower', 'BORROWER'],
    LENDER: ['lender', 'Lender', 'LENDER'],
    ADMIN: ['admin', 'Admin', 'ADMIN', 'p2p_admin', 'super_admin'],
};

/**
 * Check if user has any of the specified roles
 */
function hasRole(userRoles: string[], allowedRoles: string[]): boolean {
    if (!userRoles || !Array.isArray(userRoles)) {
        return false;
    }
    return userRoles.some((role) =>
        allowedRoles.map((r) => r.toLowerCase()).includes(role.toLowerCase()),
    );
}

/**
 * BorrowerGuard - Only allows users with Borrower role
 */
@Injectable()
export class BorrowerGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            throw new ForbiddenException('Không tìm thấy thông tin người dùng');
        }

        const userRoles = user.roles || [];

        if (!hasRole(userRoles, ROLES.BORROWER)) {
            throw new ForbiddenException(
                'Chỉ người vay (Borrower) mới có thể thực hiện hành động này',
            );
        }

        return true;
    }
}

/**
 * LenderGuard - Only allows users with Lender role
 */
@Injectable()
export class LenderGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            throw new ForbiddenException('Không tìm thấy thông tin người dùng');
        }

        const userRoles = user.roles || [];

        if (!hasRole(userRoles, ROLES.LENDER)) {
            throw new ForbiddenException(
                'Chỉ nhà đầu tư (Lender) mới có thể thực hiện hành động này',
            );
        }

        return true;
    }
}

/**
 * BorrowerOrLenderGuard - Allows both Borrower and Lender roles
 */
@Injectable()
export class BorrowerOrLenderGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            throw new ForbiddenException('Không tìm thấy thông tin người dùng');
        }

        const userRoles = user.roles || [];
        const isBorrower = hasRole(userRoles, ROLES.BORROWER);
        const isLender = hasRole(userRoles, ROLES.LENDER);

        if (!isBorrower && !isLender) {
            throw new ForbiddenException(
                'Chỉ người vay hoặc nhà đầu tư mới có thể thực hiện hành động này',
            );
        }

        return true;
    }
}

/**
 * AdminGuard - Only allows users with Admin role
 */
@Injectable()
export class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            throw new ForbiddenException('Không tìm thấy thông tin người dùng');
        }

        const userRoles = user.roles || [];

        if (!hasRole(userRoles, ROLES.ADMIN)) {
            throw new ForbiddenException(
                'Chỉ Admin mới có thể thực hiện hành động này',
            );
        }

        return true;
    }
}
