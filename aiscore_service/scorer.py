"""
AIScore Service - Credit Score Predictor
Loads trained XGBoost model and provides scoring API.
"""

import os
import numpy as np
import xgboost as xgb
import joblib
import json
from typing import Optional

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

SCORE_THRESHOLDS = {
    "excellent": 0.85,
    "good": 0.70,
    "fair": 0.50,
    "poor": 0.30,
    "very_poor": 0.0,
}


class CreditScorer:
    """XGBoost-based credit scoring engine."""

    def __init__(self, model_dir: str = MODEL_DIR):
        self.model: Optional[xgb.XGBClassifier] = None
        self.scaler = None
        self.metadata: dict = {}
        self.model_dir = model_dir
        self._load_model()

    def _load_model(self):
        model_path = os.path.join(self.model_dir, "xgb_credit_model.json")
        scaler_path = os.path.join(self.model_dir, "scaler.joblib")
        metadata_path = os.path.join(self.model_dir, "metadata.json")

        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Model not found at {model_path}. Run train_model.py first."
            )

        self.model = xgb.XGBClassifier()
        self.model.load_model(model_path)

        if os.path.exists(scaler_path):
            self.scaler = joblib.load(scaler_path)

        if os.path.exists(metadata_path):
            with open(metadata_path, "r", encoding="utf-8") as f:
                self.metadata = json.load(f)

    def predict(self, features: dict) -> dict:
        """
        Predict credit score for a single borrower.

        Args:
            features: dict with keys matching FEATURE_NAMES.
                      Missing features are auto-computed where possible.

        Returns:
            dict with score, rating, decision, and details.
        """
        # Auto-compute derived features if missing
        features = self._auto_compute_features(features)

        # Validate all features present
        missing = [f for f in FEATURE_NAMES if f not in features]
        if missing:
            raise ValueError(f"Missing features: {missing}")

        # Build feature vector in correct order
        X = np.array([[features[f] for f in FEATURE_NAMES]])

        # Scale
        if self.scaler is not None:
            X = self.scaler.transform(X)

        # Predict probability of being a good borrower
        prob = float(self.model.predict_proba(X)[0, 1])

        # Convert to credit score (300–850 range, like FICO)
        credit_score = int(300 + prob * 550)

        # Determine rating
        rating = self._get_rating(prob)

        # Decision
        decision = self._get_decision(prob, features)

        # Feature contribution (SHAP-like via gain importance)
        risk_factors = self._get_risk_factors(features, prob)

        return {
            "credit_score": credit_score,
            "probability_good": round(prob, 4),
            "rating": rating["label"],
            "rating_vi": rating["label_vi"],
            "rating_color": rating["color"],
            "decision": decision["action"],
            "decision_vi": decision["action_vi"],
            "max_recommended_amount": decision["max_amount"],
            "risk_factors": risk_factors,
            "details": {
                "input_features": {f: round(float(features[f]), 2) for f in FEATURE_NAMES},
                "model_version": self.metadata.get("metrics", {}).get("auc_roc", "N/A"),
            },
        }

    def _auto_compute_features(self, features: dict) -> dict:
        """Auto-compute derived features if not provided."""
        f = dict(features)

        # loan_to_income_ratio
        if "loan_to_income_ratio" not in f and "loan_amount" in f and "monthly_income" in f:
            annual_income = f["monthly_income"] * 12
            f["loan_to_income_ratio"] = f["loan_amount"] / max(annual_income, 1)

        # DTI (Debt-to-Income)
        if "DTI" not in f and all(k in f for k in ["monthly_spending", "loan_amount", "loan_term", "monthly_income"]):
            monthly_payment = f["loan_amount"] / max(f["loan_term"], 1)
            f["DTI"] = (f["monthly_spending"] + monthly_payment) / max(f["monthly_income"], 1)

        # Defaults for optional fields
        f.setdefault("previous_loans_count", 0)
        f.setdefault("late_payment_count", 0)
        f.setdefault("repayment_ratio", 1.0)
        f.setdefault("cashflow_stability", 0.5)
        f.setdefault("avg_account_balance", f.get("monthly_income", 0) * 2)

        return f

    def _get_rating(self, prob: float) -> dict:
        if prob >= SCORE_THRESHOLDS["excellent"]:
            return {"label": "Excellent", "label_vi": "Xuất sắc", "color": "#10B981"}
        elif prob >= SCORE_THRESHOLDS["good"]:
            return {"label": "Good", "label_vi": "Tốt", "color": "#3B82F6"}
        elif prob >= SCORE_THRESHOLDS["fair"]:
            return {"label": "Fair", "label_vi": "Trung bình", "color": "#F59E0B"}
        elif prob >= SCORE_THRESHOLDS["poor"]:
            return {"label": "Poor", "label_vi": "Yếu", "color": "#F97316"}
        else:
            return {"label": "Very Poor", "label_vi": "Rất yếu", "color": "#EF4444"}

    def _get_decision(self, prob: float, features: dict) -> dict:
        loan_amount = features.get("loan_amount", 0)
        monthly_income = features.get("monthly_income", 0)

        if prob >= SCORE_THRESHOLDS["excellent"]:
            return {
                "action": "APPROVE",
                "action_vi": "Chấp thuận",
                "max_amount": int(monthly_income * 36),
            }
        elif prob >= SCORE_THRESHOLDS["good"]:
            return {
                "action": "APPROVE",
                "action_vi": "Chấp thuận",
                "max_amount": int(monthly_income * 24),
            }
        elif prob >= SCORE_THRESHOLDS["fair"]:
            recommended = min(loan_amount, monthly_income * 12)
            return {
                "action": "REVIEW",
                "action_vi": "Cần xem xét thêm",
                "max_amount": int(recommended),
            }
        elif prob >= SCORE_THRESHOLDS["poor"]:
            return {
                "action": "REVIEW",
                "action_vi": "Rủi ro cao - cần xem xét kỹ",
                "max_amount": int(monthly_income * 6),
            }
        else:
            return {
                "action": "REJECT",
                "action_vi": "Từ chối",
                "max_amount": 0,
            }

    def _get_risk_factors(self, features: dict, prob: float) -> list:
        """Identify key risk/positive factors."""
        factors = []

        # DTI check
        dti = features.get("DTI", 0)
        if dti > 0.6:
            factors.append({
                "factor": "DTI",
                "impact": "negative",
                "message": f"Tỷ lệ nợ/thu nhập cao ({dti:.1%})",
                "message_en": f"High debt-to-income ratio ({dti:.1%})",
            })
        elif dti < 0.35:
            factors.append({
                "factor": "DTI",
                "impact": "positive",
                "message": f"Tỷ lệ nợ/thu nhập tốt ({dti:.1%})",
                "message_en": f"Good debt-to-income ratio ({dti:.1%})",
            })

        # Late payments
        late = features.get("late_payment_count", 0)
        if late > 3:
            factors.append({
                "factor": "late_payment_count",
                "impact": "negative",
                "message": f"Nhiều lần trả trễ ({int(late)} lần)",
                "message_en": f"Multiple late payments ({int(late)} times)",
            })
        elif late == 0:
            factors.append({
                "factor": "late_payment_count",
                "impact": "positive",
                "message": "Không có lịch sử trả trễ",
                "message_en": "No late payment history",
            })

        # Repayment ratio
        rr = features.get("repayment_ratio", 1)
        if rr < 0.7:
            factors.append({
                "factor": "repayment_ratio",
                "impact": "negative",
                "message": f"Tỷ lệ trả đúng hạn thấp ({rr:.1%})",
                "message_en": f"Low on-time repayment ratio ({rr:.1%})",
            })
        elif rr >= 0.95:
            factors.append({
                "factor": "repayment_ratio",
                "impact": "positive",
                "message": f"Tỷ lệ trả đúng hạn xuất sắc ({rr:.1%})",
                "message_en": f"Excellent on-time repayment ratio ({rr:.1%})",
            })

        # Loan to income ratio
        lti = features.get("loan_to_income_ratio", 0)
        if lti > 3:
            factors.append({
                "factor": "loan_to_income_ratio",
                "impact": "negative",
                "message": f"Khoản vay lớn so với thu nhập ({lti:.1f}x)",
                "message_en": f"Loan is large relative to income ({lti:.1f}x)",
            })

        # Cashflow stability
        cf = features.get("cashflow_stability", 0.5)
        if cf < 0.3:
            factors.append({
                "factor": "cashflow_stability",
                "impact": "negative",
                "message": f"Dòng tiền không ổn định ({cf:.1%})",
                "message_en": f"Unstable cashflow ({cf:.1%})",
            })
        elif cf >= 0.8:
            factors.append({
                "factor": "cashflow_stability",
                "impact": "positive",
                "message": f"Dòng tiền rất ổn định ({cf:.1%})",
                "message_en": f"Very stable cashflow ({cf:.1%})",
            })

        # Employment
        emp = features.get("employment_years", 0)
        if emp >= 5:
            factors.append({
                "factor": "employment_years",
                "impact": "positive",
                "message": f"Thâm niên làm việc tốt ({emp:.0f} năm)",
                "message_en": f"Good employment tenure ({emp:.0f} years)",
            })
        elif emp < 1:
            factors.append({
                "factor": "employment_years",
                "impact": "negative",
                "message": "Thâm niên làm việc ngắn",
                "message_en": "Short employment history",
            })

        return factors
