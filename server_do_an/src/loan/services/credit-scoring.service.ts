import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LoanContract } from '../schemas/loan-contract.schema';
import { InvestmentContract } from '../../invest/schemas/investment-contract.schema';

/**
 * Credit Assessment Result
 */
export interface CreditAssessment {
    score: number;              // 300-850 (FICO scale)
    grade: string;              // A+, A, B, C, D, F
    riskLevel: 'low' | 'medium' | 'high' | 'very_high';
    isApproved: boolean;
    factors: {
        paymentHistory: { score: number; weight: number; details: string };
        debtToIncome: { score: number; weight: number; details: string };
        creditAge: { score: number; weight: number; details: string };
        creditUtilization: { score: number; weight: number; details: string };
        recentInquiries: { score: number; weight: number; details: string };
    };
    recommendations: string[];
    rejectionReasons?: string[];
}

/**
 * Smart Credit Scoring Service
 * Evaluates borrower creditworthiness using multiple factors
 */
@Injectable()
export class CreditScoringService {
    private readonly logger = new Logger(CreditScoringService.name);

    // Scoring thresholds
    private readonly EXCELLENT_SCORE = 750;
    private readonly GOOD_SCORE = 650;
    private readonly FAIR_SCORE = 550;
    private readonly POOR_SCORE = 450;
    private readonly MIN_APPROVAL_SCORE = 450;

    constructor(
        @InjectModel(LoanContract.name) private loanModel: Model<LoanContract>,
        @InjectModel(InvestmentContract.name) private investModel: Model<InvestmentContract>,
    ) { }

    /**
     * Calculate comprehensive credit score for a borrower
     */
    async assessCreditworthiness(
        userId: string,
        requestedAmount: number,
        monthlyIncome?: number,
    ): Promise<CreditAssessment> {
        this.logger.log(`Assessing credit for user ${userId}, amount: ${requestedAmount}`);

        // 1. Payment History (35% weight) - Most important factor
        const paymentHistoryScore = await this.evaluatePaymentHistory(userId);

        // 2. Debt-to-Income Ratio (30% weight)
        const debtToIncomeScore = await this.evaluateDebtToIncome(userId, requestedAmount, monthlyIncome);

        // 3. Credit Age (15% weight) - Account history
        const creditAgeScore = await this.evaluateCreditAge(userId);

        // 4. Credit Utilization (10% weight) - Current debt vs available credit
        const creditUtilizationScore = await this.evaluateCreditUtilization(userId, requestedAmount);

        // 5. Recent Inquiries (10% weight) - New credit applications
        const recentInquiriesScore = await this.evaluateRecentInquiries(userId);

        // Calculate weighted average (FICO formula)
        const rawScore =
            paymentHistoryScore.score * 0.35 +
            debtToIncomeScore.score * 0.30 +
            creditAgeScore.score * 0.15 +
            creditUtilizationScore.score * 0.10 +
            recentInquiriesScore.score * 0.10;

        // Convert to FICO scale (300-850)
        const ficoScore = Math.round(300 + (rawScore / 100) * 550);
        const clampedScore = Math.max(300, Math.min(850, ficoScore));

        // Determine grade and risk level
        const { grade, riskLevel } = this.getGradeAndRisk(clampedScore);

        // Approval decision
        const isApproved = clampedScore >= this.MIN_APPROVAL_SCORE;
        const rejectionReasons = isApproved ? undefined : this.getRejectionReasons(clampedScore, {
            paymentHistoryScore,
            debtToIncomeScore,
            creditAgeScore,
            creditUtilizationScore,
            recentInquiriesScore
        });

        // Recommendations
        const recommendations = this.generateRecommendations(clampedScore, {
            paymentHistoryScore,
            debtToIncomeScore,
            creditAgeScore,
            creditUtilizationScore,
            recentInquiriesScore
        });

        const assessment: CreditAssessment = {
            score: clampedScore,
            grade,
            riskLevel,
            isApproved,
            factors: {
                paymentHistory: paymentHistoryScore,
                debtToIncome: debtToIncomeScore,
                creditAge: creditAgeScore,
                creditUtilization: creditUtilizationScore,
                recentInquiries: recentInquiriesScore
            },
            recommendations,
            rejectionReasons
        };

        this.logger.log(`Credit assessment completed: Score=${clampedScore}, Grade=${grade}, Approved=${isApproved}`);

        return assessment;
    }

