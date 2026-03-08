/** Parse Fineract date array [y,m,d] to YYYY-MM-DD for comparison */
export function parsePeriodDate(v: any): string | null {
    if (!v) return null;
    if (Array.isArray(v) && v.length >= 3) {
        const [y, m, d] = v;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    if (typeof v === 'string') return v;
    return null;
}

export type InstallmentStatus = 'paid' | 'overdue' | 'current' | 'upcoming';

/** Trạng thái từng kỳ lịch trả nợ (giống Mifos): paid | overdue | current | upcoming */
export function getInstallmentStatus(period: any): InstallmentStatus {
    const complete = period?.complete === true || (period?.obligationsMetOnDate != null && Array.isArray(period.obligationsMetOnDate));
    if (complete) return 'paid';

    const today = new Date().toISOString().split('T')[0];
    const dueStr = parsePeriodDate(period?.dueDate);
    const fromStr = parsePeriodDate(period?.fromDate);

    if (!dueStr) return 'upcoming';
    if (dueStr < today) return 'overdue';
    if (fromStr && fromStr <= today && today < dueStr) return 'current';
    return 'upcoming';
}
