import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { CommonButton, CommonCard } from '../../../components';

export const PinSection: React.FC = () => {
    const { theme } = useTheme();
    const { user } = useAuth();
    const navigation = useNavigation();
    const [expanded, setExpanded] = useState(false);

    const hasPin = user?.hasPin;

    return (
        <View style={styles.card}>
            <View style={styles.section}>
                <TouchableOpacity
                    style={styles.header}
                    onPress={() => setExpanded(!expanded)}
                    activeOpacity={0.7}
                >
                    <View style={styles.headerLeft}>
                        <View style={[styles.iconWrapper, { backgroundColor: hasPin ? theme.colors.primary + '15' : theme.colors.warning + '15' }]}>
                            <MaterialCommunityIcons
                                name={hasPin ? "shield-check-outline" : "shield-alert-outline"}
                                size={22}
                                color={hasPin ? theme.colors.primary : theme.colors.warning}
                            />
                        </View>
                        <View style={styles.titleContainer}>
                            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
                                Mã PIN bảo mật
                            </Text>
                            <Text style={[styles.sectionSubtitle, { color: theme.colors.textMuted }]}>
                                {hasPin ? 'Đang hoạt động' : 'Chưa thiết lập'}
                            </Text>
                        </View>
                    </View>
                    <MaterialCommunityIcons
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={theme.colors.textDim}
                    />
                </TouchableOpacity>

                {expanded && (
                    <View style={styles.content}>
                        <Text style={[styles.description, { color: theme.colors.textSecondary }]}>
                            {hasPin
                                ? 'Mã PIN giúp bảo vệ các giao dịch và thông tin nhạy cảm của bạn một cách an toàn.'
                                : 'Bạn chưa thiết lập mã PIN bảo mật. Hãy thiết lập ngay để bảo vệ tài khoản và thực hiện các giao dịch.'}
                        </Text>

                        <View style={styles.actions}>
                            {!hasPin ? (
                                <CommonButton
                                    title="Thiết lập mã PIN"
                                    onPress={() => (navigation as any).getParent()?.navigate('PinSetup')}
                                    icon="lock-plus"
                                    style={styles.actionBtn}
                                />
                            ) : (
                                <CommonButton
                                    title="Đổi mã PIN"
                                    onPress={() => (navigation as any).getParent()?.navigate('PinChange')}
                                    variant="outline"
                                    icon="lock-reset"
                                    style={styles.actionBtn}
                                />
                            )}
                        </View>
                    </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        paddingVertical: 14,
        paddingHorizontal: 18,
    },
    section: {
        width: '100%',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    iconWrapper: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    titleContainer: {
        flex: 1,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
    },
    sectionSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginTop: 2,
    },
    content: {
        marginTop: 16,
        paddingTop: 16,
    },
    description: {
        fontSize: 13,
        lineHeight: 20,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 16,
    },
    actions: {
        width: '100%',
    },
    actionBtn: {
        height: 48,
    },
});
