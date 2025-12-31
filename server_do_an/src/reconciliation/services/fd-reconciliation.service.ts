import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FineractService } from '../../loan/services/fineract.service';
import { LoanContract } from '../../loan/schemas/loan-contract.schema';
import { InvestmentContract } from '../../invest/schemas/investment-contract.schema';
import { TransactionLog } from '../schemas/transaction-log.schema';

export interface FDAccountInfo {
    investmentContractId: string;
    lenderId: string;
    lenderFineractClientId?: number;
    fdAccountId: number;
    fdAccountNo: string;
    fdExternalId?: string;
    fdBalance: number;
    fdInterestRate: number;
    fdStatus: string;
    fdMaturityDate?: any;
    principalVND: number;
    fixedDepositInterestRate?: number;
}

export interface ReconciliationMismatch {
    type: string;
    expected: number;
    actual: number;
    difference: number;
}

export interface LoanReconciliationReport {
    loanId: string;
    loanContractId: string;
    fineractLoanId?: number;
    loanStatus: string;
    loanPrincipal: number;

    // Investment summary
    totalInvestments: number;
    totalInvestedAmount: number;

    // FD summary
    fdAccounts: FDAccountInfo[];
    totalFDBalance: number;
    totalFDsWithExternalId: number;

    // Mismatches
    mismatches: ReconciliationMismatch[];
    hasDiscrepancies: boolean;

    // Timestamps
    reconciledAt: Date;
}

@Injectable()
export class FDReconciliationService {
    private readonly logger = new Logger(FDReconciliationService.name);

    constructor(
        @InjectModel(LoanContract.name) private loanModel: Model<LoanContract>,
        @InjectModel(InvestmentContract.name) private investModel: Model<InvestmentContract>,
        @InjectModel(TransactionLog.name) private transactionLogModel: Model<TransactionLog>,
        private readonly fineractService: FineractService,
    ) { }

    /**
     * Get all Fixed Deposits for a loan
     */
    async getFixedDepositsByLoan(loanId: string): Promise<FDAccountInfo[]> {
        this.logger.log(`[getFixedDepositsByLoan] Getting FDs for loan: ${loanId}`);

        // 1. Get all investments for this loan
        const investments = await this.investModel.find({
            $or: [
                { loanContractId: loanId },
                { 'loanContract.contractId': loanId }
            ]
        });

        this.logger.log(`[getFixedDepositsByLoan] Found ${investments.length} investments`);

        // 2. Get FD details from Fineract for each investment
        const fdAccounts: FDAccountInfo[] = [];

        for (const inv of investments) {
            const fdAccountId = (inv as any).fineractFixedDepositAccountId;

            if (fdAccountId) {
                try {
                    const fdDetails = await this.fineractService.getFixedDepositDetails(fdAccountId);

                    fdAccounts.push({
                        investmentContractId: inv.contractId,
                        lenderId: inv.lender,
                        lenderFineractClientId: inv.lenderFineractClientId,

                        fdAccountId: fdDetails.id,
                        fdAccountNo: fdDetails.accountNo,
                        fdExternalId: fdDetails.externalId,
                        fdBalance: fdDetails.summary?.accountBalance || 0,
                        fdInterestRate: fdDetails.nominalAnnualInterestRate,
                        fdStatus: fdDetails.status?.value,
                        fdMaturityDate: fdDetails.maturityDate,

                        principalVND: inv.info?.capital || 0,
                        fixedDepositInterestRate: (inv as any).fixedDepositInterestRate
                    });
                } catch (error: any) {
                    this.logger.error(`[getFixedDepositsByLoan] Error getting FD ${fdAccountId}: ${error.message}`);
                }
            }
        }

        return fdAccounts;
    }

