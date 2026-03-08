# Giải thích chi tiết từng trường – Document Loan Application (Mongo)

Collection: **`loan_applications`**. Mỗi document là một hồ sơ vay: tạo từ app P2P hoặc đồng bộ từ Fineract. Tài liệu này mô tả **từng field** ở cấp gốc và **từng field trong từng sub-document/sub-array**.

---

## 1. Trường cấp gốc (root)

### 1.1. Định danh & tham chiếu

| Field | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|--------|
| **\_id** | ObjectId | (auto) | Id document MongoDB, do Mongo sinh. |
| **userId** | ObjectId | ✓ | Tham chiếu `users._id` – người vay. Dùng populate để lấy username, profile. |
| **productId** | number | ✓ | Id sản phẩm vay trên **Fineract**. Không có collection loan_products trong Mongo; chi tiết product lấy qua API Fineract. |
| **fineractLoanId** | number | | Id khoản vay trên Fineract. Có sau khi tạo loan bên Fineract; dùng để sync và gọi API. |

### 1.2. Thông tin khoản vay

| Field | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|--------|
| **capital** | number | ✓ | Số tiền gốc vay (đơn vị tiền tệ, thường VNĐ). |
| **periodMonth** | number | ✓ | Số kỳ trả nợ (tháng). |
| **monthlyRatePercent** | number | ✓ | Lãi suất %/tháng (vd: 1.5 = 1,5%/tháng). |
| **interestType** | string | | Cách tính lãi (vd: "Dư nợ giảm dần"). |
| **inMultiplesOf** | number | | Số tiền làm tròn theo bội số (vd: 1000). |
| **willing** | string | | Mục đích vay (vd: "Vay học phí"). |
| **disbursementDate** | string | ✓ | Ngày giải ngân (YYYY-MM-DD). |
| **disbursementWalletId** | ObjectId | ✓ | Tham chiếu `wallets._id` – ví nhận tiền giải ngân. |

### 1.3. Trạng thái

| Field | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|--------|
| **status** | string | ✓ | Trạng thái hồ sơ: `pending` \| `approved` \| `rejected` \| `disbursed` \| `cancelled` \| `closed`. Trang “Khoản vay quá hạn” lọc `status: 'disbursed'`. |
| **fineractStatusString** | string | | Trạng thái từ Fineract (vd: "Active") – dùng hiển thị/đối chiếu. |

### 1.4. Lịch trả ước tính (preview khi tạo hồ sơ)

| Field | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|--------|
| **schedulePreview** | array | | Lịch trả **dự kiến** lúc tạo hồ sơ. Chi tiết từng phần tử xem §2. |
| **monthlyPay** | number | | Số tiền trả mỗi kỳ (ước tính). |
| **entirelyPay** | number | | Tổng số tiền phải trả (gốc + lãi) ước tính. |

### 1.5. Tài liệu đính kèm

| Field | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|--------|
| **documents** | array | | Danh sách tài liệu đính kèm. Chi tiết từng phần tử xem §3. |

### 1.6. Đồng bộ & hiển thị

| Field | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|--------|
| **lastSyncedAt** | Date | | Thời điểm lần cuối đồng bộ từ Fineract (repaymentSchedule, transactions, delinquency, …). |
| **clientDisplayName** | string | | Tên khách hàng trên Fineract (displayName hoặc firstname + lastname). Denormalized để danh sách nợ quá hạn hiển thị đúng tên. |

### 1.7. Số dư & tổng tiền (sync từ Fineract)

