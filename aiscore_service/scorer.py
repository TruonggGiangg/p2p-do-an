"""
CreditScorer — Explainable Hybrid Inference (v17.0)
=====================================================

Pipeline:
  Nhánh 1 — WOE → LR Scorecard → scorecard_pd
  Nhánh 2 — Smart Scaling → XGBoost → xgb_pd
  Nhánh 3 — Smart Scaling → LightGBM → lgbm_pd (optional)
  Stacking — Meta-LR(SC, XGB, LGBM) → Isotonic calibration → PD

Artifacts (from train_model.py v17):
  - xgb_pd_model.json           (XGBoost Level 1)
  - lgbm_pd_model.txt           (LightGBM Level 1, optional)
  - lr_scorecard_model.joblib   (WOE-LR Scorecard Level 1)
  - woe_binning.joblib          (WOE bin edges + maps)
  - meta_lr.joblib              (Meta-LR Level 2)
  - iso_calibrator.joblib       (Isotonic calibration)
  - per_feature_scalers.joblib  ({feature: (strategy, scaler)})
  - metadata.json               (metrics + config + feature lists)
  - scorecard_table.json        (human-readable point breakdown)

Output:
  {
    "ai_risk_score": 21,
    "default_probability": 0.2098,
    "status": "success"
  }
"""

import os
import sys
import json
import numpy as np
import xgboost as xgb
import joblib

# ── Compat shim: numpy 2.0 models on numpy 1.x ──
# Models saved with numpy>=2.0 reference numpy._core,
# which doesn't exist in numpy<2.0. Alias it so pickle works.
if not hasattr(np, '_core'):
    import numpy.core as _npc
    sys.modules['numpy._core'] = _npc
    # Also alias common sub-modules that may be referenced
    for _sub in ('multiarray', 'umath', 'numeric', 'fromnumeric',
                 '_methods', '_internal'):
        _src = f'numpy.core.{_sub}'
        _dst = f'numpy._core.{_sub}'
        if _src in sys.modules:
            sys.modules[_dst] = sys.modules[_src]
        else:
            try:
                __import__(_src)
                sys.modules[_dst] = sys.modules[_src]
            except ImportError:
                pass

try:
    import lightgbm as lgb
    HAS_LGBM = True
except ImportError:
    HAS_LGBM = False


# ── Scorecard constants ──
BASE_SCORE = 600
PDO = 20
BASE_ODDS = 50
FACTOR = PDO / np.log(2)
OFFSET = BASE_SCORE - FACTOR * np.log(BASE_ODDS)


def pd_to_score(pd_arr):
    pd_c = np.clip(np.asarray(pd_arr, dtype=np.float64), 1e-15, 1 - 1e-15)
    odds = pd_c / (1 - pd_c)
    scores = OFFSET - FACTOR * np.log(odds)
    return np.clip(scores, 150, 950)


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

# ─── Reverse Mapping: credit_score → grade + sub_grade (v18) ───
SUBGRADE_SCORE_MAP = {
    'A1': 750, 'A2': 732, 'A3': 715, 'A4': 697, 'A5': 679,
    'B1': 662, 'B2': 644, 'B3': 626, 'B4': 609, 'B5': 591,
    'C1': 574, 'C2': 556, 'C3': 538, 'C4': 521, 'C5': 503,
    'D1': 485, 'D2': 468, 'D3': 450, 'D4': 432, 'D5': 415,
    'E1': 397, 'E2': 379, 'E3': 362, 'E4': 344, 'E5': 326,
    'F1': 309, 'F2': 291, 'F3': 274, 'F4': 256, 'F5': 238,
    'G1': 221, 'G2': 203, 'G3': 185, 'G4': 168, 'G5': 150,
}
GRADE_ENC_MAP = {'A': 6, 'B': 5, 'C': 4, 'D': 3, 'E': 2, 'F': 1, 'G': 0}
SUBGRADE_ENC_MAP = {sg: i for i, (sg, _) in enumerate(
    sorted(SUBGRADE_SCORE_MAP.items(), key=lambda x: x[1])
)}  # G5=0, G4=1, ..., A1=34


