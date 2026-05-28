/**
 * Home screen constants — Emerald Editorial Design System
 * Groups: Quick Actions, Main Features, Financial Services, Utilities
 */

import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type ShortcutItem = {
    /** Phosphor icon identifier */
    icon: string;
    /** Legacy MaterialCommunityIcons name (fallback) */
    mciIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
    label: string;
    nav: string;
    isParent: boolean;
    /** Accent color for icon tint */
    color?: string;
    /** Short description */
    description?: string;
};

// ═══════════════════════════════════════════════
// 1. QUICK ACTIONS — Top row (Gửi, Nhận, Nạp tiền, Thêm)
// ═══════════════════════════════════════════════
export const QUICK_ACTIONS: ShortcutItem[] = [
    { icon: 'ArrowUpRight',   label: 'Gửi',      nav: 'Transfer',  isParent: true },
    { icon: 'CreditCard',     label: 'BNPL',     nav: 'BNPL',      isParent: false, color: '#F0B90B' },
    { icon: 'CreditCard',     label: 'Ví của tôi', nav: 'Wallets',   isParent: true },
    { icon: 'FileText',       label: 'Hợp đồng điện tử', nav: 'LoanContractList', isParent: true },
];

// ═══════════════════════════════════════════════
// 2. MAIN FEATURES — 4 cards chính (hàng ngang)
// ═══════════════════════════════════════════════
export const MAIN_FEATURES: ShortcutItem[] = [
    { icon: 'ArrowsLeftRight', label: 'Chuyển\ntiền',     nav: 'Transfer',    isParent: true,  color: '#CDEA2D' },
    { icon: 'HandCoins',       label: 'Vay\nvốn',         nav: 'Loan',        isParent: false, color: '#0ECB81' },
    { icon: 'ClockCounterClockwise', label: 'Lịch sử\nvay', nav: 'LoanHistory', isParent: true,  color: '#B8E2FF' },
];

// ═══════════════════════════════════════════════
// 3. FINANCIAL SERVICES — Card list (Ví, Hợp đồng, KYC, Thông báo)
// ═══════════════════════════════════════════════
export const FINANCIAL_SERVICES: ShortcutItem[] = [
    { icon: 'Wallet',      label: 'Ví P2P',        description: 'Quản lý nguồn vốn',    nav: 'Wallets',         isParent: true,  color: '#CDEA2D' },
    { icon: 'FileText',    label: 'Hợp đồng',      description: 'Ký kết số an toàn',     nav: 'LoanContractList', isParent: true, color: '#CDEA2D' },
    { icon: 'ShieldCheck', label: 'Xác thực KYC',   description: 'Định danh sinh trắc',   nav: 'KYCIntro',        isParent: true,  color: '#0ECB81' },
    { icon: 'BellRinging', label: 'Thông báo',      description: 'Biến động số dư',       nav: 'Notifications',   isParent: true,  color: '#F0B90B' },
];

// ═══════════════════════════════════════════════
// 4. UTILITIES — Card list (Tài khoản, Điểm tín dụng, Bảo mật, Chat)
// ═══════════════════════════════════════════════
export const UTILITIES: ShortcutItem[] = [
    { icon: 'UserCircle', label: 'Tài khoản',      description: 'Thông tin cá nhân',      nav: 'Profile',            isParent: false },
    { icon: 'ChartBar',   label: 'Điểm tín dụng',  description: 'Tra cứu điểm uy tín',    nav: 'CreditScoreDetail',  isParent: false },
    { icon: 'LockKey',    label: 'Đổi mã PIN',     description: 'Quản lý mã bảo mật',     nav: 'PinChange',          isParent: false },
    { icon: 'Headset',    label: 'Chat hỗ trợ',    description: 'Liên hệ qua kênh 24/7',  nav: 'Profile',            isParent: false },
];

// ═══════════════════════════════════════════════
// Backward compat aliases
// ═══════════════════════════════════════════════
export const SERVICES_GRID = FINANCIAL_SERVICES;
export const UTILITIES_GRID = UTILITIES;
export const MOMO_GRID = [...MAIN_FEATURES.map(f => ({ ...f, label: f.label.replace('\n', ' ') }))];
export const WALLET_GROUP = QUICK_ACTIONS.filter(i => ['Wallets', 'Transfer', 'QR'].includes(i.nav));
export const LOAN_GROUP = MAIN_FEATURES.filter(i => ['Loan'].includes(i.nav));
export const HISTORY_GROUP: ShortcutItem[] = [
    { icon: 'ClockCounterClockwise', label: 'Lịch sử vay', nav: 'LoanHistory',      isParent: true },
    { icon: 'FileText',              label: 'Hợp đồng',    nav: 'LoanContractList', isParent: true },
    { icon: 'BellRinging',           label: 'Thông báo',    nav: 'Notifications',    isParent: true },
];
export const SECURITY_GROUP: ShortcutItem[] = [
    { icon: 'ShieldCheck', label: 'Xác thực KYC', nav: 'KYCIntro', isParent: true },
];
export const SETTINGS_GROUP = UTILITIES;

export interface BannerItem {
    id: string;
    title: string;
    subtitle: string;
    gradient: [string, string, ...string[]];
    accent: string;
    imageUrl?: string;
    actionNav: string;
}

export const BANNERS: BannerItem[] = [
    {
        id: '1',
        title: 'Vay P2P lãi suất ưu đãi',
        subtitle: 'Lãi suất từ 0.8%/tháng, giải ngân nhanh 24/7',
        gradient: ['#14342B', '#1A3B34', '#0D2820'],
        accent: '#CDEA2D',
        actionNav: 'Loan',
    },
    {
        id: '2',
        title: 'Trả góp BNPL linh hoạt',
        subtitle: 'Chọn kỳ hạn 1-12 tháng, lãi suất tính theo tháng',
        gradient: ['#0D2820', '#14342B', '#1A3B34'],
        accent: '#0ECB81',
        actionNav: 'BNPL',
    },
    {
        id: '3',
        title: 'Bảo mật đa lớp',
        subtitle: 'Smart OTP, 2FA, mã PIN bảo vệ tài khoản',
        gradient: ['#1A3B34', '#245649', '#14342B'],
        accent: '#CDEA2D',
        actionNav: 'Profile',
    },
];
