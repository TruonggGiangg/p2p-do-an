'use strict';

const {
  Contract
} = require('fabric-contract-api');

class P2PLendingContract extends Contract {

  // Data Constant ( các hệ số để tính lãi tự động )
  dataConstant = {
    factorConstant: 15,
    ficoCoefficient: 0.01,
    capitalCoefficient: 0.000001,
    monthCoefficient: 0.1
  }

  async initLedger(ctx) {
    return;
  }

  // ===== TÍNH TOÁN TỰ ĐỘNG =====

  /**
   * Hàm dùng để cập nhật cấu hình hệ số từ admin
   */
  setConfig(newConfig) {
    this.dataConstant = {
      ...this.dataConstant, // giữ lại giá trị cũ nếu không truyền đủ
      ...newConfig // ghi đè các giá trị mới
    };
  }

  /**
   * Tính toán lãi suất dựa trên điểm tín dụng
   */
  calculateLoanRate(capital, periodMonth, score) {
    const {
      factorConstant,
      ficoCoefficient,
      capitalCoefficient,
      monthCoefficient
    } = this.dataConstant;

    // Tính lãi suất dựa trên các yếu tố: điểm tín dụng, số tiền vay và Kỳ hạn vay
    // Sửa logic: capital cao -> lãi suất thấp hơn (trừ thay vì cộng)
    const capitalDiscount = Math.log10(capital / 1000000) * 0.5; // Giảm 0.5% cho mỗi 10x capital
    
    const rate = (
      factorConstant // Hằng số cơ bản dùng để điều chỉnh lãi suất nền
      -
      (ficoCoefficient * score) // Giảm lãi suất nếu điểm tín dụng (score) cao
      -
      capitalDiscount // Capital cao -> giảm lãi suất
      -
      (monthCoefficient * periodMonth) // Điều chỉnh lãi suất theo Kỳ hạn vay
    );
    
    // Giới hạn lãi suất trong khoảng hợp lý (3% - 25%)
    const minRate = 3;
    const maxRate = 25;
    const finalRate = Math.max(minRate, Math.min(maxRate, rate));
    
    return Math.round(finalRate * 100) / 100;
  }

  /**
   * Tính toán khoản vay tự động
   */
  calculateLoanSchedule(capital, periodMonth, score) {
    const rate = this.calculateLoanRate(capital, periodMonth, score);

    // Tính gốc hàng tháng
    const monthlyPrincipal = Math.round(capital / periodMonth);

    // Tính lãi hàng tháng (lãi đơn)
    const monthlyInterest = Math.round(monthlyPrincipal * rate / 100);

    // Tổng thanh toán hàng tháng 
    const monthlyPayment = monthlyPrincipal + monthlyInterest;

    const totalPayment = monthlyPayment * periodMonth;

    return {
      rate,
      monthlyPrincipal,
      monthlyInterest,
      monthlyPayment,
      totalPayment
    };
  }

  // ===== TẠO HỢP ĐỒNG VAY TỰ ĐỘNG =====

