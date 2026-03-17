import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    TextInput,
    LayoutAnimation,
    Platform,
    UIManager,
    Image,
    Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useRoute, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, CommonCard, OTPProtectedAction, PinVerifyModal } from '../../../components';
import ImagePickerSheet from '../../../components/common/ImagePickerSheet';
import { loanService, LoanProduct, LoanProductConfig, LoanScheduleResult, LoanDocumentType, ProductCharge } from '../services/loan.service';
import { walletAPI } from '../../wallet/api/wallet.api';
import { formatCurrency } from '../../../shared/utils';
import { WalletSelectorModal } from '../../wallet/components/WalletSelectorModal';
import type { Wallet } from '../../../types/auth.types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { OtpActionType } from '../../../types/otp.types';

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

// ── Step indicator: đồng bộ với LoanCreateScreen ────────────────────────────
function StepIndicator({ current, theme }: { current: number; theme: any }) {
    const c = theme.colors;
    return (
        <View style={stepStyles.container}>
            <View style={stepStyles.stepsRow}>
                {[0, 1].map((i) => (
                    <React.Fragment key={i}>
                        <View style={[
                            stepStyles.dot,
                            i <= current
                                ? { backgroundColor: c.primary }
                                : { backgroundColor: c.border + '60' },
                        ]}>
                            {i < current ? (
                                <MaterialCommunityIcons name="check" size={11} color="#fff" />
                            ) : (
                                <Text style={[stepStyles.dotText, i <= current && { color: '#000' }]}>{i + 1}</Text>
                            )}
                        </View>
                        {i < 1 && (
                            <View style={[
                                stepStyles.connector,
                                i < current
                                    ? { backgroundColor: c.primary }
                                    : { backgroundColor: c.border + '40' },
                            ]} />
                        )}
                    </React.Fragment>
                ))}
            </View>
            <Text style={[stepStyles.label, { color: c.textPrimary }]}>
                {current === 0 ? 'Nhập thông tin vay' : 'Xác nhận & gửi đơn'}
            </Text>
        </View>
    );
}

const stepStyles = StyleSheet.create({
    container: { paddingHorizontal: 20, paddingVertical: 14, gap: 6 },
    stepsRow: { flexDirection: 'row', alignItems: 'center' },
    dot: {
        width: 24, height: 24, borderRadius: 12,
        justifyContent: 'center', alignItems: 'center',
    },
    dotText: { fontSize: 11, fontWeight: '700', color: '#999' },
    connector: { height: 2, flex: 1, marginHorizontal: 8, borderRadius: 1 },
    label: { fontSize: 15, fontWeight: '600', marginTop: 2 },
});

