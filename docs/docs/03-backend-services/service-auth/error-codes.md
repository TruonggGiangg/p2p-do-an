---
sidebar_position: 3
title: Error Codes
---

# ⚠️ Error Codes (Auth)

Bảng mã lỗi liên quan đến xác thực và người dùng.

:::tip Định dạng cấu trúc
Tất cả response lỗi đều tuân theo chuẩn trả về:
```json
{
  "code": 400 | 401 | 403 | 500,
  "data": "Message string"
}
```
:::

## Common Errors

| Code | Message Key | Mô tả VN | Ghi chú |
|------|-------------|----------|---------|
| 401 | `common.incorrectTokenErr` | Mã token không đúng | Token hết hạn hoặc sai signature |
| 403 | `common.permissionErr` | Bạn không có quyền thực hiện chức năng này | Role không đủ quyền |
| 500 | `common.internalErr` | Server bị lỗi | Lỗi không xác định |

## User & Auth Errors

| Code | Message Key | Mô tả VN | Nguyên nhân |
|------|-------------|----------|-------------|
| 400 | `users.existPhone` | Số điện thoại đã được sử dụng | Đăng ký trùng SĐT |
| 400 | `users.incorrectAcc` | Tài khoản không tồn tại | Đăng nhập sai SĐT |
| 400 | `users.incorrectPass` | Mật khẩu không chính xác | Đăng nhập sai Pass |
| 400 | `registers.incorrectCode` | Mã xác thực không đúng | Nhập sai OTP |
| 400 | `registers.incorrectPhone` | Tài khoản chưa được đăng ký mã xác thực | Yêu cầu OTP cho SĐT lạ |

## Keycloak Errors

Khi gọi API liên quan đến Keycloak (VD: Reset password), lỗi có thể trả về từ Keycloak Server:

*   **401 Unauthorized**: Admin token hết hạn hoặc sai credentials cấu hình.
*   **404 Not Found**: User không tồn tại trên Keycloak (dù có thể có trên MongoDB).
*   **409 Conflict**: Trùng Email/Username trên Keycloak.
