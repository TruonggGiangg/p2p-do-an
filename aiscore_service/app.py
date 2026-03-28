"""
AIScore Service — FastAPI REST API
====================================

XGBoost (benchmark) + Random Forest Scorecard:
  Stage 1: XGBoost → benchmark AUC + Feature Importance
  Stage 2: Random Forest on 14 features (9 NUM + 5 CAT) → PD
  Stage 3: PD → Scorecard formula → ai_risk_score (0-100)

Dataset: Lending Club accepted + rejected (2007-2018 Q4)

Endpoints:
  POST /api/score         - Score 1 borrower → ai_risk_score + PD
  POST /api/score/batch   - Score nhieu borrower
  GET  /api/model/info    - Model metadata
  GET  /api/health        - Health check
  POST /api/model/retrain - Retrain model

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
from typing import Optional

from scorer import CreditScorer

# ── Pydantic models ──

class ScoreRequest(BaseModel):
    credit_score: float = Field(..., ge=300, le=850, description="Diem tin dung (FICO/CIC 300-850)")
    loan_amnt: float = Field(..., gt=0, description="So tien vay (VND)", alias="capital")
    int_rate: float = Field(default=12.0, ge=0, le=40, description="Lai suat (%/nam)")
    annual_inc: float = Field(default=0, ge=0, description="Thu nhap hang nam (VND)")
    dti: float = Field(default=0, ge=0, le=100, description="No/Thu nhap (%)")
    revol_util: float = Field(default=50, ge=0, le=150, description="% su dung han muc tin dung")
    open_acc: int = Field(default=5, ge=0, le=50, description="So tai khoan tin dung dang mo")
    pub_rec: int = Field(default=0, ge=0, le=20, description="So ho so cong khai (pha san...)")
    term: Optional[int] = Field(default=36, description="Ky han (thang)", alias="periodMonth")
    home_ownership: Optional[str] = Field(default="RENT", description="RENT / OWN / MORTGAGE / OTHER")
    verification_status: Optional[str] = Field(default="Not Verified", description="Muc xac minh eKYC")
    purpose: Optional[str] = Field(default="other", description="Muc dich vay (debt_consolidation, credit_card, ...)")
    emp_length: Optional[str] = Field(default="5 years", description="Tham nien lam viec (< 1 year ... 10+ years)")

    class Config:
        populate_by_name = True

class ScoreResponse(BaseModel):
    ai_risk_score: int
    default_probability: float
    status: str

class BatchRequest(BaseModel):
    applicants: list[dict]

class ExchangeRateResponse(BaseModel):
    usd_to_vnd: float
    source: str


# ── Exchange rate helper ──

_EXCHANGE_RATE_CACHE: dict = {"rate": None, "source": "default"}

async def fetch_exchange_rate() -> tuple[float, str]:
    """
    Lay ty gia USD→VND:
      1. Env var USD_TO_VND
      2. open.er-api.com
      3. exchangerate-api.com
      4. Fallback 25000
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

    return 25000.0, "default_fallback"


# ── App lifecycle ──

scorer: Optional[CreditScorer] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global scorer, _EXCHANGE_RATE_CACHE
    # Startup: load model
    try:
        scorer = CreditScorer()
        print("[AIScore] Model loaded successfully.")
    except FileNotFoundError:
        print("[AIScore] Model not found. Training now...")
        from train_model import train_model
        train_model()
        scorer = CreditScorer()
        print("[AIScore] Model trained and loaded.")

    # Fetch exchange rate on startup
    rate, source = await fetch_exchange_rate()
    _EXCHANGE_RATE_CACHE = {"rate": rate, "source": source}
    print(f"[AIScore] Exchange rate: 1 USD = {rate:,.0f} VND (source: {source})")

    yield
    # Shutdown
    print("[AIScore] Shutting down.")


app = FastAPI(
    title="AIScore Service",
    description="XGBoost + Random Forest Scorecard (14 Features: 9 NUM + 5 CAT) — Lending Club (P2P Lending)",
    version="7.0.0",
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
    test_metrics = scorer.metadata.get("test_metrics", metrics) if scorer else metrics
    return {
        "status": "ok",
        "service": "aiscore-service-v7-xgb-rf-scorecard",
        "model_loaded": scorer is not None and scorer.rf_model is not None,
        "model_type": "XGBoost (benchmark) + Random Forest Scorecard (14 feat: 9 NUM + 5 CAT)",
        "data_source": "Lending Club accepted + rejected (2007-2018 Q4)",
        "architecture": scorer.metadata.get("architecture", "N/A") if scorer else "N/A",
        "n_features": len(scorer.metadata.get("feature_names", [])) if scorer else 14,
        "auc_roc": test_metrics.get("rf_auc", test_metrics.get("auc_roc", "N/A")),
        "exchange_rate": _EXCHANGE_RATE_CACHE,
    }


@app.post("/api/score", response_model=ScoreResponse)
async def predict_score(req: ScoreRequest):
    """
    Score 1 borrower. Input nhan tu NestJS (VND context).
    """
    if scorer is None or scorer.rf_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        features = req.model_dump(by_alias=False)
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
    if scorer is None or scorer.rf_model is None:
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
            "min_risk_score": min(scores),
            "max_risk_score": max(scores),
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
    rate, source = await fetch_exchange_rate()
    _EXCHANGE_RATE_CACHE["rate"] = rate
    _EXCHANGE_RATE_CACHE["source"] = source
    return {"usd_to_vnd": rate, "source": source}


@app.post("/api/model/retrain")
async def retrain_model():
    """Retrain model (call during off-peak)."""
    global scorer
    try:
        from train_model import train_model
        train_model()
        scorer = CreditScorer()
        return {"status": "success", "message": "Model retrained and reloaded"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Retrain failed: {str(e)}")
