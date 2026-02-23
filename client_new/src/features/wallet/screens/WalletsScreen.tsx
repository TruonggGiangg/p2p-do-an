import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { walletAPI } from '../api/wallet.api';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, WalletCard, CommonCard, CommonButton, FintechPullToRefresh, VentoUltimateLoading } from '../../../components';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Wallet } from '../../../types/auth.types';

export const WalletsScreen = () => {
    const navigation = useNavigation();
    const { theme } = useTheme();
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const fetchWallets = async () => {
        setLoading(true);
        const minDelay = new Promise(resolve => setTimeout(resolve, 1700));
        try {
            const [response] = await Promise.all([
                walletAPI.getWallets(),
                minDelay
            ]);
            setWallets(response.wallets || []);
        } catch (error) {
            console.error('[WalletsScreen] Failed to fetch wallets:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchWallets();
    }, []);

    useEffect(() => {
        fetchWallets();
    }, []);

    const handleSetDefault = async (wallet: Wallet) => {
        if (wallet.isDefault) return;

        const walletId = wallet.id || wallet._id;
        if (!walletId) return;

        Alert.alert(
            'Ví mặc định',
            `Bạn có muốn đặt ví ${wallet.productName || 'này'} làm ví mặc định không?`,
            [
                { text: 'Hủy', style: 'cancel' },
                {
                    text: 'Đồng ý',
                    onPress: async () => {
                        try {
                            await walletAPI.setDefaultWallet(walletId);
                            fetchWallets();
                        } catch (error) {
                            Alert.alert('Lỗi', 'Không thể đặt ví làm mặc định');
                        }
                    }
                }
            ]
        );
    };

    const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <BinanceHeader
                mode="standard"
                title="Funding Wallets"
                showBack={true}
            />

            <FintechPullToRefresh
                refreshing={refreshing}
                onRefresh={onRefresh}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Balance Summary Section (Binance Style) */}
                <View style={styles.headerSection}>
                    <CommonCard>
                        <Text style={[styles.totalLabel, { color: theme.colors.textSecondary }]}>Total Equity (VND)</Text>
                        <Text style={[styles.totalAmount, { color: theme.colors.textPrimary }]}>
                            {new Intl.NumberFormat('vi-VN').format(totalBalance)}
                        </Text>

                        <View style={styles.actionButtons}>
                            <CommonButton
                                title="Deposit"
                                variant="primary"
                                style={{ flex: 1, height: 40 }}
                                textStyle={{ fontSize: 13, color: '#000' }}
                                onPress={() => { }}
                            />
                            <CommonButton
                                title="Withdraw"
                                variant="secondary"
                                style={{ flex: 1, height: 40 }}
                                textStyle={{ fontSize: 13 }}
                                onPress={() => { }}
                            />
                            <CommonButton
                                title="Transfer"
                                variant="secondary"
                                style={{ flex: 1, height: 40 }}
                                textStyle={{ fontSize: 13 }}
                                onPress={() => { }}
                            />
                        </View>
                    </CommonCard>
                </View>

                {/* Wallets List Section */}
                <View style={styles.listSection}>
                    <View style={styles.listHeader}>
                        <Text style={[styles.listTitle, { color: theme.colors.textPrimary }]}>Assets</Text>
                        <MaterialCommunityIcons name="sort-variant" size={20} color={theme.colors.textDim} />
                    </View>

                    {loading && !refreshing ? (
                        <VentoUltimateLoading size={200} style={styles.loader} />
                    ) : wallets.length > 0 ? (
                        wallets.map((wallet) => (
                            <WalletCard
                                key={wallet.id || wallet.fineractId}
                                wallet={wallet}
                                onPress={() => handleSetDefault(wallet)}
                            />
                        ))
                    ) : (
                        <View style={styles.emptyContainer}>
                            <MaterialCommunityIcons name="wallet-outline" size={64} color={theme.colors.textDim} />
                            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                                No wallets found.
                            </Text>
                            <Text style={[styles.emptySubText, { color: theme.colors.textDim }]}>
                                Pull down to sync from Fineract.
                            </Text>
                        </View>
                    )}
                </View>
            </FintechPullToRefresh>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    headerSection: {
        padding: 20,
        paddingTop: 10,
    },
    totalLabel: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
    },
    totalAmount: {
        fontSize: 28,
        fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
        marginVertical: 8,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 16,
    },
    actionBtn: {
        flex: 1,
        height: 36,
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionBtnText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#000',
    },
    listSection: {
        marginTop: 10,
        paddingHorizontal: 20,
    },
    listHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    listTitle: {
        fontSize: 18,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
    },
    loader: {
        marginTop: 40,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 60,
        gap: 12,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 8,
    },
    emptySubText: {
        fontSize: 14,
        textAlign: 'center',
    },
});

export default WalletsScreen;
