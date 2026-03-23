import { api } from "./client";

export type FileFormat = "image" | "pdf" | "any";

export interface DocumentTypeDto {
  _id: string;
  name: string;
  required: boolean;
  description?: string;
  fileFormat?: FileFormat;
}

export interface LoanProductDto {
  id: number;
  name: string;
  shortName: string;
  interestRatePerPeriod?: number;
  interestRateFrequencyType?: {
    id: number;
    code: string;
    value: string;
  };
  annualInterestRate?: number;
}

export interface SavingsProductDto {
  id: number;
  name: string;
  shortName: string;
  nominalAnnualInterestRate?: number;
  description?: string;
  currency?: { code?: string };
}

export interface FDProductDto {
  id: number;
  name: string;
  shortName: string;
  description?: string;
  nominalAnnualInterestRate?: number;
  minDepositAmount?: number;
  maxDepositAmount?: number;
  minDepositTerm?: number;
  maxDepositTerm?: number;
  minDepositTermType?: number;
  currency?: { code?: string };
  preClosurePenalApplicable?: boolean;
}

export interface FieldChangeDto {
  field: string;
  label: string;
  before: any;
  after: any;
}

export interface ProductDiffItemDto {
  id: number;
  name?: string;
  shortName?: string;
  fieldChanges?: FieldChangeDto[];
}

export interface SyncDriftLogDto {
  _id: string;
  syncedAt: string;
  hasDrift: boolean;
  added: ProductDiffItemDto[];
  removed: ProductDiffItemDto[];
  modified: ProductDiffItemDto[];
}

/** Một thay đổi theo trường trong đồng bộ khoản vay */
export interface LoanSyncChangeDto {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}

/** Chi tiết đồng bộ từng khoản vay */
export interface LoanSyncRunDetailDto {
  fineractLoanId: number;
  status: "synced" | "skipped" | "error";
  message?: string;
  changes?: LoanSyncChangeDto[];
}

/** Một lần chạy đồng bộ khoản vay (loan_sync_runs) */
export interface LoanSyncRunDto {
  _id: string;
  ranAt: string;
  trigger: "cron" | "manual";
  totalFromFineract: number;
  synced: number;
  errorCount: number;
  skipped: number;
  message?: string;
  details?: LoanSyncRunDetailDto[];
}

/** Fineract status object: { id, code, value } */
export interface FineractStatus {
  id: number;
  code: string;
  value: string;
}

export interface CustomerDto {
  _id?: string | null;
  username: string;
  email?: string;
  profile?: { firstName?: string; lastName?: string; avatar?: string };
  fineractClientId?: string;
  status: string;
  kycStatus?: "NONE" | "PENDING" | "VERIFIED" | "REJECTED";
  createdAt: string;
  // Fineract enrichment
  fineractStatus?: FineractStatus | null;
  officeName?: string;
  activationDate?: string | null;
  displayName?: string;
  mobileNo?: string | null;
  staffName?: string | null;
  externalId?: string | null;
  // Pending approval specific fields
  kycCompletedAt?: string | null;
  hasKycData?: boolean;
}

export interface KycDetailDto {
  user: {
    _id: string;
    username: string;
    email?: string;
    profile?: any;
    fineractClientId?: string;
    kycStatus: string;
  };
  ocr: {
    fullName?: string;
    ssn?: string;
    dateOfBirth?: string;
    address?: string;
    sex?: string;
    issueDate?: string;
  };
  metadata: {
    kycCompletedAt?: string;
    fineractClientDocs?: { front?: number; back?: number };
  };
  documents: {
    id: number;
    name: string;
    entityType: string;
    entityId: number;
    label: string;
  }[];
}

export interface CustomerDetailDto {
  customer: CustomerDto;
  loans: LoanDto[];
  summary: {
    loanCycles: number;
    activeLoans: number;
    lastLoanAmount: number;
    activeSavings: number;
    totalSavings: number;
  };
  savingsAccounts: {
    id: number;
    accountNo?: string;
    productName?: string;
    accountBalance?: number;
    status?: any;
  }[];
  charges: {
    id: number;
    name?: string;
    amount?: number;
    amountPaid?: number;
    amountWaived?: number;
    amountOutstanding?: number;
    dueDate?: number[];
  }[];
  kyc?: KycDetailDto;
}

