---
sidebar_position: 2
title: Công nghệ Sử dụng
description: Chi tiết về các công nghệ lõi vận hành nền tảng P2P
---

# 🛠️ Công nghệ Sử dụng (Tech Stack)

Hệ thống P2P không chỉ là một ứng dụng web/mobile đơn thuần. Nó được thiết kế mô phỏng một **Hệ thống Fintech Thực tế**, ưu tiên **Bảo mật**, **Tính Chính xác** và **Khả năng Kiểm toán**.

## Tổng quan Kiến trúc

Hệ thống tuân theo kiến trúc **Microservices-inspired**, tách biệt rõ ràng giữa Ứng dụng người dùng, Bộ xử lý nghiệp vụ, Sổ cái ngân hàng và Lớp kiểm toán.

## 1. Backend & Business Logic: NestJS

Xương sống của hệ thống được xây dựng bằng **NestJS** - framework Node.js tiến bộ nhất hiện nay.

*   **Ngôn ngữ**: TypeScript (Kiểm soát lỗi chặt chẽ).
*   **Kiến trúc**: Modular (Module Vay, Module Đầu tư, Module Auth tách biệt).
*   **Giao thức**: REST API cho Client và gRPC/TCP cho giao tiếp nội bộ (nếu cần mở rộng).

## 2. Core Banking: Apache Fineract

Thay vì dùng Database thông thường để cộng trừ tiền (dễ sai sót), chúng tôi sử dụng **Apache Fineract** - giải pháp Core Banking chuẩn mực thế giới.

*   **Vai trò**: Quản lý Sổ cái (Ledger), Tài khoản vay và Tài khoản tiết kiệm.
*   **Tính năng đặc biệt**: Tự động tính lãi suất phức tạp (Lãi giảm dần, Lãi phạt, Lãi cộng dồn hàng ngày).
*   **Độ tin cậy**: Loại bỏ sai số làm tròn (floating-point errors) thường gặp khi tự code logic tài chính.

## 3. Trust Layer: Hyperledger Fabric

Chúng tôi sử dụng **Hyperledger Fabric** (Blockchain Doanh nghiệp) để tạo ra bằng chứng không thể chối bỏ.

*   **Tại sao không dùng Ethereum?**: Dữ liệu tài chính cần sự riêng tư (Privacy) và định danh rõ ràng (Permissioned), không phù hợp với Public Chain.
*   **Vai trò**: Lưu trữ "Hash" của mọi Hợp đồng vay và Giao dịch giải ngân.
*   **Lợi ích**: Ngăn chặn Admin hoặc Hacker sửa đổi dữ liệu trong Database để gian lận.

## 4. Mobile Client: React Native (Expo)

Trải nghiệm người dùng được tối ưu hóa trên ứng dụng di động đa nền tảng.

*   **Framework**: Expo (React Native).
*   **Giao diện**: **Glassmorphism UI** - Thiết kế hiện đại, sang trọng, khác biệt với các app tài chính khô cứng.
*   **Tính năng**: Thông báo thời gian thực (Real-time) khi khoản vay được khớp lệnh.

## 5. Security: Keycloak

Chúng tôi không tự viết module Đăng nhập (tránh lỗ hổng bảo mật). Hệ thống sử dụng **Keycloak** cho quản lý định danh (IAM).

*   **Chuẩn bảo mật**: OAuth2 & OpenID Connect (OIDC).
*   **Tính năng**: Single Sign-On (SSO), Quản lý phiên đăng nhập, Phân quyền RBAC (Role-Based Access Control) cho Admin/User.

---

| Thành phần | Công nghệ | Phiên bản (Khuyến nghị) |
| :--- | :--- | :--- |
| **Backend Framework** | NestJS | 9.x+ |
| **Language** | TypeScript | 4.x+ |
| **Database** | PostgreSQL / MongoDB | Latest |
| **Core Banking** | Apache Fineract | 1.8.x |
| **Blockchain** | Hyperledger Fabric | 2.5.x |
| **Mobile App** | React Native (Expo) | SDK 49+ |
| **Identity** | Keycloak | 21.x+ |
