import { Controller, Post, Get, Body, Req, Res, UnauthorizedException, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { KeycloakAuthService } from './services/keycloak-auth.service';
import { FineractSignupService } from './services/fineract-signup.service';
import { UserSyncService } from './services/user-sync.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/register.dto';
import { KeycloakUser } from './interfaces/auth.interface';
import type { UserPayload } from './interfaces/auth.interface';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly userSyncService: UserSyncService,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly keycloakAuthService: KeycloakAuthService,
    private readonly fineractSignupService: FineractSignupService,
    private readonly twoFactorService: TwoFactorService,
  ) { }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Register new user' })
  @ApiResponse({ status: 201, description: 'Đăng ký thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ hoặc người dùng đã tồn tại' })
  async register(@Body() body: RegisterDto) {
    const result = await this.fineractSignupService.signup(body);
    return { message: 'Đăng ký thành công', data: result };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công' })
  @ApiResponse({ status: 401, description: 'Sai tên đăng nhập hoặc mật khẩu' })
  async login(@Body() body: LoginDto, @Res() res: Response) {
    const { username, password } = body;

    // 1. Authenticate with Keycloak
    const keycloakTokens = await this.keycloakAuthService.loginWithPassword(username, password);

    // 2. Extract and format user info
    const payload = this.jwtService.decode(keycloakTokens.access_token);
    if (!payload) throw new UnauthorizedException('Token Keycloak không hợp lệ');

    const keycloakUser: KeycloakUser = {
      keycloakUserId: payload.sub,
      username: payload.preferred_username,
      email: payload.email,
      name: payload.name,
      roles: payload.realm_access?.roles || [],
    };

    // 3. Sync with Local Database & Fineract
    const mongoUser = await this.userSyncService.syncUser(keycloakUser);

    // 3.1 Check 2FA Status
    const is2faEnabled = await this.twoFactorService.isEnabled(mongoUser._id.toString());
    if (is2faEnabled) {
      if (!body.twoFactorToken) {
        return res.json({
          success: true,
          requires2fa: true,
          message: 'Yêu cầu mã xác thực 2FA',
        });
      }

      // Verify 2FA Token
      const isValid = await this.twoFactorService.verifyToken(
        mongoUser._id.toString(),
        body.twoFactorToken,
      );

      if (!isValid) {
        throw new UnauthorizedException('Mã 2FA không chính xác');
      }
    }

    // 4. Generate Internal Session
    const userSession = {
      ...keycloakUser,
      _id: mongoUser._id.toString(),
      fineractClientId: mongoUser.fineractClientId,
    };

    const tokens = await this.authService.login(userSession, res);

    return res.json({
      message: 'Đăng nhập thành công',
      data: userSession,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token đã được làm mới' })
  @ApiResponse({ status: 401, description: 'Refresh token không hợp lệ hoặc đã hết hạn' })
  async refresh(@Body() body: RefreshTokenDto, @Req() req: Request, @Res() res: Response) {
    const refreshToken = body?.refreshToken || req.cookies?.['refreshToken'];
    if (!refreshToken) throw new UnauthorizedException('Refresh token không tồn tại');

    const result = await this.authService.refreshToken(refreshToken, res);
    return res.json({ message: 'Token đã được làm mới', data: result });
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current profile' })
  @ApiResponse({ status: 200, description: 'Trả về thông tin user hiện tại' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  async getProfile(@CurrentUser() user: UserPayload) {
    return { data: user };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout' })
  @ApiResponse({ status: 200, description: 'Đăng xuất thành công' })
  async logout(@Res() res: Response) {
    await this.authService.logout(res);
    return res.json({ message: 'Đăng xuất thành công' });
  }
}
