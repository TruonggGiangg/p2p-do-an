import { plainToInstance } from 'class-transformer';
import {
    IsEnum,
    IsNumber,
    IsString,
    validateSync,
    IsOptional,
    IsUrl,
} from 'class-validator';

enum Environment {
    Development = 'development',
    Production = 'production',
    Test = 'test',
}

class EnvironmentVariables {
    @IsEnum(Environment)
    @IsOptional()
    NODE_ENV: Environment = Environment.Development;

    @IsNumber()
    @IsOptional()
    PORT: number = 3001;

    // JWT
    @IsString()
    JWT_SECRET: string;

    @IsString()
    JWT_REFRESH_SECRET: string;

    @IsOptional()
    @IsString()
    JWT_EXPIRE: string;

    @IsOptional()
    @IsString()
    JWT_REFRESH_EXPIRE: string;

    // Keycloak
    @IsUrl({ require_tld: false })
    KEYCLOAK_URL: string;

    @IsString()
    KEYCLOAK_REALM: string;

    @IsString()
    KEYCLOAK_CLIENT_ID: string;

    @IsString()
    KEYCLOAK_CLIENT_SECRET: string;

    @IsString()
    KEYCLOAK_ADMIN_USERNAME: string;

    @IsString()
    KEYCLOAK_ADMIN_PASSWORD: string;

    // Fineract
    @IsUrl({ require_tld: false })
    FINERACT_API_URL: string;

    @IsString()
    FINERACT_TENANT: string;

    @IsString()
    FINERACT_USERNAME: string;

    @IsString()
    FINERACT_PASSWORD: string;

    // Optional configs
    @IsOptional()
    @IsString()
    MONGODB_URI: string;

    @IsOptional()
    @IsString()
    CORS_ORIGINS: string;
}

export function validate(config: Record<string, unknown>) {
    const validatedConfig = plainToInstance(EnvironmentVariables, config, {
        enableImplicitConversion: true,
    });

    const errors = validateSync(validatedConfig, {
        skipMissingProperties: false,
    });

    if (errors.length > 0) {
        throw new Error(
            `Environment validation failed:\n${errors.map((e) => Object.values(e.constraints || {}).join(', ')).join('\n')}`,
        );
    }

    return validatedConfig;
}
