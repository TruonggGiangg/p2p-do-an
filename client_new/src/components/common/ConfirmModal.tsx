/**
 * ConfirmModal — Reusable modal to replace all Alert.alert usage.
 *
 * Usage (imperative via context):
 *   const modal = useConfirmModal();
 *   modal.show({ title: 'Xóa?', message: 'Bạn chắc chắn muốn xóa?', confirmText: 'Xóa', variant: 'danger', onConfirm: () => {...} });
 *   modal.alert({ title: 'Lỗi', message: 'Có lỗi xảy ra' });
 */
import React, { createContext, useContext, useCallback, useState, useRef } from 'react';
import {
    Animated,
    Dimensions,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ModalVariant = 'default' | 'danger' | 'success' | 'warning';

export interface ConfirmModalConfig {
    title: string;
    message?: string;
    /** Primary action label (default: "OK") */
    confirmText?: string;
    /** Secondary action label — if provided shows two buttons */
    cancelText?: string;
    variant?: ModalVariant;
    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void;
    /** Icon name from MaterialCommunityIcons */
    icon?: string;
}

interface ConfirmModalContextType {
    /** Show a confirm/alert modal */
    show: (config: ConfirmModalConfig) => void;
    /** Shorthand for simple info alert */
    alert: (title: string, message?: string, onDismiss?: () => void) => void;
    /** Shorthand for error alert */
    error: (title: string, message?: string, onDismiss?: () => void) => void;
    /** Shorthand for success alert */
    success: (title: string, message?: string, onDismiss?: () => void) => void;
    /** Confirm dialog with two buttons */
    confirm: (config: Omit<ConfirmModalConfig, 'cancelText'> & { cancelText?: string }) => void;
    hide: () => void;
}

const ConfirmModalContext = createContext<ConfirmModalContextType>({
    show: () => { },
    alert: () => { },
    error: () => { },
    success: () => { },
    confirm: () => { },
    hide: () => { },
});

export const useConfirmModal = () => useContext(ConfirmModalContext);

const VARIANT_CONFIG: Record<ModalVariant, { icon: string; color: string }> = {
    default: { icon: 'information-outline', color: '#3B82F6' },
    danger: { icon: 'alert-circle-outline', color: '#EF4444' },
    success: { icon: 'check-circle-outline', color: '#10B981' },
    warning: { icon: 'alert-outline', color: '#F59E0B' },
};

export function ConfirmModalProvider({ children }: { children: React.ReactNode }) {
    const { theme } = useTheme();
    const c = theme.colors;
    const isDark = theme.mode === 'dark';

    const [visible, setVisible] = useState(false);
    const [config, setConfig] = useState<ConfirmModalConfig | null>(null);
    const scaleAnim = useRef(new Animated.Value(0.85)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    const animateIn = useCallback(() => {
        scaleAnim.setValue(0.85);
        opacityAnim.setValue(0);
        Animated.parallel([
            Animated.spring(scaleAnim, { toValue: 1, damping: 20, stiffness: 300, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();
    }, [scaleAnim, opacityAnim]);

    const animateOut = useCallback((cb?: () => void) => {
        Animated.parallel([
            Animated.timing(scaleAnim, { toValue: 0.85, duration: 150, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        ]).start(() => {
            setVisible(false);
            setConfig(null);
            cb?.();
        });
    }, [scaleAnim, opacityAnim]);

    const hide = useCallback(() => animateOut(), [animateOut]);

    const show = useCallback((cfg: ConfirmModalConfig) => {
        setConfig(cfg);
        setVisible(true);
        setTimeout(animateIn, 50);
    }, [animateIn]);

    const alert = useCallback((title: string, message?: string, onDismiss?: () => void) => {
        show({ title, message, confirmText: 'OK', variant: 'default', onConfirm: onDismiss });
    }, [show]);

    const error = useCallback((title: string, message?: string, onDismiss?: () => void) => {
        show({ title, message, confirmText: 'OK', variant: 'danger', onConfirm: onDismiss });
    }, [show]);

    const success = useCallback((title: string, message?: string, onDismiss?: () => void) => {
        show({ title, message, confirmText: 'OK', variant: 'success', onConfirm: onDismiss });
    }, [show]);

    const confirm = useCallback((cfg: Omit<ConfirmModalConfig, 'cancelText'> & { cancelText?: string }) => {
        show({ cancelText: 'Huỷ', ...cfg });
    }, [show]);

    const variant = config?.variant ?? 'default';
    const variantCfg = VARIANT_CONFIG[variant];
    const iconName = config?.icon || variantCfg.icon;
    const accentColor = variantCfg.color;

    const surfaceBg = isDark ? '#1E2A25' : '#FFFFFF';
    const overlayBg = 'rgba(0,0,0,0.5)';

    const handleConfirm = () => {
        animateOut(() => config?.onConfirm?.());
    };

    const handleCancel = () => {
        animateOut(() => config?.onCancel?.());
    };

    const hasTwoButtons = !!config?.cancelText;

    return (
        <ConfirmModalContext.Provider value={{ show, alert, error, success, confirm, hide }}>
            {children}
            <Modal
                visible={visible}
                transparent
                animationType="none"
                statusBarTranslucent
                onRequestClose={handleCancel}
            >
                <Pressable style={[styles.overlay, { backgroundColor: overlayBg }]} onPress={hasTwoButtons ? handleCancel : handleConfirm}>
                    <Animated.View
                        style={[
                            styles.card,
                            {
                                backgroundColor: surfaceBg,
                                transform: [{ scale: scaleAnim }],
                                opacity: opacityAnim,
                            },
                        ]}
                    >
                        <Pressable>
                            {/* Icon */}
                            <View style={[styles.iconWrap, { backgroundColor: accentColor + '15' }]}>
                                <MaterialCommunityIcons name={iconName as any} size={32} color={accentColor} />
                            </View>

                            {/* Title */}
                            <Text style={[styles.title, { color: isDark ? '#F5F5F0' : '#1A1A1A' }]}>
                                {config?.title}
                            </Text>

                            {/* Message */}
                            {config?.message ? (
                                <Text style={[styles.message, { color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }]}>
                                    {config.message}
                                </Text>
                            ) : null}

                            {/* Actions */}
                            <View style={[styles.actions, hasTwoButtons && styles.actionsRow]}>
                                {hasTwoButtons && (
                                    <TouchableOpacity
                                        style={[
                                            styles.button,
                                            styles.cancelButton,
                                            { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9', flex: 1 },
                                        ]}
                                        onPress={handleCancel}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.cancelText, { color: isDark ? '#F5F5F0' : '#374151' }]}>
                                            {config?.cancelText}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                    style={[
                                        styles.button,
                                        styles.confirmButton,
                                        { backgroundColor: accentColor, flex: hasTwoButtons ? 1 : undefined },
                                    ]}
                                    onPress={handleConfirm}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.confirmText}>
                                        {config?.confirmText || 'OK'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </Pressable>
                    </Animated.View>
                </Pressable>
            </Modal>
        </ConfirmModalContext.Provider>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    card: {
        width: '100%',
        maxWidth: SCREEN_WIDTH - 64,
        borderRadius: 24,
        padding: 28,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 12,
    },
    iconWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 8,
    },
    message: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 21,
        marginBottom: 24,
    },
    actions: {
        width: '100%',
        marginTop: 8,
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    button: {
        height: 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cancelButton: {},
    confirmButton: {
        minWidth: 120,
    },
    cancelText: {
        fontSize: 15,
        fontWeight: '600',
    },
    confirmText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FFFFFF',
    },
});
