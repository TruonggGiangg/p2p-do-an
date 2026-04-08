import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    Animated,
    StatusBar,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FintechPullToRefresh, BinanceHeader } from '../../../components';
import { loanService, LoanProduct, LoanDocumentType, LoanProductConfig } from '../services/loan.service';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/ThemeContext';
import { useConfirmModal } from '../../../components/common/ConfirmModal';

type RouteParams = { product: LoanProduct };
type LoanProductDetailNav = NativeStackNavigationProp<RootStackParamList, 'LoanProductDetail'>;

const formatMoney = (amount: number) => {
    return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

export default function LoanProductDetailScreen() {
    const { theme } = useTheme();
    const EMERALD_THEME = {
        ...theme.colors,
        surfaceHigh: theme.colors.surfaceBright,
        textDim: theme.mode === 'dark' ? theme.colors.textDim : theme.colors.textSecondary,
    };
    const styles = React.useMemo(() => getStyles(EMERALD_THEME), [EMERALD_THEME]);
    const modal = useConfirmModal();

    const route = useRoute();
    const navigation = useNavigation<LoanProductDetailNav>();
    const insets = useSafeAreaInsets();
    const { product } = (route.params || {}) as RouteParams;

    const [documentTypes, setDocumentTypes] = useState<LoanDocumentType[]>([]);
    const [config, setConfig] = useState<LoanProductConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const btnScale = new Animated.Value(1);

    const fetchData = useCallback(async () => {
        if (!product?.id) return;
        try {
            setLoading(true);
            const [list, cfg] = await Promise.all([
                loanService.getDocumentTypesByProduct(product.id),
                loanService.getProductConfig(product.id).catch(() => null),
            ]);
            setDocumentTypes(list);
            setConfig(cfg ?? null);
        } catch (e) {
            modal.error('Lỗi', 'Không thể tải danh sách tài liệu');
        } finally {
            setLoading(false);
        }
    }, [product?.id]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handlePressIn = () => {
        Animated.spring(btnScale, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
    };
    const handlePressOut = () => {
        Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 50 }).start();
    };

    const navigateToCreate = () => {
        navigation.navigate('LoanCreate', { product, willing: product.name || product.shortName });
    };

    const isAnnual = product.interestRateFrequencyType?.value?.toLowerCase()?.includes('year');
    const monthlyRate = config?.monthlyRate ?? (isAnnual ? (product.interestRatePerPeriod ?? 0) / 12 : (product.interestRatePerPeriod ?? 0));
    const annualRate = config?.annualRate ?? (isAnnual ? (product.interestRatePerPeriod ?? 0) : (product.interestRatePerPeriod ?? 0) * 12);
    const mainRate = product.interestRatePerPeriod ?? 0;
    const mainUnit = isAnnual ? 'năm' : 'tháng';
    const subRate = isAnnual ? monthlyRate : annualRate;
    const subUnit = isAnnual ? 'tháng' : 'năm';

    if (!product) {
        return (
            <View style={[styles.container, { backgroundColor: EMERALD_THEME.background }]}>
                <BinanceHeader title="Chi tiết gói vay" mode="standard" />
                <View style={styles.centered}>
                    <Text style={{ color: EMERALD_THEME.textSecondary }}>Không có thông tin sản phẩm</Text>
                </View>
            </View>
        );
    }

    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchData();
        setRefreshing(false);
    }, [fetchData]);

    return (
        <View style={[styles.container, { backgroundColor: EMERALD_THEME.background }]}>
            <StatusBar barStyle={theme.mode === 'dark' ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />

            <BinanceHeader
                title={product.name}
                mode="standard"
                rightComponents={
                    <TouchableOpacity style={styles.moreButton}>
                        <MaterialCommunityIcons name="dots-horizontal" size={24} color={EMERALD_THEME.textPrimary} />
                    </TouchableOpacity>
                }
            />

            <FintechPullToRefresh
                onRefresh={onRefresh}
                refreshing={refreshing}
                contentContainerStyle={styles.scrollContent}
                primaryColor={EMERALD_THEME.primary}
                glowColor={EMERALD_THEME.primary + '30'}
            >
                {/* Luminous Hero Card */}
                <View style={styles.heroCard}>
                    <View style={styles.heroTopRow}>
                        <View style={styles.heroIconBox}>
                            <MaterialCommunityIcons name="currency-usd" size={26} color={EMERALD_THEME.background} />
                        </View>
                        <View style={styles.heroTitleGroup}>
                            <Text style={styles.heroProductName}>{product.name}</Text>
                            <Text style={styles.heroShortName}>{product.shortName}</Text>
                        </View>
                        <View style={styles.badgePromo}>
                            <Text style={styles.badgePromoText}>Ưu đãi</Text>
                        </View>
                    </View>

                    <View style={styles.heroRateContainer}>
                        <Text style={styles.heroRateMain}>{+mainRate.toFixed(2)}%<Text style={styles.heroRateUnit}> / {mainUnit}</Text></Text>
                        <Text style={styles.heroRateSub}>Tương đương {subRate.toFixed(2)}% / {subUnit}</Text>
                    </View>

                    <View style={styles.heroDivider} />

                    {/* Data List (No-Line Rule: Just Spacing) */}
                    <View style={styles.dataRow}>
                        <View style={styles.dataRowLeft}>
                            <MaterialCommunityIcons name="calculator-variant-outline" size={18} color={EMERALD_THEME.textDim} />
                            <Text style={styles.dataLabel}>Kiểu tính lãi</Text>
                        </View>
                        <Text style={styles.dataValue}>{product.interestType?.value ?? '-'}</Text>
                    </View>

                    {(product.minPrincipal && product.maxPrincipal) && (
                        <View style={styles.dataRow}>
                            <View style={styles.dataRowLeft}>
                                <MaterialCommunityIcons name="cash-multiple" size={18} color={EMERALD_THEME.textDim} />
                                <Text style={styles.dataLabel}>Hạn mức</Text>
                            </View>
                            <Text style={styles.dataValue}>
                                {((product.minPrincipal ?? 0) / 1e6).toFixed(0)}tr – {((product.maxPrincipal ?? 0) / 1e6).toFixed(0)}tr đ
                            </Text>
                        </View>
                    )}

                    {config && (
                        <>
                            {(config.minInterestRatePerPeriod != null && config.maxInterestRatePerPeriod != null) && (
                                <View style={styles.dataRow}>
                                    <View style={styles.dataRowLeft}>
                                        <MaterialCommunityIcons name="percent-outline" size={18} color={EMERALD_THEME.textDim} />
                                        <Text style={styles.dataLabel}>Lãi suất tùy chọn</Text>
                                    </View>
                                    <Text style={styles.dataValue}>
                                        {+config.minInterestRatePerPeriod!.toFixed(2)}% – {+config.maxInterestRatePerPeriod!.toFixed(2)}%
                                    </Text>
                                </View>
                            )}
                            {(config.minNumberOfRepayments && config.maxNumberOfRepayments) ? (
                                <View style={styles.dataRow}>
                                    <View style={styles.dataRowLeft}>
                                        <MaterialCommunityIcons name="calendar-range" size={18} color={EMERALD_THEME.textDim} />
                                        <Text style={styles.dataLabel}>Kỳ hạn</Text>
                                    </View>
                                    <Text style={styles.dataValue}>
                                        {config.minNumberOfRepayments} – {config.maxNumberOfRepayments} tháng
                                    </Text>
                                </View>
                            ) : null}
                        </>
                    )}
                </View>

                {/* Documents Section */}
                <Text style={styles.sectionTitle}>TÀI LIỆU CẦN NỘP</Text>

                {loading ? (
                    <ActivityIndicator color={EMERALD_THEME.primary} style={styles.loader} />
                ) : documentTypes.length === 0 ? (
                    <View style={styles.docEmptyCard}>
                        <MaterialCommunityIcons name="check-circle-outline" size={28} color={EMERALD_THEME.primary} />
                        <Text style={styles.docEmptyText}>Không yêu cầu tài liệu bổ sung</Text>
                    </View>
                ) : (
                    <View style={styles.docList}>
                        {documentTypes
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map((doc) => (
                                <View key={doc.id} style={styles.docCard}>
                                    <View style={styles.docIconWrap}>
                                        <MaterialCommunityIcons name="file-document-outline" size={20} color={EMERALD_THEME.primary} />
                                    </View>
                                    <Text style={styles.docName}>{doc.name}</Text>
                                    {doc.required ? (
                                        <View style={styles.badgeRequired}>
                                            <Text style={styles.badgeRequiredText}>Bắt buộc</Text>
                                        </View>
                                    ) : (
                                        <View style={styles.badgeOptional}>
                                            <Text style={styles.badgeOptionalText}>Tuỳ chọn</Text>
                                        </View>
                                    )}
                                </View>
                            ))}
                    </View>
                )}

                <View style={{ height: 40 }} />

                {/* Footer Form Action */}
                <Animated.View style={[styles.footer, { transform: [{ scale: btnScale }] }]}>
                    <TouchableOpacity
                        style={styles.btn}
                        onPress={navigateToCreate}
                        onPressIn={handlePressIn}
                        onPressOut={handlePressOut}
                        activeOpacity={0.9}
                    >
                        <Text style={styles.btnText}>Bắt đầu vay</Text>
                        <MaterialCommunityIcons name="arrow-right" size={20} color={EMERALD_THEME.onPrimary} style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                </Animated.View>
            </FintechPullToRefresh>
        </View>
    );
}

