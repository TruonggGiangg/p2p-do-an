# Design Patterns - P2P Lending System

## Tổng quan

Dự án P2P Lending System sử dụng nhiều design patterns và architectural patterns để đảm bảo code maintainable, scalable và testable.

---

## 🏗️ CLIENT (React Native/Expo)

### 1. **Clean Architecture / Layered Architecture**

**Mô tả**: Cấu trúc code được tổ chức theo các tầng (layers) rõ ràng, tách biệt concerns.

**Cấu trúc**:
```
src/
├── core/              # Infrastructure Layer
│   ├── api/          # API client, interceptors
│   ├── storage/      # Storage abstraction
│   └── events/       # Event emitters
├── features/          # Business Domain Layer
│   ├── auth/
│   ├── wallet/
│   ├── bnpl/
│   ├── home/
│   └── profile/
├── shared/            # Shared Utilities
│   ├── hooks/        # Custom React hooks
│   └── utils/        # Utility functions
└── navigation/        # Navigation Layer
```

**Lợi ích**:
- Tách biệt business logic khỏi infrastructure
- Dễ dàng test và maintain
- Có thể thay đổi implementation mà không ảnh hưởng business logic

---

### 2. **Context API Pattern (Provider Pattern)**

**Mô tả**: Sử dụng React Context để quản lý global state.

**Implementation**:
- `AuthContext`: Quản lý authentication state
- `ThemeContext`: Quản lý theme (light/dark mode)

**Ví dụ**:
```typescript
// AuthContext.tsx
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    // ... logic
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Usage
const { user, login, logout } = useAuth();
```

**Lợi ích**:
- Tránh prop drilling
- Centralized state management
- Dễ dàng share state across components

---

### 3. **Repository Pattern / API Service Pattern**

**Mô tả**: Tách biệt API calls vào các service classes riêng biệt.

**Implementation**:
- `auth.api.ts`: Authentication API calls
- `wallet.api.ts`: Wallet operations
- `bnpl.api.ts`: BNPL operations

**Ví dụ**:
```typescript
// wallet.api.ts
export const walletAPI = {
    getWallets: async (): Promise<Wallet[]> => {
        const response = await api.get('/wallets');
        return response.data.data;
    },
    transfer: async (data: TransferRequest): Promise<TransferResponse> => {
        const response = await api.post('/wallets/transfer', data);
        return response.data.data;
    },
};
```

**Lợi ích**:
- Tách biệt API logic khỏi components
- Dễ dàng mock cho testing
- Centralized error handling

---

### 4. **Adapter Pattern**

**Mô tả**: Tạo abstraction layer cho platform-specific implementations.

**Implementation**:
- `storage.service.ts`: Platform-agnostic storage (SecureStore cho native, AsyncStorage cho web)

**Ví dụ**:
```typescript
// storage.service.ts
const isWeb = Platform.OS === 'web';

export const storage = {
    async setItem(key: string, value: string): Promise<void> {
        if (isWeb) {
            await AsyncStorage.setItem(key, value);
        } else {
            await SecureStore.setItemAsync(key, value);
        }
    },
    // ...
};
```

**Lợi ích**:
- Code hoạt động trên cả native và web
- Dễ dàng thêm platform mới
- Consistent API across platforms

---

### 5. **Observer Pattern (Event Emitter)**

**Mô tả**: Sử dụng EventEmitter để notify các components về auth events.

**Implementation**:
- `auth.events.ts`: Event emitter cho authentication events

**Ví dụ**:
```typescript
// auth.events.ts
export const authEvents = new AuthEventEmitter();

// Usage
authEvents.onSessionExpired(() => {
    // Handle session expired
});

authEvents.emitSessionExpired();
```

**Lợi ích**:
- Loose coupling giữa components
- Dễ dàng notify multiple listeners
- Decoupled event handling

---

### 6. **Custom Hooks Pattern**

**Mô tả**: Tạo reusable custom hooks để encapsulate logic.

