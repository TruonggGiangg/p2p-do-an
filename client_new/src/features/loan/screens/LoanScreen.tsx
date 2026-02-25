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
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, CommonCard, FintechPullToRefresh, VentoUltimateLoading } from '../../../components';
import { loanService, LoanProduct } from '../services/loan.service';
import type { RootStackParamList } from '../../../navigation/RootNavigator';

type LoanScreenNav = NativeStackNavigationProp<RootStackParamList, 'LoanProductDetail'>;

export default function LoanScreen() {
    const { theme } = useTheme();
    const navigation = useNavigation<LoanScreenNav>();
    const [products, setProducts] = useState<LoanProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchProducts = async () => {
        const minDelay = new Promise(resolve => setTimeout(resolve, 300));
        try {
            const [data] = await Promise.all([
                loanService.getLoanProducts(),
                minDelay
            ]);
            setProducts(data);
        } catch (error) {
            console.error('Failed to fetch loan products:', error);
            Alert.alert('Lỗi', 'Không thể tải danh sách sản phẩm vay');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchProducts();
    }, []);

    useEffect(() => {
        fetchProducts();
    }, []);

    const renderProductItem = ({ item }: { item: LoanProduct }) => (
        <TouchableOpacity
            style={styles.productItem}
            onPress={() => navigation.navigate('LoanProductDetail', { product: item })}
            activeOpacity={0.9}
        >
            <CommonCard style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary + '18' }]}>
                        <MaterialCommunityIcons name="currency-usd" size={24} color={theme.colors.primary} />
                    </View>
                    <View style={styles.headerText}>
                        <Text style={[styles.productName, { color: theme.colors.textPrimary }]}>{item.name}</Text>
                        <Text style={[styles.productShortName, { color: theme.colors.textSecondary }]}>{item.shortName}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.textDim} />
                </View>

                <View style={[styles.cardFooter, { borderTopColor: theme.colors.border }]}>
                    <View style={styles.infoBlock}>
                        <Text style={[styles.infoLabel, { color: theme.colors.textDim }]}>Lãi suất</Text>
                        <Text style={[styles.infoValue, { color: theme.colors.primary }]}>
                            {item.interestRatePerPeriod}% / {item.interestRateFrequencyType?.value?.toLowerCase()?.includes('year') ? 'năm' : 'tháng'}
                        </Text>
                    </View>
                    <View style={styles.infoBlock}>
                        <Text style={[styles.infoLabel, { color: theme.colors.textDim }]}>Kiểu lãi</Text>
                        <Text style={[styles.infoValue, { color: theme.colors.textPrimary }]}>{item.interestType.value}</Text>
                    </View>
                </View>
            </CommonCard>
        </TouchableOpacity>
    );

    const navToHistory = () => (navigation as any).navigate('LoanHistory');

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
                    <View style={styles.headerRow}>
                        <View>
                            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Gói vay ưu đãi</Text>
                            <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>Chọn gói vay phù hợp với nhu cầu của bạn</Text>
                        </View>
                        <TouchableOpacity style={[styles.historyLink, { backgroundColor: theme.colors.primary + '15', borderColor: theme.colors.primary + '40' }]} onPress={navToHistory}>
                            <MaterialCommunityIcons name="history" size={18} color={theme.colors.primary} />
                            <Text style={[styles.historyLinkText, { color: theme.colors.primary }]}>Lịch sử</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {loading && !refreshing ? (
                    <View style={styles.loadingContainer}>
                        <VentoUltimateLoading size={200} />
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
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
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
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, paddingTop: 12 },
    infoBlock: { gap: 4 },
    infoLabel: { fontSize: 12 },
    infoValue: { fontSize: 14, fontWeight: '600' },
    emptyContainer: { marginTop: 80, alignItems: 'center', gap: 16 },
    emptyText: { fontSize: 16, textAlign: 'center' },
    historyLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
    historyLinkText: { fontSize: 13, fontWeight: '600' },
});
