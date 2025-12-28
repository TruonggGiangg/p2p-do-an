---
sidebar_position: 3
title: Transaction Types Reference
description: Chi tiết về các loại giao dịch và TransactionLog schema
---

# Transaction Types Reference

## TransactionLog Schema

```typescript
interface TransactionLog {
  transactionId: string;        // TXN_{TYPE}_{timestamp}
  transactionType: TransactionType;
  fineractTransactionId?: number;
  fineractLoanId?: number;
  fineractSavingsAccountId?: number;
  fineractFixedDepositAccountId?: number;
  
  // Parties
  loanId?: string;              // MongoDB LoanContract ID
  lenderId?: string;            // Lender user ID
  borrowerId?: string;          // Borrower user ID
  
  // Amounts
  amount: number;
  principalPortion?: number;
  interestPortion?: number;
  feePortion?: number;
  
  // Status & Context
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  p2pContext?: string;          // Vietnamese label for UI
  
  // Audit
  createdAt: Date;
  metadata?: Record<string, any>;
}
```

---

## Transaction Types

### 1. LOAN_CREATION

**Khi nào:** Borrower tạo khoản vay mới

**Service:** `LoanService.createLoanAuto()`

**Logged by:** `TransactionLogService.logLoanCreation()`

```typescript
await this.transactionLogService.logLoanCreation({
  loanId: loanContract.contractId,
  borrowerId: user._id,
  capital: loanContract.info.capital,
  periodMonth: loanContract.info.periodMonth,
  rate: loanContract.info.rate,
  fineractLoanId: fineractLoanId,
  status: 'PENDING',
});
```

| Field | Example |
|-------|---------|
| `transactionId` | `TXN_LOAN_1766931895138` |
| `transactionType` | `LOAN_CREATION` |
| `fineractLoanId` | `147` |
| `amount` | `2000000` |
| `p2pContext` | `Tạo khoản vay [LOAN_xxx]` |

---

### 2. ESCROW_TRANSFER

**Khi nào:** Lender ký quỹ đầu tư (Lender → Escrow)

**Service:** `InvestService.createInvestment()`

**Logged by:** `TransactionLogService.logEscrowTransfer()`

```typescript
await this.transactionLogService.logEscrowTransfer({
  loanId: loanContract.contractId,
  lenderId: String(user._id),
  amount: investmentCapital,
  fineractTransactionId: Number(escrowTransferId)
});
```

| Field | Example |
|-------|---------|
| `transactionId` | `TXN_ESCROW_1766931963955` |
| `transactionType` | `ESCROW_TRANSFER` |
| `fineractTransactionId` | `385` |
| `amount` | `2000000` |
| `p2pContext` | `Ký quỹ đầu tư` |

---

### 3. FD_CREATE

**Khi nào:** Tạo Fixed Deposit cho Lender

**Service:** `FixedDepositService.createFixedDepositForLender()`

**Logged by:** `TransactionLogService.logFDTransfer()`

```typescript
await this.transactionLogService.logFDTransfer({
  type: 'CREATE',
  loanId: loanContract.contractId,
  lenderId: String(user._id),
  amount: investmentCapital,
  fineractFixedDepositAccountId: fdAccountId,
  interestRate: lenderRate,
  periodMonth: loanContract.info.periodMonth,
});
```

| Field | Example |
|-------|---------|
| `transactionId` | `TXN_FD_1766931964653` |
| `transactionType` | `FD_CREATE` |
| `fineractFixedDepositAccountId` | `79` |
| `amount` | `2000000` |
| `p2pContext` | `Gửi vào FD` |

---

### 4. INVEST

**Khi nào:** Xác nhận đầu tư thành công

**Service:** `InvestService.createInvestment()`

**Logged by:** `TransactionLogService.logInvestment()`

```typescript
await this.transactionLogService.logInvestment({
  loanId: loanContract.contractId,
  lenderId: String(user._id),
  investmentId: investment.contractId,
  amount: investmentCapital,
  notes: numNotes,
  fineractTransactionId: Number(escrowTransferId),
});
```

| Field | Example |
|-------|---------|
| `transactionId` | `TXN_INVEST_1766931964983` |
| `transactionType` | `INVEST` |
| `fineractTransactionId` | `385` |
| `amount` | `2000000` |
| `p2pContext` | `Lender đầu tư 2.000.000 VND` |

---

### 5. DISBURSE

**Khi nào:** Giải ngân cho Borrower (Escrow → Borrower)

**Service:** `InvestService.handleFullMatchDisbursement()`

**Logged by:** `TransactionLogService.logDisbursement()`

