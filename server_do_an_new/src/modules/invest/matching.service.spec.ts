import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { MatchingService } from './matching.service';
import { InvestmentOrder } from './schemas/investment-order.schema';
import { LoanApplication } from '../loan/schemas/loan-application.schema';
import {
  createMockModel,
  createMockConfigService,
  createMockModuleRef,
  createMockLoanData,
  createMockInvestmentOrder,
} from '../../test-utils/mock-factory';

describe('MatchingService', () => {
  let service: MatchingService;
  let investmentOrderModel: ReturnType<typeof createMockModel>;
  let loanModel: ReturnType<typeof createMockModel>;

  beforeEach(async () => {
    investmentOrderModel = createMockModel();
    loanModel = createMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingService,
        { provide: getModelToken(InvestmentOrder.name), useValue: investmentOrderModel },
        { provide: getModelToken(LoanApplication.name), useValue: loanModel },
        { provide: ConfigService, useValue: createMockConfigService() },
        { provide: ModuleRef, useValue: createMockModuleRef() },
      ],
    }).compile();

    service = module.get<MatchingService>(MatchingService);
  });

  // ═══════════════════════════════════════════════════════
  //  NLP UTILITIES
  // ═══════════════════════════════════════════════════════

  describe('normalizeVietnamese()', () => {
    it('should lowercase and remove Vietnamese diacritics', () => {
      expect(service.normalizeVietnamese('Kinh Doanh Nhỏ Lẻ')).toBe('kinh doanh nho le');
    });

    it('should handle đ → d conversion', () => {
      expect(service.normalizeVietnamese('Đầu tư bất động sản')).toBe('dau tu bat dong san');
    });

    it('should remove special characters', () => {
      expect(service.normalizeVietnamese('Vay vốn! @mua #xe')).toBe('vay von mua xe');
    });

    it('should return empty string for null/empty input', () => {
      expect(service.normalizeVietnamese('')).toBe('');
      expect(service.normalizeVietnamese(null as any)).toBe('');
    });

    it('should collapse multiple spaces', () => {
      expect(service.normalizeVietnamese('kinh   doanh    nhỏ')).toBe('kinh doanh nho');
    });
  });

  describe('tokenize()', () => {
    it('should split normalized string into tokens >= 2 chars', () => {
      const tokens = service.tokenize('kinh doanh nho le');
      expect(tokens).toEqual(['kinh', 'doanh', 'nho', 'le']);
    });

    it('should filter tokens without letters', () => {
      const tokens = service.tokenize('vay 123 von 45');
      expect(tokens).toEqual(['vay', 'von']);
    });

    it('should return empty array for empty input', () => {
      expect(service.tokenize('')).toEqual([]);
    });
  });

  describe('getBigrams()', () => {
    it('should create pairs of consecutive tokens', () => {
      const bigrams = service.getBigrams(['kinh', 'doanh', 'nho', 'le']);
      expect(bigrams).toEqual(['kinh doanh', 'doanh nho', 'nho le']);
    });

    it('should return empty array for single token', () => {
      expect(service.getBigrams(['kinh'])).toEqual([]);
    });

    it('should return empty array for empty input', () => {
      expect(service.getBigrams([])).toEqual([]);
    });
  });

  describe('calculateNodes()', () => {
    it('should calculate nodes = ceil(amount / unitPrice)', () => {
      // unitPrice = 500_000 (from config mock)
      expect(service.calculateNodes(5_000_000)).toBe(10);
      expect(service.calculateNodes(2_500_000)).toBe(5);
    });

    it('should handle amount < unitPrice → 1 node', () => {
      expect(service.calculateNodes(100_000)).toBe(1);
    });

    it('should ceil non-integer results', () => {
      expect(service.calculateNodes(1_200_000)).toBe(3); // 1.2M / 500K = 2.4 → ceil = 3
    });
  });

  describe('unitPrice getter', () => {
    it('should return baseUnitPrice from config', () => {
      expect(service.unitPrice).toBe(500_000);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  PURPOSE MATCHING
  // ═══════════════════════════════════════════════════════

  describe('scorePurposeMatch()', () => {
    it('should return 90 for bigram overlap match', () => {
      const score = service.scorePurposeMatch('Kinh doanh nhỏ lẻ', ['Kinh doanh']);
      expect(score).toBe(90);
    });

    it('should return 70 for token overlap match (>=2 tokens)', () => {
      const score = service.scorePurposeMatch('Mua nhà ở thành phố', ['Nhà ở']);
      expect(score).toBeGreaterThanOrEqual(70);
    });

    it('should return 0 for no match', () => {
      const score = service.scorePurposeMatch('Kinh doanh nhỏ lẻ', ['Đầu tư chứng khoán']);
      expect(score).toBe(0);
    });

    it('should return highest score across multiple purposes', () => {
      const score = service.scorePurposeMatch('Kinh doanh nhỏ lẻ', [
        'Du lịch',           // no match
        'Kinh doanh',        // bigram match → 90
      ]);
      expect(score).toBe(90);
    });

    it('should handle empty order purposes', () => {
      const score = service.scorePurposeMatch('Kinh doanh', []);
      expect(score).toBe(0);
    });
  });

  describe('checkPurposeMatch()', () => {
    it('should return true if score >= 70', () => {
      expect(service.checkPurposeMatch('Kinh doanh nhỏ lẻ', ['Kinh doanh'])).toBe(true);
    });

    it('should return false if score < 70', () => {
      expect(service.checkPurposeMatch('Kinh doanh', ['Chứng khoán'])).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  processMatch()
  // ═══════════════════════════════════════════════════════

  describe('processMatch()', () => {
    const mockOrder = createMockInvestmentOrder({
      totalNodes: 10,
      matchedNodes: 0,
    });
    const mockLoanData = createMockLoanData({ capital: 2_500_000 }); // 5 nodes needed

    it('should match nodes atomically and return success', async () => {
      const updatedOrder = { ...mockOrder, matchedNodes: 5, totalNodes: 10, status: 'open' };
      investmentOrderModel.findOneAndUpdate.mockResolvedValue(updatedOrder);

      const updatedLoan = { investedNotes: 0, nodeMatch: 5, totalNotes: 5 };
      loanModel.findOneAndUpdate.mockResolvedValue(updatedLoan);
      loanModel.updateOne.mockReturnValue({ exec: jest.fn() });

      const result = await service.processMatch(mockOrder as any, mockLoanData);

      expect(result.success).toBe(true);
      expect(result.nodeMatch).toBe(5);
      expect(result.matchedAmount).toBe(2_500_000);
      expect(investmentOrderModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('should return success=false when no available nodes', async () => {
      const fullOrder = createMockInvestmentOrder({
        totalNodes: 10,
        matchedNodes: 10,
      });

      const result = await service.processMatch(fullOrder as any, mockLoanData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Không còn node khả dụng');
    });

    it('should return success=false on atomic update race condition', async () => {
      investmentOrderModel.findOneAndUpdate.mockResolvedValue(null); // race condition

      const result = await service.processMatch(mockOrder as any, mockLoanData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Race condition');
    });

    it('should revert order if loan atomic update fails', async () => {
      const updatedOrder = { ...mockOrder, _id: 'order-id-123', matchedNodes: 5, totalNodes: 10, status: 'open' };
      investmentOrderModel.findOneAndUpdate.mockResolvedValue(updatedOrder);
      loanModel.findOneAndUpdate.mockResolvedValue(null); // loan capacity exceeded

      const result = await service.processMatch(mockOrder as any, mockLoanData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('đã đủ người giữ chỗ');
      expect(investmentOrderModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'order-id-123',
        expect.objectContaining({
          $inc: expect.objectContaining({ matchedNodes: -5 }),
          $set: { status: 'open' },
        }),
      );
    });

    it('should close order when matchedNodes >= totalNodes', async () => {
      const updatedOrder = { ...mockOrder, _id: 'order-id-123', matchedNodes: 10, totalNodes: 10, status: 'open' };
      investmentOrderModel.findOneAndUpdate.mockResolvedValue(updatedOrder);
      investmentOrderModel.updateOne.mockResolvedValue({});

      const updatedLoan = { investedNotes: 0, nodeMatch: 10, totalNotes: 10 };
      loanModel.findOneAndUpdate.mockResolvedValue(updatedLoan);
      loanModel.updateOne.mockReturnValue({ exec: jest.fn() });

      await service.processMatch(mockOrder as any, createMockLoanData({ capital: 5_000_000 }));

      expect(investmentOrderModel.updateOne).toHaveBeenCalledWith(
        { _id: 'order-id-123', matchedNodes: { $gte: 10 } },
        { $set: { status: 'closed' } },
      );
    });

    it('should cap nodes by maxCapital constraint', async () => {
      const orderWithMaxCap = createMockInvestmentOrder({
        totalNodes: 20,
        matchedNodes: 0,
        maxCapital: 1_500_000, // max 3 nodes (1.5M / 500K)
      });

      const updatedOrder = { ...orderWithMaxCap, matchedNodes: 3, totalNodes: 20, status: 'open' };
      investmentOrderModel.findOneAndUpdate.mockResolvedValue(updatedOrder);

      const updatedLoan = { investedNotes: 0, nodeMatch: 3, totalNotes: 10 };
      loanModel.findOneAndUpdate.mockResolvedValue(updatedLoan);
      loanModel.updateOne.mockReturnValue({ exec: jest.fn() });

      const result = await service.processMatch(
        orderWithMaxCap as any,
        createMockLoanData({ capital: 5_000_000 }), // needs 10 nodes
      );

      expect(result.success).toBe(true);
      expect(result.nodeMatch).toBe(3); // capped by maxCapital
    });
  });
});
