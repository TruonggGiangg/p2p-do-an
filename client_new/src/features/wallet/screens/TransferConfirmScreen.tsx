import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    Keyboard,
    TextInput,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { CommonButton, CommonCard, BinanceHeader } from '../../../components';
import { useTheme } from '../../../contexts/ThemeContext';
import { walletAPI } from '../api/wallet.api';
import SmartOTPService from '../../../services/smart-otp.service';
import { formatCurrency } from '../../../shared/utils';
import * as Haptics from 'expo-haptics';

export default function TransferConfirmScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const isDark = theme.mode === 'dark';
    const c = theme.colors;

    const { sessionId, transactionData } = (route.params as any) || {};

    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [timer, setTimer] = useState(SmartOTPService.getRemainingSeconds());

    useEffect(() => {
        const interval = setInterval(() => {
            const remaining = SmartOTPService.getRemainingSeconds();
            setTimer(remaining);
            
            // Auto generate OTP for demo/convenience if wanted, 
            // but usually user sees it in a separate floating widget or app
            // For now, let's just keep the timer updated
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    const handleGetOTP = async () => {
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const code = await SmartOTPService.generateTOTP();
            setOtp(code);
        } catch (error: any) {
            Alert.alert('Lỗi', error.message || 'Không thể tạo mã OTP');
        }
    };

    const handleConfirm = async () => {
        if (!otp || otp.length < 6) {
            Alert.alert('Lỗi', 'Vui lòng nhập mã OTP 6 chữ số');
            return;
        }

        setLoading(true);
        try {
            const deviceId = await SmartOTPService.getDeviceId();
            const timestamp = Math.floor(Date.now() / 1000);
            
            // Create signature using the same logic as server expects: otp:timestamp:actionType
            const signature = await SmartOTPService.signPayload(otp, timestamp, 'TRANSFER');

            await walletAPI.confirmTransfer({
                sessionId,
                otp,
                signature,
                deviceId,
                timestamp,
            });

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            
            Alert.alert('Thành công', 'Giao dịch chuyển tiền đã được thực hiện thành công', [
                { 
                    text: 'Về trang chủ', 
                    onPress: () => navigation.navigate('Main' as never) 
                }
            ]);
        } catch (error: any) {
            console.error('[TransferConfirm] Error:', error);
            const msg = error?.response?.data?.message || error?.message || 'Xác thực OTP thất bại';
            
            // Nếu lỗi OTP sai → cho phép thử lại
            if (msg.includes('OTP') || msg.includes('lần thử') || msg.includes('Chữ ký')) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert('OTP không đúng', msg, [
                    { text: 'Thử lại', onPress: () => setOtp('') },
                ]);
            } else if (msg.includes('Session') || msg.includes('hết hạn')) {
                Alert.alert('Phiên hết hạn', msg, [
                    { text: 'Quay lại', onPress: () => navigation.goBack() },
                ]);
            } else {
                Alert.alert('Thất bại', msg);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader
                mode="standard"
                title="Xác nhận Smart OTP"
                showBack={true}
            />

            <View style={styles.content}>
                <CommonCard style={[styles.summaryCard, { backgroundColor: isDark ? c.surface : '#fff' }]}>
                    <Text style={[styles.summaryLabel, { color: c.textDim }]}>Số tiền chuyển</Text>
                    <Text style={[styles.amountText, { color: c.primary }]}>{formatCurrency(transactionData?.amount || 0)}</Text>
                    
                    <View style={[styles.divider, { backgroundColor: c.border }]} />
                    
                    <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: c.textDim }]}>Từ ví</Text>
                        <Text style={[styles.infoValue, { color: c.textPrimary }]}>{transactionData?.fromWalletName}</Text>
                    </View>
                    
                    <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: c.textDim }]}>Đến tài khoản</Text>
                        <Text style={[styles.infoValue, { color: c.textPrimary }]}>{transactionData?.recipientAccountNo}</Text>
                    </View>
                    
                    {transactionData?.description && (
                        <View style={styles.infoRow}>
                            <Text style={[styles.infoLabel, { color: c.textDim }]}>Nội dung</Text>
                            <Text style={[styles.infoValue, { color: c.textPrimary }]} numberOfLines={1}>
                                {transactionData.description}
                            </Text>
                        </View>
                    )}
                </CommonCard>

                <View style={styles.otpSection}>
                    <Text style={[styles.otpTitle, { color: c.textPrimary }]}>Nhập mã Smart OTP</Text>
                    <Text style={[styles.otpSubtitle, { color: c.textDim }]}>
                        Mã OTP được tạo an toàn trên thiết bị của bạn
                    </Text>

                    <View style={styles.otpInputContainer}>
                        <View style={[styles.otpRow, { backgroundColor: isDark ? c.surface : '#F1F5F9', borderColor: c.border }]}>
                            <TextInput
                                style={[styles.otpInput, { color: c.textPrimary }]}
                                value={otp}
                                onChangeText={setOtp}
                                placeholder="000000"
                                placeholderTextColor={c.textDim}
                                keyboardType="number-pad"
                                maxLength={6}
                                textAlign="center"
                            />
                            <TouchableOpacity style={[styles.otpAutoBtn, { backgroundColor: c.primary }]} onPress={handleGetOTP}>
                                <MaterialCommunityIcons name="refresh" size={20} color="#fff" />
                                <Text style={styles.otpAutoBtnText}>Lấy mã</Text>
                            </TouchableOpacity>
                        </View>
                        
                        <View style={styles.timerContainer}>
                            <Ionicons name="time-outline" size={16} color={timer < 10 ? c.error : c.textDim} />
                            <Text style={[styles.timerText, { color: timer < 10 ? c.error : c.textDim }]}>
                                Mã mới sau {timer}s
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={styles.warningBox}>
                    <Ionicons name="shield-checkmark" size={18} color={c.success} />
                    <Text style={[styles.warningText, { color: c.textDim }]}>
                        Giao dịch được bảo mật bằng chữ ký số xác thực thiết bị.
                    </Text>
                </View>
            </View>

            <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
                <CommonButton
                    title={loading ? "Đang xác thực..." : "Xác nhận giao dịch"}
                    onPress={handleConfirm}
                    variant="primary"
                    disabled={loading || !otp}
                />
                <TouchableOpacity 
                    style={styles.cancelButton}
                    onPress={() => navigation.goBack()}
                    disabled={loading}
                >
                    <Text style={[styles.cancelText, { color: c.textDim }]}>Hủy bỏ</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        padding: 24,
    },
    summaryCard: {
        padding: 20,
        borderRadius: 24,
        alignItems: 'center',
        marginBottom: 32,
    },
    summaryLabel: {
        fontSize: 13,
        fontWeight: '500',
        marginBottom: 8,
    },
    amountText: {
        fontSize: 32,
        fontWeight: '800',
        marginBottom: 20,
    },
    divider: {
        width: '100%',
        height: 1,
        marginBottom: 16,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 12,
    },
    infoLabel: {
        fontSize: 14,
    },
    infoValue: {
        fontSize: 14,
        fontWeight: '600',
    },
    otpSection: {
        alignItems: 'center',
    },
    otpTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
    },
    otpSubtitle: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
    },
    otpInputContainer: {
        width: '100%',
        alignItems: 'center',
    },
    otpRow: {
        width: '100%',
        height: 60,
        borderRadius: 16,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        overflow: 'hidden',
        marginBottom: 12,
    },
    otpInput: {
        flex: 1,
        fontSize: 28,
        fontWeight: '700',
        letterSpacing: 6,
        paddingHorizontal: 16,
    },
    otpAutoBtn: {
        height: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        gap: 6,
    },
    otpAutoBtnText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
    timerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    timerText: {
        fontSize: 13,
        fontWeight: '500',
    },
    warningBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 'auto',
        padding: 16,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.02)',
    },
    warningText: {
        fontSize: 12,
        flex: 1,
    },
    footer: {
        paddingHorizontal: 24,
    },
    cancelButton: {
        alignItems: 'center',
        paddingVertical: 16,
    },
    cancelText: {
        fontSize: 15,
        fontWeight: '600',
    },
});