**Implementation**:
- `useAsync`: Quản lý async operations với loading/error states
- `useDebounce`: Debounce callbacks và values
- `useRefresh`: Pull-to-refresh functionality

**Ví dụ**:
```typescript
// useAsync.ts
export function useAsync<T>(asyncFn: () => Promise<T>) {
    const [state, setState] = useState<AsyncState<T>>({
        data: null,
        loading: false,
        error: null,
    });
    // ... logic
    return { ...state, execute, reset };
}
```

**Lợi ích**:
- Reusable logic
- Clean component code
- Easy to test

---

### 7. **Interceptor Pattern**

**Mô tả**: Sử dụng Axios interceptors để handle requests/responses globally.

**Implementation**:
- Request interceptor: Thêm access token vào headers
- Response interceptor: Handle token refresh, error handling

**Ví dụ**:
```typescript
// api.client.ts
api.interceptors.request.use((config) => {
    const token = await authStorage.getAccessToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.status === 401) {
            // Handle token refresh
        }
        return Promise.reject(error);
    }
);
```

**Lợi ích**:
- Centralized request/response handling
- Automatic token management
- Consistent error handling

---

### 8. **Factory Pattern**

**Mô tả**: Tạo objects dựa trên configuration.

**Implementation**:
- Theme factory: Tạo theme objects dựa trên mode (light/dark)
- API client factory: Tạo Axios instance với config

---

### 9. **Singleton Pattern**

**Mô tả**: Đảm bảo chỉ có một instance của một class.

**Implementation**:
- `api.client.ts`: Single Axios instance
- `auth.events.ts`: Single EventEmitter instance

---

## 🖥️ SERVER (NestJS)

### 1. **Module Pattern (NestJS Modules)**

**Mô tả**: NestJS sử dụng module system để organize code.

**Implementation**:
- `AuthModule`: Authentication logic
- `WalletsModule`: Wallet operations
- `BnplModule`: BNPL operations
- `FineractModule`: Fineract integration

**Ví dụ**:
```typescript
@Module({
    imports: [MongooseModule, ConfigModule],
    controllers: [WalletsController],
    providers: [WalletsService, FineractService],
    exports: [WalletsService],
})
export class WalletsModule {}
```

**Lợi ích**:
- Clear module boundaries
- Dependency injection
- Easy to test và maintain

---

### 2. **Dependency Injection (DI) Pattern**

**Mô tả**: NestJS sử dụng DI container để manage dependencies.

**Implementation**:
- Services được inject vào controllers và other services
- Configuration được inject qua ConfigService

**Ví dụ**:
```typescript
@Injectable()
export class WalletsService {
    constructor(
        @InjectModel(Wallet.name) private readonly walletModel: Model<Wallet>,
        private readonly fineractService: FineractService,
    ) {}
}
```

**Lợi ích**:
- Loose coupling
- Easy to test (mock dependencies)
- Centralized dependency management

---

### 3. **Repository Pattern**

**Mô tả**: Tách biệt data access logic.

**Implementation**:
- Mongoose models được inject vào services
- Services act as repositories

**Ví dụ**:
```typescript
@Injectable()
export class WalletsService {
    constructor(
        @InjectModel(Wallet.name) private readonly walletModel: Model<Wallet>,
    ) {}
    
    async getWalletsByUserId(userId: string) {
        return this.walletModel.find({ userId }).exec();
    }
}
```

---

### 4. **Strategy Pattern**

**Mô tả**: Sử dụng different strategies cho authentication.

**Implementation**:
- `JwtStrategy`: JWT authentication strategy
- `KeycloakService`: Keycloak integration strategy

**Ví dụ**:
```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: configService.get('jwt.secret'),
        });
    }
    
    async validate(payload: UserPayload) {
        return payload;
    }
}
```

---

### 5. **Guard Pattern**

**Mô tả**: Sử dụng guards để protect routes.

**Implementation**:
- `JwtAuthGuard`: Protect routes với JWT authentication
- `Public` decorator: Mark routes as public

