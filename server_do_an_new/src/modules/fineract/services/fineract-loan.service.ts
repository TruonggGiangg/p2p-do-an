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
     * Create a new loan application in Fineract (học theo p2p)
     * interestRatePerPeriod: lãi/tháng (%). Nếu không truyền thì lấy từ product.
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
            this.logger.log(`[createLoanApplication] START | clientId=${data.clientId} productId=${data.productId} principal=${data.principal} periods=${data.numberOfRepayments}`);

            const product = await this.getLoanProductDetails(data.productId);
            if (!product) {
                this.logger.error(`[createLoanApplication] Product ${data.productId} not found`);
                throw new BadRequestException(`Loan product ${data.productId} not found in Fineract`);
            }

            // Ưu tiên lãi suất từ data (user chọn), fallback product
            const productRate = product.interestRatePerPeriod ?? product.defaultInterestRatePerPeriod ?? 0;
            const interestRatePerPeriod = data.interestRatePerPeriod ?? productRate;
            const amortizationType = product.amortizationType?.id;
            const interestType = product.interestType?.id;
            const interestCalculationPeriodType = product.interestCalculationPeriodType?.id;

            this.logger.log(`[createLoanApplication] Config: rate=${interestRatePerPeriod}%/period amortization=${amortizationType} interestType=${interestType}`);

            if (interestRatePerPeriod == null || interestRatePerPeriod < 0 || !amortizationType || interestType === undefined || !interestCalculationPeriodType) {
                this.logger.error(`[createLoanApplication] Missing config: rate=${interestRatePerPeriod} amortization=${amortizationType} interestType=${interestType} calcPeriod=${interestCalculationPeriodType}`);
                throw new BadRequestException(`Loan product ${data.productId} is missing required configuration`);
            }

            const today = new Date();
            const submittedOnDate = today.toISOString().split('T')[0];
            const expectedDisbursementDate = data.expectedDisbursementDate || submittedOnDate;

            const payload = {
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
            };

            this.logger.log(`[createLoanApplication] POST /loans payload: ${JSON.stringify({ clientId: payload.clientId, principal: payload.principal, numberOfRepayments: payload.numberOfRepayments, expectedDisbursementDate: payload.expectedDisbursementDate, interestRatePerPeriod: payload.interestRatePerPeriod })}`);

            const response = await this.client.post('/loans', payload, { timeout: 60000 });

            const loanId = response.data.loanId || response.data.resourceId;
            this.logger.log(`[createLoanApplication] SUCCESS | loanId=${loanId}`);
            return loanId;
        } catch (error: any) {
            this.logger.error(`[createLoanApplication] FAILED: ${error.message}`);
            if (error.response?.data) {
                this.logger.error(`[createLoanApplication] Response: ${JSON.stringify(error.response.data)}`);
                if (error.response.data?.errors) {
                    error.response.data.errors.forEach((e: any, i: number) => {
                        this.logger.error(`[createLoanApplication] Error[${i}]: ${e.userMessageGlobalisationCode || e.defaultUserMessage || e}`);
                    });
                }
            }
            this.handleError(error, 'Failed to create loan application');
        }
    }

    /**
     * Approve a loan application (học theo p2p)
     */
    async approveLoan(loanId: number, approvedOnDate?: string): Promise<void> {
        try {
            const today = this.getTodayFormatted('iso');
            // Fineract requires: approvedOnDate <= expectedDisbursementDate
            // If caller passes disbursementDate (may be in the past), use it directly
            const finalApprovedOnDate = approvedOnDate || today;
            this.logger.log(`[approveLoan] START | loanId=${loanId} approvedOnDate=${finalApprovedOnDate}`);
            await this.client.post(`/loans/${loanId}?command=approve`, {
                approvedOnDate: finalApprovedOnDate,
                dateFormat: 'yyyy-MM-dd',
                locale: 'en',
            });
            this.logger.log(`[approveLoan] SUCCESS | loanId=${loanId}`);
        } catch (error: any) {
            if (error.response?.data?.errors?.[0]?.userMessageGlobalisationCode === 'error.msg.loan.already.approved') {
                this.logger.log(`[approveLoan] Loan ${loanId} already approved, continuing`);
                return;
            }
            this.logger.error(`[approveLoan] FAILED loanId=${loanId}: ${error.message}`);
            if (error.response?.data) this.logger.error(`[approveLoan] Response: ${JSON.stringify(error.response.data)}`);
            this.handleError(error, `Failed to approve loan ${loanId}`);
        }
    }

    /**
     * Disburse an approved loan (học theo p2p)
     */
    async disburseLoan(loanId: number, principal?: number): Promise<void> {
        try {
            const actualDisbursementDate = this.getTodayFormatted('iso');
            const payload: any = {
                actualDisbursementDate,
                dateFormat: 'yyyy-MM-dd',
                locale: 'en',
            };
            if (principal != null && principal > 0) {
                payload.transactionAmount = principal;
            }
            this.logger.log(`[disburseLoan] START | loanId=${loanId} date=${actualDisbursementDate} amount=${principal ?? '(full)'}`);
            await this.client.post(`/loans/${loanId}?command=disburse`, payload);
            this.logger.log(`[disburseLoan] SUCCESS | loanId=${loanId}`);
        } catch (error: any) {
            this.logger.error(`[disburseLoan] FAILED loanId=${loanId}: ${error.message}`);
            if (error.response?.data) this.logger.error(`[disburseLoan] Response: ${JSON.stringify(error.response.data)}`);
            this.handleError(error, `Failed to disburse loan ${loanId}`);
        }
    }

    /**
     * Get loan details with repayment schedule
     */
    async getLoanDetails(loanId: string): Promise<any> {
        try {
            const response = await this.client.get(`/loans/${loanId}?associations=repaymentSchedule,transactions`);
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
     * Get loans list filtered by status (Fineract GET /loans?status=X)
     * e.g. status 100 = Submitted and pending approval
     */
    async getLoansByStatus(status: number): Promise<any[]> {
        try {
            this.logger.log(`[getLoansByStatus] GET /loans?status=${status}`);
            const response = await this.client.get('/loans', { params: { status, limit: 1000 } });
            const items = response.data?.pageItems ?? response.data ?? [];
            this.logger.log(`[getLoansByStatus] SUCCESS | Got ${Array.isArray(items) ? items.length : 0} items`);
            return Array.isArray(items) ? items : [];
        } catch (error: any) {
            this.logger.error(`[getLoansByStatus] FAILED status ${status}: ${error.message}`);
            this.logger.warn(`Failed to get loans by status ${status}:`, error?.response?.data ?? error?.message);
            return [];
        }
    }

    /**
     * Get loans list filtered by clientId (Fineract GET /loans?clientId=X)
     */
    async getLoansByClientId(clientId: number): Promise<any[]> {
        try {
            this.logger.log(`[getLoansByClientId] GET /loans?clientId=${clientId}`);
            const response = await this.client.get('/loans', { params: { clientId, limit: 1000 } });
            const items = response.data?.pageItems ?? response.data ?? [];
            this.logger.log(`[getLoansByClientId] SUCCESS | Got ${Array.isArray(items) ? items.length : 0} items`);
            return Array.isArray(items) ? items : [];
        } catch (error: any) {
            this.logger.error(`[getLoansByClientId] FAILED clientId ${clientId}: ${error.message}`);
            this.logger.warn(`Failed to get loans by clientId ${clientId}:`, error?.response?.data ?? error?.message);
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
        await this.disburseLoan(loanId, data.principal);
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
     * Lấy danh sách mục đích vay (CodeValues) từ Fineract - LoanPurpose
     */
    async getLoanPurposeCodeValues(): Promise<Array<{ id: number; name: string; position: number }>> {
        try {
            const codesResponse = await this.client.get('/codes');
            const codes = codesResponse.data?.pageItems ?? codesResponse.data ?? [];
            const loanPurposeCode = Array.isArray(codes)
                ? codes.find((c: any) => c.name === 'LoanPurpose' || c.name === 'loanPurpose')
                : null;

            if (!loanPurposeCode) {
                this.logger.log('Code "LoanPurpose" chưa tồn tại trong Fineract');
                return [];
            }

            const codeValuesResponse = await this.client.get(`/codes/${loanPurposeCode.id}/codevalues`);
            const codeValues = codeValuesResponse.data?.pageItems ?? codeValuesResponse.data ?? [];

            return (Array.isArray(codeValues) ? codeValues : [])
                .filter((cv: any) => cv.isActive !== false)
                .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
                .map((cv: any) => ({
                    id: cv.id,
                    name: cv.name,
                    position: cv.position ?? 0,
                }));
        } catch (error: any) {
            this.logger.warn('Lỗi lấy loan purpose code values:', error?.response?.data ?? error?.message);
            return [];
        }
    }

    /**
     * Get all loan products from Fineract
     */
    async getLoanProducts(): Promise<any[]> {
        try {
            const response = await this.client.get('/loanproducts');
            const items = response.data?.pageItems ?? response.data ?? [];
            return Array.isArray(items) ? items : [];
        } catch (error: any) {
            this.handleError(error, 'Failed to get loan products list');
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

    /**
     * Upload document for a loan
     */
    async uploadDocument(loanId: number, formData: any): Promise<any> {
        try {
            this.logger.log(`[uploadDocument] START | loanId=${loanId}`);
            const response = await this.client.post(`/loans/${loanId}/documents`, formData, {
                headers: {
                    ...formData.getHeaders?.(), // if using form-data package
                },
            });
            this.logger.log(`[uploadDocument] SUCCESS | loanId=${loanId} docId=${response.data.resourceId}`);
            return response.data;
        } catch (error: any) {
            this.logger.error(`[uploadDocument] FAILED loanId=${loanId}: ${error.message}`);
            this.handleError(error, `Failed to upload document for loan ${loanId}`);
        }
    }

    /**
     * Download/Stream document content from Fineract
     */
    async downloadDocument(loanId: number, documentId: number): Promise<any> {
        try {
            this.logger.log(`[downloadDocument] START | loanId=${loanId} documentId=${documentId}`);
            const response = await this.client.get(`/loans/${loanId}/documents/${documentId}/attachment`, {
                responseType: 'arraybuffer',
            });
            return response;
        } catch (error: any) {
            this.logger.error(`[downloadDocument] FAILED loanId=${loanId} docId=${documentId}: ${error.message}`);
            this.handleError(error, `Failed to download document ${documentId}`);
        }
    }

    /**
     * Get list of documents for a loan
     */
    async getLoanDocuments(loanId: number): Promise<any[]> {
        try {
            this.logger.log(`[getLoanDocuments] START | loanId=${loanId}`);
            const response = await this.client.get(`/loans/${loanId}/documents`);
            return response.data;
        } catch (error: any) {
            this.logger.error(`[getLoanDocuments] FAILED loanId=${loanId}: ${error.message}`);
            this.handleError(error, `Failed to get documents for loan ${loanId}`);
        }
    }

    // =============================================
    // REPAYMENT Methods
    // =============================================

    /**
     * Thực hiện trả nợ theo kỳ (Repayment)
     * POST /loans/{loanId}/transactions?command=repayment
     */
    async makeRepayment(loanId: number, transactionAmount: number, transactionDate?: string, note?: string): Promise<{
        success: boolean;
        resourceId: number;
        transactionId: number;
    }> {
        try {
            const date = transactionDate || this.getTodayFormatted('iso');
            const payload = {
                dateFormat: 'yyyy-MM-dd',
                locale: 'en',
                transactionDate: date,
                transactionAmount,
                note: note || `P2P Repayment`,
            };

            this.logger.log(`[makeRepayment] START | loanId=${loanId} amount=${transactionAmount} date=${date}`);
            const response = await this.client.post(`/loans/${loanId}/transactions?command=repayment`, payload);

            const resourceId = response.data.resourceId;
            this.logger.log(`[makeRepayment] SUCCESS | loanId=${loanId} transactionId=${resourceId}`);
            return { success: true, resourceId, transactionId: resourceId };
        } catch (error: any) {
            this.logger.error(`[makeRepayment] FAILED loanId=${loanId}: ${error.message}`);
            if (error.response?.data) this.logger.error(`[makeRepayment] Response: ${JSON.stringify(error.response.data)}`);
            this.handleError(error, `Failed to make repayment for loan ${loanId}`);
        }
    }

    /**
     * Tất toán sớm (Prepay Loan) - Fineract tự đóng loan nếu outstanding = 0
     */
    async prepayLoan(loanId: number, transactionAmount: number, transactionDate?: string, note?: string): Promise<{
        success: boolean;
        resourceId: number;
        transactionId: number;
    }> {
        try {
            const date = transactionDate || this.getTodayFormatted('iso');
            this.logger.log(`[prepayLoan] START | loanId=${loanId} amount=${transactionAmount} date=${date}`);

            const result = await this.makeRepayment(loanId, transactionAmount, date, note || 'Early Repayment (Prepay) via P2P');
            this.logger.log(`[prepayLoan] SUCCESS | Fineract will auto-close loan if outstanding=0`);
            return result;
        } catch (error: any) {
            this.logger.error(`[prepayLoan] FAILED loanId=${loanId}: ${error.message}`);
            this.handleError(error, `Failed to prepay loan ${loanId}`);
        }
    }

    /**
     * Lấy số tiền cần trả để tất toán sớm
     * GET /loans/{loanId}/transactions/template?command=prepayLoan
     * Fallback: dùng outstanding balance nếu Fineract không hỗ trợ prepayLoan command
     */
    async getPrepaymentAmount(loanId: number): Promise<{
        amount: number;
        principalPortion: number;
        interestPortion: number;
        penaltyPortion: number;
        feesPortion: number;
        date: string;
    }> {
        try {
            this.logger.log(`[getPrepaymentAmount] START | loanId=${loanId}`);
            const response = await this.client.get(`/loans/${loanId}/transactions/template?command=prepayLoan`);
            const data = response.data;
            this.logger.log(`[getPrepaymentAmount] SUCCESS | amount=${data.amount}`);

            return {
                amount: data.amount || 0,
                principalPortion: data.principalPortion || 0,
                interestPortion: data.interestPortion || 0,
                penaltyPortion: data.penaltyChargesPortion || 0,
                feesPortion: data.feeChargesPortion || 0,
                date: data.date ? (Array.isArray(data.date) ? `${data.date[0]}-${String(data.date[1]).padStart(2, '0')}-${String(data.date[2]).padStart(2, '0')}` : data.date) : this.getTodayFormatted('iso'),
            };
        } catch (error: any) {
            // Fallback: dùng outstanding balance
            if (error.response?.status === 400 || error.response?.status === 404) {
                this.logger.warn(`[getPrepaymentAmount] prepayLoan command not supported, using outstanding balance`);
                try {
                    const outstanding = await this.getOutstandingBalance(loanId);
                    return {
                        amount: outstanding.totalOutstanding,
                        principalPortion: outstanding.principalOutstanding,
                        interestPortion: outstanding.interestOutstanding,
                        penaltyPortion: outstanding.penaltyOutstanding,
                        feesPortion: outstanding.feeOutstanding,
                        date: this.getTodayFormatted('iso'),
                    };
                } catch (fallbackErr: any) {
                    this.logger.error(`[getPrepaymentAmount] Fallback also failed: ${fallbackErr.message}`);
                }
            }
            this.handleError(error, `Failed to get prepayment amount for loan ${loanId}`);
        }
    }

    /**
     * Lấy dư nợ còn lại của một loan từ Fineract summary
     */
    async getOutstandingBalance(loanId: number): Promise<{
        totalOutstanding: number;
        principalOutstanding: number;
        interestOutstanding: number;
        feeOutstanding: number;
        penaltyOutstanding: number;
    }> {
        try {
            const loanDetails = await this.getLoanDetails(loanId.toString());
            const summary = loanDetails?.summary || {};

            return {
                totalOutstanding: summary.totalOutstanding || 0,
                principalOutstanding: summary.principalOutstanding || 0,
                interestOutstanding: summary.interestOutstanding || 0,
                feeOutstanding: summary.feeChargesOutstanding || 0,
                penaltyOutstanding: summary.penaltyChargesOutstanding || 0,
            };
        } catch (error: any) {
            this.logger.error(`[getOutstandingBalance] FAILED loanId=${loanId}: ${error.message}`);
            this.handleError(error, `Failed to get outstanding balance for loan ${loanId}`);
        }
    }

    /**
     * Lấy danh sách phí (charges) của loan product từ Fineract
     * Dùng để hiển thị phí động (không hardcode) cho client
     */
    async getProductCharges(productId: number): Promise<Array<{
        id: number;
        name: string;
        amount: number;
        chargeTimeType: string;
        chargeCalculationType: string;
        percentage: number | null;
    }>> {
        try {
            const product = await this.getLoanProductDetails(productId);
            const raw = product?.charges || product?.chargeOptions || [];
            const list = Array.isArray(raw) ? raw : [];

            return list.map((c: any) => {
                const chargeTime = typeof c.chargeTimeType === 'object'
                    ? (c.chargeTimeType?.value ?? c.chargeTimeType?.code ?? '')
                    : (c.chargeTimeType || '');
                const calcType = typeof c.chargeCalculationType === 'object'
                    ? (c.chargeCalculationType?.value ?? c.chargeCalculationType?.code ?? '')
                    : (c.chargeCalculationType || '');

                return {
                    id: c.id ?? c.chargeId,
                    name: c.name || 'Phí',
                    amount: c.amount != null ? Number(c.amount) : 0,
                    chargeTimeType: String(chargeTime),
                    chargeCalculationType: String(calcType),
                    percentage: c.percentage != null ? Number(c.percentage) : null,
                };
            }).filter((c: any) => c.id != null);
        } catch (error: any) {
            this.logger.warn(`[getProductCharges] Failed for product ${productId}: ${error.message}`);
            return [];
        }
    }

    /**
     * Lấy danh sách charges đã áp dụng trên một loan cụ thể
     * (charges thực tế, không phải template)
     */
    async getLoanCharges(loanId: number): Promise<any[]> {
        try {
            const response = await this.client.get(`/loans/${loanId}/charges`);
            return response.data || [];
        } catch (error: any) {
            this.logger.warn(`[getLoanCharges] Failed for loan ${loanId}: ${error.message}`);
            return [];
        }
    }
}
