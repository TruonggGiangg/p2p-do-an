import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from './common/decorators/public.decorator';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@ApiTags('root')
@Controller()
export class AppController {
  constructor(private readonly configService: ConfigService) {}

  @Version(VERSION_NEUTRAL)
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Get API information (Neutral Version)',
    description: 'Subject to global rate limit (10/min).',
  })
  @ApiResponse({ status: 200, description: 'API information returned' })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - Global rate limit exceeded',
  })
  getInfo() {
    return {
      name: 'P2P Financial Platform API (Neutral Version)',
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

  @Version('2')
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Get API information (V2)',
    description: 'Subject to global rate limit (10/min).',
  })
  @ApiResponse({ status: 200, description: 'API information returned' })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - Global rate limit exceeded',
  })
  getInfoV2() {
    return {
      name: 'P2P Financial Platform API (V2)',
      version: '2.0.0',
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

  @Version('1')
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Get API information (V1)',
    description: 'Subject to global rate limit (10/min).',
  })
  @ApiResponse({ status: 200, description: 'API information returned' })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - Global rate limit exceeded',
  })
  getInfoV1() {
    return {
      name: 'P2P Financial Platform API (V1)',
      version: '1.5.0',
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
