# Cơ Chế Chấm Điểm Tín Dụng Hiện Tại Của Hệ Thống

Ngày cập nhật: 2026-04-07

## 1. Mục tiêu

Tài liệu này mô tả chính xác cách hệ thống tính toán và phân loại điểm tín dụng nội bộ cho người dùng trong ứng dụng P2P, sử dụng mô hình **Scorecard 2.0** dựa trên thuật toán **Hồi quy Logistic (Logistic Regression)** kết hợp kỹ thuật **Trọng số Bằng chứng (Weight of Evidence — WOE)**.

Lưu ý:

- Hệ thống nội bộ được thiết kế tham chiếu theo thang điểm CIC phổ biến trên thị trường (150-750) và áp dụng phương pháp luận Scorecard chuẩn quốc tế.
- Hệ thống **KHÔNG sử dụng** các phép tính cộng trừ điểm tĩnh đơn giản, mà là kết quả của quy trình tính toán dựa trên mô hình Thẻ điểm (Scorecard) với WOE binning và Logistic Regression.
- Đây không phải điểm CIC chính thức do CIC cấp, nhưng tuân thủ cùng phương pháp luận toán học.

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

Điểm tín dụng tĩnh (Credit Score) của user **không thay đổi nếu họ không có hành động gì mới**. Hệ thống **KHÔNG dùng cronjob quét định kỳ (polling)** mà chỉ kích hoạt tính toán lại điểm khi bắt được **4 Sự kiện cốt lõi (Core Events)**:

### Sự kiện 0: Đăng nhập (User Login)

Khi user đăng nhập thành công, hệ thống tự động tính lại điểm tín dụng ở background (non-blocking).

Luồng xử lý:

1. `AuthController.login()` xác thực qua Keycloak, sync user.
2. Sau khi generate JWT token, gọi `CreditScoreService.recalculateScore(userId)` (fire-and-forget).
3. Điểm được cập nhật mà không ảnh hưởng tốc độ đăng nhập.

Trigger: `recalculate_api` (login context)

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

## 5. Mô hình chấm điểm Scorecard 2.0 (WOE + Logistic Regression)

Hệ thống tính điểm theo mô hình **Scorecard 2.0** — chuẩn mực được CIC và các hệ thống ngân hàng quốc tế áp dụng. **KHÔNG sử dụng phép cộng trừ điểm thủ công**, mà toàn bộ dữ liệu được lượng hóa và tính toán thông qua thuật toán **Hồi quy Logistic (Logistic Regression)** kết hợp kỹ thuật **Trọng số Bằng chứng (Weight of Evidence — WOE)**.

**5 tiêu chí đầu vào (Feature) với trọng số tương đối:**

- $X_1$ — Lịch sử thanh toán nợ (Payment History): **~35%**
- $X_2$ — Dư nợ tín dụng & Tỷ lệ sử dụng hạn mức (Credit Utilization): **~30%**
- $X_3$ — Tuổi tín dụng (Credit Age): **~15%**
- $X_4$ — Đa dạng loại hình tín dụng (Credit Mix): **~10%**
- $X_5$ — Tín dụng mới & Truy vấn tín dụng (New Credit): **~10%**

> **Lưu ý quan trọng:** Trọng số % ở trên là trọng số **tương đối** phản ánh mức độ ảnh hưởng của từng tiêu chí. Trong mô hình Scorecard 2.0, trọng số thực tế chính là các hệ số hồi quy $\beta_i$ được máy học trích xuất từ dữ liệu lịch sử — KHÔNG phải phép nhân trực tiếp.

---

### 5.1. Feature Engineering — Chi tiết 5 tiêu chí đầu vào

#### 5.1.1. Lịch sử thanh toán nợ ($X_1$) — Trọng số ~35%

Đây là tiêu chí quan trọng nhất, phản ánh hành vi trả nợ trong quá khứ. Hệ thống **không chỉ xét việc có trả nợ hay không**, mà tập trung vào **tính thời điểm** và **mức độ nghiêm trọng** của sự chậm trễ.

