import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract } from 'fabric-network';
import { FabricService } from '@common/services/fabric.service';

@Injectable()
export class HyperledgerService implements OnModuleInit {
  private readonly logger = new Logger(HyperledgerService.name);
  private readonly channelName = 'mychannel';
  private readonly chaincodeName = 'p2plending';

  constructor(
    private configService: ConfigService,
    private fabricService: FabricService,
  ) {}

  async onModuleInit() {
    // Luôn bật Hyperledger Fabric - không có fallback mode
    await this.ensureConnection();
  }

  /**
   * Đảm bảo connection đã được thiết lập
   * Sử dụng FabricService chung
   */
  async ensureConnection(): Promise<void> {
    await this.fabricService.ensureConnection({
      channelName: this.channelName,
      chaincodeName: this.chaincodeName,
    });
  }

  /**
   * Lấy contract instance
   */
  private getContract(): Contract {
    return this.fabricService.getContract(this.chaincodeName);
  }

  /**
   * Tạo hợp đồng vay với tính toán tự động
   * Gọi chaincode: createLoanContractAuto
   * Config được truyền từ MongoDB (các tham số riêng lẻ)
   */
  async createLoanContractAuto(
    loanId: string,
    capital: number,
    periodMonth: number,
    score: number,
    willing: string,
    borrowerJson: string,
    disbursementDateISO: string,
    factorConstant: number,
    ficoCoefficient: number,
    capitalCoefficient: number,
    monthCoefficient: number,
  ): Promise<any> {
    console.log('=== [HyperledgerService] createLoanContractAuto - START ===');
    console.log('[HyperledgerService] Parameters:', {
      loanId,
      capital,
      periodMonth,
      score,
      willing,
      disbursementDateISO,
      factorConstant,
      ficoCoefficient,
      capitalCoefficient,
      monthCoefficient,
    });

    await this.ensureConnection();
    console.log('[HyperledgerService] Connection ensured');

    try {
      console.log('[HyperledgerService] Submitting transaction to blockchain...');
      console.log('[HyperledgerService] Chaincode method: createLoanContractAuto');
      console.log('[HyperledgerService] Arguments:', [
        loanId,
        capital.toString(),
        periodMonth.toString(),
        score.toString(),
        willing,
        borrowerJson,
        disbursementDateISO || '',
        factorConstant.toString(),
        ficoCoefficient.toString(),
        capitalCoefficient.toString(),
        monthCoefficient.toString(),
      ]);

      const contract = this.getContract();
      const result = await contract.submitTransaction(
        'createLoanContractAuto',
        loanId,
        capital.toString(),
        periodMonth.toString(),
        score.toString(),
        willing,
        borrowerJson,
        disbursementDateISO || '',
        factorConstant.toString(),
        ficoCoefficient.toString(),
        capitalCoefficient.toString(),
        monthCoefficient.toString(),
      );

      console.log('[HyperledgerService] Blockchain transaction successful');
      console.log('[HyperledgerService] Raw result length:', result.toString().length);

      const parsedResult = JSON.parse(result.toString());
      console.log('[HyperledgerService] Parsed result:', JSON.stringify(parsedResult, null, 2));
      console.log('[HyperledgerService] Contract ID:', parsedResult.contractId);
      console.log('[HyperledgerService] Calculated rate:', parsedResult.info?.rate);
      console.log('=== [HyperledgerService] createLoanContractAuto - END ===');

      return parsedResult;
    } catch (error) {
      console.error('[HyperledgerService] ERROR:', error);
      this.logger.error(`Failed to create loan contract auto: ${error}`);
      throw error;
    }
  }

