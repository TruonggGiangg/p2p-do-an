# AIScore Service — Tài liệu mô hình AI chấm điểm tín dụng v8.0

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Dữ liệu đầu vào (Input Dataset)](#2-dữ-liệu-đầu-vào-input-dataset)
3. [Tiền xử lý dữ liệu (Preprocessing Pipeline)](#3-tiền-xử-lý-dữ-liệu-preprocessing-pipeline)
4. [Kỹ thuật Feature Engineering & Smart Scaling](#4-kỹ-thuật-feature-engineering--smart-scaling)
5. [Huấn luyện mô hình XGBoost + LR](#5-huấn-luyện-mô-hình-xgboost--lr)
6. [Output — JSON trả về](#6-output--json-trả-về)
7. [Đánh giá mô hình (Evaluation)](#7-đánh-giá-mô-hình-evaluation)
8. [Tích hợp hệ thống P2P Lending](#8-tích-hợp-hệ-thống-p2p-lending)
9. [API Endpoints](#9-api-endpoints)
10. [Kết luận](#10-kết-luận)

---

## 1. Tổng quan

| Thông tin          | Giá trị                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------- |
| **Tên service**    | AIScore Service v8.0                                                                    |
| **Mô hình**        | XGBoost + Logistic Regression — "Tiêu chuẩn vàng" ngành tài chính                       |
| **Framework API**  | FastAPI + Uvicorn                                                                       |
| **Ngôn ngữ**       | Python 3.11+                                                                            |
| **Port**           | 8001                                                                                    |
| **Mục đích**       | Dự đoán xác suất vỡ nợ (PD) cho người vay trong hệ thống P2P Lending                    |
| **Đơn vị tiền tệ** | VNĐ (quy đổi từ USD qua tỷ giá real-time)                                               |
| **Phương pháp**    | Stage 1: XGBoost → Leaf Indices → Stage 2: LR → PD (0.0-1.0) + ai_risk_score (0-100)    |
| **Số features**    | **25** (21 numeric + 4 categorical) — bao gồm 5 features nợ xấu/delinquency từ hệ thống |
| **Chuẩn hóa**      | Smart Per-Feature Scaling — 6 chiến lược khác nhau tùy phân phối từng feature           |
| **Dataset**        | Lending Club accepted_2007_to_2018Q4.csv (2.26M rows) + rejected (27.6M rows, EDA)      |

### Kiến trúc 2 Tầng

```
25 Features (VNĐ context)
    │
    ▼
┌─────────────────────────────────────────┐
│  Smart Per-Feature Scaling              │  6 strategies: log_standard, log_robust,
│  (21 NUM + 4 CAT passthrough)           │  robust, standard, minmax, passthrough
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  STAGE 1: XGBoost (GPU T4)             │  n_estimators=1500, max_depth=6
│  → Leaf Indices                         │  Output: (n_samples, n_trees) int
│  → OneHotEncode (sparse)               │  Output: (n_samples, ~N ngàn) sparse
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  [Leaf OHE] + [25 Original Features]   │  = Combined sparse input cho LR
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  STAGE 2: Logistic Regression           │  C=1.0, L2, balanced, SAGA solver
│  → PD (calibrated 0.0-1.0)             │  Tự nhiên calibrated (logistic func)
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  OUTPUT:                                │
│    ai_risk_score = round(PD × 100)      │  0 = safe, 100 = very risky
│    default_probability = PD             │  0.0 = không vỡ nợ, 1.0 = chắc chắn
└─────────────────────────────────────────┘
```

### Tại sao XGBoost + LR?

| Tiêu chí             | XGBoost alone                | XGBoost + LR (v8.0)                              |
| -------------------- | ---------------------------- | ------------------------------------------------ |
| **Calibration**      | Thường uncalibrated          | LR tự nhiên calibrated (logistic function)       |
| **Interpretability** | Black box feature importance | LR coefficients → hiểu rõ từng feature ảnh hưởng |
| **Regulatory**       | Khó giải trình               | Dễ giải trình: LR coefs chuẩn Basel II/III       |
| **Inference speed**  | Nhanh                        | Nhanh (1 XGBoost + 1 LR sparse multiply)         |
| **Non-linearity**    | Native                       | Leaf OHE captures non-linear interactions cho LR |

---

## 2. Dữ liệu đầu vào (Input Dataset)

### 2.1. Nguồn dữ liệu

| Thông tin        | Giá trị                                               |
| ---------------- | ----------------------------------------------------- |
| **Dataset**      | Lending Club Loan Data (2007-2018 Q4)                 |
| **File chính**   | `accepted_2007_to_2018Q4.csv`                         |
| **Tổng bản ghi** | **~2,260,000** khoản vay                              |
| **Số cột gốc**   | **151 cột** (dùng 25 cột cho training)                |
| **File phụ**     | `rejected_2007_to_2018Q4.csv` (27.6M rows — EDA only) |

### 2.2. Các cột sử dụng từ CSV (25 cột)

| #   | Tên cột LC                   | Mô tả                                 | → Feature v8.0             |
| --- | ---------------------------- | ------------------------------------- | -------------------------- |
| 1   | `sub_grade`                  | Hạng tín dụng chi tiết (A1→G5)        | `credit_score` (150-750)   |
| 2   | `loan_amnt`                  | Số tiền vay (USD)                     | `capital` (VNĐ)            |
| 3   | `annual_inc`                 | Thu nhập năm (USD)                    | `monthly_income` (VNĐ)     |
| 4   | `installment`                | Trả góp/tháng (USD)                   | `monthly_pay` (VNĐ)        |
| 5   | `revol_bal`                  | Dư nợ quay vòng (USD)                 | `revolving_balance` (VNĐ)  |
| 6   | `tot_cur_bal`                | **Tổng dư nợ tất cả TK (USD)**        | `total_current_balance`    |
| 7   | `dti`                        | Tỷ lệ Nợ/Thu nhập (%)                 | `dti`                      |
| 8   | `revol_util`                 | % sử dụng hạn mức                     | `revolving_util_percent`   |
| 9   | `emp_length`                 | Thời gian đi làm                      | `emp_length_years`         |
| 10  | `pub_rec`                    | Hồ sơ nợ xấu công                     | `active_bad_debts`         |
| 11  | `pub_rec_bankruptcies`       | Số lần phá sản                        | `bankruptcies`             |
| 12  | `open_acc`                   | Tài khoản đang mở                     | `active_loans`             |
| 13  | `total_acc`                  | Tổng tài khoản từng có                | `total_loans_history`      |
| 14  | `earliest_cr_line`           | Ngày mở TK đầu tiên                   | `credit_history_months`    |
| 15  | `inq_last_6mths`             | Truy vấn TD 6 tháng                   | `recent_inquiries`         |
| 16  | `delinq_2yrs`                | Trễ hạn 2 năm                         | `delinquencies_2yr`        |
| 17  | `acc_now_delinq`             | **TK đang quá hạn hiện tại**          | `accounts_delinquent`      |
| 18  | `num_tl_90g_dpd_24m`         | **TK 90+ ngày quá hạn / 24 tháng**    | `severe_delinquencies_24m` |
| 19  | `pct_tl_nvr_dlq`             | **% TK chưa từng quá hạn**            | `pct_never_delinquent`     |
| 20  | `collections_12_mths_ex_med` | **Thu hồi nợ 12 tháng**               | `collections_12m`          |
| 21  | `term`                       | Kỳ hạn vay                            | `term_enc`                 |
| 22  | `home_ownership`             | Hình thức nhà ở                       | `home_ownership_enc`       |
| 23  | `verification_status`        | Trạng thái xác minh                   | `verification_status_enc`  |
| 24  | `purpose`                    | Mục đích vay                          | `purpose_enc`              |
| 25  | `loan_status`                | **TARGET** (Fully Paid / Charged Off) | `is_default` (0/1)         |

> **Lưu ý**: `int_rate` (lãi suất) bị loại — lãi suất là **động**, do nhân viên duyệt quyết định, không có sẵn tại thời điểm scoring.

### 2.3. Phân phối Target

| Trạng thái                       | Tỷ lệ    |
| -------------------------------- | -------- |
| **Fully Paid** (không vỡ nợ = 0) | **~80%** |
| **Charged Off** (vỡ nợ = 1)      | **~20%** |

---

## 3. Tiền xử lý dữ liệu (Preprocessing Pipeline)

### 3.1. Lọc Target (Chống Data Leakage)

```python
df = df[df["loan_status"].isin(["Fully Paid", "Charged Off"])]
df["is_default"] = (df["loan_status"] == "Charged Off").astype(int)
```

### 3.2. Mapping sub_grade → credit_score (150–750)

| Grade | Sub-grades                             | Điểm tín dụng |
| ----- | -------------------------------------- | ------------- |
| **A** | A1=750, A2=732, A3=715, A4=697, A5=679 | 679 – 750     |
| **B** | B1=662, B2=644, B3=626, B4=609, B5=591 | 591 – 662     |
| **C** | C1=574, C2=556, C3=538, C4=521, C5=503 | 503 – 574     |
| **D** | D1=485, D2=468, D3=450, D4=432, D5=415 | 415 – 485     |
| **E** | E1=397, E2=379, E3=362, E4=344, E5=326 | 326 – 397     |
| **F** | F1=309, F2=291, F3=274, F4=256, F5=238 | 238 – 309     |
| **G** | G1=221, G2=203, G3=185, G4=168, G5=150 | 150 – 221     |

### 3.3. Quy đổi USD → VNĐ (Dynamic Exchange Rate)

Chuỗi ưu tiên: `USD_TO_VND` env → open.er-api.com → exchangerate-api.com → fallback 25,000

```
loan_amnt × VNĐ          →  capital
annual_inc / 12 × VNĐ    →  monthly_income
installment × VNĐ        →  monthly_pay
revol_bal × VNĐ          →  revolving_balance
tot_cur_bal × VNĐ        →  total_current_balance
```

### 3.4. Parse các cột phức tạp

| Cột gốc                          | Xử lý                              | Kết quả                   |
| -------------------------------- | ---------------------------------- | ------------------------- |
| `term` = " 36 months"            | Regex extract `(\d+)`              | `term_enc` = 36           |
| `emp_length` = "10+ years"       | Custom map (10+ → 10, < 1 → 0.5)   | `emp_length_years` = 10.0 |
| `home_ownership` = "RENT"        | Ordinal encode                     | `home_ownership_enc` = 0  |
| `purpose` = "debt_consolidation" | Ordinal encode                     | `purpose_enc` = 0         |
| `earliest_cr_line` = "Jan-2003"  | Months since ref date (2015-06-01) | `credit_history_months`   |

### 3.5. Xử lý Missing Values

| Feature                    | Phương pháp | Lý do                 |
| -------------------------- | ----------- | --------------------- |
| `emp_length_years`         | median      | Phân phối lệch phải   |
| `bankruptcies`             | 0           | Chưa phá sản = 0      |
| `revolving_util_percent`   | median      | Giữ phân phối gốc     |
| `active_bad_debts`         | 0           | Không có nợ xấu = 0   |
| `pct_never_delinquent`     | 100         | Mặc định chưa quá hạn |
| `accounts_delinquent`      | 0           | Không TK quá hạn = 0  |
| `severe_delinquencies_24m` | 0           | Không có = 0          |
| `collections_12m`          | 0           | Không thu hồi = 0     |
| `total_current_balance`    | 0           | Không có dữ liệu = 0  |

---

## 4. Kỹ thuật Feature Engineering & Smart Scaling

### 4.1. Bảng 25 Features cuối cùng

| #   | Tên Feature                   | Nguồn gốc                    | Mô tả                           | Đơn vị  | Scaling      |
| --- | ----------------------------- | ---------------------------- | ------------------------------- | ------- | ------------ |
| 1   | `credit_score`                | sub_grade → mapping          | Điểm tín dụng                   | 150–750 | standard     |
| 2   | `capital`                     | loan_amnt × VNĐ              | Số tiền vay                     | VNĐ     | log_standard |
| 3   | `monthly_income`              | annual_inc / 12 × VNĐ        | Lương tháng                     | VNĐ     | log_robust   |
| 4   | `monthly_pay`                 | installment × VNĐ            | Trả góp/tháng                   | VNĐ     | log_standard |
| 5   | `revolving_balance`           | revol_bal × VNĐ              | Dư nợ tín dụng quay vòng        | VNĐ     | log_standard |
| 6   | `total_current_balance` ⭐    | tot_cur_bal × VNĐ            | **Tổng dư nợ tất cả TK**        | VNĐ     | log_standard |
| 7   | `dti`                         | dti                          | Tỷ lệ Nợ/Thu nhập               | %       | robust       |
| 8   | `revolving_util_percent`      | revol_util                   | % sử dụng hạn mức               | %       | robust       |
| 9   | `emp_length_years`            | emp_length → parse           | Số năm đi làm                   | năm     | minmax       |
| 10  | `active_bad_debts`            | pub_rec                      | Nợ xấu đang active              | count   | robust       |
| 11  | `bankruptcies`                | pub_rec_bankruptcies         | Số lần phá sản                  | count   | robust       |
| 12  | `active_loans`                | open_acc                     | Khoản vay đang mở               | count   | standard     |
| 13  | `total_loans_history`         | total_acc                    | Tổng khoản vay từng có          | count   | standard     |
| 14  | `credit_history_months`       | earliest_cr_line             | Tuổi tín dụng                   | tháng   | standard     |
| 15  | `recent_inquiries`            | inq_last_6mths               | Truy vấn TD gần đây             | count   | robust       |
| 16  | `delinquencies_2yr`           | delinq_2yrs                  | Trễ hạn 2 năm                   | count   | robust       |
| 17  | `accounts_delinquent` ⭐      | acc_now_delinq               | **TK đang quá hạn hiện tại**    | count   | robust       |
| 18  | `severe_delinquencies_24m` ⭐ | num_tl_90g_dpd_24m           | **90+ ngày quá hạn / 24 tháng** | count   | robust       |
| 19  | `pct_never_delinquent` ⭐     | pct_tl_nvr_dlq               | **% TK chưa từng quá hạn**      | %       | standard     |
| 20  | `collections_12m` ⭐          | collections_12_mths_ex_med   | **Thu hồi nợ 12 tháng qua**     | count   | robust       |
| 21  | `loan_to_income`              | ENGINEERED                   | Tỷ lệ vay/thu nhập              | ratio   | log_robust   |
| 22  | `term_enc`                    | term → parse                 | Kỳ hạn vay                      | tháng   | passthrough  |
| 23  | `home_ownership_enc`          | home_ownership → encode      | Hình thức nhà ở                 | ordinal | passthrough  |
| 24  | `verification_status_enc`     | verification_status → encode | Mức xác minh                    | ordinal | passthrough  |
| 25  | `purpose_enc`                 | purpose → encode             | Mục đích vay                    | ordinal | passthrough  |

> ⭐ = **Features mới v8.0** — liên quan trực tiếp đến hệ thống quản lý nợ xấu / delinquency P2P

### 4.2. Smart Per-Feature Scaling — 6 Chiến lược

| Strategy       | Pipeline                   | Dùng cho                                  |
| -------------- | -------------------------- | ----------------------------------------- |
| `log_standard` | log1p(x) → StandardScaler  | Tiền VNĐ lệch phải (capital, monthly_pay) |
| `log_robust`   | log1p(x) → RobustScaler    | Tiền VNĐ có outliers (monthly_income)     |
| `robust`       | RobustScaler (median, IQR) | %, zero-inflated (dti, bankruptcies)      |
| `standard`     | StandardScaler (μ, σ)      | Phân phối gần normal (credit_score)       |
| `minmax`       | MinMaxScaler [0, 1]        | Range nhỏ, bounded (emp_length_years)     |
| `passthrough`  | Không transform            | Ordinal categorical (purpose_enc)         |

### 4.3. Encoding các biến phân loại

**Home Ownership:** RENT=0, OWN=1, MORTGAGE=2, OTHER/NONE/ANY=3
**Verification Status:** Not Verified=0, Source Verified=1, Verified=2
**Purpose:** debt_consolidation=0, credit_card=1, ..., educational=13
**Employment:** "< 1 year"=0.5, "1 year"=1.0, ..., "10+ years"=10.0

---

## 5. Huấn luyện mô hình XGBoost + LR

### 5.1. Stage 1 — XGBoost (Non-linear Feature Learner)

XGBoost học pattern phi tuyến từ 25 features. Sau train, trích xuất **leaf indices** — mỗi sample ánh xạ tới 1 leaf node trong mỗi tree → OneHotEncode thành sparse matrix.

| Parameter               | Giá trị | Lý do                               |
| ----------------------- | ------- | ----------------------------------- |
| `n_estimators`          | 1500    | Nhiều cây → leaf features đa dạng   |
| `max_depth`             | 6       | Đủ phức tạp nhưng không overfitting |
| `learning_rate`         | 0.01    | Học chậm, ổn định                   |
| `subsample`             | 0.8     | 80% samples mỗi tree                |
| `colsample_bytree`      | 0.7     | 70% features mỗi tree               |
| `min_child_weight`      | 10      | Tránh split quá nhỏ                 |
| `gamma`                 | 0.3     | Penalize phức tạp                   |
| `reg_alpha`             | 0.5     | L1 regularization                   |
| `reg_lambda`            | 2.0     | L2 regularization                   |
| `scale_pos_weight`      | auto    | Cân bằng class (neg/pos ≈ 4.1)      |
| `early_stopping_rounds` | 100     | Dừng nếu 100 rounds không cải thiện |
| `tree_method`           | hist    | GPU T4 accelerated                  |

### 5.2. Stage 2 — Logistic Regression (PD Generator)

LR nhận input `[Leaf OHE + 25 Original Features]` → PD calibrated.

| Parameter      | Giá trị  | Lý do                                       |
| -------------- | -------- | ------------------------------------------- |
| `C`            | 1.0      | Inverse regularization strength             |
| `penalty`      | l2       | L2 — giữ coefficients nhỏ, ổn định          |
| `class_weight` | balanced | Cân bằng cho imbalanced data (~20% default) |
| `max_iter`     | 300      | Đủ iterations cho sparse matrix lớn         |
| `solver`       | saga     | Tối ưu cho L2 + sparse + large dataset      |
| `tol`          | 1e-4     | Tolerance                                   |

### 5.3. Training Pipeline — 9 bước

```
[1/9]  Load & Clean Data (2.26M records → ~2M sau filter)
[2/9]  Train/Test Split (80/20, stratified)
[3/9]  Smart Per-Feature Scaling (6 strategies, 25 features)
[4/9]  Stage 1: Train XGBoost (1500 trees, GPU T4)
[5/9]  Extract Leaf Indices + OneHotEncode (sparse)
[6/9]  Stage 2: Train LR on [Leaf OHE + 25 Original]
[7/9]  Evaluate (12 metrics + 5-Fold CV + Classification Report)
[8/9]  Save Artifacts (5 files)
[9/9]  Export 20 Charts
```

### 5.4. Artifacts

| File                         | Mô tả                               |
| ---------------------------- | ----------------------------------- |
| `xgb_pd_model.json`          | XGBoost model (Stage 1)             |
| `lr_scorecard_model.joblib`  | Logistic Regression model (Stage 2) |
| `leaf_encoder.joblib`        | OneHotEncoder cho leaf indices      |
| `per_feature_scalers.joblib` | 25 (strategy, scaler) tuples        |
| `metadata.json`              | Metrics + config + feature mapping  |

---

## 6. Output — JSON trả về

### 6.1. API Request (Input từ NestJS)

```json
POST /api/score
Content-Type: application/json

{
    "credit_score": 580,
    "capital": 250000000,
    "monthly_income": 15000000,
    "monthly_pay": 7500000,
    "revolving_balance": 50000000,
    "total_current_balance": 80000000,
    "dti": 22.0,
    "revolving_util_percent": 45.0,
    "emp_length_years": 5,
    "active_bad_debts": 0,
    "bankruptcies": 0,
    "active_loans": 3,
    "total_loans_history": 8,
    "credit_history_months": 60,
    "recent_inquiries": 1,
    "delinquencies_2yr": 0,
    "accounts_delinquent": 0,
    "severe_delinquencies_24m": 0,
    "pct_never_delinquent": 100,
    "collections_12m": 0,
    "term": 36,
    "home_ownership": "RENT",
    "verification_status": "Verified",
    "purpose": "debt_consolidation"
}
```

> `loan_to_income` tự tính: `capital / (monthly_income × 12)`

### 6.2. API Response (Output)

```json
{
  "ai_risk_score": 21,
  "default_probability": 0.2098,
  "status": "success"
}
```

### 6.3. Giải thích các trường Output

| Trường                | Kiểu   | Phạm vi       | Mô tả                                                                       |
| --------------------- | ------ | ------------- | --------------------------------------------------------------------------- |
| `ai_risk_score`       | int    | **0 – 100**   | Điểm rủi ro. 0 = rủi ro thấp nhất, 100 = rủi ro cao nhất. `round(PD × 100)` |
| `default_probability` | float  | **0.0–1.0**   | Xác suất vỡ nợ (PD). 0.0 = không vỡ nợ, 1.0 = chắc chắn vỡ nợ               |
| `status`              | string | success/error | Trạng thái xử lý                                                            |

### 6.4. Luồng Inference

```python
# 1. Smart per-feature scaling
X = apply_per_feature_scalers(X_raw, scalers, FEATURE_NAMES)  # 25 features

# 2. Stage 1: XGBoost → Leaf Indices
leaves = xgb_model.apply(X)          # (1, n_trees)
L = leaf_encoder.transform(leaves)   # OneHot sparse

# 3. Stage 2: LR → PD
X_lr = hstack([L, X])                # Leaf OHE + 25 original
PD = lr_model.predict_proba(X_lr)[0, 1]

# 4. Output
ai_risk_score = round(PD × 100)      # 0-100
```

---

## 7. Đánh giá mô hình (Evaluation)

### 7.1. Metrics

| Metric                | Ý nghĩa                                |
| --------------------- | -------------------------------------- |
| **AUC-ROC**           | Khả năng phân biệt Paid vs Default     |
| **Accuracy**          | Tỷ lệ dự đoán đúng                     |
| **Balanced Accuracy** | Accuracy trung bình 2 class            |
| **Precision**         | Khi predict "vỡ nợ", bao nhiêu % đúng? |
| **Recall**            | Bắt được bao nhiêu % ca vỡ nợ thực?    |
| **F1-Score**          | Harmonic mean Precision & Recall       |
| **Brier Score**       | Calibration error (thấp hơn = tốt hơn) |
| **Log Loss**          | Cross-entropy loss                     |
| **MCC**               | Matthews Correlation Coefficient       |
| **Cohen's Kappa**     | Agreement beyond chance                |
| **KS Statistic**      | Maximum separation TPR - FPR           |

### 7.2. Optimal Threshold — Youden's J

$$J = TPR - FPR \qquad \text{Threshold}^* = \arg\max_t J(t)$$

### 7.3. 20 Biểu đồ đánh giá

| #   | Biểu đồ                          | File                            |
| --- | -------------------------------- | ------------------------------- |
| 0   | Accepted vs Rejected EDA         | `00_accepted_vs_rejected.png`   |
| 1   | ROC Curve (XGBoost vs LR)        | `01_roc_curve.png`              |
| 2   | Precision-Recall Curve           | `02_precision_recall_curve.png` |
| 3   | Confusion Matrix                 | `03_confusion_matrix.png`       |
| 4   | Feature Importance (XGBoost)     | `04_feature_importance_xgb.png` |
| 5   | PD Distribution                  | `05_pd_distribution.png`        |
| 6   | Calibration Curve                | `06_calibration_curve.png`      |
| 7   | CV AUC per Fold                  | `07_cv_auc_per_fold.png`        |
| 8   | Threshold Sensitivity            | `08_threshold_sensitivity.png`  |
| 9   | Score Distribution (analysis)    | `09_score_distribution.png`     |
| 10  | Model Comparison                 | `10_model_comparison.png`       |
| 11  | Gain & Lift Curve                | `11_gain_lift_curve.png`        |
| 12  | KS Statistic                     | `12_ks_statistic.png`           |
| 13  | Architecture Diagram             | `13_architecture.png`           |
| 14  | CV Fold Heatmap                  | `14_cv_fold_heatmap.png`        |
| 15  | Risk Band by Score (analysis)    | `15_risk_band_score.png`        |
| 16  | Feature Correlation (25×25)      | `16_feature_correlation.png`    |
| 17  | LR Feature Points                | `17_lr_feature_points.png`      |
| 18  | Score vs Default Rate (analysis) | `18_score_vs_default_rate.png`  |
| 19  | Error Analysis                   | `19_error_analysis.png`         |
| 20  | Summary Dashboard                | `20_summary_dashboard.png`      |

---

## 8. Tích hợp hệ thống P2P Lending

### 8.1. Mapping 25 Features → Hệ thống P2P

| #   | Feature v8.0                  | Hệ thống P2P (NestJS)                                            | Schema/Entity              |
| --- | ----------------------------- | ---------------------------------------------------------------- | -------------------------- |
| 1   | `credit_score`                | `CreditScore.score` (150-750)                                    | credit-score.schema.ts     |
| 2   | `capital`                     | `LoanApplication.capital` (VNĐ)                                  | loan-application.schema.ts |
| 3   | `monthly_income`              | User thu nhập tháng / KYC data                                   | user.schema.ts / kycData   |
| 4   | `monthly_pay`                 | `LoanApplication.monthlyPay` (VNĐ)                               | loan-application.schema.ts |
| 5   | `revolving_balance`           | Dư nợ quay vòng                                                  | loan outstanding           |
| 6   | `total_current_balance` ⭐    | `SUM(LoanApp.outstandingAmount)` WHERE disbursed                 | loan-application.schema.ts |
| 7   | `dti`                         | Tỷ lệ nợ/thu nhập                                                | computed                   |
| 8   | `revolving_util_percent`      | % sử dụng hạn mức tín dụng                                       | computed                   |
| 9   | `emp_length_years`            | KYC employment data                                              | user.schema.ts kycData     |
| 10  | `active_bad_debts`            | Count LoanDelinquency `status='overdue'`                         | loan-delinquency.schema.ts |
| 11  | `bankruptcies`                | Lịch sử phá sản                                                  | credit history             |
| 12  | `active_loans`                | Count khoản vay `status='disbursed'`                             | loan-application.schema.ts |
| 13  | `total_loans_history`         | `CreditScore.totalLoans`                                         | credit-score.schema.ts     |
| 14  | `credit_history_months`       | Tuổi TK từ `User.createdAt`                                      | user.schema.ts             |
| 15  | `recent_inquiries`            | Count đơn vay mới 90 ngày                                        | loan-application.schema.ts |
| 16  | `delinquencies_2yr`           | `CreditScore.latePayments`                                       | credit-score.schema.ts     |
| 17  | `accounts_delinquent` ⭐      | Count LoanDelinquency WHERE `debtGroup > 0`                      | loan-delinquency.schema.ts |
| 18  | `severe_delinquencies_24m` ⭐ | Count WHERE `delinquentDays >= 90` (nhóm nợ 3-5)                 | loan-delinquency.schema.ts |
| 19  | `pct_never_delinquent` ⭐     | % khoản vay chưa từng quá hạn                                    | computed from history      |
| 20  | `collections_12m` ⭐          | Count WHERE `collectionStage IN ('collection','legal')` 12 tháng | loan-delinquency.schema.ts |
| 21  | `loan_to_income`              | `capital / (monthly_income × 12)` — auto-computed                | —                          |
| 22  | `term_enc`                    | `LoanApplication.periodMonth`                                    | loan-application.schema.ts |
| 23  | `home_ownership_enc`          | KYC home ownership                                               | kycData                    |
| 24  | `verification_status_enc`     | `User.kycStatus` (NONE/PENDING/VERIFIED/REJECTED)                | user.schema.ts             |
| 25  | `purpose_enc`                 | Mục đích vay                                                     | loan-application.schema.ts |

### 8.2. Các tên alias (NestJS → AI Service)

Scorer hỗ trợ cả tên VNĐ context và tên gốc LC:

```
capital           / loanAmount / loan_amnt
monthly_income    / monthlyIncome / annual_inc (÷12)
monthly_pay       / monthlyPay / monthlyPayment
revolving_balance / revolvingBalance / totalOutstanding
total_current_balance / totalOutstandingAll / tot_cur_bal
accounts_delinquent   / currentDelinquentAccounts / acc_now_delinq
severe_delinquencies_24m / severeDelinquencies
pct_never_delinquent     / cleanLoanRatio / pct_tl_nvr_dlq
collections_12m          / collectionsLast12m
emp_length_years  / employmentYears / emp_length (string)
term              / periodMonth / term_months
credit_history_months / creditAge
delinquencies_2yr / latePayments / delinq_2yrs
```

### 8.3. Mapping Nhóm Nợ CIC → Features

Hệ thống P2P tracking `debtGroup` (1-5) theo chuẩn CIC:

| debtGroup | Mô tả              | delinquentDays | Feature mapping                 |
| --------- | ------------------ | -------------- | ------------------------------- |
| 1         | Nợ đủ tiêu chuẩn   | < 9 ngày       | `accounts_delinquent` += 0      |
| 2         | Nợ cần chú ý       | 10–89 ngày     | `accounts_delinquent` += 1      |
| 3         | Nợ dưới tiêu chuẩn | 90–180 ngày    | `severe_delinquencies_24m` += 1 |
| 4         | Nợ nghi ngờ        | 181–360 ngày   | `severe_delinquencies_24m` += 1 |
| 5         | Nợ có khả năng mất | > 360 ngày     | `severe_delinquencies_24m` += 1 |

Hệ thống `collectionStage` (`none` → `reminder` → `warning` → `collection` → `legal`):

| collectionStage | Feature mapping        |
| --------------- | ---------------------- |
| `collection`    | `collections_12m` += 1 |
| `legal`         | `collections_12m` += 1 |

---

## 9. API Endpoints

| Method | Endpoint             | Mô tả                              |
| ------ | -------------------- | ---------------------------------- |
| POST   | `/api/score`         | Score 1 borrower → PD + risk_score |
| POST   | `/api/score/batch`   | Score nhiều borrower (max 100)     |
| GET    | `/api/health`        | Health check + model info          |
| GET    | `/api/model/info`    | Full metadata & metrics            |
| GET    | `/api/exchange-rate` | Tỷ giá USD→VND hiện tại            |
| POST   | `/api/model/retrain` | Retrain model                      |

### Batch Response

```json
{
  "status": "success",
  "data": {
    "results": [
      {
        "ai_risk_score": 15,
        "default_probability": 0.15,
        "status": "success",
        "index": 0
      },
      {
        "ai_risk_score": 45,
        "default_probability": 0.45,
        "status": "success",
        "index": 1
      }
    ],
    "errors": [],
    "summary": {
      "total": 2,
      "scored": 2,
      "errors": 0,
      "avg_risk_score": 30.0,
      "avg_pd": 0.3
    }
  }
}
```

---

## 10. Kết luận

### v8.0 — Điểm nổi bật

| Cải tiến                      | Chi tiết                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **25 features (từ 15)**       | Thêm 5 features nợ xấu/delinquency + 5 features trước đó                                                              |
| **XGBoost + LR architecture** | Gold standard ngành ngân hàng — calibrated PD                                                                         |
| **Delinquency features**      | `accounts_delinquent`, `severe_delinquencies_24m`, `pct_never_delinquent`, `collections_12m`, `total_current_balance` |
| **Output đơn giản**           | Chỉ `ai_risk_score` (0-100) + `default_probability` (0.0-1.0)                                                         |
| **2.26M rows training**       | Lending Club 2007-2018 Q4 (151 cột, dùng 25)                                                                          |
| **Smart Per-Feature Scaling** | 6 chiến lược chuẩn hóa theo phân phối                                                                                 |
| **System mapping đầy đủ**     | Mapping trực tiếp LC → P2P schema (delinquency, credit score)                                                         |

### Bảng so sánh versions

| Tiêu chí         | v5.0 (cũ)                | v8.0 (hiện tại)                  |
| ---------------- | ------------------------ | -------------------------------- |
| **Features**     | 15 (11 NUM + 4 CAT)      | **25 (21 NUM + 4 CAT)**          |
| **Dataset**      | 396K rows                | **2.26M rows**                   |
| **Architecture** | XGBoost + LR Scorecard   | XGBoost + LR                     |
| **Output**       | credit_score + PD + risk | **PD + ai_risk_score only**      |
| **Delinquency**  | 2 features               | **7 features** (nợ xấu, nhóm nợ) |
| **Scaling**      | 6 strategies             | 6 strategies (same)              |
| **Artifacts**    | 5 files                  | 5 files (same)                   |
