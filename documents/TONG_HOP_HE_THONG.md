# 📚 Tổng Hợp Hệ Thống P2P Lending Platform

> **Tài liệu khám phá và tổng hợp về hệ thống P2P Lending Platform**  
> Bao gồm: `server_do_an_new` (Backend API) và `client_app` (Mobile App)

---

## 📋 Mục Lục

1. [Tổng Quan Hệ Thống](#tổng-quan-hệ-thống)
2. [Kiến Trúc Tổng Thể](#kiến-trúc-tổng-thể)
3. [Server (Backend API)](#server-backend-api)
4. [Client App (Mobile)](#client-app-mobile)
5. [Luồng Dữ Liệu Chính](#luồng-dữ-liệu-chính)
6. [Tích Hợp External Services](#tích-hợp-external-services)
7. [Các Tính Năng Chính](#các-tính-năng-chính)

---

## 🎯 Tổng Quan Hệ Thống

### Mục Đích
Hệ thống **P2P Lending Platform** là nền tảng cho vay ngang hàng (Peer-to-Peer Lending) kết hợp với tính năng **BNPL (Buy Now Pay Later)** - Trả sau mua trước.

### Thành Phần Chính

```
┌─────────────────────────────────────────────────────────────┐
│                    P2P Lending Platform                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐         ┌──────────────┐                │
│  │  Client App  │◄───────►│  Server API  │                │
│  │  (React      │  HTTP   │  (NestJS)     │                │
│  │   Native)    │         │               │                │
│  └──────────────┘         └───────┬───────┘                │
│                                    │                         │
│                          ┌─────────┴─────────┐            │
│                          │                    │            │
│                    ┌─────▼─────┐      ┌──────▼──────┐      │
│                    │ Keycloak  │      │  Fineract   │      │
│                    │   (Auth)   │      │  (Banking)  │      │
│                    └───────────┘      └─────────────┘      │
│                                                              │
│                          ┌───────────┐                      │
│                          │  MongoDB   │                      │
│                          │  (Cache)   │                      │
│                          └───────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Kiến Trúc Tổng Thể

### Technology Stack

| Component | Technology | Version | Mục Đích |
|-----------|-----------|---------|----------|
| **Backend** | NestJS | 11.x | Enterprise Node.js framework |
| **Frontend** | React Native + Expo | ~54.0 | Cross-platform mobile app |
| **Database** | MongoDB | 9.x | User data & metadata cache |
| **Auth** | Keycloak | Latest | OAuth2/OIDC Identity Provider |
| **Banking Core** | Apache Fineract | Latest | Core Banking System |
| **Language** | TypeScript | 5.x | Type-safe development |

### External Services

- **Keycloak** (Port 9000): Authentication & Authorization
- **Apache Fineract** (Port 8080): Core Banking Operations
- **MongoDB** (Port 27017): Metadata & Cache Storage
- **eKYC Service** (Port 8000): OCR & Face Detection

---

## 🖥️ Server (Backend API)

### 📁 Cấu Trúc Project

```
server_do_an_new/
├── src/
│   ├── common/                    # Shared utilities
│   │   ├── decorators/            # @CurrentUser(), @Public()
│   │   ├── filters/               # Exception handlers
│   │   ├── interceptors/          # Request/Response transformers
│   │   └── interfaces/            # Global interfaces
│   │
│   ├── config/                    # Configuration
│   │   ├── configuration.ts       # Typed config
│   │   ├── validation.ts          # Env validation
│   │   └── swagger.config.ts      # API docs setup
│   │
│   ├── modules/                   # Feature modules
│   │   ├── auth/                  # Authentication
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── keycloak.service.ts
│   │   │   │   └── fineract-signup.service.ts
│   │   │   ├── guards/
│   │   │   │   └── jwt-auth.guard.ts
│   │   │   └── strategies/
│   │   │       └── jwt.strategy.ts
│   │   │
│   │   ├── bnpl/                  # ⭐ BNPL Module
│   │   │   ├── bnpl.service.ts    # Core BNPL logic
│   │   │   ├── bnpl.controller.ts # API endpoints
│   │   │   ├── dto/
│   │   │   │   ├── create-bnpl-loan.dto.ts
│   │   │   │   └── preview-bnpl-loan.dto.ts
│   │   │   └── schemas/
│   │   │       ├── bnpl-loan.schema.ts
│   │   │       └── bnpl-wallet.schema.ts
│   │   │
│   │   ├── wallets/               # Wallet Management
│   │   │   ├── wallets.service.ts # Wallet operations
│   │   │   └── schemas/
│   │   │       └── wallet.schema.ts
│   │   │
│   │   ├── fineract/              # Fineract Integration
│   │   │   └── fineract.service.ts
│   │   │
│   │   ├── users/                 # User Management
│   │   │   └── schemas/
│   │   │       └── user.schema.ts
│   │   │
│   │   └── health/                # Health Check
│   │
│   ├── utils/                     # Utilities
│   │   └── RoundingUtils.ts       # Currency rounding
│   │
│   ├── app.module.ts              # Root module
│   └── main.ts                    # Entry point
│
├── documents/                     # Documentation
│   ├── DEVELOPER_GUIDE.md
│   ├── AUTHENTICATION_DEEP_DIVE.md
│   ├── CLASS_DIAGRAM.md
│   └── SEQUENCE_DIAGRAMS.md
│
├── .env.example                   # Environment template
├── package.json
└── tsconfig.json
```

### 🔑 Modules Chính

#### 1. **Auth Module** - Authentication & Authorization

**Chức năng:**
- Đăng ký user (Keycloak + Fineract Client)
- Đăng nhập (JWT tokens)
- Refresh token
- Quản lý session

**Flow:**
```
Register → Keycloak User → Fineract Client → Savings Account → JWT Token
Login → Keycloak Token → NestJS JWT → Access Token + Refresh Token
```

**Key Files:**
- `auth.service.ts`: JWT generation, token management
- `keycloak.service.ts`: Keycloak Admin API integration
- `fineract-signup.service.ts`: Registration flow với Fineract

#### 2. **BNPL Module** - Buy Now Pay Later ⭐

**Chức năng:**
- Tạo ví BNPL (credit wallet)
- Tạo khoản vay BNPL (auto-approve, auto-disburse)
- Preview lịch trả nợ (public endpoint)
- Quản lý hạn mức thấu chi
- Lịch trả nợ tổng hợp (consolidated schedule)
- Đồng bộ trạng thái từ Fineract

**Key Features:**
- ✅ Auto-approve & auto-disburse
- ✅ Credit limit management
- ✅ Repayment schedule calculation
- ✅ Real-time sync với Fineract
- ✅ Multiple loans consolidation

**API Endpoints:**
```
POST   /api/bnpl/preview          # Preview loan (public)
GET    /api/bnpl/wallet           # Get wallet info
GET    /api/bnpl/wallet/balance   # Get balance
POST   /api/bnpl/loans            # Create loan
GET    /api/bnpl/loans            # List loans
GET    /api/bnpl/loans/:id        # Loan details
POST   /api/bnpl/loans/:id/sync   # Sync status
GET    /api/bnpl/schedule         # Consolidated schedule
```

**Data Flow:**
```
Create Loan → Check Credit Limit → Fineract Loan Creation → 
Auto Approve → Auto Disburse → Update Wallet Used Credit → 
Return Loan Details
```

#### 3. **Wallets Module** - Wallet Management

**Chức năng:**
- Lấy danh sách ví (e-wallet, credit-wallet)
- Lấy số dư real-time từ Fineract
- Chuyển tiền giữa các ví
- Chuyển tiền theo số điện thoại
- Lịch sử giao dịch
- Đồng bộ ví từ Fineract

**Key Features:**
- ✅ Fineract là source of truth cho balance
- ✅ MongoDB chỉ lưu metadata (reference)
- ✅ Real-time balance fetching
- ✅ Transfer between wallets
- ✅ Transaction history

**API Endpoints:**
```
GET    /api/wallets               # List all wallets
GET    /api/wallets/:id           # Wallet details
GET    /api/wallets/:id/balance  # Get balance
POST   /api/wallets/transfer      # Transfer between wallets
POST   /api/wallets/transfer-phone # Transfer by phone
GET    /api/wallets/:id/transactions # Transaction history
POST   /api/wallets/sync          # Sync from Fineract
```

#### 4. **Fineract Module** - Banking Core Integration

**Chức năng:**
- Tạo Client trong Fineract
- Tạo Savings Account (e-wallet, credit-wallet)
- Tạo Loan Account
- Quản lý transactions
- Lấy repayment schedule
- Transfer funds

**Key Methods:**
- `createClient()`: Tạo Fineract client
- `createSavingsAccount()`: Tạo savings account
- `createAndDisburseLoan()`: Tạo và giải ngân loan
- `getLoanDetails()`: Chi tiết loan
- `getRepaymentSchedule()`: Lịch trả nợ
- `transferFunds()`: Chuyển tiền
- `getSavingsAccountDetails()`: Chi tiết savings account

### 🔐 Authentication Flow

```
1. User Login (Client App)
   ↓
2. Keycloak Token Exchange
   ↓
3. NestJS Login Endpoint
   ↓
4. Generate JWT Access Token + Refresh Token
   ↓
5. Store tokens in httpOnly cookie (refresh) + response (access)
   ↓
6. Client uses Access Token for API calls
   ↓
7. Token expires → Use Refresh Token → New Access Token
```

### 📊 Database Schema

#### User Schema
```typescript
{
  _id: ObjectId,
  keycloakUserId: string,
  fineractClientId: string,
  username: string,        // Phone number
  email?: string,
  roles: string[],
  metadata: {
    phone?: string,
    firstName?: string,
    lastName?: string
  }
}
```

#### BNPL Wallet Schema
```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  creditLimit: number,      // Default: 5,000,000 VND
  usedCredit: number,       // Tổng số tiền đã vay
  status: 'active' | 'suspended' | 'closed'
}
```

#### BNPL Loan Schema
```typescript
{
  _id: ObjectId,
  walletId: ObjectId,
  userId: ObjectId,
  fineractLoanId: string,   // ID trong Fineract (source of truth)
  principal: number,
  totalInterest: number,    // Cache từ Fineract
  totalRepayment: number,   // Cache từ Fineract
  paidAmount: number,       // Cache từ Fineract
  numberOfRepayments: number,
  status: 'pending_approval' | 'approved' | 'active' | 'closed',
  description?: string,
  disbursedAt?: Date
}
```

#### Wallet Schema (Reference)
```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  fineractSavingsId: string  // Fineract Savings Account ID
}
```

### 🔧 Configuration

**Environment Variables (.env):**
```bash
# Server
PORT=3001
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/p2p_new

# JWT
JWT_SECRET=...
JWT_EXPIRE=1h
JWT_REFRESH_SECRET=...
JWT_REFRESH_EXPIRE=7d

# Keycloak
KEYCLOAK_URL=http://localhost:9000
KEYCLOAK_REALM=fineract
KEYCLOAK_CLIENT_ID=community-app
KEYCLOAK_CLIENT_SECRET=...

# Fineract
FINERACT_API_URL=http://localhost:8080/fineract-provider/api/v1
FINERACT_TENANT=default
FINERACT_USERNAME=mifos
FINERACT_PASSWORD=password

# BNPL Config
BNPL_LOAN_PRODUCT_ID=1
BNPL_CREDIT_LIMIT=5000000
BNPL_DEFAULT_REPAYMENTS=3
BNPL_MIN_AMOUNT=500000
BNPL_MAX_AMOUNT=50000000
BNPL_MAX_REPAYMENTS=24
BNPL_CURRENCY_MULTIPLES=1000

# Security
CORS_ORIGINS=http://localhost:3000,http://localhost:8081
RATE_LIMIT_TTL=60000
RATE_LIMIT_MAX=100
```

---

## 📱 Client App (Mobile)

### 📁 Cấu Trúc Project

```
client_app/
├── src/
│   ├── components/                # Reusable components
│   │   ├── common/                # Common components
│   │   │   ├── ScreenContainer.tsx
│   │   │   ├── PageHeader.tsx
│   │   │   ├── GlassInput.tsx
│   │   │   └── SkeletonLoader.tsx
│   │   ├── glass/                 # Glass morphism UI
│   │   │   ├── GlassCard.tsx
│   │   │   ├── GlassButton.tsx
│   │   │   └── GradientBackground.tsx
│   │   └── glow/                  # Glow effects
│   │       ├── GlowCard.tsx
│   │       └── GlowButton.tsx
│   │
│   ├── screens/                   # Screen components
│   │   ├── LoginScreen.tsx
│   │   ├── RegisterScreen.tsx
│   │   ├── ProfileScreen.tsx
│   │   ├── loan/                   # Loan screens
│   │   │   ├── LoanListScreen.tsx
│   │   │   ├── LoanCreateScreen.tsx
│   │   │   ├── LoanDetailScreen.tsx
│   │   │   ├── RepaymentScreen.tsx
│   │   │   └── CreditAssessmentScreen.tsx
│   │   ├── invest/                 # Investment screens
│   │   │   ├── InvestListScreen.tsx
│   │   │   ├── InvestDetailScreen.tsx
│   │   │   ├── MyInvestmentsScreen.tsx
│   │   │   └── WalletScreen.tsx
│   │   ├── kyc/                    # KYC screens
│   │   │   ├── KYCScreen.tsx
│   │   │   └── FaceDetectionScreen.tsx
│   │   └── shared/                 # Shared screens
│   │       ├── TransactionHistoryScreen.tsx
│   │       └── TransferScreen.tsx
│   │
│   ├── services/                   # API services
│   │   ├── auth/
│   │   │   ├── auth.api.ts
│   │   │   └── keycloak.api.ts
│   │   ├── loan/
│   │   │   └── loan.api.ts
│   │   ├── invest/
│   │   │   └── invest.api.ts
│   │   ├── wallet/
│   │   │   └── wallet.api.ts
│   │   ├── ekyc/
│   │   │   └── ekyc.api.ts
│   │   ├── http/
│   │   │   └── httpClient.ts      # Axios wrapper
│   │   └── config/
│   │       └── api.config.ts      # API configuration
│   │
│   ├── contexts/                   # React Context
│   │   └── AuthContext.tsx        # Auth state management
│   │
│   ├── hooks/                      # Custom hooks
│   │   └── useDigitalFootprint.ts
│   │
│   ├── types/                      # TypeScript types
│   │   ├── auth.types.ts
│   │   ├── loan.types.ts
│   │   ├── user.types.ts
│   │   └── api.types.ts
│   │
│   ├── theme/                      # Theme & styling
│   │   ├── index.ts
│   │   └── cyberpunk.ts
│   │
│   └── styles/                     # Global styles
│       └── globalStyles.ts
│
├── App.tsx                         # Root component
├── app.json                        # Expo config
├── package.json
└── .env.example
```

### 🎨 UI/UX Features

#### Design System
- **Theme**: Dark mode với cyberpunk aesthetic
- **Components**: Glass morphism effects
- **Typography**: Poppins font family
- **Colors**: Dark palette với accent colors

#### Navigation Structure

```
App (Root)
├── AuthStack (Unauthenticated)
│   ├── LoginScreen
│   └── RegisterScreen
│
└── MainTabs (Authenticated)
    ├── Loans Tab (Borrower)
    │   └── LoanStack
    │       ├── LoanListScreen
    │       ├── LoanCreateScreen
    │       ├── LoanDetailScreen
    │       ├── RepaymentScreen
    │       └── CreditAssessmentScreen
    │
    ├── Invest Tab (Lender)
    │   └── InvestStack
    │       ├── InvestListScreen
    │       ├── InvestDetailScreen
    │       ├── MyInvestmentsScreen
    │       └── TransactionHistoryScreen
    │
    ├── Wallet Tab (Both)
    │   └── WalletStack
    │       ├── WalletScreen
    │       ├── TransactionHistoryScreen
    │       └── TransferScreen
    │
    └── Profile Tab (Both)
        └── ProfileStack
            ├── ProfileScreen
            ├── KYCScreen
            └── FaceDetectionScreen
```

### 🔑 Key Features

#### 1. **Authentication**
- Login với Keycloak
- Register với auto-create Fineract client
- Token management (access + refresh)
- Auto-logout khi session expired

#### 2. **Loan Management (Borrower)**
- Tạo khoản vay mới
- Xem danh sách khoản vay
- Chi tiết khoản vay với lịch trả nợ
- Thanh toán khoản vay
- Credit assessment (chấm điểm tín dụng)

#### 3. **Investment (Lender)**
- Xem danh sách khoản vay có sẵn
- Đầu tư vào khoản vay
- Xem portfolio đầu tư
- Theo dõi lợi nhuận

#### 4. **Wallet Management**
- Xem số dư ví
- Chuyển tiền giữa các ví
- Chuyển tiền theo số điện thoại
- Lịch sử giao dịch

#### 5. **KYC (Know Your Customer)**
- Upload CCCD (mặt trước, mặt sau)
- OCR tự động
- Face verification
- Liveness detection

#### 6. **BNPL Features** ⭐
- Xem ví BNPL (credit limit, used credit)
- Preview khoản vay BNPL
- Tạo khoản vay BNPL
- Xem lịch trả nợ tổng hợp
- Thanh toán BNPL

### 📡 API Integration

#### HTTP Client
- Axios wrapper với interceptors
- Auto token refresh
- Error handling
- Request/response logging

#### API Services
- `authApi`: Authentication endpoints
- `loanApi`: Loan operations
- `investApi`: Investment operations
- `walletApi`: Wallet operations
- `ekycApi`: KYC operations

### 🎯 State Management

#### AuthContext
- User state
- Authentication status
- Login/logout functions
- Token refresh logic

#### Local Storage
- AsyncStorage cho user data
- SecureStore cho tokens
- Cache management

### 🔧 Configuration

**Environment Variables (.env):**
```bash
API_BASE_URL=http://192.168.1.79:3000
KEYCLOAK_BASE_URL=http://118.69.41.95:9000
KEYCLOAK_REALM=fineract
KEYCLOAK_CLIENT_ID=community-app
EKYC_SERVICE_URL=http://192.168.1.36:8000
```

---

## 🔄 Luồng Dữ Liệu Chính

### 1. Registration Flow

```
User → RegisterScreen
  ↓
Client App → POST /api/auth/register
  ↓
Server → KeycloakService.createUser()
  ↓
Server → FineractService.createClient()
  ↓
Server → FineractService.createSavingsAccount() (e-wallet)
  ↓
Server → Save User to MongoDB
  ↓
Server → Return JWT tokens
  ↓
Client App → Save tokens & user data
  ↓
Client App → Navigate to MainTabs
```

### 2. BNPL Loan Creation Flow

```
User → LoanCreateScreen (BNPL)
  ↓
Client App → POST /api/bnpl/preview (optional)
  ↓
User → Confirm loan details
  ↓
Client App → POST /api/bnpl/loans
  ↓
Server → BnplService.createLoan()
  ↓
Server → Check credit limit
  ↓
Server → FineractService.createAndDisburseLoan()
  ↓
Server → Update BNPL wallet (usedCredit)
  ↓
Server → Save loan to MongoDB (metadata)
  ↓
Server → Return loan details
  ↓
Client App → Show success & navigate to LoanDetailScreen
```

### 3. Wallet Transfer Flow

```
User → TransferScreen
  ↓
User → Enter recipient & amount
  ↓
Client App → POST /api/wallets/transfer-phone
  ↓
Server → WalletsService.transferByPhone()
  ↓
Server → Find recipient by phone
  ↓
Server → FineractService.transferFunds()
  ↓
Server → Return transaction result
  ↓
Client App → Show success & refresh balance
```

### 4. Loan Repayment Flow

```
User → LoanDetailScreen → Repayment
  ↓
Client App → POST /api/repayment/repay
  ↓
Server → RepaymentService.repay()
  ↓
Server → FineractService.makeRepayment()
  ↓
Server → Update loan status
  ↓
Server → Return repayment result
  ↓
Client App → Show success & refresh loan details
```

---

## 🔗 Tích Hợp External Services

### Keycloak Integration

**Mục đích:** Authentication & Authorization

**Endpoints sử dụng:**
- `/realms/{realm}/protocol/openid-connect/token` - Token exchange
- `/admin/realms/{realm}/users` - User management

**Flow:**
1. Client login → Keycloak token
2. Server validate token → Generate JWT
3. Client use JWT for API calls

### Fineract Integration

**Mục đích:** Core Banking Operations

**Key Operations:**
- **Clients**: Create, find by identifier
- **Savings Accounts**: Create, get details, transactions
- **Loans**: Create, approve, disburse, repayment
- **Transfers**: Between accounts

**Data Flow:**
- Fineract là **source of truth** cho:
  - Account balances
  - Loan details
  - Transaction history
  - Repayment schedules
- MongoDB chỉ lưu **metadata** và **references**

### MongoDB Integration

**Mục đích:** Metadata & Cache Storage

**Collections:**
- `users`: User metadata
- `wallets`: Wallet references (fineractSavingsId)
- `bnpl_wallets`: BNPL wallet info
- `bnpl_loans`: BNPL loan metadata

**Pattern:**
- MongoDB lưu references
- Fineract lưu actual data
- Real-time sync khi cần

---

## ✨ Các Tính Năng Chính

### 1. **BNPL (Buy Now Pay Later)** ⭐

**Tính năng:**
- Ví trả sau với hạn mức thấu chi
- Tạo khoản vay tự động (auto-approve, auto-disburse)
- Lịch trả nợ linh hoạt (3-24 kỳ)
- Quản lý nhiều khoản vay đồng thời
- Lịch trả nợ tổng hợp theo tháng

**Workflow:**
1. User có ví BNPL với credit limit
2. Tạo khoản vay → Auto approve → Auto disburse
3. Thanh toán theo lịch trả nợ
4. Khi trả hết → Giải phóng credit limit

### 2. **P2P Lending**

**Tính năng:**
- Borrower tạo khoản vay
- Lender đầu tư vào khoản vay
- Auto matching & distribution
- Repayment với distribution cho lenders

### 3. **Wallet System**

**Loại ví:**
- **E-Wallet**: Ví điện tử (savings account)
- **Credit Wallet**: Ví tín dụng (BNPL)

**Tính năng:**
- Chuyển tiền giữa ví
- Chuyển tiền theo số điện thoại
- Lịch sử giao dịch
- Real-time balance

### 4. **KYC (Know Your Customer)**

**Tính năng:**
- Upload CCCD (mặt trước, mặt sau)
- OCR tự động
- Face verification
- Liveness detection
- Upload lên Fineract

### 5. **Credit Assessment**

**Tính năng:**
- Chấm điểm tín dụng
- Digital footprint analysis
- Pre-loan assessment
- Scorecard history

---

## 📊 Data Flow Patterns

### Source of Truth Strategy

```
┌─────────────────────────────────────────┐
│         Source of Truth                 │
├─────────────────────────────────────────┤
│                                         │
│  Fineract:                              │
│  - Account balances                     │
│  - Loan details                         │
│  - Transaction history                  │
│  - Repayment schedules                  │
│                                         │
│  MongoDB:                               │
│  - User metadata                        │
│  - Wallet references                    │
│  - BNPL wallet info                    │
│  - BNPL loan metadata                   │
│                                         │
└─────────────────────────────────────────┘
```

**Nguyên tắc:**
- Fineract = Source of truth cho financial data
- MongoDB = Cache & metadata
- Real-time sync khi cần
- Optimistic updates với validation

---

## 🚀 Development Workflow

### Server Development

```bash
cd server_do_an_new
npm install
cp .env.example .env
# Update .env với actual values
npm run start:dev
```

**Swagger Docs:** http://localhost:3001/api/docs

### Client Development

```bash
cd client_app
npm install
cp .env.example .env
# Update .env với actual values
npm start
```

**Run on device:**
- iOS: `npm run ios`
- Android: `npm run android`
- Web: `npm run web`

---

## 📝 Notes & Best Practices

### Server Side

1. **Always use Fineract as source of truth** cho financial data
2. **MongoDB chỉ lưu metadata** và references
3. **Real-time sync** khi cần thiết
4. **Error handling** với proper HTTP status codes
5. **Logging** cho debugging và monitoring

### Client Side

1. **Optimistic updates** với error handling
2. **Token refresh** tự động
3. **Error boundaries** cho crash prevention
4. **Loading states** cho better UX
5. **Offline support** (future enhancement)

---

## 🔍 Key Files Reference

### Server

- `src/modules/bnpl/bnpl.service.ts` - Core BNPL logic
- `src/modules/wallets/wallets.service.ts` - Wallet operations
- `src/modules/fineract/fineract.service.ts` - Fineract integration
- `src/modules/auth/auth.service.ts` - Authentication

### Client

- `src/contexts/AuthContext.tsx` - Auth state management
- `src/services/http/httpClient.ts` - API client
- `src/screens/loan/LoanCreateScreen.tsx` - Loan creation
- `src/screens/invest/WalletScreen.tsx` - Wallet management

---

## 📚 Documentation

### Server Documentation
- `documents/DEVELOPER_GUIDE.md` - Development guide
- `documents/AUTHENTICATION_DEEP_DIVE.md` - Auth flow details
- `documents/CLASS_DIAGRAM.md` - Class structure
- `documents/SEQUENCE_DIAGRAMS.md` - Sequence diagrams

### Client Documentation
- Code comments trong các components
- Type definitions trong `src/types/`

---

## 🎯 Next Steps

### Potential Enhancements

1. **Offline Support**: Cache data locally
2. **Push Notifications**: Loan reminders, payment alerts
3. **Analytics**: User behavior tracking
4. **Blockchain Integration**: Transaction transparency
5. **Multi-language**: i18n support
6. **Dark/Light Theme**: Theme switching
7. **Biometric Auth**: Fingerprint/Face ID
8. **Advanced KYC**: Video verification

---

**Last Updated:** 2026-01-26  
**Version:** 1.0.0
