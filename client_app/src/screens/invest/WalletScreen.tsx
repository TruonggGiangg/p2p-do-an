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
    Platform,
    StatusBar,
    Modal,
    TouchableOpacity as TouchableOpacityGesture,
    StyleSheet
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GradientBackground } from '../../components/glass/GradientBackground';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import QRCode from 'react-native-qrcode-svg';

import { walletApi, investApi } from '../../services';
import { GlassCard, GlassTokens, SectionTitle, InfoRow, QuickAction } from '../../components/glass';
import { SkeletonLoader, WalletCardSkeleton, ListSkeleton } from '../../components/common';
import { useAuth } from '../../contexts/AuthContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_HEIGHT = 200;


export default function WalletScreen() {
    const navigation = useNavigation<any>();
    const { user } = useAuth();

    const [balance, setBalance] = useState<{
        balance: number;
        availableBalance: number;
        accountId?: number;
        accountNo?: string;
    } | null>(null);

    const [investStats, setInvestStats] = useState<{
        totalInvested: number;
        totalEarned: number;
    } | null>(null);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showBalance, setShowBalance] = useState(true);

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

    const formatCurrency = (value: number) => new Intl.NumberFormat('vi-VN').format(value);

    return (
        <GradientBackground>
            <StatusBar barStyle="light-content" />
            <View style={styles.safeArea}>

                {/* --- HEADER --- */}
                <View style={styles.header}>
                    <View style={styles.userRow}>
                        <View>
                            <Text style={styles.greeting}>Ví đầu tư</Text>
                            <Text style={styles.userName}>{user?.name || 'Investor'}</Text>
                        </View>
                        <TouchableOpacity style={styles.notiBtn}>
                            <MaterialCommunityIcons name="bell-outline" size={24} color="rgba(255,255,255,0.8)" />
                            <View style={styles.notiDot} />
                        </TouchableOpacity>
                    </View>

                    {/* MODERN MINIMALIST WALLET CARD */}
                    <View style={styles.cardContainer}>
                        {loading && !refreshing ? (
                            <WalletCardSkeleton />
                        ) : (
                            <LinearGradient
                                colors={['#1E3A8A', '#2563EB', '#3B82F6']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.virtualCard}
                            >
                                <LinearGradient
                                    colors={['rgba(255,255,255,0.12)', 'transparent']}
                                    style={StyleSheet.absoluteFill}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 0.5, y: 1 }}
                                />

                                {/* Top Row: Chip & Wallet Type */}
                                <View style={styles.cardTop}>
                                    <MaterialCommunityIcons name="integrated-circuit-chip" size={38} color="#FACC15" />
                                    <View style={styles.statusBadgeSmall}>
                                        <View style={styles.activeDot} />
                                        <Text style={styles.activeText}>ACTIVE</Text>
                                    </View>
                                </View>

                                {/* Middle: Masked Account Number & Balance */}
                                <View style={styles.cardMiddle}>
                                    <Text style={styles.cardNumber}>
                                        {user?.username}
                                    </Text>
                                    <View style={styles.balanceRow}>
                                        <Text style={styles.cardBalance}>
                                            {showBalance ? formatCurrency(balance?.availableBalance || 0) : '••••••••'}
                                        </Text>
                                        <Text style={styles.currency}>₫</Text>
                                        <TouchableOpacity onPress={() => setShowBalance(!showBalance)} style={{ marginLeft: 10 }}>
                                            <MaterialCommunityIcons
                                                name={showBalance ? "eye-outline" : "eye-off-outline"}
                                                size={18}
                                                color="rgba(255,255,255,0.6)"
                                            />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {/* Bottom: Holder Name */}
                                <View style={styles.cardBottom}>
                                    <View>
                                        <Text style={styles.cardHolderLabel}>WALLET HOLDER</Text>
                                        <Text style={styles.cardHolderName}>{user?.name?.toUpperCase() || 'USER NAME'}</Text>
                                    </View>
                                    <View style={{ backgroundColor: 'white', padding: 4, borderRadius: 6 }}>
                                        <QRCode
                                            value={balance?.accountNo || user?.username || 'P2P_WALLET'}
                                            size={40}
                                            backgroundColor="white"
                                            color="black"
                                        />
                                    </View>
                                </View>
                            </LinearGradient>
                        )}
                    </View>

                    {/* Actions */}
                    <View style={styles.actionsRow}>
                        <QuickAction
                            icon="arrow-down"
                            label="Nạp tiền"
                            onPress={() => { }}
                            colors={['#10B981', '#059669']}
                        />
                        <QuickAction
                            icon="arrow-up"
                            label="Rút tiền"
                            onPress={() => { }}
                            colors={['#F59E0B', '#D97706']}
                        />
                        <QuickAction
                            icon="swap-horizontal"
                            label="Chuyển tiền"
                            onPress={() => navigation.navigate('Transfer', { balance: balance?.availableBalance || 0 })}
                            colors={['#3B82F6', '#2563EB']}
                        />
                        <QuickAction
                            icon="history"
                            label="Lịch sử"
                            onPress={() => navigation.navigate('TransactionHistory')}
                        />
                    </View>
                </View>

                {/* --- BODY (Scrollable Sheet) --- */}
                <View style={styles.bodyContainer}>
                    {loading && !refreshing ? (
                        <View style={{ padding: 16 }}>
                            <SkeletonLoader width={120} height={20} borderRadius={6} style={{ marginBottom: 12 }} />
                            <ListSkeleton count={2} />
                        </View>
                    ) : (
                        <ScrollView
                            contentContainerStyle={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                            refreshControl={
                                <RefreshControl
                                    refreshing={refreshing}
                                    onRefresh={loadData}
                                    tintColor={GlassTokens.colors.primary}
                                />
                            }
                        >
                            {/* Account Info */}
                            <Text style={styles.sectionHeader}>Thông tin tài khoản</Text>
                            <GlassCard blur={GlassTokens.blur.light} style={styles.infoCard}>
                                <View style={styles.infoItem}>
                                    <Text style={styles.infoLabel}>Số tài khoản</Text>
                                    <Text style={styles.infoValue}>{balance?.accountNo || '---'}</Text>
                                </View>
                                <View style={styles.divider} />
                                <View style={styles.infoItem}>
                                    <Text style={styles.infoLabel}>ID Khách hàng</Text>
                                    <Text style={styles.infoValue}>{balance?.accountId?.toString() || '---'}</Text>
                                </View>
                            </GlassCard>

                            <View style={{ height: 40 }} />
                        </ScrollView>
                    )}
                </View>
            </View>
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, paddingTop: 50 },

    // Header
    header: { paddingHorizontal: 16, marginBottom: 16 }, // Adjusted
    userRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    greeting: { fontSize: 14, color: 'rgba(255,255,255,0.6)', fontFamily: 'Poppins_400Regular' },
    userName: { fontSize: 20, fontWeight: '700', color: 'white', fontFamily: 'Poppins_700Bold' },
    notiBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    notiDot: { position: 'absolute', top: 8, right: 10, width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },

    // VIRTUAL CARD REFINED
    cardContainer: {
        marginBottom: 20, // Adjusted
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 12,
    },
    virtualCard: {
        height: 200, // Adjusted
        borderRadius: 24, // Slightly reduced radius
        padding: 20, // Adjusted padding
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    cardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statusBadgeSmall: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 6,
    },
    activeDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#10B981',
    },
    activeText: {
        fontSize: 10,
        fontWeight: '800',
        color: 'white',
        letterSpacing: 0.5,
    },
    cardMiddle: {
        marginVertical: 4,
    },
    cardNumber: {
        fontSize: 16, // Adjusted size
        color: 'rgba(255,255,255,0.8)',
        fontFamily: 'Courier',
        letterSpacing: 2,
        marginBottom: 8,
    },
    balanceRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    cardBalance: {
        fontSize: 32, // Adjusted size
        fontWeight: '700',
        color: '#FFFFFF',
        fontFamily: 'Poppins_700Bold',
    },
    currency: {
        fontSize: 18,
        color: 'rgba(255,255,255,0.6)',
        marginLeft: 6,
        fontWeight: '500',
    },
    cardBottom: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    cardHolderLabel: {
        fontSize: 9,
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '600',
        letterSpacing: 1,
        marginBottom: 2,
    },
    cardHolderName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: 1,
    },

    actionsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 }, // Added horizontal padding handling if needed, or controlled by header? Wait, header wraps it? No, actionsRow is outside header in layout? 
    // Checking render: actionsRow is inside header. Header has padding 16. So actionsRow just needs space-between.

    // Body
    bodyContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
    scrollContent: { padding: 16, paddingTop: 20 }, // Adjusted

    // Stats Grid
    sectionHeader: { fontSize: 16, fontWeight: '600', color: 'white', marginBottom: 12 },
    statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    statCard: { flex: 1, padding: 16, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.03)' },
    statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 },
    statValue: { fontSize: 16, fontWeight: '700', color: 'white' },

    // Info Card
    infoCard: { padding: 16, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.02)' }, // Adjusted
    infoItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    infoLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
    infoValue: { fontSize: 14, fontWeight: '600', color: 'white' },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 12 }, // Adjusted
});
