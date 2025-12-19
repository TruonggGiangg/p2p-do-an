---
description: React Native architecture and coding standards
---

# React Native Development Workflow

## Project Structure
```
client_app/
├── .env.example           # Environment template
├── app.config.ts          # Expo config with env vars
└── src/
    ├── types/             # TypeScript definitions
    │   ├── index.ts       # Barrel export
    │   ├── user.types.ts
    │   ├── auth.types.ts
    │   └── api.types.ts
    ├── services/          # API & business logic
    │   ├── index.ts       # Barrel export  
    │   ├── config/api.config.ts
    │   ├── http/httpClient.ts
    │   ├── storage/storage.service.ts
    │   └── auth/
    │       ├── auth.api.ts
    │       └── keycloak.api.ts
    ├── contexts/          # React Context providers
    │   └── AuthContext.tsx
    └── screens/           # UI screens
```

## Coding Rules

### 1. Types
- Define all types in `src/types/`
- Use barrel exports (`index.ts`)
- Prefix interface names clearly: `User`, `LoginResponse`, `KeycloakToken`

### 2. Services
- One service per concern (auth, keycloak, storage)
- Use class-based services with singleton export
- Document with JSDoc comments

### 3. API Layer
- Config in `api.config.ts` - read from env vars
- HTTP client in `httpClient.ts` with interceptors
- Separated API services: `auth.api.ts`, `keycloak.api.ts`

### 4. State Management
- Use React Context for auth state
- Keep screens stateless when possible

### 5. Environment
- Never commit `.env` to git
- Use `.env.example` as template
- Read via `expo-constants`

## Running the App

// turbo-all
1. Copy `.env.example` to `.env` and configure
2. `npm install`
3. `npx expo start --web` for web
4. `npx expo start` for mobile
