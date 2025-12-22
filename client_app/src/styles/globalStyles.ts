import { StyleSheet, Platform } from 'react-native';
import { DarkColors, DarkStyling } from '../theme';

/**
 * Global styles for P2P App
 * Apply these to all screens for consistent look and feel
 */
export const globalStyles = StyleSheet.create({
    // =====================
    // CONTAINERS
    // =====================
    container: {
        flex: 1,
        backgroundColor: DarkColors.background,
    },
    safeArea: {
        flex: 1,
        backgroundColor: DarkColors.background,
    },
    scrollContent: {
        flexGrow: 1,
        padding: 16,
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // =====================
    // CARDS
    // =====================
    card: {
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.md,
        borderWidth: 1,
        borderColor: DarkColors.border,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 3,
    },
    cardGlass: {
        backgroundColor: DarkColors.surfaceGlass,
        borderRadius: DarkStyling.borderRadius.md,
        borderWidth: 1,
        borderColor: DarkColors.borderLight,
        padding: 16,
        marginBottom: 12,
    },
    cardPrimary: {
        backgroundColor: DarkColors.primary,
        borderRadius: DarkStyling.borderRadius.lg,
        padding: 20,
        marginBottom: 16,
    },

    // =====================
    // HEADERS / TITLES
    // =====================
    screenHeader: {
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 50 : 20,
        paddingBottom: 16,
        backgroundColor: DarkColors.surface,
        borderBottomWidth: 1,
        borderBottomColor: DarkColors.border,
    },
    screenTitle: {
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        color: DarkColors.text,
        marginBottom: 4,
    },
    screenSubtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: DarkColors.textSecondary,
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        color: DarkColors.text,
        marginBottom: 12,
        marginTop: 16,
    },

    // =====================
    // TEXT STYLES
    // =====================
    textLarge: {
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
        color: DarkColors.text,
    },
    textMedium: {
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        color: DarkColors.text,
    },
    textRegular: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: DarkColors.text,
    },
    textSmall: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: DarkColors.textSecondary,
    },
    textMuted: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: DarkColors.textMuted,
    },
    textPrimary: {
        color: DarkColors.primary,
    },
    textSuccess: {
        color: DarkColors.success,
    },
    textError: {
        color: DarkColors.error,
    },
    textWarning: {
        color: DarkColors.warning,
    },

    // =====================
    // MONEY / AMOUNTS
    // =====================
    amountLarge: {
        fontSize: 32,
        fontFamily: 'Poppins_700Bold',
        color: DarkColors.text,
    },
    amountMedium: {
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
        color: DarkColors.primary,
    },
    amountSmall: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        color: DarkColors.text,
    },
    currencyLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: DarkColors.textSecondary,
        marginLeft: 4,
    },

    // =====================
    // BUTTONS
    // =====================
    buttonPrimary: {
        backgroundColor: DarkColors.primary,
        borderRadius: DarkStyling.borderRadius.sm,
        paddingVertical: 14,
        paddingHorizontal: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonPrimaryText: {
        color: DarkColors.white,
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
    buttonSecondary: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: DarkColors.primary,
        borderRadius: DarkStyling.borderRadius.sm,
        paddingVertical: 14,
        paddingHorizontal: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonSecondaryText: {
        color: DarkColors.primary,
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
    buttonDisabled: {
        backgroundColor: DarkColors.textMuted,
        opacity: 0.5,
    },

    // =====================
    // INPUT FIELDS
    // =====================
    inputContainer: {
        marginBottom: 16,
    },
    inputLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: DarkColors.textSecondary,
        marginBottom: 8,
    },
    input: {
        backgroundColor: DarkColors.surfaceLight,
        borderRadius: DarkStyling.borderRadius.sm,
        borderWidth: 1,
        borderColor: DarkColors.border,
        paddingVertical: 12,
        paddingHorizontal: 16,
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
        color: DarkColors.text,
    },
    inputFocused: {
        borderColor: DarkColors.primary,
    },
    inputError: {
        borderColor: DarkColors.error,
    },

    // =====================
    // ROW LAYOUTS
    // =====================
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    rowBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    rowWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },

    // =====================
    // LISTS
    // =====================
    listContainer: {
        paddingHorizontal: 16,
        paddingBottom: 100,
    },
    listItem: {
        backgroundColor: DarkColors.surface,
        borderRadius: DarkStyling.borderRadius.md,
        borderWidth: 1,
        borderColor: DarkColors.border,
        padding: 16,
        marginBottom: 12,
    },
    listEmpty: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    listEmptyText: {
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        color: DarkColors.textMuted,
        textAlign: 'center',
        marginTop: 16,
    },

    // =====================
    // BADGES / CHIPS
    // =====================
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: DarkStyling.borderRadius.full,
    },
    badgeText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    chip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: DarkStyling.borderRadius.sm,
        backgroundColor: DarkColors.surfaceLight,
        borderWidth: 1,
        borderColor: DarkColors.border,
    },
    chipText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: DarkColors.textSecondary,
    },
    chipActive: {
        backgroundColor: DarkColors.primary,
        borderColor: DarkColors.primary,
    },
    chipActiveText: {
        color: DarkColors.white,
    },

    // =====================
    // DIVIDERS
    // =====================
    divider: {
        height: 1,
        backgroundColor: DarkColors.border,
        marginVertical: 16,
    },
    dividerLight: {
        height: 1,
        backgroundColor: DarkColors.borderLight,
        marginVertical: 12,
    },

    // =====================
    // SHADOWS
    // =====================
    shadowCard: {
        ...DarkStyling.shadow.card,
    },
    shadowSubtle: {
        ...DarkStyling.shadow.subtle,
    },

    // =====================
    // ICONS
    // =====================
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: DarkStyling.borderRadius.sm,
        backgroundColor: DarkColors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconContainerSmall: {
        width: 36,
        height: 36,
        borderRadius: DarkStyling.borderRadius.xs,
        backgroundColor: DarkColors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconContainerPrimary: {
        backgroundColor: `${DarkColors.primary}20`,
    },

    // =====================
    // STAT CARDS
    // =====================
    statCard: {
        backgroundColor: DarkColors.surfaceLight,
        borderRadius: DarkStyling.borderRadius.md,
        padding: 16,
        flex: 1,
        marginHorizontal: 4,
    },
    statValue: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: DarkColors.text,
        marginTop: 8,
    },
    statLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: DarkColors.textSecondary,
    },

    // =====================
    // PROGRESS
    // =====================
    progressBar: {
        height: 8,
        backgroundColor: DarkColors.surfaceLight,
        borderRadius: DarkStyling.borderRadius.full,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: DarkColors.primary,
        borderRadius: DarkStyling.borderRadius.full,
    },

    // =====================
    // FAB (Floating Action Button)
    // =====================
    fab: {
        position: 'absolute',
        right: 16,
        bottom: 90,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: DarkColors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        ...DarkStyling.shadow.card,
    },

    // =====================
    // LOADING
    // =====================
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: DarkColors.background,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: DarkColors.textSecondary,
    },

    // =====================
    // ERROR / EMPTY STATES
    // =====================
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        backgroundColor: DarkColors.background,
    },
    errorText: {
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        color: DarkColors.error,
        textAlign: 'center',
        marginTop: 16,
    },
    errorButton: {
        marginTop: 24,
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: DarkColors.primary,
        borderRadius: DarkStyling.borderRadius.sm,
    },
});

