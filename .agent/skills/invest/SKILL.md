---
name: invest
description: Expert guidance for implementing and debugging the P2P investment module — node matching, contract creation, schedule preview, and Fineract FD integration.
---

# Investment Module Expert

You are an expert in the P2P Lending investment system. You help developers implement, debug, and extend the investment module with correct node counting, Fineract integration, and financial calculations.

## Before Any Work

You MUST read these references before making changes:

1. **Domain Model** — `view_file d:\Project\p2p-do-an\.agent\ref\invest-domain.md`
2. **Architecture** — `view_file d:\Project\p2p-do-an\.agent\ref\invest-architecture.md`
3. **Rules** — `view_file d:\Project\p2p-do-an\.agent\ref\invest-rules.md`

## Core Competencies

### 1. Node Counting
- Understand the 3 node types: `totalNotes`, `nodeMatch` (reserved), `investedNotes` (funded)
- Apply counting rules: same-person match→invest = 1 slot, different-person = 2 slots
- Verify invariant: `availableNotes = totalNotes - nodeMatch - investedNotes >= 0`

### 2. Investment Contracts
- Direct investment flow: validate → create contract → transfer funds → create FD
- Order-based investment: create order → auto-match → invest matched nodes
- Schedule calculation: scale borrower schedule by `investCapital / loanCapital`

### 3. Fineract Integration
- Wallet type detection via `depositType.id` (100=savings, 200=FD, 300=recurring)
- FD product resolution: `loanProduct.shortName` → matching FD product
- Fund transfers between savings accounts via `/accounttransfers`

### 4. Client-Side Screens
- `AvailableLoansScreen.tsx` — Loan listing with availability indicators
- `InvestmentFlowScreen.tsx` — Multi-step investment wizard
- `SchedulePreviewScreen.tsx` — Lender schedule visualization
- `InvestmentContractDetailScreen.tsx` — Contract details with schedule

## Workflow Reference

Follow the investment workflow: `view_file d:\Project\p2p-do-an\.agent\workflows\invest.md`

## Key Files

### Backend
| File | Purpose |
|------|---------|
| `invest.service.ts` | Order CRUD, auto-matching, available loans query |
| `invest-payment.service.ts` | Full payment pipeline with Fineract |
| `investment-contract.service.ts` | Contract CRUD, schedule calculation, preview |
| `matching.service.ts` | Purpose matching, node math |
| `fineract-savings.service.ts` | Wallet operations, type detection |
| `fineract-fd.service.ts` | Fixed Deposit CRUD |

### Client
| File | Purpose |
|------|---------|
| `features/invest/screens/AvailableLoansScreen.tsx` | Loan listing |
| `features/invest/screens/InvestmentFlowScreen.tsx` | Investment wizard |
| `features/invest/services/invest.service.ts` | API client |
| `features/wallet/api/wallet.api.ts` | Wallet API client |

## Common Pitfalls

1. **FD showing as wallet** — `getWalletType()` must check `depositType.id`, not just return `'e_wallet'`
2. **Double counting nodes** — When investing from an order, must adjust both `nodeMatch` and `investedNotes`
3. **Schedule mismatch** — Always use FD product rate for lender, not borrower's loan rate
4. **Transfer failure silent** — Fund transfers don't throw on failure. Check logs for `Fund transfer failed:`
5. **Race condition** — Use atomic `findOneAndUpdate` with `$expr` for concurrent matching
