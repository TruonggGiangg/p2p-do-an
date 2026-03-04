import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FineractLoanService } from '../fineract/services/fineract-loan.service';
import { FineractClientService } from '../fineract/services/fineract-client.service';
import { FineractSavingsService } from '../fineract/services/fineract-savings.service';
import { KeycloakService } from '../auth/services/keycloak.service';
import { DocumentType } from './schemas/document-type.schema';
import { LoanProductDocumentType } from './schemas/loan-product-document-type.schema';
import { LoanProductSnapshot, SnapshotProductItem } from './schemas/loan-product-snapshot.schema';
import { SyncDriftLog } from './schemas/sync-drift-log.schema';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { ProductDocumentTypeItemDto } from './dto/set-product-document-types.dto';
import { User } from '../users/schemas/user.schema';
import { LoanApplication } from '../loan/schemas/loan-application.schema';
import { Wallet } from '../wallets/schemas/wallet.schema';
import { Notification } from '../loan/schemas/notification.schema';
import { LoanContract } from '../loan/schemas/loan-contract.schema';
import { ContractService } from '../loan/contract.service';

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

const SNAPSHOT_SCOPE = 'default';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(DocumentType.name) private documentTypeModel: Model<DocumentType>,
    @InjectModel(LoanProductDocumentType.name) private loanProductDocModel: Model<LoanProductDocumentType>,
    @InjectModel(LoanProductSnapshot.name) private snapshotModel: Model<LoanProductSnapshot>,
    @InjectModel(SyncDriftLog.name) private syncDriftLogModel: Model<SyncDriftLog>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(LoanApplication.name) private loanApplicationModel: Model<LoanApplication>,
    @InjectModel(Wallet.name) private walletModel: Model<Wallet>,
    @InjectModel(Notification.name) private notificationModel: Model<Notification>,
    @InjectModel(LoanContract.name) private loanContractModel: Model<LoanContract>,
    private readonly fineractLoanService: FineractLoanService,
    private readonly fineractClientService: FineractClientService,
    private readonly fineractSavingsService: FineractSavingsService,
    private readonly keycloakService: KeycloakService,
    @Inject(forwardRef(() => ContractService)) private readonly contractService: ContractService,
  ) {}

  // ---------- Loan products (from Fineract) ----------
  async getLoanProductsForAdmin() {
    const products = await this.fineractLoanService.getLoanProducts();
    return products.map((p: any) => ({
      id: p.id,
      name: p.name,
      shortName: p.shortName,
      interestRatePerPeriod: p.interestRatePerPeriod,
      interestRateFrequencyType: p.interestRateFrequencyType,
      interestType: p.interestType,
    }));
  }

  async getLoanProductDetails(productId: number) {
    return this.fineractLoanService.getLoanProductDetails(productId);
  }

  // ---------- Document types CRUD ----------
  async createDocumentType(dto: CreateDocumentTypeDto) {
    const doc = await this.documentTypeModel.create({
      name: dto.name,
      required: dto.required ?? false,
      description: dto.description,
      fileFormat: dto.fileFormat ?? 'any',
    });
    return doc.toObject();
  }

  async findAllDocumentTypes() {
    const list = await this.documentTypeModel.find().sort({ name: 1 }).lean();
    return list;
  }

  async findOneDocumentType(id: string) {
    const doc = await this.documentTypeModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Loại tài liệu không tồn tại');
    return doc;
  }

  async updateDocumentType(id: string, dto: UpdateDocumentTypeDto) {
    const doc = await this.documentTypeModel.findByIdAndUpdate(id, { $set: dto }, { new: true }).lean();
    if (!doc) throw new NotFoundException('Loại tài liệu không tồn tại');
    return doc;
  }

  async removeDocumentType(id: string) {
    const doc = await this.documentTypeModel.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException('Loại tài liệu không tồn tại');
    await this.loanProductDocModel.deleteMany({ documentTypeId: new Types.ObjectId(id) });
    return { deleted: true };
  }

  // ---------- Loan product <-> Document types ----------
  async getDocumentTypesByProduct(fineractProductId: number) {
    const links = await this.loanProductDocModel
      .find({ fineractProductId })
      .populate('documentTypeId')
      .sort({ name: 1 })
      .lean();
    return links.map((l: any) => ({
      documentTypeId: l.documentTypeId?._id,
      documentType: l.documentTypeId,
      required: l.required,
    }));
  }

  async setDocumentTypesForProduct(fineractProductId: number, items: ProductDocumentTypeItemDto[]) {
    await this.loanProductDocModel.deleteMany({ fineractProductId });
    if (items.length === 0) return { fineractProductId, count: 0 };
    const operations = items.map(item => ({
      updateOne: {
        filter: { fineractProductId, documentTypeId: new Types.ObjectId(item.documentTypeId) },
        update: {
          $set: {
            required: item.required ?? false,
          },
        },
        upsert: true,
      },
    }));
    await this.loanProductDocModel.bulkWrite(operations);
    return { fineractProductId, count: operations.length };
  }

  // ---------- Sync & drift ----------
  async getSnapshot(): Promise<SnapshotProductItem[]> {
    const snap = await this.snapshotModel.findOne({ scope: SNAPSHOT_SCOPE }).lean();
    return snap?.products ?? [];
  }

  async saveSnapshot(products: SnapshotProductItem[]) {
    await this.snapshotModel.findOneAndUpdate(
      { scope: SNAPSHOT_SCOPE },
      { products, updatedAtSnapshot: new Date() },
      { upsert: true },
    );
  }

  async logSyncDrift(added: SnapshotProductItem[], removed: SnapshotProductItem[], modified: SnapshotProductItem[]) {
    const hasDrift = added.length > 0 || removed.length > 0 || modified.length > 0;
    await this.syncDriftLogModel.create({
      syncedAt: new Date(),
      added,
      removed,
      modified,
      hasDrift,
    });
  }

  async getSyncDriftLogs(limit = 20) {
    const logs = await this.syncDriftLogModel.find().sort({ syncedAt: -1 }).limit(limit).lean();
    return logs;
  }

  /**
   * Compare given products with snapshot and return diff. Optionally persist snapshot and log.
   * Pass currentProducts when already fetched (e.g. from LoanService) to avoid double fetch.
   */
  async compareAndSync(
    persist = true,
    currentProducts?: any[],
  ): Promise<{ added: SnapshotProductItem[]; removed: SnapshotProductItem[]; modified: SnapshotProductItem[] }> {
    const raw = currentProducts ?? (await this.fineractLoanService.getLoanProducts());
    const currentNormalized: SnapshotProductItem[] = raw.map((p: any) => ({
      id: p.id,
      name: p.name || '',
      shortName: p.shortName || '',
      interestRatePerPeriod: p.interestRatePerPeriod,
    }));

    const previous = await this.getSnapshot();
    const prevMap = new Map(previous.map(p => [p.id, p]));
    const currMap = new Map(currentNormalized.map(p => [p.id, p]));

    const added: SnapshotProductItem[] = [];
    const removed: SnapshotProductItem[] = [];
    const modified: SnapshotProductItem[] = [];

    for (const [id, curr] of currMap) {
      const prev = prevMap.get(id);
      if (!prev) added.push(curr);
      else if (
        prev.name !== curr.name ||
        prev.shortName !== curr.shortName ||
        prev.interestRatePerPeriod !== curr.interestRatePerPeriod
      ) {
        modified.push(curr);
      }
    }
    for (const [id] of prevMap) {
      if (!currMap.has(id)) removed.push(previous.find(p => p.id === id)!);
    }

    if (persist) {
      await this.saveSnapshot(currentNormalized);
      await this.logSyncDrift(added, removed, modified);
    }
    return { added, removed, modified };
  }

  // ---------- Customers (Fineract-First) ----------

  /**
   * Get inactive Fineract clients (pending approval) enriched with MongoDB data.
   * These are clients with active=false status in Fineract.
   */
  async getPendingApprovalClients(page = 1, limit = 20, keyword?: string) {
    // 1. Fetch all Head Office clients from Fineract
    const headOfficeClientsMap = await this.fineractClientService.getClientsByOffice(HEAD_OFFICE_ID);

    // Filter unique clients and only inactive ones (active === false)
    let uniqueClients = Array.from(headOfficeClientsMap.values()).filter(
      (c, index, self) => self.findIndex(t => t.id === c.id) === index,
    );

    // Filter only inactive clients (pending approval)
    uniqueClients = uniqueClients.filter((fc: any) => fc.active === false);

    // Filter by keyword (displayName, username, email, firstname, lastname, externalId)
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

    // 2. Fetch MongoDB users associated with these clients to enrich data
    const clientIds = uniqueClients.map(c => c.id);
    const mongoUsers = await this.userModel
      .find({ fineractClientId: { $in: clientIds.map(String) } })
      .select('username email profile fineractClientId status kycStatus createdAt kycData')
      .lean();

    const userMap = new Map<string, any>();
    for (const u of mongoUsers) {
      if (u.fineractClientId) userMap.set(String(u.fineractClientId), u);
    }

    // 3. Paginate the list (after keyword filter)
    const total = uniqueClients.length;
    const skip = (page - 1) * limit;
    const pagedClients = uniqueClients.slice(skip, skip + limit);

    // 4. Transform and enrich
    const users = pagedClients.map((fc: any) => {
      const u = userMap.get(String(fc.id));
      return {
        _id: u?._id?.toString() ?? null,
        username: u?.username ?? fc?.externalId ?? `FC_${fc.id}`,
        email: u?.email ?? (fc?.emailAddress || null),
        profile: u?.profile ?? {
          firstName: fc?.firstname,
          lastName: fc?.lastname,
          avatar: null,
        },
        fineractClientId: String(fc.id),
        status: u?.status ?? 'inactive',
        kycStatus: u?.kycStatus ?? 'NONE',
        createdAt: u?.createdAt ?? fc?.submittedOnDate ?? null,
        // Fineract enrichment
        fineractStatus: fc?.status ?? null,
        officeName: fc?.officeName ?? 'Head Office',
        activationDate: parseFineractDate(fc?.timeline?.activationDate ?? fc?.activationDate) ?? null,
        displayName:
          ((fc as any)?.displayName ?? `${(fc as any)?.firstname || ''} ${(fc as any)?.lastname || ''}`.trim()) ||
          (fc as any)?.externalId ||
          String((fc as any)?.id),
        // KYC data if available
        kycCompletedAt: u?.kycData?.metadata?.kycCompletedAt ?? null,
        hasKycData: !!u?.kycData,
      };
    });

    return { users, total, page, limit };
  }

  /**
   * Get all Fineract clients from Head Office (officeId=1) as primary list.
   * Enriches each client with MongoDB user data (profiles, emails) where available.
   */
  async getCustomers(page = 1, limit = 20, keyword?: string) {
    // 1. Fetch Head Office client map from Fineract
    const headOfficeClientsMap = await this.fineractClientService.getClientsByOffice(HEAD_OFFICE_ID);

    // Filter unique clients (Map contains both externalId and id keys)
    let uniqueClients = Array.from(headOfficeClientsMap.values()).filter(
      (c, index, self) => self.findIndex(t => t.id === c.id) === index,
    );

    // Filter by keyword (displayName, username, email, firstname, lastname, externalId)
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

    // 2. Fetch MongoDB users associated with these clients to enrich data
    const clientIds = uniqueClients.map(c => c.id);
    const mongoUsers = await this.userModel
      .find({ fineractClientId: { $in: clientIds.map(String) } })
      .select('username email profile fineractClientId status kycStatus createdAt')
      .lean();

    const userMap = new Map<string, any>();
    for (const u of mongoUsers) {
      if (u.fineractClientId) userMap.set(String(u.fineractClientId), u);
    }

    // 3. Paginate the Fineract list (after keyword filter)
    const total = uniqueClients.length;
    const skip = (page - 1) * limit;
    const pagedClients = uniqueClients.slice(skip, skip + limit);

    // 4. Transform and enrich
    const users = pagedClients.map((fc: any) => {
      const u = userMap.get(String(fc.id));
      return {
        _id: u?._id?.toString() ?? null,
        username: u?.username ?? fc?.externalId ?? `FC_${fc.id}`,
        email: u?.email ?? (fc?.emailAddress || null),
        profile: u?.profile ?? {
          firstName: fc?.firstname,
          lastName: fc?.lastname,
          avatar: null,
        },
        fineractClientId: String(fc.id),
        status: u?.status ?? 'active',
        createdAt: u?.createdAt ?? fc?.activationDate ?? null,
        // Fineract enrichment
        fineractStatus: fc?.status ?? null,
        officeName: fc?.officeName ?? 'Head Office',
        activationDate: parseFineractDate(fc?.timeline?.activationDate ?? fc?.activationDate) ?? null,
        displayName:
          ((fc as any)?.displayName ?? `${(fc as any)?.firstname || ''} ${(fc as any)?.lastname || ''}`.trim()) ||
          (fc as any)?.externalId ||
          String((fc as any)?.id),
        kycStatus: u?.kycStatus ?? 'NONE',
        mobileNo: fc?.mobileNo ?? null,
        staffName: fc?.staffName ?? fc?.staffDisplayName ?? null,
        externalId: fc?.externalId ?? null,
      };
    });

    return { users, total, page, limit };
  }

  async getCustomerById(userId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(userId)) {
      user = await this.userModel
        .findById(userId)
        .select('username email profile fineractClientId status kycStatus createdAt metadata')
        .lean();
    }

    // If not found by Mongo ID, maybe userId is actually a fineractClientId
    if (!user) {
      user = await this.userModel
        .findOne({ fineractClientId: userId })
        .select('username email profile fineractClientId status kycStatus createdAt metadata')
        .lean();
    }

    // Enrich with Fineract client data
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
      createdAt: (user as any)?.createdAt ?? null,
      // Fineract enrichment
      fineractStatus: fc?.status ?? null,
      officeName: fc?.officeName ?? 'Head Office',
      activationDate: parseFineractDate(fc?.timeline?.activationDate ?? fc?.activationDate) ?? null,
      displayName:
        ((fc as any)?.displayName ?? `${(fc as any)?.firstname || ''} ${(fc as any)?.lastname || ''}`.trim()) ||
        user?.username ||
        `FC_${fineractClientId}`,
      mobileNo: fc?.mobileNo ?? fc?.phoneNumber ?? null,
      staffName: fc?.staffName ?? fc?.staffDisplayName ?? 'Chưa phân công',
      externalId: fc?.externalId ?? null,
    };
  }

  /**
   * Get full customer detail (client info + summary + savings + charges + KYC) - like Mifos.
   */
  async getCustomerDetail(userId: string) {
    const customer = await this.getCustomerById(userId);
    const loans = await this.getCustomerLoans(userId);
    // KYC is optional - may not exist for all customers
    let kycDetail: any = null;
    try {
      kycDetail = await this.getKycDetail(userId);
    } catch {
      // Ignore KYC not found errors
    }
    const clientId = customer.fineractClientId ? parseInt(customer.fineractClientId) : null;

    let savingsAccounts: any[] = [];
    let charges: any[] = [];

    if (clientId) {
      try {
        const accountsRes = await this.fineractSavingsService.getSavingsAccounts(clientId);
        savingsAccounts = Array.isArray(accountsRes) ? accountsRes : [];
      } catch {
        /* ignore */
      }
      try {
        charges = await this.fineractClientService.getClientCharges(clientId, true);
      } catch {
        /* ignore */
      }
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

    return {
      customer,
      loans,
      summary,
      savingsAccounts,
      charges,
      kyc: kycDetail,
    };
  }

  /**
   * Get loans for a customer - only P* products, FETCHED DIRECTLY FROM FINERACT.
   * Enriches with MongoDB data for internal IDs if available.
   */
  async getCustomerLoans(userId: string) {
    // 1. Get user to find fineractClientId
    let user: any = null;
    if (Types.ObjectId.isValid(userId)) {
      user = await this.userModel.findById(userId).lean();
    }

    if (!user) {
      // maybe userId is fineractClientId
      user = await this.userModel.findOne({ fineractClientId: userId }).lean();
    }

    const fineractClientId = user?.fineractClientId ?? (userId.startsWith('FC_') ? userId.split('_')[1] : userId);
    if (!fineractClientId) return [];

    // 2. Fetch all loans for this client from Fineract
    const fineractLoans = await this.fineractLoanService.getLoansByClientId(Number(fineractClientId));

    // 3. Get products to filter by 'P*'
    const products = await this.fineractLoanService.getLoanProducts();
    const productMap = new Map(products.map((p: any) => [p.id, p]));

    // 4. Fetch local loan applications to map internal IDs and static data
    const localLoans = user ? await this.loanApplicationModel.find({ userId: user._id }).lean() : [];
    const localLoanMap = new Map<number, any>();
    for (const ll of localLoans) {
      if (ll.fineractLoanId) localLoanMap.set(ll.fineractLoanId, ll);
    }

    // 5. Transform
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

    // Fineract requires: approvedOnDate <= expectedDisbursementDate
    // Use the loan's disbursementDate so approval works even for past-dated loans
    const disbursementDate = app?.disbursementDate; // format: yyyy-MM-dd
    const today = new Date().toISOString().split('T')[0];
    // Use disbursementDate if it exists and is earlier than today (i.e. past-dated)
    let approvedOnDate: string | undefined;
    if (disbursementDate) {
      approvedOnDate = disbursementDate < today ? disbursementDate : today;
    }

    await this.fineractLoanService.approveLoan(fineractLoanId, approvedOnDate);
    await this.loanApplicationModel.updateOne({ fineractLoanId }, { $set: { status: 'approved' } });

    // Tạo hợp đồng vay + gửi thông báo cho người vay
    try {
      await this.contractService.createContractOnApproval(fineractLoanId);
    } catch (err) {
      this.logger.warn(`[approveLoan] Failed to create contract: ${err?.message}`);
      // Không block việc approve nếu tạo contract thất bại
    }

    return { fineractLoanId, status: 'approved' };
  }

  /**
   * Admin disburse loan: Fineract disburse + update MongoDB status
   */
  async disburseLoan(fineractLoanId: number) {
    this.logger.log(`[disburseLoan] fineractLoanId=${fineractLoanId}`);
    const loan = await this.loanApplicationModel.findOne({ fineractLoanId });
    if (!loan)
      throw new BadRequestException(
        `Kho\u1ea3n vay Fineract #${fineractLoanId} kh\u00f4ng t\u1ed3n t\u1ea1i trong h\u1ec7 th\u1ed1ng`,
      );

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

    return { fineractLoanId, status: 'disbursed' };
  }

  async getLoanDetails(fineractLoanId: number) {
    this.logger.log(`[getLoanDetails] fineractLoanId=${fineractLoanId}`);
    return this.fineractLoanService.getLoanDetails(fineractLoanId.toString());
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
    const docTypeIds = app.documents.map(d => d.documentTypeId).filter(Boolean);
    const docTypes = await this.documentTypeModel
      .find({ _id: { $in: docTypeIds } })
      .lean()
      .exec();
    const typeMap = new Map(docTypes.map(t => [t._id.toString(), t.name]));

    // Enrich Fineract docs with Mongo data (including reviewStatus)
    return fineractDocs.map(fd => {
      const mongoDoc = app.documents.find(md => md.fineractDocumentId === fd.id);
      if (mongoDoc) {
        return {
          ...fd,
          documentTypeId: mongoDoc.documentTypeId,
          documentTypeName: typeMap.get(mongoDoc.documentTypeId.toString()) || 'Unknown',
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
    if (!app) throw new BadRequestException(`Khoản vay #${fineractLoanId} không tồn tại`);
    this.logger.log(
      `[approveDocument] fineractLoanId=${fineractLoanId} documentId=${documentId} documents=${JSON.stringify(app.documents?.map(d => ({ id: d.fineractDocumentId, type: typeof d.fineractDocumentId })))}`,
    );
    const doc = app.documents?.find(d => d.fineractDocumentId === documentId);
    if (!doc) throw new BadRequestException(`Tài liệu #${documentId} không thuộc khoản vay này`);
    doc.reviewStatus = 'approved';
    doc.reviewedAt = new Date();
    app.markModified('documents');
    await app.save();
    this.logger.log(`[approveDocument] SAVED: documentId=${documentId} reviewStatus=approved`);
    return { documentId, reviewStatus: 'approved' };
  }

  async rejectDocument(fineractLoanId: number, documentId: number) {
    const app = await this.loanApplicationModel.findOne({ fineractLoanId }).exec();
    if (!app) throw new BadRequestException(`Khoản vay #${fineractLoanId} không tồn tại`);
    const doc = app.documents?.find(d => d.fineractDocumentId === documentId);
    if (!doc) throw new BadRequestException(`Tài liệu #${documentId} không thuộc khoản vay này`);
    doc.reviewStatus = 'rejected';
    doc.reviewedAt = new Date();
    app.markModified('documents');
    await app.save();
    return { documentId, reviewStatus: 'rejected' };
  }

  /** Kiểm tra khoản vay đã duyệt đủ tài liệu bắt buộc chưa */
  async canApproveLoan(fineractLoanId: number): Promise<{ canApprove: boolean; missingRequired: string[] }> {
    const app = await this.loanApplicationModel.findOne({ fineractLoanId }).lean();
    if (!app) return { canApprove: false, missingRequired: ['Khoản vay không tồn tại'] };
    const productId = app.productId;
    const requiredDocTypes = await this.loanProductDocModel
      .find({ fineractProductId: productId, required: true })
      .populate('documentTypeId')
      .lean();
    if (requiredDocTypes.length === 0) return { canApprove: true, missingRequired: [] };
    const approvedDocTypeIds = new Set(
      (app.documents || []).filter(d => d.reviewStatus === 'approved').map(d => d.documentTypeId?.toString()),
    );
    const missingRequired: string[] = [];
    for (const r of requiredDocTypes) {
      const typeId = (r.documentTypeId as any)?._id?.toString();
      const typeName = (r.documentTypeId as any)?.name || 'Tài liệu bắt buộc';
      if (!approvedDocTypeIds.has(typeId)) missingRequired.push(typeName);
    }
    return { canApprove: missingRequired.length === 0, missingRequired };
  }

  async getLoanDocumentStream(fineractLoanId: number, documentId: number) {
    this.logger.log(`[getLoanDocumentStream] fineractLoanId=${fineractLoanId} documentId=${documentId}`);
    return this.fineractLoanService.downloadDocument(fineractLoanId, documentId);
  }

  // ---------- KYC Approvals ----------

  /** Danh sách user có kycStatus = PENDING */
  async getPendingKycUsers() {
    const users = await this.userModel
      .find({ kycStatus: 'PENDING' })
      .select('username email profile fineractClientId kycStatus kycData createdAt')
      .sort({ 'kycData.metadata.kycCompletedAt': -1 })
      .lean();

    return users.map((u: any) => ({
      _id: u._id?.toString(),
      username: u.username,
      email: u.email,
      profile: u.profile,
      fineractClientId: u.fineractClientId,
      kycStatus: u.kycStatus,
      kycCompletedAt: u.kycData?.metadata?.kycCompletedAt,
      displayName: [u.profile?.firstName, u.profile?.lastName].filter(Boolean).join(' ') || u.username,
    }));
  }

  /** Chi tiết KYC của user (OCR + danh sách tài liệu từ Fineract) */
  async getKycDetail(userId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(userId)) {
      user = await this.userModel.findById(userId).lean();
    }
    if (!user) {
      user = await this.userModel.findOne({ fineractClientId: userId }).lean();
    }
    if (!user) throw new NotFoundException('Khách hàng không tồn tại');

    const kycData = user.kycData || {};
    const metadata = kycData.metadata || {};
    const fineractClientDocs = metadata.fineractClientDocs || {};

    const documents: { id: number; name: string; entityType: string; entityId: number; label: string }[] = [];

    const clientId = user.fineractClientId ? parseInt(user.fineractClientId) : null;
    if (clientId) {
      const clientDocs = await this.fineractClientService.getEntityDocuments('clients', clientId);
      for (const d of clientDocs || []) {
        documents.push({
          id: d.id,
          name: d.name || d.fileName || 'document',
          entityType: 'clients',
          entityId: clientId,
          label: d.description || d.name || 'CCCD',
        });
      }
    }

    return {
      user: {
        _id: user._id?.toString(),
        username: user.username,
        email: user.email,
        profile: user.profile,
        fineractClientId: user.fineractClientId,
        kycStatus: user.kycStatus,
      },
      ocr: {
        fullName: kycData.fullName,
        ssn: kycData.ssn,
        dateOfBirth: kycData.dateOfBirth,
        address: kycData.address,
        sex: kycData.sex,
      },
      metadata: {
        kycCompletedAt: metadata.kycCompletedAt,
        fineractClientDocs,
      },
      documents,
    };
  }

  /** Phê duyệt KYC: kích hoạt client trên Fineract + tạo savings account + cập nhật MongoDB + Keycloak */
  async approveKyc(userId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(userId)) {
      user = await this.userModel.findById(userId);
    }
    if (!user) {
      user = await this.userModel.findOne({ fineractClientId: userId });
    }
    if (!user) throw new NotFoundException('Khách hàng không tồn tại');
    if (user.kycStatus !== 'PENDING') {
      throw new BadRequestException(`KYC đã ở trạng thái ${user.kycStatus}, không thể phê duyệt`);
    }

    // 1. Activate client on Fineract
    if (user.fineractClientId) {
      try {
        const clientIdNum = parseInt(user.fineractClientId);
        await this.fineractClientService.activateClient(clientIdNum);
        this.logger.log(`[approveKyc] Activated Fineract client ${clientIdNum}`);
      } catch (err: any) {
        this.logger.error(`[approveKyc] Failed to activate Fineract client: ${err.message}`);
        throw new BadRequestException(`Không thể kích hoạt client trên Fineract: ${err.message}`);
      }
    }

    // 2. Create savings account (e-wallet) after client is activated (if not already exists)
    let savingsAccountId: number | null = null;
    if (user.fineractClientId) {
      const existingWallet = await this.walletModel.findOne({ userId: user._id }).lean();
      if (existingWallet) {
        this.logger.log(`[approveKyc] User already has wallet ${existingWallet.fineractSavingsId}, skipping creation`);
        const parsed = parseInt(existingWallet.fineractSavingsId, 10);
        savingsAccountId = Number.isFinite(parsed) ? parsed : null;
      } else {
        try {
          const clientIdNum = parseInt(user.fineractClientId);
          savingsAccountId = await this.fineractSavingsService.createSavingsAccount(clientIdNum);
          this.logger.log(`[approveKyc] Created savings account ${savingsAccountId} for client ${clientIdNum}`);

          // Create wallet reference in MongoDB
          await this.walletModel.create({
            userId: user._id,
            fineractSavingsId: savingsAccountId.toString(),
          });
          this.logger.log(`[approveKyc] Created wallet reference in MongoDB for savings account ${savingsAccountId}`);
        } catch (err: any) {
          this.logger.error(`[approveKyc] Failed to create savings account: ${err.message}`);
          // Don't fail the approval if wallet creation fails, but log it
        }
      }
    }

    // 3. Update MongoDB
    user.kycStatus = 'VERIFIED';
    user.status = 'active';
    await user.save();

    // 4. Update Keycloak
    if (user.keycloakId) {
      try {
        await this.keycloakService.updateUser(user.keycloakId, {
          kycStatus: 'verified',
          clientStatus: 'active',
        });
        this.logger.log(`[approveKyc] Updated Keycloak kycStatus and clientStatus for ${user.keycloakId}`);
      } catch (err: any) {
        this.logger.warn(`[approveKyc] Keycloak update failed: ${err.message}`);
      }
    }

    return {
      kycStatus: 'VERIFIED',
      status: 'active',
      userId: user._id?.toString(),
      savingsAccountId: savingsAccountId?.toString() || null,
    };
  }

  /** Từ chối KYC */
  async rejectKyc(userId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(userId)) {
      user = await this.userModel.findById(userId);
    }
    if (!user) {
      user = await this.userModel.findOne({ fineractClientId: userId });
    }
    if (!user) throw new NotFoundException('Khách hàng không tồn tại');
    if (user.kycStatus !== 'PENDING') {
      throw new BadRequestException(`KYC đã ở trạng thái ${user.kycStatus}`);
    }

    user.kycStatus = 'REJECTED';
    await user.save();

    if (user.keycloakId) {
      try {
        await this.keycloakService.updateUser(user.keycloakId, { kycStatus: 'rejected' });
      } catch (err: any) {
        this.logger.warn(`[rejectKyc] Keycloak update failed: ${err.message}`);
      }
    }

    return { kycStatus: 'REJECTED', userId: user._id?.toString() };
  }

  /** Stream tài liệu KYC từ Fineract */
  async getKycDocumentStream(userId: string, entityType: string, entityId: number, documentId: number) {
    const detail = await this.getKycDetail(userId);
    const doc = detail.documents.find(
      (d: any) =>
        d.entityType === entityType && Number(d.entityId) === Number(entityId) && Number(d.id) === Number(documentId),
    );
    if (!doc) throw new NotFoundException('Tài liệu không tồn tại');
    return this.fineractClientService.downloadDocument(entityType, entityId, documentId);
  }
}
