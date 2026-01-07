---
sidebar_position: 1
title: "ADR-001: Lựa chọn Tech Stack"
---

# ADR-001: Lựa chọn Tech Stack

**Ngày**: 2024-12-01  
**Trạng thái**: Accepted  
**Người quyết định**: Tech Lead

---

## Context

Chúng tôi cần xây dựng một nền tảng P2P Lending với các yêu cầu:
- Xử lý giao dịch tài chính chính xác
- Bảo mật cao (authentication, authorization)
- Minh bạch và kiểm toán được (audit trail)
- Cross-platform mobile app

---

## Decision

### Backend: Node.js + Express.js

**Lựa chọn**: Express.js thay vì NestJS

**Lý do**:
- Team đã có kinh nghiệm với Express.js
- Đơn giản, nhanh để bootstrap
- Đủ tính năng cho MVP

**Trade-off**: Thiếu TypeScript strict mode, cần discipline về coding standards.

---

### Core Banking: Apache Fineract

**Lựa chọn**: Fineract thay vì tự xây dựng logic tài chính

**Lý do**:
- Chuẩn mực quốc tế về core banking
- Đã có sẵn tính toán lãi suất phức tạp (declining balance, compound interest)
- Tránh sai sót floating-point trong tính toán tiền
- Có sẵn accounting/ledger

**Trade-off**: Phức tạp hơn để integrate, cần học API.

---

### Authentication: Keycloak

**Lựa chọn**: Keycloak thay vì tự viết auth module

**Lý do**:
- OAuth2/OIDC chuẩn
- SSO built-in
- Token management (refresh, revoke)
- Role-based access control

**Trade-off**: Thêm dependency, cần maintain Keycloak server.

---

### Blockchain: Hyperledger Fabric

**Lựa chọn**: Hyperledger Fabric thay vì Ethereum/Public chain

**Lý do**:
- Permissioned network (kiểm soát được nodes)
- Privacy (dữ liệu tài chính không public)
- Faster finality (không cần đợi confirmation)
- Enterprise-grade

**Trade-off**: Setup phức tạp hơn public chain.

---

### Mobile: React Native + Expo

**Lựa chọn**: React Native thay vì Flutter/Native

**Lý do**:
- Team có kinh nghiệm JavaScript/React
- Expo giúp development nhanh hơn
- Đủ performance cho app fintech

**Trade-off**: Performance không bằng Native, một số tính năng cần eject.

---

## Consequences

### Positive
- Development speed cao với stack quen thuộc
- Fineract đảm bảo tính chính xác của giao dịch tài chính
- Keycloak giảm rủi ro bảo mật auth
- Hyperledger đảm bảo immutability cho audit

### Negative
- Nhiều components cần orchestrate
- Cần DevOps skill để maintain Keycloak, Fineract, Fabric
- Learning curve cho team members mới

---

## References

- [Apache Fineract Documentation](https://fineract.apache.org/)
- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Hyperledger Fabric Documentation](https://hyperledger-fabric.readthedocs.io/)
