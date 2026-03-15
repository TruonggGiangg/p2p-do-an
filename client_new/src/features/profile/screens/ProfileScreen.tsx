import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../../contexts/AuthContext';
import { useTheme } from '../../../contexts/ThemeContext';
import {
    BinanceHeader,
    RoleBadges,
    CommonCard,
    CommonButton,
    FintechPullToRefresh,
    FintechScreenSkeleton,
} from '../../../components';
import { SmartOTPSection, TwoFactorSection, PinSection } from '../components';
import { getUserDisplayName, getUserInitials, getUserEmail, getUserPhone } from '../../../shared/utils/user.utils';

const SCORE_MIN = 300;
const SCORE_MAX = 850;

const creditScoreBand = (score: number) => {
    if (score >= 800) return { label: 'XUAT SAC', color: '#18A058' };
    if (score >= 740) return { label: 'TOT', color: '#2F80ED' };
    if (score >= 670) return { label: 'KHA', color: '#F2C94C' };
    if (score >= 580) return { label: 'TRUNG BINH', color: '#F2994A' };
    return { label: 'CAN CAI THIEN', color: '#EB5757' };
};

const formatHistoryReason = (reason?: string) => {
    switch (reason) {
        case 'initial_account_creation':
            return 'Khoi tao tai khoan';
        case 'loan_repayment':
            return 'Tra no dung han';
        case 'late_payment':
            return 'Cham thanh toan';
        case 'manual_adjustment':
            return 'Dieu chinh thu cong';
        case 'system_recalculation':
            return 'He thong tinh lai';
        default:
            return 'Cap nhat diem';
    }
};

const formatDateTime = (value?: string) => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return `${date.toLocaleDateString('vi-VN')} ${date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
    })}`;
};

