import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Get error message
    let message: string;
    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const errorObj = exceptionResponse as any;
      if (errorObj.message) {
        // Handle validation errors (array of messages)
        if (Array.isArray(errorObj.message)) {
          message = errorObj.message.join(', ');
        } else {
          message = errorObj.message;
        }
      } else {
        message = errorObj.error || 'Internal server error';
      }
    } else {
      message = 'Internal server error';
    }

    // Format response similar to old server
    const errorResponse = {
      feature: this.getFeatureName(request.url),
      code: status,
      error: message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }

  private getFeatureName(url: string): string {
    // Extract feature name from URL path
    const parts = url.split('/').filter(part => part.length > 0);
    if (parts.length >= 2) {
      return `${parts[0]}_${parts[1]}`;
    } else if (parts.length === 1) {
      return parts[0];
    }
    return 'unknown';
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errorResponse = {
      feature: this.getFeatureName(request.url),
      code: status,
      error: message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }

  private getFeatureName(url: string): string {
    const parts = url.split('/').filter(part => part.length > 0);
    if (parts.length >= 2) {
      return `${parts[0]}_${parts[1]}`;
    } else if (parts.length === 1) {
      return parts[0];
    }
    return 'unknown';
  }
}