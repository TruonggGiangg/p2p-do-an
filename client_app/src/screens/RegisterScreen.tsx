import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { TextInput, Text, Snackbar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { DarkColors, DarkStyling } from '../theme';

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
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showPassword, setShowPassword] = useState(false);

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

        try {
            setError('');
            await register(username, password, email, firstName, lastName);
            setSuccess('Đăng ký thành công! Bạn có thể đăng nhập ngay.');
            setTimeout(() => navigation.navigate('Login'), 2000);
        } catch (err: any) {
            console.error('Register error:', err);
            setError(err.response?.data?.message || 'Đăng ký thất bại. Vui lòng thử lại.');
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
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Đăng Ký</Text>
                        <Text style={styles.subtitle}>Tạo tài khoản mới để bắt đầu</Text>
                    </View>

                    {/* Register Card */}
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

                        {/* Email Input */}
                        <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>Email</Text>
                            <TextInput
                                value={email}
                                onChangeText={setEmail}
                                mode="flat"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                style={styles.input}
                                contentStyle={styles.inputContent}
                                underlineColor="transparent"
                                activeUnderlineColor={DarkColors.primary}
                                textColor={DarkColors.text}
                                placeholder="email@example.com"
                                placeholderTextColor={DarkColors.textMuted}
                                left={<TextInput.Icon icon="email" color={DarkColors.textSecondary} />}
                            />
                        </View>

                        {/* Name Row */}
                        <View style={styles.nameRow}>
                            <View style={[styles.inputContainer, { flex: 1 }]}>
                                <Text style={styles.inputLabel}>Họ</Text>
                                <TextInput
                                    value={firstName}
                                    onChangeText={setFirstName}
                                    mode="flat"
                                    style={styles.input}
                                    contentStyle={styles.inputContent}
                                    underlineColor="transparent"
                                    activeUnderlineColor={DarkColors.primary}
                                    textColor={DarkColors.text}
                                    placeholder="Nguyễn"
                                    placeholderTextColor={DarkColors.textMuted}
                                />
                            </View>
                            <View style={{ width: 12 }} />
                            <View style={[styles.inputContainer, { flex: 1 }]}>
                                <Text style={styles.inputLabel}>Tên</Text>
                                <TextInput
                                    value={lastName}
                                    onChangeText={setLastName}
                                    mode="flat"
                                    style={styles.input}
                                    contentStyle={styles.inputContent}
                                    underlineColor="transparent"
                                    activeUnderlineColor={DarkColors.primary}
                                    textColor={DarkColors.text}
                                    placeholder="Văn A"
                                    placeholderTextColor={DarkColors.textMuted}
                                />
                            </View>
                        </View>

                        {/* Password Input */}
                        <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>Mật khẩu (tối thiểu 12 ký tự)</Text>
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
                                placeholder="••••••••••••"
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

                        {/* Confirm Password */}
                        <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>Xác nhận mật khẩu</Text>
                            <TextInput
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                mode="flat"
                                secureTextEntry={!showPassword}
                                style={styles.input}
                                contentStyle={styles.inputContent}
                                underlineColor="transparent"
                                activeUnderlineColor={DarkColors.primary}
                                textColor={DarkColors.text}
                                placeholder="••••••••••••"
                                placeholderTextColor={DarkColors.textMuted}
                                left={<TextInput.Icon icon="lock-check" color={DarkColors.textSecondary} />}
                            />
                        </View>

                        {/* Error Message */}
                        {error ? (
                            <View style={styles.errorBox}>
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        ) : null}

                        {/* Register Button */}
                        <TouchableOpacity
                            onPress={handleRegister}
                            disabled={isLoading}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={isLoading ? [DarkColors.textMuted, DarkColors.textMuted] : DarkColors.gradientPrimary}
                                style={styles.registerButton}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                <Text style={styles.registerButtonText}>
                                    {isLoading ? 'Đang xử lý...' : 'Đăng Ký'}
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Login Link */}
                        <TouchableOpacity
                            onPress={() => navigation.navigate('Login')}
                            style={styles.loginLink}
                        >
                            <Text style={styles.loginText}>
                                Đã có tài khoản? <Text style={styles.loginHighlight}>Đăng nhập</Text>
                            </Text>
                        </TouchableOpacity>
                    </View>
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
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        color: DarkColors.text,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 15,
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
        marginBottom: 16,
    },
    inputLabel: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: DarkColors.textSecondary,
        marginBottom: 6,
    },
    input: {
        backgroundColor: DarkColors.surfaceLight,
        borderRadius: DarkStyling.borderRadius.sm,
        fontSize: 15,
    },
    inputContent: {
        fontFamily: 'Poppins_400Regular',
        paddingLeft: 8,
    },
    nameRow: {
        flexDirection: 'row',
    },
    errorBox: {
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
    registerButton: {
        borderRadius: DarkStyling.borderRadius.sm,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 8,
        ...DarkStyling.shadow.subtle,
    },
    registerButtonText: {
        color: DarkColors.white,
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
    loginLink: {
        alignItems: 'center',
        marginTop: 20,
    },
    loginText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: DarkColors.textSecondary,
    },
    loginHighlight: {
        color: DarkColors.primary,
        fontFamily: 'Poppins_600SemiBold',
    },
    snackbar: {
        backgroundColor: DarkColors.success,
        borderRadius: DarkStyling.borderRadius.sm,
    },
});
