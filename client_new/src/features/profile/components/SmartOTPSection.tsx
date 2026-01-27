import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { GlassCard, GlassButton } from '../../../components';
import { useSmartOTP } from '../../../shared/hooks';
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

  const handleRegister = async () => {
    Alert.alert(
      'Đăng ký thiết bị',
      'Bạn có muốn đăng ký thiết bị này cho Smart OTP?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đăng ký',
          onPress: async () => {
            const success = await registerDevice();
            if (success) {
              Alert.alert('Thành công', 'Thiết bị đã được đăng ký thành công!');
              await fetchDevices();
            } else {
              Alert.alert('Lỗi', error || 'Không thể đăng ký thiết bị');
            }
          },
        },
      ],
    );
  };

  const handleRevoke = (deviceId: string, deviceName: string) => {
    Alert.alert(
      'Thu hồi thiết bị',
      `Bạn có chắc muốn thu hồi thiết bị "${deviceName}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Thu hồi',
          style: 'destructive',
          onPress: async () => {
            const success = await revokeDevice(deviceId);
            if (success) {
              Alert.alert('Thành công', 'Thiết bị đã được thu hồi');
              await fetchDevices();
            } else {
              Alert.alert('Lỗi', error || 'Không thể thu hồi thiết bị');
            }
          },
        },
      ],
    );
  };

  return (
    <GlassCard>
      <View style={styles.section}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons
              name="shield-lock"
              size={28}
              color={theme.colors.primary}
              style={styles.icon}
            />
            <View>
              <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
                Smart OTP
              </Text>
              <Text style={[styles.sectionSubtitle, { color: theme.colors.textMuted }]}>
                {isRegistered
                  ? `${devices.length} thiết bị đã đăng ký`
                  : 'Chưa đăng ký thiết bị'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => setExpanded(!expanded)}
            style={styles.expandButton}
          >
            <MaterialCommunityIcons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={24}
              color={theme.colors.textSecondary}
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

            {isRegistered ? (
              <>
                {/* Current OTP Display */}
                <View style={[styles.otpBox, { backgroundColor: theme.colors.primaryGlass }]}>
                  <Text style={[styles.otpLabel, { color: theme.colors.textSecondary }]}>
                    Mã OTP hiện tại
                  </Text>
                  <Text style={[styles.otpCode, { color: theme.colors.primary }]}>
                    {otp || '--- ---'}
                  </Text>
                  <Text style={[styles.otpTimer, { color: theme.colors.textMuted }]}>
                    Còn lại: {timeRemaining}s
                  </Text>
                </View>

                {/* Devices List */}
                <View style={styles.devicesSection}>
                  <Text style={[styles.devicesTitle, { color: theme.colors.textPrimary }]}>
                    Thiết bị đã đăng ký ({devices.length})
                  </Text>
                  <ScrollView style={styles.devicesList}>
                    {devices.map((device: DeviceBindingInfo) => (
                      <View
                        key={device.deviceId}
                        style={[styles.deviceItem, { borderColor: theme.colors.border }]}
                      >
                        <View style={styles.deviceInfo}>
                          <View style={[styles.deviceIconContainer, { backgroundColor: theme.colors.primary + '15' }]}>
                            <MaterialCommunityIcons
                              name="cellphone"
                              size={22}
                              color={theme.colors.primary}
                            />
                          </View>
                          <View style={styles.deviceDetails}>
                            <Text style={[styles.deviceName, { color: theme.colors.textPrimary }]}>
                              {device.deviceName || 'Unknown Device'}
                            </Text>
                            <Text
                              style={[styles.deviceMeta, { color: theme.colors.textMuted }]}
                            >
                              {device.fingerprint?.os || 'Unknown OS'} • Đăng ký:{' '}
                              {device.registeredAt
                                ? new Date(device.registeredAt).toLocaleDateString('vi-VN')
                                : 'N/A'}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleRevoke(device.deviceId, device.deviceName || '')}
                          style={[styles.revokeButton, { backgroundColor: theme.colors.error + '20' }]}
                        >
                          <MaterialCommunityIcons
                            name="delete-outline"
                            size={20}
                            color={theme.colors.error}
                          />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </>
            ) : (
              <View style={styles.emptyState}>
                <View style={[styles.emptyIconContainer, { backgroundColor: theme.colors.textMuted + '15' }]}>
                  <MaterialCommunityIcons
                    name="shield-off"
                    size={56}
                    color={theme.colors.textMuted}
                  />
                </View>
                <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                  Chưa đăng ký thiết bị cho Smart OTP
                </Text>
                <Text style={[styles.emptySubtext, { color: theme.colors.textMuted }]}>
                  Đăng ký để bảo vệ tài khoản với mã OTP tự động
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actions}>
              {!isRegistered ? (
                <GlassButton
                  title="ĐĂNG KÝ THIẾT BỊ"
                  onPress={handleRegister}
                  icon="shield-check"
                  loading={isLoading}
                  style={styles.actionButton}
                />
              ) : (
                <GlassButton
                  title="LÀM MỚI DANH SÁCH"
                  onPress={fetchDevices}
                  icon="refresh"
                  loading={isLoading}
                  variant="secondary"
                  style={styles.actionButton}
                />
              )}
            </View>
          </View>
        )}
      </View>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
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
  icon: {
    marginRight: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
  expandButton: {
    padding: 8,
    borderRadius: 8,
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
  },
  errorText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    flex: 1,
  },
  otpBox: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  otpLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  otpCode: {
    fontSize: 36,
    fontWeight: 'bold',
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 10,
    marginBottom: 10,
  },
  otpTimer: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
  devicesSection: {
    marginBottom: 20,
  },
  devicesTitle: {
    fontSize: 17,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 16,
  },
  devicesList: {
    maxHeight: 240,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  deviceIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceDetails: {
    marginLeft: 14,
    flex: 1,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 4,
  },
  deviceMeta: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    lineHeight: 18,
  },
  revokeButton: {
    padding: 10,
    borderRadius: 8,
    marginLeft: 12,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  actions: {
    marginTop: 12,
  },
  actionButton: {
    width: '100%',
    minHeight: 52,
  },
});
