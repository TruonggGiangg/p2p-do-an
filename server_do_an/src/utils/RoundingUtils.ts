/**
 * RoundingUtils - Shared Rounding Utilities
 * 
 * Dùng chung cho:
 * - Tính lịch trả nợ (Borrower Repayment Schedule)
 * - Tính lịch thu hồi nhà đầu tư (Lender Collection Schedule)
 * - Phân phối trả nợ (Repayment Distribution)
 * 
 * Đảm bảo đồng bộ, không bị lệch tiền giữa các module.
 * 
 * Reference: p2p/server/utils/RoundingUtils.js
 */

/**
 * Làm tròn số tiền theo bội số (VND thường là 1000đ)
 * 
 * @param amount - Số tiền cần làm tròn
 * @param inMultiplesOf - Bội số làm tròn (default: 1000 cho VND)
 * @returns Số tiền đã làm tròn
 * 
 * @example
 * roundToCurrency(1234567, 1000) // => 1235000
 * roundToCurrency(1234567, 1)    // => 1234567
 */
export const roundToCurrency = (
    amount: number,
    inMultiplesOf: number = 1000,
): number => {
    if (amount === undefined || amount === null || isNaN(amount)) {
        return 0;
    }

    const factor = inMultiplesOf || 1000;

    if (factor <= 1) {
        return Math.round(amount);
    }

    return Math.round(amount / factor) * factor;
};

/**
 * Làm tròn xuống theo bội số (Floor)
 * Dùng khi cần đảm bảo không vượt quá số tiền gốc
 * 
 * @param amount - Số tiền cần làm tròn
 * @param inMultiplesOf - Bội số làm tròn
 */
export const floorToCurrency = (
    amount: number,
    inMultiplesOf: number = 1000,
): number => {
    if (amount === undefined || amount === null || isNaN(amount)) {
        return 0;
    }

    const factor = inMultiplesOf || 1000;

    if (factor <= 1) {
        return Math.floor(amount);
    }

    return Math.floor(amount / factor) * factor;
};

/**
 * Làm tròn lên theo bội số (Ceiling)
 * Dùng khi cần đảm bảo đủ tiền (ví dụ: phí dịch vụ tối thiểu)
 * 
 * @param amount - Số tiền cần làm tròn
 * @param inMultiplesOf - Bội số làm tròn
 */
export const ceilToCurrency = (
    amount: number,
    inMultiplesOf: number = 1000,
): number => {
    if (amount === undefined || amount === null || isNaN(amount)) {
        return 0;
    }

    const factor = inMultiplesOf || 1000;

    if (factor <= 1) {
        return Math.ceil(amount);
    }

    return Math.ceil(amount / factor) * factor;
};

/**
 * Chia đều số tiền thành N phần, phần cuối nhận sai số làm tròn
 * Đảm bảo: sum(parts) === total
 * 
 * @param total - Tổng số tiền
 * @param parts - Số phần cần chia
 * @param inMultiplesOf - Bội số làm tròn
 * @returns Array các phần đã chia
 * 
 * @example
 * distributeEvenly(10000000, 3, 1000) // => [3333000, 3333000, 3334000]
 */
export const distributeEvenly = (
    total: number,
    parts: number,
    inMultiplesOf: number = 1000,
): number[] => {
    if (parts <= 0) return [];
    if (parts === 1) return [total];

    const baseAmount = floorToCurrency(total / parts, inMultiplesOf);
    const result: number[] = new Array(parts - 1).fill(baseAmount);

    // Phần cuối nhận sai số
    const lastAmount = total - baseAmount * (parts - 1);
    result.push(lastAmount);

    return result;
};

/**
 * Phân phối theo tỷ lệ với làm tròn, phần cuối nhận sai số
 * Đảm bảo: sum(results) === total
 * 
 * @param total - Tổng số tiền cần phân phối
 * @param ratios - Mảng tỷ lệ (ví dụ: [0.3, 0.5, 0.2])
 * @param inMultiplesOf - Bội số làm tròn
 * @returns Array số tiền đã phân phối
 */
export const distributeByRatio = (
    total: number,
    ratios: number[],
    inMultiplesOf: number = 1000,
): number[] => {
    if (ratios.length === 0) return [];
    if (ratios.length === 1) return [total];

    const sum = ratios.reduce((a, b) => a + b, 0);
    const normalizedRatios = ratios.map(r => r / sum);

    const results: number[] = [];
    let distributed = 0;

    for (let i = 0; i < normalizedRatios.length - 1; i++) {
        const amount = roundToCurrency(total * normalizedRatios[i], inMultiplesOf);
        results.push(amount);
        distributed += amount;
    }

    // Phần cuối nhận sai số
    results.push(total - distributed);

    return results;
};

export default {
    roundToCurrency,
    floorToCurrency,
    ceilToCurrency,
    distributeEvenly,
    distributeByRatio,
};
