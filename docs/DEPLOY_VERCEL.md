# Hướng dẫn Deploy lên Vercel

Tài liệu này hướng dẫn cách đưa trang Documentation này lên **Vercel** một cách chuyên nghiệp nhất.

## 1. Chuẩn bị (Prerequisites)

- Có tài khoản [Vercel](https://vercel.com/).
- Project đã được push lên **GitHub**, **GitLab** hoặc **Bitbucket**.

## 2. Các bước thực hiện trên Vercel Dashboard

### Bước 1: Import Project
1. Đăng nhập vào Vercel.
2. Nhấn nút **"Add New"** -> **"Project"**.
3. Chọn Repository chứa dự án P2P này.

### Bước 2: Cấu hình Project (IMPORTANT)
Nếu Repo của bạn là Monorepo (chứa cả server, client, app, docs), hãy chú ý các thông số sau:

- **Root Directory**: Chọn thư mục `docs` (hoặc thư mục chứa file `package.json` của tài liệu này).
- **Framework Preset**: Chọn **Docusaurus 2** (Vercel dùng chung cho bản 2 và 3).
- **Build Command**: `npm run build`
- **Output Directory**: `build`
- **Install Command**: `npm install`

### Bước 3: Deploy
- Nhấn **"Deploy"**. Vercel sẽ tự động chạy build và cung cấp cho bạn một URL (ví dụ: `https://p2p-docs.vercel.app`).

## 3. Cấu hình Domain (Tùy chọn)
- Nếu bạn có domain riêng, hãy vào tab **"Settings"** -> **"Domains"** trên project Vercel để cấu hình.

## 4. Ghi chú về Docusaurus Config
Trong file `docusaurus.config.ts`, hãy đảm bảo bạn đã cập nhật:
- `url`: Địa chỉ URL thật của bạn trên Vercel.
- `baseUrl`: Giữ là `'/'` nếu bạn deploy vào root domain.

---
:::tip Mẹo nhỏ
Mỗi khi bạn `git push` lên nhánh `main`, Vercel sẽ tự động deploy lại phiên bản mới nhất. Bạn không cần phải làm gì thêm!
:::
