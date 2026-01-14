# BNPL Sprint Plan - 2 Tuần Demo

> **Start Date**: 2026-01-13 (Thứ 2)  
> **End Date**: 2026-01-26 (Chủ nhật)  
> **Goal**: Demo BNPL với QR Code cho thầy  

---

## 📅 Timeline Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        2-WEEK SPRINT PLAN                               │
└─────────────────────────────────────────────────────────────────────────┘

 TUẦN 1: Foundation + Fineract Setup
 ═══════════════════════════════════════════════════════════════════════════
 
 T2 (13/1)  │ T3 (14/1)  │ T4 (15/1)  │ T5 (16/1)  │ T6 (17/1)  │ T7-CN
 ───────────┼────────────┼────────────┼────────────┼────────────┼─────────
 Fineract   │ Fineract   │ Schema     │ Pool Fund  │ Credit     │ Buffer
 Products   │ Products   │ MongoDB    │ APIs       │ Line APIs  │
 Setup      │ + Test     │            │            │            │


 TUẦN 2: QR Payment + Demo Ready
 ═══════════════════════════════════════════════════════════════════════════
 
 T2 (20/1)  │ T3 (21/1)  │ T4 (22/1)  │ T5 (23/1)  │ T6 (24/1)  │ T7-CN
 ───────────┼────────────┼────────────┼────────────┼────────────┼─────────
 QR Code    │ Merchant   │ BNPL       │ Loss       │ Dashboard  │ Demo
 Generation │ POS Mock   │ Payment    │ Distrib.   │ Investor   │ Ready!
            │            │ Flow       │            │            │
```

---

## 🗓️ TUẦN 1: Foundation + Fineract

### Ngày 1 (T2 - 13/01): Fineract Products Setup

**Mục tiêu**: Cấu hình sản phẩm trên Fineract cho BNPL

| Task | Thời gian | Chi tiết |
|------|-----------|----------|
| 1. Tạo Savings Product cho Pool Fund | 1h | `BNPL_POOL_SAVINGS` |
| 2. Tạo Savings Product cho Reserve Fund | 1h | `BNPL_RESERVE_SAVINGS` |
| 3. Tạo Savings Product cho Credit Line | 1h | `BNPL_CREDIT_LINE` |
| 4. Tạo Loan Product cho BNPL Transaction | 2h | `BNPL_INSTALLMENT_LOAN` |
| 5. Viết script tự động tạo products | 2h | PowerShell script |

#### Fineract Products Configuration:

```javascript
// 1. BNPL Pool Savings Product
const poolSavingsProduct = {
    name: "BNPL Pool Fund",
    shortName: "BNPL-POOL",
    description: "Quỹ gộp cho BNPL từ nhà đầu tư",
    currencyCode: "VND",
    digitsAfterDecimal: 0,
    nominalAnnualInterestRate: 12,  // Lãi trả NĐT
    interestCompoundingPeriodType: 4,  // Monthly
    interestPostingPeriodType: 4,      // Monthly
    interestCalculationType: 1,         // Daily Balance
    accountingRule: 2,                  // Cash based
};

// 2. BNPL Reserve Fund
const reserveSavingsProduct = {
    name: "BNPL Reserve Fund", 
    shortName: "BNPL-RSV",
    description: "Quỹ dự phòng rủi ro",
    currencyCode: "VND",
    nominalAnnualInterestRate: 0,  // Không sinh lãi
};

// 3. BNPL Credit Line (per user)
const creditLineSavingsProduct = {
    name: "BNPL Credit Line",
    shortName: "BNPL-CL",
    description: "Hạn mức tín dụng BNPL",
    currencyCode: "VND",
    allowOverdraft: true,  // Cho phép âm (sử dụng hạn mức)
    overdraftLimit: 50000000,  // Max 50M
};

// 4. BNPL Installment Loan
const bnplLoanProduct = {
    name: "BNPL Installment",
    shortName: "BNPL-LOAN",
    currencyCode: "VND",
    principal: 500000,
    minPrincipal: 100000,
    maxPrincipal: 50000000,
    numberOfRepayments: 12,
    minNumberOfRepayments: 1,
    maxNumberOfRepayments: 24,
    repaymentEvery: 1,
    repaymentFrequencyType: 2,  // Monthly
    interestRatePerPeriod: 1.5,  // 1.5% per month
    interestType: 0,  // Declining Balance
    amortizationType: 1,  // Equal Installments
    transactionProcessingStrategyCode: "mifos-standard-strategy",
};
```

#### Script tạo Products (PowerShell):

```powershell
# scripts/setup-bnpl-products.ps1

