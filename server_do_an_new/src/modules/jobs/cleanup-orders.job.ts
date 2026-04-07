import { BaseJob } from './base-job';
import { InvestService } from '../invest/invest.service';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { InvestmentOrder } from '../invest/schemas/investment-order.schema';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class CleanupOrdersJob extends BaseJob {
  constructor(
    private readonly investService: InvestService,
    @InjectModel(InvestmentOrder.name) private readonly orderModel: Model<InvestmentOrder>,
  ) {
    super({
      name: 'CleanupOrders',
      description: 'Dọn các đơn giữ chỗ chưa thanh toán đã quá hạn (mặc định 12 giờ) và trả lại cọc nodeMatch cho các khoản vay',
      intervalMs: 60 * 60 * 1000, // Chạy mỗi giờ
      enabled: true,
      runOnStart: true,
      params: {
        timeoutHours: 12,
      },
      paramsSchema: [
        {
          key: 'timeoutHours',
          label: 'Thời gian hết hạn',
          description: 'Sau bao nhiêu giờ thì tự động huỷ bỏ lệnh giữ chỗ',
          type: 'number',
          unit: 'giờ',
        },
      ],
    });
  }

  async execute() {
    const timeoutHours = this.params.timeoutHours || 12;
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() - timeoutHours);

    // Tìm các order đang open và được tạo trước thời gian hết hạn
    const expiredOrders = await this.orderModel.find({
      status: 'open',
      createdAt: { $lt: expirationDate },
    }).lean();

    const total = expiredOrders.length;
    let success = 0, errors = 0;
    const errorDetails: any[] = [];

    this.setProgress(0, total, `Phát hiện ${total} lệnh giữ chỗ quá hạn...`);

    for (let i = 0; i < total; i++) {
      const order = expiredOrders[i];
      try {
        await this.investService.closeOrder(String(order._id), String(order.lenderId));
        success++;
      } catch (err: any) {
        errors++;
        errorDetails.push({ orderId: order._id, message: err.message });
      }
      this.setProgress(i + 1, total, `Đã xử lý ${i + 1}/${total}`);
    }

    return { total, success, errors, errorDetails: errorDetails.slice(0, 10) };
  }
}