| Field | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|--------|
| **outstandingAmount** | number | | Dư nợ hiện tại (tổng). |
| **totalOutstanding** | number | | Tổng dư nợ (có thể trùng nghĩa với outstandingAmount). |
| **principalOutstanding** | number | | Dư gốc chưa trả. |
| **principalPaid** | number | | Gốc đã trả. |
| **interestOutstanding** | number | | Lãi còn nợ. |
| **interestPaid** | number | | Lãi đã trả. |
| **feePaid** | number | | Phí đã trả. |
| **feeOutstanding** | number | | Phí còn nợ. |
| **penaltyPaid** | number | | Phạt đã trả. |
| **penaltyOutstanding** | number | | Phạt còn nợ. |
| **totalPaid** | number | | Tổng đã trả. |
| **totalFeeExpected** | number | | Tổng phí kỳ vọng (Fineract). |
| **totalPenaltyExpected** | number | | Tổng phạt kỳ vọng (Fineract). |

### 1.8. Nợ quá hạn (delinquency)

| Field | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|--------|
| **totalOverdue** | number | | **Tổng tiền quá hạn** – dùng lọc danh sách “Khoản vay quá hạn”. |
| **delinquentDays** | number | | Số ngày quá hạn (từ kỳ đến hạn đầu tiên chưa trả). |
| **delinquencyClassification** | string | | Nhãn nhóm nợ (vd: "Nhóm 2 (31-60 ngày)"). |
| **delinquencyRange** | object | | Đối tượng nhóm nợ hiện tại. Chi tiết §6. |
| **delinquencyTag** | array | | (Có thể legacy) Thẻ nợ quá hạn. |
| **delinquencyTags** | array | | Danh sách thẻ nợ quá hạn (lịch sử gắn thẻ). Chi tiết §7. |
| **installmentLevelDelinquency** | array | | Phân bổ tiền quá hạn **theo nhóm nợ** (theo khoảng ngày), không theo kỳ. Chi tiết §8. |
| **delinquencyActions** | array | | Hành động đã xử lý (nếu có). |

### 1.9. Lịch trả & giao dịch (raw Fineract)

| Field | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|--------|
| **repaymentSchedule** | array | | Lịch trả nợ chi tiết từ Fineract (kỳ 0 + các kỳ 1..n). Chi tiết §9. |
| **transactions** | array | | Giao dịch từ Fineract. Chi tiết §10. |
| **charges** | array | | Các khoản phí/charge từ Fineract. Chi tiết §4. |
| **repaymentHistory** | array | | Lịch sử trả nợ ghi nhận trên app P2P. Chi tiết §5. |

### 1.10. Tài sản đảm bảo & bảo lãnh

| Field | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|--------|
| **collateral** | array | | Tài sản đảm bảo (từ Fineract). |
| **guarantors** | array | | Người bảo lãnh (từ Fineract). |

### 1.11. Metadata Mongo

| Field | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|--------|
| **createdAt** | Date | (auto) | Thời điểm tạo document. |
| **updatedAt** | Date | (auto) | Thời điểm cập nhật lần cuối. |
| **__v** | number | (auto) | Phiên bản schema (Mongoose). |

---

## 2. schedulePreview[] – từng phần tử

Lịch trả **ước tính** khi tạo hồ sơ (trước khi có Fineract). Mỗi phần tử là một kỳ.

| Field | Kiểu | Mô tả |
|-------|------|--------|
| **period** | number | Số thứ tự kỳ (1, 2, …). |
| **principal** | number | Gốc trả trong kỳ (VNĐ). |
| **interest** | number | Lãi trả trong kỳ (VNĐ). |
| **total** | number | Tổng tiền trả kỳ = principal + interest. |
| **remainingAfter** | number | Dư nợ sau khi trả kỳ này. |
| **dueDate** | string | Ngày đến hạn (YYYY-MM-DD). |

---

## 3. documents[] – từng phần tử

Mỗi phần tử là một tài liệu đính kèm hồ sơ vay.

| Field | Kiểu | Mô tả |
|-------|------|--------|
| **documentTypeId** | string (ObjectId) | Tham chiếu `document_types._id` – loại tài liệu (CCCD, HĐ lao động, …). |
| **name** | string | Tên file / mô tả. |
| **uploadedAt** | Date | Thời điểm upload. |
| **uri** | string | (Tùy chọn) Đường dẫn/URL file. |
| **fineractDocumentId** | number | (Tùy chọn) Id tài liệu trên Fineract sau khi đồng bộ. |
| **reviewStatus** | string | (Tùy chọn) Trạng thái duyệt: `pending` \| `approved` \| `rejected`. |
| **reviewedAt** | Date | (Tùy chọn) Thời điểm duyệt. |

