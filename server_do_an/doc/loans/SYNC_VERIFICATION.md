# Kiểm tra đồng bộ và đầy đủ thông tin

## Tổng quan

Document này kiểm tra xem code có đảm bảo:
1. **Đồng bộ** giữa MongoDB và Chaincode
2. **Đầy đủ** thông tin khi lưu vào MongoDB

---

## 1. Bảng so sánh Chaincode ↔ MongoDB

### 1.1. Các field từ Chaincode

| Chaincode Field | MongoDB Field | Status | Notes |
|-----------------|--------------|--------|-------|
| `contractId` | `contractId` | ✅ Đồng bộ | `txData.contractId` |
| `info.capital` | `info.capital` | ✅ Đồng bộ | Từ blockchain |
| `info.periodMonth` | `info.periodMonth` | ✅ Đồng bộ | Từ blockchain |
| `info.score` | `info.score` | ✅ Đồng bộ | Từ blockchain |
| `info.willing` | `info.willing` | ✅ Đồng bộ | Từ blockchain |
| `info.rate` | `info.rate` | ✅ Đồng bộ | Tính toán từ blockchain |
| `info.monthlyPrincipalPay` | `info.monthlyPrincipalPay` | ✅ Đồng bộ | Tính toán từ blockchain |
| `info.monthlyInterestPay` | `info.monthlyInterestPay` | ✅ Đồng bộ | Tính toán từ blockchain |
| `info.monthlyPay` | `info.monthlyPay` | ✅ Đồng bộ | Tính toán từ blockchain |
| `info.entirelyPay` | `info.entirelyPay` | ✅ Đồng bộ | Tính toán từ blockchain |
| `info.disbursementDate` | `info.disbursementDate` | ✅ Đồng bộ | Convert từ ISO string sang Date |
| `info.maturityDate` | `info.maturityDate` | ✅ Đồng bộ | Convert từ ISO string sang Date |
| `info.createdAt` | `info.createdAt` | ✅ Đồng bộ | Convert từ ISO string sang Date |
| `totalNotes` | `totalNotes` | ✅ Đồng bộ | `txData.totalNotes` |
| `status` | `status` | ✅ Đồng bộ | `txData.status || 'waiting'` |
| `borrower` | `borrower` | ✅ Đồng bộ | `borrower._id` (ObjectId) |
| `lastReminderSent` | `lastReminderSent` | ✅ Đồng bộ | Convert từ ISO string sang Date hoặc null |

### 1.2. Các field chỉ có trong MongoDB

| MongoDB Field | Default Value | Status | Notes |
|---------------|---------------|--------|-------|
| `nodeMatch` | `0` | ✅ Có | Set trong code: `nodeMatch: 0` |
| `matchedAmount` | `0` | ✅ Có | Set trong code: `matchedAmount: 0` |
| `matchPercentage` | `0` | ✅ Có | Set trong code: `matchPercentage: 0` |
| `isFullMatch` | `false` | ✅ Có | Set trong code: `isFullMatch: false` |
| `waitingRoomId` | `null` | ✅ Có | Set trong code: `waitingRoomId: null` |
| `waitingRooms` | `[]` | ✅ Có | Set trong code: `waitingRooms: []` |
| `investedNotes` | `0` | ✅ Có | Set trong code: `investedNotes: 0` |
| `extra` | `null` | ✅ Có | Schema default, không cần set |
| `odoo_sync` | `false` | ✅ Có | Schema default, không cần set |
| `odoo_sync_date` | `null` | ✅ Có | Schema default, không cần set |
| `disburse_done` | `false` | ✅ Có | Schema default, không cần set |
| `disburse_date` | `null` | ✅ Có | Schema default, không cần set |
| `disburse_amount` | `0` | ✅ Có | Schema default, không cần set |
| `createdAt` | Auto | ✅ Có | MongoDB timestamps tự động |
| `updatedAt` | Auto | ✅ Có | MongoDB timestamps tự động |

---

## 2. Kiểm tra code mapping

### 2.1. Code trong `loans.service.ts` (dòng 120-149)

