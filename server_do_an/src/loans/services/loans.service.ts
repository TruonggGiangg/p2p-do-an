import {
  Injectable,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Loan, LoanDocument } from '../schemas/loan.schema';
import { HyperledgerService } from './hyperledger.service';
import { LoanCalculationService } from './loan-calculation.service';
import { CreateLoanAutoDto } from '../dto/create-loan-auto.dto';
import moment from 'moment-timezone';

@Injectable()
export class LoansService {
  private readonly logger = new Logger(LoansService.name);

  constructor(
    @InjectModel(Loan.name) private loanModel: Model<LoanDocument>,
    private hyperledgerService: HyperledgerService,
    private loanCalculationService: LoanCalculationService,
  ) {}

  /**
   * Tạo khoản vay với tính toán tự động
   * Logic được cải tiến từ server cũ
   */
  async createLoanAuto(
    borrower: any,
    userDetail: any,
    createLoanDto: CreateLoanAutoDto,
  ): Promise<any> {
    console.log('=== [LoansService] createLoanAuto - START ===');
    console.log('[LoansService] Input:', {
      borrowerId: borrower._id,
      capital: createLoanDto.capital,
      periodMonth: createLoanDto.periodMonth,
      willing: createLoanDto.willing,
      disbursementDate: createLoanDto.disbursementDate,
    });

    const { capital, periodMonth, willing, disbursementDate } = createLoanDto;
    const score = userDetail.score || 0;
    console.log('[LoansService] User score:', score);

    // Validation disbursementDate nếu có
    let disbursementDateISO: string | undefined;
    if (disbursementDate) {
      console.log('[LoansService] Validating disbursementDate:', disbursementDate);
      disbursementDateISO = this.validateDisbursementDate(disbursementDate);
      console.log('[LoansService] Validated disbursementDateISO:', disbursementDateISO);
    }

    // Chuẩn hóa object borrower truyền vào blockchain
    const borrowerString = JSON.stringify({
      _id: borrower._id.toString(),
      phone: borrower.phone,
      category: borrower.category,
      detail: borrower.detail,
    });
    console.log('[LoansService] Borrower string for blockchain:', borrowerString);

    // Kiểm tra xem borrower có khoản vay đang chờ không
    console.log('[LoansService] Checking existing loan contracts...');
    const hasActiveLoan =
      await this.hyperledgerService.existCurrentLoanContract(
        borrower._id.toString(),
      );
    console.log('[LoansService] Has active loan:', hasActiveLoan);
    if (hasActiveLoan) {
      this.logger.warn(
        `Borrower ${borrower._id} already has an active loan contract`,
      );
      // Không throw error, chỉ log warning (giống server cũ)
    }

    // Tạo loanId
    const loanId = `LOAN_${Date.now()}`;
    console.log('[LoansService] Generated loanId:', loanId);

    // Gọi Hyperledger Fabric để tạo contract
    console.log('[LoansService] Calling Hyperledger Fabric to create contract...');
    console.log('[LoansService] Parameters:', {
      loanId,
      capital,
      periodMonth,
      score,
      willing,
      disbursementDateISO: disbursementDateISO || '',
    });

    const txData = await this.hyperledgerService.createLoanContractAuto(
      loanId,
      capital,
      periodMonth,
      score,
      willing,
      borrowerString,
      disbursementDateISO || '',
    );

    console.log('[LoansService] Blockchain response:', JSON.stringify(txData, null, 2));

    // Kiểm tra kết quả từ blockchain
    if (!txData || !txData.contractId) {
      console.error('[LoansService] ERROR: No data returned from blockchain');
      throw new BadRequestException(
        'Failed to create loan contract. No data returned from blockchain.',
      );
    }

    console.log('[LoansService] Blockchain contract created:', txData.contractId);
    console.log('[LoansService] Calculated rate:', txData.info?.rate);
    console.log('[LoansService] Monthly payment:', txData.info?.monthlyPay);
    console.log('[LoansService] Total payment:', txData.info?.entirelyPay);

    // Lưu vào MongoDB (đồng bộ với chaincode)
    console.log('[LoansService] Saving to MongoDB...');
    const loanContract = new this.loanModel({
      contractId: txData.contractId,
      borrower: borrower._id,
      nodeMatch: 0,
      matchedAmount: 0,
      matchPercentage: 0,
      isFullMatch: false,
      waitingRoomId: null,
      waitingRooms: [],
      info: {
        capital: txData.info.capital,
        periodMonth: txData.info.periodMonth,
        score: txData.info.score,
        willing: txData.info.willing,
        rate: txData.info.rate,
        monthlyPrincipalPay: txData.info.monthlyPrincipalPay,
        monthlyInterestPay: txData.info.monthlyInterestPay,
        monthlyPay: txData.info.monthlyPay,
        entirelyPay: txData.info.entirelyPay,
        disbursementDate: new Date(txData.info.disbursementDate),
        maturityDate: new Date(txData.info.maturityDate),
        createdAt: new Date(txData.info.createdAt),
      },
      totalNotes: txData.totalNotes,
      investedNotes: 0,
      status: txData.status || 'waiting',
      lastReminderSent: txData.lastReminderSent
        ? new Date(txData.lastReminderSent)
        : null,
    });

    await loanContract.save();
    console.log('[LoansService] Saved to MongoDB successfully');
    console.log('[LoansService] MongoDB _id:', loanContract._id);

    this.logger.log(
      `Loan contract ${txData.contractId} created successfully`,
    );

    const result = {
      ...txData,
      _id: txData.contractId, // Tương thích với client
      matchingStatus: {
        nodeMatch: 0,
        matchedAmount: 0,
        matchPercentage: 0,
        isFullMatch: false,
        waitingRoomId: null,
        waitingRooms: [],
        message: 'Waiting for matching',
      },
    };

    console.log('[LoansService] Returning result');
    console.log('=== [LoansService] createLoanAuto - END ===');

    return result;
  }

