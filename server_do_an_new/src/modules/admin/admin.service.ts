import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FineractLoanService } from '../fineract/services/fineract-loan.service';
import { FineractClientService } from '../fineract/services/fineract-client.service';
import { FineractSavingsService } from '../fineract/services/fineract-savings.service';
import { LoanProductDocumentType } from './schemas/loan-product-document-type.schema';
import { LoanSyncRun } from './schemas/loan-sync-run.schema';
import { LoanDelinquency } from '../delinquency/entities/loan-delinquency.schema';
import { DelinquencyCollectionStage, DelinquencyPolicy } from '../delinquency/entities/delinquency-policy.schema';
import { User } from '../users/schemas/user.schema';
import { LoanApplication } from '../loan/schemas/loan-application.schema';
import { Wallet } from '../wallets/schemas/wallet.schema';
import { Notification } from '../loan/schemas/notification.schema';
import { LoanContract } from '../loan/schemas/loan-contract.schema';
import { ContractService } from '../loan/contract.service';
import { DocumentType } from './schemas/document-type.schema';
import { CreateDelinquencyPolicyDto } from '../delinquency/dto/create-delinquency-policy.dto';
import { UpdateDelinquencyPolicyDto } from '../delinquency/dto/update-delinquency-policy.dto';
import { ProductDiffItem } from './schemas/sync-drift-log.schema';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { ProductDocumentTypeItemDto } from './dto/set-product-document-types.dto';
import { RegisterDto } from 'src/modules/auth/dto/register.dto';
import { UpdateStaffDto } from 'src/modules/admin/dto/update-staff.dto';
import {
  CreditScoreWeightConfigValue,
  LoanEvaluationConfigInput,
  LoanEvaluationConfigValue,
  LoanEvaluationConfigHistoryItem,
} from '../credit-score/credit-score.service';
import { AdminProductService } from './services/admin-product.service';
import { AdminCustomerService } from './services/admin-customer.service';
import { AdminKycService } from './services/admin-kyc.service';
import { AdminStaffService } from './services/admin-staff.service';
import { AdminLoanService } from './services/admin-loan.service';
import { BnplService } from '../bnpl/bnpl.service';