export interface KycPendingUserDto {
  _id: string;
  username: string;
  email?: string;
  profile?: { firstName?: string; lastName?: string; avatar?: string };
  fineractClientId?: string;
  kycStatus: string;
  kycCompletedAt?: string;
  displayName?: string;
}

export interface KycDetailDto {
  user: {
    _id: string;
    username: string;
    email?: string;
    profile?: any;
    fineractClientId?: string;
    kycStatus: string;
  };
  ocr: {
    fullName?: string;
    ssn?: string;
    dateOfBirth?: string;
    address?: string;
    sex?: string;
    issueDate?: string;
  };
  metadata: {
    kycCompletedAt?: string;
    fineractClientDocs?: { front?: number; back?: number };
  };
  documents: {
    id: number;
    name: string;
    entityType: string;
    entityId: number;
    label: string;
  }[];
}

export interface LoanDto {
  _id?: string | null;
  userId?: string | null;
  clientName?: string;
  productId: number;
  productName: string;
  productShortName: string;
  capital: number;
  periodMonth: number;
  monthlyPay?: number;
  entirelyPay?: number;
  monthlyRatePercent?: number;
  /** May be FineractStatus object or fallback string-like { value, code } */
  status: FineractStatus | { value: string; code: string };
  fineractLoanId?: number;
  disbursementDate?: string;
  createdAt: string;
  willing?: string;
}

// ── Staff types ──────────────────────────────────────────────────────────────

export interface StaffDto {
  _id: string;
  username: string;
  email?: string | null;
  profile?: { firstName?: string; lastName?: string; avatar?: string };
  status: string;
  keycloakId?: string;
  fineractClientId?: string | null;
  fineractStaffId?: number | null;
  phoneNumber?: string | null;
  displayName?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, any>;
  roleId?: string | null;
  roleName?: string | null;
  isDeleted?: boolean;
}

export interface CreateStaffBody {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string;
  password: string;
  roleId: string;
  userType?: "borrower" | "lender" | "staff";
}

export interface UpdateStaffBody {
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  status?: string;
}

// ── Activity Log types ───────────────────────────────────────────────────────

export interface ActivityLogDto {
  _id: string;
  userId: string;
  username: string;
  userRole: string;
  method: string;
  path: string;
  action: string;
  statusCode: number;
  requestBody?: Record<string, any>;
  responseMessage?: string;
  targetInfo?: {
    borrowerName?: string;
    borrowerUsername?: string;
    fineractLoanId?: number;
    staffId?: string;
    staffName?: string;
  };
  ip?: string;
  userAgent?: string;
  duration?: number;
  createdAt: string;
}

// ═══════════════════ RBAC DTOs ══════════════════════════
export interface RoleDto {
  _id: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PermissionDto {
  _id: string;
  roleId: string;
  action: string;
  subject: string;
  allowed: boolean;
}

export interface CreditScoreWeightConfigDto {
  _id?: string;
  name?: string;
  description?: string;
  key?: string;
  isDefault?: boolean;
  isActive?: boolean;
  appliedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  paymentHistory: number;
  debtLevel: number;
  creditAge: number;
  creditMix: number;
  newCredit: number;
  total: number;
}

export const adminApi = {
  login: (username: string, password: string) =>
    api.post<{
      message: string;
      data: { roles?: string[] };
      accessToken: string;
      refreshToken: string;
    }>("/api/auth/login", { username, password }),

  /** Fetch CASL rules for the current user */
  getMyPermissions: () =>
    api
      .get<{
        data: { rules: any[]; roles: string[] };
      }>("/api/admin/me/permissions")
      .then((r) => r.data.data),

  /** Fetch current user profile */
  getMyProfile: () =>
    api
      .get<{
        data: {
          _id: string;
          username: string;
          email: string;
          phoneNumber: string;
          profile: { firstName?: string; lastName?: string };
          roles: string[];
        };
      }>("/api/admin/me/profile")
      .then((r) => r.data.data),

  /** Update current user profile */
  updateMyProfile: (body: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
  }) =>
    api
      .put<{ data: any }>("/api/admin/me/profile", body)
      .then((r) => r.data.data),

  /** Change current user password */
  changeMyPassword: (body: { currentPassword: string; newPassword: string }) =>
    api.put<{ data: any }>("/api/admin/me/password", body).then((r) => r.data),

