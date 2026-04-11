"""
╔══════════════════════════════════════════════════════════════════════════╗
║  AIScore — Explainable Hybrid (Google Colab)  v17.0                    ║
║  Dataset: Lending Club — accepted + rejected (2007-2018 Q4)            ║
║  Train + Evaluate + Score + 21 Charts — ALL IN ONE FILE                ║
║  + Stacking (XGB+LGBM+SC) + 47 Feat + int_rate + AccWeighted          ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  ARCHITECTURE — EXPLAINABLE HYBRID (WOE Scorecard + XGBoost):          ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━            ║
║                                                                        ║
║  Nhánh 1 — Minh bạch (Scorecard):                                     ║
║    WOE Binning → Logistic Regression → Credit Scorecard                ║
║    → Giải thích rành mạch: "Bị trừ 50 điểm vì 2 khoản nợ trễ,        ║
║      cộng 20 điểm vì làm việc trên 5 năm"                             ║
║    → Output: scorecard_pd (xác suất vỡ nợ theo scorecard)             ║
║                                                                        ║
║  Nhánh 2 — Sức mạnh (XGBoost):                                        ║
║    Full Data → 39 Features → XGBoost (deep HP + SPW + aucpr)          ║
║                                                                        ║
║  Nhánh 3 — Sức mạnh 2 (LightGBM):                                     ║
║    Full Data → 39 Features → LightGBM (GOSS + SPW + binary_logloss)  ║
║    → Dò tìm quy luật ẩn phi tuyến mà LR bỏ sót                       ║
║    → Output: xgb_pd (xác suất vỡ nợ theo XGBoost)                     ║
║                                                                        ║
║  Lai ghép (Hybrid):                                                    ║
║    hybrid_pd = α × scorecard_pd + (1-α) × xgb_pd                      ║
║    α tối ưu tự động trên validation (Stacking Meta-LR)                 ║
║    → Meta-LR(SC, XGB, LGBM) → Acc-Weighted threshold → Isotonic → PD  ║
║                                                                        ║
║  31 → 39 FEATURES (Lending Club → mapped to P2P system):                ║
║    NUMERIC (27): credit_score, capital, monthly_income, monthly_pay,   ║
║                  revolving_balance, total_current_balance, dti,         ║
║                  revolving_util_percent, emp_length_years,              ║
║                  active_bad_debts, bankruptcies, active_loans,          ║
║                  total_loans_history, credit_history_months,            ║
║                  recent_inquiries, delinquencies_2yr,                   ║
║                  accounts_delinquent, severe_delinquencies_24m,         ║
║                  pct_never_delinquent, collections_12m,                 ║
║                  loan_to_income                                         ║
║      INTERACTION (6): payment_burden, balance_income_ratio,            ║
║                  revolving_concentration, delinquency_severity,         ║
║                  inquiry_per_account, credit_quality_depth              ║
║      POWER (8, v15): income_per_loan, risk_accumulation,              ║
║                  term_loan_risk, dti_squared, score_utilization,        ║
║                  installment_income_term, delinquency_rate,             ║
║                  net_monthly_cashflow                                   ║
║    CATEGORY (4): term_enc, home_ownership_enc,                         ║
║                  verification_status_enc, purpose_enc                   ║
║                                                                        ║
║  DATA SOURCE:                                                          ║
║    accepted_2007_to_2018Q4.csv — 2.26M rows (labeled: train)          ║
║    rejected_2007_to_2018Q4.csv — 27.6M rows (EDA / comparison only)   ║
║                                                                        ║
║  OUTPUT: 7 Artifacts + 21 Charts + Test CSV + Metadata JSON            ║
║    xgb_pd_model.json, lr_scorecard_model.joblib,                       ║
║    woe_binning.joblib, per_feature_scalers.joblib,                     ║
║    iso_calibrator.joblib, scorecard_table.json, metadata.json          ║
╚══════════════════════════════════════════════════════════════════════════╝
"""

# ══════════════════════════════════════════════════════════
# CELL 0: Mount Google Drive + Install
# ══════════════════════════════════════════════════════════
from google.colab import drive
drive.mount('/content/drive')

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
from sklearn.linear_model import LogisticRegression, LogisticRegressionCV
from sklearn.preprocessing import StandardScaler, RobustScaler, MinMaxScaler
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score, fbeta_score,
    roc_auc_score, classification_report, confusion_matrix,
    brier_score_loss, log_loss, roc_curve, precision_recall_curve,
    average_precision_score, matthews_corrcoef, balanced_accuracy_score,
    cohen_kappa_score,
)
from sklearn.calibration import calibration_curve
from sklearn.isotonic import IsotonicRegression
import joblib
import json

try:
    import optuna
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    HAS_OPTUNA = True
except ImportError:
    HAS_OPTUNA = False
    print("[WARN] optuna not installed — using default XGBoost params. pip install optuna for HP tuning.")

try:
    from imblearn.combine import SMOTETomek
    from imblearn.over_sampling import SMOTE
    from imblearn.under_sampling import TomekLinks, RandomUnderSampler
    HAS_IMBLEARN = True
except ImportError:
    HAS_IMBLEARN = False
    print("[WARN] imblearn not installed — skipping SMOTE. pip install imbalanced-learn for resampling.")

try:
    import lightgbm as lgb
    HAS_LGBM = True
except ImportError:
    HAS_LGBM = False
    print("[WARN] lightgbm not installed — pip install lightgbm. Stacking will use XGB only.")

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)

# ===================== CONFIG =====================
RANDOM_STATE = 42
N_FOLDS = 5
WOE_BINS = 20  # Number of equal-frequency bins for WOE
IV_MIN_THRESHOLD = 0.02  # Features with IV < this are auto-removed ("Useless")

DATA_DIR = "/content/drive/MyDrive/Colab Notebooks"
ACCEPTED_CSV = os.path.join(DATA_DIR, "accepted_2007_to_2018Q4.csv")
REJECTED_CSV = os.path.join(DATA_DIR, "rejected_2007_to_2018Q4.csv")
MODEL_DIR = os.path.join(DATA_DIR, "models")
CHART_DIR = os.path.join(DATA_DIR, "charts")

DEFAULT_RATE = 25_000
MAX_SAMPLES = None          # None = use ALL data. Set integer to limit for low-RAM.
MIN_TEST_SAMPLES = 200_000  # Minimum test set size guarantee

# ── Scorecard Parameters ──
BASE_SCORE = 600
PDO = 20
BASE_ODDS = 50
FACTOR = PDO / np.log(2)
OFFSET = BASE_SCORE - FACTOR * np.log(BASE_ODDS)

# ── Imbalance handling ──
USE_SMOTE = False          # v14: DISABLED — XGBoost handles imbalance via scale_pos_weight natively
SMOTE_SAMPLING_STRATEGY = 0.5  # Only used if USE_SMOTE=True
SMOTE_MAX_SAMPLES = 500_000    # Only used if USE_SMOTE=True
THRESHOLD_METRIC = 'acc_weighted'  # v15: acc * sqrt(prec * rec) — prioritizes Accuracy over Prec/Rec

print(f"[config] Architecture: HYBRID v17.0 — Stacking(XGB+LGBM+SC) + 47 Features + int_rate + AccWeighted")
print(f"[config] Optuna HP tuning: {'AVAILABLE' if HAS_OPTUNA else 'NOT FOUND — will use grid search fallback'}")
print(f"[config] LightGBM: {'AVAILABLE' if HAS_LGBM else 'NOT FOUND — stacking without LGBM'}")
print(f"[config] Resampling: {'ENABLED' if USE_SMOTE and HAS_IMBLEARN else 'DISABLED (XGB uses scale_pos_weight)'}")
print(f"[config] Threshold metric: {THRESHOLD_METRIC}")
print(f"[config] Scorecard: Base={BASE_SCORE}, PDO={PDO}, Factor={FACTOR:.3f}")
print(f"[config] WOE bins: {WOE_BINS} | MAX_SAMPLES={MAX_SAMPLES}, MIN_TEST={MIN_TEST_SAMPLES:,}")

COLORS = {
    'xgb': '#2196F3', 'scorecard': '#FF9800',
    'hybrid': '#E91E63',
}
MODEL_LABELS = {
    'xgb': 'XGBoost (Nhánh 2)',
    'scorecard': 'WOE Scorecard (Nhánh 1)',
    'hybrid': 'Stacked (Meta-LR)',
    'lgbm': 'LightGBM (Nhánh 3)',
}


def pd_to_score(pd_arr):
    pd_c = np.clip(np.asarray(pd_arr, dtype=np.float64), 1e-15, 1 - 1e-15)
    odds = pd_c / (1 - pd_c)
    scores = OFFSET - FACTOR * np.log(odds)
    return np.clip(scores, 150, 950)


def score_to_pd(score_arr):
    s = np.asarray(score_arr, dtype=np.float64)
    log_odds = (OFFSET - s) / FACTOR
    odds = np.exp(log_odds)
    return odds / (1 + odds)


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
            req = urllib.request.Request(url, headers={"User-Agent": "aiscore-service/11.0"})
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


NUMERIC_FEATURES = [
    "credit_score", "capital", "monthly_income", "monthly_pay",
    "revolving_balance", "total_current_balance", "dti",
    "revolving_util_percent", "emp_length_years", "active_bad_debts",
    "bankruptcies", "active_loans", "total_loans_history",
    "credit_history_months", "recent_inquiries", "delinquencies_2yr",
    "accounts_delinquent", "severe_delinquencies_24m",
    "pct_never_delinquent", "collections_12m", "loan_to_income",
    # ── Interaction Features (v12) ──
    "payment_burden", "balance_income_ratio", "revolving_concentration",
    "delinquency_severity", "inquiry_per_account", "credit_quality_depth",
    # ── Power Features (v15) ──
    "income_per_loan", "risk_accumulation", "term_loan_risk",
    "dti_squared", "score_utilization", "installment_income_term",
    "delinquency_rate", "net_monthly_cashflow",
    # ── High-Signal Features (v17) ──
    "interest_rate", "revolving_credit_limit", "months_since_delinquency",
    "new_accounts_12m", "mortgage_accounts", "total_credit_limit",
    "rate_loan_risk", "credit_headroom_pct",
]

CATEGORICAL_FEATURES = [
    "term_enc", "home_ownership_enc", "verification_status_enc",
    "purpose_enc",
]

FEATURE_NAMES = NUMERIC_FEATURES + CATEGORICAL_FEATURES
print(f"[config] Features: {len(FEATURE_NAMES)} ({len(NUMERIC_FEATURES)} numeric + {len(CATEGORICAL_FEATURES)} categorical)")

ACCEPTED_USECOLS = [
    "sub_grade", "loan_amnt", "installment", "term", "emp_length",
    "home_ownership", "annual_inc", "verification_status", "loan_status",
    "purpose", "dti", "revol_util", "open_acc", "pub_rec",
    "pub_rec_bankruptcies", "total_acc", "revol_bal",
    "earliest_cr_line", "inq_last_6mths", "delinq_2yrs",
    "tot_cur_bal", "acc_now_delinq", "num_tl_90g_dpd_24m",
    "pct_tl_nvr_dlq", "collections_12_mths_ex_med",
    # v17: High-signal columns (especially int_rate)
    "int_rate", "total_rev_hi_lim", "mths_since_last_delinq",
    "num_tl_op_past_12m", "mort_acc", "tot_hi_cred_lim",
]

SUBGRADE_SCORE_MAP = {
    'A1': 750, 'A2': 732, 'A3': 715, 'A4': 697, 'A5': 679,
    'B1': 662, 'B2': 644, 'B3': 626, 'B4': 609, 'B5': 591,
    'C1': 574, 'C2': 556, 'C3': 538, 'C4': 521, 'C5': 503,
    'D1': 485, 'D2': 468, 'D3': 450, 'D4': 432, 'D5': 415,
    'E1': 397, 'E2': 379, 'E3': 362, 'E4': 344, 'E5': 326,
    'F1': 309, 'F2': 291, 'F3': 274, 'F4': 256, 'F5': 238,
    'G1': 221, 'G2': 203, 'G3': 185, 'G4': 168, 'G5': 150,
}

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


FEATURE_SCALING_CONFIG = {
    "credit_score": "standard", "capital": "log_standard",
    "monthly_income": "log_robust", "monthly_pay": "log_standard",
    "revolving_balance": "log_standard", "total_current_balance": "log_standard",
    "dti": "robust", "revolving_util_percent": "robust",
    "emp_length_years": "minmax", "active_bad_debts": "robust",
    "bankruptcies": "robust", "active_loans": "standard",
    "total_loans_history": "standard", "credit_history_months": "standard",
    "recent_inquiries": "robust", "delinquencies_2yr": "robust",
    "accounts_delinquent": "robust", "severe_delinquencies_24m": "robust",
    "pct_never_delinquent": "standard", "collections_12m": "robust",
    "loan_to_income": "log_robust",
    # Interaction features (v12)
    "payment_burden": "robust", "balance_income_ratio": "log_robust",
    "revolving_concentration": "robust", "delinquency_severity": "robust",
    "inquiry_per_account": "robust", "credit_quality_depth": "log_standard",
    # Power features (v15)
    "income_per_loan": "log_robust", "risk_accumulation": "robust",
    "term_loan_risk": "robust", "dti_squared": "robust",
    "score_utilization": "standard", "installment_income_term": "robust",
    "delinquency_rate": "robust", "net_monthly_cashflow": "log_robust",
    # High-Signal features (v17)
    "interest_rate": "standard", "revolving_credit_limit": "log_robust",
    "months_since_delinquency": "robust", "new_accounts_12m": "robust",
    "mortgage_accounts": "robust", "total_credit_limit": "log_robust",
    "rate_loan_risk": "robust", "credit_headroom_pct": "standard",
    "term_enc": "passthrough", "home_ownership_enc": "passthrough",
    "verification_status_enc": "passthrough", "purpose_enc": "passthrough",
}

# Monotonic constraints for XGBoost (domain knowledge)
# -1: feature ↑ → PD ↓ (protective)   1: feature ↑ → PD ↑ (risky)   0: no constraint
MONOTONIC_CONSTRAINTS = {
    "credit_score": -1,              # higher score → less default
    "capital": 0,                     # ambiguous (larger loan = more risk but also better borrower)
    "monthly_income": -1,             # higher income → less default
    "monthly_pay": 1,                 # higher payment burden → more stress
    "revolving_balance": 1,           # more revolving debt → more default
    "total_current_balance": 0,       # ambiguous
    "dti": 1,                         # higher DTI → more default
    "revolving_util_percent": 1,      # higher utilization → more default
    "emp_length_years": -1,           # more experience → less default
    "active_bad_debts": 1,            # more bad debts → more default
    "bankruptcies": 1,                # more bankruptcies → more default
    "active_loans": 0,                # ambiguous
    "total_loans_history": 0,         # ambiguous
    "credit_history_months": -1,      # longer history → less default
    "recent_inquiries": 1,            # more inquiries → credit-hungry → more default
    "delinquencies_2yr": 1,           # more delinquencies → more default
    "accounts_delinquent": 1,
    "severe_delinquencies_24m": 1,
    "pct_never_delinquent": -1,       # higher % → less default
    "collections_12m": 1,
    "loan_to_income": 1,              # higher ratio → more default
    "payment_burden": 1,              # higher burden → more default
    "balance_income_ratio": 1,        # higher leverage → more default
    "revolving_concentration": 1,     # more revolving-concentrated → more default
    "delinquency_severity": 1,        # higher severity → more default
    "inquiry_per_account": 1,         # more searching per account → more default
    "credit_quality_depth": -1,       # higher quality×depth → less default
    # Power features (v15)
    "income_per_loan": -1,            # more income per loan → less default
    "risk_accumulation": 1,           # more negative events → more default
    "term_loan_risk": 1,              # higher → more default
    "dti_squared": 1,                 # higher → more default (non-linear DTI)
    "score_utilization": -1,          # higher score*available_credit → less default
    "installment_income_term": 1,     # higher total payments / income → more default
    "delinquency_rate": 1,            # higher delinquency % → more default
    "net_monthly_cashflow": -1,       # more cash remaining → less default
    # High-Signal features (v17)
    "interest_rate": 1,               # higher rate → higher risk → more default
    "revolving_credit_limit": -1,     # higher credit limit → better borrower → less default
    "months_since_delinquency": -1,   # longer since last delinquency → less default
    "new_accounts_12m": 1,            # more new accounts → credit-hungry → more default
    "mortgage_accounts": -1,          # has mortgage → more established → less default
    "total_credit_limit": -1,         # higher total limit → better borrower → less default
    "rate_loan_risk": 1,              # higher rate × loan ratio → more default
    "credit_headroom_pct": -1,        # more available credit → less default
    "term_enc": 1,                    # longer term → more default (LC historical pattern)
    "home_ownership_enc": 0,          # ordinal encoding not monotonic
    "verification_status_enc": 0,
    "purpose_enc": 0,
}


# ═══════════════════════════════════════════════════════════
# PER-FEATURE SCALING (for XGBoost branch)
# ═══════════════════════════════════════════════════════════
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


