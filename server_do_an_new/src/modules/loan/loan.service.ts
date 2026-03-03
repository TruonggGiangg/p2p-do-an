import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FineractLoanService } from '../fineract/services/fineract-loan.service';
import { AdminService } from '../admin/admin.service';
import { WalletsService } from '../wallets/wallets.service';
import { SmartOtpService } from '../smart-otp/services/smart-otp.service';
import { OtpActionType } from '../smart-otp/enums/otp-action-type.enum';
import { User } from '../users/schemas/user.schema';
import { LoanApplication } from './schemas/loan-application.schema';
import { roundToCurrency } from '../../utils/RoundingUtils';

const DEFAULT_IN_MULTIPLES_OF = 1000;

export interface LoanHistoryItem {
  id: string;
  source: 'mongo' | 'fineract' | 'merged';
  fineractLoanId?: number;
  status: string;
  capital: number;
  periodMonth: number;
  monthlyPay?: number;
  entirelyPay?: number;
  productName?: string;
  disbursementDate?: string;
  createdAt: string;
  schedulePreview?: ScheduleItem[];
  fineractDetails?: any;
}

export interface ScheduleItem {
  period: number;
  principal: number;
  interest: number;
  total: number;
  remainingAfter: number;
  dueDate?: string;
}

export interface LoanScheduleResult {
  monthlyRate: number;
  interestType: string;
  inMultiplesOf: number;
  monthlyPay: number;
  entirelyPay: number;
  totalInterest: number;
  schedulePreview: ScheduleItem[];
}

@Injectable()
export class LoanService {
  private readonly logger = new Logger(LoanService.name);