    /**
     * 1. Payment History (35%) - Track record of on-time payments
     */
    private async evaluatePaymentHistory(userId: string): Promise<{ score: number; weight: number; details: string }> {
        // Get all completed loans
        const completedLoans = await this.loanModel.find({
            borrower: userId,
            status: { $in: ['closed', 'completed'] }
        });

        if (completedLoans.length === 0) {
            return {
                score: 50, // Neutral for new borrowers
                weight: 0.35,
                details: 'Chưa có lịch sử vay. Điểm trung lập.'
            };
        }

        let totalPayments = 0;
        let onTimePayments = 0;
        let latePayments = 0;
        let defaulted = 0;

        for (const loan of completedLoans) {
            if (loan.isDefaulted) {
                defaulted++;
            } else {
                // Count repayment history
                const repaymentHistory = (loan as any).repaymentHistory || [];
                totalPayments += repaymentHistory.length;

                // In real system, check actual vs expected dates
                // For now, assume on-time if loan not defaulted
                onTimePayments += repaymentHistory.length;
            }
        }

        // Calculate score
        let score = 100;

        if (defaulted > 0) {
            score = 0; // Defaulted = instant fail
        } else if (totalPayments > 0) {
            const onTimeRatio = onTimePayments / totalPayments;
            score = onTimeRatio * 100;
        }

        const details = defaulted > 0
            ? `${defaulted} khoản vay vi phạm. KHÔNG ĐỦ ĐIỀU KIỆN.`
            : totalPayments > 0
                ? `${onTimePayments}/${totalPayments} kỳ trả đúng hạn (${(onTimePayments / totalPayments * 100).toFixed(1)}%)`
                : 'Chưa có lịch sử thanh toán';

        return { score, weight: 0.35, details };
    }

    /**
     * 2. Debt-to-Income Ratio (30%) - Current debt obligations vs income
     */
    private async evaluateDebtToIncome(
        userId: string,
        requestedAmount: number,
        monthlyIncome?: number
    ): Promise<{ score: number; weight: number; details: string }> {
        // Get active loans
        const activeLoans = await this.loanModel.find({
            borrower: userId,
            status: { $in: ['waiting', 'success', 'active'] },
            fineractStatus: { $ne: 'CLOSED' }
        });

        // Calculate total monthly debt
        let totalMonthlyDebt = 0;
        for (const loan of activeLoans) {
            totalMonthlyDebt += loan.info?.monthlyPay || 0;
        }

        // Add requested loan monthly payment (estimate)
        const estimatedMonthlyPayment = requestedAmount / 12 * 1.12; // Assuming 12% rate, 12 months
        const projectedMonthlyDebt = totalMonthlyDebt + estimatedMonthlyPayment;

        // If no income provided, use conservative estimate
        const income = monthlyIncome || 15000000; // 15M VND default

        const debtToIncomeRatio = (projectedMonthlyDebt / income) * 100;

        // Score based on DTI ratio
        let score: number;
        if (debtToIncomeRatio <= 20) {
            score = 100; // Excellent
        } else if (debtToIncomeRatio <= 35) {
            score = 80;  // Good
        } else if (debtToIncomeRatio <= 50) {
            score = 50;  // Fair
        } else if (debtToIncomeRatio <= 70) {
            score = 20;  // Poor
        } else {
            score = 0;   // Very poor
        }

        const details = `DTI: ${debtToIncomeRatio.toFixed(1)}%. Nợ hàng tháng: ${projectedMonthlyDebt.toLocaleString()} VND / Thu nhập: ${income.toLocaleString()} VND`;

        return { score, weight: 0.30, details };
    }

    /**
     * 3. Credit Age (15%) - Length of credit history
     */
    private async evaluateCreditAge(userId: string): Promise<{ score: number; weight: number; details: string }> {
        // Find oldest loan
        const oldestLoan = await this.loanModel
            .findOne({ borrower: userId })
            .sort({ createdAt: 1 })
            .lean(); // Convert to plain object to access createdAt

        if (!oldestLoan) {
            return {
                score: 30, // New user penalty
                weight: 0.15,
                details: 'Tài khoản mới. Chưa có lịch sử tín dụng.'
            };
        }

        // Use type assertion for createdAt (Mongoose timestamps)
        const createdAt = (oldestLoan as any).createdAt || new Date();
        const accountAgeMonths = Math.floor(
            (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30)
        );

        // Score based on age
        let score: number;
        if (accountAgeMonths >= 24) {
            score = 100; // 2+ years
        } else if (accountAgeMonths >= 12) {
            score = 80;  // 1-2 years
        } else if (accountAgeMonths >= 6) {
            score = 60;  // 6-12 months
        } else if (accountAgeMonths >= 3) {
            score = 40;  // 3-6 months
        } else {
            score = 20;  // < 3 months
        }

        const details = `Tuổi tài khoản: ${accountAgeMonths} tháng`;

        return { score, weight: 0.15, details };
    }

