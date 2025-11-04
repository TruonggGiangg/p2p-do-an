# 📚 Auth Module Documentation Index

## 📖 Complete Documentation Set

Tài liệu hoàn chỉnh về Auth Module với 6 file chi tiết:

---

## 1️⃣ **Tổng quan Module** 
📄 [`AUTH_MODULE_OVERVIEW.md`](./AUTH_MODULE_OVERVIEW.md)

**Nội dung**:
- Kiến trúc module (file structure)
- Các thành phần chính
- Flow xác thực (signup → confirm → signin → refresh → signout)
- Cấu hình environment variables
- API endpoints overview
- Error handling strategy

**🎯 Dành cho**: Team lead, architect, review code

---

## 2️⃣ **API Endpoints - Chi tiết**
📄 [`AUTH_API_ENDPOINTS.md`](./AUTH_API_ENDPOINTS.md)

**Nội dung**:
- 6 endpoints chính (signup, confirm, signin, me, refresh, signout)
- 4 test endpoints (role-based)
- Chi tiết từng endpoint:
  - Request format
  - Parameters
  - Success/error responses
  - Business logic
  - Notes & tips

**🎯 Dành cho**: Frontend developer, API integration, Postman testing

---

## 3️⃣ **JWT Token Management**
📄 [`AUTH_JWT_TOKENS.md`](./AUTH_JWT_TOKENS.md)

**Nội dung**:
- Access token (1 day, JWT_SECRET)
- Refresh token (7 days, JWT_REFRESH_SECRET)
- Token lifecycle (signup → use → refresh → signout)
- Token payload structure
- Token verification mechanism
- Common issues & solutions
- Security best practices

**⚠️ Important**:
- Access token & Refresh token dùng **SECRET KHÁC**
- Khi tạo refresh token **PHẢI** dùng JWT_REFRESH_SECRET
- Khi verify refresh token **PHẢI** verify với JWT_REFRESH_SECRET

**🎯 Dành cho**: Backend developer, token debugging, security review

---

## 4️⃣ **OTP System**
📄 [`AUTH_OTP_SYSTEM.md`](./AUTH_OTP_SYSTEM.md)

**Nội dung**:
- OTP generation (6-digit code)
- In-memory storage
- OTP verification (6 steps)
- Expiration & cleanup
- Configuration (OTP_ENABLED, OTP_EXPIRE_MINUTES)
- Security features
- Lifecycle examples
- Testing OTP

**Features**:
- ✅ 5 phút expiration
- ✅ Max 5 attempts
- ✅ Auto-cleanup
- ✅ Test mode: always "000000"
- ✅ SMS integration (Twilio)

**🎯 Dành cho**: Backend developer, SMS integration, testing

---

## 5️⃣ **Error Handling & Response Format**
📄 [`AUTH_ERROR_HANDLING.md`](./AUTH_ERROR_HANDLING.md)

**Nội dung**:
- Global Exception Filter (catch all errors)
- Response Interceptor (standardize responses)
- HTTP status codes (400, 401, 403, 409, 500)
- Error response format
- Success response format
- Custom decorators (@ResponseMessage)
- Error handling examples
- Checklist

**Response Format**:
```json
{
  "statusCode": 200,
  "message": "Đăng nhập thành công",
  "data": {...},
  "timestamp": "...",
  "path": "/auth/signin"
}
```

**🎯 Dành cho**: Frontend developer, API integration, error debugging

---

## 6️⃣ **Guards & Decorators**
📄 [`AUTH_GUARDS_DECORATORS.md`](./AUTH_GUARDS_DECORATORS.md)

**Nội dung**:
- Guard overview & execution order
- JwtAuthGuard (token validation)
- LocalAuthGuard (username/password)
- RolesGuard (role-based access)
- CombinedAuthGuard (multiple strategies)
- Decorators:
  - @Public() (skip auth)
  - @Roles() (require role)
  - @User() (extract user)
  - @ResponseMessage() (custom message)
- Usage examples
- Guard combinations

**🎯 Dành cho**: Backend developer, security implementation

---

## 🚀 Quick Start Guide

### 1. **Tìm kiếm thông tin nhanh**

| Cần tìm gì | File | Section |
|-----------|------|---------|
| Cách dùng endpoint | API_ENDPOINTS | Signup/Confirm/Signin |
| Token lỗi "invalid signature" | JWT_TOKENS | Common Issues |
| OTP không hoạt động | OTP_SYSTEM | Configuration |
| Response format sai | ERROR_HANDLING | Response Format |
| Endpoint access denied | GUARDS_DECORATORS | Usage Examples |
| Toàn bộ kiến trúc | OVERVIEW | Architecture |

### 2. **Workflow theo role**

**Frontend Developer**:
1. Read: API_ENDPOINTS.md
2. Reference: ERROR_HANDLING.md (response format)
3. Test: Use Postman guide

**Backend Developer**:
1. Read: OVERVIEW.md (start here)
2. Deep dive: JWT_TOKENS.md + OTP_SYSTEM.md
3. Reference: GUARDS_DECORATORS.md + ERROR_HANDLING.md

