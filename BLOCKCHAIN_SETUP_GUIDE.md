# Hướng dẫn Setup và Start Blockchain (Hyperledger Fabric)

Tài liệu này dùng cho đúng phạm vi hiện tại của dự án: **chỉ start phần `fabric-samples/test-network`**, deploy chaincode `p2p-lending`, rồi đồng bộ chứng chỉ sang Backend NestJS.

Trong `fabric-samples` đã có file helper:

```bash
fabric-samples/.network
```

File này lưu cấu hình mạng dùng lại cho các lần sau: Docker compose project `p2p_fabric_do_an`, Docker network `fabric_test`, channel `mychannel`, CouchDB, chaincode `p2p-lending`, image build chaincode `hyperledger/fabric-nodeenv:2.5`, và các function start/deploy/sync backend. Đây là file helper của project, **không phải** Docker network file mặc định của Hyperledger Fabric.

---

## 1. Yêu cầu môi trường

- Mọi lệnh Fabric phải chạy trong Linux/WSL2, không chạy trực tiếp bằng PowerShell.
- Docker Desktop phải đang chạy và bật WSL integration.
- Đường dẫn WSL hiện tại của project:

```bash
cd "/mnt/c/Users/Arisu/Downloads/Big Project For P2P/p2p-do-an"
```

Nếu clone project sang chỗ khác, chỉ cần `cd` vào đúng root project rồi source lại file `.network`.

---

## 2. Load cấu hình `.network`

Mở WSL terminal:

```bash
cd "/mnt/c/Users/Arisu/Downloads/Big Project For P2P/p2p-do-an"
source ./fabric-samples/.network
```

Kiểm tra nhanh biến/folder:

```bash
echo "$P2P_FABRIC_TEST_NETWORK_DIR"
echo "$P2P_FABRIC_CHANNEL"
```

---

## 3. Start lại test-network nếu đã setup rồi

Dùng khi network đã từng setup, certificates/organizations còn tồn tại, chỉ cần bật lại container:

```bash
fabric_test_network_start
fabric_test_network_status
```

Function này chạy đúng lệnh gốc:

```bash
cd "$P2P_FABRIC_TEST_NETWORK_DIR"
COMPOSE_PROJECT_NAME=p2p_fabric_do_an ./network.sh up -ca -s couchdb
```

Sau khi start thành công, Docker sẽ có network `fabric_test`. Blockchain Explorer cũng đang trỏ vào network này trong `blockchain-view/blockchain-explorer/docker-compose.yaml`.

---

## 4. Reset và tạo mới network từ đầu

Dùng khi cần làm sạch dữ liệu cũ, tạo lại certificates, channel và state CouchDB:

```bash
fabric_test_network_reset
```

Function này tương đương:

```bash
COMPOSE_PROJECT_NAME=p2p_fabric_do_an ./network.sh down
COMPOSE_PROJECT_NAME=p2p_fabric_do_an ./network.sh up createChannel -c mychannel -ca -s couchdb
```

Sau khi reset, chaincode sequence quay lại từ `1`.

---

## 5. Deploy smart contract

Chaincode của hệ thống nằm ở:

```bash
blockchain/chaincode/p2p-lending
```

Nếu vừa reset/tạo network mới:

```bash
fabric_test_network_deploy 1
```

Nếu network đang chạy và chỉ cập nhật code chaincode, tăng sequence lên `2`, `3`, `4`, ...

```bash
fabric_test_network_deploy 2
```

Lệnh gốc tương đương:

```bash
cd "$P2P_FABRIC_TEST_NETWORK_DIR"
COMPOSE_PROJECT_NAME=p2p_fabric_do_an ./network.sh deployCC \
  -ccn p2p-lending \
  -ccp ../../blockchain/chaincode/p2p-lending \
  -ccl javascript \
  -ccs 1
```

---

## 6. Đồng bộ Backend NestJS với Fabric

Khi reset network, certificates sẽ đổi. Backend bắt buộc phải copy lại `connection-org1.json` và tạo lại wallet.

Sau khi source `.network`, chạy:

```bash
fabric_backend_sync
```

Function này tương đương:

```bash
cd "/mnt/c/Users/Arisu/Downloads/Big Project For P2P/p2p-do-an/server_do_an_new"

cp ../fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json \
  ./fabric-config/connection-org1.json

rm -rf ./fabric-wallet
node scripts/setup-fabric-wallet.js
```

Start backend:

```bash
cd "$P2P_BACKEND_DIR"
npm run start:dev
```

Nếu kết nối thành công, log backend có dòng:

```text
[FabricService] Successfully connected to Fabric network and obtained smart contract
```

---

## 7. Luồng chạy chuẩn

### Chỉ start lại network đã có sẵn

```bash
cd "/mnt/c/Users/Arisu/Downloads/Big Project For P2P/p2p-do-an"
source ./fabric-samples/.network
fabric_test_network_start
fabric_test_network_status
```

### Setup sạch từ đầu

```bash
cd "/mnt/c/Users/Arisu/Downloads/Big Project For P2P/p2p-do-an"
source ./fabric-samples/.network
fabric_test_network_reset
fabric_test_network_deploy 1
fabric_backend_sync
```

Hoặc dùng một lệnh gộp nếu không cần can thiệp từng bước:

```bash
fabric_test_network_setup_all
```

### Cập nhật chaincode khi network đang chạy

```bash
source ./fabric-samples/.network
fabric_test_network_deploy 2
fabric_backend_sync
```

---

## 8. Troubleshooting

1. **Backend lỗi `DiscoveryService has failed to return results`:**
   - Thường do vừa reset Fabric nhưng chưa chạy `fabric_backend_sync`.
   - Dừng backend, chạy `fabric_backend_sync`, rồi start backend lại.

2. **Deploy chaincode lỗi sequence `requested sequence X is larger than the next available sequence number Y`:**
   - Sequence đưa vào sai.
   - Chạy lại `fabric_test_network_deploy Y` theo số `Y` trong log.

3. **`Certificate or Private Key not found at expected path`:**
   - Chưa tạo network/channel hoặc thư mục `organizations` không đúng.
   - Chạy `fabric_test_network_create` hoặc `fabric_test_network_reset` trước, rồi chạy `fabric_backend_sync`.

4. **Không thấy Docker network `fabric_test`:**
   - `test-network` chưa start hoặc Docker Desktop/WSL integration chưa chạy.
   - Kiểm tra:

```bash
docker network ls | grep fabric_test
fabric_test_network_status
```

5. **Deploy chaincode lỗi `No such image: hyperledger/fabric-nodeenv:2.5`:**
   - Thiếu image dùng để build chaincode JavaScript.
   - File `.network` đã tự pull image này trước khi deploy. Nếu cần chạy tay:

```bash
docker pull hyperledger/fabric-nodeenv:2.5
```

6. **`fabric_backend_sync` báo `node: command not found` trong WSL:**
   - Helper sẽ tự fallback sang `node.exe` nếu Windows Node có trong PATH.
   - Nếu WSL vẫn không thấy Node, chạy bước tạo wallet bằng PowerShell trong `server_do_an_new`:

```powershell
node .\scripts\setup-fabric-wallet.js
```
