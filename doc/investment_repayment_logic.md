# Tài liệu Nghiệp vụ: Đầu tư chung & Phân phối Lãi

Tài liệu này phân tích chi tiết logic nghiệp vụ được tìm thấy trong source code cũ (`p2p-test-4/p2p`), bao gồm cơ chế đầu tư chung (pooling), phân phối trả nợ, và cách hệ thống tính lợi nhuận cho Admin (Spread).

## 1. Đầu tư chung (Pooling Investment)

**Khái niệm**: Cho phép nhiều Lender cùng đầu tư vào một khoản vay (Loan) cho đến khi đủ 100% vốn.

### Logic xử lý
*   **Database**:
    *   `LoanContract`: Lưu thông tin khoản vay.
    *   `InvestmentContract`: Lưu thông tin từng khoản đầu tư của Lender vào Loan đó.
    *   Quan hệ: 1 Loan <-> N Investment.
*   **Điều kiện giải ngân**: Khoản vay chỉ được giải ngân (Disburse) khi tổng số tiền của các Investment đạt đúng bằng số tiền vay.

### Code Reference
**File**: `server/interators/services/LoanDisbursementService.js`

> [!NOTE]
> Hàm `disburseLoan` (dòng 16) kiểm tra tính toàn vẹn trước khi giải ngân.

```javascript
// dòng 69: Kiểm tra loan đã đủ 100% vốn chưa (isFullMatch được tính khi tạo Investment)
if (loan.status !== 'success' || !loan.isFullMatch) {
    throw new Error('Loan chưa đủ 100% vốn');
}
```

**Testing trên Mobile UI (Invest Flow)**:
1.  **Lender A** vào App -> Danh sách "Chờ đầu tư".
2.  Chọn Khoản vay X (Vốn 10tr).
3.  Đầu tư 3tr -> Hệ thống tạo 1 `InvestmentContract`. Loan X status vẫn là `waiting`.
4.  **Lender B** vào App -> Chọn Loan X.
5.  Thấy "Đã gọi vốn: 3tr / 10tr".
6.  Đầu tư 7tr -> Hệ thống tạo 1 `InvestmentContract`.
    *   Trigger: Tổng vốn = 10tr -> Update Loan status = `success` (Sẵn sàng giải ngân).

---

## 2. Phân phối Lãi & Gốc (Repayment Distribution)

**Khái niệm**: Khi Borrower trả tiền định kỳ, hệ thống tự động chia số tiền đó cho các Lender dựa trên tỷ lệ góp vốn của họ.

### Logic xử lý
*   **Trigger**: Borrower thực hiện "Thanh toán" (Repayment).
*   **Luồng tiền**: Ví Borrower -> Admin Escrow -> (Chia nhỏ) -> Ví Lender.
*   **Thuật toán**:
    ```text
    Tỷ lệ sở hữu (Ratio) = Vốn Lender góp / Tổng vốn Loan
    Tiền Lender nhận = Tiền Borrower trả * Ratio
    ```

### Code Reference
**File**: `server/interators/services/RepaymentService.js` (Hàm `processRepayment`)

```javascript
// dòng 90-95: Chuẩn bị dữ liệu calculation
const investmentData = validInvestments.map(inv => ({
    lenderId: inv.lender._id,
    capital: inv.info.capital, // Vốn góp
    totalCapital // Tổng vốn vay
}));

// dòng 451 (trong distributeRepaymentToLenders): Tính tỷ lệ
const ratio = capital / totalCapital;

// dòng 459: Tính tiền chia
const lenderShare = Math.floor(repaymentAmount * ratio);
```

**Testing trên Mobile UI (Repayment Flow)**:
1.  Borrower vào App -> Màn hình "Khoản vay" -> Chi tiết vay.
2.  Bấm "Thanh toán kỳ này" (Ví dụ: 1.2tr).
3.  Server xử lý phân phối.
4.  **Lender A** (góp 30%) check ví: Nhận được thông báo +360k (1.2tr * 30%).
5.  **Lender B** (góp 70%) check ví: Nhận được thông báo +840k (1.2tr * 70%).

---

## 3. Tiền Kỳ Hạn & Lợi nhuận Admin (Fixed Deposit / Spread)

**Khái niệm**: Đây là **nghiệp vụ quan trọng nhất** để sàn kiếm tiền. Thay vì trả toàn bộ lãi suất Borrower đóng cho Lender, hệ thống dùng lãi suất "Tiền gửi kỳ hạn" (Fixed Deposit) để trả cho Lender. Phần chênh lệch (Spread) là lợi nhuận Admin.

### Logic xử lý
*   **Borrower Rate (Lãi vay)**: Ví dụ 12%/năm.
*   **Lender FD Rate (Lãi gửi)**: Ví dụ 10%/năm.
*   **Spread (Admin hưởng)**: 2%/năm.
*   **Cơ chế Fineract**:
    1.  Tiền đầu tư của Lender thực chất được gửi vào một **Fixed Deposit Account** trên Core Banking lãi suất 10%.
    2.  Khi Borrower trả tiền (lãi 12%), hệ thống tính toán phần lãi 10% chuyển cho Lender.
    3.  Phần dư còn lại nằm lại tài khoản Escrow của Admin -> Doanh thu sàn.

