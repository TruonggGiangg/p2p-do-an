"""
AIScore training script for credit default risk data.

Goal:
- Train a default-risk model from the Kaggle-style loan approval dataset first
    so all mobile/admin form fields are used. LendingClub-style data is supported
    only when explicitly selected or when loan_data.csv is unavailable.
- Normalize input credit_score from the observed 390-850 scale to the P2P/CIC
  150-750 scale.
- Export probabilities, 150-750 model scores, rule-based explanations, model
  artifacts, test predictions, and many charts.

Colab quick start:
1. Upload loan_data.csv and this file to the same Colab folder, or set
    DATA_CSV_NEW_DATA=/path/to/your.csv.
2. Run: python train_model_with_new_data.py
3. On Colab, outputs are written to:
   /content/drive/MyDrive/Colab Notebooks/charts_final
   /content/drive/MyDrive/Colab Notebooks/models_final
   /content/drive/MyDrive/Colab Notebooks/reports_final

Target note:
- Default mode: loan_status=1 -> Default, loan_status=0 -> Non-Default.
- The model target is is_default: 1=Default, 0=Non-Default.
- If your dataset uses loan_status=0 as Default, set
    TARGET_MODE_NEW_DATA=status_0_is_default.
"""

from __future__ import annotations

import json
import importlib
import importlib.util
import os
import subprocess
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.calibration import calibration_curve
from sklearn.compose import ColumnTransformer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
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
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)
sns.set_theme(style="whitegrid", font_scale=0.95)


# =============================================================================
# Config
# =============================================================================


RANDOM_STATE = int(os.environ.get("RANDOM_STATE_NEW_DATA", "42"))
TARGET_MODE = os.environ.get("TARGET_MODE_NEW_DATA", "as_is").lower()
THRESHOLD_METRIC = os.environ.get("THRESHOLD_METRIC_NEW_DATA", "f2").lower()
MAX_SAMPLES_ENV = os.environ.get("MAX_SAMPLES_NEW_DATA", "").strip()
MAX_SAMPLES = int(MAX_SAMPLES_ENV) if MAX_SAMPLES_ENV else None
SKIP_CHARTS = os.environ.get("SKIP_CHARTS_NEW_DATA", "0") == "1"
DO_PERMUTATION_IMPORTANCE = os.environ.get("PERMUTATION_IMPORTANCE_NEW_DATA", "0") == "1"

TEST_SIZE = float(os.environ.get("TEST_SIZE_NEW_DATA", "0.20"))
VAL_SIZE = float(os.environ.get("VAL_SIZE_NEW_DATA", "0.15"))

CREDIT_SCORE_TARGET_MIN = 150.0
CREDIT_SCORE_TARGET_MAX = 750.0
CREDIT_SCORE_DEFAULT_SOURCE_MIN = 390.0
CREDIT_SCORE_DEFAULT_SOURCE_MAX = 850.0
CREDIT_SCORE_SOURCE_MIN_ENV = os.environ.get("CREDIT_SCORE_SOURCE_MIN_NEW_DATA", "").strip()
CREDIT_SCORE_SOURCE_MAX_ENV = os.environ.get("CREDIT_SCORE_SOURCE_MAX_NEW_DATA", "").strip()

XGB_N_ESTIMATORS = int(os.environ.get("XGB_N_ESTIMATORS_NEW_DATA", "500"))
XGB_MAX_DEPTH = int(os.environ.get("XGB_MAX_DEPTH_NEW_DATA", "4"))
XGB_LEARNING_RATE = float(os.environ.get("XGB_LEARNING_RATE_NEW_DATA", "0.05"))
XGB_EARLY_STOPPING_ROUNDS = int(os.environ.get("XGB_EARLY_STOPPING_ROUNDS_NEW_DATA", "35"))
XGB_TREE_METHOD = os.environ.get("XGB_TREE_METHOD_NEW_DATA", "hist").strip().lower()
XGB_DEVICE_REQUEST = os.environ.get("XGB_DEVICE_NEW_DATA", "auto").strip().lower()

RUNNING_IN_COLAB = Path("/content").exists() and (
    "COLAB_RELEASE_TAG" in os.environ
    or "COLAB_BACKEND_VERSION" in os.environ
    or "COLAB_GPU" in os.environ
)

BASE_DIR = Path(__file__).resolve().parent if "__file__" in globals() else Path.cwd()
DEFAULT_OUTPUT_ROOT = (
    Path("/content/drive/MyDrive/Colab Notebooks")
    if RUNNING_IN_COLAB
    else BASE_DIR / "outputs_new_data"
)
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR_NEW_DATA", str(DEFAULT_OUTPUT_ROOT)))
MODEL_DIR = Path(os.environ.get("MODEL_DIR_NEW_DATA", str(OUTPUT_DIR / "models_final")))
CHART_DIR = Path(os.environ.get("CHART_DIR_NEW_DATA", str(OUTPUT_DIR / "charts_final")))
REPORT_DIR = Path(os.environ.get("REPORT_DIR_NEW_DATA", str(OUTPUT_DIR / "reports_final")))
SPLIT_DIR = Path(os.environ.get("SPLIT_DIR_NEW_DATA", str(REPORT_DIR / "splits")))


LABEL_DEFAULT = "Default"
LABEL_NON_DEFAULT = "Non-Default"
TARGET_COLUMN = "loan_status"

# These columns are required from loan_data.csv. Do not add old LendingClub
# columns here unless loan_data.csv actually contains them. loan_term_months is
# configured separately because the 45k canonical dataset does not contain a
# real term/duration column.
BASE_RAW_MODEL_INPUT_COLUMNS = [
    "person_age",
    "person_gender",
    "person_education",
    "person_income",
    "person_emp_exp",
    "person_home_ownership",
    "loan_amnt",
    "loan_intent",
    "loan_int_rate",
    "loan_percent_income",
    "cb_person_cred_hist_length",
    "credit_score",
    "previous_loan_defaults_on_file",
]

TERM_RAW_INPUT_COLUMNS = ["loan_term_months"]
OPTIONAL_RUNTIME_INPUT_COLUMNS = ["loan_term_months", "loan_monthly_payment_ratio"]

# auto: use loan_term_months only when the selected training source really has
# it. required: fail if there is no real term column. off: never train on term.
TERM_FEATURE_MODE = os.environ.get("TERM_FEATURE_MODE_NEW_DATA", "auto").strip().lower()
TERM_ADJUSTMENT_ENABLED = os.environ.get("TERM_ADJUSTMENT_ENABLED_NEW_DATA", "1") == "1"
TERM_ADJUSTMENT_WEIGHT = float(os.environ.get("TERM_ADJUSTMENT_WEIGHT_NEW_DATA", "0.40"))
TERM_ADJUSTMENT_BASELINE_MONTHS = float(os.environ.get("TERM_ADJUSTMENT_BASELINE_MONTHS_NEW_DATA", "36"))
MAX_TERM_SAMPLES_ENV = os.environ.get("MAX_TERM_SAMPLES_NEW_DATA", "120000").strip()
MAX_TERM_SAMPLES = int(MAX_TERM_SAMPLES_ENV) if MAX_TERM_SAMPLES_ENV else None

# These globals are finalized by configure_feature_contract() after the data is
# loaded and canonicalized. Keeping them global preserves the rest of the script
# and the exported metadata contract used by scorer_final.py.
RAW_MODEL_INPUT_COLUMNS = BASE_RAW_MODEL_INPUT_COLUMNS.copy()
REQUIRED_COLUMNS = RAW_MODEL_INPUT_COLUMNS + [TARGET_COLUMN]

# Currency-invariant training mode.
# Default is off so the app fields person_income and loan_amnt from the 45k
# canonical dataset are actually trained. Turn it on only if the backend sends
# unscaled local currency and you want ratios + scale-invariant signals only.
CURRENCY_INVARIANT_MODE = os.environ.get("CURRENCY_INVARIANT_MODE", "0") == "1"

TERM_AWARE_MODEL_FEATURES = [
    "loan_term_months",
    "loan_monthly_payment_ratio",
]

TERM_ADJUSTMENT_FEATURES = [
    "loan_term_months",
    "loan_monthly_payment_ratio",
    "loan_percent_income",
    "loan_int_rate",
]

BASE_RAW_NUMERIC_INPUT_COLUMNS = (
    [
        "person_age",
        "person_emp_exp",
        "loan_int_rate",
        "loan_percent_income",
        "cb_person_cred_hist_length",
        "credit_score",
    ]
    if CURRENCY_INVARIANT_MODE
    else [
        "person_age",
        "person_income",
        "person_emp_exp",
        "loan_amnt",
        "loan_int_rate",
        "loan_percent_income",
        "cb_person_cred_hist_length",
        "credit_score",
    ]
)

RAW_NUMERIC_INPUT_COLUMNS = BASE_RAW_NUMERIC_INPUT_COLUMNS.copy()

# One necessary derived model feature: maps Yes/No to 1/0.
DERIVED_MODEL_FEATURES = [
    "previous_default_bin",
]

NUMERIC_FEATURES = RAW_NUMERIC_INPUT_COLUMNS + DERIVED_MODEL_FEATURES

CATEGORICAL_FEATURES = [
    "person_gender",
    "person_education",
    "person_home_ownership",
    "loan_intent",
]

MODEL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

# No extra engineered columns are added to the training frame. Rule-based
# explanation is computed directly from the current loan_data.csv fields.
EXPLAIN_ONLY_FEATURES: list[str] = []


def target_label(values: Any) -> np.ndarray:
    arr = np.asarray(values)
    return np.where(arr.astype(int) == 1, LABEL_DEFAULT, LABEL_NON_DEFAULT)


def target_mapping() -> dict[str, str]:
    if TARGET_MODE in {"as_is", "loan_status_is_default", "status_1_is_default"}:
        return {
            "loan_status=1": LABEL_DEFAULT,
            "loan_status=0": LABEL_NON_DEFAULT,
            "is_default=1": LABEL_DEFAULT,
            "is_default=0": LABEL_NON_DEFAULT,
            "LendingClub Charged Off/Default/Late": LABEL_DEFAULT,
            "LendingClub Fully Paid": LABEL_NON_DEFAULT,
        }
    return {
        "loan_status=0": LABEL_DEFAULT,
        "loan_status=1": LABEL_NON_DEFAULT,
        "is_default=1": LABEL_DEFAULT,
        "is_default=0": LABEL_NON_DEFAULT,
    }


def feature_dictionary() -> pd.DataFrame:
    def role(column: str, default_role: str) -> str:
        if column in MODEL_FEATURES:
            return default_role
        if column in OPTIONAL_RUNTIME_INPUT_COLUMNS:
            return "runtime_optional_not_trained"
        return "raw_input"

    rows = [
        ("person_age", role("person_age", "model_numeric"), "Tuoi nguoi vay"),
        ("person_income", role("person_income", "model_numeric"), "Thu nhap nam"),
        ("person_emp_exp", role("person_emp_exp", "model_numeric"), "So nam kinh nghiem lam viec"),
        ("loan_amnt", role("loan_amnt", "model_numeric"), "So tien vay"),
        ("loan_term_months", role("loan_term_months", "model_numeric"), "Ky han vay theo thang"),
        ("loan_int_rate", role("loan_int_rate", "model_numeric"), "Lai suat khoan vay"),
        ("loan_percent_income", role("loan_percent_income", "model_numeric"), "Ti le tien vay / thu nhap nam"),
        ("loan_monthly_payment_ratio", role("loan_monthly_payment_ratio", "model_numeric"), "Tien goc phai tra moi thang / thu nhap thang"),
        ("cb_person_cred_hist_length", role("cb_person_cred_hist_length", "model_numeric"), "Do dai lich su tin dung"),
        ("credit_score", role("credit_score", "model_numeric"), "Diem tin dung da chuan hoa 150-750"),
        ("previous_default_bin", role("previous_default_bin", "model_numeric"), "1 neu tung quyt no, 0 neu chua"),
        ("person_gender", role("person_gender", "model_category"), "Gioi tinh"),
        ("person_education", role("person_education", "model_category"), "Trinh do hoc van"),
        ("person_home_ownership", role("person_home_ownership", "model_category"), "Tinh trang nha o"),
        ("loan_intent", role("loan_intent", "model_category"), "Muc dich vay"),
        ("loan_status", "target", "Default mode label: 1=Default, 0=Non-Default"),
        ("previous_loan_defaults_on_file", "raw_input", "Raw Yes/No column converted to previous_default_bin"),
        ("credit_score_raw", "audit_only", "Diem tin dung goc truoc khi chuan hoa"),
        ("source_row_id", "audit_only", "Ma dong de truy vet split ve CSV goc"),
    ]
    for col in EXPLAIN_ONLY_FEATURES:
        rows.append((col, "explain_only", "Tinh them de giai thich rule, khong dua vao model"))
    return pd.DataFrame(rows, columns=["column", "role", "meaning"])


