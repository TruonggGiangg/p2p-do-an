import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    Platform,
    Dimensions,
    ScrollView,
    NativeSyntheticEvent,
    NativeScrollEvent,
    Pressable,
    Switch,
    Animated as RNAnimated,
} from 'react-native';
import Animated, {
    FadeInDown,
    FadeInUp,
    SlideInRight,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    Layout
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../../contexts/AuthContext';
import { walletAPI } from '../../wallet/api/wallet.api';
import { BinanceHeader, CommonCard, QRCodeDisplay, FintechPullToRefresh, FintechScreenSkeleton } from '../../../components';
import { WalletSelectorModal } from '../../wallet/components/WalletSelectorModal';
import { useTheme } from '../../../contexts/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Wallet } from '../../../types/auth.types';
import { formatCurrency } from '../../../shared/utils';
import {
    WALLET_GROUP,
    LOAN_GROUP,
    HISTORY_GROUP,
    SECURITY_GROUP,
    SETTINGS_GROUP,
    MOMO_GRID,
    BANNERS,
    type BannerItem,
} from '../constants/home.constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BANNER_WIDTH = SCREEN_WIDTH - 32;
const BANNER_HEIGHT = 120;
const BANNER_GAP = 12;
const ACTION_ITEM_WIDTH = (SCREEN_WIDTH - 32 - 48) / 4;

function BannerCard({
    banner,
    onPress,
}: {
    banner: BannerItem;
    onPress: () => void;
}) {
    return (
        <Animated.View entering={FadeInUp.duration(600)}>
            <Pressable
                style={styles.bannerCard}
                onPress={onPress}
                android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
            >
                {banner.imageUrl ? (
                    <>
                        <Image
                            source={{ uri: banner.imageUrl }}
                            style={[StyleSheet.absoluteFillObject, { borderRadius: 20 }]}
                            resizeMode="cover"
                        />
                        <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.85)']}
                            style={[styles.bannerOverlay, { borderRadius: 20 }]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                        >
                            <View style={styles.bannerContent}>
                                <View style={styles.bannerText}>
                                    <Text style={styles.bannerTitle}>{banner.title}</Text>
                                    <Text style={styles.bannerSubtitle}>{banner.subtitle}</Text>
                                </View>
                                <View style={styles.bannerCta}>
                                    <Text style={styles.bannerCtaText}>Khám phá</Text>
                                    <MaterialCommunityIcons name="chevron-right" size={16} color="#fff" />
                                </View>
                            </View>
                        </LinearGradient>
                    </>
                ) : (
                    <LinearGradient
                        colors={banner.gradient}
                        style={styles.bannerGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >
                        <View style={styles.bannerContent}>
                            <View style={styles.bannerText}>
                                <Text style={styles.bannerTitle}>{banner.title}</Text>
                                <Text style={styles.bannerSubtitle}>{banner.subtitle}</Text>
                            </View>
                            <View style={styles.bannerCta}>
                                <Text style={styles.bannerCtaText}>Khám phá</Text>
                                <MaterialCommunityIcons name="chevron-right" size={16} color="#fff" />
                            </View>
                        </View>
                    </LinearGradient>
                )}
            </Pressable>
        </Animated.View>
    );
}

function ActionGroup({
    title,
    items,
    theme,
    onItemPress,
    index = 0,
}: {
    title?: string;
    items: typeof MOMO_GRID;
    theme: any;
    onItemPress: (item: (typeof MOMO_GRID)[0]) => void;
    index?: number;
}) {
    const c = theme.colors;
    const isDark = theme.mode === 'dark';
    const iconBg = isDark ? theme.colors.surface : '#FFFFFF';
    const iconBorder = isDark ? theme.colors.border : '#F0F0F0';
    const iconColor = theme.colors.primary; // Revert to theme primary GOLD/YELLOW

    return (
        <Animated.View
            entering={FadeInDown.delay(300 + index * 100).duration(600)}
            style={styles.actionGroup}
        >
            {title && (
                <View style={styles.groupHeader}>
                    <Text style={[styles.groupTitle, { color: c.textSecondary }]}>{title}</Text>
                    <View style={[styles.groupTitleLine, { backgroundColor: c.primary + '20' }]} />
                </View>
            )}
            <View style={[styles.shadowWrapper, { borderRadius: 20, backgroundColor: isDark ? c.backgroundSecondary : '#fff' }]}>
                <View style={[styles.gridContainer, { backgroundColor: 'transparent', elevation: 0, shadowOpacity: 0 }]}>
                    {items.map((item, idx) => (
                        <TouchableOpacity
                            key={idx}
                            style={styles.quickItem}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                onItemPress(item);
                            }}
                            activeOpacity={0.6}
                        >
                            <View style={[styles.quickIconWrap, { backgroundColor: iconBg, borderColor: iconBorder }]}>
                                {item.image ? (
                                    <Image source={{ uri: item.image }} style={styles.quickImage} resizeMode="contain" />
                                ) : (
                                    <MaterialCommunityIcons name={item.icon!} size={26} color={iconColor} />
                                )}
                            </View>
                            <Text style={[styles.quickLabel, { color: c.textPrimary }]} numberOfLines={2}>
                                {item.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </Animated.View>
    );
}

export default function HomeScreen() {
    const navigation = useNavigation();
    const { user, refreshUser } = useAuth();
    const { theme, themeMode, toggleThemeWithOverlay } = useTheme();
    const insets = useSafeAreaInsets();
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [walletsLoading, setWalletsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [walletSelectorVisible, setWalletSelectorVisible] = useState(false);
    const [balanceVisible, setBalanceVisible] = useState(true);
    const [bannerIndex, setBannerIndex] = useState(0);
    const scrollRef = useRef<ScrollView>(null);

    const fetchWallets = async () => {
        setWalletsLoading(true);
        const minDelay = new Promise((resolve) => setTimeout(resolve, 1700));
        try {
            const [response] = await Promise.all([walletAPI.getWallets(), minDelay]);
            let walletData = response.wallets || [];
            if (walletData.length === 0) {
                await walletAPI.syncWallets();
                const syncResponse = await walletAPI.getWallets();
                walletData = syncResponse.wallets || [];
            }
            setWallets(walletData.filter((w: Wallet) => w.type === 'e_wallet'));
        } catch (error) {
            console.error('Failed to fetch wallets:', error);
        } finally {
            setWalletsLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await walletAPI.syncWallets().catch(() => { });
            await Promise.all([refreshUser(), fetchWallets()]);
        } finally {
            setRefreshing(false);
        }
    }, [refreshUser]);

    useEffect(() => {
        fetchWallets();
    }, []);

    const handleShortcutPress = (item: (typeof MOMO_GRID)[0]) => {
        if (item.nav === 'QR') {
            setWalletSelectorVisible(true);
        } else {
            item.isParent ? (navigation as any).getParent()?.navigate(item.nav) : (navigation as any).navigate(item.nav);
        }
    };

    const handleTransfer = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        (navigation as any).navigate('Transfer');
    };

    const handleMyQR = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setWalletSelectorVisible(true);
    };

    const handleSelectWalletForQR = (wallet: Wallet) => {
        setWalletSelectorVisible(false);
        (navigation as any).navigate('MyQR', { wallet });
    };

    const handleBannerPress = (banner: BannerItem) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        (navigation as any).navigate(banner.actionNav);
    };

    const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);
    const tabBarHeight = Platform.OS === 'ios' ? 60 + insets.bottom : 70;
    const c = theme.colors;

    const onBannerScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offset = e.nativeEvent.contentOffset.x;
        const index = Math.round(offset / (BANNER_WIDTH + BANNER_GAP));
        setBannerIndex(Math.min(index, BANNERS.length - 1));
    };

    const handleThemeToggle = () => {
        const { width, height } = Dimensions.get('window');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleThemeWithOverlay(width / 2, height / 3);
    };

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader
                mode="dashboard"
                onAvatarPress={() => (navigation as any).navigate('Profile')}
                onSearchPress={() => { }}
            />

            {walletsLoading && !refreshing ? (
                <View style={[styles.loadingWrap, { marginTop: Platform.OS === 'ios' ? 36 : 52 }]}>
                    <FintechScreenSkeleton variant="home" />
                </View>
            ) : (
                <FintechPullToRefresh
                    onRefresh={onRefresh}
                    refreshing={refreshing}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 32 }]}
                    primaryColor={c.primary}
                    glowColor={c.primaryLight}
                >
                    {/* 1. Balance Card - Ưu tiên đầu tiên */}
                    <Animated.View
                        entering={FadeInDown.duration(800).springify()}
                        style={styles.section}
                    >
                        <View style={[styles.shadowWrapper, { borderRadius: 24, backgroundColor: themeMode === 'dark' ? '#1E2329' : '#FFFFFF' }]}>
                            <LinearGradient
                                colors={themeMode === 'dark' ? ['#1E2329', '#0B0E11'] : ['#FFFFFF', '#F5F5F5']}
                                style={[styles.portfolioCardContainer, { borderColor: c.border }]}
                            >
                                <CommonCard style={[styles.portfolioCard, { backgroundColor: 'transparent', borderWidth: 0, elevation: 0, shadowOpacity: 0 }]}>
                                    <View style={styles.portfolioHeaderRow}>
                                        <View style={styles.portfolioLabelRow}>
                                            <View style={[styles.iconCircle, { backgroundColor: c.primary + '15' }]}>
                                                <MaterialCommunityIcons name="wallet-outline" size={16} color={c.primary} />
                                            </View>
                                            <Text style={[styles.portfolioLabel, { color: c.textSecondary }]}>
                                                Tổng tài sản (VND)
                                            </Text>
                                        </View>
                                        <View style={styles.headerRightActions}>
                                            <TouchableOpacity
                                                onPress={() => (navigation as any).navigate('Wallets')}
                                                style={styles.allWalletsBtn}
                                            >
                                                <Text style={[styles.allWalletsText, { color: c.primary }]}>Tất cả ví</Text>
                                                <MaterialCommunityIcons name="chevron-right" size={16} color={c.primary} />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                    setBalanceVisible((v) => !v);
                                                }}
                                                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                                style={styles.eyeBtn}
                                            >
                                                <MaterialCommunityIcons
                                                    name={balanceVisible ? 'eye-outline' : 'eye-off-outline'}
                                                    size={20}
                                                    color={c.textDim}
                                                />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    <View style={styles.balanceRow}>
                                        <Text style={[styles.balanceAmount, { color: c.textPrimary }]}>
                                            {balanceVisible ? formatCurrency(totalBalance) : '••••••••'}
                                        </Text>
                                        <View style={[styles.changeBadge, { backgroundColor: '#0ECB8118' }]}>
                                            <MaterialCommunityIcons name="trending-up" size={12} color="#0ECB81" />
                                            <Text style={[styles.changeText, { color: '#0ECB81' }]}>+2.5%</Text>
                                        </View>
                                    </View>
                                    <View style={[styles.divider, { backgroundColor: c.border, opacity: 0.5 }]} />
                                    <View style={styles.actionRowContainer}>
                                        <TouchableOpacity
                                            style={styles.miniActionItem}
                                            onPress={() => (navigation as any).getParent()?.navigate('Wallets')}
                                        >
                                            <View style={[styles.miniActionIcon, { backgroundColor: c.primary + '15' }]}>
                                                <MaterialCommunityIcons name="plus" size={20} color={c.primary} />
                                            </View>
                                            <Text style={[styles.miniActionText, { color: c.textPrimary }]}>Nạp tiền</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.miniActionItem}
                                            onPress={handleTransfer}
                                        >
                                            <View style={[styles.miniActionIcon, { backgroundColor: c.textPrimary + '10' }]}>
                                                <MaterialCommunityIcons name="send-outline" size={18} color={c.textPrimary} />
                                            </View>
                                            <Text style={[styles.miniActionText, { color: c.textPrimary }]}>Chuyển tiền</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.miniActionItem}
                                            onPress={handleMyQR}
                                        >
                                            <View style={[styles.miniActionIcon, { backgroundColor: c.textPrimary + '10' }]}>
                                                <MaterialCommunityIcons name="qrcode" size={18} color={c.textPrimary} />
                                            </View>
                                            <Text style={[styles.miniActionText, { color: c.textPrimary }]}>Mã QR</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.miniActionItem}
                                            onPress={() => (navigation as any).navigate('Wallet', { screen: 'History' })}
                                        >
                                            <View style={[styles.miniActionIcon, { backgroundColor: c.textPrimary + '10' }]}>
                                                <MaterialCommunityIcons name="history" size={18} color={c.textPrimary} />
                                            </View>
                                            <Text style={[styles.miniActionText, { color: c.textPrimary }]}>Lịch sử</Text>
                                        </TouchableOpacity>
                                    </View>
                                </CommonCard>
                            </LinearGradient>
                        </View>
                    </Animated.View>

                    {/* 2. Banner Carousel - Dưới Tổng tài sản, clickable */}
                    <Animated.View
                        entering={FadeInDown.delay(200).duration(800)}
                        style={[styles.bannerSection, { marginTop: 28 }]}
                    >
                        <ScrollView
                            ref={scrollRef}
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            snapToInterval={BANNER_WIDTH + BANNER_GAP}
                            snapToAlignment="start"
                            decelerationRate="fast"
                            contentContainerStyle={styles.bannerScrollContent}
                            onMomentumScrollEnd={onBannerScroll}
                        >
                            {BANNERS.map((banner) => (
                                <BannerCard
                                    key={banner.id}
                                    banner={banner}
                                    onPress={() => handleBannerPress(banner)}
                                />
                            ))}
                        </ScrollView>
                        <View style={styles.bannerDots}>
                            {BANNERS.map((_, i) => (
                                <View
                                    key={i}
                                    style={[
                                        styles.dot,
                                        {
                                            backgroundColor: i === bannerIndex ? c.primary : c.border,
                                            width: i === bannerIndex ? 20 : 6,
                                        },
                                    ]}
                                />
                            ))}
                        </View>
                    </Animated.View>


                    {/* 4. MoMo-style Grid Action - Tích hợp chung */}
                    <ActionGroup
                        items={MOMO_GRID}
                        theme={theme}
                        onItemPress={handleShortcutPress}
                        index={0}
                    />

                    {/* 5. Cài đặt nhỏ hơn phía dưới */}
                    <ActionGroup
                        title="TIỆN ÍCH KHÁC"
                        items={SETTINGS_GROUP}
                        theme={theme}
                        onItemPress={handleShortcutPress}
                        index={1}
                    />
                </FintechPullToRefresh>
            )}

            <WalletSelectorModal
                visible={walletSelectorVisible}
                onClose={() => setWalletSelectorVisible(false)}
                wallets={wallets}
                onSelect={handleSelectWalletForQR}
                title="Chọn ví nhận tiền"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    loadingWrap: { marginTop: Platform.OS === 'ios' ? 36 : 52 },
    scrollContent: { paddingTop: 4 },
    section: { paddingHorizontal: 16, marginTop: 16 },

    shadowWrapper: {
        backgroundColor: 'transparent',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 12,
            },
            android: {
                // On Android, elevation needs a background to show correctly, 
                // but we must use it on a container WITHOUT overflow: hidden
                elevation: 4,
            },
        }),
    },
    portfolioCardContainer: {
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
    },
    portfolioCard: { padding: 22, paddingBottom: 20 },
    portfolioHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    portfolioLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    portfolioLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.6 },
    headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    allWalletsBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, backgroundColor: 'rgba(252, 213, 53, 0.1)' },
    allWalletsText: { fontSize: 12, fontWeight: '700' },
    eyeBtn: { padding: 4 },
    balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    balanceAmount: { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
    changeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
    },
    changeText: { fontSize: 11, fontWeight: '700' },
    divider: { height: 1, marginVertical: 20 },

    // Mini Actions UI
    actionRowContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 4,
    },
    miniActionItem: {
        alignItems: 'center',
        flex: 1,
    },
    miniActionIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    miniActionText: {
        fontSize: 12,
        fontWeight: '600',
    },

    // Theme row - dùng cho header
    themeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginHorizontal: 16,
        marginTop: 20,
        padding: 16,
        borderRadius: 14,
    },
    themeRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    themeIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    themeLabel: { fontSize: 15, fontWeight: '700' },
    themeSub: { fontSize: 12, marginTop: 1, opacity: 0.7 },

    // Custom Toggle
    customToggle: {
        width: 52,
        height: 28,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 4,
        position: 'relative',
    },
    toggleThumb: {
        width: 22,
        height: 22,
        borderRadius: 11,
        position: 'absolute',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
    },

    // Banner - dưới Tổng tài sản, clickable
    bannerSection: { marginTop: 24, paddingLeft: 16 },
    bannerScrollContent: { paddingRight: 16 },
    bannerCard: {
        marginRight: BANNER_GAP,
        width: BANNER_WIDTH,
        height: BANNER_HEIGHT,
        borderRadius: 20,
        overflow: 'hidden',
        // Clear background for Android crispness
        backgroundColor: '#000',
    },
    bannerGradient: {
        flex: 1,
        padding: 18,
        justifyContent: 'center',
    },
    bannerOverlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        justifyContent: 'flex-end',
        padding: 18,
    },
    bannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    bannerAccent: {
        width: 4,
        height: 36,
        borderRadius: 2,
        marginRight: 12,
    },
    bannerText: { flex: 1 },
    bannerTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 2,
    },
    bannerSubtitle: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.75)',
    },
    bannerCta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    bannerCtaText: { fontSize: 12, fontWeight: '600', color: '#fff' },
    bannerDots: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        marginTop: 12,
    },
    dot: {
        height: 6,
        borderRadius: 3,
    },

    // Action groups
    actionGroup: { paddingHorizontal: 16, marginTop: 28 },
    groupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
        paddingHorizontal: 4,
    },
    groupTitle: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        opacity: 0.4,
    },
    groupTitleLine: {
        flex: 1,
        height: 1,
        borderRadius: 1,
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        borderRadius: 20,
        paddingVertical: 20,
        paddingHorizontal: 12,
        backgroundColor: '#fff',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.04,
                shadowRadius: 8,
            },
            android: {
                elevation: 1,
            }
        })
    },
    quickItem: {
        width: (SCREEN_WIDTH - 32 - 24 - 30) / 4,
        alignItems: 'center',
        marginBottom: 16,
    },
    quickIconWrap: {
        width: 52,
        height: 52,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        marginBottom: 8,
    },
    quickImage: {
        width: 32,
        height: 32,
    },
    quickLabel: {
        fontSize: 11,
        fontWeight: '600',
        textAlign: 'center',
        lineHeight: 13,
    },
});
