'use strict';

const { Contract } = require('fabric-contract-api');
const crypto = require('crypto');

class P2PLendingContract extends Contract {
    
    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================
    
    _hashData(data) {
        return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    }

    async _putState(ctx, key, data) {
        data.updatedAt = this._getTxTime(ctx);
        await ctx.stub.putState(key, Buffer.from(JSON.stringify(data)));
    }

    async _getState(ctx, key) {
        const dataBytes = await ctx.stub.getState(key);
        if (!dataBytes || dataBytes.length === 0) {
            throw new Error(`The asset ${key} does not exist`);
        }
        return JSON.parse(dataBytes.toString());
    }

    _getTxTime(ctx) {
        const ts = ctx.stub.getTxTimestamp();
        let seconds = 0;
        if (ts && ts.seconds) {
            if (typeof ts.seconds.low === 'number') {
                seconds = ts.seconds.low;
            } else if (typeof ts.seconds.toNumber === 'function') {
                seconds = ts.seconds.toNumber();
            } else if (typeof ts.seconds === 'number' || typeof ts.seconds === 'string') {
                seconds = parseInt(ts.seconds, 10);
            }
        }
        if (seconds === 0) {
            return new Date().toISOString(); // fallback just in case
        }
        return new Date(seconds * 1000).toISOString();
    }
    
    // ==========================================
    // INITIALIZATION
    // ==========================================

    async initLedger(ctx) {
        console.info('============= START : Initialize Ledger ===========');
        console.info('P2P Lending Ledger Initialized');
        console.info('============= END : Initialize Ledger ===========');
    }

    // ==========================================
    // LOAN CONTRACTS
    // ==========================================

    /**
     * Create a new Loan Contract on the ledger.
     * @param {Context} ctx
     * @param {String} contractId 
     * @param {String} contractDataJson - JSON string matching backend LoanContract schema
     */
    async createLoanContract(ctx, contractId, contractDataJson) {
        console.info('============= START : createLoanContract ===========');
        
        // Check if exists
        const exists = await ctx.stub.getState(contractId);
        if (exists && exists.length > 0) {
            throw new Error(`The loan contract ${contractId} already exists`);
        }

        const data = JSON.parse(contractDataJson);

        const loanContract = {
            docType: 'LoanContract',
            contractId: contractId,
            loanId: data.loanId,
            userId: data.userId,
            fineractLoanId: data.fineractLoanId || null,
            borrowerInfo: data.borrowerInfo || {},
            principalAmount: data.principalAmount,
            interestRate: data.interestRate,
            tenure: data.tenure,
            repaymentSchedule: data.repaymentSchedule || [],
            totalPayable: data.totalPayable,
            monthlyPayment: data.monthlyPayment,
            feeStructure: data.feeStructure || [],
            delinquencyPolicySnapshot: data.delinquencyPolicySnapshot || [],
            productName: data.productName || null,
            status: data.status || 'pending_signature',
            signedAt: data.signedAt || null,
            signatureData: data.signatureData || null,
            smartCASignatureVerified: data.smartCASignatureVerified || false,
            signatureProvider: data.signatureProvider || null,
            signatureVerifiedAt: data.signatureVerifiedAt || null,
            legalApprovalAt: data.legalApprovalAt || null,
            disbursementDate: data.disbursementDate || null,
            firstRepaymentDate: data.firstRepaymentDate || null,
            dataHash: this._hashData(data), // Store hash for data integrity verification
            createdAt: this._getTxTime(ctx),
            createdBy: ctx.clientIdentity.getID()
        };

        await this._putState(ctx, contractId, loanContract);
        console.info('============= END : createLoanContract ===========');
        return JSON.stringify(loanContract);
    }

