import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import ms = require('ms');

interface UserPayload {
  _id: string;
  email?: string;
  name?: string;
  username?: string;
  roles?: string[];
  keycloakUserId?: string;
  fineractClientId?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) { }

  async login(user: UserPayload, res: Response) {
    const payload = {
      _id: user._id || user.keycloakUserId,
      email: user.email,
      name: user.name,
      username: user.username,
      roles: user.roles,
      keycloakUserId: user.keycloakUserId,
      fineractClientId: user.fineractClientId,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.createRefreshToken(payload);

    const refreshExpire = this.configService.get('JWT_REFRESH_EXPIRE') || '7d';
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      maxAge: ms(refreshExpire as ms.StringValue),
    });

    return { accessToken, refreshToken, ...payload };
  }

  async refreshToken(token: string, res: Response) {
    if (!token) throw new UnauthorizedException('Token không hợp lệ');

    let decoded: any;
    try {
      decoded = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });
    } catch (err: any) {
      throw new UnauthorizedException(
        err.name === 'TokenExpiredError' ? 'Token đã hết hạn' : 'Token không hợp lệ'
      );
    }

    const payload = {
      _id: decoded._id,
      email: decoded.email,
      name: decoded.name,
      username: decoded.username,
      roles: decoded.roles,
      keycloakUserId: decoded.keycloakUserId,
    };

    const accessToken = this.jwtService.sign(payload);
    const newRefreshToken = await this.createRefreshToken(payload);

    const refreshExpire = this.configService.get('JWT_REFRESH_EXPIRE') || '7d';
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: ms(refreshExpire as ms.StringValue),
    });

    return { accessToken, ...payload };
  }

  async logout(res: Response) {
    res.clearCookie('refreshToken');
  }

  private async createRefreshToken(payload: any): Promise<string> {
    return this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET') || 'REFRESHSECRET',
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRE') || '7d',
    });
  }
}
