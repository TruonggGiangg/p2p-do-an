import {
    Controller,
    Post,
    Get,
    Body,
    Req,
    Res,
    UnauthorizedException,
    HttpStatus,
    HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { KeycloakAuthService } from './services/keycloak-auth.service';
import { FineractSignupService } from './services/fineract-signup.service';
import { UserSyncService } from './services/user-sync.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RegisterDto, RefreshTokenDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { KeycloakUser, KeycloakTokenPayload } from './interfaces/auth.interface';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly keycloakAuthService: KeycloakAuthService,
        private readonly fineractSignupService: FineractSignupService,
        private readonly userSyncService: UserSyncService,
    ) { }

    @Public()
    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 registrations per minute
    @ApiOperation({
        summary: 'Register new user',
        description: 'Create Keycloak user + Fineract client + Savings account. Limit: 3 requests per minute.'
    })
    @ApiResponse({ status: 201, description: 'User registered successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
    @ApiResponse({ status: 429, description: 'Too many requests - Rate limit exceeded (3/min)' })
    @ApiResponse({ status: 500, description: 'Internal server error' })
    async register(@Body() body: RegisterDto) {
        const result = await this.fineractSignupService.signup({
            firstName: body.firstName,
            lastName: body.lastName,
            phoneNumber: body.phoneNumber,
            email: body.email,
            password: body.password,
            userType: body.userType,
        });

        return {
            statusCode: HttpStatus.CREATED,
            message: 'Đăng ký thành công',
            data: result,
        };
    }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 login attempts per minute
    @ApiOperation({
        summary: 'Login user',
        description: 'Authenticate with username/password, returns JWT access token and sets refresh token cookie. Limit: 5 requests per minute.',
    })
    @ApiResponse({ status: 200, description: 'Login successful' })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    @ApiResponse({ status: 429, description: 'Too many requests - Rate limit exceeded (5/min)' })
    async login(@Body() body: LoginDto, @Res() res: Response) {
        const { username, password } = body;

        // Proxy to Keycloak OAuth (client secret hidden from client)
        const keycloakTokens = await this.keycloakAuthService.loginWithPassword(
            username,
            password,
        );

        // Decode Keycloak token to extract user info
        const tokenPayload = this.decodeKeycloakToken(keycloakTokens.access_token);

        const keycloakUser: KeycloakUser = {
            keycloakUserId: tokenPayload.sub,
            username: tokenPayload.preferred_username,
            email: tokenPayload.email,
            name: tokenPayload.name,
            roles: tokenPayload.realm_access?.roles || [],
        };

        // NEW: Sync with MongoDB (ensure user exists in local DB)
        const mongoUser = await this.userSyncService.syncUser(keycloakUser);

        // Prepare final user payload with MongoDB ID and Fineract IDs
        const user = {
            ...keycloakUser,
            _id: mongoUser._id.toString(),
            fineractClientId: mongoUser.fineractClientId,
        };

        // Generate internal JWT & set refresh token cookie
        const loginResult = await this.authService.login(user, res);

        return res.status(HttpStatus.OK).json({
            statusCode: HttpStatus.OK,
            message: 'Đăng nhập thành công',
            data: user,
            accessToken: loginResult.accessToken,
            refreshToken: loginResult.refreshToken,
        });
    }

    @Public()
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Refresh access token',
        description: 'Get new access token using refresh token from body (mobile) or cookie (web). Subject to global rate limit (10/min).'
    })
    @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
    @ApiResponse({ status: 401, description: 'Invalid or missing refresh token' })
    @ApiResponse({ status: 429, description: 'Too many requests - Global rate limit exceeded' })
    async refresh(
        @Body() body: RefreshTokenDto,
        @Req() req: Request,
        @Res() res: Response
    ) {
        // Accept refresh token from body (mobile) or cookie (web)
        const refreshToken = body?.refreshToken || req.cookies?.['refreshToken'];

        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token không tồn tại');
        }

        const result = await this.authService.refreshToken(refreshToken, res);

        return res.status(HttpStatus.OK).json({
            statusCode: HttpStatus.OK,
            message: 'Token đã được làm mới',
            data: result,
        });
    }

    @Get('me')
    @ApiBearerAuth('access-token')
    @ApiOperation({ summary: 'Get current user profile', description: 'Returns authenticated user information' })
    @ApiResponse({ status: 200, description: 'User profile retrieved' })
    @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing token' })
    async getProfile(@CurrentUser() user: any) {
        return {
            statusCode: HttpStatus.OK,
            message: 'Thông tin người dùng',
            data: user,
        };
    }

    @Public()
    @Post('logout')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Logout user', description: 'Clear refresh token cookie' })
    @ApiResponse({ status: 200, description: 'Logout successful' })
    async logout(@Res() res: Response) {
        res.clearCookie('refreshToken');

        return res.status(HttpStatus.OK).json({
            statusCode: HttpStatus.OK,
            message: 'Đăng xuất thành công',
        });
    }

    /**
     * Helper: Decode Keycloak JWT token
     */
    private decodeKeycloakToken(token: string): KeycloakTokenPayload {
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new UnauthorizedException('Invalid token format');
        }

        const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
        return JSON.parse(payload) as KeycloakTokenPayload;
    }
}
