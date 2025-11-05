# ⚠️ Error Handling & Response Format

## 📋 Mục lục
1. [Global Exception Filter](#global-exception-filter)
2. [Response Interceptor](#response-interceptor)
3. [Error Status Codes](#error-status-codes)
4. [Error Response Format](#error-response-format)
5. [Success Response Format](#success-response-format)
6. [Custom Decorators](#custom-decorators)

---

## 🌐 Global Exception Filter

### Purpose
Catch ALL exceptions from any endpoint and return standardized error response

### File Location
```
src/common/filter/all-exceptions.filter.ts
```

### Implementation
```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, BadRequestException, UnauthorizedException, ForbiddenException, NotFoundException, ConflictException, InternalServerErrorException, Logger } from '@nestjs/common';

@Catch()  // Catch ALL exceptions
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const path = request.url;
    const timestamp = new Date().toISOString();

    let statusCode = 500;
    let message = 'Internal Server Error';
    let error = 'Internal Server Error';
    let validationErrors: string[] = [];

    // Handle HttpException
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        const { message: msg, error: err, validationErrors: ve } = exceptionResponse as any;
        message = msg || message;
        error = err || error;
        validationErrors = ve || [];
      }
    } else {
      // Handle unknown errors
      this.logger.error('Unhandled exception', exception);
    }

    // Log based on status
    if (statusCode >= 500) {
      this.logger.error(`${statusCode} - ${message}`);
    } else {
      this.logger.warn(`${statusCode} - ${message}`);
    }

    // Send error response
    response.status(statusCode).json({
      statusCode,
      message,
      error,
      validationErrors,
      timestamp,
      path,
    });
  }
}
```

### Registration
```typescript
// app.module.ts
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filter/all-exceptions.filter';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
```

### Features
✅ Catches all exception types  
✅ Standardizes error format  
✅ Logs appropriately (ERROR for 5xx, WARN for 4xx)  
✅ Extracts validation errors  
✅ Returns HTTP status codes  

---

## 📤 Response Interceptor

### Purpose
Standardize ALL successful responses before sending to client

### File Location
```
src/common/interceptor/response.interceptor.ts
```

### Implementation
```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';

export const RESPONSE_MESSAGE = 'response_message';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const response = context.switchToHttp().getResponse();
    const request = context.getRequest();
    const path = request.url;
    const timestamp = new Date().toISOString();

    return next.handle().pipe(
      map((data) => {
        // Get custom message from @ResponseMessage decorator
        const message = this.reflector.get<string>(
          RESPONSE_MESSAGE,
          context.getHandler(),
        );

        // If data already has statusCode, return as-is (from filter)
        if (data && typeof data === 'object' && 'statusCode' in data) {
          return data;
        }

        // Wrap response with standard format
        const statusCode = response.statusCode || 200;
        return {
          statusCode,
          message: message || 'Success',
          data,
          timestamp,
          path,
        };
      }),
    );
  }
}
```

### Registration
```typescript
// app.module.ts
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ResponseInterceptor } from './common/interceptor/response.interceptor';

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class AppModule {}
```

### Features
✅ Wraps all responses  
✅ Uses @ResponseMessage decorator  
✅ Adds timestamp and path  
✅ Standardizes format  
✅ Skips if already formatted  

---

## 📊 Error Status Codes

| Code | Error | When | Example |
|------|-------|------|---------|
| 400 | Bad Request | Invalid input, validation failed | Empty phone, short password |
| 401 | Unauthorized | Auth failed, invalid token | Wrong credentials, expired token |
| 403 | Forbidden | Insufficient permissions | User not admin, wrong role |
| 404 | Not Found | Resource doesn't exist | User not found |
| 409 | Conflict | Resource already exists | Phone already registered |
| 500 | Internal Server Error | Server error, unhandled exception | Database error, SMS failure |

---

## 📥 Error Response Format

### Standard Error Response
```json
{
  "statusCode": 400,
  "message": "Số điện thoại không hợp lệ",
  "error": "Bad Request",
  "validationErrors": [],
  "timestamp": "2025-11-05T10:30:45.123Z",
  "path": "/auth/signup"
}
```

| Field | Type | Always | Description |
|-------|------|--------|-------------|
| `statusCode` | number | ✅ | HTTP status code |
| `message` | string | ✅ | Error description (Vietnamese) |
| `error` | string | ✅ | Error type/name |
| `validationErrors` | string[] | ✅ | Validation error details |
| `timestamp` | string | ✅ | ISO timestamp |
| `path` | string | ✅ | Request path |

### With Validation Errors
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "validationErrors": [
    "phone should not be empty",
    "phone must be a string"
  ],
  "timestamp": "2025-11-05T10:30:45.123Z",
  "path": "/auth/signin"
}
```

### Common Error Examples

**Invalid Phone**
```json
{
  "statusCode": 400,
  "message": "Số điện thoại không hợp lệ",
  "error": "Bad Request"
}
```

**Already Registered**
```json
{
  "statusCode": 400,
  "message": "Số điện thoại đã được đăng ký",
  "error": "Bad Request"
}
```

**Wrong Credentials**
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

**Insufficient Role**
```json
{
  "statusCode": 403,
  "message": "Forbidden",
  "error": "Forbidden"
}
```

**No User Found**
```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found"
}
```

**OTP Already Used**
```json
{
  "statusCode": 409,
  "message": "OTP already used or expired",
  "error": "Conflict"
}
```

**Server Error**
```json
{
  "statusCode": 500,
  "message": "Failed to send OTP",
  "error": "Internal Server Error"
}
```

---

## ✅ Success Response Format

### Standard Success Response
```json
{
  "statusCode": 200,
  "message": "Đăng nhập thành công",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "phone": "+84901234567",
    "role": "BORROWER"
  },
  "timestamp": "2025-11-05T10:30:45.123Z",
  "path": "/auth/signin"
}
```

| Field | Type | Always | Description |
|-------|------|--------|-------------|
| `statusCode` | number | ✅ | HTTP status code (200-299) |
| `message` | string | ✅ | Success message (Vietnamese) |
| `data` | any | ✅ | Response data (can be null) |
| `timestamp` | string | ✅ | ISO timestamp |
| `path` | string | ✅ | Request path |

### With Extra Fields (from endpoint)
Some endpoints return extra fields alongside `data`:

**Signin Success**
```json
{
  "statusCode": 200,
  "message": "Đăng nhập thành công",
  "data": { "user": {...} },
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "timestamp": "...",
  "path": "..."
}
```

**Confirm Success**
```json
{
  "statusCode": 200,
  "message": "Đăng ký tài khoản thành công",
  "data": { "user": {...} },
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "timestamp": "...",
  "path": "..."
}
```

### Null Data
```json
{
  "statusCode": 200,
  "message": "Đăng xuất thành công",
  "data": null,
  "timestamp": "...",
  "path": "..."
}
```

---

## 🎯 Custom Decorators

### @ResponseMessage()

Sets custom message for endpoint

```typescript
import { SetMetadata } from '@nestjs/common';
import { RESPONSE_MESSAGE } from './response.interceptor';

export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE, message);
```

### Usage

```typescript
@Post('/signin')
@ResponseMessage('Đăng nhập thành công')
async signin(@Body() body) {
  return { user, tokens };
  // Response will have: message: "Đăng nhập thành công"
}

@Get('/me')
@ResponseMessage('Lấy thông tin người dùng hiện tại')
getMe(@User() user) {
  return user;
  // Response will have: message: "Lấy thông tin người dùng hiện tại"
}
```

### Available Messages (Auth Module)

| Endpoint | Message |
|----------|---------|
| POST /auth/signup | "Gửi mã xác thực thành công" |
| POST /auth/confirm | "Đăng ký tài khoản thành công" |
| POST /auth/signin | "Đăng nhập thành công" |
| GET /auth/me | "Lấy thông tin người dùng hiện tại" |
| POST /auth/refresh | "Làm mới token thành công" |
| DELETE /auth/signout | "Đăng xuất thành công" |

---

## 🧪 Error Handling Examples

### Example 1: Validation Error

```typescript
@Post('/signup')
@ResponseMessage('Gửi mã xác thực thành công')
async signup(@Body() body: { phone: string }) {
  try {
    // Empty phone validation happens in pipe
    // AllExceptionsFilter catches it
    return await this.authService.signup(body.phone);
  } catch (error) {
    throw new BadRequestException('Số điện thoại không hợp lệ');
  }
}

// Request with empty phone:
// POST /auth/signup
// Body: {}

// Response:
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "validationErrors": ["phone should not be empty"],
  "timestamp": "...",
  "path": "/auth/signup"
}
```

### Example 2: Business Logic Error

```typescript
@Post('/confirm')
@ResponseMessage('Đăng ký tài khoản thành công')
async confirm(@Body() body) {
  try {
    if (body.password.length < 6) {
      throw new BadRequestException('Mật khẩu phải có ít nhất 6 ký tự');
    }
    return await this.authService.confirm(body);
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new InternalServerErrorException('Đăng ký thất bại');
  }
}

// Response:
{
  "statusCode": 400,
  "message": "Mật khẩu phải có ít nhất 6 ký tự",
  "error": "Bad Request",
  "timestamp": "...",
  "path": "/auth/confirm"
}
```

### Example 3: Auth Guard Error

```typescript
@Get('/me')
@UseGuards(JwtAuthGuard)  // Throws 401 if invalid
getMe(@User() user) {
  return user;
}

// Request without token:
// GET /auth/me

// Response:
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized",
  "timestamp": "...",
  "path": "/auth/me"
}
```

### Example 4: Role Guard Error

```typescript
@Get('/test-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
testAdmin() {
  return { message: 'Admin access' };
}

// Request as BORROWER:
// GET /auth/test-admin
// Authorization: Bearer {borrowerToken}

// Response:
{
  "statusCode": 403,
  "message": "Forbidden",
  "error": "Forbidden",
  "timestamp": "...",
  "path": "/auth/test-admin"
}
```

---

## 📝 Error Handling Checklist

### When Creating Endpoint

- [ ] Add `@ResponseMessage()` decorator
- [ ] Wrap business logic in try-catch
- [ ] Throw appropriate HttpException (400/401/403/409/500)
- [ ] Include Vietnamese error message
- [ ] Validate input parameters
- [ ] Check resource existence
- [ ] Handle external service failures

### When Creating Service Method

- [ ] Validate all inputs
- [ ] Handle errors from dependencies
- [ ] Throw specific exceptions
- [ ] Log errors appropriately
- [ ] Don't expose sensitive info

### When Creating Guard/Middleware

- [ ] Throw appropriate 401/403
- [ ] Include descriptive message
- [ ] Don't leak security info

---

**Last Updated**: 2025-11-05