---

## 4. charges[] – từng phần tử

Các khoản phí/charge từ Fineract (phí vay phẳng, phạt trả chậm, …).

| Field | Kiểu | Mô tả |
|-------|------|--------|
| **id** | number | Id charge trên Fineract. |
| **chargeId** | number | Id định nghĩa charge. |
| **name** | string | Tên (vd: "Phí vay phẳng"). |
| **chargeTimeType** | object | Thời điểm tính phí. |
| ↳ **id** | number | Id. |
| ↳ **code** | string | Mã (vd: "chargeTimeType.disbursement"). |
| ↳ **value** | string | Nhãn (vd: "Disbursement"). |
| **submittedOnDate** | number[] | Ngày ghi nhận [year, month, day]. |
| **chargeCalculationType** | object | Cách tính (Flat, %). |
| ↳ **id**, **code**, **value** | | |
| **percentage** | number | Phần trăm (nếu tính theo %). |
| **amountPercentageAppliedTo** | number | Số tiền áp dụng % (nếu có). |
| **currency** | object | Tiền tệ. |
| ↳ **code** | string | Mã (vd: "VND"). |
| ↳ **name** | string | Tên đầy đủ. |
| ↳ **decimalPlaces** | number | Số chữ số thập phân. |
| ↳ **nameCode** | string | Mã nội bộ. |
| ↳ **displayLabel** | string | Nhãn hiển thị. |
| **amount** | number | Số tiền đến hạn. |
| **amountPaid** | number | Đã trả. |
| **amountWaived** | number | Đã miễn. |
| **amountWrittenOff** | number | Đã xóa sổ. |
| **amountOutstanding** | number | Còn nợ. |
| **amountOrPercentage** | number | Giá trị gốc (số tiền hoặc %). |
| **penalty** | boolean | true = phạt, false = phí. |
| **chargePaymentMode** | object | Chế độ thanh toán (Regular, …). |
| ↳ **id**, **code**, **value** | | |
| **paid** | boolean | Đã thanh toán hết. |
| **waived** | boolean | Đã miễn. |
| **chargePayable** | boolean | Còn phải trả. |
| **loanId** | number | Id khoản vay Fineract. |

---

## 5. repaymentHistory[] – từng phần tử

Lịch sử trả nợ **ghi nhận trên app P2P** (khi user trả qua app, đồng bộ với Fineract).

| Field | Kiểu | Mô tả |
|-------|------|--------|
| **amount** | number | Số tiền trả (VNĐ). |
| **date** | string | Ngày trả (YYYY-MM-DD). |
| **type** | string | `repayment` \| `prepayment`. |
| **fineractTransactionId** | number | Id giao dịch trên Fineract (để đối chiếu). |
| **createdAt** | Date | Thời điểm ghi nhận. |
| **breakdown** | object | (Tùy chọn) Chi tiết gốc/lãi/phí/phạt. |
| ↳ **principal**, **interest**, **fees**, **penalty** | number | |

---

## 6. delinquencyRange (object)

Nhóm nợ quá hạn **hiện tại** của khoản vay (một document, không phải mảng).

| Field | Kiểu | Mô tả |
|-------|------|--------|
| **id** | number | Id nhóm trên Fineract. |
| **classification** | string | Tên nhóm (vd: "Nhóm 2 (31-60 ngày)"). |
| **minimumAgeDays** | number | Số ngày quá hạn tối thiểu của nhóm (vd: 31). |
| **maximumAgeDays** | number | Số ngày quá hạn tối đa của nhóm (vd: 60). |
| **pastDueDays** | number | Số ngày quá hạn thực tế của khoản vay. |
| **delinquentDate** | number[] | Ngày bắt đầu quá hạn [year, month, day] (vd: [2026,2,4] = 4/2/2026). |

