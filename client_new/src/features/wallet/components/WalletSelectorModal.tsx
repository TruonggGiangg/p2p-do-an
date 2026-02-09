import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    FlatList,
    Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/ThemeContext';
import { CommonButton, CommonInput, CommonCard, BinanceHeader } from '../../../components';
import { formatCurrency } from '../../../shared/utils';
import type { Wallet } from '../../../types/auth.types';

interface WalletSelectorModalProps {
    visible: boolean;
    onClose: () => void;
    wallets: Wallet[];
    selectedWalletId?: string;
    onSelect: (wallet: Wallet) => void;
    title?: string;
}

export const WalletSelectorModal: React.FC<WalletSelectorModalProps> = ({
    visible,
    onClose,
    wallets,
    selectedWalletId,
    onSelect,
    title = 'Select Wallet',
}) => {
    const { theme } = useTheme();

    const renderWalletItem = ({ item }: { item: Wallet }) => {
        const walletId = item.fineractId || item.accountNo || item.id || item._id;
        const isSelected = walletId === selectedWalletId;

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                    onSelect(item);
                    onClose();
                }}
                style={styles.walletItem}
            >
                <CommonCard
                    style={StyleSheet.flatten([
                        styles.walletCard,
                        isSelected && { borderColor: theme.colors.primary, borderWidth: 1 }
                    ])}
                >
                    <View style={styles.walletInfo}>
                        <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary + '15' }]}>
                            <MaterialCommunityIcons name="wallet-outline" size={24} color={theme.colors.primary} />
                        </View>
                        <View style={styles.details}>
                            <Text style={[styles.walletName, { color: theme.colors.textPrimary }]}>
                                {item.productName || item.metadata?.productName || 'e Wallet'}
                            </Text>
                            <Text style={[styles.walletNo, { color: theme.colors.textDim }]}>
                                {item.accountNo || 'N/A'}
                            </Text>
                        </View>
                        <View style={styles.balanceContainer}>
                            <Text style={[styles.balance, { color: theme.colors.textPrimary }]}>
                                {formatCurrency(item.balance || 0)}
                            </Text>
                            {item.isDefault && (
                                <View style={[styles.defaultBadge, { backgroundColor: theme.colors.primary + '15' }]}>
                                    <Text style={[styles.defaultText, { color: theme.colors.primary }]}>Default</Text>
                                </View>
                            )}
                            {isSelected && (
                                <MaterialCommunityIcons name="check-circle" size={20} color={theme.colors.primary} />
                            )}
                        </View>
                    </View>
                </CommonCard>
            </TouchableOpacity>
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={false}
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
                <BinanceHeader
                    mode="standard"
                    title={title}
                    showBack={false}
                    rightComponents={
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <MaterialCommunityIcons name="close" size={24} color={theme.colors.textPrimary} />
                        </TouchableOpacity>
                    }
                />

                <FlatList
                    data={wallets}
                    renderItem={renderWalletItem}
                    keyExtractor={(item) => (item.fineractId || item.accountNo || item.id || item._id || Math.random().toString())}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons name="wallet-outline" size={48} color={theme.colors.textDim} />
                            <Text style={[styles.emptyText, { color: theme.colors.textDim }]}>
                                No wallets available
                            </Text>
                        </View>
                    }
                />
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    closeButton: {
        padding: 4,
    },
    listContent: {
        padding: 20,
        paddingTop: 10,
    },
    walletItem: {
        marginBottom: 12,
    },
    walletCard: {
        padding: 16,
    },
    walletInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    details: {
        flex: 1,
    },
    walletName: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
    walletNo: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    balanceContainer: {
        alignItems: 'flex-end',
        gap: 4,
    },
    balance: {
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
    },
    defaultBadge: {
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
        marginTop: 2,
    },
    defaultText: {
        fontSize: 9,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 100,
        gap: 16,
    },
    emptyText: {
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
    },
});
