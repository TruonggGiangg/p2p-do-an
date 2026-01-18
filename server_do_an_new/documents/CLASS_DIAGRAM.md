# P2P Lending System - Class Diagram (Microservice Level)

> Tài liệu chi tiết kiến trúc class diagram cho hệ thống P2P Lending với 3 microservice: **NestJS Server**, **Keycloak**, **Fineract**

---

## 📊 Overall Microservice Architecture

```mermaid
graph TB
    subgraph "📱 Client Layer"
        MOBILE["React Native Mobile App"]
        WEB["Web Admin (Angular)"]
    end

    subgraph "🚀 API Gateway (NestJS Server - Port 3001)"
        API["API Gateway<br/>/api/*"]
    end

    subgraph "🔐 Identity Provider (Keycloak - Port 9000)"
        KC["Keycloak Server"]
    end

    subgraph "🏦 Core Banking (Fineract - Port 8080)"
        FIN["Apache Fineract"]
    end

    subgraph "🗄️ Data Layer"
        MONGO[(MongoDB Atlas)]
        MYSQL[(MySQL/MariaDB)]
    end

    MOBILE --> API
    WEB --> API
    API --> KC
    API --> FIN
    API --> MONGO
    KC --> MYSQL
    FIN --> MYSQL
```

---

## 🏗️ NestJS Server - Module Architecture

```mermaid
classDiagram
    direction TB
    
    %% ==================== APP MODULE ====================
    class AppModule {
        <<Module>>
        +imports: Module[]
        +controllers: Controller[]
        +providers: Provider[]
    }

    %% ==================== AUTH MODULE ====================
    class AuthModule {
        <<Module>>
        +imports: [UsersModule, JwtModule, PassportModule]
        +controllers: [AuthController]
        +providers: [AuthService, JwtStrategy, ...]
        +exports: [AuthService]
    }

    class AuthController {
        <<Controller>>
        -authService: AuthService
        +register(dto: RegisterDto): Promise~RegisterResponse~
        +login(dto: LoginDto): Promise~LoginResponse~
        +refresh(req: Request): Promise~RefreshResponse~
        +logout(req: Request): Promise~void~
        +getProfile(req: Request): Promise~User~
    }

    class AuthService {
        <<Injectable>>
        -keycloakAuth: KeycloakAuthService
        -jwtService: JwtService
        +validateUser(username, password): Promise~User~
        +generateTokens(user): TokenPair
        +refreshToken(refreshToken): Promise~TokenPair~
    }

    class KeycloakAuthService {
        <<Injectable>>
        -keycloakService: KeycloakService
        -userSyncService: UserSyncService
        +authenticate(username, password): Promise~KeycloakTokens~
        +refreshKeycloakToken(refreshToken): Promise~KeycloakTokens~
    }

    class KeycloakService {
        <<Injectable>>
        -httpClient: AxiosInstance
        -adminToken: string
        +createUser(userData): Promise~string~
        +findUserByUsername(username): Promise~KeycloakUser~
        +getAdminToken(): Promise~string~
        +deleteUser(userId): Promise~void~
    }

    class FineractSignupService {
        <<Injectable>>
        -httpClient: AxiosInstance
        +createClient(clientData): Promise~FineractClient~
        +findClientByExternalId(id): Promise~FineractClient~
        +findSavingsAccountsByClientId(id): Promise~SavingsAccount[]~
        +createSavingsAccount(clientId, productId): Promise~SavingsAccount~
    }

    class UserSyncService {
        <<Injectable>>
        -userModel: Model~User~
        -walletModel: Model~Wallet~
        -keycloakService: KeycloakService
        -fineractService: FineractSignupService
        +syncUser(keycloakUser): Promise~User~
        -createMongoUser(keycloakId, username, email): Promise~User~
        -linkFineractClient(user, username): Promise~void~
        -syncWallets(user, fineractClientId): Promise~void~
        -createWallet(user, account): Promise~void~
    }

    class JwtStrategy {
        <<Injectable>>
        +validate(payload): Promise~User~
    }

    class JwtAuthGuard {
        <<Guard>>
        +canActivate(context): boolean
    }

    %% ==================== WALLETS MODULE ====================
    class WalletsModule {
        <<Module>>
        +imports: [MongooseModule, UsersModule]
        +controllers: [WalletsController]
        +providers: [WalletsService]
        +exports: [WalletsService]
    }

    class WalletsController {
        <<Controller>>
        -walletsService: WalletsService
        +getWallets(req): Promise~WalletInfo[]~
        +getWalletById(id): Promise~WalletInfo~
        +createWallet(req): Promise~WalletInfo~
        +syncWallets(req): Promise~SyncResult~
        +getTotalBalance(req): Promise~BalanceInfo~
    }

    class WalletsService {
        <<Injectable>>
        -walletModel: Model~Wallet~
        -userModel: Model~User~
        -fineractClient: AxiosInstance
        +getWalletsByUserId(userId): Promise~WalletInfo[]~
        +getWalletById(walletId): Promise~WalletInfo~
        +syncWalletsFromFineract(userId): Promise~SyncResult~
        +getTotalBalance(userId): Promise~BalanceInfo~
        -getOAuth2Token(): Promise~string~
        -getSavingsAccountFromFineract(id, token): Promise~SavingsData~
        -getWalletType(savingsData): WalletType
    }

    %% ==================== USERS MODULE ====================
    class UsersModule {
        <<Module>>
        +imports: [MongooseModule]
        +providers: [UsersService]
        +exports: [UsersService, MongooseModule]
    }

    class UsersService {
        <<Injectable>>
        -userModel: Model~User~
        +findById(id): Promise~User~
        +findByKeycloakId(keycloakId): Promise~User~
        +findByUsername(username): Promise~User~
        +updateUser(id, data): Promise~User~
    }

    %% ==================== HEALTH MODULE ====================
    class HealthModule {
        <<Module>>
        +controllers: [HealthController]
    }

    class HealthController {
        <<Controller>>
        +check(): HealthStatus
        +ready(): ReadinessStatus
    }

    %% ==================== RELATIONSHIPS ====================
    AppModule --> AuthModule
    AppModule --> WalletsModule
    AppModule --> UsersModule
    AppModule --> HealthModule

    AuthModule --> AuthController
    AuthModule --> AuthService
    AuthModule --> KeycloakAuthService
    AuthModule --> KeycloakService
    AuthModule --> FineractSignupService
    AuthModule --> UserSyncService
    AuthModule --> JwtStrategy
    AuthModule --> JwtAuthGuard

    AuthController --> AuthService
    AuthService --> KeycloakAuthService
    AuthService --> JwtService
    KeycloakAuthService --> KeycloakService
    KeycloakAuthService --> UserSyncService
    UserSyncService --> KeycloakService
    UserSyncService --> FineractSignupService

    WalletsModule --> WalletsController
    WalletsModule --> WalletsService
    WalletsController --> WalletsService

    UsersModule --> UsersService
```

