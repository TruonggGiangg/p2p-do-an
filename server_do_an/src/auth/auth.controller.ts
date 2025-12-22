import {
  Controller,
  Post,
  Get,
  Req,
  Res,
  Body,
  UnauthorizedException,
  UseGuards,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthService } from '@auth/auth.service';
import { KeycloakService } from '@auth/keycloak/keycloak.service';
import { DualAuthGuard } from '@auth/guard/dual-auth.guard';
import { FineractSignupService } from './services/fineract-signup.service';
import type { Response, Request } from 'express';
import { Public, User } from '@decorator/customize';
import { Throttle } from '@nestjs/throttler';

interface KeycloakUser {
  keycloakUserId: string;
  username: string;
  email?: string;
  name?: string;
  roles?: string[];
  fineractClientId?: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly keycloakService: KeycloakService,
    private readonly fineractSignupService: FineractSignupService,
  ) { }

  /**
   * POST /auth/login
   * Login using Keycloak token
   * Rate limited: 5 requests per minute (stricter than global)
   */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Public()
  @Post('login')
  async login(@Req() req: Request, @Res() res: Response) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Keycloak token');
    }

    try {
      const token = authHeader.replace('Bearer ', '');

      if (!this.isKeycloakToken(token)) {
        throw new UnauthorizedException('Invalid Keycloak token format');
      }

      const tokenPayload = this.decodeKeycloakToken(token);
      if (!tokenPayload?.sub) {
        throw new UnauthorizedException('Invalid token payload');
      }

      const user = {
        _id: tokenPayload.sub,
        keycloakUserId: tokenPayload.sub,
        username: tokenPayload.preferred_username,
        email: tokenPayload.email,
        name: tokenPayload.name || tokenPayload.preferred_username,
        roles: tokenPayload.realm_access?.roles || [],
        fineractClientId: tokenPayload.fineractClientId,
      };

      const loginRes = await this.authService.login(user, res);

      return res.status(200).json({
        statusCode: 200,
        message: 'Đăng nhập thành công',
        data: user,
        accessToken: loginRes.accessToken,
        refreshToken: loginRes.refreshToken,
      });
    } catch (error: any) {
      console.error('[Login] Error:', error.message);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Lỗi đăng nhập');
    }
  }

  /**
   * POST /auth/register
   * Register new user with Fineract client + savings account
   */
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Public()
  @Post('register')
  async register(@Body() body: any, @Res() res: Response) {
    try {
      const { firstName, lastName, phoneNumber, email, password, userType } = body;

      if (!firstName || !lastName || !phoneNumber || !password) {
        return res.status(400).json({
          statusCode: 400,
          message: 'Thiếu thông tin: firstName, lastName, phoneNumber, password',
        });
      }

      const result = await this.fineractSignupService.signup({
        firstName,
        lastName,
        phoneNumber,
        email,
        password,
        userType,
      });

      return res.status(201).json({
        statusCode: 201,
        message: 'Đăng ký thành công',
        data: {
          username: result.username,
          clientId: result.clientId,
          savingsId: result.savingsId,
        },
      });
    } catch (error: any) {
      console.error('[Register] Error:', error.message);
      return res.status(400).json({
        statusCode: 400,
        message: error.message || 'Đăng ký thất bại',
      });
    }
  }

  /**
   * POST /auth/refresh
   * Refresh access token
   */
  @Public()
  @Post('refresh')
  async refreshToken(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies['refreshToken'];
    if (!refreshToken) throw new UnauthorizedException('Refresh token không tồn tại');
    const result = await this.authService.refreshToken(refreshToken, res);
    return { data: result };
  }

  /**
   * GET /auth/me
   * Get current user info from token
   */
  @Get('me')
  @UseGuards(DualAuthGuard)
  async getMe(@User() user: KeycloakUser) {
    if (!user) throw new UnauthorizedException('Không tìm thấy thông tin người dùng');
    return { data: user };
  }

  /**
   * GET /auth/userinfo
   * Get user detail from Keycloak
   */
  @Get('userinfo')
  @UseGuards(DualAuthGuard)
  async getUserInfo(@User() user: KeycloakUser) {
    if (!user) throw new UnauthorizedException('Không tìm thấy thông tin người dùng');

    // Get full user info from Keycloak Admin API
    const keycloakUser = await this.keycloakService.findUserByUsername(user.username);

    return {
      data: {
        ...user,
        keycloakDetails: keycloakUser,
      },
    };
  }

  /**
   * POST /auth/logout
   * Logout user
   */
  @Post('logout')
  @UseGuards(DualAuthGuard)
  async logout(@Res({ passthrough: true }) res: Response) {
    await this.authService.logout(res);
    return { message: 'Đăng xuất thành công' };
  }

  // ==================== HELPERS ====================

  private isKeycloakToken(token: string): boolean {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
      return header.kid && header.alg === 'RS256';
    } catch {
      return false;
    }
  }

  private decodeKeycloakToken(token: string): any {
    try {
      const parts = token.split('.');
      return JSON.parse(Buffer.from(parts[1], 'base64').toString());
    } catch {
      return null;
    }
  }
}
