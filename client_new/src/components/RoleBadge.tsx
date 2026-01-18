import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface RoleBadgeProps {
    role: string;
    size?: 'small' | 'medium' | 'large';
}

const getRoleConfig = (role: string): { color: string; bgColor: string; label: string; icon: string } => {
    const lowerRole = role.toLowerCase();

    if (lowerRole.includes('admin') || lowerRole.includes('operator')) {
        return { color: '#a855f7', bgColor: '#581c87', label: 'Quản trị viên', icon: '👑' };
    }
    if (lowerRole.includes('lender') || lowerRole.includes('investor')) {
        return { color: '#10b981', bgColor: '#064e3b', label: 'Nhà đầu tư', icon: '💰' };
    }
    if (lowerRole.includes('borrower')) {
        return { color: '#3b82f6', bgColor: '#1e3a5f', label: 'Người vay', icon: '🙋' };
    }
    // Default user role
    return { color: '#6b7280', bgColor: '#374151', label: role, icon: '👤' };
};

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, size = 'medium' }) => {
    const config = getRoleConfig(role);

    const sizeStyles = {
        small: { paddingH: 8, paddingV: 3, fontSize: 11, iconSize: 12 },
        medium: { paddingH: 12, paddingV: 5, fontSize: 13, iconSize: 14 },
        large: { paddingH: 16, paddingV: 8, fontSize: 15, iconSize: 18 },
    };

    const s = sizeStyles[size];

    return (
        <View style={[
            styles.badge,
            {
                backgroundColor: config.bgColor,
                borderColor: config.color,
                paddingHorizontal: s.paddingH,
                paddingVertical: s.paddingV,
            }
        ]}>
            <Text style={[styles.icon, { fontSize: s.iconSize }]}>{config.icon}</Text>
            <Text style={[styles.label, { color: config.color, fontSize: s.fontSize }]}>{config.label}</Text>
        </View>
    );
};

interface RoleBadgesProps {
    roles?: string[];
    size?: 'small' | 'medium' | 'large';
}

export const RoleBadges: React.FC<RoleBadgesProps> = ({ roles, size = 'medium' }) => {
    if (!roles || roles.length === 0) {
        return <RoleBadge role="user" size={size} />;
    }

    // Filter out default Keycloak roles
    const filteredRoles = roles.filter(role =>
        !['default-roles-fineract', 'offline_access', 'uma_authorization'].includes(role)
    );

    if (filteredRoles.length === 0) {
        return <RoleBadge role="user" size={size} />;
    }

    return (
        <View style={styles.container}>
            {filteredRoles.map((role, index) => (
                <RoleBadge key={index} role={role} size={size} />
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        borderWidth: 1,
        marginRight: 6,
        marginBottom: 4,
    },
    icon: {
        marginRight: 6,
    },
    label: {
        fontWeight: '600',
    },
});

export default RoleBadge;
