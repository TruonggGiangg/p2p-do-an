import { AdminCustomerService } from './admin-customer.service';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FineractLoanService } from '../../fineract/services/fineract-loan.service';
import { FineractClientService } from '../../fineract/services/fineract-client.service';
import { FineractSavingsService } from '../../fineract/services/fineract-savings.service';
import { LoanProductDocumentType } from '../schemas/loan-product-document-type.schema';
import { LoanSyncRun, type LoanSyncRunDetailItem, type LoanSyncChangeItem } from '../schemas/loan-sync-run.schema';
import {
  LoanDelinquency,
  LoanCollectionStage,
  LoanDelinquencyStatus,
} from '../../delinquency/entities/loan-delinquency.schema';
import { DelinquencyCollectionStage, DelinquencyPolicy } from '../../delinquency/entities/delinquency-policy.schema';
import { User } from '../../users/schemas/user.schema';
import { LoanApplication, LoanApplicationStatus } from '../../loan/schemas/loan-application.schema';
import { Wallet } from '../../wallets/schemas/wallet.schema';
import { Notification } from '../../loan/schemas/notification.schema';
import { LoanContract } from '../../loan/schemas/loan-contract.schema';
import { ContractService } from '../../loan/contract.service';
import { DocumentType } from '../schemas/document-type.schema';
import { ConfigService } from '@nestjs/config';
import { CreditScoreService } from '../../credit-score/credit-score.service';
import { CreateDelinquencyPolicyDto } from '../../delinquency/dto/create-delinquency-policy.dto';
import { UpdateDelinquencyPolicyDto } from '../../delinquency/dto/update-delinquency-policy.dto';
import { ProductDiffItem } from '../schemas/sync-drift-log.schema';
import { CreateDocumentTypeDto } from '../dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from '../dto/update-document-type.dto';
import { ProductDocumentTypeItemDto } from '../dto/set-product-document-types.dto';
import { RegisterDto } from 'src/modules/auth/dto/register.dto';
import { UpdateStaffDto } from 'src/modules/admin/dto/update-staff.dto';
import { CreditScoreWeightConfigInput, CreditScoreWeightConfigValue } from '../../credit-score/credit-score.service';
import { AdminProductService } from '../services/admin-product.service';
import { AdminKycService } from '../services/admin-kyc.service';
import { AdminStaffService } from '../services/admin-staff.service';

/** officeId=1 = Head Office in default Fineract setup */
const HEAD_OFFICE_ID = 1;

