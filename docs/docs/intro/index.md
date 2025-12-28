---
slug: /intro
sidebar_position: 1
title: Giới thiệu
---

# P2P Lending Platform

Chào mừng đến với trang tài liệu kỹ thuật của **Hệ thống Cho vay Ngang hàng (P2P Lending Platform)**. Tài liệu này cung cấp toàn bộ thông tin cần thiết để hiểu, tích hợp và vận hành hệ thống.

## P2P Lending là gì?

Nền tảng của chúng tôi kết nối trực tiếp **Nhà đầu tư** (Lenders) với **Người vay** (Borrowers), loại bỏ các trung gian ngân hàng truyền thống để tối ưu hóa lợi nhuận. Hệ thống kết hợp sức mạnh của **Blockchain** (minh bạch) và **Core Banking** (chính xác).

:::tip Giá Trị Cốt Lõi
*   **Minh Bạch Tuyệt Đối**: Mọi hợp đồng vay đều được ghi nhận (audit) trên Blockchain Hyperledger Fabric.
*   **Tự Động Hóa**: Cơ chế khớp lệnh (Matching Engine) và giải ngân tự động.
*   **An Toàn Vốn**: Mô hình Escrow đảm bảo dòng tiền được kiểm soát chặt chẽ cho đến khi khoản vay thành công.
:::

## Cấu trúc Tài liệu

Tài liệu được chia thành các phần chính để bạn dễ dàng tra cứu:

<div className="row">
  <div className="col col--6">
    <div className="card">
      <div className="card__header">
        <h3>🏗️ Kiến trúc Hệ thống</h3>
      </div>
      <div className="card__body">
        <p>
          Hiểu sâu về các thành phần kỹ thuật: <strong>Microservices</strong>, <strong>Keycloak</strong>, <strong>Blockchain</strong> và <strong>NestJS</strong>.
        </p>
      </div>
      <div className="card__footer">
        <a href="/docs/architecture/overview" className="button button--primary button--block">Xem Kiến Trúc</a>
      </div>
    </div>
  </div>

  <div className="col col--6">
    <div className="card">
      <div className="card__header">
        <h3>💡 Nghiệp vụ Cốt lõi</h3>
      </div>
      <div className="card__body">
        <p>
          Nắm vững logic vận hành: <strong>Cơ chế Khớp lệnh</strong>, <strong>Vòng đời khoản vay</strong> và vai trò của <strong>Fineract</strong>.
        </p>
      </div>
      <div className="card__footer">
        <a href="/docs/concepts/business-flow" className="button button--secondary button--block">Tìm hiểu Nghiệp vụ</a>
      </div>
    </div>
  </div>
</div>

<br/>

## Bắt đầu từ đâu?

Nếu bạn là **Developer** mới tham gia dự án:
1.  Xem **[Công nghệ sử dụng](/docs/intro/tech-stack)** để cài đặt môi trường.
2.  Đọc **[Tổng quan Kiến trúc](/docs/architecture/overview)** để hình dung bức tranh toàn cảnh.

Nếu bạn là **Product Owner / Business Analyst**:
- Đọc **[Luồng Nghiệp vụ](/docs/concepts/business-flow)** để hiểu quy trình vay, trả và cơ chế khớp lệnh của sàn.
