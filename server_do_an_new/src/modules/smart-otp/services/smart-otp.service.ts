import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { DeviceBindingService } from './device-binding.service';
import { OtpSessionService } from './otp-session.service';
import { TotpService } from './totp.service';
import { SignatureService } from './signature.service';
import { OtpActionType } from '../enums/otp-action-type.enum';
import { DeviceBinding } from '../schemas/device-binding.schema';

/**
 * Smart OTP Service
 * Service chính orchestrate tất cả các operations
 */
@Injectable()
export class SmartOtpService {
  private readonly logger = new Logger(SmartOtpService.name);
  private readonly TIMESTAMP_TOLERANCE_SECONDS = 120; // 2 phút

  constructor(
    private deviceBindingService: DeviceBindingService,
    private otpSessionService: OtpSessionService,
    private totpService: TotpService,
    private signatureService: SignatureService,
  ) {}

  /**
   * Đăng ký device mới
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
    return this.deviceBindingService.registerDevice(userId, publicKey, deviceFingerprint, ipAddress);
  }

  /**
   * Lấy danh sách devices
   */
  async getRegisteredDevices(userId: string): Promise<DeviceBinding[]> {
    return this.deviceBindingService.getRegisteredDevices(userId);
  }

  /**
   * Revoke device
   */
  async revokeDevice(userId: string, deviceId: string): Promise<boolean> {
    return this.deviceBindingService.revokeDevice(userId, deviceId);
  }

  /**
   * Tạo OTP session
   */
  async createSession(
    userId: string,
    deviceId: string,
    actionType: OtpActionType,
    actionData: Record<string, any>,
    ipAddress?: string,
  ): Promise<{ sessionId: string; expiresAt: Date; expiresIn: number }> {
    const { sessionId, expiresAt } = await this.otpSessionService.createSession(
      userId,
      deviceId,
      actionType,
      actionData,
      ipAddress,
    );

    const expiresIn = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

    return { sessionId, expiresAt, expiresIn };
  }

  /**
   * Verify Smart OTP (TOTP + Signature)
   */
  async verifySmartOtp(
    userId: string,
    sessionId: string,
    otp: string,
    signature: string,
    timestamp: number,
    deviceId: string,
    actionType: OtpActionType,
  ): Promise<{
    valid: boolean;
    message: string;
    actionData?: any;
  }> {
    try {
      // 1. Lấy OTP session
      const session = await this.otpSessionService.getSession(sessionId, userId);
      if (!session) {
        throw new NotFoundException('Session không tồn tại');
      }
      this.otpSessionService.validateSession(session, actionType);

      // 2. Lấy device binding để verify
      const device = await this.deviceBindingService.isDeviceTrusted(userId, deviceId);

      if (!device) {
        throw new NotFoundException('Thiết bị không hợp lệ');
      }

      // 3. Verify ECDSA signature (Device Binding proof)
      const payload = this.signatureService.buildPayload(otp, timestamp, actionType);
      const signatureValid = this.signatureService.verify(payload, signature, device.publicKey);

      if (!signatureValid) {
        await this.otpSessionService.incrementAttempts(sessionId);
        const remainingAttempts = this.otpSessionService['MAX_ATTEMPTS'] - (session?.attempts || 0) - 1;
        return {
          valid: false,
          message: `Chữ ký không hợp lệ. Còn ${remainingAttempts} lần thử.`,
        };
      }

      // 4. Verify timestamp (chống replay attack - max 2 phút)
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestamp) > this.TIMESTAMP_TOLERANCE_SECONDS) {
        await this.otpSessionService.incrementAttempts(sessionId);
        return {
          valid: false,
          message: 'Timestamp không hợp lệ. Vui lòng thử lại.',
        };
      }

      // 5. Verify TOTP
      // Log OTP code for debugging (like @p2p/server)
      const expectedOtp = this.totpService.generate(device.totpSecret);
      this.logger.log('========== SMART OTP VERIFICATION ==========');
      this.logger.log(`Session ID: ${sessionId}`);
      this.logger.log(`User ID: ${userId}`);
      this.logger.log(`Device ID: ${deviceId}`);
      this.logger.log(`OTP Code (received): ${otp}`);
      this.logger.log(`OTP Code (expected): ${expectedOtp}`);
      this.logger.log(`Action Type: ${actionType}`);
      this.logger.log(`Secret: ${device.totpSecret.substring(0, 8)}...`);
      this.logger.log(`Server time: ${new Date().toISOString()}`);
      this.logger.log(`Client timestamp: ${new Date(timestamp * 1000).toISOString()}`);
      this.logger.log('==========================================');

      const totpValid = this.totpService.verify(device.totpSecret, otp);
      this.logger.log(`Verification Results: signatureValid=${signatureValid}, totpValid=${totpValid}`);

      if (!totpValid) {
        await this.otpSessionService.incrementAttempts(sessionId);
        const remainingAttempts = this.otpSessionService['MAX_ATTEMPTS'] - (session?.attempts || 0) - 1;

        // Check if should lock user
        if ((session?.attempts || 0) + 1 >= this.otpSessionService['MAX_ATTEMPTS']) {
          await this.otpSessionService.lockUser(userId);
        }

        return {
          valid: false,
          message: `Mã OTP không đúng. Còn ${remainingAttempts} lần thử.`,
        };
      }

      // 6. Đánh dấu session đã verify
      await this.otpSessionService.markVerified(sessionId);

      // 7. Cập nhật last used cho device
      await this.deviceBindingService.updateLastUsed(userId, deviceId);

      this.logger.log(`OTP verified successfully for session ${sessionId}`);

      return {
        valid: true,
        message: 'Xác thực OTP thành công',
        actionData: session?.actionData,
      };
    } catch (error) {
      this.logger.error('verifySmartOTP error', error.message);
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      return {
        valid: false,
        message: 'Lỗi xác thực OTP: ' + error.message,
      };
    }
  }

  /**
   * Lấy trạng thái session
   */
  async getSessionStatus(sessionId: string) {
    return this.otpSessionService.getSessionStatus(sessionId);
  }

  /**
   * Consume verified session
   */
  async consumeSession(userId: string, sessionId: string, actionType: OtpActionType) {
    return this.otpSessionService.consumeSession(userId, sessionId, actionType);
  }

  /**
   * Lấy thời gian còn lại của OTP
   */
  getRemainingSeconds(): number {
    return this.totpService.getRemainingSeconds();
  }

  /**
   * Lấy time step hiện tại
   */
  getTimeStep(): number {
    return this.totpService.getTimeStep();
  }

  /**
   * Lấy trạng thái Smart OTP của user
   */
  async getSmartOtpStatus(userId: string) {
    const devices = await this.getRegisteredDevices(userId);
    return {
      enabled: devices.length > 0,
      registeredDevices: devices.length,
      maxDevices: 3,
      devices: devices.map((d: any) => ({
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        registeredAt: d.createdAt || d.registeredAt,
        lastUsedAt: d.lastUsedAt,
      })),
    };
  }
}
