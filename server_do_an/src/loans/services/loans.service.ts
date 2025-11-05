import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Loan, LoanDocument } from '../schemas/loan.schema';
import { HyperledgerService } from './hyperledger.service';
import { CreateLoanAutoDto } from '../dto/create-loan-auto.dto';
import { ConfigRateService } from '../../config-rate/services/config-rate.service';
import moment from 'moment-timezone';
import { iUser } from '@users/user.interface';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { SettlementsService } from '../../settlements/settlements.service';

@Injectable()
export class LoansService {
  private readonly logger = new Logger(LoansService.name);

  /**
   * Format borrower theo iUser interface (chỉ lấy fields cần thiết)
   */
  private formatBorrower(borrower: any): iUser | null {
    if (!borrower) return null;

    return {
      _id: borrower._id?.toString() || borrower._id,
      name: borrower.name,
      email: borrower.email,
      role: borrower.role,
      phone: borrower.phone,
      category: borrower.category,
      profile: borrower.profile,
    };
  }

  constructor(
    @InjectModel(Loan.name) private loanModel: Model<LoanDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private hyperledgerService: HyperledgerService,
    private settlementsService: SettlementsService,
    private configRateService: ConfigRateService,
  ) {}

  /**
   * Lấy score của borrower ưu tiên từ borrower.profile.score;
   * nếu không có trong payload, đọc trực tiếp từ MongoDB.
   */
  private async getBorrowerScore(borrower: any): Promise<number> {
    if (typeof borrower?.profile?.score === 'number') {
      return borrower.profile.score;
    }
    try {
      const user = await this.userModel
        .findById(borrower?._id)
        .select('profile.score')
        .lean();
      if (typeof (user as any)?.profile?.score === 'number') {
        return (user as any).profile.score;
      }
    } catch (e) {
      this.logger.warn(`Cannot load borrower score from DB: ${e?.message || e}`);
    }
    return 0;
  }

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
    const score = await this.getBorrowerScore(borrower);
    console.log('[LoansService] User score (resolved):', score);

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
    // ĐÃ TẮT CHECK - Cho phép tạo nhiều loan
    // console.log('[LoansService] Checking existing loan contracts in blockchain...');
    // const borrowerIdString = borrower._id.toString();
    // console.log('[LoansService] Borrower ID (string):', borrowerIdString);

    // Check blockchain (source of truth) - ĐÃ TẮT
    // const hasActiveLoan =
    //   await this.hyperledgerService.existCurrentLoanContract(borrowerIdString);
    // console.log('[LoansService] Has active loan in blockchain:', hasActiveLoan);
    
    // if (hasActiveLoan) {
    //   console.error('[LoansService] ERROR: Borrower already has an active loan contract in blockchain');
    //   throw new BadRequestException(
    //     'Bạn đã có khoản vay đang chờ hoặc đang trong quá trình vay. Vui lòng hoàn thành khoản vay hiện tại trước khi tạo khoản vay mới.',
    //   );
    // }
    
    // console.log('[LoansService] No active loan found in blockchain');

    // Lấy config từ MongoDB
    console.log('[LoansService] Getting config from MongoDB...');
    const config = await this.configRateService.getActiveConfig();
    console.log('[LoansService] Config from MongoDB:', {
      factorConstant: config.factorConstant,
      ficoCoefficient: config.ficoCoefficient,
      capitalCoefficient: config.capitalCoefficient,
      monthCoefficient: config.monthCoefficient,
    });

    // Tạo loanId
    const loanId = `LOAN_${Date.now()}`;
    console.log('[LoansService] Generated loanId:', loanId);

    // Gọi Hyperledger Fabric để tạo contract (truyền config trực tiếp từ MongoDB)
    console.log('[LoansService] Calling Hyperledger Fabric to create contract...');
    console.log('[LoansService] Parameters:', {
      loanId,
      capital,
      periodMonth,
      score,
      willing,
      disbursementDateISO: disbursementDateISO || '',
      factorConstant: config.factorConstant,
      ficoCoefficient: config.ficoCoefficient,
      capitalCoefficient: config.capitalCoefficient,
      monthCoefficient: config.monthCoefficient,
    });

