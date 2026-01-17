import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import ms from 'ms';
import { UserPayload, TokenResponse } from './interfaces/auth.interface';

@Injectable()
export class AuthService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) { }

    /**
     * Login user and generate tokens
     */
    async login(user: UserPayload, res: Response): Promise<TokenResponse & UserPayload> {
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

        // Set refresh token in httpOnly cookie
        const refreshExpire = this.configService.get<string>('JWT_REFRESH_EXPIRE') || '7d';
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: this.configService.get<string>('NODE_ENV') === 'production',
            sameSite: 'lax',
            maxAge: ms(refreshExpire as ms.StringValue),
        });

        return {
            accessToken,
            refreshToken,
            ...payload,
        };
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshToken(token: string, res: Response): Promise<{ accessToken: string } & UserPayload> {
        if (!token) {
            throw new UnauthorizedException('Token không hợp lệ');
        }

        let decoded: any;
        try {
            decoded = this.jwtService.verify(token, {
                secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
            });
        } catch (err: any) {
            throw new UnauthorizedException(
                err.name === 'TokenExpiredError' ? 'Token đã hết hạn' : 'Token không hợp lệ',
            );
        }

        const payload = {
            _id: decoded._id,
            email: decoded.email,
            name: decoded.name,
            username: decoded.username,
            roles: decoded.roles,
            keycloakUserId: decoded.keycloakUserId,
            fineractClientId: decoded.fineractClientId,
        };

        const accessToken = this.jwtService.sign(payload);
        const newRefreshToken = await this.createRefreshToken(payload);

        // Update refresh token cookie
        const refreshExpire = this.configService.get<string>('JWT_REFRESH_EXPIRE') || '7d';
        res.cookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: this.configService.get<string>('NODE_ENV') === 'production',
            sameSite: 'lax',
            maxAge: ms(refreshExpire as ms.StringValue),
        });

        return {
            accessToken,
            ...payload,
        };
    }

    /**
     * Logout user - clear refresh token cookie
     */
    async logout(res: Response): Promise<void> {
        res.clearCookie('refreshToken');
    }

    /**
     * Create refresh token
     */
    private async createRefreshToken(payload: any): Promise<string> {
        return this.jwtService.sign(payload, {
            secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
            expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRE') || '7d') as any,
        });
    }
}