$FineractUrl = "http://localhost:8080/fineract-provider/api/v1"
$TenantId = "default"
$Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("mifos:password"))

# 1. Create Pool Savings Product
$poolProduct = @{
    name = "BNPL Pool Fund"
    shortName = "BNPL-POOL"
    currencyCode = "VND"
    digitsAfterDecimal = 0
    nominalAnnualInterestRate = 12
    interestCompoundingPeriodType = 4
    interestPostingPeriodType = 4
    interestCalculationType = 1
    accountingRule = 1
} | ConvertTo-Json

Invoke-RestMethod -Uri "$FineractUrl/savingsproducts" `
    -Method POST `
    -Headers @{
        "Authorization" = "Basic $Auth"
        "Fineract-Platform-TenantId" = $TenantId
        "Content-Type" = "application/json"
    } `
    -Body $poolProduct

Write-Host "✅ Created BNPL Pool Savings Product"

# ... (similar for other products)
```

---

### Ngày 2 (T3 - 14/01): Fineract Testing + Clients Setup

**Mục tiêu**: Test products và tạo clients mẫu

| Task | Thời gian | Chi tiết |
|------|-----------|----------|
| 1. Test tạo Pool Fund account | 1h | Via Fineract API |
| 2. Test deposit vào Pool | 1h | Investor deposit flow |
| 3. Tạo Merchant clients (3-4 cái) | 1h | Admin tạo sẵn |
| 4. Tạo Test customers | 1h | 2-3 customers |
| 5. Document API flows | 2h | Postman collection |

#### Merchants mẫu:

```javascript
const sampleMerchants = [
    {
        merchantId: "MER_001",
        name: "Shop Điện Thoại ABC",
        category: "electronics",
        logo: "📱"
    },
    {
        merchantId: "MER_002", 
        name: "Thời Trang XYZ",
        category: "fashion",
        logo: "👔"
    },
    {
        merchantId: "MER_003",
        name: "Siêu Thị Mini",
        category: "grocery",
        logo: "🛒"
    }
];
```

---

### Ngày 3 (T4 - 15/01): MongoDB Schemas

**Mục tiêu**: Tạo schemas cho BNPL module

| Task | Thời gian | Chi tiết |
|------|-----------|----------|
| 1. PoolFund schema | 1h | + validation |
| 2. ReserveFund schema | 1h | + contribution tracking |
| 3. CreditLine schema | 1h | + limit calculation |
| 4. BnplTransaction schema | 1.5h | + installments embedded |
| 5. Merchant schema | 0.5h | Simplified |
| 6. Collection schema | 1h | For overdue tracking |

#### Files cần tạo:

```
src/bnpl/
├── schemas/
│   ├── pool-fund.schema.ts
│   ├── reserve-fund.schema.ts
│   ├── credit-line.schema.ts
│   ├── bnpl-transaction.schema.ts
│   ├── merchant.schema.ts
│   └── collection-case.schema.ts
├── dto/
│   ├── create-pool-fund.dto.ts
│   ├── invest-pool.dto.ts
│   ├── process-payment.dto.ts
│   └── ...
└── bnpl.module.ts
```

---

### Ngày 4 (T5 - 16/01): Pool Fund APIs

**Mục tiêu**: APIs cho quản lý Pool Fund

| Task | Thời gian | Chi tiết |
|------|-----------|----------|
| 1. PoolFundService | 2h | Business logic |
| 2. ReserveFundService | 2h | Contribution logic |
| 3. Pool Fund Controller | 1.5h | REST APIs |
| 4. Unit tests | 1h | Jest tests |

#### APIs:

```typescript
// Pool Fund APIs
POST   /api/bnpl/pools              // Tạo pool (Admin)
GET    /api/bnpl/pools              // List pools
GET    /api/bnpl/pools/:id          // Get pool detail
POST   /api/bnpl/pools/:id/invest   // NĐT góp vốn
GET    /api/bnpl/pools/:id/investors // List investors

// Reserve Fund APIs (internal)
GET    /api/bnpl/pools/:id/reserve  // Xem reserve fund
```

---

### Ngày 5 (T6 - 17/01): Credit Line APIs

**Mục tiêu**: APIs cho quản lý hạn mức