**Nguồn dữ liệu:** `loan_delinquency` (các bản ghi chưa soft-delete), chỉ tính hồ sơ tín dụng thật từ khoản vay `disbursed/closed`.

**Công thức nghiệp vụ tính điểm thành phần:**

$$S_{PH} = \sum_{i=1}^{n} w_i \times f(DPD_i, Recency_i)$$

**Giải thích biến số:**

| Biến                    | Ý nghĩa                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| $DPD_i$ (Days Past Due) | Số ngày quá hạn của khoản nợ thứ $i$. Khoản nợ thuộc Nhóm 3, 4, 5 (quá hạn ≥ 91 ngày) bị khấu trừ **cực mạnh** theo hệ số nhân |
| $Recency_i$             | Khoảng thời gian kể từ lần cuối phát sinh nợ quá hạn. Nợ xấu càng **mới** phát sinh → điểm trừ càng **nặng**                   |
| $w_i$                   | Trọng số theo loại hình khoản vay (nợ thế chấp có trọng số phạt khác nợ tín chấp)                                              |

**Bảng WOE Binning cho DPD:**

| Bin (Nhóm DPD) | Khoảng DPD  | Mô tả nợ CIC                    | WOE hướng           | Penalty cơ sở (tham chiếu) |
| -------------- | ----------- | ------------------------------- | ------------------- | -------------------------- |
| Bin 0          | 0 ngày      | Đúng hạn hoàn hảo               | WOE dương (cao)     | 0                          |
| Bin 1          | 1–9 ngày    | Nhóm 1 — Nợ đủ tiêu chuẩn       | WOE dương (thấp)    | 8                          |
| Bin 2          | 10–29 ngày  | Nhóm 2 — Nợ cần chú ý           | WOE ≈ 0 hoặc âm nhẹ | 20                         |
| Bin 3          | 30–89 ngày  | Nhóm 3 — Nợ dưới tiêu chuẩn     | WOE âm đáng kể      | 35                         |
| Bin 4          | 90–179 ngày | Nhóm 4 — Nợ nghi ngờ            | WOE âm mạnh         | 50                         |
| Bin 5          | ≥ 180 ngày  | Nhóm 5 — Nợ có khả năng mất vốn | WOE âm cực mạnh     | 65                         |

**Hệ số Recency (nhân bổ sung):**

- Nợ đang `overdue/defaulted` hoặc phát sinh trong 90 ngày gần nhất: $R_i = 1.25$
- Phát sinh trong 91–180 ngày qua: $R_i = 1.10$
- Cũ hơn 180 ngày: $R_i = 1.00$

**Trần hồ sơ mỏng (Thin-file Cap):**

Gọi $L_{credit}$ là số khoản vay thuộc hồ sơ tín dụng (`status in disbursed/closed`):

| $L_{credit}$ | Trần tối đa WOE                                   |
| ------------ | ------------------------------------------------- |
| $\le 2$      | Cap tại mức trung bình-thấp (tương đương ~55/100) |
| $3-5$        | Cap tại mức trung bình (tương đương ~70/100)      |
| $6-10$       | Cap tại mức trung bình-cao (tương đương ~85/100)  |
| $>10$        | Không cap (full WOE)                              |

> **Lý do:** User có quá ít hồ sơ tín dụng → dữ liệu chưa đủ tin cậy để mô hình cho điểm tối đa. Đây là biện pháp bảo thủ chuẩn Scorecard.

#### 5.1.2. Dư nợ tín dụng & Tỷ lệ sử dụng hạn mức ($X_2$) — Trọng số ~30%

Đo lường mức độ **đòn bẩy tài chính** và **áp lực nợ nần** hiện tại thông qua **Tỷ lệ sử dụng hạn mức tín dụng (Credit Utilization Ratio — CUR)**.

**Công thức CUR:**

$$CUR = \frac{\sum \text{Dư nợ thực tế trên các tài khoản tín dụng}}{\sum \text{Tổng hạn mức tín dụng được cấp}} \times 100\%$$

**Tính hạn mức tín dụng (Credit Ceiling) theo user:**

