import { Injectable } from '@nestjs/common';

@Injectable()
export class PhoneHelper {
  /**
   * Convert phone number to local base format (0xxxxxxxxx)
   * From old server: Helpers.covertPhone2LocalBase()
   */
  static convertToLocalBase(phone: string): string {
    if (!phone) return '';
    
    // Remove spaces and special characters
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    
    // Handle different formats
    if (cleaned.startsWith('+84')) {
      return '0' + cleaned.substring(3);
    } else if (cleaned.startsWith('84')) {
      return '0' + cleaned.substring(2);
    } else if (cleaned.startsWith('0')) {
      return cleaned;
    }
    
    // Default: assume it's already in correct format
    return cleaned;
  }

  /**
   * Convert phone number to international base format (+84xxxxxxxxx)
   * From old server: Helpers.covertPhone2InterBase()
   */
  static convertToInterBase(phone: string): string {
    if (!phone) return '';
    
    // Remove spaces and special characters
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    
    // Handle different formats
    if (cleaned.startsWith('+84')) {
      return cleaned;
    } else if (cleaned.startsWith('84')) {
      return '+' + cleaned;
    } else if (cleaned.startsWith('0')) {
      return '+84' + cleaned.substring(1);
    }
    
    // Default: assume it's local format without leading 0
    return '+84' + cleaned;
  }

  /**
   * Validate phone number format
   * From old server: Constant.phoneRegex
   */
  static validatePhone(phone: string): boolean {
    if (!phone) return false;
    
    // Vietnamese phone number regex
    // Supports: +84xxxxxxxxx, 84xxxxxxxxx, 0xxxxxxxxx
    const phoneRegex = /^(\+84|84|0)[0-9]{9}$/;
    
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  }

  /**
   * Generate email from phone number for user identification
   * Since server mới uses email as primary identifier
   */
  static phoneToEmail(phone: string): string {
    const localPhone = this.convertToLocalBase(phone);
    return `${localPhone}@p2p.local`;
  }

  /**
   * Extract phone from email (reverse of phoneToEmail)
   */
  static emailToPhone(email: string): string {
    if (!email || !email.includes('@p2p.local')) {
      return '';
    }
    return email.split('@')[0];
  }

  /**
   * Format phone for display (add spaces for readability)
   */
  static formatForDisplay(phone: string): string {
    const cleaned = this.convertToLocalBase(phone);
    if (cleaned.length === 10 && cleaned.startsWith('0')) {
      // Format: 0xxx xxx xxxx
      return `${cleaned.substring(0, 4)} ${cleaned.substring(4, 7)} ${cleaned.substring(7)}`;
    }
    return cleaned;
  }
}