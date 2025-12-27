import { Injectable, Logger } from '@nestjs/common';

/**
 * Service tính toán lãi suất với chênh lệch sàn 3%
 * 
 * Logic:
 * - Base rate: 15% năm
 * - Credit score discount: 0.01% mỗi điểm FICO trên 500
 * - Admin spread: 3% năm (sàn giữ lại)
 * - Lender rate = Borrower rate - 3%
 */
@Injectable()
export class InterestRateCalculatorService {
    private readonly logger = new Logger(InterestRateCalculatorService.name);

    // Chênh lệch sàn cố định 3% hàng năm
    private readonly adminSpread = 3.0;

    // Base rate 15% năm
    private readonly baseAnnualRate = 15.0;

    // Credit score chuẩn
    private readonly standardCreditScore = 500;

    // Giảm 0.01% cho mỗi điểm credit trên 500
    private readonly creditScoreDiscount = 0.01;

    /**
     * Tính lãi suất người vay dựa trên vốn, kỳ hạn và điểm tín dụng
     * 
     * @param capital - Số vốn vay (VND)
     * @param periodMonth - Kỳ hạn (tháng)
     * @param creditScore - Điểm tín dụng (300-850)
     * @returns Lãi suất hàng năm (%)
     */
    calculateBorrowerRate(
        capital: number,
        periodMonth: number,
        creditScore: number = this.standardCreditScore
    ): number {
        // Tính discount dựa trên credit score
        const discount = Math.max(0, (creditScore - this.standardCreditScore) * this.creditScoreDiscount);

        // Annual rate = base - discount
        const annualRate = this.baseAnnualRate - discount;

        // Round to 2 decimal places
        const roundedRate = Math.round(annualRate * 100) / 100;

        this.logger.debug(`[calculateBorrowerRate] FICO ${creditScore} → ${discount.toFixed(5)}% reduction → ${roundedRate}% annual`);

        return roundedRate;
    }

    /**
     * Tính lãi suất người cho vay (borrowerRate - adminSpread)
     * 
     * @param borrowerRate - Lãi suất người vay hàng năm (%)
     * @returns Lãi suất người cho vay hàng năm (%)
     */
    calculateLenderRate(borrowerRate: number): number {
        const lenderRate = Math.max(0, borrowerRate - this.adminSpread);

        // Round to 5 decimal places for precision
        const roundedRate = Math.round(lenderRate * 100000) / 100000;

        return roundedRate;
    }

    /**
     * Tính toán đầy đủ các tỷ lệ (borrower, lender, spread)
     * 
     * @param capital - Số vốn vay
     * @param periodMonth - Kỳ hạn (tháng)
     * @param creditScore - Điểm tín dụng
     * @returns Object chứa tất cả các tỷ lệ
     */
    calculateRates(capital: number, periodMonth: number, creditScore: number = this.standardCreditScore) {
        // Tính borrower rate (annual)
        const annualBorrowerRate = this.calculateBorrowerRate(capital, periodMonth, creditScore);

        // Tính lender rate (annual)
        const annualLenderRate = this.calculateLenderRate(annualBorrowerRate);

        // Convert to monthly rates
        const monthlyBorrowerRate = annualBorrowerRate / 12;
        const monthlyLenderRate = annualLenderRate / 12;

        // Round monthly rates to 5 decimal places
        const roundedMonthlyBorrowerRate = Math.round(monthlyBorrowerRate * 100000) / 100000;
        const roundedMonthlyLenderRate = Math.round(monthlyLenderRate * 100000) / 100000;

        const result = {
            // Annual rates
            annualBorrowerRate,
            annualLenderRate,
            annualSpread: this.adminSpread,

            // Monthly rates
            monthlyBorrowerRate: roundedMonthlyBorrowerRate,
            monthlyLenderRate: roundedMonthlyLenderRate,

            // Compatibility (monthly rate as "rate")
            rate: roundedMonthlyBorrowerRate,
            lenderRate: roundedMonthlyLenderRate,
            spread: this.adminSpread
        };

        this.logger.log(`[calculateRates] Capital: ${capital}, Period: ${periodMonth}, FICO: ${creditScore}`);
        this.logger.log(`[calculateRates] Borrower: ${annualBorrowerRate}% annual (${roundedMonthlyBorrowerRate}% monthly)`);
        this.logger.log(`[calculateRates] Lender: ${annualLenderRate}% annual (${roundedMonthlyLenderRate}% monthly)`);
        this.logger.log(`[calculateRates] Spread: ${this.adminSpread}%`);

        return result;
    }

    /**
     * Tính toán các khoản thanh toán hàng tháng
     * 
     * @param capital - Số vốn vay
     * @param periodMonth - Kỳ hạn (tháng)
     * @param creditScore - Điểm tín dụng
     * @returns Object chứa các khoản thanh toán
     */
    calculatePayments(capital: number, periodMonth: number, creditScore: number = this.standardCreditScore) {
        const rates = this.calculateRates(capital, periodMonth, creditScore);

        // Flat interest calculation (lãi cố định)
        const monthlyInterestPay = Math.round(capital * (rates.monthlyBorrowerRate / 100));
        const monthlyPrincipalPay = Math.round(capital / periodMonth);
        const monthlyPay = monthlyPrincipalPay + monthlyInterestPay;
        const entirelyPay = monthlyPay * periodMonth;

        // Lender payments (based on lender rate)
        const lenderMonthlyInterestPay = Math.round(capital * (rates.monthlyLenderRate / 100));
        const lenderMonthlyPay = monthlyPrincipalPay + lenderMonthlyInterestPay;
        const lenderEntirelyPay = lenderMonthlyPay * periodMonth;

        // Admin profit per month and total
        const adminMonthlyProfit = monthlyInterestPay - lenderMonthlyInterestPay;
        const adminTotalProfit = adminMonthlyProfit * periodMonth;

        return {
            // Borrower payments
            monthlyPrincipalPay,
            monthlyInterestPay,
            monthlyPay,
            entirelyPay,

            // Lender payments
            lenderMonthlyInterestPay,
            lenderMonthlyPay,
            lenderEntirelyPay,

            // Admin profit
            adminMonthlyProfit,
            adminTotalProfit,

            // Rates (for reference)
            ...rates
        };
    }

    /**
     * Get admin spread percentage
     */
    getAdminSpread(): number {
        return this.adminSpread;
    }

    /**
     * Get base annual rate
     */
    getBaseAnnualRate(): number {
        return this.baseAnnualRate;
    }
}
