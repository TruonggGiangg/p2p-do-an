/**
 * FilterBar — Search + Quick Filter Chips + Sort for Available Loans
 * Stitch "Luminescent Vault" tonal design — no 1px borders, glassmorphic chips
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Animated,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import type { FilterState } from '../hooks/useFilterState';

interface FilterBarProps {
  readonly filters: FilterState;
  readonly activeFilterCount: number;
  readonly onFilterChange: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  readonly onMultiFilterChange: (updates: Partial<FilterState>) => void;
  readonly onOpenFilterSheet: () => void;
}

/* ─── Quick preset chips ─── */
interface QuickChip {
  id: string;
  label: string;
  icon: string;
  iconPack: 'ion' | 'mci';
  filterUpdate: Partial<FilterState>;
}

const QUICK_CHIPS: QuickChip[] = [
  { id: 'all', label: 'Tất cả', icon: 'layers-outline', iconPack: 'ion', filterUpdate: { riskLevel: undefined, minPeriod: undefined, maxPeriod: undefined, minRate: undefined } },
  { id: 'safe', label: 'An toàn', icon: 'shield-checkmark-outline', iconPack: 'ion', filterUpdate: { riskLevel: 'LOW' } },
  { id: 'short', label: '1-6 tháng', icon: 'timer-outline', iconPack: 'ion', filterUpdate: { minPeriod: 1, maxPeriod: 6, riskLevel: undefined } },
  { id: 'mid', label: '6-12 tháng', icon: 'calendar-outline', iconPack: 'ion', filterUpdate: { minPeriod: 6, maxPeriod: 12, riskLevel: undefined } },
  { id: 'highRate', label: 'Lãi cao', icon: 'trending-up', iconPack: 'ion', filterUpdate: { sortBy: 'monthlyRatePercent' as const, sortOrder: 'desc' as const, riskLevel: undefined } },
];

/* ─── Sort options ─── */
interface SortOption {
  label: string;
  sortBy: FilterState['sortBy'];
  sortOrder: FilterState['sortOrder'];
}

const SORT_OPTIONS: SortOption[] = [
  { label: 'Mới nhất', sortBy: 'createdAt', sortOrder: 'desc' },
  { label: 'Lãi suất ↓', sortBy: 'monthlyRatePercent', sortOrder: 'desc' },
  { label: 'Lãi suất ↑', sortBy: 'monthlyRatePercent', sortOrder: 'asc' },
  { label: 'Vốn vay ↓', sortBy: 'capital', sortOrder: 'desc' },
  { label: 'Vốn vay ↑', sortBy: 'capital', sortOrder: 'asc' },
  { label: 'Kỳ hạn ↓', sortBy: 'periodMonth', sortOrder: 'desc' },
  { label: 'Tổng thu ↓', sortBy: 'entirelyPay', sortOrder: 'desc' },
];

