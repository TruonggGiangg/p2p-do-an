# 🔑 JWT Token Management - Chi tiết

## 📋 Mục lục
1. [Access Token](#access-token)
2. [Refresh Token](#refresh-token)
3. [Token Lifecycle](#token-lifecycle)
4. [Token Payload](#token-payload)
5. [Token Verification](#token-verification)
6. [Common Issues](#common-issues)

---

## 🎫 Access Token

### Cấu hình
```env
JWT_SECRET = JUSTSECRET
JWT_EXPIRE = 1d
```

### Tính chất
- **Lifetime**: 1 ngày (24 giờ)
- **Secret**: `JWT_SECRET` (JUSTSECRET)
- **Dùng cho**: Accessing protected resources
- **Storage**: Client side (header)
- **Header**: `Authorization: Bearer {accessToken}`

### Payload
```json
{
  "email": "user@example.com",
  "_id": "507f1f77bcf86cd799439011",
  "role": "BORROWER",
  "name": "Nguyễn Văn A",
  "iat": 1631234567,
  "exp": 1631320967
}
```

### Lifecycle
```
LOGIN/CONFIRM
     │
     ▼
CREATE: Sign with JWT_SECRET, expires in 1 day
     │
     ▼
CLIENT: Store in Authorization header
     │
     ├─ Valid (< 1 day) → Use normally
     │
     ├─ Expired (> 1 day) → Need refresh
     │
     └─ Invalid → Logout & re-login
```

### Usage
```typescript
// Create
const accessToken = this.jwtService.sign(payload);
// payload automatically gets iat + exp (1d)

// Verify
const decoded = this.jwtService.verify(accessToken);
// Returns payload if valid, throws if invalid/expired

// Decode without verify (unsafe)
const decoded = this.jwtService.decode(accessToken);
```

---

## 🔄 Refresh Token

### Cấu hình
```env
JWT_REFRESH_SECRET = REFRESHSECRET
JWT_REFRESH_EXPIRE = 7d
```

### Tính chất
- **Lifetime**: 7 ngày
- **Secret**: `JWT_REFRESH_SECRET` (REFRESHSECRET) ← **DIFFERENT from ACCESS**
- **Dùng cho**: Generating new access tokens
- **Storage**: Browser cookie (HttpOnly)
- **Cookie**: `refreshToken={token}; HttpOnly`
- **DB Storage**: Yes (for invalidation)

### Payload
```json
{
  "email": "user@example.com",
  "_id": "507f1f77bcf86cd799439011",
  "role": "BORROWER",
  "name": "Nguyễn Văn A",
  "iat": 1631234567,
  "exp": 1632439367
}
```

### Lifecycle
```
LOGIN/CONFIRM
     │
     ▼
CREATE: Sign with JWT_REFRESH_SECRET, expires in 7d
     │
     ├─ SET COOKIE: refreshToken={token}; HttpOnly
     │
     └─ SAVE TO DB: user.refreshToken = token
     │
     ▼
WHEN ACCESS TOKEN EXPIRES:
     │
     ├─ Client: POST /auth/refresh
     │         Cookie: refreshToken=...
     │
     ├─ Server: 
     │   1. Read refreshToken from cookie
     │   2. Verify with JWT_REFRESH_SECRET
     │   3. Check if token exists in DB
     │   4. Create new accessToken
     │   5. Create new refreshToken
     │   6. Update DB + cookie
     │
     └─ Response: New accessToken + refreshToken
```

### ⚠️ Important: Different Secrets

**Why separate secrets?**
- Security isolation: If accessToken secret leaked, refreshTokens still safe
- Different expiration policies
- Refresh token rarely used in requests (stays in cookie)

**Signing Refresh Token**:
```typescript
const refreshToken = this.jwtService.sign(payload, {
  secret: JWT_REFRESH_SECRET,  // ← MUST be different
  expiresIn: JWT_REFRESH_EXPIRE, // 7d
});
```

**Verifying Refresh Token**:
```typescript
const decoded = this.jwtService.verify(refreshToken, {
  secret: JWT_REFRESH_SECRET,  // ← MUST match signing
});
```

---

## 📊 Token Lifecycle

### Complete User Journey

```
╔════════════════════════════════════════════════════════════════╗
║                    SIGNUP → CONFIRM (New User)                 ║
╚════════════════════════════════════════════════════════════════╝
    POST /auth/confirm
         │
         ├─ Validate OTP
         ├─ Validate password
         ├─ Create user in DB
         │
         ▼
    CREATE TOKENS
         │
         ├─ accessToken
         │  └─ Sign with JWT_SECRET
         │     ├─ Payload: { email, _id, role, name }
         │     ├─ ExpiresIn: 1d
         │     └─ Return in response
         │
         ├─ refreshToken
         │  └─ Sign with JWT_REFRESH_SECRET
         │     ├─ Payload: { email, _id, role, name }
         │     ├─ ExpiresIn: 7d
         │     ├─ Save to DB: user.refreshToken = token
         │     └─ Set as HttpOnly cookie
         │
         └─ Response 200:
            {
              accessToken: "...",
              refreshToken: "...",
              user: { ... }
            }
            Cookie: refreshToken=...; HttpOnly

╔════════════════════════════════════════════════════════════════╗
║                  USING ACCESSTOKEN (1-24h)                     ║
╚════════════════════════════════════════════════════════════════╝
    Protected Request (e.g., GET /auth/me)
         │
         ├─ Authorization: Bearer {accessToken}
         │
         ├─ Server: JwtAuthGuard
         │  ├─ Extract token from Authorization header
         │  ├─ Verify with JWT_SECRET
         │  ├─ Check signature valid
         │  ├─ Check if expired (iat + exp)
         │  └─ Extract user info: { email, _id, role, name }
         │
         ├─ accessToken VALID (< 1d)
         │  └─ Grant access, execute endpoint
         │
         └─ accessToken EXPIRED (> 1d)
            └─ 401 Unauthorized

╔════════════════════════════════════════════════════════════════╗
║                    REFRESH TOKEN (24h-7d)                      ║
╚════════════════════════════════════════════════════════════════╝
    POST /auth/refresh (when accessToken expires)
         │
         ├─ Get refreshToken from cookie
         │
         ├─ Server Validation:
         │  ├─ Verify with JWT_REFRESH_SECRET
         │  ├─ Check signature valid
         │  ├─ Check if expired (iat + exp from 7 days ago)
         │  ├─ Query DB: Does stored token match?
         │  └─ If all valid: proceed
         │
         ├─ CREATE NEW TOKENS
         │  ├─ New accessToken (1d)
         │  │  └─ Sign with JWT_SECRET
         │  │
         │  └─ New refreshToken (7d)
         │     └─ Sign with JWT_REFRESH_SECRET
         │        └─ Save to DB
         │        └─ Update cookie
         │
         └─ Response 200:
            {
              accessToken: "...",  (NEW)
              _id, email, role, name
            }
            Cookie: refreshToken=...; HttpOnly  (NEW)

╔════════════════════════════════════════════════════════════════╗
║                        SIGNOUT (Any time)                      ║
╚════════════════════════════════════════════════════════════════╝
    DELETE /auth/signout
         │
         ├─ Authorization: Bearer {accessToken}
         │
         ├─ JwtAuthGuard validates
         │
         ├─ Clear DB:
         │  └─ user.refreshToken = ""
         │
         ├─ Clear Cookie:
         │  └─ refreshToken=; HttpOnly; Max-Age=0
         │
         └─ Response 200
            (Both tokens now invalid for this user)
```

---

## 📋 Token Payload

### Access Token Payload
```json
{
  "email": "user@example.com",
  "_id": "507f1f77bcf86cd799439011",
  "role": "BORROWER",
  "name": "Nguyễn Văn A",
  "iat": 1700000000,
  "exp": 1700086400
}
```

| Field | Type | Description |
|-------|------|-------------|
| `email` | string | User email (generated from phone) |
| `_id` | string | MongoDB user ID |
| `role` | string | User role (ADMIN/LENDER/BORROWER) |
| `name` | string | User full name |
| `iat` | number | Issued at (Unix timestamp) |
| `exp` | number | Expires at (Unix timestamp) |

### Refresh Token Payload
Same as access token (same data, different secret)

### Extracting from Token

```typescript
// From decoded token
const decoded = this.jwtService.decode(token);
// {
//   email: "user@example.com",
//   _id: "507f1f77bcf86cd799439011",
//   iat: 1700000000,
//   exp: 1700086400
// }

// From request (in guard/controller)
// Use @User() decorator or req.user
@Get('/me')
getMe(@User() user) {
  // user = { email, _id, role, name }
}
```

---

## ✅ Token Verification

### How JWT.verify() works

```typescript
function jwtVerify(token: string, secret: string) {
  // 1. Split token: header.payload.signature
  const [headerB64, payloadB64, signatureB64] = token.split('.');
  
  // 2. Decode header & payload
  const header = JSON.parse(atob(headerB64));
  const payload = JSON.parse(atob(payloadB64));
  
  // 3. Create signature with secret
  const expectedSignature = hmac(
    header.alg,
    `${headerB64}.${payloadB64}`,
    secret
  );
  
  // 4. Compare signatures
  if (signatureB64 !== expectedSignature) {
    throw new Error('Invalid signature');
  }
  
  // 5. Check expiration
  if (payload.exp < Date.now() / 1000) {
    throw new Error('Token expired');
  }
  
  // 6. Return payload
  return payload;
}
```

### Common Verification Issues

**Error: "Invalid signature"**
- Cause: Token signed with different secret
- Solution: Use correct secret (JWT_SECRET for access, JWT_REFRESH_SECRET for refresh)

**Error: "Token expired"**
- Cause: Current time > token.exp
- Solution: Call refresh endpoint to get new token

**Error: "Malformed token"**
- Cause: Token format invalid (not 3 parts)
- Solution: Ensure correct token passed

---

## ⚠️ Common Issues

### Issue 1: "Invalid signature" on Refresh Token

**Problem**: 
```
refreshToken error: invalid signature
```

**Cause**: Token was signed with wrong secret

**Solution**:
```typescript
// ❌ WRONG - Signs with JWT_SECRET (1 day expiry)
const token = this.jwtService.sign(payload);

// ✅ CORRECT - Signs with JWT_REFRESH_SECRET (7 day expiry)
const token = this.jwtService.sign(payload, {
  secret: JWT_REFRESH_SECRET,
  expiresIn: JWT_REFRESH_EXPIRE,
});

// ✅ CORRECT - Verify with matching secret
const decoded = this.jwtService.verify(token, {
  secret: JWT_REFRESH_SECRET,
});
```

### Issue 2: Access Token Expired

**Problem**: 
```
401 Unauthorized - Token expired
```

**Solution**:
- Client calls `POST /auth/refresh` with refreshToken cookie
- Server returns new accessToken
- Client uses new token for next request

### Issue 3: Refresh Token Missing from Cookie

**Problem**:
```
401 Unauthorized - Token doesn't exist
```

**Cause**: 
- Browser didn't save cookie
- Cookie was cleared
- Using different domain/origin

**Solution**:
- Check browser dev tools → Application → Cookies
- Ensure `Domain`, `Path`, `Secure`, `SameSite` correct
- Postman: Check "Store received cookies"

### Issue 4: Token Changed Secret

**Problem**: Old tokens can't verify after secret change

**Cause**: JWT secrets changed in `.env`

**Solution**:
- Old tokens permanently invalid
- All users must re-login
- Consider rotation strategy for production

---

## 🔒 Security Best Practices

1. **Store access token** in memory/localStorage (not cookie)
   - Vulnerable to XSS if in cookie
   - Short-lived (1 day)

2. **Store refresh token** in HttpOnly cookie
   - Protected from XSS
   - Longer-lived (7 days)
   - Server can validate/invalidate

3. **Use HTTPS in production**
   - Set `secure: true` on cookie
   - Enable `sameSite: 'strict'`

4. **Rotate refresh tokens**
   - Create new token each refresh
   - Invalidate old token

5. **Separate secrets**
   - Don't use same secret for access/refresh
   - Different secrets = different security domains

6. **Validate token expiration**
   - Always check `exp` field
   - Never trust expired tokens

---

**Last Updated**: 2025-11-05
