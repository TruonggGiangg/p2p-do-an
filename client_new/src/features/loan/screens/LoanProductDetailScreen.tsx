import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, CommonCard } from '../../../components';
import { loanService, LoanProduct, LoanDocumentType } from '../services/loan.service';

type RouteParams = { product: LoanProduct };

export default function LoanProductDetailScreen() {
    const { theme } = useTheme();
    const route = useRoute();
    const { product } = (route.params || {}) as RouteParams;

    const [documentTypes, setDocumentTypes] = useState<LoanDocumentType[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!product?.id) return;
        let cancelled = false;
        (async () => {
            try {
                const list = await loanService.getDocumentTypesByProduct(product.id);
                if (!cancelled) setDocumentTypes(list);
            } catch (e) {
                if (!cancelled) Alert.alert('Lỗi', 'Không thể tải danh sách tài liệu');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [product?.id]);

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

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <BinanceHeader showBack title={product.name} />

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                <CommonCard style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconWrap, { backgroundColor: theme.colors.surfaceLight }]}>
                            <MaterialCommunityIcons name="currency-usd" size={28} color={theme.colors.primary} />
                        </View>
                        <View style={styles.headerText}>
                            <Text style={[styles.productName, { color: theme.colors.textPrimary }]}>{product.name}</Text>
                            <Text style={[styles.shortName, { color: theme.colors.textSecondary }]}>{product.shortName}</Text>
                        </View>
                    </View>
                    <View style={[styles.row, { borderTopColor: theme.colors.border }]}>
                        <Text style={[styles.label, { color: theme.colors.textDim }]}>Lãi suất</Text>
                        <Text style={[styles.value, { color: theme.colors.primary }]}>{product.interestRatePerPeriod}% / tháng</Text>
                    </View>
                    <View style={[styles.row, { borderTopColor: theme.colors.border }]}>
                        <Text style={[styles.label, { color: theme.colors.textDim }]}>Kiểu lãi</Text>
                        <Text style={[styles.value, { color: theme.colors.textPrimary }]}>{product.interestType?.value ?? '-'}</Text>
                    </View>
                </CommonCard>

                <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Tài liệu cần nộp</Text>
                {loading ? (
                    <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
                ) : documentTypes.length === 0 ? (
                    <CommonCard style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                        <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                            Gói vay này chưa yêu cầu loại tài liệu cụ thể. Bạn có thể tiến hành đăng ký.
                        </Text>
                        <TouchableOpacity
                            style={[styles.btn, { backgroundColor: theme.colors.primary }]}
                            onPress={() => Alert.alert('Thông báo', 'Chức năng nộp hồ sơ sẽ được bổ sung.')}
                        >
                            <Text style={styles.btnText}>Tiếp tục đăng ký vay</Text>
                        </TouchableOpacity>
                    </CommonCard>
                ) : (
                    <View style={styles.docList}>
                        {documentTypes
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map((doc, index) => (
                                <CommonCard key={doc.id} style={[styles.docCard, { backgroundColor: theme.colors.surface }]}>
                                    <View style={styles.docRow}>
                                        <MaterialCommunityIcons
                                            name="file-document-outline"
                                            size={22}
                                            color={theme.colors.primary}
                                        />
                                        <Text style={[styles.docName, { color: theme.colors.textPrimary }]}>{doc.name}</Text>
                                        {doc.required && (
                                            <View style={[styles.badge, { backgroundColor: theme.colors.error || '#e53935' }]}>
                                                <Text style={styles.badgeText}>Bắt buộc</Text>
                                            </View>
                                        )}
                                    </View>
                                </CommonCard>
                            ))}
                        <TouchableOpacity
                            style={[styles.btn, { backgroundColor: theme.colors.primary, marginTop: 16 }]}
                            onPress={() => Alert.alert('Thông báo', 'Chức năng upload tài liệu sẽ được bổ sung.')}
                        >
                            <Text style={styles.btnText}>Nộp hồ sơ</Text>
                        </TouchableOpacity>
                    </View>
                )}
                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 24 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    card: { padding: 16, marginBottom: 16 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    iconWrap: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    headerText: { marginLeft: 14, flex: 1 },
    productName: { fontSize: 18, fontWeight: '700' },
    shortName: { fontSize: 14, marginTop: 2 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 0.5 },
    label: { fontSize: 13 },
    value: { fontSize: 14, fontWeight: '600' },
    sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
    loader: { marginVertical: 24 },
    emptyText: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
    docList: { gap: 10 },
    docCard: { padding: 14 },
    docRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    docName: { flex: 1, fontSize: 15, fontWeight: '500' },
    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
    btn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
