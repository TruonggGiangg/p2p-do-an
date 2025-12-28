---
sidebar_position: 2
---

# 🔐 Module Xác thực (Authentication)

## Tổng quan

Hệ thống sử dụng **Keycloak** để quản lý đăng nhập và bảo mật. Điều này đảm bảo rằng mật khẩu và thông tin nhạy cảm của người dùng được bảo vệ theo tiêu chuẩn ngân hàng, tách biệt hoàn toàn với phần mềm xử lý nghiệp vụ vay.

:::tip Tính năng chính
*   **Đăng nhập một lần (SSO)**: An toàn và tiện lợi.
*   **Bảo mật 2 lớp (Token)**: Sử dụng Token để giao tiếp, không gửi mật khẩu liên tục.
*   **Phân quyền rõ ràng**: Người vay không thể truy cập tính năng của Nhà đầu tư.
:::

---

## 🔄 Quy trình Đăng nhập

Dưới đây là sơ đồ mô tả cách hệ thống kiểm tra thông tin khi bạn đăng nhập:

_(Nhấn vào hình để xem chi tiết)_

```mermaid
sequenceDiagram
    autonumber
    
    %% Participants
    actor User as 👤 User
    participant App as 📱 React Native App
    participant KC as 🔑 Keycloak Server
    participant Server as 🖥️ NestJS Server
    participant JWKS as 📜 Keycloak JWKS
    participant Store as � SecureStore
    
    %% ========== PHASE 1: User nhập thông tin ==========
    rect rgb(30, 35, 45)
        Note over User, App: PHASE 1: User Input
        User->>App: Mở app, vào màn Login
        User->>App: Nhập username: 0987654321
        User->>App: Nhập password: TestClient123@
        User->>App: Nhấn nút "Đăng nhập"
    end
    
    %% ========== PHASE 2: Xác thực với Keycloak ==========
    rect rgb(45, 40, 25)
        Note over App, KC: PHASE 2: Keycloak Authentication
        App->>KC: POST /realms/fineract/protocol/openid-connect/token
        Note right of App: Body (form-urlencoded):<br/>grant_type=password<br/>client_id=community-app<br/>username=0987654321<br/>password=TestClient123@
        
        KC->>KC: Kiểm tra username tồn tại?
        KC->>KC: Kiểm tra password đúng?
        
        alt ❌ Sai thông tin
            KC-->>App: 401 { error: "invalid_grant" }
            App-->>User: Hiển thị "Sai tên đăng nhập hoặc mật khẩu"
        else ✅ Đúng thông tin
            KC->>KC: Tạo JWT Token
            Note right of KC: 1. Header: { alg: RS256, kid: "abc123" }<br/>2. Payload: { sub, username, email, roles }<br/>3. Signature: SIGN(header.payload, PRIVATE_KEY)
            KC-->>App: 200 OK
            Note right of KC: {<br/>  access_token: "eyJhbG...",<br/>  refresh_token: "eyJhbG...",<br/>  expires_in: 300,<br/>  token_type: "Bearer"<br/>}
        end
    end
    
    %% ========== PHASE 3: Sync với Server ==========
    rect rgb(25, 45, 30)
        Note over App, Server: PHASE 3: Server Sync (Optional)
        App->>Server: POST /auth/login
        Note right of App: Headers:<br/>Authorization: Bearer eyJhbG...
        
        Server->>Server: Đọc token từ header
        Server->>Server: Decode JWT header
        Note right of Server: header = { alg: "RS256", kid: "abc123" }
        
        Server->>Server: Kiểm tra có kid?
        alt ❌ Không có kid
            Server-->>App: 401 "Token missing key id (kid)"
        end
        
        %% Verify với Public Key
        Server->>JWKS: GET /realms/fineract/protocol/openid-connect/certs
        JWKS-->>Server: Public Keys (JWKS)
        Note right of JWKS: { keys: [<br/>  { kid: "abc123", n: "...", e: "AQAB" },<br/>  { kid: "xyz789", n: "...", e: "AQAB" }<br/>]}
        
        Server->>Server: Tìm key có kid="abc123"
        alt ❌ Không tìm thấy key
            Server-->>App: 401 "Public key not found"
        end
        
        Server->>Server: Chuyển JWK → PEM format
        Server->>Server: jwt.verify(token, publicKey)
        Note right of Server: 🔐 VERIFY SIGNATURE<br/>1. Decrypt signature bằng Public Key<br/>2. So sánh với header.payload<br/>3. Khớp → Token THẬT<br/>4. Không khớp → Token GIẢ
        
        alt ❌ Signature không khớp hoặc hết hạn
            Server-->>App: 401 "Token không hợp lệ"
        else ✅ Token hợp lệ
            Server->>Server: Extract user từ payload
            Server-->>App: 200 OK
            Note right of Server: {<br/>  data: { _id, username, email, roles },<br/>  message: "Đăng nhập thành công"<br/>}
        end
    end
    
    %% ========== PHASE 4: Lưu Token an toàn ==========
    rect rgb(40, 25, 45)
        Note over App, Store: PHASE 4: Secure Storage
        App->>Store: SecureStore.setItemAsync('access_token', token)
        Note right of Store: ⚡ Mã hóa bằng iOS Keychain<br/>⚡ Mã hóa bằng Android Keystore
        App->>Store: SecureStore.setItemAsync('refresh_token', refreshToken)
        App->>Store: AsyncStorage.setItem('user', JSON.stringify(user))
        Note right of Store: User data (không nhạy cảm)
    end
    
    %% ========== PHASE 5: Complete ==========
    rect rgb(25, 45, 30)
        Note over App, User: PHASE 5: Success
        App->>App: setUser(user)
        App->>App: Navigate to HomeScreen
        App-->>User: ✅ "Đăng nhập thành công!"
    end
```

