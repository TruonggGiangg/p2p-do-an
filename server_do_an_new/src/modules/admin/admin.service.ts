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
import { FineractLoanService } from '../fineract/services/fineract-loan.service';
import { FineractClientService } from '../fineract/services/fineract-client.service';
import { FineractSavingsService } from '../fineract/services/fineract-savings.service';
import { KeycloakService } from '../auth/services/keycloak.service';
import { KeycloakAuthService } from '../auth/services/keycloak-auth.service';
import { DocumentType } from './schemas/document-type.schema';
import { LoanProductDocumentType } from './schemas/loan-product-document-type.schema';
import { LoanProductSnapshot, SnapshotProductItem } from './schemas/loan-product-snapshot.schema';
import {
  SavingsProductSnapshot,
  SnapshotSavingsProductItem,
  SAVINGS_SNAPSHOT_SCOPE,
} from './schemas/savings-product-snapshot.schema';
import { SyncDriftLog, ProductDiffItem } from './schemas/sync-drift-log.schema';
import { LoanSyncRun, type LoanSyncRunDetailItem, type LoanSyncChangeItem } from './schemas/loan-sync-run.schema';
import {
  LoanDelinquency,
  LoanCollectionStage,
  LoanDelinquencyStatus,
} from '../delinquency/entities/loan-delinquency.schema';
import { DelinquencyCollectionStage, DelinquencyPolicy } from '../delinquency/entities/delinquency-policy.schema';
import {
  flattenLoanProduct,
  flattenSavingsProduct,
  diffProducts,
  LOAN_PRODUCT_FIELDS,
  SAVINGS_PRODUCT_FIELDS,
} from './utils/product-sync-fields';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { ProductDocumentTypeItemDto } from './dto/set-product-document-types.dto';
import { User } from '../users/schemas/user.schema';
import { LoanApplication, LoanApplicationStatus } from '../loan/schemas/loan-application.schema';
import { LoanSupportRequest } from '../loan/schemas/loan-support-request.schema';
import { Wallet } from '../wallets/schemas/wallet.schema';
import { Notification } from '../loan/schemas/notification.schema';
import { LoanContract } from '../loan/schemas/loan-contract.schema';
import { ContractService } from '../loan/contract.service';
import { EkycService } from '../ekyc/ekyc.service';
import { FineractSignupService } from 'src/modules/auth/services/fineract-signup.service';
import { RegisterDto } from 'src/modules/auth/dto/register.dto';
import { UpdateStaffDto } from 'src/modules/admin/dto/update-staff.dto';
import { CreateDelinquencyPolicyDto } from '../delinquency/dto/create-delinquency-policy.dto';
import { UpdateDelinquencyPolicyDto } from '../delinquency/dto/update-delinquency-policy.dto';
import { Role } from '../rbac/schemas/role.schema';

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
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(DocumentType.name) private documentTypeModel: Model<DocumentType>,
    @InjectModel(LoanProductDocumentType.name) private loanProductDocModel: Model<LoanProductDocumentType>,
    @InjectModel(LoanProductSnapshot.name) private snapshotModel: Model<LoanProductSnapshot>,
    @InjectModel(SavingsProductSnapshot.name) private savingsSnapshotModel: Model<SavingsProductSnapshot>,
    @InjectModel(SyncDriftLog.name) private syncDriftLogModel: Model<SyncDriftLog>,
    @InjectModel(LoanSyncRun.name) private loanSyncRunModel: Model<LoanSyncRun>,
    @InjectModel(LoanDelinquency.name) private loanDelinquencyModel: Model<LoanDelinquency>,
    @InjectModel(DelinquencyPolicy.name) private delinquencyPolicyModel: Model<DelinquencyPolicy>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(LoanApplication.name) private loanApplicationModel: Model<LoanApplication>,
    @InjectModel(LoanSupportRequest.name) private supportRequestModel: Model<LoanSupportRequest>,
    @InjectModel(Wallet.name) private walletModel: Model<Wallet>,
    @InjectModel(Notification.name) private notificationModel: Model<Notification>,
    @InjectModel(LoanContract.name) private loanContractModel: Model<LoanContract>,
    @InjectModel(Role.name) private roleModel: Model<Role>,
    private readonly fineractSignupService: FineractSignupService,
    private readonly fineractLoanService: FineractLoanService,
    private readonly fineractClientService: FineractClientService,
    private readonly fineractSavingsService: FineractSavingsService,
    private readonly keycloakService: KeycloakService,
    private readonly keycloakAuthService: KeycloakAuthService,
    @Inject(forwardRef(() => ContractService)) private readonly contractService: ContractService,
    private readonly ekycService: EkycService,
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
    if (overdueAmount <= 0 || delinquentDays <= 0) return 1;
    if (delinquentDays <= 10) return 2;
    if (delinquentDays <= 90) return 3;
    if (delinquentDays <= 180) return 4;
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
    if (delinquentDays <= 7) return 'reminder';
    if (delinquentDays <= 30) return 'warning';
    if (delinquentDays <= 90) return 'collection';
    return 'legal';
  }

  private async syncLoanDelinquencySnapshot(app: LoanApplication, fl: any, dData: any): Promise<void> {
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

  async logSyncDrift(
    added: ProductDiffItem[],
    removed: ProductDiffItem[],
    modified: ProductDiffItem[],
    scope: 'loan' | 'savings' = 'loan',
  ) {
    const hasDrift = added.length > 0 || removed.length > 0 || modified.length > 0;
    await this.syncDriftLogModel.create({
      scope,
      syncedAt: new Date(),
      added,
      removed,
      modified,
      hasDrift,
    });
  }

  async getSyncDriftLogs(limit = 20, scope?: 'loan' | 'savings') {
    const filter: any = {};
    if (scope === 'savings') filter.scope = 'savings';
    else if (scope === 'loan') filter.$or = [{ scope: 'loan' }, { scope: { $exists: false } }, { scope: null }];
    const logs = await this.syncDriftLogModel.find(filter).sort({ syncedAt: -1 }).limit(limit).lean();
    return logs;
  }

  /**
   * Compare given products with snapshot and return diff. Optionally persist snapshot and log.
   * So sánh từng trường thông tin, ghi chi tiết fieldChanges cho modified.
   */
  async compareAndSync(
    persist = true,
    currentProducts?: any[],
  ): Promise<{ added: ProductDiffItem[]; removed: ProductDiffItem[]; modified: ProductDiffItem[] }> {
    const raw = currentProducts ?? (await this.fineractLoanService.getLoanProducts());
    const currentNormalized: SnapshotProductItem[] = raw.map((p: any) => flattenLoanProduct(p));

    const previous = await this.getSnapshot();
    const prevMap = new Map(previous.map(p => [p.id, p]));
    const currMap = new Map(currentNormalized.map(p => [p.id, p]));

    const added: ProductDiffItem[] = [];
    const removed: ProductDiffItem[] = [];
    const modified: ProductDiffItem[] = [];

    for (const [id, curr] of currMap) {
      const prev = prevMap.get(id);
      if (!prev) {
        added.push({ id: curr.id, name: curr.name, shortName: curr.shortName });
      } else {
        const fieldChanges = diffProducts(prev, curr, LOAN_PRODUCT_FIELDS);
        if (fieldChanges.length > 0) {
          modified.push({
            id: curr.id,
            name: curr.name,
            shortName: curr.shortName,
            fieldChanges,
          });
        }
      }
    }
    for (const [id] of prevMap) {
      if (!currMap.has(id)) {
        const p = previous.find(x => x.id === id)!;
        removed.push({ id: p.id, name: p.name, shortName: p.shortName });
      }
    }

    if (persist) {
      await this.saveSnapshot(currentNormalized);
      await this.logSyncDrift(added, removed, modified, 'loan');
    }
    return { added, removed, modified };
  }

  // ---------- Savings products (from Fineract) ----------
  async getSavingsProductsForAdmin() {
    const products = await this.fineractSavingsService.getSavingsProducts();
    return products.map((p: any) => ({
      id: p.id,
      name: p.name,
      shortName: p.shortName,
      nominalAnnualInterestRate: p.nominalAnnualInterestRate,
      description: p.description,
      currency: p.currency,
    }));
  }

  async getSavingsProductDetails(productId: number) {
    return this.fineractSavingsService.getSavingsProductDetails(productId);
  }

  async getSavingsSnapshot(): Promise<SnapshotSavingsProductItem[]> {
    const snap = await this.savingsSnapshotModel.findOne({ scope: SAVINGS_SNAPSHOT_SCOPE }).lean();
    return snap?.products ?? [];
  }

  async saveSavingsSnapshot(products: SnapshotSavingsProductItem[]) {
    await this.savingsSnapshotModel.findOneAndUpdate(
      { scope: SAVINGS_SNAPSHOT_SCOPE },
      { products, updatedAtSnapshot: new Date() },
      { upsert: true },
    );
  }

  async compareAndSyncSavings(
    persist = true,
    currentProducts?: any[],
  ): Promise<{ added: ProductDiffItem[]; removed: ProductDiffItem[]; modified: ProductDiffItem[] }> {
    const raw = currentProducts ?? (await this.fineractSavingsService.getSavingsProducts());
    const currentNormalized: SnapshotSavingsProductItem[] = raw.map((p: any) => flattenSavingsProduct(p));

    const previous = await this.getSavingsSnapshot();
    const prevMap = new Map(previous.map(p => [p.id, p]));
    const currMap = new Map(currentNormalized.map(p => [p.id, p]));

    const added: ProductDiffItem[] = [];
    const removed: ProductDiffItem[] = [];
    const modified: ProductDiffItem[] = [];

    for (const [id, curr] of currMap) {
      const prev = prevMap.get(id);
      if (!prev) {
        added.push({ id: curr.id, name: curr.name, shortName: curr.shortName });
      } else {
        const fieldChanges = diffProducts(prev, curr, SAVINGS_PRODUCT_FIELDS);
        if (fieldChanges.length > 0) {
          modified.push({
            id: curr.id,
            name: curr.name,
            shortName: curr.shortName,
            fieldChanges,
          });
        }
      }
    }
    for (const [id] of prevMap) {
      if (!currMap.has(id)) {
        const p = previous.find(x => x.id === id)!;
        removed.push({ id: p.id, name: p.name, shortName: p.shortName });
      }
    }

    if (persist) {
      await this.saveSavingsSnapshot(currentNormalized);
      await this.logSyncDrift(added, removed, modified, 'savings');
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
          (fc?.displayName ?? `${fc?.firstname || ''} ${fc?.lastname || ''}`.trim()) ||
          fc?.externalId ||
          String(fc?.id),
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

    // 2b. Lọc bỏ các client thuộc staff hoặc admin (chỉ hiện khách hàng)
    const staffAdminIds = await this.userModel
      .find({ 'metadata.userType': { $in: ['staff', 'admin'] }, fineractClientId: { $exists: true, $ne: null } })
      .select('fineractClientId')
      .lean();
    const excludeClientIds = new Set(staffAdminIds.map((u: any) => String(u.fineractClientId)));
    uniqueClients = uniqueClients.filter((c: any) => !excludeClientIds.has(String(c.id)));

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
          (fc?.displayName ?? `${fc?.firstname || ''} ${fc?.lastname || ''}`.trim()) ||
          fc?.externalId ||
          String(fc?.id),
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
      createdAt: user?.createdAt ?? null,
      // Fineract enrichment
      fineractStatus: fc?.status ?? null,
      officeName: fc?.officeName ?? 'Head Office',
      activationDate: parseFineractDate(fc?.timeline?.activationDate ?? fc?.activationDate) ?? null,
      displayName:
        (fc?.displayName ?? `${fc?.firstname || ''} ${fc?.lastname || ''}`.trim()) ||
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

    // Tạo hợp đồng vay + gửi thông báo cho người vay
    try {
      await this.contractService.createContractOnApproval(fineractLoanId);
    } catch (err) {
      this.logger.warn(`[approveLoan] Failed to create contract: ${err?.message}`);
      // Không block việc approve nếu tạo contract thất bại
    }

    // Lấy thông tin người vay
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
        `Hợp đồng khoản vay #${fineractLoanId} chưa được ký (trạng thái: ${contract.status}). Người vay cần ký hợp đồng trước khi giải ngân.`,
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

    // Lấy thông tin người vay
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
   * Tính từng kỳ trả nợ (có tiền quá hạn/còn nợ) rơi vào nhóm/thẻ quá hạn nào.
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
      const dueDateStr = dueDate ? dueDate.toISOString().slice(0, 10) : Array.isArray(due) ? due.join('-') : '–';
      const range = sorted.find((r: any) => daysOverdue >= r.min && (r.max == null || daysOverdue <= r.max));
      result.push({
        period: periodNum,
        dueDate: dueDateStr,
        daysOverdue,
        classification: range?.classification ?? (daysOverdue > 0 ? `Quá hạn ${daysOverdue} ngày` : '–'),
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
            'First due date is BEFORE disbursement — loan will appear delinquent immediately. Fix in Fineract or correct disbursement/schedule. See: repaymentSchedule vs disbursementDate.',
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
    const customer = await this.getCustomerById(userId);
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

  /** Các trường theo dõi khi đồng bộ khoản vay (để báo cáo thay đổi nhỏ nhất) */
  private static LOAN_SYNC_TRACK_FIELDS: Array<{ key: string; label: string }> = [
    { key: 'status', label: 'Trạng thái' },
    { key: 'outstandingAmount', label: 'Dư nợ' },
    { key: 'totalOverdue', label: 'Tổng quá hạn' },
    { key: 'delinquentDays', label: 'Số ngày quá hạn' },
    { key: 'delinquencyClassification', label: 'Nhóm nợ' },
    { key: 'principalPaid', label: 'Gốc đã trả' },
    { key: 'interestPaid', label: 'Lãi đã trả' },
    { key: 'totalPaid', label: 'Tổng đã trả' },
    // lastSyncedAt bỏ khỏi báo cáo vì mỗi lần sync đều cập nhật → luôn "thay đổi", gây nhiễu
    { key: 'schedulePeriodsCount', label: 'Số kỳ trả nợ' },
    { key: 'period1PrincipalPaid', label: 'Kỳ 1 gốc đã trả' },
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
    for (const { key, label } of AdminService.LOAN_SYNC_TRACK_FIELDS) {
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
  ): Promise<{ synced: number; errors: number; skipped: number; runId?: string }> {
    // Lấy tất cả khoản vay (mọi trạng thái), không chỉ Active
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
          details.push({ fineractLoanId: fid, status: 'skipped', message: 'Không có user local cho client' });
        } else {
          this.logger.warn(`[syncDisbursedLoansFromFineract] Loan ${loanId}: ${err?.message}`);
          errors++;
          details.push({ fineractLoanId: fid, status: 'error', message: err?.message ?? 'Lỗi đồng bộ' });
        }
      }
    }

    this.logger.log(
      `[syncDisbursedLoansFromFineract] Done. synced=${synced} errors=${errors} skipped=${skipped} (total from Fineract=${toSync.length})`,
    );

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
        details,
      });
      runId = run._id?.toString();
    } catch (logErr: any) {
      this.logger.warn(`[syncDisbursedLoansFromFineract] Failed to write loan_sync_runs: ${logErr?.message}`);
    }

    return { synced, errors, skipped, runId };
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
   * Lấy danh sách nhóm quá hạn (delinquency ranges) từ Fineract để dùng cho filter.
   * Fallback: distinct classification từ Mongo nếu Fineract lỗi.
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
    return (distinct as string[]).filter(Boolean).map((classification, i) => ({ id: i + 1, classification }));
  }

  /**
   * Lọc khoản vay quá hạn chi tiết: nhóm quá hạn, khoản quá hạn (từ–đến), số ngày quá hạn (từ–đến).
   * Data từ Mongo (đã sync từ Fineract hằng ngày).
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
        const fallbackName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || user?.username || '–';
        // Ưu tiên tên trên Fineract (clientDisplayName); chỉ dùng fallback khi chưa có
        return {
          _id: delinquency._id.toString(),
          loanId: app._id.toString(),
          fineractLoanId: delinquency.fineractLoanId,
          borrowerId: (delinquency.borrowerId ?? app.userId?._id ?? app.userId)?.toString?.() ?? '',
          userId: app.userId?._id?.toString() ?? '',
          customerName: app.clientDisplayName ?? fallbackName,
          customerUsername: user?.username ?? '–',
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
      .filter(({ item }) => !item.customerName || item.customerName === '–');
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
        [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() || user?.username || '–';

      return {
        _id: doc._id.toString(),
        loanId: doc.loanId?.toString?.() ?? '',
        fineractLoanId: doc.fineractLoanId,
        borrowerId: doc.borrowerId?.toString?.() ?? '',
        borrowerName,
        borrowerUsername: user?.username ?? '–',
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
   * Đồng bộ dữ liệu nợ xấu cho một khoản vay cụ thể (API riêng).
   */
  async syncOneLoanDelinquency(fineractLoanId: number): Promise<any> {
    await this.syncLoanFromFineract(fineractLoanId);
    const doc = await this.loanDelinquencyModel.findOne({ fineractLoanId }).lean().exec();
    if (!doc) throw new NotFoundException(`Loan delinquency for loan #${fineractLoanId} not found`);
    return doc;
  }

  /**
   * Đồng bộ dữ liệu nợ xấu cho tất cả khoản vay đã giải ngân (API riêng).
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
          debt_group_name: String(range.classification ?? range.name ?? `Nhóm ${id}`),
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
        `debt_group=${debtGroup} không tồn tại trên Fineract delinquency ranges. Vui lòng đồng bộ cấu hình nhóm nợ trước.`,
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

    const [list, groups] = await Promise.all([
      this.delinquencyPolicyModel.find(query).sort({ loan_product_id: 1, debt_group: 1 }).lean().exec(),
      this.getFineractDebtGroups().catch(() => []),
    ] as const);
    const groupMap = new Map<number, { min_days: number; max_days: number | null }>();
    for (const group of groups as Array<{ debt_group: number; min_days: number; max_days: number | null }>) {
      groupMap.set(group.debt_group, { min_days: group.min_days, max_days: group.max_days });
    }

    return list.map((item: any) => {
      const { penalty_rate_multiplier: _penalty_rate_multiplier, ...rest } = item;
      const metadata = groupMap.get(Number(item.debt_group));
      return {
        ...rest,
        loan_product_id: item.loan_product_id ?? null,
        loan_product_name: item.loan_product_name ?? null,
        min_days: metadata?.min_days ?? null,
        max_days: metadata?.max_days ?? null,
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
        `Đã tồn tại policy cho product=${dto.loan_product_id}, debt_group=${dto.debt_group}. Dùng API cập nhật thay vì tạo mới.`,
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
          `product=${dto.loan_product_id}, debt_group=${dto.debt_group} đã có policy. Mỗi nhóm nợ chỉ được có 1 policy trong 1 sản phẩm.`,
        );
      }
      throw error;
    }
  }

  async updateDelinquencyPolicy(id: string, dto: UpdateDelinquencyPolicyDto) {
    const existing = await this.delinquencyPolicyModel.findById(id);
    if (!existing) {
      throw new NotFoundException('Delinquency policy không tồn tại');
    }

    const nextProductId = dto.loan_product_id ?? existing.loan_product_id;
    if (nextProductId == null) {
      throw new BadRequestException('Policy cũ chưa có loan_product_id. Vui lòng tạo lại policy theo từng sản phẩm.');
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
        `product=${nextProductId}, debt_group=${nextDebtGroup} đã có policy khác. Mỗi nhóm nợ chỉ được có 1 policy trong 1 sản phẩm.`,
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
          `product=${nextProductId}, debt_group=${nextDebtGroup} đã có policy. Mỗi nhóm nợ chỉ được có 1 policy trong 1 sản phẩm.`,
        );
      }
      throw error;
    }
  }

  async removeDelinquencyPolicy(id: string) {
    const doc = await this.delinquencyPolicyModel.findByIdAndDelete(id).lean().exec();
    if (!doc) {
      throw new NotFoundException('Delinquency policy không tồn tại');
    }
    return { deleted: true };
  }

  /**
   * Danh sách khoản vay thống nhất với filter đầy đủ.
   * Kết hợp Mongo (disbursed/closed) + Fineract (pending/approved).
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
      const user = app.userId as any;
      const profile = user?.profile ?? {};
      const fallbackName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || user?.username || '–';
      const totalOverdue = Number(app.totalOverdue ?? 0);
      const normalizedStatus = app.status === 'disbursed' && totalOverdue > 0 ? 'overdue' : (app.status ?? 'disbursed');
      return {
        _id: app._id.toString(),
        fineractLoanId: app.fineractLoanId,
        userId: app.userId?._id?.toString() ?? '',
        customerName: app.clientDisplayName ?? fallbackName,
        customerUsername: user?.username ?? '–',
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
        customerName: fl.clientName ?? '–',
        customerUsername: '–',
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
          customerName: fl.clientName ?? u?.username ?? '–',
          customerUsername: u?.username ?? '–',
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
        (query.totalOverdue as any).$gte = filters.minOverdueAmount;
      }
    }
    if (filters.maxOverdueAmount != null && filters.maxOverdueAmount >= 0) {
      query.totalOverdue = query.totalOverdue ?? { $gt: 0 };
      if (typeof query.totalOverdue === 'object') {
        (query.totalOverdue as any).$lte = filters.maxOverdueAmount;
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
   * Thống kê nhanh khoản vay theo trạng thái.
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
    if (!app) throw new BadRequestException(`Khoản vay #${fineractLoanId} không tồn tại`);

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
    if (!app) throw new BadRequestException(`Khoản vay #${fineractLoanId} không tồn tại`);

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

  /** Kiểm tra khoản vay đã duyệt đủ tài liệu bắt buộc chưa */
  async canApproveLoan(fineractLoanId: number): Promise<{ canApprove: boolean; missingRequired: string[] }> {
    const app = await this.loanApplicationModel.findOne({ fineractLoanId }).exec();
    if (!app) return { canApprove: false, missingRequired: ['Khoản vay không tồn tại'] };

    // HEAL ON THE FLY: If we have an 'unknown' approved doc and a pending typed doc, merge them.
    // Or if we have an 'unknown' approved doc and it's the ONLY one, and we're missing exactly one requirement.
    const documents = app.documents || [];
    let unknownApproved = documents.find(d => d.documentTypeId === 'unknown' && d.reviewStatus === 'approved');
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
        issueDate: kycData.issueDate,
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
    // Cho phép phê duyệt khi PENDING (eKYC) hoặc NONE (KYC trực tiếp tại chỗ)
    if (!['PENDING', 'NONE'].includes(user.kycStatus || 'NONE')) {
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
    // Cho phép từ chối khi PENDING (eKYC) hoặc NONE (KYC trực tiếp)
    if (!['PENDING', 'NONE'].includes(user.kycStatus || 'NONE')) {
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

  /** OCR mặt trước CCCD (nhân viên chụp/thêm giúp khách hàng) */
  async ocrFrontForUser(userId: string, imageBuffer: Buffer, filename = 'front.jpg') {
    await this.resolveUser(userId);
    return this.ekycService.ocrFrontID(imageBuffer, filename);
  }

  /** OCR mặt sau CCCD */
  async ocrBackForUser(userId: string, imageBuffer: Buffer, filename = 'back.jpg') {
    await this.resolveUser(userId);
    return this.ekycService.ocrBackID(imageBuffer, filename);
  }

  /** Lưu KYC cho user (nhân viên làm giúp - không cần face matching/liveness) */
  async saveKycForUser(
    userId: string,
    frontOCRData: any,
    backOCRData: any,
    frontImageBuffer: Buffer | null,
    backImageBuffer: Buffer | null,
  ) {
    const user = await this.resolveUser(userId);
    const mongoId = user._id?.toString();
    return this.ekycService.saveKycData(
      mongoId,
      frontOCRData,
      backOCRData,
      frontImageBuffer,
      backImageBuffer,
      null,
      null,
    );
  }

  private async resolveUser(userId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(userId)) {
      user = await this.userModel.findById(userId);
    }
    if (!user) {
      user = await this.userModel.findOne({ fineractClientId: userId });
    }
    if (!user) throw new NotFoundException('Khách hàng không tồn tại');
    return user;
  }

  // ========== STAFF MANAGEMENT (CRUD) ==========

  /**
   * Tạo nhân viên: 1) Keycloak → 2) Fineract staff → 3) MongoDB
   */
  async createStaff(dto: RegisterDto) {
    dto.userType = 'staff'; // Luôn ép userType = staff khi tạo qua admin
    if (!dto.roleId) {
      throw new BadRequestException('Thiếu roleId khi tạo nhân viên');
    }

    const role = await this.roleModel.findById(dto.roleId).lean();
    if (!role || !role.isActive) {
      throw new BadRequestException('Vai trò không hợp lệ hoặc đã bị vô hiệu hóa');
    }

    this.logger.log(`[createStaff] Creating staff: ${dto.phoneNumber}`);
    const result = await this.fineractSignupService.signup(dto);

    // Cập nhật phoneNumber = username (phoneNumber) cho user vừa tạo
    try {
      const user = await this.userModel.findOne({ username: dto.phoneNumber });
      if (user) {
        user.phoneNumber = dto.phoneNumber;
        user.set('roles', [role.name]);
        user.metadata = {
          ...(user.metadata || {}),
          roleId: role._id?.toString(),
          roleIds: [role._id?.toString()],
          roleName: role.name,
          roleNames: [role.name],
        };
        user.markModified('metadata');
        await user.save();
      }
    } catch (err: any) {
      this.logger.warn(`[createStaff] Failed to set phoneNumber: ${err.message}`);
    }

    return { message: 'Đăng ký thành công', data: result };
  }

  /**
   * Lấy danh sách nhân viên (từ MongoDB, lọc userType=staff)
   */
  async getStaffList(page = 1, limit = 20, keyword?: string) {
    const filter: any = { 'metadata.userType': 'staff', isDeleted: { $ne: true } };

    if (keyword) {
      const q = keyword.toLowerCase();
      filter.$or = [
        { username: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phoneNumber: { $regex: q, $options: 'i' } },
        { 'profile.firstName': { $regex: q, $options: 'i' } },
        { 'profile.lastName': { $regex: q, $options: 'i' } },
      ];
    }

    const total = await this.userModel.countDocuments(filter);
    const skip = (page - 1) * limit;
    const users = await this.userModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();

    const staffList = users.map((u: any) => ({
      _id: u._id?.toString(),
      username: u.username,
      email: u.email || null,
      profile: u.profile || {},
      status: u.status,
      keycloakId: u.keycloakId,
      fineractClientId: u.fineractClientId || null,
      fineractStaffId: u.metadata?.fineractStaffId ?? null,
      roleId: u.metadata?.roleId ?? (Array.isArray(u.metadata?.roleIds) ? u.metadata.roleIds[0] : null),
      roleName: u.metadata?.roleName ?? (Array.isArray(u.metadata?.roleNames) ? u.metadata.roleNames[0] : null),
      phoneNumber: u.phoneNumber || u.username || null,
      displayName: [u.profile?.firstName, u.profile?.lastName].filter(Boolean).join(' ') || u.username,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      isDeleted: u.isDeleted || false,
    }));

    // Đếm thêm số deleted (cho stats)
    const deletedCount = await this.userModel.countDocuments({ 'metadata.userType': 'staff', isDeleted: true });

    return { staff: staffList, total, page, limit, deletedCount };
  }

  /**
   * Lấy danh sách nhân viên đã bị khóa (isDeleted=true)
   */
  async getDeletedStaffList(page = 1, limit = 20) {
    const filter: any = { 'metadata.userType': 'staff', isDeleted: true };
    const total = await this.userModel.countDocuments(filter);
    const skip = (page - 1) * limit;
    const users = await this.userModel.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean();

    const staffList = users.map((u: any) => ({
      _id: u._id?.toString(),
      username: u.username,
      email: u.email || null,
      profile: u.profile || {},
      status: u.status,
      keycloakId: u.keycloakId,
      fineractClientId: u.fineractClientId || null,
      fineractStaffId: u.metadata?.fineractStaffId ?? null,
      roleId: u.metadata?.roleId ?? (Array.isArray(u.metadata?.roleIds) ? u.metadata.roleIds[0] : null),
      roleName: u.metadata?.roleName ?? (Array.isArray(u.metadata?.roleNames) ? u.metadata.roleNames[0] : null),
      phoneNumber: u.phoneNumber || u.username || null,
      displayName: [u.profile?.firstName, u.profile?.lastName].filter(Boolean).join(' ') || u.username,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      isDeleted: true,
    }));

    return { staff: staffList, total, page, limit };
  }

  /**
   * Lấy chi tiết nhân viên theo ID
   */
  async getStaffById(staffId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(staffId)) {
      user = await this.userModel.findOne({ _id: staffId, 'metadata.userType': 'staff' }).lean();
    }
    if (!user) {
      user = await this.userModel.findOne({ username: staffId, 'metadata.userType': 'staff' }).lean();
    }
    if (!user) throw new NotFoundException('Nhân viên không tồn tại');

    return {
      _id: user._id?.toString(),
      username: user.username,
      email: user.email || null,
      profile: user.profile || {},
      status: user.status,
      keycloakId: user.keycloakId,
      fineractClientId: user.fineractClientId || null,
      fineractStaffId: user.metadata?.fineractStaffId ?? null,
      roleId: user.metadata?.roleId ?? (Array.isArray(user.metadata?.roleIds) ? user.metadata.roleIds[0] : null),
      roleName:
        user.metadata?.roleName ?? (Array.isArray(user.metadata?.roleNames) ? user.metadata.roleNames[0] : null),
      phoneNumber: user.phoneNumber || user.username || null,
      displayName: [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' ') || user.username,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      metadata: user.metadata,
      isDeleted: user.isDeleted || false,
    };
  }

  /**
   * Cập nhật nhân viên: MongoDB + Keycloak (nếu cần)
   * Không cho cập nhật phoneNumber / username
   */
  async updateStaff(staffId: string, dto: UpdateStaffDto) {
    let user: any = null;
    if (Types.ObjectId.isValid(staffId)) {
      user = await this.userModel.findOne({ _id: staffId, 'metadata.userType': 'staff' });
    }
    if (!user) {
      user = await this.userModel.findOne({ username: staffId, 'metadata.userType': 'staff' });
    }
    if (!user) throw new NotFoundException('Nhân viên không tồn tại');

    // Cập nhật MongoDB (firstName, lastName, email, status, phoneNumber)
    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      if (dto.firstName !== undefined) user.profile.firstName = dto.firstName;
      if (dto.lastName !== undefined) user.profile.lastName = dto.lastName;
    }
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.status !== undefined) user.status = dto.status;
    // phoneNumber là riêng biệt với username — không ảnh hưởng đăng nhập
    if (dto.phoneNumber !== undefined) user.phoneNumber = dto.phoneNumber;

    user.markModified('profile');
    await user.save();

    // Cập nhật Keycloak (nếu có thay đổi tên / email)
    if (user.keycloakId && (dto.firstName || dto.lastName || dto.email)) {
      try {
        const token = await (this.keycloakService as any).getAdminToken();
        const realm = (this.keycloakService as any).realm;

        const userRes = await (this.keycloakService as any).httpClient.get(
          `/admin/realms/${realm}/users/${user.keycloakId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const kcUser = userRes.data;
        if (dto.firstName) kcUser.firstName = dto.firstName;
        if (dto.lastName) kcUser.lastName = dto.lastName;
        if (dto.email) kcUser.email = dto.email;

        await (this.keycloakService as any).httpClient.put(`/admin/realms/${realm}/users/${user.keycloakId}`, kcUser, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        this.logger.log(`[updateStaff] Updated Keycloak user ${user.keycloakId}`);
      } catch (err: any) {
        this.logger.warn(`[updateStaff] Keycloak update failed: ${err.message}`);
      }
    }

    // Cập nhật Fineract staff (nếu có fineractStaffId)
    const fineractStaffId = user.metadata?.fineractStaffId;
    if (fineractStaffId && (dto.firstName || dto.lastName || dto.email)) {
      try {
        const fineractClient = this.fineractClientService['client'];
        const payload: any = {};
        if (dto.firstName) payload.firstname = dto.firstName;
        if (dto.lastName) payload.lastname = dto.lastName;
        if (dto.email) payload.emailAddress = dto.email;

        await fineractClient.put(`/staff/${fineractStaffId}`, payload);
        this.logger.log(`[updateStaff] Updated Fineract staff ${fineractStaffId}`);
      } catch (err: any) {
        this.logger.warn(`[updateStaff] Fineract staff update failed: ${err.message}`);
      }
    }

    return this.getStaffById(user._id.toString());
  }

  /**
   * Xóa nhân viên (soft delete): Disable Keycloak + isDeleted=true
   */
  async deleteStaff(staffId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(staffId)) {
      user = await this.userModel.findOne({ _id: staffId, 'metadata.userType': 'staff' });
    }
    if (!user) {
      user = await this.userModel.findOne({ username: staffId, 'metadata.userType': 'staff' });
    }
    if (!user) throw new NotFoundException('Nhân viên không tồn tại');

    // Disable trên Keycloak (không xóa hẳn)
    if (user.keycloakId) {
      try {
        const token = await (this.keycloakService as any).getAdminToken();
        const realm = (this.keycloakService as any).realm;

        const userRes = await (this.keycloakService as any).httpClient.get(
          `/admin/realms/${realm}/users/${user.keycloakId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const kcUser = userRes.data;
        kcUser.enabled = false;

        await (this.keycloakService as any).httpClient.put(`/admin/realms/${realm}/users/${user.keycloakId}`, kcUser, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        this.logger.log(`[deleteStaff] Disabled Keycloak user ${user.keycloakId}`);
      } catch (err: any) {
        this.logger.warn(`[deleteStaff] Keycloak disable failed: ${err.message}`);
      }
    }

    // Soft delete: đánh dấu isDeleted = true
    user.isDeleted = true;
    user.status = 'suspended';
    await user.save();
    this.logger.log(`[deleteStaff] Soft deleted staff ${user._id}`);

    return { deleted: true, staffId: user._id?.toString() };
  }

  /**
   * Khôi phục nhân viên: Enable Keycloak + isDeleted=false
   */
  async restoreStaff(staffId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(staffId)) {
      user = await this.userModel.findOne({ _id: staffId, 'metadata.userType': 'staff', isDeleted: true });
    }
    if (!user) {
      user = await this.userModel.findOne({ username: staffId, 'metadata.userType': 'staff', isDeleted: true });
    }
    if (!user) throw new NotFoundException('Nhân viên không tồn tại hoặc chưa bị khóa');

    // Re-enable trên Keycloak
    if (user.keycloakId) {
      try {
        const token = await (this.keycloakService as any).getAdminToken();
        const realm = (this.keycloakService as any).realm;

        const userRes = await (this.keycloakService as any).httpClient.get(
          `/admin/realms/${realm}/users/${user.keycloakId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const kcUser = userRes.data;
        kcUser.enabled = true;

        await (this.keycloakService as any).httpClient.put(`/admin/realms/${realm}/users/${user.keycloakId}`, kcUser, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        this.logger.log(`[restoreStaff] Re-enabled Keycloak user ${user.keycloakId}`);
      } catch (err: any) {
        this.logger.warn(`[restoreStaff] Keycloak re-enable failed: ${err.message}`);
      }
    }

    user.isDeleted = false;
    user.status = 'active';
    await user.save();
    this.logger.log(`[restoreStaff] Restored staff ${user._id}`);

    return this.getStaffById(user._id.toString());
  }

  /**
   * Migration: Set phoneNumber = username cho tất cả user chưa có phoneNumber
   */
  async migratePhoneNumbers() {
    const result = await this.userModel.updateMany(
      { $or: [{ phoneNumber: { $exists: false } }, { phoneNumber: null }, { phoneNumber: '' }] },
      [{ $set: { phoneNumber: '$username' } }],
    );
    this.logger.log(`[migratePhoneNumbers] Updated ${result.modifiedCount} users`);
    return { modifiedCount: result.modifiedCount };
  }

  // ── Self-service Profile & Password ────────────────────────────────────────

  /**
   * Lấy hồ sơ đầy đủ từ DB (không dùng JWT payload)
   */
  async getMyProfile(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    return {
      _id: user._id?.toString(),
      username: user.username,
      email: user.email || '',
      phoneNumber: user.phoneNumber || user.username || '',
      profile: user.profile || {},
      roles: (user as any).roles || [],
    };
  }

  /**
   * Cập nhật hồ sơ cá nhân (staff tự cập nhật)
   */
  async updateMyProfile(
    userId: string,
    dto: { firstName?: string; lastName?: string; email?: string; phoneNumber?: string },
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    if (dto.firstName !== undefined) user.profile.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.profile.lastName = dto.lastName;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.phoneNumber !== undefined) user.phoneNumber = dto.phoneNumber;
    user.markModified('profile');
    await user.save();

    // Sync Keycloak
    if (user.keycloakId && (dto.firstName || dto.lastName || dto.email)) {
      try {
        const token = await (this.keycloakService as any).getAdminToken();
        const realm = (this.keycloakService as any).realm;
        const userRes = await (this.keycloakService as any).httpClient.get(
          `/admin/realms/${realm}/users/${user.keycloakId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const kcUser = userRes.data;
        if (dto.firstName) kcUser.firstName = dto.firstName;
        if (dto.lastName) kcUser.lastName = dto.lastName;
        if (dto.email) kcUser.email = dto.email;
        await (this.keycloakService as any).httpClient.put(`/admin/realms/${realm}/users/${user.keycloakId}`, kcUser, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        this.logger.log(`[updateMyProfile] Synced Keycloak user ${user.keycloakId}`);
      } catch (err: any) {
        this.logger.warn(`[updateMyProfile] Keycloak sync failed: ${err.message}`);
      }
    }

    return {
      _id: user._id?.toString(),
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,
      profile: user.profile,
    };
  }

  /**
   * Đổi mật khẩu: xác thực mật khẩu hiện tại qua Keycloak, rồi đặt mật khẩu mới
   */
  async changeMyPassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    if (!user.keycloakId) throw new BadRequestException('Tài khoản không liên kết Keycloak');

    // Xác thực mật khẩu hiện tại bằng cách gọi Keycloak token endpoint
    try {
      await this.keycloakAuthService.loginWithPassword(user.username, currentPassword);
    } catch {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }

    // Đặt mật khẩu mới qua Admin API
    await this.keycloakService.resetUserPassword(user.keycloakId, newPassword);

    return { success: true };
  }

  // ── User Preferences (font size, etc.) ──────────────────────────────────────

  /**
   * Lấy preferences của user hiện tại
   */
  async getMyPreferences(userId: string) {
    const user = await this.userModel.findById(userId).select('preferences').lean();
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    return user.preferences || { fontSize: 'default' };
  }

  /**
   * Cập nhật preferences của user hiện tại
   */
  async updateMyPreferences(userId: string, prefs: { fontSize?: 'compact' | 'default' | 'large' }) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    const validSizes = ['compact', 'default', 'large'];
    if (prefs.fontSize && !validSizes.includes(prefs.fontSize)) {
      throw new BadRequestException(`fontSize phải là một trong: ${validSizes.join(', ')}`);
    }

    user.preferences = {
      ...(user.preferences || { fontSize: 'default' }),
      ...(prefs.fontSize ? { fontSize: prefs.fontSize } : {}),
    };
    user.markModified('preferences');
    await user.save();

    return user.preferences;
  }

  // =============================================
  // LOAN SUPPORT REQUESTS (WAIVE / RESCHEDULE)
  // =============================================

  async getSupportRequests(query: any) {
    const filter: any = {};
    if (query.status) filter.status = query.status;
    if (query.requestType) filter.requestType = query.requestType;

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const [items, total] = await Promise.all([
      this.supportRequestModel
        .find(filter)
        .populate('userId', 'username email fullName phoneNumber')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.supportRequestModel.countDocuments(filter),
    ]);

    return { items, total, page, limit };
  }

  async approveWaivePenalty(requestId: string, adminId: string) {
    const request = await this.supportRequestModel.findById(requestId);
    if (!request || request.requestType !== 'WAIVE_PENALTY' || request.status !== 'PENDING') {
      throw new BadRequestException('Yêu cầu không hợp lệ hoặc đã được xử lý');
    }

    // Call fineract to waive penalties
    await this.fineractLoanService.waiveAllPenalties(request.fineractLoanId);

    // Mark request as approved
    request.status = 'APPROVED';
    request.resolvedBy = new Types.ObjectId(adminId);
    request.resolvedAt = new Date();
    await request.save();

    return request;
  }

  async approveReschedule(requestId: string, adminId: string, adminNote?: string) {
    const request = await this.supportRequestModel.findById(requestId);
    if (!request || request.requestType !== 'RESCHEDULE' || request.status !== 'PENDING') {
      throw new BadRequestException('Yêu cầu không hợp lệ hoặc đã được xử lý');
    }

    if (!request.proposedRescheduleDate) {
      throw new BadRequestException('Thiếu thông tin ngày đến hạn mới để cơ cấu nợ');
    }

    // Get loan details to find current schedule
    const loanDetails = await this.fineractLoanService.getLoanDetails(String(request.fineractLoanId));
    let rescheduleFromDate = new Date().toISOString().split('T')[0]; // fallback

    // Find the first unpaid period to reschedule from
    if (loanDetails && loanDetails.repaymentSchedule && loanDetails.repaymentSchedule.periods) {
      const firstUnpaid = loanDetails.repaymentSchedule.periods.find((p: any) => p.period > 0 && !p.complete);
      if (firstUnpaid && firstUnpaid.dueDate) {
        const dateArr = firstUnpaid.dueDate;
        rescheduleFromDate = Array.isArray(dateArr)
          ? `${dateArr[0]}-${String(dateArr[1]).padStart(2, '0')}-${String(dateArr[2]).padStart(2, '0')}`
          : dateArr;
      }
    }

    // Call fineract to reschedule
    await this.fineractLoanService.rescheduleLoan(request.fineractLoanId, {
      rescheduleFromDate: rescheduleFromDate,
      adjustedDueDate: request.proposedRescheduleDate,
      rescheduleReasonId: 1, // Default "Other" reason in standard config
    });

    // Mark request as approved
    request.status = 'APPROVED';
    request.resolvedBy = new Types.ObjectId(adminId);
    request.resolvedAt = new Date();
    request.adminNote = adminNote || 'Approved Reschedule';
    await request.save();

    return request;
  }

  async approveWriteOff(requestId: string, adminId: string, adminNote?: string) {
    const request = await this.supportRequestModel.findById(requestId);
    if (!request || request.requestType !== 'WRITE_OFF' || request.status !== 'PENDING') {
      throw new BadRequestException('Yêu cầu không hợp lệ hoặc đã được xử lý');
    }

    await this.fineractLoanService.writeOffLoan(request.fineractLoanId, adminNote || request.reason);

    request.status = 'APPROVED';
    request.resolvedBy = new Types.ObjectId(adminId);
    request.resolvedAt = new Date();
    request.adminNote = adminNote || 'Approved Write-off';
    await request.save();

    const app = await this.loanApplicationModel.findOne({ fineractLoanId: request.fineractLoanId });
    if (app) {
      app.status = 'closed' as any;
      await app.save();
    }

    return request;
  }

  async approveWaiveInterest(requestId: string, adminId: string, adminNote?: string) {
    const request = await this.supportRequestModel.findById(requestId);
    if (!request || request.requestType !== 'WAIVE_INTEREST' || request.status !== 'PENDING') {
      throw new BadRequestException('Yêu cầu không hợp lệ hoặc đã được xử lý');
    }

    await this.fineractLoanService.waiveInterest(request.fineractLoanId, {
      note: adminNote || request.reason,
    });

    request.status = 'APPROVED';
    request.resolvedBy = new Types.ObjectId(adminId);
    request.resolvedAt = new Date();
    request.adminNote = adminNote || 'Approved Interest Waiver';
    await request.save();

    return request;
  }
}
