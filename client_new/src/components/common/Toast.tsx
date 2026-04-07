/**
 * Toast — slide-in notification from top-right
 * Usage:
 *   const toast = useToast();
 *   toast.show({ type: 'success', title: '...', message: '...' });
 */
import React, { createContext, useContext, useCallback, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ToastType = 'success' | 'error' | 'info';

interface ToastConfig {
    type?: ToastType;
    title: string;
    message?: string;
    duration?: number;
}

interface ToastContextType {
    show: (config: ToastConfig) => void;
}

const ToastContext = createContext<ToastContextType>({ show: () => { } });

export const useToast = () => useContext(ToastContext);

const ICON_MAP: Record<ToastType, string> = {
    success: 'check-circle-outline',
    error: 'alert-circle-outline',
    info: 'information-outline',
};

const TYPE_LABEL: Record<ToastType, string> = {
    success: 'THANH CONG',
    error: 'LOI',
    info: 'THONG BAO',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const { theme } = useTheme();
    const c = theme.colors;
    const insets = useSafeAreaInsets();
    const translateX = useRef(new Animated.Value(SCREEN_WIDTH + 20)).current;
    const [current, setCurrent] = useState<ToastConfig | null>(null);
    const hideTimer = useRef<NodeJS.Timeout | null>(null);

    const hide = useCallback(() => {
        Animated.timing(translateX, {
            toValue: SCREEN_WIDTH + 20,
            duration: 250,
            useNativeDriver: true,
        }).start(() => setCurrent(null));
    }, [translateX]);

    const show = useCallback(
        (config: ToastConfig) => {
            if (hideTimer.current) clearTimeout(hideTimer.current);
            setCurrent(config);
            translateX.setValue(SCREEN_WIDTH + 20);

            Animated.spring(translateX, {
                toValue: 0,
                damping: 18,
                stiffness: 180,
                useNativeDriver: true,
            }).start();

            hideTimer.current = setTimeout(() => {
                hide();
            }, config.duration ?? 3500);
        },
        [translateX, hide],
    );

    const type = current?.type ?? 'success';
    const typePalette =
        type === 'success'
            ? { accent: c.success, soft: c.successGlass, border: c.successBorder }
            : type === 'error'
                ? { accent: c.error, soft: c.errorGlass, border: c.errorBorder }
                : { accent: c.tertiary, soft: c.accentGlass, border: c.primaryBorder };

    return (
        <ToastContext.Provider value={{ show }}>
            {children}
            {current && (
                <Animated.View
                    style={[
                        styles.container,
                        {
                            top: Math.max(insets.top, 44) + 8,
                            transform: [{ translateX }],
                        },
                    ]}
                    pointerEvents="box-none"
                >
                    <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={hide}
                        style={[
                            styles.toast,
                            {
                                backgroundColor: c.backgroundSecondary,
                                borderColor: typePalette.border,
                            },
                        ]}
                    >
                        <View style={[styles.leftRail, { backgroundColor: typePalette.accent }]} />
                        <View style={[styles.iconWrap, { backgroundColor: typePalette.soft }]}>
                            <MaterialCommunityIcons
                                name={ICON_MAP[type] as any}
                                size={22}
                                color={typePalette.accent}
                            />
                        </View>
                        <View style={styles.textWrap}>
                            <View style={styles.titleRow}>
                                <Text style={[styles.typeLabel, { color: typePalette.accent }]} numberOfLines={1}>
                                    {TYPE_LABEL[type]}
                                </Text>
                                <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>
                                    {current.title}
                                </Text>
                            </View>
                            {current.message ? (
                                <Text style={[styles.message, { color: c.textSecondary }]} numberOfLines={2}>
                                    {current.message}
                                </Text>
                            ) : null}
                        </View>
                        <MaterialCommunityIcons
                            name="close"
                            size={16}
                            color={c.textSecondary}
                            style={{ marginLeft: 6 }}
                        />
                    </TouchableOpacity>
                </Animated.View>
            )}
        </ToastContext.Provider>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        right: 12,
        left: 12,
        zIndex: 9999,
    },
    toast: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        borderWidth: 1,
        paddingVertical: 12,
        paddingHorizontal: 12,
        overflow: 'hidden',
    },
    leftRail: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        borderTopLeftRadius: 16,
        borderBottomLeftRadius: 16,
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
        marginLeft: 4,
    },
    textWrap: {
        flex: 1,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    typeLabel: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.7,
    },
    title: {
        flex: 1,
        fontSize: 13,
        fontWeight: '700',
    },
    message: {
        fontSize: 12,
        marginTop: 2,
        lineHeight: 16,
    },
});
