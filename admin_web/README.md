# P2P Admin Web

Web quản trị cho nền tảng P2P: quản lý loại tài liệu, cấu hình tài liệu theo gói vay, xem lịch sử đồng bộ với Fineract.

## Yêu cầu

- Node 18+
- Tài khoản đăng nhập phải có **role `admin`** trong Keycloak (realm roles).

## Cấu hình

- Copy `.env.example` thành `.env`.
- Đặt `VITE_API_URL` trỏ tới server (mặc định `http://localhost:3001`).

## Chạy

```bash
npm install
npm run dev
```

Mở http://localhost:5174. Đăng nhập bằng tài khoản admin.

## Build

```bash
npm run build
```

File build nằm trong `dist/`.
