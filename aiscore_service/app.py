"""
AIScore Service - Flask REST API (PD-based)
=============================================

Luồng: XGBoost → PD → Credit Score → Grade/SubGrade → Tier → Decision

Endpoints:
  POST /api/score         - Score 1 borrower → PD + all derived metrics
  POST /api/score/batch   - Score nhiều borrower
  GET  /api/model/info    - Model metadata & thresholds
  GET  /api/health        - Health check
  POST /api/model/retrain - Retrain model
"""

import os
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS

from scorer import CreditScorer


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Initialize scorer (loads model on startup)
    try:
        scorer = CreditScorer()
        print("[AIScore] PD model loaded successfully.")
    except FileNotFoundError:
        print("[AIScore] WARNING: Model not found. Training now...")
        from train_model import train_model
        train_model()
        scorer = CreditScorer()
        print("[AIScore] Model trained and loaded successfully.")

    # ── Health check ──────────────────────────────────────────────────────
    @app.route("/api/health", methods=["GET"])
    def health():
        metrics = scorer.metadata.get("metrics", {})
        return jsonify({
            "status": "ok",
            "service": "aiscore-pd-service",
            "model_loaded": scorer.model is not None,
            "model_type": scorer.metadata.get("model_type", "XGBoost PD"),
            "data_source": scorer.metadata.get("data_source", "Lending Club"),
            "n_records": scorer.metadata.get("n_records", 0),
            "auc_roc": metrics.get("auc_roc", "N/A"),
        })

    # ── PD Score Prediction ──────────────────────────────────────────────
    @app.route("/api/score", methods=["POST"])
    def predict_score():
        """
        Predict PD & derived credit metrics cho một borrower.

        Request body (JSON) — Lending Club format:
        {
            "loan_amnt": 15000,            // Số tiền vay (USD)
            "int_rate": 13.56,             // Lãi suất (%)
            "installment": 512.87,         // Khoản trả hàng tháng
            "annual_inc": 75000,           // Thu nhập năm
            "dti": 18.5,                   // Debt-to-Income ratio (%)
            "open_acc": 8,                 // Số tài khoản tín dụng mở
            "revol_bal": 12500,            // Số dư tín dụng quay vòng
            "revol_util": 42.5,            // % sử dụng tín dụng quay vòng
            "total_acc": 25,               // Tổng số tài khoản
            "term": "36 months",           // (optional) Kỳ hạn
            "emp_length": "5 years",       // (optional) Thâm niên
            "home_ownership": "MORTGAGE",  // (optional) RENT/OWN/MORTGAGE
            "verification_status": "Verified",     // (optional)
            "purpose": "debt_consolidation",        // (optional)
            "pub_rec": 0,                  // (optional) Hồ sơ công
            "mort_acc": 1,                 // (optional) Tài khoản thế chấp
            "pub_rec_bankruptcies": 0,     // (optional)
            "credit_history_years": 15,    // (optional) Số năm tín dụng
            "application_type": "INDIVIDUAL",       // (optional)
            "initial_list_status": "w"              // (optional)
        }

        Response:
        {
            "success": true,
            "data": {
                "pd": 0.1234,
                "credit_score": 782,
                "grade": "B",
                "sub_grade": "B2",
                "tier": "Gold",
                "tier_color": "#F59E0B",
                "decision": "APPROVE",
                "decision_vi": "Chấp thuận",
                "max_loan_grade_limit": 25000,
                "risk_level": "MEDIUM",
                "risk_factors": [...],
                "details": {...}
            }
        }
        """
        try:
            data = request.get_json(force=True)
            if not data:
                return jsonify({"success": False, "error": "Empty request body"}), 400

            # Validate required fields (Lending Club core fields)
            required = ["loan_amnt", "int_rate", "installment", "annual_inc", "dti"]
            # Also accept alternative names
            alt_map = {
                "loan_amnt": ["loan_amount"],
                "int_rate": ["interest_rate"],
                "annual_inc": ["annual_income"],
            }
            missing = []
            for f in required:
                if f not in data:
                    alts = alt_map.get(f, [])
                    if not any(a in data for a in alts):
                        missing.append(f)

            if missing:
                return jsonify({
                    "success": False,
                    "error": f"Missing required fields: {missing}",
                    "required_fields": required,
                    "optional_fields": [
                        "term", "emp_length", "open_acc", "pub_rec",
                        "revol_bal", "revol_util", "total_acc", "mort_acc",
                        "pub_rec_bankruptcies", "home_ownership",
                        "verification_status", "purpose", "application_type",
                        "initial_list_status", "credit_history_years",
                    ],
                    "example": {
                        "loan_amnt": 15000,
                        "int_rate": 13.56,
                        "installment": 512.87,
                        "annual_inc": 75000,
                        "dti": 18.5,
                    },
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

        Request: { "applicants": [ {...}, {...}, ... ] }
        Response: { "success": true, "data": { "results": [...], "summary": {...} } }
        """
        try:
            data = request.get_json(force=True)
            applicants = data.get("applicants", [])

            if not applicants:
                return jsonify({"success": False, "error": "No applicants provided"}), 400

            if len(applicants) > 100:
                return jsonify({"success": False, "error": "Maximum 100 per batch"}), 400

            results = []
            errors = []

            for i, applicant in enumerate(applicants):
                try:
                    result = scorer.predict(applicant)
                    result["index"] = i
                    results.append(result)
                except Exception as e:
                    errors.append({"index": i, "error": str(e)})

            # Summary
            if results:
                scores = [r["credit_score"] for r in results]
                pds = [r["pd"] for r in results]
                tiers = {}
                for r in results:
                    t = r["tier"]
                    tiers[t] = tiers.get(t, 0) + 1

                summary = {
                    "total": len(applicants),
                    "scored": len(results),
                    "errors": len(errors),
                    "approved": sum(1 for r in results if r["decision"] == "APPROVE"),
                    "review": sum(1 for r in results if r["decision"] == "REVIEW"),
                    "rejected": sum(1 for r in results if r["decision"] == "REJECT"),
                    "avg_pd": round(sum(pds) / len(pds), 4),
                    "avg_score": round(sum(scores) / len(scores), 1),
                    "min_score": min(scores),
                    "max_score": max(scores),
                    "tier_distribution": tiers,
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
        """Return model metadata, thresholds, and feature importance."""
        return jsonify({
            "success": True,
            "data": {
                "model_type": scorer.metadata.get("model_type", "XGBoost PD"),
                "data_source": scorer.metadata.get("data_source", "Lending Club"),
                "n_records": scorer.metadata.get("n_records", 0),
                "feature_names": scorer.metadata.get("feature_names", []),
                "n_features": scorer.metadata.get("n_features", 0),
                "metrics": scorer.metadata.get("metrics", {}),
                "feature_importance": scorer.metadata.get("feature_importance", {}),
                "grade_thresholds": scorer.metadata.get("grade_thresholds", {}),
                "tier_thresholds": scorer.metadata.get("tier_thresholds", {}),
                "pd_decision_thresholds": {
                    "approve": "PD < 0.20",
                    "review": "0.20 <= PD < 0.40",
                    "reject": "PD >= 0.40",
                },
                "score_range": {"min": 300, "max": 850},
                "score_formula": "credit_score = 300 + (1 - PD) × 550",
                "tiers": {
                    "Platinum": "score >= 800",
                    "Gold": "700 <= score < 800",
                    "Silver": "600 <= score < 700",
                    "Basic": "score < 600",
                },
            },
        })

    # ── Retrain ───────────────────────────────────────────────────────────
    @app.route("/api/model/retrain", methods=["POST"])
    def retrain():
        """Retrain the PD model (admin only in production)."""
        try:
            from train_model import train_model
            model, scaler, metadata = train_model()
            scorer._load_model()
            return jsonify({
                "success": True,
                "message": "PD model retrained successfully",
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
    print(f"\n[AIScore] PD Service starting on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
