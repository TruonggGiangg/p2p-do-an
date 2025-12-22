import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Escrow, EscrowDocument } from '../schemas/escrow.schema';
import { EscrowLog, EscrowLogDocument } from '../schemas/escrow-log.schema';
import { FineractService } from '../../loan/services/fineract.service';

@Injectable()
export class FineractEscrowService {
    private readonly logger = new Logger(FineractEscrowService.name);
    private readonly adminClientId: number;
    private readonly escrowAccountId: number;

    constructor(
        @InjectModel(Escrow.name) private escrowModel: Model<EscrowDocument>,
        @InjectModel(EscrowLog.name) private escrowLogModel: Model<EscrowLogDocument>,
        private readonly fineractService: FineractService,
        private readonly configService: ConfigService,
    ) {
        this.adminClientId = parseInt(this.configService.get('FINERACT_ADMIN_CLIENT_ID', '1'));
        this.escrowAccountId = parseInt(this.configService.get('FINERACT_ESCROW_ACCOUNT_ID', '1'));

        this.logger.log(`[Init] Escrow Admin Client ID: ${this.adminClientId}, Account ID: ${this.escrowAccountId}`);
    }

    /**
     * Log escrow action for audit trail
     */
    private async logAction(
        escrowId: string,
        action: string,
        details?: any
    ): Promise<void> {
        try {
            await this.escrowLogModel.create({
                escrowId,
                action,
                amount: details?.amount,
                userId: details?.userId,
                transactionId: details?.transactionId,
                details: details || {},
                timestamp: new Date(),
            });
            this.logger.log(`[EscrowLog] ${escrowId}: ${action}`, details);
        } catch (error) {
            this.logger.error(`[EscrowLog] Failed to log action: ${error.message}`);
        }
    }

    /**
     * Create new escrow record
     */
    async createEscrow(
        loanContractId: string,
        lenderId: string,
        borrowerId: string,
        amount: number,
        metadata?: any
    ): Promise<EscrowDocument> {
        const escrowId = `ESCROW_${Date.now()}`;

        this.logger.log(`[createEscrow] Creating escrow ${escrowId} for loan ${loanContractId}, amount: ${amount}`);

        const escrow = await this.escrowModel.create({
            escrowId,
            loanContractId,
            lenderId,
            borrowerId,
            amount,
            status: 'waiting',
            metadata: {
                ...metadata,
                createdAt: new Date(),
            },
        });

        await this.logAction(escrowId, 'created', {
            loanContractId,
            amount,
            userId: lenderId,
        });

        return escrow;
    }

    /**
     * Fund escrow: Transfer from lender to escrow account
     */
    async fundEscrow(
        escrowId: string,
        lenderClientId: number,
        lenderAccountId: number
    ): Promise<string> {
        this.logger.log(`[fundEscrow] START: ${escrowId}, lender: ${lenderClientId}:${lenderAccountId}`);

        const escrow = await this.escrowModel.findOne({ escrowId });
        if (!escrow) {
            throw new Error(`Escrow ${escrowId} not found`);
        }

        if (escrow.status !== 'waiting') {
            this.logger.warn(`[fundEscrow] Escrow ${escrowId} already ${escrow.status}`);
            return escrow.fundTransactionId || '';
        }

        try {
            // Transfer: Lender → Escrow
            this.logger.log(`[fundEscrow] Transferring ${escrow.amount} from lender ${lenderClientId}:${lenderAccountId} → escrow ${this.adminClientId}:${this.escrowAccountId}`);

            const txnResponse = await this.fineractService.transferFunds(
                lenderClientId,
                this.adminClientId,
                lenderAccountId,
                this.escrowAccountId,
                escrow.amount,
                `Escrow fund: ${escrowId}`
            );

            const transactionId = txnResponse.savingsId || txnResponse.resourceId;
            this.logger.log(`[fundEscrow] SUCCESS: Transaction ID ${transactionId}`);

            // Update escrow status
            escrow.status = 'funded';
            escrow.fundTransactionId = String(transactionId);
            escrow.metadata = {
                ...escrow.metadata,
                fundedAt: new Date(),
                fineractLenderClientId: lenderClientId,
            };
            await escrow.save();

            await this.logAction(escrowId, 'funded', {
                amount: escrow.amount,
                transactionId,
                userId: escrow.lenderId,
            });

            return String(transactionId);
        } catch (error) {
            this.logger.error(`[fundEscrow] FAILED: ${error.message}`);
            escrow.status = 'failed';
            escrow.metadata = {
                ...escrow.metadata,
                errorMessage: error.message,
            };
            await escrow.save();

            await this.logAction(escrowId, 'failed', {
                errorMessage: error.message,
            });

            throw error;
        }
    }

