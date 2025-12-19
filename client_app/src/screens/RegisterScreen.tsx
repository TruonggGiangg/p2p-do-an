import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { TextInput, Button, Text, Card, Snackbar } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';

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
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Card style={styles.card}>
                    <Card.Content>
                        <Text variant="headlineMedium" style={styles.title}>
                            Đăng Ký
                        </Text>
                        <Text variant="bodyMedium" style={styles.subtitle}>
                            Tạo tài khoản Keycloak mới
                        </Text>

                        <TextInput
                            label="Số điện thoại (username)"
                            value={username}
                            onChangeText={setUsername}
                            mode="outlined"
                            keyboardType="phone-pad"
                            style={styles.input}
                            left={<TextInput.Icon icon="phone" />}
                        />

                        <TextInput
                            label="Email"
                            value={email}
                            onChangeText={setEmail}
                            mode="outlined"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            style={styles.input}
                            left={<TextInput.Icon icon="email" />}
                        />

                        <TextInput
                            label="Họ"
                            value={firstName}
                            onChangeText={setFirstName}
                            mode="outlined"
                            style={styles.input}
                            left={<TextInput.Icon icon="account" />}
                        />

                        <TextInput
                            label="Tên"
                            value={lastName}
                            onChangeText={setLastName}
                            mode="outlined"
                            style={styles.input}
                            left={<TextInput.Icon icon="account" />}
                        />

                        <TextInput
                            label="Mật khẩu (ít nhất 12 ký tự)"
                            value={password}
                            onChangeText={setPassword}
                            mode="outlined"
                            secureTextEntry={!showPassword}
                            style={styles.input}
                            left={<TextInput.Icon icon="lock" />}
                            right={
                                <TextInput.Icon
                                    icon={showPassword ? 'eye-off' : 'eye'}
                                    onPress={() => setShowPassword(!showPassword)}
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
                            left={<TextInput.Icon icon="lock-check" />}
                        />

                        <Button
                            mode="contained"
                            onPress={handleRegister}
                            loading={isLoading}
                            disabled={isLoading}
                            style={styles.button}
                        >
                            Đăng Ký
                        </Button>

                        <Button
                            mode="text"
                            onPress={() => navigation.navigate('Login')}
                            style={styles.linkButton}
                        >
                            Đã có tài khoản? Đăng nhập
                        </Button>
                    </Card.Content>
                </Card>
            </ScrollView>

            <Snackbar
                visible={!!error}
                onDismiss={() => setError('')}
                duration={3000}
            >
                {error}
            </Snackbar>

            <Snackbar
                visible={!!success}
                onDismiss={() => setSuccess('')}
                duration={2000}
                style={{ backgroundColor: '#4CAF50' }}
            >
                {success}
            </Snackbar>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 16,
    },
    card: {
        padding: 8,
    },
    title: {
        textAlign: 'center',
        marginBottom: 8,
        fontWeight: 'bold',
    },
    subtitle: {
        textAlign: 'center',
        marginBottom: 24,
        color: '#666',
    },
    input: {
        marginBottom: 12,
    },
    button: {
        marginTop: 8,
        paddingVertical: 8,
    },
    linkButton: {
        marginTop: 16,
    },
});
