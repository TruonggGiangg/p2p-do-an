/**
 * Pagination — Shared pagination component
 * Supports two modes:
 * - "page": Classic prev/next buttons with page indicator
 * - "infinite": Loading more indicator + end-of-list text
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

export interface PaginationProps {
  /** Which pagination style to render */
  readonly mode: 'page' | 'infinite';

  // ── Page mode ──
  readonly currentPage?: number;
  readonly totalPages?: number;
  readonly totalCount?: number;
  readonly onPageChange?: (page: number) => void;

  // ── Infinite mode ──
  readonly loading?: boolean;
  readonly hasMore?: boolean;
  /** Custom "end of list" text */
  readonly endText?: string;
}

export default function Pagination({
  mode,
  currentPage = 1,
  totalPages = 1,
  totalCount,
  onPageChange,
  loading = false,
  hasMore = true,
  endText = '— Hết —',
}: PaginationProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  // ═══ Infinite scroll mode ═══
  if (mode === 'infinite') {
    if (loading) {
      return (
        <ActivityIndicator
          style={styles.infiniteLoader}
          size="small"
          color={c.primary}
        />
      );
    }
    if (!hasMore) {
      return (
        <Text style={[styles.endText, { color: c.textSecondary }]}>
          {endText}
        </Text>
      );
    }
    return <View style={styles.spacer} />;
  }

  // ═══ Page-based mode ═══
  if (totalPages <= 1) return null;

  const isFirst = currentPage <= 1;
  const isLast = currentPage >= totalPages;

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceLight || c.backgroundSecondary }]}>
      {/* Prev button */}
      <TouchableOpacity
        style={[styles.navBtn, { opacity: isFirst ? 0.3 : 1 }]}
        onPress={() => onPageChange?.(currentPage - 1)}
        disabled={isFirst}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chevron-back" size={20} color={c.text} />
      </TouchableOpacity>

      {/* Page indicator */}
      <View style={styles.pageInfo}>
        <Text style={[styles.pageCurrent, { color: c.primary }]}>
          {currentPage}
        </Text>
        <Text style={[styles.pageSep, { color: c.textMuted }]}>/</Text>
        <Text style={[styles.pageSep, { color: c.textMuted }]}>
          {totalPages}
        </Text>
      </View>

      {/* Next button */}
      <TouchableOpacity
        style={[styles.navBtn, { opacity: isLast ? 0.3 : 1 }]}
        onPress={() => onPageChange?.(currentPage + 1)}
        disabled={isLast}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chevron-forward" size={20} color={c.text} />
      </TouchableOpacity>

      {/* Total count */}
      {totalCount != null && (
        <Text style={[styles.totalText, { color: c.textMuted }]}>
          {totalCount.toLocaleString('vi-VN')} mục
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Page mode ──
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 8,
    gap: 4,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    marginHorizontal: 12,
  },
  pageCurrent: {
    fontSize: 18,
    fontWeight: '800',
  },
  pageSep: {
    fontSize: 14,
    fontWeight: '500',
  },
  totalText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 12,
  },

  // ── Infinite mode ──
  infiniteLoader: {
    paddingVertical: 20,
  },
  endText: {
    textAlign: 'center',
    fontSize: 12,
    paddingVertical: 20,
  },
  spacer: {
    height: 80,
  },
});
