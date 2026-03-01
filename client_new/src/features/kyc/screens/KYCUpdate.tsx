import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    Image,
    ScrollView,
    ActivityIndicator,
    LogBox,
    Linking,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../../contexts/ThemeContext';
import { kycService } from '../services/kyc.service';

LogBox.ignoreLogs([
    'Non-serializable values were found in the navigation state',
]);
import { themes } from '../../../theme/themes';

const theme = themes.dark; // Using dark theme as requested for premium feel

enum KYCStep {
    FRONT_ID = 0,
    BACK_ID = 1,
    FACE_MATCHING = 2,
    CONFIRMATION = 3,
}

const KYCUpdate: React.FC = () => {
    const navigation = useNavigation<any>();
    const [currentStep, setCurrentStep] = useState<KYCStep>(KYCStep.FRONT_ID);
    const [frontImage, setFrontImage] = useState<string | null>(null);
    const [backImage, setBackImage] = useState<string | null>(null);
    const [portraitImages, setPortraitImages] = useState<string[]>([]);
    const [ocrData, setOcrData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [isFaceVerified, setIsFaceVerified] = useState(false);

    const steps = [
        { label: 'Mặt trước', icon: 'card-outline' },
        { label: 'Mặt sau', icon: 'card' },
        { label: 'Khuôn mặt', icon: 'person-outline' },
        { label: 'Xác nhận', icon: 'checkmark-done' },
    ];

    const processImageResult = (result: ImagePicker.ImagePickerResult, type: 'front' | 'back') => {
        if (!result.canceled && result.assets && result.assets[0].uri) {
            const uri = result.assets[0].uri;
            if (type === 'front') {
                setFrontImage(uri);
                handleOCRFront(uri);
            } else {
                setBackImage(uri);
                handleOCRBack(uri);
            }
        }
    };

    const captureImage = async (type: 'front' | 'back') => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert(
                'Quyền truy cập camera',
                `Vui lòng cho phép truy cập camera trong cài đặt ${Platform.OS === 'ios' ? 'iOS' : 'Android'} để chụp ảnh CCCD.`,
                [
                    { text: 'Quay lại', style: 'cancel' },
                    { text: 'Mở cài đặt', onPress: () => Linking.openSettings() },
                ]
            );
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: 'images',
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
        });
        processImageResult(result, type);
    };

    const selectFromGallery = async (type: 'front' | 'back') => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: 'images',
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
        });
        processImageResult(result, type);
    };

    const selectFromFile = async (type: 'front' | 'back') => {
        const result = await DocumentPicker.getDocumentAsync({
            type: 'image/*',
            copyToCacheDirectory: true,
        });

        if (!result.canceled && result.assets && result.assets[0].uri) {
            const uri = result.assets[0].uri;
            if (type === 'front') {
                setFrontImage(uri);
                handleOCRFront(uri);
            } else {
                setBackImage(uri);
                handleOCRBack(uri);
            }
        }
    };

    const pickImage = (type: 'front' | 'back') => {
        Alert.alert(
            'Chọn ảnh',
            'Vui lòng chọn nguồn ảnh',
            [
                { text: 'Hủy', style: 'cancel' },
                { text: 'Chụp ảnh mới', onPress: () => captureImage(type) },
                { text: 'Chọn từ thư viện', onPress: () => selectFromGallery(type) },
                { text: 'Chọn từ tệp', onPress: () => selectFromFile(type) },
            ]
        );
    };

    const handleOCRFront = async (uri: string) => {
        setLoading(true);
        try {
            const res = await kycService.ocrFrontID(uri);
            if (res && res.success) {
                let payload = res.data;
                let dataToMerge = Array.isArray(payload) ? payload[0] : (payload?.result || payload?.data || payload);
                if (Array.isArray(dataToMerge)) dataToMerge = dataToMerge[0];
                if (dataToMerge?.result) dataToMerge = dataToMerge.result;

                // Map fields from FPT AI format (fullName, idNumber) to UI format (name, id)
                const name = dataToMerge?.fullName || dataToMerge?.name;
                const id = dataToMerge?.idNumber || dataToMerge?.id;

                const mappedData = {
                    ...dataToMerge,
                    name,
                    id,
                };

                console.log('[KYC] Front ID OCR result:', mappedData);
                // Ensure state is completely replaced for top level keys to force re-render
                setOcrData((prev: any) => {
                    const newState = { ...prev };
                    if (name) newState.name = name;
                    if (id) newState.id = id;
                    if (dataToMerge?.dob) newState.dob = dataToMerge.dob;
                    if (dataToMerge?.address) newState.address = dataToMerge.address;
                    if (dataToMerge?.gender) newState.gender = dataToMerge.gender;
                    if (dataToMerge?.nationality) newState.nationality = dataToMerge.nationality;
                    if (dataToMerge?.birthplace) newState.birthplace = dataToMerge.birthplace;
                    return newState;
                });
            } else {
                Alert.alert('Lỗi OCR', res.error || 'Không thể nhận diện mặt trước');
            }
        } catch (err) {
            Alert.alert('Lỗi', 'Không thể kết nối máy chủ');
        } finally {
            setLoading(false);
        }
    };

    /** Map Back OCR response (Python eKYC old/new format) to UI format */
    const mapBackOCRToUI = (raw: any): { issueDate?: string; issueLoc?: string; expiryDate?: string; placeOfBirth?: string; address?: string } => {
        if (!raw) return {};
        let d: any = raw?.result ?? raw?.data ?? raw;
        if (Array.isArray(d)) d = d[0];
        if (d?.result) d = d.result;
        if (d?.data && typeof d.data === 'object' && !Array.isArray(d.data)) {
            d = { ...d, ...d.data };
        }
        const pick = (...keys: string[]): string | undefined => {
            for (const k of keys) {
                const v = d?.[k];
                if (v != null && String(v).trim() !== '') return String(v).trim();
            }
            return undefined;
        };
        return {
            issueDate: pick('issueDate', 'issue_date', 'init_date', 'cdate_of_issue', 'Date of issue'),
            issueLoc: pick('issueLoc', 'issue_loc', 'place_of_issue', 'place', 'Issuer'),
            expiryDate: pick('expiryDate', 'expiry_date', 'cdate_of_expiry', 'Date of expirty'),
            placeOfBirth: pick('placeOfBirth', 'place_of_birth', 'cplace_of_birth'),
            address: pick('address', 'address_1', 'address_2'),
        };
    };

    const handleOCRBack = async (uri: string) => {
        setLoading(true);
        try {
            const res = await kycService.ocrBackID(uri);

            const isSuccess = res && (res.success === true || res.errorCode === 0 || res.errorCode === "0");

            if (isSuccess) {
                const payload = res.data ?? res;
                const mapped = mapBackOCRToUI(payload);
                console.log('[KYC] Back ID OCR mapped:', mapped);
                setOcrData((prev: any) => ({
                    ...prev,
                    ...mapped,
                }));
            } else {
                const errorMsg = res?.errorMessage || res?.error || res?.message || 'Không thể nhận diện mặt sau';
                Alert.alert('Lỗi OCR', errorMsg);
            }
        } catch (err) {
            Alert.alert('Lỗi', 'Không thể kết nối máy chủ');
        } finally {
            setLoading(false);
        }
    };

    const startFaceMatching = () => {
        navigation.navigate('FaceDetection', {
            onVerify: async (result: { images: { uri: string }[] }) => {
                const uris = result.images.map((img) => img.uri);
                setPortraitImages(uris);
                if (frontImage) {
                    try {
                        const matchRes = await kycService.processFaceMatching(uris, frontImage);
                        const ok = matchRes?.success && matchRes?.face_matching;
                        const okAlt = matchRes?.data?.success && matchRes?.data?.face_matching;
                        const passed = ok || okAlt;
                        if (passed) {
                            setIsFaceVerified(true);
                            return { success: true };
                        } else {
                            return { success: false, error: matchRes?.error || matchRes?.data?.error || 'Khuôn mặt không khớp với ảnh CCCD' };
                        }
                    } catch (err) {
                        return { success: false, error: 'Lỗi xác thực hệ thống' };
                    }
                }
                return { success: false, error: 'Thiếu ảnh mặt trước CCCD' };
            },
            onSave: () => {
                setCurrentStep(KYCStep.CONFIRMATION);
            },
        });
    };

    const handleNext = () => {
        if (currentStep === KYCStep.FRONT_ID && !frontImage) {
            Alert.alert('Thông báo', 'Vui lòng chụp ảnh mặt trước CCCD');
            return;
        }
        if (currentStep === KYCStep.BACK_ID && !backImage) {
            Alert.alert('Thông báo', 'Vui lòng chụp ảnh mặt sau CCCD');
            return;
        }
        if (currentStep === KYCStep.FACE_MATCHING && !isFaceVerified) {
            startFaceMatching();
            return;
        }

        if (currentStep < KYCStep.CONFIRMATION) {
            setCurrentStep(currentStep + 1);
        } else {
            handleFinalSubmit();
        }
    };

    const handleFinalSubmit = async () => {
        if (!frontImage || !backImage || !ocrData) {
            Alert.alert('Lỗi', 'Thông tin hồ sơ không đầy đủ');
            return;
        }

        setLoading(true);
        try {
            const res = await kycService.saveKYC(
                frontImage,
                backImage,
                {
                    frontOCRData: ocrData,
                    backOCRData: ocrData, // Depending on how you want to structure it, for now we pass the combined
                    faceMatchingResult: { success: true },
                    livenessResult: { success: true },
                }
            );

            if (res?.success) {
                Alert.alert('Hoàn tất', res.message || 'Hồ sơ eKYC của bạn đã được gửi đi và đang chờ phê duyệt.', [
                    { text: 'OK', onPress: () => navigation.goBack() },
                ]);
            } else {
                Alert.alert('Lỗi', res?.message || 'Không thể gửi hồ sơ');
            }
        } catch (error: any) {
            Alert.alert('Lỗi', error.message || 'Lỗi kết nối máy chủ khi lữu trữ eKYC');
        } finally {
            setLoading(false);
        }
    };

    const renderStepContent = () => {
        switch (currentStep) {
            case KYCStep.FRONT_ID:
                return (
                    <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
                        <Text style={styles.stepTitle}>Chụp mặt trước CCCD</Text>
                        <Text style={[styles.stepSubtitle, { color: theme.colors.textSecondary }]}>Ảnh mặt trước (có ảnh, họ tên, số CCCD)</Text>
                        <TouchableOpacity style={styles.imagePlaceholder} onPress={() => pickImage('front')}>
                            {frontImage ? (
                                <Image source={{ uri: frontImage }} style={styles.capturedImage} />
                            ) : (
                                <Ionicons name="camera-outline" size={50} color={theme.colors.textSecondary} />
                            )}
                        </TouchableOpacity>
                        {ocrData && currentStep === KYCStep.FRONT_ID && (
                            <View style={styles.ocrPreview}>
                                <Text style={styles.ocrText}>Họ tên: {ocrData.name || '---'}</Text>
                                <Text style={styles.ocrText}>Số CCCD: {ocrData.id || '---'}</Text>
                                <Text style={styles.ocrText}>Ngày sinh: {ocrData.dob || '---'}</Text>
                                <Text style={styles.ocrText}>Giới tính: {ocrData.gender || '---'}</Text>
                                <Text style={styles.ocrText}>Quốc tịch: {ocrData.nationality || '---'}</Text>
                                <Text style={styles.ocrText}>Quê quán: {ocrData.birthplace || '---'}</Text>
                                <Text style={styles.ocrText}>Địa chỉ: {ocrData.address || '---'}</Text>
                            </View>
                        )}
                    </ScrollView>
                );
            case KYCStep.BACK_ID:
                return (
                    <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
                        <Text style={styles.stepTitle}>Chụp mặt sau CCCD</Text>
                        <Text style={[styles.stepSubtitle, { color: theme.colors.textSecondary }]}>Ảnh mặt sau (có ngày cấp, nơi cấp)</Text>
                        <TouchableOpacity style={styles.imagePlaceholder} onPress={() => pickImage('back')}>
                            {backImage ? (
                                <Image source={{ uri: backImage }} style={styles.capturedImage} />
                            ) : (
                                <Ionicons name="camera-outline" size={50} color={theme.colors.textSecondary} />
                            )}
                        </TouchableOpacity>
                        {ocrData && currentStep === KYCStep.BACK_ID && (
                            <View style={styles.ocrPreview}>
                                <Text style={styles.ocrText}>Ngày cấp: {ocrData.issueDate || '---'}</Text>
                                <Text style={styles.ocrText}>Nơi cấp: {ocrData.issueLoc || '---'}</Text>
                                <Text style={styles.ocrText}>Ngày hết hạn: {ocrData.expiryDate || '---'}</Text>
                                <Text style={styles.ocrText}>Nơi sinh: {ocrData.placeOfBirth || '---'}</Text>
                            </View>
                        )}
                    </ScrollView>
                );
            case KYCStep.FACE_MATCHING:
                return (
                    <View style={styles.stepContainer}>
                        <Text style={styles.stepTitle}>Xác thực khuôn mặt</Text>
                        <View style={styles.faceIconContainer}>
                            <Ionicons
                                name={isFaceVerified ? 'checkmark-circle' : 'scan-outline'}
                                size={100}
                                color={isFaceVerified ? theme.colors.success : theme.colors.primary}
                            />
                        </View>
                        <Text style={styles.faceInstruction}>
                            Chụp ảnh khuôn mặt để đối soát với ảnh trên CCCD
                        </Text>
                        {!isFaceVerified && (
                            <TouchableOpacity style={styles.startButton} onPress={startFaceMatching}>
                                <Text style={styles.buttonText}>Bắt đầu xác thực</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                );
            case KYCStep.CONFIRMATION:
                return (
                    <View style={styles.stepContainer}>
                        <Text style={styles.stepTitle}>Kiểm tra thông tin</Text>
                        <ScrollView style={styles.infoScroll}>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Họ và tên</Text>
                                <Text style={styles.infoValue}>{ocrData?.name || '---'}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Số hiệu</Text>
                                <Text style={styles.infoValue}>{ocrData?.id || '---'}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Ngày sinh</Text>
                                <Text style={styles.infoValue}>{ocrData?.dob || '---'}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Giới tính</Text>
                                <Text style={styles.infoValue}>{ocrData?.gender || '---'}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Quốc tịch</Text>
                                <Text style={styles.infoValue}>{ocrData?.nationality || '---'}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Quê quán</Text>
                                <Text style={styles.infoValue}>{ocrData?.birthplace || '---'}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Địa chỉ</Text>
                                <Text style={styles.infoValue}>{ocrData?.address || '---'}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Ngày cấp</Text>
                                <Text style={styles.infoValue}>{ocrData?.issueDate || '---'}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Nơi cấp</Text>
                                <Text style={styles.infoValue}>{ocrData?.issueLoc || '---'}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Ngày hết hạn</Text>
                                <Text style={styles.infoValue}>{ocrData?.expiryDate || '---'}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Nơi sinh</Text>
                                <Text style={styles.infoValue}>{ocrData?.placeOfBirth || '---'}</Text>
                            </View>
                            <View style={styles.statusBox}>
                                <Ionicons name="shield-checkmark" size={24} color={theme.colors.success} />
                                <Text style={[styles.statusText, { color: theme.colors.success }]}>
                                    Khuôn mặt đã được xác thực
                                </Text>
                            </View>
                        </ScrollView>
                    </View>
                );
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Xác minh danh tính</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={styles.progressContainer}>
                {steps.map((step, idx) => (
                    <View key={idx} style={styles.stepIndicatorWrapper}>
                        <View
                            style={[
                                styles.stepCircle,
                                idx <= currentStep ? styles.activeStepCircle : styles.inactiveStepCircle,
                            ]}
                        >
                            <Ionicons
                                name={step.icon as any}
                                size={18}
                                color={idx <= currentStep ? theme.colors.background : theme.colors.textSecondary}
                            />
                        </View>
                        <Text
                            style={[
                                styles.stepLabel,
                                { color: idx <= currentStep ? theme.colors.text : theme.colors.textSecondary },
                            ]}
                        >
                            {step.label}
                        </Text>
                    </View>
                ))}
            </View>

            <View style={styles.content}>{renderStepContent()}</View>

            <View style={styles.footer}>
                <TouchableOpacity style={styles.nextButton} onPress={handleNext} disabled={loading}>
                    {loading ? (
                        <ActivityIndicator color={theme.colors.background} />
                    ) : (
                        <Text style={styles.nextButtonText}>
                            {currentStep === KYCStep.CONFIRMATION ? 'Gửi hồ sơ' : 'Tiếp theo'}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    progressContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    stepIndicatorWrapper: {
        alignItems: 'center',
    },
    stepCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 4,
    },
    activeStepCircle: {
        backgroundColor: theme.colors.primary,
    },
    inactiveStepCircle: {
        backgroundColor: theme.colors.backgroundTertiary,
    },
    stepLabel: {
        fontSize: 10,
    },
    content: {
        flex: 1,
        padding: 24,
    },
    stepScroll: {
        flex: 1,
    },
    stepContainer: {
        alignItems: 'center',
        paddingBottom: 24,
    },
    stepTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 8,
    },
    stepSubtitle: {
        fontSize: 14,
        marginBottom: 20,
        textAlign: 'center',
    },
    imagePlaceholder: {
        width: '100%',
        aspectRatio: 1.6,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: theme.colors.border,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
    },
    capturedImage: {
        width: '100%',
        height: '100%',
    },
    footer: {
        padding: 24,
    },
    nextButton: {
        backgroundColor: theme.colors.primary,
        paddingVertical: 16,
        borderRadius: 30,
        alignItems: 'center',
    },
    nextButtonText: {
        color: theme.colors.background,
        fontSize: 16,
        fontWeight: 'bold',
    },
    ocrPreview: {
        marginTop: 20,
        width: '100%',
        padding: 16,
        backgroundColor: theme.colors.surface,
        borderRadius: 8,
    },
    ocrText: {
        color: theme.colors.text,
        fontSize: 14,
        marginBottom: 4,
    },
    faceIconContainer: {
        marginTop: 40,
        marginBottom: 20,
    },
    faceInstruction: {
        color: theme.colors.textSecondary,
        textAlign: 'center',
        paddingHorizontal: 40,
        marginBottom: 40,
    },
    startButton: {
        borderWidth: 1,
        borderColor: theme.colors.primary,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 25,
    },
    buttonText: {
        color: theme.colors.primary,
        fontWeight: 'bold',
    },
    infoScroll: {
        width: '100%',
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    infoLabel: {
        color: theme.colors.textSecondary,
        fontSize: 14,
    },
    infoValue: {
        color: theme.colors.text,
        fontSize: 14,
        fontWeight: '600',
    },
    statusBox: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.successGlass,
        padding: 16,
        borderRadius: 12,
        marginTop: 20,
        marginBottom: 30,
        gap: 10,
    },
    statusText: {
        fontWeight: 'bold',
        fontSize: 14,
    },
});

export default KYCUpdate;
