/**
 * Loan Types - TypeScript definitions for Loan module
 */

// ========== LOAN REQUEST TYPES ==========

/**
 * Request to check/preview loan rate
 */
export interface CheckRateRequest {
    capital: number;
    periodMonth: number;
    disbursementDate?: string;
}

/**
 * Request to create a new loan
 */
export interface CreateLoanRequest {
    capital: number;
    periodMonth: number;
    willing: string;
    disbursementDate: string;
    digitalFootprint?: {
        battery_level?: number;
        submission_hour?: number;
        connection_type?: 'wifi' | '4g' | 'unknown';
        location_match?: 'true' | 'false';
        device_score?: number;
    };
}

/**
 * Schedule period for preview (WYSIWYG)
 */
export interface SchedulePeriod {
    period: number;
    principal: number;
    interest: number;
    total: number;
}

/**
 * Response from rate check API
 */
export interface RateCheckResponse {
    rate: number;               // Monthly rate (%)
    annualRate: number;         // Annual rate (%)
    monthlyPrincipalPay: number;
    monthlyInterestPay: number;
    monthlyPay: number;
    entirelyPay: number;
    capital: number;
    periodMonth: number;
    disbursementDate?: string;
    maturityDate?: string;
    interestType: string;
    rateSource: string;
    schedulePreview?: SchedulePeriod[];  // NEW: For UI schedule table
}

/**
 * Loan info from API
 */
export interface LoanInfo {
    capital: number;
    rate: number;
    annualRate?: number;
    periodMonth: number;
    willing: string;
    disbursementDate?: string;
    maturityDate?: string;
    monthlyPrincipalPay?: number;
    monthlyInterestPay?: number;
    monthlyPay?: number;
    entirelyPay?: number;
    interestType?: string;
    createdDate?: string;
}

/**
 * Loan contract data
 */
export interface LoanContract {
    _id?: string;
    contractId: string;
    borrower: string | BorrowerInfo;
    info: LoanInfo;
    totalNotes?: number;
    investedNotes?: number;
    status: LoanStatus;
    fineractLoanId?: number;
    fineractStatus?: string;
    blockchainSynced?: boolean;
    blockchainTxId?: string;
    createdAt?: string;
    updatedAt?: string;
    // Dynamic Interest Rates (from server)
    borrowerInterestRate?: number;    // Lãi người vay phải trả (%/năm)
    lenderInterestRate?: number;      // Lãi lender nhận (%/năm) 
    adminSpread?: number;             // Chênh lệch (admin giữ lại)
    adminSpreadPercentage?: number;   // Tỷ lệ spread (%)
    loanSizeTier?: 'small' | 'medium' | 'large';  // Tier khoản vay
    adminSpreadEarned?: number;       // Tổng spread đã kiếm được
}

/**
 * Borrower info (populated)
 */
export interface BorrowerInfo {
    _id: string;
    username: string;
    email?: string;
    name?: string;
}

/**
 * Loan status enum - aligned with Fineract status mapping
 */
export type LoanStatus = 'waiting' | 'pending' | 'approved' | 'active' | 'on_going' | 'done' | 'closed' | 'fail' | 'rejected' | 'withdrawn' | 'written-off' | 'rescheduled' | 'overpaid' | 'success' | 'clean' | 'disbursed' | 'overdue';

/**
 * Response from create loan API
 */
export interface CreateLoanResponse {
    contractId: string;
    info: LoanInfo;
    status: LoanStatus;
    totalNotes: number;
    fineractLoanId?: number;
    blockchainSynced: boolean;
}

/**
 * Loan statistics
 */
export interface LoanStatistics {
    totalPaid: number;
    totalRemaining: number;
    progressPercentage: number;
}

// Note: ApiResponse is defined in api.types.ts


// ========== LOAN WILLING OPTIONS ==========

export const LOAN_WILLINGS = [
    'Tiêu dùng cá nhân',
    'Mua sắm',
    'Sửa chữa nhà cửa',
    'Y tế',
    'Giáo dục',
    'Kinh doanh nhỏ',
    'Du lịch',
    'Cưới hỏi',
    'Khác',
] as const;

