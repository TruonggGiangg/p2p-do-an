"""
╔══════════════════════════════════════════════════════════════════════════╗
║  AIScore — XGBoost + LR SCORECARD (Google Colab)  v8.0                 ║
║  Dataset: Lending Club — accepted + rejected (2007-2018 Q4)            ║
║  Train + Evaluate + Score + 20 Charts — ALL IN ONE FILE                ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  ARCHITECTURE — 2 STAGES (Gold Standard: Banking / Fintech):           ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━            ║
║                                                                        ║
║  Stage 1 — XGBoost (Non-linear Feature Learner):                       ║
║    XGBoost GPU → Leaf Indices → OneHotEncode (sparse)                  ║
║    Purpose: Learn non-linear interactions between features             ║
║                                                                        ║
║  Stage 2 — Logistic Regression (PD Generator):                         ║
║    Input: [Leaf OHE + 25 Original Features]                            ║
║    Output: PD (Probability of Default) — naturally calibrated          ║
║                                                                        ║
║  25 FEATURES (Lending Club → mapped to P2P system):                    ║
║    NUMERIC (21): credit_score, capital, monthly_income, monthly_pay,   ║
║                  revolving_balance, total_current_balance, dti,         ║
║                  revolving_util_percent, emp_length_years,              ║
║                  active_bad_debts, bankruptcies, active_loans,          ║
║                  total_loans_history, credit_history_months,            ║
║                  recent_inquiries, delinquencies_2yr,                   ║
║                  accounts_delinquent, severe_delinquencies_24m,         ║
║                  pct_never_delinquent, collections_12m,                 ║
║                  loan_to_income                                         ║
║    CATEGORY (4): term_enc, home_ownership_enc,                         ║
║                  verification_status_enc, purpose_enc                   ║
║                                                                        ║
║  DATA SOURCE:                                                          ║
║    accepted_2007_to_2018Q4.csv — 2.26M rows (labeled: train)          ║
║    rejected_2007_to_2018Q4.csv — 27.6M rows (EDA / comparison only)   ║
║                                                                        ║
║  OUTPUT: 5 Artifacts + 20 Charts + Metadata JSON                       ║
║    xgb_pd_model.json, lr_scorecard_model.joblib, leaf_encoder.joblib,  ║
║    per_feature_scalers.joblib, metadata.json                           ║
╚══════════════════════════════════════════════════════════════════════════╝
"""

# ══════════════════════════════════════════════════════════
# CELL 0: Mount Google Drive + Install
# ══════════════════════════════════════════════════════════
from google.colab import drive
drive.mount('/content/drive')

import subprocess, sys
def install(pkg):
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", pkg])

import os
import gc
import warnings
import time
import numpy as np
import pandas as pd
import xgboost as xgb
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import seaborn as sns
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import (
    StandardScaler, RobustScaler, MinMaxScaler, OneHotEncoder,
)
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, classification_report, confusion_matrix,
    brier_score_loss, log_loss, roc_curve, precision_recall_curve,
    average_precision_score, matthews_corrcoef, balanced_accuracy_score,
    cohen_kappa_score,
)
from sklearn.calibration import calibration_curve
from scipy.sparse import hstack, csr_matrix
import joblib
import json

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)

# ===================== CONFIG =====================
RANDOM_STATE = 42
N_FOLDS = 5

DATA_DIR = "/content/drive/MyDrive/Colab Notebooks"
ACCEPTED_CSV = os.path.join(DATA_DIR, "accepted_2007_to_2018Q4.csv")
REJECTED_CSV = os.path.join(DATA_DIR, "rejected_2007_to_2018Q4.csv")
MODEL_DIR = os.path.join(DATA_DIR, "models")
CHART_DIR = os.path.join(DATA_DIR, "charts")

DEFAULT_RATE = 25_000

# ── Scorecard Parameters — used for analysis/charts ONLY ──
BASE_SCORE = 600
PDO = 20
BASE_ODDS = 50
FACTOR = PDO / np.log(2)                          # ≈ 28.854
OFFSET = BASE_SCORE - FACTOR * np.log(BASE_ODDS)  # ≈ 487.12

print(f"[config] Architecture: XGBoost (leaf) + LR (PD) — Gold Standard")
print(f"[config] Features: 25 (21 numeric + 4 categorical)")
print(f"[config] Data: accepted + rejected Lending Club (2007-2018 Q4)")
print(f"[config] Scorecard (analysis only): Base={BASE_SCORE}, PDO={PDO}, Factor={FACTOR:.3f}")

# Model colors
COLORS = {
    'xgb':    '#2196F3',  # Blue
    'lr':     '#4CAF50',  # Green
    'hybrid': '#E91E63',  # Pink
}
MODEL_LABELS = {
    'xgb':    'XGBoost (leaf extractor)',
    'lr':     'LR Scorecard',
    'hybrid': 'XGBoost + LR',
}


# ===================== SCORECARD FORMULA (analysis only) =====================
def pd_to_score(pd_arr):
    """PD (0-1) → Credit Score (150-950) for charts/analysis. NOT in API output."""
    pd_c = np.clip(np.asarray(pd_arr, dtype=np.float64), 1e-15, 1 - 1e-15)
    odds = pd_c / (1 - pd_c)
    scores = OFFSET - FACTOR * np.log(odds)
    return np.clip(scores, 150, 950)


def score_to_pd(score_arr):
    """Credit Score → PD (for chart validation)."""
    s = np.asarray(score_arr, dtype=np.float64)
    log_odds = (OFFSET - s) / FACTOR
    odds = np.exp(log_odds)
    return odds / (1 + odds)


# ===================== UTILITIES =====================
def fetch_usd_to_vnd() -> tuple:
    env_val = os.environ.get("USD_TO_VND")
    if env_val:
        return float(env_val), "env"
    import urllib.request, json as _json
    apis = [
        ("https://open.er-api.com/v6/latest/USD", lambda d: d.get("rates", {}).get("VND")),
        ("https://api.exchangerate-api.com/v4/latest/USD", lambda d: d.get("rates", {}).get("VND")),
    ]
    for url, extractor in apis:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "aiscore-service/8.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = _json.loads(resp.read().decode())
                rate = extractor(data)
                if rate and float(rate) > 0:
                    return float(rate), url.split("/")[2]
        except Exception:
            continue
    return float(DEFAULT_RATE), "fallback"

USD_TO_VND, _RATE_SOURCE = fetch_usd_to_vnd()
print(f"[config] Exchange rate: 1 USD = {USD_TO_VND:,.0f} VND (source: {_RATE_SOURCE})")


# ═══════════════════════════════════════════════════════════════════════
# 25 FEATURES — 21 NUMERIC + 4 CATEGORICAL
# ═══════════════════════════════════════════════════════════════════════
#
# NUMERIC (21) — VND context, mapped to P2P system fields:
# | #  | Feature                    | LC Column                   | System Field                             |
# |----|----------------------------|-----------------------------|------------------------------------------|
# | 1  | credit_score               | sub_grade → mapping         | CreditScore.score (150-750)              |
# | 2  | capital                    | loan_amnt × VND             | LoanApplication.capital                  |
# | 3  | monthly_income             | annual_inc/12 × VND         | User monthly income                      |
# | 4  | monthly_pay                | installment × VND           | LoanApplication.monthlyPay               |
# | 5  | revolving_balance          | revol_bal × VND             | revolving outstanding                    |
# | 6  | total_current_balance      | tot_cur_bal × VND           | SUM(LoanApp.outstandingAmount) [NEW]     |
# | 7  | dti                        | dti                         | Debt-to-Income ratio                     |
# | 8  | revolving_util_percent     | revol_util                  | Credit utilization %                     |
# | 9  | emp_length_years           | emp_length → parse          | KYC employment years                     |
# | 10 | active_bad_debts           | pub_rec                     | LoanDelinquency count                    |
# | 11 | bankruptcies               | pub_rec_bankruptcies        | Bankruptcy history                       |
# | 12 | active_loans               | open_acc                    | Active loan count                        |
# | 13 | total_loans_history        | total_acc                   | CreditScore.totalLoans                   |
# | 14 | credit_history_months      | earliest_cr_line            | Credit age (User.createdAt)              |
# | 15 | recent_inquiries           | inq_last_6mths              | Recent loan app count                    |
# | 16 | delinquencies_2yr          | delinq_2yrs                 | CreditScore.latePayments                 |
# | 17 | accounts_delinquent        | acc_now_delinq              | Current delinquent accounts [NEW]        |
# | 18 | severe_delinquencies_24m   | num_tl_90g_dpd_24m          | 90+ DPD in 24m (debtGroup 3-5) [NEW]    |
# | 19 | pct_never_delinquent       | pct_tl_nvr_dlq              | % loans never delinquent [NEW]           |
# | 20 | collections_12m            | collections_12_mths_ex_med  | Debt collection actions 12m [NEW]        |
# | 21 | loan_to_income             | ENGINEERED                  | capital / annual_income                  |
#
# CATEGORICAL (4) — passthrough:
# | #  | Feature                 | LC Column           | System Field                  |
# |----|-------------------------|---------------------|-------------------------------|
# | 22 | term_enc                | term                | LoanApplication.periodMonth   |
# | 23 | home_ownership_enc      | home_ownership      | KYC data                      |
# | 24 | verification_status_enc | verification_status | User.kycStatus                |
# | 25 | purpose_enc             | purpose             | Loan purpose                  |
#
# TARGET: loan_status → "Charged Off" = 1, "Fully Paid" = 0
# ═══════════════════════════════════════════════════════════════════════

NUMERIC_FEATURES = [
    "credit_score", "capital", "monthly_income", "monthly_pay",
    "revolving_balance", "total_current_balance", "dti",
    "revolving_util_percent", "emp_length_years", "active_bad_debts",
    "bankruptcies", "active_loans", "total_loans_history",
    "credit_history_months", "recent_inquiries", "delinquencies_2yr",
    "accounts_delinquent", "severe_delinquencies_24m",
    "pct_never_delinquent", "collections_12m", "loan_to_income",
]

CATEGORICAL_FEATURES = [
    "term_enc", "home_ownership_enc", "verification_status_enc",
    "purpose_enc",
]

FEATURE_NAMES = NUMERIC_FEATURES + CATEGORICAL_FEATURES  # 25

