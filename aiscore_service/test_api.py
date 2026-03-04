"""Quick test script for AIScore PD API."""
import requests
import json

BASE = "http://localhost:8001"


def test_case(label, payload):
    print("=" * 60)
    print(f"  {label}")
    print("=" * 60)
    r = requests.post(f"{BASE}/api/score", json=payload)
    d = r.json()["data"]
    print(f"  PD:           {d['pd']}")
    print(f"  Credit Score: {d['credit_score']}")
    print(f"  Grade:        {d['grade']} ({d['sub_grade']})")
    print(f"  Tier:         {d['tier']}")
    print(f"  Decision:     {d['decision']}")
    print(f"  Risk Level:   {d['risk_level']}")
    print(f"  Formula:      {d['details']['score_formula']}")
    if d["risk_factors"]:
        print(f"  Risk Factors:")
        for f in d["risk_factors"]:
            print(f"    [{f['impact'].upper():>8}] {f['message_en']}")
    print()


# Test 1: Good borrower (low risk)
test_case("TEST 1: Good borrower (low risk)", {
    "loan_amnt": 10000,
    "int_rate": 7.5,
    "installment": 310,
    "annual_inc": 120000,
    "dti": 8.5,
    "open_acc": 12,
    "revol_bal": 5000,
    "revol_util": 15.0,
    "total_acc": 30,
    "term": "36 months",
    "emp_length": "10+ years",
    "home_ownership": "OWN",
    "purpose": "debt_consolidation",
    "pub_rec": 0,
    "mort_acc": 3,
    "credit_history_years": 20,
})

# Test 2: Average borrower (medium risk)
test_case("TEST 2: Average borrower (medium risk)", {
    "loan_amnt": 20000,
    "int_rate": 15.0,
    "installment": 693,
    "annual_inc": 55000,
    "dti": 22.0,
    "open_acc": 8,
    "revol_bal": 18000,
    "revol_util": 65.0,
    "total_acc": 15,
    "term": "36 months",
    "emp_length": "3 years",
    "home_ownership": "RENT",
    "purpose": "credit_card",
})

# Test 3: Risky borrower (high risk)
test_case("TEST 3: Risky borrower (high risk)", {
    "loan_amnt": 35000,
    "int_rate": 25.0,
    "installment": 1400,
    "annual_inc": 30000,
    "dti": 35.0,
    "open_acc": 3,
    "revol_bal": 45000,
    "revol_util": 95.0,
    "total_acc": 5,
    "term": "60 months",
    "emp_length": "< 1 year",
    "home_ownership": "RENT",
    "purpose": "small_business",
    "pub_rec": 2,
    "pub_rec_bankruptcies": 1,
})

# Test 4: Batch scoring
print("=" * 60)
print("  TEST 4: Batch scoring (3 applicants)")
print("=" * 60)
r = requests.post(f"{BASE}/api/score/batch", json={
    "applicants": [
        {"loan_amnt": 5000, "int_rate": 6.0, "installment": 152, "annual_inc": 90000, "dti": 5.0, "term": "36 months"},
        {"loan_amnt": 15000, "int_rate": 14.0, "installment": 513, "annual_inc": 50000, "dti": 20.0, "term": "36 months"},
        {"loan_amnt": 30000, "int_rate": 22.0, "installment": 780, "annual_inc": 35000, "dti": 40.0, "term": "60 months"},
    ]
})
batch = r.json()["data"]
print(f"  Summary: {json.dumps(batch['summary'], indent=4)}")
print()

# Test 5: Model info
print("=" * 60)
print("  TEST 5: Model info")
print("=" * 60)
r = requests.get(f"{BASE}/api/model/info")
info = r.json()["data"]
print(f"  Model:    {info['model_type']}")
print(f"  Data:     {info['data_source']} ({info['n_records']:,} records)")
print(f"  Features: {info['n_features']}")
print(f"  AUC-ROC:  {info['metrics']['auc_roc']}")
print(f"  CV AUC:   {info['metrics']['cv_auc_mean']} ± {info['metrics']['cv_auc_std']}")
print(f"  Score formula: {info['score_formula']}")
print(f"  Tiers: {json.dumps(info['tiers'], indent=4)}")