# ═══════════════════════════════════════════════════════════
# WOE (Weight of Evidence) BINNING
# ═══════════════════════════════════════════════════════════
def compute_woe_binning(X_train_raw, y_train, feature_names, n_bins=WOE_BINS):
    """
    Tính WOE + IV cho mỗi feature bằng equal-frequency binning.
    Returns:
        woe_data: dict { feature_name: { 'edges': [...], 'woe_map': {bin_idx: woe}, 'iv': float } }
    """
    woe_data = {}
    n_good_total = float(np.sum(y_train == 0))
    n_bad_total = float(np.sum(y_train == 1))

    for i, fname in enumerate(feature_names):
        col = X_train_raw[:, i]

        # Equal-frequency bins (percentile-based)
        percentiles = np.linspace(0, 100, n_bins + 1)
        edges = np.unique(np.percentile(col, percentiles))

        # If too few unique values, use unique values as edges
        if len(edges) <= 2:
            unique_vals = np.unique(col)
            edges = np.concatenate([unique_vals, [unique_vals[-1] + 1]])

        # Digitize: bin 0, 1, ..., len(edges)-2
        bin_indices = np.digitize(col, edges[1:-1], right=False)

        woe_map = {}
        iv = 0.0
        for b in sorted(np.unique(bin_indices)):
            mask = bin_indices == b
            n_good = float(np.sum(y_train[mask] == 0))
            n_bad = float(np.sum(y_train[mask] == 1))

            # Laplace smoothing to avoid log(0)
            dist_good = (n_good + 0.5) / (n_good_total + 1.0)
            dist_bad = (n_bad + 0.5) / (n_bad_total + 1.0)

            woe = np.log(dist_good / dist_bad)
            woe_map[int(b)] = round(float(woe), 6)
            iv += (dist_good - dist_bad) * woe

        woe_data[fname] = {
            'edges': edges.tolist(),
            'woe_map': woe_map,
            'iv': round(float(iv), 6),
        }

    return woe_data


def apply_woe_transform(X_raw, feature_names, woe_data):
    """Transform raw features → WOE values using pre-computed binning."""
    X_woe = np.zeros_like(X_raw, dtype=np.float64)
    for i, fname in enumerate(feature_names):
        col = X_raw[:, i]
        fd = woe_data[fname]
        edges = np.array(fd['edges'])
        woe_map = fd['woe_map']
        bin_indices = np.digitize(col, edges[1:-1], right=False)

        # Vectorized WOE lookup with fallback to 0
        default_woe = 0.0
        woe_values = np.array([woe_map.get(int(b), default_woe) for b in bin_indices])
        X_woe[:, i] = woe_values
    return X_woe


def build_scorecard_table(lr_model, woe_data, feature_names):
    """
    Build traditional credit scorecard from LR coefficients + WOE bins.
    Each bin of each feature gets a "points" value.
    Total score = OFFSET + sum(feature_points)

    Points for bin j of feature i:
        points_ij = -(β_i × WOE_ij + intercept/n_features) × FACTOR
    """
    coefs = lr_model.coef_[0]
    intercept = lr_model.intercept_[0]
    n_features = len(feature_names)
    intercept_per_feature = intercept / n_features

    scorecard = {}
    for i, fname in enumerate(feature_names):
        fd = woe_data[fname]
        edges = fd['edges']
        woe_map = fd['woe_map']
        bins = []
        for bin_idx in sorted(woe_map.keys()):
            woe = woe_map[bin_idx]
            points = -(coefs[i] * woe + intercept_per_feature) * FACTOR
            # Human-readable bin range
            if bin_idx == 0:
                range_str = f"≤ {edges[1]:.2f}" if len(edges) > 1 else "all"
            elif bin_idx >= len(edges) - 2:
                range_str = f"> {edges[-2]:.2f}" if len(edges) > 1 else "all"
            else:
                low = edges[bin_idx] if bin_idx < len(edges) else edges[-1]
                high = edges[bin_idx + 1] if bin_idx + 1 < len(edges) else edges[-1]
                range_str = f"({low:.2f}, {high:.2f}]"
            bins.append({
                'bin': int(bin_idx),
                'range': range_str,
                'woe': round(float(woe), 4),
                'points': round(float(points), 2),
            })
        scorecard[fname] = {
            'coefficient': round(float(coefs[i]), 6),
            'iv': fd['iv'],
            'bins': bins,
        }

    return scorecard


def scorecard_predict_score(X_raw, feature_names, woe_data, lr_model):
    """Compute traditional scorecard points (sum of bin points per sample)."""
    coefs = lr_model.coef_[0]
    intercept = lr_model.intercept_[0]
    n_features = len(feature_names)
    intercept_per_feature = intercept / n_features
    n_samples = X_raw.shape[0]
    scores = np.full(n_samples, OFFSET)

    for i, fname in enumerate(feature_names):
        fd = woe_data[fname]
        edges = np.array(fd['edges'])
        woe_map = fd['woe_map']
        col = X_raw[:, i]
        bin_indices = np.digitize(col, edges[1:-1], right=False)
        for j in range(n_samples):
            woe = woe_map.get(int(bin_indices[j]), 0.0)
            scores[j] += -(coefs[i] * woe + intercept_per_feature) * FACTOR

    return np.clip(scores, 150, 950)


# ═══════════════════════════════════════════════════════════
# DATA LOADING
# ═══════════════════════════════════════════════════════════
def load_and_clean_data(accepted_path, rejected_path=None, chart_dir=None):
    print(f"  Loading accepted loans from {accepted_path}...")
    df = pd.read_csv(accepted_path, usecols=ACCEPTED_USECOLS, low_memory=False)
    print(f"  Raw accepted: {len(df):,} rows x {len(df.columns)} columns")
    df = df[df["loan_status"].isin(["Fully Paid", "Charged Off"])].copy()
    df["is_default"] = (df["loan_status"] == "Charged Off").astype(int)
    print(f"  After filtering: {len(df):,} rows | Default rate: {df['is_default'].mean():.2%}")
    rate = USD_TO_VND
    df["credit_score"] = df["sub_grade"].map(SUBGRADE_SCORE_MAP)
    df = df.dropna(subset=["credit_score"])
    df["capital"] = pd.to_numeric(df["loan_amnt"], errors='coerce') * rate
    df["monthly_income"] = pd.to_numeric(df["annual_inc"], errors='coerce') * rate / 12
    df["monthly_income"] = df["monthly_income"].clip(0, df["monthly_income"].quantile(0.99))
    df["monthly_pay"] = pd.to_numeric(df["installment"], errors='coerce') * rate
    df["monthly_pay"] = df["monthly_pay"].fillna(df["monthly_pay"].median())
    df["revolving_balance"] = pd.to_numeric(df["revol_bal"], errors='coerce') * rate
    df["revolving_balance"] = df["revolving_balance"].fillna(0).clip(0, df["revolving_balance"].quantile(0.99))
    df["total_current_balance"] = pd.to_numeric(df["tot_cur_bal"], errors='coerce') * rate
    df["total_current_balance"] = df["total_current_balance"].fillna(0).clip(0, df["total_current_balance"].quantile(0.99))
    df["dti"] = pd.to_numeric(df["dti"], errors='coerce').fillna(15).clip(0, 100)
    df["revolving_util_percent"] = pd.to_numeric(df["revol_util"], errors='coerce')
    df["revolving_util_percent"] = df["revolving_util_percent"].fillna(df["revolving_util_percent"].median()).clip(0, 150)
    df["emp_length_years"] = df["emp_length"].map(EMP_YEARS_MAP)
    df["emp_length_years"] = df["emp_length_years"].fillna(df["emp_length_years"].median()).clip(0.5, 10)
    df["active_bad_debts"] = pd.to_numeric(df["pub_rec"], errors='coerce').fillna(0).clip(0, 20)
    df["bankruptcies"] = pd.to_numeric(df["pub_rec_bankruptcies"], errors='coerce').fillna(0).clip(0, 10)
    df["active_loans"] = pd.to_numeric(df["open_acc"], errors='coerce')
    df["active_loans"] = df["active_loans"].fillna(df["active_loans"].median()).clip(0, 50)
    df["total_loans_history"] = pd.to_numeric(df["total_acc"], errors='coerce')
    df["total_loans_history"] = df["total_loans_history"].fillna(df["total_loans_history"].median()).clip(0, 100)
    df["earliest_cr_line"] = pd.to_datetime(df["earliest_cr_line"], format='%b-%Y', errors='coerce')
    reference_date = pd.Timestamp("2015-06-01")
    df["credit_history_months"] = ((reference_date - df["earliest_cr_line"]).dt.days / 30.44).clip(0, 600)
    df["credit_history_months"] = df["credit_history_months"].fillna(df["credit_history_months"].median())
    df["recent_inquiries"] = pd.to_numeric(df["inq_last_6mths"], errors='coerce').fillna(0).clip(0, 20)
    df["delinquencies_2yr"] = pd.to_numeric(df["delinq_2yrs"], errors='coerce').fillna(0).clip(0, 20)
    df["accounts_delinquent"] = pd.to_numeric(df["acc_now_delinq"], errors='coerce').fillna(0).clip(0, 10)
    df["severe_delinquencies_24m"] = pd.to_numeric(df["num_tl_90g_dpd_24m"], errors='coerce').fillna(0).clip(0, 20)
    df["pct_never_delinquent"] = pd.to_numeric(df["pct_tl_nvr_dlq"], errors='coerce').fillna(100).clip(0, 100)
    df["collections_12m"] = pd.to_numeric(df["collections_12_mths_ex_med"], errors='coerce').fillna(0).clip(0, 10)
    annual_safe = (df["monthly_income"] * 12).clip(lower=1)
    df["loan_to_income"] = df["capital"] / annual_safe
    df["loan_to_income"] = df["loan_to_income"].clip(0, df["loan_to_income"].quantile(0.99))

    # ── Interaction Features (v12) ──
    # Gánh nặng trả nợ: monthly_pay chiếm bao nhiêu monthly_income
    df["payment_burden"] = df["monthly_pay"] / (df["monthly_income"] + 1)
    df["payment_burden"] = df["payment_burden"].clip(0, df["payment_burden"].quantile(0.99))
    # Tỉ lệ dư nợ / thu nhập năm → đòn bẩy tài chính tổng thể
    df["balance_income_ratio"] = df["total_current_balance"] / (df["monthly_income"] * 12 + 1)
    df["balance_income_ratio"] = df["balance_income_ratio"].clip(0, df["balance_income_ratio"].quantile(0.99))
    # Tập trung nợ quay vòng: revolving_balance chiếm bao nhiêu total_balance
    df["revolving_concentration"] = df["revolving_balance"] / (df["total_current_balance"] + 1)
    df["revolving_concentration"] = df["revolving_concentration"].clip(0, 1)
    # Mức độ quá hạn tổng hợp (có trọng số: nặng → cao hơn)
    df["delinquency_severity"] = (
        df["delinquencies_2yr"]
        + 2 * df["accounts_delinquent"]
        + 3 * df["severe_delinquencies_24m"]
    )
    df["delinquency_severity"] = df["delinquency_severity"].clip(0, df["delinquency_severity"].quantile(0.99))
    # Số truy vấn / khoản vay hoạt động → hành vi tìm kiếm tín dụng
    df["inquiry_per_account"] = df["recent_inquiries"] / (df["active_loans"] + 1)
    df["inquiry_per_account"] = df["inquiry_per_account"].clip(0, df["inquiry_per_account"].quantile(0.99))
    # Chiều sâu × chất lượng lịch sử tín dụng
    df["credit_quality_depth"] = df["credit_history_months"] * df["pct_never_delinquent"] / 100

    # ── Categorical Encoding (phải trước Power Features vì chúng dùng term_enc) ──
    df["term_enc"] = df["term"].str.extract(r"(\d+)").astype(float)
    df["home_ownership_enc"] = df["home_ownership"].map(HOME_MAP).fillna(3).astype(int)
    df["verification_status_enc"] = df["verification_status"].map(VERIFICATION_MAP).fillna(0).astype(int)
    df["purpose_enc"] = df["purpose"].map(PURPOSE_MAP).fillna(3).astype(int)

    # ── Power Features (v15) — 8 features bổ sung tăng AUC ──
    # Thu nhập trên mỗi khoản vay → khả năng chi trả per-loan
    df["income_per_loan"] = df["monthly_income"] / (df["active_loans"] + 1)
    df["income_per_loan"] = df["income_per_loan"].clip(0, df["income_per_loan"].quantile(0.99))
    # Tổng hợp sự kiện tiêu cực (có trọng số: phá sản nặng nhất)
    df["risk_accumulation"] = (
        df["active_bad_debts"]
        + 2 * df["bankruptcies"]
        + 3 * df["severe_delinquencies_24m"]
        + df["delinquencies_2yr"]
        + df["collections_12m"]
    )
    df["risk_accumulation"] = df["risk_accumulation"].clip(0, df["risk_accumulation"].quantile(0.99))
    # Kỳ hạn × tỷ lệ vay/thu nhập → rủi ro kéo dài
    df["term_loan_risk"] = (df["term_enc"] / 36) * df["loan_to_income"]
    df["term_loan_risk"] = df["term_loan_risk"].clip(0, df["term_loan_risk"].quantile(0.99))
    # DTI bình phương → DTI cao thì rủi ro tăng phi tuyến
    df["dti_squared"] = (df["dti"] / 100) ** 2
    # Điểm tín dụng × dư địa sử dụng tín dụng
    df["score_utilization"] = df["credit_score"] * (1 - df["revolving_util_percent"] / 150)
    # Tổng số tiền trả / thu nhập (kỳ hạn × monthly_pay / monthly_income)
    annual_income_safe = (df["monthly_income"] * 12).clip(lower=1)
    df["installment_income_term"] = df["monthly_pay"] * df["term_enc"] / annual_income_safe
    df["installment_income_term"] = df["installment_income_term"].clip(0, df["installment_income_term"].quantile(0.99))
    # Tỷ lệ quá hạn / tổng lịch sử vay
    df["delinquency_rate"] = (df["delinquencies_2yr"] + df["accounts_delinquent"]) / (df["total_loans_history"] + 1)
    df["delinquency_rate"] = df["delinquency_rate"].clip(0, df["delinquency_rate"].quantile(0.99))
    # Tiền mặt ròng hàng tháng (monthly_income - monthly_pay): >0 = an toàn
    df["net_monthly_cashflow"] = (df["monthly_income"] - df["monthly_pay"]).clip(lower=0)
    df["net_monthly_cashflow"] = df["net_monthly_cashflow"].clip(0, df["net_monthly_cashflow"].quantile(0.99))

    # ── High-Signal Features from LC Dataset (v17) ──────────────────────
    # int_rate: stored as "10.65%" string → parse to float
    df["interest_rate"] = pd.to_numeric(
        df["int_rate"].astype(str).str.replace('%', '', regex=False), errors='coerce'
    )
    df["interest_rate"] = df["interest_rate"].fillna(df["interest_rate"].median()).clip(0, 40)
    # Revolving credit limit (USD → VND)
    df["revolving_credit_limit"] = pd.to_numeric(df["total_rev_hi_lim"], errors='coerce') * rate
    df["revolving_credit_limit"] = df["revolving_credit_limit"].fillna(0).clip(0, df["revolving_credit_limit"].quantile(0.99))
    # Months since last delinquency (NaN = never delinquent → 999)
    df["months_since_delinquency"] = pd.to_numeric(df["mths_since_last_delinq"], errors='coerce')
    df["months_since_delinquency"] = df["months_since_delinquency"].fillna(999).clip(0, 999)
    # Number of trade lines opened in past 12 months
    df["new_accounts_12m"] = pd.to_numeric(df["num_tl_op_past_12m"], errors='coerce').fillna(0).clip(0, 20)
    # Number of mortgage accounts
    df["mortgage_accounts"] = pd.to_numeric(df["mort_acc"], errors='coerce').fillna(0).clip(0, 20)
    # Total high credit limit (USD → VND)
    df["total_credit_limit"] = pd.to_numeric(df["tot_hi_cred_lim"], errors='coerce') * rate
    df["total_credit_limit"] = df["total_credit_limit"].fillna(0).clip(0, df["total_credit_limit"].quantile(0.99))
    # Interaction: interest_rate × loan_to_income (high rate + high ratio = very risky)
    df["rate_loan_risk"] = df["interest_rate"] * df["loan_to_income"]
    df["rate_loan_risk"] = df["rate_loan_risk"].clip(0, df["rate_loan_risk"].quantile(0.99))
    # Credit headroom: fraction of revolving credit still available
    df["credit_headroom_pct"] = 1 - df["revolving_balance"] / (df["revolving_credit_limit"] + 1)
    df["credit_headroom_pct"] = df["credit_headroom_pct"].clip(-1, 1)

    before = len(df)
    df = df[FEATURE_NAMES + ["is_default"]].dropna()
    dropped = before - len(df)
    if dropped > 0:
        print(f"  Dropped {dropped:,} rows with NaN ({dropped/before:.2%})")
    if MAX_SAMPLES and len(df) > MAX_SAMPLES:
        print(f"\n  Downsampling: {len(df):,} -> {MAX_SAMPLES:,} (stratified)")
        from sklearn.model_selection import train_test_split as _tts
        df, _discard = _tts(df, train_size=MAX_SAMPLES, stratify=df["is_default"], random_state=RANDOM_STATE)
        del _discard; gc.collect()
    print(f"\n  Final: {len(df):,} rows x {len(FEATURE_NAMES)} features")
    for fn in FEATURE_NAMES:
        ftype = "NUM" if fn in NUMERIC_FEATURES else "CAT"
        v = df[fn]
        print(f"    [{ftype}] {fn:30s} min={v.min():>12.2f}  med={v.median():>12.2f}  max={v.max():>12.2f}")
    if rejected_path and os.path.exists(rejected_path):
        try:
            df_rej = pd.read_csv(rejected_path, low_memory=False, nrows=1_000_000)
            print(f"\n  Rejected EDA: {len(df_rej):,} rows")
            if chart_dir:
                os.makedirs(chart_dir, exist_ok=True)
                fig, axes = plt.subplots(1, 3, figsize=(20, 6))
                df_rej["risk_score"] = pd.to_numeric(df_rej["Risk_Score"], errors='coerce')
                df_rej["dti_clean"] = pd.to_numeric(df_rej["Debt-To-Income Ratio"].str.replace('%','',regex=False), errors='coerce')
                df_rej["amount"] = pd.to_numeric(df_rej["Amount Requested"], errors='coerce')
                axes[0].hist(df["credit_score"].values, bins=50, alpha=0.6, color='#4CAF50', density=True, label='Accepted')
                axes[0].hist(df_rej["risk_score"].dropna().values, bins=50, alpha=0.6, color='#F44336', density=True, label='Rejected')
                axes[0].set_title('Credit Score'); axes[0].legend(fontsize=9)
                axes[1].hist(df["dti"].values, bins=50, alpha=0.6, color='#4CAF50', density=True, label='Accepted')
                axes[1].hist(df_rej["dti_clean"].dropna().clip(0,100).values, bins=50, alpha=0.6, color='#F44336', density=True, label='Rejected')
                axes[1].set_title('DTI'); axes[1].legend(fontsize=9)
                axes[2].hist((df["capital"]/rate).values, bins=50, alpha=0.6, color='#4CAF50', density=True, label='Accepted')
                axes[2].hist(df_rej["amount"].dropna().values, bins=50, alpha=0.6, color='#F44336', density=True, label='Rejected')
                axes[2].set_title('Loan Amount (USD)'); axes[2].legend(fontsize=9)
                fig.suptitle('Accepted vs Rejected', fontsize=15, fontweight='bold'); fig.tight_layout()
                fig.savefig(os.path.join(chart_dir, '00_accepted_vs_rejected.png'), dpi=200, bbox_inches='tight'); plt.close(fig)
            del df_rej; gc.collect()
        except Exception as e:
            print(f"  [WARN] Rejected CSV: {e}")
    return df


