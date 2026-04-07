# Cơ Chế Chấm Điểm Tín Dụng Hiện Tại Của Hệ Thống

Ngày cập nhật: 2026-06-04

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

## 5. Công thức chấm điểm hiện tại (Reward/Penalty System — FICO-style)

Hệ thống tính điểm theo mô hình **5 yếu tố có trọng số**, sử dụng tư duy **Hệ thống Điểm thưởng/Điểm phạt (Reward/Penalty System)** thay vì trung bình cộng đơn thuần:

- $S_{payment}$ — Lịch sử thanh toán: **35%**
- $S_{debt}$ — Dư nợ tín dụng: **30%**
- $S_{age}$ — Tuổi tín dụng: **15%**
- $S_{mix}$ — Đa dạng tín dụng: **10%**
- $S_{new}$ — Tín dụng mới: **10%**

Mỗi yếu tố được chấm trên thang **0-100**, sau đó tổng hợp và scale ra thang CIC 150-750.

### 5.1. Lịch sử thanh toán ($S_{payment}$) — Trọng số 35%

Yếu tố này dùng cơ chế **Điểm trừ tích lũy** theo mức độ nghiêm trọng (Nhóm nợ CIC).

**Bước 1: Tính điểm cơ sở (Penalty Deduction)**

$$S_{base\_payment} = \max(0,\ 100 - (N_{g1} \times 10) - (N_{g2} \times 30))$$

Trong đó:

- $N_{g1}$: Số lần từng rớt vào **Nhóm 1** (trễ 1-9 ngày) → trừ **10 điểm/lần**
- $N_{g2}$: Số lần từng rớt vào **Nhóm 2+** (trễ 10+ ngày) → trừ **30 điểm/lần**

> Nhóm 3+ đã bị Auto-Reject/Block từ vòng ngoài nên hiếm khi tính vào đây.

**Bước 2: Phạt hồ sơ mỏng (Volume Penalty Factor)**

Gọi $L_{total}$ là tổng số khoản vay đã từng mở:

| Level                     | Số khoản vay | $V_{factor}$ | Điểm tối đa |
| ------------------------- | ------------ | ------------ | ----------- |
| Level 1 (Hồ sơ siêu mỏng) | 1-4          | 0.60         | 60/100      |
| Level 2 (Hồ sơ cơ bản)    | 5-10         | 0.80         | 80/100      |
| Level 3 (Hồ sơ chín muồi) | > 10         | 1.00         | 100/100     |

**Điểm chốt:**

$$S_{payment} = S_{base\_payment} \times V_{factor}$$

**Ví dụ:** User mới có 3 khoản vay, 1 lần trễ Nhóm 1 → $(100 - 10) \times 0.6 = 54/100$

### 5.2. Dư nợ tín dụng ($S_{debt}$) — Trọng số 30%

Sử dụng **Tỷ lệ sử dụng tín dụng (Credit Utilization Ratio)** — chỉ số chuẩn quốc tế (tham khảo FICO).

**Hạn mức tín dụng (Credit Ceiling):**

Hệ thống xác định hạn mức tối đa bằng cách lấy `maxLoanAmount` của **grade cao nhất** trong `LoanEvaluationConfig.creditGrades`. Đây là tổng hạn mức tín dụng mà hệ thống có thể cấp cho người vay, tương tự cách FICO dùng tổng credit limit của các thẻ tín dụng.

```
maxGradeLimit = max(creditGrades[].maxLoanAmount)  // ví dụ: grade A → 50.000.000 VNĐ
totalCreditLimit = max(maxGradeLimit, tổng capital các khoản vay, 1)
```

Fallback: Nếu không có `LoanEvaluationConfig` → dùng tổng capital các khoản vay đã giải ngân.

**Công thức:**

$$U = \frac{\sum \text{Dư nợ gốc hiện tại (principalOutstanding)}}{\text{totalCreditLimit}}$$

**Quy đổi ra điểm:**

