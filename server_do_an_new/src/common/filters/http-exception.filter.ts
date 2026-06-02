import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as any).message || 'Internal server error';

    // Truyền structured data (debtGroup, overdueDays, policy...) nếu có
    let data: Record<string, any> | undefined;
    if (typeof exceptionResponse === 'object' && (exceptionResponse as any).code) {
      const { message: _msg, statusCode: _s, error: _e, ...rest } = exceptionResponse as any;
      data = rest;
    }

    const responseBody: Record<string, any> = {
      success: false,
      statusCode: status,
      message: Array.isArray(message) ? message[0] : (typeof message === 'string' ? message : message.message || 'Đã có lỗi xảy ra'),
      error: typeof message === 'object' && !Array.isArray(message) ? message.error || 'Internal Server Error' : 'Error',
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    if (data) responseBody.data = data;

    this.logger.error({
      message: `${request.method} ${request.url} ${status} - ${JSON.stringify(message)}`,
      method: request.method,
      url: request.url,
      statusCode: status,
      ip: request.headers['x-forwarded-for'] || request.ip || '',
      userAgent: request.headers['user-agent'] || '',
      userId: request.user?._id || request.user?.sub || 'anonymous',
    });

    response.status(status).json(responseBody);
  }
}
