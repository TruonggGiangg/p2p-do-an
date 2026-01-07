---
sidebar_position: 3
title: Cài đặt Môi trường
---

# 🛠️ Cài đặt Môi trường Phát triển

Hướng dẫn chi tiết cài đặt môi trường development cho P2P Lending Platform.

---

## Yêu cầu Hệ thống

| Thành phần | Phiên bản | Ghi chú |
|------------|-----------|---------|
| **Node.js** | 18.x hoặc 20.x | LTS version |
| **npm** | 9.x+ | Đi kèm Node.js |
| **Docker** | Latest | Docker Desktop |
| **Git** | Latest | |
| **MongoDB** | 6.x+ | Chạy qua Docker |
| **VS Code** | Latest | IDE khuyên dùng |

---

## 1. Cài đặt Node.js

### Windows
```powershell
# Sử dụng nvm-windows (recommended)
# Download từ: https://github.com/coreybutler/nvm-windows/releases

nvm install 18
nvm use 18
node --version  # Verify: v18.x.x
```

### macOS/Linux
```bash
# Sử dụng nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

---

## 2. Cài đặt Docker

### Windows/macOS
1. Download [Docker Desktop](https://www.docker.com/products/docker-desktop)
2. Cài đặt và khởi động
3. Verify: `docker --version`

### Linux
```bash
sudo apt-get update
sudo apt-get install docker.io docker-compose
sudo systemctl start docker
```

---

## 3. Clone Repository

```bash
git clone <repository-url>
cd p2p
```

---

## 4. Cấu hình Environment Variables

### Server (.env)
```bash
cd server
cp .env.example .env
```

Chỉnh sửa file `.env`:
```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/p2p_lending

# Fineract
FINERACT_BASE_URL=https://fineract.example.com
FINERACT_USERNAME=admin
FINERACT_PASSWORD=password

# Keycloak
KEYCLOAK_BASE_URL=https://keycloak.example.com
KEYCLOAK_REALM=fineract
KEYCLOAK_CLIENT_ID=community-app

# Server
PORT=3000
NODE_ENV=development
```

---

## 5. Khởi động Services

### Bước 1: Khởi động MongoDB
```bash
# Trong folder root của project
docker-compose up -d mongodb
```

Hoặc dùng Docker trực tiếp:
```bash
docker run -d --name mongodb -p 27017:27017 mongo:6
```

### Bước 2: Khởi động Server
```bash
cd server
npm install
npm start
```

Server chạy tại: `http://localhost:3000`

### Bước 3: Khởi động Mobile App
```bash
cd client
npm install
npx expo start
```

---

## 6. VS Code Extensions (Khuyên dùng)

| Extension | Mục đích |
|-----------|----------|
| **ESLint** | Linting JavaScript/TypeScript |
| **Prettier** | Code formatting |
| **MongoDB for VS Code** | Xem data MongoDB |
| **REST Client** | Test API nhanh |
| **React Native Tools** | Debug React Native |
| **GitLens** | Git history |

---

## 7. Kiểm tra Setup

### Test Server
```bash
curl http://localhost:3000/health
# Expected: {"status":"ok"}
```

### Test MongoDB Connection
```bash
# Trong MongoDB Compass, connect to:
mongodb://localhost:27017
```

### Test Mobile App
- Mở Expo Go app trên điện thoại
- Scan QR code từ terminal

---

## 🔧 Troubleshooting

### Lỗi: "EACCES permission denied"
```bash
# Linux/macOS
sudo chown -R $USER:$GROUP ~/.npm
```

### Lỗi: "Port 3000 already in use"
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/macOS
lsof -i :3000
kill -9 <PID>
```

### Lỗi: MongoDB connection refused
```bash
# Kiểm tra container đang chạy
docker ps

# Restart MongoDB
docker-compose restart mongodb
```

### Lỗi: Expo không kết nối được
- Đảm bảo điện thoại và máy tính cùng mạng WiFi
- Thử dùng tunnel mode: `npx expo start --tunnel`

---

## 📋 Checklist Hoàn thành

- [ ] Node.js 18+ đã cài
- [ ] Docker đã cài và chạy
- [ ] Repository đã clone
- [ ] File `.env` đã cấu hình
- [ ] MongoDB container đang chạy
- [ ] Server khởi động thành công (port 3000)
- [ ] Mobile app hiển thị trên Expo
