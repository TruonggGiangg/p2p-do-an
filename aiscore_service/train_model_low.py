import gc
import json
import os
import shutil
import subprocess
import warnings
from pathlib import Path

import joblib
import matplotlib
import numpy as np
import pandas as pd
import xgboost as xgb

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.calibration import calibration_curve
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    classification_report,
    confusion_matrix,
    f1_score,
    fbeta_score,
    matthews_corrcoef,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.preprocessing import MinMaxScaler, RobustScaler, StandardScaler


warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)


# =============================================================================
# CONFIG
# =============================================================================
RANDOM_STATE = int(os.environ.get("RANDOM_STATE_LOW", "42"))
USD_TO_VND = float(os.environ.get("USD_TO_VND", "25000"))

MAX_SAMPLES_ENV = os.environ.get("MAX_SAMPLES_LOW", "").strip()
MAX_SAMPLES = int(MAX_SAMPLES_ENV) if MAX_SAMPLES_ENV else None

TEST_SIZE = float(os.environ.get("TEST_SIZE_LOW", "0.20"))
VAL_SIZE = float(os.environ.get("VAL_SIZE_LOW", "0.10"))
MIN_TEST_SAMPLES = int(os.environ.get("MIN_TEST_SAMPLES_LOW", "200000"))

USE_RESAMPLING = os.environ.get("USE_RESAMPLING_LOW", "1") != "0"
RUS_SAMPLING_STRATEGY = float(os.environ.get("RUS_SAMPLING_STRATEGY_LOW", "0.50"))
TARGET_MINORITY_RATE = float(os.environ.get("TARGET_MINORITY_RATE_LOW", "0.35"))
SMOTE_MIN_SAMPLES = int(os.environ.get("SMOTE_MIN_SAMPLES_LOW", "20000"))

USE_TUNING = os.environ.get("USE_TUNING_LOW", "1") != "0"
USE_OPTUNA = os.environ.get("USE_OPTUNA_LOW", "1") != "0"
OPTUNA_TRIALS = int(os.environ.get("OPTUNA_TRIALS_LOW", "18"))
TUNE_SIZE = int(os.environ.get("TUNE_SIZE_LOW", "180000"))
TUNE_FOLDS = int(os.environ.get("TUNE_FOLDS_LOW", "3"))
THRESHOLD_METRIC = os.environ.get("THRESHOLD_METRIC_LOW", "f1").lower()
XGB_DEVICE = os.environ.get("XGB_DEVICE_LOW", "cpu")


def _is_colab() -> bool:
    return Path("/content").exists()


def _maybe_mount_drive() -> None:
    if not _is_colab():
        return
    try:
        from google.colab import drive
    except Exception:
        return

    mount_point = Path("/content/drive")
    if mount_point.exists() and any(mount_point.iterdir()):
        print("[mount] Drive dir not empty, cleaning up...")
        try:
            os.system(f"fusermount -uz {mount_point}")
        except Exception:
            pass
        if mount_point.exists() and any(mount_point.iterdir()):
            shutil.rmtree(mount_point, ignore_errors=True)
            mount_point.mkdir(parents=True, exist_ok=True)
    drive.mount(str(mount_point))


_maybe_mount_drive()

BASE_DIR = Path(__file__).resolve().parent if "__file__" in globals() else Path.cwd()
DEFAULT_DATA_DIR = Path("/content/drive/MyDrive/Colab Notebooks") if _is_colab() else BASE_DIR
DATA_DIR = Path(os.environ.get("AISCORE_DATA_DIR", str(DEFAULT_DATA_DIR)))
ACCEPTED_CSV = Path(os.environ.get("ACCEPTED_CSV", str(DATA_DIR / "accepted_2007_to_2018Q4.csv")))
if not ACCEPTED_CSV.exists() and (BASE_DIR / "accepted_2007_to_2018Q4.csv").exists():
    ACCEPTED_CSV = BASE_DIR / "accepted_2007_to_2018Q4.csv"

MODEL_DIR = Path(os.environ.get("MODEL_DIR_LOW", str(DATA_DIR / "models_final")))
CHART_DIR = Path(os.environ.get("CHART_DIR_LOW", str(DATA_DIR / "charts_final")))
MODEL_DIR.mkdir(parents=True, exist_ok=True)
CHART_DIR.mkdir(parents=True, exist_ok=True)


def _install_if_colab(package: str) -> bool:
    if not _is_colab():
        return False
    print(f"[setup] Installing {package}...")
    subprocess.check_call(["pip", "install", "-q", package])
    return True


try:
    from imblearn.under_sampling import RandomUnderSampler
    from imblearn.over_sampling import BorderlineSMOTE, SMOTENC

    HAS_IMBLEARN = True
except Exception:
    if _install_if_colab("imbalanced-learn"):
        from imblearn.under_sampling import RandomUnderSampler
        from imblearn.over_sampling import BorderlineSMOTE, SMOTENC

        HAS_IMBLEARN = True
    else:
        HAS_IMBLEARN = False

try:
    if USE_OPTUNA:
        import optuna

        HAS_OPTUNA = True
    else:
        HAS_OPTUNA = False
except Exception:
    if USE_OPTUNA and _install_if_colab("optuna"):
        import optuna

        HAS_OPTUNA = True
    else:
        HAS_OPTUNA = False


# =============================================================================
# FEATURE DEFINITIONS
# =============================================================================
SUBGRADE_SCORE_MAP = {
    "A1": 750,
    "A2": 732,
    "A3": 715,
    "A4": 697,
    "A5": 679,
    "B1": 662,
    "B2": 644,
    "B3": 626,
    "B4": 609,
    "B5": 591,
    "C1": 574,
    "C2": 556,
    "C3": 538,
    "C4": 521,
    "C5": 503,
    "D1": 485,
    "D2": 468,
    "D3": 450,
    "D4": 432,
    "D5": 415,
    "E1": 397,
    "E2": 379,
    "E3": 362,
    "E4": 344,
    "E5": 326,
    "F1": 309,
    "F2": 291,
    "F3": 274,
    "F4": 256,
    "F5": 238,
    "G1": 221,
    "G2": 203,
    "G3": 185,
    "G4": 168,
    "G5": 150,
}
GRADE_ENC_MAP = {"A": 6, "B": 5, "C": 4, "D": 3, "E": 2, "F": 1, "G": 0}
SUBGRADE_ENC_MAP = {
    sg: i for i, (sg, _) in enumerate(sorted(SUBGRADE_SCORE_MAP.items(), key=lambda x: x[1]))
}
HOME_MAP = {"RENT": 0, "OWN": 1, "MORTGAGE": 2, "OTHER": 3, "NONE": 3, "ANY": 3}
VERIFICATION_MAP = {"Not Verified": 0, "Source Verified": 1, "Verified": 2}
PURPOSE_MAP = {
    "debt_consolidation": 0,
    "credit_card": 1,
    "home_improvement": 2,
    "other": 3,
    "major_purchase": 4,
    "medical": 5,
    "small_business": 6,
    "car": 7,
    "vacation": 8,
    "moving": 9,
    "house": 10,
    "wedding": 11,
    "renewable_energy": 12,
    "educational": 13,
}
EMP_YEARS_MAP = {
    "< 1 year": 0.5,
    "1 year": 1.0,
    "2 years": 2.0,
    "3 years": 3.0,
    "4 years": 4.0,
    "5 years": 5.0,
    "6 years": 6.0,
    "7 years": 7.0,
    "8 years": 8.0,
    "9 years": 9.0,
    "10+ years": 10.0,
}