export default function LoanConfirmScreen() {
    const { theme } = useTheme();
    const route = useRoute();
    const navigation = useNavigation<LoanConfirmNav>();
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

    // PIN verification trước OTP
    const [showPinVerify, setShowPinVerify] = useState(false);
    const otpTriggerRef = useRef<(() => void) | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const [docTypes, walletRes, productCharges] = await Promise.all([
                loanService.getDocumentTypesByProduct(product.id),
                walletAPI.getWallets(),
                loanService.getProductCharges(product.id),
            ]);
            setDocumentTypes(docTypes);
            setCharges(productCharges);
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

            // Upload documents one by one if they have URI
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
                // We don't necessarily need to wait for all if we want to show success fast,
                // but for consistency let's wait.
                await Promise.all(uploadPromises);
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            navigation.replace('LoanApplySuccess', {
                capital,
                periodMonth,
                entirelyPay: result.entirelyPay,
            });
        } catch (e: any) {
            Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể tạo đơn vay');
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
            <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
                <BinanceHeader showBack title="Xác nhận đơn vay" />
                <View style={styles.centered}><Text style={{ color: theme.colors.textSecondary }}>Thiếu thông tin</Text></View>
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
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <BinanceHeader showBack title="Xác nhận đơn vay" />
            <StepIndicator current={1} theme={theme} />

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* ── Hero: Tóm tắt chính ── */}
                <View style={[styles.heroSummary, { backgroundColor: theme.colors.primary }]}>
                    <Text style={styles.heroLabel}>Số tiền vay</Text>
                    <Text style={styles.heroAmount}>{formatCurrency(capital)}</Text>
                    <View style={styles.heroRow}>
                        <View style={styles.heroItem}>
                            <Text style={styles.heroItemLabel}>Kỳ hạn</Text>
                            <Text style={styles.heroItemValue}>{periodMonth} tháng</Text>
                        </View>
                        <View style={[styles.heroSeparator]} />
                        <View style={styles.heroItem}>
                            <Text style={styles.heroItemLabel}>Lãi suất</Text>
                            <Text style={styles.heroItemValue}>{effectiveRate}%/{rateUnit}</Text>
                        </View>
                        <View style={[styles.heroSeparator]} />
                        <View style={styles.heroItem}>
                            <Text style={styles.heroItemLabel}>Trả/tháng</Text>
                            <Text style={styles.heroItemValue}>{formatCurrency(schedule.monthlyPay)}</Text>
                        </View>
                    </View>
                    <View style={[styles.heroTotalRow, { borderTopColor: 'rgba(255,255,255,0.3)' }]}>
                        <Text style={styles.heroTotalLabel}>Tổng trả</Text>
                        <Text style={styles.heroTotalValue}>{formatCurrency(schedule.entirelyPay)}</Text>
                    </View>
                </View>

                {/* ── Phí (nếu có) ── */}
                {charges.length > 0 && (
                    <CommonCard style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Phí khoản vay</Text>
                        {charges.map((fee, idx) => {
                            const isPercent = /percent|amount/i.test(fee.chargeCalculationType);
                            const pct = fee.amount ?? 0;
                            // Nếu % → tính tiền cụ thể từ vốn
                            const feeAmountCalc = isPercent && capital > 0
                                ? Math.round(capital * pct / 100)
                                : null;
                            const isDisbursement = /disbursement/i.test(fee.chargeTimeType);
                            const isLast = idx === charges.length - 1;
                            return (
                                <View key={fee.id} style={[styles.feeRow, { borderBottomColor: theme.colors.border }, isLast && { borderBottomWidth: 0 }]}>
                                    <View style={styles.feeLabelBlock}>
                                        <Text style={[styles.feeName, { color: theme.colors.textPrimary }]}>{fee.name}</Text>
                                        {isDisbursement && (
                                            <Text style={[styles.feeNote, { color: theme.colors.textDim }]}>Thu khi giải ngân</Text>
                                        )}
                                    </View>
                                    <View style={styles.feeValueBlock}>
                                        <Text style={[styles.feeRate, { color: theme.colors.textPrimary }]}>
                                            {isPercent
                                                ? `${Number(pct).toFixed(2)}% gốc`
                                                : `${formatCurrency(pct)}`}
                                        </Text>
                                        {feeAmountCalc != null && (
                                            <Text style={[styles.feeAmountText, { color: theme.colors.textDim }]}>
                                                ≈ {formatCurrency(feeAmountCalc)}
                                            </Text>
                                        )}
                                    </View>
                                </View>
                            );
                        })}
                    </CommonCard>
                )}

                {/* ── Lịch trả (có thể thu gọn) ── */}
                {schedule.schedulePreview && schedule.schedulePreview.length > 0 && (
                    <CommonCard style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                        <View style={styles.scheduleTitleRow}>
                            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Lịch trả nợ</Text>
                            <TouchableOpacity style={[styles.expandBtn, { borderColor: theme.colors.border }]} onPress={toggleSchedule}>
                                <Text style={[styles.expandText, { color: theme.colors.primary }]}>
                                    {scheduleExpanded ? 'Thu gọn' : `Xem tất cả (${schedule.schedulePreview.length})`}
                                </Text>
                                <MaterialCommunityIcons
                                    name={scheduleExpanded ? 'chevron-up' : 'chevron-down'}
                                    size={16}
                                    color={theme.colors.primary}
                                />
                            </TouchableOpacity>
                        </View>

                        {/* Table header */}
                        <View style={[styles.tableHeader, { backgroundColor: theme.colors.background, borderRadius: 8 }]}>
                            <Text style={[styles.colKy, styles.tableHeaderText, { color: theme.colors.textDim }]}>Kỳ</Text>
                            <Text style={[styles.colGoc, styles.tableHeaderText, { color: theme.colors.textDim }]}>Gốc</Text>
                            <Text style={[styles.colLai, styles.tableHeaderText, { color: theme.colors.textDim }]}>Lãi</Text>
                            <Text style={[styles.colTong, styles.tableHeaderText, { color: theme.colors.textDim }]}>Tổng</Text>
                        </View>

                        {visibleRows.map((item, index) => (
                            <View
                                key={item.period}
                                style={[
                                    styles.tableRow,
                                    { borderBottomColor: theme.colors.border },
                                    index % 2 === 0 && { backgroundColor: theme.colors.surfaceLight || 'rgba(0,0,0,0.02)' },
                                ]}
                            >
                                <View style={[styles.colKy, { alignItems: 'center' }]}>
                                    <View style={[styles.periodCircle, { borderColor: theme.colors.primary + '40' }]}>
                                        <Text style={[styles.periodCircleText, { color: theme.colors.primary }]}>{item.period}</Text>
                                    </View>
                                </View>
                                <Text style={[styles.colGoc, styles.moneyText, { color: theme.colors.textPrimary }]}>
                                    {formatCurrency(item.principal)}
                                </Text>
                                <Text style={[styles.colLai, styles.moneyText, { color: theme.colors.textSecondary }]}>
                                    {formatCurrency(item.interest)}
                                </Text>
                                <Text style={[styles.colTong, styles.moneyTextBold, { color: theme.colors.primary }]}>
                                    {formatCurrency(item.total)}
                                </Text>
                            </View>
                        ))}

                        {!scheduleExpanded && schedule.schedulePreview.length > PREVIEW_ROWS && (
                            <TouchableOpacity style={styles.showMoreRow} onPress={toggleSchedule}>
                                <Text style={[styles.showMoreText, { color: theme.colors.primary }]}>
                                    + {schedule.schedulePreview.length - PREVIEW_ROWS} kỳ còn lại
                                </Text>
                            </TouchableOpacity>
                        )}
                    </CommonCard>
                )}

                {/* ── Cần làm: Chọn ví + Tài liệu ── */}
                <CommonCard style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Thông tin nhận giải ngân</Text>
                    {loading ? (
                        <ActivityIndicator color={theme.colors.primary} size="small" />
                    ) : (
                        <TouchableOpacity
                            style={[styles.walletSelect, { borderColor: selectedWallet ? theme.colors.primary : theme.colors.border }]}
                            onPress={() => setShowWalletModal(true)}
                        >
                            <View style={[styles.walletIconWrap, { backgroundColor: theme.colors.primary + '15' }]}>
                                <MaterialCommunityIcons name="wallet-outline" size={22} color={theme.colors.primary} />
                            </View>
                            {selectedWallet ? (
                                <View style={styles.walletInfo}>
                                    <Text style={[styles.walletName, { color: theme.colors.textPrimary }]}>
                                        {selectedWallet.productName || selectedWallet.metadata?.productName || 'Ví điện tử'}
                                    </Text>
                                    <Text style={[styles.walletNo, { color: theme.colors.textDim }]}>
                                        {selectedWallet.accountNo || selectedWallet.fineractId || 'N/A'}
                                    </Text>
                                </View>
                            ) : (
                                <Text style={[styles.walletPlaceholder, { color: theme.colors.textDim }]}>Chọn ví nhận giải ngân</Text>
                            )}
                            {selectedWallet?.isDefault && (
                                <View style={[styles.defaultBadge, { backgroundColor: theme.colors.primary + '20' }]}>
                                    <Text style={[styles.defaultBadgeText, { color: theme.colors.primary }]}>Mặc định</Text>
                                </View>
                            )}
                            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textDim} />
                        </TouchableOpacity>
                    )}
                </CommonCard>

                {/* ── Tài liệu ── */}
                {documentTypes.length > 0 && (
                    <CommonCard style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                        <View style={styles.docSectionHeader}>
                            <MaterialCommunityIcons name="file-document-multiple-outline" size={20} color={theme.colors.primary} />
                            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary, marginBottom: 0 }]}>Tài liệu đính kèm</Text>
                        </View>
                        <Text style={[styles.docSectionHint, { color: theme.colors.textDim }]}>
                            Vui lòng cung cấp đầy đủ tài liệu yêu cầu
                        </Text>
                        {documentTypes.sort((a, b) => a.sortOrder - b.sortOrder).map((doc) => {
                            const hasValue = !!documents[doc.id]?.name;

                            return (
                                <View key={doc.id} style={[styles.docRow, { borderTopColor: theme.colors.border }]}>
                                    <View style={styles.docHeader}>
                                        <View style={[styles.docIconWrap, {
                                            backgroundColor: hasValue ? theme.colors.success + '15' : theme.colors.primary + '15',
                                        }]}>
                                            <MaterialCommunityIcons
                                                name={hasValue ? "check-circle" : "file-image-outline"}
                                                size={18}
                                                color={hasValue ? theme.colors.success : theme.colors.primary}
                                            />
                                        </View>
                                        <View style={styles.docNameBlock}>
                                            <Text style={[styles.docName, { color: theme.colors.textPrimary }]}>{doc.name}</Text>
                                            {doc.description ? (
                                                <Text style={[styles.docDesc, { color: theme.colors.textDim }]} numberOfLines={1}>{doc.description}</Text>
                                            ) : null}
                                        </View>
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

                                    <View style={styles.docUploadContainer}>
                                        <TouchableOpacity
                                            style={[styles.bigCameraBtn, {
                                                backgroundColor: theme.colors.primary + '06',
                                                borderColor: documents[doc.id]?.uri ? theme.colors.success : theme.colors.border,
                                            }]}
                                            onPress={() => pickImage(doc.id)}
                                        >
                                            {documents[doc.id]?.uri ? (
                                                <View style={styles.docThumbnailWrap}>
                                                    <Image source={{ uri: documents[doc.id]?.uri }} style={styles.docThumbnail} />
                                                    <View style={[styles.docThumbnailOverlay, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
                                                        <MaterialCommunityIcons name="pencil-circle" size={28} color="#fff" />
                                                        <Text style={styles.docThumbnailText}>Nhấn để thay đổi</Text>
                                                    </View>
                                                </View>
                                            ) : (
                                                <View style={styles.emptyDocState}>
                                                    <View style={[styles.docUploadIconCircle, { backgroundColor: theme.colors.primary + '15' }]}>
                                                        <MaterialCommunityIcons name="camera-plus-outline" size={28} color={theme.colors.primary} />
                                                    </View>
                                                    <Text style={[styles.uploadHint, { color: theme.colors.textDim }]}>Chụp ảnh hoặc chọn từ thư viện</Text>
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            );
                        })}
                    </CommonCard>
                )}

                {/* ── Submit (PIN + Smart OTP protected) ── */}
                <OTPProtectedAction
                    actionType={OtpActionType.LOAN_CREATE}
                    actionData={{ capital, periodMonth, productId: product.id }}
                    onExecute={handleApply}
                    requireOTP
                    title="Xác thực Smart OTP"
                    description="Nhập mã OTP để xác nhận tạo khoản vay"
                >
                    {({ trigger, isLoading, isInitialized }) => {
                        // Lưu trigger ref để gọi sau khi PIN thành công
                        otpTriggerRef.current = trigger;
                        const handlePress = () => {
                            if (!selectedWallet) {
                                Alert.alert('Lỗi', 'Vui lòng chọn ví nhận giải ngân');
                                return;
                            }
                            if (!(selectedWallet.id ?? selectedWallet._id)) {
                                Alert.alert('Lỗi', 'Ví không hợp lệ');
                                return;
                            }
                            const requiredMissing = documentTypes.filter((d) => d.required && !documents[d.id]?.name);
                            if (requiredMissing.length > 0) {
                                Alert.alert('Lỗi', `Vui lòng cung cấp tài liệu: ${requiredMissing.map((d) => d.name).join(', ')}`);
                                return;
                            }
                            // Bước 1: xác thực PIN trước
                            setShowPinVerify(true);
                        };
                        const isDisabled = submitting || !selectedWallet || isLoading || !isInitialized;
                        return (
                            <TouchableOpacity
                                style={[styles.submitBtn, { backgroundColor: isDisabled ? theme.colors.border : theme.colors.primary }]}
                                onPress={handlePress}
                                disabled={isDisabled}
                                activeOpacity={0.85}
                            >
                                {submitting || isLoading ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <MaterialCommunityIcons name="send-check-outline" size={20} color="#fff" />
                                )}
                                <Text style={[styles.submitBtnText, { color: isDisabled ? theme.colors.textDim : '#fff' }]}>
                                    {submitting || isLoading ? 'Đang gửi...' : 'Xác nhận đăng ký vay'}
                                </Text>
                            </TouchableOpacity>
                        );
                    }}
                </OTPProtectedAction>

                <View style={{ height: 40 }} />
            </ScrollView>

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
                title={imagePickerDocId ? (documentTypes.find(d => d.id === imagePickerDocId)?.name ?? 'Chọn ảnh') : 'Chọn ảnh'}
                allowCamera
                quality={0.85}
            />

            {/* ── PIN Verify Modal (trước OTP) ── */}
            <PinVerifyModal
                visible={showPinVerify}
                dismissable
                onCancel={() => setShowPinVerify(false)}
                onSuccess={() => {
                    setShowPinVerify(false);
                    // Bước 2: sau PIN thành công → trigger OTP
                    setTimeout(() => otpTriggerRef.current?.(), 300);
                }}
                title="Xác thực mã PIN"
                subtitle="Nhập mã PIN trước khi xác nhận khoản vay"
            />

        </View >
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 24 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    card: { padding: 16, marginBottom: 14, borderRadius: 16 },

    heroSummary: {
        borderRadius: 18,
        padding: 20,
        marginBottom: 14,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 6,
    },
    heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500', marginBottom: 4 },
    heroAmount: { color: '#fff', fontSize: 32, fontWeight: '800', marginBottom: 16 },
    heroRow: { flexDirection: 'row', width: '100%' },
    heroItem: { flex: 1, alignItems: 'center' },
    heroItemLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginBottom: 4 },
    heroItemValue: { color: '#fff', fontSize: 13, fontWeight: '700' },
    heroSeparator: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginVertical: 4 },
    heroTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
    heroTotalLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
    heroTotalValue: { color: '#fff', fontSize: 18, fontWeight: '800' },

    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },

    // Schedule
    scheduleTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    expandBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
    expandText: { fontSize: 12, fontWeight: '600' },
    tableHeader: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4, marginBottom: 4 },
    tableHeaderText: { fontSize: 12, fontWeight: '600' },
    tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 0.5 },
    colKy: { width: 40 },
    colGoc: { flex: 1.1 },
    colLai: { flex: 1 },
    colTong: { flex: 1 },
    moneyText: { fontSize: 12, textAlign: 'right' },
    moneyTextBold: { fontSize: 12, fontWeight: '700', textAlign: 'right' },
    periodCircle: {
        width: 26, height: 26, borderRadius: 13,
        borderWidth: 1.5, justifyContent: 'center', alignItems: 'center',
    },
    periodCircleText: { fontSize: 11, fontWeight: '700' },
    showMoreRow: { paddingVertical: 10, alignItems: 'center' },
    showMoreText: { fontSize: 13, fontWeight: '600' },

    // Wallet
    walletSelect: {
        flexDirection: 'row', alignItems: 'center',
        borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 12,
    },
    walletIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    walletInfo: { flex: 1 },
    walletName: { fontSize: 15, fontWeight: '600' },
    walletNo: { fontSize: 12, marginTop: 2 },
    walletPlaceholder: { flex: 1, fontSize: 14 },
    defaultBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginLeft: 4 },
    defaultBadgeText: { fontSize: 11, fontWeight: '700' },

    // Docs
    docSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    docSectionHint: { fontSize: 12, marginBottom: 12 },
    docRow: { paddingVertical: 14, borderTopWidth: 0.5 },
    docHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    docIconWrap: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    docNameBlock: { flex: 1 },
    docName: { fontSize: 14, fontWeight: '600' },
    docDesc: { fontSize: 11, marginTop: 2 },
    badgeRequired: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    badgeRequiredText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    badgeOptional: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    badgeOptionalText: { fontSize: 11, fontWeight: '600' },
    docUploadContainer: { marginTop: 4 },
    bigCameraBtn: {
        width: '100%',
        height: 130,
        borderRadius: 14,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden'
    },
    docUploadIconCircle: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
    emptyDocState: { alignItems: 'center', gap: 4 },
    uploadHint: { fontSize: 12, fontWeight: '500' },
    docThumbnailWrap: { width: '100%', height: '100%', position: 'relative' },
    docThumbnail: { width: '100%', height: '100%', resizeMode: 'cover' },
    docThumbnailOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    docThumbnailText: { color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 4 },
    // Text input field
    docTextInput: {
        borderWidth: 1.5,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        minHeight: 48,
        textAlignVertical: 'top',
    },
    // Select field (radio list)
    docSelectContainer: { gap: 8 },
    docSelectOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1.5,
    },
    docSelectText: { fontSize: 14 },
    // Button group field
    docButtonContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    docButton: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 10,
        borderWidth: 1.5,
    },
    docButtonText: { fontSize: 13 },

    // Submit
    submitBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 16, borderRadius: 14, marginTop: 4,
    },
    submitBtnText: { fontSize: 16, fontWeight: '700' },

    feeRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 10, borderBottomWidth: 0.5,
    },
    feeLabelBlock: { flex: 1, paddingRight: 12 },
    feeName: { fontSize: 14, fontWeight: '500' },
    feeNote: { fontSize: 11, marginTop: 2 },
    feeValueBlock: { alignItems: 'flex-end', minWidth: 110 },
    feeRate: { fontSize: 13, fontWeight: '600' },
    feeAmountText: { fontSize: 12, marginTop: 2 },

});
