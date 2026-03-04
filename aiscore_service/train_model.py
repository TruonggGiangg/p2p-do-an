"""
AIScore Service - XGBoost Probability of Default (PD) Model Training
====================================================================

Luồng chuẩn fintech:
  XGBoost Model → Predict PD → Store PD → Convert → Credit Score
  → Update Membership Tier → Decision Engine → Loan Approval (Fineract)

Dùng dữ liệu thực Lending Club (lending_club_loan_two.csv) với ~396K records.
- Target: loan_status (Fully Paid → 0, Charged Off → 1)
- Output: PD = Probability of Default (0.0 - 1.0)

PD Meaning:
  - PD = 0.03 → rủi ro vỡ nợ 3%
  - PD = 0.18 → rủi ro vỡ nợ 18%
  - PD = 0.45 → rủi ro vỡ nợ 45%

Credit Score (từ PD):
  credit_score = 300 + (1 - PD) × 550  →  300-850

Membership Tier:
  >=800 → Platinum | 700-799 → Gold | 600-699 → Silver | <600 → Basic

Grade & Sub-Grade (từ PD):
  A (A1-A5): PD < 0.10
  B (B1-B5): PD 0.10-0.20
  C (C1-C5): PD 0.20-0.30
  D (D1-D5): PD 0.30-0.40
  E (E1-E5): PD 0.40-0.55
  F (F1-F5): PD 0.55-0.70
  G (G1-G5): PD >= 0.70
"""

import os
import warnings
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
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
)
from sklearn.preprocessing import StandardScaler, LabelEncoder
import joblib
import json

warnings.filterwarnings("ignore", category=UserWarning)

# ===================== CONFIG =====================
RANDOM_STATE = 42
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
DATA_PATH = os.path.join(os.path.dirname(__file__), "lending_club_loan_two.csv")

# Features sử dụng từ Lending Club data (sau khi clean & engineer)
FEATURE_NAMES = [
    "loan_amnt",
    "term_months",
    "int_rate",
    "installment",
    "annual_inc",
    "dti",
    "open_acc",
    "pub_rec",
    "revol_bal",
    "revol_util",
    "total_acc",
    "mort_acc",
    "pub_rec_bankruptcies",
    "emp_length_years",
    "home_ownership_enc",
    "verification_status_enc",
    "purpose_enc",
    "application_type_enc",
    "initial_list_status_enc",
    "log_annual_inc",
    "log_revol_bal",
    "installment_to_income",
    "revol_util_x_bal",
    "credit_history_years",
]

# Grade & Sub-Grade PD thresholds
GRADE_THRESHOLDS = [
    ("A", 0.00, 0.10),
    ("B", 0.10, 0.20),
    ("C", 0.20, 0.30),
    ("D", 0.30, 0.40),
    ("E", 0.40, 0.55),
    ("F", 0.55, 0.70),
    ("G", 0.70, 1.01),
]


