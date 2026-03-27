"""
AIScore Service — FastAPI REST API (VNĐ Context)
==================================================

Endpoints:
  POST /api/score         - Score 1 borrower → ai_risk_score + default_probability
  POST /api/score/batch   - Score nhiều borrower
  GET  /api/model/info    - Model metadata
  GET  /api/health        - Health check
  POST /api/model/retrain - Retrain model

Input từ NestJS (VNĐ):
  {
    "credit_score": 580,
    "capital": 50000000,
    "monthly_income": 15000000,
    "monthly_pay": 2500000,
    "revolving_balance": 10000000,
    "interest_rate": 18.5,
    "dti": 22.0,
    "revolving_util_percent": 45.0,
    "term_months": 36,
    "emp_length_years": 3,
    "active_bad_debts": 0,
    "bankruptcies": 0,
    "active_loans": 2,
    "total_loans_history": 5,
    "home_ownership": "RENT",
    "loan_purpose": "debt_consolidation"
  }

Output:
  {
    "ai_risk_score": 82,
    "default_probability": 0.18,
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
    credit_score: float = Field(..., ge=150, le=750, description="Điểm tín dụng NestJS (150-750)")
    capital: float = Field(..., gt=0, description="Số tiền vay (VNĐ)")
    monthly_income: float = Field(..., ge=0, description="Lương tháng (VNĐ)")
    monthly_pay: float = Field(..., ge=0, description="Trả góp/tháng (VNĐ)")
    revolving_balance: float = Field(default=0, ge=0, description="Dư nợ tín dụng (VNĐ)")
    interest_rate: float = Field(default=12.0, ge=0, le=100, description="Lãi suất (%)")
    dti: float = Field(default=0, ge=0, le=100, description="Nợ/Thu nhập (%)")
    revolving_util_percent: float = Field(default=50, ge=0, le=150, description="% sử dụng hạn mức")
    term_months: Optional[float] = Field(default=36, alias="periodMonth", description="Kỳ hạn (tháng)")
    emp_length_years: float = Field(default=5, ge=0, le=30, description="Số năm đi làm")
    active_bad_debts: float = Field(default=0, ge=0, description="Nợ xấu đang active")
    bankruptcies: float = Field(default=0, ge=0, description="Số lần phá sản")
    active_loans: float = Field(default=0, ge=0, description="Số khoản vay đang mở")
    total_loans_history: float = Field(default=0, ge=0, description="Tổng khoản vay từng có")
    home_ownership: Optional[str] = Field(default="RENT", description="RENT / OWN / MORTGAGE")
    loan_purpose: Optional[str] = Field(default="other", description="Mục đích vay")

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
    Lấy tỷ giá USD→VNĐ:
      1. Env var USD_TO_VND (override cứng nếu cần)
      2. open.er-api.com (miễn phí, không cần key)
      3. exchangerate-api.com (backup)
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
    print(f"[AIScore] Exchange rate: 1 USD = {rate:,.0f} VNĐ (source: {source})")

    yield
    # Shutdown
    print("[AIScore] Shutting down.")


app = FastAPI(
    title="AIScore Service",
    description="XGBoost Risk Scoring — VNĐ Context (P2P Lending)",
    version="2.0.0",
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
        "service": "aiscore-service-v2",
        "model_loaded": scorer is not None and scorer.model is not None,
        "model_type": "XGBoost PD — VNĐ Context",
        "auc_roc": metrics.get("auc_roc", "N/A"),
        "exchange_rate": _EXCHANGE_RATE_CACHE,
    }


@app.post("/api/score", response_model=ScoreResponse)
async def predict_score(req: ScoreRequest):
    """
    Score 1 borrower. Input đã ở VNĐ (từ NestJS gửi sang).
    """
    if scorer is None or scorer.model is None:
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
    Score nhiều borrower cùng lúc (max 100).
    """
    if scorer is None or scorer.model is None:
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
    """Metadata & metrics của model."""
    if scorer is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "success", "data": scorer.metadata}


@app.get("/api/exchange-rate", response_model=ExchangeRateResponse)
async def get_exchange_rate():
    """Lấy tỷ giá USD→VNĐ hiện tại (cached hoặc live)."""
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
