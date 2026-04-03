# AIScore Service — Tài liệu mô hình AI chấm điểm tín dụng v11.0

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Dữ liệu đầu vào (Input Dataset)](#2-dữ-liệu-đầu-vào-input-dataset)
3. [Tiền xử lý dữ liệu (Preprocessing Pipeline)](#3-tiền-xử-lý-dữ-liệu-preprocessing-pipeline)
4. [Feature Selection — WOE Information Value](#4-feature-selection--woe-information-value)
5. [Kỹ thuật Feature Engineering & Smart Scaling](#5-kỹ-thuật-feature-engineering--smart-scaling)
6. [Huấn luyện mô hình Explainable Hybrid](#6-huấn-luyện-mô-hình-explainable-hybrid)
7. [Output — JSON trả về](#7-output--json-trả-về)
8. [Đánh giá mô hình (Evaluation)](#8-đánh-giá-mô-hình-evaluation)
9. [Tích hợp hệ thống P2P Lending — NestJS ↔ AIScore](#9-tích-hợp-hệ-thống-p2p-lending--nestjs--aiscore)
10. [credit_score → sub_grade → Grade → Tier — Mapping chi tiết](#10-credit_score--sub_grade--grade--tier--mapping-chi-tiết)
11. [API Endpoints](#11-api-endpoints)
12. [So sánh v9.0 → v11.0](#12-so-sánh-v90--v110)
13. [Kết luận](#13-kết-luận)

---

## 1. Tổng quan

| Thông tin          | Giá trị                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| **Tên service**    | AIScore Service v11.0                                                                               |
| **Mô hình**        | Explainable Hybrid — WOE+LR Scorecard ⊕ XGBoost + Isotonic Calibration                              |
| **Framework API**  | FastAPI + Uvicorn                                                                                   |
| **Ngôn ngữ**       | Python 3.11+                                                                                        |
| **Port**           | 8001                                                                                                |
| **Mục đích**       | Dự đoán xác suất vỡ nợ (PD) + giải thích minh bạch cho người vay trong hệ thống P2P Lending         |
| **Đơn vị tiền tệ** | VNĐ (quy đổi từ USD qua tỷ giá real-time: 26,258 VNĐ/USD)                                           |
| **Phương pháp**    | Hybrid: α·Scorecard_PD + (1-α)·XGBoost_PD → Isotonic Calibration → PD + ai_risk_score + Explanation |
| **Số features**    | **12** (9 numeric + 3 categorical) — lọc bằng IV ≥ 0.02 từ 25 features gốc                          |
| **Chuẩn hóa**      | Smart Per-Feature Scaling — 6 chiến lược (chỉ cho Nhánh 2 XGBoost)                                  |
| **Dataset**        | Lending Club accepted_2007_to_2018Q4.csv (2.26M rows → 1,345,310 mẫu qualified)                     |

### Kiến trúc Explainable Hybrid (2 nhánh song song)

```
25 Features gốc (21 Num + 4 Cat)
    │
    ├─── WOE Feature Selection ───► IV ≥ 0.02 → 12 features (loại 13 useless)
    │
    │      ┌───────────────────────────────────────────────────────┐
    │      │                                                       │
    ▼      ▼                                                       ▼
┌──────────────────────────┐                          ┌──────────────────────────┐
│ NHÁNH 1 — MINH BẠCH      │                          │ NHÁNH 2 — SỨC MẠNH       │
│                          │                          │                          │
│ WOE Binning (20 bins)    │                          │ Smart Per-Feature Scaling │
│     ↓                    │                          │ (6 strategies)            │
│ Logistic Regression      │                          │     ↓                    │
│ (C=1.0, L2, balanced)    │                          │ XGBoost (800 trees, d=5)  │
│     ↓                    │                          │ (lr=0.02, spw=4.01)       │
│ Scorecard Points         │                          │     ↓                    │
│ (base=600, pdo=20)       │                          │ XGB PD (0.0 – 1.0)       │
│     ↓                    │                          │     ↓                    │
│ Scorecard PD (0.0 – 1.0) │                          │ AUC = 0.7130             │
│ AUC = 0.7073             │                          │                          │
└───────────┬──────────────┘                          └───────────┬──────────────┘
            │                                                     │
            └───────────────────┬─────────────────────────────────┘
                                │
                                ▼
                ┌───────────────────────────────────┐
                │  Hybrid Blending:                  │
                │  PD = 0.05·SC_PD + 0.95·XGB_PD     │
                │  α = 0.05 (optimized via CV)       │
                └───────────────┬───────────────────┘
                                │
                                ▼
                ┌───────────────────────────────────┐
                │  Isotonic Calibration              │
                │  Brier: 0.2164 → 0.1447 (-33%)    │
                └───────────────┬───────────────────┘
                                │
                                ▼
                ┌───────────────────────────────────┐
                │  OUTPUT:                           │
                │  • ai_risk_score = round(PD × 100) │  ← 0–100
                │  • default_probability = PD        │  ← 0.0–1.0
                │  • scorecard_score (427–559)       │  ← giải thích
                │  • scorecard_explanation[]          │  ← từng factor
                └───────────────────────────────────┘
```

### Tại sao Explainable Hybrid thay vì Stacking (v9.0)?

| Tiêu chí                | v9.0 Stacking (XGB+SVM→LR)          | v11.0 Hybrid (WOE+LR ⊕ XGBoost)               |
| ----------------------- | ----------------------------------- | --------------------------------------------- |
| **Khả năng giải trình** | Hạn chế — LR Meta khó giải thích    | **Xuất sắc** — Scorecard giải thích từng điểm |
| **Regulatory**          | Black-box, khó đáp ứng quy định     | **White-box** — WOE+LR tuân thủ Basel II/III  |
| **Feature Selection**   | Giữ nguyên 25 features              | **Tự động loại 13 features yếu** (IV < 0.02)  |
| **Calibration**         | Brier = 0.2146                      | **Isotonic** → Brier = 0.1447 (cải thiện 33%) |
| **Dataset**             | 500K subsample                      | **1.345M rows** (toàn bộ dữ liệu qualified)   |
| **Transparency**        | Không biết tại sao model quyết định | **"Trừ 26 điểm vì credit_score ≤ 344"**       |

### Ý tưởng cốt lõi

- **Nhánh 1 — WOE + LR Scorecard (Minh bạch):** WOE Binning 20 bins → Logistic Regression → Scorecard points (base=600, pdo=20). Giải thích từng yếu tố: "+4 pts vì term 36 tháng", "-26 pts vì credit_score thấp"
- **Nhánh 2 — XGBoost (Sức mạnh):** Smart Scaling → 800 trees, depth 5, lr 0.02 → Bắt mọi non-linear interaction
- **Hybrid Blending:** α = 0.05 (5% Scorecard + 95% XGBoost) → AUC tối ưu 0.7171 (CV)
- **Isotonic Calibration:** Non-parametric calibrator → PD chính xác thống kê, Brier cải thiện 33%
- **Feature Selection:** WOE IV ≥ 0.02 tự động loại 13 features yếu → model gọn hơn, ít noise

---

## 2. Dữ liệu đầu vào (Input Dataset)

### 2.1. Nguồn dữ liệu

| Thông tin          | Giá trị                                               |
| ------------------ | ----------------------------------------------------- |
| **Dataset**        | Lending Club Loan Data (2007-2018 Q4)                 |
| **File chính**     | `accepted_2007_to_2018Q4.csv`                         |
| **Tổng bản ghi**   | **~2,260,000** khoản vay                              |
| **Sau lọc target** | **1,345,310** mẫu (chỉ Fully Paid + Charged Off)      |
| **Số cột gốc**     | **151 cột** (dùng 25 cột → WOE lọc còn 12)            |
| **File phụ**       | `rejected_2007_to_2018Q4.csv` (27.6M rows — EDA only) |

### 2.2. Các cột sử dụng từ CSV gốc (25 cột)

| #   | Tên cột LC                   | Mô tả                                 | → Feature v11.0            | Giữ/Loại           |
| --- | ---------------------------- | ------------------------------------- | -------------------------- | ------------------ |
| 1   | `sub_grade`                  | Hạng tín dụng chi tiết (A1→G5)        | `credit_score` (150-750)   | ✅ GIỮ (IV=0.493)  |
| 2   | `loan_amnt`                  | Số tiền vay (USD)                     | `capital` (VNĐ)            | ✅ GIỮ (IV=0.034)  |
| 3   | `annual_inc`                 | Thu nhập năm (USD)                    | `monthly_income` (VNĐ)     | ✅ GIỮ (IV=0.029)  |
| 4   | `installment`                | Trả góp/tháng (USD)                   | `monthly_pay` (VNĐ)        | ✅ GIỮ (IV=0.036)  |
| 5   | `revol_bal`                  | Dư nợ quay vòng (USD)                 | `revolving_balance` (VNĐ)  | ✗ LOẠI (IV=0.004)  |
| 6   | `tot_cur_bal`                | Tổng dư nợ tất cả TK (USD)            | `total_current_balance`    | ✅ GIỮ (IV=0.043)  |
| 7   | `dti`                        | Tỷ lệ Nợ/Thu nhập (%)                 | `dti`                      | ✅ GIỮ (IV=0.073)  |
| 8   | `revol_util`                 | % sử dụng hạn mức                     | `revolving_util_percent`   | ✅ GIỮ (IV=0.025)  |
| 9   | `emp_length`                 | Thời gian đi làm                      | `emp_length_years`         | ✗ LOẠI (IV=0.007)  |
| 10  | `pub_rec`                    | Hồ sơ nợ xấu công                     | `active_bad_debts`         | ✗ LOẠI (IV=0.006)  |
| 11  | `pub_rec_bankruptcies`       | Số lần phá sản                        | `bankruptcies`             | ✗ LOẠI (IV=0.004)  |
| 12  | `open_acc`                   | Tài khoản đang mở                     | `active_loans`             | ✗ LOẠI (IV=0.005)  |
| 13  | `total_acc`                  | Tổng tài khoản từng có                | `total_loans_history`      | ✗ LOẠI (IV=0.002)  |
| 14  | `earliest_cr_line`           | Ngày mở TK đầu tiên                   | `credit_history_months`    | ✗ LOẠI (IV=0.016)  |
| 15  | `inq_last_6mths`             | Truy vấn TD 6 tháng                   | `recent_inquiries`         | ✅ GIỮ (IV=0.027)  |
| 16  | `delinq_2yrs`                | Trễ hạn 2 năm                         | `delinquencies_2yr`        | ✗ LOẠI (IV=0.003)  |
| 17  | `acc_now_delinq`             | TK đang quá hạn hiện tại              | `accounts_delinquent`      | ✗ LOẠI (IV=0.0001) |
| 18  | `num_tl_90g_dpd_24m`         | TK 90+ ngày quá hạn / 24 tháng        | `severe_delinquencies_24m` | ✗ LOẠI (IV=0.002)  |
| 19  | `pct_tl_nvr_dlq`             | % TK chưa từng quá hạn                | `pct_never_delinquent`     | ✗ LOẠI (IV=0.003)  |
| 20  | `collections_12_mths_ex_med` | Thu hồi nợ 12 tháng                   | `collections_12m`          | ✗ LOẠI (IV=0.002)  |
| 21  | `term`                       | Kỳ hạn vay                            | `term_enc`                 | ✅ GIỮ (IV=0.175)  |
| 22  | `home_ownership`             | Hình thức nhà ở                       | `home_ownership_enc`       | ✅ GIỮ (IV=0.031)  |
| 23  | `verification_status`        | Trạng thái xác minh                   | `verification_status_enc`  | ✅ GIỮ (IV=0.051)  |
| 24  | `purpose`                    | Mục đích vay                          | `purpose_enc`              | ✗ LOẠI (IV=0.014)  |
| 25  | `loan_status`                | **TARGET** (Fully Paid / Charged Off) | `is_default` (0/1)         | —                  |

> **Lưu ý**: `int_rate` (lãi suất) bị loại — lãi suất là **động**, do nhân viên duyệt quyết định, không có sẵn tại thời điểm scoring.

### 2.3. Phân phối Target

| Trạng thái                       | Số mẫu     | Tỷ lệ       |
| -------------------------------- | ---------- | ----------- |
| **Fully Paid** (không vỡ nợ = 0) | ~1,076,718 | **~80.04%** |
| **Charged Off** (vỡ nợ = 1)      | ~268,592   | **~19.96%** |

### 2.4. Tại sao dùng toàn bộ 1.345M rows thay vì subsample?

v9.0 chỉ dùng 500K subsample do SVM cần O(n²) memory. v11.0 **loại bỏ SVM** → không còn bottleneck memory:

- WOE Binning + LR: O(n) memory, tuyến tính
- XGBoost histogram: O(n) memory, tiết kiệm
- Kết quả: train trên **2.69× nhiều data** → mô hình ổn định hơn, CV std giảm từ 0.0016 → 0.0013

---

## 3. Tiền xử lý dữ liệu (Preprocessing Pipeline)

### 3.1. Lọc Target (Chống Data Leakage)

```python
df = df[df["loan_status"].isin(["Fully Paid", "Charged Off"])]
df["is_default"] = (df["loan_status"] == "Charged Off").astype(int)
# Kết quả: 1,345,310 mẫu (từ ~2.26M gốc)
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
tot_cur_bal × VNĐ        →  total_current_balance
```

> **Lưu ý v11.0:** `revolving_balance` (revol_bal) không còn quy đổi vì bị loại (IV=0.004).

### 3.4. Parse các cột phức tạp

| Cột gốc                   | Xử lý                 | Kết quả                   |
| ------------------------- | --------------------- | ------------------------- |
| `term` = " 36 months"     | Regex extract `(\d+)` | `term_enc` = 36           |
| `home_ownership` = "RENT" | Ordinal encode        | `home_ownership_enc` = 0  |
| `verification_status`     | Ordinal encode        | `verification_status_enc` |

### 3.5. Xử lý Missing Values (12 features giữ lại)

| Feature                  | Phương pháp | Lý do                |
| ------------------------ | ----------- | -------------------- |
| `revolving_util_percent` | median      | Giữ phân phối gốc    |
| `total_current_balance`  | 0           | Không có dữ liệu = 0 |
| `recent_inquiries`       | 0           | Không truy vấn = 0   |

> 13 features bị loại (IV < 0.02) không cần xử lý missing — chúng bị loại trước khi vào model.

---

## 4. Feature Selection — WOE Information Value

### 4.1. Information Value là gì?

Information Value (IV) đo lường **sức mạnh dự đoán** của từng feature đối với target. Công thức:

$$IV = \sum_{i=1}^{n} (Good\%_i - Bad\%_i) \times WOE_i$$

$$WOE_i = \ln\left(\frac{Good\%_i}{Bad\%_i}\right)$$

| IV Range        | Phân loại             | Quyết định |
| --------------- | --------------------- | ---------- |
| IV < 0.02       | **Useless**           | ✗ LOẠI     |
| 0.02 ≤ IV < 0.1 | **Weak Predictive**   | ✅ GIỮ     |
| 0.1 ≤ IV < 0.3  | **Medium Predictive** | ✅ GIỮ     |
| IV ≥ 0.3        | **Strong Predictive** | ✅ GIỮ     |

### 4.2. Bảng IV — Toàn bộ 25 features (sắp xếp theo IV giảm dần)

| Hạng | Feature                    | IV         | Phân loại  | Quyết định |
| ---- | -------------------------- | ---------- | ---------- | ---------- |
| 1    | `credit_score`             | **0.4930** | **Strong** | ✅ GIỮ     |
| 2    | `term_enc`                 | **0.1747** | **Medium** | ✅ GIỮ     |
| 3    | `loan_to_income`           | **0.1213** | **Medium** | ✅ GIỮ     |
| 4    | `dti`                      | 0.0728     | Weak       | ✅ GIỮ     |
| 5    | `verification_status_enc`  | 0.0513     | Weak       | ✅ GIỮ     |
| 6    | `total_current_balance`    | 0.0426     | Weak       | ✅ GIỮ     |
| 7    | `monthly_pay`              | 0.0356     | Weak       | ✅ GIỮ     |
| 8    | `capital`                  | 0.0343     | Weak       | ✅ GIỮ     |
| 9    | `home_ownership_enc`       | 0.0314     | Weak       | ✅ GIỮ     |
| 10   | `monthly_income`           | 0.0295     | Weak       | ✅ GIỮ     |
| 11   | `recent_inquiries`         | 0.0265     | Weak       | ✅ GIỮ     |
| 12   | `revolving_util_percent`   | 0.0251     | Weak       | ✅ GIỮ     |
| 13   | `credit_history_months`    | 0.0159     | Useless    | ✗ LOẠI     |
| 14   | `purpose_enc`              | 0.0137     | Useless    | ✗ LOẠI     |
| 15   | `emp_length_years`         | 0.0069     | Useless    | ✗ LOẠI     |
| 16   | `active_bad_debts`         | 0.0061     | Useless    | ✗ LOẠI     |
| 17   | `active_loans`             | 0.0049     | Useless    | ✗ LOẠI     |
| 18   | `revolving_balance`        | 0.0043     | Useless    | ✗ LOẠI     |
| 19   | `bankruptcies`             | 0.0041     | Useless    | ✗ LOẠI     |
| 20   | `pct_never_delinquent`     | 0.0028     | Useless    | ✗ LOẠI     |
| 21   | `delinquencies_2yr`        | 0.0026     | Useless    | ✗ LOẠI     |
| 22   | `collections_12m`          | 0.0020     | Useless    | ✗ LOẠI     |
| 23   | `total_loans_history`      | 0.0019     | Useless    | ✗ LOẠI     |
| 24   | `severe_delinquencies_24m` | 0.0017     | Useless    | ✗ LOẠI     |
| 25   | `accounts_delinquent`      | 0.0001     | Useless    | ✗ LOẠI     |

### 4.3. Tại sao delinquency features bị loại?

**Phát hiện quan trọng:** Tất cả 6 features liên quan delinquency đều có IV < 0.007 trên Lending Club data:

- `accounts_delinquent` (IV=0.0001), `severe_delinquencies_24m` (IV=0.0017), `collections_12m` (IV=0.0020), `delinquencies_2yr` (IV=0.0026), `pct_never_delinquent` (IV=0.0028), `active_bad_debts` (IV=0.0061)

**Lý do:** Lending Club data có **rất ít variance** ở các cột này — đa số người vay có giá trị = 0. Trong hệ thống P2P thực tế tại Việt Nam, các features này sẽ có IV cao hơn khi được tính từ dữ liệu nội bộ.

**Quan trọng:** Scorer vẫn **nhận 25 features đầu vào** từ NestJS → 13 features bị loại khỏi model nhưng vẫn được ghi nhận để tương lai retrain.

### 4.4. 12 Features cuối cùng — Phân nhóm

| Nhóm                   | Features                                                           | Tổng IV |
| ---------------------- | ------------------------------------------------------------------ | ------- |
| **Tín dụng cốt lõi**   | credit_score                                                       | 0.4930  |
| **Khoản vay**          | term_enc, loan_to_income, capital, monthly_pay                     | 0.3659  |
| **Tài chính**          | dti, total_current_balance, monthly_income, revolving_util_percent | 0.1700  |
| **Xác minh/Nhân khẩu** | verification_status_enc, home_ownership_enc, recent_inquiries      | 0.1092  |

**Tổng IV:** 1.2051 (Strong tổng thể)

---

## 5. Kỹ thuật Feature Engineering & Smart Scaling

### 5.1. Bảng 12 Features cuối cùng

| #   | Tên Feature               | Nguồn gốc                    | Mô tả                | Đơn vị  | Scaling (Nhánh 2) |
| --- | ------------------------- | ---------------------------- | -------------------- | ------- | ----------------- |
| 1   | `credit_score`            | sub_grade → mapping          | Điểm tín dụng        | 150–750 | standard          |
| 2   | `capital`                 | loan_amnt × VNĐ              | Số tiền vay          | VNĐ     | log_standard      |
| 3   | `monthly_income`          | annual_inc / 12 × VNĐ        | Lương tháng          | VNĐ     | log_robust        |
| 4   | `monthly_pay`             | installment × VNĐ            | Trả góp/tháng        | VNĐ     | log_standard      |
| 5   | `total_current_balance`   | tot_cur_bal × VNĐ            | Tổng dư nợ tất cả TK | VNĐ     | log_standard      |
| 6   | `dti`                     | dti                          | Tỷ lệ Nợ/Thu nhập    | %       | robust            |
| 7   | `revolving_util_percent`  | revol_util                   | % sử dụng hạn mức    | %       | robust            |
| 8   | `recent_inquiries`        | inq_last_6mths               | Truy vấn TD gần đây  | count   | robust            |
| 9   | `loan_to_income`          | ENGINEERED                   | Tỷ lệ vay/thu nhập   | ratio   | log_robust        |
| 10  | `term_enc`                | term → parse                 | Kỳ hạn vay           | tháng   | passthrough       |
| 11  | `home_ownership_enc`      | home_ownership → encode      | Hình thức nhà ở      | ordinal | passthrough       |
| 12  | `verification_status_enc` | verification_status → encode | Mức xác minh         | ordinal | passthrough       |

### 5.2. Smart Per-Feature Scaling — 6 Chiến lược (Nhánh 2 — XGBoost)

| Strategy       | Pipeline                   | Dùng cho                                  |
| -------------- | -------------------------- | ----------------------------------------- |
| `log_standard` | log1p(x) → StandardScaler  | Tiền VNĐ lệch phải (capital, monthly_pay) |
| `log_robust`   | log1p(x) → RobustScaler    | Tiền VNĐ có outliers (monthly_income)     |
| `robust`       | RobustScaler (median, IQR) | %, zero-inflated (dti, recent_inquiries)  |
| `standard`     | StandardScaler (μ, σ)      | Phân phối gần normal (credit_score)       |
| `minmax`       | MinMaxScaler [0, 1]        | (không dùng trong v11.0)                  |
| `passthrough`  | Không transform            | Ordinal categorical (term_enc, etc.)      |

> **Nhánh 1 (WOE+LR)** không cần scaling — WOE Binning tự biến đổi mọi feature sang WOE values.

### 5.3. Encoding các biến phân loại

**Home Ownership:** RENT=0, OWN=1, MORTGAGE=2, OTHER/NONE/ANY=3  
**Verification Status:** Not Verified=0, Source Verified=1, Verified=2  
**Term:** Giữ nguyên giá trị numeric (36 hoặc 60)

---

## 6. Huấn luyện mô hình Explainable Hybrid

### 6.1. Nhánh 1 — WOE Binning + Logistic Regression → Scorecard

#### WOE Binning (Weight of Evidence)

WOE chia mỗi feature thành 20 bins, tính WOE cho mỗi bin:

$$WOE_i = \ln\left(\frac{Good\%_i}{Bad\%_i}\right)$$

- WOE > 0 → bin đó có nhiều Good hơn → rủi ro thấp
- WOE < 0 → bin đó có nhiều Bad hơn → rủi ro cao

#### Logistic Regression (trên WOE features)

| Parameter      | Giá trị  | Lý do                                       |
| -------------- | -------- | ------------------------------------------- |
| `C`            | 1.0      | Inverse regularization strength             |
| `penalty`      | l2       | L2 — giữ coefficients nhỏ, ổn định          |
| `class_weight` | balanced | Cân bằng cho imbalanced data (~20% default) |
| `max_iter`     | 300      | Converged tại iteration 21                  |
| `solver`       | saga     | Tối ưu cho L2 + dense dataset               |

#### Scorecard Conversion

$$\text{Score} = \text{Offset} - \text{Factor} \times \ln(\text{odds}) + \sum_{i} \text{Points}_i$$

| Parameter       | Giá trị   |
| --------------- | --------- |
| **Base Score**  | 600       |
| **PDO**         | 20        |
| **Factor**      | 28.8539   |
| **Offset**      | 487.1229  |
| **Score range** | 427 – 559 |
| **AUC**         | 0.7073    |

**Ví dụ giải thích Scorecard:**

```
Base Score:                                    600 điểm
─────────────────────────────────────────────────────────
⊖ credit_score: -26 pts    (≤ 344 → rủi ro rất cao)
⊖ term_enc: -7 pts         (60 tháng → rủi ro)
⊖ dti: -5 pts              (DTI > 30%)
⊕ loan_to_income: +3 pts   (tỷ lệ thấp → tốt)
⊕ monthly_income: +2 pts   (thu nhập cao)
... (các features khác)
─────────────────────────────────────────────────────────
= Score: 467 | PD: 0.78 (78%)
```

### 6.2. Nhánh 2 — XGBoost (Non-linear Pattern Detector)

XGBoost học pattern phi tuyến phức tạp từ 12 features (đã scaled). Output: `predict_proba` → PD.

| Parameter          | Giá trị    | Lý do                                     |
| ------------------ | ---------- | ----------------------------------------- |
| `n_estimators`     | **800**    | Đủ cây cho pattern phức tạp               |
| `max_depth`        | **5**      | Đủ phức tạp, tiết kiệm RAM                |
| `learning_rate`    | **0.02**   | Learning rate thấp + nhiều trees          |
| `subsample`        | 0.8        | 80% samples mỗi tree                      |
| `colsample_bytree` | 0.7        | 70% features mỗi tree                     |
| `min_child_weight` | 10         | Tránh split quá nhỏ                       |
| `gamma`            | 0.3        | Penalize phức tạp                         |
| `reg_alpha`        | 0.5        | L1 regularization                         |
| `reg_lambda`       | 2.0        | L2 regularization                         |
| `scale_pos_weight` | **4.01**   | Cân bằng class (neg/pos ≈ 4:1)            |
| `tree_method`      | hist       | CPU histogram-based (nhanh nhất trên CPU) |
| `device`           | cpu        | Dùng CPU                                  |
| **AUC**            | **0.7130** |                                           |

### 6.3. Hybrid Blending

$$\text{Hybrid PD} = \alpha \times \text{Scorecard PD} + (1-\alpha) \times \text{XGBoost PD}$$

α được tối ưu qua Cross-Validation (sweep 0.00 → 1.00, step 0.05):

| α        | CV AUC     | Ý nghĩa                       |
| -------- | ---------- | ----------------------------- |
| 0.00     | 0.7130     | 100% XGBoost                  |
| **0.05** | **0.7171** | **5% SC + 95% XGB → Optimal** |
| 0.10     | 0.7168     | Giảm dần                      |
| 1.00     | 0.7073     | 100% Scorecard                |

### 6.4. Isotonic Calibration

Sau blending, Isotonic Regression hiệu chuẩn PD thành xác suất thật:

- **Input:** Hybrid raw PD (under-calibrated ở vùng PD cao)
- **Output:** Calibrated PD (chính xác thống kê)
- **Brier Score:** 0.2164 → **0.1447** (cải thiện **33%**)

> Isotonic Regression là non-parametric → không giả định phân phối → phù hợp cho mọi shape.

### 6.5. Training Pipeline — 10 bước

```
[1/10]  Load & Clean Data (2.26M → 1,345,310 qualified)
[2/10]  Train/Test Split (80/20 stratified): 1,076,248 / 269,062
[3/10]  WOE Binning (20 bins per feature) → Calculate IV (25 features)
[4/10]  Feature Selection: IV ≥ 0.02 → 12 features (loại 13)
[5/10]  Branch 1: WOE Transform → LR → Scorecard (base=600, pdo=20)
[6/10]  Branch 2: Smart Per-Feature Scaling → XGBoost (800 trees)
[7/10]  Alpha Optimization: sweep α = 0.00→1.00 → best α = 0.05
[8/10]  Hybrid Blending: 0.05·SC_PD + 0.95·XGB_PD
[9/10]  Isotonic Calibration (train on OOF predictions)
[10/10] Save Artifacts (8 files) + Export 19 Charts
```

### 6.6. Artifacts (8 files)

| File                         | Mô tả                                          |
| ---------------------------- | ---------------------------------------------- |
| `xgb_pd_model.json`          | XGBoost Nhánh 2 (800 trees, 12 features)       |
| `lr_scorecard_model.joblib`  | LR Nhánh 1 (12 WOE features)                   |
| `woe_binning.joblib`         | WOE bin edges + WOE values (20 bins/feature)   |
| `per_feature_scalers.joblib` | 12 (strategy, scaler) tuples                   |
| `iso_calibrator.joblib`      | Isotonic Regression calibrator                 |
| `scorecard_table.json`       | Full scorecard points per bin (human-readable) |
| `metadata.json`              | Metrics + config + IV ranking + artifacts      |
| `test_predictions.csv`       | 269,062 test predictions (for validation)      |

---

## 7. Output — JSON trả về

### 7.1. API Request (Input từ NestJS)

```json
POST /api/score
Content-Type: application/json

{
    "credit_score": 580,
    "capital": 250000000,
    "monthly_income": 15000000,
    "monthly_pay": 7500000,
    "total_current_balance": 80000000,
    "dti": 22.0,
    "revolving_util_percent": 45.0,
    "recent_inquiries": 1,
    "term": 36,
    "home_ownership": "RENT",
    "verification_status": "Verified"
}
```

> **12 features bắt buộc.** `loan_to_income` tự tính: `capital / (monthly_income × 12)`.
>
> Scorer vẫn **nhận** 25 features (backward compatible) — 13 features thừa sẽ bị ignore trong model nhưng được logged.

### 7.2. API Response (Output) — v11.0

```json
{
  "ai_risk_score": 21,
  "default_probability": 0.2098,
  "scorecard_score": 543,
  "scorecard_explanation": [
    {
      "feature": "credit_score",
      "bin": "574-591",
      "points": 8,
      "direction": "positive"
    },
    {
      "feature": "term_enc",
      "bin": "36",
      "points": 4,
      "direction": "positive"
    },
    {
      "feature": "dti",
      "bin": "20.0-25.0",
      "points": -2,
      "direction": "negative"
    },
    {
      "feature": "loan_to_income",
      "bin": "0.20-0.30",
      "points": 1,
      "direction": "positive"
    }
  ],
  "status": "success"
}
```

### 7.3. Giải thích các trường Output

| Trường                  | Kiểu   | Phạm vi       | Mô tả                                                                       |
| ----------------------- | ------ | ------------- | --------------------------------------------------------------------------- |
| `ai_risk_score`         | int    | **0 – 100**   | Điểm rủi ro. 0 = rủi ro thấp nhất, 100 = rủi ro cao nhất. `round(PD × 100)` |
| `default_probability`   | float  | **0.0–1.0**   | Xác suất vỡ nợ (PD) sau Isotonic Calibration                                |
| `scorecard_score`       | int    | **427–559**   | Điểm Scorecard (WOE+LR). Điểm cao = rủi ro thấp                             |
| `scorecard_explanation` | array  | —             | Giải thích từng factor: feature, bin, points, direction                     |
| `status`                | string | success/error | Trạng thái xử lý                                                            |

### 7.4. Luồng Inference (Hybrid v11.0)

```python
# 1. Feature selection & preparation (12 features from 25 input)
X_12 = select_features(X_raw_25, IV_SELECTED_12)

# 2. Branch 1: WOE + LR → Scorecard PD
X_woe = woe_transform(X_12, woe_binning)        # WOE values
sc_pd = lr_model.predict_proba(X_woe)[0, 1]     # Scorecard PD
sc_score, sc_explanation = calc_scorecard(X_12)  # Points + explain

# 3. Branch 2: Smart Scaling → XGBoost PD
X_scaled = apply_per_feature_scalers(X_12, scalers)
xgb_pd = xgb_model.predict_proba(X_scaled)[0, 1]

# 4. Hybrid Blending
hybrid_raw = 0.05 * sc_pd + 0.95 * xgb_pd

# 5. Isotonic Calibration
pd_calibrated = iso_calibrator.predict([hybrid_raw])[0]

# 6. Output
ai_risk_score = round(pd_calibrated * 100)      # 0-100
```

---

## 8. Đánh giá mô hình (Evaluation)

> Kết quả trích xuất từ `models/metadata.json` và 19 biểu đồ trong `docs/`.  
> Test set: **269,062 mẫu** (20% holdout, stratified).

### 8.1. Tổng hợp Metrics — Test Set

| Metric          | WOE Scorecard | XGBoost | Hybrid (Final)          |
| --------------- | ------------- | ------- | ----------------------- |
| **AUC-ROC**     | 0.7073        | 0.7130  | **0.7129**              |
| **Accuracy**    | 0.6401        | 0.6421  | **0.6421**              |
| **Precision**   | 0.3125        | 0.3150  | **0.3150**              |
| **Recall**      | 0.6691        | 0.6749  | **0.6749**              |
| **F1-Score**    | 0.4260        | 0.4295  | **0.4295**              |
| **F2-Score**    | 0.5448        | 0.5494  | **0.5494**              |
| **MCC**         | 0.2440        | 0.2495  | **0.2495**              |
| **Brier Score** | 0.2183        | 0.2164  | **0.1447** (calibrated) |

### 8.2. Cross-Validation (5-Fold)

| Model      | CV AUC Mean | CV AUC Std  |
| ---------- | ----------- | ----------- |
| Scorecard  | 0.7073      | ±0.0013     |
| XGBoost    | 0.7128      | ±0.0013     |
| **Hybrid** | **0.7128**  | **±0.0013** |

**CV AUC (0.7128) ≈ Test AUC (0.7129)** → gap chỉ 0.001% → **không overfitting**.

### 8.3. Discriminatory Power

| Metric           | XGBoost | Scorecard | Hybrid |
| ---------------- | ------- | --------- | ------ |
| **KS Statistic** | 0.3101  | 0.3023    | 0.3098 |
| **Gini**         | 0.4260  | 0.4146    | 0.4258 |

KS > 0.3 và Gini > 0.4 → **acceptable** theo tiêu chuẩn banking (Basel II: AUC > 0.7 ✅).

### 8.4. Feature Importance — XGBoost Gain

| Hạng | Feature                   | Importance | IV     |
| ---- | ------------------------- | ---------- | ------ |
| 1    | `credit_score`            | **42.20%** | 0.4930 |
| 2    | `term_enc`                | **34.72%** | 0.1747 |
| 3    | `home_ownership_enc`      | 5.38%      | 0.0314 |
| 4    | `verification_status_enc` | 3.26%      | 0.0513 |
| 5    | `recent_inquiries`        | 3.06%      | 0.0265 |
| 6    | `loan_to_income`          | 2.74%      | 0.1213 |
| 7    | `dti`                     | 2.63%      | 0.0728 |
| 8    | `total_current_balance`   | 2.20%      | 0.0426 |
| 9    | `monthly_income`          | 1.22%      | 0.0295 |
| 10   | `monthly_pay`             | 0.94%      | 0.0356 |
| 11   | `capital`                 | 0.89%      | 0.0343 |
| 12   | `revolving_util_percent`  | 0.78%      | 0.0251 |

> **Top 2 features chiếm 76.92%** XGBoost importance.

### 8.5. 19 Biểu đồ đánh giá

| #   | File                              | Mục đích                               |
| --- | --------------------------------- | -------------------------------------- |
| 0   | `00_accepted_vs_rejected.png`     | So sánh phân phối approved vs rejected |
| 1   | `01_roc_curves.png`               | AUC comparison: XGB, Scorecard, Hybrid |
| 2   | `02_precision_recall.png`         | AP và trade-off Precision/Recall       |
| 3   | `03_score_distribution.png`       | Phân phối score Good vs Bad            |
| 4   | `04_confusion_matrices.png`       | TP/FP/TN/FN chi tiết                   |
| 5   | `05_calibration.png`              | Calibration + Brier score              |
| 6   | `06_feature_importance_xgb.png`   | XGBoost gain importance                |
| 7   | `07_iv_feature_importance.png`    | IV ranking — WOE feature selection     |
| 8   | `08_threshold_analysis.png`       | Threshold tối ưu F1/F2                 |
| 9   | `09_probability_distribution.png` | KDE phân bố PD theo class              |
| 10  | `10_score_by_credit_tier.png`     | Hybrid score boxplot theo credit tier  |
| 11  | `11_metrics_comparison.png`       | So sánh 6 metrics across 3 models      |
| 12  | `12_correlation_heatmap.png`      | Heatmap 12 features + 3 PD predictions |
| 13  | `13_cumulative_gains.png`         | Hiệu quả xếp hạng rủi ro               |
| 15  | `15_delinquency_impact.png`       | 6 features nợ xấu bị loại (IV < 0.02)  |
| 16  | `16_architecture_diagram.png`     | Sơ đồ kiến trúc Hybrid v11.0           |
| 18  | `18_scorecard_points.png`         | WOE points per bin (top 6 features)    |
| 19  | `19_ks_statistic.png`             | Phân tách CDF Good/Bad                 |

> Chi tiết phân tích từng biểu đồ → xem [MODEL_EVALUATION_REPORT.md](docs/MODEL_EVALUATION_REPORT.md).

---

## 9. Tích hợp hệ thống P2P Lending — NestJS ↔ AIScore

### 9.1. Luồng tổng quan

```
Client (React)
    │
    ▼  POST /api/loans/apply
NestJS Backend (Port 3000)
    │
    ├── credit-score.service.ts ──► Tính credit_score (150-750) từ 5 yếu tố
    │
    ├── loan.service.ts ──────────► POST /api/score → AIScore Service
    │                                   │
    │                    ◄──────────────┘ {ai_risk_score, PD, scorecard_score, explanation}
    │
    ├── Auto-Decision Logic:
    │   ├── ai_risk_score ≤ 40 → AUTO APPROVE
    │   ├── ai_risk_score ≥ 80 → AUTO REJECT
    │   └── 41-79 → MANUAL REVIEW
    │
    └── MongoDB: loan-application.schema.ts
        ├── aiScore: {pd, creditScore, grade, subGrade, tier, decision}
        └── interestRate (risk-based pricing từ grade)
```

### 9.2. Mapping 12 Features → Hệ thống P2P

| #   | Feature v11.0             | Hệ thống P2P (NestJS)                            | Schema/Entity              |
| --- | ------------------------- | ------------------------------------------------ | -------------------------- |
| 1   | `credit_score`            | `CreditScore.score` (150-750)                    | credit-score.schema.ts     |
| 2   | `capital`                 | `LoanApplication.capital` (VNĐ)                  | loan-application.schema.ts |
| 3   | `monthly_income`          | User thu nhập tháng / KYC data                   | user.schema.ts / kycData   |
| 4   | `monthly_pay`             | `LoanApplication.monthlyPay` (VNĐ)               | loan-application.schema.ts |
| 5   | `total_current_balance`   | `SUM(LoanApp.outstandingAmount)` WHERE disbursed | loan-application.schema.ts |
| 6   | `dti`                     | Tỷ lệ nợ/thu nhập                                | computed                   |
| 7   | `revolving_util_percent`  | % sử dụng hạn mức tín dụng                       | computed                   |
| 8   | `recent_inquiries`        | Count đơn vay mới 90 ngày                        | loan-application.schema.ts |
| 9   | `loan_to_income`          | `capital / (monthly_income × 12)` — auto         | —                          |
| 10  | `term_enc`                | `LoanApplication.periodMonth`                    | loan-application.schema.ts |
| 11  | `home_ownership_enc`      | KYC home ownership                               | kycData                    |
| 12  | `verification_status_enc` | `User.kycStatus`                                 | user.schema.ts             |

### 9.3. Backward Compatibility — 25 Features Input

Scorer vẫn **nhận 25 features** từ NestJS (backward compatible với v9.0):

```
capital           / loanAmount / loan_amnt
monthly_income    / monthlyIncome / annual_inc (÷12)
monthly_pay       / monthlyPay / monthlyPayment
total_current_balance / totalOutstandingAll / tot_cur_bal
accounts_delinquent   / currentDelinquentAccounts / acc_now_delinq
severe_delinquencies_24m / severeDelinquencies
pct_never_delinquent     / cleanLoanRatio
collections_12m          / collectionsLast12m
emp_length_years  / employmentYears / emp_length (string)
term              / periodMonth / term_months
credit_history_months / creditAge
delinquencies_2yr / latePayments / delinq_2yrs
```

13 features thừa (IV < 0.02) được nhận nhưng **không đưa vào model** — chúng chỉ được log.

### 9.4. credit_score (150-750) — Cách tính trong Backend

Backend NestJS tính credit_score qua **5-Factor Internal Model** (credit-score.service.ts):

| Yếu tố              | Trọng số | Cách tính                                       |
| ------------------- | -------- | ----------------------------------------------- |
| **Payment History** | 35%      | Khởi đầu 100, trừ penalty theo debt group (1-5) |
| **Debt Level**      | 30%      | Credit Utilization: ≤10%→100, >80%→10           |
| **Credit Age**      | 15%      | Months since first loan: ≥36m→100, <3m→10       |
| **Credit Mix**      | 10%      | Distinct products: ≥3→100, 1→40                 |
| **New Credit**      | 10%      | Recent 90-day loans: 0→100, ≥3→10               |

$$\text{credit\_score} = 150 + (0.35 \times P + 0.30 \times D + 0.15 \times A + 0.10 \times M + 0.10 \times N) \times 6$$

Scale: 150 (tệ nhất) → 750 (tốt nhất)

### 9.5. Auto-Decision Logic (loan.service.ts)

| ai_risk_score | PD Range    | Decision          | Action              |
| ------------- | ----------- | ----------------- | ------------------- |
| 0 – 20        | 0.00 – 0.20 | **AUTO APPROVE**  | Tự động duyệt       |
| 21 – 40       | 0.21 – 0.40 | **AUTO APPROVE**  | Tự động duyệt       |
| 41 – 60       | 0.41 – 0.60 | **MANUAL REVIEW** | Chuyển admin review |
| 61 – 80       | 0.61 – 0.80 | **MANUAL REVIEW** | Chuyển admin review |
| 81 – 100      | 0.81 – 1.00 | **AUTO REJECT**   | Tự động từ chối     |

### 9.6. Risk-Based Interest Rate

| Grade | ai_risk_score | Base Interest | Risk Premium |
| ----- | ------------- | ------------- | ------------ |
| **A** | 0 – 20        | 12% p.a.      | +0%          |
| **B** | 21 – 40       | 15% p.a.      | +3%          |
| **C** | 41 – 60       | 18% p.a.      | +6%          |
| **D** | 61 – 80       | 20-24% p.a.   | +8-12%       |

---

## 10. credit_score → sub_grade → Grade → Tier — Mapping chi tiết

### 10.1. Bảng Mapping đầy đủ

Bảng dưới đây mô tả cách `credit_score` (150-750) từ Backend NestJS được mapping sang sub_grade, Grade, Tier, và lãi suất:

| credit_score | sub_grade | Grade | Tier         | Base Interest | Scorecard WOE Points  |
| ------------ | --------- | ----- | ------------ | ------------- | --------------------- |
| 750          | A1        | **A** | **Platinum** | 12% p.a.      | +40 pts (max)         |
| 732          | A2        | **A** | **Platinum** | 12% p.a.      | +37 pts               |
| 715          | A3        | **A** | **Platinum** | 12% p.a.      | +35 pts               |
| 697          | A4        | **A** | **Platinum** | 12% p.a.      | +32 pts               |
| 679          | A5        | **A** | **Platinum** | 12% p.a.      | +28 pts               |
| 662          | B1        | **B** | **Gold**     | 15% p.a.      | +18 pts               |
| 644          | B2        | **B** | **Gold**     | 15% p.a.      | +15 pts               |
| 626          | B3        | **B** | **Gold**     | 15% p.a.      | +11 pts               |
| 609          | B4        | **B** | **Gold**     | 15% p.a.      | +8 pts                |
| 591          | B5        | **B** | **Gold**     | 15% p.a.      | +4 pts                |
| **574**      | **C1**    | **C** | **Silver**   | 18% p.a.      | **0 pts (ranh giới)** |
| 556          | C2        | **C** | **Silver**   | 18% p.a.      | -3 pts                |
| 538          | C3        | **C** | **Silver**   | 18% p.a.      | -6 pts                |
| 521          | C4        | **C** | **Silver**   | 18% p.a.      | -9 pts                |
| 503          | C5        | **C** | **Silver**   | 18% p.a.      | -12 pts               |
| 485          | D1        | **D** | **Basic**    | 20% p.a.      | -15 pts               |
| ≤ 344        | E4+       | E-G   | ❌ Reject    | —             | -26 pts (min)         |

> **Ranh giới quan trọng:** credit_score ≈ **574** (C1/B5) = điểm chuyển từ trừ → cộng trên WOE Scorecard.

### 10.2. Cách mapping hoạt động

```
Backend NestJS                          AIScore Service
─────────────────                       ──────────────────
1. Tính credit_score = 620             1. Nhận credit_score = 620
   (5-factor model)                    2. WOE Binning: bin "609-626"
                                       3. WOE value → LR → Scorecard: +11 pts
2. POST /api/score                     4. XGBoost: + non-linear prediction
   {credit_score: 620, ...}            5. Hybrid: 0.05×SC + 0.95×XGB
                                       6. Isotonic → PD = 0.18
3. Nhận: {                             7. ai_risk_score = 18
     ai_risk_score: 18,                8. scorecard_score = 532
     PD: 0.18,                         9. explanation: [
     scorecard_score: 532                   "credit_score: +11 pts (609-626)",
   }                                        "term: +4 pts (36 tháng)",
                                            ...
4. grade = "B" (credit_score 620)         ]
   sub_grade = "B3"
   tier = "Gold"
   interestRate = 15%
```

### 10.3. Tại sao mapping cần 2 hệ thống?

| Hệ thống                  | Mục đích                   | Dùng cho                      |
| ------------------------- | -------------------------- | ----------------------------- |
| **Backend credit_score**  | Xếp hạng tổng quát (Grade) | Lãi suất, tier, investor view |
| **AIScore PD**            | Xác suất vỡ nợ chính xác   | Auto-decision, risk pricing   |
| **Scorecard explanation** | Giải trình cho borrower    | Compliance, transparency      |

Backend credit_score = **đánh giá tín dụng tổng thể** (payment history, credit age, etc.)  
AIScore PD = **xác suất vỡ nợ cụ thể** cho khoản vay này (dựa trên credit_score + 11 factors khác)

Hai hệ thống **bổ trợ nhau**: credit_score đặt context chung, AIScore tinh chỉnh cho từng khoản vay.

---

## 11. API Endpoints

| Method | Endpoint             | Mô tả                                        |
| ------ | -------------------- | -------------------------------------------- |
| POST   | `/api/score`         | Score 1 borrower → PD + risk_score + explain |
| POST   | `/api/score/batch`   | Score nhiều borrower (max 100)               |
| GET    | `/api/health`        | Health check + model info                    |
| GET    | `/api/model/info`    | Full metadata & metrics                      |
| GET    | `/api/exchange-rate` | Tỷ giá USD→VND hiện tại                      |
| POST   | `/api/model/retrain` | Retrain model (off-peak only)                |

### Batch Response

```json
{
  "status": "success",
  "data": {
    "results": [
      {
        "ai_risk_score": 15,
        "default_probability": 0.15,
        "scorecard_score": 543,
        "scorecard_explanation": [...],
        "status": "success",
        "index": 0
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

## 12. So sánh v9.0 → v11.0

| Tiêu chí                | v9.0 Stacking               | v11.0 Hybrid                                   | Thay đổi                   |
| ----------------------- | --------------------------- | ---------------------------------------------- | -------------------------- |
| **Architecture**        | XGB + SVM → LR Meta         | WOE+LR ⊕ XGBoost + Isotonic                    | Simpler, transparent       |
| **Models**              | 3 (XGB + SVM + LR Meta)     | 4 (WOE + LR + XGB + Isotonic)                  | +1 model, -SVM             |
| **Features**            | 25 (all)                    | **12** (IV ≥ 0.02)                             | Loại 13 useless            |
| **Dataset**             | 500K (subsample)            | **1.345M** (full)                              | 2.69× data                 |
| **AUC**                 | 0.7213                      | 0.7129                                         | -0.84% (stricter features) |
| **Calibration (Brier)** | 0.2146                      | **0.1447** (Isotonic)                          | **+33% better**            |
| **Explainability**      | ❌ None                     | ✅ **Full Scorecard**                          | Major gain                 |
| **Regulatory**          | ⚠️ Black-box                | ✅ **Basel II approved (WOE+LR)**              | Critical for VN market     |
| **SVM contribution**    | weight = -0.024 (near zero) | **Removed entirely**                           | Honest simplification      |
| **Artifacts**           | 5 files                     | **8 files** (+scorecard, +isotonic)            | +3 new files               |
| **Output**              | PD + ai_risk_score          | PD + ai_risk_score + **scorecard explanation** | +2 new fields              |
| **Inference latency**   | ~15ms (3 models sequential) | ~10ms (2 branches + blend)                     | -33% faster                |

---

## 13. Kết luận

### v11.0 — Kết quả đạt được

| Metric                 | Giá trị thực tế   | Đạt Basel II? | Đánh giá                       |
| ---------------------- | ----------------- | ------------- | ------------------------------ |
| **Hybrid AUC**         | **0.7129**        | ✅ (>0.7)     | Acceptable cho credit scoring  |
| **KS Statistic**       | **0.3098**        | ✅ (>0.25)    | Phân tách Good/Bad tốt         |
| **Gini**               | **0.4258**        | ✅ (>0.3)     | Moderate discriminatory power  |
| **CV AUC**             | **0.7128±0.0013** | ✅            | Không overfitting              |
| **Brier (calibrated)** | **0.1447**        | ✅            | PD rất chính xác sau calibrate |
| **Recall**             | **67.49%**        | —             | Bắt 2/3 ca vỡ nợ               |
| **Explainability**     | Full Scorecard    | ✅            | Giải thích từng yếu tố         |

### v11.0 — Điểm nổi bật

| Cải tiến                       | Chi tiết                                                            |
| ------------------------------ | ------------------------------------------------------------------- |
| **Full Explainability**        | WOE Scorecard giải thích từng yếu tố: "+15 pts vì credit_score tốt" |
| **IV-based Feature Selection** | Tự động loại 13 features yếu → model gọn hơn, ít noise              |
| **Isotonic Calibration**       | Brier cải thiện 33% → PD chính xác thống kê                         |
| **Full Dataset Training**      | 1.345M mẫu (2.69× so với v9.0) → ổn định hơn                        |
| **No SVM Overhead**            | Loại SVM (contribution gần 0) → inference nhanh hơn 33%             |
| **Dual Output**                | AI PD (accuracy) + Scorecard points (transparency) trong 1 response |
| **Basel II Compliance**        | WOE+LR = chuẩn vàng banking → sẵn sàng regulatory tại VN            |
| **Backward Compatible**        | Scorer vẫn nhận 25 features → NestJS không cần thay đổi API call    |

### Hạn chế & Hướng phát triển

| Hạn chế hiện tại                               | Hướng cải thiện                                |
| ---------------------------------------------- | ---------------------------------------------- |
| AUC ~0.71 (moderate, chưa đạt >0.8)            | Thêm features từ VN payment history            |
| Delinquency features bị loại (IV thấp trên LC) | Retrain với dữ liệu VN → IV cao hơn            |
| Precision ~31.5% → nhiều false positive        | Giảm threshold xuống 0.35 (Best F2)            |
| Data từ Lending Club (US market)               | Retrain/fine-tune với dữ liệu Việt Nam         |
| Top 2 features chiếm 76.92% importance         | Thêm behavioral features (transaction, social) |

---

> **Phiên bản mô hình: v11.0 — Explainable Hybrid (WOE+LR Scorecard ⊕ XGBoost + Isotonic Calibration).**  
> **12 features (IV ≥ 0.02) | 1,345,310 mẫu | AUC 0.7129 | Brier 0.1447 | Full Scorecard Explanation.**
