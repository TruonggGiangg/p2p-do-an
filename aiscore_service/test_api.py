"""Quick test script for AIScore FastAPI v8.0 (25 features — XGBoost + LR Scorecard)."""
import requests
import json

BASE = "http://localhost:8001"

# VND rate = 25,000
RATE = 25_000


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
    print(f"  ai_risk_score:       {d['ai_risk_score']}")
    print(f"  default_probability: {d['default_probability']}")
    print(f"  status:              {d['status']}")
    print()


# Test 1: Khach hang tot (rui ro thap)
test_case("TEST 1: Khach tot — Luong cao, it no, lau nam", {
    "credit_score": 700,
    "capital": 10_000 * RATE,                # $10K → 250M VND
    "monthly_income": 10_000 * RATE,         # $10K/thang → 250M VND
    "monthly_pay": 300 * RATE,               # $300/thang
    "revolving_balance": 5_000 * RATE,       # $5K du no quay vong
    "total_current_balance": 15_000 * RATE,  # $15K tong du no
    "dti": 8.5,
    "revolving_util_percent": 15.0,
    "emp_length_years": 10,
    "active_bad_debts": 0,
    "bankruptcies": 0,
    "active_loans": 8,
    "total_loans_history": 25,
    "credit_history_months": 240,
    "recent_inquiries": 0,
    "delinquencies_2yr": 0,
    "accounts_delinquent": 0,
    "severe_delinquencies_24m": 0,
    "pct_never_delinquent": 100.0,
    "collections_12m": 0,
    "term": 36,
    "home_ownership": "OWN",
    "verification_status": "Verified",
    "purpose": "debt_consolidation",
})

# Test 2: Khach trung binh (rui ro trung binh)
test_case("TEST 2: Khach trung binh — Luong TB, no vua", {
    "credit_score": 520,
    "capital": 20_000 * RATE,                # $20K → 500M VND
    "monthly_income": 4_500 * RATE,          # $4.5K/thang
    "monthly_pay": 600 * RATE,               # $600/thang
    "revolving_balance": 12_000 * RATE,      # $12K du no
    "total_current_balance": 35_000 * RATE,  # $35K tong du no
    "dti": 22.0,
    "revolving_util_percent": 55.0,
    "emp_length_years": 3,
    "active_bad_debts": 0,
    "bankruptcies": 0,
    "active_loans": 5,
    "total_loans_history": 14,
    "credit_history_months": 96,
    "recent_inquiries": 2,
    "delinquencies_2yr": 0,
    "accounts_delinquent": 0,
    "severe_delinquencies_24m": 0,
    "pct_never_delinquent": 85.0,
    "collections_12m": 0,
    "term": 36,
    "home_ownership": "RENT",
    "verification_status": "Source Verified",
    "purpose": "credit_card",
})

# Test 3: Khach rui ro cao
test_case("TEST 3: Khach xau — No nhieu, luong thap, co pha san", {
    "credit_score": 300,
    "capital": 35_000 * RATE,                # $35K → 875M VND
    "monthly_income": 2_500 * RATE,          # $2.5K/thang
    "monthly_pay": 1_000 * RATE,             # $1K/thang
    "revolving_balance": 25_000 * RATE,      # $25K du no
    "total_current_balance": 80_000 * RATE,  # $80K tong du no
    "dti": 35.0,
    "revolving_util_percent": 90.0,
    "emp_length_years": 0.5,
    "active_bad_debts": 2,
    "bankruptcies": 1,
    "active_loans": 3,
    "total_loans_history": 8,
    "credit_history_months": 36,
    "recent_inquiries": 5,
    "delinquencies_2yr": 3,
    "accounts_delinquent": 2,
    "severe_delinquencies_24m": 3,
    "pct_never_delinquent": 40.0,
    "collections_12m": 2,
    "term": 60,
    "home_ownership": "RENT",
    "verification_status": "Not Verified",
    "purpose": "small_business",
})

