import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { Wallet } from './schemas/wallet.schema';
import { User } from '../users/schemas/user.schema';
import { FineractService } from '../fineract/fineract.service';
import { OtpSessionService } from '../smart-otp/services/otp-session.service';
import { SmartOtpService } from '../smart-otp/services/smart-otp.service';
import {
  createMockModel,
  createMockFineractService,
  createMockOtpSessionService,
  createMockSmartOtpService,
} from '../../test-utils/mock-factory';

describe('WalletsService', () => {
  let service: WalletsService;
  let walletModel: ReturnType<typeof createMockModel>;
  let userModel: ReturnType<typeof createMockModel>;
  let fineractService: ReturnType<typeof createMockFineractService>;

  beforeEach(async () => {
    walletModel = createMockModel();
    userModel = createMockModel();
    fineractService = createMockFineractService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        { provide: getModelToken(Wallet.name), useValue: walletModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: FineractService, useValue: fineractService },
        { provide: OtpSessionService, useValue: createMockOtpSessionService() },
        { provide: SmartOtpService, useValue: createMockSmartOtpService() },
      ],
    }).compile();

    service = module.get<WalletsService>(WalletsService);
  });

  // ═══════════════════════════════════════════════════════
  //  getWalletsByUserId()
  // ═══════════════════════════════════════════════════════

  describe('getWalletsByUserId()', () => {
    it('should return empty array if no wallet refs', async () => {
      const chainable = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      walletModel.find.mockReturnValue(chainable);

      const result = await service.getWalletsByUserId('6507f1f77bcf86cd799439e1');

      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  getWalletById()
  // ═══════════════════════════════════════════════════════

  describe('getWalletById()', () => {
    it('should throw NotFoundException if wallet ref not found', async () => {
      const chainable = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      };
      walletModel.findById.mockReturnValue(chainable);

      await expect(service.getWalletById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should return mapped wallet info for valid ID', async () => {
      const chainable = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({
          _id: { toString: () => 'wallet-id-1' },
          fineractSavingsId: '100',
          isDefault: true,
        }),
      };
      walletModel.findById.mockReturnValue(chainable);

      fineractService.getSavingsAccountDetails.mockResolvedValue({
        accountNo: '000000001',
        productId: 1,
        productName: 'E-Wallet',
        summary: { accountBalance: 1_000_000 },
        currency: { code: 'VND' },
        status: { value: 'Active' },
      });
      fineractService.getWalletType.mockReturnValue('e_wallet');

      const result = await service.getWalletById('wallet-id-1');

      expect(result).not.toBeNull();
      expect(result!.accountNo).toBe('000000001');
      expect(result!.balance).toBe(1_000_000);
      expect(result!.type).toBe('e_wallet');
      expect(result!.isDefault).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  getTotalBalance()
  // ═══════════════════════════════════════════════════════

  describe('getTotalBalance()', () => {
    it('should return 0 when user has no wallets', async () => {
      const chainable = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      walletModel.find.mockReturnValue(chainable);

      const result = await service.getTotalBalance('6507f1f77bcf86cd799439e1');
      expect(result).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  ensureWalletBelongsToUser()
  // ═══════════════════════════════════════════════════════

  describe('ensureWalletBelongsToUser()', () => {
    it('should not throw when wallet belongs to user', async () => {
      const chainable = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: 'wallet-id' }),
      };
      walletModel.findOne.mockReturnValue(chainable);

      await expect(
        service.ensureWalletBelongsToUser('6507f1f77bcf86cd799439e1', '6507f1f77bcf86cd799439e2'),
      ).resolves.not.toThrow();
    });

    it('should throw NotFoundException when wallet does not belong to user', async () => {
      const chainable = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      };
      walletModel.findOne.mockReturnValue(chainable);

      await expect(
        service.ensureWalletBelongsToUser('6507f1f77bcf86cd799439e1', '6507f1f77bcf86cd799439e2'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  validateTransferRequest() — tested via transferByPhone
  // ═══════════════════════════════════════════════════════

  describe('Transfer validation (via transferByPhone)', () => {
    it('should throw BadRequestException if user not found', async () => {
      const userChainable = {
        exec: jest.fn().mockResolvedValue(null),
      };
      userModel.findById.mockReturnValue(userChainable);

      await expect(
        service.transferByPhone('user-123', 'wallet-1', '0999000002', 100_000, 'device-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if account is frozen', async () => {
      const frozenUser = {
        _id: 'user-123',
        fineractClientId: '100',
        metadata: { accountFrozen: true, frozenReason: 'Nhóm nợ cao' },
      };
      userModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(frozenUser) });

      await expect(
        service.transferByPhone('user-123', 'wallet-1', '0999000002', 100_000, 'device-1'),
      ).rejects.toThrow('đóng băng');
    });

    it('should throw BadRequestException if account has permanent ban', async () => {
      const bannedUser = {
        _id: 'user-123',
        fineractClientId: '100',
        metadata: { permanentBan: true, banReason: 'Nợ mất vốn' },
      };
      userModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(bannedUser) });

      await expect(
        service.transferByPhone('user-123', 'wallet-1', '0999000002', 100_000, 'device-1'),
      ).rejects.toThrow('cấm vĩnh viễn');
    });
  });
});
