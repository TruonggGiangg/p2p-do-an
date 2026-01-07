---
sidebar_position: 2
title: Technology Radar
---

# 🛠️ Công nghệ Sử dụng (Technology Radar)

Hệ thống P2P không chỉ là một ứng dụng web/mobile đơn thuần. Nó được thiết kế mô phỏng một **Hệ thống Fintech Thực tế**, ưu tiên **Bảo mật**, **Tính Chính xác** và **Khả năng Kiểm toán**.

---

## ✅ Công nghệ Được Duyệt (ADOPT)

### Backend & Business Logic

| Công nghệ | Phiên bản | Mục đích |
|-----------|-----------|----------|
| **Node.js** | 18.x+ / 20.x | Runtime JavaScript |
| **Express.js** | 4.x | Web framework |
| **MongoDB** | 6.x+ | Database chính |
| **Mongoose** | 8.x | ODM cho MongoDB |

### Core Banking & Finance

| Công nghệ | Phiên bản | Mục đích |
|-----------|-----------|----------|
| **Apache Fineract** | 1.8.x | Core Banking System - Quản lý sổ cái, tài khoản vay, tiết kiệm |

:::info Tại sao Fineract?
Thay vì dùng Database thông thường để cộng trừ tiền (dễ sai sót), chúng tôi sử dụng Fineract - giải pháp Core Banking chuẩn mực thế giới. Tính năng: Tự động tính lãi suất phức tạp (Lãi giảm dần, Lãi phạt, Lãi cộng dồn hàng ngày).
:::

### Security & Identity

| Công nghệ | Phiên bản | Mục đích |
|-----------|-----------|----------|
| **Keycloak** | 21.x+ | Identity & Access Management (OAuth2, OIDC) |
| **JWT** | - | Token-based authentication |
| **bcrypt** | - | Password hashing |

### Blockchain & Trust Layer

| Công nghệ | Phiên bản | Mục đích |
|-----------|-----------|----------|
| **Hyperledger Fabric** | 2.5.x | Enterprise Blockchain - Lưu trữ bất biến |

:::tip Tại sao không dùng Ethereum?
Dữ liệu tài chính cần sự riêng tư (Privacy) và định danh rõ ràng (Permissioned), không phù hợp với Public Chain.
:::

### Mobile Client

| Công nghệ | Phiên bản | Mục đích |
|-----------|-----------|----------|
| **React Native** | 0.72+ | Cross-platform mobile |
| **Expo** | SDK 49+ | Development toolchain |
| **AsyncStorage** | - | Local storage |

---

## Tổng quan Phiên bản

| Thành phần | Công nghệ | Phiên bản (Khuyến nghị) |
|------------|-----------|-------------------------|
| Backend Framework | Express.js | 4.x+ |
| Language | JavaScript | ES2022+ |
| Database | MongoDB | 6.x+ |
| Core Banking | Apache Fineract | 1.8.x |
| Blockchain | Hyperledger Fabric | 2.5.x |
| Mobile App | React Native (Expo) | SDK 49+ |
| Identity | Keycloak | 21.x+ |
