"""
╔══════════════════════════════════════════════════════════════════════════╗
║  AIScore — XGBoost + Random Forest SCORECARD (Google Colab)            ║
║  Dataset: Lending Club — accepted + rejected (2007-2018 Q4)            ║
║  Train + Evaluate + Score + 20 Charts — ALL IN ONE FILE                ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  ARCHITECTURE — 3 STAGES:                                              ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━                                             ║
║                                                                        ║
║  Stage 1 — XGBoost (Benchmark / Feature Importance):                   ║
║    XGBoost GPU → AUC benchmark + Feature importance ranking            ║
║                                                                        ║
║  Stage 2 — Random Forest (Main Classifier):                            ║
║    Input: 14 features (9 NUMERIC scaled + 5 CATEGORICAL passthrough)   ║
║    Output: PD (Probability of Default)                                 ║
║                                                                        ║
║  Stage 3 — Scorecard Formula (Banking Standard):                       ║
║    Score = Offset - Factor × ln(PD / (1 - PD))                        ║
║    Higher score = Lower risk                                           ║
║                                                                        ║
║  14 FEATURES (from Lending Club data):                                 ║
║    NUMERIC (9):  credit_score, loan_amnt, int_rate, annual_inc,        ║
║                  dti, revol_util, open_acc, pub_rec, loan_to_income    ║
║    CATEGORY (5): term_enc, home_ownership_enc,                         ║
║                  verification_status_enc, purpose_enc, emp_length_enc  ║
║                                                                        ║
║  DATA SOURCE:                                                          ║
║    accepted_2007_to_2018Q4.csv — 2.26M rows (labeled: train)          ║
║    rejected_2007_to_2018Q4.csv — 27.6M rows (EDA / comparison only)   ║
║                                                                        ║
║  OUTPUT: Models + 20 charts + Metadata JSON                            ║
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
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler, RobustScaler, MinMaxScaler
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    classification_report,
    confusion_matrix,
    brier_score_loss,
    log_loss,
    roc_curve,
    precision_recall_curve,
    average_precision_score,
    matthews_corrcoef,
    balanced_accuracy_score,
    cohen_kappa_score,
)
from sklearn.calibration import calibration_curve
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

# ── Scorecard Parameters (Industry Standard) ──
BASE_SCORE = 600       # Score tai base odds
PDO = 20               # Points to Double Odds
BASE_ODDS = 50         # Tai BASE_SCORE, odds good:bad = 50:1
FACTOR = PDO / np.log(2)                          # ≈ 28.854
OFFSET = BASE_SCORE - FACTOR * np.log(BASE_ODDS)  # ≈ 487.12

print(f"[config] Architecture: XGBoost (benchmark) + Random Forest Scorecard")
print(f"[config] Features: 14 (9 numeric + 5 categorical)")
print(f"[config] Data: accepted + rejected Lending Club (2007-2018 Q4)")
print(f"[config] Scorecard: Base={BASE_SCORE}, PDO={PDO}, Factor={FACTOR:.3f}, Offset={OFFSET:.3f}")

# Model colors
COLORS = {
    'xgb':    '#2196F3',  # Blue
    'rf':     '#4CAF50',  # Green
    'hybrid': '#E91E63',  # Pink
}
MODEL_LABELS = {
    'xgb':    'XGBoost (benchmark)',
    'rf':     'Random Forest',
    'hybrid': 'RF Scorecard',
}


# ===================== SCORECARD FORMULA =====================
def pd_to_score(pd_arr):
    """Chuyen PD (0-1) thanh Credit Score (150-950).
    Score = Offset - Factor × ln(PD / (1-PD))
    Higher score = lower risk.
    """
    pd_c = np.clip(np.asarray(pd_arr, dtype=np.float64), 1e-15, 1 - 1e-15)
    odds = pd_c / (1 - pd_c)
    scores = OFFSET - FACTOR * np.log(odds)
    return np.clip(scores, 150, 950)


def score_to_pd(score_arr):
    """Chuyen Credit Score thanh PD."""
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
            req = urllib.request.Request(url, headers={"User-Agent": "aiscore-service/7.0"})
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
# 14 FEATURES — 9 NUMERIC + 5 CATEGORICAL
# ═══════════════════════════════════════════════════════════════════════
# Data source: Lending Club accepted_2007_to_2018Q4.csv (2.26M rows)
# Rejected CSV (27.6M rows) chi dung cho EDA vi khong co loan outcome.
#
# NUMERIC (9 features) — duoc scale per strategy:
# | #  | Feature          | LC Column            | Xu ly                  |
# |----|------------------|---------------------|------------------------|
# | 1  | credit_score     | fico_range_low/high | avg(low, high)         |
# | 2  | loan_amnt        | loan_amnt           | × VND rate             |
# | 3  | int_rate         | int_rate            | as-is (%)              |
# | 4  | annual_inc       | annual_inc          | × VND rate             |
# | 5  | dti              | dti                 | clip [0, 100]          |
# | 6  | revol_util       | revol_util          | clip [0, 150]          |
# | 7  | open_acc         | open_acc            | clip [0, 50]           |
# | 8  | pub_rec          | pub_rec             | clip [0, 20]           |
# | 9  | loan_to_income   | ENGINEERED          | loan_amnt / annual_inc |
#
# CATEGORICAL (5 features) — passthrough (khong scale):
# | #  | Feature                 | LC Column           | Xu ly                      |
# |----|-------------------------|---------------------|----------------------------|
# | 10 | term_enc                | term                | "36 months"→36, "60"→60    |
# | 11 | home_ownership_enc      | home_ownership      | RENT→0, OWN→1, MORTGAGE→2  |
# | 12 | verification_status_enc | verification_status | NotVer→0, SrcVer→1, Ver→2  |
# | 13 | purpose_enc             | purpose             | top 14 categories → 0-13   |
# | 14 | emp_length_enc          | emp_length          | ordinal 0-10               |
#
# TARGET: loan_status → "Charged Off" = 1, "Fully Paid" = 0
# ═══════════════════════════════════════════════════════════════════════

NUMERIC_FEATURES = [
    "credit_score", "loan_amnt", "int_rate", "annual_inc",
    "dti", "revol_util", "open_acc", "pub_rec", "loan_to_income",
]

CATEGORICAL_FEATURES = [
    "term_enc", "home_ownership_enc", "verification_status_enc",
    "purpose_enc", "emp_length_enc",
]

# Thu tu chuan — NUMERIC truoc, CATEGORICAL sau
FEATURE_NAMES = NUMERIC_FEATURES + CATEGORICAL_FEATURES  # 14 total

# Columns doc tu accepted CSV (chi doc cot can thiet → tiet kiem RAM)
ACCEPTED_USECOLS = [
    "loan_amnt", "term", "int_rate", "emp_length", "home_ownership",
    "annual_inc", "verification_status", "loan_status", "purpose",
    "dti", "fico_range_low", "fico_range_high", "revol_util",
    "open_acc", "pub_rec",
]

# ── Encoding maps ──
HOME_MAP = {"RENT": 0, "OWN": 1, "MORTGAGE": 2, "OTHER": 3, "NONE": 3, "ANY": 3}

VERIFICATION_MAP = {"Not Verified": 0, "Source Verified": 1, "Verified": 2}

PURPOSE_MAP = {
    "debt_consolidation": 0, "credit_card": 1, "home_improvement": 2,
    "other": 3, "major_purchase": 4, "medical": 5, "small_business": 6,
    "car": 7, "vacation": 8, "moving": 9, "house": 10,
    "wedding": 11, "renewable_energy": 12, "educational": 13,
}

EMP_LENGTH_MAP = {
    "< 1 year": 0, "1 year": 1, "2 years": 2, "3 years": 3,
    "4 years": 4, "5 years": 5, "6 years": 6, "7 years": 7,
    "8 years": 8, "9 years": 9, "10+ years": 10,
}


# ===================== SMART PER-FEATURE SCALING =====================
# Moi feature co 1 chien luoc chuan hoa rieng, phu hop voi phan phoi du lieu
#
# | Strategy       | Pipeline                   | Khi nao dung?                        |
# |----------------|----------------------------|--------------------------------------|
# | log_standard   | log1p(x) → StandardScaler  | Tien VND lech phai manh              |
# | log_robust     | log1p(x) → RobustScaler    | Tien VND + outliers cuc doan         |
# | robust         | RobustScaler (median/IQR)  | % bounded, count zero-inflated       |
# | standard       | StandardScaler (mean/std)  | Phan phoi gan normal                 |
# | minmax         | MinMaxScaler [0,1]         | Range nho, bounded                   |
# | passthrough    | Khong scale                | Ordinal categorical (discrete label) |

FEATURE_SCALING_CONFIG = {
    # ══ NUMERIC (9) — duoc scale ══
    "credit_score":   "standard",       # FICO avg 300-850, gan uniform
    "loan_amnt":      "log_standard",   # VND, right-skewed manh
    "int_rate":       "standard",       # 5-30%, gan normal
    "annual_inc":     "log_robust",     # VND, right-skewed + outliers
    "dti":            "robust",         # 0-100%, co outliers
    "revol_util":     "robust",         # 0-150%, lech
    "open_acc":       "robust",         # Count, co outliers
    "pub_rec":        "robust",         # Count, phan lon = 0
    "loan_to_income": "log_robust",     # Ratio, right-skewed

    # ══ CATEGORICAL (5) — KHONG scale (passthrough) ══
    "term_enc":                "passthrough",     # 36 hoac 60
    "home_ownership_enc":      "passthrough",     # 0/1/2/3 (ordinal)
    "verification_status_enc": "passthrough",     # 0/1/2 (eKYC level)
    "purpose_enc":             "passthrough",     # 0-13 (loan purpose)
    "emp_length_enc":          "passthrough",     # 0-10 (tham nien)
}


def _fit_one_feature(values_1d, strategy):
    """Fit scaler cho 1 feature theo strategy. Return (strategy, scaler_or_None, transformed)."""
    col = values_1d.reshape(-1, 1).astype(np.float64)

    if strategy == "log_standard":
        col_log = np.log1p(np.clip(col, 0, None))
        sc = StandardScaler()
        out = sc.fit_transform(col_log).ravel()
        return (strategy, sc, out)

    elif strategy == "log_robust":
        col_log = np.log1p(np.clip(col, 0, None))
        sc = RobustScaler()
        out = sc.fit_transform(col_log).ravel()
        return (strategy, sc, out)

    elif strategy == "robust":
        sc = RobustScaler()
        out = sc.fit_transform(col).ravel()
        return (strategy, sc, out)

    elif strategy == "standard":
        sc = StandardScaler()
        out = sc.fit_transform(col).ravel()
        return (strategy, sc, out)

    elif strategy == "minmax":
        sc = MinMaxScaler()
        out = sc.fit_transform(col).ravel()
        return (strategy, sc, out)

    elif strategy == "passthrough":
        return (strategy, None, col.ravel())

    else:
        raise ValueError(f"Unknown scaling strategy: {strategy}")


def _transform_one_feature(values_1d, strategy, scaler):
    """Transform 1 feature da fit."""
    col = values_1d.reshape(-1, 1).astype(np.float64)

    if strategy in ("log_standard", "log_robust"):
        col_log = np.log1p(np.clip(col, 0, None))
        return scaler.transform(col_log).ravel()

    elif strategy in ("robust", "standard", "minmax"):
        return scaler.transform(col).ravel()

    elif strategy == "passthrough":
        return col.ravel()

    else:
        raise ValueError(f"Unknown scaling strategy: {strategy}")


def create_per_feature_scalers(X_train_raw, feature_names):
    """Tao pipeline chuan hoa rieng cho MOI feature theo FEATURE_SCALING_CONFIG.
    Return: scalers dict {name: (strategy, scaler)}, X_scaled.
    """
    scalers = {}
    X_scaled = np.zeros_like(X_train_raw, dtype=np.float64)
    for i, fname in enumerate(feature_names):
        strategy = FEATURE_SCALING_CONFIG.get(fname, "standard")
        strat, sc, transformed = _fit_one_feature(X_train_raw[:, i], strategy)
        X_scaled[:, i] = transformed
        scalers[fname] = (strat, sc)
    return scalers, X_scaled


def apply_per_feature_scalers(X_raw, scalers, feature_names):
    """Transform du lieu bang cac scaler da fit."""
    X_scaled = np.zeros_like(X_raw, dtype=np.float64)
    for i, fname in enumerate(feature_names):
        strategy, sc = scalers[fname]
        X_scaled[:, i] = _transform_one_feature(X_raw[:, i], strategy, sc)
    return X_scaled


# ===================== DATA LOADING =====================
def load_and_clean_data(accepted_path, rejected_path=None, chart_dir=None):
    """Load va xu ly du lieu Lending Club cho credit scoring.

    Args:
        accepted_path: Path to accepted_2007_to_2018Q4.csv (labeled → training)
        rejected_path: Path to rejected_2007_to_2018Q4.csv (EDA only, no labels)
        chart_dir: Path to save EDA chart comparing accepted vs rejected
    Returns:
        pd.DataFrame with FEATURE_NAMES + ['is_default']
    """
    print(f"  Loading accepted loans from {accepted_path}...")
    df = pd.read_csv(accepted_path, usecols=ACCEPTED_USECOLS, low_memory=False)
    print(f"  Raw accepted: {len(df):,} rows × {len(df.columns)} columns")

    # ── Filter terminal loan statuses ──
    df = df[df["loan_status"].isin(["Fully Paid", "Charged Off"])].copy()
    df["is_default"] = (df["loan_status"] == "Charged Off").astype(int)
    print(f"  After filtering (Fully Paid + Charged Off): {len(df):,} rows")
    print(f"  Default rate: {df['is_default'].mean():.2%}")
    print(f"  Class distribution: Fully Paid={len(df) - df['is_default'].sum():,} | Charged Off={df['is_default'].sum():,}")

    rate = USD_TO_VND

    # ════════════════════════════════════════════
    # NUMERIC FEATURES (9)
    # ════════════════════════════════════════════

    # 1. credit_score: avg(fico_range_low, fico_range_high)
    df["credit_score"] = ((df["fico_range_low"] + df["fico_range_high"]) / 2)
    df = df.dropna(subset=["credit_score"])

    # 2. loan_amnt: USD → VND
    df["loan_amnt"] = pd.to_numeric(df["loan_amnt"], errors='coerce') * rate

    # 3. int_rate: lai suat (%)
    df["int_rate"] = pd.to_numeric(df["int_rate"], errors='coerce')

    # 4. annual_inc: USD → VND
    df["annual_inc"] = pd.to_numeric(df["annual_inc"], errors='coerce') * rate

    # 5. dti: ty le no/thu nhap (%)
    df["dti"] = pd.to_numeric(df["dti"], errors='coerce')
    df["dti"] = df["dti"].fillna(df["dti"].median())
    df["dti"] = df["dti"].clip(0, 100)

    # 6. revol_util: ty le su dung tin dung quay vong (%)
    df["revol_util"] = pd.to_numeric(df["revol_util"], errors='coerce')
    df["revol_util"] = df["revol_util"].fillna(df["revol_util"].median())
    df["revol_util"] = df["revol_util"].clip(0, 150)

    # 7. open_acc: so tai khoan dang mo
    df["open_acc"] = pd.to_numeric(df["open_acc"], errors='coerce')
    df["open_acc"] = df["open_acc"].fillna(df["open_acc"].median())
    df["open_acc"] = df["open_acc"].clip(0, 50)

    # 8. pub_rec: so ho so cong khai (pha san, v.v.)
    df["pub_rec"] = pd.to_numeric(df["pub_rec"], errors='coerce')
    df["pub_rec"] = df["pub_rec"].fillna(0)
    df["pub_rec"] = df["pub_rec"].clip(0, 20)

    # 9. loan_to_income: ty le vay/thu nhap (engineered)
    annual_inc_safe = df["annual_inc"].clip(lower=1)
    df["loan_to_income"] = df["loan_amnt"] / annual_inc_safe

    # ── Clip outliers tren cac feature tien te ──
    df["annual_inc"] = df["annual_inc"].clip(0, df["annual_inc"].quantile(0.99))
    df["loan_to_income"] = df["loan_to_income"].clip(0, df["loan_to_income"].quantile(0.99))

    # ════════════════════════════════════════════
    # CATEGORICAL FEATURES (5)
    # ════════════════════════════════════════════

    # 10. term_enc: "36 months" → 36, "60 months" → 60
    df["term_enc"] = df["term"].str.extract(r"(\d+)").astype(float)

    # 11. home_ownership_enc: RENT→0, OWN→1, MORTGAGE→2, OTHER→3
    df["home_ownership_enc"] = df["home_ownership"].map(HOME_MAP).fillna(3).astype(int)

    # 12. verification_status_enc: Not Verified→0, Source Verified→1, Verified→2
    df["verification_status_enc"] = df["verification_status"].map(VERIFICATION_MAP).fillna(0).astype(int)

    # 13. purpose_enc: 14 categories → ordinal 0-13
    df["purpose_enc"] = df["purpose"].map(PURPOSE_MAP).fillna(3).astype(int)  # unmapped → 'other' (3)

    # 14. emp_length_enc: ordinal 0-10, NaN → median
    df["emp_length_enc"] = df["emp_length"].map(EMP_LENGTH_MAP)
    median_emp = df["emp_length_enc"].median()
    df["emp_length_enc"] = df["emp_length_enc"].fillna(median_emp).astype(int)

    # ── Drop remaining NaN ──
    before_drop = len(df)
    df = df[FEATURE_NAMES + ["is_default"]].dropna()
    dropped = before_drop - len(df)
    if dropped > 0:
        print(f"  Dropped {dropped:,} rows with NaN ({dropped/before_drop:.2%})")

    print(f"\n  Final dataset: {len(df):,} rows × {len(FEATURE_NAMES)} features")
    print(f"  Feature summary:")
    for fn in FEATURE_NAMES:
        ftype = "NUM" if fn in NUMERIC_FEATURES else "CAT"
        vals = df[fn]
        print(f"    [{ftype}] {fn:28s} min={vals.min():>12.2f}  median={vals.median():>12.2f}  max={vals.max():>12.2f}  NaN={vals.isna().sum()}")

    # ════════════════════════════════════════════
    # REJECTED CSV — EDA only (khong co loan outcome)
    # ════════════════════════════════════════════
    if rejected_path and os.path.exists(rejected_path):
        print(f"\n  {'='*60}")
        print(f"  PHAN TICH REJECTED DATA (EDA)")
        print(f"  {'='*60}")
        print(f"  Loading FULL rejected data from {rejected_path}...")
        try:
            df_rej = pd.read_csv(rejected_path, low_memory=False)
            print(f"  Rejected FULL: {len(df_rej):,} rows")

            # Parse fields
            df_rej["risk_score"] = pd.to_numeric(df_rej["Risk_Score"], errors='coerce')
            df_rej["dti_clean"] = df_rej["Debt-To-Income Ratio"].str.replace('%', '', regex=False)
            df_rej["dti_clean"] = pd.to_numeric(df_rej["dti_clean"], errors='coerce')
            df_rej["amount"] = pd.to_numeric(df_rej["Amount Requested"], errors='coerce')

            # Summary stats
            print(f"\n  Rejected Data Summary:")
            print(f"    Risk Score:  mean={df_rej['risk_score'].mean():.0f}, median={df_rej['risk_score'].median():.0f}, "
                  f"min={df_rej['risk_score'].min():.0f}, max={df_rej['risk_score'].max():.0f}")
            print(f"    DTI:         mean={df_rej['dti_clean'].mean():.1f}%, median={df_rej['dti_clean'].median():.1f}%")
            print(f"    Amount:      mean=${df_rej['amount'].mean():,.0f}, median=${df_rej['amount'].median():,.0f}")

            # Comparison table
            print(f"\n  {'Metric':28s} {'Accepted':>15s} {'Rejected':>15s} {'Delta':>12s}")
            print(f"  {'─'*28} {'─'*15} {'─'*15} {'─'*12}")
            acc_cs = df["credit_score"].mean()
            rej_cs = df_rej["risk_score"].mean()
            print(f"  {'Credit/Risk Score (mean)':28s} {acc_cs:>15.0f} {rej_cs:>15.0f} {rej_cs - acc_cs:>+12.0f}")
            acc_dti = df["dti"].mean()
            rej_dti = df_rej["dti_clean"].mean()
            print(f"  {'DTI % (mean)':28s} {acc_dti:>15.1f} {rej_dti:>15.1f} {rej_dti - acc_dti:>+12.1f}")
            acc_amt = df["loan_amnt"].mean() / rate
            rej_amt = df_rej["amount"].mean()
            print(f"  {'Loan Amount USD (mean)':28s} {acc_amt:>15,.0f} {rej_amt:>15,.0f} {rej_amt - acc_amt:>+12,.0f}")

            # Employment length distribution
            print(f"\n  Rejected — Employment Length distribution:")
            emp_dist = df_rej["Employment Length"].value_counts().head(12)
            for emp, cnt in emp_dist.items():
                print(f"    {str(emp):15s}: {cnt:>6,} ({cnt/len(df_rej)*100:.1f}%)")

            # ── EDA Chart: Accepted vs Rejected ──
            if chart_dir:
                os.makedirs(chart_dir, exist_ok=True)
                fig, axes = plt.subplots(1, 3, figsize=(20, 6))

                # Credit Score / Risk Score
                axes[0].hist(df["credit_score"].values, bins=50, alpha=0.6, color='#4CAF50',
                             density=True, label=f'Accepted (n={len(df):,})')
                rej_scores = df_rej["risk_score"].dropna()
                axes[0].hist(rej_scores.values, bins=50, alpha=0.6, color='#F44336',
                             density=True, label=f'Rejected (n={len(rej_scores):,})')
                axes[0].set_xlabel('Credit Score / Risk Score')
                axes[0].set_title('Credit Score Distribution', fontsize=13, fontweight='bold')
                axes[0].legend(fontsize=9); axes[0].grid(True, alpha=0.3)

                # DTI
                axes[1].hist(df["dti"].values, bins=50, alpha=0.6, color='#4CAF50',
                             density=True, label='Accepted')
                rej_dti_vals = df_rej["dti_clean"].dropna().clip(0, 100)
                axes[1].hist(rej_dti_vals.values, bins=50, alpha=0.6, color='#F44336',
                             density=True, label='Rejected')
                axes[1].set_xlabel('Debt-to-Income Ratio (%)')
                axes[1].set_title('DTI Distribution', fontsize=13, fontweight='bold')
                axes[1].legend(fontsize=9); axes[1].grid(True, alpha=0.3)

                # Loan Amount (USD)
                axes[2].hist((df["loan_amnt"] / rate).values, bins=50, alpha=0.6, color='#4CAF50',
                             density=True, label='Accepted')
                rej_amt_vals = df_rej["amount"].dropna()
                axes[2].hist(rej_amt_vals.values, bins=50, alpha=0.6, color='#F44336',
                             density=True, label='Rejected')
                axes[2].set_xlabel('Loan Amount (USD)')
                axes[2].set_title('Loan Amount Distribution', fontsize=13, fontweight='bold')
                axes[2].legend(fontsize=9); axes[2].grid(True, alpha=0.3)

                fig.suptitle('Lending Club: Accepted vs Rejected Applications (2007-2018 Q4)',
                             fontsize=15, fontweight='bold')
                fig.tight_layout()
                fig.savefig(os.path.join(chart_dir, '00_accepted_vs_rejected.png'), dpi=200, bbox_inches='tight')
                plt.close(fig)
                print(f"\n  >>> Saved: {chart_dir}/00_accepted_vs_rejected.png")

            del df_rej
            gc.collect()

        except Exception as e:
            print(f"  [WARN] Khong the doc rejected CSV: {e}")

    return df


# ═════════════════════════════════════════════════════════════
#  20 BIEU DO — MEGA CHARTS
# ═════════════════════════════════════════════════════════════
def plot_all_charts(
    y_test, y_prob_xgb, y_prob_rf, y_pred_rf,
    optimal_threshold, scores_test, scores_train, y_train,
    xgb_importances, feature_names, rf_importances,
    cv_aucs, fold_metrics, X_test_scaled, chart_dir,
):
    os.makedirs(chart_dir, exist_ok=True)
    try:
        plt.style.use('seaborn-v0_8-darkgrid')
    except Exception:
        plt.style.use('ggplot')

    print("\n  Dang xuat 20 bieu do...")
    all_probs = {'xgb': y_prob_xgb, 'rf': y_prob_rf, 'hybrid': y_prob_rf}

    # ─── 1. ROC Curve — XGBoost vs Random Forest ───
    print("    [1/20] ROC Curve...")
    fig, ax = plt.subplots(figsize=(10, 8))
    for key in ['xgb', 'rf']:
        fpr, tpr, _ = roc_curve(y_test, all_probs[key])
        auc_val = roc_auc_score(y_test, all_probs[key])
        lw = 3 if key == 'rf' else 1.5
        ax.plot(fpr, tpr, label=f"{MODEL_LABELS[key]} (AUC={auc_val:.4f})",
                linewidth=lw, color=COLORS[key])
    ax.plot([0, 1], [0, 1], 'k:', alpha=0.4, label='Random (0.5)')
    ax.set_xlabel('False Positive Rate', fontsize=13)
    ax.set_ylabel('True Positive Rate', fontsize=13)
    ax.set_title('ROC Curve — XGBoost vs Random Forest', fontsize=15, fontweight='bold')
    ax.legend(fontsize=11, loc='lower right'); ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '01_roc_curve.png'), dpi=200); plt.close(fig)

    # ─── 2. Precision-Recall Curve ───
    print("    [2/20] Precision-Recall Curve...")
    fig, ax = plt.subplots(figsize=(10, 8))
    for key in ['xgb', 'rf']:
        prec_c, rec_c, _ = precision_recall_curve(y_test, all_probs[key])
        ap = average_precision_score(y_test, all_probs[key])
        lw = 3 if key == 'rf' else 1.5
        ax.plot(rec_c, prec_c, label=f"{MODEL_LABELS[key]} (AP={ap:.4f})",
                linewidth=lw, color=COLORS[key])
    ax.axhline(y=y_test.mean(), color='gray', ls=':', alpha=0.5, label=f'Baseline={y_test.mean():.3f}')
    ax.set_xlabel('Recall', fontsize=13); ax.set_ylabel('Precision', fontsize=13)
    ax.set_title('Precision-Recall Curve', fontsize=15, fontweight='bold')
    ax.legend(fontsize=11); ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '02_precision_recall_curve.png'), dpi=200); plt.close(fig)

    # ─── 3. Confusion Matrix ───
    print("    [3/20] Confusion Matrix...")
    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
    cm = confusion_matrix(y_test, y_pred_rf)
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=axes[0],
                xticklabels=["Paid (0)", "Default (1)"], yticklabels=["Paid (0)", "Default (1)"])
    axes[0].set_title('Counts', fontsize=14, fontweight='bold')
    axes[0].set_xlabel('Predicted'); axes[0].set_ylabel('Actual')
    cm_norm = cm.astype(float) / cm.sum(axis=1, keepdims=True)
    sns.heatmap(cm_norm, annot=True, fmt='.2%', cmap='Oranges', ax=axes[1],
                xticklabels=["Paid (0)", "Default (1)"], yticklabels=["Paid (0)", "Default (1)"])
    axes[1].set_title('Normalized', fontsize=14, fontweight='bold')
    axes[1].set_xlabel('Predicted'); axes[1].set_ylabel('Actual')
    fig.suptitle('RF Scorecard — Confusion Matrix', fontsize=16, fontweight='bold', y=1.02)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '03_confusion_matrix.png'), dpi=200, bbox_inches='tight'); plt.close(fig)

    # ─── 4. XGBoost Feature Importance ───
    print("    [4/20] Feature Importance (XGBoost)...")
    fig, ax = plt.subplots(figsize=(12, 9))
    sorted_idx = np.argsort(xgb_importances)
    ax.barh(range(len(sorted_idx)), xgb_importances[sorted_idx], color=COLORS['xgb'], alpha=0.85)
    ax.set_yticks(range(len(sorted_idx)))
    ax.set_yticklabels([feature_names[i] for i in sorted_idx], fontsize=11)
    ax.set_title('XGBoost Feature Importance (Stage 1 — Benchmark)', fontsize=15, fontweight='bold')
    ax.set_xlabel('Importance'); ax.grid(True, alpha=0.3, axis='x')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '04_feature_importance_xgb.png'), dpi=200); plt.close(fig)

    # ─── 5. PD Distribution — XGBoost vs RF ───
    print("    [5/20] PD Distribution...")
    fig, axes = plt.subplots(1, 2, figsize=(18, 7))
    for ax_i, (key, title) in enumerate([('xgb', 'XGBoost Raw PD'), ('rf', 'Random Forest PD')]):
        probs = all_probs[key]
        axes[ax_i].hist(probs[y_test == 0], bins=50, alpha=0.6, label='Paid', color='green', density=True)
        axes[ax_i].hist(probs[y_test == 1], bins=50, alpha=0.6, label='Default', color='red', density=True)
        axes[ax_i].set_title(title, fontsize=14, fontweight='bold')
        axes[ax_i].set_xlabel('PD'); axes[ax_i].legend(fontsize=10); axes[ax_i].grid(True, alpha=0.3)
    fig.suptitle('PD Distribution — Paid vs Default', fontsize=16, fontweight='bold')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '05_pd_distribution.png'), dpi=200); plt.close(fig)

    # ─── 6. Calibration Curve ───
    print("    [6/20] Calibration Curve...")
    fig, ax = plt.subplots(figsize=(10, 8))
    ax.plot([0, 1], [0, 1], 'k--', alpha=0.4, label='Perfect')
    for key in ['xgb', 'rf']:
        frac, mean_p = calibration_curve(y_test, all_probs[key], n_bins=10, strategy='uniform')
        lw = 3 if key == 'rf' else 1.5
        ax.plot(mean_p, frac, 's-', label=MODEL_LABELS[key], linewidth=lw, color=COLORS[key], markersize=6)
    ax.set_xlabel('Mean Predicted Probability', fontsize=13)
    ax.set_ylabel('Fraction of Positives', fontsize=13)
    ax.set_title('Calibration Curve — Du doan co chinh xac?', fontsize=15, fontweight='bold')
    ax.legend(fontsize=11); ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '06_calibration_curve.png'), dpi=200); plt.close(fig)

    # ─── 7. CV AUC per Fold ───
    print("    [7/20] CV AUC per Fold...")
    fig, ax = plt.subplots(figsize=(10, 6))
    fl = [f'Fold {i+1}' for i in range(len(cv_aucs))]
    bars = ax.bar(fl, cv_aucs, color=COLORS['hybrid'], alpha=0.85, edgecolor='black')
    ax.axhline(y=np.mean(cv_aucs), color='red', ls='--', lw=2,
               label=f'Mean={np.mean(cv_aucs):.4f} +/- {np.std(cv_aucs):.4f}')
    for b, v in zip(bars, cv_aucs):
        ax.text(b.get_x() + b.get_width()/2, b.get_height() + 0.001,
                f'{v:.4f}', ha='center', fontweight='bold', fontsize=11)
    ax.set_ylabel('AUC-ROC'); ax.legend(fontsize=12)
    ax.set_title(f'CV AUC — {N_FOLDS}-Fold XGBoost+RF Pipeline', fontsize=15, fontweight='bold')
    ax.set_ylim(min(cv_aucs) - 0.02, max(cv_aucs) + 0.02); ax.grid(True, alpha=0.3, axis='y')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '07_cv_auc_per_fold.png'), dpi=200); plt.close(fig)

    # ─── 8. Threshold Sensitivity ───
    print("    [8/20] Threshold Sensitivity...")
    fig, ax = plt.subplots(figsize=(12, 7))
    thresholds = np.arange(0.05, 0.96, 0.01)
    precs_t, recs_t, f1s_t, accs_t = [], [], [], []
    for t in thresholds:
        yt = (y_prob_rf >= t).astype(int)
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
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '08_threshold_sensitivity.png'), dpi=200); plt.close(fig)

    # ─── 9. Score Distribution by Class ───
    print("    [9/20] Score Distribution by Class...")
    fig, ax = plt.subplots(figsize=(12, 7))
    ax.hist(scores_test[y_test == 0], bins=60, alpha=0.6, label='Paid (Good)', color='#4CAF50', density=True)
    ax.hist(scores_test[y_test == 1], bins=60, alpha=0.6, label='Default (Bad)', color='#F44336', density=True)
    ax.axvline(x=BASE_SCORE, color='blue', ls='--', lw=2, label=f'Base Score={BASE_SCORE}')
    mean_paid = scores_test[y_test == 0].mean()
    mean_def = scores_test[y_test == 1].mean()
    ax.axvline(x=mean_paid, color='green', ls=':', lw=2, label=f'Mean Paid={mean_paid:.0f}')
    ax.axvline(x=mean_def, color='red', ls=':', lw=2, label=f'Mean Default={mean_def:.0f}')
    ax.set_xlabel('Credit Score', fontsize=13); ax.set_ylabel('Density', fontsize=13)
    ax.set_title('Credit Score Distribution — Paid vs Default', fontsize=15, fontweight='bold')
    ax.legend(fontsize=10); ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '09_score_distribution.png'), dpi=200); plt.close(fig)

    # ─── 10. Model Comparison (XGB vs RF) ───
    print("    [10/20] Model Comparison...")
    fig, ax = plt.subplots(figsize=(12, 7))
    mk = ['xgb', 'rf']
    mn = [MODEL_LABELS[k] for k in mk]
    met_names = ['AUC', 'Accuracy', 'Precision', 'Recall', 'F1']
    x_pos = np.arange(len(mn))
    width = 0.15
    for mi, mname in enumerate(met_names):
        vals = []
        for k in mk:
            pr = all_probs[k]; pd_i = (pr >= optimal_threshold).astype(int)
            if mname == 'AUC':       vals.append(roc_auc_score(y_test, pr))
            elif mname == 'Accuracy':  vals.append(accuracy_score(y_test, pd_i))
            elif mname == 'Precision': vals.append(precision_score(y_test, pd_i, zero_division=0))
            elif mname == 'Recall':    vals.append(recall_score(y_test, pd_i, zero_division=0))
            elif mname == 'F1':        vals.append(f1_score(y_test, pd_i, zero_division=0))
        offset = (mi - 2) * width
        bars = ax.bar(x_pos + offset, vals, width, label=mname, alpha=0.85)
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width()/2, b.get_height() + 0.005,
                    f'{v:.3f}', ha='center', fontsize=9, fontweight='bold')
    ax.set_xticks(x_pos); ax.set_xticklabels(mn, fontsize=12)
    ax.set_ylabel('Score'); ax.legend(fontsize=9)
    ax.set_title('XGBoost vs Random Forest — 5 Metrics', fontsize=15, fontweight='bold')
    ax.set_ylim(0, 1.12); ax.grid(True, alpha=0.3, axis='y')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '10_model_comparison.png'), dpi=200); plt.close(fig)

    # ─── 11. Cumulative Gain + Lift ───
    print("    [11/20] Cumulative Gain & Lift...")
    fig, axes = plt.subplots(1, 2, figsize=(18, 7))
    si = np.argsort(-y_prob_rf); sl = y_test[si]
    cd = np.cumsum(sl); td = y_test.sum()
    pp = np.arange(1, len(y_test) + 1) / len(y_test); pdc = cd / td
    axes[0].plot(pp, pdc, color=COLORS['hybrid'], lw=2.5, label='RF Scorecard')
    axes[0].plot([0, 1], [0, 1], 'k--', alpha=0.4, label='Random')
    axes[0].fill_between(pp, pdc, pp, alpha=0.12, color=COLORS['hybrid'])
    axes[0].set_xlabel('% Population'); axes[0].set_ylabel('% Defaults Captured')
    axes[0].set_title('Cumulative Gain', fontsize=14, fontweight='bold')
    axes[0].legend(); axes[0].grid(True, alpha=0.3)
    lift = pdc / pp
    axes[1].plot(pp, lift, color=COLORS['hybrid'], lw=2.5, label='RF Scorecard')
    axes[1].axhline(y=1, color='k', ls='--', alpha=0.4, label='Random')
    axes[1].set_xlabel('% Population'); axes[1].set_ylabel('Lift')
    axes[1].set_title('Lift Curve', fontsize=14, fontweight='bold')
    axes[1].legend(); axes[1].grid(True, alpha=0.3)
    fig.suptitle('Gain & Lift — RF Scorecard', fontsize=16, fontweight='bold')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '11_gain_lift_curve.png'), dpi=200); plt.close(fig)

    # ─── 12. KS Statistic ───
    print("    [12/20] KS Statistic...")
    fig, ax = plt.subplots(figsize=(10, 7))
    fpr_ks, tpr_ks, th_ks = roc_curve(y_test, y_prob_rf)
    ks = np.max(tpr_ks - fpr_ks); ki = np.argmax(tpr_ks - fpr_ks)
    ax.plot(th_ks, tpr_ks, label='TPR', color='green', lw=2)
    ax.plot(th_ks, fpr_ks, label='FPR', color='red', lw=2)
    ax.fill_between(th_ks, tpr_ks, fpr_ks, alpha=0.12, color='blue')
    ax.axvline(x=th_ks[ki], color='blue', ls=':', lw=2, label=f'KS={ks:.4f} @ {th_ks[ki]:.3f}')
    ax.set_xlabel('Threshold'); ax.set_ylabel('Rate')
    ax.set_title('KS Statistic — Phan biet Default vs Paid', fontsize=15, fontweight='bold')
    ax.legend(); ax.set_xlim(0, 1); ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '12_ks_statistic.png'), dpi=200); plt.close(fig)

    # ─── 13. Architecture Diagram ───
    print("    [13/20] Architecture Diagram...")
    fig, ax = plt.subplots(figsize=(16, 14))
    ax.set_xlim(0, 12); ax.set_ylim(0, 14); ax.axis('off')
    ax.text(6, 13.5, 'XGBoost + Random Forest SCORECARD', fontsize=22, fontweight='bold',
            ha='center', color=COLORS['hybrid'])
    ax.text(6, 12.9, '14 Features — Lending Club (accepted + rejected EDA)',
            fontsize=12, ha='center', color='gray', style='italic')
    bd = dict(boxstyle="round,pad=0.5", alpha=0.3, linewidth=2)
    # Input
    ax.text(6, 12.0, '14 Features\n9 NUMERIC (scaled) + 5 CATEGORICAL (passthrough)\n'
            'credit_score, loan_amnt, int_rate, annual_inc, dti,\n'
            'revol_util, open_acc, pub_rec, loan_to_income,\n'
            'term, home_ownership, verification, purpose, emp_length',
            fontsize=10, ha='center', bbox=dict(**bd, facecolor='#E1F5FE', edgecolor='#0277BD'))
    ax.annotate('', xy=(6, 10.2), xytext=(6, 11.0), arrowprops=dict(arrowstyle='->', color='gray', lw=2))
    # Stage 1
    ax.text(6, 9.6, 'STAGE 1: XGBoost (Benchmark)\nn_estimators=600, max_depth=5, GPU\n"AUC benchmark + Feature Importance"',
            fontsize=12, ha='center', bbox=dict(**bd, facecolor=COLORS['xgb'], edgecolor=COLORS['xgb']))
    ax.annotate('', xy=(3, 8.9), xytext=(6, 8.9), arrowprops=dict(arrowstyle='->', color='gray', lw=1.5))
    ax.text(1.5, 8.9, 'AUC benchmark\n(reference only)', fontsize=10, ha='center', color='gray', style='italic')
    # Stage 2
    ax.annotate('', xy=(6, 7.5), xytext=(6, 8.2), arrowprops=dict(arrowstyle='->', color=COLORS['rf'], lw=2))
    ax.text(6, 6.9, 'STAGE 2: Random Forest Classifier\nn_estimators=500, max_depth=15\n"MAIN MODEL — 14 features"',
            fontsize=12, ha='center', bbox=dict(**bd, facecolor=COLORS['rf'], edgecolor=COLORS['rf']))
    ax.annotate('', xy=(6, 5.3), xytext=(6, 6.2), arrowprops=dict(arrowstyle='->', color='gray', lw=2))
    # PD output
    ax.text(6, 4.7, 'PD (Probability of Default)\n0.0 = an toan | 1.0 = rui ro cao',
            fontsize=12, ha='center', color='#D32F2F', fontweight='bold')
    ax.annotate('', xy=(6, 3.5), xytext=(6, 4.2), arrowprops=dict(arrowstyle='->', color='gray', lw=2))
    # Stage 3
    ax.text(6, 2.9, 'STAGE 3: Scorecard Formula\nScore = Offset - Factor × ln(Odds)\nOdds = PD / (1 - PD)',
            fontsize=12, ha='center', bbox=dict(**bd, facecolor='#E8F5E9', edgecolor='#388E3C'))
    ax.annotate('', xy=(6, 1.3), xytext=(6, 2.2), arrowprops=dict(arrowstyle='->', color=COLORS['hybrid'], lw=3))
    # Output
    ax.text(6, 0.7, 'OUTPUT: ai_risk_score (0-100)\n+ PD (0.0-1.0) + default_probability',
            fontsize=14, ha='center', fontweight='bold',
            bbox=dict(boxstyle="round,pad=0.5", facecolor='#FCE4EC', alpha=0.9,
                      edgecolor=COLORS['hybrid'], linewidth=3))
    fig.savefig(os.path.join(chart_dir, '13_architecture.png'), dpi=200, bbox_inches='tight', facecolor='white')
    plt.close(fig)

    # ─── 14. CV Fold Metrics Heatmap ───
    print("    [14/20] CV Fold Metrics Heatmap...")
    if fold_metrics:
        fig, ax = plt.subplots(figsize=(14, 6))
        mkeys = list(fold_metrics[0].keys())
        fd = np.array([[fm[m] for m in mkeys] for fm in fold_metrics])
        dfh = pd.DataFrame(fd, columns=mkeys, index=[f'Fold {i+1}' for i in range(len(fold_metrics))])
        dfh.loc['Mean'] = dfh.mean(); dfh.loc['Std'] = dfh.iloc[:-1].std()
        sns.heatmap(dfh, annot=True, fmt='.4f', cmap='YlOrRd', ax=ax, linewidths=0.5)
        ax.set_title('CV Metrics — Per Fold Heatmap', fontsize=15, fontweight='bold')
        fig.tight_layout()
        fig.savefig(os.path.join(chart_dir, '14_cv_fold_heatmap.png'), dpi=200); plt.close(fig)

    # ─── 15. Risk Band by Score Range ───
    print("    [15/20] Risk Band by Score...")
    fig, ax = plt.subplots(figsize=(13, 7))
    bins_s = [150, 400, 500, 600, 700, 950]
    labels_s = ['150-400\nRat cao', '400-500\nCao', '500-600\nTrung binh', '600-700\nThap', '700-950\nRat thap']
    rb = pd.cut(scores_test, bins=bins_s, labels=labels_s, include_lowest=True)
    rdf = pd.DataFrame({'band': rb, 'default': y_test})
    bs = rdf.groupby('band', observed=False).agg(n=('default', 'count'), d=('default', 'sum'), dr=('default', 'mean')).reset_index()
    bc = ['#F44336', '#FF9800', '#FFC107', '#8BC34A', '#4CAF50']
    ax.bar(range(len(bs)), bs['n'], color=bc, alpha=0.7, edgecolor='black', label='Total')
    ax.bar(range(len(bs)), bs['d'], color='red', alpha=0.4, edgecolor='darkred', label='Defaults')
    ax2 = ax.twinx()
    ax2.plot(range(len(bs)), bs['dr'] * 100, 'ko-', lw=2.5, ms=10, label='Default Rate %')
    for i, (n, d, dr) in enumerate(zip(bs['n'], bs['d'], bs['dr'])):
        ax.text(i, n + 20, f'n={n}', ha='center', fontsize=10, fontweight='bold')
        ax2.text(i, dr * 100 + 1.5, f'{dr*100:.1f}%', ha='center', fontsize=10, fontweight='bold', color='red')
    ax.set_xticks(range(len(bs))); ax.set_xticklabels(bs['band'], fontsize=11)
    ax.set_xlabel('Score Band (Risk Level)'); ax.set_ylabel('Count')
    ax2.set_ylabel('Default Rate (%)', color='red')
    ax.set_title('Risk Band by Credit Score', fontsize=15, fontweight='bold')
    h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels()
    ax.legend(h1 + h2, l1 + l2, fontsize=10, loc='upper right')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '15_risk_band_score.png'), dpi=200); plt.close(fig)

    # ─── 16. Feature Correlation Heatmap ───
    print("    [16/20] Feature Correlation Heatmap...")
    fig, ax = plt.subplots(figsize=(16, 13))
    feat_df = pd.DataFrame(X_test_scaled, columns=feature_names)
    corr = feat_df.corr()
    mask = np.triu(np.ones_like(corr, dtype=bool))
    sns.heatmap(corr, mask=mask, annot=True, fmt='.2f', cmap='RdBu_r', ax=ax,
                vmin=-1, vmax=1, linewidths=0.5, square=True)
    ax.set_title(f'Feature Correlation Heatmap ({len(feature_names)} features)', fontsize=15, fontweight='bold')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '16_feature_correlation.png'), dpi=200); plt.close(fig)

    # ─── 17. RF Feature Importance (Gini) ───
    print("    [17/20] RF Feature Importance...")
    fig, ax = plt.subplots(figsize=(14, 10))
    importances = rf_importances
    sorted_idx = np.argsort(importances)
    colors_bar = ['#4CAF50' if feature_names[i] in NUMERIC_FEATURES else '#FF9800'
                  for i in sorted_idx]
    ax.barh(range(len(sorted_idx)), importances[sorted_idx], color=colors_bar, alpha=0.85)
    ax.set_yticks(range(len(sorted_idx)))
    ax.set_yticklabels([feature_names[i] for i in sorted_idx], fontsize=11)
    ax.axvline(x=0, color='black', lw=1)
    ax.set_xlabel('Gini Importance (higher = model depends more)', fontsize=12)
    ax.set_title('Random Forest — Feature Importance (Gini)\nGreen=Numeric | Orange=Categorical',
                 fontsize=15, fontweight='bold')
    ax.grid(True, alpha=0.3, axis='x')
    green_p = mpatches.Patch(color='#4CAF50', label='Numeric')
    orange_p = mpatches.Patch(color='#FF9800', label='Categorical')
    ax.legend(handles=[green_p, orange_p], fontsize=11, loc='lower right')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '17_rf_feature_importance.png'), dpi=200); plt.close(fig)

    # ─── 18. Score vs Default Rate (Scorecard Validation) ───
    print("    [18/20] Score vs Default Rate...")
    fig, ax = plt.subplots(figsize=(12, 7))
    score_edges = np.arange(200, 900, 25)
    score_mids, def_rates, counts = [], [], []
    for i in range(len(score_edges) - 1):
        mask = (scores_test >= score_edges[i]) & (scores_test < score_edges[i+1])
        if mask.sum() > 0:
            score_mids.append((score_edges[i] + score_edges[i+1]) / 2)
            def_rates.append(y_test[mask].mean())
            counts.append(mask.sum())
    ax.bar(score_mids, [c/max(counts)*0.5 for c in counts], width=20, alpha=0.3, color='gray', label='Volume (scaled)')
    ax2 = ax.twinx()
    ax2.plot(score_mids, [d*100 for d in def_rates], 'ro-', lw=2.5, ms=8, label='Default Rate %')
    th_scores = np.linspace(250, 850, 100)
    th_pd = score_to_pd(th_scores)
    ax2.plot(th_scores, th_pd * 100, 'b--', lw=1.5, alpha=0.6, label='Theoretical (formula)')
    ax.set_xlabel('Credit Score', fontsize=13); ax.set_ylabel('Relative Volume')
    ax2.set_ylabel('Default Rate (%)', color='red', fontsize=13)
    ax.set_title('Credit Score vs Default Rate — Scorecard Validation', fontsize=15, fontweight='bold')
    h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels()
    ax2.legend(h1 + h2, l1 + l2, fontsize=10); ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '18_score_vs_default_rate.png'), dpi=200); plt.close(fig)

    # ─── 19. Error Analysis — FP vs FN ───
    print("    [19/20] Error Analysis...")
    fig, axes = plt.subplots(1, 2, figsize=(16, 7))
    fp_mask = (y_pred_rf == 1) & (y_test == 0)
    fn_mask = (y_pred_rf == 0) & (y_test == 1)
    tp_mask = (y_pred_rf == 1) & (y_test == 1)
    tn_mask = (y_pred_rf == 0) & (y_test == 0)
    groups = [('TN', scores_test[tn_mask], '#4CAF50'), ('FP', scores_test[fp_mask], '#FF9800'),
              ('FN', scores_test[fn_mask], '#F44336'), ('TP', scores_test[tp_mask], '#2196F3')]
    for name, sc, c in groups:
        if len(sc) > 0:
            axes[0].hist(sc, bins=30, alpha=0.5, label=f'{name} (n={len(sc)})', color=c, density=True)
    axes[0].set_xlabel('Credit Score'); axes[0].set_ylabel('Density')
    axes[0].set_title('Score Distribution by Outcome', fontsize=13, fontweight='bold')
    axes[0].legend(fontsize=9)
    cnts = [tn_mask.sum(), fp_mask.sum(), fn_mask.sum(), tp_mask.sum()]
    axes[1].pie(cnts, labels=['TN', 'FP', 'FN', 'TP'],
                colors=['#4CAF50', '#FF9800', '#F44336', '#2196F3'], autopct='%1.1f%%',
                startangle=90, textprops={'fontsize': 12, 'fontweight': 'bold'})
    axes[1].set_title('Prediction Outcome', fontsize=13, fontweight='bold')
    fig.suptitle('Error Analysis', fontsize=16, fontweight='bold')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '19_error_analysis.png'), dpi=200); plt.close(fig)

    # ─── 20. Summary Dashboard ───
    print("    [20/20] Summary Dashboard...")
    fig = plt.figure(figsize=(20, 14))
    gs = fig.add_gridspec(3, 3, hspace=0.35, wspace=0.3)
    # Mini ROC
    ax1 = fig.add_subplot(gs[0, 0])
    for k in ['xgb', 'rf']:
        fpr_m, tpr_m, _ = roc_curve(y_test, all_probs[k])
        ax1.plot(fpr_m, tpr_m, color=COLORS[k], lw=2 if k == 'rf' else 1,
                 label=f'{MODEL_LABELS[k]} ({roc_auc_score(y_test, all_probs[k]):.3f})')
    ax1.plot([0, 1], [0, 1], 'k:', alpha=0.3); ax1.legend(fontsize=8); ax1.set_title('ROC', fontweight='bold')
    # Mini CM
    ax2 = fig.add_subplot(gs[0, 1])
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=ax2, xticklabels=['P', 'D'], yticklabels=['P', 'D'])
    ax2.set_title('Confusion Matrix', fontweight='bold')
    # Score Dist
    ax3 = fig.add_subplot(gs[0, 2])
    ax3.hist(scores_test[y_test == 0], bins=40, alpha=0.6, color='green', density=True, label='Paid')
    ax3.hist(scores_test[y_test == 1], bins=40, alpha=0.6, color='red', density=True, label='Default')
    ax3.legend(fontsize=8); ax3.set_title('Score Distribution', fontweight='bold')
    # Metrics table
    ax4 = fig.add_subplot(gs[1, :])
    ax4.axis('off')
    metrics_table = [['Metric', 'XGBoost (benchmark)', 'Random Forest']]
    for met_name in ['AUC', 'Accuracy', 'Precision', 'Recall', 'F1']:
        row = [met_name]
        for k in ['xgb', 'rf']:
            pr = all_probs[k]; pd_i = (pr >= optimal_threshold).astype(int)
            if met_name == 'AUC':       row.append(f'{roc_auc_score(y_test, pr):.4f}')
            elif met_name == 'Accuracy': row.append(f'{accuracy_score(y_test, pd_i):.4f}')
            elif met_name == 'Precision': row.append(f'{precision_score(y_test, pd_i, zero_division=0):.4f}')
            elif met_name == 'Recall':    row.append(f'{recall_score(y_test, pd_i, zero_division=0):.4f}')
            elif met_name == 'F1':        row.append(f'{f1_score(y_test, pd_i, zero_division=0):.4f}')
        metrics_table.append(row)
    table = ax4.table(cellText=metrics_table[1:], colLabels=metrics_table[0], cellLoc='center', loc='center')
    table.auto_set_font_size(False); table.set_fontsize(11); table.scale(1.0, 2.0)
    for j in range(3): table[0, j].set_facecolor('#E0E0E0'); table[0, j].set_text_props(fontweight='bold')
    ax4.set_title('Performance Comparison', fontsize=14, fontweight='bold', pad=10)
    # Mini Gain
    ax5 = fig.add_subplot(gs[2, 0])
    ax5.plot(pp, pdc, color=COLORS['hybrid'], lw=2)
    ax5.plot([0, 1], [0, 1], 'k--', alpha=0.3)
    ax5.set_title('Cumulative Gain', fontweight='bold'); ax5.grid(True, alpha=0.2)
    # Mini Calibration
    ax6 = fig.add_subplot(gs[2, 1])
    ax6.plot([0, 1], [0, 1], 'k--', alpha=0.3)
    for k in ['xgb', 'rf']:
        frac_m, mean_m = calibration_curve(y_test, all_probs[k], n_bins=8)
        ax6.plot(mean_m, frac_m, 's-', color=COLORS[k], lw=2 if k == 'rf' else 1, label=MODEL_LABELS[k], ms=4)
    ax6.legend(fontsize=8); ax6.set_title('Calibration', fontweight='bold')
    # Mini Risk bands
    ax7 = fig.add_subplot(gs[2, 2])
    ax7.bar(range(len(bs)), bs['dr'] * 100, color=bc, alpha=0.8, edgecolor='black')
    ax7.set_xticks(range(len(bs))); ax7.set_xticklabels(['V.High', 'High', 'Med', 'Low', 'V.Low'], fontsize=8)
    ax7.set_ylabel('Default Rate %'); ax7.set_title('Risk by Score Band', fontweight='bold')
    fig.suptitle('XGBoost + RF SCORECARD — SUMMARY DASHBOARD', fontsize=18, fontweight='bold', y=1.01)
    fig.savefig(os.path.join(chart_dir, '20_summary_dashboard.png'), dpi=200, bbox_inches='tight')
    plt.close(fig)

    print(f"\n  >>> Da xuat 20 bieu do tai: {chart_dir}/")


# ═════════════════════════════════════════════════════════════
#  MAIN TRAINING PIPELINE
# ═════════════════════════════════════════════════════════════
def train_model():
    t_start = time.time()
    print("=" * 70)
    print("  AIScore — XGBoost (benchmark) + Random Forest SCORECARD")
    print("  Data: Lending Club accepted + rejected (2007-2018 Q4)")
    print("  Stage 1: XGBoost → AUC benchmark + Feature Importance")
    print("  Stage 2: Random Forest on 14 features (9 NUM + 5 CAT) → PD")
    print("  Stage 3: Score = Offset - Factor × ln(Odds)")
    print("=" * 70)

    # ── 1. Load data ──
    print("\n[1/8] Loading data...")
    if not os.path.exists(ACCEPTED_CSV):
        raise FileNotFoundError(f"Khong tim thay accepted CSV: {ACCEPTED_CSV}")

    rejected_path = REJECTED_CSV if os.path.exists(REJECTED_CSV) else None
    df = load_and_clean_data(ACCEPTED_CSV, rejected_path=rejected_path, chart_dir=CHART_DIR)
    print(f"\n  Training dataset: {len(df):,} samples | Default rate: {df['is_default'].mean():.2%}")

    # ── 2. Split ──
    print("\n[2/8] Train/Test split...")
    X = df[FEATURE_NAMES].values
    y = df["is_default"].values
    del df
    gc.collect()
    X_train_raw, X_test_raw, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )
    print(f"  Train: {len(y_train):,} | Test: {len(y_test):,}")

    # ── 3. Smart Per-feature scaling ──
    print(f"\n[3/8] Smart Per-Feature Scaling ({len(NUMERIC_FEATURES)} numeric + {len(CATEGORICAL_FEATURES)} categorical)...")
    scalers, X_train = create_per_feature_scalers(X_train_raw, FEATURE_NAMES)
    X_test = apply_per_feature_scalers(X_test_raw, scalers, FEATURE_NAMES)

    print(f"\n    {'Feature':30s} {'Type':10s} {'Strategy':15s} {'Scaler Info'}")
    print(f"    {'─'*30} {'─'*10} {'─'*15} {'─'*35}")
    for fn in FEATURE_NAMES:
        ftype = "NUMERIC" if fn in NUMERIC_FEATURES else "CATEGORY"
        strategy, sc = scalers[fn]
        if strategy == "passthrough":
            info = "(no transform)"
        elif strategy == "minmax":
            info = f"range=[{sc.data_min_[0]:.1f}, {sc.data_max_[0]:.1f}]"
        elif strategy in ("log_standard", "standard"):
            info = f"mean={sc.mean_[0]:.4f}, std={sc.scale_[0]:.4f}"
        elif strategy in ("log_robust", "robust"):
            info = f"center={sc.center_[0]:.4f}, scale={sc.scale_[0]:.4f}"
        else:
            info = ""
        print(f"    {fn:30s} {ftype:10s} {strategy:15s} {info}")

    n_pos = y_train.sum(); n_neg = len(y_train) - n_pos
    scale_pos_wt = n_neg / n_pos
    print(f"\n  Class: neg={n_neg:,}, pos={n_pos:,}, scale_pos_weight={scale_pos_wt:.2f}")

    del X_train_raw, X_test_raw
    gc.collect()

    # ══════════════════════════════════════════════
    # STAGE 1: XGBoost — Benchmark + Feature Importance
    # ══════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  STAGE 1: XGBoost — Benchmark + Feature Importance")
    print("=" * 70)

    print("\n[4/8] Training XGBoost (T4 GPU) — benchmark only...")
    xgb_model = xgb.XGBClassifier(
        n_estimators=600, max_depth=5, learning_rate=0.01,
        subsample=0.8, colsample_bytree=0.8, min_child_weight=10,
        gamma=0.3, reg_alpha=1.0, reg_lambda=3.0, max_bin=1024,
        scale_pos_weight=scale_pos_wt, random_state=RANDOM_STATE,
        eval_metric="auc", early_stopping_rounds=80,
        tree_method="hist", device="cuda",
    )
    xgb_model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
    n_trees = xgb_model.best_iteration + 1
    xgb_proba_test = xgb_model.predict_proba(X_test)[:, 1]
    xgb_auc = roc_auc_score(y_test, xgb_proba_test)
    print(f"  XGBoost benchmark: {n_trees} trees, Test AUC={xgb_auc:.4f}")

    gc.collect()

    # ══════════════════════════════════════════════
    # STAGE 2: Random Forest — Main Classifier
    # ══════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  STAGE 2: Random Forest — Main Classifier")
    print(f"  Input: {len(FEATURE_NAMES)} features ({len(NUMERIC_FEATURES)} numeric + {len(CATEGORICAL_FEATURES)} categorical)")
    print("=" * 70)

    print(f"\n[5/8] Training Random Forest...")
    rf_model = RandomForestClassifier(
        n_estimators=500, max_depth=15, min_samples_split=20,
        min_samples_leaf=10, max_features='sqrt',
        class_weight='balanced', random_state=RANDOM_STATE,
        n_jobs=-1, oob_score=True,
    )
    rf_model.fit(X_train, y_train)
    rf_proba_test = rf_model.predict_proba(X_test)[:, 1]
    rf_auc = roc_auc_score(y_test, rf_proba_test)
    scores_train = pd_to_score(rf_model.predict_proba(X_train)[:, 1])
    print(f"  Random Forest: Test AUC={rf_auc:.4f}, OOB={rf_model.oob_score_:.4f}")
    print(f"  AUC comparison: XGBoost={xgb_auc:.4f} vs RF={rf_auc:.4f} (delta={rf_auc - xgb_auc:+.4f})")

    # RF Feature Importance (Gini)
    rf_importances = rf_model.feature_importances_
    print(f"\n  RF Feature Importance (Gini):")
    print(f"  ──────────────────────────────────────────────────")
    sorted_imp_idx = np.argsort(rf_importances)[::-1]
    for idx in sorted_imp_idx:
        fn = FEATURE_NAMES[idx]
        ftype = "NUM" if fn in NUMERIC_FEATURES else "CAT"
        print(f"    [{ftype:3s}] {fn:30s} importance={rf_importances[idx]:.4f}")

    # ══════════════════════════════════════════════
    # STAGE 3: Scorecard — PD → Credit Score
    # ══════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  STAGE 3: Scorecard Formula — PD → Credit Score")
    print(f"  Score = {OFFSET:.2f} - {FACTOR:.3f} × ln(PD / (1-PD))")
    print("=" * 70)

    scores_test = pd_to_score(rf_proba_test)
    print(f"\n  Score Statistics (Test Set):")
    print(f"    Mean:   {scores_test.mean():.1f}")
    print(f"    Median: {np.median(scores_test):.1f}")
    print(f"    Min:    {scores_test.min():.1f}")
    print(f"    Max:    {scores_test.max():.1f}")
    print(f"    Std:    {scores_test.std():.1f}")
    print(f"    Paid mean:    {scores_test[y_test == 0].mean():.1f}")
    print(f"    Default mean: {scores_test[y_test == 1].mean():.1f}")

    # ── 6. Evaluate ──
    print("\n" + "=" * 70)
    print("  [6/8] DANH GIA MODEL")
    print("=" * 70)

    y_prob_final = rf_proba_test
    fpr_arr, tpr_arr, thresholds_arr = roc_curve(y_test, y_prob_final)
    j_scores = tpr_arr - fpr_arr
    optimal_threshold = float(thresholds_arr[np.argmax(j_scores)])
    y_pred = (y_prob_final >= optimal_threshold).astype(int)

    auc_val = roc_auc_score(y_test, y_prob_final)
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred)
    rec = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)
    brier = brier_score_loss(y_test, y_prob_final)
    logloss = log_loss(y_test, y_prob_final)
    mcc = matthews_corrcoef(y_test, y_pred)
    bal_acc = balanced_accuracy_score(y_test, y_pred)
    kappa = cohen_kappa_score(y_test, y_pred)
    ks_stat = float(np.max(j_scores))

    print(f"\n  {'='*55}")
    print(f"  XGBoost + RANDOM FOREST SCORECARD RESULTS")
    print(f"  {'='*55}")
    print(f"  Features:                        {len(FEATURE_NAMES)} ({len(NUMERIC_FEATURES)} NUM + {len(CATEGORICAL_FEATURES)} CAT)")
    print(f"  Optimal Threshold (Youden's J):  {optimal_threshold:.4f}")
    print(f"  XGBoost benchmark AUC:           {xgb_auc:.4f}")
    print(f"  Random Forest AUC:               {auc_val:.4f}")
    print(f"  RF OOB Score:                    {rf_model.oob_score_:.4f}")
    print(f"  Accuracy:                        {acc:.4f}")
    print(f"  Balanced Accuracy:               {bal_acc:.4f}")
    print(f"  Precision:                       {prec:.4f}")
    print(f"  Recall (Sensitivity):            {rec:.4f}")
    print(f"  F1 Score:                        {f1:.4f}")
    print(f"  Brier Score:                     {brier:.4f}")
    print(f"  Log Loss:                        {logloss:.4f}")
    print(f"  MCC:                             {mcc:.4f}")
    print(f"  Cohen's Kappa:                   {kappa:.4f}")
    print(f"  KS Statistic:                    {ks_stat:.4f}")
    print(f"  {'='*55}")

    print(f"\n  Classification Report:")
    print(classification_report(y_test, y_pred, target_names=["Paid (0)", "Default (1)"]))

    # ── CV ──
    print("\n  Cross-Validation — 5-Fold Random Forest Pipeline...")
    cv_outer = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=RANDOM_STATE + 100)
    cv_aucs = []
    fold_metrics_list = []

    for of, (otr, oval) in enumerate(cv_outer.split(X, y)):
        X_cv_tr_raw, X_cv_val_raw = X[otr], X[oval]
        y_cv_tr, y_cv_val = y[otr], y[oval]

        cv_sc, X_cv_tr = create_per_feature_scalers(X_cv_tr_raw, FEATURE_NAMES)
        X_cv_val = apply_per_feature_scalers(X_cv_val_raw, cv_sc, FEATURE_NAMES)

        cv_rf = RandomForestClassifier(
            n_estimators=300, max_depth=15, min_samples_split=20,
            min_samples_leaf=10, max_features='sqrt',
            class_weight='balanced', random_state=RANDOM_STATE, n_jobs=-1,
        )
        cv_rf.fit(X_cv_tr, y_cv_tr)
        cv_prob = cv_rf.predict_proba(X_cv_val)[:, 1]

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
    print(f"\n  >>> CV AUC: {cv_mean:.4f} +/- {cv_std:.4f}")

    # ── 7. Save artifacts ──
    print("\n[7/8] Saving artifacts...")
    os.makedirs(MODEL_DIR, exist_ok=True)

    xgb_model.save_model(os.path.join(MODEL_DIR, "xgb_benchmark_model.json"))
    joblib.dump(rf_model, os.path.join(MODEL_DIR, "rf_scorecard_model.joblib"))
    joblib.dump(scalers, os.path.join(MODEL_DIR, "per_feature_scalers.joblib"))

    metadata = {
        "model_type": "xgboost_rf_scorecard",
        "version": "7.0",
        "architecture": f"XGBoost(benchmark) + RF({len(FEATURE_NAMES)}feat: {len(NUMERIC_FEATURES)}NUM+{len(CATEGORICAL_FEATURES)}CAT) -> Scorecard",
        "data_source": {
            "accepted": "accepted_2007_to_2018Q4.csv (Lending Club)",
            "rejected": "rejected_2007_to_2018Q4.csv (EDA only)",
        },
        "scorecard": {
            "base_score": BASE_SCORE,
            "pdo": PDO,
            "base_odds": BASE_ODDS,
            "factor": round(FACTOR, 4),
            "offset": round(OFFSET, 4),
        },
        "feature_names": FEATURE_NAMES,
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "n_features": len(FEATURE_NAMES),
        "n_numeric": len(NUMERIC_FEATURES),
        "n_categorical": len(CATEGORICAL_FEATURES),
        "encoding_maps": {
            "home_ownership": HOME_MAP,
            "verification_status": VERIFICATION_MAP,
            "purpose": PURPOSE_MAP,
            "emp_length": EMP_LENGTH_MAP,
        },
        "n_trees_xgb": n_trees,
        "n_trees_rf": rf_model.n_estimators,
        "rf_max_depth": 15,
        "rf_oob_score": round(rf_model.oob_score_, 4),
        "optimal_threshold": optimal_threshold,
        "test_metrics": {
            "xgb_benchmark_auc": round(xgb_auc, 4),
            "rf_auc": round(auc_val, 4),
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
        "rf_feature_importances": {fn: round(float(rf_importances[i]), 6) for i, fn in enumerate(FEATURE_NAMES)},
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

    print(f"\n  Models saved to: {MODEL_DIR}")
    for fn in sorted(os.listdir(MODEL_DIR)):
        sz = os.path.getsize(os.path.join(MODEL_DIR, fn)) / 1024
        print(f"    {fn} ({sz:.0f} KB)")

    # ── 8. Charts ──
    print("\n" + "=" * 70)
    print("  [8/8] XUAT 20 BIEU DO DANH GIA")
    print("=" * 70)
    plot_all_charts(
        y_test=y_test,
        y_prob_xgb=xgb_proba_test,
        y_prob_rf=rf_proba_test,
        y_pred_rf=y_pred,
        optimal_threshold=optimal_threshold,
        scores_test=scores_test,
        scores_train=scores_train,
        y_train=y_train,
        xgb_importances=xgb_model.feature_importances_,
        feature_names=FEATURE_NAMES,
        rf_importances=rf_importances,
        cv_aucs=cv_aucs,
        fold_metrics=fold_metrics_list,
        X_test_scaled=X_test,
        chart_dir=CHART_DIR,
    )

    elapsed = time.time() - t_start
    print("\n" + "=" * 70)
    print(f"  >>> TRAINING COMPLETE — {elapsed/60:.1f} min ({elapsed:.0f}s)")
    print(f"  Architecture: XGBoost ({n_trees} trees, benchmark) + Random Forest Scorecard")
    print(f"  Data: Lending Club accepted (labeled) + rejected (EDA)")
    print(f"  Features: {len(NUMERIC_FEATURES)} numeric + {len(CATEGORICAL_FEATURES)} categorical = {len(FEATURE_NAMES)}")
    print(f"  Scorecard: Base={BASE_SCORE}, PDO={PDO}")
    print(f"  Score Range: {scores_test.min():.0f} — {scores_test.max():.0f}")
    print(f"  Models: {MODEL_DIR}")
    print(f"  Charts: {CHART_DIR}")
    print("=" * 70)

    return {
        'models': (xgb_model, rf_model),
        'scalers': scalers,
        'metadata': metadata,
    }


# ═════════════════════════════════════════════════════════════
#  SCORER — Inference (dung sau khi train xong)
# ═════════════════════════════════════════════════════════════
class CreditScorer:
    """
    XGBoost (benchmark) + Random Forest Scorecard scorer.
    Load models tu MODEL_DIR, predict PD + Credit Score tu VND features.
    """
    def __init__(self, model_dir=MODEL_DIR):
        self.model_dir = model_dir
        self.xgb_model = xgb.XGBClassifier()
        self.xgb_model.load_model(os.path.join(model_dir, "xgb_benchmark_model.json"))
        self.rf_model = joblib.load(os.path.join(model_dir, "rf_scorecard_model.joblib"))
        self.scalers = joblib.load(os.path.join(model_dir, "per_feature_scalers.joblib"))
        with open(os.path.join(model_dir, "metadata.json"), "r") as f:
            self.metadata = json.load(f)

    def predict(self, features: dict) -> dict:
        f = self._process(features)
        X_raw = np.array([[f[n] for n in FEATURE_NAMES]])

        # Smart per-feature scale (numeric scaled, categorical passthrough)
        X = apply_per_feature_scalers(X_raw, self.scalers, FEATURE_NAMES)

        # Random Forest → PD
        pd_val = float(self.rf_model.predict_proba(X)[0, 1])

        # ai_risk_score: 0-100 (0 = an toan, 100 = rui ro cao)
        return {
            "ai_risk_score": int(round(min(max(pd_val, 0), 1) * 100)),
            "default_probability": round(pd_val, 4),
            "status": "success",
        }

    def _process(self, raw):
        """Map raw input dict → 14 feature dict.
        Input from NestJS (VND context):
          credit_score, loan_amnt/capital, int_rate, annual_inc/annual_income,
          dti, revol_util, open_acc, pub_rec,
          term/periodMonth, home_ownership, verification_status, purpose, emp_length
        """
        f = {}
        # ── NUMERIC ──
        f["credit_score"] = min(max(float(raw.get("credit_score", 600)), 300), 850)
        f["loan_amnt"] = max(float(raw.get("loan_amnt", raw.get("capital", 0))), 0)
        f["int_rate"] = min(max(float(raw.get("int_rate", 12)), 0), 40)
        f["annual_inc"] = max(float(raw.get("annual_inc", raw.get("annual_income", 0))), 0)
        if f["annual_inc"] == 0 and "monthly_income" in raw:
            f["annual_inc"] = float(raw["monthly_income"]) * 12
        f["dti"] = min(max(float(raw.get("dti", 0)), 0), 100)
        f["revol_util"] = min(max(float(raw.get("revol_util", 50)), 0), 150)
        f["open_acc"] = min(max(float(raw.get("open_acc", 5)), 0), 50)
        f["pub_rec"] = min(max(float(raw.get("pub_rec", 0)), 0), 20)
        # Engineered
        annual_safe = max(f["annual_inc"], 1)
        f["loan_to_income"] = f["loan_amnt"] / annual_safe

        # ── CATEGORICAL ──
        f["term_enc"] = float(raw.get("term", raw.get("term_months", raw.get("periodMonth", 36))))
        home = str(raw.get("home_ownership", "RENT")).upper()
        f["home_ownership_enc"] = HOME_MAP.get(home, 3)
        vs = str(raw.get("verification_status", "Not Verified"))
        f["verification_status_enc"] = VERIFICATION_MAP.get(vs, 0)
        purpose = str(raw.get("purpose", "other")).lower()
        f["purpose_enc"] = PURPOSE_MAP.get(purpose, 3)
        emp = raw.get("emp_length", "5 years")
        if isinstance(emp, (int, float)):
            f["emp_length_enc"] = min(max(int(emp), 0), 10)
        else:
            f["emp_length_enc"] = EMP_LENGTH_MAP.get(str(emp), 5)

        return f


# ═════════════════════════════════════════════════════════════
#  RUN
# ═════════════════════════════════════════════════════════════
if __name__ == "__main__":
    result = train_model()
