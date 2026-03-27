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
      message: typeof message === 'string' ? message : message.message || 'Đã có lỗi xảy ra',
      error: typeof message === 'object' ? message.error || 'Internal Server Error' : 'Error',
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    if (data) responseBody.data = data;

    this.logger.error(`${request.method} ${request.url} ${status} - ${JSON.stringify(message)}`);

    response.status(status).json(responseBody);
  }
}
