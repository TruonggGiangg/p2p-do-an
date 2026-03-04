"""
AIScore Service - Flask REST API
Endpoints for credit scoring using trained XGBoost model.
"""

import os
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS
from pydantic import BaseModel, Field, ValidationError
from typing import Optional

from scorer import CreditScorer


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Initialize scorer (loads model on startup)
    try:
        scorer = CreditScorer()
        print("[AIScore] Model loaded successfully.")
    except FileNotFoundError:
        print("[AIScore] WARNING: Model not found. Run train_model.py first!")
        print("[AIScore] Starting in training mode...")
        from train_model import train_model
        train_model()
        scorer = CreditScorer()
        print("[AIScore] Model trained and loaded successfully.")

    # ── Health check ──────────────────────────────────────────────────────
    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({
            "status": "ok",
            "service": "aiscore-service",
            "model_loaded": scorer.model is not None,
            "model_metrics": scorer.metadata.get("metrics", {}),
        })

    # ── Credit Score Prediction ──────────────────────────────────────────
    @app.route("/api/score", methods=["POST"])
    def predict_score():
        """
        Predict credit score for a loan applicant.

        Request body (JSON):
        {
            "age": 30,
            "monthly_income": 15000000,
            "employment_years": 5,
            "avg_account_balance": 30000000,   // optional, auto-computed
            "monthly_spending": 8000000,
            "loan_amount": 50000000,
            "loan_term": 12,
            "loan_to_income_ratio": 0.28,      // optional, auto-computed
            "previous_loans_count": 2,          // optional, default 0
            "late_payment_count": 0,            // optional, default 0
            "repayment_ratio": 0.95,            // optional, default 1.0
            "DTI": 0.42,                        // optional, auto-computed
            "cashflow_stability": 0.8           // optional, default 0.5
        }

        Response:
        {
            "success": true,
            "data": {
                "credit_score": 720,          // 300-850 scale
                "probability_good": 0.7636,
                "rating": "Good",
                "rating_vi": "Tốt",
                "rating_color": "#3B82F6",
                "decision": "APPROVE",
                "decision_vi": "Chấp thuận",
                "max_recommended_amount": 360000000,
                "risk_factors": [...],
                "details": {...}
            }
        }
        """
        try:
            data = request.get_json(force=True)
            if not data:
                return jsonify({"success": False, "error": "Empty request body"}), 400

            # Validate required fields
            required = ["age", "monthly_income", "monthly_spending", "loan_amount", "loan_term"]
            missing = [f for f in required if f not in data]
            if missing:
                return jsonify({
                    "success": False,
                    "error": f"Missing required fields: {missing}",
                    "required_fields": required,
                    "optional_fields": [
                        "employment_years", "avg_account_balance",
                        "loan_to_income_ratio", "previous_loans_count",
                        "late_payment_count", "repayment_ratio",
                        "DTI", "cashflow_stability"
                    ],
                }), 400

            # Validate numeric types
            for key, val in data.items():
                if not isinstance(val, (int, float)):
                    return jsonify({
                        "success": False,
                        "error": f"Field '{key}' must be numeric, got {type(val).__name__}",
                    }), 400

            result = scorer.predict(data)
            return jsonify({"success": True, "data": result})

        except ValueError as e:
            return jsonify({"success": False, "error": str(e)}), 400
        except Exception as e:
            traceback.print_exc()
            return jsonify({"success": False, "error": f"Internal error: {str(e)}"}), 500

    # ── Batch Scoring ─────────────────────────────────────────────────────
    @app.route("/api/score/batch", methods=["POST"])
    def predict_batch():
        """
        Score multiple applicants at once.

        Request body: { "applicants": [ {...}, {...}, ... ] }
        Response: { "success": true, "data": { "results": [...], "summary": {...} } }
        """
        try:
            data = request.get_json(force=True)
            applicants = data.get("applicants", [])

            if not applicants:
                return jsonify({"success": False, "error": "No applicants provided"}), 400

            if len(applicants) > 100:
                return jsonify({"success": False, "error": "Maximum 100 applicants per batch"}), 400

            results = []
            errors = []

            for i, applicant in enumerate(applicants):
                try:
                    result = scorer.predict(applicant)
                    result["index"] = i
                    results.append(result)
                except Exception as e:
                    errors.append({"index": i, "error": str(e)})

            # Summary stats
            if results:
                scores = [r["credit_score"] for r in results]
                approved = sum(1 for r in results if r["decision"] == "APPROVE")
                summary = {
                    "total": len(applicants),
                    "scored": len(results),
                    "errors": len(errors),
                    "approved": approved,
                    "review": sum(1 for r in results if r["decision"] == "REVIEW"),
                    "rejected": sum(1 for r in results if r["decision"] == "REJECT"),
                    "avg_score": round(sum(scores) / len(scores), 1),
                    "min_score": min(scores),
                    "max_score": max(scores),
                }
            else:
                summary = {"total": len(applicants), "scored": 0, "errors": len(errors)}

            return jsonify({
                "success": True,
                "data": {
                    "results": results,
                    "errors": errors if errors else None,
                    "summary": summary,
                },
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify({"success": False, "error": str(e)}), 500

    # ── Model Info ────────────────────────────────────────────────────────
    @app.route("/api/model/info", methods=["GET"])
    def model_info():
        """Return model metadata and feature importance."""
        return jsonify({
            "success": True,
            "data": {
                "feature_names": scorer.metadata.get("feature_names", []),
                "metrics": scorer.metadata.get("metrics", {}),
                "feature_importance": scorer.metadata.get("feature_importance", {}),
                "score_thresholds": scorer.metadata.get("score_thresholds", {}),
                "score_range": {"min": 300, "max": 850},
                "decisions": {
                    "APPROVE": "Chấp thuận cho vay",
                    "REVIEW": "Cần xem xét thêm",
                    "REJECT": "Từ chối cho vay",
                },
            },
        })

    # ── Retrain endpoint (admin only in production) ───────────────────────
    @app.route("/api/model/retrain", methods=["POST"])
    def retrain():
        """Retrain the model with fresh synthetic data or provided data."""
        try:
            from train_model import train_model
            model, scaler, metadata = train_model()
            # Reload scorer
            scorer._load_model()
            return jsonify({
                "success": True,
                "message": "Model retrained successfully",
                "metrics": metadata.get("metrics", {}),
            })
        except Exception as e:
            traceback.print_exc()
            return jsonify({"success": False, "error": str(e)}), 500

    return app


# ── Entry point ──────────────────────────────────────────────────────────────
app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8001))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    print(f"\n[AIScore] Starting on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
