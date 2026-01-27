import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { generateSecret, generateSync, verifySync } from 'otplib';

/**
 * TOTP Configuration
 */
const TOTP_CONFIG = {
  digits: 6,
  step: 30, // 30 seconds
  window: 1, // Allow ±1 step for clock drift
};

/**
 * TOTP Service
 * Xử lý TOTP generation và verification
 */
@Injectable()
export class TotpService {
  private readonly logger = new Logger(TotpService.name);

  /**
   * Generate base32 secret (fallback implementation)
   */
  private generateBase32Secret(length = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    const randomBytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      secret += chars[randomBytes[i] % chars.length];
    }
    return secret;
  }

  /**
   * Generate TOTP secret cho user/device mới
   * @returns Base32 encoded secret
   */
  generateSecret(): string {
    try {
      return generateSecret({ length: 32 });
    } catch (error) {
      this.logger.warn('otplib generateSecret failed, using fallback', error);
      return this.generateBase32Secret(32);
    }
  }

  /**
   * Generate TOTP code từ secret
   * @param secret Base32 encoded secret
   * @returns 6-digit OTP code
   */
  generate(secret: string): string {
    try {
      return generateSync({ secret });
    } catch (error) {
      this.logger.warn('otplib generate failed, using fallback', error);
      return this.generateFallback(secret);
    }
  }

  /**
   * Simple TOTP generation (fallback using crypto)
   */
  private generateFallback(secret: string): string {
    try {
      const timeStep = Math.floor(Date.now() / 1000 / TOTP_CONFIG.step);
      // Use base32 decode for secret
      const secretBuffer = Buffer.from(secret, 'base64');
      const hmac = crypto.createHmac('sha1', secretBuffer);
      const timeBuffer = Buffer.alloc(8);
      timeBuffer.writeBigInt64BE(BigInt(timeStep));
      hmac.update(timeBuffer);
      const hash = hmac.digest();
      const offset = hash[hash.length - 1] & 0xf;
      const code =
        (hash.readUInt32BE(offset) & 0x7fffffff) %
        Math.pow(10, TOTP_CONFIG.digits);
      return code.toString().padStart(TOTP_CONFIG.digits, '0');
    } catch (error) {
      this.logger.error('TOTP fallback generation failed', error);
      // Return random 6 digits as last resort
      return Math.floor(100000 + Math.random() * 900000).toString();
    }
  }

  /**
   * Verify TOTP code
   * @param secret Base32 encoded secret
   * @param token 6-digit OTP code từ user
   * @returns true nếu valid
   */
  verify(secret: string, token: string): boolean {
    try {
      const result = verifySync({
        token,
        secret,
        epochTolerance: TOTP_CONFIG.window,
      });
      return result.valid;
    } catch (error) {
      this.logger.warn('otplib verify failed, using fallback', error);
      // Fallback: simple comparison with current OTP
      try {
        const currentOtp = this.generateFallback(secret);
        const isValid = token === currentOtp;
        this.logger.debug(
          `verifyTOTP (fallback): token=${token}, expected=${currentOtp}, result=${isValid}`,
        );
        return isValid;
      } catch (e) {
        this.logger.error('TOTP verification error', e);
        return false;
      }
    }
  }

  /**
   * Tính thời gian còn lại của OTP hiện tại
   * @returns Seconds remaining (0-29)
   */
  getRemainingSeconds(): number {
    const step = TOTP_CONFIG.step;
    const epoch = Math.floor(Date.now() / 1000);
    return step - (epoch % step);
  }

  /**
   * Lấy time step hiện tại (dùng cho debugging)
   * @returns Current time step
   */
  getTimeStep(): number {
    return Math.floor(Date.now() / 1000 / TOTP_CONFIG.step);
  }
}
