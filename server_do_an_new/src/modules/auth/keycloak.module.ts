import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KeycloakService } from './services/keycloak.service';
import { KeycloakAuthService } from './services/keycloak-auth.service';

@Global()
@Module({
    imports: [ConfigModule],
    providers: [KeycloakService, KeycloakAuthService],
    exports: [KeycloakService, KeycloakAuthService],
})
export class KeycloakModule { }
