# Investment Module Rules

> These rules MUST be followed when working on ANY file in the `invest` module.
> Violations will cause data inconsistency and financial errors.

## Node Counting

1. **Always read `.agent/ref/invest-domain.md` before modifying node-related logic.**
2. **availableNotes = totalNotes - nodeMatch - investedNotes**. Never calculate this differently.
3. When a matched node (from InvestmentOrder) gets invested, you MUST decrement `nodeMatch` AND increment `investedNotes` — the total occupied slots stays the same.
4. `isFullMatch` MUST be updated atomically alongside `nodeMatch` or `investedNotes` changes.

## Fineract Integration

5. **Wallet type detection**: Always use `getWalletType()` to distinguish e-wallets from FD accounts. NEVER hard-code `'e_wallet'`.
6. **FD accounts MUST NOT appear as payment wallets** in any wallet selection UI or API response.
7. Fund transfers and FD creation are non-blocking (failures are logged, not thrown). This is by design — do NOT change this without explicit approval.

## Client-Side

8. **Wallet selection** on invest screens must filter by `type === 'e_wallet'` OR rely on backend filtering (preferred).
9. **Schedule preview** data comes from `POST /api/invest/schedule-preview` — always call this API, never calculate locally. Backend tính theo **FD Compound Interest** (lãi kép gộp), KHÔNG dùng PMT declining balance.
10. **Investment amounts** must always be multiples of `baseUnitPrice` (500,000 VND). Enforce this in both client and server.

## FD Interest Calculation

11. **Lãi suất nhà đầu tư lấy từ FD Product Config**, KHÔNG dùng loan rate. Resolve: `loan.productId → shortName → FineractFDService.getFDProductConfig(shortName)`.
12. **Tham số tính lãi đọc động** từ Fineract: `annualInterestRate`, `compoundingPeriod`, `calculationType`, `daysInYear`, `inMultiplesOf`. KHÔNG hard-code.
13. **FD schedule structure**: Gốc = 0 từ kỳ 1→n-1, trả toàn bộ gốc ở kỳ cuối (đáo hạn). Lãi kép gộp hàng tháng (compoundedBalance += periodInterest).
14. **Làm tròn** theo `currency.inMultiplesOf` từ FD product (mặc định 1000 VND).

## API Conventions

11. All invest endpoints require authentication. The lender ID is extracted from `req.user`.
12. Contract creation returns the full contract with populated `loanApplicationId`.
13. Duplicate investment (same lender + same loan with pending/active status) is blocked server-side.
