# Kiến trúc Hệ thống (Event-Driven Microservices)

## Tổng quan
Hệ thống hoạt động theo mô hình Event-Driven Microservices nhằm đảm bảo khả năng xử lý thời gian thực (realtime) cho các nghiệp vụ BNPL (Mua trước trả sau) và P2P Lending (Cho vay ngang hàng).

## 1. Các thành phần chính (Components)

### Client App (Super App)
- **Công nghệ**: React Native.
- **Chế độ**: User (Vay/Mua), Investor (Đầu tư), Merchant (Bán hàng).

### API Gateway
- **Chức năng**: Quản lý request, Xác thực (Authentication).
- **Công nghệ**: Tích hợp Keycloak.

### Credit Scoring Engine ("Bộ não" - The Brain)
- **Công nghệ**: Python / FastAPI.
- **Chức năng**: Phân tích dữ liệu, chấm điểm tín dụng, chặn rủi ro.

### Matching Engine ("Trái tim" - The Heart)
- **Công nghệ**: Node.js / NestJS.
- **Chức năng**: Điều phối luồng tiền từ Nhà đầu tư (Investor) sang Người vay (Borrower).

### Core Banking ("Sổ cái" - The Ledger)
- **Công nghệ**: Apache Fineract.
- **Chức năng**: Quản lý sổ cái, số dư ví, khoản vay, tính toán lãi suất.

### Admin Portal
- **Công nghệ**: Web Dashboard.
- **Chức năng**: Cấu hình tham số hệ thống.

## 2. Logic Chi tiết (Deep Dive)

### A. Phân hệ AI & Risk Engine ("Bộ não")
**Luồng dữ liệu (Pipeline)**:
1.  **Input**: Dữ liệu nhân khẩu học (KYC), Lịch sử ví, Lịch sử thanh toán hóa đơn, Thông tin thiết bị.
2.  **Xử lý**:
    *   *Rule-based (Tầng 1)*: Chặn IP nằm trong Blacklist, kiểm tra số dư bằng 0 liên tục.
    *   *AI Model (Tầng 2)*: Logistic Regression / Random Forest (Điểm số 300-850).

**Chiến lược cấp hạn mức (Dynamic Limit)**:
*   **Hạng A (>750)**: Hạn mức cao (10tr), Lãi suất thấp. Được ưu tiên khớp lệnh.
*   **Hạng B (600-750)**: Hạn mức trung bình (5tr).
*   **Hạng C (<600)**: Hạn mức thấp (1tr) hoặc Yêu cầu ký quỹ.

**Phát hiện gian lận (Fraud Detection)**:
*   Kiểm tra realtime khi quét QR.
*   Chặn nếu Giá trị đơn hàng > 50% Thu nhập trung bình tháng.
*   Chặn nếu đang có nợ quá hạn.

### B. Cấu hình Core Banking
**Các loại Ví (Wallet Types)**:
1.  **Payment Wallet** (Tài khoản thanh toán): Nạp/Rút tiền.
2.  **Investment Wallet** (Ví đầu tư): Tiền bị khóa chờ khớp lệnh của Investor.
3.  **Credit Wallet** (Ví hạn mức): Hiển thị sức mua BNPL (ảo).
4.  **Fee Wallet** (Ví thu phí): Chứa phí nền tảng thu được.

**Sản phẩm (Products)**:
*   *Loan Product (Gói BNPL)*: Lãi suất 0% (30 ngày đầu), 3%/tháng sau đó. Trả góp đều.
*   *Savings Product (Gói Đầu tư)*: Lãi suất 12%/năm. Có kỳ hạn khóa vốn.

### C. Phân hệ Matching Engine (P2P)
**Cơ chế**: Gom vốn (Pooling).
**Thuật toán**:
1.  **Pooling**: Investor nạp tiền vào bể "Available for Matching".
2.  **Order**: User thực hiện mua hàng qua BNPL.
3.  **Matching**: Ưu tiên FIFO (Vào trước khớp trước).
4.  **Disbursement (Giải ngân)**: Trừ tiền Investor, Cộng tiền Merchant, Tạo khoản vay cho User.
    *   *Kết quả*: User nợ Investor (Ẩn danh).

## 3. Quy trình Mở Tài khoản (Debit/Savings)
Được ánh xạ vào quy trình onboarding chuẩn ngân hàng của **Fineract**.

