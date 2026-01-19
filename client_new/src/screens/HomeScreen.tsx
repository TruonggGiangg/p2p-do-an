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
import { useAuth } from '../contexts/AuthContext';
import { walletAPI } from '../services/wallet.api';
import { bnplAPI } from '../services/bnpl.api';
import { WalletCard, GradientBackground, GlassCard, QuickAction, TransferModal, QRCodeDisplay } from '../components';
import { GlassTokens, Gradients } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { Wallet } from '../types/auth.types';

export default function HomeScreen() {
    const navigation = useNavigation();
    const { user, logout, refreshUser, isLoading: authLoading } = useAuth();
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
            // The response structure should match WalletsResponse from types
            const walletData = response.data?.wallets || response.wallets || [];
            // Filter out BNPL wallets (credit_wallet) - only show e_wallet
            const eWallets = walletData.filter((w: Wallet) => w.type === 'e_wallet');
            setWallets(eWallets);

            // Log for debugging
            console.log(`[HomeScreen] Loaded ${eWallets.length} e-wallets:`, eWallets.map((w: Wallet) => ({
                fineractId: w.fineractId,
                accountNo: w.accountNo,
                productName: w.productName,
                balance: w.balance,
            })));
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
            // BNPL wallet might not exist yet, silently fail
            console.log('BNPL wallet not available:', error.message);
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
            const transactionData = response.data?.transactions || [];
            setTransactions(transactionData);
            console.log(`[HomeScreen] Loaded ${transactionData.length} transactions for walletId=${walletId || 'default'}`);
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

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    };

    return (
        <GradientBackground>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GlassTokens.colors.primary} />
                }
            >
                {/* User Header */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.greeting}>Chào bạn,</Text>
                        <Text style={styles.userName}>{user?.name || user?.username}</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.notificationBtn}
                        onPress={() => Alert.alert('Thông báo', 'Bạn không có thông báo mới')}
                    >
                        <Ionicons name="notifications-outline" size={24} color="#fff" />
                    </TouchableOpacity>
                </View>

                {/* Total Balance Card */}
                <LinearGradient
                    colors={Gradients.primary as any}
                    style={styles.balanceCard}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <Text style={styles.balanceLabel}>Tổng số dư khả dụng</Text>
                    <Text style={styles.balanceAmount}>{formatCurrency(totalBalance)}</Text>
                    <View style={styles.balanceActions}>
                        <TouchableOpacity style={styles.balanceActionBtn} onPress={() => setQrCodeVisible(true)}>
                            <Ionicons name="qr-code-outline" size={22} color="#fff" />
                            <Text style={styles.balanceActionText}>Mã QR</Text>
                        </TouchableOpacity>
                        <View style={styles.balanceDivider} />
                        <TouchableOpacity
                            style={styles.balanceActionBtn}
                            onPress={() => setTransferModalVisible(true)}
                            disabled={wallets.filter((w) => w.type === 'e_wallet').length === 0}
                        >
                            <Ionicons name="arrow-forward-circle-outline" size={22} color="#fff" />
                            <Text style={styles.balanceActionText}>Chuyển tiền</Text>
                        </TouchableOpacity>
                    </View>
                </LinearGradient>

                {/* Quick Actions */}
                <View style={styles.quickActions}>
                    {[
                        {
                            key: 'scan-qr',
                            icon: 'qr-code-outline',
                            label: 'Quét mã',
                            colors: ['#8b5cf6', '#7c3aed'] as const,
                            onPress: () => {
                                setTransferModalVisible(true);
                            },
                        },
                        {
                            key: 'bnpl',
                            icon: 'card-outline',
                            label: bnplAvailableCredit !== null ? `Hạn mức: ${formatCurrency(bnplAvailableCredit)}` : 'Hạn mức vay tiêu dùng',
                            colors: Gradients.bnpl,
                            onPress: () => {
                                // @ts-ignore - navigation type is complex
                                navigation.navigate('BNPL');
                            },
                        },
                        {
                            key: 'topup-phone',
                            icon: 'phone-portrait-outline',
                            label: 'Nạp ĐT',
                            colors: Gradients.primary,
                            onPress: () => Alert.alert('Nạp tiền điện thoại', 'Tính năng đang phát triển'),
                        },
                        {
                            key: 'all',
                            icon: 'grid-outline',
                            label: 'Tất cả',
                            colors: Gradients.success,
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
                    <Text style={styles.sectionTitle}>Ví của tôi</Text>
                    <TouchableOpacity onPress={fetchWallets}>
                        <Text style={styles.seeMore}>Làm mới</Text>
                    </TouchableOpacity>
                </View>

                {walletsLoading ? (
                    <ActivityIndicator key="wallets-loading" color="#3b82f6" style={styles.loader} />
                ) : wallets.length > 0 ? (
                    <View key="wallets-list">
                        {wallets.map((wallet, index) => {
                            // Use fineractId or accountNo as key instead of MongoDB ID
                            const walletKey = wallet.fineractId || wallet.accountNo || wallet.id || wallet._id || String(index);
                            return <WalletCard key={walletKey} wallet={wallet} />;
                        })}
                    </View>
                ) : (
                    <View key="wallets-empty" style={styles.emptyCard}>
                        <Text style={styles.emptyText}>Chưa có thông tin ví điện tử</Text>
                        <TouchableOpacity style={styles.syncBtn} onPress={() => walletAPI.syncWallets().then(onRefresh)}>
                            <Text style={styles.syncBtnText}>Đồng bộ ngay</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Recent Transactions Section */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Giao dịch gần đây</Text>
                    {transactions.length > 0 && selectedWalletId && (
                        <TouchableOpacity onPress={() => fetchTransactions(selectedWalletId)}>
                            <Text style={styles.seeMore}>Làm mới</Text>
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
                                    style={[styles.walletChip, isSelected && styles.walletChipSelected]}
                                    onPress={() => setSelectedWalletId(wId)}
                                >
                                    <Text style={isSelected ? styles.walletChipTextSelected : styles.walletChipText}>{label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                )}

                {transactionsLoading ? (
                    <GlassCard style={styles.transactionsCard}>
                        <ActivityIndicator color={GlassTokens.colors.primary} style={styles.loader} />
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
                        <Text style={styles.emptyText}>Chưa có giao dịch nào</Text>
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

const TransactionItem = ({ type, title, date, amount }: any) => {
    // Determine if transaction is income or expense based on type
    const isIncome = type === 'deposit' || type === 'transfer_in';
    const isExpense = type === 'withdrawal' || type === 'transfer_out';

    // Format date
    const formatDate = (dateString: string) => {
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

    // Format amount
    const formatAmount = (amt: number) => {
        const formatted = new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
            minimumFractionDigits: 0,
        }).format(Math.abs(amt));
        return isIncome ? `+${formatted}` : `-${formatted}`;
    };

    return (
        <View style={styles.transactionRow}>
            <View
                style={[
                    styles.transIcon,
                    {
                        backgroundColor: isIncome ? 'rgba(16, 185, 129, 0.2)' : 'rgba(220, 38, 38, 0.2)',
                    },
                ]}
            >
                <Ionicons
                    name={isIncome ? 'arrow-down' : 'arrow-up'}
                    size={18}
                    color={isIncome ? '#10b981' : '#dc2626'}
                />
            </View>
            <View style={styles.transContent}>
                <Text style={styles.transTitle}>{title || 'Giao dịch ví'}</Text>
                <Text style={styles.transDate}>{formatDate(date)}</Text>
            </View>
            <Text style={[styles.transAmount, { color: isIncome ? '#10b981' : '#fff' }]}>
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
        padding: GlassTokens.spacing.md,
        paddingBottom: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
        marginTop: 10,
    },
    greeting: {
        fontSize: 14,
        color: '#9ca3af',
    },
    userName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    notificationBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#1a1f3a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    balanceCard: {
        borderRadius: GlassTokens.radius.xxl,
        padding: GlassTokens.spacing.lg,
        marginBottom: GlassTokens.spacing.lg,
        ...GlassTokens.shadows.glow,
    },
    balanceLabel: {
        fontSize: 14,
        color: '#e0e7ff',
        marginBottom: 8,
    },
    balanceAmount: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 24,
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
        gap: 8,
    },
    balanceDivider: {
        width: 1,
        height: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    balanceActionText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    quickActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: GlassTokens.spacing.xl,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    seeMore: {
        fontSize: 13,
        color: '#3b82f6',
        fontWeight: '600',
    },
    emptyCard: {
        backgroundColor: GlassTokens.colors.backgroundSecondary,
        borderRadius: GlassTokens.radius.lg,
        padding: GlassTokens.spacing.lg,
        alignItems: 'center',
        marginBottom: GlassTokens.spacing.lg,
    },
    emptyText: {
        color: '#9ca3af',
        marginBottom: 16,
    },
    syncBtn: {
        backgroundColor: GlassTokens.colors.primary,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: GlassTokens.radius.md,
    },
    syncBtnText: {
        color: '#fff',
        fontWeight: '600',
    },
    loader: {
        marginVertical: GlassTokens.spacing.md,
    },
    transactionsCard: {
        padding: GlassTokens.spacing.md,
        marginBottom: GlassTokens.spacing.xl,
    },
    walletChipContainer: {
        marginBottom: GlassTokens.spacing.md,
        paddingHorizontal: GlassTokens.spacing.sm,
    },
    walletChip: {
        paddingHorizontal: GlassTokens.spacing.md,
        paddingVertical: GlassTokens.spacing.sm,
        borderRadius: GlassTokens.radius.full,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginRight: GlassTokens.spacing.sm,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    walletChipSelected: {
        backgroundColor: GlassTokens.colors.primary,
        borderColor: GlassTokens.colors.primary,
    },
    walletChipText: {
        color: GlassTokens.colors.textSecondary,
        fontSize: 13,
        fontWeight: '500',
    },
    walletChipTextSelected: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
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
        fontWeight: '600',
        color: '#fff',
        marginBottom: 2,
    },
    transDate: {
        fontSize: 12,
        color: '#6b7280',
    },
    transAmount: {
        fontSize: 15,
        fontWeight: 'bold',
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
