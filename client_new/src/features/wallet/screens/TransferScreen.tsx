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
    Keyboard,
    TouchableWithoutFeedback,
} from 'react-native';
import { useNavigation, useRoute, NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { CommonButton, CommonInput, CommonCard, BinanceHeader } from '../../../components';
import { QRScanner } from '../../../components/QRScanner';
import { useTheme } from '../../../contexts/ThemeContext';
import { walletAPI } from '../api/wallet.api';
import { formatCurrency } from '../../../shared/utils';
import type { Wallet } from '../../../types/auth.types';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { WalletSelectorModal } from '../components/WalletSelectorModal';
import * as Haptics from 'expo-haptics';
import SmartOTPService from '../../../services/smart-otp.service';

export default function TransferScreen() {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const route = useRoute();
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const isDark = theme.mode === 'dark';
    const c = theme.colors;

    const { initialRecipientAccountNo, initialWallet } = (route.params as any) || {};

    const [recipientAccountNo, setRecipientAccountNo] = useState(initialRecipientAccountNo || '');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(initialWallet || null);
    const [isWalletModalVisible, setIsWalletModalVisible] = useState(false);
    const [qrScannerVisible, setQrScannerVisible] = useState(false);

    useEffect(() => {
        fetchWallets();
    }, []);

    useEffect(() => {
        if (initialRecipientAccountNo) {
            setRecipientAccountNo(initialRecipientAccountNo);
        }
    }, [initialRecipientAccountNo]);

    const fetchWallets = async () => {
        try {
            const response = await walletAPI.getWallets();
            const eWallets = response.wallets.filter(w => w.type === 'e_wallet' && w.status?.toLowerCase() === 'active');
            setWallets(eWallets);

            if (eWallets.length > 0 && !selectedWallet) {
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

        const amountNum = parseInt(amount.replace(/,/g, ''), 10);
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
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const fromWalletId = selectedWallet.fineractId || selectedWallet.accountNo || selectedWallet.id || selectedWallet._id;
            const deviceId = await SmartOTPService.getDeviceId();

            const result = await walletAPI.transferByAccountNumber({
                fromWalletId: fromWalletId as string,
                recipientAccountNo: recipientAccountNo.trim(),
                amount: amountNum,
                description: description.trim() || undefined,
                deviceId,
            });

            // Navigate to Confirm screen with session info
            navigation.navigate('TransferConfirm', {
                sessionId: result.sessionId,
                transactionData: {
                    fromWalletName: selectedWallet?.productName || 'Ví nguồn',
                    fromWalletId: String(fromWalletId),
                    recipientAccountNo: recipientAccountNo.trim(),
                    amount: amountNum,
                    description: description.trim(),
                }
            });
        } catch (error: any) {
            const msg = error?.response?.data?.message || error?.message || '';
            if (msg.includes('chưa được đăng ký Smart OTP') || msg.includes('Smart OTP')) {
                Alert.alert(
                    'Chưa đăng ký Smart OTP',
                    'Bạn cần đăng ký thiết bị với Smart OTP trước khi thực hiện chuyển tiền.\n\nVào Tài khoản → Mã OTP thông minh → Đăng ký thiết bị.',
                    [
                        { text: 'Để sau', style: 'cancel' },
                        {
                            text: 'Đi đăng ký',
                            onPress: () => navigation.navigate('Main' as any, { screen: 'Profile' }),
                        },
                    ],
                );
            } else {
                Alert.alert('Thất bại', msg || 'Có lỗi xảy ra khi chuyển tiền');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleQRScan = (scannedData: string) => {
        try {
            const data = JSON.parse(scannedData);
            if (data.type === 'transfer') {
                const target = data.accountNo || data.phone;
                if (target) {
                    setRecipientAccountNo(target);
                    setQrScannerVisible(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    return;
                }
            }
        } catch (e) {
            // Raw data
        }

        if (scannedData) {
            setRecipientAccountNo(scannedData);
            setQrScannerVisible(false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
    };

    const formatAmountInput = (val: string) => {
        const digits = val.replace(/[^0-9]/g, '');
        if (!digits) return '';
        return parseInt(digits, 10).toLocaleString('en-US');
    };

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader
                mode="standard"
                title="Chuyển tiền"
                showBack={true}
            />

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Source Wallet */}
                        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Từ ví nguồn</Text>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setIsWalletModalVisible(true);
                            }}
                        >
                            <CommonCard style={[styles.walletCard, { backgroundColor: isDark ? c.surface : '#fff' }]}>
                                <View style={styles.walletInfo}>
                                    <View style={[styles.walletIcon, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : '#F3E8FF' }]}>
                                        <MaterialCommunityIcons name="wallet-outline" size={24} color={c.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.walletName, { color: c.textPrimary }]}>
                                            {selectedWallet?.productName || 'Chọn ví'}
                                        </Text>
                                        <Text style={[styles.walletBalance, { color: c.success }]}>
                                            Số dư: {formatCurrency(selectedWallet?.balance || 0)}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color={c.textDim} />
                                </View>
                            </CommonCard>
                        </TouchableOpacity>

                        {/* Recipient */}
                        <View style={styles.formSection}>
                            <View style={styles.inputHeader}>
                                <Text style={[styles.sectionTitle, { color: c.textPrimary, marginBottom: 0 }]}>Đến người nhận</Text>
                                <TouchableOpacity
                                    style={[styles.qrButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9' }]}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        setQrScannerVisible(true);
                                    }}
                                >
                                    <MaterialCommunityIcons name="qrcode-scan" size={20} color={c.primary} />
                                    <Text style={[styles.qrText, { color: c.primary }]}>Quét mã</Text>
                                </TouchableOpacity>
                            </View>

                            <CommonInput
                                placeholder="Nhập số điện thoại hoặc số tài khoản"
                                value={recipientAccountNo}
                                onChangeText={setRecipientAccountNo}
                                keyboardType="numeric"
                                containerStyle={styles.input}
                            />

                            <View style={styles.inputGroup}>
                                <Text style={[styles.inputLabel, { color: c.textSecondary }]}>Số tiền (VND)</Text>
                                <View style={[styles.amountInputWrap, { borderBottomColor: c.border }]}>
                                    <Text style={[styles.currency, { color: c.textPrimary }]}>₫</Text>
                                    <CommonInput
                                        placeholder="0"
                                        value={amount}
                                        onChangeText={(v) => setAmount(formatAmountInput(v))}
                                        keyboardType="numeric"
                                        containerStyle={styles.amountInput}
                                        inputStyle={styles.amountTextStyle}
                                    />
                                </View>
                                <View style={styles.quickAmounts}>
                                    {[50000, 100000, 200000, 500000].map((amt) => (
                                        <TouchableOpacity
                                            key={amt}
                                            style={[styles.quickAmtBtn, { backgroundColor: isDark ? c.surface : '#F1F5F9' }]}
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                setAmount(amt.toLocaleString('en-US'));
                                            }}
                                        >
                                            <Text style={[styles.quickAmtText, { color: c.textPrimary }]}>
                                                {amt >= 1000 ? `${amt / 1000}k` : amt}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={[styles.inputLabel, { color: c.textSecondary }]}>Lời nhắn (tùy chọn)</Text>
                                <CommonInput
                                    placeholder="Nhập nội dung chuyển tiền"
                                    value={description}
                                    onChangeText={setDescription}
                                    multiline
                                    containerStyle={styles.input}
                                />
                            </View>
                        </View>
                    </ScrollView>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
                <CommonButton
                    title={loading ? "Đang xử lý..." : "Xác nhận chuyển khoản"}
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
                onSelect={(wallet) => {
                    setSelectedWallet(wallet);
                    setIsWalletModalVisible(false);
                }}
                title="Chọn ví nguồn"
            />

            <QRScanner
                visible={qrScannerVisible}
                onClose={() => setQrScannerVisible(false)}
                onScan={handleQRScan}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 12,
    },
    walletCard: {
        padding: 16,
        borderRadius: 20,
        marginBottom: 32,
    },
    walletInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    walletIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    walletName: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 2,
    },
    walletBalance: {
        fontSize: 13,
        fontWeight: '500',
    },
    formSection: {
        gap: 20,
    },
    inputHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    qrButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 12,
        gap: 6,
    },
    qrText: {
        fontSize: 13,
        fontWeight: '600',
    },
    input: {
        marginBottom: 0,
    },
    inputGroup: {
        marginTop: 10,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 12,
    },
    amountInputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        paddingBottom: 4,
    },
    currency: {
        fontSize: 24,
        fontWeight: '700',
        marginRight: 8,
    },
    amountInput: {
        flex: 1,
        marginBottom: 0,
        backgroundColor: 'transparent',
    },
    amountTextStyle: {
        fontSize: 28,
        fontWeight: '800',
        paddingVertical: 0,
    },
    quickAmounts: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 16,
    },
    quickAmtBtn: {
        flex: 1,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    quickAmtText: {
        fontSize: 13,
        fontWeight: '600',
    },
    footer: {
        paddingHorizontal: 20,
        backgroundColor: 'transparent',
    },
});
