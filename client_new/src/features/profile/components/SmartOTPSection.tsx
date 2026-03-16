import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { useSmartOTP } from '../../../shared/hooks';
import { CommonButton, CommonCard } from '../../../components';
import TwoFactorService from '../../../services/two-factor.service';
import type { DeviceBindingInfo } from '../../../types/otp.types';

export const SmartOTPSection: React.FC = () => {
  const { theme } = useTheme();
  const {
    otp,
    timeRemaining,
    isRegistered,
    devices,
    isLoading,
    error,
    registerDevice,
    revokeDevice,
    fetchDevices,
  } = useSmartOTP();

  const [expanded, setExpanded] = useState(false);
  const [devicesExpanded, setDevicesExpanded] = useState(false);
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authCode, setAuthCode] = useState('');

  useEffect(() => {
    const check2FA = async () => {
      try {
        const status = await TwoFactorService.getStatus();
        setIs2FAEnabled(status.enabled);
      } catch (err) {
        console.error('Check 2FA error:', err);
      }
    };
    check2FA();
  }, []);

  useEffect(() => {
    // Don't auto-expand
  }, [isRegistered]);

  const handleRegister = async () => {
    const registerWithToken = async (token?: string) => {
      const success = await registerDevice(token);
      if (success) {
        Alert.alert('Thành công', 'Thiết bị đã được đăng ký thành công!');
        await fetchDevices();
        setShowAuthModal(false);
        setAuthCode('');
      } else {
        Alert.alert('Lỗi', error || 'Không thể đăng ký thiết bị. Vui lòng kiểm tra mã 2FA.');
      }
    };

    if (is2FAEnabled) {
      if (Platform.OS === 'ios') {
        Alert.prompt(
          'Xác thực 2FA',
          'Vui lòng nhập mã từ ứng dụng Authenticator để đăng ký thiết bị này.',
          [
            { text: 'Hủy', style: 'cancel' },
            {
              text: 'Xác nhận',
              onPress: (token?: string) => registerWithToken(token),
            },
          ],
          'plain-text',
        );
      } else {
        setShowAuthModal(true);
      }
    } else {
      Alert.alert(
        'Đăng ký thiết bị',
        'Bạn có muốn đăng ký thiết bị này cho Smart OTP?',
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Đăng ký',
            onPress: () => registerWithToken(),
          },
        ],
      );
    }
  };

  const handleRevoke = (deviceId: string, deviceName: string) => {
    Alert.alert(
      'Xóa thiết bị',
      `Bạn có chắc chắn muốn xóa thiết bị "${deviceName}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            const success = await revokeDevice(deviceId);
            if (success) {
              Alert.alert('Thành công', 'Thiết bị đã được xóa');
              await fetchDevices();
            } else {
              Alert.alert('Lỗi', error || 'Không thể xóa thiết bị');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.header}
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.7}
        >
          <View style={styles.headerLeft}>
            <View style={[styles.iconWrapper, { backgroundColor: isRegistered ? theme.colors.primary + '15' : theme.colors.textMuted + '15' }]}>
              <MaterialCommunityIcons
                name="shield-lock"
                size={22}
                color={isRegistered ? theme.colors.primary : theme.colors.textMuted}
              />
            </View>
            <View style={styles.titleContainer}>
              <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
                Mã OTP thông minh
              </Text>
              <Text style={[styles.sectionSubtitle, { color: theme.colors.textMuted }]}>
                {isRegistered
                  ? `${devices.length} thiết bị đã đăng ký`
                  : 'Chưa đăng ký thiết bị'}
              </Text>
            </View>
          </View>
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={theme.colors.textDim}
          />
        </TouchableOpacity>

        {expanded && (
          <View style={styles.content}>
            {error && (
              <View style={[styles.errorBox, { backgroundColor: theme.colors.error + '15', borderColor: theme.colors.error + '30', borderWidth: 1 }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color={theme.colors.error} style={{ marginRight: 8 }} />
                <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
              </View>
            )}

            {isRegistered ? (
              <>
                {/* Current OTP Display - nền tối, chữ sáng để tăng độ tương phản */}
                <View style={[styles.otpBox, { backgroundColor: theme.mode === 'dark' ? theme.colors.backgroundTertiary || '#1a1f2e' : '#1a1f2e' }]}>
                  <Text style={[styles.otpLabel, { color: 'rgba(255,255,255,0.7)' }]}>
                    Mã OTP hiện tại
                  </Text>
                  <Text style={[styles.otpCode, { color: '#FFFFFF' }]}>
                    {otp || '--- ---'}
                  </Text>
                  <View style={styles.timerWrapper}>
                    <MaterialCommunityIcons name="clock-outline" size={14} color="rgba(255,255,255,0.6)" />
                    <Text style={[styles.otpTimer, { color: 'rgba(255,255,255,0.7)' }]}>
                      Hiệu lực: {timeRemaining}s
                    </Text>
                  </View>
                </View>

                {/* Devices List - thu gọn, bấm mới mở */}
                <View style={[styles.devicesSection, { backgroundColor: theme.colors.backgroundSecondary, borderRadius: 12, padding: 14, marginBottom: 16 }]}>
                  <TouchableOpacity
                    style={styles.devicesHeaderRow}
                    onPress={() => setDevicesExpanded(!devicesExpanded)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.devicesTitle, { color: theme.colors.textPrimary }]}>
                      Thiết bị đã đăng ký ({devices.length})
                    </Text>
                    <View style={styles.devicesHeaderRight}>
                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); fetchDevices(); }} style={styles.refreshIconBtn} disabled={isLoading}>
                        <MaterialCommunityIcons name="refresh" size={20} color={theme.colors.primary} />
                      </TouchableOpacity>
                      <MaterialCommunityIcons
                        name={devicesExpanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={theme.colors.textDim}
                      />
                    </View>
                  </TouchableOpacity>
                  {devicesExpanded && (
                  <ScrollView style={styles.devicesList}>
                    {devices.map((device: DeviceBindingInfo) => (
                      <View
                        key={device.deviceId}
                        style={[styles.deviceItem, { borderBottomColor: theme.colors.border + '20' }]}
                      >
                        <View style={styles.deviceInfo}>
                          <View style={[styles.deviceIconContainer, { backgroundColor: theme.colors.primary + '10' }]}>
                            <MaterialCommunityIcons
                              name="cellphone"
                              size={20}
                              color={theme.colors.primary}
                            />
                          </View>
                          <View style={styles.deviceDetails}>
                            <Text style={[styles.deviceName, { color: theme.colors.textPrimary }]}>
                              {device.deviceName || 'Thiết bị không xác định'}
                            </Text>
                            <Text
                              style={[styles.deviceMeta, { color: theme.colors.textMuted }]}
                            >
                              {device.fingerprint?.os || 'Hệ điều hành không xác định'} • {device.registeredAt
                                ? new Date(device.registeredAt).toLocaleDateString('vi-VN')
                                : '—'}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleRevoke(device.deviceId, device.deviceName || '')}
                          style={styles.revokeButton}
                        >
                          <MaterialCommunityIcons
                            name="delete-outline"
                            size={20}
                            color={theme.colors.textDim}
                          />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                  )}
                </View>
              </>
            ) : (
              <View style={styles.emptyState}>
                <View style={[styles.emptyIconContainer, { backgroundColor: theme.colors.textMuted + '15' }]}>
                  <MaterialCommunityIcons
                    name="shield-off-outline"
                    size={48}
                    color={theme.colors.textMuted}
                  />
                </View>
                <Text style={[styles.emptyText, { color: theme.colors.textPrimary }]}>
                  Smart OTP chưa bật
                </Text>
                <Text style={[styles.emptySubtext, { color: theme.colors.textMuted }]}>
                  Đăng ký thiết bị này để nhận mã OTP tự động cho các giao dịch bảo mật.
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actions}>
              {!isRegistered && (
                <CommonButton
                  title="Đăng ký thiết bị này"
                  onPress={handleRegister}
                  loading={isLoading}
                  icon="cellphone-check"
                  style={styles.registerBtn}
                />
              )}
            </View>
          </View>
        )}
      </View>

      {/* 2FA Auth Modal for Android fallback */}
      <Modal
        visible={showAuthModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAuthModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContainer}
          >
            <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>Xác thực 2FA</Text>
                <TouchableOpacity onPress={() => setShowAuthModal(false)}>
                  <MaterialCommunityIcons name="close" size={24} color={theme.colors.textDim} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.modalDescription, { color: theme.colors.textSecondary }]}>
                Vui lòng nhập mã 6 số từ ứng dụng Google Authenticator để xác nhận đăng ký thiết bị.
              </Text>

              <View style={[styles.inputWrapper, { borderColor: authCode.length === 6 ? theme.colors.primary : theme.colors.border }]}>
                <TextInput
                  style={[styles.textInput, { color: theme.colors.textPrimary }]}
                  value={authCode}
                  onChangeText={setAuthCode}
                  placeholder="000 000"
                  placeholderTextColor={theme.colors.textDim}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus={true}
                />
              </View>

              <View style={styles.modalFooter}>
                <CommonButton
                  title="Hủy"
                  onPress={() => setShowAuthModal(false)}
                  variant="ghost"
                  style={{ flex: 1 }}
                />
                <CommonButton
                  title="Xác nhận"
                  onPress={() => {
                    const registerWithToken = async (token?: string) => {
                      const success = await registerDevice(token);
                      if (success) {
                        Alert.alert('Thành công', 'Thiết bị đã được đăng ký thành công!');
                        await fetchDevices();
                        setShowAuthModal(false);
                        setAuthCode('');
                      } else {
                        Alert.alert('Lỗi', error || 'Không thể đăng ký thiết bị. Vui lòng kiểm tra mã 2FA.');
                      }
                    };
                    registerWithToken(authCode);
                  }}
                  disabled={authCode.length !== 6 || isLoading}
                  loading={isLoading}
                  style={{ flex: 1.5 }}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    paddingVertical: 14,
    paddingHorizontal: 18,
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
  content: {
    marginTop: 20,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 8,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    flex: 1,
  },
  otpBox: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  otpLabel: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 10,
    letterSpacing: 1,
  },
  otpCode: {
    fontSize: 32,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 8,
    marginBottom: 8,
  },
  timerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  otpTimer: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  devicesSection: {
    marginBottom: 4,
  },
  devicesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  devicesHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  refreshIconBtn: {
    padding: 6,
  },
  devicesTitle: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 12,
  },
  devicesList: {
    maxHeight: 180,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  deviceIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceDetails: {
    marginLeft: 12,
    flex: 1,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
  },
  deviceMeta: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    marginTop: 2,
  },
  revokeButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  actions: {
    marginTop: 10,
  },
  registerBtn: {
    width: '100%',
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
  },
  refreshBtn: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  refreshBtnText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
  },
  modalDescription: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 24,
  },
  inputWrapper: {
    borderWidth: 1.5,
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  textInput: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    textAlign: 'center',
    letterSpacing: 4,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
  },
});
