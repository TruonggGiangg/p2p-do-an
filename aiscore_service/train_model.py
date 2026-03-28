"""
╔══════════════════════════════════════════════════════════════════════════╗
║  AIScore — HYBRID STACKING MEGA PIPELINE (Google Colab Edition)        ║
║  Train + Evaluate + Score + 20 Charts — ALL IN ONE FILE                ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  KIEN TRUC HYBRID 2 TANG (Stacking with OOF):                         ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                         ║
║                                                                        ║
║  Level 1 — 5 Base Learners (OOF 5-Fold, chong Data Leakage):          ║
║    1. XGBoost            "Chien binh toan dien"                        ║
║    2. LightGBM           "Tien dao sat thu"                            ║
║    3. CatBoost           "Phao dai bat kha xam pham"                   ║
║    4. ExtraTrees         "Biet doi ngau nhien"                         ║
║    5. GradientBoosting   "Ky su chinh xac"                             ║
║                                                                        ║
║  Level 2 — Meta-Learner:                                               ║
║    LogisticRegression nhan OOF cua 5 model + 15 original features      ║
║    => HYBRID FINAL PD (Default Probability)                            ║
║                                                                        ║
║  CHUAN HOA: Moi feature co 1 StandardScaler rieng (15 scalers)        ║
║                                                                        ║
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

# CatBoost co the chua co san tren Colab
try:
    import catboost
except ImportError:
    install("catboost")
    import catboost

import os
import warnings
import time
import numpy as np
import pandas as pd
import xgboost as xgb
import lightgbm as lgb
from catboost import CatBoostClassifier
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import seaborn as sns
from sklearn.ensemble import (
    RandomForestClassifier,
    ExtraTreesClassifier,
    GradientBoostingClassifier,
)
from sklearn.linear_model import LogisticRegression
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
from sklearn.preprocessing import StandardScaler
from sklearn.calibration import calibration_curve
from sklearn.inspection import permutation_importance
import joblib
import json
from scipy import stats as scipy_stats

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

print("[config] All models: CPU mode (n_jobs=-1 for parallelism)")
print("[config] Meta-Learner: LogisticRegression (L2, balanced)")

# Model colors (consistent across all charts)
COLORS = {
    'xgb':     '#2196F3',  # Blue
    'lgbm':    '#4CAF50',  # Green
    'cat':     '#9C27B0',  # Purple
    'et':      '#FF5722',  # Deep Orange
    'gb':      '#00BCD4',  # Cyan
    'rf_meta': '#FF9800',  # Orange
    'hybrid':  '#E91E63',  # Pink
}
MODEL_LABELS = {
    'xgb':     'XGBoost',
    'lgbm':    'LightGBM',
    'cat':     'CatBoost',
    'et':      'ExtraTrees',
    'gb':      'GradientBoosting',
    'rf_meta': 'LR Meta (L2)',
    'hybrid':  'HYBRID FINAL',
}


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
            req = urllib.request.Request(url, headers={"User-Agent": "aiscore-service/3.0"})
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


# ===================== PER-FEATURE SCALING =====================
def create_per_feature_scalers(X_train_raw, feature_names):
    """Tao 1 StandardScaler rieng cho MOI feature."""
    scalers = {}
    X_scaled = np.zeros_like(X_train_raw, dtype=np.float64)
    for i, fname in enumerate(feature_names):
        sc = StandardScaler()
        X_scaled[:, i] = sc.fit_transform(X_train_raw[:, i].reshape(-1, 1)).ravel()
        scalers[fname] = sc
    return scalers, X_scaled

def apply_per_feature_scalers(X_raw, scalers, feature_names):
    """Transform du lieu bang cac scaler da fit."""
    X_scaled = np.zeros_like(X_raw, dtype=np.float64)
    for i, fname in enumerate(feature_names):
        X_scaled[:, i] = scalers[fname].transform(X_raw[:, i].reshape(-1, 1)).ravel()
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
    y_test, y_prob_hybrid, y_pred_hybrid, optimal_threshold,
    level1_test_probs,   # dict: {'xgb': arr, 'lgbm': arr, 'cat': arr, 'et': arr, 'gb': arr}
    rf_meta_prob_test,
    oof_probs,           # dict: {'xgb': arr, 'lgbm': arr, 'cat': arr, 'et': arr, 'gb': arr}
    y_train,
    feature_importances, # dict: {'xgb': arr, 'lgbm': arr}
    feature_names,
    cv_aucs, fold_metrics,
    X_test_scaled, X_train_scaled,
    chart_dir,
):
    os.makedirs(chart_dir, exist_ok=True)
    try:
        plt.style.use('seaborn-v0_8-darkgrid')
    except Exception:
        plt.style.use('ggplot')

    print("\n  Dang xuat 20 bieu do...")

    # Helper: all model probs for test set
    all_model_probs = {**level1_test_probs, 'rf_meta': rf_meta_prob_test, 'hybrid': y_prob_hybrid}

    # ─── 1. ROC Curve — ALL Models ───
    print("    [1/20] ROC Curve (All Models)...")
    fig, ax = plt.subplots(figsize=(11, 9))
    for key in ['xgb', 'lgbm', 'cat', 'et', 'gb', 'rf_meta', 'hybrid']:
        probs = all_model_probs[key]
        fpr, tpr, _ = roc_curve(y_test, probs)
        auc_val = roc_auc_score(y_test, probs)
        lw = 3.5 if key == 'hybrid' else (2 if key == 'rf_meta' else 1.3)
        ls = '-' if key in ('hybrid', 'rf_meta') else '--'
        ax.plot(fpr, tpr, label=f"{MODEL_LABELS[key]} (AUC={auc_val:.4f})",
                linewidth=lw, color=COLORS[key], linestyle=ls)
    ax.plot([0, 1], [0, 1], 'k:', alpha=0.4, label='Random (0.5)')
    ax.set_xlabel('False Positive Rate', fontsize=13)
    ax.set_ylabel('True Positive Rate', fontsize=13)
    ax.set_title('ROC Curve — 5 Base Learners + Meta-Learner + Hybrid', fontsize=15, fontweight='bold')
    ax.legend(fontsize=10, loc='lower right')
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '01_roc_curve_all_models.png'), dpi=200)
    plt.close(fig)

    # ─── 2. Precision-Recall Curve ───
    print("    [2/20] Precision-Recall Curve...")
    fig, ax = plt.subplots(figsize=(11, 9))
    for key in ['xgb', 'lgbm', 'cat', 'et', 'gb', 'rf_meta', 'hybrid']:
        probs = all_model_probs[key]
        prec_c, rec_c, _ = precision_recall_curve(y_test, probs)
        ap = average_precision_score(y_test, probs)
        lw = 3.5 if key == 'hybrid' else 1.3
        ax.plot(rec_c, prec_c, label=f"{MODEL_LABELS[key]} (AP={ap:.4f})",
                linewidth=lw, color=COLORS[key])
    ax.axhline(y=y_test.mean(), color='gray', linestyle=':', alpha=0.5, label=f'Baseline={y_test.mean():.3f}')
    ax.set_xlabel('Recall', fontsize=13)
    ax.set_ylabel('Precision', fontsize=13)
    ax.set_title('Precision-Recall Curve — All Models', fontsize=15, fontweight='bold')
    ax.legend(fontsize=10, loc='upper right')
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '02_precision_recall_curve.png'), dpi=200)
    plt.close(fig)

    # ─── 3. Confusion Matrix (Counts + Normalized) ───
    print("    [3/20] Confusion Matrix...")
    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
    cm = confusion_matrix(y_test, y_pred_hybrid)
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=axes[0],
                xticklabels=["Paid (0)", "Default (1)"],
                yticklabels=["Paid (0)", "Default (1)"])
    axes[0].set_title('Confusion Matrix (Counts)', fontsize=14, fontweight='bold')
    axes[0].set_xlabel('Predicted'); axes[0].set_ylabel('Actual')
    cm_norm = cm.astype(float) / cm.sum(axis=1, keepdims=True)
    sns.heatmap(cm_norm, annot=True, fmt='.2%', cmap='Oranges', ax=axes[1],
                xticklabels=["Paid (0)", "Default (1)"],
                yticklabels=["Paid (0)", "Default (1)"])
    axes[1].set_title('Confusion Matrix (Normalized)', fontsize=14, fontweight='bold')
    axes[1].set_xlabel('Predicted'); axes[1].set_ylabel('Actual')
    fig.suptitle('Hybrid Model — Confusion Matrix', fontsize=16, fontweight='bold', y=1.02)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '03_confusion_matrix.png'), dpi=200, bbox_inches='tight')
    plt.close(fig)

    # ─── 4. Feature Importance XGBoost vs LightGBM ───
    print("    [4/20] Feature Importance (XGBoost vs LightGBM)...")
    fig, axes = plt.subplots(1, 2, figsize=(20, 10))
    for ax_i, (key, title) in enumerate([('xgb', 'XGBoost'), ('lgbm', 'LightGBM')]):
        imp = feature_importances[key]
        sorted_idx = np.argsort(imp)
        axes[ax_i].barh(range(len(sorted_idx)), imp[sorted_idx], color=COLORS[key], alpha=0.85)
        axes[ax_i].set_yticks(range(len(sorted_idx)))
        axes[ax_i].set_yticklabels([feature_names[i] for i in sorted_idx], fontsize=11)
        axes[ax_i].set_title(f'{title} Feature Importance (Avg OOF folds)', fontsize=14, fontweight='bold')
        axes[ax_i].set_xlabel('Importance')
    fig.suptitle('Level 1 — Feature Importance', fontsize=16, fontweight='bold', y=1.01)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '04_feature_importance.png'), dpi=200, bbox_inches='tight')
    plt.close(fig)

    # ─── 5. PD Distribution — All Models (2x3) ───
    print("    [5/20] PD Distribution (All Models)...")
    fig, axes = plt.subplots(2, 3, figsize=(20, 12))
    plot_keys = ['xgb', 'lgbm', 'cat', 'et', 'gb', 'hybrid']
    for ax, key in zip(axes.flat, plot_keys):
        probs = all_model_probs[key]
        ax.hist(probs[y_test == 0], bins=50, alpha=0.6, label='Paid', color='green', density=True)
        ax.hist(probs[y_test == 1], bins=50, alpha=0.6, label='Default', color='red', density=True)
        ax.set_title(f'{MODEL_LABELS[key]}', fontsize=13, fontweight='bold')
        ax.set_xlabel('PD')
        ax.legend(fontsize=9)
        ax.grid(True, alpha=0.3)
    fig.suptitle('Phan phoi xac suat vo no — Paid vs Default (6 models)', fontsize=16, fontweight='bold')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '05_pd_distribution_all.png'), dpi=200)
    plt.close(fig)

    # ─── 6. Calibration Curve ───
    print("    [6/20] Calibration Curve...")
    fig, ax = plt.subplots(figsize=(10, 8))
    ax.plot([0, 1], [0, 1], 'k--', alpha=0.4, label='Perfect')
    for key in ['xgb', 'lgbm', 'cat', 'et', 'gb', 'hybrid']:
        probs = all_model_probs[key]
        frac, mean_p = calibration_curve(y_test, probs, n_bins=10, strategy='uniform')
        lw = 3 if key == 'hybrid' else 1.3
        ax.plot(mean_p, frac, 's-', label=MODEL_LABELS[key], linewidth=lw, color=COLORS[key], markersize=5)
    ax.set_xlabel('Mean Predicted Probability', fontsize=13)
    ax.set_ylabel('Fraction of Positives', fontsize=13)
    ax.set_title('Calibration Curve — Mo hinh du doan co chinh xac?', fontsize=15, fontweight='bold')
    ax.legend(fontsize=10); ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '06_calibration_curve.png'), dpi=200)
    plt.close(fig)

    # ─── 7. CV AUC per Fold ───
    print("    [7/20] CV AUC per Fold...")
    fig, ax = plt.subplots(figsize=(10, 6))
    fl = [f'Fold {i+1}' for i in range(len(cv_aucs))]
    bars = ax.bar(fl, cv_aucs, color=COLORS['hybrid'], alpha=0.85, edgecolor='black')
    ax.axhline(y=np.mean(cv_aucs), color='red', linestyle='--', linewidth=2,
               label=f'Mean={np.mean(cv_aucs):.4f} +/- {np.std(cv_aucs):.4f}')
    for b, v in zip(bars, cv_aucs):
        ax.text(b.get_x() + b.get_width()/2, b.get_height() + 0.001,
                f'{v:.4f}', ha='center', fontweight='bold', fontsize=11)
    ax.set_ylabel('AUC-ROC'); ax.legend(fontsize=12)
    ax.set_title(f'CV AUC — {N_FOLDS}-Fold Nested Hybrid Stacking', fontsize=15, fontweight='bold')
    ax.set_ylim(min(cv_aucs) - 0.02, max(cv_aucs) + 0.02)
    ax.grid(True, alpha=0.3, axis='y')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '07_cv_auc_per_fold.png'), dpi=200)
    plt.close(fig)

    # ─── 8. Threshold Sensitivity ───
    print("    [8/20] Threshold Sensitivity...")
    fig, ax = plt.subplots(figsize=(12, 7))
    thresholds = np.arange(0.05, 0.96, 0.01)
    precs_t, recs_t, f1s_t, accs_t, specs_t = [], [], [], [], []
    for t in thresholds:
        yt = (y_prob_hybrid >= t).astype(int)
        precs_t.append(precision_score(y_test, yt, zero_division=0))
        recs_t.append(recall_score(y_test, yt, zero_division=0))
        f1s_t.append(f1_score(y_test, yt, zero_division=0))
        accs_t.append(accuracy_score(y_test, yt))
        tn = ((yt == 0) & (y_test == 0)).sum()
        fp = ((yt == 1) & (y_test == 0)).sum()
        specs_t.append(tn / (tn + fp) if (tn + fp) > 0 else 0)
    ax.plot(thresholds, precs_t, label='Precision', lw=2, color='blue')
    ax.plot(thresholds, recs_t, label='Recall', lw=2, color='green')
    ax.plot(thresholds, f1s_t, label='F1', lw=2.5, color='red')
    ax.plot(thresholds, accs_t, label='Accuracy', lw=1.5, color='purple', ls='--')
    ax.plot(thresholds, specs_t, label='Specificity', lw=1.5, color='orange', ls='--')
    bf1 = np.argmax(f1s_t)
    ax.axvline(x=thresholds[bf1], color='red', ls=':', alpha=0.7,
               label=f'Best F1 @ {thresholds[bf1]:.2f}')
    ax.axvline(x=optimal_threshold, color='black', ls=':', alpha=0.7,
               label=f"Youden's J @ {optimal_threshold:.2f}")
    ax.set_xlabel('Threshold'); ax.set_ylabel('Score')
    ax.set_title('Threshold Sensitivity — Prec/Rec/F1/Acc/Spec', fontsize=15, fontweight='bold')
    ax.legend(fontsize=10); ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '08_threshold_sensitivity.png'), dpi=200)
    plt.close(fig)

    # ─── 9. OOF Correlation Heatmap ───
    print("    [9/20] OOF Correlation Heatmap...")
    fig, ax = plt.subplots(figsize=(10, 8))
    oof_df = pd.DataFrame({
        'XGBoost OOF': oof_probs['xgb'],
        'LightGBM OOF': oof_probs['lgbm'],
        'CatBoost OOF': oof_probs['cat'],
        'ExtraTrees OOF': oof_probs['et'],
        'GradBoosting OOF': oof_probs['gb'],
        'True Label': y_train.astype(float),
    })
    sns.heatmap(oof_df.corr(), annot=True, fmt='.3f', cmap='coolwarm', ax=ax,
                vmin=-1, vmax=1, linewidths=0.5)
    ax.set_title('OOF Predictions Correlation — 5 Base Learners', fontsize=14, fontweight='bold')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '09_oof_correlation.png'), dpi=200)
    plt.close(fig)

    # ─── 10. Model Comparison Grouped Bar ───
    print("    [10/20] Model Comparison Bar Chart...")
    fig, ax = plt.subplots(figsize=(16, 8))
    mk = ['xgb', 'lgbm', 'cat', 'et', 'gb', 'rf_meta', 'hybrid']
    mn = [MODEL_LABELS[k] for k in mk]
    met_names = ['AUC', 'Accuracy', 'Precision', 'Recall', 'F1']
    x_pos = np.arange(len(mn))
    width = 0.15
    for mi, mname in enumerate(met_names):
        vals = []
        for k in mk:
            pr = all_model_probs[k]
            pd_i = (pr >= optimal_threshold).astype(int)
            if mname == 'AUC':     vals.append(roc_auc_score(y_test, pr))
            elif mname == 'Accuracy':  vals.append(accuracy_score(y_test, pd_i))
            elif mname == 'Precision': vals.append(precision_score(y_test, pd_i, zero_division=0))
            elif mname == 'Recall':    vals.append(recall_score(y_test, pd_i, zero_division=0))
            elif mname == 'F1':        vals.append(f1_score(y_test, pd_i, zero_division=0))
        offset = (mi - 2) * width
        bars = ax.bar(x_pos + offset, vals, width, label=mname, alpha=0.85)
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width()/2, b.get_height() + 0.003,
                    f'{v:.3f}', ha='center', fontsize=7, fontweight='bold')
    ax.set_xticks(x_pos)
    ax.set_xticklabels(mn, fontsize=10, rotation=15)
    ax.set_ylabel('Score'); ax.legend(fontsize=9, loc='lower right')
    ax.set_title('So sanh hieu nang — 7 Models x 5 Metrics', fontsize=15, fontweight='bold')
    ax.set_ylim(0, 1.12); ax.grid(True, alpha=0.3, axis='y')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '10_model_comparison_bar.png'), dpi=200)
    plt.close(fig)

    # ─── 11. Cumulative Gain + Lift ───
    print("    [11/20] Cumulative Gain & Lift...")
    fig, axes = plt.subplots(1, 2, figsize=(18, 7))
    si = np.argsort(-y_prob_hybrid)
    sl = y_test[si]
    cd = np.cumsum(sl); td = y_test.sum()
    pp = np.arange(1, len(y_test) + 1) / len(y_test)
    pdc = cd / td
    axes[0].plot(pp, pdc, color=COLORS['hybrid'], lw=2.5, label='Hybrid')
    axes[0].plot([0, 1], [0, 1], 'k--', alpha=0.4, label='Random')
    axes[0].fill_between(pp, pdc, pp, alpha=0.12, color=COLORS['hybrid'])
    axes[0].set_xlabel('% Population'); axes[0].set_ylabel('% Defaults Captured')
    axes[0].set_title('Cumulative Gain Chart', fontsize=14, fontweight='bold')
    axes[0].legend(); axes[0].grid(True, alpha=0.3)
    lift = pdc / pp
    axes[1].plot(pp, lift, color=COLORS['hybrid'], lw=2.5, label='Hybrid')
    axes[1].axhline(y=1, color='k', ls='--', alpha=0.4, label='Random')
    axes[1].set_xlabel('% Population'); axes[1].set_ylabel('Lift')
    axes[1].set_title('Lift Curve', fontsize=14, fontweight='bold')
    axes[1].legend(); axes[1].grid(True, alpha=0.3)
    fig.suptitle('Hybrid — Gain & Lift', fontsize=16, fontweight='bold')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '11_gain_lift_curve.png'), dpi=200)
    plt.close(fig)

    # ─── 12. KS Statistic ───
    print("    [12/20] KS Statistic...")
    fig, ax = plt.subplots(figsize=(10, 7))
    fpr_ks, tpr_ks, th_ks = roc_curve(y_test, y_prob_hybrid)
    ks = np.max(tpr_ks - fpr_ks); ki = np.argmax(tpr_ks - fpr_ks)
    ax.plot(th_ks, tpr_ks, label='TPR', color='green', lw=2)
    ax.plot(th_ks, fpr_ks, label='FPR', color='red', lw=2)
    ax.fill_between(th_ks, tpr_ks, fpr_ks, alpha=0.12, color='blue')
    ax.axvline(x=th_ks[ki], color='blue', ls=':', lw=2,
               label=f'KS={ks:.4f} @ {th_ks[ki]:.3f}')
    ax.set_xlabel('Threshold'); ax.set_ylabel('Rate')
    ax.set_title('KS Statistic — Kha nang phan biet Default vs Paid', fontsize=15, fontweight='bold')
    ax.legend(); ax.set_xlim(0, 1); ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '12_ks_statistic.png'), dpi=200)
    plt.close(fig)

    # ─── 13. Stacking Architecture Diagram ───
    print("    [13/20] Stacking Architecture Diagram...")
    fig, ax = plt.subplots(figsize=(18, 12))
    ax.set_xlim(0, 12); ax.set_ylim(0, 12); ax.axis('off')
    ax.text(6, 11.5, 'HYBRID STACKING ARCHITECTURE — 5 Base Learners', fontsize=22, fontweight='bold',
            ha='center', color=COLORS['hybrid'])
    ax.text(6, 10.9, 'OOF (Out-Of-Fold) — Chong Data Leakage hoan toan', fontsize=13,
            ha='center', color='gray', style='italic')

    bd = dict(boxstyle="round,pad=0.4", alpha=0.25, linewidth=2)
    # Data
    ax.text(6, 10.0, 'Original 15 Features\n+ Per-Feature Scaling (15 scalers)',
            fontsize=12, ha='center', bbox=dict(**bd, facecolor='#E1F5FE', edgecolor='#0277BD'))
    # Level 1
    ax.text(0.5, 9.2, 'LEVEL 1 (5 Base Learners — OOF)', fontsize=14, fontweight='bold', color='#333')
    l1_models = [
        (1.5, 'XGBoost\n"Chien binh\ntoan dien"', COLORS['xgb']),
        (3.8, 'LightGBM\n"Tien dao\nsat thu"', COLORS['lgbm']),
        (6.0, 'CatBoost\n"Phao dai\nbat kha xam\npham"', COLORS['cat']),
        (8.2, 'ExtraTrees\n"Biet doi\nngau nhien"', COLORS['et']),
        (10.5, 'GradBoost\n"Ky su\nchinh xac"', COLORS['gb']),
    ]
    for x, txt, c in l1_models:
        ax.text(x, 7.7, txt, fontsize=10, ha='center',
                bbox=dict(**bd, facecolor=c, edgecolor=c))
        ax.annotate('', xy=(x, 7.0), xytext=(x, 9.3),
                    arrowprops=dict(arrowstyle='->', color='gray', lw=1.5))

    # OOF
    ax.text(6, 6.2, 'OOF Predictions (5 gia tri)\n+ 15 Original Features = 20 meta features',
            fontsize=12, ha='center', color='#D32F2F', fontweight='bold')
    for x, _, c in l1_models:
        ax.annotate('', xy=(6, 5.6), xytext=(x, 6.8),
                    arrowprops=dict(arrowstyle='->', color='red', lw=1.5, linestyle='dashed'))

    # Level 2
    ax.text(0.5, 4.8, 'LEVEL 2 (Meta-Learner)', fontsize=14, fontweight='bold', color='#333')
    ax.text(6, 4.0, 'LogisticRegression Meta-Learner\nInput: 5 OOF + 15 features = 20 dims',
            fontsize=12, ha='center',
            bbox=dict(**bd, facecolor=COLORS['rf_meta'], edgecolor=COLORS['rf_meta']))
    ax.annotate('', xy=(6, 3.2), xytext=(6, 5.4),
                arrowprops=dict(arrowstyle='->', color='gray', lw=2))

    # Final
    ax.annotate('', xy=(6, 1.8), xytext=(6, 3.0),
                arrowprops=dict(arrowstyle='->', color=COLORS['hybrid'], lw=3))
    ax.text(6, 1.2, 'HYBRID FINAL PD\nDefault Probability (0.0 -> 1.0)',
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
        dfh.loc['Mean'] = dfh.mean()
        dfh.loc['Std'] = dfh.iloc[:-1].std()
        sns.heatmap(dfh, annot=True, fmt='.4f', cmap='YlOrRd', ax=ax, linewidths=0.5)
        ax.set_title('CV Metrics — Per Fold Heatmap', fontsize=15, fontweight='bold')
        fig.tight_layout()
        fig.savefig(os.path.join(chart_dir, '14_cv_fold_heatmap.png'), dpi=200)
        plt.close(fig)

    # ─── 15. Risk Band Distribution ───
    print("    [15/20] Risk Band Distribution...")
    fig, ax = plt.subplots(figsize=(13, 7))
    rs = (y_prob_hybrid * 100).astype(int).clip(0, 100)
    bins = [0, 10, 25, 40, 60, 100]
    labels_r = ['0-10\nRat thap', '11-25\nThap', '26-40\nTrung binh', '41-60\nCao', '61-100\nRat cao']
    rb = pd.cut(rs, bins=bins, labels=labels_r, include_lowest=True)
    rdf = pd.DataFrame({'band': rb, 'default': y_test})
    bs = rdf.groupby('band', observed=False).agg(n=('default', 'count'), d=('default', 'sum'), dr=('default', 'mean')).reset_index()
    bc = ['#4CAF50', '#8BC34A', '#FFC107', '#FF9800', '#F44336']
    ax.bar(range(len(bs)), bs['n'], color=bc, alpha=0.7, edgecolor='black', label='Total')
    ax.bar(range(len(bs)), bs['d'], color='red', alpha=0.4, edgecolor='darkred', label='Defaults')
    ax2 = ax.twinx()
    ax2.plot(range(len(bs)), bs['dr'] * 100, 'ko-', lw=2.5, ms=10, label='Default Rate %')
    for i, (n, d, dr) in enumerate(zip(bs['n'], bs['d'], bs['dr'])):
        ax.text(i, n + 20, f'n={n}', ha='center', fontsize=10, fontweight='bold')
        ax2.text(i, dr * 100 + 1.5, f'{dr*100:.1f}%', ha='center', fontsize=10, fontweight='bold', color='red')
    ax.set_xticks(range(len(bs))); ax.set_xticklabels(bs['band'], fontsize=11)
    ax.set_xlabel('Risk Band'); ax.set_ylabel('Count'); ax2.set_ylabel('Default Rate (%)', color='red')
    ax.set_title('Risk Band Distribution', fontsize=15, fontweight='bold')
    h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels()
    ax.legend(h1 + h2, l1 + l2, fontsize=10, loc='upper left')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '15_risk_band.png'), dpi=200)
    plt.close(fig)

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
    fig.savefig(os.path.join(chart_dir, '16_feature_correlation.png'), dpi=200)
    plt.close(fig)

    # ─── 17. Boxplot OOF Predictions by Class ───
    print("    [17/20] OOF Boxplot by Class...")
    fig, axes = plt.subplots(1, 5, figsize=(24, 6), sharey=True)
    for ax_i, (key, label) in enumerate([('xgb', 'XGBoost'), ('lgbm', 'LightGBM'),
                                          ('cat', 'CatBoost'), ('et', 'ExtraTrees'), ('gb', 'GradBoost')]):
        data_paid = oof_probs[key][y_train == 0]
        data_def = oof_probs[key][y_train == 1]
        bp = axes[ax_i].boxplot([data_paid, data_def], labels=['Paid', 'Default'],
                                patch_artist=True, widths=0.6)
        bp['boxes'][0].set_facecolor('#4CAF50'); bp['boxes'][0].set_alpha(0.6)
        bp['boxes'][1].set_facecolor('#F44336'); bp['boxes'][1].set_alpha(0.6)
        axes[ax_i].set_title(label, fontsize=13, fontweight='bold', color=COLORS[key])
        axes[ax_i].grid(True, alpha=0.3)
    fig.suptitle('OOF Predictions Distribution — Paid vs Default', fontsize=16, fontweight='bold')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '17_oof_boxplot.png'), dpi=200)
    plt.close(fig)

    # ─── 18. Radar Chart — All Models ───
    print("    [18/20] Radar Chart (All Models)...")
    radar_metrics = ['AUC', 'Accuracy', 'Precision', 'Recall', 'F1', 'Specificity']
    radar_keys = ['xgb', 'lgbm', 'cat', 'et', 'gb', 'hybrid']
    angles = np.linspace(0, 2 * np.pi, len(radar_metrics), endpoint=False).tolist()
    angles += angles[:1]  # close

    fig, ax = plt.subplots(figsize=(10, 10), subplot_kw=dict(polar=True))
    for key in radar_keys:
        pr = all_model_probs[key]
        pd_i = (pr >= optimal_threshold).astype(int)
        tn = ((pd_i == 0) & (y_test == 0)).sum(); fp = ((pd_i == 1) & (y_test == 0)).sum()
        spec = tn / (tn + fp) if (tn + fp) > 0 else 0
        vals = [
            roc_auc_score(y_test, pr),
            accuracy_score(y_test, pd_i),
            precision_score(y_test, pd_i, zero_division=0),
            recall_score(y_test, pd_i, zero_division=0),
            f1_score(y_test, pd_i, zero_division=0),
            spec,
        ]
        vals += vals[:1]
        lw = 3 if key == 'hybrid' else 1.5
        ax.plot(angles, vals, 'o-', linewidth=lw, label=MODEL_LABELS[key], color=COLORS[key], markersize=4)
        if key == 'hybrid':
            ax.fill(angles, vals, alpha=0.1, color=COLORS[key])
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(radar_metrics, fontsize=12)
    ax.set_ylim(0, 1)
    ax.set_title('Radar Chart — All Models Performance', fontsize=15, fontweight='bold', pad=20)
    ax.legend(loc='upper right', bbox_to_anchor=(1.3, 1.1), fontsize=10)
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '18_radar_chart.png'), dpi=200, bbox_inches='tight')
    plt.close(fig)

    # ─── 19. Error Analysis — FP vs FN ───
    print("    [19/20] Error Analysis (FP vs FN)...")
    fig, axes = plt.subplots(1, 2, figsize=(16, 7))
    fp_mask = (y_pred_hybrid == 1) & (y_test == 0)
    fn_mask = (y_pred_hybrid == 0) & (y_test == 1)
    tp_mask = (y_pred_hybrid == 1) & (y_test == 1)
    tn_mask = (y_pred_hybrid == 0) & (y_test == 0)

    # Prob distribution for each group
    groups = [('TN (Correct Paid)', y_prob_hybrid[tn_mask], '#4CAF50'),
              ('FP (False Alarm)', y_prob_hybrid[fp_mask], '#FF9800'),
              ('FN (Missed Default!)', y_prob_hybrid[fn_mask], '#F44336'),
              ('TP (Caught Default)', y_prob_hybrid[tp_mask], '#2196F3')]
    for name, probs, c in groups:
        if len(probs) > 0:
            axes[0].hist(probs, bins=30, alpha=0.5, label=f'{name} (n={len(probs)})', color=c, density=True)
    axes[0].axvline(x=optimal_threshold, color='black', ls='--', lw=2, label=f'Threshold={optimal_threshold:.3f}')
    axes[0].set_xlabel('Predicted PD'); axes[0].set_ylabel('Density')
    axes[0].set_title('PD Distribution by Prediction Outcome', fontsize=13, fontweight='bold')
    axes[0].legend(fontsize=9)

    # Pie chart
    counts = [tn_mask.sum(), fp_mask.sum(), fn_mask.sum(), tp_mask.sum()]
    labels_pie = ['TN', 'FP', 'FN', 'TP']
    colors_pie = ['#4CAF50', '#FF9800', '#F44336', '#2196F3']
    axes[1].pie(counts, labels=labels_pie, colors=colors_pie, autopct='%1.1f%%',
                startangle=90, textprops={'fontsize': 12, 'fontweight': 'bold'})
    axes[1].set_title('Prediction Outcome Distribution', fontsize=13, fontweight='bold')
    fig.suptitle('Error Analysis — False Positives vs False Negatives', fontsize=16, fontweight='bold')
    fig.tight_layout()
    fig.savefig(os.path.join(chart_dir, '19_error_analysis.png'), dpi=200)
    plt.close(fig)

    # ─── 20. Summary Dashboard ───
    print("    [20/20] Summary Dashboard...")
    fig = plt.figure(figsize=(20, 14))
    gs = fig.add_gridspec(3, 3, hspace=0.35, wspace=0.3)

    # Mini ROC
    ax1 = fig.add_subplot(gs[0, 0])
    for k in ['xgb', 'lgbm', 'hybrid']:
        fpr_m, tpr_m, _ = roc_curve(y_test, all_model_probs[k])
        ax1.plot(fpr_m, tpr_m, color=COLORS[k], lw=2 if k == 'hybrid' else 1,
                 label=f'{MODEL_LABELS[k]} ({roc_auc_score(y_test, all_model_probs[k]):.3f})')
    ax1.plot([0, 1], [0, 1], 'k:', alpha=0.3); ax1.legend(fontsize=8); ax1.set_title('ROC', fontweight='bold')

    # Mini CM
    ax2 = fig.add_subplot(gs[0, 1])
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=ax2,
                xticklabels=['P', 'D'], yticklabels=['P', 'D'])
    ax2.set_title('Confusion Matrix', fontweight='bold')

    # Mini PD dist
    ax3 = fig.add_subplot(gs[0, 2])
    ax3.hist(y_prob_hybrid[y_test == 0], bins=40, alpha=0.6, color='green', density=True, label='Paid')
    ax3.hist(y_prob_hybrid[y_test == 1], bins=40, alpha=0.6, color='red', density=True, label='Default')
    ax3.legend(fontsize=8); ax3.set_title('PD Distribution', fontweight='bold')

    # Metrics table
    ax4 = fig.add_subplot(gs[1, :])
    ax4.axis('off')
    metrics_table = [
        ['Metric', 'XGBoost', 'LightGBM', 'CatBoost', 'ExtraTrees', 'GradBoost', 'LR Meta', 'HYBRID'],
    ]
    for met_name in ['AUC', 'Accuracy', 'Precision', 'Recall', 'F1']:
        row = [met_name]
        for k in ['xgb', 'lgbm', 'cat', 'et', 'gb', 'rf_meta', 'hybrid']:
            pr = all_model_probs[k]
            pd_i = (pr >= optimal_threshold).astype(int)
            if met_name == 'AUC':       row.append(f'{roc_auc_score(y_test, pr):.4f}')
            elif met_name == 'Accuracy': row.append(f'{accuracy_score(y_test, pd_i):.4f}')
            elif met_name == 'Precision': row.append(f'{precision_score(y_test, pd_i, zero_division=0):.4f}')
            elif met_name == 'Recall':    row.append(f'{recall_score(y_test, pd_i, zero_division=0):.4f}')
            elif met_name == 'F1':        row.append(f'{f1_score(y_test, pd_i, zero_division=0):.4f}')
        metrics_table.append(row)

    table = ax4.table(cellText=metrics_table[1:], colLabels=metrics_table[0],
                       cellLoc='center', loc='center')
    table.auto_set_font_size(False); table.set_fontsize(10); table.scale(1.0, 1.8)
    # Color header
    for j in range(len(metrics_table[0])):
        table[0, j].set_facecolor('#E0E0E0')
        table[0, j].set_text_props(fontweight='bold')
    # Highlight HYBRID column
    for i in range(1, len(metrics_table)):
        table[i, 7].set_facecolor('#FCE4EC')
    ax4.set_title('All Models — Performance Table', fontsize=14, fontweight='bold', pad=10)

    # Mini Gain
    ax5 = fig.add_subplot(gs[2, 0])
    ax5.plot(pp, pdc, color=COLORS['hybrid'], lw=2)
    ax5.plot([0, 1], [0, 1], 'k--', alpha=0.3)
    ax5.set_title('Cumulative Gain', fontweight='bold'); ax5.grid(True, alpha=0.2)

    # Mini Calibration
    ax6 = fig.add_subplot(gs[2, 1])
    ax6.plot([0, 1], [0, 1], 'k--', alpha=0.3)
    for k in ['xgb', 'lgbm', 'hybrid']:
        frac_m, mean_m = calibration_curve(y_test, all_model_probs[k], n_bins=8)
        ax6.plot(mean_m, frac_m, 's-', color=COLORS[k], lw=2 if k == 'hybrid' else 1, label=MODEL_LABELS[k], ms=4)
    ax6.legend(fontsize=8); ax6.set_title('Calibration', fontweight='bold')

    # Mini Risk bands
    ax7 = fig.add_subplot(gs[2, 2])
    ax7.bar(range(len(bs)), bs['dr'] * 100, color=bc, alpha=0.8, edgecolor='black')
    ax7.set_xticks(range(len(bs))); ax7.set_xticklabels(['Very Low', 'Low', 'Med', 'High', 'V.High'], fontsize=8)
    ax7.set_ylabel('Default Rate %'); ax7.set_title('Risk Bands', fontweight='bold')

    fig.suptitle('HYBRID STACKING MODEL — SUMMARY DASHBOARD', fontsize=18, fontweight='bold', y=1.01)
    fig.savefig(os.path.join(chart_dir, '20_summary_dashboard.png'), dpi=200, bbox_inches='tight')
    plt.close(fig)

    print(f"\n  >>> Da xuat 20 bieu do tai: {chart_dir}/")


# ═════════════════════════════════════════════════════════════
#  MAIN TRAINING PIPELINE
# ═════════════════════════════════════════════════════════════
def train_model():
    t_start = time.time()
    print("=" * 70)
    print("  AIScore — HYBRID STACKING (5 Base Learners + Meta-Learner)")
    print("  Level 1: XGBoost + LightGBM + CatBoost + ExtraTrees + GradBoost")
    print("  Level 2: LogisticRegression Meta-Learner")
    print("=" * 70)

    # ── 1. Load ──
    print("\n[1/11] Loading data...")
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(f"Khong tim thay: {DATA_PATH}")
    df = load_and_clean_data(DATA_PATH)
    print(f"  Dataset: {len(df):,} samples | Default rate: {df['is_default'].mean():.2%}")

    # ── 2. Split ──
    print("\n[2/11] Train/Test split...")
    X = df[FEATURE_NAMES].values
    y = df["is_default"].values
    X_train_raw, X_test_raw, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )
    print(f"  Train: {len(y_train):,} | Test: {len(y_test):,}")

    # ── 3. Per-feature scaling ──
    print("\n[3/11] Per-Feature Scaling (15 scalers)...")
    scalers, X_train = create_per_feature_scalers(X_train_raw, FEATURE_NAMES)
    X_test = apply_per_feature_scalers(X_test_raw, scalers, FEATURE_NAMES)
    for fn in FEATURE_NAMES:
        sc = scalers[fn]
        print(f"    {fn:30s} -> mean={sc.mean_[0]:.2f}, std={sc.scale_[0]:.2f}")

    n_pos = y_train.sum(); n_neg = len(y_train) - n_pos
    scale_pos_wt = n_neg / n_pos
    print(f"\n  Class: neg={n_neg:,}, pos={n_pos:,}, scale_pos_weight={scale_pos_wt:.2f}")

    # ══════════════════════════════════════════════
    # LEVEL 1: OOF — 5 Base Learners
    # ══════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  LEVEL 1: OOF Predictions — 5 Base Learners")
    print("=" * 70)

    oof_train = {}   # key -> np.array(len(y_train))
    test_preds = {}  # key -> np.array(len(y_test))
    importances = {} # key -> np.array (for tree models)

    cv = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=RANDOM_STATE)

    # ─── 4. XGBoost OOF ───
    print("\n[4/11] XGBoost OOF — 'Chien binh toan dien'...")
    oof_train['xgb'] = np.zeros(len(y_train))
    test_preds['xgb'] = np.zeros(len(y_test))
    xgb_imp_list = []
    for fi, (tr_idx, val_idx) in enumerate(cv.split(X_train, y_train)):
        m = xgb.XGBClassifier(
            n_estimators=1000, max_depth=6, learning_rate=0.02,
            subsample=0.8, colsample_bytree=0.8, min_child_weight=10,
            gamma=0.3, reg_alpha=1.0, reg_lambda=3.0,
            scale_pos_weight=scale_pos_wt, random_state=RANDOM_STATE,
            eval_metric="auc", early_stopping_rounds=50,
            tree_method="hist", n_jobs=-1,
        )
        m.fit(X_train[tr_idx], y_train[tr_idx],
              eval_set=[(X_train[val_idx], y_train[val_idx])], verbose=False)
        oof_train['xgb'][val_idx] = m.predict_proba(X_train[val_idx])[:, 1]
        test_preds['xgb'] += m.predict_proba(X_test)[:, 1] / N_FOLDS
        xgb_imp_list.append(m.feature_importances_)
        print(f"    Fold {fi+1}: AUC={roc_auc_score(y_train[val_idx], oof_train['xgb'][val_idx]):.4f} (iter={m.best_iteration})")
    importances['xgb'] = np.mean(xgb_imp_list, axis=0)
    print(f"  >>> XGBoost OOF AUC: {roc_auc_score(y_train, oof_train['xgb']):.4f}")

    # ─── 5. LightGBM OOF ───
    print("\n[5/11] LightGBM OOF — 'Tien dao sat thu'...")
    oof_train['lgbm'] = np.zeros(len(y_train))
    test_preds['lgbm'] = np.zeros(len(y_test))
    lgbm_imp_list = []
    for fi, (tr_idx, val_idx) in enumerate(cv.split(X_train, y_train)):
        m = lgb.LGBMClassifier(
            n_estimators=2000, max_depth=-1, num_leaves=31,
            learning_rate=0.005, subsample=0.7, subsample_freq=1,
            colsample_bytree=0.8, min_child_samples=50,
            reg_alpha=1.0, reg_lambda=5.0, is_unbalance=True,
            max_bin=511, path_smooth=1.0,
            random_state=RANDOM_STATE, verbose=-1, n_jobs=-1,
        )
        m.fit(X_train[tr_idx], y_train[tr_idx],
              eval_set=[(X_train[val_idx], y_train[val_idx])],
              callbacks=[lgb.early_stopping(100, verbose=False), lgb.log_evaluation(0)])
        oof_train['lgbm'][val_idx] = m.predict_proba(X_train[val_idx])[:, 1]
        test_preds['lgbm'] += m.predict_proba(X_test)[:, 1] / N_FOLDS
        lgbm_imp_list.append(m.feature_importances_)
        print(f"    Fold {fi+1}: AUC={roc_auc_score(y_train[val_idx], oof_train['lgbm'][val_idx]):.4f} (iter={m.best_iteration_})")
    importances['lgbm'] = np.mean(lgbm_imp_list, axis=0)
    print(f"  >>> LightGBM OOF AUC: {roc_auc_score(y_train, oof_train['lgbm']):.4f}")

    # ─── 6. CatBoost OOF ───
    print("\n[6/11] CatBoost OOF — 'Phao dai bat kha xam pham'...")
    oof_train['cat'] = np.zeros(len(y_train))
    test_preds['cat'] = np.zeros(len(y_test))
    for fi, (tr_idx, val_idx) in enumerate(cv.split(X_train, y_train)):
        m = CatBoostClassifier(
            iterations=1000, depth=6, learning_rate=0.02,
            l2_leaf_reg=3.0, random_seed=RANDOM_STATE,
            auto_class_weights='Balanced', eval_metric='AUC',
            early_stopping_rounds=50, verbose=0,
        )
        m.fit(X_train[tr_idx], y_train[tr_idx],
              eval_set=(X_train[val_idx], y_train[val_idx]))
        oof_train['cat'][val_idx] = m.predict_proba(X_train[val_idx])[:, 1]
        test_preds['cat'] += m.predict_proba(X_test)[:, 1] / N_FOLDS
        print(f"    Fold {fi+1}: AUC={roc_auc_score(y_train[val_idx], oof_train['cat'][val_idx]):.4f}")
    print(f"  >>> CatBoost OOF AUC: {roc_auc_score(y_train, oof_train['cat']):.4f}")

    # ─── 7. ExtraTrees OOF ───
    print("\n[7/11] ExtraTrees OOF — 'Biet doi ngau nhien'...")
    oof_train['et'] = np.zeros(len(y_train))
    test_preds['et'] = np.zeros(len(y_test))
    for fi, (tr_idx, val_idx) in enumerate(cv.split(X_train, y_train)):
        m = ExtraTreesClassifier(
            n_estimators=2000, max_depth=None, min_samples_split=8,
            min_samples_leaf=4, max_features="sqrt",
            class_weight="balanced_subsample", random_state=RANDOM_STATE, n_jobs=-1,
        )
        m.fit(X_train[tr_idx], y_train[tr_idx])
        oof_train['et'][val_idx] = m.predict_proba(X_train[val_idx])[:, 1]
        test_preds['et'] += m.predict_proba(X_test)[:, 1] / N_FOLDS
        print(f"    Fold {fi+1}: AUC={roc_auc_score(y_train[val_idx], oof_train['et'][val_idx]):.4f}")
    print(f"  >>> ExtraTrees OOF AUC: {roc_auc_score(y_train, oof_train['et']):.4f}")

    # ─── 8. GradientBoosting OOF ───
    print("\n[8/11] GradientBoosting OOF — 'Ky su chinh xac'...")
    oof_train['gb'] = np.zeros(len(y_train))
    test_preds['gb'] = np.zeros(len(y_test))
    for fi, (tr_idx, val_idx) in enumerate(cv.split(X_train, y_train)):
        m = GradientBoostingClassifier(
            n_estimators=800, max_depth=5, learning_rate=0.01,
            subsample=0.8, min_samples_split=15, min_samples_leaf=8,
            random_state=RANDOM_STATE,
        )
        m.fit(X_train[tr_idx], y_train[tr_idx])
        oof_train['gb'][val_idx] = m.predict_proba(X_train[val_idx])[:, 1]
        test_preds['gb'] += m.predict_proba(X_test)[:, 1] / N_FOLDS
        print(f"    Fold {fi+1}: AUC={roc_auc_score(y_train[val_idx], oof_train['gb'][val_idx]):.4f}")
    print(f"  >>> GradientBoosting OOF AUC: {roc_auc_score(y_train, oof_train['gb']):.4f}")

    # ══════════════════════════════════════════════
    # LEVEL 2: Random Forest Meta-Learner
    # ══════════════════════════════════════════════
    print("\n" + "=" * 70)
    print("  LEVEL 2: LogisticRegression Meta-Learner")
    print("  Input = 5 OOF predictions + 15 original features = 20 dims")
    print("=" * 70)

    # ── 9. Build meta features ──
    print("\n[9/11] Building meta features...")
    oof_keys = ['xgb', 'lgbm', 'cat', 'et', 'gb']
    X_meta_train = np.column_stack([oof_train[k] for k in oof_keys] + [X_train])
    X_meta_test = np.column_stack([test_preds[k] for k in oof_keys] + [X_test])
    META_FEATURE_NAMES = [f"oof_{k}" for k in oof_keys] + FEATURE_NAMES
    print(f"  Meta features: {len(META_FEATURE_NAMES)} dims")
    print(f"  X_meta_train: {X_meta_train.shape} | X_meta_test: {X_meta_test.shape}")

    print("\n  Training LogisticRegression Meta-Learner...")
    lr_meta = LogisticRegression(
        C=1.0, class_weight='balanced', max_iter=1000,
        solver='lbfgs', random_state=RANDOM_STATE, n_jobs=-1,
    )
    lr_meta.fit(X_meta_train, y_train)
    lr_meta_prob_test = lr_meta.predict_proba(X_meta_test)[:, 1]
    print(f"  >>> LR Meta AUC: {roc_auc_score(y_test, lr_meta_prob_test):.4f}")

    # HYBRID FINAL
    y_prob_hybrid = lr_meta_prob_test

    # ── 10. Evaluate ──
    print("\n" + "=" * 70)
    print("  [10/11] DANH GIA HYBRID MODEL")
    print("=" * 70)

    fpr_arr, tpr_arr, thresholds_arr = roc_curve(y_test, y_prob_hybrid)
    j_scores = tpr_arr - fpr_arr
    optimal_threshold = float(thresholds_arr[np.argmax(j_scores)])
    y_pred_hybrid = (y_prob_hybrid >= optimal_threshold).astype(int)

    auc_hybrid = roc_auc_score(y_test, y_prob_hybrid)
    acc = accuracy_score(y_test, y_pred_hybrid)
    prec = precision_score(y_test, y_pred_hybrid)
    rec = recall_score(y_test, y_pred_hybrid)
    f1 = f1_score(y_test, y_pred_hybrid)
    brier = brier_score_loss(y_test, y_prob_hybrid)
    logloss = log_loss(y_test, y_prob_hybrid)
    mcc = matthews_corrcoef(y_test, y_pred_hybrid)
    bal_acc = balanced_accuracy_score(y_test, y_pred_hybrid)
    kappa = cohen_kappa_score(y_test, y_pred_hybrid)
    ks_stat = float(np.max(j_scores))

    print(f"\n  {'='*55}")
    print(f"  HYBRID STACKING RESULTS — 5 Base + RF Meta")
    print(f"  {'='*55}")
    print(f"  Optimal Threshold (Youden's J):  {optimal_threshold:.4f}")
    print(f"  AUC-ROC:                         {auc_hybrid:.4f}")
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

    print(f"\n  So sanh AUC:")
    for k in oof_keys:
        print(f"    {MODEL_LABELS[k]:20s} OOF: {roc_auc_score(y_train, oof_train[k]):.4f}  |  Test: {roc_auc_score(y_test, test_preds[k]):.4f}")
    print(f"    {'LR Meta':20s} Test: {roc_auc_score(y_test, lr_meta_prob_test):.4f}")
    print(f"    {'HYBRID FINAL':20s} Test: {auc_hybrid:.4f}")

    print(f"\n  Classification Report:")
    print(classification_report(y_test, y_pred_hybrid, target_names=["Paid (0)", "Default (1)"]))

    # ── CV Full Hybrid Stacking ──
    print("\n  Cross-Validation — Nested Hybrid (5-Fold outer x 5-Fold inner)...")
    cv_outer = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=RANDOM_STATE + 100)
    cv_aucs = []
    fold_metrics_list = []

    for of, (otr, oval) in enumerate(cv_outer.split(X, y)):
        X_cv_tr_raw, X_cv_val_raw = X[otr], X[oval]
        y_cv_tr, y_cv_val = y[otr], y[oval]

        cv_sc, X_cv_tr = create_per_feature_scalers(X_cv_tr_raw, FEATURE_NAMES)
        X_cv_val = apply_per_feature_scalers(X_cv_val_raw, cv_sc, FEATURE_NAMES)
        cv_spw = (len(y_cv_tr) - y_cv_tr.sum()) / y_cv_tr.sum()

        cv_oof = {k: np.zeros(len(y_cv_tr)) for k in oof_keys}
        cv_vpreds = {k: np.zeros(len(y_cv_val)) for k in oof_keys}

        inner_cv = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=RANDOM_STATE)
        for _, (itr, ival) in enumerate(inner_cv.split(X_cv_tr, y_cv_tr)):
            Xi_tr, Xi_val = X_cv_tr[itr], X_cv_tr[ival]
            yi_tr, yi_val = y_cv_tr[itr], y_cv_tr[ival]

            # XGBoost
            cv_m = xgb.XGBClassifier(n_estimators=300, max_depth=6, learning_rate=0.02,
                                      scale_pos_weight=cv_spw, random_state=RANDOM_STATE,
                                      eval_metric="auc", early_stopping_rounds=30,
                                      tree_method="hist", n_jobs=-1)
            cv_m.fit(Xi_tr, yi_tr, eval_set=[(Xi_val, yi_val)], verbose=False)
            cv_oof['xgb'][ival] = cv_m.predict_proba(Xi_val)[:, 1]
            cv_vpreds['xgb'] += cv_m.predict_proba(X_cv_val)[:, 1] / N_FOLDS

            # LightGBM
            cv_m = lgb.LGBMClassifier(n_estimators=500, max_depth=-1, num_leaves=31,
                                       learning_rate=0.005, min_child_samples=50,
                                       subsample=0.7, subsample_freq=1,
                                       reg_alpha=1.0, reg_lambda=5.0,
                                       is_unbalance=True, random_state=RANDOM_STATE, verbose=-1,
                                       n_jobs=-1)
            cv_m.fit(Xi_tr, yi_tr, eval_set=[(Xi_val, yi_val)],
                     callbacks=[lgb.early_stopping(50, verbose=False), lgb.log_evaluation(0)])
            cv_oof['lgbm'][ival] = cv_m.predict_proba(Xi_val)[:, 1]
            cv_vpreds['lgbm'] += cv_m.predict_proba(X_cv_val)[:, 1] / N_FOLDS

            # CatBoost
            cv_m = CatBoostClassifier(iterations=300, depth=6, learning_rate=0.01,
                                       auto_class_weights='Balanced', random_seed=RANDOM_STATE,
                                       eval_metric='AUC', early_stopping_rounds=30, verbose=0)
            cv_m.fit(Xi_tr, yi_tr, eval_set=(Xi_val, yi_val))
            cv_oof['cat'][ival] = cv_m.predict_proba(Xi_val)[:, 1]
            cv_vpreds['cat'] += cv_m.predict_proba(X_cv_val)[:, 1] / N_FOLDS

            # ExtraTrees
            cv_m = ExtraTreesClassifier(n_estimators=1000, max_depth=None,
                                         min_samples_split=8, min_samples_leaf=4,
                                         class_weight="balanced_subsample",
                                         random_state=RANDOM_STATE, n_jobs=-1)
            cv_m.fit(Xi_tr, yi_tr)
            cv_oof['et'][ival] = cv_m.predict_proba(Xi_val)[:, 1]
            cv_vpreds['et'] += cv_m.predict_proba(X_cv_val)[:, 1] / N_FOLDS

            # GradientBoosting
            cv_m = GradientBoostingClassifier(n_estimators=400, max_depth=5, learning_rate=0.01,
                                               random_state=RANDOM_STATE)
            cv_m.fit(Xi_tr, yi_tr)
            cv_oof['gb'][ival] = cv_m.predict_proba(Xi_val)[:, 1]
            cv_vpreds['gb'] += cv_m.predict_proba(X_cv_val)[:, 1] / N_FOLDS

        # Level 2 meta
        Xm_tr = np.column_stack([cv_oof[k] for k in oof_keys] + [X_cv_tr])
        Xm_val = np.column_stack([cv_vpreds[k] for k in oof_keys] + [X_cv_val])

        cv_lr = LogisticRegression(C=1.0, class_weight='balanced', max_iter=1000,
                                    solver='lbfgs', random_state=RANDOM_STATE, n_jobs=-1)
        cv_lr.fit(Xm_tr, y_cv_tr)
        cv_hp = cv_lr.predict_proba(Xm_val)[:, 1]

        fold_auc = roc_auc_score(y_cv_val, cv_hp)
        cv_aucs.append(fold_auc)
        cv_prd = (cv_hp >= optimal_threshold).astype(int)
        fold_metrics_list.append({
            'AUC': fold_auc,
            'Accuracy': accuracy_score(y_cv_val, cv_prd),
            'Precision': precision_score(y_cv_val, cv_prd, zero_division=0),
            'Recall': recall_score(y_cv_val, cv_prd, zero_division=0),
            'F1': f1_score(y_cv_val, cv_prd, zero_division=0),
            'Brier': brier_score_loss(y_cv_val, cv_hp),
            'LogLoss': log_loss(y_cv_val, cv_hp),
        })
        print(f"    Outer Fold {of+1}: AUC = {fold_auc:.4f}")

    cv_mean = np.mean(cv_aucs); cv_std = np.std(cv_aucs)
    print(f"\n  >>> CV Hybrid AUC: {cv_mean:.4f} +/- {cv_std:.4f}")

    # ── 11. Save ──
    print("\n[11/11] Saving artifacts...")
    os.makedirs(MODEL_DIR, exist_ok=True)

    # Train final Level 1 on full train set (GPU)
    print("  Final XGBoost...")
    xgb_final = xgb.XGBClassifier(
        n_estimators=1000, max_depth=6, learning_rate=0.02,
        subsample=0.8, colsample_bytree=0.8, min_child_weight=10,
        gamma=0.3, reg_alpha=1.0, reg_lambda=3.0,
        scale_pos_weight=scale_pos_wt, random_state=RANDOM_STATE,
        eval_metric="auc", early_stopping_rounds=50,
        tree_method="hist", n_jobs=-1,
    )
    xgb_final.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    print("  Final LightGBM...")
    lgbm_final = lgb.LGBMClassifier(
        n_estimators=2000, max_depth=-1, num_leaves=31,
        learning_rate=0.005, subsample=0.7, subsample_freq=1,
        colsample_bytree=0.8, min_child_samples=50,
        reg_alpha=1.0, reg_lambda=5.0, is_unbalance=True,
        max_bin=511, path_smooth=1.0,
        random_state=RANDOM_STATE, verbose=-1, n_jobs=-1,
    )
    lgbm_final.fit(X_train, y_train, eval_set=[(X_test, y_test)],
                    callbacks=[lgb.early_stopping(100, verbose=False), lgb.log_evaluation(0)])

    print("  Final CatBoost...")
    cat_final = CatBoostClassifier(
        iterations=1000, depth=6, learning_rate=0.02,
        l2_leaf_reg=3.0, random_seed=RANDOM_STATE,
        auto_class_weights='Balanced', eval_metric='AUC',
        early_stopping_rounds=50, verbose=0,
    )
    cat_final.fit(X_train, y_train, eval_set=(X_test, y_test))

    print("  Final ExtraTrees...")
    et_final = ExtraTreesClassifier(
        n_estimators=2000, max_depth=None, min_samples_split=8,
        min_samples_leaf=4, max_features="sqrt",
        class_weight="balanced_subsample", random_state=RANDOM_STATE, n_jobs=-1,
    )
    et_final.fit(X_train, y_train)

    print("  Final GradientBoosting...")
    gb_final = GradientBoostingClassifier(
        n_estimators=800, max_depth=5, learning_rate=0.01,
        subsample=0.8, min_samples_split=15, min_samples_leaf=8,
        random_state=RANDOM_STATE,
    )
    gb_final.fit(X_train, y_train)

    # Save
    xgb_final.save_model(os.path.join(MODEL_DIR, "xgb_pd_model.json"))
    lgbm_final.booster_.save_model(os.path.join(MODEL_DIR, "lgbm_pd_model.txt"))
    joblib.dump(cat_final, os.path.join(MODEL_DIR, "cat_pd_model.joblib"))
    joblib.dump(et_final, os.path.join(MODEL_DIR, "et_pd_model.joblib"))
    joblib.dump(gb_final, os.path.join(MODEL_DIR, "gb_pd_model.joblib"))
    joblib.dump(lr_meta, os.path.join(MODEL_DIR, "lr_meta_model.joblib"))
    joblib.dump(scalers, os.path.join(MODEL_DIR, "per_feature_scalers.joblib"))

    metadata = {
        "model_type": "hybrid_stacking_5_base",
        "architecture": "Level1(XGB+LGBM+CatBoost+ExtraTrees+GradBoost OOF) -> Level2(LR Meta)",
        "feature_names": FEATURE_NAMES,
        "meta_feature_names": META_FEATURE_NAMES,
        "n_features": len(FEATURE_NAMES),
        "n_meta_features": len(META_FEATURE_NAMES),
        "n_folds_oof": N_FOLDS,
        "optimal_threshold": optimal_threshold,
        "test_metrics": {
            "auc_roc": round(auc_hybrid, 4), "accuracy": round(acc, 4),
            "balanced_accuracy": round(bal_acc, 4), "precision": round(prec, 4),
            "recall": round(rec, 4), "f1_score": round(f1, 4),
            "brier_score": round(brier, 4), "log_loss": round(logloss, 4),
            "mcc": round(mcc, 4), "kappa": round(kappa, 4),
            "ks_statistic": round(ks_stat, 4),
        },
        "level1_oof_auc": {k: round(roc_auc_score(y_train, oof_train[k]), 4) for k in oof_keys},
        "level1_test_auc": {k: round(roc_auc_score(y_test, test_preds[k]), 4) for k in oof_keys},
        "cv_auc_mean": round(cv_mean, 4), "cv_auc_std": round(cv_std, 4),
        "cv_aucs": [round(a, 4) for a in cv_aucs],
        "usd_to_vnd": USD_TO_VND,
        "scaling": "per_feature_standard_scaler",
        "train_size": len(y_train), "test_size": len(y_test),
        "purpose_map": PURPOSE_MAP,
    }
    with open(os.path.join(MODEL_DIR, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    print(f"\n  Models saved to: {MODEL_DIR}")
    for fn in sorted(os.listdir(MODEL_DIR)):
        sz = os.path.getsize(os.path.join(MODEL_DIR, fn)) / 1024
        print(f"    {fn} ({sz:.0f} KB)")

    # ── Charts ──
    print("\n" + "=" * 70)
    print("  XUAT 20 BIEU DO DANH GIA MO HINH")
    print("=" * 70)
    plot_all_charts(
        y_test=y_test,
        y_prob_hybrid=y_prob_hybrid,
        y_pred_hybrid=y_pred_hybrid,
        optimal_threshold=optimal_threshold,
        level1_test_probs=test_preds,
        rf_meta_prob_test=lr_meta_prob_test,
        oof_probs=oof_train,
        y_train=y_train,
        feature_importances=importances,
        feature_names=FEATURE_NAMES,
        cv_aucs=cv_aucs,
        fold_metrics=fold_metrics_list,
        X_test_scaled=X_test,
        X_train_scaled=X_train,
        chart_dir=CHART_DIR,
    )

    elapsed = time.time() - t_start
    print("\n" + "=" * 70)
    print(f"  >>> TRAINING COMPLETE — {elapsed/60:.1f} min ({elapsed:.0f}s)")
    print(f"  Meta-Learner: LogisticRegression (L2, balanced)")
    print(f"  Models: {MODEL_DIR}")
    print(f"  Charts: {CHART_DIR}")
    print("=" * 70)

    return {
        'models': (xgb_final, lgbm_final, cat_final, et_final, gb_final, lr_meta),
        'scalers': scalers,
        'metadata': metadata,
    }


# ═════════════════════════════════════════════════════════════
#  SCORER — Inference (dung sau khi train xong)
# ═════════════════════════════════════════════════════════════
class CreditScorer:
    """
    Hybrid Stacking scorer — 5 Base + RF Meta.
    Load models tu MODEL_DIR, predict PD tu VND features.
    """
    def __init__(self, model_dir=MODEL_DIR):
        self.model_dir = model_dir
        self.xgb_model = xgb.XGBClassifier()
        self.xgb_model.load_model(os.path.join(model_dir, "xgb_pd_model.json"))
        self.lgbm_model = lgb.Booster(model_file=os.path.join(model_dir, "lgbm_pd_model.txt"))
        self.cat_model = joblib.load(os.path.join(model_dir, "cat_pd_model.joblib"))
        self.et_model = joblib.load(os.path.join(model_dir, "et_pd_model.joblib"))
        self.gb_model = joblib.load(os.path.join(model_dir, "gb_pd_model.joblib"))
        self.lr_meta = joblib.load(os.path.join(model_dir, "lr_meta_model.joblib"))
        self.scalers = joblib.load(os.path.join(model_dir, "per_feature_scalers.joblib"))
        with open(os.path.join(model_dir, "metadata.json"), "r") as f:
            self.metadata = json.load(f)

    def predict(self, features: dict) -> dict:
        f = self._process(features)
        X_raw = np.array([[f[n] for n in FEATURE_NAMES]])

        # Per-feature scale
        X = np.zeros_like(X_raw, dtype=np.float64)
        for i, fn in enumerate(FEATURE_NAMES):
            X[0, i] = self.scalers[fn].transform(X_raw[0, i].reshape(1, -1)).ravel()[0]

        # Level 1
        xgb_pd = float(self.xgb_model.predict_proba(X)[0, 1])
        lgbm_pd = float(self.lgbm_model.predict(X)[0])
        cat_pd = float(self.cat_model.predict_proba(X)[0, 1])
        et_pd = float(self.et_model.predict_proba(X)[0, 1])
        gb_pd = float(self.gb_model.predict_proba(X)[0, 1])

        # Level 2
        X_meta = np.column_stack([[xgb_pd, lgbm_pd, cat_pd, et_pd, gb_pd], X])
        pd_val = float(self.lr_meta.predict_proba(X_meta)[0, 1])

        return {
            "ai_risk_score": int(round(min(max(pd_val, 0), 1) * 100)),
            "default_probability": round(pd_val, 4),
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
