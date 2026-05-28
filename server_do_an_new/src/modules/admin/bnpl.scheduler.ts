import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BnplService } from '../bnpl/bnpl.service';
import { Notification } from '../loan/schemas/notification.schema';
import { User } from '../users/schemas/user.schema';
import { PushNotificationService } from '../loan/services/push-notification.service';

function parseDueDate(val: any): string | null {
  if (!val) return null;
  if (Array.isArray(val) && val.length >= 3) {
    const [y, m, d] = val;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (typeof val === 'string') return val;
  return null;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

@Injectable()
export class BnplScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(BnplScheduler.name);

  constructor(
    private readonly bnplService: BnplService,
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly pushService: PushNotificationService,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('[BNPL Scheduler] bootstrap run');
    await Promise.all([
      this.handleBnplSync(),
      this.handleBnplDueReminders(),
      this.handleBnplOverdueReminders(),
    ]);
  }

  @Cron('0 2 * * *')
  async handleBnplSync() {
    this.logger.log('[handleBnplSync] Starting BNPL sync job');
    const loans = await this.bnplService.listLoansAdmin('active');
    let synced = 0;
    let failed = 0;

    for (const loan of loans) {
      try {
        await this.bnplService.syncLoanStatusByAdmin(loan.id);
        synced += 1;
      } catch (error: any) {
        failed += 1;
        this.logger.warn(`[handleBnplSync] Loan ${loan.fineractLoanId} sync failed: ${error?.message}`);
      }
    }

    this.logger.log(`[handleBnplSync] Finished. synced=${synced}, failed=${failed}`);
  }

  @Cron('0 8 * * *')
  async handleBnplDueReminders() {
    this.logger.log('[handleBnplDueReminders] Starting');
    const loans = await this.bnplService.listLoansAdmin('active');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in1Day = new Date(today);
    in1Day.setDate(in1Day.getDate() + 1);
    const in3Days = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);
    const targetDates = new Set([in1Day.toISOString().split('T')[0], in3Days.toISOString().split('T')[0]]);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    let created = 0;
    for (const loan of loans) {
      try {
        const detail = await this.bnplService.getLoanDetails(loan.userId, loan.id);
        for (const period of detail.repaymentSchedule || []) {
          if (!period || period.period === 0 || period.complete) continue;
          const dueDate = parseDueDate((period as any).dueDate);
          if (!dueDate || !targetDates.has(dueDate)) continue;

          const exists = await this.notificationModel.findOne({
            userId: loan.userId,
            type: 'repayment_due',
            'data.loanId': loan.id,
            'data.dueDate': dueDate,
            createdAt: { $gte: twoDaysAgo },
          });
          if (exists) continue;

          const totalDue = Number((period as any).totalDue ?? (period as any).total ?? 0);
          const daysUntil = dueDate === in1Day.toISOString().split('T')[0] ? 1 : 3;
          const user = await this.userModel.findById(loan.userId).select('pushToken').lean().exec();

          await this.notificationModel.create({
            userId: loan.userId,
            title: `Nhắc thanh toán kỳ ${period.period}`,
            message: `Kỳ trả nợ ${period.period} (${dueDate}) đến hạn trong ${daysUntil} ngày. Số tiền dự kiến: ${formatMoney(totalDue)} đ.`,
            type: 'repayment_due',
            data: {
              loanId: loan.id,
              fineractLoanId: loan.fineractLoanId,
              period: period.period,
              dueDate,
              amount: totalDue,
              source: 'bnpl',
            },
          });

          if (user?.pushToken) {
            await this.pushService.sendPushNotification(
              user.pushToken,
              `Nhắc thanh toán kỳ ${period.period}`,
              `Kỳ trả nợ ${period.period} (${dueDate}) đến hạn trong ${daysUntil} ngày. Số tiền: ${formatMoney(totalDue)} đ.`,
              { loanId: loan.id, type: 'repayment_due', source: 'bnpl' },
            );
          }

          created += 1;
        }
      } catch (error: any) {
        this.logger.warn(`[handleBnplDueReminders] Loan ${loan.id} failed: ${error?.message}`);
      }
    }

    this.logger.log(`[handleBnplDueReminders] Created ${created} notifications`);
  }

  @Cron('30 3 * * *')
  async handleBnplOverdueReminders() {
    this.logger.log('[handleBnplOverdueReminders] Starting');
    const loans = await this.bnplService.listLoansAdmin('active');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneDayAgo = new Date(today);
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    let created = 0;
    for (const loan of loans) {
      try {
        const detail = await this.bnplService.getLoanDetails(loan.userId, loan.id);
        const overduePeriod = (detail.repaymentSchedule || []).find((period: any) => {
          const dueDate = parseDueDate(period?.dueDate);
          if (!dueDate) return false;
          return !period.complete && new Date(dueDate) < today;
        });

        if (!overduePeriod) continue;

        const outstanding = Number(detail.outstandingBalance || 0);
        if (outstanding <= 0) continue;

        const dueDate = parseDueDate((overduePeriod as any).dueDate) || '';
        const exists = await this.notificationModel.findOne({
          userId: loan.userId,
          type: 'overdue_reminder',
          'data.loanId': loan.id,
          createdAt: { $gte: oneDayAgo },
        });
        if (exists) continue;

        const user = await this.userModel.findById(loan.userId).select('pushToken').lean().exec();
        await this.notificationModel.create({
          userId: loan.userId,
          title: 'Nhắc nợ quá hạn BNPL',
          message: `Khoản BNPL #${loan.fineractLoanId} đã quá hạn. Số tiền còn lại: ${formatMoney(outstanding)} đ.`,
          type: 'overdue_reminder',
          data: {
            loanId: loan.id,
            fineractLoanId: loan.fineractLoanId,
            overdueDueDate: dueDate,
            outstanding,
            source: 'bnpl',
          },
        });

        if (user?.pushToken) {
          await this.pushService.sendPushNotification(
            user.pushToken,
            'Nhắc nợ quá hạn BNPL',
            `Khoản BNPL #${loan.fineractLoanId} đã quá hạn. Còn lại ${formatMoney(outstanding)} đ.`,
            { loanId: loan.id, type: 'overdue_reminder', source: 'bnpl' },
          );
        }

        created += 1;
      } catch (error: any) {
        this.logger.warn(`[handleBnplOverdueReminders] Loan ${loan.id} failed: ${error?.message}`);
      }
    }

    this.logger.log(`[handleBnplOverdueReminders] Created ${created} notifications`);
  }
}
