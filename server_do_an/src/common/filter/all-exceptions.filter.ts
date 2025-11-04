import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
  data?: any;
  timestamp: string;
  path: string;
  validationErrors?: any[];
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const path = request.url;
    const timestamp = new Date().toISOString();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal Server Error';
    let error: string | undefined;
    let validationErrors: any[] | undefined;
    let data: any = null;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;

      // Handle validation errors
      if (exceptionResponse.message && Array.isArray(exceptionResponse.message)) {
        message = exceptionResponse.message[0];
        validationErrors = exceptionResponse.message;
      } else if (typeof exceptionResponse.message === 'string') {
        message = exceptionResponse.message;
      } else {
        message = exceptionResponse.message || exception.message || 'An error occurred';
      }

      error = exceptionResponse.error || exception.name;

      // Handle specific exceptions
      if (exception instanceof BadRequestException) {
        message = exceptionResponse.message || 'Invalid request';
      } else if (exception instanceof UnauthorizedException) {
        message = exceptionResponse.message || 'Unauthorized access';
      } else if (exception instanceof ForbiddenException) {
        message = exceptionResponse.message || 'Forbidden access';
      } else if (exception instanceof NotFoundException) {
        message = exceptionResponse.message || 'Resource not found';
      } else if (exception instanceof ConflictException) {
        message = exceptionResponse.message || 'Conflict error';
      } else if (exception instanceof InternalServerErrorException) {
        message = exceptionResponse.message || 'Internal server error';
      }
    } else if (exception instanceof Error) {
      message = exception.message || 'Unknown error occurred';
      error = exception.name;

      // Log unexpected errors
      this.logger.error(
        `Unexpected error: ${message}`,
        exception.stack,
      );
    } else {
      message = 'An unexpected error occurred';
      this.logger.error('Unknown exception type:', exception);
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      message,
      ...(error && { error }),
      ...(validationErrors && { validationErrors }),
      timestamp,
      path,
    };

    if (statusCode >= 500) {
      this.logger.error(
        `[${request.method}] ${path} - Status: ${statusCode} - Message: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `[${request.method}] ${path} - Status: ${statusCode} - Message: ${message}`,
      );
    }

    response.status(statusCode).json(errorResponse);
  }
}
