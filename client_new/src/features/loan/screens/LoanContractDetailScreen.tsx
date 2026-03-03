/**
 * LoanContractDetailScreen.tsx - Chi tiết hợp đồng vay
 * Hiển thị HTML hợp đồng bằng WebView (dạng PDF) + nút ký xác nhận
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader } from '../../../components';
import {
    loanService,
    LoanContract,
    LoanContractStatus,
} from '../services/loan.service';
import SmartCASigningModal from '../components/SmartCASigningModal';
import type { RootStackParamList } from '../../../navigation/RootNavigator';

const { width, height } = Dimensions.get('window');

// --- Helpers ---
const formatMoney = (amount?: number | null) => {
    if (amount == null || isNaN(amount)) return '0';
    return Math.round(amount).toLocaleString('vi-VN');
};

const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
};

const getStatusConfig = (status: LoanContractStatus) => {
    switch (status) {
        case 'pending_signature':
            return { text: 'Chờ ký', color: '#F59E0B', bg: '#F59E0B15' };
        case 'signed':
            return { text: 'Đã ký', color: '#3B82F6', bg: '#3B82F615' };
        case 'active':
            return { text: 'Đang hiệu lực', color: '#10B981', bg: '#10B98115' };
        case 'completed':
            return { text: 'Hoàn tất', color: '#6B7280', bg: '#6B728015' };
        case 'cancelled':
            return { text: 'Đã hủy', color: '#EF4444', bg: '#EF444415' };
        default:
            return { text: status, color: '#6B7280', bg: '#6B728015' };
    }
};

export default function LoanContractDetailScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const route = useRoute<any>();
    const { theme } = useTheme();
    const colors = theme.colors;
    const insets = useSafeAreaInsets();

    const contractIdParam: string = route.params?.contractId;
    const loanIdParam: string | undefined = route.params?.loanId;

    const [contract, setContract] = useState<LoanContract | null>(null);
    const [contractHTML, setContractHTML] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [signing, setSigning] = useState(false);
    const [showContract, setShowContract] = useState(false);
    const [showSignConfirm, setShowSignConfirm] = useState(false);
    const [showSmartCA, setShowSmartCA] = useState(false);

    // Success animation
    const successAnim = useRef(new Animated.Value(0)).current;

    const fetchContract = useCallback(async () => {
        try {
            setLoading(true);
            let c: LoanContract | null = null;
            if (contractIdParam) {
                c = await loanService.getContractById(contractIdParam);
            } else if (loanIdParam) {
                c = await loanService.getContractByLoanId(loanIdParam);
            }
            setContract(c);

            // Also fetch HTML
            if (c) {
                try {
                    const html = await loanService.getContractHTML(c.contractId || c._id);
                    setContractHTML(html);
                } catch {
                    console.warn('[ContractDetail] Cannot load HTML');
                }
            }
        } catch (err) {
            console.error('[ContractDetail] Error:', err);
            Alert.alert('Lỗi', 'Không thể tải hợp đồng');
        } finally {
            setLoading(false);
        }
    }, [contractIdParam, loanIdParam]);

    useEffect(() => {
        fetchContract();
    }, [fetchContract]);

    // Sign handler — mở SmartCA Signing Modal
    const handleSign = () => {
        if (!contract) return;
        setShowSignConfirm(false);
        setShowSmartCA(true);
    };

    // Legacy sign handler (fallback khi SmartCA không dùng được)
    const handleSignLegacy = async () => {
        if (!contract) return;
        setShowSignConfirm(false);
        setSigning(true);
        try {
            const updated = await loanService.signContract(contract.contractId || contract._id);
            setContract(updated);

            Animated.spring(successAnim, {
                toValue: 1,
                useNativeDriver: true,
                friction: 6,
            }).start();

            Alert.alert(
                'Thành công',
                'Bạn đã ký xác nhận hợp đồng vay thành công!',
                [{ text: 'OK' }],
            );
        } catch (err: any) {
            Alert.alert('Lỗi', err?.response?.data?.message || err?.message || 'Không thể ký hợp đồng');
        } finally {
            setSigning(false);
        }
    };

    // SmartCA signing complete callback
    const handleSmartCAComplete = (status: 'signed' | 'failed' | 'rejected') => {
        setShowSmartCA(false);
        if (status === 'signed') {
            fetchContract(); // Reload contract to get updated status
            Alert.alert(
                'Ký số thành công',
                'Hợp đồng đã được ký số bằng chứng thư VNPT SmartCA. Khoản vay sẽ được giải ngân sớm.',
                [{ text: 'OK' }],
            );
        } else if (status === 'rejected') {
            Alert.alert('Từ chối ký', 'Bạn đã từ chối ký hợp đồng. Bạn có thể ký lại bất kỳ lúc nào.');
        }
        // 'failed' — Error already shown in modal
    };

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <BinanceHeader title="Chi tiết hợp đồng" mode="standard" />
                <View style={styles.loader}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </View>
        );
    }

    if (!contract) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <BinanceHeader title="Chi tiết hợp đồng" mode="standard" />
                <View style={styles.emptyContainer}>
                    <MaterialCommunityIcons name="file-document-remove-outline" size={64} color={colors.textDim} />
                    <Text style={[styles.emptyText, { color: colors.textDim }]}>
                        Không tìm thấy hợp đồng
                    </Text>
                </View>
            </View>
        );
    }

    const statusCfg = getStatusConfig(contract.status);
    const isPending = contract.status === 'pending_signature';

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <BinanceHeader title="Chi tiết hợp đồng" mode="standard" />

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: isPending ? 100 : 32 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* Contract Header Card */}
                <View style={[styles.headerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.headerTop}>
                        <MaterialCommunityIcons name="file-document-check-outline" size={28} color={colors.primary} />
                        <View style={styles.headerInfo}>
                            <Text style={[styles.contractIdText, { color: colors.textPrimary }]}>
                                {contract.contractId}
                            </Text>
                            <Text style={[styles.productNameText, { color: colors.textSecondary }]}>
                                {contract.productName || 'Hợp đồng vay tiêu dùng'}
                            </Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                            <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.text}</Text>
                        </View>
                    </View>

                    {/* Borrower Info */}
                    <View style={[styles.section, { borderTopColor: colors.border }]}>
                        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                            <Ionicons name="person" size={14} /> Thông tin người vay
                        </Text>
                        <InfoRow label="Họ tên" value={contract.borrowerInfo?.fullName} colors={colors} />
                        <InfoRow label="CCCD/CMND" value={contract.borrowerInfo?.idNumber} colors={colors} />
                        {contract.borrowerInfo?.phone && (
                            <InfoRow label="Số điện thoại" value={contract.borrowerInfo.phone} colors={colors} />
                        )}
                        {contract.borrowerInfo?.address && (
                            <InfoRow label="Địa chỉ" value={contract.borrowerInfo.address} colors={colors} />
                        )}
                    </View>
                </View>

                {/* Loan Details Card */}
                <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 12 }]}>
                        <MaterialCommunityIcons name="cash-multiple" size={14} /> Chi tiết khoản vay
                    </Text>

                    <View style={[styles.amountBox, { backgroundColor: colors.primary + '10' }]}>
                        <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Số tiền vay</Text>
                        <Text style={[styles.amountValue, { color: colors.primary }]}>
                            {formatMoney(contract.principalAmount)} đ
                        </Text>
                    </View>

                    <View style={styles.detailGrid}>
                        <DetailItem label="Lãi suất" value={`${contract.interestRate}%/tháng`} colors={colors} />
                        <DetailItem label="Kỳ hạn" value={`${contract.tenure} tháng`} colors={colors} />
                        <DetailItem label="Trả hàng tháng" value={`${formatMoney(contract.monthlyPayment)} đ`} colors={colors} />
                        <DetailItem label="Tổng phải trả" value={`${formatMoney(contract.totalPayable)} đ`} colors={colors} />
                    </View>

                    {contract.disbursementDate && (
                        <InfoRow label="Ngày giải ngân" value={formatDate(contract.disbursementDate)} colors={colors} />
                    )}
                    {contract.signedAt && (
                        <InfoRow label="Ngày ký" value={formatDate(contract.signedAt)} colors={colors} />
                    )}
                    {contract.legalApprovalAt && (
                        <InfoRow label="Ngày phê duyệt" value={formatDate(contract.legalApprovalAt)} colors={colors} />
                    )}
                </View>

                {/* Fee Structure */}
                {contract.feeStructure && contract.feeStructure.length > 0 && (
                    <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 12 }]}>
                            <MaterialCommunityIcons name="receipt" size={14} /> Phí dịch vụ
                        </Text>
                        {contract.feeStructure.map((fee, i) => (
                            <InfoRow
                                key={i}
                                label={fee.name}
                                value={`${formatMoney(fee.amount)} đ`}
                                colors={colors}
                            />
                        ))}
                    </View>
                )}

                {/* Schedule Summary */}
                {contract.repaymentSchedule && contract.repaymentSchedule.length > 0 && (
                    <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 12 }]}>
                            <MaterialCommunityIcons name="calendar-clock" size={14} /> Lịch trả nợ ({contract.repaymentSchedule.length} kỳ)
                        </Text>

                        {/* Table header */}
                        <View style={[styles.scheduleRow, styles.scheduleHeader, { backgroundColor: colors.primary + '10' }]}>
                            <Text style={[styles.scheduleCell, styles.scheduleCellSm, { color: colors.textPrimary, fontWeight: '700' }]}>Kỳ</Text>
                            <Text style={[styles.scheduleCell, { color: colors.textPrimary, fontWeight: '700' }]}>Ngày</Text>
                            <Text style={[styles.scheduleCell, { color: colors.textPrimary, fontWeight: '700', textAlign: 'right' }]}>Tổng trả</Text>
                        </View>

                        {contract.repaymentSchedule.slice(0, 6).map((item, i) => (
                            <View
                                key={i}
                                style={[
                                    styles.scheduleRow,
                                    { borderBottomColor: colors.border },
                                    i % 2 === 0 && { backgroundColor: colors.surface },
                                ]}
                            >
                                <Text style={[styles.scheduleCell, styles.scheduleCellSm, { color: colors.textPrimary }]}>
                                    {item.period}
                                </Text>
                                <Text style={[styles.scheduleCell, { color: colors.textSecondary }]}>
                                    {formatDate(item.dueDate)}
                                </Text>
                                <Text style={[styles.scheduleCell, { color: colors.textPrimary, textAlign: 'right', fontWeight: '600' }]}>
                                    {formatMoney(item.totalAmount)} đ
                                </Text>
                            </View>
                        ))}

                        {contract.repaymentSchedule.length > 6 && (
                            <Text style={[styles.moreText, { color: colors.textDim }]}>
                                ... và {contract.repaymentSchedule.length - 6} kỳ khác
                            </Text>
                        )}
                    </View>
                )}

                {/* View Full Contract Button */}
                {contractHTML ? (
                    <TouchableOpacity
                        style={[styles.viewContractBtn, { backgroundColor: colors.surface, borderColor: colors.primary }]}
                        onPress={() => setShowContract(true)}
                        activeOpacity={0.7}
                    >
                        <MaterialCommunityIcons name="file-eye-outline" size={20} color={colors.primary} />
                        <Text style={[styles.viewContractText, { color: colors.primary }]}>
                            Xem hợp đồng đầy đủ (PDF)
                        </Text>
                        <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                    </TouchableOpacity>
                ) : null}
            </ScrollView>

            {/* Bottom Sign Button */}
            {isPending && (
                <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopColor: colors.border }]}>
                    <TouchableOpacity
                        style={[styles.signBtn, signing && styles.signBtnDisabled]}
                        onPress={() => setShowSignConfirm(true)}
                        disabled={signing}
                        activeOpacity={0.8}
                    >
                        {signing ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <>
                                <MaterialCommunityIcons name="draw-pen" size={20} color="#fff" />
                                <Text style={styles.signBtnText}>Ký xác nhận hợp đồng</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            )}

            {/* Full Contract WebView Modal */}
            <Modal visible={showContract} animationType="slide" presentationStyle="fullScreen">
                <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
                    <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                        <TouchableOpacity onPress={() => setShowContract(false)} style={styles.modalCloseBtn}>
                            <Ionicons name="close" size={24} color={colors.textPrimary} />
                        </TouchableOpacity>
                        <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Hợp đồng vay</Text>
                        <View style={{ width: 40 }} />
                    </View>
                    <WebView
                        source={{ html: contractHTML }}
                        style={styles.webView}
                        originWhitelist={['*']}
                        scalesPageToFit={Platform.OS === 'android'}
                        javaScriptEnabled={false}
                        showsVerticalScrollIndicator={true}
                    />

                    {/* Signature placeholder area */}
                    {isPending && (
                        <View style={[styles.signatureArea, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                            <View style={[styles.signaturePlaceholder, { borderColor: colors.border }]}>
                                <MaterialCommunityIcons name="shield-check" size={32} color={colors.textDim} />
                                <Text style={[styles.signaturePlaceholderText, { color: colors.textDim }]}>
                                    Chữ ký số VNPT SmartCA{'\n'}Nhấn nút bên dưới để ký
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.signBtn, { marginTop: 12 }, signing && styles.signBtnDisabled]}
                                onPress={() => { setShowContract(false); setShowSignConfirm(true); }}
                                disabled={signing}
                                activeOpacity={0.8}
                            >
                                <MaterialCommunityIcons name="draw-pen" size={20} color="#fff" />
                                <Text style={styles.signBtnText}>Ký xác nhận hợp đồng</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </Modal>

            {/* Sign Confirmation Modal */}
            <Modal visible={showSignConfirm} transparent animationType="fade">
                <View style={styles.confirmOverlay}>
                    <View style={[styles.confirmCard, { backgroundColor: colors.surface }]}>
                        <View style={styles.confirmIconWrap}>
                            <MaterialCommunityIcons name="shield-check" size={48} color="#F0B90B" />
                        </View>
                        <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>
                            Xác nhận ký hợp đồng
                        </Text>
                        <Text style={[styles.confirmDesc, { color: colors.textSecondary }]}>
                            Bạn xác nhận đã đọc và đồng ý với toàn bộ nội dung hợp đồng vay số{' '}
                            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{contract.contractId}</Text>
                            . Số tiền vay{' '}
                            <Text style={{ fontWeight: '700', color: colors.primary }}>{formatMoney(contract.principalAmount)} đ</Text>
                            , kỳ hạn{' '}
                            <Text style={{ fontWeight: '700' }}>{contract.tenure} tháng</Text>.
                        </Text>

                        <View style={styles.confirmBtns}>
                            <TouchableOpacity
                                style={[styles.confirmCancelBtn, { borderColor: colors.border }]}
                                onPress={() => setShowSignConfirm(false)}
                            >
                                <Text style={[styles.confirmCancelText, { color: colors.textSecondary }]}>Hủy</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.confirmSignBtn}
                                onPress={handleSign}
                            >
                                <MaterialCommunityIcons name="shield-check" size={18} color="#181A20" />
                                <Text style={styles.confirmSignText}>Ký số SmartCA</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* SmartCA Digital Signing Modal */}
            <SmartCASigningModal
                visible={showSmartCA}
                contractId={contract.contractId || contract._id}
                onClose={() => setShowSmartCA(false)}
                onSigningComplete={handleSmartCAComplete}
            />
        </View>
    );
}