    /**
     * Update status and optionally additional fields for a Loan Contract.
     * @param {Context} ctx 
     * @param {String} contractId 
     * @param {String} newStatus 
     * @param {String} additionalDataJson 
     */
    async updateLoanStatus(ctx, contractId, newStatus, additionalDataJson) {
        console.info('============= START : updateLoanStatus ===========');
        
        const loanContract = await this._getState(ctx, contractId);
        
        if (loanContract.docType !== 'LoanContract') {
            throw new Error(`Asset ${contractId} is not a LoanContract`);
        }

        loanContract.status = newStatus;

        if (additionalDataJson && additionalDataJson !== 'null' && additionalDataJson !== '{}') {
            const data = JSON.parse(additionalDataJson);
            // Update specific fields if provided
            if (data.fineractLoanId !== undefined) loanContract.fineractLoanId = data.fineractLoanId;
            if (data.signedAt !== undefined) loanContract.signedAt = data.signedAt;
            if (data.signatureData !== undefined) loanContract.signatureData = data.signatureData;
            if (data.smartCASignatureVerified !== undefined) loanContract.smartCASignatureVerified = data.smartCASignatureVerified;
            if (data.signatureProvider !== undefined) loanContract.signatureProvider = data.signatureProvider;
            if (data.signatureVerifiedAt !== undefined) loanContract.signatureVerifiedAt = data.signatureVerifiedAt;
            if (data.legalApprovalAt !== undefined) loanContract.legalApprovalAt = data.legalApprovalAt;
            if (data.disbursementDate !== undefined) loanContract.disbursementDate = data.disbursementDate;
            if (data.firstRepaymentDate !== undefined) loanContract.firstRepaymentDate = data.firstRepaymentDate;
            if (data.repaymentSchedule !== undefined) loanContract.repaymentSchedule = data.repaymentSchedule;
            
            // Re-hash after significant update
            loanContract.dataHash = this._hashData(loanContract);
        }

        await this._putState(ctx, contractId, loanContract);
        console.info('============= END : updateLoanStatus ===========');
        return JSON.stringify(loanContract);
    }

    async queryLoanContract(ctx, contractId) {
        return await this._getState(ctx, contractId);
    }

    // ==========================================
    // INVESTMENT CONTRACTS
    // ==========================================

    /**
     * Create an Investment Contract on the ledger.
     * @param {Context} ctx 
     * @param {String} contractId 
     * @param {String} contractDataJson - JSON string matching backend InvestmentContract schema
     */
    async createInvestmentContract(ctx, contractId, contractDataJson) {
        console.info('============= START : createInvestmentContract ===========');
        
        const exists = await ctx.stub.getState(contractId);
        if (exists && exists.length > 0) {
            throw new Error(`The investment contract ${contractId} already exists`);
        }

        const data = JSON.parse(contractDataJson);

        const investmentContract = {
            docType: 'InvestmentContract',
            contractId: contractId,
            lenderId: data.lenderId,
            loanApplicationId: data.loanApplicationId,
            investmentOrderId: data.investmentOrderId || null,
            capital: data.capital,
            numNotes: data.numNotes,
            periodMonth: data.periodMonth,
            monthlyRatePercent: data.monthlyRatePercent,
            annualRatePercent: data.annualRatePercent,
            monthlyIncome: data.monthlyIncome || 0,
            entirelyProfit: data.entirelyProfit || 0,
            entirelyPay: data.entirelyPay || 0,
            serviceFee: data.serviceFee || 0,
            status: data.status || 'pending',
            signedAt: data.signedAt || null,
            signatureData: data.signatureData || null,
            smartCASignatureVerified: data.smartCASignatureVerified || false,
            signatureProvider: data.signatureProvider || null,
            signatureVerifiedAt: data.signatureVerifiedAt || null,
            legalApprovalAt: data.legalApprovalAt || null,
            fineractFDAccountId: data.fineractFDAccountId || null,
            fineractFDAccountNo: data.fineractFDAccountNo || null,
            fineractFDProductId: data.fineractFDProductId || null,
            fdInterestRate: data.fdInterestRate || null,
            fdMaturityDate: data.fdMaturityDate || null,
            fdStatus: data.fdStatus || 'pending',
            fdInterestEarned: data.fdInterestEarned || 0,
            fdBalance: data.fdBalance || 0,
            lenderSchedule: data.lenderSchedule || [],
            scheduleTotalPrincipal: data.scheduleTotalPrincipal || 0,
            scheduleTotalInterest: data.scheduleTotalInterest || 0,
            scheduleTotalIncome: data.scheduleTotalIncome || 0,
            schedulePeriodCount: data.schedulePeriodCount || 0,
            repaymentHistory: data.repaymentHistory || [],
            totalReceived: data.totalReceived || 0,
            totalPrincipalReceived: data.totalPrincipalReceived || 0,
            totalInterestReceived: data.totalInterestReceived || 0,
            paymentStatus: data.paymentStatus || 'pending',
            paymentError: data.paymentError || null,
            dataHash: this._hashData(data),
            createdAt: this._getTxTime(ctx),
            createdBy: ctx.clientIdentity.getID()
        };

        await this._putState(ctx, contractId, investmentContract);
        console.info('============= END : createInvestmentContract ===========');
        return JSON.stringify(investmentContract);
    }

