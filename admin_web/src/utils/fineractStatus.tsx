import React from 'react';
import { Tag } from 'antd';
import type { FineractStatus } from '../api/admin';

export function getStatusValue(status: FineractStatus | { value: string; code: string } | string | undefined): string {
    if (!status) return '–';
    if (typeof status === 'string') return status;
    return status.value || '–';
}

export function getStatusCode(status: FineractStatus | { value: string; code: string } | string | undefined): string {
    if (!status) return '';
    if (typeof status === 'string') return status;
    return status.code || '';
}

const CODE_MAP: Record<string, { color: string; label: string }> = {
    // Fineract loan status codes
    'loanStatusType.pendingApproval': { color: 'orange', label: 'Chờ phê duyệt' },
    'loanStatusType.approved': { color: 'blue', label: 'Đã phê duyệt' },
    'loanStatusType.activeInGoodStanding': { color: 'green', label: 'Đang hoạt động' },
    'loanStatusType.active': { color: 'green', label: 'Đang hoạt động' },
    'loanStatusType.closed': { color: 'default', label: 'Đã đóng' },
    'loanStatusType.withdrawnByClient': { color: 'default', label: 'KH rút lại' },
    'loanStatusType.rejected': { color: 'red', label: 'Từ chối' },
    'loanStatusType.writtenOff': { color: 'red', label: 'Xóa nợ' },
    'loanStatusType.overpaid': { color: 'purple', label: 'Trả dư' },
    // Fineract client status
    'clientStatusType.active': { color: 'green', label: 'Hoạt động' },
    'clientStatusType.closed': { color: 'default', label: 'Đã đóng' },
    'clientStatusType.pending': { color: 'orange', label: 'Chờ kích hoạt' },
    // Fallback MongoDB statuses
    'pending': { color: 'orange', label: 'Chờ duyệt' },
    'approved': { color: 'blue', label: 'Đã phê duyệt' },
    'disbursed': { color: 'green', label: 'Đã giải ngân' },
    'rejected': { color: 'red', label: 'Từ chối' },
    'repaid': { color: 'default', label: 'Đã hoàn trả' },
    'active': { color: 'green', label: 'Hoạt động' },
    'inactive': { color: 'default', label: 'Không hoạt động' },
};

export const FineractStatusBadge = React.forwardRef<HTMLSpanElement, { status?: FineractStatus | { value: string; code: string } | string | null }>(
    ({ status }, ref) => {
        if (!status) return <Tag ref={ref} color="default">–</Tag>;

        const code = getStatusCode(status);
        const value = getStatusValue(status);

        const mapped = CODE_MAP[code] ?? CODE_MAP[value.toLowerCase()];
        const color = mapped?.color ?? 'default';
        const label = mapped?.label ?? value;

        return <Tag ref={ref} color={color} style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{label}</Tag>;
    }
);

export function fmtVND(n?: any) {
    if (!n && n !== 0) return '–';
    const val = typeof n === 'number' ? n : Number(n);
    if (isNaN(val)) return '–';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(val);
}
