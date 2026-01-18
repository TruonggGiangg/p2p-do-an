# 📋 Báo Cáo Tiến Độ & Kế Hoạch Phát Triển P2P Lending Platform

> **Dự án:** Hệ thống P2P Lending (với tích hợp Keycloak & Apache Fineract)
> **Cập nhật:** 19/01/2026
> **Trạng thái:** Foundation Complete - Core Features In Progress

---

## 🛠️ Giải Thích Chức Năng Hiện Có

### 1. Hệ Thống Định Danh (Identity & Access Management)
- **Keycloak Integration**: Sử dụng Keycloak làm Single Source of Truth cho user.
- **Hệ thống Token**: Hỗ trợ JWT Access Token (ngắn hạn) và Refresh Token (dài hạn, lưu qua HttpOnly Cookie trên web hoặc Secure Storage trên mobile).
- **User Sync Logic**: Tự động đồng bộ thông tin giữa Keycloak, Fineract (Core Banking) và MongoDB Schema mỗi khi người dùng thao tác.

### 2. Quản Lý Ví (Wallet Management)
- **Đa Loại Ví**: Hỗ trợ hiển thị và quản lý nhiều loại ví từ Fineract (Ví điện tử - EWALLET, Ví Trả Sau - CW01).
- **Real-time Sync**: Số dư và trạng thái ví được fetch trực tiếp từ Fineract API để đảm bảo tính chính xác tuyệt đối.
- **MongoDB Reference**: MongoDB chỉ lưu các ID tham chiếu để tối ưu hiệu năng và tránh sai lệch dữ liệu tài chính.

### 3. Quy Trình Đăng Ký Đa Nền Tảng (Atomic Registration)
- Khi người dùng đăng ký:
    1. Tạo User trên **Keycloak** (cho Auth).
    2. Tạo Client trên **Fineract** (cho Finance).
    3. Tạo 2 tài khoản tiết kiệm mặc định (E-Wallet & BNPL Wallet) trên **Fineract**.
    4. Lưu bản ghi người dùng và tham chiếu ví trên **MongoDB Atlas**.

---

## ✅ Đã Làm Được (Done)

### Backend (NestJS Server)
- [x] Thiết lập kiến trúc Microservices (Server - Keycloak - Fineract).
- [x] API Auth (Login, Register, Refresh, Logout, Me).
- [x] API Wallets (Get list, Get detailed, Sync, Total Balance).
- [x] Global Security (JWT Guard, Throttler Guard cho Rate Limiting, CORS).
- [x] Global Exception Filter & Logging Interceptor.
- [x] **Dọn dẹp mã nguồn (Senior Cleanup)**:
    - [x] Mô-đun hóa Keycloak & Fineract thành các Global Module độc lập.
    - [x] Tập trung hóa Axios Client với Interceptor tự động xử lý Token.
    - [x] Loại bỏ trùng lặp mã nguồn (DRY) trong các service Auth, Wallets, Sync.
    - [x] Sử dụng Decorator `@CurrentUser` và tinh gọn Controller.
- [x] **Quản lý cấu hình (Configuration Cleanup)**:
    - [x] Externalize toàn bộ các key cứng (`.env`) và cấu trúc hóa qua `ConfigService`.
    - [x] Triển khai Environment Validation (class-validator) cho toàn bộ biến môi trường.
    - [x] Chuẩn hóa lại cấu trúc tệp `.env` theo nhóm chức năng chuyên nghiệp.
- [x] Tài liệu kỹ thuật: Class Diagram & Sequence Diagrams chi tiết.

### Frontend (Expo Mobile)
- [x] Navigation: Bottom Tab Navigation + Auth Flow.
- [x] Authentication: Login & Register UI chuẩn.
- [x] Home Dashboard: Hiển thị danh sách ví, định dạng tiền tệ ViNa.
- [x] Profile: Xem thông tin tài khoản và trạng thái đồng bộ hệ thống.
- [x] Cơ chế Refresh Token tự động khi Access Token hết hạn.

---

## ⏳ Chưa Làm Được & Kế Hoạch Tiếp Theo (Pending)

### 🚀 Giai Đoạn 1: BNPL (Buy Now Pay Later) 2.0 - Virtual Credit Wallet
- [ ] **Technical Architecture**: Mapping 1-N (1 Ví trả sau trên App ↔ Nhiều khoản vay trên Fineract).
- [ ] **Mô phỏng hạn mức (Credit Limit)**: Logic tính toán hạn mức khả dụng bằng cách trừ dư nợ các khoản vay BNPL đang active.
- [ ] **Auto Checkout**: API thanh toán đơn hàng bằng BNPL (Tạo Loan -> Approve -> Disburse tự động).
- [ ] **Thống kê dư nợ**: Màn hình hiển thị danh sách các đơn hàng vay trả sau và ngày thanh toán dự kiến (0% lãi).


### 💰 Giai Đoạn 2: Giao Dịch Tài Chính
- [ ] Nạp tiền (Deposit) vào Ví điện tử.
- [ ] Rút tiền (Withdraw) về tài khoản ngân hàng liên kết.
- [ ] Chuyển tiền nội bộ (Transfer) giữa các người dùng.
- [ ] Lịch sử giao dịch (Transaction History) tích hợp.

### ⚖️ Giai Đoạn 3: Khoản Vay Consumer (Vay Tiêu Dùng)
- [ ] Quy trình nộp hồ sơ vay (Apply for Loan).
- [ ] Danh sách các gói vay hỗ trợ.
- [ ] Lịch trả nợ (Repayment Schedule).

---

## ⚠️ Nợ Kỹ Thuật (Technical Debt)

1. **Webhooks Integration**: Hiện tại việc cập nhật số dư phụ thuộc vào việc "Pull" data. Cần triển khai Fineract Webhooks để cập nhật "Push" realtime (ví dụ khi nạp tiền tại quầy/chuyển khoản ngoài).
2. **Connectivity Resilience**: Cần cơ chế Retry logic và Circuit Breaker khi kết nối giữa NestJS và Fineract/Keycloak gặp sự cố.
3. **Unit Tests**: Coverage hiện tại bằng 0. Cần viết Unit Test cho `AuthService`, `WalletsService` và `UserSyncService`.
4. **Data Cleanup**: Cơ chế dọn dẹp các user/client "rác" khi quá trình khởi tạo bị lỗi giữa chừng (Compensating Transactions).

---

*Người thực hiện: Antigravity AI*