```typescript
const loanContract = new this.loanModel({
  // ✅ Đồng bộ với blockchain
  contractId: txData.contractId,
  borrower: borrower._id,
  info: {
    capital: txData.info.capital,
    periodMonth: txData.info.periodMonth,
    score: txData.info.score,
    willing: txData.info.willing,
    rate: txData.info.rate,
    monthlyPrincipalPay: txData.info.monthlyPrincipalPay,
    monthlyInterestPay: txData.info.monthlyInterestPay,
    monthlyPay: txData.info.monthlyPay,
    entirelyPay: txData.info.entirelyPay,
    disbursementDate: new Date(txData.info.disbursementDate),
    maturityDate: new Date(txData.info.maturityDate),
    createdAt: new Date(txData.info.createdAt),
  },
  totalNotes: txData.totalNotes,
  status: txData.status || 'waiting',
  lastReminderSent: txData.lastReminderSent
    ? new Date(txData.lastReminderSent)
    : null,
  
  // ✅ MongoDB only fields
  nodeMatch: 0,
  matchedAmount: 0,
  matchPercentage: 0,
  isFullMatch: false,
  waitingRoomId: null,
  waitingRooms: [],
  investedNotes: 0,
  
  // ✅ Schema defaults (không cần set)
  // extra: null (default)
  // odoo_sync: false (default)
  // odoo_sync_date: null (default)
  // disburse_done: false (default)
  // disburse_date: null (default)
  // disburse_amount: 0 (default)
});
```

### 2.2. Đánh giá

✅ **Đồng bộ hoàn toàn:**
- Tất cả field từ blockchain đều được map vào MongoDB
- Date conversion đúng (ISO string → Date object)
- Null handling đúng (`lastReminderSent`)

✅ **Đầy đủ thông tin:**
- Tất cả field trong MongoDB schema đều có giá trị
- MongoDB only fields được set đúng default values
- Schema defaults được áp dụng đúng

---

## 3. Kiểm tra chi tiết từng field

### 3.1. Field từ Chaincode

#### ✅ `contractId`
- **Chaincode:** `contractId: loanId`
- **MongoDB:** `contractId: txData.contractId`
- **Status:** ✅ Đồng bộ

#### ✅ `info.capital`
- **Chaincode:** `capital: parseInt(capital)`
- **MongoDB:** `info.capital: txData.info.capital`
- **Status:** ✅ Đồng bộ

#### ✅ `info.periodMonth`
- **Chaincode:** `periodMonth: parseInt(periodMonth)`
- **MongoDB:** `info.periodMonth: txData.info.periodMonth`
- **Status:** ✅ Đồng bộ

#### ✅ `info.score`
- **Chaincode:** `score: parseInt(score)`
- **MongoDB:** `info.score: txData.info.score`
- **Status:** ✅ Đồng bộ

#### ✅ `info.willing`
- **Chaincode:** `willing: willing`
- **MongoDB:** `info.willing: txData.info.willing`
- **Status:** ✅ Đồng bộ

#### ✅ `info.rate`
- **Chaincode:** `rate: schedule.rate` (tính toán)
- **MongoDB:** `info.rate: txData.info.rate`
- **Status:** ✅ Đồng bộ

#### ✅ `info.monthlyPrincipalPay`
- **Chaincode:** `monthlyPrincipalPay: schedule.monthlyPrincipal` (tính toán)
- **MongoDB:** `info.monthlyPrincipalPay: txData.info.monthlyPrincipalPay`
- **Status:** ✅ Đồng bộ

#### ✅ `info.monthlyInterestPay`
- **Chaincode:** `monthlyInterestPay: schedule.monthlyInterest` (tính toán)
- **MongoDB:** `info.monthlyInterestPay: txData.info.monthlyInterestPay`
- **Status:** ✅ Đồng bộ

#### ✅ `info.monthlyPay`
- **Chaincode:** `monthlyPay: schedule.monthlyPayment` (tính toán)
- **MongoDB:** `info.monthlyPay: txData.info.monthlyPay`
- **Status:** ✅ Đồng bộ

#### ✅ `info.entirelyPay`
- **Chaincode:** `entirelyPay: schedule.totalPayment` (tính toán)
- **MongoDB:** `info.entirelyPay: txData.info.entirelyPay`
- **Status:** ✅ Đồng bộ

#### ✅ `info.disbursementDate`
- **Chaincode:** `disbursementDate: disbursementDate` (ISO string)
- **MongoDB:** `info.disbursementDate: new Date(txData.info.disbursementDate)`
- **Status:** ✅ Đồng bộ (convert đúng)

#### ✅ `info.maturityDate`
- **Chaincode:** `maturityDate: maturityDate.toISOString()` (ISO string)
- **MongoDB:** `info.maturityDate: new Date(txData.info.maturityDate)`
- **Status:** ✅ Đồng bộ (convert đúng)

#### ✅ `info.createdAt`
- **Chaincode:** `createdAt: createdAt` (ISO string từ transaction timestamp)
- **MongoDB:** `info.createdAt: new Date(txData.info.createdAt)`
- **Status:** ✅ Đồng bộ (convert đúng)

