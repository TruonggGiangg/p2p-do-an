import { HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: any;

  beforeEach(() => {
    filter = new AllExceptionsFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      method: 'POST',
      url: '/api/loan/apply',
      headers: { 'x-forwarded-for': '192.168.1.1', 'user-agent': 'Jest' },
      ip: '127.0.0.1',
      user: { _id: 'user-123' },
    };

    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    };
  });

  it('should return formatted error response for HttpException', () => {
    const exception = new HttpException('Bad Request', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Bad Request',
        path: '/api/loan/apply',
        method: 'POST',
      }),
    );
  });

  it('should return 500 for non-HttpException errors', () => {
    const exception = new Error('Database connection failed');

    filter.catch(exception, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      }),
    );
  });

  it('should hide message in production for 500 errors', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const exception = new Error('Sensitive internal error');
    filter.catch(exception, mockHost as any);

    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.message).toBe('Internal server error');

    process.env.NODE_ENV = originalEnv;
  });

  it('should show actual message in production for non-500 errors', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const exception = new HttpException('Validation failed', HttpStatus.BAD_REQUEST);
    filter.catch(exception, mockHost as any);

    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.message).toBe('Validation failed');

    process.env.NODE_ENV = originalEnv;
  });

  it('should extract structured data from HttpException response with code', () => {
    const exception = new HttpException(
      { message: 'Loan blocked', code: 'DEBT_GROUP_BLOCK', debtGroup: 3, statusCode: 403 },
      HttpStatus.FORBIDDEN,
    );

    filter.catch(exception, mockHost as any);

    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.data).toBeDefined();
    expect(jsonCall.data.code).toBe('DEBT_GROUP_BLOCK');
    expect(jsonCall.data.debtGroup).toBe(3);
  });

  it('should include timestamp in response', () => {
    const exception = new Error('test');
    filter.catch(exception, mockHost as any);

    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.timestamp).toBeDefined();
    expect(new Date(jsonCall.timestamp).getTime()).not.toBeNaN();
  });
});