### Code Reference
**File**: `server/interators/connectors/FineractEscrowService.js` (Hàm `distributeRepaymentToLendersWithFD`)

> [!IMPORTANT]
> Đây là đoạn code tính toán việc "giữ lại tiền lời" cho Admin.

```javascript
// dòng 772-773: Tính gốc và lãi từ khoản trả của Borrower (theo lãi suất vay 12%)
const monthlyPrincipal = repaymentAmount / (1 + (borrowerInterestRate / 100 / 12));
const monthlyInterest = repaymentAmount - monthlyPrincipal;

// dòng 781-782: Tính lại phần Lender được nhận (theo lãi suất gửi 10%)
// Tỷ lệ (fdRate / borrowerInterestRate) < 1 sẽ làm giảm số tiền lãi Lender nhận -> Admin giữ phần dư
const principalShare = Math.floor(monthlyPrincipal * ratio);
const interestShare = Math.floor(monthlyInterest * (fdRate / borrowerInterestRate) * ratio); 

const totalShare = principalShare + interestShare; // Tiền thực tế chuyển cho Lender
```

### Minh họa số liệu
*   Khoản vay 100tr, 12 tháng.
*   **Borrower** trả lãi tháng 1: **1.000.000 VNĐ** (12%).
*   **Lender** (rate 10%):
    *   Hệ thống tính: 1tr * (10/12) = **833.333 VNĐ**.
*   **Admin Spread**: 1.000.000 - 833.333 = **166.667 VNĐ**.

**Testing trên Mobile UI**:
1.  Admin config lãi suất vay 12%, lãi suất đầu tư 10%.
2.  Borrower thanh toán 1 kỳ.
3.  Lender kiểm tra "Lịch sử giao dịch": Thấy nhận được tiền lãi ít hơn số tiền Borrower trả (tương ứng rate 10%).
4.  Admin kiểm tra ví hệ thống: Thấy số dư tăng lên (phần Spread).

---

## 4. Tất toán trước hạn & Đóng FD sớm (Prepayment Flow)

**Khái niệm**: Khi Borrower trả toàn bộ khoản vay trước hạn (Prepay), hệ thống phải **tất toán sớm** các khoản Fixed Deposit (FD) tương ứng của Lenders để hoàn trả vốn + lãi tính đến thời điểm hiện tại.

### Logic xử lý
*   **Trigger**: Borrower chọn "Tất toán khoản vay" (Prepay Loan).
*   **Hành động**:
    1.  Borrower thanh toán số tiền = Dư nợ gốc còn lại + Lãi tính đến ngày trả.
    2.  Hệ thống đóng (Close Premature) các tài khoản FD của Lenders.
    3.  Lender nhận về: Gốc đầu tư + Lãi FD tính đến ngày đóng.
    4.  Admin giữ lại phần chênh lệch Spread của toàn bộ quá trình vay.

### Code Reference & Log Analysis
**File**: `server/interators/connectors/FineractEscrowService.js` & `RepaymentService.js`

> [!WARNING]
> Việc đóng FD trước hạn có thể làm lãi suất thực nhận của Lender thấp hơn dự kiến nếu Fineract được cấu hình phạt rút trước hạn. Tuy nhiên trong log hiện tại, Lender vẫn nhận lãi (accrued interest).

**Minh họa từ Log thực tế**:
1.  **Prepay Check**:
    *   Principal: 10,000,000 VND.
    *   Interest: ~700,000 VND.
    *   Borrower trả: **10,699,000 VND**.
2.  **Repayment Distribution**:
    *   Hệ thống thực hiện `Closing Fixed Deposit (premature close)`.
    *   **Lender A** (70%): Nhận lại Gốc (7tr) + Lãi (74k).
    *   **Lender B** (25%): Nhận lại Gốc (2.5tr) + Lãi (26k).
    *   **Lender C** (5%): Nhận lại Gốc (500k) + Lãi (5.2k).
3.  **Admin Profit (Spread)**:
    *   Tổng lãi Borrower trả: **132,195 VND**.
    *   Tổng lãi chia Lenders: **105,776 VND**.
    *   Admin Profit: **26,419 VND** (~20% tổng lãi).

**Testing trên Mobile UI**:
1.  Borrower vào App -> Chi tiết khoản vay đang hoạt động.
2.  Chọn "Tất toán khoản vay" (thường ở menu phụ hoặc nút cuối màn hình).
3.  Xác nhận thanh toán số tiền lớn (Gốc + Lãi).
4.  Lender kiểm tra: Tài khoản đầu tư được hoàn tiền về ví chính (hoặc ví đầu tư rảnh rỗi), kèm theo thông báo "Tất toán hợp đồng đầu tư".
