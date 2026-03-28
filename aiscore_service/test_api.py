"""Quick test script for AIScore FastAPI v7 (14 features — Lending Club)."""
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
    print(f"  ai_risk_score:      {d['ai_risk_score']}")
    print(f"  default_probability: {d['default_probability']}")
    print(f"  status:             {d['status']}")
    print()


# Test 1: Khach hang tot (rui ro thap)
test_case("TEST 1: Khach tot — Luong cao, it no, 10+ years kinh nghiem", {
    "credit_score": 750,
    "loan_amnt": 10_000 * RATE,           # $10K → 250M VND
    "int_rate": 7.5,
    "annual_inc": 120_000 * RATE,          # $120K/year → 3B VND
    "dti": 8.5,
    "revol_util": 15.0,
    "open_acc": 8,
    "pub_rec": 0,
    "term": 36,
    "home_ownership": "OWN",
    "verification_status": "Verified",
    "purpose": "debt_consolidation",
    "emp_length": "10+ years",
})

# Test 2: Khach trung binh (rui ro trung binh)
test_case("TEST 2: Khach trung binh — Luong TB, no vua", {
    "credit_score": 650,
    "loan_amnt": 20_000 * RATE,            # $20K → 500M VND
    "int_rate": 13.5,
    "annual_inc": 55_000 * RATE,            # $55K/year
    "dti": 22.0,
    "revol_util": 55.0,
    "open_acc": 5,
    "pub_rec": 0,
    "term": 36,
    "home_ownership": "RENT",
    "verification_status": "Source Verified",
    "purpose": "credit_card",
    "emp_length": "3 years",
})

# Test 3: Khach rui ro cao
test_case("TEST 3: Khach xau — No nhieu, luong thap, co pha san", {
    "credit_score": 550,
    "loan_amnt": 35_000 * RATE,            # $35K → 875M VND
    "int_rate": 24.0,
    "annual_inc": 30_000 * RATE,            # $30K/year
    "dti": 35.0,
    "revol_util": 90.0,
    "open_acc": 3,
    "pub_rec": 2,
    "term": 60,
    "home_ownership": "RENT",
    "verification_status": "Not Verified",
    "purpose": "small_business",
    "emp_length": "< 1 year",
})

# Test 4: Khach Viet Nam thuc te
test_case("TEST 4: Khach VN — Vay 50 trieu, luong 15 trieu/thang", {
    "credit_score": 620,
    "loan_amnt": 50_000_000,               # 50 trieu VND
    "int_rate": 18.0,
    "annual_inc": 15_000_000 * 12,          # 15tr/thang → 180tr/nam
    "dti": 16.7,
    "revol_util": 40.0,
    "open_acc": 2,
    "pub_rec": 0,
    "term": 24,
    "home_ownership": "RENT",
    "verification_status": "Verified",
    "purpose": "other",
    "emp_length": "5 years",
})

# Test 5: Batch scoring
print("=" * 60)
print("  TEST 5: Batch scoring (3 applicants)")
print("=" * 60)
r = requests.post(f"{BASE}/api/score/batch", json={
    "applicants": [
        {
            "credit_score": 730,
            "loan_amnt": 100_000_000,
            "int_rate": 8.0,
            "annual_inc": 500_000_000,
            "dti": 10.0,
            "revol_util": 20.0,
            "open_acc": 10,
            "pub_rec": 0,
            "term": 36,
            "home_ownership": "MORTGAGE",
            "verification_status": "Verified",
            "purpose": "home_improvement",
            "emp_length": "8 years",
        },
        {
            "credit_score": 580,
            "loan_amnt": 200_000_000,
            "int_rate": 18.0,
            "annual_inc": 150_000_000,
            "dti": 35.0,
            "revol_util": 70.0,
            "open_acc": 4,
            "pub_rec": 1,
            "term": 60,
            "home_ownership": "RENT",
            "verification_status": "Not Verified",
            "purpose": "credit_card",
            "emp_length": "2 years",
        },
        {
            "credit_score": 500,
            "loan_amnt": 500_000_000,
            "int_rate": 28.0,
            "annual_inc": 100_000_000,
            "dti": 60.0,
            "revol_util": 95.0,
            "open_acc": 2,
            "pub_rec": 3,
            "term": 60,
            "home_ownership": "RENT",
            "verification_status": "Not Verified",
            "purpose": "small_business",
            "emp_length": "< 1 year",
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