#### ✅ `totalNotes`
- **Chaincode:** `totalNotes: Math.ceil(capital / 500000)`
- **MongoDB:** `totalNotes: txData.totalNotes`
- **Status:** ✅ Đồng bộ

#### ✅ `status`
- **Chaincode:** `status: 'waiting'`
- **MongoDB:** `status: txData.status || 'waiting'`
- **Status:** ✅ Đồng bộ (có fallback)

#### ✅ `borrower`
- **Chaincode:** `borrower: borrower` (object với _id, phone, category, detail)
- **MongoDB:** `borrower: borrower._id` (ObjectId reference)
- **Status:** ✅ Đồng bộ (chỉ lưu ObjectId, detail có thể populate sau)

#### ✅ `lastReminderSent`
- **Chaincode:** `lastReminderSent: null`
- **MongoDB:** `lastReminderSent: txData.lastReminderSent ? new Date(txData.lastReminderSent) : null`
- **Status:** ✅ Đồng bộ (null handling đúng)

### 3.2. Field chỉ có trong MongoDB

#### ✅ `nodeMatch`
- **Default:** `0`
- **Code:** `nodeMatch: 0`
- **Status:** ✅ Có

#### ✅ `matchedAmount`
- **Default:** `0`
- **Code:** `matchedAmount: 0`
- **Status:** ✅ Có

#### ✅ `matchPercentage`
- **Default:** `0`
- **Code:** `matchPercentage: 0`
- **Status:** ✅ Có

#### ✅ `isFullMatch`
- **Default:** `false`
- **Code:** `isFullMatch: false`
- **Status:** ✅ Có

#### ✅ `waitingRoomId`
- **Default:** `null`
- **Code:** `waitingRoomId: null`
- **Status:** ✅ Có

#### ✅ `waitingRooms`
- **Default:** `[]`
- **Code:** `waitingRooms: []`
- **Status:** ✅ Có

#### ✅ `investedNotes`
- **Default:** `0`
- **Code:** `investedNotes: 0`
- **Status:** ✅ Có

#### ✅ `extra`
- **Default:** `null`
- **Code:** Không set (dùng schema default)
- **Status:** ✅ Có (Mongoose tự động set)

#### ✅ `odoo_sync`
- **Default:** `false`
- **Code:** Không set (dùng schema default)
- **Status:** ✅ Có (Mongoose tự động set)

#### ✅ `odoo_sync_date`
- **Default:** `null`
- **Code:** Không set (dùng schema default)
- **Status:** ✅ Có (Mongoose tự động set)

#### ✅ `disburse_done`
- **Default:** `false`
- **Code:** Không set (dùng schema default)
- **Status:** ✅ Có (Mongoose tự động set)

#### ✅ `disburse_date`
- **Default:** `null`
- **Code:** Không set (dùng schema default)
- **Status:** ✅ Có (Mongoose tự động set)

#### ✅ `disburse_amount`
- **Default:** `0`
- **Code:** Không set (dùng schema default)
- **Status:** ✅ Có (Mongoose tự động set)

#### ✅ `createdAt` (MongoDB timestamps)
- **Default:** Auto-generated
- **Code:** Không set (Mongoose timestamps tự động)
- **Status:** ✅ Có (Mongoose tự động set)

#### ✅ `updatedAt` (MongoDB timestamps)
- **Default:** Auto-generated
- **Code:** Không set (Mongoose timestamps tự động)
- **Status:** ✅ Có (Mongoose tự động set)

---

## 4. Kết luận

### ✅ **Đồng bộ hoàn toàn**

Tất cả field từ blockchain đều được map đúng vào MongoDB:
- ✅ `contractId` → `contractId`
- ✅ `info.*` → `info.*` (tất cả 11 field)
- ✅ `totalNotes` → `totalNotes`
- ✅ `status` → `status`
- ✅ `borrower` → `borrower` (ObjectId)
- ✅ `lastReminderSent` → `lastReminderSent`

**Date conversion đúng:**
- ✅ ISO string từ blockchain → Date object trong MongoDB
- ✅ Null handling đúng (`lastReminderSent`)

### ✅ **Đầy đủ thông tin**

Tất cả field trong MongoDB schema đều có giá trị:
- ✅ **Từ blockchain:** 16 field được map đúng
- ✅ **MongoDB only:** 7 field được set đúng default values
- ✅ **Schema defaults:** 6 field được Mongoose tự động set

