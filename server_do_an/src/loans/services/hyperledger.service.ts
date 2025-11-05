import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Wallets, Gateway } from 'fabric-network';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class HyperledgerService implements OnModuleInit {
  private readonly logger = new Logger(HyperledgerService.name);
  private gateway: Gateway | null = null;
  private network: any = null;
  private contract: any = null;
  private readonly channelName = 'mychannel';
  private readonly chaincodeName = 'p2plending';
  private isConnecting = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    // Luôn bật Hyperledger Fabric - không có fallback mode
    await this.ensureConnection();
  }

  async ensureConnection(): Promise<void> {
    if (this.contract) {
      return;
    }

    if (this.isConnecting) {
      while (this.isConnecting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (this.contract) {
        return;
      }
    }

    this.isConnecting = true;
    try {
      await this.connect();
    } finally {
      this.isConnecting = false;
    }
  }

  private async connect(): Promise<void> {
    try {
      // Load network configuration - đọc từ config/connection.json trong cùng project
      // Ưu tiên: server_do_an/config/connection.json
      let ccpPath = path.resolve(process.cwd(), 'config/connection.json');

      // Nếu không có, thử đọc từ organizations folder (fallback)
      if (!fs.existsSync(ccpPath)) {
        const org1ConnectionPath = path.resolve(
          process.cwd(),
          'organizations/peerOrganizations/org1.example.com/connection-org1.json',
        );
        if (fs.existsSync(org1ConnectionPath)) {
          ccpPath = org1ConnectionPath;
          this.logger.log(
            `Using connection.json from organizations folder: ${ccpPath}`,
          );
        } else {
          throw new Error(
            `Hyperledger Fabric config not found. Tried:
            - ${ccpPath}
            - ${org1ConnectionPath}
            Please ensure connection.json exists in config/ folder or run ccp-generate.sh script.`,
          );
        }
      } else {
        this.logger.log(`Using connection.json from config folder: ${ccpPath}`);
      }

      const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

      // Create wallet - tương tự server cũ: wallet ở thư mục gốc của project
      const walletPath = path.join(process.cwd(), 'wallet');
      this.logger.log(`Using wallet at: ${walletPath}`);
      const wallet = await Wallets.newFileSystemWallet(walletPath);

      // Check admin identity
      const adminExists = await wallet.get('admin');
      if (!adminExists) {
        throw new Error(
          'Admin identity not found in wallet. Please enroll admin identity first.',
        );
      }

      // Create gateway
      this.gateway = new Gateway();
      await this.gateway.connect(ccp, {
        wallet,
        identity: 'admin',
        discovery: {
          enabled: true,
          asLocalhost: true,
        },
      });

      // Get network
      this.network = await this.gateway.getNetwork(this.channelName);

      // Get contract
      this.contract = this.network.getContract(this.chaincodeName);

      this.logger.log('Successfully connected to Hyperledger Fabric');
    } catch (error) {
      this.logger.error(`Failed to connect to Fabric network: ${error}`);
      throw new Error(
        `Cannot connect to Hyperledger Fabric: ${error.message}. Blockchain is required.`,
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.gateway) {
      await this.gateway.disconnect();
      this.gateway = null;
      this.network = null;
      this.contract = null;
    }
  }

  /**
   * Tạo hợp đồng vay với tính toán tự động
   * Gọi chaincode: createLoanContractAuto
   */
  async createLoanContractAuto(
    loanId: string,
    capital: number,
    periodMonth: number,
    score: number,
    willing: string,
    borrowerJson: string,
    disbursementDateISO: string,
  ): Promise<any> {
    console.log('=== [HyperledgerService] createLoanContractAuto - START ===');
    console.log('[HyperledgerService] Parameters:', {
      loanId,
      capital,
      periodMonth,
      score,
      willing,
      disbursementDateISO,
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
      ]);

      const result = await this.contract.submitTransaction(
        'createLoanContractAuto',
        loanId,
        capital.toString(),
        periodMonth.toString(),
        score.toString(),
        willing,
        borrowerJson,
        disbursementDateISO || '',
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
   * Kiểm tra và cập nhật trạng thái các khoản đến hạn
   * Gọi chaincode: checkDuePayments
   */
  async checkDuePayments(): Promise<any> {
    await this.ensureConnection();

    try {
      const result = await this.contract.submitTransaction('checkDuePayments');
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
      const result = await this.contract.submitTransaction(
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
      const result = await this.contract.submitTransaction(
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
      const result = await this.contract.submitTransaction(
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
      const result = await this.contract.evaluateTransaction(
        'queryAllLoanContracts',
      );
      
      console.log('[HyperledgerService] Raw result length:', result.toString().length);
      const loans = JSON.parse(result.toString());
      console.log('[HyperledgerService] Total loans found:', loans.length);

      // Kiểm tra xem có khoản vay nào đang chờ của borrower này không
      const activeLoans = loans.filter(
        (loan: any) =>
          loan.borrower?._id === borrowerId &&
          (loan.status === 'waiting' || loan.status === 'success'),
      );
      
      console.log('[HyperledgerService] Active loans for borrower:', activeLoans.length);
      if (activeLoans.length > 0) {
        activeLoans.forEach((loan: any, index: number) => {
          console.log(`[HyperledgerService] Active loan ${index + 1}:`, {
            contractId: loan.contractId,
            status: loan.status,
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
}

