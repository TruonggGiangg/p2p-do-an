import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { TransactionOtp } from '../schemas/transaction-otp.schema';
import { OtpSessionStatus } from '../enums/otp-session-status.enum';
import { OtpActionType } from '../enums/otp-action-type.enum';
import { DeviceBindingService } from './device-binding.service';
import { User } from '../../users/schemas/user.schema';

/**
 * OTP Session Service
 * Quản lý OTP sessions cho transactions
 */
@Injectable()
export class OtpSessionService {
  private readonly logger = new Logger(OtpSessionService.name);
  private readonly SESSION_EXPIRY_MINUTES = 5;
  private readonly MAX_ATTEMPTS = 3;
  private readonly LOCK_DURATION_MINUTES = 5;

  constructor(
    @InjectModel(TransactionOtp.name)
    private transactionOtpModel: Model<TransactionOtp>,
    @InjectModel(User.name)
    private userModel: Model<User>,
    private deviceBindingService: DeviceBindingService,
  ) {}

  /**
   * Tạo OTP session cho một transaction
   */
  async createSession(
    userId: string,
    deviceId: string,
    actionType: OtpActionType,
    actionData: Record<string, any>,
    ipAddress?: string,
  ): Promise<{ sessionId: string; expiresAt: Date }> {
    // Kiểm tra user bị lock không
    const user = await this.userModel.findById(userId);
    if (user && (user as any).smartOTP?.lockedUntil) {
      const lockedUntil = new Date((user as any).smartOTP.lockedUntil);
      if (lockedUntil > new Date()) {
        const remainingMinutes = Math.ceil(
          (lockedUntil.getTime() - Date.now()) / 60000,
        );
        throw new BadRequestException(
          `Tài khoản bị khóa OTP. Vui lòng thử lại sau ${remainingMinutes} phút.`,
        );
      }
    }

    // Kiểm tra device
    const device = await this.deviceBindingService.isDeviceTrusted(
      userId,
      deviceId,
    );
    if (!device) {
      throw new BadRequestException(
        'Thiết bị chưa được đăng ký Smart OTP',
      );
    }

    const sessionId = uuidv4();
    const expiresAt = new Date(
      Date.now() + this.SESSION_EXPIRY_MINUTES * 60 * 1000,
    );

    const session = new this.transactionOtpModel({
      sessionId,
      userId: new Types.ObjectId(userId),
      deviceId,
      actionType,
      actionData,
      status: OtpSessionStatus.PENDING,
      expiresAt,
      attempts: 0,
      ipAddress,
    });

    await session.save();

    return { sessionId, expiresAt };
  }

  /**
   * Lấy session và validate
   */
  async getSession(
    sessionId: string,
    userId: string,
  ): Promise<TransactionOtp | null> {
    return this.transactionOtpModel
      .findOne({
        sessionId,
        userId: new Types.ObjectId(userId),
      })
      .exec();
  }

  /**
   * Kiểm tra session có valid không
   */
  validateSession(session: TransactionOtp, actionType: OtpActionType): void {
    if (!session) {
      throw new NotFoundException('Session không tồn tại');
    }

    if (session.status !== OtpSessionStatus.PENDING) {
      throw new BadRequestException(
        'Session đã được sử dụng hoặc hết hạn',
      );
    }

    if (session.expiresAt < new Date()) {
      throw new BadRequestException(
        'Session đã hết hạn. Vui lòng thử lại.',
      );
    }

    if (session.actionType !== actionType) {
      throw new BadRequestException('Loại giao dịch không khớp');
    }

    if (session.attempts >= this.MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Đã nhập sai OTP 3 lần. Tài khoản bị khóa 5 phút.',
      );
    }
  }

  /**
   * Tăng số lần thử
   */
  async incrementAttempts(sessionId: string): Promise<void> {
    await this.transactionOtpModel.updateOne(
      { sessionId },
      { $inc: { attempts: 1 } },
    );
  }

  /**
   * Đánh dấu session đã verify
   */
  async markVerified(sessionId: string): Promise<void> {
    await this.transactionOtpModel.updateOne(
      { sessionId },
      {
        status: OtpSessionStatus.VERIFIED,
        verifiedAt: new Date(),
      },
    );
  }

  /**
   * Lock user sau khi fail nhiều lần
   */
  async lockUser(userId: string): Promise<void> {
    const lockUntil = new Date(
      Date.now() + this.LOCK_DURATION_MINUTES * 60 * 1000,
    );
    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        'smartOTP.lockedUntil': lockUntil,
        'smartOTP.otpAttempts': 0,
      },
    });
    this.logger.warn(
      `User ${userId} locked for OTP failures until ${lockUntil}`,
    );
  }

  /**
   * Consume verified session (2-step verification)
   * Bước 1: Client gọi /otp/verify -> Session status = 'verified'
   * Bước 2: Client gọi API transaction kèm sessionId -> Server gọi hàm này để consume
   */
  async consumeSession(
    userId: string,
    sessionId: string,
    actionType: OtpActionType,
  ): Promise<{ valid: boolean; message: string; actionData?: any }> {
    const session = await this.getSession(sessionId, userId);

    if (!session) {
      return { valid: false, message: 'Session không tồn tại' };
    }

    if (session.status !== OtpSessionStatus.VERIFIED) {
      return {
        valid: false,
        message: 'Session chưa được xác thực hoặc đã hết hạn',
      };
    }

    if (session.actionType !== actionType) {
      return { valid: false, message: 'Loại giao dịch không khớp' };
    }

    // Kiểm tra thời gian hết hạn sau khi verify (ví dụ: chỉ valid trong 5 phút sau khi verify)
    if (session.expiresAt < new Date()) {
      return { valid: false, message: 'Session đã hết hạn' };
    }

    // Đánh dấu session đã hoàn tất
    await this.transactionOtpModel.updateOne(
      { sessionId },
      {
        status: OtpSessionStatus.COMPLETED,
        completedAt: new Date(),
      },
    );

    return {
      valid: true,
      message: 'OTP verified',
      actionData: session.actionData,
    };
  }

  /**
   * Lấy trạng thái session
   */
  async getSessionStatus(sessionId: string): Promise<TransactionOtp | null> {
    return this.transactionOtpModel
      .findOne({ sessionId })
      .select('sessionId status actionType expiresAt attempts')
      .exec();
  }
}
