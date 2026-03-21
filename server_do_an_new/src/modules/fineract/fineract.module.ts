import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { FINERACT_AXIOS_CLIENT } from './fineract.constants';
import { KeycloakAuthService } from '../auth/services/keycloak-auth.service';

// Import all services
import { FineractBaseService } from './services/fineract-base.service';
import { FineractClientService } from './services/fineract-client.service';
import { FineractLoanService } from './services/fineract-loan.service';
import { FineractSavingsService } from './services/fineract-savings.service';
import { FineractFDService } from './services/fineract-fd.service';

// Legacy facade for backward compatibility
import { FineractService } from './fineract.service';

@Global()
@Module({
  providers: [
    // Axios client factory
    {
      provide: FINERACT_AXIOS_CLIENT,
      useFactory: (configService: ConfigService, keycloakAuthService: KeycloakAuthService) => {
        const baseURL = configService.getOrThrow<string>('fineract.apiUrl');
        const tenantId = configService.getOrThrow<string>('fineract.tenant');

        const client = axios.create({
          baseURL,
          headers: {
            'Fineract-Platform-TenantId': tenantId,
            'Content-Type': 'application/json',
          },
        });

        client.interceptors.request.use(async config => {
          const token = await keycloakAuthService.getClientToken();
          config.headers.Authorization = `Bearer ${token}`;
          return config;
        });

        return client;
      },
      inject: [ConfigService, KeycloakAuthService],
    },
    // New modular services
    FineractBaseService,
    FineractClientService,
    FineractLoanService,
    FineractSavingsService,
    FineractFDService,
    // Legacy facade (backward compatible)
    FineractService,
  ],
  exports: [
    FINERACT_AXIOS_CLIENT,
    FineractBaseService,
    FineractClientService,
    FineractLoanService,
    FineractSavingsService,
    FineractFDService,
    FineractService, // Keep for backward compatibility
  ],
})
export class FineractModule { }
