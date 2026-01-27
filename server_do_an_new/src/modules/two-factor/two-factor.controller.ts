import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TwoFactorService } from './two-factor.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../auth/interfaces/auth.interface';
import { Enable2faDto, Verify2faDto } from './dto';

/**
 * Two Factor Authentication Controller
 * API endpoints cho 2FA TOTP (Google Authenticator style)
 */
@ApiTags('two-factor')
@Controller('2fa')
@ApiBearerAuth('access-token')
export class TwoFactorController {
  constructor(private readonly twoFactorService: TwoFactorService) {}

  /**
   * Generate 2FA secret và QR code
   * GET /2fa/secret
   */
  @Get('secret')
  @ApiOperation({ summary: 'Generate 2FA secret and QR code' })
  async generateSecret(@CurrentUser() user: UserPayload) {
    if (!user._id) {
      throw new Error('User ID not found');
    }
    const result = await this.twoFactorService.generateSecret(
      user._id,
      user.email,
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Enable 2FA
   * POST /2fa/enable
   */
  @Post('enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable 2FA with OTP verification' })
  async enable2fa(
    @CurrentUser() user: UserPayload,
    @Body() body: Enable2faDto,
  ) {
    if (!user._id) {
      throw new Error('User ID not found');
    }
    console.log('[TwoFactorController] enable2fa - User ID:', user._id, 'Email:', user.email);
    const success = await this.twoFactorService.enable2fa(
      user._id,
      body.secret,
      body.token,
    );

    return {
      success,
      message: success
        ? 'Đã kích hoạt 2FA thành công'
        : 'Không thể kích hoạt 2FA',
    };
  }

  /**
   * Verify 2FA token
   * POST /2fa/verify
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify 2FA token' })
  async verify2fa(
    @CurrentUser() user: UserPayload,
    @Body() body: Verify2faDto,
  ) {
    if (!user._id) {
      throw new Error('User ID not found');
    }
    const isValid = await this.twoFactorService.verifyToken(
      user._id,
      body.token,
    );

    return {
      success: isValid,
      message: isValid ? 'Mã OTP hợp lệ' : 'Mã OTP không đúng',
    };
  }

  /**
   * Disable 2FA
   * DELETE /2fa/disable
   */
  @Delete('disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable 2FA' })
  async disable2fa(@CurrentUser() user: UserPayload) {
    if (!user._id) {
      throw new Error('User ID not found');
    }
    const success = await this.twoFactorService.disable2fa(user._id);

    return {
      success,
      message: success ? 'Đã tắt 2FA' : 'Không thể tắt 2FA',
    };
  }

  /**
   * Check 2FA status
   * GET /2fa/status
   */
  @Get('status')
  @ApiOperation({ summary: 'Get 2FA status' })
  async getStatus(@CurrentUser() user: UserPayload) {
    if (!user._id) {
      throw new Error('User ID not found');
    }
    console.log('[TwoFactorController] getStatus - User ID:', user._id, 'Email:', user.email);
    const enabled = await this.twoFactorService.isEnabled(user._id);

    return {
      success: true,
      enabled,
    };
  }
}
