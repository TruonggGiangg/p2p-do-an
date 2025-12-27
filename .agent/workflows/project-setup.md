---
description: Hướng dẫn khởi chạy dự án P2P (Blockchain -> Server -> Client)
---

# PROJECT_SETUP.md - Hướng dẫn Khởi Chạy Dự Án

> **Mục tiêu**: Khởi động toàn bộ hệ thống P2P Lending theo đúng thứ tự để tránh lỗi kết nối.

## 1. Prerequisites (Yêu cầu)
*   Docker & Docker Compose (cho Hyperledger Fabric).
*   Node.js (v18+ khuyến nghị).
*   NestJS CLI.
*   Expo CLI.

## 2. Quy Trình Khởi Động (Startup Sequence)

### Bước 1: Khởi động Blockchain (Hyperledger Fabric)
*   **Vị trí**: `blockchain/test-network` (hoặc tương đương).
*   **Lệnh**:
    ```bash
    ./network.sh up createChannel -c mychannel -ca
    ./network.sh deployCC -ccn basic -ccp ../asset-transfer-basic/chaincode-typescript -ccl typescript
    ```
    *(Lưu ý: Kiểm tra lại đường dẫn chính xác trong thư mục `blockchain`)*

### Bước 2: Khởi động Backend (NestJS Server)
*   **Vị trí**: `server_do_an`
*   **Lệnh**:
    ```bash
    cd server_do_an
    npm run start:dev
    ```
*   **Kiểm tra**: Truy cập `http://localhost:3000/api` (hoặc port cấu hình) để xem Swagger/Hello.

### Bước 3: Khởi động Mobile App (Expo)
*   **Vị trí**: `client_app`
*   **Lệnh**:
    ```bash
    cd client_app
    npx expo start
    ```
*   **Sử dụng**: Quét mã QR bằng Expo Go hoặc chạy trên Android Emulator (`a`).

## 3. Khắc Phục Sự Cố (Troubleshooting)
*   **Lỗi kết nối Blockchain**: Kiểm tra Docker container (`docker ps`).
*   **Lỗi API**: Kiểm tra file `.env` trong `server_do_an` xem đã trỏ đúng IP máy chưa (tránh dùng `localhost` nếu test trên điện thoại thật).
