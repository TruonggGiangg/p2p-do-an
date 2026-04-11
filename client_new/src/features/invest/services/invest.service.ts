/**
 * InvestService — Client-side API service for InvestmentOrder (lệnh đầu tư)
 * Pattern: giống loan.service.ts, dùng centralized api client (axios)
 */
import api from "../../../core/api/api.client";

// ── Types ─────────────────────────────────────────────────

export interface InvestmentOrderItem {
  _id: string;
  id: string;
  lenderId: string;
  name: string;
  capital: number;
  maxCapital: number;
  totalNodes: number;
  matchedNodes: number;
  interestRange: { min: number; max: number };
  purpose: string[];
  periodRange: { min: number; max: number };
  loans: Array<{
    loanId: string;
    nodeMatch: number;
    isInvested: boolean;
    matchedAt: string;
  }>;
  matchedCapital: number;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvestmentOrderPayload {
  name?: string;
  capital: number;
  maxCapital: number;
  interestRange: { min: number; max: number };
  purpose: string[];
  periodRange: { min: number; max: number };
}

export interface InvestmentOrderListResponse {
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  orders: InvestmentOrderItem[];
}

export interface CreateOrderResult {
  order: InvestmentOrderItem;
  matchResults: Array<{
    loanId: string;
    nodeMatch: number;
    matchPercentage: number;
    isFullMatch: boolean;
  }>;
  matchCount: number;
  progressLogs?: Array<{ message: string; step: number }>;
}

export interface AvailableLoanItem {
  _id: string;
  capital: number;
  periodMonth: number;
  monthlyRatePercent: number;
  interestType: string;
  willing?: string;
  status: string;
  disbursementDate: string;
  monthlyPay: number;
  entirelyPay: number;
  // FD Interest (What investor earns)
  fdInterestRate?: number;
  fdMonthlyRate?: number;
  // Investment tracking
  totalNotes: number;
  investedNotes: number;
  nodeMatch: number;
  isFullMatch: boolean;
  aiScore?: {
    creditScore: number;
    grade: string;
    subGrade: string;
    tier: string;
    riskLevel: string;
  };
  borrowerDelinquencyWarning?: {
    debtGroup: number;
    overdueAmount: number;
    delinquentDays: number;
    message: string;
  };
  borrowerContractId?: string;
  borrowerContractStatus?: string;
  borrowerSignedVerified?: boolean;
  borrowerSignedAt?: string;
  createdAt: string;
}

export interface AvailableLoansResponse {
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  loans: AvailableLoanItem[];
}

// ── Investment Contract Types ────────────────────────────

export interface LenderScheduleItem {
  period: number;
  dueDate: string;
  principal: number;
  interest: number;
  total: number;
  status: "pending" | "paid" | "partial" | "overdue";
  paidDate?: string;
  paidAmount?: number;
}

export interface InvestmentContractItem {
  _id: string;
  contractId: string;
  lenderId: string;
  loanApplicationId: any; // populated
  investmentOrderId?: string;
  capital: number;
  numNotes: number;
  periodMonth: number;
  monthlyRatePercent: number;
  annualRatePercent: number;
  monthlyIncome: number;
  entirelyProfit: number;
  entirelyPay: number;
  serviceFee: number;
  status: "pending" | "pending_signature" | "active" | "matured" | "closed";
  fineractFDAccountId?: number;
  fdInterestRate?: number;
  fdMaturityDate?: string;
  fdStatus?: string;
  lenderSchedule: LenderScheduleItem[];
  scheduleTotalPrincipal: number;
  scheduleTotalInterest: number;
  scheduleTotalIncome: number;
  schedulePeriodCount: number;
  totalReceived: number;
  totalPrincipalReceived: number;
  totalInterestReceived: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentContractListResponse {
  contracts: InvestmentContractItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Service ───────────────────────────────────────────────

class InvestService {
  /**
   * Tạo lệnh đầu tư + auto-match
   */
  async createInvestmentOrder(
    payload: CreateInvestmentOrderPayload,
  ): Promise<CreateOrderResult> {
    const response = await api.post<{
      statusCode: number;
      data: CreateOrderResult;
    }>("/api/invest/investment-order/with-progress", payload);
    return response.data.data;
  }

  /**
   * Danh sách lệnh đầu tư
   */
  async getInvestmentOrders(params?: {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    status?: "open" | "closed";
  }): Promise<InvestmentOrderListResponse> {
    const query = new URLSearchParams();
    if (params?.page) query.append("page", String(params.page));
    if (params?.pageSize) query.append("pageSize", String(params.pageSize));
    if (params?.sortBy) query.append("sortBy", params.sortBy);
    if (params?.sortOrder) query.append("sortOrder", params.sortOrder);
    if (params?.status) query.append("status", params.status);
    const qs = query.toString() ? `?${query.toString()}` : "";

    const response = await api.get<{
      statusCode: number;
      data: InvestmentOrderListResponse;
    }>(`/api/invest/investment-order${qs}`);
    return response.data.data;
  }

  /**
   * Chi tiết lệnh đầu tư
   */
  async getInvestmentOrderById(id: string): Promise<InvestmentOrderItem> {
    const response = await api.get<{
      statusCode: number;
      data: InvestmentOrderItem;
    }>(`/api/invest/investment-order/${id}`);
    return response.data.data;
  }

  /**
   * Cập nhật lệnh đầu tư
   */
  async updateInvestmentOrder(
    id: string,
    data: Partial<CreateInvestmentOrderPayload>,
  ): Promise<InvestmentOrderItem> {
    const response = await api.put<{
      statusCode: number;
      data: InvestmentOrderItem;
    }>(`/api/invest/investment-order/${id}`, data);
    return response.data.data;
  }

  /**
   * Xóa lệnh đầu tư
   */
  async deleteInvestmentOrder(id: string): Promise<void> {
    await api.delete(`/api/invest/investment-order/${id}`);
  }

  /**
   * Đóng lệnh đầu tư
   */
  async closeInvestmentOrder(id: string): Promise<InvestmentOrderItem> {
    const response = await api.post<{
      statusCode: number;
      data: InvestmentOrderItem;
    }>(`/api/invest/investment-order/${id}/close`);
    return response.data.data;
  }

  /**
   * Danh sách khoản vay đang cho phép đầu tư
   */
  async getAvailableLoans(params?: {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    minRate?: number;
    maxRate?: number;
    minPeriod?: number;
    maxPeriod?: number;
    minCapital?: number;
    maxCapital?: number;
    search?: string;
    riskLevel?: string;
  }): Promise<AvailableLoansResponse> {
    const query = new URLSearchParams();
    if (params?.page) query.append("page", String(params.page));
    if (params?.pageSize) query.append("pageSize", String(params.pageSize));
    if (params?.sortBy) query.append("sortBy", params.sortBy);
    if (params?.sortOrder) query.append("sortOrder", params.sortOrder);
    if (params?.minRate !== undefined)
      query.append("minRate", String(params.minRate));
    if (params?.maxRate !== undefined)
      query.append("maxRate", String(params.maxRate));
    if (params?.minPeriod !== undefined)
      query.append("minPeriod", String(params.minPeriod));
    if (params?.maxPeriod !== undefined)
      query.append("maxPeriod", String(params.maxPeriod));
    if (params?.minCapital !== undefined)
      query.append("minCapital", String(params.minCapital));
    if (params?.maxCapital !== undefined)
      query.append("maxCapital", String(params.maxCapital));
    if (params?.search) query.append("search", params.search);
    if (params?.riskLevel) query.append("riskLevel", params.riskLevel);
    const qs = query.toString() ? `?${query.toString()}` : "";

    const response = await api.get<{
      statusCode: number;
      data: AvailableLoansResponse;
    }>(`/api/invest/available-loans${qs}`);
    return response.data.data;
  }

  // ═══════════════════════════════════════════════════════
  //  INVESTMENT CONTRACTS (hợp đồng ký quỹ)
  // ═══════════════════════════════════════════════════════

  /**
   * Tạo hợp đồng ký quỹ đầu tư
   */
  async createContract(payload: {
    loanApplicationId: string;
    numNotes: number;
    investmentOrderId?: string;
    otpSessionId?: string;
  }): Promise<InvestmentContractItem> {
    const response = await api.post<{
      statusCode: number;
      data: InvestmentContractItem;
    }>("/api/invest/contract", payload);
    return response.data.data;
  }

  /**
   * Danh sách hợp đồng ký quỹ
   */
  async getContracts(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
  }): Promise<InvestmentContractListResponse> {
    const query = new URLSearchParams();
    if (params?.page) query.append("page", String(params.page));
    if (params?.pageSize) query.append("pageSize", String(params.pageSize));
    if (params?.status) query.append("status", params.status);
    const qs = query.toString() ? `?${query.toString()}` : "";

    const response = await api.get<{
      statusCode: number;
      data: InvestmentContractListResponse;
    }>(`/api/invest/contracts${qs}`);
    return response.data.data;
  }

  /**
   * Chi tiết hợp đồng ký quỹ
   */
  async getContractById(id: string): Promise<InvestmentContractItem> {
    const response = await api.get<{
      statusCode: number;
      data: InvestmentContractItem;
    }>(`/api/invest/contract/${id}`);
    return response.data.data;
  }

  /**
   * Lấy hợp đồng ký quỹ theo khoản vay (dành cho khoản vay đã ghép)
   */
  async getContractByLoanId(
    loanId: string,
  ): Promise<InvestmentContractItem | null> {
    try {
      const response = await api.get<{
        statusCode: number;
        data: InvestmentContractItem;
      }>(`/api/invest/contract/loan/${loanId}`);
      return response.data.data;
    } catch {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  STATS, BALANCE, SCHEDULE PREVIEW
  // ═══════════════════════════════════════════════════════

  /**
   * Thống kê đầu tư của lender
   */
  async getStats(): Promise<any> {
    const response = await api.get<{
      statusCode: number;
      data: any;
    }>("/api/invest/stats");
    return response.data.data;
  }

  /**
   * Số dư ví đầu tư
   */
  async getMyBalance(): Promise<{
    walletBalance: number;
    totalInvested: number;
    availableBalance: number;
  }> {
    const response = await api.get<{
      statusCode: number;
      data: {
        walletBalance: number;
        totalInvested: number;
        availableBalance: number;
      };
    }>("/api/invest/my-balance");
    return response.data.data;
  }

  /**
   * Preview lịch nhận tiền trước khi đầu tư
   */
  async getSchedulePreview(
    loanApplicationId: string,
    numNotes: number,
    investmentOrderId?: string,
  ): Promise<any> {
    const response = await api.post<{
      statusCode: number;
      data: any;
    }>("/api/invest/schedule-preview", {
      loanApplicationId,
      numNotes,
      investmentOrderId,
    });
    return response.data.data;
  }

  // ═══════════════════════════════════════════════════════
  //  CONTRACT HTML & DIGITAL SIGNATURE
  // ═══════════════════════════════════════════════════════

  async getContractHTML(contractId: string): Promise<string> {
    const response = await api.get<{
      statusCode: number;
      data: { html: string };
    }>(`/api/invest/contract/${contractId}/html`);
    return response.data.data.html;
  }

  async initiateSmartCaSigning(contractId: string): Promise<any> {
    const response = await api.post<{
      success: boolean;
      data: any;
    }>("/api/digital-signature/initiate", { contractId });
    return response.data.data;
  }

  async signWithPasswordOTP(
    contractId: string,
    password: string,
    otp: string,
  ): Promise<any> {
    const response = await api.post<{
      success: boolean;
      data: any;
    }>("/api/digital-signature/sign-v2", { contractId, password, otp });
    return response.data.data;
  }

  async confirmSmartCaSigning(signatureId: string, result: any): Promise<any> {
    const response = await api.post<{
      success: boolean;
      data: any;
    }>("/api/digital-signature/confirm", { signatureId, result });
    return response.data.data;
  }

  async checkSigningStatus(signatureId: string): Promise<any> {
    const response = await api.get<{
      success: boolean;
      data: any;
    }>(`/api/digital-signature/${signatureId}/status`);
    return response.data.data;
  }

  async retrySmartCaSigning(signatureId: string): Promise<any> {
    const response = await api.post<{
      success: boolean;
      data: any;
    }>(`/api/digital-signature/retry/${signatureId}`);
    return response.data.data;
  }

  async getCertificates(): Promise<any[]> {
    const response = await api.get<{
      success: boolean;
      data: { certificates: any[]; selectedSerial?: string };
    }>("/api/digital-signature/certificates");
    return response.data.data.certificates ?? [];
  }
}

export const investService = new InvestService();
export default investService;
