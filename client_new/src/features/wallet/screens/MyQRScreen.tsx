import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Dimensions, Share } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { QRCodeDisplay } from '../../../components/QRCodeDisplay';
import { BinanceHeader } from '../../../components/BinanceHeader';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function MyQRScreen() {
    const route = useRoute();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const { user } = useAuth();
    const isDark = theme.mode === 'dark';
    const c = theme.colors;

    const { wallet } = (route.params as any) || {};

    const handleShare = async () => {
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const qrData = JSON.stringify({
                phone: user?.username,
                accountNo: wallet?.accountNo,
                walletName: wallet?.productName,
                type: 'transfer',
            });
            await Share.share({
                message: `Quét mã này để chuyển tiền cho tôi qua Vento P2P: ${user?.name}\nSTK: ${wallet?.accountNo}\n${qrData}`,
            });
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader
                mode="standard"
                title="Mã QR của tôi"
                showBack={true}
            />

            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.content}>
                    <QRCodeDisplay
                        phone={user?.username || ''}
                        name={user?.name}
                        accountNo={wallet?.accountNo}
                        walletName={wallet?.productName}
                    />

                    <View style={styles.actionContainer}>
                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: c.primary }]}
                            onPress={handleShare}
                        >
                            <MaterialCommunityIcons name="share-variant" size={20} color={c.onPrimary} />
                            <Text style={[styles.actionBtnText, { color: c.onPrimary }]}>Chia sẻ mã QR</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.secondaryBtn, { borderColor: c.border }]}
                            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                        >
                            <MaterialCommunityIcons name="download" size={20} color={c.textPrimary} />
                            <Text style={[styles.secondaryBtnText, { color: c.textPrimary }]}>Lưu hình ảnh</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.hintCard, { backgroundColor: isDark ? c.surface : '#F8F9FA' }]}>
                        <MaterialCommunityIcons name="information-outline" size={20} color={c.primary} />
                        <Text style={[styles.hintText, { color: c.textSecondary }]}>
                            Người gửi chỉ cần quét mã QR này để thực hiện chuyển tiền nhanh đến ví của bạn mà không cần nhập số tài khoản thủ công.
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
    },
    actionContainer: {
        marginTop: 10,
        gap: 12,
    },
    actionBtn: {
        flexDirection: 'row',
        height: 54,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
    },
    actionBtnText: {
        fontSize: 16,
        fontWeight: '700',
    },
    secondaryBtn: {
        flexDirection: 'row',
        height: 54,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
    },
    secondaryBtnText: {
        fontSize: 16,
        fontWeight: '600',
    },
    hintCard: {
        flexDirection: 'row',
        marginTop: 30,
        padding: 18,
        borderRadius: 20,
        gap: 12,
        alignItems: 'flex-start',
    },
    hintText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 20,
        fontWeight: '500',
    },
});
