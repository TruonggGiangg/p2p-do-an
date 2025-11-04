import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { RESPONSE_MESSAGE } from '@decorator/customize';

export interface Response<T> {
  statusCode: number;
  message: string;
  data?: T;
  timestamp?: string;
  path?: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      map((data) => {
        const statusCode = response.statusCode || 200;
        const message = this.reflector.get<string>(
          RESPONSE_MESSAGE,
          context.getHandler(),
        );

        // Nếu response đã là JSON object với statusCode, data, message thì return trực tiếp
        if (data && typeof data === 'object' && 'statusCode' in data) {
          return data;
        }

        return {
          statusCode,
          message: message || 'Success',
          data: data || null,
          timestamp: new Date().toISOString(),
          path: request.url,
        };
      }),
    );
  }
}