**Không thiếu field nào:**
- ✅ Tất cả 29 field trong schema đều có giá trị khi tạo loan mới

---

## 5. Khuyến nghị

### ✅ **Code hiện tại đã đảm bảo:**
1. ✅ Đồng bộ hoàn toàn giữa MongoDB và Chaincode
2. ✅ Đầy đủ thông tin khi lưu vào MongoDB
3. ✅ Date conversion đúng (ISO string → Date)
4. ✅ Null handling đúng
5. ✅ Default values được set đúng

### 💡 **Có thể cải thiện (optional):**
1. **Thêm validation:** Kiểm tra `txData` có đầy đủ field không trước khi lưu
2. **Thêm error handling:** Try-catch khi convert Date
3. **Thêm logging:** Log khi có field nào không có trong `txData`

---

## 6. Ví dụ kiểm tra

### 6.1. Request tạo loan

```json
POST /loans/create-auto
{
  "capital": 10000000,
  "periodMonth": 12,
  "willing": "Mua nhà",
  "disbursementDate": "2025-11-15T00:00:00.000Z"
}
```

### 6.2. Blockchain response

```json
{
  "contractId": "LOAN_1762307928745",
  "info": {
    "capital": 10000000,
    "periodMonth": 12,
    "score": 0,
    "willing": "Mua nhà",
    "rate": 13.3,
    "monthlyPrincipalPay": 833333,
    "monthlyInterestPay": 110833,
    "monthlyPay": 944166,
    "entirelyPay": 11329992,
    "disbursementDate": "2025-11-15T00:00:00.000Z",
    "maturityDate": "2026-11-15T00:00:00.000Z",
    "createdAt": "2025-11-05T01:58:48.000Z"
  },
  "totalNotes": 20,
  "status": "waiting",
  "borrower": {
    "_id": "690a127328d87362860855f1"
  },
  "lastReminderSent": null
}
```

### 6.3. MongoDB document sau khi lưu

```json
{
  "_id": "690aaf5b8b892f7ca4a6c129",
  "contractId": "LOAN_1762307928745",
  "borrower": "690a127328d87362860855f1",
  "nodeMatch": 0,
  "matchedAmount": 0,
  "matchPercentage": 0,
  "isFullMatch": false,
  "waitingRoomId": null,
  "waitingRooms": [],
  "info": {
    "capital": 10000000,
    "periodMonth": 12,
    "score": 0,
    "willing": "Mua nhà",
    "rate": 13.3,
    "monthlyPrincipalPay": 833333,
    "monthlyInterestPay": 110833,
    "monthlyPay": 944166,
    "entirelyPay": 11329992,
    "disbursementDate": "2025-11-15T00:00:00.000Z",
    "maturityDate": "2026-11-15T00:00:00.000Z",
    "createdAt": "2025-11-05T01:58:48.000Z"
  },
  "totalNotes": 20,
  "investedNotes": 0,
  "status": "waiting",
  "extra": null,
  "odoo_sync": false,
  "odoo_sync_date": null,
  "disburse_done": false,
  "disburse_date": null,
  "disburse_amount": 0,
  "lastReminderSent": null,
  "createdAt": "2025-11-05T01:58:48.000Z",
  "updatedAt": "2025-11-05T01:58:48.000Z"
}
```

### 6.4. So sánh

| Field | Blockchain | MongoDB | Status |
|-------|------------|---------|--------|
| `contractId` | `"LOAN_1762307928745"` | `"LOAN_1762307928745"` | ✅ |
| `info.capital` | `10000000` | `10000000` | ✅ |
| `info.rate` | `13.3` | `13.3` | ✅ |
| `info.disbursementDate` | `"2025-11-15T00:00:00.000Z"` | `Date("2025-11-15T00:00:00.000Z")` | ✅ |
| `totalNotes` | `20` | `20` | ✅ |
| `status` | `"waiting"` | `"waiting"` | ✅ |
| `nodeMatch` | - | `0` | ✅ |
| `matchedAmount` | - | `0` | ✅ |
| `investedNotes` | - | `0` | ✅ |

**Kết luận:** ✅ Tất cả field đều đồng bộ và đầy đủ!

---

## Tổng kết

✅ **Code hiện tại đã đảm bảo:**
- ✅ Đồng bộ hoàn toàn giữa MongoDB và Chaincode
- ✅ Đầy đủ thông tin khi lưu vào MongoDB
- ✅ Date conversion đúng
- ✅ Null handling đúng
- ✅ Default values được set đúng

**Không cần sửa gì thêm!** 🎉

