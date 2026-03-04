"""
AIScore Service - PD (Probability of Default) Scorer
=====================================================

Luồng chuẩn fintech:
  XGBoost → PD → Credit Score → Grade/SubGrade → Tier → Decision

Output format cho mỗi prediction:
  {
    "pd": 0.1234,           // Probability of Default (0.0 - 1.0)
    "credit_score": 782,    // 300 + (1 - PD) × 550
    "grade": "B",           // A-G dựa trên PD
    "sub_grade": "B2",      // A1-G5
    "tier": "Gold",         // Platinum/Gold/Silver/Basic
    "decision": "APPROVE",  // APPROVE / REVIEW / REJECT
    "risk_factors": [...]   // yếu tố rủi ro
  }
"""

import os
import numpy as np
import xgboost as xgb
import joblib
import json
from typing import Optional

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

# Cùng danh sách features với train_model.py
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

# PD → Grade thresholds (cùng với train_model.py)
GRADE_THRESHOLDS = [
    ("A", 0.00, 0.10),
    ("B", 0.10, 0.20),
    ("C", 0.20, 0.30),
    ("D", 0.30, 0.40),
    ("E", 0.40, 0.55),
    ("F", 0.55, 0.70),
    ("G", 0.70, 1.01),
]

# Decision thresholds dựa trên PD
PD_THRESHOLDS = {
    "approve": 0.20,   # PD < 20% → auto approve
    "review": 0.40,    # PD 20-40% → manual review
    # PD >= 40% → reject
}

# Encoding maps (phải khớp với train_model.py)
HOME_OWNERSHIP_MAP = {"RENT": 0, "OWN": 1, "MORTGAGE": 2, "OTHER": 3, "NONE": 3, "ANY": 3}
VERIFICATION_STATUS_MAP = {"Not Verified": 0, "Source Verified": 1, "Verified": 2}
APPLICATION_TYPE_MAP = {"INDIVIDUAL": 0, "JOINT": 1, "Joint App": 1}
INITIAL_LIST_STATUS_MAP = {"w": 0, "f": 1}

# Purpose encoding - cần match với LabelEncoder fitted order
# Will be loaded from metadata if available
PURPOSE_CATEGORIES = [
    "car", "credit_card", "debt_consolidation", "educational",
    "home_improvement", "house", "major_purchase", "medical",
    "moving", "other", "renewable_energy", "small_business",
    "vacation", "wedding",
]


def pd_to_grade(pd_val: float) -> str:
    """Convert PD → Grade + Sub-Grade (A1 .. G5)."""
    for grade_letter, lo, hi in GRADE_THRESHOLDS:
        if lo <= pd_val < hi:
            span = hi - lo
            offset = pd_val - lo
            sub = min(int(offset / (span / 5)) + 1, 5)
            return f"{grade_letter}{sub}"
    return "G5"


def pd_to_credit_score(pd_val: float) -> int:
    """Convert PD → Credit Score (300 - 850)."""
    return int(300 + (1.0 - min(max(pd_val, 0), 1)) * 550)


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


def tier_color(tier: str) -> str:
    """Color cho UI hiển thị tier."""
    return {
        "Platinum": "#A78BFA",
        "Gold": "#F59E0B",
        "Silver": "#9CA3AF",
        "Basic": "#78716C",
    }.get(tier, "#78716C")