    /**
     * Update status and optionally additional fields for an Investment Contract.
     * @param {Context} ctx 
     * @param {String} contractId 
     * @param {String} newStatus 
     * @param {String} additionalDataJson 
     */
    async updateInvestmentStatus(ctx, contractId, newStatus, additionalDataJson) {
        console.info('============= START : updateInvestmentStatus ===========');
        
        const investmentContract = await this._getState(ctx, contractId);
        
        if (investmentContract.docType !== 'InvestmentContract') {
            throw new Error(`Asset ${contractId} is not an InvestmentContract`);
        }

        investmentContract.status = newStatus;

        if (additionalDataJson && additionalDataJson !== 'null' && additionalDataJson !== '{}') {
            const data = JSON.parse(additionalDataJson);
            
            // Update financial fields if provided
            if (data.fineractFDAccountId !== undefined) investmentContract.fineractFDAccountId = data.fineractFDAccountId;
            if (data.fineractFDAccountNo !== undefined) investmentContract.fineractFDAccountNo = data.fineractFDAccountNo;
            if (data.fdStatus !== undefined) investmentContract.fdStatus = data.fdStatus;
            if (data.signedAt !== undefined) investmentContract.signedAt = data.signedAt;
            if (data.signatureData !== undefined) investmentContract.signatureData = data.signatureData;
            if (data.smartCASignatureVerified !== undefined) investmentContract.smartCASignatureVerified = data.smartCASignatureVerified;
            if (data.lenderSchedule !== undefined) investmentContract.lenderSchedule = data.lenderSchedule;
            if (data.repaymentHistory !== undefined) investmentContract.repaymentHistory = data.repaymentHistory;
            if (data.paymentStatus !== undefined) investmentContract.paymentStatus = data.paymentStatus;
            
            // Counters update
            if (data.totalReceived !== undefined) investmentContract.totalReceived = data.totalReceived;
            if (data.totalPrincipalReceived !== undefined) investmentContract.totalPrincipalReceived = data.totalPrincipalReceived;
            if (data.totalInterestReceived !== undefined) investmentContract.totalInterestReceived = data.totalInterestReceived;

            // Re-hash after significant update
            investmentContract.dataHash = this._hashData(investmentContract);
        }

        await this._putState(ctx, contractId, investmentContract);
        console.info('============= END : updateInvestmentStatus ===========');
        return JSON.stringify(investmentContract);
    }

    async queryInvestmentContract(ctx, contractId) {
        return await this._getState(ctx, contractId);
    }

    // ==========================================
    // SETTLEMENT / REPAYMENT CONTRACTS
    // ==========================================

    /**
     * Create a Settlement/Repayment record on the ledger to track exactly what was paid.
     * @param {Context} ctx 
     * @param {String} settlementId 
     * @param {String} settlementDataJson 
     */
    async createSettlementContract(ctx, settlementId, settlementDataJson) {
        console.info('============= START : createSettlementContract ===========');
        
        const exists = await ctx.stub.getState(settlementId);
        if (exists && exists.length > 0) {
            throw new Error(`The settlement ${settlementId} already exists`);
        }

        const data = JSON.parse(settlementDataJson);

        const settlementContract = {
            docType: 'SettlementContract',
            settlementId: settlementId,
            loanContractId: data.loanContractId, // Reference to LoanContract.contractId
            fineractTransactionId: data.fineractTransactionId || null,
            period: data.period, // Which period this settlement is for
            amountPaid: data.amountPaid,
            principalPortion: data.principalPortion || 0,
            interestPortion: data.interestPortion || 0,
            feePortion: data.feePortion || 0,
            penaltyPortion: data.penaltyPortion || 0,
            paymentDate: data.paymentDate || this._getTxTime(ctx),
            status: data.status || 'completed', // 'pending', 'completed', 'failed'
            paymentMethod: data.paymentMethod || 'bank_transfer',
            dataHash: this._hashData(data),
            createdAt: this._getTxTime(ctx),
            createdBy: ctx.clientIdentity.getID()
        };

        await this._putState(ctx, settlementId, settlementContract);
        console.info('============= END : createSettlementContract ===========');
        return JSON.stringify(settlementContract);
    }

