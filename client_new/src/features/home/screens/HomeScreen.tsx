import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    ActivityIndicator,
    RefreshControl,
    Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../contexts/AuthContext';
import { walletAPI } from '../../wallet/api/wallet.api';
import { bnplAPI } from '../../bnpl/api/bnpl.api';
import {
    WalletCard,
    CommonButton,
    QuickAction,
    TransferModal,
    QRCodeDisplay,
} from '../../../components';
import { useTheme } from '../../../contexts/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Wallet } from '../../../types/auth.types';
import { formatCurrency } from '../../../shared/utils';

export default function HomeScreen() {
    const navigation = useNavigation();
    const { user, refreshUser } = useAuth();
    const { theme } = useTheme();
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [walletsLoading, setWalletsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [transferModalVisible, setTransferModalVisible] = useState(false);
    const [qrCodeVisible, setQrCodeVisible] = useState(false);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);

    const fetchWallets = async () => {
        setWalletsLoading(true);
        try {
            let response = await walletAPI.getWallets();
            let walletData = response.wallets || [];

            if (walletData.length === 0) {
                await walletAPI.syncWallets();
                response = await walletAPI.getWallets();
                walletData = response.wallets || [];
            }

            const eWallets = walletData.filter((w: Wallet) => w.type === 'e_wallet');
            setWallets(eWallets);
        } catch (error: any) {
            console.error('Failed to fetch wallets:', error);
        } finally {
            setWalletsLoading(false);
        }
    };

    const fetchTransactions = async (walletId?: string) => {
        setTransactionsLoading(true);
        try {
            const response = await walletAPI.getTransactions(10, 0, walletId);
            setTransactions(response.transactions || []);
        } catch (error: any) {
            console.error('Failed to fetch transactions:', error);
            setTransactions([]);
        } finally {
            setTransactionsLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await walletAPI.syncWallets();
        } catch (error) {
            console.error('[HomeScreen] Sync failed during refresh:', error);
        }
        await Promise.all([refreshUser(), fetchWallets()]);
        if (selectedWalletId) {
            await fetchTransactions(selectedWalletId);
        } else {
            await fetchTransactions();
        }
        setRefreshing(false);
    }, [refreshUser, selectedWalletId]);

    useEffect(() => {
        fetchWallets();
    }, []);

    useEffect(() => {
        if (wallets.length > 0) {
            const defaultWallet = wallets[0];
            const defaultWalletId = defaultWallet.fineractId || defaultWallet.accountNo || defaultWallet.id || null;
            if (defaultWalletId && !selectedWalletId) {
                setSelectedWalletId(defaultWalletId);
            }
        }
    }, [wallets]);

    useEffect(() => {
        if (selectedWalletId) {
            void fetchTransactions(selectedWalletId);
        }
    }, [selectedWalletId]);

    const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {/* Top Header */}
            <View style={[styles.topHeader, { paddingTop: insets.top + 10 }]}>
                <View style={[styles.avatarBox, { backgroundColor: theme.colors.surfaceLight }]}>
                    <MaterialCommunityIcons name="account" size={20} color={theme.colors.textPrimary} />
                    <View style={[styles.verifiedBadge, { backgroundColor: theme.colors.primary }]}>
                        <MaterialCommunityIcons name="check" size={8} color="#000" />
                    </View>
                </View>

                <View style={styles.headerIcons}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => setQrCodeVisible(true)}>
                        <MaterialCommunityIcons name="qrcode-scan" size={22} color={theme.colors.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn}>
                        <MaterialCommunityIcons name="bell-outline" size={22} color={theme.colors.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn}>
                        <MaterialCommunityIcons name="help-circle-outline" size={22} color={theme.colors.textPrimary} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
                }
            >
                {/* Portfolio Card */}
                <View style={styles.portfolioSection}>
                    <View style={styles.portfolioHeader}>
                        <Text style={[styles.portfolioTitle, { color: theme.colors.textSecondary }]}>Total Assets (VND)</Text>
                        <MaterialCommunityIcons name="eye-outline" size={16} color={theme.colors.textDim} />
                    </View>

                    <View style={styles.balanceRow}>
                        <Text style={[styles.balanceMajor, { color: theme.colors.textPrimary }]}>
                            {formatCurrency(totalBalance)}
                        </Text>
                    </View>

                    <View style={styles.portfolioActions}>
                        <CommonButton
                            title="Deposit"
                            variant="primary"
                            style={{ flex: 1, height: 44 }}
                            textStyle={{ fontSize: 13, color: '#000' }}
                            onPress={() => { }}
                        />
                        <CommonButton
                            title="Withdraw"
                            variant="secondary"
                            style={{ flex: 1, height: 44, backgroundColor: theme.colors.surfaceLight }}
                            textStyle={{ fontSize: 13, color: theme.colors.textPrimary }}
                            onPress={() => { }}
                        />
                    </View>
                </View>

                {/* Quick Shortcuts */}
                <View style={styles.shortcutGrid}>
                    {[
                        { icon: 'card-account-details-outline', label: 'BNPL', color: theme.colors.primary, onPress: () => (navigation as any).navigate('BNPL') },
                        { icon: 'send-outline', label: 'Transfer', color: theme.colors.primary, onPress: () => (navigation as any).getParent()?.navigate('Transfer') },
                        { icon: 'wallet-outline', label: 'Wallets', color: theme.colors.primary, onPress: () => { } },
                        { icon: 'history', label: 'History', color: theme.colors.primary, onPress: () => { } },
                    ].map((item, idx) => (
                        <TouchableOpacity key={idx} style={styles.shortcutItem} onPress={item.onPress}>
                            <View style={[styles.shortcutIcon, { backgroundColor: theme.colors.surfaceLight }]}>
                                <MaterialCommunityIcons name={item.icon as any} size={24} color={item.color} />
                            </View>
                            <Text style={[styles.shortcutLabel, { color: theme.colors.textSecondary }]}>{item.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Recent History */}
                <View style={styles.sectionHeaderNew}>
                    <Text style={[styles.sectionTitleNew, { color: theme.colors.textPrimary }]}>Recent History</Text>
                    <TouchableOpacity onPress={() => onRefresh()}>
                        <Text style={[styles.seeMoreNew, { color: theme.colors.primary }]}>Refresh</Text>
                    </TouchableOpacity>
                </View>

                {transactionsLoading ? (
                    <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 20 }} />
                ) : transactions.length > 0 ? (
                    <View style={styles.historyList}>
                        {transactions.slice(0, 5).map((tx, index) => (
                            <TransactionItem
                                key={index}
                                type={tx.type}
                                title={tx.description}
                                date={tx.date}
                                amount={tx.amount}
                            />
                        ))}
                    </View>
                ) : (
                    <Text style={[styles.emptyTextNew, { color: theme.colors.textDim }]}>No recent activity</Text>
                )}
                <View style={{ height: 40 }} />
            </ScrollView>

            <TransferModal
                visible={transferModalVisible}
                onClose={() => setTransferModalVisible(false)}
                wallets={wallets}
                onSuccess={onRefresh}
            />
            <Modal visible={qrCodeVisible} animationType="slide" transparent onRequestClose={() => setQrCodeVisible(false)}>
                <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
                    <QRCodeDisplay phone={user?.username || ''} name={user?.name} onClose={() => setQrCodeVisible(false)} />
                </View>
            </Modal>
        </View>
    );
}

