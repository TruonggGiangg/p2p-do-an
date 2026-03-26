import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { ec as EC } from 'elliptic';

const ec = new EC('p256');

/**
 * Signature Service
 * Xử lý ECDSA signature verification cho Device Binding
 *
 * Client flow: SHA256(payload) → hex string → elliptic.sign(hexHash) → DER → base64
 * Server flow: SHA256(payload) → Buffer → elliptic.verify(hashBuffer, derSig)
 *
 * Dùng elliptic trực tiếp (cùng thư viện với client) để đảm bảo tương thích 100%.
 */
@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);

  /**
   * Verify ECDSA signature từ device
   *
   * @param payload Dữ liệu đã sign (otp:timestamp:actionType)
   * @param signature Base64 encoded signature (DER format) từ device
   * @param publicKeyHex Public key (Hex format) từ DB
   * @returns true nếu signature valid
   */
  verify(payload: string, signature: string, publicKeyHex: string): boolean {
    try {
      this.logger.debug(
        `Verifying ECDSA signature (P-256) | payload=${payload} | pubKey=${publicKeyHex.substring(0, 16)}...${publicKeyHex.substring(publicKeyHex.length - 8)} (${publicKeyHex.length} hex chars) | sig=${signature.substring(0, 20)}...`,
      );

      // Primary: elliptic library (same as client-side)
      // Client signs SHA256(payload) as hex → elliptic treats hex string as message hash
      // Server: compute SHA256(payload) → Buffer → elliptic verify
      const key = ec.keyFromPublic(publicKeyHex, 'hex');
      const hash = crypto.createHash('sha256').update(payload).digest();
      const sigBuffer = Buffer.from(signature, 'base64');
      const isValid = key.verify(hash, sigBuffer);

      this.logger.debug(`Elliptic verify result: ${isValid}`);
      return isValid;
    } catch (error) {
      this.logger.warn('Elliptic verify error, trying node:crypto fallback', error.message);
      try {
        // Fallback: node:crypto with SPKI key format
        const keyBuffer = Buffer.from(publicKeyHex, 'hex');
        const isValid = crypto.verify(
          'SHA256',
          Buffer.from(payload),
          {
            key: crypto.createPublicKey({
              key: Buffer.concat([
                Buffer.from([
                  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86,
                  0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
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
        this.logger.debug(`Node crypto fallback result: ${isValid}`);
        return isValid;
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
