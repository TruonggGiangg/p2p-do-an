import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * Fineract Loan Product details
 */
interface LoanProductDetails {
    id: number;
    name: string;
    shortName: string;
    interestRatePerPeriod: number;           // Lãi suất mỗi kỳ (tháng)
    annualInterestRate?: number;             // Add for type safety
    interestRateFrequencyType: {
        id: number;
        code: string;
        value: string;                          // 'Per Month', 'Per Year'
    };
    interestType: {
        id: number;
        code: string;
        value: string;                          // 'Flat', 'Declining Balance'
    };
    interestCalculationPeriodType: {
        id: number;
        code: string;
        value: string;
    };
    amortizationType: {
        id: number;
        code: string;
        value: string;
    };
    minPrincipal?: number;
    maxPrincipal?: number;
    principal?: number;
    minNumberOfRepayments?: number;
    maxNumberOfRepayments?: number;
    numberOfRepayments?: number;
    repaymentEvery?: number;
    repaymentFrequencyType?: {
        id: number;
        code: string;
        value: string;
    };
    currency?: {
        code: string;
        name: string;
        displaySymbol: string;
        decimalPlaces?: number;
        inMultiplesOf?: number;
    };
}

/**
 * Loan application creation data
 */
interface CreateLoanData {
    capital: number;
    periodMonth: number;
    rate?: number;                            // Optional - will use product rate if not provided
    disbursementDate: string;
    willing: string;
    contractId: string;
}

/**
 * Loan creation response from Fineract
 */
interface CreateLoanResponse {
    fineractLoanId: number;
    status: string;
}

/**
 * Outstanding balance response
 */
interface OutstandingBalance {
    totalOutstanding: number;
    principalOutstanding: number;
    interestOutstanding: number;
    feeChargesOutstanding: number;
    penaltyChargesOutstanding: number;
    totalPaid: number;
    totalRepaymentExpected: number;
}

@Injectable()
export class FineractService {
    private readonly logger = new Logger(FineractService.name);

    private readonly baseUrl: string;
    private readonly tenantId: string;
    private readonly username: string;
    private readonly password: string;
    private readonly loanProductId: number;
    private readonly oauthClientId: string;
    private readonly oauthClientSecret: string;
    private readonly keycloakUrl: string;
    private readonly adminClientId: number;
    private readonly escrowAccountId: number;

    private accessToken: string | null = null;
    private tokenExpiry: Date | null = null;