# ═══════════════════════════════════════════════════════════
# OPTIMAL THRESHOLD FINDER
# ═══════════════════════════════════════════════════════════
def find_optimal_threshold(y_true, proba, metric='f1', beta=2):
    """
    Find the classification threshold that maximizes the chosen metric.
    This is CRITICAL for imbalanced data — fixed 0.50 is almost never optimal.

    Supports: 'f1', 'f2', 'balanced_accuracy', 'youden_j'
    Returns: (best_threshold, best_score)
    """
    thresholds = np.arange(0.05, 0.90, 0.005)
    best_t, best_score = 0.50, 0.0
    for t in thresholds:
        preds = (proba >= t).astype(int)
        if np.sum(preds) == 0 or np.sum(preds) == len(preds):
            continue
        if metric == 'f1':
            sc = f1_score(y_true, preds, zero_division=0)
        elif metric == 'f2':
            sc = fbeta_score(y_true, preds, beta=2, zero_division=0)
        elif metric == 'balanced_accuracy':
            sc = balanced_accuracy_score(y_true, preds)
        elif metric == 'youden_j':
            tn = np.sum((preds == 0) & (y_true == 0))
            fp = np.sum((preds == 1) & (y_true == 0))
            fn = np.sum((preds == 0) & (y_true == 1))
            tp = np.sum((preds == 1) & (y_true == 1))
            sensitivity = tp / (tp + fn) if (tp + fn) > 0 else 0
            specificity = tn / (tn + fp) if (tn + fp) > 0 else 0
            sc = sensitivity + specificity - 1
        elif metric == 'gmean_pra':
            acc = accuracy_score(y_true, preds)
            prec = precision_score(y_true, preds, zero_division=0)
            rec = recall_score(y_true, preds, zero_division=0)
            sc = (acc * prec * rec) ** (1/3) if min(acc, prec, rec) > 0 else 0
        elif metric == 'acc_weighted':
            acc = accuracy_score(y_true, preds)
            prec = precision_score(y_true, preds, zero_division=0)
            rec = recall_score(y_true, preds, zero_division=0)
            sc = acc * (prec * rec) ** 0.5 if min(prec, rec) > 0 else 0
        else:
            sc = f1_score(y_true, preds, zero_division=0)
        if sc > best_score:
            best_score = sc
            best_t = float(t)
    return round(best_t, 3), round(best_score, 4)


# ═══════════════════════════════════════════════════════════
# MODEL BUILDERS
# ═══════════════════════════════════════════════════════════
def _get_monotonic_tuple(feature_names):
    """Build monotonic_constraints tuple for XGBoost from MONOTONIC_CONSTRAINTS dict."""
    return tuple(MONOTONIC_CONSTRAINTS.get(fn, 0) for fn in feature_names)


def _build_xgb(spw, feature_names, random_state=RANDOM_STATE, tuned_params=None):
    mc = _get_monotonic_tuple(feature_names)
    if tuned_params:
        # scale_pos_weight may be in tuned_params (SPW tuning)
        params = {k: v for k, v in tuned_params.items() if k != 'scale_pos_weight'}
        final_spw = tuned_params.get('scale_pos_weight', spw)
        return xgb.XGBClassifier(
            n_estimators=2500, **params,
            monotone_constraints=mc,
            scale_pos_weight=final_spw, random_state=random_state,
            eval_metric="aucpr", early_stopping_rounds=150,
            tree_method="hist", device="cpu",
        )
    return xgb.XGBClassifier(
        n_estimators=1500, max_depth=7, learning_rate=0.03,
        subsample=0.85, colsample_bytree=0.7, min_child_weight=10,
        gamma=0.2, reg_alpha=0.3, reg_lambda=2.0, max_bin=256,
        monotone_constraints=mc,
        scale_pos_weight=spw, random_state=random_state,
        eval_metric="aucpr", early_stopping_rounds=100,
        tree_method="hist", device="cpu",
    )


def _tune_xgb(X_train, y_train, feature_names, scale_pos_wt, tune_size=300_000):
    """HP search: Optuna (50 trials) if available, else grid search (18 combos).
    v14.0: Optimizes gmean_pra (balanced Acc*Prec*Rec) + deeper trees + wider SPW."""
    mc = _get_monotonic_tuple(feature_names)
    n = min(tune_size, len(y_train))
    if n < len(y_train):
        rng = np.random.RandomState(RANDOM_STATE)
        idx = rng.choice(len(y_train), n, replace=False)
        X_t, y_t = X_train[idx], y_train[idx]
        print(f"    Tuning subset: {n:,} / {len(y_train):,} samples")
    else:
        X_t, y_t = X_train, y_train

    def _eval_params(params, n_est=800, es=60, n_folds=3):
        """Evaluate params by F1 at optimal threshold (not AUC)."""
        kf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=RANDOM_STATE)
        scores = []
        spw = params.pop('scale_pos_weight', scale_pos_wt)
        for tr_idx, val_idx in kf.split(X_t, y_t):
            model = xgb.XGBClassifier(
                n_estimators=n_est, **params,
                monotone_constraints=mc,
                scale_pos_weight=spw, random_state=RANDOM_STATE,
                eval_metric="aucpr", early_stopping_rounds=es,
                tree_method="hist", device="cpu",
            )
            model.fit(X_t[tr_idx], y_t[tr_idx],
                      eval_set=[(X_t[val_idx], y_t[val_idx])], verbose=False)
            pred = model.predict_proba(X_t[val_idx])[:, 1]
            # Optimize for chosen metric at best threshold
            best_t, best_f1 = find_optimal_threshold(y_t[val_idx], pred, metric=THRESHOLD_METRIC)
            scores.append(best_f1)
            del model; gc.collect()
        params['scale_pos_weight'] = spw  # restore
        return np.mean(scores)

    if HAS_OPTUNA:
        print(f"    Optuna Bayesian search (50 trials, 3-fold CV, metric={THRESHOLD_METRIC})...")
        def objective(trial):
            params = {
                'max_depth': trial.suggest_int('max_depth', 5, 10),
                'learning_rate': trial.suggest_float('learning_rate', 0.005, 0.15, log=True),
                'subsample': trial.suggest_float('subsample', 0.65, 0.95),
                'colsample_bytree': trial.suggest_float('colsample_bytree', 0.5, 0.9),
                'min_child_weight': trial.suggest_int('min_child_weight', 3, 50),
                'gamma': trial.suggest_float('gamma', 0.01, 1.0, log=True),
                'reg_alpha': trial.suggest_float('reg_alpha', 0.01, 5.0, log=True),
                'reg_lambda': trial.suggest_float('reg_lambda', 0.5, 10.0, log=True),
                'scale_pos_weight': trial.suggest_float('scale_pos_weight', 1.5, 8.0),
            }
            return _eval_params(params)
        study = optuna.create_study(
            direction='maximize',
            sampler=optuna.samplers.TPESampler(seed=RANDOM_STATE),
        )
        study.optimize(objective, n_trials=50, show_progress_bar=True)
        return study.best_params, study.best_value
    else:
        print(f"    Grid search fallback (18 combos with SPW sweep, 3-fold CV, metric={THRESHOLD_METRIC})...")
        base_params = [
            {'max_depth': 5, 'learning_rate': 0.05, 'subsample': 0.85, 'colsample_bytree': 0.75,
             'min_child_weight': 5, 'gamma': 0.1, 'reg_alpha': 0.1, 'reg_lambda': 1.0},
            {'max_depth': 6, 'learning_rate': 0.03, 'subsample': 0.85, 'colsample_bytree': 0.7,
             'min_child_weight': 8, 'gamma': 0.15, 'reg_alpha': 0.2, 'reg_lambda': 1.5},
            {'max_depth': 7, 'learning_rate': 0.03, 'subsample': 0.8, 'colsample_bytree': 0.7,
             'min_child_weight': 10, 'gamma': 0.2, 'reg_alpha': 0.3, 'reg_lambda': 2.0},
            {'max_depth': 8, 'learning_rate': 0.02, 'subsample': 0.8, 'colsample_bytree': 0.65,
             'min_child_weight': 15, 'gamma': 0.3, 'reg_alpha': 0.5, 'reg_lambda': 3.0},
            {'max_depth': 9, 'learning_rate': 0.02, 'subsample': 0.75, 'colsample_bytree': 0.6,
             'min_child_weight': 20, 'gamma': 0.4, 'reg_alpha': 0.8, 'reg_lambda': 4.0},
            {'max_depth': 6, 'learning_rate': 0.05, 'subsample': 0.9, 'colsample_bytree': 0.8,
             'min_child_weight': 5, 'gamma': 0.1, 'reg_alpha': 0.1, 'reg_lambda': 1.0},
        ]
        # v14.0: SPW candidates centered around true imbalance ratio (~4)
        spw_candidates = [3.0, 4.0, 5.0]
        param_grid = []
        for bp in base_params:
            for spw_val in spw_candidates:
                p = dict(bp)
                p['scale_pos_weight'] = round(spw_val, 2)
                param_grid.append(p)
        best_score = 0
        best_params = param_grid[0]
        for i, params in enumerate(param_grid):
            score = _eval_params(dict(params))  # copy to avoid mutation
            spw_v = params.get('scale_pos_weight', scale_pos_wt)
            print(f"      [{i+1}/{len(param_grid)}] depth={params['max_depth']} lr={params['learning_rate']} "
                  f"spw={spw_v:.1f} → {THRESHOLD_METRIC}={score:.4f}")
            if score > best_score:
                best_score = score
                best_params = dict(params)
        return best_params, best_score


# ═══════════════════════════════════════════════════════════
# LIGHTGBM MODEL BUILDERS (v16.0 — Nhánh 3)
# ═══════════════════════════════════════════════════════════
def _get_lgbm_monotone(feature_names):
    """Build monotone_constraints list for LightGBM."""
    return [MONOTONIC_CONSTRAINTS.get(fn, 0) for fn in feature_names]


def _build_lgbm(spw, feature_names, random_state=RANDOM_STATE, tuned_params=None):
    mc = _get_lgbm_monotone(feature_names)
    if tuned_params:
        params = {k: v for k, v in tuned_params.items() if k != 'scale_pos_weight'}
        final_spw = tuned_params.get('scale_pos_weight', spw)
        return lgb.LGBMClassifier(
            n_estimators=2500, **params,
            monotone_constraints=mc,
            scale_pos_weight=final_spw, random_state=random_state,
            metric="auc", verbose=-1,
            boosting_type="gbdt",
        )
    return lgb.LGBMClassifier(
        n_estimators=1500, max_depth=7, learning_rate=0.03,
        subsample=0.85, colsample_bytree=0.7, min_child_samples=50,
        reg_alpha=0.3, reg_lambda=2.0, num_leaves=63,
        monotone_constraints=mc,
        scale_pos_weight=spw, random_state=random_state,
        metric="auc", verbose=-1,
        boosting_type="gbdt",
    )


def _tune_lgbm(X_train, y_train, feature_names, scale_pos_wt, tune_size=300_000):
    """HP search for LightGBM: Optuna (40 trials) or grid search (18 combos)."""
    mc = _get_lgbm_monotone(feature_names)
    n = min(tune_size, len(y_train))
    if n < len(y_train):
        rng = np.random.RandomState(RANDOM_STATE + 1)
        idx = rng.choice(len(y_train), n, replace=False)
        X_t, y_t = X_train[idx], y_train[idx]
        print(f"    Tuning subset: {n:,} / {len(y_train):,} samples")
    else:
        X_t, y_t = X_train, y_train

    def _eval_params(params, n_est=800, n_folds=3):
        kf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=RANDOM_STATE)
        scores = []
        spw = params.pop('scale_pos_weight', scale_pos_wt)
        for tr_idx, val_idx in kf.split(X_t, y_t):
            model = lgb.LGBMClassifier(
                n_estimators=n_est, **params,
                monotone_constraints=mc,
                scale_pos_weight=spw, random_state=RANDOM_STATE,
                metric="auc", verbose=-1,
                boosting_type="gbdt",
            )
            model.fit(X_t[tr_idx], y_t[tr_idx],
                      eval_set=[(X_t[val_idx], y_t[val_idx])],
                      callbacks=[lgb.early_stopping(80, verbose=False)])
            pred = model.predict_proba(X_t[val_idx])[:, 1]
            best_t, best_sc = find_optimal_threshold(y_t[val_idx], pred, metric=THRESHOLD_METRIC)
            scores.append(best_sc)
            del model; gc.collect()
        params['scale_pos_weight'] = spw
        return np.mean(scores)

    if HAS_OPTUNA:
        print(f"    Optuna Bayesian search (40 trials, 3-fold CV, metric={THRESHOLD_METRIC})...")
        def objective(trial):
            params = {
                'num_leaves': trial.suggest_int('num_leaves', 31, 127),
                'max_depth': trial.suggest_int('max_depth', 5, 10),
                'learning_rate': trial.suggest_float('learning_rate', 0.005, 0.15, log=True),
                'subsample': trial.suggest_float('subsample', 0.65, 0.95),
                'colsample_bytree': trial.suggest_float('colsample_bytree', 0.5, 0.9),
                'min_child_samples': trial.suggest_int('min_child_samples', 20, 100),
                'reg_alpha': trial.suggest_float('reg_alpha', 0.01, 5.0, log=True),
                'reg_lambda': trial.suggest_float('reg_lambda', 0.5, 10.0, log=True),
                'scale_pos_weight': trial.suggest_float('scale_pos_weight', 1.5, 8.0),
            }
            return _eval_params(params)
        study = optuna.create_study(
            direction='maximize',
            sampler=optuna.samplers.TPESampler(seed=RANDOM_STATE + 1),
        )
        study.optimize(objective, n_trials=40, show_progress_bar=True)
        return study.best_params, study.best_value
    else:
        print(f"    Grid search fallback (18 combos, 3-fold CV, metric={THRESHOLD_METRIC})...")
        base_params = [
            {'num_leaves': 63, 'max_depth': 6, 'learning_rate': 0.05, 'subsample': 0.85,
             'colsample_bytree': 0.75, 'min_child_samples': 30, 'reg_alpha': 0.1, 'reg_lambda': 1.0},
            {'num_leaves': 63, 'max_depth': 7, 'learning_rate': 0.03, 'subsample': 0.85,
             'colsample_bytree': 0.7, 'min_child_samples': 50, 'reg_alpha': 0.3, 'reg_lambda': 2.0},
            {'num_leaves': 127, 'max_depth': 8, 'learning_rate': 0.03, 'subsample': 0.8,
             'colsample_bytree': 0.65, 'min_child_samples': 50, 'reg_alpha': 0.5, 'reg_lambda': 3.0},
            {'num_leaves': 127, 'max_depth': 9, 'learning_rate': 0.02, 'subsample': 0.8,
             'colsample_bytree': 0.6, 'min_child_samples': 70, 'reg_alpha': 0.8, 'reg_lambda': 4.0},
            {'num_leaves': 63, 'max_depth': 6, 'learning_rate': 0.05, 'subsample': 0.9,
             'colsample_bytree': 0.8, 'min_child_samples': 30, 'reg_alpha': 0.1, 'reg_lambda': 1.0},
            {'num_leaves': 95, 'max_depth': 7, 'learning_rate': 0.04, 'subsample': 0.85,
             'colsample_bytree': 0.7, 'min_child_samples': 40, 'reg_alpha': 0.2, 'reg_lambda': 1.5},
        ]
        spw_candidates = [3.0, 4.0, 5.0]
        param_grid = []
        for bp in base_params:
            for spw_val in spw_candidates:
                p = dict(bp)
                p['scale_pos_weight'] = round(spw_val, 2)
                param_grid.append(p)
        best_score = 0
        best_params = param_grid[0]
        for i, params in enumerate(param_grid):
            score = _eval_params(dict(params))
            spw_v = params.get('scale_pos_weight', scale_pos_wt)
            print(f"      [{i+1}/{len(param_grid)}] leaves={params['num_leaves']} depth={params['max_depth']} "
                  f"lr={params['learning_rate']} spw={spw_v:.1f} → {THRESHOLD_METRIC}={score:.4f}")
            if score > best_score:
                best_score = score
                best_params = dict(params)
        return best_params, best_score


