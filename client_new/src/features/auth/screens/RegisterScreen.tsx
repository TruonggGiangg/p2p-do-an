import React, { useState, useEffect } from 'react';
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
import {
    CommonButton,
    CommonInput,
    BinanceHeader,
} from '../../../components';

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

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
        }).start();
    }, [fadeAnim]);

    const updateField = (field: string, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
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

        if (!formData.firstName.trim()) newErrors.firstName = 'Vui lòng nhập họ';
        if (!formData.lastName.trim()) newErrors.lastName = 'Vui lòng nhập tên';
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
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <BinanceHeader
                mode="standard"
                title="Register"
                showBack={true}
                rightComponents={
                    <TouchableOpacity onPress={() => navigation.navigate('Login' as never)}>
                        <Text style={[styles.loginText, { color: theme.colors.primary }]}>Login</Text>
                    </TouchableOpacity>
                }
            />

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <Animated.View style={{ opacity: fadeAnim }}>
                    <View style={styles.heroSection}>
                        <View style={[styles.heroIconContainer, { backgroundColor: theme.colors.primary + '15' }]}>
                            <MaterialCommunityIcons name="account-plus-outline" size={32} color={theme.colors.primary} />
                        </View>
                        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Create Account</Text>
                        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
                            Join the most secure P2P lending platform
                        </Text>
                    </View>
                    {/* Form Section */}
                    <View style={styles.formSection}>
                        <View style={styles.row}>
                            <View style={styles.halfWidth}>
                                <CommonInput
                                    label="First Name"
                                    value={formData.firstName}
                                    onChangeText={(text) => updateField('firstName', text)}
                                    placeholder="Nguyễn"
                                    error={errors.firstName}
                                    editable={!isLoading}
                                />
                            </View>
                            <View style={styles.halfWidth}>
                                <CommonInput
                                    label="Last Name"
                                    value={formData.lastName}
                                    onChangeText={(text) => updateField('lastName', text)}
                                    placeholder="Văn A"
                                    error={errors.lastName}
                                    editable={!isLoading}
                                />
                            </View>
                        </View>

                        <CommonInput
                            label="Phone Number"
                            value={formData.phoneNumber}
                            onChangeText={(text) => updateField('phoneNumber', text)}
                            keyboardType="phone-pad"
                            placeholder="0987 654 321"
                            error={errors.phoneNumber}
                            editable={!isLoading}
                        />

                        <CommonInput
                            label="Email (Optional)"
                            value={formData.email}
                            onChangeText={(text) => updateField('email', text)}
                            keyboardType="email-address"
                            placeholder="email@example.com"
                            autoCapitalize="none"
                            error={errors.email}
                            editable={!isLoading}
                        />

                        {/* User Type Selector */}
                        <View style={styles.typeContainer}>
                            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Account Type</Text>
                            <View style={styles.typeSelector}>
                                <TouchableOpacity
                                    style={[
                                        styles.typeButton,
                                        {
                                            backgroundColor: formData.userType === 'borrower' ? theme.colors.primaryGlass : 'transparent',
                                            borderColor: formData.userType === 'borrower' ? theme.colors.primary : theme.colors.border,
                                        }
                                    ]}
                                    onPress={() => updateField('userType', 'borrower')}
                                >
                                    <MaterialCommunityIcons
                                        name="account-cash"
                                        size={20}
                                        color={formData.userType === 'borrower' ? theme.colors.primary : theme.colors.textDim}
                                    />
                                    <Text style={[styles.typeBtnText, { color: formData.userType === 'borrower' ? theme.colors.textPrimary : theme.colors.textSecondary }]}>
                                        Borrower
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.typeButton,
                                        {
                                            backgroundColor: formData.userType === 'lender' ? theme.colors.primaryGlass : 'transparent',
                                            borderColor: formData.userType === 'lender' ? theme.colors.primary : theme.colors.border,
                                        }
                                    ]}
                                    onPress={() => updateField('userType', 'lender')}
                                >
                                    <MaterialCommunityIcons
                                        name="hand-coin"
                                        size={20}
                                        color={formData.userType === 'lender' ? theme.colors.primary : theme.colors.textDim}
                                    />
                                    <Text style={[styles.typeBtnText, { color: formData.userType === 'lender' ? theme.colors.textPrimary : theme.colors.textSecondary }]}>
                                        Lender
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <CommonInput
                            label="Password"
                            value={formData.password}
                            onChangeText={(text) => updateField('password', text)}
                            secureTextEntry
                            placeholder="At least 6 characters"
                            error={errors.password}
                            editable={!isLoading}
                        />

                        <CommonInput
                            label="Confirm Password"
                            value={formData.confirmPassword}
                            onChangeText={(text) => updateField('confirmPassword', text)}
                            secureTextEntry
                            placeholder="Re-enter password"
                            error={errors.confirmPassword}
                            editable={!isLoading}
                        />

                        <CommonButton
                            title={isLoading ? 'Creating Account...' : 'Register'}
                            onPress={handleRegister}
                            loading={isLoading}
                            variant="primary"
                            style={styles.registerBtn}
                        />
                    </View>

                    {/* Footer Policy */}
                    <View style={[styles.footer, { backgroundColor: theme.colors.surfaceLight, borderColor: theme.colors.border }]}>
                        <MaterialCommunityIcons name="lock" size={14} color={theme.colors.textMuted} style={styles.lockIcon} />
                        <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
                            By registering, you agree to our{' '}
                            <Text style={{ color: theme.colors.primary }}>Terms of Use</Text> and{' '}
                            <Text style={{ color: theme.colors.primary }}>Privacy Policy</Text>.
                            All data is end-to-end encrypted.
                        </Text>
                    </View>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loginText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        marginRight: 16,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    branding: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 10,
        marginBottom: 32,
    },
    logoBox: {
        width: 32,
        height: 32,
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoChar: {
        fontSize: 18,
        fontWeight: '900',
        color: '#000',
    },
    brandName: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
    },
    heroSection: {
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 32,
    },
    heroIconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 20,
    },
    formSection: {
        width: '100%',
    },
    row: {
        flexDirection: 'row',
        gap: 12,
    },
    halfWidth: {
        flex: 1,
    },
    typeContainer: {
        marginBottom: 20,
    },
    label: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 10,
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
        height: 48,
        borderRadius: 8,
        borderWidth: 1,
        gap: 8,
    },
    typeBtnText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    registerBtn: {
        marginTop: 12,
        height: 52,
        marginBottom: 30,
    },
    footer: {
        flexDirection: 'row',
        padding: 16,
        borderRadius: 8,
        borderWidth: 1,
    },
    lockIcon: {
        marginTop: 2,
        marginRight: 8,
    },
    footerText: {
        flex: 1,
        fontSize: 11,
        lineHeight: 16,
        fontFamily: 'Poppins_400Regular',
    },
});
