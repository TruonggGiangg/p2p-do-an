/**
 * InvestPaymentService — Full investment flow with Fineract payment
 * ──────────────────────────────────────────────────────────
 * Handles: Validation → Balance check → Create contract → Transfer funds → Create FD → Update contract
 * Payment method: Fineract e-wallet only (no USDT, no internal wallet, no blockchain).
 */
import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';

import { InvestmentContract } from './schemas/investment-contract.schema';
import { InvestmentOrder } from './schemas/investment-order.schema';
import { LoanApplication } from '../loan/schemas/loan-application.schema';
import { User } from '../users/schemas/user.schema';
import { Wallet } from '../wallets/schemas/wallet.schema';

import { InvestmentContractService } from './investment-contract.service';
import { FineractService } from '../fineract/fineract.service';

@Injectable()
export class InvestPaymentService {
  private readonly logger = new Logger(InvestPaymentService.name);
  private readonly baseUnitPrice: number;

  constructor(
    @InjectModel(InvestmentContract.name) private readonly contractModel: Model<InvestmentContract>,
    @InjectModel(LoanApplication.name) private readonly loanModel: Model<LoanApplication>,
    @InjectModel(InvestmentOrder.name) private readonly orderModel: Model<InvestmentOrder>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Wallet.name) private readonly walletModel: Model<Wallet>,
    private readonly contractService: InvestmentContractService,
    private readonly fineractService: FineractService,
    private readonly configService: ConfigService,
  ) {
    this.baseUnitPrice = this.configService.get<number>('invest.baseUnitPrice') || 500_000;
  }

  // ═══════════════════════════════════════════════════════
  //  FULL INVESTMENT FLOW
  // ═══════════════════════════════════════════════════════

  /**
   * Process a full investment: validate → create contract → transfer funds → create FD.
   */
  async processInvestment(
    lenderId: string,
    loanApplicationId: string,
    numNotes: number,
    investmentOrderId?: string,
  ): Promise<InvestmentContract> {
    const investAmount = numNotes * this.baseUnitPrice;

    // ── 1. Validate lender ──
    const lender = await this.userModel.findById(lenderId).select('fineractClientId fullName email phone').lean();
    if (!lender) throw new NotFoundException('Không tìm thấy người dùng');
    if (!lender.fineractClientId) {
      throw new BadRequestException('Lender chưa liên kết Fineract. Vui lòng đồng bộ ví trước.');
    }

    // ── 2. Validate loan ──
    const loan = await this.loanModel
      .findById(loanApplicationId)
      .select('_id capital status willing periodMonth monthlyRatePercent productId nodeMatch investedNotes')
      .lean();
    if (!loan) throw new NotFoundException('Không tìm thấy khoản vay');
    if (!['approved', 'disbursed'].includes(loan.status)) {
      throw new BadRequestException('Khoản vay không ở trạng thái cho phép đầu tư');
    }

    // ── 3. Check duplicate investment (DISABLED BY BUSINESS RULE) ──
    // Người dùng được quyền phân bổ vốn nhiều lần vào một khoản vay nếu muốn
    /*
    const existingContract = await this.contractModel
      .findOne({
        lenderId: new Types.ObjectId(lenderId),
        loanApplicationId: loan._id,
        status: { $in: ['pending', 'active'] },
      })
      .select('contractId')
      .lean();
    if (existingContract) {
      throw new BadRequestException(
        `Bạn đã đầu tư vào khoản vay này (HĐ: ${existingContract.contractId}). Không thể đầu tư trùng.`,
      );
    }
    */

    // ── 4. Check available notes (must consider BOTH nodeMatch and investedNotes) ──
    const totalLoanNotes = Math.ceil(loan.capital / this.baseUnitPrice);
    const investedSoFar = (loan as any).investedNotes || 0;
    const nodeMatchSoFar = (loan as any).nodeMatch || 0;

    let effectiveNodeMatch = nodeMatchSoFar;
    if (investmentOrderId) {
      const order = await this.orderModel.findById(investmentOrderId);
      if (order) {
        const matchedLoan = (order as any).loans?.find((l: any) => String(l.loanId) === String(loan._id));
        const orderMatchedNodes = matchedLoan?.nodeMatch || 0;
        
        // Bắt buộc thanh toán đúng số slot đã giữ của khoản vay này
        if (numNotes !== orderMatchedNodes) {
          throw new BadRequestException(`Bạn đã giữ ${orderMatchedNodes} chỗ cho khoản vay này, vui lòng thanh toán đúng số lượng hoặc hủy lệnh.`);
        }
        
        effectiveNodeMatch = Math.max(0, nodeMatchSoFar - orderMatchedNodes);
      }
    }

    const availableNotes = totalLoanNotes - investedSoFar - effectiveNodeMatch;
    if (numNotes > availableNotes) {
      throw new BadRequestException(`Chỉ còn ${availableNotes} notes khả dụng (yêu cầu ${numNotes})`);
    }

    // ── 5. Check wallet balance ──
    const lenderClientId = Number(lender.fineractClientId);
    const eWallet = await this.fineractService.getActiveEWalletAccount(lenderClientId);
    if (!eWallet) {
      throw new BadRequestException('Lender chưa có ví điện tử active trên Fineract');
    }

    const walletBalance = eWallet.summary?.accountBalance || 0;
    if (walletBalance < investAmount) {
      throw new BadRequestException(
        `Số dư ví không đủ. Cần: ${investAmount.toLocaleString()} VND, Hiện có: ${walletBalance.toLocaleString()} VND`,
      );
    }

    // ── 6. Create InvestmentContract (MongoDB) ──
    const contract = await this.contractService.createContract(
      lenderId,
      loanApplicationId,
      numNotes,
      investmentOrderId,
    );

    this.logger.log(`Contract created: ${contract.contractId}, capital: ${investAmount.toLocaleString()}`);

    // ── 7. Transfer funds: Lender e-wallet → Platform escrow ──
    // For đồ án, platform escrow = "platform" savings account (offsetId from defaults)
    try {
      // Get platform savings account for escrow
      const platformClientId = this.configService.get<number>('defaults.platformClientId') || 1;
      const platformAccount = await this.fineractService.getActiveEWalletAccount(platformClientId);

      if (platformAccount) {
        await this.fineractService.transferFunds(
          lenderClientId,
          platformClientId,
          eWallet.id,
          platformAccount.id,
          investAmount,
          `Đầu tư P2P - HĐ ${contract.contractId}`,
        );
        this.logger.log(`Funds transferred: ${investAmount.toLocaleString()} VND from lender wallet`);
      } else {
        this.logger.warn('Platform escrow account not found, skipping fund transfer');
      }
    } catch (error: any) {
      this.logger.error(`Fund transfer failed: ${error.message}. Contract created but unfunded.`);
      // Don't throw — contract is still valid, fund transfer can be retried
    }

    // ── 8. Create Fixed Deposit ──
    try {
      const fdProductId = await this.fineractService.resolveFDProductFromLoanProduct(loan.productId);

      if (fdProductId) {
        const externalId = `FD_${contract.contractId}`;
        const fdResult = await this.fineractService.createFixedDeposit(
          lenderClientId,
          fdProductId,
          investAmount,
          loan.periodMonth,
          externalId,
        );

        // Update contract with FD info
        await this.contractModel.findByIdAndUpdate(contract._id, {
          $set: {
            fineractFDAccountId: fdResult.accountId,
            fineractFDAccountNo: fdResult.accountNo,
            fineractFDProductId: fdProductId,
            fdInterestRate: loan.monthlyRatePercent * 12, // Annual rate
            fdStatus: 'active',
          },
        });

        this.logger.log(`FD created: accountId=${fdResult.accountId} for contract ${contract.contractId}`);
      } else {
        this.logger.warn(`No FD product found for loan product ${loan.productId}, skipping FD creation`);
      }
    } catch (error: any) {
      this.logger.error(`FD creation failed: ${error.message}. Contract created without FD.`);
    }

    // ── 9. Check Full Match & Auto-disbursement ──
    const isFullMatch = (contract as any)._isFullMatch;
    const contractLoanId = (contract as any)._loanApplicationId;
    if (isFullMatch && contractLoanId) {
      this.logger.log(`🎯 FULL MATCH detected for loan ${contractLoanId}! Checking if borrower signed the contract...`);
      try {
        const loanContractModel = this.loanModel.db.model('LoanContract');
        const borrowerContract = await loanContractModel.findOne({ loanId: contractLoanId });
        
        if (borrowerContract?.status === 'signed') {
           this.logger.log(`Borrower already signed, triggering auto-disbursement...`);
           this.handleFullMatchDisbursement(contractLoanId, lenderId).catch(err => {
             this.logger.error(`Auto-disbursement failed (non-blocking): ${err.message}`);
           });
        } else {
           this.logger.log(`Borrower HAS NOT signed yet. Waiting for signature...`);
           if (borrowerContract) {
             const notifModel = this.loanModel.db.model('Notification');
             await notifModel.create({
                userId: borrowerContract.userId,
                title: 'Khoản vay đã đủ 100% vốn',
                message: `Khoản vay của bạn đã được đầu tư đủ vốn. Vui lòng ký chữ ký điện tử để hệ thống giải ngân.`,
                type: 'loan_fully_funded',
                data: { loanId: contractLoanId, contractId: borrowerContract.contractId }
             });
           }
        }
      } catch (err: any) {
         this.logger.error(`Failed to check borrower signature: ${err.message}`);
      }
    }

    // ── 10. Return updated contract ──
    const updatedContract = await this.contractModel
      .findById(contract._id)
      .populate('loanApplicationId', 'willing capital periodMonth monthlyRatePercent status');
    return updatedContract || contract;
  }

  // ═══════════════════════════════════════════════════════
  //  LENDER BALANCE
  // ═══════════════════════════════════════════════════════

  /**
   * Get lender's investment wallet balance from Fineract.
   */
  async getLenderBalance(lenderId: string): Promise<{
    walletBalance: number;
    totalInvested: number;
    availableBalance: number;
  }> {
    const lender = await this.userModel.findById(lenderId);
    if (!lender || !lender.fineractClientId) {
      return { walletBalance: 0, totalInvested: 0, availableBalance: 0 };
    }

    const lenderClientId = Number(lender.fineractClientId);
    const eWallet = await this.fineractService.getActiveEWalletAccount(lenderClientId);
    const walletBalance = eWallet?.summary?.accountBalance || 0;

    // Total invested = sum of active contract capitals
    const activeContracts = await this.contractModel.find({
      lenderId: new Types.ObjectId(lenderId),
      status: { $in: ['pending', 'active'] },
    });
    const totalInvested = activeContracts.reduce((sum, c) => sum + c.capital, 0);

    return {
      walletBalance,
      totalInvested,
      availableBalance: walletBalance,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  AUTO-DISBURSEMENT (học từ HD-AMC P2P: handleFullMatchDisbursement)
  // ═══════════════════════════════════════════════════════

  /**
   * Khi khoản vay đã đủ 100% vốn (investedNotes >= totalNotes):
   * 1. Approve loan trên Fineract
   * 2. Disburse loan trên Fineract
   * 3. Transfer escrow → borrower savings
   * 4. Update loan status → disbursed
   * 5. Update tất cả InvestmentContract → active
   * 
   * Non-blocking: catch tất cả errors, KHÔNG throw.
   * Học theo HD-AMC P2P: InvestContractService.handleFullMatchDisbursement()
   */
  async handleFullMatchDisbursement(loanApplicationId: string, triggerLenderId?: string): Promise<void> {
    const logPrefix = '[AutoDisburse]';

    try {
      const loan = await this.loanModel.findById(loanApplicationId);
      if (!loan) {
        this.logger.error(`${logPrefix} Không tìm thấy khoản vay ${loanApplicationId}`);
        return;
      }

      const fineractLoanId = loan.fineractLoanId;
      if (!fineractLoanId) {
        this.logger.warn(`${logPrefix} Loan ${loanApplicationId} chưa có fineractLoanId, bỏ qua auto-disburse`);
        return;
      }

      // ── Step 1: Approve loan trên Fineract ──
      try {
        await this.fineractService.approveLoan(fineractLoanId);
        this.logger.log(`${logPrefix} ✅ Loan ${fineractLoanId} approved trên Fineract`);
      } catch (approveErr: any) {
        const errMsg = JSON.stringify(approveErr.response?.data || approveErr.message);
        const isAlreadyApproved =
          errMsg.includes('already approved') ||
          errMsg.includes('not.submitted.and.pending.state');
        if (isAlreadyApproved) {
          this.logger.warn(`${logPrefix} Loan ${fineractLoanId} đã được approve trước đó, tiếp tục`);
        } else {
          this.logger.error(`${logPrefix} Approve failed: ${errMsg}`);
          throw approveErr;
        }
      }

      // ── Step 2: Disburse loan trên Fineract ──
      try {
        await this.fineractService.disburseLoan(fineractLoanId);
        this.logger.log(`${logPrefix} ✅ Loan ${fineractLoanId} disbursed trên Fineract`);
      } catch (disburseErr: any) {
        const errMsg = JSON.stringify(disburseErr.response?.data || disburseErr.message);
        const isAlreadyDisbursed =
          errMsg.includes('already disbursed') ||
          errMsg.includes('not.approved');
        if (isAlreadyDisbursed) {
          this.logger.warn(`${logPrefix} Loan ${fineractLoanId} đã disbursed trước đó`);
        } else {
          this.logger.error(`${logPrefix} Disburse failed: ${errMsg}`);
          throw disburseErr;
        }
      }

      // ── Step 3: Transfer escrow → borrower savings ──
      try {
        const borrower = await this.userModel.findById(loan.userId).select('fineractClientId').lean();
        const borrowerClientId = borrower?.fineractClientId ? Number(borrower.fineractClientId) : null;
        
        //  Validate: borrower ≠ lender trên Fineract
        if (triggerLenderId) {
          const triggerLender = await this.userModel.findById(triggerLenderId).select('fineractClientId').lean();
          if (triggerLender?.fineractClientId && Number(triggerLender.fineractClientId) === borrowerClientId) {
            this.logger.error(`${logPrefix} CRITICAL: Borrower = Lender trên Fineract (clientId=${borrowerClientId})`);
            return; // Abort disbursement!
          }
        }

        if (borrowerClientId) {
          const platformClientId = this.configService.get<number>('defaults.platformClientId') || 1;
          const platformAccount = await this.fineractService.getActiveEWalletAccount(platformClientId);
          const borrowerAccount = await this.fineractService.getActiveEWalletAccount(borrowerClientId);

          if (platformAccount && borrowerAccount) {
            await this.fineractService.transferFunds(
              platformClientId,
              borrowerClientId,
              platformAccount.id,
              borrowerAccount.id,
              loan.capital,
              `Giải ngân khoản vay ${loanApplicationId}`,
            );
            this.logger.log(`${logPrefix} ✅ Escrow → Borrower: ${loan.capital.toLocaleString()} VND`);
          } else {
            this.logger.warn(`${logPrefix} Missing platform/borrower account, skip escrow transfer`);
          }
        } else {
          this.logger.warn(`${logPrefix} Borrower chưa có fineractClientId, skip escrow transfer`);
        }
      } catch (transferErr: any) {
        this.logger.error(`${logPrefix} Escrow transfer failed (non-blocking): ${transferErr.message}`);
      }

      // ── Step 4: Update loan status → disbursed ──
      await this.loanModel.findByIdAndUpdate(loanApplicationId, {
        $set: {
          status: 'disbursed',
          fineractStatusString: 'ACTIVE',
        },
      });
      this.logger.log(`${logPrefix} ✅ Loan ${loanApplicationId} status → disbursed`);

      // ── Step 5: Update tất cả InvestmentContract → active ──
      const updateResult = await this.contractModel.updateMany(
        {
          loanApplicationId: new Types.ObjectId(loanApplicationId),
          status: 'pending',
        },
        {
          $set: { status: 'active' },
        },
      );
      this.logger.log(
        `${logPrefix} ✅ ${updateResult.modifiedCount} InvestmentContracts → active`,
      );

      this.logger.log(`${logPrefix} 🎉 Auto-disbursement completed for loan ${loanApplicationId}`);
    } catch (error: any) {
      this.logger.error(`${logPrefix} ❌ Auto-disbursement failed for loan ${loanApplicationId}: ${error.message}`);
      // Non-blocking — investment vẫn thành công, disbursement sẽ retry manual
    }
  }
}