    /**
     * 4. Credit Utilization (10%) - How much credit is being used
     */
    private async evaluateCreditUtilization(
        userId: string,
        requestedAmount: number
    ): Promise<{ score: number; weight: number; details: string }> {
        // Calculate total borrowed vs historical capacity
        const allLoans = await this.loanModel.find({ borrower: userId });

        if (allLoans.length === 0) {
            return {
                score: 70, // Neutral-good for new users
                weight: 0.10,
                details: 'Chưa sử dụng tín dụng'
            };
        }

        // Max loan amount user has taken before
        const maxHistoricalLoan = Math.max(...allLoans.map(l => l.info?.capital || 0));

        // Active loans total
        const activeLoans = allLoans.filter(l =>
            ['waiting', 'success', 'active'].includes(l.status)
        );
        const totalActiveBorrowed = activeLoans.reduce((sum, l) => sum + (l.info?.capital || 0), 0);

        // Utilization ratio
        const utilizationRatio = (totalActiveBorrowed / (maxHistoricalLoan || requestedAmount)) * 100;

        let score: number;
        if (utilizationRatio <= 30) {
            score = 100; // Low utilization
        } else if (utilizationRatio <= 50) {
            score = 80;
        } else if (utilizationRatio <= 70) {
            score = 50;
        } else {
            score = 20; // High utilization
        }

        const details = `Tỷ lệ sử dụng tín dụng: ${utilizationRatio.toFixed(1)}%`;

        return { score, weight: 0.10, details };
    }

    /**
     * 5. Recent Inquiries (10%) - New credit applications
     */
    private async evaluateRecentInquiries(userId: string): Promise<{ score: number; weight: number; details: string }> {
        // Count loans created in last 3 months
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const recentLoans = await this.loanModel.countDocuments({
            borrower: userId,
            createdAt: { $gte: threeMonthsAgo }
        });

        let score: number;
        if (recentLoans === 0) {
            score = 100; // No recent inquiries
        } else if (recentLoans === 1) {
            score = 80;  // One is ok
        } else if (recentLoans === 2) {
            score = 50;  // Two is concerning
        } else {
            score = 0;   // 3+ is red flag
        }

        const details = `${recentLoans} yêu cầu vay trong 3 tháng gần đây`;

        return { score, weight: 0.10, details };
    }

    /**
     * Get grade and risk level from score
     */
    private getGradeAndRisk(score: number): { grade: string; riskLevel: CreditAssessment['riskLevel'] } {
        if (score >= 750) {
            return { grade: 'A+', riskLevel: 'low' };
        } else if (score >= 700) {
            return { grade: 'A', riskLevel: 'low' };
        } else if (score >= 650) {
            return { grade: 'B+', riskLevel: 'medium' };
        } else if (score >= 600) {
            return { grade: 'B', riskLevel: 'medium' };
        } else if (score >= 550) {
            return { grade: 'C+', riskLevel: 'medium' };
        } else if (score >= 500) {
            return { grade: 'C', riskLevel: 'high' };
        } else if (score >= 450) {
            return { grade: 'D', riskLevel: 'high' };
        } else {
            return { grade: 'F', riskLevel: 'very_high' };
        }
    }

    /**
     * Generate rejection reasons
     */
    private getRejectionReasons(score: number, factors: any): string[] {
        const reasons: string[] = [];

        if (factors.paymentHistoryScore.score < 50) {
            reasons.push('Lịch sử thanh toán không đủ tốt');
        }
        if (factors.debtToIncomeScore.score < 30) {
            reasons.push('Tỷ lệ nợ/thu nhập quá cao');
        }
        if (factors.recentInquiriesScore.score < 50) {
            reasons.push('Quá nhiều yêu cầu vay gần đây');
        }
        if (score < this.MIN_APPROVAL_SCORE) {
            reasons.push(`Điểm tín dụng (${score}) thấp hơn ngưỡng tối thiểu (${this.MIN_APPROVAL_SCORE})`);
        }

        return reasons;
    }

    /**
     * Generate recommendations
     */
    private generateRecommendations(score: number, factors: any): string[] {
        const recommendations: string[] = [];

        if (score >= 750) {
            recommendations.push('Tín dụng xuất sắc! Bạn đủ điều kiện vay với lãi suất ưu đãi nhất.');
            return recommendations;
        }

        if (factors.paymentHistoryScore.score < 80) {
            recommendations.push('✅ Trả nợ đúng hạn để cải thiện lịch sử thanh toán');
        }
        if (factors.debtToIncomeScore.score < 70) {
            recommendations.push('💰 Giảm nợ hiện tại hoặc tăng thu nhập trước khi vay thêm');
        }
        if (factors.creditAgeScore.score < 60) {
            recommendations.push('⏰ Duy trì tài khoản lâu dài để tăng điểm tuổi tín dụng');
        }
        if (factors.recentInquiriesScore.score < 80) {
            recommendations.push('🚫 Tránh tạo nhiều khoản vay mới trong thời gian ngắn');
        }

        if (score < 550) {
            recommendations.push('⚠️ Cần cải thiện điểm tín dụng trước khi vay số tiền lớn');
        }

        return recommendations;
    }
}
