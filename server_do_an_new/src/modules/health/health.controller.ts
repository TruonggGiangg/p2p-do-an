import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
    @Public()
    @Get()
    @ApiOperation({ summary: 'Check application health status' })
    @ApiResponse({ status: 200, description: 'Application is healthy' })
    check() {
        return {
            statusCode: 200,
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
    @ApiOperation({ summary: 'Check if application is ready to accept traffic' })
    @ApiResponse({ status: 200, description: 'Application is ready' })
    ready() {
        return {
            statusCode: 200,
            message: 'Application is ready',
            data: {
                status: 'ready',
                services: {
                    database: 'ok', // TODO: Check MongoDB connection
                    keycloak: 'ok', // TODO: Ping Keycloak
                    fineract: 'ok', // TODO: Ping Fineract
                },
            },
        };
    }
}
