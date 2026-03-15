# Cơ Chế Chấm Điểm Tín Dụng Hiện Tại Của Hệ Thống

Ngày cập nhật: 2026-03-15

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

## 4. Sự kiện làm thay đổi điểm

Điểm tín dụng hiện được cập nhật tự động khi có giao dịch trả nợ tại Loan Service:

- Trả nợ kỳ hạn (repay)
- Tất toán sớm (prepay)

Luồng xử lý kỹ thuật:

1. Loan Service xử lý repayment/prepayment thành công với Fineract.
2. Loan Service ước lượng số ngày trễ (overdueDays) từ lịch trả nợ.
3. Gọi CreditScoreService.applyRepaymentEvent(...).
4. CreditScoreService cập nhật điểm và ghi lịch sử credit_score_history.

## 5. Công thức chấm điểm hiện tại (đã áp dụng)

Hệ thống hiện tính điểm theo mô hình 5 yếu tố có trọng số, thay vì cộng/trừ điểm cố định:

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

1. Payment history (35%)

- Dựa trên tỷ lệ trả trễ lịch sử, số khoản trễ nặng (>=30 ngày) và sự kiện trả nợ mới nhất.
- Nếu giao dịch mới là đúng hạn: cộng nhẹ vào thành phần payment history.
- Nếu giao dịch mới là trễ hạn: trừ theo số ngày trễ (mức phạt tăng theo overdueDays).

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
Loan Repayment / Prepayment success
    -> estimate overdueDays
    -> applyRepaymentEvent
  -> compute 5 factor scores (35/30/15/10/10)
  -> weighted score 0..100
        -> clamp 150..750
        -> update credit_score
        -> insert credit_score_history
```

## 8. Mapping tham chiếu thị trường

Thiết kế phân hạng rủi ro (150-750) được tham chiếu theo bài viết tổng quan điểm tín dụng từ Techcombank và thông lệ CIC phổ biến trên thị trường Việt Nam.

## 9. Hướng mở rộng (đề xuất)

- Tạo job định kỳ recalculation toàn bộ users để score phản ánh toàn cảnh, không chỉ tại thời điểm repay/prepay.
- Bổ sung thêm data nguồn thu nhập ổn định/khả năng chi trả để tăng độ chính xác cho yếu tố debt level.