def has_real_term_values(raw: pd.DataFrame) -> bool:
    if "loan_term_months" not in raw.columns:
        return False
    term = pd.to_numeric(raw["loan_term_months"], errors="coerce")
    return bool(term.between(1, 360).any())


def configure_feature_contract(raw: pd.DataFrame) -> bool:
    global RAW_MODEL_INPUT_COLUMNS, REQUIRED_COLUMNS, RAW_NUMERIC_INPUT_COLUMNS, NUMERIC_FEATURES, MODEL_FEATURES

    term_mode = TERM_FEATURE_MODE if TERM_FEATURE_MODE in {"auto", "required", "off"} else "auto"
    term_available = has_real_term_values(raw)
    include_term = term_mode == "required" or (term_mode == "auto" and term_available)

    if term_mode == "required" and not term_available:
        raise ValueError(
            "TERM_FEATURE_MODE_NEW_DATA=required but selected training data has no real loan_term_months/term values. "
            "Use a CSV with a real term column or set TERM_FEATURE_MODE_NEW_DATA=auto/off."
        )

    RAW_MODEL_INPUT_COLUMNS = BASE_RAW_MODEL_INPUT_COLUMNS + (TERM_RAW_INPUT_COLUMNS if include_term else [])
    REQUIRED_COLUMNS = RAW_MODEL_INPUT_COLUMNS + [TARGET_COLUMN]
    RAW_NUMERIC_INPUT_COLUMNS = BASE_RAW_NUMERIC_INPUT_COLUMNS + (TERM_AWARE_MODEL_FEATURES if include_term else [])
    NUMERIC_FEATURES = RAW_NUMERIC_INPUT_COLUMNS + DERIVED_MODEL_FEATURES
    MODEL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

    print(
        "[features] "
        f"currency_invariant={int(CURRENCY_INVARIANT_MODE)} | "
        f"term_mode={term_mode} | term_available={term_available} | term_in_model={include_term}"
    )
    return include_term


# =============================================================================
# Setup helpers
# =============================================================================


def is_colab() -> bool:
    return RUNNING_IN_COLAB


def install_if_missing(import_name: str, package_name: str | None = None) -> bool:
    package_name = package_name or import_name
    try:
        __import__(import_name)
        return True
    except Exception:
        if not is_colab():
            return False
        print(f"[setup] Installing {package_name} ...")
        subprocess.check_call(["pip", "install", "-q", package_name])
        __import__(import_name)
        return True


def maybe_mount_drive() -> None:
    if not is_colab():
        return
    try:
        drive = importlib.import_module("google.colab.drive")
    except Exception:
        return

    drive.mount("/content/drive", force_remount=False)


def ensure_output_dirs() -> None:
    for path in (OUTPUT_DIR, MODEL_DIR, CHART_DIR, REPORT_DIR, SPLIT_DIR):
        path.mkdir(parents=True, exist_ok=True)


def ensure_parent(path: Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)


def write_csv(df: pd.DataFrame, path: Path, index: bool = False) -> None:
    ensure_parent(path)
    df.to_csv(path, index=index)


maybe_mount_drive()
ensure_output_dirs()

print("[paths]")
print(f"  output_root: {OUTPUT_DIR}")
print(f"  models     : {MODEL_DIR}")
print(f"  charts     : {CHART_DIR}")
print(f"  reports    : {REPORT_DIR}")
print(f"  splits     : {SPLIT_DIR}")

if not install_if_missing("xgboost", "xgboost"):
    raise RuntimeError("xgboost is required. Install with: pip install xgboost")

import xgboost as xgb
from sklearn.isotonic import IsotonicRegression


def find_data_csv() -> Path:
    env_path = os.environ.get("DATA_CSV_NEW_DATA", "").strip()
    candidates = []
    if env_path:
        candidates.append(Path(env_path))
    candidates.extend(
        [
            BASE_DIR / "loan_data.csv",
            BASE_DIR / "financial_loan.csv",
            BASE_DIR / "accepted_2007_to_2018Q4.csv",
            Path.cwd() / "loan_data.csv",
            Path.cwd() / "financial_loan.csv",
            Path.cwd() / "accepted_2007_to_2018Q4.csv",
            Path("/content/loan_data.csv"),
            Path("/content/financial_loan.csv"),
            Path("/content/accepted_2007_to_2018Q4.csv"),
            Path("/content/drive/MyDrive/Colab Notebooks/loan_data.csv"),
            Path("/content/drive/MyDrive/Colab Notebooks/financial_loan.csv"),
            Path("/content/drive/MyDrive/Colab Notebooks/accepted_2007_to_2018Q4.csv"),
            Path("/content/drive/MyDrive/loan_data.csv"),
            Path("/content/drive/MyDrive/financial_loan.csv"),
            Path("/content/drive/MyDrive/accepted_2007_to_2018Q4.csv"),
        ]
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "Cannot find loan_data.csv, financial_loan.csv, or accepted_2007_to_2018Q4.csv. "
        "Put one next to this script or set DATA_CSV_NEW_DATA."
    )


def find_term_data_csv(primary_data_csv: Path) -> Path | None:
    env_path = os.environ.get("TERM_DATA_CSV_NEW_DATA", "").strip()
    candidates: list[Path] = []
    if env_path:
        candidates.append(Path(env_path))
    candidates.extend(
        [
            primary_data_csv,
            BASE_DIR / "financial_loan.csv",
            BASE_DIR / "accepted_2007_to_2018Q4.csv",
            Path.cwd() / "financial_loan.csv",
            Path.cwd() / "accepted_2007_to_2018Q4.csv",
            Path("/content/financial_loan.csv"),
            Path("/content/accepted_2007_to_2018Q4.csv"),
            Path("/content/drive/MyDrive/Colab Notebooks/financial_loan.csv"),
            Path("/content/drive/MyDrive/Colab Notebooks/accepted_2007_to_2018Q4.csv"),
            Path("/content/drive/MyDrive/financial_loan.csv"),
            Path("/content/drive/MyDrive/accepted_2007_to_2018Q4.csv"),
        ]
    )

    seen: set[Path] = set()
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except Exception:
            resolved = candidate
        if resolved in seen or not candidate.exists():
            continue
        seen.add(resolved)
        try:
            header = pd.read_csv(candidate, nrows=0)
        except Exception:
            continue
        if any(col in set(header.columns) for col in TERM_SOURCE_COLUMNS):
            return candidate
    return None


def save_json(path: Path, payload: dict[str, Any] | list[Any]) -> None:
    ensure_parent(path)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


# =============================================================================
# Dataset schema normalization
# =============================================================================


LENDINGCLUB_DEFAULT_STATUSES = {
    "charged off",
    "default",
    "late (31-120 days)",
    "late (16-30 days)",
    "does not meet the credit policy. status:charged off",
}

LENDINGCLUB_NON_DEFAULT_STATUSES = {
    "fully paid",
    "does not meet the credit policy. status:fully paid",
}

TERM_SOURCE_COLUMNS = [
    "loan_term_months",
    "periodMonth",
    "loanTermMonths",
    "term_months",
    "term",
    "duration_months",
    "tenor_months",
]

LENDINGCLUB_USECOLS = [
    "loan_status",
    "term",
    "loan_amnt",
    "loan_amount",
    "annual_inc",
    "annual_income",
    "int_rate",
    "installment",
    "home_ownership",
    "purpose",
    "emp_length",
    "fico_range_low",
    "fico_range_high",
    "earliest_cr_line",
    "issue_d",
    "delinq_2yrs",
    "pub_rec",
]


def read_training_csv(data_csv: Path) -> pd.DataFrame:
    header = pd.read_csv(data_csv, nrows=0)
    columns = [str(c).strip() for c in header.columns]
    column_set = set(columns)
    lendingclub_like = "term" in column_set and (
        {"annual_inc", "loan_amnt"}.issubset(column_set)
        or {"annual_income", "loan_amount"}.issubset(column_set)
    )
    usecols = [c for c in LENDINGCLUB_USECOLS if c in column_set] if lendingclub_like else None
    raw = pd.read_csv(data_csv, usecols=usecols, low_memory=False).reset_index(drop=True)
    raw.columns = [str(c).strip() for c in raw.columns]
    return raw


def parse_term_months(series: pd.Series) -> pd.Series:
    extracted = series.astype(str).str.extract(r"(\d+(?:\.\d+)?)", expand=False)
    return pd.to_numeric(extracted, errors="coerce")


def parse_percent(series: pd.Series) -> pd.Series:
    text = series.astype(str).str.replace("%", "", regex=False).str.strip()
    value = pd.to_numeric(text, errors="coerce")
    return value.where(value > 1.0, value * 100.0)


def parse_emp_length_years(series: pd.Series) -> pd.Series:
    text = series.astype(str).str.lower().str.strip()
    value = pd.to_numeric(text.str.extract(r"(\d+)", expand=False), errors="coerce")
    value = value.where(~text.str.contains("<", regex=False), 0)
    value = value.where(~text.str.contains("10+", regex=False), 10)
    return value.fillna(0).clip(0, 60)


def map_loan_intent(value: Any) -> str:
    text = str(value or "").strip().lower().replace(" ", "_").replace("-", "_")
    if text in {"debt_consolidation", "credit_card"}:
        return "DEBTCONSOLIDATION"
    if text in {"educational", "education"}:
        return "EDUCATION"
    if text in {"medical"}:
        return "MEDICAL"
    if text in {"small_business", "business", "venture"}:
        return "VENTURE"
    if text in {"home_improvement", "house"}:
        return "HOMEIMPROVEMENT"
    return "PERSONAL"


def map_lendingclub_target(status: pd.Series) -> pd.Series:
    text = status.astype(str).str.strip().str.lower()
    mapped = pd.Series(np.nan, index=status.index, dtype="float")
    mapped.loc[text.isin(LENDINGCLUB_DEFAULT_STATUSES)] = 1
    mapped.loc[text.isin(LENDINGCLUB_NON_DEFAULT_STATUSES)] = 0
    return mapped


def credit_history_years(raw: pd.DataFrame) -> pd.Series:
    if {"issue_d", "earliest_cr_line"}.issubset(raw.columns):
        issue = pd.to_datetime(raw["issue_d"], errors="coerce")
        earliest = pd.to_datetime(raw["earliest_cr_line"], errors="coerce")
        years = (issue - earliest).dt.days / 365.25
        return years.clip(0, 50).fillna(3)
    return pd.Series(3.0, index=raw.index)


def column_or_default(raw: pd.DataFrame, column: str, default: Any) -> pd.Series:
    if column in raw.columns:
        return raw[column]
    return pd.Series(default, index=raw.index)


