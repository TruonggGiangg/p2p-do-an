# Tài liệu chi tiết các trường thông tin Loan Contract

## Tổng quan

Document này giải thích chi tiết tất cả các trường thông tin trong Loan Contract ở các layer:
- **MongoDB Schema** (NestJS/Mongoose)
- **Chaincode Model** (Hyperledger Fabric)
- **NestJS DTOs** (Request/Response)
- **API Endpoints** (Request/Response bodies)

---

## 1. MongoDB Schema (loan.schema.ts)

### 1.1. Loan Document Structure

```typescript
{
  _id: ObjectId,              // MongoDB tự động tạo
  contractId: string,          // Đồng bộ với blockchain
  borrower: ObjectId,          // Reference đến User
  nodeMatch: number,           // Số lượng note đã match
  matchedAmount: number,       // Số tiền đã match
  matchPercentage: number,    // % match
  isFullMatch: boolean,        // Đã match đủ chưa
  waitingRoomId: ObjectId,    // WaitingRoom hiện tại
  waitingRooms: ObjectId[],    // Danh sách WaitingRoom
  info: {                      // Thông tin loan (đồng bộ với blockchain)
    capital: number,
    periodMonth: number,
    score: number,
    willing: string,
    rate: number,
    monthlyPrincipalPay: number,
    monthlyInterestPay: number,
    monthlyPay: number,
    entirelyPay: number,
    disbursementDate: Date,
    maturityDate: Date,
    createdAt: Date
  },
  totalNotes: number,          // Tổng số note
  investedNotes: number,       // Số note đã đầu tư
  status: string,              // Trạng thái loan
  extra: string,               // Thông tin bổ sung
  odoo_sync: boolean,         // Đã sync với Odoo chưa
  odoo_sync_date: Date,       // Ngày sync với Odoo
  disburse_done: boolean,     // Đã giải ngân chưa
  disburse_date: Date,        // Ngày giải ngân
  disburse_amount: number,     // Số tiền giải ngân
  lastReminderSent: Date,     // Lần cuối gửi nhắc hẹn
  createdAt: Date,            // MongoDB tự động tạo
  updatedAt: Date             // MongoDB tự động cập nhật
}
```

### 1.2. Chi tiết từng trường

#### **contractId** (String, Required, Unique)
- **Mô tả:** ID hợp đồng vay, đồng bộ với blockchain
- **Format:** `LOAN_<timestamp>` (ví dụ: `LOAN_1762307928745`)
- **Validation:** Unique trong database
- **Nguồn:** Tạo tự động trong `LoansService.createLoanAuto()`
- **Ví dụ:** `"LOAN_1762307928745"`

#### **borrower** (ObjectId, Required, Ref: 'User')
- **Mô tả:** Reference đến User (borrower)
- **Type:** `Types.ObjectId`
- **Validation:** Required, phải là ObjectId hợp lệ
- **Nguồn:** Từ `req.user._id` trong controller
- **Ví dụ:** `"690a127328d87362860855f1"`

#### **nodeMatch** (Number, Default: 0)
- **Mô tả:** Số lượng note đã được match với lenders
- **Type:** `number`
- **Default:** `0`
- **Tính toán:** Tăng khi có lender đầu tư
- **Ví dụ:** `15` (trong tổng 20 notes)

#### **matchedAmount** (Number, Default: 0)
- **Mô tả:** Số tiền đã được match (VNĐ)
- **Type:** `number`
- **Default:** `0`
- **Tính toán:** `nodeMatch * 500000` (mỗi note = 500,000 VNĐ)
- **Ví dụ:** `7500000` (15 notes × 500,000)

#### **matchPercentage** (Number, Default: 0)
- **Mô tả:** Phần trăm match (%)
- **Type:** `number`
- **Default:** `0`
- **Tính toán:** `(matchedAmount / capital) * 100`
- **Ví dụ:** `75` (75% đã match)

#### **isFullMatch** (Boolean, Default: false)
- **Mô tả:** Đã match đủ 100% chưa
- **Type:** `boolean`
- **Default:** `false`
- **Tính toán:** `matchPercentage === 100`
- **Ví dụ:** `true` hoặc `false`

