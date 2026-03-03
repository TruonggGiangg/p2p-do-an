import React, { useState, useCallback, useMemo } from 'react';
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
    Platform,
    Dimensions,
    Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../../contexts/ThemeContext';
import { kycService } from '../services/kyc.service';
import { KYCStepIndicator, KYCInfoCard } from '../index';
import { CommonButton } from '../../../components/common/CommonButton';
import { CommonCard } from '../../../components/common/CommonCard';
import ImagePickerSheet from '../../../components/common/ImagePickerSheet';

LogBox.ignoreLogs(['Non-serializable values were found in the navigation state']);

const { width: screenWidth } = Dimensions.get('window');

enum KYCStep {
    FRONT_ID = 0,
    BACK_ID = 1,
    FACE_MATCHING = 2,
    CONFIRMATION = 3,
}

const KYCUpdate: React.FC = () => {
    const { theme, themeMode } = useTheme();
    const c = theme.colors;
    const isDark = themeMode === 'dark';
    const navigation = useNavigation<any>();

    const [currentStep, setCurrentStep] = useState<KYCStep>(KYCStep.FRONT_ID);
    const [frontImage, setFrontImage] = useState<string | null>(null);
    const [backImage, setBackImage] = useState<string | null>(null);
    const [ocrData, setOcrData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [isFaceVerified, setIsFaceVerified] = useState(false);

    // ImagePickerSheet state
    const [imagePickerVisible, setImagePickerVisible] = useState(false);
    const [imagePickerType, setImagePickerType] = useState<'front' | 'back'>('front');

    const openImagePicker = (type: 'front' | 'back') => {
        setImagePickerType(type);
        setImagePickerVisible(true);
    };

    const handleImagePicked = (result: { uri: string; type?: string; fileName?: string }) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (imagePickerType === 'front') {
            setFrontImage(result.uri);
            handleOCRFront(result.uri);
        } else {
            setBackImage(result.uri);
            handleOCRBack(result.uri);
        }
        setImagePickerVisible(false);
    };

    const steps = [
        { label: 'Mặt trước', icon: 'card-outline' },
        { label: 'Mặt sau', icon: 'card' },
        { label: 'Khuôn mặt', icon: 'person-outline' },
        { label: 'Xác nhận', icon: 'checkmark-circle-outline' },
    ];

    const pickImage = async (type: 'front' | 'back', source: 'camera' | 'library' | 'file') => {
        try {
            let result: any;
            if (source === 'camera') {
                const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') {
                    if (!canAskAgain) {
                        // Quyền bị từ chối vĩnh viễn → hướng dẫn mở cài đặt
                        Alert.alert(
                            'Cần quyền Camera',
                            'Bạn đã từ chối quyền camera. Vui lòng vào Cài đặt để bật quyền camera cho ứng dụng.',
                            [
                                { text: 'Hủy', style: 'cancel' },
                                { text: 'Mở Cài đặt', onPress: () => Linking.openSettings() },
                            ]
                        );
                    } else {
                        Alert.alert('Thất bại', 'Cần quyền camera để chụp ảnh CCCD');
                    }
                    return;
                }
                result = await ImagePicker.launchCameraAsync({
                    mediaTypes: 'images',
                    allowsEditing: true,
                    aspect: [4, 3],
                    quality: 0.8,
                });
            } else if (source === 'library') {
                const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== 'granted') {
                    if (!canAskAgain) {
                        Alert.alert(
                            'Cần quyền Thư viện ảnh',
                            'Vui lòng vào Cài đặt để bật quyền truy cập thư viện ảnh.',
                            [
                                { text: 'Hủy', style: 'cancel' },
                                { text: 'Mở Cài đặt', onPress: () => Linking.openSettings() },
                            ]
                        );
                    } else {
                        Alert.alert('Thất bại', 'Cần quyền truy cập thư viện ảnh');
                    }
                    return;
                }
                result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: 'images',
                    allowsEditing: true,
                    aspect: [4, 3],
                    quality: 0.8,
                });
            } else {
                result = await DocumentPicker.getDocumentAsync({
                    type: 'image/*',
                    copyToCacheDirectory: true,
                });
            }

            if (!result.canceled && result.assets && result.assets[0].uri) {
                const uri = result.assets[0].uri;
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                if (type === 'front') {
                    setFrontImage(uri);
                    handleOCRFront(uri);
                } else {
                    setBackImage(uri);
                    handleOCRBack(uri);
                }
            }
        } catch (err) {
            console.error('Pick image error:', err);
        }
    };

    const handleOCRFront = async (uri: string) => {
        setLoading(true);
        try {
            const res = await kycService.ocrFrontID(uri);
            if (res && res.success) {
                const data = res.data?.result || res.data || res;
                setOcrData((prev: any) => ({
                    ...prev,
                    name: data.fullName || data.name,
                    id: data.idNumber || data.id,
                    dob: data.dob,
                    gender: data.gender,
                    address: data.address,
                    nationality: data.nationality,
                    birthplace: data.birthplace,
                }));
            }
        } catch (err) {
            console.error('OCR Front error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleOCRBack = async (uri: string) => {
        setLoading(true);
        try {
            const res = await kycService.ocrBackID(uri);
            if (res && (res.success || res.errorCode === 0)) {
                const data = res.data?.result || res.data || res;
                setOcrData((prev: any) => ({
                    ...prev,
                    issueDate: data.issueDate || data.issue_date,
                    issueLoc: data.issueLoc || data.issue_loc || data.place_of_issue,
                    expiryDate: data.expiryDate || data.expiry_date,
                }));
            }
        } catch (err) {
            console.error('OCR Back error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleNext = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (currentStep === KYCStep.FRONT_ID && !frontImage) {
            Alert.alert('Chưa có ảnh', 'Vui lòng cung cấp mặt trước CCCD');
            return;
        }
        if (currentStep === KYCStep.BACK_ID && !backImage) {
            Alert.alert('Chưa có ảnh', 'Vui lòng cung cấp mặt sau CCCD');
            return;
        }
        if (currentStep === KYCStep.FACE_MATCHING && !isFaceVerified) {
            navigation.navigate('FaceDetection', {
                onVerify: async (res: any) => {
                    const match = await kycService.processFaceMatching(res.images.map((i: any) => i.uri), frontImage!);
                    if (match?.success) {
                        setIsFaceVerified(true);
                        return { success: true };
                    }
                    return { success: false, error: 'Khuôn mặt không khớp' };
                },
                onSave: () => setCurrentStep(KYCStep.CONFIRMATION),
            });
            return;
        }

        if (currentStep < KYCStep.CONFIRMATION) {
            setCurrentStep(currentStep + 1);
        } else {
            submitForm();
        }
    };

    const submitForm = async () => {
        setLoading(true);
        try {
            const res = await kycService.saveKYC(frontImage!, backImage!, {
                frontOCRData: ocrData,
                backOCRData: ocrData,
                faceMatchingResult: { success: true },
                livenessResult: { success: true },
            });
            if (res?.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Hoàn tất', 'Hồ sơ đã được gửi và đang chờ phê duyệt.', [
                    { text: 'Xong', onPress: () => navigation.goBack() }
                ]);
            } else {
                Alert.alert('Lỗi', res?.message || 'Không thể gửi hồ sơ');
            }
        } catch (err) {
            Alert.alert('Lỗi', 'Kết nối máy chủ thất bại');
        } finally {
            setLoading(false);
        }
    };

    const personalInfo = useMemo(() => [
        { label: 'Họ và tên', value: ocrData?.name, icon: 'person-outline', key: 'name' },
        { label: 'Số CCCD', value: ocrData?.id, icon: 'card-outline', key: 'id' },
        { label: 'Ngày sinh', value: ocrData?.dob, icon: 'calendar-outline', key: 'dob' },
        { label: 'Giới tính', value: ocrData?.gender, icon: 'transgender-outline', key: 'gender' },
    ], [ocrData]);

    const idInfo = useMemo(() => [
        { label: 'Ngày cấp', value: ocrData?.issueDate, icon: 'time-outline', key: 'issueDate' },
        { label: 'Nơi cấp', value: ocrData?.issueLoc, icon: 'location-outline', key: 'issueLoc' },
        { label: 'Địa chỉ', value: ocrData?.address, icon: 'home-outline', key: 'address' },
    ], [ocrData]);

    const renderImageStep = (uri: string | null, title: string, subtitle: string, type: 'front' | 'back') => (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: c.textPrimary }]}>{title}</Text>
            <Text style={[styles.stepSubtitle, { color: c.textSecondary }]}>{subtitle}</Text>

            <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => openImagePicker(type)}
                style={[styles.imageCard, { backgroundColor: c.surface, borderColor: c.border }]}
            >
                {uri ? (
                    <Image source={{ uri }} style={styles.previewImage} />
                ) : (
                    <View style={styles.imagePlaceholder}>
                        <View style={[styles.iconCircle, { backgroundColor: c.primaryGlass }]}>
                            <Ionicons name="camera-outline" size={40} color={c.primary} />
                        </View>
                        <Text style={[styles.placeholderText, { color: c.textMuted }]}>
                            Nhấn để chụp hoặc tải ảnh lên
                        </Text>
                    </View>
                )}
                {loading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator color={c.primary} size="large" />
                        <Text style={[styles.loadingText, { color: c.primary }]}>Đang phân tích...</Text>
                    </View>
                )}
            </TouchableOpacity>

            <View style={styles.guideContainer}>
                <View style={styles.guideItem}>
                    <Ionicons name="checkmark-circle" size={16} color={c.success} />
                    <Text style={[styles.guideText, { color: c.textSecondary }]}>Ảnh rõ nét, không lóa</Text>
                </View>
                <View style={styles.guideItem}>
                    <Ionicons name="checkmark-circle" size={16} color={c.success} />
                    <Text style={[styles.guideText, { color: c.textSecondary }]}>Đầy đủ 4 góc của thẻ</Text>
                </View>
            </View>
        </Animated.View>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Xác minh danh tính</Text>
                <TouchableOpacity style={styles.helpBtn}>
                    <Ionicons name="help-circle-outline" size={24} color={c.textSecondary} />
                </TouchableOpacity>
            </View>

            <KYCStepIndicator steps={steps} currentStep={currentStep} />

            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {currentStep === KYCStep.FRONT_ID && renderImageStep(frontImage, 'Mặt trước CCCD', 'Vui lòng chụp rõ các thông tin trên thẻ', 'front')}

                {currentStep === KYCStep.BACK_ID && renderImageStep(backImage, 'Mặt sau CCCD', 'Cần thấy rõ Chip hoặc mã vạch', 'back')}

                {currentStep === KYCStep.FACE_MATCHING && (
                    <Animated.View entering={FadeIn} style={styles.stepContent}>
                        <View style={styles.faceIllustration}>
                            <MaterialCommunityIcons name="face-recognition" size={120} color={isFaceVerified ? c.success : c.primary} />
                        </View>
                        <Text style={[styles.stepTitle, { color: c.textPrimary }]}>Xác thực khuôn mặt</Text>
                        <Text style={[styles.stepSubtitle, { color: c.textSecondary }]}>
                            Bảo vệ tài khoản của bạn bằng sinh trắc học cá nhân
                        </Text>

                        <CommonCard style={styles.faceStatusCard}>
                            <View style={styles.statusRow}>
                                <Ionicons
                                    name={isFaceVerified ? "checkmark-circle" : "ellipse-outline"}
                                    size={24}
                                    color={isFaceVerified ? c.success : c.textMuted}
                                />
                                <Text style={[styles.statusLabel, { color: c.textPrimary }]}>Trạng thái quét</Text>
                                <Text style={[
                                    styles.statusValue,
                                    { color: isFaceVerified ? c.success : c.warning }
                                ]}>
                                    {isFaceVerified ? 'Đã hoàn tất' : 'Chờ thực hiện'}
                                </Text>
                            </View>
                        </CommonCard>
                    </Animated.View>
                )}

                {currentStep === KYCStep.CONFIRMATION && (
                    <Animated.View entering={FadeIn} style={styles.stepContent}>
                        <Text style={[styles.stepTitle, { color: c.textPrimary }]}>Kiểm tra thông tin</Text>
                        <Text style={[styles.stepSubtitle, { color: c.textSecondary }]}>Vui lòng xác nhận lại dữ liệu trước khi gửi</Text>

                        <KYCInfoCard title="Thông tin cá nhân" data={personalInfo} editable />
                        <KYCInfoCard title="Thông tin định danh" data={idInfo} editable />

                        <View style={[styles.noticeBox, { backgroundColor: c.primaryGlass, borderColor: c.primaryBorder }]}>
                            <Ionicons name="shield-checkmark" size={20} color={c.primary} />
                            <Text style={[styles.noticeText, { color: c.primary }]}>
                                Mọi thông tin đều được mã hóa theo tiêu chuẩn an ninh cấp độ 3.
                            </Text>
                        </View>
                    </Animated.View>
                )}
            </ScrollView>

            <View style={[styles.footer, { borderTopColor: c.border }]}>
                <CommonButton
                    title={currentStep === KYCStep.CONFIRMATION ? 'Gửi hồ sơ' : 'Tiếp tục'}
                    onPress={handleNext}
                    loading={loading}
                    disabled={
                        (currentStep === KYCStep.FRONT_ID && !frontImage) ||
                        (currentStep === KYCStep.BACK_ID && !backImage)
                    }
                />
            </View>

            <ImagePickerSheet
                visible={imagePickerVisible}
                onClose={() => setImagePickerVisible(false)}
                onSelect={handleImagePicked}
                title={imagePickerType === 'front' ? 'Ảnh CCCD mặt trước' : 'Ảnh CCCD mặt sau'}
                allowCamera
                aspect={[4, 3]}
                quality={0.85}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        height: 56,
    },
    backBtn: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    helpBtn: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontFamily: 'Poppins_700Bold',
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    stepContent: {
        paddingTop: 8,
    },
    stepTitle: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 8,
    },
    stepSubtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 20,
        marginBottom: 32,
    },
    imageCard: {
        width: '100%',
        aspectRatio: 1.6,
        borderRadius: 16,
        borderWidth: 2,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    previewImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    imagePlaceholder: {
        alignItems: 'center',
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    placeholderText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        fontWeight: '600',
    },
    guideContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 24,
    },
    guideItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    guideText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    faceIllustration: {
        alignSelf: 'center',
        marginTop: 20,
        marginBottom: 40,
    },
    faceStatusCard: {
        marginVertical: 20,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
    },
    statusLabel: {
        flex: 1,
        marginLeft: 12,
        fontSize: 15,
        fontFamily: 'Poppins_500Medium',
    },
    statusValue: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
    },
    noticeBox: {
        flexDirection: 'row',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        gap: 12,
        marginTop: 8,
        alignItems: 'center',
    },
    noticeText: {
        flex: 1,
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        lineHeight: 18,
    },
    footer: {
        padding: 20,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
});

export default KYCUpdate;

