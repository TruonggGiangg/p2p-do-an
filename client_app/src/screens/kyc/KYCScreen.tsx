/**
 * KYC Screen - Xác thực CCCD và khuôn mặt
 * 
 * Chức năng:
 * - Hiển thị ảnh CCCD đã có (nếu có)
 * - Chụp/upload ảnh CCCD mặt trước và sau
 * - Xử lý OCR tự động
 * - Face verification với live detection
 * - Upload lên Fineract khi thành công
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    ScrollView,
    Image,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';

import {
    GradientBackground,
    GlassCard,
    GlassButton,
    GlassTokens,
    SectionTitle,
    InfoRow,
} from '../../components/glass';
import { UnifiedSpacing, UnifiedRadius } from '../../theme';
import { ekycApi, storageService, apiConfig } from '../../services';

// ⚠️ BYPASS FLAG - Set true để tạm thời bỏ qua face matching
// Tương ứng với EKYC_BYPASS_FACE_MATCHING trong server
const BYPASS_FACE_MATCHING = false;

interface KycState {
    // Existing images from Fineract
    existingFrontUrl: string | null;
    existingBackUrl: string | null;
    hasExisting: boolean;

    // New images to upload
    frontImageUri: string | null;
    backImageUri: string | null;

    // OCR results
    frontOcrData: any | null;
    backOcrData: any | null;

    // Loading states
    loadingExisting: boolean;
    loadingFrontOcr: boolean;
    loadingBackOcr: boolean;
    submitting: boolean;

    // Face matching
    faceMatchingResult: boolean | null;
    livenessResult: any | null;
}

export default function KYCScreen() {
    const navigation = useNavigation();
    const [state, setState] = useState<KycState>({
        existingFrontUrl: null,
        existingBackUrl: null,
        hasExisting: false,
        frontImageUri: null,
        backImageUri: null,
        frontOcrData: null,
        backOcrData: null,
        loadingExisting: false,
        loadingFrontOcr: false,
        loadingBackOcr: false,
        submitting: false,
        faceMatchingResult: null,
        livenessResult: null,
    });

    // Load existing CCCD images on mount
    useEffect(() => {
        loadExistingImages();
    }, []);

    const loadExistingImages = async () => {
        setState(s => ({ ...s, loadingExisting: true }));
        try {
            const result = await ekycApi.getImages();
            console.log('[KYC] Existing images:', result);

            if (result.success && result.hasImages && result.images.length > 0) {
                const frontImg = result.images.find(img =>
                    img.name?.includes('FRONT') || img.fileName?.includes('FRONT')
                );
                const backImg = result.images.find(img =>
                    img.name?.includes('BACK') || img.fileName?.includes('BACK')
                );

                const token = await storageService.getAccessToken();

                // Fetch images with auth headers and convert to base64
                const fetchImageAsBase64 = async (downloadUrl: string): Promise<string | null> => {
                    try {
                        const imageUrl = `${apiConfig.baseUrl}${downloadUrl}`;
                        const response = await fetch(imageUrl, {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                            },
                        });

                        if (!response.ok) {
                            console.log('[KYC] Failed to fetch image:', response.status);
                            return null;
                        }

                        const blob = await response.blob();
                        return new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.onerror = () => resolve(null);
                            reader.readAsDataURL(blob);
                        });
                    } catch (error) {
                        console.log('[KYC] Error fetching image:', error);
                        return null;
                    }
                };

                const frontBase64 = frontImg ? await fetchImageAsBase64(frontImg.downloadUrl) : null;
                const backBase64 = backImg ? await fetchImageAsBase64(backImg.downloadUrl) : null;

                setState(s => ({
                    ...s,
                    existingFrontUrl: frontBase64,
                    existingBackUrl: backBase64,
                    hasExisting: !!(frontBase64 || backBase64),
                }));
            }
        } catch (error: any) {
            console.log('[KYC] Error loading existing:', error.message);
        } finally {
            setState(s => ({ ...s, loadingExisting: false }));
        }
    };

    const pickImage = async (side: 'front' | 'back') => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            const uri = result.assets[0].uri;
            if (side === 'front') {
                setState(s => ({ ...s, frontImageUri: uri }));
                processOcr(uri, 'front');
            } else {
                setState(s => ({ ...s, backImageUri: uri }));
                processOcr(uri, 'back');
            }
        }
    };

    const captureImage = async (side: 'front' | 'back') => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
            Alert.alert('Lỗi', 'Cần quyền truy cập camera');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            const uri = result.assets[0].uri;
            if (side === 'front') {
                setState(s => ({ ...s, frontImageUri: uri }));
                processOcr(uri, 'front');
            } else {
                setState(s => ({ ...s, backImageUri: uri }));
                processOcr(uri, 'back');
            }
        }
    };

    const processOcr = async (uri: string, side: 'front' | 'back') => {
        const loadingKey = side === 'front' ? 'loadingFrontOcr' : 'loadingBackOcr';
        const dataKey = side === 'front' ? 'frontOcrData' : 'backOcrData';

        setState(s => ({ ...s, [loadingKey]: true }));
        try {
            const result = side === 'front'
                ? await ekycApi.processOcrFront(uri)
                : await ekycApi.processOcrBack(uri);

            console.log(`[KYC] OCR ${side} result:`, result);

            if (result.success && result.data) {
                setState(s => ({ ...s, [dataKey]: result.data }));
            } else {
                Alert.alert('Lỗi OCR', result.error || 'Không thể nhận dạng CCCD');
            }
        } catch (error: any) {
            Alert.alert('Lỗi', error.message);
        } finally {
            setState(s => ({ ...s, [loadingKey]: false }));
        }
    };

    const handleSubmit = async () => {
        if (!state.frontImageUri || !state.frontOcrData) {
            Alert.alert('Lỗi', 'Vui lòng chụp và hoàn thành OCR CCCD mặt trước');
            return;
        }

        // Face matching check (or bypass)
        if (!BYPASS_FACE_MATCHING) {
            // Navigate to FaceDetection screen
            (navigation as any).navigate('FaceDetection', {
                frontImageUri: state.frontImageUri,
                onVerificationComplete: async (result: { success: boolean; faceMatchingResult: boolean; livenessResult: any }) => {
                    console.log('[KYC] Face verification result:', result);
                    if (result.success) {
                        setState(s => ({ ...s, faceMatchingResult: result.faceMatchingResult, livenessResult: result.livenessResult }));
                        // Proceed with save after face matching
                        await saveKycData(result.faceMatchingResult);
                    }
                },
            });
            return;
        }

        // Bypass mode - save directly
        await saveKycData(true);
    };

    // Extracted save logic for reuse
    const saveKycData = async (faceMatchingPassed: boolean) => {
        setState(s => ({ ...s, submitting: true }));
        try {
            // Convert URI to base64
            const frontBase64 = await uriToBase64(state.frontImageUri!);
            const backBase64 = state.backImageUri
                ? await uriToBase64(state.backImageUri)
                : undefined;

            const result = await ekycApi.saveKyc({
                frontOCRData: state.frontOcrData,
                backOCRData: state.backOcrData,
                frontImageBase64: frontBase64,
                backImageBase64: backBase64,
                faceMatchingResult: faceMatchingPassed,
            });

            console.log('[KYC] Save result:', result);

            if (result.success) {
                Alert.alert('Thành công', 'KYC đã được lưu', [
                    { text: 'OK', onPress: () => navigation.goBack() },
                ]);
            } else {
                Alert.alert('Lỗi', result.message || 'Lưu KYC thất bại');
            }
        } catch (error: any) {
            Alert.alert('Lỗi', error.message);
        } finally {
            setState(s => ({ ...s, submitting: false }));
        }
    };

    // Helper: Convert image URI to base64
    const uriToBase64 = async (uri: string): Promise<string> => {
        const response = await fetch(uri);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    return (
        <GradientBackground>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()}>
                        <MaterialCommunityIcons
                            name="arrow-left"
                            size={24}
                            color={GlassTokens.colors.textPrimary}
                        />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Xác thực KYC</Text>
                    <View style={{ width: 24 }} />
                </View>

                {/* Existing Images Card (if any) */}
                {state.loadingExisting && (
                    <GlassCard>
                        <View style={styles.loadingRow}>
                            <ActivityIndicator color={GlassTokens.colors.primary} />
                            <Text style={styles.loadingText}>Đang tải thông tin CCCD...</Text>
                        </View>
                    </GlassCard>
                )}

                {state.hasExisting && !state.loadingExisting && (
                    <GlassCard variant="primary">
                        <View style={styles.existingHeader}>
                            <MaterialCommunityIcons
                                name="check-circle"
                                size={20}
                                color={GlassTokens.colors.success}
                            />
                            <Text style={styles.existingTitle}>CCCD đã xác thực</Text>
                        </View>
                        <View style={styles.existingGrid}>
                            {state.existingFrontUrl && (
                                <View style={styles.existingItem}>
                                    <Text style={styles.existingLabel}>Mặt trước</Text>
                                    <Image
                                        source={{ uri: state.existingFrontUrl }}
                                        style={styles.existingImage}
                                        resizeMode="cover"
                                    />
                                </View>
                            )}
                            {state.existingBackUrl && (
                                <View style={styles.existingItem}>
                                    <Text style={styles.existingLabel}>Mặt sau</Text>
                                    <Image
                                        source={{ uri: state.existingBackUrl }}
                                        style={styles.existingImage}
                                        resizeMode="cover"
                                    />
                                </View>
                            )}
                        </View>
                        <Text style={styles.existingNote}>
                            Chụp ảnh mới để cập nhật CCCD
                        </Text>
                    </GlassCard>
                )}

                {/* Front CCCD */}
                <GlassCard>
                    <SectionTitle>Mặt trước CCCD</SectionTitle>

                    {state.frontImageUri ? (
                        <Image
                            source={{ uri: state.frontImageUri }}
                            style={styles.previewImage}
                            resizeMode="contain"
                        />
                    ) : (
                        <View style={styles.placeholder}>
                            <MaterialCommunityIcons
                                name="card-account-details-outline"
                                size={48}
                                color={GlassTokens.colors.textSecondary}
                            />
                            <Text style={styles.placeholderText}>
                                Chụp hoặc chọn ảnh mặt trước
                            </Text>
                        </View>
                    )}

                    <View style={styles.buttonRow}>
                        <GlassButton
                            title="Chụp ảnh"
                            icon="camera"
                            onPress={() => captureImage('front')}
                            variant="secondary"
                            style={{ flex: 1, marginRight: 8 }}
                        />
                        <GlassButton
                            title="Thư viện"
                            icon="image"
                            onPress={() => pickImage('front')}
                            variant="secondary"
                            style={{ flex: 1 }}
                        />
                    </View>

                    {state.loadingFrontOcr && (
                        <View style={styles.loadingRow}>
                            <ActivityIndicator color={GlassTokens.colors.primary} />
                            <Text style={styles.loadingText}>Đang xử lý OCR...</Text>
                        </View>
                    )}

                    {state.frontOcrData && !state.loadingFrontOcr && (
                        <View style={styles.ocrResult}>
                            <InfoRow label="Họ tên" value={state.frontOcrData.fullName || '-'} />
                            <InfoRow label="Số CCCD" value={state.frontOcrData.idNumber || '-'} />
                            <InfoRow label="Ngày sinh" value={state.frontOcrData.dob || '-'} />
                            <InfoRow label="Giới tính" value={state.frontOcrData.gender || '-'} />
                            <InfoRow label="Quốc tịch" value={state.frontOcrData.nationality || '-'} />
                            <InfoRow label="Quê quán" value={state.frontOcrData.birthplace || '-'} />
                            <InfoRow label="Địa chỉ" value={state.frontOcrData.address || '-'} />
                        </View>
                    )}
                </GlassCard>

                {/* Back CCCD */}
                <GlassCard>
                    <SectionTitle>Mặt sau CCCD</SectionTitle>

                    {state.backImageUri ? (
                        <Image
                            source={{ uri: state.backImageUri }}
                            style={styles.previewImage}
                            resizeMode="contain"
                        />
                    ) : (
                        <View style={styles.placeholder}>
                            <MaterialCommunityIcons
                                name="card-account-details"
                                size={48}
                                color={GlassTokens.colors.textSecondary}
                            />
                            <Text style={styles.placeholderText}>
                                Chụp hoặc chọn ảnh mặt sau
                            </Text>
                        </View>
                    )}

                    <View style={styles.buttonRow}>
                        <GlassButton
                            title="Chụp ảnh"
                            icon="camera"
                            onPress={() => captureImage('back')}
                            variant="secondary"
                            style={{ flex: 1, marginRight: 8 }}
                        />
                        <GlassButton
                            title="Thư viện"
                            icon="image"
                            onPress={() => pickImage('back')}
                            variant="secondary"
                            style={{ flex: 1 }}
                        />
                    </View>

                    {state.loadingBackOcr && (
                        <View style={styles.loadingRow}>
                            <ActivityIndicator color={GlassTokens.colors.primary} />
                            <Text style={styles.loadingText}>Đang xử lý OCR...</Text>
                        </View>
                    )}

                    {state.backOcrData && !state.loadingBackOcr && (
                        <View style={styles.ocrResult}>
                            <InfoRow
                                label="Ngày cấp"
                                value={state.backOcrData.issue_date || state.backOcrData.init_date || '-'}
                            />
                            {state.backOcrData.expiry_date && (
                                <InfoRow label="Ngày hết hạn" value={state.backOcrData.expiry_date} />
                            )}
                            {state.backOcrData.place_of_birth && (
                                <InfoRow label="Nơi cấp" value={state.backOcrData.place_of_birth} />
                            )}
                            {state.backOcrData.address && (
                                <InfoRow label="Địa chỉ" value={state.backOcrData.address} />
                            )}
                        </View>
                    )}
                </GlassCard>

                {/* Bypass Notice */}
                {BYPASS_FACE_MATCHING && (
                    <GlassCard>
                        <View style={styles.bypassNotice}>
                            <MaterialCommunityIcons
                                name="alert-circle-outline"
                                size={20}
                                color={GlassTokens.colors.warning}
                            />
                            <Text style={styles.bypassText}>
                                ⚠️ BYPASS MODE: Kiểm tra khuôn mặt đã tắt
                            </Text>
                        </View>
                    </GlassCard>
                )}

                {/* Submit Button */}
                <GlassButton
                    title={state.submitting ? 'Đang xử lý...' : 'Gửi KYC'}
                    icon="check-circle"
                    onPress={handleSubmit}
                    loading={state.submitting}
                    disabled={!state.frontImageUri || !state.frontOcrData || state.submitting}
                    style={{ marginBottom: 32 }}
                />
            </ScrollView>
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        padding: UnifiedSpacing.lg,
        paddingTop: 60,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: UnifiedSpacing.lg,
    },
    headerTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: GlassTokens.colors.textPrimary,
    },
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: UnifiedSpacing.md,
    },
    loadingText: {
        marginLeft: UnifiedSpacing.sm,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_400Regular',
    },
    existingHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: UnifiedSpacing.sm,
    },
    existingTitle: {
        marginLeft: UnifiedSpacing.xs,
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: GlassTokens.colors.success,
    },
    existingGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    existingItem: {
        width: '48%',
        alignItems: 'center',
    },
    existingLabel: {
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        marginBottom: 4,
        fontFamily: 'Poppins_400Regular',
    },
    existingImage: {
        width: '100%',
        height: 80,
        borderRadius: UnifiedRadius.sm,
        backgroundColor: GlassTokens.colors.glassDark,
    },
    existingNote: {
        marginTop: UnifiedSpacing.sm,
        fontSize: 12,
        color: GlassTokens.colors.textSecondary,
        textAlign: 'center',
        fontStyle: 'italic',
        fontFamily: 'Poppins_400Regular',
    },
    placeholder: {
        height: 150,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: GlassTokens.colors.glassDark,
        borderRadius: UnifiedRadius.md,
        borderWidth: 1,
        borderColor: GlassTokens.colors.surface,
        borderStyle: 'dashed',
        marginBottom: UnifiedSpacing.md,
    },
    placeholderText: {
        marginTop: UnifiedSpacing.sm,
        color: GlassTokens.colors.textSecondary,
        fontFamily: 'Poppins_400Regular',
    },
    previewImage: {
        width: '100%',
        height: 180,
        borderRadius: UnifiedRadius.md,
        marginBottom: UnifiedSpacing.md,
        backgroundColor: GlassTokens.colors.glassDark,
    },
    buttonRow: {
        flexDirection: 'row',
        marginBottom: UnifiedSpacing.md,
    },
    ocrResult: {
        marginTop: UnifiedSpacing.sm,
        paddingTop: UnifiedSpacing.sm,
        borderTopWidth: 1,
        borderTopColor: GlassTokens.colors.surface,
    },
    bypassNotice: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: UnifiedSpacing.sm,
    },
    bypassText: {
        marginLeft: UnifiedSpacing.xs,
        color: GlassTokens.colors.warning,
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
});
