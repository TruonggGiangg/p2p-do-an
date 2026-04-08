import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../../contexts/AuthContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useConfirmModal } from '../../../components/common/ConfirmModal';
import {
    BinanceHeader,
    RoleBadges,
    CommonButton,
    FintechPullToRefresh,
    FintechScreenSkeleton,
} from '../../../components';
import { SmartOTPSection, TwoFactorSection, PinSection } from '../components';
import { getUserDisplayName, getUserInitials, getUserEmail, getUserPhone } from '../../../shared/utils/user.utils';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { authAPI } from '../../auth/api/auth.api';
import { ActivityIndicator } from 'react-native-paper';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCORE_MIN = 150;
const SCORE_MAX = 750;

const FACTOR_META = [
    { key: 'paymentHistory', label: 'Lịch sử thanh toán', icon: 'calendar-check', color: '#18A058' },
    { key: 'debtLevel', label: 'Mức dư nợ', icon: 'credit-card-outline', color: '#3B82F6' },
    { key: 'creditAge', label: 'Thời gian tín dụng', icon: 'clock-outline', color: '#8B5CF6' },
    { key: 'creditMix', label: 'Loại tín dụng', icon: 'layers-outline', color: '#F59E0B' },
    { key: 'newCredit', label: 'Tín dụng mới', icon: 'star-four-points-outline', color: '#EC4899' },
];

const creditScoreBand = (score: number, c: any) => {
    if (score >= 680) return { label: 'Rất tốt', color: c.success, icon: 'shield-check' as const };
    if (score >= 570) return { label: 'Tốt', color: c.primary, icon: 'shield-half-full' as const };
    if (score >= 431) return { label: 'Trung bình', color: c.warning, icon: 'shield-alert' as const };
    if (score >= 322) return { label: 'Thấp', color: '#F2994A', icon: 'shield-alert-outline' as const };
    return { label: 'Rất thấp', color: c.error, icon: 'shield-off' as const };
};

const formatHistoryReason = (reason?: string) => {
    switch (reason) {
        case 'initial_account_creation': return 'Khởi tạo tài khoản';
        case 'loan_repayment': return 'Trả nợ đúng hạn';
        case 'late_payment': return 'Chậm thanh toán';
        case 'manual_adjustment': return 'Điều chỉnh thủ công';
        case 'system_recalculation': return 'Hệ thống tính lại';
        default: return 'Cập nhật điểm';
    }
};