---

## 7. delinquencyTags[] – từng phần tử

Lịch sử **thẻ** phân loại nợ quá hạn (khi nào gắn vào nhóm nào, khi nào gỡ).

| Field | Kiểu | Mô tả |
|-------|------|--------|
| **id** | number | Id thẻ trên Fineract. |
| **loanId** | number | Id khoản vay. |
| **delinquencyRange** | object | Nhóm nợ gắn với thẻ này. |
| ↳ **id** | number | Id nhóm. |
| ↳ **classification** | string | Tên nhóm. |
| ↳ **minimumAgeDays** | number | Ngày tối thiểu. |
| ↳ **maximumAgeDays** | number | Ngày tối đa. |
| **addedOnDate** | number[] | Ngày gắn thẻ [year, month, day]. |
| **liftedOnDate** | number[] | (Tùy chọn) Ngày gỡ thẻ. |

---

## 8. installmentLevelDelinquency[] – từng phần tử

**Phân bổ tiền quá hạn theo nhóm nợ** (theo khoảng ngày quá hạn), không phải theo từng kỳ trả nợ. Mỗi phần tử = một nhóm (Nhóm 1: 1–30 ngày, Nhóm 2: 31–60 ngày, …) với tổng tiền quá hạn được Fineract quy vào nhóm đó.

| Field | Kiểu | Mô tả |
|-------|------|--------|
| **rangeId** | number | Id nhóm nợ. |
| **classification** | string | Tên nhóm (vd: "Nhóm 1 (1-30 ngày)"). |
| **minimumAgeDays** | number | Số ngày tối thiểu trong khoảng. |
| **maximumAgeDays** | number | Số ngày tối đa trong khoảng. |
| **delinquentAmount** | number | Tổng tiền quá hạn được phân bổ vào nhóm này. |

---

## 9. repaymentSchedule[] – từng phần tử

Lịch trả nợ **chi tiết từ Fineract**. Phần tử đầu có thể là **kỳ 0** (giải ngân/phí); các phần tử sau là **kỳ 1, 2, …** (trả gốc + lãi).

### 9.1. Phần tử không có `period` (kỳ 0 – giải ngân / phí)

| Field | Kiểu | Mô tả |
|-------|------|--------|
| **dueDate** | number[] | Ngày [y, m, d]. |
| **principalDisbursed** | number | Gốc giải ngân. |
| **principalLoanBalanceOutstanding** | number | Dư nợ gốc sau kỳ. |
| **feeChargesDue** | number | Phí đến hạn. |
| **feeChargesPaid** | number | Phí đã trả. |
| **totalOriginalDueForPeriod** | number | Tổng đến hạn kỳ (gốc). |
| **totalDueForPeriod** | number | Tổng đến hạn. |
| **totalPaidForPeriod** | number | Tổng đã trả. |
| **totalActualCostOfLoanForPeriod** | number | Chi phí thực tế kỳ. |
| **downPaymentPeriod** | boolean | Có phải kỳ trả trước không. |

### 9.2. Phần tử có `period` (kỳ 1, 2, …)

