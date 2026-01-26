import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    TouchableOpacity,
    Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../../contexts/AuthContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { GradientBackground, GlassCard, FloatingLabelInput, GlassButton, CustomHeader } from '../../../components';
import { LinearGradient } from 'expo-linear-gradient';

export default function LoginScreen() {
    const navigation = useNavigation();
    const { login, isLoading } = useAuth();
    const { theme } = useTheme();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [fadeAnim] = useState(new Animated.Value(0));

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
        }).start();
    }, [fadeAnim]);

    const handleUsernameChange = useCallback((text: string) => {
        setUsername(text);
        setError('');
    }, []);

    const handlePasswordChange = useCallback((text: string) => {
        setPassword(text);
        setError('');
    }, []);

    const handleLogin = useCallback(async () => {
        if (!username.trim() || !password.trim()) {
            setError('Vui lòng nhập đầy đủ thông tin');
            return;
        }

        try {
            setError('');
            await login({ username, password });
        } catch (err: any) {
            setError(err.message || 'Đăng nhập thất bại. Vui lòng thử lại.');
        }
    }, [username, password, login]);

    const usernameError = useMemo(() => (error && !password ? error : undefined), [error, password]);
    const passwordError = useMemo(() => (error && password ? error : undefined), [error, password]);

    return (
        <GradientBackground>
            <CustomHeader title="Đăng nhập" />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                        {/* Logo & Header */}
                        <View style={styles.header}>
                            <View style={styles.logoContainer}>
                                <LinearGradient
                                    colors={theme.gradients.primary as any}
                                    style={styles.logoIcon}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                >
                                    <MaterialCommunityIcons
                                        name="flash"
                                        size={32}
                                        color="#fff"
                                    />
                                </LinearGradient>
                                <Text style={[styles.logoText, { color: theme.colors.textPrimary }]}>
                                    P2P Lending
                                </Text>
                            </View>
                        </View>

                        {/* Hero Section */}
                        <View style={styles.heroSection}>
                            <Text style={[styles.heroTitle, { color: theme.colors.textPrimary }]}>
                                Chào mừng trở lại
                            </Text>
                            <Text style={[styles.heroSubtitle, { color: theme.colors.textSecondary }]}>
                                Kết nối tài chính thông minh
                            </Text>
                        </View>

                        {/* Login Form Card */}
                        <GlassCard blur={theme.blur.medium} style={styles.formCard}>
                            <FloatingLabelInput
                                label="Số điện thoại"
                                value={username}
                                onChangeText={handleUsernameChange}
                                keyboardType="phone-pad"
                                autoComplete="tel"
                                textContentType="telephoneNumber"
                                autoCapitalize="none"
                                autoCorrect={false}
                                placeholder=""
                                icon="phone"
                                error={usernameError}
                                editable={!isLoading}
                            />

                            <FloatingLabelInput
                                label="Mật khẩu"
                                value={password}
                                onChangeText={handlePasswordChange}
                                secureTextEntry
                                placeholder=""
                                icon="lock"
                                error={passwordError}
                                editable={!isLoading}
                            />

                            {/* Error Message */}
                            {error && username && password && (
                                <View
                                    style={[
                                        styles.errorContainer,
                                        {
                                            backgroundColor: theme.colors.errorGlass,
                                            borderColor: theme.colors.errorBorder,
                                            borderRadius: theme.radius.md,
                                        },
                                    ]}
                                >
                                    <MaterialCommunityIcons
                                        name="alert-circle"
                                        size={16}
                                        color={theme.colors.error}
                                    />
                                    <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
                                </View>
                            )}

                            {/* Login Button */}
                            <GlassButton
                                title={isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                                onPress={handleLogin}
                                disabled={isLoading || !username.trim() || !password.trim()}
                                loading={isLoading}
                                icon="login"
                                variant="primary"
                                style={styles.loginButton}
                            />

                            {/* Register Link */}
                            <TouchableOpacity
                                onPress={useCallback(() => {
                                    navigation.navigate('Register' as never);
                                }, [navigation])}
                                style={styles.registerLink}
                                disabled={isLoading}
                            >
                                <Text style={[styles.registerText, { color: theme.colors.textSecondary }]}>
                                    Chưa có tài khoản?{' '}
                                    <Text style={[styles.registerHighlight, { color: theme.colors.primary }]}>
                                        Đăng ký ngay
                                    </Text>
                                </Text>
                            </TouchableOpacity>
                        </GlassCard>

                        {/* Demo Accounts - Compact Design */}
                        {__DEV__ && (
                            <GlassCard variant="primary" blur={theme.blur.light} style={styles.demoCard}>
                                <View style={styles.demoHeader}>
                                    <MaterialCommunityIcons
                                        name="lightning-bolt"
                                        size={18}
                                        color={theme.colors.primary}
                                    />
                                    <Text style={[styles.demoTitle, { color: theme.colors.textMuted }]}>
                                        Tài khoản demo
                                    </Text>
                                </View>

                                <View style={styles.quickFillRow}>
                                    <TouchableOpacity
                                        style={[
                                            styles.quickFillBtn,
                                            {
                                                backgroundColor: theme.colors.glassLight,
                                                borderColor: theme.colors.border,
                                                borderRadius: theme.radius.md,
                                            },
                                        ]}
                                        onPress={() => {
                                            setUsername('borrower1');
                                            setPassword('password');
                                            setError('');
                                        }}
                                        disabled={isLoading}
                                        activeOpacity={0.7}
                                    >
                                        <MaterialCommunityIcons
                                            name="account-cash"
                                            size={20}
                                            color={theme.colors.success}
                                        />
                                        <Text style={[styles.quickFillLabel, { color: theme.colors.textPrimary }]}>
                                            Người vay
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[
                                            styles.quickFillBtn,
                                            {
                                                backgroundColor: theme.colors.glassLight,
                                                borderColor: theme.colors.border,
                                                borderRadius: theme.radius.md,
                                            },
                                        ]}
                                        onPress={() => {
                                            setUsername('investor1');
                                            setPassword('password');
                                            setError('');
                                        }}
                                        disabled={isLoading}
                                        activeOpacity={0.7}
                                    >
                                        <MaterialCommunityIcons
                                            name="hand-coin"
                                            size={20}
                                            color={theme.colors.primary}
                                        />
                                        <Text style={[styles.quickFillLabel, { color: theme.colors.textPrimary }]}>
                                            Nhà đầu tư
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[
                                            styles.quickFillBtn,
                                            {
                                                backgroundColor: theme.colors.glassLight,
                                                borderColor: theme.colors.border,
                                                borderRadius: theme.radius.md,
                                            },
                                        ]}
                                        onPress={() => {
                                            setUsername('merchant1');
                                            setPassword('password');
                                            setError('');
                                        }}
                                        disabled={isLoading}
                                        activeOpacity={0.7}
                                    >
                                        <MaterialCommunityIcons
                                            name="store"
                                            size={20}
                                            color={theme.colors.warning}
                                        />
                                        <Text style={[styles.quickFillLabel, { color: theme.colors.textPrimary }]}>
                                            Merchant
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </GlassCard>
                        )}

                        <View style={{ height: theme.spacing.xl }} />
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        padding: 24,
        paddingTop: 20,
        paddingHorizontal: 24,
        width: '100%',
        maxWidth: '100%',
    },
    content: {
        flex: 1,
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
        marginTop: 20,
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    logoIcon: {
        width: 64,
        height: 64,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        ...{
            shadowColor: '#8b5cf6',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 16,
            elevation: 8,
        },
    },
    logoText: {
        fontSize: 26,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 0.5,
    },
    heroSection: {
        alignItems: 'center',
        marginBottom: 40,
    },
    heroTitle: {
        fontSize: 32,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
        marginBottom: 8,
        letterSpacing: 0.5,
    },
    heroSubtitle: {
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },
    formCard: {
        marginBottom: 24,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        marginBottom: 16,
        gap: 8,
        borderWidth: 1,
    },
    errorText: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
        flex: 1,
    },
    loginButton: {
        marginTop: 8,
    },
    registerLink: {
        alignItems: 'center',
        marginTop: 24,
    },
    registerText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    registerHighlight: {
        fontFamily: 'Poppins_600SemiBold',
    },
    demoCard: {
        marginBottom: 0,
    },
    demoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        gap: 8,
    },
    demoTitle: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    quickFillRow: {
        flexDirection: 'row',
        gap: 12,
    },
    quickFillBtn: {
        flex: 1,
        padding: 14,
        alignItems: 'center',
        borderWidth: 1,
        gap: 8,
    },
    quickFillLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
});
