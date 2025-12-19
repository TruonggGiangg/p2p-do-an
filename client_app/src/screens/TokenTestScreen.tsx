import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Card, Text, Button, Snackbar, List, Divider, Chip } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import { authApi, storageService, keycloakApi } from '../services';

interface TokenPayload {
    _id: string;
    email?: string;
    name?: string;
    roles?: string[];
    iat: number;
    exp: number;
}

interface TokenInfo {
    accessToken: string;
    refreshToken: string;
    payload: TokenPayload;
}

export default function TokenTestScreen() {
    const { refreshToken } = useAuth();
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState<'success' | 'error'>('success');
    const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);

    const showMessage = (msg: string, type: 'success' | 'error') => {
        setMessage(msg);
        setMessageType(type);
    };

    const handleGetTokenInfo = async () => {
        setLoading(true);
        try {
            const accessToken = await storageService.getAccessToken();
            const refreshTokenValue = await storageService.getRefreshToken();

            if (accessToken) {
                const payload = keycloakApi.decodeToken(accessToken);
                if (payload) {
                    setTokenInfo({
                        accessToken: accessToken.substring(0, 50) + '...',
                        refreshToken: (refreshTokenValue?.substring(0, 50) || '') + '...',
                        payload: {
                            _id: payload._id,
                            email: payload.email,
                            name: payload.name,
                            roles: payload.roles,
                            iat: payload.iat,
                            exp: payload.exp,
                        },
                    });
                    showMessage('Token info loaded', 'success');
                }
            } else {
                showMessage('No token found', 'error');
            }
        } catch (error: any) {
            showMessage('Error: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleRefreshToken = async () => {
        setLoading(true);
        try {
            await refreshToken();
            showMessage('✅ Token refreshed successfully!', 'success');
            await handleGetTokenInfo();
        } catch (error: any) {
            showMessage('❌ Refresh failed: ' + (error.response?.data?.message || error.message), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleTestMe = async () => {
        setLoading(true);
        try {
            const response = await authApi.getMe();
            showMessage('✅ /auth/me works! User: ' + response.data?.name, 'success');
        } catch (error: any) {
            showMessage('❌ /auth/me failed: ' + (error.response?.data?.message || error.message), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleTestUserInfo = async () => {
        setLoading(true);
        try {
            const response = await authApi.getUserInfo();
            showMessage('✅ /auth/userinfo works! Keycloak ID: ' + response.data?.keycloakDetails?.id, 'success');
        } catch (error: any) {
            showMessage('❌ /auth/userinfo failed: ' + (error.response?.data?.message || error.message), 'error');
        } finally {
            setLoading(false);
        }
    };

    const formatTimestamp = (timestamp: number): string => {
        return new Date(timestamp * 1000).toLocaleString();
    };

    return (
        <ScrollView style={styles.container}>
            <Card style={styles.card}>
                <Card.Content>
                    <Text variant="titleLarge" style={styles.title}>
                        🔑 Token Test
                    </Text>
                    <Text variant="bodyMedium" style={styles.subtitle}>
                        Test các API authentication
                    </Text>
                </Card.Content>
            </Card>

            <Card style={styles.card}>
                <Card.Content>
                    <Text variant="titleMedium" style={styles.sectionTitle}>
                        API Tests
                    </Text>
                    <Divider style={styles.divider} />

                    <Button
                        mode="outlined"
                        onPress={handleGetTokenInfo}
                        loading={loading}
                        style={styles.testButton}
                        icon="information"
                    >
                        Get Token Info
                    </Button>

                    <Button
                        mode="outlined"
                        onPress={handleRefreshToken}
                        loading={loading}
                        style={styles.testButton}
                        icon="refresh"
                    >
                        Refresh Token
                    </Button>

                    <Button
                        mode="outlined"
                        onPress={handleTestMe}
                        loading={loading}
                        style={styles.testButton}
                        icon="account"
                    >
                        Test /auth/me
                    </Button>

                    <Button
                        mode="outlined"
                        onPress={handleTestUserInfo}
                        loading={loading}
                        style={styles.testButton}
                        icon="account-details"
                    >
                        Test /auth/userinfo
                    </Button>
                </Card.Content>
            </Card>

            {tokenInfo && (
                <Card style={styles.card}>
                    <Card.Content>
                        <Text variant="titleMedium" style={styles.sectionTitle}>
                            Current Token Info
                        </Text>
                        <Divider style={styles.divider} />

                        <List.Item
                            title="Access Token"
                            description={tokenInfo.accessToken}
                            descriptionNumberOfLines={2}
                            left={(props) => <List.Icon {...props} icon="key" />}
                        />
                        <List.Item
                            title="Refresh Token"
                            description={tokenInfo.refreshToken}
                            descriptionNumberOfLines={2}
                            left={(props) => <List.Icon {...props} icon="key-variant" />}
                        />

                        <Divider style={styles.divider} />
                        <Text variant="titleSmall" style={styles.payloadTitle}>
                            Token Payload
                        </Text>

                        <List.Item
                            title="User ID"
                            description={tokenInfo.payload._id}
                            left={(props) => <List.Icon {...props} icon="identifier" />}
                        />
                        <List.Item
                            title="Email"
                            description={tokenInfo.payload.email}
                            left={(props) => <List.Icon {...props} icon="email" />}
                        />
                        <List.Item
                            title="Name"
                            description={tokenInfo.payload.name}
                            left={(props) => <List.Icon {...props} icon="account" />}
                        />
                        <List.Item
                            title="Issued At"
                            description={formatTimestamp(tokenInfo.payload.iat)}
                            left={(props) => <List.Icon {...props} icon="clock-start" />}
                        />
                        <List.Item
                            title="Expires At"
                            description={formatTimestamp(tokenInfo.payload.exp)}
                            left={(props) => <List.Icon {...props} icon="clock-end" />}
                        />

                        <View style={styles.rolesContainer}>
                            {tokenInfo.payload.roles?.map((role: string, index: number) => (
                                <Chip key={index} style={styles.roleChip}>
                                    {role}
                                </Chip>
                            ))}
                        </View>
                    </Card.Content>
                </Card>
            )}

            <Snackbar
                visible={!!message}
                onDismiss={() => setMessage('')}
                duration={3000}
                style={{ backgroundColor: messageType === 'success' ? '#4CAF50' : '#f44336' }}
            >
                {message}
            </Snackbar>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        padding: 16,
    },
    card: {
        marginBottom: 16,
    },
    title: {
        fontWeight: 'bold',
        textAlign: 'center',
    },
    subtitle: {
        textAlign: 'center',
        color: '#666',
    },
    sectionTitle: {
        fontWeight: 'bold',
        marginBottom: 8,
    },
    divider: {
        marginVertical: 8,
    },
    testButton: {
        marginVertical: 4,
    },
    payloadTitle: {
        fontWeight: 'bold',
        marginTop: 8,
        marginBottom: 4,
    },
    rolesContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 12,
    },
    roleChip: {
        backgroundColor: '#e3f2fd',
    },
});