| Tỷ lệ nợ $U$      | $S_{debt}$ | Mô tả                           |
| ----------------- | ---------- | ------------------------------- |
| $U \le 0.1$       | **100**    | Dùng ≤ 10% hạn mức, rất an toàn |
| $0.1 < U \le 0.3$ | **80**     | Sử dụng hợp lý                  |
| $0.3 < U \le 0.5$ | **60**     | Mức trung bình                  |
| $0.5 < U \le 0.8$ | **30**     | Bắt đầu báo động                |
| $U > 0.8$         | **10**     | Báo động đỏ, xài kiệt hạn mức   |

### 5.3. Tuổi tín dụng ($S_{age}$) — Trọng số 15%

Đo thời gian gắn bó với nền tảng. Lấy mốc ngày tạo khoản vay **đầu tiên** (`createdAt`).

$$M = \text{Tháng hiện tại} - \text{Tháng tạo khoản vay đầu tiên}$$

| Số tháng $M$    | $S_{age}$ | Mô tả              |
| --------------- | --------- | ------------------ |
| $M < 3$         | **10**    | Tân binh           |
| $3 \le M < 6$   | **30**    | Mới                |
| $6 \le M < 12$  | **60**    | Trung bình         |
| $12 \le M < 36$ | **85**    | Khách hàng lâu năm |
| $M \ge 36$      | **100**   | Lão làng           |

### 5.4. Đa dạng tín dụng ($S_{mix}$) — Trọng số 10%

Đếm số lượng **ProductID duy nhất (Distinct)** từ các khoản vay đã giải ngân/đóng thành công.

| Số sản phẩm $D$ | $S_{mix}$ | Mô tả              |
| --------------- | --------- | ------------------ |
| $D = 1$         | **40**    | Chỉ vay 1 loại     |
| $D = 2$         | **75**    | Đa dạng trung bình |
| $D \ge 3$       | **100**   | Đa dạng cao        |

### 5.5. Tín dụng mới ($S_{new}$) — Trọng số 10%

Đếm số khoản vay **mở mới trong 90 ngày** (3 tháng) gần nhất. Càng vay mới nhiều → càng rủi ro "khát tiền".

| Khoản vay mới $L_{new}$ | $S_{new}$ | Mô tả                   |
| ----------------------- | --------- | ----------------------- |
| $L_{new} = 0$           | **100**   | Tài chính ổn định       |
| $L_{new} = 1$           | **80**    | Bình thường             |
| $L_{new} = 2$           | **40**    | Cảnh giác               |
| $L_{new} \ge 3$         | **10**    | Rủi ro vỡ nợ dây chuyền |

### 5.6. Công thức tổng hợp (Chốt hạ)

**Bước 1 — Tính tổng điểm cơ sở (thang 0-100):**

$$Score_{total\_100} = (S_{payment} \times 0.35) + (S_{debt} \times 0.30) + (S_{age} \times 0.15) + (S_{mix} \times 0.10) + (S_{new} \times 0.10)$$

**Bước 2 — Scale ra thang CIC (150-750):**

$$Score_{CIC} = 150 + (Score_{total\_100} \times 6)$$

Kết quả được bọc bằng `Math.round()` và clamp trong `[150, 750]`.

### 5.7. Giới hạn điểm

- Min: 150
- Max: 750

### 5.8. Cơ chế đảm bảo hướng điểm (Directional Enforcement)

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
    → compute 5 factor scores (with Volume Penalty)
    → weighted score 0..100 → clamp 150..750
    → update credit_score
    → insert credit_score_history (trigger: recalculate_api)

── Event 1: Thanh toán ──
Loan Repayment / Prepayment success (Fineract)
  → RepaymentService estimate overdueDays
  → CreditScoreService.applyRepaymentEvent(...)
    → compute 5 factor scores (with Volume Penalty)
    → weighted score 0..100 → clamp 150..750
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
    → applyRepaymentEvent(isLatePayment=true, overdueDays) (nếu chưa trừ trong 24h)
    → Nhóm 4+: set user.metadata.accountFrozen = true
    → Nhóm 5: set user.metadata.permanentBan = true

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

- Bổ sung thêm data nguồn thu nhập ổn định/khả năng chi trả để tăng độ chính xác cho yếu tố debt level.
- Tích hợp Blockchain để ghi lại audit trail cho mỗi lần thay đổi điểm.
- Mở rộng Volume Penalty Factor cho các yếu tố khác (credit age, credit mix) nếu cần.
