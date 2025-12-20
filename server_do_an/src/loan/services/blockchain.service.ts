import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Gateway, Wallets, Contract, Network } from 'fabric-network';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Loan data synced with Fineract
 * Rates are NOT calculated on blockchain
 */
interface LoanInfo {
    capital: number;
    periodMonth: number;
    willing: string;
    rate: number;                 // Monthly borrower rate (from server)
    annualRate: number;           // Annual borrower rate
    lenderRate: number;           // Monthly lender rate
    annualLenderRate: number;     // Annual lender rate
    adminSpread: number;          // Admin spread (annual)
    monthlyPrincipalPay: number;
    monthlyInterestPay: number;
    monthlyPay: number;
    entirelyPay: number;
    disbursementDate: string;
    maturityDate: string;
}

interface Borrower {
    id: string;
    username: string;
    email?: string;
    name?: string;
}

interface BlockchainLoanData {
    contractId: string;
    borrower: Borrower;
    info: LoanInfo;
    totalNotes: number;
    investedNotes: number;
    matchPercentage: number;
    isFullMatch: boolean;
    status: string;
    loanSizeTier: string;
    fineract: {
        loanId: number | null;
        status: string | null;
        syncedAt: string | null;
    };
    createdAt: string;
    updatedAt: string;
}

@Injectable()
export class BlockchainService implements OnModuleInit {
    private readonly logger = new Logger(BlockchainService.name);
    private gateway: Gateway | null = null;
    private network: Network | null = null;
    private contract: Contract | null = null;

    private readonly channelName: string;
    private readonly chaincodeName: string;
    private isConnecting = false;

    constructor(private readonly configService: ConfigService) {
        this.channelName = this.configService.get<string>('BLOCKCHAIN_CHANNEL') || 'mychannel';
        this.chaincodeName = this.configService.get<string>('BLOCKCHAIN_CHAINCODE') || 'p2plending';
    }

    async onModuleInit() {
        if (this.isBlockchainEnabled()) {
            this.logger.log('Blockchain is enabled, attempting to connect...');
            try {
                await this.connect();
            } catch (error) {
                this.logger.warn('Failed to connect to blockchain on startup, will retry on demand');
            }
        } else {
            this.logger.log('Blockchain is disabled, using database-only mode');
        }
    }

    /**
     * Check if blockchain is enabled
     */
    isBlockchainEnabled(): boolean {
        return this.configService.get<string>('BLOCKCHAIN_ENABLED') === 'true';
    }

    /**
     * Connect to Hyperledger Fabric network
     */
    async connect(): Promise<boolean> {
        try {
            if (this.contract) {
                return true;
            }

            if (!this.isBlockchainEnabled()) {
                this.logger.log('Blockchain disabled, using database mode');
                return false;
            }

            // Load connection profile
            const ccpPath = this.configService.get<string>('BLOCKCHAIN_CONNECTION_PROFILE') ||
                path.resolve(__dirname, '../../../../new_server/config/connection.json');

            if (!fs.existsSync(ccpPath)) {
                this.logger.warn(`Blockchain config not found at ${ccpPath}, using database mode`);
                return false;
            }

            const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

            // Create wallet
            const walletPath = this.configService.get<string>('BLOCKCHAIN_WALLET_PATH') ||
                path.join(process.cwd(), 'wallet');
            const wallet = await Wallets.newFileSystemWallet(walletPath);

            // Check admin identity
            const adminIdentity = this.configService.get<string>('BLOCKCHAIN_ADMIN_IDENTITY') || 'admin';
            const adminExists = await wallet.get(adminIdentity);
            if (!adminExists) {
                this.logger.warn(`Admin identity '${adminIdentity}' not found, using database mode`);
                return false;
            }

            // Connect gateway
            this.gateway = new Gateway();
            await this.gateway.connect(ccp, {
                wallet,
                identity: adminIdentity,
                discovery: { enabled: true, asLocalhost: true },
            });

            // Get network and contract
            this.network = await this.gateway.getNetwork(this.channelName);
            this.contract = this.network.getContract(this.chaincodeName);

            this.logger.log('Successfully connected to blockchain');
            return true;
        } catch (error) {
            this.logger.error(`Failed to connect to Fabric network: ${error}`);
            this.logger.log('Falling back to database mode');
            return false;
        }
    }

