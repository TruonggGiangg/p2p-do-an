# 📘 Chương 5: Luồng Verify OTP (Xác thực giao dịch)

## 5.1. Tổng quan luồng 2 bước

```
┌──────────────────────────────────────────────────────────────────┐
│                    BƯỚC 1: KHỞI TẠO (Initiate)                   │
│                                                                  │
│  Client ──POST /transfer/account──► Server                       │
│  { amount, recipient, deviceId }                                 │
│                                                                  │
│  Server: validate → lock actionData → tạo session                │
│                                                                  │
│  Server ──{ sessionId, expiresIn }──► Client                     │
│           Session TTL = 5 phút                                   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                    BƯỚC 2: XÁC THỰC (Confirm)                    │
│                                                                  │
│  Client: tạo OTP (offline) + ký ECDSA                            │
│                                                                  │
│  Client ──POST /transfer/confirm──► Server                       │
│  { sessionId, otp, signature, deviceId, timestamp }              │
│                                                                  │
│  Server: verify signature → verify TOTP → consume session        │
│  Server: thực thi giao dịch trên Fineract                        │
│                                                                  │
│  Server ──{ success, resourceId }──► Client                      │
└──────────────────────────────────────────────────────────────────┘
```

## 5.2. Bước 1: Khởi tạo giao dịch (Initiate)

### 5.2.1. Client gửi request

```
POST /api/wallets/transfer/account
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "fromWalletId": "1",
  "recipientAccountNo": "0999000002",
  "amount": 50000,
  "description": "Chuyển tiền test",
  "deviceId": "d4ecf17695448b8eeed660a196ef4669a202bf7972aaeb1f7bbea4cc1e9b7164"
}
```

### 5.2.2. Server xử lý

```typescript
// File: wallets.service.ts
async transferByAccountNumber(userId, fromWalletId, recipientAccountNo, amount, deviceId, description) {
  
  // 1. Validate request
  const { fromWallet, fromUser } = await this.validateTransferRequest(
    fromWalletId, userId, amount
  );
  // → Kiểm tra: user sở hữu ví? Đủ số dư? Ví active?

  // 2. Tìm người nhận (Phone → User → Fineract Client)
  const recipientUser = await this.findRecipient(recipientAccountNo);
  // → Tìm trong MongoDB theo SĐT hoặc Fineract Client ID

  // 3. Lấy ví e-wallet của người nhận
  const toAccount = await this.fineractService.getActiveEWalletAccount(
    Number(recipientUser.fineractClientId)
  );
  
  // 4. Chống tự chuyển cho mình
  if (toAccount.id === Number(fromWalletId)) {
    throw new BadRequestException('Không thể chuyển tiền cho chính mình');
  }

  // 5. ⭐ TẠO OTP SESSION (thay vì thực thi ngay)
  return this.otpSessionService.createSession(
    userId,
    deviceId,        // ← Kiểm tra device đã đăng ký chưa
    OtpActionType.TRANSFER,
    {
      // ⚠️ actionData được "KHÓA CỨNG" tại đây
      // Client KHÔNG THỂ thay đổi sau bước này!
      fromWalletId,
      toAccountId: toAccount.id,
      toClientId: recipientUser.fineractClientId,
      amount,                    // ← Số tiền bị lock
      description,
      recipientName: recipientUser.username,
      type: 'TRANSFER_BY_ACCOUNT',
    }
  );
}
```

### 5.2.3. OTP Session được tạo

```typescript
// File: otp-session.service.ts dòng 38-90
async createSession(userId, deviceId, actionType, actionData) {
  // 1. Kiểm tra user bị lock?
  const user = await this.userModel.findById(userId);
  if (user?.smartOTP?.lockedUntil > new Date()) {
    throw 'Tài khoản bị khóa OTP. Thử lại sau X phút';
  }

  // 2. ⭐ KIỂM TRA DEVICE ĐÃ ĐĂNG KÝ?
  const device = await this.deviceBindingService.isDeviceTrusted(userId, deviceId);
  if (!device) {
    throw 'Thiết bị chưa được đăng ký Smart OTP';
    //     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //     Đây chính là lỗi user gặp khi chưa bind device!
  }

  // 3. Tạo session UUID
  const sessionId = uuidv4();  // "ca7d7d7a-f720-404c-80d5-c9753e7146e0"
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // +5 phút

  // 4. Lưu MongoDB
  const session = new this.transactionOtpModel({
    sessionId,
    userId,
    deviceId,
    actionType: 'TRANSFER',
    actionData: { fromWalletId, toAccountId, amount, ... },
    status: 'pending',
    expiresAt,
    attempts: 0,
  });
  await session.save();

  return { sessionId, expiresAt };
}
```

