import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Settlement, SettlementDocument } from './schemas/settlement.schema';
import { FabricService } from '../common/services/fabric.service';

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    @InjectModel(Settlement.name) private settlementModel: Model<SettlementDocument>,
    private readonly fabricService: FabricService,
  ) {}

  async createManyForLoan(params: {
    loanId: string;
    borrowerId: string;
    periodMonth: number;
    principal: number;
    interest: number;
    monthlyPay: number;
    disbursementDateISO: string;
  }): Promise<SettlementDocument[]> {
    this.logger.log(`[createManyForLoan] START loanId=${params.loanId}`);
    const { loanId, borrowerId, periodMonth, principal, interest, monthlyPay, disbursementDateISO } = params;

    const settledIds: string[] = [];
    const docs: SettlementDocument[] = [] as any;

    const startDate = new Date(disbursementDateISO);
    for (let i = 0; i < periodMonth; i++) {
      const id = `${loanId}_SET_${i + 1}`;
      settledIds.push(id);

      const maturity = new Date(startDate);
      maturity.setMonth(maturity.getMonth() + i + 1);

      const doc = new this.settlementModel({
        contractId: id,
        borrower: borrowerId,
        loanId,
        orderNo: i + 1,
        status: 'undue',
        info: {
          principalAmount: principal,
          interestAmount: interest,
          penaltyAmount: 0,
          totalAmount: monthlyPay,
          maturityDate: maturity,
        },
      });
      docs.push(doc);
    }

    // Save DB first for fast queries
    await this.settlementModel.insertMany(docs);
    this.logger.log(`[createManyForLoan] Saved ${docs.length} settlements to MongoDB for loan=${loanId}`);

    // Also create on blockchain using existing chaincode method
    try {
      const borrowerPayload = JSON.stringify({ _id: borrowerId });
      await this.fabricService.ensureConnection({ chaincodeName: 'p2plending' });
      const contract = this.fabricService.getContract('p2plending');
      this.logger.log(`[createManyForLoan] Submitting createSettlementContract to BC with ${settledIds.length} ids`);
      const bcRes = await contract.submitTransaction('createSettlementContract', loanId, JSON.stringify(settledIds), borrowerPayload);
      this.logger.log(`[createManyForLoan] BC response length=${bcRes.toString().length}`);
    } catch (e) {
      this.logger.error(`Failed to create settlements on blockchain: ${e?.message || e}`);
      // Continue - DB already has records
    }
    this.logger.log(`[createManyForLoan] END loanId=${loanId}`);
    return docs;
  }

  async checkAndRemind(borrowerId: string): Promise<any> {
    // Trigger blockchain to roll statuses and compute penalties
    this.logger.log(`[checkAndRemind] START borrowerId=${borrowerId}`);
    await this.fabricService.ensureConnection({ chaincodeName: 'p2plending' });
    const contract = this.fabricService.getContract('p2plending');
    try {
      this.logger.log('[checkAndRemind] Submitting checkDuePayments to BC...');
      const res = await contract.submitTransaction('checkDuePayments');
      this.logger.log(`[checkAndRemind] BC updated contracts length=${res.toString().length}`);
    } catch (e) {
      this.logger.error(`Failed to run checkDuePayments on blockchain: ${e?.message || e}`);
    }
    // Collect due/overdue settlements for this borrower from DB
    const now = new Date();
    const items = await this.settlementModel
      .find({ borrower: borrowerId, status: { $in: ['due', 'overdue'] } })
      .lean();
    this.logger.log(`[checkAndRemind] Found ${items.length} settlements due/overdue in DB`);

    const stats = {
      total: items.length,
      overdueCount: items.filter(x => x.status === 'overdue').length,
      dueCount: items.filter(x => x.status === 'due').length,
      daysToNextDue: null as number | null,
    };

    const next = await this.settlementModel
      .find({ borrower: borrowerId, status: { $in: ['undue', 'due'] } })
      .sort({ 'info.maturityDate': 1 })
      .limit(1)
      .lean();
    if (next[0]) {
      const days = Math.ceil((new Date(next[0].info.maturityDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      stats.daysToNextDue = days;
    }

    this.logger.log(`[checkAndRemind] Stats: total=${stats.total}, due=${stats.dueCount}, overdue=${stats.overdueCount}, daysToNextDue=${stats.daysToNextDue}`);
    this.logger.log('[checkAndRemind] END');
    return { stats, items };
  }

  async getByLoanId(loanId: string): Promise<any> {
    // Ưu tiên đọc từ blockchain để có trạng thái mới nhất
    await this.fabricService.ensureConnection({ chaincodeName: 'p2plending' });
    const contract = this.fabricService.getContract('p2plending');
    this.logger.log('[getByLoanId] Evaluating querySettlementsByLoanId on BC...');
    const res = await contract.evaluateTransaction('querySettlementsByLoanId', loanId);
    const resStr = res.toString();
    this.logger.log(`[getByLoanId] BC response length=${resStr.length}`);
    const bcList = JSON.parse(resStr);
    this.logger.log(`[getByLoanId] Items fetched=${bcList.length}`);
    // Optional: sync một phần về DB (upsert) - bỏ qua để tránh ghi nhiều
    this.logger.log('[getByLoanId] END');
    return bcList;
  }
}


