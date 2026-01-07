---
sidebar_position: 1
title: Overview
---

# 🔐 Auth Service (Dịch vụ Xác thực)

**Auth Service** chịu trách nhiệm quản lý định danh người dùng, đăng ký, đăng nhập và bảo mật phiên làm việc. Hệ thống sử dụng chiến lược **Dual Authentication** (Xác thực kép) kết hợp giữa cơ sở dữ liệu nội bộ (MongoDB) và Keycloak (IAM).

:::info Repository
*   **Controllers**: `server/interators/controllers/AuthControllers.js`
*   **Middleware**: `server/interators/middlewares/keycloakAuth.js`
*   **Model**: `server/data/model/Users.js`
:::

## 🏗️ Kiến trúc Dual Auth

Hệ thống duy trì song song hai lớp xác thực:

1.  **Lớp P2P (MongoDB)**:
    *   Lưu thông tin cơ bản: SĐT, Mật khẩu (bcrypt), Category (Borrower/Lender).
    *   Sinh JWT Token nội bộ (`JWT_AUTH`) cho các session ngắn hạn.
    *   Quản lý OTP và quy trình đăng ký.

2.  **Lớp Core Banking (Keycloak/Fineract)**:
    *   **Identity & Access Management (IAM)**: Keycloak quản lý user tập trung.
    *   **Single Sign-On (SSO)**: Token của Keycloak được dùng để gọi các API của Fineract và các microservices khác.
    *   **Public Key Infrastructure (PKI)**: Sử dụng RSA256 để ký và xác thực token.

## 🔄 Quy trình Đăng ký (Sign Up Flow)

1.  **Request OTP**: User nhập SĐT -> Hệ thống gửi OTP (Email/SMS).
2.  **Verify & Register**: User nhập OTP + Password.
3.  **Create P2P User**: Lưu vào MongoDB (`Users` collection).
4.  **Link Fineract**:
    *   Hệ thống tự động liên kết (Auto-link) với Fineract Client nếu SĐT trùng khớp.
    *   Cập nhật `fineractClientId` và `fineractWalletId`.

## 🔑 Token Management

*   **Access Token (P2P)**: Dùng cho các tác vụ nội bộ (VD: Upload KYC, xem thông tin profile P2P).
*   **Access Token (Keycloak)**: Dùng để gọi API Fineract (VD: Tạo khoản vay, Chuyển tiền). Middleware `keycloakAuth.js` sẽ validate token này bằng Public Key từ Keycloak Server.

```javascript
// Middleware Example
const verified = jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: `${KEYCLOAK_BASE_URL}/realms/${REALM}`
});
```