#### **waitingRoomId** (ObjectId, Default: null, Ref: 'WaitingRoom')
- **Mô tả:** WaitingRoom hiện tại loan đang ở
- **Type:** `Types.ObjectId | null`
- **Default:** `null`
- **Ví dụ:** `"690a127328d87362860855f2"` hoặc `null`

#### **waitingRooms** (Array of ObjectId, Default: [])
- **Mô tả:** Danh sách tất cả WaitingRoom loan đã tham gia
- **Type:** `Types.ObjectId[]`
- **Default:** `[]`
- **Ví dụ:** `["690a127328d87362860855f2", "690a127328d87362860855f3"]`

#### **info** (Object, Required)
- **Mô tả:** Thông tin loan contract, **đồng bộ với blockchain**
- **Type:** Nested object
- **Validation:** Required, tất cả field trong info đều required trừ các field có default
- **Nguồn:** Từ blockchain response

##### **info.capital** (Number, Required)
- **Mô tả:** Số tiền vay (VNĐ)
- **Type:** `number`
- **Validation:** `>= 1000000` (tối thiểu 1 triệu VNĐ)
- **Nguồn:** Từ request body `CreateLoanAutoDto.capital`
- **Ví dụ:** `10000000` (10 triệu VNĐ)

##### **info.periodMonth** (Number, Required)
- **Mô tả:** Kỳ hạn vay (tháng)
- **Type:** `number`
- **Validation:** `>= 1 && <= 60` (tối thiểu 1 tháng, tối đa 60 tháng)
- **Nguồn:** Từ request body `CreateLoanAutoDto.periodMonth`
- **Ví dụ:** `12` (12 tháng)

##### **info.score** (Number, Required)
- **Mô tả:** Điểm tín dụng của borrower
- **Type:** `number`
- **Validation:** `>= 0`
- **Nguồn:** Từ `userDetail.score` (default: 0)
- **Ảnh hưởng:** Ảnh hưởng đến lãi suất (score cao → lãi suất thấp)
- **Ví dụ:** `750` hoặc `0`

##### **info.willing** (String, Required)
- **Mô tả:** Mục đích vay
- **Type:** `string`
- **Validation:** Required, không rỗng
- **Nguồn:** Từ request body `CreateLoanAutoDto.willing`
- **Ví dụ:** `"Mua nhà"`, `"Kinh doanh"`, `"Mua xe"`

##### **info.rate** (Number, Default: 0)
- **Mô tả:** Lãi suất (%/năm)
- **Type:** `number`
- **Default:** `0` (tính toán tự động)
- **Tính toán:** Tính toán trên blockchain bằng `calculateLoanRate()`
- **Công thức:** 
  ```
  rate = factorConstant 
       - (ficoCoefficient * score)
       - capitalDiscount
       - (monthCoefficient * periodMonth)
  
  Trong đó:
  - factorConstant = 15
  - ficoCoefficient = 0.01
  - capitalDiscount = log10(capital / 1000000) * 0.5
  - monthCoefficient = 0.1
  
  Giới hạn: 3% <= rate <= 25%
  ```
- **Ví dụ:** `13.3` (13.3%/năm)

##### **info.monthlyPrincipalPay** (Number, Default: 0)
- **Mô tả:** Gốc trả mỗi tháng (VNĐ)
- **Type:** `number`
- **Default:** `0` (tính toán tự động)
- **Tính toán:** `Math.round(capital / periodMonth)`
- **Ví dụ:** `833333` (10,000,000 / 12 = 833,333 VNĐ)

##### **info.monthlyInterestPay** (Number, Default: 0)
- **Mô tả:** Lãi trả mỗi tháng (VNĐ)
- **Type:** `number`
- **Default:** `0` (tính toán tự động)
- **Tính toán:** `Math.round(monthlyPrincipalPay * rate / 100)`
- **Ví dụ:** `110833` (833,333 × 13.3% / 12 ≈ 110,833 VNĐ)

