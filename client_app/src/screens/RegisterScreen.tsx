import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { TextInput, Button, Text, Surface, Snackbar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../theme';

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
            colors={['#E3F2FD', '#F7F9FC']}
            style={styles.container}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>

                    <View style={styles.header}>
                        <Text variant="headlineLarge" style={styles.title}>
                            Đăng Ký
                        </Text>
                        <Text variant="bodyLarge" style={styles.subtitle}>
                            Tạo tài khoản mới
                        </Text>
                    </View>

                    <Surface style={styles.card} elevation={0}>
                        <TextInput
                            label="Số điện thoại"
                            value={username}
                            onChangeText={setUsername}
                            mode="outlined"
                            keyboardType="phone-pad"
                            style={styles.input}
                            contentStyle={{ fontFamily: 'Poppins_400Regular' }}
                            outlineColor="transparent"
                            activeOutlineColor={Colors.primary}
                            textColor={Colors.text}
                            theme={{ roundness: 12 }}
                            left={<TextInput.Icon icon="phone" color={Colors.textSecondary} />}
                        />

                        <TextInput
                            label="Email"
                            value={email}
                            onChangeText={setEmail}
                            mode="outlined"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            style={styles.input}
                            contentStyle={{ fontFamily: 'Poppins_400Regular' }}
                            outlineColor="transparent"
                            activeOutlineColor={Colors.primary}
                            textColor={Colors.text}
                            theme={{ roundness: 12 }}
                            left={<TextInput.Icon icon="email" color={Colors.textSecondary} />}
                        />

                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TextInput
                                label="Họ"
                                value={firstName}
                                onChangeText={setFirstName}
                                mode="outlined"
                                style={[styles.input, { flex: 1 }]}
                                contentStyle={{ fontFamily: 'Poppins_400Regular' }}
                                outlineColor="transparent"
                                activeOutlineColor={Colors.primary}
                                textColor={Colors.text}
                                theme={{ roundness: 12 }}
                            />
                            <TextInput
                                label="Tên"
                                value={lastName}
                                onChangeText={setLastName}
                                mode="outlined"
                                style={[styles.input, { flex: 1 }]}
                                contentStyle={{ fontFamily: 'Poppins_400Regular' }}
                                outlineColor="transparent"
                                activeOutlineColor={Colors.primary}
                                textColor={Colors.text}
                                theme={{ roundness: 12 }}
                            />
                        </View>

                        <TextInput
                            label="Mật khẩu"
                            value={password}
                            onChangeText={setPassword}
                            mode="outlined"
                            secureTextEntry={!showPassword}
                            style={styles.input}
                            contentStyle={{ fontFamily: 'Poppins_400Regular' }}
                            outlineColor="transparent"
                            activeOutlineColor={Colors.primary}
                            textColor={Colors.text}
                            theme={{ roundness: 12 }}
                            left={<TextInput.Icon icon="lock" color={Colors.textSecondary} />}
                            right={
                                <TextInput.Icon
                                    icon={showPassword ? 'eye-off' : 'eye'}
                                    onPress={() => setShowPassword(!showPassword)}
                                    color={Colors.textSecondary}
                                />
                            }
                        />

                        <TextInput
                            label="Xác nhận mật khẩu"
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            mode="outlined"
                            secureTextEntry={!showPassword}
                            style={styles.input}
                            contentStyle={{ fontFamily: 'Poppins_400Regular' }}
                            outlineColor="transparent"
                            activeOutlineColor={Colors.primary}
                            textColor={Colors.text}
                            theme={{ roundness: 12 }}
                            left={<TextInput.Icon icon="lock-check" color={Colors.textSecondary} />}
                        />

                        {error ? <Text style={styles.errorText}>{error}</Text> : null}

                        <Button
                            mode="contained"
                            onPress={handleRegister}
                            loading={isLoading}
                            disabled={isLoading}
                            style={styles.button}
                            labelStyle={styles.buttonLabel}
                            contentStyle={{ height: 50 }}
                        >
                            Đăng Ký
                        </Button>

                        <Button
                            mode="text"
                            onPress={() => navigation.navigate('Login')}
                            style={styles.linkButton}
                            labelStyle={{ fontFamily: 'Poppins_500Medium', color: Colors.primary }}
                        >
                            Đã có tài khoản? Đăng nhập
                        </Button>
                    </Surface>
                </ScrollView>

                <Snackbar
                    visible={!!success}
                    onDismiss={() => setSuccess('')}
                    duration={2000}
                    style={{ backgroundColor: Colors.success, borderRadius: 12 }}
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
        marginBottom: 30,
    },
    title: {
        fontFamily: 'Poppins_700Bold',
        color: Colors.text,
        marginBottom: 8,
    },
    subtitle: {
        fontFamily: 'Poppins_400Regular',
        color: Colors.textSecondary,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 30,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.05,
        shadowRadius: 30,
        elevation: 5,
    },
    input: {
        marginBottom: 16,
        backgroundColor: '#F7F9FC',
        fontSize: 14,
    },
    button: {
        marginTop: 10,
        borderRadius: 16,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 15,
        elevation: 8,
    },
    buttonLabel: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 16,
        paddingVertical: 2,
    },
    linkButton: {
        marginTop: 16,
        alignSelf: 'center',
    },
    errorText: {
        color: Colors.error,
        textAlign: 'center',
        marginBottom: 10,
        fontFamily: 'Poppins_400Regular',
        fontSize: 12,
    },
});