def canonicalize_training_schema(raw: pd.DataFrame) -> tuple[pd.DataFrame, str, dict[str, Any]]:
    raw = raw.copy()
    raw.columns = [str(c).strip() for c in raw.columns]
    column_set = set(raw.columns)

    term_source = next((col for col in TERM_SOURCE_COLUMNS if col in column_set), None)
    if term_source and term_source != "loan_term_months":
        raw["loan_term_months"] = parse_term_months(raw[term_source])

    lendingclub_like = "term" in column_set and (
        {"annual_inc", "loan_amnt"}.issubset(column_set)
        or {"annual_income", "loan_amount"}.issubset(column_set)
    )
    if not lendingclub_like:
        return raw, "loan_data", {
            "note": "Input already uses the canonical loan_data schema.",
        }

    loan_amount_col = "loan_amnt" if "loan_amnt" in raw.columns else "loan_amount"
    income_col = "annual_inc" if "annual_inc" in raw.columns else "annual_income"
    status_target = map_lendingclub_target(raw["loan_status"])
    keep_mask = status_target.notna()
    dropped = int((~keep_mask).sum())
    source = raw.loc[keep_mask].reset_index(drop=True).copy()
    status_target = status_target.loc[keep_mask].astype(np.int8).reset_index(drop=True)

    loan_amount = pd.to_numeric(source[loan_amount_col], errors="coerce")
    annual_income = pd.to_numeric(source[income_col], errors="coerce")
    term_months = parse_term_months(source["term"])
    fico_low = pd.to_numeric(column_or_default(source, "fico_range_low", 600), errors="coerce")
    fico_high = pd.to_numeric(column_or_default(source, "fico_range_high", fico_low), errors="coerce")
    credit_score = pd.concat([fico_low, fico_high], axis=1).mean(axis=1)

    out = pd.DataFrame(index=source.index)
    out["person_age"] = 35.0
    out["person_gender"] = "UNKNOWN"
    out["person_education"] = "UNKNOWN"
    out["person_income"] = annual_income
    out["person_emp_exp"] = parse_emp_length_years(column_or_default(source, "emp_length", ""))
    out["person_home_ownership"] = column_or_default(source, "home_ownership", "OTHER").astype(str).str.upper().replace({"ANY": "OTHER", "NONE": "OTHER"})
    out["loan_amnt"] = loan_amount
    out["loan_term_months"] = term_months
    out["loan_intent"] = column_or_default(source, "purpose", "PERSONAL").map(map_loan_intent)
    out["loan_int_rate"] = parse_percent(column_or_default(source, "int_rate", 12.0))
    out["loan_percent_income"] = (loan_amount / annual_income.replace(0, np.nan)).clip(0, 5)
    out["cb_person_cred_hist_length"] = credit_history_years(source)
    out["credit_score"] = credit_score
    previous_default = (
        pd.to_numeric(column_or_default(source, "delinq_2yrs", 0), errors="coerce").fillna(0).gt(0)
        | pd.to_numeric(column_or_default(source, "pub_rec", 0), errors="coerce").fillna(0).gt(0)
    )
    out["previous_loan_defaults_on_file"] = np.where(previous_default, "Yes", "No")
    out[TARGET_COLUMN] = status_target
    out["source_loan_status_raw"] = source["loan_status"].astype(str)

    return out, "lendingclub", {
        "note": "Mapped LendingClub-style data to the canonical AIScore schema with real term months.",
        "rows_dropped_unresolved_status": dropped,
        "default_statuses": sorted(LENDINGCLUB_DEFAULT_STATUSES),
        "non_default_statuses": sorted(LENDINGCLUB_NON_DEFAULT_STATUSES),
    }


# =============================================================================
# Credit-score normalization and feature engineering
# =============================================================================


def normalize_credit_score(
    score: pd.Series,
    source_min: float,
    source_max: float,
    target_min: float = CREDIT_SCORE_TARGET_MIN,
    target_max: float = CREDIT_SCORE_TARGET_MAX,
) -> pd.Series:
    score_num = pd.to_numeric(score, errors="coerce")
    span = max(source_max - source_min, 1.0)
    normalized = target_min + (score_num - source_min) * (target_max - target_min) / span
    return normalized.clip(target_min, target_max)


def determine_credit_score_source_range(df: pd.DataFrame) -> tuple[float, float]:
    if CREDIT_SCORE_SOURCE_MIN_ENV and CREDIT_SCORE_SOURCE_MAX_ENV:
        return float(CREDIT_SCORE_SOURCE_MIN_ENV), float(CREDIT_SCORE_SOURCE_MAX_ENV)
    observed_min = float(pd.to_numeric(df["credit_score"], errors="coerce").min())
    observed_max = float(pd.to_numeric(df["credit_score"], errors="coerce").max())
    if observed_min >= CREDIT_SCORE_DEFAULT_SOURCE_MIN and observed_max <= CREDIT_SCORE_DEFAULT_SOURCE_MAX:
        return CREDIT_SCORE_DEFAULT_SOURCE_MIN, CREDIT_SCORE_DEFAULT_SOURCE_MAX
    return observed_min, observed_max


def make_target(df: pd.DataFrame) -> pd.Series:
    raw_numeric = pd.to_numeric(df[TARGET_COLUMN], errors="coerce")
    if raw_numeric.notna().all():
        raw_status = raw_numeric.fillna(0).astype(int)
    else:
        mapped = map_lendingclub_target(df[TARGET_COLUMN])
        if mapped.isna().any():
            unsupported = sorted(df.loc[mapped.isna(), TARGET_COLUMN].astype(str).unique().tolist())[:12]
            raise ValueError(
                "Unsupported non-numeric loan_status values. Filter unresolved statuses first. "
                f"Examples: {unsupported}"
            )
        raw_status = mapped.astype(int)
    if TARGET_MODE in {"as_is", "loan_status_is_default", "status_1_is_default"}:
        return raw_status.clip(0, 1).astype(np.int8)
    if TARGET_MODE in {"status_0_is_default", "invert"}:
        return (1 - raw_status.clip(0, 1)).astype(np.int8)
    raise ValueError(
        "TARGET_MODE_NEW_DATA must be one of: status_0_is_default, as_is"
    )


def yes_no_to_binary(series: pd.Series) -> pd.Series:
    text = series.astype(str).str.strip().str.lower()
    return text.isin({"yes", "y", "true", "1"}).astype(float)


def build_feature_frame(
    raw: pd.DataFrame,
    credit_score_source_min: float,
    credit_score_source_max: float,
    include_target: bool = True,
) -> pd.DataFrame:
    df = raw.copy()
    df.columns = [str(c).strip() for c in df.columns]

    required = REQUIRED_COLUMNS if include_target else [c for c in REQUIRED_COLUMNS if c != TARGET_COLUMN]
    missing = sorted(set(required) - set(df.columns))
    if missing:
        raise ValueError(f"Missing columns in training data: {missing}")

    if "source_row_id" not in df.columns:
        df["source_row_id"] = np.arange(len(df))

    numeric_source_columns = [
        "person_age",
        "person_income",
        "person_emp_exp",
        "loan_amnt",
        "loan_int_rate",
        "loan_percent_income",
        "cb_person_cred_hist_length",
        "credit_score",
    ]
    if "loan_term_months" in RAW_MODEL_INPUT_COLUMNS:
        numeric_source_columns.append("loan_term_months")

    for col in numeric_source_columns:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    annual_income = df["person_income"].replace(0, np.nan)
    if "loan_term_months" in MODEL_FEATURES:
        if df["loan_term_months"].isna().all():
            raise ValueError(
                "loan_term_months is configured as a model feature, but selected training data has no real term values."
            )
        df["loan_term_months"] = df["loan_term_months"].clip(1, 360)
        monthly_income = annual_income / 12.0
        monthly_principal = df["loan_amnt"] / df["loan_term_months"].replace(0, np.nan)
        df["loan_monthly_payment_ratio"] = (monthly_principal / monthly_income).replace([np.inf, -np.inf], np.nan).clip(0, 5)

    if df["loan_percent_income"].isna().any():
        df["loan_percent_income"] = (df["loan_amnt"] / annual_income).clip(0, 5)

    df["credit_score_raw"] = df["credit_score"]
    df["credit_score"] = normalize_credit_score(
        df["credit_score_raw"],
        source_min=credit_score_source_min,
        source_max=credit_score_source_max,
    )

    df["previous_default_bin"] = yes_no_to_binary(df["previous_loan_defaults_on_file"])

    for col in NUMERIC_FEATURES:
        df[col] = (
            pd.to_numeric(df[col], errors="coerce")
            .replace([np.inf, -np.inf], np.nan)
            .fillna(df[col].median() if pd.notna(df[col].median()) else 0)
        )

    for col in CATEGORICAL_FEATURES:
        df[col] = df[col].astype(str).str.strip().replace({"": "UNKNOWN"}).fillna("UNKNOWN")

    if include_target:
        df["is_default"] = make_target(df)
        return df[MODEL_FEATURES + ["credit_score_raw", "source_row_id", "is_default"]].copy()
    return df[MODEL_FEATURES + ["credit_score_raw", "source_row_id"]].copy()


@dataclass
class TermAdjustmentArtifacts:
    model: Pipeline
    metadata: dict[str, Any]


def build_term_adjustment_frame(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw.copy()
    df.columns = [str(c).strip() for c in df.columns]
    required = [
        "person_income",
        "loan_amnt",
        "loan_term_months",
        "loan_int_rate",
        "loan_percent_income",
        TARGET_COLUMN,
    ]
    missing = sorted(set(required) - set(df.columns))
    if missing:
        raise ValueError(f"Term adjustment data missing columns: {missing}")

    for col in ["person_income", "loan_amnt", "loan_term_months", "loan_int_rate", "loan_percent_income"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["loan_term_months"] = df["loan_term_months"].clip(1, 360)
    annual_income = df["person_income"].replace(0, np.nan)
    if df["loan_percent_income"].isna().any():
        df["loan_percent_income"] = (df["loan_amnt"] / annual_income).clip(0, 5)
    monthly_income = annual_income / 12.0
    monthly_principal = df["loan_amnt"] / df["loan_term_months"].replace(0, np.nan)
    df["loan_monthly_payment_ratio"] = (monthly_principal / monthly_income).replace([np.inf, -np.inf], np.nan).clip(0, 5)

    for col in TERM_ADJUSTMENT_FEATURES:
        median = df[col].median()
        df[col] = pd.to_numeric(df[col], errors="coerce").replace([np.inf, -np.inf], np.nan).fillna(median if pd.notna(median) else 0)

    df["is_default"] = make_target(df)
    return df[TERM_ADJUSTMENT_FEATURES + ["is_default"]].dropna().copy()


def train_term_adjuster(primary_data_csv: Path) -> TermAdjustmentArtifacts | None:
    if not TERM_ADJUSTMENT_ENABLED:
        print("[term-adjust] disabled by TERM_ADJUSTMENT_ENABLED_NEW_DATA=0")
        return None

    term_data_csv = find_term_data_csv(primary_data_csv)
    if term_data_csv is None:
        print("[term-adjust] skipped: no CSV with a real term column found")
        return None

    raw_source = read_training_csv(term_data_csv)
    raw_term, source_schema, source_schema_info = canonicalize_training_schema(raw_source)
    if not has_real_term_values(raw_term):
        print(f"[term-adjust] skipped: {term_data_csv} has no usable term values")
        return None

    if MAX_TERM_SAMPLES is not None and MAX_TERM_SAMPLES < len(raw_term):
        raw_term, _ = train_test_split(
            raw_term,
            train_size=MAX_TERM_SAMPLES,
            random_state=RANDOM_STATE,
            stratify=make_target(raw_term),
        )
        raw_term = raw_term.reset_index(drop=True)

    term_df = build_term_adjustment_frame(raw_term)
    if term_df["is_default"].nunique() < 2:
        print("[term-adjust] skipped: term data does not contain both target classes")
        return None

    train_df, test_df = train_test_split(
        term_df,
        test_size=0.20,
        random_state=RANDOM_STATE,
        stratify=term_df["is_default"],
    )
    X_train = train_df[TERM_ADJUSTMENT_FEATURES]
    y_train = train_df["is_default"].to_numpy(dtype=np.int8)
    X_test = test_df[TERM_ADJUSTMENT_FEATURES]
    y_test = test_df["is_default"].to_numpy(dtype=np.int8)

    model = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "classifier",
                LogisticRegression(
                    max_iter=1000,
                    class_weight="balanced",
                    random_state=RANDOM_STATE,
                ),
            ),
        ]
    )
    model.fit(X_train, y_train)
    proba = model.predict_proba(X_test)[:, 1]
    metrics = classification_metrics(y_test, proba, 0.50)
    metadata = {
        "enabled": True,
        "data_csv": str(term_data_csv),
        "source_schema": source_schema,
        "source_schema_info": source_schema_info,
        "rows": int(len(term_df)),
        "features": TERM_ADJUSTMENT_FEATURES,
        "baseline_months": TERM_ADJUSTMENT_BASELINE_MONTHS,
        "weight": TERM_ADJUSTMENT_WEIGHT,
        "payment_burden_guard": "If the requested term raises loan_monthly_payment_ratio above the 36-month baseline, runtime will not allow the term delta to reduce PD.",
        "metrics": metrics,
        "note": "Auxiliary real-term model. Runtime applies the logit delta between requested term burden and baseline term burden to the 45k base PD, with a monotonic payment-burden guard for very short terms.",
    }
    print(
        "[term-adjust] trained "
        f"source={term_data_csv.name} rows={len(term_df):,} "
        f"auc={metrics['roc_auc']:.4f} accuracy={metrics['accuracy']:.4f}"
    )
    return TermAdjustmentArtifacts(model=model, metadata=metadata)


# =============================================================================
# Scoring and rule-based explanations
# =============================================================================


