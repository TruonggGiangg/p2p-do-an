import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    TouchableOpacity,
    Animated,
    Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../../contexts/AuthContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { GradientBackground, GlassCard, GlassInput, GlassButton, CustomHeader } from '../../../components';

export default function RegisterScreen() {
    const navigation = useNavigation();
    const { register, isLoading } = useAuth();
    const { theme } = useTheme();
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        phoneNumber: '',
        email: '',
        password: '',
        confirmPassword: '',
        userType: 'borrower' as 'borrower' | 'lender',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [fadeAnim] = useState(new Animated.Value(0));

    React.useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
        }).start();
    }, []);

    const updateField = (field: string, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        // Clear error when user starts typing
        if (errors[field]) {
            setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.firstName.trim()) {
            newErrors.firstName = 'Vui lòng nhập họ';
        }
        if (!formData.lastName.trim()) {
            newErrors.lastName = 'Vui lòng nhập tên';
        }
        if (!formData.phoneNumber.trim() || formData.phoneNumber.length < 10) {
            newErrors.phoneNumber = 'Số điện thoại không hợp lệ';
        }
        if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'Email không hợp lệ';
        }
        if (!formData.password || formData.password.length < 6) {
            newErrors.password = 'Mật khẩu phải có ít nhất 6 ký tự';
        }
        if (formData.password !== formData.confirmPassword) {
            newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleRegister = async () => {
        if (!validateForm()) return;

        try {
            await register({
                firstName: formData.firstName,
                lastName: formData.lastName,
                phoneNumber: formData.phoneNumber,
                email: formData.email || undefined,
                password: formData.password,
                userType: formData.userType,
            });

            Alert.alert(
                'Đăng ký thành công',
                'Tài khoản của bạn đã được tạo. Vui lòng đăng nhập.',
                [
                    {
                        text: 'Đăng nhập',
                        onPress: () => (navigation as any).navigate('Login'),
                    },
                ]
            );
        } catch (error: any) {
            Alert.alert('Đăng ký thất bại', error.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
        }
    };

    return (
        <GradientBackground>
            <CustomHeader title="Đăng ký" showBack />
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
                        {/* Hero Section */}
                        <View style={styles.heroSection}>
                            <Text style={[styles.heroTitle, { color: theme.colors.textPrimary }]}>
                                TẠO TÀI KHOẢN MỚI
                            </Text>
                            <Text style={[styles.heroSubtitle, { color: theme.colors.textSecondary }]}>
                                Tham gia cộng đồng tài chính thông minh
                            </Text>
                        </View>

                        {/* Register Form Card */}
                        <GlassCard blur={theme.blur.medium}>
                            {/* Name Row */}
                            <View style={styles.row}>
                                <View style={styles.halfWidth}>
                                    <GlassInput
                                        label="Họ *"
                                        value={formData.firstName}
                                        onChangeText={(text) => updateField('firstName', text)}
                                        placeholder="Nguyễn"
                                        icon="account"
                                        error={errors.firstName}
                                        editable={!isLoading}
                                    />
                                </View>
                                <View style={styles.halfWidth}>
                                    <GlassInput
                                        label="Tên *"
                                        value={formData.lastName}
                                        onChangeText={(text) => updateField('lastName', text)}
                                        placeholder="Văn A"
                                        icon="account-outline"
                                        error={errors.lastName}
                                        editable={!isLoading}
                                    />
                                </View>
                            </View>

                            {/* Phone Number */}
                            <GlassInput
                                label="Số điện thoại *"
                                value={formData.phoneNumber}
                                onChangeText={(text) => updateField('phoneNumber', text)}
                                keyboardType="phone-pad"
                                placeholder="0987 654 321"
                                icon="phone"
                                error={errors.phoneNumber}
                                editable={!isLoading}
                            />

                            {/* Email */}
                            <GlassInput
                                label="Email (tùy chọn)"
                                value={formData.email}
                                onChangeText={(text) => updateField('email', text)}
                                keyboardType="email-address"
                                placeholder="email@example.com"
                                icon="email"
                                autoCapitalize="none"
                                error={errors.email}
                                editable={!isLoading}
                            />

                            {/* User Type Selector */}
                            <View style={styles.inputContainer}>
                                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                                    Loại tài khoản *
                                </Text>
                                <View style={styles.typeSelector}>
                                    <TouchableOpacity
                                        style={[
                                            styles.typeButton,
                                            {
                                                backgroundColor:
                                                    formData.userType === 'borrower'
                                                        ? theme.colors.primaryGlass
                                                        : theme.colors.glassLight,
                                                borderColor:
                                                    formData.userType === 'borrower'
                                                        ? theme.colors.primaryBorder
                                                        : theme.colors.border,
                                                borderRadius: theme.radius.md,
                                            },
                                        ]}
                                        onPress={() => updateField('userType', 'borrower')}
                                        disabled={isLoading}
                                        activeOpacity={0.7}
                                    >
                                        <MaterialCommunityIcons
                                            name="account-cash"
                                            size={20}
                                            color={
                                                formData.userType === 'borrower'
                                                    ? theme.colors.primary
                                                    : theme.colors.textMuted
                                            }
                                        />
                                        <Text
                                            style={[
                                                styles.typeButtonText,
                                                {
                                                    color:
                                                        formData.userType === 'borrower'
                                                            ? theme.colors.primary
                                                            : theme.colors.textSecondary,
                                                },
                                            ]}
                                        >
                                            Người vay
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[
                                            styles.typeButton,
                                            {
                                                backgroundColor:
                                                    formData.userType === 'lender'
                                                        ? theme.colors.primaryGlass
                                                        : theme.colors.glassLight,
                                                borderColor:
                                                    formData.userType === 'lender'
                                                        ? theme.colors.primaryBorder
                                                        : theme.colors.border,
                                                borderRadius: theme.radius.md,
                                            },
                                        ]}
                                        onPress={() => updateField('userType', 'lender')}
                                        disabled={isLoading}
                                        activeOpacity={0.7}
                                    >
                                        <MaterialCommunityIcons
                                            name="hand-coin"
                                            size={20}
                                            color={
                                                formData.userType === 'lender'
                                                    ? theme.colors.primary
                                                    : theme.colors.textMuted
                                            }
                                        />
                                        <Text
                                            style={[
                                                styles.typeButtonText,
                                                {
                                                    color:
                                                        formData.userType === 'lender'
                                                            ? theme.colors.primary
                                                            : theme.colors.textSecondary,
                                                },
                                            ]}
                                        >
                                            Nhà đầu tư
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Password */}
                            <GlassInput
                                label="Mật khẩu *"
                                value={formData.password}
                                onChangeText={(text) => updateField('password', text)}
                                secureTextEntry
                                placeholder="Tối thiểu 6 ký tự"
                                icon="lock"
                                error={errors.password}
                                editable={!isLoading}
                            />

                            {/* Confirm Password */}
                            <GlassInput
                                label="Xác nhận mật khẩu *"
                                value={formData.confirmPassword}
                                onChangeText={(text) => updateField('confirmPassword', text)}
                                secureTextEntry
                                placeholder="Nhập lại mật khẩu"
                                icon="lock-check"
                                error={errors.confirmPassword}
                                editable={!isLoading}
                            />

                            {/* Register Button */}
                            <GlassButton
                                title={isLoading ? 'Đang đăng ký...' : 'ĐĂNG KÝ'}
                                onPress={handleRegister}
                                disabled={
                                    isLoading ||
                                    !formData.firstName.trim() ||
                                    !formData.lastName.trim() ||
                                    !formData.phoneNumber.trim() ||
                                    !formData.password ||
                                    !formData.confirmPassword
                                }
                                loading={isLoading}
                                icon="account-plus"
                                variant="primary"
                                style={styles.registerButton}
                            />

                            {/* Login Link */}
                            <TouchableOpacity
                                onPress={() => (navigation as any).navigate('Login')}
                                style={styles.loginLink}
                                disabled={isLoading}
                            >
                                <Text style={[styles.loginText, { color: theme.colors.textSecondary }]}>
                                    Đã có tài khoản?{' '}
                                    <Text style={[styles.loginHighlight, { color: theme.colors.primary }]}>
                                        Đăng nhập ngay
                                    </Text>
                                </Text>
                            </TouchableOpacity>
                        </GlassCard>

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
        paddingTop: 16,
        paddingHorizontal: 24,
        width: '100%',
        maxWidth: '100%',
    },
    content: {
        flex: 1,
    },
    heroSection: {
        alignItems: 'center',
        marginBottom: 32,
    },
    heroTitle: {
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
        marginBottom: 8,
        letterSpacing: 1,
    },
    heroSubtitle: {
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },
    row: {
        flexDirection: 'row',
        gap: 12,
    },
    halfWidth: {
        flex: 1,
    },
    inputContainer: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 8,
    },
    typeSelector: {
        flexDirection: 'row',
        gap: 12,
    },
    typeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderWidth: 1,
        gap: 8,
    },
    typeButtonText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    registerButton: {
        marginTop: 16,
    },
    loginLink: {
        alignItems: 'center',
        marginTop: 24,
    },
    loginText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    loginHighlight: {
        fontFamily: 'Poppins_600SemiBold',
    },
});
