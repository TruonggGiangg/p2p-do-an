---
sidebar_position: 1
sidebar_label: "Loan API"
---

# Loan API

API endpoints cho quản lý khoản vay.

## Base URL
```
http://localhost:3000
```

## Authentication
Tất cả endpoints yêu cầu JWT token trong header:
```
Authorization: Bearer <token>
```

---

## Endpoints

### Kiểm tra lãi suất

```http
POST /loan/rate
```

**Request Body:**
```json
{
  "capital": 10000000,
  "periodMonth": 12,
  "disbursementDate": "2025-12-28"
}
```

**Response:**
```json
{
  "rate": 1.5,
  "annualRate": 18,
  "monthlyPay": 958408,
  "entirelyPay": 11500896,
  "interestType": "Declining Balance"
}
```

---

### Tạo khoản vay

```http
POST /loan/create-auto
```

**Request Body:**
```json
{
  "capital": 10000000,
  "periodMonth": 12,
  "willing": "Tiêu dùng cá nhân",
  "disbursementDate": "2025-12-28"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "contractId": "LOAN_1766810197512",
    "fineractLoanId": 124,
    "status": "waiting",
    "creditAssessment": {
      "score": 520,
      "grade": "C",
      "approved": true
    }
  }
}
```

---

### Lấy danh sách khoản vay của tôi

```http
GET /loan/me
```

**Response:**
```json
{
  "data": [
    {
      "contractId": "LOAN_1766810197512",
      "status": "waiting",
      "info": {
        "capital": 10000000,
        "periodMonth": 12,
        "monthlyPay": 958408
      }
    }
  ]
}
```

---

### Lấy chi tiết Fineract

```http
GET /loan/:id/fineract-details
```

**Response:**
```json
{
  "fineractLoanId": 124,
  "status": { "active": true },
  "principal": 10000000,
  "interestRate": { "perPeriod": 1.5, "annual": 18 },
  "repaymentSchedule": {
    "periods": [...],
    "totalInterestCharged": 1002000
  }
}
```

---

### Lấy số tiền tất toán

```http
GET /loan/:id/prepay-amount
```

**Response:**
```json
{
  "totalAmount": 10500000,
  "principalOutstanding": 10000000,
  "interestPortion": 500000
}
```

---

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 400 | `Invalid request` | Dữ liệu đầu vào không hợp lệ |
| 401 | `Unauthorized` | Token không hợp lệ hoặc hết hạn |
| 404 | `Loan not found` | Không tìm thấy khoản vay |
| 500 | `Internal server error` | Lỗi server |
