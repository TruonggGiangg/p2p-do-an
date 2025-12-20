'use strict';

const { Contract } = require('fabric-contract-api');

/**
 * P2P Lending Smart Contract - Redesigned for Fineract Integration
 * 
 * DESIGN PRINCIPLES:
 * 1. NO rate calculation on blockchain - rates come from Fineract via server
 * 2. Blockchain stores immutable records for audit trail
 * 3. Fields are synced with Fineract loan structure
 * 4. Simplified data model focusing on essential fields
 * 
 * DATA FLOW:
 * Server (InterestRateCalculator) → Fineract (Loan Management) → Blockchain (Immutable Record)
 */
class P2PLendingContract extends Contract {

  // ===== INITIALIZATION =====

  async initLedger(ctx) {
    console.log('P2P Lending Chaincode initialized');
    return;
  }

  // ===== LOAN CONTRACT MANAGEMENT =====

  /**
   * Create a new loan contract
   * Rates are calculated by server (InterestRateCalculator) and stored on Fineract
   * Blockchain stores the immutable record
   * 
   * @param {Context} ctx - Transaction context
   * @param {String} loanId - Unique loan ID (e.g., LOAN_1703123456789)
   * @param {String} borrowerJson - JSON string of borrower info
   * @param {String} loanInfoJson - JSON string of loan info (from Fineract)
   * @param {String} fineractLoanId - Fineract loan ID (optional)
   */
  async createLoanContract(ctx, loanId, borrowerJson, loanInfoJson, fineractLoanId) {
    // Parse inputs
    const borrower = JSON.parse(borrowerJson);
    const loanInfo = JSON.parse(loanInfoJson);

    // Get transaction timestamp
    const txTimestamp = ctx.stub.getTxTimestamp();
    const createdAt = new Date(txTimestamp.seconds.low * 1000).toISOString();

    // Validate required fields
    if (!loanInfo.capital || !loanInfo.periodMonth) {
      throw new Error('Missing required loan info: capital, periodMonth');
    }

    // Calculate totalNotes (unit: 500,000 VND)
    const noteUnitPrice = 500000;
    const totalNotes = Math.ceil(loanInfo.capital / noteUnitPrice);

    // Create loan contract object (synced with Fineract fields)
    const loanContract = {
      // === IDENTIFICATION ===
      contractId: loanId,
      docType: 'LoanContract',
      
      // === BORROWER INFO ===
      borrower: {
        id: borrower._id || borrower.id,
        username: borrower.username,
        email: borrower.email || null,
        name: borrower.name || borrower.username,
      },

      // === LOAN INFO (from server via Fineract calculation) ===
      info: {
        capital: parseInt(loanInfo.capital),
        periodMonth: parseInt(loanInfo.periodMonth),
        willing: loanInfo.willing || '',
        
        // Rates from Fineract (via InterestRateCalculator)
        rate: parseFloat(loanInfo.rate) || 0,                    // Monthly borrower rate
        annualRate: parseFloat(loanInfo.annualRate) || 0,        // Annual borrower rate
        lenderRate: parseFloat(loanInfo.lenderRate) || 0,        // Monthly lender rate
        annualLenderRate: parseFloat(loanInfo.annualLenderRate) || 0, // Annual lender rate
        adminSpread: parseFloat(loanInfo.adminSpread) || 0,      // Admin spread (annual)
        
        // Payment breakdown (from server)
        monthlyPrincipalPay: parseInt(loanInfo.monthlyPrincipalPay) || 0,
        monthlyInterestPay: parseInt(loanInfo.monthlyInterestPay) || 0,
        monthlyPay: parseInt(loanInfo.monthlyPay) || 0,
        entirelyPay: parseInt(loanInfo.entirelyPay) || 0,
        
        // Dates
        disbursementDate: loanInfo.disbursementDate || createdAt,
        maturityDate: loanInfo.maturityDate || this._calculateMaturityDate(loanInfo.disbursementDate || createdAt, loanInfo.periodMonth),
        createdAt: createdAt,
      },

      // === INVESTMENT INFO ===
      totalNotes: totalNotes,
      investedNotes: 0,
      matchPercentage: 0,
      isFullMatch: false,

      // === STATUS ===
      status: 'waiting', // waiting, success, clean, fail

      // === FINERACT SYNC ===
      fineract: {
        loanId: fineractLoanId ? parseInt(fineractLoanId) : null,
        status: fineractLoanId ? 'SUBMITTED_AND_PENDING_APPROVAL' : null,
        syncedAt: fineractLoanId ? createdAt : null,
        productId: loanInfo.fineractProductId || null,
      },

      // === LOAN SIZE TIER ===
      loanSizeTier: this._getLoanSizeTier(loanInfo.capital),

      // === METADATA ===
      createdAt: createdAt,
      updatedAt: createdAt,
      lastReminderSent: null,
    };

    // Store on blockchain
    const key = `LoanContract_${loanId}`;
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(loanContract)));

    console.log(`[Chaincode] Created loan contract: ${loanId}`);
    return JSON.stringify(loanContract);
  }

  /**
   * Update loan with Fineract sync data
   * Called after Fineract loan is created/updated
   */
  async syncLoanWithFineract(ctx, loanId, fineractDataJson) {
    const key = `LoanContract_${loanId}`;
    const bytes = await ctx.stub.getState(key);
    
    if (!bytes || bytes.length === 0) {
      throw new Error(`LoanContract ${loanId} not found`);
    }

    const loan = JSON.parse(bytes.toString());
    const fineractData = JSON.parse(fineractDataJson);
    const txTimestamp = ctx.stub.getTxTimestamp();
    const now = new Date(txTimestamp.seconds.low * 1000).toISOString();

    // Update Fineract sync info
    loan.fineract = {
      ...loan.fineract,
      loanId: fineractData.fineractLoanId || loan.fineract.loanId,
      status: fineractData.status || loan.fineract.status,
      syncedAt: now,
      productId: fineractData.productId || loan.fineract.productId,
      // Repayment schedule from Fineract
      repaymentSchedule: fineractData.repaymentSchedule || null,
      // Timeline from Fineract
      timeline: fineractData.timeline || null,
    };

    // Update rates if provided
    if (fineractData.interestRate) {
      loan.info.rate = fineractData.interestRate.perPeriod || loan.info.rate;
      loan.info.annualRate = fineractData.interestRate.annual || loan.info.annualRate;
    }

    loan.updatedAt = now;

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(loan)));
    return JSON.stringify(loan);
  }

  /**
   * Update loan status
   */
  async updateLoanStatus(ctx, loanId, status) {
    const key = `LoanContract_${loanId}`;
    const bytes = await ctx.stub.getState(key);
    
    if (!bytes || bytes.length === 0) {
      throw new Error(`LoanContract ${loanId} not found`);
    }

    const loan = JSON.parse(bytes.toString());
    const txTimestamp = ctx.stub.getTxTimestamp();
    const now = new Date(txTimestamp.seconds.low * 1000).toISOString();

    // Validate status
    const validStatuses = ['waiting', 'success', 'clean', 'fail'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Valid: ${validStatuses.join(', ')}`);
    }

    loan.status = status;
    loan.updatedAt = now;

    // If success (fully funded), update match status
    if (status === 'success') {
      loan.isFullMatch = true;
      loan.matchPercentage = 100;
    }

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(loan)));
    return JSON.stringify(loan);
  }

  /**
   * Update investment progress
   */
  async updateInvestmentProgress(ctx, loanId, investedNotes) {
    const key = `LoanContract_${loanId}`;
    const bytes = await ctx.stub.getState(key);
    
    if (!bytes || bytes.length === 0) {
      throw new Error(`LoanContract ${loanId} not found`);
    }

    const loan = JSON.parse(bytes.toString());
    const txTimestamp = ctx.stub.getTxTimestamp();
    const now = new Date(txTimestamp.seconds.low * 1000).toISOString();

    loan.investedNotes = parseInt(investedNotes);
    loan.matchPercentage = Math.round((loan.investedNotes / loan.totalNotes) * 100);
    loan.isFullMatch = loan.investedNotes >= loan.totalNotes;
    loan.updatedAt = now;

    // Auto-update status if fully funded
    if (loan.isFullMatch && loan.status === 'waiting') {
      loan.status = 'success';
    }

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(loan)));
    return JSON.stringify(loan);
  }

  // ===== INVESTMENT CONTRACT MANAGEMENT =====

  /**
   * Create investment contract
   * Records lender's investment in a loan
   */
  async createInvestmentContract(ctx, investId, loanId, lenderJson, investInfoJson, fineractAccountId) {
    const lender = JSON.parse(lenderJson);
    const investInfo = JSON.parse(investInfoJson);
    const txTimestamp = ctx.stub.getTxTimestamp();
    const createdAt = new Date(txTimestamp.seconds.low * 1000).toISOString();

    // Verify loan exists
    const loanKey = `LoanContract_${loanId}`;
    const loanBytes = await ctx.stub.getState(loanKey);
    if (!loanBytes || loanBytes.length === 0) {
      throw new Error(`LoanContract ${loanId} not found`);
    }

    const investmentContract = {
      contractId: investId,
      docType: 'InvestmentContract',
      loanId: loanId,

      // Lender info
      lender: {
        id: lender._id || lender.id,
        username: lender.username,
        email: lender.email || null,
        name: lender.name || lender.username,
      },

      // Investment info
      info: {
        capital: parseInt(investInfo.capital),
        notes: parseInt(investInfo.notes) || Math.ceil(investInfo.capital / 500000),
        rate: parseFloat(investInfo.lenderRate) || 0,         // Lender rate
        annualRate: parseFloat(investInfo.annualLenderRate) || 0,
        expectedReturn: parseInt(investInfo.expectedReturn) || 0,
        estimatedMonthlyReturn: parseInt(investInfo.estimatedMonthlyReturn) || 0,
      },

      // Status
      status: 'waiting_other', // waiting_other, active, completed, cancelled

      // Fineract sync
      fineract: {
        savingsAccountId: fineractAccountId ? parseInt(fineractAccountId) : null,
        fixedDepositAccountId: investInfo.fixedDepositAccountId || null,
        syncedAt: createdAt,
      },

      // Tracking
      totalReceived: 0,
      totalPrincipalReceived: 0,
      totalInterestReceived: 0,

      // Metadata
      createdAt: createdAt,
      updatedAt: createdAt,
    };

    const key = `InvestmentContract_${investId}`;
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(investmentContract)));

    return JSON.stringify(investmentContract);
  }

  /**
   * Update investment status
   */
  async updateInvestmentStatus(ctx, investId, status) {
    const key = `InvestmentContract_${investId}`;
    const bytes = await ctx.stub.getState(key);
    
    if (!bytes || bytes.length === 0) {
      throw new Error(`InvestmentContract ${investId} not found`);
    }

    const investment = JSON.parse(bytes.toString());
    const txTimestamp = ctx.stub.getTxTimestamp();
    const now = new Date(txTimestamp.seconds.low * 1000).toISOString();

    investment.status = status;
    investment.updatedAt = now;

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(investment)));
    return JSON.stringify(investment);
  }

  // ===== SETTLEMENT (REPAYMENT) MANAGEMENT =====

  /**
   * Create settlement contract for a repayment period
   * Synced with Fineract repayment schedule
   */
  async createSettlementContract(ctx, settledId, loanId, settlementInfoJson) {
    const settlementInfo = JSON.parse(settlementInfoJson);
    const txTimestamp = ctx.stub.getTxTimestamp();
    const createdAt = new Date(txTimestamp.seconds.low * 1000).toISOString();

    const settlementContract = {
      contractId: settledId,
      docType: 'SettlementContract',
      loanId: loanId,

      // Payment info (from Fineract schedule)
      info: {
        principalAmount: parseInt(settlementInfo.principalDue) || 0,
        interestAmount: parseInt(settlementInfo.interestDue) || 0,
        feeAmount: parseInt(settlementInfo.feeChargesDue) || 0,
        penaltyAmount: parseInt(settlementInfo.penaltyChargesDue) || 0,
        totalAmount: parseInt(settlementInfo.totalDue) || 0,
        maturityDate: settlementInfo.dueDate,
        period: parseInt(settlementInfo.period) || 1,
      },

      // Status
      status: 'undue', // undue, due, overdue, settled, partially_paid

      // Fineract sync
      fineract: {
        transactionId: settlementInfo.transactionId || null,
        fromPeriod: settlementInfo.fromPeriod || null,
        toPeriod: settlementInfo.toPeriod || null,
      },

      // Payments tracking
      payments: [],
      totalPaid: 0,
      remainingAmount: parseInt(settlementInfo.totalDue) || 0,

      // Metadata
      orderNo: parseInt(settlementInfo.period) || 1,
      createdAt: createdAt,
      updatedAt: createdAt,
    };

    const key = `SettlementContract_${settledId}`;
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(settlementContract)));

    return JSON.stringify(settlementContract);
  }

  /**
   * Record a payment on settlement
   */
  async settlePayment(ctx, settledId, amount, paymentType = 'full') {
    const key = `SettlementContract_${settledId}`;
    const bytes = await ctx.stub.getState(key);
    
    if (!bytes || bytes.length === 0) {
      throw new Error(`SettlementContract ${settledId} not found`);
    }

    const settlement = JSON.parse(bytes.toString());
    const txTimestamp = ctx.stub.getTxTimestamp();
    const now = new Date(txTimestamp.seconds.low * 1000).toISOString();
    const paymentAmount = parseInt(amount);

    // Add payment record
    settlement.payments.push({
      amount: paymentAmount,
      date: now,
      type: paymentType, // full, partial, prepay
    });

    // Update totals
    settlement.totalPaid += paymentAmount;
    settlement.remainingAmount = Math.max(0, settlement.info.totalAmount - settlement.totalPaid);

    // Update status
    if (settlement.totalPaid >= settlement.info.totalAmount) {
      settlement.status = 'settled';
      settlement.info.realpaidDate = now;
    } else if (settlement.totalPaid > 0) {
      settlement.status = 'partially_paid';
    }

    settlement.updatedAt = now;

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(settlement)));
    return JSON.stringify(settlement);
  }

  // ===== QUERY FUNCTIONS =====

  /**
   * Query loan contract by ID
   */
  async queryLoanContract(ctx, loanId) {
    const key = `LoanContract_${loanId}`;
    const bytes = await ctx.stub.getState(key);
    
    if (!bytes || bytes.length === 0) {
      throw new Error(`LoanContract ${loanId} not found`);
    }
    
    return bytes.toString();
  }

  /**
   * Query all loan contracts
   */
  async queryAllLoanContracts(ctx) {
    const results = [];
    
    for await (const { key, value } of ctx.stub.getStateByRange('LoanContract_', 'LoanContract_~')) {
      results.push(JSON.parse(value.toString()));
    }
    
    return JSON.stringify(results);
  }

  /**
   * Query loans by status
   */
  async queryLoansByStatus(ctx, status) {
    const results = [];
    
    for await (const { key, value } of ctx.stub.getStateByRange('LoanContract_', 'LoanContract_~')) {
      const loan = JSON.parse(value.toString());
      if (loan.status === status) {
        results.push(loan);
      }
    }
    
    return JSON.stringify(results);
  }

  /**
   * Query waiting loans (for lenders)
   */
  async queryWaitingLoans(ctx) {
    const results = [];
    
    for await (const { key, value } of ctx.stub.getStateByRange('LoanContract_', 'LoanContract_~')) {
      const loan = JSON.parse(value.toString());
      if (loan.status === 'waiting' && !loan.isFullMatch) {
        results.push(loan);
      }
    }
    
    return JSON.stringify(results);
  }

  /**
   * Query loans by borrower ID
   */
  async queryLoansByBorrower(ctx, borrowerId) {
    const results = [];
    
    for await (const { key, value } of ctx.stub.getStateByRange('LoanContract_', 'LoanContract_~')) {
      const loan = JSON.parse(value.toString());
      if (loan.borrower && loan.borrower.id === borrowerId) {
        results.push(loan);
      }
    }
    
    return JSON.stringify(results);
  }

  /**
   * Query investment contract by ID
   */
  async queryInvestmentContract(ctx, investId) {
    const key = `InvestmentContract_${investId}`;
    const bytes = await ctx.stub.getState(key);
    
    if (!bytes || bytes.length === 0) {
      throw new Error(`InvestmentContract ${investId} not found`);
    }
    
    return bytes.toString();
  }

  /**
   * Query investments by loan ID
   */
  async queryInvestmentsByLoan(ctx, loanId) {
    const results = [];
    
    for await (const { key, value } of ctx.stub.getStateByRange('InvestmentContract_', 'InvestmentContract_~')) {
      const investment = JSON.parse(value.toString());
      if (investment.loanId === loanId) {
        results.push(investment);
      }
    }
    
    return JSON.stringify(results);
  }

  /**
   * Query investments by lender ID
   */
  async queryInvestmentsByLender(ctx, lenderId) {
    const results = [];
    
    for await (const { key, value } of ctx.stub.getStateByRange('InvestmentContract_', 'InvestmentContract_~')) {
      const investment = JSON.parse(value.toString());
      if (investment.lender && investment.lender.id === lenderId) {
        results.push(investment);
      }
    }
    
    return JSON.stringify(results);
  }

  /**
   * Query settlement contracts by loan ID
   */
  async querySettlementsByLoan(ctx, loanId) {
    const results = [];
    
    for await (const { key, value } of ctx.stub.getStateByRange('SettlementContract_', 'SettlementContract_~')) {
      const settlement = JSON.parse(value.toString());
      if (settlement.loanId === loanId) {
        results.push(settlement);
      }
    }
    
    // Sort by orderNo
    results.sort((a, b) => a.orderNo - b.orderNo);
    
    return JSON.stringify(results);
  }

  /**
   * Get loan statistics
   */
  async getLoanStatistics(ctx, loanId) {
    const loanKey = `LoanContract_${loanId}`;
    const loanBytes = await ctx.stub.getState(loanKey);
    
    if (!loanBytes || loanBytes.length === 0) {
      throw new Error(`LoanContract ${loanId} not found`);
    }

    const loan = JSON.parse(loanBytes.toString());
    
    // Query settlements
    let totalPaid = 0;
    let totalRemaining = 0;
    let overdueAmount = 0;
    let settledCount = 0;
    let totalCount = 0;

    for await (const { key, value } of ctx.stub.getStateByRange('SettlementContract_', 'SettlementContract_~')) {
      const settlement = JSON.parse(value.toString());
      if (settlement.loanId === loanId) {
        totalCount++;
        totalPaid += settlement.totalPaid || 0;
        totalRemaining += settlement.remainingAmount || 0;
        
        if (settlement.status === 'settled') {
          settledCount++;
        }
        if (settlement.status === 'overdue') {
          overdueAmount += settlement.info.penaltyAmount || 0;
        }
      }
    }

    return JSON.stringify({
      loanId,
      loan: {
        capital: loan.info.capital,
        rate: loan.info.rate,
        annualRate: loan.info.annualRate,
        entirelyPay: loan.info.entirelyPay,
        status: loan.status,
      },
      funding: {
        totalNotes: loan.totalNotes,
        investedNotes: loan.investedNotes,
        matchPercentage: loan.matchPercentage,
        isFullMatch: loan.isFullMatch,
      },
      repayment: {
        totalPaid,
        totalRemaining,
        overdueAmount,
        settledCount,
        totalCount,
        progressPercentage: totalCount > 0 ? Math.round((settledCount / totalCount) * 100) : 0,
      },
      fineract: loan.fineract,
    });
  }

  // ===== HELPER FUNCTIONS =====

  _calculateMaturityDate(disbursementDate, periodMonth) {
    const date = new Date(disbursementDate);
    date.setMonth(date.getMonth() + parseInt(periodMonth));
    return date.toISOString();
  }

  _getLoanSizeTier(capital) {
    if (capital < 10000000) return 'small';
    if (capital < 50000000) return 'medium';
    return 'large';
  }
}

module.exports.P2PLendingContract = P2PLendingContract;
module.exports.contracts = [P2PLendingContract];