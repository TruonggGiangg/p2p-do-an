"""
AIScore Service - XGBoost Credit Scoring Model Training
Generates synthetic training data and trains an XGBoost classifier to predict
loan default risk based on borrower financial features.

Features:
- age: Tuổi người vay
- monthly_income: Thu nhập hàng tháng
- employment_years: Số năm đi làm
- avg_account_balance: Số dư tài khoản trung bình
- monthly_spending: Chi tiêu hàng tháng
- loan_amount: Số tiền vay
- loan_term: Kỳ hạn vay (tháng)
- loan_to_income_ratio: Tỷ lệ khoản vay / thu nhập
- previous_loans_count: Số khoản vay trước đó
- late_payment_count: Số lần trả trễ
- repayment_ratio: Tỷ lệ trả nợ đúng hạn (0-1)
- DTI: Debt-to-Income ratio
- cashflow_stability: Độ ổn định dòng tiền (0-1)

Target: is_good_borrower (1 = tốt / khả năng trả nợ, 0 = xấu / rủi ro vỡ nợ)
"""

import os
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
)
from sklearn.preprocessing import StandardScaler
import joblib
import json

# ===================== CONFIG =====================
RANDOM_STATE = 42
N_SAMPLES = 15000
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
FEATURE_NAMES = [
    "age",
    "monthly_income",
    "employment_years",
    "avg_account_balance",
    "monthly_spending",
    "loan_amount",
    "loan_term",
    "loan_to_income_ratio",
    "previous_loans_count",
    "late_payment_count",
    "repayment_ratio",
    "DTI",
    "cashflow_stability",
]


def generate_synthetic_data(n_samples: int = N_SAMPLES) -> pd.DataFrame:
    """
    Generate realistic synthetic data for credit scoring.
    The label is_good_borrower is derived from a probability function
    based on financial risk factors, not randomly assigned.
    """
    rng = np.random.RandomState(RANDOM_STATE)

    age = rng.randint(20, 65, size=n_samples).astype(float)
    monthly_income = rng.lognormal(mean=16.2, sigma=0.6, size=n_samples).clip(
        3_000_000, 200_000_000
    )  # VND
    employment_years = (age - 18 - rng.exponential(3, n_samples)).clip(0, 40)
    avg_account_balance = monthly_income * rng.uniform(0.5, 8, size=n_samples)
    monthly_spending = monthly_income * rng.uniform(0.3, 0.95, size=n_samples)
    loan_amount = rng.lognormal(mean=17.5, sigma=0.8, size=n_samples).clip(
        1_000_000, 500_000_000
    )
    loan_term = rng.choice([3, 6, 9, 12, 18, 24, 36, 48, 60], size=n_samples).astype(
        float
    )
    loan_to_income_ratio = loan_amount / (monthly_income * 12)
    previous_loans_count = rng.poisson(2, size=n_samples).astype(float)
    late_payment_count = rng.poisson(1, size=n_samples).astype(float)
    repayment_ratio = rng.beta(5, 1.5, size=n_samples).clip(0, 1)
    DTI = (monthly_spending + loan_amount / loan_term) / monthly_income
    cashflow_stability = rng.beta(4, 2, size=n_samples).clip(0, 1)

    # --- Compute default probability from risk factors ---
    # Higher score = more likely to be good borrower
    score = np.zeros(n_samples)

    # Age factor: sweet spot 28-55
    score += np.where((age >= 28) & (age <= 55), 1.0, -0.3)

    # Income factor
    score += np.log1p(monthly_income) / 20.0

    # Employment stability
    score += np.minimum(employment_years / 10.0, 1.5)

    # Account balance health
    balance_ratio = avg_account_balance / (monthly_income + 1)
    score += np.minimum(balance_ratio / 3.0, 1.2)

    # Spending discipline: lower spending ratio = better
    spending_ratio = monthly_spending / (monthly_income + 1)
    score += np.where(spending_ratio < 0.6, 1.0, np.where(spending_ratio < 0.8, 0.3, -0.8))

    # Loan burden
    score -= loan_to_income_ratio * 2.0

    # DTI penalty
    score -= np.where(DTI > 0.5, (DTI - 0.5) * 3.0, 0)

    # Repayment history
    score += repayment_ratio * 2.5
    score -= late_payment_count * 0.6

    # Previous loans (experience but also risk)
    score += np.minimum(previous_loans_count * 0.15, 0.6)
    score -= np.where(previous_loans_count > 5, (previous_loans_count - 5) * 0.3, 0)

    # Cashflow stability
    score += cashflow_stability * 1.5

    # Convert to probability via sigmoid
    prob_good = 1.0 / (1.0 + np.exp(-score))
    # Add slight noise
    prob_good = (prob_good + rng.normal(0, 0.05, n_samples)).clip(0.01, 0.99)

    is_good_borrower = rng.binomial(1, prob_good)

    df = pd.DataFrame(
        {
            "age": age,
            "monthly_income": monthly_income,
            "employment_years": employment_years,
            "avg_account_balance": avg_account_balance,
            "monthly_spending": monthly_spending,
            "loan_amount": loan_amount,
            "loan_term": loan_term,
            "loan_to_income_ratio": loan_to_income_ratio,
            "previous_loans_count": previous_loans_count,
            "late_payment_count": late_payment_count,
            "repayment_ratio": repayment_ratio,
            "DTI": DTI,
            "cashflow_stability": cashflow_stability,
            "is_good_borrower": is_good_borrower,
        }
    )
    return df


