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
            const fdPayload = {
                clientId: lenderFineractClientId,
                productId: fdProductId,
                submittedOnDate: moment().format('DD MMMM YYYY'),
                depositAmount: capitalAmount,
                depositPeriod: periodMonth,
                depositPeriodFrequencyId: 2, // Months
                interestCompoundingPeriodType: 1, // Daily
                interestPostingPeriodType: 4, // Monthly
                interestCalculationType: 1, // Daily Balance
                interestCalculationDaysInYearType: 365, // 365 days
                nominalAnnualInterestRate: lenderRate, // Lãi suất lender
                locale: 'en',
                dateFormat: 'DD MMMM YYYY',
                expectedFirstDepositOnDate: moment().format('DD MMMM YYYY'),
                transferInterestToSavings: investmentSavingsAccountId ? true : false,
                ...(investmentSavingsAccountId && {
                    linkAccountId: investmentSavingsAccountId
                })
            };

            this.logger.debug(`[createFixedDepositForLender] FD Payload:`, JSON.stringify(fdPayload, null, 2));

            // Create FD account
            const headers = await this.getHeaders();
            const fdResponseData = await this.httpService.post(
                `${this.baseUrl}/fixeddepositaccounts`,
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
                `${this.baseUrl}/fixeddepositaccounts/${fdAccountId}?command=approve`,
                {
                    approvedOnDate: moment().format('DD MMMM YYYY'),
                    locale: 'en',
                    dateFormat: 'DD MMMM YYYY'
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
                `${this.baseUrl}/fixeddepositaccounts/${fdAccountId}?command=activate`,
                {
                    activatedOnDate: moment().format('DD MMMM YYYY'),
                    locale: 'en',
                    dateFormat: 'DD MMMM YYYY'
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
                `${this.baseUrl}/fixeddepositaccounts/${fdAccountId}/transactions?command=deposit`,
                {
                    transactionDate: moment().format('DD MMMM YYYY'),
                    transactionAmount: amount,
                    paymentTypeId: 1, // Cash
                    locale: 'en',
                    dateFormat: 'DD MMMM YYYY'
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
                `${this.baseUrl}/fixeddepositaccounts/${fdAccountId}?command=prematureClose`,
                {
                    closedOnDate: moment(closeDate).format('DD MMMM YYYY'),
                    locale: 'en',
                    dateFormat: 'DD MMMM YYYY'
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
                `${this.baseUrl}/accounttransfers`,
                {
                    fromOfficeId: 1,
                    fromClientId: null,
                    fromAccountType: 3, // Fixed Deposit
                    fromAccountId: fdAccountId,
                    toOfficeId: 1,
                    toClientId: null,
                    toAccountType: 1, // Savings
                    toAccountId: toAccountId,
                    transferDate: moment().format('DD MMMM YYYY'),
                    transferAmount: amount,
                    transferDescription: `Transfer from FD ${fdAccountId} to main account`,
                    locale: 'en',
                    dateFormat: 'DD MMMM YYYY'
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
    isFixedDepositFlowEnabled(): boolean {
        return this.configService.get<boolean>('ENABLE_FIXED_DEPOSIT_FLOW') === true ||
            this.configService.get<string>('ENABLE_FIXED_DEPOSIT_FLOW') === 'true';
    }
}
