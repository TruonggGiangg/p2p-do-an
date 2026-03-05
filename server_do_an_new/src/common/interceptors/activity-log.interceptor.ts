import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ActivityLogService } from '../../modules/activity-log/activity-log.service';

/**
 * Mapping HTTP method + path → mô tả tiếng Việt.
 * Nếu path chưa được map sẽ sinh action mặc định.
 */
const ACTION_MAP: Record<string, Record<string, string>> = {
  POST: {
    '/api/admin/staff': 'Tạo nhân viên',
    '/api/admin/document-types': 'Tạo loại tài liệu',
    '/api/admin/sync-compare': 'Đồng bộ sản phẩm vay',
    '/api/admin/sync-compare-savings': 'Đồng bộ sản phẩm tiết kiệm',
    '/api/admin/migrate-phone-numbers': 'Migration số điện thoại',
  },
  PUT: {
    // Pattern-match bên dưới
  },
  PATCH: {},
  DELETE: {},
};

/** Regex patterns cho các path có tham số */
const PATTERN_ACTIONS: Array<{ method: string; pattern: RegExp; action: string }> = [
  // Staff
  { method: 'PUT', pattern: /^\/api\/admin\/staff\/[^/]+$/, action: 'Cập nhật nhân viên' },
  { method: 'DELETE', pattern: /^\/api\/admin\/staff\/[^/]+$/, action: 'Khóa nhân viên' },
  { method: 'POST', pattern: /^\/api\/admin\/staff\/[^/]+\/restore$/, action: 'Khôi phục nhân viên' },
  // Document types
  { method: 'PUT', pattern: /^\/api\/admin\/document-types\/[^/]+$/, action: 'Cập nhật loại tài liệu' },
  { method: 'DELETE', pattern: /^\/api\/admin\/document-types\/[^/]+$/, action: 'Xóa loại tài liệu' },
  // Loan
  { method: 'POST', pattern: /^\/api\/admin\/loans\/[^/]+\/approve$/, action: 'Phê duyệt khoản vay' },
  { method: 'POST', pattern: /^\/api\/admin\/loans\/[^/]+\/disburse$/, action: 'Giải ngân khoản vay' },
  // Loan documents
  { method: 'POST', pattern: /^\/api\/admin\/loan-documents\/[^/]+\/approve$/, action: 'Phê duyệt tài liệu khoản vay' },
  { method: 'POST', pattern: /^\/api\/admin\/loan-documents\/[^/]+\/reject$/, action: 'Từ chối tài liệu khoản vay' },
  // KYC
  { method: 'POST', pattern: /^\/api\/admin\/kyc\/[^/]+\/approve$/, action: 'Phê duyệt KYC' },
  { method: 'POST', pattern: /^\/api\/admin\/kyc\/[^/]+\/reject$/, action: 'Từ chối KYC' },
  { method: 'POST', pattern: /^\/api\/admin\/kyc\/[^/]+\/ocr-front$/, action: 'OCR mặt trước CCCD' },
  { method: 'POST', pattern: /^\/api\/admin\/kyc\/[^/]+\/ocr-back$/, action: 'OCR mặt sau CCCD' },
  { method: 'POST', pattern: /^\/api\/admin\/kyc\/[^/]+\/save$/, action: 'Lưu thông tin KYC' },
  // Product document types
  {
    method: 'POST',
    pattern: /^\/api\/admin\/loan-products\/[^/]+\/document-types$/,
    action: 'Gắn loại tài liệu cho sản phẩm vay',
  },
];

/**
 * Lọc bỏ các field nhạy cảm (password, token…) khỏi body trước khi lưu log.
 */
function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') return body;
  const sanitized = { ...body };
  const sensitiveKeys = ['password', 'token', 'accessToken', 'refreshToken', 'secret', 'otp'];
  for (const key of sensitiveKeys) {
    if (key in sanitized) sanitized[key] = '***';
  }
  return sanitized;
}

function resolveAction(method: string, path: string): string {
  // 1. Exact match
  const exactAction = ACTION_MAP[method]?.[path];
  if (exactAction) return exactAction;

  // 2. Pattern match
  for (const p of PATTERN_ACTIONS) {
    if (p.method === method && p.pattern.test(path)) return p.action;
  }

  // 3. Fallback
  const methodLabel: Record<string, string> = {
    POST: 'Tạo mới',
    PUT: 'Cập nhật',
    PATCH: 'Cập nhật',
    DELETE: 'Xóa',
  };
  return `${methodLabel[method] || method} — ${path}`;
}

/** Chỉ log các method ghi dữ liệu */
const LOGGED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Chỉ log cho admin/staff */
const LOGGED_ROLES = new Set(['admin', 'staff']);

/**
 * Trích xuất thông tin đối tượng bị tác động từ responseBody.
 */
function extractTargetInfo(method: string, path: string, responseBody: any): Record<string, any> | null {
  const data = responseBody?.data;
  if (!data) return null;

  // Loan approve / disburse → có thông tin người vay
  if (data.borrowerName || data.borrowerUsername) {
    return {
      borrowerName: data.borrowerName || '',
      borrowerUsername: data.borrowerUsername || '',
      fineractLoanId: data.fineractLoanId,
    };
  }

  // Khoản vay (có fineractLoanId)
  if (data.fineractLoanId) {
    return { fineractLoanId: data.fineractLoanId };
  }

  // Staff operations (có staffId hoặc username)
  if (data.staffId || data.username) {
    return {
      staffId: data.staffId || data._id,
      staffName: data.displayName || data.username,
    };
  }

  return null;
}

@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('ActivityLog');

  constructor(private readonly activityLogService: ActivityLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, ip, headers } = request;

    // Chỉ ghi log cho POST/PUT/PATCH/DELETE
    if (!LOGGED_METHODS.has(method)) {
      return next.handle();
    }

    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: responseBody => {
          const response = context.switchToHttp().getResponse();
          const duration = Date.now() - now;
          const user = request.user;

          // Không log nếu không có user (chưa auth)
          if (!user) return;

          const roles: string[] = user.roles || [];
          const userRole = roles.includes('admin')
            ? 'admin'
            : roles.includes('staff')
              ? 'staff'
              : roles[0] || 'unknown';

          // Chỉ log cho admin/staff — bỏ qua borrower/lender
          if (!LOGGED_ROLES.has(userRole)) return;

          const cleanPath = url.split('?')[0];
          const targetInfo = extractTargetInfo(method, cleanPath, responseBody);

          const logEntry: any = {
            userId: user._id || user.sub || user.keycloakUserId || 'unknown',
            username: user.username || user.email || 'unknown',
            userRole,
            method,
            path: cleanPath,
            action: resolveAction(method, cleanPath),
            statusCode: response.statusCode,
            requestBody: sanitizeBody(body),
            responseMessage: responseBody?.message || '',
            ip: headers['x-forwarded-for'] || ip || '',
            userAgent: headers['user-agent'] || '',
            duration,
          };

          if (targetInfo) {
            logEntry.targetInfo = targetInfo;
          }

          // Fire-and-forget: ghi log không chặn response
          this.activityLogService.create(logEntry).catch(err => {
            this.logger.error('Ghi activity log thất bại', err);
          });
        },
        // Không ghi log cho error (đã có exception filter xử lý)
      }),
    );
  }
}
