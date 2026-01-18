import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    Alert,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { authAPI, healthAPI } from '../services/endpoints.api';
import { walletAPI } from '../services/wallet.api';
import { WalletCard } from '../components/WalletCard';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import { RoleBadges } from '../components/RoleBadge';
import type { Wallet } from '../types/auth.types';

export default function HomeScreen() {
    const { user, logout, refreshUser, isLoading: authLoading } = useAuth();
    const [testing, setTesting] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<{ [key: string]: any }>({});
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
            setWallets(response.data?.wallets || response.wallets || []);
        } catch (error: any) {
            console.log('Failed to fetch wallets:', error.message);
            // Don't show error - wallets may not exist yet
        } finally {
            setWalletsLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([refreshUser(), fetchWallets()]);
        setRefreshing(false);
    }, [refreshUser]);

    const runTest = async (testName: string, testFn: () => Promise<any>) => {
        setTesting(testName);
        try {
            const result = await testFn();
            setTestResults((prev) => ({
                ...prev,
                [testName]: { success: true, data: result },
            }));
            Alert.alert('✅ Thành công', `Test "${testName}" hoàn tất!\n\n${JSON.stringify(result, null, 2).substring(0, 300)}...`);
        } catch (error: any) {
            setTestResults((prev) => ({
                ...prev,
                [testName]: { success: false, error: error.message },
            }));
            Alert.alert('❌ Lỗi', `Test "${testName}" thất bại!\n\n${error.message}`);
        } finally {
            setTesting(null);
        }
    };

    const handleLogout = async () => {
        await logout();
    };

    const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
                }
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>🧪 Testing Dashboard</Text>
                    <Text style={styles.subtitle}>{user?.name || user?.username}</Text>
                </View>

                {/* User Info Card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>👤 Thông tin Người dùng</Text>

                    <InfoRow label="Số điện thoại" value={user?.username || ''} />
                    <InfoRow label="Email" value={user?.email || 'Chưa cập nhật'} />

                    <View style={styles.rolesRow}>
                        <Text style={styles.infoLabel}>Vai trò:</Text>
                        <RoleBadges roles={user?.roles} size="small" />
                    </View>

                    <InfoRow label="MongoDB ID" value={user?._id || 'N/A'} />
                    <InfoRow label="Keycloak ID" value={user?.keycloakUserId || 'N/A'} />
                    <InfoRow label="Fineract Client ID" value={String(user?.fineractClientId || 'Chưa liên kết')} />
                </View>

                {/* Sync Status Card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>🔄 Trạng thái Đồng bộ</Text>
                    <SyncStatusBadge
                        status={user?.metadata?.syncStatus}
                        lastSyncAt={user?.metadata?.lastSyncAt}
                        error={user?.metadata?.syncError}
                    />

                    <TouchableOpacity
                        style={styles.syncButton}
                        onPress={() => runTest('Force Sync Wallets', async () => {
                            await walletAPI.syncWallets();
                            await fetchWallets();
                            await refreshUser();
                            return { message: 'Sync completed' };
                        })}
                        disabled={testing === 'Force Sync Wallets'}
                    >
                        {testing === 'Force Sync Wallets' ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.syncButtonText}>🔄 Đồng bộ lại</Text>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Wallets Card */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Text style={styles.cardTitle}>💰 Ví của bạn</Text>
                        <Text style={styles.walletCount}>{wallets.length} ví</Text>
                    </View>

                    {walletsLoading ? (
                        <ActivityIndicator color="#3b82f6" style={styles.loader} />
                    ) : wallets.length > 0 ? (
                        <>
                            <View style={styles.totalBalance}>
                                <Text style={styles.totalBalanceLabel}>Tổng số dư</Text>
                                <Text style={styles.totalBalanceAmount}>
                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalBalance)}
                                </Text>
                            </View>
                            {wallets.map((wallet, index) => (
                                <WalletCard key={wallet._id || index} wallet={wallet} />
                            ))}
                        </>
                    ) : (
                        <View style={styles.emptyWallets}>
                            <Text style={styles.emptyIcon}>💼</Text>
                            <Text style={styles.emptyText}>Bạn chưa có ví nào</Text>
                            <Text style={styles.emptyHint}>Ví sẽ được tạo khi bạn thực hiện giao dịch đầu tiên</Text>
                        </View>
                    )}
                </View>

                {/* API Tests - Auth */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>🔐 Auth API Tests</Text>

                    <TestButton
                        title="GET /api/auth/me"
                        onPress={() => runTest('Get Profile', authAPI.getProfile)}
                        testing={testing === 'Get Profile'}
                        result={testResults['Get Profile']}
                    />

                    <TestButton
                        title="POST /api/auth/refresh"
                        onPress={() => runTest('Refresh Token', authAPI.refresh)}
                        testing={testing === 'Refresh Token'}
                        result={testResults['Refresh Token']}
                    />
                </View>

                {/* API Tests - Wallet */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>💳 Wallet API Tests</Text>

                    <TestButton
                        title="GET /api/wallets"
                        onPress={() => runTest('Get Wallets', async () => {
                            const result = await walletAPI.getWallets();
                            await fetchWallets();
                            return result;
                        })}
                        testing={testing === 'Get Wallets'}
                        result={testResults['Get Wallets']}
                    />

                    <TestButton
                        title="POST /api/wallets (Create)"
                        onPress={() => runTest('Create Wallet', async () => {
                            const result = await walletAPI.createWallet();
                            await fetchWallets();
                            return result;
                        })}
                        testing={testing === 'Create Wallet'}
                        result={testResults['Create Wallet']}
                    />

                    <TestButton
                        title="POST /api/wallets/sync"
                        onPress={() => runTest('Sync Wallets', async () => {
                            const result = await walletAPI.syncWallets();
                            await fetchWallets();
                            return result;
                        })}
                        testing={testing === 'Sync Wallets'}
                        result={testResults['Sync Wallets']}
                    />
                </View>

                {/* API Tests - Health */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>🏥 Health API Tests</Text>

                    <TestButton
                        title="GET /api/health"
                        onPress={() => runTest('Health Check', healthAPI.check)}
                        testing={testing === 'Health Check'}
                        result={testResults['Health Check']}
                    />

                    <TestButton
                        title="GET /api/health/ready"
                        onPress={() => runTest('Readiness Check', healthAPI.ready)}
                        testing={testing === 'Readiness Check'}
                        result={testResults['Readiness Check']}
                    />
                </View>

                {/* Logout Button */}
                <TouchableOpacity
                    style={styles.logoutButton}
                    onPress={handleLogout}
                    disabled={authLoading}
                >
                    <Text style={styles.logoutButtonText}>
                        {authLoading ? 'Đang đăng xuất...' : '🚪 Đăng xuất'}
                    </Text>
                </TouchableOpacity>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        💡 Kéo xuống để làm mới dữ liệu
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

// ==================== COMPONENTS ====================

interface InfoRowProps {
    label: string;
    value: string;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value }) => (
    <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{label}:</Text>
        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
);

interface TestButtonProps {
    title: string;
    onPress: () => void;
    testing: boolean;
    result?: { success: boolean; data?: any; error?: string };
}

const TestButton: React.FC<TestButtonProps> = ({ title, onPress, testing, result }) => {
    const getStatusIcon = () => {
        if (testing) return '⏳';
        if (!result) return '▶️';
        return result.success ? '✅' : '❌';
    };

    const getButtonStyle = () => {
        if (testing) return [styles.testButton, styles.testButtonTesting];
        if (!result) return styles.testButton;
        return result.success
            ? [styles.testButton, styles.testButtonSuccess]
            : [styles.testButton, styles.testButtonError];
    };

    return (
        <TouchableOpacity
            style={getButtonStyle()}
            onPress={onPress}
            disabled={testing}
        >
            <View style={styles.testButtonContent}>
                <Text style={styles.testButtonIcon}>{getStatusIcon()}</Text>
                <Text style={styles.testButtonText}>{title}</Text>
                {testing && <ActivityIndicator size="small" color="#fff" style={styles.spinner} />}
            </View>
        </TouchableOpacity>
    );
};

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
        marginBottom: 20,
        alignItems: 'center',
    },
    title: {
        fontSize: 26,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 6,
    },
    subtitle: {
        fontSize: 15,
        color: '#9ca3af',
    },
    card: {
        backgroundColor: '#1a1f3a',
        borderRadius: 16,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#2d3748',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    cardTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 12,
    },
    walletCount: {
        fontSize: 13,
        color: '#9ca3af',
        backgroundColor: '#374151',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#2d3748',
    },
    rolesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#2d3748',
        gap: 12,
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
        flexShrink: 1,
        textAlign: 'right',
        marginLeft: 12,
        maxWidth: '60%',
    },
    syncButton: {
        backgroundColor: '#3b82f6',
        borderRadius: 10,
        padding: 14,
        alignItems: 'center',
        marginTop: 14,
    },
    syncButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    totalBalance: {
        backgroundColor: '#0f172a',
        borderRadius: 12,
        padding: 16,
        marginBottom: 14,
        alignItems: 'center',
    },
    totalBalanceLabel: {
        fontSize: 12,
        color: '#9ca3af',
        marginBottom: 4,
    },
    totalBalanceAmount: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#10b981',
    },
    emptyWallets: {
        alignItems: 'center',
        paddingVertical: 24,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 12,
    },
    emptyText: {
        fontSize: 16,
        color: '#9ca3af',
        marginBottom: 6,
    },
    emptyHint: {
        fontSize: 13,
        color: '#6b7280',
        textAlign: 'center',
    },
    loader: {
        marginVertical: 24,
    },
    testButton: {
        backgroundColor: '#4a5568',
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#6b7280',
    },
    testButtonTesting: {
        backgroundColor: '#d97706',
        borderColor: '#f59e0b',
    },
    testButtonSuccess: {
        backgroundColor: '#059669',
        borderColor: '#10b981',
    },
    testButtonError: {
        backgroundColor: '#dc2626',
        borderColor: '#ef4444',
    },
    testButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    testButtonIcon: {
        fontSize: 16,
        marginRight: 10,
    },
    testButtonText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
        flex: 1,
    },
    spinner: {
        marginLeft: 8,
    },
    logoutButton: {
        backgroundColor: '#dc2626',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 6,
        borderWidth: 1,
        borderColor: '#ef4444',
    },
    logoutButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    footer: {
        marginTop: 20,
        padding: 14,
        backgroundColor: '#1a1f3a',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#2d3748',
    },
    footerText: {
        color: '#9ca3af',
        fontSize: 12,
        textAlign: 'center',
    },
});