// --- Sub Components ---
const InfoRow = ({ label, value, colors }: { label: string; value?: string | null; colors: any }) => (
    <View style={styles.infoRow}>
        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{value || 'N/A'}</Text>
    </View>
);

const DetailItem = ({ label, value, colors }: { label: string; value: string; colors: any }) => (
    <View style={styles.detailItem}>
        <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.detailItemValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: { flex: 1 },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollView: { flex: 1 },
    scrollContent: { padding: 16 },

    // Header Card
    headerCard: {
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 12,
        overflow: 'hidden',
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
    },
    headerInfo: { flex: 1 },
    contractIdText: { fontSize: 14, fontWeight: '700' },
    productNameText: { fontSize: 12, marginTop: 2 },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: { fontSize: 12, fontWeight: '600' },

    section: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
    },
    sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },

    // Detail Card
    detailCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginBottom: 12,
    },
    amountBox: {
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginBottom: 16,
    },
    amountLabel: { fontSize: 13 },
    amountValue: { fontSize: 24, fontWeight: '700', marginTop: 4 },

    detailGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    detailItem: {
        width: (width - 64) / 2 - 4,
        padding: 12,
        borderRadius: 10,
        backgroundColor: '#F7F8FA',
    },
    detailItemLabel: { fontSize: 12 },
    detailItemValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },

    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4,
    },
    infoLabel: { fontSize: 13 },
    infoValue: { fontSize: 13, fontWeight: '500' },

    // Schedule
    scheduleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderBottomWidth: 0.5,
    },
    scheduleHeader: {
        borderRadius: 8,
        borderBottomWidth: 0,
        marginBottom: 2,
    },
    scheduleCell: { flex: 1, fontSize: 12 },
    scheduleCellSm: { flex: 0.3, textAlign: 'center' },
    moreText: { textAlign: 'center', fontSize: 12, paddingTop: 8 },

    // View Contract
    viewContractBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1.5,
        gap: 8,
        marginBottom: 12,
    },
    viewContractText: { fontSize: 15, fontWeight: '600' },

    // Bottom Bar
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: 1,
    },
    signBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F0B90B',
        borderRadius: 12,
        paddingVertical: 14,
        gap: 8,
    },
    signBtnDisabled: { opacity: 0.6 },
    signBtnText: { fontSize: 16, fontWeight: '700', color: '#181A20' },

    // Modal
    modalContainer: { flex: 1 },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    modalCloseBtn: { width: 40, alignItems: 'center' },
    modalTitle: { fontSize: 16, fontWeight: '700' },
    webView: { flex: 1 },

    // Signature Area
    signatureArea: {
        padding: 16,
        borderTopWidth: 1,
    },
    signaturePlaceholder: {
        height: 120,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    signaturePlaceholderText: { fontSize: 13, textAlign: 'center' },

    // Confirm Modal
    confirmOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    confirmCard: {
        width: '100%',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
    },
    confirmIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#F0B90B15',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    confirmTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
    confirmDesc: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    confirmBtns: { flexDirection: 'row', gap: 12, width: '100%' },
    confirmCancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
    },
    confirmCancelText: { fontSize: 15, fontWeight: '600' },
    confirmSignBtn: {
        flex: 1,
        flexDirection: 'row',
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#F0B90B',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    confirmSignText: { fontSize: 15, fontWeight: '700', color: '#181A20' },

    // Empty
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    emptyText: { fontSize: 16, fontWeight: '600' },
});
