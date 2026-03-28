# AIScore Service — Tài liệu mô hình AI chấm điểm tín dụng

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Dữ liệu đầu vào (Input Dataset)](#2-dữ-liệu-đầu-vào-input-dataset)
3. [Tiền xử lý dữ liệu (Preprocessing Pipeline)](#3-tiền-xử-lý-dữ-liệu-preprocessing-pipeline)
4. [Kỹ thuật Feature Engineering](#4-kỹ-thuật-feature-engineering)
5. [Huấn luyện mô hình Hybrid Stacking (Model Training)](#5-huấn-luyện-mô-hình-hybrid-stacking-model-training)
6. [Output — JSON trả về](#6-output--json-trả-về)
7. [Đánh giá mô hình (Evaluation)](#7-đánh-giá-mô-hình-evaluation)
8. [Tích hợp hệ thống P2P Lending](#8-tích-hợp-hệ-thống-p2p-lending)
9. [API Endpoints](#9-api-endpoints)
10. [Kết luận](#10-kết-luận)

---

## 1. Tổng quan

| Thông tin          | Giá trị                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| **Tên service**    | AIScore Service v4.0                                                                          |
| **Mô hình**        | Hybrid Stacking 2 tầng — 5 Base Learners (OOF) + LogisticRegression Meta-Learner              |
| **Framework API**  | FastAPI + Uvicorn                                                                             |
| **Ngôn ngữ**       | Python 3.11+                                                                                  |
| **Port**           | 8001                                                                                          |
| **Mục đích**       | Dự đoán xác suất vỡ nợ (PD — Probability of Default) cho người vay trong hệ thống P2P Lending |
| **Đơn vị tiền tệ** | VNĐ (quy đổi từ USD qua tỷ giá real-time)                                                     |
| **Phương pháp**    | Hybrid Stacking: Level 1 (5 OOF) → Level 2 (LR Meta-Learner)                                  |
| **Chuẩn hóa**      | Per-Feature Scaling — 15 StandardScaler riêng biệt, mỗi feature 1 scaler                      |

### Kiến trúc Hybrid Stacking 2 Tầng

```
                    ┌──────────────────────────┐
                    │  Input: 15 Features (VNĐ) │
                    │  Per-Feature Scaling       │
                    │  (15 StandardScaler riêng) │
                    └────────────┬───────────────┘
                                 │
         ┌───────────┬───────────┼───────────┬───────────┐
         ▼           ▼           ▼           ▼           ▼
  ┌────────────┐┌────────────┐┌────────────┐┌────────────┐┌────────────┐
  │  XGBoost   ││  LightGBM  ││  CatBoost  ││ ExtraTrees ││ GradBoost  │
  │  "Chiến    ││  "Tiền đạo ││  "Pháo đài ││ "Biệt đội ││ "Kỹ sư    │
  │   binh     ││   sát thủ" ││  bất khả   ││  ngẫu      ││  chính    │
  │   toàn     ││            ││  xâm phạm" ││  nhiên"    ││  xác"     │
  │   diện"    ││            ││            ││            ││            │
  └─────┬──────┘└─────┬──────┘└─────┬──────┘└─────┬──────┘└─────┬──────┘
        │              │              │              │              │
     PD_xgb        PD_lgbm        PD_cat         PD_et          PD_gb
        │              │              │              │              │
        └──────────────┴──────────────┼──────────────┴──────────────┘
                                      │
              ┌───────────────────────▼───────────────────────┐
              │  LEVEL 1 OOF (Out-Of-Fold) 5-Fold Predictions │
              │  = [PD_xgb, PD_lgbm, PD_cat, PD_et, PD_gb]   │
              │  + 15 Original Features = 20 meta features    │
              └───────────────────────┬───────────────────────┘
                                      │
                           ┌──────────▼──────────┐
                           │  LogisticRegression  │
                           │  Meta-Learner        │
                           │  Input: 20 dims      │
                           │  (5 OOF + 15 feat)   │
                           └──────────┬──────────┘
                                      │
                           ┌──────────▼──────────┐
                           │  HYBRID FINAL PD     │
                           │  Default Probability │
                           │  (0.0 → 1.0)         │
                           └──────────┬──────────┘
                                      │
                           ┌──────────▼──────────┐
                           │  ai_risk_score       │
                           │  = round(PD × 100)   │
                           │  (0 – 100)            │
                           └─────────────────────┘
```

### Luồng hoạt động tổng quát

```
Lending Club CSV (USD)
    │
    ▼
┌───────────────────────────────────────────┐
│  1. Load & Clean Data                      │  396,030 records
│  2. Filter target                          │  Fully Paid (0) / Charged Off (1)
│  3. Scale USD → VNĐ                        │  Tỷ giá live: ~26,000 VNĐ/USD
│  4. Feature Engineering                    │  27 cột gốc → 15 features
│  5. Per-Feature Scaling (15 scalers)       │  Mỗi feature riêng 1 StandardScaler
│  6. Level 1: OOF 5-Fold — 5 Base Learners │  XGB + LGBM + CatBoost + ET + GB
│  7. Level 2: LR Meta-Learner              │  Input: 5 OOF + 15 features = 20 dims
│  8. Nested CV (5 outer × 5 inner)          │  CV AUC ổn định
│  9. Save Artifacts                         │  7 model files + 15 scalers + metadata
│ 10. Xuất 20 biểu đồ đánh giá              │  ROC, PR, CM, Radar, Gain/Lift...
└───────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│  FastAPI REST Service       │
│  POST /api/score            │
│                             │
│  Input: 15 features (VNĐ)  │──→  Output: { ai_risk_score, default_probability }
│  từ NestJS Backend          │
└─────────────────────────────┘
```

### Tại sao Hybrid Stacking thay vì Soft Voting?

| Tiêu chí               | Soft Voting (v3.0)                     | Hybrid Stacking OOF (v4.0)                      |
| ---------------------- | -------------------------------------- | ----------------------------------------------- |
| **Phương pháp**        | Trung bình PD 3 model                  | Meta-Learner HỌC cách kết hợp 5 model           |
| **Kết hợp**            | `PD = mean(PD_xgb, PD_rf, PD_lgbm)`    | LR Meta(5 OOF + 15 features) → PD_final         |
| **Chống Data Leakage** | ❌ Train trên toàn bộ → bias           | ✅ OOF cross-validation → zero leakage          |
| **Trọng số model**     | Bằng nhau (1/3, 1/3, 1/3)              | LR Meta tự học trọng số tối ưu (L2 regularized) |
| **Số mô hình Level 1** | 3 (XGB, RF, LGBM)                      | 5 (XGB, LGBM, CatBoost, ExtraTrees, GradBoost)  |
| **Đa dạng thuật toán** | 2 loại (Gradient Boosting, Bagging)    | 3 loại (Gradient Boosting, Bagging, ExtraTrees) |
| **Chuẩn hóa**          | 1 StandardScaler chung cho 15 features | 15 StandardScaler riêng (mỗi feature 1 scaler)  |

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

| Feature    | Mean    | Std     | Min  | 25%     | 50%     | 75%     | Max        |
| ---------- | ------- | ------- | ---- | ------- | ------- | ------- | ---------- |
| loan_amnt  | $14,114 | $8,357  | $500 | $8,000  | $12,000 | $20,000 | $40,000    |
| annual_inc | $74,203 | $61,638 | $0   | $45,000 | $64,000 | $90,000 | $8,706,582 |
| dti        | 17.4%   | 17.8%   | 0%   | 11.3%   | 17.0%   | 23.6%   | 999%       |

> **Lưu ý**: `int_rate` (lãi suất) bị loại khỏi model vì lãi suất là **động** — do nhân viên duyệt hoặc bên thứ 3 quyết định, không có sẵn tại thời điểm scoring.

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

```
loan_amnt × VNĐ_rate     →  capital (VNĐ)
annual_inc / 12 × VNĐ_rate  →  monthly_income (VNĐ)
installment × VNĐ_rate    →  monthly_pay (VNĐ)
revol_bal × VNĐ_rate      →  revolving_balance (VNĐ)
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

### 4.1. Bảng 15 Features cuối cùng

> **Lưu ý**: `interest_rate` đã bị loại — lãi suất là động, do nhân viên hoặc bên thứ 3 quyết định sau khi đánh giá.

| #   | Tên Feature              | Nguồn gốc                  | Mô tả                  | Đơn vị  |
| --- | ------------------------ | -------------------------- | ---------------------- | ------- |
| 1   | `credit_score`           | sub_grade → mapping        | Điểm tín dụng          | 150–750 |
| 2   | `capital`                | loan_amnt × VNĐ rate       | Số tiền vay            | VNĐ     |
| 3   | `monthly_income`         | annual_inc / 12 × VNĐ rate | Lương tháng            | VNĐ     |
| 4   | `monthly_pay`            | installment × VNĐ rate     | Trả góp/tháng          | VNĐ     |
| 5   | `revolving_balance`      | revol_bal × VNĐ rate       | Dư nợ tín dụng         | VNĐ     |
| 6   | `dti`                    | dti                        | Tỷ lệ Nợ/Thu nhập      | %       |
| 7   | `revolving_util_percent` | revol_util                 | % sử dụng hạn mức      | %       |
| 8   | `term_months`            | term → parse               | Kỳ hạn vay             | tháng   |
| 9   | `emp_length_years`       | emp_length → parse         | Số năm đi làm          | năm     |
| 10  | `active_bad_debts`       | pub_rec                    | Nợ xấu đang active     | count   |
| 11  | `bankruptcies`           | pub_rec_bankruptcies       | Số lần phá sản         | count   |
| 12  | `active_loans`           | open_acc                   | Khoản vay đang mở      | count   |
| 13  | `total_loans_history`    | total_acc                  | Tổng khoản vay từng có | count   |
| 14  | `home_ownership_enc`     | home_ownership → encode    | Hình thức nhà ở        | ordinal |
| 15  | `purpose_enc`            | purpose → encode           | Mục đích vay           | ordinal |

### 4.2. Per-Feature Scaling

> **Khác biệt so với v3.0**: Thay vì dùng 1 StandardScaler chung cho 15 features, v4.0 tạo **15 StandardScaler riêng biệt** — mỗi feature có scaler riêng.

**Lý do**:

- Các features có phân phối rất khác nhau (VD: `capital` là VNĐ hàng trăm triệu, `bankruptcies` là 0–5)
- Per-feature scaling đảm bảo mỗi feature được chuẩn hóa **tối ưu theo phân phối riêng của nó**
- Meta-learner nhận input đồng nhất hơn

$$z_i = \frac{x_i - \mu_i}{\sigma_i} \quad \text{(cho mỗi feature } i = 1..15\text{)}$$

```python
# Tạo 15 scaler riêng biệt
scalers = {}
for i, feature_name in enumerate(FEATURE_NAMES):
    sc = StandardScaler()
    X_scaled[:, i] = sc.fit_transform(X_raw[:, i].reshape(-1, 1)).ravel()
    scalers[feature_name] = sc
```

Scalers được lưu tại `models/per_feature_scalers.joblib` và tái sử dụng khi predict.

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

---

## 5. Huấn luyện mô hình Hybrid Stacking (Model Training)

### 5.1. Phương pháp: Hybrid Stacking 2 Tầng với OOF

Kết hợp **5 thuật toán khác nhau** ở Level 1 (Base Learners) và **LogisticRegression Meta-Learner** ở Level 2 để tối ưu hóa dự đoán:

#### Level 1 — 5 Base Learners (OOF 5-Fold)

| #   | Mô hình              | Biệt danh                   | Loại                           | Ưu điểm                                               |
| --- | -------------------- | --------------------------- | ------------------------------ | ----------------------------------------------------- |
| 1   | **XGBoost**          | "Chiến binh toàn diện"      | Gradient Boosting              | Ranking tốt, calibrated probabilities, early stopping |
| 2   | **LightGBM**         | "Tiền đạo sát thủ"          | Gradient Boosting              | Nhanh, hiệu quả bộ nhớ, histogram-based splitting     |
| 3   | **CatBoost**         | "Pháo đài bất khả xâm phạm" | Gradient Boosting              | Tự xử lý ordered boosting, robust với noise           |
| 4   | **ExtraTrees**       | "Biệt đội ngẫu nhiên"       | Bagging (Extremely Randomized) | Random splits tại mỗi feature, giảm variance mạnh     |
| 5   | **GradientBoosting** | "Kỹ sư chính xác"           | Gradient Boosting              | Sklearn native, ổn định, dễ tune                      |

#### Level 2 — Meta-Learner

| Mô hình                | Input                                                  | Output         |
| ---------------------- | ------------------------------------------------------ | -------------- |
| **LogisticRegression** | 5 OOF predictions + 15 original features = **20 dims** | PD_final (0–1) |

#### OOF (Out-Of-Fold) — Chống Data Leakage hoàn toàn

```
Dữ liệu Train (316,824 mẫu)
    │
    ├── Fold 1: Train (4/5) → Predict (1/5) → OOF_fold_1
    ├── Fold 2: Train (4/5) → Predict (1/5) → OOF_fold_2
    ├── Fold 3: Train (4/5) → Predict (1/5) → OOF_fold_3
    ├── Fold 4: Train (4/5) → Predict (1/5) → OOF_fold_4
    └── Fold 5: Train (4/5) → Predict (1/5) → OOF_fold_5
                                                  │
                            OOF_train = concat(OOF_fold_1..5)
                            → Meta-Learner train trên OOF, KHÔNG bị leakage
```

**Tại sao cần OOF?**

- Nếu train Level 1 trên toàn bộ data → Level 1 đã "thấy" data → Meta-Learner nhận predictions bị bias (overfitted)
- OOF đảm bảo mỗi prediction được sinh bởi model **chưa từng thấy sample đó** → zero data leakage

### 5.2. Hyperparameters

#### XGBoost — "Chiến binh toàn diện"

| Parameter               | Giá trị | Lý do                                       |
| ----------------------- | ------- | ------------------------------------------- |
| `n_estimators`          | 1000    | Đủ lớn để early stopping hiệu quả           |
| `max_depth`             | 6       | Sâu hơn để bắt pattern phức tạp             |
| `learning_rate`         | 0.02    | Học chậm hơn, ổn định, generalize tốt       |
| `subsample`             | 0.8     | Random 80% samples mỗi tree (giảm variance) |
| `colsample_bytree`      | 0.8     | Random 80% features mỗi tree                |
| `min_child_weight`      | 10      | Tránh split quá nhỏ (chống overfitting)     |
| `gamma`                 | 0.3     | Penalize thêm độ phức tạp tree              |
| `reg_alpha` (L1)        | 1.0     | L1 regularization                           |
| `reg_lambda` (L2)       | 3.0     | L2 regularization mạnh                      |
| `scale_pos_weight`      | auto    | Tính từ class ratio (neg/pos)               |
| `early_stopping_rounds` | 50      | Dừng nếu 50 rounds không cải thiện          |
| `tree_method`           | hist    | Histogram-based splitting (nhanh hơn)       |
| `n_jobs`                | -1      | Sử dụng toàn bộ CPU cores                   |

#### LightGBM — "Tiền đạo sát thủ"

| Parameter           | Giá trị | Lý do                                 |
| ------------------- | ------- | ------------------------------------- |
| `n_estimators`      | 1000    | Đủ lớn để early stopping hiệu quả     |
| `max_depth`         | 6       | Sâu hơn để bắt pattern phức tạp       |
| `learning_rate`     | 0.02    | Học chậm hơn, ổn định, generalize tốt |
| `subsample`         | 0.8     | Random 80% rows                       |
| `colsample_bytree`  | 0.8     | Random 80% features                   |
| `min_child_samples` | 20      | Tránh lá quá nhỏ                      |
| `reg_alpha` (L1)    | 1.0     | L1 regularization                     |
| `reg_lambda` (L2)   | 3.0     | L2 regularization                     |
| `is_unbalance`      | True    | Tự cân bằng class weight              |
| `n_jobs`            | -1      | Sử dụng toàn bộ CPU cores             |

#### CatBoost — "Pháo đài bất khả xâm phạm"

| Parameter               | Giá trị  | Lý do                                 |
| ----------------------- | -------- | ------------------------------------- |
| `iterations`            | 1000     | Đủ lớn để early stopping hiệu quả     |
| `depth`                 | 6        | Sâu hơn để bắt pattern phức tạp       |
| `learning_rate`         | 0.02     | Học chậm hơn, ổn định, generalize tốt |
| `l2_leaf_reg`           | 3.0      | L2 regularization                     |
| `auto_class_weights`    | Balanced | Tự cân bằng class weight              |
| `eval_metric`           | AUC      | Tối ưu theo AUC-ROC                   |
| `early_stopping_rounds` | 50       | Dừng nếu 50 rounds không cải thiện    |

#### ExtraTrees — "Biệt đội ngẫu nhiên"

| Parameter           | Giá trị            | Lý do                                           |
| ------------------- | ------------------ | ----------------------------------------------- |
| `n_estimators`      | 800                | Nhiều cây hơn để ổn định                        |
| `max_depth`         | None (unlimited)   | Cây phát triển đầy đủ để bắt pattern phức tạp   |
| `min_samples_split` | 10                 | Cho phép split nhỏ hơn để tăng recall           |
| `min_samples_leaf`  | 5                  | Lá nhỏ hơn để model linh hoạt hơn               |
| `max_features`      | sqrt               | Random √n features mỗi split (giảm correlation) |
| `class_weight`      | balanced_subsample | **Cân bằng class weight → tăng Recall**         |

#### GradientBoosting — "Kỹ sư chính xác"

| Parameter           | Giá trị | Lý do                              |
| ------------------- | ------- | ---------------------------------- |
| `n_estimators`      | 500     | Nhiều hơn để bù learning rate thấp |
| `max_depth`         | 5       | Sâu hơn để bắt pattern phức tạp    |
| `learning_rate`     | 0.02    | Học chậm hơn, generalize tốt       |
| `subsample`         | 0.8     | Random 80% samples                 |
| `min_samples_split` | 15      | Cho phép split nhỏ hơn             |
| `min_samples_leaf`  | 8       | Lá phải có ít nhất 8 mẫu           |

#### LogisticRegression Meta-Learner (Level 2)

| Parameter      | Giá trị  | Lý do                                                  |
| -------------- | -------- | ------------------------------------------------------ |
| `C`            | 1.0      | Inverse regularization strength (L2)                   |
| `class_weight` | balanced | Cân bằng class weight cho imbalanced data              |
| `max_iter`     | 1000     | Đủ iterations để hội tụ                                |
| `solver`       | lbfgs    | Tối ưu cho L2 regularization, hiệu quả với dataset vừa |
| `n_jobs`       | -1       | Sử dụng toàn bộ CPU cores                              |

> **Tại sao LogisticRegression thay vì Random Forest?**
>
> - RF Meta với `max_depth=14` trên 20 meta features dễ **overfitting** — HYBRID AUC < XGBoost AUC
> - LR tìm **tổ hợp tuyến tính tối ưu** của 5 base learner outputs + 15 features
> - Ít overfitting trên meta features, đây là phương pháp **chuẩn trong Kaggle stacking**
> - LR nhanh hơn RF nhiều lần, inference gần như instant

### 5.3. Train/Test Split

| Set       | Số mẫu        | Tỷ lệ default |
| --------- | ------------- | ------------- |
| **Train** | 316,824 (80%) | ~19.61%       |
| **Test**  | 79,206 (20%)  | ~19.61%       |

> Split sử dụng `stratify=y` để đảm bảo tỷ lệ default giống nhau giữa train và test.

### 5.4. Nested Cross-Validation

- **Phương pháp**: 5-Fold Outer × 5-Fold Inner OOF (Nested Hybrid Stacking)
- **Scoring**: AUC-ROC
- **Outer folds**: Train full hybrid stacking pipeline trên 4/5 data, evaluate trên 1/5
- **Inner folds**: OOF predictions cho Level 1 models bên trong mỗi outer fold

### 5.5. Training Pipeline — 11 bước

```
┌──────────────────────────────────────────────────────────┐
│ [1/11]  Load & Clean Data                                 │
│ [2/11]  Train/Test Split (80/20, stratified)              │
│ [3/11]  Per-Feature Scaling (15 scalers)                  │
│ [4/11]  XGBoost OOF (5-fold)    — "Chiến binh toàn diện" │
│ [5/11]  LightGBM OOF (5-fold)   — "Tiền đạo sát thủ"    │
│ [6/11]  CatBoost OOF (5-fold)   — "Pháo đài bất khả XP" │
│ [7/11]  ExtraTrees OOF (5-fold)  — "Biệt đội ngẫu nhiên" │
│ [8/11]  GradBoost OOF (5-fold)   — "Kỹ sư chính xác"    │
│ [9/11]  Build Meta Features (5 OOF + 15 feat = 20 dims)  │
│         Train LR Meta-Learner (LogisticRegression)        │
│ [10/11] Evaluate (Metrics + Classification Report)        │
│         Nested CV (5 outer × 5 inner)                     │
│ [11/11] Save Artifacts + 20 Charts                        │
└──────────────────────────────────────────────────────────┘
```

### 5.6. Artifacts được lưu

| File                         | Đường dẫn                           | Mô tả                                            |
| ---------------------------- | ----------------------------------- | ------------------------------------------------ |
| `xgb_pd_model.json`          | `models/xgb_pd_model.json`          | XGBoost model (JSON format)                      |
| `lgbm_pd_model.txt`          | `models/lgbm_pd_model.txt`          | LightGBM model (text format)                     |
| `cat_pd_model.joblib`        | `models/cat_pd_model.joblib`        | CatBoost model (pickle)                          |
| `et_pd_model.joblib`         | `models/et_pd_model.joblib`         | ExtraTrees model (pickle)                        |
| `gb_pd_model.joblib`         | `models/gb_pd_model.joblib`         | GradientBoosting model (pickle)                  |
| `lr_meta_model.joblib`       | `models/lr_meta_model.joblib`       | LogisticRegression Meta-Learner Level 2 (pickle) |
| `per_feature_scalers.joblib` | `models/per_feature_scalers.joblib` | 15 Per-Feature StandardScaler (pickle)           |
| `metadata.json`              | `models/metadata.json`              | Metrics + feature info + mappings                |

> **Tổng cộng 8 artifact files** (thay vì 5 files ở v3.0).

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

### 6.4. Luồng Inference (Level 1 → Level 2)

```python
# 1. Per-feature scaling (15 scalers)
for i, feature_name in enumerate(FEATURE_NAMES):
    X[0, i] = scalers[feature_name].transform(X_raw[0, i])

# 2. Level 1: 5 Base Learners predict riêng lẻ
PD_xgb  = xgb_model.predict_proba(X)[0, 1]
PD_lgbm = lgbm_model.predict(X)[0]
PD_cat  = cat_model.predict_proba(X)[0, 1]
PD_et   = et_model.predict_proba(X)[0, 1]
PD_gb   = gb_model.predict_proba(X)[0, 1]

# 3. Level 2: LR Meta-Learner
X_meta = [PD_xgb, PD_lgbm, PD_cat, PD_et, PD_gb] + X (15 features)
PD_final = lr_meta.predict_proba(X_meta)[0, 1]

# 4. Output
ai_risk_score = round(PD_final × 100)
```

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
      ...
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

### 7.1. Metrics sử dụng

| Metric                | Ý nghĩa                                                 |
| --------------------- | ------------------------------------------------------- |
| **AUC-ROC**           | Khả năng phân biệt giữa Paid và Default                 |
| **Accuracy**          | Tỷ lệ dự đoán đúng tổng thể                             |
| **Balanced Accuracy** | Accuracy trung bình 2 class (tốt cho imbalanced)        |
| **Precision**         | Khi model dự đoán "vỡ nợ", bao nhiêu % là đúng?         |
| **Recall**            | Trong tất cả ca vỡ nợ thực, model bắt được bao nhiêu %? |
| **F1-Score**          | Harmonic mean Precision & Recall                        |
| **Brier Score**       | Calibration error (càng thấp càng tốt)                  |
| **Log Loss**          | Cross-entropy loss                                      |
| **MCC**               | Matthews Correlation Coefficient                        |
| **Cohen's Kappa**     | Agreement beyond chance                                 |
| **KS Statistic**      | Maximum separation giữa TPR và FPR                      |

### 7.2. Optimal Threshold — Youden's J

Thay vì dùng threshold mặc định 0.5, Hybrid Stacking sử dụng **Youden's J index** để tìm threshold tối ưu:

$$J = \text{Sensitivity} + \text{Specificity} - 1 = \text{TPR} - \text{FPR}$$

$$\text{Optimal Threshold} = \arg\max_t (TPR(t) - FPR(t))$$

> Threshold tối ưu được lưu trong `metadata.json` → scorer tự động sử dụng.

### 7.3. 20 Biểu đồ đánh giá

| #   | Tên biểu đồ                            | File                            | Mô tả                                        |
| --- | -------------------------------------- | ------------------------------- | -------------------------------------------- |
| 1   | ROC Curve (All Models)                 | `01_roc_curve_all_models.png`   | ROC cho 5 base + meta + hybrid               |
| 2   | Precision-Recall Curve                 | `02_precision_recall_curve.png` | PR curve cho tất cả models                   |
| 3   | Confusion Matrix (Counts + Normalized) | `03_confusion_matrix.png`       | Ma trận nhầm lẫn absolute + %                |
| 4   | Feature Importance (XGBoost vs LGBM)   | `04_feature_importance.png`     | So sánh feature importance 2 model chính     |
| 5   | PD Distribution (All Models)           | `05_pd_distribution_all.png`    | Phân phối PD cho 6 models (2×3 grid)         |
| 6   | Calibration Curve                      | `06_calibration_curve.png`      | Calibration cho tất cả models                |
| 7   | CV AUC per Fold                        | `07_cv_auc_per_fold.png`        | AUC từng fold nested CV                      |
| 8   | Threshold Sensitivity                  | `08_threshold_sensitivity.png`  | Prec/Rec/F1/Acc/Spec theo threshold          |
| 9   | OOF Correlation Heatmap                | `09_oof_correlation.png`        | Tương quan giữa 5 OOF predictions            |
| 10  | Model Comparison Bar Chart             | `10_model_comparison_bar.png`   | So sánh 7 models × 5 metrics                 |
| 11  | Cumulative Gain & Lift Curve           | `11_gain_lift_curve.png`        | Gain + Lift curve (model vs random)          |
| 12  | KS Statistic                           | `12_ks_statistic.png`           | Kolmogorov-Smirnov TPR vs FPR                |
| 13  | Stacking Architecture Diagram          | `13_architecture.png`           | Sơ đồ kiến trúc 2 tầng (visual)              |
| 14  | CV Fold Metrics Heatmap                | `14_cv_fold_heatmap.png`        | Heatmap metrics từng fold                    |
| 15  | Risk Band Distribution                 | `15_risk_band.png`              | 5 nhóm rủi ro (count + default rate)         |
| 16  | Feature Correlation Heatmap            | `16_feature_correlation.png`    | Tương quan 15 features (triangle heatmap)    |
| 17  | OOF Boxplot by Class                   | `17_oof_boxplot.png`            | Boxplot OOF predictions Paid vs Default      |
| 18  | Radar Chart (All Models)               | `18_radar_chart.png`            | Radar 6 metrics cho 6 models                 |
| 19  | Error Analysis (FP vs FN)              | `19_error_analysis.png`         | Phân tích False Positives vs False Negatives |
| 20  | Summary Dashboard                      | `20_summary_dashboard.png`      | Tổng hợp 7 mini-charts + metrics table       |

### 7.4. So sánh hiệu năng: v3.0 (Soft Voting) vs v4.0 (Hybrid Stacking)

| Tiêu chí                | v3.0 Soft Voting (3 models) | v4.0 Hybrid Stacking (5+1 models)  |
| ----------------------- | --------------------------- | ---------------------------------- |
| **Số models Level 1**   | 3                           | 5                                  |
| **Meta-Learner**        | Simple mean                 | LogisticRegression (20 dims input) |
| **OOF**                 | Không                       | Có (5-Fold StratifiedKFold)        |
| **Per-Feature Scaling** | 1 scaler chung              | 15 scaler riêng                    |
| **Nested CV**           | 5-Fold đơn                  | 5 Outer × 5 Inner                  |
| **Metrics bổ sung**     | AUC, Acc, Prec, Rec, F1     | + MCC, Kappa, KS, Balanced Acc     |
| **Biểu đồ**             | 8 charts                    | 20 charts                          |

---

## 8. Tích hợp hệ thống P2P Lending

### 8.1. Kiến trúc tích hợp

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────────────┐
│  React Native│────→│  NestJS Backend  │────→│  AIScore Service            │
│  Mobile App  │     │  (server_do_an_  │ POST│  FastAPI Port 8001          │
│  (Client)    │     │   new)           │ /api│                             │
│              │←────│                  │←────│  Hybrid Stacking            │
│  Hiển thị    │     │  Lưu score +     │score│  5 Base (OOF) + LR Meta    │
│  Risk Score  │     │  quyết định      │     │  Per-Feature Scaling        │
└─────────────┘     └──────────────────┘     └─────────────────────────────┘
```

### 8.2. Mapping NestJS → AIScore Request

| NestJS Field           | AIScore Field            | Nguồn                        |
| ---------------------- | ------------------------ | ---------------------------- |
| `creditScore`          | `credit_score`           | Hệ thống chấm điểm (150–750) |
| `loanAmount`           | `capital`                | Số tiền vay (VNĐ)            |
| `monthlyIncome`        | `monthly_income`         | Lương tháng (VNĐ)            |
| `monthlyPayment`       | `monthly_pay`            | Trả góp/tháng (VNĐ)          |
| `revolvingBalance`     | `revolving_balance`      | Dư nợ tín dụng (VNĐ)         |
| `debtToIncome`         | `dti`                    | Tỷ lệ Nợ/Thu nhập (%)        |
| `revolvingUtilization` | `revolving_util_percent` | % sử dụng hạn mức tín dụng   |
| `termMonths`           | `term_months`            | Kỳ hạn vay (tháng)           |
| `employmentYears`      | `emp_length_years`       | Số năm đi làm                |
| `publicRecords`        | `active_bad_debts`       | Nợ xấu đang active           |
| `bankruptcies`         | `bankruptcies`           | Số lần phá sản               |
| `openAccounts`         | `active_loans`           | Khoản vay đang mở            |
| `totalAccounts`        | `total_loans_history`    | Tổng khoản vay từng có       |
| `homeOwnership`        | `home_ownership`         | RENT / OWN / MORTGAGE        |
| `loanPurpose`          | `loan_purpose`           | Mục đích vay                 |

### 8.3. Cách sử dụng AI Risk Score

| AI Risk Score | Nhóm rủi ro    | Hành động hệ thống                    |
| ------------- | -------------- | ------------------------------------- |
| 0 – 10        | **Rất thấp**   | Tự động duyệt, lãi suất ưu đãi        |
| 11 – 25       | **Thấp**       | Duyệt nhanh, lãi suất thông thường    |
| 26 – 40       | **Trung bình** | Cần review thủ công, lãi suất cao hơn |
| 41 – 60       | **Cao**        | Yêu cầu tài sản bảo đảm, hạn mức thấp |
| 61 – 100      | **Rất cao**    | Từ chối hoặc yêu cầu thêm chứng từ    |

### 8.4. Luồng xử lý trong NestJS

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

### 8.5. Configuration (NestJS)

```typescript
// server_do_an_new/src/config/configuration.ts
aiscore: {
    serviceUrl: process.env.AISCORE_SERVICE_URL || 'http://localhost:8001',
    timeout: parseInt(process.env.AISCORE_TIMEOUT || '15000', 10),
    enabled: process.env.AISCORE_ENABLED === 'true',
}
```

---

## 9. API Endpoints

### 9.1. Danh sách API

| Method | Endpoint             | Mô tả                         |
| ------ | -------------------- | ----------------------------- |
| POST   | `/api/score`         | Chấm điểm 1 người vay         |
| POST   | `/api/score/batch`   | Chấm điểm hàng loạt (max 100) |
| GET    | `/api/health`        | Kiểm tra service health       |
| GET    | `/api/model/info`    | Thông tin model hiện tại      |
| GET    | `/api/exchange-rate` | Tỷ giá USD/VNĐ hiện tại       |
| POST   | `/api/model/retrain` | Retrain model (admin only)    |

### 9.2. Health Check Response

```json
GET /api/health

{
  "status": "ok",
  "service": "aiscore-service-v4-hybrid-stacking",
  "model_loaded": true,
  "model_type": "Hybrid Stacking 2-Layer (5 Base OOF + LR Meta-Learner)",
  "n_features": 15,
  "n_meta_features": 20,
  "exchange_rate": {
    "rate": 26251,
    "source": "open.er-api.com"
  }
}
```

### 9.3. Model Info Response

```json
GET /api/model/info

{
  "model_type": "hybrid_stacking_5_base",
  "architecture": "Level1(XGB+LGBM+CatBoost+ExtraTrees+GradBoost OOF) -> Level2(LR Meta)",
  "feature_names": ["credit_score", "capital", "monthly_income", ...],
  "meta_feature_names": ["oof_xgb", "oof_lgbm", "oof_cat", "oof_et", "oof_gb", "credit_score", ...],
  "n_features": 15,
  "n_meta_features": 20,
  "n_folds_oof": 5,
  "optimal_threshold": 0.XXXX,
  "test_metrics": {
    "auc_roc": 0.XXXX,
    "accuracy": 0.XXXX,
    "balanced_accuracy": 0.XXXX,
    "precision": 0.XXXX,
    "recall": 0.XXXX,
    "f1_score": 0.XXXX,
    "brier_score": 0.XXXX,
    "log_loss": 0.XXXX,
    "mcc": 0.XXXX,
    "kappa": 0.XXXX,
    "ks_statistic": 0.XXXX
  },
  "level1_oof_auc": {
    "xgb": 0.XXXX, "lgbm": 0.XXXX, "cat": 0.XXXX, "et": 0.XXXX, "gb": 0.XXXX
  },
  "level1_test_auc": {
    "xgb": 0.XXXX, "lgbm": 0.XXXX, "cat": 0.XXXX, "et": 0.XXXX, "gb": 0.XXXX
  },
  "cv_auc_mean": 0.XXXX,
  "cv_auc_std": 0.XXXX,
  "scaling": "per_feature_standard_scaler",
  "train_size": 316824,
  "test_size": 79206
}
```

> **Lưu ý**: Các giá trị metrics `0.XXXX` sẽ được điền sau khi chạy train trên Google Colab. Metrics thực tế phụ thuộc vào tỷ giá và random seed.

---

## 10. Kết luận

### 10.1. Tóm tắt

AIScore Service v4.0 sử dụng **Hybrid Stacking 2 tầng** kết hợp 5 Base Learners (OOF) + LogisticRegression Meta-Learner để dự đoán xác suất vỡ nợ (PD) cho hệ thống P2P Lending Việt Nam.

**Kết quả chính:**

- **Kiến trúc**: Level 1 (5 OOF: XGBoost + LightGBM + CatBoost + ExtraTrees + GradBoost) → Level 2 (LR Meta)
- **15 features** đầu vào (loại bỏ `interest_rate` vì là thông tin động)
- **Per-Feature Scaling**: 15 StandardScaler riêng biệt
- **OOF**: 5-Fold StratifiedKFold — chống data leakage hoàn toàn
- **Nested CV**: 5 outer × 5 inner folds
- **20 biểu đồ** đánh giá chi tiết
- **Dữ liệu**: 396,030 khoản vay Lending Club, quy đổi VNĐ
- **Tỷ lệ vỡ nợ**: 19.61%

### 10.2. Cải thiện so với v3.0

| Tiêu chí           | v3.0 (Soft Voting)  | v4.0 (Hybrid Stacking)   |
| ------------------ | ------------------- | ------------------------ |
| Số models Level 1  | 3                   | **5**                    |
| Meta-Learner       | Trung bình đơn giản | **LR Meta (20 dims)**    |
| Chống Data Leakage | ❌                  | **✅ OOF 5-Fold**        |
| Scaling            | 1 scaler chung      | **15 scaler riêng**      |
| Cross-Validation   | 5-Fold đơn          | **Nested 5×5**           |
| Số biểu đồ         | 8                   | **20**                   |
| Inference pipeline | mean(3 PD)          | **Level 1 → LR Level 2** |

### 10.3. Hướng phát triển

1. **Thêm behavioral features**: Lịch sử trả nợ, login frequency, spending patterns → tăng AUC > 0.8
2. **Threshold tuning**: Tối ưu PD threshold cho business objectives (minimize loss vs maximize approval)
3. **Model monitoring**: Theo dõi drift, recalibrate định kỳ
4. **SHAP values**: Giải thích prediction cho từng case cụ thể
5. **Bayesian Hyperparameter Tuning**: Optuna/Hyperopt cho tự động tune
6. **Thêm dữ liệu VN thực tế**: Khi tích lũy đủ data từ hệ thống P2P, retrain trên dữ liệu thực

### 10.4. Cấu trúc Files — AIScore Service

```
aiscore_service/
├── app.py                    # FastAPI REST API (port 8001)
├── scorer.py                 # CreditScorer class — inference (5 Base + LR Meta)
├── train_model.py            # MEGA pipeline — train + charts + scorer (Colab)
├── requirements.txt          # Python dependencies
├── Dockerfile                # Docker build (production)
├── docker-compose.yml        # Docker compose
├── wsgi.py                   # WSGI/ASGI entry point
├── AI_MODEL_DOCUMENTATION.md # Tài liệu này
├── README.md                 # Hướng dẫn setup & API
├── models/                   # Model artifacts
│   ├── xgb_pd_model.json
│   ├── lgbm_pd_model.txt
│   ├── cat_pd_model.joblib
│   ├── et_pd_model.joblib
│   ├── gb_pd_model.joblib
│   ├── lr_meta_model.joblib
│   ├── per_feature_scalers.joblib
│   └── metadata.json
└── docs/                     # Charts output (20 biểu đồ)
    ├── 01_roc_curve_all_models.png
    ├── 02_precision_recall_curve.png
    ├── ...
    └── 20_summary_dashboard.png
```

---

_Tài liệu được cập nhật cho AIScore Service v4.0 — Hybrid Stacking 2 Tầng (5 OOF + LR Meta)_
_Ngày cập nhật: 28/03/2026_