# Test 4: Khach Viet Nam thuc te
test_case("TEST 4: Khach VN — Vay 50 trieu, luong 15 trieu/thang", {
    "credit_score": 500,
    "capital": 50_000_000,                   # 50 trieu VND
    "monthly_income": 15_000_000,            # 15 trieu/thang
    "monthly_pay": 2_500_000,                # 2.5 trieu/thang
    "revolving_balance": 10_000_000,         # 10 trieu du no
    "total_current_balance": 25_000_000,     # 25 trieu tong du no
    "dti": 16.7,
    "revolving_util_percent": 40.0,
    "emp_length_years": 5,
    "active_bad_debts": 0,
    "bankruptcies": 0,
    "active_loans": 2,
    "total_loans_history": 5,
    "credit_history_months": 60,
    "recent_inquiries": 1,
    "delinquencies_2yr": 0,
    "accounts_delinquent": 0,
    "severe_delinquencies_24m": 0,
    "pct_never_delinquent": 100.0,
    "collections_12m": 0,
    "term": 24,
    "home_ownership": "RENT",
    "verification_status": "Verified",
    "purpose": "other",
})

# Test 5: Batch scoring
print("=" * 60)
print("  TEST 5: Batch scoring (3 applicants)")
print("=" * 60)
r = requests.post(f"{BASE}/api/score/batch", json={
    "applicants": [
        {
            "credit_score": 680,
            "capital": 100_000_000,
            "monthly_income": 40_000_000,
            "monthly_pay": 5_000_000,
            "revolving_balance": 30_000_000,
            "total_current_balance": 50_000_000,
            "dti": 10.0,
            "revolving_util_percent": 20.0,
            "emp_length_years": 8,
            "active_bad_debts": 0,
            "bankruptcies": 0,
            "active_loans": 10,
            "total_loans_history": 20,
            "credit_history_months": 180,
            "recent_inquiries": 0,
            "delinquencies_2yr": 0,
            "accounts_delinquent": 0,
            "severe_delinquencies_24m": 0,
            "pct_never_delinquent": 100.0,
            "collections_12m": 0,
            "term": 36,
            "home_ownership": "MORTGAGE",
            "verification_status": "Verified",
            "purpose": "home_improvement",
        },
        {
            "credit_score": 380,
            "capital": 200_000_000,
            "monthly_income": 12_000_000,
            "monthly_pay": 8_000_000,
            "revolving_balance": 80_000_000,
            "total_current_balance": 150_000_000,
            "dti": 35.0,
            "revolving_util_percent": 70.0,
            "emp_length_years": 2,
            "active_bad_debts": 1,
            "bankruptcies": 0,
            "active_loans": 4,
            "total_loans_history": 10,
            "credit_history_months": 48,
            "recent_inquiries": 4,
            "delinquencies_2yr": 1,
            "accounts_delinquent": 1,
            "severe_delinquencies_24m": 1,
            "pct_never_delinquent": 60.0,
            "collections_12m": 0,
            "term": 60,
            "home_ownership": "RENT",
            "verification_status": "Not Verified",
            "purpose": "credit_card",
        },
        {
            "credit_score": 200,
            "capital": 500_000_000,
            "monthly_income": 8_000_000,
            "monthly_pay": 15_000_000,
            "revolving_balance": 150_000_000,
            "total_current_balance": 400_000_000,
            "dti": 60.0,
            "revolving_util_percent": 95.0,
            "emp_length_years": 0.5,
            "active_bad_debts": 3,
            "bankruptcies": 1,
            "active_loans": 2,
            "total_loans_history": 6,
            "credit_history_months": 24,
            "recent_inquiries": 6,
            "delinquencies_2yr": 4,
            "accounts_delinquent": 2,
            "severe_delinquencies_24m": 4,
            "pct_never_delinquent": 30.0,
            "collections_12m": 3,
            "term": 60,
            "home_ownership": "RENT",
            "verification_status": "Not Verified",
            "purpose": "small_business",
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
