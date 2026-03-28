"""
╔══════════════════════════════════════════════════════════════════════════╗
║  AIScore — XGBoost + Logistic Regression SCORECARD (Google Colab)      ║
║  Train + Evaluate + Score + 20 Charts — ALL IN ONE FILE                ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  KIEN TRUC 2 TANG (Industry Standard Credit Scoring):                  ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                   ║
║                                                                        ║
║  Stage 1 — XGBoost (Non-linear Feature Learner):                       ║
║    Train gradient boosting => Extract LEAF INDICES                      ║
║                                                                        ║
║  Stage 2 — Logistic Regression (Scorecard Generator):                  ║
║    Input: One-Hot Encoded Leaf Indices + Original 15 Features          ║
║    Output: PD (Probability of Default)                                  ║
║                                                                        ║
║  Stage 3 — Scorecard Formula (Banking Standard):                       ║
║    Score = Offset - Factor × ln(PD / (1 - PD))                        ║
║    Higher score = Lower risk (chuan nganh ngan hang)                   ║
║                                                                        ║
║  CHUAN HOA: Smart Per-Feature Scaling — moi feature 1 pipeline rieng  ║
║    Log1p cho VND skewed | RobustScaler cho outliers | Passthrough cat ║
║  OUTPUT: Models + 20 bieu do + Metadata JSON                           ║
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
import warnings
import time
import numpy as np
import pandas as pd
import xgboost as xgb
import scipy.sparse as sp
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import seaborn as sns
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler, RobustScaler, MinMaxScaler, OneHotEncoder
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

MODEL_DIR = "/content/drive/MyDrive/Colab Notebooks/models"
DATA_PATH = "/content/drive/MyDrive/Colab Notebooks/lending_club_loan_two.csv"
CHART_DIR = "/content/drive/MyDrive/Colab Notebooks/charts"

DEFAULT_RATE = 25_000

# ── Scorecard Parameters (Industry Standard) ──
BASE_SCORE = 600       # Score tai base odds
PDO = 20               # Points to Double Odds
BASE_ODDS = 50         # Tai BASE_SCORE, odds good:bad = 50:1
FACTOR = PDO / np.log(2)                          # ≈ 28.854
OFFSET = BASE_SCORE - FACTOR * np.log(BASE_ODDS)  # ≈ 487.12

print(f"[config] Architecture: XGBoost + Logistic Regression Scorecard")
print(f"[config] Scorecard: Base={BASE_SCORE}, PDO={PDO}, Factor={FACTOR:.3f}, Offset={OFFSET:.3f}")

# Model colors
COLORS = {
    'xgb':    '#2196F3',  # Blue
    'lr':     '#FF9800',  # Orange
    'hybrid': '#E91E63',  # Pink
}
MODEL_LABELS = {
    'xgb':    'XGBoost (raw)',
    'lr':     'LR Scorecard',
    'hybrid': 'HYBRID (XGB+LR)',
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
            req = urllib.request.Request(url, headers={"User-Agent": "aiscore-service/5.0"})
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

_GRADES = [f"{l}{s}" for l in "ABCDEFG" for s in range(1, 6)]
SUB_GRADE_TO_SCORE = {
    g: int(round(750 - (750 - 150) * i / (len(_GRADES) - 1)))
    for i, g in enumerate(_GRADES)
}

FEATURE_NAMES = [
    "credit_score", "capital", "monthly_income", "monthly_pay",
    "revolving_balance", "dti", "revolving_util_percent", "term_months",
    "emp_length_years", "active_bad_debts", "bankruptcies", "active_loans",
    "total_loans_history", "home_ownership_enc", "purpose_enc"
]

PURPOSE_MAP = {
    "debt_consolidation": 0, "credit_card": 1, "home_improvement": 2,
    "other": 3, "major_purchase": 4, "medical": 5, "small_business": 6,
    "car": 7, "vacation": 8, "moving": 9, "house": 10,
    "wedding": 11, "renewable_energy": 12, "educational": 13,
}

HOME_MAP = {"RENT": 0, "OWN": 1, "MORTGAGE": 2, "OTHER": 3, "NONE": 3, "ANY": 3}


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
    # ── Diem tin dung (uniform 150-750) ──
    "credit_score":           "standard",

    # ── Tien VND (RIGHT-SKEWED MANH) — log1p lam gan normal truoc khi scale ──
    "capital":                "log_standard",    # Tien vay: 12M - 1B VND
    "monthly_income":         "log_robust",      # Luong: outlier cuc doan (top 1%)
    "monthly_pay":            "log_standard",    # Tra gop/thang
    "revolving_balance":      "log_standard",    # Du no: co the = 0, log1p safe

    # ── Ty le % (bounded, co outliers) — RobustScaler (median + IQR) ──
    "dti":                    "robust",          # 0-100%, co outliers
    "revolving_util_percent": "robust",          # 0-150%, lech

    # ── Ky han vay (chi co 36 hoac 60) ──
    "term_months":            "standard",

    # ── So nam di lam (bounded 0.5-10) — MinMaxScaler [0,1] ──
    "emp_length_years":       "minmax",

    # ── Count sparse / zero-inflated — RobustScaler ──
    "active_bad_debts":       "robust",          # Phan lon = 0
    "bankruptcies":           "robust",          # Phan lon = 0

    # ── Count gan normal — StandardScaler ──
    "active_loans":           "standard",        # 0-50, gan normal
    "total_loans_history":    "standard",        # 1-100+, gan normal

    # ── Ordinal categorical — KHONG scale (discrete label) ──
    "home_ownership_enc":     "passthrough",     # 0/1/2/3
    "purpose_enc":            "passthrough",     # 0-13
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
def load_and_clean_data(path: str) -> pd.DataFrame:
    print(f"  Loading CSV from {path}...")
    df = pd.read_csv(path)
    df = df[df["loan_status"].isin(["Fully Paid", "Charged Off"])].copy()
    df["is_default"] = (df["loan_status"] == "Charged Off").astype(int)

    df["credit_score"] = df["sub_grade"].map(SUB_GRADE_TO_SCORE)
    df = df.dropna(subset=["credit_score"])
    df["credit_score"] = df["credit_score"].astype(int)

    rate = USD_TO_VND
    df["capital"] = df["loan_amnt"] * rate
    df["monthly_income"] = (df["annual_inc"] / 12) * rate
    df["monthly_pay"] = df["installment"] * rate
    df["revolving_balance"] = df["revol_bal"] * rate
    df["term_months"] = df["term"].str.extract(r"(\d+)").astype(float)

    def parse_emp_length(val):
        if pd.isna(val): return np.nan
        val = str(val).strip()
        if "10+" in val: return 10.0
        if "< 1" in val: return 0.5
        nums = pd.to_numeric(val.split()[0], errors="coerce")
        return nums if not pd.isna(nums) else np.nan

    df["emp_length_years"] = df["emp_length"].apply(parse_emp_length)
    df["revolving_util_percent"] = df["revol_util"]
    df["active_bad_debts"] = df["pub_rec"]
    df["bankruptcies"] = df["pub_rec_bankruptcies"]
    df["active_loans"] = df["open_acc"]
    df["total_loans_history"] = df["total_acc"]

    df["emp_length_years"] = df["emp_length_years"].fillna(df["emp_length_years"].median())
    df["bankruptcies"] = df["bankruptcies"].fillna(0)
    df["revolving_util_percent"] = df["revolving_util_percent"].fillna(df["revolving_util_percent"].median())
    df["active_bad_debts"] = df["active_bad_debts"].fillna(0)

    df["home_ownership_enc"] = df["home_ownership"].map(HOME_MAP).fillna(3).astype(int)
    df["purpose_enc"] = df["purpose"].map(PURPOSE_MAP).fillna(3).astype(int)

    df["dti"] = df["dti"].clip(0, 100)
    df["active_loans"] = df["active_loans"].clip(0, 50)
    df["revolving_util_percent"] = df["revolving_util_percent"].clip(0, 150)
    df["monthly_income"] = df["monthly_income"].clip(0, df["monthly_income"].quantile(0.99))

    df = df[FEATURE_NAMES + ["is_default"]].dropna()
    return df


# ═════════════════════════════════════════════════════════════
#  20 BIEU DO — MEGA CHARTS
# ═════════════════════════════════════════════════════════════
def plot_all_charts(
    y_test, y_prob_xgb, y_prob_lr, y_pred_lr,
    optimal_threshold, scores_test, scores_train, y_train,
    xgb_importances, feature_names, lr_coef_original,
    cv_aucs, fold_metrics, X_test_scaled, chart_dir,
):
    os.makedirs(chart_dir, exist_ok=True)
    try:
        plt.style.use('seaborn-v0_8-darkgrid')
    except Exception:
        plt.style.use('ggplot')

    print("\n  Dang xuat 20 bieu do...")
    all_probs = {'xgb': y_prob_xgb, 'lr': y_prob_lr, 'hybrid': y_prob_lr}

    # ─── 1. ROC Curve — XGBoost vs LR Scorecard ───
    print("    [1/20] ROC Curve...")
    fig, ax = plt.subplots(figsize=(10, 8))
    for key in ['xgb', 'lr']:
        fpr, tpr, _ = roc_curve(y_test, all_probs[key])
        auc_val = roc_auc_score(y_test, all_probs[key])
        lw = 3 if key == 'lr' else 1.5
        ax.plot(fpr, tpr, label=f"{MODEL_LABELS[key]} (AUC={auc_val:.4f})",
                linewidth=lw, color=COLORS[key])
    ax.plot([0, 1], [0, 1], 'k:', alpha=0.4, label='Random (0.5)')
    ax.set_xlabel('False Positive Rate', fontsize=13)
    ax.set_ylabel('True Positive Rate', fontsize=13)
    ax.set_title('ROC Curve — XGBoost vs LR Scorecard', fontsize=15, fontweight='bold')
    ax.legend(fontsize=11, loc='lower right'); ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '01_roc_curve.png'), dpi=200); plt.close(fig)

    # ─── 2. Precision-Recall Curve ───
    print("    [2/20] Precision-Recall Curve...")
    fig, ax = plt.subplots(figsize=(10, 8))
    for key in ['xgb', 'lr']:
        prec_c, rec_c, _ = precision_recall_curve(y_test, all_probs[key])
        ap = average_precision_score(y_test, all_probs[key])
        lw = 3 if key == 'lr' else 1.5
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
    cm = confusion_matrix(y_test, y_pred_lr)
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=axes[0],
                xticklabels=["Paid (0)", "Default (1)"], yticklabels=["Paid (0)", "Default (1)"])
    axes[0].set_title('Counts', fontsize=14, fontweight='bold')
    axes[0].set_xlabel('Predicted'); axes[0].set_ylabel('Actual')
    cm_norm = cm.astype(float) / cm.sum(axis=1, keepdims=True)
    sns.heatmap(cm_norm, annot=True, fmt='.2%', cmap='Oranges', ax=axes[1],
                xticklabels=["Paid (0)", "Default (1)"], yticklabels=["Paid (0)", "Default (1)"])
    axes[1].set_title('Normalized', fontsize=14, fontweight='bold')
    axes[1].set_xlabel('Predicted'); axes[1].set_ylabel('Actual')
    fig.suptitle('LR Scorecard — Confusion Matrix', fontsize=16, fontweight='bold', y=1.02)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '03_confusion_matrix.png'), dpi=200, bbox_inches='tight'); plt.close(fig)

    # ─── 4. XGBoost Feature Importance ───
    print("    [4/20] Feature Importance (XGBoost)...")
    fig, ax = plt.subplots(figsize=(12, 9))
    sorted_idx = np.argsort(xgb_importances)
    ax.barh(range(len(sorted_idx)), xgb_importances[sorted_idx], color=COLORS['xgb'], alpha=0.85)
    ax.set_yticks(range(len(sorted_idx)))
    ax.set_yticklabels([feature_names[i] for i in sorted_idx], fontsize=11)
    ax.set_title('XGBoost Feature Importance (Stage 1)', fontsize=15, fontweight='bold')
    ax.set_xlabel('Importance'); ax.grid(True, alpha=0.3, axis='x')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '04_feature_importance_xgb.png'), dpi=200); plt.close(fig)

    # ─── 5. PD Distribution — XGBoost vs LR ───
    print("    [5/20] PD Distribution...")
    fig, axes = plt.subplots(1, 2, figsize=(18, 7))
    for ax_i, (key, title) in enumerate([('xgb', 'XGBoost Raw PD'), ('lr', 'LR Scorecard PD')]):
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
    for key in ['xgb', 'lr']:
        frac, mean_p = calibration_curve(y_test, all_probs[key], n_bins=10, strategy='uniform')
        lw = 3 if key == 'lr' else 1.5
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
    ax.set_title(f'CV AUC — {N_FOLDS}-Fold XGBoost+LR Pipeline', fontsize=15, fontweight='bold')
    ax.set_ylim(min(cv_aucs) - 0.02, max(cv_aucs) + 0.02); ax.grid(True, alpha=0.3, axis='y')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '07_cv_auc_per_fold.png'), dpi=200); plt.close(fig)

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

    # ─── 10. Model Comparison (XGB vs LR) ───
    print("    [10/20] Model Comparison...")
    fig, ax = plt.subplots(figsize=(12, 7))
    mk = ['xgb', 'lr']
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
    ax.set_title('XGBoost vs LR Scorecard — 5 Metrics', fontsize=15, fontweight='bold')
    ax.set_ylim(0, 1.12); ax.grid(True, alpha=0.3, axis='y')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '10_model_comparison.png'), dpi=200); plt.close(fig)

    # ─── 11. Cumulative Gain + Lift ───
    print("    [11/20] Cumulative Gain & Lift...")
    fig, axes = plt.subplots(1, 2, figsize=(18, 7))
    si = np.argsort(-y_prob_lr); sl = y_test[si]
    cd = np.cumsum(sl); td = y_test.sum()
    pp = np.arange(1, len(y_test) + 1) / len(y_test); pdc = cd / td
    axes[0].plot(pp, pdc, color=COLORS['hybrid'], lw=2.5, label='LR Scorecard')
    axes[0].plot([0, 1], [0, 1], 'k--', alpha=0.4, label='Random')
    axes[0].fill_between(pp, pdc, pp, alpha=0.12, color=COLORS['hybrid'])
    axes[0].set_xlabel('% Population'); axes[0].set_ylabel('% Defaults Captured')
    axes[0].set_title('Cumulative Gain', fontsize=14, fontweight='bold')
    axes[0].legend(); axes[0].grid(True, alpha=0.3)
    lift = pdc / pp
    axes[1].plot(pp, lift, color=COLORS['hybrid'], lw=2.5, label='LR Scorecard')
    axes[1].axhline(y=1, color='k', ls='--', alpha=0.4, label='Random')
    axes[1].set_xlabel('% Population'); axes[1].set_ylabel('Lift')
    axes[1].set_title('Lift Curve', fontsize=14, fontweight='bold')
    axes[1].legend(); axes[1].grid(True, alpha=0.3)
    fig.suptitle('Gain & Lift — LR Scorecard', fontsize=16, fontweight='bold')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '11_gain_lift_curve.png'), dpi=200); plt.close(fig)

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
    ax.set_title('KS Statistic — Phan biet Default vs Paid', fontsize=15, fontweight='bold')
    ax.legend(); ax.set_xlim(0, 1); ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '12_ks_statistic.png'), dpi=200); plt.close(fig)

    # ─── 13. Architecture Diagram ───
    print("    [13/20] Architecture Diagram...")
    fig, ax = plt.subplots(figsize=(16, 14))
    ax.set_xlim(0, 12); ax.set_ylim(0, 14); ax.axis('off')
    ax.text(6, 13.5, 'XGBoost + Logistic Regression SCORECARD', fontsize=22, fontweight='bold',
            ha='center', color=COLORS['hybrid'])
    ax.text(6, 12.9, '"Tieu chuan vang" nganh tai chinh — Industry Standard Credit Scoring',
            fontsize=12, ha='center', color='gray', style='italic')
    bd = dict(boxstyle="round,pad=0.5", alpha=0.3, linewidth=2)
    # Input
    ax.text(6, 12.0, '15 Features (VND)\n+ Per-Feature Scaling (15 scalers)',
            fontsize=12, ha='center', bbox=dict(**bd, facecolor='#E1F5FE', edgecolor='#0277BD'))
    ax.annotate('', xy=(6, 10.8), xytext=(6, 11.5), arrowprops=dict(arrowstyle='->', color='gray', lw=2))
    # Stage 1
    ax.text(6, 10.2, 'STAGE 1: XGBoost\nn_estimators=1500, max_depth=6\n"Non-linear Feature Learner"',
            fontsize=12, ha='center', bbox=dict(**bd, facecolor=COLORS['xgb'], edgecolor=COLORS['xgb']))
    ax.annotate('', xy=(6, 8.9), xytext=(6, 9.5), arrowprops=dict(arrowstyle='->', color='gray', lw=2))
    # Leaf
    ax.text(6, 8.3, 'Leaf Indices Extraction\nmodel.apply(X) → n_trees leaf IDs\n+ One-Hot Encoding (Sparse)',
            fontsize=12, ha='center', bbox=dict(**bd, facecolor='#FFF9C4', edgecolor='#F9A825'))
    ax.annotate('', xy=(6, 7.0), xytext=(6, 7.6), arrowprops=dict(arrowstyle='->', color='gray', lw=2))
    # Combine
    ax.text(6, 6.4, 'Leaf OHE + 15 Original Features\n→ Input for LR',
            fontsize=12, ha='center', color='#D32F2F', fontweight='bold')
    ax.annotate('', xy=(6, 5.2), xytext=(6, 5.9), arrowprops=dict(arrowstyle='->', color='gray', lw=2))
    # Stage 2
    ax.text(6, 4.6, 'STAGE 2: Logistic Regression\nCalibrated PD + Interpretable Coefficients',
            fontsize=12, ha='center', bbox=dict(**bd, facecolor=COLORS['lr'], edgecolor=COLORS['lr']))
    ax.annotate('', xy=(6, 3.3), xytext=(6, 3.9), arrowprops=dict(arrowstyle='->', color='gray', lw=2))
    # Stage 3
    ax.text(6, 2.7, 'STAGE 3: Scorecard Formula\nScore = Offset - Factor × ln(Odds)\nOdds = PD / (1 - PD)',
            fontsize=12, ha='center', bbox=dict(**bd, facecolor='#E8F5E9', edgecolor='#388E3C'))
    ax.annotate('', xy=(6, 1.3), xytext=(6, 2.0), arrowprops=dict(arrowstyle='->', color=COLORS['hybrid'], lw=3))
    # Output
    ax.text(6, 0.7, 'OUTPUT: Credit Score (150-950)\n+ PD (0.0-1.0) + ai_risk_score (0-100)',
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
    fig, ax = plt.subplots(figsize=(14, 11))
    feat_df = pd.DataFrame(X_test_scaled, columns=feature_names)
    corr = feat_df.corr()
    mask = np.triu(np.ones_like(corr, dtype=bool))
    sns.heatmap(corr, mask=mask, annot=True, fmt='.2f', cmap='RdBu_r', ax=ax,
                vmin=-1, vmax=1, linewidths=0.5, square=True)
    ax.set_title('Feature Correlation Heatmap (15 features)', fontsize=15, fontweight='bold')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '16_feature_correlation.png'), dpi=200); plt.close(fig)

    # ─── 17. LR Scorecard — Feature Score Points ───
    print("    [17/20] Scorecard Feature Points...")
    fig, ax = plt.subplots(figsize=(14, 9))
    coefs = lr_coef_original
    # Positive coef → increases PD → increases risk → DECREASES score
    score_points = -coefs * FACTOR  # Approximate score contribution per unit
    sorted_idx = np.argsort(np.abs(score_points))
    colors_bar = ['#F44336' if c < 0 else '#4CAF50' for c in score_points[sorted_idx]]
    ax.barh(range(len(sorted_idx)), score_points[sorted_idx], color=colors_bar, alpha=0.85)
    ax.set_yticks(range(len(sorted_idx)))
    ax.set_yticklabels([feature_names[i] for i in sorted_idx], fontsize=11)
    ax.axvline(x=0, color='black', lw=1)
    ax.set_xlabel('Score Points (positive = tang score = giam rui ro)', fontsize=12)
    ax.set_title('LR Scorecard — Score Points per Feature\n(Green = giam rui ro, Red = tang rui ro)',
                 fontsize=15, fontweight='bold')
    ax.grid(True, alpha=0.3, axis='x')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '17_scorecard_feature_points.png'), dpi=200); plt.close(fig)

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
    # Theoretical line
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
    fp_mask = (y_pred_lr == 1) & (y_test == 0)
    fn_mask = (y_pred_lr == 0) & (y_test == 1)
    tp_mask = (y_pred_lr == 1) & (y_test == 1)
    tn_mask = (y_pred_lr == 0) & (y_test == 0)
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
    for k in ['xgb', 'lr']:
        fpr_m, tpr_m, _ = roc_curve(y_test, all_probs[k])
        ax1.plot(fpr_m, tpr_m, color=COLORS[k], lw=2 if k == 'lr' else 1,
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
    metrics_table = [['Metric', 'XGBoost (raw)', 'LR Scorecard']]
    for met_name in ['AUC', 'Accuracy', 'Precision', 'Recall', 'F1']:
        row = [met_name]
        for k in ['xgb', 'lr']:
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
    for k in ['xgb', 'lr']:
        frac_m, mean_m = calibration_curve(y_test, all_probs[k], n_bins=8)
        ax6.plot(mean_m, frac_m, 's-', color=COLORS[k], lw=2 if k == 'lr' else 1, label=MODEL_LABELS[k], ms=4)
    ax6.legend(fontsize=8); ax6.set_title('Calibration', fontweight='bold')
    # Mini Risk bands
    ax7 = fig.add_subplot(gs[2, 2])
    ax7.bar(range(len(bs)), bs['dr'] * 100, color=bc, alpha=0.8, edgecolor='black')
    ax7.set_xticks(range(len(bs))); ax7.set_xticklabels(['V.High', 'High', 'Med', 'Low', 'V.Low'], fontsize=8)
    ax7.set_ylabel('Default Rate %'); ax7.set_title('Risk by Score Band', fontweight='bold')
    fig.suptitle('XGBoost + LR SCORECARD — SUMMARY DASHBOARD', fontsize=18, fontweight='bold', y=1.01)
    fig.savefig(os.path.join(chart_dir, '20_summary_dashboard.png'), dpi=200, bbox_inches='tight')
    plt.close(fig)

    print(f"\n  >>> Da xuat 20 bieu do tai: {chart_dir}/")


# ═════════════════════════════════════════════════════════════
#  MAIN TRAINING PIPELINE
# ═════════════════════════════════════════════════════════════
def train_model():
    t_start = time.time()
    print("=" * 70)
    print("  AIScore — XGBoost + Logistic Regression SCORECARD")
    print("  Stage 1: XGBoost → Leaf Indices")
    print("  Stage 2: LR on [Leaf OHE + 15 Features] → PD")
    print("  Stage 3: Score = Offset - Factor × ln(Odds)")
    print("=" * 70)

    # ── 1. Load ──
    print("\n[1/9] Loading data...")
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(f"Khong tim thay: {DATA_PATH}")
    df = load_and_clean_data(DATA_PATH)
    print(f"  Dataset: {len(df):,} samples | Default rate: {df['is_default'].mean():.2%}")

    # ── 2. Split ──
    print("\n[2/9] Train/Test split...")
    X = df[FEATURE_NAMES].values
    y = df["is_default"].values
    X_train_raw, X_test_raw, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )
    print(f"  Train: {len(y_train):,} | Test: {len(y_test):,}")

    # ── 3. Smart Per-feature scaling ──
    print("\n[3/9] Smart Per-Feature Scaling (15 pipelines)...")
    scalers, X_train = create_per_feature_scalers(X_train_raw, FEATURE_NAMES)
    X_test = apply_per_feature_scalers(X_test_raw, scalers, FEATURE_NAMES)
    print(f"    {'Feature':30s} {'Strategy':15s} {'Scaler Info'}")
    print(f"    {'─'*30} {'─'*15} {'─'*35}")
    for fn in FEATURE_NAMES:
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
        print(f"    {fn:30s} {strategy:15s} {info}")

    n_pos = y_train.sum(); n_neg = len(y_train) - n_pos
    scale_pos_wt = n_neg / n_pos
    print(f"\n  Class: neg={n_neg:,}, pos={n_pos:,}, scale_pos_weight={scale_pos_wt:.2f}")

    # ══════════════════════════════════════════════
    # STAGE 1: XGBoost — Non-linear Feature Learner
    # ══════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  STAGE 1: XGBoost — Non-linear Feature Learner")
    print("=" * 70)

    print("\n[4/9] Training XGBoost...")
    xgb_model = xgb.XGBClassifier(
        n_estimators=1500, max_depth=6, learning_rate=0.01,
        subsample=0.8, colsample_bytree=0.8, min_child_weight=10,
        gamma=0.3, reg_alpha=1.0, reg_lambda=3.0, max_bin=1024,
        scale_pos_weight=scale_pos_wt, random_state=RANDOM_STATE,
        eval_metric="auc", early_stopping_rounds=100,
        tree_method="hist", n_jobs=-1,
    )
    xgb_model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
    n_trees = xgb_model.best_iteration + 1
    xgb_proba_train = xgb_model.predict_proba(X_train)[:, 1]
    xgb_proba_test = xgb_model.predict_proba(X_test)[:, 1]
    xgb_auc = roc_auc_score(y_test, xgb_proba_test)
    print(f"  XGBoost: {n_trees} trees (early stopped), Test AUC={xgb_auc:.4f}")

    # ── 5. Extract Leaf Indices ──
    print("\n[5/9] Extracting leaf indices + One-Hot Encoding...")
    leaf_train = xgb_model.apply(X_train)   # shape: (n_train, n_trees_total)
    leaf_test = xgb_model.apply(X_test)
    print(f"  Leaf matrix: {leaf_train.shape} (n_samples x n_trees)")

    leaf_enc = OneHotEncoder(sparse_output=True, handle_unknown='ignore', dtype=np.float32)
    L_train = leaf_enc.fit_transform(leaf_train)
    L_test = leaf_enc.transform(leaf_test)
    n_leaf_features = L_train.shape[1]
    print(f"  One-Hot Encoded: {n_leaf_features:,} sparse features")
    print(f"  Sparse density: {L_train.nnz / (L_train.shape[0] * L_train.shape[1]):.6f}")
    mem_mb = (L_train.data.nbytes + L_train.indices.nbytes + L_train.indptr.nbytes) / (1024**2)
    print(f"  Sparse matrix memory: {mem_mb:.1f} MB")

    # Combine: leaf OHE + original features
    X_lr_train = sp.hstack([L_train, sp.csr_matrix(X_train.astype(np.float32))], format='csr')
    X_lr_test = sp.hstack([L_test, sp.csr_matrix(X_test.astype(np.float32))], format='csr')
    print(f"  LR input: {X_lr_train.shape[1]:,} features ({n_leaf_features:,} leaf + 15 original)")

    # ══════════════════════════════════════════════
    # STAGE 2: Logistic Regression — Scorecard
    # ══════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  STAGE 2: Logistic Regression — Scorecard Generator")
    print("=" * 70)

    print("\n[6/9] Training Logistic Regression...")
    lr_model = LogisticRegression(
        C=1.0, penalty='l2', class_weight='balanced',
        max_iter=300, solver='saga', random_state=RANDOM_STATE,
        tol=1e-4,
    )
    lr_model.fit(X_lr_train, y_train)
    lr_proba_train = lr_model.predict_proba(X_lr_train)[:, 1]
    lr_proba_test = lr_model.predict_proba(X_lr_test)[:, 1]
    lr_auc = roc_auc_score(y_test, lr_proba_test)
    print(f"  LR Scorecard: Test AUC={lr_auc:.4f}")
    print(f"  AUC improvement over XGBoost raw: {lr_auc - xgb_auc:+.4f}")

    # Extract LR coefficients for original 15 features (last 15)
    lr_coef_all = lr_model.coef_[0]
    lr_coef_original = lr_coef_all[-len(FEATURE_NAMES):]
    print(f"\n  LR Feature Score Contributions (original 15 features):")
    for i, fn in enumerate(FEATURE_NAMES):
        direction = "tang risk" if lr_coef_original[i] > 0 else "giam risk"
        print(f"    {fn:30s} coef={lr_coef_original[i]:+.4f}  ({direction})")

    # ══════════════════════════════════════════════
    # STAGE 3: Scorecard — PD → Credit Score
    # ══════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  STAGE 3: Scorecard Formula — PD → Credit Score")
    print(f"  Score = {OFFSET:.2f} - {FACTOR:.3f} × ln(PD / (1-PD))")
    print("=" * 70)

    scores_train = pd_to_score(lr_proba_train)
    scores_test = pd_to_score(lr_proba_test)
    print(f"\n  Score Statistics (Test Set):")
    print(f"    Mean:   {scores_test.mean():.1f}")
    print(f"    Median: {np.median(scores_test):.1f}")
    print(f"    Min:    {scores_test.min():.1f}")
    print(f"    Max:    {scores_test.max():.1f}")
    print(f"    Std:    {scores_test.std():.1f}")
    print(f"    Paid mean:    {scores_test[y_test == 0].mean():.1f}")
    print(f"    Default mean: {scores_test[y_test == 1].mean():.1f}")

    # ── 7. Evaluate ──
    print("\n" + "=" * 70)
    print("  [7/9] DANH GIA MODEL")
    print("=" * 70)

    y_prob_final = lr_proba_test
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
    print(f"  XGBoost + LR SCORECARD RESULTS")
    print(f"  {'='*55}")
    print(f"  Optimal Threshold (Youden's J):  {optimal_threshold:.4f}")
    print(f"  XGBoost raw AUC:                 {xgb_auc:.4f}")
    print(f"  LR Scorecard AUC:                {auc_val:.4f}")
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
    print("\n  Cross-Validation — 5-Fold XGBoost+LR Pipeline...")
    cv_outer = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=RANDOM_STATE + 100)
    cv_aucs = []
    fold_metrics_list = []

    for of, (otr, oval) in enumerate(cv_outer.split(X, y)):
        X_cv_tr_raw, X_cv_val_raw = X[otr], X[oval]
        y_cv_tr, y_cv_val = y[otr], y[oval]

        cv_sc, X_cv_tr = create_per_feature_scalers(X_cv_tr_raw, FEATURE_NAMES)
        X_cv_val = apply_per_feature_scalers(X_cv_val_raw, cv_sc, FEATURE_NAMES)
        cv_spw = (len(y_cv_tr) - y_cv_tr.sum()) / y_cv_tr.sum()

        # XGBoost
        cv_xgb = xgb.XGBClassifier(
            n_estimators=800, max_depth=6, learning_rate=0.01,
            scale_pos_weight=cv_spw, random_state=RANDOM_STATE,
            eval_metric="auc", early_stopping_rounds=50,
            tree_method="hist", n_jobs=-1, max_bin=1024,
        )
        cv_xgb.fit(X_cv_tr, y_cv_tr, eval_set=[(X_cv_val, y_cv_val)], verbose=False)

        # Leaf extraction + OHE
        lf_tr = cv_xgb.apply(X_cv_tr)
        lf_val = cv_xgb.apply(X_cv_val)
        cv_enc = OneHotEncoder(sparse_output=True, handle_unknown='ignore', dtype=np.float32)
        Ltr = cv_enc.fit_transform(lf_tr)
        Lval = cv_enc.transform(lf_val)
        Xlr_tr = sp.hstack([Ltr, sp.csr_matrix(X_cv_tr.astype(np.float32))], format='csr')
        Xlr_val = sp.hstack([Lval, sp.csr_matrix(X_cv_val.astype(np.float32))], format='csr')

        # LR
        cv_lr = LogisticRegression(C=1.0, penalty='l2', class_weight='balanced',
                                    max_iter=200, solver='saga', random_state=RANDOM_STATE, tol=1e-4)
        cv_lr.fit(Xlr_tr, y_cv_tr)
        cv_prob = cv_lr.predict_proba(Xlr_val)[:, 1]

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
        print(f"    Fold {of+1}: AUC = {fold_auc:.4f} ({cv_xgb.best_iteration+1} trees)")

    cv_mean = np.mean(cv_aucs); cv_std = np.std(cv_aucs)
    print(f"\n  >>> CV AUC: {cv_mean:.4f} +/- {cv_std:.4f}")

    # ── 8. Save ──
    print("\n[8/9] Saving artifacts...")
    os.makedirs(MODEL_DIR, exist_ok=True)

    xgb_model.save_model(os.path.join(MODEL_DIR, "xgb_pd_model.json"))
    joblib.dump(lr_model, os.path.join(MODEL_DIR, "lr_scorecard_model.joblib"))
    joblib.dump(leaf_enc, os.path.join(MODEL_DIR, "leaf_encoder.joblib"))
    joblib.dump(scalers, os.path.join(MODEL_DIR, "per_feature_scalers.joblib"))

    metadata = {
        "model_type": "xgboost_lr_scorecard",
        "architecture": "XGBoost(leaf_indices) -> OneHotEncode -> LR(PD) -> Scorecard(Score)",
        "scorecard": {
            "base_score": BASE_SCORE,
            "pdo": PDO,
            "base_odds": BASE_ODDS,
            "factor": round(FACTOR, 4),
            "offset": round(OFFSET, 4),
        },
        "feature_names": FEATURE_NAMES,
        "n_features": len(FEATURE_NAMES),
        "n_leaf_features": n_leaf_features,
        "n_trees": n_trees,
        "xgb_max_depth": 6,
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
        "lr_feature_coefficients": {fn: round(float(lr_coef_original[i]), 6) for i, fn in enumerate(FEATURE_NAMES)},
        "cv_auc_mean": round(cv_mean, 4),
        "cv_auc_std": round(cv_std, 4),
        "cv_aucs": [round(a, 4) for a in cv_aucs],
        "usd_to_vnd": USD_TO_VND,
        "scaling": "smart_per_feature",
        "scaling_strategies": {fn: FEATURE_SCALING_CONFIG[fn] for fn in FEATURE_NAMES},
        "train_size": len(y_train),
        "test_size": len(y_test),
        "purpose_map": PURPOSE_MAP,
    }
    with open(os.path.join(MODEL_DIR, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    print(f"\n  Models saved to: {MODEL_DIR}")
    for fn in sorted(os.listdir(MODEL_DIR)):
        sz = os.path.getsize(os.path.join(MODEL_DIR, fn)) / 1024
        print(f"    {fn} ({sz:.0f} KB)")

    # ── 9. Charts ──
    print("\n" + "=" * 70)
    print("  [9/9] XUAT 20 BIEU DO DANH GIA")
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
        lr_coef_original=lr_coef_original,
        cv_aucs=cv_aucs,
        fold_metrics=fold_metrics_list,
        X_test_scaled=X_test,
        chart_dir=CHART_DIR,
    )

    elapsed = time.time() - t_start
    print("\n" + "=" * 70)
    print(f"  >>> TRAINING COMPLETE — {elapsed/60:.1f} min ({elapsed:.0f}s)")
    print(f"  Architecture: XGBoost ({n_trees} trees) + LR Scorecard")
    print(f"  Scorecard: Base={BASE_SCORE}, PDO={PDO}")
    print(f"  Score Range: {scores_test.min():.0f} — {scores_test.max():.0f}")
    print(f"  Models: {MODEL_DIR}")
    print(f"  Charts: {CHART_DIR}")
    print("=" * 70)

    return {
        'models': (xgb_model, lr_model, leaf_enc),
        'scalers': scalers,
        'metadata': metadata,
    }


# ═════════════════════════════════════════════════════════════
#  SCORER — Inference (dung sau khi train xong)
# ═════════════════════════════════════════════════════════════
class CreditScorer:
    """
    XGBoost + LR Scorecard scorer.
    Load models tu MODEL_DIR, predict PD + Credit Score tu VND features.
    """
    def __init__(self, model_dir=MODEL_DIR):
        self.model_dir = model_dir
        self.xgb_model = xgb.XGBClassifier()
        self.xgb_model.load_model(os.path.join(model_dir, "xgb_pd_model.json"))
        self.lr_model = joblib.load(os.path.join(model_dir, "lr_scorecard_model.joblib"))
        self.leaf_enc = joblib.load(os.path.join(model_dir, "leaf_encoder.joblib"))
        self.scalers = joblib.load(os.path.join(model_dir, "per_feature_scalers.joblib"))
        with open(os.path.join(model_dir, "metadata.json"), "r") as f:
            self.metadata = json.load(f)

    def predict(self, features: dict) -> dict:
        f = self._process(features)
        X_raw = np.array([[f[n] for n in FEATURE_NAMES]])

        # Smart per-feature scale
        X = apply_per_feature_scalers(X_raw, self.scalers, FEATURE_NAMES)

        # Stage 1: XGBoost → leaf indices
        leaves = self.xgb_model.apply(X)
        L = self.leaf_enc.transform(leaves)

        # Stage 2: LR → PD
        X_lr = sp.hstack([L, sp.csr_matrix(X.astype(np.float32))], format='csr')
        pd_val = float(self.lr_model.predict_proba(X_lr)[0, 1])

        # Stage 3: Scorecard formula → Credit Score
        credit_score = float(pd_to_score(np.array([pd_val]))[0])

        return {
            "ai_risk_score": int(round(min(max(pd_val, 0), 1) * 100)),
            "default_probability": round(pd_val, 4),
            "credit_score": int(round(credit_score)),
            "status": "success",
        }

    def _process(self, raw):
        f = {}
        f["credit_score"] = min(max(float(raw.get("credit_score", 450)), 150), 750)
        f["capital"] = float(raw.get("capital", 0))
        f["monthly_income"] = float(raw.get("monthly_income", 0))
        f["monthly_pay"] = float(raw.get("monthly_pay", 0))
        f["revolving_balance"] = float(raw.get("revolving_balance", 0))
        f["dti"] = min(max(float(raw.get("dti", 0)), 0), 100)
        f["revolving_util_percent"] = min(max(float(raw.get("revolving_util_percent", 50)), 0), 150)
        f["term_months"] = float(raw.get("term_months", raw.get("periodMonth", 36)))
        f["emp_length_years"] = float(raw.get("emp_length_years", 5))
        f["active_bad_debts"] = float(raw.get("active_bad_debts", 0))
        f["bankruptcies"] = float(raw.get("bankruptcies", 0))
        f["active_loans"] = min(max(float(raw.get("active_loans", 0)), 0), 50)
        f["total_loans_history"] = float(raw.get("total_loans_history", 0))
        home = str(raw.get("home_ownership", "RENT")).upper()
        f["home_ownership_enc"] = HOME_MAP.get(home, 3)
        purpose = str(raw.get("loan_purpose", raw.get("purpose", "other"))).lower()
        f["purpose_enc"] = PURPOSE_MAP.get(purpose, 3)
        return f


# ═════════════════════════════════════════════════════════════
#  RUN
# ═════════════════════════════════════════════════════════════
if __name__ == "__main__":
    result = train_model()
