import { Table } from 'antd';
import { translateValue } from './vi';

const LABEL_MAP: Record<string, string> = {
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
  repaymentEvery: 'Tần suất hoàn trả',
  interestRatePerPeriod: 'Lãi suất/kỳ (%)',
  minInterestRatePerPeriod: 'Lãi suất tối thiểu (%)',
  maxInterestRatePerPeriod: 'Lãi suất tối đa (%)',
  annualInterestRate: 'Lãi suất năm (%)',
  nominalAnnualInterestRate: 'Lãi suất danh nghĩa năm (%)',
  nominalAnnualInterestRateOverdraft: 'Lãi suất thấu chi (%)',
  digitsAfterDecimal: 'Số chữ số thập phân',
  allowOverdraft: 'Cho phép thấu chi',
  enforceMinRequiredBalance: 'Số dư tối thiểu bắt buộc',
  withdrawalFeeForTransfers: 'Phí rút khi chuyển khoản',
  multiDisburseLoan: 'Đa đợt giải ngân',
  outstandingLoanBalance: 'Hạn mức dư nợ tối đa',
  transactionProcessingStrategyName: 'Chiến lược xử lý',
  interestType: 'Loại lãi suất',
  amortizationType: 'Hình thức trả nợ',
  interestRateFrequencyType: 'Chu kỳ lãi suất',
  interestCalculationPeriodType: 'Chu kỳ tính lãi',
  repaymentFrequencyType: 'Tần suất hoàn trả',
  daysInMonthType: 'Ngày trong tháng',
  daysInYearType: 'Ngày trong năm',
  loanScheduleType: 'Kế hoạch lịch trả',
  loanScheduleProcessingType: 'Kiểu xử lý lịch',
  interestCompoundingPeriodType: 'Chu kỳ ghép lãi',
  interestPostingPeriodType: 'Chu kỳ tính lãi',
  interestCalculationType: 'Loại tính lãi',
  currencyCode: 'Mã tiền tệ',
  // Bổ sung các trường khác
  accountMovesOutOfNPAOnlyOnArrearsCompletion: 'Chuyển khỏi NPA khi hoàn trả nợ quá hạn',
  allowApprovedDisbursedAmountsOverApplied: 'Cho phép giải ngân vượt số đã duyệt',
  allowAttributeOverrides: 'Cho phép ghi đè thuộc tính',
  disallowInterestCalculationOnPastDue: 'Không tính lãi trên dư nợ quá hạn',
  allowVariableInstallments: 'Cho phép kỳ trả biến đổi',
  canDefineInstallmentAmount: 'Có thể định nghĩa số tiền trả mỗi kỳ',
  enableAccrualActivityPosting: 'Bật ghi nhận kế toán dồn tích',
  enableBuyDownFee: 'Bật phí mua giảm',
  enableDownPayment: 'Bật trả trước',
  enableAutoRepaymentForDownPayment: 'Bật tự động trả cho khoản trả trước',
  enableInstallmentLevelDelinquency: 'Bật ghi nhận quá hạn theo kỳ',
  enableIncomeCapitalization: 'Bật vốn hóa thu nhập',
  holdGuaranteeFunds: 'Giữ quỹ bảo lãnh',
  isArrearsBasedOnOriginalSchedule: 'Quá hạn dựa trên lịch gốc',
  isCompoundingToBePostedAsTransaction: 'Ghép lãi ghi thành giao dịch',
  isEqualAmortization: 'Trả gốc đều',
  isFloatingInterestRateCalculationAllowed: 'Cho phép tính lãi suất thả nổi',
  isInterestRecalculationEnabled: 'Bật tái tính lãi',
  isLinkedToFloatingInterestRates: 'Liên kết lãi suất thả nổi',
  isRatesEnabled: 'Bật lãi suất',
  canUseForTopup: 'Có thể dùng cho vay thêm',
  disallowExpectedDisbursements: 'Không cho phép giải ngân dự kiến',
  syncExpectedWithDisbursementDate: 'Đồng bộ dự kiến với ngày giải ngân',
  allowAttributeConfiguration: 'Cho phép cấu hình thuộc tính',
  fundId: 'Mã quỹ',
  fundName: 'Tên quỹ',
  startDate: 'Ngày bắt đầu',
  closeDate: 'Ngày đóng',
  accountingRule: 'Quy tắc kế toán',
  // Các trường còn thiếu (từ Fineract)
  allowPartialPeriodInterestCalculation: 'Cho phép tính lãi theo kỳ lẻ',
  currency: 'Tiền tệ',
  graceOnArrearsAgeing: 'Gia hạn chuẩn quá hạn',
  interestCalculationDaysInYearType: 'Loại ngày tính lãi trong năm',
  isDormancyTrackingActive: 'Theo dõi trạng thái không hoạt động được bật',
  lienAllowed: 'Cho phép cầm cố',
  graceOnPrincipalPayment: 'Gia hạn trả gốc',
  graceOnInterestPayment: 'Gia hạn trả lãi',
  graceOnInterestCharged: 'Gia hạn tính lãi',
  inArrearsTolerance: 'Dung sai quá hạn',
  minimumDaysBetweenDisbursalAndFirstRepayment: 'Số ngày tối thiểu giữa giải ngân và kỳ trả đầu',
  overdueDaysForNPA: 'Số ngày quá hạn để chuyển NPA',
  repaymentStartDateType: 'Loại ngày bắt đầu trả nợ',
  installmentAmountInMultiplesOf: 'Bội số số tiền trả mỗi kỳ',
  maxTrancheCount: 'Số đợt giải ngân tối đa',
  overAppliedNumber: 'Số vượt áp dụng',
  principalThresholdForLastInstallment: 'Ngưỡng gốc cho kỳ trả cuối',
  dueDaysForRepaymentEvent: 'Số ngày đến hạn cho sự kiện trả nợ',
  overDueDaysForRepaymentEvent: 'Số ngày quá hạn cho sự kiện trả nợ',
  includeInBorrowerCycle: 'Bao gồm trong chu kỳ vay',
  useBorrowerCycle: 'Sử dụng chu kỳ vay',
  minNominalAnnualInterestRate: 'Lãi suất danh nghĩa năm tối thiểu (%)',
  maxNominalAnnualInterestRate: 'Lãi suất danh nghĩa năm tối đa (%)',
  minBalanceForInterestCalculation: 'Số dư tối thiểu để tính lãi',
  minOverdraftForInterestCalculation: 'Thấu chi tối thiểu để tính lãi',
  withHoldTax: 'Khấu trừ thuế',
  taxGroup: 'Nhóm thuế',
  overdraftLimit: 'Hạn mức thấu chi',
  inMultiplesOf: 'Bội số tiền',
};

