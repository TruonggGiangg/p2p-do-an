# 🔌 Auth API Endpoints - Chi tiết

## 📋 Mục lục
1. [Signup - Gửi OTP](#signup---gửi-otp)
2. [Confirm - Verify OTP & Đăng ký](#confirm---verify-otp--đăng-ký)
3. [Signin - Đăng nhập](#signin---đăng-nhập)
4. [Get Me - Thông tin user](#get-me---thông-tin-user)
5. [Refresh - Làm mới token](#refresh---làm-mới-token)
6. [Signout - Đăng xuất](#signout---đăng-xuất)
7. [Test Endpoints](#test-endpoints)

---

## 1. Signup - Gửi OTP

### Request
```http
POST /auth/signup
Content-Type: application/json

{
  "phone": "+84901234567"
}
```

### Parameters
| Param | Type | Required | Constraints |
|-------|------|----------|-------------|
| `phone` | string | ✅ | Định dạng: +84xxxxxxxxx hoặc 0xxxxxxxxx |

### Response Success (200)
```json
{
  "statusCode": 200,
  "message": "Gửi mã xác thực thành công",
  "data": {
    "phone": "+84901234567",
    "message": "Mã xác thực đã được gửi"
  },
  "timestamp": "2025-11-05T10:30:45.123Z",
  "path": "/auth/signup"
}
```

### Response Errors

**400 Bad Request** - Invalid phone format
```json
{
  "statusCode": 400,
  "message": "Số điện thoại không hợp lệ",
  "error": "Bad Request",
  "timestamp": "2025-11-05T10:30:45.123Z",
  "path": "/auth/signup"
}
```

**400 Bad Request** - Phone already registered
```json
{
  "statusCode": 400,
  "message": "Số điện thoại đã được đăng ký",
  "error": "Bad Request",
  "timestamp": "2025-11-05T10:30:45.123Z",
  "path": "/auth/signup"
}
```

**500 Internal Server Error** - SMS sending failed
```json
{
  "statusCode": 500,
  "message": "Gửi SMS thất bại",
  "error": "Internal Server Error",
  "timestamp": "2025-11-05T10:30:45.123Z",
  "path": "/auth/signup"
}
```

### Logic Chi tiết
```
1. Normalize phone: "0901234567" → "+84901234567"
2. Validate format: regex /^\+84[0-9]{9}$/
3. Check if user exists by phone
4. If exists: throw BadRequestException
5. Generate 6-digit OTP code
6. Store OTP in memory with 5-min expiration
7. If OTP_ENABLED=true:
   - Send OTP via Twilio SMS
   - If SMS fails: throw InternalServerErrorException
8. Return success response
```

### Notes
- OTP code trong test mode: `000000`
- OTP có hiệu lực: 5 phút
- Max 5 lần thử sai
- SMS chỉ gửi khi `OTP_ENABLED=true`

---

## 2. Confirm - Verify OTP & Đăng ký

### Request
```http
POST /auth/confirm
Content-Type: application/json

{
  "phone": "+84901234567",
  "code": "000000",
  "password": "MyPassword123",
  "category": "borrower",
  "fullName": "Nguyễn Văn A",
  "dateOfBirth": "2000-01-15",
  "gender": "male",
  "address": "123 Đường ABC",
  "city": "Hà Nội",
  "ssn": "123456789",
  "job": "Engineer",
  "income": 50000000,
  "identificationNumber": "012345678901",
  "issuedAt": "2020-01-01",
  "issuedBy": "Hà Nội"
}
```

### Parameters
| Param | Type | Required | Constraints |
|-------|------|----------|-------------|
| `phone` | string | ✅ | Phải match signup |
| `code` | string | ✅ | 6 digits, chưa hết hạn |
| `password` | string | ✅ | Min 6 characters |
| `category` | string | ✅ | "borrower" hoặc "lender" |
| `fullName` | string | ✅ | Tên đầy đủ |
| `dateOfBirth` | string | ✅ | Format YYYY-MM-DD |
| `gender` | string | ✅ | "male", "female", "other" |
| `address` | string | ❌ | Địa chỉ |
| `city` | string | ❌ | Thành phố |
| `ssn` | string | ❌ | Social security number |
| `job` | string | ❌ | Công việc |
| `income` | number | ❌ | Thu nhập |
| `identificationNumber` | string | ❌ | CMND/CCCD |
| `issuedAt` | string | ❌ | Ngày cấp |
| `issuedBy` | string | ❌ | Nơi cấp |

### Response Success (200)
```json
{
  "statusCode": 200,
  "message": "Đăng ký tài khoản thành công",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "phone": "+84901234567",
    "email": "84901234567@p2p.local",
    "category": "borrower",
    "role": "BORROWER",
    "detail": {
      "declared": true,
      "fullName": "Nguyễn Văn A",
      "dateOfBirth": "2000-01-15",
      "gender": "male",
      "address": "123 Đường ABC",
      "city": "Hà Nội"
    }
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "timestamp": "2025-11-05T10:31:00.000Z",
  "path": "/auth/confirm"
}
```

### Response Errors

**400 Bad Request** - Wrong OTP or expired
```json
{
  "statusCode": 400,
  "message": "Mã xác thực không đúng hoặc đã hết hạn",
  "error": "Bad Request",
  "timestamp": "2025-11-05T10:31:00.000Z",
  "path": "/auth/confirm"
}
```

**400 Bad Request** - Password too short
```json
{
  "statusCode": 400,
  "message": "Mật khẩu phải có ít nhất 6 ký tự",
  "error": "Bad Request",
  "timestamp": "2025-11-05T10:31:00.000Z",
  "path": "/auth/confirm"
}
```

**400 Bad Request** - Missing required fields
```json
{
  "statusCode": 400,
  "message": "Vui lòng điền đầy đủ thông tin bắt buộc",
  "error": "Bad Request",
  "timestamp": "2025-11-05T10:31:00.000Z",
  "path": "/auth/confirm"
}
```

**400 Bad Request** - Account already exists
```json
{
  "statusCode": 400,
  "message": "Tài khoản đã tồn tại",
  "error": "Bad Request",
  "timestamp": "2025-11-05T10:31:00.000Z",
  "path": "/auth/confirm"
}
```

### Logic Chi tiết
```
1. Verify OTP code:
   - Get OTP from memory
   - Check if code matches
   - Check if not expired
   - Check attempt count < 5
   
2. Validate password:
   - Length >= 6 characters
   
3. Validate required fields:
   - fullName, dateOfBirth, gender
   
4. Check if user already exists
   - By phone or email
   
5. Create user:
   - Hash password using bcrypt
   - Set email: "{phone}@p2p.local"
   - Set role based on category:
     * "borrower" → "BORROWER"
     * "lender" → "LENDER"
   - Save detail info
   
6. Generate tokens:
   - accessToken (1 day, JWT_SECRET)
   - refreshToken (7 days, JWT_REFRESH_SECRET)
   - Save refreshToken to DB
   
7. Return user + tokens
```

### Notes
- Test OTP code: `000000`
- OTP auto cleanup after 5 minutes
- Password will be hashed with bcrypt salt rounds: 10
- Email generated automatically from phone
- Role auto-assigned from category

---

## 3. Signin - Đăng nhập

### Request
```http
POST /auth/signin
Content-Type: application/json

{
  "username": "84901234567@p2p.local",
  "password": "MyPassword123"
}
```

### Parameters
| Param | Type | Required | Constraints |
|-------|------|----------|-------------|
| `username` | string | ✅ | Email or phone |
| `password` | string | ✅ | Min 6 characters |

### Response Success (200)
```json
{
  "statusCode": 200,
  "message": "Đăng nhập thành công",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "phone": "+84901234567",
    "email": "84901234567@p2p.local",
    "category": "borrower",
    "role": "BORROWER",
    "detail": {
      "declared": true,
      "fullName": "Nguyễn Văn A"
    }
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "timestamp": "2025-11-05T10:32:00.000Z",
  "path": "/auth/signin"
}
```

**Cookie set automatically**:
```
Set-Cookie: refreshToken={refreshToken}; HttpOnly; Path=/; Max-Age=604800
```

### Response Errors

**401 Unauthorized** - Invalid credentials
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized",
  "timestamp": "2025-11-05T10:32:00.000Z",
  "path": "/auth/signin"
}
```

**400 Bad Request** - Missing fields
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "validationErrors": [
    "password should not be empty",
    "password must be a string"
  ],
  "timestamp": "2025-11-05T10:32:00.000Z",
  "path": "/auth/signin"
}
```

### Logic Chi tiết
```
1. LocalAuthGuard validates:
   - Username exists (email or phone)
   - Password matches (bcrypt compare)
   
2. If invalid: return 401
   
3. If valid:
   - Create accessToken (1 day)
   - Create refreshToken (7 days)
   - Save refreshToken to DB
   - Set refreshToken cookie
   - Return user + tokens
```

### Notes
- Guard: `LocalAuthGuard` + Passport `LocalStrategy`
- Password never returned in response
- refreshToken saved to DB for validation later
- refreshToken also set as HttpOnly cookie

---

## 4. Get Me - Thông tin user

### Request
```http
GET /auth/me
Authorization: Bearer {accessToken}
```

### Headers
| Header | Required | Format |
|--------|----------|--------|
| `Authorization` | ✅ | `Bearer {accessToken}` |

### Response Success (200)
```json
{
  "statusCode": 200,
  "message": "Lấy thông tin người dùng hiện tại",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Nguyễn Văn A",
    "email": "84901234567@p2p.local",
    "phone": "+84901234567",
    "role": "BORROWER",
    "category": "borrower",
    "profile": {
      "fullName": "Nguyễn Văn A",
      "dateOfBirth": "2000-01-15",
      "gender": "male",
      "address": "123 Đường ABC",
      "city": "Hà Nội"
    }
  },
  "timestamp": "2025-11-05T10:33:00.000Z",
  "path": "/auth/me"
}
```

### Response Errors

**401 Unauthorized** - No token
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized",
  "timestamp": "2025-11-05T10:33:00.000Z",
  "path": "/auth/me"
}
```

**401 Unauthorized** - Invalid/expired token
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized",
  "timestamp": "2025-11-05T10:33:00.000Z",
  "path": "/auth/me"
}
```

### Logic Chi tiết
```
1. JwtAuthGuard validates token:
   - Extract token from Authorization header
   - Verify JWT signature (JWT_SECRET)
   - Check if expired
   - Extract user info
   
2. Get user from DB by _id
   
3. Return full user profile
```

### Notes
- Guard: `JwtAuthGuard`
- Token extracted from `Authorization: Bearer {token}`
- User info fetched fresh from DB
- Password never returned

---

## 5. Refresh - Làm mới token

### Request
```http
POST /auth/refresh
Content-Type: application/json
Cookie: refreshToken={refreshToken}

{}
```

### Headers & Cookies
| Name | Required | Source |
|------|----------|--------|
| `refreshToken` | ✅ | Cookie from signin/confirm |

### Response Success (200)
```json
{
  "statusCode": 200,
  "message": "Làm mới token thành công",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "_id": "507f1f77bcf86cd799439011",
    "email": "84901234567@p2p.local",
    "role": "BORROWER",
    "name": "Nguyễn Văn A"
  },
  "timestamp": "2025-11-05T10:34:00.000Z",
  "path": "/auth/refresh"
}
```

**New refreshToken also set in cookie**:
```
Set-Cookie: refreshToken={newRefreshToken}; HttpOnly; Path=/; Max-Age=604800
```

### Response Errors

**401 Unauthorized** - No refresh token in cookie
```json
{
  "statusCode": 401,
  "message": "Token không tồn tại",
  "error": "Unauthorized",
  "timestamp": "2025-11-05T10:34:00.000Z",
  "path": "/auth/refresh"
}
```

**401 Unauthorized** - Invalid/expired refresh token
```json
{
  "statusCode": 401,
  "message": "Token không hợp lệ",
  "error": "Unauthorized",
  "timestamp": "2025-11-05T10:34:00.000Z",
  "path": "/auth/refresh"
}
```

### Logic Chi tiết
```
1. Get refreshToken from cookie
   
2. Verify refreshToken:
   - Check JWT signature (JWT_REFRESH_SECRET)
   - Check if expired
   - Extract user info
   
3. Check if token exists in DB:
   - Must match user's stored token
   
4. Create new tokens:
   - New accessToken (1 day, JWT_SECRET)
   - New refreshToken (7 days, JWT_REFRESH_SECRET)
   
5. Update DB:
   - Save new refreshToken
   - Set new refreshToken cookie
   
6. Return new accessToken + user info
```

### Important Notes
⚠️ **Token Signing Secrets**:
- accessToken: `JWT_SECRET` (JUSTSECRET)
- refreshToken: `JWT_REFRESH_SECRET` (REFRESHSECRET) ← **DIFFERENT**

⚠️ **Token Refresh Flow**:
1. Get refreshToken from cookie (not Authorization header)
2. Verify with JWT_REFRESH_SECRET
3. Create new accessToken (with JWT_SECRET)
4. Create new refreshToken (with JWT_REFRESH_SECRET)
5. Update both: new cookie + DB

---

## 6. Signout - Đăng xuất

### Request
```http
DELETE /auth/signout
Authorization: Bearer {accessToken}

{}
```

### Headers
| Header | Required | Format |
|--------|----------|--------|
| `Authorization` | ✅ | `Bearer {accessToken}` |

### Response Success (200)
```json
{
  "statusCode": 200,
  "message": "Đăng xuất thành công",
  "data": null,
  "timestamp": "2025-11-05T10:35:00.000Z",
  "path": "/auth/signout"
}
```

**refreshToken cookie cleared**:
```
Set-Cookie: refreshToken=; HttpOnly; Path=/; Max-Age=0
```

### Response Errors

**401 Unauthorized** - No token
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized",
  "timestamp": "2025-11-05T10:35:00.000Z",
  "path": "/auth/signout"
}
```

### Logic Chi tiết
```
1. JwtAuthGuard validates accessToken
   
2. Clear refreshToken from DB:
   - Set refreshToken field to empty string
   
3. Clear refreshToken cookie:
   - Set Max-Age to 0 (immediate expiry)
   
4. Return success
```

### Notes
- Guard: `JwtAuthGuard`
- Removes ability to refresh access tokens
- Cookie automatically cleared by browser
- User must login again to get new tokens

---

## 7. Test Endpoints

### 7.1 Admin Test
```http
GET /auth/test-admin
Authorization: Bearer {adminAccessToken}
```

**Response** (200 if admin):
```json
{
  "statusCode": 200,
  "message": "Admin endpoint accessed",
  "data": {
    "message": "This is admin only endpoint",
    "userRole": "ADMIN",
    "userId": "..."
  }
}
```

**Response** (403 if not admin):
```json
{
  "statusCode": 403,
  "message": "Forbidden",
  "error": "Forbidden",
  "timestamp": "...",
  "path": "/auth/test-admin"
}
```

---

### 7.2 Lender Test
```http
GET /auth/test-lender
Authorization: Bearer {lenderAccessToken}
```

**Response** (200 if lender):
```json
{
  "statusCode": 200,
  "message": "Lender endpoint accessed",
  "data": {
    "message": "This is lender only endpoint",
    "userRole": "LENDER"
  }
}
```

---

### 7.3 Borrower Test
```http
GET /auth/test-borrower
Authorization: Bearer {borrowerAccessToken}
```

**Response** (200 if borrower):
```json
{
  "statusCode": 200,
  "message": "Borrower endpoint accessed",
  "data": {
    "message": "This is borrower only endpoint",
    "userRole": "BORROWER"
  }
}
```

---

### 7.4 Both Roles Test
```http
GET /auth/test-both-roles
Authorization: Bearer {lenderOrBorrowerToken}
```

**Response** (200 if lender or borrower):
```json
{
  "statusCode": 200,
  "message": "Both roles endpoint accessed",
  "data": {
    "message": "This endpoint allows lender or borrower"
  }
}
```

**Response** (403 if admin):
```json
{
  "statusCode": 403,
  "message": "Forbidden",
  "error": "Forbidden"
}
```

---

**Last Updated**: 2025-11-05