RISK_BANDS = [
    (700, 750, "Very low risk", "approve"),
    (650, 699, "Low risk", "approve"),
    (550, 649, "Medium risk", "manual_review"),
    (450, 549, "High risk", "manual_review"),
    (150, 449, "Very high risk", "reject_or_strict_review"),
]


def probability_to_score_150_750(default_probability: np.ndarray | float) -> np.ndarray:
    pd_arr = np.asarray(default_probability, dtype=float)
    score = CREDIT_SCORE_TARGET_MAX - (CREDIT_SCORE_TARGET_MAX - CREDIT_SCORE_TARGET_MIN) * pd_arr
    return np.rint(np.clip(score, CREDIT_SCORE_TARGET_MIN, CREDIT_SCORE_TARGET_MAX)).astype(int)


def score_to_risk_band(score: float) -> tuple[str, str]:
    for lo, hi, label, decision in RISK_BANDS:
        if lo <= score <= hi:
            return label, decision
    if score < 150:
        return "Very high risk", "reject_or_strict_review"
    return "Very low risk", "approve"


def rule_based_explanation(row: pd.Series | dict[str, Any]) -> dict[str, Any]:
    r = pd.Series(row)
    score = 750
    reasons: list[str] = []

    def add(points: int, reason: str) -> None:
        nonlocal score
        score += points
        sign = "+" if points >= 0 else ""
        reasons.append(f"{sign}{points}: {reason}")

    credit_score = float(r.get("credit_score", r.get("credit_score_raw", 600)))
    loan_percent_income = float(r.get("loan_percent_income", 0))
    loan_int_rate = float(r.get("loan_int_rate", 0))
    prev_default = float(r.get("previous_default_bin", 0))
    income = float(r.get("person_income", 0))
    emp_exp = float(r.get("person_emp_exp", 0))
    credit_hist = float(r.get("cb_person_cred_hist_length", 0))
    home = str(r.get("person_home_ownership", "")).upper()
    intent = str(r.get("loan_intent", "")).upper()
    age = float(r.get("person_age", 0))

    if prev_default >= 0.5:
        add(-140, "previous_loan_defaults_on_file=Yes")
    else:
        add(+25, "previous_loan_defaults_on_file=No")

    if credit_score < 300:
        add(-120, "credit score below 300 on 150-750 scale")
    elif credit_score < 450:
        add(-80, "credit score below 450")
    elif credit_score < 600:
        add(-35, "credit score below 600")
    elif credit_score >= 700:
        add(+45, "credit score 700 or higher")
    elif credit_score >= 650:
        add(+25, "credit score 650 or higher")

    if loan_percent_income >= 0.45:
        add(-100, "loan amount is at least 45% of annual income")
    elif loan_percent_income >= 0.35:
        add(-75, "loan amount is at least 35% of annual income")
    elif loan_percent_income >= 0.25:
        add(-45, "loan amount is at least 25% of annual income")
    elif loan_percent_income <= 0.10:
        add(+30, "loan amount is below 10% of annual income")

    if loan_int_rate >= 16:
        add(-55, "interest rate is 16% or higher")
    elif loan_int_rate >= 13:
        add(-35, "interest rate is 13% or higher")
    elif loan_int_rate <= 8:
        add(+25, "interest rate is 8% or lower")

    if income < 35_000:
        add(-45, "annual income below 35,000")
    elif income >= 100_000:
        add(+35, "annual income at least 100,000")
    elif income >= 70_000:
        add(+20, "annual income at least 70,000")

    if emp_exp < 1:
        add(-30, "employment experience below 1 year")
    elif emp_exp >= 8:
        add(+25, "employment experience at least 8 years")
    elif emp_exp >= 5:
        add(+15, "employment experience at least 5 years")

    if credit_hist < 3:
        add(-25, "credit history shorter than 3 years")
    elif credit_hist >= 8:
        add(+25, "credit history at least 8 years")
    elif credit_hist >= 5:
        add(+15, "credit history at least 5 years")

    if home == "RENT":
        add(-25, "rented housing")
    elif home in {"MORTGAGE", "OWN"}:
        add(+25, "stable home ownership profile")

    if intent in {"DEBTCONSOLIDATION", "MEDICAL"}:
        add(-20, f"risk-sensitive loan intent: {intent}")
    elif intent in {"EDUCATION", "VENTURE"}:
        add(+10, f"productive loan intent: {intent}")

    if age < 23:
        add(-20, "very young borrower")
    elif age >= 40:
        add(+10, "mature borrower age profile")

    rule_score = int(np.clip(score, CREDIT_SCORE_TARGET_MIN, CREDIT_SCORE_TARGET_MAX))
    rule_level, rule_decision = score_to_risk_band(rule_score)
    return {
        "rule_score_150_750": rule_score,
        "rule_risk_level": rule_level,
        "rule_decision": rule_decision,
        "rule_reasons": reasons,
    }


def score_applications(
    raw_rows: pd.DataFrame,
    preprocessor: ColumnTransformer,
    model: Any,
    calibrator: IsotonicRegression,
    credit_score_source_min: float,
    credit_score_source_max: float,
    threshold: float,
) -> pd.DataFrame:
    features = build_feature_frame(
        raw_rows,
        credit_score_source_min=credit_score_source_min,
        credit_score_source_max=credit_score_source_max,
        include_target=TARGET_COLUMN in raw_rows.columns,
    )
    X = preprocessor.transform(features[MODEL_FEATURES])
    raw_pd = model.predict_proba(X)[:, 1]
    default_pd = calibrator.transform(raw_pd)
    model_scores = probability_to_score_150_750(default_pd)

    outputs = raw_rows.reset_index(drop=True).copy()
    outputs["credit_score_raw"] = features["credit_score_raw"].values
    outputs["credit_score_150_750"] = features["credit_score"].round(0).astype(int).values
    outputs["probability_of_default"] = np.round(default_pd, 6)
    outputs["model_score_150_750"] = model_scores
    outputs["predicted_default"] = (default_pd >= threshold).astype(int)
    outputs["predicted_label"] = target_label(outputs["predicted_default"].to_numpy())
    outputs["risk_level"] = [score_to_risk_band(s)[0] for s in model_scores]
    outputs["decision"] = [score_to_risk_band(s)[1] for s in model_scores]

    rule_scores = []
    rule_levels = []
    rule_decisions = []
    rule_reasons = []
    for _, row in features.iterrows():
        rule = rule_based_explanation(row)
        rule_scores.append(rule["rule_score_150_750"])
        rule_levels.append(rule["rule_risk_level"])
        rule_decisions.append(rule["rule_decision"])
        rule_reasons.append(" | ".join(rule["rule_reasons"][:8]))

    outputs["rule_score_150_750"] = rule_scores
    outputs["rule_risk_level"] = rule_levels
    outputs["rule_decision"] = rule_decisions
    outputs["rule_explanation"] = rule_reasons
    return outputs


# =============================================================================
# Training helpers
# =============================================================================


def build_preprocessor() -> ColumnTransformer:
    try:
        encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
    except TypeError:
        encoder = OneHotEncoder(handle_unknown="ignore", sparse=False)

    return ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), NUMERIC_FEATURES),
            ("cat", encoder, CATEGORICAL_FEATURES),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )


