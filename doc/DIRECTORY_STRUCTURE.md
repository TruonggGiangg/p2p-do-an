# Cấu trúc Thư mục

## Tổng quan Project

```
p2p-do-an/
├── client_app/          # React Native (Expo) application
├── server_do_an/        # NestJS backend server
├── blockchain/          # Blockchain components (if any)
├── new_server/          # Additional server (if any)
├── doc/                 # Documentation
└── README.md
```

---

## 📱 Client App (React Native)

```
client_app/
├── src/
│   ├── contexts/                    # React Context providers
│   │   └── AuthContext.tsx          # Authentication state management
│   │
│   ├── screens/                     # Screen components
│   │   ├── LoginScreen.tsx          # Login UI
│   │   ├── RegisterScreen.tsx       # Registration UI
│   │   ├── ProfileScreen.tsx        # User profile
│   │   └── TokenTestScreen.tsx      # Token testing/debugging
│   │
│   ├── services/                    # Business logic & API calls
│   │   ├── auth/                    # Authentication services
│   │   │   ├── auth.api.ts          # NestJS auth API calls
│   │   │   └── keycloak.api.ts      # Keycloak direct API calls
│   │   │
│   │   ├── config/                  # Configuration
│   │   │   └── api.config.ts        # Centralized API config
│   │   │
│   │   ├── http/                    # HTTP client
│   │   │   └── httpClient.ts        # Axios instance with interceptors
│   │   │
│   │   ├── storage/                 # Local storage
│   │   │   └── storage.service.ts   # AsyncStorage wrapper
│   │   │
│   │   └── index.ts                 # Services barrel export
│   │
│   └── types/                       # TypeScript type definitions
│       ├── auth.types.ts            # Auth-related types
│       ├── user.types.ts            # User-related types
│       ├── api.types.ts             # API response types
│       └── index.ts                 # Types barrel export
│
├── assets/                          # Static assets (images, fonts)
├── App.tsx                          # Root component
├── index.ts                         # Entry point
├── app.json                         # Expo configuration
├── tsconfig.json                    # TypeScript config
├── package.json                     # Dependencies
├── .env                             # Environment variables (gitignored)
└── .env.example                     # Environment template
```

### Client Code Organization

| Folder | Mục đích | Ví dụ |
|--------|----------|-------|
| `contexts/` | Global state management với React Context | `AuthContext` - user, login, logout |
| `screens/` | UI Components cho mỗi màn hình | `LoginScreen`, `ProfileScreen` |
| `services/` | Business logic, API calls, utilities | `keycloakApi`, `httpClient` |
| `types/` | TypeScript interfaces và types | `User`, `KeycloakTokenResponse` |

---

## 🖥️ Server (NestJS)

```
server_do_an/
├── src/
│   ├── auth/                        # Authentication module
│   │   ├── auth.controller.ts       # Auth endpoints
│   │   ├── auth.service.ts          # Auth business logic
│   │   ├── auth.module.ts           # Module definition
│   │   │
│   │   ├── guard/                   # Authentication guards
│   │   │   └── dual-auth.guard.ts   # Keycloak RS256 token validator
│   │   │
│   │   └── keycloak/                # Keycloak integration
│   │       └── keycloak.service.ts  # Keycloak Admin API client
│   │
│   ├── config/                      # Configuration
│   │   └── keycloak.config.ts       # Keycloak config
│   │
│   ├── decorator/                   # Custom decorators
│   │   └── customize.ts             # @User(), @Public() decorators
│   │
│   ├── utils/                       # Utility functions
│   │   └── ...
│   │
│   ├── app.module.ts                # Root module
│   ├── app.controller.ts            # Root controller
│   ├── app.service.ts               # Root service
│   └── main.ts                      # Application entry point
│
├── test/                            # E2E tests
├── dist/                            # Compiled output
├── node_modules/                    # Dependencies
├── nest-cli.json                    # NestJS CLI config
├── tsconfig.json                    # TypeScript config
├── package.json                     # Dependencies
├── .env                             # Environment variables (gitignored)
└── .env.example                     # Environment template
```

### Server Module Structure

| Module | Mục đích | Files |
|--------|----------|-------|
| `auth/` | Authentication & Authorization | controller, service, guards |
| `config/` | Centralized configuration | keycloak.config.ts |
| `decorator/` | Custom decorators | @User, @Public |
| `utils/` | Helper functions | validators, formatters |

---

## 📁 File Naming Conventions

### NestJS (Server)

```
<feature>.controller.ts     # HTTP endpoints
<feature>.service.ts        # Business logic
<feature>.module.ts         # Module definition
<feature>.guard.ts          # Request guards
<feature>.dto.ts            # Data Transfer Objects
<feature>.entity.ts         # Database entities
```

### React Native (Client)

```
<Name>Screen.tsx            # Screen components (PascalCase)
<name>.api.ts               # API services (camelCase)
<name>.service.ts           # Other services (camelCase)
<name>.types.ts             # Type definitions (camelCase)
<Name>Context.tsx           # React contexts (PascalCase)
```

---

## 🔧 Thêm Module mới

### Server (NestJS)

```bash
# Sử dụng NestJS CLI
nest g module <module-name>
nest g controller <module-name>
nest g service <module-name>

# Cấu trúc tạo ra:
src/
└── <module-name>/
    ├── <module-name>.controller.ts
    ├── <module-name>.service.ts
    └── <module-name>.module.ts
```

### Client (React Native)

```
# Tạo thủ công theo cấu trúc:
src/
├── screens/
│   └── <Name>Screen.tsx
├── services/
│   └── <name>/
│       └── <name>.api.ts
└── types/
    └── <name>.types.ts
```