---

## 📦 MongoDB Schema Classes

```mermaid
classDiagram
    direction LR

    class User {
        <<Document>>
        +_id: ObjectId
        +keycloakId: string
        +fineractClientId: string
        +username: string
        +email: string
        +profile: UserProfile
        +status: UserStatus
        +roles: string[]
        +metadata: UserMetadata
        +createdAt: Date
        +updatedAt: Date
    }

    class UserProfile {
        <<Embedded>>
        +firstName: string
        +lastName: string
        +avatar: string
    }

    class UserMetadata {
        <<Embedded>>
        +syncStatus: SyncStatus
        +syncError: string
        +lastSyncAt: Date
        +userType: UserType
    }

    class Wallet {
        <<Document>>
        +_id: ObjectId
        +userId: ObjectId
        +fineractSavingsId: string
        +createdAt: Date
        +updatedAt: Date
    }

    class UserStatus {
        <<Enumeration>>
        ACTIVE
        INACTIVE
        SUSPENDED
    }

    class SyncStatus {
        <<Enumeration>>
        registered
        synced
        no_fineract_client
        no_wallets
        complete
        incomplete
    }

    class UserType {
        <<Enumeration>>
        borrower
        lender
    }

    User "1" --> "1" UserProfile : profile
    User "1" --> "1" UserMetadata : metadata
    User "1" --> "*" Wallet : wallets
    User --> UserStatus
    UserMetadata --> SyncStatus
    UserMetadata --> UserType
```

---

## 🔐 Keycloak Classes

```mermaid
classDiagram
    direction TB

    class KeycloakServer {
        <<External Service>>
        +realm: fineract
        +clientId: community-app
        +clientSecret: string
    }

    class KeycloakUser {
        <<Entity>>
        +id: string
        +username: string
        +email: string
        +firstName: string
        +lastName: string
        +enabled: boolean
        +attributes: Map~string, string[]~
        +createdTimestamp: long
    }

    class KeycloakTokens {
        <<DTO>>
        +access_token: string
        +refresh_token: string
        +expires_in: number
        +token_type: string
    }

    class KeycloakRealm {
        <<Entity>>
        +name: string
        +clients: Client[]
        +users: KeycloakUser[]
        +roles: Role[]
    }

    class KeycloakClient {
        <<Entity>>
        +clientId: string
        +secret: string
        +redirectUris: string[]
        +webOrigins: string[]
    }

    KeycloakServer --> KeycloakRealm
    KeycloakRealm --> KeycloakUser
    KeycloakRealm --> KeycloakClient
    KeycloakUser --> KeycloakTokens : generates
```

---

## 🏦 Fineract Classes

