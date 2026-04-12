# AIScore — Tài liệu Kỹ thuật Mô hình AI

## Mục lục

1. [Tổng quan Kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Dữ liệu & Tiền xử lý](#2-dữ-liệu--tiền-xử-lý)
3. [Đặc trưng (Features)](#3-đặc-trưng-features)
4. [Kiến trúc Triple-Branch Stacking](#4-kiến-trúc-triple-branch-stacking)
5. [Huấn luyện & Tối ưu](#5-huấn-luyện--tối-ưu)
6. [Đánh giá Mô hình](#6-đánh-giá-mô-hình)
7. [Phân tích Chi tiết từ Biểu đồ](#7-phân-tích-chi-tiết-từ-biểu-đồ)
8. [API Endpoints](#8-api-endpoints)
9. [Tích hợp NestJS](#9-tích-hợp-nestjs)
10. [Credit Score & Tier System](#10-credit-score--tier-system)
11. [Artifacts & Triển khai](#11-artifacts--triển-khai)

---

## 1. Tổng quan Kiến trúc

**AIScore** là hệ thống chấm điểm tín dụng AI cho nền tảng P2P Lending, sử dụng kiến trúc **Triple-Branch Stacking Ensemble**:

```
48 Features (42 Numeric + 6 Categorical)
         ├──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
   Nhánh 1: Scorecard  Nhánh 2: XGBoost  Nhánh 3: LightGBM
   (WOE → LR, 32 feat) (Scaled, 48 feat)  (Scaled, 48 feat)
         │                  │                  │
         ▼                  ▼                  ▼
      SC_pd              XGB_pd            LGBM_pd
         └──────────────────┼──────────────────┘
                            ▼
                   Meta-LR (Level 2)
                            ▼
                  Isotonic Calibration
                            ▼
                     PD → ai_risk_score
```

**Ưu điểm kiến trúc:**
- **Nhánh 1 (Minh bạch):** WOE-Scorecard giải thích rành mạch — "Trừ 50 điểm vì 2 khoản nợ trễ"
- **Nhánh 2 (Sức mạnh):** XGBoost nắm bắt quan hệ phi tuyến phức tạp
- **Nhánh 3 (Bổ sung):** LightGBM (GOSS) bổ sung góc nhìn khác biệt
- **Meta-LR:** Học trọng số tối ưu tự động thay vì blend cố định

![Kiến trúc hệ thống](charts/16_architecture_diagram.png)

---

## 2. Dữ liệu & Tiền xử lý

### 2.1 Nguồn dữ liệu

| Thuộc tính | Giá trị |
|---|---|
| Dataset | Lending Club accepted_2007_to_2018Q4.csv |
| Tổng records | ~2,260,000 (accepted, có nhãn) |
| Biến mục tiêu | `loan_status` → binary (0=Good, 1=Default) |
| Tỷ lệ Default | ~20% (imbalanced) |

### 2.2 Train/Test Split

| Tập | Số mẫu |
|---|---|
| Tổng sau lọc | 1,345,310 |
| Train (80%) | 1,076,248 |
| Test (20%) | 269,062 |

### 2.3 Xử lý mất cân bằng (SMOTE)

Áp dụng **RUS + BorderlineSMOTE** trên tập train:

- **Random Under-Sampling (RUS):** Giảm class majority
- **BorderlineSMOTE:** Tạo mẫu tổng hợp ở vùng biên quyết định
- **sampling_strategy:** 0.5 (tỷ lệ minority/majority sau resampling)
- **Kết quả:** 1,076,248 → 661,067 mẫu cân bằng (chỉ dùng cho train, test giữ nguyên)

### 2.4 Smart Scaling

Mỗi feature được scale bằng strategy riêng tối ưu:

| Strategy | Features tiêu biểu |
|---|---|
| `log_standard` | capital, monthly_pay, revolving_balance |
| `log_robust` | monthly_income, loan_to_income, income_per_loan |
| `robust` | dti, active_bad_debts, delinquencies_2yr |
| `standard` | active_loans, pct_never_delinquent, interest_rate |
| `minmax` | emp_length_years |
| `passthrough` | term_enc, grade_enc, sub_grade_enc (categorical) |

---

## 3. Đặc trưng (Features)

### 3.1 Tổng quan: 48 Features

| Nhóm | Số lượng | Mô tả |
|---|---|---|
| Base Numeric | 20 | Thông tin tài chính cơ bản từ hồ sơ vay |
| Interaction | 6 | Tỷ lệ tương tác giữa các biến cơ bản |
| Power | 8 | Biến phi tuyến nâng cao (squared, rate, accumulation) |
| High-Signal | 8 | Biến có IV cao (interest_rate, credit_limit, v.v.) |
| Categorical | 6 | Mã hóa danh mục (grade, term, purpose, v.v.) |
| **Tổng** | **48** | |

### 3.2 Chi tiết Features

**Base Numeric (20):**
```
capital, monthly_income, monthly_pay, revolving_balance,
total_current_balance, dti, revolving_util_percent, emp_length_years,
active_bad_debts, bankruptcies, active_loans, total_loans_history,
credit_history_months, recent_inquiries, delinquencies_2yr,
accounts_delinquent, severe_delinquencies_24m, pct_never_delinquent,
collections_12m, loan_to_income
```

**Interaction (6):**
```
payment_burden = monthly_pay / (monthly_income + 1)
balance_income_ratio = total_current_balance / (monthly_income × 12 + 1)
revolving_concentration = revolving_balance / (total_current_balance + 1)
delinquency_severity = delinquencies_2yr + 2×accounts_delinquent + 3×severe_delinquencies_24m
inquiry_per_account = recent_inquiries / (active_loans + 1)
credit_quality_depth = credit_history_months × pct_never_delinquent / 100
```

**Power (8):**
```
income_per_loan, risk_accumulation, term_loan_risk, dti_squared,
score_utilization, installment_income_term, delinquency_rate,
net_monthly_cashflow
```

**High-Signal (8):**
```
interest_rate, revolving_credit_limit, months_since_delinquency,
new_accounts_12m, mortgage_accounts, total_credit_limit,
rate_loan_risk, credit_headroom_pct
```

**Categorical (6):**
```
term_enc, home_ownership_enc, verification_status_enc,
purpose_enc, grade_enc, sub_grade_enc
```

### 3.3 Feature Selection cho Scorecard

Scorecard chỉ giữ **32/48 features** có IV ≥ 0.02. Loại bỏ 16 features có IV thấp:

```
Loại bỏ: revolving_balance (0.004), emp_length_years (0.009),
active_bad_debts (0.003), bankruptcies (0.002), total_loans_history (0.001),
credit_history_months (0.015), delinquencies_2yr (0.001),
accounts_delinquent (0.002), severe_delinquencies_24m (0.001),
pct_never_delinquent (0.004), collections_12m (0.007),
delinquency_severity (0.002), credit_quality_depth (0.016),
delinquency_rate (0.002), months_since_delinquency (0.006),
purpose_enc (0.019)
```

> **Lưu ý:** XGBoost và LightGBM sử dụng đầy đủ 48 features.

### 3.4 Top Features theo IV

![Information Value — Feature Importance](charts/07_iv_feature_importance.png)

Top 10 features có IV cao nhất:

| # | Feature | IV |
|---|---|---|
| 1 | sub_grade_enc | 0.506 |
| 2 | interest_rate | 0.470 |
| 3 | grade_enc | 0.428 |
| 4 | rate_loan_risk | 0.330 |
| 5 | score_utilization | 0.315 |
| 6 | term_enc | 0.218 |
| 7 | installment_income_term | 0.198 |
| 8 | term_loan_risk | 0.196 |
| 9 | loan_to_income | 0.116 |
| 10 | new_accounts_12m | 0.096 |

### 3.5 Top Features theo XGBoost Gain

![XGBoost Feature Importance (Gain)](charts/06_feature_importance_xgb.png)

| # | Feature | Gain |
|---|---|---|
| 1 | grade_enc | 0.6717 |
| 2 | sub_grade_enc | 0.1519 |
| 3 | term_enc | 0.0357 |
| 4 | rate_loan_risk | 0.0216 |
| 5 | verification_status_enc | 0.0112 |

> **Nhận xét:** `grade_enc` chiếm ~67% tổng gain của XGBoost — cho thấy hạng tín dụng là yếu tố quyết định mạnh nhất. `sub_grade_enc` bổ sung thêm ~15%. Hai biến này cùng nhau chiếm >82% sức mạnh dự đoán.

---

## 4. Kiến trúc Triple-Branch Stacking

### 4.1 Nhánh 1 — WOE Scorecard (Minh bạch)

| Thuộc tính | Giá trị |
|---|---|
| Phương pháp | WOE Binning (20 bins) → LogisticRegressionCV |
| Features | 32 (IV ≥ 0.02) |
| Regularization | L2, C=0.01, solver=saga |
| Class weight | balanced |
| Intercept | 0.005005 |
| AUC (test) | **0.7109** |
| Total IV | 3.8934 |

**Pipeline:**
1. Raw features → WOE Binning (20 bins mỗi feature)
2. WOE values → Logistic Regression (L2 regularized)
3. LR coefficients → Scorecard points
4. Output: `scorecard_pd` (xác suất vỡ nợ)

**Scorecard Parameters:**
- Base Score: 600
- PDO (Points to Double Odds): 20
- Factor: 28.8539
- Offset: 487.1229

![Scorecard Points — Top 6 Features](charts/18_scorecard_points.png)

> **Phân tích:** Biểu đồ cho thấy `sub_grade_enc` (IV=0.506) có biên độ điểm lớn nhất (-30 đến +40), `interest_rate` (IV=0.470) phạt nặng lãi suất cao (>22.95% bị trừ ~10 điểm). `grade_enc` có pattern rõ ràng: grade cao (>5 = A,B) được cộng điểm, grade thấp (≤2 = F,G) bị trừ mạnh.

### 4.2 Nhánh 2 — XGBoost (Sức mạnh)

| Thuộc tính | Giá trị |
|---|---|
| Phương pháp | XGBClassifier + Optuna HP tuning |
| Features | 48 (all) |
| Eval metric | aucpr (Area Under PR Curve) |
| AUC (test) | **0.7195** |

**Hyperparameters (Optuna-tuned):**

| Parameter | Value |
|---|---|
| n_estimators (trained) | 1,401 |
| max_depth | 5 |
| learning_rate | 0.0546 |
| subsample | 0.9109 |
| colsample_bytree | 0.7078 |
| min_child_weight | 43 |
| gamma | 0.0538 |
| reg_alpha | 2.6203 |
| reg_lambda | 5.1773 |
| scale_pos_weight | 3.1228 |

**Monotonic Constraints:** Có — đảm bảo grade cao hơn luôn có PD thấp hơn.

### 4.3 Nhánh 3 — LightGBM (Bổ sung)

| Thuộc tính | Giá trị |
|---|---|
| Phương pháp | LGBMClassifier (GOSS boosting) |
| Features | 48 (all) |
| Objective | binary_logloss |
| AUC (test) | **0.7197** |
| n_estimators | 1,175 |
| scale_pos_weight | 3.34 |

> **Vai trò:** LightGBM sử dụng GOSS (Gradient-based One-Side Sampling) — khác biệt cơ bản với XGBoost, giúp Meta-LR có thêm góc nhìn đa dạng về dữ liệu.

### 4.4 Level 2 — Meta-LR Stacking

| Thuộc tính | Giá trị |
|---|---|
| Input | [SC_pd, XGB_pd, LGBM_pd] |
| Model | LogisticRegression |
| Intercept | -2.8425 |
| Coef (SC) | -0.0372 |
| Coef (XGB) | 2.0783 |
| Coef (LGBM) | 2.5690 |

**Phân tích trọng số Meta-LR:**
- **LightGBM (2.569):** Trọng số cao nhất → Meta-LR tin tưởng LightGBM nhất
- **XGBoost (2.078):** Trọng số cao thứ hai → bổ sung mạnh cho LightGBM
- **Scorecard (-0.037):** Trọng số gần 0 → Scorecard đóng vai trò "tham chiếu minh bạch" hơn là đóng góp dự đoán trực tiếp
- **Intercept (-2.843):** Bias âm lớn → baseline thận trọng, đòi hỏi evidence mạnh từ base models

### 4.5 Isotonic Calibration

Sau Meta-LR, xác suất được hiệu chỉnh bằng **Isotonic Regression** để PD phản ánh chính xác tần suất default thực tế.

![Calibration Curves](charts/05_calibration.png)

| Model | Brier Score |
|---|---|
| XGBoost | 0.2723 |
| Scorecard | 0.2138 |
| **Stacked (calibrated)** | **0.2116** |

> **Nhận xét:** Stacked model sau Isotonic calibration có Brier score thấp nhất (0.2116), cho thấy xác suất được hiệu chỉnh chính xác nhất. Đường calibration của Stacked bám sát đường chéo lý tưởng hơn các model đơn lẻ.

---

## 5. Huấn luyện & Tối ưu

### 5.1 Pipeline Huấn luyện

```
CSV → Clean → Feature Engineering (48 feat) → Train/Test Split (80/20)
  → RUS + BorderlineSMOTE (train only) → 661,067 balanced samples
  → [Branch 1: WOE→LR | Branch 2: Optuna→XGB | Branch 3: LGBM]
  → Meta-LR (stacking on test fold predictions)
  → Isotonic Calibration → Save 10 Artifacts + 21 Charts
```

### 5.2 Optuna Hyperparameter Tuning (XGBoost)

- **Framework:** Optuna (TPE sampler)
- **Metric tối ưu:** F1-score trên validation
- **Số trials:** Tự động (convergence-based)
- **Search space:** max_depth [3,8], learning_rate [0.01,0.3], subsample [0.5,1.0], v.v.

### 5.3 Cross-Validation

| Metric | Mean ± Std |
|---|---|
| Stacked AUC | 0.7346 ± 0.0007 |
| Stacked F1 | 0.5552 ± 0.0006 |
| Scorecard AUC | 0.7213 |
| XGBoost AUC | 0.7338 |
| Folds | 3 (StratifiedKFold) |

> **Nhận xét:** Độ lệch chuẩn cực thấp (σ = 0.0007) cho thấy model rất ổn định, không overfitting.

---

## 6. Đánh giá Mô hình

### 6.1 So sánh Tổng quan (threshold = 0.50)

| Metric | Scorecard | XGBoost | LightGBM | **Stacked** |
|---|---|---|---|---|
| AUC-ROC | 0.7109 | 0.7195 | 0.7197 | **0.7200** |
| Accuracy | 0.6508 | 0.5302 | 0.5063 | **0.6394** |
| Precision | 0.3183 | 0.2758 | 0.2648 | **0.3157** |
| Recall | 0.6558 | 0.8326 | 0.8563 | **0.6909** |
| F1-Score | 0.4285 | 0.4144 | 0.4092 | **0.4334** |
| MCC | 0.2481 | 0.2347 | 0.2291 | **0.2558** |
| Brier | 0.2138 | 0.2723 | 0.2834 | **0.2116** |
| KS Statistic | 0.3061 | 0.3178 | — | **0.3186** |
| Avg Precision | 0.3750 | 0.3865 | — | **0.3875** |

### 6.2 Confusion Matrix — Stacked (threshold = 0.50)

|  | Predicted Good (0) | Predicted Default (1) |
|---|---|---|
| **Actual Good (0)** | TN = 134,926 | FP = 80,424 |
| **Actual Default (1)** | FN = 16,603 | TP = 37,109 |

![Confusion Matrices](charts/04_confusion_matrices.png)

**Phân tích:**
- **Recall = 69.09%** — Phát hiện 37,109 / 53,712 khoản vay vỡ nợ
- **FPR = 37.34%** — 80,424 khoản vay tốt bị từ chối nhầm
- **NPV = 89.05%** — Trong số khoản được duyệt (TN+FN), 89% thực sự tốt
- **FN cost ước tính:** 16,603 × 100 triệu = **1,660.3 tỷ VND** (mất vốn)
- **FP cost ước tính:** 80,424 × 10 triệu = **804.2 tỷ VND** (mất cơ hội)

### 6.3 Ngưỡng (Threshold)

- **Ngưỡng chuẩn:** t = 0.50 (dùng cho đánh giá và so sánh)
- **Ngưỡng F1-optimized:** t = 0.466 (tối ưu từ cross-validation, tuỳ chọn cho production)
- **Best F2 thresholds:** XGB@0.44, SC@0.33, Stacked@0.34

> Ở ngưỡng t=0.466: Recall tăng lên 73.80%, F1=0.4288, F2=0.5728 — ưu tiên phát hiện default hơn.

![Threshold Analysis](charts/08_threshold_analysis.png)

### 6.4 Tổng kết

![Summary Dashboard](charts/21_summary_dashboard.png)

**Stacked model đạt AUC=0.7200** — cao nhất trong tất cả các nhánh, khẳng định stacking cải thiện kết quả. Brier score 0.2116 (thấp nhất) cho thấy xác suất được hiệu chỉnh tốt nhất. MCC=0.2558 cũng cao nhất, phản ánh khả năng phân loại cân bằng giữa hai class.

---

## 7. Phân tích Chi tiết từ Biểu đồ

### 7.1 ROC Curves

![ROC Curves](charts/01_roc_curves.png)

Ba model có AUC rất gần nhau (0.7109 – 0.7200), với Stacked nhỉnh hơn nhẹ. Đường ROC cho thấy tất cả model đều vượt xa random baseline (0.5).

### 7.2 Precision-Recall Curves

![Precision-Recall Curves](charts/02_precision_recall.png)

Average Precision: XGB=0.3865, SC=0.3750, Stacked=0.3875. PR curve phản ánh thách thức của dữ liệu imbalanced — precision giảm nhanh khi tăng recall.

### 7.3 Score Distribution

![Score Distribution](charts/03_score_distribution.png)

Phân bố điểm cho thấy sự tách biệt giữa nhóm Good và Default, với vùng overlap ở khoảng giữa — đây là vùng mà model khó phân loại nhất.

### 7.4 KS Statistic

![KS Statistic](charts/19_ks_statistic.png)

| Model | KS |
|---|---|
| XGBoost | 0.3178 |
| Scorecard | 0.3061 |
| **Stacked** | **0.3186** |

KS > 0.30 cho tất cả models — đạt tiêu chuẩn ngành tài chính cho credit scoring.

### 7.5 Metrics Comparison

![Metrics Comparison](charts/11_metrics_comparison.png)

Biểu đồ bar so sánh trực quan các metrics giữa 3 nhánh + Stacked tại threshold=0.50.

### 7.6 Cumulative Gains

![Cumulative Gains](charts/13_cumulative_gains.png)

Đường cumulative gains cho thấy: kiểm tra 40% hồ sơ có score rủi ro cao nhất sẽ phát hiện được ~60-65% tổng số default — hiệu quả gấp ~1.6 lần so với random.

### 7.7 Probability Distribution

![Probability Distribution](charts/09_probability_distribution.png)

### 7.8 Score by Credit Tier

![Score by Credit Tier](charts/10_score_by_credit_tier.png)

### 7.9 Correlation Heatmap

![Correlation Heatmap](charts/12_correlation_heatmap.png)

### 7.10 Score Stability

![Score Stability](charts/14_score_stability.png)

### 7.11 Delinquency Impact

![Delinquency Impact](charts/15_delinquency_impact.png)

### 7.12 XGB vs Scorecard PD

![XGB vs Scorecard PD](charts/17_xgb_vs_scorecard_pd.png)

### 7.13 WOE Patterns

![WOE Patterns](charts/20_woe_patterns.png)

---

## 8. API Endpoints

### 8.1 Base URL

```
http://localhost:8000
```

### 8.2 Endpoints

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/score` | Chấm điểm 1 borrower |
| POST | `/api/score/batch` | Chấm điểm batch (max 100) |
| GET | `/api/model/info` | Metadata & metrics |
| GET | `/api/health` | Health check |
| GET | `/api/exchange-rate` | Tỷ giá USD→VND |
| POST | `/api/model/retrain` | Retrain model |

### 8.3 POST /api/score — Request

```json
{
  "credit_score": 650,
  "loanAmount": 50000000,
  "monthly_income": 15000000,
  "monthly_pay": 3000000,
  "revolving_balance": 5000000,
  "total_current_balance": 20000000,
  "dti": 20.0,
  "revolving_util_percent": 45.0,
  "emp_length_years": 5,
  "active_bad_debts": 0,
  "bankruptcies": 0,
  "active_loans": 3,
  "total_loans_history": 8,
  "credit_history_months": 120,
  "recent_inquiries": 1,
  "delinquencies_2yr": 0,
  "accounts_delinquent": 0,
  "severe_delinquencies_24m": 0,
  "pct_never_delinquent": 100,
  "collections_12m": 0,
  "periodMonth": 36,
  "home_ownership": "MORTGAGE",
  "verification_status": "Verified",
  "purpose": "debt_consolidation"
}
```

### 8.4 POST /api/score — Response

```json
{
  "ai_risk_score": 21,
  "default_probability": 0.2098,
  "input_grade": "C",
  "input_sub_grade": "C1",
  "status": "success"
}
```

**Giải thích output:**
- `ai_risk_score`: 0–100 (0 = rủi ro thấp, 100 = rủi ro cao)
- `default_probability`: PD sau Isotonic calibration (0.0 – 1.0)
- `input_grade` / `input_sub_grade`: Grade/Sub-grade derive từ `credit_score`

### 8.5 Input Fields

| Field | Type | Range | Mô tả |
|---|---|---|---|
| credit_score | float | 150–750 | Điểm tín dụng CIC → auto derive grade/sub_grade |
| loanAmount (capital) | float | >0 | Số tiền vay (VND) |
| monthly_income | float | ≥0 | Thu nhập hàng tháng |
| monthly_pay | float | ≥0 | Trả góp hàng tháng |
| dti | float | 0–100 | Tỷ lệ Nợ/Thu nhập (%) |
| revolving_util_percent | float | 0–150 | % sử dụng hạn mức tín dụng |
| emp_length_years | float | 0–10 | Số năm đi làm |
| active_bad_debts | int | 0–20 | Số hồ sơ nợ xấu |
| bankruptcies | int | 0–10 | Số lần phá sản |
| active_loans | int | 0–50 | Số khoản vay đang mở |
| delinquencies_2yr | int | 0–20 | Số lần trễ hạn 2 năm |
| periodMonth (term) | int | 36/60 | Kỳ hạn vay (tháng) |
| home_ownership | string | RENT/OWN/MORTGAGE/OTHER | Tình trạng nhà ở |
| verification_status | string | Not Verified/Source Verified/Verified | Mức xác minh eKYC |
| purpose | string | — | Mục đích vay |

### 8.6 Feature Aliases (NestJS Compatibility)

Scorer hỗ trợ alias tiếng Việt:

```
so_tien_vay → capital
thu_nhap_hang_thang → monthly_income
tra_hang_thang → monthly_pay
diem_tin_dung → credit_score
ky_han_thang → term_enc
loai_nha_o → home_ownership_enc
...
```

---

## 9. Tích hợp NestJS

### 9.1 Flow tích hợp

```
NestJS (server_do_an_new)
  → POST /api/score (FastAPI - aiscore_service)
  → CreditScorer.predict(features)
  → Return {ai_risk_score, default_probability, status}
```

### 9.2 credit_score → grade/sub_grade Mapping

AIScore tự động chuyển đổi `credit_score` (150–750) thành `grade` (A–G) và `sub_grade` (A1–G5):

| credit_score | Grade | Sub-grade |
|---|---|---|
| 750 | A | A1 |
| 697 | A | A4 |
| 650 | B | ~B2 |
| 574 | C | C1 |
| 485 | D | D1 |
| 397 | E | E1 |
| 309 | F | F1 |
| 221 | G | G1 |
| 150 | G | G5 |

### 9.3 Encoding Maps

```
Grade Encoding: A=6, B=5, C=4, D=3, E=2, F=1, G=0
Sub-grade Encoding: G5=0, G4=1, ..., A1=34
Home Ownership: RENT=0, OWN=1, MORTGAGE=2, OTHER=3
Verification: Not Verified=0, Source Verified=1, Verified=2
Term: Passthrough (36 hoặc 60)
```

---

## 10. Credit Score & Tier System

### 10.1 PD → Credit Score

```python
FACTOR = PDO / ln(2) = 20 / 0.6931 = 28.8539
OFFSET = BASE_SCORE - FACTOR × ln(BASE_ODDS) = 600 - 28.8539 × ln(50) = 487.12

score = OFFSET - FACTOR × ln(PD / (1 - PD))
score = clip(score, 150, 950)
```

### 10.2 Tier System

| Tier | Score Range | Ý nghĩa |
|---|---|---|
| Excellent | 750+ | Rủi ro rất thấp |
| Good | 650–749 | Rủi ro thấp |
| Fair | 550–649 | Rủi ro trung bình |
| Poor | 450–549 | Rủi ro cao |
| Very Poor | < 450 | Rủi ro rất cao |

---

## 11. Artifacts & Triển khai

### 11.1 Model Artifacts (10 files)

| File | Mô tả |
|---|---|
| `xgb_pd_model.json` | XGBoost Level 1 model |
| `lgbm_pd_model.txt` | LightGBM Level 1 model |
| `lr_scorecard_model.joblib` | WOE-LR Scorecard Level 1 |
| `woe_binning.joblib` | WOE bin edges + maps |
| `meta_lr.joblib` | Meta-LR Level 2 (stacking) |
| `iso_calibrator.joblib` | Isotonic calibration |
| `per_feature_scalers.joblib` | Per-feature scaling strategies |
| `scorecard_table.json` | Human-readable scorecard points |
| `metadata.json` | Metrics, config, feature lists |
| `test_predictions.csv` | Test set predictions |

### 11.2 Charts (21 files)

Tất cả charts được generate tự động bởi `generate_charts.py` và lưu trong `charts/`:

| # | File | Nội dung |
|---|---|---|
| 01 | roc_curves.png | ROC curves (AUC comparison) |
| 02 | precision_recall.png | PR curves (AP comparison) |
| 03 | score_distribution.png | Score distribution by class |
| 04 | confusion_matrices.png | Confusion matrices (thr=0.50) |
| 05 | calibration.png | Calibration curves + Brier |
| 06 | feature_importance_xgb.png | XGBoost gain importance |
| 07 | iv_feature_importance.png | Information Value ranking |
| 08 | threshold_analysis.png | Threshold optimization |
| 09 | probability_distribution.png | PD distribution |
| 10 | score_by_credit_tier.png | Score by tier boxplot |
| 11 | metrics_comparison.png | Metrics bar comparison |
| 12 | correlation_heatmap.png | Feature correlation |
| 13 | cumulative_gains.png | Cumulative gains chart |
| 14 | score_stability.png | Score stability analysis |
| 15 | delinquency_impact.png | Delinquency impact |
| 16 | architecture_diagram.png | System architecture |
| 17 | xgb_vs_scorecard_pd.png | XGB vs SC scatter |
| 18 | scorecard_points.png | Scorecard points (top 6 IV) |
| 19 | ks_statistic.png | KS statistic curves |
| 20 | woe_patterns.png | WOE transformation patterns |
| 21 | summary_dashboard.png | Summary dashboard |

### 11.3 Docker Deployment

```yaml
# docker-compose.yml
services:
  aiscore:
    build: .
    ports:
      - "8000:8000"
    environment:
      - MODEL_DIR=models
      - USD_TO_VND=25000
```

### 11.4 Tech Stack

| Component | Technology |
|---|---|
| API Framework | FastAPI + Uvicorn |
| ML Libraries | XGBoost, LightGBM, scikit-learn |
| HP Tuning | Optuna |
| Resampling | imbalanced-learn (SMOTE) |
| Serialization | joblib, JSON |
| Container | Docker |
| WSGI | Gunicorn + Uvicorn workers |

---

*Tài liệu được cập nhật dựa trên metadata.json v19.1.0 và kết quả đánh giá tại threshold=0.50.*