    /**
     * Ensure connection before operations
     */
    async ensureConnection(): Promise<boolean> {
        if (this.contract) {
            return true;
        }

        if (this.isConnecting) {
            while (this.isConnecting) {
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            return !!this.contract;
        }

        this.isConnecting = true;
        try {
            return await this.connect();
        } finally {
            this.isConnecting = false;
        }
    }

    /**
     * Disconnect from blockchain
     */
    async disconnect(): Promise<void> {
        if (this.gateway) {
            this.gateway.disconnect();
            this.gateway = null;
            this.network = null;
            this.contract = null;
        }
    }

    /**
     * Create loan contract on blockchain
     * IMPORTANT: Rates are already calculated by server via InterestRateCalculator
     * Blockchain ONLY stores the data - no rate calculation
     */
    async createLoanContract(
        borrower: Borrower,
        loanInfo: LoanInfo,
        fineractLoanId?: number,
    ): Promise<BlockchainLoanData> {
        const loanId = `LOAN_${Date.now()}`;

        // If blockchain is disabled, return local data
        if (!this.isBlockchainEnabled()) {
            return this.createLoanDataLocally(loanId, borrower, loanInfo, fineractLoanId);
        }

        try {
            const connected = await this.ensureConnection();
            if (!connected || !this.contract) {
                this.logger.warn('Blockchain not available, returning local data');
                return this.createLoanDataLocally(loanId, borrower, loanInfo, fineractLoanId);
            }

            const borrowerJson = JSON.stringify({
                _id: borrower.id,
                username: borrower.username,
                email: borrower.email,
                name: borrower.name,
            });

            const loanInfoJson = JSON.stringify(loanInfo);

            // Submit transaction to chaincode
            const result = await this.contract.submitTransaction(
                'createLoanContract',
                loanId,
                borrowerJson,
                loanInfoJson,
                fineractLoanId ? String(fineractLoanId) : '',
            );

            const parsedResult = JSON.parse(result.toString());
            this.logger.log(`Created loan contract on blockchain: ${loanId}`);

            return parsedResult;
        } catch (error) {
            this.logger.error(`Blockchain transaction failed: ${error}`);
            return this.createLoanDataLocally(loanId, borrower, loanInfo, fineractLoanId);
        }
    }

    /**
     * Create loan data locally (when blockchain is disabled or unavailable)
     */
    private createLoanDataLocally(
        loanId: string,
        borrower: Borrower,
        loanInfo: LoanInfo,
        fineractLoanId?: number,
    ): BlockchainLoanData {
        const now = new Date().toISOString();
        const noteUnitPrice = this.configService.get<number>('NOTE_UNIT_PRICE') || 500000;

        // Calculate maturity date if not provided
        let maturityDate = loanInfo.maturityDate;
        if (!maturityDate) {
            const disbDate = new Date(loanInfo.disbursementDate);
            disbDate.setMonth(disbDate.getMonth() + loanInfo.periodMonth);
            maturityDate = disbDate.toISOString();
        }

        // Determine loan size tier
        let loanSizeTier = 'medium';
        if (loanInfo.capital < 10000000) loanSizeTier = 'small';
        else if (loanInfo.capital >= 50000000) loanSizeTier = 'large';

        const loanContract: BlockchainLoanData = {
            contractId: loanId,
            borrower: {
                id: borrower.id,
                username: borrower.username,
                email: borrower.email,
                name: borrower.name || borrower.username,
            },
            info: {
                ...loanInfo,
                maturityDate,
            },
            totalNotes: Math.ceil(loanInfo.capital / noteUnitPrice),
            investedNotes: 0,
            matchPercentage: 0,
            isFullMatch: false,
            status: 'waiting',
            loanSizeTier,
            fineract: {
                loanId: fineractLoanId || null,
                status: fineractLoanId ? 'SUBMITTED_AND_PENDING_APPROVAL' : null,
                syncedAt: fineractLoanId ? now : null,
            },
            createdAt: now,
            updatedAt: now,
        };

        this.logger.log(`Created loan data locally: ${loanId}`);
        return loanContract;
    }

    /**
     * Sync loan with Fineract data
     */
    async syncLoanWithFineract(
        loanId: string,
        fineractData: {
            fineractLoanId?: number;
            status?: string;
            productId?: number;
            interestRate?: { perPeriod: number; annual: number };
            repaymentSchedule?: any;
            timeline?: any;
        },
    ): Promise<boolean> {
        if (!this.isBlockchainEnabled()) {
            return false;
        }

        try {
            const connected = await this.ensureConnection();
            if (!connected || !this.contract) {
                return false;
            }

            await this.contract.submitTransaction(
                'syncLoanWithFineract',
                loanId,
                JSON.stringify(fineractData),
            );

            this.logger.log(`Synced loan ${loanId} with Fineract`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to sync loan with Fineract: ${error}`);
            return false;
        }
    }

    /**
     * Update loan status on blockchain
     */
    async updateLoanStatus(loanId: string, status: string): Promise<boolean> {
        if (!this.isBlockchainEnabled()) {
            return false;
        }

        try {
            const connected = await this.ensureConnection();
            if (!connected || !this.contract) {
                return false;
            }

            await this.contract.submitTransaction('updateLoanStatus', loanId, status);
            this.logger.log(`Updated loan status on blockchain: ${loanId} -> ${status}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to update loan status: ${error}`);
            return false;
        }
    }

    /**
     * Update investment progress on blockchain
     */
    async updateInvestmentProgress(loanId: string, investedNotes: number): Promise<boolean> {
        if (!this.isBlockchainEnabled()) {
            return false;
        }

        try {
            const connected = await this.ensureConnection();
            if (!connected || !this.contract) {
                return false;
            }

            await this.contract.submitTransaction(
                'updateInvestmentProgress',
                loanId,
                String(investedNotes),
            );
            this.logger.log(`Updated investment progress on blockchain: ${loanId} -> ${investedNotes} notes`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to update investment progress: ${error}`);
            return false;
        }
    }

    /**
     * Query loan by ID from blockchain
     */
    async queryLoanContract(loanId: string): Promise<BlockchainLoanData | null> {
        if (!this.isBlockchainEnabled()) {
            return null;
        }

        try {
            const connected = await this.ensureConnection();
            if (!connected || !this.contract) {
                return null;
            }

            const result = await this.contract.evaluateTransaction('queryLoanContract', loanId);
            return JSON.parse(result.toString());
        } catch (error) {
            this.logger.error(`Failed to query loan from blockchain: ${error}`);
            return null;
        }
    }

    /**
     * Query waiting loans from blockchain (for lenders)
     */
    async queryWaitingLoans(): Promise<BlockchainLoanData[]> {
        if (!this.isBlockchainEnabled()) {
            return [];
        }

        try {
            const connected = await this.ensureConnection();
            if (!connected || !this.contract) {
                return [];
            }

            const result = await this.contract.evaluateTransaction('queryWaitingLoans');
            return JSON.parse(result.toString());
        } catch (error) {
            this.logger.error(`Failed to query waiting loans: ${error}`);
            return [];
        }
    }

    /**
     * Query loans by borrower from blockchain
     */
    async queryLoansByBorrower(borrowerId: string): Promise<BlockchainLoanData[]> {
        if (!this.isBlockchainEnabled()) {
            return [];
        }

        try {
            const connected = await this.ensureConnection();
            if (!connected || !this.contract) {
                return [];
            }

            const result = await this.contract.evaluateTransaction('queryLoansByBorrower', borrowerId);
            return JSON.parse(result.toString());
        } catch (error) {
            this.logger.error(`Failed to query loans by borrower: ${error}`);
            return [];
        }
    }

    /**
     * Get loan statistics from blockchain
     */
    async getLoanStatistics(loanId: string): Promise<any> {
        if (!this.isBlockchainEnabled()) {
            return null;
        }

        try {
            const connected = await this.ensureConnection();
            if (!connected || !this.contract) {
                return null;
            }

            const result = await this.contract.evaluateTransaction('getLoanStatistics', loanId);
            return JSON.parse(result.toString());
        } catch (error) {
            this.logger.error(`Failed to get loan statistics: ${error}`);
            return null;
        }
    }
}
