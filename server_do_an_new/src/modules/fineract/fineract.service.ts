import { Injectable, Logger, Inject, BadRequestException } from '@nestjs/common';
import { type AxiosInstance } from 'axios';

import { FINERACT_AXIOS_CLIENT } from './fineract.constants';

import { ConfigService } from '@nestjs/config';

export interface FineractClientData {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email?: string;
    officeId?: number;
    legalFormId?: number;
}

@Injectable()
export class FineractService {
    private readonly logger = new Logger(FineractService.name);

    constructor(
        @Inject(FINERACT_AXIOS_CLIENT) private readonly client: AxiosInstance,
        private readonly configService: ConfigService,
    ) { }

    /**
     * Create a new client in Fineract
     */
    async createClient(data: FineractClientData): Promise<number> {
        const today = new Date().toLocaleDateString('en-GB', {
            day: '2-digit', month: 'long', year: 'numeric',
        });

        const officeId = data.officeId || this.configService.get<number>('defaults.officeId') || 1;
        const legalFormId = data.legalFormId || this.configService.get<number>('defaults.legalFormId') || 1;

        try {
            const response = await this.client.post('/clients', {
                officeId,
                legalFormId,
                firstname: data.firstName,
                lastname: data.lastName,
                externalId: data.phoneNumber,
                mobileNo: data.phoneNumber,
                emailAddress: data.email,
                active: true,
                activationDate: today,
                locale: this.configService.get<string>('defaults.locale'),
                dateFormat: this.configService.get<string>('defaults.dateFormat'),
            });


            return response.data.resourceId || response.data.clientId;
        } catch (error: any) {
            this.handleError(error, 'Failed to create Fineract client');
        }
    }

    async findClientByIdentifier(identifier: string): Promise<any | null> {
        try {
            this.logger.debug(`Searching for Fineract client using: ${identifier}`);

            // 1. Search by externalId (direct match)
            const extResponse = await this.client.get('/clients', { params: { externalId: identifier } });
            const extClients = extResponse.data?.pageItems || extResponse.data || [];
            const matchByExt = extClients.find((c: any) => c.externalId === identifier);
            if (matchByExt) return matchByExt;

            // 2. Try heuristic transformation (borrower1 -> BORROWER_1)
            const heuristicId = identifier.toUpperCase().replace(/(\D+)(\d+)/, '$1_$2');
            if (heuristicId !== identifier.toUpperCase()) {
                const hResponse = await this.client.get('/clients', { params: { externalId: heuristicId } });
                const hClients = hResponse.data?.pageItems || hResponse.data || [];
                const matchByH = hClients.find((c: any) => c.externalId === heuristicId);
                if (matchByH) return matchByH;
            }

            // 3. Search by mobileNo
            const searchPhone = identifier.replace(/\D/g, '');
            if (searchPhone.length >= 9) {
                const mobileResponse = await this.client.get('/clients', { params: { mobileNo: searchPhone } });
                const mobileClients = mobileResponse.data?.pageItems || mobileResponse.data || [];
                const matchByPhone = mobileClients.find((c: any) => (c.mobileNo || '').replace(/\D/g, '') === searchPhone);
                if (matchByPhone) return matchByPhone;
            }

            return null;
        } catch (error: any) {
            this.logger.error(`Error finding client by identifier ${identifier}: ${error.message}`);
            return null;
        }
    }


    /**
     * Get all savings accounts for a client
     */
    async getSavingsAccounts(clientId: number): Promise<any[]> {
        try {
            const response = await this.client.get(`/clients/${clientId}/accounts`);
            return response.data?.savingsAccounts || [];
        } catch (error) {
            this.logger.error(`Failed to get savings accounts for client ${clientId}`);
            return [];
        }
    }

    /**
     * Get detailed savings account info
     */
    async getSavingsAccountDetails(savingsId: string): Promise<any> {
        try {
            const response = await this.client.get(`/savingsaccounts/${savingsId}`);
            return response.data;
        } catch (error: any) {
            this.handleError(error, `Failed to get savings account ${savingsId}`);
        }
    }

    /**
     * Determine wallet type based on Fineract account data
     */
    getWalletType(savingsData: any): 'credit_wallet' | 'e_wallet' {
        // match by Product ID
        const productId = savingsData.savingsProductId || savingsData.productId;
        const configCreditId = this.configService.get<number>('defaults.creditWalletProductId');
        const configEwalletId = this.configService.get<number>('defaults.ewalletProductId');

        if (productId && productId === configCreditId) return 'credit_wallet';
        if (productId && productId === configEwalletId) return 'e_wallet';

        return 'e_wallet';
    }

    // ==================== LOAN OPERATIONS (BNPL) ====================

