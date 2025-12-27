import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TransactionLog } from '../schemas/transaction-log.schema';

/**
 * TransactionLog Service
 * Audit trail cho mọi giao dịch P2P quan trọng
 */
@Injectable()
export class TransactionLogService {
    private readonly logger = new Logger(TransactionLogService.name);

    constructor(
        @InjectModel(TransactionLog.name) private transactionLogModel: Model<TransactionLog>,
    ) { }

    /**
     * Ghi log Investment (Lender đầu tư vào Loan)
     */
    async logInvestment(params: {
        investmentId: string;
        loanId: string;
        lenderId: string;
        amount: number;
        fineractTransferId?: number;
        status?: string;
    }) {
        try {
            const log = new this.transactionLogModel({
                transactionId: `TXN_INVEST_${Date.now()}`,
                transactionType: 'INVEST',
                amount: params.amount,
                status: params.status || 'SUCCESS',
                p2pContext: 'Ký quỹ đầu tư',
                loanId: params.loanId,
                investmentId: params.investmentId,
                lenderId: params.lenderId,
                fineractTransactionId: params.fineractTransferId,
                metadata: {
                    action: 'investment',
                    timestamp: new Date(),
                },
            });

            await log.save();
            this.logger.log(`[TransactionLog] INVEST logged: ${log.transactionId}`);
            return log;
        } catch (error) {
            this.logger.error(`[TransactionLog] Failed to log investment: ${error.message}`);
            // Don't throw - logging failure shouldn't break the main flow
        }
    }

    /**
     * Ghi log Disbursement (Giải ngân cho Borrower)
     */
    async logDisbursement(params: {
        loanId: string;
        borrowerId: string;
        amount: number;
        fineractLoanId?: number;
        fineractDisbursementId?: number;
        status?: string;
    }) {
        try {
            const log = new this.transactionLogModel({
                transactionId: `TXN_DISBURSE_${Date.now()}`,
                transactionType: 'DISBURSE',
                amount: params.amount,
                status: params.status || 'SUCCESS',
                p2pContext: 'Giải ngân',
                loanId: params.loanId,
                borrowerId: params.borrowerId,
                fineractLoanId: params.fineractLoanId,
                fineractTransactionId: params.fineractDisbursementId,
                metadata: {
                    action: 'disbursement',
                    timestamp: new Date(),
                },
            });

            await log.save();
            this.logger.log(`[TransactionLog] DISBURSE logged: ${log.transactionId}`);
            return log;
        } catch (error) {
            this.logger.error(`[TransactionLog] Failed to log disbursement: ${error.message}`);
        }
    }

    /**
     * Ghi log Repayment (Borrower trả nợ)
     */
    async logRepayment(params: {
        loanId: string;
        borrowerId: string;
        amount: number;
        principalPortion?: number;
        interestPortion?: number;
        fineractTransactionId?: number;
        status?: string;
    }) {
        try {
            const log = new this.transactionLogModel({
                transactionId: `TXN_REPAY_${Date.now()}`,
                transactionType: 'REPAY',
                amount: params.amount,
                status: params.status || 'SUCCESS',
                p2pContext: 'Người vay trả nợ',
                loanId: params.loanId,
                borrowerId: params.borrowerId,
                fineractTransactionId: params.fineractTransactionId,
                metadata: {
                    action: 'repayment',
                    principalPortion: params.principalPortion,
                    interestPortion: params.interestPortion,
                    timestamp: new Date(),
                },
            });

            await log.save();
            this.logger.log(`[TransactionLog] REPAY logged: ${log.transactionId}`);
            return log;
        } catch (error) {
            this.logger.error(`[TransactionLog] Failed to log repayment: ${error.message}`);
        }
    }

    /**
     * Ghi log Fixed Deposit Transfer
     */
    async logFDTransfer(params: {
        fdAccountId: number;
        investmentId: string;
        lenderId: string;
        amount: number;
        action: 'FD_CREATE' | 'FD_TRANSFER' | 'FD_CLOSE';
        fineractTransactionId?: number; // Added
        status?: string;
    }) {
        try {
            const log = new this.transactionLogModel({
                transactionId: `TXN_FD_${Date.now()}`,
                transactionType: params.action,
                amount: params.amount,
                status: params.status || 'SUCCESS',
                p2pContext: params.action === 'FD_CLOSE'
                    ? 'Hoàn vốn FD'
                    : 'Gửi vào FD',
                investmentId: params.investmentId,
                lenderId: params.lenderId,
                fineractFixedDepositAccountId: params.fdAccountId,
                fineractTransactionId: params.fineractTransactionId, // Saved
                metadata: {
                    action: params.action.toLowerCase(),
                    timestamp: new Date(),
                },
            });

            await log.save();
            this.logger.log(`[TransactionLog] ${params.action} logged: ${log.transactionId}`);
            return log;
        } catch (error) {
            this.logger.error(`[TransactionLog] Failed to log FD transfer: ${error.message}`);
        }
    }

