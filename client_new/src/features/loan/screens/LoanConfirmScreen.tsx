/**
 * LoanConfirmScreen — Xác nhận khoản vay
 * Design: Emerald Night / Precision Luminescence
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, LayoutAnimation, Platform, UIManager,
    Image, StatusBar,
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

// ── Step indicator ────────────────────────────
function StepIndicator({ current, theme }: { current: number, theme: any }) {
    const EMERALD_THEME = {
        ...theme.colors,
        surfaceHigh: theme.colors.surfaceBright,
        textDim: theme.mode === 'dark' ? theme.colors.textDim : theme.colors.textSecondary,
    };
    const stepS = StyleSheet.create({
        container: { paddingHorizontal: 20, paddingVertical: 14, gap: 10, marginBottom: 10 },
        label: { fontSize: 13, fontWeight: '600', color: EMERALD_THEME.textDim, textTransform: 'uppercase', letterSpacing: 1 },
        labelHighlight: { color: EMERALD_THEME.textPrimary },
        stepsRow: { flexDirection: 'row', alignItems: 'center' },
        dot: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
        dotText: { fontSize: 11, fontWeight: '700', color: EMERALD_THEME.textDim },
        connector: { height: 2, flex: 1, marginHorizontal: 8, borderRadius: 1 },
    });
    return (
        <View style={stepS.container}>
            <Text style={stepS.label}>Bước {current + 1}/2: <Text style={stepS.labelHighlight}>{current === 0 ? 'Nhập thông tin' : 'Xác nhận đơn'}</Text></Text>
            <View style={stepS.stepsRow}>
                {[0, 1].map((i) => (
                    <React.Fragment key={i}>
                        <View style={[
                            stepS.dot,
                            i <= current ? { backgroundColor: EMERALD_THEME.primary } : { backgroundColor: EMERALD_THEME.surfaceHigh },
                        ]}>
                            {i < current ? (
                                <MaterialCommunityIcons name="check" size={12} color={EMERALD_THEME.onPrimary} />
                            ) : (
                                <Text style={[stepS.dotText, i <= current && { color: EMERALD_THEME.onPrimary }]}>{i + 1}</Text>
                            )}
                        </View>
                        {i < 1 && (
                            <View style={[
                                stepS.connector,
                                i < current ? { backgroundColor: EMERALD_THEME.primary } : { backgroundColor: EMERALD_THEME.surfaceHigh },
                            ]} />
                        )}
                    </React.Fragment>
                ))}
            </View>
        </View>
    );
}

export default function LoanConfirmScreen() {
    const { theme } = useTheme();
    const EMERALD_THEME = {
        ...theme.colors,
        surfaceHigh: theme.colors.surfaceBright,
        textDim: theme.mode === 'dark' ? theme.colors.textDim : theme.colors.textSecondary,
    };
    const s = React.useMemo(() => getStyles(EMERALD_THEME), [EMERALD_THEME]);

    const route = useRoute();
    const navigation = useNavigation<LoanConfirmNav>();
    const insets = useSafeAreaInsets();
    const params = (route.params || {}) as RouteParams;
    const { product, config, capital, periodMonth, willing, monthlyRatePercent, schedule } = params;

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

    // PIN verification trước OTP
    const [showPinVerify, setShowPinVerify] = useState(false);
    const otpTriggerRef = useRef<(() => void) | null>(null);

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
            Alert.alert('Lỗi', 'Không thể tải dữ liệu');
        } finally {
            setLoading(false);
        }
    }, [product?.id]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleApply = async (payload?: { otpSessionId?: string }) => {
        if (!selectedWallet) {
            Alert.alert('Lỗi', 'Vui lòng chọn ví nhận giải ngân');
            return;
        }
        const walletId = selectedWallet.id ?? selectedWallet._id;
        if (!walletId) {
            Alert.alert('Lỗi', 'Ví không hợp lệ');
            return;
        }
        const requiredMissing = documentTypes.filter((d) => d.required && !documents[d.id]?.name);
        if (requiredMissing.length > 0) {
            Alert.alert('Lỗi', `Vui lòng cung cấp tài liệu: ${requiredMissing.map((d) => d.name).join(', ')}`);
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
                documents: Object.entries(documents)
                    .filter(([, v]) => v?.name)
                    .map(([documentTypeId, v]) => {
                        return { documentTypeId, name: v!.name };
                    }),
                otpSessionId: payload?.otpSessionId,
            });

            const loanMongoId = result.id;

            // Upload documents
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
            const msg =
                typeof errData?.message === 'string'
                    ? errData.message
                    : 'Không thể tạo đơn vay. Vui lòng thử lại sau.';
            const blockData = errData?.data;
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

    // ImagePickerSheet state
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

    if (!product || !schedule) {
        return (
            <View style={[s.container, { backgroundColor: EMERALD_THEME.background }]}>
                <BinanceHeader title="Xác nhận đơn vay" mode="standard" />
                <View style={s.centered}><Text style={{ color: EMERALD_THEME.textSecondary }}>Thiếu thông tin</Text></View>
            </View>
        );
    }

    const isAnnual = product.interestRateFrequencyType?.value?.toLowerCase()?.includes('year');
    const effectiveRateRaw = monthlyRatePercent ?? (isAnnual ? config?.annualRate : config?.monthlyRate) ?? 0;
    const effectiveRate = +effectiveRateRaw.toFixed(2);
    const rateUnit = isAnnual ? 'năm' : 'tháng';
    const visibleRows = scheduleExpanded
        ? (schedule.schedulePreview ?? [])
        : (schedule.schedulePreview ?? []).slice(0, PREVIEW_ROWS);

    return (
        <View style={[s.container, { backgroundColor: EMERALD_THEME.background }]}>
            <StatusBar barStyle={theme.mode === 'dark' ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />

            <BinanceHeader title="Xác nhận đơn vay" mode="standard" />

            <StepIndicator current={1} theme={theme} />

            <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

                {/* ── Hero: Tóm tắt chính ── */}
                <View style={s.heroVaultCard}>
                    <Text style={s.heroLabel}>TỔNG SỐ TIỀN VAY</Text>
                    <Text style={s.heroAmount}>{formatCurrency(capital)}</Text>

                    <View style={s.heroGrid}>
                        <View style={s.heroCol}>
                            <Text style={s.heroColLabel}>KỲ HẠN</Text>
                            <Text style={s.heroColValue}>{periodMonth} tháng</Text>
                        </View>
                        <View style={s.heroDivider} />
                        <View style={s.heroCol}>
                            <Text style={s.heroColLabel}>LÃI SUẤT</Text>
                            <Text style={s.heroColValue}>{effectiveRate}%/{rateUnit}</Text>
                        </View>
                        <View style={s.heroDivider} />
                        <View style={s.heroCol}>
                            <Text style={s.heroColLabel}>TRẢ/THÁNG</Text>
                            <Text style={s.heroColValue}>{formatCurrency(schedule.monthlyPay)}</Text>
                        </View>
                    </View>

                    <View style={s.heroTotalBox}>
                        <Text style={s.heroTotalLabel}>Tổng số tiền phải trả</Text>
                        <Text style={s.heroTotalValue}>{formatCurrency(schedule.entirelyPay)}</Text>
                    </View>
                </View>

                {/* ── Phí khoản vay ── */}
                {charges.length > 0 && (
                    <View style={s.card}>
                        <Text style={s.sectionTitle}>PHÍ KHOẢN VAY</Text>
                        {charges.map((fee, idx) => {
                            const isPercent = /percent|amount/i.test(fee.chargeCalculationType);
                            const pct = fee.amount ?? 0;
                            const feeAmountCalc = isPercent && capital > 0 ? Math.round(capital * pct / 100) : null;
                            const isDisbursement = /disbursement/i.test(fee.chargeTimeType);

                            return (
                                <View key={fee.id} style={s.feeRow}>
                                    <View style={s.feeLabelBlock}>
                                        <Text style={s.feeName}>{fee.name}</Text>
                                        {isDisbursement && <Text style={s.feeNote}>Thu khi giải ngân</Text>}
                                    </View>
                                    <View style={s.feeValueBlock}>
                                        <Text style={s.feeRate}>
                                            {isPercent ? `${Number(pct).toFixed(2)}% gốc` : `${formatCurrency(pct)}`}
                                        </Text>
                                        {feeAmountCalc != null && (
                                            <Text style={s.feeAmountText}>≈ {formatCurrency(feeAmountCalc)}</Text>
                                        )}
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* ── Lịch trả nợ ── */}
                {schedule.schedulePreview && schedule.schedulePreview.length > 0 && (
                    <View style={s.card}>
                        <View style={s.scheduleTitleRow}>
                            <Text style={s.sectionTitle}>LỊCH TRẢ NỢ</Text>
                            <TouchableOpacity style={s.expandBtn} onPress={toggleSchedule}>
                                <Text style={s.expandText}>
                                    {scheduleExpanded ? 'Thu gọn' : `Chi tiết (${schedule.schedulePreview.length})`}
                                </Text>
                                <MaterialCommunityIcons name={scheduleExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={EMERALD_THEME.primary} />
                            </TouchableOpacity>
                        </View>

                        <View style={s.tableHeader}>
                            <Text style={[s.colKy, s.tableHeaderText]}>Kỳ</Text>
                            <Text style={[s.colGoc, s.tableHeaderText]}>Gốc</Text>
                            <Text style={[s.colLai, s.tableHeaderText]}>Lãi</Text>
                            <Text style={[s.colTong, s.tableHeaderText]}>Tổng</Text>
                        </View>

                        {visibleRows.map((item, index) => (
                            <View key={item.period} style={[s.tableRow, index % 2 === 0 && { backgroundColor: EMERALD_THEME.background }]}>
                                <View style={s.colKy}>
                                    <View style={s.periodCircle}>
                                        <Text style={s.periodCircleText}>{item.period}</Text>
                                    </View>
                                </View>
                                <Text style={[s.colGoc, s.tableRowText]}>{formatCurrency(item.principal)}</Text>
                                <Text style={[s.colLai, s.tableRowText, { color: EMERALD_THEME.textSecondary }]}>{formatCurrency(item.interest)}</Text>
                                <Text style={[s.colTong, s.tableRowTextBold]}>{formatCurrency(item.total)}</Text>
                            </View>
                        ))}

                        {!scheduleExpanded && schedule.schedulePreview.length > PREVIEW_ROWS && (
                            <TouchableOpacity style={s.showMoreBtn} onPress={toggleSchedule}>
                                <Text style={s.showMoreText}>+ {schedule.schedulePreview.length - PREVIEW_ROWS} kỳ còn lại</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* ── Thông tin nhận giải ngân ── */}
                <View style={s.card}>
                    <Text style={s.sectionTitle}>THÔNG TIN NHẬN GIẢI NGÂN</Text>
                    {loading ? (
                        <ActivityIndicator color={EMERALD_THEME.primary} size="small" />
                    ) : (
                        <TouchableOpacity
                            style={[s.walletSelect, selectedWallet && { borderColor: EMERALD_THEME.primary }]}
                            onPress={() => setShowWalletModal(true)}
                        >
                            <View style={s.walletIconWrap}>
                                <MaterialCommunityIcons name="wallet-outline" size={24} color={EMERALD_THEME.primary} />
                            </View>
                            {selectedWallet ? (
                                <View style={s.walletInfo}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={s.walletName}>
                                            {selectedWallet.productName || selectedWallet.metadata?.productName || 'Ví điện tử'}
                                        </Text>
                                        {selectedWallet.isDefault && (
                                            <View style={s.defaultBadge}>
                                                <Text style={s.defaultBadgeText}>Mặc định</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={s.walletNo}>ID: {selectedWallet.accountNo || selectedWallet.fineractId || 'N/A'}</Text>
                                </View>
                            ) : (
                                <Text style={s.walletPlaceholder}>Chọn ví nhận giải ngân</Text>
                            )}
                            <MaterialCommunityIcons name="chevron-right" size={24} color={EMERALD_THEME.textDim} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* ── Chính sách xử lý nợ ── */}
                {policies.length > 0 && (
                    <View style={s.card}>
                        <TouchableOpacity style={s.scheduleTitleRow} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setPolicyExpanded(v => !v); }} activeOpacity={0.7}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <MaterialCommunityIcons name="shield-alert-outline" size={18} color={EMERALD_THEME.warning ?? '#f59e0b'} />
                                <Text style={s.sectionTitle}>CHÍNH SÁCH NỢ QUÁ HẠN</Text>
                            </View>
                            <MaterialCommunityIcons name={policyExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={EMERALD_THEME.primary} />
                        </TouchableOpacity>

                        {!policyExpanded && (
                            <Text style={{ fontSize: 12, color: EMERALD_THEME.textSecondary, marginTop: -8, marginBottom: 4 }}>
                                Nhấn để xem chi tiết các biện pháp xử lý khi trễ hạn thanh toán
                            </Text>
                        )}

                        {policyExpanded && (
                            <View style={{ marginTop: 4 }}>
                                {/* Table Header */}
                                <View style={{
                                    flexDirection: 'row',
                                    paddingVertical: 10,
                                    paddingHorizontal: 8,
                                    backgroundColor: EMERALD_THEME.background,
                                    borderRadius: 8,
                                    marginBottom: 2,
                                }}>
                                    <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '700', color: EMERALD_THEME.textDim }}>Nhóm</Text>
                                    <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: EMERALD_THEME.textDim }}>Ngày quá hạn</Text>
                                    <Text style={{ flex: 1.5, fontSize: 11, fontWeight: '700', color: EMERALD_THEME.textDim }}>Hành động</Text>
                                </View>
                                {/* Table Rows */}
                                {policies.map((p, idx) => {
                                    const actions: string[] = [];
                                    if (p.send_notification) actions.push('Thông báo');
                                    if (p.send_email) actions.push('Email');
                                    if (p.send_sms) actions.push('SMS');
                                    if (p.apply_penalty) actions.push('Áp dụng lãi phạt');
                                    if (p.block_new_loan) actions.push('Chặn vay mới');
                                    if (p.freeze_account) actions.push('Đóng băng tài khoản');
                                    if (p.permanent_ban) actions.push('Cấm vĩnh viễn');
                                    if (p.legal_escalation) actions.push('Xử lý pháp lý');
                                    const dayRange = p.min_days != null && p.max_days != null
                                        ? `${p.min_days} - ${p.max_days} ngày`
                                        : p.min_days != null
                                            ? `≥ ${p.min_days} ngày`
                                            : '--';

                                    return (
                                        <View
                                            key={p._id || idx}
                                            style={{
                                                flexDirection: 'row',
                                                paddingVertical: 12,
                                                paddingHorizontal: 8,
                                                borderTopWidth: idx > 0 ? 1 : 0,
                                                borderTopColor: EMERALD_THEME.border,
                                                alignItems: 'flex-start',
                                            }}
                                        >
                                            <View style={{ flex: 1.2 }}>
                                                <Text style={{ fontSize: 12, fontWeight: '600', color: EMERALD_THEME.textPrimary }}>
                                                    #{p.debt_group} – {p.debt_group_name}
                                                </Text>
                                            </View>
                                            <Text style={{ flex: 1, fontSize: 12, color: EMERALD_THEME.textSecondary }}>{dayRange}</Text>
                                            <Text style={{ flex: 1.5, fontSize: 12, color: EMERALD_THEME.textSecondary, lineHeight: 18 }}>
                                                {actions.join(', ')}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: EMERALD_THEME.border }}
                            onPress={() => setPolicyAgreed(v => !v)}
                            activeOpacity={0.7}
                        >
                            <View style={{
                                width: 22, height: 22, borderRadius: 6,
                                borderWidth: 2, borderColor: policyAgreed ? EMERALD_THEME.primary : EMERALD_THEME.textDim,
                                backgroundColor: policyAgreed ? EMERALD_THEME.primary : 'transparent',
                                justifyContent: 'center', alignItems: 'center',
                            }}>
                                {policyAgreed && <MaterialCommunityIcons name="check" size={14} color={EMERALD_THEME.onPrimary} />}
                            </View>
                            <Text style={{ flex: 1, fontSize: 12, color: EMERALD_THEME.textSecondary, lineHeight: 18 }}>
                                Tôi đã đọc và đồng ý với các điều khoản xử lý nợ quá hạn của hệ thống P2P Lending
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── Tài liệu đính kèm ── */}
                {documentTypes.length > 0 && (
                    <View style={s.card}>
                        <View style={s.docSectionHeader}>
                            <MaterialCommunityIcons name="file-document-multiple-outline" size={18} color={EMERALD_THEME.textDim} />
                            <Text style={s.sectionTitle}>TÀI LIỆU ĐÍNH KÈM</Text>
                        </View>

                        {documentTypes.sort((a, b) => a.sortOrder - b.sortOrder).map((doc) => {
                            const hasValue = !!documents[doc.id]?.name;

                            return (
                                <View key={doc.id} style={s.docRow}>
                                    <View style={s.docHeader}>
                                        <View style={[s.docIconWrap, hasValue && { backgroundColor: EMERALD_THEME.success + '20' }]}>
                                            <MaterialCommunityIcons
                                                name={hasValue ? "check-circle" : "file-image-outline"}
                                                size={18}
                                                color={hasValue ? EMERALD_THEME.success : EMERALD_THEME.primary}
                                            />
                                        </View>
                                        <View style={s.docNameBlock}>
                                            <Text style={s.docName}>{doc.name}</Text>
                                            {doc.description ? (
                                                <Text style={s.docDesc} numberOfLines={1}>{doc.description}</Text>
                                            ) : null}
                                        </View>
                                        {doc.required ? (
                                            <View style={s.badgeRequired}>
                                                <Text style={s.badgeRequiredText}>Bắt buộc</Text>
                                            </View>
                                        ) : (
                                            <View style={s.badgeOptional}>
                                                <Text style={s.badgeOptionalText}>Tuỳ chọn</Text>
                                            </View>
                                        )}
                                    </View>

                                    <TouchableOpacity
                                        style={[s.bigCameraBtn, documents[doc.id]?.uri && { borderColor: EMERALD_THEME.success, borderStyle: 'solid' }]}
                                        onPress={() => pickImage(doc.id)}
                                    >
                                        {documents[doc.id]?.uri ? (
                                            <View style={s.docThumbnailWrap}>
                                                <Image source={{ uri: documents[doc.id]?.uri }} style={s.docThumbnail} />
                                                <View style={s.docThumbnailOverlay}>
                                                    <MaterialCommunityIcons name="pencil-circle" size={32} color="#fff" />
                                                    <Text style={s.docThumbnailText}>Sửa ảnh</Text>
                                                </View>
                                            </View>
                                        ) : (
                                            <View style={s.emptyDocState}>
                                                <MaterialCommunityIcons name="camera-plus-outline" size={32} color={EMERALD_THEME.textDim} />
                                                <Text style={s.uploadHint}>Chụp hoặc chọn ảnh</Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* Footer Form Action */}
                <View style={s.footer}>
                    <OTPProtectedAction
                        actionType={OtpActionType.LOAN_CREATE}
                        actionData={{ capital, periodMonth, productId: product.id }}
                        onExecute={handleApply}
                        requireOTP
                        title="Xác thực phân đoạn"
                        description="Nhập mã OTP để xác nhận tạo khoản vay"
                    >
                        {({ trigger, isLoading, isInitialized }) => {
                            otpTriggerRef.current = trigger;
                            const handlePress = () => {
                                if (!selectedWallet) { Alert.alert('Lỗi', 'Vui lòng chọn ví nhận giải ngân'); return; }
                                if (policies.length > 0 && !policyAgreed) { Alert.alert('Lỗi', 'Vui lòng đọc và đồng ý điều khoản xử lý nợ quá hạn'); return; }
                                const requiredMissing = documentTypes.filter((d) => d.required && !documents[d.id]?.name);
                                if (requiredMissing.length > 0) {
                                    Alert.alert('Lỗi', `Thiếu tài liệu: ${requiredMissing.map((d) => d.name).join(', ')}`);
                                    return;
                                }
                                setShowPinVerify(true);
                            };
                            const isDisabled = submitting || !selectedWallet || isLoading || !isInitialized || (policies.length > 0 && !policyAgreed);
                            return (
                                <TouchableOpacity
                                    style={[s.submitBtn, { backgroundColor: isDisabled ? (theme.mode === 'dark' ? EMERALD_THEME.surfaceHigh : 'rgba(0,0,0,0.06)') : EMERALD_THEME.primary }]}
                                    onPress={handlePress}
                                    disabled={isDisabled}
                                    activeOpacity={0.85}
                                >
                                    {submitting || isLoading ? (
                                        <ActivityIndicator size="small" color={EMERALD_THEME.onPrimary} />
                                    ) : (
                                        <Text style={[s.submitBtnText, { color: isDisabled ? (theme.mode === 'dark' ? EMERALD_THEME.textDim : 'rgba(0,0,0,0.3)') : EMERALD_THEME.onPrimary }]}>
                                            Xác nhận & gửi đơn
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            );
                        }}
                    </OTPProtectedAction>
                </View>

                <View style={{ height: 40 }} />


                <WalletSelectorModal
                    visible={showWalletModal}
                    onClose={() => setShowWalletModal(false)}
                    wallets={wallets}
                    selectedWalletId={selectedWallet?.id ?? selectedWallet?._id}
                    onSelect={setSelectedWallet}
                    title="Chọn ví nhận giải ngân"
                />

                <ImagePickerSheet
                    visible={imagePickerVisible}
                    onClose={() => { setImagePickerVisible(false); setImagePickerDocId(null); }}
                    onSelect={handleImagePicked}
                    title="Tải tài liệu lên"
                    allowCamera
                    quality={0.8}
                />

                <PinVerifyModal
                    visible={showPinVerify}
                    dismissable
                    onCancel={() => setShowPinVerify(false)}
                    onSuccess={() => {
                        setShowPinVerify(false);
                        setTimeout(() => otpTriggerRef.current?.(), 300);
                    }}
                    onForgotPin={() => { setShowPinVerify(false); (navigation as any).navigate('PinChange', { resetMode: true }); }}
                    title="Xác thực mã PIN"
                    subtitle="Nhập mã PIN để tiếp tục giao dịch an toàn"
                />

            </ScrollView>
        </View >
    );
}

// ═══════════════════════════════════════════════════════════
//  STYLES — Emerald Night
// ═══════════════════════════════════════════════════════════
const getStyles = (EMERALD_THEME: any) => StyleSheet.create({
    container: { flex: 1 },

    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 24, gap: 16 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    card: { backgroundColor: EMERALD_THEME.surface, borderRadius: 20, padding: 20 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: EMERALD_THEME.textDim, letterSpacing: 1, marginBottom: 16 },

    // Hero Vault
    heroVaultCard: {
        backgroundColor: EMERALD_THEME.background,
        borderRadius: 24, padding: 24,
        alignItems: 'center',
        borderWidth: 1, borderColor: EMERALD_THEME.border, // subtle highlight
    },
    heroLabel: { fontSize: 12, fontWeight: '700', color: EMERALD_THEME.textDim, letterSpacing: 1.5, marginBottom: 8 },
    heroAmount: { fontSize: 28, fontWeight: '700', color: EMERALD_THEME.primary, letterSpacing: -0.3, marginBottom: 20 },

    heroGrid: { flexDirection: 'row', width: '100%', alignItems: 'center', marginBottom: 24 },
    heroCol: { flex: 1, alignItems: 'center' },
    heroColLabel: { fontSize: 10, fontWeight: '700', color: EMERALD_THEME.textDim, letterSpacing: 1, marginBottom: 4 },
    heroColValue: { fontSize: 14, fontWeight: '700', color: EMERALD_THEME.textPrimary },
    heroDivider: { width: 1, height: 24, backgroundColor: EMERALD_THEME.border },

    heroTotalBox: {
        width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 16, borderTopWidth: 1, borderTopColor: EMERALD_THEME.border,
    },
    heroTotalLabel: { fontSize: 13, fontWeight: '600', color: EMERALD_THEME.textSecondary },
    heroTotalValue: { fontSize: 16, fontWeight: '700', color: EMERALD_THEME.textPrimary },

    // Fees
    feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
    feeLabelBlock: { flex: 1, paddingRight: 12 },
    feeName: { fontSize: 14, fontWeight: '600', color: EMERALD_THEME.textPrimary },
    feeNote: { fontSize: 12, color: EMERALD_THEME.textDim, marginTop: 2 },
    feeValueBlock: { alignItems: 'flex-end' },
    feeRate: { fontSize: 14, fontWeight: '700', color: EMERALD_THEME.textPrimary },
    feeAmountText: { fontSize: 12, color: EMERALD_THEME.textSecondary, marginTop: 2 },

    // Schedule
    scheduleTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    expandBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    expandText: { fontSize: 12, fontWeight: '600', color: EMERALD_THEME.primary },
    tableHeader: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4, marginBottom: 8 },
    tableHeaderText: { fontSize: 11, fontWeight: '700', color: EMERALD_THEME.textDim, textTransform: 'uppercase', letterSpacing: 0.5 },
    tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderRadius: 8 },
    colKy: { width: 44, alignItems: 'center' },
    colGoc: { flex: 1.1, textAlign: 'right' },
    colLai: { flex: 1, textAlign: 'right' },
    colTong: { flex: 1.1, textAlign: 'right' },

    tableRowText: { fontSize: 13, fontWeight: '500', color: EMERALD_THEME.textPrimary, textAlign: 'right' },
    tableRowTextBold: { fontSize: 13, fontWeight: '700', color: EMERALD_THEME.primary, textAlign: 'right' },

    periodCircle: { width: 28, height: 28, borderRadius: 8, backgroundColor: EMERALD_THEME.surfaceHigh, justifyContent: 'center', alignItems: 'center' },
    periodCircleText: { fontSize: 12, fontWeight: '700', color: EMERALD_THEME.textPrimary },

    showMoreBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
    showMoreText: { fontSize: 13, fontWeight: '600', color: EMERALD_THEME.primary },

    // Wallet
    walletSelect: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: EMERALD_THEME.surfaceHigh,
        backgroundColor: EMERALD_THEME.background,
    },
    walletIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: EMERALD_THEME.surfaceHigh, justifyContent: 'center', alignItems: 'center' },
    walletInfo: { flex: 1 },
    walletName: { fontSize: 15, fontWeight: '700', color: EMERALD_THEME.textPrimary },
    walletNo: { fontSize: 12, color: EMERALD_THEME.textSecondary, marginTop: 4 },
    walletPlaceholder: { flex: 1, fontSize: 14, color: EMERALD_THEME.textDim },
    defaultBadge: { backgroundColor: EMERALD_THEME.primary + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    defaultBadgeText: { fontSize: 10, fontWeight: '800', color: EMERALD_THEME.primary },

    // Docs
    docSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    docRow: { paddingTop: 16, marginTop: 16, borderTopWidth: 1, borderTopColor: EMERALD_THEME.border },
    docHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    docIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: EMERALD_THEME.surfaceHigh, justifyContent: 'center', alignItems: 'center' },
    docNameBlock: { flex: 1 },
    docName: { fontSize: 14, fontWeight: '600', color: EMERALD_THEME.textPrimary },
    docDesc: { fontSize: 12, color: EMERALD_THEME.textSecondary, marginTop: 2 },
    badgeRequired: { backgroundColor: '#93000a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    badgeRequiredText: { color: '#ffb4ab', fontSize: 10, fontWeight: '700' },
    badgeOptional: { backgroundColor: EMERALD_THEME.surfaceHigh, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    badgeOptionalText: { color: EMERALD_THEME.textSecondary, fontSize: 10, fontWeight: '600' },

    bigCameraBtn: {
        width: '100%', height: 110, borderRadius: 12,
        backgroundColor: EMERALD_THEME.background,
        borderWidth: 1.5, borderColor: EMERALD_THEME.surfaceHigh, borderStyle: 'dashed',
        justifyContent: 'center', alignItems: 'center', overflow: 'hidden'
    },
    emptyDocState: { alignItems: 'center', gap: 8 },
    uploadHint: { fontSize: 13, fontWeight: '500', color: EMERALD_THEME.textDim },
    docThumbnailWrap: { width: '100%', height: '100%', position: 'relative' },
    docThumbnail: { width: '100%', height: '100%', resizeMode: 'cover' },
    docThumbnailOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', gap: 4 },
    docThumbnailText: { color: '#fff', fontSize: 12, fontWeight: '600' },

    // Footer
    footer: {
        width: '100%',
        paddingVertical: 16,
        paddingHorizontal: 0,
    },
    submitBtn: {
        width: '100%',
        paddingVertical: 18, borderRadius: 100,
        justifyContent: 'center', alignItems: 'center',
    },
    submitBtnText: { fontSize: 16, fontWeight: '700' },
});