const getStyles = (EMERALD_THEME: any) => StyleSheet.create({
    container: { flex: 1 },
    moreButton: { padding: 4, marginRight: -4 },

    scrollContent: { padding: 20, paddingTop: 12 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Hero Card - Nocturnal Luminary Style
    heroCard: {
        backgroundColor: EMERALD_THEME.surface,
        borderRadius: 24,
        padding: 24,
        marginBottom: 32,
    },
    heroTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    heroIconBox: {
        width: 48, height: 48,
        borderRadius: 16,
        backgroundColor: EMERALD_THEME.primary,
        justifyContent: 'center', alignItems: 'center',
    },
    heroTitleGroup: { flex: 1, marginLeft: 16 },
    heroProductName: { fontSize: 18, fontWeight: '700', color: EMERALD_THEME.textPrimary },
    heroShortName: { fontSize: 13, color: EMERALD_THEME.textSecondary, marginTop: 4 },
    badgePromo: {
        backgroundColor: EMERALD_THEME.surfaceHigh,
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 20,
    },
    badgePromoText: { fontSize: 12, fontWeight: '700', color: EMERALD_THEME.textPrimary },

    heroRateContainer: {
        backgroundColor: EMERALD_THEME.background,
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        marginBottom: 24,
    },
    heroRateMain: { fontSize: 32, fontWeight: '700', color: EMERALD_THEME.primary, letterSpacing: -0.5 },
    heroRateUnit: { fontSize: 16, fontWeight: '600', color: EMERALD_THEME.textSecondary },
    heroRateSub: { fontSize: 13, color: EMERALD_THEME.textDim, marginTop: 4 },
    heroDivider: { height: 1, backgroundColor: EMERALD_THEME.border, marginBottom: 20 },

    dataRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    dataRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dataLabel: { fontSize: 14, color: EMERALD_THEME.textSecondary },
    dataValue: { fontSize: 14, fontWeight: '700', color: EMERALD_THEME.textPrimary },

    sectionTitle: { fontSize: 12, fontWeight: '700', color: EMERALD_THEME.textDim, marginBottom: 16, letterSpacing: 1 },
    loader: { marginVertical: 24 },

    docList: { gap: 12 },
    docCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        backgroundColor: EMERALD_THEME.surface,
    },
    docIconWrap: {
        width: 40, height: 40,
        borderRadius: 12,
        backgroundColor: EMERALD_THEME.surfaceHigh,
        justifyContent: 'center', alignItems: 'center',
        marginRight: 14,
    },
    docName: { flex: 1, fontSize: 15, fontWeight: '600', color: EMERALD_THEME.textPrimary },
    badgeRequired: { backgroundColor: '#93000a', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    badgeRequiredText: { color: '#ffb4ab', fontSize: 11, fontWeight: '700' },
    badgeOptional: { backgroundColor: EMERALD_THEME.surfaceHigh, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    badgeOptionalText: { color: EMERALD_THEME.textSecondary, fontSize: 11, fontWeight: '600' },

    docEmptyCard: {
        flexDirection: 'row',
        backgroundColor: EMERALD_THEME.surface,
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    docEmptyText: { fontSize: 14, color: EMERALD_THEME.textSecondary, fontWeight: '500' },

    footer: {
        width: '100%',
        paddingVertical: 16,
    },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: EMERALD_THEME.primary,
        paddingVertical: 18,
        borderRadius: 100, // Pill shape
        shadowColor: EMERALD_THEME.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    btnText: { color: EMERALD_THEME.onPrimary, fontSize: 16, fontWeight: '700' },
});
