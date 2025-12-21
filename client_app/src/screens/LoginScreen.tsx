import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { TextInput, Button, Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { DarkColors, DarkStyling } from '../theme';

interface LoginScreenProps {
    navigation: any;
}

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
        <LinearGradient
            colors={[DarkColors.background, DarkColors.surface]}
            style={styles.container}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* Logo & Header */}
                    <View style={styles.header}>
                        <LinearGradient
                            colors={DarkColors.gradientPrimary}
                            style={styles.logoContainer}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <Text style={styles.logoText}>P2P</Text>
                        </LinearGradient>
                        <Text style={styles.title}>Welcome Back</Text>
                        <Text style={styles.subtitle}>Đăng nhập để tiếp tục</Text>
                    </View>

                    {/* Login Card */}
                    <View style={styles.card}>
                        {/* Phone Input */}
                        <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>Số điện thoại</Text>
                            <TextInput
                                value={username}
                                onChangeText={setUsername}
                                mode="flat"
                                keyboardType="phone-pad"
                                style={styles.input}
                                contentStyle={styles.inputContent}
                                underlineColor="transparent"
                                activeUnderlineColor={DarkColors.primary}
                                textColor={DarkColors.text}
                                placeholder="Nhập số điện thoại"
                                placeholderTextColor={DarkColors.textMuted}
                                left={<TextInput.Icon icon="phone" color={DarkColors.textSecondary} />}
                            />
                        </View>

                        {/* Password Input */}
                        <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>Mật khẩu</Text>
                            <TextInput
                                value={password}
                                onChangeText={setPassword}
                                mode="flat"
                                secureTextEntry={!showPassword}
                                style={styles.input}
                                contentStyle={styles.inputContent}
                                underlineColor="transparent"
                                activeUnderlineColor={DarkColors.primary}
                                textColor={DarkColors.text}
                                placeholder="Nhập mật khẩu"
                                placeholderTextColor={DarkColors.textMuted}
                                left={<TextInput.Icon icon="lock" color={DarkColors.textSecondary} />}
                                right={
                                    <TextInput.Icon
                                        icon={showPassword ? 'eye-off' : 'eye'}
                                        onPress={() => setShowPassword(!showPassword)}
                                        color={DarkColors.textSecondary}
                                    />
                                }
                            />
                        </View>

                        {/* Error Message */}
                        {error ? (
                            <View style={styles.errorContainer}>
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        ) : null}

                        {/* Login Button */}
                        <TouchableOpacity
                            onPress={handleLogin}
                            disabled={isLoading}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={isLoading ? [DarkColors.textMuted, DarkColors.textMuted] : DarkColors.gradientPrimary}
                                style={styles.loginButton}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                <Text style={styles.loginButtonText}>
                                    {isLoading ? 'Đang đăng nhập...' : 'Đăng Nhập'}
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Register Link */}
                        <TouchableOpacity
                            onPress={() => navigation.navigate('Register')}
                            style={styles.registerLink}
                        >
                            <Text style={styles.registerText}>
                                Chưa có tài khoản? <Text style={styles.registerHighlight}>Đăng ký ngay</Text>
                            </Text>
                        </TouchableOpacity>

                        {/* Divider */}
                        <View style={styles.divider}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>Tài khoản thử nghiệm</Text>
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
                            >
                                <Text style={styles.quickFillLabel}>Lender</Text>
                                <Text style={styles.quickFillNumber}>0987654321</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.quickFillBtn}
                                onPress={() => {
                                    setUsername('0329646588');
                                    setPassword('TestClient123@');
                                }}
                            >
                                <Text style={styles.quickFillLabel}>Borrower</Text>
                                <Text style={styles.quickFillNumber}>0329646588</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        padding: 24,
        justifyContent: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    logoContainer: {
        width: 80,
        height: 80,
        borderRadius: DarkStyling.borderRadius.lg,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        ...DarkStyling.shadow.card,
    },
    logoText: {
        color: DarkColors.white,
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
    },
    title: {
        fontSize: 32,
        fontFamily: 'Poppins_700Bold',
        color: DarkColors.text,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
        color: DarkColors.textSecondary,
    },
    card: {
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.xl,
        padding: 24,
        borderWidth: 1,
        borderColor: DarkColors.border,
        ...DarkStyling.shadow.card,
    },
    inputContainer: {
        marginBottom: 20,
    },
    inputLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: DarkColors.textSecondary,
        marginBottom: 8,
    },
    input: {
        backgroundColor: DarkColors.surfaceLight,
        borderRadius: DarkStyling.borderRadius.sm,
        fontSize: 16,
    },
    inputContent: {
        fontFamily: 'Poppins_400Regular',
        paddingLeft: 8,
    },
    errorContainer: {
        backgroundColor: `${DarkColors.error}15`,
        borderRadius: DarkStyling.borderRadius.sm,
        padding: 12,
        marginBottom: 16,
    },
    errorText: {
        color: DarkColors.error,
        textAlign: 'center',
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
    },
    loginButton: {
        borderRadius: DarkStyling.borderRadius.sm,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 8,
        ...DarkStyling.shadow.subtle,
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
        marginVertical: 24,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: DarkColors.border,
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
        backgroundColor: DarkColors.surfaceLight,
        borderRadius: DarkStyling.borderRadius.sm,
        padding: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    quickFillLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: DarkColors.primary,
        marginBottom: 4,
    },
    quickFillNumber: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: DarkColors.textSecondary,
    },
});
