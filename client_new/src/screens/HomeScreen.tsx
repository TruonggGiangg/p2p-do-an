import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { authAPI, healthAPI } from '../services/endpoints.api';

export default function HomeScreen() {
    const { user, logout, isLoading: authLoading } = useAuth();
    const [testing, setTesting] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<{ [key: string]: any }>({});

    const runTest = async (testName: string, testFn: () => Promise<any>) => {
        setTesting(testName);
        try {
            const result = await testFn();
            setTestResults((prev) => ({
                ...prev,
                [testName]: { success: true, data: result },
            }));
            Alert.alert('✅ Thành công', `Test "${testName}" hoàn tất!\n\nKết quả: ${JSON.stringify(result, null, 2).substring(0, 200)}...`);
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

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>🧪 API Testing Dashboard</Text>
                    <Text style={styles.subtitle}>{user?.name || user?.username}</Text>
                </View>

                {/* User Info Card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>👤 Thông tin Người dùng</Text>
                    <InfoRow label="Số điện thoại" value={user?.username || ''} />
                    <InfoRow label="Email" value={user?.email || 'Chưa cập nhật'} />
                    <InfoRow label="Vai trò" value={user?.roles?.join(', ') || 'Người dùng'} />
                    {user?.fineractClientId && (
                        <InfoRow label="Fineract Client ID" value={String(user.fineractClientId)} />
                    )}
                </View>

                {/* API Tests */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>🔍 Auth API Tests</Text>

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

                {/* Footer Note */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        💡 Tip: Nhấn vào các nút test để kiểm tra API endpoints
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
        <Text style={styles.infoValue}>{value}</Text>
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
        padding: 20,
        paddingBottom: 40,
    },
    header: {
        marginBottom: 24,
        alignItems: 'center',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: '#a0aec0',
    },
    card: {
        backgroundColor: '#1a1f3a',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
        borderWidth: 1,
        borderColor: '#2d3748',
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 16,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#2d3748',
    },
    infoLabel: {
        fontSize: 14,
        color: '#a0aec0',
        fontWeight: '600',
    },
    infoValue: {
        fontSize: 14,
        color: '#fff',
        fontWeight: '500',
        flexShrink: 1,
        textAlign: 'right',
        marginLeft: 12,
    },
    testButton: {
        backgroundColor: '#4a5568',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderWidth: 2,
        borderColor: '#718096',
    },
    testButtonTesting: {
        backgroundColor: '#fbbf24',
        borderColor: '#f59e0b',
    },
    testButtonSuccess: {
        backgroundColor: '#10b981',
        borderColor: '#059669',
    },
    testButtonError: {
        backgroundColor: '#ef4444',
        borderColor: '#dc2626',
    },
    testButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    testButtonIcon: {
        fontSize: 18,
        marginRight: 12,
    },
    testButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
    },
    spinner: {
        marginLeft: 8,
    },
    logoutButton: {
        backgroundColor: '#ef4444',
        borderRadius: 12,
        padding: 18,
        alignItems: 'center',
        marginTop: 8,
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
        borderWidth: 2,
        borderColor: '#dc2626',
    },
    logoutButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    footer: {
        marginTop: 24,
        padding: 16,
        backgroundColor: '#1a1f3a',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#2d3748',
    },
    footerText: {
        color: '#a0aec0',
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 20,
    },
});
