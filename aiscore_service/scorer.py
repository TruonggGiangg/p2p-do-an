"""
CreditScorer — XGBoost + LR Scorecard Inference (v8.0)
========================================================

Pipeline:  25 features → Smart Scaling → XGBoost(leaf) → OHE → LR → PD

2 Stages:
  Stage 1: XGBoost → Leaf Indices → OneHotEncode (sparse)
  Stage 2: LR on [Leaf OHE + 25 Original Features] → PD (0.0-1.0)

25 Features (Lending Club → mapped to P2P system):
  NUMERIC (21): credit_score, capital, monthly_income, monthly_pay,
                revolving_balance, total_current_balance, dti,
                revolving_util_percent, emp_length_years, active_bad_debts,
                bankruptcies, active_loans, total_loans_history,
                credit_history_months, recent_inquiries, delinquencies_2yr,
                accounts_delinquent, severe_delinquencies_24m,
                pct_never_delinquent, collections_12m, loan_to_income
  CATEGORY (4): term_enc, home_ownership_enc, verification_status_enc,
                purpose_enc

Output:
  {
    "ai_risk_score": 21,
    "default_probability": 0.2098,
    "status": "success"
  }
"""

import os
import json
import numpy as np
import xgboost as xgb
import joblib
from scipy.sparse import hstack, csr_matrix


# ── Feature Lists ──

NUMERIC_FEATURES = [
    "credit_score", "capital", "monthly_income", "monthly_pay",
    "revolving_balance", "total_current_balance", "dti",
    "revolving_util_percent", "emp_length_years", "active_bad_debts",
    "bankruptcies", "active_loans", "total_loans_history",
    "credit_history_months", "recent_inquiries", "delinquencies_2yr",
    "accounts_delinquent", "severe_delinquencies_24m",
    "pct_never_delinquent", "collections_12m", "loan_to_income",
]

CATEGORICAL_FEATURES = [
    "term_enc", "home_ownership_enc", "verification_status_enc",
    "purpose_enc",
]

FEATURE_NAMES = NUMERIC_FEATURES + CATEGORICAL_FEATURES  # 25 total


# ── Encoding Maps ──

HOME_OWNERSHIP_MAP = {"RENT": 0, "OWN": 1, "MORTGAGE": 2, "OTHER": 3, "NONE": 3, "ANY": 3}

VERIFICATION_MAP = {"Not Verified": 0, "Source Verified": 1, "Verified": 2}

PURPOSE_MAP = {
    "debt_consolidation": 0, "credit_card": 1, "home_improvement": 2,
    "other": 3, "major_purchase": 4, "medical": 5, "small_business": 6,
    "car": 7, "vacation": 8, "moving": 9, "house": 10,
    "wedding": 11, "renewable_energy": 12, "educational": 13,
}

EMP_YEARS_MAP = {
    "< 1 year": 0.5, "1 year": 1.0, "2 years": 2.0, "3 years": 3.0,
    "4 years": 4.0, "5 years": 5.0, "6 years": 6.0, "7 years": 7.0,
    "8 years": 8.0, "9 years": 9.0, "10+ years": 10.0,
}


def _transform_one_feature(values_1d, strategy, scaler):
    """Transform 1 feature using its pre-fit scaler."""
    col = values_1d.reshape(-1, 1).astype(np.float64)
    if strategy in ("log_standard", "log_robust"):
        col_log = np.log1p(np.clip(col, 0, None))
        return scaler.transform(col_log).ravel()
    elif strategy in ("robust", "standard", "minmax"):
        return scaler.transform(col).ravel()
    elif strategy == "passthrough":
        return col.ravel()
    else:
        raise ValueError(f"Unknown strategy: {strategy}")