def credit_score_to_grade_subgrade(score):
    """Map credit score (150-750) → (grade, sub_grade, grade_enc, sub_grade_enc)"""
    score = float(np.clip(score, 150, 750))
    closest_sg = min(SUBGRADE_SCORE_MAP.keys(),
                     key=lambda sg: abs(SUBGRADE_SCORE_MAP[sg] - score))
    grade = closest_sg[0]
    return grade, closest_sg, GRADE_ENC_MAP[grade], SUBGRADE_ENC_MAP[closest_sg]


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


def apply_per_feature_scalers(X_raw, scalers, feature_names):
    X_scaled = np.zeros_like(X_raw, dtype=np.float64)
    for i, fname in enumerate(feature_names):
        strategy, sc = scalers[fname]
        X_scaled[:, i] = _transform_one_feature(X_raw[:, i], strategy, sc)
    return X_scaled


def apply_woe_transform(X_raw, feature_names, woe_data):
    """Transform raw features → WOE values using pre-computed binning."""
    X_woe = np.zeros_like(X_raw, dtype=np.float64)
    for i, fname in enumerate(feature_names):
        col = X_raw[:, i]
        fd = woe_data[fname]
        edges = np.array(fd['edges'])
        woe_map = fd['woe_map']
        bin_indices = np.digitize(col, edges[1:-1], right=False)
        default_woe = 0.0
        woe_values = np.array([woe_map.get(int(b), default_woe) for b in bin_indices])
        X_woe[:, i] = woe_values
    return X_woe