  /** Get user preferences (font size, etc.) */
  getMyPreferences: () =>
    api
      .get<{
        data: { fontSize: "compact" | "default" | "large" };
      }>("/api/admin/me/preferences")
      .then((r) => r.data.data),

  /** Update user preferences */
  updateMyPreferences: (prefs: {
    fontSize?: "compact" | "default" | "large";
  }) =>
    api
      .patch<{
        data: { fontSize: "compact" | "default" | "large" };
      }>("/api/admin/me/preferences", prefs)
      .then((r) => r.data.data),

  getCreditScoreWeightConfig: () =>
    api
      .get<{
        data: CreditScoreWeightConfigDto;
      }>("/api/admin/credit-score/weights")
      .then((r) => r.data.data),

  updateCreditScoreWeightConfig: (body: {
    paymentHistory: number;
    debtLevel: number;
    creditAge: number;
    creditMix: number;
    newCredit: number;
  }) =>
    api
      .put<{
        data: CreditScoreWeightConfigDto;
      }>("/api/admin/credit-score/weights", body)
      .then((r) => r.data.data),

  listCreditScoreWeightConfigs: () =>
    api
      .get<{
        data: CreditScoreWeightConfigDto[];
      }>("/api/admin/credit-score/weight-configs")
      .then((r) => r.data.data),

  createCreditScoreWeightConfig: (body: {
    name: string;
    description?: string;
    paymentHistory: number;
    debtLevel: number;
    creditAge: number;
    creditMix: number;
    newCredit: number;
  }) =>
    api
      .post<{
        data: CreditScoreWeightConfigDto;
      }>("/api/admin/credit-score/weight-configs", body)
      .then((r) => r.data.data),

  updateCreditScoreWeightConfigById: (
    id: string,
    body: {
      name?: string;
      description?: string;
      isActive?: boolean;
      paymentHistory: number;
      debtLevel: number;
      creditAge: number;
      creditMix: number;
      newCredit: number;
    },
  ) =>
    api
      .put<{
        data: CreditScoreWeightConfigDto;
      }>(`/api/admin/credit-score/weight-configs/${id}`, body)
      .then((r) => r.data.data),

  applyCreditScoreWeightConfig: (id: string) =>
    api
      .post<{
        data: CreditScoreWeightConfigDto;
      }>(`/api/admin/credit-score/weight-configs/${id}/apply`)
      .then((r) => r.data.data),

  getLoanProducts: () =>
    api
      .get<{ data: { products: LoanProductDto[] } }>("/api/admin/loan-products")
      .then((r) => r.data.data.products),

  getLoanProductDetails: (productId: number) =>
    api
      .get<{ data: any }>(`/api/admin/loan-products/${productId}/details`)
      .then((r) => r.data.data),

  getDocumentTypes: () =>
    api
      .get<{ data: DocumentTypeDto[] }>("/api/admin/document-types")
      .then((r) => r.data.data),

  createDocumentType: (body: {
    name: string;
    required?: boolean;
    description?: string;
    fileFormat?: FileFormat;
  }) =>
    api
      .post<{ data: DocumentTypeDto }>("/api/admin/document-types", body)
      .then((r) => r.data.data),

  updateDocumentType: (id: string, body: Partial<DocumentTypeDto>) =>
    api
      .put<{ data: DocumentTypeDto }>(`/api/admin/document-types/${id}`, body)
      .then((r) => r.data.data),

  deleteDocumentType: (id: string) =>
    api.delete(`/api/admin/document-types/${id}`),

  getProductDocumentTypes: (fineractProductId: number) =>
    api
      .get<{
        data: {
          documentTypeId: string;
          documentType: DocumentTypeDto;
          required: boolean;
        }[];
      }>(`/api/admin/loan-products/${fineractProductId}/document-types`)
      .then((r) => r.data.data),

  setProductDocumentTypes: (
    fineractProductId: number,
    items: { documentTypeId: string; required?: boolean }[],
  ) =>
    api.put(`/api/admin/loan-products/${fineractProductId}/document-types`, {
      items,
    }),

