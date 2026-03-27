import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { LoanApplication } from '../loan/schemas/loan-application.schema';
import { Notification } from '../loan/schemas/notification.schema';
import { User } from '../users/schemas/user.schema';
import { PushNotificationService } from '../loan/services/push-notification.service';

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

@Injectable()
export class ReminderScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(
    @InjectModel(LoanApplication.name) private readonly loanApplicationModel: Model<LoanApplication>,
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly pushService: PushNotificationService,
  ) { }

  private writeLog(msg: string) {
    const logPath = path.join(process.cwd(), 'debug_reminder.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
    this.logger.log(msg);
  }

  async onApplicationBootstrap() {
    this.writeLog('Application bootstrap: Running reminder cron jobs immediately...');
    await Promise.all([
      this.handleRepaymentDueReminders(),
      this.handleOverdueReminders(),
    ]);
  }

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
      .populate('userId', 'pushToken')
      .lean()
      .exec();

    let created = 0;
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    for (const loan of loans) {
      const periods = (loan.repaymentSchedule || []);
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

        // Send Push Notification
        const user = loan.userId as any;
        if (user?.pushToken) {
          await this.pushService.sendPushNotification(
            user.pushToken,
            `Nhắc thanh toán kỳ ${period.period}`,
            `Kỳ trả nợ ${period.period} (${dueStr}) đến hạn trong ${daysUntil} ngày. Số tiền: ${formatMoney(totalDue)} ₫.`,
            { loanId: loan._id.toString(), type: 'repayment_due' }
          );
        }

        created++;
      }
    }

    this.logger.log(`[handleRepaymentDueReminders] Created ${created} notifications`);
  }

  /** Remind users with overdue loans. Runs daily at 3:30 AM (after sync at 2 AM). */
  @Cron('30 3 * * *')
  async handleOverdueReminders() {
    this.writeLog('[handleOverdueReminders] Starting');

    const loans = await this.loanApplicationModel
      .find({
        status: 'disbursed',
        // totalOverdue: { $gt: 0 }, // For debugging, find all disbursed
      })
      .select('userId _id fineractLoanId totalOverdue delinquentDays delinquencyClassification')
      .populate('userId', 'pushToken username')
      .lean()
      .exec();

    this.writeLog(`[handleOverdueReminders] Found ${loans.length} disbursed loans to check`);

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    let created = 0;
    for (const loan of loans) {
      const userId = (loan.userId as any)._id || loan.userId;
      this.writeLog(`Checking loan ${loan.fineractLoanId || loan._id}: totalOverdue=${loan.totalOverdue}, days=${loan.delinquentDays}, userId=${userId}`);

      const totalOverdue = loan.totalOverdue ?? 0;
      if (!(totalOverdue > 0)) {
        this.writeLog(`Skipping loan ${loan.fineractLoanId}: totalOverdue is 0 or undefined`);
        continue;
      }
      const existing = await this.notificationModel.findOne({
        userId,
        type: 'overdue_reminder',
        'data.loanId': loan._id.toString(),
        createdAt: { $gte: oneDayAgo },
      });

      if (existing) {
        this.writeLog(`Skipping loan ${loan.fineractLoanId}: notification already exists (ID: ${existing._id})`);
        continue;
      }

      const days = loan.delinquentDays ?? 0;
      const classification = loan.delinquencyClassification || 'Nợ quá hạn';
      await this.notificationModel.create({
        userId,
        type: 'overdue_reminder',
        title: '📣 Nhắc nợ quá hạn',
        message: `Khoản vay #${loan.fineractLoanId} của bạn đã quá hạn ${days} ngày. Tổng tiền cần thanh toán: ${totalOverdue.toLocaleString('vi-VN')} đ.`,
        data: {
          loanId: loan._id.toString(),
          fineractLoanId: loan.fineractLoanId,
          type: 'overdue',
          totalOverdue: loan.totalOverdue, // Keep original data fields for consistency if not explicitly removed
          delinquentDays: days,
          delinquencyClassification: classification,
        },
      });

      this.writeLog(`Created overdue_reminder for loan ${loan.fineractLoanId}`);
      created++;

      // Send Push Notification
      const user = loan.userId as any;
      if (user?.pushToken) {
        await this.pushService.sendPushNotification(
          user.pushToken,
          'Nhắc nợ quá hạn',
          `Khoản vay của bạn đang quá hạn ${days} ngày. Số tiền: ${formatMoney(loan.totalOverdue ?? 0)} ₫.`,
          { loanId: loan._id.toString(), type: 'overdue_reminder' }
        );
      }

      created++;
    }

    this.logger.log(`[handleOverdueReminders] Created ${created} notifications`);
  }
}
