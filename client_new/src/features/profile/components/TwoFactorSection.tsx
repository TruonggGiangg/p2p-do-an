import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, Modal, Platform, Linking, ScrollView, KeyboardAvoidingView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '../../../contexts/ThemeContext';
import { useTwoFactor } from '../../../shared/hooks';
import { CommonButton, CommonCard } from '../../../components';

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
    if (!secret) {
      Alert.alert('Lỗi', 'Chưa có secret. Vui lòng tạo secret trước.');
      return;
    }

    try {
      if (Platform.OS === 'ios') {
        // iOS: Chỉ mở Google Authenticator app trực tiếp (KHÔNG dùng otpauth URL để tránh mở nhầm Passkey)
        const candidateUrls = [
          'googleauthenticator://',
          'com.googleauthenticator://',
        ];
        for (const url of candidateUrls) {
          try {
            await Linking.openURL(url);
            setOpenedGA(true);
            return;
          } catch (openError: any) {
            console.log('Open GA URL failed:', url, openError?.message || openError);
          }
        }
        // Nếu không mở được app, chỉ thông báo (KHÔNG fallback về otpauth URL)
        Alert.alert('Thông báo', 'Không thể mở Google Authenticator. Vui lòng mở thủ công.');
        return;
      } else {
        // Android: Mở trực tiếp với otpauth URL
        const issuer = 'P2P Lending';
        const label = 'P2P Lending';
        const otpauthUrl = secret.otpauthUrl || `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret.secret)}&issuer=${encodeURIComponent(issuer)}`;

        const supported = await Linking.canOpenURL(otpauthUrl);
        if (!supported) {
          Alert.alert('Thông báo', 'Không tìm thấy ứng dụng Google Authenticator');
          return;
        }
        await Linking.openURL(otpauthUrl);
        setOpenedGA(true);
      }
    } catch (error) {
      console.error('Open GA Error:', error);
      Alert.alert('Lỗi', 'Không thể mở Google Authenticator');
    }
  };

  return (
    <>
      <CommonCard style={styles.card}>
        <View style={styles.section}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconWrapper, { backgroundColor: isEnabled ? theme.colors.success + '20' : theme.colors.primary + '20' }]}>
                <MaterialCommunityIcons
                  name={isEnabled ? 'shield-check' : 'shield-alert'}
                  size={22}
                  color={isEnabled ? theme.colors.success : theme.colors.primary}
                />
              </View>
              <View style={styles.titleContainer}>
                <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                  Two-Factor (2FA)
                </Text>
                <Text style={[styles.sectionSubtitle, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  {isEnabled ? 'Enabled' : 'Disabled'}
                </Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: isEnabled ? theme.colors.success + '20' : theme.colors.textMuted + '20' }]}>
              <Text style={[styles.statusText, { color: isEnabled ? theme.colors.success : theme.colors.textMuted }]}>
                {isEnabled ? 'ON' : 'OFF'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setExpanded(!expanded)}
              style={styles.expandButton}
            >
              <MaterialCommunityIcons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={theme.colors.textDim}
              />
            </TouchableOpacity>
          </View>

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
                    2FA is Enabled
                  </Text>
                  <Text style={[styles.stateSubtext, { color: theme.colors.textMuted }]}>
                    Your account is protected with two-factor authentication.
                  </Text>
                  <View style={styles.actions}>
                    <CommonButton
                      title="TEST 2FA"
                      onPress={() => setShowTestModal(true)}
                      variant="outline"
                      size="sm"
                      icon="test-tube"
                      fullWidth={false}
                      style={styles.testBtn}
                    />
                    <CommonButton
                      title="DISABLE 2FA"
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
                    2FA is Disabled
                  </Text>
                  <Text style={[styles.stateSubtext, { color: theme.colors.textMuted }]}>
                    Enable two-factor authentication to secure your account.
                  </Text>
                  <CommonButton
                    title="ACTIVATE 2FA"
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
            <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>
                  Thiết lập 2FA
                </Text>
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
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

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

                  {/* Simple Instructions */}
                  <Text style={[styles.simpleInstructions, { color: theme.colors.textMuted }]}>
                    Quét mã QR bằng Google Authenticator, sau đó nhập mã OTP 6 số bên dưới
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
                      title="OPEN GOOGLE AUTHENTICATOR"
                      onPress={openGoogleAuthenticator}
                      variant="secondary"
                      icon="open-in-app"
                      style={styles.modalButton}
                    />
                    <CommonButton
                      title="ENABLE 2FA"
                      onPress={handleConfirmEnable}
                      loading={isLoading}
                      disabled={otpCode.length !== 6}
                      icon="shield-check"
                      style={styles.modalButton}
                    />
                    <CommonButton
                      title="CANCEL"
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
            <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>
                  Kiểm tra 2FA
                </Text>
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
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

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
                    title="VERIFY"
                    onPress={async () => {
                      if (!testOtpCode || testOtpCode.length !== 6) {
                        Alert.alert('Lỗi', 'Vui lòng nhập mã OTP 6 số');
                        return;
                      }

                      clearError();
                      const isValid = await verifyToken(testOtpCode);
                      if (isValid) {
                        Alert.alert(
                          '✅ Success',
                          '2FA working correctly!',
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
                        Alert.alert('❌ Error', error || 'Invalid OTP code.');
                        setTestOtpCode('');
                      }
                    }}
                    icon="check-circle"
                    loading={isLoading}
                    disabled={testOtpCode.length !== 6 || isLoading}
                    style={styles.modalButton}
                  />
                  <CommonButton
                    title="CANCEL"
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
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
});