  /**
   * Tính toán lãi suất và lịch thanh toán (preview, không lưu blockchain)
   * Gọi chaincode: calculateRatePreview
   * Config được truyền từ MongoDB (các tham số riêng lẻ)
   */
  async calculateRatePreview(
    capital: number,
    periodMonth: number,
    score: number,
    factorConstant: number,
    ficoCoefficient: number,
    capitalCoefficient: number,
    monthCoefficient: number,
  ): Promise<any> {
    console.log('=== [HyperledgerService] calculateRatePreview - START ===');
    console.log('[HyperledgerService] Parameters:', {
      capital,
      periodMonth,
      score,
      factorConstant,
      ficoCoefficient,
      capitalCoefficient,
      monthCoefficient,
    });

    await this.ensureConnection();
    console.log('[HyperledgerService] Connection ensured');

    try {
      console.log('[HyperledgerService] Evaluating transaction (read-only)...');
      console.log('[HyperledgerService] Chaincode method: calculateRatePreview');
      console.log('[HyperledgerService] Arguments:', [
        capital.toString(),
        periodMonth.toString(),
        score.toString(),
        factorConstant.toString(),
        ficoCoefficient.toString(),
        capitalCoefficient.toString(),
        monthCoefficient.toString(),
      ]);

      const contract = this.getContract();
      // Dùng evaluateTransaction vì chỉ đọc, không ghi blockchain
      const result = await contract.evaluateTransaction(
        'calculateRatePreview',
        capital.toString(),
        periodMonth.toString(),
        score.toString(),
        factorConstant.toString(),
        ficoCoefficient.toString(),
        capitalCoefficient.toString(),
        monthCoefficient.toString(),
      );

      console.log('[HyperledgerService] Blockchain evaluation successful');
      console.log('[HyperledgerService] Raw result length:', result.toString().length);

      const parsedResult = JSON.parse(result.toString());
      console.log('[HyperledgerService] Parsed result:', JSON.stringify(parsedResult, null, 2));
      console.log('[HyperledgerService] Calculated rate:', parsedResult.rate);
      console.log('=== [HyperledgerService] calculateRatePreview - END ===');

      return parsedResult;
    } catch (error) {
      console.error('[HyperledgerService] ERROR:', error);
      this.logger.error(`Failed to calculate rate preview: ${error}`);
      throw error;
    }
  }

  /**
   * Kiểm tra và cập nhật trạng thái các khoản đến hạn
   * Gọi chaincode: checkDuePayments
   */
  async checkDuePayments(): Promise<any> {
    await this.ensureConnection();

    try {
      const contract = this.getContract();
      const result = await contract.submitTransaction('checkDuePayments');
      return JSON.parse(result.toString());
    } catch (error) {
      this.logger.error(`Failed to check due payments: ${error}`);
      throw error;
    }
  }

  /**
   * Gửi nhắc hẹn tự động
   * Gọi chaincode: sendPaymentReminder
   */
  async sendPaymentReminder(loanId: string): Promise<any> {
    await this.ensureConnection();

    try {
      const contract = this.getContract();
      const result = await contract.submitTransaction(
        'sendPaymentReminder',
        loanId,
      );
      return JSON.parse(result.toString());
    } catch (error) {
      this.logger.error(`Failed to send payment reminder: ${error}`);
      throw error;
    }
  }

  /**
   * Trả nợ một phần
   * Gọi chaincode: partialPayment
   */
  async partialPayment(
    settledId: string,
    amount: number,
    realpaidDate: string,
  ): Promise<any> {
    await this.ensureConnection();

    try {
      const contract = this.getContract();
      const result = await contract.submitTransaction(
        'partialPayment',
        settledId,
        amount.toString(),
        realpaidDate,
      );
      return JSON.parse(result.toString());
    } catch (error) {
      this.logger.error(`Failed to process partial payment: ${error}`);
      throw error;
    }
  }

  /**
   * Tính toán trả nợ sớm
   * Gọi chaincode: earlyRepayment
   */
  async calculateEarlyRepayment(
    loanId: string,
    discountRate: number,
  ): Promise<any> {
    await this.ensureConnection();

    try {
      const contract = this.getContract();
      const result = await contract.submitTransaction(
        'earlyRepayment',
        loanId,
        discountRate.toString(),
      );
      return JSON.parse(result.toString());
    } catch (error) {
      this.logger.error(`Failed to calculate early repayment: ${error}`);
      throw error;
    }
  }