**DevOps/QA**:
1. Read: API_ENDPOINTS.md
2. Reference: OTP_SYSTEM.md (test mode)
3. Check: ERROR_HANDLING.md (error cases)

---

## 🔧 Configuration Reference

```env
# JWT Access Token
JWT_SECRET = JUSTSECRET
JWT_EXPIRE = 1d

# JWT Refresh Token (KHÁC!)
JWT_REFRESH_SECRET = REFRESHSECRET
JWT_REFRESH_EXPIRE = 7d

# OTP
OTP_ENABLED = false (test) / true (prod)
OTP_EXPIRE_MINUTES = 5

# SMS
TWILIO_ACCOUNT_SID = ...
TWILIO_AUTH_TOKEN = ...
TWILIO_PHONE_NUMBER = +84...

# Google OAuth
GOOGLE_CLIENT_ID = ...
GOOGLE_CLIENT_SECRET = ...
GOOGLE_CALLBACK_URL = http://localhost:8080/google/redirect
```

---

## ✅ Endpoint Checklist

### Public Endpoints (No Auth)
- [ ] `POST /auth/signup` - Generate OTP
- [ ] `POST /auth/confirm` - Verify OTP & register
- [ ] `POST /auth/signin` - Login
- [ ] `GET /auth/google` - Google OAuth start
- [ ] `GET /auth/google/redirect` - Google OAuth callback

### Protected Endpoints (JWT Required)
- [ ] `GET /auth/me` - Get user info
- [ ] `POST /auth/refresh` - Refresh token
- [ ] `DELETE /auth/signout` - Logout

### Role-based Test Endpoints
- [ ] `GET /auth/test-admin` - Admin only
- [ ] `GET /auth/test-lender` - Lender only
- [ ] `GET /auth/test-borrower` - Borrower only
- [ ] `GET /auth/test-both-roles` - Lender + Borrower

---

## 🔐 Security Checklist

- [ ] JWT_SECRET ≠ JWT_REFRESH_SECRET
- [ ] Refresh token signed with JWT_REFRESH_SECRET
- [ ] Refresh token verified with JWT_REFRESH_SECRET
- [ ] OTP expires after 5 minutes
- [ ] Max 5 OTP attempts
- [ ] Password hashed with bcrypt
- [ ] Refresh token stored in HttpOnly cookie
- [ ] Tokens not logged/exposed
- [ ] Error messages don't leak info

---

## 🧪 Testing Checklist

- [ ] Signup with valid phone
- [ ] Signup with invalid phone (error)
- [ ] Signup with duplicate phone (error)
- [ ] Confirm with correct OTP
- [ ] Confirm with wrong OTP (error)
- [ ] Confirm with expired OTP (error)
- [ ] Signin with correct credentials
- [ ] Signin with wrong credentials (error)
- [ ] Get Me with valid token
- [ ] Get Me without token (error)
- [ ] Refresh with valid token
- [ ] Refresh with expired token (error)
- [ ] Signout and verify token invalid
- [ ] Test role-based endpoints
- [ ] Verify response format on all endpoints
- [ ] Verify error responses consistent

---

## 📞 Common Issues & Solutions

### Issue: "Invalid signature" on refresh token
**File**: JWT_TOKENS.md → Common Issues → Issue 1

### Issue: OTP always "000000" in test
**File**: OTP_SYSTEM.md → Test Mode

### Issue: Response format different
**File**: ERROR_HANDLING.md → Response Format

### Issue: Endpoint returns 403
**File**: GUARDS_DECORATORS.md → Example 3

### Issue: Token missing from response
**File**: API_ENDPOINTS.md → Response Success

---

## 📊 File Dependencies

```
OVERVIEW.md (start here)
├── API_ENDPOINTS.md (how to use)
├── JWT_TOKENS.md (token details)
├── OTP_SYSTEM.md (OTP logic)
├── ERROR_HANDLING.md (error format)
└── GUARDS_DECORATORS.md (security)
```

---

## 🎯 Documentation Statistics

| File | Lines | Sections | Examples |
|------|-------|----------|----------|
| OVERVIEW | 200+ | 6 | 3 |
| API_ENDPOINTS | 800+ | 7 | 30+ |
| JWT_TOKENS | 400+ | 8 | 10+ |
| OTP_SYSTEM | 400+ | 7 | 15+ |
| ERROR_HANDLING | 500+ | 6 | 20+ |
| GUARDS_DECORATORS | 500+ | 7 | 25+ |
| **TOTAL** | **2,800+** | **40+** | **100+** |

---

## 🔄 Update Frequency

- **Last Updated**: 2025-11-05
- **Next Review**: After major feature change
- **Maintenance**: Update when API changes

---

## 👥 Contact

- **Auth Module Owner**: Backend Team
- **Questions**: Check relevant file first
- **Updates**: Edit markdown files directly
- **Review**: Create pull request before merge

---

## 📝 Document Versions

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-05 | Initial documentation |
| 1.1 | - | Fixed JWT refresh token secret issue |
| 1.2 | - | Added error handling guide |

---

**Happy Coding! 🚀**
