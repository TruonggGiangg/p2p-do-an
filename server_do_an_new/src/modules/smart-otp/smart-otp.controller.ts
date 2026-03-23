import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { SmartOtpService } from './services/smart-otp.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RegisterDeviceDto, RequestOtpDto, VerifyOtpDto } from './dto';

/**
 * Smart OTP Controller
 * API endpoints cho Smart OTP với Device Binding
 */
@ApiTags('smart-otp')
@Controller('otp')
@ApiBearerAuth('access-token')
export class SmartOtpController {
  constructor(
    private readonly smartOtpService: SmartOtpService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  /**
   * Đăng ký device mới với Smart OTP
   */
  @Post('register-device')
  @ApiOperation({ summary: 'Register device with Smart OTP' })
  @ApiResponse({ status: 200, description: 'Đăng ký Smart OTP thành công' })
  async registerDevice(@CurrentUser('id') userId: string, @Body() body: RegisterDeviceDto, @Req() req: Request) {
    // Security Enhancement: Verify 2FA token if 2FA is enabled for user
    const is2faEnabled = await this.twoFactorService.isEnabled(userId);
    if (is2faEnabled) {
      if (!body.verificationToken) {
        throw new BadRequestException('Mã 2FA là bắt buộc khi đăng ký thiết bị mới');
      }
      const isTokenValid = await this.twoFactorService.verifyToken(userId, body.verificationToken);
      if (!isTokenValid) {
        throw new BadRequestException('Mã 2FA không chính xác hoặc đã hết hạn');
      }
    }

    const ipAddress = req.ip || req.connection?.remoteAddress;
    const result = await this.smartOtpService.registerDevice(userId, body.publicKey, body.deviceFingerprint, ipAddress);

    return {
      deviceId: result.deviceId,
      totpSecret: result.totpSecret, // Client lưu vào SecureStore
    };
  }

  /**
   * Lấy danh sách devices đã đăng ký
   */
  @Get('devices')
  @ApiOperation({ summary: 'Get registered devices' })
  @ApiResponse({ status: 200, description: 'Danh sách thiết bị' })
  async getDevices(@CurrentUser('id') userId: string) {
    const devices = await this.smartOtpService.getRegisteredDevices(userId);

    return {
      devices,
      count: devices.length,
    };
  }

  /**
   * Thu hồi (revoke) device
   */
  @Delete('revoke-device/:deviceId')
  @ApiOperation({ summary: 'Revoke device' })
  async revokeDevice(@CurrentUser('id') userId: string, @Param('deviceId') deviceId: string) {
    const result = await this.smartOtpService.revokeDevice(userId, deviceId);

    if (result) {
      return { message: 'Đã thu hồi thiết bị thành công' };
    } else {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }
  }

  /**
   * Tạo OTP session cho action
   */
  @Post('request')
  @ApiOperation({ summary: 'Request OTP session for action' })
  async requestOtp(@CurrentUser('id') userId: string, @Body() body: RequestOtpDto, @Req() req: Request) {
    const ipAddress = req.ip || req.socket?.remoteAddress;
    const session = await this.smartOtpService.createSession(
      userId,
      body.deviceId,
      body.actionType,
      body.actionData || {},
      ipAddress,
    );

    return {
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      expiresIn: session.expiresIn,
    };
  }

  /**
   * Xác thực Smart OTP
   */
  @Post('verify')
  @ApiOperation({ summary: 'Verify Smart OTP' })
  async verifyOtp(@CurrentUser('id') userId: string, @Body() body: VerifyOtpDto) {
    const result = await this.smartOtpService.verifySmartOtp(
      userId,
      body.sessionId,
      body.otp,
      body.signature,
      body.timestamp,
      body.deviceId,
      body.actionType,
    );

    if (result.valid) {
      return {
        message: result.message,
        data: {
          verified: true,
          actionData: result.actionData,
        },
      };
    } else {
      throw new BadRequestException(result.message);
    }
  }

  /**
   * Kiểm tra trạng thái OTP session
   */
  @Get('session/:sessionId')
  @ApiOperation({ summary: 'Get OTP session status' })
  async getSessionStatus(@CurrentUser('id') userId: string, @Param('sessionId') sessionId: string) {
    const session = await this.smartOtpService.getSessionStatus(sessionId);

    if (!session) {
      throw new NotFoundException('Session không tồn tại');
    }

    return {
      sessionId: session.sessionId,
      status: session.status,
      actionType: session.actionType,
      expiresAt: session.expiresAt,
      attempts: session.attempts,
      remainingAttempts: Math.max(0, 3 - session.attempts),
    };
  }

  /**
   * Kiểm tra trạng thái Smart OTP của user
   */
  @Get('status')
  @ApiOperation({ summary: 'Get Smart OTP status for current user' })
  async getSmartOtpStatus(@CurrentUser('id') userId: string) {
    return this.smartOtpService.getSmartOtpStatus(userId);
  }

  /**
   * Lấy thời gian còn lại của OTP hiện tại
   */
  @Get('time-remaining')
  @ApiOperation({ summary: 'Get remaining time for current OTP' })
  async getTimeRemaining() {
    const remainingSeconds = this.smartOtpService.getRemainingSeconds();
    const timeStep = this.smartOtpService.getTimeStep();

    return {
      remainingSeconds,
      timeStep,
    };
  }
}
