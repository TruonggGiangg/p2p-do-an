/**
 * InvestPaymentService — Full investment flow with Fineract payment
 * ──────────────────────────────────────────────────────────
 * Handles: Validation → Balance check → Create contract → Transfer funds → Create FD → Update contract
 * Payment method: Fineract e-wallet only (no USDT, no internal wallet, no blockchain).
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';

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
    private readonly moduleRef: ModuleRef,
  ) {
    this.baseUnitPrice = this.configService.get<number>('invest.baseUnitPrice') || 500_000;
  }

  private async getLoanContractByLoanId(loanApplicationId: string) {
    const loanContractModel: any = this.loanModel.db.model('LoanContract');
    const loanId = Types.ObjectId.isValid(loanApplicationId)
      ? new Types.ObjectId(loanApplicationId)
      : loanApplicationId;

    const contract = await loanContractModel
      .findOne({ loanId })
      .select('_id contractId loanId userId status smartCASignatureVerified signatureProvider signatureVerifiedAt')
      .lean()
      .exec();
    return contract;
  }

  private async isSmartCASignatureVerified(contract: any): Promise<boolean> {
    if (!contract) return false;
    if (contract.smartCASignatureVerified === true) return true;

    try {
      const signatureModel: any = this.loanModel.db.model('DigitalSignature');
      const latestSmartCASignature: any = await signatureModel
        .findOne({
          provider: 'vnpt_smartca',
          status: 'signed',
          $or: [{ contractId: contract._id }, { contractCode: contract.contractId }],
        })
        .sort({ completedAt: -1 })
        .select('_id completedAt')
        .lean();

      if (!latestSmartCASignature) return false;

      const loanContractModel: any = this.loanModel.db.model('LoanContract');
      await loanContractModel.updateOne(
        { _id: contract._id },
        {
          $set: {
            smartCASignatureVerified: true,
            signatureProvider: 'vnpt_smartca',
            signatureVerifiedAt: latestSmartCASignature?.completedAt || new Date(),
          },
        },
      );

      return true;
    } catch (err: any) {
      this.logger.warn(`[AutoDisburse] SmartCA verification check failed: ${err.message}`);
      return false;
    }
  }

  private async notifyBorrowerToSignSmartCA(contract: any, loanApplicationId: string): Promise<void> {
    if (!contract?.userId) return;

    try {
      const notifModel: any = this.loanModel.db.model('Notification');
      await notifModel.create({
        userId: contract.userId,
        title: 'Khoản vay đã đủ 100% vốn',
        message: 'Khoản vay đã đủ vốn nhưng chưa có chữ ký SmartCA hợp lệ. Vui lòng ký SmartCA để hệ thống giải ngân.',
        type: 'general',
        data: {
          loanId: loanApplicationId,
          contractId: contract.contractId,
          requiredSignatureProvider: 'vnpt_smartca',
        },
      });
    } catch (err: any) {
      this.logger.warn(`[AutoDisburse] Failed to notify borrower for SmartCA signing: ${err.message}`);
    }
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
    const LOG = '[processInvestment]';
    const investAmount = numNotes * this.baseUnitPrice;

    this.logger.log(`${LOG} ════════════════════════════════════════════`);
    this.logger.log(`${LOG} 🚀 BẮT ĐẦU xử lý đầu tư`);
    this.logger.log(`${LOG} Input: lenderId=${lenderId}, loanId=${loanApplicationId}, numNotes=${numNotes}, orderId=${investmentOrderId || 'N/A'}`);
    this.logger.log(`${LOG} investAmount = ${numNotes} notes × ${this.baseUnitPrice.toLocaleString()} = ${investAmount.toLocaleString()} VND`);

    // ── 1. Validate lender ──
    this.logger.log(`${LOG} [Step 1/10] Validating lender...`);
    const lender = await this.userModel.findById(lenderId).select('fineractClientId fullName email phone').lean();
    if (!lender) throw new NotFoundException('Không tìm thấy người dùng');
    if (!lender.fineractClientId) {
      throw new BadRequestException('Lender chưa liên kết Fineract. Vui lòng đồng bộ ví trước.');
    }
    this.logger.log(`${LOG} ✅ Lender OK: name=${(lender as any).fullName || 'N/A'}, fineractClientId=${lender.fineractClientId}`);

    // ── 2. Validate loan ──
    this.logger.log(`${LOG} [Step 2/10] Validating loan...`);
    const loan = await this.loanModel
      .findById(loanApplicationId)
      .select('_id capital status willing periodMonth monthlyRatePercent productId nodeMatch investedNotes totalNotes')
      .lean();
    if (!loan) throw new NotFoundException('Không tìm thấy khoản vay');
    if (!['approved', 'disbursed'].includes(loan.status)) {
      throw new BadRequestException('Khoản vay không ở trạng thái cho phép đầu tư');
    }
    this.logger.log(`${LOG} ✅ Loan OK: id=${loan._id}, capital=${(loan.capital || 0).toLocaleString()}, status=${loan.status}, productId=${loan.productId}, period=${loan.periodMonth}m, rate=${loan.monthlyRatePercent}%/tháng`);
    this.logger.log(`${LOG}    Loan state: investedNotes=${(loan as any).investedNotes || 0}, nodeMatch=${(loan as any).nodeMatch || 0}, totalNotes=${(loan as any).totalNotes || 'N/A'}`);

    // ── 3. Check duplicate investment (DISABLED BY BUSINESS RULE) ──
    // Người dùng được quyền phân bổ vốn nhiều lần vào một khoản vay nếu muốn

    // ── 4. Check available notes (must consider BOTH nodeMatch and investedNotes) ──
    this.logger.log(`${LOG} [Step 4/10] Checking available notes...`);
    const totalLoanNotes = Math.ceil(loan.capital / this.baseUnitPrice);
    const investedSoFar = (loan as any).investedNotes || 0;
    const nodeMatchSoFar = (loan as any).nodeMatch || 0;

    let effectiveNodeMatch = nodeMatchSoFar;
    if (investmentOrderId) {
      const order = await this.orderModel.findById(investmentOrderId);
      if (order) {
        const matchedLoan = (order as any).loans?.find((l: any) => String(l.loanId) === String(loan._id));
        const orderMatchedNodes = matchedLoan?.nodeMatch || 0;
        this.logger.log(`${LOG}    Order ${investmentOrderId} matched ${orderMatchedNodes} nodes cho loan này`);

        // Bắt buộc thanh toán đúng số slot đã giữ của khoản vay này
        if (numNotes !== orderMatchedNodes) {
          throw new BadRequestException(
            `Bạn đã giữ ${orderMatchedNodes} chỗ cho khoản vay này, vui lòng thanh toán đúng số lượng hoặc hủy lệnh.`,
          );
        }

        effectiveNodeMatch = Math.max(0, nodeMatchSoFar - orderMatchedNodes);
      }
    }

    const availableNotes = totalLoanNotes - investedSoFar - effectiveNodeMatch;
    this.logger.log(`${LOG}    totalLoanNotes=${totalLoanNotes}, investedSoFar=${investedSoFar}, effectiveNodeMatch=${effectiveNodeMatch}, available=${availableNotes}, requested=${numNotes}`);
    if (numNotes > availableNotes) {
      throw new BadRequestException(`Chỉ còn ${availableNotes} notes khả dụng (yêu cầu ${numNotes})`);
    }
    this.logger.log(`${LOG} ✅ Available notes OK`);

    // ── 5. Check wallet balance ──
    this.logger.log(`${LOG} [Step 5/10] Checking wallet balance on Fineract...`);
    const lenderClientId = Number(lender.fineractClientId);
    const eWallet = await this.fineractService.getActiveEWalletAccount(lenderClientId);
    if (!eWallet) {
      this.logger.error(`${LOG} ❌ Lender clientId=${lenderClientId} không có ví e-wallet active trên Fineract`);
      throw new BadRequestException('Lender chưa có ví điện tử active trên Fineract');
    }

    const walletBalance = eWallet.summary?.accountBalance || 0;
    this.logger.log(`${LOG}    Wallet: accountId=${eWallet.id}, accountNo=${eWallet.accountNo || 'N/A'}, balance=${walletBalance.toLocaleString()} VND`);
    this.logger.log(`${LOG}    Required: ${investAmount.toLocaleString()} VND → ${walletBalance >= investAmount ? '✅ ĐỦ' : '❌ KHÔNG ĐỦ'}`);
    if (walletBalance < investAmount) {
      throw new BadRequestException(
        `Số dư ví không đủ. Cần: ${investAmount.toLocaleString()} VND, Hiện có: ${walletBalance.toLocaleString()} VND`,
      );
    }

    // ── 6. Create InvestmentContract (MongoDB) ──
    this.logger.log(`${LOG} [Step 6/10] Creating InvestmentContract in MongoDB...`);
    const contract = await this.contractService.createContract(
      lenderId,
      loanApplicationId,
      numNotes,
      investmentOrderId,
    );
    this.logger.log(`${LOG} ✅ Contract created: contractId=${contract.contractId}, _id=${contract._id}, capital=${investAmount.toLocaleString()} VND`);

    // Track payment status for this contract
    let transferSuccess = false;
    let fdSuccess = false;
    let transferError: string | null = null;
    let fdError: string | null = null;

    // ── 7. Trừ tiền ví nhà đầu tư (Withdraw) ──
    // Chỉ trừ tiền từ ví lender, việc giải ngân cho người vay là nhiệm vụ ngân hàng
    this.logger.log(`${LOG} [Step 7/10] 💸 Trừ tiền ví nhà đầu tư...`);
    try {
      this.logger.log(`${LOG}    Withdraw: walletId=${eWallet.id}, amount=${investAmount.toLocaleString()} VND`);

      const withdrawResult = await this.fineractService.withdrawFromSavings(
        eWallet.id,
        investAmount,
        `Đầu tư P2P - HĐ ${contract.contractId}`,
      );
      transferSuccess = true;
      this.logger.log(`${LOG} ✅ Withdraw SUCCESS: transactionId=${withdrawResult?.transactionId || 'N/A'}, amount=${investAmount.toLocaleString()} VND`);

      // Verify new balance
      const newWallet = await this.fineractService.getActiveEWalletAccount(lenderClientId);
      const newBalance = newWallet?.summary?.accountBalance || 0;
      this.logger.log(`${LOG}    Số dư ví sau trừ: ${newBalance.toLocaleString()} VND (giảm ${(walletBalance - newBalance).toLocaleString()} VND)`);
    } catch (error: any) {
      transferError = error.message;
      const errorDetail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      this.logger.error(`${LOG} ❌ Withdraw FAILED: ${errorDetail}`);

      // ROLLBACK: Xóa contract + hoàn investedNotes trên loan
      this.logger.error(`${LOG}    🔄 ROLLBACK: Xóa contract ${contract.contractId} và hoàn lại notes...`);
      try {
        await this.contractModel.deleteOne({ _id: contract._id });
        await this.loanModel.findByIdAndUpdate(loanApplicationId, {
          $inc: { investedNotes: -numNotes },
        });

        // Recalculate matchPercentage after rollback
        const rollbackLoan = await this.loanModel.findById(loanApplicationId).lean();
        if (rollbackLoan) {
          const totalClaimed = ((rollbackLoan as any).investedNotes || 0) + ((rollbackLoan as any).nodeMatch || 0);
          const matchPct = Math.min(100, Math.round((totalClaimed / (rollbackLoan as any).totalNotes) * 100));
          const isFull = ((rollbackLoan as any).investedNotes || 0) >= (rollbackLoan as any).totalNotes;
          await this.loanModel.updateOne({ _id: loanApplicationId }, { $set: { isFullMatch: isFull, matchPercentage: matchPct } });
        }

        this.logger.log(`${LOG}    ✅ Rollback thành công: contract đã xóa, investedNotes đã hoàn`);
      } catch (rollbackErr: any) {
        this.logger.error(`${LOG}    ❌ ROLLBACK FAILED: ${rollbackErr.message}. DỮ LIỆU KHÔNG NHẤT QUÁN!`);
      }

      throw new BadRequestException(`Không thể trừ tiền từ ví. Lỗi: ${error.message}. Vui lòng thử lại.`);
    }

    // ── 8. Create Fixed Deposit ──
    this.logger.log(`${LOG} [Step 8/10] 📈 Creating Fixed Deposit on Fineract...`);
    try {
      this.logger.log(`${LOG}    Resolving FD product from loan productId=${loan.productId}...`);
      const fdProductId = await this.fineractService.resolveFDProductFromLoanProduct(loan.productId);
      this.logger.log(`${LOG}    FD product resolved: fdProductId=${fdProductId || 'NULL (không tìm thấy)'}`);

      if (fdProductId) {
        const externalId = `FD_${contract.contractId}`;
        this.logger.log(`${LOG}    Creating FD: clientId=${lenderClientId}, fdProductId=${fdProductId}, amount=${investAmount.toLocaleString()}, period=${loan.periodMonth}m, externalId=${externalId}`);

        const fdResult = await this.fineractService.createFixedDeposit(
          lenderClientId,
          fdProductId,
          investAmount,
          loan.periodMonth,
          externalId,
        );

        this.logger.log(`${LOG} ✅ FD CREATED: accountId=${fdResult.accountId}, accountNo=${fdResult.accountNo}, status=${fdResult.status}`);

        // Resolve real FD interest rate (not loan rate)
        let fdAnnualRate = 0;
        try {
          const fdDetails = await this.fineractService.getFixedDepositDetails(fdResult.accountId);
          fdAnnualRate = fdDetails.interestRate || 0;
          this.logger.log(`${LOG}    FD actual rate from Fineract: ${fdAnnualRate}% /năm`);
        } catch (rateErr: any) {
          this.logger.warn(`${LOG}    Không thể lấy FD rate từ account details, fallback dùng loan rate: ${rateErr.message}`);
          fdAnnualRate = loan.monthlyRatePercent * 12;
        }

        // Update contract with FD info
        await this.contractModel.findByIdAndUpdate(contract._id, {
          $set: {
            fineractFDAccountId: fdResult.accountId,
            fineractFDAccountNo: fdResult.accountNo,
            fineractFDProductId: fdProductId,
            fdInterestRate: fdAnnualRate,
            fdStatus: 'active',
          },
        });
        fdSuccess = true;
        this.logger.log(`${LOG}    Contract updated with FD info: fdAccountId=${fdResult.accountId}, fdRate=${fdAnnualRate}%/năm`);
      } else {
        fdError = `No FD product found matching loan product ${loan.productId}`;
        this.logger.warn(`${LOG} ⚠️ Không tìm thấy FD product cho loan product ${loan.productId} → SKIP tạo FD`);
      }
    } catch (error: any) {
      fdError = error.message;
      const errorDetail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      this.logger.error(`${LOG} ❌ FD creation FAILED: ${errorDetail}`);
      this.logger.error(`${LOG}    Contract ${contract.contractId} sẽ KHÔNG có tài khoản FD trên Fineract`);
    }

    // ── 8.5 Update payment status on contract ──
    const paymentStatus = transferSuccess && fdSuccess ? 'completed' : transferSuccess ? 'partial_fd_failed' : 'transfer_failed';
    this.logger.log(`${LOG} [Step 8.5] Payment status: transfer=${transferSuccess ? '✅' : '❌'}, fd=${fdSuccess ? '✅' : '❌'} → paymentStatus="${paymentStatus}"`);
    await this.contractModel.findByIdAndUpdate(contract._id, {
      $set: {
        paymentStatus,
        ...(paymentStatus !== 'completed' ? { paymentError: transferError || fdError || 'Unknown error' } : { paymentError: null }),
      },
    });
    if (paymentStatus !== 'completed') {
      this.logger.warn(`${LOG}    ⚠️ Contract ${contract.contractId} marked as paymentStatus="${paymentStatus}", error="${transferError || fdError}"`);
    } else {
      this.logger.log(`${LOG}    ✅ Contract ${contract.contractId} paymentStatus="completed" — Transfer + FD đều OK`);
    }

    // ── 9. Check Full Match & Auto-disbursement ──
    const isFullMatch = (contract as any)._isFullMatch;
    const contractLoanId = (contract as any)._loanApplicationId;
    this.logger.log(`${LOG} [Step 9/10] Full match check: isFullMatch=${isFullMatch}, loanId=${contractLoanId || 'N/A'}`);

    if (isFullMatch && contractLoanId) {
      this.logger.log(`${LOG} 🎯 FULL MATCH detected for loan ${contractLoanId}! Checking SmartCA signature...`);
      try {
        const borrowerContract = await this.getLoanContractByLoanId(String(contractLoanId));
        if (!borrowerContract) {
          this.logger.warn(`${LOG}    Chưa có loan contract cho loan ${contractLoanId}. Chờ người vay tạo hợp đồng.`);
        } else {
          const smartCAVerified = await this.isSmartCASignatureVerified(borrowerContract);
          const contractSigned = ['signed', 'active'].includes(String(borrowerContract.status || ''));
          this.logger.log(`${LOG}    Borrower contract: id=${borrowerContract._id}, status=${borrowerContract.status}, smartCA=${smartCAVerified}, signed=${contractSigned}`);

          if (contractSigned && smartCAVerified) {
            this.logger.log(`${LOG} 🚀 Triggering auto-disbursement...`);
            this.handleFullMatchDisbursement(String(contractLoanId), lenderId).catch(err => {
              this.logger.error(`${LOG} ❌ Auto-disbursement failed (non-blocking): ${err.message}`);
            });
          } else {
            this.logger.log(`${LOG}    Chưa đủ điều kiện giải ngân → Gửi thông báo cho người vay ký SmartCA`);
            await this.notifyBorrowerToSignSmartCA(borrowerContract, String(contractLoanId));
          }
        }
      } catch (err: any) {
        this.logger.error(`${LOG} ❌ Failed to check borrower signature: ${err.message}`);
      }
    }

    // ── 10. Return updated contract ──
    this.logger.log(`${LOG} [Step 10/10] Fetching final contract...`);
    const updatedContract = await this.contractModel
      .findById(contract._id)
      .populate('loanApplicationId', 'willing capital periodMonth monthlyRatePercent status');

    this.logger.log(`${LOG} ════════════════════════════════════════════`);
    this.logger.log(`${LOG} 🏁 ĐẦU TƯ HOÀN TẤT`);
    this.logger.log(`${LOG}    Contract: ${contract.contractId}`);
    this.logger.log(`${LOG}    Số tiền: ${investAmount.toLocaleString()} VND (${numNotes} notes)`);
    this.logger.log(`${LOG}    Transfer: ${transferSuccess ? '✅ OK' : `❌ ${transferError}`}`);
    this.logger.log(`${LOG}    FD: ${fdSuccess ? '✅ OK' : `❌ ${fdError}`}`);
    this.logger.log(`${LOG}    Full Match: ${isFullMatch ? '🎯 YES' : 'No'}`);
    this.logger.log(`${LOG} ════════════════════════════════════════════`);

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
      status: { $in: ['pending', 'pending_signature', 'active'] },
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

      if (loan.status === 'disbursed') {
        this.logger.log(`${logPrefix} Loan ${loanApplicationId} đã disbursed trước đó, bỏ qua`);
        return;
      }

      const totalNotes = Math.max(
        1,
        Number((loan as any).totalNotes || Math.ceil((loan.capital || 0) / this.baseUnitPrice)),
      );
      const investedNotes = Number((loan as any).investedNotes || 0);
      const fullMatchByFunding = investedNotes >= totalNotes;
      if (!fullMatchByFunding || (loan as any).isFullMatch !== true) {
        this.logger.warn(
          `${logPrefix} Loan ${loanApplicationId} chưa đủ điều kiện vốn: investedNotes=${investedNotes}/${totalNotes}, isFullMatch=${(loan as any).isFullMatch}`,
        );
        return;
      }

      const borrowerContract = await this.getLoanContractByLoanId(loanApplicationId);
      if (!borrowerContract) {
        this.logger.warn(`${logPrefix} Loan ${loanApplicationId} chưa có hợp đồng vay, không thể giải ngân`);
        return;
      }

      if (!['signed', 'active'].includes(String(borrowerContract.status || ''))) {
        this.logger.warn(
          `${logPrefix} Loan ${loanApplicationId} chưa đủ điều kiện chữ ký: contractStatus=${borrowerContract.status}`,
        );
        await this.notifyBorrowerToSignSmartCA(borrowerContract, loanApplicationId);
        return;
      }

      const smartCAVerified = await this.isSmartCASignatureVerified(borrowerContract);
      if (!smartCAVerified) {
        this.logger.warn(`${logPrefix} Loan ${loanApplicationId} chưa có chữ ký SmartCA hợp lệ. Không disburse.`);
        await this.notifyBorrowerToSignSmartCA(borrowerContract, loanApplicationId);
        return;
      }

      // ── Step 1: Approve loan trên Fineract ──
      try {
        await this.fineractService.approveLoan(fineractLoanId);
        this.logger.log(`${logPrefix} ✅ Loan ${fineractLoanId} approved trên Fineract`);
      } catch (approveErr: any) {
        const errMsg = JSON.stringify(approveErr.response?.data || approveErr.message);
        const isAlreadyApproved =
          errMsg.includes('already approved') || errMsg.includes('not.submitted.and.pending.state');
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
        const isAlreadyDisbursed = errMsg.includes('already disbursed') || errMsg.includes('not.approved');
        if (isAlreadyDisbursed) {
          this.logger.warn(`${logPrefix} Loan ${fineractLoanId} đã disbursed trước đó`);
        } else {
          this.logger.error(`${logPrefix} Disburse failed: ${errMsg}`);
          throw disburseErr;
        }
      }

      // ── Step 3: Deposit tiền vào ví người vay ──
      try {
        this.logger.log(`${logPrefix} [Step 3] 💰 Deposit vào ví người vay...`);
        const disbursementWalletId = (loan as any).disbursementWalletId;

        if (!disbursementWalletId) {
          this.logger.warn(`${logPrefix}    ⚠️ Loan không có disbursementWalletId, skip deposit`);
        } else {
          // Tìm wallet trong MongoDB để lấy fineractSavingsId
          const disbursementWallet = await this.walletModel.findById(disbursementWalletId).lean();

          if (!disbursementWallet) {
            this.logger.warn(`${logPrefix}    ⚠️ Wallet ${disbursementWalletId} không tìm thấy trong DB, skip deposit`);
          } else {
            const borrowerSavingsId = Number(disbursementWallet.fineractSavingsId);
            this.logger.log(`${logPrefix}    Wallet: mongoId=${disbursementWalletId}, fineractSavingsId=${borrowerSavingsId}`);

            const depositResult = await this.fineractService.depositToSavings(
              borrowerSavingsId,
              loan.capital,
              `Giải ngân khoản vay ${loanApplicationId}`,
            );
            this.logger.log(`${logPrefix} ✅ Deposit SUCCESS: transactionId=${depositResult?.transactionId}, amount=${loan.capital.toLocaleString()} VND → ví ${borrowerSavingsId}`);
          }
        }
      } catch (depositErr: any) {
        this.logger.error(`${logPrefix} ❌ Deposit vào ví người vay thất bại (non-blocking): ${depositErr.message}`);
      }

      // ── Step 4: Update loan status → disbursed ──
      await this.loanModel.findByIdAndUpdate(loanApplicationId, {
        $set: {
          status: 'disbursed',
          fineractStatusString: 'ACTIVE',
        },
      });
      this.logger.log(`${logPrefix} ✅ Loan ${loanApplicationId} status → disbursed`);

      // Keep borrower loan contract in active state after successful disbursement.
      try {
        const loanContractModel = this.loanModel.db.model('LoanContract');
        await loanContractModel.updateOne(
          { _id: borrowerContract._id, status: 'signed' },
          { $set: { status: 'active' } },
        );
      } catch (err: any) {
        this.logger.warn(`${logPrefix} Failed to update borrower loan contract status: ${err.message}`);
      }

      // ── Step 5: Update tất cả InvestmentContract → active ──
      const updateResult = await this.contractModel.updateMany(
        {
          loanApplicationId: new Types.ObjectId(loanApplicationId),
          status: { $in: ['pending', 'pending_signature'] },
        },
        {
          $set: { status: 'active' },
        },
      );
      this.logger.log(`${logPrefix} ✅ ${updateResult.modifiedCount} InvestmentContracts → active`);

      this.logger.log(`${logPrefix} 🎉 Auto-disbursement completed for loan ${loanApplicationId}`);

      // ── Step 6: Sync status to Blockchain ──
      try {
        let fabricService: any;
        try {
          // FabricModule is @Global — resolve class token via require (avoid TS import issues with fabric-network)
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { FabricService: FabricSvc } = require('../fabric/fabric.service');
          fabricService = this.moduleRef.get(FabricSvc, { strict: false });
        } catch (e: any) {
          this.logger.warn(`${logPrefix} [Blockchain] Cannot resolve FabricService: ${e.message}`);
        }

        if (!fabricService) {
          this.logger.warn(`${logPrefix} [Blockchain] FabricService not available, skipping sync`);
        } else if (!fabricService.isConnected()) {
          this.logger.warn(`${logPrefix} [Blockchain] FabricService not connected, skipping sync`);
        } else {
          // Sync LoanContract
          if (borrowerContract?.contractId) {
            await fabricService.submitTransaction(
              'updateLoanStatus',
              borrowerContract.contractId,
              'disbursed',
              JSON.stringify({ disbursementDate: new Date().toISOString() })
            );
            this.logger.log(`${logPrefix} [Blockchain] ✅ Synced LoanContract ${borrowerContract.contractId} → disbursed`);
          }

          // Sync InvestmentContracts
          const activatedContracts = await this.contractModel.find({
            loanApplicationId: new Types.ObjectId(loanApplicationId),
            status: 'active'
          }).select('contractId').lean();

          for (const invContract of activatedContracts) {
            if (invContract.contractId) {
              await fabricService.submitTransaction(
                'updateInvestmentStatus',
                invContract.contractId,
                'active',
                JSON.stringify({})
              );
            }
          }
          this.logger.log(`${logPrefix} [Blockchain] ✅ Synced ${activatedContracts.length} InvestmentContracts → active`);
        }
      } catch (bcError: any) {
        this.logger.warn(`${logPrefix} [Blockchain] Failed to sync status: ${bcError.message}`);
      }

    } catch (error: any) {
      this.logger.error(`${logPrefix} ❌ Auto-disbursement failed for loan ${loanApplicationId}: ${error.message}`);
      // Non-blocking — investment vẫn thành công, disbursement sẽ retry manual
    }
  }
}
