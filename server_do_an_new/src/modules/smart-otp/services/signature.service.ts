import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Signature Service
 * Xử lý ECDSA signature verification cho Device Binding
 */
@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);

  /**
   * Verify ECDSA signature từ device
   * Dùng để chứng minh OTP đến từ đúng device đã đăng ký
   *
   * @param payload Dữ liệu đã sign (otp:timestamp:actionType)
   * @param signature Base64 encoded signature (DER format) từ device
   * @param publicKeyHex Public key (Hex format) từ DB
   * @returns true nếu signature valid
   */
  verify(payload: string, signature: string, publicKeyHex: string): boolean {
    try {
      this.logger.debug('Verifying ECDSA signature (P-256)...');

      const keyBuffer = Buffer.from(publicKeyHex, 'hex');

      // Standard ECDSA verification using node crypto
      const isValid = crypto.verify(
        'SHA256',
        Buffer.from(payload),
        {
          key: crypto.createPublicKey({
            key: Buffer.concat([
              Buffer.from([
                0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce,
                0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
                0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
              ]),
              keyBuffer,
            ]),
            format: 'der',
            type: 'spki',
          }),
          dsaEncoding: 'der',
        },
        Buffer.from(signature, 'base64'),
      );

      return isValid;
    } catch (error) {
      this.logger.warn(
        'Crypto verify error, trying elliptic fallback',
        error.message,
      );
      try {
        // Fallback to elliptic library if available
        const EC = require('elliptic').ec;
        const ec = new EC('p256');
        const key = ec.keyFromPublic(publicKeyHex, 'hex');
        const hash = crypto.createHash('sha256').update(payload).digest();
        return key.verify(hash, Buffer.from(signature, 'base64'));
      } catch (e) {
        this.logger.error('All verification methods failed', e.message);
        return false;
      }
    }
  }

  /**
   * Build payload string for signing
   * Format: otp:timestamp:actionType
   */
  buildPayload(otp: string, timestamp: number, actionType: string): string {
    return `${otp}:${timestamp}:${actionType}`;
  }
}
