import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../theme';


interface LockedFeatureOverlayProps {
  message?: string;
  onPressAction?: () => void;
  actionText?: string;
  kycStatus?: string;
  rejectReason?: string | null;
}

const LockedFeatureOverlay: React.FC<LockedFeatureOverlayProps> = ({
  message = 'Tính năng này yêu cầu tài khoản đã được phê duyệt KYC.',
  onPressAction,
  actionText = 'Hoàn tất KYC ngay',
  kycStatus,
  rejectReason,
}) => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const isPending = kycStatus === 'PENDING';
  const isRejected = kycStatus === 'REJECTED';

  // Determine visual config based on status
  const getConfig = () => {
    if (isPending) {
      return {
        icon: 'time-outline' as const,
        iconColor: '#F0B90B',
        iconBg: 'rgba(240, 185, 11, 0.12)',
        title: 'Hồ sơ đang chờ duyệt',
        body: 'Thông tin định danh của bạn đã được gửi. Hệ thống sẽ phê duyệt trong vòng 24h làm việc.',
        btnLabel: 'Đang xử lý...',
        btnDisabled: true,
        btnBg: theme.colors.border,
        btnTextColor: theme.colors.textMuted,
      };
    }
    if (isRejected) {
      return {
        icon: 'close-circle-outline' as const,
        iconColor: '#FF4D4F',
        iconBg: 'rgba(255, 77, 79, 0.12)',
        title: 'Hồ sơ bị từ chối',
        body: rejectReason
          ? `Lý do: ${rejectReason}\n\nVui lòng kiểm tra và nộp lại hồ sơ.`
          : 'Hồ sơ định danh của bạn chưa đạt yêu cầu. Vui lòng nộp lại.',
        btnLabel: 'Nộp lại hồ sơ',
        btnDisabled: false,
        btnBg: theme.colors.primary,
        btnTextColor: theme.colors.onPrimary,
      };
    }
    // Default: NONE / not started
    return {
      icon: 'lock-closed' as const,
      iconColor: theme.colors.warning,
      iconBg: isDark ? 'rgba(240, 185, 11, 0.12)' : '#FFF8E1',
      title: 'Tính năng đang khóa',
      body: message,
      btnLabel: actionText,
      btnDisabled: false,
      btnBg: theme.colors.primary,
      btnTextColor: theme.colors.onPrimary,
    };
  };

  const config = getConfig();

  const handleAction = () => {
    if (config.btnDisabled) return;
    if (onPressAction) {
      onPressAction();
    } else {
      navigation.navigate('KYCIntro');
    }
  };

  return (
    <Animated.View 
      entering={FadeIn.duration(400)}
      layout={LinearTransition}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={[
        styles.content,
        {
          backgroundColor: isDark ? 'rgba(20, 35, 28, 0.92)' : 'rgba(255, 255, 255, 0.95)',
          borderColor: isRejected
            ? 'rgba(255, 77, 79, 0.2)'
            : isDark ? 'rgba(205, 234, 45, 0.15)' : 'rgba(20, 52, 43, 0.08)',
        }
      ]}>
        <View style={[styles.iconContainer, { backgroundColor: config.iconBg }]}>
          <Ionicons name={config.icon} size={32} color={config.iconColor} />
        </View>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
          {config.title}
        </Text>
        <Text style={[styles.message, { color: theme.colors.textSecondary }]}>
          {config.body}
        </Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: config.btnBg }]}
          onPress={handleAction}
          activeOpacity={config.btnDisabled ? 1 : 0.8}
          disabled={config.btnDisabled}
        >
          <Text style={[styles.buttonText, { color: config.btnTextColor }]}>
            {config.btnLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    paddingHorizontal: 24,
  },
  content: {
    alignItems: 'center',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    borderWidth: 1,
    overflow: 'hidden', // Fix lỗi border Android
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
      android: {
        elevation: 8,
      }
    }),
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  button: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 99, // Pill shape
    ...Platform.select({
      ios: {
        shadowColor: '#CDEA2D',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      }
    }),
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

export default LockedFeatureOverlay;