| Field | Kiểu | Mô tả |
|-------|------|--------|
| **period** | number | Số kỳ (1, 2, …). |
| **fromDate** | number[] | Ngày bắt đầu kỳ [y, m, d]. |
| **dueDate** | number[] | Ngày đến hạn kỳ [y, m, d]. |
| **complete** | boolean | Kỳ đã trả xong chưa. |
| **daysInPeriod** | number | Số ngày trong kỳ. |
| **principalOriginalDue** | number | Gốc đến hạn (theo kế hoạch). |
| **principalDue** | number | Gốc đến hạn. |
| **principalPaid** | number | Gốc đã trả. |
| **principalWrittenOff** | number | Gốc đã xóa sổ. |
| **principalOutstanding** | number | Gốc còn nợ kỳ. |
| **principalLoanBalanceOutstanding** | number | Dư nợ gốc sau kỳ. |
| **interestOriginalDue** | number | Lãi đến hạn (theo kế hoạch). |
| **interestDue** | number | Lãi đến hạn. |
| **interestPaid** | number | Lãi đã trả. |
| **interestWaived** | number | Lãi đã miễn. |
| **interestWrittenOff** | number | Lãi đã xóa sổ. |
| **interestOutstanding** | number | Lãi còn nợ kỳ. |
| **feeChargesDue** | number | Phí đến hạn kỳ. |
| **feeChargesPaid** | number | Phí đã trả. |
| **feeChargesWaived** | number | Phí đã miễn. |
| **feeChargesWrittenOff** | number | Phí đã xóa sổ. |
| **feeChargesOutstanding** | number | Phí còn nợ. |
| **penaltyChargesDue** | number | Phạt đến hạn. |
| **penaltyChargesPaid** | number | Phạt đã trả. |
| **penaltyChargesWaived** | number | Phạt đã miễn. |
| **penaltyChargesWrittenOff** | number | Phạt đã xóa sổ. |
| **penaltyChargesOutstanding** | number | Phạt còn nợ. |
| **totalOriginalDueForPeriod** | number | Tổng đến hạn kỳ (gốc). |
| **totalDueForPeriod** | number | Tổng đến hạn kỳ. |
| **totalPaidForPeriod** | number | Tổng đã trả kỳ. |
| **totalPaidInAdvanceForPeriod** | number | Tổng trả trước. |
| **totalPaidLateForPeriod** | number | Tổng trả trễ. |
| **totalWaivedForPeriod** | number | Tổng miễn. |
| **totalWrittenOffForPeriod** | number | Tổng xóa sổ. |
| **totalOutstandingForPeriod** | number | Tổng còn nợ kỳ. |
| **totalOverdue** | number | **Tiền quá hạn của kỳ** – dùng cho “quá hạn theo từng kỳ”. |
| **totalActualCostOfLoanForPeriod** | number | Chi phí thực tế kỳ (lãi). |
| **totalInstallmentAmountForPeriod** | number | Tổng tiền kỳ (gốc + lãi). |
| **totalCredits** | number | Tổng ghi có. |
| **totalAccruedInterest** | number | Lãi tích lũy. |
| **downPaymentPeriod** | boolean | Kỳ trả trước. |

---

## 10. transactions[] – từng phần tử

Giao dịch từ Fineract (giải ngân, trả nợ, trả phí, accrual, …).

### 10.1. Trường thường dùng

| Field | Kiểu | Mô tả |
|-------|------|--------|
| **id** | number | Id giao dịch Fineract. |
| **loanId** | number | Id khoản vay. |
| **officeId** | number | Id văn phòng. |
| **officeName** | string | Tên văn phòng (vd: "Head Office"). |
| **type** | object | Loại giao dịch (xem §10.2). |
| **date** | number[] | Ngày giao dịch [y, m, d]. |
| **currency** | object | Tiền tệ (code, name, decimalPlaces, inMultiplesOf, nameCode, displayLabel). |
| **amount** | number | Số tiền giao dịch. |
| **netDisbursalAmount** | number | Số tiền giải ngân ròng (sau trừ phí). |
| **principalPortion** | number | Phần gốc trong giao dịch. |
| **interestPortion** | number | Phần lãi. |
| **feeChargesPortion** | number | Phần phí. |
| **penaltyChargesPortion** | number | Phần phạt. |
| **overpaymentPortion** | number | Phần trả thừa. |
| **unrecognizedIncomePortion** | number | Phần thu nhập chưa nhận dạng. |
| **outstandingLoanBalance** | number | Dư nợ sau giao dịch. |
| **submittedOnDate** | number[] | Ngày ghi nhận [y, m, d]. |
| **manuallyReversed** | boolean | Bị đảo ngược thủ công chưa. |
| **loanChargePaidByList** | array | Danh sách charge được thanh toán bởi giao dịch này (§10.3). |
| **transactionRelations** | array | Quan hệ với giao dịch khác (nếu có). |

