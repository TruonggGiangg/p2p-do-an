"""
AIScore Service — FastAPI REST API (v9.0)
===========================================
Stacking Ensemble: XGBoost + SVM (Level 1) → LR Meta (Level 2)

Pipeline:
  25 features → Smart Scaling → XGB prob + SVM prob
  → [XGB_p, SVM_p, 25 features] → LR Meta → PD (calibrated)

Dataset: Lending Club accepted + rejected (2007-2018 Q4)
25 Features: 21 NUMERIC + 4 CATEGORICAL

Endpoints:
  POST /api/score         - Score 1 borrower
  POST /api/score/batch   - Score nhieu borrower
  GET  /api/model/info    - Model metadata
  GET  /api/health        - Health check
  POST /api/model/retrain - Retrain model

Output:
  {
    "ai_risk_score": 21,
    "default_probability": 0.2098,
    "status": "success"
  }
"""

import os
import traceback
import httpx
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Tuple, Dict, Any

from scorer_final import CreditScorerFinal

# ── Pydantic models (models_final v1) ──

class ScoreRequest(BaseModel):
    """Schema mapping sang 13 raw input columns của model models_final.

    BE NestJS đẩy tất cả các trường này; trường không có → để default.
    Cho phép truyền alias (loanAmount, periodMonth…) để backward-compat.
    """

    # 13 raw inputs của model
    person_age: Optional[float] = Field(default=25, ge=18, le=100, description="Tuổi người vay")
    person_gender: Optional[str] = Field(default="male", description="male / female")
    person_education: Optional[str] = Field(default="High School", description="High School / Associate / Bachelor / Master / Doctorate")
    person_income: float = Field(default=0, ge=0, description="Thu nhập hàng tháng (VND)")
    person_emp_exp: float = Field(default=0, ge=0, le=60, description="Số năm kinh nghiệm làm việc")
    person_home_ownership: Optional[str] = Field(default="RENT", description="RENT / OWN / MORTGAGE / OTHER")
    loan_amnt: float = Field(default=0, ge=0, description="Số tiền vay", alias="loanAmount")
    loan_intent: Optional[str] = Field(default="PERSONAL", description="PERSONAL / EDUCATION / MEDICAL / VENTURE / HOMEIMPROVEMENT / DEBTCONSOLIDATION")
    loan_int_rate: Optional[float] = Field(default=12.0, ge=0, le=100, description="Lãi suất %/năm")
    loan_percent_income: Optional[float] = Field(default=None, ge=0, le=5, description="loan_amnt / (income*12); nếu không truyền sẽ tự tính")
    cb_person_cred_hist_length: Optional[float] = Field(default=3, ge=0, le=30, description="Số năm lịch sử tín dụng")
    credit_score: float = Field(..., ge=150, le=850, description="Điểm tín dụng (CIC 150-750 hoặc FICO 300-850)")
    previous_loan_defaults_on_file: Optional[str] = Field(default="No", description="Yes / No")

    # Backward-compat aliases (BE cũ có thể đang đẩy)
    capital: Optional[float] = Field(default=None, description="Alias của loan_amnt")
    monthly_income: Optional[float] = Field(default=None, ge=0, description="Alias của person_income")

    model_config = {"populate_by_name": True}

class ScoreResponse(BaseModel):
    ai_risk_score: int
    default_probability: float
    model_default_probability: Optional[float] = None
    policy_pd_floor: Optional[float] = None
    policy_overrides: Optional[List[str]] = None
    risk_level: Optional[str] = None
    decision: Optional[str] = None
    reasons: Optional[Dict[str, Any]] = None
    features_resolved: Optional[Dict[str, Any]] = None
    input_grade: str = ""
    input_sub_grade: str = ""
    status: str

class BatchRequest(BaseModel):
    applicants: List[dict]

class ExchangeRateResponse(BaseModel):
    usd_to_vnd: float
    source: str


# ── Exchange rate helper ──

_EXCHANGE_RATE_CACHE: dict = {"rate": None, "source": "default"}

async def fetch_exchange_rate() -> Tuple[float, str]:
    """
    Lay ty gia USD→VND:
      1. Env var USD_TO_VND
      2. open.er-api.com
      3. exchangerate-api.com
      4. Raise error if no live/env rate is available
    """
    env_rate = os.environ.get("USD_TO_VND")
    if env_rate:
        return float(env_rate), "env"

    apis = [
        "https://open.er-api.com/v6/latest/USD",
        "https://api.exchangerate-api.com/v4/latest/USD",
    ]
    async with httpx.AsyncClient(timeout=8.0) as client:
        for url in apis:
            try:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    vnd_rate = data.get("rates", {}).get("VND")
                    if vnd_rate and float(vnd_rate) > 0:
                        return float(vnd_rate), url.split("/")[2]
            except Exception:
                continue

    raise RuntimeError("Cannot fetch USD->VND exchange rate from env or live APIs")


