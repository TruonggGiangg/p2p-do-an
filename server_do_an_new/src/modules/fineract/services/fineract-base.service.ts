import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Fineract Constants
export const ACCOUNT_TYPE_SAVINGS = 2;
export const LOAN_TYPE_INDIVIDUAL = 'individual';
export const STRATEGY_MIFOS_STANDARD = 'mifos-standard-strategy';
export const DATE_FORMAT_STRICT = 'yyyy-MM-dd';
export const DATE_FORMAT_DISPLAY = 'dd MMMM yyyy';

/**
 * FineractBaseService - Shared utilities for all Fineract services
 */
@Injectable()
export class FineractBaseService {
    protected readonly logger = new Logger(this.constructor.name);

    constructor(protected readonly configService: ConfigService) { }

    // -------------------- DATE HELPERS --------------------

    getTodayFormatted(format: 'iso' | 'display' | 'ca' = 'iso'): string {
        const now = new Date();
        if (format === 'ca') return now.toLocaleDateString('en-CA'); // yyyy-mm-dd
        if (format === 'display') {
            // Format as "dd MMMM yyyy" - ensure 2-digit day
            const day = String(now.getDate()).padStart(2, '0');
            const monthNames = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];
            const month = monthNames[now.getMonth()];
            const year = now.getFullYear();
            return `${day} ${month} ${year}`;
        }

        // Return local YYYY-MM-DD instead of UTC
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // -------------------- CONFIG HELPERS --------------------

    getDefaultConfig<T>(key: string): T {
        return this.configService.getOrThrow<T>(`defaults.${key}`);
    }

    getCommonLocaleParams(format: 'strict' | 'display' = 'display') {
        return {
            locale: this.configService.get<string>('defaults.locale') || 'en',
            dateFormat: format === 'strict' ? DATE_FORMAT_STRICT : this.getDefaultConfig<string>('dateFormat'),
        };
    }

    // -------------------- ERROR HANDLING --------------------

    handleError(error: any, context: string): never {
        const errorData = error.response?.data;
        const errorMessage = errorData?.developerMessage || errorData?.defaultUserMessage || error.message;

        this.logger.error(`${context}: ${JSON.stringify(errorData || error.message)}`);

        if (errorData?.errors?.length > 0) {
            throw new BadRequestException(errorData.errors[0].defaultUserMessage || context);
        }

        throw new BadRequestException(`${context}: ${errorMessage}`);
    }
}
