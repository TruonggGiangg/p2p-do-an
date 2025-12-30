import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { walletApi } from '../../services/wallet/wallet.api';
import { GradientBackground, GlassCard, GlassButton, GlassTokens, PageHeader } from '../../components/glass';
import { UnifiedSpacing, UnifiedRadius } from '../../theme';

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
        <GradientBackground>
            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                            <Ionicons name="arrow-back" size={24} color={GlassTokens.colors.textPrimary} />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>CHUYỂN TIỀN</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    {/* Balance Card */}
                    <GlassCard variant="primary" blur={GlassTokens.blur.medium} style={styles.balanceCard}>
                        <Text style={styles.balanceLabel}>SỐ DƯ KHẢ DỤNG</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
                            <Text style={styles.balanceAmount}>{balance.toLocaleString('vi-VN')}</Text>
                            <Text style={styles.balanceUnit}>VND</Text>
                        </View>
                    </GlassCard>

                    {/* Form */}
                    <GlassCard blur={GlassTokens.blur.light} style={styles.formCard}>
                        {/* Recipient */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>SỐ ĐIỆN THOẠI NGƯỜI NHẬN</Text>
                            <View style={styles.inputContainer}>
                                <Ionicons name="person-outline" size={20} color={GlassTokens.colors.primary} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Nhập số điện thoại"
                                    placeholderTextColor={GlassTokens.colors.textMuted}
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
                                <Ionicons name="cash-outline" size={20} color={GlassTokens.colors.primary} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Nhập số tiền"
                                    placeholderTextColor={GlassTokens.colors.textMuted}
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
                                <Ionicons name="create-outline" size={20} color={GlassTokens.colors.primary} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Nhập ghi chú"
                                    placeholderTextColor={GlassTokens.colors.textMuted}
                                    value={note}
                                    onChangeText={setNote}
                                    multiline
                                />
                            </View>
                        </View>
                    </GlassCard>

                    {/* Transfer Button */}
                    <GlassButton
                        title="CHUYỂN TIỀN"
                        icon="arrow-forward-circle"
                        onPress={handleTransfer}
                        loading={loading}
                        variant="primary"
                        style={styles.transferButton}
                    />
                </ScrollView>
            </KeyboardAvoidingView>
        </GradientBackground>
    );
};

const styles = StyleSheet.create({
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 20,
        paddingHorizontal: UnifiedSpacing.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: UnifiedSpacing.lg,
        paddingTop: 60, 
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        letterSpacing: 1,
        fontFamily: 'Poppins_700Bold',
    },
    balanceCard: {
        marginBottom: UnifiedSpacing.lg,
        alignItems: 'center',
        paddingVertical: UnifiedSpacing.xl,
    },
    balanceLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 2,
        marginBottom: 8,
        fontFamily: 'Poppins_600SemiBold',
    },
    balanceAmount: {
        color: GlassTokens.colors.textPrimary,
        fontSize: 36,
        fontWeight: '800',
        fontFamily: 'Poppins_700Bold',
        marginRight: 8,
    },
    balanceUnit: {
        color: GlassTokens.colors.textSecondary,
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
    },
    formCard: {
        marginBottom: UnifiedSpacing.lg,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
        color: GlassTokens.colors.textSecondary,
        marginBottom: 8,
        letterSpacing: 1.5,
        fontFamily: 'Poppins_700Bold',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: GlassTokens.colors.primary,
        paddingBottom: 8,
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: GlassTokens.colors.textPrimary,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
        paddingVertical: 4,
    },
    currency: {
        fontSize: 14,
        color: GlassTokens.colors.textMuted,
        fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
    },
    quickAmountContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
        gap: 8,
    },
    quickAmountButton: {
        flex: 1,
        paddingVertical: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: UnifiedRadius.sm,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    quickAmountText: {
        fontSize: 13,
        fontWeight: '600',
        color: GlassTokens.colors.primary,
        fontFamily: 'Poppins_600SemiBold',
    },
    transferButton: {
        marginTop: UnifiedSpacing.sm,
    },
});
