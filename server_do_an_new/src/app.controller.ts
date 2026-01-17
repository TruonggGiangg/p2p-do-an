import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@ApiTags('root')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get welcome message', description: 'Subject to global rate limit (10/min).' })
  @ApiResponse({ status: 200, description: 'Welcome message returned' })
  @ApiResponse({ status: 429, description: 'Too many requests - Global rate limit exceeded' })
  getHello(): string {
    return this.appService.getHello();
  }
}