NUMERIC_FEATURES = [
    "capital",
    "monthly_income",
    "monthly_pay",
    "revolving_balance",
    "total_current_balance",
    "dti",
    "revolving_util_percent",
    "emp_length_years",
    "active_bad_debts",
    "bankruptcies",
    "active_loans",
    "total_loans_history",
    "credit_history_months",
    "recent_inquiries",
    "delinquencies_2yr",
    "accounts_delinquent",
    "severe_delinquencies_24m",
    "pct_never_delinquent",
    "collections_12m",
    "loan_to_income",
    "payment_burden",
    "balance_income_ratio",
    "revolving_concentration",
    "delinquency_severity",
    "inquiry_per_account",
    "credit_quality_depth",
    "income_per_loan",
    "risk_accumulation",
    "term_loan_risk",
    "dti_squared",
    "score_utilization",
    "installment_income_term",
    "delinquency_rate",
    "net_monthly_cashflow",
    "interest_rate",
    "revolving_credit_limit",
    "months_since_delinquency",
    "new_accounts_12m",
    "mortgage_accounts",
    "total_credit_limit",
    "rate_loan_risk",
    "credit_headroom_pct",
]
CATEGORICAL_FEATURES = [
    "term_enc",
    "home_ownership_enc",
    "verification_status_enc",
    "purpose_enc",
    "grade_enc",
    "sub_grade_enc",
]
FEATURE_NAMES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

USECOLS = [
    "sub_grade",
    "loan_amnt",
    "installment",
    "term",
    "emp_length",
    "home_ownership",
    "annual_inc",
    "verification_status",
    "loan_status",
    "purpose",
    "dti",
    "revol_util",
    "open_acc",
    "pub_rec",
    "pub_rec_bankruptcies",
    "total_acc",
    "revol_bal",
    "earliest_cr_line",
    "issue_d",
    "inq_last_6mths",
    "delinq_2yrs",
    "tot_cur_bal",
    "acc_now_delinq",
    "num_tl_90g_dpd_24m",
    "pct_tl_nvr_dlq",
    "collections_12_mths_ex_med",
    "int_rate",
    "total_rev_hi_lim",
    "mths_since_last_delinq",
    "num_tl_op_past_12m",
    "mort_acc",
    "tot_hi_cred_lim",
]

FEATURE_SCALING_CONFIG = {
    "capital": "log_standard",
    "monthly_income": "log_robust",
    "monthly_pay": "log_standard",
    "revolving_balance": "log_standard",
    "total_current_balance": "log_standard",
    "dti": "robust",
    "revolving_util_percent": "robust",
    "emp_length_years": "minmax",
    "active_bad_debts": "robust",
    "bankruptcies": "robust",
    "active_loans": "standard",
    "total_loans_history": "standard",
    "credit_history_months": "standard",
    "recent_inquiries": "robust",
    "delinquencies_2yr": "robust",
    "accounts_delinquent": "robust",
    "severe_delinquencies_24m": "robust",
    "pct_never_delinquent": "standard",
    "collections_12m": "robust",
    "loan_to_income": "log_robust",
    "payment_burden": "robust",
    "balance_income_ratio": "log_robust",
    "revolving_concentration": "robust",
    "delinquency_severity": "robust",
    "inquiry_per_account": "robust",
    "credit_quality_depth": "log_standard",
    "income_per_loan": "log_robust",
    "risk_accumulation": "robust",
    "term_loan_risk": "robust",
    "dti_squared": "robust",
    "score_utilization": "standard",
    "installment_income_term": "robust",
    "delinquency_rate": "robust",
    "net_monthly_cashflow": "log_robust",
    "interest_rate": "standard",
    "revolving_credit_limit": "log_robust",
    "months_since_delinquency": "robust",
    "new_accounts_12m": "robust",
    "mortgage_accounts": "robust",
    "total_credit_limit": "log_robust",
    "rate_loan_risk": "robust",
    "credit_headroom_pct": "standard",
    "term_enc": "passthrough",
    "home_ownership_enc": "passthrough",
    "verification_status_enc": "passthrough",
    "purpose_enc": "passthrough",
    "grade_enc": "passthrough",
    "sub_grade_enc": "passthrough",
}

MONOTONIC_CONSTRAINTS = {
    "capital": 0,
    "monthly_income": -1,
    "monthly_pay": 1,
    "revolving_balance": 1,
    "total_current_balance": 0,
    "dti": 1,
    "revolving_util_percent": 1,
    "emp_length_years": -1,
    "active_bad_debts": 1,
    "bankruptcies": 1,
    "active_loans": 0,
    "total_loans_history": 0,
    "credit_history_months": -1,
    "recent_inquiries": 1,
    "delinquencies_2yr": 1,
    "accounts_delinquent": 1,
    "severe_delinquencies_24m": 1,
    "pct_never_delinquent": -1,
    "collections_12m": 1,
    "loan_to_income": 1,
    "payment_burden": 1,
    "balance_income_ratio": 1,
    "revolving_concentration": 1,
    "delinquency_severity": 1,
    "inquiry_per_account": 1,
    "credit_quality_depth": -1,
    "income_per_loan": -1,
    "risk_accumulation": 1,
    "term_loan_risk": 1,
    "dti_squared": 1,
    "score_utilization": -1,
    "installment_income_term": 1,
    "delinquency_rate": 1,
    "net_monthly_cashflow": -1,
    "interest_rate": 1,
    "revolving_credit_limit": -1,
    "months_since_delinquency": -1,
    "new_accounts_12m": 1,
    "mortgage_accounts": -1,
    "total_credit_limit": -1,
    "rate_loan_risk": 1,
    "credit_headroom_pct": -1,
    "term_enc": 1,
    "home_ownership_enc": 0,
    "verification_status_enc": 0,
    "purpose_enc": 0,
    "grade_enc": -1,
    "sub_grade_enc": -1,
}


# =============================================================================
# DATA PREPARATION
# =============================================================================
def _copy_to_local_if_colab(filepath: Path) -> Path:
    if not _is_colab():
        return filepath
    local_path = Path("/content/temp_accepted_low.csv")
    if local_path.exists() and local_path.stat().st_size == filepath.stat().st_size:
        return local_path
    print("Copying dataset to local /content for stable Colab IO...")
    shutil.copy2(filepath, local_path)
    return local_path


def _num(df: pd.DataFrame, col: str, default=0.0) -> pd.Series:
    if col not in df.columns:
        return pd.Series(default, index=df.index, dtype="float64")
    return pd.to_numeric(df[col], errors="coerce")


