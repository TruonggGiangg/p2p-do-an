import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    Alert,
    Animated,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, CommonCard, FintechPullToRefresh } from '../../../components';
import { loanService, LoanProduct, LoanDocumentType, LoanProductConfig } from '../services/loan.service';

type RouteParams = { product: LoanProduct };
type LoanProductDetailNav = NativeStackNavigationProp<RootStackParamList, 'LoanProductDetail'>;

export default function LoanProductDetailScreen() {
    const { theme } = useTheme();
    const route = useRoute();
    const navigation = useNavigation<LoanProductDetailNav>();
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
            Alert.alert('Lỗi', 'Không thể tải danh sách tài liệu');
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
            <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
                <BinanceHeader showBack title="Chi tiết gói vay" />
                <View style={styles.centered}>
                    <Text style={{ color: theme.colors.textSecondary }}>Không có thông tin sản phẩm</Text>
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
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <BinanceHeader showBack title={product.name} />

            <FintechPullToRefresh
                onRefresh={onRefresh}
                refreshing={refreshing}
                contentContainerStyle={styles.scrollContent}
                primaryColor={theme.colors.primary}
                glowColor={theme.colors.primaryLight}
            >
                {/* Hero Card */}
                <View style={[styles.heroCard, { backgroundColor: theme.colors.surface }]}>
                    <View style={[styles.heroTopRow]}>
                        <View style={[styles.iconWrap, { backgroundColor: theme.colors.primary + '20' }]}>
                            <MaterialCommunityIcons name="currency-usd" size={30} color={theme.colors.primary} />
                        </View>
                        <View style={styles.heroTitleGroup}>
                            <Text style={[styles.heroProductName, { color: theme.colors.textPrimary }]}>{product.name}</Text>
                            <Text style={[styles.heroShortName, { color: theme.colors.textSecondary }]}>{product.shortName}</Text>
                        </View>
                        <View style={[styles.badgePromo, { backgroundColor: theme.colors.primary + '20' }]}>
                            <Text style={[styles.badgePromoText, { color: theme.colors.primary }]}>Ưu đãi</Text>
                        </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

                    {/* Rate Highlight */}
                    <View style={[styles.rateHighlight, { backgroundColor: theme.colors.primary + '10', borderColor: theme.colors.primary + '30' }]}>
                        <View style={styles.rateHighlightLeft}>
                            <MaterialCommunityIcons name="percent" size={18} color={theme.colors.primary} />
                            <Text style={[styles.rateLabel, { color: theme.colors.textDim }]}>Lãi suất</Text>
                        </View>
                        <View style={styles.rateHighlightRight}>
                            <Text style={[styles.rateMain, { color: theme.colors.primary }]}>
                                {+mainRate.toFixed(2)}% / {mainUnit}
                            </Text>
                            <Text style={[styles.rateAnnual, { color: theme.colors.textSecondary }]}>
                                ({subRate.toFixed(2)}% / {subUnit})
                            </Text>
                        </View>
                    </View>

                    <View style={[styles.row, { borderTopColor: theme.colors.border }]}>
                        <View style={styles.rowLeft}>
                            <MaterialCommunityIcons name="calculator-variant-outline" size={16} color={theme.colors.textDim} />
                            <Text style={[styles.label, { color: theme.colors.textDim }]}>Kiểu tính lãi</Text>
                        </View>
                        <Text style={[styles.value, { color: theme.colors.textPrimary }]}>{product.interestType?.value ?? '-'}</Text>
                    </View>

                    {/* Hạn mức từ LoanProduct */}
                    {(product.minPrincipal && product.maxPrincipal) && (
                        <View style={[styles.row, { borderTopColor: theme.colors.border }]}>
                            <View style={styles.rowLeft}>
                                <MaterialCommunityIcons name="cash-multiple" size={16} color={theme.colors.textDim} />
                                <Text style={[styles.label, { color: theme.colors.textDim }]}>Hạn mức</Text>
                            </View>
                            <Text style={[styles.value, { color: theme.colors.textPrimary }]}>
                                {((product.minPrincipal ?? 0) / 1e6).toFixed(0)}tr – {((product.maxPrincipal ?? 0) / 1e6).toFixed(0)}tr đ
                            </Text>
                        </View>
                    )}

                    {config && (
                        <>
                            {/* Lãi suất min/max từ Fineract config */}
                            {(config.minInterestRatePerPeriod != null && config.maxInterestRatePerPeriod != null) && (
                                <View style={[styles.row, { borderTopColor: theme.colors.border }]}>
                                    <View style={styles.rowLeft}>
                                        <MaterialCommunityIcons name="percent-outline" size={16} color={theme.colors.textDim} />
                                        <Text style={[styles.label, { color: theme.colors.textDim }]}>Lãi suất tùy chọn</Text>
                                    </View>
                                    <Text style={[styles.value, { color: theme.colors.textPrimary }]}>
                                        {+config.minInterestRatePerPeriod!.toFixed(2)}% – {+config.maxInterestRatePerPeriod!.toFixed(2)}%/{mainUnit}
                                    </Text>
                                </View>
                            )}
                            {(config.minNumberOfRepayments && config.maxNumberOfRepayments) ? (
                                <View style={[styles.row, { borderTopColor: theme.colors.border }]}>
                                    <View style={styles.rowLeft}>
                                        <MaterialCommunityIcons name="calendar-range" size={16} color={theme.colors.textDim} />
                                        <Text style={[styles.label, { color: theme.colors.textDim }]}>Kỳ hạn</Text>
                                    </View>
                                    <Text style={[styles.value, { color: theme.colors.textPrimary }]}>
                                        {config.minNumberOfRepayments} – {config.maxNumberOfRepayments} tháng
                                    </Text>
                                </View>
                            ) : null}
                        </>
                    )}
                </View>

                {/* Documents Section */}
                <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Tài liệu cần nộp</Text>

                {loading ? (
                    <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
                ) : documentTypes.length === 0 ? (
                    <View style={[styles.docEmptyCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                        <MaterialCommunityIcons name="check-circle-outline" size={32} color={theme.colors.primary} />
                        <Text style={[styles.docEmptyText, { color: theme.colors.textSecondary }]}>
                            Không yêu cầu tài liệu bổ sung
                        </Text>
                    </View>
                ) : (
                    <View style={styles.docList}>
                        {documentTypes
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map((doc) => (
                                <View key={doc.id} style={[styles.docCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                                    <View style={[styles.docIconWrap, { backgroundColor: theme.colors.primary + '15' }]}>
                                        <MaterialCommunityIcons name="file-document-outline" size={20} color={theme.colors.primary} />
                                    </View>
                                    <Text style={[styles.docName, { color: theme.colors.textPrimary }]}>{doc.name}</Text>
                                    {doc.required ? (
                                        <View style={[styles.badgeRequired, { backgroundColor: theme.colors.error }]}>
                                            <Text style={styles.badgeRequiredText}>Bắt buộc</Text>
                                        </View>
                                    ) : (
                                        <View style={[styles.badgeOptional, { backgroundColor: theme.colors.surfaceLight }]}>
                                            <Text style={[styles.badgeOptionalText, { color: theme.colors.textSecondary }]}>Tuỳ chọn</Text>
                                        </View>
                                    )}
                                </View>
                            ))}
                    </View>
                )}

                {/* CTA Button */}
                <Animated.View style={{ transform: [{ scale: btnScale }], marginTop: loading ? 24 : 16 }}>
                    <TouchableOpacity
                        style={[styles.btn, { backgroundColor: theme.colors.primary }]}
                        onPress={navigateToCreate}
                        onPressIn={handlePressIn}
                        onPressOut={handlePressOut}
                        activeOpacity={0.9}
                    >
                        <MaterialCommunityIcons name="arrow-right-circle-outline" size={22} color="#fff" />
                        <Text style={styles.btnText}>Bắt đầu vay</Text>
                    </TouchableOpacity>
                </Animated.View>

                <View style={{ height: 40 }} />
            </FintechPullToRefresh>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 24 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Hero card
    heroCard: {
        borderRadius: 16,
        padding: 18,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    heroTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    iconWrap: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    heroTitleGroup: { flex: 1, marginLeft: 14 },
    heroProductName: { fontSize: 18, fontWeight: '700' },
    heroShortName: { fontSize: 13, marginTop: 2 },
    badgePromo: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    badgePromoText: { fontSize: 12, fontWeight: '700' },
    divider: { height: 1, marginBottom: 14 },

    rateHighlight: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 14,
    },
    rateHighlightLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rateHighlightRight: { alignItems: 'flex-end' },
    rateLabel: { fontSize: 13 },
    rateMain: { fontSize: 18, fontWeight: '800' },
    rateAnnual: { fontSize: 12, marginTop: 2 },

    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 0.5 },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    label: { fontSize: 13 },
    value: { fontSize: 14, fontWeight: '600' },

    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
    loader: { marginVertical: 24 },

    docList: { gap: 10 },
    docCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        gap: 10,
    },
    docIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    docName: { flex: 1, fontSize: 14, fontWeight: '500' },
    badgeRequired: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    badgeRequiredText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    badgeOptional: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    badgeOptionalText: { fontSize: 11, fontWeight: '600' },

    docEmptyCard: {
        borderRadius: 14,
        borderWidth: 1,
        padding: 24,
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
    },
    docEmptyText: { fontSize: 14, textAlign: 'center' },

    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
        borderRadius: 14,
    },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