export type LoanWilling = typeof LOAN_WILLINGS[number];

// ========== LOAN PERIOD OPTIONS ==========

export const LOAN_PERIODS = [
    { value: 3, label: '3 tháng' },
    { value: 6, label: '6 tháng' },
    { value: 9, label: '9 tháng' },
    { value: 12, label: '12 tháng' },
    { value: 18, label: '18 tháng' },
    { value: 24, label: '24 tháng' },
] as const;

// ========== FINERACT DETAIL TYPES ==========

/**
 * Loan purpose from Fineract CodeValues
 */
export interface LoanPurpose {
    id: number;
    name: string;
    position: number;
}

/**
 * Repayment schedule period
 */
export interface RepaymentSchedulePeriod {
    period: number;
    dueDate: number[]; // [year, month, day]
    principalDue: number;
    interestDue: number;
    totalDue: number;
    complete: boolean;
}

/**
 * Repayment schedule summary
 */
export interface RepaymentSchedule {
    totalPrincipalExpected: number;
    totalInterestCharged: number;
    totalRepaymentExpected: number;
    totalOutstanding: number;
    periods: RepaymentSchedulePeriod[];
}

/**
 * Loan transaction record
 */
export interface LoanTransaction {
    id: number;
    date: number[]; // [year, month, day]
    type: {
        id: number;
        code: string;
        value: string;
    };
    amount: number;
    principalPortion: number;
    interestPortion: number;
    feeChargesPortion: number;
    penaltyChargesPortion: number;
    outstandingLoanBalance: number;
}

/**
 * Outstanding balance breakdown
 */
export interface OutstandingBalance {
    totalOutstanding: number;
    principalOutstanding: number;
    interestOutstanding: number;
    feeChargesOutstanding: number;
    penaltyChargesOutstanding: number;
    totalPaid: number;
    totalRepaymentExpected: number;
}

/**
 * Prepay amount calculation
 */
export interface PrepayAmount {
    amount: number;
    principalPortion: number;
    interestPortion: number;
    penaltyPortion: number;
    feesPortion: number;
    transactionDate: string;
}

/**
 * Fineract loan details (extracted info)
 */
export interface FineractLoanDetails {
    fineractLoanId: number | string;
    contractId?: string; // MongoDB contract ID
    fineractStatus: string;
    principal: number;
    numberOfRepayments: number;
    interestRate: {
        perPeriod: number;
        annual: number;
    };
    status: {
        code: string;
        value: string;
        pendingApproval: boolean;
        waitingForDisbursal: boolean;
        active: boolean;
        closedObligationsMet: boolean;
    };
    repaymentSchedule: RepaymentSchedule;
    timeline: {
        submittedOnDate?: number[];
        expectedDisbursementDate?: number[];
        expectedMaturityDate?: number[];
        actualDisbursementDate?: number[];
    };
    transactions: LoanTransaction[];

    // Extended fields from Fineract API
    loanPurposeName?: string;
    loanPurposeId?: number;
    repaymentEvery?: number;
    interestType?: {
        id: number;
        code: string;
        value: string;
    };
    amortizationType?: {
        id: number;
        code: string;
        value: string;
    };
    interestCalculationPeriodType?: {
        id: number;
        code: string;
        value: string;
    };
    daysInYearType?: {
        id: number;
        code: string;
        value: string;
    };
    daysInMonthType?: {
        id: number;
        code: string;
        value: string;
    };
    transactionProcessingStrategyCode?: string;
    transactionProcessingStrategyName?: string;
}

// ========== REPAYMENT REQUEST TYPES ==========

/**
 * Make repayment request
 */
export interface MakeRepaymentRequest {
    fineractLoanId: number;
    transactionAmount: number;
    transactionDate?: string;
    note?: string;
}

/**
 * Prepay loan request
 */
export interface PrepayLoanRequest {
    fineractLoanId: number;
    transactionAmount?: number;
    transactionDate?: string;
    note?: string;
}

/**
 * Repayment/Prepay response
 */
export interface RepaymentResponse {
    success: boolean;
    resourceId: number;
    transactionId: number;
}