    /**
     * Reconcile a loan with Fixed Deposits
     */
    async reconcileLoan(loanId: string): Promise<LoanReconciliationReport> {
        this.logger.log(`[reconcileLoan] Starting reconciliation for loan: ${loanId}`);

        // 1. Get loan details
        let loan = await this.loanModel.findOne({ contractId: loanId });
        if (!loan && loanId.startsWith('LOAN_')) {
            loan = await this.loanModel.findOne({ fineractLoanId: parseInt(loanId.replace('LOAN_', ''), 10) });
        }
        if (!loan) {
            // Try by numeric ID
            const numericId = parseInt(loanId, 10);
            if (!isNaN(numericId)) {
                loan = await this.loanModel.findOne({ fineractLoanId: numericId });
            }
        }

        if (!loan) {
            throw new Error(`Loan ${loanId} not found`);
        }

        // 2. Get all investments
        const investments = await this.investModel.find({
            $or: [
                { loanContractId: loan.contractId },
                { loanContract: loan._id }
            ]
        });

        // 3. Get FD accounts
        const fdAccounts = await this.getFixedDepositsByLoan(loan.contractId);

        // 4. Calculate totals
        const totalInvestedAmount = investments.reduce((sum, inv) => sum + (inv.info?.capital || 0), 0);
        const totalFDBalance = fdAccounts.reduce((sum, fd) => sum + fd.fdBalance, 0);
        const totalFDsWithExternalId = fdAccounts.filter(fd => fd.fdExternalId).length;

        // 5. Check mismatches
        const mismatches: ReconciliationMismatch[] = [];

        // Check if total invested = loan principal
        const loanPrincipal = loan.info?.capital || (loan as any).principal || 0;
        if (totalInvestedAmount !== loanPrincipal) {
            mismatches.push({
                type: 'LOAN_INVESTMENT_MISMATCH',
                expected: loanPrincipal,
                actual: totalInvestedAmount,
                difference: totalInvestedAmount - loanPrincipal
            });
        }

        // Check if FD balance = invested amount (only for active FDs)
        const activeFDBalance = fdAccounts
            .filter(fd => fd.fdStatus?.toLowerCase() !== 'premature closed' && fd.fdStatus?.toLowerCase() !== 'closed')
            .reduce((sum, fd) => sum + fd.fdBalance, 0);

        if (activeFDBalance !== totalInvestedAmount && activeFDBalance > 0) {
            mismatches.push({
                type: 'FD_BALANCE_MISMATCH',
                expected: totalInvestedAmount,
                actual: activeFDBalance,
                difference: activeFDBalance - totalInvestedAmount
            });
        }

        // 6. Build report
        const report: LoanReconciliationReport = {
            loanId: String(loan._id),
            loanContractId: loan.contractId,
            fineractLoanId: loan.fineractLoanId,
            loanStatus: loan.status,
            loanPrincipal,

            totalInvestments: investments.length,
            totalInvestedAmount,

            fdAccounts,
            totalFDBalance,
            totalFDsWithExternalId,

            mismatches,
            hasDiscrepancies: mismatches.length > 0,

            reconciledAt: new Date()
        };

        this.logger.log(`[reconcileLoan] Reconciliation complete. Discrepancies: ${report.hasDiscrepancies}`);
        return report;
    }

