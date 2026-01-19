import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { FineractModule } from '../fineract/fineract.module';
import { KeycloakModule } from '../auth/keycloak.module';

@Module({
  imports: [
    MongooseModule, // For MongoDB connection check
    FineractModule, // For Fineract health check
    KeycloakModule, // For Keycloak health check
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