```mermaid
classDiagram
    direction TB

    class FineractServer {
        <<External Service>>
        +tenant: default
        +apiUrl: /fineract-provider/api/v1
    }

    class FineractClient {
        <<Entity>>
        +id: number
        +accountNo: string
        +externalId: string
        +displayName: string
        +firstname: string
        +lastname: string
        +mobileNo: string
        +emailAddress: string
        +officeId: number
        +status: ClientStatus
        +active: boolean
        +activationDate: Date
    }

    class SavingsAccount {
        <<Entity>>
        +id: number
        +accountNo: string
        +clientId: number
        +productId: number
        +productName: string
        +shortProductName: string
        +status: SavingsStatus
        +currency: Currency
        +accountBalance: number
        +summary: SavingsSummary
    }

    class SavingsProduct {
        <<Entity>>
        +id: number
        +name: string
        +shortName: string
        +currency: Currency
        +nominalAnnualInterestRate: number
        +interestCompoundingPeriodType: number
    }

    class Currency {
        <<Embedded>>
        +code: string
        +name: string
        +decimalPlaces: number
        +displaySymbol: string
    }

    class SavingsSummary {
        <<Embedded>>
        +totalDeposits: number
        +totalWithdrawals: number
        +totalInterestEarned: number
        +accountBalance: number
    }

    class ClientStatus {
        <<Enumeration>>
        +id: number
        +code: string
        +value: string
    }

    class SavingsStatus {
        <<Enumeration>>
        +id: number
        +code: string
        +value: string
    }

    FineractServer --> FineractClient
    FineractClient --> SavingsAccount : has many
    SavingsAccount --> SavingsProduct : belongs to
    SavingsAccount --> Currency
    SavingsAccount --> SavingsSummary
    FineractClient --> ClientStatus
    SavingsAccount --> SavingsStatus
```

---

## 🔄 DTO Classes (Data Transfer Objects)

```mermaid
classDiagram
    direction TB

    %% Auth DTOs
    class RegisterDto {
        <<DTO>>
        +firstName: string
        +lastName: string
        +phoneNumber: string
        +email: string
        +password: string
        +userType: UserType
    }

    class LoginDto {
        <<DTO>>
        +username: string
        +password: string
    }

    class RegisterResponse {
        <<Response>>
        +statusCode: number
        +message: string
        +data: RegisterData
    }

    class LoginResponse {
        <<Response>>
        +statusCode: number
        +message: string
        +data: User
        +accessToken: string
        +refreshToken: string
    }

    class RefreshResponse {
        <<Response>>
        +statusCode: number
        +data: RefreshData
    }

    %% Wallet DTOs
    class WalletInfo {
        <<DTO>>
        +_id: string
        +fineractSavingsId: string
        +accountNo: string
        +productName: string
        +shortProductName: string
        +type: WalletType
        +currency: string
        +balance: number
        +status: string
    }

    class WalletType {
        <<Enumeration>>
        credit_wallet
        e_wallet
    }

    class SyncResult {
        <<Response>>
        +synced: number
        +wallets: WalletInfo[]
    }

    class BalanceInfo {
        <<Response>>
        +total: number
        +currency: string
    }

    RegisterDto --> RegisterResponse
    LoginDto --> LoginResponse
    WalletInfo --> WalletType
```

---

## 🌐 API Endpoints Overview

```mermaid
graph LR
    subgraph "Auth Endpoints"
        A1["POST /api/auth/register"]
        A2["POST /api/auth/login"]
        A3["POST /api/auth/refresh"]
        A4["POST /api/auth/logout"]
        A5["GET /api/auth/me"]
    end

    subgraph "Wallet Endpoints"
        W1["GET /api/wallets"]
        W2["GET /api/wallets/:id"]
        W3["POST /api/wallets"]
        W4["POST /api/wallets/sync"]
        W5["GET /api/wallets/balance"]
    end

    subgraph "Health Endpoints"
        H1["GET /api/health"]
        H2["GET /api/health/ready"]
    end
```

---

## 📝 Notes

### Microservice Responsibilities

| Service | Responsibility | Database |
|---------|---------------|----------|
| **NestJS Server** | API Gateway, Business Logic, Data Aggregation | MongoDB Atlas |
| **Keycloak** | Identity Management, OAuth2/OIDC, User Authentication | MySQL/MariaDB |
| **Fineract** | Core Banking, Loans, Savings Accounts, Transactions | MySQL/MariaDB |

### Data Flow Principles

1. **Single Source of Truth**: 
   - User Identity → Keycloak
   - Financial Data → Fineract
   - Cached/Aggregated Data → MongoDB

2. **Real-time Data**: Wallet balances are always fetched from Fineract (not cached)

3. **Reference Only**: MongoDB wallets collection only stores `fineractSavingsId` reference

---

*Generated: 2026-01-19*
