import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { createMockModel } from '../../test-utils/mock-factory';

describe('UsersService', () => {
  let service: UsersService;
  let userModel: ReturnType<typeof createMockModel>;

  beforeEach(async () => {
    userModel = createMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: userModel },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ═══════════════════════════════════════════════════════
  //  updatePushToken()
  // ═══════════════════════════════════════════════════════

  describe('updatePushToken()', () => {
    it('should update push token successfully', async () => {
      userModel.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      await expect(
        service.updatePushToken('6507f1f77bcf86cd799439e1', 'expo-push-token-abc'),
      ).resolves.not.toThrow();

      expect(userModel.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ _id: expect.anything() }),
        { $set: { pushToken: 'expo-push-token-abc' } },
      );
    });

    it('should throw NotFoundException if user not found (matchedCount=0)', async () => {
      userModel.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

      await expect(
        service.updatePushToken('6507f1f77bcf86cd799439e1', 'expo-push-token-abc'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  findPushTokenByUserId()
  // ═══════════════════════════════════════════════════════

  describe('findPushTokenByUserId()', () => {
    it('should return push token when exists', async () => {
      const chainable = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ pushToken: 'expo-token-xyz' }),
      };
      userModel.findById.mockReturnValue(chainable);

      const result = await service.findPushTokenByUserId('user-id-123');

      expect(result).toBe('expo-token-xyz');
    });

    it('should return null when user has no push token', async () => {
      const chainable = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ pushToken: null }),
      };
      userModel.findById.mockReturnValue(chainable);

      const result = await service.findPushTokenByUserId('user-id-123');

      expect(result).toBeNull();
    });

    it('should return null when user does not exist', async () => {
      const chainable = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      };
      userModel.findById.mockReturnValue(chainable);

      const result = await service.findPushTokenByUserId('nonexistent');

      expect(result).toBeNull();
    });
  });
});