##### **info.monthlyPay** (Number, Default: 0)
- **Mô tả:** Tổng trả mỗi tháng (VNĐ) = Gốc + Lãi
- **Type:** `number`
- **Default:** `0` (tính toán tự động)
- **Tính toán:** `monthlyPrincipalPay + monthlyInterestPay`
- **Ví dụ:** `944166` (833,333 + 110,833 = 944,166 VNĐ)

##### **info.entirelyPay** (Number, Default: 0)
- **Mô tả:** Tổng trả cả kỳ (VNĐ)
- **Type:** `number`
- **Default:** `0` (tính toán tự động)
- **Tính toán:** `monthlyPay * periodMonth`
- **Ví dụ:** `11329992` (944,166 × 12 = 11,329,992 VNĐ)

##### **info.disbursementDate** (Date, Required)
- **Mô tả:** Ngày giải ngân dự kiến
- **Type:** `Date`
- **Validation:** 
  - Không được là quá khứ
  - Không được quá 30 ngày từ hôm nay
  - Hỗ trợ format: ISO string (`2025-11-15T00:00:00.000Z`) hoặc MM.DD.YYYY (`11.15.2025`)
- **Nguồn:** Từ request body `CreateLoanAutoDto.disbursementDate` (optional, nếu không có thì dùng `createdAt`)
- **Ví dụ:** `2025-11-15T00:00:00.000Z`

##### **info.maturityDate** (Date, Required)
- **Mô tả:** Ngày đáo hạn
- **Type:** `Date`
- **Tính toán:** `disbursementDate + periodMonth` (tháng)
- **Nguồn:** Tính toán tự động trên blockchain
- **Ví dụ:** `2026-11-15T00:00:00.000Z` (disbursementDate + 12 tháng)

##### **info.createdAt** (Date, Default: Date.now)
- **Mô tả:** Thời gian tạo contract
- **Type:** `Date`
- **Default:** `Date.now()`
- **Nguồn:** Timestamp từ blockchain transaction (`ctx.stub.getTxTimestamp()`)
- **Ví dụ:** `2025-11-05T01:58:48.000Z`

#### **totalNotes** (Number, Required)
- **Mô tả:** Tổng số note (đơn vị đầu tư)
- **Type:** `number`
- **Tính toán:** `Math.ceil(capital / 500000)` (mỗi note = 500,000 VNĐ)
- **Nguồn:** Tính toán trên blockchain
- **Ví dụ:** `20` (10,000,000 / 500,000 = 20 notes)

#### **investedNotes** (Number, Default: 0)
- **Mô tả:** Số note đã được đầu tư
- **Type:** `number`
- **Default:** `0`
- **Tính toán:** Tăng khi có lender đầu tư
- **Ví dụ:** `15` (15 notes đã được đầu tư)

#### **status** (String, Enum, Default: 'waiting')
- **Mô tả:** Trạng thái loan contract
- **Type:** `string`
- **Enum:** `['waiting', 'success', 'clean', 'fail']`
- **Default:** `'waiting'`
- **Giải thích:**
  - `waiting`: Đang chờ matching với lenders
  - `success`: Đã match đủ và đang trong quá trình vay
  - `clean`: Đã trả hết nợ
  - `fail`: Thất bại (không match đủ, v.v.)
- **Ví dụ:** `"waiting"`

#### **extra** (String, Default: null)
- **Mô tả:** Thông tin bổ sung
- **Type:** `string | null`
- **Default:** `null`
- **Ví dụ:** `"Thông tin bổ sung"` hoặc `null`

#### **odoo_sync** (Boolean, Default: false)
- **Mô tả:** Đã đồng bộ với hệ thống Odoo chưa
- **Type:** `boolean`
- **Default:** `false`
- **Ví dụ:** `true` hoặc `false`

#### **odoo_sync_date** (Date, Default: null)
- **Mô tả:** Ngày đồng bộ với Odoo
- **Type:** `Date | null`
- **Default:** `null`
- **Ví dụ:** `2025-11-05T01:58:48.000Z` hoặc `null`

