import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger, HttpException } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof Error ? exception.message : 'Internal server error';

    // Log with request details
    const logMessage = `${request.method} ${request.url} - ${status} - ${message}`;
    if (status >= 500) {
      this.logger.error(logMessage, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(logMessage);
    }

    const errorResponse = {
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: process.env.NODE_ENV === 'production' && status >= 500 ? 'Internal server error' : message,
      error: exception instanceof Error ? exception.name : 'Error',
    };

    response.status(status).json(errorResponse);
  }
}