    /**
     * Release escrow: Transfer from escrow to borrower account
     */
    async releaseEscrow(
        escrowId: string,
        borrowerClientId: number,
        borrowerAccountId: number
    ): Promise<string> {
        this.logger.log(`[releaseEscrow] START: ${escrowId}, borrower: ${borrowerClientId}:${borrowerAccountId}`);

        const escrow = await this.escrowModel.findOne({ escrowId });
        if (!escrow) {
            throw new Error(`Escrow ${escrowId} not found`);
        }

        if (escrow.status !== 'funded') {
            throw new Error(`Escrow ${escrowId} not funded (status: ${escrow.status})`);
        }

        try {
            // Transfer: Escrow → Borrower
            this.logger.log(`[releaseEscrow] Transferring ${escrow.amount} from escrow ${this.adminClientId}:${this.escrowAccountId} → borrower ${borrowerClientId}:${borrowerAccountId}`);

            const txnResponse = await this.fineractService.transferFunds(
                this.adminClientId,
                borrowerClientId,
                this.escrowAccountId,
                borrowerAccountId,
                escrow.amount,
                `Escrow release: ${escrowId}`
            );

            const transactionId = txnResponse.savingsId || txnResponse.resourceId;
            this.logger.log(`[releaseEscrow] SUCCESS: Transaction ID ${transactionId}`);

            // Update escrow status
            escrow.status = 'released';
            escrow.releaseTransactionId = String(transactionId);
            escrow.metadata = {
                ...escrow.metadata,
                releasedAt: new Date(),
                fineractBorrowerClientId: borrowerClientId,
            };
            await escrow.save();

            await this.logAction(escrowId, 'released', {
                amount: escrow.amount,
                transactionId,
                userId: escrow.borrowerId,
            });

            return String(transactionId);
        } catch (error) {
            this.logger.error(`[releaseEscrow] FAILED: ${error.message}`);
            escrow.metadata = {
                ...escrow.metadata,
                releaseError: error.message,
            };
            await escrow.save();

            await this.logAction(escrowId, 'release_failed', {
                errorMessage: error.message,
            });

            throw error;
        }
    }

    /**
     * Return escrow funds to lender (if loan cancelled)
     */
    async returnEscrow(
        escrowId: string,
        lenderClientId: number,
        lenderAccountId: number
    ): Promise<string> {
        this.logger.log(`[returnEscrow] START: ${escrowId}, lender: ${lenderClientId}:${lenderAccountId}`);

        const escrow = await this.escrowModel.findOne({ escrowId });
        if (!escrow) {
            throw new Error(`Escrow ${escrowId} not found`);
        }

        if (escrow.status !== 'funded') {
            throw new Error(`Escrow ${escrowId} cannot be returned (status: ${escrow.status})`);
        }

        try {
            // Transfer: Escrow → Lender (return)
            const txnResponse = await this.fineractService.transferFunds(
                this.adminClientId,
                lenderClientId,
                this.escrowAccountId,
                lenderAccountId,
                escrow.amount,
                `Escrow return: ${escrowId}`
            );

            const transactionId = txnResponse.savingsId || txnResponse.resourceId;
            this.logger.log(`[returnEscrow] SUCCESS: Transaction ID ${transactionId}`);

            escrow.status = 'returned';
            escrow.returnTransactionId = String(transactionId);
            escrow.metadata = {
                ...escrow.metadata,
                returnedAt: new Date(),
            };
            await escrow.save();

            await this.logAction(escrowId, 'returned', {
                amount: escrow.amount,
                transactionId,
                userId: escrow.lenderId,
            });

            return String(transactionId);
        } catch (error) {
            this.logger.error(`[returnEscrow] FAILED: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get escrow by ID
     */
    async getEscrow(escrowId: string): Promise<EscrowDocument | null> {
        return this.escrowModel.findOne({ escrowId });
    }

    /**
     * Get escrow logs
     */
    async getEscrowLogs(escrowId: string): Promise<EscrowLogDocument[]> {
        return this.escrowLogModel
            .find({ escrowId })
            .sort({ timestamp: -1 })
            .exec();
    }
}