def _clip_quantile(series: pd.Series, lower=None, upper_q=0.995, upper=None) -> pd.Series:
    s = series.astype("float64")
    if lower is not None:
        s = s.clip(lower=lower)
    if upper is None and upper_q is not None:
        q = s.quantile(upper_q)
        if pd.notna(q) and np.isfinite(q):
            upper = q
    if upper is not None and np.isfinite(upper):
        s = s.clip(upper=upper)
    return s


def _fill_median(series: pd.Series, default=0.0) -> pd.Series:
    med = series.median()
    if pd.isna(med) or not np.isfinite(med):
        med = default
    return series.fillna(med)


def _read_accepted_csv(filepath: Path, limit=None) -> pd.DataFrame:
    read_path = _copy_to_local_if_colab(filepath)
    wanted = set(USECOLS)
    return pd.read_csv(
        read_path,
        usecols=lambda c: c in wanted,
        nrows=limit,
        low_memory=False,
    )


def get_clean_data(filepath: Path, limit=None) -> tuple[pd.DataFrame, list[str]]:
    print("Loading data...")
    if not filepath.exists():
        raise FileNotFoundError(f"Dataset not found: {filepath}")

    df = _read_accepted_csv(filepath, limit=limit)
    missing_required = {"loan_status", "sub_grade", "loan_amnt", "annual_inc"} - set(df.columns)
    if missing_required:
        raise ValueError(f"Missing required columns: {sorted(missing_required)}")

    df = df[df["loan_status"].isin(["Fully Paid", "Charged Off"])].copy()
    df["is_default"] = (df["loan_status"] == "Charged Off").astype(np.int8)

    df["credit_score"] = df["sub_grade"].map(SUBGRADE_SCORE_MAP)
    df = df.dropna(subset=["credit_score"]).copy()
    df["grade"] = df["sub_grade"].astype(str).str[0]
    df["grade_enc"] = df["grade"].map(GRADE_ENC_MAP).fillna(3).astype(np.int16)
    df["sub_grade_enc"] = df["sub_grade"].map(SUBGRADE_ENC_MAP).fillna(17).astype(np.int16)

    rate = USD_TO_VND
    df["capital"] = _fill_median(_num(df, "loan_amnt"), 0).clip(lower=0) * rate
    df["monthly_income"] = _fill_median(_num(df, "annual_inc"), 0).clip(lower=0) * rate / 12
    df["monthly_income"] = _clip_quantile(df["monthly_income"], lower=0, upper_q=0.995)
    df["monthly_pay"] = _fill_median(_num(df, "installment"), 0).clip(lower=0) * rate
    df["revolving_balance"] = _fill_median(_num(df, "revol_bal"), 0).clip(lower=0) * rate
    df["revolving_balance"] = _clip_quantile(df["revolving_balance"], lower=0, upper_q=0.995)
    df["total_current_balance"] = _fill_median(_num(df, "tot_cur_bal"), 0).clip(lower=0) * rate
    df["total_current_balance"] = _clip_quantile(df["total_current_balance"], lower=0, upper_q=0.995)

    df["dti"] = _fill_median(_num(df, "dti"), 15).clip(0, 100)
    df["revolving_util_percent"] = _fill_median(_num(df, "revol_util"), 50).clip(0, 150)
    df["emp_length_years"] = df.get("emp_length", pd.Series(index=df.index, dtype=object)).map(EMP_YEARS_MAP)
    df["emp_length_years"] = _fill_median(df["emp_length_years"], 5).clip(0, 10)
    df["active_bad_debts"] = _fill_median(_num(df, "pub_rec"), 0).clip(0, 20)
    df["bankruptcies"] = _fill_median(_num(df, "pub_rec_bankruptcies"), 0).clip(0, 10)
    df["active_loans"] = _fill_median(_num(df, "open_acc"), 10).clip(0, 50)
    df["total_loans_history"] = _fill_median(_num(df, "total_acc"), 20).clip(0, 120)

    earliest = pd.to_datetime(df.get("earliest_cr_line"), format="%b-%Y", errors="coerce")
    if "issue_d" in df.columns:
        issue_date = pd.to_datetime(df["issue_d"], format="%b-%Y", errors="coerce")
        fallback_ref = issue_date.dropna().median()
        if pd.isna(fallback_ref):
            fallback_ref = pd.Timestamp("2015-06-01")
        ref_date = issue_date.fillna(fallback_ref)
        credit_months = (ref_date - earliest).dt.days / 30.44
    else:
        credit_months = (pd.Timestamp("2015-06-01") - earliest).dt.days / 30.44
    df["credit_history_months"] = _fill_median(credit_months, 120).clip(0, 600)

    df["recent_inquiries"] = _fill_median(_num(df, "inq_last_6mths"), 0).clip(0, 20)
    df["delinquencies_2yr"] = _fill_median(_num(df, "delinq_2yrs"), 0).clip(0, 20)
    df["accounts_delinquent"] = _fill_median(_num(df, "acc_now_delinq"), 0).clip(0, 10)
    df["severe_delinquencies_24m"] = _fill_median(_num(df, "num_tl_90g_dpd_24m"), 0).clip(0, 20)
    df["pct_never_delinquent"] = _fill_median(_num(df, "pct_tl_nvr_dlq"), 100).clip(0, 100)
    df["collections_12m"] = _fill_median(_num(df, "collections_12_mths_ex_med"), 0).clip(0, 10)

    term_raw = df.get("term", pd.Series("36 months", index=df.index)).astype(str)
    df["term_enc"] = pd.to_numeric(term_raw.str.extract(r"(\d+)")[0], errors="coerce").fillna(36)
    df["term_enc"] = df["term_enc"].clip(36, 60)
    df["home_ownership_enc"] = df.get("home_ownership", pd.Series("OTHER", index=df.index)).map(HOME_MAP)
    df["home_ownership_enc"] = df["home_ownership_enc"].fillna(3).astype(np.int16)
    df["verification_status_enc"] = df.get(
        "verification_status", pd.Series("Not Verified", index=df.index)
    ).map(VERIFICATION_MAP)
    df["verification_status_enc"] = df["verification_status_enc"].fillna(0).astype(np.int16)
    df["purpose_enc"] = df.get("purpose", pd.Series("other", index=df.index)).map(PURPOSE_MAP)
    df["purpose_enc"] = df["purpose_enc"].fillna(3).astype(np.int16)

    annual_safe = (df["monthly_income"] * 12).clip(lower=1)
    df["loan_to_income"] = _clip_quantile(df["capital"] / annual_safe, lower=0, upper_q=0.99)
    df["payment_burden"] = _clip_quantile(
        df["monthly_pay"] / (df["monthly_income"] + 1), lower=0, upper_q=0.99
    )
    df["balance_income_ratio"] = _clip_quantile(
        df["total_current_balance"] / (df["monthly_income"] * 12 + 1),
        lower=0,
        upper_q=0.99,
    )
    df["revolving_concentration"] = (
        df["revolving_balance"] / (df["total_current_balance"] + 1)
    ).clip(0, 1)
    df["delinquency_severity"] = (
        df["delinquencies_2yr"]
        + 2 * df["accounts_delinquent"]
        + 3 * df["severe_delinquencies_24m"]
    ).clip(0, 100)
    df["inquiry_per_account"] = _clip_quantile(
        df["recent_inquiries"] / (df["active_loans"] + 1), lower=0, upper_q=0.99
    )
    df["credit_quality_depth"] = df["credit_history_months"] * df["pct_never_delinquent"] / 100
    df["income_per_loan"] = _clip_quantile(
        df["monthly_income"] / (df["active_loans"] + 1), lower=0, upper_q=0.995
    )
    df["risk_accumulation"] = (
        df["active_bad_debts"]
        + 2 * df["bankruptcies"]
        + 3 * df["severe_delinquencies_24m"]
        + df["delinquencies_2yr"]
        + df["collections_12m"]
    ).clip(0, 100)
    df["term_loan_risk"] = _clip_quantile(
        (df["term_enc"] / 36) * df["loan_to_income"], lower=0, upper_q=0.99
    )
    df["dti_squared"] = (df["dti"] / 100) ** 2
    df["score_utilization"] = df["sub_grade_enc"] * (1 - df["revolving_util_percent"] / 150)
    df["installment_income_term"] = _clip_quantile(
        df["monthly_pay"] * df["term_enc"] / annual_safe, lower=0, upper_q=0.99
    )
    df["delinquency_rate"] = (
        (df["delinquencies_2yr"] + df["accounts_delinquent"]) / (df["total_loans_history"] + 1)
    ).clip(0, 1)
    df["net_monthly_cashflow"] = (df["monthly_income"] - df["monthly_pay"]).clip(lower=0)
    df["net_monthly_cashflow"] = _clip_quantile(df["net_monthly_cashflow"], lower=0, upper_q=0.995)

    int_rate_raw = df.get("int_rate", pd.Series(index=df.index, dtype=object)).astype(str)
    df["interest_rate"] = pd.to_numeric(int_rate_raw.str.replace("%", "", regex=False), errors="coerce")
    df["interest_rate"] = _fill_median(df["interest_rate"], 10).clip(0, 40)
    df["revolving_credit_limit"] = _fill_median(_num(df, "total_rev_hi_lim"), 0).clip(lower=0) * rate
    df["revolving_credit_limit"] = _clip_quantile(
        df["revolving_credit_limit"], lower=0, upper_q=0.995
    )
    df["months_since_delinquency"] = _num(df, "mths_since_last_delinq", default=np.nan).fillna(999)
    df["months_since_delinquency"] = df["months_since_delinquency"].clip(0, 999)
    df["new_accounts_12m"] = _fill_median(_num(df, "num_tl_op_past_12m"), 0).clip(0, 20)
    df["mortgage_accounts"] = _fill_median(_num(df, "mort_acc"), 0).clip(0, 20)
    df["total_credit_limit"] = _fill_median(_num(df, "tot_hi_cred_lim"), 0).clip(lower=0) * rate
    df["total_credit_limit"] = _clip_quantile(df["total_credit_limit"], lower=0, upper_q=0.995)
    df["rate_loan_risk"] = _clip_quantile(
        df["interest_rate"] * df["loan_to_income"], lower=0, upper_q=0.99
    )
    df["credit_headroom_pct"] = (
        1 - df["revolving_balance"] / (df["revolving_credit_limit"] + 1)
    ).clip(-1, 1)

    df = df.replace([np.inf, -np.inf], np.nan)
    df = df[FEATURE_NAMES + ["is_default"]].dropna()
    if MAX_SAMPLES and len(df) > MAX_SAMPLES:
        print(f"Downsampling for experiment: {len(df):,} -> {MAX_SAMPLES:,}")
        df, _ = train_test_split(
            df,
            train_size=MAX_SAMPLES,
            stratify=df["is_default"],
            random_state=RANDOM_STATE,
        )
    print(f"Data cleaned. Shape = {df.shape}, default rate = {df['is_default'].mean():.4f}")
    return df, FEATURE_NAMES


