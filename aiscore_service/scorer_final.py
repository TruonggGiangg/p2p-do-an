"""
CreditScorerFinal - model-only inference for models_final/.

The AI service owns only one job here: resolve the request into the model's
feature schema, run the trained model, calibrate its Probability of Default
(PD), then map that PD to a 0-100 evaluation score:

    risk_probability_score = round(PD * 100)
    evaluation_score = 100 - risk_probability_score

Loan grade, auto approve/reject, and max-loan policy are intentionally left to
the backend loan_evaluation_configs table. No rule floor or policy override is
applied in this scorer.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict, Optional

import joblib
import numpy as np
import pandas as pd

# Compat shim for numpy 2.x artifacts loaded on numpy 1.x runtimes.
if not hasattr(np, "_core"):
    import numpy.core as _npc

    sys.modules["numpy._core"] = _npc

import xgboost as xgb


CREDIT_SCORE_TARGET_MIN = 150.0
CREDIT_SCORE_TARGET_MAX = 750.0

DEFAULT_REQUIRED_RAW_COLUMNS = [
    "person_age",
    "person_gender",
    "person_education",
    "person_income",
    "person_emp_exp",
    "person_home_ownership",
    "loan_amnt",
    "loan_term_months",
    "loan_intent",
    "loan_int_rate",
    "loan_percent_income",
    "cb_person_cred_hist_length",
    "credit_score",
    "previous_loan_defaults_on_file",
]

DEFAULT_MODEL_FEATURES = [
    "person_age",
    "person_emp_exp",
    "loan_int_rate",
    "loan_percent_income",
    "loan_term_months",
    "loan_monthly_payment_ratio",
    "cb_person_cred_hist_length",
    "credit_score",
    "previous_default_bin",
    "person_gender",
    "person_education",
    "person_home_ownership",
    "loan_intent",
]

NUMERIC_DEFAULTS = {
    "person_age": 25.0,
    "person_income": 0.0,
    "person_emp_exp": 0.0,
    "loan_amnt": 0.0,
    "loan_term_months": 36.0,
    "loan_int_rate": 12.0,
    "loan_percent_income": 0.0,
    "loan_monthly_payment_ratio": 0.0,
    "cb_person_cred_hist_length": 3.0,
    "credit_score": 600.0,
}

NUMERIC_BOUNDS = {
    "person_age": (18.0, 100.0),
    "person_income": (0.0, np.inf),
    "person_emp_exp": (0.0, 60.0),
    "loan_amnt": (0.0, np.inf),
    "loan_term_months": (1.0, 360.0),
    "loan_int_rate": (0.0, 100.0),
    "loan_percent_income": (0.0, 5.0),
    "loan_monthly_payment_ratio": (0.0, 5.0),
    "cb_person_cred_hist_length": (0.0, 30.0),
    "credit_score": (CREDIT_SCORE_TARGET_MIN, 850.0),
}

RAW_ALIASES = {
    "person_age": ("age",),
    "person_gender": ("gender",),
    "person_education": ("education",),
    "person_income": ("monthly_income", "income"),
    "person_home_ownership": ("home_ownership", "homeOwnership"),
    "loan_amnt": ("loanAmount", "capital"),
    "loan_term_months": ("periodMonth", "loanTermMonths", "term", "term_months", "repaymentMonths", "numberOfRepayments"),
    "loan_intent": ("loanIntent",),
    "loan_int_rate": ("interestRate",),
    "credit_score": ("creditScore",),
    "previous_loan_defaults_on_file": ("previousDefaults",),
}


def _first_present(raw: Dict[str, Any], key: str) -> Any:
    if key in raw and raw[key] not in (None, ""):
        return raw[key]
    for alias in RAW_ALIASES.get(key, ()):  # backward-compatible request aliases
        if alias in raw and raw[alias] not in (None, ""):
            return raw[alias]
    return None


def _to_float(value: Any, default: float, lower: float = -np.inf, upper: float = np.inf) -> float:
    if value is None or value == "":
        return float(default)
    try:
        return float(np.clip(float(value), lower, upper))
    except (TypeError, ValueError):
        return float(default)


def _term_to_months(value: Any, default: float = 36.0) -> float:
    if value is None or value == "":
        return float(default)
    if isinstance(value, (int, float)):
        return float(np.clip(float(value), 1.0, 360.0))
    text = str(value).strip()
    digits = ""
    decimal_seen = False
    for char in text:
        if char.isdigit():
            digits += char
        elif char == "." and not decimal_seen:
            digits += char
            decimal_seen = True
        elif digits:
            break
    return _to_float(digits, default, 1.0, 360.0)


def _yes_no_to_binary(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (bool, int, float)):
        return float(bool(value))
    return 1.0 if str(value).strip().lower() in {"yes", "y", "true", "1"} else 0.0


def _normalize_credit_score(raw_score: Any, source_min: float, source_max: float) -> float:
    score = _to_float(raw_score, NUMERIC_DEFAULTS["credit_score"], CREDIT_SCORE_TARGET_MIN, 850.0)
    if CREDIT_SCORE_TARGET_MIN <= score <= CREDIT_SCORE_TARGET_MAX:
        return float(np.clip(score, CREDIT_SCORE_TARGET_MIN, CREDIT_SCORE_TARGET_MAX))
    source_span = max(source_max - source_min, 1.0)
    normalized = CREDIT_SCORE_TARGET_MIN + (score - source_min) * 600.0 / source_span
    return float(np.clip(normalized, CREDIT_SCORE_TARGET_MIN, CREDIT_SCORE_TARGET_MAX))


def _score_from_default_probability(default_probability: float) -> tuple[int, int]:
    pd_value = float(np.clip(default_probability, 0.0, 1.0))
    risk_probability_score = int(round(pd_value * 100.0))
    evaluation_score = int(np.clip(100 - risk_probability_score, 0, 100))
    return risk_probability_score, evaluation_score


def _logit(probability: float) -> float:
    value = float(np.clip(probability, 1e-6, 1.0 - 1e-6))
    return float(np.log(value / (1.0 - value)))


def _sigmoid(value: float) -> float:
    return float(1.0 / (1.0 + np.exp(-value)))


class CreditScorerFinal:
    """Thin inference wrapper around the trained models_final artifacts."""

    def __init__(self, model_dir: Optional[str] = None) -> None:
        self.model_dir = model_dir or os.environ.get("MODEL_DIR_FINAL") or os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "models_final"
        )

        metadata_path = os.path.join(self.model_dir, "metadata.json")
        if not os.path.exists(metadata_path):
            raise FileNotFoundError(f"metadata.json not found in {self.model_dir}")
        with open(metadata_path, "r", encoding="utf-8") as handle:
            self.metadata = json.load(handle)

        features_path = os.path.join(self.model_dir, "features.json")
        self.features_metadata: Dict[str, Any] = {}
        if os.path.exists(features_path):
            with open(features_path, "r", encoding="utf-8") as handle:
                self.features_metadata = json.load(handle)

        self.required_raw_columns = list(
            self.metadata.get("required_raw_input_columns")
            or self.features_metadata.get("required_raw_input_columns")
            or DEFAULT_REQUIRED_RAW_COLUMNS
        )
        self.model_features = list(
            self.metadata.get("features")
            or self.features_metadata.get("model_features")
            or DEFAULT_MODEL_FEATURES
        )
        self.categorical_features = set(self.metadata.get("categorical_features") or [])

        self.preprocessor = joblib.load(os.path.join(self.model_dir, "preprocessor.joblib"))

        xgb_joblib = os.path.join(self.model_dir, "xgb_pd_model.joblib")
        xgb_json = os.path.join(self.model_dir, "xgb_pd_model.json")
        if os.path.exists(xgb_joblib):
            self.xgb_model = joblib.load(xgb_joblib)
        elif os.path.exists(xgb_json):
            self.xgb_model = xgb.XGBClassifier()
            self.xgb_model.load_model(xgb_json)
        else:
            raise FileNotFoundError("Cannot locate xgb_pd_model.{joblib,json}")

        self.calibrator = joblib.load(os.path.join(self.model_dir, "isotonic_calibrator.joblib"))

        self.term_adjustment = self.metadata.get("term_adjustment") or {}
        self.term_adjuster = None
        term_adjuster_path = os.path.join(self.model_dir, "term_adjuster.joblib")
        if self.term_adjustment.get("enabled") and os.path.exists(term_adjuster_path):
            self.term_adjuster = joblib.load(term_adjuster_path)
        self.term_adjustment_features = list(self.term_adjustment.get("features") or [])
        self.term_adjustment_weight = float(self.term_adjustment.get("weight", 0.0) or 0.0)
        self.term_adjustment_baseline_months = float(
            self.term_adjustment.get("baseline_months", NUMERIC_DEFAULTS["loan_term_months"])
            or NUMERIC_DEFAULTS["loan_term_months"]
        )

        score_norm = self.metadata.get("credit_score_normalization", {})
        self.credit_score_source_min = float(score_norm.get("source_min", 390.0))
        self.credit_score_source_max = float(score_norm.get("source_max", 850.0))

    def _resolve_categorical(self, feature: str, raw_value: Any) -> str:
        value = str(raw_value if raw_value not in (None, "") else "UNKNOWN").strip()
        categories = self._known_categories(feature)
        for category in categories:
            if value.lower() == category.lower():
                return category
        return value

    def _known_categories(self, feature: str) -> list[str]:
        try:
            transformer = self.preprocessor.named_transformers_["cat"]
            feature_names = list(self.metadata.get("categorical_features") or [])
            index = feature_names.index(feature)
            return [str(category) for category in transformer.categories_[index]]
        except Exception:
            return []

    def _resolve_raw_inputs(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        resolved: Dict[str, Any] = {}

        for column in self.required_raw_columns:
            value = _first_present(raw, column)
            if column == "credit_score":
                resolved[column] = _normalize_credit_score(
                    value,
                    source_min=self.credit_score_source_min,
                    source_max=self.credit_score_source_max,
                )
            elif column == "loan_term_months":
                resolved[column] = _term_to_months(value, NUMERIC_DEFAULTS["loan_term_months"])
            elif column in NUMERIC_DEFAULTS:
                lower, upper = NUMERIC_BOUNDS.get(column, (-np.inf, np.inf))
                resolved[column] = _to_float(value, NUMERIC_DEFAULTS[column], lower, upper)
            else:
                resolved[column] = self._resolve_categorical(column, value)

        person_income = float(resolved.get("person_income", 0.0) or 0.0)
        loan_amount = float(resolved.get("loan_amnt", 0.0) or 0.0)
        loan_term_months = _term_to_months(
            resolved.get("loan_term_months") or _first_present(raw, "loan_term_months"),
            NUMERIC_DEFAULTS["loan_term_months"],
        )
        resolved["loan_term_months"] = loan_term_months
        if not _first_present(raw, "loan_percent_income"):
            annual_income = max(person_income, 1.0)
            resolved["loan_percent_income"] = float(np.clip(loan_amount / annual_income, 0.0, 5.0))

        monthly_income = max(person_income / 12.0, 1.0)
        monthly_principal = loan_amount / max(loan_term_months, 1.0)
        resolved["loan_monthly_payment_ratio"] = float(
            np.clip(monthly_principal / monthly_income, 0.0, 5.0)
        )

        resolved["previous_default_bin"] = _yes_no_to_binary(
            resolved.get("previous_loan_defaults_on_file")
        )
        return resolved

    def _build_model_frame(self, resolved: Dict[str, Any]) -> pd.DataFrame:
        row: Dict[str, Any] = {}
        for feature in self.model_features:
            if feature in self.categorical_features:
                row[feature] = self._resolve_categorical(feature, resolved.get(feature))
            else:
                row[feature] = resolved.get(feature, 0.0)
        return pd.DataFrame([row], columns=self.model_features)

    def _term_adjustment_frame(self, resolved: Dict[str, Any]) -> pd.DataFrame:
        row = {feature: float(resolved.get(feature, 0.0) or 0.0) for feature in self.term_adjustment_features}
        return pd.DataFrame([row], columns=self.term_adjustment_features)

    def _apply_term_adjustment(self, base_probability: float, resolved: Dict[str, Any]) -> tuple[float, Dict[str, Any] | None]:
        if self.term_adjuster is None or not self.term_adjustment_features or self.term_adjustment_weight <= 0:
            return base_probability, None

        baseline = dict(resolved)
        baseline["loan_term_months"] = float(np.clip(self.term_adjustment_baseline_months, 1.0, 360.0))
        person_income = float(baseline.get("person_income", 0.0) or 0.0)
        loan_amount = float(baseline.get("loan_amnt", 0.0) or 0.0)
        monthly_income = max(person_income / 12.0, 1.0)
        monthly_principal = loan_amount / max(baseline["loan_term_months"], 1.0)
        baseline["loan_monthly_payment_ratio"] = float(
            np.clip(monthly_principal / monthly_income, 0.0, 5.0)
        )

        actual_term_probability = float(
            np.clip(self.term_adjuster.predict_proba(self._term_adjustment_frame(resolved))[:, 1][0], 0.0, 1.0)
        )
        baseline_term_probability = float(
            np.clip(self.term_adjuster.predict_proba(self._term_adjustment_frame(baseline))[:, 1][0], 0.0, 1.0)
        )
        learned_delta = _logit(actual_term_probability) - _logit(baseline_term_probability)
        actual_ratio = float(resolved.get("loan_monthly_payment_ratio", 0.0) or 0.0)
        baseline_ratio = float(baseline.get("loan_monthly_payment_ratio", 0.0) or 0.0)
        burden_guard_delta = float(np.log1p(max(actual_ratio, 0.0)) - np.log1p(max(baseline_ratio, 0.0)))
        raw_delta = learned_delta
        if actual_ratio > baseline_ratio:
            raw_delta = max(raw_delta, burden_guard_delta)
        raw_delta = float(np.clip(raw_delta, -2.0, 2.0))
        weighted_delta = raw_delta * self.term_adjustment_weight
        adjusted_probability = float(np.clip(_sigmoid(_logit(base_probability) + weighted_delta), 0.0, 1.0))
        details = {
            "enabled": True,
            "features": self.term_adjustment_features,
            "baseline_months": baseline["loan_term_months"],
            "weight": self.term_adjustment_weight,
            "actual_term_pd": round(actual_term_probability, 6),
            "baseline_term_pd": round(baseline_term_probability, 6),
            "learned_logit_delta": round(learned_delta, 6),
            "payment_burden_guard_delta": round(burden_guard_delta, 6),
            "raw_logit_delta": round(raw_delta, 6),
            "weighted_logit_delta": round(weighted_delta, 6),
        }
        return adjusted_probability, details

    def predict(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        resolved = self._resolve_raw_inputs(raw)
        model_frame = self._build_model_frame(resolved)
        processed = self.preprocessor.transform(model_frame[self.model_features])

        raw_probability = self.xgb_model.predict_proba(processed)[:, 1]
        base_default_probability = float(np.clip(self.calibrator.transform(raw_probability)[0], 0.0, 1.0))
        default_probability, term_adjustment_details = self._apply_term_adjustment(base_default_probability, resolved)
        risk_probability_score, evaluation_score = _score_from_default_probability(default_probability)

        model_feature_values = model_frame.iloc[0].to_dict()
        features_resolved = {
            **resolved,
            "model_feature_values": model_feature_values,
            "model_features_used": self.model_features,
            "base_model_default_probability": round(base_default_probability, 6),
            "term_adjustment": term_adjustment_details,
            "scoring_formula": "evaluation_score = 100 - round(default_probability * 100)",
        }

        return {
            "status": "success",
            "default_probability": round(default_probability, 6),
            "model_default_probability": round(base_default_probability, 6),
            "base_model_default_probability": round(base_default_probability, 6),
            "risk_probability_score": risk_probability_score,
            "evaluation_score": evaluation_score,
            "ai_risk_score": evaluation_score,
            "risk_level": None,
            "decision": None,
            "input_grade": "",
            "input_sub_grade": "",
            "features_resolved": features_resolved,
            "model_features_used": self.model_features,
            "reasons": {
                "positives": [],
                "negatives": [],
                "decision_explanation": (
                    f"Model PD={default_probability:.2%}; risk score={risk_probability_score}/100; "
                    f"evaluation score={evaluation_score}/100. Grade/decision is resolved by loan_evaluation_configs."
                ),
            },
        }
