import { Injectable, Logger, BadRequestException, NotFoundException, Inject, forwardRef, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { FineractLoanService } from '../fineract/services/fineract-loan.service';
import { PREPAYMENT_PENALTY_CHARGE_ID } from '../fineract/fineract.constants';
import { FineractSavingsService } from '../fineract/services/fineract-savings.service';
import { WalletsService } from '../wallets/wallets.service';
import { AdminService } from '../admin/admin.service';
import { LoanApplication } from './schemas/loan-application.schema';
import { Notification } from './schemas/notification.schema';
import { User } from '../users/schemas/user.schema';
import { CreditScoreService } from '../credit-score/credit-score.service';
import { FabricService } from '../fabric/fabric.service';
import { LoanContract } from './schemas/loan-contract.schema';
import { LoanDelinquency } from '../delinquency/entities/loan-delinquency.schema';

/**
 * RepaymentService - Xử lý thanh toán khoản vay (repayment & prepayment)
 *
 * Flow:
 * 1. Kiểm tra ownership (loan thuộc user)
 * 2. Kiểm tra loan status (phải là 'disbursed' hoặc active trên Fineract)
 * 3. Gọi Fineract repayment API
 * 4. Chuyển tiền từ ví borrower (nếu có)
 * 5. Lưu lịch sử thanh toán vào MongoDB
 *
 * NOTE: Phí giao dịch được lấy động từ Fineract product charges, không hardcode.
 * NOTE: Bước phân phối cho nhà đầu tư (lender distribution) chưa implement.
 */
@Injectable()
export class RepaymentService {
  private readonly logger = new Logger(RepaymentService.name);

  constructor(
    private readonly fineractLoanService: FineractLoanService,
    private readonly fineractSavingsService: FineractSavingsService,
    private readonly walletsService: WalletsService,
    @Inject(forwardRef(() => AdminService)) private readonly adminService: AdminService,
    @InjectModel(LoanApplication.name) private readonly loanApplicationModel: Model<LoanApplication>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
    @InjectModel(LoanContract.name) private readonly loanContractModel: Model<LoanContract>,
    @InjectModel(LoanDelinquency.name) private readonly loanDelinquencyModel: Model<LoanDelinquency>,
    private readonly creditScoreService: CreditScoreService,
    @Optional() private readonly fabricService: FabricService,
  ) {}

  /**
   * Helper: Trừ tiền từ ví e-wallet của borrower trước khi gọi Fineract repay/prepay.
   * Throws nếu ví không đủ tiền.
   */
  private async deductFromBorrowerWallet(
    userId: string,
    amount: number,
    note: string,
    metadata?: { loanId?: string; fineractLoanId?: number; type?: string },
  ): Promise<{ walletTxId: number; savingsId: number }> {
    // 1. Tìm user → fineractClientId
    const user = await this.userModel.findById(userId);
    if (!user?.fineractClientId) {
      throw new BadRequestException('Người dùng chưa liên kết tài khoản Fineract');
    }

    // 2. Tìm ví e-wallet active
    const eWallet = await this.fineractSavingsService.getActiveEWalletAccount(Number(user.fineractClientId));
    if (!eWallet) {
      throw new BadRequestException('Không tìm thấy ví điện tử. Vui lòng tạo ví trước.');
    }

    // 3. Kiểm tra số dư
    const balance = eWallet.summary?.accountBalance ?? 0;
    if (balance < amount) {
      throw new BadRequestException(
        `Số dư ví không đủ. Hiện tại: ${balance.toLocaleString('vi-VN')} đ, cần: ${amount.toLocaleString('vi-VN')} đ`,
      );
    }

    // 4. Withdrawal từ savings account
    const result = await this.fineractSavingsService.withdrawFromSavings(eWallet.id, amount, note);
    this.logger.log(`[deductFromBorrowerWallet] Deducted ${amount} from savings ${eWallet.id} for user ${userId}`);

    return { walletTxId: result.transactionId, savingsId: eWallet.id };
  }

  /**
   * Thanh toán theo kỳ (Repayment)
   */
  async makeRepayment(userId: string, loanId: string, amount: number, repaymentDate?: string): Promise<any> {
    const today = this.fineractLoanService.getTodayFormatted();
    this.logger.log(
      `[makeRepayment] START | userId=${userId} loanId=${loanId} amount=${amount} repaymentDateBody=${repaymentDate} getTodayFormatted=${today}`,
    );

    // 1. Validate input
    if (!amount || amount <= 0) {
      throw new BadRequestException('Số tiền thanh toán phải lớn hơn 0');
    }

    // 2. Tìm loan trong MongoDB
    const loan = await this.findAndValidateLoan(userId, loanId);
    const fineractLoanId = loan.fineractLoanId;
    if (!fineractLoanId) {
      throw new BadRequestException('Khoản vay chưa được tạo trên Fineract');
    }

    // 3. Kiểm tra dư nợ trên Fineract
    const outstanding = await this.fineractLoanService.getOutstandingBalance(fineractLoanId);
    if (outstanding.totalOutstanding <= 0) {
      throw new BadRequestException('Khoản vay đã được thanh toán hoàn tất');
    }
    if (amount > outstanding.totalOutstanding) {
      throw new BadRequestException(
        `Số tiền thanh toán (${amount}) vượt quá dư nợ còn lại (${outstanding.totalOutstanding}). Hãy sử dụng tính năng Tất Toán nếu muốn trả hết.`,
      );
    }

    // 4. Trừ tiền từ ví borrower
    try {
      await this.deductFromBorrowerWallet(userId, amount, `Thanh toán kỳ hạn khoản vay (MongoDB: ${loanId})`, {
        loanId,
        fineractLoanId,
        type: 'repayment',
      });
    } catch (walletErr: any) {
      this.logger.error(`[makeRepayment] Wallet deduction failed: ${walletErr.message}`);
      throw walletErr; // Don't proceed if wallet deduction fails
    }

    // 5. Gọi Fineract repayment API
    // Ưu tiên ngày server (local today) nếu ngày gửi lên bị cũ (stale)
    let date = repaymentDate || today;
    if (repaymentDate && repaymentDate < today) {
      this.logger.warn(
        `[makeRepayment] Client provided date ${repaymentDate} is earlier than server date ${today}. Using server date.`,
      );
      date = today;
    }
    const overdueDays = this.estimateOverdueDays(loan, date);
    let fineractResult: any;
    try {
      fineractResult = await this.fineractLoanService.makeRepayment(
        fineractLoanId,
        amount,
        date,
        `Repayment for MongoDB loan ${loanId}`,
      );
      this.logger.log(`[makeRepayment] Fineract repayment success | transactionId=${fineractResult.transactionId}`);
    } catch (error: any) {
      this.logger.error(`[makeRepayment] Fineract repayment failed: ${error.message}`);
      throw new BadRequestException(`Thanh toán trên Fineract thất bại: ${error.message}`);
    }

    // 5. Kiểm tra nếu loan đã đóng (outstanding = 0)
    let newStatus = loan.status;
    try {
      const updatedOutstanding = await this.fineractLoanService.getOutstandingBalance(fineractLoanId);
      if (updatedOutstanding.totalOutstanding <= 0) {
        newStatus = 'closed' as any;
        this.logger.log(`[makeRepayment] Loan fully paid, marking as closed`);
      }
    } catch (error) {
      console.log(error);
    }

    // 6. Lưu lịch sử thanh toán vào MongoDB
    const repaymentRecord = {
      amount,
      date,
      type: 'repayment',
      fineractTransactionId: fineractResult.transactionId,
      createdAt: new Date(),
    };

    await this.loanApplicationModel.findByIdAndUpdate(loan._id, {
      $push: { repaymentHistory: repaymentRecord },
      ...(newStatus !== loan.status ? { status: newStatus } : {}),
    });

    // Sync loan from Fineract after a short delay so Fineract has time to allocate payment to schedule (principalPaid/interestPaid per period)
    const syncDelayMs = 2000;
    this.logger.log(
      `[makeRepayment] Waiting ${syncDelayMs}ms before sync so Fineract can allocate payment for loan ${fineractLoanId}`,
    );
    await new Promise(r => setTimeout(r, syncDelayMs));
    try {
      await this.adminService.syncLoanFromFineract(fineractLoanId);
      this.logger.log(`[makeRepayment] Post-repayment sync succeeded for loan ${fineractLoanId}`);
    } catch (err: any) {
      this.logger.warn(
        `[makeRepayment] Post-repayment sync failed for loan ${fineractLoanId}: ${err?.message}. Loan schedule in Mongo may show unallocated payment until next manual/cron sync.`,
      );
    }

    // Force-resolve LoanDelinquency nếu loan đã trả hết nợ quá hạn / đã đóng.
    // Tránh trường hợp Fineract phản hồi chậm khiến user vẫn bị chặn vay mới sau khi đã thanh toán.
    try {
      const refreshed = await this.loanApplicationModel
        .findById(loan._id)
        .select('totalOverdue delinquentDays status fineractLoanId userId')
        .lean();
      const noOverdue = (refreshed?.totalOverdue ?? 0) <= 0 && (refreshed?.delinquentDays ?? 0) <= 0;
      const isClosed = newStatus === 'closed' || refreshed?.status === 'closed';

      if (noOverdue || isClosed) {
        const updateRes = await this.loanDelinquencyModel.updateMany(
          {
            fineractLoanId,
            status: { $in: ['overdue', 'defaulted'] },
          },
          {
            $set: {
              status: 'resolved',
              resolvedAt: new Date(),
              debtGroup: 0,
              overdueAmount: 0,
              delinquentDays: 0,
              collectionStage: 'none',
            },
          },
        );
        if (updateRes.modifiedCount > 0) {
          this.logger.log(
            `[makeRepayment] Resolved ${updateRes.modifiedCount} LoanDelinquency record(s) for fineractLoanId=${fineractLoanId} (noOverdue=${noOverdue}, isClosed=${isClosed})`,
          );
        }
      }
    } catch (err: any) {
      this.logger.warn(`[makeRepayment] LoanDelinquency cleanup failed: ${err?.message}`);
    }

    await this.notificationModel
      .create({
        userId: loan.userId,
        title: 'Đã ghi nhận thanh toán',
        message: `Thanh toán ${amount.toLocaleString('vi-VN')} ₫ cho khoản vay đã được ghi nhận (${date}).`,
        type: 'repayment_received',
        data: {
          loanId: loan._id.toString(),
          fineractLoanId,
          amount,
          date,
          transactionId: fineractResult.transactionId,
        },
      })
      .catch(err => this.logger.warn(`[makeRepayment] Notification create failed: ${err?.message}`));

    await this.creditScoreService
      .applyRepaymentEvent({
        userId,
        isLatePayment: overdueDays > 0,
        overdueDays,
        isPrepayment: false,
        isLoanClosed: newStatus === 'closed',
        trigger: 'loan_repayment',
        note: overdueDays > 0 ? `Thanh toán kỳ hạn bị trễ ${overdueDays} ngày` : 'Thanh toán khoản vay đúng hạn',
      })
      .catch(err => this.logger.warn(`[makeRepayment] Credit score update failed: ${err?.message}`));

    this.logger.log(`[makeRepayment] SUCCESS | loanId=${loanId} amount=${amount}`);

    // Ghi nhận lịch sử giao dịch thanh toán vào Blockchain
    if (this.fabricService) {
      try {
        const loanContract = await this.loanContractModel.findOne({ loanId: loan._id }).lean();
        if (loanContract) {
          const settlementId = `SETTLE_${fineractResult.transactionId}_${Date.now()}`;
          const settlementData = {
            loanContractId: loanContract.contractId,
            fineractTransactionId: String(fineractResult.transactionId),
            period: 0, // Period determination left as 0 or handled later
            amountPaid: amount,
            principalPortion: 0,
            interestPortion: 0,
            feePortion: 0,
            penaltyPortion: 0,
            paymentDate: date,
            status: 'completed',
            paymentMethod: 'e_wallet',
          };
          await this.fabricService.submitTransaction('createSettlementContract', settlementId, JSON.stringify(settlementData));
          this.logger.log(`[makeRepayment] Successfully synced settlement to Blockchain: ${settlementId}`);

          // Update LoanContract status on Blockchain if loan is closed
          if (newStatus === 'closed' && loanContract.contractId) {
            await this.fabricService.submitTransaction(
              'updateLoanStatus',
              loanContract.contractId,
              'closed',
              JSON.stringify({ closedAt: new Date().toISOString(), closedBy: 'repayment' })
            );
            this.logger.log(`[makeRepayment] [Blockchain] Synced LoanContract ${loanContract.contractId} → closed`);
          }
        }
      } catch (err: any) {
        this.logger.error(`[makeRepayment] Failed to sync settlement to Blockchain: ${err?.message}`);
      }
    }

    return {
      success: true,
      transactionId: fineractResult.transactionId,
      amount,
      date,
      loanStatus: newStatus,
    };
  }

  /**
   * Lấy số tiền cần trả để tất toán sớm
   */
  async getPrepayAmount(userId: string, loanId: string): Promise<any> {
    this.logger.log(`[getPrepayAmount] START | userId=${userId} loanId=${loanId}`);

    const loan = await this.findAndValidateLoan(userId, loanId);
    if (!loan.fineractLoanId) {
      throw new BadRequestException('Khoản vay chưa được tạo trên Fineract');
    }

    const prepayInfo = await this.fineractLoanService.getPrepaymentAmount(loan.fineractLoanId);

    // Fetch charge config ĐỘNG từ Fineract
    const chargeInfo = await this.getPenaltyChargeInfo();
    const penaltyRate = chargeInfo.rate; // e.g. 0.03 = 3%
    const prepaymentPenalty = Math.round(prepayInfo.principalPortion * penaltyRate);
    const totalWithPenalty = prepayInfo.amount + prepaymentPenalty;
    this.logger.log(
      `[getPrepayAmount] principal=${prepayInfo.principalPortion} penaltyRate=${penaltyRate} (${chargeInfo.name}) penalty=${prepaymentPenalty} totalWithPenalty=${totalWithPenalty}`,
    );

    // Lấy phí từ Fineract product charges
    let charges: any[] = [];
    try {
      charges = await this.fineractLoanService.getProductCharges(loan.productId);
    } catch (error) {
      this.logger.warn(`[getPrepayAmount] Failed to fetch product charges: ${error?.message}`);
    }

    return {
      ...prepayInfo,
      prepaymentPenalty,
      totalWithPenalty,
      penaltyRate: chargeInfo.ratePercent, // e.g. 3 (hiện cho client: "3%")
      penaltyChargeName: chargeInfo.name, // e.g. "Phí phạt tất toán sớm"
      charges,
      loanId: loan._id,
      fineractLoanId: loan.fineractLoanId,
      capital: loan.capital,
    };
  }

  /**
   * Tất toán sớm (Prepayment - trả hết dư nợ)
   */
  async prepayLoan(userId: string, loanId: string, repaymentDate?: string): Promise<any> {
    this.logger.log(`[prepayLoan] START | userId=${userId} loanId=${loanId}`);

    const loan = await this.findAndValidateLoan(userId, loanId);
    if (!loan.fineractLoanId) {
      throw new BadRequestException('Khoản vay chưa được tạo trên Fineract');
    }

    // 1. Lấy số tiền tất toán
    let prepayInfo = await this.fineractLoanService.getPrepaymentAmount(loan.fineractLoanId);
    if (!prepayInfo.amount || prepayInfo.amount <= 0) {
      throw new BadRequestException('Khoản vay đã được thanh toán hoàn tất');
    }

    const today = this.fineractLoanService.getTodayFormatted();
    let date = repaymentDate || today;
    if (repaymentDate && repaymentDate < today) {
      this.logger.warn(
        `[prepayLoan] Client provided date ${repaymentDate} is earlier than server date ${today}. Using server date.`,
      );
      date = today;
    }

    // 1.5. Add phí phạt tất toán sớm vào loan trước khi prepay
    const chargeInfo = await this.getPenaltyChargeInfo();
    const penaltyAmount = Math.round(prepayInfo.principalPortion * chargeInfo.rate);
    if (penaltyAmount > 0) {
      try {
        this.logger.log(
          `[prepayLoan] Adding prepayment penalty: chargeId=${PREPAYMENT_PENALTY_CHARGE_ID} rate=${chargeInfo.ratePercent}% amount=${penaltyAmount} dueDate=${date}`,
        );
        await this.fineractLoanService.addLoanCharge(loan.fineractLoanId, {
          chargeId: PREPAYMENT_PENALTY_CHARGE_ID,
          amount: penaltyAmount,
          dueDate: date,
        });
        // Re-fetch prepay amount (now includes penalty in Fineract calculation)
        prepayInfo = await this.fineractLoanService.getPrepaymentAmount(loan.fineractLoanId);
        this.logger.log(
          `[prepayLoan] Updated prepay amount after penalty: ${prepayInfo.amount} (penalty=${prepayInfo.penaltyPortion})`,
        );
      } catch (chargeError: any) {
        this.logger.warn(`[prepayLoan] Failed to add prepayment penalty charge (non-blocking): ${chargeError.message}`);
        // Continue with prepay even if penalty charge failed
      }
    }

    this.logger.log(
      `[prepayLoan] Prepay amount=${prepayInfo.amount} (principal=${prepayInfo.principalPortion} interest=${prepayInfo.interestPortion} fees=${prepayInfo.feesPortion} penalty=${prepayInfo.penaltyPortion})`,
    );

    // 1.8. Trừ tiền từ ví borrower
    try {
      await this.deductFromBorrowerWallet(userId, prepayInfo.amount, `Tất toán sớm khoản vay (MongoDB: ${loanId})`, {
        loanId,
        fineractLoanId: loan.fineractLoanId,
        type: 'prepayment',
      });
    } catch (walletErr: any) {
      this.logger.error(`[prepayLoan] Wallet deduction failed: ${walletErr.message}`);
      throw walletErr;
    }

    // 2. Gọi Fineract prepay
    let fineractResult: any;
    try {
      fineractResult = await this.fineractLoanService.prepayLoan(
        loan.fineractLoanId,
        prepayInfo.amount,
        date,
        `Prepayment (full settlement) for MongoDB loan ${loanId}`,
      );
      this.logger.log(`[prepayLoan] Fineract prepay success | transactionId=${fineractResult.transactionId}`);
    } catch (error: any) {
      this.logger.error(`[prepayLoan] Fineract prepay failed: ${error.message}`);
      throw new BadRequestException(`Tất toán trên Fineract thất bại: ${error.message}`);
    }

    // 3. Cập nhật MongoDB: status = closed, lưu lịch sử
    const repaymentRecord = {
      amount: prepayInfo.amount,
      date,
      type: 'prepayment',
      fineractTransactionId: fineractResult.transactionId,
      breakdown: {
        principal: prepayInfo.principalPortion,
        interest: prepayInfo.interestPortion,
        fees: prepayInfo.feesPortion,
        penalty: prepayInfo.penaltyPortion,
      },
      createdAt: new Date(),
    };

    await this.loanApplicationModel.findByIdAndUpdate(loan._id, {
      status: 'closed',
      $push: { repaymentHistory: repaymentRecord },
    });

    const syncDelayMs = 2000;
    this.logger.log(`[prepayLoan] Waiting ${syncDelayMs}ms before sync for loan ${loan.fineractLoanId}`);
    await new Promise(r => setTimeout(r, syncDelayMs));
    try {
      await this.adminService.syncLoanFromFineract(loan.fineractLoanId);
      this.logger.log(`[prepayLoan] Post-prepayment sync succeeded for loan ${loan.fineractLoanId}`);
    } catch (err: any) {
      this.logger.warn(`[prepayLoan] Post-prepayment sync failed for loan ${loan.fineractLoanId}: ${err?.message}`);
    }

    // Prepay = tất toán toàn bộ → resolved mọi LoanDelinquency liên quan
    try {
      const updateRes = await this.loanDelinquencyModel.updateMany(
        { fineractLoanId: loan.fineractLoanId, status: { $in: ['overdue', 'defaulted'] } },
        {
          $set: {
            status: 'resolved',
            resolvedAt: new Date(),
            debtGroup: 0,
            overdueAmount: 0,
            delinquentDays: 0,
            collectionStage: 'none',
          },
        },
      );
      if (updateRes.modifiedCount > 0) {
        this.logger.log(
          `[prepayLoan] Resolved ${updateRes.modifiedCount} LoanDelinquency record(s) for fineractLoanId=${loan.fineractLoanId}`,
        );
      }
    } catch (err: any) {
      this.logger.warn(`[prepayLoan] LoanDelinquency cleanup failed: ${err?.message}`);
    }

    await this.notificationModel
      .create({
        userId: loan.userId,
        title: 'Tất toán hoàn tất',
        message: `Khoản vay đã được tất toán. Số tiền: ${prepayInfo.amount.toLocaleString('vi-VN')} ₫ (${date}).`,
        type: 'repayment_received',
        data: {
          loanId: loan._id.toString(),
          fineractLoanId: loan.fineractLoanId,
          amount: prepayInfo.amount,
          date,
          transactionId: fineractResult.transactionId,
          prepayment: true,
        },
      })
      .catch(err => this.logger.warn(`[prepayLoan] Notification create failed: ${err?.message}`));

    const overdueDays = this.estimateOverdueDays(loan, date);
    await this.creditScoreService
      .applyRepaymentEvent({
        userId,
        isLatePayment: overdueDays > 0,
        overdueDays,
        isPrepayment: true,
        isLoanClosed: true,
        trigger: 'loan_prepayment',
        note: overdueDays > 0 ? `Tất toán trước hạn nhưng có khoản trễ ${overdueDays} ngày` : 'Tất toán sớm đúng hạn',
      })
      .catch(err => this.logger.warn(`[prepayLoan] Credit score update failed: ${err?.message}`));

    this.logger.log(`[prepayLoan] SUCCESS | loanId=${loanId} amount=${prepayInfo.amount}`);

    // Ghi nhận lịch sử giao dịch tất toán vào Blockchain
    if (this.fabricService) {
      try {
        const loanContract = await this.loanContractModel.findOne({ loanId: loan._id }).lean();
        if (loanContract) {
          const settlementId = `SETTLE_PREPAY_${fineractResult.transactionId}_${Date.now()}`;
          const settlementData = {
            loanContractId: loanContract.contractId,
            fineractTransactionId: String(fineractResult.transactionId),
            period: 0, // Prepayment covers remaining periods
            amountPaid: prepayInfo.amount,
            principalPortion: prepayInfo.principalPortion || 0,
            interestPortion: prepayInfo.interestPortion || 0,
            feePortion: prepayInfo.feesPortion || 0,
            penaltyPortion: prepayInfo.penaltyPortion || 0,
            paymentDate: date,
            status: 'completed',
            paymentMethod: 'e_wallet',
          };
          await this.fabricService.submitTransaction('createSettlementContract', settlementId, JSON.stringify(settlementData));
          this.logger.log(`[prepayLoan] Successfully synced settlement to Blockchain: ${settlementId}`);

          // Update LoanContract status on Blockchain → closed
          if (loanContract.contractId) {
            await this.fabricService.submitTransaction(
              'updateLoanStatus',
              loanContract.contractId,
              'closed',
              JSON.stringify({ closedAt: new Date().toISOString(), closedBy: 'prepayment' })
            );
            this.logger.log(`[prepayLoan] [Blockchain] Synced LoanContract ${loanContract.contractId} → closed`);
          }
        }
      } catch (err: any) {
        this.logger.error(`[prepayLoan] Failed to sync settlement to Blockchain: ${err?.message}`);
      }
    }

    return {
      success: true,
      transactionId: fineractResult.transactionId,
      amount: prepayInfo.amount,
      date,
      loanStatus: 'closed',
      breakdown: repaymentRecord.breakdown,
    };
  }

  /**
   * Lấy lịch trả nợ từ Fineract (repayment schedule)
   */
  async getRepaymentSchedule(userId: string, loanId: string): Promise<any> {
    const loan = await this.findAndValidateLoan(userId, loanId);
    if (!loan.fineractLoanId) {
      // Fallback: trả về schedule từ MongoDB
      return {
        source: 'mongo',
        periods: (loan.schedulePreview || []).map((s: any, i: number) => ({
          period: s.period || i + 1,
          principalDue: s.principal,
          interestDue: s.interest,
          totalDue: s.total,
          dueDate: s.dueDate,
          complete: false,
        })),
      };
    }

    const schedule = await this.fineractLoanService.getRepaymentSchedule(loan.fineractLoanId);
    if (!schedule) {
      return { source: 'mongo', periods: loan.schedulePreview || [] };
    }

    // DEBUG: Log raw Fineract schedule data
    this.logger.log(
      `[getRepaymentSchedule] Raw totals: totalFeeChargesCharged=${schedule.totalFeeChargesCharged}, totalPenaltyChargesCharged=${schedule.totalPenaltyChargesCharged}`,
    );
    (schedule.periods || []).forEach((p: any) => {
      if (p.period > 0) {
        this.logger.log(
          `[getRepaymentSchedule] Period ${p.period}: feeChargesDue=${p.feeChargesDue} feeChargesPaid=${p.feeChargesPaid} penaltyChargesDue=${p.penaltyChargesDue} penaltyChargesPaid=${p.penaltyChargesPaid} totalDueForPeriod=${p.totalDueForPeriod}`,
        );
      }
    });

    return {
      source: 'fineract',
      totalPrincipalExpected: schedule.totalPrincipalExpected,
      totalInterestCharged: schedule.totalInterestCharged,
      totalRepaymentExpected: schedule.totalRepaymentExpected,
      totalOutstanding: schedule.totalOutstanding,
      totalFeeChargesCharged: schedule.totalFeeChargesCharged || 0,
      totalPenaltyChargesCharged: schedule.totalPenaltyChargesCharged || 0,
      periods: (schedule.periods || []).map((p: any) => ({
        period: p.period || 0,
        dueDate: p.dueDate,
        principalDue: p.principalDue || 0,
        principalPaid: p.principalPaid || 0,
        interestDue: p.interestDue || 0,
        interestPaid: p.interestPaid || 0,
        feeChargesDue: p.feeChargesDue || 0,
        feeChargesPaid: p.feeChargesPaid || 0,
        penaltyChargesDue: p.penaltyChargesDue || 0,
        totalDue: p.totalDueForPeriod || 0,
        totalPaid: p.totalPaidForPeriod || 0,
        totalOutstanding: p.totalOutstandingForPeriod || 0,
        complete: p.complete || false,
      })),
    };
  }

  /**
   * Lấy dư nợ còn lại
   */
  async getOutstandingBalance(userId: string, loanId: string): Promise<any> {
    const loan = await this.findAndValidateLoan(userId, loanId);
    if (!loan.fineractLoanId) {
      throw new BadRequestException('Khoản vay chưa được tạo trên Fineract');
    }

    const outstanding = await this.fineractLoanService.getOutstandingBalance(loan.fineractLoanId);
    return {
      ...outstanding,
      loanId: loan._id,
      fineractLoanId: loan.fineractLoanId,
      capital: loan.capital,
      status: loan.status,
      totalOverdue: loan.totalOverdue ?? 0,
      delinquentDays: loan.delinquentDays ?? 0,
      delinquencyClassification: loan.delinquencyClassification ?? null,
    };
  }

  // =============================================
  // Private helpers
  // =============================================

  /**
   * Lấy thông tin charge phí phạt tất toán sớm ĐỘNG từ Fineract
   * Hỗ trợ chargeCalculationType: "% Amount" hoặc "Flat"
   * Fallback 3% nếu Fineract API lỗi hoặc charge không tồn tại
   */
  private async getPenaltyChargeInfo(): Promise<{
    rate: number; // decimal, e.g. 0.03
    ratePercent: number; // e.g. 3
    name: string;
    isPercentage: boolean;
    flatAmount: number; // dùng khi isPercentage=false
  }> {
    try {
      const charge = await this.fineractLoanService.getChargeDetails(PREPAYMENT_PENALTY_CHARGE_ID);
      const calcType = charge.chargeCalculationType?.value || '';
      const isPercentage = calcType.toLowerCase().includes('%') || calcType.toLowerCase().includes('percent');

      if (isPercentage) {
        // charge.amount = tỷ lệ phần trăm (e.g. 3 = 3%)
        return {
          rate: (charge.amount || 0) / 100,
          ratePercent: charge.amount || 0,
          name: charge.name || 'Phí phạt tất toán sớm',
          isPercentage: true,
          flatAmount: 0,
        };
      } else {
        // Flat amount — charge.amount = số tiền cố định
        return {
          rate: 0,
          ratePercent: 0,
          name: charge.name || 'Phí phạt tất toán sớm',
          isPercentage: false,
          flatAmount: charge.amount || 0,
        };
      }
    } catch (error: any) {
      this.logger.warn(
        `[getPenaltyChargeInfo] Failed to fetch charge ${PREPAYMENT_PENALTY_CHARGE_ID}, using fallback 3%: ${error.message}`,
      );
      // Fallback: mặc định 3% nếu không lấy được từ Fineract
      return {
        rate: 0.03,
        ratePercent: 3,
        name: 'Phí phạt tất toán sớm',
        isPercentage: true,
        flatAmount: 0,
      };
    }
  }

  /**
   * Tìm và validate loan thuộc user
   */
  private async findAndValidateLoan(userId: string, loanId: string): Promise<LoanApplication> {
    let loan: LoanApplication | null = null;

    // Tìm bằng MongoDB _id
    if (Types.ObjectId.isValid(loanId)) {
      loan = await this.loanApplicationModel.findById(loanId);
    }

    // Fallback: tìm bằng fineractLoanId
    if (!loan) {
      const numericId = Number(loanId);
      if (!isNaN(numericId)) {
        loan = await this.loanApplicationModel.findOne({ fineractLoanId: numericId });
      }
    }

    if (!loan) {
      throw new NotFoundException(`Không tìm thấy khoản vay ${loanId}`);
    }

    // Kiểm tra ownership
    if (loan.userId.toString() !== userId.toString()) {
      throw new BadRequestException('Khoản vay không thuộc về bạn');
    }

    // Kiểm tra status
    const activeStatuses = ['disbursed', 'approved', 'pending'];
    if (!activeStatuses.includes(loan.status) && loan.status !== 'closed') {
      throw new BadRequestException(`Khoản vay đang ở trạng thái "${loan.status}", không thể thực hiện thanh toán`);
    }

    return loan;
  }

  /**
   * Lấy lịch sử giao dịch từ Fineract
   */
  async getLoanTransactions(userId: string, loanId: string): Promise<any> {
    const loan = await this.findAndValidateLoan(userId, loanId);
    if (!loan.fineractLoanId) {
      return { success: true, total: 0, transactions: [] };
    }

    const transactions = await this.fineractLoanService.getLoanTransactions(loan.fineractLoanId);
    return {
      success: true,
      total: transactions.length,
      transactions,
    };
  }

  private estimateOverdueDays(loan: LoanApplication, paymentDate: string): number {
    const fallback = Math.max(0, Number((loan as any)?.delinquentDays || 0));
    const paidAt = this.parseDateLike(paymentDate);
    if (!paidAt) return fallback;

    const schedule = Array.isArray((loan as any)?.repaymentSchedule) ? (loan as any).repaymentSchedule : [];
    const pendingPeriod = schedule.find((period: any) => {
      if (period?.complete) return false;
      const outstanding =
        Number(period?.totalOutstandingForPeriod || 0) ||
        Number(period?.totalDueForPeriod || 0) ||
        Number(period?.totalDue || 0);
      return outstanding > 0;
    });

    const dueDate = this.parseDateLike(pendingPeriod?.dueDate);
    if (!dueDate) return fallback;

    const diffMs = paidAt.getTime() - dueDate.getTime();
    if (diffMs <= 0) return 0;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  private parseDateLike(input: any): Date | null {
    if (!input) return null;

    if (Array.isArray(input) && input.length >= 3) {
      const [year, month, day] = input;
      const d = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(d.getTime()) ? null : d;
    }

    if (typeof input === 'string') {
      const normalized = input.includes('/') ? input.split('/').reverse().join('-') : input;
      const d = new Date(normalized);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }
}
