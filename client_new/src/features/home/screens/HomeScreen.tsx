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
} from 'react-native';
import Animated, {
    FadeInDown,
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    interpolate,
    Extrapolate,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../../../contexts/AuthContext';
import { walletAPI } from '../../wallet/api/wallet.api';
import { BinanceHeader, FintechPullToRefresh, FintechScreenSkeleton } from '../../../components';
import { WalletSelectorModal } from '../../wallet/components/WalletSelectorModal';
import { useTheme } from '../../../contexts/ThemeContext';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import {
    Wallet, HandCoins, CreditCard, FileText, ShieldCheck, BellRinging,
    CurrencyDollar, ArrowsLeftRight, QrCode, ClockCounterClockwise,
    UserCircle, Translate, Question, Headset, ArrowUpRight, ArrowDownLeft,
    DotsThree,
    type IconProps,
} from 'phosphor-react-native';
import type { Wallet as WalletType } from '../../../types/auth.types';
import { formatCurrency } from '../../../shared/utils';
import {
    QUICK_ACTIONS,
    MAIN_FEATURES,
    FINANCIAL_SERVICES,
    UTILITIES,
    type ShortcutItem,
} from '../constants/home.constants';

// ─────────────────────────────────────────────
// Phosphor Icon Map
// ─────────────────────────────────────────────
const PHOSPHOR_MAP: Record<string, React.ComponentType<IconProps>> = {
    Wallet, HandCoins, CreditCard, FileText, ShieldCheck, BellRinging,
    CurrencyDollar, ArrowsLeftRight, QrCode, ClockCounterClockwise,
    UserCircle, Translate, Question, Headset, ArrowUpRight, ArrowDownLeft,
    DotsThree,
};

function PIcon({ name, size = 22, color = '#CDEA2D', weight = 'duotone' }: {
    name: string; size?: number; color?: string; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
}) {
    const Comp = PHOSPHOR_MAP[name];
    if (!Comp) return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
    return <Comp size={size} color={color} weight={weight} />;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WALLET_CARD_W = SCREEN_WIDTH - 48;
const WALLET_CARD_H = 210;

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
// FRONT — Glassmorphic Card
// ─────────────────────────────────────────────
function CardFront({ wallet, gradientColors, isDefault, userName }: {
    wallet: WalletType; gradientColors: [string, string, ...string[]]; isDefault: boolean; userName: string;
}) {
    const acctNo = wallet.accountNo || wallet.metadata?.accountNo || '0000000000000000';
    const digits = acctNo.replace(/\D/g, '').padEnd(16, '0');
    const formatted = `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;

    return (
        <View style={styles.cardFace}>
            <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
            <View style={styles.glassOverlay} />
            <View style={styles.decoBlob1} />
            <View style={styles.decoBlob2} />
            <View style={styles.frontContent}>
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
                        <View style={styles.chipBase}><View style={styles.chipLine1} /><View style={styles.chipLine2} /><View style={styles.chipCenter} /></View>
                        <MaterialCommunityIcons name="contactless-payment" size={16} color="rgba(255,255,255,0.4)" />
                    </View>
                </View>
                <View style={styles.cardNumberSection}>
                    <Text style={styles.cardNumberLabel}>Card Number</Text>
                    <Text style={styles.cardNumberText}>{formatted}</Text>
                </View>
                <View style={styles.frontBottom}>
                    <View style={{ flex: 1 }}><Text style={styles.cardHolderName}>{userName.toUpperCase()}</Text></View>
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
// BACK — Balance + QR Code
// ─────────────────────────────────────────────
function CardBack({ wallet, balanceVisible, phone }: {
    wallet: WalletType; balanceVisible: boolean; phone: string;
}) {
    const acctNo = wallet.accountNo || wallet.metadata?.accountNo || 'N/A';
    const qrData = JSON.stringify({ type: 'p2p_wallet', phone, accountNo: acctNo, walletId: wallet._id || wallet.id });

    return (
        <View style={[styles.cardFace, { padding: 0 }]}>
            <LinearGradient colors={['#0A1612', '#14342B', '#0F2820'] as any} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
            <View style={styles.backContent}>
                <View style={styles.backHeader}>
                    <View style={styles.backLogoWrap}>
                        <View style={styles.backLogoCircle}><MaterialCommunityIcons name="wallet-outline" size={14} color="#CDEA2D" /></View>
                        <Text style={styles.backBrandText}>Ví điện tử</Text>
                    </View>
                </View>
                <View style={styles.backMainRow}>
                    <View style={styles.backBalanceWrap}>
                        <View style={styles.backBalanceBorder}>
                            <Text style={styles.backBalanceLabel}>SỐ DƯ KHẢ DỤNG</Text>
                            <Text style={styles.backBalanceAmount}>{balanceVisible ? formatCurrency(wallet.balance) : '••••••••'}</Text>
                        </View>
                        <View style={styles.backAccountRow}>
                            <MaterialCommunityIcons name="credit-card-outline" size={11} color="rgba(205,234,45,0.5)" />
                            <Text style={styles.backAccountValue}>{acctNo}</Text>
                        </View>
                    </View>
                    <View style={styles.qrWrap}>
                        <View style={styles.qrInner}><QRCode value={qrData} size={62} color="#14342B" backgroundColor="#FFFFFF" /></View>
                        <Text style={styles.qrLabel}>QUÉT NHẬN TIỀN</Text>
                    </View>
                </View>
                <View style={styles.backFooter}>
                    <MaterialCommunityIcons name="rotate-3d-variant" size={11} color="rgba(205,234,45,0.4)" />
                    <Text style={styles.backFooterText}>Chạm để lật lại</Text>
                </View>
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────
// Flippable 3D Card
// ─────────────────────────────────────────────
function FlippableCard({ wallet, index, balanceVisible, isDefault, userName, phone, onSetDefault }: {
    wallet: WalletType; index: number; balanceVisible: boolean; isDefault: boolean; userName: string; phone: string; onSetDefault: () => void;
}) {
    const flipAnim = useSharedValue(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const gradientColors = CARD_GRADIENTS[index % CARD_GRADIENTS.length];

    const handleFlip = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const target = !isFlipped;
        setIsFlipped(target);
        flipAnim.value = withSpring(target ? 1 : 0, { damping: 18, stiffness: 85, mass: 0.8 });
        if (!target) setTimeout(() => onSetDefault(), 500);
    };

    const frontStyle = useAnimatedStyle(() => ({
        transform: [
            { perspective: 1200 },
            { rotateY: `${interpolate(flipAnim.value, [0, 1], [0, 180])}deg` },
            { scale: interpolate(flipAnim.value, [0, 0.5, 1], [1, 0.92, 1]) },
        ],
        opacity: interpolate(flipAnim.value, [0, 0.4, 0.5, 1], [1, 1, 0, 0], Extrapolate.CLAMP),
    }));

    const backStyle = useAnimatedStyle(() => ({
        transform: [
            { perspective: 1200 },
            { rotateY: `${interpolate(flipAnim.value, [0, 1], [180, 360])}deg` },
            { scale: interpolate(flipAnim.value, [0, 0.5, 1], [1, 0.92, 1]) },
        ],
        opacity: interpolate(flipAnim.value, [0, 0.5, 0.6, 1], [0, 0, 1, 1], Extrapolate.CLAMP),
    }));

    const shimmerStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(flipAnim.value, [0.2, 0.5, 0.8], [-WALLET_CARD_W, 0, WALLET_CARD_W], Extrapolate.CLAMP) },
            { skewX: '-15deg' },
        ],
        opacity: interpolate(flipAnim.value, [0.15, 0.35, 0.5, 0.65, 0.85], [0, 0.7, 1, 0.7, 0], Extrapolate.CLAMP),
    }));

    return (
        <TouchableOpacity onPress={handleFlip} activeOpacity={0.9} style={styles.flippableCardWrap}>
            <Animated.View style={[styles.cardSide, frontStyle]}><CardFront wallet={wallet} gradientColors={gradientColors} isDefault={isDefault} userName={userName} /></Animated.View>
            <Animated.View style={[styles.cardSide, backStyle]}><CardBack wallet={wallet} balanceVisible={balanceVisible} phone={phone} /></Animated.View>
            <Animated.View pointerEvents="none" style={[styles.flipShimmer, shimmerStyle]}>
                <LinearGradient colors={['transparent', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0.15)', 'transparent'] as any} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
        </TouchableOpacity>
    );
}

// ─────────────────────────────────────────────
// Balance Toggle Icon
// ─────────────────────────────────────────────
const BalanceToggleIcon = ({ visible, color, onPress }: { visible: boolean; color: string; onPress: () => void }) => {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(scale.value) }] }));
    return (
        <Animated.View style={animatedStyle}>
            <TouchableOpacity activeOpacity={0.8} onPressIn={() => { scale.value = 0.8; }} onPressOut={() => { scale.value = 1; }}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <MaterialCommunityIcons name={visible ? 'eye-outline' : 'eye-off-outline'} size={22} color={color} />
            </TouchableOpacity>
        </Animated.View>
    );
};

// ─────────────────────────────────────────────
// Quick Action Button
// ─────────────────────────────────────────────
function QuickActionButton({ item, onPress, theme, delay = 0 }: {
    item: ShortcutItem; onPress: () => void; theme: any; delay?: number;
}) {
    const isDark = theme.mode === 'dark';
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(scale.value) }] }));

    return (
        <Animated.View entering={FadeInDown.delay(delay).duration(500)} style={animatedStyle}>
            <TouchableOpacity style={styles.quickActionBtn} activeOpacity={0.9}
                onPressIn={() => { scale.value = 0.92; }} onPressOut={() => { scale.value = 1; }}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}>
                <View style={[styles.quickActionCircle, { backgroundColor: isDark ? '#14231C' : '#FFFFFF' }]}>
                    <PIcon name={item.icon} size={24} color={theme.colors.primary} weight="duotone" />
                </View>
                <Text style={[styles.quickActionLabel, { color: theme.colors.text }]}>{item.label}</Text>
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─────────────────────────────────────────────
// Main Feature Card (4 cards hàng ngang)
// ─────────────────────────────────────────────
function MainFeatureCard({ item, onPress, theme, delay = 0 }: {
    item: ShortcutItem; onPress: () => void; theme: any; delay?: number;
}) {
    const isDark = theme.mode === 'dark';
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(scale.value, { damping: 15, stiffness: 150 }) }] }));
    
    // Apply primary color consistently
    const baseColor = theme.colors.primary;

    return (
        <Animated.View entering={FadeInDown.delay(delay).duration(500)} style={animatedStyle}>
            <TouchableOpacity style={styles.quickActionBtn} activeOpacity={0.9}
                onPressIn={() => { scale.value = 0.92; }} onPressOut={() => { scale.value = 1; }}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}>
                <View style={[styles.quickActionCircle, { backgroundColor: isDark ? '#14231C' : '#FFFFFF' }]}>
                    <PIcon name={item.icon} size={24} color={baseColor} weight="duotone" />
                </View>
                <Text style={[styles.quickActionLabel, { color: theme.colors.text }]}>{item.label}</Text>
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─────────────────────────────────────────────
// Service List Item (Dịch vụ tài chính / Tiện ích)
// ─────────────────────────────────────────────
function ServiceListItem({ item, onPress, theme, delay = 0 }: {
    item: ShortcutItem; onPress: () => void; theme: any; delay?: number;
}) {
    const isDark = theme.mode === 'dark';
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(scale.value) }] }));
    
    // Apply primary color consistently
    const baseColor = theme.colors.primary;
    const iconBgColor = isDark ? `${baseColor}25` : `${baseColor}15`;

    return (
        <Animated.View entering={FadeInDown.delay(delay).duration(400)} style={animatedStyle}>
            <TouchableOpacity
                style={styles.serviceListItem}
                activeOpacity={0.8}
                onPressIn={() => { scale.value = 0.98; }}
                onPressOut={() => { scale.value = 1; }}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
            >
                <View style={[styles.serviceListIcon, { backgroundColor: iconBgColor }]}>
                    <PIcon name={item.icon} size={20} color={baseColor} weight="duotone" />
                </View>
                <View style={styles.serviceListInfo}>
                    <Text style={[styles.serviceListName, { color: theme.colors.text }]}>{item.label}</Text>
                    {item.description && (
                        <Text style={[styles.serviceListDesc, { color: theme.colors.textMuted }]}>{item.description}</Text>
                    )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={isDark ? '#454934' : '#D1D5DB'} />
            </TouchableOpacity>
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
    const [wallets, setWallets] = useState<WalletType[]>([]);
    const [walletsLoading, setWalletsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [walletSelectorVisible, setWalletSelectorVisible] = useState(false);
    const [balanceVisible, setBalanceVisible] = useState(true);
    const [activeCardIndex, setActiveCardIndex] = useState(0);
    const cardScrollRef = useRef<ScrollView>(null);

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
            setWallets(walletData.filter((w: WalletType) => w.type === 'e_wallet'));
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

    const handleItemPress = (item: ShortcutItem) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (!item.nav) return;
        if (item.nav === 'MyQR' || item.nav === 'QR') { setWalletSelectorVisible(true); }
        else { item.isParent ? (navigation as any).getParent()?.navigate(item.nav) : (navigation as any).navigate(item.nav); }
    };
    const handleSelectWalletForQR = (wallet: WalletType) => { setWalletSelectorVisible(false); (navigation as any).navigate('MyQR', { wallet }); };
    const onCardScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const idx = Math.round(e.nativeEvent.contentOffset.x / (WALLET_CARD_W + 12));
        if (idx !== activeCardIndex && idx >= 0 && idx < (wallets.length || 1)) { setActiveCardIndex(idx); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
    };

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
                            <BalanceToggleIcon visible={balanceVisible} color={c.textSecondary} onPress={() => { setBalanceVisible(v => !v); }} />
                        </View>
                        <Text style={[styles.greetingSub, { color: c.textMuted }]}>Quản lý tài chính thông minh.</Text>
                    </Animated.View>

                    {/* 2. 3D CARD CAROUSEL */}
                    <Animated.View entering={FadeInDown.delay(200).duration(700)} style={styles.cardCarouselSection}>
                        <ScrollView ref={cardScrollRef} horizontal showsHorizontalScrollIndicator={false}
                            snapToInterval={WALLET_CARD_W + 12} snapToAlignment="start" decelerationRate="fast"
                            contentContainerStyle={styles.cardScrollContent} onMomentumScrollEnd={onCardScroll}>
                            {displayWallets.map((wallet, idx) => (
                                <FlippableCard key={wallet._id || idx} wallet={wallet} index={idx}
                                    balanceVisible={balanceVisible} isDefault={idx === activeCardIndex}
                                    userName={userName} phone={phone} onSetDefault={() => setActiveCardIndex(idx)} />
                            ))}
                        </ScrollView>
                        {displayWallets.length > 1 && (
                            <View style={styles.cardDots}>
                                {displayWallets.map((_, i) => (
                                    <View key={i} style={[styles.cardDot, {
                                        backgroundColor: i === activeCardIndex ? theme.colors.primary : (isDark ? theme.colors.border : '#D1D5DB'),
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
                            <QuickActionButton key={idx} item={item} onPress={() => handleItemPress(item)} theme={theme} delay={300 + idx * 60} />
                        ))}
                    </View>

                    {/* 4. MAIN FEATURES — 4 cards ngang */}
                    <Animated.View entering={FadeInDown.delay(500).duration(600)} style={styles.sectionWrap}>
                        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Chức năng chính</Text>
                        <View style={styles.mainFeaturesGrid}>
                            {MAIN_FEATURES.map((item, idx) => (
                                <MainFeatureCard key={idx} item={item} onPress={() => handleItemPress(item)} theme={theme} delay={500 + idx * 60} />
                            ))}
                        </View>
                    </Animated.View>

                    {/* 5. FINANCIAL SERVICES — List group */}
                    <Animated.View entering={FadeInDown.delay(700).duration(600)} style={styles.sectionWrap}>
                        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Dịch vụ tài chính</Text>
                        <View style={[styles.serviceListCard, { backgroundColor: isDark ? '#14231C' : '#FFFFFF' }]}>
                            {FINANCIAL_SERVICES.map((item, idx) => (
                                <ServiceListItem key={idx} item={item} onPress={() => handleItemPress(item)} theme={theme} delay={700 + idx * 50} />
                            ))}
                        </View>
                    </Animated.View>

                    {/* 6. UTILITIES — List group */}
                    <Animated.View entering={FadeInDown.delay(900).duration(600)} style={styles.sectionWrap}>
                        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Tiện ích & cài đặt</Text>
                        <View style={[styles.serviceListCard, { backgroundColor: isDark ? '#14231C' : '#FFFFFF' }]}>
                            {UTILITIES.map((item, idx) => (
                                <ServiceListItem key={idx} item={item} onPress={() => handleItemPress(item)} theme={theme} delay={900 + idx * 50} />
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
    greetingSection: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 4 },
    greetingText: { fontSize: 13, fontWeight: '500', letterSpacing: 0.3 },
    greetingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    greetingName: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    greetingSub: { fontSize: 13, fontWeight: '400', marginTop: 2 },

    // ── Section Layout ──
    sectionWrap: { paddingHorizontal: 24, marginTop: 28 },
    sectionTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2, marginBottom: 14 },

    // ── Card Carousel ──
    cardCarouselSection: { marginTop: 20 },
    cardScrollContent: { paddingHorizontal: 24, paddingVertical: 8 },
    flippableCardWrap: { width: WALLET_CARD_W, height: WALLET_CARD_H, marginRight: 12 },
    cardSide: { position: 'absolute', width: '100%', height: '100%' },
    flipShimmer: { position: 'absolute', width: '100%', height: '100%', borderRadius: 24, overflow: 'hidden', zIndex: 10 },

    // ── Card Face ──
    cardFace: {
        width: '100%', height: '100%', borderRadius: 24, padding: 20, overflow: 'hidden', position: 'relative',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: -6, height: 7 }, shadowOpacity: 0.3, shadowRadius: 15 },
            android: { elevation: 8, shadowColor: '#000' },
        }),
    },
    glassOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255, 255, 255, 0.12)', borderRadius: 24 },
    decoBlob1: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(205, 234, 45, 0.12)', top: -60, right: -40 },
    decoBlob2: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(205, 234, 45, 0.06)', bottom: -40, left: -30 },

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
    chipBase: { width: 36, height: 28, borderRadius: 5, backgroundColor: 'rgba(205, 234, 45, 0.35)', borderWidth: 1, borderColor: 'rgba(205, 234, 45, 0.2)', justifyContent: 'center', alignItems: 'center', position: 'relative', overflow: 'hidden' },
    chipLine1: { position: 'absolute', width: 36, height: 1, backgroundColor: 'rgba(255,255,255,0.2)', top: 10 },
    chipLine2: { position: 'absolute', width: 36, height: 1, backgroundColor: 'rgba(255,255,255,0.2)', top: 18 },
    chipCenter: { width: 12, height: 10, borderRadius: 2, backgroundColor: 'rgba(205, 234, 45, 0.2)' },
    cardNumberSection: { marginTop: 8 },
    cardNumberLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '500', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
    cardNumberText: { color: '#FFFFFF', fontSize: 20, fontWeight: '400', letterSpacing: 3 },
    frontBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    cardHolderName: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '300', letterSpacing: 1.5 },
    validityWrap: { alignItems: 'flex-end' },
    validityLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '300', marginBottom: 2 },
    validityValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '400' },

    // ── Back Card ──
    backContent: { flex: 1, padding: 18, justifyContent: 'space-between', zIndex: 1 },
    backHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    backLogoWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    backLogoCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(205,234,45,0.12)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(205,234,45,0.15)' },
    backBrandText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
    backMainRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    backBalanceWrap: { flex: 1 },
    backBalanceBorder: { borderLeftWidth: 2, borderLeftColor: 'rgba(205,234,45,0.4)', paddingLeft: 10, marginBottom: 8 },
    backBalanceLabel: { color: 'rgba(205,234,45,0.6)', fontSize: 9, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
    backBalanceAmount: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
    backAccountRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 10 },
    backAccountValue: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
    qrWrap: { alignItems: 'center' },
    qrInner: {
        padding: 5, borderRadius: 10, backgroundColor: '#FFFFFF',
        ...Platform.select({
            ios: { shadowColor: '#CDEA2D', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8 },
            android: { elevation: 4 },
        }),
    },
    qrLabel: { color: 'rgba(205,234,45,0.45)', fontSize: 7, fontWeight: '700', marginTop: 5, textTransform: 'uppercase', letterSpacing: 0.8 },
    backFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
    backFooterText: { color: 'rgba(205,234,45,0.35)', fontSize: 10, fontWeight: '500' },

    // ── Card Dots ──
    cardDots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 14 },
    cardDot: { height: 6, borderRadius: 3 },
    swipeHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
    swipeHintText: { fontSize: 11, fontWeight: '500' },

    // ── Quick Actions ──
    quickActionsSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        marginTop: 24,
        paddingVertical: 4,
    },
    quickActionBtn: { alignItems: 'center', width: 70 },
    quickActionCircle: {
        width: 52, height: 52, borderRadius: 26,
        justifyContent: 'center', alignItems: 'center', marginBottom: 8,
    },
    quickActionLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },

    // ── Main Features (4 cards ngang) ──
    mainFeaturesGrid: { flexDirection: 'row', justifyContent: 'space-between' },

    // ── Service List (grouped card) ──
    serviceListCard: {
        borderRadius: 20, paddingVertical: 4,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 },
            android: { elevation: 2 },
        }),
    },
    serviceListItem: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 14, paddingHorizontal: 16, gap: 14,
    },
    serviceListIcon: {
        width: 42, height: 42, borderRadius: 14,
        justifyContent: 'center', alignItems: 'center',
    },
    serviceListInfo: { flex: 1, gap: 2 },
    serviceListName: { fontSize: 15, fontWeight: '600' },
    serviceListDesc: { fontSize: 11, fontWeight: '400' },
});
