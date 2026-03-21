---
description: How to implement or modify investment features (node matching, contract creation, schedule preview)
---

# Investment Feature Workflow

## Prerequisites

Before making ANY changes to the investment module, you MUST:

1. **Read the domain reference** — `view_file .agent/ref/invest-domain.md`
2. **Read the architecture reference** — `view_file .agent/ref/invest-architecture.md`
3. **Understand the node counting rules** — especially Rule 1 (same person match→invest) vs Rule 2 (different person)

## Steps

### 1. Identify the scope of change

Determine which layer(s) are affected:

| Layer | Files | When to change |
|-------|-------|----------------|
| **Schema** | `schemas/investment-*.schema.ts` | Adding new fields or indexes |
| **Business Logic** | `invest.service.ts`, `investment-contract.service.ts` | Matching logic, calculations |
| **Payment** | `invest-payment.service.ts` | Fineract transfers, FD creation |
| **API** | `invest.controller.ts` | New endpoints, request/response format |
| **Client** | `features/invest/screens/*.tsx` | UI changes |
| **Client API** | `features/invest/services/invest.service.ts` | New API calls from client |

### 2. Verify node invariants

After ANY change that modifies `nodeMatch`, `investedNotes`, or `isFullMatch`, verify:

```
INVARIANT 1: availableNotes = totalNotes - nodeMatch - investedNotes >= 0
INVARIANT 2: isFullMatch = (nodeMatch + investedNotes >= totalNotes)
INVARIANT 3: A loan with isFullMatch=true MUST NOT appear in getAvailableLoans()
```

### 3. Test both investment paths

| Path | Entry Point | Creates |
|------|-------------|---------|
| **Direct invest** | `POST /api/invest/contract` | InvestmentContract + FD |
| **Order → match → invest** | `POST /api/invest/investment-order` → later invest matched nodes | InvestmentOrder → InvestmentContract + FD |

### 4. Verify Fineract side effects

After creating a contract, confirm:
- [ ] Fund transfer from lender wallet to platform escrow
- [ ] Fixed Deposit created with correct rate and period
- [ ] FD account does NOT appear in lender's wallet list (type = 'fixed_deposit')

### 5. Run the server

// turbo
```bash
cd d:\Project\p2p-do-an\server_do_an_new && npm run start:dev
```

### 6. Test via client

```bash
cd d:\Project\p2p-do-an\client_new && npx expo start
```
