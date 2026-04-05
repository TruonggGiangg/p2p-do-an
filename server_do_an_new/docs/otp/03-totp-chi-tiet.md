# 📘 Chương 3: TOTP — Time-based One-Time Password

## 3.1. TOTP là gì?

TOTP = **Time-based One-Time Password** — mã OTP dựa trên thời gian theo chuẩn **RFC 6238**.

```
Ý tưởng cốt lõi:

  Client và Server CÙNG có 1 khóa bí mật (shared secret)
  Client và Server CÙNG biết thời gian hiện tại
  → Cả hai tính ra CÙNG một mã OTP tại cùng một thời điểm
  → KHÔNG cần gửi OTP qua mạng!
```

## 3.2. Thuật toán TOTP từng bước

### Bước 1: Tính Time Counter

```
T = floor( Unix_Timestamp / time_step )

Trong đó:
  Unix_Timestamp = số giây từ 1/1/1970 00:00:00 UTC
  time_step = 30 giây (chuẩn)

Ví dụ:
  Thời gian: 2026-04-05 00:19:04 UTC
  Unix_Timestamp = 1775323144
  T = floor(1775323144 / 30) = 59177438

  Mỗi 30 giây, T tăng 1:
  T = 59177438 → OTP = "214606"     (0-30s)
  T = 59177439 → OTP = "847291"     (30-60s)
  T = 59177440 → OTP = "503182"     (60-90s)
```

### Bước 2: Chuyển T thành 8 bytes (Big Endian)

```
T = 59177438 = 0x0000000003870EDE

Byte array (Big Endian):
  [0x00, 0x00, 0x00, 0x00, 0x03, 0x87, 0x0E, 0xDE]
```

### Bước 3: Tính HMAC-SHA1

```
hmac = HMAC-SHA1(secret, T_bytes)

Trong đó:
  secret = TOTP Secret (Base32 decoded → bytes)
           "42KX6PQI3IKNVGCHIBZOY55YCAPOJLBTADYQND35LH3WOUJ52I3Q"
           → decode Base32 → 20 bytes

  T_bytes = 8 bytes từ Bước 2

  hmac → 20 bytes raw output
```

**HMAC-SHA1 chi tiết:**
```
HMAC-SHA1(key, message):
  1. Nếu key > 64 bytes → key = SHA1(key)
  2. Nếu key < 64 bytes → pad với 0x00
  3. ipad = key XOR 0x36 (lặp 64 lần)
  4. opad = key XOR 0x5c (lặp 64 lần)
  5. inner = SHA1(ipad || message)
  6. outer = SHA1(opad || inner)
  7. return outer  (20 bytes)
```

### Bước 4: Dynamic Truncation (Cắt ngắn động)

```
hmac = 20 bytes: [b0, b1, b2, ..., b19]

Lấy offset từ 4 bit cuối cùng:
  offset = b19 & 0x0F   (giá trị 0-15)

Lấy 4 bytes bắt đầu từ offset:
  p = hmac[offset..offset+3]

Loại bỏ bit dấu (MSB):
  code = (p[0] & 0x7F) << 24
       | p[1]          << 16
       | p[2]          <<  8
       | p[3]

Lấy 6 chữ số cuối:
  otp = code % 1000000
  → Pad với 0 nếu ít hơn 6 chữ số

Ví dụ:
  hmac = [..., 0x1f, 0x86, 0x98, 0x69, 0x0e, ...]
  offset = 0x0e & 0x0f = 14
  p = hmac[14..17] = [0x50, 0xef, 0x7f, 0x19]
  code = (0x50 & 0x7f) << 24 | 0xef << 16 | 0x7f << 8 | 0x19
       = 0x50ef7f19 = 1357938457
  otp = 1357938457 % 1000000 = 938457
  → OTP = "938457"
```

### Tổng hợp: Pipeline hoàn chỉnh