def split_data(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    train_val, test = train_test_split(
        df,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=df["is_default"],
    )
    val_relative = VAL_SIZE / (1.0 - TEST_SIZE)
    train, val = train_test_split(
        train_val,
        test_size=val_relative,
        random_state=RANDOM_STATE,
        stratify=train_val["is_default"],
    )
    return train.reset_index(drop=True), val.reset_index(drop=True), test.reset_index(drop=True)


def resolve_xgb_device() -> str:
    if XGB_DEVICE_REQUEST and XGB_DEVICE_REQUEST != "auto":
        return XGB_DEVICE_REQUEST
    try:
        torch_spec = importlib.util.find_spec("torch")
        if torch_spec is not None and importlib.import_module("torch").cuda.is_available():
            return "cuda"
    except Exception:
        pass
    if os.environ.get("COLAB_GPU", "").strip() not in {"", "0"}:
        return "cuda"
    return "cpu"


def _fit_xgb_once(
    params: dict[str, Any],
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
) -> Any:
    model = xgb.XGBClassifier(**params)
    try:
        model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
    except TypeError:
        params_without_early_stop = dict(params)
        params_without_early_stop.pop("early_stopping_rounds", None)
        model = xgb.XGBClassifier(**params_without_early_stop)
        model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
    return model


def fit_xgb_model(X_train: np.ndarray, y_train: np.ndarray, X_val: np.ndarray, y_val: np.ndarray) -> Any:
    positives = max(float(y_train.sum()), 1.0)
    negatives = max(float(len(y_train) - y_train.sum()), 1.0)
    scale_pos_weight = negatives / positives
    xgb_device = resolve_xgb_device()
    params: dict[str, Any] = {
        "n_estimators": XGB_N_ESTIMATORS,
        "max_depth": XGB_MAX_DEPTH,
        "learning_rate": XGB_LEARNING_RATE,
        "subsample": 0.90,
        "colsample_bytree": 0.85,
        "min_child_weight": 8,
        "reg_alpha": 0.15,
        "reg_lambda": 2.0,
        "objective": "binary:logistic",
        "eval_metric": "aucpr",
        "tree_method": XGB_TREE_METHOD,
        "random_state": RANDOM_STATE,
        "n_jobs": -1,
        "scale_pos_weight": scale_pos_weight,
        "early_stopping_rounds": XGB_EARLY_STOPPING_ROUNDS,
    }
    if xgb_device != "cpu":
        params["device"] = xgb_device
    print(f"[model] XGBoost tree_method={XGB_TREE_METHOD} device={xgb_device}")
    try:
        return _fit_xgb_once(params, X_train, y_train, X_val, y_val)
    except Exception as exc:
        message = str(exc).lower()
        if xgb_device != "cpu" and any(token in message for token in ["cuda", "gpu", "device"]):
            print(f"[model] GPU training unavailable, falling back to CPU: {exc}")
            params.pop("device", None)
            return _fit_xgb_once(params, X_train, y_train, X_val, y_val)
        raise


def find_best_threshold(
    y_true: np.ndarray,
    proba: np.ndarray,
    metric: str = THRESHOLD_METRIC,
) -> tuple[float, pd.DataFrame]:
    rows = []
    thresholds = np.linspace(0.05, 0.95, 181)
    for threshold in thresholds:
        pred = (proba >= threshold).astype(int)
        precision = precision_score(y_true, pred, zero_division=0)
        recall = recall_score(y_true, pred, zero_division=0)
        f1 = f1_score(y_true, pred, zero_division=0)
        f2 = fbeta_score(y_true, pred, beta=2, zero_division=0)
        accuracy = accuracy_score(y_true, pred)
        bal_acc = balanced_accuracy_score(y_true, pred)
        rows.append(
            {
                "threshold": threshold,
                "accuracy": accuracy,
                "precision": precision,
                "recall": recall,
                "f1": f1,
                "f2": f2,
                "balanced_accuracy": bal_acc,
            }
        )
    table = pd.DataFrame(rows)
    metric_name = metric if metric in table.columns else "f2"
    best_idx = int(table[metric_name].idxmax())
    return float(table.loc[best_idx, "threshold"]), table


def classification_metrics(y_true: np.ndarray, proba: np.ndarray, threshold: float) -> dict[str, float]:
    pred = (proba >= threshold).astype(int)
    metrics = {
        "roc_auc": roc_auc_score(y_true, proba),
        "average_precision": average_precision_score(y_true, proba),
        "brier": brier_score_loss(y_true, proba),
        "accuracy": accuracy_score(y_true, pred),
        "balanced_accuracy": balanced_accuracy_score(y_true, pred),
        "precision": precision_score(y_true, pred, zero_division=0),
        "recall": recall_score(y_true, pred, zero_division=0),
        "f1": f1_score(y_true, pred, zero_division=0),
        "f2": fbeta_score(y_true, pred, beta=2, zero_division=0),
        "mcc": matthews_corrcoef(y_true, pred),
        "ks": ks_statistic(y_true, proba),
    }
    return {k: round(float(v), 6) for k, v in metrics.items()}


def ks_statistic(y_true: np.ndarray, proba: np.ndarray) -> float:
    fpr, tpr, _ = roc_curve(y_true, proba)
    return float(np.max(tpr - fpr))


def get_feature_names(preprocessor: ColumnTransformer) -> list[str]:
    try:
        return [str(x) for x in preprocessor.get_feature_names_out()]
    except Exception:
        return MODEL_FEATURES


def make_test_export(
    raw_test: pd.DataFrame,
    feature_test: pd.DataFrame,
    y_test: np.ndarray,
    proba_test: np.ndarray,
    threshold: float,
) -> pd.DataFrame:
    out = raw_test.reset_index(drop=True).copy()
    model_scores = probability_to_score_150_750(proba_test)
    out["actual_default"] = y_test
    out["actual_label"] = target_label(y_test)
    out["credit_score_raw"] = feature_test["credit_score_raw"].values
    out["credit_score_150_750"] = feature_test["credit_score"].round(0).astype(int).values
    out["probability_of_default"] = np.round(proba_test, 6)
    out["model_score_150_750"] = model_scores
    out["predicted_default"] = (proba_test >= threshold).astype(int)
    out["predicted_label"] = target_label(out["predicted_default"].to_numpy())
    out["risk_level"] = [score_to_risk_band(s)[0] for s in model_scores]
    out["decision"] = [score_to_risk_band(s)[1] for s in model_scores]
    rule_payloads = [rule_based_explanation(row) for _, row in feature_test.iterrows()]
    out["rule_score_150_750"] = [r["rule_score_150_750"] for r in rule_payloads]
    out["rule_risk_level"] = [r["rule_risk_level"] for r in rule_payloads]
    out["rule_explanation"] = [" | ".join(r["rule_reasons"][:8]) for r in rule_payloads]
    return out


# =============================================================================
# Charts
# =============================================================================


def save_fig(fig: plt.Figure, filename: str) -> None:
    CHART_DIR.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(CHART_DIR / filename, dpi=170, bbox_inches="tight")
    plt.close(fig)
    print(f"[chart] {CHART_DIR / filename}")


def safe_chart(filename: str, builder: Callable[[], plt.Figure]) -> None:
    try:
        fig = builder()
        save_fig(fig, filename)
    except Exception as exc:
        print(f"[chart-skip] {filename}: {exc}")
        plt.close("all")


def draw_many_charts(
    df_all: pd.DataFrame,
    train: pd.DataFrame,
    val: pd.DataFrame,
    test: pd.DataFrame,
    y_test: np.ndarray,
    proba_test: np.ndarray,
    threshold: float,
    threshold_table: pd.DataFrame,
    model: Any,
    feature_names: list[str],
    X_test_processed: np.ndarray,
    model_metrics: pd.DataFrame,
    permutation_table: pd.DataFrame | None,
    test_export: pd.DataFrame,
) -> None:
    if SKIP_CHARTS:
        print("[charts] SKIP_CHARTS_NEW_DATA=1, chart generation skipped.")
        return

    df = df_all.copy()
    df["target_label"] = target_label(df["is_default"].to_numpy())
    test_chart = test_export.copy()
    test_chart["actual_label"] = target_label(test_chart["actual_default"].to_numpy())

    safe_chart(
        "01_target_distribution.png",
        lambda: _bar_target_distribution(df),
    )
    safe_chart(
        "02_credit_score_raw_vs_normalized.png",
        lambda: _raw_vs_normalized_credit_score(df),
    )
    safe_chart(
        "03_normalized_credit_score_by_target.png",
        lambda: _box_by_target(df, "credit_score", "Normalized credit score by target"),
    )
    safe_chart(
        "04_correlation_heatmap.png",
        lambda: _correlation_heatmap(df),
    )
    safe_chart(
        "05_default_rate_by_loan_intent.png",
        lambda: _default_rate_by_category(df, "loan_intent", "Default rate by loan intent"),
    )
    safe_chart(
        "06_default_rate_by_home_ownership.png",
        lambda: _default_rate_by_category(df, "person_home_ownership", "Default rate by home ownership"),
    )
    safe_chart(
        "07_default_rate_by_education.png",
        lambda: _default_rate_by_category(df, "person_education", "Default rate by education"),
    )
    safe_chart(
        "08_default_rate_by_previous_default.png",
        lambda: _default_rate_by_category(df, "previous_default_bin", "Default rate by previous default flag"),
    )
    safe_chart(
        "09_loan_amount_distribution.png",
        lambda: _hist_by_target(df, "loan_amnt", "Loan amount distribution", clip_q=0.99),
    )
    safe_chart(
        "10_income_distribution.png",
        lambda: _hist_by_target(df, "person_income", "Annual income distribution", clip_q=0.99),
    )
    safe_chart(
        "11_interest_rate_distribution.png",
        lambda: _hist_by_target(df, "loan_int_rate", "Interest rate distribution", clip_q=0.995),
    )
    safe_chart(
        "12_loan_percent_income_distribution.png",
        lambda: _hist_by_target(df, "loan_percent_income", "Loan percent income distribution", clip_q=0.995),
    )
    safe_chart(
        "13_age_distribution.png",
        lambda: _hist_by_target(df, "person_age", "Age distribution", clip_q=0.995),
    )
    safe_chart(
        "14_credit_history_length_distribution.png",
        lambda: _hist_by_target(df, "cb_person_cred_hist_length", "Credit history length distribution", clip_q=0.995),
    )
    safe_chart(
        "15_roc_curve.png",
        lambda: _roc_curve_chart(y_test, proba_test),
    )
    safe_chart(
        "16_precision_recall_curve.png",
        lambda: _precision_recall_chart(y_test, proba_test),
    )
    safe_chart(
        "17_confusion_matrix.png",
        lambda: _confusion_matrix_chart(y_test, proba_test, threshold),
    )
    safe_chart(
        "18_calibration_curve.png",
        lambda: _calibration_chart(y_test, proba_test),
    )
    safe_chart(
        "19_probability_distribution.png",
        lambda: _probability_distribution(test_chart),
    )
    safe_chart(
        "20_model_score_distribution.png",
        lambda: _score_distribution(test_chart),
    )
    safe_chart(
        "21_xgb_feature_importance_gain.png",
        lambda: _xgb_feature_importance_chart(model, feature_names),
    )
    safe_chart(
        "22_threshold_analysis.png",
        lambda: _threshold_chart(threshold_table, threshold),
    )
    safe_chart(
        "23_ks_statistic_curve.png",
        lambda: _ks_chart(y_test, proba_test),
    )
    safe_chart(
        "24_cumulative_gains.png",
        lambda: _cumulative_gains_chart(y_test, proba_test),
    )
    safe_chart(
        "25_lift_chart.png",
        lambda: _lift_chart(y_test, proba_test),
    )
    safe_chart(
        "26_risk_band_default_rate.png",
        lambda: _risk_band_default_rate(test_chart),
    )
    safe_chart(
        "27_score_decile_default_rate.png",
        lambda: _score_decile_default_rate(test_chart),
    )
    safe_chart(
        "28_rule_score_vs_model_score.png",
        lambda: _rule_vs_model_score(test_chart),
    )
    safe_chart(
        "29_credit_score_vs_pd_binned.png",
        lambda: _binned_pd_chart(test_chart, "credit_score_150_750", "Credit score 150-750 vs PD"),
    )
    safe_chart(
        "30_loan_percent_income_vs_pd_binned.png",
        lambda: _binned_pd_chart(test_chart, "loan_percent_income", "Loan percent income vs PD"),
    )
    if permutation_table is not None and not permutation_table.empty:
        safe_chart(
            "32_permutation_importance.png",
            lambda: _permutation_chart(permutation_table),
        )
    safe_chart(
        "33_split_target_stability.png",
        lambda: _split_stability_chart(train, val, test),
    )
    safe_chart(
        "34_summary_dashboard.png",
        lambda: _summary_dashboard(test_chart, y_test, proba_test, threshold, model_metrics),
    )


def _bar_target_distribution(df: pd.DataFrame) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(8, 5))
    counts = df["target_label"].value_counts()
    sns.barplot(x=counts.index, y=counts.values, ax=ax, palette=["#2E86AB", "#D1495B"])
    ax.set_title("Target distribution")
    ax.set_ylabel("Rows")
    for i, v in enumerate(counts.values):
        ax.text(i, v, f"{v:,}\n{v / len(df):.1%}", ha="center", va="bottom")
    return fig


def _raw_vs_normalized_credit_score(df: pd.DataFrame) -> plt.Figure:
    fig, axes = plt.subplots(1, 2, figsize=(13, 5))
    sns.histplot(df["credit_score_raw"], bins=45, kde=True, ax=axes[0], color="#4C78A8")
    axes[0].set_title("Raw credit_score")
    sns.histplot(df["credit_score"], bins=45, kde=True, ax=axes[1], color="#59A14F")
    axes[1].set_title("Normalized credit_score 150-750")
    return fig


def _box_by_target(df: pd.DataFrame, col: str, title: str) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(8, 5))
    sns.boxplot(data=df, x="target_label", y=col, ax=ax, palette=["#2E86AB", "#D1495B"])
    ax.set_title(title)
    ax.set_xlabel("")
    return fig


def _correlation_heatmap(df: pd.DataFrame) -> plt.Figure:
    cols = NUMERIC_FEATURES + ["is_default"]
    corr = df[cols].corr(numeric_only=True)
    fig, ax = plt.subplots(figsize=(15, 12))
    sns.heatmap(corr, cmap="coolwarm", center=0, ax=ax, linewidths=0.2, cbar_kws={"shrink": 0.75})
    ax.set_title("Numeric feature correlation heatmap")
    return fig


def _default_rate_by_category(df: pd.DataFrame, col: str, title: str) -> plt.Figure:
    stats = (
        df.groupby(col, observed=True)["is_default"]
        .agg(default_rate="mean", count="size")
        .reset_index()
        .sort_values("default_rate", ascending=False)
    )
    fig, ax = plt.subplots(figsize=(10, 5))
    sns.barplot(data=stats, x=col, y="default_rate", ax=ax, color="#D1495B")
    ax.set_title(title)
    ax.set_ylabel("Default rate")
    ax.set_xlabel(col)
    ax.tick_params(axis="x", rotation=25)
    for i, row in stats.reset_index(drop=True).iterrows():
        ax.text(i, row["default_rate"], f"{row['default_rate']:.1%}\nn={int(row['count']):,}", ha="center", va="bottom", fontsize=8)
    return fig


def _hist_by_target(df: pd.DataFrame, col: str, title: str, clip_q: float = 1.0) -> plt.Figure:
    chart_df = df.copy()
    upper = chart_df[col].quantile(clip_q)
    chart_df[col] = chart_df[col].clip(upper=upper)
    fig, ax = plt.subplots(figsize=(9, 5))
    sns.histplot(data=chart_df, x=col, hue="target_label", bins=45, kde=True, stat="density", common_norm=False, ax=ax)
    ax.set_title(title)
    return fig


def _roc_curve_chart(y: np.ndarray, proba: np.ndarray) -> plt.Figure:
    fpr, tpr, _ = roc_curve(y, proba)
    auc = roc_auc_score(y, proba)
    fig, ax = plt.subplots(figsize=(7, 6))
    ax.plot(fpr, tpr, label=f"AUC={auc:.4f}", color="#2E86AB", linewidth=2)
    ax.plot([0, 1], [0, 1], "--", color="gray")
    ax.set_xlabel("False positive rate")
    ax.set_ylabel("True positive rate")
    ax.set_title("ROC curve")
    ax.legend()
    return fig


def _precision_recall_chart(y: np.ndarray, proba: np.ndarray) -> plt.Figure:
    precision, recall, _ = precision_recall_curve(y, proba)
    ap = average_precision_score(y, proba)
    fig, ax = plt.subplots(figsize=(7, 6))
    ax.plot(recall, precision, label=f"AP={ap:.4f}", color="#D1495B", linewidth=2)
    ax.set_xlabel("Recall")
    ax.set_ylabel("Precision")
    ax.set_title("Precision-recall curve")
    ax.legend()
    return fig


def _confusion_matrix_chart(y: np.ndarray, proba: np.ndarray, threshold: float) -> plt.Figure:
    pred = (proba >= threshold).astype(int)
    cm = confusion_matrix(y, pred)
    fig, ax = plt.subplots(figsize=(6, 5))
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", cbar=False, ax=ax)
    ax.set_title(f"Confusion matrix @ threshold={threshold:.3f}")
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_xticklabels([LABEL_NON_DEFAULT, LABEL_DEFAULT])
    ax.set_yticklabels([LABEL_NON_DEFAULT, LABEL_DEFAULT], rotation=0)
    return fig


