# Workflow & Design Patterns

## Tổng quan

Dự án P2P sử dụng kiến trúc Client-Server với:
- **Server**: NestJS + Keycloak (Authentication)
- **Client**: React Native (Expo)

## 📝 Quy trình Development

### 1. Tạo Feature mới

```
1. Tạo branch từ main: git checkout -b feature/ten-feature
2. Implement theo các patterns đã định nghĩa
3. Test locally
4. Commit với conventional commits: feat(auth): add login feature
5. Push và tạo Pull Request
```

### 2. Commit Message Format

```
<type>(<scope>): <description>

Types:
- feat: Tính năng mới
- fix: Sửa bug
- docs: Tài liệu
- style: Formatting, không thay đổi logic
- refactor: Refactor code
- test: Thêm tests
- chore: Maintenance tasks

Ví dụ:
- feat(auth): add Keycloak login integration
- fix(client): resolve token refresh issue
- docs(readme): update API documentation
```

### 3. Code Review Checklist

- [ ] Code theo design patterns đã định nghĩa
- [ ] TypeScript types đầy đủ, không dùng `any` nếu có thể tránh
- [ ] Error handling cho tất cả async operations
- [ ] Logging đúng format `[Module] Action: details`
- [ ] No hardcoded values, dùng config/env

---

## � Coding Conventions

### Quy tắc đặt tên File

| Loại file | Convention | Ví dụ |
|-----------|------------|-------|
| **Controller** | `<name>.controller.ts` | `auth.controller.ts` |
| **Service** | `<name>.service.ts` | `keycloak.service.ts` |
| **Module** | `<name>.module.ts` | `auth.module.ts` |
| **DTO** | `<name>.dto.ts` | `auth.dto.ts` |
| **Guard** | `<name>.guard.ts` | `dual-auth.guard.ts` |
| **Screen (RN)** | `<Name>Screen.tsx` | `LoginScreen.tsx` |
| **Context** | `<Name>Context.tsx` | `AuthContext.tsx` |
| **API Service** | `<name>.api.ts` | `keycloak.api.ts` |
| **Types** | `<name>.types.ts` | `auth.types.ts` |

---

### Quy tắc đặt tên Biến và Hàm

| Loại | Convention | Ví dụ |
|------|------------|-------|
| **Biến thường** | `camelCase` | `userName`, `accessToken` |
| **Hằng số** | `SCREAMING_SNAKE_CASE` | `STORAGE_KEYS`, `API_BASE_URL` |
| **Hàm** | `camelCase` + động từ | `getUser()`, `saveToken()`, `validatePassword()` |
| **Boolean** | `is/has/can` prefix | `isLoading`, `hasError`, `canSubmit` |
| **Array** | số nhiều | `users`, `tokens`, `roles` |
| **Private** | `_` prefix (optional) | `_privateMethod()` |

```typescript
// ✅ Đúng
const accessToken = await getAccessToken();
const isLoggedIn = user !== null;
const STORAGE_KEYS = { ACCESS_TOKEN: 'access_token' };

// ❌ Sai
const at = await getAT();          // Viết tắt khó hiểu
const logged = user !== null;      // Thiếu prefix is/has
const storagekeys = {};            // Không phải SCREAMING_SNAKE_CASE
```

---

### Quy tắc đặt tên Class và Interface

| Loại | Convention | Ví dụ |
|------|------------|-------|
| **Class** | `PascalCase` | `AuthService`, `StorageService` |
| **Interface** | `PascalCase` (không có I prefix) | `User`, `LoginResponse` |
| **Type** | `PascalCase` | `UserRole`, `TokenType` |
| **Enum** | `PascalCase` + values `SCREAMING_SNAKE_CASE` | `enum Status { ACTIVE, INACTIVE }` |

```typescript
// ✅ Đúng
interface User {
    _id: string;
    username: string;
}

class AuthService {
    async login(username: string, password: string): Promise<User> {}
}

enum UserStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive'
}

// ❌ Sai
interface IUser {}           // Không dùng I prefix
class authService {}         // Phải PascalCase
enum userStatus {}           // Phải PascalCase
```

---

### Quy tắc viết Hàm

```typescript
/**
 * ✅ Hàm có JSDoc comment
 * @param username - Tên đăng nhập (số điện thoại)
 * @param password - Mật khẩu
 * @returns Promise<User> - Thông tin user sau khi login
 */
async function login(username: string, password: string): Promise<User> {
    // 1. Validate input
    if (!username || !password) {
        throw new Error('Username và password không được để trống');
    }
    
    // 2. Call API
    const response = await keycloakApi.login(username, password);
    
    // 3. Return result
    return response.data;
}

// ✅ Hàm ngắn gọn, single responsibility
async function getAccessToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
}

// ❌ Sai - Hàm quá dài, làm nhiều việc
async function loginAndSaveAndNavigate(username, password) {
    // Không nên gộp nhiều logic vào 1 hàm
}
```

---

### Quy tắc Async/Await và Error Handling

```typescript
// ✅ Đúng - try/catch với error logging
async function fetchUserData(): Promise<User> {
    try {
        const response = await httpClient.get('/auth/me');
        return response.data;
    } catch (error: any) {
        console.error('[UserService] fetchUserData failed:', error.message);
        throw error; // Re-throw để caller xử lý
    }
}

// ❌ Sai - Không có error handling
async function fetchUserData(): Promise<User> {
    const response = await httpClient.get('/auth/me'); // Crash nếu lỗi!
    return response.data;
}
```

---

### Quy tắc Import

```typescript
// ✅ Đúng - Import theo thứ tự
// 1. External packages
import { Injectable } from '@nestjs/common';
import axios from 'axios';

// 2. Internal modules (absolute paths)
import { AuthService } from '@auth/auth.service';

// 3. Local files (relative paths)
import { User } from './user.types';
import { STORAGE_KEYS } from './constants';

// ❌ Sai - Import lộn xộn
import { User } from './user.types';
import { Injectable } from '@nestjs/common';
import { AuthService } from '@auth/auth.service';
```

---

### Quy tắc Comment

```typescript
// ✅ Comment giải thích TẠI SAO, không phải WHAT
// Lưu Keycloak token thay vì NestJS token vì server validate RS256
await storageService.saveTokens(keycloakToken, refreshToken);

// ✅ TODO với context
// TODO: Implement token refresh when expired (issue #123)

// ❌ Sai - Comment giải thích điều hiển nhiên
// Set the user
setUser(user);

// ❌ Sai - Comment cũ không xóa
// const oldToken = getOldToken(); // Không còn dùng
```

---

## �🚀 Environment Setup

### Server (.env)

```env
# Keycloak
KEYCLOAK_BASE_URL=http://118.69.41.95:9000
KEYCLOAK_REALM=fineract
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=admin

# JWT
JWT_SECRET=your-secret
JWT_EXPIRE=1d
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRE=7d

# CORS (comma-separated)
CORS_ORIGINS=http://localhost:8081,http://localhost:19006
```

### Client (.env)

```env
API_BASE_URL=http://10.10.2.230:8080
KEYCLOAK_BASE_URL=http://118.69.41.95:9000
KEYCLOAK_REALM=fineract
KEYCLOAK_CLIENT_ID=community-app
```
