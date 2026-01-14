# BNPL Module - Phiên Bản Đồ Án Tốt Nghiệp

> **Version**: 2.0.0 (Thesis Edition)  
> **Created**: 2026-01-12  
> **Status**: Planning  
> **Scope**: Adjusted for 12-14 week thesis timeline  

---

## ⚠️ Phạm Vi Đồ Án vs Sản Phẩm Thực

| Thành phần | Sản phẩm thực | Đồ án này |
|------------|---------------|-----------|
| **Thanh toán** | Virtual Card (Visa/MC) | ✅ **QR Code** |
| **PSP** | Marqeta/Stripe | ✅ **Mock PSP (tự build)** |
| **Merchant Onboarding** | eKYC + Auto-approve | ✅ **Admin tạo sẵn** |
| **Pool Fund Logic** | Full implementation | ✅ **Full implementation** |
| **Reserve Fund** | Full implementation | ✅ **Full implementation** |
| **Loss Distribution** | Full implementation | ✅ **Full implementation** ⭐ |
| **BIN Sponsor** | Ngân hàng đối tác | ❌ **Không cần** |
| **Timeline** | 23 tuần | ✅ **12-14 tuần** |

> [!IMPORTANT]
> **Focus của đồ án**: Pool Fund + Reserve Fund + Loss Distribution Algorithm + Investor Dashboard
> 
> Đây là phần "ăn điểm" nhất - thể hiện khả năng xử lý logic tài chính phức tạp.

---

## Mục Lục