/**
 * Helper to get status colors
 */
export const getStatusStyle = (status: string) => {
    const statusMap: Record<string, { color: string; bg: string }> = {
        waiting: { color: DarkColors.warning, bg: `${DarkColors.warning}20` },
        pending: { color: DarkColors.warning, bg: `${DarkColors.warning}20` },
        approved: { color: DarkColors.success, bg: `${DarkColors.success}20` },
        success: { color: DarkColors.success, bg: `${DarkColors.success}20` },
        active: { color: DarkColors.primary, bg: `${DarkColors.primary}20` },
        on_going: { color: DarkColors.primary, bg: `${DarkColors.primary}20` },
        done: { color: DarkColors.textMuted, bg: `${DarkColors.textMuted}20` },
        closed: { color: DarkColors.textMuted, bg: `${DarkColors.textMuted}20` },
        clean: { color: DarkColors.textMuted, bg: `${DarkColors.textMuted}20` },
        overdue: { color: DarkColors.error, bg: `${DarkColors.error}20` },
        fail: { color: DarkColors.error, bg: `${DarkColors.error}20` },
        rejected: { color: DarkColors.error, bg: `${DarkColors.error}20` },
    };
    return statusMap[status?.toLowerCase()] || { color: DarkColors.textSecondary, bg: `${DarkColors.textSecondary}20` };
};

/**
 * Format currency for display
 */
export const formatCurrency = (amount: number | undefined): string => {
    if (!amount && amount !== 0) return '0';
    return amount.toLocaleString('vi-VN');
};

/**
 * Format percentage
 */
export const formatPercent = (value: number): string => {
    return `${value.toFixed(1)}%`;
};