| Task | Thời gian | Chi tiết |
|------|-----------|----------|
| 1. CreditLineService | 2h | Limit calculation based on score |
| 2. Credit Line Controller | 1.5h | REST APIs |
| 3. Integration với CreditScoringService | 2h | Reuse existing |
| 4. Testing | 1h | |

#### Credit Limit Calculation:

```typescript
// Tính hạn mức dựa trên credit score
function calculateCreditLimit(creditScore: number): number {
    if (creditScore >= 750) return 50000000;  // 50M - Excellent
    if (creditScore >= 700) return 30000000;  // 30M - Good
    if (creditScore >= 650) return 20000000;  // 20M - Fair
    if (creditScore >= 600) return 10000000;  // 10M - Poor
    return 5000000;  // 5M - Minimum
}
```

---

### Ngày 6-7 (T7-CN - 18-19/01): Buffer + Catch Up

- Fix bugs từ tuần 1
- Review code
- Chuẩn bị cho tuần 2

---

## 🗓️ TUẦN 2: QR Payment + Demo

### Ngày 8 (T2 - 20/01): QR Code Generation

**Mục tiêu**: Customer có thể generate QR để thanh toán

| Task | Thời gian | Chi tiết |
|------|-----------|----------|
| 1. QR Code Service | 2h | JWT-based QR |
| 2. QR Generation API | 1h | GET /bnpl/qr |
| 3. Mobile App: QR Screen | 3h | Show QR code |

#### QR Code Service:

```typescript
// services/QrCodeService.ts
@Injectable()
export class QrCodeService {
    
    generatePaymentQR(userId: string, creditLineId: string): string {
        const payload = {
            type: 'BNPL_PAY',
            userId,
            creditLineId,
            exp: Math.floor(Date.now() / 1000) + 300,  // 5 min expiry
        };
        
        return this.jwtService.sign(payload, {
            secret: this.configService.get('BNPL_QR_SECRET'),
        });
    }
    
    validateQR(qrToken: string): PaymentQRPayload {
        return this.jwtService.verify(qrToken, {
            secret: this.configService.get('BNPL_QR_SECRET'),
        });
    }
}
```

---

### Ngày 9 (T3 - 21/01): Merchant POS Simulator

**Mục tiêu**: Web app giả lập POS của merchant

| Task | Thời gian | Chi tiết |
|------|-----------|----------|
| 1. Create Next.js page `/merchant/pos` | 2h | Basic UI |
| 2. QR Scanner component | 2h | Use react-qr-reader |
| 3. Payment confirmation UI | 2h | Show result |

#### Merchant POS UI:

```
┌─────────────────────────────────────────────┐
│  🏪 SHOP ĐIỆN THOẠI ABC                     │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │        Số tiền thanh toán           │   │
│  │                                     │   │
│  │     [ 500,000 ] VND                 │   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │                                     │   │
│  │    📷 QUÉT MÃ QR KHÁCH HÀNG        │   │
│  │                                     │   │
│  │     [Nhấn để mở camera]             │   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ─────────────────────────────────────────  │
│  Giao dịch gần đây:                         │
│  • 15:30 - 500,000đ - ✅ Thành công        │
│  • 14:45 - 1,200,000đ - ✅ Thành công      │
│                                             │
└─────────────────────────────────────────────┘
```

---

### Ngày 10 (T4 - 22/01): BNPL Payment Flow

**Mục tiêu**: Complete payment flow từ QR → Transaction

| Task | Thời gian | Chi tiết |
|------|-----------|----------|
| 1. BnplPaymentService | 3h | Core payment logic |
| 2. Process Payment API | 1h | POST /bnpl/process-payment |
| 3. Installment calculation | 2h | Generate schedule |
| 4. Integration test | 1h | End-to-end |

#### Payment Flow:

