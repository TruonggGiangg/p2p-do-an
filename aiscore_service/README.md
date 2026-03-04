# AIScore Service - Credit Scoring with XGBoost

Service chấm điểm tín dụng dùng mô hình **XGBoost** để đánh giá khả năng trả nợ của người vay trong hệ thống P2P Lending.

## Tính năng

- **Chấm điểm tín dụng** (300–850 scale) dựa trên 13 features tài chính
- **Quyết định cho vay** tự động: APPROVE / REVIEW / REJECT
- **Phân tích rủi ro** chi tiết với các risk factors
- **Batch scoring** hỗ trợ chấm điểm hàng loạt (tối đa 100/batch)
- **Auto-compute** các features phái sinh (DTI, loan_to_income_ratio)

## Features đầu vào

| Feature                | Mô tả                      | Bắt buộc          |
| ---------------------- | -------------------------- | ----------------- |
| `age`                  | Tuổi người vay             | ✅                |
| `monthly_income`       | Thu nhập hàng tháng (VND)  | ✅                |
| `employment_years`     | Số năm đi làm              | ❌ (default: 0)   |
| `avg_account_balance`  | Số dư TK trung bình (VND)  | ❌ (auto)         |
| `monthly_spending`     | Chi tiêu hàng tháng (VND)  | ✅                |
| `loan_amount`          | Số tiền vay (VND)          | ✅                |
| `loan_term`            | Kỳ hạn vay (tháng)         | ✅                |
| `loan_to_income_ratio` | Tỷ lệ vay/thu nhập năm     | ❌ (auto)         |
| `previous_loans_count` | Số khoản vay trước         | ❌ (default: 0)   |
| `late_payment_count`   | Số lần trả trễ             | ❌ (default: 0)   |
| `repayment_ratio`      | Tỷ lệ trả đúng hạn (0-1)   | ❌ (default: 1.0) |
| `DTI`                  | Debt-to-Income ratio       | ❌ (auto)         |
| `cashflow_stability`   | Độ ổn định dòng tiền (0-1) | ❌ (default: 0.5) |

## Cài đặt & Chạy

### Chạy local (development)

```bash
cd aiscore_service

# Cài dependencies
pip install -r requirements.txt

# Train model (chạy 1 lần)
python train_model.py

# Chạy server
python app.py
# → http://localhost:8001
```

### Docker

```bash
docker-compose up -d --build
# → http://localhost:8001
```

## API Endpoints

### `GET /api/health`

Health check & model status.

### `POST /api/score`

Chấm điểm 1 người vay.

**Request:**

```json
{
  "age": 30,
  "monthly_income": 15000000,
  "employment_years": 5,
  "monthly_spending": 8000000,
  "loan_amount": 50000000,
  "loan_term": 12,
  "previous_loans_count": 2,
  "late_payment_count": 0,
  "repayment_ratio": 0.95,
  "cashflow_stability": 0.8
}
```

**Response:**

```json
{
    "success": true,
    "data": {
        "credit_score": 720,
        "probability_good": 0.7636,
        "rating": "Good",
        "rating_vi": "Tốt",
        "rating_color": "#3B82F6",
        "decision": "APPROVE",
        "decision_vi": "Chấp thuận",
        "max_recommended_amount": 360000000,
        "risk_factors": [
            {
                "factor": "DTI",
                "impact": "positive",
                "message": "Tỷ lệ nợ/thu nhập tốt (34.4%)"
            },
            {
                "factor": "repayment_ratio",
                "impact": "positive",
                "message": "Tỷ lệ trả đúng hạn xuất sắc (95.0%)"
            }
        ],
        "details": {
            "input_features": { ... },
            "model_version": "..."
        }
    }
}
```

### `POST /api/score/batch`

Chấm điểm hàng loạt.

```json
{
    "applicants": [
        { "age": 30, "monthly_income": 15000000, ... },
        { "age": 45, "monthly_income": 25000000, ... }
    ]
}
```

### `GET /api/model/info`

Xem thông tin model, feature importance, thresholds.

### `POST /api/model/retrain`

Retrain model (admin only).

## Thang điểm

| Score   | Rating               | Quyết định                   |
| ------- | -------------------- | ---------------------------- |
| 770–850 | Xuất sắc (Excellent) | APPROVE - max 36 tháng lương |
| 685–769 | Tốt (Good)           | APPROVE - max 24 tháng lương |
| 575–684 | Trung bình (Fair)    | REVIEW - cần xem xét         |
| 465–574 | Yếu (Poor)           | REVIEW - rủi ro cao          |
| 300–464 | Rất yếu (Very Poor)  | REJECT                       |

## Kiến trúc

```
aiscore_service/
├── app.py              # Flask API server
├── scorer.py           # CreditScorer class (inference engine)
├── train_model.py      # XGBoost model training
├── wsgi.py             # Gunicorn WSGI entry point
├── gunicorn_config.py  # Production config
├── requirements.txt    # Python dependencies
├── Dockerfile
├── docker-compose.yml
├── models/             # Trained model artifacts (auto-generated)
│   ├── xgb_credit_model.json
│   ├── scaler.joblib
│   └── metadata.json
└── README.md
```
