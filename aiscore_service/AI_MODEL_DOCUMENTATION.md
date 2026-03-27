# AIScore Service — Tài liệu mô hình AI chấm điểm tín dụng

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Dữ liệu đầu vào (Input Dataset)](#2-dữ-liệu-đầu-vào-input-dataset)
3. [Tiền xử lý dữ liệu (Preprocessing Pipeline)](#3-tiền-xử-lý-dữ-liệu-preprocessing-pipeline)
4. [Kỹ thuật Feature Engineering](#4-kỹ-thuật-feature-engineering)
5. [Huấn luyện mô hình (Model Training)](#5-huấn-luyện-mô-hình-model-training)
6. [Output — JSON trả về](#6-output--json-trả-về)
7. [Đánh giá mô hình (Evaluation)](#7-đánh-giá-mô-hình-evaluation)
8. [Tích hợp hệ thống P2P Lending](#8-tích-hợp-hệ-thống-p2p-lending)
9. [API Endpoints](#9-api-endpoints)
10. [Kết luận](#10-kết-luận)

---

## 1. Tổng quan

| Thông tin          | Giá trị                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| **Tên service**    | AIScore Service v2.0                                                                          |
| **Mô hình**        | XGBoost Classifier (Probability of Default)                                                   |
| **Framework API**  | FastAPI + Uvicorn                                                                             |
| **Ngôn ngữ**       | Python 3.11                                                                                   |
| **Port**           | 8001                                                                                          |
| **Mục đích**       | Dự đoán xác suất vỡ nợ (PD — Probability of Default) cho người vay trong hệ thống P2P Lending |
| **Đơn vị tiền tệ** | VNĐ (quy đổi từ USD qua tỷ giá real-time)                                                     |

### Luồng hoạt động tổng quát

```
Lending Club CSV (USD)
    │
    ▼
┌─────────────────────────────┐
│  1. Load & Clean Data       │  396,030 records
│  2. Filter target           │  Fully Paid (0) / Charged Off (1)
│  3. Scale USD → VNĐ         │  Tỷ giá live: 26,251 VNĐ/USD
│  4. Feature Engineering     │  27 cột gốc → 16 features
│  5. StandardScaler          │  Chuẩn hóa phân phối
│  6. Train XGBoost           │  StratifiedKFold + Early Stopping
│  7. Save Artifacts          │  model.json + scaler.joblib + metadata.json
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│  FastAPI REST Service       │
│  POST /api/score            │
│                             │
│  Input: 16 features (VNĐ)  │──→  Output: { ai_risk_score, default_probability }
│  từ NestJS Backend          │
└─────────────────────────────┘
```

---

## 2. Dữ liệu đầu vào (Input Dataset)

### 2.1. Nguồn dữ liệu

- **Dataset**: Lending Club Loan Data
- **File**: `lending_club_loan_two.csv`
- **Tổng số bản ghi**: **396,030** khoản vay
- **Số cột gốc**: **27 cột**

### 2.2. Các cột gốc trong CSV

| #   | Tên cột                | Mô tả                               | Kiểu dữ liệu | Ví dụ                    |
| --- | ---------------------- | ----------------------------------- | ------------ | ------------------------ |
| 1   | `loan_amnt`            | Số tiền vay (USD)                   | float        | 10,000                   |
| 2   | `term`                 | Kỳ hạn vay                          | string       | " 36 months"             |
| 3   | `int_rate`             | Lãi suất (%)                        | float        | 13.56                    |
| 4   | `installment`          | Trả góp hàng tháng (USD)            | float        | 339.31                   |
| 5   | `grade`                | Hạng tín dụng                       | string       | A, B, C, … G             |
| 6   | `sub_grade`            | Hạng tín dụng chi tiết              | string       | A1, A2, … G5             |
| 7   | `emp_title`            | Chức danh công việc                 | string       | "Teacher"                |
| 8   | `emp_length`           | Thời gian đi làm                    | string       | "10+ years"              |
| 9   | `home_ownership`       | Hình thức nhà ở                     | string       | RENT, OWN, MORTGAGE      |
| 10  | `annual_inc`           | Thu nhập hàng năm (USD)             | float        | 74,203.18                |
| 11  | `verification_status`  | Trạng thái xác minh                 | string       | Verified                 |
| 12  | `issue_d`              | Ngày phát hành khoản vay            | string       | Dec-2011                 |
| 13  | `loan_status`          | **Trạng thái khoản vay (TARGET)**   | string       | Fully Paid / Charged Off |
| 14  | `purpose`              | Mục đích vay                        | string       | debt_consolidation       |
| 15  | `title`                | Tiêu đề khoản vay                   | string       | "Debt consolidation"     |
| 16  | `dti`                  | Tỷ lệ Nợ/Thu nhập (%)               | float        | 22.00                    |
| 17  | `earliest_cr_line`     | Ngày mở tài khoản tín dụng đầu tiên | string       | Jan-2003                 |
| 18  | `open_acc`             | Số tài khoản tín dụng đang mở       | float        | 12                       |
| 19  | `pub_rec`              | Số hồ sơ tiêu cực (nợ xấu)          | float        | 0                        |
| 20  | `revol_bal`            | Dư nợ tín dụng quay vòng (USD)      | float        | 18,000                   |
| 21  | `revol_util`           | % sử dụng hạn mức tín dụng          | float        | 65.0                     |
| 22  | `total_acc`            | Tổng số tài khoản tín dụng          | float        | 25                       |
| 23  | `initial_list_status`  | Trạng thái niêm yết ban đầu         | string       | f / w                    |
| 24  | `application_type`     | Loại đơn (cá nhân/đồng)             | string       | Individual / Joint       |
| 25  | `mort_acc`             | Số tài khoản thế chấp               | float        | 2                        |
| 26  | `pub_rec_bankruptcies` | Số lần phá sản                      | float        | 0                        |
| 27  | `address`              | Địa chỉ (bang)                      | string       | "CA"                     |

### 2.3. Thống kê mô tả dữ liệu gốc (USD)

| Feature    | Mean    | Std     | Min   | 25%     | 50%     | 75%     | Max        |
| ---------- | ------- | ------- | ----- | ------- | ------- | ------- | ---------- |
| loan_amnt  | $14,114 | $8,357  | $500  | $8,000  | $12,000 | $20,000 | $40,000    |
| annual_inc | $74,203 | $61,638 | $0    | $45,000 | $64,000 | $90,000 | $8,706,582 |
| int_rate   | 13.64%  | 4.7%    | 5.32% | 10.0%   | 13.0%   | 16.3%   | 30.99%     |
| dti        | 17.4%   | 17.8%   | 0%    | 11.3%   | 17.0%   | 23.6%   | 999%       |

### 2.4. Phân phối Target

| Trạng thái                       | Số lượng | Tỷ lệ      |
| -------------------------------- | -------- | ---------- |
| **Fully Paid** (không vỡ nợ = 0) | 318,357  | **80.39%** |
| **Charged Off** (vỡ nợ = 1)      | 77,673   | **19.61%** |

> **Nhận xét**: Dataset imbalanced — tỷ lệ vỡ nợ ~20%. Đây là tỷ lệ tương đối hợp lý cho bài toán credit scoring.

---

## 3. Tiền xử lý dữ liệu (Preprocessing Pipeline)

### 3.1. Lọc Target (Chống Data Leakage)

```python
# CHỈ giữ 2 trạng thái rõ ràng, loại bỏ "Current", "Late", "Grace Period"...
# vì các trạng thái này chưa có kết quả cuối cùng → gây data leakage
df = df[df["loan_status"].isin(["Fully Paid", "Charged Off"])]
df["is_default"] = (df["loan_status"] == "Charged Off").astype(int)
```

**Lý do**: Chỉ dùng khoản vay đã hoàn thành để tránh sai lệch. Khoản vay đang trả ("Current") không thể biết kết quả cuối cùng.

### 3.2. Mapping sub_grade → credit_score (150–750)

Hệ thống NestJS sử dụng thang điểm tín dụng 150–750 (mô phỏng FICO). Lending Club dùng sub_grade (A1→G5), ta mapping tuyến tính:

```
A1 = 750 (tốt nhất)    →    G5 = 150 (xấu nhất)
```

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

Model được train trên dữ liệu VNĐ để phù hợp với hệ thống P2P Lending Việt Nam.

**Chuỗi ưu tiên lấy tỷ giá:**

1. **Biến môi trường** `USD_TO_VND` (override cứng)
2. **open.er-api.com** (API miễn phí, real-time)
3. **exchangerate-api.com** (backup)
4. **Fallback**: 25,000 VNĐ/USD

**Tỷ giá hiện tại**: 1 USD = **26,251 VNĐ** (từ open.er-api.com)

```
loan_amnt × 26,251     →  capital (VNĐ)
annual_inc / 12 × 26,251  →  monthly_income (VNĐ)
installment × 26,251    →  monthly_pay (VNĐ)
revol_bal × 26,251      →  revolving_balance (VNĐ)
```

### 3.4. Parse các cột phức tạp

| Cột gốc                          | Xử lý                              | Kết quả                   |
| -------------------------------- | ---------------------------------- | ------------------------- |
| `term` = " 36 months"            | Regex extract `(\d+)`              | `term_months` = 36        |
| `emp_length` = "10+ years"       | Custom parse (10+ → 10, < 1 → 0.5) | `emp_length_years` = 10.0 |
| `home_ownership` = "RENT"        | Ordinal encode                     | `home_ownership_enc` = 0  |
| `purpose` = "debt_consolidation" | Ordinal encode                     | `purpose_enc` = 0         |

### 3.5. Xử lý Missing Values

| Feature                  | Phương pháp | Lý do               |
| ------------------------ | ----------- | ------------------- |
| `emp_length_years`       | median      | Phân phối lệch phải |
| `bankruptcies`           | 0           | Chưa phá sản = 0    |
| `revolving_util_percent` | median      | Giữ phân phối gốc   |
| `active_bad_debts`       | 0           | Không có nợ xấu = 0 |

### 3.6. Clip Outliers

```python
dti                    → clip [0, 100]
active_loans           → clip [0, 50]
revolving_util_percent → clip [0, 150]
monthly_income         → clip tại percentile 99
```

---

## 4. Kỹ thuật Feature Engineering

### 4.1. Bảng 16 Features cuối cùng

| #   | Tên Feature              | Nguồn gốc                  | Mô tả                  | Đơn vị  | Feature Importance  |
| --- | ------------------------ | -------------------------- | ---------------------- | ------- | ------------------- |
| 1   | `credit_score`           | sub_grade → mapping        | Điểm tín dụng          | 150–750 | **0.3964 (39.64%)** |
| 2   | `capital`                | loan_amnt × VNĐ rate       | Số tiền vay            | VNĐ     | 0.0257 (2.57%)      |
| 3   | `monthly_income`         | annual_inc / 12 × VNĐ rate | Lương tháng            | VNĐ     | 0.0453 (4.53%)      |
| 4   | `monthly_pay`            | installment × VNĐ rate     | Trả góp/tháng          | VNĐ     | 0.0220 (2.20%)      |
| 5   | `revolving_balance`      | revol_bal × VNĐ rate       | Dư nợ tín dụng         | VNĐ     | 0.0184 (1.84%)      |
| 6   | `interest_rate`          | int_rate                   | Lãi suất               | %       | 0.0750 (7.50%)      |
| 7   | `dti`                    | dti                        | Tỷ lệ Nợ/Thu nhập      | %       | 0.0660 (6.60%)      |
| 8   | `revolving_util_percent` | revol_util                 | % sử dụng hạn mức      | %       | 0.0180 (1.80%)      |
| 9   | `term_months`            | term → parse               | Kỳ hạn vay             | tháng   | **0.1528 (15.28%)** |
| 10  | `emp_length_years`       | emp_length → parse         | Số năm đi làm          | năm     | 0.0204 (2.04%)      |
| 11  | `active_bad_debts`       | pub_rec                    | Nợ xấu đang active     | count   | 0.0166 (1.66%)      |
| 12  | `bankruptcies`           | pub_rec_bankruptcies       | Số lần phá sản         | count   | 0.0153 (1.53%)      |
| 13  | `active_loans`           | open_acc                   | Khoản vay đang mở      | count   | 0.0186 (1.86%)      |
| 14  | `total_loans_history`    | total_acc                  | Tổng khoản vay từng có | count   | 0.0156 (1.56%)      |
| 15  | `home_ownership_enc`     | home_ownership → encode    | Hình thức nhà ở        | ordinal | **0.0771 (7.71%)**  |
| 16  | `purpose_enc`            | purpose → encode           | Mục đích vay           | ordinal | 0.0167 (1.67%)      |

### 4.2. Feature Importance Ranking (Xếp hạng tầm quan trọng)

```
  1. credit_score             : 0.3964 ███████████████████████
  2. term_months              : 0.1528 █████████
  3. home_ownership_enc       : 0.0771 ████
  4. interest_rate            : 0.0750 ████
  5. dti                      : 0.0660 ███
  6. monthly_income           : 0.0453 ██
  7. capital                  : 0.0257 █
  8. monthly_pay              : 0.0220 █
  9. emp_length_years         : 0.0204 █
 10. active_loans             : 0.0186 █
 11. revolving_balance        : 0.0184 █
 12. revolving_util_percent   : 0.0180 █
 13. purpose_enc              : 0.0167 █
 14. active_bad_debts         : 0.0166
 15. total_loans_history      : 0.0156
 16. bankruptcies             : 0.0153
```

> **Nhận xét**: `credit_score` chiếm ~40% tầm quan trọng — phù hợp vì đây là thước đo tổng hợp từ Lending Club đánh giá ban đầu. `term_months` đứng thứ 2 (~15%) cho thấy kỳ hạn dài có rủi ro cao hơn.

### 4.3. Encoding các biến phân loại

**Home Ownership:**

| Giá trị            | Mã hóa | Ý nghĩa      |
| ------------------ | ------ | ------------ |
| RENT               | 0      | Thuê nhà     |
| OWN                | 1      | Sở hữu nhà   |
| MORTGAGE           | 2      | Thế chấp nhà |
| OTHER / NONE / ANY | 3      | Khác         |

**Loan Purpose:**

| Giá trị            | Mã hóa | Ý nghĩa             |
| ------------------ | ------ | ------------------- |
| debt_consolidation | 0      | Tổng hợp nợ         |
| credit_card        | 1      | Trả nợ thẻ tín dụng |
| home_improvement   | 2      | Cải tạo nhà         |
| other              | 3      | Khác                |
| major_purchase     | 4      | Mua sắm lớn         |
| medical            | 5      | Y tế                |
| small_business     | 6      | Kinh doanh nhỏ      |
| car                | 7      | Mua xe              |
| vacation           | 8      | Du lịch             |
| moving             | 9      | Chuyển nhà          |
| house              | 10     | Mua nhà             |
| wedding            | 11     | Đám cưới            |
| renewable_energy   | 12     | Năng lượng tái tạo  |
| educational        | 13     | Giáo dục            |

### 4.4. StandardScaler

Tất cả 16 features được chuẩn hóa bằng `sklearn.preprocessing.StandardScaler` (z-score normalization):

$$z = \frac{x - \mu}{\sigma}$$

Scaler được lưu tại `models/scaler.joblib` và tái sử dụng khi predict.

---

## 5. Huấn luyện mô hình (Model Training)

### 5.1. Thuật toán: XGBoost Classifier

XGBoost (eXtreme Gradient Boosting) — thuật toán ensemble learning dựa trên Gradient Boosted Decision Trees. Phù hợp cho bài toán binary classification với:

- Dữ liệu tabular
- Mix numeric + categorical features
- Imbalanced classes
- Cần calibrated probabilities (PD)

### 5.2. Hyperparameters

| Parameter               | Giá trị | Lý do                                          |
| ----------------------- | ------- | ---------------------------------------------- |
| `n_estimators`          | 500     | Đủ lớn để early stopping hiệu quả              |
| `max_depth`             | 4       | Tránh overfitting, cây nông hơn generalize tốt |
| `learning_rate`         | 0.05    | Học chậm, ổn định hơn                          |
| `subsample`             | 0.8     | Random 80% samples mỗi tree (giảm variance)    |
| `colsample_bytree`      | 0.8     | Random 80% features mỗi tree                   |
| `min_child_weight`      | 10      | Tránh split quá nhỏ (chống overfitting)        |
| `gamma`                 | 0.3     | Penalize thêm độ phức tạp tree                 |
| `reg_alpha` (L1)        | 1.0     | L1 regularization                              |
| `reg_lambda` (L2)       | 3.0     | L2 regularization mạnh                         |
| `early_stopping_rounds` | 50      | Dừng nếu 50 rounds không cải thiện             |
| `eval_metric`           | auc     | Tối ưu AUC-ROC                                 |
| `tree_method`           | hist    | Histogram-based (nhanh hơn cho dữ liệu lớn)    |

### 5.3. Train/Test Split

| Set       | Số mẫu        | Tỷ lệ default |
| --------- | ------------- | ------------- |
| **Train** | 316,824 (80%) | 19.61%        |
| **Test**  | 79,206 (20%)  | 19.61%        |

> Split sử dụng `stratify=y` để đảm bảo tỷ lệ default giống nhau giữa train và test.

### 5.4. Cross-Validation

- **Phương pháp**: 5-Fold Stratified Cross-Validation
- **Scoring**: AUC-ROC
- **Kết quả**: **CV AUC = 0.7225 ± 0.0022**

> Độ lệch chuẩn rất nhỏ (0.0022) cho thấy model ổn định qua các folds.

### 5.5. Training Results

```
Best iteration: 499
Best AUC on eval set: 0.7217
```

### 5.6. Artifacts được lưu

| File                | Đường dẫn                  | Mô tả                             |
| ------------------- | -------------------------- | --------------------------------- |
| `xgb_pd_model.json` | `models/xgb_pd_model.json` | XGBoost model (JSON format)       |
| `scaler.joblib`     | `models/scaler.joblib`     | StandardScaler (pickle)           |
| `metadata.json`     | `models/metadata.json`     | Metrics + feature info + mappings |

---

## 6. Output — JSON trả về

### 6.1. API Request (Input từ NestJS)

```json
POST /api/score
Content-Type: application/json

{
    "credit_score": 580,
    "capital": 50000000,
    "monthly_income": 15000000,
    "monthly_pay": 2500000,
    "revolving_balance": 10000000,
    "interest_rate": 18.5,
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

### 6.2. API Response (Output)

```json
{
  "ai_risk_score": 21,
  "default_probability": 0.2098,
  "status": "success"
}
```

### 6.3. Giải thích các trường Output

| Trường                | Kiểu   | Phạm vi             | Mô tả                                                                                                      |
| --------------------- | ------ | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ai_risk_score`       | int    | **0 – 100**         | Điểm rủi ro AI. 0 = rủi ro thấp nhất, 100 = rủi ro cao nhất. Tính bằng: `round(default_probability × 100)` |
| `default_probability` | float  | **0.0 – 1.0**       | Xác suất vỡ nợ (PD). 0.0 = không có khả năng vỡ nợ, 1.0 = chắc chắn vỡ nợ                                  |
| `status`              | string | "success" / "error" | Trạng thái xử lý                                                                                           |

### 6.4. Ví dụ kết quả thực tế

| Scenario                         | credit_score | capital (VNĐ) | monthly_income (VNĐ) | PD     | AI Risk Score |
| -------------------------------- | ------------ | ------------- | -------------------- | ------ | ------------- |
| **Khách tốt** — Lương cao, ít nợ | 680          | 262.5M        | 262.5M               | 0.0311 | **3/100**     |
| **Khách trung bình** — Lương TB  | 480          | 525M          | 120.4M               | 0.1997 | **20/100**    |
| **Khách xấu** — Nợ nhiều         | 280          | 918.8M        | 65.6M                | 0.6835 | **68/100**    |
| **Khách VN thực tế** — Vay 50M   | 550          | 50M           | 15M                  | 0.2098 | **21/100**    |

### 6.5. Batch Scoring

```json
POST /api/score/batch
{
    "applicants": [
        { "credit_score": 700, "capital": 100000000, ... },
        { "credit_score": 400, "capital": 200000000, ... },
        { "credit_score": 250, "capital": 500000000, ... }
    ]
}
```

Response:

```json
{
  "status": "success",
  "data": {
    "results": [
      {
        "ai_risk_score": 18,
        "default_probability": 0.1812,
        "status": "success",
        "index": 0
      },
      {
        "ai_risk_score": 61,
        "default_probability": 0.6078,
        "status": "success",
        "index": 1
      },
      {
        "ai_risk_score": 77,
        "default_probability": 0.7793,
        "status": "success",
        "index": 2
      }
    ],
    "errors": [],
    "summary": {
      "total": 3,
      "scored": 3,
      "errors": 0,
      "avg_risk_score": 52.0,
      "avg_pd": 0.5228,
      "min_risk_score": 18,
      "max_risk_score": 77
    }
  }
}
```

---

## 7. Đánh giá mô hình (Evaluation)

### 7.1. Bảng tổng hợp Metrics

| Metric          | Giá trị             | Ý nghĩa                                             |
| --------------- | ------------------- | --------------------------------------------------- |
| **Accuracy**    | **0.8075 (80.75%)** | Tỷ lệ dự đoán đúng tổng thể                         |
| **Precision**   | **0.5688 (56.88%)** | Khi model dự đoán "vỡ nợ", 56.88% là đúng           |
| **Recall**      | **0.0772 (7.72%)**  | Trong tất cả ca vỡ nợ thực tế, model bắt được 7.72% |
| **F1-Score**    | **0.1359 (13.59%)** | Harmonic mean của Precision & Recall                |
| **AUC-ROC**     | **0.7217 (72.17%)** | Khả năng phân biệt giữa Paid và Default             |
| **Brier Score** | **0.1411**          | Calibration error (càng thấp càng tốt)              |
| **Log Loss**    | **0.4440**          | Cross-entropy loss                                  |
| **CV AUC**      | **0.7225 ± 0.0022** | Cross-validated AUC (5-fold)                        |

### 7.2. Confusion Matrix

```
                   Predicted Paid    Predicted Default
Actual Paid           62,762              909
Actual Default        14,336            1,199
```

| Metric               | Giá trị                             |
| -------------------- | ----------------------------------- |
| True Negatives (TN)  | 62,762 — Paid đúng                  |
| False Positives (FP) | 909 — Paid nhưng dự đoán Default    |
| False Negatives (FN) | 14,336 — Default nhưng dự đoán Paid |
| True Positives (TP)  | 1,199 — Default đúng                |

### 7.3. Classification Report

```
              precision    recall  f1-score   support

   Paid (0)       0.81      0.99      0.89     63,671
Default (1)       0.57      0.08      0.14     15,535

   accuracy                           0.81     79,206
  macro avg       0.69      0.53      0.51     79,206
weighted avg      0.77      0.81      0.74     79,206
```

### 7.4. Phân phối PD trên tập test

| Percentile       | PD Value   | Ý nghĩa               |
| ---------------- | ---------- | --------------------- |
| P10              | 0.0609     | 10% mẫu có PD < 6.1%  |
| P25              | 0.0995     | 25% mẫu có PD < 10.0% |
| **P50 (Median)** | **0.1661** | Trung vị PD = 16.6%   |
| P75              | 0.2663     | 75% mẫu có PD < 26.6% |
| P90              | 0.3799     | 90% mẫu có PD < 38.0% |
| P95              | 0.4489     | 95% mẫu có PD < 44.9% |
| P99              | 0.5649     | 99% mẫu có PD < 56.5% |
| **Mean**         | **0.1960** | PD trung bình = 19.6% |

### 7.5. Phân tích & Nhận xét

#### Điểm mạnh

- **AUC-ROC = 0.7217**: Khả năng phân biệt "khá" (> 0.7 threshold). Model có khả năng ranking người vay theo mức rủi ro.
- **CV AUC ổn định (0.7225 ± 0.0022)**: Rất ít biến động qua các folds → không overfitting.
- **Brier Score = 0.1411**: Calibration tốt — PD output gần xác suất thực tế.
- **Accuracy = 80.75%**: Dự đoán đúng hơn 4/5 trường hợp.

#### Điểm cần lưu ý

- **Recall thấp (7.72%)**: Model bảo thủ — bỏ sót nhiều ca vỡ nợ. Với threshold mặc định 0.5, hầu hết các khoản vay được phân loại là "Paid".
- **Lý do**: Tỷ lệ default chỉ ~20% → XGBoost ưu tiên tối đa AUC bằng cách ranking tốt, không phải bằng cách chọn threshold tốt nhất cho F1.

#### Cách sử dụng đúng

> **Model này KHÔNG dùng để phân loại nhị phân (Approve/Reject).** Model dùng `default_probability` (PD) làm metric liên tục để:
>
> 1. **Ranking**: Xếp hạng người vay từ an toàn → rủi ro
> 2. **Scoring**: Chuyển PD thành `ai_risk_score` (0-100)
> 3. **Quyết định**: NestJS backend tự set threshold phù hợp (VD: reject nếu PD > 0.6)

---

## 8. Tích hợp hệ thống P2P Lending

### 8.1. Kiến trúc tích hợp

```
┌─────────────┐     ┌────────────────┐     ┌─────────────────┐
│  React Native│────→│  NestJS Backend│────→│  AIScore Service│
│  (Client)    │     │  (server_do_an)│     │  (FastAPI:8001) │
└─────────────┘     └────────────────┘     └─────────────────┘
                           │
                    POST /api/score
                    (16 features, VNĐ)
                           │
                    ◄── { ai_risk_score, default_probability }
```

### 8.2. Luồng xử lý trong NestJS

```typescript
// server_do_an_new/src/modules/loan/loan.service.ts
// Khi user tạo khoản vay:

1. Validate input → Kiểm tra delinquency policy
2. Gọi AIScore Service:
   POST http://localhost:8001/api/score
   Body: { credit_score, capital, monthly_income, ... }
3. Nhận response: { ai_risk_score, default_probability }
4. Nếu decision = REJECT → BadRequestException
5. Nếu APPROVE → Tạo đơn vay trên Fineract
6. Cập nhật user.creditProfile
```

### 8.3. Configuration (NestJS)

```typescript
// server_do_an_new/src/config/configuration.ts
aiscore: {
    serviceUrl: process.env.AISCORE_SERVICE_URL || 'http://localhost:8001',
    timeout: parseInt(process.env.AISCORE_TIMEOUT || '15000', 10),
    enabled: process.env.AISCORE_ENABLED === 'true',
}
```

**Lưu ý**: AIScore hiện đang **tắt** (AISCORE_ENABLED=false). Set `AISCORE_ENABLED=true` trong `.env` để bật.

---

## 9. API Endpoints

### 9.1. Danh sách Endpoints

| Method | Path                 | Mô tả                                  |
| ------ | -------------------- | -------------------------------------- |
| `POST` | `/api/score`         | Chấm điểm 1 người vay                  |
| `POST` | `/api/score/batch`   | Chấm điểm nhiều người vay (tối đa 100) |
| `GET`  | `/api/health`        | Health check + model status            |
| `GET`  | `/api/model/info`    | Metadata & metrics đầy đủ              |
| `GET`  | `/api/exchange-rate` | Tỷ giá USD→VNĐ hiện tại                |
| `POST` | `/api/model/retrain` | Retrain model (cần restart)            |

### 9.2. Health Check Response

```json
GET /api/health
{
    "status": "ok",
    "service": "aiscore-service-v2",
    "model_loaded": true,
    "model_type": "XGBoost PD — VNĐ Context",
    "auc_roc": 0.7217,
    "exchange_rate": {
        "rate": 26251.28,
        "source": "open.er-api.com"
    }
}
```

---

## 10. Kết luận

### 10.1. Tóm tắt

| Hạng mục                   | Chi tiết                                               |
| -------------------------- | ------------------------------------------------------ |
| **Mô hình**                | XGBoost Classifier                                     |
| **Dữ liệu**                | 396,030 khoản vay từ Lending Club                      |
| **Features**               | 16 features (4 VNĐ, 6 numeric, 4 count, 2 categorical) |
| **Mục tiêu**               | Xác suất vỡ nợ (PD)                                    |
| **Độ chính xác (AUC-ROC)** | **72.17%**                                             |
| **Cross-Validation**       | **72.25% ± 0.22%**                                     |
| **Accuracy**               | **80.75%**                                             |
| **Ứng dụng**               | Ranking rủi ro, scoring, hỗ trợ quyết định cho vay     |

### 10.2. Khuyến nghị cải thiện trong tương lai

1. **Thêm dữ liệu Việt Nam thực tế** — Khi tích lũy đủ data từ hệ thống P2P, retrain model trên dữ liệu thực.
2. **Tuning threshold** — Dựa trên business requirement, chọn PD threshold phù hợp (VD: reject khi PD > 0.4).
3. **SHAP explanations** — Thêm giải thích cho từng quyết định (feature contribution).
4. **Thêm features** — Từ eKYC, lịch sử giao dịch ví, social score.
5. **A/B Testing** — So sánh model AI vs. rule-based scoring.

---

_Tài liệu được tạo tự động từ quá trình huấn luyện mô hình AIScore Service v2.0_
_Ngày cập nhật: 27/03/2026_
