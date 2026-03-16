/**
 * Home screen constants — Finesse Wallet Style
 * Clean icon-based design with dark teal + lime green palette
 */

import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type ShortcutItem = {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    label: string;
    nav: string;
    isParent: boolean;
};

/** Quick Actions (Balance card bottom) */
export const QUICK_ACTIONS: ShortcutItem[] = [
    { icon: 'cash-plus', label: 'Nạp tiền', nav: 'Wallets', isParent: true },
    { icon: 'swap-horizontal', label: 'Chuyển tiền', nav: 'Transfer', isParent: true },
    { icon: 'qrcode-scan', label: 'My QR', nav: 'MyQR', isParent: false },
    { icon: 'history', label: 'Lịch sử', nav: 'LoanHistory', isParent: true },
];

/** Main Services Grid */
export const SERVICES_GRID: ShortcutItem[] = [
    { icon: 'wallet-outline', label: 'Ví P2P', nav: 'Wallets', isParent: true },
    { icon: 'hand-coin-outline', label: 'Vay P2P', nav: 'Loan', isParent: false },
    { icon: 'credit-card-clock-outline', label: 'Trả góp BNPL', nav: 'BNPL', isParent: false },
    { icon: 'file-document-check-outline', label: 'Hợp đồng', nav: 'LoanContractList', isParent: true },
    { icon: 'shield-check-outline', label: 'Xác thực KYC', nav: 'KYCIntro', isParent: true },
    { icon: 'bell-outline', label: 'Thông báo', nav: 'Notifications', isParent: true },
];

/** Utility / Settings Grid */
export const UTILITIES_GRID: ShortcutItem[] = [
    { icon: 'account-circle-outline', label: 'Tài khoản', nav: 'Profile', isParent: false },
    { icon: 'translate', label: 'Ngôn ngữ', nav: 'Profile', isParent: false },
    { icon: 'help-circle-outline', label: 'Trợ giúp', nav: 'Profile', isParent: false },
    { icon: 'headset', label: 'Chat hỗ trợ', nav: 'Profile', isParent: false },
];

/** MoMo-style unified grid (kept for backward compat) */
export const MOMO_GRID: ShortcutItem[] = [
    { icon: 'cash-plus', label: 'Nạp tiền', nav: 'Wallets', isParent: true },
    { icon: 'swap-horizontal', label: 'Chuyển tiền', nav: 'Transfer', isParent: true },
    { icon: 'wallet-outline', label: 'Ví P2P', nav: 'Wallets', isParent: true },
    { icon: 'qrcode-scan', label: 'QR của tôi', nav: 'QR', isParent: false },
    { icon: 'hand-coin-outline', label: 'Vay P2P', nav: 'Loan', isParent: false },
    { icon: 'credit-card-clock-outline', label: 'Trả góp BNPL', nav: 'BNPL', isParent: false },
    { icon: 'history', label: 'Lịch sử', nav: 'LoanHistory', isParent: true },
    { icon: 'file-document-check-outline', label: 'Hợp đồng', nav: 'LoanContractList', isParent: true },
];

/** Kept for backward compat */
export const WALLET_GROUP = QUICK_ACTIONS.filter(i => ['Wallets', 'Transfer', 'QR'].includes(i.nav));
export const LOAN_GROUP: ShortcutItem[] = [
    { icon: 'hand-coin-outline', label: 'Vay P2P', nav: 'Loan', isParent: false },
    { icon: 'credit-card-clock-outline', label: 'Trả góp BNPL', nav: 'BNPL', isParent: false },
];
export const HISTORY_GROUP: ShortcutItem[] = [
    { icon: 'history', label: 'Lịch sử vay', nav: 'LoanHistory', isParent: true },
    { icon: 'file-document-check-outline', label: 'Hợp đồng', nav: 'LoanContractList', isParent: true },
    { icon: 'bell-outline', label: 'Thông báo', nav: 'Notifications', isParent: true },
];
export const SECURITY_GROUP: ShortcutItem[] = [
    { icon: 'shield-check-outline', label: 'Xác thực KYC', nav: 'KYCIntro', isParent: true },
];
export const SETTINGS_GROUP: ShortcutItem[] = UTILITIES_GRID;

export interface BannerItem {
    id: string;
    title: string;
    subtitle: string;
    gradient: [string, string, ...string[]];
    accent: string;
    imageUrl?: string;
    actionNav: string;
}

/** Banner promotion — teal + lime style */
export const BANNERS: BannerItem[] = [
    {
        id: '1',
        title: 'Vay P2P lãi suất ưu đãi',
        subtitle: 'Lãi suất từ 0.8%/tháng, giải ngân nhanh 24/7',
        gradient: ['#14342B', '#1A3B34', '#0D2820'],
        accent: '#CDEA2D',
        imageUrl: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800&q=80',
        actionNav: 'Loan',
    },
    {
        id: '2',
        title: 'Trả góp BNPL 0% lãi',
        subtitle: 'Mua trước trả sau, chia nhỏ thanh toán',
        gradient: ['#0D2820', '#14342B', '#1A3B34'],
        accent: '#0ECB81',
        imageUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80',
        actionNav: 'BNPL',
    },
    {
        id: '3',
        title: 'Bảo mật đa lớp',
        subtitle: 'Smart OTP, 2FA, mã PIN bảo vệ tài khoản',
        gradient: ['#1A3B34', '#245649', '#14342B'],
        accent: '#CDEA2D',
        imageUrl: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&q=80',
        actionNav: 'Profile',
    },
];