```typescript
await this.transactionLogService.logDisbursement({
  loanId: loanContract.contractId,
  borrowerId: loanContract.borrower.toString(),
  amount: capital,
  fineractTransactionId: transferResult.resourceId,
  fineractLoanId: fineractLoanId,
});
```

| Field | Example |
|-------|---------|
| `transactionId` | `TXN_DISBURSE_1766931965521` |
| `transactionType` | `DISBURSE` |
| `fineractTransactionId` | `388` |
| `fineractLoanId` | `147` |
| `amount` | `2000000` |
| `p2pContext` | `Giải ngân` |

---

### 6. REPAY

**Khi nào:** Borrower trả nợ (thường hoặc tất toán)

**Service:** `RepaymentController.prepayLoan()` / `RepaymentService.processRepayment()`

**Logged by:** `TransactionLogService.logRepayment()`

```typescript
await this.transactionLogService.logRepayment({
  loanId: loan.contractId,
  borrowerId: String(loan.borrowerId),
  amount: prepayAmount,
  principalPortion: prepayInfo.principalPortion,
  interestPortion: prepayInfo.interestPortion,
  fineractTransactionId: repaymentResult.resourceId,
  fineractLoanId: fineractLoanId,
});
```

| Field | Example |
|-------|---------|
| `transactionId` | `TXN_REPAY_1766931997732` |
| `transactionType` | `REPAY` |
| `amount` | `2153000` |
| `principalPortion` | `2000000` |
| `interestPortion` | `153000` |
| `p2pContext` | `Người vay trả nợ` |

---

### 7. FD_CLOSE

**Khi nào:** Đóng Fixed Deposit (hoàn vốn cho Lender)

**Service:** `RepaymentService.distributeRepaymentToLendersWithFD()`

**Logged by:** `TransactionLogService.logFDTransfer()`

```typescript
await this.transactionLogService.logFDTransfer({
  type: 'CLOSE',
  loanId: loan.contractId,
  lenderId: investment.lenderId,
  amount: fdAmount,
  fineractFixedDepositAccountId: fdAccountId,
});
```

| Field | Example |
|-------|---------|
| `transactionId` | `TXN_FD_1766931997197` |
| `transactionType` | `FD_CLOSE` |
| `fineractFixedDepositAccountId` | `79` |
| `amount` | `2000000` |
| `p2pContext` | `Hoàn vốn FD` |

---

### 8. DISTRIBUTION

**Khi nào:** Phân phối lãi cho Lender (Escrow → Lender)

**Service:** `RepaymentService.distributeRepaymentToLendersWithFD()`

**Logged by:** `TransactionLogService.logDistribution()`

```typescript
await this.transactionLogService.logDistribution({
  loanId: loan.contractId,
  lenderId: investment.lenderId,
  amount: lenderInterest,
  fineractTransactionId: transferResult.resourceId,
  type: 'INTEREST',
});
```

| Field | Example |
|-------|---------|
| `transactionId` | `TXN_DIST_1766931997471` |
| `transactionType` | `DISTRIBUTION` |
| `fineractTransactionId` | `392` |
| `amount` | `122482` |
| `p2pContext` | `Phân phối gốc & lãi cho nhà đầu tư` |

---

## p2pContext Labels Mapping

| Transaction Type | Vietnamese Label |
|------------------|------------------|
| `LOAN_CREATION` | Tạo khoản vay |
| `ESCROW_TRANSFER` | Ký quỹ đầu tư |
| `INVEST` | Đầu tư vào khoản vay |
| `FD_CREATE` | Gửi vào FD |
| `DISBURSE` | Giải ngân |
| `REPAY` | Người vay trả nợ |
| `FD_CLOSE` | Hoàn vốn FD |
| `DISTRIBUTION` | Phân phối gốc & lãi cho nhà đầu tư |

---

## Querying Transaction Logs

### Get all transactions for a loan

```typescript
const transactions = await this.transactionLogModel.find({
  loanId: 'LOAN_1766931894613'
}).sort({ createdAt: 1 });
```

### Get transactions with P2P context (Reconciliation API)

```bash
GET /reconciliation/loan/147/p2p-view
```

Response:
```json
{
  "loanId": "LOAN_1766931894613",
  "fineractLoanId": 147,
  "transactions": [
    {
      "id": "TXN_LOAN_xxx",
      "type": "LOAN_CREATION",
      "p2pLabel": "Tạo khoản vay",
      "amount": 2000000,
      "date": "2025-12-28T14:24:54.000Z"
    },
    // ... more transactions
  ],
  "summary": {
    "totalDisbursed": 2000000,
    "totalRepaid": 2153000,
    "totalDistributed": 122482,
    "adminSpread": 30518
  }
}
```