// ==================== SUB-COMPONENTS ====================

interface TransactionItemProps {
    type: string;
    title: string;
    date: string;
    amount: number;
}

const TransactionItem: React.FC<TransactionItemProps> = ({ type, title, date, amount }) => {
    const { theme } = useTheme();
    const isIncome = type === 'deposit' || type === 'transfer_in';

    const formatDateShort = (dateString: string) => {
        try {
            const d = new Date(dateString);
            return `${d.getDate()} Tháng ${d.getMonth() + 1} ${d.getFullYear()}`;
        } catch {
            return dateString;
        }
    };

    const formatAmount = (amt: number) => {
        const formatted = new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
            minimumFractionDigits: 0,
        }).format(Math.abs(amt));
        return isIncome ? `+${formatted}` : `-${formatted}`;
    };

    return (
        <View style={[styles.transactionRow, { borderBottomColor: theme.colors.border }]}>
            <View style={[styles.transIcon, { backgroundColor: isIncome ? theme.colors.successGlass : theme.colors.errorGlass }]}>
                <MaterialCommunityIcons
                    name={isIncome ? 'arrow-down' : 'arrow-up'}
                    size={18}
                    color={isIncome ? theme.colors.success : theme.colors.error}
                />
            </View>
            <View style={styles.transContent}>
                <Text style={[styles.transTitle, { color: theme.colors.textPrimary }]}>{title || 'Giao dịch ví'}</Text>
                <Text style={[styles.transDate, { color: theme.colors.textMuted }]}>{formatDateShort(date)}</Text>
            </View>
            <Text style={[styles.transAmount, { color: isIncome ? theme.colors.success : theme.colors.textPrimary, fontWeight: '700' }]}>
                {formatAmount(amount)}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    topHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, height: 90, justifyContent: 'space-between' },
    avatarBox: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', position: 'relative' },
    verifiedBadge: { position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#111318', justifyContent: 'center', alignItems: 'center' },
    headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 15 },
    iconBtn: { padding: 2 },
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: 40 },
    portfolioSection: { paddingHorizontal: 20, marginVertical: 10 },
    portfolioHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    portfolioTitle: { fontSize: 12 },
    balanceRow: { marginBottom: 20 },
    balanceMajor: { fontSize: 32, fontWeight: '700' },
    portfolioActions: { flexDirection: 'row', gap: 12 },
    shortcutGrid: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 32 },
    shortcutItem: { alignItems: 'center', width: 80, gap: 8 },
    shortcutIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    shortcutLabel: { fontSize: 11, textAlign: 'center' },
    sectionHeaderNew: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 32, marginBottom: 16 },
    sectionTitleNew: { fontSize: 18, fontWeight: '700' },
    seeMoreNew: { fontSize: 13, fontWeight: '600' },
    historyList: { paddingHorizontal: 20 },
    emptyTextNew: { paddingHorizontal: 20, fontSize: 13 },
    transactionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
    transIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    transContent: { flex: 1 },
    transTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
    transDate: { fontSize: 11 },
    transAmount: { fontSize: 15 },
});
