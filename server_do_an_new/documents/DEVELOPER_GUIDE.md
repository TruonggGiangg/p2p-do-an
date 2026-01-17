# 📚 Server Development Guide - P2P Lending Platform

> **Welcome!** This guide will help you understand the project structure, coding conventions, and how to develop new features.

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Architecture Patterns](#architecture-patterns)
5. [Getting Started](#getting-started)
6. [Development Workflow](#development-workflow)
7. [Adding New Features](#adding-new-features)
8. [Testing Guidelines](#testing-guidelines)
9. [API Documentation](#api-documentation)
10. [Common Patterns](#common-patterns)
11. [Troubleshooting](#troubleshooting)

---

## 🎯 Project Overview

**P2P Lending Server** là backend API cho hệ thống cho vay ngang hàng (Peer-to-Peer Lending), kết nối:
- **Keycloak** - Identity & Access Management
- **Apache Fineract** - Core Banking System
- **MongoDB** - User data & transactions (optional)

### Core Responsibilities
1. **Authentication & Authorization** - JWT-based auth proxy cho Keycloak
2. **User Management** - Tạo users (Keycloak + Fineract clients)
3. **Banking Operations** - Proxy to Fineract (loans, savings, transactions)
4. **Business Logic** - P2P matching, investment flows

---

## 🛠️ Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Framework** | NestJS | 11.x | Enterprise Node.js framework |
| **Language** | TypeScript | 5.x | Type safety |
| **Auth** | Passport + JWT | Latest | Authentication strategy |
| **Validation** | class-validator | Latest | DTO validation |
| **Documentation** | Swagger/OpenAPI | Latest | API docs |
| **Testing** | Jest | Latest | Unit & E2E tests |
| **HTTP Client** | Axios | Latest | External API calls |

### External Services
- **Keycloak** (Port 9000) - OAuth2/OIDC server
- **Fineract** (Port 8080) - Banking core
- **MongoDB** (Port 27017) - Optional data store

---

## 📁 Project Structure

```
server_do_an_new/
├── src/
│   ├── common/                    # Shared utilities (REUSABLE)
│   │   ├── decorators/            # Custom decorators
│   │   │   ├── current-user.decorator.ts    # @CurrentUser()
│   │   │   ├── public.decorator.ts          # @Public()
│   │   │   └── roles.decorator.ts           # @Roles('admin')
│   │   ├── filters/               # Exception handlers
│   │   │   ├── http-exception.filter.ts     # HTTP errors
│   │   │   └── all-exceptions.filter.ts     # Catch-all
│   │   ├── guards/                # Authorization guards
│   │   │   └── roles.guard.ts               # Role-based access
│   │   ├── interceptors/          # Request/Response transformers
│   │   │   ├── logging.interceptor.ts       # Auto-logging
│   │   │   ├── transform.interceptor.ts     # Response formatting
│   │   │   └── timeout.interceptor.ts       # Request timeout
│   │   ├── pipes/                 # Validation pipes
│   │   │   └── parse-phone.pipe.ts          # Phone validation
│   │   ├── interfaces/            # Global interfaces
│   │   │   └── api-response.interface.ts
│   │   ├── dto/                   # Base DTOs
│   │   │   └── pagination.dto.ts
│   │   └── utils/                 # Helper functions
│   │       ├── date.util.ts                 # Fineract date formatting
│   │       └── crypto.util.ts               # Hashing, tokens
│   │
│   ├── config/                    # Configuration management
│   │   ├── configuration.ts       # Typed config object
│   │   ├── validation.ts          # Env validation schema
│   │   └── swagger.config.ts      # API documentation setup
│   │
│   ├── modules/                   # Feature modules (BUSINESS LOGIC)
│   │   ├── auth/                  # Authentication module
│   │   │   ├── dto/
│   │   │   │   ├── register.dto.ts
│   │   │   │   └── login.dto.ts
│   │   │   ├── guards/
│   │   │   │   └── jwt-auth.guard.ts
│   │   │   ├── strategies/
│   │   │   │   └── jwt.strategy.ts
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts              # JWT generation
│   │   │   │   ├── keycloak.service.ts          # Keycloak Admin API
│   │   │   │   ├── keycloak-auth.service.ts     # Keycloak OAuth
│   │   │   │   └── fineract-signup.service.ts   # Registration flow
│   │   │   ├── interfaces/
│   │   │   │   └── auth.interface.ts
│   │   │   ├── auth.controller.ts
│   │   │   └── auth.module.ts
│   │   │
│   │   ├── health/                # Health check module
│   │   │   ├── health.controller.ts
│   │   │   └── health.module.ts
│   │   │
│   │   ├── users/                 # User management (TODO)
│   │   └── p2p/                   # P2P business logic (TODO)
│   │
│   ├── app.controller.ts          # Root controller
│   ├── app.service.ts             # Root service
│   ├── app.module.ts              # Root module (imports all)
│   └── main.ts                    # Application entry point
│
├── test/                          # E2E tests
│   └── app.e2e-spec.ts
│
├── .env                           # Environment variables (GITIGNORED)
├── .env.example                   # Template for .env
├── nest-cli.json                  # NestJS CLI config
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript config
└── README.md                      # Project README
```

---

## 🏗️ Architecture Patterns

### 1. Module Structure (NestJS Pattern)

Mỗi feature là một **Module** độc lập:

```typescript
@Module({
  imports: [JwtModule, HttpModule],      // Dependencies
  controllers: [AuthController],          // HTTP endpoints
  providers: [AuthService, KeycloakService], // Business logic
  exports: [AuthService],                 // Share với modules khác
})
export class AuthModule {}
```

**Nguyên tắc:**
- ✅ 1 module = 1 feature domain
- ✅ Modules communicate qua exports/imports
- ✅ Shared logic → `common/`
- ✅ Config → `ConfigService` (global)

### 2. Layered Architecture

```
Controller (HTTP)
    ↓
Service (Business Logic)
    ↓
Repository/External API
    ↓
Database/Keycloak/Fineract
```

**Example:**
```typescript
// Controller - Handle HTTP
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return await this.authService.login(dto); // Delegate to service
  }
}

// Service - Business logic
@Injectable()
export class AuthService {
  login(dto: LoginDto) {
    // 1. Validate credentials
    // 2. Call external APIs
    // 3. Transform data
    // 4. Return response
  }
}
```

### 3. Dependency Injection

NestJS tự động inject dependencies:

```typescript
@Injectable()
export class AuthService {
  constructor(
    private configService: ConfigService,    // Global config
    private jwtService: JwtService,          // From JwtModule
    private keycloakService: KeycloakService, // Custom service
  ) {}
}
```

**Best Practices:**
- ✅ Inject qua constructor
- ✅ Use interfaces for testability
- ❌ Không `new Service()` manually

### 4. DTO Pattern (Data Transfer Object)

DTOs define API contract + validation:

```typescript
export class RegisterDto {
  @ApiProperty({ example: 'Nguyen' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;
}
```

**Usage:**
```typescript
@Post('register')
async register(@Body() dto: RegisterDto) {
  // dto is auto-validated by ValidationPipe
  // dto.firstName guaranteed to be string
}
```

---

## 🚀 Getting Started

### Prerequisites

```bash
node >= 18.x
npm >= 9.x
```

### Installation

```bash
# 1. Clone repo
cd server_do_an_new

# 2. Install dependencies
npm install

# 3. Copy .env template
cp .env.example .env

# 4. Update .env với actual values
# (Xem environment-config-guide.md)

# 5. Start development server
npm run start:dev
```

### Verify Setup

1. **Server running:**
   ```
   🚀 Server running on: http://localhost:3001/api
   ```

2. **Swagger docs:**
   ```
   http://localhost:3001/api/docs
   ```

3. **Health check:**
   ```bash
   curl http://localhost:3001/api/health
   ```

---

## 💻 Development Workflow

### 1. Create New Feature Branch

```bash
git checkout -b feature/new-feature-name
```

### 2. Running in Development

```bash
npm run start:dev  # Auto-reload on file changes
```

### 3. Code Quality Checks

```bash
# Linting
npm run lint

# Format code
npm run format

# Type check
npm run build
```

### 4. Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

### 5. Commit & Push

```bash
git add .
git commit -m "feat: add new feature"
git push origin feature/new-feature-name
```

---

## ➕ Adding New Features

### Scenario 1: Add New Endpoint to Existing Module

**Example:** Add `/auth/change-password`

1. **Create DTO** (`auth/dto/change-password.dto.ts`):
```typescript
export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  newPassword: string;
}
```

2. **Add Service Method** (`auth/auth. service.ts`):
```typescript
async changePassword(userId: string, dto: ChangePasswordDto) {
  // 1. Verify current password
  // 2. Update password in Keycloak
  // 3. Invalidate refresh tokens
  // 4. Return success
}
```

3. **Add Controller Endpoint** (`auth/auth.controller.ts`):
```typescript
@UseGuards(JwtAuthGuard)
@Post('change-password')
@ApiOperation({ summary: 'Change user password' })
async changePassword(
  @CurrentUser() user: any,
  @Body() dto: ChangePasswordDto,
) {
  return await this.authService.changePassword(user._id, dto);
}
```

4. **Test:**
   - Visit http://localhost:3001/api/docs
   - Endpoint xuất hiện trong Swagger
   - Test với sample data

### Scenario 2: Create New Module

**Example:** Create `InvestmentsModule`

1. **Generate module:**
```bash
nest g module modules/investments
nest g controller modules/investments
nest g service modules/investments
```

2. **Structure:**
```
modules/investments/
├── dto/
│   ├── create-investment.dto.ts
│   └── investment-query.dto.ts
├── interfaces/
│   └── investment.interface.ts
├── investments.controller.ts
├── investments.service.ts
└── investments.module.ts
```

3. **Define DTOs:**
```typescript
// dto/create-investment.dto.ts
export class CreateInvestmentDto {
  @ApiProperty()
  @IsNumber()
  @Min(100000)
  amount: number;

  @ApiProperty()
  @IsString()
  loanId: string;
}
```

4. **Implement Service:**
```typescript
@Injectable()
export class InvestmentsService {
  constructor(
    private configService: ConfigService,
    private httpService: HttpService, // For Fineract API
  ) {}

  async create(userId: string, dto: CreateInvestmentDto) {
    // 1. Validate loan exists
    // 2. Check user balance
    // 3. Create Fixed Deposit in Fineract
    // 4. Update loan funding
    // 5. Return investment details
  }
}
```

5. **Create Controller:**
```typescript
@ApiTags('investments')
@Controller('investments')
@UseGuards(JwtAuthGuard)
export class InvestmentsController {
  constructor(private investmentsService: InvestmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create new investment' })
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateInvestmentDto,
  ) {
    return await this.investmentsService.create(user._id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get user investments' })
  async findAll(@CurrentUser() user: any) {
    return await this.investmentsService.findByUser(user._id);
  }
}
```

6. **Register in AppModule:**
```typescript
@Module({
  imports: [
    // ... existing modules
    InvestmentsModule,
  ],
})
export class AppModule {}
```

### Scenario 3: Add Custom Decorator

**Example:** `@RequireRole()` decorator

1. **Create decorator** (`common/decorators/require-role.decorator.ts`):
```typescript
export const REQUIRE_ROLE_KEY = 'requireRole';
export const RequireRole = (role: string) => SetMetadata(REQUIRE_ROLE_KEY, role);
```

2. **Create guard** (`common/guards/role.guard.ts`):
```typescript
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRole = this.reflector.get<string>(
      REQUIRE_ROLE_KEY,
      context.getHandler(),
    );

    if (!requiredRole) return true;

    const { user } = context.switchToHttp().getRequest();
    return user.roles?.includes(requiredRole);
  }
}
```

3. **Usage:**
```typescript
@UseGuards(JwtAuthGuard, RoleGuard)
@RequireRole('admin')
@Delete('users/:id')
async deleteUser(@Param('id') id: string) {
  // Only admin can access
}
```

---

## 🧪 Testing Guidelines

### Unit Tests

Test individual services/controllers in isolation:

```typescript
// auth.service.spec.ts
describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should generate access token', () => {
    const user = { _id: '123', username: 'test' };
    service.login(user);

    expect(jwtService.sign).toHaveBeenCalledWith(user);
  });
});
```

### E2E Tests

Test full HTTP flows:

```typescript
// auth.e2e-spec.ts
describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/api/auth/login (POST)', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'test', password: 'password' })
      .expect(200)
      .expect((res) => {
        expect(res.body.accessToken).toBeDefined();
      });
  });
});
```

---

## 📖 API Documentation

### Swagger Decorators

Always document endpoints:

```typescript
@Post('register')
@ApiOperation({ 
  summary: 'Register new user',
  description: 'Creates Keycloak user + Fineract client + Savings account'
})
@ApiResponse({ status: 201, description: 'User created successfully' })
@ApiResponse({ status: 400, description: 'Validation failed' })
@ApiResponse({ status: 500, description: 'Internal server error' })
async register(@Body() dto: RegisterDto) {
  // ...
}
```

### Accessing Docs

1. Start server: `npm run start:dev`
2. Open: http://localhost:3001/api/docs
3. Interactive testing available!

---

## 🎨 Common Patterns

### Pattern 1: Configuration Usage

```typescript
@Injectable()
export class MyService {
  constructor(private configService: ConfigService) {}

  doSomething() {
    const jwtSecret = this.configService.get<string>('jwt.secret');
    const port = this.configService.get<number>('port');
    const fineractUrl = this.configService.get<string>('fineract.apiUrl');
  }
}
```

### Pattern 2: Exception Handling

```typescript
async findUser(id: string) {
  const user = await this.userRepository.findById(id);

  if (!user) {
    throw new NotFoundException(`User ${id} not found`);
  }

  return user;
}
```

Common exceptions:
- `BadRequestException` - 400
- `UnauthorizedException` - 401
- `ForbiddenException` - 403
- `NotFoundException` - 404
- `InternalServerErrorException` - 500

### Pattern 3: Async Operations

```typescript
async createUser(dto: CreateUserDto) {
  try {
    // Sequential operations
    const keycloakUser = await this.keycloakService.create(dto);
    const fineractClient = await this.fineractService.create(keycloakUser.id);
    
    // Parallel operations
    const [savings, loans] = await Promise.all([
      this.createSavings(fineractClient.id),
      this.createLoanAccount(fineractClient.id),
    ]);

    return { keycloakUser, fineractClient, savings, loans };
  } catch (error) {
    this.logger.error(`Failed to create user: ${error.message}`);
    throw new InternalServerErrorException('User creation failed');
  }
}
```

### Pattern 4: Logging

```typescript
@Injectable()
export class MyService {
  private readonly logger = new Logger(MyService.name);

  async doSomething() {
    this.logger.log('Starting operation...');
    this.logger.debug('Debug info', { data: someData });
    this.logger.warn('Warning message');
    this.logger.error('Error occurred', error.stack);
  }
}
```

### Pattern 5: Response Formatting

Sử dụng `TransformInterceptor` (đã setup global):

```typescript
// Controller returns
return { data: user };

// Client receives (auto-transformed)
{
  "statusCode": 200,
  "message": "Success",
  "data": { /* user data */ },
  "timestamp": "2026-01-18T01:00:00.000Z"
}
```

### Pattern 6: Pagination

```typescript
@Get()
async findAll(@Query() query: PaginationDto) {
  const { page = 1, pageSize = 10 } = query;
  
  const [items, total] = await this.repository.findAndCount({
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    data: items,
    meta: {
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      totalItems: total,
    },
  };
}
```

---

## 🐛 Troubleshooting

### Issue: "Cannot find module"

**Solution:**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Issue: "Port 3001 already in use"

**Solution:**
```bash
# Kill process on port 3001
npx kill-port 3001

# Or change PORT in .env
PORT=3002
```

### Issue: "JWT token invalid"

**Causes:**
1. JWT_SECRET mismatch
2. Token expired
3. Wrong token format

**Debug:**
```typescript
// Decode token manually
const decoded = this.jwtService.decode(token);
console.log('Token payload:', decoded);
```

### Issue: "Keycloak connection failed"

**Check:**
1. Keycloak is running: `docker ps | grep keycloak`
2. KEYCLOAK_URL correct in .env
3. Network connectivity: `curl http://localhost:9000`

### Issue: "TypeScript compilation errors"

**Solutions:**
```bash
# Rebuild
npm run build

# Check specific file
npx tsc src/path/to/file.ts --noEmit

# Update types
npm install --save-dev @types/node @types/express
```

---

## 📚 Additional Resources

### NestJS Documentation
- Official Docs: https://docs.nestjs.com
- CLI Commands: https://docs.nestjs.com/cli/overview
- Best Practices: https://docs.nestjs.com/fundamentals/custom-providers

### Project-Specific Docs
- `auth-flow-explanation.md` - Authentication flow
- `security-architecture.md` - Security design
- `environment-config-guide.md` - Configuration guide
- `test-accounts.md` - Test credentials

### Code Style Guide
- Follow NestJS conventions
- Use TypeScript strict mode
- Write self-documenting code
- Add JSDoc for complex functions
- Keep functions < 50 lines
- Prefer composition over inheritance

---

## 🎯 Development Checklist

### Before Creating PR:

- [ ] Code compiles without errors (`npm run build`)
- [ ] All tests pass (`npm run test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Swagger docs updated (if API changed)
- [ ] Environment variables documented (if new configs)
- [ ] Error handling implemented
- [ ] Logging added for important operations
- [ ] DTOs validated with class-validator
- [ ] Security considered (auth, input validation)
- [ ] Performance considered (N+1 queries, caching)

### Code Review Focus:

- ✅ Follows NestJS patterns
- ✅ Proper error handling
- ✅ Type safety (no `any` unless necessary)
- ✅ Security (no secrets in code)
- ✅ Performance (efficient queries)
- ✅ Testability (dependency injection)
- ✅ Documentation (Swagger, comments)

---

## 🚀 Next Steps for New Developers

### Week 1: Understanding
1. Read this guide thoroughly
2. Explore codebase structure
3. Run project locally
4. Review Swagger API docs
5. Understand authentication flow

### Week 2: First Contribution
1. Pick a "good first issue"
2. Create feature branch
3. Implement with tests
4. Submit PR for review
5. Iterate based on feedback

### Week 3+: Independent Development
1. Take on medium-complexity tasks
2. Propose new features
3. Improve existing code
4. Mentor new team members

---

## 📞 Getting Help

### Questions?
- Check existing docs first
- Ask in team chat
- Review similar code in codebase
- Consult NestJS docs

### Found a Bug?
- Check if already reported
- Provide reproduction steps
- Include error logs
- Submit issue with details

### Want to Contribute?
- Review open issues
- Discuss approach first
- Follow coding standards
- Write tests
- Update documentation

---

**Happy Coding! 🎉**

*Last Updated: 2026-01-18*
