import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('P2P Lending API')
    .setDescription('P2P Lending Platform API Documentation')
    .setVersion('1.0.0')
    .addTag('auth', 'Quản lý xác thực và phân quyền (Keycloak & Local JWT)')
    .addTag('wallets', 'Quản lý ví điện tử, số dư và giao dịch chuyển khoản')
    .addTag('bnpl', 'Các sản phẩm vay trả sau (Buy Now Pay Later)')
    .addTag('smart-otp', 'Bảo mật giao dịch với Smart OTP và ký số thiết bị')
    .addTag('two-factor', 'Bảo mật 2FA TOTP (Google Authenticator)')
    .addTag('health', 'Kiểm tra trạng thái hoạt động của hệ thống và các service liên kết')
    .addTag('root', 'Thông tin chung về API và môi trường vận hành')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT access token',
        name: 'Authorization',
        in: 'header',
      },
      'access-token',
    )
    .addServer('http://localhost:3001', 'Local Development')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
    customSiteTitle: 'P2P API Docs',
  });
}