**MongoDB Record sau bước này:**
```json
{
  "_id": "ObjectId(...)",
  "sessionId": "ca7d7d7a-f720-404c-80d5-c9753e7146e0",
  "userId": "ObjectId(6989b9f8f6787217af6e3ebb)",
  "deviceId": "d4ecf17695448b8e...",
  "actionType": "TRANSFER",
  "actionData": {
    "fromWalletId": "1",
    "toAccountId": 2,
    "toClientId": "6",
    "amount": 50000,
    "description": "Chuyển tiền test",
    "type": "TRANSFER_BY_ACCOUNT"
  },
  "status": "pending",
  "expiresAt": "2026-04-05T00:24:04.000Z",
  "attempts": 0,
  "createdAt": "2026-04-05T00:19:04.000Z"
}
```

---

## 5.3. Bước 2: Xác thực OTP + Chữ ký số (Confirm)

### 5.3.1. Client tạo OTP và ký

```
┌────────────────────────────────────────────────────────────────┐
│                  TRÊN THIẾT BỊ NGƯỜI DÙNG                      │
│                                                                │
│  ┌────────────────────────────────────────┐                    │
│  │  Bước A: Tạo OTP (TOTP)               │                    │
│  │                                        │                    │
│  │  totpSecret = đọc từ SecureStore       │                    │
│  │  T = floor(Date.now() / 1000 / 30)     │                    │
│  │  otp = HMAC-SHA1(totpSecret, T) → 6 số │                    │
│  │  → otp = "214606"                      │                    │
│  └────────────────────┬───────────────────┘                    │
│                       │                                        │
│  ┌────────────────────▼───────────────────┐                    │
│  │  Bước B: Ký chữ ký số (ECDSA)         │                    │
│  │                                        │                    │
│  │  timestamp = floor(Date.now() / 1000)  │                    │
│  │  → 1775323142                          │                    │
│  │                                        │                    │
│  │  payload = "214606:1775323142:TRANSFER"│                    │
│  │  hash = SHA256(payload)                │                    │
│  │  → "7a8b9c0d..."                       │                    │
│  │                                        │                    │
│  │  privateKey = đọc từ SecureStore       │                    │
│  │  signature = ECDSA.sign(hash, privKey) │                    │
│  │  → DER encode → Base64                 │                    │
│  │  → "MEUCIQDVS/QC1fVlIfKR..."           │                    │
│  └────────────────────┬───────────────────┘                    │
│                       │                                        │
│  ┌────────────────────▼───────────────────┐                    │
│  │  Bước C: Gửi lên Server               │                    │
│  │                                        │                    │
│  │  POST /api/wallets/transfer/confirm    │                    │
│  │  {                                     │                    │
│  │    sessionId:  "ca7d7d7a-...",          │                    │
│  │    otp:        "214606",               │                    │
│  │    signature:  "MEUCIQDVS/...",         │                    │
│  │    deviceId:   "d4ecf176...",           │                    │
│  │    timestamp:  1775323142               │                    │
│  │  }                                     │                    │
│  └────────────────────────────────────────┘                    │
└────────────────────────────────────────────────────────────────┘
```

**Code Client:**
```typescript
// File: TransferConfirmScreen.tsx dòng 57-88
const handleConfirm = async () => {
  // A: Lấy OTP đã tạo (hoặc do user nhập)
  // otp = "214606"

  // B: Tạo chữ ký số
  const deviceId = await SmartOTPService.getDeviceId();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await SmartOTPService.signPayload(otp, timestamp, 'TRANSFER');
  // Bên trong signPayload():
  //   payload = "214606:1775323142:TRANSFER"
  //   hash = SHA256(payload) → hex
  //   sig = ECDSA.sign(hash, privateKey) → DER → Base64

  // C: Gọi API xác nhận
  await walletAPI.confirmTransfer({
    sessionId,     // Từ bước 1
    otp,           // "214606"
    signature,     // "MEUCIQDVS/..."
    deviceId,      // "d4ecf176..."
    timestamp,     // 1775323142
  });
};
```