```typescript
// services/BnplPaymentService.ts
@Injectable()
export class BnplPaymentService {
    
    async processPayment(dto: ProcessPaymentDto): Promise<BnplTransaction> {
        // 1. Validate QR
        const qrData = this.qrService.validateQR(dto.customerQR);
        
        // 2. Get credit line
        const creditLine = await this.creditLineModel.findById(qrData.creditLineId);
        
        // 3. Check limit
        if (dto.amount > creditLine.availableAmount) {
            throw new BadRequestException('Vượt quá hạn mức');
        }
        
        // 4. Reserve from pool
        await this.poolFundService.reserveFunds(dto.amount);
        
        // 5. Create transaction
        const transaction = await this.bnplTransactionModel.create({
            transactionId: `BNPL_${Date.now()}`,
            userId: qrData.userId,
            creditLineId: creditLine._id,
            merchantId: dto.merchantId,
            amount: dto.amount,
            numberOfMonths: dto.months || 3,
            installments: this.generateInstallments(dto.amount, dto.months || 3),
            status: 'active',
        });
        
        // 6. Update credit line
        creditLine.usedAmount += dto.amount;
        creditLine.availableAmount -= dto.amount;
        await creditLine.save();
        
        // 7. Contribute to reserve (5%)
        await this.reserveFundService.contribute({
            source: 'transaction_fee',
            amount: dto.amount * 0.05,
        });
        
        // 8. Notify customer
        await this.notificationService.send(qrData.userId, {
            title: 'Thanh toán BNPL thành công',
            body: `Đã mua ${formatMoney(dto.amount)} tại ${merchant.name}`,
        });
        
        return transaction;
    }
    
    private generateInstallments(amount: number, months: number): Installment[] {
        const interestRate = this.getInterestRate(months);
        const totalInterest = amount * interestRate * months;
        const totalAmount = amount + totalInterest;
        const monthlyAmount = Math.ceil(totalAmount / months);
        
        const installments = [];
        let remainingPrincipal = amount;
        
        for (let i = 1; i <= months; i++) {
            const dueDate = new Date();
            dueDate.setMonth(dueDate.getMonth() + i);
            
            const principalPart = Math.ceil(amount / months);
            const interestPart = monthlyAmount - principalPart;
            
            installments.push({
                period: i,
                dueDate,
                principalAmount: principalPart,
                interestAmount: interestPart,
                totalAmount: monthlyAmount,
                status: 'pending',
            });
            
            remainingPrincipal -= principalPart;
        }
        
        return installments;
    }
}
```

---

### Ngày 11 (T5 - 23/01): Loss Distribution ⭐

**Mục tiêu**: Implement thuật toán phân chia rủi ro

| Task | Thời gian | Chi tiết |
|------|-----------|----------|
| 1. LossDistributionService | 3h | Waterfall algorithm |
| 2. Simulate Default API | 1h | Admin trigger default |
| 3. Collection basic flow | 2h | Overdue detection |

#### Admin API để demo:

```typescript
// POST /api/admin/bnpl/simulate-default
async simulateDefault(transactionId: string) {
    // 1. Mark transaction as defaulted
    const tx = await this.bnplTransactionModel.findById(transactionId);
    tx.status = 'defaulted';
    await tx.save();
    
    // 2. Calculate outstanding amount
    const outstandingAmount = tx.installments
        .filter(i => i.status === 'pending')
        .reduce((sum, i) => sum + i.totalAmount, 0);
    
    // 3. Run loss distribution
    const distribution = await this.lossDistributionService.distributeLoss(
        outstandingAmount,
        tx.poolFundId
    );
    
    // 4. Return for demo display
    return {
        transactionId,
        outstandingAmount,
        distribution,
    };
}
```

---

### Ngày 12 (T6 - 24/01): Investor Dashboard

**Mục tiêu**: Dashboard cho NĐT xem tiền chạy

| Task | Thời gian | Chi tiết |
|------|-----------|----------|
| 1. Dashboard APIs | 2h | Stats, metrics |
| 2. Dashboard UI (Web) | 4h | Charts + numbers |

#### Dashboard Metrics:

```typescript
// GET /api/bnpl/dashboard/stats
{
    poolStats: {
        totalPoolSize: 100000000,
        deployedAmount: 35000000,
        availableAmount: 60000000,
        reserveAmount: 5000000,
    },
    myInvestment: {
        investedAmount: 50000000,
        sharePercentage: 50,
        earnedInterest: 250000,
        lossFromDefaults: 100000,
        netReturn: 150000,
    },
    riskMetrics: {
        currentDefaultRate: 2.5,  // %
        reserveHealthy: true,
        reserveRatio: 5,  // %
    },
    recentActivity: [
        { type: 'deposit', amount: 1000000, date: '...' },
        { type: 'interest', amount: 50000, date: '...' },
        { type: 'loss_share', amount: -20000, date: '...' },
    ]
}
```

