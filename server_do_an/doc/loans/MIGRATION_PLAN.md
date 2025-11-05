# Kế hoạch chuyển đổi API Loan từ Server cũ sang Server mới

## Tổng quan


# 12.1. API dùng Blockchain (Chaincode)

| API | Method | Chaincode | HyperledgerService | Implementation |
|-----|--------|-----------|---------------------|----------------|
| `POST /loans/create-auto` | submitTransaction | `createLoanContractAuto` | ✅ Đã có | ✅ Hoàn thành |
| `GET /loans/:id` | evaluateTransaction | `queryLoanContract` | ✅ Đã có | ✅ Hoàn thành |
| `POST /loans/check-due-payments` | submitTransaction | `checkDuePayments` | ✅ Đã có | ❌ Chưa implement API |
| `POST /loans/send-reminder/:loanId` | submitTransaction | `sendPaymentReminder` | ✅ Đã có | ❌ Chưa implement API |
| `POST /loans/partial-payment` | submitTransaction | `partialPayment` | ✅ Đã có | ❌ Chưa implement API |
| `POST /loans/calculate-early-repayment` | submitTransaction | `earlyRepayment` | ✅ Đã có | ❌ Chưa implement API |
| `GET /loans/due-payments` | evaluateTransaction | `getDuePayments` | ❌ Cần implement | ❌ Chưa implement |
| `GET /loans/statistics/:loanId` | evaluateTransaction | `getLoanStatistics` | ❌ Cần implement | ❌ Chưa implement |
| `POST /loans/create` | submitTransaction | `createLoanContract` | ❌ Cần implement | ❌ Chưa implement |

# 12.2. API dùng MongoDB

| API | MongoDB Query | Implementation |
|-----|---------------|----------------|
| `GET /loans/me` | `{ borrower: user._id, status: ... }` | ❌ Chưa có |
| `GET /loans/current` | `{ status: 'waiting' \| 'success' }` | ❌ Chưa có |
| `GET /loans/borrower/:borrowerId` | `{ borrower: borrowerId }` | ✅ Đã có |
| `GET /loans/match` | Complex filter (rate, periodMonth, capital) | ❌ Chưa có |
| `GET /loans/invested/waiting` | InvestContract query (cần Invest module) | ❌ Chưa có |
| `POST /loans/:id/disburse` | Update loan document | ❌ Chưa có |

### 12.3. API dùng Local Calculation

| API | Service Method | Implementation |
|-----|----------------|----------------|
| `POST /loans/rate` | `LoanCalculationService.calculateLoanRate()` | ❌ Chưa có |
| `PUT /loans/config` | `LoanCalculationService.setConfig()` | ❌ Chưa có |

---

## 13. Kế hoạch implement theo nguồn dữ liệu

### Phase 1: MongoDB APIs (Nhanh, dễ implement)

1. ❌ `GET /loans/me` - MongoDB query
2. ❌ `GET /loans/filter` - MongoDB query


**Estimated Time:** 8-10 hours

### Phase 2: Local Calculation APIs (Rất nhanh)

5. ❌ `POST /loans/rate` - Local calculation
6. ❌ `PUT /loans/config` - Local config update

**Estimated Time:** 2-3 hours

### Phase 3: Blockchain APIs (Method đã có)

7. ❌ `POST /loans/check-due-payments` - Method đã có, chỉ cần expose API
8. ❌ `POST /loans/send-reminder/:loanId` - Method đã có, chỉ cần expose API
9. ❌ `POST /loans/partial-payment` - Method đã có, chỉ cần expose API
10. ❌ `POST /loans/calculate-early-repayment` - Method đã có, chỉ cần expose API

**Estimated Time:** 4-6 hours

### Phase 4: Blockchain APIs (Cần implement method)

11. ❌ `GET /loans/due-payments` - Cần implement `getDuePayments()` trong HyperledgerService
12. ❌ `GET /loans/statistics/:loanId` - Cần implement `getLoanStatistics()` trong HyperledgerService

**Estimated Time:** 4-6 hours

### Phase 5: Advanced APIs

13. ❌ `GET /loans/invested/waiting` - Cần Invest module
14. ❌ `POST /loans/create` - Có thể không cần (nếu chỉ dùng create-auto)

**Estimated Time:** 4-6 hours

---

## 14. Tổng kết

### Đã có: 3 APIs
- ✅ `POST /loans/create-auto` - Blockchain + MongoDB
- ✅ `GET /loans/:id` - Blockchain + MongoDB
- ✅ `GET /loans/borrower/:borrowerId` - MongoDB

### Cần chuyển: 16 APIs

**Theo nguồn dữ liệu:**
- **Blockchain (Chaincode):** 9 APIs
  - Method đã có: 7 APIs
  - Method cần implement: 2 APIs
- **MongoDB:** 6 APIs
- **Local Calculation:** 2 APIs

**Theo priority:**
- 🔴 High Priority: 3 APIs
- 🟡 Medium Priority: 7 APIs
- 🟢 Low Priority: 6 APIs

### Tổng thời gian ước tính: ~40-50 hours

---

## Kết luận

Kế hoạch này cung cấp roadmap chi tiết để chuyển đổi tất cả API Loan từ server cũ sang server mới. Ưu tiên các API core trước, sau đó đến các API phụ trợ.

**Chiến lược:**
1. **MongoDB APIs trước** (nhanh, dễ implement)
2. **Local Calculation APIs** (rất nhanh)
3. **Blockchain APIs với method đã có** (chỉ cần expose)
4. **Blockchain APIs cần implement method** (cần thêm code)
5. **Advanced APIs** (cần module khác)

