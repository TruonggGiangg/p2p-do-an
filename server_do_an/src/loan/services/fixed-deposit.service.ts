import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FineractService } from './fineract.service';
import { InterestRateCalculatorService } from './interest-rate-calculator.service';
import moment from 'moment-timezone';

/**
 * Service quản lý Fixed Deposit accounts trên Fineract
 * 
 * Mỗi investment tạo 1 FD account riêng để tích lũy lãi
 * FD rate = lenderRate (borrowerRate - 3% admin spread)
 */
@Injectable()
export class FixedDepositService {
    private readonly logger = new Logger(FixedDepositService.name);

    constructor(
        private readonly fineractService: FineractService,
        private readonly configService: ConfigService,
        private readonly interestRateCalculator: InterestRateCalculatorService,
    ) { }

    /**
     * Helper: Get Fineract httpService for direct HTTP calls
     */
    private get httpService() {
        return this.fineractService['httpService'];
    }

    /**
     * Helper: Get Fineract base URL
     */
    private get baseUrl() {
        return this.fineractService['baseUrl'];
    }

    /**
     * Helper: Get headers for Fineract API calls
     */
    private async getHeaders() {
        return await this.fineractService['getHeaders']();
    }

    /**
     * Tạo Fixed Deposit account cho lender
     * 
     * @param params - Thông tin đầu tư và khoản vay
     * @returns FD account details
     */
    async createFixedDepositForLender(params: {
        investmentContract: any;
        loanContract: any;
        capitalAmount: number;
        lenderFineractClientId: number | string;
        investmentSavingsAccountId?: number;
    }) {
        const {
            investmentContract,
            loanContract,
            capitalAmount,
            lenderFineractClientId,
            investmentSavingsAccountId
        } = params;

        this.logger.log(`[createFixedDepositForLender] Creating FD for investment ${investmentContract.contractId}`);

        // Lấy thông tin loan
        const borrowerInterestRate = loanContract.info?.rate || loanContract.borrowerInterestRate;
        const periodMonth = loanContract.info?.periodMonth || 12;
        const creditScore = loanContract.creditScore || 500;

        // Tính lãi suất dynamic
        const rates = this.interestRateCalculator.calculateRates(
            loanContract.info.capital,
            periodMonth,
            creditScore
        );

        const borrowerRate = rates.annualBorrowerRate;
        const lenderRate = rates.annualLenderRate;
        const spread = rates.annualSpread;

        this.logger.log(`[createFixedDepositForLender] Dynamic rates: Borrower ${borrowerRate}%, Lender ${lenderRate}%, Spread ${spread}%`);

        // Tính ngày đáo hạn
        const disbursementDate = loanContract.disburse_date || loanContract.info?.disbursementDate || new Date();
        const maturityDate = moment(disbursementDate).add(periodMonth, 'months').toDate();

        // Lấy FD product ID từ config
        const fdProductId = this.configService.get<number>('FINERACT_FD_PRODUCT_ID');
        if (!fdProductId) {
            throw new Error('FINERACT_FD_PRODUCT_ID not configured');
        }

        try {
            // Tạo FD account trên Fineract
            // ✅ Pass charts explicitly to bypass Product Interest Chart validation issues
            const validFromDate = moment.utc().format('D MMMM YYYY');

            // ✅ RECONCILIATION: Generate External ID to match Reference Project pattern
            // Format: FD_LOAN_{fineractLoanId}_INV_{contractId}
            const fineractLoanId = loanContract.fineractLoanId || loanContract.contractId;
            const externalId = `FD_LOAN_${fineractLoanId}_INV_${investmentContract.contractId}`;
            this.logger.log(`[createFixedDepositForLender] Generated External ID: ${externalId}`);

            const fdPayload = {
                clientId: lenderFineractClientId,
                productId: Number(fdProductId),
                submittedOnDate: validFromDate,
                depositAmount: capitalAmount,
                depositPeriod: periodMonth,
                depositPeriodFrequencyId: 2, // Months
                locale: 'en',
                dateFormat: 'dd MMMM yyyy',
                linkAccountId: investmentSavingsAccountId, // Auto-debit from Linked Savings
                externalId: externalId, // ✅ Saving Reconciliation Data
                // ✅ Add inline chart with explicit interest rate
                charts: [
                    {
                        fromDate: validFromDate,
                        dateFormat: 'dd MMMM yyyy',
                        locale: 'en',
                        chartSlabs: [
                            {
                                periodType: 2, // Months
                                fromPeriod: 1,
                                toPeriod: 60,
                                annualInterestRate: lenderRate, // Dynamic rate based on credit score
                            }
                        ]
                    }
                ]
            };

            this.logger.debug(`[createFixedDepositForLender] FD Payload:`, JSON.stringify(fdPayload, null, 2));

            // Create FD account
            const headers = await this.getHeaders();
            const fdResponseData = await this.httpService.post(
                `${this.baseUrl}/fineract-provider/api/v1/fixeddepositaccounts`,
                fdPayload,
                { headers }
            ).toPromise();

            const fdResponse = fdResponseData?.data || fdResponseData;
            const fdAccountId = fdResponse?.savingsId || fdResponse?.resourceId;

            if (!fdAccountId) {
                throw new Error('Failed to get FD account ID from Fineract response');
            }

            this.logger.log(`[createFixedDepositForLender] FD Account created: ${fdAccountId}`);

            // Approve FD
            await this.approveFD(fdAccountId);

            // Activate FD
            await this.activateFD(fdAccountId);

            return {
                fdAccountId,
                fdRate: lenderRate,
                borrowerRate,
                spread,
                maturityDate,
                capitalAmount
            };

        } catch (error) {
            this.logger.error(`[createFixedDepositForLender] Failed to create FD:`, error.message);
            // ✅ Log Fineract error response details
            if (error.response?.data) {
                this.logger.error(`[createFixedDepositForLender] Fineract Error Details:`, JSON.stringify(error.response.data, null, 2));
            }
            this.logger.error(`[createFixedDepositForLender] Stack:`, error.stack);
            throw error;
        }
    }

