import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { KeycloakService } from './services/keycloak.service';
import { KeycloakAuthService } from './services/keycloak-auth.service';
import { FineractSignupService } from './services/fineract-signup.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
    imports: [
        PassportModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET'),
                signOptions: {
                    expiresIn: (configService.get<string>('JWT_EXPIRE') || '1h') as any,
                },
            }),
            inject: [ConfigService],
        }),
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        KeycloakService,
        KeycloakAuthService,
        FineractSignupService,
        JwtStrategy,
    ],
    exports: [AuthService, JwtStrategy],
})
export class AuthModule { }
