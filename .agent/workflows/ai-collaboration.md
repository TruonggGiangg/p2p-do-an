---
description: Hướng dẫn phối hợp giữa Antigravity (IDE) và Ollama (Local AI)
---

# Quy trình Phối hợp AI (Antigravity + Ollama)

Dự án này sử dụng mô hình "Hybrid AI" để tối ưu hóa bảo mật và tốc độ.

## 1. Antigravity (IDE chính / Brain)
- **Vai trò**: Phân tích toàn bộ codebase, hiểu cấu trúc sâu, refactor file lớn.
- **Khi nào dùng**: 
    - Khi cần hiểu mối quan hệ giữa các file (ví dụ: "Controller này gọi Service nào?").
    - Khi cần thực hiện các thay đổi phức tạp trên nhiều file.

## 2. Ollama + DeepSeek (Local AI / Muscle)
- **Vai trò**: Sinh code nhanh, review code nhỏ, giải thích thuật toán offline.
- **Khi nào dùng**:
    - **Review nhanh**: Dùng `.\ai_scripts\ai-review.ps1` trước khi commit để bắt lỗi nhanh.
    - **Sinh code snippet**: Dùng `.\ai_scripts\ai-gen.ps1 "prompt"` để viết các hàm logic đơn giản (hàm tính toán, DTO, Mapper).

## 3. Cách làm việc chuẩn
1. **Bước 1**: Nhờ **Antigravity** thiết kế cấu trúc hoặc giải thích logic phức tạp.
2. **Bước 2**: Dùng **Ollama** (với script) để viết chi tiết bên trong các hàm.
3. **Bước 3**: Dán code vào, dùng **Antigravity** để kiểm tra tính tương thích và chạy test.

> [!NOTE]
> Luôn ưu tiên dùng AI Local cho các dữ liệu nhạy cảm hoặc logic kinh doanh đặc thù của P2P.
