"""
AIScore Service — XGBoost + Random Forest Scorecard Scorer
===========================================================

Architecture:
  Stage 1: XGBoost → benchmark AUC + Feature Importance
  Stage 2: Random Forest → PD (14 features: 9 NUMERIC + 5 CATEGORICAL)
  Stage 3: PD → Scorecard formula → ai_risk_score (0-100)

14 Features (from Lending Club data):
  NUMERIC (9):  credit_score, loan_amnt, int_rate, annual_inc,
                dti, revol_util, open_acc, pub_rec, loan_to_income
  CATEGORY (5): term_enc, home_ownership_enc, verification_status_enc,
                purpose_enc, emp_length_enc

Input tu NestJS (VND context):
  {
    "credit_score": 650,
    "loan_amnt": 250000000,
    "int_rate": 12.5,
    "annual_inc": 300000000,
    "dti": 15.0,
    "revol_util": 40.0,
    "open_acc": 5,
    "pub_rec": 0,
    "term": 36,
    "home_ownership": "RENT",
    "verification_status": "Verified",
    "purpose": "debt_consolidation",
    "emp_length": "5 years"
  }
  (loan_to_income tu tinh tu loan_amnt / annual_inc)

Output:
  { "ai_risk_score": 21, "default_probability": 0.2098, "status": "success" }
"""

import os
import numpy as np
import xgboost as xgb
import joblib
import json
from typing import Optional

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

NUMERIC_FEATURES = [
    "credit_score", "loan_amnt", "int_rate", "annual_inc",
    "dti", "revol_util", "open_acc", "pub_rec", "loan_to_income",
]

CATEGORICAL_FEATURES = [
    "term_enc", "home_ownership_enc", "verification_status_enc",
    "purpose_enc", "emp_length_enc",
]

FEATURE_NAMES = NUMERIC_FEATURES + CATEGORICAL_FEATURES  # 14 total

HOME_OWNERSHIP_MAP = {"RENT": 0, "OWN": 1, "MORTGAGE": 2, "OTHER": 3, "NONE": 3, "ANY": 3}

VERIFICATION_MAP = {
    "Not Verified": 0, "Source Verified": 1, "Verified": 2,
    "not_verified": 0, "source_verified": 1, "verified": 2,
    "NONE": 0, "PENDING": 0, "VERIFIED": 2, "REJECTED": 0,
    "0": 0, "1": 1, "2": 2,
}

PURPOSE_MAP = {
    "debt_consolidation": 0, "credit_card": 1, "home_improvement": 2,
    "other": 3, "major_purchase": 4, "medical": 5, "small_business": 6,
    "car": 7, "vacation": 8, "moving": 9, "house": 10,
    "wedding": 11, "renewable_energy": 12, "educational": 13,
    # Vietnamese aliases
    "hop_nhat_no": 0, "the_tin_dung": 1, "sua_nha": 2, "khac": 3,
    "mua_sam_lon": 4, "y_te": 5, "kinh_doanh_nho": 6, "mua_xe": 7,
}

EMP_LENGTH_MAP = {
    "< 1 year": 0, "1 year": 1, "2 years": 2, "3 years": 3,
    "4 years": 4, "5 years": 5, "6 years": 6, "7 years": 7,
    "8 years": 8, "9 years": 9, "10+ years": 10,
}


