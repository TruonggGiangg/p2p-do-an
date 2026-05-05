# Hướng dẫn Cài đặt & Chạy dự án P2P Lending từ A-Z

Tài liệu này hướng dẫn chi tiết cách cài đặt môi trường và khởi chạy toàn bộ hệ thống P2P Lending bao gồm: Backend (NestJS), Blockchain (Hyperledger Fabric), Mobile App (Expo), và các dịch vụ đi kèm.

---

## 1. Yêu cầu Hệ thống Cơ bản (Prerequisites)

Hãy đảm bảo máy tính của bạn đã cài đặt các công cụ sau:
- **Hệ điều hành:** Windows 10/11 với [WSL2 (Ubuntu)](https://learn.microsoft.com/en-us/windows/wsl/install) hoặc Linux (Ubuntu/Debian).
- **Node.js:** Phiên bản `v18.x` hoặc `v20.x`.
- **Docker Desktop:** Đã kích hoạt tích hợp với WSL2 (Settings > Resources > WSL Integration).
- **Git:** Để clone code và sử dụng Git Bash.
- **Go:** Phiên bản `1.20+` (Cài đặt bên trong môi trường chạy Fabric).
- **Python:** `v3.10+` (Cần cho các service AI/ML).

---

## 2. Thiết lập Môi trường Cơ sở (Database & Core Banking)

Hệ thống yêu cầu các cơ sở dữ liệu và dịch vụ lõi hoạt động. Khởi chạy thông qua Docker:

1. **MongoDB & Redis:** Cung cấp database chính cho Backend NestJS.
2. **Keycloak:** Hệ thống quản lý định danh (IAM) cho Authentication.
3. **Apache Fineract & MySQL:** Core banking dùng để quản lý khoản vay, tiết kiệm.

*(Hãy chạy `docker-compose up -d` ở thư mục chứa file `docker-compose.yml` của các dịch vụ lõi này để khởi động tất cả).*

---

## 3. Khởi chạy Hyperledger Fabric (Mạng Blockchain)

**LƯU Ý QUAN TRỌNG:** Toàn bộ lệnh của Fabric phải được chạy bên trong **WSL2 (Ubuntu terminal)** hoặc **Linux Terminal**, không chạy bằng PowerShell hay Command Prompt.

1. Di chuyển vào thư mục mạng test-network:
   ```bash
   cd /mnt/d/Project/p2p-do-an/fabric-samples/test-network  # (Đường dẫn ví dụ trên WSL)
   ```
2. Xóa mạng cũ (nếu có) và khởi chạy mạng mới cùng kênh `mychannel`:
   ```bash
   COMPOSE_PROJECT_NAME=p2p_fabric_do_an ./network.sh down
   COMPOSE_PROJECT_NAME=p2p_fabric_do_an ./network.sh up createChannel -c mychannel -ca -s couchdb
   ```
3. Triển khai (Deploy) Smart Contract (`p2p-lending`):
   *Lưu ý: Nếu bạn vừa xóa mạng (`network.sh down`) và tạo lại từ đầu, `sequence` (ccs) sẽ bắt đầu lại từ 1:*
   ```bash
   COMPOSE_PROJECT_NAME=p2p_fabric_do_an ./network.sh deployCC -ccn p2p-lending -ccp ../../blockchain/chaincode/p2p-lending -ccl javascript -ccs 1
   ```

4. Deploy lại phiên bản mới (Update Smart Contract):
   *Nếu mạng vẫn đang chạy, bạn sửa code Smart Contract và muốn deploy bản mới, hãy tăng dần số `-ccs` (2, 3, 4...):*
   ```bash
   wsl bash -c "cd /mnt/d/Project/p2p-do-an/fabric-samples/test-network && COMPOSE_PROJECT_NAME=p2p_fabric_do_an ./network.sh deployCC -ccn p2p-lending -ccp ../../blockchain/chaincode/p2p-lending -ccl javascript -ccs 2"
   ```
---

## 4. Cấu hình & Chạy Backend (NestJS - `server_do_an_new`)

1. Di chuyển vào thư mục backend và cài đặt dependencies:
   ```bash
   cd server_do_an_new
   npm install
   ```
2. **Cấu hình `.env`**:
   Đảm bảo bạn có file `.env` chứa URL kết nối tới MongoDB, Redis, Keycloak, Fineract và các cổng dịch vụ nội bộ (vd: `AISCORE_SERVICE_URL=http://localhost:8002`).
   
3. **Đồng bộ Cấu hình Mạng & Tạo Fabric Wallet:**
   Mỗi khi bạn tạo mới (restart/down-up) mạng Fabric, các certificate bảo mật sẽ bị thay đổi. *Bắt buộc phải chạy chuỗi lệnh sau trong môi trường Linux/WSL* để copy chứng chỉ mạng mới sang Backend và tạo lại ví kết nối:
   ```bash
   cd /mnt/d/Project/p2p-do-an/server_do_an_new
   # Copy file connection profile mới nhất
   cp ../fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json ./fabric-config/connection-org1.json
   
   # Xóa ví cũ (nếu có) để tránh lỗi duplicate identity
   rm -rf ./fabric-wallet
   
   # Sinh ví mới
   node scripts/setup-fabric-wallet.js
   ```

4. Khởi động Backend:
   ```bash
   npm run start:dev
   ```

---

## 5. Khởi chạy Mobile App (`client_new`) và Admin Web (`admin_web`)

### Mobile App (Expo)
1. Trong thư mục `client_new`, chạy `npm install`.
2. Đảm bảo cấu hình URL API trong ứng dụng trỏ tới IP LAN của máy tính đang chạy Backend (Ví dụ: `http://192.168.1.10:3000`).
3. Khởi động:
   ```bash
   npx expo start -c
   ```

### Admin Web
1. Trong thư mục `admin_web`, chạy `npm install`.
2. Khởi động:
   ```bash
   npm run dev
   ```

---

## 6. Khởi chạy các Dịch vụ Nâng cao

- **AI Credit Score Service (`aiscore_service`):**
  ```bash
  cd aiscore_service
  pip install -r requirements.txt
  uvicorn app:app --host 0.0.0.0 --port 8002
  ```

---

## 7. Triển khai trên máy chủ SSH (Production/Staging Server)

Nếu bạn muốn setup hệ thống trên một VPS/Server thông qua SSH (chạy Ubuntu/Debian), các bước sẽ tương tự nhưng cần lưu ý:

1. **Cài đặt môi trường:** Cài đặt Docker, Docker Compose, Node.js (dùng `nvm`), Python và Go trực tiếp lên server Ubuntu. (Không cần WSL vì server đã là Linux).
2. **Mở cổng Firewall (UFW / Security Group):** Hãy chắc chắn mở các port quan trọng để truy cập từ bên ngoài:
   - Port `3000` (NestJS API)
   - Port `8080` (Keycloak - nếu không dùng reverse proxy)
   - Port `5173`/`5174` (Admin Web)
   - Port `8002` (AI Score Service)
3. **Quản lý tiến trình (PM2):** Trên server, thay vì chạy `npm run start:dev`, bạn nên build và chạy bằng PM2 để ứng dụng tự khởi động lại khi server crash:
   ```bash
   npm i -g pm2
   cd server_do_an_new
   npm run build
   pm2 start dist/main.js --name "p2p-backend"
   pm2 save
   pm2 startup
   ```
4. **Cấu hình IP/Domain:** Đảm bảo tất cả các file `.env` (Frontend, Mobile, Backend) trỏ về Public IP hoặc Tên miền (Domain) của server thay vì `localhost`.

---

## 8. Quy trình Khởi động Hàng ngày (Daily Dev Workflow)

Lần sau khi bạn mở máy tính lên để tiếp tục code (Deving), **bạn KHÔNG CẦN phải cài đặt lại mọi thứ**. Dưới đây là danh sách các lệnh bạn cần bật lên mỗi ngày:

**Cửa sổ Terminal 1 (WSL): Start Blockchain (nếu cần)**
*Nếu bạn không tắt Docker, mạng Fabric có thể vẫn đang chạy, không cần gõ lệnh này. Nhưng nếu máy tính bị restart:*
```bash
wsl
cd /mnt/d/Project/p2p-do-an/fabric-samples/test-network
COMPOSE_PROJECT_NAME=p2p_fabric_do_an ./network.sh up -s couchdb
```

**Cửa sổ Terminal 2: Start Backend NestJS**
```bash
cd server_do_an_new
npm run start:dev
```

**Cửa sổ Terminal 3: Start AI Service**
```bash
cd aiscore_service
uvicorn app:app --host 0.0.0.0 --port 8002
```

**Cửa sổ Terminal 4: Start Admin Web**
```bash
cd admin_web
npm run dev
```

**Cửa sổ Terminal 5: Start Mobile App**
```bash
cd client_new
npx expo start
```

*Mẹo: Bạn có thể sử dụng các công cụ như tmux (trên Linux/WSL) hoặc Windows Terminal (chia nhiều tab) để mở và quản lý các dịch vụ này dễ dàng hơn mỗi ngày.*

---

## 9. Khắc phục sự cố thường gặp (Troubleshooting)

- **Lỗi không kết nối được Fineract hoặc Keycloak:** Đảm bảo Docker Desktop đang chạy và các container đã xanh (Started).
- **Lỗi "Failed to parse certificate" khi kết nối Fabric:** File setup wallet chưa đúng. Luôn chạy `node scripts/setup-fabric-wallet.js` trong **WSL/Linux**.
- **Lỗi "ctx.stub.getTxDate is not a function":** Đã được fix ở chaincode sequence 3. Hãy đảm bảo bạn đã deploy chaincode mới nhất.
- **Expo App không fetch được API:** Cần tắt tường lửa (Firewall) cho cổng `3000` trên Windows, hoặc đảm bảo điện thoại kết nối cùng mạng Wifi với máy tính.