    /**
     * Approve Fixed Deposit account
     */
    private async approveFD(fdAccountId: number) {
        try {
            const headers = await this.getHeaders();
            await this.httpService.post(
                `${this.baseUrl}/fineract-provider/api/v1/fixeddepositaccounts/${fdAccountId}?command=approve`,
                {
                    approvedOnDate: moment.utc().format('D MMMM YYYY'),
                    locale: 'en',
                    dateFormat: 'dd MMMM yyyy'
                },
                { headers }
            ).toPromise();
            this.logger.log(`[approveFD] FD ${fdAccountId} approved`);
        } catch (error) {
            this.logger.error(`[approveFD] Failed to approve FD ${fdAccountId}:`, error.message);
            throw error;
        }
    }

    /**
     * Activate Fixed Deposit account
     */
    private async activateFD(fdAccountId: number) {
        try {
            const headers = await this.getHeaders();
            await this.httpService.post(
                `${this.baseUrl}/fineract-provider/api/v1/fixeddepositaccounts/${fdAccountId}?command=activate`,
                {
                    activatedOnDate: moment.utc().format('D MMMM YYYY'),
                    locale: 'en',
                    dateFormat: 'dd MMMM yyyy'
                },
                { headers }
            ).toPromise();
            this.logger.log(`[activateFD] FD ${fdAccountId} activated`);
        } catch (error) {
            this.logger.error(`[activateFD] Failed to activate FD ${fdAccountId}:`, error.message);
            throw error;
        }
    }

    /**
     * Post interest vào Fixed Deposit account
     * 
     * @param fdAccountId - FD account ID
     * @param amount - Số tiền lãi
     */
    async postInterestToFD(fdAccountId: number, amount: number) {
        try {
            const headers = await this.getHeaders();
            await this.httpService.post(
                `${this.baseUrl}/fineract-provider/api/v1/fixeddepositaccounts/${fdAccountId}/transactions?command=deposit`,
                {
                    transactionDate: moment.utc().format('D MMMM YYYY'),
                    transactionAmount: amount,
                    paymentTypeId: 1, // Cash
                    locale: 'en',
                    dateFormat: 'dd MMMM yyyy'
                },
                { headers }
            ).toPromise();

            this.logger.log(`[postInterestToFD] Posted ${amount} VND interest to FD ${fdAccountId}`);
        } catch (error) {
            this.logger.error(`[postInterestToFD] Failed to post interest to FD ${fdAccountId}:`, error.message);
            throw error;
        }
    }

    /**
     * Đóng FD sớm (premature close)
     * 
     * @param fdAccountId - FD account ID
     * @param closureDate - Ngày đóng
     */
    async prematureCloseFD(fdAccountId: number, closureDate?: Date) {
        try {
            const closeDate = closureDate || new Date();

            const headers = await this.getHeaders();
            await this.httpService.post(
                `${this.baseUrl}/fineract-provider/api/v1/fixeddepositaccounts/${fdAccountId}?command=prematureClose`,
                {
                    closedOnDate: moment.utc(closeDate).format('D MMMM YYYY'),
                    locale: 'en',
                    dateFormat: 'dd MMMM yyyy'
                },
                { headers }
            ).toPromise();

            this.logger.log(`[prematureCloseFD] FD ${fdAccountId} closed prematurely`);
        } catch (error) {
            this.logger.error(`[prematureCloseFD] Failed to close FD ${fdAccountId}:`, error.message);
            throw error;
        }
    }