const formatDateTime = (value?: string) => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return `${date.toLocaleDateString('vi-VN')} ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
};

export default function ProfileScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { user, logout, refreshUser } = useAuth();
    const modal = useConfirmModal();
    const { theme } = useTheme();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [recalculating, setRecalculating] = useState(false);

    useEffect(() => {
        const init = async () => {
            await new Promise((resolve) => setTimeout(resolve, 1700));
            setLoading(false);
        };
        init();
    }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([
                new Promise((resolve) => setTimeout(resolve, 1700)),
                refreshUser ? refreshUser() : Promise.resolve(),
            ]);
        } catch (error) {
            console.error('Failed to refresh profile:', error);
        } finally {
            setRefreshing(false);
        }
    }, [refreshUser]);

    const handleRecalculate = useCallback(async () => {
        if (recalculating) return;
        setRecalculating(true);
        try {
            await authAPI.recalculateCreditScore();
            if (refreshUser) await refreshUser();
        } catch (error: any) {
            modal.error('Lỗi', 'Không thể tính lại điểm tín dụng: ' + error.message);
        } finally {
            setRecalculating(false);
        }
    }, [recalculating, refreshUser]);


    const displayName = getUserDisplayName(user);
    const initials = getUserInitials(user);
    const email = getUserEmail(user);
    const phone = getUserPhone(user);
    const uid = user?._id?.toString().slice(-8).toUpperCase() || 'P2P-8888';
    const creditScore = user?.creditScore;
    const creditHistory = user?.creditScoreHistory || [];
    const scoreValue = typeof creditScore?.score === 'number' ? creditScore.score : 570;
    const scoreRatio = Math.max(0, Math.min(1, (scoreValue - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)));
    const c = theme.colors;
    const isDark = theme.mode === 'dark';
    const band = creditScoreBand(scoreValue, c);

    const getFactorColor = (val: number) => {
        if (val >= 80) return '#22C55E';
        if (val >= 60) return '#84CC16';
        if (val >= 40) return '#F59E0B';
        if (val >= 20) return '#F97316';
        return '#EF4444';
    };

    const renderFactorBar = (meta: typeof FACTOR_META[0], value: number) => {
        const pColor = getFactorColor(value);
        let weight = '10%';
        if (meta.key === 'paymentHistory') weight = '35%';
        else if (meta.key === 'debtLevel') weight = '30%';
        else if (meta.key === 'creditAge') weight = '15%';

        return (
            <View key={meta.key} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <MaterialCommunityIcons name={meta.icon as any} size={16} color={meta.color} />
                        <Text style={{ fontSize: 13, color: c.textSecondary, fontFamily: 'Poppins_600SemiBold' }}>
                            {meta.label}
                        </Text>
                        <Text style={{ fontSize: 11, color: c.textMuted }}>({weight})</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: pColor }}>
                        {Math.round(value)}
                    </Text>
                </View>
                <View style={{ height: 6, backgroundColor: isDark ? c.border + '50' : '#F1F5F9', borderRadius: 3 }}>
                    <View style={{ height: 6, width: `${Math.max(Math.min(value, 100), 2)}%`, backgroundColor: pColor, borderRadius: 3 }} />
                </View>
            </View>
        );
    };

    // ── Setting Item Component ──
    const SettingItem = ({ icon, title, subtitle, onPress, rightElement, color }: any) => (
        <TouchableOpacity
            style={styles.settingItem}
            onPress={onPress}
            disabled={!onPress}
            activeOpacity={0.7}
        >
            <View style={[styles.settingIconWrap, { backgroundColor: (color || c.primary) + '15' }]}>
                <MaterialCommunityIcons name={icon} size={20} color={color || c.primary} />
            </View>
            <View style={styles.settingContent}>
                <Text style={[styles.settingTitle, { color: c.textPrimary }]}>{title}</Text>
                {subtitle && <Text style={[styles.settingSubtitle, { color: c.textMuted }]}>{subtitle}</Text>}
            </View>
            {rightElement || <MaterialCommunityIcons name="chevron-right" size={18} color={c.textDim} />}
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader mode="standard" title="Tài khoản" showBack={true} />

            <FintechPullToRefresh
                refreshing={refreshing}
                onRefresh={onRefresh}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                primaryColor={c.primary}
                glowColor={c.primaryLight}
                topOffset={Platform.OS === 'ios' ? -15 : 0}
            >
                {loading && !refreshing ? (
                    <View style={styles.loadingContainer}>
                        <FintechScreenSkeleton variant="profile" />
                    </View>
                ) : (
                    <>
                        {/* ═══ PROFILE HERO ═══ */}
                        <View style={styles.heroSection}>
                            <LinearGradient
                                colors={isDark ? ['#14342B', '#1A3B34', '#0B1A14'] : ['#14342B', '#1E4D3F', '#245649']}
                                style={styles.heroGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                {/* Decorative blobs */}
                                <View style={styles.heroBlob1} />
                                <View style={styles.heroBlob2} />

                                <View style={styles.heroContent}>
                                    {/* Avatar */}
                                    <View style={styles.avatarOuter}>
                                        <View style={styles.avatar}>
                                            <Text style={styles.avatarText}>{initials}</Text>
                                        </View>
                                        <View style={[styles.verifiedBadge, { backgroundColor: c.success }]}>
                                            <MaterialCommunityIcons name="check-decagram" size={14} color="#fff" />
                                        </View>
                                    </View>

                                    {/* User Info */}
                                    <View style={styles.heroInfo}>
                                        <View style={styles.nameRow}>
                                            <Text style={styles.heroName} numberOfLines={1}>{displayName}</Text>
                                            <View style={styles.vipBadge}>
                                                <MaterialCommunityIcons name="crown" size={10} color="#14342B" />
                                                <Text style={styles.vipText}>VIP</Text>
                                            </View>
                                        </View>
                                        <Text style={styles.heroUid}>UID: {uid}</Text>
                                        {(email || phone) && (
                                            <Text style={styles.heroContact} numberOfLines={1}>
                                                {email || phone}
                                            </Text>
                                        )}
                                    </View>
                                </View>

                                {/* Roles */}
                                <View style={styles.heroRoles}>
                                    <RoleBadges roles={user?.roles || []} />
                                </View>
                            </LinearGradient>
                        </View>

                        {/* ═══ CREDIT SCORE — Chỉ hiển thị cho người vay (borrower) ═══ */}
                        {user?.roles?.includes("borrower") && (
                            <View style={styles.creditSection}>
                                <View style={styles.creditHeader}>
                                    <Text style={[styles.sectionLabel, { color: c.textMuted }]}>ĐIỂM TÍN DỤNG</Text>
                                    <TouchableOpacity style={styles.creditLink} onPress={() => navigation.navigate('CreditScoreDetail')}>
                                        <Text style={[styles.creditLinkText, { color: c.textPrimary }]}>Chi tiết</Text>
                                        <MaterialCommunityIcons name="chevron-right" size={16} color={c.textMuted} />
                                    </TouchableOpacity>
                                </View>

                                <View style={[styles.creditCard, {
                                    backgroundColor: isDark ? c.surface : '#FFFFFF',
                                    borderColor: c.border,
                                    borderWidth: 1,
                                    shadowColor: isDark ? '#000' : '#14342B',
                                    shadowOffset: { width: 0, height: 8 },
                                    shadowOpacity: isDark ? 0.3 : 0.04,
                                    shadowRadius: 20,
                                    elevation: isDark ? 6 : 3,
                                }]}>
                                    {/* Component Header */}
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Text style={[styles.creditScoreValue, { color: c.textPrimary }]}>{scoreValue}</Text>
                                                {recalculating ? (
                                                    <ActivityIndicator size="small" color={c.primary} style={{ marginLeft: 4 }} />
                                                ) : (
                                                    <TouchableOpacity
                                                        style={{ padding: 4, backgroundColor: c.primary + '15', borderRadius: 8 }}
                                                        onPress={handleRecalculate}
                                                    >
                                                        <MaterialCommunityIcons name="refresh" size={18} color={c.primary} />
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                            <Text style={[{ color: c.textMuted, fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: -4 }]}>
                                                Cập nhật: {formatDateTime(creditScore?.lastUpdated)}
                                            </Text>
                                        </View>
                                        <View style={[styles.creditBadge, { backgroundColor: band.color + '15', borderColor: band.color + '30', borderWidth: 1 }]}>
                                            <Text style={[styles.creditBadgeText, { color: band.color }]}>{band.label}</Text>
                                        </View>
                                    </View>

                                    {/* Segmented Progress bar */}
                                    <View style={{ marginTop: 24, marginBottom: 8 }}>
                                        <View style={{ width: '100%', height: 16, position: 'relative' }}>
                                            {!recalculating && (
                                                <View style={{ position: 'absolute', bottom: 0, left: `${scoreRatio * 100}%`, marginLeft: -12, zIndex: 10 }}>
                                                    <MaterialCommunityIcons name="menu-down" size={24} color={isDark ? '#FFFFFF' : '#0F172A'} />
                                                </View>
                                            )}
                                        </View>
                                        <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                                            <View style={{ backgroundColor: '#EF4444', flex: 1.72 }} />
                                            <View style={{ backgroundColor: '#F97316', flex: 1.09 }} />
                                            <View style={{ backgroundColor: '#F59E0B', flex: 1.39 }} />
                                            <View style={{ backgroundColor: '#84CC16', flex: 1.10 }} />
                                            <View style={{ backgroundColor: '#22C55E', flex: 0.70 }} />
                                        </View>
                                        <View style={{ height: 16, marginTop: 4, width: '100%', position: 'relative' }}>
                                            <Text style={{ position: 'absolute', left: '0%', fontSize: 10, color: c.textMuted, fontFamily: 'Poppins_400Regular' }}>150</Text>
                                            <Text style={{ position: 'absolute', left: '28.6%', transform: [{ translateX: -8 }], fontSize: 10, color: c.textMuted, fontFamily: 'Poppins_400Regular' }}>322</Text>
                                            <Text style={{ position: 'absolute', left: '46.8%', transform: [{ translateX: -8 }], fontSize: 10, color: c.textMuted, fontFamily: 'Poppins_400Regular' }}>431</Text>
                                            <Text style={{ position: 'absolute', left: '70%', transform: [{ translateX: -8 }], fontSize: 10, color: c.textMuted, fontFamily: 'Poppins_400Regular' }}>570</Text>
                                            <Text style={{ position: 'absolute', left: '88.3%', transform: [{ translateX: -8 }], fontSize: 10, color: c.textMuted, fontFamily: 'Poppins_400Regular' }}>680</Text>
                                            <Text style={{ position: 'absolute', right: '0%', fontSize: 10, color: c.textMuted, fontFamily: 'Poppins_400Regular' }}>750</Text>
                                        </View>
                                    </View>

                                    {/* 5-Factor Breakdown */}
                                    <View style={{ marginTop: 24, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border + '90' }}>
                                        <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: c.textPrimary, marginBottom: 16 }}>
                                            Phân tích yếu tố tín dụng
                                        </Text>
                                        {creditScore?.factors ? (
                                            <View>
                                                {FACTOR_META.map(m => renderFactorBar(m, (creditScore.factors as any)[m.key] ?? 0))}
                                            </View>
                                        ) : (
                                            <Text style={{ color: c.textMuted, fontSize: 12, fontStyle: 'italic', textAlign: 'center', marginVertical: 10 }}>
                                                Chưa có dữ liệu phân tích chi tiết.
                                            </Text>
                                        )}
                                    </View>
                                </View>

                                {/* Credit History */}
                                {creditHistory.length > 0 && (
                                    <View style={[styles.historyCard, {
                                        backgroundColor: isDark ? c.surface : '#FFFFFF',
                                        borderColor: c.border,
                                        borderWidth: 1,
                                        shadowColor: isDark ? '#000' : '#14342B',
                                        shadowOffset: { width: 0, height: 6 },
                                        shadowOpacity: isDark ? 0.2 : 0.03,
                                        shadowRadius: 15,
                                        elevation: isDark ? 4 : 2,
                                    }]}>
                                        <View style={styles.historyHeaderRow}>
                                            <Text style={[styles.historyTitle, { color: c.textPrimary }]}>Lịch sử điểm gần đây</Text>
                                            <View style={[styles.historyCountBadge, { backgroundColor: c.border + '30' }]}>
                                                <Text style={[styles.historyCount, { color: c.textMuted }]}>{creditHistory.length} thay đổi</Text>
                                            </View>
                                        </View>

                                        <View style={styles.historyList}>
                                            {creditHistory.slice(0, 5).map((item: any, index: number) => {
                                                const change = Number(item?.changeAmount || 0);
                                                const isUp = change > 0;
                                                const isDown = change < 0;
                                                const changeColor = isUp ? '#0ECB81' : isDown ? '#F6465D' : c.textMuted;
                                                return (
                                                    <View key={item?._id || `${index}`}
                                                        style={[styles.historyItem, { borderBottomColor: c.border + '40' },
                                                        index === Math.min(creditHistory.length, 5) - 1 && { borderBottomWidth: 0 },
                                                        ]}>
                                                        <View style={[styles.historyIconWrap, { backgroundColor: changeColor + '15' }]}>
                                                            <MaterialCommunityIcons
                                                                name={isUp ? 'trending-up' : isDown ? 'trending-down' : 'circle-small'}
                                                                size={18}
                                                                color={changeColor}
                                                            />
                                                        </View>
                                                        <View style={styles.historyLeft}>
                                                            <Text style={[styles.historyReason, { color: c.textPrimary }]} numberOfLines={1}>
                                                                {formatHistoryReason(item?.reason)}
                                                            </Text>
                                                            <Text style={[styles.historyDate, { color: c.textMuted }]}>
                                                                {formatDateTime(item?.createdAt)}
                                                            </Text>
                                                        </View>
                                                        <View style={styles.historyRight}>
                                                            <Text style={[styles.historyAfter, { color: c.textPrimary }]}>{item?.afterScore ?? '--'}</Text>
                                                            <Text style={[styles.historyDelta, { color: changeColor }]}>
                                                                {isUp ? `+${change}` : `${change}`}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* ═══ SECURITY SETTINGS ═══ */}
                        <View style={styles.menuSection}>
                            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>BẢO MẬT</Text>
                            <View style={[styles.menuCard, {
                                backgroundColor: isDark ? c.backgroundSecondary : '#FFFFFF',
                                ...Platform.select({
                                    ios: { shadowColor: '#14342B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.15 : 0.04, shadowRadius: 10 },
                                    android: { elevation: isDark ? 3 : 2 },
                                }),
                            }]}>
                                <SettingItem
                                    icon="shield-check-outline"
                                    title="Xác minh danh tính"
                                    subtitle={
                                        (user as any)?.kycStatus === 'VERIFIED' ? 'Đã xác minh (eKYC)'
                                            : (user as any)?.kycStatus === 'PENDING' ? 'Đang chờ phê duyệt'
                                                : 'Chưa xác minh'
                                    }
                                    onPress={() => {
                                        const status = (user as any)?.kycStatus;
                                        if (status === 'PENDING') { modal.alert('Đang chờ phê duyệt', 'Hồ sơ xác minh danh tính của bạn đang được xử lý.'); return; }
                                        if (status === 'VERIFIED') { modal.success('Đã xác minh', 'Tài khoản của bạn đã được xác minh eKYC.'); return; }
                                        (navigation as any).getParent()?.navigate('KYCIntro');
                                    }}
                                    color={(user as any)?.kycStatus === 'VERIFIED' ? c.success : (user as any)?.kycStatus === 'PENDING' ? c.primary : c.warning}
                                />
                                <SmartOTPSection />
                                <TwoFactorSection />
                                <PinSection />
                            </View>
                        </View>

                        {/* ═══ LOGOUT ═══ */}
                        <View style={styles.logoutWrapper}>
                            <CommonButton
                                title="Đăng xuất"
                                onPress={logout}
                                variant="outline"
                                style={{ ...styles.logoutBtn, borderColor: c.error + '40' }}
                                textStyle={{ color: c.error }}
                                icon="logout"
                            />
                        </View>

                        <Text style={[styles.versionText, { color: c.textDim }]}>Phiên bản 2.85.0</Text>
                    </>
                )}
            </FintechPullToRefresh>
        </View>
    );
}

// ═══════════════════════════════════════════════
const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingBottom: 100, flexGrow: 1 },
    loadingContainer: { marginTop: Platform.OS === 'ios' ? 24 : 36 },

    // ── Hero Section ──
    heroSection: { marginHorizontal: 16, marginTop: 12, marginBottom: 4 },
    heroGradient: {
        borderRadius: 24, padding: 24, overflow: 'hidden', position: 'relative',
    },
    heroBlob1: {
        position: 'absolute', width: 200, height: 200, borderRadius: 100,
        backgroundColor: 'rgba(205, 234, 45, 0.08)', top: -80, right: -60,
    },
    heroBlob2: {
        position: 'absolute', width: 150, height: 150, borderRadius: 75,
        backgroundColor: 'rgba(205, 234, 45, 0.05)', bottom: -50, left: -30,
    },
    heroContent: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
    avatarOuter: { position: 'relative' },
    avatar: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: 'rgba(205, 234, 45, 0.15)',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: 'rgba(205, 234, 45, 0.3)',
    },
    avatarText: {
        fontSize: 26, fontWeight: '800', fontFamily: 'Poppins_700Bold', color: '#CDEA2D',
    },
    verifiedBadge: {
        position: 'absolute', bottom: -2, right: -2, width: 22, height: 22,
        borderRadius: 11, justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: '#14342B',
    },
    heroInfo: { marginLeft: 18, flex: 1, minWidth: 0 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
    heroName: {
        fontSize: 20, fontWeight: '800', fontFamily: 'Poppins_700Bold', color: '#FFFFFF',
    },
    vipBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: '#CDEA2D', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    },
    vipText: { fontSize: 10, fontWeight: '800', color: '#14342B', fontFamily: 'Poppins_700Bold' },
    heroUid: { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontFamily: 'Poppins_400Regular', marginBottom: 2 },
    heroContact: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'Poppins_400Regular' },
    heroRoles: { marginTop: 16, zIndex: 1 },

    // ── Section Label ──
    sectionLabel: {
        fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 12,
        fontFamily: 'Poppins_600SemiBold',
    },

    // ── Credit Score ──
    creditSection: { paddingHorizontal: 16, paddingTop: 20 },
    creditHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
    },
    creditLink: { flexDirection: 'row', alignItems: 'center' },
    creditLinkText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginRight: 2 },
    creditCard: { borderRadius: 24, padding: 22, marginBottom: 16 },
    creditTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    creditScoreWrap: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    creditIconCircle: {
        width: 52, height: 52, borderRadius: 18, justifyContent: 'center', alignItems: 'center',
    },
    creditScoreLabel: { fontSize: 11, fontFamily: 'Poppins_500Medium', marginBottom: 0, opacity: 0.8 },
    creditScoreValue: { fontSize: 38, lineHeight: 42, fontFamily: 'Poppins_700Bold', letterSpacing: -1 },
    creditBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    creditBadgeText: { fontSize: 13, fontFamily: 'Poppins_700Bold' },

    progressTrack: { height: 10, borderRadius: 5, marginTop: 24, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 5 },

    creditStats: {
        flexDirection: 'row', marginTop: 20, alignItems: 'center', gap: 8,
    },
    creditStatPill: {
        flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16,
    },
    creditStatValue: { fontSize: 16, fontFamily: 'Poppins_700Bold', marginBottom: 2 },
    creditStatLabel: { fontSize: 11, fontFamily: 'Poppins_400Regular' },

    // ── History ──
    historyCard: { borderRadius: 24, padding: 20, marginTop: 4 },
    historyHeaderRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
    },
    historyTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
    historyCountBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    historyCount: { fontSize: 11, fontFamily: 'Poppins_500Medium' },
    historyList: { marginTop: 8 },
    historyItem: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    historyIconWrap: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    historyLeft: { flex: 1, paddingRight: 8 },
    historyReason: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
    historyDate: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 4 },
    historyRight: { alignItems: 'flex-end' },
    historyAfter: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
    historyDelta: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginTop: 2 },

    // ── Settings ──
    menuSection: { paddingHorizontal: 16, paddingTop: 24 },
    menuCard: { borderRadius: 20, overflow: 'hidden' },
    settingItem: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 15, paddingHorizontal: 18,
    },
    settingIconWrap: {
        width: 40, height: 40, borderRadius: 12,
        justifyContent: 'center', alignItems: 'center', marginRight: 14,
    },
    settingContent: { flex: 1, minWidth: 0 },
    settingTitle: { fontSize: 15, fontWeight: '500', fontFamily: 'Poppins_500Medium' },
    settingSubtitle: { fontSize: 12, marginTop: 2, fontFamily: 'Poppins_400Regular' },

    // ── Logout ──
    logoutWrapper: { paddingHorizontal: 16, marginTop: 20, marginBottom: 8 },
    logoutBtn: { height: 52, backgroundColor: 'transparent', borderWidth: 1 },
    versionText: {
        textAlign: 'center', marginTop: 16, marginBottom: 24,
        fontSize: 11, fontFamily: 'Poppins_400Regular', opacity: 0.6,
    },
});
