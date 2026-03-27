# AIScore Service — Hybrid Stacking Credit Scoring (P2P Lending)

Service chấm điểm tín dụng dùng mô hình **Hybrid Stacking 2 tầng** — 5 Base Learners (OOF) + Random Forest Meta-Learner — để dự đoán xác suất vỡ nợ (PD) cho người vay trong hệ thống P2P Lending Việt Nam.

## Kiến trúc mô hình

```
Level 1 (OOF 5-Fold):
  ├── XGBoost            → PD_xgb
  ├── LightGBM           → PD_lgbm
  ├── CatBoost           → PD_cat
  ├── ExtraTrees         → PD_et
  └── GradientBoosting   → PD_gb

Level 2 (Meta-Learner):
  └── Random Forest (5 OOF + 15 features = 20 dims) → PD_final
```

## Tính năng

- **Hybrid Stacking 2 tầng** — 5 Base Learners + RF Meta-Learner
- **OOF (Out-Of-Fold)** — chống data leakage hoàn toàn
- **Per-Feature Scaling** — 15 StandardScaler riêng biệt (mỗi feature 1 scaler)
- **15 features đầu vào** — tất cả ở đơn vị VNĐ
- **Batch scoring** — hỗ trợ chấm điểm hàng loạt (tối đa 100/batch)
- **20 biểu đồ đánh giá** — ROC, PR, CM, Radar, Gain/Lift, KS, ...
- **Nested Cross-Validation** — 5 outer × 5 inner folds

## Features đầu vào (15 features)

| #   | Feature                  | Mô tả                  | Đơn vị  |
| --- | ------------------------ | ---------------------- | ------- |
| 1   | `credit_score`           | Điểm tín dụng          | 150–750 |
| 2   | `capital`                | Số tiền vay            | VNĐ     |
| 3   | `monthly_income`         | Lương tháng            | VNĐ     |
| 4   | `monthly_pay`            | Trả góp/tháng          | VNĐ     |
| 5   | `revolving_balance`      | Dư nợ tín dụng         | VNĐ     |
| 6   | `dti`                    | Tỷ lệ Nợ/Thu nhập      | %       |
| 7   | `revolving_util_percent` | % sử dụng hạn mức      | %       |
| 8   | `term_months`            | Kỳ hạn vay             | tháng   |
| 9   | `emp_length_years`       | Số năm đi làm          | năm     |
| 10  | `active_bad_debts`       | Nợ xấu đang active     | count   |
| 11  | `bankruptcies`           | Số lần phá sản         | count   |
| 12  | `active_loans`           | Khoản vay đang mở      | count   |
| 13  | `total_loans_history`    | Tổng khoản vay từng có | count   |
| 14  | `home_ownership`         | Hình thức nhà ở        | string  |
| 15  | `loan_purpose`           | Mục đích vay           | string  |

## Cài đặt & Chạy

### Chạy local (development)

```bash
cd aiscore_service

# Cài dependencies
pip install -r requirements.txt

# Chạy server (model sẽ tự train nếu chưa có)
uvicorn app:app --host 0.0.0.0 --port 8001
# → http://localhost:8001
```

### Google Colab (train model)

1. Upload `train_model.py` + `lending_club_loan_two.csv` lên Google Drive
2. Mở `train_model.py` trên Colab → Run All
3. Download `models/` folder → copy vào `aiscore_service/models/`

### Docker

```bash
docker-compose up -d --build
# → http://localhost:8001
```

## API Endpoints

### `GET /api/health`

Health check & model status.

```json
{
  "status": "ok",
  "service": "aiscore-service-v4-hybrid-stacking",
  "model_loaded": true,
  "model_type": "Hybrid Stacking 2-Layer (5 Base OOF + RF Meta-Learner)",
  "n_features": 15,
  "n_meta_features": 20
}
```

### `POST /api/score`

Chấm điểm 1 người vay.

**Request:**

```json
{
  "credit_score": 580,
  "capital": 50000000,
  "monthly_income": 15000000,
  "monthly_pay": 2500000,
  "revolving_balance": 10000000,
  "dti": 22.0,
  "revolving_util_percent": 45.0,
  "term_months": 36,
  "emp_length_years": 3,
  "active_bad_debts": 0,
  "bankruptcies": 0,
  "active_loans": 2,
  "total_loans_history": 5,
  "home_ownership": "RENT",
  "loan_purpose": "debt_consolidation"
}
```

**Response:**

```json
{
  "ai_risk_score": 21,
  "default_probability": 0.2098,
  "status": "success"
}
```

### `POST /api/score/batch`

Chấm điểm hàng loạt (max 100).

```json
{
  "applicants": [
    { "credit_score": 700, "capital": 100000000, ... },
    { "credit_score": 400, "capital": 200000000, ... }
  ]
}
```

### `GET /api/model/info`

Xem metadata & metrics đầy đủ của model.

### `GET /api/exchange-rate`

Lấy tỷ giá USD→VNĐ hiện tại.

### `POST /api/model/retrain`

Retrain model (admin only).

## Risk Score Mapping

| AI Risk Score | Nhóm rủi ro    | Hành động         |
| ------------- | -------------- | ----------------- |
| 0 – 10        | **Rất thấp**   | Tự động duyệt     |
| 11 – 25       | **Thấp**       | Duyệt nhanh       |
| 26 – 40       | **Trung bình** | Review thủ công   |
| 41 – 60       | **Cao**        | Yêu cầu bảo đảm   |
| 61 – 100      | **Rất cao**    | Từ chối / thêm CT |

## Cấu trúc

```
aiscore_service/
├── app.py                       # FastAPI REST API (port 8001)
├── scorer.py                    # CreditScorer — inference (5 Base + RF Meta)
├── train_model.py               # MEGA pipeline — train + charts (Google Colab)
├── wsgi.py                      # WSGI/ASGI entry point
├── requirements.txt             # Python dependencies
├── Dockerfile                   # Docker build
├── docker-compose.yml           # Docker compose
├── AI_MODEL_DOCUMENTATION.md    # Tài liệu chi tiết mô hình
├── README.md                    # File này
├── models/                      # Model artifacts (auto-generated)
│   ├── xgb_pd_model.json       # XGBoost (Level 1)
│   ├── lgbm_pd_model.txt       # LightGBM (Level 1)
│   ├── cat_pd_model.joblib     # CatBoost (Level 1)
│   ├── et_pd_model.joblib      # ExtraTrees (Level 1)
│   ├── gb_pd_model.joblib      # GradientBoosting (Level 1)
│   ├── rf_meta_model.joblib    # Random Forest Meta (Level 2)
│   ├── per_feature_scalers.joblib  # 15 Per-Feature Scalers
│   └── metadata.json           # Metrics + config
└── docs/                        # Charts (20 biểu đồ)
```

## Tài liệu chi tiết

Xem [AI_MODEL_DOCUMENTATION.md](AI_MODEL_DOCUMENTATION.md) để biết thêm về:

- Tiền xử lý dữ liệu & Feature Engineering
- Hyperparameters từng model
- Kiến trúc OOF & Nested CV
- 20 biểu đồ đánh giá
- Tích hợp NestJS Backend