#### **disburse_done** (Boolean, Default: false)
- **Mô tả:** Đã giải ngân chưa
- **Type:** `boolean`
- **Default:** `false`
- **Ví dụ:** `true` hoặc `false`

#### **disburse_date** (Date, Default: null)
- **Mô tả:** Ngày giải ngân thực tế
- **Type:** `Date | null`
- **Default:** `null`
- **Ví dụ:** `2025-11-15T00:00:00.000Z` hoặc `null`

#### **disburse_amount** (Number, Default: 0)
- **Mô tả:** Số tiền giải ngân thực tế (VNĐ)
- **Type:** `number`
- **Default:** `0`
- **Ví dụ:** `10000000` (10 triệu VNĐ)

#### **lastReminderSent** (Date, Default: null)
- **Mô tả:** Lần cuối gửi nhắc hẹn thanh toán
- **Type:** `Date | null`
- **Default:** `null`
- **Nguồn:** Từ blockchain (để hỗ trợ nhắc hẹn sau này)
- **Ví dụ:** `2025-11-05T01:58:48.000Z` hoặc `null`

#### **createdAt** (Date, Auto-generated)
- **Mô tả:** Thời gian tạo document trong MongoDB
- **Type:** `Date`
- **Auto-generated:** MongoDB tự động tạo khi save
- **Ví dụ:** `2025-11-05T01:58:48.000Z`

#### **updatedAt** (Date, Auto-generated)
- **Mô tả:** Thời gian cập nhật document lần cuối
- **Type:** `Date`
- **Auto-generated:** MongoDB tự động cập nhật khi save
- **Ví dụ:** `2025-11-05T01:58:48.000Z`

---

## 2. Chaincode Model (p2p-lending-contract.js)

### 2.1. LoanContract Structure (trên blockchain)

```javascript
{
  contractId: string,          // ID hợp đồng
  info: {                      // Thông tin loan
    capital: number,
    periodMonth: number,
    score: number,
    willing: string,
    rate: number,
    monthlyPrincipalPay: number,
    monthlyInterestPay: number,
    monthlyPay: number,
    entirelyPay: number,
    disbursementDate: string,  // ISO string
    maturityDate: string,      // ISO string
    createdAt: string         // ISO string
  },
  totalNotes: number,          // Tổng số note
  status: string,              // Trạng thái
  borrower: {                  // Thông tin borrower
    _id: string,
    phone: string,
    category: string,
    detail: object
  },
  lastReminderSent: string | null  // ISO string hoặc null
}
```

### 2.2. Chi tiết từng trường

#### **contractId** (String)
- **Mô tả:** ID hợp đồng vay
- **Format:** `LOAN_<timestamp>`
- **Nguồn:** Parameter `loanId` từ `createLoanContractAuto()`
- **Ví dụ:** `"LOAN_1762307928745"`

#### **info** (Object)
- **Mô tả:** Thông tin loan contract, giống MongoDB schema
- **Chi tiết:** Xem phần **1.2. info** ở trên
- **Lưu ý:** 
  - Tất cả dates là ISO string trên blockchain
  - Tính toán tự động: `rate`, `monthlyPrincipalPay`, `monthlyInterestPay`, `monthlyPay`, `entirelyPay`, `maturityDate`

#### **totalNotes** (Number)
- **Mô tả:** Tổng số note
- **Tính toán:** `Math.ceil(capital / 500000)`
- **Ví dụ:** `20`

#### **status** (String)
- **Mô tả:** Trạng thái loan contract
- **Values:** `'waiting'`, `'success'`, `'clean'`, `'fail'`
- **Default:** `'waiting'`
- **Ví dụ:** `"waiting"`

#### **borrower** (Object)
- **Mô tả:** Thông tin borrower (JSON string từ parameter)
- **Structure:**
  ```javascript
  {
    _id: string,      // Borrower ID
    phone: string,    // Số điện thoại (optional)
    category: string, // Category (optional)
    detail: object    // Chi tiết (optional)
  }
  ```
