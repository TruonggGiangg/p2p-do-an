# 📘 Smart OTP Documentation

## Tài liệu kỹ thuật hệ thống Smart OTP — P2P Lending

> **Mục tiêu:** Từ người không biết gì → hiểu sâu toàn bộ cơ chế bảo mật OTP.

---

## 📑 Mục lục

| Chương | Nội dung | File |
|--------|---------|------|
| 1 | [Tổng quan Smart OTP](./01-tong-quan-smart-otp.md) | Kiến trúc, so sánh SMS vs Smart OTP, mô hình 3 lớp bảo mật |
| 2 | [Thuật toán mã hóa](./02-thuat-toan-ma-hoa.md) | SHA-256, HMAC, RSA vs ECDSA, DER encoding, Base32 |
| 3 | [TOTP chi tiết](./03-totp-chi-tiet.md) | RFC 6238, Dynamic Truncation, Window Tolerance |
| 4 | [Luồng Device Binding](./04-luong-device-binding.md) | Đăng ký thiết bị, tạo key pair, fingerprint |
| 5 | [Luồng Verify OTP](./05-luong-verify-otp.md) | 2-step transfer, 7 bước kiểm tra server, session lifecycle |

---

## 🗺️ Bản đồ nhanh

```
Người dùng mở App
       │
       ├── Lần đầu → [Chương 4] Đăng ký thiết bị (Device Binding)
       │                  │
       │                  ├── Tạo cặp khóa ECDSA ← [Chương 2]
       │                  ├── Nhận TOTP Secret ← [Chương 3]
       │                  └── Lưu vào SecureStore
       │
       └── Chuyển tiền → [Chương 5] Verify OTP
                             │
                             ├── Bước 1: Khởi tạo (tạo session)
                             └── Bước 2: Xác thực
                                   ├── Tạo OTP offline ← [Chương 3]
                                   ├── Ký chữ ký số ← [Chương 2]
                                   └── Server verify 7 bước
```

---

## 🔐 Tóm tắt 3 lớp bảo mật

```
┌─────────────────────────────────────────────────────────────┐
│ Lớp 1: DEVICE BINDING                                      │
│   → "Thiết bị NÀY có quyền giao dịch?"                     │
│   → deviceId phải khớp trong MongoDB                        │
│   → Chặn: Đánh cắp JWT, dùng thiết bị khác                 │
├─────────────────────────────────────────────────────────────┤
│ Lớp 2: TOTP (6 chữ số)                                     │
│   → "Người dùng ĐANG ở trước thiết bị?"                     │
│   → OTP tạo offline, thay đổi mỗi 30 giây                  │
│   → Chặn: Replay attack, đánh cắp mã cũ                    │
├─────────────────────────────────────────────────────────────┤
│ Lớp 3: ECDSA Digital Signature                              │
│   → "Thiết bị NÀY sở hữu Private Key?"                     │
│   → Ký payload = OTP:timestamp:actionType                   │
│   → Chặn: MITM, giả mạo thiết bị, DB leak                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧮 Thuật toán sử dụng

| Thuật toán | Chuẩn | Sử dụng tại | Thư viện |
|-----------|-------|-------------|----------|
| SHA-256 | FIPS 180-4 | Hash payload, Device ID | `expo-crypto`, `node:crypto` |
| HMAC-SHA1 | RFC 2104 | Nền tảng của TOTP | `otplib` |
| ECDSA P-256 | FIPS 186-4 | Chữ ký số | `elliptic` |
| TOTP | RFC 6238 | Mã OTP 6 chữ số | `otplib` |
| Base32 | RFC 4648 | Encode TOTP Secret | `otplib` |
| DER | ITU-T X.690 | Encode chữ ký ECDSA | `elliptic` |
| AES-256-GCM | FIPS 197 | SecureStore (hardware) | iOS Keychain / Android Keystore |

---

## 📁 Source Code Map

### Server (NestJS)

```
server_do_an_new/src/modules/smart-otp/
├── smart-otp.controller.ts      # API endpoints
├── smart-otp.module.ts           # Module definition
├── services/
│   ├── smart-otp.service.ts      # Orchestrator chính
│   ├── device-binding.service.ts # Quản lý thiết bị
│   ├── otp-session.service.ts    # Quản lý session
│   ├── totp.service.ts           # TOTP generate/verify
│   └── signature.service.ts      # ECDSA verify
├── schemas/
│   ├── device-binding.schema.ts  # MongoDB schema thiết bị
│   └── transaction-otp.schema.ts # MongoDB schema session
├── dto/
│   ├── register-device.dto.ts    # Request đăng ký device
│   └── verify-otp.dto.ts         # Request verify OTP
└── enums/
    ├── otp-action-type.enum.ts   # TRANSFER, LOGIN, ...
    ├── otp-session-status.enum.ts# PENDING, VERIFIED, COMPLETED
    └── device-status.enum.ts     # ACTIVE, REVOKED
```

### Client (React Native)

```
client_new/src/
├── services/
│   └── smart-otp.service.ts      # Tạo key, ký, tạo OTP
├── features/wallet/screens/
│   ├── TransferScreen.tsx        # Bước 1: Khởi tạo
│   └── TransferConfirmScreen.tsx # Bước 2: Xác thực
└── features/profile/components/
    └── SmartOTPSection.tsx        # UI đăng ký thiết bị
```

---

## 📊 Cấu hình hệ thống

| Tham số | Giá trị | Mô tả |
|---------|---------|-------|
| TOTP digits | 6 | Số chữ số OTP |
| TOTP step | 30s | Thời gian 1 window |
| TOTP window | ±2 | Cho phép lệch ±60 giây |
| Session TTL | 5 phút | Thời hạn session |
| Max attempts | 3 | Số lần thử tối đa |
| Lock duration | 5 phút | Thời gian khóa khi sai 3 lần |
| Timestamp tolerance | 120s | Chênh lệch tối đa client-server |
| Max devices | 10 | Số thiết bị tối đa/user |
| ECDSA curve | P-256 | Đường cong elliptic |
| Hash algorithm | SHA-256 | Hàm băm cho signature |
| Secret length | 32 chars | Độ dài TOTP Secret (Base32) |
| TTL auto-delete | 24h | Tự xóa session cũ trong DB |

---

*Tài liệu được tạo lần đầu: 2026-04-05*
*Hệ thống: P2P Lending Platform — Smart OTP Module*
