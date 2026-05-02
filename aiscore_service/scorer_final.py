"""
CreditScorerFinal — Inference cho mô hình mới trong models_final/

Pipeline:
    raw input dict
        → build feature frame (13 raw cols + previous_default_bin)
        → preprocessor.transform (ColumnTransformer: scale + one-hot)
        → xgb_model.predict_proba[:, 1]
        → isotonic_calibrator.transform → PD
        → score 150-750 + decision band

Required raw fields (matched với metadata.json của models_final):
    person_age, person_gender, person_education,
    person_income, person_emp_exp, person_home_ownership,
    loan_amnt, loan_intent, loan_int_rate, loan_percent_income,
    cb_person_cred_hist_length, credit_score, previous_loan_defaults_on_file
"""

import os
import sys
import json
from typing import Any, Dict, Optional, Tuple, List

import numpy as np
import pandas as pd
import joblib

# Compat shim cho numpy 2.x artifacts trên numpy 1.x
if not hasattr(np, '_core'):
    import numpy.core as _npc
    sys.modules['numpy._core'] = _npc

import xgboost as xgb


# ── Constants ──

RAW_NUMERIC_INPUT_COLUMNS = [
    "person_age",
    "person_income",
    "person_emp_exp",
    "loan_amnt",
    "loan_int_rate",
    "loan_percent_income",
    "cb_person_cred_hist_length",
    "credit_score",
]

DERIVED_MODEL_FEATURES = ["previous_default_bin"]
NUMERIC_FEATURES = RAW_NUMERIC_INPUT_COLUMNS + DERIVED_MODEL_FEATURES
CATEGORICAL_FEATURES = [
    "person_gender",
    "person_education",
    "person_home_ownership",
    "loan_intent",
]
MODEL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

# Allowed values per category (anything else → mapped to fallback)
ALLOWED_CATEGORIES = {
    "person_gender": {"male", "female"},
    "person_education": {"High School", "Associate", "Bachelor", "Master", "Doctorate"},
    "person_home_ownership": {"RENT", "OWN", "MORTGAGE", "OTHER"},
    "loan_intent": {
        "PERSONAL", "EDUCATION", "MEDICAL", "VENTURE",
        "HOMEIMPROVEMENT", "DEBTCONSOLIDATION",
    },
}
CATEGORICAL_FALLBACK = {
    "person_gender": "male",
    "person_education": "High School",
    "person_home_ownership": "OTHER",
    "loan_intent": "PERSONAL",  # OTHER không nằm trong huấn luyện → PERSONAL gần neutral nhất
}

CREDIT_SCORE_TARGET_MIN = 150
CREDIT_SCORE_TARGET_MAX = 750

RISK_BANDS = [
    (700, 750, "Very low risk", "approve"),
    (650, 699, "Low risk", "approve"),
    (550, 649, "Medium risk", "manual_review"),
    (450, 549, "High risk", "manual_review"),
    (150, 449, "Very high risk", "reject_or_strict_review"),
]


def _yes_no_to_binary(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, (int, float, bool)):
        return float(bool(v))
    s = str(v).strip().lower()
    return 1.0 if s in {"yes", "y", "true", "1"} else 0.0


def _normalize_credit_score(
    raw: float,
    source_min: float,
    source_max: float,
    target_min: float = CREDIT_SCORE_TARGET_MIN,
    target_max: float = CREDIT_SCORE_TARGET_MAX,
) -> float:
    """Normalize raw credit_score (vd 390-850) sang dải target (150-750).

    Nếu raw đã nằm trong dải target thì trả về nguyên (đã chuẩn hoá sẵn).
    """
    if raw is None or (isinstance(raw, float) and np.isnan(raw)):
        return target_min
    raw_f = float(raw)
    # CIC system của BE đang xài 150-750 sẵn → giữ nguyên
    if target_min <= raw_f <= target_max:
        return float(np.clip(raw_f, target_min, target_max))
    if source_max == source_min:
        return target_min
    scaled = target_min + (raw_f - source_min) * (target_max - target_min) / (source_max - source_min)
    return float(np.clip(scaled, target_min, target_max))


