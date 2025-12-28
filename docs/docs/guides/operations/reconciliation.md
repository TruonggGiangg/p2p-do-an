---
sidebar_position: 1
title: Reconciliation & Settlement
description: How the platform reconciles Fineract transactions with P2P context.
---

# Reconciliation & Settlement

The **Reconciliation Service** (`FDReconciliationService`) is the bridge between the Core Banking Engine (Fineract) and the P2P Business Logic. It ensures that every movement of money is accounted for and correctly labeled for the end user.

## Overview

In a P2P system, "Cash" (in Fineract) must always match "Obligations" (in P2P Contracts). Reconciliation involves:
1.  Fetching raw transactions from Fineract.
2.  Fetching audit logs from MongoDB (`TransactionLog`).
3.  **Matching** them to assign a user-friendly Vietnamese label (e.g., "Phân phối gốc & lãi").
4.  Calculating the **Admin Profit** (Spread).

## Transaction Matching Logic

One of the complex challenges in Fineract integration is that *Transfer IDs* (API response) often differ from *Savings Transaction IDs* (Account view). To solve this, we use a multi-tiered matching strategy.

### 1. Strict Matching (ID Match)
The system first attempts to match a Fineract transaction using exact IDs:
*   **Transaction ID**: The ID specific to the savings account entry.
*   **Transfer ID**: The ID of the transfer operation (if available).

If a `TransactionLog` in MongoDB matches either of these IDs, it is linked immediately.

### 2. Fuzzy Matching (Fallback)
:::info New Feature
Introduced to handle missing "Phân phối" logs where Fineract returns inconsistent IDs.
:::

If exact matching fails, the system executes a **Fuzzy Match** algorithm to find "orphaned" logs. A log is considered a match if:

1.  **Amount** is identical (or within negligible floating-point difference).
2.  **Date** is the same (checked against `createdAt` timestamp).
3.  **Type Constraint**:
    *   **Withdrawals** (Money Out) can match `DISTRIBUTION` or `DISBURSE` logs.
    *   **Deposits** (Money In) can match `REPAY` or `FD_RETURN` logs.

This ensures that even if Fineract changes its ID scheme, critical transactions like **"Phân phối gốc & lãi"** still appear correctly in the UI.

## Profit Calculation (Admin Spread)

The Admin's profit is NOT a separate transfer. It is the **residual spread** left in the Escrow Account after all obligations are met.

The formula used in the Reconciliation Report is:

```typescript
Lợi Nhuận (Profit) = Total Borrower Repayment 
                     - Total Distributed to Lenders 
                     - FD Capital Returns 
                     - Original Disbursement
```

### Why this formula?
*   **Total Borrower Repayment**: All money coming IN from borrowers.
*   **Total Distributed**: All money going OUT to lenders (Interest).
*   **FD Capital Returns**: Money returned to lenders (Principal).
*   **Original Disbursement**: Money sent to borrowers (Principal).

The remaining balance is the **Net Interest Margin (NIM)** that the Admin earns.

## Transaction Labels (Vocab)

The UI displays these standardized labels based on `p2pContext`:

| Code | Vietnamese Label | Meaning |
|------|------------------|---------|
| `INVEST` | **Đầu tư vào khoản vay** | Lender funding a loan. |
| `ESCROW_TRANSFER` | **Ký quỹ đầu tư** | Moving funds to Escrow. |
| `DISBURSE` | **Giải ngân** | Sending money to Borrower. |
| `REPAY` | **Người vay trả nợ** | Borrower paying back. |
| `FD_CLOSE` | **Hoàn vốn FD** | Returning original capital to Lender. |
| `DISTRIBUTION` | **Phân phối gốc & lãi** | Paying interest to Lender. |

## Troubleshooting

### Missing "Phân phối" Log?
If a transaction appears as "Giao dịch hệ thống" instead of "Phân phối gốc & lãi":
1.  Check the **Log Time**: Was the MongoDB log created on the *same day* as the Fineract transaction?
2.  Check the **Amount**: Is the distributed amount exactly what Fineract shows?
3.  **Fuzzy Match** requires both condition 1 & 2 to be true.
