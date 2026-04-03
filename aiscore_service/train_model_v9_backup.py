"""
╔══════════════════════════════════════════════════════════════════════════╗
║  AIScore — Stacking Ensemble (Google Colab)  v9.0                      ║
║  Dataset: Lending Club — accepted + rejected (2007-2018 Q4)            ║
║  Train + Evaluate + Score + 20 Charts — ALL IN ONE FILE                ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  ARCHITECTURE — STACKING (3 models, 2 levels):                         ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━            ║
║                                                                        ║
║  Level 1 — Base Learners (học cơ sở):                                  ║
║    XGBoost: Tìm mối quan hệ phi tuyến phức tạp                        ║
║    SVM (SGD linear): Tìm ranh giới hình học rõ giữa nhóm              ║
║    → Output: probability predictions (out-of-fold)                     ║
║                                                                        ║
║  Level 2 — Meta Learner (siêu cấu trúc):                              ║
║    Logistic Regression: Tổng hợp + calibrate xác suất                  ║
║    Input: [XGB_proba, SVM_proba] + 25 Original Features               ║
║    Output: PD (Probability of Default) — calibrated                    ║
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
║    xgb_pd_model.json, svm_model.joblib, lr_meta_model.joblib,         ║
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
from sklearn.linear_model import LogisticRegression, SGDClassifier
from sklearn.preprocessing import StandardScaler, RobustScaler, MinMaxScaler
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, classification_report, confusion_matrix,
    brier_score_loss, log_loss, roc_curve, precision_recall_curve,
    average_precision_score, matthews_corrcoef, balanced_accuracy_score,
    cohen_kappa_score,
)
from sklearn.calibration import calibration_curve, CalibratedClassifierCV
import joblib
import json

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)

# ===================== CONFIG =====================
RANDOM_STATE = 42
N_FOLDS = 5
STACKING_FOLDS = 5

DATA_DIR = "/content/drive/MyDrive/Colab Notebooks"
ACCEPTED_CSV = os.path.join(DATA_DIR, "accepted_2007_to_2018Q4.csv")
REJECTED_CSV = os.path.join(DATA_DIR, "rejected_2007_to_2018Q4.csv")
MODEL_DIR = os.path.join(DATA_DIR, "models")
CHART_DIR = os.path.join(DATA_DIR, "charts")

DEFAULT_RATE = 25_000
MAX_SAMPLES = 500_000

# ── Scorecard Parameters — used for analysis/charts ONLY ──
BASE_SCORE = 600
PDO = 20
BASE_ODDS = 50
FACTOR = PDO / np.log(2)
OFFSET = BASE_SCORE - FACTOR * np.log(BASE_ODDS)

print(f"[config] Architecture: STACKING — XGBoost + SVM → LR (Meta Learner)")
print(f"[config] Features: 25 (21 numeric + 4 categorical)")
print(f"[config] Scorecard (analysis only): Base={BASE_SCORE}, PDO={PDO}, Factor={FACTOR:.3f}")

COLORS = {
    'xgb': '#2196F3', 'svm': '#FF9800',
    'lr': '#4CAF50', 'hybrid': '#E91E63',
}
MODEL_LABELS = {
    'xgb': 'XGBoost (L1)', 'svm': 'SVM (L1)',
    'lr': 'LR Meta (L2)', 'hybrid': 'Stacking (XGB+SVM→LR)',
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
            req = urllib.request.Request(url, headers={"User-Agent": "aiscore-service/9.0"})
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
]

CATEGORICAL_FEATURES = [
    "term_enc", "home_ownership_enc", "verification_status_enc",
    "purpose_enc",
]

FEATURE_NAMES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

ACCEPTED_USECOLS = [
    "sub_grade", "loan_amnt", "installment", "term", "emp_length",
    "home_ownership", "annual_inc", "verification_status", "loan_status",
    "purpose", "dti", "revol_util", "open_acc", "pub_rec",
    "pub_rec_bankruptcies", "total_acc", "revol_bal",
    "earliest_cr_line", "inq_last_6mths", "delinq_2yrs",
    "tot_cur_bal", "acc_now_delinq", "num_tl_90g_dpd_24m",
    "pct_tl_nvr_dlq", "collections_12_mths_ex_med",
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
    "term_enc": "passthrough", "home_ownership_enc": "passthrough",
    "verification_status_enc": "passthrough", "purpose_enc": "passthrough",
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
    df["term_enc"] = df["term"].str.extract(r"(\d+)").astype(float)
    df["home_ownership_enc"] = df["home_ownership"].map(HOME_MAP).fillna(3).astype(int)
    df["verification_status_enc"] = df["verification_status"].map(VERIFICATION_MAP).fillna(0).astype(int)
    df["purpose_enc"] = df["purpose"].map(PURPOSE_MAP).fillna(3).astype(int)
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


def _build_xgb(spw, random_state=RANDOM_STATE):
    return xgb.XGBClassifier(
        n_estimators=800, max_depth=5, learning_rate=0.02,
        subsample=0.8, colsample_bytree=0.7, min_child_weight=10,
        gamma=0.3, reg_alpha=0.5, reg_lambda=2.0, max_bin=256,
        scale_pos_weight=spw, random_state=random_state,
        eval_metric="auc", early_stopping_rounds=80,
        tree_method="hist", device="cpu",
    )


def _build_svm(random_state=RANDOM_STATE):
    return SGDClassifier(
        loss='modified_huber', alpha=1e-4, max_iter=1000, tol=1e-4,
        class_weight='balanced', random_state=random_state, n_jobs=1,
    )


def stacking_oof_predictions(X_train, y_train, X_test, scale_pos_wt, n_folds=STACKING_FOLDS):
    n_train = X_train.shape[0]
    oof_xgb = np.zeros(n_train)
    oof_svm = np.zeros(n_train)
    xgb_aucs = []
    svm_aucs = []
    kf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=RANDOM_STATE)
    for fold_i, (tr_idx, val_idx) in enumerate(kf.split(X_train, y_train)):
        X_tr, X_val = X_train[tr_idx], X_train[val_idx]
        y_tr, y_val = y_train[tr_idx], y_train[val_idx]
        xgb_fold = _build_xgb(scale_pos_wt)
        xgb_fold.fit(X_tr, y_tr, eval_set=[(X_val, y_val)], verbose=False)
        xgb_val_proba = xgb_fold.predict_proba(X_val)[:, 1]
        oof_xgb[val_idx] = xgb_val_proba
        xgb_aucs.append(roc_auc_score(y_val, xgb_val_proba))
        del xgb_fold; gc.collect()
        svm_fold = _build_svm()
        svm_fold.fit(X_tr, y_tr)
        svm_val_proba = svm_fold.predict_proba(X_val)[:, 1]
        oof_svm[val_idx] = svm_val_proba
        svm_aucs.append(roc_auc_score(y_val, svm_val_proba))
        del svm_fold; gc.collect()
        print(f"    Fold {fold_i+1}/{n_folds}:  XGB AUC={xgb_aucs[-1]:.4f}  |  SVM AUC={svm_aucs[-1]:.4f}")
        del X_tr, X_val, y_tr, y_val; gc.collect()
    print(f"\n  OOF XGBoost AUC: {np.mean(xgb_aucs):.4f} +/- {np.std(xgb_aucs):.4f}")
    print(f"  OOF SVM AUC:     {np.mean(svm_aucs):.4f} +/- {np.std(svm_aucs):.4f}")
    print(f"\n  Training final XGBoost on full train ({X_train.shape[0]:,})...")
    xgb_final = _build_xgb(scale_pos_wt)
    _split = StratifiedKFold(n_splits=10, shuffle=True, random_state=RANDOM_STATE+999)
    _tr_idx, _val_idx = next(_split.split(X_train, y_train))
    xgb_final.fit(X_train[_tr_idx], y_train[_tr_idx],
                   eval_set=[(X_train[_val_idx], y_train[_val_idx])], verbose=False)
    test_xgb_proba = xgb_final.predict_proba(X_test)[:, 1]
    n_trees = xgb_final.best_iteration + 1
    print(f"  XGBoost final: {n_trees} trees")
    print(f"  Training final SVM on full train ({X_train.shape[0]:,})...")
    svm_final = _build_svm()
    svm_final.fit(X_train, y_train)
    test_svm_proba = svm_final.predict_proba(X_test)[:, 1]
    return (oof_xgb, oof_svm, test_xgb_proba, test_svm_proba,
            xgb_aucs, svm_aucs, xgb_final, svm_final, n_trees)


def plot_all_charts(
    y_test, xgb_proba, svm_proba, lr_proba, hybrid_proba,
    X_test_raw, feature_names, chart_dir, metadata,
    xgb_aucs_oof=None, svm_aucs_oof=None,
):
    os.makedirs(chart_dir, exist_ok=True)
    y = y_test.ravel()

    def _save(fig, name):
        fig.savefig(os.path.join(chart_dir, name), dpi=200, bbox_inches='tight')
        plt.close(fig)

    # ── Chart 1: ROC curves ──
    fig, ax = plt.subplots(figsize=(10, 8))
    for key, proba, label in [('xgb', xgb_proba, MODEL_LABELS['xgb']),
                               ('svm', svm_proba, MODEL_LABELS['svm']),
                               ('lr', lr_proba, MODEL_LABELS['lr']),
                               ('hybrid', hybrid_proba, MODEL_LABELS['hybrid'])]:
        fpr, tpr, _ = roc_curve(y, proba)
        auc_val = roc_auc_score(y, proba)
        ax.plot(fpr, tpr, color=COLORS[key], lw=2, label=f'{label} (AUC={auc_val:.4f})')
    ax.plot([0,1],[0,1],'--', color='grey', alpha=0.5)
    ax.set_xlabel('FPR'); ax.set_ylabel('TPR'); ax.set_title('ROC Curves — All Models')
    ax.legend(loc='lower right', fontsize=9); fig.tight_layout()
    _save(fig, '01_roc_curves.png')

    # ── Chart 2: Precision-Recall curves ──
    fig, ax = plt.subplots(figsize=(10, 8))
    for key, proba, label in [('xgb', xgb_proba, MODEL_LABELS['xgb']),
                               ('svm', svm_proba, MODEL_LABELS['svm']),
                               ('lr', lr_proba, MODEL_LABELS['lr']),
                               ('hybrid', hybrid_proba, MODEL_LABELS['hybrid'])]:
        prec, rec, _ = precision_recall_curve(y, proba)
        ap = average_precision_score(y, proba)
        ax.plot(rec, prec, color=COLORS[key], lw=2, label=f'{label} (AP={ap:.4f})')
    ax.set_xlabel('Recall'); ax.set_ylabel('Precision'); ax.set_title('Precision-Recall Curves')
    ax.legend(fontsize=9); fig.tight_layout()
    _save(fig, '02_precision_recall.png')

    # ── Chart 3: Score distribution ──
    fig, axes = plt.subplots(2, 2, figsize=(16, 12))
    for ax, (key, proba, label) in zip(axes.ravel(),
            [('xgb', xgb_proba, MODEL_LABELS['xgb']),
             ('svm', svm_proba, MODEL_LABELS['svm']),
             ('lr', lr_proba, MODEL_LABELS['lr']),
             ('hybrid', hybrid_proba, MODEL_LABELS['hybrid'])]):
        scores = pd_to_score(proba)
        good = scores[y == 0]; bad = scores[y == 1]
        ax.hist(good, bins=50, alpha=0.6, color='#4CAF50', label=f'Good (n={len(good):,})', density=True)
        ax.hist(bad, bins=50, alpha=0.6, color='#F44336', label=f'Bad (n={len(bad):,})', density=True)
        ax.set_title(f'{label} — Score Distribution')
        ax.legend(fontsize=9)
    fig.suptitle('Credit Score Distribution (Good vs Bad)', fontsize=14, fontweight='bold')
    fig.tight_layout(); _save(fig, '03_score_distribution.png')

    # ── Chart 4: Confusion matrices ──
    fig, axes = plt.subplots(2, 2, figsize=(16, 12))
    for ax, (key, proba, label) in zip(axes.ravel(),
            [('xgb', xgb_proba, MODEL_LABELS['xgb']),
             ('svm', svm_proba, MODEL_LABELS['svm']),
             ('lr', lr_proba, MODEL_LABELS['lr']),
             ('hybrid', hybrid_proba, MODEL_LABELS['hybrid'])]):
        preds = (proba >= 0.5).astype(int)
        cm = confusion_matrix(y, preds)
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=ax,
                    xticklabels=['Good','Bad'], yticklabels=['Good','Bad'])
        ax.set_title(f'{label}'); ax.set_ylabel('Actual'); ax.set_xlabel('Predicted')
    fig.suptitle('Confusion Matrices', fontsize=14, fontweight='bold')
    fig.tight_layout(); _save(fig, '04_confusion_matrices.png')

    # ── Chart 5: Calibration ──
    fig, ax = plt.subplots(figsize=(10, 8))
    for key, proba, label in [('xgb', xgb_proba, MODEL_LABELS['xgb']),
                               ('svm', svm_proba, MODEL_LABELS['svm']),
                               ('lr', lr_proba, MODEL_LABELS['lr']),
                               ('hybrid', hybrid_proba, MODEL_LABELS['hybrid'])]:
        frac_pos, mean_pred = calibration_curve(y, proba, n_bins=15, strategy='uniform')
        brier = brier_score_loss(y, proba)
        ax.plot(mean_pred, frac_pos, 's-', color=COLORS[key], label=f'{label} (Brier={brier:.4f})')
    ax.plot([0,1],[0,1],'--', color='grey', alpha=0.5)
    ax.set_xlabel('Mean predicted'); ax.set_ylabel('Fraction positive')
    ax.set_title('Calibration Plot'); ax.legend(fontsize=9); fig.tight_layout()
    _save(fig, '05_calibration.png')

    # ── Chart 6: Feature importance (XGBoost) ──
    fig, ax = plt.subplots(figsize=(12, 8))
    if 'xgb_feature_importance' in metadata:
        imp_data = metadata['xgb_feature_importance']
        fnames = [d['feature'] for d in imp_data]
        fimps = [d['importance'] for d in imp_data]
        idx_sorted = np.argsort(fimps)
        ax.barh([fnames[i] for i in idx_sorted], [fimps[i] for i in idx_sorted], color=COLORS['xgb'], alpha=0.8)
        ax.set_title('XGBoost Feature Importance (gain)'); ax.set_xlabel('Importance')
    fig.tight_layout(); _save(fig, '06_feature_importance.png')

    # ── Chart 7: Threshold analysis ──
    fig, axes = plt.subplots(1, 2, figsize=(18, 7))
    thresholds = np.arange(0.05, 0.96, 0.01)
    for ax, (key, proba, label) in zip(axes,
            [('xgb', xgb_proba, MODEL_LABELS['xgb']),
             ('hybrid', hybrid_proba, MODEL_LABELS['hybrid'])]):
        precs, recs, f1s = [], [], []
        for t in thresholds:
            preds = (proba >= t).astype(int)
            precs.append(precision_score(y, preds, zero_division=0))
            recs.append(recall_score(y, preds, zero_division=0))
            f1s.append(f1_score(y, preds, zero_division=0))
        ax.plot(thresholds, precs, label='Precision', color='#2196F3')
        ax.plot(thresholds, recs, label='Recall', color='#F44336')
        ax.plot(thresholds, f1s, label='F1', color='#4CAF50', linestyle='--')
        best_t = thresholds[np.argmax(f1s)]
        ax.axvline(best_t, linestyle=':', color='purple', label=f'Best F1 @ {best_t:.2f}')
        ax.set_title(f'{label}'); ax.set_xlabel('Threshold'); ax.legend(fontsize=9)
    fig.suptitle('Threshold Analysis', fontsize=14, fontweight='bold')
    fig.tight_layout(); _save(fig, '07_threshold_analysis.png')

    # ── Chart 8: Probability distribution (KDE) ──
    fig, axes = plt.subplots(2, 2, figsize=(16, 12))
    for ax, (key, proba, label) in zip(axes.ravel(),
            [('xgb', xgb_proba, MODEL_LABELS['xgb']),
             ('svm', svm_proba, MODEL_LABELS['svm']),
             ('lr', lr_proba, MODEL_LABELS['lr']),
             ('hybrid', hybrid_proba, MODEL_LABELS['hybrid'])]):
        g = proba[y==0]; b = proba[y==1]
        ax.hist(g, bins=80, alpha=0.4, color='#4CAF50', density=True, label='Good')
        ax.hist(b, bins=80, alpha=0.4, color='#F44336', density=True, label='Bad')
        ax.set_title(f'{label} — PD distribution')
        ax.set_xlabel('Predicted PD'); ax.legend(fontsize=9)
    fig.suptitle('Probability Distribution', fontsize=14, fontweight='bold')
    fig.tight_layout(); _save(fig, '08_probability_distribution.png')

    # ── Chart 9: Score by credit tier ──
    fig, ax = plt.subplots(figsize=(14, 8))
    scores_hybrid = pd_to_score(hybrid_proba)
    tiers = ['Excellent (750+)', 'Good (700-749)', 'Fair (650-699)', 'Below (600-649)', 'Poor (<600)']
    tier_data = [
        scores_hybrid[(X_test_raw[:, 0] >= 750)],
        scores_hybrid[(X_test_raw[:, 0] >= 700) & (X_test_raw[:, 0] < 750)],
        scores_hybrid[(X_test_raw[:, 0] >= 650) & (X_test_raw[:, 0] < 700)],
        scores_hybrid[(X_test_raw[:, 0] >= 600) & (X_test_raw[:, 0] < 650)],
        scores_hybrid[(X_test_raw[:, 0] < 600)],
    ]
    tier_data = [t for t in tier_data if len(t) > 0]
    tiers = tiers[:len(tier_data)]
    bp = ax.boxplot(tier_data, labels=tiers, patch_artist=True)
    colors_box = ['#4CAF50','#8BC34A','#FFC107','#FF9800','#F44336']
    for patch, c in zip(bp['boxes'], colors_box[:len(tier_data)]):
        patch.set_facecolor(c); patch.set_alpha(0.6)
    ax.set_title('Stacking Score by Credit Tier'); ax.set_ylabel('Score')
    fig.tight_layout(); _save(fig, '09_score_by_credit_tier.png')

    # ── Chart 10: Metrics comparison bar chart ──
    fig, ax = plt.subplots(figsize=(14, 8))
    metric_names = ['AUC', 'Accuracy', 'Precision', 'Recall', 'F1', 'Brier']
    model_keys = ['xgb', 'svm', 'lr', 'hybrid']
    bar_width = 0.18
    x = np.arange(len(metric_names))
    for i, (key, proba, label) in enumerate([
        ('xgb', xgb_proba, MODEL_LABELS['xgb']),
        ('svm', svm_proba, MODEL_LABELS['svm']),
        ('lr', lr_proba, MODEL_LABELS['lr']),
        ('hybrid', hybrid_proba, MODEL_LABELS['hybrid']),
    ]):
        preds = (proba >= 0.5).astype(int)
        vals = [
            roc_auc_score(y, proba), accuracy_score(y, preds),
            precision_score(y, preds, zero_division=0), recall_score(y, preds, zero_division=0),
            f1_score(y, preds, zero_division=0), 1 - brier_score_loss(y, proba),
        ]
        ax.bar(x + i*bar_width, vals, bar_width, color=COLORS[key], label=label, alpha=0.85)
    ax.set_xticks(x + bar_width*1.5); ax.set_xticklabels(metric_names)
    ax.set_title('Model Comparison'); ax.legend(fontsize=9); ax.set_ylim(0, 1.05)
    fig.tight_layout(); _save(fig, '10_metrics_comparison.png')

    # ── Chart 11: Correlation heatmap ──
    fig, ax = plt.subplots(figsize=(16, 14))
    corr_data = pd.DataFrame(X_test_raw, columns=feature_names)
    corr_data['XGB_PD'] = xgb_proba
    corr_data['SVM_PD'] = svm_proba
    corr_data['Hybrid_PD'] = hybrid_proba
    corr = corr_data.corr()
    mask = np.triu(np.ones_like(corr, dtype=bool))
    sns.heatmap(corr, mask=mask, annot=False, cmap='RdBu_r', center=0, ax=ax)
    ax.set_title('Feature + Model Correlation Heatmap')
    fig.tight_layout(); _save(fig, '11_correlation_heatmap.png')

    # ── Chart 12: OOF AUC boxplot ──
    fig, ax = plt.subplots(figsize=(10, 6))
    data_box = []
    labels_box = []
    if xgb_aucs_oof:
        data_box.append(xgb_aucs_oof); labels_box.append('XGBoost')
    if svm_aucs_oof:
        data_box.append(svm_aucs_oof); labels_box.append('SVM')
    if data_box:
        bp = ax.boxplot(data_box, labels=labels_box, patch_artist=True)
        for patch, c in zip(bp['boxes'], [COLORS['xgb'], COLORS['svm']]):
            patch.set_facecolor(c); patch.set_alpha(0.6)
    ax.set_title('Out-of-Fold AUC Distribution (Level 1)'); ax.set_ylabel('AUC')
    fig.tight_layout(); _save(fig, '12_oof_auc_boxplot.png')

    # ── Chart 13: Cumulative gains ──
    fig, ax = plt.subplots(figsize=(10, 8))
    for key, proba, label in [('xgb', xgb_proba, MODEL_LABELS['xgb']),
                               ('hybrid', hybrid_proba, MODEL_LABELS['hybrid'])]:
        idx_sorted = np.argsort(-proba)
        y_sorted = y[idx_sorted]
        gains = np.cumsum(y_sorted) / y.sum()
        pct = np.arange(1, len(y)+1) / len(y)
        ax.plot(pct, gains, color=COLORS[key], lw=2, label=label)
    ax.plot([0,1],[0,1], '--', color='grey', alpha=0.5, label='Random')
    ax.set_xlabel('% samples'); ax.set_ylabel('% defaults captured')
    ax.set_title('Cumulative Gains'); ax.legend(fontsize=9); fig.tight_layout()
    _save(fig, '13_cumulative_gains.png')

    # ── Chart 14: Score stability (quintiles) ──
    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
    for ax, (key, proba, label) in zip(axes,
            [('xgb', xgb_proba, MODEL_LABELS['xgb']),
             ('hybrid', hybrid_proba, MODEL_LABELS['hybrid'])]):
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
        fidx = feature_names.index(feat)
        vals = X_test_raw[:, fidx]
        ax.scatter(vals[y==0], hybrid_proba[y==0], alpha=0.05, s=2, color='#4CAF50', label='Good')
        ax.scatter(vals[y==1], hybrid_proba[y==1], alpha=0.05, s=2, color='#F44336', label='Bad')
        ax.set_xlabel(feat); ax.set_ylabel('PD')
        ax.set_title(f'{feat} vs Predicted PD'); ax.legend(fontsize=8, markerscale=5)
    fig.suptitle('Delinquency/Debt Features — Stacking PD', fontsize=14, fontweight='bold')
    fig.tight_layout(); _save(fig, '15_delinquency_impact.png')

    # ── Chart 16: Architecture diagram ──
    fig, ax = plt.subplots(figsize=(16, 10))
    ax.set_xlim(0, 16); ax.set_ylim(0, 10); ax.axis('off')
    ax.text(8, 9.5, 'STACKING ARCHITECTURE — v9.0', ha='center', fontsize=18, fontweight='bold')
    # Input
    rect_input = mpatches.FancyBboxPatch((0.5, 7), 4, 1.5, boxstyle='round,pad=0.1',
                                          facecolor='#E3F2FD', edgecolor='#1565C0', lw=2)
    ax.add_patch(rect_input)
    ax.text(2.5, 8.0, '25 Features\n(21 Num + 4 Cat)', ha='center', va='center', fontsize=10, fontweight='bold')
    # Scaling
    rect_scale = mpatches.FancyBboxPatch((5.5, 7), 4, 1.5, boxstyle='round,pad=0.1',
                                          facecolor='#F3E5F5', edgecolor='#7B1FA2', lw=2)
    ax.add_patch(rect_scale)
    ax.text(7.5, 8.0, 'Smart Scaling\n(per-feature)', ha='center', va='center', fontsize=10, fontweight='bold')
    ax.annotate('', xy=(5.5, 7.75), xytext=(4.5, 7.75), arrowprops=dict(arrowstyle='->', lw=2, color='#333'))
    # Level 1 - XGBoost
    rect_xgb = mpatches.FancyBboxPatch((1, 4), 4.5, 2, boxstyle='round,pad=0.1',
                                        facecolor='#BBDEFB', edgecolor='#1976D2', lw=2)
    ax.add_patch(rect_xgb)
    ax.text(3.25, 5.3, 'Level 1 — XGBoost', ha='center', fontsize=11, fontweight='bold', color='#1565C0')
    ax.text(3.25, 4.6, '800 trees, depth=5\nNon-linear patterns', ha='center', fontsize=9)
    # Level 1 - SVM
    rect_svm = mpatches.FancyBboxPatch((6.5, 4), 4.5, 2, boxstyle='round,pad=0.1',
                                        facecolor='#FFE0B2', edgecolor='#E65100', lw=2)
    ax.add_patch(rect_svm)
    ax.text(8.75, 5.3, 'Level 1 — SVM (SGD)', ha='center', fontsize=11, fontweight='bold', color='#E65100')
    ax.text(8.75, 4.6, 'Linear boundary\nGeometric separation', ha='center', fontsize=9)
    # Arrows down
    ax.annotate('', xy=(3.25, 6), xytext=(5, 7), arrowprops=dict(arrowstyle='->', lw=2, color='#1976D2'))
    ax.annotate('', xy=(8.75, 6), xytext=(7.5, 7), arrowprops=dict(arrowstyle='->', lw=2, color='#E65100'))
    # Meta features
    rect_meta = mpatches.FancyBboxPatch((3, 2), 6, 1.5, boxstyle='round,pad=0.1',
                                         facecolor='#C8E6C9', edgecolor='#2E7D32', lw=2)
    ax.add_patch(rect_meta)
    ax.text(6, 3.0, 'Level 2 — Meta Learner (LR)', ha='center', fontsize=12, fontweight='bold', color='#2E7D32')
    ax.text(6, 2.4, '[XGB_proba, SVM_proba] + 25 Features → Calibrated PD', ha='center', fontsize=9)
    ax.annotate('', xy=(5, 3.5), xytext=(3.25, 4), arrowprops=dict(arrowstyle='->', lw=2, color='#333'))
    ax.annotate('', xy=(7, 3.5), xytext=(8.75, 4), arrowprops=dict(arrowstyle='->', lw=2, color='#333'))
    # Output
    rect_out = mpatches.FancyBboxPatch((4.5, 0.2), 3, 1.2, boxstyle='round,pad=0.1',
                                        facecolor='#FCE4EC', edgecolor='#C62828', lw=2)
    ax.add_patch(rect_out)
    ax.text(6, 0.9, 'ai_risk_score\n+ default_probability', ha='center', va='center', fontsize=10, fontweight='bold', color='#C62828')
    ax.annotate('', xy=(6, 1.4), xytext=(6, 2), arrowprops=dict(arrowstyle='->', lw=2, color='#C62828'))
    fig.tight_layout(); _save(fig, '16_architecture_diagram.png')

    # ── Chart 17: PD scatter comparison ──
    fig, ax = plt.subplots(figsize=(10, 10))
    ax.scatter(xgb_proba, hybrid_proba, alpha=0.05, s=2, c=y, cmap='RdYlGn_r')
    ax.plot([0,1],[0,1], '--', color='grey', alpha=0.5)
    ax.set_xlabel('XGB PD'); ax.set_ylabel('Stacking PD')
    ax.set_title('XGBoost vs Stacking PD (colored by truth)')
    fig.tight_layout(); _save(fig, '17_pd_scatter.png')

    # ── Chart 18: SVM vs XGB PD comparison ──
    fig, ax = plt.subplots(figsize=(10, 10))
    ax.scatter(xgb_proba, svm_proba, alpha=0.05, s=2, c=y, cmap='RdYlGn_r')
    ax.plot([0,1],[0,1], '--', color='grey', alpha=0.5)
    ax.set_xlabel('XGB PD'); ax.set_ylabel('SVM PD')
    ax.set_title('XGB vs SVM Base Learner PD'); fig.tight_layout()
    _save(fig, '18_xgb_vs_svm_pd.png')

    # ── Chart 19: KS Statistic ──
    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
    for ax, (key, proba, label) in zip(axes,
            [('xgb', xgb_proba, MODEL_LABELS['xgb']),
             ('hybrid', hybrid_proba, MODEL_LABELS['hybrid'])]):
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

    # ── Chart 20: Summary dashboard ──
    fig, ax = plt.subplots(figsize=(14, 10))
    ax.axis('off')
    ax.text(0.5, 0.97, 'STACKING MODEL — PERFORMANCE DASHBOARD', ha='center', fontsize=18, fontweight='bold',
            transform=ax.transAxes)
    lines = []
    for key, proba, label in [('xgb', xgb_proba, MODEL_LABELS['xgb']),
                               ('svm', svm_proba, MODEL_LABELS['svm']),
                               ('lr', lr_proba, MODEL_LABELS['lr']),
                               ('hybrid', hybrid_proba, MODEL_LABELS['hybrid'])]:
        preds = (proba >= 0.5).astype(int)
        lines.append(f"{'━'*60}")
        lines.append(f"  {label}")
        lines.append(f"    AUC={roc_auc_score(y,proba):.4f}  Acc={accuracy_score(y,preds):.4f}  "
                     f"F1={f1_score(y,preds):.4f}  Brier={brier_score_loss(y,proba):.4f}")
        lines.append(f"    Prec={precision_score(y,preds,zero_division=0):.4f}  "
                     f"Rec={recall_score(y,preds,zero_division=0):.4f}  "
                     f"MCC={matthews_corrcoef(y,preds):.4f}")
    lines.append(f"{'━'*60}")
    lines.append(f"  Architecture: Stacking (Level 1: XGB+SVM → Level 2: LR)")
    lines.append(f"  Features: {len(feature_names)} | Test samples: {len(y):,}")
    ax.text(0.05, 0.88, '\n'.join(lines), transform=ax.transAxes, fontsize=10,
            fontfamily='monospace', verticalalignment='top')
    fig.tight_layout(); _save(fig, '20_summary_dashboard.png')
    print(f"  [charts] Saved 20 charts to {chart_dir}")


# ═══════════════════════════════════════════════════════════
# MAIN TRAINING PIPELINE
# ═══════════════════════════════════════════════════════════
def train_model():
    ts = time.time()
    print("\n" + "═"*70)
    print("  STACKING TRAINING PIPELINE v9.0")
    print("  XGBoost + SVM (Level 1) → LR Meta (Level 2)")
    print("═"*70)

    os.makedirs(MODEL_DIR, exist_ok=True)
    os.makedirs(CHART_DIR, exist_ok=True)

    # ── Step 1: Load & clean ──
    print(f"\n[1/9] Loading & cleaning data...")
    df = load_and_clean_data(ACCEPTED_CSV, REJECTED_CSV, CHART_DIR)
    X = df[FEATURE_NAMES].values.astype(np.float64)
    y = df["is_default"].values.astype(np.int32)
    del df; gc.collect()

    # ── Step 2: Train/test split ──
    print(f"\n[2/9] Train/test split (80/20 stratified)...")
    X_train_raw, X_test_raw, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE,
    )
    del X; gc.collect()
    print(f"  Train: {len(y_train):,} | Test: {len(y_test):,}")
    print(f"  Train default rate: {y_train.mean():.4f} | Test default rate: {y_test.mean():.4f}")

    # ── Step 3: Smart scaling ──
    print(f"\n[3/9] Per-feature smart scaling...")
    scalers, X_train = create_per_feature_scalers(X_train_raw, FEATURE_NAMES)
    X_test = apply_per_feature_scalers(X_test_raw, scalers, FEATURE_NAMES)
    print(f"  Scaled: train {X_train.shape} | test {X_test.shape}")
    scale_pos_wt = float(np.sum(y_train == 0) / np.sum(y_train == 1))
    print(f"  scale_pos_weight = {scale_pos_wt:.2f}")

    # ── Step 4: Stacking OOF predictions (Level 1) ──
    print(f"\n[4/9] Stacking Level 1 — OOF predictions ({STACKING_FOLDS}-fold)...")
    (oof_xgb, oof_svm, test_xgb_proba, test_svm_proba,
     xgb_aucs_oof, svm_aucs_oof, xgb_model, svm_model, n_trees) = \
        stacking_oof_predictions(X_train, y_train, X_test, scale_pos_wt)

    # ── Step 5: Build meta features ──
    print(f"\n[5/9] Building meta features (Level 2 input)...")
    meta_train = np.column_stack([oof_xgb, oof_svm, X_train])
    meta_test = np.column_stack([test_xgb_proba, test_svm_proba, X_test])
    print(f"  Meta train: {meta_train.shape} | Meta test: {meta_test.shape}")
    print(f"  [0]=XGB_proba  [1]=SVM_proba  [2..26]=25 original features")

    # ── Step 6: Train LR Meta Learner (Level 2) ──
    print(f"\n[6/9] Training LR Meta Learner (Level 2)...")
    lr_model = LogisticRegression(
        C=1.0, penalty='l2', solver='saga', max_iter=300,
        class_weight='balanced', random_state=RANDOM_STATE, tol=1e-4,
    )
    lr_model.fit(meta_train, y_train)
    lr_train_proba = lr_model.predict_proba(meta_train)[:, 1]
    hybrid_train_proba = lr_train_proba
    print(f"  LR Meta converged with {lr_model.n_iter_[0]} iterations")
    lr_coefs = lr_model.coef_[0]
    print(f"  Meta coefs: XGB_w={lr_coefs[0]:.4f}, SVM_w={lr_coefs[1]:.4f}")
    print(f"  Feature coefs range: [{lr_coefs[2:].min():.4f}, {lr_coefs[2:].max():.4f}]")
    print(f"  LR intercept: {lr_model.intercept_[0]:.4f}")

    # ── Step 7: Evaluate on Test ──
    print(f"\n[7/9] Evaluating on test set...")
    xgb_proba = test_xgb_proba
    svm_proba = test_svm_proba
    lr_proba = lr_model.predict_proba(meta_test)[:, 1]
    hybrid_proba = lr_proba

    for key, proba, label in [('xgb', xgb_proba, MODEL_LABELS['xgb']),
                               ('svm', svm_proba, MODEL_LABELS['svm']),
                               ('hybrid', hybrid_proba, MODEL_LABELS['hybrid'])]:
        preds = (proba >= 0.5).astype(int)
        print(f"\n  {label}:")
        print(f"    AUC       = {roc_auc_score(y_test, proba):.4f}")
        print(f"    Accuracy  = {accuracy_score(y_test, preds):.4f}")
        print(f"    Precision = {precision_score(y_test, preds, zero_division=0):.4f}")
        print(f"    Recall    = {recall_score(y_test, preds, zero_division=0):.4f}")
        print(f"    F1        = {f1_score(y_test, preds, zero_division=0):.4f}")
        print(f"    MCC       = {matthews_corrcoef(y_test, preds):.4f}")
        print(f"    Brier     = {brier_score_loss(y_test, proba):.4f}")

    # XGB feature importance
    raw_imp = xgb_model.get_booster().get_score(importance_type='gain')
    total_imp = sum(raw_imp.values()) or 1
    feature_importance = []
    for i, fn in enumerate(FEATURE_NAMES):
        key = f"f{i}"
        imp = raw_imp.get(key, 0) / total_imp
        feature_importance.append({"feature": fn, "importance": round(imp, 6)})
    feature_importance.sort(key=lambda x: x["importance"], reverse=True)

    # ── Step 8: Cross-validation (Stacking pipeline) ──
    print(f"\n[8/9] Cross-validated Stacking pipeline ({N_FOLDS}-fold)...")
    cv_aucs_hybrid = []
    cv_aucs_xgb = []
    cv_aucs_svm = []
    kf_cv = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=RANDOM_STATE + 100)
    X_full = np.vstack([X_train, X_test])
    y_full = np.concatenate([y_train, y_test])
    X_full_raw = np.vstack([X_train_raw, X_test_raw])

    for fold_i, (train_idx, test_idx) in enumerate(kf_cv.split(X_full, y_full)):
        Xf_tr, Xf_te = X_full[train_idx], X_full[test_idx]
        yf_tr, yf_te = y_full[train_idx], y_full[test_idx]
        spw_f = float(np.sum(yf_tr == 0) / np.sum(yf_tr == 1))

        inner_kf = StratifiedKFold(n_splits=3, shuffle=True, random_state=RANDOM_STATE + fold_i)
        n_inner = Xf_tr.shape[0]
        oof_xgb_cv = np.zeros(n_inner)
        oof_svm_cv = np.zeros(n_inner)
        for inner_i, (itr, ival) in enumerate(inner_kf.split(Xf_tr, yf_tr)):
            xgb_cv = xgb.XGBClassifier(
                n_estimators=400, max_depth=4, learning_rate=0.03,
                subsample=0.8, colsample_bytree=0.7, min_child_weight=10,
                gamma=0.3, reg_alpha=0.5, reg_lambda=2.0, max_bin=256,
                scale_pos_weight=spw_f, random_state=RANDOM_STATE,
                eval_metric="auc", early_stopping_rounds=50,
                tree_method="hist", device="cpu",
            )
            xgb_cv.fit(Xf_tr[itr], yf_tr[itr],
                       eval_set=[(Xf_tr[ival], yf_tr[ival])], verbose=False)
            oof_xgb_cv[ival] = xgb_cv.predict_proba(Xf_tr[ival])[:, 1]
            del xgb_cv; gc.collect()

            svm_cv = _build_svm(random_state=RANDOM_STATE + inner_i)
            svm_cv.fit(Xf_tr[itr], yf_tr[itr])
            oof_svm_cv[ival] = svm_cv.predict_proba(Xf_tr[ival])[:, 1]
            del svm_cv; gc.collect()

        meta_cv_train = np.column_stack([oof_xgb_cv, oof_svm_cv, Xf_tr])

        xgb_final_cv = xgb.XGBClassifier(
            n_estimators=400, max_depth=4, learning_rate=0.03,
            subsample=0.8, colsample_bytree=0.7, min_child_weight=10,
            gamma=0.3, reg_alpha=0.5, reg_lambda=2.0, max_bin=256,
            scale_pos_weight=spw_f, random_state=RANDOM_STATE,
            eval_metric="auc", early_stopping_rounds=50,
            tree_method="hist", device="cpu",
        )
        _spl = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE+999)
        _tr2, _vl2 = next(_spl.split(Xf_tr, yf_tr))
        xgb_final_cv.fit(Xf_tr[_tr2], yf_tr[_tr2],
                         eval_set=[(Xf_tr[_vl2], yf_tr[_vl2])], verbose=False)
        test_xgb_cv = xgb_final_cv.predict_proba(Xf_te)[:, 1]
        del xgb_final_cv; gc.collect()

        svm_final_cv = _build_svm()
        svm_final_cv.fit(Xf_tr, yf_tr)
        test_svm_cv = svm_final_cv.predict_proba(Xf_te)[:, 1]
        del svm_final_cv; gc.collect()

        meta_cv_test = np.column_stack([test_xgb_cv, test_svm_cv, Xf_te])

        lr_cv = LogisticRegression(C=1.0, penalty='l2', solver='saga', max_iter=300,
                                    class_weight='balanced', random_state=RANDOM_STATE, tol=1e-4)
        lr_cv.fit(meta_cv_train, yf_tr)
        hybrid_cv_proba = lr_cv.predict_proba(meta_cv_test)[:, 1]
        del lr_cv; gc.collect()

        auc_xgb_cv = roc_auc_score(yf_te, test_xgb_cv)
        auc_svm_cv = roc_auc_score(yf_te, test_svm_cv)
        auc_hybrid_cv = roc_auc_score(yf_te, hybrid_cv_proba)
        cv_aucs_xgb.append(auc_xgb_cv)
        cv_aucs_svm.append(auc_svm_cv)
        cv_aucs_hybrid.append(auc_hybrid_cv)
        print(f"    Fold {fold_i+1}/{N_FOLDS}: XGB={auc_xgb_cv:.4f} SVM={auc_svm_cv:.4f} Stacking={auc_hybrid_cv:.4f}")
        del Xf_tr, Xf_te, yf_tr, yf_te, meta_cv_train, meta_cv_test; gc.collect()

    print(f"\n  CV Results ({N_FOLDS}-fold):")
    print(f"    XGBoost:  {np.mean(cv_aucs_xgb):.4f} +/- {np.std(cv_aucs_xgb):.4f}")
    print(f"    SVM:      {np.mean(cv_aucs_svm):.4f} +/- {np.std(cv_aucs_svm):.4f}")
    print(f"    Stacking: {np.mean(cv_aucs_hybrid):.4f} +/- {np.std(cv_aucs_hybrid):.4f}")

    del X_full, y_full, X_full_raw; gc.collect()

    # ── Step 9: Save artifacts ──
    print(f"\n[9/9] Saving artifacts to {MODEL_DIR}...")
    xgb_model.save_model(os.path.join(MODEL_DIR, "xgb_pd_model.json"))
    joblib.dump(svm_model, os.path.join(MODEL_DIR, "svm_model.joblib"))
    joblib.dump(lr_model, os.path.join(MODEL_DIR, "lr_meta_model.joblib"))
    joblib.dump(scalers, os.path.join(MODEL_DIR, "per_feature_scalers.joblib"))

    metadata = {
        "version": "9.0.0",
        "architecture": "STACKING (XGBoost + SVM → LR Meta)",
        "level_1": {
            "xgboost": {
                "n_estimators_trained": int(n_trees),
                "max_depth": 5,
                "learning_rate": 0.02,
                "oof_auc_mean": round(float(np.mean(xgb_aucs_oof)), 4),
                "oof_auc_std": round(float(np.std(xgb_aucs_oof)), 4),
            },
            "svm": {
                "type": "SGDClassifier(loss=modified_huber)",
                "alpha": 1e-4,
                "class_weight": "balanced",
                "oof_auc_mean": round(float(np.mean(svm_aucs_oof)), 4),
                "oof_auc_std": round(float(np.std(svm_aucs_oof)), 4),
            },
        },
        "level_2": {
            "type": "LogisticRegression",
            "C": 1.0,
            "penalty": "l2",
            "solver": "saga",
            "n_meta_features": int(meta_train.shape[1]),
            "meta_coef_xgb": round(float(lr_coefs[0]), 6),
            "meta_coef_svm": round(float(lr_coefs[1]), 6),
            "intercept": round(float(lr_model.intercept_[0]), 6),
        },
        "features": FEATURE_NAMES,
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "n_features": len(FEATURE_NAMES),
        "scaling_config": {k: v for k, v in FEATURE_SCALING_CONFIG.items()},
        "test_metrics": {
            "xgb_auc": round(float(roc_auc_score(y_test, xgb_proba)), 4),
            "svm_auc": round(float(roc_auc_score(y_test, svm_proba)), 4),
            "stacking_auc": round(float(roc_auc_score(y_test, hybrid_proba)), 4),
            "stacking_brier": round(float(brier_score_loss(y_test, hybrid_proba)), 4),
            "stacking_f1": round(float(f1_score(y_test, (hybrid_proba >= 0.5).astype(int))), 4),
            "stacking_mcc": round(float(matthews_corrcoef(y_test, (hybrid_proba >= 0.5).astype(int))), 4),
        },
        "cv_results": {
            "n_folds": N_FOLDS,
            "xgb_auc_mean": round(float(np.mean(cv_aucs_xgb)), 4),
            "svm_auc_mean": round(float(np.mean(cv_aucs_svm)), 4),
            "stacking_auc_mean": round(float(np.mean(cv_aucs_hybrid)), 4),
            "stacking_auc_std": round(float(np.std(cv_aucs_hybrid)), 4),
        },
        "xgb_feature_importance": feature_importance,
        "scorecard_params": {"base_score": BASE_SCORE, "pdo": PDO, "factor": round(FACTOR, 4), "offset": round(OFFSET, 4)},
        "training_config": {
            "max_samples": MAX_SAMPLES,
            "stacking_folds": STACKING_FOLDS,
            "device": "cpu",
            "random_state": RANDOM_STATE,
        },
        "artifacts": [
            "xgb_pd_model.json", "svm_model.joblib",
            "lr_meta_model.joblib", "per_feature_scalers.joblib",
            "metadata.json",
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
    print(f"\n  Generating 20 charts...")
    plot_all_charts(
        y_test, xgb_proba, svm_proba, lr_proba, hybrid_proba,
        X_test_raw, FEATURE_NAMES, CHART_DIR, metadata,
        xgb_aucs_oof=xgb_aucs_oof, svm_aucs_oof=svm_aucs_oof,
    )

    elapsed = time.time() - ts
    print(f"\n{'═'*70}")
    print(f"  DONE — Total time: {elapsed/60:.1f} min")
    print(f"  Stacking AUC: {roc_auc_score(y_test, hybrid_proba):.4f}")
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
    }

    def __init__(self, model_dir: str):
        self.model_dir = model_dir
        self.xgb_model = xgb.XGBClassifier()
        self.xgb_model.load_model(os.path.join(model_dir, "xgb_pd_model.json"))
        self.svm_model = joblib.load(os.path.join(model_dir, "svm_model.joblib"))
        self.lr_model = joblib.load(os.path.join(model_dir, "lr_meta_model.joblib"))
        self.scalers = joblib.load(os.path.join(model_dir, "per_feature_scalers.joblib"))
        with open(os.path.join(model_dir, "metadata.json"), "r") as f:
            self.metadata = json.load(f)
        self.feature_names = self.metadata["features"]
        print(f"[CreditScorer] Loaded Stacking v{self.metadata['version']} "
              f"({len(self.feature_names)} features)")

    def predict(self, features: dict) -> dict:
        resolved = {}
        for k, v in features.items():
            canon = self.FEATURE_ALIASES.get(k, k)
            resolved[canon] = v
        vec = np.array([[resolved.get(fn, 0.0) for fn in self.feature_names]], dtype=np.float64)
        vec_scaled = apply_per_feature_scalers(vec, self.scalers, self.feature_names)
        xgb_p = float(self.xgb_model.predict_proba(vec_scaled)[:, 1][0])
        svm_p = float(self.svm_model.predict_proba(vec_scaled)[:, 1][0])
        meta = np.column_stack([[xgb_p], [svm_p], vec_scaled])
        pd_val = float(self.lr_model.predict_proba(meta)[:, 1][0])
        score = int(round(pd_to_score(np.array([pd_val]))[0]))
        return {
            "ai_risk_score": score,
            "default_probability": round(pd_val, 6),
            "components": {
                "xgb_pd": round(xgb_p, 6),
                "svm_pd": round(svm_p, 6),
                "lr_meta_pd": round(pd_val, 6),
            },
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
    print(f"  Components: XGB={result['components']['xgb_pd']:.4f} SVM={result['components']['svm_pd']:.4f}")
    print(f"\n  ALL DONE ✓")