# ── App lifecycle ──

scorer: Optional[CreditScorerFinal] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global scorer, _EXCHANGE_RATE_CACHE
    # Startup: load models_final/
    try:
        scorer = CreditScorerFinal()
        print("[AIScore] models_final loaded (XGB + Isotonic, 13 raw features).")
    except FileNotFoundError as e:
        print(f"[AIScore] models_final not found: {e}. Service starts but /api/score will 503.")
        scorer = None

    # Fetch exchange rate on startup
    try:
        rate, source = await fetch_exchange_rate()
        _EXCHANGE_RATE_CACHE = {"rate": rate, "source": source}
        print(f"[AIScore] Exchange rate: 1 USD = {rate:,.0f} VND (source: {source})")
    except Exception as e:
        _EXCHANGE_RATE_CACHE = {"rate": None, "source": "unavailable", "error": str(e)}
        print(f"[AIScore] Exchange rate unavailable: {e}")

    yield
    # Shutdown
    print("[AIScore] Shutting down.")


app = FastAPI(
    title="AIScore Service",
    description="Stacking Ensemble (XGB+SVM→LR Meta, 25 Features: 21 NUM + 4 CAT) — P2P Lending Credit Scoring",
    version="9.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Endpoints ──

@app.get("/api/health")
async def health():
    metrics = scorer.metadata.get("metrics", {}) if scorer else {}
    return {
        "status": "ok",
        "service": "aiscore-service-models-final",
        "model_loaded": scorer is not None,
        "model_type": "XGBoost + IsotonicRegression (models_final v1)",
        "data_source": "loan_data.csv (45k rows)",
        "n_features": len(scorer.metadata.get("features", [])) if scorer else 13,
        "auc_roc": metrics.get("roc_auc", "N/A"),
        "exchange_rate": _EXCHANGE_RATE_CACHE,
    }


@app.post("/api/score", response_model=ScoreResponse)
async def predict_score(req: ScoreRequest):
    """Score 1 borrower với models_final (13 raw features)."""
    if scorer is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        features = req.model_dump(by_alias=False, exclude_none=False)
        # Backward-compat: chuyển alias cũ sang tên mới nếu cần
        if not features.get("loan_amnt") and features.get("capital"):
            features["loan_amnt"] = features["capital"]
        if not features.get("person_income") and features.get("monthly_income"):
            features["person_income"] = features["monthly_income"]
        result = scorer.predict(features)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@app.post("/api/score/batch")
async def predict_batch(req: BatchRequest):
    """
    Score nhieu borrower cung luc (max 100).
    """
    if scorer is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if len(req.applicants) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 per batch")

    results = []
    errors = []

    for i, applicant in enumerate(req.applicants):
        try:
            result = scorer.predict(applicant)
            result["index"] = i
            results.append(result)
        except Exception as e:
            errors.append({"index": i, "error": str(e)})

    if results:
        scores = [r["ai_risk_score"] for r in results]
        pds = [r["default_probability"] for r in results]
        summary = {
            "total": len(req.applicants),
            "scored": len(results),
            "errors": len(errors),
            "avg_risk_score": round(sum(scores) / len(scores), 1),
            "avg_pd": round(sum(pds) / len(pds), 4),
        }
    else:
        summary = {"total": len(req.applicants), "scored": 0, "errors": len(errors)}

    return {"status": "success", "data": {"results": results, "errors": errors, "summary": summary}}


@app.get("/api/model/info")
async def model_info():
    """Metadata & metrics cua model."""
    if scorer is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "success", "data": scorer.metadata}


@app.get("/api/exchange-rate", response_model=ExchangeRateResponse)
async def get_exchange_rate():
    """Lay ty gia USD→VND hien tai (cached hoac live)."""
    try:
        rate, source = await fetch_exchange_rate()
    except Exception as e:
        cached_rate = _EXCHANGE_RATE_CACHE.get("rate")
        if cached_rate:
            return {"usd_to_vnd": cached_rate, "source": f"cached:{_EXCHANGE_RATE_CACHE.get('source', 'unknown')}"}
        raise HTTPException(status_code=503, detail=str(e))
    _EXCHANGE_RATE_CACHE["rate"] = rate
    _EXCHANGE_RATE_CACHE["source"] = source
    _EXCHANGE_RATE_CACHE.pop("error", None)
    return {"usd_to_vnd": rate, "source": source}


@app.post("/api/model/reload")
async def reload_model():
    """Reload models_final/ artifacts từ đĩa (sau khi train lại offline)."""
    global scorer
    try:
        scorer = CreditScorerFinal()
        return {"status": "success", "message": "models_final reloaded"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Reload failed: {str(e)}")
