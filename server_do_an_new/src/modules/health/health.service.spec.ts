import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { ConnectionStates } from 'mongoose';
import { HealthService } from './health.service';
import { KeycloakService } from '../auth/services/keycloak.service';
import { FineractService } from '../fineract/fineract.service';
import {
  createMockConfigService,
  createMockKeycloakService,
  createMockFineractService,
  createMockMongooseConnection,
} from '../../test-utils/mock-factory';

// Mock axios to avoid real HTTP calls
jest.mock('axios', () => ({
  default: { get: jest.fn() },
  get: jest.fn(),
}));

import axios from 'axios';

describe('HealthService', () => {
  let service: HealthService;
  let mockConnection: ReturnType<typeof createMockMongooseConnection>;
  let fineractService: ReturnType<typeof createMockFineractService>;

  beforeEach(async () => {
    mockConnection = createMockMongooseConnection(ConnectionStates.connected);
    fineractService = createMockFineractService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: getConnectionToken(), useValue: mockConnection },
        { provide: ConfigService, useValue: createMockConfigService() },
        { provide: KeycloakService, useValue: createMockKeycloakService() },
        { provide: FineractService, useValue: fineractService },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  // ═══════════════════════════════════════════════════════
  //  checkDatabase()
  // ═══════════════════════════════════════════════════════

  describe('checkDatabase()', () => {
    it('should return ok when connection state is connected', () => {
      const result = service.checkDatabase();

      expect(result.status).toBe('ok');
      expect(result.responseTime).toBeDefined();
    });

    it('should return error when disconnected', () => {
      (mockConnection as any).readyState = ConnectionStates.disconnected;

      const result = service.checkDatabase();

      expect(result.status).toBe('error');
      expect(result.message).toContain('0'); // disconnected = 0
    });
  });

  // ═══════════════════════════════════════════════════════
  //  checkKeycloak()
  // ═══════════════════════════════════════════════════════

  describe('checkKeycloak()', () => {
    it('should return ok when realm endpoint responds 200', async () => {
      (axios.get as jest.Mock).mockResolvedValue({ status: 200 });

      const result = await service.checkKeycloak();

      expect(result.status).toBe('ok');
      expect(result.responseTime).toBeDefined();
    });

    it('should return error on timeout/network failure', async () => {
      (axios.get as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.checkKeycloak();

      expect(result.status).toBe('error');
      expect(result.message).toContain('ECONNREFUSED');
    });
  });

  // ═══════════════════════════════════════════════════════
  //  checkFineract()
  // ═══════════════════════════════════════════════════════

  describe('checkFineract()', () => {
    it('should return ok on successful connection', async () => {
      fineractService.getLoanProductDetails.mockResolvedValue({});

      const result = await service.checkFineract();

      expect(result.status).toBe('ok');
    });

    it('should return ok even on 404 (connection success)', async () => {
      fineractService.getLoanProductDetails.mockRejectedValue(new Error('404 not found'));

      const result = await service.checkFineract();

      expect(result.status).toBe('ok');
    });

    it('should return error on real connection failure', async () => {
      fineractService.getLoanProductDetails.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.checkFineract();

      expect(result.status).toBe('error');
      expect(result.message).toContain('ECONNREFUSED');
    });
  });

  // ═══════════════════════════════════════════════════════
  //  checkAllServices()
  // ═══════════════════════════════════════════════════════

  describe('checkAllServices()', () => {
    it('should aggregate all service statuses', async () => {
      (axios.get as jest.Mock).mockResolvedValue({ status: 200 });
      fineractService.getLoanProductDetails.mockResolvedValue({});

      const result = await service.checkAllServices();

      expect(result.database).toBeDefined();
      expect(result.keycloak).toBeDefined();
      expect(result.fineract).toBeDefined();
    });
  });
});