# =============================================================================
# SCALING, RESAMPLING, TUNING
# =============================================================================
def _fit_one_feature(values_1d: np.ndarray, strategy: str):
    col = values_1d.reshape(-1, 1).astype(np.float64)
    if strategy == "log_standard":
        scaler = StandardScaler()
        out = scaler.fit_transform(np.log1p(np.clip(col, 0, None))).ravel()
    elif strategy == "log_robust":
        scaler = RobustScaler()
        out = scaler.fit_transform(np.log1p(np.clip(col, 0, None))).ravel()
    elif strategy == "robust":
        scaler = RobustScaler()
        out = scaler.fit_transform(col).ravel()
    elif strategy == "standard":
        scaler = StandardScaler()
        out = scaler.fit_transform(col).ravel()
    elif strategy == "minmax":
        scaler = MinMaxScaler()
        out = scaler.fit_transform(col).ravel()
    elif strategy == "passthrough":
        scaler = None
        out = col.ravel()
    else:
        raise ValueError(f"Unknown scaling strategy: {strategy}")
    return strategy, scaler, out.astype(np.float32)


def _transform_one_feature(values_1d: np.ndarray, strategy: str, scaler):
    col = values_1d.reshape(-1, 1).astype(np.float64)
    if strategy in ("log_standard", "log_robust"):
        return scaler.transform(np.log1p(np.clip(col, 0, None))).ravel().astype(np.float32)
    if strategy in ("robust", "standard", "minmax"):
        return scaler.transform(col).ravel().astype(np.float32)
    if strategy == "passthrough":
        return col.ravel().astype(np.float32)
    raise ValueError(f"Unknown scaling strategy: {strategy}")


def create_per_feature_scalers(X_train_raw: np.ndarray, feature_names: list[str]):
    scalers = {}
    X_scaled = np.empty(X_train_raw.shape, dtype=np.float32)
    for i, fname in enumerate(feature_names):
        strategy = FEATURE_SCALING_CONFIG.get(fname, "standard")
        strat, scaler, transformed = _fit_one_feature(X_train_raw[:, i], strategy)
        X_scaled[:, i] = transformed
        scalers[fname] = (strat, scaler)
    return scalers, X_scaled


def apply_per_feature_scalers(X_raw: np.ndarray, scalers: dict, feature_names: list[str]) -> np.ndarray:
    X_scaled = np.empty(X_raw.shape, dtype=np.float32)
    for i, fname in enumerate(feature_names):
        strategy, scaler = scalers[fname]
        X_scaled[:, i] = _transform_one_feature(X_raw[:, i], strategy, scaler)
    return X_scaled


def _class_summary(name: str, y: np.ndarray) -> None:
    print(
        f"{name}: {len(y):,} samples | class 1: {int(y.sum()):,} | "
        f"default rate: {float(np.mean(y)):.4f}"
    )


