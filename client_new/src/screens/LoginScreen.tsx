import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function LoginScreen({ navigation }: any) {
    const { login, isLoading } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = async () => {
        if (!username.trim() || !password.trim()) {
            Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ thông tin');
            return;
        }

        try {
            await login({ username, password });
            // Navigation will be handled by App.tsx based on auth state
        } catch (error: any) {
            Alert.alert('Đăng nhập thất bại', error.message);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.header}>
                    <Text style={styles.title}>Đăng nhập</Text>
                    <Text style={styles.subtitle}>Chào mừng trở lại!</Text>
                </View>

                <View style={styles.form}>
                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Số điện thoại</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Nhập số điện thoại"
                            value={username}
                            onChangeText={setUsername}
                            keyboardType="phone-pad"
                            autoCapitalize="none"
                            editable={!isLoading}
                        />
                    </View>

                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Mật khẩu</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Nhập mật khẩu"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            editable={!isLoading}
                        />
                    </View>

                    {/* Quick Fill Test Buttons - Only in Development */}
                    {__DEV__ && (
                        <View style={styles.testAccountsContainer}>
                            <Text style={styles.testAccountsTitle}>⚡ Test Accounts:</Text>
                            <View style={styles.testAccountsButtons}>
                                <TouchableOpacity
                                    style={styles.testButton}
                                    onPress={() => {
                                        setUsername('borrower1');
                                        setPassword('password');
                                    }}
                                    disabled={isLoading}
                                >
                                    <Text style={styles.testButtonText}>👤 Borrower</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.testButton}
                                    onPress={() => {
                                        setUsername('investor1');
                                        setPassword('password');
                                    }}
                                    disabled={isLoading}
                                >
                                    <Text style={styles.testButtonText}>💰 Investor</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.testButton}
                                    onPress={() => {
                                        setUsername('merchant1');
                                        setPassword('password');
                                    }}
                                    disabled={isLoading}
                                >
                                    <Text style={styles.testButtonText}>🏪 Merchant</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    <TouchableOpacity
                        style={[styles.button, isLoading && styles.buttonDisabled]}
                        onPress={handleLogin}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>Đăng nhập</Text>
                        )}
                    </TouchableOpacity>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Chưa có tài khoản? </Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                            <Text style={styles.linkText}>Đăng ký ngay</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
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
        padding: 20,
    },
    header: {
        marginBottom: 40,
        alignItems: 'center',
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#666',
    },
    form: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    inputContainer: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        backgroundColor: '#f9f9f9',
    },
    button: {
        backgroundColor: '#007AFF',
        borderRadius: 8,
        padding: 16,
        alignItems: 'center',
        marginTop: 10,
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
    },
    buttonDisabled: {
        backgroundColor: '#999',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 20,
    },
    footerText: {
        fontSize: 14,
        color: '#666',
    },
    linkText: {
        fontSize: 14,
        color: '#007AFF',
        fontWeight: '600',
    },
    testAccountsContainer: {
        marginVertical: 15,
        padding: 12,
        backgroundColor: '#FFF9E6',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#FFD700',
    },
    testAccountsTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: '#666',
        marginBottom: 8,
        textAlign: 'center',
    },
    testAccountsButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    testButton: {
        flex: 1,
        backgroundColor: '#fff',
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#FFD700',
        alignItems: 'center',
    },
    testButtonText: {
        fontSize: 11,
        color: '#333',
        fontWeight: '500',
    },
});
