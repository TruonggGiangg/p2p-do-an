/**
 * LoanConfirmScreen — Xác nhận khoản vay
 * Design: Emerald Night / Precision Luminescence
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, LayoutAnimation, Platform, UIManager,
    Image, StatusBar, TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useRoute, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OTPProtectedAction, PinVerifyModal, BinanceHeader } from '../../../components';
import ImagePickerSheet from '../../../components/common/ImagePickerSheet';
import { loanService, LoanProduct, LoanProductConfig, LoanScheduleResult, LoanDocumentType, ProductCharge, DelinquencyPolicyItem } from '../services/loan.service';
import { walletAPI } from '../../wallet/api/wallet.api';
import { formatCurrency } from '../../../shared/utils';
import { WalletSelectorModal } from '../../wallet/components/WalletSelectorModal';
import type { Wallet } from '../../../types/auth.types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { OtpActionType } from '../../../types/otp.types';
import { useTheme } from '../../../contexts/ThemeContext';
import { useConfirmModal } from '../../../components/common/ConfirmModal';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PREVIEW_ROWS = 3;

type RouteParams = {
    product: LoanProduct;
    config: LoanProductConfig;
    capital: number;
    periodMonth: number;
    willing?: string;
    monthlyRatePercent?: number;
    schedule: LoanScheduleResult;
};

type LoanConfirmNav = NativeStackNavigationProp<RootStackParamList, 'LoanConfirm'>;

export default function LoanConfirmScreen() {
    const { theme } = useTheme();
    const EMERALD_THEME = {
        primary: '#1E3A2F',
        onPrimary: '#FFFFFF',
        textPrimary: '#111827',
        textSecondary: '#6B7280',
        textDim: '#9CA3AF',
        border: '#E5E7EB',
        background: '#F9FAFB',
        surface: '#FFFFFF',
        success: '#059669',
        warning: '#F59E0B'
    };

    const route = useRoute();
    const navigation = useNavigation<LoanConfirmNav>();
    const insets = useSafeAreaInsets();
    const modal = useConfirmModal();
    const params = (route.params || {}) as RouteParams;
    const { product, config, capital, periodMonth, willing, monthlyRatePercent, schedule: initialSchedule } = params;

    const [schedule, setSchedule] = useState<LoanScheduleResult | null>(initialSchedule || null);
    const [loadingSchedule, setLoadingSchedule] = useState(!initialSchedule);
    const [documentTypes, setDocumentTypes] = useState<LoanDocumentType[]>([]);
    const [charges, setCharges] = useState<ProductCharge[]>([]);
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
    const [showWalletModal, setShowWalletModal] = useState(false);
    const [documents, setDocuments] = useState<Record<string, { name: string; uri?: string; type?: string }>>({});
    const [submitting, setSubmitting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [scheduleExpanded, setScheduleExpanded] = useState(false);
    const [policies, setPolicies] = useState<DelinquencyPolicyItem[]>([]);
    const [policyExpanded, setPolicyExpanded] = useState(false);
    const [policyAgreed, setPolicyAgreed] = useState(false);

    const [showPinVerify, setShowPinVerify] = useState(false);
    const otpTriggerRef = useRef<(() => void) | null>(null);

    // ── AI Scoring fields (bắt buộc cho models_final) ──
    const [personIncomeStr, setPersonIncomeStr] = useState('');
    const [personEmpExpStr, setPersonEmpExpStr] = useState('');
    const personIncome = Number(personIncomeStr.replace(/\D/g, '')) || 0;
    const personEmpExp = Number(personEmpExpStr.replace(/\D/g, '')) || 0;

    useEffect(() => {
        if (!schedule) {
            const fetchSchedule = async () => {
                try {
                    const res = await loanService.ratePreview({
                        capital,
                        periodMonth,
                        productId: product.id,
                    });
                    setSchedule(res);
                } catch (err) {
                    console.error('Failed to fetch fallback schedule:', err);
                } finally {
                    setLoadingSchedule(false);
                }
            };
            fetchSchedule();
        }
    }, [schedule]);

    const fetchData = useCallback(async () => {
        try {
            const [docTypes, walletRes, productCharges, policyList] = await Promise.all([
                loanService.getDocumentTypesByProduct(product.id),
                walletAPI.getWallets(),
                loanService.getProductCharges(product.id),
                loanService.getDelinquencyPolicies(product.id),
            ]);
            setDocumentTypes(docTypes);
            setCharges(productCharges);
            setPolicies(policyList);
            const wList = walletRes.wallets ?? [];
            setWallets(wList);
            const defaultWallet = wList.find((w) => w.isDefault) ?? wList[0];
            setSelectedWallet(defaultWallet ?? null);
        } catch (e) {
            modal.error('Lỗi', 'Không thể tải dữ liệu');
        } finally {
            setLoading(false);
        }
    }, [product?.id]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleApply = async (payload?: { otpSessionId?: string }) => {
        if (!selectedWallet) {
            modal.error('Lỗi', 'Vui lòng chọn ví nhận giải ngân');
            return;
        }
        const walletId = selectedWallet.id ?? selectedWallet._id;
        if (!walletId) {
            modal.error('Lỗi', 'Ví không hợp lệ');
            return;
        }
        const requiredMissing = documentTypes.filter((d) => d.required && !documents[d.id]?.name);
        if (requiredMissing.length > 0) {
            modal.error('Lỗi', `Vui lòng cung cấp tài liệu: ${requiredMissing.map((d) => d.name).join(', ')}`);
            return;
        }
        if (personIncome < 1_000_000) {
            modal.error('Thiếu thông tin', 'Vui lòng nhập thu nhập hàng tháng (tối thiểu 1.000.000 ₫).');
            return;
        }
        if (personEmpExp < 0 || personEmpExp > 60) {
            modal.error('Thiếu thông tin', 'Số năm kinh nghiệm làm việc phải từ 0 đến 60.');
            return;
        }
        setSubmitting(true);
        try {
            const today = new Date();
            const disbursementDate = today.toISOString().split('T')[0];
            const result = await loanService.apply({
                capital,
                periodMonth,
                productId: product.id,
                monthlyRatePercent,
                willing,
                disbursementDate,
                disbursementWalletId: walletId,
                personIncome,
                personEmpExp,
                documents: Object.entries(documents)
                    .filter(([, v]) => v?.name)
                    .map(([documentTypeId, v]) => {
                        return { documentTypeId, name: v!.name };
                    }),
                otpSessionId: payload?.otpSessionId,
            });

            const loanMongoId = result.id;
            const uploadPromises = Object.entries(documents)
                .filter(([, v]) => v?.uri)
                .map(async ([documentTypeId, v]) => {
                    try {
                        await loanService.uploadDocument(loanMongoId, v.uri!, v.type!, documentTypeId);
                    } catch (err) {
                        console.warn(`Failed to upload document ${documentTypeId}:`, err);
                    }
                });

            if (uploadPromises.length > 0) {
                await Promise.all(uploadPromises);
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            navigation.replace('LoanApplySuccess', {
                capital,
                periodMonth,
                entirelyPay: result.entirelyPay,
            });
        } catch (e: any) {
            const errData = e?.response?.data;
            const msg = typeof errData?.message === 'string' ? errData.message : 'Không thể tạo đơn vay. Vui lòng thử lại sau.';
            const blockData = errData?.data;
            const code = blockData?.code;

            if (code === 'LOAN_AUTO_REJECTED') {
                navigation.navigate('LoanRejected' as any, {
                    message: msg,
                    evaluationScore: blockData?.evaluationScore,
                    grade: blockData?.grade,
                    subGrade: blockData?.subGrade,
                    riskLevel: blockData?.riskLevel,
                    modelDecision: blockData?.modelDecision,
                    decisionExplanation: blockData?.decisionExplanation,
                    riskFactors: blockData?.riskFactors,
                    positiveFactors: blockData?.positiveFactors,
                });
                return;
            }

            navigation.navigate('LoanBlocked' as any, {
                message: msg,
                debtGroup: blockData?.debtGroup,
                overdueDays: blockData?.overdueDays,
                overdueAmount: blockData?.overdueAmount,
                fineractLoanId: blockData?.fineractLoanId,
                policy: blockData?.policy,
            });
        } finally {
            setSubmitting(false);
        }
    };

    const setDoc = (docTypeId: string, uri?: string, type?: string) => {
        const typeName = documentTypes.find(d => d.id === docTypeId)?.name || 'Document';
        setDocuments((prev) => ({ ...prev, [docTypeId]: { name: typeName, uri, type } }));
    };

    const [imagePickerVisible, setImagePickerVisible] = useState(false);
    const [imagePickerDocId, setImagePickerDocId] = useState<string | null>(null);

    const pickImage = (docTypeId: string) => {
        setImagePickerDocId(docTypeId);
        setImagePickerVisible(true);
    };

    const handleImagePicked = (result: { uri: string; type?: string; fileName?: string }) => {
        if (imagePickerDocId) {
            setDoc(imagePickerDocId, result.uri, result.type ?? 'image/jpeg');
        }
        setImagePickerVisible(false);
        setImagePickerDocId(null);
    };

    const toggleSchedule = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setScheduleExpanded((v) => !v);
    };

    const StepperBar = () => (
        <View style={styles.stepperContainer}>
            {[1, 2].map((s) => (
                <View key={s} style={styles.stepSegmentWrapper}>
                    <View style={[styles.stepSegment, { backgroundColor: s <= 2 ? '#1E3A2F' : '#E5E7EB', height: 4 }]} />
                </View>
            ))}
        </View>
    );

    if (!product || (loadingSchedule && !schedule)) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#1E3A2F" />
                <Text style={{ marginTop: 12, color: '#6B7280' }}>Đang tính toán lịch trả nợ...</Text>
            </View>
        );
    }

    const safeSchedule = schedule || { monthlyPay: 0, schedulePreview: [] };

    const isAnnual = product.interestRateFrequencyType?.value?.toLowerCase()?.includes('year');
    const effectiveRateRaw = monthlyRatePercent ?? (isAnnual ? config?.annualRate : config?.monthlyRate) ?? 0;
    const effectiveRate = +effectiveRateRaw.toFixed(2);
    const rateUnit = isAnnual ? 'năm' : 'tháng';
    const visibleRows = scheduleExpanded
        ? (safeSchedule.schedulePreview ?? [])
        : (safeSchedule.schedulePreview ?? []).slice(0, PREVIEW_ROWS);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <BinanceHeader
                mode="standard"
                title="Xác nhận đơn vay"
                showBack
                rightComponents={<Text style={styles.stepIndicatorText}>2/2</Text>}
            />
            <StepperBar />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>TỔNG SỐ TIỀN VAY</Text>
                    <Text style={styles.summaryAmount}>{formatCurrency(capital)}</Text>
                    <View style={styles.summaryStatsRow}>
                        <View style={styles.summaryStatItem}><Text style={styles.summaryStatValue}>{periodMonth} tháng</Text></View>
                        <View style={styles.summaryStatDivider} />
                        <View style={styles.summaryStatItem}><Text style={styles.summaryStatValue}>{effectiveRate}%/{rateUnit}</Text></View>
                        <View style={styles.summaryStatDivider} />
                        <View style={styles.summaryStatItem}><Text style={styles.summaryStatValue}>{formatCurrency(safeSchedule.monthlyPay || 0)}/kỳ</Text></View>
                    </View>
                </View>

                {charges.length > 0 && (
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>PHÍ KHOẢN VAY</Text>
                        {charges.map((fee) => {
                            const isPercent = /percent|amount/i.test(fee.chargeCalculationType);
                            const isDisbursement = /disbursement/i.test(fee.chargeTimeType);
                            return (
                                <View key={fee.id} style={styles.feeRow}>
                                    <View style={styles.feeLabelBlock}>
                                        <Text style={styles.feeName}>{fee.name}</Text>
                                        {isDisbursement && <Text style={styles.feeNote}>Thu khi giải ngân</Text>}
                                    </View>
                                    <View style={styles.feeValueBlock}>
                                        <Text style={styles.feeRate}>{isPercent ? `${(fee.amount ?? 0).toFixed(2)}% gốc` : formatCurrency(fee.amount ?? 0)}</Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}

                {safeSchedule.schedulePreview && safeSchedule.schedulePreview.length > 0 && (
                    <View style={styles.card}>
                        <View style={styles.scheduleTitleRow}>
                            <Text style={styles.sectionTitle}>LỊCH TRẢ NỢ</Text>
                            <TouchableOpacity style={styles.expandBtn} onPress={toggleSchedule}>
                                <Text style={styles.expandText}>{scheduleExpanded ? 'Thu gọn' : `Chi tiết (${safeSchedule.schedulePreview.length})`}</Text>
                                <MaterialCommunityIcons name={scheduleExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#1E3A2F" />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.tableHeader}>
                            <Text style={[styles.colKy, styles.tableHeaderText]}>Kỳ</Text>
                            <Text style={[styles.colGoc, styles.tableHeaderText]}>Gốc</Text>
                            <Text style={[styles.colLai, styles.tableHeaderText]}>Lãi</Text>
                            <Text style={[styles.colTong, styles.tableHeaderText]}>Tổng</Text>
                        </View>
                        {visibleRows.map((item, index) => (
                            <View key={item.period} style={[styles.tableRow, index % 2 === 0 && { backgroundColor: '#F9FAFB' }]}>
                                <View style={styles.colKy}><View style={styles.periodCircle}><Text style={styles.periodCircleText}>{item.period}</Text></View></View>
                                <Text style={[styles.colGoc, styles.tableRowText]}>{formatCurrency(item.principal)}</Text>
                                <Text style={[styles.colLai, styles.tableRowText, { color: '#6B7280' }]}>{formatCurrency(item.interest)}</Text>
                                <Text style={[styles.colTong, styles.tableRowTextBold]}>{formatCurrency(item.total)}</Text>
                            </View>
                        ))}
                    </View>
                )}

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>THÔNG TIN HỒ SƠ TÍN DỤNG</Text>
                    <Text style={styles.aiHelperText}>
                        Hai mục dưới đây dùng để chấm điểm tín dụng tự động (AI). Vui lòng điền chính xác.
                    </Text>

                    <View style={styles.aiInputBlock}>
                        <View style={styles.aiInputLabelRow}>
                            <Text style={styles.aiInputLabel}>Thu nhập hàng tháng</Text>
                            <View style={styles.badgeRequired}><Text style={styles.badgeRequiredText}>Bắt buộc</Text></View>
                        </View>
                        <View style={styles.aiInputBox}>
                            <TextInput
                                style={styles.aiInput}
                                value={personIncomeStr}
                                onChangeText={(t) => {
                                    const digits = t.replace(/\D/g, '');
                                    setPersonIncomeStr(digits === '' ? '' : Number(digits).toLocaleString('vi-VN'));
                                }}
                                keyboardType="numeric"
                                placeholder="VD: 15.000.000"
                                placeholderTextColor="#9CA3AF"
                            />
                            <Text style={styles.aiInputSuffix}>₫</Text>
                        </View>
                    </View>

                    <View style={styles.aiInputBlock}>
                        <View style={styles.aiInputLabelRow}>
                            <Text style={styles.aiInputLabel}>Số năm kinh nghiệm làm việc</Text>
                            <View style={styles.badgeRequired}><Text style={styles.badgeRequiredText}>Bắt buộc</Text></View>
                        </View>
                        <View style={styles.aiInputBox}>
                            <TextInput
                                style={styles.aiInput}
                                value={personEmpExpStr}
                                onChangeText={(t) => {
                                    const digits = t.replace(/\D/g, '').slice(0, 2);
                                    setPersonEmpExpStr(digits);
                                }}
                                keyboardType="numeric"
                                placeholder="VD: 3"
                                placeholderTextColor="#9CA3AF"
                            />
                            <Text style={styles.aiInputSuffix}>năm</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>THÔNG TIN NHẬN GIẢI NGÂN</Text>
                    {loading ? <ActivityIndicator color="#1E3A2F" /> : (
                        <TouchableOpacity style={styles.walletSelect} onPress={() => setShowWalletModal(true)}>
                            <View style={styles.walletIconWrap}><MaterialCommunityIcons name="wallet-outline" size={24} color="#1E3A2F" /></View>
                            <View style={styles.walletInfo}>
                                <Text style={styles.walletName}>{selectedWallet?.productName || 'Ví điện tử'}</Text>
                                <Text style={styles.walletNo}>ID: {selectedWallet?.accountNo || 'N/A'}</Text>
                            </View>
                            <MaterialCommunityIcons name="chevron-right" size={24} color="#9CA3AF" />
                        </TouchableOpacity>
                    )}
                </View>

                {documentTypes.length > 0 && (
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>TÀI LIỆU ĐÍNH KÈM</Text>
                        {documentTypes.map((doc) => (
                            <View key={doc.id} style={styles.docRow}>
                                <View style={styles.docHeader}>
                                    <Text style={styles.docName}>{doc.name}</Text>
                                    {doc.required && <View style={styles.badgeRequired}><Text style={styles.badgeRequiredText}>Bắt buộc</Text></View>}
                                </View>
                                <TouchableOpacity style={styles.bigCameraBtn} onPress={() => pickImage(doc.id)}>
                                    {documents[doc.id]?.uri ? (
                                        <Image source={{ uri: documents[doc.id]?.uri }} style={styles.docThumbnail} />
                                    ) : (
                                        <View style={{ alignItems: 'center' }}>
                                            <MaterialCommunityIcons name="camera-plus-outline" size={32} color="#9CA3AF" />
                                            <Text style={styles.uploadHint}>Tải ảnh lên</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}

                <View style={styles.footer}>
                    <OTPProtectedAction
                        actionType={OtpActionType.LOAN_CREATE}
                        actionData={{ capital, periodMonth, productId: product.id }}
                        onExecute={handleApply}
                        requireOTP
                    >
                        {({ trigger, isLoading }) => {
                            otpTriggerRef.current = trigger;
                            return (
                                <TouchableOpacity
                                    style={[styles.submitBtn, (submitting || isLoading) && { opacity: 0.7 }]}
                                    onPress={() => setShowPinVerify(true)}
                                    disabled={submitting || isLoading}
                                >
                                    {submitting || isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Xác nhận & gửi đơn</Text>}
                                </TouchableOpacity>
                            );
                        }}
                    </OTPProtectedAction>
                </View>
            </ScrollView>

            <WalletSelectorModal
                visible={showWalletModal}
                onClose={() => setShowWalletModal(false)}
                wallets={wallets}
                selectedWalletId={selectedWallet?.id || selectedWallet?._id}
                onSelect={setSelectedWallet}
            />
            <ImagePickerSheet visible={imagePickerVisible} onClose={() => setImagePickerVisible(false)} onSelect={handleImagePicked} />
            <PinVerifyModal
                visible={showPinVerify}
                onCancel={() => setShowPinVerify(false)}
                onSuccess={() => { setShowPinVerify(false); setTimeout(() => otpTriggerRef.current?.(), 300); }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    stepIndicatorText: { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 100 },
    stepperContainer: { flexDirection: 'row', height: 4, marginHorizontal: 16, marginVertical: 8, gap: 4 },
    stepSegmentWrapper: { flex: 1 },
    stepSegment: { borderRadius: 2 },
    summaryCard: { backgroundColor: '#1E3A2F', borderRadius: 24, padding: 24, alignItems: 'center' },
    summaryLabel: { fontSize: 12, fontWeight: '700', color: '#A7F3D0', marginBottom: 12 },
    summaryAmount: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', marginBottom: 24 },
    summaryStatsRow: { flexDirection: 'row', width: '100%', paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
    summaryStatItem: { flex: 1, alignItems: 'center' },
    summaryStatValue: { fontSize: 13, fontWeight: '700', color: '#A7F3D0' },
    summaryStatDivider: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.1)' },
    card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginTop: 16 },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: '#1E3A2F', marginBottom: 16 },
    feeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
    feeLabelBlock: { flex: 1 },
    feeName: { fontSize: 14, fontWeight: '600', color: '#111827' },
    feeNote: { fontSize: 12, color: '#6B7280' },
    feeValueBlock: { alignItems: 'flex-end' },
    feeRate: { fontSize: 14, fontWeight: '700', color: '#111827' },
    scheduleTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    expandBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    expandText: { fontSize: 12, fontWeight: '600', color: '#1E3A2F' },
    tableHeader: { flexDirection: 'row', paddingVertical: 8 },
    tableHeaderText: { fontSize: 11, fontWeight: '700', color: '#9CA3AF' },
    tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
    colKy: { width: 40 },
    colGoc: { flex: 1, textAlign: 'right' },
    colLai: { flex: 1, textAlign: 'right' },
    colTong: { flex: 1.2, textAlign: 'right' },
    tableRowText: { fontSize: 13, textAlign: 'right' },
    tableRowTextBold: { fontSize: 13, fontWeight: '700', color: '#1E3A2F', textAlign: 'right' },
    periodCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
    periodCircleText: { fontSize: 12, fontWeight: '700' },
    walletSelect: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12 },
    walletIconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#1E3A2F10', justifyContent: 'center', alignItems: 'center' },
    walletInfo: { flex: 1 },
    walletName: { fontSize: 14, fontWeight: '700' },
    walletNo: { fontSize: 12, color: '#6B7280' },
    docRow: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    docHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    docName: { fontSize: 14, fontWeight: '600' },
    badgeRequired: { backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    aiHelperText: { fontSize: 12, color: '#6B7280', marginBottom: 12, marginTop: -8, lineHeight: 18 },
    aiInputBlock: { marginBottom: 16 },
    aiInputLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    aiInputLabel: { fontSize: 13, fontWeight: '600', color: '#111827' },
    aiInputBox: {
        flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB',
        borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#FFFFFF',
    },
    aiInput: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827', paddingVertical: 12 },
    aiInputSuffix: { fontSize: 13, color: '#6B7280', marginLeft: 8 },
    badgeRequiredText: { color: '#DC2626', fontSize: 10, fontWeight: '700' },
    bigCameraBtn: { width: '100%', height: 120, backgroundColor: '#F9FAFB', borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
    docThumbnail: { width: '100%', height: '100%', borderRadius: 12 },
    uploadHint: { fontSize: 13, color: '#9CA3AF' },
    footer: { marginTop: 24 },
    submitBtn: { backgroundColor: '#1E3A2F', height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }
});
