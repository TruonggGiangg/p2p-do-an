import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { walletApi } from '../../services/wallet/wallet.api';
import { DarkColors, DarkGradients, DarkStyling } from '../../theme';

interface TransferScreenProps {
    navigation: any;
    route: any;
}

export const TransferScreen: React.FC<TransferScreenProps> = ({ navigation, route }) => {
    const [recipientPhone, setRecipientPhone] = useState('');
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);

    // Safely get balance from route params with proper null checking
    const balance = route?.params?.balance ?? 0;

    const handleTransfer = async () => {
        if (!recipientPhone.trim()) {
            Alert.alert('Lỗi', 'Vui lòng nhập số điện thoại người nhận');
            return;
        }

        if (recipientPhone.replace(/\D/g, '').length !== 10) {
            Alert.alert('Lỗi', 'Số điện thoại phải có 10 chữ số');
            return;
        }

        const transferAmount = parseFloat(amount);
        if (!amount || isNaN(transferAmount) || transferAmount <= 0) {
            Alert.alert('Lỗi', 'Vui lòng nhập số tiền hợp lệ');
            return;
        }

        if (transferAmount > balance) {
            Alert.alert('Lỗi', `Số dư không đủ. Số dư hiện tại: ${balance.toLocaleString('vi-VN')} VND`);
            return;
        }

        Alert.alert(
            'Xác nhận chuyển tiền',
            `Chuyển ${transferAmount.toLocaleString('vi-VN')} VND đến ${recipientPhone}?`,
            [
                { text: 'Hủy', style: 'cancel' },
                {
                    text: 'Xác nhận',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            const result = await walletApi.transfer(recipientPhone, transferAmount, note);
                            Alert.alert('Thành công', result.message, [
                                { text: 'OK', onPress: () => navigation.goBack() },
                            ]);
                        } catch (error: any) {
                            Alert.alert('Lỗi', error.message || 'Chuyển tiền thất bại');
                        } finally {
                            setLoading(false);
                        }
                    },
                },
            ]
        );
    };

    return (
        <LinearGradient
            colors={DarkGradients.background as any}
            style={styles.container}
        >
            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                            <Ionicons name="arrow-back" size={24} color={DarkColors.text} />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>CHUYỂN TIỀN</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    {/* Balance Card */}
                    <LinearGradient
                        colors={['rgba(255, 0, 64, 0.15)', 'rgba(255, 0, 64, 0.05)'] as any}
                        style={styles.balanceCard}
                    >
                        <Text style={styles.balanceLabel}>SỐ DƯ KHẢ DỤNG</Text>
                        <Text style={styles.balanceAmount}>{balance.toLocaleString('vi-VN')}</Text>
                        <Text style={styles.balanceUnit}>VND</Text>
                    </LinearGradient>

                    {/* Form */}
                    <View style={styles.form}>
                        {/* Recipient */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>SỐ ĐIỆN THOẠI NGƯỜI NHẬN</Text>
                            <View style={styles.inputContainer}>
                                <Ionicons name="person-outline" size={20} color={DarkColors.primary} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Nhập số điện thoại"
                                    placeholderTextColor={DarkColors.textDim}
                                    value={recipientPhone}
                                    onChangeText={setRecipientPhone}
                                    keyboardType="phone-pad"
                                    maxLength={10}
                                />
                            </View>
                        </View>

                        {/* Amount */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>SỐ TIỀN</Text>
                            <View style={styles.inputContainer}>
                                <Ionicons name="cash-outline" size={20} color={DarkColors.primary} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Nhập số tiền"
                                    placeholderTextColor={DarkColors.textDim}
                                    value={amount}
                                    onChangeText={setAmount}
                                    keyboardType="numeric"
                                />
                                <Text style={styles.currency}>VND</Text>
                            </View>
                        </View>

                        {/* Quick Amount */}
                        <View style={styles.quickAmountContainer}>
                            {[50000, 100000, 200000, 500000].map((quickAmount) => (
                                <TouchableOpacity
                                    key={quickAmount}
                                    style={styles.quickAmountButton}
                                    onPress={() => setAmount(String(quickAmount))}
                                >
                                    <Text style={styles.quickAmountText}>
                                        {(quickAmount / 1000).toLocaleString('vi-VN')}K
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Note */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>GHI CHÚ (TÙY CHỌN)</Text>
                            <View style={styles.inputContainer}>
                                <Ionicons name="create-outline" size={20} color={DarkColors.primary} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Nhập ghi chú"
                                    placeholderTextColor={DarkColors.textDim}
                                    value={note}
                                    onChangeText={setNote}
                                    multiline
                                />
                            </View>
                        </View>
                    </View>

                    {/* Transfer Button */}
                    <TouchableOpacity
                        style={[styles.transferButton, loading && styles.transferButtonDisabled]}
                        onPress={handleTransfer}
                        disabled={loading}
                    >
                        <LinearGradient
                            colors={DarkGradients.primaryButton as any}
                            style={styles.buttonGradient}
                        >
                            {loading ? (
                                <ActivityIndicator color={DarkColors.text} />
                            ) : (
                                <>
                                    <Ionicons name="arrow-forward-circle" size={24} color={DarkColors.text} />
                                    <Text style={styles.transferButtonText}>CHUYỂN TIỀN</Text>
                                </>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: DarkColors.surfaceGlass,
        borderBottomWidth: 1,
        borderBottomColor: DarkColors.borderGlow,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: DarkColors.text,
        letterSpacing: 2,
    },
    balanceCard: {
        margin: 16,
        padding: 24,
        borderRadius: DarkStyling.borderRadius.lg,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: DarkColors.borderGlow,
        ...DarkStyling.shadow.glow,
    },
    balanceLabel: {
        color: DarkColors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 2,
        marginBottom: 8,
    },
    balanceAmount: {
        color: DarkColors.primary,
        fontSize: 36,
        fontWeight: '800',
        textShadowColor: DarkColors.primaryGlow,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 20,
    },
    balanceUnit: {
        color: DarkColors.textMuted,
        fontSize: 14,
        fontWeight: '600',
        marginTop: 4,
    },
    form: {
        backgroundColor: DarkColors.surfaceGlass,
        borderColor: DarkColors.border,
        borderWidth: 1,
        margin: 16,
        padding: 16,
        borderRadius: DarkStyling.borderRadius.lg,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
        color: DarkColors.textSecondary,
        marginBottom: 8,
        letterSpacing: 1.5,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: DarkColors.borderGlow,
        borderRadius: DarkStyling.borderRadius.sm,
        paddingHorizontal: 12,
        backgroundColor: DarkColors.surfaceGlass,
    },
    inputIcon: {
        marginRight: 8,
    },
    input: {
        flex: 1,
        padding: 12,
        fontSize: 16,
        color: DarkColors.text,
        fontWeight: '600',
    },
    currency: {
        fontSize: 14,
        color: DarkColors.textMuted,
        fontWeight: '700',
    },
    quickAmountContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    quickAmountButton: {
        flex: 1,
        paddingVertical: 12,
        marginHorizontal: 4,
        backgroundColor: DarkColors.surfaceGlass,
        borderColor: DarkColors.borderGlow,
        borderWidth: 1,
        borderRadius: DarkStyling.borderRadius.sm,
        alignItems: 'center',
    },
    quickAmountText: {
        fontSize: 14,
        fontWeight: '700',
        color: DarkColors.primary,
    },
    transferButton: {
        margin: 16,
        borderRadius: DarkStyling.borderRadius.md,
        overflow: 'hidden',
        ...DarkStyling.shadow.glowStrong,
    },
    buttonGradient: {
        flexDirection: 'row',
        padding: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    transferButtonDisabled: {
        opacity: 0.5,
    },
    transferButtonText: {
        color: DarkColors.text,
        fontSize: 16,
        fontWeight: '800',
        marginLeft: 8,
        letterSpacing: 2,
    },
});
