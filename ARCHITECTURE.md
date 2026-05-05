# Tài liệu Kiến trúc Hệ thống P2P Lending (Siêu Chi tiết)

Tài liệu này mô tả chi tiết kiến trúc phần mềm, luồng giao tiếp và các thành phần cấu thành hệ thống P2P Lending, bao gồm các thành phần nội bộ (Internal) và các kết nối với đối tác bên ngoài (Partners).

---

## 1. Sơ đồ Tổng quan Hệ thống (System Landscape)

Hệ thống được thiết kế theo kiến trúc **Microservices Orchestration**, trong đó NestJS đóng vai trò là "nhạc trưởng" điều phối toàn bộ luồng nghiệp vụ.

![Mô phỏng kiến trúc hệ thống P2P (High-fidelity Model)](file:///C:/Users/truonggiang/.gemini/antigravity/brain/f6b2bc80-7cf2-44bc-ab99-edb1e5708437/p2p_system_architecture_diagram_1776716988327.png)

```mermaid
flowchart TD
    %% Global Graph Styles
    classDef clientLayer fill:#F3F4F6,stroke:#9CA3AF,stroke-width:2px,stroke-dasharray: 5 5,color:#111827;
    classDef gatewayLayer fill:#DBEAFE,stroke:#3B82F6,stroke-width:2px,color:#1E3A8A;
    classDef identityLayer fill:#FEF3C7,stroke:#F59E0B,stroke-width:2px,color:#92400E;
    classDef coreLayer fill:#E0E7FF,stroke:#4F46E5,stroke-width:2px,color:#312E81;
    classDef aiLayer fill:#FCE7F3,stroke:#EC4899,stroke-width:2px,color:#831843;
    classDef blockchainLayer fill:#DDF"4F3",stroke:#14B8A6,stroke-width:2px,color:#134E4A;
    classDef dataLayer fill:#DCFCE7,stroke:#10B981,stroke-width:2px,color:#064E3B;
    classDef partnerLayer fill:#FEF2F2,stroke:#EF4444,stroke-width:2px,color:#7F1D1D;
    
    classDef nodeStyle fill:#FFFFFF,stroke:#6B7280,stroke-width:1px,color:#1F2937,rx:8px,ry:8px,shadow:true;
    classDef dbStyle fill:#FFFFFF,stroke:#10B981,stroke-width:2px,color:#064E3B,shape:cylinder;
    classDef nestStyle fill:#FFFFFF,stroke:#EA2845,stroke-width:2px,color:#EA2845,rx:8px,ry:8px;
    classDef mongoStyle fill:#FFFFFF,stroke:#47A248,stroke-width:2px,color:#47A248,shape:cylinder;
    classDef fStyle fill:#FFFFFF,stroke:#E97B00,stroke-width:2px,color:#E97B00;

    %% 1. TẦNG KHÁCH HÀNG (Client Layer)
    subgraph Client_Layer ["📱 Tầng Giao Diện (Client Layer)"]
        direction LR
        Mobile["📱 Mobile App<br/>(React Native)"]:::nodeStyle
        WebClient["💻 Web App<br/>(ReactJS)"]:::nodeStyle
        AdminWeb["⚙️ Admin Web<br/>(Vite/Antd)"]:::nodeStyle
    end
    class Client_Layer clientLayer;

    %% 2. TẦNG GATEWAY (Proxy Layer)
    subgraph Gateway_Layer ["🌐 Tầng Gateway & Điều Hướng (Proxy Layer)"]
        Nginx["🛡️ Nginx Reverse Proxy<br/>Load Balancer & SSL"]:::nodeStyle
    end
    class Gateway_Layer gatewayLayer;

    %% 3. TẦNG BẢO MẬT (Identity Layer)
    subgraph Identity_Layer ["🔐 Tầng Định Danh (Identity Layer)"]
        Keycloak["🗝️ Keycloak IAM<br/>SSO & RBAC"]:::nodeStyle
    end
    class Identity_Layer identityLayer;

    %% 4. TẦNG LOGIC CỐT LÕI (Core Logic Layer)
    subgraph Core_Layer ["⚙️ Tầng Điều Phối Lõi (Core Orchestrator)"]
        NestJS["🐈 NestJS Server<br/>(Matching Engine & API)"]:::nestStyle
    end
    class Core_Layer coreLayer;

    %% 5. TẦNG AI & TIỆN ÍCH (AI & Utils Layer)
    subgraph AI_Layer ["🧠 Tầng AI & Tiện ích (Phân tích)"]
        direction LR
        EKYC["👤 Python eKYC<br/>(FaceMatch & OCR)"]:::nodeStyle
        AIScore["🎯 Python AI Score<br/>(Credit Scoring)"]:::nodeStyle
    end
    class AI_Layer aiLayer;

    %% 6. TẦNG DỮ LIỆU (Persistence Layer)
    subgraph Data_Layer ["🗄️ Tầng Dữ Liệu Nội Bộ (Data Layer)"]
        direction LR
        MongoDB[("🍃 MongoDB<br/>(P2P Meta & States)")]:::mongoStyle
        PostgreSQL[("🐘 PostgreSQL<br/>(Keycloak DB)")]:::dbStyle
    end
    class Data_Layer dataLayer;

    %% 7. TẦNG ĐỐI TÁC (External Partner Layer)
    subgraph Partner_Layer ["🏢 Tầng Ngân Hàng Đối Tác (Partner Layer)"]
        direction LR
        Fineract["🏦 Apache Fineract<br/>(Core Banking)"]:::fStyle
        SmartCA["✍️ VNPT SmartCA<br/>(Ký Số Điện Tử)"]:::nodeStyle
    end
    class Partner_Layer partnerLayer;

    %% 8. TẦNG BLOCKCHAIN (Trust Layer)
    subgraph Trust_Layer ["⛓️ Tầng Xác Thực (Trust Layer)"]
        Blockchain["📜 Blockchain Nodes<br/>(Smart Contract)"]:::nodeStyle
    end
    class Trust_Layer blockchainLayer;

    %% ================= Luồng Kết Nối =================
    
    %% Client to Proxy
    Mobile --> |HTTPS| Nginx
    WebClient --> |HTTPS| Nginx
    AdminWeb --> |HTTPS| Nginx

    %% Proxy to Internal
    Nginx --> |Auth via OIDC| Keycloak
    Nginx --> |API Requests| NestJS

    %% Core interactions
    NestJS <--> |Verify Token| Keycloak
    NestJS <--> |Read/Write| MongoDB
    NestJS -.-> |REST| EKYC
    NestJS -.-> |REST| AIScore
    NestJS ==> |Verify/Store Hash| Blockchain

    %% External Interactions
    NestJS ===> |REST API| Fineract
    NestJS --> |REST API| SmartCA

    %% DB Interactions
    Keycloak <--> |Read/Write| PostgreSQL
```

---

## 2. Chi tiết các thành phần chính

### 2.1. Tầng Nginx (Reverse Proxy & API Gateway)
- **Vai trò**: Cổng vào duy nhất của hệ thống.
- **Nhiệm vụ chính**:
    - **SSL Termination**: Quản lý chứng chỉ HTTPS.
    - **Routing**: Phân luồng request đến Web Admin (Port 5174), Client Web (Port 5173/3000), hoặc NestJS API (Port 3001).
    - **Security**: Chống các cuộc tấn công cơ bản (DDoS, Rate Limit), ẩn IP thật của các server hạ tầng.
    - **CORS Management**: Kiểm soát quyền truy cập từ các domain khác nhau.

### 2.2. Keycloak (Identity & Access Management - IAM)
- **Vai trò**: Quản lý định danh và quyền truy cập tập trung.
- **Tính năng**:
    - **SSO (Single Sign-On)**: Đăng nhập một lần cho cả hệ thống.
    - **OIDC/SAML**: Cung cấp token JWT cho NestJS server xác thực.
    - **Realm Management**: Quản lý tách biệt môi trường (vú dụ: `fineract` realm).
    - **RBAC**: Quản lý quyền của Admin, Staff và Client.

### 2.3. NestJS Core Server (Orchestrator)
Đây là "trái tim" của hệ thống, điều phối mọi nghiệp vụ P2P:
- **P2P Matching Engine**: Logic ghép nối giữa Lệnh đầu tư (Investment Order) và Hồ sơ vay (Loan Application).
- **Fineract Bridge**: Chuyển đổi logic P2P sang các nghiệp vụ ngân hàng tương ứng (tạo tài khoản, giải ngân, trả gốc lãi) trên Fineract.
- **Workflow Controller**: Quản lý luồng hồ sơ từ Đăng ký -> eKYC -> AI Scoring -> Phê duyệt -> Ký số -> Giải ngân.
- **State Management**: Lưu trữ trạng thái trung gian, cấu hình hệ thống và lịch sử khớp lệnh vào MongoDB.

### 2.4. Python Services (EKYC & AI Score)
Sử dụng thế mạnh của Python trong xử lý dữ liệu và AI:
- **EKYC Service**:
    - **OCR**: Trích xuất thông tin từ CCCD/CMND.
    - **Face Matching**: So khớp khuôn mặt người dùng với ảnh trên giấy tờ.
- **AI Scoring Service**: Tính toán điểm tín dụng dựa trên hành vi và dữ liệu hồ sơ để hỗ trợ ra quyết định cho vay.

### 2.5. Blockchain Layer (Internal)
- **Vai trò**: Đảm bảo tính minh bạch và không thể chối bỏ của các hợp đồng đầu tư.
- **Nghiệm vụ**:
    - **Smart Contract Verification**: Kiểm tra tính hợp lệ của các điều khoản hợp đồng.
    - **Digital Evidence**: Lưu trữ Hash của hợp đồng và giao dịch khớp lệnh lên chuỗi khối để phục vụ đối soát, tránh sửa đổi dữ liệu trái phép.

---

## 3. Thành phần Đối tác (Partners)

### 3.1. Apache Fineract (Core Banking)
- **Mô tả**: Đây là hệ thống của Ngân hàng đối tác.
- **Tương tác**: Hệ thống nội bộ P2P gọi sang Fineract qua REST API để thực hiện các thao tác chuyên sâu về kế toán ngân hàng:
    - Quản lý danh mục khoản vay (Loan Portfolio).
    - Quản lý tài khoản thanh toán (Savings/E-Wallet).
    - Tính toán lịch trả nợ (Repayment Schedule).
- **Lưu ý**: DB MySQL của Fineract nằm ngoài phạm vi quản lý trực tiếp của hệ thống P2P.

### 3.2. VNPT SmartCA
- **Vai trò**: Cung cấp giải pháp ký số từ xa (Remote Signing).
- **Luồng**: Khi hồ sơ được phê duyệt, NestJS gọi SmartCA để người dùng xác nhận ký hợp đồng tín dụng số thông qua App VNPT SmartCA.

---

## 4. Kiến trúc Dữ liệu (Internal Data Topology)

Hệ thống chỉ tập trung quản lý 2 thực thể DB chính:

1.  **MongoDB (P2P Database)**:
    - **Collections**: `investment_orders`, `loan_applications`, `matched_nodes`, `document_types`, `kyc_records`, v.v.
    - **Đặc điểm**: Lưu trữ dữ liệu phi cấu trúc, linh hoạt cho việc mở rộng các thuộc tính hồ sơ và logic ghép lệnh real-time.
2.  **PostgreSQL (Keycloak Persistence)**:
    - Lưu trữ thông tin User, Password Hash, Roles, Clients và Sessions.

---

## 5. Luồng Dữ liệu Điển hình (Loan-Investment Matching)

1.  **Giai đoạn 1**: Người vay gửi yêu cầu -> NestJS gọi EKYC/AIScore -> Nếu đạt, tạo Hồ sơ chờ khớp trên MongoDB.
2.  **Giai đoạn 2**: Nhà đầu tư tạo lệnh đầu tư -> Lưu MongoDB.
3.  **Giai đoạn 3 (Matching Engine)**: NestJS tìm khớp giữa Lệnh và Hồ sơ -> Tạo `matched_nodes` trên MongoDB.
4.  **Giai đoạn 4**: Sau khi khớp 100%, NestJS gọi sang VNPT SmartCA để ký hợp đồng.
5.  **Giai đoạn 5**: Hợp đồng được ký -> NestJS gọi Blockchain để lưu hash xác thực.
6.  **Giai đoạn 6**: NestJS lệnh cho Fineract thực hiện giải ngân (Disbursement) từ tài khoản nhà đầu tư sang người vay.

---
*Tài liệu này được cập nhật vào: 21/04/2026*