def resample_training_data(X_train: np.ndarray, y_train: np.ndarray, feature_names: list[str]):
    if not USE_RESAMPLING:
        print("Resampling disabled.")
        return X_train, y_train, "none"
    if not HAS_IMBLEARN:
        print("[WARN] imbalanced-learn unavailable. Continuing with scale_pos_weight only.")
        return X_train, y_train, "none"
    if len(y_train) < SMOTE_MIN_SAMPLES:
        print("Dataset too small for SMOTE. Using original training data.")
        return X_train, y_train, "none"

    print("Handling imbalance with RUS + SMOTENC/SMOTE on scaled training data...")
    _class_summary("  Before", y_train)
    method = []

    X_res, y_res = X_train, y_train
    current_ratio = float(np.sum(y_res == 1) / max(np.sum(y_res == 0), 1))
    if current_ratio < RUS_SAMPLING_STRATEGY:
        rus = RandomUnderSampler(sampling_strategy=RUS_SAMPLING_STRATEGY, random_state=RANDOM_STATE)
        X_res, y_res = rus.fit_resample(X_res, y_res)
        method.append("RandomUnderSampler")

    current_minority_rate = float(np.mean(y_res))
    target_ratio = TARGET_MINORITY_RATE / (1 - TARGET_MINORITY_RATE)
    if current_minority_rate < TARGET_MINORITY_RATE:
        categorical_idx = [feature_names.index(f) for f in CATEGORICAL_FEATURES if f in feature_names]
        try:
            sampler = SMOTENC(
                categorical_features=categorical_idx,
                sampling_strategy=target_ratio,
                random_state=RANDOM_STATE,
                k_neighbors=5,
                n_jobs=-1,
            )
            X_res, y_res = sampler.fit_resample(X_res, y_res)
            method.append("SMOTENC")
        except TypeError:
            sampler = SMOTENC(
                categorical_features=categorical_idx,
                sampling_strategy=target_ratio,
                random_state=RANDOM_STATE,
                k_neighbors=5,
            )
            X_res, y_res = sampler.fit_resample(X_res, y_res)
            method.append("SMOTENC")
        except Exception as exc:
            print(f"  [WARN] SMOTENC failed: {exc}. Falling back to BorderlineSMOTE.")
            sampler = BorderlineSMOTE(
                sampling_strategy=target_ratio,
                random_state=RANDOM_STATE,
                k_neighbors=5,
            )
            X_res, y_res = sampler.fit_resample(X_res, y_res)
            method.append("BorderlineSMOTE")

    X_res = np.asarray(X_res, dtype=np.float32)
    y_res = np.asarray(y_res, dtype=np.int8)
    _class_summary("  After ", y_res)
    return X_res, y_res, "+".join(method) if method else "none"


def _get_monotonic_tuple(feature_names: list[str]) -> tuple[int, ...]:
    return tuple(MONOTONIC_CONSTRAINTS.get(fn, 0) for fn in feature_names)


def find_optimal_threshold(y_true: np.ndarray, proba: np.ndarray, metric: str = "f1", beta: float = 2.0):
    if metric in {"f1", "f2"}:
        precision, recall, thresholds = precision_recall_curve(y_true, proba)
        if thresholds.size == 0:
            return 0.5, 0.0
        if metric == "f2":
            b2 = beta**2
            scores = (1 + b2) * precision[:-1] * recall[:-1] / (
                b2 * precision[:-1] + recall[:-1] + 1e-15
            )
        else:
            scores = 2 * precision[:-1] * recall[:-1] / (precision[:-1] + recall[:-1] + 1e-15)
        idx = int(np.nanargmax(scores))
        return float(thresholds[idx]), float(scores[idx])

    thresholds = np.arange(0.02, 0.90, 0.002)
    best_t, best_score = 0.5, -np.inf
    for t in thresholds:
        preds = (proba >= t).astype(np.int8)
        if metric == "balanced_accuracy":
            score = balanced_accuracy_score(y_true, preds)
        elif metric == "f2":
            score = fbeta_score(y_true, preds, beta=2, zero_division=0)
        elif metric == "youden_j":
            tn, fp, fn, tp = confusion_matrix(y_true, preds).ravel()
            tpr = tp / max(tp + fn, 1)
            tnr = tn / max(tn + fp, 1)
            score = tpr + tnr - 1
        else:
            score = f1_score(y_true, preds, zero_division=0)
        if score > best_score:
            best_t, best_score = float(t), float(score)
    return best_t, best_score


def threshold_curve(y_true: np.ndarray, proba: np.ndarray, metric: str = "f1"):
    thresholds = np.arange(0.02, 0.90, 0.01)
    scores = []
    for t in thresholds:
        preds = (proba >= t).astype(np.int8)
        if metric == "f2":
            score = fbeta_score(y_true, preds, beta=2, zero_division=0)
        elif metric == "balanced_accuracy":
            score = balanced_accuracy_score(y_true, preds)
        else:
            score = f1_score(y_true, preds, zero_division=0)
        scores.append(score)
    return thresholds, np.asarray(scores)


def _base_xgb_params(scale_pos_weight: float, feature_names: list[str], tuned_params: dict | None = None):
    params = {
        "objective": "binary:logistic",
        "n_estimators": 1800,
        "max_depth": 6,
        "learning_rate": 0.035,
        "subsample": 0.85,
        "colsample_bytree": 0.75,
        "min_child_weight": 20,
        "gamma": 0.25,
        "reg_alpha": 0.5,
        "reg_lambda": 4.0,
        "max_bin": 256,
        "scale_pos_weight": scale_pos_weight,
        "monotone_constraints": _get_monotonic_tuple(feature_names),
        "eval_metric": "aucpr",
        "early_stopping_rounds": 100,
        "tree_method": "hist",
        "device": XGB_DEVICE,
        "n_jobs": -1,
        "random_state": RANDOM_STATE,
    }
    if tuned_params:
        params.update(tuned_params)
        params["scale_pos_weight"] = tuned_params.get("scale_pos_weight", scale_pos_weight)
    return params


def build_xgb(scale_pos_weight: float, feature_names: list[str], tuned_params: dict | None = None):
    return xgb.XGBClassifier(**_base_xgb_params(scale_pos_weight, feature_names, tuned_params))


