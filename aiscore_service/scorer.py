"""
AIScore Service — XGBoost PD Scorer (VNĐ Context)
===================================================

Nhận input từ NestJS (đã ở VNĐ), build feature vector, predict PD.
Output: { ai_risk_score, default_probability, status }

Input mapping (NestJS → FastAPI):
  credit_score       → Điểm tín dụng NestJS (150-750)
  capital            → Số tiền vay (VNĐ)
  monthly_income     → Lương tháng (VNĐ)
  monthly_pay        → Trả góp/tháng (VNĐ)
  revolving_balance  → Dư nợ tín dụng (VNĐ)
  interest_rate      → Lãi suất (%)
  dti                → Nợ/Thu nhập (%)
  revolving_util_percent → % sử dụng hạn mức
  term_months        → Kỳ hạn vay (tháng)
  emp_length_years   → Số năm đi làm (0-10)
  active_bad_debts   → Nợ xấu đang active
  bankruptcies       → Số lần phá sản
  active_loans       → Số khoản vay đang mở
  total_loans_history → Tổng khoản vay từng có
  home_ownership     → RENT / OWN / MORTGAGE
  loan_purpose       → Mục đích vay (tên sản phẩm)
"""

import os
import numpy as np
import xgboost as xgb
import joblib
import json
from typing import Optional

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

# Features phải khớp thứ tự với train_model.py
FEATURE_NAMES = [
    "credit_score",
    "capital",
    "monthly_income",
    "monthly_pay",
    "revolving_balance",
    "interest_rate",
    "dti",
    "revolving_util_percent",
    "term_months",
    "emp_length_years",
    "active_bad_debts",
    "bankruptcies",
    "active_loans",
    "total_loans_history",
    "home_ownership_enc",
    "purpose_enc",
]

HOME_OWNERSHIP_MAP = {"RENT": 0, "OWN": 1, "MORTGAGE": 2, "OTHER": 3}

# Phải khớp với train_model.py
PURPOSE_MAP = {
    "debt_consolidation": 0, "credit_card": 1, "home_improvement": 2,
    "other": 3, "major_purchase": 4, "medical": 5, "small_business": 6,
    "car": 7, "vacation": 8, "moving": 9, "house": 10,
    "wedding": 11, "renewable_energy": 12, "educational": 13,
}


class CreditScorer:
    """
    XGBoost PD scorer — nhận VNĐ features từ NestJS, trả risk score.
    """

    def __init__(self, model_dir: str = MODEL_DIR):
        self.model: Optional[xgb.XGBClassifier] = None
        self.scaler = None
        self.metadata: dict = {}
        self.model_dir = model_dir
        self._load_model()

    def _load_model(self):
        model_path = os.path.join(self.model_dir, "xgb_pd_model.json")
        scaler_path = os.path.join(self.model_dir, "scaler.joblib")
        metadata_path = os.path.join(self.model_dir, "metadata.json")

        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Model not found at {model_path}.\nRun: python train_model.py"
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
        Predict PD từ VNĐ features.

        Args:
            features: dict từ NestJS (đã ở VNĐ)

        Returns:
            {
                "ai_risk_score": 0-100 (100 = nguy hiểm nhất),
                "default_probability": 0.0-1.0,
                "status": "success"
            }
        """
        processed = self._process_features(features)

        missing = [f for f in FEATURE_NAMES if f not in processed]
        if missing:
            raise ValueError(f"Missing features after processing: {missing}")

        X = np.array([[processed[f] for f in FEATURE_NAMES]])

        if self.scaler is not None:
            X = self.scaler.transform(X)

        pd_val = float(self.model.predict_proba(X)[0, 1])

        # ai_risk_score: 0-100, linear map từ PD. 100 = rủi ro cao nhất.
        ai_risk_score = int(round(min(max(pd_val, 0), 1) * 100))

        return {
            "ai_risk_score": ai_risk_score,
            "default_probability": round(pd_val, 4),
            "status": "success",
        }

    def _process_features(self, raw: dict) -> dict:
        """
        Nhận VNĐ features từ NestJS, build 16-feature vector.
        Tất cả các trường tiền tệ đã ở VNĐ rồi.
        """
        f = {}

        # ── Numeric features (VNĐ — đã scale sẵn bởi NestJS) ──
        f["credit_score"] = float(raw.get("credit_score", 450))
        f["capital"] = float(raw.get("capital", 0))
        f["monthly_income"] = float(raw.get("monthly_income", 0))
        f["monthly_pay"] = float(raw.get("monthly_pay", 0))
        f["revolving_balance"] = float(raw.get("revolving_balance", 0))
        f["interest_rate"] = float(raw.get("interest_rate", 12.0))
        f["dti"] = float(raw.get("dti", 0))
        f["revolving_util_percent"] = float(raw.get("revolving_util_percent", 50))
        f["term_months"] = float(raw.get("term_months", raw.get("periodMonth", 36)))
        f["emp_length_years"] = float(raw.get("emp_length_years", 5))
        f["active_bad_debts"] = float(raw.get("active_bad_debts", 0))
        f["bankruptcies"] = float(raw.get("bankruptcies", 0))
        f["active_loans"] = float(raw.get("active_loans", 0))
        f["total_loans_history"] = float(raw.get("total_loans_history", 0))

        # ── Categoricals ──
        home = str(raw.get("home_ownership", "RENT")).upper()
        f["home_ownership_enc"] = HOME_OWNERSHIP_MAP.get(home, 3)

        purpose = str(raw.get("loan_purpose", raw.get("purpose", "other"))).lower()
        f["purpose_enc"] = PURPOSE_MAP.get(purpose, PURPOSE_MAP["other"])

        # ── Clip outliers (tương tự train) ──
        f["credit_score"] = min(max(f["credit_score"], 150), 750)
        f["dti"] = min(max(f["dti"], 0), 100)
        f["active_loans"] = min(max(f["active_loans"], 0), 50)
        f["revolving_util_percent"] = min(max(f["revolving_util_percent"], 0), 150)

        return f