    async querySettlementContract(ctx, settlementId) {
        return await this._getState(ctx, settlementId);
    }

    // ==========================================
    // RICH QUERIES
    // ==========================================

    /**
     * Helper to execute rich queries
     */
    async _getQueryResultForQueryString(ctx, queryString) {
        const iterator = await ctx.stub.getQueryResult(queryString);
        const allResults = [];
        while (true) {
            const res = await iterator.next();
            if (res.value && res.value.value.toString()) {
                const Key = res.value.key;
                let Record;
                try {
                    Record = JSON.parse(res.value.value.toString('utf8'));
                } catch (err) {
                    console.log(err);
                    Record = res.value.value.toString('utf8');
                }
                allResults.push({ Key, Record });
            }
            if (res.done) {
                await iterator.close();
                return JSON.stringify(allResults);
            }
        }
    }

    async queryAllLoanContracts(ctx) {
        return await this._getAllByDocType(ctx, 'LoanContract');
    }

    async queryLoanContractsByUser(ctx, userId) {
        const allLoans = await this._getAllByDocType(ctx, 'LoanContract');
        return JSON.stringify(JSON.parse(allLoans).filter(item => item.Record && item.Record.userId === userId));
    }

    async queryInvestmentContractsByLoan(ctx, loanApplicationId) {
        const allInvestments = await this._getAllByDocType(ctx, 'InvestmentContract');
        return JSON.stringify(JSON.parse(allInvestments).filter(item => item.Record && item.Record.loanApplicationId === loanApplicationId));
    }

    async queryInvestmentContractsByLender(ctx, lenderId) {
        const allInvestments = await this._getAllByDocType(ctx, 'InvestmentContract');
        return JSON.stringify(JSON.parse(allInvestments).filter(item => item.Record && item.Record.lenderId === lenderId));
    }

    async querySettlementsByLoan(ctx, loanContractId) {
        const allSettlements = await this._getAllByDocType(ctx, 'SettlementContract');
        return JSON.stringify(JSON.parse(allSettlements).filter(item => item.Record && item.Record.loanContractId === loanContractId));
    }

    // Helper for LevelDB compatibility
    async _getAllByDocType(ctx, docType) {
        const iterator = await ctx.stub.getStateByRange('', '');
        const allResults = [];
        while (true) {
            const res = await iterator.next();
            if (res.value && res.value.value.toString()) {
                let record;
                try {
                    record = JSON.parse(res.value.value.toString('utf8'));
                } catch (err) {
                    console.log(err);
                    record = res.value.value.toString('utf8');
                }
                if (record && record.docType === docType) {
                    allResults.push({ Key: res.value.key, Record: record });
                }
            }
            if (res.done) {
                await iterator.close();
                return JSON.stringify(allResults);
            }
        }
    }

    async queryAllInvestmentContracts(ctx) {
        return await this._getAllByDocType(ctx, 'InvestmentContract');
    }

    async queryAllSettlementContracts(ctx) {
        return await this._getAllByDocType(ctx, 'SettlementContract');
    }

    async getContractHistory(ctx, contractId) {
        const iterator = await ctx.stub.getHistoryForKey(contractId);
        const allResults = [];
        while (true) {
            const res = await iterator.next();
            if (res.value) {
                const record = {
                    txId: res.value.txId,
                    timestamp: res.value.timestamp,
                    isDelete: res.value.isDelete,
                };
                try {
                    record.value = JSON.parse(res.value.value.toString('utf8'));
                } catch (err) {
                    record.value = res.value.value.toString('utf8');
                }
                allResults.push(record);
            }
            if (res.done) {
                await iterator.close();
                return JSON.stringify(allResults);
            }
        }
    }
}

module.exports = P2PLendingContract;