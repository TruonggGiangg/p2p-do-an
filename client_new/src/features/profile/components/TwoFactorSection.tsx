import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, Modal, Platform, Linking, ScrollView, KeyboardAvoidingView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '../../../contexts/ThemeContext';
import { useTwoFactor } from '../../../shared/hooks';
import { CommonButton, CommonCard, BinanceHeader } from '../../../components';

export const TwoFactorSection: React.FC = () => {
  const { theme } = useTheme();
  const {
    isEnabled,
    secret,
    isLoading,
    error,
    getSecret,
    enable2FA,
    disable2FA,
    verifyToken,
    refreshStatus,
    clearError,
  } = useTwoFactor();

  const [expanded, setExpanded] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [testOtpCode, setTestOtpCode] = useState('');
  const [openedGA, setOpenedGA] = useState(false);

  // Refresh status when component mounts or when expanded
  useEffect(() => {
    if (expanded) {
      refreshStatus();
    }
  }, [expanded, refreshStatus]);

  const handleGetSecret = async () => {
    clearError();
    const result = await getSecret();
    if (result) {
      setShowQRModal(true);
    } else {
      Alert.alert('Lỗi', error || 'Không thể tạo secret');
    }
  };

  const handleEnable = async () => {
    // Không cần làm gì, OTP input đã hiển thị trong cùng modal
  };

  const handleConfirmEnable = async () => {
    if (!otpCode || otpCode.length !== 6) {
      Alert.alert('Lỗi', 'Vui lòng nhập mã OTP 6 số');
      return;
    }

    if (!secret) {
      Alert.alert('Lỗi', 'Secret không tồn tại');
      return;
    }

    const success = await enable2FA(secret.secret, otpCode);
    if (success) {
      // Force refresh status to ensure UI updates
      const refreshedEnabled = await refreshStatus();
      console.log('[TwoFactorSection] 2FA enabled successfully, refreshed status enabled:', refreshedEnabled);
      Alert.alert('Thành công', '2FA đã được kích hoạt!');
      setShowQRModal(false);
      setOtpCode('');
      setOpenedGA(false);
    } else {
      Alert.alert('Lỗi', error || 'Mã OTP không đúng');
    }
  };

  const handleDisable = () => {
    Alert.alert(
      'Tắt 2FA',
      'Bạn có chắc muốn tắt xác thực 2 yếu tố? Tài khoản sẽ kém an toàn hơn.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Tắt',
          style: 'destructive',
          onPress: async () => {
            const success = await disable2FA();
            if (success) {
              Alert.alert('Thành công', '2FA đã được tắt');
            } else {
              Alert.alert('Lỗi', error || 'Không thể tắt 2FA');
            }
          },
        },
      ],
    );
  };

  const openGoogleAuthenticator = async () => {
    console.log('[DEBUG] Bắt đầu mở Google Authenticator...');
    if (!secret) {
      console.error('[DEBUG] Lỗi: Không có thông tin secret');
      Alert.alert('Lỗi', 'Chưa có thông tin bí mật. Vui lòng tạo lại.');
      return;
    }

    const issuer = 'P2P Lending';
    const label = 'P2P Lending';
    const otpauthUrl = secret.otpauthUrl || `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret.secret)}&issuer=${encodeURIComponent(issuer)}`;

    console.log('[DEBUG] Platform:', Platform.OS);
    console.log('[DEBUG] OTPAuth URL:', otpauthUrl);

    try {
      if (Platform.OS === 'ios') {
        const googleAuthScheme = 'googleauthenticator://';
        console.log('[DEBUG] iOS: Thử mở bằng scheme:', googleAuthScheme);

        try {
          // Thử mở app trực tiếp trước
          await Linking.openURL(googleAuthScheme);
          console.log('[DEBUG] iOS: Mở scheme thành công');
          setOpenedGA(true);
        } catch (err: any) {
          console.warn('[DEBUG] iOS: Mở scheme thất bại:', err.message);
          console.log('[DEBUG] iOS: Thử mở bằng otpauthUrl');
          try {
            await Linking.openURL(otpauthUrl);
            console.log('[DEBUG] iOS: Mở otpauthUrl thành công');
            setOpenedGA(true);
          } catch (otpErr: any) {
            console.error('[DEBUG] iOS: Mở otpauthUrl thất bại:', otpErr.message);
            // Cuối cùng nếu vẫn lỗi, gợi ý tải từ App Store
            Alert.alert(
              'Thông báo',
              'Không thể mở ứng dụng. Bạn có muốn tải Google Authenticator từ App Store không?',
              [
                { text: 'Hủy', style: 'cancel' },
                { text: 'Tải về', onPress: () => Linking.openURL('https://apps.apple.com/us/app/google-authenticator/id388497605') }
              ]
            );
          }
        }
      } else {
        // Android: Sử dụng otpauth tiêu chuẩn
        console.log('[DEBUG] Android: Thử mở bằng otpauthUrl');
        try {
          await Linking.openURL(otpauthUrl);
          console.log('[DEBUG] Android: Mở otpauthUrl thành công');
          setOpenedGA(true);
        } catch (err: any) {
          console.error('[DEBUG] Android: Mở otpauthUrl thất bại:', err.message);
          // Trên Android nếu otpauth:// không được xử lý, gợi ý mở Play Store
          Alert.alert(
            'Thông báo',
            'Không thể mở Google Authenticator. Bạn có muốn tải về từ Play Store không?',
            [
              { text: 'Hủy', style: 'cancel' },
              { text: 'Tải về', onPress: () => Linking.openURL('https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2') }
            ]
          );
        }
      }
    } catch (error: any) {
      console.error('[DEBUG] Lỗi ngoại lệ hệ thống:', error);
      Alert.alert('Lỗi', 'Có lỗi xảy ra khi cố gắng kết nối với ứng dụng xác thực.');
    }
  };

  return (
    <>
      <CommonCard style={styles.card}>
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.header}
            onPress={() => setExpanded(!expanded)}
            activeOpacity={0.7}
          >
            <View style={styles.headerLeft}>
              <View style={[styles.iconWrapper, { backgroundColor: isEnabled ? theme.colors.success + '15' : theme.colors.primary + '15' }]}>
                <MaterialCommunityIcons
                  name={isEnabled ? 'shield-check' : 'shield-alert'}
                  size={22}
                  color={isEnabled ? theme.colors.success : theme.colors.primary}
                />
              </View>
              <View style={styles.titleContainer}>
                <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                  Bảo mật 2 lớp (2FA)
                </Text>
                <Text style={[styles.sectionSubtitle, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  {isEnabled ? 'Xác thực bởi Google' : 'Lớp bảo mật bổ sung'}
                </Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: isEnabled ? theme.colors.success + '15' : theme.colors.textMuted + '15' }]}>
              <Text style={[styles.statusText, { color: isEnabled ? theme.colors.success : theme.colors.textMuted }]}>
                {isEnabled ? 'Bật' : 'Tắt'}
              </Text>
            </View>
            <View style={styles.expandButton}>
              <MaterialCommunityIcons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={theme.colors.textDim}
              />
            </View>
          </TouchableOpacity>

          {expanded && (
            <View style={styles.content}>
              {error && (
                <View style={[styles.errorBox, { backgroundColor: theme.colors.error + '20' }]}>
                  <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
                </View>
              )}

              {isEnabled ? (
                <View style={styles.enabledState}>
                  <View style={[styles.stateIconContainer, { backgroundColor: theme.colors.success + '15' }]}>
                    <MaterialCommunityIcons
                      name="shield-check"
                      size={48}
                      color={theme.colors.success}
                    />
                  </View>
                  <Text style={[styles.stateText, { color: theme.colors.textPrimary }]}>
                    2FA đã bật
                  </Text>
                  <Text style={[styles.stateSubtext, { color: theme.colors.textMuted }]}>
                    Tài khoản của bạn đã được bảo vệ bằng 2FA. Chúng tôi sẽ yêu cầu mã xác minh khi đăng nhập hoặc thực hiện thao tác nhạy cảm.
                  </Text>
                  <View style={styles.actions}>
                    <CommonButton
                      title="Kiểm tra 2FA"
                      onPress={() => setShowTestModal(true)}
                      variant="outline"
                      size="sm"
                      icon="test-tube"
                      fullWidth={false}
                      style={styles.testBtn}
                    />
                    <CommonButton
                      title="Tắt 2FA"
                      onPress={handleDisable}
                      variant="outline"
                      size="sm"
                      icon="shield-off"
                      fullWidth={false}
                      style={styles.disableBtn}
                      textStyle={{ color: theme.colors.error }}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.disabledState}>
                  <View style={[styles.stateIconContainer, { backgroundColor: theme.colors.textMuted + '15' }]}>
                    <MaterialCommunityIcons
                      name="shield-alert-outline"
                      size={48}
                      color={theme.colors.textMuted}
                    />
                  </View>
                  <Text style={[styles.stateText, { color: theme.colors.textPrimary }]}>
                    2FA chưa bật
                  </Text>
                  <Text style={[styles.stateSubtext, { color: theme.colors.textMuted }]}>
                    Bật xác thực 2 yếu tố để bảo vệ tài khoản của bạn.
                  </Text>
                  <CommonButton
                    title="Bật 2FA"
                    onPress={handleGetSecret}
                    icon="shield-plus-outline"
                    style={styles.enableBtn}
                  />
                </View>
              )}
            </View>
          )}
        </View>
      </CommonCard>

      {/* QR Code Modal */}
      <Modal
        visible={showQRModal}
        transparent={false}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowQRModal(false);
          setOtpCode('');
          clearError();
        }}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboardView}
          >
            <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
              {/* Header */}
              <BinanceHeader
                mode="standard"
                title="Thiết lập 2FA"
                showBack={false}
                rightComponents={
                  <TouchableOpacity
                    onPress={() => {
                      setShowQRModal(false);
                      setOtpCode('');
                      clearError();
                    }}
                    style={styles.closeButton}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={24}
                      color={theme.colors.textPrimary}
                    />
                  </TouchableOpacity>
                }
              />

              {secret && (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* QR Code */}
                  <View style={styles.qrContainer}>
                    <View style={[styles.qrWrapper, { backgroundColor: '#fff' }]}>
                      <QRCode
                        value={secret.otpauthUrl || secret.secret}
                        size={200}
                        backgroundColor="white"
                        color="black"
                      />
                    </View>
                  </View>

                  {/* Manual Setup Key */}
                  <View style={styles.manualSetupContainer}>
                    <Text style={[styles.manualSetupLabel, { color: theme.colors.textSecondary }]}>
                      Mã thiết lập (nhập thủ công)
                    </Text>
                    <View style={[styles.secretBox, { backgroundColor: theme.colors.surfaceLight, borderColor: theme.colors.border }]}>
                      <Text style={[styles.secretText, { color: theme.colors.primary }]}>
                        {secret.secret}
                      </Text>
                    </View>
                  </View>

                  {/* Simple Instructions */}
                  <Text style={[styles.simpleInstructions, { color: theme.colors.textMuted }]}>
                    1. Quét mã QR bằng Google Authenticator.{"\n"}
                    2. Nhập mã 6 số do ứng dụng cung cấp bên dưới.
                  </Text>

                  {/* OTP Input */}
                  <View style={styles.otpInputContainer}>
                    <Text style={[styles.otpLabel, { color: theme.colors.textPrimary }]}>
                      Nhập mã OTP 6 số
                    </Text>
                    <View style={[
                      styles.otpInputWrapper,
                      {
                        borderColor: otpCode.length === 6
                          ? theme.colors.success
                          : error
                            ? theme.colors.error
                            : theme.colors.border,
                        backgroundColor: otpCode.length === 6
                          ? theme.colors.success + '10'
                          : theme.colors.surfaceLight,
                      },
                    ]}>
                      <TextInput
                        style={[styles.otpInput, { color: theme.colors.textPrimary }]}
                        value={otpCode}
                        onChangeText={setOtpCode}
                        placeholder="000000"
                        placeholderTextColor={theme.colors.textMuted + '80'}
                        keyboardType="number-pad"
                        maxLength={6}
                        autoFocus={false}
                      />
                      {otpCode.length === 6 && (
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={24}
                          color={theme.colors.success}
                          style={styles.otpCheckIcon}
                        />
                      )}
                    </View>
                    {otpCode.length > 0 && otpCode.length < 6 && (
                      <Text style={[styles.otpHint, { color: theme.colors.textMuted }]}>
                        Còn {6 - otpCode.length} số
                      </Text>
                    )}
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.modalActions}>
                    <CommonButton
                      title="Mở Google Authenticator"
                      onPress={openGoogleAuthenticator}
                      variant="secondary"
                      icon="open-in-app"
                      style={styles.modalButton}
                    />
                    <CommonButton
                      title="Bật 2FA"
                      onPress={handleConfirmEnable}
                      loading={isLoading}
                      disabled={otpCode.length !== 6}
                      icon="shield-check"
                      style={styles.modalButton}
                    />
                    <CommonButton
                      title="Hủy"
                      onPress={() => {
                        setShowQRModal(false);
                        setOpenedGA(false);
                        setOtpCode('');
                        clearError();
                      }}
                      variant="ghost"
                      style={styles.modalButton}
                    />
                  </View>
                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Test 2FA Modal */}
      <Modal
        visible={showTestModal}
        transparent={false}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowTestModal(false);
          setTestOtpCode('');
          clearError();
        }}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboardView}
          >
            <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
              {/* Header */}
              <BinanceHeader
                mode="standard"
                title="Kiểm tra 2FA"
                showBack={false}
                rightComponents={
                  <TouchableOpacity
                    onPress={() => {
                      setShowTestModal(false);
                      setTestOtpCode('');
                      clearError();
                    }}
                    style={styles.closeButton}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={24}
                      color={theme.colors.textPrimary}
                    />
                  </TouchableOpacity>
                }
              />

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Description */}
                <Text style={[styles.testDescription, { color: theme.colors.textMuted }]}>
                  Nhập mã OTP 6 số từ ứng dụng xác thực để kiểm tra
                </Text>

                {/* Error Message */}
                {error && (
                  <View style={[styles.errorBox, { backgroundColor: theme.colors.error + '20', borderColor: theme.colors.error + '40' }]}>
                    <MaterialCommunityIcons
                      name="alert-circle"
                      size={20}
                      color={theme.colors.error}
                      style={styles.errorIcon}
                    />
                    <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
                  </View>
                )}

                {/* OTP Input */}
                <View style={styles.otpInputContainer}>
                  <Text style={[styles.otpLabel, { color: theme.colors.textPrimary }]}>
                    Mã OTP 6 số
                  </Text>
                  <View style={[
                    styles.otpInputWrapper,
                    {
                      borderColor: testOtpCode.length === 6
                        ? theme.colors.success
                        : error
                          ? theme.colors.error
                          : theme.colors.border,
                      backgroundColor: testOtpCode.length === 6
                        ? theme.colors.success + '10'
                        : theme.colors.surfaceLight,
                    },
                  ]}>
                    <TextInput
                      style={[styles.otpInput, { color: theme.colors.textPrimary }]}
                      value={testOtpCode}
                      onChangeText={setTestOtpCode}
                      placeholder="000000"
                      placeholderTextColor={theme.colors.textMuted + '80'}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoFocus={true}
                    />
                    {testOtpCode.length === 6 && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={24}
                        color={theme.colors.success}
                        style={styles.otpCheckIcon}
                      />
                    )}
                  </View>
                  {testOtpCode.length > 0 && testOtpCode.length < 6 && (
                    <Text style={[styles.otpHint, { color: theme.colors.textMuted }]}>
                      Còn {6 - testOtpCode.length} số
                    </Text>
                  )}
                </View>

                {/* Action Buttons */}
                <View style={styles.modalActions}>
                  <CommonButton
                    title="Xác minh"
                    onPress={async () => {
                      if (!testOtpCode || testOtpCode.length !== 6) {
                        Alert.alert('Lỗi', 'Vui lòng nhập mã OTP 6 số');
                        return;
                      }

                      clearError();
                      const isValid = await verifyToken(testOtpCode);
                      if (isValid) {
                        Alert.alert(
                          'Thành công',
                          '2FA hoạt động chính xác!',
                          [
                            {
                              text: 'OK',
                              onPress: () => {
                                setShowTestModal(false);
                                setTestOtpCode('');
                                clearError();
                              },
                            },
                          ],
                        );
                      } else {
                        Alert.alert('Lỗi', error || 'Mã OTP không hợp lệ.');
                        setTestOtpCode('');
                      }
                    }}
                    icon="check-circle"
                    loading={isLoading}
                    disabled={testOtpCode.length !== 6 || isLoading}
                    style={styles.modalButton}
                  />
                  <CommonButton
                    title="Hủy"
                    onPress={() => {
                      setShowTestModal(false);
                      setTestOtpCode('');
                      clearError();
                    }}
                    variant="ghost"
                    style={styles.modalButton}
                  />
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  section: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  titleContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
  },
  sectionSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 10,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
  },
  expandButton: {
    padding: 4,
  },
  content: {
    marginTop: 20,
    paddingTop: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    width: '100%',
  },
  errorText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    flex: 1,
  },
  enabledState: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  stateIcon: {
    marginBottom: 16,
  },
  stateIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  stateText: {
    fontSize: 19,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 10,
    textAlign: 'center',
  },
  stateSubtext: {
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  testBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  testBtnText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
  },
  disableBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  disableBtnText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
  },
  disabledState: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  enableBtn: {
    width: '100%',
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enableBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
  },
  modalContainer: {
    flex: 1,
  },
  modalKeyboardView: {
    flex: 1,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  modalHeader: {
    display: 'none',
  },
  closeButton: {
    padding: 4,
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  qrWrapper: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  simpleInstructions: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  otpInputContainer: {
    marginBottom: 20,
    width: '100%',
  },
  otpLabel: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 12,
  },
  otpInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Poppins_700Bold',
    textAlign: 'center',
    letterSpacing: 8,
    padding: 0,
    minHeight: 56,
  },
  modalActions: {
    gap: 12,
    marginTop: 8,
    width: '100%',
  },
  modalButton: {
    width: '100%',
    minHeight: 50,
  },
  testDescription: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  otpInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 20,
    height: 60,
  },
  otpCheckIcon: {
    marginLeft: 12,
  },
  otpHint: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginTop: 8,
    textAlign: 'center',
  },
  errorIcon: {
    marginRight: 8,
  },
  manualSetupContainer: {
    alignItems: 'center',
    marginVertical: 16,
    paddingHorizontal: 20,
  },
  manualSetupLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 8,
  },
  secretBox: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    width: '100%',
    alignItems: 'center',
  },
  secretText: {
    fontSize: 16,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 1,
  },
});