    const txData = await this.hyperledgerService.createLoanContractAuto(
      loanId,
      capital,
      periodMonth,
      score,
      willing,
      borrowerString,
      disbursementDateISO || '',
      config.factorConstant,
      config.ficoCoefficient,
      config.capitalCoefficient,
      config.monthCoefficient,
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

    // Tự động tạo Settlement ở DB và Blockchain
    try {
      console.log('[LoansService] Creating settlements for loan...');
      await this.settlementsService.createManyForLoan({
        loanId: txData.contractId,
        borrowerId: borrower._id.toString(),
        periodMonth: txData.info.periodMonth,
        principal: txData.info.monthlyPrincipalPay,
        interest: txData.info.monthlyInterestPay,
        monthlyPay: txData.info.monthlyPay,
        disbursementDateISO: txData.info.disbursementDate,
      });
      console.log('[LoansService] Settlements created successfully');
    } catch (e) {
      this.logger.error(`Failed to create settlements: ${e?.message || e}`);
    }

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
   * Tính toán lãi suất và lịch thanh toán (preview, không lưu blockchain)
   * Config được lấy từ MongoDB và truyền vào chaincode
   */
  async calculateRatePreview(
    capital: number,
    periodMonth: number,
    score: number,
  ): Promise<any> {
    console.log('=== [LoansService] calculateRatePreview - START ===');
    console.log('[LoansService] Input:', {
      capital,
      periodMonth,
      score,
    });

    // Lấy config từ MongoDB
    console.log('[LoansService] Getting config from MongoDB...');
    const config = await this.configRateService.getActiveConfig();
    console.log('[LoansService] Config from MongoDB:', {
      factorConstant: config.factorConstant,
      ficoCoefficient: config.ficoCoefficient,
      capitalCoefficient: config.capitalCoefficient,
      monthCoefficient: config.monthCoefficient,
    });

    // Gọi Hyperledger Fabric để tính rate (preview, không lưu blockchain)
    console.log('[LoansService] Calling Hyperledger Fabric to calculate rate preview...');
    console.log('[LoansService] Parameters:', {
      capital,
      periodMonth,
      score,
      factorConstant: config.factorConstant,
      ficoCoefficient: config.ficoCoefficient,
      capitalCoefficient: config.capitalCoefficient,
      monthCoefficient: config.monthCoefficient,
    });

    const preview = await this.hyperledgerService.calculateRatePreview(
      capital,
      periodMonth,
      score,
      config.factorConstant,
      config.ficoCoefficient,
      config.capitalCoefficient,
      config.monthCoefficient,
    );

    console.log('[LoansService] Preview result:', JSON.stringify(preview, null, 2));
    console.log('[LoansService] Calculated rate:', preview.rate);
    console.log('[LoansService] Monthly payment:', preview.monthlyPay);
    console.log('[LoansService] Total payment:', preview.entirelyPay);
    console.log('=== [LoansService] calculateRatePreview - END ===');

    return preview;
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
   * Lấy chi tiết khoản vay từ MongoDB và blockchain
   * Query cả blockchain và MongoDB, merge data để đảm bảo đồng bộ
   */
  async findOne(contractId: string): Promise<LoanDocument> {
    console.log('=== [LoansService] findOne - START ===');
    console.log('[LoansService] Looking for contractId:', contractId);

    // Query từ MongoDB
    console.log('[LoansService] Querying from MongoDB...');
    const loan = await this.loanModel
      .findOne({ contractId })
      .populate('borrower', '_id name email role phone category profile')
      .exec();

    if (!loan) {
      console.error('[LoansService] Loan not found in MongoDB');
      throw new BadRequestException('Loan contract not found');
    }

    console.log('[LoansService] Found loan in MongoDB:', {
      contractId: loan.contractId,
      status: loan.status,
      capital: loan.info?.capital,
    });

    // Query từ blockchain để đảm bảo đồng bộ
    console.log('[LoansService] Querying from blockchain...');
    try {
      const blockchainLoan = await this.hyperledgerService.queryLoanContract(
        contractId,
      );

      console.log('[LoansService] Found loan in blockchain:', {
        contractId: blockchainLoan.contractId,
        status: blockchainLoan.status,
        capital: blockchainLoan.info?.capital,
      });

      // Đồng bộ các field từ blockchain vào MongoDB (nếu có thay đổi)
      // Cập nhật các field quan trọng từ blockchain
      if (blockchainLoan.info) {
        loan.info.capital = blockchainLoan.info.capital;
        loan.info.periodMonth = blockchainLoan.info.periodMonth;
        loan.info.score = blockchainLoan.info.score;
        loan.info.willing = blockchainLoan.info.willing;
        loan.info.rate = blockchainLoan.info.rate;
        loan.info.monthlyPrincipalPay = blockchainLoan.info.monthlyPrincipalPay;
        loan.info.monthlyInterestPay = blockchainLoan.info.monthlyInterestPay;
        loan.info.monthlyPay = blockchainLoan.info.monthlyPay;
        loan.info.entirelyPay = blockchainLoan.info.entirelyPay;
        loan.info.disbursementDate = new Date(
          blockchainLoan.info.disbursementDate,
        );
        loan.info.maturityDate = new Date(blockchainLoan.info.maturityDate);
        loan.info.createdAt = new Date(blockchainLoan.info.createdAt);
      }

      loan.totalNotes = blockchainLoan.totalNotes;
      loan.status = blockchainLoan.status || loan.status;
      loan.lastReminderSent = blockchainLoan.lastReminderSent
        ? new Date(blockchainLoan.lastReminderSent)
        : null;

      // Lưu lại nếu có thay đổi (optional, có thể comment để tránh write không cần thiết)
      // await loan.save();

      console.log('[LoansService] Loan data synchronized with blockchain');
    } catch (error) {
      console.error('[LoansService] ERROR querying blockchain:', error);
      this.logger.warn(
        `Failed to query blockchain for loan ${contractId}, returning MongoDB data only`,
      );
      // Nếu không query được blockchain, vẫn trả về data từ MongoDB
    }

    // Format borrower theo iUser interface
    if (loan.borrower && typeof loan.borrower === 'object') {
      (loan as any).borrower = this.formatBorrower(loan.borrower);
    }

    console.log('[LoansService] Final loan data:', {
      contractId: loan.contractId,
      status: loan.status,
      capital: loan.info?.capital,
      borrower: this.formatBorrower(loan.borrower),
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

    const loans = await this.loanModel
      .find(query)
      .populate('borrower', '_id name email role phone category profile')
      .exec();

    // Format borrower theo iUser interface cho mỗi loan
    loans.forEach((loan) => {
      if (loan.borrower && typeof loan.borrower === 'object') {
        (loan as any).borrower = this.formatBorrower(loan.borrower);
      }
    });

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

  /**
   * Lấy danh sách khoản vay với phân trang và filter
   * Học từ module user
   */
  async findAll(
    currentPage: number,
    limit: number,
    qs: string,
    borrowerId?: string,
  ) {
    console.log('=== [LoansService] findAll - START ===');
    console.log('[LoansService] Pagination:', { currentPage, limit });
    console.log('[LoansService] Query string:', qs);
    console.log('[LoansService] Borrower ID (optional):', borrowerId);

    const aqp = (await import('api-query-params')).default;
    const { filter, sort, projection, population } = aqp(qs);
    
    // Xóa các field pagination khỏi filter
    delete filter.current;
    delete filter.pageSize;

    // Convert operators từ gte, lte, gt, lt, ne sang $gte, $lte, $gt, $lt, $ne cho MongoDB
    const convertMongoOperators = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      
      if (Array.isArray(obj)) {
        return obj.map(convertMongoOperators);
      }
      
      if (typeof obj === 'object') {
        const converted: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (key === 'gte' || key === 'lte' || key === 'gt' || key === 'lt' || key === 'ne' || 
              key === 'eq' || key === 'in' || key === 'nin') {
            // Convert operator key thành MongoDB operator
            converted[`$${key}`] = convertMongoOperators(value);
          } else {
            // Giữ nguyên key và convert value
            converted[key] = convertMongoOperators(value);
          }
        }
        return converted;
      }
      
      return obj;
    };

    // Convert flat keys với dot notation và operators thành nested object
    // Ví dụ: { 'info.rate[gte]': 10 } -> { info: { rate: { gte: 10 } } }
    // Ví dụ: { 'info.rate': { gte: 10 } } -> { info: { rate: { gte: 10 } } }
    const convertDotNotation = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      
      if (Array.isArray(obj)) {
        return obj.map(convertDotNotation);
      }
      
      if (typeof obj === 'object') {
        const converted: any = {};
        for (const [key, value] of Object.entries(obj)) {
          // Xử lý pattern: fieldName[operator] hoặc field.path[operator]
          // Ví dụ: info.rate[gte] hoặc rate[gte]
          const operatorMatch = key.match(/^(.+)\[(\w+)\]$/);
          
          if (operatorMatch) {
            // Có operator trong key: fieldName[operator]
            const fieldPath = operatorMatch[1]; // 'info.rate' hoặc 'rate'
            const operator = operatorMatch[2]; // 'gte', 'lte', etc.
            
            if (fieldPath.includes('.')) {
              // Nested field với dot notation: info.rate[gte]
              const keys = fieldPath.split('.');
              let current = converted;
              
              // Tạo nested structure
              for (let i = 0; i < keys.length - 1; i++) {
                if (!current[keys[i]]) {
                  current[keys[i]] = {};
                }
                current = current[keys[i]];
              }
              
              // Set operator ở level cuối cùng
              const lastKey = keys[keys.length - 1];
              if (!current[lastKey]) {
                current[lastKey] = {};
              }
              current[lastKey][operator] = convertDotNotation(value);
            } else {
              // Không có dot notation: rate[gte]
              if (!converted[fieldPath]) {
                converted[fieldPath] = {};
              }
              converted[fieldPath][operator] = convertDotNotation(value);
            }
          } else if (key.includes('.')) {
            // Nested field với dot notation nhưng không có operator: info.rate
            const keys = key.split('.');
            let current = converted;
            
            // Tạo nested structure
            for (let i = 0; i < keys.length - 1; i++) {
              if (!current[keys[i]]) {
                current[keys[i]] = {};
              }
              current = current[keys[i]];
            }
            
            // Set giá trị ở level cuối cùng
            const lastKey = keys[keys.length - 1];
            current[lastKey] = convertDotNotation(value);
          } else {
            // Không có dot notation và không có operator, giữ nguyên
            converted[key] = convertDotNotation(value);
          }
        }
        return converted;
      }
      
      return obj;
    };

    // Convert filter: đầu tiên convert dot notation, sau đó convert operators
    let processedFilter = convertDotNotation(filter);
    const mongoFilter = convertMongoOperators(processedFilter);

    // Flatten nested objects với dot notation cho MongoDB query
    // MongoDB hỗ trợ dot notation trong query: { "info.rate": { $gte: 10 } }
    const flattenNestedFields = (obj: any, prefix = ''): any => {
      const flattened: any = {};
      
      for (const [key, value] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          // Kiểm tra xem có operator không ($gte, $lte, etc.)
          const hasOperator = Object.keys(value).some(k => k.startsWith('$'));
          
          if (hasOperator) {
            // Nếu có operator, đây là MongoDB query object, giữ nguyên với dot notation
            flattened[newKey] = value;
          } else {
            // Nếu không có operator, đây là nested object, tiếp tục flatten
            Object.assign(flattened, flattenNestedFields(value, newKey));
          }
        } else {
          // Primitive value, giữ nguyên
          flattened[newKey] = value;
        }
      }
      
      return flattened;
    };

    // Flatten filter cho MongoDB query
    const finalFilter = flattenNestedFields(mongoFilter);

    // Nếu có borrowerId (cho /loans/me), chỉ lấy loan của borrower đó
    if (borrowerId) {
      finalFilter.borrower = borrowerId;
      
      // Xử lý filter isSuccess (nếu có) - kiểm tra xem loan đã match đủ chưa
      // Logic từ server cũ: isSuccess=true -> (isFullMatch=true HOẶC investedNotes=totalNotes)
      //                   isSuccess=false -> (isFullMatch=false VÀ investedNotes!=totalNotes)
      if (filter.isSuccess !== undefined) {
        const isSuccessValue = filter.isSuccess === 'true' || filter.isSuccess === true;
        
        // Tạo conditions array để merge với filter hiện tại
        const conditions: any[] = [];
        
        // Thêm các filter hiện tại vào conditions
        const existingFilters = { ...finalFilter };
        delete existingFilters.borrower; // borrower đã được set ở trên
        if (Object.keys(existingFilters).length > 0) {
          conditions.push(existingFilters);
        }
        
        // Thêm success condition
        if (isSuccessValue) {
          // isSuccess=true: Tìm khoản vay thành công (đã match đủ)
          conditions.push({
            $or: [
              { isFullMatch: true },
              { $expr: { $eq: ['$investedNotes', '$totalNotes'] } },
            ],
          });
        } else {
          // isSuccess=false: Tìm khoản vay chưa thành công (chưa match đủ)
          conditions.push({
            $and: [
              { isFullMatch: { $ne: true } },
              { $expr: { $ne: ['$investedNotes', '$totalNotes'] } },
            ],
          });
        }
        
        // Merge tất cả conditions
        if (conditions.length > 1) {
          finalFilter.$and = conditions;
          // Restore borrower vào $and[0]
          if (finalFilter.$and[0] && typeof finalFilter.$and[0] === 'object') {
            finalFilter.$and[0].borrower = borrowerId;
          }
        } else if (conditions.length === 1) {
          // Nếu chỉ có 1 condition, merge trực tiếp
          Object.assign(finalFilter, conditions[0]);
          finalFilter.borrower = borrowerId;
        }
      }
    }

    console.log('[LoansService] Parsed filter (before convert):', JSON.stringify(filter, null, 2));
    console.log('[LoansService] MongoDB filter (after convert):', JSON.stringify(finalFilter, null, 2));
    console.log('[LoansService] Sort:', sort);

    const offset = (+currentPage - 1) * +limit;
    const defaultLimit = +limit ? +limit : 10;

    // Đếm tổng số items
    const totalItems = (await this.loanModel.find(finalFilter)).length;
    const totalPages = Math.ceil(totalItems / defaultLimit);

    console.log('[LoansService] Total items:', totalItems);
    console.log('[LoansService] Total pages:', totalPages);

    // Query với pagination, sort, populate
    const result = await this.loanModel
      .find(finalFilter)
      .skip(offset)
      .limit(defaultLimit)
      .sort(sort as any)
      .populate('borrower', '_id name email role phone category profile')
      .exec() as LoanDocument[];

    // Format borrower theo iUser interface cho mỗi loan
    result.forEach((loan) => {
      if (loan.borrower && typeof loan.borrower === 'object') {
        (loan as any).borrower = this.formatBorrower(loan.borrower);
      }
    });

    console.log('[LoansService] Result count:', result.length);
    console.log('=== [LoansService] findAll - END ===');

    return {
      meta: {
        currentPage: currentPage, // trang hiện tại
        pageSize: limit, // số lượng bản ghi đã lấy
        pages: totalPages, // tổng số trang với điều kiện query
        total: totalItems, // tổng số phần tử (số bản ghi)
      },
      result, // kết quả query
    };
  }
}