```
totalOutstanding     = sum(principalOutstanding hoặc totalOutstanding của khoản disbursed)
totalActiveLimit     = sum(max(capital, principalOutstanding) của khoản disbursed)
totalHistoricalLimit = sum(capital của khoản disbursed/closed)
totalCreditLimit     = max(totalActiveLimit, totalHistoricalLimit, 1)
```

**Bảng WOE Binning cho CUR:**

| Bin   | Khoảng CUR      | Đánh giá                                          | WOE hướng     |
| ----- | --------------- | ------------------------------------------------- | ------------- |
| Bin 0 | CUR ≤ 10%       | Tuyệt vời — sử dụng tín dụng rất thấp             | WOE dương cao |
| Bin 1 | 10% < CUR ≤ 30% | **Lý tưởng** — trạng thái tối ưu hóa điểm số      | WOE dương     |
| Bin 2 | 30% < CUR ≤ 50% | Bình thường — đòn bẩy vừa phải                    | WOE ≈ 0       |
| Bin 3 | 50% < CUR ≤ 70% | Cảnh giác — áp lực nợ tăng                        | WOE âm nhẹ    |
| Bin 4 | 70% < CUR ≤ 80% | Rủi ro — sử dụng cao                              | WOE âm        |
| Bin 5 | CUR > 80%       | **Khát vốn** — khó khăn dòng tiền, giảm điểm mạnh | WOE âm mạnh   |

Lưu ý bổ sung:

- Chỉ tính khoản vay có ý nghĩa tín dụng (`disbursed/closed`) để tránh inflated score do hồ sơ `pending/rejected`.
- Nếu user chưa có hồ sơ tín dụng ($L_{credit}=0$), hệ thống gán WOE trung tính (tương đương mức ~55/100 trên thang cũ).
- Mô hình cũng xem xét ngầm định biến số **DTI (Debt to Income — Tổng dư nợ trên thu nhập)** nếu có dữ liệu.

#### 5.1.3. Tuổi tín dụng ($X_3$) — Trọng số ~15%

Đánh giá **độ "già" của hồ sơ tín dụng**. Lịch sử tín dụng càng dài → dữ liệu càng có độ tin cậy cao để mô hình dự báo chính xác.

**3 tham số đánh giá:**

1. **Tuổi tài khoản lâu đời nhất:** Mốc ngày tạo khoản vay **đầu tiên** (`createdAt`).
2. **Tuổi trung bình** của tất cả tài khoản đang hoạt động.
3. **Thời gian kể từ khi mở tài khoản gần nhất** (liên quan đến tiêu chí Tín dụng mới).

$$M = \text{Tháng hiện tại} - \text{Tháng tạo khoản vay đầu tiên}$$

**Bảng WOE Binning cho Tuổi tín dụng:**

| Bin   | Khoảng $M$ (tháng) | Mô tả                                | WOE hướng     |
| ----- | ------------------ | ------------------------------------ | ------------- |
| Bin 0 | $M < 3$            | Tân binh — chưa đủ dữ liệu           | WOE âm mạnh   |
| Bin 1 | $3 \le M < 6$      | Mới — dữ liệu sơ khai                | WOE âm nhẹ    |
| Bin 2 | $6 \le M < 12$     | Trung bình — đang tích lũy           | WOE ≈ 0       |
| Bin 3 | $12 \le M < 36$    | Khách hàng lâu năm — dữ liệu tin cậy | WOE dương     |
| Bin 4 | $M \ge 36$         | Lão làng — dữ liệu rất tin cậy       | WOE dương cao |

> Duy trì tài khoản ổn định 10 năm không nợ xấu mang lại điểm cộng lớn hơn **rất nhiều** so với có nhiều tài khoản tuổi đời dưới 1 năm.

#### 5.1.4. Đa dạng loại hình tín dụng — Credit Mix ($X_4$) — Trọng số ~10%

Đánh giá sự **đa dạng trong danh mục tín dụng**. Hồ sơ đạt điểm tối ưu phải có sự kết hợp cân đối giữa:

- **Tín dụng trả góp (Installment):** Vay mua nhà, mua xe, vay tiêu dùng.
- **Tín dụng quay vòng (Revolving):** Thẻ tín dụng, thấu chi.

Đếm số lượng **ProductID duy nhất (Distinct)** từ các khoản vay đã giải ngân/đóng thành công.

**Bảng WOE Binning cho Credit Mix:**

| Bin   | Số sản phẩm $D$ | Mô tả                          | WOE hướng     |
| ----- | --------------- | ------------------------------ | ------------- |
| Bin 0 | $D = 0$         | Không có hồ sơ tín dụng        | WOE âm mạnh   |
| Bin 1 | $D = 1$         | Chỉ vay 1 loại — thiếu đa dạng | WOE âm nhẹ    |
| Bin 2 | $D = 2$         | Đa dạng trung bình             | WOE dương nhẹ |
| Bin 3 | $D \ge 3$       | Đa dạng cao — kết hợp tốt      | WOE dương     |

> Nếu chỉ sử dụng duy nhất một loại nợ → điểm không bao giờ đạt mức tối ưu cho tiêu chí này.

#### 5.1.5. Tín dụng mới & Truy vấn tín dụng ($X_5$) — Trọng số ~10%

Kiểm soát rủi ro **"khát vốn"** thông qua:

- **Tần suất mở tài khoản mới** trong 90 ngày (3 tháng) gần nhất.
- **Số lần nộp đơn xin cấp tín dụng (Hard Inquiries):** Khi user nộp đơn xin vay, hệ thống ghi nhận truy vấn. Nếu số lần truy vấn tăng đột biến trong thời gian ngắn mà không có tài khoản mới được mở → mô hình tự động giảm điểm (dấu hiệu bị nhiều nơi từ chối hoặc đang cần tiền gấp).

**Bảng WOE Binning cho Tín dụng mới:**

| Bin   | Khoản vay mới $L_{new}$ (90 ngày) | Mô tả                              | WOE hướng     |
| ----- | --------------------------------- | ---------------------------------- | ------------- |
| Bin 0 | $L_{new} = 0$                     | Tài chính ổn định — không vay mới  | WOE dương cao |
| Bin 1 | $L_{new} = 1$                     | Bình thường                        | WOE dương nhẹ |
| Bin 2 | $L_{new} = 2$                     | Cảnh giác — vay mới nhiều          | WOE âm        |
| Bin 3 | $L_{new} \ge 3$                   | Rủi ro vỡ nợ dây chuyền — khát vốn | WOE âm mạnh   |

---

### 5.2. Quy trình tính điểm Scorecard 2.0 — Công thức toán học

Sau khi có dữ liệu 5 tiêu chí, hệ thống **KHÔNG cộng trực tiếp trọng số (%)** mà đưa vào pipeline toán học chuẩn 3 bước:

#### Bước 1: Chuyển đổi dữ liệu thành Trọng số Bằng chứng (WOE)

Mỗi tham số của 5 tiêu chí được chia thành các nhóm (bins) như mô tả ở Section 5.1. Hệ thống tính giá trị **WOE** cho từng nhóm để đo lường **sức mạnh phân loại nợ xấu**:

$$WOE_j = \ln\left(\frac{\%\text{Khách hàng Tốt}_j}{\%\text{Khách hàng Xấu}_j}\right)$$

Trong đó:

- $\%\text{Khách hàng Tốt}_j$ = Tỷ lệ khách hàng **không vỡ nợ** nằm trong bin $j$ so với tổng khách hàng tốt.
- $\%\text{Khách hàng Xấu}_j$ = Tỷ lệ khách hàng **vỡ nợ** nằm trong bin $j$ so với tổng khách hàng xấu.
- **WOE dương (lớn)** → nhóm khách hàng đó **an toàn** (nhiều khách tốt hơn xấu).
- **WOE âm (nhỏ)** → nhóm khách hàng đó **rủi ro** (nhiều khách xấu hơn tốt).

> **Ý nghĩa:** WOE cho phép chuyển đổi dữ liệu phi tuyến tính (như DPD theo nhóm, CUR theo khoảng) thành giá trị liên tục có ý nghĩa thống kê, giúp Logistic Regression hoạt động chính xác hơn.