# Columns to read from accepted CSV
ACCEPTED_USECOLS = [
    "sub_grade", "loan_amnt", "installment", "term", "emp_length",
    "home_ownership", "annual_inc", "verification_status", "loan_status",
    "purpose", "dti", "revol_util", "open_acc", "pub_rec",
    "pub_rec_bankruptcies", "total_acc", "revol_bal",
    "earliest_cr_line", "inq_last_6mths", "delinq_2yrs",
    # NEW columns for delinquency/debt features
    "tot_cur_bal", "acc_now_delinq", "num_tl_90g_dpd_24m",
    "pct_tl_nvr_dlq", "collections_12_mths_ex_med",
]

# ── sub_grade → credit_score (150-750) mapping ──
SUBGRADE_SCORE_MAP = {
    'A1': 750, 'A2': 732, 'A3': 715, 'A4': 697, 'A5': 679,
    'B1': 662, 'B2': 644, 'B3': 626, 'B4': 609, 'B5': 591,
    'C1': 574, 'C2': 556, 'C3': 538, 'C4': 521, 'C5': 503,
    'D1': 485, 'D2': 468, 'D3': 450, 'D4': 432, 'D5': 415,
    'E1': 397, 'E2': 379, 'E3': 362, 'E4': 344, 'E5': 326,
    'F1': 309, 'F2': 291, 'F3': 274, 'F4': 256, 'F5': 238,
    'G1': 221, 'G2': 203, 'G3': 185, 'G4': 168, 'G5': 150,
}

# ── Encoding maps ──
HOME_MAP = {"RENT": 0, "OWN": 1, "MORTGAGE": 2, "OTHER": 3, "NONE": 3, "ANY": 3}
VERIFICATION_MAP = {"Not Verified": 0, "Source Verified": 1, "Verified": 2}
PURPOSE_MAP = {
    "debt_consolidation": 0, "credit_card": 1, "home_improvement": 2,
    "other": 3, "major_purchase": 4, "medical": 5, "small_business": 6,
    "car": 7, "vacation": 8, "moving": 9, "house": 10,
    "wedding": 11, "renewable_energy": 12, "educational": 13,
}
EMP_YEARS_MAP = {
    "< 1 year": 0.5, "1 year": 1.0, "2 years": 2.0, "3 years": 3.0,
    "4 years": 4.0, "5 years": 5.0, "6 years": 6.0, "7 years": 7.0,
    "8 years": 8.0, "9 years": 9.0, "10+ years": 10.0,
}


# ===================== SMART PER-FEATURE SCALING =====================
FEATURE_SCALING_CONFIG = {
    # ══ NUMERIC (21) ══
    "credit_score":              "standard",       # 150-750, near-uniform
    "capital":                   "log_standard",    # VND, right-skewed
    "monthly_income":            "log_robust",      # VND, outliers
    "monthly_pay":               "log_standard",    # VND, right-skewed
    "revolving_balance":         "log_standard",    # VND, can be 0
    "total_current_balance":     "log_standard",    # VND total outstanding, right-skewed [NEW]
    "dti":                       "robust",          # 0-100%, outliers
    "revolving_util_percent":    "robust",          # 0-150%, skewed
    "emp_length_years":          "minmax",          # 0.5-10, bounded
    "active_bad_debts":          "robust",          # zero-inflated
    "bankruptcies":              "robust",          # zero-inflated
    "active_loans":              "standard",        # count, near-normal
    "total_loans_history":       "standard",        # count, near-normal
    "credit_history_months":     "standard",        # months, near-normal
    "recent_inquiries":          "robust",          # zero-inflated
    "delinquencies_2yr":         "robust",          # zero-inflated
    "accounts_delinquent":       "robust",          # zero-inflated [NEW]
    "severe_delinquencies_24m":  "robust",          # zero-inflated [NEW]
    "pct_never_delinquent":      "standard",        # %, near-normal [NEW]
    "collections_12m":           "robust",          # zero-inflated [NEW]
    "loan_to_income":            "log_robust",      # ratio, right-skewed
    # ══ CATEGORICAL (4) — passthrough ══
    "term_enc":                  "passthrough",
    "home_ownership_enc":        "passthrough",
    "verification_status_enc":   "passthrough",
    "purpose_enc":               "passthrough",
}


def _fit_one_feature(values_1d, strategy):
    col = values_1d.reshape(-1, 1).astype(np.float64)
    if strategy == "log_standard":
        col_log = np.log1p(np.clip(col, 0, None))
        sc = StandardScaler(); out = sc.fit_transform(col_log).ravel()
        return (strategy, sc, out)
    elif strategy == "log_robust":
        col_log = np.log1p(np.clip(col, 0, None))
        sc = RobustScaler(); out = sc.fit_transform(col_log).ravel()
        return (strategy, sc, out)
    elif strategy == "robust":
        sc = RobustScaler(); out = sc.fit_transform(col).ravel()
        return (strategy, sc, out)
    elif strategy == "standard":
        sc = StandardScaler(); out = sc.fit_transform(col).ravel()
        return (strategy, sc, out)
    elif strategy == "minmax":
        sc = MinMaxScaler(); out = sc.fit_transform(col).ravel()
        return (strategy, sc, out)
    elif strategy == "passthrough":
        return (strategy, None, col.ravel())
    else:
        raise ValueError(f"Unknown scaling strategy: {strategy}")


def _transform_one_feature(values_1d, strategy, scaler):
    col = values_1d.reshape(-1, 1).astype(np.float64)
    if strategy in ("log_standard", "log_robust"):
        col_log = np.log1p(np.clip(col, 0, None))
        return scaler.transform(col_log).ravel()
    elif strategy in ("robust", "standard", "minmax"):
        return scaler.transform(col).ravel()
    elif strategy == "passthrough":
        return col.ravel()
    else:
        raise ValueError(f"Unknown strategy: {strategy}")


def create_per_feature_scalers(X_train_raw, feature_names):
    scalers = {}
    X_scaled = np.zeros_like(X_train_raw, dtype=np.float64)
    for i, fname in enumerate(feature_names):
        strategy = FEATURE_SCALING_CONFIG.get(fname, "standard")
        strat, sc, transformed = _fit_one_feature(X_train_raw[:, i], strategy)
        X_scaled[:, i] = transformed
        scalers[fname] = (strat, sc)
    return scalers, X_scaled


def apply_per_feature_scalers(X_raw, scalers, feature_names):
    X_scaled = np.zeros_like(X_raw, dtype=np.float64)
    for i, fname in enumerate(feature_names):
        strategy, sc = scalers[fname]
        X_scaled[:, i] = _transform_one_feature(X_raw[:, i], strategy, sc)
    return X_scaled


