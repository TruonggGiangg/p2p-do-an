import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, headers, ip, user } = request;
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const delay = Date.now() - now;
          const clientIp = headers['x-forwarded-for'] || ip || '';
          const userAgent = headers['user-agent'] || '';
          const userId = user?._id || user?.sub || 'anonymous';

          this.logger.log({
            message: `${method} ${url} ${response.statusCode} - ${delay}ms`,
            method,
            url,
            statusCode: response.statusCode,
            duration: delay,
            ip: clientIp,
            userAgent,
            userId,
          });
        },
        error: error => {
          const delay = Date.now() - now;
          const clientIp = headers['x-forwarded-for'] || ip || '';
          const userAgent = headers['user-agent'] || '';
          const userId = user?._id || user?.sub || 'anonymous';

          this.logger.error({
            message: `${method} ${url} - ${error.message} - ${delay}ms`,
            method,
            url,
            duration: delay,
            ip: clientIp,
            userAgent,
            userId,
          }, error.stack);
        },
      }),
    );
  }
}
