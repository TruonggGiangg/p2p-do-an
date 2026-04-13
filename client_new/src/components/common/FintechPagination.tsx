import React, { useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

export interface PaginationProps {
    /** 
     * 'page': Classic numbered buttons
     * 'infinite': Loading more indicator
     */
    readonly mode?: 'page' | 'infinite';

    // ── Page mode props ──
    readonly currentPage?: number;
    readonly totalPages?: number;
    readonly totalCount?: number;
    readonly onPageChange?: (page: number) => void;

    // ── Infinite mode props ──
    readonly loading?: boolean;
    readonly hasMore?: boolean;
    readonly endText?: string;

    // ── Customization ──
    readonly style?: any;
}

/**
 * FintechPagination - A premium pagination component following global UX standards.
 * Features numbered buttons, sliding window (ellipses), and interactive states.
 */
const FintechPagination: React.FC<PaginationProps> = ({
    mode = 'page',
    currentPage = 1,
    totalPages = 1,
    totalCount,
    onPageChange,
    loading = false,
    hasMore = true,
    endText = '— Hết danh sách —',
    style,
}) => {
    const { theme } = useTheme();
    const c = theme.colors;
    const isDark = theme.mode === 'dark';

    // ── Infinite Mode ──
    if (mode === 'infinite') {
        if (loading) {
            return (
                <View style={[styles.infiniteContainer, style]}>
                    <ActivityIndicator size="small" color={c.primary} />
                </View>
            );
        }
        if (!hasMore) {
            return (
                <View style={[styles.infiniteContainer, style]}>
                    <Text style={[styles.endText, { color: c.textMuted }]}>{endText}</Text>
                </View>
            );
        }
        return <View style={styles.spacer} />;
    }

    // ── Page Mode Logic ──
    if (totalPages <= 1) return null;

    /**
     * Logic for generating page numbers with ellipses
     * Example: [1, 2, '...', 7, 8, 9, '...', 15]
     */
    const pageItems = useMemo(() => {
        const items: (number | string)[] = [];
        const siblings = 1; // Number of pages to show on either side of current page

        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) items.push(i);
        } else {
            const leftLimit = Math.max(2, currentPage - siblings);
            const rightLimit = Math.min(totalPages - 1, currentPage + siblings);

            items.push(1);

            if (leftLimit > 2) {
                items.push('...');
            }

            for (let i = leftLimit; i <= rightLimit; i++) {
                items.push(i);
            }

            if (rightLimit < totalPages - 1) {
                items.push('...');
            }

            items.push(totalPages);
        }
        return items;
    }, [currentPage, totalPages]);

    return (
        <View style={[styles.container, style]}>
            <View style={styles.topRow}>
                {/* Information Text */}
                {totalCount !== undefined && (
                    <Text style={[styles.infoText, { color: '#6B7280' }]}>
                        Tổng cộng <Text style={{ color: '#111827', fontWeight: '700' }}>{totalCount.toLocaleString('vi-VN')}</Text> mục
                    </Text>
                )}
                
                {/* Current / Total for quick glance */}
                <Text style={[styles.pageIndicator, { color: '#10B981' }]}>
                    Trang <Text style={{ fontWeight: '700' }}>{currentPage}</Text> / {totalPages}
                </Text>
            </View>

            <View style={styles.controlsRow}>
                {/* Prev Button */}
                <TouchableOpacity
                    style={[
                        styles.navBtn,
                        currentPage === 1 && { opacity: 0.4 }
                    ]}
                    onPress={() => onPageChange?.(currentPage - 1)}
                    disabled={currentPage === 1}
                >
                    <Ionicons name="arrow-back" size={18} color="#374151" />
                </TouchableOpacity>

                {/* Numbered Pages */}
                <View style={styles.numbersRow}>
                    {pageItems.map((item, index) => {
                        const isEllipsis = typeof item === 'string';
                        const isActive = item === currentPage;

                        if (isEllipsis) {
                            return (
                                <View key={`ellipsis-${index}`} style={styles.ellipsis}>
                                    <Text style={{ color: c.textMuted }}>...</Text>
                                </View>
                            );
                        }

                        return (
                            <TouchableOpacity
                                key={`page-${item}`}
                                style={[
                                    styles.numBtn,
                                    isActive && { backgroundColor: '#D1FAE5', borderColor: '#D1FAE5' },
                                    !isActive && { backgroundColor: '#FFFFFF' }
                                ]}
                                onPress={() => onPageChange?.(item as number)}
                                activeOpacity={0.7}
                            >
                                <Text style={[
                                    styles.numText,
                                    { color: isActive ? '#059669' : '#374151' }
                                ]}>
                                    {item}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Next Button */}
                <TouchableOpacity
                    style={[
                        styles.navBtn,
                        currentPage === totalPages && { opacity: 0.4 }
                    ]}
                    onPress={() => onPageChange?.(currentPage + 1)}
                    disabled={currentPage === totalPages}
                >
                    <Ionicons name="arrow-forward" size={18} color="#374151" />
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingVertical: 20,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 16,
        alignItems: 'center',
    },
    infoText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    pageIndicator: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    navBtn: {
        width: 46,
        height: 46,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
    },
    numbersRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    numBtn: {
        width: 46,
        height: 46,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    numText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
    },
    ellipsis: {
        width: 24,
        alignItems: 'center',
    },
    infiniteContainer: {
        paddingVertical: 24,
        alignItems: 'center',
    },
    endText: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
    },
    spacer: {
        height: 60,
    },
});

export default React.memo(FintechPagination);