- **Nguồn:** Parameter `borrowerJson` (JSON string) từ `createLoanContractAuto()`
- **Ví dụ:**
  ```json
  {
    "_id": "690a127328d87362860855f1",
    "phone": "0912345678",
    "category": "BORROWER",
    "detail": {}
  }
  ```

#### **lastReminderSent** (String | null)
- **Mô tả:** Lần cuối gửi nhắc hẹn (ISO string)
- **Type:** `string | null`
- **Default:** `null`
- **Ví dụ:** `"2025-11-05T01:58:48.000Z"` hoặc `null`

### 2.3. Chaincode Method: createLoanContractAuto

#### **Parameters:**
```javascript
createLoanContractAuto(
  ctx,                    // Context (tự động)
  loanId,                  // String: ID hợp đồng
  capital,                 // String: Số tiền vay
  periodMonth,             // String: Kỳ hạn (tháng)
  score,                   // String: Điểm tín dụng
  willing,                 // String: Mục đích vay
  borrowerJson,            // String: JSON string của borrower object
  disbursementDateISO      // String: ISO string hoặc empty string
)
```

#### **Return:**
```javascript
// JSON string của LoanContract object
{
  contractId: string,
  info: { ... },
  totalNotes: number,
  status: string,
  borrower: { ... },
  lastReminderSent: string | null
}
```

---

## 3. NestJS DTOs

### 3.1. CreateLoanAutoDto (Request Body)

#### **Structure:**
```typescript
{
  capital: number,              // Required
  periodMonth: number,           // Required
  willing: string,               // Required
  disbursementDate?: string      // Optional
}
```

#### **Chi tiết từng trường:**

##### **capital** (Number, Required)
- **Mô tả:** Số tiền vay (VNĐ)
- **Type:** `number`
- **Validation:**
  - `@IsNumber()`: Phải là number
  - `@Type(() => Number)`: Tự động convert từ string sang number
  - `@Min(1000000)`: Tối thiểu 1,000,000 VNĐ
- **Error message:** `"Số tiền vay tối thiểu là 1,000,000 VNĐ"`
- **Ví dụ:** `10000000`

##### **periodMonth** (Number, Required)
- **Mô tả:** Kỳ hạn vay (tháng)
- **Type:** `number`
- **Validation:**
  - `@IsNumber()`: Phải là number
  - `@Type(() => Number)`: Tự động convert từ string sang number
  - `@Min(1)`: Tối thiểu 1 tháng
  - `@Max(60)`: Tối đa 60 tháng
- **Error messages:**
  - `"Kỳ hạn vay tối thiểu là 1 tháng"`
  - `"Kỳ hạn vay tối đa là 60 tháng"`
- **Ví dụ:** `12`

##### **willing** (String, Required)
- **Mô tả:** Mục đích vay
- **Type:** `string`
- **Validation:**
  - `@IsString()`: Phải là string
  - Không được rỗng
- **Ví dụ:** `"Mua nhà"`

##### **disbursementDate** (String, Optional)
- **Mô tả:** Ngày giải ngân dự kiến
- **Type:** `string`
- **Validation:**
  - `@IsOptional()`: Optional field
  - `@IsDateString()`: Phải là date string hợp lệ
  - Custom validation trong service:
    - Không được là quá khứ
    - Không được quá 30 ngày từ hôm nay
- **Formats hỗ trợ:**
  - ISO string: `"2025-11-15T00:00:00.000Z"`
  - MM.DD.YYYY: `"11.15.2025"` (timezone: Asia/Ho_Chi_Minh)
- **Error messages:**
  - `"Ngày giải ngân không hợp lệ"`
  - `"Ngày giải ngân không thể là quá khứ"`
  - `"Ngày giải ngân không thể quá 30 ngày từ hôm nay"`
- **Default:** Nếu không có, dùng `createdAt` từ blockchain
- **Ví dụ:** `"2025-11-15T00:00:00.000Z"` hoặc `"11.15.2025"`

---

## 4. API Endpoints

