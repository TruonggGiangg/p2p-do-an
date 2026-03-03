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
export type DocumentFieldType = "file" | "text" | "select" | "button";

export interface LoanDocumentType {
  id: string;
  name: string;
  required: boolean;
  sortOrder: number;
  fieldType?: DocumentFieldType;
  options?: string[];
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
