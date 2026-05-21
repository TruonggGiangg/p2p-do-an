#!/bin/bash
set -e

echo "=== Cập nhật mã nguồn ==="
cd ~/p2p-do-an

echo "=== Khởi tạo mạng Hyperledger Fabric ==="
cd ~/p2p-do-an/fabric-samples/test-network
./network.sh down
./network.sh up createChannel -c mychannel -ca

echo "=== Triển khai Smart Contract (Chaincode) ==="
cd ../../blockchain/chaincode/p2p-lending
npm install
cd ../../../fabric-samples/test-network
./network.sh deployCC -ccn p2p-lending -ccp ../../blockchain/chaincode/p2p-lending -ccl javascript

echo "=== Cấu hình Connection Profile ==="
sudo mkdir -p /opt/p2p/fabric-config
sudo mkdir -p /opt/p2p/fabric-wallet

sudo cp organizations/peerOrganizations/org1.example.com/connection-org1.json /opt/p2p/fabric-config/

# Thay thế localhost bằng địa chỉ IP Host của Docker
sudo sed -i 's/localhost/172.17.0.1/g' /opt/p2p/fabric-config/connection-org1.json

echo "=== Tạo Wallet Admin ==="
cd ~/p2p-do-an/server_do_an_new/scripts
# Cài đặt dependency cần thiết cho file script setup-fabric-wallet.js
npm install fabric-network
node setup-fabric-wallet.js

# Copy vào thư mục /opt/p2p của server
sudo cp -r ../fabric-wallet/* /opt/p2p/fabric-wallet/

echo "=== Cấp quyền cho user nodejs (1001) của Docker ==="
sudo chown -R 1001:1001 /opt/p2p/fabric-config /opt/p2p/fabric-wallet

echo "=== Khởi động lại P2P Server (nếu đang chạy) ==="
docker restart p2p-server || true

echo "=== ✅ Setup Fabric Hoàn Tất! ==="
