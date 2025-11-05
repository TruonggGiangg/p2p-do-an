# Hướng dẫn Test API Loan với Postman

## Tổng quan

Hướng dẫn chi tiết cách test API tạo loan auto và các API loan khác bằng Postman.

## Bước 1: Tạo Postman Collection

### 1.1. Tạo Collection mới

1. Mở Postman
2. Click **New** → **Collection**
3. Đặt tên: `P2P Loan API`
4. Click **Create**

### 1.2. Tạo Environment

1. Click **Environments** (bên trái)
2. Click **+** để tạo environment mới
3. Đặt tên: `P2P Server Local`
4. Thêm các variables:

| Variable | Initial Value | Current Value |
|----------|---------------|---------------|
| `base_url` | `http://localhost:8080` | `http://localhost:8080` |
| `access_token` | (để trống) | (để trống) |
| `borrower_id` | (để trống) | (để trống) |

5. Click **Save**

## Bước 2: Đăng nhập để lấy Token

### 2.1. Tạo Request Đăng nhập

1. Trong Collection `P2P Loan API`, click **Add Request**
2. Đặt tên: `1. Login (Get Token)`
3. Method: **POST**
4. URL: `{{base_url}}/auth/signin`

### 2.2. Cấu hình Request

**Tab Headers:**
```
Content-Type: application/json
```

**Tab Body:**
- Chọn **raw** và **JSON**
- Nhập body:

```json
{
  "phone": "0912345678",
  "password": "your_password"
}
```

### 2.3. Gửi Request và lấy Token

1. Click **Send**
2. Kiểm tra response (status 200)
3. Copy `access_token` từ response
4. Vào **Environments** → `P2P Server Local`
5. Paste `access_token` vào variable `access_token`
6. Click **Save**

**Response mẫu:**
```json
{
  "statusCode": 200,
  "message": "Đăng nhập thành công",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "phone": "0912345678",
      "role": "BORROWER"
    }
  }
}
```

### 2.4. Tự động lưu Token (Optional)

1. Vào tab **Tests** của request Login
2. Thêm script:

```javascript
// Parse response
const jsonData = pm.response.json();

// Lưu access_token vào environment
if (jsonData.data && jsonData.data.access_token) {
    pm.environment.set("access_token", jsonData.data.access_token);
    console.log("Token saved to environment");
}

// Lưu borrower_id nếu có
if (jsonData.data && jsonData.data.user && jsonData.data.user._id) {
    pm.environment.set("borrower_id", jsonData.data.user._id);
    console.log("Borrower ID saved to environment");
}
```

3. Click **Send** lại → Token sẽ tự động lưu vào environment

## Bước 3: Test API Tạo Loan Auto

### 3.1. Tạo Request

1. Trong Collection, click **Add Request**
2. Đặt tên: `2. Create Loan Auto`
3. Method: **POST**
4. URL: `{{base_url}}/loans/create-auto`

### 3.2. Cấu hình Authorization

**Tab Authorization:**
- Type: **Bearer Token**
- Token: `{{access_token}}`

### 3.3. Cấu hình Headers

**Tab Headers:**
```
Content-Type: application/json
Authorization: Bearer {{access_token}}
```

### 3.4. Cấu hình Body

**Tab Body:**
- Chọn **raw** và **JSON**
- Nhập body:

```json
{
  "capital": 10000000,
  "periodMonth": 12,
  "willing": "Mua nhà",
  "disbursementDate": "2025-01-15T00:00:00.000Z"
}
```

**Lưu ý:**
- `capital`: Tối thiểu 1,000,000 VNĐ
- `periodMonth`: Từ 1 đến 60 tháng
- `disbursementDate`: ISO format hoặc MM.DD.YYYY (tối đa 30 ngày từ hôm nay)

### 3.5. Gửi Request

1. Chọn environment: `P2P Server Local` (góc trên bên phải)
2. Click **Send**
3. Kiểm tra response

**Response thành công (201):**
```json
{
  "statusCode": 201,
  "message": "Tạo khoản vay thành công",
  "data": {
    "contractId": "LOAN_1234567890",
    "info": {
      "capital": 10000000,
      "periodMonth": 12,
      "score": 750,
      "willing": "Mua nhà",
      "rate": 12.5,
      "monthlyPrincipalPay": 833333,
      "monthlyInterestPay": 104167,
      "monthlyPay": 937500,
      "entirelyPay": 11250000,
      "disbursementDate": "2025-01-15T00:00:00.000Z",
      "maturityDate": "2026-01-15T00:00:00.000Z",
      "createdAt": "2025-01-10T10:00:00.000Z"
    },
    "totalNotes": 20,
    "status": "waiting",
    "borrower": {
      "_id": "507f1f77bcf86cd799439011",
      "phone": "0912345678",
      "category": "BORROWER"
    },
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
  "timestamp": "2025-01-10T10:00:00.000Z",
  "path": "/loans/create-auto"
}
```

