import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { generateSecret, generateSync } from 'otplib';

/**
 * TOTP Configuration
 * - step  : 30s
 * - window: ±4 step (±120s) để chịu được clock drift của smartphone
 *           cộng với độ trễ mạng / user nhập chậm.
 */
const TOTP_CONFIG = {
  digits: 6,
  step: 30, // 30 seconds
  window: 4, // ±2 phút
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

  private base32ToBuffer(encoded: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let padding = encoded.match(/=*$/);
    let length = encoded.length;
    if (padding) length -= padding[0].length;

    let buffer = Buffer.alloc(Math.ceil((length * 5) / 8));
    let bits = 0;
    let value = 0;
    let index = 0;

    for (let i = 0; i < length; i++) {
        value = (value << 5) | alphabet.indexOf(encoded[i].toUpperCase());
        bits += 5;
        if (bits >= 8) {
            buffer[index++] = (value >>> (bits - 8)) & 255;
            bits -= 8;
        }
    }
    return buffer;
  }

  /**
   * Simple TOTP generation (fallback using crypto)
   */
  private generateFallback(secret: string, epochMs?: number): string {
    try {
      const timeMs = epochMs || Date.now();
      const timeStep = Math.floor(timeMs / 1000 / TOTP_CONFIG.step);
      // Use accurate base32 decode for secret
      const secretBuffer = this.base32ToBuffer(secret);
      const hmac = crypto.createHmac('sha1', secretBuffer);
      const timeBuffer = Buffer.alloc(8);
      timeBuffer.writeBigInt64BE(BigInt(timeStep));
      hmac.update(timeBuffer);
      const hash = hmac.digest();
      const offset = hash[hash.length - 1] & 0xf;
      const code = (hash.readUInt32BE(offset) & 0x7fffffff) % Math.pow(10, TOTP_CONFIG.digits);
      return code.toString().padStart(TOTP_CONFIG.digits, '0');
    } catch (error) {
      this.logger.error('TOTP fallback generation failed', error);
      // Return random 6 digits as last resort
      return Math.floor(100000 + Math.random() * 900000).toString();
    }
  }

  /**
   * Verify TOTP code với window tolerance.
   *
   * @param secret           Base32 encoded secret
   * @param token            6-digit OTP code từ user
   * @param clientTimestamp  (Optional) timestamp (giây) mà client đã ký kèm —
   *                         dùng để tính step ở phía client, loại bỏ ảnh hưởng
   *                         của clock drift giữa thiết bị và server.
   *                         Nếu không có thì fallback về clock server.
   * @returns true nếu valid
   */
  verify(secret: string, token: string, clientTimestamp?: number): boolean {
    try {
      // Xác định step neo: ưu tiên timestamp client (đã được ECDSA verify),
      // fallback về clock server nếu thiếu.
      const anchorSec = clientTimestamp && clientTimestamp > 0
        ? Math.floor(clientTimestamp)
        : Math.floor(Date.now() / 1000);
      const anchorStep = Math.floor(anchorSec / TOTP_CONFIG.step);

      // 1) Kiểm tra direct ở step neo
      const expectedAtAnchor = generateSync({ secret, epoch: anchorStep * TOTP_CONFIG.step });
      if (token === expectedAtAnchor) {
        this.logger.debug(`TOTP valid at anchor step=${anchorStep} (delta=0)`);
        return true;
      }

      // 2) Kiểm tra ±window steps quanh anchor
      for (let delta = -TOTP_CONFIG.window; delta <= TOTP_CONFIG.window; delta++) {
        if (delta === 0) continue;
        const testEpochSec = (anchorStep + delta) * TOTP_CONFIG.step;
        const expectedToken = generateSync({ secret, epoch: testEpochSec });
        if (token === expectedToken) {
          this.logger.debug(`TOTP valid at delta=${delta} (step=${anchorStep + delta})`);
          return true;
        }
      }

      // Log chi tiết để debug
      const nowSec = Math.floor(Date.now() / 1000);
      const serverStep = Math.floor(nowSec / TOTP_CONFIG.step);
      const expectedServerNow = generateSync({ secret });
      this.logger.warn(
        `TOTP mismatch: received=${token}, ` +
        `expectedAtAnchor=${expectedAtAnchor} (step=${anchorStep}), ` +
        `expectedAtServerNow=${expectedServerNow} (step=${serverStep}), ` +
        `clientTimestamp=${clientTimestamp ?? 'none'}, ` +
        `drift=${clientTimestamp ? (nowSec - clientTimestamp) + 's' : 'n/a'}, ` +
        `window=±${TOTP_CONFIG.window} steps (±${TOTP_CONFIG.window * TOTP_CONFIG.step}s)`,
      );
      return false;
    } catch (error) {
      this.logger.warn('otplib verify failed, using fallback', error);
      // Fallback: tự generate rồi so sánh thủ công (±window)
      try {
        const anchorSec = clientTimestamp && clientTimestamp > 0
          ? Math.floor(clientTimestamp)
          : Math.floor(Date.now() / 1000);
        const anchorStep = Math.floor(anchorSec / TOTP_CONFIG.step);

        for (let delta = -TOTP_CONFIG.window; delta <= TOTP_CONFIG.window; delta++) {
          const testEpochMs = (anchorStep + delta) * TOTP_CONFIG.step * 1000;
          const expected = this.generateFallback(secret, testEpochMs);
          if (token === expected) {
            this.logger.debug(`verifyTOTP (fallback): valid at delta=${delta}`);
            return true;
          }
        }

        this.logger.debug(`verifyTOTP (fallback): token=${token}, no match in window`);
        return false;
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
