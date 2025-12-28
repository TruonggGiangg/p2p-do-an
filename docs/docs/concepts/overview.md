---
sidebar_position: 1
title: P2P Model Overview
---

# The P2P Lending Model

## How it Works
Unlike a bank that lends its own money, our P2P Platform acts as a pure matchmaker. We connect:
*   **Borrowers** needing capital for education or business.
*   **Investors** looking for higher returns than savings accounts.

## The Trust Problem
In a traditional P2P model, if the platform goes bankrupt, lenders lose money. We solve this with the **Trust Account (Escrow)** model.

### Escrow Mechanism
1.  **Segregation**: User funds are NEVER held in the Platform's operation account.
2.  **Escrow**: Funds are held in a dedicated Fineract Savings Account labeled "Escrow".
3.  **Atomic Transfers**: Money only moves when a Loan Contract is fully matched and signed on the Blockchain.

## Role of Blockchain
We use **Hyperledger Fabric** to enforce:
*   **Immutability**: Once a loan is disbursed, its terms cannot be changed by the Admin.
*   **Smart Contracts**: Interest rates and repayment schedules are fixed by code, not human decision.

## Double-Entry Ledger
The system maintains two sources of truth:
1.  **Fineract**: The "Bank", tracking actual account balances (Cash).
2.  **MongoDB/Blockchain**: The "Business", tracking Agreements (Obligations).

The **Reconciliation Service** runs continuously to ensure Cash == Obligations.
