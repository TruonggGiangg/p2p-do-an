import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DeviceBinding } from '../schemas/device-binding.schema';
import { DeviceStatus } from '../enums/device-status.enum';
import { TotpService } from './totp.service';
import { User } from '../../users/schemas/user.schema';

/**
 * Device Binding Service
 * Quản lý đăng ký, revoke, và query devices
 */
@Injectable()
export class DeviceBindingService {
  private readonly logger = new Logger(DeviceBindingService.name);
  private readonly MAX_DEVICES = 10;

  constructor(
    @InjectModel(DeviceBinding.name)
    private deviceBindingModel: Model<DeviceBinding>,
    @InjectModel(User.name)
    private userModel: Model<User>,
    private totpService: TotpService,
  ) {}

  /**
   * Đăng ký device mới với public key
   */
  async registerDevice(
    userId: string,
    publicKey: string,
    deviceFingerprint: {
      deviceId: string;
      deviceName?: string;
      os?: string;
      osVersion?: string;
      model?: string;
      brand?: string;
      buildNumber?: string;
      appVersion?: string;
    },
    ipAddress?: string,
  ): Promise<{ deviceId: string; totpSecret: string }> {
    const { deviceId, deviceName, ...fingerprint } = deviceFingerprint;

    // Kiểm tra user tồn tại
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Kiểm tra số lượng device đã đăng ký
    const existingDevices = await this.deviceBindingModel.countDocuments({
      userId: new Types.ObjectId(userId),
      status: DeviceStatus.ACTIVE,
      deviceId: { $ne: deviceId },
    });

    if (existingDevices >= this.MAX_DEVICES) {
      throw new BadRequestException(
        `Đã đạt giới hạn ${this.MAX_DEVICES} thiết bị. Vui lòng xóa thiết bị cũ trước.`,
      );
    }

    // Kiểm tra device đã đăng ký chưa
    const existingDevice = await this.deviceBindingModel.findOne({
      userId: new Types.ObjectId(userId),
      deviceId,
    });

    if (existingDevice) {
      // Re-activate revoked device
      this.logger.log(`Re-activating device ${deviceId}`);
      existingDevice.status = DeviceStatus.ACTIVE;
      existingDevice.publicKey = publicKey;
      existingDevice.totpSecret = this.totpService.generateSecret();
      existingDevice.revokedAt = undefined;
      if (ipAddress) {
        existingDevice.registeredFromIP = ipAddress;
      }
      await existingDevice.save();

      return {
        deviceId: existingDevice.deviceId,
        totpSecret: existingDevice.totpSecret,
      };
    }

    // Tạo TOTP secret mới cho device
    const totpSecret = this.totpService.generateSecret();

    // Log secret for debugging (like @p2p/server)
    this.logger.log('========== SMART OTP SECRET GENERATED ==========');
    this.logger.log(`Device ID: ${deviceId}`);
    this.logger.log(`User ID: ${userId}`);
    this.logger.log(`TOTP Secret: ${totpSecret}`);
    this.logger.log('==========================================');

    // Tạo device binding record
    const newDevice = new this.deviceBindingModel({
      userId: new Types.ObjectId(userId),
      deviceId,
      deviceName:
        deviceName || `${fingerprint.brand || ''} ${fingerprint.model || 'Unknown Device'}`.trim(),
      publicKey,
      totpSecret,
      fingerprint,
      status: DeviceStatus.ACTIVE,
      registeredFromIP: ipAddress,
    });

    await newDevice.save();

    // Cập nhật user smartOTP config
    const activeCount = await this.deviceBindingModel.countDocuments({
      userId: new Types.ObjectId(userId),
      status: DeviceStatus.ACTIVE,
    });

    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        'smartOTP.enabled': true,
        'smartOTP.registeredDevices': activeCount,
      },
    });

    this.logger.log(`Device registered: ${deviceId} for user ${userId}`);

    return {
      deviceId,
      totpSecret, // Trả về để client lưu vào SecureStore
    };
  }

  /**
   * Lấy danh sách devices đã đăng ký của user
   */
  async getRegisteredDevices(userId: string): Promise<DeviceBinding[]> {
    return this.deviceBindingModel
      .find({
        userId: new Types.ObjectId(userId),
        status: DeviceStatus.ACTIVE,
      })
      .select('deviceId deviceName fingerprint createdAt lastUsedAt')
      .sort({ lastUsedAt: -1 })
      .exec();
  }

  /**
   * Thu hồi (revoke) device
   */
  async revokeDevice(userId: string, deviceId: string): Promise<boolean> {
    const result = await this.deviceBindingModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(userId),
        deviceId,
        status: DeviceStatus.ACTIVE,
      },
      {
        status: DeviceStatus.REVOKED,
        revokedAt: new Date(),
      },
    );

    if (!result) {
      return false;
    }

    // Cập nhật số lượng device
    const activeCount = await this.deviceBindingModel.countDocuments({
      userId: new Types.ObjectId(userId),
      status: DeviceStatus.ACTIVE,
    });

    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        'smartOTP.registeredDevices': activeCount,
        'smartOTP.enabled': activeCount > 0,
      },
    });

    this.logger.log(`Device revoked: ${deviceId}`);
    return true;
  }

  /**
   * Kiểm tra device có thuộc user không
   */
  async isDeviceTrusted(
    userId: string,
    deviceId: string,
  ): Promise<DeviceBinding | null> {
    return this.deviceBindingModel
      .findOne({
        userId: new Types.ObjectId(userId),
        deviceId,
        status: DeviceStatus.ACTIVE,
      })
      .exec();
  }

  /**
   * Cập nhật last used cho device
   */
  async updateLastUsed(userId: string, deviceId: string): Promise<void> {
    await this.deviceBindingModel.updateOne(
      { userId: new Types.ObjectId(userId), deviceId },
      { lastUsedAt: new Date() },
    );
  }
}