@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    // ── Mongoose models (kept for DI compatibility) ──
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
    // ── External services ──
    private readonly fineractLoanService: FineractLoanService,
    private readonly fineractClientService: FineractClientService,
    private readonly fineractSavingsService: FineractSavingsService,
    @Inject(forwardRef(() => ContractService)) private readonly contractService: ContractService,
    // ── Sub-services ──
    private readonly productService: AdminProductService,
    private readonly customerService: AdminCustomerService,
    private readonly kycService: AdminKycService,
    private readonly staffService: AdminStaffService,
    private readonly loanService: AdminLoanService,
    private readonly bnplService: BnplService,
  ) {}

  /**
   * One-time migration: Fix delinquency_policy debt_group numbers to match CIC standard.
   * The admin may have created policies with old mapDebtGroup() numbers (off by 1).
   * This migration extracts the correct group number from debt_group_name and updates debt_group.
   */
  async onModuleInit() {
    try {
      const policies = await this.delinquencyPolicyModel.find({}).lean().exec();
      let fixedCount = 0;
      for (const p of policies) {
        const nameMatch = p.debt_group_name?.match(/Nhóm\s+(\d+)/i);
        if (nameMatch) {
          const correctGroup = parseInt(nameMatch[1], 10);
          if (p.debt_group !== correctGroup) {
            await this.delinquencyPolicyModel.updateOne({ _id: p._id }, { $set: { debt_group: correctGroup } });
            fixedCount++;
            this.logger.warn(
              `[PolicyMigration] Fixed "${p.debt_group_name}": debt_group ${p.debt_group} -> ${correctGroup}`,
            );
          }
        }
      }
      if (fixedCount > 0) {
        this.logger.log(`[PolicyMigration] Fixed ${fixedCount}/${policies.length} delinquency policies`);
      }
    } catch (err: any) {
      this.logger.warn(`[PolicyMigration] Non-critical migration error: ${err.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FACADE DELEGATES — Credit Score & Loan Evaluation Config
  // ═══════════════════════════════════════════════════════════════════════════════
  async getCreditScoreWeightConfig(): Promise<CreditScoreWeightConfigValue> {
    return this.staffService.getCreditScoreWeightConfig();
  }
  async getLoanEvaluationConfig(): Promise<LoanEvaluationConfigValue> {
    return this.staffService.getLoanEvaluationConfig();
  }
  async createLoanEvaluationConfig(
    input: LoanEvaluationConfigInput,
    adminId?: string,
  ): Promise<LoanEvaluationConfigValue> {
    return this.staffService.createLoanEvaluationConfig(input, adminId);
  }
  async syncLoanEvaluationConfigBlockchain(version?: number, adminId?: string): Promise<LoanEvaluationConfigValue> {
    return this.staffService.syncLoanEvaluationConfigBlockchain(version, adminId);
  }
  async getLoanEvaluationConfigHistory(
    page?: number,
    limit?: number,
  ): Promise<{ items: LoanEvaluationConfigHistoryItem[]; total: number; page: number; limit: number }> {
    return this.staffService.getLoanEvaluationConfigHistory(page, limit);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FACADE DELEGATES — Products
  // ═══════════════════════════════════════════════════════════════════════════════
  async getLoanProductsForAdmin() {
    return this.productService.getLoanProductsForAdmin();
  }
  async getLoanProductDetails(productId: number) {
    return this.productService.getLoanProductDetails(productId);
  }
  async createDocumentType(dto: CreateDocumentTypeDto) {
    return this.productService.createDocumentType(dto);
  }
  async findAllDocumentTypes() {
    return this.productService.findAllDocumentTypes();
  }
  async findOneDocumentType(id: string) {
    return this.productService.findOneDocumentType(id);
  }
  async updateDocumentType(id: string, dto: UpdateDocumentTypeDto) {
    return this.productService.updateDocumentType(id, dto);
  }
  async removeDocumentType(id: string) {
    return this.productService.removeDocumentType(id);
  }
  async getDocumentTypesByProduct(fineractProductId: number) {
    return this.productService.getDocumentTypesByProduct(fineractProductId);
  }
  async setDocumentTypesForProduct(fineractProductId: number, items: ProductDocumentTypeItemDto[]) {
    return this.productService.setDocumentTypesForProduct(fineractProductId, items);
  }
  async getSnapshot() {
    return this.productService.getSnapshot();
  }
  async saveSnapshot(products: any[]) {
    return this.productService.saveSnapshot(products);
  }
  async logSyncDrift(
    added: ProductDiffItem[],
    removed: ProductDiffItem[],
    modified: ProductDiffItem[],
    scope: 'loan' | 'savings' = 'loan',
  ) {
    return this.productService.logSyncDrift(added, removed, modified, scope);
  }
  async getSyncDriftLogs(limit = 20, scope?: 'loan' | 'savings') {
    return this.productService.getSyncDriftLogs(limit, scope);
  }
  async compareAndSync(persist = true, currentProducts?: any[]) {
    return this.productService.compareAndSync(persist, currentProducts);
  }
  async getSavingsProductsForAdmin() {
    return this.productService.getSavingsProductsForAdmin();
  }
  async getSavingsProductDetails(productId: number) {
    return this.productService.getSavingsProductDetails(productId);
  }
  async compareAndSyncSavings(persist = true, currentProducts?: any[]) {
    return this.productService.compareAndSyncSavings(persist, currentProducts);
  }
  async getFDProductsForAdmin() {
    return this.productService.getFDProductsForAdmin();
  }
  async getFDProductDetails(productId: number) {
    return this.productService.getFDProductDetails(productId);
  }
  async compareAndSyncFD(persist = true) {
    return this.productService.compareAndSyncFD(persist);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FACADE DELEGATES — Customers
  // ═══════════════════════════════════════════════════════════════════════════════
  async getPendingApprovalClients(page = 1, limit = 20, keyword?: string) {
    return this.customerService.getPendingApprovalClients(page, limit, keyword);
  }
  async getCustomers(page = 1, limit = 20, keyword?: string) {
    return this.customerService.getCustomers(page, limit, keyword);
  }
  async getCustomerById(userId: string) {
    return this.customerService.getCustomerById(userId);
  }
  async getCustomerDetail(userId: string) {
    return this.customerService.getCustomerDetail(userId, uid => this.kycService.getKycDetail(uid));
  }
  async getCustomerLoans(userId: string) {
    return this.customerService.getCustomerLoans(userId);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FACADE DELEGATES — KYC
  // ═══════════════════════════════════════════════════════════════════════════════
  async getPendingKycUsers() {
    return this.kycService.getPendingKycUsers();
  }
  async getKycDetail(userId: string) {
    return this.kycService.getKycDetail(userId);
  }
  async approveKyc(userId: string) {
    return this.kycService.approveKyc(userId);
  }
  async rejectKyc(userId: string, reason?: string) {
    return this.kycService.rejectKyc(userId, reason);
  }
  async requestUpdateKyc(userId: string, reason: string) {
    return this.kycService.requestUpdateKyc(userId, reason);
  }
  async getKycDocumentStream(userId: string, entityType: string, entityId: number, documentId: number) {
    return this.kycService.getKycDocumentStream(userId, entityType, entityId, documentId);
  }
  async ocrFrontForUser(userId: string, imageBuffer: Buffer, filename = 'front.jpg') {
    return this.kycService.ocrFrontForUser(userId, imageBuffer, filename);
  }
  async ocrBackForUser(userId: string, imageBuffer: Buffer, filename = 'back.jpg') {
    return this.kycService.ocrBackForUser(userId, imageBuffer, filename);
  }
  async saveKycForUser(
    userId: string,
    frontOCRData: any,
    backOCRData: any,
    frontImageBuffer: Buffer | null,
    backImageBuffer: Buffer | null,
  ) {
    return this.kycService.saveKycForUser(userId, frontOCRData, backOCRData, frontImageBuffer, backImageBuffer);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FACADE DELEGATES — Staff / Support / Profile / Preferences
  // ═══════════════════════════════════════════════════════════════════════════════
  async getBnplApplications(status?: string) {
    return this.bnplService.listApplications(status);
  }
  async getBnplApplicationById(applicationId: string) {
    return this.bnplService.getApplicationById(applicationId);
  }
  async approveBnplApplication(applicationId: string, adminId: string, approvedLimit?: number) {
    return this.bnplService.approveApplication(applicationId, adminId, approvedLimit);
  }
  async rejectBnplApplication(applicationId: string, adminId: string, reason?: string) {
    return this.bnplService.rejectApplication(applicationId, adminId, reason);
  }
  async getBnplPolicyConfig() {
    return this.bnplService.getActivePolicyConfig();
  }
  async getBnplPolicyConfigHistory() {
    return this.bnplService.listPolicyConfigs();
  }
  async createBnplPolicyConfig(dto: any, adminId?: string) {
    return this.bnplService.createPolicyConfig(dto, adminId);
  }
  async getBnplWallets(status?: string) {
    return this.bnplService.listWallets(status);
  }
  async getBnplLoans(status?: string) {
    return this.bnplService.listLoansAdmin(status);
  }
  async getBnplDashboardSummary() {
    return this.bnplService.getAdminDashboardSummary();
  }
  async activateBnplWallet(walletId: string, adminId: string) {
    return this.bnplService.activateWalletByAdmin(walletId, adminId);
  }
  async suspendBnplWallet(walletId: string, adminId: string, reason?: string) {
    return this.bnplService.suspendWalletByAdmin(walletId, adminId, reason);
  }
  async syncBnplLoan(loanId: string) {
    return this.bnplService.syncLoanStatusByAdmin(loanId);
  }

  async createStaff(dto: RegisterDto) {
    return this.staffService.createStaff(dto);
  }
  async getStaffList(page = 1, limit = 20, keyword?: string) {
    return this.staffService.getStaffList(page, limit, keyword);
  }
  async getDeletedStaffList(page = 1, limit = 20) {
    return this.staffService.getDeletedStaffList(page, limit);
  }
  async getStaffById(staffId: string) {
    return this.staffService.getStaffById(staffId);
  }
  async updateStaff(staffId: string, dto: UpdateStaffDto) {
    return this.staffService.updateStaff(staffId, dto);
  }
  async deleteStaff(staffId: string) {
    return this.staffService.deleteStaff(staffId);
  }
  async restoreStaff(staffId: string) {
    return this.staffService.restoreStaff(staffId);
  }
  async migratePhoneNumbers() {
    return this.staffService.migratePhoneNumbers();
  }
  async getMyProfile(userId: string) {
    return this.staffService.getMyProfile(userId);
  }
  async updateMyProfile(
    userId: string,
    dto: { firstName?: string; lastName?: string; email?: string; phoneNumber?: string },
  ) {
    return this.staffService.updateMyProfile(userId, dto);
  }
  async changeMyPassword(userId: string, currentPassword: string, newPassword: string) {
    return this.staffService.changeMyPassword(userId, currentPassword, newPassword);
  }
  async getMyPreferences(userId: string) {
    return this.staffService.getMyPreferences(userId);
  }
  async updateMyPreferences(userId: string, prefs: { fontSize?: 'compact' | 'default' | 'large' }) {
    return this.staffService.updateMyPreferences(userId, prefs);
  }
  async getSupportRequests(query: any) {
    return this.staffService.getSupportRequests(query);
  }
  async approveWaivePenalty(requestId: string, adminId: string) {
    return this.staffService.approveWaivePenalty(requestId, adminId);
  }
  async approveReschedule(requestId: string, adminId: string, adminNote?: string) {
    return this.staffService.approveReschedule(requestId, adminId, adminNote);
  }
  async approveWriteOff(requestId: string, adminId: string, adminNote?: string) {
    return this.staffService.approveWriteOff(requestId, adminId, adminNote);
  }
  async approveWaiveInterest(requestId: string, adminId: string, adminNote?: string) {
    return this.staffService.approveWaiveInterest(requestId, adminId, adminNote);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FACADE DELEGATES — Loans & Delinquency
  // ═══════════════════════════════════════════════════════════════════════════════
  async getLoans(query: any) {
    return this.loanService.getLoans(query);
  }
  async syncDisbursedLoansFromFineract(limit = 300, options?: any) {
    return this.loanService.syncDisbursedLoansFromFineract(limit, options);
  }
  async rejectLoan(fineractLoanId: number, note?: string) {
    return this.loanService.rejectLoan(fineractLoanId, note);
  }
  async undoApproval(fineractLoanId: number, note?: string) {
    return this.loanService.undoApproval(fineractLoanId, note);
  }
  async approveLoan(fineractLoanId: number) {
    return this.loanService.approveLoan(fineractLoanId);
  }
  async disburseLoan(fineractLoanId: number) {
    return this.loanService.disburseLoan(fineractLoanId);
  }
  async getOverdueLoans(query: any) {
    return this.loanService.getOverdueLoans(query);
  }
  async getLoanDelinquencyList(query: any) {
    return this.loanService.getLoanDelinquencyList(query);
  }
  async syncLoanDelinquencyBatch(fineractLoanIds: number | number[]) {
    const ids = Array.isArray(fineractLoanIds) ? fineractLoanIds : [fineractLoanIds];
    await Promise.allSettled(ids.map(id => this.loanService.syncLoanDelinquencyBatch(id)));
    return { success: true };
  }
  async getDelinquencyPolicies(filters?: {
    is_active?: boolean;
    debt_group?: number;
    loan_product_id?: number;
    collection_stage?: DelinquencyCollectionStage;
  }) {
    return this.loanService.getDelinquencyPolicies(filters);
  }
  async getAllPendingLoans() {
    return this.loanService.getAllPendingLoans();
  }
  async getContractStatus(fineractLoanId: number) {
    return this.loanService.getContractStatus(fineractLoanId);
  }
  async getLoanDetails(fineractLoanId: number, sync = false) {
    return this.loanService.getLoanDetails(fineractLoanId, sync);
  }
  async syncLoanFromFineract(fineractLoanId: number) {
    return this.loanService.syncLoanFromFineract(fineractLoanId);
  }
  async syncClientLoansFromFineract(userId: string) {
    return this.loanService.syncClientLoansFromFineract(userId);
  }
  async getLoanSyncRuns(limit = 30) {
    return this.loanService.getLoanSyncRuns(limit);
  }
  async syncAllActiveLoansFromFineract(limit = 200) {
    return this.loanService.syncAllActiveLoansFromFineract(limit);
  }
  async getDelinquencyRangesForFilter() {
    return this.loanService.getDelinquencyRangesForFilter();
  }
  async syncOneLoanDelinquency(fineractLoanId: number) {
    return this.loanService.syncOneLoanDelinquency(fineractLoanId);
  }
  async getDelinquencyPolicyDebtGroups() {
    return this.loanService.getDelinquencyPolicyDebtGroups();
  }
  async createDelinquencyPolicy(dto: CreateDelinquencyPolicyDto) {
    return this.loanService.createDelinquencyPolicy(dto);
  }
  async updateDelinquencyPolicy(id: string, dto: UpdateDelinquencyPolicyDto) {
    return this.loanService.updateDelinquencyPolicy(id, dto);
  }
  async removeDelinquencyPolicy(id: string) {
    return this.loanService.removeDelinquencyPolicy(id);
  }
  async getLoansStats() {
    return this.loanService.getLoansStats();
  }
  async getDashboardOverview() {
    return this.loanService.getDashboardOverview();
  }
  async getLoanDocuments(fineractLoanId: number) {
    return this.loanService.getLoanDocuments(fineractLoanId);
  }
  async approveDocument(fineractLoanId: number, documentId: number) {
    return this.loanService.approveDocument(fineractLoanId, documentId);
  }
  async rejectDocument(fineractLoanId: number, documentId: number) {
    return this.loanService.rejectDocument(fineractLoanId, documentId);
  }
  async classifyDocument(fineractLoanId: number, documentId: number, documentTypeId: string) {
    return this.loanService.classifyDocument(fineractLoanId, documentId, documentTypeId);
  }
  async canApproveLoan(fineractLoanId: number) {
    return this.loanService.canApproveLoan(fineractLoanId);
  }
  async getLoanDocumentStream(fineractLoanId: number, documentId: number) {
    return this.loanService.getLoanDocumentStream(fineractLoanId, documentId);
  }
  async triggerAIScoreForLoan(fineractLoanId: number) {
    return this.loanService.triggerAIScoreForLoan(fineractLoanId);
  }
}
