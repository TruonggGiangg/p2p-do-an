/**
 * AdminProductService — Product listing, sync & drift (Loan, Savings, FD)
 * Extracted from AdminService for maintainability.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FineractLoanService } from '../../fineract/services/fineract-loan.service';
import { FineractSavingsService } from '../../fineract/services/fineract-savings.service';
import { FineractFDService } from '../../fineract/services/fineract-fd.service';
import { LoanProductSnapshot, SnapshotProductItem } from '../schemas/loan-product-snapshot.schema';
import {
  SavingsProductSnapshot,
  SnapshotSavingsProductItem,
  SAVINGS_SNAPSHOT_SCOPE,
} from '../schemas/savings-product-snapshot.schema';
import { SyncDriftLog, ProductDiffItem } from '../schemas/sync-drift-log.schema';
import { DocumentType as DbDocumentType, FileFormat } from '../schemas/document-type.schema';
import { LoanProductDocumentType } from '../schemas/loan-product-document-type.schema';
import { CreateDocumentTypeDto } from '../dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from '../dto/update-document-type.dto';
import { ProductDocumentTypeItemDto } from '../dto/set-product-document-types.dto';
import {
  flattenLoanProduct,
  flattenSavingsProduct,
  diffProducts,
  LOAN_PRODUCT_FIELDS,
  SAVINGS_PRODUCT_FIELDS,
} from '../utils/product-sync-fields';

const SNAPSHOT_SCOPE = 'default';

@Injectable()
export class AdminProductService {
  private readonly logger = new Logger(AdminProductService.name);

  constructor(
    @InjectModel(DbDocumentType.name) private documentTypeModel: Model<DbDocumentType>,
    @InjectModel(LoanProductDocumentType.name) private loanProductDocModel: Model<LoanProductDocumentType>,
    @InjectModel(LoanProductSnapshot.name) private snapshotModel: Model<LoanProductSnapshot>,
    @InjectModel(SavingsProductSnapshot.name) private savingsSnapshotModel: Model<SavingsProductSnapshot>,
    @InjectModel(SyncDriftLog.name) private syncDriftLogModel: Model<SyncDriftLog>,
    private readonly fineractLoanService: FineractLoanService,
    private readonly fineractSavingsService: FineractSavingsService,
    private readonly fineractFDService: FineractFDService,
  ) {}

  // ── Loan products ─────────────────────────────────────────────────────────
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

  // ── Document types CRUD ───────────────────────────────────────────────────
  async createDocumentType(dto: CreateDocumentTypeDto) {
    const doc = await this.documentTypeModel.create({
      name: dto.name,
      required: dto.required ?? false,
      description: dto.description,
      fileFormat: dto.fileFormat ?? FileFormat.ANY,
    });
    return doc.toObject();
  }

  async findAllDocumentTypes() {
    return this.documentTypeModel.find().sort({ name: 1 }).lean();
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

  // ── Loan product <-> Document types ────────────────────────────────────────
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
        update: { $set: { required: item.required ?? false } },
        upsert: true,
      },
    }));
    await this.loanProductDocModel.bulkWrite(operations);
    return { fineractProductId, count: operations.length };
  }

  // ── Sync & drift ──────────────────────────────────────────────────────────
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
    return this.syncDriftLogModel.find(filter).sort({ syncedAt: -1 }).limit(limit).lean();
  }

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
          modified.push({ id: curr.id, name: curr.name, shortName: curr.shortName, fieldChanges });
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

  // ── Savings products ──────────────────────────────────────────────────────
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
          modified.push({ id: curr.id, name: curr.name, shortName: curr.shortName, fieldChanges });
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

  // ── FD products ("Quỹ đầu tư có kỳ hạn") ─────────────────────────────────
  async getFDProductsForAdmin() {
    const products = await this.fineractFDService.getFDProducts();

    // Fineract list API không trả interestRateCharts, cần gọi detail cho từng sản phẩm
    const detailed = await Promise.all(
      products.map(async (p: any) => {
        try {
          const detail = await (this.fineractFDService as any).client.get(`/fixeddepositproducts/${p.id}`);
          return detail.data;
        } catch {
          return p; // fallback nếu lỗi
        }
      }),
    );

    return detailed.map((p: any) => {
      // FD products: lãi suất thực nằm trong activeChart.chartSlabs
      const activeChart = p.activeChart || p.interestRateCharts?.[0];
      const chartSlabs = activeChart?.chartSlabs || [];
      const interestRate = chartSlabs[0]?.annualInterestRate ?? p.nominalAnnualInterestRate ?? 0;

      return {
        id: p.id,
        name: p.name,
        shortName: p.shortName,
        description: p.description || '',
        nominalAnnualInterestRate: p.nominalAnnualInterestRate,
        interestRate,
        interestRateCharts: chartSlabs.map((slab: any) => ({
          fromPeriod: slab.fromPeriod,
          toPeriod: slab.toPeriod,
          annualInterestRate: slab.annualInterestRate,
          description: slab.description,
        })),
        minDepositAmount: p.minDepositAmount,
        maxDepositAmount: p.maxDepositAmount,
        minDepositTerm: p.minDepositTerm,
        maxDepositTerm: p.maxDepositTerm,
        minDepositTermType: p.minDepositTermType?.id ?? p.minDepositTermTypeId,
        currency: p.currency,
        preClosurePenalApplicable: p.preClosurePenalApplicable ?? false,
      };
    });
  }

  async getFDProductDetails(productId: number) {
    try {
      const response = await (this.fineractFDService as any).client.get(`/fixeddepositproducts/${productId}`);
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to get FD product details ${productId}: ${error.message}`);
      throw new NotFoundException(`Không tìm thấy sản phẩm quỹ đầu tư ID ${productId}`);
    }
  }

  async compareAndSyncFD(
    persist = true,
  ): Promise<{ added: ProductDiffItem[]; removed: ProductDiffItem[]; modified: ProductDiffItem[] }> {
    const raw = await this.fineractFDService.getFDProducts();
    const current = raw.map((p: any) => ({
      id: p.id,
      name: p.name || '',
      shortName: p.shortName || '',
      nominalAnnualInterestRate: p.nominalAnnualInterestRate ?? 0,
    }));

    const FD_SCOPE = 'fixed_deposit';
    const snap = await this.savingsSnapshotModel.findOne({ scope: FD_SCOPE }).lean();
    const previous: any[] = snap?.products ?? [];

    const prevMap = new Map(previous.map(p => [p.id, p]));
    const currMap = new Map(current.map(p => [p.id, p]));

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
          modified.push({ id: curr.id, name: curr.name, shortName: curr.shortName, fieldChanges });
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
      await this.savingsSnapshotModel.findOneAndUpdate(
        { scope: FD_SCOPE },
        { products: current, updatedAtSnapshot: new Date() },
        { upsert: true },
      );
      await this.logSyncDrift(added, removed, modified, 'savings');
    }
    return { added, removed, modified };
  }
}
