# P2P Lending System - Sequence Diagrams (Microservice Level)

> Tài liệu chi tiết luồng dữ liệu giữa các microservice: **Mobile App**, **NestJS Server**, **Keycloak**, **Fineract**, **MongoDB**

---

## 📋 Table of Contents

1. [Register Flow](#1-register-flow)
2. [Login Flow](#2-login-flow)
3. [Get Wallets Flow](#3-get-wallets-flow)
4. [Sync Wallets Flow](#4-sync-wallets-flow)
5. [Refresh Token Flow](#5-refresh-token-flow)
6. [Logout Flow](#6-logout-flow)

---

## 1. Register Flow

### 1.1 High-Level Overview

```mermaid
sequenceDiagram
    autonumber
    participant App as 📱 Mobile App
    participant API as 🚀 NestJS Server
    participant KC as 🔐 Keycloak
    participant FIN as 🏦 Fineract
    participant MONGO as 🗄️ MongoDB

    App->>+API: POST /api/auth/register
    Note over API: Validate RegisterDto
    
    API->>+KC: Create User in Keycloak
    KC-->>-API: keycloakUserId
    
    API->>+FIN: Create Client in Fineract
    FIN-->>-API: fineractClientId
    
    API->>+FIN: Create Savings Accounts (2 types)
    FIN-->>-API: savingsAccountIds
    
    API->>+FIN: Approve & Activate Accounts
    FIN-->>-API: activated
    
    API->>+MONGO: Create User Document
    MONGO-->>-API: mongoUserId
    
    API->>+MONGO: Create Wallet References
    MONGO-->>-API: walletIds
    
    API-->>-App: RegisterResponse
```

### 1.2 Detailed Flow - Keycloak User Creation

```mermaid
sequenceDiagram
    autonumber
    participant API as 🚀 NestJS Server
    participant KCS as KeycloakService
    participant KC as 🔐 Keycloak API

    Note over API: AuthController.register(dto)
    API->>+KCS: createUser(userData)
    
    Note over KCS: Step 1: Get Admin Token
    KCS->>+KC: POST /realms/master/protocol/openid-connect/token
    Note right of KC: grant_type: client_credentials<br/>client_id: admin-cli
    KC-->>-KCS: admin_access_token
    
    Note over KCS: Step 2: Create User
    KCS->>+KC: POST /admin/realms/fineract/users
    Note right of KC: Headers:<br/>Authorization: Bearer {admin_token}
    Note right of KC: Body:<br/>{<br/>  username: phoneNumber,<br/>  email: email,<br/>  firstName: firstName,<br/>  lastName: lastName,<br/>  enabled: true,<br/>  credentials: [{<br/>    type: "password",<br/>    value: password,<br/>    temporary: false<br/>  }],<br/>  attributes: {<br/>    phoneNumber: [phoneNumber]<br/>  }<br/>}
    KC-->>-KCS: 201 Created (Location header)
    
    Note over KCS: Step 3: Extract User ID
    KCS->>KCS: Parse keycloakUserId from Location header
    
    KCS-->>-API: keycloakUserId
```

### 1.3 Detailed Flow - Fineract Client & Accounts Creation

```mermaid
sequenceDiagram
    autonumber
    participant API as 🚀 NestJS Server
    participant FSS as FineractSignupService
    participant FIN as 🏦 Fineract API
    participant KC as 🔐 Keycloak

    Note over API: After Keycloak user created
    API->>+FSS: createClient(clientData)
    
    Note over FSS: Step 1: Get OAuth2 Token
    FSS->>+KC: POST /realms/fineract/protocol/openid-connect/token
    Note right of KC: grant_type: password<br/>client_id: community-app<br/>username: mifos<br/>password: password
    KC-->>-FSS: access_token
    
    Note over FSS: Step 2: Create Fineract Client
    FSS->>+FIN: POST /clients
    Note right of FIN: Headers:<br/>Authorization: Bearer {token}<br/>Fineract-Platform-TenantId: default
    Note right of FIN: Body:<br/>{<br/>  officeId: 1,<br/>  firstname: firstName,<br/>  lastname: lastName,<br/>  externalId: "KEYCLOAK_{username}",<br/>  mobileNo: phoneNumber,<br/>  emailAddress: email,<br/>  active: true,<br/>  activationDate: "19 January 2026",<br/>  dateFormat: "dd MMMM yyyy",<br/>  locale: "en"<br/>}
    FIN-->>-FSS: { clientId: 123, resourceId: 123 }
    
    Note over FSS: Step 3: Create E-Wallet Account
    FSS->>+FIN: POST /savingsaccounts
    Note right of FIN: Body:<br/>{<br/>  clientId: 123,<br/>  productId: 1 (Ví điện tử)<br/>}
    FIN-->>-FSS: { savingsId: 11 }
    
    Note over FSS: Step 4: Approve E-Wallet
    FSS->>+FIN: POST /savingsaccounts/11?command=approve
    FIN-->>-FSS: approved
    
    Note over FSS: Step 5: Activate E-Wallet
    FSS->>+FIN: POST /savingsaccounts/11?command=activate
    FIN-->>-FSS: activated
    
    Note over FSS: Step 6: Create Credit Wallet Account
    FSS->>+FIN: POST /savingsaccounts
    Note right of FIN: Body:<br/>{<br/>  clientId: 123,<br/>  productId: 2 (Ví Trả Sau)<br/>}
    FIN-->>-FSS: { savingsId: 36 }
    
    Note over FSS: Step 7: Approve Credit Wallet
    FSS->>+FIN: POST /savingsaccounts/36?command=approve
    FIN-->>-FSS: approved
    
    Note over FSS: Step 8: Activate Credit Wallet
    FSS->>+FIN: POST /savingsaccounts/36?command=activate
    FIN-->>-FSS: activated
    
    FSS-->>-API: { clientId: 123, savingsIds: [11, 36] }
```

### 1.4 Detailed Flow - MongoDB Records Creation

```mermaid
sequenceDiagram
    autonumber
    participant API as 🚀 NestJS Server
    participant MONGO as 🗄️ MongoDB

    Note over API: After Fineract setup complete
    
    API->>+MONGO: db.users.insertOne()
    Note right of MONGO: {<br/>  keycloakId: "kc-uuid-123",<br/>  fineractClientId: "123",<br/>  username: "0799542179",<br/>  email: "user@example.com",<br/>  profile: {<br/>    firstName: "Le",<br/>    lastName: "Giang"<br/>  },<br/>  status: "active",<br/>  metadata: {<br/>    syncStatus: "complete",<br/>    userType: "borrower",<br/>    lastSyncAt: ISODate()<br/>  }<br/>}
    MONGO-->>-API: { insertedId: ObjectId("...") }
    
    API->>+MONGO: db.wallets.insertOne() [E-Wallet]
    Note right of MONGO: {<br/>  userId: ObjectId("..."),<br/>  fineractSavingsId: "11"<br/>}
    MONGO-->>-API: { insertedId: ObjectId("...") }
    
    API->>+MONGO: db.wallets.insertOne() [Credit Wallet]
    Note right of MONGO: {<br/>  userId: ObjectId("..."),<br/>  fineractSavingsId: "36"<br/>}
    MONGO-->>-API: { insertedId: ObjectId("...") }
    
    API-->>API: Return RegisterResponse
```

---

## 2. Login Flow

### 2.1 High-Level Overview

```mermaid
sequenceDiagram
    autonumber
    participant App as 📱 Mobile App
    participant API as 🚀 NestJS Server
    participant KC as 🔐 Keycloak
    participant FIN as 🏦 Fineract
    participant MONGO as 🗄️ MongoDB

    App->>+API: POST /api/auth/login
    Note over API: Validate LoginDto
    
    API->>+KC: Authenticate with Keycloak
    KC-->>-API: KeycloakTokens + UserInfo
    
    API->>+MONGO: Find/Create User
    MONGO-->>-API: User Document
    
    alt User has no Fineract Client
        API->>+FIN: Search for existing client
        FIN-->>-API: fineractClientId (or null)
        API->>+MONGO: Update user with clientId
        MONGO-->>-API: updated
    end
    
    alt User has Fineract Client
        API->>+FIN: Get savings accounts
        FIN-->>-API: SavingsAccount[]
        API->>+MONGO: Sync wallet references
        MONGO-->>-API: synced
    end
    
    API->>API: Generate JWT Tokens
    API-->>-App: LoginResponse
```

### 2.2 Detailed Flow - Keycloak Authentication

```mermaid
sequenceDiagram
    autonumber
    participant API as 🚀 NestJS Server
    participant KAS as KeycloakAuthService
    participant KC as 🔐 Keycloak API

    Note over API: AuthController.login(dto)
    API->>+KAS: authenticate(username, password)
    
    Note over KAS: Step 1: Resource Owner Password Grant
    KAS->>+KC: POST /realms/fineract/protocol/openid-connect/token
    Note right of KC: Content-Type: application/x-www-form-urlencoded
    Note right of KC: Body:<br/>client_id=community-app<br/>&client_secret=real-client-secret-123<br/>&username=0799542179<br/>&password=userPassword<br/>&grant_type=password
    
    alt Authentication Success
        KC-->>KAS: {<br/>  access_token: "eyJhbG...",<br/>  refresh_token: "eyJhbG...",<br/>  expires_in: 300,<br/>  token_type: "Bearer"<br/>}
    else Authentication Failed
        KC-->>KAS: 401 Unauthorized<br/>{ error: "invalid_grant" }
    end
    
    KC-->>-KAS: KeycloakTokens
    
    Note over KAS: Step 2: Decode User Info from Token
    KAS->>KAS: jwt.decode(access_token)
    Note right of KAS: Extract:<br/>- sub (keycloakUserId)<br/>- preferred_username<br/>- email<br/>- name<br/>- realm_access.roles
    
    KAS-->>-API: { tokens, userInfo }
```

### 2.3 Detailed Flow - User Sync on Login

```mermaid
sequenceDiagram
    autonumber
    participant API as 🚀 NestJS Server
    participant USS as UserSyncService
    participant KS as KeycloakService
    participant FSS as FineractSignupService
    participant MONGO as 🗄️ MongoDB
    participant FIN as 🏦 Fineract

    Note over API: After Keycloak auth success
    API->>+USS: syncUser(keycloakUser)
    
    Note over USS: Step 1: Find existing MongoDB user
    USS->>+MONGO: db.users.findOne({ keycloakId: "kc-uuid" })
    MONGO-->>-USS: User or null
    
    alt User not in MongoDB
        Note over USS: Step 2a: Get full user from Keycloak
        USS->>+KS: findUserByUsername(username)
        KS->>+KC: GET /admin/realms/fineract/users?username=0799542179
        KC-->>-KS: KeycloakUser
        KS-->>-USS: KeycloakUser
        
        Note over USS: Step 2b: Search Fineract Client
        USS->>+FSS: findClientByExternalId("KEYCLOAK_0799542179")
        FSS->>+FIN: GET /clients?externalId=KEYCLOAK_0799542179
        FIN-->>-FSS: FineractClient or null
        FSS-->>-USS: fineractClientId
        
        alt No Fineract Client with KEYCLOAK_ prefix
            Note over USS: Try heuristic ID
            USS->>+FSS: findClientByExternalId("BORROWER_1")
            FSS->>+FIN: GET /clients?externalId=BORROWER_1
            FIN-->>-FSS: FineractClient
            FSS-->>-USS: fineractClientId
        end
        
        Note over USS: Step 2c: Create MongoDB User
        USS->>+MONGO: db.users.insertOne({ ... })
        MONGO-->>-USS: User
    end
    
    Note over USS: Step 3: Sync Wallets
    USS->>+FSS: findSavingsAccountsByClientId(123)
    FSS->>+FIN: GET /clients/123/accounts
    FIN-->>-FSS: { savingsAccounts: [...] }
    FSS-->>-USS: SavingsAccount[]
    
    Note over USS: Log: Found 2 savings accounts
    
    loop For each savings account
        USS->>+MONGO: db.wallets.findOne({ fineractSavingsId: "11" })
        alt Wallet not exists
            MONGO-->>USS: null
            USS->>MONGO: db.wallets.insertOne({ userId, fineractSavingsId })
            MONGO-->>USS: created
        else Wallet exists
            MONGO-->>-USS: Wallet
            Note over USS: Skip (already synced)
        end
    end
    
    Note over USS: Step 4: Update sync metadata
    USS->>+MONGO: db.users.updateOne({ syncStatus: "complete" })
    MONGO-->>-USS: updated
    
    USS-->>-API: User
```

---

## 3. Get Wallets Flow

### 3.1 High-Level Overview

```mermaid
sequenceDiagram
    autonumber
    participant App as 📱 Mobile App
    participant API as 🚀 NestJS Server
    participant KC as 🔐 Keycloak
    participant FIN as 🏦 Fineract
    participant MONGO as 🗄️ MongoDB

    App->>+API: GET /api/wallets
    Note over API: Extract userId from JWT
    
    API->>+MONGO: Get wallet references
    MONGO-->>-API: Wallet[] (IDs only)
    
    API->>+KC: Get OAuth2 token
    KC-->>-API: access_token
    
    loop For each wallet reference
        API->>+FIN: GET /savingsaccounts/{id}
        FIN-->>-API: Real-time savings data
    end
    
    API->>API: Transform to WalletInfo[]
    API-->>-App: { wallets: WalletInfo[] }
```

### 3.2 Detailed Flow

```mermaid
sequenceDiagram
    autonumber
    participant App as 📱 Mobile App
    participant Guard as JwtAuthGuard
    participant WC as WalletsController
    participant WS as WalletsService
    participant MONGO as 🗄️ MongoDB
    participant KC as 🔐 Keycloak
    participant FIN as 🏦 Fineract

    App->>+Guard: GET /api/wallets<br/>Authorization: Bearer {jwt}
    
    Note over Guard: Validate JWT Token
    Guard->>Guard: jwt.verify(token, JWT_SECRET)
    Guard->>Guard: Extract user from payload
    
    Guard->>+WC: request.user = { _id, username, ... }
    
    WC->>+WS: getWalletsByUserId(userId)
    
    Note over WS: Step 1: Get references from MongoDB
    WS->>+MONGO: db.wallets.find({ userId: ObjectId("...") })
    MONGO-->>-WS: [<br/>  { fineractSavingsId: "11" },<br/>  { fineractSavingsId: "36" }<br/>]
    
    alt No wallets found
        WS-->>WC: []
        WC-->>App: { wallets: [] }
    end
    
    Note over WS: Step 2: Get OAuth2 token for Fineract
    WS->>+KC: POST /realms/fineract/protocol/openid-connect/token
    KC-->>-WS: { access_token: "..." }
    
    Note over WS: Step 3: Fetch real-time data from Fineract
    
    loop For each wallet reference
        WS->>+FIN: GET /savingsaccounts/11
        Note right of FIN: Headers:<br/>Authorization: Bearer {token}<br/>Fineract-Platform-TenantId: default
        FIN-->>-WS: {<br/>  id: 11,<br/>  accountNo: "000000011",<br/>  savingsProductName: "Ví điện tử",<br/>  shortProductName: "VDT",<br/>  status: { value: "Active" },<br/>  currency: { code: "VND" },<br/>  summary: { accountBalance: 10000000 }<br/>}
        
        WS->>WS: Transform to WalletInfo
        Note right of WS: {<br/>  _id: "mongo-id",<br/>  fineractSavingsId: "11",<br/>  accountNo: "000000011",<br/>  productName: "Ví điện tử",<br/>  shortProductName: "VDT",<br/>  type: "e_wallet",<br/>  currency: "VND",<br/>  balance: 10000000,<br/>  status: "Active"<br/>}
    end
    
    WS-->>-WC: WalletInfo[]
    WC-->>-Guard: { wallets: [...] }
    Guard-->>-App: HTTP 200 OK
```

---

## 4. Sync Wallets Flow

### 4.1 High-Level Overview

```mermaid
sequenceDiagram
    autonumber
    participant App as 📱 Mobile App
    participant API as 🚀 NestJS Server
    participant KC as 🔐 Keycloak
    participant FIN as 🏦 Fineract
    participant MONGO as 🗄️ MongoDB

    App->>+API: POST /api/wallets/sync
    Note over API: Extract userId from JWT
    
    API->>+MONGO: Get user with fineractClientId
    MONGO-->>-API: User
    
    API->>+KC: Get OAuth2 token
    KC-->>-API: access_token
    
    API->>+FIN: GET /clients/{clientId}/accounts
    FIN-->>-API: All savings accounts
    
    loop For each active account
        API->>+MONGO: Upsert wallet reference
        MONGO-->>-API: synced
    end
    
    API->>+MONGO: Update user sync metadata
    MONGO-->>-API: updated
    
    API->>API: Fetch real-time wallet data
    API-->>-App: { synced: 2, wallets: [...] }
```

### 4.2 Detailed Flow

```mermaid
sequenceDiagram
    autonumber
    participant App as 📱 Mobile App
    participant WC as WalletsController
    participant WS as WalletsService
    participant MONGO as 🗄️ MongoDB
    participant KC as 🔐 Keycloak
    participant FIN as 🏦 Fineract

    App->>+WC: POST /api/wallets/sync
    
    WC->>+WS: syncWalletsFromFineract(userId)
    
    Note over WS: Step 1: Get user from MongoDB
    WS->>+MONGO: db.users.findById(userId)
    MONGO-->>-WS: User { fineractClientId: "3" }
    
    alt User has no fineractClientId
        WS-->>WC: { synced: 0, wallets: [] }
        WC-->>App: HTTP 200 OK
    end
    
    Note over WS: Step 2: Get OAuth2 token
    WS->>+KC: POST /realms/fineract/protocol/openid-connect/token
    KC-->>-WS: access_token
    
    Note over WS: Step 3: Get ALL accounts from Fineract
    WS->>+FIN: GET /clients/3/accounts
    Note right of FIN: Returns ALL account types:<br/>- savingsAccounts<br/>- loanAccounts (if any)
    FIN-->>-WS: {<br/>  savingsAccounts: [<br/>    { id: 11, status: { value: "Active" }, productName: "Ví điện tử" },<br/>    { id: 36, status: { value: "Active" }, productName: "Ví Trả Sau" }<br/>  ]<br/>}
    
    Note over WS: Step 4: Sync each savings account
    rect rgb(240, 248, 255)
        Note over WS: Processing Account 11
        WS->>WS: Check if status is "Closed" → Skip if closed
        WS->>+MONGO: db.wallets.findOne({ fineractSavingsId: "11" })
        alt Not exists
            MONGO-->>WS: null
            WS->>MONGO: db.wallets.insertOne({<br/>  userId: ObjectId("..."),<br/>  fineractSavingsId: "11"<br/>})
            Note over WS: syncedCount++
        else Already exists
            MONGO-->>-WS: Wallet
            Note over WS: Skip (already synced)
        end
    end
    
    rect rgb(255, 248, 240)
        Note over WS: Processing Account 36
        WS->>+MONGO: db.wallets.findOne({ fineractSavingsId: "36" })
        alt Not exists
            MONGO-->>WS: null
            WS->>MONGO: db.wallets.insertOne({<br/>  userId: ObjectId("..."),<br/>  fineractSavingsId: "36"<br/>})
            Note over WS: syncedCount++
        else Already exists
            MONGO-->>-WS: Wallet
        end
    end
    
    Note over WS: Step 5: Update user metadata
    WS->>+MONGO: db.users.updateOne({<br/>  metadata.syncStatus: "complete",<br/>  metadata.lastSyncAt: ISODate()<br/>})
    MONGO-->>-WS: updated
    
    Note over WS: Step 6: Fetch real-time data for response
    WS->>WS: getWalletsByUserId(userId)
    Note right of WS: (Same flow as Get Wallets)
    
    WS-->>-WC: { synced: 2, wallets: WalletInfo[] }
    WC-->>-App: HTTP 201 Created
```

---

## 5. Refresh Token Flow

```mermaid
sequenceDiagram
    autonumber
    participant App as 📱 Mobile App
    participant API as 🚀 NestJS Server
    participant KC as 🔐 Keycloak
    participant MONGO as 🗄️ MongoDB

    App->>+API: POST /api/auth/refresh
    Note over API: Extract refreshToken from cookie/body
    
    alt Using Keycloak Refresh
        API->>+KC: POST /realms/fineract/protocol/openid-connect/token
        Note right of KC: grant_type=refresh_token<br/>refresh_token=eyJhbG...
        KC-->>-API: New KeycloakTokens
        
        API->>+MONGO: Get user by keycloakId
        MONGO-->>-API: User
    else Using JWT Refresh
        API->>API: jwt.verify(refreshToken, JWT_REFRESH_SECRET)
        API->>+MONGO: Get user by _id
        MONGO-->>-API: User
    end
    
    API->>API: Generate new accessToken
    Note right of API: jwt.sign({<br/>  sub: user._id,<br/>  username: user.username,<br/>  roles: user.roles<br/>}, JWT_SECRET, { expiresIn: '1h' })
    
    API-->>-App: { accessToken: "new-token" }
```

---

## 6. Logout Flow

```mermaid
sequenceDiagram
    autonumber
    participant App as 📱 Mobile App
    participant API as 🚀 NestJS Server
    participant KC as 🔐 Keycloak

    App->>+API: POST /api/auth/logout
    
    opt Invalidate Keycloak Session
        API->>+KC: POST /realms/fineract/protocol/openid-connect/logout
        Note right of KC: client_id=community-app<br/>refresh_token=eyJhbG...
        KC-->>-API: 204 No Content
    end
    
    API->>API: Clear refresh token cookie
    Note right of API: res.clearCookie('refreshToken')
    
    API-->>-App: HTTP 200 OK<br/>{ message: "Logged out" }
    
    Note over App: Clear local storage<br/>Navigate to Login screen
```

---

## 📊 Summary Matrix

| Flow | NestJS | Keycloak | Fineract | MongoDB |
|------|--------|----------|----------|---------|
| **Register** | AuthController → FineractSignupService | Create User | Create Client + 2 Accounts | Create User + 2 Wallets |
| **Login** | AuthController → UserSyncService | Authenticate User | Search/Link Client | Find/Create User, Sync Wallets |
| **Get Wallets** | WalletsController → WalletsService | Get OAuth Token | GET /savingsaccounts/{id} | Get wallet references |
| **Sync Wallets** | WalletsController → WalletsService | Get OAuth Token | GET /clients/{id}/accounts | Upsert wallet references |
| **Refresh** | AuthController | Optional refresh | - | Get user |
| **Logout** | AuthController | Invalidate session | - | - |

---

## 🔑 Key Principles

### 1. Data Ownership
- **Keycloak** owns: User credentials, authentication state
- **Fineract** owns: Client data, account balances, transactions
- **MongoDB** owns: User metadata, wallet ID references only

### 2. Real-time vs Cached
- **Real-time**: Always fetch from Fineract (balances, account status)
- **Cached**: MongoDB stores references only (fineractSavingsId)

### 3. Error Handling
- If Keycloak fails → Auth fails entirely
- If Fineract fails → User can login but wallets show empty
- If MongoDB fails → Entire system down

---

*Generated: 2026-01-19*