def train_model():
    """Train XGBoost credit scoring model and save artifacts."""
    print("=" * 60)
    print("  AIScore - XGBoost Credit Scoring Model Training")
    print("=" * 60)

    # 1. Generate / Load data
    print("\n[1/5] Generating synthetic training data...")
    df = generate_synthetic_data(N_SAMPLES)
    print(f"  -> Dataset shape: {df.shape}")
    print(f"  -> Good borrowers: {df['is_good_borrower'].sum()} ({df['is_good_borrower'].mean()*100:.1f}%)")
    print(f"  -> Bad borrowers: {(1 - df['is_good_borrower']).sum()} ({(1 - df['is_good_borrower']).mean()*100:.1f}%)")

    # 2. Prepare features
    print("\n[2/5] Preparing features...")
    X = df[FEATURE_NAMES].values
    y = df["is_good_borrower"].values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )
    print(f"  -> Train: {X_train.shape[0]} samples, Test: {X_test.shape[0]} samples")

    # 3. Train XGBoost
    print("\n[3/5] Training XGBoost model...")
    # Calculate scale_pos_weight for imbalanced data
    n_pos = y_train.sum()
    n_neg = len(y_train) - n_pos
    scale_pos_weight = n_neg / max(n_pos, 1)

    model = xgb.XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        gamma=0.1,
        reg_alpha=0.1,
        reg_lambda=1.0,
        scale_pos_weight=scale_pos_weight,
        random_state=RANDOM_STATE,
        eval_metric="logloss",
        early_stopping_rounds=30,
    )

    model.fit(
        X_train,
        y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )
    print(f"  -> Best iteration: {model.best_iteration}")

    # 4. Evaluate
    print("\n[4/5] Evaluating model...")
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred, zero_division=0)
    recall = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    auc = roc_auc_score(y_test, y_prob)

    print(f"\n  Accuracy:  {accuracy:.4f}")
    print(f"  Precision: {precision:.4f}")
    print(f"  Recall:    {recall:.4f}")
    print(f"  F1-Score:  {f1:.4f}")
    print(f"  AUC-ROC:   {auc:.4f}")

    print(f"\n  Classification Report:")
    print(classification_report(y_test, y_pred, target_names=["Bad (0)", "Good (1)"]))

    # Cross-validation (use a fresh model without early stopping for CV)
    print("  5-Fold Cross-Validation AUC...")
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    cv_model = xgb.XGBClassifier(
        n_estimators=model.best_iteration + 1,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        gamma=0.1,
        reg_alpha=0.1,
        reg_lambda=1.0,
        scale_pos_weight=scale_pos_weight,
        random_state=RANDOM_STATE,
        eval_metric="logloss",
    )
    cv_scores = cross_val_score(cv_model, X_scaled, y, cv=cv, scoring="roc_auc")
    print(f"  -> CV AUC: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    # Feature importance
    importance = model.feature_importances_
    feat_imp = sorted(zip(FEATURE_NAMES, importance), key=lambda x: x[1], reverse=True)
    print("\n  Feature Importance:")
    for fname, imp in feat_imp:
        bar = "█" * int(imp * 50)
        print(f"    {fname:>25s}: {imp:.4f} {bar}")

    # 5. Save model artifacts
    print("\n[5/5] Saving model artifacts...")
    os.makedirs(MODEL_DIR, exist_ok=True)

    model_path = os.path.join(MODEL_DIR, "xgb_credit_model.json")
    model.save_model(model_path)
    print(f"  -> Model saved: {model_path}")

    scaler_path = os.path.join(MODEL_DIR, "scaler.joblib")
    joblib.dump(scaler, scaler_path)
    print(f"  -> Scaler saved: {scaler_path}")

    # Save metadata
    metadata = {
        "feature_names": FEATURE_NAMES,
        "n_features": len(FEATURE_NAMES),
        "n_train_samples": int(X_train.shape[0]),
        "n_test_samples": int(X_test.shape[0]),
        "metrics": {
            "accuracy": round(accuracy, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1, 4),
            "auc_roc": round(auc, 4),
            "cv_auc_mean": round(float(cv_scores.mean()), 4),
            "cv_auc_std": round(float(cv_scores.std()), 4),
        },
        "feature_importance": {name: round(float(imp), 4) for name, imp in feat_imp},
        "model_params": model.get_params(),
        "score_thresholds": {
            "excellent": 0.85,
            "good": 0.70,
            "fair": 0.50,
            "poor": 0.30,
            "very_poor": 0.0,
        },
    }
    # Convert any numpy types for JSON serialization
    def _convert(obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return obj

    metadata_path = os.path.join(MODEL_DIR, "metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, default=_convert, ensure_ascii=False)
    print(f"  -> Metadata saved: {metadata_path}")

    print("\n" + "=" * 60)
    print("  Training complete!")
    print("=" * 60)

    return model, scaler, metadata


if __name__ == "__main__":
    train_model()