### 5.3.2. Server xác thực (7 bước kiểm tra)

```
┌───────────────────────────────────────────────────────────────────┐
│                    SERVER VERIFICATION PIPELINE                    │
│                                                                   │
│  Request: { sessionId, otp, signature, deviceId, timestamp }      │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Kiểm tra 1: Session tồn tại?                               │  │
│  │   → getSession(sessionId, userId)                           │  │
│  │   → Nếu null → ❌ "Session không tồn tại"                  │  │
│  └─────────────────────────┬───────────────────────────────────┘  │
│                            ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Kiểm tra 2: Session hợp lệ?                                │  │
│  │   → status == PENDING?  (chưa dùng?)                        │  │
│  │   → expiresAt > now?    (chưa hết hạn?)                     │  │
│  │   → actionType == TRANSFER? (đúng loại?)                    │  │
│  │   → attempts < 3?      (chưa sai quá 3 lần?)               │  │
│  └─────────────────────────┬───────────────────────────────────┘  │
│                            ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Kiểm tra 3: Device hợp lệ?                                 │  │
│  │   → isDeviceTrusted(userId, deviceId)                       │  │
│  │   → Query: { userId, deviceId, status: 'active' }           │  │
│  │   → Trả về DeviceBinding (có publicKey + totpSecret)        │  │
│  └─────────────────────────┬───────────────────────────────────┘  │
│                            ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ ⭐ Kiểm tra 4: CHỮ KÝ SỐ ECDSA                             │  │
│  │                                                             │  │
│  │   payload = "214606:1775323142:TRANSFER"                    │  │
│  │   hash = SHA256(payload) → Buffer                           │  │
│  │   sigBuffer = Base64.decode(signature) → DER bytes          │  │
│  │   publicKey = device.publicKey (từ DB)                      │  │
│  │                                                             │  │
│  │   ECDSA.verify(hash, sigBuffer, publicKey) → true/false     │  │
│  │                                                             │  │
│  │   Nếu false → incrementAttempts() → ❌ "Chữ ký không hợp lệ" │  │
│  └─────────────────────────┬───────────────────────────────────┘  │
│                            ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Kiểm tra 5: TIMESTAMP (chống replay)                        │  │
│  │                                                             │  │
│  │   serverTime = Math.floor(Date.now() / 1000)                │  │
│  │   diff = |serverTime - clientTimestamp|                      │  │
│  │   Nếu diff > 120 giây → ❌ "Timestamp không hợp lệ"         │  │
│  │                                                             │  │
│  │   Mục đích: Chặn kẻ tấn công gửi lại request cũ            │  │
│  └─────────────────────────┬───────────────────────────────────┘  │
│                            ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ ⭐ Kiểm tra 6: TOTP                                         │  │
│  │                                                             │  │
│  │   totpSecret = device.totpSecret (từ DB)                    │  │
│  │   expected = TOTP.generate(totpSecret) // server tính       │  │
│  │   received = otp                       // client gửi        │  │
│  │                                                             │  │
│  │   So sánh ±2 windows (±60 giây):                            │  │
│  │     T-2, T-1, T(hiện tại), T+1, T+2                        │  │
│  │                                                             │  │
│  │   Nếu mismatch → incrementAttempts()                        │  │
│  │   Nếu attempts >= 3 → lockUser() (khóa 5 phút)             │  │
│  │   → ❌ "Mã OTP không đúng. Còn X lần thử"                   │  │
│  └─────────────────────────┬───────────────────────────────────┘  │
│                            ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Kiểm tra 7: TẤT CẢ ĐỀU HỢP LỆ ✅                          │  │
│  │                                                             │  │
│  │   → markVerified(sessionId)        // status → VERIFIED     │  │
│  │   → updateLastUsed(userId, deviceId)                        │  │
│  │   → return { valid: true, actionData }                      │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

### 5.3.3. Consume Session + Thực thi Fineract

```typescript
// File: wallets.service.ts
async confirmTransfer(userId, body) {
  const { sessionId, otp, signature, deviceId, timestamp } = body;

  // 1. Verify OTP + Signature (7 bước ở trên)
  const verifyResult = await this.smartOtpService.verifySmartOtp(
    userId, sessionId, otp, signature, timestamp, deviceId,
    OtpActionType.TRANSFER,
  );

  if (!verifyResult.valid) {
    throw new BadRequestException(verifyResult.message);
    // "Chữ ký không hợp lệ" hoặc "Mã OTP không đúng"
  }

  // 2. Consume session (chuyển status VERIFIED → COMPLETED)
  const session = await this.otpSessionService.consumeSession(
    userId, sessionId, OtpActionType.TRANSFER,
  );

  if (!session.valid) throw new BadRequestException(session.message);

  // 3. ⭐ THỰC THI GIAO DỊCH TRÊN FINERACT
  //    Lấy dữ liệu từ actionData (đã lock từ bước 1)
  const { fromWalletId, toAccountId, toClientId, amount, description } = session.actionData;
  //      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //      Dữ liệu từ lúc KHỞI TẠO, client KHÔNG thay đổi được!

  const result = await this.fineractService.transferFunds(
    Number(fromUser.fineractClientId),  // fromClientId
    Number(toClientId),                  // toClientId
    Number(fromWalletId),                // fromAccountId
    Number(toAccountId),                 // toAccountId
    amount,                              // amount
    description,                         // note
  );

  return {
    success: true,
    message: 'Chuyển khoản thành công',
    resourceId: result.resourceId,
  };
}
```

## 5.4. Session Lifecycle (Vòng đời Session)

```
                 ┌──────────┐
    Khởi tạo ──►│  PENDING  │
                 └────┬─────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
    OTP sai      OTP đúng    Hết hạn
    (< 3 lần)        │       (5 phút)
         │            │            │
         │     ┌──────▼──────┐     │
         │     │  VERIFIED   │     │
         │     └──────┬──────┘     │
         │            │            │
         │     Consume session     │
         │            │            │
         │     ┌──────▼──────┐     │
         │     │  COMPLETED  │     │
         │     └─────────────┘     │
         │                         │
    OTP sai 3 lần            ┌─────▼─────┐
         │                   │  EXPIRED   │
    ┌────▼────┐              └───────────┘
    │ User bị │
    │ LOCK    │
    │ (5 phút)│
    └─────────┘