def _calibration_chart(y: np.ndarray, proba: np.ndarray) -> plt.Figure:
    frac_pos, mean_pred = calibration_curve(y, proba, n_bins=10, strategy="quantile")
    fig, ax = plt.subplots(figsize=(7, 6))
    ax.plot(mean_pred, frac_pos, marker="o", color="#E17C05", label="Model")
    ax.plot([0, 1], [0, 1], "--", color="gray", label="Perfect")
    ax.set_xlabel("Mean predicted probability")
    ax.set_ylabel("Observed Default rate")
    ax.set_title("Calibration curve")
    ax.legend()
    return fig


def _probability_distribution(df: pd.DataFrame) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(9, 5))
    sns.histplot(data=df, x="probability_of_default", hue="actual_label", bins=45, kde=True, stat="density", common_norm=False, ax=ax)
    ax.set_title("Probability of Default distribution")
    return fig


def _score_distribution(df: pd.DataFrame) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(9, 5))
    sns.histplot(data=df, x="model_score_150_750", hue="actual_label", bins=45, kde=True, stat="density", common_norm=False, ax=ax)
    ax.set_title("Model score 150-750 distribution")
    return fig


def _xgb_feature_importance_chart(model: Any, feature_names: list[str]) -> plt.Figure:
    booster = model.get_booster()
    raw_scores = booster.get_score(importance_type="gain")
    rows = []
    for key, value in raw_scores.items():
        idx = int(key[1:]) if key.startswith("f") and key[1:].isdigit() else None
        name = feature_names[idx] if idx is not None and idx < len(feature_names) else key
        rows.append((name, value))
    imp = pd.DataFrame(rows, columns=["feature", "gain"]).sort_values("gain", ascending=False).head(25)
    fig, ax = plt.subplots(figsize=(10, 8))
    sns.barplot(data=imp, y="feature", x="gain", ax=ax, color="#4C78A8")
    ax.set_title("Top XGBoost feature importance by gain")
    ax.set_xlabel("Gain")
    ax.set_ylabel("")
    return fig


def _threshold_chart(table: pd.DataFrame, threshold: float) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(10, 6))
    for col in ["precision", "recall", "f1", "f2", "balanced_accuracy"]:
        ax.plot(table["threshold"], table[col], label=col)
    ax.axvline(threshold, color="black", linestyle="--", label=f"selected={threshold:.3f}")
    ax.set_title("Threshold analysis on validation set")
    ax.set_xlabel("Threshold")
    ax.set_ylabel("Metric")
    ax.legend()
    return fig


def _ks_chart(y: np.ndarray, proba: np.ndarray) -> plt.Figure:
    order = np.argsort(proba)
    y_sorted = y[order]
    proba_sorted = proba[order]
    pos = y_sorted == 1
    neg = y_sorted == 0
    cum_pos = np.cumsum(pos) / max(pos.sum(), 1)
    cum_neg = np.cumsum(neg) / max(neg.sum(), 1)
    ks = np.max(np.abs(cum_pos - cum_neg))
    fig, ax = plt.subplots(figsize=(9, 5))
    ax.plot(proba_sorted, cum_pos, label=f"Cumulative {LABEL_DEFAULT}")
    ax.plot(proba_sorted, cum_neg, label=f"Cumulative {LABEL_NON_DEFAULT}")
    ax.set_title(f"KS statistic = {ks:.4f}")
    ax.set_xlabel("Predicted Probability of Default")
    ax.set_ylabel("Cumulative rate")
    ax.legend()
    return fig


def _cumulative_gains_chart(y: np.ndarray, proba: np.ndarray) -> plt.Figure:
    order = np.argsort(-proba)
    y_sorted = y[order]
    gains = np.cumsum(y_sorted) / max(y_sorted.sum(), 1)
    population = np.arange(1, len(y_sorted) + 1) / len(y_sorted)
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.plot(population, gains, color="#D1495B", label="Model")
    ax.plot([0, 1], [0, 1], "--", color="gray", label="Random")
    ax.set_title("Cumulative gains")
    ax.set_xlabel("Share of applications sorted by risk")
    ax.set_ylabel("Share of defaults captured")
    ax.legend()
    return fig


def _lift_chart(y: np.ndarray, proba: np.ndarray, bins: int = 10) -> plt.Figure:
    data = pd.DataFrame({"y": y, "proba": proba}).sort_values("proba", ascending=False)
    data["decile"] = pd.qcut(np.arange(len(data)), q=bins, labels=False) + 1
    base_rate = data["y"].mean()
    stats = data.groupby("decile")["y"].mean().reset_index(name="default_rate")
    stats["lift"] = stats["default_rate"] / max(base_rate, 1e-9)
    fig, ax = plt.subplots(figsize=(9, 5))
    sns.barplot(data=stats, x="decile", y="lift", color="#59A14F", ax=ax)
    ax.axhline(1.0, color="gray", linestyle="--")
    ax.set_title("Lift by risk decile")
    ax.set_xlabel("Decile 1 = highest risk")
    ax.set_ylabel("Lift vs baseline")
    return fig


def _risk_band_default_rate(df: pd.DataFrame) -> plt.Figure:
    order = ["Very high risk", "High risk", "Medium risk", "Low risk", "Very low risk"]
    stats = (
        df.groupby("risk_level")["actual_default"]
        .agg(default_rate="mean", count="size")
        .reindex(order)
        .dropna()
        .reset_index()
    )
    fig, ax = plt.subplots(figsize=(10, 5))
    sns.barplot(data=stats, x="risk_level", y="default_rate", ax=ax, palette="Reds_r")
    ax.set_title("Observed Default rate by model risk band")
    ax.set_xlabel("")
    ax.set_ylabel("Default rate")
    ax.tick_params(axis="x", rotation=20)
    for i, row in stats.iterrows():
        ax.text(i, row["default_rate"], f"{row['default_rate']:.1%}\nn={int(row['count']):,}", ha="center", va="bottom", fontsize=8)
    return fig


def _score_decile_default_rate(df: pd.DataFrame) -> plt.Figure:
    chart_df = df.copy()
    chart_df["score_decile"] = pd.qcut(chart_df["model_score_150_750"], q=10, duplicates="drop")
    stats = chart_df.groupby("score_decile", observed=True)["actual_default"].mean().reset_index()
    stats["score_decile"] = stats["score_decile"].astype(str)
    fig, ax = plt.subplots(figsize=(12, 5))
    sns.lineplot(data=stats, x="score_decile", y="actual_default", marker="o", ax=ax, color="#D1495B")
    ax.set_title("Default rate by score decile")
    ax.set_xlabel("Model score decile")
    ax.set_ylabel("Default rate")
    ax.tick_params(axis="x", rotation=30)
    return fig


def _rule_vs_model_score(df: pd.DataFrame) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(7, 6))
    sns.scatterplot(
        data=df.sample(min(len(df), 2500), random_state=RANDOM_STATE),
        x="rule_score_150_750",
        y="model_score_150_750",
        hue="actual_label",
        alpha=0.55,
        ax=ax,
    )
    ax.plot([150, 750], [150, 750], "--", color="gray")
    ax.set_title("Rule score vs model score")
    return fig


def _binned_pd_chart(df: pd.DataFrame, col: str, title: str) -> plt.Figure:
    chart_df = df.copy()
    chart_df["bin"] = pd.qcut(chart_df[col], q=10, duplicates="drop")
    stats = chart_df.groupby("bin", observed=True).agg(
        mean_pd=("probability_of_default", "mean"),
        observed_default=("actual_default", "mean"),
        count=("actual_default", "size"),
    )
    labels = [str(x) for x in stats.index]
    fig, ax = plt.subplots(figsize=(12, 5))
    ax.plot(labels, stats["mean_pd"], marker="o", label="Mean predicted PD")
    ax.plot(labels, stats["observed_default"], marker="s", label="Observed Default")
    ax.set_title(title)
    ax.set_xlabel(col)
    ax.set_ylabel("Rate")
    ax.tick_params(axis="x", rotation=35)
    ax.legend()
    return fig


def _permutation_chart(table: pd.DataFrame) -> plt.Figure:
    top = table.sort_values("importance_mean", ascending=False).head(25)
    fig, ax = plt.subplots(figsize=(10, 8))
    sns.barplot(data=top, y="feature", x="importance_mean", ax=ax, color="#F28E2B")
    ax.set_title("Permutation importance on test sample")
    ax.set_xlabel("Mean importance")
    ax.set_ylabel("")
    return fig


def _split_stability_chart(train: pd.DataFrame, val: pd.DataFrame, test: pd.DataFrame) -> plt.Figure:
    rows = []
    for name, split in [("train", train), ("validation", val), ("test", test)]:
        rows.append({"split": name, "default_rate": split["is_default"].mean(), "rows": len(split)})
    stats = pd.DataFrame(rows)
    fig, ax = plt.subplots(figsize=(7, 5))
    sns.barplot(data=stats, x="split", y="default_rate", color="#4C78A8", ax=ax)
    ax.set_title("Target stability by split")
    ax.set_ylabel("Default rate")
    for i, row in stats.iterrows():
        ax.text(i, row["default_rate"], f"{row['default_rate']:.1%}\nn={int(row['rows']):,}", ha="center", va="bottom")
    return fig


def _summary_dashboard(
    df: pd.DataFrame,
    y: np.ndarray,
    proba: np.ndarray,
    threshold: float,
    metrics: pd.DataFrame,
) -> plt.Figure:
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fpr, tpr, _ = roc_curve(y, proba)
    axes[0, 0].plot(fpr, tpr, color="#2E86AB")
    axes[0, 0].plot([0, 1], [0, 1], "--", color="gray")
    axes[0, 0].set_title(f"ROC AUC={roc_auc_score(y, proba):.4f}")

    sns.histplot(data=df, x="probability_of_default", hue="actual_label", bins=35, ax=axes[0, 1])
    axes[0, 1].axvline(threshold, color="black", linestyle="--")
    axes[0, 1].set_title("Probability distribution")

    stats = df.groupby("risk_level")["actual_default"].mean().sort_values(ascending=False)
    stats.plot(kind="bar", ax=axes[1, 0], color="#D1495B")
    axes[1, 0].set_title("Default rate by risk band")
    axes[1, 0].set_ylabel("Default rate")

    metric_names = ["roc_auc", "f1", "f2", "balanced_accuracy"]
    metric_values = [float(metrics.iloc[0][name]) for name in metric_names]
    axes[1, 1].bar(metric_names, metric_values, color="#4C78A8")
    axes[1, 1].set_ylim(0, 1)
    axes[1, 1].set_title("XGBoost test metrics")
    axes[1, 1].tick_params(axis="x", rotation=20)
    return fig


# =============================================================================
# Documentation
# =============================================================================