class CreditScorer:
    """
    XGBoost PD-based credit scoring engine.

    Flow: raw features → encode/engineer → scale → XGBoost → PD
          → Credit Score → Grade/SubGrade → Tier → Decision
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
                f"Model not found at {model_path}.\n"
                "Run: python train_model.py"
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
        Predict PD và derive tất cả metrics cho một borrower.

        Args:
            features: dict raw features từ API request.
                Bắt buộc: loan_amnt, int_rate, installment, annual_inc, dti,
                           open_acc, revol_bal, revol_util, total_acc
                Tùy chọn: term (str hoặc int), emp_length (str hoặc int),
                           home_ownership, verification_status, purpose,
                           application_type, initial_list_status, ...

        Returns:
            dict: {pd, credit_score, grade, sub_grade, tier, decision, ...}
        """
        # 1. Encode & engineer features
        processed = self._process_features(features)

        # 2. Validate
        missing = [f for f in FEATURE_NAMES if f not in processed]
        if missing:
            raise ValueError(f"Missing features after processing: {missing}")

        # 3. Build feature vector
        X = np.array([[processed[f] for f in FEATURE_NAMES]])

        # 4. Scale
        if self.scaler is not None:
            X = self.scaler.transform(X)

        # 5. Predict PD (probability of class 1 = default)
        pd_val = float(self.model.predict_proba(X)[0, 1])

        # 6. Derive metrics from PD
        credit_score = pd_to_credit_score(pd_val)
        full_grade = pd_to_grade(pd_val)
        grade = full_grade[0]
        sub_grade = full_grade
        tier = score_to_tier(credit_score)
        decision = self._get_decision(pd_val, features)
        risk_factors = self._get_risk_factors(features, pd_val)

        return {
            # Core PD output
            "pd": round(pd_val, 6),
            "credit_score": credit_score,
            "grade": grade,
            "sub_grade": sub_grade,

            # Membership tier
            "tier": tier,
            "tier_color": tier_color(tier),

            # Decision engine
            "decision": decision["action"],
            "decision_vi": decision["action_vi"],
            "max_loan_grade_limit": decision["max_loan_limit"],

            # Risk analysis
            "risk_factors": risk_factors,
            "risk_level": self._risk_level(pd_val),

            # Details
            "details": {
                "pd_percent": f"{pd_val * 100:.2f}%",
                "score_formula": f"300 + (1 - {pd_val:.4f}) × 550 = {credit_score}",
                "input_features": {
                    f: round(float(processed[f]), 4) for f in FEATURE_NAMES
                },
                "model_auc": self.metadata.get("metrics", {}).get("auc_roc", "N/A"),
                "data_source": self.metadata.get("data_source", "Lending Club"),
            },
        }

    def _process_features(self, raw: dict) -> dict:
        """
        Nhận raw features từ API, encode + engineer thành 24 features cho model.
        """
        f = {}

        # ── Direct numeric features ──
        f["loan_amnt"] = float(raw.get("loan_amnt", raw.get("loan_amount", 0)))
        f["int_rate"] = float(raw.get("int_rate", raw.get("interest_rate", 12.0)))
        f["installment"] = float(raw.get("installment", 0))
        f["annual_inc"] = float(raw.get("annual_inc", raw.get("annual_income", 0)))
        f["dti"] = float(raw.get("dti", 0))
        f["open_acc"] = float(raw.get("open_acc", raw.get("open_accounts", 5)))
        f["pub_rec"] = float(raw.get("pub_rec", raw.get("public_records", 0)))
        f["revol_bal"] = float(raw.get("revol_bal", raw.get("revolving_balance", 0)))
        f["revol_util"] = float(raw.get("revol_util", raw.get("revolving_utilization", 50)))
        f["total_acc"] = float(raw.get("total_acc", raw.get("total_accounts", 10)))
        f["mort_acc"] = float(raw.get("mort_acc", raw.get("mortgage_accounts", 0)))
        f["pub_rec_bankruptcies"] = float(raw.get("pub_rec_bankruptcies", 0))

        # ── term: "36 months" → 36 hoặc int → float ──
        term = raw.get("term", raw.get("term_months", 36))
        if isinstance(term, str):
            import re
            m = re.search(r"(\d+)", term)
            f["term_months"] = float(m.group(1)) if m else 36.0
        else:
            f["term_months"] = float(term)

        # ── emp_length: "10+ years" / "< 1 year" / int ──
        emp = raw.get("emp_length", raw.get("emp_length_years", raw.get("employment_years", 5)))
        if isinstance(emp, str):
            emp_str = emp.strip()
            if "10+" in emp_str:
                f["emp_length_years"] = 10.0
            elif "< 1" in emp_str:
                f["emp_length_years"] = 0.5
            else:
                import re
                m = re.search(r"(\d+)", emp_str)
                f["emp_length_years"] = float(m.group(1)) if m else 5.0
        else:
            f["emp_length_years"] = float(emp)

        # ── credit_history_years (default nếu không có) ──
        f["credit_history_years"] = float(
            raw.get("credit_history_years", raw.get("credit_history", 10))
        )

        # ── Categorical encoding ──
        home = raw.get("home_ownership", "RENT")
        f["home_ownership_enc"] = HOME_OWNERSHIP_MAP.get(str(home).upper(), 3)

        verif = raw.get("verification_status", "Not Verified")
        f["verification_status_enc"] = VERIFICATION_STATUS_MAP.get(verif, 0)

        purpose = raw.get("purpose", "other")
        if purpose in PURPOSE_CATEGORIES:
            f["purpose_enc"] = PURPOSE_CATEGORIES.index(purpose)
        else:
            f["purpose_enc"] = PURPOSE_CATEGORIES.index("other")

        app_type = raw.get("application_type", "INDIVIDUAL")
        f["application_type_enc"] = APPLICATION_TYPE_MAP.get(app_type, 0)

        list_status = raw.get("initial_list_status", "w")
        f["initial_list_status_enc"] = INITIAL_LIST_STATUS_MAP.get(list_status, 0)

        # ── Engineered features ──
        f["log_annual_inc"] = float(np.log1p(max(f["annual_inc"], 0)))
        f["log_revol_bal"] = float(np.log1p(max(f["revol_bal"], 0)))

        monthly_inc = f["annual_inc"] / 12.0 + 1.0
        f["installment_to_income"] = f["installment"] / monthly_inc

        f["revol_util_x_bal"] = f["revol_util"] * f["revol_bal"] / 1e6

        # ── Clip outliers (tương tự train) ──
        f["annual_inc"] = min(max(f["annual_inc"], 0), 1_000_000)
        f["dti"] = min(max(f["dti"], 0), 100)
        f["open_acc"] = min(max(f["open_acc"], 0), 50)
        f["revol_util"] = min(max(f["revol_util"], 0), 150)

        return f

    def _risk_level(self, pd_val: float) -> str:
        """Human-readable risk level từ PD."""
        if pd_val < 0.10:
            return "LOW"
        elif pd_val < 0.25:
            return "MEDIUM"
        elif pd_val < 0.40:
            return "HIGH"
        else:
            return "VERY_HIGH"

    def _get_decision(self, pd_val: float, raw_features: dict) -> dict:
        """
        Decision Engine dựa trên PD.
        PD < 20% → APPROVE
        PD 20-40% → REVIEW
        PD >= 40% → REJECT
        """
        if pd_val < PD_THRESHOLDS["approve"]:
            grade_letter = pd_to_grade(pd_val)[0]
            # Max loan limit by grade
            limits = {"A": 35000, "B": 25000, "C": 15000}
            max_limit = limits.get(grade_letter, 10000)
            return {
                "action": "APPROVE",
                "action_vi": "Chấp thuận",
                "max_loan_limit": max_limit,
            }
        elif pd_val < PD_THRESHOLDS["review"]:
            return {
                "action": "REVIEW",
                "action_vi": "Cần xem xét thêm",
                "max_loan_limit": 10000,
            }
        else:
            return {
                "action": "REJECT",
                "action_vi": "Từ chối - rủi ro quá cao",
                "max_loan_limit": 0,
            }

    def _get_risk_factors(self, raw_features: dict, pd_val: float) -> list:
        """Phân tích các yếu tố rủi ro chính."""
        factors = []

        # DTI
        dti = float(raw_features.get("dti", 0))
        if dti > 30:
            factors.append({
                "factor": "dti",
                "impact": "negative",
                "value": dti,
                "message": f"Tỷ lệ nợ/thu nhập cao ({dti:.1f}%)",
                "message_en": f"High debt-to-income ratio ({dti:.1f}%)",
            })
        elif dti < 15:
            factors.append({
                "factor": "dti",
                "impact": "positive",
                "value": dti,
                "message": f"Tỷ lệ nợ/thu nhập tốt ({dti:.1f}%)",
                "message_en": f"Good debt-to-income ratio ({dti:.1f}%)",
            })

        # Interest rate
        int_rate = float(raw_features.get("int_rate", raw_features.get("interest_rate", 0)))
        if int_rate > 18:
            factors.append({
                "factor": "int_rate",
                "impact": "negative",
                "value": int_rate,
                "message": f"Lãi suất cao ({int_rate:.2f}%)",
                "message_en": f"High interest rate ({int_rate:.2f}%)",
            })

        # Public records
        pub_rec = float(raw_features.get("pub_rec", 0))
        if pub_rec > 0:
            factors.append({
                "factor": "pub_rec",
                "impact": "negative",
                "value": pub_rec,
                "message": f"Có {int(pub_rec)} hồ sơ công vi phạm",
                "message_en": f"{int(pub_rec)} public derogatory record(s)",
            })

        # Bankruptcies
        bankrupt = float(raw_features.get("pub_rec_bankruptcies", 0))
        if bankrupt > 0:
            factors.append({
                "factor": "pub_rec_bankruptcies",
                "impact": "negative",
                "value": bankrupt,
                "message": f"Có {int(bankrupt)} lần phá sản",
                "message_en": f"{int(bankrupt)} bankruptcy record(s)",
            })

        # Revolving utilization
        revol_util = float(raw_features.get("revol_util", raw_features.get("revolving_utilization", 0)))
        if revol_util > 80:
            factors.append({
                "factor": "revol_util",
                "impact": "negative",
                "value": revol_util,
                "message": f"Tỷ lệ sử dụng tín dụng quay vòng cao ({revol_util:.1f}%)",
                "message_en": f"High revolving utilization ({revol_util:.1f}%)",
            })
        elif revol_util < 30:
            factors.append({
                "factor": "revol_util",
                "impact": "positive",
                "value": revol_util,
                "message": f"Tỷ lệ sử dụng tín dụng quay vòng tốt ({revol_util:.1f}%)",
                "message_en": f"Good revolving utilization ({revol_util:.1f}%)",
            })

        # Annual income
        annual_inc = float(raw_features.get("annual_inc", raw_features.get("annual_income", 0)))
        if annual_inc >= 80000:
            factors.append({
                "factor": "annual_inc",
                "impact": "positive",
                "value": annual_inc,
                "message": f"Thu nhập năm tốt (${annual_inc:,.0f})",
                "message_en": f"Good annual income (${annual_inc:,.0f})",
            })
        elif annual_inc < 30000:
            factors.append({
                "factor": "annual_inc",
                "impact": "negative",
                "value": annual_inc,
                "message": f"Thu nhập năm thấp (${annual_inc:,.0f})",
                "message_en": f"Low annual income (${annual_inc:,.0f})",
            })

        # Employment length
        emp = raw_features.get("emp_length", raw_features.get("emp_length_years", 5))
        emp_val = emp
        if isinstance(emp, str):
            if "10+" in emp:
                emp_val = 10
            else:
                import re
                m = re.search(r"(\d+)", emp)
                emp_val = int(m.group(1)) if m else 5
        emp_val = float(emp_val)
        if emp_val >= 5:
            factors.append({
                "factor": "emp_length",
                "impact": "positive",
                "value": emp_val,
                "message": f"Thâm niên làm việc tốt ({emp_val:.0f} năm)",
                "message_en": f"Good employment tenure ({emp_val:.0f} years)",
            })
        elif emp_val < 1:
            factors.append({
                "factor": "emp_length",
                "impact": "negative",
                "value": emp_val,
                "message": "Thâm niên làm việc ngắn",
                "message_en": "Short employment history",
            })

        # Home ownership
        home = raw_features.get("home_ownership", "RENT")
        if home == "OWN":
            factors.append({
                "factor": "home_ownership",
                "impact": "positive",
                "value": home,
                "message": "Sở hữu nhà riêng",
                "message_en": "Homeowner",
            })

        return factors
