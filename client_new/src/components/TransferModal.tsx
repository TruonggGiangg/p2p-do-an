import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    ScrollView,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { transferAPI, TransferRequest } from '../services/transfer.api';
import { QRScanner } from './QRScanner';
import { GlassTokens } from '../theme';
import type { Wallet } from '../types/auth.types';

interface TransferModalProps {
    visible: boolean;
    onClose: () => void;
    wallets: Wallet[];
    onSuccess: () => void;
    initialRecipientPhone?: string; // For QR scan
}

const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        minimumFractionDigits: 0,
    }).format(amount);
};

const formatNumber = (num: number): string => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const parseNumber = (str: string): number => {
    return parseInt(str.replace(/,/g, ''), 10) || 0;
};

export const TransferModal: React.FC<TransferModalProps> = ({ visible, onClose, wallets, onSuccess, initialRecipientPhone }) => {
    // Filter out BNPL wallets (credit_wallet) - only show e_wallet
    const availableWallets = wallets.filter((w) => w.type === 'e_wallet' && w.status?.toLowerCase() === 'active');

    const [transferMode, setTransferMode] = useState<'wallet' | 'phone'>(initialRecipientPhone ? 'phone' : 'wallet');
    const [fromWalletId, setFromWalletId] = useState<string>(() => {
        if (availableWallets.length > 0) {
            const firstWallet = availableWallets[0];
            // Use fineractId as primary identifier, fallback to accountNo, then MongoDB ID
            const walletId = firstWallet?.fineractId || firstWallet?.accountNo || firstWallet?.id || firstWallet?._id;
            console.log('[TransferModal] Initial wallet ID:', walletId, 'from wallet:', firstWallet);
            return walletId || '';
        }
        return '';
    });
    const [toWalletId, setToWalletId] = useState<string>('');
    const [recipientPhone, setRecipientPhone] = useState<string>(initialRecipientPhone || '');
    const [amountRaw, setAmountRaw] = useState('');
    const [description, setDescription] = useState('');
    const [transferring, setTransferring] = useState(false);
    const [qrScannerVisible, setQrScannerVisible] = useState(false);

    // Set default from wallet when modal opens or wallets change
    useEffect(() => {
        if (visible && availableWallets.length > 0) {
            const firstWallet = availableWallets[0];
            // Use fineractId as primary identifier
            const walletId = firstWallet?.fineractId || firstWallet?.accountNo || firstWallet?.id || firstWallet?._id;
            
            console.log('[TransferModal] Checking wallets:', {
                count: availableWallets.length,
                firstWallet,
                walletId,
                currentFromWalletId: fromWalletId,
            });
            
            // Check if current fromWalletId is still valid
            const currentWalletExists = fromWalletId && availableWallets.some((w) => {
                const wId = w.fineractId || w.accountNo || w.id || w._id;
                return wId === fromWalletId;
            });
            
            if (!currentWalletExists && walletId) {
                setFromWalletId(walletId);
                console.log('[TransferModal] Set default wallet:', walletId, 'from', availableWallets.length, 'wallets');
            } else if (!walletId) {
                console.error('[TransferModal] Wallet has no fineractId, accountNo, id or _id field:', firstWallet);
            }
        } else if (visible && availableWallets.length === 0) {
            // No wallets available - clear selection
            setFromWalletId('');
            console.log('[TransferModal] No wallets available');
        }
    }, [visible, availableWallets.length]); // Only depend on visible and wallets count, not fromWalletId to avoid loops

    // Reset form when modal closes
    useEffect(() => {
        if (!visible) {
            setFromWalletId('');
            setToWalletId('');
            setRecipientPhone(initialRecipientPhone || '');
            setAmountRaw('');
            setDescription('');
            setTransferMode(initialRecipientPhone ? 'phone' : 'wallet');
        }
    }, [visible, initialRecipientPhone]);

    // Set recipient phone from QR scan
    useEffect(() => {
        if (initialRecipientPhone) {
            setRecipientPhone(initialRecipientPhone);
            setTransferMode('phone');
        }
    }, [initialRecipientPhone]);

    // Find wallets by fineractId, accountNo, or MongoDB ID
    const fromWallet = availableWallets.find((w) => {
        const wId = w.fineractId || w.accountNo || w.id || w._id;
        return wId === fromWalletId;
    });
    const toWallet = availableWallets.find((w) => {
        const wId = w.fineractId || w.accountNo || w.id || w._id;
        return wId === toWalletId;
    });

    const amountDisplay = amountRaw ? formatNumber(parseNumber(amountRaw)) : '';
    const amount = parseNumber(amountRaw);

    // Check if transfer button should be disabled
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    const isValidPhone = cleanPhone.length === 10;
    
    const isTransferDisabled =
        transferring ||
        !fromWalletId ||
        !amountRaw ||
        amount < 1000 ||
        (transferMode === 'wallet' && (!toWalletId || availableWallets.length < 2)) ||
        (transferMode === 'phone' && (!recipientPhone.trim() || !isValidPhone));

    // Debug log
    if (__DEV__ && transferMode === 'phone') {
        console.log('[TransferModal] Debug disabled state:', {
            transferring,
            fromWalletId: !!fromWalletId,
            amountRaw: !!amountRaw,
            amount,
            recipientPhone,
            cleanPhone,
            isValidPhone,
            isTransferDisabled,
        });
    }

    const handleTransfer = async () => {
        if (!fromWalletId) {
            Alert.alert('Lỗi', 'Vui lòng chọn ví nguồn');
            return;
        }

        if (transferMode === 'wallet') {
            if (!toWalletId) {
                Alert.alert('Lỗi', 'Vui lòng chọn ví đích');
                return;
            }
            if (fromWalletId === toWalletId) {
                Alert.alert('Lỗi', 'Ví nguồn và ví đích không thể giống nhau');
                return;
            }
        } else {
            // Phone transfer mode
            if (!recipientPhone.trim()) {
                Alert.alert('Lỗi', 'Vui lòng nhập số điện thoại người nhận hoặc quét QR');
                return;
            }
            const cleanPhone = recipientPhone.replace(/\D/g, '');
            if (cleanPhone.length !== 10) {
                Alert.alert('Lỗi', 'Số điện thoại phải có 10 chữ số');
                return;
            }
        }

        if (!amount || amount < 1000) {
            Alert.alert('Lỗi', 'Số tiền chuyển tối thiểu là 1,000 đ');
            return;
        }

        if (fromWallet && amount > fromWallet.balance) {
            Alert.alert('Lỗi', `Số dư không đủ. Số dư hiện tại: ${formatCurrency(fromWallet.balance)}`);
            return;
        }

        setTransferring(true);
        try {
            if (transferMode === 'wallet') {
                const transferData: TransferRequest = {
                    fromWalletId,
                    toWalletId: toWalletId!,
                    amount,
                    description: description.trim() || undefined,
                };
                await transferAPI.transfer(transferData);
            } else {
                // Phone transfer - use phone number API
                await transferAPI.transferByPhone({
                    fromWalletId,
                    recipientPhone: recipientPhone.replace(/\D/g, ''),
                    amount,
                    description: description.trim() || undefined,
                });
            }

            Alert.alert('✅ Thành công', `Đã chuyển ${formatCurrency(amount)} thành công`, [
                {
                    text: 'OK',
                    onPress: () => {
                        // Reset form
                        setAmountRaw('');
                        setDescription('');
                        setToWalletId('');
                        setRecipientPhone('');
                        setTransferMode('wallet');
                        onSuccess();
                        onClose();
                    },
                },
            ]);
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || error.message || 'Không thể thực hiện chuyển khoản';
            Alert.alert('❌ Lỗi', errorMessage);
        } finally {
            setTransferring(false);
        }
    };

    const handleQRScan = (phone: string) => {
        console.log('[TransferModal] QR scan received phone:', phone);
        // Clean phone number (remove non-digits)
        const cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length === 10) {
            setRecipientPhone(cleanPhone);
            setTransferMode('phone');
            setQrScannerVisible(false);
            console.log('[TransferModal] Phone set to:', cleanPhone);
        } else {
            Alert.alert('Lỗi', 'Số điện thoại không hợp lệ. Phải có 10 chữ số.');
            setQrScannerVisible(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={styles.container}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
                    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                        <View style={styles.flex}>
                            {/* Header */}
                            <View style={styles.header}>
                                <TouchableOpacity onPress={onClose} style={styles.closeBtn} disabled={transferring}>
                                    <Ionicons name="close" size={24} color="#fff" />
                                </TouchableOpacity>
                                <Text style={styles.headerTitle}>Chuyển khoản</Text>
                                <View style={{ width: 40 }} />
                            </View>

                            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                                {/* Transfer Mode Selector */}
                                <View style={styles.modeSelector}>
                                    <TouchableOpacity
                                        style={[styles.modeButton, transferMode === 'wallet' && styles.modeButtonActive]}
                                        onPress={() => setTransferMode('wallet')}
                                        disabled={transferring}
                                    >
                                        <Ionicons
                                            name="wallet-outline"
                                            size={18}
                                            color={transferMode === 'wallet' ? '#fff' : GlassTokens.colors.textSecondary}
                                            style={{ marginRight: 8 }}
                                        />
                                        <Text style={[styles.modeButtonText, transferMode === 'wallet' && styles.modeButtonTextActive]}>
                                            Giữa các ví
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.modeButton, transferMode === 'phone' && styles.modeButtonActive]}
                                        onPress={() => setTransferMode('phone')}
                                        disabled={transferring}
                                    >
                                        <Ionicons
                                            name="call-outline"
                                            size={18}
                                            color={transferMode === 'phone' ? '#fff' : GlassTokens.colors.textSecondary}
                                            style={{ marginRight: 8 }}
                                        />
                                        <Text style={[styles.modeButtonText, transferMode === 'phone' && styles.modeButtonTextActive]}>
                                            Theo SĐT
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                {/* From Wallet */}
                                <View style={styles.section}>
                                    <View style={styles.sectionHeader}>
                                        <Ionicons name="arrow-down-circle" size={20} color="#3b82f6" style={styles.sectionIcon} />
                                        <Text style={styles.sectionTitle}>Từ ví</Text>
                                    </View>
                                    {availableWallets.length === 0 ? (
                                        <View style={styles.emptyState}>
                                            <Text style={styles.emptyText}>Không có ví điện tử khả dụng</Text>
                                        </View>
                                    ) : (
                                        <View style={styles.walletSelector}>
                                            {availableWallets.map((wallet) => {
                                                // Use fineractId as primary identifier
                                                const walletId = wallet.fineractId || wallet.accountNo || wallet.id || wallet._id;
                                                return (
                                                    <TouchableOpacity
                                                        key={walletId}
                                                        style={[styles.walletOption, fromWalletId === walletId && styles.walletOptionActive]}
                                                        onPress={() => setFromWalletId(walletId)}
                                                        disabled={transferring}
                                                    >
                                                        <View style={styles.walletOptionContent}>
                                                            <Text style={styles.walletOptionName}>
                                                                {wallet.productName || wallet.metadata?.productName || 'Ví điện tử'}
                                                            </Text>
                                                            <Text style={styles.walletOptionBalance}>{formatCurrency(wallet.balance || 0)}</Text>
                                                        </View>
                                                        {fromWalletId === walletId && (
                                                            <Ionicons name="checkmark-circle" size={24} color="#3b82f6" />
                                                        )}
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    )}
                                </View>

                                {/* To Wallet or Phone */}
                                {transferMode === 'wallet' ? (
                                    <View key="transfer-mode-wallet" style={styles.section}>
                                        <View style={styles.sectionHeader}>
                                            <Ionicons name="arrow-up-circle" size={20} color="#10b981" style={styles.sectionIcon} />
                                            <Text style={styles.sectionTitle}>Đến ví</Text>
                                        </View>
                                        <View style={styles.walletSelector}>
                                            {availableWallets
                                                .filter((w) => {
                                                    const wId = w.fineractId || w.accountNo || w.id || w._id;
                                                    return wId !== fromWalletId;
                                                })
                                                .map((wallet) => {
                                                    // Use fineractId as primary identifier
                                                    const walletId = wallet.fineractId || wallet.accountNo || wallet.id || wallet._id;
                                                    return (
                                                        <TouchableOpacity
                                                            key={walletId}
                                                            style={[styles.walletOption, toWalletId === walletId && styles.walletOptionActive]}
                                                            onPress={() => setToWalletId(walletId)}
                                                            disabled={transferring}
                                                        >
                                                            <View style={styles.walletOptionContent}>
                                                                <Text style={styles.walletOptionName}>
                                                                    {wallet.productName || wallet.metadata?.productName || 'Ví điện tử'}
                                                                </Text>
                                                                <Text style={styles.walletOptionBalance}>{formatCurrency(wallet.balance || 0)}</Text>
                                                            </View>
                                                            {toWalletId === walletId && (
                                                                <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                                                            )}
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                        </View>
                                    </View>
                                ) : (
                                    <View key="transfer-mode-phone" style={styles.section}>
                                        <View style={styles.sectionHeader}>
                                            <Ionicons name="call-outline" size={20} color="#10b981" style={styles.sectionIcon} />
                                            <Text style={styles.sectionTitle}>Đến số điện thoại</Text>
                                        </View>
                                        <View style={styles.phoneInputContainer}>
                                            <TextInput
                                                style={styles.phoneInput}
                                                value={recipientPhone}
                                                onChangeText={setRecipientPhone}
                                                keyboardType="phone-pad"
                                                placeholder="Nhập số điện thoại"
                                                placeholderTextColor="rgba(255,255,255,0.4)"
                                                editable={!transferring}
                                                maxLength={10}
                                            />
                                            <TouchableOpacity
                                                style={styles.qrButton}
                                                onPress={() => setQrScannerVisible(true)}
                                                disabled={transferring}
                                            >
                                                <Ionicons name="qr-code-outline" size={24} color="#fff" />
                                            </TouchableOpacity>
                                        </View>
                                        <Text style={styles.phoneHint}>Hoặc quét mã QR để tự động điền</Text>
                                    </View>
                                )}

                                {/* Amount */}
                                <View style={styles.section}>
                                    <View style={styles.sectionHeader}>
                                        <Ionicons name="cash-outline" size={20} color="#fff" style={styles.sectionIcon} />
                                        <Text style={styles.sectionTitle}>Số tiền</Text>
                                    </View>
                                    <View style={styles.amountContainer}>
                                        <TextInput
                                            style={styles.amountInput}
                                            value={amountDisplay}
                                            onChangeText={(val) => {
                                                const digits = val.replace(/[^0-9]/g, '');
                                                setAmountRaw(digits);
                                            }}
                                            keyboardType="numeric"
                                            placeholder="0"
                                            placeholderTextColor="rgba(255,255,255,0.3)"
                                            editable={!transferring}
                                        />
                                        <Text style={styles.currency}>₫</Text>
                                    </View>
                                    {fromWallet && (
                                        <Text style={styles.balanceHint}>
                                            Số dư khả dụng: {formatCurrency(fromWallet.balance || 0)}
                                        </Text>
                                    )}
                                </View>

                                {/* Description */}
                                <View style={styles.section}>
                                    <View style={styles.sectionHeader}>
                                        <Ionicons name="document-text-outline" size={20} color="#fff" style={styles.sectionIcon} />
                                        <Text style={styles.sectionTitle}>Nội dung (tùy chọn)</Text>
                                    </View>
                                    <TextInput
                                        style={styles.descriptionInput}
                                        value={description}
                                        onChangeText={setDescription}
                                        placeholder="Ví dụ: Chuyển tiền mua hàng"
                                        placeholderTextColor="rgba(255,255,255,0.4)"
                                        editable={!transferring}
                                        multiline
                                        numberOfLines={3}
                                    />
                                </View>

                                {/* Summary */}
                                {fromWallet && amountRaw && parseNumber(amountRaw) > 0 && (
                                    <View style={styles.summaryCard}>
                                        <Text style={styles.summaryTitle}>Tóm tắt giao dịch</Text>
                                        <View style={styles.summaryRow}>
                                            <Text style={styles.summaryLabel}>Từ:</Text>
                                            <Text style={styles.summaryValue}>
                                                {fromWallet.productName || fromWallet.metadata?.productName || 'Ví điện tử'}
                                            </Text>
                                        </View>
                                        <View style={styles.summaryRow}>
                                            <Text style={styles.summaryLabel}>Đến:</Text>
                                            <Text style={styles.summaryValue}>
                                                {transferMode === 'wallet'
                                                    ? toWallet
                                                        ? toWallet.productName || toWallet.metadata?.productName || 'Ví điện tử'
                                                        : 'Chưa chọn'
                                                    : recipientPhone || 'Chưa nhập'}
                                            </Text>
                                        </View>
                                        <View style={styles.summaryRow}>
                                            <Text style={styles.summaryLabel}>Số tiền:</Text>
                                            <Text style={[styles.summaryValue, styles.summaryAmount]}>
                                                {formatCurrency(parseNumber(amountRaw))}
                                            </Text>
                                        </View>
                                        {fromWallet && parseNumber(amountRaw) > (fromWallet.balance || 0) && (
                                            <View style={styles.warningBox}>
                                                <Ionicons name="warning" size={16} color="#f59e0b" />
                                                <Text style={styles.warningText}>Số dư không đủ</Text>
                                            </View>
                                        )}
                                    </View>
                                )}

                                <View style={{ height: 40 }} />
                            </ScrollView>

                            {/* Footer Button */}
                            <View style={styles.footer}>
                                <TouchableOpacity
                                    style={[styles.transferButton, isTransferDisabled && styles.transferButtonDisabled]}
                                    onPress={handleTransfer}
                                    disabled={isTransferDisabled}
                                    activeOpacity={isTransferDisabled ? 1 : 0.7}
                                >
                                    {transferring ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <>
                                            <Text style={styles.transferButtonText}>Xác nhận chuyển khoản</Text>
                                            <Ionicons name="arrow-forward" size={20} color="#fff" />
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </KeyboardAvoidingView>
            </SafeAreaView>

            {/* QR Scanner */}
            <QRScanner visible={qrScannerVisible} onClose={() => setQrScannerVisible(false)} onScan={handleQRScan} />
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0e27',
    },
    flex: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingTop: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#374151',
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#1a1f3a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#fff',
    },
    scrollContent: {
        padding: 20,
    },
    modeSelector: {
        flexDirection: 'row',
        backgroundColor: '#1a1f3a',
        borderRadius: 12,
        padding: 4,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#374151',
    },
    modeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
    },
    modeButtonActive: {
        backgroundColor: '#3b82f6',
    },
    modeButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: GlassTokens.colors.textSecondary,
    },
    modeButtonTextActive: {
        color: '#fff',
    },
    section: {
        marginBottom: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionIcon: {
        marginRight: 8,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    walletSelector: {
        gap: 12,
    },
    walletOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#1a1f3a',
        borderRadius: 12,
        padding: 16,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    walletOptionActive: {
        borderColor: '#3b82f6',
        backgroundColor: '#1e3a5f',
    },
    walletOptionContent: {
        flex: 1,
    },
    walletOptionName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 4,
    },
    walletOptionBalance: {
        fontSize: 14,
        color: '#10b981',
        fontWeight: '500',
    },
    amountContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1f3a',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: '#374151',
    },
    amountInput: {
        fontSize: 36,
        fontWeight: '700',
        color: '#fff',
        textAlign: 'center',
        flex: 1,
    },
    currency: {
        fontSize: 24,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
        marginLeft: 8,
    },
    balanceHint: {
        fontSize: 12,
        color: '#9ca3af',
        textAlign: 'center',
        marginTop: 8,
    },
    descriptionInput: {
        backgroundColor: '#1a1f3a',
        borderWidth: 1,
        borderColor: '#374151',
        borderRadius: 12,
        padding: 16,
        fontSize: 15,
        color: '#fff',
        minHeight: 80,
        textAlignVertical: 'top',
    },
    summaryCard: {
        backgroundColor: '#1a1f3a',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: '#374151',
        marginTop: 8,
    },
    summaryTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 16,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    summaryLabel: {
        fontSize: 14,
        color: '#9ca3af',
    },
    summaryValue: {
        fontSize: 14,
        color: '#fff',
        fontWeight: '500',
    },
    summaryAmount: {
        fontSize: 18,
        fontWeight: '700',
        color: '#10b981',
    },
    warningBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#78350f',
        padding: 12,
        borderRadius: 8,
        marginTop: 8,
        gap: 8,
    },
    warningText: {
        fontSize: 13,
        color: '#fbbf24',
        fontWeight: '500',
    },
    emptyState: {
        backgroundColor: '#1a1f3a',
        borderRadius: 12,
        padding: 24,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 14,
        color: '#9ca3af',
    },
    phoneInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1f3a',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#374151',
        paddingHorizontal: 16,
    },
    phoneInput: {
        flex: 1,
        fontSize: 16,
        color: '#fff',
        paddingVertical: 16,
    },
    qrButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: GlassTokens.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    phoneHint: {
        fontSize: 12,
        color: GlassTokens.colors.textMuted,
        marginTop: 8,
        textAlign: 'center',
    },
    footer: {
        padding: 20,
        paddingBottom: 30,
        borderTopWidth: 1,
        borderTopColor: '#374151',
        backgroundColor: '#0a0e27',
    },
    transferButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#3b82f6',
        paddingVertical: 16,
        borderRadius: 16,
        gap: 8,
    },
    transferButtonDisabled: {
        opacity: 0.6,
    },
    transferButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
});

export default TransferModal;
