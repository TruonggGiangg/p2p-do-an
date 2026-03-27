export interface FineractLoanProduct {
  id: number;
  name: string;
  shortName: string;
  description?: string;
  principal?: number;
  minPrincipal?: number;
  maxPrincipal?: number;
  numberOfRepayments?: number;
  minNumberOfRepayments?: number;
  maxNumberOfRepayments?: number;
  interestRatePerPeriod?: number;
  minInterestRatePerPeriod?: number;
  maxInterestRatePerPeriod?: number;
  defaultInterestRatePerPeriod?: number;
  annualInterestRate?: number;
  currency?: {
    code: string;
    inMultiplesOf: number;
  };
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
  interestRateFrequencyType?: {
    id: number;
    code: string;
    value: string;
  };
  charges?: Array<{
    id?: number;
    chargeId?: number;
    name?: string;
    amount?: number;
    penalty?: boolean;
    dueDate?: string;
    chargeTimeType?: { id: number };
    chargeCalculationType?: { value: string };
  }>;
  [key: string]: unknown;
}

export interface FineractPageResponse<T> {
  totalFilteredRecords?: number;
  pageItems: T[];
}

export interface FineractLoanTransaction {
  id: number;
  type: {
    id: number;
    code: string;
    value: string;
    disbursement: boolean;
    repaymentAtDisbursement: boolean;
    repayment: boolean;
  };
  date: number[];
  amount: number;
  principalPortion?: number;
  interestPortion?: number;
  feeChargesPortion?: number;
  penaltyChargesPortion?: number;
  overpaymentPortion?: number;
  unrecognizedIncomePortion?: number;
  outstandingLoanBalance?: number;
  submittedOnDate?: number[];
  manuallyReversed: boolean;
  [key: string]: unknown;
}
