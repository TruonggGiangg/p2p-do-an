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
from typing import Optional, List, Tuple

from scorer import CreditScorer

# ── Pydantic models ──

class ScoreRequest(BaseModel):
    credit_score: float = Field(..., ge=150, le=750, description="Diem tin dung he thong (CIC 150-750)")
    capital: float = Field(..., gt=0, description="So tien vay (VND)", alias="loanAmount")
    monthly_income: float = Field(default=0, ge=0, description="Thu nhap hang thang (VND)")
    monthly_pay: float = Field(default=0, ge=0, description="Tra gop hang thang (VND)")
    revolving_balance: float = Field(default=0, ge=0, description="Du no tin dung quay vong (VND)")
    total_current_balance: float = Field(default=0, ge=0, description="Tong du no tat ca tai khoan (VND)")
    dti: float = Field(default=0, ge=0, le=100, description="Ty le No/Thu nhap (%)")
    revolving_util_percent: float = Field(default=50, ge=0, le=150, description="% su dung han muc tin dung")
    emp_length_years: float = Field(default=3, ge=0, le=10, description="So nam di lam (0.5-10)")
    active_bad_debts: int = Field(default=0, ge=0, le=20, description="So ho so no xau (pub_rec)")
    bankruptcies: int = Field(default=0, ge=0, le=10, description="So lan pha san")
    active_loans: int = Field(default=5, ge=0, le=50, description="So khoan vay dang mo")
    total_loans_history: int = Field(default=10, ge=0, le=100, description="Tong so khoan vay lich su")
    credit_history_months: float = Field(default=120, ge=0, le=600, description="Tuoi tin dung (thang)")
    recent_inquiries: int = Field(default=0, ge=0, le=20, description="So lan truy van TD 6 thang")
    delinquencies_2yr: int = Field(default=0, ge=0, le=20, description="So lan tre han 2 nam")
    accounts_delinquent: int = Field(default=0, ge=0, le=10, description="So tai khoan dang qua han hien tai")
    severe_delinquencies_24m: int = Field(default=0, ge=0, le=20, description="So lan qua han 90+ ngay trong 24 thang (nhom no 3-5)")
    pct_never_delinquent: float = Field(default=100, ge=0, le=100, description="Ty le khoan vay chua tung qua han (%)")
    collections_12m: int = Field(default=0, ge=0, le=10, description="So lan xu ly thu hoi no 12 thang qua")
    term: Optional[int] = Field(default=36, description="Ky han vay (thang)", alias="periodMonth")
    home_ownership: Optional[str] = Field(default="RENT", description="RENT / OWN / MORTGAGE / OTHER")
    verification_status: Optional[str] = Field(default="Not Verified", description="Muc xac minh eKYC")
    purpose: Optional[str] = Field(default="other", description="Muc dich vay")

    model_config = {"populate_by_name": True}

class ScoreResponse(BaseModel):
    ai_risk_score: int
    default_probability: float
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
        print("[AIScore] Model loaded successfully (Stacking: XGB+SVM→LR, 25 features).")
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
    test_metrics = scorer.metadata.get("test_metrics", metrics) if scorer else metrics
    return {
        "status": "ok",
        "service": "aiscore-service-v17-hybrid",
        "model_loaded": scorer is not None and scorer.xgb_model is not None,
        "model_type": "Explainable Hybrid (Scorecard + XGB + LGBM → Meta-LR → Isotonic)",
        "architecture": "Nhánh 1: WOE-LR Scorecard | Nhánh 2: XGBoost | Nhánh 3: LightGBM → Meta-LR",
        "data_source": "Lending Club accepted + rejected (2007-2018 Q4)",
        "n_features": len(scorer.metadata.get("all_features", scorer.metadata.get("features", []))) if scorer else 47,
        "auc_roc": test_metrics.get("stacking_auc", test_metrics.get("auc_roc", "N/A")),
        "exchange_rate": _EXCHANGE_RATE_CACHE,
    }


@app.post("/api/score", response_model=ScoreResponse)
async def predict_score(req: ScoreRequest):
    """
    Score 1 borrower. Input nhan tu NestJS (VND context).
    Returns ai_risk_score (0-100) + default_probability (PD 0.0-1.0).
    """
    if scorer is None or scorer.lr_model is None:
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
    if scorer is None or scorer.lr_model is None:
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
        return {"status": "success", "message": "Model retrained and reloaded (Stacking: XGB+SVM→LR, 25 features)"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Retrain failed: {str(e)}")
