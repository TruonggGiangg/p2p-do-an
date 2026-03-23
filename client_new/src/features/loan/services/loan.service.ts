import { Platform } from "react-native";
import api from "../../../core/api/api.client";

export interface LoanProductConfig {
  productId: number;
  name: string;
  shortName: string;
  monthlyRate: number;
  annualRate: number;
  interestType: string;
  inMultiplesOf: number;
  currency: string;
  minNumberOfRepayments?: number;
  maxNumberOfRepayments?: number;
  minInterestRatePerPeriod?: number;
  maxInterestRatePerPeriod?: number;
  isAnnual?: boolean;
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

export interface LoanProduct {
  id: number;
  name: string;
  shortName: string;
  interestRatePerPeriod: number;
  annualInterestRate?: number;
  interestType: {
    id: number;
    code: string;
    value: string;
  };
  minPrincipal?: number;
  maxPrincipal?: number;
  interestRateFrequencyType?: {
    id: number;
    code: string;
    value: string;
  };
  minNumberOfRepayments?: number;
  maxNumberOfRepayments?: number;
}

export interface LoanProductsResponse {
  statusCode: number;
  message: string;
  data: {
    products: LoanProduct[];
    count: number;
  };
}

/** Loại tài liệu cần nộp theo gói vay (cho form hồ sơ) */
export interface LoanDocumentType {
  id: string;
  name: string;
  required: boolean;
  sortOrder: number;
  description?: string;
}

export interface LoanDocumentTypesResponse {
  statusCode: number;
  message: string;
  data: { documentTypes: LoanDocumentType[] };
}

/** Mục lịch sử khoản vay (MongoDB + Fineract) */
export interface LoanHistoryItem {
  id: string;
  source: "mongo" | "fineract" | "merged";
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
  // Enriched fields from paginated API
  contractId?: string;
  willing?: string;
  progress?: number;
  paidInstallments?: number;
  totalInstallments?: number;
  rate?: number;
  statusInfo?: any;
  // Investment tracking
  totalNotes?: number;
  investedNotes?: number;
  nodeMatch?: number;
  isFullMatch?: boolean;
  delinquentDays?: number;
}

export interface LoanListResponse {
  loans: LoanHistoryItem[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  summary: {
    totalActiveLoans: number;
    totalPaidLoans: number;
    totalWaitingLoans: number;
    totalOutstanding: number;
  };
}

/** Phí khoản vay (Fineract charge) */
export interface ProductCharge {
  id: number;
  name: string;
  amount: number;
  /** 'flat' | 'percent_amount' | etc. */
  chargeCalculationType: string;
  /** 'disbursement' | 'specified_due_date' | etc. */
  chargeTimeType: string;
  currency?: string;
}

export interface DelinquencyPolicyItem {
  _id: string;
  loan_product_id?: number;
  debt_group: number;
  debt_group_name: string;
  min_days: number | null;
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
}

// =============================================
// LOAN CONTRACT Interfaces
// =============================================

export type LoanContractStatus =
  | "pending_signature"
  | "signed"
  | "active"
  | "completed"
  | "cancelled";

export interface BorrowerInfo {
  fullName: string;
  idNumber: string;
  dateOfBirth?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface RepaymentScheduleContractItem {
  period: number;
  dueDate: string;
  principal: number;
  interest: number;
  total: number;
  remainingAfter: number;
}

export interface FeeStructureItem {
  name: string;
  amount: number;
  type: string;
  description?: string;
}

export interface LoanContract {
  _id: string;
  contractId: string;
  loanId: string;
  userId: string;
  fineractLoanId?: number;
  borrowerInfo: BorrowerInfo;
  principalAmount: number;
  interestRate: number;
  tenure: number;
  repaymentSchedule: RepaymentScheduleContractItem[];
  totalPayable: number;
  monthlyPayment: number;
  feeStructure: FeeStructureItem[];
  delinquencyPolicySnapshot?: Array<{
    debt_group: number;
    debt_group_name: string;
    min_days: number;
    max_days: number;
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
  }>;
  productName?: string;
  status: LoanContractStatus;
  signedAt?: string;
  signatureData?: string;
  legalApprovalAt?: string;
  disbursementDate?: string;
  firstRepaymentDate?: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================
// NOTIFICATION Interfaces
// =============================================

export type NotificationType =
  | "loan_approved"
  | "loan_rejected"
  | "loan_disbursed"
  | "contract_ready"
  | "contract_signed"
  | "repayment_due"
  | "repayment_received"
  | "overdue_reminder"
  | "general"
  | "loan_overdue"
  | "system";

export interface AppNotification {
  _id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  data?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListResponse {
  notifications: AppNotification[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
}

// =============================================
// LOAN SUPPORT REQUESTS
// =============================================

export interface LoanSupportRequestPayload {
  loanId: string;
  requestType: "WAIVE_PENALTY" | "RESCHEDULE" | "WRITE_OFF" | "WAIVE_INTEREST";
  reason: string;
  proposedRescheduleDate?: string;
}

export interface LoanSupportRequestResult {
  success: boolean;
  message: string;
  data: any;
}

// =============================================
// DIGITAL SIGNATURE — VNPT SmartCA Interfaces
// =============================================

export interface SmartCaSigningSession {
  signatureId: string;
  transactionId: string;
  signingSessionId: string;
  credentialId: string;
  expiresAt: string;
  flow?: "v1" | "v2";
}

export interface SmartCaSignResult {
  status: "SUCCESS" | "FAILED" | "REJECTED" | "TIMEOUT";
  signatureValue?: string;
  signerCertificate?: string;
  signerInfo?: {
    commonName?: string;
    serialNumber?: string;
    organization?: string;
    validFrom?: string;
    validTo?: string;
  };
  signedFileUrl?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface SmartCaConfirmResult {
  status: string;
  completedAt?: string;
  signedFileUrl?: string;
  error?: string;
}

export interface SmartCaStatusResult {
  status: string;
  transactionId?: string;
  completedAt?: string;
  signedFileUrl?: string;
}

export interface SmartCaV2SignResult {
  signatureId: string;
  transactionId: string;
  status: "signed" | "failed";
  completedAt?: string;
  error?: string;
}

export interface SmartCaCertificate {
  serialNumber: string;
  status: string;
  statusCode: string;
  subject?: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
}

export interface DigitalSignatureInfo {
  _id: string;
  contractId: string;
  contractCode: string;
  provider: string;
  transactionId?: string;
  status: string;
  documentHash: string;
  signedFileUrl?: string;
  signatureValue?: string;
  signerInfo?: {
    commonName?: string;
    serialNumber?: string;
    organization?: string;
    validFrom?: string;
    validTo?: string;
  };
  completedAt?: string;
  createdAt: string;
}

export interface SignatureVerifyResult {
  valid: boolean;
  documentHash: string;
  currentHash: string;
  message: string;
}

class LoanService {
  /**
   * Fetch all loan products available for borrowing
   */
  async getLoanProducts(): Promise<LoanProduct[]> {
    try {
      const response =
        await api.get<LoanProductsResponse>("/api/loan/products");
      return response.data.data.products;
    } catch (error) {
      console.error("[LoanService] Error fetching loan products:", error);
      throw error;
    }
  }

  /**
   * Lấy danh sách loại tài liệu cần nộp theo sản phẩm vay
   */
  async getDocumentTypesByProduct(
    productId: number,
  ): Promise<LoanDocumentType[]> {
    try {
      const response = await api.get<LoanDocumentTypesResponse>(
        `/api/loan/products/${productId}/document-types`,
      );
      return response.data.data.documentTypes ?? [];
    } catch (error) {
      console.error("[LoanService] Error fetching document types:", error);
      throw error;
    }
  }

  /**
   * Lấy danh sách mục đích vay từ Fineract CodeValues
   */
  async getLoanPurposes(): Promise<string[]> {
    const response = await api.get<{
      statusCode: number;
      data: { purposes: string[] };
    }>("/api/loan/purposes");
    return response.data.data.purposes ?? [];
  }

  /**
   * Lấy cấu hình sản phẩm vay (lãi suất mặc định, bội số làm tròn, loại lãi)
   */
  async getProductConfig(productId: number): Promise<LoanProductConfig> {
    const response = await api.get<{
      statusCode: number;
      data: LoanProductConfig;
    }>(`/api/loan/products/${productId}/config`);
    return response.data.data;
  }

  /**
   * Tính lịch trả nợ dự kiến (lãi phẳng / dư nợ giảm dần, làm tròn theo bội số)
   */
  async ratePreview(params: {
    capital: number;
    periodMonth: number;
    productId: number;
    monthlyRatePercent?: number;
  }): Promise<LoanScheduleResult> {
    const response = await api.post<{
      statusCode: number;
      data: LoanScheduleResult;
    }>("/api/loan/rate-preview", params);
    return response.data.data;
  }

  /**
   * Lấy lịch sử khoản vay - hỗ trợ pagination, filter, sort
   */
  async getApplications(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }): Promise<LoanListResponse> {
    const query = new URLSearchParams();
    if (params?.page) query.append("page", String(params.page));
    if (params?.pageSize) query.append("pageSize", String(params.pageSize));
    if (params?.status) query.append("status", params.status);
    if (params?.sortBy) query.append("sortBy", params.sortBy);
    if (params?.sortOrder) query.append("sortOrder", params.sortOrder);
    const qs = query.toString() ? `?${query.toString()}` : "";
    const response = await api.get<{
      statusCode: number;
      data: LoanListResponse;
    }>(`/api/loan/applications${qs}`);
    return response.data.data;
  }

  /**
   * Tạo đơn vay (không blockchain, không bước thanh toán)
   * @param otpSessionId - Smart OTP session ID khi user đã bật Smart OTP
   */
  async apply(params: {
    capital: number;
    periodMonth: number;
    productId: number;
    monthlyRatePercent?: number;
    willing?: string;
    disbursementDate: string;
    disbursementWalletId: string;
    documents?: Array<{ documentTypeId: string; name: string; uri?: string }>;
    otpSessionId?: string;
  }): Promise<{
    id: string;
    status: string;
    capital: number;
    periodMonth: number;
    monthlyPay: number;
    entirelyPay: number;
    disbursementWalletId: string;
    schedulePreview: ScheduleItem[];
  }> {
    const response = await api.post<{ statusCode: number; data: any }>(
      "/api/loan/apply",
      params,
    );
    return response.data.data;
  }

  /**
   * Upload tài liệu khoản vay lên Server
   */
  async uploadDocument(
    loanId: string,
    fileUri: string,
    fileMimeType: string,
    documentTypeId: string,
  ): Promise<any> {
    const formData = new FormData();
    const filename = fileUri.split("/").pop() || "upload.jpg";

    // @ts-ignore
    formData.append("file", {
      uri: Platform.OS === "ios" ? fileUri.replace("file://", "") : fileUri,
      name: filename,
      type: fileMimeType || "image/jpeg",
    });
    formData.append("documentTypeId", documentTypeId);

    try {
      const response = await api.post(
        `/api/loan/${loanId}/documents`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );
      return response.data;
    } catch (error) {
      console.error("[LoanService] Error uploading document:", error);
      throw error;
    }
  }

  // =============================================
  // REPAYMENT & PREPAYMENT
  // =============================================

  /**
   * Thanh toán nợ theo kỳ
   */
  async makeRepayment(
    loanId: string,
    amount: number,
    repaymentDate?: string,
  ): Promise<RepaymentResult> {
    const response = await api.post<{
      statusCode: number;
      data: RepaymentResult;
    }>("/api/loan/repay", {
      loanId,
      amount,
      repaymentDate,
    });
    return response.data.data;
  }

  /**
   * Tất toán sớm (trả hết dư nợ)
   */
  async prepayLoan(
    loanId: string,
    repaymentDate?: string,
  ): Promise<RepaymentResult> {
    const response = await api.post<{
      statusCode: number;
      data: RepaymentResult;
    }>("/api/loan/prepay", {
      loanId,
      repaymentDate,
    });
    return response.data.data;
  }

  /**
   * Lấy số tiền cần trả để tất toán
   */
  async getPrepayAmount(loanId: string): Promise<PrepayAmountResult> {
    const response = await api.get<{
      statusCode: number;
      data: PrepayAmountResult;
    }>(`/api/loan/${loanId}/prepay-amount`);
    return response.data.data;
  }

  /**
   * Lấy dư nợ còn lại
   */
  async getOutstanding(loanId: string): Promise<OutstandingResult> {
    const response = await api.get<{
      statusCode: number;
      data: OutstandingResult;
    }>(`/api/loan/${loanId}/outstanding`);
    return response.data.data;
  }

  /**
   * Hủy đơn vay đang chờ duyệt
   */
  async withdrawLoan(
    loanId: string,
    reason?: string,
  ): Promise<{ loanId: string; status: string; message: string }> {
    const response = await api.post<{
      statusCode: number;
      data: { loanId: string; status: string; message: string };
    }>(`/api/loan/${loanId}/withdraw`, { reason });
    return response.data.data;
  }

  /**
   * Lấy lịch trả nợ từ Fineract
   */
  async getRepaymentSchedule(loanId: string): Promise<RepaymentScheduleResult> {
    const response = await api.get<{
      statusCode: number;
      data: RepaymentScheduleResult;
    }>(`/api/loan/${loanId}/schedule`);
    return response.data.data;
  }

  /**
   * Lấy danh sách phí của sản phẩm vay
   */
  async getProductCharges(productId: number): Promise<ProductCharge[]> {
    const response = await api.get<{
      statusCode: number;
      data: { charges: ProductCharge[] };
    }>(`/api/loan/products/${productId}/charges`);
    return response.data.data?.charges ?? [];
  }

  /** Lấy chính sách quá hạn theo sản phẩm vay để hiển thị trước khi gửi đơn vay */
  async getDelinquencyPolicies(
    loanProductId?: number,
  ): Promise<DelinquencyPolicyItem[]> {
    try {
      const response = await api.get<{ data: DelinquencyPolicyItem[] }>(
        "/api/delinquency/policies",
        {
          params: {
            is_active: true,
            ...(Number.isFinite(loanProductId)
              ? { loan_product_id: loanProductId }
              : {}),
          },
        },
      );
      const policies = response.data.data ?? [];

      // Safety net: never render cross-product policies when product id is known.
      if (Number.isFinite(loanProductId)) {
        return policies.filter(
          (p) => Number(p.loan_product_id) === Number(loanProductId),
        );
      }

      return policies;
    } catch {
      return [];
    }
  }

  // =============================================
  // LOAN SUPPORT REQUESTS Methods
  // =============================================

  /**
   * Khách hàng gửi yêu cầu hỗ trợ (Xin xóa phạt hoặc Cơ cấu nợ)
   * Server route: POST /api/loan/:loanId/support-request
   */
  async submitSupportRequest(
    payload: LoanSupportRequestPayload,
  ): Promise<LoanSupportRequestResult> {
    const { loanId, ...body } = payload;
    const response = await api.post<LoanSupportRequestResult>(
      `/api/loan/${loanId}/support-request`,
      body,
    );
    return response.data;
  }

  // =============================================
  // LOAN CONTRACT Methods
  // =============================================

  /**
   * Lấy danh sách hợp đồng vay của user
   */
  async getContracts(): Promise<LoanContract[]> {
    const response = await api.get<{
      statusCode: number;
      data: { contracts: LoanContract[] };
    }>("/api/loan/contracts");
    return response.data.data?.contracts ?? [];
  }

  /**
   * Lấy chi tiết hợp đồng vay
   */
  async getContractById(contractId: string): Promise<LoanContract> {
    const response = await api.get<{
      statusCode: number;
      data: LoanContract;
    }>(`/api/loan/contracts/${contractId}`);
    return response.data.data;
  }

  /**
   * Lấy hợp đồng theo khoản vay
   */
  async getContractByLoanId(loanId: string): Promise<LoanContract | null> {
    try {
      const response = await api.get<{
        statusCode: number;
        data: LoanContract;
      }>(`/api/loan/contracts/by-loan/${loanId}`);
      return response.data.data;
    } catch {
      return null;
    }
  }

  /**
   * Lấy HTML hợp đồng để render PDF
   */
  async getContractHTML(contractId: string): Promise<string> {
    const response = await api.get<{
      statusCode: number;
      data: { html: string };
    }>(`/api/loan/contracts/${contractId}/html`);
    return response.data.data.html;
  }

  /**
   * Ký xác nhận hợp đồng vay
   */
  async signContract(
    contractId: string,
    acceptedDelinquencyPolicy?: boolean,
    signatureData?: string,
  ): Promise<LoanContract> {
    const response = await api.post<{
      statusCode: number;
      data: LoanContract;
    }>(`/api/loan/contracts/${contractId}/sign`, {
      signatureData,
      acceptedDelinquencyPolicy,
    });
    return response.data.data;
  }

  // =============================================
  // DIGITAL SIGNATURE — VNPT SmartCA
  // =============================================

  /**
   * Khởi tạo phiên ký số SmartCA cho hợp đồng
   * Trả về thông tin để client mở SDK SmartCA embedded
   */
  async initiateSmartCaSigning(
    contractId: string,
  ): Promise<SmartCaSigningSession> {
    const response = await api.post<{
      success: boolean;
      data: SmartCaSigningSession;
    }>("/api/digital-signature/initiate", { contractId });
    return response.data.data;
  }

  /**
   * Xác nhận kết quả ký từ SDK SmartCA
   */
  async confirmSmartCaSigning(
    signatureId: string,
    result: SmartCaSignResult,
  ): Promise<SmartCaConfirmResult> {
    const response = await api.post<{
      success: boolean;
      data: SmartCaConfirmResult;
    }>("/api/digital-signature/confirm", { signatureId, result });
    return response.data.data;
  }

  /**
   * Polling trạng thái ký
   */
  async checkSigningStatus(signatureId: string): Promise<SmartCaStatusResult> {
    const response = await api.get<{
      success: boolean;
      data: SmartCaStatusResult;
    }>(`/api/digital-signature/${signatureId}/status`);
    return response.data.data;
  }

  /**
   * Retry ký khi bị fail hoặc expired
   */
  async retrySmartCaSigning(
    signatureId: string,
  ): Promise<SmartCaSigningSession> {
    const response = await api.post<{
      success: boolean;
      data: SmartCaSigningSession;
    }>(`/api/digital-signature/retry/${signatureId}`);
    return response.data.data;
  }

  /**
   * Lấy chữ ký số đã hoàn thành của hợp đồng
   */
  async getContractSignature(
    contractCode: string,
  ): Promise<DigitalSignatureInfo | null> {
    try {
      const response = await api.get<{
        success: boolean;
        data: DigitalSignatureInfo | null;
      }>(`/api/digital-signature/contract/${contractCode}`);
      return response.data.data;
    } catch {
      return null;
    }
  }

  /**
   * Verify tính toàn vẹn chữ ký
   */
  async verifySignatureIntegrity(
    signatureId: string,
  ): Promise<SignatureVerifyResult> {
    const response = await api.get<{
      success: boolean;
      data: SignatureVerifyResult;
    }>(`/api/digital-signature/${signatureId}/verify`);
    return response.data.data;
  }

  /**
   * Ký số trực tiếp v2 (password + OTP) - không cần mở app SmartCA
   * Đây là luồng chính dùng cho P2P: user nhập mật khẩu SmartCA + OTP TOTP
   */
  async signWithPasswordOTP(
    contractId: string,
    password: string,
    otp: string,
  ): Promise<SmartCaV2SignResult> {
    const response = await api.post<{
      success: boolean;
      data: SmartCaV2SignResult;
    }>("/api/digital-signature/sign-v2", { contractId, password, otp });
    return response.data.data;
  }

  /**
   * Lấy danh sách chứng thư số của user
   */
  async getCertificates(): Promise<SmartCaCertificate[]> {
    const response = await api.get<{
      success: boolean;
      data: { certificates: SmartCaCertificate[]; selectedSerial?: string };
    }>("/api/digital-signature/certificates");
    return response.data.data.certificates ?? [];
  }

  // =============================================
  // NOTIFICATION Methods
  // =============================================

  /**
   * Lấy danh sách thông báo
   */
  async getNotifications(
    page = 1,
    pageSize = 20,
  ): Promise<NotificationListResponse> {
    const response = await api.get<{
      statusCode: number;
      data: NotificationListResponse;
    }>(`/api/loan/notifications?page=${page}&pageSize=${pageSize}`);
    return response.data.data;
  }

  /**
   * Đánh dấu thông báo đã đọc
   */
  async markNotificationRead(notificationId: string): Promise<void> {
    await api.post(`/api/loan/notifications/${notificationId}/read`);
  }

  /**
   * Đánh dấu tất cả thông báo đã đọc
   */
  async markAllNotificationsRead(): Promise<void> {
    await api.post("/api/loan/notifications/read-all");
  }

  /**
   * Cập nhật Expo Push Token lên server
   */
  async updatePushToken(pushToken: string): Promise<void> {
    await api.post("/api/users/push-token", { pushToken });
  }
}

// =============================================
// REPAYMENT Interfaces
// =============================================

export interface RepaymentResult {
  success: boolean;
  transactionId: number;
  amount: number;
  date: string;
  loanStatus: string;
  breakdown?: {
    principal: number;
    interest: number;
    fees: number;
    penalty: number;
  };
}

export interface PrepayAmountResult {
  amount: number;
  principalPortion: number;
  interestPortion: number;
  penaltyPortion: number;
  feesPortion: number;
  prepaymentPenalty: number;     // phí phạt tất toán sớm (tính từ charge config)
  totalWithPenalty: number;      // tổng cộng bao gồm phí phạt
  penaltyRate: number;           // tỷ lệ phạt % (e.g. 3 = 3%) — lấy ĐỘNG từ Fineract
  penaltyChargeName: string;     // tên charge (e.g. "Phí phạt tất toán sớm")
  date: string;
  charges?: ProductCharge[];
  loanId: string;
  fineractLoanId: number;
  capital: number;
}

export interface OutstandingResult {
  totalOutstanding: number;
  principalOutstanding: number;
  interestOutstanding: number;
  feeOutstanding: number;
  penaltyOutstanding: number;
  loanId: string;
  fineractLoanId: number;
  capital: number;
  status: string;
}

export interface RepaymentSchedulePeriod {
  period: number;
  dueDate: any;
  principalDue: number;
  principalPaid: number;
  interestDue: number;
  interestPaid: number;
  feeChargesDue: number;
  feeChargesPaid: number;
  penaltyChargesDue: number;
  totalDue: number;
  totalPaid: number;
  totalOutstanding: number;
  complete: boolean;
}

export interface RepaymentScheduleResult {
  source: "fineract" | "mongo";
  totalPrincipalExpected?: number;
  totalInterestCharged?: number;
  totalRepaymentExpected?: number;
  totalOutstanding?: number;
  totalFeeChargesCharged?: number;
  totalPenaltyChargesCharged?: number;
  periods: RepaymentSchedulePeriod[];
}

export interface ProductCharge {
  id: number;
  name: string;
  amount: number;
  chargeTimeType: string;
  chargeCalculationType: string;
  percentage: number | null;
}

export const loanService = new LoanService();
