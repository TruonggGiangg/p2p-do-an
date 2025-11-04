import { Injectable, NestInterceptor, ExecutionContext, CallHandler, HttpStatus } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ResponseFormat<T> {
  feature: string;
  code: number;
  data: T;
  token?: string;
  user?: T;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ResponseFormat<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ResponseFormat<T>> {
    const request = context.switchToHttp().getRequest();
    const handlerName = context.getHandler().name;
    
    return next.handle().pipe(
      map(data => {
        // If response is already formatted (has 'data' field), return as is
        if (data && typeof data === 'object' && 'data' in data) {
          return data;
        }

        // Format response similar to old server
        const feature = this.getFeatureName(request.url, handlerName);
        
        const response: ResponseFormat<T> = {
          feature,
          code: HttpStatus.OK,
          data: data,
        };

        // Add token if present in data
        if (data && typeof data === 'object' && 'token' in data) {
          response.token = (data as any).token;
        }

        // Add user field for backward compatibility
        if (data && typeof data === 'object') {
          response.user = data;
        }

        return response;
      })
    );
  }

  private getFeatureName(url: string, handlerName: string): string {
    // Extract feature name from URL and handler
    const urlParts = url.split('/').filter(part => part.length > 0);
    
    if (urlParts.length >= 2) {
      const module = urlParts[0];
      const action = urlParts[1];
      return `${module}_${action}`;
    } else if (handlerName) {
      return handlerName.toLowerCase().replace('controller', '');
    } else if (urlParts.length === 1) {
      return urlParts[0];
    }
    
    return 'unknown';
  }
}