def tune_xgb(
    X_train: np.ndarray,
    y_train: np.ndarray,
    feature_names: list[str],
    scale_pos_weight: float,
) -> tuple[dict, float]:
    if not USE_TUNING:
        print("HP tuning disabled. Using strong default XGBoost params.")
        return {}, 0.0

    n = min(TUNE_SIZE, len(y_train))
    if n < len(y_train):
        rng = np.random.RandomState(RANDOM_STATE)
        idx = rng.choice(len(y_train), n, replace=False)
        X_tune, y_tune = X_train[idx], y_train[idx]
        print(f"Tuning subset: {n:,} / {len(y_train):,} samples")
    else:
        X_tune, y_tune = X_train, y_train

    def evaluate_params(params: dict, n_estimators=550, early_stop=45, folds=TUNE_FOLDS) -> float:
        cv = StratifiedKFold(n_splits=folds, shuffle=True, random_state=RANDOM_STATE)
        scores = []
        for fold, (tr_idx, val_idx) in enumerate(cv.split(X_tune, y_tune), start=1):
            model_params = dict(params)
            model_params["n_estimators"] = n_estimators
            model_params["early_stopping_rounds"] = early_stop
            model = xgb.XGBClassifier(**_base_xgb_params(scale_pos_weight, feature_names, model_params))
            model.fit(
                X_tune[tr_idx],
                y_tune[tr_idx],
                eval_set=[(X_tune[val_idx], y_tune[val_idx])],
                verbose=False,
            )
            pred = model.predict_proba(X_tune[val_idx])[:, 1]
            _, score = find_optimal_threshold(y_tune[val_idx], pred, metric=THRESHOLD_METRIC)
            scores.append(score)
            del model
            gc.collect()
        return float(np.mean(scores))

    post_resample = scale_pos_weight < 2.5
    if post_resample:
        spw_candidates = [1.0, round(scale_pos_weight, 2), 2.5, 3.5]
        spw_low, spw_high = 1.0, 4.0
    else:
        spw_candidates = [
            round(max(1.0, scale_pos_weight * 0.75), 2),
            round(scale_pos_weight, 2),
            round(scale_pos_weight * 1.25, 2),
        ]
        spw_low, spw_high = max(1.0, scale_pos_weight * 0.65), scale_pos_weight * 1.5

    if HAS_OPTUNA:
        print(
            f"Optuna search: {OPTUNA_TRIALS} trials, {TUNE_FOLDS}-fold CV, "
            f"metric={THRESHOLD_METRIC}, SPW=[{spw_low:.2f}, {spw_high:.2f}]"
        )

        def objective(trial):
            params = {
                "max_depth": trial.suggest_int("max_depth", 4, 8),
                "learning_rate": trial.suggest_float("learning_rate", 0.015, 0.08, log=True),
                "subsample": trial.suggest_float("subsample", 0.70, 0.95),
                "colsample_bytree": trial.suggest_float("colsample_bytree", 0.55, 0.90),
                "min_child_weight": trial.suggest_int("min_child_weight", 8, 80),
                "gamma": trial.suggest_float("gamma", 0.05, 2.0, log=True),
                "reg_alpha": trial.suggest_float("reg_alpha", 0.05, 8.0, log=True),
                "reg_lambda": trial.suggest_float("reg_lambda", 1.5, 16.0, log=True),
                "scale_pos_weight": trial.suggest_float("scale_pos_weight", spw_low, spw_high),
                "max_bin": 256,
            }
            return evaluate_params(params)

        study = optuna.create_study(
            direction="maximize",
            sampler=optuna.samplers.TPESampler(seed=RANDOM_STATE),
        )
        study.optimize(objective, n_trials=OPTUNA_TRIALS, show_progress_bar=True)
        return dict(study.best_params), float(study.best_value)

    print(f"Grid search fallback: metric={THRESHOLD_METRIC}, {TUNE_FOLDS}-fold CV")
    base_grid = [
        {
            "max_depth": 5,
            "learning_rate": 0.05,
            "subsample": 0.90,
            "colsample_bytree": 0.80,
            "min_child_weight": 12,
            "gamma": 0.20,
            "reg_alpha": 0.25,
            "reg_lambda": 3.0,
            "max_bin": 256,
        },
        {
            "max_depth": 6,
            "learning_rate": 0.035,
            "subsample": 0.85,
            "colsample_bytree": 0.75,
            "min_child_weight": 20,
            "gamma": 0.25,
            "reg_alpha": 0.50,
            "reg_lambda": 4.0,
            "max_bin": 256,
        },
        {
            "max_depth": 7,
            "learning_rate": 0.03,
            "subsample": 0.82,
            "colsample_bytree": 0.72,
            "min_child_weight": 30,
            "gamma": 0.35,
            "reg_alpha": 0.75,
            "reg_lambda": 6.0,
            "max_bin": 256,
        },
        {
            "max_depth": 4,
            "learning_rate": 0.06,
            "subsample": 0.90,
            "colsample_bytree": 0.85,
            "min_child_weight": 10,
            "gamma": 0.15,
            "reg_alpha": 0.20,
            "reg_lambda": 2.5,
            "max_bin": 256,
        },
    ]
    candidates = []
    for base in base_grid:
        for spw in spw_candidates:
            params = dict(base)
            params["scale_pos_weight"] = float(spw)
            candidates.append(params)

    best_params, best_score = candidates[0], -np.inf
    for i, params in enumerate(candidates, start=1):
        score = evaluate_params(params)
        print(
            f"  [{i:02d}/{len(candidates)}] depth={params['max_depth']} "
            f"lr={params['learning_rate']} spw={params['scale_pos_weight']:.2f} "
            f"=> {THRESHOLD_METRIC}={score:.4f}"
        )
        if score > best_score:
            best_params, best_score = dict(params), score
    return best_params, float(best_score)


# =============================================================================
# REPORTING
# =============================================================================
def _feature_importance(model: xgb.XGBClassifier, feature_names: list[str]) -> list[dict]:
    raw = model.get_booster().get_score(importance_type="gain")
    rows = []
    for key, gain in raw.items():
        if key.startswith("f") and key[1:].isdigit():
            idx = int(key[1:])
            name = feature_names[idx] if idx < len(feature_names) else key
        else:
            name = key
        rows.append({"feature": name, "gain": float(gain)})
    rows.sort(key=lambda r: r["gain"], reverse=True)
    return rows