    /**
     * Chuyển tiền từ FD về tài khoản chính của lender
     * 
     * @param fdAccountId - FD account ID
     * @param toAccountId - Tài khoản đích (lender main account)
     * @param amount - Số tiền chuyển
     */
    async transferFDToMainAccount(fdAccountId: number, toAccountId: number, amount: number) {
        try {
            const headers = await this.getHeaders();
            await this.httpService.post(
                `${this.baseUrl}/fineract-provider/api/v1/accounttransfers`,
                {
                    fromOfficeId: 1,
                    fromClientId: null,
                    fromAccountType: 3, // Fixed Deposit
                    fromAccountId: fdAccountId,
                    toOfficeId: 1,
                    toClientId: null,
                    toAccountType: 1, // Savings
                    toAccountId: toAccountId,
                    transferDate: moment.utc().format('D MMMM YYYY'),
                    transferAmount: amount,
                    transferDescription: `Transfer from FD ${fdAccountId} to main account`,
                    locale: 'en',
                    dateFormat: 'dd MMMM yyyy'
                },
                { headers }
            ).toPromise();

            this.logger.log(`[transferFDToMainAccount] Transferred ${amount} VND from FD ${fdAccountId} to account ${toAccountId}`);
        } catch (error) {
            this.logger.error(`[transferFDToMainAccount] Failed to transfer from FD ${fdAccountId}:`, error.message);
            throw error;
        }
    }

    /**
     * Lấy thông tin chi tiết FD account
     * 
     * @param fdAccountId - FD account ID
     * @returns FD account details
     */
    async getFDAccountDetails(fdAccountId: number) {
        try {
            const headers = await this.getHeaders();
            const fdResponseData = await this.httpService.get(
                `${this.baseUrl}/fixeddepositaccounts/${fdAccountId}`,
                { headers }
            ).toPromise();

            const fdAccount = fdResponseData?.data || fdResponseData;

            return {
                id: fdAccount.id,
                accountNo: fdAccount.accountNo,
                accountBalance: fdAccount.accountBalance || 0,
                totalInterestEarned: fdAccount.summary?.totalInterestEarned || 0,
                nominalAnnualInterestRate: fdAccount.nominalAnnualInterestRate,
                depositAmount: fdAccount.depositAmount,
                maturityDate: fdAccount.maturityDate,
                status: fdAccount.status?.value,
                currency: fdAccount.currency?.code
            };
        } catch (error) {
            this.logger.error(`[getFDAccountDetails] Failed to get FD ${fdAccountId} details:`, error.message);
            throw error;
        }
    }

    /**
     * Kiểm tra xem có bật Fixed Deposit flow không
     */
    /**
     * Rút tiền từ FD về Escrow (khi giải ngân)
     */
    async withdrawToEscrow(fdAccountId: number, amount: number) {
        try {
            const escrowAccountId = this.fineractService.getEscrowAccountId();
            const adminClientId = this.fineractService.getAdminClientId();

            this.logger.log(`[withdrawToEscrow] Transferring ${amount} from FD ${fdAccountId} to Escrow ${escrowAccountId}`);

            const headers = await this.getHeaders();
            const response = await this.httpService.post(
                `${this.baseUrl}/fineract-provider/api/v1/accounttransfers`,
                {
                    fromOfficeId: 1,
                    fromClientId: null, // FD owner (System/Lender?) - Try null for admin initiated
                    fromAccountType: 3, // Fixed Deposit
                    fromAccountId: fdAccountId,
                    toOfficeId: 1,
                    toClientId: adminClientId,
                    toAccountType: 1, // Savings
                    toAccountId: escrowAccountId,
                    transferDate: moment.utc().format('D MMMM YYYY'),
                    transferAmount: amount,
                    transferDescription: `Disbursement transfer from FD ${fdAccountId}`,
                    locale: 'en',
                    dateFormat: 'dd MMMM yyyy'
                },
                { headers }
            ).toPromise();

            this.logger.log(`[withdrawToEscrow] Success: ${response?.data?.resourceId}`);
            return response?.data;
        } catch (error) {
            this.logger.error(`[withdrawToEscrow] Failed: ${error.message}`);
            // Log detail logic if needed
            throw error;
        }
    }
}