# ===================== DATA LOADING =====================
def load_and_clean_data(accepted_path, rejected_path=None, chart_dir=None):
    """Load & process Lending Club data → 25 features + target."""
    print(f"  Loading accepted loans from {accepted_path}...")
    df = pd.read_csv(accepted_path, usecols=ACCEPTED_USECOLS, low_memory=False)
    print(f"  Raw accepted: {len(df):,} rows × {len(df.columns)} columns")

    # ── Filter terminal statuses ──
    df = df[df["loan_status"].isin(["Fully Paid", "Charged Off"])].copy()
    df["is_default"] = (df["loan_status"] == "Charged Off").astype(int)
    print(f"  After filtering: {len(df):,} rows | Default rate: {df['is_default'].mean():.2%}")

    rate = USD_TO_VND

    # ════════════════════════════════════════════
    # NUMERIC FEATURES (21)
    # ════════════════════════════════════════════

    # 1. credit_score: sub_grade → 150-750
    df["credit_score"] = df["sub_grade"].map(SUBGRADE_SCORE_MAP)
    df = df.dropna(subset=["credit_score"])

    # 2. capital: loan_amnt × VND rate
    df["capital"] = pd.to_numeric(df["loan_amnt"], errors='coerce') * rate

    # 3. monthly_income: annual_inc / 12 × VND rate
    df["monthly_income"] = pd.to_numeric(df["annual_inc"], errors='coerce') * rate / 12
    df["monthly_income"] = df["monthly_income"].clip(0, df["monthly_income"].quantile(0.99))

    # 4. monthly_pay: installment × VND rate
    df["monthly_pay"] = pd.to_numeric(df["installment"], errors='coerce') * rate
    df["monthly_pay"] = df["monthly_pay"].fillna(df["monthly_pay"].median())

    # 5. revolving_balance: revol_bal × VND rate
    df["revolving_balance"] = pd.to_numeric(df["revol_bal"], errors='coerce') * rate
    df["revolving_balance"] = df["revolving_balance"].fillna(0)
    df["revolving_balance"] = df["revolving_balance"].clip(0, df["revolving_balance"].quantile(0.99))

    # 6. total_current_balance: tot_cur_bal × VND rate [NEW]
    df["total_current_balance"] = pd.to_numeric(df["tot_cur_bal"], errors='coerce') * rate
    df["total_current_balance"] = df["total_current_balance"].fillna(0)
    df["total_current_balance"] = df["total_current_balance"].clip(0, df["total_current_balance"].quantile(0.99))

    # 7. dti
    df["dti"] = pd.to_numeric(df["dti"], errors='coerce')
    df["dti"] = df["dti"].fillna(df["dti"].median()).clip(0, 100)

    # 8. revolving_util_percent
    df["revolving_util_percent"] = pd.to_numeric(df["revol_util"], errors='coerce')
    df["revolving_util_percent"] = df["revolving_util_percent"].fillna(df["revolving_util_percent"].median()).clip(0, 150)

    # 9. emp_length_years
    df["emp_length_years"] = df["emp_length"].map(EMP_YEARS_MAP)
    emp_median = df["emp_length_years"].median()
    df["emp_length_years"] = df["emp_length_years"].fillna(emp_median).clip(0.5, 10)

    # 10. active_bad_debts (pub_rec)
    df["active_bad_debts"] = pd.to_numeric(df["pub_rec"], errors='coerce').fillna(0).clip(0, 20)

    # 11. bankruptcies (pub_rec_bankruptcies)
    df["bankruptcies"] = pd.to_numeric(df["pub_rec_bankruptcies"], errors='coerce').fillna(0).clip(0, 10)

    # 12. active_loans (open_acc)
    df["active_loans"] = pd.to_numeric(df["open_acc"], errors='coerce')
    df["active_loans"] = df["active_loans"].fillna(df["active_loans"].median()).clip(0, 50)

    # 13. total_loans_history (total_acc)
    df["total_loans_history"] = pd.to_numeric(df["total_acc"], errors='coerce')
    df["total_loans_history"] = df["total_loans_history"].fillna(df["total_loans_history"].median()).clip(0, 100)

    # 14. credit_history_months (earliest_cr_line)
    df["earliest_cr_line"] = pd.to_datetime(df["earliest_cr_line"], format='%b-%Y', errors='coerce')
    reference_date = pd.Timestamp("2015-06-01")
    df["credit_history_months"] = ((reference_date - df["earliest_cr_line"]).dt.days / 30.44).clip(0, 600)
    df["credit_history_months"] = df["credit_history_months"].fillna(df["credit_history_months"].median())

    # 15. recent_inquiries (inq_last_6mths)
    df["recent_inquiries"] = pd.to_numeric(df["inq_last_6mths"], errors='coerce').fillna(0).clip(0, 20)

    # 16. delinquencies_2yr (delinq_2yrs)
    df["delinquencies_2yr"] = pd.to_numeric(df["delinq_2yrs"], errors='coerce').fillna(0).clip(0, 20)

    # 17. accounts_delinquent (acc_now_delinq) [NEW]
    df["accounts_delinquent"] = pd.to_numeric(df["acc_now_delinq"], errors='coerce').fillna(0).clip(0, 10)

    # 18. severe_delinquencies_24m (num_tl_90g_dpd_24m) [NEW]
    df["severe_delinquencies_24m"] = pd.to_numeric(df["num_tl_90g_dpd_24m"], errors='coerce').fillna(0).clip(0, 20)

    # 19. pct_never_delinquent (pct_tl_nvr_dlq) [NEW]
    df["pct_never_delinquent"] = pd.to_numeric(df["pct_tl_nvr_dlq"], errors='coerce')
    df["pct_never_delinquent"] = df["pct_never_delinquent"].fillna(100).clip(0, 100)

    # 20. collections_12m (collections_12_mths_ex_med) [NEW]
    df["collections_12m"] = pd.to_numeric(df["collections_12_mths_ex_med"], errors='coerce').fillna(0).clip(0, 10)

    # 21. loan_to_income (engineered)
    annual_safe = (df["monthly_income"] * 12).clip(lower=1)
    df["loan_to_income"] = df["capital"] / annual_safe
    df["loan_to_income"] = df["loan_to_income"].clip(0, df["loan_to_income"].quantile(0.99))

    # ════════════════════════════════════════════
    # CATEGORICAL FEATURES (4)
    # ════════════════════════════════════════════

    df["term_enc"] = df["term"].str.extract(r"(\d+)").astype(float)
    df["home_ownership_enc"] = df["home_ownership"].map(HOME_MAP).fillna(3).astype(int)
    df["verification_status_enc"] = df["verification_status"].map(VERIFICATION_MAP).fillna(0).astype(int)
    df["purpose_enc"] = df["purpose"].map(PURPOSE_MAP).fillna(3).astype(int)

    # ── Drop NaN ──
    before = len(df)
    df = df[FEATURE_NAMES + ["is_default"]].dropna()
    dropped = before - len(df)
    if dropped > 0:
        print(f"  Dropped {dropped:,} rows with NaN ({dropped/before:.2%})")

    print(f"\n  Final: {len(df):,} rows × {len(FEATURE_NAMES)} features")
    for fn in FEATURE_NAMES:
        ftype = "NUM" if fn in NUMERIC_FEATURES else "CAT"
        v = df[fn]
        print(f"    [{ftype}] {fn:30s} min={v.min():>12.2f}  med={v.median():>12.2f}  max={v.max():>12.2f}")

    # ════════════════════════════════════════════
    # REJECTED CSV — EDA only
    # ════════════════════════════════════════════
    if rejected_path and os.path.exists(rejected_path):
        print(f"\n  {'='*60}")
        print(f"  REJECTED DATA EDA")
        print(f"  {'='*60}")
        try:
            df_rej = pd.read_csv(rejected_path, low_memory=False)
            print(f"  Rejected: {len(df_rej):,} rows")
            df_rej["risk_score"] = pd.to_numeric(df_rej["Risk_Score"], errors='coerce')
            df_rej["dti_clean"] = pd.to_numeric(
                df_rej["Debt-To-Income Ratio"].str.replace('%', '', regex=False), errors='coerce')
            df_rej["amount"] = pd.to_numeric(df_rej["Amount Requested"], errors='coerce')
            print(f"    Risk Score: mean={df_rej['risk_score'].mean():.0f}, median={df_rej['risk_score'].median():.0f}")
            print(f"    DTI:  mean={df_rej['dti_clean'].mean():.1f}%")
            print(f"    Amount: mean=${df_rej['amount'].mean():,.0f}")

            if chart_dir:
                os.makedirs(chart_dir, exist_ok=True)
                fig, axes = plt.subplots(1, 3, figsize=(20, 6))
                axes[0].hist(df["credit_score"].values, bins=50, alpha=0.6, color='#4CAF50',
                             density=True, label=f'Accepted (n={len(df):,})')
                axes[0].hist(df_rej["risk_score"].dropna().values, bins=50, alpha=0.6, color='#F44336',
                             density=True, label=f'Rejected')
                axes[0].set_title('Credit Score Distribution', fontweight='bold'); axes[0].legend(fontsize=9)
                axes[1].hist(df["dti"].values, bins=50, alpha=0.6, color='#4CAF50', density=True, label='Accepted')
                axes[1].hist(df_rej["dti_clean"].dropna().clip(0,100).values, bins=50, alpha=0.6, color='#F44336',
                             density=True, label='Rejected')
                axes[1].set_title('DTI Distribution', fontweight='bold'); axes[1].legend(fontsize=9)
                axes[2].hist((df["capital"]/rate).values, bins=50, alpha=0.6, color='#4CAF50', density=True, label='Accepted')
                axes[2].hist(df_rej["amount"].dropna().values, bins=50, alpha=0.6, color='#F44336', density=True, label='Rejected')
                axes[2].set_title('Loan Amount (USD)', fontweight='bold'); axes[2].legend(fontsize=9)
                fig.suptitle('Accepted vs Rejected (2007-2018 Q4)', fontsize=15, fontweight='bold')
                fig.tight_layout()
                fig.savefig(os.path.join(chart_dir, '00_accepted_vs_rejected.png'), dpi=200, bbox_inches='tight')
                plt.close(fig)
            del df_rej; gc.collect()
        except Exception as e:
            print(f"  [WARN] Cannot read rejected CSV: {e}")

    return df


