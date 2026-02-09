import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { walletAPI, WalletTransaction } from '../../wallet/api/wallet.api';
import { formatCurrency } from '../../../shared/utils';
import { BinanceHeader } from '../../../components';

export default function NotificationScreen() {
    const navigation = useNavigation();
    const { theme } = useTheme();
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchTransactions = async () => {
        try {
            const response = await walletAPI.getTransactions(50, 0);
            setTransactions(response.transactions || []);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchTransactions();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchTransactions();
    };

    const renderNotificationItem = ({ item }: { item: WalletTransaction }) => {
        const isIncome = item.type === 'deposit' || item.type === 'transfer_in';
        const date = new Date(item.date);
        const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

        return (
            <View style={[styles.notificationItem, { borderBottomColor: theme.colors.border }]}>
                <View style={[styles.iconContainer, { backgroundColor: isIncome ? theme.colors.success + '20' : theme.colors.error + '20' }]}>
                    <MaterialCommunityIcons
                        name={isIncome ? 'plus' : 'minus'}
                        size={24}
                        color={isIncome ? theme.colors.success : theme.colors.error}
                    />
                </View>
                <View style={styles.contentContainer}>
                    <View style={styles.headerRow}>
                        <Text
                            style={[styles.title, { color: theme.colors.textPrimary }]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                        >
                            {isIncome ? 'Nhận tiền' : 'Chuyển tiền'}
                        </Text>
                        <Text style={[styles.amount, { color: isIncome ? theme.colors.success : theme.colors.error }]}>
                            {isIncome ? '+' : '-'}{formatCurrency(item.amount)}
                        </Text>
                    </View>
                    <Text
                        style={[styles.description, { color: theme.colors.textSecondary }]}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                    >
                        {item.description || (isIncome ? 'Nạp tiền vào tài khoản' : 'Thanh toán/Chuyển tiền')}
                    </Text>
                    <Text style={[styles.time, { color: theme.colors.textDim }]}>
                        {timeStr} | {dateStr}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <BinanceHeader title="Thông báo" mode="standard" />

            {loading ? (
                <View style={styles.loader}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={transactions}
                    keyExtractor={(item) => item.id}
                    renderItem={renderNotificationItem}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <MaterialCommunityIcons name="bell-off-outline" size={64} color={theme.colors.textDim} />
                            <Text style={[styles.emptyText, { color: theme.colors.textDim }]}>Không có thông báo nào</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
    },
    headerAction: {
        padding: 4,
    },
    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    tab: {
        paddingVertical: 12,
        marginRight: 24,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
    },
    tabText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
    },
    activeTabText: {
        fontFamily: 'Poppins_600SemiBold',
    },
    listContent: {
        paddingBottom: 20,
    },
    notificationItem: {
        flexDirection: 'row',
        padding: 16,
        borderBottomWidth: 1,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    contentContainer: {
        flex: 1,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    title: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        flex: 1,
        marginRight: 8,
    },
    amount: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
    },
    description: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 6,
    },
    time: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    loader: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 100,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
});