```
                    TOTP Secret (Base32)
                         │
                         ▼
                   Base32 Decode
                         │
                    Secret Bytes
                         │
     Unix Time ──► T = floor(time/30) ──► 8 bytes (BE)
                                              │
                                              ▼
                                    HMAC-SHA1(secret, T)
                                              │
                                         20 bytes
                                              │
                                              ▼
                                    Dynamic Truncation
                                              │
                                         31-bit int
                                              │
                                              ▼
                                       mod 1,000,000
                                              │
                                              ▼
                                      OTP: "214606"
```

## 3.3. Window Tolerance (Cho phép lệch thời gian)

Client và Server có thể lệch đồng hồ vài giây. Hệ thống cho phép **±2 windows** (±60 giây):

```
              Window -2   Window -1   Window 0    Window +1   Window +2
              (T-2)       (T-1)       (hiện tại)  (T+1)       (T+2)
Timeline: ════╤═══════════╤═══════════╤═══════════╤═══════════╤════
              │  "503182"  │  "847291"  │  "214606"  │  "129473"  │
              │           │           │  ← đúng   │           │
              │  ✅ chấp nhận nếu đồng hồ client chậm 60s      │
              │                                    ✅ chấp nhận  │

Cấu hình: TOTP_CONFIG.window = 2
```

**Code thực tế (Server):**
```typescript
// File: totp.service.ts dòng 94-121
verify(secret: string, token: string): boolean {
  // Kiểm tra trực tiếp step hiện tại
  const directResult = verifySync({ token, secret });
  if (directResult.valid) return true;

  // Kiểm tra thủ công ±2 steps (window)
  const currentStep = Math.floor(Date.now() / 1000 / 30);
  
  for (let delta = -2; delta <= 2; delta++) {
    if (delta === 0) continue;
    const testEpoch = (currentStep + delta) * 30;
    const expectedToken = generateSync({ secret, epoch: testEpoch });
    if (token === expectedToken) {
      return true; // Hợp lệ ở delta ±1 hoặc ±2
    }
  }
  
  return false; // Không khớp tại bất kỳ window nào
}
```

## 3.4. Tạo TOTP Secret

```
Secret được tạo khi đăng ký thiết bị (1 lần duy nhất):

1. Server tạo 32 ký tự random từ bảng Base32:
   chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
   secret = random pick 32 chars
   → "42KX6PQI3IKNVGCHIBZOY55YCAPOJLBT"

2. Server lưu vào MongoDB (collection: device_bindings)
3. Server trả về cho Client qua HTTPS
4. Client lưu vào SecureStore (hardware-encrypted)

⚠️ TOTP Secret là BÍ MẬT NHẤT trong toàn hệ thống!
   Ai có secret = có thể tạo OTP = bypass lớp 2!
```

## 3.5. Code thực tế: Client tạo OTP

```typescript
// File: smart-otp.service.ts dòng 187-212
const generateTOTP = async (): Promise<string> => {
  // Đọc secret từ hardware-encrypted storage
  const totpSecret = await SecureStore.getItemAsync('smart_otp_totp_secret');
  // totpSecret = "42KX6PQI3IKNVGCHIBZOY55YCAPOJLBT"

  // otplib tự động:
  //   1. Lấy thời gian hiện tại
  //   2. Tính T = floor(time/30)
  //   3. HMAC-SHA1(secret, T)
  //   4. Dynamic Truncation
  //   5. Trả về 6 chữ số
  const code = generateSync({ secret: totpSecret });
  // code = "214606"

  return code;
};
```

## 3.6. Tại sao TOTP an toàn?

| Kịch bản tấn công | Kết quả |
|-------------------|---------|
| Đánh cắp mã OTP "214606" | ❌ Mã hết hạn sau 30 giây |
| Brute-force (thử tất cả 000000-999999) | ❌ Bị lock sau 3 lần sai |
| Đoán TOTP Secret từ mã OTP | ❌ HMAC-SHA1 là one-way, không đảo ngược |
| Tấn công replay (gửi lại mã cũ) | ❌ Timestamp thay đổi → mã khác |

---

> **Tiếp theo:** [Chương 4: Luồng Device Binding](./04-luong-device-binding.md)