### 3.6. Lưu contractId (Optional)

1. Vào tab **Tests** của request Create Loan Auto
2. Thêm script:

```javascript
// Parse response
const jsonData = pm.response.json();

// Lưu contractId vào environment để dùng cho các request sau
if (jsonData.data && jsonData.data.contractId) {
    pm.environment.set("contract_id", jsonData.data.contractId);
    console.log("Contract ID saved:", jsonData.data.contractId);
}

// Log thông tin loan
if (jsonData.data && jsonData.data.info) {
    console.log("Loan created successfully!");
    console.log("Rate:", jsonData.data.info.rate + "%");
    console.log("Monthly payment:", jsonData.data.info.monthlyPay.toLocaleString() + " VNĐ");
    console.log("Total payment:", jsonData.data.info.entirelyPay.toLocaleString() + " VNĐ");
}
```

## Bước 4: Test API Lấy Chi Tiết Loan

### 4.1. Tạo Request

1. Thêm request mới: `3. Get Loan Detail`
2. Method: **GET**
3. URL: `{{base_url}}/loans/{{contract_id}}`

**Lưu ý:** Nếu chưa có `contract_id` trong environment, thay bằng `LOAN_1234567890` (contractId từ response tạo loan)

### 4.2. Cấu hình Authorization

**Tab Authorization:**
- Type: **Bearer Token**
- Token: `{{access_token}}`

### 4.3. Gửi Request

1. Click **Send**
2. Kiểm tra response

**Response thành công (200):**
```json
{
  "statusCode": 200,
  "message": "Lấy chi tiết khoản vay thành công",
  "data": {
    "contractId": "LOAN_1234567890",
    "borrower": {
      "_id": "507f1f77bcf86cd799439011",
      "phone": "0912345678",
      "name": "Nguyễn Văn A"
    },
    "info": {
      "capital": 10000000,
      "periodMonth": 12,
      "score": 750,
      "willing": "Mua nhà",
      "rate": 12.5,
      "monthlyPrincipalPay": 833333,
      "monthlyInterestPay": 104167,
      "monthlyPay": 937500,
      "entirelyPay": 11250000,
      "disbursementDate": "2025-01-15T00:00:00.000Z",
      "maturityDate": "2026-01-15T00:00:00.000Z"
    },
    "status": "waiting",
    "totalNotes": 20,
    "investedNotes": 0
  },
  "timestamp": "2025-01-10T10:00:00.000Z",
  "path": "/loans/LOAN_1234567890"
}
```

## Bước 5: Test API Lấy Danh Sách Loan của Borrower

### 5.1. Tạo Request

1. Thêm request mới: `4. Get Borrower Loans`
2. Method: **GET**
3. URL: `{{base_url}}/loans/borrower/{{borrower_id}}`

### 5.2. Cấu hình Authorization

**Tab Authorization:**
- Type: **Bearer Token**
- Token: `{{access_token}}`

### 5.3. Gửi Request

1. Click **Send**
2. Kiểm tra response

**Response thành công (200):**
```json
{
  "statusCode": 200,
  "message": "Lấy danh sách khoản vay thành công",
  "data": [
    {
      "contractId": "LOAN_1234567890",
      "info": {
        "capital": 10000000,
        "periodMonth": 12,
        "rate": 12.5
      },
      "status": "waiting"
    }
  ],
  "timestamp": "2025-01-10T10:00:00.000Z",
  "path": "/loans/borrower/507f1f77bcf86cd799439011"
}
```

## Bước 6: Test Cases

### Test Case 1: Tạo loan thành công

**Request:**
```json
{
  "capital": 10000000,
  "periodMonth": 12,
  "willing": "Mua nhà",
  "disbursementDate": "2025-01-15T00:00:00.000Z"
}
```

**Expected:**
- Status: 201
- Response có `contractId`
- Response có `info` với các field đã tính toán
- Console logs hiển thị đầy đủ

### Test Case 2: Capital quá nhỏ

**Request:**
```json
{
  "capital": 500000,
  "periodMonth": 12,
  "willing": "Mua nhà"
}
```

**Expected:**
- Status: 400
- Error: "Số tiền vay tối thiểu là 1,000,000 VNĐ"

### Test Case 3: PeriodMonth quá lớn

