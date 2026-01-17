# 🔐 Hệ thống Xác thực: Kiến trúc Microservices & Luồng Nghiệp vụ

> **Tài liệu kỹ thuật chuyên sâu (Deep Dive)**
>
> *   **Phiên bản:** 4.0 (Enhanced Visuals & Detailed Flows)
> *   **Cập nhật:** 18/01/2026
> *   **Phạm vi:** Bảo mật, Quản lý Token, Luồng dữ liệu liên server.

---

## 📋 Mục lục

| STT | Nội dung chính |
|:---:|:---|
| **1** | [Tổng quan Kiến trúc](#1-tổng-quan-kiến-trúc) |
| **2** | [Tiêu chuẩn Kỹ thuật & Mật mã](#2-tiêu-chuẩn-kỹ-thuật--mật-mã) |
| **3** | [Chi tiết Luồng: Đăng Ký](#3-chi-tiết-luồng-đăng-ký-registration) |
| **4** | [Chi tiết Luồng: Đăng Nhập & Token Swap](#4-chi-tiết-luồng-đăng-nhập--token-swap) |
| **5** | [Chi tiết Luồng: Làm mới Token](#5-chi-tiết-luồng-làm-mới-token-refresh) |
| **6** | [Tổng kết Bảo mật](#6-tổng-kết-bảo-mật) |

---

## 1. Tổng quan Kiến trúc

Hệ thống vận hành theo mô hình **API Gateway (BFF)** đóng vai trò trung gian bảo mật, che giấu hạ tầng Microservices phức tạp bên dưới.

### Sơ đồ Kiến trúc Hệ thống

```mermaid
flowchart TD
    %% Define Styles
    classDef client fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
    classDef gateway fill:#fff9c4,stroke:#fbc02d,stroke-width:2px,color:#f57f17
    classDef service fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#1b5e20
    classDef db fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#4a148c

    %% Nodes
    Client(📱 Mobile App / Client):::client
    
    subgraph Public_Zone [🌍 Public Internet Zone]
        Gateway(🛡️ API Gateway / BFF<br/><i>NestJS</i>):::gateway
    end

    subgraph Private_Zone [🔒 Private Network / DMZ]
        direction TB
        Keycloak(🔐 Identity Service<br/><i>Keycloak OAuth2</i>):::service
        Fineract(🏦 Core Banking<br/><i>Apache Fineract</i>):::service
        
        KC_DB[(User DB)]:::db
        Fin_DB[(Banking DB)]:::db
    end

    %% Connections
    Client -- "HTTPS / Bearer JWT (HS256)" --> Gateway
    
    Gateway -- "Admin API / Service Account" --> Keycloak
    Gateway -- "REST / Basic Auth" --> Fineract
    
    Keycloak --- KC_DB
    Fineract --- Fin_DB

    %% Comments
    Note_G[Gateway thực hiện<br/>Token Swapping & Routing] -.-> Gateway
```

### Nguyên lý Cốt lõi
1.  **Client Ignorance:** Client chỉ biết Gateway, không biết Keycloak hay Fineract tồn tại.
2.  **Token Swapping:** Gateway chuyển đổi Token nặng (OAuth2) thành Token nhẹ (Internal) để tối ưu hiệu năng.
3.  **Stateless:** Không lưu Session vào Database, sử dụng JWT để xác thực từng request.

---

## 2. Tiêu chuẩn Kỹ thuật & Mật mã

Chúng tôi sử dụng mô hình **Lai (Hybrid)** giữa mã hóa Bất đối xứng và Đối xứng.

### 2.1. Phân loại Token & Thuật toán

| Đặc tính | Token Ngoại (Keycloak) | Token Nội (Gateway) |
|:---|:---|:---|
| **Mục đích** | Xác thực danh tính gốc (Identity) | Quản lý phiên làm việc (Session) |
| **Thuật toán** | **RS256** (RSA Signature) | **HS256** (HMAC SHA-256) |
| **Loại khóa** | Bất đối xứng (Public/Private Key) | Đối xứng (Shared Secret) |
| **Ưu điểm** | Bảo mật cao, chuẩn OAuth2 | Nhanh, nhẹ (~200 bytes), dễ quản lý |

### 2.2. Cơ chế Tìm & Xác thực Khóa (Key Lookup)

Quy trình Gateway xác thực Token RS256 từ Keycloak:

1.  **Trích xuất Header:** Gateway đọc header của JWT nhận được để lấy `kid` (Key ID).
    ```json
    { "alg": "RS256", "kid": "U5wS-xyz..." }
    ```
2.  **JWKS Lookup:** Gateway gọi endpoint `/certs` của Keycloak để lấy danh sách Public Keys.
3.  **Matching:**
    *   Tìm Public Key có `kid` trùng khớp.
    *   Dùng Public Key đó để verify chữ ký của Token.
    *   Nếu khớp: Token hợp lệ.

### 2.3. Quản lý Bí mật (Secret Management)

| Biến môi trường (`.env`) | Mục đích | Lưu ý Bảo mật |
|:---|:---|:---|
| `JWT_SECRET` | Ký Access Token nội bộ | Thay đổi sẽ làm rớt toàn bộ phiên đăng nhập |
| `JWT_REFRESH_SECRET` | Ký Refresh Token nội bộ | Phải khác `JWT_SECRET` |
| `KEYCLOAK_PUBLIC_KEY` | (Tùy chọn) Public Key hardcode | Dùng nếu không muốn gọi JWKS (ít linh hoạt hơn) |

---

## 3. Chi tiết Luồng: Đăng Ký (Registration)

Đây là nghiệp vụ phức tạp nhất, yêu cầu tính toàn vẹn dữ liệu trên nhiều service (**Distributed Transaction**).

### Sơ đồ Tuần tự Chi tiết

```mermaid
sequenceDiagram
    autonumber
    participant C as 📱 Client
    participant G as 🛡️ Gateway
    participant K as 🔐 Keycloak (IdP)
    participant F as 🏦 Fineract (Core)

    C->>G: POST /register<br/>{Phone, Name, Password}
    
    rect rgb(245, 245, 245)
        Note over G: 🏁 Bắt đầu Distributed Transaction
        
        %% Step 1: Identity
        G->>K: POST /users (Admin Token)<br/>Create User Entity
        
        alt ❌ Tạo User Thất bại
            K-->>G: 4xx/5xx Error
            G-->>C: 400 Bad Request
        else ✅ Tạo User Thành công
            K-->>G: 201 Created {UUID}
            
            %% Step 2: Role Mapping
            G->>K: POST /role-mappings<br/>Assign 'borrower' Role
            
            %% Step 3: Banking Entity
            G->>F: POST /clients (Basic Auth)<br/>Create Client {externalId: Phone}
            
            alt ❌ Tạo Client Thất bại
                F-->>G: Error
                Note over G: 🔄 ROLLBACK: Xóa User Keycloak
                G->>K: DELETE /users/{UUID}
                G-->>C: 500 Internal Server Error
            else ✅ Tạo Client Thành công
                F-->>G: 200 OK {clientId: 100}
                
                %% Step 4: Account
                G->>F: POST /savingsaccounts<br/>Create & Activate Wallet
                F-->>G: 200 OK {savingsId: 555}
                
                Note over G: 🎉 Transaction Hoàn tất
                G-->>C: 201 Created<br/>{User Created Successfully}
            end
        end
    end
```

---

## 4. Chi tiết Luồng: Đăng Nhập & Token Swap

Minh họa kỹ thuật **Token Swapping** để tối ưu hóa gói tin và bảo mật.

### Sơ đồ Tuần tự Chi tiết

```mermaid
sequenceDiagram
    autonumber
    participant C as 📱 Client
    participant G as 🛡️ Gateway
    participant K as 🔐 Keycloak

    Note over C: Người dùng nhập User/Pass

    C->>G: POST /auth/login<br/>{username, password}
    
    Note over G: Gateway đóng vai trò Proxy
    G->>K: POST /token<br/>grant_type=password<br/>client_id=..., client_secret=...
    
    K-->>G: 200 OK<br/>{access_token (RS256), refresh_token}
    
    rect rgb(255, 250, 240)
        Note over G: ⚠️ TOKEN SWAPPING PROCESS
        
        G->>G: 1. Decode Header (Lấy 'kid')
        G->>G: 2. Fetch Public Key (Cache/JWKS)
        G->>G: 3. Verify RS256 Signature
        
        alt ❌ Verify Thất bại
            G-->>C: 500 Internal Error (Untrusted IdP)
        else ✅ Verify Thành công
            G->>G: 4. Extract User Info (Sub, Roles, Email)
            G->>G: 5. Generate Internal Token (HS256)<br/>Signed with JWT_SECRET
        end
    end
    
    G-->>C: 200 OK<br/>{accessToken (HS256), refreshToken (HS256)}
    
    Note over C: Client lưu Token vào SecureStorage
```

---

## 5. Chi tiết Luồng: Làm mới Token (Refresh)

Cơ chế **Refresh Token Rotation** giúp duy trì phiên đăng nhập an toàn và phát hiện tấn công Replay.

### Sơ đồ Tuần tự Chi tiết

```mermaid
sequenceDiagram
    autonumber
    participant C as 📱 Client
    participant G as 🛡️ Gateway
    participant DB as 🗄️ Cache/Redis (Optional)

    C->>G: Request API + Bearer Token (Expired ⏳)
    G-->>C: 🔴 401 Unauthorized

    Note over C: Interceptor phát hiện 401 -> Gọi Refresh

    C->>G: POST /auth/refresh<br/>Cookie: refreshToken=OLD_TOKEN
    
    rect rgb(240, 255, 240)
        Note over G: 🛡️ SECURITY CHECK
        
        G->>G: Verify Signature (JWT_REFRESH_SECRET)
        
        alt ❌ Token Invalid / Expired
            G-->>C: 403 Forbidden (Force Logout)
        else ✅ Signature Valid
            G->>DB: Check if Token is Revoked/Reused?
            
            alt ☠️ REPLAY ATTACK DETECTED (Token đã dùng)
                DB-->>G: Yes, token used at 10:00 AM
                Note over G: 🚨 CẢNH BÁO BẢO MẬT
                G->>DB: Revoke ALL tokens for User
                G-->>C: 403 Forbidden (Security Alert)
            else 🟢 Token Hợp lệ (Chưa dùng)
                G->>DB: Mark OLD_TOKEN as Used
                
                G->>G: Generate Access Token v2 (1h)
                G->>G: Generate Refresh Token v2 (7d)
                
                G-->>C: 200 OK<br/>Set-Cookie: refreshToken=NEW_TOKEN
            end
        end
    end
    
    C->>G: Retry Original Request + Bearer Token v2
    G-->>C: 200 OK (Data Response)
```

---

## 6. Tổng kết Bảo mật

Bảng tóm tắt các cơ chế phòng thủ đang áp dụng:

| Mối đe dọa | Cơ chế phòng thủ | Giải thích |
|:---|:---|:---|
| **Lộ Access Token** | Short-lived Expiration | Access token chỉ sống 1 giờ. Hacker có lấy được cũng chỉ dùng được ngắn hạn. |
| **Trộm Refresh Token** | Token Rotation | Mỗi lần refresh sẽ đổi token mới. Token cũ bị vô hiệu hóa ngay lập tức. |
| **Tấn công giả mạo** | Digital Signature | Token được ký bằng thuật toán mạnh (RSA/HMAC), không thể chỉnh sửa payload. |
| **Tấn công nội bộ** | Zero Trust | Gateway vẫn phải xác thực khi gọi các service nội bộ (Service Accounts). |
| **Replay Attack** | One-time Usage | Hệ thống phát hiện nếu một refresh token được sử dụng lần thứ 2. |

---
**Hết tài liệu.**