export default function FilterBar({
  filters, activeFilterCount,
  onFilterChange, onMultiFilterChange, onOpenFilterSheet,
}: FilterBarProps) {
  const { theme } = useTheme();
  const [showSort, setShowSort] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localSearch, setLocalSearch] = useState(filters.search);

  // Determine active chip
  const activeChipId = (() => {
    if (filters.riskLevel === 'LOW') return 'safe';
    if (filters.minPeriod === 1 && filters.maxPeriod === 6) return 'short';
    if (filters.minPeriod === 6 && filters.maxPeriod === 12) return 'mid';
    if (filters.sortBy === 'monthlyRatePercent' && filters.sortOrder === 'desc' && !filters.riskLevel) return 'highRate';
    if (!filters.riskLevel && filters.minPeriod === undefined && filters.maxPeriod === undefined) return 'all';
    return '';
  })();

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      onFilterChange('search', localSearch);
    }, 500);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [localSearch]);

  // Current sort label
  const currentSortLabel = SORT_OPTIONS.find(
    o => o.sortBy === filters.sortBy && o.sortOrder === filters.sortOrder
  )?.label || 'Mới nhất';

  return (
    <View style={styles.container}>
      {/* ── Search Input ── */}
      <View style={[styles.searchRow, { backgroundColor: theme.colors.surfaceLight }]}>
        <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: theme.colors.text }]}
          placeholder="Tìm theo mục đích vay..."
          placeholderTextColor={theme.colors.textMuted}
          value={localSearch}
          onChangeText={setLocalSearch}
          returnKeyType="search"
        />
        {localSearch.length > 0 && (
          <TouchableOpacity onPress={() => { setLocalSearch(''); onFilterChange('search', ''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Quick Filter Chips ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipContent}>
        {QUICK_CHIPS.map(chip => {
          const isActive = activeChipId === chip.id;
          return (
            <TouchableOpacity
              key={chip.id}
              style={[
                styles.chip,
                {
                  backgroundColor: isActive ? theme.colors.primary : theme.colors.surfaceLight,
                },
              ]}
              onPress={() => onMultiFilterChange(chip.filterUpdate)}
              activeOpacity={0.7}
            >
              {chip.iconPack === 'ion' ? (
                <Ionicons name={chip.icon as any} size={14} color={isActive ? theme.colors.onPrimary : theme.colors.textMuted} />
              ) : (
                <MaterialCommunityIcons name={chip.icon as any} size={14} color={isActive ? theme.colors.onPrimary : theme.colors.textMuted} />
              )}
              <Text style={[styles.chipText, { color: isActive ? theme.colors.onPrimary : theme.colors.textSecondary }]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Sort & Filter Row ── */}
      <View style={styles.sortFilterRow}>
        {/* Sort dropdown */}
        <View style={{ position: 'relative' }}>
          <TouchableOpacity
            style={[styles.sortBtn, { backgroundColor: theme.colors.surfaceLight }]}
            onPress={() => setShowSort(!showSort)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="sort-variant" size={16} color={theme.colors.primary} />
            <Text style={[styles.sortBtnText, { color: theme.colors.text }]}>{currentSortLabel}</Text>
            <Ionicons name={showSort ? 'chevron-up' : 'chevron-down'} size={14} color={theme.colors.textMuted} />
          </TouchableOpacity>

          {/* Sort dropdown menu */}
          {showSort && (
            <View style={[styles.sortDropdown, { backgroundColor: theme.colors.backgroundSecondary }]}>
              {SORT_OPTIONS.map(opt => {
                const isSelected = opt.sortBy === filters.sortBy && opt.sortOrder === filters.sortOrder;
                return (
                  <TouchableOpacity
                    key={`${opt.sortBy}-${opt.sortOrder}`}
                    style={[styles.sortOption, isSelected && { backgroundColor: theme.colors.primaryGlass }]}
                    onPress={() => {
                      onMultiFilterChange({ sortBy: opt.sortBy, sortOrder: opt.sortOrder });
                      setShowSort(false);
                    }}
                  >
                    <Text style={[styles.sortOptionText, { color: isSelected ? theme.colors.primary : theme.colors.text }]}>
                      {opt.label}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={16} color={theme.colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Filter button */}
        <TouchableOpacity
          style={[styles.filterBtn, { backgroundColor: theme.colors.surfaceLight }]}
          onPress={onOpenFilterSheet}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="tune-variant" size={18} color={theme.colors.primary} />
          <Text style={[styles.filterBtnText, { color: theme.colors.text }]}>Bộ lọc</Text>
          {activeFilterCount > 0 && (
            <View style={[styles.filterBadge, { backgroundColor: theme.colors.primary }]}>
              <Text style={[styles.filterBadgeText, { color: theme.colors.onPrimary }]}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 28, paddingHorizontal: 16, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500', paddingVertical: 0 },

  // Chips
  chipScroll: { flexGrow: 0 },
  chipContent: { gap: 8, paddingRight: 4, paddingVertical: 2 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  chipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },

  // Sort & Filter row
  sortFilterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sortBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14,
  },
  sortBtnText: { fontSize: 13, fontWeight: '600' },

  // Sort dropdown
  sortDropdown: {
    position: 'absolute', top: 42, left: 0, zIndex: 999,
    borderRadius: 16, paddingVertical: 6, width: 180,
    shadowColor: '#00110D', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 12,
  },
  sortOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  sortOptionText: { fontSize: 13, fontWeight: '600' },

  // Filter button
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14,
  },
  filterBtnText: { fontSize: 13, fontWeight: '600' },
  filterBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  filterBadgeText: { fontSize: 10, fontWeight: '800' },
});