### Giải thích quy trình

Quá trình này diễn ra hoàn toàn tự động trong vài giây:

1.  **Người dùng** nhập số điện thoại và mật khẩu trên App.
2.  **App** gửi thông tin này đến hệ thống bảo mật **Keycloak**.
3.  **Keycloak** kiểm tra:
    *   Nếu sai: Báo lỗi ngay lập tức.
    *   Nếu đúng: Cấp một "Chìa khóa số" (gọi là Access Token) có thời hạn ngắn.
4.  **App** dùng "Chìa khóa" này để nói chuyện với **Máy chủ P2P**, lấy thông tin tài khoản và số dư để hiển thị cho người dùng.

---

## 👥 Phân quyền Người dùng (Roles)

Hệ thống chia người dùng thành các nhóm quyền hạn khác nhau để đảm bảo an toàn nghiệp vụ:

| Vai trò (Role) | Mô tả | Quyền hạn chính |
| :--- | :--- | :--- |
| **Borrower** (Người vay) | Khách hàng có nhu cầu vay vốn | - Tạo hồ sơ vay mới<br/>- Xem lịch trả nợ<br/>- Thực hiện trả nợ |
| **Investor** (Nhà đầu tư) | Khách hàng có vốn nhàn rỗi | - Nạp tiền vào ví<br/>- Xem danh sách hồ sơ vay<br/>- Đầu tư và hưởng lãi |
| **Admin** (Quản trị viên) | Nhân viên vận hành hệ thống | - Duyệt hồ sơ vay<br/>- Xem báo cáo đối soát<br/>- Cấu hình hệ thống |

---

## 🛡️ Chính sách Mật khẩu (Password Policy)

Để đảm bảo an toàn tài sản, mật khẩu bắt buộc phải tuân thủ các quy tắc sau:

*   **Độ dài**: Tối thiểu 12 ký tự.
*   **Độ phức tạp**: Phải bao gồm chữ hoa (A-Z), chữ thường (a-z), số (0-9) và ký tự đặc biệt (@, #, $...).
*   **Không chứa khoảng trắng**.

> **Ví dụ mật khẩu hợp lệ**: `P2pLending@2024`

---

## 📱 Lưu trữ trên Điện thoại

Để bạn không phải đăng nhập lại mỗi lần mở App, chúng tôi lưu trữ "Chìa khóa số" (Token) một cách an toàn:

*   **Trên iOS**: Token được lưu trong **KeyChain** (kho bảo mật cấp cao nhất của Apple).
*   **Trên Android**: Token được lưu trong **Keystore** (kho mã hóa phần cứng).
*   **Tuyệt đối không lưu mật khẩu**: Chúng tôi không bao giờ lưu mật khẩu gốc của bạn trên điện thoại.
