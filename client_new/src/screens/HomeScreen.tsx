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
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { walletAPI } from '../services/wallet.api';
import { WalletCard } from '../components/WalletCard';
import { Ionicons } from '@expo/vector-icons';
import type { Wallet } from '../types/auth.types';

const { width } = Dimensions.get('window');

export default function HomeScreen({ navigation }: any) {
    const { user, logout, refreshUser, isLoading: authLoading } = useAuth();
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [walletsLoading, setWalletsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Fetch wallets on mount
    useEffect(() => {
        fetchWallets();
    }, []);

    const fetchWallets = async () => {
        setWalletsLoading(true);
        try {
            const response = await walletAPI.getWallets();
            // The response structure should match WalletsResponse from types
            const walletData = response.data?.wallets || response.wallets || [];
            setWallets(walletData);
        } catch (error: any) {
            console.log('Failed to fetch wallets:', error.message);
        } finally {
            setWalletsLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([refreshUser(), fetchWallets()]);
        setRefreshing(false);
    }, [refreshUser]);

    const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
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
                <View style={styles.balanceCard}>
                    <Text style={styles.balanceLabel}>Tổng số dư khả dụng</Text>
                    <Text style={styles.balanceAmount}>{formatCurrency(totalBalance)}</Text>
                    <View style={styles.balanceActions}>
                        <TouchableOpacity style={styles.balanceActionBtn}>
                            <Ionicons name="add-circle-outline" size={22} color="#fff" />
                            <Text style={styles.balanceActionText}>Nạp tiền</Text>
                        </TouchableOpacity>
                        <View style={styles.balanceDivider} />
                        <TouchableOpacity style={styles.balanceActionBtn}>
                            <Ionicons name="arrow-forward-circle-outline" size={22} color="#fff" />
                            <Text style={styles.balanceActionText}>Chuyển tiền</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Quick Actions */}
                <View style={styles.quickActions}>
                    {[
                        { id: 'qr', icon: 'qr-code-outline', label: 'Quét mã', color: '#8b5cf6' },
                        { id: 'bnpl', icon: 'card-outline', label: 'Ví Trả Sau', color: '#ec4899', onPress: () => navigation.navigate('BNPL') },
                        { id: 'phone', icon: 'phone-portrait-outline', label: 'Nạp ĐT', color: '#3b82f6' },
                        { id: 'grid', icon: 'grid-outline', label: 'Tất cả', color: '#10b981' },
                    ].map((action) => (
                        <QuickAction key={action.id} icon={action.icon} label={action.label} color={action.color} onPress={action.onPress} />
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
                    <ActivityIndicator color="#3b82f6" style={styles.loader} />
                ) : wallets.length > 0 ? (
                    <>
                        {wallets.map((wallet) => (
                            <WalletCard key={wallet._id} wallet={wallet} />
                        ))}
                    </>
                ) : (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>Chưa có thông tin ví điện tử</Text>
                        <TouchableOpacity style={styles.syncBtn} onPress={() => walletAPI.syncWallets().then(onRefresh)}>
                            <Text style={styles.syncBtnText}>Đồng bộ ngay</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Recent Transactions Section (Mockup) */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Giao dịch gần đây</Text>
                    <TouchableOpacity>
                        <Text style={styles.seeMore}>Tất cả</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.transactionsCard}>
                    <TransactionItem key="tx1" type="income" title="Nạp tiền từ ngân hàng" date="19 Jan 2026" amount="+5.000.000 ₫" />
                    <TransactionItem key="tx2" type="expense" title="Thanh toán Ví Trả Sau" date="18 Jan 2026" amount="-1.250.000 ₫" />
                    <TransactionItem key="tx3" type="expense" title="Nạp tiền điện thoại" date="15 Jan 2026" amount="-100.000 ₫" />
                </View>

                {/* System Info Section (Restoring old functions) */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>⚙️ Hệ thống & Đồng bộ</Text>
                </View>

                <View style={styles.systemCard}>
                    <View key="sync-status" style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Trạng thái đồng bộ:</Text>
                        <Text style={[styles.infoValue, { color: user?.metadata?.syncStatus === 'complete' ? '#10b981' : '#f59e0b' }]}>
                            {user?.metadata?.syncStatus || 'Chưa rõ'}
                        </Text>
                    </View>
                    <View key="client-id" style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Fineract Client ID:</Text>
                        <Text style={styles.infoValue}>{String(user?.fineractClientId || 'N/A')}</Text>
                    </View>

                    <TouchableOpacity
                        style={styles.syncBtnSmall}
                        onPress={() => {
                            Alert.alert('Đang đồng bộ', 'Hệ thống đang đồng bộ lại dữ liệu từ Fineract...');
                            walletAPI.syncWallets().then(onRefresh);
                        }}
                    >
                        <Ionicons name="sync-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={styles.syncBtnTextSmall}>Đồng bộ thủ công</Text>
                    </TouchableOpacity>
                </View>

                {/* Logout Button */}
                <TouchableOpacity
                    style={styles.logoutButton}
                    onPress={logout}
                    disabled={authLoading}
                >
                    <Text style={styles.logoutButtonText}>
                        {authLoading ? 'Đang đăng xuất...' : '🚪 Đăng xuất'}
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

// ==================== SUB-COMPONENTS ====================

const QuickAction = ({ icon, label, color, onPress }: any) => (
    <TouchableOpacity style={styles.actionItem} onPress={onPress}>
        <View style={[styles.actionIcon, { backgroundColor: color }]}>
            <Ionicons name={icon} size={24} color="#fff" />
        </View>
        <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
);

const TransactionItem = ({ type, title, date, amount }: any) => (
    <View style={styles.transactionRow}>
        <View style={[styles.transIcon, { backgroundColor: type === 'income' ? '#d1fae5' : '#fee2e2' }]}>
            <Ionicons
                name={type === 'income' ? 'arrow-down' : 'arrow-up'}
                size={18}
                color={type === 'income' ? '#059669' : '#dc2626'}
            />
        </View>
        <View style={styles.transContent}>
            <Text style={styles.transTitle}>{title}</Text>
            <Text style={styles.transDate}>{date}</Text>
        </View>
        <Text style={[styles.transAmount, { color: type === 'income' ? '#10b981' : '#fff' }]}>
            {amount}
        </Text>
    </View>
);

// ==================== STYLES ====================

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0e27',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
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
        backgroundColor: '#3b82f6',
        borderRadius: 24,
        padding: 24,
        marginBottom: 24,
        elevation: 8,
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
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
        marginBottom: 32,
    },
    actionItem: {
        alignItems: 'center',
        width: (width - 64) / 4,
    },
    actionIcon: {
        width: 54,
        height: 54,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    actionLabel: {
        fontSize: 12,
        color: '#9ca3af',
        fontWeight: '500',
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
    loader: {
        marginVertical: 20,
    },
    emptyCard: {
        backgroundColor: '#1a1f3a',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        marginBottom: 24,
    },
    emptyText: {
        color: '#9ca3af',
        marginBottom: 16,
    },
    syncBtn: {
        backgroundColor: '#3b82f6',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 10,
    },
    syncBtnText: {
        color: '#fff',
        fontWeight: '600',
    },
    transactionsCard: {
        backgroundColor: '#1a1f3a',
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
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