class CreditScorer:
    """
    XGBoost (benchmark) + Random Forest Scorecard scorer.
    Load models from MODEL_DIR, predict PD + ai_risk_score from features.
    """

    def __init__(self, model_dir: str = MODEL_DIR):
        self.xgb_model: Optional[xgb.XGBClassifier] = None
        self.rf_model = None
        self.per_feature_scalers: Optional[dict] = None
        self.metadata: dict = {}
        self.model_dir = model_dir
        self._load_models()

    def _load_models(self):
        xgb_path = os.path.join(self.model_dir, "xgb_benchmark_model.json")
        rf_path = os.path.join(self.model_dir, "rf_scorecard_model.joblib")
        scalers_path = os.path.join(self.model_dir, "per_feature_scalers.joblib")
        metadata_path = os.path.join(self.model_dir, "metadata.json")

        if not os.path.exists(rf_path):
            raise FileNotFoundError(
                f"RF model not found at {rf_path}.\nRun train_model.py on Colab first."
            )

        # XGBoost (benchmark only)
        if os.path.exists(xgb_path):
            self.xgb_model = xgb.XGBClassifier()
            self.xgb_model.load_model(xgb_path)

        # Random Forest (main model)
        self.rf_model = joblib.load(rf_path)

        # Per-feature scalers
        if os.path.exists(scalers_path):
            self.per_feature_scalers = joblib.load(scalers_path)

        # Metadata
        if os.path.exists(metadata_path):
            with open(metadata_path, "r", encoding="utf-8") as f:
                self.metadata = json.load(f)

    def predict(self, features: dict) -> dict:
        """
        Predict PD using Random Forest (14 features: 9 NUM + 5 CAT).
        """
        processed = self._process_features(features)
        X_raw = np.array([[processed[f] for f in FEATURE_NAMES]], dtype=np.float64)

        # Per-feature scaling (numeric scaled, categorical passthrough)
        if self.per_feature_scalers is not None:
            X = np.zeros_like(X_raw, dtype=np.float64)
            for i, fname in enumerate(FEATURE_NAMES):
                if fname in self.per_feature_scalers:
                    strategy, scaler = self.per_feature_scalers[fname]
                    if strategy == "passthrough" or scaler is None:
                        X[0, i] = X_raw[0, i]
                    elif strategy in ("log_standard", "log_robust"):
                        val = np.log1p(max(X_raw[0, i], 0)).reshape(1, -1)
                        X[0, i] = scaler.transform(val).ravel()[0]
                    else:
                        X[0, i] = scaler.transform(X_raw[0, i].reshape(1, -1)).ravel()[0]
                else:
                    X[0, i] = X_raw[0, i]
        else:
            X = X_raw

        # Random Forest → PD
        pd_val = float(self.rf_model.predict_proba(X)[0, 1])
        ai_risk_score = int(round(min(max(pd_val, 0), 1) * 100))

        return {
            "ai_risk_score": ai_risk_score,
            "default_probability": round(pd_val, 4),
            "status": "success",
        }

    def _process_features(self, raw: dict) -> dict:
        """Map raw input dict → 14 feature dict.

        Accepts multiple aliases for backward compatibility:
          loan_amnt / capital
          annual_inc / annual_income / monthly_income (×12)
          term / term_months / periodMonth
        """
        f = {}

        # ── NUMERIC (9) ──
        f["credit_score"] = min(max(float(raw.get("credit_score", 600)), 300), 850)

        f["loan_amnt"] = max(float(raw.get("loan_amnt", raw.get("capital", 0))), 0)

        f["int_rate"] = min(max(float(raw.get("int_rate", 12)), 0), 40)

        f["annual_inc"] = max(float(raw.get("annual_inc", raw.get("annual_income", 0))), 0)
        if f["annual_inc"] == 0 and "monthly_income" in raw:
            f["annual_inc"] = float(raw["monthly_income"]) * 12

        f["dti"] = min(max(float(raw.get("dti", 0)), 0), 100)

        f["revol_util"] = min(max(float(raw.get("revol_util", raw.get("revolving_util_percent", 50))), 0), 150)

        f["open_acc"] = min(max(float(raw.get("open_acc", 5)), 0), 50)

        f["pub_rec"] = min(max(float(raw.get("pub_rec", 0)), 0), 20)

        # Engineered: loan_to_income
        annual_safe = max(f["annual_inc"], 1)
        f["loan_to_income"] = f["loan_amnt"] / annual_safe

        # ── CATEGORICAL (5) ──
        f["term_enc"] = float(raw.get("term", raw.get("term_months", raw.get("periodMonth", 36))))

        home = str(raw.get("home_ownership", "RENT")).upper()
        f["home_ownership_enc"] = HOME_OWNERSHIP_MAP.get(home, 3)

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
