import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { BlurView } from 'expo-blur';
import { CommonCard } from '../../../components/common/CommonCard';

interface KYCInfoRowProps {
    label: string;
    value: string;
    icon?: string;
    editable?: boolean;
    onEdit?: () => void;
}

const KYCInfoRow: React.FC<KYCInfoRowProps> = ({ label, value, icon, editable, onEdit }) => {
    const { theme } = useTheme();
    const c = theme.colors;

    return (
        <View style={[styles.row, { borderBottomColor: c.border + '60' }]}>
            <View style={styles.labelSection}>
                {icon && <Ionicons name={icon as any} size={16} color={c.textMuted} style={styles.rowIcon} />}
                <Text style={[styles.label, { color: c.textSecondary }]}>{label}</Text>
            </View>
            <View style={styles.valueSection}>
                <Text style={[styles.value, { color: c.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">
                    {value || '---'}
                </Text>
                {editable && (
                    <TouchableOpacity onPress={onEdit} style={styles.editBtn}>
                        <Ionicons name="create-outline" size={16} color={c.primary} />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

interface KYCInfoCardProps {
    title: string;
    data: { label: string; value: string; icon?: string; key: string }[];
    onEdit?: (key: string) => void;
    editable?: boolean;
}

export const KYCInfoCard: React.FC<KYCInfoCardProps> = ({ title, data, onEdit, editable }) => {
    const { theme } = useTheme();
    const c = theme.colors;

    return (
        <CommonCard style={styles.card}>
            <View style={styles.header}>
                <Text style={[styles.title, { color: c.textPrimary }]}>{title}</Text>
                <View style={[styles.line, { backgroundColor: c.primary }]} />
            </View>
            <View style={styles.content}>
                {data.map((item, index) => (
                    <KYCInfoRow
                        key={index}
                        label={item.label}
                        value={item.value}
                        icon={item.icon}
                        editable={editable}
                        onEdit={() => onEdit?.(item.key)}
                    />
                ))}
            </View>
        </CommonCard>
    );
};

const styles = StyleSheet.create({
    card: {
        marginBottom: 16,
        padding: 0,
        overflow: 'hidden',
    },
    header: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
        marginBottom: 4,
    },
    line: {
        width: 30,
        height: 3,
        borderRadius: 2,
    },
    content: {
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    labelSection: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 0.4,
    },
    rowIcon: {
        marginRight: 8,
    },
    label: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
    },
    valueSection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        flex: 0.6,
    },
    value: {
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
        textAlign: 'right',
    },
    editBtn: {
        marginLeft: 8,
        padding: 4,
    },
});
