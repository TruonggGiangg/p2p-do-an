import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FineractLoanService } from '../fineract/services/fineract-loan.service';
import { DocumentType } from './schemas/document-type.schema';
import { LoanProductDocumentType } from './schemas/loan-product-document-type.schema';
import { LoanProductSnapshot, SnapshotProductItem } from './schemas/loan-product-snapshot.schema';
import { SyncDriftLog } from './schemas/sync-drift-log.schema';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { ProductDocumentTypeItemDto } from './dto/set-product-document-types.dto';

const SNAPSHOT_SCOPE = 'default';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(DocumentType.name) private documentTypeModel: Model<DocumentType>,
    @InjectModel(LoanProductDocumentType.name) private loanProductDocModel: Model<LoanProductDocumentType>,
    @InjectModel(LoanProductSnapshot.name) private snapshotModel: Model<LoanProductSnapshot>,
    @InjectModel(SyncDriftLog.name) private syncDriftLogModel: Model<SyncDriftLog>,
    private readonly fineractLoanService: FineractLoanService,
  ) {}

  // ---------- Loan products (from Fineract) ----------
  async getLoanProductsForAdmin() {
    const products = await this.fineractLoanService.getLoanProducts();
    return products.map((p: any) => ({
      id: p.id,
      name: p.name,
      shortName: p.shortName,
      interestRatePerPeriod: p.interestRatePerPeriod,
      interestType: p.interestType,
    }));
  }

  // ---------- Document types CRUD ----------
  async createDocumentType(dto: CreateDocumentTypeDto) {
    const doc = await this.documentTypeModel.create({
      name: dto.name,
      required: dto.required ?? false,
      sortOrder: dto.sortOrder ?? 0,
      description: dto.description,
    });
    return doc.toObject();
  }

  async findAllDocumentTypes() {
    const list = await this.documentTypeModel.find().sort({ sortOrder: 1, name: 1 }).lean();
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
      .sort({ sortOrder: 1 })
      .lean();
    return links.map((l: any) => ({
      documentTypeId: l.documentTypeId?._id,
      documentType: l.documentTypeId,
      required: l.required,
      sortOrder: l.sortOrder,
    }));
  }

  async setDocumentTypesForProduct(fineractProductId: number, items: ProductDocumentTypeItemDto[]) {
    await this.loanProductDocModel.deleteMany({ fineractProductId });
    if (items.length === 0) return { fineractProductId, count: 0 };
    const toInsert = items.map((item, index) => ({
      fineractProductId,
      documentTypeId: new Types.ObjectId(item.documentTypeId),
      required: item.required ?? false,
      sortOrder: item.sortOrder ?? index,
    }));
    await this.loanProductDocModel.insertMany(toInsert);
    return { fineractProductId, count: toInsert.length };
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
      else if (prev.name !== curr.name || prev.shortName !== curr.shortName || prev.interestRatePerPeriod !== curr.interestRatePerPeriod) {
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
}
