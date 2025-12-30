import React, { useEffect, useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    ActivityIndicator,
    Dimensions,
    Alert,
    StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { walletApi, investApi } from '../../services';
import { GradientBackground, GlassCard, GlassTokens, SectionTitle, InfoRow } from '../../components/glass';
import { UnifiedSpacing, UnifiedRadius } from '../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_HEIGHT = 200;

export default function WalletScreen() {
    const navigation = useNavigation<any>();
    const [balance, setBalance] = useState<{
        balance: number;
        availableBalance: number;
        accountId?: number;
        accountNo?: string;
    } | null>(null);
    const [investStats, setInvestStats] = useState<{
        totalInvested: number;
        totalEarned: number;
        activeLoansCount: number;
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = useCallback(async () => {
        try {
            setRefreshing(true);
            const [balanceRes, statsRes] = await Promise.all([
                walletApi.getBalance(),
                investApi.getStats().catch(() => null)
            ]);
            setBalance(balanceRes);
            setInvestStats(statsRes);
        } catch (error: any) {
            console.error('Error loading wallet data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, []);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('vi-VN').format(value);
    };

    const totalAssets = (balance?.availableBalance || 0) + (investStats?.totalInvested || 0);

    if (loading) {
        return (
            <GradientBackground>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={GlassTokens.colors.primary} />
                </View>
            </GradientBackground>
        );
    }

    return (
        <GradientBackground>
            <ScrollView
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={loadData}
                        tintColor={GlassTokens.colors.primary}
                        colors={[GlassTokens.colors.primary]}
                    />
                }
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.headerLabel}>Tổng tài sản thực tế</Text>
                        <Text style={styles.headerValue}>{formatCurrency(totalAssets)}₫</Text>
                    </View>
                    <TouchableOpacity style={styles.notificationBtn}>
                        <MaterialCommunityIcons name="bell-outline" size={24} color={GlassTokens.colors.textSecondary} />
                        <View style={styles.badge} />
                    </TouchableOpacity>
                </View>

                {/* Virtual Card */}
                <View style={styles.cardContainer}>
                    <LinearGradient
                        colors={['#0f172a', '#1e3a8a', '#000000']} 
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.virtualCard}
                    >
                        <LinearGradient
                            colors={['rgba(255,255,255,0.1)', 'transparent']}
                            style={StyleSheet.absoluteFill}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                        />
                        <View style={styles.cardContent}>
                            <View style={styles.cardTop}>
                                <MaterialCommunityIcons name="integrated-circuit-chip" size={40} color="#FFD700" />
                                <Text style={styles.bankName}>FINERACT BANK</Text>
                            </View>
                            <View style={styles.cardMiddle}>
                                <Text style={styles.cardLabel}>Số dư khả dụng</Text>
                                <Text style={styles.cardBalance}>
                                    {balance ? formatCurrency(balance.availableBalance) : '0'}₫
                                </Text>
                            </View>
                            <View style={styles.cardBottom}>
                                <View>
                                    <Text style={styles.cardHolderLabel}>CHỦ TÀI KHOẢN</Text>
                                    <Text style={styles.cardHolderName}>NGUYEN VAN A</Text>
                                </View>
                                <MaterialCommunityIcons name="contactless-payment" size={28} color="rgba(255,255,255,0.8)" />
                            </View>
                        </View>
                    </LinearGradient>
                </View>

                {/* Quick Actions - Fixed Icons */}
                <View style={styles.actionsContainer}>
                    <ActionButton 
                        icon="arrow-down" 
                        color={GlassTokens.colors.success} 
                        label="Nạp tiền" 
                        onPress={() => {}} 
                    />
                    <ActionButton 
                        icon="arrow-up" 
                        color={GlassTokens.colors.warning} 
                        label="Rút tiền" 
                        onPress={() => {}} 
                    />
                    <ActionButton 
                        icon="swap-horizontal" 
                        color={GlassTokens.colors.primary} 
                        label="Chuyển tiền" 
                        onPress={() => navigation.navigate('Transfer', { balance: balance?.availableBalance || 0 })} 
                    />
                    <ActionButton 
                        icon="history" 
                        color={GlassTokens.colors.info} 
                        label="Lịch sử" 
                        onPress={() => navigation.navigate('TransactionHistory')} 
                    />
                </View>

                {/* Portfolio Section - Fixed Padding */}
                <View style={styles.sectionContainer}>
                    <GlassCard blur={GlassTokens.blur.medium}>
                        <SectionTitle style={{ marginBottom: 20 }}>Danh mục đầu tư</SectionTitle>
                        
                        <View style={styles.portfolioRow}>
                            <View style={styles.portfolioIcon}>
                                <MaterialCommunityIcons name="briefcase-clock" size={24} color={GlassTokens.colors.primary} />
                            </View>
                            <View style={styles.portfolioInfo}>
                                <Text style={styles.portfolioLabel}>Đang đầu tư gốc</Text>
                                <View style={styles.progressBarBg}>
                                    <View style={[styles.progressBarFill, { 
                                        width: totalAssets > 0 ? `${((investStats?.totalInvested || 0) / totalAssets) * 100}%` : '0%',
                                        backgroundColor: GlassTokens.colors.primary 
                                    }]} />
                                </View>
                            </View>
                            <Text style={styles.portfolioValue}>
                                {formatCurrency(investStats?.totalInvested || 0)}₫
                            </Text>
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.portfolioRow}>
                            <View style={[styles.portfolioIcon, { backgroundColor: 'rgba(48, 209, 88, 0.1)' }]}>
                                <MaterialCommunityIcons name="trending-up" size={24} color={GlassTokens.colors.success} />
                            </View>
                            <View style={styles.portfolioInfo}>
                                <Text style={styles.portfolioLabel}>Lợi nhuận đã nhận</Text>
                                <Text style={styles.portfolioSubLabel}>Tiền lãi tích lũy</Text>
                            </View>
                            <Text style={[styles.portfolioValue, { color: GlassTokens.colors.success }]}>
                                +{formatCurrency(investStats?.totalEarned || 0)}₫
                            </Text>
                        </View>
                    </GlassCard>
                </View>

                {/* Account Info */}
                <View style={styles.sectionContainer}>
                    <GlassCard blur={GlassTokens.blur.light}>
                        <SectionTitle>Thông tin tài khoản</SectionTitle>
                        <InfoRow label="Số tài khoản" value={balance?.accountNo || '---'} />
                        <InfoRow label="ID Khách hàng" value={balance?.accountId?.toString() || '---'} />
                    </GlassCard>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </GradientBackground>
    );
}

// Custom Action Button (No GlassCard wrapper to fix layout)
const ActionButton = ({ icon, color, label, onPress }: { icon: string, color: string, label: string, onPress: () => void }) => (
    <TouchableOpacity style={styles.actionBtnWrapper} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.actionBtnCircle, { backgroundColor: `${color}15`, borderColor: `${color}30` }]}>
            <MaterialCommunityIcons name={icon} size={26} color={color} />
        </View>
        <Text style={styles.actionBtnLabel}>{label}</Text>
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollContent: {
        paddingBottom: 100,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: UnifiedSpacing.lg,
        paddingTop: 60,
        marginBottom: UnifiedSpacing.lg,
    },
    headerLabel: {
        fontSize: 14,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_400Regular',
    },
    headerValue: {
        fontSize: 32,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: -0.5,
    },
    notificationBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    badge: {
        position: 'absolute',
        top: 10,
        right: 12,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: GlassTokens.colors.error,
    },
    
    // Card
    cardContainer: {
        paddingHorizontal: UnifiedSpacing.lg,
        marginBottom: UnifiedSpacing.xl,
    },
    virtualCard: {
        height: CARD_HEIGHT,
        borderRadius: 24,
        padding: 24,
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 10,
    },
    cardContent: {
        flex: 1,
        justifyContent: 'space-between',
    },
    cardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    bankName: {
        fontSize: 14,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 1,
    },
    cardMiddle: {
        justifyContent: 'center',
    },
    cardLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 4,
        fontFamily: 'Poppins_400Regular',
    },
    cardBalance: {
        fontSize: 34,
        fontWeight: '700',
        color: '#FFFFFF',
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 0.5,
    },
    cardBottom: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    cardHolderLabel: {
        fontSize: 9,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 2,
    },
    cardHolderName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: 1.5,
    },

    // Actions
    actionsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: UnifiedSpacing.lg,
        marginBottom: UnifiedSpacing.xl,
    },
    actionBtnWrapper: {
        alignItems: 'center',
        width: (SCREEN_WIDTH - UnifiedSpacing.lg * 2) / 4.2,
    },
    actionBtnCircle: {
        width: 64,
        height: 64,
        borderRadius: 20,
        marginBottom: 8,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
    },
    actionBtnLabel: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
    },

    // Sections
    sectionContainer: {
        marginHorizontal: UnifiedSpacing.lg,
        marginBottom: UnifiedSpacing.lg,
    },
    portfolioRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    portfolioIcon: {
        width: 44,
        height: 44,
        borderRadius: 16,
        backgroundColor: 'rgba(10, 132, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    portfolioInfo: {
        flex: 1,
    },
    portfolioLabel: {
        fontSize: 14,
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 4,
    },
    portfolioSubLabel: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_400Regular',
    },
    portfolioValue: {
        fontSize: 16,
        fontWeight: '700',
        color: GlassTokens.colors.textPrimary,
        fontFamily: 'Poppins_700Bold',
    },
    progressBarBg: {
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        marginTop: 4,
        width: '100%',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 2,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginVertical: 16,
    },
});