  /**
   * Tạo hợp đồng vay với tính toán tự động
   */
  async createLoanContractAuto(ctx, loanId, capital, periodMonth, score,
    willing, borrowerJson, disbursementDateISO) {
    const borrower = JSON.parse(borrowerJson);

    // Tính toán tự động
    const schedule = this.calculateLoanSchedule(capital, periodMonth, score);

    // Sử dụng timestamp từ transaction để đảm bảo tính nhất quán
    const txTimestamp = ctx.stub.getTxTimestamp();
    const createdAt = new Date(txTimestamp.seconds.low * 1000).toISOString();


    // Sử dụng disbursementDate từ user hoặc fallback về createdAt
    const disbursementDate = disbursementDateISO && disbursementDateISO.trim() !== '' ?
      disbursementDateISO :
      createdAt;

    // Tính maturity date dựa trên periodMonth
    const maturityDate = new Date(disbursementDate);
    maturityDate.setMonth(maturityDate.getMonth() + parseInt(periodMonth));

    const info = {
      capital: parseInt(capital),
      periodMonth: parseInt(periodMonth),
      score: parseInt(score),
      willing: willing,
      rate: schedule.rate,
      monthlyPrincipalPay: schedule.monthlyPrincipal,
      monthlyInterestPay: schedule.monthlyInterest,
      monthlyPay: schedule.monthlyPayment,
      entirelyPay: schedule.totalPayment,
      disbursementDate: disbursementDate,
      maturityDate: maturityDate.toISOString(),
      createdAt: createdAt
    };

    const loanContract = {
      contractId: loanId,
      info,
      totalNotes: Math.ceil(capital / 500000), // unit price
      status: 'waiting',
      borrower,
      lastReminderSent: null // để hỗ trợ nhắc hẹn sau này
    };

    await ctx.stub.putState('LoanContract_' + loanId, Buffer.from(JSON.stringify(loanContract)));
    return JSON.stringify(loanContract);
  }

  // ===== HỆ THỐNG NHẮC HẸN TỰ ĐỘNG =====

  /**
   * Kiểm tra và cập nhật trạng thái các khoản đến hạn
   */
  async checkDuePayments(ctx) {
    // Sử dụng timestamp từ transaction
    const txTimestamp = ctx.stub.getTxTimestamp();
    const currentDate = new Date(txTimestamp.seconds.low * 1000);
    const updatedContracts = [];

    // Kiểm tra tất cả settlement contracts
    for await (const {
      key,
      value
    } of ctx.stub.getStateByRange('SettlementContract_', 'SettlementContract_~')) {
      const settlement = JSON.parse(value.toString());

      if (settlement.status === 'undue') {
        const dueDate = new Date(settlement.info.maturityDate);

        if (currentDate >= dueDate) {
          settlement.status = 'due';
          settlement.info.daysOverDue = Math.floor((currentDate - dueDate) / (1000 * 60 * 60 * 24));

          // Nếu quá hạn -> Tính phạt
          if (settlement.info.daysOverDue > 0) {
            const penaltyRatePerDay = 0.01; // 1% phạt / ngày
            const penaltyAmount = Math.round(
              settlement.info.totalAmount * penaltyRatePerDay * settlement.info.daysOverDue
            );

            settlement.info.penaltyAmount = penaltyAmount;
            settlement.info.totalAmount += penaltyAmount;
            settlement.status = 'overdue';
          }

          await ctx.stub.putState(key, Buffer.from(JSON.stringify(settlement)));
          updatedContracts.push(settlement);
        }
      }
    }

    return JSON.stringify(updatedContracts);
  }

  /**
   * Gửi nhắc hẹn tự động
   */
  async sendPaymentReminder(ctx, loanId) {
    const loanBytes = await ctx.stub.getState('LoanContract_' + loanId);
    if (!loanBytes || loanBytes.length === 0) {
      throw new Error('LoanContract not found');
    }

    const loan = JSON.parse(loanBytes.toString());

    // Sử dụng timestamp từ transaction
    const txTimestamp = ctx.stub.getTxTimestamp();
    const currentDate = new Date(txTimestamp.seconds.low * 1000);

    // Kiểm tra thời gian gửi nhắc gần nhất
    if (loan.lastReminderSent) {
      const lastReminder = new Date(loan.lastReminderSent);
      const daysSinceLastReminder = Math.floor((currentDate - lastReminder) / (1000 * 60 * 60 * 24));
      if (daysSinceLastReminder < 3) {
        return 'Reminder already sent within 3 days';
      }
    }

    // Kiểm tra settlement đến hạn
    const dueSettlements = [];
    for await (const {
      key,
      value
    } of ctx.stub.getStateByRange('SettlementContract_', 'SettlementContract_~')) {
      const settlement = JSON.parse(value.toString());
      if (settlement.loanId === loanId && (settlement.status === 'due' || settlement.status === 'overdue')) {
        dueSettlements.push(settlement);
      }
    }

    if (dueSettlements.length > 0) {
      // Cập nhật thời gian gửi nhắc
      loan.lastReminderSent = currentDate.toISOString();
      await ctx.stub.putState('LoanContract_' + loanId, Buffer.from(JSON.stringify(loan)));

      // Trả về thông tin để gửi thông báo ngoài (email, SMS, v.v.)
      return JSON.stringify({
        message: 'Reminder sent',
        loanId,
        reminderSentAt: currentDate.toISOString(),
        dueSettlements
      });
    }

    return 'No reminders to send';
  }

