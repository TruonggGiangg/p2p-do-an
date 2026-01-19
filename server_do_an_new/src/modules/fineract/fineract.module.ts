import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { FINERACT_AXIOS_CLIENT } from './fineract.constants';
import { KeycloakAuthService } from '../auth/services/keycloak-auth.service';
import { FineractService } from './fineract.service';

@Global()
@Module({
  providers: [
    FineractService,
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

        // Senior tip: centralize auth interceptors
        client.interceptors.request.use(async config => {
          const token = await keycloakAuthService.getClientToken();
          config.headers.Authorization = `Bearer ${token}`;
          return config;
        });

        return client;
      },
      inject: [ConfigService, KeycloakAuthService],
    },
  ],
  exports: [FineractService, FINERACT_AXIOS_CLIENT],
})
export class FineractModule {}