Kèm theo WOE, hệ thống tính **Information Value (IV)** để đánh giá sức mạnh phân loại của từng tiêu chí:

$$IV = \sum_j (\%\text{Tốt}_j - \%\text{Xấu}_j) \times WOE_j$$

| IV         | Sức mạnh phân loại                  |
| ---------- | ----------------------------------- |
| < 0.02     | Không có ý nghĩa                    |
| 0.02 – 0.1 | Yếu                                 |
| 0.1 – 0.3  | Trung bình                          |
| 0.3 – 0.5  | Mạnh                                |
| > 0.5      | Rất mạnh (cần kiểm tra overfitting) |

#### Bước 2: Tính Xác suất vỡ nợ (Probability of Default — PD) bằng Hồi quy Logistic

Dữ liệu WOE được đưa vào phương trình **Hồi quy Logistic** để xác định **xác suất khách hàng vỡ nợ ($P$) trong 12 tháng tới**:

$$\text{logit}(P) = \ln\left(\frac{P}{1-P}\right) = \beta_0 + \beta_1 X_1 + \beta_2 X_2 + \beta_3 X_3 + \beta_4 X_4 + \beta_5 X_5$$

Trong đó:

| Ký hiệu         | Ý nghĩa                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| $P$             | Xác suất vỡ nợ (Probability of Default)                                                                                         |
| $X_i$           | Biến đặc trưng đại diện cho 5 tiêu chí (đã quy đổi sang giá trị WOE)                                                            |
| $\beta_i$       | Hệ số tương quan (trọng số) được **máy học trích xuất** từ dữ liệu lịch sử. Đây chính là trọng số thực tế, KHÔNG phải % cố định |
| $\beta_0$       | Hệ số chặn (intercept)                                                                                                          |
| $\frac{P}{1-P}$ | **Tỷ lệ Odds** — tỷ lệ giữa xác suất vỡ nợ và không vỡ nợ                                                                       |

Từ đó suy ra **Odds**:

$$Odds = \frac{P}{1-P} = e^{\beta_0 + \sum_{i=1}^{5} \beta_i X_i}$$

#### Bước 3: Quy đổi ra Thang điểm chuẩn (Credit Score 150–750)

Để người dùng và hệ thống dễ đọc, tỷ lệ Odds phức tạp được **tuyến tính hóa** và quy đổi về thang điểm chuẩn thông qua 2 hằng số điều chỉnh: **Factor** và **Offset**.

**Tính hằng số:**

$$Factor = \frac{pdo}{\ln(2)}$$

$$Offset = Base\_Score - (Factor \times \ln(Odds_{base}))$$

Trong đó:

| Tham số                           | Ý nghĩa                                          | Giá trị hệ thống                         |
| --------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| $pdo$ (Points to Double the Odds) | Số điểm cần thiết để tỷ lệ Odds tăng gấp đôi     | Cấu hình trong `loan_evaluation_configs` |
| $Base\_Score$                     | Điểm cơ sở tương ứng với $Odds_{base}$           | Cấu hình trong `loan_evaluation_configs` |
| $Odds_{base}$                     | Tỷ lệ Odds tham chiếu (ví dụ: odds tại điểm 450) | Cấu hình trong `loan_evaluation_configs` |

**CÔNG THỨC CHỐT ĐIỂM TỔNG QUÁT:**

$$\boxed{Score = Offset + Factor \times \ln(Odds)}$$

**Công thức tính điểm rã cho từng tiêu chí riêng lẻ:**

$$Score_i = \left(\beta_i \times WOE_i + \frac{\alpha}{n}\right) \times Factor + \frac{Offset}{n}$$

Trong đó:

- $\alpha = \beta_0$ (hệ số chặn / intercept)
- $n$ = tổng số lượng tiêu chí được đưa vào mô hình (= 5)
- Tổng các $Score_i$ = $Score$ tổng quát

Kết quả cuối cùng được `Math.round()` và **clamp trong $[150, 750]$**.

---

