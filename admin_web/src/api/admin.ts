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
  isDeleted?: boolean;
}

export interface CreateStaffBody {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string;
  password: string;
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

  // ── Loan Approvals ──────────────────────────────────────────────────────────
  getPendingLoans: () =>
    api
      .get<{ data: { loans: LoanDto[] } }>("/api/admin/loans/pending")
      .then((r) => r.data.data.loans),

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
};
