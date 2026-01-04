# Kế hoạch Test - FD Tracking with Direct Distribution

## Mục tiêu
Kiểm tra luồng trả nợ và tất toán hoạt động chính xác với mô hình phân phối trực tiếp gốc + lãi.

---

## Test Cases

### 1. Trả nợ định kỳ đầy đủ (12 kỳ)

**Điều kiện:**
- Tạo khoản vay 1,000,000 VND, 12 tháng, 18%/năm
- 2 nhà đầu tư, mỗi người 500,000 VND
- FDs được tạo

**Các bước:**
1. Borrower trả nợ 12 kỳ (92,000 VND/kỳ)
2. Kỳ cuối cùng tự động đóng FDs

**Kết quả mong đợi:**
- [ ] Mỗi kỳ: Lender nhận P+I từ Escrow (45,000 VND/người)
- [ ] Kỳ 12: FDs tự động CLOSED
- [ ] FD proceeds hoàn về Admin (Reimbursement)
- [ ] Label UI: "Trả nợ" cho các kỳ thường, không có Tất toán
- [ ] Lợi nhuận platform ~3% (8,000-10,000 VND)

---

### 2. Trả nợ 1 phần + Tất toán (Prepayment)

**Điều kiện:**
- Tạo khoản vay 1,000,000 VND, 12 tháng, 18%/năm
- 2 nhà đầu tư

**Các bước:**
1. Borrower trả 4 kỳ đầu (368,000 VND)
2. Borrower tất toán phần còn lại (~732,000 VND)

**Kết quả mong đợi:**
- [ ] 4 kỳ đầu: Lender nhận P+I (45,000-46,000/người/kỳ)
- [ ] Tất toán: FDs được CLOSED tự động
- [ ] FD proceeds → Admin (Reimbursement)
- [ ] Lender nhận interest từ Escrow
- [ ] Label UI: Kỳ 1-4 "Trả nợ", kỳ cuối "Tất toán"
- [ ] Lợi nhuận platform ~3%

---

### 3. Tất toán ngay từ đầu

**Điều kiện:**
- Tạo khoản vay mới, chưa trả kỳ nào

**Các bước:**
1. Borrower tất toán ngay (dùng endpoint `/prepay`)

**Kết quả mong đợi:**
- [ ] FDs CLOSED
- [ ] Lender nhận: Vốn + Lãi tỷ lệ thời gian
- [ ] FD proceeds → Admin
- [ ] UI: Chỉ 1 giao dịch "Tất toán"

---

## Kiểm tra UI Cash Flow (mifos-web-app)

### Regex Matching
| Giao dịch | Description | Expected Label |
|-----------|-------------|----------------|
| Borrower → Admin | `Trả nợ for loan: LOAN_XXX` | Trả nợ |
| Borrower → Admin | `Trả nợ (Tất toán) for loan: LOAN_XXX` | Tất toán |
| Admin → Lender | `Interest distribution for loan: LOAN_XXX` | Phân phối lãi cho nhà đầu tư |
| Admin → Lender | `Disbursement for loan: LOAN_XXX` | Giải ngân |
| Lender → Admin | `Escrow for loan: LOAN_XXX` | Ký quỹ đầu tư |

### Profit Calculation
- [ ] Lợi nhuận = Trả nợ - (Phân phối + Auto-transfer + Refund)
- [ ] KHÔNG trừ FD Reimbursement (vì đó là hoàn vốn nội bộ)
- [ ] Tỷ lệ lợi nhuận: 2-4% là bình thường, >10% là bất thường

---

## Lệnh Test

```bash
# Chạy test script (nếu có)
node server_do_an/scripts/test-fd-distribution.js

# Hoặc test thủ công qua Postman/curl

# 1. Tạo khoản vay
POST http://localhost:3001/loan/create
{
  "capital": 1000000,
  "periodMonth": 12,
  "willing": "Mua xe máy",
  "disbursementDate": "2026-01-05"
}

# 2. Đầu tư
POST http://localhost:3001/invest
{
  "loanContractId": "LOAN_XXX",
  "amount": 500000
}

# 3. Trả nợ định kỳ
POST http://localhost:3001/repayment/repay
{
  "loanId": 217,
  "amount": 92000
}

# 4. Tất toán
POST http://localhost:3001/repayment/prepay
{
  "loanId": 217
}
```

---

## Debug Logs để kiểm tra

```
# Khi trả nợ thành công:
[Repayment] AUTO-DETECTED FINAL PAYMENT: Outstanding balance = 0

# Khi đóng FD:
[FD Closure] Closing FD XXX to ADMIN for REIMBURSEMENT
✓ Closed FD XXX, Reimbursement amount: XXX

# Khi phân phối lãi:
[Regular Repayment] Distributing FULL: XXX (P: XXX, I: XXX)
```

---

## Checklist sau khi fix

- [ ] NestJS server đã restart và nhận code mới
- [ ] Test Case 2 pass (trả 1 phần + tất toán)
- [ ] FDs được đánh dấu CLOSED trong Fineract
- [ ] UI Cash Flow hiển thị đúng labels
- [ ] Profit calculation hợp lý (~3%)
