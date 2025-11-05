# Hướng dẫn Test API Tạo Khoản Vay Tự Động

## Tổng quan

API `POST /loans/create-auto` tạo khoản vay với tính toán tự động lãi suất trên blockchain, sau đó tự động lưu thông tin vào MongoDB.

## Flow hoạt động

1. **Client gửi request** → Controller
2. **Controller** → Service
3. **Service** → Hyperledger Fabric (Blockchain)
4. **Blockchain** → Tính toán tự động lãi suất → Trả về contract
5. **Service** → Lưu vào MongoDB (đồng bộ với blockchain)
6. **Service** → Trả về response cho client

## Yêu cầu

### 1. Đăng nhập để lấy JWT Token

Bạn cần có JWT token của user có role `BORROWER` và đã khai báo thông tin cá nhân (profile).

### 2. Đảm bảo Hyperledger Fabric đang chạy

- Blockchain network phải đang chạy
- File `config/connection.json` phải tồn tại
- Wallet folder phải có admin identity
- Chaincode `p2plending` đã được deploy

### 3. Đảm bảo MongoDB đang chạy

- MongoDB connection string trong `.env` phải đúng
- Database phải có schema `Loan` đã được tạo

## Test qua Swagger UI

### Bước 1: Mở Swagger UI

```
http://localhost:8080/api-docs
```

### Bước 2: Đăng nhập để lấy token

1. Tìm endpoint `POST /auth/signin`
2. Nhập thông tin đăng nhập
3. Copy `access_token` từ response

### Bước 3: Authorize token

1. Click nút **Authorize** ở góc trên bên phải
2. Nhập: `Bearer <your_token>`
3. Click **Authorize** và **Close**

### Bước 4: Test API tạo loan

1. Tìm endpoint `POST /loans/create-auto`
2. Click **Try it out**
3. Nhập body request:

```json
{
  "capital": 10000000,
  "periodMonth": 12,
  "willing": "Mua nhà",
  "disbursementDate": "2025-01-15T00:00:00.000Z"
}
```

4. Click **Execute**
5. Kiểm tra response

## Test qua cURL

### Bước 1: Đăng nhập để lấy token

```bash
curl -X POST http://localhost:8080/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "0912345678",
    "password": "your_password"
  }'
```

**Response:**
```json
{
  "statusCode": 200,
  "message": "Đăng nhập thành công",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { ... }
  }
}
```

### Bước 2: Tạo khoản vay

```bash
curl -X POST http://localhost:8080/loans/create-auto \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "capital": 10000000,
    "periodMonth": 12,
    "willing": "Mua nhà",
    "disbursementDate": "2025-01-15T00:00:00.000Z"
  }'
```

**Response thành công:**
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

## Test qua Postman

### Bước 1: Import Collection

1. Tạo collection mới
2. Thêm request: `POST /loans/create-auto`

### Bước 2: Cấu hình Authorization

1. Tab **Authorization**
2. Type: **Bearer Token**
3. Token: `<your_access_token>`

### Bước 3: Cấu hình Body

1. Tab **Body**
2. Chọn **raw** và **JSON**
3. Nhập:

```json
{
  "capital": 10000000,
  "periodMonth": 12,
  "willing": "Mua nhà",
  "disbursementDate": "2025-01-15T00:00:00.000Z"
}
```

### Bước 4: Gửi request

Click **Send** và kiểm tra response

## Validation Rules

### Request Body

| Field | Type | Required | Min | Max | Description |
|-------|------|----------|-----|-----|-------------|
| `capital` | number | ✅ | 1,000,000 | - | Số tiền vay (VNĐ) |
| `periodMonth` | number | ✅ | 1 | 60 | Kỳ hạn vay (tháng) |
| `willing` | string | ✅ | - | - | Mục đích vay |
| `disbursementDate` | string (ISO) | ❌ | - | - | Ngày giải ngân (tối đa 30 ngày từ hôm nay) |

### Disbursement Date Format

- **ISO format**: `2025-01-15T00:00:00.000Z`
- **MM.DD.YYYY format**: `01.15.2025` (timezone Việt Nam)

## Kiểm tra kết quả

### 1. Kiểm tra trong MongoDB

