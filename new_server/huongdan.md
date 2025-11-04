# Hướng dẫn thiết lập và chạy P2P Lending Blockchain

## Bước 1: Khởi động mạng Fabric

Đầu tiên, hãy đảm bảo bạn đang ở trong thư mục `fabric-samples/test-network`:

```bash
cd fabric-samples/test-network
```

### Dừng mạng hiện tại (nếu có)
```bash
./network.sh down
```

### Khởi động mạng mới với CA (Certificate Authority)
```bash
./network.sh up createChannel -ca -c mychannel
```

### Triển khai chaincode P2P Lending
```bash
./network.sh deployCC -ccn p2plending -ccp ../chaincode/p2p-lending -ccv 1 -ccl javascript
```

## Bước 2: Copy cấu hình mạng

Sau khi server Fabric chạy thành công, copy folder `organizations` vào thư mục `new_server`:

```bash
# Xóa folder organizations cũ nếu có
rm -rf /mnt/c/Users/PC/Desktop/p2p_new/P2PLending-Blockchain/new_server/organizations

# Copy folder organizations mới
sudo cp -r ~/fabric-samples/test-network/organizations~ <yourpath>~/P2PLending-Blockchain/new_server/
```

## Bước 3: Enroll admin user

Chuyển đến thư mục `new_server` và enroll admin user:

```bash
cd /mnt/c/Users/PC/Desktop/p2p_new/P2PLending-Blockchain/new_server
node enroll-admin.js
```

**Kết quả mong đợi:**
```
Successfully enrolled admin user "admin" and imported it into the wallet
```

## Bước 4: Copy cấu hình sang server

Sau khi enroll thành công, copy wallet và organizations sang thư mục server:

```bash
# Copy wallet
cp -r wallet /mnt/c/Users/PC/Desktop/p2p_new/P2PLending-Blockchain/server/

# Copy organizations
cp -r organizations /mnt/c/Users/PC/Desktop/p2p_new/P2PLending-Blockchain/server/
```

## Bước 5: Test kết nối blockchain

Chuyển đến thư mục server và test kết nối:

```bash
cd /mnt/c/Users/PC/Desktop/p2p_new/P2PLending-Blockchain/server
node test-blockchain.js
```

## Lưu ý quan trọng

- Đảm bảo Hyperledger Fabric đã được cài đặt đúng cách
- Kiểm tra đường dẫn thư mục phù hợp với hệ thống của bạn
- Nếu gặp lỗi permission, hãy chạy lệnh với `sudo`
- Đảm bảo Node.js và các dependencies đã được cài đặt

## Troubleshooting

### Lỗi thường gặp:

1. **Permission denied**: Sử dụng `sudo` cho các lệnh copy
2. **Chaincode deployment failed**: Kiểm tra đường dẫn chaincode
3. **Admin enrollment failed**: Kiểm tra cấu hình CA và organizations

### Kiểm tra trạng thái mạng:
```bash
./network.sh status
``` 