# ═════════════════════════════════════════════════════════════
#  20 CHARTS
# ═════════════════════════════════════════════════════════════
def plot_all_charts(
    y_test, y_prob_xgb, y_prob_lr, y_pred_lr,
    optimal_threshold, scores_test, scores_train, y_train,
    xgb_importances, feature_names, lr_coefs_original,
    cv_aucs, fold_metrics, X_test_scaled, chart_dir,
):
    os.makedirs(chart_dir, exist_ok=True)
    try: plt.style.use('seaborn-v0_8-darkgrid')
    except Exception: plt.style.use('ggplot')

    print("\n  Exporting 20 charts...")
    all_probs = {'xgb': y_prob_xgb, 'lr': y_prob_lr}

    # ─── 1. ROC Curve ───
    print("    [1/20] ROC Curve...")
    fig, ax = plt.subplots(figsize=(10, 8))
    for key in ['xgb', 'lr']:
        fpr, tpr, _ = roc_curve(y_test, all_probs[key])
        auc_val = roc_auc_score(y_test, all_probs[key])
        lw = 3 if key == 'lr' else 1.5
        ax.plot(fpr, tpr, label=f"{MODEL_LABELS[key]} (AUC={auc_val:.4f})", linewidth=lw, color=COLORS[key])
    ax.plot([0, 1], [0, 1], 'k:', alpha=0.4, label='Random (0.5)')
    ax.set_xlabel('FPR', fontsize=13); ax.set_ylabel('TPR', fontsize=13)
    ax.set_title('ROC Curve — XGBoost vs LR', fontsize=15, fontweight='bold')
    ax.legend(fontsize=11, loc='lower right'); ax.grid(True, alpha=0.3)
    fig.tight_layout(); fig.savefig(os.path.join(chart_dir, '01_roc_curve.png'), dpi=200); plt.close(fig)

    # ─── 2. PR Curve ───
    print("    [2/20] Precision-Recall Curve...")
    fig, ax = plt.subplots(figsize=(10, 8))
    for key in ['xgb', 'lr']:
        prec_c, rec_c, _ = precision_recall_curve(y_test, all_probs[key])
        ap = average_precision_score(y_test, all_probs[key])
        lw = 3 if key == 'lr' else 1.5
        ax.plot(rec_c, prec_c, label=f"{MODEL_LABELS[key]} (AP={ap:.4f})", linewidth=lw, color=COLORS[key])
    ax.axhline(y=y_test.mean(), color='gray', ls=':', alpha=0.5, label=f'Baseline={y_test.mean():.3f}')
    ax.set_xlabel('Recall'); ax.set_ylabel('Precision')
    ax.set_title('Precision-Recall Curve', fontsize=15, fontweight='bold')
    ax.legend(fontsize=11); ax.grid(True, alpha=0.3)
    fig.tight_layout(); fig.savefig(os.path.join(chart_dir, '02_precision_recall_curve.png'), dpi=200); plt.close(fig)

    # ─── 3. Confusion Matrix ───
    print("    [3/20] Confusion Matrix...")
    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
    cm = confusion_matrix(y_test, y_pred_lr)
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=axes[0],
                xticklabels=["Paid (0)", "Default (1)"], yticklabels=["Paid (0)", "Default (1)"])
    axes[0].set_title('Counts', fontsize=14, fontweight='bold')
    cm_norm = cm.astype(float) / cm.sum(axis=1, keepdims=True)
    sns.heatmap(cm_norm, annot=True, fmt='.2%', cmap='Oranges', ax=axes[1],
                xticklabels=["Paid (0)", "Default (1)"], yticklabels=["Paid (0)", "Default (1)"])
    axes[1].set_title('Normalized', fontsize=14, fontweight='bold')
    fig.suptitle('LR — Confusion Matrix', fontsize=16, fontweight='bold', y=1.02)
    fig.tight_layout(); fig.savefig(os.path.join(chart_dir, '03_confusion_matrix.png'), dpi=200, bbox_inches='tight'); plt.close(fig)

    # ─── 4. XGBoost Feature Importance ───
    print("    [4/20] XGBoost Feature Importance...")
    fig, ax = plt.subplots(figsize=(12, 10))
    si = np.argsort(xgb_importances)
    ax.barh(range(len(si)), xgb_importances[si], color=COLORS['xgb'], alpha=0.85)
    ax.set_yticks(range(len(si))); ax.set_yticklabels([feature_names[i] for i in si], fontsize=10)
    ax.set_title('XGBoost Feature Importance (Stage 1)', fontsize=15, fontweight='bold')
    ax.grid(True, alpha=0.3, axis='x'); fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '04_feature_importance_xgb.png'), dpi=200); plt.close(fig)

    # ─── 5. PD Distribution ───
    print("    [5/20] PD Distribution...")
    fig, axes = plt.subplots(1, 2, figsize=(18, 7))
    for ax_i, (key, title) in enumerate([('xgb', 'XGBoost Raw PD'), ('lr', 'LR PD (calibrated)')]):
        probs = all_probs[key]
        axes[ax_i].hist(probs[y_test == 0], bins=50, alpha=0.6, label='Paid', color='green', density=True)
        axes[ax_i].hist(probs[y_test == 1], bins=50, alpha=0.6, label='Default', color='red', density=True)
        axes[ax_i].set_title(title, fontsize=14, fontweight='bold')
        axes[ax_i].set_xlabel('PD'); axes[ax_i].legend(fontsize=10)
    fig.suptitle('PD Distribution — Paid vs Default', fontsize=16, fontweight='bold')
    fig.tight_layout(); fig.savefig(os.path.join(chart_dir, '05_pd_distribution.png'), dpi=200); plt.close(fig)

    # ─── 6. Calibration Curve ───
    print("    [6/20] Calibration Curve...")
    fig, ax = plt.subplots(figsize=(10, 8))
    ax.plot([0, 1], [0, 1], 'k--', alpha=0.4, label='Perfect')
    for key in ['xgb', 'lr']:
        frac, mean_p = calibration_curve(y_test, all_probs[key], n_bins=10, strategy='uniform')
        lw = 3 if key == 'lr' else 1.5
        ax.plot(mean_p, frac, 's-', label=MODEL_LABELS[key], linewidth=lw, color=COLORS[key], markersize=6)
    ax.set_xlabel('Mean Predicted PD'); ax.set_ylabel('Fraction of Positives')
    ax.set_title('Calibration Curve', fontsize=15, fontweight='bold')
    ax.legend(fontsize=11); ax.grid(True, alpha=0.3)
    fig.tight_layout(); fig.savefig(os.path.join(chart_dir, '06_calibration_curve.png'), dpi=200); plt.close(fig)

    # ─── 7. CV AUC ───
    print("    [7/20] CV AUC per Fold...")
    fig, ax = plt.subplots(figsize=(10, 6))
    fl = [f'Fold {i+1}' for i in range(len(cv_aucs))]
    bars = ax.bar(fl, cv_aucs, color=COLORS['hybrid'], alpha=0.85, edgecolor='black')
    ax.axhline(y=np.mean(cv_aucs), color='red', ls='--', lw=2,
               label=f'Mean={np.mean(cv_aucs):.4f} ± {np.std(cv_aucs):.4f}')
    for b, v in zip(bars, cv_aucs):
        ax.text(b.get_x()+b.get_width()/2, b.get_height()+0.001, f'{v:.4f}', ha='center', fontweight='bold')
    ax.set_ylabel('AUC-ROC'); ax.legend(fontsize=12)
    ax.set_title(f'CV AUC — {N_FOLDS}-Fold XGBoost+LR Pipeline', fontsize=15, fontweight='bold')
    ax.set_ylim(min(cv_aucs)-0.02, max(cv_aucs)+0.02); ax.grid(True, alpha=0.3, axis='y')
    fig.tight_layout(); fig.savefig(os.path.join(chart_dir, '07_cv_auc_per_fold.png'), dpi=200); plt.close(fig)

    # ─── 8. Threshold Sensitivity ───
    print("    [8/20] Threshold Sensitivity...")
    fig, ax = plt.subplots(figsize=(12, 7))
    thresholds = np.arange(0.05, 0.96, 0.01)
    precs_t, recs_t, f1s_t, accs_t = [], [], [], []
    for t in thresholds:
        yt = (y_prob_lr >= t).astype(int)
        precs_t.append(precision_score(y_test, yt, zero_division=0))
        recs_t.append(recall_score(y_test, yt, zero_division=0))
        f1s_t.append(f1_score(y_test, yt, zero_division=0))
        accs_t.append(accuracy_score(y_test, yt))
    ax.plot(thresholds, precs_t, label='Precision', lw=2, color='blue')
    ax.plot(thresholds, recs_t, label='Recall', lw=2, color='green')
    ax.plot(thresholds, f1s_t, label='F1', lw=2.5, color='red')
    ax.plot(thresholds, accs_t, label='Accuracy', lw=1.5, color='purple', ls='--')
    ax.axvline(x=optimal_threshold, color='black', ls=':', alpha=0.7,
               label=f"Youden's J @ {optimal_threshold:.3f}")
    ax.set_xlabel('Threshold'); ax.set_ylabel('Score')
    ax.set_title('Threshold Sensitivity', fontsize=15, fontweight='bold')
    ax.legend(fontsize=10); ax.grid(True, alpha=0.3)
    fig.tight_layout(); fig.savefig(os.path.join(chart_dir, '08_threshold_sensitivity.png'), dpi=200); plt.close(fig)

    # ─── 9. Score Distribution (analysis) ───
    print("    [9/20] Score Distribution (analysis)...")
    fig, ax = plt.subplots(figsize=(12, 7))
    ax.hist(scores_test[y_test==0], bins=60, alpha=0.6, label='Paid', color='#4CAF50', density=True)
    ax.hist(scores_test[y_test==1], bins=60, alpha=0.6, label='Default', color='#F44336', density=True)
    ax.axvline(x=BASE_SCORE, color='blue', ls='--', lw=2, label=f'Base={BASE_SCORE}')
    ax.axvline(x=scores_test[y_test==0].mean(), color='green', ls=':', lw=2, label=f'Paid mean={scores_test[y_test==0].mean():.0f}')
    ax.axvline(x=scores_test[y_test==1].mean(), color='red', ls=':', lw=2, label=f'Default mean={scores_test[y_test==1].mean():.0f}')
    ax.set_xlabel('Scorecard Score (analysis)'); ax.set_ylabel('Density')
    ax.set_title('Scorecard Score Distribution — Paid vs Default (analysis only)', fontsize=15, fontweight='bold')
    ax.legend(fontsize=10); ax.grid(True, alpha=0.3)
    fig.tight_layout(); fig.savefig(os.path.join(chart_dir, '09_score_distribution.png'), dpi=200); plt.close(fig)

    # ─── 10. Model Comparison ───
    print("    [10/20] Model Comparison...")
    fig, ax = plt.subplots(figsize=(12, 7))
    mk = ['xgb', 'lr']; mn = [MODEL_LABELS[k] for k in mk]
    met_names = ['AUC', 'Accuracy', 'Precision', 'Recall', 'F1']
    x_pos = np.arange(len(mn)); width = 0.15
    for mi, mname in enumerate(met_names):
        vals = []
        for k in mk:
            pr = all_probs[k]; pd_i = (pr >= optimal_threshold).astype(int)
            if mname == 'AUC': vals.append(roc_auc_score(y_test, pr))
            elif mname == 'Accuracy': vals.append(accuracy_score(y_test, pd_i))
            elif mname == 'Precision': vals.append(precision_score(y_test, pd_i, zero_division=0))
            elif mname == 'Recall': vals.append(recall_score(y_test, pd_i, zero_division=0))
            elif mname == 'F1': vals.append(f1_score(y_test, pd_i, zero_division=0))
        offset = (mi - 2) * width
        bars = ax.bar(x_pos + offset, vals, width, label=mname, alpha=0.85)
        for b, v in zip(bars, vals):
            ax.text(b.get_x()+b.get_width()/2, b.get_height()+0.005, f'{v:.3f}', ha='center', fontsize=9, fontweight='bold')
    ax.set_xticks(x_pos); ax.set_xticklabels(mn, fontsize=12)
    ax.set_ylabel('Score'); ax.legend(fontsize=9)
    ax.set_title('XGBoost vs LR — 5 Metrics', fontsize=15, fontweight='bold')
    ax.set_ylim(0, 1.12); ax.grid(True, alpha=0.3, axis='y')
    fig.tight_layout(); fig.savefig(os.path.join(chart_dir, '10_model_comparison.png'), dpi=200); plt.close(fig)

    # ─── 11. Gain & Lift ───
    print("    [11/20] Gain & Lift...")
    fig, axes = plt.subplots(1, 2, figsize=(18, 7))
    si = np.argsort(-y_prob_lr); sl = y_test[si]
    cd = np.cumsum(sl); td = y_test.sum()
    pp = np.arange(1, len(y_test)+1)/len(y_test); pdc = cd/td
    axes[0].plot(pp, pdc, color=COLORS['hybrid'], lw=2.5, label='LR')
    axes[0].plot([0,1],[0,1],'k--',alpha=0.4,label='Random'); axes[0].fill_between(pp, pdc, pp, alpha=0.12, color=COLORS['hybrid'])
    axes[0].set_xlabel('% Population'); axes[0].set_ylabel('% Defaults Captured')
    axes[0].set_title('Cumulative Gain', fontweight='bold'); axes[0].legend()
    lift = pdc / pp
    axes[1].plot(pp, lift, color=COLORS['hybrid'], lw=2.5); axes[1].axhline(y=1, color='k', ls='--', alpha=0.4)
    axes[1].set_xlabel('% Population'); axes[1].set_ylabel('Lift'); axes[1].set_title('Lift Curve', fontweight='bold')
    fig.suptitle('Gain & Lift — LR', fontsize=16, fontweight='bold')
    fig.tight_layout(); fig.savefig(os.path.join(chart_dir, '11_gain_lift_curve.png'), dpi=200); plt.close(fig)

    # ─── 12. KS Statistic ───
    print("    [12/20] KS Statistic...")
    fig, ax = plt.subplots(figsize=(10, 7))
    fpr_ks, tpr_ks, th_ks = roc_curve(y_test, y_prob_lr)
    ks = np.max(tpr_ks - fpr_ks); ki = np.argmax(tpr_ks - fpr_ks)
    ax.plot(th_ks, tpr_ks, label='TPR', color='green', lw=2)
    ax.plot(th_ks, fpr_ks, label='FPR', color='red', lw=2)
    ax.fill_between(th_ks, tpr_ks, fpr_ks, alpha=0.12, color='blue')
    ax.axvline(x=th_ks[ki], color='blue', ls=':', lw=2, label=f'KS={ks:.4f} @ {th_ks[ki]:.3f}')
    ax.set_xlabel('Threshold'); ax.set_ylabel('Rate')
    ax.set_title('KS Statistic', fontsize=15, fontweight='bold')
    ax.legend(); ax.set_xlim(0, 1); ax.grid(True, alpha=0.3)
    fig.tight_layout(); fig.savefig(os.path.join(chart_dir, '12_ks_statistic.png'), dpi=200); plt.close(fig)

    # ─── 13. Architecture Diagram ───
    print("    [13/20] Architecture Diagram...")
    fig, ax = plt.subplots(figsize=(16, 14))
    ax.set_xlim(0, 12); ax.set_ylim(0, 14); ax.axis('off')
    ax.text(6, 13.5, 'XGBoost + LR (Gold Standard)', fontsize=22, fontweight='bold', ha='center', color=COLORS['hybrid'])
    ax.text(6, 12.9, '25 Features — Lending Club → P2P System Mapping', fontsize=12, ha='center', color='gray', style='italic')
    bd = dict(boxstyle="round,pad=0.5", alpha=0.3, linewidth=2)
    ax.text(6, 11.8, '25 Features (21 NUM + 4 CAT)\ncredit_score, capital, monthly_income, monthly_pay,\n'
            'revolving_balance, total_current_balance, dti, revolving_util_percent,\n'
            'emp_length_years, active_bad_debts, bankruptcies, active_loans,\n'
            'total_loans_history, credit_history_months, recent_inquiries, delinquencies_2yr,\n'
            'accounts_delinquent, severe_delinquencies_24m, pct_never_delinquent,\n'
            'collections_12m, loan_to_income + 4 categorical',
            fontsize=8.5, ha='center', bbox=dict(**bd, facecolor='#E1F5FE', edgecolor='#0277BD'))
    ax.annotate('', xy=(6, 9.8), xytext=(6, 10.4), arrowprops=dict(arrowstyle='->', color='gray', lw=2))
    ax.text(6, 9.2, 'Smart Per-Feature Scaling\n6 strategies: log_standard, log_robust, robust,\nstandard, minmax, passthrough',
            fontsize=10, ha='center', bbox=dict(**bd, facecolor='#F3E5F5', edgecolor='#7B1FA2'))
    ax.annotate('', xy=(6, 7.8), xytext=(6, 8.4), arrowprops=dict(arrowstyle='->', color='gray', lw=2))
    ax.text(6, 7.2, 'STAGE 1: XGBoost\nn_estimators=1500, max_depth=6, GPU\n→ Leaf Indices → OneHotEncode (sparse)',
            fontsize=12, ha='center', bbox=dict(**bd, facecolor=COLORS['xgb'], edgecolor=COLORS['xgb']))
    ax.annotate('', xy=(6, 5.8), xytext=(6, 6.4), arrowprops=dict(arrowstyle='->', color='gray', lw=2))
    ax.text(6, 5.2, '[Leaf OHE (sparse)] + [25 Original Features]\n= Combined Input for LR',
            fontsize=10, ha='center', bbox=dict(**bd, facecolor='#FFF3E0', edgecolor='#E65100'))
    ax.annotate('', xy=(6, 3.8), xytext=(6, 4.5), arrowprops=dict(arrowstyle='->', color=COLORS['lr'], lw=2))
    ax.text(6, 3.2, 'STAGE 2: Logistic Regression\nC=1.0, L2, balanced, SAGA solver\n→ PD (calibrated probability)',
            fontsize=12, ha='center', bbox=dict(**bd, facecolor=COLORS['lr'], edgecolor=COLORS['lr']))
    ax.annotate('', xy=(6, 1.5), xytext=(6, 2.4), arrowprops=dict(arrowstyle='->', color=COLORS['hybrid'], lw=3))
    ax.text(6, 0.8, 'OUTPUT: ai_risk_score (0-100)\ndefault_probability (0.0-1.0)',
            fontsize=14, ha='center', fontweight='bold',
            bbox=dict(boxstyle="round,pad=0.5", facecolor='#FCE4EC', alpha=0.9, edgecolor=COLORS['hybrid'], linewidth=3))
    fig.savefig(os.path.join(chart_dir, '13_architecture.png'), dpi=200, bbox_inches='tight', facecolor='white'); plt.close(fig)

    # ─── 14. CV Heatmap ───
    print("    [14/20] CV Heatmap...")
    if fold_metrics:
        fig, ax = plt.subplots(figsize=(14, 6))
        mkeys = list(fold_metrics[0].keys())
        fd = np.array([[fm[m] for m in mkeys] for fm in fold_metrics])
        dfh = pd.DataFrame(fd, columns=mkeys, index=[f'Fold {i+1}' for i in range(len(fold_metrics))])
        dfh.loc['Mean'] = dfh.mean(); dfh.loc['Std'] = dfh.iloc[:-1].std()
        sns.heatmap(dfh, annot=True, fmt='.4f', cmap='YlOrRd', ax=ax, linewidths=0.5)
        ax.set_title('CV Metrics — Per Fold Heatmap', fontsize=15, fontweight='bold')
        fig.tight_layout(); fig.savefig(os.path.join(chart_dir, '14_cv_fold_heatmap.png'), dpi=200); plt.close(fig)

    # ─── 15. Risk Bands (using scorecard scores for analysis) ───
    print("    [15/20] Risk Bands...")
    fig, ax = plt.subplots(figsize=(13, 7))
    bins_s = [150, 400, 500, 600, 700, 950]
    labels_s = ['150-400\nRat cao', '400-500\nCao', '500-600\nTrung binh', '600-700\nThap', '700-950\nRat thap']
    rb = pd.cut(scores_test, bins=bins_s, labels=labels_s, include_lowest=True)
    rdf = pd.DataFrame({'band': rb, 'default': y_test})
    bs = rdf.groupby('band', observed=False).agg(n=('default','count'), d=('default','sum'), dr=('default','mean')).reset_index()
    bc = ['#F44336', '#FF9800', '#FFC107', '#8BC34A', '#4CAF50']
    ax.bar(range(len(bs)), bs['n'], color=bc, alpha=0.7, edgecolor='black', label='Total')
    ax.bar(range(len(bs)), bs['d'], color='red', alpha=0.4, edgecolor='darkred', label='Defaults')
    ax2 = ax.twinx()
    ax2.plot(range(len(bs)), bs['dr']*100, 'ko-', lw=2.5, ms=10, label='Default Rate %')
    for i, (n, d, dr) in enumerate(zip(bs['n'], bs['d'], bs['dr'])):
        ax.text(i, n+20, f'n={n}', ha='center', fontsize=10, fontweight='bold')
        ax2.text(i, dr*100+1.5, f'{dr*100:.1f}%', ha='center', fontsize=10, fontweight='bold', color='red')
    ax.set_xticks(range(len(bs))); ax.set_xticklabels(bs['band'], fontsize=11)
    ax.set_xlabel('Score Band (analysis)'); ax.set_ylabel('Count'); ax2.set_ylabel('Default Rate (%)', color='red')
    ax.set_title('Risk Band by Scorecard Score (analysis)', fontsize=15, fontweight='bold')
    h1,l1 = ax.get_legend_handles_labels(); h2,l2 = ax2.get_legend_handles_labels()
    ax.legend(h1+h2, l1+l2, fontsize=10, loc='upper right')
    fig.tight_layout(); fig.savefig(os.path.join(chart_dir, '15_risk_band_score.png'), dpi=200); plt.close(fig)

    # ─── 16. Feature Correlation ───
    print("    [16/20] Feature Correlation...")
    fig, ax = plt.subplots(figsize=(18, 15))
    feat_df = pd.DataFrame(X_test_scaled, columns=feature_names)
    corr = feat_df.corr(); mask = np.triu(np.ones_like(corr, dtype=bool))
    sns.heatmap(corr, mask=mask, annot=True, fmt='.2f', cmap='RdBu_r', ax=ax, vmin=-1, vmax=1, linewidths=0.5, square=True,
                annot_kws={"size": 7})
    ax.set_title(f'Feature Correlation ({len(feature_names)} features)', fontsize=15, fontweight='bold')
    fig.tight_layout(); fig.savefig(os.path.join(chart_dir, '16_feature_correlation.png'), dpi=200); plt.close(fig)

    # ─── 17. LR Feature Points ───
    print("    [17/20] LR Feature Points...")
    fig, ax = plt.subplots(figsize=(14, 11))
    coefs = lr_coefs_original
    sorted_idx = np.argsort(np.abs(coefs))
    colors_bar = ['#4CAF50' if feature_names[i] in NUMERIC_FEATURES else '#FF9800' for i in sorted_idx]
    ax.barh(range(len(sorted_idx)), coefs[sorted_idx], color=colors_bar, alpha=0.85)
    ax.set_yticks(range(len(sorted_idx))); ax.set_yticklabels([feature_names[i] for i in sorted_idx], fontsize=10)
    ax.axvline(x=0, color='black', lw=1)
    ax.set_xlabel('LR Coefficient (original features)', fontsize=12)
    ax.set_title('LR — Feature Score Points\nPositive = increases default risk | Negative = decreases risk',
                 fontsize=15, fontweight='bold')
    green_p = mpatches.Patch(color='#4CAF50', label='Numeric')
    orange_p = mpatches.Patch(color='#FF9800', label='Categorical')
    ax.legend(handles=[green_p, orange_p], fontsize=11, loc='lower right')
    ax.grid(True, alpha=0.3, axis='x'); fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '17_lr_feature_points.png'), dpi=200); plt.close(fig)

    # ─── 18. Score vs Default Rate (analysis) ───
    print("    [18/20] Score vs Default Rate...")
    fig, ax = plt.subplots(figsize=(12, 7))
    score_edges = np.arange(200, 900, 25)
    score_mids, def_rates, counts = [], [], []
    for i in range(len(score_edges)-1):
        m = (scores_test >= score_edges[i]) & (scores_test < score_edges[i+1])
        if m.sum() > 0:
            score_mids.append((score_edges[i]+score_edges[i+1])/2)
            def_rates.append(y_test[m].mean()); counts.append(m.sum())
    ax.bar(score_mids, [c/max(counts)*0.5 for c in counts], width=20, alpha=0.3, color='gray', label='Volume')
    ax2 = ax.twinx()
    ax2.plot(score_mids, [d*100 for d in def_rates], 'ro-', lw=2.5, ms=8, label='Default Rate %')
    th_sc = np.linspace(250, 850, 100); th_pd = score_to_pd(th_sc)
    ax2.plot(th_sc, th_pd*100, 'b--', lw=1.5, alpha=0.6, label='Theoretical')
    ax.set_xlabel('Scorecard Score (analysis)'); ax.set_ylabel('Volume'); ax2.set_ylabel('Default Rate (%)', color='red')
    ax.set_title('Score vs Default Rate — Validation (analysis)', fontsize=15, fontweight='bold')
    h1,l1 = ax.get_legend_handles_labels(); h2,l2 = ax2.get_legend_handles_labels()
    ax2.legend(h1+h2, l1+l2, fontsize=10); ax.grid(True, alpha=0.3)
    fig.tight_layout(); fig.savefig(os.path.join(chart_dir, '18_score_vs_default_rate.png'), dpi=200); plt.close(fig)

    # ─── 19. Error Analysis ───
    print("    [19/20] Error Analysis...")
    fig, axes = plt.subplots(1, 2, figsize=(16, 7))
    fp = (y_pred_lr==1)&(y_test==0); fn = (y_pred_lr==0)&(y_test==1)
    tp = (y_pred_lr==1)&(y_test==1); tn = (y_pred_lr==0)&(y_test==0)
    for name, sc, c in [('TN',scores_test[tn],'#4CAF50'),('FP',scores_test[fp],'#FF9800'),
                         ('FN',scores_test[fn],'#F44336'),('TP',scores_test[tp],'#2196F3')]:
        if len(sc)>0: axes[0].hist(sc, bins=30, alpha=0.5, label=f'{name} (n={len(sc)})', color=c, density=True)
    axes[0].set_xlabel('Scorecard Score'); axes[0].set_title('Score by Outcome', fontweight='bold'); axes[0].legend(fontsize=9)
    cnts = [tn.sum(), fp.sum(), fn.sum(), tp.sum()]
    axes[1].pie(cnts, labels=['TN','FP','FN','TP'], colors=['#4CAF50','#FF9800','#F44336','#2196F3'],
                autopct='%1.1f%%', startangle=90, textprops={'fontsize':12, 'fontweight':'bold'})
    axes[1].set_title('Prediction Outcome', fontweight='bold')
    fig.suptitle('Error Analysis', fontsize=16, fontweight='bold')
    fig.tight_layout(); fig.savefig(os.path.join(chart_dir, '19_error_analysis.png'), dpi=200); plt.close(fig)

    # ─── 20. Summary Dashboard ───
    print("    [20/20] Summary Dashboard...")
    fig = plt.figure(figsize=(20, 14))
    gs = fig.add_gridspec(3, 3, hspace=0.35, wspace=0.3)
    ax1 = fig.add_subplot(gs[0, 0])
    for k in ['xgb', 'lr']:
        fpr_m, tpr_m, _ = roc_curve(y_test, all_probs[k])
        ax1.plot(fpr_m, tpr_m, color=COLORS[k], lw=2 if k=='lr' else 1,
                 label=f'{MODEL_LABELS[k]} ({roc_auc_score(y_test, all_probs[k]):.3f})')
    ax1.plot([0,1],[0,1],'k:',alpha=0.3); ax1.legend(fontsize=8); ax1.set_title('ROC', fontweight='bold')
    ax2 = fig.add_subplot(gs[0, 1])
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=ax2, xticklabels=['P','D'], yticklabels=['P','D'])
    ax2.set_title('Confusion Matrix', fontweight='bold')
    ax3 = fig.add_subplot(gs[0, 2])
    ax3.hist(scores_test[y_test==0], bins=40, alpha=0.6, color='green', density=True, label='Paid')
    ax3.hist(scores_test[y_test==1], bins=40, alpha=0.6, color='red', density=True, label='Default')
    ax3.legend(fontsize=8); ax3.set_title('Score Dist (analysis)', fontweight='bold')
    ax4 = fig.add_subplot(gs[1, :]); ax4.axis('off')
    metrics_table = [['Metric', 'XGBoost (raw)', 'LR']]
    for met_name in ['AUC','Accuracy','Precision','Recall','F1']:
        row = [met_name]
        for k in ['xgb','lr']:
            pr = all_probs[k]; pd_i = (pr >= optimal_threshold).astype(int)
            if met_name=='AUC': row.append(f'{roc_auc_score(y_test, pr):.4f}')
            elif met_name=='Accuracy': row.append(f'{accuracy_score(y_test, pd_i):.4f}')
            elif met_name=='Precision': row.append(f'{precision_score(y_test, pd_i, zero_division=0):.4f}')
            elif met_name=='Recall': row.append(f'{recall_score(y_test, pd_i, zero_division=0):.4f}')
            elif met_name=='F1': row.append(f'{f1_score(y_test, pd_i, zero_division=0):.4f}')
        metrics_table.append(row)
    table = ax4.table(cellText=metrics_table[1:], colLabels=metrics_table[0], cellLoc='center', loc='center')
    table.auto_set_font_size(False); table.set_fontsize(11); table.scale(1.0, 2.0)
    for j in range(3): table[0,j].set_facecolor('#E0E0E0'); table[0,j].set_text_props(fontweight='bold')
    ax4.set_title('Performance Comparison', fontsize=14, fontweight='bold', pad=10)
    ax5 = fig.add_subplot(gs[2, 0])
    ax5.plot(pp, pdc, color=COLORS['hybrid'], lw=2); ax5.plot([0,1],[0,1],'k--',alpha=0.3)
    ax5.set_title('Cumulative Gain', fontweight='bold')
    ax6 = fig.add_subplot(gs[2, 1]); ax6.plot([0,1],[0,1],'k--',alpha=0.3)
    for k in ['xgb','lr']:
        frac_m, mean_m = calibration_curve(y_test, all_probs[k], n_bins=8)
        ax6.plot(mean_m, frac_m, 's-', color=COLORS[k], lw=2 if k=='lr' else 1, label=MODEL_LABELS[k], ms=4)
    ax6.legend(fontsize=8); ax6.set_title('Calibration', fontweight='bold')
    ax7 = fig.add_subplot(gs[2, 2])
    ax7.bar(range(len(bs)), bs['dr']*100, color=bc, alpha=0.8, edgecolor='black')
    ax7.set_xticks(range(len(bs))); ax7.set_xticklabels(['V.High','High','Med','Low','V.Low'], fontsize=8)
    ax7.set_ylabel('Default Rate %'); ax7.set_title('Risk by Score Band', fontweight='bold')
    fig.suptitle('XGBoost + LR — SUMMARY DASHBOARD (25 Features)', fontsize=18, fontweight='bold', y=1.01)
    fig.savefig(os.path.join(chart_dir, '20_summary_dashboard.png'), dpi=200, bbox_inches='tight'); plt.close(fig)
    print(f"\n  >>> Exported 20 charts to: {chart_dir}/")