  constructor(
    private readonly fineractLoanService: FineractLoanService,
    private readonly adminService: AdminService,
    private readonly walletsService: WalletsService,
    private readonly smartOtpService: SmartOtpService,
    @InjectModel(LoanApplication.name) private readonly loanApplicationModel: Model<LoanApplication>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async getLoanProducts() {
    this.logger.log('Fetching loan products from Fineract');
    const allProducts = await this.fineractLoanService.getLoanProducts();

    // Sync: compare with snapshot and log drift for admin (reuse fetched list)
    try {
      await this.adminService.compareAndSync(true, allProducts);
    } catch (e) {
      this.logger.warn('Sync/snapshot failed (non-blocking)', e);
    }

    // Filter products that start with 'P' (similar to original p2p logic)
    return allProducts.filter(
      (p: any) =>
        (p.shortName || '').trim().toUpperCase().startsWith('P') || (p.name || '').trim().toUpperCase().includes('P2P'),
    );
  }

  /**
   * Get full product config (inMultiplesOf, currency, interestType, default rate)
   * Fineract: interestRatePerPeriod = lãi/tháng; annualInterestRate = lãi/năm
   */
  async getProductConfig(productId: number) {
    const product = await this.fineractLoanService.getLoanProductDetails(productId);
    if (!product) {
      throw new NotFoundException(`Sản phẩm vay ${productId} không tồn tại`);
    }
    // Fineract: interestRateFrequencyType (0: Per day, 1: Per week, 2: Per month, 3: Per year)
    const frequencyValue = product.interestRateFrequencyType?.value?.toLowerCase() ?? '';
    const isAnnualFrequency = frequencyValue.includes('year');

    const rawPeriod = product.interestRatePerPeriod ?? 0;
    const rawAnnual = product.annualInterestRate;

    let monthlyRate: number;
    let annualRate: number;

    if (isAnnualFrequency) {
      annualRate = rawAnnual ?? rawPeriod;
      monthlyRate = annualRate / 12;
    } else {
      // Assume monthly if not year (daily/weekly not supported yet in simple app)
      monthlyRate = rawPeriod;
      annualRate = rawAnnual ?? monthlyRate * 12;
    }

    const interestType = product.interestType?.value ?? product.interestType?.code ?? 'Declining Balance';
    const inMultiplesOf = product.currency?.inMultiplesOf ?? DEFAULT_IN_MULTIPLES_OF;
    const minRepayments = product.minNumberOfRepayments ?? 1;
    const maxRepayments = product.maxNumberOfRepayments ?? 360;

    // Fineract lưu minInterestRatePerPeriod/maxInterestRatePerPeriod theo cùng frequency với interestRatePerPeriod
    const rawMinRate = product.minInterestRatePerPeriod ?? null;
    const rawMaxRate = product.maxInterestRatePerPeriod ?? null;

    return {
      productId,
      name: product.name,
      shortName: product.shortName,
      monthlyRate,
      annualRate,
      interestType,
      inMultiplesOf,
      currency: product.currency?.code ?? 'VND',
      minNumberOfRepayments: minRepayments,
      maxNumberOfRepayments: maxRepayments,
      minInterestRatePerPeriod: rawMinRate, // value in native frequency
      maxInterestRatePerPeriod: rawMaxRate, // value in native frequency
      productInterestRatePerPeriod: product.interestRatePerPeriod ?? rawPeriod,
      isAnnual: isAnnualFrequency,
    };
  }

  /**
   * Lấy danh sách mục đích vay từ Fineract CodeValues (LoanPurpose)
   */
  async getLoanPurposes() {
    const codeValues = await this.fineractLoanService.getLoanPurposeCodeValues();
    return codeValues.map(cv => cv.name);
  }

  /**
   * Document types required for a loan product (for app - user submitting loan).
   */
  async getDocumentTypesByProduct(productId: number) {
    const links = await this.adminService.getDocumentTypesByProduct(productId);
    return links
      .filter((l: any) => l.documentType)
      .map((l: any) => ({
        id: (l.documentType?._id ?? l.documentTypeId)?.toString?.() ?? l.documentTypeId,
        name: l.documentType?.name ?? '',
        required: l.required ?? l.documentType?.required ?? false,
        sortOrder: l.sortOrder ?? l.documentType?.sortOrder ?? 0,
        fieldType: l.documentType?.fieldType ?? 'file',
        options: l.documentType?.options ?? [],
        description: l.documentType?.description ?? '',
      }));
  }

  /**
   * Lấy danh sách phí (charges) của sản phẩm vay từ Fineract
   * Phí lấy động từ Fineract, không hardcode
   */
  async getProductCharges(productId: number) {
    return this.fineractLoanService.getProductCharges(productId);
  }

  /**
   * Calculate loan schedule with rounding (p2p-style: flat vs declining, last-period adjustment)
   */
  calculateLoanSchedule(
    capital: number,
    periodMonth: number,
    monthlyRatePercent: number,
    interestType: string,
    inMultiplesOf: number = DEFAULT_IN_MULTIPLES_OF,
  ): LoanScheduleResult {
    const round = (v: number) => roundToCurrency(v, inMultiplesOf);
    const r = monthlyRatePercent / 100;
    const today = new Date();
    const schedulePreview: ScheduleItem[] = [];
    const isFlat = interestType?.toLowerCase?.().includes('flat') ?? false;

    if (isFlat) {
      // FLAT: gốc chia đều, lãi cố định mỗi tháng; kỳ cuối điều chỉnh để tổng khớp
      const monthlyPrincipalBase = round(capital / periodMonth);
      const totalInterestFlat = capital * r * periodMonth;
      const monthlyInterestBase = round(totalInterestFlat / periodMonth);
      let accumulatedPrincipal = 0;
      let accumulatedInterest = 0;
      let outstanding = capital;

      for (let i = 1; i <= periodMonth; i++) {
        const isLast = i === periodMonth;
        const principal = isLast ? round(capital - accumulatedPrincipal) : monthlyPrincipalBase;
        const interest = isLast ? round(totalInterestFlat - accumulatedInterest) : monthlyInterestBase;
        const total = principal + interest;
        const dueDate = new Date(today);
        dueDate.setMonth(dueDate.getMonth() + i);

        schedulePreview.push({
          period: i,
          principal,
          interest,
          total,
          remainingAfter: Math.max(0, round(outstanding - principal)),
          dueDate: dueDate.toISOString().split('T')[0],
        });
        outstanding -= principal;
        accumulatedPrincipal += principal;
        accumulatedInterest += interest;
      }
    } else {
      // DECLINING BALANCE (EMI)
      const rawEmi =
        r > 0
          ? (capital * r * Math.pow(1 + r, periodMonth)) / (Math.pow(1 + r, periodMonth) - 1)
          : capital / periodMonth;
      const monthlyPay = round(rawEmi);
      let outstanding = capital;
      let totalPaid = 0;

      for (let i = 1; i <= periodMonth; i++) {
        const interest = round(outstanding * r);
        const principal = i < periodMonth ? monthlyPay - interest : outstanding;
        const payment = i < periodMonth ? monthlyPay : principal + interest;
        const roundedPrincipal = round(principal);
        const dueDate = new Date(today);
        dueDate.setMonth(dueDate.getMonth() + i);

        schedulePreview.push({
          period: i,
          principal: roundedPrincipal,
          interest,
          total: payment,
          remainingAfter: Math.max(0, round(outstanding - roundedPrincipal)),
          dueDate: dueDate.toISOString().split('T')[0],
        });
        outstanding -= roundedPrincipal;
        totalPaid += payment;
      }
    }

    const entirelyPay = schedulePreview.reduce((s, it) => s + it.total, 0);
    const monthlyPay = periodMonth > 0 ? round(entirelyPay / periodMonth) : 0;

    return {
      monthlyRate: monthlyRatePercent,
      interestType: isFlat ? 'Lãi cố định (Flat)' : 'Dư nợ giảm dần',
      inMultiplesOf,
      monthlyPay,
      entirelyPay,
      totalInterest: entirelyPay - capital,
      schedulePreview,
    };
  }

  /**
   * Rate preview: tính lịch trả nợ theo cấu hình sản phẩm
   */
  async ratePreview(dto: { capital: number; periodMonth: number; productId: number; monthlyRatePercent?: number }) {
    const config = await this.getProductConfig(dto.productId);
    const monthlyRate = dto.monthlyRatePercent ?? config.monthlyRate;
    const result = this.calculateLoanSchedule(
      dto.capital,
      dto.periodMonth,
      monthlyRate,
      config.interestType,
      config.inMultiplesOf,
    );
    return result;
  }

  /**
   * Create loan application: MongoDB + Fineract (create→approve→disburse, học theo p2p)
   */
  async createApplication(
    userId: string,
    dto: {
      capital: number;
      periodMonth: number;
      productId: number;
      monthlyRatePercent?: number;
      willing?: string;
      disbursementDate: string;
      disbursementWalletId: string;
      documents?: Array<{ documentTypeId: string; name: string; uri?: string; fieldType?: string }>;
      otpSessionId?: string;
    },
  ) {
    this.logger.log(
      `[createApplication] START | userId=${userId} capital=${dto.capital} periodMonth=${dto.periodMonth} productId=${dto.productId}`,
    );

    // 0. Smart OTP: bắt buộc đăng ký và xác thực OTP khi tạo khoản vay
    const devices = await this.smartOtpService.getRegisteredDevices(userId);
    if (devices.length === 0) {
      throw new BadRequestException('Bạn cần đăng ký Smart OTP trong Profile trước khi tạo khoản vay.');
    }
    if (!dto.otpSessionId) {
      throw new BadRequestException('Vui lòng xác thực OTP để tạo khoản vay.');
    }
    const consumeResult = await this.smartOtpService.consumeSession(
      userId,
      dto.otpSessionId,
      OtpActionType.LOAN_CREATE,
    );
    if (!consumeResult.valid) {
      throw new BadRequestException(consumeResult.message);
    }
    this.logger.log(`[createApplication] Smart OTP session consumed: ${dto.otpSessionId}`);

    // 1. Validate wallet belongs to user
    await this.walletsService.ensureWalletBelongsToUser(dto.disbursementWalletId, userId);
    this.logger.log(`[createApplication] Wallet validated`);

    // 2. Get user fineractClientId
    const user = await this.userModel.findById(userId).select('fineractClientId').lean().exec();
    const fineractClientId = user?.fineractClientId ? Number(user.fineractClientId) : null;
    if (!fineractClientId) {
      this.logger.error(`[createApplication] User ${userId} has no fineractClientId`);
      throw new BadRequestException('Bạn cần liên kết ví điện tử trước khi tạo khoản vay');
    }
    this.logger.log(`[createApplication] fineractClientId=${fineractClientId}`);

    // 3. Get config and validate product constraints (Fineract min/max)
    const config = await this.getProductConfig(dto.productId);
    const minRep = config.minNumberOfRepayments ?? 1;
    const maxRep = config.maxNumberOfRepayments ?? 360;

    if (dto.periodMonth < minRep || dto.periodMonth > maxRep) {
      const msg =
        minRep === maxRep
          ? `Sản phẩm "${config.name}" chỉ cho phép kỳ hạn ${minRep} tháng`
          : `Kỳ hạn phải từ ${minRep} đến ${maxRep} tháng (sản phẩm: ${config.name})`;
      this.logger.warn(`[createApplication] Validation: periodMonth=${dto.periodMonth} not in [${minRep},${maxRep}]`);
      throw new BadRequestException(msg);
    }

    const monthlyRate = dto.monthlyRatePercent ?? config.monthlyRate;
    // config.minInterestRatePerPeriod / maxInterestRatePerPeriod giờ đã là %/tháng (đã convert từ backend)
    let rateForFineract: number;

    // Fineract expect rate per period (tháng hoặc năm tùy product)
    const minRate = config.isAnnual
      ? (config.minInterestRatePerPeriod ?? 0) * 12
      : (config.minInterestRatePerPeriod ?? 0);
    const maxRate = config.isAnnual
      ? (config.maxInterestRatePerPeriod ?? config.annualRate) * 12
      : (config.maxInterestRatePerPeriod ?? config.annualRate / 12);
    const requestedRate = config.isAnnual ? monthlyRate * 12 : monthlyRate;

    if (minRate === maxRate && minRate > 0) {
      rateForFineract = minRate;
      this.logger.log(`[createApplication] Product fixed rate: interestRatePerPeriod=${rateForFineract}`);
    } else {
      rateForFineract = Math.max(minRate || requestedRate, Math.min(maxRate || requestedRate, requestedRate));
      this.logger.log(
        `[createApplication] Rate clamped: ${rateForFineract} (isAnnual=${config.isAnnual}, min=${minRate} max=${maxRate})`,
      );
    }

    const schedule = this.calculateLoanSchedule(
      dto.capital,
      dto.periodMonth,
      monthlyRate,
      config.interestType,
      config.inMultiplesOf,
    );
    this.logger.log(
      `[createApplication] Schedule: monthlyPay=${schedule.monthlyPay} entirelyPay=${schedule.entirelyPay}`,
    );

    // 4. Parse disbursementDate (client gửi yyyy-MM-dd hoặc ISO)
    let expectedDisbursementDate = dto.disbursementDate;
    if (expectedDisbursementDate && expectedDisbursementDate.includes('T')) {
      expectedDisbursementDate = expectedDisbursementDate.split('T')[0];
    }
    if (!expectedDisbursementDate) {
      expectedDisbursementDate = new Date().toISOString().split('T')[0];
    }
    this.logger.log(`[createApplication] expectedDisbursementDate=${expectedDisbursementDate}`);

    // 5. Create MongoDB record first
    const doc = await this.loanApplicationModel.create({
      userId: new Types.ObjectId(userId),
      productId: dto.productId,
      capital: dto.capital,
      periodMonth: dto.periodMonth,
      monthlyRatePercent: monthlyRate,
      interestType: schedule.interestType,
      inMultiplesOf: config.inMultiplesOf,
      willing: dto.willing,
      disbursementDate: dto.disbursementDate,
      disbursementWalletId: new Types.ObjectId(dto.disbursementWalletId),
      status: 'pending',
      schedulePreview: schedule.schedulePreview,
      monthlyPay: schedule.monthlyPay,
      entirelyPay: schedule.entirelyPay,
      documents: (dto.documents ?? []).map(d => ({
        documentTypeId: d.documentTypeId,
        name: d.name,
        uri: d.uri,
        uploadedAt: new Date(),
        // Non-file types (text/select/button) are auto-approved since they don't need admin review
        ...(d.fieldType && d.fieldType !== 'file' ? { reviewStatus: 'approved' } : {}),
      })),
    });
    this.logger.log(`[createApplication] MongoDB doc created id=${doc._id}`);

    // 6. Create on Fineract (chỉ tạo, KHÔNG approve/disburse - trạng thái "Đã nộp, chờ phê duyệt")
    try {
      const fineractLoanId = await this.fineractLoanService.createLoanApplication({
        clientId: fineractClientId,
        productId: dto.productId,
        principal: dto.capital,
        numberOfRepayments: dto.periodMonth,
        interestRatePerPeriod: rateForFineract, // theo ràng buộc product (min/max)
        expectedDisbursementDate,
      });
      this.logger.log(`[createApplication] Fineract loan created id=${fineractLoanId} (pending approval)`);

      // 7. Update MongoDB with fineractLoanId, giữ status=pending (chờ admin phê duyệt & giải ngân)
      doc.fineractLoanId = fineractLoanId;
      doc.status = 'pending'; // Đã nộp, chờ phê duyệt - KHÔNG auto approve/disburse
      await doc.save();
      this.logger.log(
        `[createApplication] SUCCESS | mongoId=${doc._id} fineractLoanId=${fineractLoanId} status=pending`,
      );
    } catch (fineractError: any) {
      this.logger.error(`[createApplication] Fineract FAILED: ${fineractError.message}`);
      if (fineractError.response?.data) {
        this.logger.error(`[createApplication] Fineract response: ${JSON.stringify(fineractError.response.data)}`);
      }
      throw new BadRequestException(
        fineractError.message || `Không thể tạo khoản vay trên Fineract: ${fineractError.message}`,
      );
    }

    return {
      id: doc._id.toString(),
      status: doc.status,
      fineractLoanId: doc.fineractLoanId,
      capital: doc.capital,
      periodMonth: doc.periodMonth,
      monthlyPay: doc.monthlyPay,
      entirelyPay: doc.entirelyPay,
      disbursementWalletId: doc.disbursementWalletId.toString(),
      schedulePreview: doc.schedulePreview,
    };
  }

  /**
   * Lấy lịch sử khoản vay: User ID -> MongoDB loan_applications -> Fineract (nếu có fineractClientId)
   */
  async getApplicationHistory(userId: string): Promise<LoanHistoryItem[]> {
    const userObjectId = new Types.ObjectId(userId);
    const mongoLoans = await this.loanApplicationModel
      .find({ userId: userObjectId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const user = await this.userModel.findById(userObjectId).select('fineractClientId').lean().exec();
    const fineractClientId = user?.fineractClientId ? Number(user.fineractClientId) : null;

    const resultMap = new Map<string, LoanHistoryItem>();
    const fineractLoanIds = new Set<number>();

    // 1. Chỉ thêm loan từ MongoDB nếu đã có fineractLoanId (đã sync sang Fineract)
    // Bỏ qua đơn "Chờ duyệt" chưa tạo trên Fineract
    for (const doc of mongoLoans) {
      if (!doc.fineractLoanId) continue; // Chỉ hiển thị khoản vay đã tồn tại trên Fineract
      const item: LoanHistoryItem = {
        id: (doc as any)._id.toString(),
        source: 'mongo',
        fineractLoanId: doc.fineractLoanId,
        status: doc.status,
        capital: doc.capital,
        periodMonth: doc.periodMonth,
        monthlyPay: doc.monthlyPay,
        entirelyPay: doc.entirelyPay,
        disbursementDate: doc.disbursementDate,
        createdAt: (doc as any).createdAt?.toISOString?.() ?? new Date().toISOString(),
        schedulePreview: doc.schedulePreview,
      };
      resultMap.set(item.id, item);
      fineractLoanIds.add(doc.fineractLoanId);
    }

    // 2. Nếu có fineractClientId, lấy loans từ Fineract và enrich
    if (fineractClientId) {
      const fineractLoans = await this.fineractLoanService.getLoansByClientId(fineractClientId);

      // Fetch details for all loans in parallel
      const detailsResults = await Promise.all(
        fineractLoans.map(async fl => {
          const loanId = fl.id ?? fl.loanId ?? fl.resourceId;
          if (!loanId) return null;
          try {
            const details = await this.fineractLoanService.getLoanDetails(String(loanId));
            return { fl, details, loanId: Number(loanId) };
          } catch (e) {
            this.logger.error(`[getApplicationHistory] Failed to fetch details for loan ${loanId}`);
            return { fl, details: fl, loanId: Number(loanId) }; // Fallback to basic info
          }
        }),
      );

      for (const res of detailsResults) {
        if (!res) continue;
        const { fl, details, loanId } = res;
        fineractLoanIds.add(loanId);

        const existing = Array.from(resultMap.values()).find(r => r.fineractLoanId === loanId);

        if (existing) {
          existing.source = 'merged';
          existing.fineractDetails = details;
          existing.status = this.mapFineractStatus(details.status?.code) ?? existing.status;
          existing.productName = details.productName ?? details.product?.name;
        } else {
          resultMap.set(`fineract-${loanId}`, {
            id: `fineract-${loanId}`,
            source: 'fineract',
            fineractLoanId: loanId,
            status: this.mapFineractStatus(details.status?.code ?? fl.status?.code) ?? 'unknown',
            capital: details.principal ?? fl.principal ?? 0,
            periodMonth: details.numberOfRepayments ?? fl.numberOfRepayments ?? 0,
            monthlyPay: details.fixedEmiAmount ?? fl.fixedEmiAmount,
            entirelyPay: details.totalExpectedRepayment ?? fl.totalExpectedRepayment,
            disbursementDate: details.timeline?.actualDisbursementDate ?? fl.expectedDisbursementDate,
            createdAt: details.timeline?.submittedOnDate ?? fl.submittedOnDate ?? new Date().toISOString(),
            fineractDetails: details,
            productName: details.productName ?? details.product?.name,
          });
        }
      }
    }

    const list = Array.from(resultMap.values());
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }

  /**
   * Paginated + filtered version of getApplicationHistory
   * Reuses getApplicationHistory (data per user is small), then filters/sorts/paginates in-memory
   */
  async getApplicationHistoryPaginated(
    userId: string,
    options: {
      page: number;
      pageSize: number;
      status?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const allLoans = await this.getApplicationHistory(userId);

    // Summary stats (computed on full unfiltered list)
    const summary = {
      totalActiveLoans: allLoans.filter(l => l.status === 'success' || l.status === 'disbursed').length,
      totalPaidLoans: allLoans.filter(l => l.status === 'clean' || l.status === 'closed').length,
      totalWaitingLoans: allLoans.filter(l => l.status === 'waiting' || l.status === 'pending').length,
      totalOutstanding: 0,
    };

    // Calculate total outstanding from fineractDetails if available
    for (const loan of allLoans) {
      const outstanding = (loan as any).fineractDetails?.summary?.totalOutstanding;
      if (outstanding && typeof outstanding === 'number') {
        summary.totalOutstanding += outstanding;
      }
    }

    // Filter by status
    let filtered = [...allLoans];
    if (options.status) {
      const statusMap: Record<string, string[]> = {
        waiting: ['waiting', 'pending', 'approved'],
        success: ['success', 'disbursed'],
        clean: ['clean', 'closed'],
        fail: ['fail', 'rejected', 'cancelled'],
      };
      const mapped = statusMap[options.status] || [options.status];
      filtered = filtered.filter(l => mapped.includes(l.status));
    }

    // Sort
    const sortBy = options.sortBy || 'createdAt';
    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      if (sortBy === 'amount' || sortBy === 'capital') {
        return ((a.capital || 0) - (b.capital || 0)) * sortOrder;
      }
      if (sortBy === 'status') {
        return (a.status || '').localeCompare(b.status || '') * sortOrder;
      }
      // Default: createdAt
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * sortOrder;
    });

    // Pagination
    const page = Math.max(1, options.page);
    const pageSize = Math.max(1, Math.min(50, options.pageSize));
    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const start = (page - 1) * pageSize;
    const loans = filtered.slice(start, start + pageSize);

    // Enrich loans with progress info for client display
    const enrichedLoans = loans.map(loan => {
      const details = (loan as any).fineractDetails;
      const schedule = details?.repaymentSchedule;
      let progress = 0;
      let paidInstallments = 0;
      let totalInstallments = 0;
      let monthlyPay = loan.monthlyPay || 0;
      let willing = '';

      if (schedule?.periods) {
        const periods = schedule.periods.filter((p: any) => p.period > 0);
        totalInstallments = periods.length;
        paidInstallments = periods.filter((p: any) => p.complete).length;
        progress = totalInstallments > 0 ? (paidInstallments / totalInstallments) * 100 : 0;
      }

      // Get willing/purpose from mongo or fineract
      willing = (loan as any).willing || details?.loanPurposeName || '';

      return {
        ...loan,
        willing,
        progress,
        paidInstallments,
        totalInstallments,
        monthlyPay,
        rate: (loan as any).rate || details?.annualInterestRate || 0,
        statusInfo: details?.status || null,
      };
    });

    return {
      loans: enrichedLoans,
      currentPage: page,
      totalPages,
      totalCount,
      summary,
    };
  }

  private mapFineractStatus(code?: string): string {
    if (!code) return 'unknown';
    const m: Record<string, string> = {
      'loanStatusType.submitted.and.pending.approval': 'pending',
      'loanStatusType.approved': 'approved',
      'loanStatusType.active': 'disbursed',
      'loanStatusType.rejected': 'rejected',
      'loanStatusType.withdrawn.by.client': 'cancelled',
      'loanStatusType.closed.obligations.met': 'closed',
      'loanStatusType.overpaid': 'closed',
    };
    return m[code] ?? code;
  }

  /**
   * Upload tài liệu khoản vay lên Fineract và lưu metadata vào MongoDB
   */
  async uploadDocument(
    userId: string,
    loanId: string, // MongoDB ID
    file: any,
    documentTypeId: string,
  ) {
    const app = await this.loanApplicationModel.findOne({
      _id: new Types.ObjectId(loanId),
      userId: new Types.ObjectId(userId),
    });

    if (!app) throw new NotFoundException('Không tìm thấy đơn vay');
    if (!app.fineractLoanId) throw new BadRequestException('Đơn vay chưa được đồng bộ sang Fineract');

    this.logger.log(`[uploadDocument] Uploading file for loan ${app.fineractLoanId}`);

    // Sử dụng FormData để gửi file lên Fineract
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });
    form.append('name', file.originalname);
    form.append('description', `Document for loan application ${loanId}`);

    const result = await this.fineractLoanService.uploadDocument(app.fineractLoanId, form);

    // Cập nhật metadata trong MongoDB
    const docIndex = app.documents.findIndex(d => d.documentTypeId === documentTypeId);
    const docMetadata = {
      documentTypeId,
      name: file.originalname,
      uri: `/api/loan/${loanId}/documents/${result.resourceId}`,
      fineractDocumentId: result.resourceId,
      uploadedAt: new Date(),
      reviewStatus: 'pending', // Explicitly set pending for admin review
    };

    if (docIndex > -1) {
      app.documents[docIndex] = docMetadata;
    } else {
      app.documents.push(docMetadata);
    }

    await app.save();
    return docMetadata;
  }

  /**
   * Lấy stream file từ Fineract qua Server (Proxy)
   */
  async getFileStream(userId: string, loanId: string, documentId: string) {
    const app = await this.loanApplicationModel.findOne({
      _id: new Types.ObjectId(loanId),
      userId: new Types.ObjectId(userId),
    });

    if (!app) throw new NotFoundException('Không tìm thấy đơn vay');
    if (!app.fineractLoanId) throw new BadRequestException('Đơn vay chưa được đồng bộ');

    // Verify document belongs to this loan in MongoDB metadata (optional but safer)
    const doc = app.documents.find(d => (d as any).fineractDocumentId === Number(documentId));
    if (!doc) {
      this.logger.warn(`Document ${documentId} not found in MongoDB metadata for loan ${loanId}`);
      // Still try to fetch from Fineract if user owns the loan
    }

    return this.fineractLoanService.downloadDocument(app.fineractLoanId, Number(documentId));
  }
}
