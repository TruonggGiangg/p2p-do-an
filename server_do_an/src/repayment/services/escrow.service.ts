import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Escrow, EscrowDocument } from '../schemas/escrow.schema';
import { FineractService } from '../../loan/services/fineract.service';
import { ConfigService } from '@nestjs/config';
import { Wallet, WalletDocument } from '../../invest/schemas/wallet.schema';

@Injectable()
export class EscrowService {
    private readonly logger = new Logger(EscrowService.name);
    private readonly adminEscrowAccountId: number;
    private readonly adminClientId: number;

    constructor(
        @InjectModel(Escrow.name) private escrowModel: Model<EscrowDocument>,
        @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
        private readonly fineractService: FineractService,
        private readonly configService: ConfigService,
    ) {
        this.adminClientId = this.configService.get<number>('FINERACT_ADMIN_CLIENT_ID') || 1;
        this.adminEscrowAccountId = this.configService.get<number>('FINERACT_ESCROW_ACCOUNT_ID') || 1;
    }

    /**
     * Create escrow record for tracking
     */
    async createFineractEscrow(loanId: string, lenderId: string, borrowerId: string, amount: number): Promise<Escrow> {
        try {
            const escrow = new this.escrowModel({
                escrowId: `FINESCROW_${Date.now()}`,
                loanContractId: loanId,
                lenderId,
                borrowerId,
                amount,
                status: 'waiting',
                transactionId: 'pending',
                paymentMethod: 'fineract',
                metadata: {
                    escrowType: 'fineract',
                    createdAt: new Date(),
                }
            });
            return await escrow.save();
        } catch (error) {
            this.logger.error(`Failed to create escrow: ${error.message}`);
            throw error;
        }
    }

    /**
     * Fund escrow from Lender -> Admin Escrow Account
     */
    async fundFineractEscrow(escrowId: string, lenderId: string, amount: number): Promise<any> {
        try {
            const escrow = await this.escrowModel.findOne({ escrowId, lenderId });
            if (!escrow || escrow.status !== 'waiting') {
                throw new Error('Escrow not ready for funding');
            }

            // Find Lender's Fineract Client ID
            let fineractClientId: string | number = '';

            // Try Wallet first
            const wallet = await this.walletModel.findOne({ p2pUserId: lenderId });
            if (wallet?.fineractClientId) {
                fineractClientId = wallet.fineractClientId;
            }

            if (!fineractClientId) {
                throw new Error('Lender Fineract Client ID not found (Wallet not linked)');
            }

            // Get Lender's Savings Account
            const lenderDetails = await this.fineractService.getClientDetails(Number(fineractClientId));
            // Filter for active savings account (ID 100 is usually Savings)
            const lenderSavings = lenderDetails.savingsAccounts?.find((acc: any) =>
                acc.status?.active === true && acc.depositType?.id === 100
            );

            if (!lenderSavings) {
                throw new Error('Lender active savings account not found');
            }

            // Execute Transfer: Lender -> Admin Escrow
            const transferResult = await this.fineractService.transferFunds(
                Number(fineractClientId),
                this.adminClientId,
                lenderSavings.id,
                this.adminEscrowAccountId,
                amount,
                `Fund escrow for loan ${escrow.loanContractId}`
            );

            // Update Escrow Status
            escrow.status = 'escrowed';
            escrow.transactionId = transferResult.resourceId;
            escrow.fineractTransferId = transferResult.resourceId;
            escrow.metadata = {
                ...escrow.metadata,
                fundedAt: new Date(),
                fineractAccountId: this.adminEscrowAccountId
            };
            await escrow.save();

            return {
                success: true,
                transactionId: transferResult.resourceId,
                escrowId: escrow.escrowId
            };

        } catch (error) {
            this.logger.error(`Fund escrow failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Disburse Loan: Admin Escrow -> Borrower
     */
    async disburseLoanFromEscrow(loanId: string, borrowerClientId: number, amount: number): Promise<any> {
        try {
            // Get Borrower Savings Account
            const borrowerDetails = await this.fineractService.getClientDetails(borrowerClientId);
            const borrowerSavings = borrowerDetails.savingsAccounts?.find((acc: any) => acc.status?.active === true);

            if (!borrowerSavings) {
                throw new Error('Borrower active savings account not found');
            }

            // Execute Transfer: Admin Escrow -> Borrower
            const transferResult = await this.fineractService.transferFunds(
                this.adminClientId,
                borrowerClientId,
                this.adminEscrowAccountId,
                borrowerSavings.id,
                amount,
                `Disbursement for loan ${loanId}`
            );

            return {
                success: true,
                transferId: transferResult.resourceId,
                recipientAccountId: borrowerSavings.id
            };
        } catch (error) {
            this.logger.error(`Disburse loan failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Distribute Repayment: Borrower repayment (via Escrow) -> Lenders
     */
    async distributeRepaymentToLenders(loanId: string, repaymentAmount: number, investments: any[]): Promise<any[]> {
        const results: any[] = []; // Explicitly type as any[] or specific interface

        // Note: Money is already in Admin Escrow Account (transferred by RepaymentController)

        for (const investment of investments) {
            const { lenderId, capital, totalCapital } = investment;
            const ratio = capital / totalCapital;
            const lenderShare = Math.floor(repaymentAmount * ratio);

            if (lenderShare <= 0) continue;

            try {
                // Find Lender Wallet/Client ID
                const wallet = await this.walletModel.findOne({ p2pUserId: lenderId }); // Assuming lenderId is string
                if (!wallet || !wallet.fineractClientId) {
                    this.logger.warn(`Lender ${lenderId} wallet not found, skipping distribution`);
                    results.push({ lenderId, amount: 0, error: 'Wallet not found' });
                    continue;
                }

                const lenderClientId = Number(wallet.fineractClientId);

                // Get Lender Savings Account
                const lenderDetails = await this.fineractService.getClientDetails(lenderClientId);
                const lenderSavings = lenderDetails.savingsAccounts?.find((acc: any) => acc.status?.active === true);

                if (!lenderSavings) {
                    this.logger.warn(`Lender ${lenderId} savings account not found, skipping`);
                    results.push({ lenderId, amount: 0, error: 'Savings account not found' });
                    continue;
                }

                // Transfer: Admin Escrow -> Lender
                const transferResult = await this.fineractService.transferFunds(
                    this.adminClientId,
                    lenderClientId,
                    this.adminEscrowAccountId,
                    lenderSavings.id,
                    lenderShare,
                    `Repayment distribution for loan ${loanId}`
                );

                results.push({
                    lenderId,
                    amount: lenderShare,
                    transferId: transferResult.resourceId
                });

            } catch (error) {
                this.logger.error(`Distribution to lender ${lenderId} failed: ${error.message}`);
                results.push({ lenderId, amount: 0, error: error.message });
            }
        }

        return results;
    }
}
