/**
 * Interest Rate Calculator
 * 
 * Tính lãi suất động dựa trên:
 * - Loan amount (tier: small/medium/large)
 * - Credit score (0-100)
 * - Loan period (months)
 */

export interface RateCalculationResult {
    borrowerRate: number;      // Lãi suất người vay (annual %)
    lenderRate: number;        // Lãi suất lender nhận (annual %)
    spread: number;            // Chênh lệch (admin profit %)
    spreadPercentage: number;  // Spread as percentage
    tier: 'small' | 'medium' | 'large';
    monthlyRate: number;       // Monthly rate for borrower
}

export interface TierConfig {
    name: 'small' | 'medium' | 'large';
    minAmount: number;
    maxAmount: number;
    baseRate: number;      // Base annual rate (%)
    spread: number;        // Admin spread (%)
}

/**
 * Loan tier configurations
 * Based on loan amount
 */
const TIER_CONFIG: TierConfig[] = [
    {
        name: 'small',
        minAmount: 0,
        maxAmount: 10_000_000,      // < 10M VND
        baseRate: 14.0,             // 14% annual
        spread: 2.0                  // 2% admin spread
    },
    {
        name: 'medium',
        minAmount: 10_000_000,
        maxAmount: 50_000_000,      // 10M - 50M VND
        baseRate: 16.0,             // 16% annual
        spread: 3.0                  // 3% admin spread
    },
    {
        name: 'large',
        minAmount: 50_000_000,
        maxAmount: Infinity,         // > 50M VND
        baseRate: 18.0,             // 18% annual
        spread: 4.0                  // 4% admin spread
    }
];

/**
 * Credit score adjustment ranges
 * Higher score = lower rate (better for borrower)
 */
const CREDIT_SCORE_ADJUSTMENTS = [
    { minScore: 80, maxScore: 100, adjustment: -2.0 },  // Excellent: -2%
    { minScore: 60, maxScore: 79, adjustment: -1.0 },   // Good: -1%
    { minScore: 40, maxScore: 59, adjustment: 0 },      // Average: no change
    { minScore: 20, maxScore: 39, adjustment: 1.0 },    // Poor: +1%
    { minScore: 0, maxScore: 19, adjustment: 2.0 }      // Very poor: +2%
];

/**
 * Get tier based on loan amount
 */
function getTier(loanAmount: number): TierConfig {
    for (const tier of TIER_CONFIG) {
        if (loanAmount >= tier.minAmount && loanAmount < tier.maxAmount) {
            return tier;
        }
    }
    return TIER_CONFIG[TIER_CONFIG.length - 1]; // Default to large
}

/**
 * Get rate adjustment based on credit score
 */
function getCreditScoreAdjustment(creditScore: number): number {
    for (const range of CREDIT_SCORE_ADJUSTMENTS) {
        if (creditScore >= range.minScore && creditScore <= range.maxScore) {
            return range.adjustment;
        }
    }
    return 0; // Default no adjustment
}

/**
 * Calculate interest rates for a loan
 * 
 * @param loanAmount - Principal amount (VND)
 * @param loanPeriod - Loan period in months
 * @param creditScore - Credit score (0-100), default 50
 * @returns RateCalculationResult
 */
export function calculateRates(
    loanAmount: number,
    loanPeriod: number,
    creditScore: number = 50
): RateCalculationResult {
    // Normalize credit score to 0-100
    const normalizedScore = Math.max(0, Math.min(100, creditScore));

    // Get tier based on loan amount
    const tier = getTier(loanAmount);

    // Get credit score adjustment
    const creditAdjustment = getCreditScoreAdjustment(normalizedScore);

    // Calculate borrower rate (base rate + credit adjustment)
    const borrowerRate = Math.max(10, tier.baseRate + creditAdjustment);

    // Calculate lender rate (borrower rate - spread)
    const lenderRate = borrowerRate - tier.spread;

    // Monthly rate for borrower
    const monthlyRate = borrowerRate / 12;

    return {
        borrowerRate,
        lenderRate,
        spread: tier.spread,
        spreadPercentage: (tier.spread / borrowerRate) * 100,
        tier: tier.name,
        monthlyRate
    };
}

/**
 * Calculate monthly payments
 * Using simple interest method (like reference project)
 */
export function calculatePayments(
    capital: number,
    periodMonth: number,
    annualRate: number
): {
    monthlyPrincipalPay: number;
    monthlyInterestPay: number;
    monthlyPay: number;
    entirelyPay: number;
} {
    const monthlyRate = annualRate / 12 / 100;

    // Principal payment per month (equal principal)
    const monthlyPrincipalPay = Math.round(capital / periodMonth);

    // Interest payment per month (simple interest on original principal)
    const monthlyInterestPay = Math.round(capital * monthlyRate);

    // Total monthly payment
    const monthlyPay = monthlyPrincipalPay + monthlyInterestPay;

    // Total repayment over entire period
    const entirelyPay = monthlyPay * periodMonth;

    return {
        monthlyPrincipalPay,
        monthlyInterestPay,
        monthlyPay,
        entirelyPay
    };
}

/**
 * Default export for convenience
 */
export default {
    calculateRates,
    calculatePayments,
    getTier,
    TIER_CONFIG,
    CREDIT_SCORE_ADJUSTMENTS
};