def _save_json(path: Path, payload: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


def generate_charts(
    model: xgb.XGBClassifier,
    feature_names: list[str],
    y_test: np.ndarray,
    rank_probs: np.ndarray,
    decision_probs: np.ndarray,
    preds: np.ndarray,
    threshold: float,
    auc: float,
    chart_dir: Path,
) -> None:
    print("Generating charts...")
    chart_dir.mkdir(parents=True, exist_ok=True)

    # 1. Feature importance
    importance = _feature_importance(model, feature_names)[:30]
    fig, ax = plt.subplots(figsize=(10, 12))
    if importance:
        names = [r["feature"] for r in importance][::-1]
        gains = [r["gain"] for r in importance][::-1]
        ax.barh(names, gains, color="#2E7D32", alpha=0.85)
    ax.set_title("XGBoost Top 30 Feature Importance (Gain)")
    ax.set_xlabel("Gain")
    fig.tight_layout()
    fig.savefig(chart_dir / "01_feature_importance.png", dpi=200)
    plt.close(fig)

    # 2. ROC Curve
    fpr, tpr, _ = roc_curve(y_test, rank_probs)
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.plot(fpr, tpr, label=f"XGBoost (AUC = {auc:.4f})", color="#EF6C00", lw=2)
    ax.plot([0, 1], [0, 1], "k--", lw=1.5)
    ax.set_title("ROC Curve")
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.legend(loc="lower right")
    fig.tight_layout()
    fig.savefig(chart_dir / "02_roc_curve.png", dpi=200)
    plt.close(fig)

    # 3. Confusion Matrix
    cm = confusion_matrix(y_test, preds)
    fig, ax = plt.subplots(figsize=(6, 5))
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", ax=ax)
    ax.set_title(f"Confusion Matrix (threshold = {threshold:.4f})")
    ax.set_ylabel("Actual")
    ax.set_xlabel("Predicted")
    fig.tight_layout()
    fig.savefig(chart_dir / "03_confusion_matrix.png", dpi=200)
    plt.close(fig)

    # 4. Precision-Recall Curve. Use raw ranking probabilities for AP/PR so
    # calibration ties do not make ranking metrics look worse than the model is.
    precision, recall, _ = precision_recall_curve(y_test, rank_probs)
    ap = average_precision_score(y_test, rank_probs)
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.plot(recall, precision, color="#6A1B9A", lw=2, label=f"AP = {ap:.4f}")
    ax.set_title("Precision-Recall Curve")
    ax.set_xlabel("Recall")
    ax.set_ylabel("Precision")
    ax.legend()
    fig.tight_layout()
    fig.savefig(chart_dir / "04_pr_curve.png", dpi=200)
    plt.close(fig)

    # 5. Probability distribution
    fig, ax = plt.subplots(figsize=(8, 6))
    sns.histplot(
        decision_probs[y_test == 0],
        color="#2E7D32",
        label="No Default (0)",
        kde=True,
        stat="density",
        bins=50,
        alpha=0.45,
        ax=ax,
    )
    sns.histplot(
        decision_probs[y_test == 1],
        color="#C62828",
        label="Default (1)",
        kde=True,
        stat="density",
        bins=50,
        alpha=0.45,
        ax=ax,
    )
    ax.axvline(threshold, color="black", linestyle="--", label=f"Threshold ({threshold:.4f})")
    ax.set_title("Predicted Default Probability Distribution")
    ax.set_xlabel("Predicted default probability")
    ax.set_ylabel("Density")
    ax.legend()
    fig.tight_layout()
    fig.savefig(chart_dir / "05_probability_distribution.png", dpi=200)
    plt.close(fig)

    # 6. Threshold tuning curve
    thresholds, scores = threshold_curve(y_test, decision_probs, metric=THRESHOLD_METRIC)
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.plot(thresholds, scores, color="#00796B", lw=2)
    ax.axvline(threshold, color="#C62828", linestyle="--", label=f"Chosen ({threshold:.4f})")
    ax.set_title(f"{THRESHOLD_METRIC.upper()} by Threshold")
    ax.set_xlabel("Threshold")
    ax.set_ylabel(THRESHOLD_METRIC.upper())
    ax.grid(True, linestyle="--", alpha=0.4)
    ax.legend()
    fig.tight_layout()
    fig.savefig(chart_dir / "06_threshold_tuning.png", dpi=200)
    plt.close(fig)

    # 7. Calibration curve
    prob_true, prob_pred = calibration_curve(y_test, decision_probs, n_bins=10, strategy="quantile")
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.plot(prob_pred, prob_true, marker="o", color="#5D4037", label="Model")
    ax.plot([0, 1], [0, 1], linestyle="--", color="black", label="Perfect calibration")
    ax.set_title("Calibration Curve")
    ax.set_xlabel("Mean predicted probability")
    ax.set_ylabel("Fraction of positives")
    ax.grid(True, linestyle="--", alpha=0.4)
    ax.legend()
    fig.tight_layout()
    fig.savefig(chart_dir / "07_calibration_curve.png", dpi=200)
    plt.close(fig)


def print_metrics(
    y_true: np.ndarray,
    decision_probs: np.ndarray,
    preds: np.ndarray,
    threshold: float,
    rank_probs: np.ndarray | None = None,
) -> dict:
    if rank_probs is None:
        rank_probs = decision_probs
    auc = roc_auc_score(y_true, rank_probs)
    metrics = {
        "auc": float(auc),
        "gini": float(2 * auc - 1),
        "threshold": float(threshold),
        "accuracy": float(accuracy_score(y_true, preds)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, preds)),
        "precision_class_1": float(precision_score(y_true, preds, zero_division=0)),
        "recall_class_1": float(recall_score(y_true, preds, zero_division=0)),
        "f1_class_1": float(f1_score(y_true, preds, zero_division=0)),
        "f2_class_1": float(fbeta_score(y_true, preds, beta=2, zero_division=0)),
        "mcc": float(matthews_corrcoef(y_true, preds)),
        "brier": float(brier_score_loss(y_true, decision_probs)),
        "average_precision": float(average_precision_score(y_true, rank_probs)),
    }

    print("\n================== FULL EVALUATION METRICS ==================")
    print(f"  AUC (Area Under Curve)  : {metrics['auc']:.4f}")
    print(f"  Gini Coefficient        : {metrics['gini']:.4f}")
    print(f"  Average Precision       : {metrics['average_precision']:.4f}")
    print(f"  Optimal Threshold       : {metrics['threshold']:.4f}")
    print(f"  Accuracy (Overall)      : {metrics['accuracy']:.4f}")
    print(f"  Balanced Accuracy       : {metrics['balanced_accuracy']:.4f}")
    print(f"  Precision (Class 1)     : {metrics['precision_class_1']:.4f}")
    print(f"  Recall (Class 1)        : {metrics['recall_class_1']:.4f}")
    print(f"  F1-Score (Class 1)      : {metrics['f1_class_1']:.4f}")
    print(f"  F2-Score (Class 1)      : {metrics['f2_class_1']:.4f}")
    print(f"  MCC (Correlation)       : {metrics['mcc']:.4f}")
    print(f"  Brier Score Loss        : {metrics['brier']:.4f}")
    print("-------------------------------------------------------------")
    print(classification_report(y_true, preds, zero_division=0))
    return metrics