def write_model_documentation(metadata: dict[str, Any], model_metrics: pd.DataFrame) -> None:
    metrics = model_metrics.iloc[0].to_dict()
    split = metadata["split"]
    norm = metadata["credit_score_normalization"]
    chart_names = [
        "01_target_distribution.png",
        "02_credit_score_raw_vs_normalized.png",
        "03_normalized_credit_score_by_target.png",
        "04_correlation_heatmap.png",
        "05_default_rate_by_loan_intent.png",
        "06_default_rate_by_home_ownership.png",
        "07_default_rate_by_education.png",
        "08_default_rate_by_previous_default.png",
        "09_loan_amount_distribution.png",
        "10_income_distribution.png",
        "11_interest_rate_distribution.png",
        "12_loan_percent_income_distribution.png",
        "13_age_distribution.png",
        "14_credit_history_length_distribution.png",
        "15_roc_curve.png",
        "16_precision_recall_curve.png",
        "17_confusion_matrix.png",
        "18_calibration_curve.png",
        "19_probability_distribution.png",
        "20_model_score_distribution.png",
        "21_xgb_feature_importance_gain.png",
        "22_threshold_analysis.png",
        "23_ks_statistic_curve.png",
        "24_cumulative_gains.png",
        "25_lift_chart.png",
        "26_risk_band_default_rate.png",
        "27_score_decile_default_rate.png",
        "28_rule_score_vs_model_score.png",
        "29_credit_score_vs_pd_binned.png",
        "30_loan_percent_income_vs_pd_binned.png",
        "32_permutation_importance.png",
        "33_split_target_stability.png",
        "34_summary_dashboard.png",
    ]
    existing_chart_lines = []
    for name in chart_names:
        if name == "32_permutation_importance.png" and not DO_PERMUTATION_IMPORTANCE:
            continue
        if (CHART_DIR / name).exists() or not SKIP_CHARTS:
            existing_chart_lines.append(f"- `{name}`")
    chart_detail_rows = [
        ("01_target_distribution.png", "Shows the balance between Default and Non-Default. This matters because the run has a high Default rate, so accuracy alone is not enough."),
        ("02_credit_score_raw_vs_normalized.png", "Verifies that raw credit_score values are mapped from the source scale to the 150-750 project score scale while preserving the distribution shape."),
        ("03_normalized_credit_score_by_target.png", "Compares normalized credit scores by target class. Higher Non-Default scores support credit_score as a useful risk feature."),
        ("04_correlation_heatmap.png", "Shows linear relationships among numeric fields and the target. XGBoost can still learn nonlinear effects that this heatmap does not fully capture."),
        ("05_default_rate_by_loan_intent.png", "Compares Default rate by loan purpose. Loan intent can capture different behavioral and financial risk profiles."),
        ("06_default_rate_by_home_ownership.png", "Compares Default rate by housing status. Home ownership often proxies financial stability."),
        ("07_default_rate_by_education.png", "Compares Default rate by education group. Use this carefully in real systems because demographic-like variables require fairness review."),
        ("08_default_rate_by_previous_default.png", "Validates the risk impact of previous default history. Prior default is usually a strong credit risk signal."),
        ("09_loan_amount_distribution.png", "Shows how loan size differs by target. It should be interpreted together with income and loan_percent_income."),
        ("10_income_distribution.png", "Shows annual income distribution by target. Lower income can increase repayment pressure."),
        ("11_interest_rate_distribution.png", "Shows interest rate distribution by target. Higher interest rates often reflect or increase risk."),
        ("12_loan_percent_income_distribution.png", "Shows debt burden relative to annual income. Higher ratios generally imply higher repayment stress."),
        ("13_age_distribution.png", "Shows age distribution by target. Age can proxy financial history but needs fairness review in production."),
        ("14_credit_history_length_distribution.png", "Shows credit history length by target. Longer history usually makes risk assessment more stable."),
        ("15_roc_curve.png", "Summarizes ranking quality across thresholds. Higher ROC AUC means stronger separation between Default and Non-Default."),
        ("16_precision_recall_curve.png", "Important for imbalanced data. It shows the trade-off between catching Defaults and keeping Default predictions precise."),
        ("17_confusion_matrix.png", "Shows correct and incorrect predictions at the selected threshold. It makes false positives and false negatives visible."),
        ("18_calibration_curve.png", "Checks whether predicted PD behaves like a real probability. Calibration is important for policy and pricing."),
        ("19_probability_distribution.png", "Shows PD distribution by actual class. Better models separate Default records toward high PD and Non-Default toward low PD."),
        ("20_model_score_distribution.png", "Shows the 150-750 score distribution. Lower scores represent higher PD and higher risk."),
        ("21_xgb_feature_importance_gain.png", "Ranks features by XGBoost gain. It explains which variables helped the model reduce loss most."),
        ("22_threshold_analysis.png", "Shows how precision, recall, F1, F2, and balanced accuracy change as the decision threshold changes."),
        ("23_ks_statistic_curve.png", "Shows the maximum separation between cumulative Default and Non-Default distributions. KS is a standard credit scoring metric."),
        ("24_cumulative_gains.png", "Shows how many Defaults are captured when reviewing the riskiest share of applications first."),
        ("25_lift_chart.png", "Shows how much risk concentration each decile has versus the baseline Default rate."),
        ("26_risk_band_default_rate.png", "Validates whether risk bands are meaningful. Higher-risk bands should have higher observed Default rates."),
        ("27_score_decile_default_rate.png", "Checks whether lower score deciles have higher observed Default rates."),
        ("28_rule_score_vs_model_score.png", "Compares transparent rule scoring with ML scoring. Large disagreements are good manual-review candidates."),
        ("29_credit_score_vs_pd_binned.png", "Compares binned credit score with predicted and observed Default rate."),
        ("30_loan_percent_income_vs_pd_binned.png", "Compares debt burden with predicted and observed Default rate."),
        ("33_split_target_stability.png", "Verifies that train, validation, and test keep similar Default rates through stratified splitting."),
        ("34_summary_dashboard.png", "Combines the main diagnostic views for a quick model-readiness summary."),
    ]
    chart_detail_section = "\n\n".join(
        f"### {name}\n\n![{name}]({name})\n\n{meaning}"
        for name, meaning in chart_detail_rows
        if (CHART_DIR / name).exists() or not SKIP_CHARTS
    )

    loan_status_mapping = ", ".join(
        f"`{key} -> {value}`" for key, value in metadata["target_mapping"].items() if key.startswith("loan_status=")
    )

    doc = f"""# AI Model Documentation - Credit Default Risk Scoring

## 1. Objective

This training pipeline builds a banking-style credit default risk model for `{metadata["data_csv"]}` using the `{metadata.get("source_schema", "canonical")}` schema. The model estimates Probability of Default (PD), converts PD to a 150-750 risk score, and exports rule-based explanations for why an application receives its score.

## 2. Target Definition

- Positive class: `Default`
- Negative class: `Non-Default`
- Default mapping used in this run: {loan_status_mapping}
- Internal target column: `is_default`, where `1=Default` and `0=Non-Default`

This mapping follows `TARGET_MODE_NEW_DATA={metadata["target_mode"]}` for this training run.

## 3. Data Split

- Dataset rows: `{metadata["rows"]:,}`
- Train rows: `{split["train_rows"]:,}`, Default rate: `{split["train_default_rate"]:.2%}`
- Validation rows: `{split["validation_rows"]:,}`, Default rate: `{split["validation_default_rate"]:.2%}`
- Test rows: `{split["test_rows"]:,}`, Default rate: `{split["test_default_rate"]:.2%}`

The validation set is used for early stopping, probability calibration, and threshold selection. The test set is held out for final reporting.

## 4. Features Used

Only canonical AIScore fields are used for model training. For LendingClub-style input, source columns such as `term`, `annual_inc`, `loan_amnt`, FICO range, and credit-history dates are mapped into this canonical schema before training.

Numeric model features:

{chr(10).join(f"- `{name}`" for name in metadata["numeric_features"])}

Categorical model features:

{chr(10).join(f"- `{name}`" for name in metadata["categorical_features"])}

Derived model feature:

- `previous_default_bin`: converts `previous_loan_defaults_on_file` from Yes/No to 1/0.

`loan_term_months` and `loan_monthly_payment_ratio` are active model features, so repayment term affects PD both directly and through monthly affordability.

## 5. Credit Score Normalization

The source `credit_score` is normalized to the project score range 150-750:

```text
normalized_score = 150 + (raw_score - source_min) * 600 / (source_max - source_min)
```

- Source range used: `{norm["source_min"]:.0f}` to `{norm["source_max"]:.0f}`
- Target score range: `{norm["target_min"]:.0f}` to `{norm["target_max"]:.0f}`
- Scores are clipped to stay inside 150-750.

## 6. Model Pipeline

- Preprocessing: `StandardScaler` for numeric fields and `OneHotEncoder` for categorical fields.
- Main model: `XGBoost_PD_Model`.
- Calibration: `IsotonicRegression` on the validation set.
- Decision threshold: `{metadata["threshold"]["value"]:.3f}` selected by `{metadata["threshold"]["metric"]}` on validation data.
- Speed settings: XGBoost `tree_method={metadata["config"]["xgb_tree_method"]}`, device request `{metadata["config"]["xgb_device_request"]}`, permutation importance default `{metadata["config"]["permutation_importance_enabled"]}`.

## 7. Test Results

| Metric | Value |
|---|---:|
| ROC AUC | `{float(metrics["roc_auc"]):.6f}` |
| Average Precision | `{float(metrics["average_precision"]):.6f}` |
| Brier Score | `{float(metrics["brier"]):.6f}` |
| Accuracy | `{float(metrics["accuracy"]):.6f}` |
| Balanced Accuracy | `{float(metrics["balanced_accuracy"]):.6f}` |
| Precision | `{float(metrics["precision"]):.6f}` |
| Recall | `{float(metrics["recall"]):.6f}` |
| F1 | `{float(metrics["f1"]):.6f}` |
| F2 | `{float(metrics["f2"]):.6f}` |
| MCC | `{float(metrics["mcc"]):.6f}` |
| KS | `{float(metrics["ks"]):.6f}` |

Interpretation: the model ranks default risk strongly when ROC AUC and Average Precision are high. Recall and F2 are especially important here because missing a default case is usually more expensive than sending a case to manual review.

## 8. Score and Decision Output

For every scored record, the exported reports include:

- `probability_of_default`: calibrated PD from 0 to 1.
- `model_score_150_750`: banking-style score where higher is lower risk.
- `predicted_default`: 1 when PD is above the selected threshold.
- `predicted_label`: `Default` or `Non-Default`.
- `risk_level`: Very low, Low, Medium, High, or Very high risk.
- `decision`: approve, manual_review, or reject_or_strict_review.
- `rule_score_150_750` and `rule_explanation`: deterministic rule-based explanation using the same current dataset fields.

## 9. Chart Outputs

Charts are saved in:

`{CHART_DIR}`

Generated chart files:

{chr(10).join(existing_chart_lines)}

## 10. Detailed Chart Interpretation

{chart_detail_section}

## 11. Why Train / Validation / Test Split Matters

The final split is 65% train, 15% validation, and 20% test. The train set teaches the model patterns. The validation set is used for early stopping, calibration, and threshold selection. The test set is kept untouched until final reporting so the metrics are not inflated by tuning decisions. Stratified splitting keeps the Default rate stable across all three sets.

## 12. Why XGBoost Is Used

XGBoost is well suited for credit-risk tabular data because it learns nonlinear patterns, captures feature interactions, supports regularization, works efficiently with the histogram tree method, and exposes feature importance for model explanation. This is useful for fields such as income, credit score, interest rate, loan purpose, housing status, previous default history, and debt burden.

## 13. Exported Artifacts

- Model directory: `{MODEL_DIR}`
- Reports directory: `{REPORT_DIR}`
- Split directory: `{SPLIT_DIR}`
- Main model: `xgb_pd_model.joblib` and `xgb_pd_model.json`
- Preprocessor: `preprocessor.joblib`
- Calibrator: `isotonic_calibrator.joblib`
- Metadata: `metadata.json`
- Predictions: `test_predictions.csv`
- Scoring examples: `sample_scoring_examples.csv`
- Feature dictionary: `feature_dictionary.csv`

## 14. Notes

This model is suitable for project-level credit risk scoring and explanation. For production banking use, the same pipeline should be validated with real repayment outcomes, out-of-time validation, policy review, bias review, and monitoring for data drift.
"""

    for path in (CHART_DIR / "AI_MODEL_DOCUMENTATION.md", REPORT_DIR / "AI_MODEL_DOCUMENTATION.md"):
        ensure_parent(path)
        path.write_text(doc, encoding="utf-8")
        print(f"[doc] {path}")


# =============================================================================
# Main pipeline
# =============================================================================


@dataclass
class TrainingArtifacts:
    preprocessor: ColumnTransformer
    model: Any
    calibrator: IsotonicRegression
    metadata: dict[str, Any]


