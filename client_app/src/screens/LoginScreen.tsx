import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { TextInput, Button, Text, Surface } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../theme';

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
                        <View style={styles.iconContainer}>
                            <Text style={styles.iconText}>P2P</Text>
                        </View>
                        <Text variant="headlineLarge" style={styles.title}>
                            Welcome Back
                        </Text>
                        <Text variant="bodyLarge" style={styles.subtitle}>
                            Đăng nhập để tiếp tục
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

                        {error ? (
                            <Text style={styles.errorText}>{error}</Text>
                        ) : null}

                        <Button
                            mode="contained"
                            onPress={handleLogin}
                            loading={isLoading}
                            disabled={isLoading}
                            style={styles.button}
                            labelStyle={styles.buttonLabel}
                            contentStyle={{ height: 50 }}
                        >
                            Đăng Nhập
                        </Button>

                        <Button
                            mode="text"
                            onPress={() => navigation.navigate('Register')}
                            style={styles.linkButton}
                            labelStyle={{ fontFamily: 'Poppins_500Medium', color: Colors.primary }}
                        >
                            Tạo tài khoản mới
                        </Button>

                        <View style={styles.divider}>
                            <View style={styles.line} />
                            <Text style={styles.orText}>Test Account</Text>
                            <View style={styles.line} />
                        </View>

                        <View style={styles.quickFillContainer}>
                            <Button
                                mode="outlined"
                                compact
                                onPress={() => {
                                    setUsername('0987654321');
                                    setPassword('TestClient123@');
                                }}
                                style={styles.quickBtn}
                                labelStyle={{ fontSize: 12, fontFamily: 'Poppins_400Regular' }}
                            >
                                User 1
                            </Button>
                            <Button
                                mode="outlined"
                                compact
                                onPress={() => {
                                    setUsername('0329646588');
                                    setPassword('TestClient123@');
                                }}
                                style={styles.quickBtn}
                                labelStyle={{ fontSize: 12 }}
                            >
                                User 2
                            </Button>
                        </View>
                    </Surface>
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
        marginBottom: 40,
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 24,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    iconText: {
        color: '#fff',
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
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
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
    },
    line: {
        flex: 1,
        height: 1,
        backgroundColor: '#ECEFF1',
    },
    orText: {
        marginHorizontal: 10,
        color: Colors.textSecondary,
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    quickFillContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    quickBtn: {
        flex: 1,
        borderRadius: 12,
        borderColor: '#E3F2FD',
    }
});