```

## 5.5. Log thực tế (Giao dịch thành công)

```
[12:19:00] POST /api/wallets/transfer/account 201 - 819ms
           → Session created: ca7d7d7a-f720-404c-80d5-...

[12:19:04] SignatureService: payload=214606:1775323142:TRANSFER
           SignatureService: Elliptic verify result: true       ← ✅

[12:19:04] SmartOtpService: SMART OTP VERIFICATION
           Session ID: ca7d7d7a-f720-404c-80d5-c9753e7146e0
           OTP Code (received): 214606
           OTP Code (expected): 214606                          ← ✅ Khớp!
           Server time:  2026-04-04T17:19:04.114Z
           Client time:  2026-04-04T17:19:02.000Z               ← Lệch 2s, OK

[12:19:04] TotpService: TOTP valid at current step (delta=0)   ← ✅ Đúng window

[12:19:04] SmartOtpService: signatureValid=true, totpValid=true ← ✅ CẢ HAI HỢP LỆ

[12:19:04] WalletsService: Executing transfer amount=50000
[12:19:04] FineractSavingsService: Transferring 50000 VND
           from Client 5:Account 1 to Client 6:Account 2

[12:19:04] FineractSavingsService: ✓ Transfer SUCCESS: resourceId=7  ← ✅ THÀNH CÔNG!

[12:19:05] POST /api/wallets/transfer/confirm 201 - 1048ms
```

---

## 5.6. Phân tích tấn công

| Kịch bản tấn công | Lớp chặn | Chi tiết |
|-------------------|----------|----------|
| Đánh cắp JWT token | Layer 1 | deviceId không khớp → bị reject |
| Replay request cũ | Layer 2+3 | timestamp hết hạn + OTP đã thay đổi |
| MITM sửa số tiền | actionData lock | amount được lock ở bước 1, không đổi được |
| Brute-force OTP | Rate limit | 3 lần sai → lock 5 phút |
| Giả mạo thiết bị | Layer 3 | Không có Private Key → không ký được |
| Đánh cắp OTP qua shoulder surfing | Layer 3 | Có OTP nhưng thiếu signature |
| Database bị hack | Layer 3 | Có publicKey nhưng thiếu privateKey |
| Tấn công side-channel | Hardware | SecureStore dùng hardware-backed keychain |

---

> **Tiếp theo:** [README — Tổng hợp tất cả](./README.md)
