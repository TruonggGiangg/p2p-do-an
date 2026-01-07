---
sidebar_position: 2
title: Database Schema
---

# 💾 Database Schema (Auth)

Dữ liệu xác thực chủ yếu được lưu trữ trong collection `Users` và `Wallet` trên MongoDB.

## 1. User Model (`Users`)

Lưu trữ thông tin định danh gốc của người dùng trên hệ thống P2P.

```javascript
const UserSchema = new mongoose.Schema({
    // Thông tin cơ bản
    phone: { type: String, unique: true, required: true },
    password: { type: String, required: true }, // Bcrypt hash
    category: { type: String, enum: ['borrower', 'lender'] },
    
    // Trạng thái & Token
    token: { type: String }, // JWT P2P token
    isActive: { type: Boolean, default: true },
    
    // Core Banking Integration (Quan trọng)
    fineractClientId: { type: String }, // ID Client trên Fineract
    fineractWalletId: { type: String }, // ID ví chính trên Fineract
    keycloakUserId: { type: String },   // ID User trên Keycloak
    
    // Blockchain Integration
    blockchainId: { type: String },
    connectedHL: { type: String }, // Hyperledger secret
    
    // Wallets (Crypto)
    usdtWallets: [{
        network: { type: String, enum: ['ethereum', 'tron'] },
        address: { type: String },
        privateKey: { type: String }
    }]
});
```

:::warning Lưu ý về Đồng bộ
Các trường `fineractClientId` và `keycloakUserId` là khóa ngoại (Foreign Keys) mềm liên kết với hệ thống bên ngoài. Cần đảm bảo tính nhất quán khi user update profile.
:::

## 2. Wallet Model

Mapping chi tiết hơn về ví của người dùng, đặc biệt phục vụ cho mục đích hiển thị và liên kết tài khoản.

```javascript
const WalletSchema = new mongoose.Schema({
    p2pUserId: { type: String, required: true }, // Reference to Users._id
    
    // Fineract Info
    fineractClientId: { type: String },
    fineractName: { type: String },
    
    // Trạng thái liên kết
    isLinked: { type: Boolean, default: false },
    linkStatus: { type: String, enum: ['pending', 'approved', 'rejected'] },
    
    // Investment (Dành cho Lender)
    lenderInvestmentAccountId: { type: String } // Account dùng để đầu tư (Savings)
});
```
