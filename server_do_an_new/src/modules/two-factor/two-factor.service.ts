import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import * as qrcodeTerminal from 'qrcode-terminal';
import { User } from '../users/schemas/user.schema';
import { Generate2faResponseDto } from './dto';

/**
 * Two Factor Authentication Service
 * Xử lý 2FA TOTP (Google Authenticator style)
 */
@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);
  private readonly APP_NAME = 'P2P Lending';

  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) {}

  /**
   * Generate 2FA secret và QR code
   */
  async generateSecret(userId: string, email?: string): Promise<Generate2faResponseDto> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Generate secret
    const secret = generateSecret({ length: 32 });

    // Build OTPAuth URL
    const accountName = email || user.username || user.keycloakId;
    const otpauthUrl = generateURI({
      secret,
      label: accountName,
      issuer: this.APP_NAME,
    });

    // Generate QR code (optional, client có thể tự generate)
    let qrCodeUrl: string | undefined;
    try {
      qrCodeUrl = await QRCode.toDataURL(otpauthUrl);
    } catch (error) {
      this.logger.warn('Failed to generate QR code', error);
    }

    // Log secret and QR code for debugging (like @p2p/server)
    this.logger.log('========== 2FA SECRET GENERATED ==========');
    this.logger.log(`Secret: ${secret}`);
    this.logger.log(`OTPAuth URL: ${otpauthUrl}`);
    this.logger.log(`Account: ${accountName}`);
    if (qrCodeUrl) {
      this.logger.log(`QR Code: Generated (${qrCodeUrl.length} bytes, data URL)`);
      this.logger.log('QR Code (ASCII):');
      // Display QR code as ASCII art in console (like @p2p/server)
      try {
        qrcodeTerminal.generate(otpauthUrl, { small: true }, qrcode => {
          console.log('\n📱 SCAN THIS QR CODE WITH GOOGLE AUTHENTICATOR:\n');
          console.log(qrcode);
        });
      } catch (error) {
        this.logger.warn('Failed to generate ASCII QR code', error);
      }
      this.logger.log(`QR Code Data URL (copy to browser to view):`);
      this.logger.log(qrCodeUrl);
    } else {
      this.logger.log('QR Code: Not generated');
    }
    this.logger.log('==========================================');

    return {
      secret,
      otpauthUrl,
      qrCodeUrl,
    };
  }

  /**
   * Enable 2FA cho user (verify token trước)
   * Flow: User gọi /2fa/secret -> nhận secret -> nhập OTP từ app -> gọi /2fa/enable với secret và token
   */
  async enable2fa(userId: string, secret: string, token: string): Promise<boolean> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Log OTP code for debugging (like @p2p/server)
    this.logger.log('========== 2FA VERIFICATION ==========');
    this.logger.log(`User ID: ${userId}`);
    this.logger.log(`OTP Token: ${token}`);
    this.logger.log(`Secret: ${secret.substring(0, 8)}...`);
    this.logger.log('==========================================');

    // Verify token với secret được cung cấp
    const result = verifySync({ token, secret });
    const isValid = result.valid;

    if (!isValid) {
      this.logger.warn(`2FA verification failed for user ${userId}`);
      throw new BadRequestException('Mã OTP không đúng');
    }

    this.logger.log(`2FA verification successful for user ${userId}`);

    // Lưu secret vào user
    // Sử dụng cách lưu nested object đúng cách
    const updateResult = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          twoFactor: {
            enabled: true,
            secret: secret,
            enabledAt: new Date(),
          },
        },
      },
      { new: true, runValidators: true },
    );

    if (!updateResult) {
      this.logger.error(`Failed to update user ${userId} with 2FA settings`);
      throw new BadRequestException('Không thể lưu cài đặt 2FA');
    }

    // Verify the update was successful
    const updatedUser = await this.userModel.findById(userId);
    const twoFactorData = (updatedUser as any)?.twoFactor;
    const isActuallyEnabled = !!twoFactorData?.enabled;

    this.logger.log(`========== 2FA ENABLE VERIFICATION ==========`);
    this.logger.log(`User ID: ${userId}`);
    this.logger.log(`Updated user found: ${!!updatedUser}`);
    this.logger.log(`TwoFactor data after update: ${JSON.stringify(twoFactorData)}`);
    this.logger.log(`Verified enabled: ${isActuallyEnabled}`);
    this.logger.log(`==========================================`);

    if (!isActuallyEnabled) {
      this.logger.error(`2FA was not properly saved for user ${userId}`);
      throw new BadRequestException('2FA không được lưu đúng cách');
    }

    return true;
  }

  /**
   * Verify 2FA token
   */
  async verifyToken(userId: string, token: string): Promise<boolean> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Lấy secret từ user
    const secret = (user as any).twoFactor?.secret;
    if (!secret) {
      throw new BadRequestException('2FA chưa được kích hoạt');
    }

    // Validate token format (must be 6 digits) to prevent otplib internal errors
    if (!token || typeof token !== 'string' || token.length !== 6 || !/^\d{6}$/.test(token)) {
      this.logger.warn(`Invalid 2FA token format: "${token}" (length: ${token?.length})`);
      return false;
    }

    const result = verifySync({ token, secret });
    const isValid = result.valid;

    this.logger.log(`========== 2FA VERIFY TOKEN ==========`);
    this.logger.log(`User ID: ${userId}`);
    this.logger.log(`Token: ${token}`);
    this.logger.log(`Secret: ${secret.substring(0, 8)}...`);
    this.logger.log(`Valid: ${isValid}`);
    this.logger.log(`==========================================`);

    if (!isValid) {
      this.logger.warn(`2FA verification failed for user ${userId}`);
    } else {
      this.logger.log(`2FA verification successful for user ${userId}`);
    }

    return isValid;
  }

  /**
   * Disable 2FA
   */
  async disable2fa(userId: string): Promise<boolean> {
    await this.userModel.findByIdAndUpdate(userId, {
      $unset: {
        'twoFactor.enabled': '',
        'twoFactor.secret': '',
        'twoFactor.enabledAt': '',
      },
    });

    this.logger.log(`2FA disabled for user ${userId}`);
    return true;
  }

  /**
   * Check if 2FA is enabled
   */
  async isEnabled(userId: string): Promise<boolean> {
    // Convert string to ObjectId if needed
    let queryId: any = userId;
    try {
      if (typeof userId === 'string' && !Types.ObjectId.isValid(userId)) {
        this.logger.warn(`Invalid user ID format: ${userId}`);
        return false;
      }
      if (typeof userId === 'string') {
        queryId = new Types.ObjectId(userId);
      }
    } catch (error) {
      this.logger.error(`Error converting user ID to ObjectId: ${userId}`, error);
      return false;
    }

    const user = await this.userModel.findById(queryId);
    if (!user) {
      this.logger.warn(`User not found for 2FA status check: ${userId} (ObjectId: ${queryId})`);
      throw new UnauthorizedException('User account not found');
    }

    const twoFactorData = (user as any)?.twoFactor;
    const enabled = !!twoFactorData?.enabled;

    this.logger.log(`========== 2FA STATUS CHECK ==========`);
    this.logger.log(`User ID (string): ${userId}`);
    this.logger.log(`User ID (ObjectId): ${queryId}`);
    this.logger.log(`User found: ${!!user}`);
    this.logger.log(`User _id: ${(user as any)?._id}`);
    this.logger.log(`TwoFactor data: ${JSON.stringify(twoFactorData)}`);
    this.logger.log(`Enabled: ${enabled}`);
    this.logger.log(`==========================================`);

    return enabled;
  }
}