  /**
   * Validate và format disbursementDate
   * Hỗ trợ cả MM.DD.YYYY và ISO format
   */
  private validateDisbursementDate(disbursementDate: string): string {
    let disbursementMoment: moment.Moment;

    if (disbursementDate.includes('T')) {
      // ISO format: 2025-09-15T17:00:00.000Z
      disbursementMoment = moment(disbursementDate);
    } else {
      // MM.DD.YYYY format: 09.16.2025 - sử dụng timezone Việt Nam
      disbursementMoment = moment.tz(
        disbursementDate,
        'MM.DD.YYYY',
        'Asia/Ho_Chi_Minh',
      );
    }

    const today = moment().startOf('day');

    if (!disbursementMoment.isValid()) {
      throw new BadRequestException('Ngày giải ngân không hợp lệ');
    }

    if (disbursementMoment.isBefore(today)) {
      throw new BadRequestException(
        'Ngày giải ngân không thể là quá khứ',
      );
    }

    if (disbursementMoment.isAfter(today.clone().add(30, 'days'))) {
      throw new BadRequestException(
        'Ngày giải ngân không thể quá 30 ngày từ hôm nay',
      );
    }

    // Format về ISO string cho blockchain
    if (disbursementDate.includes('T')) {
      return disbursementMoment.toISOString();
    } else {
      // Format MM.DD.YYYY -> ISO với timezone VN
      return (
        disbursementMoment.format('YYYY-MM-DD') +
        'T00:00:00.000+07:00'
      );
    }
  }

  /**
   * Lấy chi tiết khoản vay từ MongoDB
   */
  async findOne(contractId: string): Promise<LoanDocument> {
    console.log('=== [LoansService] findOne - START ===');
    console.log('[LoansService] Looking for contractId:', contractId);

    const loan = await this.loanModel
      .findOne({ contractId })
      .populate('borrower')
      .exec();

    if (!loan) {
      console.error('[LoansService] Loan not found in MongoDB');
      throw new BadRequestException('Loan contract not found');
    }

    console.log('[LoansService] Found loan:', {
      contractId: loan.contractId,
      status: loan.status,
      capital: loan.info?.capital,
      borrower: loan.borrower,
    });
    console.log('=== [LoansService] findOne - END ===');

    return loan;
  }

  /**
   * Lấy danh sách khoản vay của borrower
   */
  async findByBorrower(
    borrowerId: string,
    status?: string,
  ): Promise<LoanDocument[]> {
    console.log('=== [LoansService] findByBorrower - START ===');
    console.log('[LoansService] Borrower ID:', borrowerId);
    console.log('[LoansService] Status filter:', status || 'all');

    const query: any = { borrower: borrowerId };
    if (status) {
      query.status = status;
    }

    console.log('[LoansService] MongoDB query:', JSON.stringify(query, null, 2));

    const loans = await this.loanModel.find(query).populate('borrower').exec();

    console.log('[LoansService] Found loans count:', loans.length);
    loans.forEach((loan, index) => {
      console.log(`[LoansService] Loan ${index + 1}:`, {
        contractId: loan.contractId,
        status: loan.status,
        capital: loan.info?.capital,
      });
    });
    console.log('=== [LoansService] findByBorrower - END ===');

    return loans;
  }
}

