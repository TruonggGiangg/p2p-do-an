import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { RoleBadges } from '../components/RoleBadge';
import { SyncStatusBadge } from '../components/SyncStatusBadge';

export default function ProfileScreen() {
    const { user, logout } = useAuth();

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                        {user?.profile?.firstName?.[0] || user?.username?.[0] || '?'}
                    </Text>
                </View>
                <Text style={styles.name}>
                    {user?.name || `${user?.profile?.firstName || ''} ${user?.profile?.lastName || ''}`.trim() || user?.username}
                </Text>
                <Text style={styles.email}>
                    {user?.email}
                </Text>
                <RoleBadges roles={user?.roles || []} />
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Trạng thái đồng bộ</Text>
                <SyncStatusBadge
                    status={user?.metadata?.syncStatus}
                    lastSyncAt={user?.metadata?.lastSyncAt}
                    error={user?.metadata?.syncError}
                />
            </View>

            <View style={styles.section}>
                <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                    <Text style={styles.logoutText}>Đăng xuất</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f3f4f6',
        padding: 20,
    },
    header: {
        alignItems: 'center',
        marginBottom: 30,
        backgroundColor: 'white',
        padding: 20,
        borderRadius: 16,
    },
    avatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#6366f1',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    avatarText: {
        color: 'white',
        fontSize: 32,
        fontWeight: 'bold',
    },
    name: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    email: {
        fontSize: 16,
        color: '#6b7280',
        marginBottom: 12,
    },
    section: {
        marginBottom: 20,
        backgroundColor: 'white',
        padding: 16,
        borderRadius: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
        color: '#1f2937',
    },
    logoutButton: {
        backgroundColor: '#ef4444',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    logoutText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
});
