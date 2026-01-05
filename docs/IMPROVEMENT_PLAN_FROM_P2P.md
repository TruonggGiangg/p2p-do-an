# 📋 Kế Hoạch Cải Thiện Dự Án P2P-DO-AN

> **Học từ p2p (Reference) để cải thiện p2p-do-an project**

---

## 🎯 Mục Tiêu Chính

1. **Fetch rounding từ Fineract** thay vì hardcode
2. **Thêm adjustSum utility** cho rounding correction
3. **Cải thiện prepayment API** với Fineract template
4. **Thêm VND safeguard** như p2p reference

---

## 1️⃣ Fetch Rounding Multiple từ Fineract

### File cần sửa:
📁 `server_do_an/src/loan/services/fineract.service.ts`

### Reference từ p2p:
- **File gốc:** `server/interators/services/FineractLoanService.js`
- **Function:** `getRoundingMultiple` (line 33-61)

### Thêm function mới:

```typescript
/**
 * Lấy bội số làm tròn từ Loan Product (VND: 1000)
 * Priority: installmentAmountInMultiplesOf > currency.inMultiplesOf > 1000
 * Học từ p2p: FineractLoanService.js line 33-61
 */
async getRoundingMultiple(): Promise<number> {
    // Cache to avoid repeated API calls
    if (this._roundingMultiple) return this._roundingMultiple;

    try {
        const product = await this.getLoanProductDetails();

        // Priority: installmentAmountInMultiplesOf > currency.inMultiplesOf > default 1000
        let rounding = product?.installmentAmountInMultiplesOf ||
                       product?.currency?.inMultiplesOf ||
                       1000;

        // VND safeguard: should never be 1
        if (product?.currency?.code === 'VND' && rounding === 1) {
            this.logger.warn('[FineractService] VND with rounding=1 detected, forcing to 1000');
            rounding = 1000;
        }

        this._roundingMultiple = rounding;
        return this._roundingMultiple;
    } catch (error) {
        this.logger.warn('[FineractService] Could not fetch rounding multiple, falling back to 1000');
        return 1000;
    }
}

private _roundingMultiple: number | null = null;
```

### Cập nhật invest.service.ts:

📁 `server_do_an/src/invest/invest.service.ts`
📍 **Line 957** (trong `calculateLenderScheduleForCreate`)

```typescript
// OLD (hardcoded):
const inMultiplesOf = 1000;

// ✅ NEW (fetch từ Fineract):
const inMultiplesOf = await this.fineractService.getRoundingMultiple();
```

---

## 2️⃣ Tạo RoundingUtils Module

### Tạo file mới:
📁 `server_do_an/src/utils/rounding.utils.ts`

### Reference từ p2p:
- **File gốc:** `server/utils/RoundingUtils.js`

```typescript
/**
 * Centralized Rounding Utilities for P2P Platform
 * Standard rounding rule: All monetary amounts are rounded to the nearest 1,000 VND.
 * Ported from p2p reference: utils/RoundingUtils.js
 */

export const DEFAULT_ROUNDING = 1000;

/**
 * Round a number to a specific currency multiple (default 1,000 VND)
 * @param amount - The numeric amount to round
 * @param inMultiplesOf - The rounding multiple (e.g., 1000)
 * @returns Rounded amount
 */
export function roundToCurrency(amount: number, inMultiplesOf: number = DEFAULT_ROUNDING): number {
    if (amount === undefined || amount === null || isNaN(amount)) return 0;
    const factor = inMultiplesOf || DEFAULT_ROUNDING;
    return Math.round(amount / factor) * factor;
}

/**
 * Tail adjustment: Ensure the sum of parts exactly equals the total
 * Useful for distributing repayments or splitting loan principal
 * 
 * Học từ p2p: RoundingUtils.js line 28-38
 * 
 * @param total - The target total sum
 * @param parts - Initial calculated parts (unrounded or rounded)
 * @param inMultiplesOf - The rounding multiple
 * @returns Adjusted parts with last element containing the diff
 */
export function adjustSum(total: number, parts: number[], inMultiplesOf: number = DEFAULT_ROUNDING): number[] {
    const roundedParts = parts.map(p => roundToCurrency(p, inMultiplesOf));
    const currentSum = roundedParts.reduce((a, b) => a + b, 0);
    const diff = total - currentSum;

    if (diff !== 0 && roundedParts.length > 0) {
        // Add difference to the last part (tail adjustment)
        roundedParts[roundedParts.length - 1] += diff;
    }

    return roundedParts;
}

/**
 * Distribute a total amount among multiple recipients proportionally
 * with proper rounding and tail adjustment
 * 
 * @param total - Total amount to distribute
 * @param ratios - Array of ratios (will be normalized)
 * @param inMultiplesOf - Rounding multiple
 * @returns Array of distributed amounts
 */
export function distributeProportionally(
    total: number, 
    ratios: number[], 
    inMultiplesOf: number = DEFAULT_ROUNDING
): number[] {
    const totalRatio = ratios.reduce((a, b) => a + b, 0);
    if (totalRatio === 0) return ratios.map(() => 0);

    const rawParts = ratios.map(r => total * (r / totalRatio));
    return adjustSum(total, rawParts, inMultiplesOf);
}
```

