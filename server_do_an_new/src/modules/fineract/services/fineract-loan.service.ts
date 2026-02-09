import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { type AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';

import { FINERACT_AXIOS_CLIENT } from '../fineract.constants';
import { FineractBaseService, LOAN_TYPE_INDIVIDUAL, STRATEGY_MIFOS_STANDARD } from './fineract-base.service';
import { roundToCurrency } from '../../../utils/RoundingUtils';

/**
 * FineractLoanService - Loan and BNPL operations
 */
@Injectable()
export class FineractLoanService extends FineractBaseService {
    constructor(
        @Inject(FINERACT_AXIOS_CLIENT) private readonly client: AxiosInstance,
        configService: ConfigService,
    ) {
        super(configService);
    }

    /**
     * Create a new loan application in Fineract
     */
    async createLoanApplication(data: {
        clientId: number;
        productId: number;
        principal: number;
        numberOfRepayments: number;
        repaymentEvery?: number;
        repaymentFrequencyType?: number;
        interestRatePerPeriod?: number;
        expectedDisbursementDate?: string;
    }): Promise<number> {
        try {
            const product = await this.getLoanProductDetails(data.productId);
            if (!product) {
                throw new BadRequestException(`Loan product ${data.productId} not found in Fineract`);
            }

            const interestRatePerPeriod = product.interestRatePerPeriod;
            const amortizationType = product.amortizationType?.id;
            const interestType = product.interestType?.id;
            const interestCalculationPeriodType = product.interestCalculationPeriodType?.id;

            if (!interestRatePerPeriod || !amortizationType || interestType === undefined || !interestCalculationPeriodType) {
                throw new BadRequestException(`Loan product ${data.productId} is missing required configuration`);
            }

            const today = new Date();
            const submittedOnDate = today.toISOString().split('T')[0];
            const expectedDisbursementDate = data.expectedDisbursementDate || submittedOnDate;

            const response = await this.client.post('/loans', {
                clientId: data.clientId,
                productId: data.productId,
                principal: data.principal,
                loanTermFrequency: data.numberOfRepayments,
                loanTermFrequencyType: 2, // Months
                numberOfRepayments: data.numberOfRepayments,
                repaymentEvery: data.repaymentEvery || 1,
                repaymentFrequencyType: data.repaymentFrequencyType || 2, // Monthly
                interestRatePerPeriod,
                amortizationType,
                interestType,
                interestCalculationPeriodType,
                transactionProcessingStrategyCode: STRATEGY_MIFOS_STANDARD,
                loanType: LOAN_TYPE_INDIVIDUAL,
                expectedDisbursementDate,
                submittedOnDate,
                ...this.getCommonLocaleParams('strict'),
                locale: 'en',
            });

            this.logger.log(`Loan application created: ${response.data.loanId}`);
            return response.data.loanId || response.data.resourceId;
        } catch (error: any) {
            this.handleError(error, 'Failed to create loan application');
        }
    }

    /**
     * Approve a loan application
     */
    async approveLoan(loanId: number): Promise<void> {
        try {
            await this.client.post(`/loans/${loanId}?command=approve`, {
                approvedOnDate: this.getTodayFormatted('display'),
                ...this.getCommonLocaleParams('display'),
            });
            this.logger.log(`Loan ${loanId} approved`);
        } catch (error: any) {
            this.handleError(error, `Failed to approve loan ${loanId}`);
        }
    }

    /**
     * Disburse an approved loan
     */
    async disburseLoan(loanId: number): Promise<void> {
        try {
            await this.client.post(`/loans/${loanId}?command=disburse`, {
                actualDisbursementDate: this.getTodayFormatted('display'),
                ...this.getCommonLocaleParams('display'),
            });
            this.logger.log(`Loan ${loanId} disbursed`);
        } catch (error: any) {
            this.handleError(error, `Failed to disburse loan ${loanId}`);
        }
    }

    /**
     * Get loan details with repayment schedule
     */
    async getLoanDetails(loanId: string): Promise<any> {
        try {
            const response = await this.client.get(`/loans/${loanId}?associations=repaymentSchedule`);
            return response.data;
        } catch (error: any) {
            this.handleError(error, `Failed to get loan details ${loanId}`);
        }
    }

    /**
     * Get repayment schedule from Fineract
     */
    async getRepaymentSchedule(loanId: string | number): Promise<any> {
        try {
            const loanDetails = await this.getLoanDetails(loanId.toString());
            return loanDetails.repaymentSchedule || null;
        } catch (error: any) {
            this.logger.error(`Failed to get repayment schedule for loan ${loanId}: ${error.message}`);
            return null;
        }
    }

    /**
     * Get all active loans for a client
     */
    async getClientLoans(clientId: number): Promise<any[]> {
        try {
            const response = await this.client.get(`/clients/${clientId}/accounts`);
            return response.data?.loanAccounts || [];
        } catch {
            this.logger.error(`Failed to get loans for client ${clientId}`);
            return [];
        }
    }

    /**
     * Create loan, approve, and disburse in one flow
     */
    async createAndDisburseLoan(data: {
        clientId: number;
        productId: number;
        principal: number;
        numberOfRepayments: number;
    }): Promise<{ loanId: number; repaymentSchedule: any }> {
        const loanId = await this.createLoanApplication(data);
        await this.approveLoan(loanId);
        await this.disburseLoan(loanId);
        const loanDetails = await this.getLoanDetails(loanId.toString());

        return {
            loanId,
            repaymentSchedule: loanDetails.repaymentSchedule,
        };
    }

    /**
     * Get loan product details from Fineract
     */
    async getLoanProductDetails(productId: number): Promise<any> {
        try {
            const response = await this.client.get(`/loanproducts/${productId}`);
            return response.data;
        } catch (error: any) {
            this.handleError(error, `Failed to get loan product ${productId}`);
        }
    }

    /**
     * Calculate BNPL loan schedule based on Product configuration
     */
    async calculateBnplSchedule(data: { productId: number; principal: number; numberOfRepayments: number }): Promise<{
        monthlyRate: number;
        annualRate: number;
        monthlyPay: number;
        totalRepayment: number;
        totalInterest: number;
        interestType: string;
        schedulePreview: Array<{
            period: number;
            principal: number;
            interest: number;
            total: number;
            dueDate: string;
        }>;
    }> {
        const product = await this.getLoanProductDetails(data.productId);
        if (!product) {
            throw new BadRequestException(`Loan product ${data.productId} not found in Fineract`);
        }

        const monthlyRate = product.interestRatePerPeriod ?? 0;
        const annualRate = product.annualInterestRate ?? monthlyRate * 12;
        const interestType = product.interestType?.value ?? 'Flat';
        const inMultiplesOf = product.currency?.inMultiplesOf ?? 1;

        const roundToCurrencyMultiples = (val: number): number => roundToCurrency(val, inMultiplesOf);

        let monthlyPay: number;
        let totalRepayment: number;
        const schedulePreview: Array<{
            period: number;
            principal: number;
            interest: number;
            total: number;
            dueDate: string;
        }> = [];

        const today = new Date();

        if (interestType === 'Declining Balance' || product.interestType?.code === 'interestType.declining.balance') {
            const r = monthlyRate / 100;
            if (r > 0) {
                const rawEmi =
                    (data.principal * r * Math.pow(1 + r, data.numberOfRepayments)) /
                    (Math.pow(1 + r, data.numberOfRepayments) - 1);
                monthlyPay = roundToCurrencyMultiples(rawEmi);
            } else {
                monthlyPay = roundToCurrencyMultiples(data.principal / data.numberOfRepayments);
            }

            let outstanding = data.principal;
            let totalPaid = 0;

            for (let i = 1; i <= data.numberOfRepayments; i++) {
                const interest = roundToCurrencyMultiples(outstanding * r);
                let principal = 0;
                let payment = 0;

                if (i < data.numberOfRepayments) {
                    payment = monthlyPay;
                    principal = payment - interest;
                } else {
                    principal = outstanding;
                    payment = principal + interest;
                }

                const dueDate = new Date(today);
                dueDate.setMonth(dueDate.getMonth() + i);

                schedulePreview.push({
                    period: i,
                    principal: roundToCurrencyMultiples(principal),
                    interest,
                    total: payment,
                    dueDate: dueDate.toISOString().split('T')[0],
                });

                outstanding -= principal;
                totalPaid += payment;
            }

            totalRepayment = totalPaid;
        } else {
            // FLAT interest
            const monthlyPrincipal = roundToCurrencyMultiples(data.principal / data.numberOfRepayments);
            const monthlyInterest = roundToCurrencyMultiples((data.principal * monthlyRate) / 100);

            monthlyPay = monthlyPrincipal + monthlyInterest;
            totalRepayment = monthlyPay * data.numberOfRepayments;

            for (let i = 1; i <= data.numberOfRepayments; i++) {
                const dueDate = new Date(today);
                dueDate.setMonth(dueDate.getMonth() + i);

                schedulePreview.push({
                    period: i,
                    principal: monthlyPrincipal,
                    interest: monthlyInterest,
                    total: monthlyPay,
                    dueDate: dueDate.toISOString().split('T')[0],
                });
            }
        }

        const totalInterest = totalRepayment - data.principal;

        return {
            monthlyRate,
            annualRate,
            monthlyPay: roundToCurrencyMultiples(monthlyPay),
            totalRepayment: roundToCurrencyMultiples(totalRepayment),
            totalInterest: roundToCurrencyMultiples(totalInterest),
            interestType,
            schedulePreview,
        };
    }
}
