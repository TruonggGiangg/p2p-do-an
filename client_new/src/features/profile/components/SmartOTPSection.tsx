import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { useSmartOTP } from '../../../shared/hooks';
import { CommonButton, CommonCard } from '../../../components';
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

  useEffect(() => {
    if (!isRegistered) setExpanded(true);
  }, [isRegistered]);

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
    <CommonCard style={styles.card}>
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
                Smart OTP
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
                {/* Current OTP Display */}
                <View style={[styles.otpBox, { backgroundColor: theme.colors.primary + '10' }]}>
                  <Text style={[styles.otpLabel, { color: theme.colors.textMuted }]}>
                    CURRENT OTP CODE
                  </Text>
                  <Text style={[styles.otpCode, { color: theme.colors.primary }]}>
                    {otp || '--- ---'}
                  </Text>
                  <View style={styles.timerWrapper}>
                    <MaterialCommunityIcons name="clock-outline" size={14} color={theme.colors.textDim} />
                    <Text style={[styles.otpTimer, { color: theme.colors.textMuted }]}>
                      Expires in: {timeRemaining}s
                    </Text>
                  </View>
                </View>

                {/* Devices List */}
                <View style={styles.devicesSection}>
                  <Text style={[styles.devicesTitle, { color: theme.colors.textPrimary }]}>
                    Registered Devices
                  </Text>
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
                              {device.deviceName || 'Unknown Device'}
                            </Text>
                            <Text
                              style={[styles.deviceMeta, { color: theme.colors.textMuted }]}
                            >
                              {device.fingerprint?.os || 'Unknown OS'} • {device.registeredAt
                                ? new Date(device.registeredAt).toLocaleDateString('vi-VN')
                                : 'N/A'}
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
                    name="shield-off-outline"
                    size={48}
                    color={theme.colors.textMuted}
                  />
                </View>
                <Text style={[styles.emptyText, { color: theme.colors.textPrimary }]}>
                  Smart OTP Disabled
                </Text>
                <Text style={[styles.emptySubtext, { color: theme.colors.textMuted }]}>
                  Register this device to receive automatic OTP codes for secure transactions.
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actions}>
              {!isRegistered ? (
                <CommonButton
                  title="REGISTER THIS DEVICE"
                  onPress={handleRegister}
                  loading={isLoading}
                  icon="cellphone-check"
                  style={styles.registerBtn}
                />
              ) : (
                <CommonButton
                  title="REFRESH DEVICES"
                  onPress={fetchDevices}
                  loading={isLoading}
                  variant="outline"
                  icon="refresh"
                  style={styles.refreshBtn}
                />
              )}
            </View>
          </View>
        )}
      </View>
    </CommonCard>
  );
};

const styles = StyleSheet.create({
  card: {
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
    marginBottom: 20,
  },
  devicesTitle: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 12,
  },
  devicesList: {
    maxHeight: 240,
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
});