# ═════════════════════════════════════════════════════════════
#  MAIN TRAINING PIPELINE
# ═════════════════════════════════════════════════════════════
def train_model():
    t_start = time.time()
    print("=" * 70)
    print("  AIScore v8.0 — XGBoost + LR (Gold Standard)")
    print("  Stage 1: XGBoost → Leaf Indices → OneHotEncode (sparse)")
    print("  Stage 2: LR on [Leaf OHE + 25 Features] → PD (calibrated)")
    print("  Output: ai_risk_score (0-100) + default_probability (0.0-1.0)")
    print("=" * 70)

    # ── 1. Load data ──
    print("\n[1/9] Loading data...")
    if not os.path.exists(ACCEPTED_CSV):
        raise FileNotFoundError(f"Missing: {ACCEPTED_CSV}")

    rejected_path = REJECTED_CSV if os.path.exists(REJECTED_CSV) else None
    df = load_and_clean_data(ACCEPTED_CSV, rejected_path=rejected_path, chart_dir=CHART_DIR)
    print(f"\n  Dataset: {len(df):,} | Default rate: {df['is_default'].mean():.2%}")

    # ── 2. Split ──
    print("\n[2/9] Train/Test split (80/20, stratified)...")
    X = df[FEATURE_NAMES].values
    y = df["is_default"].values
    del df; gc.collect()
    X_train_raw, X_test_raw, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y)
    print(f"  Train: {len(y_train):,} | Test: {len(y_test):,}")

    # ── 3. Smart Scaling ──
    n_feat = len(FEATURE_NAMES)
    print(f"\n[3/9] Smart Per-Feature Scaling ({len(NUMERIC_FEATURES)} NUM + {len(CATEGORICAL_FEATURES)} CAT = {n_feat})...")
    scalers, X_train = create_per_feature_scalers(X_train_raw, FEATURE_NAMES)
    X_test = apply_per_feature_scalers(X_test_raw, scalers, FEATURE_NAMES)
    print(f"    {'Feature':30s} {'Type':8s} {'Strategy':15s}")
    print(f"    {'─'*30} {'─'*8} {'─'*15}")
    for fn in FEATURE_NAMES:
        ft = "NUM" if fn in NUMERIC_FEATURES else "CAT"
        print(f"    {fn:30s} {ft:8s} {FEATURE_SCALING_CONFIG[fn]:15s}")

    n_pos = y_train.sum(); n_neg = len(y_train) - n_pos
    scale_pos_wt = n_neg / n_pos
    print(f"\n  Class: neg={n_neg:,}, pos={n_pos:,}, scale_pos_weight={scale_pos_wt:.2f}")
    del X_train_raw, X_test_raw; gc.collect()

    # ══════════════════════════════════════════════
    # STAGE 1: XGBoost → Leaf Extraction
    # ══════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  STAGE 1: XGBoost — Non-linear Feature Learner")
    print("=" * 70)

    print("\n[4/9] Training XGBoost (T4 GPU)...")
    xgb_model = xgb.XGBClassifier(
        n_estimators=1500, max_depth=6, learning_rate=0.01,
        subsample=0.8, colsample_bytree=0.7, min_child_weight=10,
        gamma=0.3, reg_alpha=0.5, reg_lambda=2.0, max_bin=1024,
        scale_pos_weight=scale_pos_wt, random_state=RANDOM_STATE,
        eval_metric="auc", early_stopping_rounds=100,
        tree_method="hist", device="cuda",
    )
    xgb_model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
    n_trees = xgb_model.best_iteration + 1
    xgb_proba_test = xgb_model.predict_proba(X_test)[:, 1]
    xgb_auc = roc_auc_score(y_test, xgb_proba_test)
    print(f"  XGBoost: {n_trees} trees, AUC={xgb_auc:.4f}")

    # Extract leaf indices
    print(f"\n[5/9] Extracting leaf indices + OneHotEncode...")
    leaf_train = xgb_model.apply(X_train)  # (n_train, n_trees)
    leaf_test = xgb_model.apply(X_test)    # (n_test, n_trees)
    print(f"  Leaf shape: train={leaf_train.shape}, test={leaf_test.shape}")

    leaf_enc = OneHotEncoder(sparse_output=True, handle_unknown='ignore')
    L_train = leaf_enc.fit_transform(leaf_train)
    L_test = leaf_enc.transform(leaf_test)
    print(f"  OHE shape: train={L_train.shape}, test={L_test.shape}")

    # Combine: Leaf OHE + Original Features
    X_lr_train = hstack([L_train, csr_matrix(X_train)])
    X_lr_test = hstack([L_test, csr_matrix(X_test)])
    print(f"  LR input: {X_lr_train.shape} (leaf OHE + {n_feat} original)")

    del leaf_train, leaf_test, L_train, L_test; gc.collect()

    # ══════════════════════════════════════════════
    # STAGE 2: Logistic Regression — PD Generator
    # ══════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  STAGE 2: Logistic Regression — PD Generator")
    print("=" * 70)

    print(f"\n[6/9] Training LR on [Leaf OHE + {n_feat} Features]...")
    lr_model = LogisticRegression(
        C=1.0, penalty='l2', class_weight='balanced',
        max_iter=300, solver='saga', tol=1e-4,
        random_state=RANDOM_STATE,
    )
    lr_model.fit(X_lr_train, y_train)
    lr_proba_test = lr_model.predict_proba(X_lr_test)[:, 1]
    lr_auc = roc_auc_score(y_test, lr_proba_test)
    print(f"  LR AUC: {lr_auc:.4f}")
    print(f"  XGBoost raw AUC:  {xgb_auc:.4f}")
    print(f"  LR vs XGBoost:    {lr_auc - xgb_auc:+.4f}")

    # Extract LR coefficients for original features (last n_feat)
    lr_coefs_original = lr_model.coef_[0][-n_feat:]
    print(f"\n  LR Feature Coefficients (original {n_feat} features):")
    sorted_coef_idx = np.argsort(np.abs(lr_coefs_original))[::-1]
    for idx in sorted_coef_idx:
        fn = FEATURE_NAMES[idx]
        ft = "NUM" if fn in NUMERIC_FEATURES else "CAT"
        c = lr_coefs_original[idx]
        direction = "↑ risk" if c > 0 else "↓ risk"
        print(f"    [{ft:3s}] {fn:30s} coef={c:+.6f}  ({direction})")

    # ── Scorecard scores for analysis/charts ──
    scores_test = pd_to_score(lr_proba_test)
    scores_train = pd_to_score(lr_model.predict_proba(X_lr_train)[:, 1])

    # ── 7. Evaluate ──
    print("\n" + "=" * 70)
    print("  [7/9] EVALUATION")
    print("=" * 70)

    fpr_arr, tpr_arr, thresholds_arr = roc_curve(y_test, lr_proba_test)
    j_scores = tpr_arr - fpr_arr
    optimal_threshold = float(thresholds_arr[np.argmax(j_scores)])
    y_pred = (lr_proba_test >= optimal_threshold).astype(int)

    auc_val = roc_auc_score(y_test, lr_proba_test)
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred)
    rec = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)
    brier = brier_score_loss(y_test, lr_proba_test)
    logloss = log_loss(y_test, lr_proba_test)
    mcc = matthews_corrcoef(y_test, y_pred)
    bal_acc = balanced_accuracy_score(y_test, y_pred)
    kappa = cohen_kappa_score(y_test, y_pred)
    ks_stat = float(np.max(j_scores))

    print(f"\n  {'='*55}")
    print(f"  XGBoost + LR RESULTS")
    print(f"  {'='*55}")
    print(f"  Features:                 {n_feat} ({len(NUMERIC_FEATURES)} NUM + {len(CATEGORICAL_FEATURES)} CAT)")
    print(f"  Optimal Threshold:        {optimal_threshold:.4f}")
    print(f"  XGBoost raw AUC:          {xgb_auc:.4f}")
    print(f"  LR AUC:                   {auc_val:.4f}")
    print(f"  Accuracy:                 {acc:.4f}")
    print(f"  Balanced Accuracy:        {bal_acc:.4f}")
    print(f"  Precision:                {prec:.4f}")
    print(f"  Recall:                   {rec:.4f}")
    print(f"  F1 Score:                 {f1:.4f}")
    print(f"  Brier Score:              {brier:.4f}")
    print(f"  Log Loss:                 {logloss:.4f}")
    print(f"  MCC:                      {mcc:.4f}")
    print(f"  Cohen's Kappa:            {kappa:.4f}")
    print(f"  KS Statistic:             {ks_stat:.4f}")
    print(f"  {'='*55}")
    print(f"\n  Classification Report:")
    print(classification_report(y_test, y_pred, target_names=["Paid (0)", "Default (1)"]))

    # ── CV: 5-Fold XGBoost + LR Pipeline ──
    print("\n  Cross-Validation — 5-Fold XGBoost + LR Pipeline...")
    cv_outer = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=RANDOM_STATE + 100)
    cv_aucs = []
    fold_metrics_list = []

    for of, (otr, oval) in enumerate(cv_outer.split(X, y)):
        X_cv_tr_raw, X_cv_val_raw = X[otr], X[oval]
        y_cv_tr, y_cv_val = y[otr], y[oval]

        # Scale
        cv_sc, X_cv_tr = create_per_feature_scalers(X_cv_tr_raw, FEATURE_NAMES)
        X_cv_val = apply_per_feature_scalers(X_cv_val_raw, cv_sc, FEATURE_NAMES)

        # XGBoost → leaves → OHE
        cv_xgb = xgb.XGBClassifier(
            n_estimators=600, max_depth=5, learning_rate=0.01,
            subsample=0.8, colsample_bytree=0.7, min_child_weight=10,
            gamma=0.3, reg_alpha=0.5, reg_lambda=2.0,
            scale_pos_weight=n_neg/n_pos, random_state=RANDOM_STATE,
            eval_metric="auc", early_stopping_rounds=50,
            tree_method="hist", device="cuda",
        )
        cv_xgb.fit(X_cv_tr, y_cv_tr, eval_set=[(X_cv_val, y_cv_val)], verbose=False)
        cv_leaves_tr = cv_xgb.apply(X_cv_tr)
        cv_leaves_val = cv_xgb.apply(X_cv_val)
        cv_enc = OneHotEncoder(sparse_output=True, handle_unknown='ignore')
        cv_L_tr = cv_enc.fit_transform(cv_leaves_tr)
        cv_L_val = cv_enc.transform(cv_leaves_val)
        cv_X_lr_tr = hstack([cv_L_tr, csr_matrix(X_cv_tr)])
        cv_X_lr_val = hstack([cv_L_val, csr_matrix(X_cv_val)])

        # LR
        cv_lr = LogisticRegression(
            C=1.0, penalty='l2', class_weight='balanced',
            max_iter=200, solver='saga', random_state=RANDOM_STATE)
        cv_lr.fit(cv_X_lr_tr, y_cv_tr)
        cv_prob = cv_lr.predict_proba(cv_X_lr_val)[:, 1]

        fold_auc = roc_auc_score(y_cv_val, cv_prob)
        cv_aucs.append(fold_auc)
        cv_prd = (cv_prob >= optimal_threshold).astype(int)
        fold_metrics_list.append({
            'AUC': fold_auc,
            'Accuracy': accuracy_score(y_cv_val, cv_prd),
            'Precision': precision_score(y_cv_val, cv_prd, zero_division=0),
            'Recall': recall_score(y_cv_val, cv_prd, zero_division=0),
            'F1': f1_score(y_cv_val, cv_prd, zero_division=0),
            'Brier': brier_score_loss(y_cv_val, cv_prob),
            'LogLoss': log_loss(y_cv_val, cv_prob),
        })
        print(f"    Fold {of+1}: AUC = {fold_auc:.4f}")

    cv_mean = np.mean(cv_aucs); cv_std = np.std(cv_aucs)
    print(f"\n  >>> CV AUC: {cv_mean:.4f} ± {cv_std:.4f}")

    # ── 8. Save Artifacts (5 files) ──
    print("\n[8/9] Saving 5 artifacts...")
    os.makedirs(MODEL_DIR, exist_ok=True)

    xgb_model.save_model(os.path.join(MODEL_DIR, "xgb_pd_model.json"))
    joblib.dump(lr_model, os.path.join(MODEL_DIR, "lr_scorecard_model.joblib"))
    joblib.dump(leaf_enc, os.path.join(MODEL_DIR, "leaf_encoder.joblib"))
    joblib.dump(scalers, os.path.join(MODEL_DIR, "per_feature_scalers.joblib"))

    metadata = {
        "model_type": "xgboost_lr",
        "version": "8.0",
        "architecture": "XGBoost(leaf_indices) -> OHE -> LR(PD)",
        "data_source": {
            "accepted": "accepted_2007_to_2018Q4.csv (Lending Club)",
            "rejected": "rejected_2007_to_2018Q4.csv (EDA only)",
        },
        "feature_names": FEATURE_NAMES,
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "n_features": n_feat,
        "n_numeric": len(NUMERIC_FEATURES),
        "n_categorical": len(CATEGORICAL_FEATURES),
        "feature_system_mapping": {
            "credit_score": "CreditScore.score (150-750)",
            "capital": "LoanApplication.capital (VND)",
            "monthly_income": "User monthly income (VND)",
            "monthly_pay": "LoanApplication.monthlyPay (VND)",
            "revolving_balance": "revolving outstanding (VND)",
            "total_current_balance": "SUM(LoanApplication.outstandingAmount) (VND)",
            "dti": "Debt-to-Income ratio (%)",
            "revolving_util_percent": "Credit utilization (%)",
            "emp_length_years": "KYC employment years",
            "active_bad_debts": "LoanDelinquency count (pub_rec)",
            "bankruptcies": "Bankruptcy history",
            "active_loans": "Active loan count",
            "total_loans_history": "CreditScore.totalLoans",
            "credit_history_months": "Credit age from User.createdAt",
            "recent_inquiries": "Recent loan app count (90d)",
            "delinquencies_2yr": "CreditScore.latePayments",
            "accounts_delinquent": "Current delinquent accounts (debtGroup > 0)",
            "severe_delinquencies_24m": "Accounts 90+ DPD in 24m (debtGroup 3-5)",
            "pct_never_delinquent": "% loans never delinquent (clean ratio)",
            "collections_12m": "Debt collection actions 12m (collectionStage)",
            "loan_to_income": "capital / annual_income (auto-computed)",
            "term_enc": "LoanApplication.periodMonth",
            "home_ownership_enc": "KYC home ownership",
            "verification_status_enc": "User.kycStatus",
            "purpose_enc": "Loan purpose",
        },
        "encoding_maps": {
            "home_ownership": HOME_MAP,
            "verification_status": VERIFICATION_MAP,
            "purpose": PURPOSE_MAP,
            "emp_years": EMP_YEARS_MAP,
            "sub_grade_score": SUBGRADE_SCORE_MAP,
        },
        "n_trees_xgb": n_trees,
        "lr_C": 1.0,
        "lr_penalty": "l2",
        "lr_solver": "saga",
        "optimal_threshold": optimal_threshold,
        "test_metrics": {
            "xgb_raw_auc": round(xgb_auc, 4),
            "lr_auc": round(auc_val, 4),
            "accuracy": round(acc, 4),
            "balanced_accuracy": round(bal_acc, 4),
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1_score": round(f1, 4),
            "brier_score": round(brier, 4),
            "log_loss": round(logloss, 4),
            "mcc": round(mcc, 4),
            "kappa": round(kappa, 4),
            "ks_statistic": round(ks_stat, 4),
        },
        "lr_feature_coefs": {fn: round(float(lr_coefs_original[i]), 6) for i, fn in enumerate(FEATURE_NAMES)},
        "cv_auc_mean": round(cv_mean, 4),
        "cv_auc_std": round(cv_std, 4),
        "cv_aucs": [round(a, 4) for a in cv_aucs],
        "usd_to_vnd": USD_TO_VND,
        "scaling": "smart_per_feature",
        "scaling_strategies": {fn: FEATURE_SCALING_CONFIG[fn] for fn in FEATURE_NAMES},
        "train_size": len(y_train),
        "test_size": len(y_test),
    }
    with open(os.path.join(MODEL_DIR, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    print(f"\n  Artifacts saved to: {MODEL_DIR}")
    for fn in sorted(os.listdir(MODEL_DIR)):
        sz = os.path.getsize(os.path.join(MODEL_DIR, fn)) / 1024
        print(f"    {fn} ({sz:.0f} KB)")

    # ── 9. Charts ──
    print("\n" + "=" * 70)
    print("  [9/9] EXPORTING 20 CHARTS")
    print("=" * 70)
    plot_all_charts(
        y_test=y_test,
        y_prob_xgb=xgb_proba_test,
        y_prob_lr=lr_proba_test,
        y_pred_lr=y_pred,
        optimal_threshold=optimal_threshold,
        scores_test=scores_test,
        scores_train=scores_train,
        y_train=y_train,
        xgb_importances=xgb_model.feature_importances_,
        feature_names=FEATURE_NAMES,
        lr_coefs_original=lr_coefs_original,
        cv_aucs=cv_aucs,
        fold_metrics=fold_metrics_list,
        X_test_scaled=X_test,
        chart_dir=CHART_DIR,
    )

    elapsed = time.time() - t_start
    print("\n" + "=" * 70)
    print(f"  >>> TRAINING COMPLETE — {elapsed/60:.1f} min ({elapsed:.0f}s)")
    print(f"  Architecture: XGBoost ({n_trees} trees) + LR (Gold Standard)")
    print(f"  Features: {len(NUMERIC_FEATURES)} numeric + {len(CATEGORICAL_FEATURES)} categorical = {n_feat}")
    print(f"  LR AUC: {auc_val:.4f} | XGBoost raw AUC: {xgb_auc:.4f}")
    print(f"  CV AUC: {cv_mean:.4f} ± {cv_std:.4f}")
    print(f"  Output: ai_risk_score (0-100) + default_probability (0.0-1.0)")
    print(f"  Artifacts: {MODEL_DIR}")
    print(f"  Charts: {CHART_DIR}")
    print("=" * 70)

    return {'models': (xgb_model, lr_model, leaf_enc), 'scalers': scalers, 'metadata': metadata}


# ═════════════════════════════════════════════════════════════
#  SCORER — Inference (used after training)
# ═════════════════════════════════════════════════════════════
class CreditScorer:
    """XGBoost + LR scorer (v8.0).
    Load from MODEL_DIR, predict PD from 25 VND features.
    """
    def __init__(self, model_dir=MODEL_DIR):
        self.model_dir = model_dir
        self.xgb_model = xgb.XGBClassifier()
        self.xgb_model.load_model(os.path.join(model_dir, "xgb_pd_model.json"))
        self.lr_model = joblib.load(os.path.join(model_dir, "lr_scorecard_model.joblib"))
        self.leaf_encoder = joblib.load(os.path.join(model_dir, "leaf_encoder.joblib"))
        self.scalers = joblib.load(os.path.join(model_dir, "per_feature_scalers.joblib"))
        with open(os.path.join(model_dir, "metadata.json"), "r") as f:
            self.metadata = json.load(f)
        self.rf_model = self.lr_model  # backward compat

    def predict(self, features: dict) -> dict:
        f = self._process(features)
        X_raw = np.array([[f[n] for n in FEATURE_NAMES]])
        X = apply_per_feature_scalers(X_raw, self.scalers, FEATURE_NAMES)
        leaves = self.xgb_model.apply(X)
        L = self.leaf_encoder.transform(leaves)
        X_lr = hstack([L, csr_matrix(X)])
        pd_val = float(self.lr_model.predict_proba(X_lr)[0, 1])
        pd_val = min(max(pd_val, 1e-15), 1 - 1e-15)
        return {
            "ai_risk_score": int(round(min(max(pd_val, 0), 1) * 100)),
            "default_probability": round(pd_val, 4),
            "status": "success",
        }

    def _process(self, raw):
        """Map raw input → 25 features (VND context, system aliases)."""
        f = {}
        f["credit_score"] = min(max(float(raw.get("credit_score", 450)), 150), 750)
        f["capital"] = max(float(raw.get("capital", raw.get("loan_amnt", raw.get("loanAmount", 0)))), 0)
        f["monthly_income"] = max(float(raw.get("monthly_income", raw.get("monthlyIncome", 0))), 0)
        if f["monthly_income"] == 0:
            ann = float(raw.get("annual_inc", raw.get("annual_income", raw.get("annualIncome", 0))))
            if ann > 0: f["monthly_income"] = ann / 12
        f["monthly_pay"] = max(float(raw.get("monthly_pay", raw.get("monthlyPay", raw.get("monthlyPayment", 0)))), 0)
        f["revolving_balance"] = max(float(raw.get("revolving_balance", raw.get("revolvingBalance", raw.get("totalOutstanding", raw.get("revol_bal", 0))))), 0)
        f["total_current_balance"] = max(float(raw.get("total_current_balance", raw.get("totalOutstandingAll", raw.get("tot_cur_bal", 0)))), 0)
        f["dti"] = min(max(float(raw.get("dti", raw.get("debtToIncome", 0))), 0), 100)
        f["revolving_util_percent"] = min(max(float(raw.get("revolving_util_percent", raw.get("revolvingUtilization", raw.get("revol_util", 50)))), 0), 150)
        emp = raw.get("emp_length_years", raw.get("employmentYears", raw.get("emp_length", 3)))
        if isinstance(emp, (int, float)):
            f["emp_length_years"] = min(max(float(emp), 0.5), 10)
        else:
            f["emp_length_years"] = EMP_YEARS_MAP.get(str(emp), 3.0)
        f["active_bad_debts"] = min(max(float(raw.get("active_bad_debts", raw.get("publicRecords", raw.get("pub_rec", 0)))), 0), 20)
        f["bankruptcies"] = min(max(float(raw.get("bankruptcies", 0)), 0), 10)
        f["active_loans"] = min(max(float(raw.get("active_loans", raw.get("openAccounts", raw.get("open_acc", 5)))), 0), 50)
        f["total_loans_history"] = min(max(float(raw.get("total_loans_history", raw.get("totalAccounts", raw.get("total_acc", raw.get("totalLoans", 10))))), 0), 100)
        f["credit_history_months"] = min(max(float(raw.get("credit_history_months", raw.get("creditAge", 120))), 0), 600)
        f["recent_inquiries"] = min(max(float(raw.get("recent_inquiries", raw.get("inq_last_6mths", 0))), 0), 20)
        f["delinquencies_2yr"] = min(max(float(raw.get("delinquencies_2yr", raw.get("latePayments", raw.get("delinq_2yrs", 0)))), 0), 20)
        f["accounts_delinquent"] = min(max(float(raw.get("accounts_delinquent", raw.get("currentDelinquentAccounts", raw.get("acc_now_delinq", 0)))), 0), 10)
        f["severe_delinquencies_24m"] = min(max(float(raw.get("severe_delinquencies_24m", raw.get("severeDelinquencies", raw.get("num_tl_90g_dpd_24m", 0)))), 0), 20)
        f["pct_never_delinquent"] = min(max(float(raw.get("pct_never_delinquent", raw.get("cleanLoanRatio", raw.get("pct_tl_nvr_dlq", 100)))), 0), 100)
        f["collections_12m"] = min(max(float(raw.get("collections_12m", raw.get("collectionsLast12m", raw.get("collections_12_mths_ex_med", 0)))), 0), 10)
        annual_safe = max(f["monthly_income"] * 12, 1)
        f["loan_to_income"] = f["capital"] / annual_safe
        f["term_enc"] = float(raw.get("term", raw.get("term_months", raw.get("periodMonth", 36))))
        home = str(raw.get("home_ownership", raw.get("homeOwnership", "RENT"))).upper()
        f["home_ownership_enc"] = HOME_MAP.get(home, 3)
        vs = str(raw.get("verification_status", raw.get("kycStatus", "Not Verified")))
        f["verification_status_enc"] = VERIFICATION_MAP.get(vs, 0)
        purpose = str(raw.get("purpose", raw.get("loanPurpose", "other"))).lower()
        f["purpose_enc"] = PURPOSE_MAP.get(purpose, 3)
        return f


# ═════════════════════════════════════════════════════════════
if __name__ == "__main__":
    result = train_model()
