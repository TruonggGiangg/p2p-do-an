import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LoanApplication } from '../loan/schemas/loan-application.schema';
import { Notification } from '../loan/schemas/notification.schema';

/** Parse Fineract dueDate (array [y,m,d] or string) to ISO date string yyyy-MM-dd */
function parseDueDate(val: any): string | null {
  if (!val) return null;
  if (Array.isArray(val) && val.length >= 3) {
    const [y, m, d] = val;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (typeof val === 'string') return val;
  return null;
}

/** Format amount for display (VND) */
function formatMoney(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Cron jobs: payment reminder (repayment_due) and overdue reminder (overdue_reminder).
 */
@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(
    @InjectModel(LoanApplication.name) private readonly loanApplicationModel: Model<LoanApplication>,
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
  ) {}

  /** Remind users of upcoming installments (1 and 3 days before due). Runs daily at 8:00 AM. */
  @Cron('0 8 * * *')
  async handleRepaymentDueReminders() {
    this.logger.log('[handleRepaymentDueReminders] Starting');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in1Day = new Date(today);
    in1Day.setDate(in1Day.getDate() + 1);
    const in3Days = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);

    const targetDateStrs = [in1Day.toISOString().split('T')[0], in3Days.toISOString().split('T')[0]];

    const loans = await this.loanApplicationModel
      .find({
        status: 'disbursed',
        repaymentSchedule: { $exists: true, $ne: [] },
      })
      .select('userId repaymentSchedule _id fineractLoanId')
      .lean()
      .exec();

    let created = 0;
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    for (const loan of loans) {
      const periods = (loan.repaymentSchedule || []) as any[];
      for (const period of periods) {
        if (period.period === 0 || period.complete) continue;

        const dueStr = parseDueDate(period.dueDate);
        if (!dueStr || !targetDateStrs.includes(dueStr)) continue;

        const daysUntil = dueStr === targetDateStrs[0] ? 1 : 3;

        const existing = await this.notificationModel.findOne({
          userId: loan.userId,
          type: 'repayment_due',
          'data.loanId': loan._id.toString(),
          'data.dueDate': dueStr,
          createdAt: { $gte: twoDaysAgo },
        });

        if (existing) continue;

        const totalDue = period.totalDue ?? period.total ?? 0;
        await this.notificationModel.create({
          userId: loan.userId,
          title: `Nhắc thanh toán kỳ ${period.period}`,
          message: `Kỳ trả nợ ${period.period} (${dueStr}) đến hạn trong ${daysUntil} ngày. Số tiền dự kiến: ${formatMoney(totalDue)} ₫. Vui lòng thanh toán đúng hạn.`,
          type: 'repayment_due',
          data: {
            loanId: loan._id.toString(),
            fineractLoanId: loan.fineractLoanId,
            period: period.period,
            dueDate: dueStr,
            amount: totalDue,
          },
        });
        created++;
      }
    }

    this.logger.log(`[handleRepaymentDueReminders] Created ${created} notifications`);
  }

  /** Remind users with overdue loans. Runs daily at 3:30 AM (after sync at 2 AM). */
  @Cron('30 3 * * *')
  async handleOverdueReminders() {
    this.logger.log('[handleOverdueReminders] Starting');

    const loans = await this.loanApplicationModel
      .find({
        status: 'disbursed',
        totalOverdue: { $gt: 0 },
      })
      .select('userId _id fineractLoanId totalOverdue delinquentDays delinquencyClassification')
      .lean()
      .exec();

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    let created = 0;
    for (const loan of loans) {
      const existing = await this.notificationModel.findOne({
        userId: loan.userId,
        type: 'overdue_reminder',
        'data.loanId': loan._id.toString(),
        createdAt: { $gte: oneDayAgo },
      });

      if (existing) continue;

      const days = loan.delinquentDays ?? 0;
      const classification = loan.delinquencyClassification || 'Nợ quá hạn';
      await this.notificationModel.create({
        userId: loan.userId,
        title: 'Nhắc nợ quá hạn',
        message: `Khoản vay của bạn đang quá hạn ${days} ngày (${classification}). Số tiền quá hạn: ${formatMoney(loan.totalOverdue ?? 0)} ₫. Vui lòng thanh toán sớm hoặc liên hệ hỗ trợ.`,
        type: 'overdue_reminder',
        data: {
          loanId: loan._id.toString(),
          fineractLoanId: loan.fineractLoanId,
          totalOverdue: loan.totalOverdue,
          delinquentDays: days,
          delinquencyClassification: classification,
        },
      });
      created++;
    }

    this.logger.log(`[handleOverdueReminders] Created ${created} notifications`);
  }
}
