import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 8080;

  // Security: Add security headers
  app.use(helmet());

  app.use(cookieParser());

  // Security: Configure CORS with specific origins
  const allowedOrigins = configService.get<string>('CORS_ORIGINS')?.split(',') || [
    'http://localhost:8081',
    'http://localhost:19006',
    'http://10.10.2.230:8081',
    'http://192.168.1.56:8081',
    'http://192.168.1.56:19000',
    'exp://192.168.1.56:8081',
  ];


  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Keycloak Auth API')
    .setDescription('API for Keycloak Authentication')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(port, '0.0.0.0');
  console.log(`App is running on http://0.0.0.0:${port}`);
  console.log(`Allowed CORS origins: ${allowedOrigins.join(', ')}`);
}
bootstrap();