def _probability_to_score(default_pd: float) -> int:
    pd_v = float(np.clip(default_pd, 0.0, 1.0))
    score = CREDIT_SCORE_TARGET_MAX - (CREDIT_SCORE_TARGET_MAX - CREDIT_SCORE_TARGET_MIN) * pd_v
    return int(round(float(np.clip(score, CREDIT_SCORE_TARGET_MIN, CREDIT_SCORE_TARGET_MAX))))


def _score_to_risk_band(score: int) -> Tuple[str, str]:
    for lo, hi, label, decision in RISK_BANDS:
        if lo <= score <= hi:
            return label, decision
    return ("Very high risk", "reject_or_strict_review") if score < 150 else ("Very low risk", "approve")


def _policy_pd_floor(row: Dict[str, Any]) -> Tuple[float, List[str]]:
    floors: List[Tuple[float, str]] = []

    income = float(row.get("person_income", 0) or 0)
    loan_percent_income = float(row.get("loan_percent_income", 0) or 0)
    credit_score = float(row.get("credit_score", 0) or 0)
    previous_default = float(row.get("previous_default_bin", 0) or 0)
    emp_exp = float(row.get("person_emp_exp", 0) or 0)
    loan_int_rate = float(row.get("loan_int_rate", 0) or 0)

    # Ngưỡng đã tune cho ngữ cảnh VN (BE truyền VND/scale_calib với scale=1000 — con số
    # trông như USD nhưng sức mua khác). Override bằng env nếu cần.
    #   person_income calibrated:
    #     - 24000  ~ 24M VND/năm  (2M/tháng) — thu nhập yếu
    #     - 60000  ~ 60M VND/năm  (5M/tháng) — trung bình
    #     - 120000 ~ 120M VND/năm (10M/tháng) — khá
    income_zero_threshold = float(os.environ.get("POLICY_INCOME_ZERO_USD", "1") or 1)
    income_low_threshold = float(os.environ.get("POLICY_INCOME_LOW_USD", "36000") or 36000)
    income_weak_threshold = float(os.environ.get("POLICY_INCOME_WEAK_USD", "60000") or 60000)
    credit_floor_low = float(os.environ.get("POLICY_CREDIT_LOW", "300") or 300)
    credit_floor_mid = float(os.environ.get("POLICY_CREDIT_MID", "500") or 500)
    credit_floor_ok = float(os.environ.get("POLICY_CREDIT_OK", "600") or 600)

    if income <= income_zero_threshold:
        floors.append((0.85, "thu nhập trống hoặc bằng 0"))
    elif income < income_low_threshold:
        floors.append((0.55, f"thu nhập năm dưới {int(income_low_threshold):,} (calibrated VND)"))
    elif income < income_weak_threshold:
        floors.append((0.30, f"thu nhập năm dưới {int(income_weak_threshold):,} (calibrated VND)"))

    if loan_percent_income >= 1.0:
        floors.append((0.85, "khoản vay >= 100% thu nhập năm"))
    elif loan_percent_income >= 0.5:
        floors.append((0.55, "khoản vay >= 50% thu nhập năm"))
    elif loan_percent_income >= 0.35:
        floors.append((0.40, "khoản vay >= 35% thu nhập năm"))
    elif loan_percent_income >= 0.25 and credit_score < credit_floor_ok:
        floors.append((0.30, f"khoản vay >= 25% thu nhập + credit score dưới {int(credit_floor_ok)}"))

    if credit_score <= credit_floor_low:
        floors.append((0.70, f"credit score <= {int(credit_floor_low)} (thang 150-750)"))
    elif credit_score < credit_floor_mid:
        floors.append((0.45, f"credit score dưới {int(credit_floor_mid)} (thang 150-750)"))
    elif credit_score < credit_floor_ok:
        floors.append((0.25, f"credit score dưới {int(credit_floor_ok)} (thang 150-750)"))

    if previous_default >= 1:
        floors.append((0.75, "previous default exists on file"))

    if emp_exp < 1 and credit_score < 450:
        floors.append((0.40, "employment experience is below 1 year with weak credit score"))

    if loan_int_rate >= 30 and credit_score < 550:
        floors.append((0.35, "interest rate is high while credit score is below 550"))

    if not floors:
        return 0.0, []

    return max(floor for floor, _ in floors), [reason for _, reason in floors]