# =============================================================================
# MAIN PIPELINE
# =============================================================================
def run_pipeline() -> dict:
    print("================== STARTING OPTIMIZED XGBOOST LOW PIPELINE ==================")
    print(f"Data file         : {ACCEPTED_CSV}")
    print(f"Model dir         : {MODEL_DIR}")
    print(f"Chart dir         : {CHART_DIR}")
    print(f"Features          : {len(FEATURE_NAMES)}")
    print(f"Resampling        : {'enabled' if USE_RESAMPLING and HAS_IMBLEARN else 'disabled'}")
    print(f"Optuna            : {'enabled' if HAS_OPTUNA else 'disabled'}")
    print(f"XGBoost device    : {XGB_DEVICE}")

    df, feature_names = get_clean_data(ACCEPTED_CSV, limit=MAX_SAMPLES)
    X = df[feature_names].to_numpy(dtype=np.float32)
    y = df["is_default"].to_numpy(dtype=np.int8)
    del df
    gc.collect()

    test_size = TEST_SIZE
    if MIN_TEST_SAMPLES and len(y) * test_size < MIN_TEST_SAMPLES and not MAX_SAMPLES:
        test_size = min(MIN_TEST_SAMPLES / len(y), 0.40)
        print(f"Adjusted test_size to {test_size:.2%} to keep at least {MIN_TEST_SAMPLES:,} test rows.")

    X_train_full, X_test, y_train_full, y_test = train_test_split(
        X,
        y,
        test_size=test_size,
        stratify=y,
        random_state=RANDOM_STATE,
    )
    del X, y
    gc.collect()

    X_train_raw, X_val_raw, y_train, y_val = train_test_split(
        X_train_full,
        y_train_full,
        test_size=VAL_SIZE,
        stratify=y_train_full,
        random_state=RANDOM_STATE + 1,
    )
    del X_train_full, y_train_full
    gc.collect()

    print("\nSplit summary:")
    _class_summary("  Train", y_train)
    _class_summary("  Valid", y_val)
    _class_summary("  Test ", y_test)

    print("\nScaling features before SMOTE...")
    scalers, X_train_scaled = create_per_feature_scalers(X_train_raw, feature_names)
    X_val_scaled = apply_per_feature_scalers(X_val_raw, scalers, feature_names)
    X_test_scaled = apply_per_feature_scalers(X_test, scalers, feature_names)
    del X_train_raw, X_val_raw
    gc.collect()

    X_fit, y_fit, resampling_method = resample_training_data(X_train_scaled, y_train, feature_names)
    del X_train_scaled
    gc.collect()

    scale_pos_weight = float(np.sum(y_fit == 0) / max(np.sum(y_fit == 1), 1))
    print(f"scale_pos_weight after resampling = {scale_pos_weight:.4f}")

    print("\nTuning XGBoost...")
    best_params, tune_score = tune_xgb(X_fit, y_fit, feature_names, scale_pos_weight)
    if best_params:
        print(f"Best tune {THRESHOLD_METRIC}: {tune_score:.4f}")
        for k, v in best_params.items():
            print(f"  {k}: {v:.6f}" if isinstance(v, float) else f"  {k}: {v}")

    print("\nTraining final XGBoost with validation early stopping...")
    model = build_xgb(scale_pos_weight, feature_names, tuned_params=best_params)
    model.fit(X_fit, y_fit, eval_set=[(X_val_scaled, y_val)], verbose=50)
    best_iteration = getattr(model, "best_iteration", None)
    if best_iteration is not None:
        print(f"Best iteration: {best_iteration + 1}")

    print("\nCalibrating probabilities with validation IsotonicRegression...")
    val_raw = model.predict_proba(X_val_scaled)[:, 1]
    test_raw = model.predict_proba(X_test_scaled)[:, 1]
    calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    calibrator.fit(val_raw, y_val)
    val_cal = calibrator.predict(val_raw)
    test_cal = calibrator.predict(test_raw)

    raw_t, raw_val_score = find_optimal_threshold(y_val, val_raw, metric=THRESHOLD_METRIC)
    cal_t, cal_val_score = find_optimal_threshold(y_val, val_cal, metric=THRESHOLD_METRIC)
    if cal_val_score >= raw_val_score:
        threshold = cal_t
        decision_source = "calibrated"
        decision_probs = test_cal
        val_threshold_score = cal_val_score
    else:
        threshold = raw_t
        decision_source = "raw"
        decision_probs = test_raw
        val_threshold_score = raw_val_score
    preds = (decision_probs >= threshold).astype(np.int8)

    raw_auc = roc_auc_score(y_test, test_raw)
    cal_auc = roc_auc_score(y_test, test_cal)
    print("\n---------------- EVALUATION ----------------")
    print(f"Validation threshold source: {decision_source}")
    print(f"Validation {THRESHOLD_METRIC}: {val_threshold_score:.4f}")
    print(f"Raw test AUC       : {raw_auc:.4f}")
    print(f"Calibrated test AUC: {cal_auc:.4f}")

    # Use calibrated probabilities for Brier/PD if they are the selected decision source.
    # Use raw probabilities for the main AUC label because calibration can create ties.
    metrics = print_metrics(y_test, decision_probs, preds, threshold, rank_probs=test_raw)
    metrics["raw_auc"] = float(raw_auc)
    metrics["calibrated_auc"] = float(cal_auc)
    metrics["validation_threshold_score"] = float(val_threshold_score)
    metrics["decision_source"] = decision_source

    print("\nSaving model artifacts...")
    model_path = MODEL_DIR / "xgboost_final_model.json"
    low_model_path = MODEL_DIR / "xgb_pd_model_low.json"
    model.save_model(model_path)
    model.save_model(low_model_path)
    joblib.dump(scalers, MODEL_DIR / "per_feature_scalers_low.joblib")
    joblib.dump(calibrator, MODEL_DIR / "iso_calibrator_low.joblib")

    importance = _feature_importance(model, feature_names)
    metadata = {
        "version": "low_xgb_v2_optimized",
        "random_state": RANDOM_STATE,
        "features": feature_names,
        "n_features": len(feature_names),
        "target": "is_default",
        "paths": {
            "model": str(model_path),
            "compat_model": str(low_model_path),
            "scalers": str(MODEL_DIR / "per_feature_scalers_low.joblib"),
            "calibrator": str(MODEL_DIR / "iso_calibrator_low.joblib"),
        },
        "split": {
            "test_size": test_size,
            "validation_size_of_train": VAL_SIZE,
            "test_rows": int(len(y_test)),
            "validation_rows": int(len(y_val)),
            "train_rows_after_resampling": int(len(y_fit)),
        },
        "resampling": {
            "enabled": bool(USE_RESAMPLING and HAS_IMBLEARN),
            "method": resampling_method,
            "target_minority_rate": TARGET_MINORITY_RATE,
            "scale_pos_weight": scale_pos_weight,
        },
        "threshold": {
            "metric": THRESHOLD_METRIC,
            "value": float(threshold),
            "probability_source": decision_source,
        },
        "xgboost": {
            "device": XGB_DEVICE,
            "best_iteration": int(best_iteration + 1) if best_iteration is not None else None,
            "tuned_params": best_params,
            "tune_score": float(tune_score),
        },
        "metrics": metrics,
        "feature_importance": importance,
    }
    _save_json(MODEL_DIR / "metadata_low.json", metadata)
    _save_json(
        MODEL_DIR / "features.json",
        {
            "features": feature_names,
            "threshold": float(threshold),
            "threshold_metric": THRESHOLD_METRIC,
            "probability_source": decision_source,
            "scaling_required": True,
            "calibration_available": True,
        },
    )

    generate_charts(
        model=model,
        feature_names=feature_names,
        y_test=y_test,
        rank_probs=test_raw,
        decision_probs=decision_probs,
        preds=preds,
        threshold=threshold,
        auc=raw_auc,
        chart_dir=CHART_DIR,
    )

    print(f"All 7 charts saved at: {CHART_DIR}")
    print("================== PIPELINE COMPLETE ==================")
    return metadata


if __name__ == "__main__":
    run_pipeline()
