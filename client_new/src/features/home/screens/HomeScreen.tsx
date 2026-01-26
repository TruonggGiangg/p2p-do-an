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
import { useAuth } from '../../../contexts/AuthContext';
import { walletAPI } from '../../wallet/api/wallet.api';
import { bnplAPI } from '../../bnpl/api/bnpl.api';
import { WalletCard, GradientBackground, GlassCard, QuickAction, TransferModal, QRCodeDisplay, CustomHeader } from '../../../components';
import { useTheme } from '../../../contexts/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { Wallet } from '../../../types/auth.types';
import { formatCurrency, formatDate } from '../../../shared/utils';

export default function HomeScreen() {
    const navigation = useNavigation();
    const { user, logout, refreshUser, isLoading: authLoading } = useAuth();
    const { theme } = useTheme();
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [walletsLoading, setWalletsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [transferModalVisible, setTransferModalVisible] = useState(false);
    const [qrCodeVisible, setQrCodeVisible] = useState(false);
    const [bnplAvailableCredit, setBnplAvailableCredit] = useState<number | null>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);

    const fetchWallets = async () => {
        setWalletsLoading(true);
        try {
            const response = await walletAPI.getWallets();
            const walletData = response.wallets || [];
            // Filter out BNPL wallets (credit_wallet) - only show e_wallet
            const eWallets = walletData.filter((w: Wallet) => w.type === 'e_wallet');
            setWallets(eWallets);

            if (__DEV__) {
                console.log(`[HomeScreen] Loaded ${eWallets.length} e-wallets:`, eWallets.map((w: Wallet) => ({
                    fineractId: w.fineractId,
                    accountNo: w.accountNo,
                    productName: w.productName,
                    balance: w.balance,
                })));
            }
        } catch (error: any) {
            console.error('Failed to fetch wallets:', error);
            // Only show error if it's not a network error or auth error
            // Auth errors are handled by interceptor
            if (error.response?.status && error.response.status >= 500) {
                Alert.alert('Lỗi', 'Không thể tải danh sách ví. Vui lòng thử lại sau.');
            }
        } finally {
            setWalletsLoading(false);
        }
    };

    const fetchBnplInfo = async () => {
        try {
            const walletInfo = await bnplAPI.getWallet();
            setBnplAvailableCredit(walletInfo.availableCredit);
        } catch (error: any) {
            if (__DEV__) {
                console.log('BNPL wallet not available:', error.message);
            }
            setBnplAvailableCredit(null);
        }
    };

    // Fetch wallets and BNPL info on mount
    useEffect(() => {
        fetchWallets();
        fetchBnplInfo();
    }, []);

    // When wallets change, set default selected wallet
    useEffect(() => {
        if (wallets.length > 0) {
            const defaultWallet = wallets[0];
            const defaultWalletId =
                defaultWallet.fineractId || defaultWallet.accountNo || defaultWallet.id || defaultWallet._id || null;

            if (defaultWalletId && !selectedWalletId) {
                setSelectedWalletId(defaultWalletId);
            }
        }
    }, [wallets, selectedWalletId]);

    // When selectedWalletId changes, fetch transactions for that wallet
    useEffect(() => {
        if (selectedWalletId) {
            void fetchTransactions(selectedWalletId);
        } else {
            // Fallback: fetch default transactions (first active e-wallet) if no specific wallet selected
            void fetchTransactions();
        }
    }, [selectedWalletId]);

    const fetchTransactions = async (walletId?: string) => {
        setTransactionsLoading(true);
        try {
            // walletId is Fineract Savings ID (not MongoDB ID)
            const response = await walletAPI.getTransactions(10, 0, walletId);
            const transactionData = response.transactions || [];
            setTransactions(transactionData);
            if (__DEV__) {
                console.log(`[HomeScreen] Loaded ${transactionData.length} transactions for walletId=${walletId || 'default'}`);
            }
        } catch (error: any) {
            console.error('Failed to fetch transactions:', error);
            // Silently fail - transactions are not critical
            setTransactions([]);
        } finally {
            setTransactionsLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([refreshUser(), fetchWallets(), fetchBnplInfo()]);
        // Transactions will be fetched automatically when selectedWalletId is set
        if (selectedWalletId) {
            await fetchTransactions(selectedWalletId);
        } else {
            await fetchTransactions();
        }
        setRefreshing(false);
    }, [refreshUser, selectedWalletId]);

    const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);

    return (
        <GradientBackground>
            <CustomHeader title="Trang chủ" />
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
                }
            >
                {/* User Header */}
                <View style={styles.header}>
                    <View>
                        <Text style={[styles.greeting, { color: theme.colors.textMuted }]}>Chào bạn,</Text>
                        <Text style={[styles.userName, { color: theme.colors.textPrimary }]}>
                            {user?.name || user?.username}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={[
                            styles.notificationBtn,
                            {
                                backgroundColor: theme.colors.surface,
                                borderRadius: theme.radius.full,
                            },
                        ]}
                        onPress={() => Alert.alert('Thông báo', 'Bạn không có thông báo mới')}
                    >
                        <MaterialCommunityIcons name="bell-outline" size={22} color={theme.colors.textPrimary} />
                    </TouchableOpacity>
                </View>

                {/* Total Balance Card - Premium Design */}
                <LinearGradient
                    colors={theme.gradients.primary as any}
                    style={[
                        styles.balanceCard,
                        {
                            borderRadius: theme.radius.xl,
                            ...theme.shadows.glow,
                        },
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <Text style={styles.balanceLabel}>Tổng số dư khả dụng</Text>
                    <Text style={styles.balanceAmount}>{formatCurrency(totalBalance)}</Text>
                    <View style={styles.balanceActions}>
                        <TouchableOpacity style={styles.balanceActionBtn} onPress={() => setQrCodeVisible(true)}>
                            <MaterialCommunityIcons name="qrcode-scan" size={22} color="#fff" />
                            <Text style={styles.balanceActionText}>Mã QR</Text>
                        </TouchableOpacity>
                        <View style={styles.balanceDivider} />
                        <TouchableOpacity
                            style={styles.balanceActionBtn}
                            onPress={() => setTransferModalVisible(true)}
                            disabled={wallets.filter((w) => w.type === 'e_wallet').length === 0}
                        >
                            <MaterialCommunityIcons name="send" size={22} color="#fff" />
                            <Text style={styles.balanceActionText}>Chuyển tiền</Text>
                        </TouchableOpacity>
                    </View>
                </LinearGradient>

                {/* Quick Actions */}
                <View style={styles.quickActions}>
                    {[
                        {
                            key: 'scan-qr',
                            icon: 'qrcode-scan',
                            label: 'Quét mã',
                            colors: theme.gradients.primaryAlt as any,
                            onPress: () => {
                                setTransferModalVisible(true);
                            },
                        },
                        {
                            key: 'bnpl',
                            icon: 'credit-card',
                            label: bnplAvailableCredit !== null ? `Hạn mức: ${formatCurrency(bnplAvailableCredit)}` : 'Hạn mức vay',
                            colors: theme.gradients.bnpl as any,
                            onPress: () => {
                                (navigation as any).navigate('BNPL');
                            },
                        },
                        {
                            key: 'topup-phone',
                            icon: 'phone',
                            label: 'Nạp ĐT',
                            colors: theme.gradients.primary as any,
                            onPress: () => Alert.alert('Nạp tiền điện thoại', 'Tính năng đang phát triển'),
                        },
                        {
                            key: 'all',
                            icon: 'view-grid',
                            label: 'Tất cả',
                            colors: theme.gradients.success as any,
                            onPress: () => Alert.alert('Tất cả', 'Tính năng đang phát triển'),
                        },
                    ].map((action) => (
                        <QuickAction
                            key={action.key}
                            icon={action.icon}
                            label={action.label}
                            colors={action.colors}
                            onPress={action.onPress}
                        />
                    ))}
                </View>

                {/* My Wallets Section */}
                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Ví của tôi</Text>
                    <TouchableOpacity onPress={fetchWallets}>
                        <Text style={[styles.seeMore, { color: theme.colors.primary }]}>Làm mới</Text>
                    </TouchableOpacity>
                </View>

                {walletsLoading ? (
                    <ActivityIndicator key="wallets-loading" color={theme.colors.primary} style={styles.loader} />
                ) : wallets.length > 0 ? (
                    <View key="wallets-list">
                        {wallets.map((wallet, index) => {
                            const walletKey = wallet.fineractId || wallet.accountNo || wallet.id || wallet._id || String(index);
                            return <WalletCard key={walletKey} wallet={wallet} />;
                        })}
                    </View>
                ) : (
                    <GlassCard key="wallets-empty" style={styles.emptyCard}>
                        <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                            Chưa có thông tin ví điện tử
                        </Text>
                        <TouchableOpacity
                            style={[
                                styles.syncBtn,
                                {
                                    backgroundColor: theme.colors.primary,
                                    borderRadius: theme.radius.md,
                                },
                            ]}
                            onPress={() => walletAPI.syncWallets().then(onRefresh)}
                        >
                            <Text style={styles.syncBtnText}>Đồng bộ ngay</Text>
                        </TouchableOpacity>
                    </GlassCard>
                )}

                {/* Recent Transactions Section */}
                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Giao dịch gần đây</Text>
                    {transactions.length > 0 && selectedWalletId && (
                        <TouchableOpacity onPress={() => fetchTransactions(selectedWalletId)}>
                            <Text style={[styles.seeMore, { color: theme.colors.primary }]}>Làm mới</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Wallet selector for transaction history */}
                {wallets.length > 1 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.walletChipContainer}>
                        {wallets.map((wallet) => {
                            const wId = wallet.fineractId || wallet.accountNo || wallet.id || wallet._id;
                            if (!wId) return null;
                            const isSelected = selectedWalletId === wId;
                            const label = wallet.productName || wallet.metadata?.productName || wallet.accountNo || 'Ví';
                            return (
                                <TouchableOpacity
                                    key={wId}
                                    style={[
                                        styles.walletChip,
                                        {
                                            backgroundColor: isSelected
                                                ? theme.colors.primaryGlass
                                                : theme.colors.glassLight,
                                            borderColor: isSelected ? theme.colors.primaryBorder : theme.colors.border,
                                            borderRadius: theme.radius.full,
                                        },
                                    ]}
                                    onPress={() => setSelectedWalletId(wId)}
                                >
                                    <Text
                                        style={[
                                            isSelected ? styles.walletChipTextSelected : styles.walletChipText,
                                            {
                                                color: isSelected ? theme.colors.primary : theme.colors.textSecondary,
                                            },
                                        ]}
                                    >
                                        {label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                )}

                {transactionsLoading ? (
                    <GlassCard style={styles.transactionsCard}>
                        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
                    </GlassCard>
                ) : transactions.length > 0 ? (
                    <GlassCard style={styles.transactionsCard}>
                        {transactions.map((tx, index) => {
                            const txKey = tx.id || `${tx.type}-${tx.date}-${index}`;
                            return (
                                <TransactionItem
                                    key={txKey}
                                    type={tx.type}
                                    title={tx.description}
                                    date={tx.date}
                                    amount={tx.amount}
                                />
                            );
                        })}
                    </GlassCard>
                ) : (
                    <GlassCard style={styles.transactionsCard}>
                        <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>Chưa có giao dịch nào</Text>
                    </GlassCard>
                )}
            </ScrollView>

            {/* Transfer Modal */}
            <TransferModal
                visible={transferModalVisible}
                onClose={() => setTransferModalVisible(false)}
                wallets={wallets}
                onSuccess={() => {
                    fetchWallets();
                    if (selectedWalletId) {
                        void fetchTransactions(selectedWalletId);
                    } else {
                        void fetchTransactions();
                    }
                }}
            />

            {/* QR Code Display Modal */}
            <Modal visible={qrCodeVisible} animationType="slide" transparent onRequestClose={() => setQrCodeVisible(false)}>
                <GradientBackground>
                    <QRCodeDisplay phone={user?.username || user?.metadata?.phone || ''} name={user?.name} onClose={() => setQrCodeVisible(false)} />
                </GradientBackground>
            </Modal>
        </GradientBackground>
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
    const isExpense = type === 'withdrawal' || type === 'transfer_out';

    const formatDateShort = (dateString: string) => {
        try {
            const date = new Date(dateString);
            const day = date.getDate();
            const month = date.toLocaleDateString('vi-VN', { month: 'short' });
            const year = date.getFullYear();
            return `${day} ${month} ${year}`;
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
            <View
                style={[
                    styles.transIcon,
                    {
                        backgroundColor: isIncome ? theme.colors.successGlass : theme.colors.errorGlass,
                        borderRadius: theme.radius.md,
                    },
                ]}
            >
                <MaterialCommunityIcons
                    name={isIncome ? 'arrow-down' : 'arrow-up'}
                    size={18}
                    color={isIncome ? theme.colors.success : theme.colors.error}
                />
            </View>
            <View style={styles.transContent}>
                <Text style={[styles.transTitle, { color: theme.colors.textPrimary }]}>
                    {title || 'Giao dịch ví'}
                </Text>
                <Text style={[styles.transDate, { color: theme.colors.textMuted }]}>{formatDateShort(date)}</Text>
            </View>
            <Text
                style={[
                    styles.transAmount,
                    {
                        color: isIncome ? theme.colors.success : theme.colors.textPrimary,
                        fontFamily: 'Poppins_700Bold',
                    },
                ]}
            >
                {formatAmount(amount)}
            </Text>
        </View>
    );
};

// ==================== STYLES ====================

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
        paddingHorizontal: 20,
        flexGrow: 1,
        width: '100%',
        maxWidth: '100%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 28,
        marginTop: 10,
    },
    greeting: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    userName: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        marginTop: 2,
        flexShrink: 1,
    },
    notificationBtn: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    balanceCard: {
        padding: 24,
        marginBottom: 24,
        overflow: 'hidden',
        width: '100%',
        maxWidth: '100%',
    },
    balanceLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: 'rgba(255, 255, 255, 0.8)',
        marginBottom: 8,
    },
    balanceAmount: {
        fontSize: 40,
        fontFamily: 'Poppins_700Bold',
        color: '#fff',
        marginBottom: 24,
        letterSpacing: -0.5,
        flexWrap: 'wrap',
    },
    balanceActions: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderRadius: 16,
        padding: 12,
    },
    balanceActionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minWidth: 0,
    },
    balanceDivider: {
        width: 1,
        height: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    balanceActionText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#fff',
        flexShrink: 1,
    },
    quickActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 32,
        gap: 8,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        flexShrink: 1,
    },
    seeMore: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        flexShrink: 0,
    },
    emptyCard: {
        padding: 32,
        alignItems: 'center',
        marginBottom: 24,
    },
    emptyText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 16,
    },
    syncBtn: {
        paddingHorizontal: 24,
        paddingVertical: 12,
    },
    syncBtnText: {
        color: '#fff',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
    },
    loader: {
        marginVertical: 24,
    },
    transactionsCard: {
        padding: 20,
        marginBottom: 32,
        width: '100%',
        maxWidth: '100%',
    },
    walletChipContainer: {
        marginBottom: 16,
        paddingHorizontal: 4,
        marginHorizontal: -4,
    },
    walletChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 9999,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginRight: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        maxWidth: '100%',
    },
    walletChipSelected: {
        backgroundColor: '#8b5cf6',
        borderColor: '#8b5cf6',
    },
    walletChipText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        flexShrink: 1,
    },
    walletChipTextSelected: {
        color: '#fff',
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        flexShrink: 1,
    },
    transactionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#2d3748',
    },
    transIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    transContent: {
        flex: 1,
    },
    transTitle: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 4,
        flexShrink: 1,
        flex: 1,
    },
    transDate: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        flexShrink: 1,
    },
    transAmount: {
        fontSize: 16,
        flexShrink: 0,
        marginLeft: 8,
    },
    logoutButton: {
        backgroundColor: '#111827',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 8,
        borderWidth: 1,
        borderColor: '#374151',
    },
    logoutButtonText: {
        color: '#ef4444',
        fontSize: 15,
        fontWeight: '600',
    },
    systemCard: {
        backgroundColor: '#1a1f3a',
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#374151',
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#2d3748',
    },
    infoLabel: {
        fontSize: 13,
        color: '#9ca3af',
        fontWeight: '600',
    },
    infoValue: {
        fontSize: 13,
        color: '#fff',
        fontWeight: '500',
    },
    syncBtnSmall: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#374151',
        paddingVertical: 10,
        borderRadius: 8,
        marginTop: 12,
    },
    syncBtnTextSmall: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
});
