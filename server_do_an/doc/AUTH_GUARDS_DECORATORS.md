# 🔓 Guards & Decorators - Chi tiết

## 📋 Mục lục
1. [Guards Overview](#guards-overview)
2. [JWT Auth Guard](#jwt-auth-guard)
3. [Local Auth Guard](#local-auth-guard)
4. [Roles Guard](#roles-guard)
5. [Combined Auth Guard](#combined-auth-guard)
6. [Decorators](#decorators)
7. [Usage Examples](#usage-examples)

---

## 🛡️ Guards Overview

### What is a Guard?
NestJS Guard is middleware that determines if a request should proceed to the route handler or be rejected.

### Guard Execution Order
```
Request
  │
  ├─ Global Guards
  │
  ├─ Controller-level Guards (@UseGuards)
  │
  ├─ Method-level Guards (@UseGuards on endpoint)
  │
  ├─ Decorators processed (@Roles, @Public)
  │
  └─ Route Handler
      └─ Endpoint logic
```

### Guard Types in Auth Module

| Guard | Purpose | When Used |
|-------|---------|-----------|
| `JwtAuthGuard` | Validate JWT token | Protected endpoints |
| `LocalAuthGuard` | Username/password | Signin endpoint |
| `RolesGuard` | Check user role | Role-based endpoints |
| `CombinedAuthGuard` | Multiple strategies | Public + protected |

---

## 🔐 JWT Auth Guard

### Purpose
Validate JWT access token from Authorization header

### File Location
```
src/auth/guards/jwt-auth.guard.ts
```

### Implementation
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err, user, info, context) {
    if (err || !user) {
      throw new UnauthorizedException('Unauthorized');
    }
    return user;
  }
}
```

### How It Works

```
1. Extract Authorization header
   Authorization: Bearer {accessToken}

2. Verify JWT signature
   Secret: JWT_SECRET (JUSTSECRET)

3. Check if expired
   Current time < token.exp

4. Extract payload
   { email, _id, role, name, iat, exp }

5. Attach to req.user
   req.user = payload

6. Proceed to handler or throw 401
```

### JWT Strategy
```typescript
// src/auth/passport/jwt.strategy.ts
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    return {
      _id: payload._id,
      email: payload.email,
      role: payload.role,
      name: payload.name,
    };
  }
}
```

### Usage
```typescript
@Get('/me')
@UseGuards(JwtAuthGuard)
getMe(@User() user) {
  return user;
}

// Request:
// GET /auth/me
// Authorization: Bearer eyJhbGciOi...

// Valid token → User info extracted
// Invalid token → 401 Unauthorized
// No token → 401 Unauthorized
// Expired token → 401 Unauthorized
```

---

## 🔑 Local Auth Guard

### Purpose
Validate username/password credentials

### File Location
```
src/auth/guards/local-auth.guard.ts
```

### Implementation
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err, user, info, context) {
    if (err || !user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }
}
```

### Local Strategy
```typescript
// src/auth/passport/local.strategy.ts
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'username',
      passwordField: 'password',
    });
  }

  async validate(username: string, password: string): Promise<any> {
    const user = await this.authService.validateUser(username, password);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
```

### How It Works

```
1. Extract credentials from body
   { username, password }

2. Find user by username
   Query: email = username OR phone = username

3. Verify password
   bcrypt.compare(password, user.passwordHash)

4. Return user or throw error
   Valid → Attach to req.user
   Invalid → 401 Unauthorized

5. Proceed to handler with user
```

### Usage
```typescript
@Post('/signin')
@UseGuards(LocalAuthGuard)
@ResponseMessage('Đăng nhập thành công')
async signin(@User() user: any) {
  return await this.authService.login(user, res);
}

// Request:
// POST /auth/signin
// Body: { username: "user@example.com", password: "pass123" }

// Valid credentials → User object returned
// Invalid credentials → 401 Unauthorized
```

---

## 👥 Roles Guard

### Purpose
Check if user has required role(s)

### File Location
```
src/auth/guards/roles.guard.ts
```

### Implementation
```typescript
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required roles from @Roles decorator
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No roles required - allow
    if (!requiredRoles) {
      return true;
    }

    // Get user from request
    const { user } = context.switchToHttp().getRequest();

    // Check if user has required role
    return requiredRoles.some((role) => user?.role?.includes(role));
  }
}
```

### Usage Pattern
```typescript
@Get('/test-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
testAdmin() {
  return { message: 'Admin only' };
}

@Get('/test-lender')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('LENDER')
testLender() {
  return { message: 'Lender only' };
}

@Get('/test-both-roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('LENDER', 'BORROWER')  // Multiple roles allowed
testBothRoles() {
  return { message: 'Lender or Borrower' };
}
```

### Execution Flow
```
1. JwtAuthGuard validates token
   → req.user = { role: "BORROWER", ... }

2. RolesGuard checks role
   @Roles('ADMIN')
   Required: ['ADMIN']
   User role: 'BORROWER'
   → 'BORROWER' NOT in ['ADMIN']
   → Throw 403 Forbidden

3. If role matches
   → Proceed to handler
```

---

## 🔄 Combined Auth Guard

### Purpose
Support multiple authentication strategies

### File Location
```
src/auth/guards/combined-auth.guard.ts
```

### Implementation
```typescript
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

@Injectable()
export class CombinedAuthGuard extends JwtAuthGuard {
  constructor(
    reflector: Reflector,
    private jwtAuthGuard: JwtAuthGuard,
  ) {
    super(reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if endpoint is public
    const isPublic = this.reflector.getAllAndOverride('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Otherwise require JWT
    return this.jwtAuthGuard.canActivate(context) as any;
  }
}
```

### Usage with @Public()
```typescript
@Get('/public-endpoint')
@Public()
getPublic() {
  return { message: 'No auth required' };
}

@Get('/protected-endpoint')
// No @Public() → Requires JWT
getProtected(@User() user) {
  return { message: `Hello ${user.name}` };
}
```

---

## 🎯 Decorators

### @Public()
Allow endpoint without authentication

```typescript
// File: src/auth/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const Public = () => SetMetadata('isPublic', true);

// Usage:
@Get('/signup')
@Public()  // No JWT required
async signup(@Body() body) {
  // ...
}
```

### @Roles()
Specify required role(s)

```typescript
// File: src/auth/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => 
  SetMetadata(ROLES_KEY, roles);

// Usage:
@Get('/admin')
@Roles('ADMIN')
adminOnly() { }

@Get('/both')
@Roles('LENDER', 'BORROWER')
multiRole() { }
```

### @User()
Extract current user from request

```typescript
// File: src/auth/decorators/user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

// Usage:
@Get('/me')
getMe(@User() user) {
  console.log(user);
  // user = { _id, email, role, name }
  return user;
}

// Or extract specific field:
@Get('/name')
getName(@User('name') name: string) {
  return { name };
}
```

### @ResponseMessage()
Set custom response message

```typescript
// File: src/auth/decorators/response-message.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE = 'response_message';
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE, message);

// Usage:
@Post('/signin')
@ResponseMessage('Đăng nhập thành công')
signin() {
  // Response will include: message: "Đăng nhập thành công"
}
```

---

## 📚 Usage Examples

### Example 1: Protected Endpoint

```typescript
@Get('/profile')
@UseGuards(JwtAuthGuard)
@ResponseMessage('Lấy hồ sơ thành công')
getProfile(@User() user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
  };
}

// Request:
// GET /profile
// Authorization: Bearer {token}

// Valid token → Returns profile ✓
// No token → 401 Unauthorized ✗
// Expired token → 401 Unauthorized ✗
```

### Example 2: Role-based Access

```typescript
@Get('/admin-panel')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ResponseMessage('Truy cập admin')
adminPanel(@User() user) {
  return { message: 'Admin access granted' };
}

// As ADMIN → Success ✓
// As LENDER → 403 Forbidden ✗
// As BORROWER → 403 Forbidden ✗
```

### Example 3: Multiple Roles

```typescript
@Get('/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('LENDER', 'BORROWER')
@ResponseMessage('Lấy dashboard')
getDashboard(@User() user) {
  return {
    role: user.role,
    data: this.getDataForRole(user.role),
  };
}

// As LENDER → Success ✓
// As BORROWER → Success ✓
// As ADMIN → 403 Forbidden ✗
```

### Example 4: Public Endpoint

```typescript
@Get('/info')
@Public()
@ResponseMessage('Lấy thông tin công khai')
getPublicInfo() {
  return { info: 'Public data' };
}

// No auth required ✓
// Works with or without token ✓
```

### Example 5: Signin (Local Auth)

```typescript
@Post('/signin')
@UseGuards(LocalAuthGuard)
@ResponseMessage('Đăng nhập thành công')
async signin(@User() user) {
  return await this.authService.login(user, res);
}

// Request:
// POST /signin
// Body: { username: "user@example.com", password: "pass123" }

// Valid credentials → Login tokens ✓
// Invalid credentials → 401 Unauthorized ✗
```

### Example 6: Extract User Field

```typescript
@Delete('/account')
@UseGuards(JwtAuthGuard)
deleteAccount(@User('_id') userId: string) {
  return this.usersService.delete(userId);
}

// Access specific user field directly
```

---

## 🔗 Guard Combinations

### Protect with JWT only
```typescript
@UseGuards(JwtAuthGuard)
```

### Protect with JWT + Role
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
```

### Protect with JWT + Multiple Roles
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('LENDER', 'BORROWER')
```

### Local auth (Signin)
```typescript
@UseGuards(LocalAuthGuard)
```

### No protection (Public)
```typescript
@Public()
```

---

## 📝 Guard Application Pattern

### In Controller

```typescript
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { User } from './decorators/user.decorator';
import { ResponseMessage } from './decorators/response-message.decorator';

@Controller('/auth')
export class AuthController {
  // Public endpoint
  @Post('/signup')
  @ResponseMessage('Gửi mã xác thực')
  signup() { }

  // Protected: JWT only
  @Get('/me')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage('Thông tin user')
  getMe(@User() user) { }

  // Protected: JWT + specific role
  @Get('/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ResponseMessage('Admin access')
  adminOnly(@User() user) { }

  // Protected: JWT + multiple roles
  @Get('/dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LENDER', 'BORROWER')
  @ResponseMessage('User dashboard')
  dashboard(@User() user) { }

  // Local auth
  @Post('/signin')
  @UseGuards(LocalAuthGuard)
  @ResponseMessage('Đăng nhập')
  signin(@User() user) { }
}
```

---

**Last Updated**: 2025-11-05