  /**
   * Kiểm tra xem borrower có khoản vay đang chờ không
   * Gọi chaincode: queryLoanContracts
   */
  async existCurrentLoanContract(borrowerId: string): Promise<boolean> {
    console.log('=== [HyperledgerService] existCurrentLoanContract - START ===');
    console.log('[HyperledgerService] Borrower ID:', borrowerId);

    await this.ensureConnection();
    console.log('[HyperledgerService] Connection ensured');

    try {
      console.log('[HyperledgerService] Querying all loan contracts from blockchain...');
      const contract = this.getContract();
      const result = await contract.evaluateTransaction(
        'queryAllLoanContracts',
      );
      
      console.log('[HyperledgerService] Raw result length:', result.toString().length);
      const loans = JSON.parse(result.toString());
      console.log('[HyperledgerService] Total loans found:', loans.length);

      // Kiểm tra xem có khoản vay nào đang chờ của borrower này không
      const activeLoans = loans.filter((loan: any) => {
        // So sánh borrower._id (có thể là string hoặc object)
        const loanBorrowerId = loan.borrower?._id?.toString() || loan.borrower?._id;
        const isMatch = loanBorrowerId === borrowerId.toString();
        const isActiveStatus = loan.status === 'waiting' || loan.status === 'success';
        
        if (isMatch) {
          console.log(`[HyperledgerService] Found loan for borrower:`, {
            contractId: loan.contractId,
            loanBorrowerId: loanBorrowerId,
            borrowerId: borrowerId.toString(),
            status: loan.status,
            isActiveStatus: isActiveStatus,
          });
        }
        
        return isMatch && isActiveStatus;
      });
      
      console.log('[HyperledgerService] Active loans for borrower:', activeLoans.length);
      if (activeLoans.length > 0) {
        activeLoans.forEach((loan: any, index: number) => {
          console.log(`[HyperledgerService] Active loan ${index + 1}:`, {
            contractId: loan.contractId,
            status: loan.status,
            borrowerId: loan.borrower?._id,
          });
        });
      }

      const hasActiveLoan = activeLoans.length > 0;
      console.log('[HyperledgerService] Has active loan:', hasActiveLoan);
      console.log('=== [HyperledgerService] existCurrentLoanContract - END ===');

      return hasActiveLoan;
    } catch (error) {
      console.error('[HyperledgerService] ERROR:', error);
      this.logger.error(
        `Failed to check existing loan contract: ${error}`,
      );
      return false;
    }
  }

  /**
   * Query một hợp đồng vay từ blockchain theo contractId
   * Gọi chaincode: queryLoanContract
   */
  async queryLoanContract(loanId: string): Promise<any> {
    console.log('=== [HyperledgerService] queryLoanContract - START ===');
    console.log('[HyperledgerService] Loan ID:', loanId);

    await this.ensureConnection();
    console.log('[HyperledgerService] Connection ensured');

    try {
      console.log('[HyperledgerService] Querying loan contract from blockchain...');
      const contract = this.getContract();
      const result = await contract.evaluateTransaction(
        'queryLoanContract',
        loanId,
      );

      console.log('[HyperledgerService] Raw result length:', result.toString().length);
      const loanContract = JSON.parse(result.toString());
      console.log('[HyperledgerService] Found loan contract:', {
        contractId: loanContract.contractId,
        status: loanContract.status,
        capital: loanContract.info?.capital,
      });
      console.log('=== [HyperledgerService] queryLoanContract - END ===');

      return loanContract;
    } catch (error) {
      console.error('[HyperledgerService] ERROR:', error);
      this.logger.error(`Failed to query loan contract: ${error}`);
      throw error;
    }
  }
}