### Cập nhật import trong invest.service.ts:

📁 `server_do_an/src/invest/invest.service.ts`
📍 **Top of file**

```typescript
// ✅ NEW: Import từ centralized utils
import { roundToCurrency, adjustSum, distributeProportionally } from '../utils/rounding.utils';
```

📍 **Line 919-924** - Xóa private method (dùng centralized)
```typescript
// DELETE this method - use imported one
// private roundToCurrency(amount: number, inMultiplesOf: number): number {
//     return Math.round(amount / inMultiplesOf) * inMultiplesOf;
// }
```

---

## 3️⃣ Cải Thiện Prepayment với Fineract Template

### File cần sửa:
📁 `server_do_an/src/loan/services/fineract.service.ts`

### Reference từ p2p:
- **File gốc:** `server/interators/services/FineractLoanService.js`
- **Function:** `getPrepaymentAmount` (line 196-248)

### Thêm function mới:

```typescript
/**
 * Get Prepayment Amount from Fineract Template
 * Returns exact breakdown of principal, interest, fees for prepayment
 * 
 * Học từ p2p: FineractLoanService.js line 196-248
 */
async getPrepaymentAmount(loanId: number): Promise<{
    amount: number;
    principalPortion: number;
    interestPortion: number;
    penaltyPortion: number;
    feesPortion: number;
    date: string;
}> {
    try {
        this.logger.log(`[Fineract] Getting prepayment amount for loan ${loanId}`);

        // Command=prepayLoan template returns info about closing loan
        const url = `/loans/${loanId}/transactions/template?command=prepayLoan`;
        const response = await this.adminApi.get(url);

        this.logger.log(`[Fineract] Prepayment template:`, JSON.stringify(response.data, null, 2));

        return {
            amount: response.data.amount || 0,
            principalPortion: response.data.principalPortion || 0,
            interestPortion: response.data.interestPortion || 0,
            penaltyPortion: response.data.penaltyChargesPortion || 0,
            feesPortion: response.data.feeChargesPortion || 0,
            date: this.formatDateArray(response.data.date)
        };
    } catch (error) {
        this.logger.error('[Fineract] Error getting prepayment amount:', error.message);

        // Fallback to outstanding balance if prepayLoan command not supported
        if (error.response?.status === 400 || error.response?.status === 404) {
            this.logger.log('[Fineract] PrepayLoan command not supported, using outstanding balance...');
            const outstanding = await this.getOutstandingBalance(loanId);
            return {
                amount: outstanding.totalOutstanding,
                principalPortion: outstanding.principalOutstanding,
                interestPortion: outstanding.interestOutstanding,
                penaltyPortion: outstanding.penaltyOutstanding || 0,
                feesPortion: outstanding.feeOutstanding || 0,
                date: new Date().toISOString().split('T')[0]
            };
        }
        throw error;
    }
}

/**
 * Execute Prepayment on Fineract
 * Học từ p2p: FineractLoanService.js line 279-314
 */
async prepayLoan(
    loanId: number,
    transactionAmount: number,
    transactionDate: Date,
    note?: string
): Promise<any> {
    const formattedDate = this.formatDate(transactionDate);

    const payload = {
        transactionDate: formattedDate,
        transactionAmount,
        note: note || 'Prepayment',
        dateFormat: 'dd MMMM yyyy',
        locale: 'en'
    };

    try {
        const response = await this.adminApi.post(
            `/loans/${loanId}/transactions?command=prepayLoan`,
            payload
        );
        this.logger.log(`[Fineract] Prepayment successful for loan ${loanId}:`, response.data);
        return response.data;
    } catch (error) {
        this.logger.error(`[Fineract] Prepayment failed for loan ${loanId}:`, error.message);
        throw error;
    }
}
```

### Cập nhật LoanService:

📁 `server_do_an/src/loan/loan.service.ts`

#### Thêm method mới:

```typescript
/**
 * Get prepayment amount for early loan closure
 * Uses Fineract prepayLoan template for accurate breakdown
 */
async getPrepayAmount(loanId: string | number): Promise<any> {
    const fineractLoanId = await this.resolveFineractLoanId(String(loanId));
    if (!fineractLoanId) {
        throw new NotFoundException('Loan not found');
    }

    return this.fineractService.getPrepaymentAmount(fineractLoanId);
}
```

---

## 4️⃣ Thêm Prepayment Endpoint vào Controller

### File cần sửa:
📁 `server_do_an/src/loan/loan.controller.ts`

### Thêm route mới:

```typescript
/**
 * Get prepayment amount for a loan
 */
@Get(':id/prepay-amount')
@Roles('borrower', 'lender', 'admin')
async getPrepayAmount(
    @Param('id') id: string,
): Promise<any> {
    return this.loanService.getPrepayAmount(id);
}

/**
 * Execute prepayment (early loan closure)
 */
@Post(':id/prepay')
@Roles('borrower', 'admin')
async prepayLoan(
    @Param('id') id: string,
    @Body() body: { amount?: number },
    @CurrentUser() user: AuthUser,
): Promise<any> {
    // 1. Get prepayment details
    const prepayDetails = await this.loanService.getPrepayAmount(id);

    // 2. Use provided amount or full outstanding
    const amount = body.amount || prepayDetails.amount;

    // 3. Validate
    if (amount < prepayDetails.amount) {
        throw new BadRequestException('Amount must cover full outstanding balance');
    }

    // 4. Execute via repayment service
    return this.repaymentController.processPrepayment(id, {
        amount,
        interestPortion: prepayDetails.interestPortion
    });
}
```

---

## 5️⃣ Cập Nhật Repayment Controller

### File cần sửa:
📁 `server_do_an/src/repayment/repayment.controller.ts`

### Thêm method mới:

```typescript
/**
 * Process prepayment with exact interest from Fineract
 * Khác với repayment thường: dùng sumPendingPeriods thay vì getCurrentPeriod
 */
@Post(':loanId/prepay')
@Roles('borrower', 'admin')
async processPrepayment(
    @Param('loanId') loanId: string,
    @Body() body: { amount: number; interestPortion?: number },
): Promise<any> {
    const { amount, interestPortion } = body;
    const repaymentDate = new Date();

    // Call repayment service with isPrepayment flag
    return this.repaymentService.processRepayment(
        loanId,
        amount,
        repaymentDate,
        {
            isFinalPayment: true,
            interestPortion // Pass exact interest from Fineract template
        }
    );
}
```

---

## 6️⃣ Thêm LoanProductDetails Cache

### File cần sửa:
📁 `server_do_an/src/loan/services/fineract.service.ts`

### Reference từ p2p:
- **File gốc:** `server/interators/services/FineractLoanService.js`
- **Function:** `getLoanProductDetails` (line 15-31)

```typescript
private _loanProductCache: any = null;
private _loanProductCacheTime: number = 0;
private readonly CACHE_TTL_MS = 300000; // 5 minutes

/**
 * Get Loan Product Details with caching
 * Học từ p2p: FineractLoanService.js
 */
async getLoanProductDetails(): Promise<any> {
    const now = Date.now();

    // Return cached if still valid
    if (this._loanProductCache && (now - this._loanProductCacheTime) < this.CACHE_TTL_MS) {
        return this._loanProductCache;
    }

    try {
        const productId = this.configService.get('FINERACT_LOAN_PRODUCT_ID') || 1;
        const response = await this.adminApi.get(`/loanproducts/${productId}`);

        this._loanProductCache = response.data;
        this._loanProductCacheTime = now;

        return response.data;
    } catch (error) {
        this.logger.error('[Fineract] Error fetching loan product:', error.message);
        return null;
    }
}
```

---

## 📊 Tóm Tắt Files Cần Thay Đổi

| File | Action | Priority |
|------|--------|----------|
| `src/utils/rounding.utils.ts` | **Tạo mới** | 🔴 HIGH |
| `src/loan/services/fineract.service.ts` | Thêm 4 methods | 🔴 HIGH |
| `src/invest/invest.service.ts` | Dùng rounding từ utils | 🟡 MEDIUM |
| `src/loan/loan.service.ts` | Thêm getPrepayAmount | 🟡 MEDIUM |
| `src/loan/loan.controller.ts` | Thêm prepayment endpoints | 🟡 MEDIUM |
| `src/repayment/repayment.controller.ts` | Thêm processPrepayment | 🟡 MEDIUM |

---

## 🔗 Reference Files từ p2p

| p2p File | Line Numbers | What to Learn |
|----------|--------------|---------------|
| `utils/RoundingUtils.js` | 1-46 | roundToCurrency, adjustSum |
| `interators/services/FineractLoanService.js` | 33-61 | getRoundingMultiple |
| `interators/services/FineractLoanService.js` | 15-31 | getLoanProductDetails (cache) |
| `interators/services/FineractLoanService.js` | 196-248 | getPrepaymentAmount |
| `interators/services/FineractLoanService.js` | 279-314 | prepayLoan |

---

## ✅ Điểm Mạnh Hiện Tại của p2p-do-an (GIỮ NGUYÊN)

1. **lenderSchedule** - Đây là improvement lớn, p2p reference không có
2. **Distributed Accumulation Algorithm** - Đảm bảo rounding accuracy
3. **FD Tracking with Direct Distribution** - Model hiện đại
4. **TypeScript** - Type safety, better maintainability
5. **TransactionLogService** - p2pContext logging

---

*Document created: 2026-01-05*
