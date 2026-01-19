import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { setupSwagger } from './config/swagger.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Get config service
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port')!;
  const nodeEnv = configService.get<string>('nodeEnv')!;
  const rawCorsOrigins = configService.get<string[] | string>('security.corsOrigins') ?? ['*'];
  const corsOrigins = (Array.isArray(rawCorsOrigins) ? rawCorsOrigins : rawCorsOrigins.split(','))
    .map(o => o.trim())
    .filter(Boolean);
  const allowAllCors = corsOrigins.length === 0 || corsOrigins.includes('*');

  // Global prefix
  app.setGlobalPrefix('api');

  // Cookie parser
  app.use(cookieParser());

  // CORS - Configure based on environment
  const corsConfig = allowAllCors ? { origin: true, credentials: true } : { origin: corsOrigins, credentials: true };

  app.enableCors({
    ...corsConfig,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // Let CORS reflect request headers (avoid blocking custom headers)
    optionsSuccessStatus: 204,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      disableErrorMessages: nodeEnv === 'production',
    }),
  );

  // Global exception filters (order matters: specific first, general last)
  app.useGlobalFilters(new HttpExceptionFilter(), new AllExceptionsFilter());

  // Global interceptors
  app.useGlobalInterceptors(new LoggingInterceptor(), new TimeoutInterceptor(), new TransformInterceptor());

  // Swagger documentation (only in non-production)
  if (nodeEnv !== 'production') {
    setupSwagger(app);
    logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  }

  // Start server
  // Bind to 0.0.0.0 to allow access from local network (iPhone)
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Server running on: http://0.0.0.0:${port}/api`);
  logger.log(`🌍 Environment: ${nodeEnv}`);
  logger.log(`🔒 CORS: ${allowAllCors ? 'Enabled (Allow All)' : `Enabled (${corsOrigins.length} origin(s))`}`);
}

void bootstrap();
