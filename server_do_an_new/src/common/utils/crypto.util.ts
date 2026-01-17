import * as crypto from 'crypto';

/**
 * Generate random string
 */
export function generateRandomString(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash password using SHA256
 */
export function hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Generate secure random token
 */
export function generateSecureToken(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Mask sensitive data for logging
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
    if (!data || data.length <= visibleChars) {
        return '***';
    }
    return data.substring(0, visibleChars) + '*'.repeat(data.length - visibleChars);
}
