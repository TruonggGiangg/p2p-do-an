---
sidebar_position: 2
title: Onboarding - Ngày đầu tiên
---

# 🚀 Onboarding Checklist

Chào mừng bạn đến với team P2P Lending! Tài liệu này giúp bạn hoàn thành setup trong ngày đầu tiên.

---

## ✅ Ngày 1: Setup Cơ bản

### 1. Truy cập Repository
- [ ] Clone repository: `git clone <repo-url>`
- [ ] Được thêm vào GitHub organization
- [ ] Checkout branch `develop`

### 2. Cài đặt Môi trường
- [ ] Đọc và làm theo **[Environment Setup](./environment-setup)**
- [ ] Cài đặt Node.js 18+
- [ ] Cài đặt Docker Desktop
- [ ] Cài đặt MongoDB Compass (optional)
- [ ] Cài đặt VS Code + Extensions

### 3. Chạy Dự án Lần Đầu
- [ ] Copy file `.env.example` → `.env`
- [ ] Chạy `npm install` trong folder `server/`
- [ ] Chạy `npm install` trong folder `client/`
- [ ] Start MongoDB container: `docker-compose up -d mongodb`
- [ ] Chạy server: `npm start` (trong folder `server/`)
- [ ] Chạy mobile app: `npx expo start` (trong folder `client/`)

---

## ✅ Ngày 2-3: Hiểu Hệ thống

### 1. Đọc Tài liệu Kiến trúc
- [ ] **[High-Level Design](../architecture/high-level-design)** - Hiểu tổng quan hệ thống
- [ ] **[Data Flow](../architecture/data-flow)** - Hiểu các luồng nghiệp vụ
- [ ] **[Technology Radar](../architecture/technology-radar)** - Công nghệ sử dụng

### 2. Tìm hiểu Codebase
- [ ] Xem cấu trúc folder `server/` (Backend)
- [ ] Xem cấu trúc folder `client/` (Mobile App)
- [ ] Chạy thử một API endpoint với Postman

### 3. Hệ thống Tích hợp
- [ ] Hiểu role của **Apache Fineract** (Core Banking)
- [ ] Hiểu role của **Keycloak** (Authentication)
- [ ] Hiểu role của **Hyperledger Fabric** (Blockchain)

---

## ✅ Tuần 1: First Contribution

### 1. Làm quen Quy trình
- [ ] Đọc Git Workflow (tương lai)
- [ ] Tạo branch feature đầu tiên
- [ ] Submit Pull Request đầu tiên

### 2. Task Khởi động
- [ ] Được assign task đơn giản (fix bug / UI tweak)
- [ ] Hoàn thành và merge thành công

---

## 📞 Liên hệ Hỗ trợ

| Vấn đề | Liên hệ |
|--------|---------|
| Không clone được repo | Team Lead |
| Lỗi khi chạy server | Senior Developer |
| Không hiểu nghiệp vụ | Product Owner |
| Vấn đề với Fineract/Keycloak | DevOps |

---

## 📚 Tài liệu Bổ sung

- [Express.js Documentation](https://expressjs.com/)
- [React Native Documentation](https://reactnative.dev/)
- [Apache Fineract API](https://fineract.apache.org/)
- [Keycloak Documentation](https://www.keycloak.org/documentation)
