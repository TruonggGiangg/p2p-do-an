# Hướng dẫn Setup Hyperledger Explorer

Hyperledger Explorer là giao diện web để xem chi tiết blockchain network.

## Yêu cầu

- Docker & Docker Compose
- Hyperledger Fabric network đang chạy
- Node.js 14+ (nếu chạy không có Docker)

## Cách 1: Chạy với Docker (Khuyến nghị)

### 1. Cấu hình kết nối

Sửa file `docker-compose.yaml`:
- Đảm bảo volume mount đúng đường dẫn `organizations`
- Cấu hình network name phù hợp

### 2. Chạy Explorer

```bash
cd blockchain/blockchain-explorer
docker-compose up -d
```

### 3. Truy cập

Mở browser: http://localhost:8080

**Login:**
- Username: `exploreradmin`
- Password: `exploreradminpw`

## Cách 2: Chạy thủ công

### 1. Cài đặt PostgreSQL

```bash
docker run -d --name explorer-db \
  -e POSTGRES_USER=hppoc \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=fabricexplorer \
  -p 5432:5432 \
  postgres:14
```

### 2. Cài dependencies

```bash
cd blockchain/blockchain-explorer
npm install
cd client
npm install
npm run build
```

### 3. Khởi động

```bash
cd app
npm start
```

## Cấu hình Network

File cấu hình quan trọng:
- `app/platform/fabric/config.json` - Cấu hình network
- `app/platform/fabric/connection-profile/` - Connection profiles

### Mẫu config.json

```json
{
  "network-configs": {
    "test-network": {
      "name": "Test Network",
      "profile": "./connection-profile/test-network.json"
    }
  }
}
```

## Troubleshooting

### Lỗi kết nối database
```bash
docker logs explorer-db
```

### Lỗi kết nối Fabric
- Kiểm tra Fabric network đang chạy
- Kiểm tra đường dẫn organizations folder
- Xem logs: `docker logs explorer.mynetwork.com`

### Reset database
```bash
docker-compose down -v
docker-compose up -d
```

## Tài liệu thêm

- [README chính](./README.md)
- [Cấu hình chi tiết](./README-CONFIG.md)
- [Troubleshooting](./TROUBLESHOOT.md)
