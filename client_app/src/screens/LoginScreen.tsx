import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    TouchableOpacity,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { GradientBackground, GlassCard, GlassButton, GlassTokens } from '../components/glass';
import { GlassInput } from '../components/common';
import { UnifiedSpacing, UnifiedRadius } from '../theme';

interface LoginScreenProps {
    navigation: any;
}

export default function LoginScreen({ navigation }: LoginScreenProps) {
    const { login, isLoading } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async () => {
        if (!username || !password) {
            setError('Vui lòng nhập số điện thoại và mật khẩu');
            return;
        }

        try {
            setError('');
            await login(username, password);
        } catch (err: any) {
            console.error('Login error:', err);
            setError(err.response?.data?.message || 'Đăng nhập thất bại. Vui lòng thử lại.');
        }
    };

    return (
        <GradientBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.logoContainer}>
                            <View style={styles.logoIcon}>
                                <MaterialCommunityIcons name="flash" size={28} color="#fff" />
                            </View>
                            <Text style={styles.logoText}>P2P Lending</Text>
                        </View>
                    </View>

                    {/* Hero Title */}
                    <View style={styles.heroSection}>
                        <Text style={styles.heroTitle}>CHÀO MỪNG TRỞ LẠI</Text>
                        <Text style={styles.heroSubtitle}>Kết nối tài chính thông minh</Text>
                    </View>

                    {/* Login Form Card */}
                    <GlassCard blur={GlassTokens.blur.medium}>
                        <GlassInput
                            label="Số điện thoại"
                            value={username}
                            onChangeText={setUsername}
                            keyboardType="phone-pad"
                            placeholder="0987 654 321"
                            icon="phone-portrait"
                        />

                        <GlassInput
                            label="Mật khẩu"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            placeholder="••••••••"
                            icon="lock-closed"
                        />

                        {/* Error Message */}
                        {error ? (
                            <View style={styles.errorContainer}>
                                <Ionicons name="warning" size={16} color={GlassTokens.colors.error} />
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        ) : null}

                        {/* Login Button */}
                        <GlassButton
                            title={isLoading ? 'Đang đăng nhập...' : 'ĐĂNG NHẬP'}
                            onPress={handleLogin}
                            disabled={isLoading}
                            loading={isLoading}
                            icon="login"
                            variant="primary"
                        />

                        {/* Register Link */}
                        <TouchableOpacity
                            onPress={() => navigation.navigate('Register')}
                            style={styles.registerLink}
                        >
                            <Text style={styles.registerText}>
                                Chưa có tài khoản?{' '}
                                <Text style={styles.registerHighlight}>Đăng ký ngay</Text>
                            </Text>
                        </TouchableOpacity>
                    </GlassCard>

                    {/* Demo Accounts */}
                    <GlassCard variant="primary" blur={GlassTokens.blur.light}>
                        <View style={styles.divider}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>Tài khoản demo</Text>
                            <View style={styles.dividerLine} />
                        </View>

                        <View style={styles.quickFillRow}>
                            <TouchableOpacity
                                style={styles.quickFillBtn}
                                onPress={() => {
                                    setUsername('0987654321');
                                    setPassword('TestClient123@');
                                }}
                                activeOpacity={0.7}
                            >
                                <MaterialCommunityIcons name="hand-coin" size={20} color={GlassTokens.colors.accent} />
                                <Text style={styles.quickFillLabel}>Nhà đầu tư</Text>
                                <Text style={styles.quickFillNumber}>0987654321</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.quickFillBtn}
                                onPress={() => {
                                    setUsername('0329646588');
                                    setPassword('TestClient123@');
                                }}
                                activeOpacity={0.7}
                            >
                                <MaterialCommunityIcons name="account-cash" size={20} color={GlassTokens.colors.success} />
                                <Text style={styles.quickFillLabel}>Người vay</Text>
                                <Text style={styles.quickFillNumber}>0329646588</Text>
                            </TouchableOpacity>
                        </View>
                    </GlassCard>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        flexGrow: 1,
        padding: UnifiedSpacing.lg,
        paddingTop: 60,
    },
    header: {
        alignItems: 'center',
        marginBottom: UnifiedSpacing.lg,
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: UnifiedSpacing.md,
    },
    logoIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        backgroundColor: GlassTokens.colors.primary,
    },
    logoText: {
        color: GlassTokens.colors.textPrimary,
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 0.5,
    },
    heroSection: {
        alignItems: 'center',
        marginBottom: UnifiedSpacing.xl,
    },
    heroTitle: {
        fontSize: 26,
        fontFamily: 'Poppins_700Bold',
        color: GlassTokens.colors.textPrimary,
        textAlign: 'center',
        marginBottom: 8,
        textShadowColor: GlassTokens.colors.primaryGlow,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 20,
    },
    heroSubtitle: {
        color: GlassTokens.colors.textSecondary,
        textAlign: 'center',
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${GlassTokens.colors.error}15`,
        borderRadius: 10,
        padding: 12,
        marginBottom: 16,
        gap: 8,
    },
    errorText: {
        color: GlassTokens.colors.error,
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
    },
    registerLink: {
        alignItems: 'center',
        marginTop: 20,
    },
    registerText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: GlassTokens.colors.textSecondary,
    },
    registerHighlight: {
        color: GlassTokens.colors.primary,
        fontFamily: 'Poppins_600SemiBold',
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: UnifiedSpacing.md,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    dividerText: {
        marginHorizontal: 12,
        color: GlassTokens.colors.textMuted,
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    quickFillRow: {
        flexDirection: 'row',
        gap: 12,
    },
    quickFillBtn: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: UnifiedRadius.md,
        padding: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    quickFillLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: GlassTokens.colors.textPrimary,
        marginTop: 8,
        marginBottom: 4,
    },
    quickFillNumber: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: GlassTokens.colors.textMuted,
    },
});