const SKIP_KEYS = new Set([
  'charges', 'paymentAllocation', 'creditAllocation', 'accountingMappings',
  'currencyOptions', 'interestRecalculationData', 'delinquencyBucket',
  'delinquencyBucketOptions', 'advancedPaymentAllocationTypes',
  'advancedPaymentAllocationTransactionTypes', 'advancedPaymentAllocationFutureInstallmentAllocationRules',
  'creditAllocationTransactionTypes', 'creditAllocationAllocationTypes',
  'principalVariationsForBorrowerCycle', 'interestRateVariationsForBorrowerCycle',
  'numberOfRepaymentVariationsForBorrowerCycle', 'rates', 'scorecardFeatures',
  // Các trường nội bộ/options không cần hiển thị
  'accountMovesOutOfNPAOnlyOnArrearsCompletion', 'allowApprovedDisbursedAmountsOverApplied',
  'allowAttributeOverrides', 'disallowInterestCalculationOnPastDue', 'allowVariableInstallments',
  'buyDownFeeCalculationTypeOptions', 'buyDownFeeIncomeTypeOptions', 'buyDownFeeStrategyOptions',
  'canDefineInstallmentAmount', 'advancedPaymentAllocationTransactionTypes',
  'advancedPaymentAllocationFutureInstallmentAllocationRules', 'advancedPaymentAllocationTypes',
  'buydownfeeClassificationToIncomeAccountMappings', 'buydownFeeClassificationToIncomeAccountMappings',
  'capitalizedIncomeClassificationToIncomeAccountMappings', 'chargeOffBehaviour',
  'supportedInterestRefundTypes', 'writeOffReasonsToExpenseMappings',
  'enableAccrualActivityPosting', 'enableBuyDownFee', 'enableDownPayment',
  'enableAutoRepaymentForDownPayment', 'enableInstallmentLevelDelinquency',
  'enableIncomeCapitalization', 'holdGuaranteeFunds', 'isArrearsBasedOnOriginalSchedule',
  'isCompoundingToBePostedAsTransaction', 'isEqualAmortization', 'isFloatingInterestRateCalculationAllowed',
  'isInterestRecalculationEnabled', 'isLinkedToFloatingInterestRates', 'isNew',
  'isRatesEnabled', 'canUseForTopup', 'disallowExpectedDisbursements',
  'syncExpectedWithDisbursementDate', 'allowAttributeConfiguration',
]);