def load_and_clean_data(path: str) -> pd.DataFrame:
    """
    Load Lending Club CSV, chuẩn hóa dữ liệu, xử lý missing, encode categoricals,
    tạo derived features. Lọc sạch toàn bộ trước khi train.
    """
    print("  Loading CSV...")
    df = pd.read_csv(path)
    print(f"  Raw shape: {df.shape}")

    # ── 1. Target: loan_status → is_default (1 = Charged Off, 0 = Fully Paid)
    df = df[df["loan_status"].isin(["Fully Paid", "Charged Off"])].copy()
    df["is_default"] = (df["loan_status"] == "Charged Off").astype(int)
    print(f"  After filtering loan_status: {df.shape}")
    print(f"  Default rate: {df['is_default'].mean()*100:.2f}%")

    # ── 2. Clean numeric columns
    # term: " 36 months" → 36
    df["term_months"] = df["term"].str.extract(r"(\d+)").astype(float)

    # emp_length: "10+ years" → 10, "< 1 year" → 0.5, "2 years" → 2
    def parse_emp_length(val):
        if pd.isna(val):
            return np.nan
        val = str(val).strip()
        if "10+" in val:
            return 10.0
        if "< 1" in val:
            return 0.5
        nums = pd.to_numeric(val.split()[0], errors="coerce")
        return nums if not pd.isna(nums) else np.nan

    df["emp_length_years"] = df["emp_length"].apply(parse_emp_length)

    # earliest_cr_line → credit_history_years
    df["earliest_cr_line_dt"] = pd.to_datetime(df["earliest_cr_line"], format="%b-%Y", errors="coerce")
    df["issue_d_dt"] = pd.to_datetime(df["issue_d"], format="%b-%Y", errors="coerce")
    df["credit_history_years"] = (
        (df["issue_d_dt"] - df["earliest_cr_line_dt"]).dt.days / 365.25
    ).clip(0, 60)

    # ── 3. Handle missing values (fill trước khi drop)
    df["emp_length_years"] = df["emp_length_years"].fillna(df["emp_length_years"].median())
    df["mort_acc"] = df["mort_acc"].fillna(df["mort_acc"].median())
    df["pub_rec_bankruptcies"] = df["pub_rec_bankruptcies"].fillna(0)
    df["revol_util"] = df["revol_util"].fillna(df["revol_util"].median())
    df["credit_history_years"] = df["credit_history_years"].fillna(df["credit_history_years"].median())

    # ── 4. Encode categorical features
    home_map = {"RENT": 0, "OWN": 1, "MORTGAGE": 2, "OTHER": 3, "NONE": 3, "ANY": 3}
    df["home_ownership_enc"] = df["home_ownership"].map(home_map).fillna(3).astype(int)

    verif_map = {"Not Verified": 0, "Source Verified": 1, "Verified": 2}
    df["verification_status_enc"] = df["verification_status"].map(verif_map).fillna(0).astype(int)

    le_purpose = LabelEncoder()
    df["purpose_enc"] = le_purpose.fit_transform(df["purpose"].fillna("other"))

    app_map = {"INDIVIDUAL": 0, "JOINT": 1, "Joint App": 1}
    df["application_type_enc"] = df["application_type"].map(app_map).fillna(0).astype(int)

    list_map = {"w": 0, "f": 1}
    df["initial_list_status_enc"] = df["initial_list_status"].map(list_map).fillna(0).astype(int)

    # ── 5. Feature engineering (derived features)
    df["log_annual_inc"] = np.log1p(df["annual_inc"])
    df["log_revol_bal"] = np.log1p(df["revol_bal"])
    df["installment_to_income"] = df["installment"] / (df["annual_inc"] / 12 + 1)
    df["revol_util_x_bal"] = df["revol_util"] * df["revol_bal"] / 1e6

    # ── 6. Remove outliers (clip extreme values)
    df["annual_inc"] = df["annual_inc"].clip(0, 1_000_000)
    df["dti"] = df["dti"].clip(0, 100)
    df["open_acc"] = df["open_acc"].clip(0, 50)
    df["revol_util"] = df["revol_util"].clip(0, 150)

    # ── 7. Drop rows with remaining NaN in feature columns
    feature_cols = FEATURE_NAMES + ["is_default"]
    df = df[feature_cols].dropna()
    print(f"  After full cleaning: {df.shape}")
    print(f"  Final default rate: {df['is_default'].mean()*100:.2f}%")

    return df


def pd_to_grade(pd_val: float) -> str:
    """Convert PD to Grade + Sub-Grade (A1-G5)."""
    for grade_letter, lo, hi in GRADE_THRESHOLDS:
        if lo <= pd_val < hi:
            span = hi - lo
            offset = pd_val - lo
            sub = min(int(offset / (span / 5)) + 1, 5)
            return f"{grade_letter}{sub}"
    return "G5"


def score_to_tier(score: int) -> str:
    """Convert credit score → membership tier."""
    if score >= 800:
        return "Platinum"
    elif score >= 700:
        return "Gold"
    elif score >= 600:
        return "Silver"
    else:
        return "Basic"