class CreditScorerFinal:
    """Wrapper inference cho models_final/."""

    def __init__(self, model_dir: Optional[str] = None) -> None:
        # Cho phép env override để dễ test/deploy
        self.model_dir = model_dir or os.environ.get("MODEL_DIR_FINAL") or os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "models_final"
        )

        # Load metadata
        meta_path = os.path.join(self.model_dir, "metadata.json")
        if not os.path.exists(meta_path):
            raise FileNotFoundError(f"metadata.json not found in {self.model_dir}")
        with open(meta_path, "r", encoding="utf-8") as fh:
            self.metadata = json.load(fh)

        # Load preprocessor
        self.preprocessor = joblib.load(os.path.join(self.model_dir, "preprocessor.joblib"))

        # Load XGB model — ưu tiên joblib, fallback json
        xgb_joblib = os.path.join(self.model_dir, "xgb_pd_model.joblib")
        xgb_json = os.path.join(self.model_dir, "xgb_pd_model.json")
        if os.path.exists(xgb_joblib):
            self.xgb_model = joblib.load(xgb_joblib)
        elif os.path.exists(xgb_json):
            self.xgb_model = xgb.XGBClassifier()
            self.xgb_model.load_model(xgb_json)
        else:
            raise FileNotFoundError("Cannot locate xgb_pd_model.{joblib,json}")

        # Load calibrator
        self.calibrator = joblib.load(os.path.join(self.model_dir, "isotonic_calibrator.joblib"))

        # Cache useful metadata
        cs_norm = self.metadata.get("credit_score_normalization", {})
        self.cs_source_min = float(cs_norm.get("source_min", 390.0))
        self.cs_source_max = float(cs_norm.get("source_max", 850.0))
        self.threshold = float(self.metadata.get("threshold", {}).get("value", 0.5))

    # ── Feature mapping ──

    def _map_categorical(self, feature: str, raw_value: Any) -> str:
        allowed = ALLOWED_CATEGORIES[feature]
        fallback = CATEGORICAL_FALLBACK[feature]
        if raw_value is None:
            return fallback
        s = str(raw_value).strip()
        # case-insensitive match cho các giá trị có spelling khác
        for cand in allowed:
            if s.lower() == cand.lower():
                return cand
        return fallback

    def _build_row(self, raw: Dict[str, Any]) -> pd.DataFrame:
        # Đọc input và áp default an toàn
        def num(key: str, default: float, lo: float = -np.inf, hi: float = np.inf) -> float:
            v = raw.get(key)
            if v is None or v == "":
                return float(default)
            try:
                return float(np.clip(float(v), lo, hi))
            except (TypeError, ValueError):
                return float(default)

        # Numeric raw (BE sẽ truyền các trường này)
        person_age = num("person_age", 25, 18, 100)
        person_income = num("person_income", 0, 0)
        person_emp_exp = num("person_emp_exp", 0, 0, 60)
        loan_amnt = num("loan_amnt", num("loanAmount", num("capital", 0), 0), 0)
        loan_int_rate = num("loan_int_rate", num("interestRate", 12.0, 0, 100), 0, 100)
        # loan_percent_income = loan_amnt / annual_income
        # QUAN TRỌNG: person_income từ BE đã là ANNUAL USD (đã scale VND→USD).
        annual_income = max(person_income, 1.0) if person_income else 1.0
        loan_percent_income_default = float(np.clip(loan_amnt / annual_income, 0.0, 5.0)) if person_income else 0.0
        loan_percent_income = num("loan_percent_income", loan_percent_income_default, 0, 5)
        cb_hist = num("cb_person_cred_hist_length", 3, 0, 30)

        # credit_score: BE truyền theo dải 150-750 (CIC); model hỗ trợ cả 2 dải
        credit_score_raw = raw.get("credit_score", raw.get("creditScore", 600))
        credit_score = _normalize_credit_score(
            credit_score_raw,
            source_min=self.cs_source_min,
            source_max=self.cs_source_max,
        )

        # previous_loan_defaults_on_file → previous_default_bin
        prev_default = _yes_no_to_binary(raw.get("previous_loan_defaults_on_file", raw.get("previousDefaults", 0)))

        # Categorical
        gender = self._map_categorical("person_gender", raw.get("person_gender", raw.get("gender")))
        education = self._map_categorical("person_education", raw.get("person_education", raw.get("education")))
        home_ownership = self._map_categorical(
            "person_home_ownership",
            raw.get("person_home_ownership", raw.get("home_ownership", raw.get("homeOwnership"))),
        )
        # loan_intent: BE thường đẩy upper-case; nếu không match thì rơi về fallback
        intent = self._map_categorical("loan_intent", raw.get("loan_intent", raw.get("loanIntent")))

        row = {
            "person_age": person_age,
            "person_income": person_income,
            "person_emp_exp": person_emp_exp,
            "loan_amnt": loan_amnt,
            "loan_int_rate": loan_int_rate,
            "loan_percent_income": loan_percent_income,
            "cb_person_cred_hist_length": cb_hist,
            "credit_score": credit_score,
            "previous_default_bin": prev_default,
            "person_gender": gender,
            "person_education": education,
            "person_home_ownership": home_ownership,
            "loan_intent": intent,
        }
        return pd.DataFrame([row], columns=MODEL_FEATURES)

    # ── Inference ──

    def _build_reasons(
        self,
        row: Dict[str, Any],
        default_pd: float,
        score: int,
        decision: str,
    ) -> Dict[str, Any]:
        """Sinh danh sách lý do (rule-based) giải thích quyết định cho UI admin.

        Trả về { positives, negatives, decision_explanation } để admin web
        có thể hiển thị "Vì sao bị từ chối?" / "Điểm mạnh hồ sơ".
        """
        positives: List[str] = []
        negatives: List[str] = []

        # 1. Previous default
        if row["previous_default_bin"] >= 1:
            negatives.append("Khách hàng từng có nợ xấu trên hồ sơ (previous_loan_defaults_on_file = Yes).")
        else:
            positives.append("Không có lịch sử nợ xấu.")

        # 2. Credit score
        cs = float(row["credit_score"])
        if cs < 450:
            negatives.append(f"Điểm tín dụng nội bộ thấp ({int(cs)}/750).")
        elif cs < 550:
            negatives.append(f"Điểm tín dụng nội bộ trung bình thấp ({int(cs)}/750).")
        elif cs >= 700:
            positives.append(f"Điểm tín dụng nội bộ tốt ({int(cs)}/750).")

        # 3. Loan-to-income ratio
        lpi = float(row["loan_percent_income"])
        if lpi >= 0.5:
            negatives.append(
                f"Tỷ lệ khoản vay/thu nhập năm rất cao ({lpi*100:.0f}%) — gánh nặng trả nợ lớn."
            )
        elif lpi >= 0.3:
            negatives.append(
                f"Tỷ lệ khoản vay/thu nhập năm khá cao ({lpi*100:.0f}%)."
            )
        elif lpi > 0:
            positives.append(f"Tỷ lệ khoản vay/thu nhập năm hợp lý ({lpi*100:.0f}%).")

        # 4. Income absolute
        # person_income là USD-scaled annual (VND / 1000). Quy về VND tháng để hiển thị.
        income_usd_annual = float(row["person_income"])
        VND_SCALE = 1000  # phải đồng bộ với aiscore-exchange-rate.ts
        income_vnd_monthly = income_usd_annual * VND_SCALE / 12
        if income_usd_annual < 36_000:  # ~3M VND/tháng
            negatives.append(f"Thu nhập tháng thấp ({income_vnd_monthly:,.0f} ₫/tháng).")
        elif income_usd_annual >= 300_000:  # ~25M VND/tháng
            positives.append(f"Thu nhập tháng cao ({income_vnd_monthly:,.0f} ₫/tháng).")

        # 5. Employment experience
        emp = float(row["person_emp_exp"])
        if emp < 1:
            negatives.append("Kinh nghiệm làm việc dưới 1 năm.")
        elif emp >= 5:
            positives.append(f"Kinh nghiệm làm việc tốt ({int(emp)} năm).")

        # 6. Interest rate
        rate = float(row["loan_int_rate"])
        if rate >= 30:
            negatives.append(f"Lãi suất cao ({rate:.1f}%/năm) — áp lực trả lãi lớn.")
        elif rate <= 12 and rate > 0:
            positives.append(f"Lãi suất ưu đãi ({rate:.1f}%/năm).")

        # 7. Credit history length
        hist = float(row["cb_person_cred_hist_length"])
        if hist < 1:
            negatives.append("Độ dài lịch sử tín dụng dưới 1 năm — hồ sơ chưa đủ dày.")
        elif hist >= 7:
            positives.append(f"Lịch sử tín dụng dày ({int(hist)} năm).")

        # 8. Age
        age = float(row["person_age"])
        if age < 21:
            negatives.append(f"Tuổi còn rất trẻ ({int(age)}).")
        elif age >= 60:
            negatives.append(f"Tuổi cao ({int(age)}) — sát ngưỡng nghỉ hưu.")

        # Decision explanation
        if decision == "approve":
            decision_explanation = (
                f"Hệ thống đề xuất duyệt: PD = {default_pd*100:.1f}%, điểm mô hình {score}/750, mức rủi ro thấp."
            )
        elif decision == "manual_review":
            decision_explanation = (
                f"Cần thẩm định thủ công: PD = {default_pd*100:.1f}%, điểm mô hình {score}/750, mức rủi ro trung bình."
            )
        else:
            decision_explanation = (
                f"Hệ thống đề xuất từ chối: PD = {default_pd*100:.1f}% ≥ ngưỡng {self.threshold*100:.0f}%, "
                f"điểm mô hình {score}/750."
            )

        return {
            "positives": positives,
            "negatives": negatives,
            "decision_explanation": decision_explanation,
        }

    def predict(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        df = self._build_row(raw)
        X = self.preprocessor.transform(df[MODEL_FEATURES])
        raw_proba = self.xgb_model.predict_proba(X)[:, 1]
        model_default_pd = float(self.calibrator.transform(raw_proba)[0])
        row_dict = df.iloc[0].to_dict()
        # Policy floor (rule-based) — BẬT mặc định vì model train trên Kaggle USD nhưng BE
        # truyền VND đã calibrate, không phản ánh đúng sức mua VN. Floor này đảm bảo
        # không auto-approve cho hồ sơ thu nhập/credit yếu. Tắt bằng POLICY_FLOOR_ENABLED=0.
        policy_enabled = str(os.environ.get("POLICY_FLOOR_ENABLED", "1")).lower() in ("1", "true", "yes")
        if policy_enabled:
            policy_floor, policy_overrides = _policy_pd_floor(row_dict)
        else:
            policy_floor, policy_overrides = 0.0, []
        default_pd = max(model_default_pd, policy_floor)
        score = _probability_to_score(default_pd)
        risk_level, decision = _score_to_risk_band(score)
        # Lấy row cho rule engine (df chỉ 1 hàng)
        reasons = self._build_reasons(row_dict, default_pd, score, decision)
        if policy_overrides:
            reasons["policy_overrides"] = policy_overrides
            reasons["model_default_probability_before_policy"] = round(model_default_pd, 6)
        return {
            "status": "success",
            "default_probability": round(default_pd, 6),
            "model_default_probability": round(model_default_pd, 6),
            "policy_pd_floor": round(policy_floor, 6),
            "policy_overrides": policy_overrides,
            "ai_risk_score": int(score),
            "model_score_150_750": int(score),
            "risk_level": risk_level,
            "decision": decision,
            "threshold": self.threshold,
            "predicted_default": int(default_pd >= self.threshold),
            "input_grade": "",
            "input_sub_grade": "",
            "model_features_used": MODEL_FEATURES,
            "features_resolved": {
                "person_age": int(row_dict["person_age"]),
                "person_gender": row_dict["person_gender"],
                "person_education": row_dict["person_education"],
                "person_income": float(row_dict["person_income"]),
                "person_emp_exp": int(row_dict["person_emp_exp"]),
                "person_home_ownership": row_dict["person_home_ownership"],
                "loan_amnt": float(row_dict["loan_amnt"]),
                "loan_intent": row_dict["loan_intent"],
                "loan_int_rate": float(row_dict["loan_int_rate"]),
                "loan_percent_income": float(row_dict["loan_percent_income"]),
                "cb_person_cred_hist_length": int(row_dict["cb_person_cred_hist_length"]),
                "credit_score": int(row_dict["credit_score"]),
                "previous_default_bin": int(row_dict["previous_default_bin"]),
            },
            "reasons": reasons,
        }