def train_pipeline() -> TrainingArtifacts:
    data_csv = find_data_csv()
    raw_source = read_training_csv(data_csv)
    raw, source_schema, source_schema_info = canonicalize_training_schema(raw_source)
    raw["source_row_id"] = np.arange(len(raw))
    print(f"[data] Loaded {data_csv} source_shape={raw_source.shape} canonical_shape={raw.shape} schema={source_schema}")
    if source_schema_info.get("rows_dropped_unresolved_status"):
        print(f"[data] Dropped unresolved/open-status rows: {source_schema_info['rows_dropped_unresolved_status']:,}")
    term_in_model = configure_feature_contract(raw)

    missing = sorted(set(REQUIRED_COLUMNS) - set(raw.columns))
    if missing:
        raise ValueError(
            f"Training data is missing required canonical columns: {missing}. "
            "Use loan_data.csv with the AIScore canonical schema or set DATA_CSV_NEW_DATA to a compatible CSV."
        )

    if MAX_SAMPLES is not None and MAX_SAMPLES < len(raw):
        raw, _ = train_test_split(
            raw,
            train_size=MAX_SAMPLES,
            random_state=RANDOM_STATE,
            stratify=make_target(raw),
        )
        raw = raw.reset_index(drop=True)
        raw["source_row_id"] = np.arange(len(raw))
        print(f"[data] Sampled to {len(raw):,} rows because MAX_SAMPLES_NEW_DATA={MAX_SAMPLES}")

    credit_min, credit_max = determine_credit_score_source_range(raw)
    df = build_feature_frame(raw, credit_min, credit_max, include_target=True)
    print(
        "[data] Prepared features "
        f"shape={df.shape} | Default rate={df['is_default'].mean():.2%} | "
        f"credit_score raw {credit_min:.0f}-{credit_max:.0f} -> 150-750"
    )
    print(f"[target] mapping: {target_mapping()}")

    train, val, test = split_data(df)
    raw_by_id = raw.set_index("source_row_id", drop=False)

    def export_split(split_name: str, split_df: pd.DataFrame) -> pd.DataFrame:
        split_raw = (
            raw_by_id.loc[split_df["source_row_id"].astype(int).to_numpy()]
            .reset_index(drop=True)
            .copy()
        )
        split_raw["credit_score_150_750"] = split_df["credit_score"].round(0).astype(int).to_numpy()
        split_raw["is_default"] = split_df["is_default"].astype(int).to_numpy()
        split_raw["target_label"] = target_label(split_raw["is_default"].to_numpy())
        write_csv(split_raw, SPLIT_DIR / f"{split_name}_split.csv")
        return split_raw

    export_split("train", train)
    export_split("validation", val)
    raw_test = export_split("test", test)
    print(
        "[split] "
        f"train={len(train):,} ({train['is_default'].mean():.2%}) | "
        f"validation={len(val):,} ({val['is_default'].mean():.2%}) | "
        f"test={len(test):,} ({test['is_default'].mean():.2%})"
    )
    print(f"[split] CSV saved to {SPLIT_DIR}")

    X_train_raw, y_train = train[MODEL_FEATURES], train["is_default"].to_numpy(dtype=np.int8)
    X_val_raw, y_val = val[MODEL_FEATURES], val["is_default"].to_numpy(dtype=np.int8)
    X_test_raw, y_test = test[MODEL_FEATURES], test["is_default"].to_numpy(dtype=np.int8)

    preprocessor = build_preprocessor()
    X_train = preprocessor.fit_transform(X_train_raw)
    X_val = preprocessor.transform(X_val_raw)
    X_test = preprocessor.transform(X_test_raw)
    feature_names = get_feature_names(preprocessor)

    print(f"[model] Processed feature count={len(feature_names)}")
    print("[model] Training XGBoost Probability of Default model ...")
    xgb_model = fit_xgb_model(X_train, y_train, X_val, y_val)
    raw_proba_val = xgb_model.predict_proba(X_val)[:, 1]
    raw_proba_test = xgb_model.predict_proba(X_test)[:, 1]

    calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    calibrator.fit(raw_proba_val, y_val)
    proba_val = calibrator.transform(raw_proba_val)
    proba_test = calibrator.transform(raw_proba_test)

    threshold, threshold_table = find_best_threshold(y_val, proba_val, THRESHOLD_METRIC)
    write_csv(threshold_table, REPORT_DIR / "threshold_analysis.csv")
    print(f"[threshold] selected={threshold:.3f} metric={THRESHOLD_METRIC}")

    xgb_metrics = classification_metrics(y_test, proba_test, threshold)
    model_metrics = pd.DataFrame([{"model": "XGBoost_PD_Model", **xgb_metrics}])
    write_csv(model_metrics, REPORT_DIR / "test_metrics.csv")

    print("[metrics] Test metrics")
    print(model_metrics.to_string(index=False))
    print("\n[classification_report] XGBoost calibrated")
    print(classification_report(y_test, (proba_test >= threshold).astype(int), target_names=[LABEL_NON_DEFAULT, LABEL_DEFAULT]))

    test_export = make_test_export(raw_test, test, y_test, proba_test, threshold)
    write_csv(test_export, REPORT_DIR / "test_predictions.csv")

    term_adjuster = None if term_in_model else train_term_adjuster(data_csv)
    term_feature_trained = bool(term_in_model or term_adjuster is not None)

    sample_scored = score_applications(
        raw.sample(min(12, len(raw)), random_state=RANDOM_STATE).reset_index(drop=True),
        preprocessor,
        xgb_model,
        calibrator,
        credit_min,
        credit_max,
        threshold,
    )
    write_csv(sample_scored, REPORT_DIR / "sample_scoring_examples.csv")

    permutation_table = None
    if DO_PERMUTATION_IMPORTANCE:
        try:
            sample_n = min(3000, X_test.shape[0])
            rng = np.random.default_rng(RANDOM_STATE)
            idx = rng.choice(X_test.shape[0], size=sample_n, replace=False)
            perm = permutation_importance(
                xgb_model,
                X_test[idx],
                y_test[idx],
                n_repeats=5,
                random_state=RANDOM_STATE,
                scoring="average_precision",
                n_jobs=-1,
            )
            permutation_table = pd.DataFrame(
                {
                    "feature": feature_names,
                    "importance_mean": perm.importances_mean,
                    "importance_std": perm.importances_std,
                }
            ).sort_values("importance_mean", ascending=False)
            write_csv(permutation_table, REPORT_DIR / "permutation_importance.csv")
        except Exception as exc:
            print(f"[warn] permutation importance skipped: {exc}")

    metadata = {
        "version": "new_data_v1",
        "data_csv": str(data_csv),
        "source_schema": source_schema,
        "source_schema_info": source_schema_info,
        "rows": int(len(raw)),
        "target": "is_default",
        "target_mode": TARGET_MODE,
        "positive_class": LABEL_DEFAULT,
        "negative_class": LABEL_NON_DEFAULT,
        "target_mapping": target_mapping(),
        "target_note": "Default mode: loan_status=1 -> Default, loan_status=0 -> Non-Default. If your data uses loan_status=0 as Default, set TARGET_MODE_NEW_DATA=status_0_is_default.",
        "credit_score_normalization": {
            "source_column": "credit_score",
            "source_min": credit_min,
            "source_max": credit_max,
            "target_min": CREDIT_SCORE_TARGET_MIN,
            "target_max": CREDIT_SCORE_TARGET_MAX,
            "formula": "150 + (raw_score - source_min) * 600 / (source_max - source_min), clipped to 150-750",
        },
        "features": MODEL_FEATURES,
        "required_raw_input_columns": RAW_MODEL_INPUT_COLUMNS,
        "optional_runtime_input_columns": OPTIONAL_RUNTIME_INPUT_COLUMNS,
        "term_feature_mode": TERM_FEATURE_MODE,
        "term_feature_trained": term_feature_trained,
        "term_feature_note": (
            "loan_term_months and loan_monthly_payment_ratio are trained because the selected training data contains real term values."
            if term_in_model
            else (
                "Base XGBoost model is trained on all 45k loan_data.csv fields. loan_term_months is trained through term_adjuster.joblib from a real-term auxiliary dataset and applied as a PD logit adjustment at runtime."
                if term_adjuster is not None
                else "loan_data.csv has no real loan term column, so term is accepted/resolved at runtime for audit but is not used by this model artifact. Add a real loan_term_months column or provide TERM_DATA_CSV_NEW_DATA to train term adjustment."
            )
        ),
        "term_adjustment": term_adjuster.metadata if term_adjuster is not None else None,
        "term_adjustment_model_features": TERM_ADJUSTMENT_FEATURES if term_adjuster is not None else [],
        "raw_numeric_input_columns": RAW_NUMERIC_INPUT_COLUMNS,
        "derived_model_features": DERIVED_MODEL_FEATURES,
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "explain_only_features": EXPLAIN_ONLY_FEATURES,
        "processed_feature_names": feature_names,
        "threshold": {"metric": THRESHOLD_METRIC, "value": threshold},
        "metrics": xgb_metrics,
        "risk_bands": [
            {"min_score": lo, "max_score": hi, "level": level, "decision": decision}
            for lo, hi, level, decision in RISK_BANDS
        ],
        "outputs": {
            "model_dir": str(MODEL_DIR),
            "chart_dir": str(CHART_DIR),
            "report_dir": str(REPORT_DIR),
            "split_dir": str(SPLIT_DIR),
            "train_split_csv": str(SPLIT_DIR / "train_split.csv"),
            "validation_split_csv": str(SPLIT_DIR / "validation_split.csv"),
            "test_split_csv": str(SPLIT_DIR / "test_split.csv"),
        },
        "split": {
            "train_rows": int(len(train)),
            "validation_rows": int(len(val)),
            "test_rows": int(len(test)),
            "train_default_rate": round(float(train["is_default"].mean()), 6),
            "validation_default_rate": round(float(val["is_default"].mean()), 6),
            "test_default_rate": round(float(test["is_default"].mean()), 6),
        },
        "config": {
            "random_state": RANDOM_STATE,
            "test_size": TEST_SIZE,
            "val_size": VAL_SIZE,
            "xgb_n_estimators": XGB_N_ESTIMATORS,
            "xgb_max_depth": XGB_MAX_DEPTH,
            "xgb_learning_rate": XGB_LEARNING_RATE,
            "xgb_early_stopping_rounds": XGB_EARLY_STOPPING_ROUNDS,
            "xgb_tree_method": XGB_TREE_METHOD,
            "xgb_device_request": XGB_DEVICE_REQUEST,
            "xgb_resolved_device": resolve_xgb_device(),
            "permutation_importance_enabled": DO_PERMUTATION_IMPORTANCE,
            "currency_invariant_mode": CURRENCY_INVARIANT_MODE,
        },
    }

    ensure_output_dirs()
    joblib.dump(preprocessor, MODEL_DIR / "preprocessor.joblib")
    joblib.dump(calibrator, MODEL_DIR / "isotonic_calibrator.joblib")
    joblib.dump(xgb_model, MODEL_DIR / "xgb_pd_model.joblib")
    term_adjuster_path = MODEL_DIR / "term_adjuster.joblib"
    if term_adjuster is not None:
        joblib.dump(term_adjuster.model, term_adjuster_path)
    elif term_adjuster_path.exists():
        term_adjuster_path.unlink()
    xgb_model.save_model(str(MODEL_DIR / "xgb_pd_model.json"))
    save_json(MODEL_DIR / "metadata.json", metadata)
    save_json(
        MODEL_DIR / "features.json",
        {
            "target": TARGET_COLUMN,
            "target_mapping": target_mapping(),
            "required_raw_input_columns": RAW_MODEL_INPUT_COLUMNS,
            "optional_runtime_input_columns": OPTIONAL_RUNTIME_INPUT_COLUMNS,
            "model_features": MODEL_FEATURES,
            "term_adjustment_model_features": TERM_ADJUSTMENT_FEATURES if term_adjuster is not None else [],
            "explain_only_features": EXPLAIN_ONLY_FEATURES,
            "processed_feature_names": feature_names,
        },
    )
    write_csv(feature_dictionary(), REPORT_DIR / "feature_dictionary.csv")

    draw_many_charts(
        df_all=df,
        train=train,
        val=val,
        test=test,
        y_test=y_test,
        proba_test=proba_test,
        threshold=threshold,
        threshold_table=threshold_table,
        model=xgb_model,
        feature_names=feature_names,
        X_test_processed=X_test,
        model_metrics=model_metrics,
        permutation_table=permutation_table,
        test_export=test_export,
    )
    write_model_documentation(metadata, model_metrics)

    print("\n[outputs]")
    print(f"  Models : {MODEL_DIR}")
    print(f"  Charts : {CHART_DIR}")
    print(f"  Reports: {REPORT_DIR}")
    print(f"  Splits : {SPLIT_DIR}")
    print(f"  Feature dictionary: {REPORT_DIR / 'feature_dictionary.csv'}")
    print(f"  Train split     : {SPLIT_DIR / 'train_split.csv'}")
    print(f"  Validation split: {SPLIT_DIR / 'validation_split.csv'}")
    print(f"  Test split      : {SPLIT_DIR / 'test_split.csv'}")
    print(f"  Test predictions: {REPORT_DIR / 'test_predictions.csv'}")
    print(f"  Scoring examples: {REPORT_DIR / 'sample_scoring_examples.csv'}")
    print(f"  Documentation   : {CHART_DIR / 'AI_MODEL_DOCUMENTATION.md'}")

    print("\n[sample explanations]")
    cols = [
        "credit_score_raw",
        "credit_score_150_750",
        "probability_of_default",
        "model_score_150_750",
        "predicted_label",
        "risk_level",
        "decision",
        "rule_score_150_750",
        "rule_explanation",
    ]
    print(sample_scored[cols].head(5).to_string(index=False))

    return TrainingArtifacts(
        preprocessor=preprocessor,
        model=xgb_model,
        calibrator=calibrator,
        metadata=metadata,
    )


if __name__ == "__main__":
    train_pipeline()
