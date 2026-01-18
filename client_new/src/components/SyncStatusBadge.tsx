import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type SyncStatus = 'registered' | 'synced' | 'no_fineract_client' | 'no_wallets' | 'complete' | 'incomplete' | 'partial';

interface SyncStatusBadgeProps {
    status?: SyncStatus | string;
    lastSyncAt?: string;
    error?: string;
}

const getStatusConfig = (status?: string): { color: string; bgColor: string; label: string; icon: string } => {
    switch (status) {
        case 'complete':
        case 'synced':
            return { color: '#10b981', bgColor: '#064e3b', label: 'Đã đồng bộ', icon: '✅' };
        case 'registered':
            return { color: '#3b82f6', bgColor: '#1e3a5f', label: 'Đã đăng ký', icon: '📝' };
        case 'partial':
            return { color: '#f59e0b', bgColor: '#78350f', label: 'Đồng bộ một phần', icon: '⚠️' };
        case 'no_wallets':
            return { color: '#f59e0b', bgColor: '#78350f', label: 'Chưa có ví', icon: '💼' };
        case 'no_fineract_client':
            return { color: '#ef4444', bgColor: '#7f1d1d', label: 'Chưa có tài khoản ngân hàng', icon: '🏦' };
        case 'incomplete':
            return { color: '#ef4444', bgColor: '#7f1d1d', label: 'Chưa hoàn tất', icon: '❌' };
        default:
            return { color: '#6b7280', bgColor: '#374151', label: 'Không xác định', icon: '❓' };
    }
};

const formatDate = (dateStr?: string): string => {
    if (!dateStr) return 'Chưa có';
    const date = new Date(dateStr);
    return date.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({ status, lastSyncAt, error }) => {
    const config = getStatusConfig(status);

    return (
        <View style={styles.container}>
            <View style={[styles.badge, { backgroundColor: config.bgColor, borderColor: config.color }]}>
                <Text style={styles.icon}>{config.icon}</Text>
                <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
            </View>

            {lastSyncAt && (
                <Text style={styles.timestamp}>Cập nhật: {formatDate(lastSyncAt)}</Text>
            )}

            {error && (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>⚠️ {error}</Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: 8,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        alignSelf: 'flex-start',
    },
    icon: {
        fontSize: 16,
        marginRight: 8,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
    },
    timestamp: {
        fontSize: 12,
        color: '#9ca3af',
        marginTop: 8,
    },
    errorContainer: {
        backgroundColor: '#7f1d1d',
        padding: 10,
        borderRadius: 8,
        marginTop: 8,
    },
    errorText: {
        color: '#fca5a5',
        fontSize: 12,
    },
});

export default SyncStatusBadge;
