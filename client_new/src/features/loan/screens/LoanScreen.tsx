import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../contexts/ThemeContext';
import { useConfirmModal } from '../../../components/common/ConfirmModal';
import { BinanceHeader, CommonCard, FintechPullToRefresh, FintechScreenSkeleton } from '../../../components';
import { loanService, LoanProduct } from '../services/loan.service';
import {
    formatMoney,
    formatDateShort
} from '../utils/loanUtils';
import type { RootStackParamList } from '../../../navigation/RootNavigator';

type LoanScreenNav = NativeStackNavigationProp<RootStackParamList, 'LoanProductDetail'>;

const PRODUCT_ICONS: Record<string, string> = {
    'P': 'account-cash-outline',
    'default': 'cash-multiple',
};

export default function LoanScreen() {
    const { theme } = useTheme();
    const navigation = useNavigation<LoanScreenNav>();
    const c = theme.colors;
    const isDark = theme.mode === 'dark';
    const modal = useConfirmModal();
    const [products, setProducts] = useState<LoanProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        const minDelay = new Promise(resolve => setTimeout(resolve, 1400));
        try {
            const [productRes] = await Promise.all([
                loanService.getLoanProducts(),
                minDelay,
            ]);

            setProducts(productRes);
        } catch (error) {
            console.error('Failed to fetch loan data:', error);
            modal.error('Lỗi', 'Không thể tải danh sách sản phẩm vay');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [modal]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchData();
    }, [fetchData]);

    useFocusEffect(
        useCallback(() => {
            fetchData();
        }, [fetchData]),
    );

    const navToHistory = () => (navigation as any).navigate('LoanHistory');

    const getProductIcon = (shortName?: string) => {
        if (shortName && PRODUCT_ICONS[shortName.charAt(0)]) return PRODUCT_ICONS[shortName.charAt(0)];
        return PRODUCT_ICONS['default'];
    };

    // ── Product Card ──
    const renderProductItem = ({ item, index }: { item: LoanProduct; index: number }) => {
        const gradColors: [string, string] = index % 2 === 0
            ? (isDark ? ['#14342B', '#1A3B34'] : ['#14342B', '#1E4D3F'])
            : (isDark ? ['#1A3028', '#245649'] : ['#1A3B34', '#245649']);

        return (
            <TouchableOpacity
                style={styles.productItem}
                onPress={() => navigation.navigate('LoanProductDetail', { product: item })}
                activeOpacity={0.85}
            >
                <LinearGradient colors={gradColors} style={styles.productCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    {/* Decorative blob */}
                    <View style={styles.productBlob} />

                    <View style={styles.productTop}>
                        <View style={styles.productIconWrap}>
                            <MaterialCommunityIcons name={getProductIcon(item.shortName) as any} size={22} color="#CDEA2D" />
                        </View>
                        <View style={styles.productInfo}>
                            <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
                            <Text style={styles.productShortName}>{item.shortName}</Text>
                        </View>
                        <View style={styles.productArrow}>
                            <MaterialCommunityIcons name="arrow-right" size={18} color="rgba(255,255,255,0.6)" />
                        </View>
                    </View>

                    <View style={styles.productDivider} />

                    <View style={styles.productBottom}>
                        <View style={styles.productStat}>
                            <Text style={styles.productStatLabel}>Lãi suất</Text>
                            <Text style={styles.productStatValue}>
                                {item.interestRatePerPeriod}%
                                <Text style={styles.productStatUnit}>
                                    /{item.interestRateFrequencyType?.value?.toLowerCase()?.includes('year') ? 'năm' : 'tháng'}
                                </Text>
                            </Text>
                        </View>
                        <View style={[styles.productStatDivider, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
                        <View style={styles.productStat}>
                            <Text style={styles.productStatLabel}>Kiểu lãi</Text>
                            <Text style={styles.productStatValue} numberOfLines={1}>{item.interestType.value}</Text>
                        </View>
                    </View>
                </LinearGradient>
            </TouchableOpacity>
        );
    };

    // ── Product Card ──

    return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
            <BinanceHeader mode="dashboard" title="Vay vốn" />

            <FintechPullToRefresh
                onRefresh={onRefresh}
                refreshing={refreshing}
                contentContainerStyle={styles.scrollContent}
                primaryColor={c.primary}
                glowColor={c.primaryLight}
            >
                {/* ═══ LOAN HISTORY BTN ═══ */}
                <View style={styles.historySection}>
                    <TouchableOpacity
                        style={[
                            styles.historyBtnTop,
                            {
                                backgroundColor: isDark ? c.surfaceLight : c.backgroundSecondary,
                                borderWidth: 1,
                                borderColor: isDark ? c.border : '#DEE5E8',
                            },
                        ]}
                        activeOpacity={0.7}
                        onPress={navToHistory}
                    >
                        <View style={[styles.historyIconWrap, { backgroundColor: c.primaryGlass }]}>
                            <MaterialCommunityIcons name="history" size={20} color={c.primary} />
                        </View>
                        <View style={styles.historyTextWrap}>
                            <Text style={[styles.historyBtnText, { color: c.textPrimary }]}>Lịch sử khoản vay</Text>
                            <Text style={[styles.historyBtnSubText, { color: c.textSecondary }]}>Theo dõi trạng thái và thanh toán</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    </TouchableOpacity>
                </View>
                {/* ═══ HEADER ═══ */}
                <View style={styles.headerSection}>
                    <View style={styles.headerRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Gói vay ưu đãi</Text>
                            <Text style={[styles.sectionSubtitle, { color: c.textSecondary }]}>Chọn gói vay phù hợp với nhu cầu của bạn</Text>
                        </View>
                    </View>
                </View>

                {/* ═══ PRODUCTS ═══ */}
                {loading && !refreshing ? (
                    <View style={styles.loadingContainer}>
                        <FintechScreenSkeleton variant="loan" />
                    </View>
                ) : (
                    <FlatList
                        data={products}
                        renderItem={renderProductItem}
                        keyExtractor={(item) => item.id.toString()}
                        scrollEnabled={false}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <View style={[styles.emptyIcon, { backgroundColor: c.textDim + '15' }]}>
                                    <MaterialCommunityIcons name="briefcase-off-outline" size={40} color={c.textDim} />
                                </View>
                                <Text style={[styles.emptyText, { color: c.textSecondary }]}>Hiện chưa có gói vay nào khả dụng</Text>
                            </View>
                        }
                    />
                )}





                <View style={{ height: 40 }} />
            </FintechPullToRefresh>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 100 },

    // ── History Link ──
    historySection: { marginTop: 16 },
    historyBtnTop: {
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 16,
    },
    historyIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center', alignItems: 'center',
    },
    historyTextWrap: {
        flex: 1,
        marginLeft: 10,
        marginRight: 8,
    },
    historyBtnText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    historyBtnSubText: {
        marginTop: 1,
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },

    // ── Header ──
    headerSection: { marginTop: 32, marginBottom: 20 }, headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    sectionTitle: { fontSize: 22, fontFamily: 'Poppins_700Bold', marginBottom: 4 },
    sectionSubtitle: { fontSize: 13, fontFamily: 'Poppins_400Regular', lineHeight: 18 },
    loadingContainer: { marginTop: 28 },

    // ── Product Card ──
    productItem: { marginBottom: 14 },
    productCard: {
        borderRadius: 20, padding: 20, overflow: 'hidden', position: 'relative',
    },
    productBlob: {
        position: 'absolute', width: 140, height: 140, borderRadius: 70,
        backgroundColor: 'rgba(205, 234, 45, 0.06)', top: -40, right: -30,
    },
    productTop: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
    productIconWrap: {
        width: 46, height: 46, borderRadius: 14,
        backgroundColor: 'rgba(205, 234, 45, 0.15)',
        justifyContent: 'center', alignItems: 'center',
    },
    productInfo: { flex: 1, marginLeft: 14 },
    productName: {
        fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#FFFFFF', marginBottom: 2,
    },
    productShortName: {
        fontSize: 12, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.5)',
    },
    productArrow: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.08)',
        justifyContent: 'center', alignItems: 'center',
    },
    productDivider: {
        height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 16,
    },
    productBottom: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
    productStat: { flex: 1 },
    productStatLabel: {
        fontSize: 11, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.45)', marginBottom: 4,
    },
    productStatValue: {
        fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#CDEA2D',
    },
    productStatUnit: {
        fontSize: 12, fontFamily: 'Poppins_400Regular', color: 'rgba(205,234,45,0.7)',
    },
    productStatDivider: { width: 1, height: 30, marginHorizontal: 16 },

    // ── Empty ──
    emptyContainer: { marginTop: 60, alignItems: 'center', gap: 16 },
    emptyIcon: {
        width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center',
    },
    emptyText: { fontSize: 15, textAlign: 'center', fontFamily: 'Poppins_500Medium' },

});