### 4.1. POST /loans/create-auto

#### **Request Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### **Request Body:**
```json
{
  "capital": 10000000,
  "periodMonth": 12,
  "willing": "Mua nhà",
  "disbursementDate": "2025-11-15T00:00:00.000Z"
}
```

#### **Response Success (201):**
```json
{
  "statusCode": 201,
  "message": "Tạo khoản vay thành công",
  "data": {
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
      "_id": "690a127328d87362860855f1",
      "phone": "0912345678",
      "category": "BORROWER",
      "detail": {}
    },
    "lastReminderSent": null,
    "_id": "LOAN_1762307928745",
    "matchingStatus": {
      "nodeMatch": 0,
      "matchedAmount": 0,
      "matchPercentage": 0,
      "isFullMatch": false,
      "waitingRoomId": null,
      "waitingRooms": [],
      "message": "Waiting for matching"
    }
  },
  "timestamp": "2025-11-05T01:58:48.000Z",
  "path": "/loans/create-auto"
}
```

#### **Response Error (400):**
```json
{
  "statusCode": 400,
  "message": "Số tiền vay tối thiểu là 1,000,000 VNĐ",
  "timestamp": "2025-11-05T01:58:48.000Z",
  "path": "/loans/create-auto"
}
```

#### **Response Error (401):**
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "timestamp": "2025-11-05T01:58:48.000Z",
  "path": "/loans/create-auto"
}
```

#### **Response Error (403):**
```json
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "timestamp": "2025-11-05T01:58:48.000Z",
  "path": "/loans/create-auto"
}
```

### 4.2. GET /loans/:id

#### **Request Headers:**
```
Authorization: Bearer <access_token>
```

#### **Request Params:**
- `id` (String): Contract ID của loan (ví dụ: `LOAN_1762307928745`)

#### **Response Success (200):**
```json
{
  "statusCode": 200,
  "message": "Lấy chi tiết khoản vay thành công",
  "data": {
    "_id": "690aaf5b8b892f7ca4a6c129",
    "contractId": "LOAN_1762307928745",
    "borrower": {
      "_id": "690a127328d87362860855f1",
      "phone": "0912345678",
      "name": "Nguyễn Văn A",
      "role": "BORROWER"
    },
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
  },
  "timestamp": "2025-11-05T01:58:48.000Z",
  "path": "/loans/LOAN_1762307928745"
}
```

#### **Response Error (404):**
```json
{
  "statusCode": 404,
  "message": "Loan contract not found",
  "timestamp": "2025-11-05T01:58:48.000Z",
  "path": "/loans/LOAN_1762307928745"
}
```

### 4.3. GET /loans/borrower/:borrowerId

#### **Request Headers:**
```
Authorization: Bearer <access_token>
```

#### **Request Params:**
- `borrowerId` (String): ID của borrower (ví dụ: `690a127328d87362860855f1`)

#### **Request Query (Optional):**
- `status` (String): Filter theo status (ví dụ: `?status=waiting`)

#### **Response Success (200):**
```json
{
  "statusCode": 200,
  "message": "Lấy danh sách khoản vay thành công",
  "data": [
    {
      "_id": "690aaf5b8b892f7ca4a6c129",
      "contractId": "LOAN_1762307928745",
      "borrower": {
        "_id": "690a127328d87362860855f1",
        "phone": "0912345678",
        "name": "Nguyễn Văn A"
      },
      "info": {
        "capital": 10000000,
        "periodMonth": 12,
        "rate": 13.3
      },
      "status": "waiting",
      "totalNotes": 20,
      "investedNotes": 0,
      "createdAt": "2025-11-05T01:58:48.000Z"
    }
  ],
  "timestamp": "2025-11-05T01:58:48.000Z",
  "path": "/loans/borrower/690a127328d87362860855f1"
}
```

#### **Response Error (403):**
```json
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "timestamp": "2025-11-05T01:58:48.000Z",
  "path": "/loans/borrower/690a127328d87362860855f1"
}
```

---

## 5. Mapping giữa các layer

### 5.1. MongoDB ↔ Chaincode

| MongoDB Field | Chaincode Field | Notes |
|---------------|-----------------|-------|
| `contractId` | `contractId` | Đồng bộ |
| `borrower` | `borrower` | MongoDB: ObjectId, Chaincode: Object |
| `info.*` | `info.*` | Đồng bộ hoàn toàn |
| `totalNotes` | `totalNotes` | Đồng bộ |
| `status` | `status` | Đồng bộ |
| `lastReminderSent` | `lastReminderSent` | Đồng bộ |
| `nodeMatch` | - | Chỉ MongoDB (matching logic) |
| `matchedAmount` | - | Chỉ MongoDB (matching logic) |
| `matchPercentage` | - | Chỉ MongoDB (matching logic) |
| `isFullMatch` | - | Chỉ MongoDB (matching logic) |
| `waitingRoomId` | - | Chỉ MongoDB (matching logic) |
| `waitingRooms` | - | Chỉ MongoDB (matching logic) |
| `investedNotes` | - | Chỉ MongoDB (matching logic) |
| `extra` | - | Chỉ MongoDB |
| `odoo_sync` | - | Chỉ MongoDB |
| `odoo_sync_date` | - | Chỉ MongoDB |
| `disburse_done` | - | Chỉ MongoDB |
| `disburse_date` | - | Chỉ MongoDB |
| `disburse_amount` | - | Chỉ MongoDB |

### 5.2. Request Body → Chaincode Parameters

| DTO Field | Chaincode Parameter | Transformation |
|-----------|---------------------|----------------|
| `capital` | `capital` | Convert to string |
| `periodMonth` | `periodMonth` | Convert to string |
| - | `score` | From `userDetail.score` |
| `willing` | `willing` | Direct |
| - | `borrowerJson` | JSON.stringify(borrower object) |
| `disbursementDate` | `disbursementDateISO` | Validate & format to ISO string |

---

## 6. Luồng xử lý (Flow)

### 6.1. Tạo Loan Auto (createLoanAuto)

```
1. Controller nhận request
   ↓
