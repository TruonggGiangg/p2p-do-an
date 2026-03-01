import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    ScrollView,
    Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../contexts/AuthContext';
import { walletAPI, WalletTransaction } from '../../wallet/api/wallet.api';
import { BinanceHeader, CommonCard, CommonButton, QRCodeDisplay, FintechPullToRefresh, VentoUltimateLoading } from '../../../components';
import { TransferModal } from '../../wallet/components/TransferModal';
import { useTheme } from '../../../contexts/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Wallet } from '../../../types/auth.types';
import { formatCurrency } from '../../../shared/utils';

const SHORTCUTS = [
    { icon: 'card-account-details-outline' as const, label: 'BNPL', nav: 'BNPL', isParent: false },
    { icon: 'send-outline' as const, label: 'Chuyển tiền', nav: 'Transfer', isParent: true },
    { icon: 'wallet-outline' as const, label: 'Ví', nav: 'Wallets', isParent: true },
    { icon: 'history' as const, label: 'Lịch sử', nav: 'Notifications', isParent: false },
];

const INSIGHTS = [
    { icon: 'chart-line' as const, color: '#F0B90B', badge: 'P2P', title: 'Cho vay P2P', desc: 'Lãi suất lên đến 12%/năm với chương trình cho vay ngang hàng', action: 'Tìm hiểu' },
    { icon: 'shield-check-outline' as const, color: '#0ECB81', badge: 'Mới', title: 'Điểm tín dụng', desc: 'Kiểm tra và cải thiện điểm tín dụng để nâng hạng thành viên', action: 'Kiểm tra' },
    { icon: 'piggy-bank-outline' as const, color: '#F0B90B', badge: 'Mục tiêu', title: 'Tiết kiệm thông minh', desc: 'Đặt mục tiêu tài chính và nhận gợi ý tiết kiệm cá nhân hóa', action: 'Bắt đầu' },
];