### Giai đoạn 1: Client Onboarding (eKYC)
1.  **Thu thập dữ liệu**: App chụp ảnh ID, Selfie, Thông tin cá nhân.
2.  **Xác minh (eKYC)**:
    *   AI Service so khớp Selfie vs ID.
    *   AI kiểm tra thực thể sống (Liveness check).
    *   Kết quả: `VERIFIED` (Đạt) / `REJECTED` (Từ chối).
3.  **Tạo Client trên Fineract**:
    *   Hệ thống gọi `POST /fineract-provider/api/v1/clients`.
    *   Trạng thái: `PENDING` (chờ duyệt) hoặc `ACTIVE` (duyệt tự động).
    *   Upload giấy tờ tùy thân vào `POST /fineract-provider/api/v1/clients/{clientId}/identifiers`.

### Giai đoạn 2: Tạo Ví (Savings Account)
1.  **Tín hiệu**: Ngay khi Client được kích hoạt (Active).
2.  **Hành động**: Hệ thống gọi `POST /fineract-provider/api/v1/savingsaccounts`.
    *   `clientId`: ID từ Giai đoạn 1.
    *   `productId`: ID của sản phẩm "Payment Wallet".
3.  **Kích hoạt**:
    *   Tài khoản thường khởi tạo ở trạng thái `SUBMITTED_AND_PENDING_APPROVAL`.
    *   Hệ thống tự động duyệt qua `POST .../approve` & `POST .../activate` nếu Điểm rủi ro (Risk Score) đạt yêu cầu.

## 4. Quy trình Xác thực (Mô phỏng Visa/Mastercard)
Mô phỏng bảo mật theo chuẩn thẻ quốc tế cho Ví BNPL nội bộ.

### Các thành phần
*   **Issuer (Ngân hàng phát hành)**: Hệ thống của bạn (Fineract + Risk Engine).
*   **Acquirer (Ngân hàng thanh toán)**: Hệ thống Merchant (Mã QR / POS).
*   **Scheme (Tổ chức thẻ)**: P2P Matching Engine (đóng vai trò định tuyến giao dịch).

### Luồng: Mô phỏng 3D Secure (Transaction Authorization)
1.  **Khởi tạo (Initiation)**:
    *   User quét QR -> App gửi `OrderRequest`.
2.  **Phân tích Rủi ro (Risk Analysis)**:
    *   **Risk Engine** phân tích: IP thiết bị, Vị trí, Số tiền, Tần suất giao dịch.
    *   *Rủi ro thấp*: **Frictionless Flow** (Không chạm). Nhảy sang bước 4.
    *   *Rủi ro cao*: **Challenge Flow** (Thử thách). Sang bước 3.
3.  **Thử thách (Challenge - 2FA/OTP)**:
    *   Hệ thống gửi OTP qua SMS/Email (đã đăng ký trong Fineract Client).
    *   User nhập OTP xác thực trên App.
    *   Kiểm tra: `POST /verify-otp`.
4.  **Authorization (Tạm giữ - The "Hold")**:
    *   Kiểm tra số dư `Credit Wallet` (Hạn mức - Đã dùng).
    *   Nếu đủ: **Authorization** được chấp thuận.
    *   *Hành động nội bộ*: Đặt một lệnh "Hold" (Tạm giữ) trên hạn mức khả dụng.
5.  **Capture (Quyết toán - The "Settlement")**:
    *   Matching Engine tìm được Investor phù hợp.
    *   **Quyết toán**:
        *   Trừ tiền Investor (Investment Wallet).
        *   Cộng tiền Merchant (Payment Wallet).
        *   Tạo khoản vay (Loan) cho User.

## 5. Kế hoạch Triển khai (4 Sprints)

1.  **Foundation (Nền móng)**: NestJS, Cấu hình Fineract, Admin, Basic App (Login/KYC).
2.  **The Engine (Cỗ máy)**: Logic Matching (Pool/Match), Merchant QR, Investor Auto-Invest.
3.  **The Brain (Bộ não)**: Python Scoring API, Dynamic Limits (Hạn mức động).
4.  **Polish (Hoàn thiện)**: Dashboard, Kịch bản kiểm thử (Testing scenarios).

## 6. Thiết kế Cơ sở dữ liệu (PostgreSQL Highlights)
*   `system_configs`: Tham số cấu hình nền tảng.
*   `wallets`: Liên kết với Tài khoản Fineract.
*   `credit_profiles`: Điểm tín dụng và Hạn mức.
*   `investments`: Trạng thái vốn của Investor.
*   `loan_matches`: Liên kết Khoản vay với Investor.
