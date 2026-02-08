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
        : exception instanceof Error
          ? HttpStatus.INTERNAL_SERVER_ERROR
          : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof Error ? exception.message : 'Internal server error';

    this.logger.error(`Unhandled exception: ${message}`, exception instanceof Error ? exception.stack : undefined);

    const errorResponse = {
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
      error: exception instanceof Error ? exception.name : 'Error',
    };

    response.status(status).json(errorResponse);
  }
}
