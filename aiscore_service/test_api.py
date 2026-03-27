"""Quick test script for AIScore FastAPI (VNĐ context)."""
import requests
import json

BASE = "http://localhost:8001"


def test_case(label, payload):
    print("=" * 60)
    print(f"  {label}")
    print("=" * 60)
    r = requests.post(f"{BASE}/api/score", json=payload)
    if r.status_code != 200:
        print(f"  ERROR {r.status_code}: {r.text}")
        print()
        return
    d = r.json()
    print(f"  ai_risk_score:      {d['ai_risk_score']}")
    print(f"  default_probability: {d['default_probability']}")
    print(f"  status:             {d['status']}")
    print()


# VNĐ rate = 25,000
RATE = 25_000

# Test 1: Khách hàng tốt (rủi ro thấp)
test_case("TEST 1: Khách tốt — Lương cao, ít nợ", {
    "credit_score": 680,
    "capital": 10_000 * RATE,           # $10K → 250M VNĐ
    "monthly_income": (120_000 / 12) * RATE,  # $10K/tháng → 250M
    "monthly_pay": 310 * RATE,          # $310 → 7.75M
    "revolving_balance": 5_000 * RATE,
    "dti": 8.5,
    "revolving_util_percent": 15.0,
    "term_months": 36,
    "emp_length_years": 10,
    "active_bad_debts": 0,
    "bankruptcies": 0,
    "active_loans": 2,
    "total_loans_history": 12,
    "home_ownership": "OWN",
    "loan_purpose": "debt_consolidation",
})

# Test 2: Khách trung bình (rủi ro trung bình)
test_case("TEST 2: Khách trung bình — Lương TB, nợ vừa", {
    "credit_score": 480,
    "capital": 20_000 * RATE,
    "monthly_income": (55_000 / 12) * RATE,
    "monthly_pay": 693 * RATE,
    "revolving_balance": 18_000 * RATE,
    "dti": 22.0,
    "revolving_util_percent": 65.0,
    "term_months": 36,
    "emp_length_years": 3,
    "active_bad_debts": 0,
    "bankruptcies": 0,
    "active_loans": 3,
    "total_loans_history": 8,
    "home_ownership": "RENT",
    "loan_purpose": "credit_card",
})

# Test 3: Khách rủi ro cao
test_case("TEST 3: Khách xấu — Nợ nhiều, lương thấp", {
    "credit_score": 280,
    "capital": 35_000 * RATE,
    "monthly_income": (30_000 / 12) * RATE,
    "monthly_pay": 1_400 * RATE,
    "revolving_balance": 45_000 * RATE,
    "dti": 35.0,
    "revolving_util_percent": 95.0,
    "term_months": 60,
    "emp_length_years": 0.5,
    "active_bad_debts": 2,
    "bankruptcies": 1,
    "active_loans": 5,
    "total_loans_history": 6,
    "home_ownership": "RENT",
    "loan_purpose": "small_business",
})

# Test 4: Khách Việt Nam thực tế
test_case("TEST 4: Khách VN — Vay 50 triệu, lương 15 triệu", {
    "credit_score": 550,
    "capital": 50_000_000,
    "monthly_income": 15_000_000,
    "monthly_pay": 2_500_000,
    "revolving_balance": 10_000_000,
    "dti": 16.7,
    "revolving_util_percent": 40.0,
    "term_months": 24,
    "emp_length_years": 5,
    "active_bad_debts": 0,
    "bankruptcies": 0,
    "active_loans": 1,
    "total_loans_history": 3,
    "home_ownership": "RENT",
    "loan_purpose": "other",
})

# Test 5: Batch scoring
print("=" * 60)
print("  TEST 5: Batch scoring (3 applicants)")
print("=" * 60)
r = requests.post(f"{BASE}/api/score/batch", json={
    "applicants": [
        {
            "credit_score": 700,
            "capital": 100_000_000,
            "monthly_income": 30_000_000,
            "monthly_pay": 5_000_000,
            "dti": 10.0,
            "term_months": 36,
        },
        {
            "credit_score": 400,
            "capital": 200_000_000,
            "monthly_income": 12_000_000,
            "monthly_pay": 8_000_000,
            "dti": 35.0,
            "term_months": 60,
        },
        {
            "credit_score": 250,
            "capital": 500_000_000,
            "monthly_income": 8_000_000,
            "monthly_pay": 15_000_000,
            "dti": 60.0,
            "term_months": 60,
            "active_bad_debts": 3,
            "bankruptcies": 1,
        },
    ]
})
if r.status_code == 200:
    batch = r.json()["data"]
    print(f"  Summary: {json.dumps(batch['summary'], indent=4)}")
else:
    print(f"  ERROR {r.status_code}: {r.text}")
print()

# Test 6: Health check
print("=" * 60)
print("  TEST 6: Health Check")
print("=" * 60)
r = requests.get(f"{BASE}/api/health")
print(f"  {json.dumps(r.json(), indent=4)}")
print()

# Test 7: Exchange rate
print("=" * 60)
print("  TEST 7: Exchange Rate")
print("=" * 60)
r = requests.get(f"{BASE}/api/exchange-rate")
print(f"  {json.dumps(r.json(), indent=4)}")
