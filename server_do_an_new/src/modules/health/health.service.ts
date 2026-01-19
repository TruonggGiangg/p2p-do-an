import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { KeycloakService } from '../auth/services/keycloak.service';
import { FineractService } from '../fineract/fineract.service';

export interface HealthStatus {
  status: 'ok' | 'error';
  message?: string;
  responseTime?: number;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @InjectConnection() private readonly mongooseConnection: Connection,
    private readonly configService: ConfigService,
    private readonly keycloakService: KeycloakService,
    private readonly fineractService: FineractService,
  ) {}

  /**
   * Check MongoDB connection
   */
  checkDatabase(): HealthStatus {
    const startTime = Date.now();
    try {
      const state = this.mongooseConnection.readyState;
      const responseTime = Date.now() - startTime;

      // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
      if (state === ConnectionStates.connected) {
        return { status: 'ok', responseTime };
      }
      return {
        status: 'error',
        message: `Connection state: ${state}`,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      };
    }
  }

  // Note: checkDatabase is not async in the traditional sense (no await),
  // but it's marked async for consistency with other health check methods

  /**
   * Check Keycloak connection
   */
  async checkKeycloak(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      const keycloakUrl = this.configService.getOrThrow<string>('keycloak.url');
      const realm = this.configService.getOrThrow<string>('keycloak.realm');

      // Simple health check - try to get realm info
      const response = await axios.get(`${keycloakUrl}/realms/${realm}`, {
        timeout: 5000,
      });

      const responseTime = Date.now() - startTime;
      if (response.status === 200) {
        return { status: 'ok', responseTime };
      }
      return {
        status: 'error',
        message: `Unexpected status: ${response.status}`,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      };
    }
  }

  /**
   * Check Fineract connection
   */
  async checkFineract(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      // Try to get a loan product as a simple health check
      // This will fail if Fineract is down, but succeed if product doesn't exist (404)
      try {
        await this.fineractService.getLoanProductDetails(1);
        const responseTime = Date.now() - startTime;
        return { status: 'ok', responseTime };
      } catch (productError) {
        // If product doesn't exist (404), that's still a connection success
        // Only fail if it's a network/connection error
        if (productError instanceof Error) {
          if (productError.message.includes('404') || productError.message.includes('not found')) {
            const responseTime = Date.now() - startTime;
            return {
              status: 'ok',
              responseTime,
              message: 'Connected (product not found is expected)',
            };
          }
        }
        throw productError; // Re-throw if it's a real connection error
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      };
    }
  }

  /**
   * Check all services
   */
  async checkAllServices(): Promise<{
    database: HealthStatus;
    keycloak: HealthStatus;
    fineract: HealthStatus;
  }> {
    const [database, keycloak, fineract] = await Promise.allSettled([
      Promise.resolve(this.checkDatabase()),
      this.checkKeycloak(),
      this.checkFineract(),
    ]);

    return {
      database: database.status === 'fulfilled' ? database.value : { status: 'error', message: 'Check failed' },
      keycloak: keycloak.status === 'fulfilled' ? keycloak.value : { status: 'error', message: 'Check failed' },
      fineract: fineract.status === 'fulfilled' ? fineract.value : { status: 'error', message: 'Check failed' },
    };
  }
}
