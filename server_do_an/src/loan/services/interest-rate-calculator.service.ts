import { Injectable, Logger } from '@nestjs/common';

/**
 * Interest Rate Calculator
 * Calculates dynamic interest rates based on credit score, loan amount, and period
 * Ported from legacy InterestRateCalculator.js with enhancements
 */

export interface RateCalculation {
    // Monthly rates (primary for app display)
    monthlyBorrowerRate: number;
    monthlyLenderRate: number;
    monthlySpread: number;

    // Annual rates (for reference)
    annualBorrowerRate: number;
    annualLenderRate: number;
    annualSpread: number;
    spreadPercentage: number;

    // Metadata
    creditScore: number;
    loanAmount: number;
    periodMonths: number;
    tier: 'small' | 'medium' | 'large';
}

export interface PaymentCalculation extends RateCalculation {
    monthlyPrincipalPay: number;
    monthlyInterestPay: number;
    monthlyPay: number;
    totalPayment: number;
    totalInterest: number;
    effectiveAnnualRate: number;
}

@Injectable()
export class InterestRateCalculatorService {
    private readonly logger = new Logger(InterestRateCalculatorService.name);

    // Formula constants (from legacy)
    private readonly BASE_RATE = 15;          // Base: 15% 
    private readonly FICO_COEFFICIENT = 0.00005; // Credit score impact
    private readonly MONTH_COEFFICIENT = 0.01;   // Period impact
    private readonly ADMIN_SPREAD = 3.0;      // Fixed 3% spread

    // Rate limits
    private readonly MIN_RATE = 3;   // 3% minimum annual
    private readonly MAX_RATE = 20;  // 20% maximum annual

    /**
     * Calculate borrower interest rate
     * Uses FICO credit score (300-850)
     */
    calculateBorrowerRate(
        loanAmount: number,
        periodMonths: number,
        creditScore: number = 500
    ): number {
        // Capital discount: larger loans get slightly lower rates
        const capitalDiscount = Math.log10(loanAmount / 1000000) * 0.1;

        // FICO impact: higher score = lower rate
        // Range: (850-300) * 0.00005 = 2.75% variation
        const ficoImpact = this.FICO_COEFFICIENT * (creditScore - 300);

        // Calculate rate
        const rate =
            this.BASE_RATE                              // Base: 15%
            - ficoImpact                                // FICO discount
            - capitalDiscount                           // Capital discount
            + (this.MONTH_COEFFICIENT * periodMonths);  // Period penalty

        // Clamp between min and max
        const clampedRate = Math.max(this.MIN_RATE, Math.min(this.MAX_RATE, rate));

        const precision = Math.round(clampedRate * 100000) / 100000;

        this.logger.debug(
            `Borrower rate: FICO ${creditScore} → ${ficoImpact.toFixed(5)}% discount → ${precision}% annual`
        );

        return precision;
    }

    /**
     * Calculate lender interest rate (borrower rate - admin spread)
     */
    calculateLenderRate(borrowerRate: number): number {
        const lenderRate = borrowerRate - this.ADMIN_SPREAD;

        // Minimum lender rate is 0.5%
        const clampedRate = Math.max(0.5, lenderRate);

        return Math.round(clampedRate * 100000) / 100000;
    }

    /**
     * Calculate complete rate breakdown
     */
    calculateRates(
        loanAmount: number,
        periodMonths: number,
        creditScore: number = 500
    ): RateCalculation {
        // Calculate annual rates
        const annualBorrowerRate = this.calculateBorrowerRate(loanAmount, periodMonths, creditScore);
        const annualLenderRate = this.calculateLenderRate(annualBorrowerRate);
        const annualSpread = annualBorrowerRate - annualLenderRate;
        const spreadPercentage = (annualSpread / annualBorrowerRate) * 100;

        // Convert to monthly rates
        const monthlyBorrowerRate = parseFloat((annualBorrowerRate / 12).toFixed(5));
        const monthlyLenderRate = parseFloat((annualLenderRate / 12).toFixed(5));
        const monthlySpread = parseFloat((annualSpread / 12).toFixed(5));

        // Determine tier
        let tier: 'small' | 'medium' | 'large';
        if (loanAmount < 10000000) {
            tier = 'small';
        } else if (loanAmount < 50000000) {
            tier = 'medium';
        } else {
            tier = 'large';
        }

        return {
            monthlyBorrowerRate,
            monthlyLenderRate,
            monthlySpread,
            annualBorrowerRate: parseFloat(annualBorrowerRate.toFixed(5)),
            annualLenderRate: parseFloat(annualLenderRate.toFixed(5)),
            annualSpread: parseFloat(annualSpread.toFixed(5)),
            spreadPercentage: parseFloat(spreadPercentage.toFixed(5)),
            creditScore,
            loanAmount,
            periodMonths,
            tier
        };
    }

    /**
     * Calculate payment amounts with rate breakdown
     */
    calculatePayments(
        loanAmount: number,
        periodMonths: number,
        creditScore: number = 500
    ): PaymentCalculation {
        const rates = this.calculateRates(loanAmount, periodMonths, creditScore);

        // Monthly principal (flat amortization)
        const monthlyPrincipalPay = Math.round(loanAmount / periodMonths);

        // Monthly interest (on full principal - FLAT rate model)
        const monthlyInterestPay = Math.round(loanAmount * rates.monthlyBorrowerRate / 100);

        // Total monthly payment
        const monthlyPay = monthlyPrincipalPay + monthlyInterestPay;

        // Total payment over period
        const totalPayment = monthlyPay * periodMonths;

        // Total interest
        const totalInterest = monthlyInterestPay * periodMonths;

        // Effective annual rate
        const effectiveAnnualRate = (totalInterest / loanAmount) * 100;

        return {
            ...rates,
            monthlyPrincipalPay,
            monthlyInterestPay,
            monthlyPay,
            totalPayment,
            totalInterest,
            effectiveAnnualRate: parseFloat(effectiveAnnualRate.toFixed(2))
        };
    }

    /**
     * Get tier description
     */
    getTierDescription(loanAmount: number): string {
        if (loanAmount < 10000000) {
            return 'Khoản vay nhỏ (< 10 triệu)';
        } else if (loanAmount < 50000000) {
            return 'Khoản vay trung bình (10-50 triệu)';
        } else {
            return 'Khoản vay lớn (> 50 triệu)';
        }
    }

    /**
     * Get credit score description
     */
    getScoreDescription(score: number): string {
        if (score >= 750) return 'Tín dụng xuất sắc (A+)';
        if (score >= 700) return 'Tín dụng xuất sắc (A)';
        if (score >= 650) return 'Tín dụng tốt (B+)';
        if (score >= 600) return 'Tín dụng tốt (B)';
        if (score >= 550) return 'Tín dụng trung bình (C+)';
        if (score >= 500) return 'Tín dụng trung bình (C)';
        if (score >= 450) return 'Tín dụng kém (D)';
        return 'Tín dụng rất kém (F)';
    }
}
