import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { GradientBackground, GlassCard, GlassButton, GlassTokens } from '../components/glass';
import { GlassInput } from '../components/common';
import { UnifiedSpacing, UnifiedRadius } from '../theme';

interface RegisterScreenProps {
    navigation: any;
}

export default function RegisterScreen({ navigation }: RegisterScreenProps) {
    const { register, isLoading } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [userType, setUserType] = useState<'borrower' | 'lender'>('borrower');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleRegister = async () => {
        if (!username || !password || !email || !firstName || !lastName) {
            setError('Vui lòng điền đầy đủ thông tin');
            return;
        }

        if (password !== confirmPassword) {
            setError('Mật khẩu xác nhận không khớp');
            return;
        }

        if (password.length < 12) {
            setError('Mật khẩu phải có ít nhất 12 ký tự');
            return;
        }

        // Validate password strength
        if (!/[A-Z]/.test(password)) {
            setError('Mật khẩu phải có ít nhất 1 chữ HOA');
            return;
        }
        if (!/[a-z]/.test(password)) {
            setError('Mật khẩu phải có ít nhất 1 chữ thường');
            return;
        }
        if (!/\d/.test(password)) {
            setError('Mật khẩu phải có ít nhất 1 chữ số');
            return;
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            setError('Mật khẩu phải có ít nhất 1 ký tự đặc biệt');
            return;
        }

        try {
            setError('');
            setSuccess('');
            await register(username, password, email, firstName, lastName, userType);
            setSuccess('Đăng ký thành công! Đang chuyển đến trang đăng nhập...');
            setTimeout(() => navigation.navigate('Login'), 2000);
        } catch (err: any) {
            console.error('Register error:', err);

            // Extract meaningful error message
            let errorMessage = 'Đăng ký thất bại. Vui lòng thử lại.';

            if (err.message) {
                if (err.message.includes('already exists') || err.message.includes('duplicate')) {
                    errorMessage = 'Số điện thoại này đã được đăng ký. Vui lòng sử dụng số khác.';
                } else if (err.message.includes('password')) {
                    errorMessage = 'Mật khẩu không hợp lệ. ' + err.message;
                } else if (err.message.includes('validation')) {
                    errorMessage = 'Thông tin không hợp lệ. Vui lòng kiểm tra lại.';
                } else {
                    errorMessage = err.message;
                }
            }

            setError(errorMessage);
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
                                <MaterialCommunityIcons name="account-plus" size={28} color="#fff" />
                            </View>
                        </View>
                        <Text style={styles.title}>Đăng Ký</Text>
                        <Text style={styles.subtitle}>Tạo tài khoản mới để bắt đầu</Text>
                    </View>

                    {/* Register Form Card */}
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
                            label="Email"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            placeholder="email@example.com"
                            icon="mail"
                        />

                        {/* Name Row */}
                        <View style={styles.nameRow}>
                            <View style={{ flex: 1 }}>
                                <GlassInput
                                    label="Họ"
                                    value={firstName}
                                    onChangeText={setFirstName}
                                    placeholder="Nguyễn"
                                    containerStyle={{ marginBottom: 0 }}
                                />
                            </View>
                            <View style={{ width: 12 }} />
                            <View style={{ flex: 1 }}>
                                <GlassInput
                                    label="Tên"
                                    value={lastName}
                                    onChangeText={setLastName}
                                    placeholder="Văn A"
                                    containerStyle={{ marginBottom: 0 }}
                                />
                            </View>
                        </View>

                        <GlassInput
                            label="Mật khẩu (tối thiểu 12 ký tự)"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            placeholder="••••••••••••"
                            icon="lock-closed"
                        />

                        <GlassInput
                            label="Xác nhận mật khẩu"
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            secureTextEntry
                            placeholder="••••••••••••"
                            icon="lock-closed"
                        />

                        {/* Role Selection */}
                        <View style={styles.roleSection}>
                            <Text style={styles.roleLabel}>Loại tài khoản</Text>
                            <View style={styles.roleContainer}>
                                <TouchableOpacity
                                    style={[styles.roleButton, userType === 'borrower' && styles.roleButtonActive]}
                                    onPress={() => setUserType('borrower')}
                                    activeOpacity={0.7}
                                >
                                    <MaterialCommunityIcons
                                        name="account-cash"
                                        size={24}
                                        color={userType === 'borrower' ? GlassTokens.colors.primary : GlassTokens.colors.textSecondary}
                                    />
                                    <Text style={[styles.roleText, userType === 'borrower' && styles.roleTextActive]}>
                                        Người vay
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.roleButton, userType === 'lender' && styles.roleButtonActive]}
                                    onPress={() => setUserType('lender')}
                                    activeOpacity={0.7}
                                >
                                    <MaterialCommunityIcons
                                        name="hand-coin"
                                        size={24}
                                        color={userType === 'lender' ? GlassTokens.colors.primary : GlassTokens.colors.textSecondary}
                                    />
                                    <Text style={[styles.roleText, userType === 'lender' && styles.roleTextActive]}>
                                        Nhà đầu tư
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Error Message */}
                        {error ? (
                            <View style={styles.errorContainer}>
                                <MaterialCommunityIcons name="alert-circle" size={16} color={GlassTokens.colors.error} />
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        ) : null}

                        {/* Register Button */}
                        <GlassButton
                            title={isLoading ? 'Đang xử lý...' : 'ĐĂNG KÝ'}
                            onPress={handleRegister}
                            disabled={isLoading}
                            loading={isLoading}
                            icon="account-plus"
                            variant="primary"
                        />

                        {/* Login Link */}
                        <TouchableOpacity
                            onPress={() => navigation.navigate('Login')}
                            style={styles.loginLink}
                        >
                            <Text style={styles.loginText}>
                                Đã có tài khoản? <Text style={styles.loginHighlight}>Đăng nhập</Text>
                            </Text>
                        </TouchableOpacity>
                    </GlassCard>

                    <View style={{ height: 40 }} />
                </ScrollView>

                <Snackbar
                    visible={!!success}
                    onDismiss={() => setSuccess('')}
                    duration={2000}
                    style={styles.snackbar}
                >
                    {success}
                </Snackbar>
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
        marginBottom: UnifiedSpacing.xl,
    },
    logoContainer: {
        marginBottom: UnifiedSpacing.md,
    },
    logoIcon: {
        width: 64,
        height: 64,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: GlassTokens.colors.primary,
    },
    title: {
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        color: GlassTokens.colors.textPrimary,
        marginBottom: 8,
        textShadowColor: GlassTokens.colors.primaryGlow,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 20,
    },
    subtitle: {
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        color: GlassTokens.colors.textSecondary,
    },
    nameRow: {
        flexDirection: 'row',
        marginBottom: UnifiedSpacing.md,
    },
    roleSection: {
        marginBottom: UnifiedSpacing.md,
    },
    roleLabel: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: GlassTokens.colors.textSecondary,
        marginBottom: 8,
    },
    roleContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    roleButton: {
        flex: 1,
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderRadius: UnifiedRadius.md,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        gap: 8,
    },
    roleButtonActive: {
        borderColor: GlassTokens.colors.primaryBorder,
        backgroundColor: `${GlassTokens.colors.primary}15`,
    },
    roleText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: GlassTokens.colors.textSecondary,
    },
    roleTextActive: {
        color: GlassTokens.colors.primary,
        fontFamily: 'Poppins_600SemiBold',
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
        flex: 1,
    },
    loginLink: {
        alignItems: 'center',
        marginTop: 20,
    },
    loginText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: GlassTokens.colors.textSecondary,
    },
    loginHighlight: {
        color: GlassTokens.colors.primary,
        fontFamily: 'Poppins_600SemiBold',
    },
    snackbar: {
        backgroundColor: GlassTokens.colors.success,
        borderRadius: UnifiedRadius.sm,
    },
});