2. Validate DTO (capital, periodMonth, willing, disbursementDate)
   ↓
3. Service validate disbursementDate (nếu có)
   ↓
4. Service kiểm tra borrower có loan đang chờ không (blockchain)
   ↓
5. Service tạo loanId: LOAN_<timestamp>
   ↓
6. Service gọi blockchain: createLoanContractAuto()
   ↓
7. Blockchain tính toán:
   - calculateLoanRate() → rate
   - calculateLoanSchedule() → monthlyPrincipalPay, monthlyInterestPay, monthlyPay, entirelyPay
   - Tính maturityDate = disbursementDate + periodMonth
   ↓
8. Blockchain trả về LoanContract object
   ↓
9. Service lưu vào MongoDB (đồng bộ với blockchain)
   ↓
10. Service trả về result với matchingStatus
   ↓
11. Controller trả response về client
```

### 6.2. Lấy chi tiết Loan (findOne)

```
1. Controller nhận request với contractId
   ↓
2. Service query MongoDB: findOne({ contractId })
   ↓
3. Service populate borrower
   ↓
4. Service trả về loan document
   ↓
5. Controller trả response
```

### 6.3. Lấy danh sách Loan của Borrower (findByBorrower)

```
1. Controller nhận request với borrowerId
   ↓
2. Controller kiểm tra quyền (borrower chỉ xem được loan của mình)
   ↓
3. Service query MongoDB: find({ borrower: borrowerId, status: ... })
   ↓
4. Service populate borrower
   ↓
5. Service trả về array of loan documents
   ↓
