import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CommonButton, CommonInput, CommonCard, BinanceHeader } from '../../../components';
import { useTheme } from '../../../contexts/ThemeContext';
import { walletAPI } from '../api/wallet.api';
import { formatCurrency } from '../../../shared/utils';
import type { Wallet } from '../../../types/auth.types';
import { WalletSelectorModal } from '../components/WalletSelectorModal';

export default function TransferScreen() {
    const navigation = useNavigation();
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();

    const [recipientAccountNo, setRecipientAccountNo] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
    const [isWalletModalVisible, setIsWalletModalVisible] = useState(false);

    useEffect(() => {
        fetchWallets();
    }, []);

    const fetchWallets = async () => {
        try {
            const response = await walletAPI.getWallets();
            const eWallets = response.wallets.filter(w => w.type === 'e_wallet');
            setWallets(eWallets);

            if (eWallets.length > 0) {
                // Ưu tiên chọn ví mặc định
                const defaultWallet = eWallets.find(w => w.isDefault);
                setSelectedWallet(defaultWallet || eWallets[0]);
            }
        } catch (error) {
            console.error('Failed to fetch wallets:', error);
        }
    };

    const handleTransfer = async () => {
        if (!recipientAccountNo || !amount || !selectedWallet) {
            Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ thông tin');
            return;
        }

        const amountNum = parseInt(amount, 10);
        if (isNaN(amountNum) || amountNum < 1000) {
            Alert.alert('Lỗi', 'Số tiền không hợp lệ (tối thiểu 1,000 đ)');
            return;
        }

        if (amountNum > (selectedWallet.balance || 0)) {
            Alert.alert('Lỗi', 'Số dư không đủ');
            return;
        }

        setLoading(true);
        try {
            const fromWalletId = selectedWallet.fineractId || selectedWallet.accountNo;
            if (!fromWalletId) throw new Error('Không tìm thấy ID ví nguồn');

            const result = await walletAPI.transferByAccountNumber({
                fromWalletId,
                recipientAccountNo,
                amount: amountNum,
                description,
            });

            Alert.alert('Thành công', `Đã chuyển ${amountNum.toLocaleString()} VND đến tài khoản ${recipientAccountNo}`, [
                { text: 'OK', onPress: () => navigation.goBack() }
            ]);
        } catch (error: any) {
            Alert.alert('Thất bại', error.message || 'Có lỗi xảy ra khi chuyển tiền');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: theme.colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <BinanceHeader
                mode="standard"
                title="Chuyển tiền"
                showBack={true}
            />

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Source Wallet Display */}
                <TouchableOpacity activeOpacity={0.8} onPress={() => setIsWalletModalVisible(true)}>
                    <CommonCard style={styles.walletCard}>
                        <Text style={[styles.label, { color: theme.colors.textDim }]}>From Wallet</Text>
                        <View style={styles.walletInfo}>
                            <View style={[styles.walletIcon, { backgroundColor: theme.colors.primary + '15' }]}>
                                <MaterialCommunityIcons name="wallet-outline" size={20} color={theme.colors.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.walletName, { color: theme.colors.textPrimary }]}>
                                    {selectedWallet?.productName || selectedWallet?.metadata?.productName || 'Select Wallet'}
                                </Text>
                                <Text style={[styles.walletBalance, { color: theme.colors.textDim }]}>
                                    Balance: {formatCurrency(selectedWallet?.balance || 0)}
                                </Text>
                            </View>
                            <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.textDim} />
                        </View>
                    </CommonCard>
                </TouchableOpacity>

                {/* Input Form */}
                <View style={styles.form}>
                    <View style={styles.inputGroup}>
                        <CommonInput
                            label="Recipient Account Number"
                            placeholder="Enter account number"
                            value={recipientAccountNo}
                            onChangeText={setRecipientAccountNo}
                            keyboardType="numeric"
                            icon="account-cash-outline"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <CommonInput
                            label="Amount (VND)"
                            placeholder="Enter amount"
                            value={amount}
                            onChangeText={setAmount}
                            keyboardType="numeric"
                            icon="currency-usd"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <CommonInput
                            label="Note (Optional)"
                            placeholder="What is this for?"
                            value={description}
                            onChangeText={setDescription}
                        />
                    </View>
                </View>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
                <CommonButton
                    title={loading ? "Processing..." : "Confirm Transfer"}
                    onPress={handleTransfer}
                    variant="primary"
                    disabled={loading || !recipientAccountNo || !amount}
                />
            </View>

            <WalletSelectorModal
                visible={isWalletModalVisible}
                onClose={() => setIsWalletModalVisible(false)}
                wallets={wallets}
                selectedWalletId={selectedWallet?.fineractId || selectedWallet?.accountNo || selectedWallet?.id || selectedWallet?._id}
                onSelect={(wallet) => setSelectedWallet(wallet)}
                title="Chọn ví nguồn"
            />
        </KeyboardAvoidingView>
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
        paddingHorizontal: 20,
        paddingBottom: 15,
    },
    backBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
    },
    scrollContent: {
        padding: 20,
    },
    walletCard: {
        padding: 15,
        marginBottom: 25,
    },
    label: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 8,
    },
    walletInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    walletIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    walletName: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
    },
    walletBalance: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
    },
    form: {
        gap: 20,
    },
    inputGroup: {
        gap: 8,
    },
    inputLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    footer: {
        paddingHorizontal: 20,
        backgroundColor: 'transparent',
    },
});
