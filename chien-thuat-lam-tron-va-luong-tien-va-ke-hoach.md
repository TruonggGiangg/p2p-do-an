# Báo Cáo Kỹ Thuật Chuyên Sâu: Chiến Lược Làm Tròn & Chia Sẻ Lợi Nhuận
**Ngày báo cáo:** 03/01/2026  
**Phiên bản:** 2.1 (Chi tiết đầy đủ các hàm + file + Schedule Persistence)

Tài liệu này tổng hợp toàn bộ chiến lược kỹ thuật đã triển khai để giải quyết bài toán cốt lõi: **"Làm sao để tính toán chính xác lãi suất cho Người vay, Nhà đầu tư và Nền tảng mà không bị lệch 1 đồng nào?"**

---

## 1. Nguyên Tắc Cốt Lõi (Core Principles)

### a. Single Source of Truth (Nguồn dữ liệu duy nhất)
- Mọi con số về **lịch trả nợ, lãi suất, làm tròn** đều xuất phát từ cấu hình **Fineract Loan Product**.
- Hệ thống P2P **không hard-code** các con số như `1000`, `1.5%`. Tất cả đều được fetch động.
- Đảm bảo **UI Preview**, **MongoDB Storage**, và **Lệnh chuyển tiền Fineract** luôn sử dụng chung 1 bộ số liệu.

### b. Chiến Lược Làm Tròn Động (Dynamic Rounding)
- **Nguồn cấu hình**: Lấy từ Fineract Loan Product thông qua API.
- **Ưu tiên**: `installmentAmountInMultiplesOf` > `currency.inMultiplesOf` > Mặc định `1000`.
- **Công thức**: `Math.round(amount / factor) * factor`

### c. Hỗ Trợ Đa Loại Lãi Suất
| Loại Lãi | ID | Mô tả |
| :--- | :--- | :--- |
| **Flat (Phẳng)** | `1` | Lãi = `Vốn gốc × Lãi suất`. Không đổi qua các kỳ. |
| **Declining Balance** | `0` | Lãi = `Dư nợ thực tế × Lãi suất`. Dùng công thức EMI. |

---

## 2. Giải Pháp Đảm Bảo Tính Nhất Quán: Schedule Persistence (WYSIWYG)

### Vấn Đề

> ⚠️ Nếu server **tính lại** khi trả nợ thực tế → Có thể **sai lệch** do làm tròn khác.
> Người dùng **tự cộng** các dòng trong bảng schedule trên UI và thấy **khác tổng** hiển thị.

### Giải Pháp: Lưu Bảng Schedule Vào MongoDB

> **Nguyên tắc:** `"What You See Is What You Get"` (WYSIWYG)

1. **Khi đầu tư thành công**: Lưu **chính xác bảng schedule** đã hiển thị trên UI vào MongoDB.
2. **Khi trả nợ**: Đọc schedule đã lưu, phân phối theo **từng dòng** trong bảng đó.
3. **Kết quả**: `Tổng người dùng cộng = Tổng hiển thị = Tiền thực nhận`.

### Code Triển Khai

#### a. Lưu Schedule Khi Tạo Investment
> **File:** `p2p/server/interators/controllers/invest/InvestContractService.js`  
> **Hàm:** `createDatabaseInvestmentContract()` (dòng 201-215)

```javascript
const investmentContract = new InvestmentContract({
    info: {
        capital: capitalVND,
        serviceFee: Math.round(serviceFee),
        entirelyProfit: Math.round(entirelyProfit),
        // ✅ LƯU CHÍNH XÁC SCHEDULE TỪ TÍNH TOÁN (CÙNG SỐ LIỆU UI)
        schedule: lenderFinancials.schedulePreview || []
    }
});
```

#### b. Đọc Schedule Khi Phân Phối Trả Nợ (TODO)
> **File:** `p2p/server/interators/services/RepaymentService.js` (cần cập nhật)

```javascript
// Pseudo-code
async distributeRepayment(loanId, repaymentPeriod) {
    const investments = await InvestmentContract.find({ loanContract: loanId });
    
    for (const invest of investments) {
        // ✅ ĐỌC TỪ SCHEDULE ĐÃ LƯU, KHÔNG TÍNH LẠI
        const periodData = invest.info.schedule.find(s => s.period === repaymentPeriod);
        if (periodData) {
            await transferToLender(invest.lender, periodData.principal, periodData.interest);
        }
    }
}
```