    /**
     * Get admin transactions for reconciliation
     */
    async getAdminTransactions(loanId?: string): Promise<any[]> {
        const adminClientId = this.fineractService.getAdminClientId();
        this.logger.log(`[getAdminTransactions] Getting transactions for admin client ${adminClientId}`);

        try {
            // Get admin's savings account
            const adminSavingsAccount = await this.fineractService.getClientSavingsAccount(adminClientId);
            const adminSavingsId = adminSavingsAccount?.id;

            const escrowAccountId = parseInt(process.env.FINERACT_ESCROW_ACCOUNT_ID || '1');

            // Get transactions from BOTH Admin Main and Escrow Account
            const transactionPromises: Promise<{ transactions: any[]; total: number }>[] = [];

            if (adminSavingsId) {
                transactionPromises.push(this.fineractService.getAccountTransactions(adminSavingsId));
            }

            if (escrowAccountId && escrowAccountId !== adminSavingsId) {
                this.logger.log(`[getAdminTransactions] Also fetching from Escrow Account ${escrowAccountId}`);
                transactionPromises.push(this.fineractService.getAccountTransactions(escrowAccountId));
            }

            const results = await Promise.all(transactionPromises);
            // Flatten (and deduplicate by ID if needed, though rare to have same ID across accounts)
            const flatTransactions = results.map(r => r.transactions).flat();

            // Deduplicate by ID
            const transactions: any[] = Array.from(new Map(flatTransactions.map((t: any) => [t.id, t])).values());

            if (!transactions || transactions.length === 0) return [];

            // ✅ ENRICH WITH P2P CONTEXT
            // extract IDs (Both Transaction ID and Transfer ID)
            const txnIds = transactions.map((t: any) => t.id);
            const transferIds = transactions.filter((t: any) => t.transfer && t.transfer.id).map((t: any) => t.transfer.id);

            const allIds = [...new Set([...txnIds, ...transferIds])];

            // DEBUG: Log IDs found
            this.logger.log(`[getAdminTransactions] Found ${transactions.length} transactions`);
            this.logger.log(`[getAdminTransactions] IDs: ${JSON.stringify(txnIds.slice(0, 5))}...`);
            this.logger.log(`[getAdminTransactions] Transfer IDs: ${JSON.stringify(transferIds.slice(0, 5))}...`);

            // find logs
            const logs = await this.transactionLogModel.find({
                fineractTransactionId: { $in: allIds }
            }).select('fineractTransactionId p2pContext transactionType loanId');

            this.logger.log(`[getAdminTransactions] Found ${logs.length} matching logs in DB`);
            if (logs.length > 0) {
                this.logger.log(`[getAdminTransactions] Sample Log IDs: ${logs.map(l => l.fineractTransactionId).slice(0, 5)}`);
            }

            // Map logs by Fineract ID
            const logMap = new Map();
            logs.forEach(log => {
                logMap.set(log.fineractTransactionId, log);
            });

            // ✅ FUZZY MATCHING FALLBACK
            // Fetch recent DISTRIBUTION and FD_RETURN logs to catch those where IDs don't match (TransferID vs TxnID)
            const recentLogs = await this.transactionLogModel.find({
                transactionType: { $in: ['DISTRIBUTION', 'FD_RETURN'] },
                status: 'SUCCESS'
            }).sort({ createdAt: -1 }).limit(50).exec();

            const unmatchedLogs = [...recentLogs]; // Copy to track usage

            // Merge
            return transactions.map(t => {
                // 1. Try matching by Transaction ID first
                let log = logMap.get(t.id);

                // 2. If not found, try matching by Transfer ID
                if (!log && t.transfer && t.transfer.id) {
                    log = logMap.get(t.transfer.id);
                }

                // 3. Fallback: Fuzzy Match by Amount + Date + Type
                if (!log) {
                    // Identify Direction -> Type
                    // Disbursement/Distribution = Withdrawal
                    // Repayment/FD Return = Deposit
                    const isWithdrawal = t.transactionType?.value === 'Withdrawal';
                    const isDeposit = t.transactionType?.value === 'Deposit';

                    const matchIndex = unmatchedLogs.findIndex(l => {
                        // Amount match (allow small float variance just in case, though usually exact integer)
                        if (Math.abs((l.amount || 0) - (t.amount || 0)) > 1) return false;

                        // Type match
                        if (l.transactionType === 'DISTRIBUTION' && !isWithdrawal) return false;
                        if (l.transactionType === 'FD_RETURN' && !isDeposit) return false;

                        // Date match (within 1 day)
                        if (!l.createdAt) return false;
                        const logDate = new Date(l.createdAt);

                        let txnDate: Date;
                        if (Array.isArray(t.date)) {
                            // Fineract Array: [Year, Month, Day]
                            txnDate = new Date(t.date[0], t.date[1] - 1, t.date[2]);
                        } else {
                            // Fallback for string/Date
                            txnDate = new Date(t.date);
                        }

                        // Simple check: Same Day
                        const isSameDay = logDate.getDate() === txnDate.getDate() &&
                            logDate.getMonth() === txnDate.getMonth() &&
                            logDate.getFullYear() === txnDate.getFullYear();

                        return isSameDay;
                    });

                    if (matchIndex !== -1) {
                        log = unmatchedLogs[matchIndex];
                        this.logger.log(`[getAdminTransactions] Fuzzy matched Txn ${t.id} (${t.amount}) with Log ${log.transactionType} (${log.fineractTransactionId})`);
                        unmatchedLogs.splice(matchIndex, 1); // Remove to prevent double usage
                    }
                }

                return {
                    ...t,
                    p2pContext: log ? log.p2pContext : 'Giao dịch hệ thống',
                    p2pTransactionType: log ? log.transactionType : null,
                    p2pLoanId: log ? log.loanId : null
                };
            });

        } catch (error: any) {
            this.logger.error(`[getAdminTransactions] Error: ${error.message}`);
            return [];
        }
    }

