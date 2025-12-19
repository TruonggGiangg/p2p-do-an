import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Card, Text, Button, Avatar, List, Divider, Chip } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services';
import type { KeycloakUserDetails } from '../types';

export default function ProfileScreen() {
    const { user, logout, isLoading } = useAuth();
    const [keycloakDetails, setKeycloakDetails] = useState<KeycloakUserDetails | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    useEffect(() => {
        loadUserDetails();
    }, []);

    const loadUserDetails = async () => {
        setLoadingDetails(true);
        try {
            const response = await authApi.getUserInfo();
            setKeycloakDetails(response.data?.keycloakDetails || null);
        } catch (error) {
            console.error('[ProfileScreen] Load user details error:', error);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
        } catch (error) {
            console.error('[ProfileScreen] Logout error:', error);
        }
    };

    return (
        <ScrollView style={styles.container}>
            <Card style={styles.card}>
                <Card.Content style={styles.profileHeader}>
                    <Avatar.Text
                        size={80}
                        label={user?.name?.charAt(0) || 'U'}
                        style={styles.avatar}
                    />
                    <Text variant="headlineSmall" style={styles.name}>
                        {user?.name || 'Unknown User'}
                    </Text>
                    <Text variant="bodyMedium" style={styles.email}>
                        {user?.email}
                    </Text>
                    <View style={styles.rolesContainer}>
                        {user?.roles?.map((role, index) => (
                            <Chip key={index} style={styles.roleChip} textStyle={styles.roleText}>
                                {role}
                            </Chip>
                        ))}
                    </View>
                </Card.Content>
            </Card>

            <Card style={styles.card}>
                <Card.Content>
                    <Text variant="titleMedium" style={styles.sectionTitle}>
                        Thông tin tài khoản
                    </Text>
                    <Divider style={styles.divider} />

                    <List.Item
                        title="Keycloak ID"
                        description={user?.keycloakUserId}
                        left={(props) => <List.Icon {...props} icon="account-key" />}
                    />
                    <List.Item
                        title="Username"
                        description={user?.username}
                        left={(props) => <List.Icon {...props} icon="phone" />}
                    />
                    <List.Item
                        title="Email"
                        description={user?.email}
                        left={(props) => <List.Icon {...props} icon="email" />}
                    />

                    {keycloakDetails && (
                        <>
                            <Divider style={styles.divider} />
                            <Text variant="titleMedium" style={styles.sectionTitle}>
                                Keycloak Details
                            </Text>
                            <List.Item
                                title="First Name"
                                description={keycloakDetails.firstName}
                                left={(props) => <List.Icon {...props} icon="account" />}
                            />
                            <List.Item
                                title="Last Name"
                                description={keycloakDetails.lastName}
                                left={(props) => <List.Icon {...props} icon="account" />}
                            />
                            <List.Item
                                title="Email Verified"
                                description={keycloakDetails.emailVerified ? 'Yes' : 'No'}
                                left={(props) => <List.Icon {...props} icon="check-circle" />}
                            />
                            <List.Item
                                title="Account Enabled"
                                description={keycloakDetails.enabled ? 'Yes' : 'No'}
                                left={(props) => <List.Icon {...props} icon="account-check" />}
                            />
                        </>
                    )}
                </Card.Content>
            </Card>

            <Button
                mode="contained"
                onPress={loadUserDetails}
                loading={loadingDetails}
                style={styles.refreshButton}
                icon="refresh"
            >
                Refresh Details
            </Button>

            <Button
                mode="contained"
                onPress={handleLogout}
                loading={isLoading}
                style={styles.logoutButton}
                buttonColor="#f44336"
                icon="logout"
            >
                Đăng Xuất
            </Button>
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
    profileHeader: {
        alignItems: 'center',
        paddingVertical: 24,
    },
    avatar: {
        marginBottom: 16,
        backgroundColor: '#6200ee',
    },
    name: {
        fontWeight: 'bold',
        marginBottom: 4,
    },
    email: {
        color: '#666',
        marginBottom: 12,
    },
    rolesContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
    },
    roleChip: {
        backgroundColor: '#e3f2fd',
    },
    roleText: {
        fontSize: 12,
    },
    sectionTitle: {
        fontWeight: 'bold',
        marginBottom: 8,
    },
    divider: {
        marginVertical: 8,
    },
    refreshButton: {
        marginBottom: 12,
    },
    logoutButton: {
        marginBottom: 32,
    },
});