/** Dịch nhãn tiếng Anh còn sót (từ camelCase) */
const LABEL_FALLBACK: Record<string, string> = {
  'Allow Partial Period Interest Calculation': 'Cho phép tính lãi theo kỳ lẻ',
  'Currency': 'Tiền tệ',
  'Grace On Arrears Ageing': 'Gia hạn chuẩn quá hạn',
  'Interest Calculation Days In Year Type': 'Loại ngày tính lãi trong năm',
  'Is Dormancy Tracking Active': 'Theo dõi trạng thái không hoạt động được bật',
  'Lien Allowed': 'Cho phép cầm cố',
};

/** Flatten product for display table */
function flattenForDisplay(obj: any): Array<{ key: string; label: string; value: any }> {
  const rows: Array<{ key: string; label: string; value: any }> = [];
  if (!obj || typeof obj !== 'object') return rows;

  /** Chuyển camelCase thành chuỗi đọc được, ưu tiên LABEL_MAP rồi LABEL_FALLBACK */
  const toLabel = (key: string) => {
    const mapped = LABEL_MAP[key];
    if (mapped) return mapped;
    const fromCamel = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
    return LABEL_FALLBACK[fromCamel] ?? fromCamel;
  };

  for (const [k, v] of Object.entries(obj)) {
    if (SKIP_KEYS.has(k)) continue;
    if (k.endsWith('Options') || k.endsWith('Mappings') || k.includes('Mapping')) continue;
    const label = toLabel(k);
    let displayValue: any;
    if (v == null) {
      displayValue = '-';
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const extracted = o.value ?? o.displayLabel ?? o.code ?? o.name;
      displayValue = extracted != null ? String(extracted) : '-';
    } else {
      displayValue = v;
    }
    rows.push({ key: k, label, value: displayValue });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

function fmtVal(v: any): string {
  if (v == null || v === '') return '-';
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  if (typeof v === 'number') return v.toLocaleString('vi-VN');
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  const translated = translateValue(s);
  return translated.length > 200 ? translated.slice(0, 200) + '…' : translated;
}

interface ProductDetailTableProps {
  product: any;
  token?: any;
}

/** Bảng báo cáo chi tiết - hiển thị tất cả trường của sản phẩm */
export function ProductDetailTable({ product }: ProductDetailTableProps) {
  if (!product) return null;
  const rows = flattenForDisplay(product);
  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <Table
        size="small"
        pagination={false}
        dataSource={rows}
        columns={[
          { title: 'Trường thông tin', dataIndex: 'label', key: 'label', width: 280, ellipsis: false },
          { title: 'Giá trị', dataIndex: 'value', key: 'value', render: (v) => fmtVal(v), ellipsis: true },
        ]}
        rowKey="key"
        bordered
        scroll={{ x: 500 }}
      />
    </div>
  );
}
