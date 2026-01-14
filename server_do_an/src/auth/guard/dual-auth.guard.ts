import { Injectable, ExecutionContext, UnauthorizedException, CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '@decorator/customize';
import axios from 'axios';
import jwkToPem from 'jwk-to-pem';
import * as jwt from 'jsonwebtoken';

interface JWK {
    kid: string;
    kty: string;
    alg: string;
    use: string;
    n?: string;
    e?: string;
}

/**
 * Keycloak-only Auth Guard
 * Validates RS256 JWT tokens issued by Keycloak
 */
@Injectable()
export class DualAuthGuard implements CanActivate {
    private publicKeysCache: JWK[] = [];
    private publicKeysCacheTime: number = 0;
    private readonly CACHE_TTL = 3600000; // 1 hour

    constructor(
        private readonly reflector: Reflector,
        private readonly configService: ConfigService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Check if route is marked as @Public()
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedException('Missing or invalid authorization header');
        }

        const token = authHeader.replace('Bearer ', '');

        try {
            // Validate Keycloak token
            const keycloakUser = await this.validateKeycloakToken(token);

            // Assign Keycloak ID as _id to ensure compatibility with services expecting it
            request.user = {
                ...keycloakUser,
                _id: keycloakUser.keycloakUserId,
            };

            console.log('[KeycloakGuard] Token validated for:', request.user.username, 'ID:', request.user._id);
            return true;
        } catch (error: any) {
            console.error('[KeycloakGuard] Token validation failed:', error.message);
            throw new UnauthorizedException(error.message || 'Token không hợp lệ hoặc đã hết hạn');
        }
    }

    /**
     * Validate Keycloak JWT token (RS256)
     */
    private async validateKeycloakToken(token: string): Promise<any> {
        const baseUrl = this.configService.getOrThrow<string>('KEYCLOAK_BASE_URL');
        const realm = this.configService.get<string>('KEYCLOAK_REALM') || 'fineract';

        // Decode header to get kid
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new UnauthorizedException('Invalid token format');
        }

        const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
        const kid = header.kid;

        if (!kid) {
            throw new UnauthorizedException('Token missing key id (kid)');
        }

        // Get public keys from Keycloak
        const publicKeys = await this.getKeycloakPublicKeys(baseUrl, realm);
        const publicKey = publicKeys.find(k => k.kid === kid);

        if (!publicKey) {
            throw new UnauthorizedException('Public key not found for token');
        }

        // Convert JWK to PEM
        const pem = jwkToPem(publicKey as jwkToPem.JWK);

        // Verify token signature and claims
        const verified = jwt.verify(token, pem, {
            algorithms: ['RS256'],
            issuer: `${baseUrl}/realms/${realm}`,
        }) as any;

        // Return user info extracted from token
        return {
            keycloakUserId: verified.sub,
            username: verified.preferred_username || verified.sub,
            email: verified.email,
            name: verified.name,
            fineractClientId: verified.fineractClientId || verified.sub,
            roles: verified.realm_access?.roles || [],
            tokenPayload: verified,
        };
    }

    /**
     * Fetch Keycloak public keys (JWKS) with caching
     */
    private async getKeycloakPublicKeys(baseUrl: string, realm: string): Promise<JWK[]> {
        const now = Date.now();

        // Return cached keys if still valid
        if (this.publicKeysCache.length > 0 && (now - this.publicKeysCacheTime) < this.CACHE_TTL) {
            return this.publicKeysCache;
        }

        try {
            const certsUrl = `${baseUrl}/realms/${realm}/protocol/openid-connect/certs`;
            const response = await axios.get(certsUrl);
            this.publicKeysCache = response.data.keys || [];
            this.publicKeysCacheTime = now;
            return this.publicKeysCache;
        } catch (error: any) {
            console.error('[KeycloakGuard] Failed to fetch public keys:', error.message);
            throw new UnauthorizedException('Cannot verify Keycloak token');
        }
    }
}