#### Dashboard UI:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  📊 INVESTOR DASHBOARD                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │  Đã Góp Vốn     │  │  Lợi Nhuận      │  │  Tỷ Lệ Nợ Xấu  │         │
│  │  50,000,000đ    │  │  +150,000đ      │  │  2.5%          │         │
│  │  (50% Pool)     │  │  (+0.3%)        │  │  🟢 An toàn     │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  POOL FUND ALLOCATION                                             │ │
│  │  ████████████████████████████████░░░░░░░░░░ 65% Deployed          │ │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████  30% Available      │ │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░██   5% Reserve        │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  PHÂN PHỐI RỦI RO GẦN NHẤT (Default 10M)                         │ │
│  │                                                                   │ │
│  │  Reserve Fund:    ████████████████████████████████  60%  6,000K  │ │
│  │  Pool Profit:     ████████████                      25%  2,500K  │ │
│  │  Platform:        ████                              10%  1,000K  │ │
│  │  Investors:       ██                                 5%    500K  │ │
│  │    ├─ Bạn (50%):                                          250K  │ │
│  │    ├─ NĐT B (30%):                                        150K  │ │
│  │    └─ NĐT C (20%):                                        100K  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Ngày 13-14 (T7-CN - 25-26/01): Demo Ready!

| Task | Thời gian | Chi tiết |
|------|-----------|----------|
| 1. Bug fixes | 4h | |
| 2. Demo script | 2h | Step-by-step demo |
| 3. Test full flow | 2h | End-to-end |
| 4. Chuẩn bị slides | 2h | Nếu cần |

---

## 🎯 Demo Script cho Thầy

### Demo Flow (15-20 phút):

```
1. SETUP (2 phút)
   - Show Fineract products đã tạo
   - Show sample merchants

2. INVESTOR FLOW (3 phút)
   - NĐT A đăng nhập
   - Góp 50M vào Pool
   - NĐT B góp 30M
   - Show Pool dashboard: Total 80M

3. CUSTOMER FLOW (5 phút)
   - Customer đăng nhập
   - Xem Credit Line: 10M (dựa trên credit score)
   - Mở QR Code
   - 
   - Merchant POS quét QR
   - Nhập 500K
   - Xác nhận → Thành công!
   - 
   - Customer xem lịch trả góp: 3 kỳ x 170K

4. DEFAULT SIMULATION (5 phút) ⭐ QUAN TRỌNG
   - Admin trigger default (Customer không trả)
   - Hệ thống chạy Loss Distribution
   - Show trên Dashboard:
     * Reserve Fund giảm
     * Pool Profit giảm
     * Platform chịu
     * NĐT chịu (chia theo tỷ lệ)

5. INVESTOR DASHBOARD (3 phút)
   - NĐT xem lợi nhuận
   - Xem risk metrics
   - Xem loss distribution breakdown
```

---

## 📝 Checklist

### Tuần 1
- [ ] Fineract: BNPL Pool Savings Product
- [ ] Fineract: BNPL Reserve Savings Product  
- [ ] Fineract: BNPL Credit Line Product
- [ ] Fineract: BNPL Loan Product
- [ ] Fineract: Sample Merchants (3)
- [ ] Fineract: Test Customers (2)
- [ ] MongoDB: PoolFund schema
- [ ] MongoDB: ReserveFund schema
- [ ] MongoDB: CreditLine schema
- [ ] MongoDB: BnplTransaction schema
- [ ] MongoDB: Merchant schema
- [ ] API: Pool Fund CRUD
- [ ] API: Invest to Pool
- [ ] API: Credit Line

### Tuần 2
- [ ] Service: QR Code generation
- [ ] Mobile: QR Screen
- [ ] Web: Merchant POS Simulator
- [ ] Service: BNPL Payment processing
- [ ] Service: Installment calculator
- [ ] Service: Loss Distribution ⭐
- [ ] API: Simulate Default (Admin)
- [ ] Web: Investor Dashboard
- [ ] Full Demo Test

---

## 🔧 Tech Stack Reminder

| Layer | Tech |
|-------|------|
| Backend | NestJS (existing) |
| Database | MongoDB + Fineract |
| Mobile | React Native / Expo (existing) |
| Web POS | Next.js or React |
| QR | `qrcode` (generate), `react-qr-reader` (scan) |
| Charts | Chart.js or Recharts |

---

## ⚠️ Lưu Ý

1. **Focus vào demo flow** - Không cần perfect, cần chạy được
2. **Loss Distribution là highlight** - Code kỹ phần này
3. **Có data mẫu sẵn** - Không demo từ empty state
4. **Test trước 1 ngày** - Tránh bug bất ngờ khi demo
