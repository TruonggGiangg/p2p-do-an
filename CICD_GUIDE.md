# 🚀 Hướng Dẫn CI/CD - P2P System

## Tổng Quan

```
Push code → GitHub Actions build Docker image → Push Docker Hub → SSH deploy tự động
```

Server **KHÔNG build**, chỉ pull image từ Docker Hub.

---

## 📋 Thông Tin Server

| Server | IP | User | Key | Vai trò |
|--------|-----|------|-----|---------|
| **p2p-doan** | `13.251.106.252` | `ubuntu` | `p2p-server-doan.pem` | NestJS server + Admin web |
| **xuanho** | `13.212.213.100` | `ubuntu` | `xuanho.pem` | Fineract + Keycloak + MariaDB |

SSH nhanh (đã cấu hình trong `~/.ssh/config`):

```bash
ssh p2p-doan      # → server P2P mới
ssh xuanho        # → server Fineract
```

---

## 🔧 Bước 1: Tạo Docker Hub

1. Đăng nhập [hub.docker.com](https://hub.docker.com)
2. Tạo 2 repositories:
   - `<username>/p2p-server`
   - `<username>/p2p-admin-web`
3. Tạo Access Token:
   - **Account Settings → Security → New Access Token**
   - Quyền: **Read & Write**
   - **Lưu token lại** (chỉ hiện 1 lần)

---

## 🔐 Bước 2: Cấu Hình GitHub Secrets

Vào repo: **https://github.com/TruonggGiangg/p2p-do-an**

**Settings → Secrets and variables → Actions → New repository secret**

Thêm 5 secrets:

### 2.1. `DOCKERHUB_USERNAME`
```
<tên Docker Hub của bạn>
```

### 2.2. `DOCKERHUB_TOKEN`
```
<access token từ Bước 1>
```

### 2.3. `SERVER_HOST`
```
13.251.106.252
```

### 2.4. `SSH_PRIVATE_KEY`

Mở PowerShell chạy:
```powershell
Get-Content C:\Users\truonggiang\.ssh\p2p-server-doan.pem
```

Copy **TOÀN BỘ** output (bao gồm `-----BEGIN...` và `-----END...`) paste vào.

### 2.5. `VITE_API_URL`
```
http://13.251.106.252:3001
```

---

## 🖥️ Bước 3: Khởi Tạo Server (chạy 1 lần)

```bash
# 1. SSH vào server
ssh p2p-doan

# 2. Cài Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# 3. QUAN TRỌNG: Logout rồi login lại
exit
ssh p2p-doan

# 4. Kiểm tra Docker
docker --version

# 5. Tạo Docker network
docker network create p2p-network

# 6. Tạo thư mục app
sudo mkdir -p /opt/p2p
sudo chown ubuntu:ubuntu /opt/p2p

# 7. Tạo file .env cho server
cat > /opt/p2p/.env.server << 'EOF'
# ==================== SERVER & APP ====================
PORT=3001
NODE_ENV=production
DEFAULT_EMAIL_DOMAIN=p2p.com

# ==================== DATABASE ====================
MONGODB_URI=mongodb+srv://truonggiang2299z:gzTwiKgl04tI2dFU@bt001.rpdv1gp.mongodb.net/p2p_new

# ==================== JWT SECURITY ====================
JWT_SECRET=your-super-secret-jwt-key-change-in-production-p2p-new-2026
JWT_EXPIRE=1h
JWT_REFRESH_SECRET=refresh-secret-key-change-in-production-p2p-new-2026
JWT_REFRESH_EXPIRE=7d

# ==================== FINERACT CORE ====================
FINERACT_API_URL=https://fineract.social-chat-xuanho.io.vn/fineract-provider/api/v1
FINERACT_TENANT=default
FINERACT_USERNAME=mifos
FINERACT_PASSWORD=password

# ==================== KEYCLOAK IDENTITY ====================
KEYCLOAK_URL=https://keycloak.social-chat-xuanho.io.vn
KEYCLOAK_REALM=fineract
KEYCLOAK_CLIENT_ID=community-app
KEYCLOAK_CLIENT_SECRET=real-client-secret-123
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=admin
KEYCLOAK_ADMIN_REALM=master
KEYCLOAK_ADMIN_CLIENT_ID=admin-cli

# ==================== BUSINESS DEFAULTS ====================
DEFAULT_OFFICE_ID=1
DEFAULT_LEGAL_FORM_ID=1
DEFAULT_LOCALE=vi
DEFAULT_DATE_FORMAT=dd MMMM yyyy
DEFAULT_EWALLET_PRODUCT_ID=1
DEFAULT_BNPL_LOAN_PRODUCT_ID=5
DEFAULT_BNPL_CREDIT_LIMIT=5000000

# ==================== SECURITY & INFRA ====================
CORS_ORIGINS=*
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
RATE_LIMIT_TTL=60000
RATE_LIMIT_MAX=100

# ==================== EKYC SERVICE (PYTHON) ====================
EKYC_SERVICE_URL=http://160.250.187.132:8686
EKYC_TIMEOUT=20000
EKYC_BYPASS_FACE_MATCH=true

# ==================== AISCORE SERVICE (PYTHON) ====================
AISCORE_ENABLED=true
AISCORE_SERVICE_URL=http://localhost:8002
AISCORE_TIMEOUT=15000

# ==================== VNPT SMARTCA (PRODUCTION) ====================
SMARTCA_API_URL=https://gwsca.vnpt.vn
SMARTCA_SP_ID=4f7f-639086850276666836.apps.smartcaapi.com
SMARTCA_SP_PASSWORD=ODI0MGRhNzQ-ZjU4Ny00MjQy
SMARTCA_MOBILE_CODE=VNPTSmartCAPartner-7a1b3450-3df7-4667-8b84-7bf77d14485c
SMARTCA_CERT_PATH=/sca/sp769/v1/credentials/get_certificate
SMARTCA_SIGN_V1_PATH=/sca/sp769/v1/signatures/sign
SMARTCA_SIGN_V2_PATH=/sca/sp769/v2/signatures/sign
SMARTCA_CONFIRM_V2_PATH=/sca/sp769/v2/signatures/confirm
SMARTCA_STATUS_PATH_TMPL=/sca/sp769/v1/signatures/sign/{transactionId}/status
SMARTCA_DEFAULT_USER_ID=075204014913

# ==================== VNPT SMARTCA (TEST) ====================
SMARTCA_ENV=test
SMARTCA_TEST_API_URL=https://rmgateway.vnptit.vn
SMARTCA_TEST_SP_ID=4184-637127995547330633.apps.signserviceapi.com
SMARTCA_TEST_SP_PASSWORD=NGNhMzdmOGE-OGM2Mi00MTg0
SMARTCA_TEST_MOBILE_CODE=
SMARTCA_TEST_CERT_PATH=/sca/sp769/v1/credentials/get_certificate
SMARTCA_TEST_SIGN_V1_PATH=/sca/sp769/v1/signatures/sign
SMARTCA_TEST_SIGN_V2_PATH=/sca/sp769/v2/signatures/sign
SMARTCA_TEST_CONFIRM_V2_PATH=/sca/sp769/v2/signatures/confirm
SMARTCA_TEST_STATUS_PATH_TMPL=/sca/sp769/v1/signatures/sign/{transactionId}/status
SMARTCA_TEST_DEFAULT_USER_ID=075204014913

DEV_MODE=false
EOF

# 8. Kiểm tra
cat /opt/p2p/.env.server
echo "✅ Server ready!"
```

⚠️ **Lưu ý**: Fineract và Keycloak đã dùng domain HTTPS:
- Fineract: `https://fineract.social-chat-xuanho.io.vn`
- Keycloak: `https://keycloak.social-chat-xuanho.io.vn`

---

## 🚀 Bước 4: Push Code & Deploy

```bash
# Trên máy local
cd d:\Project\p2p-do-an

git add .
git commit -m "feat: add CI/CD with GitHub Actions"
git push origin main
```

### Trigger tự động:
| Sửa file trong... | Workflow chạy |
|---|---|
| `server_do_an_new/` | Deploy P2P Server |
| `admin_web/` | Deploy Admin Web |

### Trigger thủ công:
1. Vào **GitHub → Actions**
2. Chọn workflow
3. Bấm **"Run workflow"**

---

## ✅ Bước 5: Kiểm Tra

```bash
# SSH vào server
ssh p2p-doan

# Xem containers đang chạy
docker ps

# Xem logs server
docker logs p2p-server --tail 50

# Xem logs admin web
docker logs p2p-admin-web --tail 50

# Test API
curl http://localhost:3001

# Test Admin Web
curl http://localhost:5173
```

Kết quả mong đợi:
```
CONTAINER ID   IMAGE                        PORTS                      NAMES
xxxx           .../p2p-server:latest        127.0.0.1:3001->3001       p2p-server
yyyy           .../p2p-admin-web:latest     127.0.0.1:5173->80         p2p-admin-web
```

---

## 📁 Cấu Trúc Files CI/CD

```
p2p-do-an/
├── .github/workflows/
│   ├── deploy-server.yml      ← CI/CD cho NestJS backend
│   └── deploy-admin.yml       ← CI/CD cho Admin web
├── server_do_an_new/
│   ├── Dockerfile             ← Multi-stage build NestJS
│   └── .dockerignore
├── admin_web/
│   ├── Dockerfile             ← Multi-stage build Vite + nginx
│   ├── nginx.conf             ← SPA routing config
│   └── .dockerignore
└── scripts/
    └── server-init.sh         ← Script cài đặt server ban đầu
```

---

## 🔄 Flow Chi Tiết

```
Developer push code
       ↓
GitHub Actions detect changes
       ↓
Build Docker image (on GitHub runner)
       ↓
Push image to Docker Hub (tag: latest + sha-xxxxx)
       ↓
SSH into server (13.251.106.252)
       ↓
docker pull <image>:latest
       ↓
docker stop → docker rm → docker run
       ↓
Health check (5s timeout)
       ↓
✅ Done!
```

---

## 🛠️ Lệnh Hữu Ích

### Trên server:
```bash
# Restart container
docker restart p2p-server
docker restart p2p-admin-web

# Xem logs real-time
docker logs -f p2p-server

# Vào trong container debug
docker exec -it p2p-server sh

# Xem disk usage
docker system df

# Dọn rác (images cũ)
docker system prune -af
```

### Rollback (quay lại version cũ):
```bash
# Xem tất cả tags trên Docker Hub
# Hoặc dùng tag cụ thể
docker pull <username>/p2p-server:sha-abc1234
docker stop p2p-server && docker rm p2p-server
docker run -d --name p2p-server --restart unless-stopped \
  --network p2p-network --env-file /opt/p2p/.env.server \
  -p 127.0.0.1:3001:3001 <username>/p2p-server:sha-abc1234
```

---

## ⚠️ Lưu Ý

1. **Security Group AWS**: Mở port `22` (SSH) cho GitHub Actions IP ranges
2. **Elastic IP**: Nên gán Elastic IP cho EC2 để IP không đổi khi restart
3. **SSL/HTTPS**: Cần thêm Nginx reverse proxy + Certbot nếu dùng domain
4. **MongoDB**: Server NestJS cần kết nối MongoDB, cần setup thêm trên server hoặc dùng MongoDB Atlas
