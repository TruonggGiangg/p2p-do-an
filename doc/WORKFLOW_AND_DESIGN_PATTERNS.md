# Workflow & Design Patterns

## Tổng quan

Dự án P2P sử dụng kiến trúc Client-Server với:
- **Server**: NestJS + Keycloak (Authentication)
- **Client**: React Native (Expo)

---

## 🔄 Authentication Flow

### Login Flow (Chi tiết)

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤 User
    participant UI as 📱 LoginScreen
    participant AC as 🔐 AuthContext
    participant KA as 🌐 keycloakApi
    participant KC as 🔑 Keycloak Server
    participant AA as 📡 authApi
    participant NS as 🖥️ NestJS Server
    participant SS as 💾 SecureStore
    participant AS as 📦 AsyncStorage

    rect rgb(230, 245, 255)
        Note over U, UI: 1. User Input Phase
        U->>UI: Nhập username + password
        UI->>UI: Validate form (required fields)
        UI->>AC: login(username, password)
    end

    rect rgb(255, 245, 230)
        Note over AC, KC: 2. Keycloak Authentication Phase
        AC->>KA: login(username, password)
        KA->>KC: POST /realms/fineract/protocol/openid-connect/token
        Note right of KA: grant_type=password<br/>client_id=community-app<br/>username=0987654321<br/>password=***
        
        alt Success
            KC-->>KA: 200 OK
            Note right of KC: access_token (RS256, có kid)<br/>refresh_token<br/>expires_in: 300s
            KA-->>AC: KeycloakTokenResponse
        else Invalid Credentials
            KC-->>KA: 401 invalid_grant
            KA-->>AC: Throw Error
            AC-->>UI: Show error "Sai tên đăng nhập/mật khẩu"
        end
    end

    rect rgb(245, 255, 230)
        Note over AC, NS: 3. Server Sync Phase
        AC->>AA: login(keycloakAccessToken)
        AA->>NS: POST /auth/login<br/>Authorization: Bearer <token>
        
        NS->>NS: isKeycloakToken(token)
        Note right of NS: Check header.alg === 'RS256'<br/>Check header.kid exists
        
        NS->>NS: decodeKeycloakToken(token)
        Note right of NS: Extract: sub, username,<br/>email, roles, fineractClientId
        
        NS-->>AA: 200 { data: User, accessToken, refreshToken }
        AA-->>AC: LoginResponse
    end

    rect rgb(255, 230, 245)
        Note over AC, AS: 4. Secure Storage Phase
        AC->>SS: SecureStore.setItemAsync('secure_access_token', keycloakToken)
        Note right of SS: ⚡ Encrypted on iOS Keychain<br/>⚡ Encrypted on Android Keystore
        AC->>SS: SecureStore.setItemAsync('secure_refresh_token', refreshToken)
        AC->>AS: AsyncStorage.setItem('@auth/user', JSON.stringify(user))
        Note right of AS: User data (non-sensitive)
    end

    rect rgb(230, 255, 245)
        Note over AC, UI: 5. UI Update Phase
        AC->>AC: setUser(user)
        AC-->>UI: Navigate to HomeScreen
        UI-->>U: ✅ Đăng nhập thành công
    end
```

---

### API Request Flow (Sau khi đăng nhập)

```mermaid
sequenceDiagram
    autonumber
    participant UI as 📱 Screen
    participant HC as 🌐 httpClient
    participant SS as 💾 SecureStore
    participant NS as 🖥️ NestJS Server
    participant DAG as �️ DualAuthGuard
    participant KC as 🔑 Keycloak JWKS

    rect rgb(230, 245, 255)
        Note over UI, HC: 1. Request Preparation
        UI->>HC: GET /auth/userinfo
        HC->>SS: SecureStore.getItemAsync('secure_access_token')
        SS-->>HC: Keycloak RS256 Token
        HC->>HC: Attach Authorization Header
        Note right of HC: headers.Authorization =<br/>"Bearer eyJhbGciOiJSUzI1NiI..."
    end

    rect rgb(255, 245, 230)
        Note over HC, DAG: 2. Server Validation
        HC->>NS: Request với Bearer Token
        NS->>DAG: canActivate(context)
        
        DAG->>DAG: Extract token from header
        DAG->>DAG: Decode JWT header
        Note right of DAG: Check: alg === 'RS256'
        
        alt Missing kid
            DAG-->>NS: 401 "Token missing key id (kid)"
        end
        
        DAG->>KC: GET /realms/fineract/protocol/openid-connect/certs
        KC-->>DAG: JWKS (public keys)
        DAG->>DAG: Find key matching token.kid
        
        alt Key not found
            DAG-->>NS: 401 "Public key not found"
        end
        
        DAG->>DAG: jwt.verify(token, publicKey)
        
        alt Expired or Invalid Signature
            DAG-->>NS: 401 "Token không hợp lệ"
        end
        
        DAG->>DAG: Extract user from payload
        DAG-->>NS: ✅ request.user = { keycloakUserId, username, ... }
    end

    rect rgb(245, 255, 230)
        Note over NS, UI: 3. Response
        NS->>NS: Process business logic
        NS-->>HC: 200 { data: ... }
        HC-->>UI: Response data
    end
