# 🔐 Auth Module - Tổng quan

## 📋 Mục lục
1. [Kiến trúc Module](#kiến-trúc-module)
2. [Các thành phần chính](#các-thành-phần-chính)
3. [Flow xác thực](#flow-xác-thực)
4. [Cấu hình](#cấu-hình)
5. [API Endpoints](#api-endpoints)
6. [Error Handling](#error-handling)

---

## 🏗️ Kiến trúc Module

```
src/auth/
├── auth.module.ts          # Module config & DI
├── auth.controller.ts       # API endpoints
├── auth.service.ts          # Business logic
├── otp/
│   └── otp.service.ts       # OTP generation & verification
├── passport/
│   ├── jwt.strategy.ts      # JWT strategy
│   ├── local.strategy.ts    # Local (email/password) strategy
│   └── google.strategy.ts   # Google OAuth strategy
├── guards/
│   ├── jwt-auth.guard.ts    # JWT validation guard
│   ├── local-auth.guard.ts  # Local auth guard
│   ├── roles.guard.ts       # Role-based access control
│   └── combined-auth.guard.ts # Combine multiple guards
└── decorator/
    ├── roles.decorator.ts   # @Roles() decorator
    ├── public.decorator.ts  # @Public() decorator
    ├── user.decorator.ts    # @User() decorator
    └── response-message.decorator.ts # @ResponseMessage() decorator
```

---

## 🔧 Các thành phần chính

### 1. **AuthModule** (`auth.module.ts`)
```typescript
- JwtModule: Cấu hình JWT signing/verification
- PassportModule: Passport strategies
- UsersModule: Dependency for user operations
```

**Cấu hình JWT**:
```typescript
JwtModule.registerAsync({
  secret: JWT_SECRET (JUSTSECRET)
  expiresIn: JWT_EXPIRE (1d)
})
```

**Refresh Token Secret** (khác):
```
JWT_REFRESH_SECRET = REFRESHSECRET
JWT_REFRESH_EXPIRE = 7d
```

---

### 2. **AuthService** (`auth.service.ts`)
Xử lý tất cả business logic xác thực

**Các phương thức chính**:

| Phương thức | Chức năng |
|------------|---------|
| `validateUser()` | Verify email + password |
| `login()` | Tạo access/refresh tokens |
| `createRefreshToken()` | Ký refresh token với JWT_REFRESH_SECRET |
| `refreshToken()` | Verify refresh token & tạo mới access token |
| `logout()` | Xóa refresh token khỏi DB |
| `validateOAuthLogin()` | Xác thực Google OAuth |

---

### 3. **AuthController** (`auth.controller.ts`)
Xử lý API requests

**6 Endpoints chính**:
1. `POST /auth/signup` - Gửi OTP
2. `POST /auth/confirm` - Verify OTP & đăng ký
3. `POST /auth/signin` - Đăng nhập
4. `GET /auth/me` - Lấy thông tin user
5. `POST /auth/refresh` - Làm mới access token
6. `DELETE /auth/signout` - Đăng xuất

**4 Test Endpoints** (Role-based):
- `GET /auth/test-admin` - Admin only
- `GET /auth/test-lender` - Lender only
- `GET /auth/test-borrower` - Borrower only
- `GET /auth/test-both-roles` - Lender + Borrower

---

### 4. **OTP Service** (`otp/otp.service.ts`)
Quản lý One-Time Passwords

**Tính năng**:
- ✅ Generate 6-digit OTP code
- ✅ Lưu OTP với phone + expiration (5 phút)
- ✅ Verify OTP code
- ✅ Giới hạn 5 lần thử
- ✅ Auto cleanup hết hạn

**Config**:
```env
OTP_EXPIRE_MINUTES=5
OTP_ENABLED=false (test mode, không gửi SMS thực)
```

---

### 5. **Passport Strategies**

#### JWT Strategy (`passport/jwt.strategy.ts`)
- Trích `Authorization: Bearer {token}` header
- Verify JWT signature
- Inject user vào `req.user`

#### Local Strategy (`passport/local.strategy.ts`)
- Username: email hoặc phone normalized
- Password: hashed password
- Dùng cho endpoint `/auth/signin`

#### Google Strategy (`passport/google.strategy.ts`)
- OAuth 2.0 callback
- Tạo/update user nếu không tồn tại
- Trả về access + refresh token

---

### 6. **Guards & Decorators**

#### Guards
- **JwtAuthGuard**: Validate JWT access token
- **LocalAuthGuard**: Validate username/password
- **RolesGuard**: Check user role
- **CombinedAuthGuard**: Support nhiều auth methods

#### Decorators
- **@Public()**: Skip JWT validation
- **@Roles('admin', 'lender')**: Require specific roles
- **@User()**: Get current user từ request
- **@ResponseMessage()**: Set custom response message

---

## 🔄 Flow Xác thực

### Flow Đăng ký (Signup → Confirm)
```
┌─────────────────────────────────────────────┐
│ 1. POST /auth/signup                        │
│    Body: { phone: "+84901234567" }          │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│ 2. OTPService.generateOTP()                 │
│    - Tạo 6-digit code (test: 000000)        │
│    - Lưu vào in-memory map                  │
│    - TTL: 5 phút                            │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│ 3. SMSService.sendOTP()                     │
│    - Gửi SMS qua Twilio (nếu OTP_ENABLED)   │
│    - Nếu lỗi: BadRequestException           │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│ 4. Response 200                             │
│    { phone, message }                       │
└─────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│ 5. POST /auth/confirm                       │
│    Body: {                                  │
│      phone, code, password,                 │
│      fullName, dateOfBirth, gender, ...     │
│    }                                        │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│ 6. Validations                              │
│    - OTP code đúng & chưa hết hạn           │
│    - Password ≥ 6 ký tự                     │
│    - Required fields: fullName, gender, DOB │
│    - User chưa tồn tại                      │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│ 7. Create User                              │
│    - Hash password                          │
│    - Lưu profile info                       │
│    - Set role theo category                 │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│ 8. Generate Tokens                          │
│    - accessToken (1 ngày, JWT_SECRET)       │
│    - refreshToken (7 ngày, REFRESH_SECRET)  │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│ 9. Response 200                             │
│    {                                        │
│      user: {...},                           │
│      accessToken: "...",                    │
│      refreshToken: "..."                    │
│    }                                        │
│    Cookie: refreshToken=...                 │
└─────────────────────────────────────────────┘
```

### Flow Đăng nhập (Signin)
```
POST /auth/signin
├─ Body: { username, password }
├─ LocalAuthGuard validates
├─ Find user by email/phone
├─ Hash password check
├─ Create tokens
├─ Save refreshToken to DB
├─ Set cookie
└─ Response 200 with tokens
```

### Flow Refresh Token
```
POST /auth/refresh
├─ Get refreshToken from cookie
├─ Verify with JWT_REFRESH_SECRET
├─ Check token in DB
├─ Create new tokens
├─ Update DB & cookie
└─ Response 200 with new accessToken
```

### Flow Protected Resource
```
GET /auth/me
├─ Authorization: Bearer {accessToken}
├─ JwtAuthGuard validates signature
├─ Extract user từ token
├─ Fetch user từ DB
└─ Response 200 with user info
```

---

## ⚙️ Cấu hình

### Environment Variables
```env
# JWT Access Token
JWT_SECRET = JUSTSECRET
JWT_EXPIRE = 1d

# JWT Refresh Token (KHÁC secret)
JWT_REFRESH_SECRET = REFRESHSECRET
JWT_REFRESH_EXPIRE = 7d

# OTP
OTP_ENABLED = false (test mode)
OTP_EXPIRE_MINUTES = 5

# Google OAuth
GOOGLE_CLIENT_ID = ...
GOOGLE_CLIENT_SECRET = ...
GOOGLE_CALLBACK_URL = http://localhost:8080/google/redirect

# SMS - Twilio
TWILIO_ACCOUNT_SID = ...
TWILIO_AUTH_TOKEN = ...
TWILIO_PHONE_NUMBER = +84...
```

### Module Registration
```typescript
@Module({
  imports: [
    ConfigModule,
    PassportModule,
    UsersModule,
    JwtModule.registerAsync({
      secret: JWT_SECRET,
      expiresIn: JWT_EXPIRE,
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    JwtStrategy,
    LocalStrategy,
    GoogleStrategy,
  ],
})
```

---

## 🔌 API Endpoints

### Public Endpoints (không cần auth)
| Method | Endpoint | Mô tả |
|--------|----------|------|
| POST | `/auth/signup` | Gửi OTP |
| POST | `/auth/confirm` | Verify OTP & đăng ký |
| POST | `/auth/signin` | Đăng nhập |
| GET | `/auth/google` | Google OAuth redirect |
| GET | `/auth/google/redirect` | Google OAuth callback |

### Protected Endpoints (cần JWT)
| Method | Endpoint | Role | Mô tả |
|--------|----------|------|------|
| GET | `/auth/me` | Any | User info |
| POST | `/auth/refresh` | Any | Làm mới token |
| DELETE | `/auth/signout` | Any | Đăng xuất |
| GET | `/auth/test-admin` | ADMIN | Test admin access |
| GET | `/auth/test-lender` | LENDER | Test lender access |
| GET | `/auth/test-borrower` | BORROWER | Test borrower access |
| GET | `/auth/test-both-roles` | LENDER/BORROWER | Test multiple roles |

---

## ⚠️ Error Handling

### Global Exception Filter
- Catches tất cả exceptions
- Log errors appropriately (ERROR for 5xx, WARN for 4xx)
- Return standardized error format
- Mask sensitive info

### Response Format
```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "Bad Request",
  "validationErrors": [],
  "timestamp": "ISO string",
  "path": "/auth/endpoint"
}
```

### Common Errors
- **400 Bad Request**: Validation failed
- **401 Unauthorized**: Invalid credentials/token
- **403 Forbidden**: Insufficient role
- **409 Conflict**: Resource already exists
- **500 Internal Server Error**: Server error

---

## 📚 Tài liệu chi tiết
- [API Endpoints](./AUTH_API_ENDPOINTS.md)
- [JWT Token Management](./AUTH_JWT_TOKENS.md)
- [OTP System](./AUTH_OTP_SYSTEM.md)
- [Error Handling](./AUTH_ERROR_HANDLING.md)
- [Guards & Decorators](./AUTH_GUARDS_DECORATORS.md)
- [Passport Strategies](./AUTH_PASSPORT_STRATEGIES.md)
- [Response Format](./AUTH_RESPONSE_FORMAT.md)

---

**Last Updated**: 2025-11-05