export default function ProfileScreen() {
    const navigation = useNavigation();
    const { user, logout, refreshUser } = useAuth();
    const { theme } = useTheme();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        const init = async () => {
            const minDelay = new Promise((resolve) => setTimeout(resolve, 1700));
            await minDelay;
            setLoading(false);
        };
        init();
    }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        const minDelay = new Promise((resolve) => setTimeout(resolve, 1700));
        try {
            await Promise.all([
                minDelay,
                (async () => {
                    if (refreshUser) await refreshUser();
                })(),
            ]);
        } catch (error) {
            console.error('Failed to refresh profile:', error);
        } finally {
            setRefreshing(false);
        }
    }, [refreshUser]);

    const displayName = getUserDisplayName(user);
    const initials = getUserInitials(user);
    const email = getUserEmail(user);
    const phone = getUserPhone(user);
    const uid = user?._id?.toString().slice(-8).toUpperCase() || 'P2P-8888';
    const creditScore = user?.creditScore;
    const creditHistory = user?.creditScoreHistory || [];
    const scoreValue = typeof creditScore?.score === 'number' ? creditScore.score : 650;
    const scoreRatio = Math.max(0, Math.min(1, (scoreValue - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)));
    const band = creditScoreBand(scoreValue);
    const c = theme.colors;

    const SettingItem = ({
        icon,
        title,
        subtitle,
        onPress,
        rightElement,
        color,
    }: any) => (
        <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: c.border + '40' }]}
            onPress={onPress}
            disabled={!onPress}
            activeOpacity={0.7}
        >
            <View style={[styles.settingIconContainer, { backgroundColor: (color || c.primary) + '18' }]}>
                <MaterialCommunityIcons name={icon} size={22} color={color || c.primary} />
            </View>
            <View style={styles.settingContent}>
                <Text style={[styles.settingTitle, { color: c.textPrimary }]}>{title}</Text>
                {subtitle && (
                    <Text style={[styles.settingSubtitle, { color: c.textMuted }]}>{subtitle}</Text>
                )}
            </View>
            {rightElement || (
                <MaterialCommunityIcons name="chevron-right" size={20} color={c.textDim} />
            )}
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
                        {/* Profile Header - Banking style */}
                        <View style={styles.profileHeader}>
                            <CommonCard style={styles.profileCard}>
                                <View style={styles.profileTop}>
                                    <View style={styles.avatarSection}>
                                        <View
                                            style={[
                                                styles.avatar,
                                                {
                                                    backgroundColor:
                                                        theme.mode === 'dark'
                                                            ? c.backgroundTertiary || '#2b3139'
                                                            : '#FFF9E6',
                                                },
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.avatarText,
                                                    { color: c.primary },
                                                ]}
                                            >
                                                {initials}
                                            </Text>
                                        </View>
                                        <View
                                            style={[
                                                styles.verifiedBadge,
                                                { backgroundColor: c.success },
                                            ]}
                                        >
                                            <MaterialCommunityIcons
                                                name="check-decagram"
                                                size={14}
                                                color="#fff"
                                            />
                                        </View>
                                    </View>
                                    <View style={styles.userInfo}>
                                        <View style={styles.nameRow}>
                                            <Text
                                                style={[styles.userName, { color: c.textPrimary }]}
                                                numberOfLines={1}
                                            >
                                                {displayName}
                                            </Text>
                                            <View
                                                style={[
                                                    styles.levelBadge,
                                                    { backgroundColor: c.primary },
                                                ]}
                                            >
                                                <Text
                                                    style={[styles.levelText, { color: '#000' }]}
                                                >
                                                    VIP 1
                                                </Text>
                                            </View>
                                        </View>
                                        <Text
                                            style={[styles.userUid, { color: c.textSecondary }]}
                                        >
                                            UID: {uid}
                                        </Text>
                                        {(email || phone) && (
                                            <Text
                                                style={[
                                                    styles.userContact,
                                                    { color: c.textMuted },
                                                ]}
                                                numberOfLines={1}
                                            >
                                                {email || phone}
                                            </Text>
                                        )}
                                    </View>
                                </View>
                                <View style={[styles.badgesRow, { borderTopColor: c.border + '40' }]}>
                                    <RoleBadges roles={user?.roles || []} />
                                </View>
                            </CommonCard>
                        </View>

                        <View style={styles.creditSection}>
                            <Text style={[styles.sectionTitle, { color: c.textDim }]}>TIN DUNG</Text>
                            <CommonCard
                                style={[
                                    styles.creditScoreCard,
                                    {
                                        backgroundColor:
                                            theme.mode === 'dark' ? c.backgroundSecondary : '#FFFBF0',
                                    },
                                ]}
                            >
                                <View style={styles.creditTopRow}>
                                    <View>
                                        <Text style={[styles.creditCaption, { color: c.textMuted }]}>Diem tin dung</Text>
                                        <Text style={[styles.creditScoreValue, { color: c.textPrimary }]}>{scoreValue}</Text>
                                    </View>
                                    <View style={[styles.creditBandPill, { backgroundColor: band.color + '22' }]}>
                                        <Text style={[styles.creditBandText, { color: band.color }]}>{band.label}</Text>
                                    </View>
                                </View>

                                <View style={[styles.scoreProgressTrack, { backgroundColor: c.border + '40' }]}>
                                    <View
                                        style={[
                                            styles.scoreProgressFill,
                                            {
                                                width: `${Math.max(scoreRatio * 100, 5)}%`,
                                                backgroundColor: band.color,
                                            },
                                        ]}
                                    />
                                </View>

                                <View style={styles.creditMetaRow}>
                                    <View style={styles.creditMetaItem}>
                                        <Text style={[styles.creditMetaLabel, { color: c.textMuted }]}>Tong khoan vay</Text>
                                        <Text style={[styles.creditMetaValue, { color: c.textPrimary }]}>
                                            {creditScore?.totalLoans ?? 0}
                                        </Text>
                                    </View>
                                    <View style={styles.creditMetaItem}>
                                        <Text style={[styles.creditMetaLabel, { color: c.textMuted }]}>Tra tre han</Text>
                                        <Text style={[styles.creditMetaValue, { color: c.textPrimary }]}>
                                            {creditScore?.latePayments ?? 0}
                                        </Text>
                                    </View>
                                    <View style={styles.creditMetaItem}>
                                        <Text style={[styles.creditMetaLabel, { color: c.textMuted }]}>Cap nhat cuoi</Text>
                                        <Text style={[styles.creditMetaValue, { color: c.textPrimary }]}>
                                            {formatDateTime(creditScore?.lastUpdated)}
                                        </Text>
                                    </View>
                                </View>
                            </CommonCard>

                            <View style={[styles.historyCard, { backgroundColor: c.backgroundSecondary }]}>
                                <View style={styles.historyHeaderRow}>
                                    <Text style={[styles.historyTitle, { color: c.textPrimary }]}>Lich su cap nhat diem</Text>
                                    <Text style={[styles.historyCount, { color: c.textMuted }]}>{creditHistory.length} muc</Text>
                                </View>

                                {creditHistory.length === 0 ? (
                                    <Text style={[styles.historyEmpty, { color: c.textMuted }]}>Chua co lich su cap nhat.</Text>
                                ) : (
                                    creditHistory.slice(0, 6).map((item: any, index: number) => {
                                        const change = Number(item?.changeAmount || 0);
                                        const isUp = change > 0;
                                        const isDown = change < 0;
                                        const changeColor = isUp ? '#18A058' : isDown ? '#EB5757' : c.textMuted;

                                        return (
                                            <View
                                                key={item?._id || `${index}-${item?.createdAt || item?.afterScore || 0}`}
                                                style={[
                                                    styles.historyItem,
                                                    { borderBottomColor: c.border + '35' },
                                                    index === creditHistory.slice(0, 6).length - 1
                                                        ? { borderBottomWidth: 0 }
                                                        : null,
                                                ]}
                                            >
                                                <View style={styles.historyLeft}>
                                                    <Text style={[styles.historyReason, { color: c.textPrimary }]}>
                                                        {formatHistoryReason(item?.reason)}
                                                    </Text>
                                                    <Text style={[styles.historyDate, { color: c.textMuted }]}>
                                                        {formatDateTime(item?.createdAt)}
                                                    </Text>
                                                </View>
                                                <View style={styles.historyRight}>
                                                    <Text style={[styles.historyAfter, { color: c.textPrimary }]}>
                                                        {item?.afterScore ?? '--'}
                                                    </Text>
                                                    <Text style={[styles.historyDelta, { color: changeColor }]}>
                                                        {isUp ? `+${change}` : `${change}`}
                                                    </Text>
                                                </View>
                                            </View>
                                        );
                                    })
                                )}
                            </View>
                        </View>

                        {/* Security - Giao diện, Ngôn ngữ, Hỗ trợ đã chuyển sang Home */}
                        <View style={styles.menuSection}>
                            <Text style={[styles.sectionTitle, { color: c.textDim }]}>
                                BẢO MẬT
                            </Text>
                            <View style={[styles.menuCard, { backgroundColor: c.backgroundSecondary }]}>
                                <SettingItem
                                    icon="shield-check-outline"
                                    title="Xác minh danh tính"
                                    subtitle={
                                        (user as any)?.kycStatus === 'VERIFIED'
                                            ? 'Đã xác minh (eKYC)'
                                            : (user as any)?.kycStatus === 'PENDING'
                                                ? 'Đang chờ phê duyệt'
                                                : 'Chưa xác minh'
                                    }
                                    onPress={() => {
                                        const status = (user as any)?.kycStatus;
                                        if (status === 'PENDING') {
                                            Alert.alert(
                                                'Đang chờ phê duyệt',
                                                'Hồ sơ xác minh danh tính của bạn đang được xử lý.',
                                                [{ text: 'Đã hiểu' }]
                                            );
                                            return;
                                        }
                                        if (status === 'VERIFIED') {
                                            Alert.alert(
                                                'Đã xác minh',
                                                'Tài khoản của bạn đã được xác minh eKYC.'
                                            );
                                            return;
                                        }
                                        (navigation as any).getParent()?.navigate('KYCIntro');
                                    }}
                                    color={
                                        (user as any)?.kycStatus === 'VERIFIED'
                                            ? c.success
                                            : (user as any)?.kycStatus === 'PENDING'
                                                ? c.primary
                                                : c.warning
                                    }
                                />
                                <SmartOTPSection />
                                <TwoFactorSection />
                                <PinSection />
                            </View>
                        </View>

                        {/* Logout - tách biệt, sát bottom nav */}
                        <View style={styles.logoutWrapper}>
                            <CommonButton
                                title="Đăng xuất"
                                onPress={logout}
                                variant="secondary"
                                style={{ ...styles.logoutBtn, borderColor: c.border }}
                                textStyle={{ color: c.error }}
                                icon="logout"
                            />
                        </View>

                        <Text style={[styles.versionText, { color: c.textDim }]}>
                            Phiên bản 2.85.0
                        </Text>
                    </>
                )}
            </FintechPullToRefresh>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingBottom: 100, flexGrow: 1 },
    loadingContainer: {
        marginTop: Platform.OS === 'ios' ? 24 : 36,
    },
    profileHeader: { paddingHorizontal: 16, paddingTop: 16, marginBottom: 4 },
    profileCard: { padding: 22, borderRadius: 18, overflow: 'hidden', elevation: 1 },
    profileTop: { flexDirection: 'row', alignItems: 'center' },
    avatarSection: { position: 'relative' },
    avatar: {
        width: 68,
        height: 68,
        borderRadius: 34,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    avatarText: { fontSize: 24, fontWeight: '700', fontFamily: 'Poppins_700Bold' },
    verifiedBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#111318',
    },
    userInfo: { marginLeft: 16, flex: 1, minWidth: 0 },
    nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' },
    userName: {
        fontSize: 18,
        fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
        marginRight: 8,
    },
    levelBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    levelText: { fontSize: 10, fontWeight: '700' },
    userUid: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 2 },
    userContact: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
    badgesRow: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    creditSection: { paddingHorizontal: 16, paddingTop: 18 },
    creditScoreCard: {
        padding: 18,
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(194,157,70,0.24)',
    },
    creditTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    creditCaption: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 2,
    },
    creditScoreValue: {
        fontSize: 38,
        lineHeight: 44,
        fontFamily: 'Poppins_700Bold',
    },
    creditBandPill: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        marginTop: 4,
    },
    creditBandText: {
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
    },
    scoreProgressTrack: {
        height: 10,
        borderRadius: 999,
        marginTop: 14,
        overflow: 'hidden',
    },
    scoreProgressFill: {
        height: '100%',
        borderRadius: 999,
    },
    creditMetaRow: {
        marginTop: 14,
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    creditMetaItem: { flex: 1 },
    creditMetaLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 4,
    },
    creditMetaValue: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    historyCard: {
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    historyHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    historyTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    historyCount: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
    },
    historyEmpty: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        paddingVertical: 10,
    },
    historyItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    historyLeft: { flex: 1, paddingRight: 8 },
    historyReason: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
    },
    historyDate: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        marginTop: 2,
    },
    historyRight: { alignItems: 'flex-end' },
    historyAfter: {
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
    },
    historyDelta: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    menuSection: { paddingHorizontal: 16, paddingTop: 24 },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.2,
        marginBottom: 10,
        fontFamily: 'Poppins_600SemiBold',
    },
    menuCard: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    settingIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    settingContent: { flex: 1, minWidth: 0 },
    settingTitle: {
        fontSize: 15,
        fontWeight: '500',
        fontFamily: 'Poppins_500Medium',
    },
    settingSubtitle: {
        fontSize: 12,
        marginTop: 2,
        fontFamily: 'Poppins_400Regular',
    },
    logoutWrapper: { paddingHorizontal: 16, marginTop: 32 },
    logoutBtn: {
        height: 52,
        backgroundColor: 'transparent',
        borderWidth: 1,
    },
    versionText: {
        textAlign: 'center',
        marginTop: 16,
        marginBottom: 24,
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        opacity: 0.6,
    },
});