    // Cached loan product details
    private cachedLoanProduct: LoanProductDetails | null = null;
    private productCacheExpiry: Date | null = null;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.baseUrl = this.configService.get<string>('FINERACT_BASE_URL') || 'http://localhost:8080';
        this.tenantId = this.configService.get<string>('FINERACT_TENANT_ID') || 'default';
        this.username = this.configService.get<string>('FINERACT_USERNAME') || 'mifos';
        this.password = this.configService.get<string>('FINERACT_PASSWORD') || 'password';
        this.loanProductId = this.configService.get<number>('FINERACT_P2P_LOAN_PRODUCT_ID') || 1;
        this.oauthClientId = this.configService.get<string>('FINERACT_OAUTH_CLIENT_ID') || 'community-app';
        this.oauthClientSecret = this.configService.get<string>('FINERACT_OAUTH_CLIENT_SECRET') || '123';
        // Keycloak URL for OAuth2 token
        this.keycloakUrl = this.configService.get<string>('KEYCLOAK_BASE_URL') || 'http://118.69.41.95:9000';
        // Admin/Escrow config for transfers
        this.adminClientId = this.configService.get<number>('FINERACT_ADMIN_CLIENT_ID') || 1;
        this.escrowAccountId = this.configService.get<number>('FINERACT_ESCROW_ACCOUNT_ID') || 1;
    }



    /**
     * Check if Fineract integration is enabled
     */
    isFineractEnabled(): boolean {
        return this.configService.get<string>('FINERACT_ENABLED') === 'true';
    }

    /**
     * Check if loan creation on Fineract is enabled
     */
    isLoanCreationEnabled(): boolean {
        return this.configService.get<string>('FINERACT_LOAN_CREATION') === 'true';
    }

    /**
     * Get OAuth2 access token from Keycloak (for Fineract API access)
     * Token is obtained from Keycloak realm 'fineract', NOT from Fineract itself
     */
    private async getOAuth2Token(): Promise<string> {
        // Return cached token if valid
        if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
            return this.accessToken;
        }

        try {
            // Use Keycloak token endpoint for realm 'fineract'
            const tokenUrl = `${this.keycloakUrl}/realms/fineract/protocol/openid-connect/token`;

            const params = new URLSearchParams();
            params.append('grant_type', 'password');
            params.append('client_id', this.oauthClientId);
            params.append('client_secret', this.oauthClientSecret);
            params.append('username', this.username);
            params.append('password', this.password);

            this.logger.log(`Getting OAuth2 token from Keycloak: ${tokenUrl}`);

            const response = await firstValueFrom(
                this.httpService.post(tokenUrl, params.toString(), {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    timeout: 15000,
                }),
            );

            this.accessToken = response.data.access_token;
            // Set expiry to 60 seconds before actual expiry
            const expiresIn = (response.data.expires_in || 3600) - 60;
            this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);

            this.logger.log('OAuth2 token obtained successfully from Keycloak');
            return this.accessToken as string;

        } catch (error: any) {
            this.logger.error(`Failed to get OAuth2 token from Keycloak: ${error.message}`);
            if (error.response?.data) {
                this.logger.error(`Keycloak error: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }


    /**
     * Get default headers for Fineract API calls
     */
    private async getHeaders(): Promise<Record<string, string>> {
        const token = await this.getOAuth2Token();
        return {
            'Authorization': `Bearer ${token}`,
            'Fineract-Platform-TenantId': this.tenantId,
            'Content-Type': 'application/json',
        };
    }

    // ================ LOAN PRODUCT METHODS ================

    /**
     * Get Loan Product details from Fineract
     * This is the PRIMARY source of interest rates
     */
    async getLoanProductDetails(): Promise<LoanProductDetails> {
        // Return cached product if valid (cache for 1 hour)
        if (this.cachedLoanProduct && this.productCacheExpiry && new Date() < this.productCacheExpiry) {
            return this.cachedLoanProduct;
        }

        try {
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/loanproducts/${this.loanProductId}?template=false`;

            const response = await firstValueFrom(
                this.httpService.get(url, { headers }),
            );

            // Cache the product details for 1 hour
            this.cachedLoanProduct = response.data;
            this.productCacheExpiry = new Date(Date.now() + 3600 * 1000);

            this.logger.log(`Loan product ${this.loanProductId} loaded: ${response.data.name}`);
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to get loan product: ${error}`);
            throw error;
        }
    }

    /**
     * Get interest rate from Fineract Loan Product
     * Returns rate per period (usually monthly)
     */
    async getInterestRateFromProduct(): Promise<{
        rate: number;
        rateType: string;
        interestType: string;
        amortizationType: string;
    }> {
        const product = await this.getLoanProductDetails();

        return {
            rate: product.interestRatePerPeriod,
            rateType: product.interestRateFrequencyType?.value || 'Per Month',
            interestType: product.interestType?.value || 'Flat',
            amortizationType: product.amortizationType?.value || 'Equal Installments',
        };
    }

    /**
     * Calculate loan schedule using Fineract Loan Product rate
     * Uses rate from product, calculates payments locally
     */
    async calculateLoanSchedule(capital: number, periodMonth: number): Promise<{
        rate: number;
        annualRate: number;
        monthlyPrincipalPay: number;
        monthlyInterestPay: number;
        monthlyPay: number;
        entirelyPay: number;
        interestType: string;
    }> {
        // Get full product details to access currency config
        const product = await this.getLoanProductDetails();

        const monthlyRate = product.interestRatePerPeriod;
        const annualRate = product.annualInterestRate || (monthlyRate * 12);
        const interestType = product.interestType?.value || 'Flat';

        // Get rounding config from Product Currency (default to 1 if missing)
        const inMultiplesOf = product.currency?.inMultiplesOf || 1;

        this.logger.log(`[calculateLoanSchedule] START: Capital=${capital}, Months=${periodMonth}`);
        this.logger.log(`[calculateLoanSchedule] Product Config: Rate=${monthlyRate}%, InterestType=${interestType}`);
        this.logger.log(`[calculateLoanSchedule] Rounding Rule: Multiples of ${inMultiplesOf}`);

        // Helper: Dynamic Rounding based on Config with LOGGING
        const roundToCurrency = (val: number, context: string) => {
            let res = val;
            if (inMultiplesOf > 0) {
                res = Math.round(val / inMultiplesOf) * inMultiplesOf;
            } else {
                res = Math.round(val);
            }
            // Log detail (Verbose)
            // this.logger.log(`[Rounding] ${context}: ${val.toFixed(2)} => ${res}`);
            return res;
        };

        // Calculate based on interest type
        let monthlyPrincipalPay: number;
        let monthlyInterestPay: number;
        let monthlyPay: number;
        let entirelyPay: number;

        if (interestType === 'Declining Balance' || product.interestType?.code === 'interestType.declining.balance') {
            // DECLINING BALANCE
            const r = monthlyRate / 100;
            if (r > 0) {
                // Calculate EMI first: P * r * (1+r)^n / ((1+r)^n - 1)
                const rawEmi = capital * r * Math.pow(1 + r, periodMonth) / (Math.pow(1 + r, periodMonth) - 1);
                monthlyPay = roundToCurrency(rawEmi, 'Monthly EMI (Declining)');
            } else {
                monthlyPay = roundToCurrency(capital / periodMonth, 'Monthly EMI (Zero Interest)');
            }

            // SIMULATE SCHEDULE TO GET EXACT TOTAL (MATCHING FINERACT)
            this.logger.log(`[calculateLoanSchedule] Simulating schedule to match Fineract...`);
            let outstanding = capital;
            let totalPaid = 0;

            for (let i = 1; i <= periodMonth; i++) {
                // Interest for this period on outstanding balance
                const interest = roundToCurrency(outstanding * r, `Interest P${i}`);
                let principal = 0;
                let payment = 0;

                if (i < periodMonth) {
                    // Standard month
                    payment = monthlyPay;
                    // Principal is whatever is left after interest
                    principal = payment - interest;
                } else {
                    // Last month: Pay off remaining principal + interest
                    principal = outstanding;
                    payment = principal + interest;
                    this.logger.log(`[calculateLoanSchedule] Last Payment Adjustment: Principal=${principal}, Interest=${interest}, Total=${payment}`);
                }

                outstanding -= principal;
                totalPaid += payment;
            }

            entirelyPay = totalPaid; // Exact sum of all payments

            // For simplified display: Use "Average Principal" approarch or first month?
            // User UI usually expects a representative split.
            monthlyPrincipalPay = roundToCurrency(capital / periodMonth, 'Avg Principal');
            monthlyInterestPay = monthlyPay - monthlyPrincipalPay;

            this.logger.log(`[Rounding] Interest (Derived): ${monthlyPay} - ${monthlyPrincipalPay} = ${monthlyInterestPay}`);

        } else {
            // FLAT interest (Default)
            monthlyPrincipalPay = roundToCurrency(capital / periodMonth, 'Principal (Flat)');
            monthlyInterestPay = roundToCurrency(capital * monthlyRate / 100, 'Interest (Flat)');

            monthlyPay = monthlyPrincipalPay + monthlyInterestPay;
            entirelyPay = monthlyPay * periodMonth;
        }

        this.logger.log(`[calculateLoanSchedule] RESULT: Monthly=${monthlyPay}, Total=${entirelyPay}`);

        return {
            rate: monthlyRate,
            annualRate,
            monthlyPrincipalPay,
            monthlyInterestPay,
            monthlyPay,
            entirelyPay,
            interestType: interestType,
        };
    }

    // ================ LOAN APPLICATION METHODS ================

    /**
     * Create loan application on Fineract
     * Uses rate from Loan Product (not custom rate)
     */
    async createLoanApplication(
        borrowerClientId: number | string,
        loanData: CreateLoanData,
    ): Promise<CreateLoanResponse> {
        if (!this.isFineractEnabled() || !this.isLoanCreationEnabled()) {
            this.logger.warn('Fineract loan creation is disabled');
            return { fineractLoanId: 0, status: 'DISABLED' };
        }

        try {
            const headers = await this.getHeaders();

            // Get rate from loan product (not from input)
            const product = await this.getLoanProductDetails();

            // DEBUG: Log Loan Product settings
            this.logger.log(`========== CREATE LOAN APPLICATION DEBUG ==========`);
            this.logger.log(`[createLoanApplication] Loan Product ID: ${this.loanProductId}`);
            this.logger.log(`[createLoanApplication] Product Name: ${product.name}`);
            this.logger.log(`[createLoanApplication] Product Settings from Fineract:`);
            this.logger.log(`  - interestRatePerPeriod: ${product.interestRatePerPeriod}%`);
            this.logger.log(`  - interestType: ${product.interestType?.id} (${product.interestType?.value})`);
            this.logger.log(`  - amortizationType: ${product.amortizationType?.id} (${product.amortizationType?.value})`);
            this.logger.log(`  - interestCalculationPeriodType: ${product.interestCalculationPeriodType?.id} (${product.interestCalculationPeriodType?.value})`);
            this.logger.log(`====================================================`);

            // Parse disbursement date
            const disbDate = new Date(loanData.disbursementDate);
            const submittedDate = [disbDate.getFullYear(), disbDate.getMonth() + 1, disbDate.getDate()];
            const expectedDisbursementDate = submittedDate;

            const payload = {
                clientId: Number(borrowerClientId),
                productId: this.loanProductId,
                principal: loanData.capital,
                loanTermFrequency: loanData.periodMonth,
                loanTermFrequencyType: 2, // 2 = Months
                numberOfRepayments: loanData.periodMonth,
                repaymentEvery: 1,
                repaymentFrequencyType: 2, // 2 = Months
                // Use rate from product - this is key!
                interestRatePerPeriod: product.interestRatePerPeriod,
                amortizationType: product.amortizationType?.id,
                interestType: product.interestType?.id,
                interestCalculationPeriodType: product.interestCalculationPeriodType?.id,
                transactionProcessingStrategyCode: 'mifos-standard-strategy',
                dateFormat: 'yyyy-MM-dd',
                locale: 'en',
                submittedOnDate: new Date().toISOString().split('T')[0],
                expectedDisbursementDate: `${disbDate.getFullYear()}-${String(disbDate.getMonth() + 1).padStart(2, '0')}-${String(disbDate.getDate()).padStart(2, '0')}`,
                loanType: 'individual',
                externalId: loanData.contractId,
            };

            this.logger.log(`[createLoanApplication] Payload interestType: ${payload.interestType}`);
            this.logger.log(`[createLoanApplication] Payload amortizationType: ${payload.amortizationType}`);

            const url = `${this.baseUrl}/fineract-provider/api/v1/loans`;
            const response = await firstValueFrom(
                this.httpService.post(url, payload, { headers }),
            );

            this.logger.log(`[createLoanApplication] ✅ Loan created: ${response.data.loanId}`);

            return {
                fineractLoanId: response.data.loanId,
                status: 'SUBMITTED_AND_PENDING_APPROVAL',
            };
        } catch (error) {
            this.logger.error(`Failed to create Fineract loan: ${error}`);
            if (error.response?.data) {
                this.logger.error(`Fineract error: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /**
     * Get loan details from Fineract
     */
    async getLoanDetails(loanId: number): Promise<any> {
        try {
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/loans/${loanId}?associations=all&exclude=guarantors,futureSchedule`;

            const response = await firstValueFrom(
                this.httpService.get(url, { headers }),
            );

            return response.data;
        } catch (error) {
            this.logger.error(`Failed to get loan details: ${error}`);
            throw error;
        }
    }

    /**
     * Get outstanding balance
     */
    async getOutstandingBalance(loanId: number): Promise<OutstandingBalance> {
        const details = await this.getLoanDetails(loanId);
        const summary = details.summary || {};

        this.logger.log(`[getOutstandingBalance] DEBUG Loan ${loanId} Full Status:`, JSON.stringify(details.status));
        this.logger.log(`[getOutstandingBalance] DEBUG Loan ${loanId} Summary:`, JSON.stringify(summary));

        return {
            totalOutstanding: summary.totalOutstanding || 0,
            principalOutstanding: summary.principalOutstanding || 0,
            interestOutstanding: summary.interestOutstanding || 0,
            feeChargesOutstanding: summary.feeChargesOutstanding || 0,
            penaltyChargesOutstanding: summary.penaltyChargesOutstanding || 0,
            totalPaid: summary.totalRepayment || 0,
            totalRepaymentExpected: summary.totalExpectedRepayment || 0,
        };
    }

    /**
     * Get repayment schedule from Fineract
     */
    async getRepaymentSchedule(loanId: number): Promise<any[]> {
        const loan = await this.getLoanDetails(loanId);
        return loan.repaymentSchedule?.periods || [];
    }

    /**
     * Get Loans list with criteria
     */
    async getLoans(params: any = {}): Promise<any> {
        try {
            const headers = await this.getHeaders();
            const { offset = 0, limit = 100, orderBy = 'id', sortOrder = 'DESC', sqlSearch, clientId } = params;

            let url = `${this.baseUrl}/fineract-provider/api/v1/loans?offset=${offset}&limit=${limit}&orderBy=${orderBy}&sortOrder=${sortOrder}`;
            if (clientId) {
                // Fineract allows filtering by clientId directly via sqlSearch or specific param if supported.
                // Standard Fineract /loans supports sqlSearch. 
                // Let's try appending to sqlSearch or using a direct param if supported version.
                // Safest for lists is often sqlSearch for flexibility, or just check documentation.
                // Assuming standard Fineract 1.x: sqlSearch is robust.
                const clientFilter = `l.client_id = ${clientId}`;
                url += sqlSearch ? `&sqlSearch=${sqlSearch} AND ${clientFilter}` : `&sqlSearch=${clientFilter}`;
            } else if (sqlSearch) {
                url += `&sqlSearch=${sqlSearch}`;
            }

            console.log(`[FineractService] Fetching loans: ${url}`);
            const response = await firstValueFrom(
                this.httpService.get(url, { headers }),
            );

            return response.data;
        } catch (error) {
            this.logger.error(`Failed to get loans list: ${error}`);
            throw error;
        }
    }

    // ================ LOAN LIFECYCLE METHODS ================

    /**
     * Approve loan
     */
    async approveLoan(loanId: number, approvedOnDate?: string): Promise<any> {
        try {
            const headers = await this.getHeaders();
            const date = approvedOnDate || new Date().toISOString().split('T')[0];

            const payload = {
                approvedOnDate: date,
                dateFormat: 'yyyy-MM-dd',
                locale: 'en',
            };

            const url = `${this.baseUrl}/fineract-provider/api/v1/loans/${loanId}?command=approve`;
            const response = await firstValueFrom(
                this.httpService.post(url, payload, { headers }),
            );

            this.logger.log(`Loan ${loanId} approved`);
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to approve loan: ${error}`);
            throw error;
        }
    }

    /**
     * Disburse loan
     */
    async disburseLoan(loanId: number, disbursedOnDate?: string): Promise<any> {
        try {
            const headers = await this.getHeaders();
            const date = disbursedOnDate || new Date().toISOString().split('T')[0];

            const payload = {
                actualDisbursementDate: date,
                dateFormat: 'yyyy-MM-dd',
                locale: 'en',
            };

            const url = `${this.baseUrl}/fineract-provider/api/v1/loans/${loanId}?command=disburse`;
            const response = await firstValueFrom(
                this.httpService.post(url, payload, { headers }),
            );

            this.logger.log(`Loan ${loanId} disbursed`);
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to disburse loan: ${error}`);
            throw error;
        }
    }

    /**
     * Make repayment
     */
    async makeRepayment(loanId: number, amount: number, transactionDate?: string, note?: string): Promise<any> {
        try {
            const headers = await this.getHeaders();
            const date = transactionDate || new Date().toISOString().split('T')[0];

            const payload = {
                transactionAmount: amount,
                transactionDate: date,
                paymentTypeId: 1,
                dateFormat: 'yyyy-MM-dd',
                locale: 'en',
                note: note || 'Repayment via P2P',
            };

            const url = `${this.baseUrl}/fineract-provider/api/v1/loans/${loanId}/transactions?command=repayment`;
            const response = await firstValueFrom(
                this.httpService.post(url, payload, { headers }),
            );

            this.logger.log(`Repayment of ${amount} made on loan ${loanId}`);
            return {
                success: true,
                resourceId: response.data.resourceId,
                transactionId: response.data.resourceId,
            };
        } catch (error) {
            this.logger.error(`Failed to make repayment: ${error}`);
            throw error;
        }
    }

    // ================ ADDITIONAL LOAN METHODS ================

    /**
     * Get loan transactions (past payments)
     */
    async getLoanTransactions(loanId: number): Promise<any[]> {
        const details = await this.getLoanDetails(loanId);
        return details.transactions || [];
    }

    /**
     * Get outstanding balance for a loan
     * Fetches from loan summary in Fineract
     */



    /**
     * Transfer funds between accounts (Savings to Savings)
     */
    async transferFunds(
        fromClientId: number,
        toClientId: number,
        fromAccountId: number,
        toAccountId: number,
        amount: number,
        note: string = 'Transfer via P2P',
        deductFeeFromAmount: boolean = true,
        skipFee: boolean = false
    ): Promise<any> {
        try {
            const headers = await this.getHeaders();
            const date = new Date().toISOString().split('T')[0];

            // DEBUG: Log all transfer parameters
            this.logger.log(`[transferFunds] EXECUTING: ${amount} VND`);
            this.logger.log(`  From: Client ${fromClientId}, Account ${fromAccountId}`);
            this.logger.log(`  To: Client ${toClientId}, Account ${toAccountId}`);
            this.logger.log(`  Note: ${note}`);
            this.logger.log(`  skipFee: ${skipFee}`);

            const payload = {
                fromOfficeId: 1,
                fromClientId: fromClientId,
                fromAccountType: 2, // Savings
                fromAccountId: fromAccountId,
                toOfficeId: 1,
                toClientId: toClientId,
                toAccountType: 2, // Savings
                toAccountId: toAccountId,
                dateFormat: 'yyyy-MM-dd',
                locale: 'en',
                transferDate: date,
                transferAmount: amount,
                transferDescription: note,
            };

            if (skipFee) {
                this.logger.log(`[Transfer] Skipping fee (escrow transfer): ${amount}`);
            }

            const url = `${this.baseUrl}/fineract-provider/api/v1/accounttransfers`;
            const response = await firstValueFrom(
                this.httpService.post(url, payload, { headers }),
            );

            this.logger.log(`✓ Transfer SUCCESS: resourceId=${response.data.resourceId}, ${amount} from Account ${fromAccountId} → Account ${toAccountId}`);
            return {
                success: true,
                resourceId: response.data.resourceId,
                transactionId: response.data.resourceId, // Mapping for consistency
                response: response.data
            };
        } catch (error) {
            this.logger.error(`✗ Transfer FAILED: ${error.message}`);
            this.logger.error(`  From: Client ${fromClientId}, Account ${fromAccountId}`);
            this.logger.error(`  To: Client ${toClientId}, Account ${toAccountId}`);
            throw error;
        }
    }

    /**
     * Get prepayment amount (for early loan closure)
     */
    async getPrepaymentAmount(loanId: number): Promise<{
        amount: number;
        principalPortion: number;
        interestPortion: number;
        penaltyPortion: number;
        feesPortion: number;
        transactionDate: string;
    }> {
        try {
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/loans/${loanId}/transactions/template?command=prepayLoan`;

            const response = await firstValueFrom(
                this.httpService.get(url, { headers }),
            );

            return {
                amount: response.data.amount || 0,
                principalPortion: response.data.principalPortion || 0,
                interestPortion: response.data.interestPortion || 0,
                penaltyPortion: response.data.penaltyChargesPortion || 0,
                feesPortion: response.data.feeChargesPortion || 0,
                transactionDate: response.data.date || new Date().toISOString().split('T')[0],
            };
        } catch (error: any) {
            this.logger.warn(`PrepayLoan template failed, using outstanding balance: ${error.message}`);
            // Fallback to outstanding balance
            const outstanding = await this.getOutstandingBalance(loanId);
            return {
                amount: outstanding.totalOutstanding,
                principalPortion: outstanding.principalOutstanding,
                interestPortion: outstanding.interestOutstanding,
                penaltyPortion: outstanding.penaltyChargesOutstanding,
                feesPortion: outstanding.feeChargesOutstanding,
                transactionDate: new Date().toISOString().split('T')[0],
            };

        }
    }

    /**
     * Early repayment (prepay loan)
     */
    async prepayLoan(loanId: number, amount: number, transactionDate?: string, note?: string): Promise<any> {
        try {
            const headers = await this.getHeaders();
            const date = transactionDate || new Date().toISOString().split('T')[0];

            const payload = {
                transactionAmount: amount,
                transactionDate: date,
                dateFormat: 'yyyy-MM-dd',
                locale: 'en',
                note: note || 'Early Repayment via P2P',
            };

            // Use repayment command - Fineract will auto-close if outstanding = 0
            const url = `${this.baseUrl}/fineract-provider/api/v1/loans/${loanId}/transactions?command=repayment`;
            const response = await firstValueFrom(
                this.httpService.post(url, payload, { headers }),
            );

            this.logger.log(`Prepay loan ${loanId}: amount=${amount}, transactionId=${response.data.resourceId}`);
            return {
                success: true,
                resourceId: response.data.resourceId,
                transactionId: response.data.resourceId,
            };
        } catch (error) {
            this.logger.error(`Failed to prepay loan: ${error}`);
            throw error;
        }
    }

    // ================ LOAN PURPOSE METHODS ================

    /**
     * Get loan purpose code values from Fineract
     */
    async getLoanPurposeCodeValues(): Promise<Array<{ id: number; name: string; position: number }>> {
        try {
            const headers = await this.getHeaders();

            // First, get all codes
            const codesUrl = `${this.baseUrl}/fineract-provider/api/v1/codes`;
            const codesResponse = await firstValueFrom(
                this.httpService.get(codesUrl, { headers }),
            );

            const codes = codesResponse.data.pageItems || codesResponse.data || [];
            const loanPurposeCode = codes.find((c: any) =>
                c.name === 'LoanPurpose' || c.name === 'loanPurpose'
            );

            if (!loanPurposeCode) {
                this.logger.warn('Code "LoanPurpose" not found in Fineract');
                return [];
            }

            // Get code values
            const codeValuesUrl = `${this.baseUrl}/fineract-provider/api/v1/codes/${loanPurposeCode.id}/codevalues`;
            const codeValuesResponse = await firstValueFrom(
                this.httpService.get(codeValuesUrl, { headers }),
            );

            const codeValues = codeValuesResponse.data.pageItems || codeValuesResponse.data || [];
            return codeValues
                .filter((cv: any) => cv.isActive !== false)
                .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
                .map((cv: any) => ({
                    id: cv.id,
                    name: cv.name,
                    position: cv.position || 0,
                }));
        } catch (error) {
            this.logger.error(`Failed to get loan purpose codes: ${error}`);
            return [];
        }
    }

    /**
     * Extract loan info from Fineract loan details (helper method)
     */
    extractLoanInfo(fineractLoan: any): any {
        return {
            fineractLoanId: fineractLoan.id,
            fineractStatus: fineractLoan.status?.code,
            principal: fineractLoan.principal,
            numberOfRepayments: fineractLoan.numberOfRepayments,

            interestRate: {
                perPeriod: fineractLoan.interestRatePerPeriod,
                annual: fineractLoan.annualInterestRate,
            },

            currency: fineractLoan.currency,


            status: {
                code: fineractLoan.status?.code,
                value: fineractLoan.status?.value,
                pendingApproval: fineractLoan.status?.pendingApproval,
                waitingForDisbursal: fineractLoan.status?.waitingForDisbursal,
                active: fineractLoan.status?.active,
                closedObligationsMet: fineractLoan.status?.closedObligationsMet,
            },

            repaymentSchedule: {
                totalPrincipalExpected: fineractLoan.repaymentSchedule?.totalPrincipalExpected,
                totalInterestCharged: fineractLoan.repaymentSchedule?.totalInterestCharged,
                totalRepaymentExpected: fineractLoan.repaymentSchedule?.totalRepaymentExpected,
                totalOutstanding: fineractLoan.repaymentSchedule?.totalOutstanding,
                periods: (fineractLoan.repaymentSchedule?.periods || []).map((p: any) => ({
                    period: p.period || 0,
                    dueDate: p.dueDate,
                    principalDue: p.principalDue || 0,
                    interestDue: p.interestDue || 0,
                    totalDue: p.totalDueForPeriod || 0,
                    complete: p.complete || false,
                })),
            },

            timeline: {
                submittedOnDate: fineractLoan.timeline?.submittedOnDate,
                expectedDisbursementDate: fineractLoan.timeline?.expectedDisbursementDate,
                expectedMaturityDate: fineractLoan.timeline?.expectedMaturityDate,
                actualDisbursementDate: fineractLoan.timeline?.actualDisbursementDate,
            },

            transactions: fineractLoan.transactions || [],
        };
    }
    /**
     * Create client in Fineract
     */
    async createClient(firstName: string, lastName: string, externalId: string): Promise<any> {
        if (!this.isFineractEnabled()) throw new Error('Fineract disabled');

        try {
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/clients`;

            const payload = {
                officeId: 1,
                firstname: firstName || 'Fineract',
                lastname: lastName || 'User',
                externalId: externalId,
                dateFormat: 'dd MMMM yyyy',
                locale: 'en',
                active: true,
                activationDate: '01 January 2024',
                legalFormId: 1
            };

            const response = await firstValueFrom(
                this.httpService.post(url, payload, { headers }),
            );

            this.logger.log(`Created Fineract client: ${response.data.clientId}`);
            return {
                id: response.data.clientId,
                resourceId: response.data.resourceId,
            };
        } catch (error) {
            this.logger.error(`Failed to create Fineract client: ${error}`);
            throw error;
        }
    }

    /**
     * Get Client by External ID (usually matches username/phone)
     * Improved with caching and better error handling
     */
    async getClientByExternalId(externalId: string): Promise<any> {
        try {
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/clients?externalId=${externalId}`;

            const response = await firstValueFrom(
                this.httpService.get(url, { headers }),
            );

            if (response.data?.pageItems?.length > 0) {
                return response.data.pageItems[0];
            }
            return null;
        } catch (error) {
            this.logger.warn(`Failed to find client by externalId ${externalId}`);
            return null;
        }
    }

    /**
     * Find Client by Phone Number (mobileNo)
     * Fallback method when externalId lookup fails
     * Pattern from legacy server
     */
    async findClientByPhone(phone: string): Promise<any> {
        try {
            if (!phone) return null;

            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/clients`;

            const response = await firstValueFrom(
                this.httpService.get(url, { headers }),
            );

            const clients = response.data?.pageItems || [];

            // Normalize phone number (remove non-digits)
            const normalized = phone.replace(/\D+/g, '');

            const client = clients.find((c: any) => {
                const clientPhone = (c?.mobileNo || '').replace(/\D+/g, '');
                return clientPhone === normalized;
            });

            if (client) {
                this.logger.log(`[findClientByPhone] Found client ${client.id} by phone ${phone}`);
            }
            return client || null;
        } catch (error) {
            this.logger.warn(`Failed to find client by phone ${phone}: ${error}`);
            return null;
        }
    }

    /**
     * Find Client by Phone or Email
     * Unified lookup method following legacy pattern
     */
    async findClientByPhoneOrEmail(phoneOrEmail: string): Promise<any> {
        if (phoneOrEmail.includes('@')) {
            return this.findClientByEmail(phoneOrEmail);
        }
        return this.findClientByPhone(phoneOrEmail);
    }

    /**
     * Find Client by Email
     */
    async findClientByEmail(email: string): Promise<any> {
        try {
            if (!email) return null;

            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/clients`;

            const response = await firstValueFrom(
                this.httpService.get(url, { headers }),
            );

            const clients = response.data?.pageItems || [];

            const client = clients.find((c: any) =>
                (c?.emailAddress || c?.email || '').toLowerCase() === email.toLowerCase()
            );

            return client || null;
        } catch (error) {
            this.logger.warn(`Failed to find client by email ${email}: ${error}`);
            return null;
        }
    }

    /**
     * Resolve Client ID with multiple fallback methods
     * Priority: 1. externalId (KEYCLOAK_xxx), 2. externalId (plain), 3. phone, 4. email
     */
    async resolveClientId(username: string, email?: string): Promise<number | null> {
        // 1. Try KEYCLOAK_{username} first (legacy format)
        let client = await this.getClientByExternalId(`KEYCLOAK_${username}`);
        if (client?.id) {
            this.logger.log(`[resolveClientId] Found via KEYCLOAK_${username} -> ${client.id}`);
            return client.id;
        }

        // 2. Try plain username as externalId
        client = await this.getClientByExternalId(username);
        if (client?.id) {
            this.logger.log(`[resolveClientId] Found via ${username} -> ${client.id}`);
            return client.id;
        }

        // 3. Try by phone number (assuming username is phone)
        client = await this.findClientByPhone(username);
        if (client?.id) {
            this.logger.log(`[resolveClientId] Found via phone ${username} -> ${client.id}`);
            return client.id;
        }

        // 4. Try by email if provided
        if (email) {
            client = await this.findClientByEmail(email);
            if (client?.id) {
                this.logger.log(`[resolveClientId] Found via email ${email} -> ${client.id}`);
                return client.id;
            }
        }

        this.logger.warn(`[resolveClientId] Could not resolve client for ${username}`);
        return null;
    }

    /**
     * Get Client Accounts (Loans, Savings, etc.)
     */
    async getClientAccounts(clientId: number | string): Promise<any> {
        try {
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/clients/${clientId}/accounts`;

            const response = await firstValueFrom(
                this.httpService.get(url, { headers }),
            );

            return response.data;
        } catch (error) {
            this.logger.error(`Failed to get client accounts for ${clientId}: ${error}`);
            throw error;
        }
    }

    /**
     * Get Client Details (includes savings accounts list)
     * Uses same approach as p2p reference: call /clients/{id}/accounts separately
     */
    async getClientDetails(clientId: number | string): Promise<any> {
        try {
            const headers = await this.getHeaders();

            // Step 1: Get client basic info
            const clientUrl = `${this.baseUrl}/fineract-provider/api/v1/clients/${clientId}`;
            const clientResponse = await firstValueFrom(
                this.httpService.get(clientUrl, { headers }),
            );
            const client = clientResponse.data;

            // Step 2: Get client accounts (includes savings accounts)
            let savingsAccounts = [];
            try {
                const accountsUrl = `${this.baseUrl}/fineract-provider/api/v1/clients/${clientId}/accounts`;
                const accountsResponse = await firstValueFrom(
                    this.httpService.get(accountsUrl, { headers }),
                );
                savingsAccounts = accountsResponse?.data?.savingsAccounts || [];
                this.logger.log(`[getClientDetails] Client ${clientId} accounts response: ${savingsAccounts.length} savings accounts`);
            } catch (error) {
                this.logger.warn(`[getClientDetails] Could not get accounts for client ${clientId}: ${error.message}`);
            }

            return { ...client, savingsAccounts };
        } catch (error) {
            this.logger.error(`Failed to get client details for ${clientId}: ${error}`);
            throw error;
        }
    }

    /**
     * Get Savings Account Details (balance, transactions, etc.)
     * Pattern from legacy: /savingsaccounts/{accountId}
     */
    async getSavingsAccountDetails(accountId: number | string): Promise<any> {
        try {
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/savingsaccounts/${accountId}`;

            const response = await firstValueFrom(
                this.httpService.get(url, { headers }),
            );

            return response.data;
        } catch (error) {
            this.logger.warn(`Failed to get savings account ${accountId}: ${error}`);
            return null;
        }
    }

    /**
     * Get Wallet Balance for a client
     * Flow: resolve client -> get savings accounts -> get primary account balance
     * Pattern from legacy WalletController.getWalletBalance
     */
    async getWalletBalance(clientId: number | string): Promise<{
        balance: number;
        availableBalance: number;
        accountId?: number;
        accountNo?: string;
    }> {
        try {
            // Get client accounts (includes savings accounts)
            const accounts = await this.getClientAccounts(clientId);
            const savingsAccounts = accounts?.savingsAccounts || [];

            if (savingsAccounts.length === 0) {
                this.logger.warn(`No savings accounts found for client ${clientId}`);
                return { balance: 0, availableBalance: 0 };
            }

            // Find primary account (first active account)
            const primaryAccount = savingsAccounts.find((acc: any) =>
                acc.status?.active || acc.status?.id === 300
            ) || savingsAccounts[0];

            if (!primaryAccount) {
                return { balance: 0, availableBalance: 0 };
            }

            // Get account details with balance
            const accountDetails = await this.getSavingsAccountDetails(primaryAccount.id);

            const balance = accountDetails?.summary?.accountBalance || 0;
            const availableBalance = accountDetails?.summary?.availableBalance || balance;

            this.logger.log(`[getWalletBalance] Client ${clientId}: balance=${balance}, available=${availableBalance}`);

            return {
                balance,
                availableBalance,
                accountId: primaryAccount.id,
                accountNo: primaryAccount.accountNo,
            };
        } catch (error) {
            this.logger.error(`Failed to get wallet balance for ${clientId}: ${error}`);
            return { balance: 0, availableBalance: 0 };
        }
    }

    /**
     * Make Loan Repayment on Fineract
     * Pattern from legacy RepaymentController
     */
    async makeLoanRepayment(
        loanId: number,
        amount: number,
        paymentDate: string = new Date().toISOString().split('T')[0],
    ): Promise<any> {
        try {
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/loans/${loanId}/transactions?command=repayment`;

            const payload = {
                transactionAmount: amount,
                transactionDate: this.formatDateForFineract(paymentDate),
                paymentTypeId: 1, // Default payment type
                locale: 'en',
                dateFormat: 'dd MMMM yyyy',
            };

            this.logger.log(`[makeLoanRepayment] Loan ${loanId}: amount=${amount}, date=${paymentDate}`);

            const response = await firstValueFrom(
                this.httpService.post(url, payload, { headers }),
            );

            this.logger.log(`[makeLoanRepayment] Success: transactionId=${response.data?.resourceId}`);
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to make repayment for loan ${loanId}: ${error}`);
            throw error;
        }
    }

    /**
     * Transfer between Savings Accounts (for repayment flow)
     * Pattern from legacy FineractService.transferBetweenAccounts
     */
    async transferBetweenAccounts(
        fromAccountId: number,
        toAccountId: number,
        amount: number,
        description: string = 'P2P Transfer',
        fromClientId?: number,
        toClientId?: number,
    ): Promise<any> {
        try {
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/accounttransfers`;

            const transferDate = new Date();
            const payload: any = {
                fromOfficeId: 1,
                fromAccountType: 2, // Savings account
                fromAccountId: fromAccountId,
                toOfficeId: 1,
                toAccountType: 2, // Savings account
                toAccountId: toAccountId,
                transferAmount: amount,
                transferDate: this.formatDateForFineract(transferDate.toISOString().split('T')[0]),
                transferDescription: description,
                locale: 'en',
                dateFormat: 'dd MMMM yyyy',
            };

            // Add clientIds if provided (required by Fineract API)
            if (fromClientId) {
                payload.fromClientId = fromClientId;
            }
            if (toClientId) {
                payload.toClientId = toClientId;
            }

            this.logger.log(`[transfer] ${fromClientId || 'auto'}:${fromAccountId} -> ${toClientId || 'auto'}:${toAccountId}: ${amount}`);

            const response = await firstValueFrom(
                this.httpService.post(url, payload, { headers }),
            );

            return response.data;
        } catch (error) {
            this.logger.error(`Failed to transfer: ${error}`);
            throw error;
        }
    }


    /**
     * Get Admin Client ID (for escrow transfers)
     */
    getAdminClientId(): number {
        return this.adminClientId;
    }

    /**
     * Get Escrow Account ID (for escrow transfers)
     */
    getEscrowAccountId(): number {
        return this.escrowAccountId;
    }

    /**
     * Get active savings account for a client
     * Used in disbursement and repayment flows
     */
    async getClientSavingsAccount(clientId: number): Promise<{
        id: number;
        accountNo: string;
        balance: number;
        clientId: number;
    } | null> {
        try {
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/clients/${clientId}/accounts`;

            const response = await firstValueFrom(
                this.httpService.get(url, { headers }),
            );

            const savingsAccounts = response.data?.savingsAccounts || [];
            // Find active MAIN wallet savings account
            // Port from P2P reference line 927-931: MUST filter by externalId WALLET_ to get correct account!
            const activeAccount = savingsAccounts.find((acc: any) =>
                acc.depositType?.id === 100 && // Savings Account (NOT FD depositType=200)
                acc.externalId?.startsWith('WALLET_') && // Main wallet account (NOT FD-linked)
                acc.status?.active === true
            );

            if (!activeAccount) {
                this.logger.warn(`No active savings account found for client ${clientId}`);
                return null;
            }

            // DEBUG: Log which account was selected
            this.logger.log(`[getClientSavingsAccount] Client ${clientId}: Found account ${activeAccount.id} (${activeAccount.accountNo}), externalId=${activeAccount.externalId}, depositType=${activeAccount.depositType?.id}`);

            // Get account details for balance
            const accountDetailsUrl = `${this.baseUrl}/fineract-provider/api/v1/savingsaccounts/${activeAccount.id}`;
            const detailsResponse = await firstValueFrom(
                this.httpService.get(accountDetailsUrl, { headers }),
            );

            return {
                id: activeAccount.id,
                accountNo: activeAccount.accountNo,
                balance: detailsResponse.data?.summary?.accountBalance || 0,
                clientId: clientId,
            };
        } catch (error) {
            this.logger.error(`Failed to get savings account for client ${clientId}: ${error}`);
            return null;
        }
    }

    /**
     * Helper: Format date for Fineract API (dd MMMM yyyy)
     */
    private formatDateForFineract(dateStr: string): string {
        const date = new Date(dateStr);
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    }

    /**
     * Get Savings Account Transactions
     * Fetches transaction history for a savings account
     * MATCH P2P REFERENCE: Use /transactions endpoint with pagination (line 264-272 of InvestmentManagementService.js)
     */
    async getSavingsAccountTransactions(savingsAccountId: number, limit: number = 200, offset: number = 0): Promise<any[]> {
        try {
            const headers = await this.getHeaders();

            // P2P Reference: GET /savingsaccounts/{id}/transactions with pagination
            const url = `${this.baseUrl}/fineract-provider/api/v1/savingsaccounts/${savingsAccountId}/transactions`;

            this.logger.log(`[getSavingsTransactions] Fetching transactions for savings account ${savingsAccountId} (limit=${limit}, offset=${offset})`);

            const response = await firstValueFrom(
                this.httpService.get(url, {
                    headers,
                    params: {
                        limit: Math.min(limit, 200),
                        offset: offset
                    }
                }),
            );

            // Fineract returns transactions in pageItems, already sorted by Fineract
            const txns = response.data?.pageItems || [];
            this.logger.log(`[getSavingsTransactions] Found ${txns.length} transactions (total: ${response.data?.totalFilteredRecords || txns.length})`);

            // Log first transaction for debugging
            if (txns.length > 0) {
                const firstTxn = txns[0];
                this.logger.debug(`[getSavingsTransactions] First transaction: id=${firstTxn.id}, amount=${firstTxn.amount}, type=${firstTxn.transactionType?.value}`);
            }

            return txns;
        } catch (error: any) {
            // Fallback to associations=all if /transactions returns 405
            if (error.response?.status === 405) {
                this.logger.warn(`[getSavingsTransactions] /transactions endpoint returned 405, falling back to associations=all`);
                return this.getSavingsAccountTransactionsFallback(savingsAccountId);
            }

            this.logger.error(`Failed to get savings transactions for ${savingsAccountId}: ${error.message}`);
            if (error.response) {
                this.logger.error(`Response status: ${error.response.status}, data: ${JSON.stringify(error.response.data)}`);
            }
            return [];
        }
    }

    /**
     * Fallback: Get transactions via associations=all
     */
    private async getSavingsAccountTransactionsFallback(savingsAccountId: number): Promise<any[]> {
        try {
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/savingsaccounts/${savingsAccountId}?associations=all`;

            const response = await firstValueFrom(
                this.httpService.get(url, { headers }),
            );

            const txns = response.data.transactions || [];
            this.logger.log(`[getSavingsTransactions-Fallback] Found ${txns.length} transactions`);

            return txns;
        } catch (error: any) {
            this.logger.error(`Fallback also failed for ${savingsAccountId}: ${error.message}`);
            return [];
        }
    }


    // ==========================================
    // RECONCILIATION METHODS
    // ==========================================

    /**
     * Get Fixed Deposit Account Details
     */
    async getFixedDepositDetails(fdAccountId: number): Promise<any> {
        try {
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/fixeddepositaccounts/${fdAccountId}`;

            const response = await firstValueFrom(
                this.httpService.get(url, { headers })
            );
            return response.data;
        } catch (error: any) {
            this.logger.error(`Failed to get FD details ${fdAccountId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get Savings Account Transactions
     */
    async getAccountTransactions(savingsAccountId: number): Promise<any[]> {
        try {
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/savingsaccounts/${savingsAccountId}/transactions`;

            const response = await firstValueFrom(
                this.httpService.get(url, { headers })
            );
            return response.data.transactions || [];
        } catch (error: any) {
            this.logger.error(`Failed to get transactions for ${savingsAccountId}: ${error.message}`);
            return [];
        }
    }
}
