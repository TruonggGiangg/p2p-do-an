---
description: Coding conventions cho dự án P2P - áp dụng khi viết code mới
---

# P2P Project - Coding Standards & Best Practices

> Áp dụng khi viết hoặc review code cho dự án P2P (React Native + NestJS)

---

## 📁 File Naming Conventions

### Server (NestJS)
| Type | Pattern | Example |
|------|---------|---------|
| Controller | `<name>.controller.ts` | `auth.controller.ts` |
| Service | `<name>.service.ts` | `keycloak.service.ts` |
| Module | `<name>.module.ts` | `auth.module.ts` |
| DTO | `<name>.dto.ts` | `auth.dto.ts` |
| Guard | `<name>.guard.ts` | `dual-auth.guard.ts` |
| Filter | `<name>.filter.ts` | `http-exception.filter.ts` |
| Decorator | `<name>.decorator.ts` | `user.decorator.ts` |
| Interface | `<name>.interface.ts` | `jwt-payload.interface.ts` |
| Constants | `<name>.constants.ts` | `auth.constants.ts` |

### Client (React Native/Expo)
| Type | Pattern | Example |
|------|---------|---------|
| Screen | `<Name>Screen.tsx` | `LoginScreen.tsx` |
| Component | `<Name>.tsx` | `Button.tsx`, `Header.tsx` |
| Context | `<Name>Context.tsx` | `AuthContext.tsx` |
| Hook | `use<Name>.ts` | `useAuth.ts`, `useStorage.ts` |
| API Service | `<name>.api.ts` | `keycloak.api.ts` |
| Storage | `<name>.service.ts` | `storage.service.ts` |
| Types | `<name>.types.ts` | `auth.types.ts` |
| Config | `<name>.config.ts` | `api.config.ts` |

---

## 📝 Naming Conventions

### Variables
```typescript
// ✅ GOOD
const accessToken = 'xxx';      // camelCase
const isLoading = true;         // boolean với is/has/can prefix
const userList = [];            // array với plural
const userData = {};            // object với descriptive name

// ❌ BAD
const at = 'xxx';               // viết tắt
const loading = true;           // thiếu is prefix
const user = [];                // array không plural
```

### Constants
```typescript
// ✅ GOOD
const STORAGE_KEYS = {
    ACCESS_TOKEN: 'access_token',
    REFRESH_TOKEN: 'refresh_token',
};
const API_TIMEOUT = 30000;
const MAX_RETRY_COUNT = 3;

// ❌ BAD
const storageKeys = {};         // phải SCREAMING_SNAKE_CASE
const apiTimeout = 30000;       // constant phải viết hoa
```

### Functions
```typescript
// ✅ GOOD - Verb + Noun
async function getUser(): Promise<User> {}
async function saveToken(token: string): Promise<void> {}
async function validatePassword(password: string): boolean {}
function handleSubmit(): void {}
function formatDateTime(date: Date): string {}

// ❌ BAD
function user() {}              // thiếu verb
function data() {}              // không rõ nghĩa
```

### Classes & Interfaces
```typescript
// ✅ GOOD
class AuthService {}            // PascalCase
class StorageService {}
interface User {}               // NO I prefix
interface LoginResponse {}
type UserRole = 'admin' | 'user';

// ❌ BAD
class authService {}            // phải PascalCase
interface IUser {}              // không dùng I prefix
```

---

## 📦 Import Order

```typescript
// 1️⃣ External packages (react, @nestjs, axios, etc.)
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import React from 'react';

// 2️⃣ Internal modules (absolute paths with @ alias)
import { AuthService } from '@auth/auth.service';
import { User } from '@decorator/customize';

// 3️⃣ Local files (relative paths)
import { User } from './user.types';
import { STORAGE_KEYS } from './constants';
```

---

## 🛡️ Error Handling

```typescript
// ✅ GOOD - Proper error handling
async function fetchUserData(): Promise<User> {
    try {
        const response = await httpClient.get('/auth/me');
        return response.data;
    } catch (error: any) {
        console.error('[UserService] fetchUserData failed:', error.message);
        throw error; // Re-throw for caller
    }
}

// ✅ GOOD - With specific error handling
async function login(username: string, password: string): Promise<void> {
    try {
        const response = await keycloakApi.login(username, password);
        return response;
    } catch (error: any) {
        if (error.response?.status === 401) {
            throw new Error('Sai tên đăng nhập hoặc mật khẩu');
        }
        throw error;
    }
}
```

---

## 📚 JSDoc Comments

```typescript
/**
 * Login to Keycloak and get JWT tokens
 * @param username - Phone number (Vietnamese format: 0xxxxxxxxx)
 * @param password - Password (min 12 chars, must contain uppercase, lowercase, number, special char)
 * @returns Promise<KeycloakTokenResponse> - Contains access_token and refresh_token
 * @throws UnauthorizedException - If credentials are invalid
 */
async function login(username: string, password: string): Promise<KeycloakTokenResponse> {
    // Implementation
}
```

---

## 🔐 Security Rules

1. **NEVER** log tokens or passwords
2. **ALWAYS** use SecureStore for sensitive data on mobile
3. **NEVER** hardcode credentials - use environment variables
4. **ALWAYS** validate input with DTO + class-validator
5. **ALWAYS** sanitize user input before database operations

---

## 📊 TypeScript Rules

```typescript
// ✅ GOOD
function getUser(id: string): Promise<User | null> {}    // Explicit types
const config: ApiConfig = { timeout: 30000 };            // Type annotation
interface Props { children: ReactNode }                   // Interface for props

// ❌ BAD
function getUser(id): Promise<any> {}                    // Missing types
const config = { timeout: 30000 };                       // Implicit any
```

---

## 🧪 Logging Format

```typescript
// Format: [Module] Action: details
console.log('[AuthContext] Login successful');
console.error('[KeycloakApi] Token refresh failed:', error.message);
console.warn('[Storage] Fallback to AsyncStorage on web');
```

---

## ✅ Checklist Before Commit

- [ ] Code follows naming conventions
- [ ] No `any` types (unless absolutely necessary)
- [ ] All async operations have error handling
- [ ] No console.log in production code (use proper logging)
- [ ] No hardcoded values - use constants or env
- [ ] JSDoc comments for public functions
- [ ] Imports are ordered correctly
