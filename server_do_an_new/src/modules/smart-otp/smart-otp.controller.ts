import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { SmartOtpService } from './services/smart-otp.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../auth/interfaces/auth.interface';
import {
  RegisterDeviceDto,
  RequestOtpDto,
  VerifyOtpDto,
} from './dto';

/**
 * Smart OTP Controller
 * API endpoints cho Smart OTP với Device Binding
 */
@ApiTags('smart-otp')
@Controller('otp')
@ApiBearerAuth('access-token')
export class SmartOtpController {
  constructor(private readonly smartOtpService: SmartOtpService) {}

  /**
   * Đăng ký device mới với Smart OTP
   * POST /otp/register-device
   */
  @Post('register-device')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register device with Smart OTP' })
  async registerDevice(
    @CurrentUser() user: UserPayload,
    @Body() body: RegisterDeviceDto,
    @Req() req: Request,
  ) {
    if (!user._id) {
      throw new Error('User ID not found');
    }
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const result = await this.smartOtpService.registerDevice(
      user._id,
      body.publicKey,
      body.deviceFingerprint,
      ipAddress,
    );

    return {
      success: true,
      message: 'Đăng ký Smart OTP thành công',
      deviceId: result.deviceId,
      totpSecret: result.totpSecret, // Client lưu vào SecureStore
    };
  }

  /**
   * Lấy danh sách devices đã đăng ký
   * GET /otp/devices
   */
  @Get('devices')
  @ApiOperation({ summary: 'Get registered devices' })
  async getDevices(@CurrentUser() user: UserPayload) {
    if (!user._id) {
      throw new Error('User ID not found');
    }
    const devices = await this.smartOtpService.getRegisteredDevices(user._id);

    return {
      success: true,
      devices,
      count: devices.length,
    };
  }

  /**
   * Thu hồi (revoke) device
   * DELETE /otp/revoke-device/:deviceId
   */
  @Delete('revoke-device/:deviceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke device' })
  async revokeDevice(
    @CurrentUser() user: UserPayload,
    @Param('deviceId') deviceId: string,
  ) {
    if (!user._id) {
      throw new Error('User ID not found');
    }
    const result = await this.smartOtpService.revokeDevice(user._id, deviceId);

    if (result) {
      return {
        success: true,
        message: 'Đã thu hồi thiết bị thành công',
      };
    } else {
      return {
        success: false,
        message: 'Không tìm thấy thiết bị',
      };
    }
  }

  /**
   * Tạo OTP session cho action
   * POST /otp/request
   */
  @Post('request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request OTP session for action' })
  async requestOtp(
    @CurrentUser() user: UserPayload,
    @Body() body: RequestOtpDto,
    @Req() req: Request,
  ) {
    if (!user._id) {
      throw new Error('User ID not found');
    }
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const session = await this.smartOtpService.createSession(
      user._id,
      body.deviceId,
      body.actionType,
      body.actionData || {},
      ipAddress,
    );

    return {
      success: true,
      message: 'Đã tạo OTP session',
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      expiresIn: session.expiresIn,
    };
  }

  /**
   * Xác thực Smart OTP
   * POST /otp/verify
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify Smart OTP' })
  async verifyOtp(
    @CurrentUser() user: UserPayload,
    @Body() body: VerifyOtpDto,
  ) {
    if (!user._id) {
      throw new Error('User ID not found');
    }
    const result = await this.smartOtpService.verifySmartOtp(
      user._id,
      body.sessionId,
      body.otp,
      body.signature,
      body.timestamp,
      body.deviceId,
      body.actionType,
    );

    if (result.valid) {
      return {
        success: true,
        message: result.message,
        verified: true,
        actionData: result.actionData,
      };
    } else {
      return {
        success: false,
        message: result.message,
      };
    }
  }

  /**
   * Kiểm tra trạng thái OTP session
   * GET /otp/session/:sessionId
   */
  @Get('session/:sessionId')
  @ApiOperation({ summary: 'Get OTP session status' })
  async getSessionStatus(
    @CurrentUser() user: UserPayload,
    @Param('sessionId') sessionId: string,
  ) {
    const session = await this.smartOtpService.getSessionStatus(sessionId);

    if (!session) {
      return {
        success: false,
        message: 'Session không tồn tại',
      };
    }

    return {
      success: true,
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
   * GET /otp/status
   */
  @Get('status')
  @ApiOperation({ summary: 'Get Smart OTP status for current user' })
  async getSmartOtpStatus(@CurrentUser() user: UserPayload) {
    if (!user._id) {
      throw new Error('User ID not found');
    }
    const status = await this.smartOtpService.getSmartOtpStatus(user._id);

    return {
      success: true,
      ...status,
    };
  }

  /**
   * Lấy thời gian còn lại của OTP hiện tại
   * GET /otp/time-remaining
   */
  @Get('time-remaining')
  @ApiOperation({ summary: 'Get remaining time for current OTP' })
  async getTimeRemaining() {
    const remaining = this.smartOtpService.getRemainingSeconds();
    const timeStep = this.smartOtpService.getTimeStep();

    return {
      success: true,
      remainingSeconds: remaining,
      timeStep,
    };
  }
}