    /**
     * Create a new loan application in Fineract
     * Matches legacy pattern for compatibility
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
            // Fetch product details to get default configuration
            const product = await this.getLoanProductDetails(data.productId);

            // Use product defaults for mandatory fields (matching legacy)
            const interestRatePerPeriod = product.interestRatePerPeriod || 1.5;
            const amortizationType = product.amortizationType?.id || 1;
            const interestType = product.interestType?.id || 0;
            const interestCalculationPeriodType = product.interestCalculationPeriodType?.id || 1;

            // Date formatting (legacy uses yyyy-MM-dd)
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
                // Mandatory fields from product configuration
                interestRatePerPeriod,
                amortizationType,
                interestType,
                interestCalculationPeriodType,
                transactionProcessingStrategyCode: 'mifos-standard-strategy',
                loanType: 'individual',
                expectedDisbursementDate,
                submittedOnDate,
                dateFormat: 'yyyy-MM-dd',
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
        const today = new Date().toLocaleDateString('en-GB', {
            day: '2-digit', month: 'long', year: 'numeric',
        });

        try {
            await this.client.post(`/loans/${loanId}?command=approve`, {
                approvedOnDate: today,
                locale: this.configService.get<string>('defaults.locale') || 'en',
                dateFormat: this.configService.get<string>('defaults.dateFormat') || 'dd MMMM yyyy',
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
        const today = new Date().toLocaleDateString('en-GB', {
            day: '2-digit', month: 'long', year: 'numeric',
        });

        try {
            await this.client.post(`/loans/${loanId}?command=disburse`, {
                actualDisbursementDate: today,
                locale: this.configService.get<string>('defaults.locale') || 'en',
                dateFormat: this.configService.get<string>('defaults.dateFormat') || 'dd MMMM yyyy',
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
     * Get all active loans for a client
     */
    async getClientLoans(clientId: number): Promise<any[]> {
        try {
            const response = await this.client.get(`/clients/${clientId}/accounts`);
            return response.data?.loanAccounts || [];
        } catch (error) {
            this.logger.error(`Failed to get loans for client ${clientId}`);
            return [];
        }
    }

    /**
     * Create loan, approve, and disburse in one flow (auto-disburse)
     */
    async createAndDisburseLoan(data: {
        clientId: number;
        productId: number;
        principal: number;
        numberOfRepayments: number;
    }): Promise<{ loanId: number; repaymentSchedule: any }> {
        // Step 1: Create loan application
        const loanId = await this.createLoanApplication(data);

        // Step 2: Approve
        await this.approveLoan(loanId);

        // Step 3: Disburse
        await this.disburseLoan(loanId);

        // Step 4: Get details with schedule
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
     * Mirrors logic from legacy calculateLoanSchedule
     */
    async calculateBnplSchedule(data: {
        productId: number;
        principal: number;
        numberOfRepayments: number;
    }): Promise<{
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
        // Get product details
        const product = await this.getLoanProductDetails(data.productId);

        const monthlyRate = product.interestRatePerPeriod || 0;
        const annualRate = product.annualInterestRate || (monthlyRate * 12);
        const interestType = product.interestType?.value || 'Flat';
        const inMultiplesOf = product.currency?.inMultiplesOf || 1;

        this.logger.log(`[calculateBnplSchedule] Principal=${data.principal}, Periods=${data.numberOfRepayments}, Rate=${monthlyRate}%, Type=${interestType}`);

        // Helper: Round to currency multiples
        const roundToCurrency = (val: number): number => {
            return Math.round(val / inMultiplesOf) * inMultiplesOf;
        };

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
            // DECLINING BALANCE (EMI calculation)
            const r = monthlyRate / 100;
            if (r > 0) {
                const rawEmi = data.principal * r * Math.pow(1 + r, data.numberOfRepayments) / (Math.pow(1 + r, data.numberOfRepayments) - 1);
                monthlyPay = roundToCurrency(rawEmi);
            } else {
                monthlyPay = roundToCurrency(data.principal / data.numberOfRepayments);
            }

            // Simulate schedule
            let outstanding = data.principal;
            let totalPaid = 0;

            for (let i = 1; i <= data.numberOfRepayments; i++) {
                const interest = roundToCurrency(outstanding * r);
                let principal = 0;
                let payment = 0;

                if (i < data.numberOfRepayments) {
                    payment = monthlyPay;
                    principal = payment - interest;
                } else {
                    // Last period: pay off remaining
                    principal = outstanding;
                    payment = principal + interest;
                }

                const dueDate = new Date(today);
                dueDate.setMonth(dueDate.getMonth() + i);

                schedulePreview.push({
                    period: i,
                    principal: roundToCurrency(principal),
                    interest,
                    total: payment,
                    dueDate: dueDate.toISOString().split('T')[0],
                });

                outstanding -= principal;
                totalPaid += payment;
            }

            totalRepayment = totalPaid;
        } else {
            // FLAT interest (Default for BNPL)
            const monthlyPrincipal = roundToCurrency(data.principal / data.numberOfRepayments);
            const monthlyInterest = roundToCurrency(data.principal * monthlyRate / 100);

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

        this.logger.log(`[calculateBnplSchedule] Result: Monthly=${monthlyPay}, Total=${totalRepayment}, Interest=${totalInterest}`);

        return {
            monthlyRate,
            annualRate,
            monthlyPay: roundToCurrency(monthlyPay),
            totalRepayment: roundToCurrency(totalRepayment),
            totalInterest: roundToCurrency(totalInterest),
            interestType,
            schedulePreview,
        };
    }


    /**
     * Common error handler for senior-level logging and exceptions
     */
    private handleError(error: any, context: string): never {

        const errorData = error.response?.data;
        this.logger.error(`${context}: ${JSON.stringify(errorData || error.message)}`);

        if (errorData?.errors?.length > 0) {
            throw new BadRequestException(errorData.errors[0].defaultUserMessage || context);
        }

        throw new BadRequestException(context);
    }
}