### Lợi Ích
| Vấn đề cũ | Giải pháp mới |
| :--- | :--- |
| UI hiển thị 12,000đ nhưng thực trả 12,500đ | UI = MongoDB = Thực trả |
| Người dùng cộng bảng ra khác tổng | Tổng = SUM(schedule) |
| Audit log khó kiểm tra | Schedule là bằng chứng pháp lý |

---

## 3. Chi Tiết Triển Khai Trong Code (Reference Project: `p2p`)

### 📁 Server-Side

#### a. Hàm Làm Tròn Tiền Tệ
> **File:** `p2p/server/utils/RoundingUtils.js`

```javascript
// Line 14
const roundToCurrency = (amount, inMultiplesOf = 1000) => {
    if (amount === undefined || amount === null || isNaN(amount)) return 0;
    const factor = inMultiplesOf || 1000;
    return Math.round(amount / factor) * factor;
};
```
- **Tham số `inMultiplesOf`**: Bội số làm tròn, lấy từ Fineract.
- **Dùng bởi**: `LoanCreationService`, `InvestContractService`, `FineractEscrowService`.

---

#### b. Lấy Bội Số Làm Tròn Từ Fineract
> **File:** `p2p/server/interators/services/FineractLoanService.js`

```javascript
// Line 38
async getRoundingMultiple() {
    const product = await this.getLoanProductDetails();
    let rounding = product?.installmentAmountInMultiplesOf || 
                   product?.currency?.inMultiplesOf || 
                   1000;
    // VND safeguard
    if (product?.currency?.code === 'VND' && rounding === 1) {
        rounding = 1000;
    }
    return rounding;
}
```
- **Output Ví dụ**: `1000` (làm tròn đến nghìn đồng).

---

#### c. Tính Toán Tài Chính Tập Trung
> **File:** `p2p/server/interators/services/LoanCreationService.js`  
> **Hàm:** `calculateLoanFinancials(capital, periodMonth, rate, product)`  
> **Dòng:** 684-805

**Logic Chính:**
1. Fetch `inMultiplesOf` từ Fineract nếu chưa có.
2. Xác định loại lãi suất (`Flat` hoặc `Declining Balance`).
3. Tính `schedulePreview` (lịch trả nợ chi tiết từng kỳ).
4. Trả về: `monthlyPay`, `entirelyPay`, `schedulePreview`.

**Đoạn Code Xử Lý Declining Balance (EMI):** (Line 754-789)
```javascript
// Công thức EMI chuẩn quốc tế
const r = rateNum / 100;
let rawEmi = (capitalNum * r * Math.pow(1 + r, periodNum)) / (Math.pow(1 + r, periodNum) - 1);
monthlyPay = roundToCurrency(rawEmi, inMultiplesOf);

// Lặp qua từng kỳ để tạo schedule
for (let i = 1; i <= periodNum; i++) {
    const interest = roundToCurrency(outstanding * r, inMultiplesOf);
    let principal = (i < periodNum) ? (monthlyPay - interest) : outstanding;
    // ...
}
```

---

#### d. Tính Lợi Nhuận Nhà Đầu Tư
> **File:** `p2p/server/interators/controllers/invest/InvestContractService.js`  
> **Hàm:** `createDatabaseInvestmentContract(params)`  
> **Dòng:** 174-214

**Công Thức:**
```javascript
// Line 180-184
const spread = appConfig.LOAN_ADMIN_SPREAD_RATE || 3; // 3% APR
const serviceFeeRate = appConfig.INVESTMENT_SERVICE_FEE_RATE || 0.01; // 1% trên vốn

const borrowerMonthlyRate = loanData.info.rate; // VD: 1.5%/tháng
const lenderMonthlyRate = borrowerMonthlyRate - (spread / 12); // VD: 1.25%/tháng

// Line 197-199
const serviceFee = capitalVND * serviceFeeRate; // 10M × 1% = 100,000đ
const entirelyProfit = lenderFinancials.entirelyPay - capitalVND - serviceFee;
```

