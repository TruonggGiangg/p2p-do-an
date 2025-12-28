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
            if (!adminSavingsAccount) {
                throw new Error('Admin savings account not found');
            }

            // Get transactions
            const transactions = await this.fineractService.getAccountTransactions(adminSavingsAccount.id);
            if (!transactions || transactions.length === 0) return [];

            // ✅ ENRICH WITH P2P CONTEXT
            // extract IDs
            const txnIds = transactions.map(t => t.id);

            // find logs
            const logs = await this.transactionLogModel.find({
                fineractTransactionId: { $in: txnIds }
            }).select('fineractTransactionId p2pContext transactionType loanId');

            // Map logs by Fineract ID
            const logMap = new Map();
            logs.forEach(log => {
                logMap.set(log.fineractTransactionId, log);
            });

            // Merge
            return transactions.map(t => {
                const log = logMap.get(t.id);
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
        const P2P_LABELS = {
            'LOAN_CREATION': 'Tạo khoản vay',
            'INVEST': 'Đầu tư vào khoản vay',
            'ESCROW_FUND': 'Ký quỹ đầu tư',
            'DISBURSE': 'Giải ngân',
            'REPAYMENT': 'Người vay trả nợ',
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

        // 5. Calculate summary
        const summary = {
            đầuTư: fdAccounts.reduce((sum, fd) => sum + fd.principalVND, 0),
            giảiNgân: loan.info?.capital || 0,
            tràNợ: txnLogs.filter(l => l.transactionType === 'REPAYMENT').reduce((sum, l) => sum + (l.amount || 0), 0),
            phânPhối: txnLogs.filter(l => l.transactionType === 'DISTRIBUTION').reduce((sum, l) => sum + (l.amount || 0), 0),
            hoànVốn: 0,
            hoànVốnFD: fdAccounts.filter(fd => fd.fdStatus === 'Premature Closed' || fd.fdStatus === 'Closed').reduce((sum, fd) => sum + fd.principalVND, 0),
            lợiNhuận: 0, // Will be calculated
        };
        summary.lợiNhuận = summary.phânPhối > 0 ? (summary.phânPhối - summary.đầuTư) : 0;

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
            case 'ESCROW_FUND':
            case 'FD_CREATE':
                return 'Test Lender';
            case 'DISBURSE':
            case 'DISTRIBUTION':
                return 'P2P Admin';
            case 'REPAYMENT':
            case 'FD_CLOSE':
                return 'Test Borrower';
            default:
                return 'Unknown';
        }
    }

    private getToClientLabel(txnType: string): string {
        switch (txnType) {
            case 'INVEST':
            case 'ESCROW_FUND':
                return 'P2P Admin';
            case 'DISBURSE':
                return 'Test Borrower';
            case 'REPAYMENT':
                return 'P2P Admin';
            case 'FD_CREATE':
                return 'TK Fixed Deposit';
            case 'FD_CLOSE':
            case 'DISTRIBUTION':
                return 'Test Lender';
            default:
                return 'Unknown';
        }
    }
}
