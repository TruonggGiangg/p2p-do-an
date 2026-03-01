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
    Modal,
    TextInput,
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
import { LinearGradient } from 'expo-linear-gradient';

export default function LoginScreen() {
    const navigation = useNavigation();
    const { login, isLoading } = useAuth();
    const { theme } = useTheme();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [fadeAnim] = useState(new Animated.Value(0));
    const [show2faModal, setShow2faModal] = useState(false);
    const [twoFactorToken, setTwoFactorToken] = useState('');
    const [is2faLoading, setIs2faLoading] = useState(false);

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

    const handleLogin = useCallback(async (token?: string) => {
        if (!username.trim() || !password.trim()) {
            setError('Vui lòng nhập đầy đủ thông tin');
            return;
        }

        try {
            setError('');
            if (token) {
                setIs2faLoading(true);
            }

            const response = await login({
                username: username.trim(),
                password: password.trim(),
                twoFactorToken: token
            });

            if (response.requires2fa) {
                setShow2faModal(true);
            } else {
                setShow2faModal(false);
                setTwoFactorToken('');
            }
        } catch (err: any) {
            setError(err.message || 'Đăng nhập thất bại. Vui lòng thử lại.');
            if (token) {
                setTwoFactorToken('');
            }
        } finally {
            setIs2faLoading(false);
        }
    }, [username, password, login]);

    const usernameError = useMemo(() => (error && !password ? error : undefined), [error, password]);
    const passwordError = useMemo(() => (error && password ? error : undefined), [error, password]);

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {/* Custom Binance Header */}
            <View style={[styles.customHeader, { paddingTop: Platform.OS === 'ios' ? 50 : 20 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIcon}>
                    <MaterialCommunityIcons name="close" size={24} color={theme.colors.textPrimary} />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                    <MaterialCommunityIcons name="shield-check" size={18} color={theme.colors.primary} />
                    <Text style={[styles.headerCenterText, { color: theme.colors.textSecondary }]}>
                        SECURE CONNECTION
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={() => navigation.navigate('Register' as never)}
                    style={styles.headerRight}
                >
                    <Text style={[styles.registerText, { color: theme.colors.primary }]}>Register</Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <Animated.View style={{ opacity: fadeAnim }}>
                    {/* Branding Section */}
                    <View style={styles.branding}>
                        <View style={[styles.logoBox, { backgroundColor: theme.colors.primary }]}>
                            <Text style={styles.logoChar}>P</Text>
                        </View>
                        <Text style={[styles.brandName, { color: theme.colors.textPrimary }]}>P2P Exchange</Text>
                    </View>

                    <Text style={[styles.heroTitle, { color: theme.colors.textPrimary }]}>Log In</Text>
                    <Text style={[styles.heroSubtitle, { color: theme.colors.textSecondary }]}>
                        Welcome back! Please log in to access your portfolio.
                    </Text>

                    {/* Form Section */}
                    <View style={styles.formSection}>
                        <CommonInput
                            label="Email / Phone Number"
                            value={username}
                            onChangeText={handleUsernameChange}
                            placeholder="Enter email or phone number"
                            error={usernameError}
                            editable={!isLoading}
                        />

                        <CommonInput
                            label="Password"
                            value={password}
                            onChangeText={handlePasswordChange}
                            placeholder="Enter password"
                            secureTextEntry
                            error={passwordError}
                            editable={!isLoading}
                        />

                        {error && !usernameError && !passwordError && (
                            <Text style={[styles.globalError, { color: theme.colors.error }]}>{error}</Text>
                        )}

                        <CommonButton
                            title="Log In"
                            onPress={() => handleLogin()}
                            loading={isLoading}
                            disabled={isLoading || !username.trim() || !password.trim()}
                            variant="primary"
                            style={styles.loginBtn}
                        />

                        {/* Secondary Links */}
                        <View style={styles.linksRow}>
                            <TouchableOpacity>
                                <Text style={[styles.linkText, { color: theme.colors.textSecondary }]}>
                                    Forgot Password?
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.faceIdLink}>
                                <MaterialCommunityIcons
                                    name="fingerprint"
                                    size={20}
                                    color={theme.colors.textSecondary}
                                />
                                <Text style={[styles.linkText, { color: theme.colors.textSecondary }]}>
                                    Face ID
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Divider */}
                    <View style={styles.dividerContainer}>
                        <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
                        <Text style={[styles.dividerText, { color: theme.colors.textDim }]}>Or continue with</Text>
                        <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
                    </View>

                    {/* Social Logins */}
                    <View style={styles.socialRow}>
                        <TouchableOpacity style={[styles.socialBtn, { borderColor: theme.colors.border }]}>
                            <MaterialCommunityIcons name="google" size={20} color="#EA4335" />
                            <Text style={[styles.socialBtnText, { color: theme.colors.textPrimary }]}>Google</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.socialBtn, { borderColor: theme.colors.border }]}>
                            <MaterialCommunityIcons name="apple" size={22} color={theme.colors.textPrimary} />
                            <Text style={[styles.socialBtnText, { color: theme.colors.textPrimary }]}>Apple</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Footer Policy */}
                    <View style={[styles.footer, { backgroundColor: theme.colors.surfaceLight, borderColor: theme.colors.border }]}>
                        <MaterialCommunityIcons name="lock" size={14} color={theme.colors.textMuted} style={styles.lockIcon} />
                        <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
                            By logging in, you agree to our{' '}
                            <Text style={{ color: theme.colors.primary }}>Terms of Use</Text> and{' '}
                            <Text style={{ color: theme.colors.primary }}>Privacy Policy</Text>.
                            Your connection is end-to-end encrypted.
                        </Text>
                    </View>
                </Animated.View>
            </ScrollView>

            {/* 2FA Verification Modal */}
            <Modal
                visible={show2faModal}
                transparent={false}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => {
                    setShow2faModal(false);
                    setTwoFactorToken('');
                }}
            >
                <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.modalKeyboardView}
                    >
                        <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
                            <BinanceHeader
                                mode="standard"
                                title="2FA Verification"
                                showBack={false}
                                rightComponents={
                                    <TouchableOpacity
                                        onPress={() => {
                                            setShow2faModal(false);
                                            setTwoFactorToken('');
                                        }}
                                        style={styles.closeButton}
                                    >
                                        <MaterialCommunityIcons
                                            name="close"
                                            size={24}
                                            color={theme.colors.textPrimary}
                                        />
                                    </TouchableOpacity>
                                }
                            />

                            <ScrollView
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                            >
                                <View style={styles.modalLogoContainer}>
                                    <View style={[styles.modalLogoBox, { backgroundColor: theme.colors.primary + '20' }]}>
                                        <MaterialCommunityIcons name="shield-lock" size={40} color={theme.colors.primary} />
                                    </View>
                                </View>

                                <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>
                                    Two-Factor Authentication
                                </Text>
                                <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>
                                    Enter the 6-digit code from your Google Authenticator app to secure your account.
                                </Text>

                                <View style={styles.otpInputContainer}>
                                    <View style={[
                                        styles.otpInputWrapper,
                                        {
                                            borderColor: twoFactorToken.length === 6
                                                ? theme.colors.success
                                                : theme.colors.border,
                                            backgroundColor: twoFactorToken.length === 6
                                                ? theme.colors.success + '10'
                                                : theme.colors.surfaceLight,
                                        },
                                    ]}>
                                        <TextInput
                                            style={[styles.otpInput, { color: theme.colors.textPrimary }]}
                                            value={twoFactorToken}
                                            onChangeText={setTwoFactorToken}
                                            placeholder="000000"
                                            placeholderTextColor={theme.colors.textMuted + '80'}
                                            keyboardType="number-pad"
                                            maxLength={6}
                                            autoFocus={true}
                                        />
                                        {twoFactorToken.length === 6 && (
                                            <MaterialCommunityIcons
                                                name="check-circle"
                                                size={24}
                                                color={theme.colors.success}
                                                style={styles.otpCheckIcon}
                                            />
                                        )}
                                    </View>
                                </View>

                                <CommonButton
                                    title="Verify"
                                    onPress={() => handleLogin(twoFactorToken)}
                                    loading={is2faLoading}
                                    disabled={twoFactorToken.length !== 6 || is2faLoading}
                                    style={styles.verifyBtn}
                                />

                                <TouchableOpacity
                                    onPress={() => setShow2faModal(false)}
                                    style={styles.cancelBtn}
                                >
                                    <Text style={[styles.cancelBtnText, { color: theme.colors.textSecondary }]}>
                                        Cancel
                                    </Text>
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    customHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        height: 100,
    },
    headerIcon: {
        width: 40,
    },
    headerCenter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    headerCenterText: {
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 1,
    },
    headerRight: {
        width: 60,
        alignItems: 'flex-end',
    },
    registerText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
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
    heroTitle: {
        fontSize: 32,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 8,
    },
    heroSubtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 20,
        marginBottom: 32,
    },
    formSection: {
        width: '100%',
    },
    loginBtn: {
        marginTop: 12,
        height: 52,
    },
    linksRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 20,
    },
    faceIdLink: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    linkText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 40,
        gap: 16,
    },
    dividerLine: {
        flex: 1,
        height: 1,
    },
    dividerText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    socialRow: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 40,
    },
    socialBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        borderRadius: 8,
        borderWidth: 1,
        gap: 10,
    },
    socialBtnText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
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
    globalError: {
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 12,
        fontFamily: 'Poppins_400Regular',
    },
    modalContainer: {
        flex: 1,
    },
    modalKeyboardView: {
        flex: 1,
    },
    modalContent: {
        flex: 1,
        paddingHorizontal: 20,
    },
    closeButton: {
        padding: 4,
    },
    modalLogoContainer: {
        alignItems: 'center',
        marginTop: 40,
        marginBottom: 24,
    },
    modalLogoBox: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
        marginBottom: 8,
    },
    modalSubtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 20,
        marginBottom: 40,
    },
    otpInputContainer: {
        marginBottom: 32,
        width: '100%',
    },
    otpInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 2,
        borderRadius: 12,
        paddingHorizontal: 20,
        height: 64,
    },
    otpInput: {
        flex: 1,
        fontSize: 32,
        fontWeight: 'bold',
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
        letterSpacing: 12,
        padding: 0,
    },
    otpCheckIcon: {
        marginLeft: 12,
    },
    verifyBtn: {
        height: 52,
        borderRadius: 12,
    },
    cancelBtn: {
        marginTop: 20,
        padding: 12,
        alignItems: 'center',
    },
    cancelBtnText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
});