# ═══════════════════════════════════════════════════════════
# CHART GENERATION
# ═══════════════════════════════════════════════════════════
def plot_all_charts(
    y_test, xgb_proba, scorecard_proba, hybrid_proba,
    X_test_raw, feature_names, chart_dir, metadata,
    scorecard_scores=None, woe_data=None, scorecard_table=None,
    hybrid_proba_raw=None,
):
    os.makedirs(chart_dir, exist_ok=True)
    y = y_test.ravel()
    # For ROC/AUC/PD/calibration, use balanced probabilities (raw for all models)
    # hybrid_proba_raw is the pre-isotonic blend — same scale as XGB/Scorecard
    if hybrid_proba_raw is None:
        hybrid_proba_raw = hybrid_proba
    models = [
        ('xgb', xgb_proba, MODEL_LABELS['xgb']),
        ('scorecard', scorecard_proba, MODEL_LABELS['scorecard']),
        ('hybrid', hybrid_proba_raw, MODEL_LABELS['hybrid']),
    ]
    # Calibrated hybrid for scoring/PD charts only
    hybrid_calibrated = hybrid_proba

    def _save(fig, name):
        fig.savefig(os.path.join(chart_dir, name), dpi=200, bbox_inches='tight')
        plt.close(fig)

    # ── Chart 1: ROC curves ──
    fig, ax = plt.subplots(figsize=(10, 8))
    for key, proba, label in models:
        fpr, tpr, _ = roc_curve(y, proba)
        auc_val = roc_auc_score(y, proba)
        ax.plot(fpr, tpr, color=COLORS[key], lw=2, label=f'{label} (AUC={auc_val:.4f})')
    ax.plot([0,1],[0,1],'--', color='grey', alpha=0.5)
    ax.set_xlabel('FPR'); ax.set_ylabel('TPR'); ax.set_title('ROC Curves — All Models')
    ax.legend(loc='lower right', fontsize=9); fig.tight_layout()
    _save(fig, '01_roc_curves.png')

    # ── Chart 2: Precision-Recall curves ──
    fig, ax = plt.subplots(figsize=(10, 8))
    for key, proba, label in models:
        prec, rec, _ = precision_recall_curve(y, proba)
        ap = average_precision_score(y, proba)
        ax.plot(rec, prec, color=COLORS[key], lw=2, label=f'{label} (AP={ap:.4f})')
    ax.set_xlabel('Recall'); ax.set_ylabel('Precision'); ax.set_title('Precision-Recall Curves')
    ax.legend(fontsize=9); fig.tight_layout()
    _save(fig, '02_precision_recall.png')

    # ── Chart 3: Score distribution (uses calibrated PD for scoring) ──
    fig, axes = plt.subplots(1, 3, figsize=(20, 6))
    for ax, (key, proba, label) in zip(axes.ravel(), models):
        # For hybrid score distribution, use calibrated PD
        proba_for_score = hybrid_calibrated if key == 'hybrid' else proba
        scores = pd_to_score(proba_for_score)
        good = scores[y == 0]; bad = scores[y == 1]
        ax.hist(good, bins=50, alpha=0.6, color='#4CAF50', label=f'Good (n={len(good):,})', density=True)
        ax.hist(bad, bins=50, alpha=0.6, color='#F44336', label=f'Bad (n={len(bad):,})', density=True)
        ax.set_title(f'{label}')
        ax.legend(fontsize=9)
    fig.suptitle('Credit Score Distribution (Good vs Bad)', fontsize=14, fontweight='bold')
    fig.tight_layout(); _save(fig, '03_score_distribution.png')

    # ── Chart 4: Confusion matrices ──
    fig, axes = plt.subplots(1, 3, figsize=(20, 6))
    for ax, (key, proba, label) in zip(axes.ravel(), models):
        preds = (proba >= 0.5).astype(int)
        cm = confusion_matrix(y, preds)
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=ax,
                    xticklabels=['Good','Bad'], yticklabels=['Good','Bad'])
        ax.set_title(f'{label} (thr=0.50)'); ax.set_ylabel('Actual'); ax.set_xlabel('Predicted')
    fig.suptitle('Confusion Matrices', fontsize=14, fontweight='bold')
    fig.tight_layout(); _save(fig, '04_confusion_matrices.png')

    # ── Chart 5: Calibration (use all raw probabilities — shows how well each model is calibrated) ──
    fig, ax = plt.subplots(figsize=(10, 8))
    for key, proba, label in models:
        frac_pos, mean_pred = calibration_curve(y, proba, n_bins=15, strategy='uniform')
        brier = brier_score_loss(y, proba)
        ax.plot(mean_pred, frac_pos, 's-', color=COLORS[key], label=f'{label} (Brier={brier:.4f})')
    ax.plot([0,1],[0,1],'--', color='grey', alpha=0.5)
    ax.set_xlabel('Mean predicted'); ax.set_ylabel('Fraction positive')
    ax.set_title('Calibration Plot'); ax.legend(fontsize=9); fig.tight_layout()
    _save(fig, '05_calibration.png')

    # ── Chart 6: XGBoost Feature importance ──
    fig, ax = plt.subplots(figsize=(12, 8))
    if 'xgb_feature_importance' in metadata:
        imp_data = metadata['xgb_feature_importance']
        fnames = [d['feature'] for d in imp_data]
        fimps = [d['importance'] for d in imp_data]
        idx_sorted = np.argsort(fimps)
        ax.barh([fnames[i] for i in idx_sorted], [fimps[i] for i in idx_sorted], color=COLORS['xgb'], alpha=0.8)
        ax.set_title('XGBoost Feature Importance (gain)'); ax.set_xlabel('Importance')
    fig.tight_layout(); _save(fig, '06_feature_importance_xgb.png')

    # ── Chart 7: WOE / IV Feature importance (Scorecard) ──
    fig, ax = plt.subplots(figsize=(12, 8))
    if woe_data:
        iv_list = [(fname, woe_data[fname]['iv']) for fname in feature_names]
        iv_list.sort(key=lambda x: x[1])
        fnames_iv = [x[0] for x in iv_list]
        iv_vals = [x[1] for x in iv_list]
        bars = ax.barh(fnames_iv, iv_vals, color=COLORS['scorecard'], alpha=0.8)
        # Color-code by IV strength
        for bar, iv_val in zip(bars, iv_vals):
            if iv_val < 0.02:
                bar.set_color('#BDBDBD')   # Useless
            elif iv_val < 0.1:
                bar.set_color('#FFE082')   # Weak
            elif iv_val < 0.3:
                bar.set_color('#FFA726')   # Medium
            else:
                bar.set_color('#E65100')   # Strong
        ax.set_title('Information Value (IV) by Feature')
        ax.set_xlabel('IV')
        # Legend
        from matplotlib.lines import Line2D
        legend_elements = [
            Line2D([0],[0], color='#BDBDBD', lw=8, label='< 0.02 (Useless)'),
            Line2D([0],[0], color='#FFE082', lw=8, label='0.02-0.1 (Weak)'),
            Line2D([0],[0], color='#FFA726', lw=8, label='0.1-0.3 (Medium)'),
            Line2D([0],[0], color='#E65100', lw=8, label='> 0.3 (Strong)'),
        ]
        ax.legend(handles=legend_elements, fontsize=8, loc='lower right')
    fig.tight_layout(); _save(fig, '07_iv_feature_importance.png')

    # ── Chart 8: Threshold analysis ──
    fig, axes = plt.subplots(1, 3, figsize=(22, 7))
    thresholds = np.arange(0.05, 0.96, 0.01)
    for ax, (key, proba, label) in zip(axes, models):
        precs, recs, f1s, f2s = [], [], [], []
        for t in thresholds:
            preds = (proba >= t).astype(int)
            precs.append(precision_score(y, preds, zero_division=0))
            recs.append(recall_score(y, preds, zero_division=0))
            f1s.append(f1_score(y, preds, zero_division=0))
            f2s.append(fbeta_score(y, preds, beta=2, zero_division=0))
        ax.plot(thresholds, precs, label='Precision', color='#2196F3')
        ax.plot(thresholds, recs, label='Recall', color='#F44336')
        ax.plot(thresholds, f1s, label='F1', color='#4CAF50', linestyle='--', alpha=0.5)
        ax.plot(thresholds, f2s, label='F2 (β=2)', color='#9C27B0', lw=2)
        best_t = thresholds[np.argmax(f2s)]
        ax.axvline(best_t, linestyle=':', color='purple', lw=2, label=f'Best F2 @ {best_t:.2f}')
        ax.set_title(f'{label}'); ax.set_xlabel('Threshold'); ax.legend(fontsize=8)
    fig.suptitle('Threshold Analysis', fontsize=14, fontweight='bold')
    fig.tight_layout(); _save(fig, '08_threshold_analysis.png')

    # ── Chart 9: PD distribution ──
    fig, axes = plt.subplots(1, 3, figsize=(20, 6))
    for ax, (key, proba, label) in zip(axes.ravel(), models):
        g = proba[y==0]; b = proba[y==1]
        ax.hist(g, bins=80, alpha=0.4, color='#4CAF50', density=True, label='Good')
        ax.hist(b, bins=80, alpha=0.4, color='#F44336', density=True, label='Bad')
        ax.set_title(f'{label}')
        ax.set_xlabel('Predicted PD'); ax.legend(fontsize=9)
    fig.suptitle('Probability Distribution (Good vs Bad)', fontsize=14, fontweight='bold')
    fig.tight_layout(); _save(fig, '09_probability_distribution.png')

    # ── Chart 10: Score by credit tier (uses calibrated hybrid for scoring) ──
    fig, ax = plt.subplots(figsize=(14, 8))
    scores_hybrid = pd_to_score(hybrid_calibrated)
    tiers = ['Excellent (750+)', 'Good (700-749)', 'Fair (650-699)', 'Below (600-649)', 'Poor (<600)']
    tier_data = [
        scores_hybrid[(X_test_raw[:, 0] >= 750)],
        scores_hybrid[(X_test_raw[:, 0] >= 700) & (X_test_raw[:, 0] < 750)],
        scores_hybrid[(X_test_raw[:, 0] >= 650) & (X_test_raw[:, 0] < 700)],
        scores_hybrid[(X_test_raw[:, 0] >= 600) & (X_test_raw[:, 0] < 650)],
        scores_hybrid[(X_test_raw[:, 0] < 600)],
    ]
    tier_data_clean = [t for t in tier_data if len(t) > 0]
    tiers_clean = tiers[:len(tier_data_clean)]
    if tier_data_clean:
        bp = ax.boxplot(tier_data_clean, labels=tiers_clean, patch_artist=True)
        colors_box = ['#4CAF50','#8BC34A','#FFC107','#FF9800','#F44336']
        for patch, c in zip(bp['boxes'], colors_box[:len(tier_data_clean)]):
            patch.set_facecolor(c); patch.set_alpha(0.6)
    ax.set_title('Hybrid Score by Credit Tier'); ax.set_ylabel('Score')
    fig.tight_layout(); _save(fig, '10_score_by_credit_tier.png')

    # ── Chart 11: Metrics comparison bar chart ──
    fig, ax = plt.subplots(figsize=(14, 8))
    metric_names = ['AUC', 'Accuracy', 'Precision', 'Recall', 'F1', '1-Brier']
    bar_width = 0.22
    x = np.arange(len(metric_names))
    for i, (key, proba, label) in enumerate(models):
        preds = (proba >= 0.5).astype(int)
        vals = [
            roc_auc_score(y, proba), accuracy_score(y, preds),
            precision_score(y, preds, zero_division=0), recall_score(y, preds, zero_division=0),
            f1_score(y, preds, zero_division=0), 1 - brier_score_loss(y, proba),
        ]
        ax.bar(x + i*bar_width, vals, bar_width, color=COLORS[key], label=label, alpha=0.85)
    ax.set_xticks(x + bar_width); ax.set_xticklabels(metric_names)
    ax.set_title('Model Comparison'); ax.legend(fontsize=9); ax.set_ylim(0, 1.05)
    fig.tight_layout(); _save(fig, '11_metrics_comparison.png')

    # ── Chart 12: Correlation heatmap ──
    fig, ax = plt.subplots(figsize=(16, 14))
    corr_data = pd.DataFrame(X_test_raw, columns=feature_names)
    corr_data['XGB_PD'] = xgb_proba
    corr_data['SC_PD'] = scorecard_proba
    corr_data['Hybrid_PD'] = hybrid_proba_raw
    corr = corr_data.corr()
    mask = np.triu(np.ones_like(corr, dtype=bool))
    sns.heatmap(corr, mask=mask, annot=False, cmap='RdBu_r', center=0, ax=ax)
    ax.set_title('Feature + Model Correlation Heatmap')
    fig.tight_layout(); _save(fig, '12_correlation_heatmap.png')

    # ── Chart 13: Cumulative gains ──
    fig, ax = plt.subplots(figsize=(10, 8))
    for key, proba, label in models:
        idx_sorted = np.argsort(-proba)
        y_sorted = y[idx_sorted]
        gains = np.cumsum(y_sorted) / y.sum()
        pct = np.arange(1, len(y)+1) / len(y)
        ax.plot(pct, gains, color=COLORS[key], lw=2, label=label)
    ax.plot([0,1],[0,1], '--', color='grey', alpha=0.5, label='Random')
    ax.set_xlabel('% samples'); ax.set_ylabel('% defaults captured')
    ax.set_title('Cumulative Gains'); ax.legend(fontsize=9); fig.tight_layout()
    _save(fig, '13_cumulative_gains.png')

    # ── Chart 14: Score stability (quintiles, uses calibrated for scoring) ──
    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
    for ax, (key, proba, label) in zip(axes,
            [('xgb', xgb_proba, MODEL_LABELS['xgb']),
             ('hybrid', hybrid_calibrated, MODEL_LABELS['hybrid'])]):
        scores = pd_to_score(proba)
        quintile_cuts = pd.qcut(scores, 5, labels=['Q1(Low)','Q2','Q3','Q4','Q5(High)'], duplicates='drop')
        df_q = pd.DataFrame({'score': scores, 'default': y, 'quintile': quintile_cuts})
        q_stats = df_q.groupby('quintile', observed=False).agg(
            mean_score=('score','mean'), default_rate=('default','mean'), count=('default','count')
        )
        ax2 = ax.twinx()
        ax.bar(q_stats.index.astype(str), q_stats['mean_score'], alpha=0.5, color=COLORS[key], label='Mean score')
        ax2.plot(q_stats.index.astype(str), q_stats['default_rate'], 'ro-', label='Default rate')
        ax.set_title(label); ax.set_ylabel('Mean score'); ax2.set_ylabel('Default rate')
        ax.legend(loc='upper left', fontsize=8); ax2.legend(loc='upper right', fontsize=8)
    fig.suptitle('Score Stability: Quintile Analysis', fontsize=14, fontweight='bold')
    fig.tight_layout(); _save(fig, '14_score_stability.png')

    # ── Chart 15: Delinquency/Debt Features Impact ──
    fig, axes = plt.subplots(2, 3, figsize=(18, 12))
    debt_features = ['delinquencies_2yr', 'accounts_delinquent', 'severe_delinquencies_24m',
                     'pct_never_delinquent', 'collections_12m', 'active_bad_debts']
    for ax, feat in zip(axes.ravel(), debt_features):
        fidx = feature_names.index(feat) if feat in feature_names else -1
        if fidx < 0:
            ax.set_title(f'{feat} (removed)'); continue
        vals = X_test_raw[:, fidx]
        ax.scatter(vals[y==0], hybrid_proba_raw[y==0], alpha=0.05, s=2, color='#4CAF50', label='Good')
        ax.scatter(vals[y==1], hybrid_proba_raw[y==1], alpha=0.05, s=2, color='#F44336', label='Bad')
        ax.set_xlabel(feat); ax.set_ylabel('PD')
        ax.set_title(f'{feat} vs Hybrid PD'); ax.legend(fontsize=8, markerscale=5)
    fig.suptitle('Delinquency/Debt Features — Hybrid PD', fontsize=14, fontweight='bold')
    fig.tight_layout(); _save(fig, '15_delinquency_impact.png')

    # ── Chart 16: Architecture diagram (Hybrid) ──
    fig, ax = plt.subplots(figsize=(16, 10))
    ax.set_xlim(0, 16); ax.set_ylim(0, 10); ax.axis('off')
    ax.text(8, 9.5, 'EXPLAINABLE HYBRID — v11.0', ha='center', fontsize=18, fontweight='bold')
    # Input
    rect = mpatches.FancyBboxPatch((5, 7.5), 6, 1.2, boxstyle='round,pad=0.1',
                                    facecolor='#E3F2FD', edgecolor='#1565C0', lw=2)
    ax.add_patch(rect)
    ax.text(8, 8.1, '25 Features (21 Num + 4 Cat)', ha='center', va='center', fontsize=11, fontweight='bold')
    # Branch 1 — Scorecard
    rect1 = mpatches.FancyBboxPatch((0.5, 4.5), 5.5, 2.2, boxstyle='round,pad=0.1',
                                     facecolor='#FFE0B2', edgecolor='#E65100', lw=2)
    ax.add_patch(rect1)
    ax.text(3.25, 6.1, 'Nhánh 1 — Minh bạch', ha='center', fontsize=12, fontweight='bold', color='#E65100')
    ax.text(3.25, 5.5, 'WOE Binning → LR → Scorecard', ha='center', fontsize=10)
    ax.text(3.25, 4.9, '"Trừ 50đ: 2 nợ trễ hạn"', ha='center', fontsize=9, style='italic')
    # Branch 2 — XGBoost
    rect2 = mpatches.FancyBboxPatch((7, 4.5), 5.5, 2.2, boxstyle='round,pad=0.1',
                                     facecolor='#BBDEFB', edgecolor='#1976D2', lw=2)
    ax.add_patch(rect2)
    ax.text(9.75, 6.1, 'Nhánh 2 — Sức mạnh', ha='center', fontsize=12, fontweight='bold', color='#1565C0')
    ax.text(9.75, 5.5, 'Scaled → XGBoost (800 trees)', ha='center', fontsize=10)
    ax.text(9.75, 4.9, 'Phi tuyến, quy luật ẩn', ha='center', fontsize=9, style='italic')
    # Arrows
    ax.annotate('', xy=(3.25, 6.7), xytext=(6, 7.5), arrowprops=dict(arrowstyle='->', lw=2, color='#E65100'))
    ax.annotate('', xy=(9.75, 6.7), xytext=(10, 7.5), arrowprops=dict(arrowstyle='->', lw=2, color='#1976D2'))
    # Hybrid blend
    rect3 = mpatches.FancyBboxPatch((3.5, 2), 6, 1.8, boxstyle='round,pad=0.1',
                                     facecolor='#FCE4EC', edgecolor='#C62828', lw=2)
    ax.add_patch(rect3)
    ax.text(6.5, 3.2, 'Lai ghép (Hybrid)', ha='center', fontsize=12, fontweight='bold', color='#C62828')
    ax.text(6.5, 2.5, 'α·Scorecard_PD + (1-α)·XGB_PD → Isotonic → PD', ha='center', fontsize=10)
    ax.annotate('', xy=(5, 3.8), xytext=(3.25, 4.5), arrowprops=dict(arrowstyle='->', lw=2, color='#333'))
    ax.annotate('', xy=(8, 3.8), xytext=(9.75, 4.5), arrowprops=dict(arrowstyle='->', lw=2, color='#333'))
    # Output
    rect4 = mpatches.FancyBboxPatch((4.5, 0.2), 4, 1.2, boxstyle='round,pad=0.1',
                                     facecolor='#C8E6C9', edgecolor='#2E7D32', lw=2)
    ax.add_patch(rect4)
    ax.text(6.5, 0.8, 'ai_risk_score + PD + Scorecard', ha='center', va='center', fontsize=10, fontweight='bold', color='#2E7D32')
    ax.annotate('', xy=(6.5, 1.4), xytext=(6.5, 2), arrowprops=dict(arrowstyle='->', lw=2, color='#2E7D32'))
    fig.tight_layout(); _save(fig, '16_architecture_diagram.png')

    # ── Chart 17: XGB vs Scorecard PD scatter ──
    fig, ax = plt.subplots(figsize=(10, 10))
    ax.scatter(xgb_proba, scorecard_proba, alpha=0.05, s=2, c=y, cmap='RdYlGn_r')
    ax.plot([0,1],[0,1], '--', color='grey', alpha=0.5)
    ax.set_xlabel('XGBoost PD'); ax.set_ylabel('Scorecard PD')
    ax.set_title('XGBoost vs Scorecard PD (colored by default=red)')
    fig.tight_layout(); _save(fig, '17_xgb_vs_scorecard_pd.png')

    # ── Chart 18: Scorecard points top features ──
    fig, axes = plt.subplots(2, 3, figsize=(20, 12))
    if scorecard_table:
        # Pick top 6 features by IV
        iv_sorted = sorted(scorecard_table.items(), key=lambda x: x[1]['iv'], reverse=True)[:6]
        for ax, (fname, fdata) in zip(axes.ravel(), iv_sorted):
            bins_data = fdata['bins']
            ranges = [b['range'] for b in bins_data]
            points = [b['points'] for b in bins_data]
            colors_bar = ['#4CAF50' if p >= 0 else '#F44336' for p in points]
            ax.barh(range(len(ranges)), points, color=colors_bar, alpha=0.8)
            ax.set_yticks(range(len(ranges)))
            ax.set_yticklabels(ranges, fontsize=7)
            ax.set_title(f'{fname} (IV={fdata["iv"]:.3f})')
            ax.set_xlabel('Points')
            ax.axvline(0, color='grey', linestyle='--', alpha=0.5)
    fig.suptitle('Scorecard Points — Top 6 Features by IV', fontsize=14, fontweight='bold')
    fig.tight_layout(); _save(fig, '18_scorecard_points.png')

    # ── Chart 19: KS Statistic ──
    fig, axes = plt.subplots(1, 3, figsize=(22, 6))
    for ax, (key, proba, label) in zip(axes, models):
        good_sorted = np.sort(proba[y==0])
        bad_sorted = np.sort(proba[y==1])
        cdf_good = np.arange(1, len(good_sorted)+1) / len(good_sorted)
        cdf_bad = np.arange(1, len(bad_sorted)+1) / len(bad_sorted)
        ax.plot(good_sorted, cdf_good, color='#4CAF50', label='Good CDF')
        ax.plot(bad_sorted, cdf_bad, color='#F44336', label='Bad CDF')
        all_vals = np.sort(np.unique(proba))
        good_cdf_interp = np.searchsorted(good_sorted, all_vals) / len(good_sorted)
        bad_cdf_interp = np.searchsorted(bad_sorted, all_vals) / len(bad_sorted)
        ks_stat = np.max(np.abs(good_cdf_interp - bad_cdf_interp))
        ks_idx = np.argmax(np.abs(good_cdf_interp - bad_cdf_interp))
        ax.axvline(all_vals[ks_idx], linestyle=':', color='purple', label=f'KS={ks_stat:.4f}')
        ax.set_title(f'{label} — KS={ks_stat:.4f}'); ax.legend(fontsize=9)
        ax.set_xlabel('Predicted PD'); ax.set_ylabel('CDF')
    fig.suptitle('KS Statistic', fontsize=14, fontweight='bold')
    fig.tight_layout(); _save(fig, '19_ks_statistic.png')

    # ── Chart 20: WOE patterns for top features ──
    fig, axes = plt.subplots(2, 3, figsize=(20, 12))
    if woe_data:
        iv_sorted = sorted(woe_data.items(), key=lambda x: x[1]['iv'], reverse=True)[:6]
        for ax, (fname, fdata) in zip(axes.ravel(), iv_sorted):
            woe_map = fdata['woe_map']
            bins_sorted = sorted(woe_map.keys())
            woe_vals = [woe_map[b] for b in bins_sorted]
            colors_woe = ['#4CAF50' if w > 0 else '#F44336' for w in woe_vals]
            ax.bar(range(len(bins_sorted)), woe_vals, color=colors_woe, alpha=0.8)
            ax.axhline(0, color='grey', linestyle='--', alpha=0.5)
            ax.set_title(f'{fname} (IV={fdata["iv"]:.3f})')
            ax.set_xlabel('Bin'); ax.set_ylabel('WOE')
    fig.suptitle('WOE Patterns — Top 6 Features', fontsize=14, fontweight='bold')
    fig.tight_layout(); _save(fig, '20_woe_patterns.png')

    # ── Chart 21: Summary dashboard ──
    fig, ax = plt.subplots(figsize=(14, 10))
    ax.axis('off')
    ax.text(0.5, 0.97, 'EXPLAINABLE HYBRID — PERFORMANCE DASHBOARD', ha='center', fontsize=18, fontweight='bold',
            transform=ax.transAxes)
    lines = []
    for key, proba, label in models:
        preds = (proba >= 0.5).astype(int)
        lines.append(f"{'━'*60}")
        lines.append(f"  {label} (threshold=0.50)")
        lines.append(f"    AUC={roc_auc_score(y,proba):.4f}  Acc={accuracy_score(y,preds):.4f}  "
                     f"F1={f1_score(y,preds,zero_division=0):.4f}  Brier={brier_score_loss(y,proba):.4f}")
        lines.append(f"    Prec={precision_score(y,preds,zero_division=0):.4f}  "
                     f"Rec={recall_score(y,preds,zero_division=0):.4f}  "
                     f"MCC={matthews_corrcoef(y,preds):.4f}")
    lines.append(f"{'━'*60}")
    alpha = metadata.get('hybrid', {}).get('alpha', '?')
    lines.append(f"  Architecture: Hybrid (WOE+LR Scorecard ⊕ XGBoost, α={alpha})")
    lines.append(f"  Features: {len(feature_names)} | Test samples: {len(y):,}")
    ax.text(0.05, 0.88, '\n'.join(lines), transform=ax.transAxes, fontsize=10,
            fontfamily='monospace', verticalalignment='top')
    fig.tight_layout(); _save(fig, '21_summary_dashboard.png')
    print(f"  [charts] Saved 21 charts to {chart_dir}")


