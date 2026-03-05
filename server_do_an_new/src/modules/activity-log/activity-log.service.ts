import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ActivityLog } from './schemas/activity-log.schema';

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @InjectModel(ActivityLog.name)
    private readonly activityLogModel: Model<ActivityLog>,
  ) {}

  /**
   * Ghi 1 bản ghi activity log.
   */
  async create(data: Partial<ActivityLog>): Promise<ActivityLog> {
    try {
      return await this.activityLogModel.create(data);
    } catch (err) {
      this.logger.error('Ghi activity log thất bại', (err as Error).stack);
      throw err;
    }
  }

  /**
   * Lấy danh sách logs (phân trang, sắp theo mới nhất).
   */
  async findAll(page = 1, limit = 20): Promise<{ logs: ActivityLog[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      this.activityLogModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.activityLogModel.countDocuments().exec(),
    ]);
    return { logs: logs as ActivityLog[], total, page, limit };
  }

  /**
   * Lấy logs theo userId (phân trang).
   */
  async findByUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ logs: ActivityLog[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      this.activityLogModel.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.activityLogModel.countDocuments({ userId }).exec(),
    ]);
    return { logs: logs as ActivityLog[], total, page, limit };
  }
}
