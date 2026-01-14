# BNPL Module - Mua Trước Trả Sau với Virtual Card

> **Version**: 1.0.0  
> **Created**: 2026-01-12  
> **Status**: Planning  

---

## Mục Lục

1. [Tổng Quan](#tổng-quan)
2. [So Sánh Mô Hình](#so-sánh-mô-hình)
3. [Kiến Trúc Hệ Thống](#kiến-trúc-hệ-thống)
4. [Luồng Nghiệp Vụ](#luồng-nghiệp-vụ)
5. [Data Models](#data-models)
6. [Default Protection System](#default-protection-system)
7. [PSP Integration](#psp-integration)
8. [Implementation Roadmap](#implementation-roadmap)

---

## Tổng Quan

### Mục Tiêu

Xây dựng module BNPL (Buy Now Pay Later) tích hợp vào hệ thống P2P Lending hiện tại với các tính năng:

| Tính Năng | Mô Tả |
|-----------|-------|
| **Virtual Card** | Thẻ ảo Visa/Mastercard, thanh toán tại POS/online |
| **Pooled Fund** | Quỹ gộp từ NĐT thay vì ghép nối N-N |
| **Flexible Installments** | Trả góp 1-24 tháng tùy chọn |
| **Auto Merchant Onboarding** | Cửa hàng đăng ký tự động |
| **Default Protection** | Quỹ dự phòng + AI Risk + Collection |

### Đối Tượng Sử Dụng

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Người Dùng   │     │   Nhà Đầu Tư    │     │   Merchant      │
│   (Borrower)   │     │   (Investor)    │     │   (Store)       │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ • Đăng ký thẻ  │     │ • Góp vốn Pool  │     │ • Đăng ký cửa   │
│ • Thanh toán   │     │ • Nhận lợi nhuận│     │   hàng          │
│ • Trả góp      │     │ • Theo dõi risk │     │ • Nhận thanh    │
│                │     │                 │     │   toán          │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## So Sánh Mô Hình

### P2P Lending Hiện Tại vs BNPL

```
╔══════════════════════════════════════════════════════════════════════════╗
║                        P2P LENDING HIỆN TẠI                              ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   Người Vay 1 ───┐                              ┌─── NĐT 1              ║
║                  ├──→ [ Matching Engine ] ←──┤                        ║
║   Người Vay 2 ───┘       (Ghép N-N)            └─── NĐT 2              ║
║                              │                                          ║
║                              ▼                                          ║
║                    ┌─────────────────┐                                  ║
║                    │ Khoản Vay Lớn   │                                  ║
║                    │ (5M - 100M VND) │                                  ║
║                    └─────────────────┘                                  ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════╗
║                           BNPL MỚI                                       ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   NĐT 1 ────┐                                                           ║
║             ├──→ [ POOLED FUND ] ──→ [ Credit Lines ]                  ║
║   NĐT N ────┘    (Quỹ Gộp)             │                               ║
║                      │                  ▼                               ║
║                      │         ┌─────────────────┐                      ║
║                      │         │  Virtual Card   │                      ║
║                      │         │  User A: 10M    │                      ║
║                      │         │  User B: 5M     │                      ║
║                      │         └────────┬────────┘                      ║
║                      │                  │                               ║
║                      ▼                  ▼                               ║
║              [ Reserve Fund ]   [ BNPL Transactions ]                   ║
║              (Quỹ Dự Phòng)     (Giao Dịch Nhỏ Lẻ)                      ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### Ưu Điểm BNPL

| Tiêu Chí | P2P Lending | BNPL |
|----------|-------------|------|
| **Kích thước giao dịch** | 5M - 100M | 100K - 10M |
| **Thời gian phê duyệt** | 1-3 ngày | Tức thì |
| **Matching** | N-N phức tạp | Tự động từ Pool |
| **Thanh toán** | Chuyển khoản | Thẻ ảo tại POS |
| **Rủi ro NĐT** | Cao (1 khoản) | Thấp (phân tán) |

---

## Kiến Trúc Hệ Thống

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐     │
│   │  Mobile   │    │  Virtual  │    │  Merchant │    │  Investor │     │
│   │   App     │    │   Card    │    │    App    │    │    App    │     │
│   └─────┬─────┘    └─────┬─────┘    └─────┬─────┘    └─────┬─────┘     │
│         │                │                │                │           │
└─────────┼────────────────┼────────────────┼────────────────┼───────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY                                     │
├──────────────────────────────────────────────────────────────────────────┤
│                         NestJS Server                                     │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      NEW BNPL MODULES                           │    │
│  │                                                                 │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │    │
│  │  │  Card    │  │  BNPL    │  │ Credit   │  │ Merchant │       │    │
│  │  │ Service  │  │ Service  │  │  Line    │  │ Service  │       │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │    │
│  │                                                                 │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │    │
│  │  │  Pool    │  │ Reserve  │  │ AI Risk  │  │Collection│       │    │
│  │  │  Fund    │  │  Fund    │  │ Engine   │  │ Service  │       │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   EXISTING MODULES (Reuse)                      │    │
│  │                                                                 │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │    │
│  │  │   Auth   │  │  eKYC    │  │ Fineract │  │  Credit  │       │    │
│  │  │ Service  │  │ Service  │  │ Service  │  │ Scoring  │       │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│    MongoDB      │   │    Fineract     │   │      PSP        │
│   (BNPL Data)   │   │  (Accounting)   │   │ (Card Issuing)  │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

### Module Dependencies

```
                    ┌─────────────────┐
                    │   BnplModule    │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ VirtualCard     │ │ CreditLine      │ │ MerchantModule  │
│ Module          │ │ Module          │ │                 │
└────────┬────────┘ └────────┬────────┘ └─────────────────┘
         │                   │
         │                   ▼
         │          ┌─────────────────┐
         │          │ PoolFundModule  │
         │          └────────┬────────┘
         │                   │
         │                   ▼
         │          ┌─────────────────┐
         └─────────►│ ReserveFund     │
                    │ Module          │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ CollectionModule│
                    └─────────────────┘
```

---

## Luồng Nghiệp Vụ

### Flow 1: Đăng Ký Virtual Card + Credit Line

```
┌──────┐     ┌──────┐     ┌──────┐     ┌──────┐     ┌──────┐     ┌──────┐
│ User │     │ App  │     │Server│     │ eKYC │     │ PSP  │     │Fineract│
└──┬───┘     └──┬───┘     └──┬───┘     └──┬───┘     └──┬───┘     └──┬───┘
   │            │            │            │            │            │
   │ 1. Đăng ký │            │            │            │            │
   │ thẻ BNPL   │            │            │            │            │
   │───────────>│            │            │            │            │
   │            │            │            │            │            │
   │            │ 2. POST    │            │            │            │
   │            │ /bnpl/apply│            │            │            │
   │            │───────────>│            │            │            │
   │            │            │            │            │            │
   │            │            │ 3. Kiểm tra│            │            │
   │            │            │    eKYC    │            │            │
   │            │            │───────────>│            │            │
   │            │            │            │            │            │
   │            │            │<───────────│            │            │
   │            │            │  eKYC OK ✓ │            │            │
   │            │            │            │            │            │
   │            │            │ 4. Get Credit Score     │            │
   │            │            │─────────────────────────────────────>│
   │            │            │            │            │            │
   │            │            │<─────────────────────────────────────│
   │            │            │ Score: 650, Limit: 10M  │            │
   │            │            │            │            │            │
   │            │            │ 5. Create Virtual Card  │            │
   │            │            │───────────────────────>│            │
   │            │            │            │            │            │
   │            │            │<───────────────────────│            │
   │            │            │ Card Token + PAN       │            │
   │            │            │            │            │            │
   │            │ 6. Card    │            │            │            │
   │            │ Created ✓  │            │            │            │
   │            │<───────────│            │            │            │
   │            │            │            │            │            │
   │ 7. Hiển thị│            │            │            │            │
   │ thẻ ảo     │            │            │            │            │
   │<───────────│            │            │            │            │
   │            │            │            │            │            │
```

### Flow 2: Thanh Toán BNPL tại Merchant

```
┌──────┐     ┌──────┐     ┌──────┐     ┌──────┐     ┌──────┐     ┌──────┐
│ User │     │ POS  │     │ Visa │     │ PSP  │     │Server│     │ Pool │
└──┬───┘     └──┬───┘     └──┬───┘     └──┬───┘     └──┬───┘     └──┬───┘
   │            │            │            │            │            │
   │ 1. Tap thẻ│            │            │            │            │
   │ (500K VND)│            │            │            │            │
   │───────────>│            │            │            │            │
   │            │            │            │            │            │
   │            │ 2. Auth   │            │            │            │
   │            │ Request   │            │            │            │
   │            │───────────>│            │            │            │
   │            │            │            │            │            │
   │            │            │ 3. Route to│            │            │
   │            │            │ Issuer     │            │            │
   │            │            │───────────>│            │            │
   │            │            │            │            │            │
   │            │            │            │ 4. Webhook│            │
   │            │            │            │ Auth Req  │            │
   │            │            │            │───────────>│            │
   │            │            │            │            │            │
   │            │            │            │            │ 5. Check: │
   │            │            │            │            │ - Limit   │
   │            │            │            │            │ - Status  │
   │            │            │            │            │ - Merchant│
   │            │            │            │            │            │
   │            │            │            │            │ 6. Reserve│
   │            │            │            │            │ Funds     │
   │            │            │            │            │───────────>│
   │            │            │            │            │            │
   │            │            │            │            │<───────────│
   │            │            │            │            │ Funds OK ✓│
   │            │            │            │            │            │
   │            │            │            │ 7. Approve│            │
   │            │            │            │ (00)      │            │
   │            │            │            │<───────────│            │
   │            │            │            │            │            │
   │            │            │<───────────│            │            │
   │            │<───────────│            │            │            │
   │<───────────│            │            │            │            │
   │ ✓ Approved │            │            │            │            │
   │            │            │            │            │            │
   │ 8. Push: Đã mua 500K    │            │            │            │
   │    Trả 3 kỳ x 170K      │            │            │            │
   │<────────────────────────────────────────────────────────────────│
   │            │            │            │            │            │
```

### Flow 3: Trả Góp Hàng Kỳ

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         AUTO REPAYMENT FLOW                              │
└──────────────────────────────────────────────────────────────────────────┘

  ┌─────────────┐
  │ Cron Job    │       Every day at 00:00
  │ (Scheduler) │       ───────────────────►
  └──────┬──────┘
         │
         ▼
  ┌────────────────────────────────────────┐
  │ Find Due Installments                  │
  │ WHERE dueDate = TODAY                  │
  │ AND status = 'pending'                 │
  └───────────────────┬────────────────────┘
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
  ┌─────────────┐           ┌─────────────┐
  │ Installment │           │ Installment │
  │   User A    │           │   User B    │
  │   170,000   │           │   500,000   │
  └──────┬──────┘           └──────┬──────┘
         │                         │
         ▼                         ▼
  ┌─────────────────────────────────────────┐
  │        Auto-Debit from Wallet           │
  │        (via Fineract Savings)           │
  └───────────────────┬─────────────────────┘
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
  ┌─────────────┐           ┌─────────────┐
  │  ✓ SUCCESS  │           │  ✗ FAILED   │
  └──────┬──────┘           └──────┬──────┘
         │                         │
         ▼                         ▼
  ┌─────────────┐           ┌─────────────┐
  │• Update     │           │• Mark as    │
  │  status=paid│           │  'overdue'  │
  │• Restore    │           │• Send Push  │
  │  credit     │           │  Notification│
  │• Return to  │           │• Start Grace│
  │  Pool       │           │  Period     │
  └─────────────┘           └─────────────┘
```

### Flow 4: Collection (Thu Hồi Nợ)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        COLLECTION STATE MACHINE                         │
└─────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────┐
                              │   ON TIME    │
                              │  (Đúng hạn)  │
                              └──────┬───────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
                    ▼                                 ▼
           ┌──────────────┐                  ┌──────────────┐
           │  COMPLETED   │                  │   OVERDUE    │
           │   ✓ Done     │                  │  (1-7 ngày)  │
           └──────────────┘                  └──────┬───────┘
                                                    │
                                      ┌─────────────┤
                                      │             │
                              [Thanh toán]   [Không thanh toán]
                                      │             │
                                      ▼             ▼
                             ┌──────────────┐ ┌──────────────┐
                             │  COMPLETED   │ │GRACE PERIOD  │
                             │   ✓ Done     │ │ (Auto-remind)│
                             └──────────────┘ └──────┬───────┘
                                                     │
                                       ┌─────────────┤
                                       │             │
                               [Thanh toán]   [Quá 7 ngày]
                                       │             │
                                       ▼             ▼
                              ┌──────────────┐ ┌──────────────┐
                              │  COMPLETED   │ │EARLY COLLECT │
                              │   ✓ Done     │ │ (8-30 ngày)  │
                              └──────────────┘ │ • SMS        │
                                               │ • Push       │
                                               │ • Email      │
                                               └──────┬───────┘
                                                      │
                                        ┌─────────────┤
                                        │             │
                                [Thanh toán]   [Quá 30 ngày]
                                        │             │
                                        ▼             ▼
                               ┌──────────────┐ ┌──────────────┐
                               │  COMPLETED   │ │LATE COLLECT  │
                               │   ✓ Done     │ │ (31-90 ngày) │
                               └──────────────┘ │ • Call       │
                                                │ • Letter     │
                                                │ • Late Fee   │
                                                └──────┬───────┘
                                                       │
                                         ┌─────────────┤
                                         │             │
                                 [Thanh toán    [Quá 90 ngày]
                                  + phí]              │
                                         │             │
                                         ▼             ▼
                                ┌──────────────┐ ┌──────────────┐
                                │  COMPLETED   │ │   DEFAULT    │
                                │   ✓ Done     │ │ (Nợ xấu)     │
                                └──────────────┘ └──────┬───────┘
                                                        │
                                          ┌─────────────┼─────────────┐
                                          │             │             │
                                          ▼             ▼             ▼
                                   ┌───────────┐ ┌───────────┐ ┌───────────┐
                                   │ RECOVERY  │ │  LEGAL    │ │ WRITE-OFF │
                                   │(Thu hồi   │ │ (Pháp lý) │ │ (Xóa nợ)  │
                                   │ được)     │ │           │ │           │
                                   └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
                                         │             │             │
                                         └──────┬──────┴──────┬──────┘
                                                │             │
                                                ▼             ▼
                                         ┌───────────┐ ┌───────────┐
                                         │ Refund to │ │ Claim from│
                                         │ Pool Fund │ │ Reserve   │
                                         └───────────┘ └───────────┘
```

---

## Data Models

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BNPL DATA MODEL                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│    User      │        │  CreditLine  │        │ VirtualCard  │
├──────────────┤        ├──────────────┤        ├──────────────┤
│ _id          │───1:1──│ userId       │───1:1──│ creditLineId │
│ username     │        │ approvedLimit│        │ cardToken    │
│ phone        │        │ usedAmount   │        │ cardNumber   │
│ email        │        │ interestRate │        │ status       │
│ fineractId   │        │ status       │        │ dailyLimit   │
└──────────────┘        └──────────────┘        └──────────────┘
                               │
                               │ 1:N
                               ▼
                        ┌──────────────┐
                        │BnplTransaction│
                        ├──────────────┤
                        │ transactionId│
                        │ amount       │
                        │ merchantId   │──────────┐
                        │ status       │          │
                        └──────────────┘          │
                               │                  │
                               │ 1:1              │ N:1
                               ▼                  ▼
                        ┌──────────────┐  ┌──────────────┐
                        │InstallmentPlan│  │   Merchant   │
                        ├──────────────┤  ├──────────────┤
                        │ numberOfMonths│  │ merchantId   │
                        │ monthlyAmount │  │ businessName │
                        │ installments[]│  │ bankAccount  │
                        │ status       │  │ status       │
                        └──────────────┘  └──────────────┘


┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│  PooledFund  │───1:1──│ ReserveFund  │        │CollectionCase│
├──────────────┤        ├──────────────┤        ├──────────────┤
│ fundId       │        │ currentBalance│        │ transactionId│
│ targetAmount │        │ contributions│        │ stage        │
│ currentAmount│        │ claims       │        │ daysOverdue  │
│ investors[]  │        └──────────────┘        │ actions[]    │
└──────────────┘                                └──────────────┘
```

### Schema Definitions

```typescript
// ==================== VIRTUAL CARD ====================
interface VirtualCard {
    _id: ObjectId;
    userId: ObjectId;
    cardNumber: string;              // PAN (masked)
    cardToken: string;               // Token từ PSP
    expiryMonth: number;
    expiryYear: number;
    cvvHash: string;                 // Hashed
    
    cardType: 'virtual';
    network: 'visa' | 'mastercard';
    status: 'pending' | 'active' | 'frozen' | 'cancelled';
    
    dailyLimit: number;
    monthlyLimit: number;
    singleTransactionLimit: number;
    
    creditLineId: ObjectId;
    isBnplEnabled: boolean;
    
    createdAt: Date;
    activatedAt: Date;
    lastUsedAt: Date;
}

// ==================== CREDIT LINE ====================
interface CreditLine {
    _id: ObjectId;
    userId: ObjectId;
    
    approvedLimit: number;           // Hạn mức (VND)
    usedAmount: number;
    availableAmount: number;
    
    creditScore: number;
    riskGrade: 'A' | 'B' | 'C' | 'D';
    
    interestRate: number;            // %/tháng
    gracePeriodDays: number;         // 0-45 ngày
    
    status: 'pending' | 'approved' | 'suspended' | 'closed';
    approvedAt: Date;
    
    fineractClientId: number;
}

// ==================== INSTALLMENT PLAN ====================
interface InstallmentPlan {
    _id: ObjectId;
    userId: ObjectId;
    transactionId: ObjectId;
    
    numberOfMonths: number;          // 1-24 tháng
    monthlyAmount: number;
    totalAmount: number;
    
    interestRate: number;
    processingFee: number;
    latePaymentFee: number;
    
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
}

// ==================== POOLED FUND ====================
interface PooledFund {
    _id: ObjectId;
    fundId: string;                  // FUND_BNPL_001
    
    name: string;
    description: string;
    
    targetAmount: number;
    currentAmount: number;
    deployedAmount: number;
    availableAmount: number;
    
    expectedAnnualReturn: number;
    actualReturn: number;
    
    maxDefaultRate: number;
    currentDefaultRate: number;
    
    investors: [{
        investorId: ObjectId;
        investedAmount: number;
        sharePercentage: number;
        investedAt: Date;
    }];
    
    status: 'raising' | 'active' | 'closed';
    createdAt: Date;
}

// ==================== RESERVE FUND ====================
interface ReserveFund {
    _id: ObjectId;
    poolFundId: ObjectId;
    
    reservePercentage: number;       // 5%
    currentBalance: number;
    targetBalance: number;
    
    totalClaimed: number;
    totalRecovered: number;
    
    contributions: [{
        source: 'investor_fee' | 'interest_spread' | 'late_fee' | 'recovery';
        amount: number;
        date: Date;
    }];
    
    claims: [{
        defaultId: ObjectId;
        claimedAmount: number;
        recoveredAmount: number;
        status: 'pending' | 'approved' | 'recovered' | 'written_off';
        claimedAt: Date;
    }];
}

// ==================== MERCHANT ====================
interface Merchant {
    _id: ObjectId;
    merchantId: string;              // MER_xxxxx
    
    businessName: string;
    businessType: 'retail' | 'ecommerce' | 'service' | 'restaurant';
    taxId: string;
    
    email: string;
    phone: string;
    address: string;
    
    bankAccount: {
        bankName: string;
        accountNumber: string;
        accountHolder: string;
    };
    settlementCycle: 'daily' | 'weekly' | 'monthly';
    
    bnplEnabled: boolean;
    allowedInstallmentPlans: number[];  // [1,2,3,6,12]
    merchantFeePercentage: number;      // MDR
    
    status: 'pending' | 'active' | 'suspended';
    verifiedAt: Date;
    
    fineractClientId?: number;
    fineractSavingsAccountId?: number;
}
```

---

## Default Protection System

### 🛡️ Tầng Bảo Vệ

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                        DEFAULT PROTECTION LAYERS                          ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                           ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │                     LAYER 1: PREVENTION                             │ ║
║  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐             │ ║
║  │  │ eKYC Verify   │ │ AI Risk Score │ │ Dynamic Limit │             │ ║
║  │  │ (Xác thực)    │ │ (Chấm điểm)   │ │ (Hạn mức)     │             │ ║
║  │  └───────────────┘ └───────────────┘ └───────────────┘             │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                    │                                      ║
║                                    ▼                                      ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │                     LAYER 2: DETECTION                              │ ║
║  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐             │ ║
║  │  │ Payment       │ │ Early Warning │ │ Fraud         │             │ ║
║  │  │ Monitoring    │ │ System        │ │ Detection     │             │ ║
║  │  └───────────────┘ └───────────────┘ └───────────────┘             │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                    │                                      ║
║                                    ▼                                      ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │                     LAYER 3: PROTECTION                             │ ║
║  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐             │ ║
║  │  │ Reserve Fund  │ │ Collection    │ │ Legal Action  │             │ ║
║  │  │ (Quỹ dự phòng)│ │ (Thu hồi)     │ │ (Pháp lý)     │             │ ║
║  │  └───────────────┘ └───────────────┘ └───────────────┘             │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                    │                                      ║
║                                    ▼                                      ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │                     LAYER 4: DISTRIBUTION                           │ ║
║  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐             │ ║
║  │  │ Loss Sharing  │ │ Insurance     │ │ Recovery      │             │ ║
║  │  │ (Chia sẻ lỗ) │ │ (Bảo hiểm)    │ │ (Thu hồi)     │             │ ║
║  │  └───────────────┘ └───────────────┘ └───────────────┘             │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

### Reserve Fund Mechanism

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    QUỸ DỰ PHÒNG RỦI RO (RESERVE FUND)                   │
└─────────────────────────────────────────────────────────────────────────┘

                         NGUỒN VÀO (CONTRIBUTIONS)
                         ─────────────────────────
    
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │ 5% từ mỗi      │  │ 50% Spread      │  │ 100% Phí        │
    │ giao dịch BNPL │  │ lãi suất        │  │ trễ hạn         │
    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
             │                    │                    │
             └────────────────────┼────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │                         │
                    │    RESERVE FUND         │
                    │    (Quỹ Dự Phòng)       │
                    │                         │
                    │  Current: 500,000,000   │
                    │  Target:  1,000,000,000 │
                    │                         │
                    └────────────┬────────────┘
                                 │
                                 ▼
                         NGUỒN RA (CLAIMS)
                         ────────────────

              ┌──────────────────────────────────────┐
              │   Khi có DEFAULT (Nợ xấu):           │
              │                                      │
              │   Default Amount: 10,000,000 VND     │
              │                                      │
              │   ┌────────────────────────────┐    │
              │   │ Priority 1: Reserve (60%)  │    │
              │   │ → 6,000,000 từ Quỹ        │    │
              │   ├────────────────────────────┤    │
              │   │ Priority 2: Pool (25%)     │    │
              │   │ → 2,500,000 từ lợi nhuận  │    │
              │   ├────────────────────────────┤    │
              │   │ Priority 3: Platform (10%) │    │
              │   │ → 1,000,000 Platform chịu │    │
              │   ├────────────────────────────┤    │
              │   │ Priority 4: Investors (5%) │    │
              │   │ → 500,000 NĐT chịu        │    │
              │   └────────────────────────────┘    │
              └──────────────────────────────────────┘
```

### Loss Distribution Algorithm

```javascript
async function distributeLoss(defaultAmount, poolFundId) {
    // Lấy thông tin pool và reserve
    const pool = await PoolFund.findById(poolFundId);
    const reserve = await ReserveFund.findOne({ poolFundId });
    
    let remaining = defaultAmount;
    const distribution = {
        totalLoss: defaultAmount,
        fromReserve: 0,
        fromPoolProfit: 0,
        fromPlatform: 0,
        fromInvestors: 0
    };
    
    // STEP 1: Reserve Fund (tối đa 60%)
    // ─────────────────────────────────
    const maxFromReserve = Math.min(
        remaining * 0.6, 
        reserve.currentBalance
    );
    distribution.fromReserve = maxFromReserve;
    remaining -= maxFromReserve;
    
    // Cập nhật Reserve
    await reserve.updateOne({
        $inc: { currentBalance: -maxFromReserve },
        $push: {
            claims: {
                amount: maxFromReserve,
                status: 'approved',
                claimedAt: new Date()
            }
        }
    });
    
    // STEP 2: Pool Profit (tối đa 25% remaining)
    // ──────────────────────────────────────────
    const maxFromProfit = Math.min(
        remaining * 0.25, 
        pool.accruedProfit
    );
    distribution.fromPoolProfit = maxFromProfit;
    remaining -= maxFromProfit;
    
    // STEP 3: Platform (tối đa 10% remaining)
    // ───────────────────────────────────────
    const maxFromPlatform = remaining * 0.1;
    distribution.fromPlatform = maxFromPlatform;
    remaining -= maxFromPlatform;
    
    // STEP 4: Investors (phần còn lại)
    // ────────────────────────────────
    distribution.fromInvestors = remaining;
    
    // Phân phối loss cho từng NĐT theo tỷ lệ
    if (distribution.fromInvestors > 0) {
        for (const investor of pool.investors) {
            const investorLoss = distribution.fromInvestors 
                * (investor.sharePercentage / 100);
            
            await notifyInvestor(investor.investorId, {
                type: 'loss_distribution',
                amount: investorLoss,
                message: `Chia sẻ rủi ro: ${formatMoney(investorLoss)}`
            });
        }
    }
    
    return distribution;
}
```

---

## PSP Integration

### Sandbox Options

| PSP | Sandbox URL | Documentation |
|-----|-------------|---------------|
| **Marqeta** | sandbox-api.marqeta.com | [Marqeta Docs](https://www.marqeta.com/docs) |
| **Stripe Issuing** | api.stripe.com (test mode) | [Stripe Issuing](https://stripe.com/docs/issuing) |
| **Galileo** | sandbox.galileo-ft.com | [Galileo API](https://docs.galileo-ft.com) |

### Webhook Events to Handle

```javascript
// Các webhook events cần xử lý từ PSP
const WEBHOOK_EVENTS = {
    // Card Lifecycle
    'card.created': handleCardCreated,
    'card.activated': handleCardActivated,
    'card.blocked': handleCardBlocked,
    
    // Transactions
    'authorization.request': handleAuthRequest,    // CRITICAL
    'authorization.advice': handleAuthAdvice,
    'transaction.completed': handleTxCompleted,
    
    // Settlements
    'settlement.completed': handleSettlement,
    
    // Fraud
    'fraud.alert': handleFraudAlert,
    'chargeback.created': handleChargeback,
};

// Handler cho Authorization Request (real-time decision)
async function handleAuthRequest(event) {
    const { amount, cardToken, merchantId } = event.data;
    
    // 1. Tìm card và credit line
    const card = await VirtualCard.findOne({ cardToken });
    const creditLine = await CreditLine.findById(card.creditLineId);
    
    // 2. Kiểm tra điều kiện
    const checks = {
        cardActive: card.status === 'active',
        withinLimit: amount <= creditLine.availableAmount,
        merchantAllowed: await isMerchantAllowed(merchantId),
        notFrozen: !card.isFrozen,
    };
    
    // 3. Decision
    if (Object.values(checks).every(Boolean)) {
        // Approve
        await reserveFunds(creditLine, amount);
        return { approved: true, code: '00' };
    } else {
        // Decline
        return { approved: false, code: '51' };
    }
}
```

---

## Implementation Roadmap

### Timeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BNPL IMPLEMENTATION ROADMAP                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 1: Foundation (5 weeks)                           [Weeks 1-5]       │
│  ════════════════════════════════════════════════════════════════════      │
│  ■■■■■■■■■■■■■■■■■■■■░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                      │
│                                                                             │
│  • Pool Fund Module + Reserve Fund                                          │
│  • AI Risk Scoring (extend CreditScoringService)                           │
│  • Merchant auto-onboarding                                                 │
│                                                                             │
│  PHASE 2: Card Integration (6 weeks)                     [Weeks 6-11]      │
│  ════════════════════════════════════════════════════════════════════      │
│  ░░░░░░░░░░░░░░░░░░░░■■■■■■■■■■■■■■■■■■■■■■■■░░░░░░░░                      │
│                                                                             │
│  • PSP Sandbox integration (Marqeta/Stripe)                                │
│  • Virtual Card issuing                                                     │
│  • Authorization webhooks                                                   │
│                                                                             │
│  PHASE 3: BNPL Flow (5 weeks)                            [Weeks 12-16]     │
│  ════════════════════════════════════════════════════════════════════      │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░■■■■■■■■■■■■■■■■■■■■          │
│                                                                             │
│  • Flexible installment (1-24 months)                                       │
│  • Payment processing                                                       │
│  • Basic collection workflow                                                │
│                                                                             │
│  PHASE 4: Protection System (4 weeks)                    [Weeks 17-20]     │
│  ════════════════════════════════════════════════════════════════════      │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░■■■■■■■■■■■■      │
│                                                                             │
│  • Early Warning System                                                     │
│  • Loss Distribution engine                                                 │
│  • Investor reporting                                                       │
│                                                                             │
│  PHASE 5: Production (3 weeks)                           [Weeks 21-23]     │
│  ════════════════════════════════════════════════════════════════════      │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░■■■■■■    │
│                                                                             │
│  • PSP production credentials                                               │
│  • BIN sponsor integration                                                  │
│  • Compliance review                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

                          Week: 1   5   10  15  20  23
                                |   |    |   |   |   |
                                ▼   ▼    ▼   ▼   ▼   ▼
```

### Detailed Tasks

| Phase | Task | Duration | Dependencies |
|-------|------|----------|--------------|
| **1** | PoolFundModule schema + CRUD | 1w | - |
| **1** | ReserveFund logic | 1w | PoolFund |
| **1** | Extend CreditScoringService for BNPL | 1.5w | - |
| **1** | Merchant auto-onboarding API | 1.5w | - |
| **2** | PSP SDK integration | 2w | - |
| **2** | Card creation flow | 1.5w | PSP |
| **2** | Authorization webhook handler | 2w | Card |
| **2** | Card management APIs | 0.5w | Card |
| **3** | InstallmentPlan calculator | 1w | - |
| **3** | BNPL transaction flow | 2w | Card, Installment |
| **3** | Auto-repayment scheduler | 1w | Transaction |
| **3** | Basic collection workflow | 1w | Repayment |
| **4** | Early Warning System | 1.5w | Transaction |
| **4** | LossDistributionService | 1.5w | Reserve, Pool |
| **4** | Investor dashboard | 1w | Loss |
| **5** | Production PSP setup | 1w | All |
| **5** | BIN sponsor integration | 1w | PSP |
| **5** | Security audit + compliance | 1w | All |

---

## API Endpoints (New)

### Card APIs

```
POST   /bnpl/cards                 # Đăng ký thẻ mới
GET    /bnpl/cards                 # Danh sách thẻ của user
GET    /bnpl/cards/:id             # Chi tiết thẻ
PATCH  /bnpl/cards/:id/freeze      # Đóng băng thẻ
PATCH  /bnpl/cards/:id/unfreeze    # Mở khóa thẻ
DELETE /bnpl/cards/:id             # Hủy thẻ
```

### Credit Line APIs

```
GET    /bnpl/credit-line           # Xem hạn mức hiện tại
POST   /bnpl/credit-line/apply     # Đăng ký hạn mức
POST   /bnpl/credit-line/increase  # Yêu cầu tăng hạn mức
```

### Transaction APIs

```
GET    /bnpl/transactions          # Lịch sử giao dịch BNPL
GET    /bnpl/transactions/:id      # Chi tiết giao dịch
POST   /bnpl/pay                   # Thanh toán kỳ hạn
POST   /bnpl/pay-early             # Thanh toán sớm
```

### Installment APIs

```
GET    /bnpl/installments          # Danh sách kỳ trả góp
GET    /bnpl/installments/:id      # Chi tiết kỳ
POST   /bnpl/installments/simulate # Tính toán trước
```

### Merchant APIs

```
POST   /merchants/register         # Đăng ký merchant (auto)
GET    /merchants/me               # Thông tin merchant
GET    /merchants/transactions     # Giao dịch của merchant
GET    /merchants/settlements      # Lịch sử settlement
```

### Pool Fund APIs (Investor)

```
GET    /pool-funds                 # Danh sách quỹ
GET    /pool-funds/:id             # Chi tiết quỹ
POST   /pool-funds/:id/invest      # Góp vốn vào quỹ
GET    /pool-funds/:id/returns     # Lợi nhuận
GET    /pool-funds/:id/risks       # Thông tin rủi ro
```

### Webhook (PSP → Server)

```
POST   /webhooks/psp/marqeta       # Marqeta webhooks
POST   /webhooks/psp/stripe        # Stripe webhooks
```

---

## Notes

> ⚠️ **Licensing**: BNPL ở Vietnam cần giấy phép hoạt động tín dụng từ NHNN và hợp tác với ngân hàng có BIN.

> 💡 **Tip**: Có thể bắt đầu với mô hình QR Payment (không cần BIN) trước khi có đủ license cho card issuing.
