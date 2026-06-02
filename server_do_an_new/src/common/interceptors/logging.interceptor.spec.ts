import { LoggingInterceptor } from './logging.interceptor';
import {
  createMockExecutionContext,
  createMockCallHandler,
  createMockCallHandlerWithError,
  createMockUserPayload,
} from '../../test-utils/mock-factory';
import { lastValueFrom } from 'rxjs';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
  });

  it('should log request method, URL, status, and duration on success', async () => {
    const context = createMockExecutionContext({
      method: 'GET',
      url: '/api/health',
      user: createMockUserPayload(),
    });
    const callHandler = createMockCallHandler({ data: 'ok' });

    const result$ = interceptor.intercept(context as any, callHandler as any);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ data: 'ok' });
    expect(callHandler.handle).toHaveBeenCalled();
  });

  it('should log error details on failure', async () => {
    const context = createMockExecutionContext({
      method: 'POST',
      url: '/api/loan/apply',
    });
    const error = new Error('Validation failed');
    const callHandler = createMockCallHandlerWithError(error);

    const result$ = interceptor.intercept(context as any, callHandler as any);

    await expect(lastValueFrom(result$)).rejects.toThrow('Validation failed');
  });

  it('should handle anonymous user (no request.user)', async () => {
    const context = createMockExecutionContext({ user: undefined });
    context.switchToHttp().getRequest.mockReturnValue({
      method: 'GET',
      url: '/api/public',
      headers: {},
      ip: '127.0.0.1',
      user: undefined,
    });
    const callHandler = createMockCallHandler({ data: 'public' });

    const result$ = interceptor.intercept(context as any, callHandler as any);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ data: 'public' });
  });
});
