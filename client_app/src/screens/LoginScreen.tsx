import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    Animated,
    Easing,
    StatusBar,
} from 'react-native';
import { TextInput, Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { DarkColors, DarkStyling, DarkGradients } from '../theme';

const { width, height } = Dimensions.get('window');

interface LoginScreenProps {
    navigation: any;
}

// No animation components - clean simple design

export default function LoginScreen({ navigation }: LoginScreenProps) {
    const { login, isLoading } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

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
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            {/* BACKGROUND GRADIENT */}
            <LinearGradient
                colors={['#0a0e27', '#1a1230', '#0a0e27']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={{ flex: 1 }}>
                        {/* HEADER */}
                        <View style={styles.header}>
                            {/* Logo */}
                            <View style={styles.logoContainer}>
                                <LinearGradient
                                    colors={DarkGradients.primaryButton}
                                    style={styles.logoIcon}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                >
                                    <MaterialCommunityIcons name="flash" size={28} color="#fff" />
                                </LinearGradient>
                                <Text style={styles.logoText}>P2P Lending</Text>
                            </View>
                        </View>

                        {/* HERO TITLE */}
                        <View style={styles.heroSection}>
                            <Text style={styles.heroTitle}>CHÀO MỪNG TRỞ LẠI</Text>
                            <Text style={styles.heroSubtitle}>Kết nối tài chính thông minh</Text>
                        </View>

                        {/* GLASS CARD */}
                        <BlurView intensity={25} tint="dark" style={styles.glassCard}>
                            <LinearGradient
                                colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
                                style={styles.cardGradient}
                            >
                                {/* Inner glow decoration */}
                                <View style={styles.innerGlow} />

                                {/* Input Form */}
                                <View style={styles.inputGroup}>
                                    {/* Phone Input */}
                                    <View style={styles.inputContainer}>
                                        <Text style={styles.inputLabel}>Số điện thoại</Text>
                                        <View style={styles.inputWrapper}>
                                            <Ionicons name="phone-portrait" size={20} color={DarkColors.textSecondary} style={styles.inputIcon} />
                                            <TextInput
                                                value={username}
                                                onChangeText={setUsername}
                                                mode="flat"
                                                keyboardType="phone-pad"
                                                style={styles.input}
                                                contentStyle={styles.inputContent}
                                                underlineColor="transparent"
                                                activeUnderlineColor="transparent"
                                                textColor={DarkColors.text}
                                                placeholder="0987 654 321"
                                                placeholderTextColor={DarkColors.textMuted}
                                            />
                                        </View>
                                    </View>

                                    {/* Password Input */}
                                    <View style={styles.inputContainer}>
                                        <Text style={styles.inputLabel}>Mật khẩu</Text>
                                        <View style={styles.inputWrapper}>
                                            <Ionicons name="lock-closed" size={20} color={DarkColors.textSecondary} style={styles.inputIcon} />
                                            <TextInput
                                                value={password}
                                                onChangeText={setPassword}
                                                mode="flat"
                                                secureTextEntry={!showPassword}
                                                style={styles.input}
                                                contentStyle={styles.inputContent}
                                                underlineColor="transparent"
                                                activeUnderlineColor="transparent"
                                                textColor={DarkColors.text}
                                                placeholder="••••••••"
                                                placeholderTextColor={DarkColors.textMuted}
                                            />
                                            <TouchableOpacity
                                                onPress={() => setShowPassword(!showPassword)}
                                                style={styles.eyeButton}
                                            >
                                                <Ionicons
                                                    name={showPassword ? 'eye-off' : 'eye'}
                                                    size={22}
                                                    color={DarkColors.textSecondary}
                                                />
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    {/* Error Message */}
                                    {error ? (
                                        <View style={styles.errorContainer}>
                                            <Ionicons name="warning" size={16} color={DarkColors.error} />
                                            <Text style={styles.errorText}>{error}</Text>
                                        </View>
                                    ) : null}

                                    {/* Login Button */}
                                    <TouchableOpacity
                                        onPress={handleLogin}
                                        disabled={isLoading}
                                        activeOpacity={0.8}
                                        style={styles.buttonShadow}
                                    >
                                        <LinearGradient
                                            colors={isLoading ? ['#444', '#333'] : DarkGradients.primaryButton}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={styles.loginButton}
                                        >
                                            {isLoading ? (
                                                <Text style={styles.loginButtonText}>Đang đăng nhập...</Text>
                                            ) : (
                                                <>
                                                    <Ionicons name="log-in" size={20} color="#fff" style={{ marginRight: 8 }} />
                                                    <Text style={styles.loginButtonText}>Đăng Nhập</Text>
                                                </>
                                            )}
                                        </LinearGradient>
                                    </TouchableOpacity>

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
                                </View>

                                {/* Divider */}
                                <View style={styles.divider}>
                                    <View style={styles.dividerLine} />
                                    <Text style={styles.dividerText}>Tài khoản demo</Text>
                                    <View style={styles.dividerLine} />
                                </View>

                                {/* Quick Fill Buttons */}
                                <View style={styles.quickFillRow}>
                                    <TouchableOpacity
                                        style={styles.quickFillBtn}
                                        onPress={() => {
                                            setUsername('0987654321');
                                            setPassword('TestClient123@');
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <MaterialCommunityIcons name="hand-coin" size={20} color={DarkColors.accent} />
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
                                        <MaterialCommunityIcons name="account-cash" size={20} color={DarkColors.success} />
                                        <Text style={styles.quickFillLabel}>Người vay</Text>
                                        <Text style={styles.quickFillNumber}>0329646588</Text>
                                    </TouchableOpacity>
                                </View>
                            </LinearGradient>
                        </BlurView>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: DarkColors.background,
    },
    scrollContent: {
        flexGrow: 1,
        padding: 24,
        paddingTop: 60,
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    logoIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        ...DarkStyling.shadow.glow,
    },
    logoText: {
        color: DarkColors.text,
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 0.5,
    },
    heroSection: {
        alignItems: 'center',
        marginBottom: 24,
    },
    heroTitle: {
        fontSize: 26,
        fontFamily: 'Poppins_700Bold',
        color: DarkColors.text,
        textAlign: 'center',
        marginBottom: 8,
        textShadowColor: DarkColors.primaryGlow,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 20,
    },
    heroSubtitle: {
        color: DarkColors.textSecondary,
        textAlign: 'center',
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
    },
    glassCard: {
        borderRadius: 28,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    cardGradient: {
        padding: 24,
    },
    innerGlow: {
        position: 'absolute',
        top: '50%',
        left: '30%',
        width: 150,
        height: 150,
        backgroundColor: DarkColors.primary,
        opacity: 0.08,
        borderRadius: 100,
        transform: [{ scale: 1.5 }],
    },
    inputGroup: {
        marginBottom: 16,
    },
    inputContainer: {
        marginBottom: 16,
    },
    inputLabel: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: DarkColors.textSecondary,
        marginBottom: 8,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 12,
    },
    inputIcon: {
        marginRight: 8,
    },
    input: {
        flex: 1,
        backgroundColor: 'transparent',
        fontSize: 15,
        height: 52,
    },
    inputContent: {
        fontFamily: 'Poppins_400Regular',
    },
    eyeButton: {
        padding: 8,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${DarkColors.error}15`,
        borderRadius: 10,
        padding: 12,
        marginBottom: 16,
        gap: 8,
    },
    errorText: {
        color: DarkColors.error,
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
    },
    buttonShadow: {
        shadowColor: DarkColors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 10,
    },
    loginButton: {
        borderRadius: 14,
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    loginButtonText: {
        color: DarkColors.white,
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
    registerLink: {
        alignItems: 'center',
        marginTop: 20,
    },
    registerText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: DarkColors.textSecondary,
    },
    registerHighlight: {
        color: DarkColors.primary,
        fontFamily: 'Poppins_600SemiBold',
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    dividerText: {
        marginHorizontal: 12,
        color: DarkColors.textMuted,
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
        borderRadius: 14,
        padding: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    quickFillLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: DarkColors.text,
        marginTop: 8,
        marginBottom: 4,
    },
    quickFillNumber: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: DarkColors.textMuted,
    },
});
