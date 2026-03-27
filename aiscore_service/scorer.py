"""
AIScore Service — Hybrid Stacking PD Scorer (VNĐ Context)
===========================================================

Hybrid Stacking 2 tầng (5 Base Learners):
  Level 1: XGBoost + LightGBM + CatBoost + ExtraTrees + GradientBoosting
  Level 2: Random Forest Meta-Learner
    Input = [PD_xgb, PD_lgbm, PD_cat, PD_et, PD_gb] + 15 original features
    Output = PD_final

Nhận input từ NestJS (đã ở VNĐ), build feature vector, predict PD.
Output: { ai_risk_score, default_probability, status }

Input mapping (NestJS → FastAPI):
  credit_score       → Điểm tín dụng NestJS (150-750)
  capital            → Số tiền vay (VNĐ)
  monthly_income     → Lương tháng (VNĐ)
  monthly_pay        → Trả góp/tháng (VNĐ)
  revolving_balance  → Dư nợ tín dụng (VNĐ)
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
import lightgbm as lgb
import joblib
import json
from typing import Optional

try:
    from catboost import CatBoostClassifier
except ImportError:
    CatBoostClassifier = None

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

# Features phải khớp thứ tự với train_model.py
# LƯU Ý: interest_rate bị loại — lãi suất là động (nhân viên duyệt / bên thứ 3)
FEATURE_NAMES = [
    "credit_score",
    "capital",
    "monthly_income",
    "monthly_pay",
    "revolving_balance",
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
    Hybrid Stacking PD scorer (5 Base Learners + RF Meta):
      Level 1: XGBoost + LightGBM + CatBoost + ExtraTrees + GradientBoosting
      Level 2: RF Meta-Learner(5 PDs + 15 features) → PD_final
    """

    def __init__(self, model_dir: str = MODEL_DIR):
        self.xgb_model: Optional[xgb.XGBClassifier] = None
        self.lgbm_model = None
        self.cat_model = None
        self.et_model = None
        self.gb_model = None
        self.rf_meta_model = None
        self.per_feature_scalers: Optional[dict] = None
        self.metadata: dict = {}
        self.model_dir = model_dir
        self._load_models()

    def _load_models(self):
        xgb_path = os.path.join(self.model_dir, "xgb_pd_model.json")
        lgbm_path = os.path.join(self.model_dir, "lgbm_pd_model.txt")
        cat_path = os.path.join(self.model_dir, "cat_pd_model.joblib")
        et_path = os.path.join(self.model_dir, "et_pd_model.joblib")
        gb_path = os.path.join(self.model_dir, "gb_pd_model.joblib")
        rf_meta_path = os.path.join(self.model_dir, "rf_meta_model.joblib")
        scalers_path = os.path.join(self.model_dir, "per_feature_scalers.joblib")
        metadata_path = os.path.join(self.model_dir, "metadata.json")

        if not os.path.exists(xgb_path):
            raise FileNotFoundError(
                f"XGBoost model not found at {xgb_path}.\nRun train_model.py on Colab first."
            )

        # Level 1: XGBoost
        self.xgb_model = xgb.XGBClassifier()
        self.xgb_model.load_model(xgb_path)

        # Level 1: LightGBM
        if os.path.exists(lgbm_path):
            self.lgbm_model = lgb.Booster(model_file=lgbm_path)

        # Level 1: CatBoost
        if os.path.exists(cat_path):
            self.cat_model = joblib.load(cat_path)

        # Level 1: ExtraTrees
        if os.path.exists(et_path):
            self.et_model = joblib.load(et_path)

        # Level 1: GradientBoosting
        if os.path.exists(gb_path):
            self.gb_model = joblib.load(gb_path)

        # Level 2: Random Forest Meta-Learner
        if os.path.exists(rf_meta_path):
            self.rf_meta_model = joblib.load(rf_meta_path)

        # Per-feature scalers
        if os.path.exists(scalers_path):
            self.per_feature_scalers = joblib.load(scalers_path)

        # Metadata
        if os.path.exists(metadata_path):
            with open(metadata_path, "r", encoding="utf-8") as f:
                self.metadata = json.load(f)

    def predict(self, features: dict) -> dict:
        """
        Predict PD bằng Hybrid Stacking (5 Base Learners):
          Level 1: XGBoost + LightGBM + CatBoost + ExtraTrees + GradBoost
          Level 2: RF Meta-Learner(5 PDs + 15 features) → PD_final
        """
        processed = self._process_features(features)

        missing = [f for f in FEATURE_NAMES if f not in processed]
        if missing:
            raise ValueError(f"Missing features after processing: {missing}")

        X_raw = np.array([[processed[f] for f in FEATURE_NAMES]])

        # Per-feature scaling
        if self.per_feature_scalers is not None:
            X = np.zeros_like(X_raw, dtype=np.float64)
            for i, fname in enumerate(FEATURE_NAMES):
                if fname in self.per_feature_scalers:
                    X[0, i] = self.per_feature_scalers[fname].transform(
                        X_raw[0, i].reshape(1, -1)
                    ).ravel()[0]
                else:
                    X[0, i] = X_raw[0, i]
        else:
            X = X_raw

        # ── Level 1: 5 Base Learners ──
        level1_pds = []

        # XGBoost
        xgb_pd = float(self.xgb_model.predict_proba(X)[0, 1]) if self.xgb_model else 0.0
        level1_pds.append(xgb_pd)

        # LightGBM
        lgbm_pd = float(self.lgbm_model.predict(X)[0]) if self.lgbm_model else 0.0
        level1_pds.append(lgbm_pd)

        # CatBoost
        cat_pd = float(self.cat_model.predict_proba(X)[0, 1]) if self.cat_model else 0.0
        level1_pds.append(cat_pd)

        # ExtraTrees
        et_pd = float(self.et_model.predict_proba(X)[0, 1]) if self.et_model else 0.0
        level1_pds.append(et_pd)

        # GradientBoosting
        gb_pd = float(self.gb_model.predict_proba(X)[0, 1]) if self.gb_model else 0.0
        level1_pds.append(gb_pd)

        # ── Level 2: RF Meta-Learner ──
        if self.rf_meta_model is not None:
            X_meta = np.column_stack([level1_pds, X])
            pd_val = float(self.rf_meta_model.predict_proba(X_meta)[0, 1])
        else:
            # Fallback: average of all Level 1
            pd_val = sum(level1_pds) / max(len(level1_pds), 1)

        ai_risk_score = int(round(min(max(pd_val, 0), 1) * 100))

        return {
            "ai_risk_score": ai_risk_score,
            "default_probability": round(pd_val, 4),
            "status": "success",
        }

    def _process_features(self, raw: dict) -> dict:
        """
        Nhận VNĐ features từ NestJS, build 15-feature vector.
        Tất cả các trường tiền tệ đã ở VNĐ rồi.
        """
        f = {}

        # ── Numeric features (VNĐ — đã scale sẵn bởi NestJS) ──
        f["credit_score"] = float(raw.get("credit_score", 450))
        f["capital"] = float(raw.get("capital", 0))
        f["monthly_income"] = float(raw.get("monthly_income", 0))
        f["monthly_pay"] = float(raw.get("monthly_pay", 0))
        f["revolving_balance"] = float(raw.get("revolving_balance", 0))
        # interest_rate loại bỏ — lãi suất là động
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