```

---

### Token Refresh Flow (Khi token hết hạn)

```mermaid
sequenceDiagram
    autonumber
    participant UI as 📱 Screen
    participant HC as 🌐 httpClient
    participant SS as 💾 SecureStore
    participant NS as 🖥️ NestJS Server
    participant KC as 🔑 Keycloak Server

    rect rgb(255, 230, 230)
        Note over UI, NS: 1. Request với Token hết hạn
        UI->>HC: GET /some-protected-route
        HC->>SS: getAccessToken()
        SS-->>HC: Expired Keycloak Token
        HC->>NS: Request với expired token
        NS-->>HC: 401 Unauthorized
    end

    rect rgb(255, 255, 230)
        Note over HC, KC: 2. Auto Refresh (httpClient interceptor)
        HC->>HC: Check error.status === 401 && !_retry
        HC->>SS: getRefreshToken()
        SS-->>HC: Keycloak Refresh Token
        
        HC->>KC: POST /realms/fineract/protocol/openid-connect/token
        Note right of HC: grant_type=refresh_token<br/>client_id=community-app<br/>refresh_token=<token>
        
        alt Refresh Success
            KC-->>HC: New access_token, refresh_token
            HC->>SS: saveTokens(newAccessToken, newRefreshToken)
            Note right of SS: ⚡ Encrypted storage
        else Refresh Failed (token revoked)
            KC-->>HC: 401 invalid_grant
            HC->>SS: clearAll()
            HC-->>UI: Redirect to LoginScreen
        end
    end

    rect rgb(230, 255, 230)
        Note over HC, UI: 3. Retry Original Request
        HC->>NS: Retry với new token
        NS-->>HC: 200 Success
        HC-->>UI: ✅ Response data
    end
```

---

## 📝 Quy trình Development

### 1. Tạo Feature mới

```
1. Tạo branch từ main: git checkout -b feature/ten-feature
2. Implement theo các patterns đã định nghĩa
3. Test locally
4. Commit với conventional commits: feat(auth): add login feature
5. Push và tạo Pull Request
```

### 2. Commit Message Format

```
<type>(<scope>): <description>

Types:
- feat: Tính năng mới
- fix: Sửa bug
- docs: Tài liệu
- style: Formatting, không thay đổi logic
- refactor: Refactor code
- test: Thêm tests
- chore: Maintenance tasks

Ví dụ:
- feat(auth): add Keycloak login integration
- fix(client): resolve token refresh issue
- docs(readme): update API documentation
```

### 3. Code Review Checklist

- [ ] Code theo design patterns đã định nghĩa
- [ ] TypeScript types đầy đủ, không dùng `any` nếu có thể tránh
- [ ] Error handling cho tất cả async operations
- [ ] Logging đúng format `[Module] Action: details`
- [ ] No hardcoded values, dùng config/env

---

## 🚀 Environment Setup

### Server (.env)

```env
# Keycloak
KEYCLOAK_BASE_URL=http://118.69.41.95:9000
KEYCLOAK_REALM=fineract
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=admin

# JWT
JWT_SECRET=your-secret
JWT_EXPIRE=1d
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRE=7d

# CORS (comma-separated)
CORS_ORIGINS=http://localhost:8081,http://localhost:19006
```

### Client (.env)

```env
API_BASE_URL=http://10.10.2.230:8080
KEYCLOAK_BASE_URL=http://118.69.41.95:9000
KEYCLOAK_REALM=fineract
KEYCLOAK_CLIENT_ID=community-app
```