### 5.3. Giới hạn điểm

- Min: **150**
- Max: **750**

### 5.4. Cơ chế đảm bảo hướng điểm (Directional Enforcement)

Khi hệ thống tính lại điểm cho **sự kiện thanh toán** (`applyRepaymentEvent`), có thể xảy ra nghịch lý: sự kiện trễ hạn nhưng tổng điểm tăng (do các yếu tố khác cải thiện từ lần tính trước). Điều này gây nhầm lẫn cho người dùng.

**Quy tắc:**

- **Thanh toán trễ hạn (`isLatePayment = true`):** Nếu điểm tính được > điểm cũ → giữ nguyên điểm cũ (không cho tăng):
  $$\text{afterScore} = \min(\text{calculated}, \text{beforeScore})$$

- **Thanh toán đúng hạn (`isLatePayment = false`):** Nếu điểm tính được < điểm cũ → giữ nguyên điểm cũ (không cho giảm):
  $$\text{afterScore} = \max(\text{calculated}, \text{beforeScore})$$

**Phạm vi áp dụng:**

- Chỉ áp dụng cho `applyRepaymentEvent` (Event 1) và `handleDelinquencyBatchJob` (Event 2).
- **KHÔNG áp dụng** cho `recalculateScore()` (Event 0 — đăng nhập) và tính lại thủ công. Các trường hợp này luôn dùng điểm tính thô (raw calculated) để đồng bộ lại ground truth.
- **KHÔNG áp dụng** cho `applyDisbursementEvent` (Event 3 — giải ngân), vì giải ngân là sự kiện trung lập.

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
── Event 0: Đăng nhập ──
AuthController.login() success
  → CreditScoreService.recalculateScore(userId)  [fire-and-forget]
    → Feature Engineering: extract 5 features (DPD+Recency, CUR, CreditAge, CreditMix, NewCredit)
    → WOE Binning: map each feature value → corresponding bin → WOE value
    → Logistic Regression: logit(P) = β₀ + Σ(βᵢ × WOEᵢ) → compute Odds
    → Scorecard Conversion: Score = Offset + Factor × ln(Odds)
    → clamp [150, 750], Math.round()
    → update credit_score
    → insert credit_score_history (trigger: recalculate_api)

── Event 1: Thanh toán ──
Loan Repayment / Prepayment success (Fineract)
  → RepaymentService estimate overdueDays
  → CreditScoreService.applyRepaymentEvent(...)
    → Feature Engineering → WOE Binning → Logistic Regression → Scorecard Conversion
    → clamp [150, 750]
    → Directional Enforcement:
      - Nếu isLatePayment && afterScore > beforeScore → afterScore = beforeScore
      - Nếu !isLatePayment && afterScore < beforeScore → afterScore = beforeScore
    → update credit_score
    → insert credit_score_history

── Event 2: Nợ xấu (Batch Job 0h hàng đêm) ──
@Cron('0 0 * * *') handleDelinquencyBatchJob()
  → query loan_applications where status='disbursed' AND delinquentDays > 0
  → for each overdue loan:
    → classifyDebtGroup(overdueDays) → nhóm 1-5
    → upsert LoanDelinquency record
    → Feature Engineering → WOE Binning → Logistic Regression → Scorecard Conversion
    → Directional Enforcement (isLatePayment=true)
    → Nhóm 4+: set user.metadata.accountFrozen = true
    → Nhóm 5: set user.metadata.permanentBan = true

── Event 3: Giải ngân ──
AdminLoanService.disburseLoan()
  → Fineract disburse
  → update MongoDB status='disbursed'
  → CreditScoreService.applyDisbursementEvent(userId)
    → Feature Engineering (Debt Level & New Credit thay đổi)
    → WOE Binning → Logistic Regression → Scorecard Conversion
    → clamp [150, 750]
    → update credit_score
    → insert credit_score_history
