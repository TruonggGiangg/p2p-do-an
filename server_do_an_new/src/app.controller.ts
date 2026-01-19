import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from './common/decorators/public.decorator';

@ApiTags('root')
@Controller()
export class AppController {
  constructor(private readonly configService: ConfigService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Get API information',
    description: 'Subject to global rate limit (10/min).',
  })
  @ApiResponse({ status: 200, description: 'API information returned' })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - Global rate limit exceeded',
  })
  getInfo() {
    return {
      name: 'P2P Financial Platform API',
      version: '1.0.0',
      environment: this.configService.get<string>('nodeEnv') || 'development',
      description: 'Financial services platform using Fineract as core banking system',
      endpoints: {
        health: '/api/health',
        docs: '/api/docs',
        auth: '/api/auth',
        wallets: '/api/wallets',
        bnpl: '/api/bnpl',
      },
    };
  }
}
