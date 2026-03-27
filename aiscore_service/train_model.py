"""
AIScore Service — XGBoost Risk Model Training (VNĐ Context)
============================================================

Pipeline:
  1. Load Lending Club CSV (~396K records)
  2. Clean target (Fully Paid → 0, Charged Off → 1)
  3. Feature selection — chống data leakage
  4. Scale USD → VNĐ (tỷ giá env: USD_TO_VND, default 25000)
  5. Map sub_grade → credit_score (150–750 FICO-style)
  6. Preprocessing: parse term/emp_length, encode categoricals
  7. Feature engineering: dti, revolving pressure…
  8. Train XGBoost (StratifiedKFold CV + early stopping)
  9. Save model (.json), scaler (.joblib), metadata (.json)

Output khi predict:
  {
    "ai_risk_score": 82,          # 0-100 (100 = nguy hiểm nhất)
    "default_probability": 0.18,  # 0.0 – 1.0
    "status": "success"
  }

VNĐ scaling cho phép model trực tiếp học trên giá trị tiền Việt:
  loan_amnt × RATE → capital (VNĐ)
  annual_inc ÷ 12 × RATE → monthly_income (VNĐ)
  installment × RATE → monthly_pay (VNĐ)
  revol_bal × RATE → revolving_balance (VNĐ)
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
from sklearn.preprocessing import StandardScaler
import joblib
import json

warnings.filterwarnings("ignore", category=UserWarning)

# ===================== CONFIG =====================
RANDOM_STATE = 42
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
DATA_PATH = os.path.join(os.path.dirname(__file__), "lending_club_loan_two.csv")

# ── Tỷ giá USD → VNĐ (dynamic) ──
# Ưu tiên: 1) ENV var → 2) Live API → 3) Fallback 25000
DEFAULT_RATE = 25_000

def fetch_usd_to_vnd() -> tuple[float, str]:
    """
    Lấy tỷ giá USD→VNĐ real-time.
    1. Env var USD_TO_VND (override cứng nếu cần)
    2. open.er-api.com (miễn phí, không cần key)
    3. Fallback 25000
    """
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
            req = urllib.request.Request(url, headers={"User-Agent": "aiscore-service/2.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = _json.loads(resp.read().decode())
                rate = extractor(data)
                if rate and float(rate) > 0:
                    return float(rate), url.split("/")[2]
        except Exception:
            continue

    return float(DEFAULT_RATE), "fallback"

USD_TO_VND, _RATE_SOURCE = fetch_usd_to_vnd()
print(f"[train] Exchange rate: 1 USD = {USD_TO_VND:,.0f} VNĐ (source: {_RATE_SOURCE})")

# ── sub_grade → credit_score (150–750, tương ứng hệ thống NestJS) ──
# A1=750 … G5=150, step ≈ 17.14
_GRADES = []
for _letter_idx, _letter in enumerate("ABCDEFG"):
    for _sub in range(1, 6):
        _GRADES.append(f"{_letter}{_sub}")
# A1 (idx 0) → 750, G5 (idx 34) → 150
SUB_GRADE_TO_SCORE = {
    g: int(round(750 - (750 - 150) * i / (len(_GRADES) - 1)))
    for i, g in enumerate(_GRADES)
}

# Features cuối cho XGBoost (sau khi engineer) — 16 features
FEATURE_NAMES = [
    "credit_score",              # sub_grade → 150-750
    "capital",                   # loan_amnt × VND
    "monthly_income",            # annual_inc / 12 × VND
    "monthly_pay",               # installment × VND
    "revolving_balance",         # revol_bal × VND
    "interest_rate",             # int_rate (%)
    "dti",                       # debt-to-income (%)
    "revolving_util_percent",    # revol_util (%)
    "term_months",               # 36 or 60
    "emp_length_years",          # 0–10
    "active_bad_debts",          # pub_rec
    "bankruptcies",              # pub_rec_bankruptcies
    "active_loans",              # open_acc
    "total_loans_history",       # total_acc
    "home_ownership_enc",        # one-hot → ordinal
    "purpose_enc",               # one-hot → ordinal
]


def load_and_clean_data(path: str) -> pd.DataFrame:
    """
    Load Lending Club CSV, clean, scale USD→VNĐ, engineer features.
    """
    print(f"  Loading CSV from {path}...")
    df = pd.read_csv(path)
    print(f"  Raw shape: {df.shape}")

    # ── 1. Target: Fully Paid → 0, Charged Off → 1 ──
    df = df[df["loan_status"].isin(["Fully Paid", "Charged Off"])].copy()
    df["is_default"] = (df["loan_status"] == "Charged Off").astype(int)
    print(f"  After filtering loan_status: {df.shape}")
    print(f"  Default rate: {df['is_default'].mean() * 100:.2f}%")

    # ── 2. Map sub_grade → credit_score (150–750) ──
    df["credit_score"] = df["sub_grade"].map(SUB_GRADE_TO_SCORE)
    df = df.dropna(subset=["credit_score"])
    df["credit_score"] = df["credit_score"].astype(int)

    # ── 3. Scale USD → VNĐ ──
    rate = USD_TO_VND
    print(f"  USD→VNĐ rate: {rate:,.0f}")
    df["capital"] = df["loan_amnt"] * rate
    df["monthly_income"] = (df["annual_inc"] / 12) * rate
    df["monthly_pay"] = df["installment"] * rate
    df["revolving_balance"] = df["revol_bal"] * rate

    # ── 4. Parse term: " 36 months" → 36 ──
    df["term_months"] = df["term"].str.extract(r"(\d+)").astype(float)

    # ── 5. Parse emp_length → years ──
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

    # ── 6. Rename columns for consistency ──
    df["interest_rate"] = df["int_rate"]
    df["revolving_util_percent"] = df["revol_util"]
    df["active_bad_debts"] = df["pub_rec"]
    df["bankruptcies"] = df["pub_rec_bankruptcies"]
    df["active_loans"] = df["open_acc"]
    df["total_loans_history"] = df["total_acc"]

    # ── 7. Fill missing ──
    df["emp_length_years"] = df["emp_length_years"].fillna(df["emp_length_years"].median())
    df["bankruptcies"] = df["bankruptcies"].fillna(0)
    df["revolving_util_percent"] = df["revolving_util_percent"].fillna(
        df["revolving_util_percent"].median()
    )
    df["active_bad_debts"] = df["active_bad_debts"].fillna(0)

    # ── 8. Encode categoricals ──
    home_map = {"RENT": 0, "OWN": 1, "MORTGAGE": 2, "OTHER": 3, "NONE": 3, "ANY": 3}
    df["home_ownership_enc"] = df["home_ownership"].map(home_map).fillna(3).astype(int)

    purpose_map = {
        "debt_consolidation": 0, "credit_card": 1, "home_improvement": 2,
        "other": 3, "major_purchase": 4, "medical": 5, "small_business": 6,
        "car": 7, "vacation": 8, "moving": 9, "house": 10,
        "wedding": 11, "renewable_energy": 12, "educational": 13,
    }
    df["purpose_enc"] = df["purpose"].map(purpose_map).fillna(3).astype(int)

    # ── 9. Clip outliers ──
    df["dti"] = df["dti"].clip(0, 100)
    df["active_loans"] = df["active_loans"].clip(0, 50)
    df["revolving_util_percent"] = df["revolving_util_percent"].clip(0, 150)
    df["monthly_income"] = df["monthly_income"].clip(0, df["monthly_income"].quantile(0.99))

    # ── 10. Select final features + target, drop NaN ──
    feature_cols = FEATURE_NAMES + ["is_default"]
    df = df[feature_cols].dropna()
    print(f"  After full cleaning: {df.shape}")
    print(f"  Final default rate: {df['is_default'].mean() * 100:.2f}%")

    return df


def train_model():
    """
    Train XGBoost classifier trên Lending Club data (VNĐ-scaled).
    """
    print("=" * 65)
    print("  AIScore — XGBoost Risk Model Training (VNĐ Context)")
    print("=" * 65)

    # ── 1. Load & clean ──
    print("\n[1/6] Loading & cleaning Lending Club data...")
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(
            f"Data not found: {DATA_PATH}\n"
            "Đặt lending_club_loan_two.csv vào thư mục aiscore_service."
        )
    df = load_and_clean_data(DATA_PATH)

    # ── 2. Prepare features ──
    print("\n[2/6] Preparing features & standardizing...")
    X = df[FEATURE_NAMES].values
    y = df["is_default"].values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )
    print(f"  Train: {X_train.shape[0]:,} | Test: {X_test.shape[0]:,}")
    print(f"  Default rate — Train: {y_train.mean() * 100:.2f}% | Test: {y_test.mean() * 100:.2f}%")

    # ── 3. Train XGBoost ──
    print("\n[3/6] Training XGBoost model...")
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
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )
    print(f"  Best iteration: {model.best_iteration}")
    print(f"  Best AUC on eval: {model.best_score:.4f}")

    # ── 4. Evaluate ──
    print("\n[4/6] Evaluating model...")
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

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
    print(f"    {'Actual Paid':>12}  {cm[0, 0]:>8,}  {cm[0, 1]:>12,}")
    print(f"    {'Actual Def':>12}  {cm[1, 0]:>8,}  {cm[1, 1]:>12,}")

    print(f"\n  PD Distribution on test set:")
    for q in [0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]:
        print(f"    P{int(q * 100):>2}: {np.percentile(y_prob, q * 100):.4f}")
    print(f"    Mean PD: {y_prob.mean():.4f}")

    # ── 5. Cross-validation ──
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
    print("\n  Feature Importance:")
    for i, (fname, imp) in enumerate(feat_imp):
        bar = "█" * int(imp * 60)
        print(f"    {i + 1:>2}. {fname:>28s}: {imp:.4f} {bar}")

    # ── 6. Save artifacts ──
    print("\n[6/6] Saving model artifacts...")
    os.makedirs(MODEL_DIR, exist_ok=True)

    model_path = os.path.join(MODEL_DIR, "xgb_pd_model.json")
    model.save_model(model_path)
    print(f"  → Model saved: {model_path}")

    scaler_path = os.path.join(MODEL_DIR, "scaler.joblib")
    joblib.dump(scaler, scaler_path)
    print(f"  → Scaler saved: {scaler_path}")

    # Purpose map (for scorer to reuse)
    purpose_map = {
        "debt_consolidation": 0, "credit_card": 1, "home_improvement": 2,
        "other": 3, "major_purchase": 4, "medical": 5, "small_business": 6,
        "car": 7, "vacation": 8, "moving": 9, "house": 10,
        "wedding": 11, "renewable_energy": 12, "educational": 13,
    }

    metadata = {
        "model_type": "XGBoost PD — VNĐ Context",
        "data_source": "Lending Club (USD scaled → VNĐ)",
        "usd_to_vnd_rate": USD_TO_VND,
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
        "purpose_map": purpose_map,
        "home_ownership_map": {"RENT": 0, "OWN": 1, "MORTGAGE": 2, "OTHER": 3},
        "sub_grade_to_score": SUB_GRADE_TO_SCORE,
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
    print("\n  Example predictions on test set:")
    rng = np.random.RandomState(42)
    sample_idx = rng.choice(len(y_test), 5, replace=False)
    for idx in sample_idx:
        pd_val = y_prob[idx]
        actual = "Default" if y_test[idx] == 1 else "Paid"
        risk_score = int(round(pd_val * 100))
        print(
            f"    PD={pd_val:.4f} | ai_risk_score={risk_score} | Actual={actual}"
        )

    print("\n" + "=" * 65)
    print("  Training complete!")
    print(f"  Model: XGBoost | Features: {len(FEATURE_NAMES)} | VNĐ rate: {USD_TO_VND:,.0f}")
    print("=" * 65)

    return model, scaler, metadata


if __name__ == "__main__":
    train_model()