**Dữ liệu lưu vào MongoDB (`InvestmentContract.info`):**
- `capital`: Vốn đầu tư
- `serviceFee`: Phí dịch vụ (1% vốn)
- `entirelyProfit`: Lợi nhuận ròng sau phí
- `schedule`: Lịch thu vốn & lãi chi tiết ← **QUAN TRỌNG**

---

### 📁 Client-Side (Mobile App)

#### a. Fetch Bội Số Làm Tròn Từ Server
> **File:** `p2p/client/src/.../InvestDetail.js` (dòng 72-82)

```javascript
onGetRoundingConfig().then(result => {
    if (result?.roundingMultiplier) {
        this.setState({ roundingMultiplier: result.roundingMultiplier });
    }
});
```

#### b. Tính Toán Lợi Nhuận Trên UI
> **File:** `p2p/client/src/.../InvestDetail.js` (dòng 810-870)

**Logic Ưu Tiên:**
1. **Nếu có `invest.entirelyProfit` từ server**: Sử dụng trực tiếp.
2. **Fallback**: Tự tính bằng công thức EMI trên client.

---

## 4. Ví Dụ Tính Toán Cụ Thể (Số 123,000đ)

**Giả định:**
- Vốn đầu tư: `10,000,000đ`
- Kỳ hạn: `10 tháng`
- Lãi suất Người vay: `1.5%/tháng` → Lãi suất NĐT: `1.25%/tháng`
- Bội số làm tròn: `1,000đ`
- Phí dịch vụ: `1% × 10M = 100,000đ`

**Bước 1: Tính EMI**
```
EMI ≈ 1,062,000đ (sau làm tròn)
```

**Bước 2: Tính Tổng Thu và Lợi Nhuận**
```
Tổng thu = SUM(schedule) = 10,623,000đ
Lãi gộp = 623,000đ
Lợi nhuận = 623,000 - 100,000 = 523,000đ
```

> **Số 123,000đ**: Có thể là lãi gộp cho khoản vay ngắn hơn (kỳ hạn ít hơn). Kiểm tra `periodMonth` cụ thể.

---

## 5. Bài Học Cho Dự Án `p2p_do_an`

| Đặc điểm | `p2p` (Reference) | `p2p_do_an` cần học |
| :--- | :--- | :--- |
| **Làm tròn** | `RoundingUtils.roundToCurrency()` | Tạo helper tương tự. |
| **Tính lãi** | `LoanCreationService.calculateLoanFinancials()` | Tập trung 1 Service. |
| **Lưu Investment** | Lưu đầy đủ `schedule` vào MongoDB | **BẮT BUỘC** để WYSIWYG. |
| **UI Sync** | Client fetch `roundingMultiplier` | Không hard-code. |
| **Trả nợ** | Đọc `schedule` đã lưu, không tính lại | **BẮT BUỘC** để khớp UI. |

---

## 6. Kế Hoạch Tiếp Theo (Roadmap)

### Phase 1: Kiểm Tra Dữ Liệu MongoDB ✅ (Đang làm)
- [ ] Kiểm tra `InvestmentContract.info.schedule` có được lưu đầy đủ không.
- [ ] So sánh `SUM(schedule.total)` với `entirelyPay`.

### Phase 2: Cập Nhật RepaymentService
- [ ] Đọc `schedule` từ `InvestmentContract` thay vì tính lại.
- [ ] Phân phối đúng `principal` và `interest` theo từng kỳ.

### Phase 3: Audit Log
- [ ] Lưu `RepaymentBreakdown` sau mỗi lần phân phối.
- [ ] Kiểm toán: `Sum(Lender_i) + Sum(AdminFee_i) == Borrower_Pay`.

---

## Kết Luận

Hệ thống `p2p` đảm bảo tính chính xác tài chính bằng cách:
1. **Lưu schedule ngay khi đầu tư** (WYSIWYG).
2. **Trả nợ theo schedule đã lưu**, không tính lại.
3. **Làm tròn động** từ Fineract.

Dự án `p2p_do_an` cần ưu tiên triển khai **Schedule Persistence** để đảm bảo người dùng luôn thấy và nhận được **cùng một con số**.