class CreditScorer:
    """XGBoost + LR Scorecard scorer (v8.0).

    Artifacts (from train_model.py):
      - xgb_pd_model.json          (XGBoost Stage 1 — leaf extractor)
      - lr_scorecard_model.joblib   (LR Stage 2 — PD predictor)
      - leaf_encoder.joblib         (OneHotEncoder for leaf indices)
      - per_feature_scalers.joblib  ({feature: (strategy, scaler)})
      - metadata.json               (metrics + config)
    """

    def __init__(self, model_dir="models"):
        self.model_dir = model_dir

        # Stage 1: XGBoost (leaf extractor)
        self.xgb_model = xgb.XGBClassifier()
        self.xgb_model.load_model(os.path.join(model_dir, "xgb_pd_model.json"))

        # Leaf OneHotEncoder
        self.leaf_encoder = joblib.load(os.path.join(model_dir, "leaf_encoder.joblib"))

        # Stage 2: Logistic Regression (scorecard)
        self.lr_model = joblib.load(os.path.join(model_dir, "lr_scorecard_model.joblib"))

        # Smart per-feature scalers
        self.scalers = joblib.load(os.path.join(model_dir, "per_feature_scalers.joblib"))

        # Metadata
        with open(os.path.join(model_dir, "metadata.json"), "r") as f:
            self.metadata = json.load(f)

        # Backward-compat alias (app.py checks scorer.rf_model)
        self.rf_model = self.lr_model

    def predict(self, features: dict) -> dict:
        """Predict PD using XGBoost + LR pipeline (25 features).

        Returns ai_risk_score (0-100) and default_probability (0.0-1.0).
        """
        f = self._process_features(features)
        X_raw = np.array([[f[n] for n in FEATURE_NAMES]])

        # Smart per-feature scaling
        X = np.zeros_like(X_raw, dtype=np.float64)
        for i, fname in enumerate(FEATURE_NAMES):
            strategy, sc = self.scalers[fname]
            X[:, i] = _transform_one_feature(X_raw[:, i], strategy, sc)

        # Stage 1: XGBoost → Leaf Indices → OHE (sparse)
        leaves = self.xgb_model.apply(X)
        L = self.leaf_encoder.transform(leaves)

        # Stage 2: [Leaf OHE + 25 Original] → LR → PD
        X_lr = hstack([L, csr_matrix(X)])
        pd_val = float(self.lr_model.predict_proba(X_lr)[0, 1])
        pd_val = min(max(pd_val, 1e-15), 1 - 1e-15)

        # ai_risk_score: 0 = safe, 100 = very risky
        ai_risk_score = int(round(min(max(pd_val, 0), 1) * 100))

        return {
            "ai_risk_score": ai_risk_score,
            "default_probability": round(pd_val, 4),
            "status": "success",
        }

    def _process_features(self, raw: dict) -> dict:
        """Map raw input dict → 25 feature dict.

        Accepts aliases for NestJS backward compatibility:
          capital / loan_amnt / loanAmount
          monthly_income / monthlyIncome / annual_inc ÷ 12
          monthly_pay / monthlyPay / monthlyPayment
          revolving_balance / revolvingBalance / totalOutstanding
          total_current_balance / totalOutstandingAll / tot_cur_bal
          accounts_delinquent / currentDelinquentAccounts / acc_now_delinq
          severe_delinquencies_24m / severeDelinquencies
          pct_never_delinquent / cleanLoanRatio / pct_tl_nvr_dlq
          collections_12m / collectionsLast12m
          emp_length_years / employmentYears / emp_length (string)
          term / term_months / periodMonth
          etc.
        """
        f = {}

        # ── NUMERIC (21) ──
        f["credit_score"] = min(max(float(raw.get("credit_score", 450)), 150), 750)

        f["capital"] = max(float(
            raw.get("capital", raw.get("loan_amnt", raw.get("loanAmount", 0)))
        ), 0)

        f["monthly_income"] = max(float(
            raw.get("monthly_income", raw.get("monthlyIncome", 0))
        ), 0)
        if f["monthly_income"] == 0:
            annual = float(raw.get("annual_inc", raw.get("annual_income",
                           raw.get("annualIncome", 0))))
            if annual > 0:
                f["monthly_income"] = annual / 12

        f["monthly_pay"] = max(float(
            raw.get("monthly_pay", raw.get("monthlyPay",
                     raw.get("monthlyPayment", 0)))
        ), 0)

        f["revolving_balance"] = max(float(
            raw.get("revolving_balance", raw.get("revolvingBalance",
                     raw.get("totalOutstanding", raw.get("revol_bal", 0))))
        ), 0)

        f["total_current_balance"] = max(float(
            raw.get("total_current_balance", raw.get("totalOutstandingAll",
                     raw.get("tot_cur_bal", 0)))
        ), 0)

        f["dti"] = min(max(float(
            raw.get("dti", raw.get("debtToIncome", 0))
        ), 0), 100)

        f["revolving_util_percent"] = min(max(float(
            raw.get("revolving_util_percent",
                     raw.get("revolvingUtilization", raw.get("revol_util", 50)))
        ), 0), 150)

        # emp_length_years: accept number or string like "5 years"
        emp = raw.get("emp_length_years",
                       raw.get("employmentYears", raw.get("emp_length", 3)))
        if isinstance(emp, (int, float)):
            f["emp_length_years"] = min(max(float(emp), 0.5), 10)
        else:
            f["emp_length_years"] = EMP_YEARS_MAP.get(str(emp), 3.0)

        f["active_bad_debts"] = min(max(float(
            raw.get("active_bad_debts",
                     raw.get("publicRecords", raw.get("pub_rec", 0)))
        ), 0), 20)

        f["bankruptcies"] = min(max(float(raw.get("bankruptcies", 0)), 0), 10)

        f["active_loans"] = min(max(float(
            raw.get("active_loans",
                     raw.get("openAccounts", raw.get("open_acc", 5)))
        ), 0), 50)

        f["total_loans_history"] = min(max(float(
            raw.get("total_loans_history",
                     raw.get("totalAccounts",
                              raw.get("total_acc", raw.get("totalLoans", 10))))
        ), 0), 100)

        f["credit_history_months"] = min(max(float(
            raw.get("credit_history_months", raw.get("creditAge", 120))
        ), 0), 600)

        f["recent_inquiries"] = min(max(float(
            raw.get("recent_inquiries", raw.get("inq_last_6mths", 0))
        ), 0), 20)

        f["delinquencies_2yr"] = min(max(float(
            raw.get("delinquencies_2yr",
                     raw.get("latePayments", raw.get("delinq_2yrs", 0)))
        ), 0), 20)

        # ── NEW: Delinquency & debt features (mapped to P2P system) ──

        f["accounts_delinquent"] = min(max(float(
            raw.get("accounts_delinquent",
                     raw.get("currentDelinquentAccounts",
                              raw.get("acc_now_delinq", 0)))
        ), 0), 10)

        f["severe_delinquencies_24m"] = min(max(float(
            raw.get("severe_delinquencies_24m",
                     raw.get("severeDelinquencies",
                              raw.get("num_tl_90g_dpd_24m", 0)))
        ), 0), 20)

        f["pct_never_delinquent"] = min(max(float(
            raw.get("pct_never_delinquent",
                     raw.get("cleanLoanRatio",
                              raw.get("pct_tl_nvr_dlq", 100)))
        ), 0), 100)

        f["collections_12m"] = min(max(float(
            raw.get("collections_12m",
                     raw.get("collectionsLast12m",
                              raw.get("collections_12_mths_ex_med", 0)))
        ), 0), 10)

        # Engineered: loan_to_income
        annual_safe = max(f["monthly_income"] * 12, 1)
        f["loan_to_income"] = f["capital"] / annual_safe

        # ── CATEGORICAL (4) ──
        f["term_enc"] = float(
            raw.get("term", raw.get("term_months", raw.get("periodMonth", 36)))
        )

        home = str(raw.get("home_ownership",
                            raw.get("homeOwnership", "RENT"))).upper()
        f["home_ownership_enc"] = HOME_OWNERSHIP_MAP.get(home, 3)

        vs = str(raw.get("verification_status",
                          raw.get("kycStatus", "Not Verified")))
        if vs in ("VERIFIED", "Verified", "verified"):
            f["verification_status_enc"] = 2
        elif vs in ("Source Verified", "PENDING", "pending"):
            f["verification_status_enc"] = 1
        else:
            f["verification_status_enc"] = 0

        purpose = str(raw.get("purpose",
                               raw.get("loanPurpose", "other"))).lower()
        f["purpose_enc"] = PURPOSE_MAP.get(purpose, 3)

        return f