  getSyncDriftLogs: (limit = 20, scope?: "loan" | "savings") => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (scope) params.set("scope", scope);
    return api
      .get<{
        data: SyncDriftLogDto[];
      }>(`/api/admin/sync-drift?${params.toString()}`)
      .then((r) => r.data.data);
  },

  syncCompare: () =>
    api
      .post<{
        data: { added: unknown[]; removed: unknown[]; modified: unknown[] };
      }>("/api/admin/sync-compare")
      .then((r) => r.data.data),

  getSavingsProducts: () =>
    api
      .get<{
        data: { products: SavingsProductDto[] };
      }>("/api/admin/savings-products")
      .then((r) => r.data.data.products),

  getSavingsProductDetails: (productId: number) =>
    api
      .get<{ data: any }>(`/api/admin/savings-products/${productId}/details`)
      .then((r) => r.data.data),

  syncCompareSavings: () =>
    api
      .post<{
        data: { added: unknown[]; removed: unknown[]; modified: unknown[] };
      }>("/api/admin/sync-compare-savings")
      .then((r) => r.data.data),

  getFDProducts: () =>
    api
      .get<{
        data: { products: FDProductDto[] };
      }>("/api/admin/fd-products")
      .then((r) => r.data.data.products),

  getFDProductDetails: (productId: number) =>
    api
      .get<{ data: any }>(`/api/admin/fd-products/${productId}/details`)
      .then((r) => r.data.data),

  syncCompareFD: () =>
    api
      .post<{
        data: { added: unknown[]; removed: unknown[]; modified: unknown[] };
      }>("/api/admin/sync-compare-fd")
      .then((r) => r.data.data),

  // ── Customers (Head Office) ────────────────────────────────────────────────
  getCustomers: (page = 1, limit = 20, keyword?: string) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (keyword?.trim()) params.set("keyword", keyword.trim());
    return api
      .get<{
        data: {
          users: CustomerDto[];
          total: number;
          page: number;
          limit: number;
        };
      }>(`/api/admin/customers?${params.toString()}`)
      .then((r) => r.data.data);
  },

  getPendingApprovalCustomers: (page = 1, limit = 20, keyword?: string) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (keyword?.trim()) params.set("keyword", keyword.trim());
    return api
      .get<{
        data: {
          users: CustomerDto[];
          total: number;
          page: number;
          limit: number;
        };
      }>(`/api/admin/customers/pending-approval?${params.toString()}`)
      .then((r) => r.data.data);
  },

  getCustomer: (id: string) =>
    api
      .get<{ data: CustomerDto }>(`/api/admin/customers/${id}`)
      .then((r) => r.data.data),

  getCustomerDetail: (id: string) =>
    api
      .get<{ data: CustomerDetailDto }>(`/api/admin/customers/${id}/detail`)
      .then((r) => r.data.data),

  getCustomerLoans: (userId: string) =>
    api
      .get<{
        data: { loans: LoanDto[] };
      }>(`/api/admin/customers/${userId}/loans`)
      .then((r) => r.data.data.loans),

  // ── Loan Management ──────────────────────────────────────────────────────────
  getLoansStats: () =>
    api
      .get<{
        data: {
          total: number;
          pending: number;
          approved: number;
          disbursed: number;
          overdue: number;
          closed: number;
        };
      }>("/api/admin/loans/stats")
      .then((r) => r.data.data),

  getLoans: (params?: {
    page?: number;
    limit?: number;
    status?:
      | "all"
      | "pending"
      | "approved"
      | "disbursed"
      | "overdue"
      | "closed";
    productId?: number;
    classification?: string;
    keyword?: string;
    delinquentDaysMin?: number;
    delinquentDaysMax?: number;
    minOverdueAmount?: number;
    maxOverdueAmount?: number;
    disbursementDateFrom?: string;
    disbursementDateTo?: string;
  }) =>
    api
      .get<{
        data: {
          total: number;
          page: number;
          limit: number;
          items: Array<{
            _id: string;
            fineractLoanId: number;
            userId: string;
            customerName: string;
            customerUsername: string;
            productId: number;
            productName: string;
            productShortName?: string;
            capital: number;
            periodMonth: number;
            monthlyPay?: number;
            entirelyPay?: number;
            monthlyRatePercent?: number;
            willing?: string;
            status: string;
            delinquencyClassification: string | null;
            totalOverdue: number;
            delinquentDays: number;
            disbursementDate: string | null;
            createdAt?: string;
            lastSyncedAt: string | null;
          }>;
        };
      }>("/api/admin/loans", { params })
      .then((r) => r.data.data),

  // ── Loan Approvals ──────────────────────────────────────────────────────────
  getPendingLoans: () =>
    api
      .get<{ data: { loans: LoanDto[] } }>("/api/admin/loans/pending")
      .then((r) => r.data.data.loans),

  /** Danh sách khoản vay quá hạn (lọc chi tiết: nhóm, khoản quá hạn từ–đến, số ngày quá hạn từ–đến). Data sync từ Fineract hằng ngày. */
  getOverdueLoans: (params?: {
    classification?: string;
    minOverdueAmount?: number;
    maxOverdueAmount?: number;
    delinquentDaysMin?: number;
    delinquentDaysMax?: number;
  }) =>
    api
      .get<{
        data: {
          total: number;
          items: Array<{
            _id: string;
            fineractLoanId: number;
            userId: string;
            customerName: string;
            customerUsername: string;
            fineractClientId?: string;
            capital: number;
            totalOverdue: number;
            delinquentDays: number;
            delinquencyClassification: string | null;
            lastSyncedAt: string | null;
          }>;
        };
      }>("/api/delinquency/overdue-loans", { params })
      .then((r) => r.data.data),

  /** Danh sách nhóm quá hạn (delinquency ranges) từ Fineract để lọc. */
  getDelinquencyRanges: () =>
    api
      .get<{
        data: Array<{
          id: number;
          classification: string;
          minimumAgeDays?: number;
        }>;
      }>("/api/delinquency/ranges")
      .then((r) => r.data.data),

  /** Danh sách debt_group từ Fineract delinquency ranges để cấu hình policy. */
  getDelinquencyPolicyDebtGroups: () =>
    api
      .get<{
        data: Array<{
          debt_group: number;
          debt_group_name: string;
          min_days: number;
          max_days: number | null;
        }>;
      }>("/api/delinquency/policies/debt-groups")
      .then((r) => r.data.data),

  /** Danh sách policy cấu hình xử lý nợ xấu. */
  getDelinquencyPolicies: (params?: {
    is_active?: boolean;
    debt_group?: number;
    loan_product_id?: number;
    collection_stage?:
      | "NONE"
      | "REMINDER"
      | "WARNING"
      | "COLLECTION"
      | "LEGAL"
      | "WRITE_OFF";
  }) =>
    api
      .get<{
        data: Array<{
          _id: string;
          policy_id: string;
          loan_product_id?: number | null;
          loan_product_name?: string | null;
          debt_group: number;
          debt_group_name: string;
          min_days: number;
          max_days: number | null;
          send_email: boolean;
          send_sms: boolean;
          send_notification: boolean;
          apply_penalty: boolean;
          block_new_loan: boolean;
          collection_stage:
            | "NONE"
            | "REMINDER"
            | "WARNING"
            | "COLLECTION"
            | "LEGAL"
            | "WRITE_OFF";
          legal_escalation: boolean;
          is_active: boolean;
          description?: string;
          createdAt: string;
          updatedAt: string;
        }>;
      }>("/api/delinquency/policies", { params })
      .then((r) => r.data.data),

  /** Tạo policy xử lý nợ xấu. */
  createDelinquencyPolicy: (payload: {
    loan_product_id: number;
    loan_product_name?: string;
    debt_group: number;
    debt_group_name?: string;
    send_email: boolean;
    send_sms: boolean;
    send_notification: boolean;
    apply_penalty: boolean;
    block_new_loan: boolean;
    collection_stage:
      | "NONE"
      | "REMINDER"
      | "WARNING"
      | "COLLECTION"
      | "LEGAL"
      | "WRITE_OFF";
    legal_escalation?: boolean;
    is_active?: boolean;
    description?: string;
  }) =>
    api
      .post<{ data: any }>("/api/delinquency/policies", payload)
      .then((r) => r.data.data),

  /** Cập nhật policy xử lý nợ xấu (dùng cho switch on/off). */
  updateDelinquencyPolicy: (
    id: string,
    payload: Partial<{
      loan_product_id: number;
      loan_product_name: string;
      debt_group: number;
      debt_group_name: string;
      send_email: boolean;
      send_sms: boolean;
      send_notification: boolean;
      apply_penalty: boolean;
      block_new_loan: boolean;
      collection_stage:
        | "NONE"
        | "REMINDER"
        | "WARNING"
        | "COLLECTION"
        | "LEGAL"
        | "WRITE_OFF";
      legal_escalation: boolean;
      is_active: boolean;
      description: string;
    }>,
  ) =>
    api
      .put<{ data: any }>(`/api/delinquency/policies/${id}`, payload)
      .then((r) => r.data.data),

  /** Xóa policy xử lý nợ xấu. */
  removeDelinquencyPolicy: (id: string) =>
    api
      .delete<{
        data: { deleted: boolean };
      }>(`/api/delinquency/policies/${id}`)
      .then((r) => r.data.data),

  /** Đồng bộ tất cả khoản vay đã giải ngân từ Fineract vào Mongo; báo cáo từng thay đổi lưu vào loan_sync_runs. */
  syncDisbursedLoans: (limit?: number) =>
    api
      .post<{
        data: {
          synced: number;
          errors: number;
          skipped: number;
          runId?: string;
        };
      }>(
        "/api/admin/sync-disbursed-loans",
        {},
        { params: limit != null ? { limit } : {} },
      )
      .then((r) => r.data.data),

  /** Lịch sử chạy đồng bộ khoản vay (truy vết từng thay đổi). */
  getLoanSyncRuns: (limit = 30) =>
    api
      .get<{
        data: LoanSyncRunDto[];
      }>(`/api/admin/loan-sync-runs?limit=${limit}`)
      .then((r) => r.data.data),

  approveLoan: (fineractLoanId: number) =>
    api
      .post<{
        data: { fineractLoanId: number; status: string };
      }>(`/api/admin/loans/${fineractLoanId}/approve`)
      .then((r) => r.data.data),

  disburseLoan: (fineractLoanId: number) =>
    api
      .post<{
        data: { fineractLoanId: number; status: string };
      }>(`/api/admin/loans/${fineractLoanId}/disburse`)
      .then((r) => r.data.data),

  rejectLoan: (fineractLoanId: number, note?: string) =>
    api
      .post<{
        data: { fineractLoanId: number; status: string };
      }>(`/api/admin/loans/${fineractLoanId}/reject`, { note })
      .then((r) => r.data.data),

  undoApproval: (fineractLoanId: number, note?: string) =>
    api
      .post<{
        data: { fineractLoanId: number; status: string };
      }>(`/api/admin/loans/${fineractLoanId}/undo-approval`, { note })
      .then((r) => r.data.data),

  getContractStatus: (fineractLoanId: number) =>
    api
      .get<{
        data: {
          hasContract: boolean;
          contractStatus: string | null;
          signedAt: string | null;
        };
      }>(`/api/admin/loans/${fineractLoanId}/contract-status`)
      .then((r) => r.data.data),

  getMyActivityLogs: (page = 1, limit = 20) =>
    api
      .get<{
        data: {
          logs: ActivityLogDto[];
          total: number;
          page: number;
          totalPages: number;
        };
      }>(`/api/admin/me/activity-logs`, { params: { page, limit } })
      .then((r) => r.data.data),

  getLoanDetails: (fineractLoanId: number | { id?: number }, sync = false) => {
    const id =
      typeof fineractLoanId === "object" &&
      fineractLoanId != null &&
      "id" in fineractLoanId
        ? fineractLoanId.id
        : fineractLoanId;
    const num = Number(id);
    if (!Number.isFinite(num))
      throw new Error(`Invalid fineractLoanId: ${fineractLoanId}`);
    return api
      .get<{ data: any }>(`/api/admin/loans/${num}/details?sync=${sync}`)
      .then((r) => r.data.data);
  },

  syncLoan: (fineractLoanId: number) =>
    api
      .post<{ data: any }>(`/api/admin/loans/${fineractLoanId}/sync`)
      .then((r) => r.data.data),

  syncCustomerLoans: (userId: string) =>
    api
      .post<{ data: any }>(`/api/admin/customers/${userId}/sync-loans`)
      .then((r) => r.data.data),

  getLoanDocuments: (fineractLoanId: number | { id?: number }) => {
    const id =
      typeof fineractLoanId === "object" &&
      fineractLoanId != null &&
      "id" in fineractLoanId
        ? fineractLoanId.id
        : fineractLoanId;
    const num = Number(id);
    if (!Number.isFinite(num))
      throw new Error(`Invalid fineractLoanId: ${fineractLoanId}`);
    return api
      .get<{ data: any[] }>(`/api/admin/loans/${num}/documents`)
      .then((r) => r.data.data);
  },

  downloadLoanDocument: (
    fineractLoanId: number | { id?: number },
    documentId: number,
  ) => {
    const id =
      typeof fineractLoanId === "object" &&
      fineractLoanId != null &&
      "id" in fineractLoanId
        ? fineractLoanId.id
        : fineractLoanId;
    const num = Number(id);
    if (!Number.isFinite(num))
      throw new Error(`Invalid fineractLoanId: ${fineractLoanId}`);
    return api.get(`/api/admin/loans/${num}/documents/${documentId}`, {
      responseType: "blob",
    });
  },

  approveDocument: (fineractLoanId: number, documentId: number) =>
    api
      .post<{
        data: { documentId: number; reviewStatus: string };
      }>(`/api/admin/loans/${fineractLoanId}/documents/${documentId}/approve`)
      .then((r) => r.data.data),

  rejectDocument: (fineractLoanId: number, documentId: number) =>
    api
      .post<{
        data: { documentId: number; reviewStatus: string };
      }>(`/api/admin/loans/${fineractLoanId}/documents/${documentId}/reject`)
      .then((r) => r.data.data),

  classifyDocument: (
    fineractLoanId: number,
    documentId: number,
    documentTypeId: string,
  ) =>
    api
      .patch<{
        data: { documentId: number; documentTypeId: string };
      }>(
        `/api/admin/loans/${fineractLoanId}/documents/${documentId}/classify`,
        { documentTypeId },
      )
      .then((r) => r.data.data),

  canApproveLoan: (fineractLoanId: number) =>
    api
      .get<{
        data: { canApprove: boolean; missingRequired: string[] };
      }>(`/api/admin/loans/${fineractLoanId}/can-approve`)
      .then((r) => r.data.data),

  // ── KYC Approvals ──────────────────────────────────────────────────────────
  getPendingKyc: () =>
    api
      .get<{ data: { users: KycPendingUserDto[] } }>("/api/admin/kyc/pending")
      .then((r) => r.data.data.users),

  getKycDetail: (userId: string) =>
    api
      .get<{ data: KycDetailDto }>(`/api/admin/kyc/${userId}`)
      .then((r) => r.data.data),

  approveKyc: (userId: string) =>
    api
      .post<{
        data: { kycStatus: string; userId: string };
      }>(`/api/admin/kyc/${userId}/approve`)
      .then((r) => r.data.data),

  rejectKyc: (userId: string) =>
    api
      .post<{
        data: { kycStatus: string; userId: string };
      }>(`/api/admin/kyc/${userId}/reject`)
      .then((r) => r.data.data),

  downloadKycDocument: (
    userId: string,
    entityType: string,
    entityId: number,
    documentId: number,
  ) =>
    api.get(
      `/api/admin/kyc/${userId}/documents/${entityType}/${entityId}/${documentId}`,
      { responseType: "blob" },
    ),

  /** OCR mặt trước CCCD (nhân viên tải lên giúp khách hàng) */
  ocrFront: (userId: string, file: File) => {
    const formData = new FormData();
    formData.append("frontID", file);
    return api
      .post<{ data: any }>(`/api/admin/kyc/${userId}/ocr-front`, formData)
      .then((r) => r.data.data);
  },

  /** OCR mặt sau CCCD */
  ocrBack: (userId: string, file: File) => {
    const formData = new FormData();
    formData.append("backID", file);
    return api
      .post<{ data: any }>(`/api/admin/kyc/${userId}/ocr-back`, formData)
      .then((r) => r.data.data);
  },

  /** Lưu KYC cho user (nhân viên làm giúp) */
  saveKycForUser: (
    userId: string,
    frontOCRData: any,
    backOCRData: any,
    frontImage?: File | null,
    backImage?: File | null,
  ) => {
    const formData = new FormData();
    formData.append("frontOCRData", JSON.stringify(frontOCRData));
    formData.append("backOCRData", JSON.stringify(backOCRData || frontOCRData));
    if (frontImage) formData.append("frontImage", frontImage);
    if (backImage) formData.append("backImage", backImage);
    return api
      .post<{ data: any }>(`/api/admin/kyc/${userId}/save`, formData)
      .then((r) => r.data.data);
  },

  // ── Staff Management ───────────────────────────────────────────────────────
  getStaffList: (page = 1, limit = 20, keyword?: string) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (keyword?.trim()) params.set("keyword", keyword.trim());
    return api
      .get<{
        data: {
          staff: StaffDto[];
          total: number;
          page: number;
          limit: number;
          deletedCount?: number;
        };
      }>(`/api/admin/staff?${params.toString()}`)
      .then((r) => r.data.data);
  },

  getStaffById: (id: string) =>
    api
      .get<{ data: StaffDto }>(`/api/admin/staff/${id}`)
      .then((r) => r.data.data),

  createStaff: (body: CreateStaffBody) =>
    api
      .post<{ data: StaffDto }>("/api/admin/staff", body)
      .then((r) => r.data.data),

  updateStaff: (id: string, body: UpdateStaffBody) =>
    api
      .put<{ data: StaffDto }>(`/api/admin/staff/${id}`, body)
      .then((r) => r.data.data),

  deleteStaff: (id: string) =>
    api
      .delete<{
        data: { deleted: boolean; staffId: string };
      }>(`/api/admin/staff/${id}`)
      .then((r) => r.data.data),

  restoreStaff: (id: string) =>
    api
      .post<{ data: StaffDto }>(`/api/admin/staff/${id}/restore`)
      .then((r) => r.data.data),

  getDeletedStaffList: (page = 1, limit = 20) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    return api
      .get<{
        data: {
          staff: StaffDto[];
          total: number;
          page: number;
          limit: number;
        };
      }>(`/api/admin/staff-deleted?${params.toString()}`)
      .then((r) => r.data.data);
  },

  migratePhoneNumbers: () =>
    api
      .post<{
        data: { modifiedCount: number };
      }>("/api/admin/migrate-phone-numbers")
      .then((r) => r.data.data),

  // ── Activity Logs ──────────────────────────────────────────────────────────
  getActivityLogs: (page = 1, limit = 20) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    return api
      .get<{
        data: {
          logs: ActivityLogDto[];
          total: number;
          page: number;
          limit: number;
        };
      }>(`/api/admin/activity-logs?${params.toString()}`)
      .then((r) => r.data.data);
  },

  getActivityLogsByUser: (userId: string, page = 1, limit = 20) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    return api
      .get<{
        data: {
          logs: ActivityLogDto[];
          total: number;
          page: number;
          limit: number;
        };
      }>(`/api/admin/activity-logs/user/${userId}?${params.toString()}`)
      .then((r) => r.data.data);
  },

  // ═══════════════════ RBAC ═══════════════════════════════════════════════════

  getRbacMetadata: () =>
    api
      .get<{
        data: { actions: string[]; subjects: string[] };
      }>("/api/admin/rbac/metadata")
      .then((r) => r.data.data),

  getRoles: () =>
    api
      .get<{ data: RoleDto[] }>("/api/admin/rbac/roles")
      .then((r) => r.data.data),

  createRole: (body: { name: string; description?: string }) =>
    api
      .post<{ data: RoleDto }>("/api/admin/rbac/roles", body)
      .then((r) => r.data.data),

  updateRole: (
    id: string,
    body: { name?: string; description?: string; isActive?: boolean },
  ) =>
    api
      .put<{ data: RoleDto }>(`/api/admin/rbac/roles/${id}`, body)
      .then((r) => r.data.data),

  deleteRole: (id: string) =>
    api
      .delete<{ data: { deleted: boolean } }>(`/api/admin/rbac/roles/${id}`)
      .then((r) => r.data.data),

  getRolePermissions: (roleId: string) =>
    api
      .get<{
        data: PermissionDto[];
      }>(`/api/admin/rbac/roles/${roleId}/permissions`)
      .then((r) => r.data.data),

  setRolePermissions: (
    roleId: string,
    permissions: { action: string; subject: string; allowed: boolean }[],
  ) =>
    api
      .put<{
        data: PermissionDto[];
      }>(`/api/admin/rbac/roles/${roleId}/permissions`, { permissions })
      .then((r) => r.data.data),

  togglePermission: (
    roleId: string,
    action: string,
    subject: string,
    allowed: boolean,
  ) =>
    api
      .post<{
        data: PermissionDto;
      }>(`/api/admin/rbac/roles/${roleId}/permissions/toggle`, {
        action,
        subject,
        allowed,
      })
      .then((r) => r.data.data),
};
