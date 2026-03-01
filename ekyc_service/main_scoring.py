from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import random

app = FastAPI(title="P2P BNPL Scoring AI Service")

class ScoringRequest(BaseModel):
    user_id: str
    phone: Optional[str] = None
    amount: Optional[float] = 0
    history_count: Optional[int] = 0

class ScoringResponse(BaseModel):
    user_id: str
    score: int
    risk_level: str
    recommended_limit: float
    message: str

@app.get("/")
async def root():
    return {"message": "BNPL Scoring Service is running"}

@app.post("/scoring", response_model=ScoringResponse)
async def get_scoring(request: ScoringRequest):
    """
    Endpoint chấm điểm tín dụng dựa trên AI/Heuristic
    Trong thực tế, đây là nơi gọi model ML (XGBoost/LightGBM)
    """
    try:
        # Mocking Logic (Heuristic đơn giản)
        # Score từ 300 - 850
        base_score = 600
        
        # Giả lập ảnh hưởng của lịch sử vay
        bonus = min(request.history_count * 20, 150)
        
        # Giả lập rủi ro nếu số tiền quá lớn
        risk_penalty = 0
        if request.amount > 50000000: # > 50 triệu
            risk_penalty = 50
            
        final_score = base_score + bonus - risk_penalty
        final_score = max(300, min(850, final_score))
        
        # Phân loại rủi ro
        risk_level = "Low"
        recommended_limit = 20000000.0 # 20 triệu mặc định
        
        if final_score < 450:
            risk_level = "High"
            recommended_limit = 0.0
        elif final_score < 650:
            risk_level = "Medium"
            recommended_limit = 10000000.0
        else:
            risk_level = "Low"
            recommended_limit = 50000000.0

        return ScoringResponse(
            user_id=request.user_id,
            score=final_score,
            risk_level=risk_level,
            recommended_limit=recommended_limit,
            message="Scoring completed successfully"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
