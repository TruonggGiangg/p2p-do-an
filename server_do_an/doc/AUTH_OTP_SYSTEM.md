# 💬 OTP System - Chi tiết

## 📋 Mục lục
1. [OTP Service Architecture](#otp-service-architecture)
2. [OTP Generation](#otp-generation)
3. [OTP Storage](#otp-storage)
4. [OTP Verification](#otp-verification)
5. [OTP Cleanup](#otp-cleanup)
6. [Configuration](#configuration)
7. [Security](#security)

---

## 🏗️ OTP Service Architecture

### File Structure
```
src/auth/otp/
├── otp.service.ts           # Core OTP logic
└── otp.interface.ts          # Type definitions (optional)
```

### Service Injection
```typescript
@Module({
  providers: [AuthService, OtpService],
  exports: [AuthService, OtpService],
})
```

### Dependencies
```typescript
constructor(
  private readonly configService: ConfigService,
  private readonly otpSmsService: OtpSmsService, // SMS sending
) {}
```

---

## 🔢 OTP Generation

### Generate OTP Code

**Method**: `generateOtp(phone: string): string`

```typescript
async generateOtp(phone: string): Promise<string> {
  // 1. Generate 6-digit random code
  const code = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0');
  // Output: "123456" or "045678"
  
  // 2. Get expiration time
  const expireMinutes = this.configService.get('OTP_EXPIRE_MINUTES') || 5;
  const expiresAt = Date.now() + expireMinutes * 60 * 1000;
  
  // 3. Store in memory
  this.otpStore.set(phone, {
    code,
    expiresAt,
    attempts: 0,
  });
  
  // 4. Return code
  return code;
}
```

### Test Mode
In development, OTP code is always: `000000`

```env
# .env
OTP_ENABLED=false  # Don't send real SMS
```

When `OTP_ENABLED=false`:
- Any code verification succeeds
- SMS not sent
- Perfect for testing

---

## 💾 OTP Storage

### Storage Structure
```typescript
interface OtpRecord {
  code: string;           // "000000"
  expiresAt: number;      // Unix timestamp
  attempts: number;       // 0-5 attempts
}

// In-memory Map
private otpStore = new Map<string, OtpRecord>();
// Key: "+84901234567"
// Value: { code, expiresAt, attempts }
```

### Adding OTP to Store

```typescript
// When generating OTP
this.otpStore.set(phone, {
  code,
  expiresAt: Date.now() + 5 * 60 * 1000,
  attempts: 0,
});

// Retrieve later
const otpRecord = this.otpStore.get(phone);
```

### Storage Limitations

**Current (In-Memory)**:
- ✅ Fast
- ✅ No DB queries
- ❌ Lost on server restart
- ❌ No persistence
- ❌ Single server only

**Future (Redis/DB)**:
- ✅ Persistent across restarts
- ✅ Multi-server support
- ✅ TTL auto-expiry
- ❌ Slightly slower
- Requires Redis/MongoDB setup

---

## ✅ OTP Verification

### Verify OTP Code

**Method**: `verifyOtp(phone: string, code: string): boolean`

```typescript
async verifyOtp(
  phone: string,
  code: string,
): Promise<{ valid: boolean; error?: string }> {
  
  // 1. Get OTP record from store
  const otpRecord = this.otpStore.get(phone);
  
  if (!otpRecord) {
    return {
      valid: false,
      error: 'OTP not found',
    };
  }
  
  // 2. Check if expired
  if (Date.now() > otpRecord.expiresAt) {
    this.otpStore.delete(phone);  // Cleanup
    return {
      valid: false,
      error: 'OTP has expired',
    };
  }
  
  // 3. Check attempts (max 5)
  if (otpRecord.attempts >= 5) {
    this.otpStore.delete(phone);  // Cleanup after max attempts
    return {
      valid: false,
      error: 'Maximum attempts exceeded',
    };
  }
  
  // 4. Compare codes
  if (otpRecord.code !== code) {
    // Increment attempt counter
    otpRecord.attempts++;
    return {
      valid: false,
      error: 'Invalid OTP code',
    };
  }
  
  // 5. Code matches - delete from store
  this.otpStore.delete(phone);
  
  return { valid: true };
}
```

### Verification Flow Diagram

```
verifyOtp(phone, code)
    │
    ├─ Get from store
    │  ├─ Not found → Error
    │  └─ Found → Continue
    │
    ├─ Check expiration
    │  ├─ Expired → Delete & Error
    │  └─ Valid → Continue
    │
    ├─ Check attempts
    │  ├─ Exceeded (≥5) → Delete & Error
    │  └─ < 5 → Continue
    │
    ├─ Compare code
    │  ├─ Mismatch → Increment attempts & Error
    │  ├─ Match → Delete & Success
    │  └─ Success: true
```

---

## 🧹 OTP Cleanup

### Automatic Cleanup Strategies

**1. On Verification Failure (Max Attempts)**
```typescript
if (otpRecord.attempts >= 5) {
  this.otpStore.delete(phone);
  throw new BadRequestException('Max attempts exceeded');
}
```

**2. On Verification Success**
```typescript
if (otpRecord.code === code) {
  this.otpStore.delete(phone);  // Remove after use
  return true;
}
```

**3. On Expiration Detection**
```typescript
if (Date.now() > otpRecord.expiresAt) {
  this.otpStore.delete(phone);  // Cleanup expired
  throw new BadRequestException('OTP expired');
}
```

**4. Periodic Cleanup (Optional)**
```typescript
// Run every minute to clean old OTPs
@Interval(60000)
cleanupExpiredOtps() {
  const now = Date.now();
  
  for (const [phone, record] of this.otpStore.entries()) {
    if (now > record.expiresAt) {
      this.otpStore.delete(phone);
    }
  }
}
```

---

## ⚙️ Configuration

### Environment Variables
```env
# OTP Settings
OTP_ENABLED=false
OTP_EXPIRE_MINUTES=5

# SMS Provider
TWILIO_ACCOUNT_SID=ACb6b4ed...
TWILIO_AUTH_TOKEN=135ee65b...
TWILIO_PHONE_NUMBER=+84799543174
```

### OTP Behavior by Configuration

**OTP_ENABLED=false** (Test/Dev mode)
```
POST /auth/signup
├─ Generate OTP: "000000"
├─ Store in memory
├─ Skip SMS sending
└─ Response: Success

POST /auth/confirm
├─ Accept any code
└─ Success if phone/password valid
```

**OTP_ENABLED=true** (Production)
```
POST /auth/signup
├─ Generate OTP: random 6-digit
├─ Store in memory
├─ Send via Twilio SMS
├─ If SMS fails: throw error
└─ Response: Success

POST /auth/confirm
├─ Must match exactly
├─ Check expiration (5 min)
├─ Max 5 attempts
└─ Success only if valid
```

### OTP Expiration
- **Duration**: 5 minutes (configurable)
- **Start**: When OTP generated
- **Check**: When OTP verified
- **Cleanup**: Automatic on expiry detection

---

## 🔒 Security

### OTP Security Features

✅ **Time-limited**
- 5 minute expiration
- Can't reuse old codes

✅ **Attempt-limited**
- Max 5 wrong attempts
- Account gets locked after 5 failures

✅ **Random Generation**
- 6-digit code: 1 million combinations
- Math.random() for generation

✅ **Unique per Phone**
- One OTP per phone number
- New OTP invalidates old one

✅ **SMS-based (optional)**
- Code sent via SMS when enabled
- Not visible if SMS fails

### Security Improvements (Future)

1. **Database Storage**
   - Persistent across restarts
   - Better audit trail

2. **Redis TTL**
   - Automatic expiry
   - Distributed systems support

3. **Rate Limiting**
   - Max OTPs per phone: 3 per day
   - Prevent spam

4. **CAPTCHA Integration**
   - Human verification
   - Prevent brute force

5. **Email Backup**
   - OTP sent via email too
   - Fallback if SMS fails

6. **Hashing OTP**
   - Store hash, not plain code
   - More secure than plain storage

---

## 📊 OTP Lifecycle Examples

### Example 1: Successful OTP Verification

```
TIME: 10:00:00
└─ POST /auth/signup
   └─ generateOtp("+84901234567")
      ├─ Code: "000000"
      ├─ ExpiresAt: 10:05:00
      ├─ Store: { code, expiresAt, attempts: 0 }
      └─ Response: Success

TIME: 10:02:00
└─ POST /auth/confirm
   └─ verifyOtp("+84901234567", "000000")
      ├─ Not expired (10:02 < 10:05)
      ├─ Attempts < 5 (0 < 5)
      ├─ Code matches
      ├─ Delete from store
      └─ Return: Valid ✓

TIME: 10:06:00
└─ POST /auth/confirm (old OTP already deleted)
   └─ verifyOtp("+84901234567", "000000")
      └─ Not in store
         └─ Return: Invalid ✗
```

### Example 2: Failed OTP with Max Attempts

```
TIME: 10:00:00
└─ POST /auth/signup
   └─ Store: { code: "123456", ... }

TIME: 10:01:00 (Attempt 1)
└─ POST /auth/confirm with "111111"
   └─ Code mismatch
      ├─ attempts++  (now 1)
      └─ Return: Invalid

TIME: 10:02:00 (Attempt 2)
└─ POST /auth/confirm with "222222"
   └─ Code mismatch
      ├─ attempts++  (now 2)
      └─ Return: Invalid

TIME: 10:03:00 (Attempt 3)
└─ POST /auth/confirm with "333333"
   └─ Code mismatch
      ├─ attempts++  (now 3)
      └─ Return: Invalid

TIME: 10:04:00 (Attempt 4)
└─ POST /auth/confirm with "444444"
   └─ Code mismatch
      ├─ attempts++  (now 4)
      └─ Return: Invalid

TIME: 10:05:00 (Attempt 5)
└─ POST /auth/confirm with "555555"
   └─ Code mismatch
      ├─ attempts++  (now 5)
      ├─ Attempts >= 5 → TRIGGER MAX LIMIT
      ├─ Delete from store
      └─ Return: Max attempts exceeded ✗

TIME: 10:06:00 (Attempt 6 - too late)
└─ POST /auth/confirm with "123456" (correct!)
   └─ Not in store (was deleted)
      └─ Return: Invalid ✗
```

### Example 3: OTP Expiration

```
TIME: 10:00:00
└─ POST /auth/signup
   └─ Store: { code: "000000", expiresAt: 10:05:00 }

TIME: 10:04:00 (Within 5 min)
└─ POST /auth/confirm with "000000"
   └─ Not expired (10:04 < 10:05)
      ├─ Code matches
      ├─ Delete
      └─ Return: Valid ✓

TIME: 10:05:30 (After 5 min)
└─ POST /auth/confirm with "000000"
   └─ Expired (10:05:30 > 10:05:00)
      ├─ Delete from store
      └─ Return: Expired ✗
```

---

## 🧪 Testing OTP

### Test Cases

| Test | Input | Expected | Notes |
|------|-------|----------|-------|
| Generate | phone | 6-digit code | Random or "000000" in test |
| Valid | phone + correct code | Success | < 5 min, < 5 attempts |
| Expired | phone + code | Error | > 5 min |
| Invalid | phone + wrong code | Error | Increment attempts |
| Max attempts | phone + wrong code (6th) | Error | Blocked after 5 |
| Reuse | phone + code (already used) | Error | Deleted after use |

### Test Endpoint

```bash
# Generate OTP
curl -X POST http://localhost:8080/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"phone": "+84901234567"}'

# Get OTP code from console log / SMS / DB
# In test mode: "000000"

# Verify OTP
curl -X POST http://localhost:8080/auth/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+84901234567",
    "code": "000000",
    "password": "password123",
    "fullName": "Test User",
    ...
  }'
```

---

**Last Updated**: 2025-11-05
