import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: {
    checkAllServices: jest.Mock;
  };

  beforeEach(async () => {
    healthService = {
      checkAllServices: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: healthService },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  // ═══════════════════════════════════════════════════════
  //  check()
  // ═══════════════════════════════════════════════════════

  describe('check()', () => {
    it('should return 200 with uptime, memory, and environment', () => {
      const result = controller.check();

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.message).toBe('Application is healthy');
      expect(result.data.status).toBe('ok');
      expect(result.data.uptime).toBeDefined();
      expect(result.data.memory.used).toBeDefined();
      expect(result.data.memory.total).toBeDefined();
      expect(result.data.memory.unit).toBe('MB');
      expect(result.data.timestamp).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════
  //  ready()
  // ═══════════════════════════════════════════════════════

  describe('ready()', () => {
    it('should return 200 when all services healthy', async () => {
      healthService.checkAllServices.mockResolvedValue({
        database: { status: 'ok', responseTime: 1 },
        keycloak: { status: 'ok', responseTime: 50 },
        fineract: { status: 'ok', responseTime: 100 },
      });

      const result = await controller.ready();

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data.status).toBe('ready');
      expect(result.data.services.database.status).toBe('ok');
      expect(result.data.services.keycloak.status).toBe('ok');
      expect(result.data.services.fineract.status).toBe('ok');
    });

    it('should return 503 when any service is unhealthy', async () => {
      healthService.checkAllServices.mockResolvedValue({
        database: { status: 'ok', responseTime: 1 },
        keycloak: { status: 'error', message: 'ECONNREFUSED' },
        fineract: { status: 'ok', responseTime: 100 },
      });

      const result = await controller.ready();

      expect(result.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(result.data.status).toBe('degraded');
    });

    it('should return 503 when all services are down', async () => {
      healthService.checkAllServices.mockResolvedValue({
        database: { status: 'error', message: 'disconnected' },
        keycloak: { status: 'error', message: 'timeout' },
        fineract: { status: 'error', message: 'refused' },
      });

      const result = await controller.ready();

      expect(result.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(result.data.status).toBe('degraded');
    });
  });
});