    /**
     * Get all transactions for a loan with Vietnamese P2P context labels
     * This replicates the reference P2P Fineract UI reconciliation view
     */
    async getLoanTransactionsWithP2PLabels(loanId: string): Promise<{
        loan: any;
        transactions: any[];
        fdAccounts: any[];
        summary: any;
    }> {
        this.logger.log(`[getLoanTransactionsWithP2PLabels] Getting transactions for loan: ${loanId}`);

        // 1. Get loan details
        let loan = await this.loanModel.findOne({ contractId: loanId });
        if (!loan && loanId.startsWith('LOAN_')) {
            loan = await this.loanModel.findOne({ fineractLoanId: parseInt(loanId.replace('LOAN_', ''), 10) });
        }
        if (!loan) {
            const numericId = parseInt(loanId, 10);
            if (!isNaN(numericId)) {
                loan = await this.loanModel.findOne({ fineractLoanId: numericId });
            }
        }
        if (!loan) {
            throw new Error(`Loan ${loanId} not found`);
        }

        // 2. Get all transaction logs for this loan
        const txnLogs = await this.transactionLogModel.find({
            loanId: loan.contractId
        }).sort({ createdAt: -1 });

        // 3. Generate Vietnamese P2P labels for each transaction
        // Keys must match TransactionLogService.transactionType values exactly!
        const P2P_LABELS = {
            'LOAN_CREATION': 'Tạo khoản vay',
            'INVEST': 'Đầu tư vào khoản vay',
            'ESCROW_TRANSFER': 'Ký quỹ đầu tư',  // Fixed: was ESCROW_FUND
            'DISBURSE': 'Giải ngân',
            'REPAY': 'Người vay trả nợ',        // Fixed: was REPAYMENT
            'FD_CREATE': 'Gửi vào FD',
            'FD_CLOSE': 'Hoàn vốn FD',
            'DISTRIBUTION': 'Phân phối gốc & lãi cho nhà đầu tư',
        };

        const transactions = txnLogs.map(log => ({
            id: log.fineractTransactionId || 0,
            date: (log as any).createdAt || new Date(),
            transactionType: log.transactionType,
            p2pContext: P2P_LABELS[log.transactionType] || log.p2pContext || 'Giao dịch',
            amount: log.amount || 0,
            fromClient: this.getFromClientLabel(log.transactionType),
            toClient: this.getToClientLabel(log.transactionType),
            status: log.status,
            fineractTransactionId: log.fineractTransactionId,
        }));

        // 4. Get FD accounts for this loan
        const fdAccounts = await this.getFixedDepositsByLoan(loan.contractId);

        // 5. Calculate summary - Fixed filters to use correct transactionType values
        const investLogs = txnLogs.filter(l => l.transactionType === 'INVEST' || l.transactionType === 'ESCROW_TRANSFER');
        const repayLogs = txnLogs.filter(l => l.transactionType === 'REPAY');
        const distributionLogs = txnLogs.filter(l => l.transactionType === 'DISTRIBUTION');

        const summary = {
            đầuTư: investLogs.reduce((sum, l) => sum + (l.amount || 0), 0),
            giảiNgân: txnLogs.filter(l => l.transactionType === 'DISBURSE').reduce((sum, l) => sum + (l.amount || 0), 0) || loan.info?.capital || 0,
            tràNợ: repayLogs.reduce((sum, l) => sum + (l.amount || 0), 0),
            phânPhối: distributionLogs.reduce((sum, l) => sum + (l.amount || 0), 0),
            hoànVốn: 0,
            hoànVốnFD: fdAccounts.filter(fd => fd.fdStatus === 'Premature Closed' || fd.fdStatus === 'Closed').reduce((sum, fd) => sum + fd.principalVND, 0),
            lợiNhuận: 0, // Will be calculated below
        };

        // ✅ Lợi nhuận Admin = Interest từ Borrower - Interest đã phân phối cho Lender
        // = Admin Spread (3% trong config)
        // Note: P2P reference keeps this in Escrow, no separate transfer needed
        const totalInterestFromBorrower = summary.tràNợ - loan.info.capital; // Total interest borrower paid
        const totalInterestToLender = summary.phânPhối; // Total interest distributed to lenders
        summary.lợiNhuận = totalInterestFromBorrower - totalInterestToLender; // Admin spread (should be ~3%)

        // If profit < 0 (not fully paid yet), set = 0
        if (summary.lợiNhuận < 0) summary.lợiNhuận = 0;


        return {
            loan: {
                loanId: loan.contractId,
                fineractLoanId: loan.fineractLoanId,
                borrower: loan.borrower,
                borrowerId: loan.borrower,
                capital: loan.info?.capital,
                status: loan.status,
            },
            transactions,
            fdAccounts: fdAccounts.map(fd => ({
                fdAccountNo: fd.fdAccountNo,
                fdAccountId: fd.fdAccountId,
                balance: fd.fdBalance,
                status: fd.fdStatus,
            })),
            summary,
        };
    }

