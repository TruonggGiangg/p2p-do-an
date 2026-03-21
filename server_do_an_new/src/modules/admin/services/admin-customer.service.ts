/**
 * AdminCustomerService — Customer listing, detail, and loan viewing
 * Extracted from AdminService for maintainability.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FineractClientService } from '../../fineract/services/fineract-client.service';
import { FineractLoanService } from '../../fineract/services/fineract-loan.service';
import { FineractSavingsService } from '../../fineract/services/fineract-savings.service';
import { User } from '../../users/schemas/user.schema';
import { LoanApplication } from '../../loan/schemas/loan-application.schema';

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

@Injectable()
export class AdminCustomerService {
  private readonly logger = new Logger(AdminCustomerService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(LoanApplication.name) private loanApplicationModel: Model<LoanApplication>,
    private readonly fineractClientService: FineractClientService,
    private readonly fineractLoanService: FineractLoanService,
    private readonly fineractSavingsService: FineractSavingsService,
  ) {}

  // ── Pending approval clients ──────────────────────────────────────────────
  async getPendingApprovalClients(page = 1, limit = 20, keyword?: string) {
    const headOfficeClientsMap = await this.fineractClientService.getClientsByOffice(HEAD_OFFICE_ID);
    let uniqueClients = Array.from(headOfficeClientsMap.values()).filter(
      (c, index, self) => self.findIndex(t => t.id === c.id) === index,
    );
    uniqueClients = uniqueClients.filter((fc: any) => fc.active === false);

    if (keyword) {
      const q = keyword.toLowerCase();
      uniqueClients = uniqueClients.filter((fc: any) => {
        const first = (fc.firstname || '').toLowerCase();
        const last = (fc.lastname || '').toLowerCase();
        const ext = (fc.externalId || '').toLowerCase();
        const email = (fc.emailAddress || '').toLowerCase();
        const display = `${first} ${last}`.trim() || ext;
        return first.includes(q) || last.includes(q) || ext.includes(q) || email.includes(q) || display.includes(q);
      });
    }

    const clientIds = uniqueClients.map(c => c.id);
    const mongoUsers = await this.userModel
      .find({ fineractClientId: { $in: clientIds.map(String) } })
      .select('username email profile fineractClientId status kycStatus createdAt kycData')
      .lean();

    const userMap = new Map<string, any>();
    for (const u of mongoUsers) {
      if (u.fineractClientId) userMap.set(String(u.fineractClientId), u);
    }

    const total = uniqueClients.length;
    const skip = (page - 1) * limit;
    const pagedClients = uniqueClients.slice(skip, skip + limit);

    const users = pagedClients.map((fc: any) => {
      const u = userMap.get(String(fc.id));
      return {
        _id: u?._id?.toString() ?? null,
        username: u?.username ?? fc?.externalId ?? `FC_${fc.id}`,
        email: u?.email ?? (fc?.emailAddress || null),
        profile: u?.profile ?? { firstName: fc?.firstname, lastName: fc?.lastname, avatar: null },
        fineractClientId: String(fc.id),
        status: u?.status ?? 'inactive',
        kycStatus: u?.kycStatus ?? 'NONE',
        createdAt: u?.createdAt ?? fc?.submittedOnDate ?? null,
        fineractStatus: fc?.status ?? null,
        officeName: fc?.officeName ?? 'Head Office',
        activationDate: parseFineractDate(fc?.timeline?.activationDate ?? fc?.activationDate) ?? null,
        displayName:
          (fc?.displayName ?? `${fc?.firstname || ''} ${fc?.lastname || ''}`.trim()) ||
          fc?.externalId || String(fc?.id),
        kycCompletedAt: u?.kycData?.metadata?.kycCompletedAt ?? null,
        hasKycData: !!u?.kycData,
      };
    });

    return { users, total, page, limit };
  }

  // ── All customers ─────────────────────────────────────────────────────────
  async getCustomers(page = 1, limit = 20, keyword?: string) {
    const headOfficeClientsMap = await this.fineractClientService.getClientsByOffice(HEAD_OFFICE_ID);
    let uniqueClients = Array.from(headOfficeClientsMap.values()).filter(
      (c, index, self) => self.findIndex(t => t.id === c.id) === index,
    );

    if (keyword) {
      const q = keyword.toLowerCase();
      uniqueClients = uniqueClients.filter((fc: any) => {
        const first = (fc.firstname || '').toLowerCase();
        const last = (fc.lastname || '').toLowerCase();
        const ext = (fc.externalId || '').toLowerCase();
        const email = (fc.emailAddress || '').toLowerCase();
        const display = `${first} ${last}`.trim() || ext;
        return first.includes(q) || last.includes(q) || ext.includes(q) || email.includes(q) || display.includes(q);
      });
    }

    const clientIds = uniqueClients.map(c => c.id);
    const mongoUsers = await this.userModel
      .find({ fineractClientId: { $in: clientIds.map(String) } })
      .select('username email profile fineractClientId status kycStatus createdAt')
      .lean();
    const userMap = new Map<string, any>();
    for (const u of mongoUsers) {
      if (u.fineractClientId) userMap.set(String(u.fineractClientId), u);
    }

    const staffAdminIds = await this.userModel
      .find({ 'metadata.userType': { $in: ['staff', 'admin'] }, fineractClientId: { $exists: true, $ne: null } })
      .select('fineractClientId')
      .lean();
    const excludeClientIds = new Set(staffAdminIds.map((u: any) => String(u.fineractClientId)));
    uniqueClients = uniqueClients.filter((c: any) => !excludeClientIds.has(String(c.id)));

    const total = uniqueClients.length;
    const skip = (page - 1) * limit;
    const pagedClients = uniqueClients.slice(skip, skip + limit);

    const users = pagedClients.map((fc: any) => {
      const u = userMap.get(String(fc.id));
      return {
        _id: u?._id?.toString() ?? null,
        username: u?.username ?? fc?.externalId ?? `FC_${fc.id}`,
        email: u?.email ?? (fc?.emailAddress || null),
        profile: u?.profile ?? { firstName: fc?.firstname, lastName: fc?.lastname, avatar: null },
        fineractClientId: String(fc.id),
        status: u?.status ?? 'active',
        createdAt: u?.createdAt ?? fc?.activationDate ?? null,
        fineractStatus: fc?.status ?? null,
        officeName: fc?.officeName ?? 'Head Office',
        activationDate: parseFineractDate(fc?.timeline?.activationDate ?? fc?.activationDate) ?? null,
        displayName:
          (fc?.displayName ?? `${fc?.firstname || ''} ${fc?.lastname || ''}`.trim()) ||
          fc?.externalId || String(fc?.id),
        kycStatus: u?.kycStatus ?? 'NONE',
        mobileNo: fc?.mobileNo ?? null,
        staffName: fc?.staffName ?? fc?.staffDisplayName ?? null,
        externalId: fc?.externalId ?? null,
      };
    });

    return { users, total, page, limit };
  }

  // ── Customer by ID ────────────────────────────────────────────────────────
  async getCustomerById(userId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(userId)) {
      user = await this.userModel
        .findById(userId)
        .select('username email profile fineractClientId status kycStatus createdAt metadata')
        .lean();
    }
    if (!user) {
      user = await this.userModel
        .findOne({ fineractClientId: userId })
        .select('username email profile fineractClientId status kycStatus createdAt metadata')
        .lean();
    }

    const map = await this.fineractClientService.getClientsByOffice(HEAD_OFFICE_ID);
    const fineractClientId = user?.fineractClientId ?? userId;
    const fc: any = map.get(String(fineractClientId)) ?? (user ? map.get(user.username) : null);
    if (!user && !fc) throw new NotFoundException('Khách hàng không tồn tại');

    return {
      _id: user?._id?.toString() ?? `FC_${fineractClientId}`,
      username: user?.username ?? fc?.externalId ?? `FC_${fineractClientId}`,
      email: user?.email ?? fc?.emailAddress ?? null,
      profile: user?.profile ?? { firstName: fc?.firstname, lastName: fc?.lastname },
      fineractClientId: user?.fineractClientId ?? String(fineractClientId),
      status: user?.status ?? 'active',
      kycStatus: user?.kycStatus ?? 'NONE',
      createdAt: user?.createdAt ?? null,
      fineractStatus: fc?.status ?? null,
      officeName: fc?.officeName ?? 'Head Office',
      activationDate: parseFineractDate(fc?.timeline?.activationDate ?? fc?.activationDate) ?? null,
      displayName:
        (fc?.displayName ?? `${fc?.firstname || ''} ${fc?.lastname || ''}`.trim()) ||
        user?.username || `FC_${fineractClientId}`,
      mobileNo: fc?.mobileNo ?? fc?.phoneNumber ?? null,
      staffName: fc?.staffName ?? fc?.staffDisplayName ?? 'Chưa phân công',
      externalId: fc?.externalId ?? null,
    };
  }

  // ── Customer loans ────────────────────────────────────────────────────────
  async getCustomerLoans(userId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(userId)) {
      user = await this.userModel.findById(userId).lean();
    }
    if (!user) {
      user = await this.userModel.findOne({ fineractClientId: userId }).lean();
    }

    const fineractClientId = user?.fineractClientId ?? (userId.startsWith('FC_') ? userId.split('_')[1] : userId);
    if (!fineractClientId) return [];

    const fineractLoans = await this.fineractLoanService.getLoansByClientId(Number(fineractClientId));
    const products = await this.fineractLoanService.getLoanProducts();
    const productMap = new Map(products.map((p: any) => [p.id, p]));

    const localLoans = user ? await this.loanApplicationModel.find({ userId: user._id }).lean() : [];
    const localLoanMap = new Map<number, any>();
    for (const ll of localLoans) {
      if (ll.fineractLoanId) localLoanMap.set(ll.fineractLoanId, ll);
    }

    this.logger.log(
      `[getCustomerLoans] fineractClientId=${fineractClientId} | Found ${fineractLoans.length} total loans in Fineract`,
    );

    return fineractLoans.map(fl => {
      const productId = fl.productId || fl.loanProductId;
      const p: any = productMap.get(productId);
      const ll: any = localLoanMap.get(fl.id);
      const annualRate = fl.annualInterestRate ?? 0;
      return {
        _id: ll?._id?.toString() ?? `FL_${fl.id}`,
        productId: productId,
        productName: p?.name ?? String(productId),
        productShortName: p?.shortName ?? '',
        capital: fl.principal ?? ll?.capital ?? 0,
        periodMonth: fl.numberOfRepayments ?? ll?.periodMonth ?? 0,
        monthlyPay: ll?.monthlyPay ?? 0,
        entirelyPay: ll?.entirelyPay ?? 0,
        monthlyRatePercent: ll?.monthlyRatePercent ?? annualRate / 12,
        status: fl.status ?? { value: ll?.status ?? 'active', code: ll?.status ?? 'active' },
        fineractLoanId: fl.id,
        disbursementDate: fl.timeline?.actualDisbursementDate ?? ll?.disbursementDate ?? null,
        createdAt: fl.timeline?.submittedOnDate ?? ll?.createdAt ?? null,
        willing: ll?.willing ?? '',
      };
    });
  }

  /**
   * Get full customer detail (client info + summary + savings + charges + KYC).
   * KYC detail is passed in from the facade to avoid circular deps.
   */
  async getCustomerDetail(userId: string, kycDetailFetcher: (uid: string) => Promise<any>) {
    const customer = await this.getCustomerById(userId);
    const loans = await this.getCustomerLoans(userId);
    let kycDetail: any = null;
    try {
      kycDetail = await kycDetailFetcher(userId);
    } catch { /* Ignore KYC not found errors */ }
    const clientId = customer.fineractClientId ? parseInt(customer.fineractClientId) : null;

    let savingsAccounts: any[] = [];
    let charges: any[] = [];
    if (clientId) {
      try {
        const accountsRes = await this.fineractSavingsService.getSavingsAccounts(clientId);
        savingsAccounts = Array.isArray(accountsRes) ? accountsRes : [];
      } catch { /* ignore */ }
      try {
        charges = await this.fineractClientService.getClientCharges(clientId, true);
      } catch { /* ignore */ }
    }

    const activeLoans = loans.filter((l: any) => {
      const code = l.status?.code ?? l.status;
      return String(code || '').includes('active') || String(code || '').includes('disbursed');
    });
    const totalSavings = savingsAccounts
      .filter((s: any) => s.status?.active)
      .reduce((sum: number, s: any) => sum + (Number(s.accountBalance) || 0), 0);
    const lastLoanAmount = loans.length > 0 ? Math.max(...loans.map((l: any) => l.capital || 0)) : 0;

    const summary = {
      loanCycles: loans.length,
      activeLoans: activeLoans.length,
      lastLoanAmount,
      activeSavings: savingsAccounts.filter((s: any) => s.status?.active).length,
      totalSavings,
    };

    return { customer, loans, summary, savingsAccounts, charges, kyc: kycDetail };
  }

  /**
   * Migrate phoneNumbers for all staff users.
   */
  async migratePhoneNumbers() {
    const staffUsers = await this.userModel.find({
      'metadata.userType': 'staff',
      $or: [{ phoneNumber: { $exists: false } }, { phoneNumber: null }, { phoneNumber: '' }],
    });
    let migrated = 0;
    for (const u of staffUsers) {
      if (u.username && /^\d{10,11}$/.test(u.username)) {
        u.phoneNumber = u.username;
        await u.save();
        migrated++;
      }
    }
    return { migrated, total: staffUsers.length };
  }

  /**
   * getCustomerByIdRaw — used for KYC detail fetching
   */
  async getCustomerByIdRaw(userId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(userId)) {
      user = await this.userModel.findById(userId).lean();
    }
    if (!user) {
      user = await this.userModel.findOne({ fineractClientId: userId }).lean();
    }
    if (!user) throw new NotFoundException('Khách hàng không tồn tại');
    return user;
  }
}