/** Parse Fineract date (array [y,m,d] or string) to ISO yyyy-MM-dd */
function parseFineractDate(val: any): string | null {
  if (!val) return null;
  if (Array.isArray(val) && val.length >= 3) {
    const [y, m, d] = val;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  if (typeof val === 'string') {
    const parsed = new Date(val);
    return !isNaN(parsed.getTime()) ? parsed.toISOString().split('T')[0] : null;
  }
  return null;
}

/** Parse period dueDate (array [y,m,d] or string) to ISO yyyy-MM-dd for comparison */
function parsePeriodDueDate(due: any): string | null {
  if (due == null) return null;
  if (Array.isArray(due) && due.length >= 3) {
    const [y, m, d] = due;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (typeof due === 'string' && /^\d{4}-\d{2}-\d{2}/.test(due)) return due.slice(0, 10);
  return null;
}

const SNAPSHOT_SCOPE = 'default';

@Injectable()
export class AdminLoanService {
  private readonly logger = new Logger(AdminLoanService.name);

  constructor(
    @InjectModel(LoanProductDocumentType.name) private loanProductDocModel: Model<LoanProductDocumentType>,
    @InjectModel(LoanSyncRun.name) private loanSyncRunModel: Model<LoanSyncRun>,
    @InjectModel(LoanDelinquency.name) private loanDelinquencyModel: Model<LoanDelinquency>,
    @InjectModel(DelinquencyPolicy.name) private delinquencyPolicyModel: Model<DelinquencyPolicy>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(LoanApplication.name) private loanApplicationModel: Model<LoanApplication>,
    @InjectModel(Wallet.name) private walletModel: Model<Wallet>,
    @InjectModel(Notification.name) private notificationModel: Model<Notification>,
    @InjectModel(LoanContract.name) private loanContractModel: Model<LoanContract>,
    @InjectModel(DocumentType.name) private documentTypeModel: Model<DocumentType>,
    private readonly fineractLoanService: FineractLoanService,
    private readonly fineractClientService: FineractClientService,
    private readonly fineractSavingsService: FineractSavingsService,
    @Inject(forwardRef(() => ContractService)) private readonly contractService: ContractService,
    private readonly customerService: AdminCustomerService,
    private readonly creditScoreService: CreditScoreService,
    private readonly configService: ConfigService,
  ) {}
  private parseAnyDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (Array.isArray(value) && value.length >= 3) {
      const [y, m, d] = value;
      const parsed = new Date(Number(y), Number(m) - 1, Number(d));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private mapDebtGroup(delinquentDays: number, overdueAmount: number): number {
    if (overdueAmount <= 0 || delinquentDays <= 0) return 0;
    if (delinquentDays < 10) return 1;
    if (delinquentDays < 30) return 2;
    if (delinquentDays < 90) return 3;
    if (delinquentDays < 180) return 4;
    return 5;
  }

  private mapDelinquencyStatus(
    delinquentDays: number,
    overdueAmount: number,
    existing?: LoanDelinquency | null,
  ): LoanDelinquencyStatus {
    if (overdueAmount <= 0 || delinquentDays <= 0) {
      if (existing && (existing.status === 'overdue' || existing.status === 'defaulted')) {
        return 'resolved';
      }
      return 'normal';
    }
    if (delinquentDays >= 180) return 'defaulted';
    return 'overdue';
  }

  private mapCollectionStage(delinquentDays: number, overdueAmount: number): LoanCollectionStage {
    if (overdueAmount <= 0 || delinquentDays <= 0) return 'none';
    if (delinquentDays < 10) return 'reminder'; // Nhóm 1
    if (delinquentDays < 30) return 'warning'; // Nhóm 2
    if (delinquentDays < 90) return 'collection'; // Nhóm 3
    return 'legal'; // Nhóm 4-5
  }

  private async syncLoanDelinquencySnapshot(app: any, fl: any, dData: any): Promise<void> {
    if (!app.fineractLoanId) return;

    const existing = await this.loanDelinquencyModel.findOne({ fineractLoanId: app.fineractLoanId });
    const overdueAmount = Number(app.totalOverdue ?? 0);
    const delinquentDays = Number(app.delinquentDays ?? 0);
    const overdueDateRaw =
      dData?.summary?.overdueSinceDate ||
      dData?.delinquent?.delinquentDate ||
      fl?.delinquencyRange?.delinquentDate ||
      app?.delinquencyRange?.delinquentDate;
    const overdueDate = this.parseAnyDate(overdueDateRaw);
    const now = new Date();
    const status = this.mapDelinquencyStatus(delinquentDays, overdueAmount, existing);

    const firstOverdueDate =
      overdueAmount > 0
        ? (existing?.firstOverdueDate ?? overdueDate ?? now)
        : (existing?.firstOverdueDate ?? overdueDate ?? null);
    const lastOverdueDate =
      overdueAmount > 0 ? (overdueDate ?? now) : (existing?.lastOverdueDate ?? overdueDate ?? null);

    await this.loanDelinquencyModel
      .findOneAndUpdate(
        { fineractLoanId: app.fineractLoanId },
        {
          $set: {
            loanId: app._id,
            borrowerId: app.userId,
            delinquentDays,
            debtGroup: this.mapDebtGroup(delinquentDays, overdueAmount),
            overdueAmount,
            firstOverdueDate,
            lastOverdueDate,
            status,
            collectionStage: this.mapCollectionStage(delinquentDays, overdueAmount),
            lastSyncedAt: app.lastSyncedAt ?? now,
            ...(status === 'overdue' || status === 'defaulted'
              ? { isDeleted: false, deletedAt: null, resolvedAt: null }
              : {}),
            ...(status === 'resolved' && !existing?.resolvedAt ? { resolvedAt: now } : {}),
          },
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  private async syncDelinquencyViewFromFineract(): Promise<void> {
    const apps = await this.loanApplicationModel
      .find({ status: 'disbursed', fineractLoanId: { $exists: true, $ne: null } })
      .select('fineractLoanId')
      .lean()
      .exec();
    const loanIds = apps.map((a: any) => Number(a.fineractLoanId)).filter((id: number) => Number.isFinite(id));

    const batchSize = 5;
    for (let i = 0; i < loanIds.length; i += batchSize) {
      const batch = loanIds.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(loanId => this.syncLoanFromFineract(loanId)));
    }
  }

  /**



  /**
   * Get all pending loans (status 100 in Fineract) for admin approval.
   * Only P* products.
   */
  async getAllPendingLoans() {
    // 1. Fetch all pending loans from Fineract (Status 100 = Submitted and pending approval)
    const pendingFineractLoans = await this.fineractLoanService.getLoansByStatus(100);

    // 2. Filter by P* products
    const products = await this.fineractLoanService.getLoanProducts();
    const productMap = new Map(products.map((p: any) => [p.id, p]));

    this.logger.log(
      `[getAllPendingLoans] Found ${pendingFineractLoans.length} total pending loans (status 100) in Fineract`,
    );
    pendingFineractLoans.forEach(fl => {
      const productId = fl.productId || fl.loanProductId;
      const p: any = productMap.get(productId);
      this.logger.log(
        `  - Pending ID ${fl.id} | Client ${fl.clientId} | Product ${productId} (${p?.shortName || 'N/A'})`,
      );
    });

    this.logger.log(`[getAllPendingLoans] Returning ${pendingFineractLoans.length} pending loans`);

    if (pendingFineractLoans.length === 0) return [];

    // 3. Map to internal MongoDB users and loan applications
    const fineractLoanIds = pendingFineractLoans.map(fl => fl.id);
    const fineractClientIds = pendingFineractLoans.map(fl => String(fl.clientId));

    const [mongoUsers, mongoLoans] = await Promise.all([
      this.userModel.find({ fineractClientId: { $in: fineractClientIds } }).lean(),
      this.loanApplicationModel.find({ fineractLoanId: { $in: fineractLoanIds } }).lean(),
    ]);

    const userMap = new Map(mongoUsers.map(u => [u.fineractClientId, u]));
    const loanMap = new Map(mongoLoans.map(l => [l.fineractLoanId, l]));

    // 3.5 Retroactive AI scoring: score pending loans that don't have aiScore yet
    const aiscoreConfig = this.configService.get('aiscore');
    if (aiscoreConfig?.enabled) {
      const unscoredLoans = mongoLoans.filter((l: any) => l.fineractLoanId && !l.aiScore);
      if (unscoredLoans.length > 0) {
        this.logger.log(`[getAllPendingLoans] Retroactive AI scoring for ${unscoredLoans.length} un-scored loans`);
        await Promise.allSettled(
          unscoredLoans.map(async (loan: any) => {
            try {
              const loanCapital = loan.capital ?? 0;
              if (loanCapital <= 0) return; // skip invalid loans
              const user = mongoUsers.find((u: any) => u._id?.toString() === loan.userId?.toString());
              const rawCic = user?.creditProfile?.creditScore ?? 570;
              const cicScore = Math.max(150, Math.min(750, rawCic));
              const { default: axios } = await import('axios');
              const scoreResponse = await axios.post(
                `${aiscoreConfig.serviceUrl}/api/score`,
                {
                  credit_score: cicScore,
                  loanAmount: loanCapital,
                  monthly_income: 10_000_000,
                  monthly_pay: loan.monthlyPay ?? 0,
                  periodMonth: loan.periodMonth ?? 12,
                },
                { timeout: aiscoreConfig.timeout || 15000 },
              );
              const aiRiskScore = scoreResponse.data?.ai_risk_score;
              const defaultProbability = scoreResponse.data?.default_probability;
              if (aiRiskScore != null) {
                const evaluationScore = Math.max(0, Math.min(100, 100 - aiRiskScore));
                const evalConfig = await this.creditScoreService.getLoanEvaluationConfig();
                const sortedGrades = [...(evalConfig.creditGrades || [])].sort((a, b) => b.maxScore - a.maxScore);
                const grade = sortedGrades.find(g => evaluationScore >= g.minScore && evaluationScore <= g.maxScore);
                const aiScore = {
                  pd: defaultProbability,
                  creditScore: evaluationScore,
                  grade: grade?.grade || 'N/A',
                  subGrade: grade?.label || 'Chưa xếp hạng',
                  tier: grade?.grade || 'N/A',
                  decision:
                    evaluationScore < (evalConfig.autoRejectScore ?? 0)
                      ? 'REJECT'
                      : evaluationScore >= (evalConfig.autoApproveScore ?? 100)
                        ? 'APPROVE'
                        : 'REVIEW',
                  riskLevel:
                    grade?.grade === 'A'
                      ? 'LOW'
                      : grade?.grade === 'B'
                        ? 'MEDIUM'
                        : grade?.grade === 'C'
                          ? 'HIGH'
                          : 'VERY_HIGH',
                  riskFactors: [],
                  scoredAt: new Date(),
                };
                await this.loanApplicationModel.updateOne({ _id: loan._id }, { $set: { aiScore } });
                // Update loanMap so the current response includes the new score
                loanMap.set(loan.fineractLoanId, { ...loan, aiScore });
                this.logger.log(
                  `[getAllPendingLoans] Scored loan ${loan.fineractLoanId}: score=${evaluationScore} grade=${aiScore.grade}`,
                );
              }
            } catch (err: any) {
              this.logger.warn(`[getAllPendingLoans] Failed to score loan ${loan.fineractLoanId}: ${err.message}`);
            }
          }),
        );
      }
    }

    // 4. Transform
    return pendingFineractLoans.map(fl => {
      const productId = fl.productId || fl.loanProductId;
      const p: any = productMap.get(productId) ?? {};
      const u = userMap.get(String(fl.clientId));
      const ll: any = loanMap.get(fl.id);
      const annualRate = fl.annualInterestRate ?? 0;

      return {
        _id: ll?._id?.toString() ?? `FL_${fl.id}`,
        userId: u?._id?.toString() ?? null,
        productId: fl.productId,
        productName: p.name ?? String(fl.productId),
        productShortName: p.shortName ?? '',
        capital: fl.principal ?? ll?.capital ?? 0,
        periodMonth: fl.numberOfRepayments ?? ll?.periodMonth ?? 0,
        monthlyPay: ll?.monthlyPay ?? 0,
        entirelyPay: ll?.entirelyPay ?? 0,
        monthlyRatePercent: ll?.monthlyRatePercent ?? annualRate / 12,
        status: fl.status ?? { value: 'pending', code: 'loanStatusType.pendingApproval' },
        fineractLoanId: fl.id,
        disbursementDate: fl.timeline?.actualDisbursementDate ?? ll?.disbursementDate ?? null,
        createdAt: fl.timeline?.submittedOnDate ?? ll?.createdAt ?? null,
        willing: ll?.willing ?? '',
        // Client display name for easier approval
        clientName: fl.clientName ?? u?.username ?? `Client ${fl.clientId}`,
        // AI Score data for approval UI
        aiScore: ll?.aiScore ?? null,
      };
    });
  }

  /**
   * Admin approve loan: Fineract approve + update MongoDB status.
   * Yêu cầu: đã duyệt đủ tất cả tài liệu bắt buộc.
   */
  async approveLoan(fineractLoanId: number) {
    this.logger.log(`[approveLoan] fineractLoanId=${fineractLoanId}`);

    // Auto-approve all pending documents that have been uploaded
    const app = await this.loanApplicationModel.findOne({ fineractLoanId });
    if (!app) throw new BadRequestException('Khoản vay không tồn tại');

    let docAutoApproved = 0;
    if (app.documents?.length) {
      for (const doc of app.documents) {
        if (doc.reviewStatus !== 'approved' && doc.fineractDocumentId) {
          doc.reviewStatus = 'approved';
          docAutoApproved++;
        }
      }
      if (docAutoApproved > 0) {
        app.markModified('documents');
        await app.save();
        this.logger.log(`[approveLoan] Auto-approved ${docAutoApproved} pending documents`);
      }
    }

    // Now check if all required doc types are satisfied
    const { canApprove, missingRequired } = await this.canApproveLoan(fineractLoanId);
    if (!canApprove) {
      throw new BadRequestException(`Chưa upload đủ tài liệu bắt buộc: ${missingRequired.join(', ')}`);
    }

    // Fineract requires: approvedOnDate >= submittedOnDate AND approvedOnDate <= expectedDisbursementDate
    const today = new Date().toISOString().split('T')[0];
    let approvedOnDate: string = today;

    try {
      const loanDetails = await this.fineractLoanService.getLoanDetails(fineractLoanId.toString());
      const submittedOnDate = parseFineractDate(loanDetails?.timeline?.submittedOnDate);
      const expectedDisbursementDate =
        parseFineractDate(loanDetails?.timeline?.expectedDisbursementDate) ||
        parseFineractDate(loanDetails?.expectedDisbursementDate);
      const disbursementDate = app?.disbursementDate;

      // Candidate: use disbursementDate if past-dated, else today
      let candidate = today;
      if (disbursementDate && disbursementDate < today) {
        candidate = disbursementDate;
      }

      // approvedOnDate must be >= submittedOnDate (Fineract: cannot approve before submittal)
      // approvedOnDate must be <= expectedDisbursementDate
      const upperBound = expectedDisbursementDate || today;
      const clamped = candidate > upperBound ? upperBound : candidate;
      approvedOnDate = submittedOnDate && clamped < submittedOnDate ? submittedOnDate : clamped;
      this.logger.log(
        `[approveLoan] Dates: submitted=${submittedOnDate} expectedDisb=${expectedDisbursementDate} candidate=${candidate} -> approvedOnDate=${approvedOnDate}`,
      );
    } catch (err) {
      this.logger.warn(`[approveLoan] Could not fetch loan details, using today: ${(err as Error).message}`);
    }

    await this.fineractLoanService.approveLoan(fineractLoanId, approvedOnDate);
    await this.loanApplicationModel.updateOne({ fineractLoanId }, { $set: { status: 'approved' } });

    // Táº¡o há»£p Ä‘á»“ng vay + gá»­i thÃ´ng bÃ¡o cho ngÆ°á»i vay
    try {
      await this.contractService.createContractOnApproval(fineractLoanId);
    } catch (err) {
      this.logger.warn(`[approveLoan] Failed to create contract: ${err?.message}`);
      // Không block việc approve nếu tạo contract thất bại
    }

    // Láº¥y thÃ´ng tin ngÆ°á»i vay
    let borrowerName = '';
    let borrowerUsername = '';
    try {
      const borrower = await this.userModel.findById(app.userId);
      if (borrower) {
        borrowerName =
          [borrower.profile?.firstName, borrower.profile?.lastName].filter(Boolean).join(' ') || borrower.username;
        borrowerUsername = borrower.username;
      }
    } catch {
      /* ignore */
    }

    return { fineractLoanId, status: 'approved', borrowerName, borrowerUsername };
  }

  /**
   * Admin disburse loan: Fineract disburse + update MongoDB status
   */
  async disburseLoan(fineractLoanId: number) {
    this.logger.log(`[disburseLoan] fineractLoanId=${fineractLoanId}`);
    const loan = await this.loanApplicationModel.findOne({ fineractLoanId });
    if (!loan) throw new BadRequestException(`Khoản vay Fineract #${fineractLoanId} không tồn tại trong hệ thống`);

    // 0. Check contract is signed before allowing disbursement
    const contract = await this.loanContractModel.findOne({ loanId: loan._id });
    if (!contract) {
      throw new BadRequestException(`Khoản vay #${fineractLoanId} chưa có hợp đồng. Không thể giải ngân.`);
    }
    if (contract.status !== 'signed') {
      throw new BadRequestException(
        `Há»£p Ä‘á»“ng khoáº£n vay #${fineractLoanId} chÆ°a Ä‘Æ°á»£c kÃ½ (tráº¡ng thÃ¡i: ${contract.status}). NgÆ°á»i vay cáº§n kÃ½ há»£p Ä‘á»“ng trÆ°á»›c khi giáº£i ngÃ¢n.`,
      );
    }

    // 0b. Check investment is fully funded
    const totalNotes = loan.totalNotes || Math.ceil((loan.capital || 0) / 500000);
    const investedNotes = (loan as any).investedNotes || 0;
    if (investedNotes < totalNotes) {
      throw new BadRequestException(
        `Khoản vay #${fineractLoanId} chưa được đầu tư đủ (${investedNotes}/${totalNotes} phần). Nhà đầu tư cần rót vốn đủ trước khi giải ngân.`,
      );
    }

    // 1. Disburse on Fineract
    await this.fineractLoanService.disburseLoan(fineractLoanId, loan.capital);

    // 2. Update loan status in MongoDB
    loan.status = 'disbursed' as any;
    loan.disbursementDate = new Date().toString();
    await loan.save();

    // 3. Update contract status to 'active'
    try {
      await this.loanContractModel.updateOne({ loanId: loan._id, status: 'signed' }, { $set: { status: 'active' } });
    } catch (err) {
      this.logger.warn(`[disburseLoan] Failed to update contract status: ${err?.message}`);
    }

    // 4. Create disbursement notification
    try {
      await this.notificationModel.create({
        userId: loan.userId,
        title: 'Gi\u1ea3i ng\u00e2n th\u00e0nh c\u00f4ng',
        message: `Kho\u1ea3n vay ${loan.capital?.toLocaleString('vi-VN')} \u0111 \u0111\u00e3 \u0111\u01b0\u1ee3c gi\u1ea3i ng\u00e2n v\u00e0o t\u00e0i kho\u1ea3n c\u1ee7a b\u1ea1n. Vui l\u00f2ng ki\u1ec3m tra s\u1ed1 d\u01b0.`,
        type: 'loan_disbursed',
        data: {
          loanId: loan._id?.toString(),
          fineractLoanId,
          amount: loan.capital,
        },
      });
    } catch (err) {
      this.logger.warn(`[disburseLoan] Failed to create notification: ${err?.message}`);
    }

    // 5. Event 3: Cập nhật điểm tín dụng — Dư nợ & Tín dụng mới thay đổi
    try {
      await this.creditScoreService.applyDisbursementEvent(loan.userId);
    } catch (err) {
      this.logger.warn(`[disburseLoan] Failed to update credit score: ${err?.message}`);
    }

    // Láº¥y thÃ´ng tin ngÆ°á»i vay
    let borrowerName = '';
    let borrowerUsername = '';
    try {
      const borrower = await this.userModel.findById(loan.userId);
      if (borrower) {
        borrowerName =
          [borrower.profile?.firstName, borrower.profile?.lastName].filter(Boolean).join(' ') || borrower.username;
        borrowerUsername = borrower.username;
      }
    } catch {
      /* ignore */
    }

    return { fineractLoanId, status: 'disbursed', borrowerName, borrowerUsername };
  }

  /**
   * Admin reject loan: Fineract reject + update MongoDB status + notify borrower
   */
  async rejectLoan(fineractLoanId: number, note?: string) {
    this.logger.log(`[rejectLoan] fineractLoanId=${fineractLoanId}`);
    const app = await this.loanApplicationModel.findOne({ fineractLoanId });
    if (!app) throw new BadRequestException('Khoản vay không tồn tại');

    // 1. Reject on Fineract
    await this.fineractLoanService.rejectLoan(fineractLoanId, undefined, note);

    // 2. Update MongoDB
    app.status = 'rejected' as any;
    await app.save();

    // 3. Notify borrower
    try {
      await this.notificationModel.create({
        userId: app.userId,
        title: 'Đơn vay bị từ chối',
        message: note
          ? `Đơn vay ${app.capital?.toLocaleString('vi-VN')} đ đã bị từ chối. Lý do: ${note}`
          : `Đơn vay ${app.capital?.toLocaleString('vi-VN')} đ đã bị từ chối.`,
        type: 'loan_rejected',
        data: { loanId: app._id?.toString(), fineractLoanId, reason: note || '' },
      });
    } catch (err) {
      this.logger.warn(`[rejectLoan] Failed to create notification: ${err?.message}`);
    }

    // 4. Get borrower info
    let borrowerName = '';
    let borrowerUsername = '';
    try {
      const borrower = await this.userModel.findById(app.userId);
      if (borrower) {
        borrowerName =
          [borrower.profile?.firstName, borrower.profile?.lastName].filter(Boolean).join(' ') || borrower.username;
        borrowerUsername = borrower.username;
      }
    } catch {
      /* ignore */
    }

    return { fineractLoanId, status: 'rejected', borrowerName, borrowerUsername };
  }

  /**
   * Admin undo approval: Fineract undoApproval + revert MongoDB status
   */
  async undoApproval(fineractLoanId: number, note?: string) {
    this.logger.log(`[undoApproval] fineractLoanId=${fineractLoanId}`);
    const app = await this.loanApplicationModel.findOne({ fineractLoanId });
    if (!app) throw new BadRequestException('Khoản vay không tồn tại');

    // 1. Undo on Fineract
    await this.fineractLoanService.undoApproval(fineractLoanId, note);

    // 2. Revert MongoDB to pending
    app.status = 'pending' as any;
    await app.save();

    // 3. Remove contract if created
    try {
      await this.loanContractModel.deleteOne({ loanId: app._id });
    } catch (err) {
      this.logger.warn(`[undoApproval] Failed to remove contract: ${err?.message}`);
    }

    return { fineractLoanId, status: 'pending', message: 'Đã hoàn tác duyệt' };
  }

  /**
   * Get contract status for a loan (used by admin to check before disburse)
   */
  async getContractStatus(fineractLoanId: number) {
    this.logger.log(`[getContractStatus] fineractLoanId=${fineractLoanId}`);
    const loan = await this.loanApplicationModel.findOne({ fineractLoanId });
    if (!loan) return { hasContract: false, contractStatus: null, signedAt: null };

    const contract = await this.loanContractModel.findOne({ loanId: loan._id }).lean().exec();
    if (!contract) return { hasContract: false, contractStatus: null, signedAt: null };

    return {
      hasContract: true,
      contractStatus: contract.status,
      signedAt: contract.signedAt || null,
    };
  }

  /**
   * Tính từng kỳ tránh nợ (có tiền quá hạn/còn nợ) rơi vào nhóm/thẻ quá hạn nào.
   * Dựa trên ngày đến hạn kỳ vs ngày tham chiếu (lastSyncedAt hoặc hôm nay) → số ngày quá hạn → map vào delinquency ranges.
   */
  private async computePeriodDelinquency(
    periods: any[],
    referenceDate: Date,
  ): Promise<
    Array<{
      period: number;
      dueDate: string;
      daysOverdue: number;
      classification: string;
      totalOverdue: number;
      totalOutstandingForPeriod: number;
    }>
  > {
    const ranges = await this.fineractLoanService.getDelinquencyRanges();
    const sorted = (ranges || [])
      .filter((r: any) => r.minimumAgeDays != null)
      .map((r: any) => ({
        min: Number(r.minimumAgeDays),
        max: r.maximumAgeDays != null ? Number(r.maximumAgeDays) : undefined,
        classification: r.classification ?? r.name ?? String(r.id),
      }))
      .sort((a: any, b: any) => a.min - b.min);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].max == null) sorted[i].max = sorted[i + 1].min - 1;
    }

    const result: Array<{
      period: number;
      dueDate: string;
      daysOverdue: number;
      classification: string;
      totalOverdue: number;
      totalOutstandingForPeriod: number;
    }> = [];
    for (const p of periods) {
      const periodNum = p.period;
      if (periodNum == null) continue;
      const totalOverdue = p.totalOverdue ?? 0;
      const totalOutstanding = p.totalOutstandingForPeriod ?? 0;
      if (totalOverdue <= 0 && totalOutstanding <= 0) continue;

      const due = p.dueDate;
      const dueDate = Array.isArray(due) && due.length >= 3 ? new Date(due[0], due[1] - 1, due[2]) : null;
      const daysOverdue = dueDate
        ? Math.max(0, Math.floor((referenceDate.getTime() - dueDate.getTime()) / 86400000))
        : 0;
      const dueDateStr = dueDate ? dueDate.toISOString().slice(0, 10) : Array.isArray(due) ? due.join('-') : '-';
      const range = sorted.find((r: any) => daysOverdue >= r.min && (r.max == null || daysOverdue <= r.max));
      result.push({
        period: periodNum,
        dueDate: dueDateStr,
        daysOverdue,
        classification: range?.classification ?? (daysOverdue > 0 ? `Quá hạn ${daysOverdue} ngày` : '-'),
        totalOverdue,
        totalOutstandingForPeriod: totalOutstanding,
      });
    }
    return result;
  }
  async getLoanDetails(fineractLoanId: number, sync = false) {
    this.logger.log(`[getLoanDetails] fineractLoanId=${fineractLoanId} sync=${sync}`);
    if (sync) {
      await this.syncLoanFromFineract(fineractLoanId);
    }
    const fl = await this.fineractLoanService.getLoanDetails(fineractLoanId.toString());
    const app = await this.loanApplicationModel.findOne({ fineractLoanId });
    if (app) {
      const appObj = app.toObject() as any;
      const periods = Array.isArray(appObj.repaymentSchedule)
        ? appObj.repaymentSchedule
        : fl.repaymentSchedule?.periods || appObj.repaymentSchedule?.periods || [];
      const referenceDate = app.lastSyncedAt ? new Date(app.lastSyncedAt) : new Date();
      const periodDelinquency = await this.computePeriodDelinquency(periods, referenceDate);
      return {
        ...fl,
        ...appObj,
        clientName: app.clientDisplayName ?? fl.clientName ?? appObj.clientDisplayName,
        repaymentSchedule: { periods },
        delinquentDays: app.delinquentDays,
        delinquencyClassification: app.delinquencyClassification,
        delinquencyRange: app.delinquencyRange || fl.delinquencyRange,
        delinquencyTags: app.delinquencyTags || [],
        installmentLevelDelinquency: app.installmentLevelDelinquency || [],
        delinquencyActions: app.delinquencyActions || [],
        periodDelinquency,
      };
    }
    return fl;
  }

  /**
   * Synchronize a single loan from Fineract to MongoDB
   */
  async syncLoanFromFineract(fineractLoanId: number): Promise<LoanApplication> {
    this.logger.log(`[syncLoanFromFineract] fineractLoanId=${fineractLoanId}`);

    // 1. Fetch full details from Fineract
    const fl = await this.fineractLoanService.getLoanDetails(fineractLoanId.toString());
    if (!fl) throw new NotFoundException(`Loan #${fineractLoanId} not found in Fineract`);

    // Fetch supplemental data early
    const dData = await this.fineractLoanService.getDelinquencyData(fineractLoanId.toString()).catch(() => ({}));
    const dTags = await this.fineractLoanService.getDelinquencyTags(fineractLoanId.toString()).catch(() => []);
    const dActions =
      (await (this.fineractLoanService as any).getDelinquencyActions?.(fineractLoanId.toString()).catch(() => [])) ||
      [];

    // Consolidated data objects - prioritize dData (the detailed delinquency call)
    const delinquentInfo = dData.delinquent || fl.delinquent || dData.collection || fl.collection || {};
    const rangeInfo = dData.delinquencyRange || fl.delinquencyRange || {};
    const summaryInfo = dData.summary || fl.summary || fl.collection || {};
    // Prefer fl.summary; fallback to fl.collection (often has post-allocation totals/delinquency)
    const summary = fl.summary || fl.collection || summaryInfo || {};

    // 2. Map status (active = đã giải ngân -> disbursed để trang Khoản vay quá hạn lấy đúng)
    const fStatus = fl.status || {};
    let internalStatus: LoanApplicationStatus = 'pending';
    if (fStatus.active) internalStatus = 'disbursed';
    if (fStatus.closed) internalStatus = 'closed';
    if (fStatus.waitingForDisbursal) internalStatus = 'approved';
    if (fStatus.overpaid) internalStatus = 'closed';

    // 3. Find or create local application
    let app = await this.loanApplicationModel.findOne({ fineractLoanId });

    if (!app) {
      // Try to find by userId if it's a new loan from Fineract we don't know about yet
      // This is rare in this P2P system but good for "Sync Module" robustness
      this.logger.warn(
        `[syncLoanFromFineract] No local loan application found for fineractLoanId=${fineractLoanId}. Attempting to create one.`,
      );

      const user = await this.userModel.findOne({ fineractClientId: String(fl.clientId) });
      if (!user) {
        throw new BadRequestException(`No local user found for Fineract Client ID ${fl.clientId}`);
      }

      app = new this.loanApplicationModel({
        userId: user._id,
        fineractLoanId,
        productId: fl.loanProductId || fl.productId,
        capital: fl.principal || 0,
        periodMonth: fl.numberOfRepayments || 0,
        monthlyRatePercent: (fl.annualInterestRate || 0) / 12,
        disbursementDate:
          parseFineractDate(fl.timeline?.actualDisbursementDate) ||
          parseFineractDate(fl.timeline?.expectedDisbursementDate) ||
          new Date().toISOString().split('T')[0],
        disbursementWalletId: new Types.ObjectId(), // Placeholder for external loans
      });
    }

    // 4. Update fields
    app.status = internalStatus;
    app.fineractStatusString = fStatus.value || fStatus.code;
    app.outstandingAmount = summary.totalOutstanding || 0;
    app.totalPenaltyExpected = summary.penaltyChargesOverdue || 0;
    app.totalFeeExpected = summary.feeChargesOverdue || 0;
    app.totalOverdue = summary.totalOverdue || 0;

    // 4a. Sync loan purpose (willing) from Fineract — fallback to product name
    const purposeName = fl.loanPurposeName || fl.loanPurpose?.name || fl.loanProductName || '';
    if (purposeName && !app.willing) {
      app.willing = purposeName;
    }

    // 4b. Sync client display name
    if (fl.clientName || fl.clientDisplayName) {
      app.clientDisplayName = fl.clientName || fl.clientDisplayName;
    }

    // 4c. Ensure capital & periodMonth reflect Fineract data
    if (fl.principal && fl.principal > 0) app.capital = fl.principal;
    if (fl.numberOfRepayments && fl.numberOfRepayments > 0) app.periodMonth = fl.numberOfRepayments;

    // 4d. Sync entirelyPay / monthlyPay from Fineract if not set
    const totalExpected = summary.totalExpectedRepayment || summary.totalRepayment || 0;
    if (totalExpected > 0 && (!app.entirelyPay || app.entirelyPay === 0)) {
      app.entirelyPay = totalExpected;
    }
    if (app.entirelyPay > 0 && app.periodMonth > 0 && (!app.monthlyPay || app.monthlyPay === 0)) {
      app.monthlyPay = Math.round(app.entirelyPay / app.periodMonth);
    }
    this.logger.debug(`[syncLoan] DELINQUENCY DATA for loan ${fineractLoanId}: ${JSON.stringify(dData)}`);
    this.logger.debug(`[syncLoan] DELINQUENCY TAGS for loan ${fineractLoanId}: ${JSON.stringify(dTags)}`);
    this.logger.debug(`[syncLoan] DELINQUENCY ACTIONS for loan ${fineractLoanId}: ${JSON.stringify(dActions)}`);
    this.logger.debug(
      `[syncLoan] RAW fl.delinquent (main call) for loan ${fineractLoanId}: ${JSON.stringify(fl.delinquent)}`,
    );

    // Fineract fix: pastDueDays often returns 0 incorrectly. Use rangeInfo.minimumAgeDays or similar if available.
    app.delinquentDays =
      delinquentInfo?.pastDueDays ||
      delinquentInfo?.delinquentDays ||
      rangeInfo?.minimumAgeDays ||
      rangeInfo?.pastDueDays ||
      0;

    // Fallback: Nếu Fineract trả delinquentDays = 0 nhưng totalOverdue > 0 → tính từ schedule periods
    if (app.delinquentDays === 0 && (summary.totalOverdue ?? 0) > 0) {
      const rawSchedulePeriods = fl.repaymentSchedule?.periods || [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let maxOverdueDays = 0;
      for (const p of rawSchedulePeriods) {
        if (p.period == null || Number(p.period) <= 0) continue;
        const complete = p.complete === true || p.obligationsMetOnDate != null;
        if (complete) continue;
        const due = p.dueDate;
        if (!due) continue;
        let dueDate: Date | null = null;
        if (Array.isArray(due) && due.length >= 3) {
          dueDate = new Date(due[0], due[1] - 1, due[2]);
        } else if (typeof due === 'string') {
          dueDate = new Date(due);
        }
        if (dueDate && !isNaN(dueDate.getTime()) && dueDate < today) {
          const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
          if (diffDays > maxOverdueDays) maxOverdueDays = diffDays;
        }
      }
      if (maxOverdueDays > 0) {
        app.delinquentDays = maxOverdueDays;
        this.logger.warn(
          `[syncLoanFromFineract] Fineract returned delinquentDays=0 but schedule shows ${maxOverdueDays} days overdue for loan ${fineractLoanId}. Using schedule fallback.`,
        );
      }
    }

    app.delinquencyClassification = rangeInfo?.classification ?? delinquentInfo?.classification ?? null;

    // Persist full schedule from Fineract (includes principalPaid/interestPaid per period after allocation)
    const rawPeriods = fl.repaymentSchedule?.periods || [];
    app.repaymentSchedule = rawPeriods;
    // Log first period paid amounts to verify allocation (helps debug "payment not allocated" issues)
    const firstPeriod = rawPeriods.find((p: any) => p.period != null && Number(p.period) > 0);
    if (firstPeriod) {
      this.logger.debug(
        `[syncLoanFromFineract] loan ${fineractLoanId} period 1: principalPaid=${firstPeriod.principalPaid ?? 0} interestPaid=${firstPeriod.interestPaid ?? 0} totalPaidForPeriod=${firstPeriod.totalPaidForPeriod ?? 0}`,
      );
    }
    this.logger.debug(
      `[syncLoanFromFineract] loan ${fineractLoanId} summary.totalRepayment=${summary.totalRepayment ?? 0} totalOverdue=${summary.totalOverdue ?? 0}`,
    );
    app.transactions = fl.transactions || [];
    app.charges = fl.charges || [];
    app.collateral = fl.collateral || [];
    app.guarantors = fl.guarantors || [];

    // Keep disbursementDate in sync with Fineract (source of truth after disbursal)
    const fineractDisbursement =
      parseFineractDate(fl.timeline?.actualDisbursementDate) ||
      parseFineractDate(fl.timeline?.expectedDisbursementDate);
    if (fineractDisbursement) {
      app.disbursementDate = fineractDisbursement;
      app.markModified('disbursementDate');
    }

    // CRITICAL: Validate disbursement vs first period due date (consistency check)
    if (firstPeriod && app.disbursementDate) {
      const firstDueStr = parsePeriodDueDate(firstPeriod.dueDate);
      if (firstDueStr && firstDueStr < app.disbursementDate) {
        this.logger.error(
          `[syncLoanFromFineract] CRITICAL CONSISTENCY: Loan ${fineractLoanId} has disbursementDate=${app.disbursementDate} but first period dueDate=${firstDueStr}. ` +
            'First due date is BEFORE disbursement â€” loan will appear delinquent immediately. Fix in Fineract or correct disbursement/schedule. See: repaymentSchedule vs disbursementDate.',
        );
      }
    }

    // Ensure delinquencyRange is populated with EVERYTHING the frontend expects for the header
    app.delinquencyRange = {
      ...(fl.delinquencyRange || {}),
      ...(dData.delinquencyRange || {}),
      pastDueDays: app.delinquentDays,
      classification: app.delinquencyClassification,
    };

    // Priority for delinquentDate: summaryInfo.overdueSinceDate > dData.delinquent.delinquentDate > dTags earliest
    let overdueDate =
      summaryInfo.overdueSinceDate || dData.delinquent?.delinquentDate || fl.delinquencyRange?.delinquentDate;

    if (!overdueDate && dTags.length > 0) {
      const sortedTags = [...dTags]
        .filter(t => t.addedOnDate)
        .sort((a, b) => {
          const dateA = a.addedOnDate;
          const dateB = b.addedOnDate;
          if (dateA[0] !== dateB[0]) return dateA[0] - dateB[0];
          if (dateA[1] !== dateB[1]) return dateA[1] - dateB[1];
          return dateA[2] - dateB[2];
        });
      if (sortedTags.length > 0) {
        overdueDate = sortedTags[0].addedOnDate;
      }
    }

    if (overdueDate) {
      app.delinquencyRange.delinquentDate = overdueDate;
    }

    app.delinquencyTag = dData.delinquencyTag || fl.delinquencyTag || [];
    app.installmentLevelDelinquency =
      dData.delinquent?.installmentLevelDelinquency || dData.collection?.installmentLevelDelinquency || [];
    app.delinquencyTags = dTags || [];
    app.delinquencyActions = dActions || [];

    // Map Detailed Summary
    app.principalPaid = summary.principalPaid || 0;
    app.principalOutstanding = summary.principalOutstanding || 0;
    app.interestPaid = summary.interestPaid || 0;
    app.interestOutstanding = summary.interestOutstanding || 0;
    app.feePaid = summary.feeChargesPaid || 0;
    app.feeOutstanding = summary.feeChargesOutstanding || 0;
    app.penaltyPaid = summary.penaltyChargesPaid || 0;
    app.penaltyOutstanding = summary.penaltyChargesOutstanding || 0;
    app.totalPaid = summary.totalRepayment || 0;
    app.totalOutstanding = summary.totalOutstanding || 0;
    app.lastPaymentDate = summary.lastPaymentDate;
    app.lastPaymentAmount = summary.lastPaymentAmount;

    // Tên khách hàng từ Fineract (để hiển thị đúng trong danh sách nợ quá hạn)
    const clientId = fl.clientId ?? fl.client?.id;
    if (clientId) {
      try {
        const client = await this.fineractClientService.getClientById(Number(clientId));
        if (client) {
          app.clientDisplayName =
            client.displayName ?? ([client.firstname, client.lastname].filter(Boolean).join(' ')?.trim() || null);
        }
      } catch {
        // keep existing or leave unset
      }
    }

    app.lastSyncedAt = new Date();

    app.markModified('repaymentSchedule');
    app.markModified('transactions');
    app.markModified('charges');
    app.markModified('collateral');
    app.markModified('guarantors');
    app.markModified('delinquencyRange');
    app.markModified('delinquencyTag');
    app.markModified('installmentLevelDelinquency');
    app.markModified('delinquencyTags');
    app.markModified('delinquencyActions');
    app.markModified('principalPaid');
    app.markModified('interestPaid');
    app.markModified('feePaid');
    app.markModified('penaltyPaid');
    app.markModified('totalPaid');
    app.markModified('lastPaymentDate');

    const saved = await app.save();

    await this.syncLoanDelinquencySnapshot(saved, fl, dData).catch((error: any) => {
      this.logger.warn(
        `[syncLoanFromFineract] Failed to upsert loan_delinquency for loan ${fineractLoanId}: ${error?.message}`,
      );
    });

    return saved;
  }

  /**
   * Synchronize all loans for a client
   */
  async syncClientLoansFromFineract(userId: string): Promise<any> {
    const customer = await this.customerService.getCustomerById(userId);
    const clientId = customer.fineractClientId;
    if (!clientId) throw new BadRequestException('Khách hàng chưa có ID Fineract');

    this.logger.log(`[syncClientLoansFromFineract] userId=${userId} clientId=${clientId}`);

    const loans = await this.fineractLoanService.getLoansByClientId(Number(clientId));
    const results: any[] = [];

    for (const loan of loans) {
      try {
        await this.syncLoanFromFineract(loan.id);
        results.push({ id: loan.id, status: 'success' });
      } catch (err) {
        this.logger.error(`[syncClientLoansFromFineract] Error syncing loan ${loan.id}: ${err.message}`);
        results.push({ id: loan.id, status: 'error', message: err.message });
      }
    }

    return { total: loans.length, processed: results };
  }

  /** CÃ¡c trÆ°á»ng theo dÃµi khi Ä‘á»“ng bá»™ khoáº£n vay (Ä‘á»ƒ bÃ¡o cÃ¡o thay Ä‘á»•i nhá» nháº¥t) */
  private static LOAN_SYNC_TRACK_FIELDS: Array<{ key: string; label: string }> = [
    { key: 'status', label: 'Trạng thái' },
    { key: 'outstandingAmount', label: 'Dư nợ' },
    { key: 'totalOverdue', label: 'Tổng quá hạn' },
    { key: 'delinquentDays', label: 'Số ngày quá hạn' },
    { key: 'delinquencyClassification', label: 'Nhóm nợ' },
    { key: 'principalPaid', label: 'Gốc đã trả' },
    { key: 'interestPaid', label: 'Lãi đã trả' },
    { key: 'totalPaid', label: 'Tổng đã trả' },
    // lastSyncedAt bá» khá»i bÃ¡o cÃ¡o vÃ¬ má»—i láº§n sync Ä‘á»u cáº­p nháº­t â†’ luÃ´n "thay Ä‘á»•i", gÃ¢y nhiá»…u
    { key: 'schedulePeriodsCount', label: 'Sá»‘ ká»³ tráº£ ná»£' },
    { key: 'period1PrincipalPaid', label: 'Ká»³ 1 gá»‘c Ä‘Ã£ tráº£' },
  ];

  private snapshotLoanForSyncDiff(doc: any): Record<string, any> {
    if (!doc) return {};
    const periods = Array.isArray(doc.repaymentSchedule) ? doc.repaymentSchedule : doc.repaymentSchedule?.periods || [];
    const firstPeriod = periods.find((p: any) => p.period != null && Number(p.period) > 0);
    return {
      status: doc.status,
      outstandingAmount: doc.outstandingAmount,
      totalOverdue: doc.totalOverdue,
      delinquentDays: doc.delinquentDays,
      delinquencyClassification: doc.delinquencyClassification,
      principalPaid: doc.principalPaid,
      interestPaid: doc.interestPaid,
      totalPaid: doc.totalPaid,
      lastSyncedAt: doc.lastSyncedAt ? new Date(doc.lastSyncedAt).getTime() : null,
      schedulePeriodsCount: periods.length,
      period1PrincipalPaid: firstPeriod?.principalPaid ?? null,
    };
  }

  private diffLoanSnapshots(before: Record<string, any>, after: Record<string, any>): LoanSyncChangeItem[] {
    const changes: LoanSyncChangeItem[] = [];
    for (const { key, label } of AdminLoanService.LOAN_SYNC_TRACK_FIELDS) {
      const b = before[key];
      const a = after[key];
      if (JSON.stringify(b) === JSON.stringify(a)) continue;
      changes.push({ field: key, label, before: b, after: a });
    }
    return changes;
  }

  /**
   * Lấy tất cả khoản vay đã giải ngân từ Fineract (status 300 = Active) và sync vào Mongo.
   * Ghi từng thay đổi (field-level) vào loan_sync_runs.details để truy vết.
   * @param limit số khoản tối đa mỗi lần chạy
   * @param options.trigger 'cron' | 'manual'
   */
  async syncDisbursedLoansFromFineract(
    limit = 300,
    options?: { trigger?: 'cron' | 'manual' },
  ): Promise<{ synced: number; errors: number; skipped: number; orphansRemoved: number; runId?: string }> {
    // Láº¥y táº¥t cáº£ khoáº£n vay (má»i tráº¡ng thÃ¡i), khÃ´ng chá»‰ Active
    const loans = await this.fineractLoanService.getAllLoans(limit);
    const toSync = (loans || []).map((l: any) => l.id ?? l.loanId).filter((id: any) => id != null);
    let synced = 0;
    let errors = 0;
    let skipped = 0;
    const details: LoanSyncRunDetailItem[] = [];

    for (const loanId of toSync) {
      const fid = Number(loanId);
      try {
        const beforeDoc = await this.loanApplicationModel.findOne({ fineractLoanId: fid }).lean();
        const before = this.snapshotLoanForSyncDiff(beforeDoc ?? undefined);

        await this.syncLoanFromFineract(fid);
        synced++;

        const afterDoc = await this.loanApplicationModel.findOne({ fineractLoanId: fid }).lean();
        const after = this.snapshotLoanForSyncDiff(afterDoc ?? undefined);
        const changes = this.diffLoanSnapshots(before, after);
        details.push({ fineractLoanId: fid, status: 'synced', changes: changes.length > 0 ? changes : undefined });
      } catch (err: any) {
        if (err instanceof BadRequestException && err?.message?.includes('No local user found')) {
          skipped++;
          this.logger.debug(`[syncDisbursedLoansFromFineract] Loan ${loanId} skipped (no user for client)`);
          details.push({ fineractLoanId: fid, status: 'skipped', message: 'KhÃ´ng cÃ³ user local cho client' });
        } else {
          this.logger.warn(`[syncDisbursedLoansFromFineract] Loan ${loanId}: ${err?.message}`);
          errors++;
          details.push({ fineractLoanId: fid, status: 'error', message: err?.message ?? 'Lá»—i Ä‘á»“ng bá»™' });
        }
      }
    }

    this.logger.log(
      `[syncDisbursedLoansFromFineract] Done. synced=${synced} errors=${errors} skipped=${skipped} (total from Fineract=${toSync.length})`,
    );

    // ── Orphan cleanup: xóa khoản vay trong Mongo mà Fineract không còn ──
    let orphansRemoved = 0;
    try {
      const fineractIdSet = new Set(toSync.map((id: any) => Number(id)));
      // Tìm tất cả khoản vay trong Mongo có fineractLoanId mà Fineract không còn
      const allLocalLoans = await this.loanApplicationModel
        .find({ fineractLoanId: { $exists: true, $ne: null } })
        .select('fineractLoanId status')
        .lean();
      const orphanIds: number[] = [];
      for (const ll of allLocalLoans) {
        const fid = Number(ll.fineractLoanId);
        if (Number.isFinite(fid) && !fineractIdSet.has(fid)) {
          orphanIds.push(fid);
        }
      }
      if (orphanIds.length > 0) {
        // Đánh dấu khoản vay orphan — không xóa cứng, chỉ đổi status
        const updateResult = await this.loanApplicationModel.updateMany(
          { fineractLoanId: { $in: orphanIds } },
          { $set: { status: 'removed_from_fineract' } },
        );
        orphansRemoved = updateResult.modifiedCount ?? 0;
        this.logger.warn(
          `[syncDisbursedLoansFromFineract] Removed ${orphansRemoved} orphan loans (fineractLoanIds: ${orphanIds.join(', ')})`,
        );
        details.push(
          ...orphanIds.map(fid => ({
            fineractLoanId: fid,
            status: 'orphan_removed' as const,
            message: 'Khoáº£n vay khÃ´ng cÃ²n trÃªn Fineract, Ä‘Ã£ Ä‘Ã¡nh dáº¥u removed_from_fineract',
          })),
        );
      }
    } catch (orphanErr: any) {
      this.logger.warn(`[syncDisbursedLoansFromFineract] Orphan cleanup failed: ${orphanErr?.message}`);
    }

    const trigger = options?.trigger ?? 'manual';
    let runId: string | undefined;
    try {
      const run = await this.loanSyncRunModel.create({
        ranAt: new Date(),
        trigger,
        totalFromFineract: toSync.length,
        synced,
        errorCount: errors,
        skipped,
        orphansRemoved,
        details,
      });
      runId = run._id?.toString();
    } catch (logErr: any) {
      this.logger.warn(`[syncDisbursedLoansFromFineract] Failed to write loan_sync_runs: ${logErr?.message}`);
    }

    return { synced, errors, skipped, orphansRemoved, runId };
  }

  /**
   * Lấy danh sách lần chạy đồng bộ khoản vay (loan_sync_runs) để hiển thị và truy vết.
   */
  async getLoanSyncRuns(limit = 30): Promise<any[]> {
    const runs = await this.loanSyncRunModel.find().sort({ ranAt: -1 }).limit(limit).lean().exec();
    return runs;
  }

  /**
   * Batch sync: sync all active (disbursed) loans from Fineract to MongoDB.
   * Chỉ sync các khoản đã có trong Mongo. Để gồm cả khoản tạo trên Fineract, dùng syncDisbursedLoansFromFineract.
   * @param limit max loans per run (default 200)
   */
  async syncAllActiveLoansFromFineract(limit = 200): Promise<{ synced: number; errors: number; details: any[] }> {
    const apps = await this.loanApplicationModel
      .find({ status: 'disbursed', fineractLoanId: { $exists: true, $ne: null } })
      .select('fineractLoanId')
      .limit(limit)
      .lean()
      .exec();

    const details: any[] = [];
    let errors = 0;

    for (const app of apps) {
      try {
        await this.syncLoanFromFineract(app.fineractLoanId!);
        details.push({ fineractLoanId: app.fineractLoanId, status: 'success' });
      } catch (err: any) {
        this.logger.warn(`[syncAllActiveLoansFromFineract] Loan ${app.fineractLoanId}: ${err?.message}`);
        details.push({ fineractLoanId: app.fineractLoanId, status: 'error', message: err?.message });
        errors++;
      }
    }

    this.logger.log(`[syncAllActiveLoansFromFineract] Done. synced=${apps.length - errors} errors=${errors}`);
    return { synced: apps.length - errors, errors, details };
  }

  /**
   * Láº¥y danh sÃ¡ch nhÃ³m quÃ¡ háº¡n (delinquency ranges) tá»« Fineract Ä‘á»ƒ dÃ¹ng cho filter.
   * Fallback: distinct classification tá»« Mongo náº¿u Fineract lá»—i.
   */
  async getDelinquencyRangesForFilter(): Promise<
    Array<{ id: number; classification: string; minimumAgeDays?: number }>
  > {
    const fromFineract = await this.fineractLoanService.getDelinquencyRanges();
    if (fromFineract?.length) {
      return fromFineract.map((r: any) => ({
        id: r.id,
        classification: r.classification ?? r.name ?? String(r.id),
        minimumAgeDays: r.minimumAgeDays,
      }));
    }
    const distinct = await this.loanApplicationModel
      .distinct('delinquencyClassification', {
        status: 'disbursed',
        totalOverdue: { $gt: 0 },
        delinquencyClassification: { $exists: true, $nin: [null, ''] },
      })
      .exec();
    return distinct.filter(Boolean).map((classification, i) => ({ id: i + 1, classification }));
  }

  /**
   * Lấy khoản vay quá hạn chi tiết: nhóm quá hạn, khoản quá hạn (từ–đến), số ngày quá hạn (từ–đến).
   * Data từ Mongo (đã sync từ Fineract hàng ngày).
   */
  async getOverdueLoans(filters?: {
    classification?: string;
    minOverdueAmount?: number;
    maxOverdueAmount?: number;
    delinquentDaysMin?: number;
    delinquentDaysMax?: number;
  }): Promise<{
    total: number;
    items: Array<{
      _id: string;
      loanId: string;
      fineractLoanId: number;
      borrowerId: string;
      userId: string;
      customerName: string;
      customerUsername: string;
      fineractClientId?: string;
      capital: number;
      overdueAmount: number;
      debtGroup: number;
      firstOverdueDate: Date | null;
      lastOverdueDate: Date | null;
      status: LoanDelinquencyStatus;
      collectionStage: LoanCollectionStage;
      totalOverdue: number;
      delinquentDays: number;
      delinquencyClassification: string | null;
      lastSyncedAt: Date | null;
    }>;
  }> {
    await this.syncDelinquencyViewFromFineract().catch((error: any) => {
      this.logger.warn(`[getOverdueLoans] Sync from Fineract before read failed: ${error?.message}`);
    });

    const query: any = {
      overdueAmount: { $gt: 0 },
      status: { $in: ['overdue', 'defaulted'] },
    };
    if (filters?.minOverdueAmount != null && filters.minOverdueAmount >= 0) {
      query.overdueAmount.$gte = filters.minOverdueAmount;
    }
    if (filters?.maxOverdueAmount != null && filters.maxOverdueAmount >= 0) {
      query.overdueAmount.$lte = filters.maxOverdueAmount;
    }
    if (filters?.delinquentDaysMin != null && filters.delinquentDaysMin >= 0) {
      query.delinquentDays = query.delinquentDays ?? {};
      query.delinquentDays.$gte = filters.delinquentDaysMin;
    }
    if (filters?.delinquentDaysMax != null && filters.delinquentDaysMax >= 0) {
      query.delinquentDays = query.delinquentDays ?? {};
      query.delinquentDays.$lte = filters.delinquentDaysMax;
    }

    const delinquencies = await this.loanDelinquencyModel
      .find(query)
      .sort({ overdueAmount: -1, delinquentDays: -1 })
      .lean()
      .exec();

    const loanObjectIds = delinquencies.map((d: any) => d.loanId).filter(Boolean);
    const apps = await this.loanApplicationModel
      .find({ _id: { $in: loanObjectIds } })
      .populate('userId', 'username profile fineractClientId')
      .lean()
      .exec();
    const appMap = new Map((apps as any[]).map(app => [String(app._id), app]));

    const items = (delinquencies as any[])
      .map(delinquency => {
        const app = appMap.get(String(delinquency.loanId));
        if (!app) return null;

        if (filters?.classification && app.delinquencyClassification !== filters.classification) {
          return null;
        }

        const user = app.userId;
        const profile = user?.profile ?? {};
        const fallbackName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || user?.username || '-';
        // Ưu tiên tên trên Fineract (clientDisplayName); chỉ dùng fallback khi chưa có
        return {
          _id: delinquency._id.toString(),
          loanId: app._id.toString(),
          fineractLoanId: delinquency.fineractLoanId,
          borrowerId: (delinquency.borrowerId ?? app.userId?._id ?? app.userId)?.toString?.() ?? '',
          userId: app.userId?._id?.toString() ?? '',
          customerName: app.clientDisplayName ?? fallbackName,
          customerUsername: user?.username ?? '-',
          fineractClientId: user?.fineractClientId,
          capital: app.capital ?? 0,
          overdueAmount: delinquency.overdueAmount ?? 0,
          debtGroup: delinquency.debtGroup ?? 1,
          firstOverdueDate: delinquency.firstOverdueDate ?? null,
          lastOverdueDate: delinquency.lastOverdueDate ?? null,
          status: delinquency.status,
          collectionStage: delinquency.collectionStage,
          totalOverdue: delinquency.overdueAmount ?? 0,
          delinquentDays: delinquency.delinquentDays ?? 0,
          delinquencyClassification: app.delinquencyClassification ?? null,
          lastSyncedAt: delinquency.lastSyncedAt ?? app.lastSyncedAt ?? null,
        };
      })
      .filter(Boolean) as Array<{
      _id: string;
      loanId: string;
      fineractLoanId: number;
      borrowerId: string;
      userId: string;
      customerName: string;
      customerUsername: string;
      fineractClientId?: string;
      capital: number;
      overdueAmount: number;
      debtGroup: number;
      firstOverdueDate: Date | null;
      lastOverdueDate: Date | null;
      status: LoanDelinquencyStatus;
      collectionStage: LoanCollectionStage;
      totalOverdue: number;
      delinquentDays: number;
      delinquencyClassification: string | null;
      lastSyncedAt: Date | null;
    }>;

    // Khi clientDisplayName trống (sync cũ hoặc lỗi), lấy tên từ Fineract để luôn hiện đúng tên khoản vay
    const needFineractName = items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => !item.customerName || item.customerName === '-');
    if (needFineractName.length > 0) {
      const results = await Promise.all(
        needFineractName.map(async ({ item, idx }) => {
          try {
            const fl = await this.fineractLoanService.getLoanDetails(String(item.fineractLoanId));
            const clientId = fl?.clientId ?? fl?.client?.id;
            if (clientId == null) return { idx, name: null, loanId: item.loanId };
            const client = await this.fineractClientService.getClientById(Number(clientId));
            const name =
              client?.displayName ?? ([client?.firstname, client?.lastname].filter(Boolean).join(' ').trim() || null);
            return { idx, name, loanId: item.loanId };
          } catch {
            return { idx, name: null, loanId: item.loanId };
          }
        }),
      );
      results.forEach(({ idx, name, loanId }) => {
        if (name) {
          items[idx].customerName = name;
          // Lưu vào Mongo để lần sau không cần gọi Fineract
          this.loanApplicationModel
            .updateOne({ _id: loanId }, { $set: { clientDisplayName: name } })
            .exec()
            .catch(() => {});
        }
      });
    }

    return { total: items.length, items };
  }

  /**
   * API riêng cho bảng loan_delinquency.
   * Mặc định sync từ Fineract trước khi đọc để dữ liệu luôn đồng bộ.
   */
  async getLoanDelinquencyList(params?: {
    page?: number;
    limit?: number;
    syncBeforeRead?: boolean;
    status?: LoanDelinquencyStatus;
    collectionStage?: LoanCollectionStage;
    debtGroup?: number;
    borrowerId?: string;
    minOverdueAmount?: number;
    maxOverdueAmount?: number;
    delinquentDaysMin?: number;
    delinquentDaysMax?: number;
  }): Promise<{
    total: number;
    page: number;
    limit: number;
    items: Array<{
      _id: string;
      loanId: string;
      fineractLoanId: number;
      borrowerId: string;
      borrowerName: string;
      borrowerUsername: string;
      debtGroup: number;
      delinquentDays: number;
      overdueAmount: number;
      firstOverdueDate: Date | null;
      lastOverdueDate: Date | null;
      status: LoanDelinquencyStatus;
      collectionStage: LoanCollectionStage;
      lastSyncedAt: Date;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }> {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 20));

    if (params?.syncBeforeRead !== false) {
      await this.syncDelinquencyViewFromFineract().catch((error: any) => {
        this.logger.warn(`[getLoanDelinquencyList] Sync from Fineract failed: ${error?.message}`);
      });
    }

    const query: any = {};
    if (params?.status) query.status = params.status;
    if (params?.collectionStage) query.collectionStage = params.collectionStage;
    if (params?.debtGroup != null) query.debtGroup = params.debtGroup;
    if (params?.borrowerId) query.borrowerId = new Types.ObjectId(params.borrowerId);

    if (params?.minOverdueAmount != null || params?.maxOverdueAmount != null) {
      query.overdueAmount = {};
      if (params?.minOverdueAmount != null) query.overdueAmount.$gte = params.minOverdueAmount;
      if (params?.maxOverdueAmount != null) query.overdueAmount.$lte = params.maxOverdueAmount;
    }

    if (params?.delinquentDaysMin != null || params?.delinquentDaysMax != null) {
      query.delinquentDays = {};
      if (params?.delinquentDaysMin != null) query.delinquentDays.$gte = params.delinquentDaysMin;
      if (params?.delinquentDaysMax != null) query.delinquentDays.$lte = params.delinquentDaysMax;
    }

    const [total, docs] = await Promise.all([
      this.loanDelinquencyModel.countDocuments(query).exec(),
      this.loanDelinquencyModel
        .find(query)
        .sort({ overdueAmount: -1, delinquentDays: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const loanIds = docs.map((d: any) => d.loanId).filter(Boolean);
    const apps = await this.loanApplicationModel
      .find({ _id: { $in: loanIds } })
      .populate('userId', 'username profile')
      .select('_id userId fineractLoanId')
      .lean()
      .exec();
    const appMap = new Map((apps as any[]).map(app => [String(app._id), app]));

    const items = docs.map((doc: any) => {
      const app = appMap.get(String(doc.loanId));
      const user = app?.userId;
      const profile = user?.profile ?? {};
      const borrowerName =
        [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() || user?.username || 'â€“';

      return {
        _id: doc._id.toString(),
        loanId: doc.loanId?.toString?.() ?? '',
        fineractLoanId: doc.fineractLoanId,
        borrowerId: doc.borrowerId?.toString?.() ?? '',
        borrowerName,
        borrowerUsername: user?.username ?? 'â€“',
        debtGroup: doc.debtGroup,
        delinquentDays: doc.delinquentDays,
        overdueAmount: doc.overdueAmount,
        firstOverdueDate: doc.firstOverdueDate ?? null,
        lastOverdueDate: doc.lastOverdueDate ?? null,
        status: doc.status,
        collectionStage: doc.collectionStage,
        lastSyncedAt: doc.lastSyncedAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    });

    return { total, page, limit, items };
  }

  /**
   * Äá»“ng bá»™ dá»¯ liá»‡u ná»£ xáº¥u cho má»™t khoáº£n vay cá»¥ thá»ƒ (API riÃªng).
   */
  async syncOneLoanDelinquency(fineractLoanId: number): Promise<any> {
    await this.syncLoanFromFineract(fineractLoanId);
    const doc = await this.loanDelinquencyModel.findOne({ fineractLoanId }).lean().exec();
    if (!doc) throw new NotFoundException(`Loan delinquency for loan #${fineractLoanId} not found`);
    return doc;
  }

  /**
   * Äá»“ng bá»™ dá»¯ liá»‡u ná»£ xáº¥u cho táº¥t cáº£ khoáº£n vay Ä‘Ã£ giáº£i ngÃ¢n (API riÃªng).
   */
  async syncLoanDelinquencyBatch(
    limit = 200,
  ): Promise<{ total: number; synced: number; errors: number; details: any[] }> {
    const apps = await this.loanApplicationModel
      .find({ status: 'disbursed', fineractLoanId: { $exists: true, $ne: null } })
      .select('fineractLoanId')
      .limit(limit)
      .lean()
      .exec();

    let synced = 0;
    let errors = 0;
    const details: Array<{ fineractLoanId: number; status: 'success' | 'error'; message?: string }> = [];

    for (const app of apps) {
      try {
        await this.syncLoanFromFineract(app.fineractLoanId!);
        synced++;
        details.push({ fineractLoanId: app.fineractLoanId!, status: 'success' });
      } catch (error: any) {
        errors++;
        details.push({
          fineractLoanId: app.fineractLoanId!,
          status: 'error',
          message: error?.message ?? 'sync failed',
        });
      }
    }

    return { total: apps.length, synced, errors, details };
  }

  private async getFineractDebtGroups(): Promise<
    Array<{
      debt_group: number;
      debt_group_name: string;
      min_days: number;
      max_days: number | null;
    }>
  > {
    const ranges = await this.fineractLoanService.getDelinquencyRanges();
    return (ranges || [])
      .map((range: any) => {
        const id = Number(range.id);
        if (!Number.isFinite(id)) return null;
        return {
          debt_group: id,
          debt_group_name: String(range.classification ?? range.name ?? `NhÃ³m ${id}`),
          min_days: Number(range.minimumAgeDays ?? 0),
          max_days: range.maximumAgeDays != null ? Number(range.maximumAgeDays) : null,
        };
      })
      .filter(Boolean) as Array<{
      debt_group: number;
      debt_group_name: string;
      min_days: number;
      max_days: number | null;
    }>;
  }

  private async resolveDebtGroupMetadata(debtGroup: number): Promise<{
    debt_group_name: string;
  }> {
    const groups = await this.getFineractDebtGroups();
    const matched = groups.find(group => group.debt_group === debtGroup);
    if (!matched) {
      throw new BadRequestException(
        `debt_group=${debtGroup} khÃ´ng tá»“n táº¡i trÃªn Fineract delinquency ranges. Vui lÃ²ng Ä‘á»“ng bá»™ cáº¥u hÃ¬nh nhÃ³m ná»£ trÆ°á»›c.`,
      );
    }
    return {
      debt_group_name: matched.debt_group_name,
    };
  }

  async getDelinquencyPolicyDebtGroups() {
    return this.getFineractDebtGroups();
  }

  async getDelinquencyPolicies(filters?: {
    is_active?: boolean;
    debt_group?: number;
    loan_product_id?: number;
    collection_stage?: DelinquencyCollectionStage;
  }) {
    const query: any = {};
    if (filters?.is_active != null) query.is_active = filters.is_active;
    if (filters?.debt_group != null) query.debt_group = filters.debt_group;
    if (filters?.loan_product_id != null) query.loan_product_id = filters.loan_product_id;
    if (filters?.collection_stage) query.collection_stage = filters.collection_stage;

    const list = await this.delinquencyPolicyModel
      .find(query)
      .sort({ loan_product_id: 1, debt_group: 1 })
      .lean()
      .exec();

    // CIC standard day ranges (NHNN TT39) — không lấy từ Fineract nữa
    const CIC_DAY_RANGES: Record<number, { min_days: number; max_days: number | null }> = {
      1: { min_days: 1, max_days: 9 },
      2: { min_days: 10, max_days: 29 },
      3: { min_days: 30, max_days: 89 },
      4: { min_days: 90, max_days: 179 },
      5: { min_days: 180, max_days: null },
    };

    return list.map((item: any) => {
      const { penalty_rate_multiplier: _penalty_rate_multiplier, ...rest } = item;
      const dayRange = CIC_DAY_RANGES[Number(item.debt_group)] ?? { min_days: null, max_days: null };
      return {
        ...rest,
        loan_product_id: item.loan_product_id ?? null,
        loan_product_name: item.loan_product_name ?? null,
        min_days: dayRange.min_days,
        max_days: dayRange.max_days,
        _id: item._id.toString(),
      };
    });
  }

  async createDelinquencyPolicy(dto: CreateDelinquencyPolicyDto) {
    const existing = await this.delinquencyPolicyModel
      .findOne({
        loan_product_id: dto.loan_product_id,
        debt_group: dto.debt_group,
      })
      .lean()
      .exec();
    if (existing) {
      throw new BadRequestException(
        `ÄÃ£ tá»“n táº¡i policy cho product=${dto.loan_product_id}, debt_group=${dto.debt_group}. DÃ¹ng API cáº­p nháº­t thay vÃ¬ táº¡o má»›i.`,
      );
    }

    const metadata = await this.resolveDebtGroupMetadata(dto.debt_group);
    try {
      const policy = await this.delinquencyPolicyModel.create({
        loan_product_id: dto.loan_product_id,
        loan_product_name: dto.loan_product_name || `Loan Product #${dto.loan_product_id}`,
        debt_group: dto.debt_group,
        debt_group_name: dto.debt_group_name || metadata.debt_group_name,
        send_email: dto.send_email,
        send_sms: dto.send_sms,
        send_notification: dto.send_notification,
        apply_penalty: dto.apply_penalty,
        block_new_loan: dto.block_new_loan,
        collection_stage: dto.collection_stage,
        legal_escalation: dto.legal_escalation ?? false,
        is_active: dto.is_active ?? true,
        description: dto.description,
      });
      return policy.toObject();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException(
          `product=${dto.loan_product_id}, debt_group=${dto.debt_group} Ä‘Ã£ cÃ³ policy. Má»—i nhÃ³m ná»£ chá»‰ Ä‘Æ°á»£c cÃ³ 1 policy trong 1 sáº£n pháº©m.`,
        );
      }
      throw error;
    }
  }

  async updateDelinquencyPolicy(id: string, dto: UpdateDelinquencyPolicyDto) {
    const existing = await this.delinquencyPolicyModel.findById(id);
    if (!existing) {
      throw new NotFoundException('Delinquency policy khÃ´ng tá»“n táº¡i');
    }

    const nextProductId = dto.loan_product_id ?? existing.loan_product_id;
    if (nextProductId == null) {
      throw new BadRequestException(
        'Policy cÅ© chÆ°a cÃ³ loan_product_id. Vui lÃ²ng táº¡o láº¡i policy theo tá»«ng sáº£n pháº©m.',
      );
    }

    const nextDebtGroup = dto.debt_group ?? existing.debt_group;
    const metadata = await this.resolveDebtGroupMetadata(nextDebtGroup);

    const duplicate = await this.delinquencyPolicyModel
      .findOne({
        loan_product_id: nextProductId,
        debt_group: nextDebtGroup,
        _id: { $ne: existing._id },
      })
      .select('_id debt_group')
      .lean()
      .exec();
    if (duplicate) {
      throw new ConflictException(
        `product=${nextProductId}, debt_group=${nextDebtGroup} Ä‘Ã£ cÃ³ policy khÃ¡c. Má»—i nhÃ³m ná»£ chá»‰ Ä‘Æ°á»£c cÃ³ 1 policy trong 1 sáº£n pháº©m.`,
      );
    }

    existing.loan_product_id = nextProductId;
    existing.loan_product_name =
      dto.loan_product_name || existing.loan_product_name || `Loan Product #${nextProductId}`;
    existing.debt_group = nextDebtGroup;
    existing.debt_group_name = dto.debt_group_name || metadata.debt_group_name;
    if (dto.send_email != null) existing.send_email = dto.send_email;
    if (dto.send_sms != null) existing.send_sms = dto.send_sms;
    if (dto.send_notification != null) existing.send_notification = dto.send_notification;
    if (dto.apply_penalty != null) existing.apply_penalty = dto.apply_penalty;
    if (dto.block_new_loan != null) existing.block_new_loan = dto.block_new_loan;
    if (dto.collection_stage != null) existing.collection_stage = dto.collection_stage;
    if (dto.legal_escalation != null) existing.legal_escalation = dto.legal_escalation;
    if (dto.is_active != null) existing.is_active = dto.is_active;
    if (dto.description !== undefined) existing.description = dto.description;
    // Legacy cleanup: remove old configurable multiplier from existing documents.
    existing.set('penalty_rate_multiplier', undefined);

    try {
      const saved = await existing.save();
      return saved.toObject();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException(
          `product=${nextProductId}, debt_group=${nextDebtGroup} Ä‘Ã£ cÃ³ policy. Má»—i nhÃ³m ná»£ chá»‰ Ä‘Æ°á»£c cÃ³ 1 policy trong 1 sáº£n pháº©m.`,
        );
      }
      throw error;
    }
  }

  async removeDelinquencyPolicy(id: string) {
    const doc = await this.delinquencyPolicyModel.findByIdAndDelete(id).lean().exec();
    if (!doc) {
      throw new NotFoundException('Delinquency policy khÃ´ng tá»“n táº¡i');
    }
    return { deleted: true };
  }

  /**
   * Danh sÃ¡ch khoáº£n vay thá»‘ng nháº¥t vá»›i filter Ä‘áº§y Ä‘á»§.
   * Káº¿t há»£p Mongo (disbursed/closed) + Fineract (pending/approved).
   */
  async getLoans(filters: {
    page?: number;
    limit?: number;
    status?: 'all' | 'pending' | 'approved' | 'disbursed' | 'overdue' | 'closed';
    productId?: number;
    classification?: string;
    keyword?: string;
    delinquentDaysMin?: number;
    delinquentDaysMax?: number;
    minOverdueAmount?: number;
    maxOverdueAmount?: number;
    disbursementDateFrom?: string;
    disbursementDateTo?: string;
  }): Promise<{
    total: number;
    page: number;
    limit: number;
    items: Array<{
      _id: string;
      fineractLoanId: number;
      userId: string;
      customerName: string;
      customerUsername: string;
      fineractClientId?: string;
      productId: number;
      productName: string;
      capital: number;
      periodMonth: number;
      status: string;
      statusCode?: string;
      delinquencyClassification: string | null;
      totalOverdue: number;
      delinquentDays: number;
      disbursementDate: string | null;
      lastSyncedAt: Date | null;
    }>;
  }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const status = filters.status ?? 'all';
    const paginate = <T>(items: T[]) => {
      const start = (page - 1) * limit;
      return items.slice(start, start + limit);
    };

    const mapAppToItem = (app: any): any => {
      const user = app.userId;
      const profile = user?.profile ?? {};
      const fallbackName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || user?.username || 'â€“';
      const totalOverdue = Number(app.totalOverdue ?? 0);
      const normalizedStatus = app.status === 'disbursed' && totalOverdue > 0 ? 'overdue' : (app.status ?? 'disbursed');
      return {
        _id: app._id.toString(),
        fineractLoanId: app.fineractLoanId,
        userId: app.userId?._id?.toString() ?? '',
        customerName: app.clientDisplayName ?? fallbackName,
        customerUsername: user?.username ?? 'â€“',
        fineractClientId: user?.fineractClientId,
        productId: app.productId ?? 0,
        productName: app.productName ?? String(app.productId),
        productShortName: '',
        capital: app.capital ?? 0,
        periodMonth: app.periodMonth ?? 0,
        monthlyPay: app.monthlyPay ?? 0,
        entirelyPay: app.entirelyPay ?? 0,
        monthlyRatePercent: app.monthlyRatePercent ?? 0,
        willing: app.willing ?? '',
        status: normalizedStatus,
        statusCode: app.fineractStatusString,
        delinquencyClassification: app.delinquencyClassification ?? null,
        totalOverdue,
        delinquentDays: app.delinquentDays ?? 0,
        disbursementDate: app.disbursementDate ?? null,
        createdAt: app.createdAt ?? null,
        lastSyncedAt: app.lastSyncedAt ?? null,
      };
    };

    const applyKeywordFilter = (items: any[]) => {
      if (!filters.keyword?.trim()) return items;
      const search = filters.keyword.toLowerCase().trim();
      return items.filter(
        i =>
          i.customerName?.toLowerCase().includes(search) ||
          i.customerUsername?.toLowerCase().includes(search) ||
          String(i.fineractLoanId).includes(search),
      );
    };

    const applyProductFilter = (items: any[]) => {
      if (filters.productId == null) return items;
      return items.filter(i => i.productId === filters.productId);
    };

    const getPendingItems = async () => {
      const pending = await this.getAllPendingLoans();
      let items = pending.map(fl => ({
        _id: fl._id,
        fineractLoanId: fl.fineractLoanId,
        userId: fl.userId ?? '',
        customerName: fl.clientName ?? 'â€“',
        customerUsername: 'â€“',
        productId: fl.productId,
        productName: fl.productName ?? '',
        productShortName: (fl as any).productShortName ?? '',
        capital: fl.capital ?? 0,
        periodMonth: fl.periodMonth ?? 0,
        monthlyPay: (fl as any).monthlyPay ?? 0,
        entirelyPay: (fl as any).entirelyPay ?? 0,
        monthlyRatePercent: (fl as any).monthlyRatePercent ?? 0,
        willing: (fl as any).willing ?? '',
        status: 'pending',
        statusCode: 'loanStatusType.pendingApproval',
        delinquencyClassification: null,
        totalOverdue: 0,
        delinquentDays: 0,
        disbursementDate: (fl as any).disbursementDate ?? null,
        createdAt: (fl as any).createdAt ?? null,
        lastSyncedAt: null,
        aiScore: (fl as any).aiScore ?? null,
      }));
      items = applyProductFilter(applyKeywordFilter(items));
      return items;
    };

    const getApprovedItems = async () => {
      const approvedLoans = await this.fineractLoanService.getLoansByStatus(200).catch(() => []);
      const products = await this.fineractLoanService.getLoanProducts();
      const productMap = new Map(products.map((p: any) => [p.id, p]));
      const fineractClientIds = approvedLoans.map(fl => String(fl.clientId));
      const fineractLoanIds = approvedLoans.map(fl => fl.id).filter(Boolean);
      const [mongoUsers, mongoLoans] = await Promise.all([
        this.userModel.find({ fineractClientId: { $in: fineractClientIds } }).lean(),
        this.loanApplicationModel.find({ fineractLoanId: { $in: fineractLoanIds } }).lean(),
      ]);
      const userMap = new Map(mongoUsers.map((u: any) => [u.fineractClientId, u]));
      const loanMap = new Map(mongoLoans.map((l: any) => [l.fineractLoanId, l]));
      let items = approvedLoans.map(fl => {
        const p: any = productMap.get(fl.productId || fl.loanProductId) ?? {};
        const u = userMap.get(String(fl.clientId));
        const ll: any = loanMap.get(fl.id);
        const annualRate = fl.annualInterestRate ?? 0;
        return {
          _id: ll?._id?.toString() ?? `FL_${fl.id}`,
          fineractLoanId: fl.id,
          userId: u?._id?.toString() ?? '',
          customerName: fl.clientName ?? u?.username ?? 'â€“',
          customerUsername: u?.username ?? 'â€“',
          productId: fl.productId || fl.loanProductId,
          productName: p.name ?? '',
          productShortName: p.shortName ?? '',
          capital: fl.principal ?? ll?.capital ?? 0,
          periodMonth: fl.numberOfRepayments ?? ll?.periodMonth ?? 0,
          monthlyPay: ll?.monthlyPay ?? 0,
          entirelyPay: ll?.entirelyPay ?? 0,
          monthlyRatePercent: ll?.monthlyRatePercent ?? annualRate / 12,
          willing: ll?.willing ?? '',
          status: 'approved',
          statusCode: 'loanStatusType.approved',
          delinquencyClassification: null,
          totalOverdue: 0,
          delinquentDays: 0,
          disbursementDate: fl.timeline?.expectedDisbursementDate ?? ll?.disbursementDate ?? null,
          createdAt: fl.timeline?.submittedOnDate ?? ll?.createdAt ?? null,
          lastSyncedAt: null,
        };
      });
      items = applyProductFilter(applyKeywordFilter(items));
      return items;
    };

    // Pending: Fineract status 100
    if (status === 'pending') {
      const items = await getPendingItems();
      const total = items.length;
      return { total, page, limit, items: paginate(items) };
    }

    // Approved: Fineract status 200 (waiting for disbursal)
    if (status === 'approved') {
      const items = await getApprovedItems();
      const total = items.length;
      return { total, page, limit, items: paginate(items) };
    }

    // disbursed, overdue, closed, all: query Mongo
    const query: any = { fineractLoanId: { $exists: true, $ne: null } };

    if (status === 'disbursed') {
      query.status = 'disbursed';
      query.$or = [{ totalOverdue: { $exists: false } }, { totalOverdue: null }, { totalOverdue: 0 }];
    } else if (status === 'overdue') {
      query.status = 'disbursed';
      query.totalOverdue = { $gt: 0 };
    } else if (status === 'closed') {
      query.status = 'closed';
    } else {
      query.status = { $in: ['disbursed', 'closed'] };
    }

    if (filters.productId != null) query.productId = filters.productId;
    if (filters.classification) query.delinquencyClassification = filters.classification;

    if (filters.keyword?.trim()) {
      const search = filters.keyword.trim();
      const keywordOr: any[] = [{ clientDisplayName: { $regex: search, $options: 'i' } }];
      const loanIdNum = Number(search);
      if (!isNaN(loanIdNum)) keywordOr.push({ fineractLoanId: loanIdNum });
      const matchingUsers = await this.userModel
        .find({
          $or: [
            { username: { $regex: search, $options: 'i' } },
            { 'profile.firstName': { $regex: search, $options: 'i' } },
            { 'profile.lastName': { $regex: search, $options: 'i' } },
          ],
        })
        .select('_id')
        .lean();
      if (matchingUsers.length > 0) {
        keywordOr.push({ userId: { $in: matchingUsers.map((u: any) => u._id) } });
      }
      query.$and = query.$and ?? [];
      query.$and.push({ $or: keywordOr });
    }

    if (filters.minOverdueAmount != null && filters.minOverdueAmount > 0) {
      query.totalOverdue = query.totalOverdue ?? { $gt: 0 };
      if (typeof query.totalOverdue === 'object') {
        query.totalOverdue.$gte = filters.minOverdueAmount;
      }
    }
    if (filters.maxOverdueAmount != null && filters.maxOverdueAmount >= 0) {
      query.totalOverdue = query.totalOverdue ?? { $gt: 0 };
      if (typeof query.totalOverdue === 'object') {
        query.totalOverdue.$lte = filters.maxOverdueAmount;
      }
    }
    if (filters.delinquentDaysMin != null && filters.delinquentDaysMin >= 0) {
      query.delinquentDays = query.delinquentDays ?? {};
      query.delinquentDays.$gte = filters.delinquentDaysMin;
    }
    if (filters.delinquentDaysMax != null && filters.delinquentDaysMax >= 0) {
      query.delinquentDays = query.delinquentDays ?? {};
      query.delinquentDays.$lte = filters.delinquentDaysMax;
    }
    if (filters.disbursementDateFrom || filters.disbursementDateTo) {
      query.disbursementDate = {};
      if (filters.disbursementDateFrom) query.disbursementDate.$gte = filters.disbursementDateFrom;
      if (filters.disbursementDateTo) query.disbursementDate.$lte = filters.disbursementDateTo;
    }

    const mongoQuery = this.loanApplicationModel
      .find(query)
      .sort({ totalOverdue: -1, delinquentDays: -1, lastSyncedAt: -1 })
      .populate('userId', 'username profile fineractClientId')
      .lean();

    if (status !== 'all') {
      mongoQuery.skip((page - 1) * limit).limit(limit);
    }

    const apps = await mongoQuery.exec();

    const count = status === 'all' ? 0 : await this.loanApplicationModel.countDocuments(query);

    const products = await this.fineractLoanService.getLoanProducts();
    const productMap = new Map(products.map((p: any) => [p.id, p]));
    const mongoItems = (apps as any[]).map(app => {
      const item = mapAppToItem(app);
      const p: any = productMap.get(app.productId);
      if (p) {
        item.productName = p.name ?? item.productName;
        item.productShortName = p.shortName ?? '';
      }
      return item;
    });

    if (status === 'all') {
      const [pendingItems, approvedItems] = await Promise.all([getPendingItems(), getApprovedItems()]);
      const allItems = [...pendingItems, ...approvedItems, ...mongoItems].sort(
        (a, b) => Number(b.fineractLoanId ?? 0) - Number(a.fineractLoanId ?? 0),
      );
      return {
        total: allItems.length,
        page,
        limit,
        items: paginate(allItems),
      };
    }

    return { total: count, page, limit, items: mongoItems };
  }

  /**
   * Thá»‘ng kÃª nhanh khoáº£n vay theo tráº¡ng thÃ¡i.
   */
  async getLoansStats(): Promise<{
    total: number;
    pending: number;
    approved: number;
    disbursed: number;
    overdue: number;
    closed: number;
  }> {
    const [mongoCounts, pendingCount, approvedCount] = await Promise.all([
      this.loanApplicationModel.aggregate([
        { $match: { fineractLoanId: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: null,
            disbursed: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$status', 'disbursed'] }, { $lte: [{ $ifNull: ['$totalOverdue', 0] }, 0] }] },
                  1,
                  0,
                ],
              },
            },
            overdue: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$status', 'disbursed'] }, { $gt: [{ $ifNull: ['$totalOverdue', 0] }, 0] }] },
                  1,
                  0,
                ],
              },
            },
            closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
          },
        },
      ]),
      this.fineractLoanService.getLoansByStatus(100).then(r => r.length),
      this.fineractLoanService.getLoansByStatus(200).then(r => r.length),
    ]);

    const agg = mongoCounts[0] ?? {};
    const disbursed = agg.disbursed ?? 0;
    const overdue = agg.overdue ?? 0;
    const closed = agg.closed ?? 0;

    return {
      total: disbursed + overdue + closed + pendingCount + approvedCount,
      pending: pendingCount,
      approved: approvedCount,
      disbursed,
      overdue,
      closed,
    };
  }

  async getLoanDocuments(fineractLoanId: number) {
    this.logger.log(`[getLoanDocuments] fineractLoanId=${fineractLoanId}`);
    const fineractDocs = await this.fineractLoanService.getLoanDocuments(fineractLoanId);

    // Find matching loan in MongoDB to get our metadata
    const app = await this.loanApplicationModel.findOne({ fineractLoanId }).lean().exec();
    if (!app || !app.documents || app.documents.length === 0) {
      return fineractDocs;
    }

    // Map documentType names
    const docTypeIds = app.documents.map(d => d.documentTypeId).filter(id => id && Types.ObjectId.isValid(id));

    const docTypes = await this.documentTypeModel
      .find({ _id: { $in: docTypeIds } })
      .lean()
      .exec();
    const typeMap = new Map(docTypes.map(t => [t._id.toString(), t.name]));

    // Enrich Fineract docs with Mongo data (including reviewStatus)
    return fineractDocs.map(fd => {
      const mongoDoc = app.documents.find(md => md.fineractDocumentId == fd.id);
      if (mongoDoc) {
        const typeIdStr = mongoDoc.documentTypeId?.toString();
        return {
          ...fd,
          documentTypeId: mongoDoc.documentTypeId,
          documentTypeName:
            typeIdStr && typeIdStr !== 'unknown' ? typeMap.get(typeIdStr) || 'Unknown' : fd.name || 'Fineract Document',
          originalName: mongoDoc.name,
          uploadedAt: mongoDoc.uploadedAt,
          reviewStatus: mongoDoc.reviewStatus ?? 'pending',
          reviewedAt: mongoDoc.reviewedAt,
        };
      }
      return { ...fd, reviewStatus: 'pending' };
    });
  }

  async approveDocument(fineractLoanId: number, documentId: number) {
    const app = await this.loanApplicationModel.findOne({ fineractLoanId }).exec();
    if (!app) throw new BadRequestException(`Khoáº£n vay #${fineractLoanId} khÃ´ng tá»“n táº¡i`);

    this.logger.log(`[approveDocument] fineractLoanId=${fineractLoanId} documentId=${documentId}`);

    // Try matching by fineractDocumentId (loose equality for string vs number)
    let doc = app.documents?.find(d => String(d.fineractDocumentId) === String(documentId));

    if (!doc) {
      this.logger.warn(
        `[approveDocument] Document #${documentId} NOT found in MongoDB records for Loan #${fineractLoanId}. Attempting self-healing...`,
      );

      // 1. If it's the ONLY document in Fineract and we have the ONLY required document pending in Mongo
      // Or simply find any pending document that has NO fineractDocumentId yet
      const pendingWithoutId = app.documents?.find(d => !d.fineractDocumentId && d.reviewStatus === 'pending');

      if (pendingWithoutId) {
        this.logger.log(
          `[approveDocument] Self-healing matching Document #${documentId} to existing pending record [${pendingWithoutId.documentTypeId}]`,
        );
        doc = pendingWithoutId;
        doc.fineractDocumentId = Number(documentId);
        doc.reviewStatus = 'approved';
        doc.reviewedAt = new Date();
      } else {
        // Fallback: fetch from Fineract to at least have a record
        const fineractDocs = await this.fineractLoanService.getLoanDocuments(fineractLoanId);
        const fd = fineractDocs.find(d => d.id == documentId);
        if (!fd) {
          throw new BadRequestException(
            `Tài liệu #${documentId} không thuộc khoản vay #${fineractLoanId} trên Fineract`,
          );
        }

        const newDoc = {
          fineractDocumentId: Number(documentId),
          name: fd.name || 'Fineract Document',
          documentTypeId: 'unknown',
          uploadedAt: new Date(),
          reviewStatus: 'approved' as const,
          reviewedAt: new Date(),
        };
        if (!app.documents) app.documents = [];
        app.documents.push(newDoc as any);
        doc = newDoc as any;
      }
    } else {
      doc.reviewStatus = 'approved';
      doc.reviewedAt = new Date();
      // Ensure ID is number
      doc.fineractDocumentId = Number(documentId);
    }

    app.markModified('documents');
    await app.save();
    this.logger.log(`[approveDocument] SUCCESS: documentId=${documentId} reviewStatus=approved`);
    return { documentId, reviewStatus: 'approved' };
  }

  async rejectDocument(fineractLoanId: number, documentId: number) {
    const app = await this.loanApplicationModel.findOne({ fineractLoanId }).exec();
    if (!app) throw new BadRequestException(`Khoáº£n vay #${fineractLoanId} khÃ´ng tá»“n táº¡i`);

    let doc = app.documents?.find(d => d.fineractDocumentId === documentId);

    if (!doc) {
      const fineractDocs = await this.fineractLoanService.getLoanDocuments(fineractLoanId);
      const fd = fineractDocs.find(d => d.id === documentId);
      if (!fd) {
        throw new BadRequestException(`Tài liệu #${documentId} không thuộc khoản vay #${fineractLoanId} trên Fineract`);
      }

      const newDoc = {
        fineractDocumentId: documentId,
        name: fd.name || 'Fineract Document',
        documentTypeId: 'unknown',
        uploadedAt: new Date(),
        reviewStatus: 'rejected' as const,
        reviewedAt: new Date(),
      };
      if (!app.documents) app.documents = [];
      app.documents.push(newDoc as any);
      doc = newDoc as any;
    } else {
      doc.reviewStatus = 'rejected';
      doc.reviewedAt = new Date();
    }

    app.markModified('documents');
    await app.save();
    return { documentId, reviewStatus: 'rejected' };
  }

  /** Phân loại lại tài liệu (staff gán documentTypeId cho doc unknown) */
  async classifyDocument(fineractLoanId: number, documentId: number, documentTypeId: string) {
    const app = await this.loanApplicationModel.findOne({ fineractLoanId }).exec();
    if (!app) throw new BadRequestException(`Khoản vay #${fineractLoanId} không tồn tại`);

    let doc = app.documents?.find(d => String(d.fineractDocumentId) === String(documentId));

    if (!doc) {
      // Document exists in Fineract but not in MongoDB â€” create it
      this.logger.warn(
        `[classifyDocument] Document #${documentId} not found in MongoDB for loan #${fineractLoanId}. Fetching from Fineract...`,
      );
      const fineractDocs = await this.fineractLoanService.getLoanDocuments(fineractLoanId);
      const fd = fineractDocs.find((d: any) => d.id == documentId);
      if (!fd) {
        throw new BadRequestException(`Tài liệu #${documentId} không thuộc khoản vay #${fineractLoanId} trên Fineract`);
      }

      const newDoc = {
        fineractDocumentId: Number(documentId),
        name: fd.name || fd.fileName || 'Fineract Document',
        documentTypeId,
        uploadedAt: new Date(),
        reviewStatus: 'pending' as const,
      };
      if (!app.documents) app.documents = [];
      app.documents.push(newDoc as any);
      doc = newDoc as any;
      this.logger.log(
        `[classifyDocument] Created new doc record from Fineract: fineractDocumentId=${documentId} type=${documentTypeId}`,
      );
    } else {
      this.logger.log(
        `[classifyDocument] fineractLoanId=${fineractLoanId} documentId=${documentId} oldType=${doc.documentTypeId} -> newType=${documentTypeId}`,
      );
      doc.documentTypeId = documentTypeId;
    }

    app.markModified('documents');
    await app.save();

    return { documentId, documentTypeId };
  }

  /** Kiểm tra khoản vay đã duyệt đủ tài liệu bắt buộc chưa */
  async canApproveLoan(fineractLoanId: number): Promise<{ canApprove: boolean; missingRequired: string[] }> {
    const app = await this.loanApplicationModel.findOne({ fineractLoanId }).exec();
    if (!app) return { canApprove: false, missingRequired: ['Khoản vay không tồn tại'] };

    // HEAL ON THE FLY: If we have an 'unknown' approved doc and a pending typed doc, merge them.
    // Or if we have an 'unknown' approved doc and it's the ONLY one, and we're missing exactly one requirement.
    const documents = app.documents || [];
    const unknownApproved = documents.find(d => d.documentTypeId === 'unknown' && d.reviewStatus === 'approved');
    const pendingWithTypeId = documents.find(d => d.documentTypeId !== 'unknown' && d.reviewStatus === 'pending');

    this.logger.log(
      `[canApproveLoan] fineractLoanId=${fineractLoanId} documents: ${JSON.stringify(documents.map(d => ({ type: d.documentTypeId, name: d.name, status: d.reviewStatus, fid: d.fineractDocumentId })))}`,
    );

    if (unknownApproved && pendingWithTypeId) {
      this.logger.log(`[canApproveLoan] Auto-healing document merge for loan #${fineractLoanId} (unknown+pending)`);
      pendingWithTypeId.fineractDocumentId = unknownApproved.fineractDocumentId;
      pendingWithTypeId.reviewStatus = 'approved';
      pendingWithTypeId.reviewedAt = unknownApproved.reviewedAt;

      // Remove the unknown one
      app.documents = documents.filter(d => d !== unknownApproved) as any;
      app.markModified('documents');
      await app.save();
    }

    const productId = app.productId;
    const requiredDocTypes = await this.loanProductDocModel
      .find({ fineractProductId: productId, required: true })
      .populate('documentTypeId')
      .lean();

    this.logger.log(
      `[canApproveLoan] Required for product ${productId}: ${JSON.stringify(requiredDocTypes.map(r => ({ name: (r.documentTypeId as any)?.name, id: (r.documentTypeId as any)?._id?.toString() })))}`,
    );

    if (requiredDocTypes.length === 0) return { canApprove: true, missingRequired: [] };
    const approvedDocTypeIds = new Set(
      (app.documents || []).filter(d => d.reviewStatus === 'approved').map(d => d.documentTypeId?.toString()),
    );
    this.logger.log(
      `[canApproveLoan] fineractLoanId=${fineractLoanId} approvedDocTypeIds: [${Array.from(approvedDocTypeIds).join(', ')}]`,
    );

    const missingRequired: string[] = [];
    for (const r of requiredDocTypes) {
      const typeId = (r.documentTypeId as any)?._id?.toString();
      const typeName = (r.documentTypeId as any)?.name || 'Tài liệu bắt buộc';
      this.logger.log(
        `[canApproveLoan] Checking required: ${typeName} (${typeId}) -> found: ${approvedDocTypeIds.has(typeId)}`,
      );
      if (!approvedDocTypeIds.has(typeId)) missingRequired.push(typeName);
    }
    return { canApprove: missingRequired.length === 0, missingRequired };
  }

  async getLoanDocumentStream(fineractLoanId: number, documentId: number) {
    this.logger.log(`[getLoanDocumentStream] fineractLoanId=${fineractLoanId} documentId=${documentId}`);
    return this.fineractLoanService.downloadDocument(fineractLoanId, documentId);
  }
}