    private getFromClientLabel(txnType: string): string {
        switch (txnType) {
            case 'INVEST':
            case 'ESCROW_TRANSFER':  // Fixed: was ESCROW_FUND
            case 'FD_CREATE':
                return 'Test Lender';
            case 'DISBURSE':
            case 'DISTRIBUTION':
                return 'P2P Admin';
            case 'REPAY':            // Fixed: was REPAYMENT
                return 'Test Borrower';
            case 'FD_CLOSE':
                return 'TK Fixed Deposit';
            default:
                return 'Unknown';
        }
    }


    private getToClientLabel(txnType: string): string {
        switch (txnType) {
            case 'INVEST':
            case 'ESCROW_TRANSFER':  // Fixed: was ESCROW_FUND
            case 'REPAY':            // Fixed: was REPAYMENT
                return 'P2P Admin';
            case 'DISBURSE':
                return 'Test Borrower';
            case 'FD_CREATE':
                return 'TK Fixed Deposit';
            case 'FD_CLOSE':
            case 'DISTRIBUTION':
                return 'Test Lender';
            default:
                return 'Unknown';
        }
    }

    /**
     * Sync missing DISTRIBUTION logs from Fineract to MongoDB
     * For loans processed before DISTRIBUTION logging was added
     */
    async syncDistributionLogsFromFineract(loanId: string): Promise<{ created: number; skipped: number }> {
        this.logger.log(`[syncDistributionLogs] Starting sync for loan: ${loanId}`);

        // 1. Get loan details
        let loan = await this.loanModel.findOne({ contractId: loanId });
        if (!loan && loanId.startsWith('LOAN_')) {
            loan = await this.loanModel.findOne({ fineractLoanId: parseInt(loanId.replace('LOAN_', ''), 10) });
        }
        if (!loan) {
            throw new Error(`Loan ${loanId} not found`);
        }

        // 2. Get admin/escrow transactions from Fineract
        const escrowAccountId = parseInt(process.env.FINERACT_ESCROW_ACCOUNT_ID || '1');
        const { pageItems: escrowTxns } = await this.fineractService.getSavingsAccountTransactions(escrowAccountId, 500, 0);

        // 3. Filter for distribution transactions for this loan
        const distributionTxns = escrowTxns.filter((txn: any) => {
            const note = txn.transfer?.transferDescription || txn.note || '';
            const matchesLoan = note.toLowerCase().includes(loanId.toLowerCase())
                || note.includes(loan.fineractLoanId?.toString() || '');
            const isDistribution = note.toLowerCase().includes('repayment distribution')
                || note.toLowerCase().includes('interest distribution');
            return matchesLoan && isDistribution && txn.transactionType?.withdrawal;
        });

        this.logger.log(`[syncDistributionLogs] Found ${distributionTxns.length} distribution transactions for ${loanId}`);

        let created = 0;
        let skipped = 0;

        for (const txn of distributionTxns) {
            // Check if log already exists
            const existingLog = await this.transactionLogModel.findOne({
                fineractTransactionId: txn.id,
                transactionType: 'DISTRIBUTION'
            });

            if (existingLog) {
                this.logger.log(`  ⏭️ Log already exists for txn ${txn.id}`);
                skipped++;
                continue;
            }

            // Get lender info from investments
            let lenderId = 'unknown';
            const investments = await this.investModel.find({ loanId: loan.contractId });
            if (investments.length > 0) {
                lenderId = investments[0].lender?.toString() || 'unknown';
            }

            // Create distribution log
            const note = txn.transfer?.transferDescription || txn.note || '';
            const newLog = new this.transactionLogModel({
                transactionId: `TXN_DIST_SYNC_${Date.now()}_${txn.id}`,
                transactionType: 'DISTRIBUTION',
                amount: txn.amount,
                status: 'SUCCESS',
                p2pContext: 'Phân phối gốc & lãi cho nhà đầu tư',
                loanId: loan.contractId,
                lenderId: lenderId,
                fineractTransactionId: txn.id,
                metadata: {
                    action: 'distribution',
                    type: note.toLowerCase().includes('interest') ? 'INTEREST' : 'BOTH',
                    syncedAt: new Date(),
                    originalNote: note
                }
            });

            await newLog.save();
            this.logger.log(`  ✅ Created log for txn ${txn.id}: ${txn.amount} VND`);
            created++;
        }

        this.logger.log(`[syncDistributionLogs] Completed: ${created} created, ${skipped} skipped`);
        return { created, skipped };
    }
}

