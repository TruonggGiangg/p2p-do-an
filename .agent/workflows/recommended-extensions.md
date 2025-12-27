---
description: Danh sách các công cụ (Extensions) VS Code khuyên dùng cho dự án P2P
---

# RECOMMENDED_EXTENSIONS.md - Các Công Cụ "Phải Có"

> **Mục tiêu**: Tăng tốc độ code và giảm thiểu lỗi cú pháp cho dự án P2P Lending.

## 1. NestJS (Backend)
*   **[NestJS File Generator](https://marketplace.visualstudio.com/items?itemName=imgildev.vscode-nestjs-generator)**:
    *   *Tác dụng*: Chuột phải vào folder -> Tạo Service/Controller/Module tự động.
    *   *Lợi ích*: Không cần nhớ lệnh CLI, tránh gõ sai tên file.
*   **[NestJS Snippets](https://marketplace.visualstudio.com/items?itemName=Trilon.nestjs-snippets)**:
    *   *Tác dụng*: Gõ `n-service` -> Ra khuôn mẫu Service chuẩn.

## 2. React Native (Frontend)
*   **[ES7+ React/Redux/React-Native snippets](https://marketplace.visualstudio.com/items?itemName=dsznajder.es7-react-js-snippets)**:
    *   *Tác dụng*: Extension "quốc dân". Gõ `rnfes` -> Ra component chuẩn.
*   **[Expo Tools](https://marketplace.visualstudio.com/items?itemName=expo.vscode-expo-tools)**:
    *   *Tác dụng*: Hỗ trợ debug, autocomplete cho config `app.json`.

## 3. General (Chung)
*   **[GitLens](https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens)**:
    *   *Tác dụng*: Hiển thị người sửa code cuối cùng trên từng dòng.
*   **[Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)**:
    *   *Tác dụng*: Tự động format code khi Save. (Bắt buộc để theo `coding-conventions.md`).
*   **[ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)**:
    *   *Tác dụng*: Bắt lỗi logic và cú pháp ngay khi gõ.

## 4. Cách cài đặt nhanh
Copy danh sách ID dưới đây và chạy lệnh trong Terminal:

```bash
code --install-extension imgildev.vscode-nestjs-generator
code --install-extension Trilon.nestjs-snippets
code --install-extension dsznajder.es7-react-js-snippets
code --install-extension expo.vscode-expo-tools
code --install-extension eamodio.gitlens
code --install-extension esbenp.prettier-vscode
code --install-extension dbaeumer.vscode-eslint
```
