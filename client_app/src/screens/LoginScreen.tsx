import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { TextInput, Button, Text, Card, Snackbar } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';

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
            await login(username, password);
        } catch (err: any) {
            console.error('Login error:', err);
            setError(err.response?.data?.message || 'Đăng nhập thất bại. Vui lòng thử lại.');
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
                            Đăng Nhập
                        </Text>
                        <Text variant="bodyMedium" style={styles.subtitle}>
                            Sử dụng tài khoản Keycloak của bạn
                        </Text>

                        <TextInput
                            label="Số điện thoại"
                            value={username}
                            onChangeText={setUsername}
                            mode="outlined"
                            keyboardType="phone-pad"
                            style={styles.input}
                            left={<TextInput.Icon icon="phone" />}
                        />

                        <TextInput
                            label="Mật khẩu"
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

                        <Button
                            mode="contained"
                            onPress={handleLogin}
                            loading={isLoading}
                            disabled={isLoading}
                            style={styles.button}
                        >
                            Đăng Nhập
                        </Button>

                        <Button
                            mode="text"
                            onPress={() => navigation.navigate('Register')}
                            style={styles.linkButton}
                        >
                            Chưa có tài khoản? Đăng ký
                        </Button>

                        {/* Quick Fill Test Accounts */}
                        <View style={styles.quickFillContainer}>
                            <Text variant="labelMedium" style={styles.quickFillLabel}>
                                Tài khoản test:
                            </Text>
                            <View style={styles.quickFillButtons}>
                                <Button
                                    mode="outlined"
                                    compact
                                    onPress={() => {
                                        setUsername('0987654321');
                                        setPassword('TestClient123@');
                                    }}
                                    style={styles.quickFillButton}
                                >
                                    Account 1
                                </Button>
                                <Button
                                    mode="outlined"
                                    compact
                                    onPress={() => {
                                        setUsername('0329646588');
                                        setPassword('TestClient123@');
                                    }}
                                    style={styles.quickFillButton}
                                >
                                    Account 2
                                </Button>
                            </View>
                        </View>
                    </Card.Content>
                </Card>
            </ScrollView>

            <Snackbar
                visible={!!error}
                onDismiss={() => setError('')}
                duration={3000}
                action={{ label: 'Đóng', onPress: () => setError('') }}
            >
                {error}
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
        marginBottom: 16,
    },
    button: {
        marginTop: 8,
        paddingVertical: 8,
    },
    linkButton: {
        marginTop: 16,
    },
    quickFillContainer: {
        marginTop: 24,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
    },
    quickFillLabel: {
        textAlign: 'center',
        color: '#888',
        marginBottom: 8,
    },
    quickFillButtons: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
    },
    quickFillButton: {
        flex: 1,
    },
});
