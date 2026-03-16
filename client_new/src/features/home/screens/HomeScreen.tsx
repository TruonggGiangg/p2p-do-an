import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Platform,
    Dimensions,
    ScrollView,
    NativeSyntheticEvent,
    NativeScrollEvent,
    Pressable,
} from 'react-native';
import Animated, {
    FadeInDown,
    FadeInUp,
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    interpolate,
    Extrapolate,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../../../contexts/AuthContext';
import { walletAPI } from '../../wallet/api/wallet.api';
import { BinanceHeader, FintechPullToRefresh, FintechScreenSkeleton } from '../../../components';
import { WalletSelectorModal } from '../../wallet/components/WalletSelectorModal';
import { useTheme } from '../../../contexts/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Wallet } from '../../../types/auth.types';
import { formatCurrency } from '../../../shared/utils';
import {
    QUICK_ACTIONS,
    SERVICES_GRID,
    UTILITIES_GRID,
    BANNERS,
    type BannerItem,
    type ShortcutItem,
} from '../constants/home.constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BANNER_WIDTH = SCREEN_WIDTH - 32;
const BANNER_HEIGHT = 160;
const BANNER_GAP = 12;
const WALLET_CARD_W = SCREEN_WIDTH - 48;
const WALLET_CARD_H = 210;

// Gradient presets
const CARD_GRADIENTS: [string, string, ...string[]][] = [
    ['#14342B', '#1A3B34', '#245649'],
    ['#0D2820', '#14342B', '#1E4D3F'],
    ['#1A3B34', '#245649', '#2D6B5A'],
    ['#0B1F18', '#14342B', '#1A3B34'],
];

function getGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Chào buổi sáng';
    if (h < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
}

// ─────────────────────────────────────────────
// FRONT — Glassmorphic Mastercard
// Clean card: logo, chip, card number, name, validity
// ─────────────────────────────────────────────
function CardFront({
    wallet,
    gradientColors,
    isDefault,
    userName,
}: {
    wallet: Wallet;
    gradientColors: [string, string, ...string[]];
    isDefault: boolean;
    userName: string;
}) {
    const acctNo = wallet.accountNo || wallet.metadata?.accountNo || '0000000000000000';
    const digits = acctNo.replace(/\D/g, '').padEnd(16, '0');
    const formatted = `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;

    return (
        <View style={styles.cardFace}>
            {/* Glassmorphic background */}
            <LinearGradient
                colors={gradientColors}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />
            {/* Glass overlay */}
            <View style={styles.glassOverlay} />

            {/* Decorative blobs */}
            <View style={styles.decoBlob1} />
            <View style={styles.decoBlob2} />

            {/* Content */}
            <View style={styles.frontContent}>
                {/* Header: Logo + Chip */}
                <View style={styles.frontHeader}>
                    <View style={styles.frontLogoWrap}>
                        <View style={styles.masterCardLogoFront}>
                            <View style={[styles.mcCircleFront, { backgroundColor: '#EB001B' }]} />
                            <View style={[styles.mcCircleFront, { backgroundColor: '#F79E1B', marginLeft: -10 }]} />
                        </View>
                        <View>
                            <Text style={styles.frontBrandName}>Ví điện tử</Text>
                            {isDefault && (
                                <View style={styles.defaultBadge}>
                                    <MaterialCommunityIcons name="check-circle" size={9} color="#CDEA2D" />
                                    <Text style={styles.defaultBadgeText}>Mặc định</Text>
                                </View>
                            )}
                        </View>
                    </View>
                    <View style={styles.chipArea}>
                        {/* Chip visual */}
                        <View style={styles.chipBase}>
                            <View style={styles.chipLine1} />
                            <View style={styles.chipLine2} />
                            <View style={styles.chipCenter} />
                        </View>
                        <MaterialCommunityIcons name="contactless-payment" size={16} color="rgba(255,255,255,0.4)" />
                    </View>
                </View>

                {/* Card Number */}
                <View style={styles.cardNumberSection}>
                    <Text style={styles.cardNumberLabel}>Card Number</Text>
                    <Text style={styles.cardNumberText}>{formatted}</Text>
                </View>

                {/* Bottom: Name + Validity */}
                <View style={styles.frontBottom}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.cardHolderName}>{userName.toUpperCase()}</Text>
                    </View>
                    <View style={styles.validityWrap}>
                        <Text style={styles.validityLabel}>Valid Thru</Text>
                        <Text style={styles.validityValue}>12/28</Text>
                    </View>
                </View>
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────
// BACK — Magnetic stripe + Balance + QR Code
// ─────────────────────────────────────────────
function CardBack({
    wallet,
    balanceVisible,
    phone,
}: {
    wallet: Wallet;
    balanceVisible: boolean;
    phone: string;
}) {
    const acctNo = wallet.accountNo || wallet.metadata?.accountNo || 'N/A';
    const qrData = JSON.stringify({
        type: 'p2p_wallet',
        phone,
        accountNo: acctNo,
        walletId: wallet._id || wallet.id,
    });

    return (
        <View style={[styles.cardFace, { padding: 0 }]}>
            {/* Base gradient */}
            <LinearGradient
                colors={['#0A1612', '#14342B', '#0F2820'] as any}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            {/* Metallic sheen overlay */}
            <LinearGradient
                colors={[
                    'transparent',
                    'rgba(205,234,45,0.04)',
                    'rgba(255,255,255,0.06)',
                    'rgba(205,234,45,0.03)',
                    'transparent',
                ] as any}
                style={[StyleSheet.absoluteFillObject, { borderRadius: 24 }]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            {/* Metallic line accents */}
            <View style={styles.backMetalLine1} />
            <View style={styles.backMetalLine2} />
            <View style={styles.backMetalCircle} />

            {/* Content */}
            <View style={styles.backContent}>
                {/* Header row */}
                <View style={styles.backHeader}>
                    <View style={styles.backLogoWrap}>
                        <View style={styles.backLogoCircle}>
                            <MaterialCommunityIcons name="wallet-outline" size={14} color="#CDEA2D" />
                        </View>
                        <Text style={styles.backBrandText}>Ví điện tử</Text>
                    </View>
                    <View style={styles.backChipMini}>
                        <MaterialCommunityIcons name="contactless-payment" size={14} color="rgba(205,234,45,0.5)" />
                    </View>
                </View>

                {/* Balance + QR row */}
                <View style={styles.backMainRow}>
                    <View style={styles.backBalanceWrap}>
                        <View style={styles.backBalanceBorder}>
                            <Text style={styles.backBalanceLabel}>SỐ DƯ KHẢ DỤNG</Text>
                            <Text style={styles.backBalanceAmount}>
                                {balanceVisible ? formatCurrency(wallet.balance) : '••••••••'}
                            </Text>
                        </View>
                        <View style={styles.backAccountRow}>
                            <MaterialCommunityIcons name="credit-card-outline" size={11} color="rgba(205,234,45,0.5)" />
                            <Text style={styles.backAccountValue}>{acctNo}</Text>
                        </View>
                    </View>

                    <View style={styles.qrWrap}>
                        <View style={styles.qrInner}>
                            <QRCode
                                value={qrData}
                                size={62}
                                color="#14342B"
                                backgroundColor="#FFFFFF"
                            />
                        </View>
                        <Text style={styles.qrLabel}>QUÉT NHẬN TIỀN</Text>
                    </View>
                </View>

                {/* Footer */}
                <View style={styles.backFooter}>
                    <MaterialCommunityIcons name="rotate-3d-variant" size={11} color="rgba(205,234,45,0.4)" />
                    <Text style={styles.backFooterText}>Chạm để lật lại</Text>
                </View>
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────
// Flippable 3D Card — smooth spring flip
// ─────────────────────────────────────────────
function FlippableCard({
    wallet,
    index,
    balanceVisible,
    isDefault,
    userName,
    phone,
    onSetDefault,
}: {
    wallet: Wallet;
    index: number;
    balanceVisible: boolean;
    isDefault: boolean;
    userName: string;
    phone: string;
    onSetDefault: () => void;
}) {
    const flipAnim = useSharedValue(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const gradientColors = CARD_GRADIENTS[index % CARD_GRADIENTS.length];

    const handleFlip = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const target = !isFlipped;
        setIsFlipped(target);

        flipAnim.value = withSpring(target ? 1 : 0, {
            damping: 18,
            stiffness: 85,
            mass: 0.8,
            overshootClamping: false,
        });

        // Delay default-set until animation finishes to avoid re-render jank
        if (!target) {
            setTimeout(() => onSetDefault(), 500);
        }
    };

    const frontStyle = useAnimatedStyle(() => {
        const rotateY = interpolate(flipAnim.value, [0, 1], [0, 180]);
        // Smooth opacity crossfade around the midpoint
        const opacity = interpolate(flipAnim.value, [0, 0.4, 0.5, 0.6, 1], [1, 1, 0.5, 0, 0]);
        // Subtle scale dip at midpoint for depth effect
        const scale = interpolate(flipAnim.value, [0, 0.5, 1], [1, 0.92, 1]);
        return {
            transform: [
                { perspective: 1200 },
                { rotateY: `${rotateY}deg` },
                { scale },
            ],
            backfaceVisibility: 'hidden' as const,
            opacity,
        };
    });

    const backStyle = useAnimatedStyle(() => {
        const rotateY = interpolate(flipAnim.value, [0, 1], [180, 360]);
        const opacity = interpolate(flipAnim.value, [0, 0.4, 0.5, 0.6, 1], [0, 0, 0.5, 1, 1]);
        const scale = interpolate(flipAnim.value, [0, 0.5, 1], [1, 0.92, 1]);
        return {
            transform: [
                { perspective: 1200 },
                { rotateY: `${rotateY}deg` },
                { scale },
            ],
            backfaceVisibility: 'hidden' as const,
            opacity,
        };
    });

    // Shimmer flash overlay — sweeps across at flip midpoint
    const shimmerStyle = useAnimatedStyle(() => {
        const translateX = interpolate(
            flipAnim.value,
            [0.2, 0.5, 0.8],
            [-WALLET_CARD_W, 0, WALLET_CARD_W],
            Extrapolate.CLAMP,
        );
        const opacity = interpolate(
            flipAnim.value,
            [0.15, 0.35, 0.5, 0.65, 0.85],
            [0, 0.7, 1, 0.7, 0],
            Extrapolate.CLAMP,
        );
        return {
            transform: [{ translateX }, { skewX: '-15deg' }],
            opacity,
        };
    });

    return (
        <Pressable onPress={handleFlip} style={styles.flippableCardWrap}>
            <Animated.View style={[styles.cardSide, frontStyle]}>
                <CardFront wallet={wallet} gradientColors={gradientColors} isDefault={isDefault} userName={userName} />
            </Animated.View>
            <Animated.View style={[styles.cardSide, backStyle]}>
                <CardBack wallet={wallet} balanceVisible={balanceVisible} phone={phone} />
            </Animated.View>
            {/* Shimmer flash on flip */}
            <Animated.View pointerEvents="none" style={[styles.flipShimmer, shimmerStyle]}>
                <LinearGradient
                    colors={['transparent', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0.15)', 'transparent'] as any}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>
        </Pressable>
    );
}

// ─────────────────────────────────────────────
// Quick Action
// ─────────────────────────────────────────────
function QuickActionButton({
    item, onPress, colors, delay = 0,
}: { item: ShortcutItem; onPress: () => void; colors: any; delay?: number; }) {
    return (
        <Animated.View entering={FadeInDown.delay(delay).duration(500)}>
            <TouchableOpacity style={styles.quickActionBtn} activeOpacity={0.7}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}>
                <View style={[styles.quickActionCircle, { backgroundColor: colors.accent }]}>
                    <MaterialCommunityIcons name={item.icon} size={22} color="#CDEA2D" />
                </View>
                <Text style={[styles.quickActionLabel, { color: colors.textPrimary }]}>{item.label}</Text>
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─────────────────────────────────────────────
// Service Item
// ─────────────────────────────────────────────
function ServiceGridItem({
    item, onPress, colors, isDark, index,
}: { item: ShortcutItem; onPress: () => void; colors: any; isDark: boolean; index: number; }) {
    return (
        <Animated.View entering={FadeInDown.delay(400 + index * 60).duration(500)}>
            <TouchableOpacity style={styles.serviceItem} activeOpacity={0.6}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}>
                <View style={[styles.serviceIconCircle, { backgroundColor: colors.accentGlass }]}>
                    <MaterialCommunityIcons name={item.icon} size={24} color={isDark ? '#CDEA2D' : colors.accent} />
                </View>
                <Text style={[styles.serviceLabel, { color: colors.textPrimary }]} numberOfLines={2}>
                    {item.label}
                </Text>
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─────────────────────────────────────────────
// Banner
// ─────────────────────────────────────────────
function BannerCard({ banner, onPress }: { banner: BannerItem; onPress: () => void; }) {
    return (
        <Animated.View entering={FadeInUp.duration(600)}>
            <Pressable style={styles.bannerCard} onPress={onPress} android_ripple={{ color: 'rgba(205,234,45,0.1)' }}>
                <LinearGradient colors={banner.gradient} style={styles.bannerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <View style={styles.bannerContent}>
                        <View style={styles.bannerText}>
                            <Text style={styles.bannerTitle}>{banner.title}</Text>
                            <Text style={styles.bannerSubtitle}>{banner.subtitle}</Text>
                        </View>
                        <View style={[styles.bannerCta, { backgroundColor: '#CDEA2D' }]}>
                            <Text style={[styles.bannerCtaText, { color: '#14342B' }]}>Khám phá</Text>
                            <MaterialCommunityIcons name="arrow-top-right" size={14} color="#14342B" />
                        </View>
                    </View>
                </LinearGradient>
            </Pressable>
        </Animated.View>
    );
}

// ═══════════════════════════════════════════════
// HOME SCREEN
// ═══════════════════════════════════════════════
export default function HomeScreen() {
    const navigation = useNavigation();
    const { user, refreshUser } = useAuth();
    const { theme, themeMode } = useTheme();
    const insets = useSafeAreaInsets();
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [walletsLoading, setWalletsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [walletSelectorVisible, setWalletSelectorVisible] = useState(false);
    const [balanceVisible, setBalanceVisible] = useState(true);
    const [bannerIndex, setBannerIndex] = useState(0);
    const [activeCardIndex, setActiveCardIndex] = useState(0);
    const bannerScrollRef = useRef<ScrollView>(null);
    const cardScrollRef = useRef<ScrollView>(null);
    const bannerTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    const c = theme.colors;
    const isDark = themeMode === 'dark';

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

    useEffect(() => { fetchWallets(); }, []);

    useEffect(() => {
        bannerTimer.current = setInterval(() => {
            setBannerIndex((prev) => {
                const next = (prev + 1) % BANNERS.length;
                bannerScrollRef.current?.scrollTo({ x: next * (BANNER_WIDTH + BANNER_GAP), animated: true });
                return next;
            });
        }, 5000);
        return () => { if (bannerTimer.current) clearInterval(bannerTimer.current); };
    }, []);

    const handleItemPress = (item: ShortcutItem) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (item.nav === 'QR') { setWalletSelectorVisible(true); }
        else { item.isParent ? (navigation as any).getParent()?.navigate(item.nav) : (navigation as any).navigate(item.nav); }
    };
    const handleSelectWalletForQR = (wallet: Wallet) => { setWalletSelectorVisible(false); (navigation as any).navigate('MyQR', { wallet }); };
    const handleBannerPress = (banner: BannerItem) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); (navigation as any).navigate(banner.actionNav); };
    const onBannerScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => { const idx = Math.round(e.nativeEvent.contentOffset.x / (BANNER_WIDTH + BANNER_GAP)); setBannerIndex(Math.min(idx, BANNERS.length - 1)); };
    const onCardScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const idx = Math.round(e.nativeEvent.contentOffset.x / (WALLET_CARD_W + 12));
        if (idx !== activeCardIndex && idx >= 0 && idx < (wallets.length || 1)) { setActiveCardIndex(idx); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
    };
    const handleSetDefaultCard = (idx: number) => { setActiveCardIndex(idx); };

    const tabBarHeight = Platform.OS === 'ios' ? 60 + insets.bottom : 70;
    const userName = user?.name || user?.profile?.firstName || 'Bạn';
    const phone = user?.metadata?.phone || user?.username || '';

    const displayWallets = wallets.length > 0 ? wallets : [{
        _id: 'placeholder', type: 'e_wallet' as const, balance: 0,
        productName: 'P2P Wallet', accountNo: '0000', status: 'active', currency: 'VND',
    }];

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader mode="dashboard" onAvatarPress={() => (navigation as any).navigate('Profile')} onSearchPress={() => { }} />

            {walletsLoading && !refreshing ? (
                <View style={[styles.loadingWrap, { marginTop: Platform.OS === 'ios' ? 36 : 52 }]}>
                    <FintechScreenSkeleton variant="home" />
                </View>
            ) : (
                <FintechPullToRefresh onRefresh={onRefresh} refreshing={refreshing}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 32 }]}
                    primaryColor={c.primary} glowColor={c.primaryLight}>

                    {/* 1. GREETING */}
                    <Animated.View entering={FadeInDown.duration(600)} style={styles.greetingSection}>
                        <Text style={[styles.greetingText, { color: c.textSecondary }]}>{getGreeting()} 👋</Text>
                        <View style={styles.greetingRow}>
                            <Text style={[styles.greetingName, { color: c.textPrimary }]}>{userName}</Text>
                            <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setBalanceVisible(v => !v); }}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <MaterialCommunityIcons name={balanceVisible ? 'eye-outline' : 'eye-off-outline'} size={22} color={c.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    </Animated.View>

                    {/* 2. 3D CARD CAROUSEL */}
                    <Animated.View entering={FadeInDown.delay(200).duration(700)} style={styles.cardCarouselSection}>
                        <ScrollView ref={cardScrollRef} horizontal showsHorizontalScrollIndicator={false}
                            snapToInterval={WALLET_CARD_W + 12} snapToAlignment="start" decelerationRate="fast"
                            contentContainerStyle={styles.cardScrollContent} onMomentumScrollEnd={onCardScroll}>
                            {displayWallets.map((wallet, idx) => (
                                <FlippableCard key={wallet._id || idx} wallet={wallet} index={idx}
                                    balanceVisible={balanceVisible} isDefault={idx === activeCardIndex}
                                    userName={userName} phone={phone} onSetDefault={() => handleSetDefaultCard(idx)} />
                            ))}
                        </ScrollView>
                        {displayWallets.length > 1 && (
                            <View style={styles.cardDots}>
                                {displayWallets.map((_, i) => (
                                    <View key={i} style={[styles.cardDot, {
                                        backgroundColor: i === activeCardIndex ? '#CDEA2D' : (isDark ? c.border : '#D1D5DB'),
                                        width: i === activeCardIndex ? 20 : 8,
                                    }]} />
                                ))}
                            </View>
                        )}
                        <View style={styles.swipeHint}>
                            <MaterialCommunityIcons name="gesture-tap" size={14} color={c.textMuted} />
                            <Text style={[styles.swipeHintText, { color: c.textMuted }]}>
                                Chạm để lật thẻ{displayWallets.length > 1 ? ' • Vuốt để đổi ví' : ''}
                            </Text>
                        </View>
                    </Animated.View>

                    {/* 3. QUICK ACTIONS */}
                    <View style={styles.quickActionsSection}>
                        {QUICK_ACTIONS.map((item, idx) => (
                            <QuickActionButton key={idx} item={item} onPress={() => handleItemPress(item)} colors={c} delay={400 + idx * 80} />
                        ))}
                    </View>

                    {/* 4. SERVICES */}
                    <Animated.View entering={FadeInDown.delay(600).duration(600)} style={styles.servicesSection}>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Dịch vụ</Text>
                        </View>
                        <View style={[styles.servicesCard, { backgroundColor: isDark ? c.surface : '#FFF',
                            ...Platform.select({ ios: { shadowColor: '#14342B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.2 : 0.06, shadowRadius: 16 }, android: { elevation: isDark ? 4 : 2 } }) }]}>
                            {SERVICES_GRID.map((item, idx) => (
                                <ServiceGridItem key={idx} item={item} onPress={() => handleItemPress(item)} colors={c} isDark={isDark} index={idx} />
                            ))}
                        </View>
                    </Animated.View>

                    {/* 5. BANNERS */}
                    <Animated.View entering={FadeInDown.delay(700).duration(600)} style={styles.bannerSection}>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Ưu đãi</Text>
                        </View>
                        <ScrollView ref={bannerScrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                            snapToInterval={BANNER_WIDTH + BANNER_GAP} snapToAlignment="start" decelerationRate="fast"
                            contentContainerStyle={styles.bannerScrollContent} onMomentumScrollEnd={onBannerScroll}
                            onScrollBeginDrag={() => { if (bannerTimer.current) clearInterval(bannerTimer.current); }}>
                            {BANNERS.map((b) => <BannerCard key={b.id} banner={b} onPress={() => handleBannerPress(b)} />)}
                        </ScrollView>
                        <View style={styles.bannerDots}>
                            {BANNERS.map((_, i) => (
                                <View key={i} style={[styles.dot, { backgroundColor: i === bannerIndex ? '#CDEA2D' : (isDark ? c.border : '#D1D5DB'), width: i === bannerIndex ? 24 : 8 }]} />
                            ))}
                        </View>
                    </Animated.View>

                    {/* 6. UTILITIES */}
                    <Animated.View entering={FadeInDown.delay(800).duration(600)} style={styles.servicesSection}>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Tiện ích</Text>
                        </View>
                        <View style={[styles.servicesCard, { backgroundColor: isDark ? c.surface : '#FFF',
                            ...Platform.select({ ios: { shadowColor: '#14342B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.2 : 0.06, shadowRadius: 16 }, android: { elevation: isDark ? 4 : 2 } }) }]}>
                            {UTILITIES_GRID.map((item, idx) => (
                                <ServiceGridItem key={idx} item={item} onPress={() => handleItemPress(item)} colors={c} isDark={isDark} index={idx} />
                            ))}
                        </View>
                    </Animated.View>

                    <View style={{ height: 24 }} />
                </FintechPullToRefresh>
            )}

            <WalletSelectorModal visible={walletSelectorVisible} onClose={() => setWalletSelectorVisible(false)}
                wallets={wallets} onSelect={handleSelectWalletForQR} title="Chọn ví nhận tiền" />
        </View>
    );
}

// ═══════════════════════════════════════════════
const styles = StyleSheet.create({
    container: { flex: 1 },
    loadingWrap: { marginTop: Platform.OS === 'ios' ? 36 : 52 },
    scrollContent: { paddingTop: 4 },

    // ── Greeting ──
    greetingSection: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
    greetingText: { fontSize: 13, fontWeight: '500', letterSpacing: 0.3 },
    greetingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    greetingName: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },

    // ── Section Headers ──
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingHorizontal: 2 },
    sectionTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },

    // ── Card Carousel ──
    cardCarouselSection: { marginTop: 20 },
    cardScrollContent: { paddingHorizontal: 24, paddingVertical: 8 },
    flippableCardWrap: { width: WALLET_CARD_W, height: WALLET_CARD_H, marginRight: 12 },
    cardSide: { position: 'absolute', width: '100%', height: '100%' },
    flipShimmer: {
        position: 'absolute', width: '100%', height: '100%',
        borderRadius: 24, overflow: 'hidden', zIndex: 10,
    },

    // ── Card Face (shared) ──
    cardFace: {
        width: '100%', height: '100%', borderRadius: 24, padding: 20,
        overflow: 'hidden', position: 'relative',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: -6, height: 7 }, shadowOpacity: 0.3, shadowRadius: 15 },
            android: { elevation: 12 },
        }),
    },

    // ── Glassmorphic overlay ──
    glassOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        borderRadius: 24,
    },

    // ── Decorative blobs (like CSS ::before/::after) ──
    decoBlob1: {
        position: 'absolute', width: 180, height: 180, borderRadius: 90,
        backgroundColor: 'rgba(205, 234, 45, 0.12)',
        top: -60, right: -40,
    },
    decoBlob2: {
        position: 'absolute', width: 140, height: 140, borderRadius: 70,
        backgroundColor: 'rgba(205, 234, 45, 0.06)',
        bottom: -40, left: -30,
    },

    // ── Front Card ──
    frontContent: { flex: 1, justifyContent: 'space-between', zIndex: 1 },
    frontHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    frontLogoWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    masterCardLogoFront: { flexDirection: 'row' },
    mcCircleFront: { width: 26, height: 26, borderRadius: 13, opacity: 0.85 },
    frontBrandName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
    defaultBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    defaultBadgeText: { fontSize: 9, fontWeight: '700', color: '#CDEA2D', textTransform: 'uppercase', letterSpacing: 0.5 },

    chipArea: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    chipBase: {
        width: 36, height: 28, borderRadius: 5,
        backgroundColor: 'rgba(205, 234, 45, 0.35)',
        borderWidth: 1, borderColor: 'rgba(205, 234, 45, 0.2)',
        justifyContent: 'center', alignItems: 'center',
        position: 'relative', overflow: 'hidden',
    },
    chipLine1: { position: 'absolute', width: 36, height: 1, backgroundColor: 'rgba(255,255,255,0.2)', top: 10 },
    chipLine2: { position: 'absolute', width: 36, height: 1, backgroundColor: 'rgba(255,255,255,0.2)', top: 18 },
    chipCenter: { width: 12, height: 10, borderRadius: 2, backgroundColor: 'rgba(205, 234, 45, 0.2)' },

    // Card Number
    cardNumberSection: { marginTop: 8 },
    cardNumberLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '500', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
    cardNumberText: { color: '#FFFFFF', fontSize: 20, fontWeight: '400', letterSpacing: 3 },

    // Front bottom
    frontBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    cardHolderName: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '300', letterSpacing: 1.5 },
    validityWrap: { alignItems: 'flex-end' },
    validityLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '300', marginBottom: 2 },
    validityValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '400' },

    // ── Back Card ──
    backMetalLine1: {
        position: 'absolute', width: '140%', height: 1,
        backgroundColor: 'rgba(205,234,45,0.06)',
        top: '35%', left: '-20%',
        transform: [{ rotate: '-25deg' }],
    },
    backMetalLine2: {
        position: 'absolute', width: '140%', height: 1,
        backgroundColor: 'rgba(255,255,255,0.04)',
        top: '65%', left: '-20%',
        transform: [{ rotate: '-25deg' }],
    },
    backMetalCircle: {
        position: 'absolute', width: 200, height: 200, borderRadius: 100,
        borderWidth: 1, borderColor: 'rgba(205,234,45,0.04)',
        top: -60, right: -60,
    },
    backContent: {
        flex: 1, padding: 18, justifyContent: 'space-between', zIndex: 1,
    },
    backHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    backLogoWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    backLogoCircle: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: 'rgba(205,234,45,0.12)',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(205,234,45,0.15)',
    },
    backBrandText: {
        color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.5,
    },
    backChipMini: {
        width: 28, height: 28, borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
        justifyContent: 'center', alignItems: 'center',
    },

    backMainRow: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
    },
    backBalanceWrap: { flex: 1 },
    backBalanceBorder: {
        borderLeftWidth: 2, borderLeftColor: 'rgba(205,234,45,0.4)',
        paddingLeft: 10, marginBottom: 8,
    },
    backBalanceLabel: {
        color: 'rgba(205,234,45,0.6)', fontSize: 9, fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4,
    },
    backBalanceAmount: {
        color: '#FFFFFF', fontSize: 20, fontWeight: '800',
        fontFamily: 'Poppins_700Bold', letterSpacing: -0.3,
    },
    backAccountRow: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingLeft: 10,
    },
    backAccountLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '600' },
    backAccountValue: {
        color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.5,
    },

    qrWrap: { alignItems: 'center' },
    qrInner: {
        padding: 5, borderRadius: 10, backgroundColor: '#FFFFFF',
        ...Platform.select({
            ios: { shadowColor: '#CDEA2D', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8 },
            android: { elevation: 4 },
        }),
    },
    qrLabel: {
        color: 'rgba(205,234,45,0.45)', fontSize: 7, fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
        marginTop: 5, textTransform: 'uppercase', letterSpacing: 0.8,
    },

    backFooter: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    },
    backFooterText: {
        color: 'rgba(205,234,45,0.35)', fontSize: 10, fontWeight: '500',
        fontFamily: 'Poppins_500Medium',
    },

    // ── Card Dots ──
    cardDots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 14 },
    cardDot: { height: 6, borderRadius: 3 },
    swipeHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
    swipeHintText: { fontSize: 11, fontWeight: '500' },

    // ── Quick Actions ──
    quickActionsSection: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 16, marginTop: 24 },
    quickActionBtn: { alignItems: 'center', width: 72 },
    quickActionCircle: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    quickActionLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },

    // ── Services ──
    servicesSection: { paddingHorizontal: 16, marginTop: 28 },
    servicesCard: { borderRadius: 20, paddingVertical: 18, paddingHorizontal: 10, flexDirection: 'row', flexWrap: 'wrap' },
    serviceItem: { width: (SCREEN_WIDTH - 32 - 20) / 3, alignItems: 'center', marginBottom: 18 },
    serviceIconCircle: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    serviceLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center', lineHeight: 14 },

    // ── Banner ──
    bannerSection: { marginTop: 28, paddingHorizontal: 16 },
    bannerScrollContent: { paddingRight: 0 },
    bannerCard: { marginRight: BANNER_GAP, width: BANNER_WIDTH, height: BANNER_HEIGHT, borderRadius: 20, overflow: 'hidden', backgroundColor: '#14342B' },
    bannerGradient: { flex: 1, padding: 20, justifyContent: 'center' },
    bannerContent: { flexDirection: 'row', alignItems: 'center' },
    bannerText: { flex: 1 },
    bannerTitle: { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 4 },
    bannerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 16 },
    bannerCta: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
    bannerCtaText: { fontSize: 12, fontWeight: '800' },
    bannerDots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 14 },
    dot: { height: 8, borderRadius: 4 },
});
