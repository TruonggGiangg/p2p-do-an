/**
 * Format date to Fineract format: dd MMMM yyyy
 */
export function formatDateForFineract(date: Date): string {
    const months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
    ];

    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return `${day.toString().padStart(2, '0')} ${month} ${year}`;
}

/**
 * Get current date in Fineract format
 */
export function getCurrentFineractDate(): string {
    return formatDateForFineract(new Date());
}

/**
 * Get date X days ago in Fineract format
 */
export function getFineractDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return formatDateForFineract(date);
}

/**
 * Validate date string format
 */
export function isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
}