def train_model():
    """
    Train XGBoost PD model trên dữ liệu Lending Club thật.
    Output: PD → Credit Score → Grade/SubGrade → Tier.
    """
    print("=" * 65)
    print("  AIScore - XGBoost PD (Probability of Default) Model Training")
    print("=" * 65)

    # ──────────────────────────────────────────────────────────────────────
    # 1. Load & clean data
    # ──────────────────────────────────────────────────────────────────────
    print("\n[1/6] Loading & cleaning Lending Club data...")
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(
            f"Data file not found: {DATA_PATH}\n"
            "Hãy đặt lending_club_loan_two.csv vào thư mục aiscore_service."
        )
    df = load_and_clean_data(DATA_PATH)

    # ──────────────────────────────────────────────────────────────────────
    # 2. Prepare features & split
    # ──────────────────────────────────────────────────────────────────────
    print("\n[2/6] Preparing features & standardizing...")
    X = df[FEATURE_NAMES].values
    y = df["is_default"].values  # 1 = default (Charged Off), 0 = paid (Fully Paid)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )
    print(f"  Train: {X_train.shape[0]:,} | Test: {X_test.shape[0]:,}")
    print(f"  Default rate — Train: {y_train.mean()*100:.2f}% | Test: {y_test.mean()*100:.2f}%")

    # ──────────────────────────────────────────────────────────────────────
    # 3. Train XGBoost
    # ──────────────────────────────────────────────────────────────────────
    print("\n[3/6] Training XGBoost model...")
    # Không dùng scale_pos_weight để PD output calibrated (mean PD ≈ actual default rate)
    # Nếu dùng scale_pos_weight thì PD sẽ bị inflate, không reflect đúng xác suất thực

    model = xgb.XGBClassifier(
        n_estimators=500,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=10,
        gamma=0.3,
        reg_alpha=1.0,
        reg_lambda=3.0,
        random_state=RANDOM_STATE,
        eval_metric="auc",
        early_stopping_rounds=50,
        tree_method="hist",
    )

    model.fit(
        X_train,
        y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )
    print(f"  Best iteration: {model.best_iteration}")
    print(f"  Best AUC on eval: {model.best_score:.4f}")

    # ──────────────────────────────────────────────────────────────────────
    # 4. Evaluate
    # ──────────────────────────────────────────────────────────────────────
    print("\n[4/6] Evaluating model...")
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]  # PD = P(default)

    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred, zero_division=0)
    recall = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    auc = roc_auc_score(y_test, y_prob)
    brier = brier_score_loss(y_test, y_prob)
    logloss = log_loss(y_test, y_prob)

    print(f"\n  Accuracy:     {accuracy:.4f}")
    print(f"  Precision:    {precision:.4f}")
    print(f"  Recall:       {recall:.4f}")
    print(f"  F1-Score:     {f1:.4f}")
    print(f"  AUC-ROC:      {auc:.4f}")
    print(f"  Brier Score:  {brier:.4f}  (lower = better calibrated)")
    print(f"  Log Loss:     {logloss:.4f}")

    print(f"\n  Classification Report:")
    print(classification_report(y_test, y_pred, target_names=["Paid (0)", "Default (1)"]))

    cm = confusion_matrix(y_test, y_pred)
    print(f"  Confusion Matrix:")
    print(f"    {'':>12} Pred Paid  Pred Default")
    print(f"    {'Actual Paid':>12}  {cm[0,0]:>8,}  {cm[0,1]:>12,}")
    print(f"    {'Actual Def':>12}  {cm[1,0]:>8,}  {cm[1,1]:>12,}")

    print(f"\n  PD Distribution on test set:")
    for q in [0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]:
        print(f"    P{int(q*100):>2}: {np.percentile(y_prob, q*100):.4f}")
    print(f"    Mean PD: {y_prob.mean():.4f}")

    # ──────────────────────────────────────────────────────────────────────
    # 5. Cross-validation
    # ──────────────────────────────────────────────────────────────────────
    print("\n[5/6] 5-Fold Cross-Validation...")
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    cv_model = xgb.XGBClassifier(
        n_estimators=model.best_iteration + 1,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=10,
        gamma=0.3,
        reg_alpha=1.0,
        reg_lambda=3.0,
        random_state=RANDOM_STATE,
        eval_metric="auc",
        tree_method="hist",
    )
    cv_scores = cross_val_score(cv_model, X_scaled, y, cv=cv, scoring="roc_auc")
    print(f"  CV AUC: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    # Feature importance
    importance = model.feature_importances_
    feat_imp = sorted(zip(FEATURE_NAMES, importance), key=lambda x: x[1], reverse=True)
    print("\n  Feature Importance (top 15):")
    for i, (fname, imp) in enumerate(feat_imp[:15]):
        bar = "█" * int(imp * 60)
        print(f"    {i+1:>2}. {fname:>28s}: {imp:.4f} {bar}")

    # ──────────────────────────────────────────────────────────────────────
    # 6. Save model artifacts
    # ──────────────────────────────────────────────────────────────────────
    print("\n[6/6] Saving model artifacts...")
    os.makedirs(MODEL_DIR, exist_ok=True)

    model_path = os.path.join(MODEL_DIR, "xgb_pd_model.json")
    model.save_model(model_path)
    print(f"  → Model saved: {model_path}")

    scaler_path = os.path.join(MODEL_DIR, "scaler.joblib")
    joblib.dump(scaler, scaler_path)
    print(f"  → Scaler saved: {scaler_path}")

    metadata = {
        "model_type": "XGBoost PD (Probability of Default)",
        "data_source": "Lending Club",
        "n_records": int(len(df)),
        "feature_names": FEATURE_NAMES,
        "n_features": len(FEATURE_NAMES),
        "n_train_samples": int(X_train.shape[0]),
        "n_test_samples": int(X_test.shape[0]),
        "default_rate": round(float(y.mean()), 4),
        "metrics": {
            "accuracy": round(accuracy, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1, 4),
            "auc_roc": round(auc, 4),
            "brier_score": round(brier, 4),
            "log_loss": round(logloss, 4),
            "cv_auc_mean": round(float(cv_scores.mean()), 4),
            "cv_auc_std": round(float(cv_scores.std()), 4),
        },
        "feature_importance": {name: round(float(imp), 4) for name, imp in feat_imp},
        "grade_thresholds": {g: {"min_pd": lo, "max_pd": hi} for g, lo, hi in GRADE_THRESHOLDS},
        "tier_thresholds": {
            "Platinum": {"min_score": 800, "max_pd": 0.091},
            "Gold": {"min_score": 700, "max_pd": 0.273},
            "Silver": {"min_score": 600, "max_pd": 0.455},
            "Basic": {"min_score": 300, "max_pd": 1.0},
        },
        "model_params": {
            k: v for k, v in model.get_params().items()
            if k not in ("callbacks", "kwargs")
        },
    }

    def _json_safe(obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.bool_):
            return bool(obj)
        return obj

    metadata_path = os.path.join(MODEL_DIR, "metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, default=_json_safe, ensure_ascii=False)
    print(f"  → Metadata saved: {metadata_path}")

    # Example predictions
    print("\n  Example PD predictions on test set:")
    rng = np.random.RandomState(42)
    sample_idx = rng.choice(len(y_test), 5, replace=False)
    for idx in sample_idx:
        pd_val = y_prob[idx]
        actual = "Default" if y_test[idx] == 1 else "Paid"
        score = int(300 + (1 - pd_val) * 550)
        grade = pd_to_grade(pd_val)
        tier = score_to_tier(score)
        print(f"    PD={pd_val:.4f} | Score={score} | Grade={grade} | Tier={tier} | Actual={actual}")

    print("\n" + "=" * 65)
    print("  Training complete! Luồng: XGBoost → PD → Credit Score → Tier")
    print("=" * 65)

    return model, scaler, metadata


if __name__ == "__main__":
    train_model()
