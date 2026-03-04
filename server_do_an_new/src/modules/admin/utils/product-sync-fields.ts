/**
 * Field definitions for product sync comparison.
 * Maps Fineract API fields to Vietnamese labels for drift reporting.
 */

function fmt(v: any): string {
  if (v == null || v === '') return '-';
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Loan product fields to compare (field path -> label) */
export const LOAN_PRODUCT_FIELDS: Record<string, string> = {
  id: 'ID',
  name: 'Tên sản phẩm',
  shortName: 'Mã sản phẩm',
  description: 'Mô tả',
  status: 'Trạng thái',
  principal: 'Gốc mặc định',
  minPrincipal: 'Gốc tối thiểu',
  maxPrincipal: 'Gốc tối đa',
  numberOfRepayments: 'Số kỳ trả nợ',
  minNumberOfRepayments: 'Số kỳ tối thiểu',
  maxNumberOfRepayments: 'Số kỳ tối đa',
  repaymentEvery: 'Tần suất hoàn trả (mỗi)',
  interestRatePerPeriod: 'Lãi suất/kỳ (%)',
  minInterestRatePerPeriod: 'Lãi suất tối thiểu (%)',
  maxInterestRatePerPeriod: 'Lãi suất tối đa (%)',
  annualInterestRate: 'Lãi suất năm (%)',
  currencyCode: 'Mã tiền tệ',
  interestType: 'Loại lãi suất',
  amortizationType: 'Hình thức trả nợ',
  interestRateFrequencyType: 'Chu kỳ lãi suất',
  interestCalculationPeriodType: 'Chu kỳ tính lãi',
  repaymentFrequencyType: 'Tần suất hoàn trả',
  transactionProcessingStrategyName: 'Chiến lược xử lý',
  daysInMonthType: 'Ngày trong tháng',
  daysInYearType: 'Ngày trong năm',
  multiDisburseLoan: 'Đa đợt giải ngân',
  outstandingLoanBalance: 'Hạn mức dư nợ tối đa',
  loanScheduleType: 'Kế hoạch lịch trả',
  loanScheduleProcessingType: 'Kiểu xử lý lịch',
};

/** Savings product fields to compare */
export const SAVINGS_PRODUCT_FIELDS: Record<string, string> = {
  id: 'ID',
  name: 'Tên sản phẩm',
  shortName: 'Mã sản phẩm',
  description: 'Mô tả',
  status: 'Trạng thái',
  nominalAnnualInterestRate: 'Lãi suất danh nghĩa năm (%)',
  digitsAfterDecimal: 'Số chữ số thập phân',
  currencyCode: 'Mã tiền tệ',
  allowOverdraft: 'Cho phép thấu chi',
  nominalAnnualInterestRateOverdraft: 'Lãi suất thấu chi (%)',
  enforceMinRequiredBalance: 'Số dư tối thiểu bắt buộc',
  withdrawalFeeForTransfers: 'Phí rút khi chuyển khoản',
  interestCompoundingPeriodType: 'Chu kỳ ghép lãi',
  interestPostingPeriodType: 'Chu kỳ tính lãi',
  interestCalculationType: 'Loại tính lãi',
  accountingRule: 'Quy tắc kế toán',
};

export interface FlattenedProduct {
  id: number;
  name: string;
  shortName: string;
  [key: string]: any;
}

/** Flatten loan product from Fineract for comparison */
export function flattenLoanProduct(p: any): FlattenedProduct {
  const flat: FlattenedProduct = {
    id: p.id,
    name: p.name ?? '',
    shortName: p.shortName ?? '',
    description: p.description ?? '',
    status: typeof p.status === 'object' ? p.status?.value ?? p.status?.code : p.status,
    principal: p.principal,
    minPrincipal: p.minPrincipal,
    maxPrincipal: p.maxPrincipal,
    numberOfRepayments: p.numberOfRepayments,
    minNumberOfRepayments: p.minNumberOfRepayments,
    maxNumberOfRepayments: p.maxNumberOfRepayments,
    repaymentEvery: p.repaymentEvery,
    interestRatePerPeriod: p.interestRatePerPeriod,
    minInterestRatePerPeriod: p.minInterestRatePerPeriod,
    maxInterestRatePerPeriod: p.maxInterestRatePerPeriod,
    annualInterestRate: p.annualInterestRate,
    currencyCode: p.currency?.code ?? p.currencyCode,
    interestType: typeof p.interestType === 'object' ? p.interestType?.value : p.interestType,
    amortizationType: typeof p.amortizationType === 'object' ? p.amortizationType?.value : p.amortizationType,
    interestRateFrequencyType: typeof p.interestRateFrequencyType === 'object' ? p.interestRateFrequencyType?.value : p.interestRateFrequencyType,
    interestCalculationPeriodType: typeof p.interestCalculationPeriodType === 'object' ? p.interestCalculationPeriodType?.value : p.interestCalculationPeriodType,
    repaymentFrequencyType: typeof p.repaymentFrequencyType === 'object' ? p.repaymentFrequencyType?.value : p.repaymentFrequencyType,
    transactionProcessingStrategyName: p.transactionProcessingStrategyName ?? p.transactionProcessingStrategyCode,
    daysInMonthType: typeof p.daysInMonthType === 'object' ? p.daysInMonthType?.value : p.daysInMonthType,
    daysInYearType: typeof p.daysInYearType === 'object' ? p.daysInYearType?.value : p.daysInYearType,
    multiDisburseLoan: p.multiDisburseLoan ?? false,
    outstandingLoanBalance: p.outstandingLoanBalance,
    loanScheduleType: typeof p.loanScheduleType === 'object' ? p.loanScheduleType?.value : p.loanScheduleType,
    loanScheduleProcessingType: typeof p.loanScheduleProcessingType === 'object' ? p.loanScheduleProcessingType?.value : p.loanScheduleProcessingType,
  };
  return flat;
}

/** Flatten savings product from Fineract for comparison */
export function flattenSavingsProduct(p: any): FlattenedProduct {
  const flat: FlattenedProduct = {
    id: p.id,
    name: p.name ?? '',
    shortName: p.shortName ?? '',
    description: p.description ?? '',
    status: typeof p.status === 'object' ? p.status?.value ?? p.status?.code : p.status,
    nominalAnnualInterestRate: p.nominalAnnualInterestRate,
    digitsAfterDecimal: p.digitsAfterDecimal,
    currencyCode: p.currency?.code ?? p.currencyCode,
    allowOverdraft: p.allowOverdraft ?? false,
    nominalAnnualInterestRateOverdraft: p.nominalAnnualInterestRateOverdraft,
    enforceMinRequiredBalance: p.enforceMinRequiredBalance ?? false,
    withdrawalFeeForTransfers: p.withdrawalFeeForTransfers ?? false,
    interestCompoundingPeriodType: typeof p.interestCompoundingPeriodType === 'object' ? p.interestCompoundingPeriodType?.value : p.interestCompoundingPeriodType,
    interestPostingPeriodType: typeof p.interestPostingPeriodType === 'object' ? p.interestPostingPeriodType?.value : p.interestPostingPeriodType,
    interestCalculationType: typeof p.interestCalculationType === 'object' ? p.interestCalculationType?.value : p.interestCalculationType,
    accountingRule: typeof p.accountingRule === 'object' ? p.accountingRule?.value : p.accountingRule,
  };
  return flat;
}

export interface FieldChange {
  field: string;
  label: string;
  before: any;
  after: any;
}

/** Compare two flattened products and return field-level changes */
export function diffProducts(
  prev: FlattenedProduct,
  curr: FlattenedProduct,
  fieldLabels: Record<string, string>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const allKeys = new Set([...Object.keys(prev ?? {}), ...Object.keys(curr ?? {})]);
  for (const key of allKeys) {
    if (key === 'id') continue;
    const vPrev = prev?.[key];
    const vCurr = curr?.[key];
    const prevStr = fmt(vPrev);
    const currStr = fmt(vCurr);
    if (prevStr !== currStr) {
      changes.push({
        field: key,
        label: fieldLabels[key] ?? key,
        before: vPrev,
        after: vCurr,
      });
    }
  }
  return changes;
}