# ═══════════════════════════════════════════════════════════
# MAIN TRAINING PIPELINE
# ═══════════════════════════════════════════════════════════
def train_model():
    ts = time.time()
    print("\n" + "═"*70)
    print("  STACKING ENSEMBLE TRAINING PIPELINE v16.0")
    print("  Nhánh 1: WOE + LR → Scorecard (IV-filtered features)")
    print("  Nhánh 2: Full Data → 39 Features → XGBoost (Deep HP + SPW)")
    print("  Nhánh 3: Full Data → 39 Features → LightGBM (GOSS + SPW)")
    print("  Stacking: Meta-LR(SC, XGB, LGBM) → Acc-Weighted threshold → Isotonic → PD")
    print("═"*70)

    os.makedirs(MODEL_DIR, exist_ok=True)
    os.makedirs(CHART_DIR, exist_ok=True)

    # ── Step 1: Load & clean ──
    print(f"\n[1/10] Loading & cleaning data...")
    df = load_and_clean_data(ACCEPTED_CSV, REJECTED_CSV, CHART_DIR)
    X = df[FEATURE_NAMES].values.astype(np.float64)
    y = df["is_default"].values.astype(np.int32)
    del df; gc.collect()

    # ── Step 2: Train/test split ──
    print(f"\n[2/10] Train/test split (stratified)...")
    test_ratio = 0.2
    if MIN_TEST_SAMPLES and len(y) * test_ratio < MIN_TEST_SAMPLES:
        test_ratio = min(MIN_TEST_SAMPLES / len(y), 0.4)
        print(f"  ⚠ Adjusting test_size to {test_ratio:.2%} to guarantee {MIN_TEST_SAMPLES:,} test samples")
    X_train_raw, X_test_raw, y_train, y_test = train_test_split(
        X, y, test_size=test_ratio, stratify=y, random_state=RANDOM_STATE,
    )
    del X; gc.collect()
    print(f"  Train: {len(y_train):,} | Test: {len(y_test):,}")
    assert len(y_test) >= MIN_TEST_SAMPLES, f"Test set {len(y_test):,} < {MIN_TEST_SAMPLES:,}. Need more data."
    print(f"  Train default rate: {y_train.mean():.4f} | Test default rate: {y_test.mean():.4f}")

    # ── Step 2b: Resampling (TRAINING data only) ──
    # Large datasets (>500K): RandomUnderSampler O(n) — instant
    # Small datasets (≤500K): SMOTE-Tomek O(n²) — better quality but slow
    smote_applied = False
    if USE_SMOTE and HAS_IMBLEARN:
        n_train = len(y_train)
        print(f"\n[2b] Resampling training data (target minority ratio: {SMOTE_SAMPLING_STRATEGY})...")
        print(f"  Before resampling: {n_train:,} samples | default rate: {y_train.mean():.4f}")
        try:
            if n_train > SMOTE_MAX_SAMPLES:
                print(f"  Dataset > {SMOTE_MAX_SAMPLES:,} → using RandomUnderSampler (fast O(n))")
                rus = RandomUnderSampler(
                    sampling_strategy=SMOTE_SAMPLING_STRATEGY,
                    random_state=RANDOM_STATE,
                )
                X_train_raw, y_train = rus.fit_resample(X_train_raw, y_train)
            else:
                print(f"  Dataset ≤ {SMOTE_MAX_SAMPLES:,} → using SMOTE-Tomek (high quality)")
                smote_tomek = SMOTETomek(
                    smote=SMOTE(sampling_strategy=SMOTE_SAMPLING_STRATEGY, random_state=RANDOM_STATE, k_neighbors=5),
                    tomek=TomekLinks(sampling_strategy='majority'),
                    random_state=RANDOM_STATE,
                )
                X_train_raw, y_train = smote_tomek.fit_resample(X_train_raw, y_train)
            smote_applied = True
            print(f"  After resampling: {len(y_train):,} samples | default rate: {y_train.mean():.4f}")
            print(f"    Class 0: {np.sum(y_train == 0):,} | Class 1: {np.sum(y_train == 1):,}")
        except Exception as e:
            print(f"  [WARN] Resampling failed: {e}. Continuing without resampling.")
    elif USE_SMOTE and not HAS_IMBLEARN:
        print(f"\n[2b] Resampling skipped (imblearn not installed)")
    else:
        print(f"\n[2b] Resampling disabled (USE_SMOTE=False)")

    # ── Step 3: Per-feature smart scaling (ALL features, for XGBoost) ──
    print(f"\n[3/10] Per-feature smart scaling (ALL {len(FEATURE_NAMES)} features for XGBoost)...")
    scalers, X_train_scaled = create_per_feature_scalers(X_train_raw, FEATURE_NAMES)
    X_test_scaled = apply_per_feature_scalers(X_test_raw, scalers, FEATURE_NAMES)
    print(f"  Scaled: train {X_train_scaled.shape} | test {X_test_scaled.shape}")
    scale_pos_wt = float(np.sum(y_train == 0) / np.sum(y_train == 1))
    print(f"  scale_pos_weight = {scale_pos_wt:.2f}")
    mc_tuple = _get_monotonic_tuple(FEATURE_NAMES)
    n_constrained = sum(1 for c in mc_tuple if c != 0)
    print(f"  Monotonic constraints: {n_constrained}/{len(FEATURE_NAMES)} features constrained")

    # ── Step 4: WOE Binning + IV feature selection (for Scorecard ONLY) ──
    # KEY DESIGN: Scorecard = IV-filtered features, XGBoost = ALL features
    print(f"\n[4/10] WOE Binning ({WOE_BINS} bins per feature) — IV filtering for Scorecard only...")
    woe_data_all = compute_woe_binning(X_train_raw, y_train, FEATURE_NAMES, n_bins=WOE_BINS)

    # Print IV summary
    iv_items = [(fname, woe_data_all[fname]['iv']) for fname in FEATURE_NAMES]
    iv_items.sort(key=lambda x: x[1], reverse=True)
    total_iv = sum(x[1] for x in iv_items)
    print(f"  Total IV = {total_iv:.4f}")
    for fname, iv_val in iv_items:
        strength = "Strong" if iv_val >= 0.3 else "Medium" if iv_val >= 0.1 else "Weak" if iv_val >= 0.02 else "Useless"
        marker = " ✗ SC-REMOVED" if iv_val < IV_MIN_THRESHOLD else ""
        print(f"    {fname:30s} IV={iv_val:.4f}  ({strength}){marker}")

    # IV filtering: only for Scorecard branch. XGBoost keeps ALL features.
    removed_features = [fn for fn in FEATURE_NAMES if woe_data_all[fn]['iv'] < IV_MIN_THRESHOLD]
    sc_features = [fn for fn in FEATURE_NAMES if woe_data_all[fn]['iv'] >= IV_MIN_THRESHOLD]
    print(f"\n  Scorecard features: {len(FEATURE_NAMES)} → {len(sc_features)} (removed {len(removed_features)} with IV < {IV_MIN_THRESHOLD})")
    print(f"  XGBoost features:  ALL {len(FEATURE_NAMES)} (no IV filtering — tree models use all)")
    if removed_features:
        print(f"    SC removed: {', '.join(removed_features)}")

    # Build Scorecard data structures (subset)
    sc_indices = [FEATURE_NAMES.index(fn) for fn in sc_features]
    X_train_raw_sc = X_train_raw[:, sc_indices]
    X_test_raw_sc = X_test_raw[:, sc_indices]
    woe_data_sc = {fn: woe_data_all[fn] for fn in sc_features}
    NUMERIC_FEATURES_USED = [fn for fn in NUMERIC_FEATURES if fn in sc_features]
    CATEGORICAL_FEATURES_USED = [fn for fn in CATEGORICAL_FEATURES if fn in sc_features]
    print(f"    SC kept: {len(NUMERIC_FEATURES_USED)} numeric + {len(CATEGORICAL_FEATURES_USED)} categorical = {len(sc_features)}")

    # WOE transform for Scorecard
    X_train_woe = apply_woe_transform(X_train_raw_sc, sc_features, woe_data_sc)
    X_test_woe = apply_woe_transform(X_test_raw_sc, sc_features, woe_data_sc)
    print(f"  WOE transformed (SC): train {X_train_woe.shape} | test {X_test_woe.shape}")

    # ── Step 5: Nhánh 1 — WOE + Logistic Regression → Scorecard ──
    print(f"\n[5/10] Nhánh 1: Training LR on {len(sc_features)} WOE features → Scorecard...")
    lr_model = LogisticRegressionCV(
        Cs=[0.01, 0.1, 0.5, 1.0, 5.0, 10.0],
        penalty='l2', solver='saga', max_iter=500,
        class_weight='balanced', random_state=RANDOM_STATE, tol=1e-4,
        cv=3, scoring='roc_auc', refit=True,
    )
    lr_model.fit(X_train_woe, y_train)
    best_C = lr_model.C_[0]
    scorecard_train_proba = lr_model.predict_proba(X_train_woe)[:, 1]
    scorecard_test_proba = lr_model.predict_proba(X_test_woe)[:, 1]
    print(f"  LR converged | Best C={best_C:.4f} (tuned via 3-fold CV)")
    lr_coefs = lr_model.coef_[0]
    print(f"  LR intercept: {lr_model.intercept_[0]:.4f}")
    print(f"  Coef range: [{lr_coefs.min():.4f}, {lr_coefs.max():.4f}]")
    print(f"  Scorecard AUC (train): {roc_auc_score(y_train, scorecard_train_proba):.4f}")
    print(f"  Scorecard AUC (test):  {roc_auc_score(y_test, scorecard_test_proba):.4f}")

    # Build scorecard table
    scorecard_table = build_scorecard_table(lr_model, woe_data_sc, sc_features)
    print(f"  Scorecard table built: {len(scorecard_table)} features")

    # Compute traditional scorecard scores for test set
    scorecard_scores_test = scorecard_predict_score(X_test_raw_sc, sc_features, woe_data_sc, lr_model)
    print(f"  Scorecard scores: min={scorecard_scores_test.min():.0f}, "
          f"median={np.median(scorecard_scores_test):.0f}, max={scorecard_scores_test.max():.0f}")

    # ── Step 6: Nhánh 2 — XGBoost (ALL features + Monotonic + HP tuning + SPW tuning) ──
    print(f"\n[6/10] Nhánh 2: Training XGBoost on ALL {len(FEATURE_NAMES)} scaled features + monotonic...")
    print(f"  HP tuning (objective: {THRESHOLD_METRIC} at optimal threshold, includes SPW sweep)...")
    best_xgb_params, tune_score = _tune_xgb(X_train_scaled, y_train, FEATURE_NAMES, scale_pos_wt)
    best_xgb_spw = best_xgb_params.get('scale_pos_weight', scale_pos_wt)
    print(f"  Best tune {THRESHOLD_METRIC}: {tune_score:.4f}")
    for k, v in best_xgb_params.items():
        print(f"    {k}: {v:.4f}" if isinstance(v, float) else f"    {k}: {v}")
    xgb_model = _build_xgb(scale_pos_wt, FEATURE_NAMES, tuned_params=best_xgb_params)
    _split = StratifiedKFold(n_splits=10, shuffle=True, random_state=RANDOM_STATE+999)
    _tr_idx, _val_idx = next(_split.split(X_train_scaled, y_train))
    xgb_model.fit(X_train_scaled[_tr_idx], y_train[_tr_idx],
                  eval_set=[(X_train_scaled[_val_idx], y_train[_val_idx])], verbose=False)
    n_trees = xgb_model.best_iteration + 1
    xgb_train_proba = xgb_model.predict_proba(X_train_scaled)[:, 1]
    xgb_test_proba = xgb_model.predict_proba(X_test_scaled)[:, 1]
    print(f"  XGBoost: {n_trees} trees (early stopped) | SPW={best_xgb_spw:.2f}")
    print(f"  XGB AUC (train): {roc_auc_score(y_train, xgb_train_proba):.4f}")
    print(f"  XGB AUC (test):  {roc_auc_score(y_test, xgb_test_proba):.4f}")

    # XGB standalone optimal threshold
    xgb_val_proba = xgb_model.predict_proba(X_train_scaled[_val_idx])[:, 1]
    xgb_opt_t, xgb_opt_f1 = find_optimal_threshold(y_train[_val_idx], xgb_val_proba, metric=THRESHOLD_METRIC)
    print(f"  XGB standalone optimal threshold: {xgb_opt_t:.3f} ({THRESHOLD_METRIC}={xgb_opt_f1:.4f})")

    # ── Step 6b: Nhánh 3 — LightGBM (ALL features + Monotonic + HP tuning) ──
    lgbm_model = None
    lgbm_train_proba = None
    lgbm_test_proba = None
    best_lgbm_params = {}
    best_lgbm_spw = scale_pos_wt
    if HAS_LGBM:
        print(f"\n[6b/10] Nhánh 3: Training LightGBM on ALL {len(FEATURE_NAMES)} scaled features + monotonic...")
        print(f"  HP tuning (objective: {THRESHOLD_METRIC}, includes SPW sweep)...")
        best_lgbm_params, lgbm_tune_score = _tune_lgbm(X_train_scaled, y_train, FEATURE_NAMES, scale_pos_wt)
        best_lgbm_spw = best_lgbm_params.get('scale_pos_weight', scale_pos_wt)
        print(f"  Best tune {THRESHOLD_METRIC}: {lgbm_tune_score:.4f}")
        for k, v in best_lgbm_params.items():
            print(f"    {k}: {v:.4f}" if isinstance(v, float) else f"    {k}: {v}")

        lgbm_model = _build_lgbm(scale_pos_wt, FEATURE_NAMES, tuned_params=best_lgbm_params)
        _split_lgbm = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE+888)
        _tr_lg, _val_lg = next(_split_lgbm.split(X_train_scaled, y_train))
        lgbm_model.fit(X_train_scaled[_tr_lg], y_train[_tr_lg],
                       eval_set=[(X_train_scaled[_val_lg], y_train[_val_lg])],
                       callbacks=[lgb.early_stopping(200, verbose=False)])
        n_lgbm_trees = lgbm_model.best_iteration_ if hasattr(lgbm_model, 'best_iteration_') else lgbm_model.n_estimators
        lgbm_train_proba = lgbm_model.predict_proba(X_train_scaled)[:, 1]
        lgbm_test_proba = lgbm_model.predict_proba(X_test_scaled)[:, 1]
        print(f"  LightGBM: {n_lgbm_trees} trees (early stopped) | SPW={best_lgbm_spw:.2f}")
        print(f"  LGBM AUC (train): {roc_auc_score(y_train, lgbm_train_proba):.4f}")
        print(f"  LGBM AUC (test):  {roc_auc_score(y_test, lgbm_test_proba):.4f}")
    else:
        print(f"\n[6b/10] LightGBM skipped (not installed)")

    # ── Step 7: Stacking Meta-Learner (SC + XGB + LGBM → LR) ──
    # OOF (Out-of-Fold) predictions for meta-features to avoid overfitting
    print(f"\n[7/10] Building Stacking Meta-Learner (OOF predictions → LogisticRegression)...")
    n_meta_folds = 5
    kf_meta = StratifiedKFold(n_splits=n_meta_folds, shuffle=True, random_state=RANDOM_STATE + 200)

    # Initialize OOF arrays
    oof_sc = np.zeros(len(y_train))
    oof_xgb = np.zeros(len(y_train))
    oof_lgbm = np.zeros(len(y_train))

    for fold_i, (meta_tr, meta_val) in enumerate(kf_meta.split(X_train_raw, y_train)):
        print(f"  OOF Fold {fold_i+1}/{n_meta_folds}...", end=" ")

        # Scorecard OOF
        woe_fold = compute_woe_binning(X_train_raw[meta_tr][:, sc_indices], y_train[meta_tr], sc_features, n_bins=WOE_BINS)
        X_woe_tr = apply_woe_transform(X_train_raw[meta_tr][:, sc_indices], sc_features, woe_fold)
        X_woe_val = apply_woe_transform(X_train_raw[meta_val][:, sc_indices], sc_features, woe_fold)
        lr_fold = LogisticRegression(C=best_C, penalty='l2', solver='saga', max_iter=500,
                                      class_weight='balanced', random_state=RANDOM_STATE, tol=1e-4)
        lr_fold.fit(X_woe_tr, y_train[meta_tr])
        oof_sc[meta_val] = lr_fold.predict_proba(X_woe_val)[:, 1]
        del lr_fold, X_woe_tr, X_woe_val, woe_fold

        # XGBoost OOF
        xgb_fold = _build_xgb(scale_pos_wt, FEATURE_NAMES, random_state=RANDOM_STATE + fold_i, tuned_params=best_xgb_params)
        _inner = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE + 500 + fold_i)
        _itr, _ival = next(_inner.split(X_train_scaled[meta_tr], y_train[meta_tr]))
        xgb_fold.fit(X_train_scaled[meta_tr][_itr], y_train[meta_tr][_itr],
                      eval_set=[(X_train_scaled[meta_tr][_ival], y_train[meta_tr][_ival])], verbose=False)
        oof_xgb[meta_val] = xgb_fold.predict_proba(X_train_scaled[meta_val])[:, 1]
        del xgb_fold

        # LightGBM OOF
        if HAS_LGBM and lgbm_model is not None:
            lgbm_fold = _build_lgbm(scale_pos_wt, FEATURE_NAMES, random_state=RANDOM_STATE + fold_i + 100, tuned_params=best_lgbm_params)
            _inner2 = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE + 600 + fold_i)
            _itr2, _ival2 = next(_inner2.split(X_train_scaled[meta_tr], y_train[meta_tr]))
            lgbm_fold.fit(X_train_scaled[meta_tr][_itr2], y_train[meta_tr][_itr2],
                          eval_set=[(X_train_scaled[meta_tr][_ival2], y_train[meta_tr][_ival2])],
                          callbacks=[lgb.early_stopping(150, verbose=False)])
            oof_lgbm[meta_val] = lgbm_fold.predict_proba(X_train_scaled[meta_val])[:, 1]
            del lgbm_fold

        gc.collect()
        print(f"done")

    # Build meta-features (OOF for train, direct for test)
    if HAS_LGBM and lgbm_model is not None:
        meta_train = np.column_stack([oof_sc, oof_xgb, oof_lgbm])
        meta_test = np.column_stack([scorecard_test_proba, xgb_test_proba, lgbm_test_proba])
        meta_train_full = np.column_stack([scorecard_train_proba, xgb_train_proba, lgbm_train_proba])
        print(f"  Meta-features: 3 models (SC + XGB + LGBM)")
    else:
        meta_train = np.column_stack([oof_sc, oof_xgb])
        meta_test = np.column_stack([scorecard_test_proba, xgb_test_proba])
        meta_train_full = np.column_stack([scorecard_train_proba, xgb_train_proba])
        print(f"  Meta-features: 2 models (SC + XGB)")

    # Train meta-learner (LR with balanced class weights)
    meta_lr = LogisticRegression(
        C=1.0, penalty='l2', solver='saga', max_iter=500,
        class_weight='balanced', random_state=RANDOM_STATE, tol=1e-4,
    )
    meta_lr.fit(meta_train, y_train)
    meta_coefs = meta_lr.coef_[0]
    print(f"  Meta-LR weights: {', '.join(f'{c:.4f}' for c in meta_coefs)}")
    print(f"  Meta-LR intercept: {meta_lr.intercept_[0]:.4f}")

    # Stacked predictions
    stacked_train_proba = meta_lr.predict_proba(meta_train_full)[:, 1]
    stacked_test_proba = meta_lr.predict_proba(meta_test)[:, 1]
    print(f"  Stacked AUC (train): {roc_auc_score(y_train, stacked_train_proba):.4f}")
    print(f"  Stacked AUC (test):  {roc_auc_score(y_test, stacked_test_proba):.4f}")

    # Find optimal threshold on stacked OOF predictions
    oof_stacked = meta_lr.predict_proba(meta_train)[:, 1]
    optimal_threshold, opt_threshold_score = find_optimal_threshold(y_train, oof_stacked, metric=THRESHOLD_METRIC)
    print(f"  Stacked optimal threshold: {optimal_threshold:.3f} ({THRESHOLD_METRIC}={opt_threshold_score:.4f})")

    # For backward compat, set hybrid variables to stacked values
    hybrid_test_proba_raw = stacked_test_proba
    hybrid_train_proba = stacked_train_proba
    best_alpha = 0.0  # Not used in stacking, but needed for metadata

    # ── Step 8: Compute Stacked PD + Calibration + Optimal threshold ──
    print(f"\n[8/10] Computing Stacked PD + Isotonic Calibration + {THRESHOLD_METRIC}-optimal threshold...")
    # hybrid_train_proba and hybrid_test_proba_raw already set from stacking above
    print(f"  Stacked AUC (test, raw): {roc_auc_score(y_test, hybrid_test_proba_raw):.4f}")

    # Isotonic calibration on train (for PD reporting only)
    iso_calibrator = IsotonicRegression(out_of_bounds='clip', y_min=0.0, y_max=1.0)
    iso_calibrator.fit(hybrid_train_proba, y_train)
    hybrid_test_proba = iso_calibrator.predict(hybrid_test_proba_raw)
    print(f"  Isotonic calibration applied")
    print(f"  Hybrid AUC (test, calibrated): {roc_auc_score(y_test, hybrid_test_proba):.4f}")

    # v14.0: Balanced threshold (NOT fixed 0.50!)
    # Classification uses raw hybrid PD (pre-isotonic) with OPTIMIZED threshold
    print(f"\n  Threshold = {optimal_threshold:.3f} ({THRESHOLD_METRIC}-optimized on CV, NOT fixed 0.50)")
    opt_preds = (hybrid_test_proba_raw >= optimal_threshold).astype(int)
    opt_recall = recall_score(y_test, opt_preds)
    opt_precision = precision_score(y_test, opt_preds, zero_division=0)
    opt_f1 = f1_score(y_test, opt_preds, zero_division=0)
    opt_f2 = fbeta_score(y_test, opt_preds, beta=2, zero_division=0)
    opt_mcc = matthews_corrcoef(y_test, opt_preds)
    opt_acc = accuracy_score(y_test, opt_preds)

    print(f"    Accuracy={opt_acc:.4f}  Recall={opt_recall:.4f}  Precision={opt_precision:.4f}")
    print(f"    F1={opt_f1:.4f}  F2={opt_f2:.4f}  MCC={opt_mcc:.4f}")

    # Also show metrics at fixed 0.50 for comparison
    preds_050 = (hybrid_test_proba_raw >= 0.50).astype(int)
    print(f"\n  Comparison — fixed threshold=0.50:")
    print(f"    Accuracy={accuracy_score(y_test, preds_050):.4f}  "
          f"Recall={recall_score(y_test, preds_050):.4f}  "
          f"Precision={precision_score(y_test, preds_050, zero_division=0):.4f}  "
          f"F1={f1_score(y_test, preds_050, zero_division=0):.4f}")

    # ── Step 9: Evaluate on Test (at optimal threshold for all) ──
    print(f"\n[9/10] Evaluating on test set...")
    eval_models = [('xgb', xgb_test_proba, MODEL_LABELS['xgb']),
                   ('scorecard', scorecard_test_proba, MODEL_LABELS['scorecard'])]
    if HAS_LGBM and lgbm_test_proba is not None:
        eval_models.append(('lgbm', lgbm_test_proba, 'LightGBM (Nhánh 3)'))
    eval_models.append(('hybrid', hybrid_test_proba_raw, 'Stacked (Meta-LR)'))
    for key, proba, label in eval_models:
        # Find per-model optimal threshold
        if key == 'hybrid':
            thr = optimal_threshold
        else:
            # Use the same find_optimal_threshold on train proba
            train_p = xgb_train_proba if key == 'xgb' else scorecard_train_proba
            thr, _ = find_optimal_threshold(y_train, train_p, metric=THRESHOLD_METRIC)
        preds = (proba >= thr).astype(int)
        preds_half = (proba >= 0.50).astype(int)
        print(f"\n  {label}:")
        print(f"    [Optimal thr={thr:.3f}] Acc={accuracy_score(y_test, preds):.4f}  "
              f"Prec={precision_score(y_test, preds, zero_division=0):.4f}  "
              f"Rec={recall_score(y_test, preds, zero_division=0):.4f}  "
              f"F1={f1_score(y_test, preds, zero_division=0):.4f}  "
              f"MCC={matthews_corrcoef(y_test, preds):.4f}")
        print(f"    [Fixed  thr=0.50 ] Acc={accuracy_score(y_test, preds_half):.4f}  "
              f"Prec={precision_score(y_test, preds_half, zero_division=0):.4f}  "
              f"Rec={recall_score(y_test, preds_half, zero_division=0):.4f}  "
              f"F1={f1_score(y_test, preds_half, zero_division=0):.4f}  "
              f"MCC={matthews_corrcoef(y_test, preds_half):.4f}")
        print(f"    AUC={roc_auc_score(y_test, proba):.4f}  "
              f"Brier={brier_score_loss(y_test, proba):.4f}")

    # XGB feature importance (ALL features)
    raw_imp = xgb_model.get_booster().get_score(importance_type='gain')
    total_imp = sum(raw_imp.values()) or 1
    feature_importance = []
    for i, fn in enumerate(FEATURE_NAMES):
        key = f"f{i}"
        imp = raw_imp.get(key, 0) / total_imp
        feature_importance.append({"feature": fn, "importance": round(imp, 6)})
    feature_importance.sort(key=lambda x: x["importance"], reverse=True)

    # ── Cross-validation (Stacking pipeline — decoupled branches + threshold) ──
    print(f"\n  Cross-validated Stacking pipeline ({N_FOLDS}-fold, decoupled features, {THRESHOLD_METRIC}-threshold)...")
    cv_f1s_hybrid = []
    cv_aucs_hybrid = []
    cv_aucs_xgb = []
    cv_aucs_lgbm = []
    cv_aucs_sc = []
    kf_cv = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=RANDOM_STATE + 100)
    X_full_raw = np.vstack([X_train_raw, X_test_raw])
    X_full_scaled = np.vstack([X_train_scaled, X_test_scaled])
    y_full = np.concatenate([y_train, y_test])

    for fold_i, (train_idx, test_idx) in enumerate(kf_cv.split(X_full_raw, y_full)):
        Xf_raw_tr, Xf_raw_te = X_full_raw[train_idx], X_full_raw[test_idx]
        Xf_sc_tr, Xf_sc_te = X_full_scaled[train_idx], X_full_scaled[test_idx]
        yf_tr, yf_te = y_full[train_idx], y_full[test_idx]
        spw_f = float(np.sum(yf_tr == 0) / np.sum(yf_tr == 1))

        # WOE + LR for this fold (SC features only)
        woe_cv = compute_woe_binning(Xf_raw_tr[:, sc_indices], yf_tr, sc_features, n_bins=WOE_BINS)
        Xf_woe_tr = apply_woe_transform(Xf_raw_tr[:, sc_indices], sc_features, woe_cv)
        Xf_woe_te = apply_woe_transform(Xf_raw_te[:, sc_indices], sc_features, woe_cv)
        lr_cv = LogisticRegression(C=best_C, penalty='l2', solver='saga', max_iter=500,
                                    class_weight='balanced', random_state=RANDOM_STATE, tol=1e-4)
        lr_cv.fit(Xf_woe_tr, yf_tr)
        sc_cv_proba = lr_cv.predict_proba(Xf_woe_te)[:, 1]
        del lr_cv, Xf_woe_tr; gc.collect()

        # XGBoost for this fold (ALL features + monotonic)
        xgb_cv = _build_xgb(spw_f, FEATURE_NAMES, random_state=RANDOM_STATE + fold_i, tuned_params=best_xgb_params)
        _spl = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE + 999 + fold_i)
        _tr2, _vl2 = next(_spl.split(Xf_sc_tr, yf_tr))
        xgb_cv.fit(Xf_sc_tr[_tr2], yf_tr[_tr2],
                    eval_set=[(Xf_sc_tr[_vl2], yf_tr[_vl2])], verbose=False)
        xgb_cv_proba = xgb_cv.predict_proba(Xf_sc_te)[:, 1]
        del xgb_cv; gc.collect()

        # LightGBM for this fold (ALL features + monotonic)
        if HAS_LGBM and lgbm_model is not None:
            lgbm_cv = _build_lgbm(spw_f, FEATURE_NAMES, random_state=RANDOM_STATE + fold_i + 200, tuned_params=best_lgbm_params)
            _spl3 = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE + 777 + fold_i)
            _tr3, _vl3 = next(_spl3.split(Xf_sc_tr, yf_tr))
            lgbm_cv.fit(Xf_sc_tr[_tr3], yf_tr[_tr3],
                        eval_set=[(Xf_sc_tr[_vl3], yf_tr[_vl3])],
                        callbacks=[lgb.early_stopping(150, verbose=False)])
            lgbm_cv_proba = lgbm_cv.predict_proba(Xf_sc_te)[:, 1]
            del lgbm_cv; gc.collect()
            auc_lgbm = roc_auc_score(yf_te, lgbm_cv_proba)
            cv_aucs_lgbm.append(auc_lgbm)
            # Stacked CV: use meta_lr on 3 base probabilities
            meta_cv = np.column_stack([sc_cv_proba, xgb_cv_proba, lgbm_cv_proba])
        else:
            auc_lgbm = 0.0
            meta_cv = np.column_stack([sc_cv_proba, xgb_cv_proba])

        # Stacked prediction for this CV fold
        hybrid_cv_proba = meta_lr.predict_proba(meta_cv)[:, 1]

        auc_xgb = roc_auc_score(yf_te, xgb_cv_proba)
        auc_sc = roc_auc_score(yf_te, sc_cv_proba)
        auc_hybrid = roc_auc_score(yf_te, hybrid_cv_proba)
        _, f1_hybrid = find_optimal_threshold(yf_te, hybrid_cv_proba, metric=THRESHOLD_METRIC)
        cv_aucs_xgb.append(auc_xgb)
        cv_aucs_sc.append(auc_sc)
        cv_aucs_hybrid.append(auc_hybrid)
        cv_f1s_hybrid.append(f1_hybrid)
        lgbm_str = f" LGBM={auc_lgbm:.4f}" if auc_lgbm > 0 else ""
        print(f"    Fold {fold_i+1}/{N_FOLDS}: SC={auc_sc:.4f} XGB={auc_xgb:.4f}{lgbm_str} "
              f"Stacked={auc_hybrid:.4f} {THRESHOLD_METRIC}={f1_hybrid:.4f}")
        del Xf_raw_tr, Xf_raw_te, Xf_sc_tr, Xf_sc_te, yf_tr, yf_te; gc.collect()

    print(f"\n  CV Results ({N_FOLDS}-fold):")
    print(f"    Scorecard AUC: {np.mean(cv_aucs_sc):.4f} +/- {np.std(cv_aucs_sc):.4f}")
    print(f"    XGBoost AUC:   {np.mean(cv_aucs_xgb):.4f} +/- {np.std(cv_aucs_xgb):.4f}")
    if cv_aucs_lgbm:
        print(f"    LightGBM AUC:  {np.mean(cv_aucs_lgbm):.4f} +/- {np.std(cv_aucs_lgbm):.4f}")
    print(f"    Stacked AUC:   {np.mean(cv_aucs_hybrid):.4f} +/- {np.std(cv_aucs_hybrid):.4f}")
    print(f"    Stacked {THRESHOLD_METRIC}:   {np.mean(cv_f1s_hybrid):.4f} +/- {np.std(cv_f1s_hybrid):.4f}")

    del X_full_raw, X_full_scaled, y_full; gc.collect()

    # ── Step 10: Save artifacts ──
    print(f"\n[10/10] Saving artifacts to {MODEL_DIR}...")
    xgb_model.save_model(os.path.join(MODEL_DIR, "xgb_pd_model.json"))
    joblib.dump(lr_model, os.path.join(MODEL_DIR, "lr_scorecard_model.joblib"))
    joblib.dump(woe_data_sc, os.path.join(MODEL_DIR, "woe_binning.joblib"))
    joblib.dump(scalers, os.path.join(MODEL_DIR, "per_feature_scalers.joblib"))
    joblib.dump(iso_calibrator, os.path.join(MODEL_DIR, "iso_calibrator.joblib"))
    joblib.dump(meta_lr, os.path.join(MODEL_DIR, "meta_lr.joblib"))
    if HAS_LGBM and lgbm_model is not None:
        lgbm_model.booster_.save_model(os.path.join(MODEL_DIR, "lgbm_pd_model.txt"))
        print(f"  ✓ lgbm_pd_model.txt saved")

    # Save scorecard table as JSON (human-readable)
    with open(os.path.join(MODEL_DIR, "scorecard_table.json"), "w") as f:
        json.dump(scorecard_table, f, indent=2, ensure_ascii=False)
    print(f"  ✓ scorecard_table.json saved")

    # Export test predictions CSV
    print(f"  Exporting test predictions CSV...")
    test_export = pd.DataFrame(X_test_raw, columns=FEATURE_NAMES)
    test_export['actual_default'] = y_test
    test_export['scorecard_pd'] = scorecard_test_proba
    test_export['xgb_pd'] = xgb_test_proba
    if HAS_LGBM and lgbm_test_proba is not None:
        test_export['lgbm_pd'] = lgbm_test_proba
    test_export['hybrid_pd_raw'] = hybrid_test_proba_raw
    test_export['hybrid_pd_calibrated'] = hybrid_test_proba
    test_export['scorecard_score'] = scorecard_scores_test
    test_export['ai_risk_score'] = pd_to_score(hybrid_test_proba).astype(int)
    test_export['predicted_default_050'] = (hybrid_test_proba_raw >= 0.50).astype(int)
    test_export['predicted_default_opt'] = (hybrid_test_proba_raw >= optimal_threshold).astype(int)
    test_csv_path = os.path.join(MODEL_DIR, "test_predictions.csv")
    test_export.to_csv(test_csv_path, index=False)
    print(f"  ✓ test_predictions.csv ({len(test_export):,} rows, {test_export.shape[1]} cols)")
    del test_export; gc.collect()

    metadata = {
        "version": "17.0.0",
        "architecture": "STACKING v17.0 (SC(IV) + XGB(ALL47) + LGBM(ALL47,AUC) → Meta-LR + AccWeighted + Isotonic)",
        "branch_1_scorecard": {
            "type": "WOE + LogisticRegressionCV",
            "woe_bins": WOE_BINS,
            "C": round(float(best_C), 4), "penalty": "l2", "solver": "saga",
            "class_weight": "balanced",
            "intercept": round(float(lr_model.intercept_[0]), 6),
            "auc_test": round(float(roc_auc_score(y_test, scorecard_test_proba)), 4),
            "total_iv": round(float(total_iv), 4),
            "n_features": len(sc_features),
        },
        "branch_2_xgboost": {
            "n_estimators_trained": int(n_trees),
            "scale_pos_weight": round(best_xgb_spw, 2),
            "scale_pos_weight_raw": round(scale_pos_wt, 2),
            "auc_test": round(float(roc_auc_score(y_test, xgb_test_proba)), 4),
            "hp_tuning": "optuna" if HAS_OPTUNA else "grid_search",
            "hp_tuning_metric": THRESHOLD_METRIC,
            "eval_metric": "aucpr",
            "tuned_params": {k: round(v, 4) if isinstance(v, float) else v for k, v in best_xgb_params.items()},
            "monotonic_constraints": True,
            "n_features": len(FEATURE_NAMES),
        },
        "hybrid": {
            "method": "stacking_meta_lr",
            "meta_coefs": [round(float(c), 4) for c in meta_coefs],
            "meta_intercept": round(float(meta_lr.intercept_[0]), 4),
            "base_models": ["scorecard", "xgboost"] + (["lightgbm"] if HAS_LGBM and lgbm_model is not None else []),
            "alpha": best_alpha,
            "formula": "meta_lr(SC_pd, XGB_pd, LGBM_pd)" if HAS_LGBM and lgbm_model is not None else "meta_lr(SC_pd, XGB_pd)",
            "alpha_cv_score": round(float(opt_threshold_score), 4),
            "alpha_optimization_metric": THRESHOLD_METRIC,
        },
        "calibration": {
            "method": "IsotonicRegression",
            "applied_to": "hybrid_pd (after blending, for PD reporting only)",
        },
        "threshold": {
            "value": optimal_threshold,
            "method": f"{THRESHOLD_METRIC}-optimized via CV on raw hybrid PD",
            "note": "NOT fixed 0.50. Data-driven threshold from cross-validation.",
            "accuracy": round(opt_acc, 4),
            "recall": round(opt_recall, 4),
            "precision": round(opt_precision, 4),
            "f1": round(opt_f1, 4),
            "f2": round(opt_f2, 4),
            "mcc": round(opt_mcc, 4),
        },
        "smote": {
            "applied": smote_applied,
            "method": "SMOTETomek" if smote_applied else "none",
            "sampling_strategy": SMOTE_SAMPLING_STRATEGY if smote_applied else None,
        },
        "feature_selection": {
            "method": f"IV >= {IV_MIN_THRESHOLD} (Scorecard only; XGB uses all)",
            "original_count": len(FEATURE_NAMES),
            "scorecard_count": len(sc_features),
            "xgb_count": len(FEATURE_NAMES),
            "removed_from_sc": removed_features,
        },
        "all_features": list(FEATURE_NAMES),
        "scorecard_features": sc_features,
        "features": list(FEATURE_NAMES),
        "numeric_features": list(NUMERIC_FEATURES),
        "categorical_features": list(CATEGORICAL_FEATURES),
        "n_features": len(FEATURE_NAMES),
        "scaling_config": {k: FEATURE_SCALING_CONFIG[k] for k in FEATURE_NAMES if k in FEATURE_SCALING_CONFIG},
        "test_metrics": {
            "n_test_samples": int(len(y_test)),
            "scorecard_auc": round(float(roc_auc_score(y_test, scorecard_test_proba)), 4),
            "xgb_auc": round(float(roc_auc_score(y_test, xgb_test_proba)), 4),
            "hybrid_auc": round(float(roc_auc_score(y_test, hybrid_test_proba)), 4),
            "hybrid_brier": round(float(brier_score_loss(y_test, hybrid_test_proba)), 4),
            "hybrid_accuracy": round(float(opt_acc), 4),
            "hybrid_f1": round(float(opt_f1), 4),
            "hybrid_f2": round(float(opt_f2), 4),
            "hybrid_recall": round(float(opt_recall), 4),
            "hybrid_precision": round(float(opt_precision), 4),
            "hybrid_mcc": round(float(opt_mcc), 4),
        },
        "cv_results": {
            "n_folds": N_FOLDS,
            "scorecard_auc_mean": round(float(np.mean(cv_aucs_sc)), 4),
            "xgb_auc_mean": round(float(np.mean(cv_aucs_xgb)), 4),
            "hybrid_auc_mean": round(float(np.mean(cv_aucs_hybrid)), 4),
            "hybrid_auc_std": round(float(np.std(cv_aucs_hybrid)), 4),
            "hybrid_f1_mean": round(float(np.mean(cv_f1s_hybrid)), 4),
            "hybrid_f1_std": round(float(np.std(cv_f1s_hybrid)), 4),
        },
        "xgb_feature_importance": feature_importance,
        "iv_ranking": [{"feature": fname, "iv": woe_data_all[fname]['iv']} for fname in FEATURE_NAMES],
        "scorecard_params": {"base_score": BASE_SCORE, "pdo": PDO, "factor": round(FACTOR, 4), "offset": round(OFFSET, 4)},
        "training_config": {
            "max_samples": MAX_SAMPLES,
            "min_test_samples": MIN_TEST_SAMPLES,
            "woe_bins": WOE_BINS,
            "use_smote": USE_SMOTE,
            "smote_applied": smote_applied,
            "threshold_metric": THRESHOLD_METRIC,
            "device": "cpu",
            "random_state": RANDOM_STATE,
        },
        "artifacts": [
            "xgb_pd_model.json", "lr_scorecard_model.joblib",
            "woe_binning.joblib", "per_feature_scalers.joblib",
            "iso_calibrator.joblib", "scorecard_table.json",
            "meta_lr.joblib",
        ] + (["lgbm_pd_model.txt"] if HAS_LGBM and lgbm_model is not None else []) + [
            "metadata.json", "test_predictions.csv",
        ],
        "usd_to_vnd": USD_TO_VND,
    }
    with open(os.path.join(MODEL_DIR, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    print(f"\n  Artifacts saved:")
    for a in metadata["artifacts"]:
        fpath = os.path.join(MODEL_DIR, a)
        if os.path.exists(fpath):
            sz = os.path.getsize(fpath) / 1024
            print(f"    ✓ {a} ({sz:.1f} KB)")

    # ── Charts ──
    print(f"\n  Generating 21 charts...")
    plot_all_charts(
        y_test, xgb_test_proba, scorecard_test_proba, hybrid_test_proba,
        X_test_raw, FEATURE_NAMES, CHART_DIR, metadata,
        scorecard_scores=scorecard_scores_test,
        woe_data=woe_data_all, scorecard_table=scorecard_table,
        hybrid_proba_raw=hybrid_test_proba_raw,
    )

    elapsed = time.time() - ts
    print(f"\n{'═'*70}")
    print(f"  DONE — Total time: {elapsed/60:.1f} min")
    print(f"  Scorecard AUC: {roc_auc_score(y_test, scorecard_test_proba):.4f}")
    print(f"  XGBoost AUC:   {roc_auc_score(y_test, xgb_test_proba):.4f}")
    if HAS_LGBM and lgbm_test_proba is not None:
        print(f"  LightGBM AUC:  {roc_auc_score(y_test, lgbm_test_proba):.4f}")
    print(f"  Stacked AUC:   {roc_auc_score(y_test, hybrid_test_proba):.4f}")
    print(f"  XGB features:  {len(FEATURE_NAMES)} (all, +monotonic, +tuned HP, SPW={best_xgb_spw:.2f})")
    print(f"  SC features:   {len(sc_features)} (IV≥{IV_MIN_THRESHOLD})")
    print(f"  Ensemble:      Stacking (Meta-LR on SC + XGB{' + LGBM' if HAS_LGBM and lgbm_model is not None else ''})")
    print(f"  Threshold:     {optimal_threshold:.3f} ({THRESHOLD_METRIC}-optimized, NOT fixed 0.50)")
    print(f"    Accuracy={opt_acc:.4f}  Recall={opt_recall:.4f}  Precision={opt_precision:.4f}")
    print(f"    F1={opt_f1:.4f}  F2={opt_f2:.4f}  MCC={opt_mcc:.4f}")
    print(f"{'═'*70}")

    return metadata


# ═══════════════════════════════════════════════════════════
# CreditScorer CLASS (for inference / integration)
# ═══════════════════════════════════════════════════════════
class CreditScorer:
    FEATURE_ALIASES = {
        "so_tien_vay": "capital", "thu_nhap_hang_thang": "monthly_income",
        "tra_hang_thang": "monthly_pay", "du_no_quay_vong": "revolving_balance",
        "tong_du_no_hien_tai": "total_current_balance",
        "ti_le_no_thu_nhap": "dti", "ti_le_su_dung_tin_dung": "revolving_util_percent",
        "so_nam_lam_viec": "emp_length_years", "no_xau_dang_hoat_dong": "active_bad_debts",
        "so_lan_pha_san": "bankruptcies", "khoan_vay_dang_hoat_dong": "active_loans",
        "tong_lich_su_vay": "total_loans_history",
        "so_thang_lich_su_tin_dung": "credit_history_months",
        "so_lan_truy_van_gan_day": "recent_inquiries",
        "diem_tin_dung": "credit_score",
        "ky_han_thang": "term_enc", "loai_nha_o": "home_ownership_enc",
        "trang_thai_xac_minh": "verification_status_enc",
        "muc_dich_vay": "purpose_enc",
        "so_lan_qua_han_2_nam": "delinquencies_2yr",
        "so_tai_khoan_qua_han": "accounts_delinquent",
        "qua_han_nang_24_thang": "severe_delinquencies_24m",
        "ty_le_khong_qua_han": "pct_never_delinquent",
        "thu_no_12_thang": "collections_12m",
        "ty_le_vay_thu_nhap": "loan_to_income",
        # Interaction features (v12)
        "ganh_nang_tra_no": "payment_burden",
        "ty_le_du_no_thu_nhap_nam": "balance_income_ratio",
        "ty_le_no_quay_vong": "revolving_concentration",
        "muc_do_qua_han": "delinquency_severity",
        "truy_van_tren_khoan_vay": "inquiry_per_account",
        "chat_luong_lich_su": "credit_quality_depth",
        # Power features (v15)
        "thu_nhap_tren_khoan_vay": "income_per_loan",
        "tich_luy_rui_ro": "risk_accumulation",
        "rui_ro_ky_han_vay": "term_loan_risk",
        "dti_binh_phuong": "dti_squared",
        "diem_su_dung": "score_utilization",
        "tra_gop_thu_nhap_ky_han": "installment_income_term",
        "ty_le_qua_han": "delinquency_rate",
        "dong_tien_rong_thang": "net_monthly_cashflow",
        # High-Signal features (v17)
        "lai_suat": "interest_rate",
        "han_muc_tin_dung_quay_vong": "revolving_credit_limit",
        "thang_ke_tu_qua_han": "months_since_delinquency",
        "tai_khoan_mo_moi_12m": "new_accounts_12m",
        "so_khoan_the_chap": "mortgage_accounts",
        "tong_han_muc_tin_dung": "total_credit_limit",
        "rui_ro_lai_vay": "rate_loan_risk",
        "ty_le_tin_dung_con_lai": "credit_headroom_pct",
    }

    def __init__(self, model_dir: str):
        self.model_dir = model_dir
        # Load XGBoost (Nhánh 2)
        self.xgb_model = xgb.XGBClassifier()
        self.xgb_model.load_model(os.path.join(model_dir, "xgb_pd_model.json"))
        # Load LightGBM (Nhánh 3) if available
        lgbm_path = os.path.join(model_dir, "lgbm_pd_model.txt")
        if os.path.exists(lgbm_path) and HAS_LGBM:
            self.lgbm_model = lgb.Booster(model_file=lgbm_path)
        else:
            self.lgbm_model = None
        # Load LR Scorecard (Nhánh 1)
        self.lr_model = joblib.load(os.path.join(model_dir, "lr_scorecard_model.joblib"))
        self.woe_data = joblib.load(os.path.join(model_dir, "woe_binning.joblib"))
        # Scalers + Calibration
        self.scalers = joblib.load(os.path.join(model_dir, "per_feature_scalers.joblib"))
        self.iso_calibrator = joblib.load(os.path.join(model_dir, "iso_calibrator.joblib"))
        # Meta-learner
        meta_path = os.path.join(model_dir, "meta_lr.joblib")
        if os.path.exists(meta_path):
            self.meta_lr = joblib.load(meta_path)
        else:
            self.meta_lr = None
        # Metadata
        with open(os.path.join(model_dir, "metadata.json"), "r") as f:
            self.metadata = json.load(f)
        # v12.1: decoupled feature paths
        self.all_features = self.metadata.get("all_features", self.metadata["features"])
        self.sc_features = self.metadata.get("scorecard_features", self.metadata["features"])
        self.alpha = self.metadata.get("hybrid", {}).get("alpha", 0.3)
        self.optimal_threshold = self.metadata.get("threshold", {}).get("value", 0.5)
        # Scorecard table (for explanations)
        sc_path = os.path.join(model_dir, "scorecard_table.json")
        if os.path.exists(sc_path):
            with open(sc_path, "r") as f:
                self.scorecard_table = json.load(f)
        else:
            self.scorecard_table = None
        ensemble_str = "SC+XGB+LGBM→Meta-LR" if self.lgbm_model else "SC+XGB→Meta-LR" if self.meta_lr else f"α={self.alpha:.2f}"
        print(f"[CreditScorer] Loaded v{self.metadata['version']} "
              f"({ensemble_str}, XGB={len(self.all_features)}feat, SC={len(self.sc_features)}feat)")

    def predict(self, features: dict) -> dict:
        # Resolve Vietnamese aliases → canonical names
        resolved = {}
        for k, v in features.items():
            canon = self.FEATURE_ALIASES.get(k, k)
            resolved[canon] = v

        # Auto-compute interaction features from base features (v12)
        mi = resolved.get("monthly_income", 0)
        mp = resolved.get("monthly_pay", 0)
        tcb = resolved.get("total_current_balance", 0)
        rb = resolved.get("revolving_balance", 0)
        d2y = resolved.get("delinquencies_2yr", 0)
        acd = resolved.get("accounts_delinquent", 0)
        sd24 = resolved.get("severe_delinquencies_24m", 0)
        ri = resolved.get("recent_inquiries", 0)
        al = resolved.get("active_loans", 0)
        chm = resolved.get("credit_history_months", 0)
        pnd = resolved.get("pct_never_delinquent", 100)
        resolved.setdefault("payment_burden", mp / (mi + 1))
        resolved.setdefault("balance_income_ratio", tcb / (mi * 12 + 1))
        resolved.setdefault("revolving_concentration", rb / (tcb + 1))
        resolved.setdefault("delinquency_severity", d2y + 2 * acd + 3 * sd24)
        resolved.setdefault("inquiry_per_account", ri / (al + 1))
        resolved.setdefault("credit_quality_depth", chm * pnd / 100)

        # Power features (v15)
        abd = resolved.get("active_bad_debts", 0)
        bk = resolved.get("bankruptcies", 0)
        col12 = resolved.get("collections_12m", 0)
        cs = resolved.get("credit_score", 600)
        rup = resolved.get("revolving_util_percent", 50)
        dti = resolved.get("dti", 15)
        tlh = resolved.get("total_loans_history", 10)
        te = resolved.get("term_enc", 36)
        lti = resolved.get("loan_to_income", 0.2)
        resolved.setdefault("income_per_loan", mi / (al + 1))
        resolved.setdefault("risk_accumulation", abd + 2 * bk + 3 * sd24 + d2y + col12)
        resolved.setdefault("term_loan_risk", (te / 36) * lti)
        resolved.setdefault("dti_squared", (dti / 100) ** 2)
        resolved.setdefault("score_utilization", cs * (1 - rup / 150))
        annual_inc = mi * 12 if mi * 12 > 0 else 1
        resolved.setdefault("installment_income_term", mp * te / annual_inc)
        resolved.setdefault("delinquency_rate", (d2y + acd) / (tlh + 1))
        resolved.setdefault("net_monthly_cashflow", max(0, mi - mp))

        # High-Signal features (v17)
        ir = resolved.get("interest_rate", 12.0)
        rcl = resolved.get("revolving_credit_limit", 0)
        resolved.setdefault("rate_loan_risk", ir * lti)
        resolved.setdefault("credit_headroom_pct",
                            1 - rb / (rcl + 1) if rcl > 0 else 0.0)

        # Full feature vector (ALL features, for XGBoost)
        vec_full = np.array([[resolved.get(fn, 0.0) for fn in self.all_features]], dtype=np.float64)

        # Nhánh 1: WOE → LR → Scorecard PD (SC features only)
        sc_idx = [self.all_features.index(fn) for fn in self.sc_features]
        vec_sc = vec_full[:, sc_idx]
        vec_woe = apply_woe_transform(vec_sc, self.sc_features, self.woe_data)
        scorecard_pd = float(self.lr_model.predict_proba(vec_woe)[:, 1][0])

        # Nhánh 2: Scaled → XGBoost PD (ALL features)
        vec_scaled = apply_per_feature_scalers(vec_full, self.scalers, self.all_features)
        xgb_pd = float(self.xgb_model.predict_proba(vec_scaled)[:, 1][0])

        # Nhánh 3: Scaled → LightGBM PD (ALL features) if available
        lgbm_pd = None
        if self.lgbm_model is not None:
            lgbm_pd = float(self.lgbm_model.predict(vec_scaled)[0])

        # Stacking or simple blend
        if self.meta_lr is not None:
            if lgbm_pd is not None:
                meta_vec = np.array([[scorecard_pd, xgb_pd, lgbm_pd]])
            else:
                meta_vec = np.array([[scorecard_pd, xgb_pd]])
            hybrid_raw = float(self.meta_lr.predict_proba(meta_vec)[:, 1][0])
        else:
            hybrid_raw = self.alpha * scorecard_pd + (1 - self.alpha) * xgb_pd
        pd_cal = float(self.iso_calibrator.predict(np.array([hybrid_raw]))[0])
        pd_cal = np.clip(pd_cal, 0.0, 1.0)
        score = int(round(pd_to_score(np.array([pd_cal]))[0]))

        # Classification uses RAW hybrid PD (pre-isotonic, balanced)
        # Isotonic compresses PD to ~base_rate, so 0.50 only works on raw
        is_default = int(hybrid_raw >= self.optimal_threshold)

        # Scorecard explanation (point breakdown — SC features)
        explanation = []
        if self.scorecard_table:
            coefs = self.lr_model.coef_[0]
            intercept = self.lr_model.intercept_[0]
            n_feat = len(self.sc_features)
            intercept_per_feat = intercept / n_feat
            for i, fname in enumerate(self.sc_features):
                fd = self.woe_data[fname]
                edges = np.array(fd['edges'])
                woe_map = fd['woe_map']
                val = vec_sc[0, i]
                bin_idx = int(np.digitize([val], edges[1:-1], right=False)[0])
                woe = woe_map.get(bin_idx, 0.0)
                points = -(coefs[i] * woe + intercept_per_feat) * FACTOR
                explanation.append({
                    "feature": fname,
                    "value": round(float(val), 4),
                    "woe": round(float(woe), 4),
                    "points": round(float(points), 2),
                })
            explanation.sort(key=lambda x: x['points'])

        return {
            "ai_risk_score": score,
            "default_probability": round(pd_cal, 6),
            "is_default_predicted": is_default,
            "threshold": self.optimal_threshold,
            "components": {
                "scorecard_pd": round(scorecard_pd, 6),
                "xgb_pd": round(xgb_pd, 6),
                "lgbm_pd": round(lgbm_pd, 6) if lgbm_pd is not None else None,
                "hybrid_pd_raw": round(hybrid_raw, 6),
                "hybrid_pd_calibrated": round(pd_cal, 6),
                "alpha": self.alpha,
                "method": "stacking" if self.meta_lr else "alpha_blend",
            },
            "scorecard_explanation": explanation[:10] if explanation else [],
        }


# ═══════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════
if __name__ == "__main__":
    metadata = train_model()
    print("\n  Quick sanity check (CreditScorer)...")
    scorer = CreditScorer(MODEL_DIR)
    test_features = {
        "credit_score": 700, "capital": 200_000_000,
        "monthly_income": 30_000_000, "monthly_pay": 5_000_000,
        "revolving_balance": 10_000_000, "total_current_balance": 50_000_000,
        "dti": 15.0, "revolving_util_percent": 30.0,
        "emp_length_years": 5, "active_bad_debts": 0, "bankruptcies": 0,
        "active_loans": 3, "total_loans_history": 10,
        "credit_history_months": 120, "recent_inquiries": 1,
        "delinquencies_2yr": 0, "accounts_delinquent": 0,
        "severe_delinquencies_24m": 0, "pct_never_delinquent": 95.0,
        "collections_12m": 0, "loan_to_income": 0.6,
        "term_enc": 36, "home_ownership_enc": 2,
        "verification_status_enc": 1, "purpose_enc": 0,
    }
    result = scorer.predict(test_features)
    print(f"  Score: {result['ai_risk_score']}  PD: {result['default_probability']:.4f}")
    print(f"  Components: SC={result['components']['scorecard_pd']:.4f} XGB={result['components']['xgb_pd']:.4f}")
    print(f"  Calibrated: {result['components']['hybrid_pd_calibrated']:.4f}  Threshold: {result['threshold']:.2f}")
    print(f"  Default predicted: {result['is_default_predicted']}")
    if result.get('scorecard_explanation'):
        print(f"\n  Scorecard Explanation (top factors):")
        for item in result['scorecard_explanation'][:5]:
            direction = "⊖" if item['points'] < 0 else "⊕"
            print(f"    {direction} {item['feature']}: {item['points']:+.1f} pts (value={item['value']:.2f}, WOE={item['woe']:.3f})")
    print(f"\n  ALL DONE ✓")
