# Cơ Chế Chấm Điểm Tín Dụng Hiện Tại Của Hệ Thống

Ngày cập nhật: 2026-03-26

## 1. Mục tiêu

Tài liệu này mô tả chính xác cách hệ thống đang tính, cộng/trừ và phân loại điểm tín dụng nội bộ cho người dùng trong ứng dụng P2P.

Lưu ý:

- Hệ thống nội bộ được thiết kế tham chiếu theo thang điểm CIC phổ biến trên thị trường (150-750).
- Đây không phải điểm CIC chính thức do CIC cấp.

## 2. Thang điểm và phân loại rủi ro

Hệ thống dùng thang điểm: 150 -> 750.

Bảng phân loại hiện tại:

| Khoảng điểm | Mức rủi ro        | Mô tả xét duyệt                               |
| ----------- | ----------------- | --------------------------------------------- |
| 150-321     | Rủi ro rất cao    | Không đủ điều kiện vay vốn                    |
| 322-430     | Rủi ro cao        | Khả năng trả nợ thấp                          |
| 431-569     | Rủi ro trung bình | Có thể vay nhưng điều kiện xét duyệt chặt hơn |
| 570-679     | Rủi ro thấp       | Khả năng trả nợ tốt, điều kiện vay thuận lợi  |
| 680-750     | Rủi ro rất thấp   | Khả năng duyệt cao, lãi suất/hạn mức tốt      |

## 3. Điểm khởi tạo

Khi user mới đăng ký hoặc user cũ login mà chưa có hồ sơ điểm tín dụng:

- Tạo bản ghi credit_score mới với điểm mặc định: 570
- Ghi 1 bản ghi lịch sử credit_score_history:
  - reason: initial_account_creation
  - changeAmount: 0

### 3.1. Làm rõ về “điểm mặc định” theo nguồn công khai

- Theo nguồn tham chiếu thị trường (bài tổng quan Techcombank về điểm CIC), nội dung công khai nêu thang điểm và yếu tố ảnh hưởng, nhưng không công bố một con số “mặc định khi mới tạo” áp dụng chung cho mọi cá nhân.
- Với chấm điểm tín dụng thực tế, điểm được hình thành từ lịch sử tín dụng và dữ liệu hành vi tín dụng của từng người.
- Vì vậy, giá trị 570 trong hệ thống này là điểm khởi tạo nội bộ (internal bootstrap score) do hệ thống quy ước để bắt đầu chấm điểm cho user chưa có dữ liệu, không phải điểm CIC mặc định chính thức.

## 4. Kiến trúc Hướng Sự Kiện (Event-Driven Architecture)

Điểm tín dụng tĩnh (Credit Score) của user **không thay đổi nếu họ không có hành động gì mới**. Hệ thống **KHÔNG dùng cronjob quét định kỳ (polling)** mà chỉ kích hoạt tính toán lại điểm khi bắt được **3 Sự kiện cốt lõi (Core Events)**:

### Sự kiện 1: Thanh toán thành công (Repayment Made)

Khi user thanh toán một kỳ hạn (EMI) hoặc tất toán sớm, Fineract ghi nhận và báo về NestJS.

Luồng xử lý:

1. `RepaymentService.makeRepayment()` / `prepayLoan()` xử lý thành công với Fineract.
2. Ước lượng `overdueDays` từ lịch trả nợ.
3. Gọi `CreditScoreService.applyRepaymentEvent(...)`.
4. CreditScoreService cập nhật điểm và ghi lịch sử.

Trigger: `loan_repayment` hoặc `loan_prepayment`

### Sự kiện 2: Trễ hạn / Nợ xấu (Delinquency / Default) — Batch Job hàng đêm

Đây là ngoại lệ duy nhất dùng Batch Job, chạy mỗi đêm lúc **00:00** (sau khi Fineract sync delinquency data).

Luồng xử lý:

1. `@Cron('0 0 * * *') handleDelinquencyBatchJob()` khởi chạy.
2. Quét toàn bộ `loan_applications` có `status: 'disbursed'` và `delinquentDays > 0`.
3. Với mỗi khoản quá hạn, kiểm tra đã trừ điểm trong 24h chưa (tránh trùng lặp).
4. Nếu chưa → gọi `applyRepaymentEvent(isLatePayment: true, overdueDays)` để trừ điểm.

Trigger: `delinquency_batch`

### Sự kiện 3: Khoản vay mới được giải ngân (Loan Disbursed)

Khi Admin giải ngân khoản vay, tổng dư nợ (Debt) tăng và "Tín dụng mới" (New Credit) phát sinh.

Luồng xử lý:

1. `AdminLoanService.disburseLoan()` thực hiện giải ngân trên Fineract.
2. Update MongoDB `status = 'disbursed'`.
3. Gọi `CreditScoreService.applyDisbursementEvent(userId)`.
4. CreditScoreService tính lại toàn bộ 5 yếu tố dựa trên data hiện tại.

Trigger: `loan_disbursed`

### Lưu ý quan trọng

- Khi user chỉ mới **"Tạo hồ sơ xin vay"** (status: pending), điểm tín dụng tĩnh **KHÔNG thay đổi**.
- Lúc đó hệ thống chỉ mang điểm tĩnh đi hỏi server AI để lấy "Điểm rủi ro AI" (`aiScore`) cho riêng hồ sơ đó.

