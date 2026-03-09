/**
 * Home screen constants - Banking/Fintech style
 * Phân nhóm chức năng theo UI app Banking & Ví điện tử
 */

import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type ShortcutItem = {
    icon?: keyof typeof MaterialCommunityIcons.glyphMap;
    image?: string; // For prominent items
    label: string;
    nav: string;
    isParent: boolean;
};

/** Nhóm 1: Ví & Thanh toán */
export const WALLET_GROUP: ShortcutItem[] = [
    { icon: 'wallet-outline', label: 'Ví', nav: 'Wallets', isParent: true },
    { icon: 'send-outline', label: 'Chuyển tiền', nav: 'Transfer', isParent: true },
    { icon: 'qrcode-scan', label: 'Quét QR', nav: 'QR', isParent: false },
];

/** Nhóm 2: Vay & Tín dụng */
export const LOAN_GROUP: ShortcutItem[] = [
    { icon: 'hand-coin-outline', label: 'Vay P2P', nav: 'Loan', isParent: false },
    { icon: 'card-account-details-outline', label: 'Trả góp BNPL', nav: 'BNPL', isParent: false },
];

/** Nhóm 3: Lịch sử & Hợp đồng */
export const HISTORY_GROUP: ShortcutItem[] = [
    { icon: 'history', label: 'Lịch sử vay', nav: 'LoanHistory', isParent: true },
    { icon: 'file-document-outline', label: 'Hợp đồng', nav: 'LoanContractList', isParent: true },
    { icon: 'bell-outline', label: 'Thông báo', nav: 'Notifications', isParent: true },
];

/** Nhóm 4: Bảo mật & Xác thực */
export const SECURITY_GROUP: ShortcutItem[] = [
    { icon: 'check-decagram-outline', label: 'Xác thực KYC', nav: 'KYCIntro', isParent: true },
];

/** Nhóm 5: Cài đặt & Hỗ trợ - chuyển từ Profile sang Home */
export const SETTINGS_GROUP: ShortcutItem[] = [
    { icon: 'account-circle-outline', label: 'Tài khoản', nav: 'Profile', isParent: false },
    { icon: 'earth', label: 'Ngôn ngữ', nav: 'Profile', isParent: false },
    { icon: 'help-circle-outline', label: 'Trợ giúp', nav: 'Profile', isParent: false },
    { icon: 'chat-processing-outline', label: 'Chat hỗ trợ', nav: 'Profile', isParent: false },
];

/** MoMo-style unified grid */
export const MOMO_GRID: ShortcutItem[] = [
    // Highlight items with images (demonstration URLs)
    { image: 'https://cdn-icons-png.flaticon.com/512/3135/3135706.png', label: 'Nạp tiền', nav: 'Wallets', isParent: true },
    { image: 'https://cdn-icons-png.flaticon.com/512/3135/3135679.png', label: 'Chuyển tiền', nav: 'Transfer', isParent: true },
    { image: 'https://cdn-icons-png.flaticon.com/512/3135/3135688.png', label: 'Ví P2P', nav: 'Wallets', isParent: true },
    { icon: 'qrcode-scan', label: 'QR của tôi', nav: 'QR', isParent: false },
    { icon: 'hand-coin-outline', label: 'Vay P2P', nav: 'Loan', isParent: false },
    { icon: 'card-account-details-outline', label: 'Trả góp BNPL', nav: 'BNPL', isParent: false },
    { icon: 'history', label: 'Lịch sử', nav: 'LoanHistory', isParent: true },
    { icon: 'file-document-outline', label: 'Hợp đồng', nav: 'LoanContractList', isParent: true },
];

export interface BannerItem {
    id: string;
    title: string;
    subtitle: string;
    gradient: [string, string, ...string[]];
    accent: string;
    imageUrl?: string;
    /** Màn hình điều hướng khi click banner */
    actionNav: string;
}

/** Banner promotion - Banking/Fintech style, clickable */
export const BANNERS: BannerItem[] = [
    {
        id: '1',
        title: 'Vay P2P lãi suất ưu đãi',
        subtitle: 'Lãi suất từ 0.8%/tháng, giải ngân nhanh 24/7',
        gradient: ['#1a1f2e', '#2d3548', '#1a1f2e'],
        accent: '#F0B90B',
        imageUrl: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800&q=80',
        actionNav: 'Loan',
    },
    {
        id: '2',
        title: 'Trả góp BNPL 0% lãi',
        subtitle: 'Mua trước trả sau, chia nhỏ thanh toán',
        gradient: ['#0d1b2a', '#1b263b', '#0d1b2a'],
        accent: '#0ECB81',
        imageUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80',
        actionNav: 'BNPL',
    },
    {
        id: '3',
        title: 'Bảo mật đa lớp',
        subtitle: 'Smart OTP, 2FA, mã PIN bảo vệ tài khoản',
        gradient: ['#1e1e2e', '#2d2d44', '#1e1e2e'],
        accent: '#6366f1',
        imageUrl: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&q=80',
        actionNav: 'Profile',
    },
];
