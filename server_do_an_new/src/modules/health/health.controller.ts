import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Check application health status',
    description: 'Subject to global rate limit (10/min).',
  })
  @ApiResponse({ status: 200, description: 'Application is healthy' })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - Global rate limit exceeded',
  })
  check() {
    return {
      statusCode: HttpStatus.OK,
      message: 'Application is healthy',
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          unit: 'MB',
        },
      },
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({
    summary: 'Check if application is ready to accept traffic',
    description: 'Checks all external service connections. Subject to global rate limit (10/min).',
  })
  @ApiResponse({ status: 200, description: 'Application is ready' })
  @ApiResponse({
    status: 503,
    description: 'One or more services are unavailable',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - Global rate limit exceeded',
  })
  async ready() {
    const services = await this.healthService.checkAllServices();
    const allHealthy = Object.values(services).every(s => s.status === 'ok');

    return {
      statusCode: allHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
      message: allHealthy ? 'Application is ready' : 'One or more services are unavailable',
      data: {
        status: allHealthy ? 'ready' : 'degraded',
        services: {
          database: {
            status: services.database.status,
            responseTime: services.database.responseTime,
            message: services.database.message,
          },
          keycloak: {
            status: services.keycloak.status,
            responseTime: services.keycloak.responseTime,
            message: services.keycloak.message,
          },
          fineract: {
            status: services.fineract.status,
            responseTime: services.fineract.responseTime,
            message: services.fineract.message,
          },
        },
      },
    };
  }
}