  // ===== TRẢ NỢ LINH HOẠT =====

  /**
   * Trả nợ một phần của kỳ hạn
   */
  async partialPayment(ctx, settledId, amount, realpaidDate) {
    const key = `SettlementContract_${settledId}`;
    const bytes = await ctx.stub.getState(key);
    if (!bytes || bytes.length === 0) {
      throw new Error(`SettlementContract ${settledId} not found`);
    }

    const settlement = JSON.parse(bytes.toString());
    const paymentAmount = parseInt(amount);

    if (paymentAmount <= 0) {
      throw new Error('Payment amount must be positive');
    }

    // Sử dụng timestamp từ transaction để đảm bảo tính nhất quán
    const txTimestamp = ctx.stub.getTxTimestamp();
    const currentDate = new Date(txTimestamp.seconds.low * 1000).toISOString();

    // Khởi tạo thông tin thanh toán nếu chưa có
    if (!settlement.payments) {
      settlement.payments = [];
    }

    // Thêm thanh toán mới
    const payment = {
      amount: paymentAmount,
      date: realpaidDate || currentDate,
      type: 'partial'
    };

    settlement.payments.push(payment);

    // Tính tổng đã thanh toán
    const totalPaid = settlement.payments.reduce((sum, p) => sum + p.amount, 0);

    // Cập nhật trạng thái
    if (totalPaid >= settlement.info.totalAmount) {
      settlement.status = 'settled';
      settlement.info.realpaidDate = realpaidDate || currentDate;
    } else {
      settlement.status = 'partially_paid';
      settlement.info.remainingAmount = settlement.info.totalAmount - totalPaid;
    }

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(settlement)));
    return JSON.stringify(settlement);
  }

  /**
   * Trả nợ sớm với ưu đãi
   */
  async earlyRepayment(ctx, loanId, discountRate) {
    const loanBytes = await ctx.stub.getState('LoanContract_' + loanId);
    if (!loanBytes || loanBytes.length === 0) {
      throw new Error('LoanContract not found');
    }

    const loan = JSON.parse(loanBytes.toString());

    // Tính toán số tiền còn lại
    let remainingPrincipal = loan.info.capital;
    let remainingInterest = 0;

    // Kiểm tra các kỳ hạn chưa thanh toán
    for await (const {
      key,
      value
    } of ctx.stub.getStateByRange('SettlementContract_', 'SettlementContract_~')) {
      const settlement = JSON.parse(value.toString());
      if (settlement.loanId === loanId && settlement.status !== 'settled') {
        remainingInterest += settlement.info.interestAmount;
      }
    }

    // Áp dụng ưu đãi trả nợ sớm
    const discountAmount = Math.round(remainingInterest * (discountRate / 100));
    const finalAmount = remainingPrincipal + remainingInterest - discountAmount;

    return JSON.stringify({
      remainingPrincipal,
      remainingInterest,
      discountAmount,
      finalAmount,
      discountRate: parseFloat(discountRate)
    });
  }

  // ===== QUERY FUNCTIONS =====

  /**
   * Lấy danh sách khoản vay đến hạn
   */
  async getDuePayments(ctx) {
    const duePayments = [];

    for await (const {
      key,
      value
    } of ctx.stub.getStateByRange('SettlementContract_', 'SettlementContract_~')) {
      const settlement = JSON.parse(value.toString());
      if (settlement.status === 'due' || settlement.status === 'overdue') {
        duePayments.push(settlement);
      }
    }

    return JSON.stringify(duePayments);
  }

  /**
   * Lấy thống kê khoản vay
   */
  async getLoanStatistics(ctx, loanId) {
    const loanBytes = await ctx.stub.getState('LoanContract_' + loanId);
    if (!loanBytes || loanBytes.length === 0) {
      throw new Error('LoanContract not found');
    }

    const loan = JSON.parse(loanBytes.toString());
    let totalPaid = 0;
    let totalRemaining = 0;
    let overdueAmount = 0;
    let settledCount = 0;
    let totalCount = 0;

    for await (const {
      key,
      value
    } of ctx.stub.getStateByRange('SettlementContract_', 'SettlementContract_~')) {
      const settlement = JSON.parse(value.toString());
      if (settlement.loanId === loanId) {
        totalCount++;

        if (settlement.status === 'settled') {
          settledCount++;
          totalPaid += settlement.info.totalAmount;
        } else if (settlement.status === 'due' || settlement.status === 'overdue') {
          totalRemaining += settlement.info.totalAmount;
          if (settlement.info.penaltyAmount) {
            overdueAmount += settlement.info.penaltyAmount;
          }
        }
      }
    }

    return JSON.stringify({
      loanId,
      totalPaid,
      totalRemaining,
      overdueAmount,
      settledCount,
      totalCount,
      progressPercentage: Math.round((settledCount / totalCount) * 100)
    });
  }

  // ===== CÁC HÀM CŨ (GIỮ LẠI ĐỂ TƯƠNG THÍCH) =====

  // Tạo hợp đồng vay
  async createLoanContract(ctx, loanId, infoJson, totalNotes, borrowerJson) {
    // infoJson: truyền từ client dạng JSON string
    const info = JSON.parse(infoJson);
    const borrower = JSON.parse(borrowerJson);

    const loanContract = {
      contractId: loanId,
      info,
      totalNotes: parseInt(totalNotes),
      status: 'waiting',
      borrower
    };
    await ctx.stub.putState('LoanContract_' + loanId, Buffer.from(JSON.stringify(loanContract)));
    return JSON.stringify(loanContract);
  }

  // Tạo các kỳ hạn thanh toán cho hợp đồng vay
  async createSettlementContract(ctx, loanId, settledIdsJson, borrower) {
    // settledIdsJson: truyền từ client dạng JSON string, là mảng settledId
    const settledIds = JSON.parse(settledIdsJson);

    // Lấy loan contract
    const loanBytes = await ctx.stub.getState('LoanContract_' + loanId);
    if (!loanBytes || loanBytes.length === 0) {
      throw new Error('LoanContract not found');
    }
    const loanData = JSON.parse(loanBytes.toString());

    for (let i = 0; i < settledIds.length; i++) {
      const id = settledIds[i];
      const payDate = new Date(loanData.info.maturityDate);
      payDate.setMonth(payDate.getMonth() + i + 1);

      const settlementInfo = {
        principalAmount: loanData.info.monthlyPrincipalPay,
        interestAmount: loanData.info.monthlyInterestPay,
        penaltyAmount: 0,
        totalAmount: loanData.info.monthlyPay,
        maturityDate: payDate,
      };

      const settlementContract = {
        contractId: id,
        status: 'undue',
        info: settlementInfo,
        orderNo: i + 1,
        borrower,
        loanId
      };

      await ctx.stub.putState('SettlementContract_' + id, Buffer.from(JSON.stringify(settlementContract)));
    }
    return 'Settlement contracts created';
  }

  /**
   * Borrower pays a portion of a loan
   * @param {String} settledId
   * @param {String} realpaidDate ISO string
   */
  async settleLoanContract(ctx, settledId, realpaidDate) {
    const key = `SettlementContract_${settledId}`;
    const bytes = await ctx.stub.getState(key);
    if (!bytes || bytes.length === 0) {
      throw new Error(`SettlementContract ${settledId} not found`);
    }
    const settlement = JSON.parse(bytes.toString());
    settlement.status = 'settled';
    settlement.info = settlement.info || {};

    // Sử dụng timestamp từ transaction nếu không có realpaidDate
    if (!realpaidDate) {
      const txTimestamp = ctx.stub.getTxTimestamp();
      realpaidDate = new Date(txTimestamp.seconds.low * 1000).toISOString();
    }

    settlement.info.realpaidDate = realpaidDate;
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(settlement)));
    return JSON.stringify(settlement);
  }

  /**
   * Create InvestingContract for a lender
   * @param {String} investId
   * @param {String} loanId
   * @param {String} infoJson JSON string
   * @param {String} lender
   */
  async createInvestContract(ctx, investId, loanId, infoJson, lender) {
    const loanBytes = await ctx.stub.getState(`LoanContract_${loanId}`);
    if (!loanBytes || loanBytes.length === 0) {
      throw new Error('LoanContract not found');
    }
    const info = JSON.parse(infoJson);
    const investContract = {
      contractId: investId,
      info,
      status: 'waiting_other',
      lender,
      loanId
    };
    await ctx.stub.putState(`InvestContract_${investId}`, Buffer.from(JSON.stringify(investContract)));
    return JSON.stringify(investContract);
  }

  /**
   * Create InvestingFeeContract(s) for a loan
   * @param {String} feeIdsJson JSON array of fee contract ids
   * @param {String} loanId
   */
  async createInvestFeeContract(ctx, feeIdsJson, loanId) {
    const feeIds = JSON.parse(feeIdsJson);

    // Gather settlement contracts for the loan
    const settledIds = [];
    for await (const {
      key,
      value
    } of ctx.stub.getStateByRange('SettlementContract_', 'SettlementContract_~')) {
      const sc = JSON.parse(value.toString());
      if (sc.loanId === loanId) {
        settledIds.push(sc.contractId);
      }
    }

    // Gather investing contracts and compute fee amount
    const investIds = [];
    let feeAmount = 0;
    for await (const {
      key,
      value
    } of ctx.stub.getStateByRange('InvestContract_', 'InvestContract_~')) {
      const ic = JSON.parse(value.toString());
      if (ic.loanId === loanId) {
        investIds.push(ic.contractId);
        feeAmount += (ic.info && ic.info.serviceFee) ? ic.info.serviceFee : 0;
      }
    }

    // Create fee contracts
    for (let i = 0; i < feeIds.length; i++) {
      const fid = feeIds[i];
      const feeContract = {
        contractId: fid,
        feeAmount,
        settledContractId: settledIds[i] || settledIds[0],
        investContractIds: investIds
      };
      await ctx.stub.putState(`InvestFeeContract_${fid}`, Buffer.from(JSON.stringify(feeContract)));
    }
    return 'Invest fee contracts created';
  }

  /**
   * Update statuses when loan is fulfilled or fails
   * @param {String} loanId
   * @param {String} loanStatus
   * @param {String} investStatus
   */
  async onFullFilledLoanContract(ctx, loanId, loanStatus, investStatus) {
    // Update invest contracts
    for await (const {
      key,
      value
    } of ctx.stub.getStateByRange('InvestContract_', 'InvestContract_~')) {
      const invest = JSON.parse(value.toString());
      if (invest.loanId === loanId) {
        invest.status = investStatus;
        await ctx.stub.putState(key, Buffer.from(JSON.stringify(invest)));
      }
    }

    // Update loan contract
    const loanKey = `LoanContract_${loanId}`;
    const loanBytes = await ctx.stub.getState(loanKey);
    if (!loanBytes || loanBytes.length === 0) {
      throw new Error('LoanContract not found');
    }
    const loan = JSON.parse(loanBytes.toString());
    loan.status = loanStatus;
    await ctx.stub.putState(loanKey, Buffer.from(JSON.stringify(loan)));
    return JSON.stringify(loan);
  }

  /**
   * Update settlement & fee contracts when a settlement period is fulfilled
   * @param {String} settledId
   * @param {String} status due|overdue
   */
  async onFullFilledSettlementContract(ctx, settledId, status) {
    const settledKey = `SettlementContract_${settledId}`;
    const bytes = await ctx.stub.getState(settledKey);
    if (!bytes || bytes.length === 0) {
      throw new Error('SettlementContract not found');
    }
    const settledContract = JSON.parse(bytes.toString());

    // Update status
    settledContract.status = status;
    await ctx.stub.putState(settledKey, Buffer.from(JSON.stringify(settledContract)));

    if (status !== 'overdue') {
      return 'Settlement updated';
    }

    // handle overdue: add penalty to next settlement and shift fee amount
    const orderNo = settledContract.orderNo;
    const borrower = settledContract.borrower;
    const loanId = settledContract.loanId;
    let nextSettlement;

    // find next settlement
    for await (const {
      key,
      value
    } of ctx.stub.getStateByRange('SettlementContract_', 'SettlementContract_~')) {
      const sc = JSON.parse(value.toString());
      if (sc.orderNo === orderNo + 1 && sc.borrower === borrower && sc.loanId === loanId) {
        nextSettlement = {
          key,
          value: sc
        };
        break;
      }
    }
    if (!nextSettlement) {
      // No next settlement, nothing further to do
      return 'Last settlement overdue';
    }

    const penalty = settledContract.info.totalAmount;
    nextSettlement.value.info.penaltyAmount = penalty;
    nextSettlement.value.info.totalAmount += penalty;
    await ctx.stub.putState(nextSettlement.key, Buffer.from(JSON.stringify(nextSettlement.value)));

    // shift fee amounts between invest fee contracts
    let lastFee, nextFee;
    for await (const {
      key,
      value
    } of ctx.stub.getStateByRange('InvestFeeContract_', 'InvestFeeContract_~')) {
      const fc = JSON.parse(value.toString());
      if (fc.settledContractId === settledId) {
        lastFee = {
          key,
          value: fc
        };
      }
      if (fc.settledContractId === nextSettlement.value.contractId) {
        nextFee = {
          key,
          value: fc
        };
      }
    }
    if (lastFee && nextFee) {
      nextFee.value.feeAmount += lastFee.value.feeAmount;
      lastFee.value.feeAmount = 0;
      await ctx.stub.putState(lastFee.key, Buffer.from(JSON.stringify(lastFee.value)));
      await ctx.stub.putState(nextFee.key, Buffer.from(JSON.stringify(nextFee.value)));
    }

    return 'Settlement overdue handled';
  }

  // Tạo hàm để lấy danh sách các hợp đồng vay
  async getLoanContracts(ctx) {
    const loanContracts = [];
    for await (const {
      key,
      value
    } of ctx.stub.getStateByRange('LoanContract_', 'LoanContract_~')) {
      const loan = JSON.parse(value.toString());
      loanContracts.push(loan);
    }
    return JSON.stringify(loanContracts);
  }

  /**
   * Query một hợp đồng vay theo contractId
   */
  async queryLoanContract(ctx, loanId) {
    const key = 'LoanContract_' + loanId;
    const bytes = await ctx.stub.getState(key);
    if (!bytes || bytes.length === 0) {
      throw new Error(`LoanContract ${loanId} not found`);
    }
    return bytes.toString();
  }

  /**
   * Query tất cả các hợp đồng vay (nâng cao)
   */
  async queryAllLoanContracts(ctx) {
    const results = [];
    for await (const {
      key,
      value
    } of ctx.stub.getStateByRange('LoanContract_', 'LoanContract_~')) {
      results.push(JSON.parse(value.toString()));
    }
    return JSON.stringify(results);
  }

  /**
   * Query một hợp đồng đầu tư theo contractId
   */
  async queryInvestContract(ctx, investId) {
    const key = 'InvestContract_' + investId;
    const bytes = await ctx.stub.getState(key);
    if (!bytes || bytes.length === 0) {
      throw new Error(`InvestContract ${investId} not found`);
    }
    return bytes.toString();
  }

  /**
   * Query tất cả các hợp đồng đầu tư
   */
  async queryAllInvestContracts(ctx) {
    const results = [];
    for await (const {
      key,
      value
    } of ctx.stub.getStateByRange('InvestContract_', 'InvestContract_~')) {
      results.push(JSON.parse(value.toString()));
    }
    return JSON.stringify(results);
  }

  /**
   * Query tất cả các hợp đồng đầu tư theo loanId
   */
  async queryInvestContractsByLoanId(ctx, loanId) {
    const results = [];
    for await (const {
      key,
      value
    } of ctx.stub.getStateByRange('InvestContract_', 'InvestContract_~')) {
      const invest = JSON.parse(value.toString());
      if (invest.loanId === loanId) {
        results.push(invest);
      }
    }
    return JSON.stringify(results);
  }

  // USDT
  /**
   * Lưu thông tin giao dịch USDT vào blockchain
   */
  async recordUSDTTransaction(ctx, txHash, userId, network, amount, status) {
    const txKey = `USDTTransaction_${txHash}`;

    // Sử dụng timestamp từ transaction để đảm bảo tính nhất quán
    const txTimestamp = ctx.stub.getTxTimestamp();
    const currentDate = new Date(txTimestamp.seconds.low * 1000).toISOString();

    const usdtTx = {
      txHash,
      userId,
      network, // ethereum or tron
      amount: parseFloat(amount),
      status, // 'pending', 'success', 'failed'
      timestamp: currentDate
    };

    await ctx.stub.putState(txKey, Buffer.from(JSON.stringify(usdtTx)));

    await this.updateUserBalance(ctx, userId, amount, 'add');

    return JSON.stringify(usdtTx);
  }

  /**
   * Cập nhật số dư USDT của người dùng
   */
  async updateUserBalance(ctx, userId, amount, action = 'add') {
    const balanceKey = `USDTBalance_${userId}`;
    let balanceBytes = await ctx.stub.getState(balanceKey);
    let balance = balanceBytes ? JSON.parse(balanceBytes.toString()) : 0;

    if (action === 'add') {
      balance += parseFloat(amount);
    } else if (action === 'subtract') {
      balance -= parseFloat(amount);
      if (balance < 0) throw new Error('Insufficient balance');
    }

    // Sử dụng timestamp từ transaction để đảm bảo tính nhất quán
    const txTimestamp = ctx.stub.getTxTimestamp();
    const currentDate = new Date(txTimestamp.seconds.low * 1000).toISOString();

    const balanceData = {
      userId,
      balance,
      lastUpdated: currentDate
    };

    await ctx.stub.putState(balanceKey, Buffer.from(JSON.stringify(balanceData)));
    return balance;
  }

  /**
   * Lấy số dư USDT của người dùng
   */
  async getUserBalance(ctx, userId) {
    const balanceKey = `USDTBalance_${userId}`;
    const balanceBytes = await ctx.stub.getState(balanceKey);

    if (!balanceBytes || balanceBytes.length === 0) {
      return JSON.stringify({
        userId,
        balance: 0
      });
    }
    return balanceBytes.toString();
  }

  /**
   * Lấy tất cả giao dịch USDT của người dùng
   */
  async getUserTransactions(ctx, userId) {
    const transaction = [];

    for await (const {
      key,
      value
    } of ctx.stub.getStateByRange('USDTTransaction_', 'USDTTransaction_~')) {
      const tx = JSON.parse(value.toString());
      if (tx.userId === userId) {
        transaction.push(tx);
      }
    }

    return JSON.stringify(transaction);
  }

  async getTransactionByHash(ctx, txHash) {
    const txKey = `USDTTransaction_${txHash}`;
    const txBytes = await ctx.stub.getState(txKey);
    if (!txBytes || txBytes.length === 0) throw new Error('Transaction not found');

    return txBytes.toString();
  }
}

module.exports = P2PLendingContract;