import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ActivityLogService } from './activity-log.service';
import { ActivityLog } from './schemas/activity-log.schema';
import { createMockModel, createMockActivityLog } from '../../test-utils/mock-factory';

describe('ActivityLogService', () => {
  let service: ActivityLogService;
  let activityLogModel: ReturnType<typeof createMockModel>;

  beforeEach(async () => {
    activityLogModel = createMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLogService,
        { provide: getModelToken(ActivityLog.name), useValue: activityLogModel },
      ],
    }).compile();

    service = module.get<ActivityLogService>(ActivityLogService);
  });

  // ═══════════════════════════════════════════════════════
  //  create()
  // ═══════════════════════════════════════════════════════

  describe('create()', () => {
    it('should create activity log successfully', async () => {
      const logData = createMockActivityLog();
      activityLogModel.create.mockResolvedValue(logData);

      const result = await service.create(logData);

      expect(result).toEqual(logData);
      expect(activityLogModel.create).toHaveBeenCalledWith(logData);
    });

    it('should log error and throw on failure', async () => {
      const error = new Error('Database error');
      activityLogModel.create.mockRejectedValue(error);

      await expect(service.create({})).rejects.toThrow('Database error');
    });
  });

  // ═══════════════════════════════════════════════════════
  //  findAll()
  // ═══════════════════════════════════════════════════════

  describe('findAll()', () => {
    it('should return paginated logs sorted by createdAt desc', async () => {
      const logs = [createMockActivityLog(), createMockActivityLog()];
      const chainable = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(logs),
      };
      activityLogModel.find.mockReturnValue(chainable);
      activityLogModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(10) });

      const result = await service.findAll(1, 20);

      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(chainable.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(chainable.skip).toHaveBeenCalledWith(0);
      expect(chainable.limit).toHaveBeenCalledWith(20);
    });

    it('should handle page 2 with correct skip', async () => {
      const chainable = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      activityLogModel.find.mockReturnValue(chainable);
      activityLogModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

      await service.findAll(2, 20);

      expect(chainable.skip).toHaveBeenCalledWith(20); // (2-1) * 20
    });
  });

  // ═══════════════════════════════════════════════════════
  //  findByUser()
  // ═══════════════════════════════════════════════════════

  describe('findByUser()', () => {
    it('should return paginated logs filtered by userId', async () => {
      const logs = [createMockActivityLog()];
      const chainable = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(logs),
      };
      activityLogModel.find.mockReturnValue(chainable);
      activityLogModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });

      const result = await service.findByUser('user-id-123', 1, 20);

      expect(result.logs).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(activityLogModel.find).toHaveBeenCalledWith({ userId: 'user-id-123' });
    });
  });
});
