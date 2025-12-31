# AGENT_CONTEXT.md - P2P Lending Platform

> **Start Here**: This file contains high-density context about the project's architecture, business logic, and coding standards. Read this first to understand the system.

## 1. Project Overview
**Name**: P2P Lending Platform (Social Together)
**Purpose**: Connects Borrowers and Lenders for peer-to-peer loans, backed by Hyperledger Fabric blockchain for transparency and Fineract (Core Banking) for financial processing.
**Root Directory**: `c:\P2P\p2p-test-4\p2p-do-an`

## 📚 Documentation Hub
*   [**🇦🇺 Protocol (Vai trò & Quy trình)**](.agent/workflows/fullstack-development.md) - **ĐỌC KỸ TRƯỚC KHI LÀM**.
*   [**🚀 Setup (Cài đặt & Chạy)**](.agent/workflows/project-setup.md) - Hướng dẫn khởi động.
*   [**🛠️ Extensions (Công cụ)**](.agent/workflows/recommended-extensions.md) - Các "vũ khí" VS Code.
*   [**🗺️ Roadmap (Kế hoạch)**](doc/ROADMAP.md) - Trạng thái dự án hiện tại.
*   [**💰 Logic Nghiệp Vụ**](doc/investment_repayment_logic.md) - Chi tiết công thức tính tiền.

## 2. Technical Stack

### client_app (Mobile)
*   **Framework**: React Native + Expo (~54.0.30).
*   **Language**: TypeScript.
*   **UI Library**: `react-native-paper`, custom Glassmorphism components.
*   **Navigation**: React Navigation v7.
*   **State/Data**: Context API, Axios.
*   **Style**: Vanilla CSS-in-JS, linear-gradients.

### server_do_an (Backend)
*   **Framework**: NestJS (v11).
*   **Language**: TypeScript.
*   **Database**: MongoDB (via Mongoose), Hyperledger Fabric (via `fabric-network`).
*   **Auth**: Keycloak (JWT), Passport.
*   **Logging**: Winston.

### blockchain_network
*   **Platform**: Hyperledger Fabric (implied).
*   **Components**: Chaincode (Smart Contracts), Ledger.

## 3. Key Business Logic

### 3.1 Investment Model (Pooling)
*   **Model**: 1 Loan <-> N Investments.
*   **Mechanism**: Lenders contribute partial amounts to a Loan.
*   **Disbursement Trigger**: When `totalInvested == loanAmount`.
*   **Status**: `loan.status` moves from `waiting` -> `success` (ready for disbursement).

### 3.2 Repayment & Distribution (Natural Cashflow)
*   **Flow**: Borrower Pays -> Admin Escrow -> Lenders.
*   **Calculation**:
    *   `validInvestments`: Active investments for the loan.
    *   `lenderShare = repaymentAmount * (lenderCapital / totalLoanAmount)`.
*   **Spread (Admin Profit)**:
    *   Implemented via **Interest Rate Differential**.
    *   Borrower pays `X%` (e.g., 12%).
    *   Lender receives `Y%` (e.g., 10%) via "Fixed Deposit" logic.
    *   Spread `(X - Y)` is retained by Admin.

### 3.3 Prepayment (Early Settlement)
*   **Action**: Borrower pays remaining Principal + Accrued Interest.
*   **System Action**: Closes "Fixed Deposit" accounts of Lenders prematurely.
*   **Result**: Lender gets Principal + Interest earned to date.

## 4. Coding Conventions

### 4.1 Naming
*   **Services**: `*.service.ts` (e.g., `loan.service.ts`).
*   **Controllers**: `*.controller.ts`.
*   **Screens**: `*Screen.tsx` (e.g., `LoanDetailScreen.tsx`).
*   **Variables**: `camelCase` (e.g., `accessToken`, `isLoading`).
*   **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `MAX_RETRY_COUNT`).

### 4.2 Logging
*   **Format**: `[Module] Action: details`
*   **Example**: `[AuthContext] Login successful`
*   **Rule**: No `console.log` in production, use Winston logger in NestJS.

### 4.3 Security
*   **Secrets**: Use `.env`, never hardcode.
*   **Mobile Storage**: Use `expo-secure-store`.
*   **Validation**: DTOs + `class-validator`.

## 5. Directory Map
*   `/client_app`: Mobile frontend.
    *   `/src/screens`: UI Screens.
    *   `/src/services`: API calls.
*   `/server_do_an`: Backend API.
    *   `/src/loan`: Loan management (creation, scoring).
    *   `/src/repayment`: Repayment schedule & processing.
    *   `/src/blockchain`: Fabric integration.

## 6. Critical Files
*   `LoanDisbursementService.ts` (or equivalent in `loan/services`): Handles funding & disbursement logic.
*   `RepaymentService.ts`: Handles money distribution.
*   `FineractEscrowService.ts`: Core Banking integration.
*   `coding-conventions.md`: Detailed style guide.

## 7. AI Workflow (Free-Tier Only)

> **Không dùng API trả phí. Developer remains final decision-maker.**

| Tool | Vai trò | Chi phí |
|------|---------|---------|
| **Gemini CLI** | Read-only, exploration, debug | ✅ FREE (OAuth) |
| **IDE Agent** | Implementation only | ✅ FREE |
| **Aider** | Refactor when needed | ✅ FREE |

### Quy tắc vàng
```
Gemini CLI → Facts → IDE Agent → Code → Git
```

### Workflows
*   [**🔍 Gemini CLI Debug**](.agent/workflows/gemini-cli-debug.md) - Sub-agent patterns cho debug.
*   [**🛠️ Fullstack Development**](.agent/workflows/fullstack-development.md) - Full protocol.

### Giải thích với GV/Hội đồng
> "Em dùng Gemini CLI bằng tài khoản Google cá nhân (free) để đọc code và phân tích.
> Việc viết code vẫn do em kiểm soát qua IDE Agent và git.
> Không dùng API trả phí, không tự động sửa code ngoài tầm kiểm soát."