    /**
     * Get transaction logs for a loan
     */
    async getLogsForLoan(loanId: string) {
        return this.transactionLogModel
            .find({ loanId })
            .sort({ createdAt: -1 })
            .exec();
    }

    /**
     * Get transaction logs for a lender
     */
    async getLogsForLender(lenderId: string) {
        return this.transactionLogModel
            .find({ lenderId })
            .sort({ createdAt: -1 })
            .exec();
    }
    /**
     * Ghi log Distribution (Phân phối tiền cho Lender từ Escrow)
     */
    async logDistribution(params: {
        loanId: string;
        lenderId: string;
        amount: number;
        type: 'PRINCIPAL' | 'INTEREST' | 'BOTH';
        fineractTransactionId?: number; // Added
        status?: string;
    }) {
        try {
            const log = new this.transactionLogModel({
                transactionId: `TXN_DIST_${Date.now()}`,
                transactionType: 'DISTRIBUTION',
                amount: params.amount,
                status: params.status || 'SUCCESS',
                p2pContext: 'Phân phối gốc & lãi cho nhà đầu tư',
                loanId: params.loanId,
                lenderId: params.lenderId,
                fineractTransactionId: params.fineractTransactionId, // Saved
                metadata: {
                    action: 'distribution',
                    type: params.type,
                    timestamp: new Date(),
                },
            });

            await log.save();
            this.logger.log(`[TransactionLog] DISTRIBUTION logged: ${log.transactionId}`);
            return log;
        } catch (error) {
            this.logger.error(`[TransactionLog] Failed to log distribution: ${error.message}`);
        }
    }

    /**
     * Ghi log Ký quỹ (Lender -> Escrow)
     */
    async logEscrowTransfer(params: {
        loanId: string;
        lenderId: string;
        amount: number;
        fineractTransactionId?: number;
    }) {
        try {
            const log = new this.transactionLogModel({
                transactionId: `TXN_ESCROW_${Date.now()}`,
                transactionType: 'ESCROW_TRANSFER',
                amount: params.amount,
                status: 'SUCCESS',
                p2pContext: 'Ký quỹ đầu tư',
                loanId: params.loanId,
                lenderId: params.lenderId,
                fineractTransactionId: params.fineractTransactionId,
                metadata: {
                    action: 'escrow_funding',
                    timestamp: new Date(),
                },
            });

            await log.save();
            this.logger.log(`[TransactionLog] ESCROW_TRANSFER logged: ${log.transactionId}`);
            return log;
        } catch (error) {
            this.logger.error(`[TransactionLog] Failed to log escrow transfer: ${error.message}`);
        }
    }

    /**
     * Ghi log Loan Creation (Tạo khoản vay mới)
     * Quan trọng cho đối soát: Tracking khoản vay từ khi tạo
     */
    async logLoanCreation(params: {
        loanId: string;
        borrowerId: string;
        capital: number;
        periodMonth?: number;
        rate?: number;
        fineractLoanId?: number;
        status?: string;
    }) {
        try {
            const log = new this.transactionLogModel({
                transactionId: `TXN_LOAN_${Date.now()}`,
                transactionType: 'LOAN_CREATION',
                amount: params.capital,
                status: params.status || 'PENDING',
                p2pContext: `Tạo khoản vay [${params.loanId}]`,
                loanId: params.loanId,
                borrowerId: params.borrowerId,
                fineractLoanId: params.fineractLoanId,
                metadata: {
                    action: 'loan_creation',
                    periodMonth: params.periodMonth,
                    rate: params.rate,
                    timestamp: new Date(),
                },
            });

            await log.save();
            this.logger.log(`[TransactionLog] LOAN_CREATION logged: ${log.transactionId}`);
            return log;
        } catch (error) {
            this.logger.error(`[TransactionLog] Failed to log loan creation: ${error.message}`);
        }
    }
}