class CreditScorer:
    """Explainable Hybrid scorer (v17.0).

    Architecture: Scorecard + XGBoost + LightGBM → Meta-LR → Isotonic → PD
    """

    FEATURE_ALIASES = {
        "so_tien_vay": "capital", "thu_nhap_hang_thang": "monthly_income",
        "tra_hang_thang": "monthly_pay", "du_no_quay_vong": "revolving_balance",
        "tong_du_no_hien_tai": "total_current_balance",
        "ti_le_no_thu_nhap": "dti", "ti_le_su_dung_tin_dung": "revolving_util_percent",
        "so_nam_lam_viec": "emp_length_years", "no_xau_dang_hoat_dong": "active_bad_debts",
        "so_lan_pha_san": "bankruptcies", "khoan_vay_dang_hoat_dong": "active_loans",
        "tong_lich_su_vay": "total_loans_history",
        "so_thang_lich_su_tin_dung": "credit_history_months",
        "so_lan_truy_van_gan_day": "recent_inquiries",
        "diem_tin_dung": "credit_score",
        "ky_han_thang": "term_enc", "loai_nha_o": "home_ownership_enc",
        "trang_thai_xac_minh": "verification_status_enc",
        "muc_dich_vay": "purpose_enc",
        "so_lan_qua_han_2_nam": "delinquencies_2yr",
        "so_tai_khoan_qua_han": "accounts_delinquent",
        "qua_han_nang_24_thang": "severe_delinquencies_24m",
        "ty_le_khong_qua_han": "pct_never_delinquent",
        "thu_no_12_thang": "collections_12m",
        "ty_le_vay_thu_nhap": "loan_to_income",
        "rui_ro_lai_vay": "rate_loan_risk",
        "ty_le_tin_dung_con_lai": "credit_headroom_pct",
    }

    def __init__(self, model_dir="models"):
        self.model_dir = model_dir

        # Level 1: XGBoost
        self.xgb_model = xgb.XGBClassifier()
        self.xgb_model.load_model(os.path.join(model_dir, "xgb_pd_model.json"))

        # Level 1: LightGBM (optional)
        lgbm_path = os.path.join(model_dir, "lgbm_pd_model.txt")
        if os.path.exists(lgbm_path) and HAS_LGBM:
            self.lgbm_model = lgb.Booster(model_file=lgbm_path)
        else:
            self.lgbm_model = None

        # Level 1: WOE-LR Scorecard
        self.lr_model = joblib.load(os.path.join(model_dir, "lr_scorecard_model.joblib"))
        self.woe_data = joblib.load(os.path.join(model_dir, "woe_binning.joblib"))

        # Smart per-feature scalers
        self.scalers = joblib.load(os.path.join(model_dir, "per_feature_scalers.joblib"))

        # Isotonic calibration
        self.iso_calibrator = joblib.load(os.path.join(model_dir, "iso_calibrator.joblib"))

        # Level 2: Meta-learner
        meta_path = os.path.join(model_dir, "meta_lr.joblib")
        if os.path.exists(meta_path):
            self.meta_lr = joblib.load(meta_path)
        else:
            self.meta_lr = None

        # Metadata
        with open(os.path.join(model_dir, "metadata.json"), "r") as f:
            self.metadata = json.load(f)

        # Feature lists from metadata (v12+: decoupled paths)
        self.all_features = self.metadata.get("all_features", self.metadata["features"])
        self.sc_features = self.metadata.get("scorecard_features", self.metadata["features"])
        self.alpha = self.metadata.get("hybrid", {}).get("alpha", 0.3)
        self.optimal_threshold = self.metadata.get("threshold", {}).get("value", 0.5)

        # Scorecard table
        sc_path = os.path.join(model_dir, "scorecard_table.json")
        if os.path.exists(sc_path):
            with open(sc_path, "r") as f:
                self.scorecard_table = json.load(f)
        else:
            self.scorecard_table = None

        ensemble_str = "SC+XGB+LGBM→Meta-LR" if self.lgbm_model else "SC+XGB→Meta-LR" if self.meta_lr else f"α={self.alpha:.2f}"
        print(f"[CreditScorer] Loaded v{self.metadata.get('version', '17')} "
              f"({ensemble_str}, XGB={len(self.all_features)}feat, SC={len(self.sc_features)}feat)")

    def predict(self, features: dict) -> dict:
        """Predict PD using Explainable Hybrid pipeline.

        Returns ai_risk_score (0-100) and default_probability (0.0-1.0).
        """
        # Resolve aliases → canonical names
        resolved = {}
        for k, v in features.items():
            canon = self.FEATURE_ALIASES.get(k, k)
            resolved[canon] = v

        # Process base features (NestJS compatible)
        f = self._process_features(resolved)

        # Derive grade/sub_grade as INPUT features from credit_score (v18)
        # This is the reverse mapping: credit_score → grade + sub_grade
        pred_grade, pred_sub_grade, _, _ = credit_score_to_grade_subgrade(f["credit_score"])

        # Allow caller to override grade/sub_grade directly
        if "grade" in resolved and resolved["grade"]:
            pred_grade = str(resolved["grade"]).upper()
        if "sub_grade" in resolved and resolved["sub_grade"]:
            pred_sub_grade = str(resolved["sub_grade"]).upper()
            pred_grade = pred_sub_grade[0]  # grade derives from sub_grade

        # Recompute encodings from final grade/sub_grade
        f["grade_enc"] = GRADE_ENC_MAP.get(pred_grade, 3)
        f["sub_grade_enc"] = SUBGRADE_ENC_MAP.get(pred_sub_grade, 17)

        # Auto-compute interaction features (v12+)
        mi = f.get("monthly_income", 0)
        mp = f.get("monthly_pay", 0)
        tcb = f.get("total_current_balance", 0)
        rb = f.get("revolving_balance", 0)
        d2y = f.get("delinquencies_2yr", 0)
        acd = f.get("accounts_delinquent", 0)
        sd24 = f.get("severe_delinquencies_24m", 0)
        ri = f.get("recent_inquiries", 0)
        al = f.get("active_loans", 0)
        chm = f.get("credit_history_months", 0)
        pnd = f.get("pct_never_delinquent", 100)
        f.setdefault("payment_burden", mp / (mi + 1))
        f.setdefault("balance_income_ratio", tcb / (mi * 12 + 1))
        f.setdefault("revolving_concentration", rb / (tcb + 1))
        f.setdefault("delinquency_severity", d2y + 2 * acd + 3 * sd24)
        f.setdefault("inquiry_per_account", ri / (al + 1))
        f.setdefault("credit_quality_depth", chm * pnd / 100)

        # Power features (v15)
        abd = f.get("active_bad_debts", 0)
        bk = f.get("bankruptcies", 0)
        col12 = f.get("collections_12m", 0)
        rup = f.get("revolving_util_percent", 50)
        dti = f.get("dti", 15)
        tlh = f.get("total_loans_history", 10)
        te = f.get("term_enc", 36)
        lti = f.get("loan_to_income", 0.2)
        sge = f.get("sub_grade_enc", 17)
        f.setdefault("income_per_loan", mi / (al + 1))
        f.setdefault("risk_accumulation", abd + 2 * bk + 3 * sd24 + d2y + col12)
        f.setdefault("term_loan_risk", (te / 36) * lti)
        f.setdefault("dti_squared", (dti / 100) ** 2)
        f.setdefault("score_utilization", sge * (1 - rup / 150))
        annual_inc = mi * 12 if mi * 12 > 0 else 1
        f.setdefault("installment_income_term", mp * te / annual_inc)
        f.setdefault("delinquency_rate", (d2y + acd) / (tlh + 1))
        f.setdefault("net_monthly_cashflow", max(0, mi - mp))

        # High-Signal features (v17)
        ir = f.get("interest_rate", 12.0)
        rcl = f.get("revolving_credit_limit", 0)
        f.setdefault("rate_loan_risk", ir * lti)
        f.setdefault("credit_headroom_pct",
                      1 - rb / (rcl + 1) if rcl > 0 else 0.0)

        # Full feature vector (ALL features, for XGBoost/LightGBM)
        vec_full = np.array([[f.get(fn, 0.0) for fn in self.all_features]], dtype=np.float64)

        # Nhánh 1: WOE → LR → Scorecard PD (SC features only)
        sc_idx = [self.all_features.index(fn) for fn in self.sc_features if fn in self.all_features]
        vec_sc = vec_full[:, sc_idx]
        vec_woe = apply_woe_transform(vec_sc, self.sc_features, self.woe_data)
        scorecard_pd = float(self.lr_model.predict_proba(vec_woe)[:, 1][0])

        # Nhánh 2: Scaled → XGBoost PD (ALL features)
        vec_scaled = apply_per_feature_scalers(vec_full, self.scalers, self.all_features)
        xgb_pd = float(self.xgb_model.predict_proba(vec_scaled)[:, 1][0])

        # Nhánh 3: Scaled → LightGBM PD (ALL features) if available
        lgbm_pd = None
        if self.lgbm_model is not None:
            lgbm_pd = float(self.lgbm_model.predict(vec_scaled)[0])

        # Stacking or simple blend
        if self.meta_lr is not None:
            if lgbm_pd is not None:
                meta_vec = np.array([[scorecard_pd, xgb_pd, lgbm_pd]])
            else:
                meta_vec = np.array([[scorecard_pd, xgb_pd]])
            hybrid_raw = float(self.meta_lr.predict_proba(meta_vec)[:, 1][0])
        else:
            hybrid_raw = self.alpha * scorecard_pd + (1 - self.alpha) * xgb_pd

        # Isotonic calibration
        pd_cal = float(self.iso_calibrator.predict(np.array([hybrid_raw]))[0])
        pd_cal = float(np.clip(pd_cal, 0.0, 1.0))

        # ai_risk_score: credit score scale (150-950)
        score = int(round(pd_to_score(np.array([pd_cal]))[0]))

        # Also compute simple 0-100 risk score for backward compat
        ai_risk_score = int(round(min(max(hybrid_raw, 0), 1) * 100))

        return {
            "ai_risk_score": ai_risk_score,
            "default_probability": round(pd_cal, 4),
            "input_grade": pred_grade,
            "input_sub_grade": pred_sub_grade,
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

        # ── Delinquency & debt features ──

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

        # Grade/SubGrade encoding from credit_score (v18)
        _, _, ge, sge = credit_score_to_grade_subgrade(f["credit_score"])
        f["grade_enc"] = ge
        f["sub_grade_enc"] = sge

        return f
