import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly isEnabled: boolean;
  private readonly mockOtpCode = '000000';
  
  // Twilio Configuration
  private readonly twilioClient: twilio.Twilio | null = null;
  private readonly twilioPhoneNumber: string;
  private readonly otpExpireMinutes: number;
  
  // In-memory OTP storage (for development, should use Redis/Database in production)
  private otpStorage = new Map<string, { code: string; expiry: Date; attempts: number }>();

  constructor(private readonly configService: ConfigService) {
    this.isEnabled = this.configService.get<string>('OTP_ENABLED') === 'true';
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID') || '';
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN') || '';
    this.twilioPhoneNumber = this.configService.get<string>('TWILIO_PHONE_NUMBER') || '';
    this.otpExpireMinutes = parseInt(this.configService.get<string>('OTP_EXPIRE_MINUTES') || '5', 10);
    
    if (this.isEnabled) {
      if (accountSid && authToken && this.twilioPhoneNumber) {
        this.twilioClient = twilio(accountSid, authToken);
        this.logger.log('OTP ENABLED - Real SMS will be sent via Twilio');
      } else {
        this.logger.warn('Twilio credentials not configured! SMS will fail.');
      }
    } else {
      this.logger.log('OTP DISABLED - Using mock (database mode)');
    }
    
    // Cleanup expired OTPs every 10 minutes
    setInterval(() => this.cleanupExpiredOtps(), 10 * 60 * 1000);
  }

  /**
   * Send OTP to phone number
   * @param phone Phone number in any format
   * @returns Promise<boolean> - Success status
   */
  async sendOtp(phone: string): Promise<boolean> {
    try {
      // Generate OTP code
      const code = this.isEnabled ? this.generateOtpCode() : this.mockOtpCode;
      
      // Store OTP with expiration
      const expiry = new Date();
      expiry.setMinutes(expiry.getMinutes() + this.otpExpireMinutes);
      this.otpStorage.set(phone, { code, expiry, attempts: 0 });
      
      if (this.isEnabled) {
        // Send real SMS via Twilio
        return await this.sendTwilioSms(phone, code);
      } else {
        // Mock mode - always return success
        this.logger.debug(`Mock OTP sent to ${phone}: ${this.mockOtpCode}`);
        return true;
      }
    } catch (error) {
      this.logger.error(`Failed to send OTP to ${phone}:`, error);
      return false;
    }
  }

  /**
   * Verify OTP code
   * @param phone Phone number
   * @param code OTP code to verify
   * @returns Promise<boolean> - Verification result
   */
  async verifyOtp(phone: string, code: string): Promise<boolean> {
    try {
      const otpData = this.otpStorage.get(phone);
      
      if (!otpData) {
        this.logger.debug(`No OTP found for ${phone}`);
        return false;
      }
      
      // Check expiration
      if (new Date() > otpData.expiry) {
        this.logger.debug(`OTP expired for ${phone}`);
        this.otpStorage.delete(phone);
        return false;
      }
      
      // Check attempts (max 5 attempts)
      if (otpData.attempts >= 5) {
        this.logger.warn(`Too many OTP attempts for ${phone}`);
        this.otpStorage.delete(phone);
        return false;
      }
      
      // Increment attempts
      otpData.attempts++;
      
      // Verify code
      const isValid = code === otpData.code;
      
      if (isValid) {
        // Remove OTP after successful verification
        this.otpStorage.delete(phone);
        this.logger.debug(`OTP verified successfully for ${phone}`);
      } else {
        this.logger.debug(`Invalid OTP for ${phone}. Attempt ${otpData.attempts}/5`);
      }
      
      return isValid;
    } catch (error) {
      this.logger.error(`Failed to verify OTP for ${phone}:`, error);
      return false;
    }
  }

  /**
   * Generate random OTP code
   * @param length Code length (default: 6)
   * @returns string
   */
  private generateOtpCode(length: number = 6): string {
    const digits = '0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += digits[Math.floor(Math.random() * digits.length)];
    }
    return code;
  }

  /**
   * Send SMS via Twilio API
   * @param phone Phone number (international format recommended)
   * @param code OTP code
   * @returns Promise<boolean>
   */
  private async sendTwilioSms(phone: string, code: string): Promise<boolean> {
    try {
      if (!this.twilioClient) {
        this.logger.error('Twilio client not initialized');
        return false;
      }

      // Normalize phone to international format
      const normalizedPhone = this.normalizePhoneForTwilio(phone);
      
      // Prepare message
      const message = `Your OTP verification code is: ${code}. Valid for ${this.otpExpireMinutes} minutes. P2P Lending`;
      
      this.logger.debug(`Sending SMS to ${normalizedPhone} via Twilio`);
      
      // Send SMS via Twilio
      const twilioMessage = await this.twilioClient.messages.create({
        body: message,
        from: this.twilioPhoneNumber,
        to: normalizedPhone,
      });
      
      if (twilioMessage.sid) {
        this.logger.log(`SMS sent successfully to ${normalizedPhone}. MessageSID: ${twilioMessage.sid}`);
        return true;
      } else {
        this.logger.error(`Twilio API error: Failed to get message SID`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Failed to send SMS via Twilio:`, error);
      return false;
    }
  }

  /**
   * Normalize phone number for Twilio
   * Twilio requires: +[country code][number] format (e.g., +84901234567)
   * @param phone Phone number in any format (0xxx, 84xxx, +84xxx)
   * @returns string Normalized phone (+84xxxxxxxxx)
   */
  private normalizePhoneForTwilio(phone: string): string {
    let normalized = phone.replace(/\s+/g, ''); // Remove spaces
    
    // If starts with 0, replace with +84
    if (normalized.startsWith('0')) {
      normalized = '+84' + normalized.substring(1);
    } 
    // If starts with 84 (no +), add +
    else if (normalized.startsWith('84') && !normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }
    // If already has +84, keep as is
    
    return normalized;
  }

  /**
   * Cleanup expired OTPs from storage
   */
  private cleanupExpiredOtps(): void {
    const now = new Date();
    let cleaned = 0;
    
    for (const [phone, otpData] of this.otpStorage.entries()) {
      if (now > otpData.expiry) {
        this.otpStorage.delete(phone);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired OTP(s)`);
    }
  }

  /**
   * Get OTP configuration for development/testing
   */
  getConfig() {
    return {
      enabled: this.isEnabled,
      mockCode: this.isEnabled ? null : this.mockOtpCode,
      provider: this.isEnabled ? 'Twilio' : 'Mock',
      expireMinutes: this.otpExpireMinutes,
      maxAttempts: 5,
    };
  }

  /**
   * Get OTP stats for monitoring
   */
  getStats() {
    return {
      activeOtps: this.otpStorage.size,
      otps: Array.from(this.otpStorage.entries()).map(([phone, data]) => ({
        phone: phone.substring(0, 6) + '***', // Mask phone for privacy
        expiry: data.expiry,
        attempts: data.attempts,
      })),
    };
  }
}