export default function HomeScreen() {
    const navigation = useNavigation();
    const { user, refreshUser } = useAuth();
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [walletsLoading, setWalletsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [transferModalVisible, setTransferModalVisible] = useState(false);
    const [qrCodeVisible, setQrCodeVisible] = useState(false);
    const [balanceVisible, setBalanceVisible] = useState(true);

    const fetchWallets = async () => {
        setWalletsLoading(true);
        const minDelay = new Promise(resolve => setTimeout(resolve, 1700));
        try {
            const [response] = await Promise.all([walletAPI.getWallets(), minDelay]);
            let walletData = response.wallets || [];
            if (walletData.length === 0) {
                await walletAPI.syncWallets();
                const syncResponse = await walletAPI.getWallets();
                walletData = syncResponse.wallets || [];
            }
            setWallets(walletData.filter((w: Wallet) => w.type === 'e_wallet'));
        } catch (error) {
            console.error('Failed to fetch wallets:', error);
        } finally {
            setWalletsLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await walletAPI.syncWallets().catch(() => { });
            await Promise.all([refreshUser(), fetchWallets()]);
        } finally {
            setRefreshing(false);
        }
    }, [refreshUser]);

    useEffect(() => { fetchWallets(); }, []);

    const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);
    const tabBarHeight = Platform.OS === 'ios' ? 60 + insets.bottom : 70;
    const c = theme.colors;

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader
                mode="dashboard"
                onAvatarPress={() => (navigation as any).navigate('Profile')}
                onSearchPress={() => { }}
            />

            {walletsLoading && !refreshing ? (
                <View style={styles.loadingWrap}>
                    <VentoUltimateLoading size={200} />
                </View>
            ) : (
                <FintechPullToRefresh
                    onRefresh={onRefresh}
                    refreshing={refreshing}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 32 }]}
                    primaryColor={c.primary}
                    glowColor={c.primaryLight}
                >
                    {/* Portfolio Card */}
                    <View style={styles.section}>
                        <CommonCard style={styles.portfolioCard}>
                            <View style={styles.portfolioHeaderRow}>
                                <Text style={[styles.portfolioLabel, { color: c.textSecondary }]}>Tổng tài sản (VND)</Text>
                                <TouchableOpacity onPress={() => setBalanceVisible(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                    <MaterialCommunityIcons name={balanceVisible ? 'eye-outline' : 'eye-off-outline'} size={18} color={c.textDim} />
                                </TouchableOpacity>
                            </View>
                            <View style={styles.balanceRow}>
                                <Text style={[styles.balanceAmount, { color: c.textPrimary }]}>
                                    {balanceVisible ? formatCurrency(totalBalance) : '*** *** VND'}
                                </Text>
                                <View style={[styles.changeBadge, { backgroundColor: '#0ECB8115' }]}>
                                    <MaterialCommunityIcons name="trending-up" size={12} color="#0ECB81" />
                                    <Text style={[styles.changeText, { color: '#0ECB81' }]}>+2.5%</Text>
                                </View>
                            </View>
                            <View style={[styles.divider, { backgroundColor: c.border }]} />
                            <View style={styles.actionRow}>
                                <CommonButton
                                    title="Nạp tiền"
                                    variant="primary"
                                    style={styles.actionBtn}
                                    textStyle={{ fontSize: 13, fontWeight: '700', color: '#000' }}
                                    onPress={() => { }}
                                />
                                <CommonButton
                                    title="Rút tiền"
                                    variant="secondary"
                                    style={{ flex: 1, height: 44, backgroundColor: c.surfaceLight }}
                                    textStyle={{ fontSize: 13, color: c.textPrimary }}
                                    onPress={() => { }}
                                />
                            </View>
                        </CommonCard>
                    </View>

                    {/* Quick Actions */}
                    <View style={[styles.section, styles.quickGrid]}>
                        {SHORTCUTS.map((item, idx) => (
                            <TouchableOpacity
                                key={idx}
                                style={styles.quickItem}
                                onPress={() => item.isParent
                                    ? (navigation as any).getParent()?.navigate(item.nav)
                                    : (navigation as any).navigate(item.nav)
                                }
                            >
                                <View style={[styles.quickIconWrap, { backgroundColor: c.primaryGlass, borderWidth: 1, borderColor: c.primaryBorder }]}>
                                    <MaterialCommunityIcons name={item.icon} size={22} color={c.primary} />
                                </View>
                                <Text style={[styles.quickLabel, { color: c.textPrimary }]}>{item.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Financial Insights */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Insights tài chính</Text>
                            <MaterialCommunityIcons name="trending-up" size={18} color={c.primary} />
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={styles.insightListContent}>
                            {INSIGHTS.map((ins, idx) => (
                                <TouchableOpacity key={idx} activeOpacity={0.85}>
                                    <CommonCard style={[styles.insightCard, { borderWidth: 1, borderColor: c.border }]}>
                                        <View>
                                            <View style={styles.insightTop}>
                                                <View style={[styles.insightIconWrap, { backgroundColor: ins.color + '18' }]}>
                                                    <MaterialCommunityIcons name={ins.icon} size={22} color={ins.color} />
                                                </View>
                                                <View style={[styles.insightBadge, { backgroundColor: c.primaryGlass }]}>
                                                    <Text style={[styles.insightBadgeText, { color: c.primary }]}>{ins.badge}</Text>
                                                </View>
                                            </View>
                                            <Text style={[styles.insightTitle, { color: c.textPrimary }]}>{ins.title}</Text>
                                            <Text style={[styles.insightDesc, { color: c.textSecondary }]} numberOfLines={3}>{ins.desc}</Text>
                                        </View>
                                        <TouchableOpacity style={[styles.insightBtn, { backgroundColor: c.primary }]}>
                                            <Text style={styles.insightBtnText}>{ins.action}</Text>
                                        </TouchableOpacity>
                                    </CommonCard>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                </FintechPullToRefresh>
            )}

            <TransferModal
                visible={transferModalVisible}
                onClose={() => setTransferModalVisible(false)}
                wallets={wallets}
                onSuccess={onRefresh}
            />
            <Modal visible={qrCodeVisible} animationType="slide" transparent onRequestClose={() => setQrCodeVisible(false)}>
                <View style={{ flex: 1, backgroundColor: c.background }}>
                    <QRCodeDisplay phone={user?.username || ''} name={user?.name} onClose={() => setQrCodeVisible(false)} />
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingTop: 4 },
    section: { paddingHorizontal: 16, marginTop: 20 },
    portfolioCard: { padding: 20 },
    portfolioHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    portfolioLabel: { fontSize: 12, fontWeight: '500' },
    balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
    balanceAmount: { fontSize: 30, fontWeight: '700' },
    changeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    changeText: { fontSize: 11, fontWeight: '700' },
    divider: { height: 1, marginBottom: 16 },
    actionRow: { flexDirection: 'row', gap: 12 },
    actionBtn: { flex: 1, height: 44 },
    quickGrid: { flexDirection: 'row', justifyContent: 'space-between' },
    quickItem: { alignItems: 'center', gap: 8, flex: 1 },
    quickIconWrap: { width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    quickLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    sectionTitle: { fontSize: 17, fontWeight: '700' },
    insightListContent: { paddingRight: 16 },
    insightCard: { width: 220, marginRight: 12, padding: 18, height: 210, justifyContent: 'space-between' },
    insightTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    insightIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    insightBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    insightBadgeText: { fontSize: 10, fontWeight: '700' },
    insightTitle: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
    insightDesc: { fontSize: 12, lineHeight: 17, marginBottom: 14 },
    insightBtn: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
    insightBtnText: { fontSize: 12, fontWeight: '700', color: '#000' },
    txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
    txIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    txInfo: { flex: 1 },
    txDesc: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
    txDate: { fontSize: 11 },
    txAmt: { fontSize: 14, fontWeight: '700' },
});
