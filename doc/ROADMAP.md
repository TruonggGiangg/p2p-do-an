# ROADMAP.md - Lộ Trình Phát Triển

> **Trạng thái hiện tại**: Tập trung phát triển tính năng **Đối Soát P2P (Reconciliation)**.

## 🎯 Mục Tiêu Ngắn Hạn (Current Sprint)

### Tính Năng: Đối Soát & Đồng Bộ Fineract
Mục tiêu: Đảm bảo số liệu giữa P2P App và Core Banking (Fineract) khớp nhau 100%.

#### Các hạng mục công việc (Action Items)
- [ ] **Data Model Audit**:
    - [ ] Tạo `TransactionLog` schema trong NestJS (Lưu loại giao dịch, ID Fineract, số tiền, status).
- [ ] **Port Logic Reconciliation**:
    - [ ] Tạo `src/reconciliation/reconciliation.service.ts`.
    - [ ] Implement `getFixedDepositsByLoan`.
    - [ ] Implement `reconcileLoan` (So khớp InvestmentCapital vs FixedDepositBalance).
- [ ] **Cron Job Đồng Bộ**:
    - [ ] Cài đặt `@nestjs/schedule`.
    - [ ] Tạo Job quét Loan status `SUBMITTED`/`APPROVED` để đồng bộ với Fineract.
- [ ] **UI Integration**:
    - [ ] API trả về lịch sử đối soát cho Admin Dashboard.

## 🔮 Kế Hoạch Dài Hạn (Backlog)
*   Tối ưu hóa Smart Contract để lưu Proof of Reconciliation.
*   Cải thiện UI Repayment Flow trên Mobile.

---
*Được khởi tạo từ `kehoach.txt`*
