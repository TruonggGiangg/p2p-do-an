import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, CommonCard, FintechPullToRefresh } from '../../../components';
import { loanService, LoanProduct } from '../services/loan.service';
import { formatCurrency } from '../../../shared/utils';

export default function LoanScreen() {
    const { theme } = useTheme();
    const [products, setProducts] = useState<LoanProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const insets = useSafeAreaInsets();

    const fetchProducts = async () => {
        try {
            const data = await loanService.getLoanProducts();
            setProducts(data);
        } catch (error) {
            console.error('Failed to fetch loan products:', error);
            Alert.alert('Lỗi', 'Không thể tải danh sách sản phẩm vay');
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await fetchProducts();
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchProducts();
    }, []);

    const renderProductItem = ({ item }: { item: LoanProduct }) => (
        <TouchableOpacity
            style={styles.productItem}
            onPress={() => Alert.alert('Thông báo', `Bạn chọn sản phẩm: ${item.name}`)}
        >
            <CommonCard style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={[styles.iconContainer, { backgroundColor: theme.colors.surfaceLight }]}>
                        <MaterialCommunityIcons name="currency-usd" size={24} color={theme.colors.primary} />
                    </View>
                    <View style={styles.headerText}>
                        <Text style={[styles.productName, { color: theme.colors.textPrimary }]}>{item.name}</Text>
                        <Text style={[styles.productShortName, { color: theme.colors.textSecondary }]}>{item.shortName}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.textDim} />
                </View>

                <View style={styles.cardFooter}>
                    <View style={styles.infoBlock}>
                        <Text style={[styles.infoLabel, { color: theme.colors.textDim }]}>Lãi suất</Text>
                        <Text style={[styles.infoValue, { color: theme.colors.primary }]}>{item.interestRatePerPeriod}% / tháng</Text>
                    </View>
                    <View style={styles.infoBlock}>
                        <Text style={[styles.infoLabel, { color: theme.colors.textDim }]}>Kiểu lãi</Text>
                        <Text style={[styles.infoValue, { color: theme.colors.textPrimary }]}>{item.interestType.value}</Text>
                    </View>
                </View>
            </CommonCard>
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <BinanceHeader mode="dashboard" title="Vay vốn" />

            <FintechPullToRefresh
                onRefresh={onRefresh}
                refreshing={refreshing}
                contentContainerStyle={styles.scrollContent}
                primaryColor={theme.colors.primary}
                glowColor={theme.colors.primaryLight}
            >
                <View style={styles.headerSection}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Gói vay ưu đãi</Text>
                    <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>Chọn gói vay phù hợp với nhu cầu của bạn</Text>
                </View>

                {loading && !refreshing ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator color={theme.colors.primary} size="large" />
                    </View>
                ) : (
                    <FlatList
                        data={products}
                        renderItem={renderProductItem}
                        keyExtractor={(item) => item.id.toString()}
                        scrollEnabled={false}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <MaterialCommunityIcons name="briefcase-off-outline" size={64} color={theme.colors.textDim} />
                                <Text style={[styles.emptyText, { color: theme.colors.textDim }]}>Hiện chưa có gói vay nào khả dụng</Text>
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
    scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
    headerSection: { marginTop: 20, marginBottom: 16 },
    sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
    sectionSubtitle: { fontSize: 14 },
    loadingContainer: { marginTop: 100, alignItems: 'center' },
    productItem: { marginBottom: 16 },
    card: { padding: 16 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    iconContainer: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerText: { flex: 1, marginLeft: 12 },
    productName: { fontSize: 16, fontWeight: '600' },
    productShortName: { fontSize: 13, marginTop: 2 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#333', paddingTop: 12 },
    infoBlock: { gap: 4 },
    infoLabel: { fontSize: 12 },
    infoValue: { fontSize: 14, fontWeight: '600' },
    emptyContainer: { marginTop: 80, alignItems: 'center', gap: 16 },
    emptyText: { fontSize: 16, textAlign: 'center' },
});
