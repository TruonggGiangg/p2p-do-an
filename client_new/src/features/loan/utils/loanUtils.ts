import { LoanHistoryItem } from '../services/loan.service';

/**
 * Format tiền sang định dạng VNĐ (VD: 1,000,000)
 */
export const formatMoney = (amount?: number | null) => {
    if (amount == null || isNaN(amount)) return '0';
    return Math.round(amount).toLocaleString('vi-VN');
};

/**
 * Format ngày tháng (hỗ trợ cả mảng [Y,M,D] từ Fineract và string ISO)
 */
export const formatDateShort = (dateInput?: any) => {
    if (!dateInput) return '';
    
    // Xử lý mảng [Y, M, D] từ Fineract
    if (Array.isArray(dateInput) && dateInput.length >= 3) {
        const [y, m, d] = dateInput;
        return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    }

    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/**
 * Trình khớp icon dựa trên mục đích vay
 */
export const getPurposeIcon = (purpose?: string): any => {
    const lower = purpose?.toLowerCase() || '';
    if (lower.includes('học') || lower.includes('giáo') || lower.includes('trường')) return 'school';
    if (lower.includes('xe')) return 'car';
    if (lower.includes('nhà') || lower.includes('sửa') || lower.includes('đất')) return 'home-variant';
    if (lower.includes('doanh') || lower.includes('đầu tư')) return 'briefcase';
    if (lower.includes('tiêu dùng') || lower.includes('mua sắm')) return 'cart';
    if (lower.includes('y tế') || lower.includes('sức khỏe')) return 'heart-pulse';
    if (lower.includes('du lịch')) return 'airplane';
    return 'cash-multiple';
};

/**
 * Logic mapping trạng thái "Chuẩn" từ trang Lịch sử
 */
export const getStatusInfo = (loan: LoanHistoryItem) => {
    const sf = loan.statusInfo;
    const isFullMatch = (loan as any).isFullMatch || (loan as any).fineractDetails?.isFullMatch;
    const contractStatus = String((loan as any).contractStatus || '').toLowerCase();
    const hasContractSignal = Boolean((loan as any).contractId || contractStatus);
    const borrowerSigned = Boolean(
        (loan as any).contractSignedVerified || ['signed', 'active', 'completed'].includes(contractStatus)
    );

    const waitingForBorrowerSignature = isFullMatch && hasContractSignal && !borrowerSigned;
    const pendingSignatureStatus = () => ({ text: 'Chờ ký', color: '#F59E0B', bgColor: '#FFFBEB', icon: 'pen' as const });
    const pendingDisbursementStatus = () => ({ text: 'Chờ giải ngân', color: '#0EA5E9', bgColor: '#F0F9FF', icon: 'cash-clock' as const });
    const activeStatus = () => ({ text: 'Đang vay', color: '#3B82F6', bgColor: '#EFF6FF', icon: 'progress-clock' as const });

    // 1. Ưu tiên kiểm tra quá hạn
    if (loan.delinquentDays && loan.delinquentDays > 0) {
        return { 
            text: `Quá hạn ${loan.delinquentDays} ngày`, 
            color: '#F6465D', 
            bgColor: '#FEF2F2',
            icon: 'alert-circle' as const 
        };
    }

    // 2. Kiểm tra theo fineractStatus (statusInfo)
    if (sf) {
        if (sf.active) {
            if (waitingForBorrowerSignature) return pendingSignatureStatus();
            return activeStatus();
        }
        if (sf.closedObligationsMet) return { text: 'Đã tất toán', color: '#0ECB81', bgColor: '#F0FDF4', icon: 'check-circle' as const };
        if (sf.closedWrittenOff) return { text: 'Đã xóa nợ', color: '#6B7280', bgColor: '#F9FAFB', icon: 'close-circle' as const };
        if (sf.pendingApproval) return { text: 'Chờ duyệt', color: '#F59E0B', bgColor: '#FFFBEB', icon: 'clock-outline' as const };
        
        if (sf.waitingForDisbursal || sf.approved) {
            if (waitingForBorrowerSignature || isFullMatch) return borrowerSigned ? pendingDisbursementStatus() : pendingSignatureStatus();
            return { text: 'Đang gọi vốn', color: '#8B5CF6', bgColor: '#F5F3FF', icon: 'account-group' as const };
        }
        
        if (sf.rejected) return { text: 'Bị từ chối', color: '#F6465D', bgColor: '#FEF2F2', icon: 'alert-circle' as const };
        if (sf.withdrawnByClient) return { text: 'Đã hủy', color: '#9CA3AF', bgColor: '#F9FAFB', icon: 'close-circle' as const };
    }

    // 3. Fallback cho trạng thái cũ
    const status = String(loan.status || '').toLowerCase();
    if (status === 'clean' || status === 'closed') return { text: 'Đã tất toán', color: '#0ECB81', bgColor: '#F0FDF4', icon: 'check-circle' as const };
    if (status === 'success' || status === 'disbursed') {
        if (waitingForBorrowerSignature) return pendingSignatureStatus();
        return activeStatus();
    }
    if (status === 'waiting' || status === 'pending') return { text: 'Chờ duyệt', color: '#F59E0B', bgColor: '#FFFBEB', icon: 'clock-outline' as const };
    if (status === 'approved') {
        if (isFullMatch) return borrowerSigned ? pendingDisbursementStatus() : pendingSignatureStatus();
        return { text: 'Đang gọi vốn', color: '#8B5CF6', bgColor: '#F5F3FF', icon: 'account-group' as const };
    }
    
    return { text: loan.status || 'N/A', color: '#6B7280', bgColor: '#F9FAFB', icon: 'help-circle' as const };
};

/**
 * Checker cho khoản vay đang hoạt động
 */
export const isActiveLoan = (loan: LoanHistoryItem): boolean => {
    const s = getStatusInfo(loan);
    return s.text === 'Đang vay' || s.text.includes('Quá hạn');
};

/**
 * Checker cho khoản vay đang xử lý
 */
export const isPendingLoan = (loan: LoanHistoryItem): boolean => {
    const s = getStatusInfo(loan);
    return ['Chờ duyệt', 'Chờ ký', 'Chờ giải ngân', 'Đang gọi vốn'].includes(s.text);
};