1. [Tổng Quan Mô Hình](#tổng-quan-mô-hình)
2. [Kiến Trúc Hệ Thống](#kiến-trúc-hệ-thống)
3. [Luồng QR Pay BNPL](#luồng-qr-pay-bnpl)
4. [Mock PSP Architecture](#mock-psp-architecture)
5. [Pool Fund & Reserve Fund](#pool-fund--reserve-fund)
6. [Loss Distribution Algorithm](#loss-distribution-algorithm)
7. [Data Models](#data-models)
8. [Implementation Roadmap](#implementation-roadmap)
9. [Demo Scenarios](#demo-scenarios)

---

## Tổng Quan Mô Hình

### So sánh P2P Lending vs BNPL (QR)

```
╔══════════════════════════════════════════════════════════════════════════╗
║                        P2P LENDING HIỆN TẠI                              ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   Người Vay 1 ───┐                              ┌─── NĐT 1              ║
║                  ├──→ [ Matching Engine ] ←───┤                        ║
║   Người Vay 2 ───┘       (Ghép N-N)            └─── NĐT 2              ║
║                              │                                          ║
║                              ▼                                          ║
║                    ┌─────────────────┐                                  ║
║                    │ Khoản Vay Lớn   │                                  ║
║                    │ (5M - 100M VND) │                                  ║
║                    │ Phê duyệt: 1-3d │ ← Chậm, cần matching            ║
║                    └─────────────────┘                                  ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════╗
║                      BNPL VỚI QR CODE (ĐỒ ÁN)                           ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   NĐT 1 ────┐                                                           ║
║             ├──→ [ POOLED FUND ] ──→ [ Credit Lines ]                  ║
║   NĐT N ────┘    (Quỹ Gộp)             │                               ║
║                      │                  ▼                               ║
║                      │         ┌─────────────────┐                      ║
║                      │         │  QR Code User   │                      ║
║                      │         │  (Hạn mức sẵn)  │                      ║
║                      │         │  Phê duyệt: 0s  │ ← Tức thì!          ║
║                      │         └────────┬────────┘                      ║
║                      │                  │                               ║
║                      ▼                  ▼                               ║
║              [ Reserve Fund ]   [ BNPL Transactions ]                   ║
║              (Quỹ Dự Phòng)     (500K - 10M VND)                        ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### Tại sao QR thay vì Virtual Card?

| Tiêu chí | Virtual Card (Visa/MC) | QR Code BNPL |
|----------|------------------------|--------------|
| **Dependency** | Cần PSP (Marqeta, Stripe) | Tự build 100% |
| **API Access** | Khó xin (cần doanh nghiệp) | Không cần |
| **Pháp lý** | Cần BIN Sponsor | Không cần |
| **Demo** | Khó (cần POS thật/giả) | Dễ (web/mobile) |
| **Logic** | Giống nhau | Giống nhau |
| **Điểm | Không quan trọng bằng logic | **Logic mới quan trọng** |

---

## Kiến Trúc Hệ Thống

### High-Level Architecture (Simplified for Thesis)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌───────────────┐    ┌───────────────┐    ┌───────────────┐           │
│   │  Mobile App   │    │  Merchant     │    │  Investor     │           │
│   │  (Customer)   │    │  POS Web      │    │  Dashboard    │           │
│   │               │    │  (Mock)       │    │               │           │
│   │  • Xem hạn mức│    │  • Quét QR    │    │  • Góp vốn    │           │
│   │  • Hiện QR    │    │  • Xác nhận   │    │  • Theo dõi   │           │
│   │  • Trả góp    │    │    giao dịch  │    │  • Xem risk   │           │
│   └───────┬───────┘    └───────┬───────┘    └───────┬───────┘           │
│           │                    │                    │                    │
└───────────┼────────────────────┼────────────────────┼────────────────────┘
            │                    │                    │
            └────────────────────┼────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         NESTJS SERVER                                     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    NEW BNPL MODULES                                │ │
│  │                                                                    │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │ │
│  │  │   QR Code    │  │  Credit Line │  │   Merchant   │             │ │
│  │  │   Service    │  │   Service    │  │   Service    │             │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │ │
│  │                                                                    │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │ │
│  │  │  Pool Fund   │  │ Reserve Fund │  │    Loss      │  ⭐ FOCUS  │ │
│  │  │   Service    │  │   Service    │  │ Distribution │             │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │ │
│  │                                                                    │ │
│  │  ┌──────────────┐  ┌──────────────┐                               │ │
│  │  │ Installment  │  │  Collection  │                               │ │
│  │  │   Service    │  │   Service    │                               │ │
│  │  └──────────────┘  └──────────────┘                               │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │              EXISTING MODULES (Reuse from P2P)                     │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │ │
│  │  │   Auth   │  │  eKYC    │  │ Fineract │  │  Credit  │           │ │
│  │  │ Service  │  │ Service  │  │ Service  │  │ Scoring  │           │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                 ┌───────────────┼───────────────┐
                 │               │               │
                 ▼               ▼               ▼
          ┌───────────┐   ┌───────────┐   ┌───────────┐
          │  MongoDB  │   │ Fineract  │   │  Socket   │
          │(BNPL Data)│   │(Accounting│   │(Real-time)│
          └───────────┘   └───────────┘   └───────────┘
```

---

## Luồng QR Pay BNPL

### Flow 1: Customer Thanh Toán tại Merchant

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      QR PAY BNPL FLOW                                   │
└─────────────────────────────────────────────────────────────────────────┘

  Customer                    Merchant POS                  Server
     │                            │                            │
     │  1. Mở App, hiện QR Code   │                            │
     │  ─────────────────────────>│                            │
     │                            │                            │
     │  2. Thu ngân quét QR       │                            │
     │  <─────────────────────────│                            │
     │                            │                            │
     │                            │  3. POST /bnpl/pay         │
     │                            │  {                         │
     │                            │    customerQR: "...",      │
     │                            │    amount: 500000,         │
     │                            │    merchantId: "MER_001"   │
     │                            │  }                         │
     │                            │ ───────────────────────────>│
     │                            │                            │
     │                            │                            │ 4. Validate:
     │                            │                            │    • Customer KYC ✓
     │                            │                            │    • Credit Limit ✓
     │                            │                            │    • Merchant Active ✓
     │                            │                            │
     │                            │                            │ 5. Create Transaction
     │                            │                            │    • Reserve from Pool
     │                            │                            │    • Update Credit Used
     │                            │                            │    • Generate Schedule
     │                            │                            │
     │                            │  6. Response               │
     │                            │  {                         │
     │                            │    success: true,          │
     │                            │    transactionId: "...",   │
     │                            │    installments: 3,        │
     │                            │    monthlyAmount: 170000   │
     │                            │  }                         │
     │                            │ <───────────────────────────│
     │                            │                            │
     │  7. Hiện kết quả          │                            │
     │  "Đã mua 500K, trả 3 kỳ"  │                            │
     │  <─────────────────────────│                            │
     │                            │                            │
     │  8. Push Notification      │                            │
     │  <──────────────────────────────────────────────────────│
     │                            │                            │

```

### QR Code Structure

```javascript
// QR Code chứa JWT token
const qrPayload = {
    type: 'BNPL_PAY',
    userId: 'USER_123',
    creditLineId: 'CL_456',
    availableLimit: 10000000,
    exp: 1234567890,  // Expires in 5 minutes
    signature: 'jwt_signature'
};

// Encode thành QR
const qrContent = jwt.sign(qrPayload, JWT_SECRET);
// Result: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Flow 2: Chọn Số Kỳ Trả Góp

```
┌─────────────────────────────────────────────────────────────────────────┐
│              INSTALLMENT SELECTION FLOW                                 │
└─────────────────────────────────────────────────────────────────────────┘

  Customer App                                              Server
       │                                                       │
       │  1. GET /bnpl/installments/simulate                   │
       │     ?amount=500000                                    │
       │  ────────────────────────────────────────────────────>│
       │                                                       │
       │  2. Response: Các option trả góp                      │
       │  {                                                    │
       │    options: [                                         │
       │      { months: 1,  total: 500000,  monthly: 500000 }, │
       │      { months: 3,  total: 515000,  monthly: 171667 }, │
       │      { months: 6,  total: 536000,  monthly: 89333  }, │
       │      { months: 12, total: 590000,  monthly: 49167  }  │
       │    ]                                                  │
       │  }                                                    │
       │  <────────────────────────────────────────────────────│
       │                                                       │
       │  ┌─────────────────────────────────────┐              │
       │  │  Chọn kỳ trả góp:                   │              │
       │  │                                     │              │
       │  │  ○ 1 tháng  - 500,000đ  (0% lãi)   │              │
       │  │  ● 3 tháng  - 171,667đ/kỳ          │ ← Selected   │
       │  │  ○ 6 tháng  - 89,333đ/kỳ           │              │
       │  │  ○ 12 tháng - 49,167đ/kỳ           │              │
       │  │                                     │              │
       │  │  [ XÁC NHẬN ]                       │              │
       │  └─────────────────────────────────────┘              │
       │                                                       │
       │  3. POST /bnpl/confirm                                │
       │     { transactionId: "...", months: 3 }               │
       │  ────────────────────────────────────────────────────>│
       │                                                       │
```

---

## Mock PSP Architecture

### Thay vì PSP thật, ta build "Merchant POS Simulator"

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MOCK PSP / MERCHANT POS                              │
└─────────────────────────────────────────────────────────────────────────┘

  Thực tế (Production)              Đồ án (Mock)
  ─────────────────────             ────────────────

  ┌─────────────┐                   ┌─────────────────────────────┐
  │ POS Machine │                   │ Merchant POS Simulator (Web)│
  │ (Physical)  │                   │                             │
  └──────┬──────┘                   │  ┌─────────────────────┐   │
         │                          │  │ Merchant: Shop ABC  │   │
         ▼                          │  ├─────────────────────┤   │
  ┌─────────────┐                   │  │ Amount: [500,000]   │   │
  │ Visa/MC     │                   │  │                     │   │
  │ Network     │                   │  │ [QUÉT QR CUSTOMER]  │   │
  └──────┬──────┘                   │  │                     │   │
         │                          │  │ Camera preview...   │   │
         ▼                          │  └─────────────────────┘   │
  ┌─────────────┐                   │                             │
  │ Marqeta/    │                   │  Khi quét QR xong:          │
  │ Stripe PSP  │                   │  → POST /bnpl/pay           │
  └──────┬──────┘                   │  → Hiển thị kết quả         │
         │                          │                             │
         ▼                          └─────────────────────────────┘
  ┌─────────────┐
  │ Our Server  │
  │ (Webhook)   │
  └─────────────┘

```

### Merchant POS Simulator (React/Next.js)

```jsx
// pages/merchant/pos.tsx - Merchant POS Simulator

export default function MerchantPOS() {
    const [amount, setAmount] = useState(500000);
    const [scanning, setScanning] = useState(false);
    const [result, setResult] = useState(null);
    
    const handleScan = async (qrData) => {
        try {
            const response = await axios.post('/api/bnpl/pay', {
                customerQR: qrData,
                amount: amount,
                merchantId: 'MER_001'  // Current merchant
            });
            
            setResult({
                success: true,
                message: `Giao dịch thành công!`,
                transactionId: response.data.transactionId,
                installments: response.data.installments
            });
        } catch (error) {
            setResult({
                success: false,
                message: error.response?.data?.message || 'Giao dịch thất bại'
            });
        }
    };
    
    return (
        <div className="pos-container">
            <h1>🏪 Shop ABC - POS</h1>
            
            <div className="amount-input">
                <label>Số tiền:</label>
                <input 
                    type="number" 
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)}
                />
            </div>
            
            {scanning ? (
                <QRScanner onScan={handleScan} />
            ) : (
                <button onClick={() => setScanning(true)}>
                    📷 QUÉT QR KHÁCH HÀNG
                </button>
            )}
            
            {result && (
                <div className={`result ${result.success ? 'success' : 'error'}`}>
                    {result.success ? '✅' : '❌'} {result.message}
                </div>
            )}
        </div>
    );
}
```

---

## Pool Fund & Reserve Fund

### Cơ chế hoạt động

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    POOLED FUND MECHANISM                                │
└─────────────────────────────────────────────────────────────────────────┘

                    NHÀ ĐẦU TƯ GÓP VỐN
                    ──────────────────
    
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │   NĐT A     │   │   NĐT B     │   │   NĐT C     │
    │   50M VND   │   │   30M VND   │   │   20M VND   │
    │   (50%)     │   │   (30%)     │   │   (20%)     │
    └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │                              │
              │        POOL FUND             │
              │     Total: 100M VND          │
              │                              │
              │  ┌────────────────────────┐  │
              │  │ Available: 80M VND    │  │  ← Cho vay BNPL
              │  └────────────────────────┘  │
              │  ┌────────────────────────┐  │
              │  │ Deployed: 15M VND     │  │  ← Đang cho vay
              │  └────────────────────────┘  │
              │  ┌────────────────────────┐  │
              │  │ Reserve: 5M VND (5%)  │  │  ← Quỹ dự phòng
              │  └────────────────────────┘  │
              │                              │
              └──────────────┬───────────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │ Credit Line │   │ Credit Line │   │ Credit Line │
    │   User 1    │   │   User 2    │   │   User 3    │
    │   5M VND    │   │   3M VND    │   │   7M VND    │
    └─────────────┘   └─────────────┘   └─────────────┘

```

### Reserve Fund Sources

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  RESERVE FUND CONTRIBUTIONS                             │
└─────────────────────────────────────────────────────────────────────────┘

   NGUỒN 1: 5% từ mỗi giao dịch BNPL
   ────────────────────────────────────
   
   Customer mua 500,000đ
        │
        ▼
   ┌─────────────────────────────────────┐
   │ 475,000đ → Merchant                 │
   │  25,000đ → Reserve Fund (5%)        │
   └─────────────────────────────────────┘


   NGUỒN 2: Spread lãi suất (50%)
   ────────────────────────────────────
   
   Lãi thu từ Customer: 1.5%/tháng
   Lãi trả cho NĐT: 1.0%/tháng
   Spread: 0.5%
        │
        ▼
   ┌─────────────────────────────────────┐
   │ 50% Spread → Reserve Fund           │
   │ 50% Spread → Platform Revenue       │
   └─────────────────────────────────────┘


   NGUỒN 3: Phí trễ hạn (100%)
   ────────────────────────────────────
   
   Customer trễ hạn → Phí 50,000đ
        │
        ▼
   ┌─────────────────────────────────────┐
   │ 100% Late Fee → Reserve Fund        │
   └─────────────────────────────────────┘


   NGUỒN 4: Tiền thu hồi nợ
   ────────────────────────────────────
   
   Sau khi default, thu hồi được 300,000đ
        │
        ▼
   ┌─────────────────────────────────────┐
   │ Recovered Amount → Reserve Fund     │
   └─────────────────────────────────────┘
```

---

## Loss Distribution Algorithm

> ⭐ **ĐÂY LÀ PHẦN QUAN TRỌNG NHẤT CỦA ĐỒ ÁN**
> 
> Thuật toán phân chia rủi ro theo mô hình "Waterfall" - chuẩn mực ngân hàng.

### Waterfall Priority

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    LOSS DISTRIBUTION WATERFALL                          │
└─────────────────────────────────────────────────────────────────────────┘

   Khi có DEFAULT: 10,000,000 VND
   ════════════════════════════════

   ┌─────────────────────────────────────────────────────────────────────┐
   │  PRIORITY 1: RESERVE FUND (Tối đa 60% loss)                        │
   │  ───────────────────────────────────────────                       │
   │                                                                     │
   │  Reserve Balance: 8,000,000 VND                                     │
   │  Max can use: 10M × 60% = 6,000,000 VND                            │
   │                                                                     │
   │  ✓ Trích từ Reserve: 6,000,000 VND                                 │
   │  → Remaining loss: 4,000,000 VND                                   │
   └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  PRIORITY 2: POOL PROFIT (Tối đa 25% remaining)                    │
   │  ──────────────────────────────────────────────                    │
   │                                                                     │
   │  Accrued Profit: 2,000,000 VND                                      │
   │  Max can use: 4M × 25% = 1,000,000 VND                             │
   │                                                                     │
   │  ✓ Trích từ Profit: 1,000,000 VND                                  │
   │  → Remaining loss: 3,000,000 VND                                   │
   └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  PRIORITY 3: PLATFORM (Tối đa 10% remaining)                       │
   │  ───────────────────────────────────────────                       │
   │                                                                     │
   │  Platform share: 3M × 10% = 300,000 VND                            │
   │                                                                     │
   │  ✓ Platform chịu: 300,000 VND                                      │
   │  → Remaining loss: 2,700,000 VND                                   │
   └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  PRIORITY 4: INVESTORS (Phần còn lại)                              │
   │  ────────────────────────────────────                              │
   │                                                                     │
   │  Remaining: 2,700,000 VND                                          │
   │                                                                     │
   │  Phân chia theo tỷ lệ góp vốn:                                      │
   │  ┌───────────────────────────────────────────────────┐             │
   │  │ NĐT A (50%): 2.7M × 50% = 1,350,000 VND          │             │
   │  │ NĐT B (30%): 2.7M × 30% =   810,000 VND          │             │
   │  │ NĐT C (20%): 2.7M × 20% =   540,000 VND          │             │
   │  └───────────────────────────────────────────────────┘             │
   └─────────────────────────────────────────────────────────────────────┘
```

### Code Implementation

```typescript
// services/LossDistributionService.ts

interface LossDistribution {
    totalLoss: number;
    fromReserve: number;
    fromPoolProfit: number;  
    fromPlatform: number;
    fromInvestors: number;
    investorBreakdown: {
        investorId: string;
        sharePercentage: number;
        lossAmount: number;
    }[];
}

@Injectable()
export class LossDistributionService {
    
    async distributeLoss(
        defaultAmount: number,
        poolFundId: string
    ): Promise<LossDistribution> {
        
        // Lấy thông tin Pool và Reserve
        const pool = await this.poolFundModel.findById(poolFundId)
            .populate('investors');
        const reserve = await this.reserveFundModel.findOne({ poolFundId });
        
        let remaining = defaultAmount;
        const distribution: LossDistribution = {
            totalLoss: defaultAmount,
            fromReserve: 0,
            fromPoolProfit: 0,
            fromPlatform: 0,
            fromInvestors: 0,
            investorBreakdown: []
        };
        
        // ═══════════════════════════════════════════════════════
        // STEP 1: Reserve Fund (Max 60%)
        // ═══════════════════════════════════════════════════════
        const maxFromReserve = Math.min(
            remaining * 0.6,           // Max 60% of loss
            reserve.currentBalance     // But not more than available
        );
        distribution.fromReserve = maxFromReserve;
        remaining -= maxFromReserve;
        
        // Update Reserve
        await this.reserveFundModel.updateOne(
            { _id: reserve._id },
            {
                $inc: { 
                    currentBalance: -maxFromReserve,
                    totalClaimed: maxFromReserve 
                },
                $push: {
                    claims: {
                        defaultId: defaultId,
                        claimedAmount: maxFromReserve,
                        status: 'approved',
                        claimedAt: new Date()
                    }
                }
            }
        );
        
        if (remaining <= 0) return distribution;
        
        // ═══════════════════════════════════════════════════════
        // STEP 2: Pool Profit (Max 25% of remaining)
        // ═══════════════════════════════════════════════════════
        const maxFromProfit = Math.min(
            remaining * 0.25,
            pool.accruedProfit
        );
        distribution.fromPoolProfit = maxFromProfit;
        remaining -= maxFromProfit;
        
        await this.poolFundModel.updateOne(
            { _id: pool._id },
            { $inc: { accruedProfit: -maxFromProfit } }
        );
        
        if (remaining <= 0) return distribution;
        
        // ═══════════════════════════════════════════════════════
        // STEP 3: Platform (Max 10% of remaining)
        // ═══════════════════════════════════════════════════════
        const platformShare = remaining * 0.1;
        distribution.fromPlatform = platformShare;
        remaining -= platformShare;
        
        // Log platform loss for accounting
        await this.platformLossModel.create({
            amount: platformShare,
            reason: 'default_coverage',
            defaultId: defaultId,
            date: new Date()
        });
        
        if (remaining <= 0) return distribution;
        
        // ═══════════════════════════════════════════════════════
        // STEP 4: Investors (Remaining, proportional)
        // ═══════════════════════════════════════════════════════
        distribution.fromInvestors = remaining;
        
        for (const investor of pool.investors) {
            const investorLoss = remaining * (investor.sharePercentage / 100);
            
            distribution.investorBreakdown.push({
                investorId: investor.investorId.toString(),
                sharePercentage: investor.sharePercentage,
                lossAmount: investorLoss
            });
            
            // Update investor's balance
            await this.investorBalanceModel.updateOne(
                { investorId: investor.investorId },
                { $inc: { balance: -investorLoss } }
            );
            
            // Send notification
            await this.notificationService.send(investor.investorId, {
                type: 'LOSS_DISTRIBUTION',
                title: 'Thông báo chia sẻ rủi ro',
                body: `Phần rủi ro của bạn: ${this.formatMoney(investorLoss)}`,
                data: {
                    lossAmount: investorLoss,
                    defaultId: defaultId,
                    yourShare: investor.sharePercentage
                }
            });
        }
        
        return distribution;
    }
    
    private formatMoney(amount: number): string {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(amount);
    }
}
```

---

## Data Models (Simplified)

```typescript
// ═══════════════════════════════════════════════════════
// POOL FUND - Quỹ gộp từ nhà đầu tư
// ═══════════════════════════════════════════════════════
interface PoolFund {
    _id: ObjectId;
    fundId: string;                    // "POOL_001"
    name: string;                      // "BNPL Pool Q1 2026"
    
    targetAmount: number;              // 100,000,000
    currentAmount: number;             // 85,000,000
    deployedAmount: number;            // 15,000,000 (đang cho vay)
    availableAmount: number;           // 70,000,000
    
    expectedReturn: number;            // 12% annual
    accruedProfit: number;             // Lợi nhuận tích lũy
    
    investors: [{
        investorId: ObjectId;
        investedAmount: number;
        sharePercentage: number;       // Auto-calculated
        investedAt: Date;
    }];
    
    status: 'raising' | 'active' | 'closed';
}

// ═══════════════════════════════════════════════════════
// RESERVE FUND - Quỹ dự phòng rủi ro
// ═══════════════════════════════════════════════════════
interface ReserveFund {
    _id: ObjectId;
    poolFundId: ObjectId;
    
    reservePercentage: number;         // 5%
    currentBalance: number;
    targetBalance: number;             // currentAmount * 5%
    
    totalContributed: number;          // Tổng đã đóng góp
    totalClaimed: number;              // Tổng đã sử dụng
    totalRecovered: number;            // Tổng thu hồi được
    
    contributions: [{
        source: 'transaction_fee' | 'interest_spread' | 'late_fee' | 'recovery';
        amount: number;
        date: Date;
    }];
    
    claims: [{
        defaultId: ObjectId;
        claimedAmount: number;
        recoveredAmount: number;
        status: 'pending' | 'approved' | 'recovered' | 'written_off';
    }];
}

// ═══════════════════════════════════════════════════════
// CREDIT LINE - Hạn mức từng user
// ═══════════════════════════════════════════════════════
interface CreditLine {
    _id: ObjectId;
    userId: ObjectId;
    poolFundId: ObjectId;
    
    approvedLimit: number;             // 10,000,000
    usedAmount: number;                // 3,000,000
    availableAmount: number;           // 7,000,000
    
    interestRate: number;              // 1.5%/month
    
    creditScore: number;
    riskGrade: 'A' | 'B' | 'C' | 'D';
    
    status: 'active' | 'frozen' | 'closed';
}

// ═══════════════════════════════════════════════════════
// BNPL TRANSACTION - Giao dịch mua hàng
// ═══════════════════════════════════════════════════════
interface BnplTransaction {
    _id: ObjectId;
    transactionId: string;             // "BNPL_20260112_001"
    
    userId: ObjectId;
    creditLineId: ObjectId;
    merchantId: ObjectId;
    
    amount: number;
    numberOfMonths: number;
    monthlyAmount: number;
    totalAmount: number;               // Including interest
    
    installments: [{
        period: number;
        dueDate: Date;
        principalAmount: number;
        interestAmount: number;
        totalAmount: number;
        status: 'pending' | 'paid' | 'overdue' | 'defaulted';
        paidAt?: Date;
    }];
    
    status: 'active' | 'completed' | 'defaulted';
    createdAt: Date;
}

// ═══════════════════════════════════════════════════════
// MERCHANT - Cửa hàng (simplified, admin tạo sẵn)
// ═══════════════════════════════════════════════════════
interface Merchant {
    _id: ObjectId;
    merchantId: string;                // "MER_001"
    name: string;                      // "Shop Điện Thoại ABC"
    category: string;                  // "electronics"
    
    bankAccount: {
        bankName: string;
        accountNumber: string;
    };
    
    status: 'active' | 'inactive';
}
```

---

## Implementation Roadmap (12 Weeks)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ĐỒ ÁN IMPLEMENTATION (12 TUẦN)                       │
└─────────────────────────────────────────────────────────────────────────┘

 TUẦN 1-2: Foundation
 ═════════════════════════════════════════════════════════════════════════
 ■■■■░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

 • Schema: PoolFund, ReserveFund, CreditLine
 • Basic CRUD APIs
 • Investor deposit flow


 TUẦN 3-4: QR Payment
 ═════════════════════════════════════════════════════════════════════════
 ░░░░■■■■░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

 • QR Code generation (JWT)
 • Merchant POS Simulator (Web)
 • BNPL Transaction flow


 TUẦN 5-6: Installments
 ═════════════════════════════════════════════════════════════════════════
 ░░░░░░░░■■■■░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

 • Installment calculation
 • Payment schedule
 • Auto-repayment scheduler


 TUẦN 7-8: Loss Distribution ⭐
 ═════════════════════════════════════════════════════════════════════════
 ░░░░░░░░░░░░■■■■░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

 • LossDistributionService (QUAN TRỌNG)
 • Reserve Fund mechanics  
 • Collection flow basics


 TUẦN 9-10: Investor Dashboard ⭐
 ═════════════════════════════════════════════════════════════════════════
 ░░░░░░░░░░░░░░░░■■■■░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

 • Dashboard UI (Chart.js/Recharts)
 • Pool Fund visualization
 • Real-time risk indicators


 TUẦN 11-12: Polish & Demo
 ═════════════════════════════════════════════════════════════════════════
 ░░░░░░░░░░░░░░░░░░░░■■■■░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

 • Fix bugs
 • Demo scenarios
 • Documentation
 • Presentation prep


     TUẦN:  1    3    5    7    9   11   12
            │    │    │    │    │    │    │
            ▼    ▼    ▼    ▼    ▼    ▼    ▼
```

### Deliverables

| Tuần | Deliverable | Demo được |
|------|-------------|-----------|
| 2 | Pool Fund + Investor deposit | NĐT góp tiền vào quỹ |
| 4 | QR Payment | Customer quét QR tại POS |
| 6 | Installment | Xem lịch trả góp, thanh toán kỳ |
| 8 | Loss Distribution | Simulate default, xem tiền chạy |
| 10 | Investor Dashboard | Charts, metrics, notifications |
| 12 | Full demo | End-to-end flow |

---

## Demo Scenarios

### Scenario 1: Happy Path

```
1. NĐT A góp 50M vào Pool
2. NĐT B góp 30M vào Pool
3. Customer đăng ký, được cấp Credit Line 10M
4. Customer quét QR tại Shop ABC, mua 500K, trả 3 kỳ
5. Customer trả đúng hạn 3 kỳ
6. NĐT xem lợi nhuận trên Dashboard
```

### Scenario 2: Default & Loss Distribution (QUAN TRỌNG)

```
1. Pool có 100M từ 3 NĐT (50/30/20)
2. Reserve Fund có 5M (5%)
3. Customer vay 10M, không trả → DEFAULT
4. Hệ thống chạy Loss Distribution:
   - Reserve trả: 6M (60%)
   - Pool Profit trả: 1M (25%)
   - Platform chịu: 300K (10%)
   - NĐT chịu: 2.7M (5%)
     - NĐT A (50%): 1.35M
     - NĐT B (30%): 810K
     - NĐT C (20%): 540K
5. Dashboard hiển thị phân bổ loss
```

---

## API Endpoints (Minimal)

```
# Pool Fund (Investor)
POST   /pool-funds                    # Tạo pool (Admin)
GET    /pool-funds/:id                # Xem pool
POST   /pool-funds/:id/invest         # Góp vốn

# Credit Line (Customer)
GET    /credit-line                   # Xem hạn mức của mình
POST   /credit-line/apply             # Đăng ký hạn mức

# BNPL (Customer)
GET    /bnpl/qr                       # Lấy QR để thanh toán
GET    /bnpl/transactions             # Lịch sử mua
GET    /bnpl/installments             # Các kỳ trả góp
POST   /bnpl/pay-installment/:id      # Trả góp

# BNPL (Merchant POS)
POST   /bnpl/process-payment          # Xử lý khi quét QR

# Dashboard (Investor)
GET    /dashboard/pool-stats          # Thống kê pool
GET    /dashboard/risk-metrics        # Chỉ số rủi ro
GET    /dashboard/my-returns          # Lợi nhuận của tôi

# Admin
POST   /admin/merchants               # Tạo merchant mẫu
POST   /admin/simulate-default        # Simulate default để demo
```

---

## Notes

> 💡 **Tip Demo**: Khi bảo vệ đồ án, focus vào phần **Loss Distribution**. Đây là "điểm sáng" thể hiện tư duy tài chính và xử lý dữ liệu phức tạp.

> ⚠️ **Lưu ý**: Ghi rõ trong báo cáo là "Đồ án mô phỏng, không tích hợp PSP thật do yêu cầu pháp lý".
