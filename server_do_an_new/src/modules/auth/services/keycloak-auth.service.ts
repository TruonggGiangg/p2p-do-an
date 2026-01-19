import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

interface KeycloakTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
}

@Injectable()
export class KeycloakAuthService {
  private readonly logger = new Logger(KeycloakAuthService.name);
  private readonly keycloakUrl: string;
  private readonly realm: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private httpClient: AxiosInstance;

  constructor(private configService: ConfigService) {
    this.keycloakUrl = this.configService.getOrThrow<string>('keycloak.url');
    this.realm = this.configService.getOrThrow<string>('keycloak.realm');
    this.clientId = this.configService.getOrThrow<string>('keycloak.clientId');
    this.clientSecret = this.configService.getOrThrow<string>('keycloak.clientSecret');

    this.httpClient = axios.create({
      baseURL: this.keycloakUrl,
      timeout: 10000,
    });
  }

  /**
   * Login user via Keycloak OAuth (Password Grant)
   * This method acts as a PROXY - client never calls Keycloak directly
   */
  async loginWithPassword(username: string, password: string): Promise<KeycloakTokenResponse> {
    try {
      const response = await this.httpClient.post<KeycloakTokenResponse>(
        `/realms/${this.realm}/protocol/openid-connect/token`,
        new URLSearchParams({
          username,
          password,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'password',
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      this.logger.log(`User ${username} authenticated successfully via Keycloak`);
      return response.data;
    } catch (error: any) {
      this.logger.error(`Keycloak login failed for ${username}:`, error.response?.data || error.message);

      if (error.response?.status === 401) {
        throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
      }

      throw new UnauthorizedException('Không thể đăng nhập, vui lòng thử lại');
    }
  }

  /**
   * Refresh Keycloak access token
   */
  async refreshKeycloakToken(refreshToken: string): Promise<KeycloakTokenResponse> {
    try {
      const response = await this.httpClient.post<KeycloakTokenResponse>(
        `/realms/${this.realm}/protocol/openid-connect/token`,
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      return response.data;
    } catch (error: any) {
      this.logger.error('Keycloak token refresh failed:', error.response?.data || error.message);
      throw new UnauthorizedException('Token refresh failed');
    }
  }

  /**
   * Get client credentials token (using Password Grant for Admin user as fallback)
   * This is used for service-to-service authentication (e.g., Calling Fineract)
   */
  async getClientToken(): Promise<string> {
    try {
      const username = this.configService.getOrThrow<string>('fineract.username');
      const password = this.configService.getOrThrow<string>('fineract.password');

      const response = await this.httpClient.post<KeycloakTokenResponse>(
        `/realms/${this.realm}/protocol/openid-connect/token`,
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          username,
          password,
          grant_type: 'password',
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      return response.data.access_token;
    } catch (error: any) {
      this.logger.error('Failed to get Keycloak client token:', error.response?.data || error.message);
      throw new UnauthorizedException('Không thể xác thực Service Account');
    }
  }
}
