# Hướng dẫn chi tiết Setup và Khởi chạy Blockchain (Hyperledger Fabric)

Tài liệu này cung cấp các bước chi tiết từ A-Z để khởi tạo, chạy mạng Blockchain và kết nối thành công với Backend NestJS của dự án P2P Lending.

---

## 1. Yêu cầu Hệ thống Môi trường
- **Môi trường bắt buộc:** Mọi lệnh liên quan đến Fabric **phải** được chạy trong môi trường Linux. Nếu dùng Windows, hãy sử dụng **WSL2 (Ubuntu)**.
- **Docker:** Đảm bảo **Docker Desktop** đang chạy và đã tích hợp với WSL2 (Settings > Resources > WSL Integration).

---

## 2. Quá trình Khởi chạy Mạng Blockchain (Test-Network)

Mở terminal WSL (gõ `wsl` trên Windows Terminal hoặc CMD) và thực hiện các bước sau:

### Bước 2.1. Di chuyển vào thư mục mạng
```bash
cd /mnt/d/Project/p2p-do-an/fabric-samples/test-network
```

### Bước 2.2. Xóa và làm sạch mạng cũ (Reset Network)
Việc này đảm bảo xóa sạch dữ liệu của các hợp đồng cũ, tránh xung đột lỗi identity và chứng chỉ bảo mật.
```bash
COMPOSE_PROJECT_NAME=p2p_fabric_do_an ./network.sh down
```

### Bước 2.3. Khởi tạo mạng mới
Lệnh này sẽ tạo ra một channel mới tên là `mychannel` và sử dụng CouchDB để lưu trữ state (giúp query dữ liệu dạng JSON dễ dàng hơn).
```bash
COMPOSE_PROJECT_NAME=p2p_fabric_do_an ./network.sh up createChannel -c mychannel -ca -s couchdb
```

---

## 3. Triển khai (Deploy) Smart Contract

Chaincode của hệ thống P2P Lending nằm ở thư mục `blockchain/chaincode/p2p-lending`. 

### Trường hợp 1: Mạng vừa được khởi tạo mới hoàn toàn (như Bước 2)
Sau khi chạy lệnh `network.sh down` và tạo lại mạng, bộ đếm sequence (ccs) của chaincode sẽ **bắt đầu lại từ 1**.
```bash
COMPOSE_PROJECT_NAME=p2p_fabric_do_an ./network.sh deployCC -ccn p2p-lending -ccp ../../blockchain/chaincode/p2p-lending -ccl javascript -ccs 1
```

### Trường hợp 2: Mạng ĐANG CHẠY, chỉ muốn cập nhật lại code Chaincode
Nếu bạn vừa chỉnh sửa file `index.js` hoặc logic bên trong chaincode, bạn cần **tăng** sequence (`-ccs`) lên một đơn vị (Ví dụ: 2, 3, 4...) để Fabric hiểu là bản cập nhật.
```bash
COMPOSE_PROJECT_NAME=p2p_fabric_do_an ./network.sh deployCC -ccn p2p-lending -ccp ../../blockchain/chaincode/p2p-lending -ccl javascript -ccs 2
```

---

## 4. Kết nối Backend (NestJS) với Blockchain

Khi mạng Fabric tạo mới, các chứng chỉ bảo mật (Certificates) sẽ được tạo ngẫu nhiên lại. Bạn **BẮT BUỘC** phải cập nhật các chứng chỉ này cho Backend và tạo lại ví (Wallet).

### Chạy chuỗi lệnh sau trong WSL:
```bash
cd /mnt/d/Project/p2p-do-an/server_do_an_new

# 1. Copy file cấu hình mạng (Connection Profile) mới nhất chứa chứng chỉ vào Backend
cp ../fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json ./fabric-config/connection-org1.json

# 2. Xóa ví cũ của Backend để tránh lỗi Identity Already Exists hoặc chứng chỉ bị lệch
rm -rf ./fabric-wallet

# 3. Tái tạo ví (Wallet) mới thông qua file script setup
node scripts/setup-fabric-wallet.js
```

### Bước cuối cùng: Khởi động Backend
Mở một terminal mới (hoặc dùng terminal hiện tại) và khởi động server NestJS. Backend sẽ tự động đọc ví mới và kết nối thành công:
```bash
npm run start:dev
```

🎉 Nếu kết nối thành công, trong log của Backend sẽ xuất hiện dòng chữ:
`[FabricService] Successfully connected to Fabric network and obtained smart contract`

---

## 5. Khắc phục sự cố thường gặp (Troubleshooting)

1. **Lỗi `DiscoveryService has failed to return results` trên Backend:**
   - Nguyên nhân: Bạn đã chạy `network.sh down` nhưng quên chạy Bước 4 để cập nhật lại ví và connection profile cho Backend.
   - Khắc phục: Dừng Backend, thực hiện đầy đủ **Bước 4**, sau đó chạy lại Backend.

2. **Lỗi `failed to invoke backing implementation of 'ApproveChaincodeDefinitionForMyOrg': requested sequence X is larger than the next available sequence number Y`:**
   - Nguyên nhân: Bạn cung cấp sai Sequence Number khi deploy chaincode. 
   - Khắc phục: Sửa lại cờ `-ccs` thành số Y đang được yêu cầu trong log (Ví dụ: `-ccs 1`).

3. **Lỗi `Certificate or Private Key not found at expected path` khi chạy `setup-fabric-wallet.js`:**
   - Nguyên nhân: Bạn đang chạy script nhưng thư mục mạng Fabric trống do chưa chạy Bước 2.3.
   - Khắc phục: Đảm bảo mạng `p2p_fabric_do_an` đang chạy, sau đó chạy lại script setup.



## 6. Start lại nếu setup lại

```bash
wsl bash -c "cd /mnt/d/Project/p2p-do-an/fabric-samples/test-network && COMPOSE_PROJECT_NAME=p2p_fabric_do_an ./network.sh up -s couchdb"
```