```bash
# Kết nối MongoDB
mongo

# Chọn database
use your_database_name

# Tìm loan vừa tạo
db.loans.findOne({ contractId: "LOAN_1234567890" })
```

### 2. Kiểm tra trên Blockchain

Có thể dùng script `check-blockchain.js` để query blockchain:

```bash
cd new_server
node check-blockchain.js
```

### 3. Kiểm tra logs

Xem logs trong console hoặc file `app.log`:

```
[LoansService] Loan contract LOAN_1234567890 created successfully
[HyperledgerService] Successfully connected to Hyperledger Fabric
```

## Test Cases

### Test Case 1: Tạo loan thành công

**Input:**
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
- MongoDB có record mới
- Blockchain có contract mới

### Test Case 2: Capital quá nhỏ

**Input:**
```json
{
  "capital": 500000,
  "periodMonth": 12,
  "willing": "Mua nhà"
}
```

**Expected:**
- Status: 400
- Error message: "Số tiền vay tối thiểu là 1,000,000 VNĐ"

### Test Case 3: PeriodMonth quá lớn

**Input:**
```json
{
  "capital": 10000000,
  "periodMonth": 70,
  "willing": "Mua nhà"
}
```

**Expected:**
- Status: 400
- Error message: "Kỳ hạn vay tối đa là 60 tháng"

### Test Case 4: DisbursementDate trong quá khứ

**Input:**
```json
{
  "capital": 10000000,
  "periodMonth": 12,
  "willing": "Mua nhà",
  "disbursementDate": "2024-01-01T00:00:00.000Z"
}
```

**Expected:**
- Status: 400
- Error message: "Ngày giải ngân không thể là quá khứ"

### Test Case 5: Không có token

**Input:** Không có header Authorization

**Expected:**
- Status: 401
- Error message: "Token không hợp lệ hoặc đã hết hạn"

### Test Case 6: User không phải BORROWER

**Input:** Token của user có role khác (LENDER, ADMIN)

**Expected:**
- Status: 403
- Error message: "Không có quyền truy cập"

## Troubleshooting

### Lỗi: "Hyperledger Fabric config not found"

**Nguyên nhân:** File `config/connection.json` không tồn tại

**Giải pháp:**
1. Kiểm tra file `config/connection.json` có tồn tại không
2. Nếu không có, copy từ `new_server/config/connection.json`
3. Hoặc chạy script `ccp-generate.sh` để tạo file

### Lỗi: "Admin identity not found in wallet"

**Nguyên nhân:** Wallet chưa có admin identity

**Giải pháp:**
1. Chạy script enroll admin:
```bash
cd new_server
node enroll-admin.js
```
2. Copy wallet folder sang `server_do_an/wallet`

### Lỗi: "Failed to connect to Hyperledger Fabric"

**Nguyên nhân:** Blockchain network chưa chạy

**Giải pháp:**
1. Khởi động blockchain network:
```bash
cd fabric-samples/test-network
./network.sh up createChannel -ca -c mychannel
./network.sh deployCC -ccn p2plending -ccp ../chaincode/p2p-lending -ccv 1 -ccl javascript
```

### Lỗi: "Loan contract not found" khi query

**Nguyên nhân:** Contract chưa được lưu vào MongoDB

**Giải pháp:**
1. Kiểm tra logs xem có lỗi khi save không
2. Kiểm tra MongoDB connection
3. Kiểm tra schema Loan có đúng không

## Tính toán tự động

API tự động tính toán:

1. **Lãi suất** dựa trên:
   - Điểm tín dụng (score)
   - Số tiền vay (capital)
   - Kỳ hạn vay (periodMonth)

2. **Khoản thanh toán**:
   - Gốc hàng tháng = capital / periodMonth
   - Lãi hàng tháng = (gốc hàng tháng * rate) / 100
   - Tổng thanh toán hàng tháng = gốc + lãi
   - Tổng thanh toán = tổng hàng tháng * periodMonth

3. **Maturity Date**:
   - Tự động tính = disbursementDate + periodMonth

Tất cả tính toán được thực hiện trên blockchain, đảm bảo tính minh bạch và không thể thay đổi.

