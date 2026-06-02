import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  createMockJwtService,
  createMockConfigService,
  createMockResponse,
  createMockUserPayload,
} from '../../test-utils/mock-factory';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: ReturnType<typeof createMockJwtService>;
  let configService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    jwtService = createMockJwtService();
    configService = createMockConfigService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ═══════════════════════════════════════════════════════
  //  login()
  // ═══════════════════════════════════════════════════════

  describe('login()', () => {
    const mockUser = createMockUserPayload();

    it('should generate access token and refresh token', async () => {
      const res = createMockResponse();
      jwtService.sign
        .mockReturnValueOnce('access-token-123')
        .mockReturnValueOnce('refresh-token-456');

      const result = await service.login(mockUser, res as any);

      expect(result.accessToken).toBe('access-token-123');
      expect(result.refreshToken).toBe('refresh-token-456');
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
    });

    it('should set httpOnly cookie with refresh token', async () => {
      const res = createMockResponse();
      jwtService.sign
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

      await service.login(mockUser, res as any);

      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh-token',
        expect.objectContaining({
          httpOnly: true,
        }),
      );
    });

    it('should set secure=true in production', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'nodeEnv') return 'production';
        if (key === 'jwt.refreshExpiresIn') return '7d';
        if (key === 'security.cookieSameSite') return 'lax';
        return undefined;
      });

      const res = createMockResponse();
      jwtService.sign.mockReturnValue('token');

      await service.login(mockUser, res as any);

      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.any(String),
        expect.objectContaining({ secure: true }),
      );
    });

    it('should set secure=false in non-production', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'nodeEnv') return 'development';
        if (key === 'jwt.refreshExpiresIn') return '7d';
        if (key === 'security.cookieSameSite') return 'lax';
        return undefined;
      });

      const res = createMockResponse();
      jwtService.sign.mockReturnValue('token');

      await service.login(mockUser, res as any);

      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.any(String),
        expect.objectContaining({ secure: false }),
      );
    });

    it('should return full user payload with tokens', async () => {
      const res = createMockResponse();
      jwtService.sign.mockReturnValue('token');

      const result = await service.login(mockUser, res as any);

      expect(result).toEqual(
        expect.objectContaining({
          _id: mockUser._id,
          email: mockUser.email,
          name: mockUser.name,
          username: mockUser.username,
          roles: mockUser.roles,
          keycloakUserId: mockUser.keycloakUserId,
          fineractClientId: mockUser.fineractClientId,
        }),
      );
    });

    it('should use keycloakUserId as _id fallback', async () => {
      const res = createMockResponse();
      const userWithoutId = { ...mockUser, _id: undefined };
      jwtService.sign.mockReturnValue('token');

      await service.login(userWithoutId as any, res as any);

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: mockUser.keycloakUserId,
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════
  //  refreshToken()
  // ═══════════════════════════════════════════════════════

  describe('refreshToken()', () => {
    it('should generate new tokens from valid refresh token', async () => {
      const res = createMockResponse();
      const decoded = createMockUserPayload();
      jwtService.verify.mockReturnValue(decoded);
      jwtService.sign
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');

      const result = await service.refreshToken('valid-token', res as any);

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(jwtService.verify).toHaveBeenCalledWith('valid-token', {
        secret: 'test-refresh-secret',
      });
    });

    it('should throw UnauthorizedException if token is empty', async () => {
      const res = createMockResponse();

      await expect(service.refreshToken('', res as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw "Token đã hết hạn" if token expired', async () => {
      const res = createMockResponse();
      const expiredError = new Error('Token expired');
      expiredError.name = 'TokenExpiredError';
      jwtService.verify.mockImplementation(() => { throw expiredError; });

      await expect(service.refreshToken('expired-token', res as any)).rejects.toThrow(
        'Token đã hết hạn',
      );
    });

    it('should throw "Token không hợp lệ" if token is invalid', async () => {
      const res = createMockResponse();
      const invalidError = new Error('Invalid token');
      invalidError.name = 'JsonWebTokenError';
      jwtService.verify.mockImplementation(() => { throw invalidError; });

      await expect(service.refreshToken('invalid-token', res as any)).rejects.toThrow(
        'Token không hợp lệ',
      );
    });

    it('should update refresh token cookie', async () => {
      const res = createMockResponse();
      jwtService.verify.mockReturnValue(createMockUserPayload());
      jwtService.sign.mockReturnValue('new-token');

      await service.refreshToken('valid-token', res as any);

      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════
  //  logout()
  // ═══════════════════════════════════════════════════════

  describe('logout()', () => {
    it('should clear refreshToken cookie', async () => {
      const res = createMockResponse();

      await service.logout(res as any);

      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
    });
  });
});