**Ví dụ**:
```typescript
@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
    @Get()
    async getWallets(@CurrentUser() user: User) {
        // Protected route
    }
}
```

---

### 6. **Interceptor Pattern**

**Mô tả**: Intercept requests/responses để transform data.

**Implementation**:
- `TransformInterceptor`: Transform response format
- `LoggingInterceptor`: Log requests
- `TimeoutInterceptor`: Handle timeouts

**Ví dụ**:
```typescript
@Injectable()
export class TransformInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<Response> {
        return next.handle().pipe(
            map(data => ({
                success: true,
                statusCode: response.statusCode,
                data: data?.data !== undefined ? data.data : data,
                timestamp: new Date().toISOString(),
            })),
        );
    }
}
```

---

### 7. **Exception Filter Pattern**

**Mô tả**: Centralized exception handling.

**Implementation**:
- `HttpExceptionFilter`: Handle HTTP exceptions
- `AllExceptionsFilter`: Catch all exceptions

**Ví dụ**:
```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        // Handle exception
    }
}
```

---

### 8. **Service Layer Pattern**

**Mô tả**: Business logic được tách vào service layer.

**Implementation**:
- `AuthService`: Authentication business logic
- `WalletsService`: Wallet business logic
- `BnplService`: BNPL business logic

**Lợi ích**:
- Separation of concerns
- Reusable business logic
- Easy to test

---

### 9. **DTO Pattern (Data Transfer Object)**

**Mô tả**: Sử dụng DTOs để validate và transfer data.

**Implementation**:
- `LoginDto`, `RegisterDto`: Auth DTOs
- `CreateBnplLoanDto`: BNPL DTOs

**Ví dụ**:
```typescript
export class CreateBnplLoanDto {
    @IsNumber()
    @Min(0)
    amount: number;
    
    @IsString()
    @IsNotEmpty()
    description: string;
}
```

---

### 10. **Decorator Pattern**

**Mô tả**: Sử dụng decorators để add functionality.

**Implementation**:
- `@CurrentUser()`: Extract current user from request
- `@Public()`: Mark route as public
- `@Controller()`, `@Get()`, `@Post()`: Route decorators

---

## 🔄 Shared Patterns

### 1. **Error Handling Pattern**

**Mô tả**: Consistent error handling across client và server.

**Implementation**:
- Client: Axios interceptors handle errors
- Server: Exception filters handle errors

---

### 2. **Configuration Pattern**

**Mô tả**: Centralized configuration management.

**Implementation**:
- Client: Environment variables + Constants
- Server: ConfigModule với validation

---

### 3. **Logging Pattern**

**Mô tả**: Structured logging.

**Implementation**:
- Client: Console logs với prefixes
- Server: NestJS Logger

---

## 📊 Summary

| Pattern | Client | Server | Purpose |
|---------|--------|--------|---------|
| Clean Architecture | ✅ | ✅ | Code organization |
| Dependency Injection | ✅ (Context) | ✅ (NestJS DI) | Loose coupling |
| Repository Pattern | ✅ (API Services) | ✅ (Services) | Data access |
| Observer Pattern | ✅ (EventEmitter) | ❌ | Event handling |
| Interceptor Pattern | ✅ (Axios) | ✅ (NestJS) | Request/Response handling |
| Strategy Pattern | ❌ | ✅ (Auth strategies) | Algorithm selection |
| Guard Pattern | ❌ | ✅ | Route protection |
| Factory Pattern | ✅ (Theme) | ❌ | Object creation |
| Singleton Pattern | ✅ (API client) | ✅ (Services) | Single instance |

---

## 🎯 Best Practices

1. **Separation of Concerns**: Mỗi layer có responsibility riêng
2. **Single Responsibility**: Mỗi class/function chỉ làm một việc
3. **DRY (Don't Repeat Yourself)**: Reuse code qua hooks, utilities
4. **Dependency Inversion**: Depend on abstractions, not concretions
5. **Open/Closed Principle**: Open for extension, closed for modification
