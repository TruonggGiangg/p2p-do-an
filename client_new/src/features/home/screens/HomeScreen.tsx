import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    ActivityIndicator,
    RefreshControl,
    Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../contexts/AuthContext';
import { walletAPI } from '../../wallet/api/wallet.api';
import { bnplAPI } from '../../bnpl/api/bnpl.api';
import { BinanceHeader, CommonCard, CommonButton, QuickAction, QRCodeDisplay } from '../../../components';
import { TransferModal } from '../../wallet/components/TransferModal';
import { useTheme } from '../../../contexts/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Wallet } from '../../../types/auth.types';
import { formatCurrency } from '../../../shared/utils';

export default function HomeScreen() {
    const navigation = useNavigation();
    const { user, refreshUser } = useAuth();
    const { theme } = useTheme();
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [walletsLoading, setWalletsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [transferModalVisible, setTransferModalVisible] = useState(false);
    const [qrCodeVisible, setQrCodeVisible] = useState(false);
    const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);

    const fetchWallets = async () => {
        setWalletsLoading(true);
        try {
            let response = await walletAPI.getWallets();
            let walletData = response.wallets || [];

            if (walletData.length === 0) {
                await walletAPI.syncWallets();
                response = await walletAPI.getWallets();
                walletData = response.wallets || [];
            }

            const eWallets = walletData.filter((w: Wallet) => w.type === 'e_wallet');
            setWallets(eWallets);
        } catch (error: any) {
            console.error('Failed to fetch wallets:', error);
        } finally {
            setWalletsLoading(false);
        }
    };


    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await walletAPI.syncWallets();
        } catch (error) {
            console.error('[HomeScreen] Sync failed during refresh:', error);
        }
        await Promise.all([refreshUser(), fetchWallets()]);
        setRefreshing(false);
    }, [refreshUser]);

    useEffect(() => {
        fetchWallets();
    }, []);

    useEffect(() => {
        if (wallets.length > 0) {
            const defaultWallet = wallets[0];
            const defaultWalletId = defaultWallet.fineractId || defaultWallet.accountNo || defaultWallet.id || null;
            if (defaultWalletId && !selectedWalletId) {
                setSelectedWalletId(defaultWalletId);
            }
        }
    }, [wallets]);


    const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <BinanceHeader
                mode="dashboard"
                onAvatarPress={() => (navigation as any).navigate('Profile')}
                onSearchPress={() => { }}
            />

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
                }
            >
                {/* Portfolio Card */}
                <View style={styles.portfolioSection}>
                    <CommonCard>
                        <View style={styles.portfolioHeader}>
                            <Text style={[styles.portfolioTitle, { color: theme.colors.textSecondary }]}>Total Assets (VND)</Text>
                            <MaterialCommunityIcons name="eye-outline" size={16} color={theme.colors.textDim} />
                        </View>

                        <View style={styles.balanceRow}>
                            <Text style={[styles.balanceMajor, { color: theme.colors.textPrimary }]}>
                                {formatCurrency(totalBalance)}
                            </Text>
                        </View>

                        <View style={styles.portfolioActions}>
                            <CommonButton
                                title="Deposit"
                                variant="primary"
                                style={{ flex: 1, height: 44 }}
                                textStyle={{ fontSize: 13, color: '#000' }}
                                onPress={() => { }}
                            />
                            <CommonButton
                                title="Withdraw"
                                variant="secondary"
                                style={{ flex: 1, height: 44, backgroundColor: theme.colors.surfaceLight }}
                                textStyle={{ fontSize: 13, color: theme.colors.textPrimary }}
                                onPress={() => { }}
                            />
                        </View>
                    </CommonCard>
                </View>

                {/* Quick Shortcuts */}
                <View style={styles.shortcutGrid}>
                    {[
                        { icon: 'card-account-details-outline', label: 'BNPL', color: theme.colors.primary, onPress: () => (navigation as any).navigate('BNPL') },
                        { icon: 'send-outline', label: 'Transfer', color: theme.colors.primary, onPress: () => (navigation as any).getParent()?.navigate('Transfer') },
                        { icon: 'wallet-outline', label: 'Wallets', color: theme.colors.primary, onPress: () => (navigation as any).getParent()?.navigate('Wallets') },
                        { icon: 'history', label: 'History', color: theme.colors.primary, onPress: () => (navigation as any).navigate('Notifications') },
                    ].map((item, idx) => (
                        <TouchableOpacity key={idx} style={styles.shortcutItem} onPress={item.onPress}>
                            <View style={[styles.shortcutIcon, { backgroundColor: theme.colors.surfaceLight }]}>
                                <MaterialCommunityIcons name={item.icon as any} size={24} color={item.color} />
                            </View>
                            <Text style={[styles.shortcutLabel, { color: theme.colors.textPrimary }]}>{item.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>

            <TransferModal
                visible={transferModalVisible}
                onClose={() => setTransferModalVisible(false)}
                wallets={wallets}
                onSuccess={onRefresh}
            />
            <Modal visible={qrCodeVisible} animationType="slide" transparent onRequestClose={() => setQrCodeVisible(false)}>
                <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
                    <QRCodeDisplay phone={user?.username || ''} name={user?.name} onClose={() => setQrCodeVisible(false)} />
                </View>
            </Modal>
        </View>
    );
}


const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: 40 },
    portfolioSection: { paddingHorizontal: 20, marginVertical: 10 },
    portfolioHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    portfolioTitle: { fontSize: 12 },
    balanceRow: { marginBottom: 20 },
    balanceMajor: { fontSize: 32, fontWeight: '700' },
    portfolioActions: { flexDirection: 'row', gap: 12 },
    shortcutGrid: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 32 },
    shortcutItem: { alignItems: 'center', width: 80, gap: 8 },
    shortcutIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    shortcutLabel: { fontSize: 12, textAlign: 'center', fontWeight: '600' },
    transactionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
});
