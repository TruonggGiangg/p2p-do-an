# AIScore Service — Tài liệu mô hình AI chấm điểm tín dụng

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Dữ liệu đầu vào (Input Dataset)](#2-dữ-liệu-đầu-vào-input-dataset)
3. [Tiền xử lý dữ liệu (Preprocessing Pipeline)](#3-tiền-xử-lý-dữ-liệu-preprocessing-pipeline)
4. [Kỹ thuật Feature Engineering & Smart Scaling](#4-kỹ-thuật-feature-engineering--smart-scaling)
5. [Huấn luyện mô hình XGBoost + LR Scorecard](#5-huấn-luyện-mô-hình-xgboost--lr-scorecard)
6. [Output — JSON trả về](#6-output--json-trả-về)
7. [Đánh giá mô hình (Evaluation)](#7-đánh-giá-mô-hình-evaluation)
8. [Tích hợp hệ thống P2P Lending](#8-tích-hợp-hệ-thống-p2p-lending)
9. [API Endpoints](#9-api-endpoints)
10. [Kết luận](#10-kết-luận)

---

## 1. Tổng quan

| Thông tin          | Giá trị                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| **Tên service**    | AIScore Service v5.0                                                                            |
| **Mô hình**        | XGBoost + Logistic Regression Scorecard — "Tiêu chuẩn vàng" ngành tài chính                    |
| **Framework API**  | FastAPI + Uvicorn                                                                               |
| **Ngôn ngữ**       | Python 3.11+                                                                                    |
| **Port**           | 8001                                                                                            |
| **Mục đích**       | Dự đoán xác suất vỡ nợ (PD) + Tính Credit Score cho người vay trong hệ thống P2P Lending        |
| **Đơn vị tiền tệ** | VNĐ (quy đổi từ USD qua tỷ giá real-time)                                                       |
| **Phương pháp**    | Stage 1: XGBoost → Leaf Indices → Stage 2: LR Scorecard → Stage 3: Credit Score Formula         |
| **Chuẩn hóa**      | Smart Per-Feature Scaling — 6 chiến lược khác nhau tùy phân phối từng feature                   |

### Kiến trúc XGBoost + LR Scorecard 3 Tầng

```
                    ┌──────────────────────────────────┐
                    │  Input: 15 Features (VNĐ)         │
                    │  Smart Per-Feature Scaling         │
                    │  (6 chiến lược: log_standard,      │
                    │   log_robust, robust, standard,    │
                    │   minmax, passthrough)              │
                    └────────────────┬───────────────────┘
                                     │
                          ┌──────────▼──────────┐
                          │  STAGE 1: XGBoost   │
                          │  1500 trees, depth=6 │
                          │  "Non-linear Feature │
                          │   Learner"           │
                          └──────────┬──────────┘
                                     │
                          ┌──────────▼──────────┐
                          │  model.apply(X)      │
                          │  → Leaf Indices       │
                          │  → OneHotEncoder      │
                          │  (Sparse Matrix)      │
                          └──────────┬──────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │  Leaf OHE + 15 Original Features │
                    │  = Input cho LR                   │
                    └────────────────┬────────────────┘
                                     │
                          ┌──────────▼──────────┐
                          │  STAGE 2: Logistic   │
                          │  Regression          │
                          │  "Scorecard          │
                          │   Generator"         │
                          │  → PD (0.0 – 1.0)    │
                          └──────────┬──────────┘
                                     │
                          ┌──────────▼──────────┐
                          │  STAGE 3: Scorecard  │
                          │  Formula             │
                          │  Score = Offset -    │
                          │  Factor × ln(Odds)   │
                          └──────────┬──────────┘
                                     │
                          ┌──────────▼──────────┐
                          │  OUTPUT:             │
                          │  credit_score        │
                          │  (150 – 950)         │
                          │  ai_risk_score       │
                          │  (0 – 100)           │
                          │  default_probability │
                          │  (0.0 – 1.0)         │
                          └─────────────────────┘
```

### Luồng hoạt động tổng quát

```
Lending Club CSV (USD)
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  1. Load & Clean Data                                │  396,030 records
│  2. Filter target                                    │  Fully Paid (0) / Charged Off (1)
│  3. Scale USD → VNĐ                                  │  Tỷ giá live: ~26,000 VNĐ/USD
│  4. Feature Engineering                              │  27 cột gốc → 15 features
│  5. Smart Per-Feature Scaling (6 strategies)         │  Mỗi feature pipeline riêng
│  6. Stage 1: XGBoost → Leaf Extraction               │  1500 trees, max_depth=6
│  7. OneHotEncode Leaf Indices (sparse)               │  ~N ngàn sparse features
│  8. Stage 2: LR trên [Leaf OHE + 15 Features] → PD  │  Calibrated probabilities
│  9. Stage 3: Scorecard Formula → Credit Score         │  Score = Offset - Factor × ln(Odds)
│ 10. CV 5-Fold + Save Artifacts + 20 Charts           │  ROC, PR, Score Dist, Risk Band...
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│  FastAPI REST Service       │
│  POST /api/score            │
│                             │
│  Input: 15 features (VNĐ)  │──→  Output: { credit_score, ai_risk_score, default_probability }
│  từ NestJS Backend          │
└─────────────────────────────┘
```

### Tại sao XGBoost + LR Scorecard thay vì Hybrid Stacking?

| Tiêu chí               | Hybrid Stacking (v4.0)                        | XGBoost + LR Scorecard (v5.0)                                |
| ---------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| **Kiến trúc**          | 5 Base Learners OOF → LR Meta                 | XGBoost → Leaf OHE → LR → Scorecard Formula                 |
| **Tiêu chuẩn**         | Kaggle stacking                               | **Tiêu chuẩn vàng ngành ngân hàng/tài chính**               |
| **Số model**           | 6 (5 base + 1 meta)                           | 2 (XGBoost + LR)                                            |
| **Output**             | Chỉ PD + ai_risk_score                        | **PD + Credit Score (150-950) + ai_risk_score**              |
| **Interpretability**   | Khó giải thích (black box)                     | **LR coefficients → score contribution per feature**         |
| **Inference speed**    | Chậm (5 model predict tuần tự)                | **Nhanh (1 XGBoost + 1 LR sparse)**                         |
| **Memory**             | Nặng (5 model lớn)                            | **Nhẹ (1 XGBoost + 1 LR + leaf encoder)**                   |
| **Chuẩn hóa**          | 15 StandardScaler giống nhau                  | **Smart Scaling: 6 chiến lược theo phân phối dữ liệu**      |
| **Regulatory ready**   | Khó giải trình cho ngân hàng nhà nước         | **Dễ giải trình: Scorecard formula chuẩn Basel II/III**      |

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

## 4. Kỹ thuật Feature Engineering & Smart Scaling

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

### 4.2. Smart Per-Feature Scaling — 6 Chiến lược

> **Điểm khác biệt lớn nhất so với v4.0**: Thay vì dùng 15 StandardScaler giống nhau cho tất cả features, v5.0 phân tích **phân phối dữ liệu thực tế** của từng feature và chọn **chiến lược chuẩn hóa tối ưu riêng**.

#### Tại sao Smart Scaling?

Các features có phân phối **RẤT khác nhau**:

| Vấn đề | Ví dụ | StandardScaler gặp lỗi gì? |
| --- | --- | --- |
| **VNĐ lệch phải cực mạnh** | `capital`: 12M → 1B VNĐ, phần lớn < 400M | Mean bị kéo bởi outliers, std quá lớn → Z-score không phản ánh đúng |
| **Outliers cực đoan** | `monthly_income`: top 1% có thu nhập bất thường | Mean/std bị ảnh hưởng mạnh, Z-score bị nén |
| **Zero-inflated** | `bankruptcies`: 97% = 0, 3% = 1–5 | Mean ≈ 0, std rất nhỏ → Z-score phóng đại sai lệch |
| **Discrete ordinal** | `purpose_enc`: 0–13 (nhãn danh mục) | Z-score vô nghĩa — "mục đích vay 0.5" không tồn tại |

#### Bảng chiến lược chuẩn hóa 15 features

| #   | Feature                  | Strategy         | Pipeline                         | Lý do chọn                                              |
| --- | ------------------------ | ---------------- | -------------------------------- | ------------------------------------------------------- |
| 1   | `credit_score`           | `standard`       | StandardScaler (μ, σ)            | Phân phối gần uniform 150–750, chuẩn hóa hợp lý        |
| 2   | `capital`                | `log_standard`   | log1p(x) → StandardScaler       | Tiền VNĐ lệch phải mạnh, log biến đổi thành gần normal |
| 3   | `monthly_income`         | `log_robust`     | log1p(x) → RobustScaler         | Tiền VNĐ + outliers cực đoan top 1%, median/IQR an toàn |
| 4   | `monthly_pay`            | `log_standard`   | log1p(x) → StandardScaler       | Trả góp VNĐ lệch phải, log chuẩn hóa                   |
| 5   | `revolving_balance`      | `log_standard`   | log1p(x) → StandardScaler       | Dư nợ VNĐ có thể = 0, log1p xử lý an toàn              |
| 6   | `dti`                    | `robust`         | RobustScaler (median, IQR)      | 0–100%, có outliers, median/IQR ổn định                 |
| 7   | `revolving_util_percent` | `robust`         | RobustScaler (median, IQR)      | 0–150%, lệch, median/IQR kháng outliers                 |
| 8   | `term_months`            | `standard`       | StandardScaler (μ, σ)            | Chỉ 2 giá trị (36, 60), chuẩn hóa đơn giản             |
| 9   | `emp_length_years`       | `minmax`         | MinMaxScaler [0, 1]             | Range nhỏ [0.5, 10], bounded rõ ràng                    |
| 10  | `active_bad_debts`       | `robust`         | RobustScaler (median, IQR)      | Zero-inflated (97% = 0), median = 0 giữ nguyên ý nghĩa |
| 11  | `bankruptcies`           | `robust`         | RobustScaler (median, IQR)      | Zero-inflated (98% = 0), tương tự active_bad_debts      |
| 12  | `active_loans`           | `standard`       | StandardScaler (μ, σ)            | Count 0–50, phân phối gần normal                        |
| 13  | `total_loans_history`    | `standard`       | StandardScaler (μ, σ)            | Count 1–100+, phân phối gần normal                      |
| 14  | `home_ownership_enc`     | `passthrough`    | **Không transform** (giữ nguyên) | Ordinal label (0/1/2/3), scale vô nghĩa                |
| 15  | `purpose_enc`            | `passthrough`    | **Không transform** (giữ nguyên) | Ordinal label (0–13), scale vô nghĩa                   |

#### Chi tiết từng chiến lược

##### 1. `log_standard` — log1p → StandardScaler

Dùng cho **tiền VNĐ lệch phải mạnh** (capital, monthly_pay, revolving_balance):

$$x' = \text{StandardScaler}(\log(1 + x))$$

```
Trước log1p:  capital = [12M, 50M, 100M, 500M, 1B]  ← lệch phải
Sau log1p:    log1p   = [16.3, 17.7, 18.4, 20.0, 20.7]  ← gần normal
Sau scale:    z       = [-1.5, -0.3, 0.3, 1.7, 2.3]  ← chuẩn hóa
```

**Lý do**: `log1p` (= log(1+x)) nén phạm vi lớn thành phạm vi nhỏ hơn, biến phân phối lệch phải thành gần normal. `log1p` thay vì `log` vì an toàn khi x = 0.

##### 2. `log_robust` — log1p → RobustScaler

Dùng cho **tiền VNĐ có outliers cực đoan** (monthly_income):

$$x' = \frac{\log(1 + x) - \text{median}(\log(1 + X))}{\text{IQR}(\log(1 + X))}$$

**Lý do**: `monthly_income` có top 1% thu nhập bất thường (> 300M VNĐ/tháng). RobustScaler dùng **median và IQR** (Q75 − Q25) thay vì mean/std → không bị outliers kéo lệch.

##### 3. `robust` — RobustScaler

Dùng cho **tỷ lệ % có outliers** (dti, revolving_util_percent) và **count zero-inflated** (active_bad_debts, bankruptcies):

$$x' = \frac{x - \text{median}(X)}{\text{IQR}(X)}$$

| Feature             | median | IQR    | Tại sao robust? |
| ------------------- | ------ | ------ | --- |
| `dti`               | 17.0   | 12.3   | DTI có outliers > 50% |
| `revolving_util_percent` | 54.0 | 39.0 | % sử dụng lệch |
| `active_bad_debts`  | 0      | 0–1    | 97% bằng 0, StandardScaler phóng đại |
| `bankruptcies`      | 0      | 0      | 98% bằng 0, StandardScaler phóng đại |

##### 4. `standard` — StandardScaler

Dùng cho features **phân phối gần normal** hoặc đơn giản:

$$z_i = \frac{x_i - \mu_i}{\sigma_i}$$

| Feature | Phân phối | Lý do dùng standard |
| --- | --- | --- |
| `credit_score` | Gần uniform 150–750 | Dùng mean/std phù hợp |
| `term_months` | Binary-like (36, 60) | Chỉ 2 giá trị, đơn giản |
| `active_loans` | Normal-ish 0–50 | Phân phối đã gần chuẩn |
| `total_loans_history` | Normal-ish 1–100 | Phân phối đã gần chuẩn |

##### 5. `minmax` — MinMaxScaler [0, 1]

Dùng cho features có **range nhỏ, bounded rõ** (emp_length_years):

$$x' = \frac{x - x_{\min}}{x_{\max} - x_{\min}}$$

`emp_length_years` chỉ từ 0.5 đến 10 năm → MinMaxScaler ánh xạ trực tiếp về [0, 1], trực quan hơn Z-score.

##### 6. `passthrough` — Không transform

Dùng cho **ordinal categorical** (home_ownership_enc, purpose_enc):

```
home_ownership_enc: 0 = RENT, 1 = OWN, 2 = MORTGAGE, 3 = OTHER
purpose_enc:        0 = debt_consolidation, 1 = credit_card, ...
```

**Lý do**: Đây là nhãn danh mục rời rạc (discrete). Z-score giá trị 0.5 giữa RENT và OWN không có ý nghĩa. XGBoost tự xử lý split boundary tối ưu trên giá trị ordinal.

### 4.3. Implementation chi tiết

```python
FEATURE_SCALING_CONFIG = {
    "credit_score":           "standard",       # Uniform 150–750
    "capital":                "log_standard",    # VNĐ lệch phải
    "monthly_income":         "log_robust",      # VNĐ + outliers cực
    "monthly_pay":            "log_standard",    # VNĐ lệch phải
    "revolving_balance":      "log_standard",    # VNĐ, có thể = 0
    "dti":                    "robust",          # % có outliers
    "revolving_util_percent": "robust",          # % lệch
    "term_months":            "standard",        # Binary-like
    "emp_length_years":       "minmax",          # Range nhỏ [0.5, 10]
    "active_bad_debts":       "robust",          # Zero-inflated
    "bankruptcies":           "robust",          # Zero-inflated
    "active_loans":           "standard",        # Count gần normal
    "total_loans_history":    "standard",        # Count gần normal
    "home_ownership_enc":     "passthrough",     # Ordinal label
    "purpose_enc":            "passthrough",     # Ordinal label
}

def _fit_one_feature(values_1d, strategy):
    """Fit scaler cho 1 feature theo strategy."""
    col = values_1d.reshape(-1, 1).astype(np.float64)

    if strategy == "log_standard":
        col_log = np.log1p(np.clip(col, 0, None))
        sc = StandardScaler()
        return (strategy, sc, sc.fit_transform(col_log).ravel())

    elif strategy == "log_robust":
        col_log = np.log1p(np.clip(col, 0, None))
        sc = RobustScaler()
        return (strategy, sc, sc.fit_transform(col_log).ravel())

    elif strategy == "robust":
        sc = RobustScaler()
        return (strategy, sc, sc.fit_transform(col).ravel())

    elif strategy == "standard":
        sc = StandardScaler()
        return (strategy, sc, sc.fit_transform(col).ravel())

    elif strategy == "minmax":
        sc = MinMaxScaler()
        return (strategy, sc, sc.fit_transform(col).ravel())

    elif strategy == "passthrough":
        return (strategy, None, col.ravel())

def _transform_one_feature(values_1d, strategy, scaler):
    """Transform 1 feature đã fit."""
    col = values_1d.reshape(-1, 1).astype(np.float64)

    if strategy in ("log_standard", "log_robust"):
        col_log = np.log1p(np.clip(col, 0, None))
        return scaler.transform(col_log).ravel()

    elif strategy in ("robust", "standard", "minmax"):
        return scaler.transform(col).ravel()

    elif strategy == "passthrough":
        return col.ravel()
```

Scalers được lưu tại `models/per_feature_scalers.joblib` dưới dạng dict:
```python
{
    "credit_score":           ("standard", StandardScaler(...)),
    "capital":                ("log_standard", StandardScaler(...)),
    "monthly_income":         ("log_robust", RobustScaler(...)),
    ...
    "purpose_enc":            ("passthrough", None),
}
```

### 4.4. Encoding các biến phân loại

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

## 5. Huấn luyện mô hình XGBoost + LR Scorecard

### 5.1. Phương pháp: XGBoost + Logistic Regression Scorecard 3 Tầng

Đây là phương pháp **tiêu chuẩn vàng (gold standard)** trong ngành ngân hàng và fintech:

#### Stage 1 — XGBoost (Non-linear Feature Learner)

XGBoost học các pattern phi tuyến từ 15 features. Sau khi train, ta **không dùng PD của XGBoost trực tiếp**, mà trích xuất **leaf indices** — mỗi sample được ánh xạ tới 1 leaf node trong mỗi tree.

```python
# Sau khi train XGBoost
leaf_train = xgb_model.apply(X_train)  # shape: (n_samples, n_trees)
# Ví dụ: sample #0 đi vào leaf 5 ở tree 0, leaf 12 ở tree 1, ...
```

| Tham số         | Giá trị     | Ý nghĩa |
| --------------- | ----------- | --- |
| n_trees output  | ~1500 cột   | Mỗi tree 1 leaf ID |
| OneHotEncode    | Sparse      | ~N ngàn binary features |
| Kết hợp         | Leaf OHE + 15 original | Input cho LR |

#### Stage 2 — Logistic Regression (Scorecard Generator)

LR nhận input là `[Leaf OHE + 15 Original Features]` → tạo xác suất vỡ nợ (PD) đã calibrated.

**Tại sao LR mà không dùng trực tiếp XGBoost PD?**

| Tiêu chí        | XGBoost PD trực tiếp | LR trên Leaf + Features |
| --------------- | -------------------- | ---------------------- |
| **Calibration** | Thường uncalibrated  | Tự nhiên calibrated (logistic function) |
| **Giải thích**  | Black box            | LR coefficients → score contribution |
| **Scorecard**   | Không thể tạo        | Dễ dàng: coef → score points |
| **Regulatory**  | Khó giải trình       | Chuẩn Basel II/III |

#### Stage 3 — Scorecard Formula

Chuyển PD thành Credit Score theo công thức chuẩn ngành:

$$\text{Score} = \text{Offset} - \text{Factor} \times \ln\left(\frac{PD}{1 - PD}\right)$$

Trong đó:

$$\text{Factor} = \frac{PDO}{\ln(2)} \approx 28.854$$

$$\text{Offset} = \text{Base Score} - \text{Factor} \times \ln(\text{Base Odds}) \approx 487.12$$

| Tham số    | Giá trị | Ý nghĩa |
| ---------- | ------- | --- |
| Base Score | 600     | Điểm tại odds = Base Odds |
| PDO        | 20      | Points to Double Odds — mỗi 20 điểm odds tăng gấp đôi |
| Base Odds  | 50:1    | Tại score 600, tỷ lệ good:bad = 50:1 |
| Factor     | ≈ 28.854 | PDO / ln(2) |
| Offset     | ≈ 487.12 | Base Score - Factor × ln(Base Odds) |

**Ví dụ tính score:**

| PD    | Odds (PD/(1-PD)) | ln(Odds) | Score = 487.12 - 28.854 × ln(Odds) |
| ----- | ----------------- | -------- | ----------------------------------- |
| 0.01  | 0.0101            | -4.595   | 620                                 |
| 0.05  | 0.0526            | -2.944   | 572                                 |
| 0.10  | 0.1111            | -2.197   | 550                                 |
| 0.20  | 0.2500            | -1.386   | 527                                 |
| 0.50  | 1.0000            | 0.000    | 487                                 |
| 0.80  | 4.0000            | 1.386    | 447                                 |
| 0.95  | 19.000            | 2.944    | 402                                 |

> Score range: **150 (rủi ro cao nhất) — 950 (rủi ro thấp nhất)**. Cao hơn = an toàn hơn.

### 5.2. Hyperparameters

#### XGBoost — Stage 1 (Non-linear Feature Learner)

| Parameter               | Giá trị | Lý do                                           |
| ----------------------- | ------- | ----------------------------------------------- |
| `n_estimators`          | 1500    | Nhiều cây hơn → leaf features đa dạng hơn cho LR |
| `max_depth`             | 6       | Balanced: đủ phức tạp nhưng không quá fit         |
| `learning_rate`         | 0.01    | Học chậm → mỗi cây đóng góp nhỏ, ổn định        |
| `subsample`             | 0.8     | Random 80% samples mỗi tree (giảm variance)     |
| `colsample_bytree`      | 0.8     | Random 80% features mỗi tree                    |
| `min_child_weight`      | 10      | Tránh split quá nhỏ                             |
| `gamma`                 | 0.3     | Penalize thêm độ phức tạp tree                   |
| `reg_alpha` (L1)        | 1.0     | L1 regularization                               |
| `reg_lambda` (L2)       | 3.0     | L2 regularization mạnh                          |
| `max_bin`               | 1024    | Histogram bins, tăng độ chính xác split          |
| `scale_pos_weight`      | auto    | Tính từ class ratio (neg/pos ≈ 4.1)             |
| `early_stopping_rounds` | 100     | Dừng nếu 100 rounds không cải thiện              |
| `tree_method`           | hist    | Histogram-based splitting (nhanh)                |

#### Logistic Regression — Stage 2 (Scorecard Generator)

| Parameter      | Giá trị  | Lý do                                                           |
| -------------- | -------- | --------------------------------------------------------------- |
| `C`            | 1.0      | Inverse regularization strength (L2)                            |
| `penalty`      | l2       | L2 regularization — giữ coefficients nhỏ và ổn định             |
| `class_weight` | balanced | Cân bằng class weight cho imbalanced data (19.61% default)      |
| `max_iter`     | 300      | Đủ iterations để hội tụ trên sparse matrix lớn                  |
| `solver`       | saga     | Tối ưu cho L2 + sparse data + large dataset                    |
| `tol`          | 1e-4     | Tolerance cho convergence                                       |

### 5.3. Train/Test Split

| Set       | Số mẫu        | Tỷ lệ default |
| --------- | ------------- | ------------- |
| **Train** | 316,824 (80%) | ~19.61%       |
| **Test**  | 79,206 (20%)  | ~19.61%       |

> Split sử dụng `stratify=y` để đảm bảo tỷ lệ default giống nhau giữa train và test.

### 5.4. Cross-Validation

- **Phương pháp**: 5-Fold StratifiedKFold
- **Scoring**: AUC-ROC
- **Pipeline mỗi fold**: Smart Scaling → XGBoost → Leaf Extract → OHE → LR → AUC

### 5.5. Training Pipeline — 9 bước

```
┌──────────────────────────────────────────────────────────────┐
│ [1/9]  Load & Clean Data (396,030 records)                    │
│ [2/9]  Train/Test Split (80/20, stratified)                   │
│ [3/9]  Smart Per-Feature Scaling (6 strategies, 15 features)  │
│ [4/9]  Stage 1: Train XGBoost (1500 trees)                    │
│ [5/9]  Extract Leaf Indices + OneHotEncode (sparse)           │
│ [6/9]  Stage 2: Train LR on [Leaf OHE + 15 Original]         │
│ [7/9]  Evaluate (12 metrics + Classification Report)          │
│        CV 5-Fold XGBoost+LR Pipeline                          │
│ [8/9]  Save Artifacts (5 files)                               │
│ [9/9]  Export 20 Charts                                       │
└──────────────────────────────────────────────────────────────┘
```

### 5.6. Artifacts được lưu

| File                         | Đường dẫn                           | Mô tả                                                  |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------- |
| `xgb_pd_model.json`          | `models/xgb_pd_model.json`          | XGBoost model (JSON format) — Stage 1                   |
| `lr_scorecard_model.joblib`  | `models/lr_scorecard_model.joblib`  | Logistic Regression model — Stage 2                     |
| `leaf_encoder.joblib`        | `models/leaf_encoder.joblib`        | OneHotEncoder cho leaf indices                          |
| `per_feature_scalers.joblib` | `models/per_feature_scalers.joblib` | 15 (strategy, scaler) tuples — Smart Scaling            |
| `metadata.json`              | `models/metadata.json`              | Metrics + scorecard params + scaling strategies + mapping |

> **Tổng cộng 5 artifact files** (giảm từ 8 files ở v4.0 — nhẹ hơn, nhanh hơn).

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
  "credit_score": 527,
  "status": "success"
}
```

### 6.3. Giải thích các trường Output

| Trường                | Kiểu   | Phạm vi             | Mô tả                                                                                                      |
| --------------------- | ------ | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `credit_score`        | int    | **150 – 950**       | Điểm tín dụng Scorecard. Cao hơn = an toàn hơn. Công thức: `Offset - Factor × ln(PD/(1-PD))`              |
| `ai_risk_score`       | int    | **0 – 100**         | Điểm rủi ro AI. 0 = rủi ro thấp nhất, 100 = rủi ro cao nhất. Tính bằng: `round(default_probability × 100)` |
| `default_probability` | float  | **0.0 – 1.0**       | Xác suất vỡ nợ (PD). 0.0 = không có khả năng vỡ nợ, 1.0 = chắc chắn vỡ nợ                                  |
| `status`              | string | "success" / "error" | Trạng thái xử lý                                                                                           |

### 6.4. Luồng Inference (Stage 1 → Stage 2 → Stage 3)

```python
# 1. Smart per-feature scaling (6 strategies)
X = apply_per_feature_scalers(X_raw, scalers, FEATURE_NAMES)
# VD: capital → log1p → StandardScaler
#     monthly_income → log1p → RobustScaler
#     dti → RobustScaler
#     purpose_enc → passthrough (giữ nguyên)

# 2. Stage 1: XGBoost → Leaf Indices
leaves = xgb_model.apply(X)          # shape: (1, n_trees)
L = leaf_encoder.transform(leaves)   # OneHot sparse

# 3. Stage 2: LR → PD
X_lr = hstack([L, X])                # Leaf OHE + 15 original
PD = lr_model.predict_proba(X_lr)[0, 1]

# 4. Stage 3: Scorecard → Credit Score
Score = 487.12 - 28.854 × ln(PD / (1 - PD))
Score = clip(Score, 150, 950)

# 5. Output
ai_risk_score = round(PD × 100)
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
        "credit_score": 561,
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
      "avg_credit_score": 495,
      "min_credit_score": 380,
      "max_credit_score": 561
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

Thay vì dùng threshold mặc định 0.5, model sử dụng **Youden's J index** để tìm threshold tối ưu:

$$J = \text{Sensitivity} + \text{Specificity} - 1 = \text{TPR} - \text{FPR}$$

$$\text{Optimal Threshold} = \arg\max_t (TPR(t) - FPR(t))$$

> Threshold tối ưu được lưu trong `metadata.json` → scorer tự động sử dụng.

### 7.3. 20 Biểu đồ đánh giá

| #   | Tên biểu đồ                            | File                                | Mô tả                                           |
| --- | -------------------------------------- | ----------------------------------- | ----------------------------------------------- |
| 1   | ROC Curve (XGBoost vs LR)              | `01_roc_curve.png`                  | ROC cho XGBoost raw vs LR Scorecard             |
| 2   | Precision-Recall Curve                 | `02_precision_recall_curve.png`     | PR curve cho 2 models                           |
| 3   | Confusion Matrix (Counts + Normalized) | `03_confusion_matrix.png`           | Ma trận nhầm lẫn absolute + %                   |
| 4   | Feature Importance (XGBoost)           | `04_feature_importance_xgb.png`     | XGBoost feature importance (Stage 1)            |
| 5   | PD Distribution (XGBoost vs LR)        | `05_pd_distribution.png`            | Phân phối PD cho 2 models (Paid vs Default)     |
| 6   | Calibration Curve                      | `06_calibration_curve.png`          | Calibration cho XGBoost vs LR                   |
| 7   | CV AUC per Fold                        | `07_cv_auc_per_fold.png`            | AUC từng fold 5-Fold CV                         |
| 8   | Threshold Sensitivity                  | `08_threshold_sensitivity.png`      | Prec/Rec/F1/Acc theo threshold                  |
| 9   | Score Distribution by Class            | `09_score_distribution.png`         | **Phân phối Credit Score: Paid vs Default**     |
| 10  | Model Comparison Bar Chart             | `10_model_comparison.png`           | So sánh XGBoost vs LR × 5 metrics              |
| 11  | Cumulative Gain & Lift Curve           | `11_gain_lift_curve.png`            | Gain + Lift curve (model vs random)             |
| 12  | KS Statistic                           | `12_ks_statistic.png`               | Kolmogorov-Smirnov TPR vs FPR                   |
| 13  | Architecture Diagram                   | `13_architecture.png`               | Sơ đồ kiến trúc 3 tầng (visual)                 |
| 14  | CV Fold Metrics Heatmap                | `14_cv_fold_heatmap.png`            | Heatmap metrics từng fold                       |
| 15  | Risk Band by Score                     | `15_risk_band_score.png`            | **5 nhóm rủi ro theo Credit Score + default %** |
| 16  | Feature Correlation Heatmap            | `16_feature_correlation.png`        | Tương quan 15 features (triangle heatmap)       |
| 17  | Scorecard Feature Points               | `17_scorecard_feature_points.png`   | **LR coef → Score points per feature**          |
| 18  | Score vs Default Rate                  | `18_score_vs_default_rate.png`      | **Credit Score vs Default Rate validation**     |
| 19  | Error Analysis (FP vs FN)              | `19_error_analysis.png`             | Phân tích FP vs FN theo Score Distribution      |
| 20  | Summary Dashboard                      | `20_summary_dashboard.png`          | Tổng hợp mini-charts + metrics table            |

### 7.4. So sánh hiệu năng: v4.0 (Hybrid Stacking) vs v5.0 (XGBoost + LR Scorecard)

| Tiêu chí                | v4.0 Hybrid Stacking (5+1 models) | v5.0 XGBoost + LR Scorecard (2 models)     |
| ----------------------- | ---------------------------------- | ------------------------------------------ |
| **Số models**           | 6                                  | 2                                          |
| **Chuẩn hóa**           | 15 StandardScaler giống nhau       | **Smart Scaling: 6 chiến lược khác nhau**  |
| **Output**              | PD + ai_risk_score                 | **PD + Credit Score (150-950) + ai_risk** |
| **Interpretability**    | Thấp (black box)                   | **Cao (LR coef → score points)**           |
| **Inference latency**   | Chậm (5 model tuần tự)            | **Nhanh (1 XGBoost + 1 LR sparse)**       |
| **Artifact size**       | 8 files                           | **5 files**                                |
| **Regulatory**          | Khó giải trình                     | **Chuẩn Basel II/III**                     |
| **Cross-Validation**    | 5 Outer × 5 Inner                  | 5-Fold StratifiedKFold                     |
| **Biểu đồ**             | 20 charts                          | 20 charts (3 mới cho Scorecard)            |

---

## 8. Tích hợp hệ thống P2P Lending

### 8.1. Kiến trúc tích hợp

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────────────────────┐
│  React Native│────→│  NestJS Backend  │────→│  AIScore Service                 │
│  Mobile App  │     │  (server_do_an_  │ POST│  FastAPI Port 8001               │
│  (Client)    │     │   new)           │ /api│                                  │
│              │←────│                  │←────│  XGBoost + LR Scorecard          │
│  Hiển thị    │     │  Lưu score +     │score│  Smart Per-Feature Scaling       │
│  Credit Score│     │  quyết định      │     │  Scorecard Formula → Credit Score│
│  + Risk Score│     │                  │     │                                  │
└─────────────┘     └──────────────────┘     └──────────────────────────────────┘
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

### 8.3. Cách sử dụng Credit Score & AI Risk Score

#### Theo Credit Score (150–950)

| Credit Score | Nhóm rủi ro    | Hành động hệ thống                    |
| ------------ | -------------- | ------------------------------------- |
| 700 – 950   | **Rất thấp**   | Tự động duyệt, lãi suất ưu đãi        |
| 600 – 699   | **Thấp**       | Duyệt nhanh, lãi suất thông thường    |
| 500 – 599   | **Trung bình** | Cần review thủ công, lãi suất cao hơn |
| 400 – 499   | **Cao**        | Yêu cầu tài sản bảo đảm, hạn mức thấp |
| 150 – 399   | **Rất cao**    | Từ chối hoặc yêu cầu thêm chứng từ    |

#### Theo AI Risk Score (0–100)

| AI Risk Score | Nhóm rủi ro    | Tương đương Credit Score |
| ------------- | -------------- | ----------------------- |
| 0 – 10        | **Rất thấp**   | ~700+                   |
| 11 – 25       | **Thấp**       | ~600–700                |
| 26 – 40       | **Trung bình** | ~500–600                |
| 41 – 60       | **Cao**        | ~400–500                |
| 61 – 100      | **Rất cao**    | ~150–400                |

### 8.4. Luồng xử lý trong NestJS

```typescript
// server_do_an_new/src/modules/loan/loan.service.ts
// Khi user tạo khoản vay:

1. Validate input → Kiểm tra delinquency policy
2. Gọi AIScore Service:
   POST http://localhost:8001/api/score
   Body: { credit_score, capital, monthly_income, ... }
3. Nhận response: { credit_score, ai_risk_score, default_probability }
4. Nếu credit_score < 400 → BadRequestException (từ chối)
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
  "service": "aiscore-service-v5-xgb-lr-scorecard",
  "model_loaded": true,
  "model_type": "XGBoost + Logistic Regression Scorecard (3-Stage)",
  "n_features": 15,
  "scaling": "smart_per_feature (6 strategies)",
  "scorecard": {
    "base_score": 600,
    "pdo": 20,
    "score_range": "150–950"
  },
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
  "model_type": "xgboost_lr_scorecard",
  "architecture": "XGBoost(leaf_indices) -> OneHotEncode -> LR(PD) -> Scorecard(Score)",
  "feature_names": ["credit_score", "capital", "monthly_income", ...],
  "n_features": 15,
  "scaling_strategies": {
    "credit_score": "standard",
    "capital": "log_standard",
    "monthly_income": "log_robust",
    "monthly_pay": "log_standard",
    "revolving_balance": "log_standard",
    "dti": "robust",
    "revolving_util_percent": "robust",
    "term_months": "standard",
    "emp_length_years": "minmax",
    "active_bad_debts": "robust",
    "bankruptcies": "robust",
    "active_loans": "standard",
    "total_loans_history": "standard",
    "home_ownership_enc": "passthrough",
    "purpose_enc": "passthrough"
  },
  "scorecard": {
    "base_score": 600,
    "pdo": 20,
    "base_odds": 50,
    "factor": 28.854,
    "offset": 487.12
  },
  "optimal_threshold": 0.XXXX,
  "test_metrics": {
    "xgb_raw_auc": 0.XXXX,
    "lr_auc": 0.XXXX,
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
  "cv_auc_mean": 0.XXXX,
  "cv_auc_std": 0.XXXX,
  "train_size": 316824,
  "test_size": 79206
}
```

> **Lưu ý**: Các giá trị metrics `0.XXXX` sẽ được điền sau khi chạy train trên Google Colab.

---

## 10. Kết luận

### 10.1. Tóm tắt

AIScore Service v5.0 sử dụng **XGBoost + Logistic Regression Scorecard** — phương pháp **tiêu chuẩn vàng ngành ngân hàng** — để dự đoán xác suất vỡ nợ (PD) và tính Credit Score cho hệ thống P2P Lending Việt Nam.

**Kết quả chính:**

- **Kiến trúc 3 tầng**: XGBoost → Leaf Extraction + OHE → LR → PD → Scorecard Formula → Credit Score
- **15 features** đầu vào (loại bỏ `interest_rate` vì là thông tin động)
- **Smart Per-Feature Scaling**: 6 chiến lược chuẩn hóa khác nhau (log_standard, log_robust, robust, standard, minmax, passthrough) — chọn theo phân phối dữ liệu thực tế
- **Scorecard Formula**: Score = 487.12 - 28.854 × ln(PD/(1-PD)), range 150–950
- **3 output**: `credit_score` (150-950) + `ai_risk_score` (0-100) + `default_probability` (0-1)
- **20 biểu đồ** đánh giá chi tiết (3 biểu đồ mới cho Scorecard)
- **Dữ liệu**: 396,030 khoản vay Lending Club, quy đổi VNĐ
- **Tỷ lệ vỡ nợ**: 19.61%

### 10.2. Cải thiện so với v4.0

| Tiêu chí           | v4.0 (Hybrid Stacking)        | v5.0 (XGBoost + LR Scorecard)         |
| ------------------ | ----------------------------- | -------------------------------------- |
| Kiến trúc          | 5 Base OOF + LR Meta (6 model) | **XGBoost + LR (2 model)**            |
| Chuẩn hóa          | 15 StandardScaler giống nhau  | **Smart: 6 chiến lược theo dữ liệu**  |
| Output             | PD + ai_risk_score            | **PD + Credit Score + ai_risk_score** |
| Giải thích được    | Thấp                          | **Cao (LR coef, score points)**        |
| Inference speed    | Chậm (5 model)               | **Nhanh (2 model)**                   |
| Artifact files     | 8                             | **5**                                 |
| Regulatory         | Khó giải trình                | **Chuẩn Basel II/III**                |
| Tiêu chuẩn ngành   | Kaggle stacking               | **Tiêu chuẩn vàng ngân hàng**         |

### 10.3. Hướng phát triển

1. **Thêm behavioral features**: Lịch sử trả nợ, login frequency, spending patterns → tăng AUC > 0.8
2. **WOE/IV binning**: Weight of Evidence binning cho LR → tăng interpretability
3. **Model monitoring**: Theo dõi drift, recalibrate định kỳ
4. **SHAP values**: Giải thích prediction cho từng case cụ thể
5. **Bayesian Hyperparameter Tuning**: Optuna cho tự động tune XGBoost
6. **Thêm dữ liệu VN thực tế**: Khi tích lũy đủ data từ hệ thống P2P, retrain trên dữ liệu thực

### 10.4. Cấu trúc Files — AIScore Service

```
aiscore_service/
├── app.py                    # FastAPI REST API (port 8001)
├── scorer.py                 # CreditScorer class — inference (XGB + LR + Scorecard)
├── train_model.py            # MEGA pipeline — train + charts + scorer (Colab)
├── requirements.txt          # Python dependencies
├── Dockerfile                # Docker build (production)
├── docker-compose.yml        # Docker compose
├── wsgi.py                   # WSGI/ASGI entry point
├── AI_MODEL_DOCUMENTATION.md # Tài liệu này
├── README.md                 # Hướng dẫn setup & API
├── models/                   # Model artifacts
│   ├── xgb_pd_model.json
│   ├── lr_scorecard_model.joblib
│   ├── leaf_encoder.joblib
│   ├── per_feature_scalers.joblib
│   └── metadata.json
└── docs/                     # Charts output (20 biểu đồ)
    ├── 01_roc_curve.png
    ├── 02_precision_recall_curve.png
    ├── ...
    └── 20_summary_dashboard.png
```

---

_Tài liệu được cập nhật cho AIScore Service v5.0 — XGBoost + LR Scorecard + Smart Per-Feature Scaling_
_Ngày cập nhật: 28/03/2026_
