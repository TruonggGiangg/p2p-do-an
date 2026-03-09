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
    { icon: 'history' as const, label: 'Lịch sử', nav: 'Notifications', isParent: false }, // Hoặc LoanHistory
    { icon: 'hand-coin-outline' as const, label: 'Vay P2P', nav: 'Loan', isParent: false }, // Tab Vay vốn
    { icon: 'check-decagram-outline' as const, label: 'Xác thực', nav: 'KYCIntro', isParent: true },
    { icon: 'file-document-outline' as const, label: 'Hợp đồng', nav: 'LoanContractList', isParent: true },
    { icon: 'qrcode-scan' as const, label: 'Quét QR', nav: 'QR', isParent: false }, // Xử lý mở Modal
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
                <View style={[styles.loadingWrap, { marginTop: Platform.OS === 'ios' ? 50 : 100 }]}>
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
                                    {balanceVisible ? formatCurrency(totalBalance) : '*** *** \u20AB'}
                                </Text>
                                <View style={[styles.changeBadge, { backgroundColor: '#0ECB8115' }]}>
                                    <MaterialCommunityIcons name="trending-up" size={12} color="#0ECB81" />
                                    <Text style={[styles.changeText, { color: '#0ECB81' }]}>+2.5%</Text>
                                </View>
                            </View>
                            <View style={[styles.divider, { backgroundColor: c.border }]} />
                            <View style={styles.actionRow}>
                                <TouchableOpacity
                                    style={[styles.actionBtn, { backgroundColor: '#F0B90B' }]}
                                    onPress={() => { }}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.actionBtnTextPrimary}>Nạp tiền</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.actionBtn, { backgroundColor: 'transparent' }]}
                                    onPress={() => { }}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[styles.actionBtnTextSecondary, { color: c.textPrimary }]}>Rút tiền</Text>
                                </TouchableOpacity>
                            </View>
                        </CommonCard>
                    </View>

                    {/* Quick Actions */}
                    <View style={[styles.section, styles.quickGrid]}>
                        {SHORTCUTS.map((item, idx) => (
                            <TouchableOpacity
                                key={idx}
                                style={styles.quickItem}
                                onPress={() => {
                                    if (item.nav === 'QR') {
                                        setQrCodeVisible(true);
                                    } else {
                                        item.isParent
                                            ? (navigation as any).getParent()?.navigate(item.nav)
                                            : (navigation as any).navigate(item.nav);
                                    }
                                }}
                            >
                                <View style={[styles.quickIconWrap, { backgroundColor: theme.mode === 'dark' ? theme.colors.surface : '#FFF5E0', borderColor: theme.mode === 'dark' ? theme.colors.border : '#FFE4B5' }]}>
                                    <MaterialCommunityIcons name={item.icon} size={24} color="#F0B90B" />
                                </View>
                                <Text style={[styles.quickLabel, { color: c.textPrimary }]}>{item.label}</Text>
                            </TouchableOpacity>
                        ))}
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
    loadingWrap: { marginTop: Platform.OS === 'ios' ? 60 : 100, alignItems: 'center' },
    scrollContent: { paddingTop: 4 },
    section: { paddingHorizontal: 16, marginTop: 24 },
    portfolioCard: { padding: 20, paddingBottom: 16, borderRadius: 16, elevation: 1 },
    portfolioHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    portfolioLabel: { fontSize: 13, fontWeight: '500' },
    balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    balanceAmount: { fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
    changeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
    changeText: { fontSize: 11, fontWeight: '700' },
    divider: { height: 1, marginBottom: 16 },
    actionRow: { flexDirection: 'row', gap: 12 },
    actionBtn: { flex: 1, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    actionBtnTextPrimary: { fontSize: 14, fontWeight: '700', color: '#000' },
    actionBtnTextSecondary: { fontSize: 14, fontWeight: '500' },
    quickGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 20 },
    quickItem: { width: '23%', alignItems: 'center', marginBottom: 20, gap: 8 },
    quickIconWrap: { width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
    quickLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '700' },

});
