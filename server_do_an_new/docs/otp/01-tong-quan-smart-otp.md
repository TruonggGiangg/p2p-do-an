# 📘 Chương 1: Tổng quan hệ thống Smart OTP

## 1.1. Smart OTP là gì?

**Smart OTP** (Smart One-Time Password) là cơ chế xác thực giao dịch **tạo mã OTP ngay trên thiết bị** mà không cần SMS hay mạng Internet. Nó kết hợp 3 công nghệ mật mã:

| Công nghệ | Vai trò | Tiêu chuẩn |
|-----------|---------|------------|
| **TOTP** (Time-based OTP) | Tạo mã 6 số thay đổi mỗi 30s | RFC 6238 |
| **ECDSA** (Digital Signature) | Chữ ký số chứng minh chủ sở hữu thiết bị | FIPS 186-4 |
| **Device Binding** | Gắn cố định thiết bị vật lý với tài khoản | Custom |

## 1.2. Tại sao không dùng SMS OTP?

```
┌─────────────────────┬──────────────────────┬──────────────────────┐
│                     │    SMS OTP           │    Smart OTP         │
├─────────────────────┼──────────────────────┼──────────────────────┤
│ Chi phí             │ 200-500 VNĐ/tin      │ 0 đ (tạo offline)   │
│ Cần mạng?           │ ✅ Cần sóng GSM       │ ❌ Không cần          │
│ Tốc độ              │ 5-30 giây            │ Tức thì (< 1ms)      │
│ Chống SIM Swap      │ ❌ Dễ bị tấn công     │ ✅ Không liên quan    │
│ Chống Man-in-Middle │ ❌ SMS bị chặn được   │ ✅ Có chữ ký số       │
│ Replay Attack       │ ❌ Có thể dùng lại    │ ✅ Mã hết hạn 30s     │
│ Offline             │ ❌ Không              │ ✅ Hoàn toàn offline  │
└─────────────────────┴──────────────────────┴──────────────────────┘
```

## 1.3. Kiến trúc hệ thống

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT (React Native)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │ expo-crypto │  │  elliptic   │  │     otplib               │ │
│  │ Random Bytes│  │ ECDSA P-256 │  │  TOTP RFC 6238           │ │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────────────┘ │
│         │                │                   │                   │
│  ┌──────▼──────────────────▼──────────────────▼──────────────┐   │
│  │                  SmartOTPService                          │   │
│  │  • generateKeyPair()  • signPayload()  • generateTOTP()  │   │
│  └──────────────────────────┬────────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼────────────────────────────────┐   │
│  │              expo-secure-store (Hardware-backed)           │   │
│  │  privateKey │ publicKey │ totpSecret │ deviceId            │   │
│  └───────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ HTTPS (TLS 1.3)
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                        SERVER (NestJS)                            │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                  SmartOtpService (Orchestrator)           │    │
│  └─────┬──────────────┬──────────────┬──────────────────────┘    │
│        │              │              │                            │
│  ┌─────▼──────┐ ┌─────▼──────┐ ┌────▼────────┐ ┌────────────┐  │
│  │ DeviceBind │ │ OtpSession │ │ TOTP Service│ │ Signature  │   │
│  │  Service   │ │  Service   │ │             │ │  Service   │   │
│  └──────┬─────┘ └──────┬─────┘ └─────────────┘ └────────────┘  │
│         │              │                                         │
│  ┌──────▼──────────────▼────────────────────────────────────┐    │
│  │            MongoDB (device_bindings, transaction_otps)    │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

## 1.4. Mô hình bảo mật 3 lớp

```
                    ┌─────────────────────────────┐
                    │   Lớp 3: ECDSA Signature    │ ← "Thiết bị NÀY sở hữu khóa bí mật"
                    │   Chống: Giả mạo thiết bị   │
                    ├─────────────────────────────┤
                    │   Lớp 2: TOTP (6 chữ số)    │ ← "Người dùng ĐANG ở trước thiết bị"
                    │   Chống: Replay attack       │
                    ├─────────────────────────────┤
                    │   Lớp 1: Device Binding      │ ← "Thiết bị NÀY đã được đăng ký"
                    │   Chống: Đánh cắp JWT/token  │
                    └─────────────────────────────┘
```

Mỗi lớp **độc lập** — kẻ tấn công phải vượt qua **cả 3 lớp cùng lúc** mới thực hiện được giao dịch.

## 1.5. Các thành phần chính

### Server (NestJS)

| Service | File | Chức năng |
|---------|------|-----------|
| `SmartOtpService` | `smart-otp.service.ts` | Orchestrator — điều phối tất cả |
| `DeviceBindingService` | `device-binding.service.ts` | Đăng ký/xóa/kiểm tra thiết bị |
| `OtpSessionService` | `otp-session.service.ts` | Quản lý session giao dịch |
| `TotpService` | `totp.service.ts` | Tạo & xác thực TOTP |
| `SignatureService` | `signature.service.ts` | Xác thực chữ ký ECDSA |

### Client (React Native)

| Service | File | Chức năng |
|---------|------|-----------|
| `SmartOTPService` | `smart-otp.service.ts` | Tạo key pair, ký payload, tạo TOTP |

### MongoDB Collections

| Collection | Schema | Dữ liệu |
|-----------|--------|----------|
| `device_bindings` | `DeviceBinding` | publicKey, totpSecret, deviceId, status |
| `transaction_otps` | `TransactionOtp` | sessionId, actionData, status, expiresAt |

---

> **Tiếp theo:** [Chương 2: Thuật toán mã hóa](./02-thuat-toan-ma-hoa.md)