### 10.2. type (object) – loại giao dịch

Đối tượng có nhiều boolean, ví dụ: **disbursement**, **repayment**, **repaymentAtDisbursement**, **accrual**, **chargePayment**, **refund**, **writeOff**, … và **value** (string mô tả, vd: "Disbursement", "Repayment (at time of disbursement)", "Accrual").

| Field điển hình | Kiểu | Mô tả |
|-----------------|------|--------|
| **id** | number | Id loại. |
| **code** | string | Mã (vd: "loanTransactionType.disbursement"). |
| **value** | string | Nhãn hiển thị. |
| **disbursement** | boolean | true = giao dịch giải ngân. |
| **repayment** | boolean | true = giao dịch trả nợ. |
| **repaymentAtDisbursement** | boolean | true = trả tại thời điểm giải ngân. |
| **accrual** | boolean | true = ghi nhận lãi tích lũy. |
| **chargePayment** | boolean | true = thanh toán phí/charge. |
| (các flag khác) | boolean | Các loại khác (refund, writeOff, …). |

### 10.3. loanChargePaidByList[] (trong từng transaction)

Mỗi phần tử: charge được thanh toán bằng giao dịch này.

| Field | Kiểu | Mô tả |
|-------|------|--------|
| **id** | number | Id bản ghi. |
| **amount** | number | Số tiền thanh toán cho charge. |
| **chargeId** | number | Id charge. |
| **transactionId** | number | Id giao dịch. |
| **name** | string | Tên charge. |

---

## Tóm tắt nguồn dữ liệu

| Nhóm trường | Nguồn |
|-------------|--------|
| userId, productId, capital, periodMonth, disbursementDate, disbursementWalletId, schedulePreview, monthlyPay, entirelyPay, documents, status (P2P) | App P2P (khi tạo/cập nhật hồ sơ). |
| fineractLoanId, fineractStatusString, repaymentSchedule, transactions, charges, collateral, guarantors, delinquency*, outstanding*, principal*, interest*, fee*, penalty*, totalPaid, totalOverdue, lastSyncedAt, clientDisplayName | Đồng bộ từ Fineract (sync loan). |
| repaymentHistory | Ghi nhận trên app khi user trả nợ (đồng bộ với Fineract transaction). |

---

## Kỳ nào rơi vào thẻ quá hạn nào?

**Trong Mongo không lưu sẵn** cặp "kỳ X → nhóm/thẻ quá hạn Y". API **getLoanDetails** **tính giúp** và trả về mảng **periodDelinquency** (không lưu vào Mongo):

- Với mỗi kỳ có `totalOverdue > 0` hoặc `totalOutstandingForPeriod > 0`:
  - Lấy **ngày đến hạn** kỳ (`dueDate`) và **ngày tham chiếu** (`lastSyncedAt` hoặc hôm nay).
  - Tính **số ngày quá hạn** = ngày tham chiếu − ngày đến hạn.
  - Ánh xạ vào **delinquency ranges** từ Fineract (Nhóm 1: 1–30 ngày, Nhóm 2: 31–60 ngày, …) → ra **classification**.
- Kết quả mỗi phần tử: `period`, `dueDate`, `daysOverdue`, **classification** (nhóm quá hạn), `totalOverdue`, `totalOutstandingForPeriod`.

Trang admin tab **Thẻ nợ quá hạn** → bảng **Quá hạn theo từng kỳ trả nợ** hiển thị luôn cột **Nhóm quá hạn** (kỳ đó rơi vào thẻ nào), không cần tự nhìn hay tự tính.

---

*Schema Mongoose: `server_do_an_new/src/modules/loan/schemas/loan-application.schema.ts`.*