```

## 8. Mapping tham chiếu thị trường

- Thiết kế phân hạng rủi ro (150-750) được tham chiếu theo bài viết tổng quan điểm tín dụng từ Techcombank và thông lệ CIC phổ biến trên thị trường Việt Nam.
- Mô hình Scorecard 2.0 (WOE + Logistic Regression) là phương pháp luận chuẩn mực được CIC Việt Nam và các hệ thống chấm điểm tín dụng quốc tế (FICO, Experian, TransUnion) áp dụng.
- Các hệ số $\beta_i$ và giá trị WOE binning cụ thể được calibrate từ dữ liệu lịch sử nội bộ của hệ thống P2P, KHÔNG sao chép trực tiếp từ CIC.
- Tham số quy đổi (Factor, Offset, pdo, Base_Score, Odds_base) được cấu hình trong `loan_evaluation_configs` và có thể điều chỉnh theo đặc thù nền tảng.

## 9. Phân loại Nhóm Nợ (Debt Group Classification)

Hệ thống phân loại nợ xấu theo 5 nhóm tham chiếu chuẩn CIC Việt Nam. Batch Job hàng đêm (Event 2) tự động phân loại và áp dụng chế tài tương ứng.

### 9.1. Bảng phân nhóm nợ

| Nhóm | Tên nhóm               | Số ngày quá hạn | Thời gian lưu vết | Chế tài hệ thống (NestJS)                                                         |
| ---- | ---------------------- | --------------- | ----------------- | --------------------------------------------------------------------------------- |
| 1    | Nợ đủ tiêu chuẩn       | 1 – 9 ngày      | 6 tháng           | Trừ nhẹ điểm uy tín. Vẫn cho vay mới nhưng báo cáo AI tần suất trễ                |
| 2    | Nợ cần chú ý           | 10 – 29 ngày    | 12 tháng          | Giảm mạnh điểm uy tín. Ép lãi suất phạt, giảm hạn mức, cảnh báo nhà đầu tư        |
| 3    | Nợ dưới tiêu chuẩn     | 30 – 89 ngày    | 60 tháng (5 năm)  | Auto-Reject: Tự động từ chối mọi hồ sơ xin vay mới trong suốt 5 năm               |
| 4    | Nợ nghi ngờ            | 90 – 179 ngày   | 60 tháng (5 năm)  | Blacklist: Đóng băng tài khoản, đẩy hồ sơ sang bộ phận thu hồi nợ                 |
| 5    | Nợ có khả năng mất vốn | ≥ 180 ngày      | Vĩnh viễn         | Permanent Ban: Khóa vĩnh viễn toàn nền tảng, không bao giờ cấp lại quyền vay mượn |

> **Lưu ý:** "Thời gian lưu vết" tính từ ngày trả xong nợ (`resolvedAt`). Hết hạn → hệ thống soft-delete (`isDeleted = true`) — KHÔNG xóa vật lý, luôn giữ audit trail.

### 9.2. Cơ chế thực thi (Enforcement)

**Batch Job (Event 2) — `handleDelinquencyBatchJob()`:**

1. Quét tất cả khoản vay `status: 'disbursed'` có `delinquentDays > 0`.
2. Gọi `classifyDebtGroup(overdueDays)` để xác định nhóm nợ (1-5).
3. Upsert bản ghi `LoanDelinquency` với: `debtGroup`, `overdueAmount`, `delinquentDays`, `collectionStage`, `status` (overdue/defaulted).
4. Trừ điểm tín dụng qua `applyRepaymentEvent(isLatePayment=true)`.
5. Nhóm 4+: Ghi `user.metadata.accountFrozen = true` → user không thể tạo khoản vay.
6. Nhóm 5: Ghi `user.metadata.permanentBan = true` → user bị cấm hoàn toàn.
7. Auto-resolve: Khoản vay không còn trong danh sách overdue → cập nhật `status: 'resolved'`, `resolvedAt: now`.
8. Retention cleanup: Quét các bản ghi `resolved` + `isDeleted: false`. Nếu `resolvedAt + retention_months` đã qua → `isDeleted = true`, `deletedAt = now`. Không xóa vật lý.

**Tạo khoản vay — `LoanService.createApplication()`:**

- **Bước 0:** Kiểm tra `permanentBan` và `accountFrozen` trên User metadata → reject ngay.
- **Bước 2.5:** Query `LoanDelinquency` của borrower (`isDeleted: false`), tìm nhóm nợ cao nhất. Nếu `DelinquencyPolicy` tương ứng có `block_new_loan: true` → reject.

**Nhà đầu tư — `InvestService.getAvailableLoans()`:**

- Với mỗi khoản vay available, kiểm tra borrower có bản ghi `LoanDelinquency` nhóm ≥ 2 (`isDeleted: false`) không.
- Nếu có → enrich thêm `borrowerDelinquencyWarning` gồm: `debtGroup`, `overdueAmount`, `delinquentDays`, `message`.

### 9.3. Schema liên quan

**DelinquencyPolicy** (cấu hình theo debt_group):

| Field              | Type    | Mô tả                                                |
| ------------------ | ------- | ---------------------------------------------------- |
| `debt_group`       | number  | Nhóm nợ (1-5)                                        |
| `block_new_loan`   | boolean | Chặn tạo khoản vay mới                               |
| `apply_penalty`    | boolean | Áp dụng phạt lãi trễ hạn                             |
| `retention_months` | number  | Thời gian lưu hồ sơ nợ xấu (tháng), null = vĩnh viễn |
| `freeze_account`   | boolean | Đóng băng tài khoản                                  |
| `permanent_ban`    | boolean | Cấm vĩnh viễn                                        |
| `legal_escalation` | boolean | Chuyển xử lý pháp lý                                 |
| `collection_stage` | string  | Giai đoạn thu hồi (none/soft/hard/legal)             |

**LoanDelinquency** (bản ghi per-loan):

| Field              | Type     | Mô tả                                            |
| ------------------ | -------- | ------------------------------------------------ |
| `loanId`           | ObjectId | Tham chiếu loan_application                      |
| `borrowerId`       | ObjectId | Tham chiếu user                                  |
| `fineractLoanId`   | number   | ID khoản vay trên Fineract (unique)              |
| `debtGroup`        | number   | Nhóm nợ hiện tại (1-5)                           |
| `overdueAmount`    | number   | Số tiền quá hạn (VNĐ)                            |
| `delinquentDays`   | number   | Số ngày quá hạn                                  |
| `status`           | string   | normal / overdue / defaulted / resolved          |
| `collectionStage`  | string   | none / reminder / warning / collection / legal   |
| `firstOverdueDate` | Date     | Ngày phát sinh quá hạn đầu tiên                  |
| `lastSyncedAt`     | Date     | Lần kiểm tra gần nhất                            |
| `resolvedAt`       | Date     | Ngày trả xong nợ (mốc tính retention)            |
| `isDeleted`        | boolean  | Đã soft-delete (hết hạn lưu vết). Default: false |
| `deletedAt`        | Date     | Thời điểm soft-delete                            |

**loan_evaluation_configs** (bản ghi cấu hình tham chiếu cho diem tin dung va cau hinh creditGrades danh cho mo hinh cham diem AI sau nay (risk-core)):

## 10. Hướng mở rộng (đề xuất)

- Bổ sung thêm data nguồn thu nhập ổn định/khả năng chi trả (DTI — Debt to Income) để tăng độ chính xác cho feature Debt Level.
- Tích hợp Blockchain để ghi lại audit trail cho mỗi lần thay đổi điểm.
- Thu thập thêm dữ liệu Hard Inquiries (số lần user nộp đơn xin vay) để nâng cao chất lượng feature Tín dụng mới ($X_5$).
- Re-calibrate định kỳ: Khi có đủ dữ liệu lịch sử (>1000 khoản vay closed), re-train mô hình Logistic Regression để cập nhật $\beta_i$ và WOE bins cho chính xác hơn.
- Monitoring mô hình: Theo dõi PSI (Population Stability Index) để phát hiện data drift và quyết định thời điểm re-calibrate.
- Bổ sung biến số hành vi (behavioral scoring): tần suất đăng nhập, thời gian dùng app, pattern chuyển tiền — nhưng cần đánh giá IV trước khi đưa vào mô hình.