**Request:**
```json
{
  "capital": 10000000,
  "periodMonth": 70,
  "willing": "Mua nhà"
}
```

**Expected:**
- Status: 400
- Error: "Kỳ hạn vay tối đa là 60 tháng"

### Test Case 4: Không có token

**Request:** Không có header Authorization

**Expected:**
- Status: 401
- Error: "Token không hợp lệ hoặc đã hết hạn"

### Test Case 5: Token không hợp lệ

**Request:** Header Authorization với token sai

**Expected:**
- Status: 401
- Error: "Token không hợp lệ hoặc đã hết hạn"

### Test Case 6: User không phải BORROWER

**Request:** Token của user có role khác (LENDER, ADMIN)

**Expected:**
- Status: 403
- Error: "Không có quyền truy cập"

## Bước 7: Xem Console Logs

Khi test qua Postman, bạn sẽ thấy console logs trong terminal/server:

```
=== [LoansController] createLoanAuto - START ===
[LoansController] Request body: { ... }
[LoansController] Borrower ID: 507f1f77bcf86cd799439011
[LoansController] User detail score: 750

=== [LoansService] createLoanAuto - START ===
[LoansService] Input: { ... }
[LoansService] User score: 750
[LoansService] Generated loanId: LOAN_1234567890

=== [HyperledgerService] createLoanContractAuto - START ===
[HyperledgerService] Parameters: { ... }
[HyperledgerService] Submitting transaction to blockchain...
[HyperledgerService] Blockchain transaction successful
[HyperledgerService] Contract ID: LOAN_1234567890
[HyperledgerService] Calculated rate: 12.5

[LoansService] Saving to MongoDB...
[LoansService] Saved to MongoDB successfully

=== [LoansController] createLoanAuto - END ===
```

## Tips và Tricks

### 1. Tạo Pre-request Script

Để tự động kiểm tra token trước mỗi request:

1. Vào **Collection** → **Edit**
2. Tab **Pre-request Script**:

```javascript
// Kiểm tra token
const token = pm.environment.get("access_token");
if (!token) {
    console.warn("Warning: No access token found. Please login first.");
}
```

### 2. Tạo Test Script chung

Vào **Collection** → **Tests**:

```javascript
// Kiểm tra status code
pm.test("Status code is 200 or 201", function () {
    pm.expect(pm.response.code).to.be.oneOf([200, 201]);
});

// Kiểm tra response có message
pm.test("Response has message", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('message');
});
```

### 3. Export Collection

1. Click **...** (3 chấm) trên Collection
2. Chọn **Export**
3. Chọn format: **Collection v2.1**
4. Click **Export**
5. Lưu file `.json`

### 4. Import Collection

1. Click **Import**
2. Chọn file `.json` đã export
3. Click **Import**

## Troubleshooting

### Lỗi: 401 Unauthorized

**Nguyên nhân:** Token đã hết hạn hoặc không hợp lệ

**Giải pháp:**
1. Chạy lại request Login
2. Copy token mới
3. Update vào environment variable `access_token`

### Lỗi: 403 Forbidden

**Nguyên nhân:** User không có quyền BORROWER

**Giải pháp:**
1. Đăng nhập với user có role BORROWER
2. Kiểm tra user đã khai báo thông tin cá nhân (profile)

### Lỗi: 400 Bad Request

**Nguyên nhân:** Validation failed

**Giải pháp:**
1. Kiểm tra body request
2. Xem error message trong response
3. Sửa lại body theo yêu cầu

### Lỗi: 500 Internal Server Error

**Nguyên nhân:** Lỗi server hoặc blockchain

**Giải pháp:**
1. Kiểm tra console logs để xem lỗi cụ thể
2. Kiểm tra blockchain có đang chạy không
3. Kiểm tra MongoDB connection

## Checklist Test

- [ ] Environment đã được tạo và chọn
- [ ] Đăng nhập thành công và có token
- [ ] Token đã được lưu vào environment
- [ ] Test tạo loan thành công
- [ ] Test validation (capital, periodMonth)
- [ ] Test lấy chi tiết loan
- [ ] Test lấy danh sách loan của borrower
- [ ] Kiểm tra console logs
- [ ] Kiểm tra MongoDB có record mới
- [ ] Kiểm tra blockchain có contract mới

## Kết quả mong đợi

Sau khi test thành công, bạn sẽ thấy:

1. **Response từ API:** Có `contractId` và thông tin đầy đủ
2. **Console logs:** Hiển thị đầy đủ luồng xử lý
3. **MongoDB:** Có record mới trong collection `loans`
4. **Blockchain:** Có contract mới trên blockchain