6. Controller trả response
```

---

## 7. Validation Rules Summary

### 7.1. Request Body Validation

| Field | Rules |
|-------|-------|
| `capital` | Number, >= 1,000,000 |
| `periodMonth` | Number, >= 1, <= 60 |
| `willing` | String, required, not empty |
| `disbursementDate` | String (optional), ISO or MM.DD.YYYY, not past, not > 30 days from today |

### 7.2. Business Logic Validation

| Rule | Description |
|------|-------------|
| Borrower check | Kiểm tra borrower có loan đang chờ không (status = 'waiting') |
| Score validation | Score >= 0 (default: 0) |
| Date validation | disbursementDate không quá khứ, không quá 30 ngày |
| Rate calculation | Rate được tính tự động dựa trên capital, periodMonth, score |
| Notes calculation | totalNotes = Math.ceil(capital / 500000) |

---

## 8. Tính toán lãi suất

### 8.1. Công thức

```javascript
rate = factorConstant 
     - (ficoCoefficient * score)
     - capitalDiscount
     - (monthCoefficient * periodMonth)

Trong đó:
- factorConstant = 15
- ficoCoefficient = 0.01
- capitalDiscount = log10(capital / 1000000) * 0.5
- monthCoefficient = 0.1

Giới hạn: 3% <= rate <= 25%
```

### 8.2. Ví dụ tính toán

**Input:**
- `capital` = 10,000,000 VNĐ
- `periodMonth` = 12 tháng
- `score` = 0

**Tính toán:**
```
capitalDiscount = log10(10000000 / 1000000) * 0.5
                = log10(10) * 0.5
                = 1 * 0.5
                = 0.5

rate = 15 - (0.01 * 0) - 0.5 - (0.1 * 12)
     = 15 - 0 - 0.5 - 1.2
     = 13.3%

Giới hạn: 3% <= 13.3% <= 25% ✓
```

### 8.3. Tính toán lịch thanh toán

```javascript
monthlyPrincipalPay = Math.round(capital / periodMonth)
                    = Math.round(10000000 / 12)
                    = 833333 VNĐ

monthlyInterestPay = Math.round(monthlyPrincipalPay * rate / 100)
                   = Math.round(833333 * 13.3 / 100)
                   = 110833 VNĐ

monthlyPay = monthlyPrincipalPay + monthlyInterestPay
           = 833333 + 110833
           = 944166 VNĐ

entirelyPay = monthlyPay * periodMonth
             = 944166 * 12
             = 11329992 VNĐ
```

---

## 9. Lưu ý quan trọng

1. **Đồng bộ MongoDB ↔ Blockchain:**
   - Tất cả field trong `info` phải đồng bộ giữa MongoDB và blockchain
   - `contractId`, `totalNotes`, `status`, `lastReminderSent` cũng phải đồng bộ
   - Blockchain là source of truth cho thông tin loan contract

2. **Date Format:**
   - MongoDB: `Date` object
   - Chaincode: ISO string (`"2025-11-15T00:00:00.000Z"`)
   - Request: ISO string hoặc MM.DD.YYYY

3. **Validation:**
   - DTO validation: NestJS class-validator
   - Business logic validation: Trong service (disbursementDate, borrower check)

4. **Matching Logic:**
   - Các field liên quan đến matching (`nodeMatch`, `matchedAmount`, `matchPercentage`, `isFullMatch`, `waitingRoomId`, `waitingRooms`) chỉ có trong MongoDB
   - Không lưu trên blockchain

5. **Score ảnh hưởng:**
   - Score cao → lãi suất thấp
   - Score = 0 → lãi suất cao nhất (trong khoảng 3-25%)

---

## 10. Ví dụ đầy đủ

### 10.1. Request tạo loan

```json
POST /loans/create-auto
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "capital": 10000000,
  "periodMonth": 12,
  "willing": "Mua nhà",
  "disbursementDate": "2025-11-15T00:00:00.000Z"
}
```

### 10.2. Response từ blockchain

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

### 10.3. Document trong MongoDB

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

---

## Kết luận

Document này cung cấp chi tiết đầy đủ về:
- Tất cả các trường trong MongoDB schema
- Tất cả các trường trong Chaincode model
- Request/Response bodies của tất cả endpoints
- Validation rules và business logic
- Mapping giữa các layer
- Luồng xử lý và tính toán

Để hiểu rõ hơn về một trường cụ thể, xem phần tương ứng trong document.