## 5. Công thức chấm điểm hiện tại (đã áp dụng)

Hệ thống hiện tính điểm theo mô hình 5 yếu tố có trọng số:

- Payment history: 35%
- Debt level: 30%
- Credit age: 15%
- Credit mix: 10%
- New credit: 10%

Mỗi yếu tố được chấm trên thang 0-100, sau đó tính điểm tổng hợp:

```text
weighted100 =
  paymentHistory * 0.35 +
  debtLevel * 0.30 +
  creditAge * 0.15 +
  creditMix * 0.10 +
  newCredit * 0.10

creditScore = clamp(150 + weighted100/100 * 600, 150, 750)
```

### 5.1. Cách chấm từng yếu tố

1. Payment history (35%) — Có Volume Penalty Factor

- Dựa trên tỷ lệ trả trễ lịch sử, số khoản trễ nặng (>=30 ngày) và sự kiện trả nợ mới nhất.

**Volume Penalty Factor (Thin Credit File Protection):**

Người dùng có ít giao dịch không thể đạt 100/100 ngay. Áp dụng hệ số chiết khấu theo khối lượng:

```
Score_payment = Score_ratio × W_volume
```

| Level                     | Số giao dịch | W_volume | Điểm tối đa |
| ------------------------- | ------------ | -------- | ----------- |
| Level 1 (Hồ sơ siêu mỏng) | 1 - 4        | 0.60     | 60/100      |
| Level 2 (Hồ sơ cơ bản)    | 5 - 10       | 0.80     | 80/100      |
| Level 3 (Hồ sơ chín muồi) | > 10         | 1.00     | 100/100     |

Ví dụ: User mới có 4 khoản vay trả đúng hạn → 100 × 0.6 = 60/100 (không phải 100/100).

- Nếu giao dịch mới là đúng hạn: cộng nhẹ (+3, prepay +5).
- Nếu giao dịch mới là trễ hạn: trừ theo số ngày trễ (overdueDays × 1.2, tối đa -25).
- Số khoản trễ nặng (>=30 ngày): trừ thêm 4 điểm/khoản.

2. Debt level (30%)

- Dựa trên debtRatio = totalOutstanding / totalCapital từ toàn bộ khoản vay user.
- Debt ratio càng thấp thì điểm thành phần càng cao.

3. Credit age (15%)

- Dựa trên tuổi khoản vay lâu nhất (tháng).
- Lịch sử tín dụng càng dài thì điểm càng cao.

4. Credit mix (10%)

- Dựa trên độ đa dạng sản phẩm vay (số productId khác nhau).
- Có khoản vay đã đóng thành công giúp tăng điểm thành phần.

5. New credit (10%)

- Dựa trên số khoản vay mở mới trong 90 ngày gần nhất.
- Mở quá nhiều khoản vay mới trong thời gian ngắn sẽ giảm điểm thành phần.

### 5.2. Giới hạn điểm

- Min: 150
- Max: 750

## 6. Các trường dữ liệu được cập nhật

Khi có sự kiện scoring:

Bảng credit_score:

- score: cập nhật điểm mới
- latePayments: tăng +1 nếu là giao dịch trễ hạn
- totalLoans: đồng bộ theo tổng số khoản vay thực tế của user
- lastUpdated: thời điểm cập nhật

Bảng credit_score_history:

- userId
- creditScoreId
- beforeScore
- afterScore
- changeAmount
- reason: loan_repayment | loan_prepayment | late_payment | ...
- trigger
- note
- createdAt

## 7. Pseudo-flow

```text
── Event 1: Thanh toán ──
Loan Repayment / Prepayment success (Fineract)
  → RepaymentService estimate overdueDays
  → CreditScoreService.applyRepaymentEvent(...)
    → compute 5 factor scores (with Volume Penalty)
    → weighted score 0..100 → clamp 150..750
    → update credit_score
    → insert credit_score_history

── Event 2: Nợ xấu (Batch Job 0h hàng đêm) ──
@Cron('0 0 * * *') handleDelinquencyBatchJob()
  → query loan_applications where status='disbursed' AND delinquentDays > 0
  → for each overdue loan (chưa trừ trong 24h)
    → applyRepaymentEvent(isLatePayment=true, overdueDays)
    → trừ điểm + ghi history

── Event 3: Giải ngân ──
AdminLoanService.disburseLoan()
  → Fineract disburse
  → update MongoDB status='disbursed'
  → CreditScoreService.applyDisbursementEvent(userId)
    → compute 5 factor scores (Debt Level & New Credit thay đổi)
    → weighted score 0..100 → clamp 150..750
    → update credit_score
    → insert credit_score_history
```

## 8. Mapping tham chiếu thị trường

Thiết kế phân hạng rủi ro (150-750) được tham chiếu theo bài viết tổng quan điểm tín dụng từ Techcombank và thông lệ CIC phổ biến trên thị trường Việt Nam.

## 9. Hướng mở rộng (đề xuất)

- Bổ sung thêm data nguồn thu nhập ổn định/khả năng chi trả để tăng độ chính xác cho yếu tố debt level.
- Tích hợp Blockchain để ghi lại audit trail cho mỗi lần thay đổi điểm.
- Mở rộng Volume Penalty Factor cho các yếu tố khác (credit age, credit mix) nếu cần.
