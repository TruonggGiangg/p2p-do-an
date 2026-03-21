/**
 * FilterBottomSheet — Advanced filter modal for Available Loans
 * Stitch "Luminescent Vault" — tonal surfaces, no borders, glassmorphic accents
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView,
  StyleSheet, Dimensions, Pressable, Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../contexts/ThemeContext';
import type { FilterState } from '../hooks/useFilterState';

interface FilterBottomSheetProps {
  readonly visible: boolean;
  readonly filters: FilterState;
  readonly onApply: (updates: Partial<FilterState>) => void;
  readonly onReset: () => void;
  readonly onClose: () => void;
}

const { height: SCREEN_H } = Dimensions.get('window');

const RISK_OPTIONS = [
  { key: undefined as string | undefined, label: 'Tất cả', icon: 'layers-outline' },
  { key: 'LOW', label: 'An toàn', icon: 'shield-checkmark-outline' },
  { key: 'MEDIUM', label: 'Trung bình', icon: 'alert-circle-outline' },
  { key: 'HIGH', label: 'Rủi ro cao', icon: 'warning-outline' },
];

function formatVND(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(0)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return String(val);
}

export default function FilterBottomSheet({
  visible, filters, onApply, onReset, onClose,
}: FilterBottomSheetProps) {
  const { theme } = useTheme();

  // Local state mirrors filters so user can tweak before applying
  const [minCapital, setMinCapital] = useState<number>(filters.minCapital ?? 1_000_000);
  const [maxCapital, setMaxCapital] = useState<number>(filters.maxCapital ?? 100_000_000);
  const [minRate, setMinRate] = useState<number>(filters.minRate ?? 0.5);
  const [maxRate, setMaxRate] = useState<number>(filters.maxRate ?? 5);
  const [minPeriod, setMinPeriod] = useState<number>(filters.minPeriod ?? 1);
  const [maxPeriod, setMaxPeriod] = useState<number>(filters.maxPeriod ?? 36);
  const [riskLevel, setRiskLevel] = useState<string | undefined>(filters.riskLevel);

  // Sync when modal opens
  useEffect(() => {
    if (visible) {
      setMinCapital(filters.minCapital ?? 1_000_000);
      setMaxCapital(filters.maxCapital ?? 100_000_000);
      setMinRate(filters.minRate ?? 0.5);
      setMaxRate(filters.maxRate ?? 5);
      setMinPeriod(filters.minPeriod ?? 1);
      setMaxPeriod(filters.maxPeriod ?? 36);
      setRiskLevel(filters.riskLevel);
    }
  }, [visible]);

  const handleApply = () => {
    const updates: Partial<FilterState> = {};
    // Only set values if they differ from defaults
    if (minCapital > 1_000_000) updates.minCapital = minCapital;
    else updates.minCapital = undefined;
    if (maxCapital < 100_000_000) updates.maxCapital = maxCapital;
    else updates.maxCapital = undefined;
    if (minRate > 0.5) updates.minRate = minRate;
    else updates.minRate = undefined;
    if (maxRate < 5) updates.maxRate = maxRate;
    else updates.maxRate = undefined;
    if (minPeriod > 1) updates.minPeriod = minPeriod;
    else updates.minPeriod = undefined;
    if (maxPeriod < 36) updates.maxPeriod = maxPeriod;
    else updates.maxPeriod = undefined;
    updates.riskLevel = riskLevel;
    onApply(updates);
    onClose();
  };

  const handleReset = () => {
    setMinCapital(1_000_000);
    setMaxCapital(100_000_000);
    setMinRate(0.5);
    setMaxRate(5);
    setMinPeriod(1);
    setMaxPeriod(36);
    setRiskLevel(undefined);
    onReset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.colors.backgroundSecondary }]} onPress={() => {}}>
          {/* Handle */}
          <View style={styles.handleBar}>
            <View style={[styles.handle, { backgroundColor: theme.colors.textMuted + '40' }]} />
          </View>

          {/* Title */}
          <View style={styles.titleRow}>
            <MaterialCommunityIcons name="tune-variant" size={22} color={theme.colors.primary} />
            <Text style={[styles.title, { color: theme.colors.text }]}>Bộ lọc nâng cao</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollContent}>

            {/* ── Số vốn ── */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>SỐ VỐN</Text>
              <View style={styles.rangeRow}>
                <Text style={[styles.rangeValue, { color: theme.colors.primary }]}>{formatVND(minCapital)}</Text>
                <Text style={[styles.rangeSep, { color: theme.colors.textMuted }]}>—</Text>
                <Text style={[styles.rangeValue, { color: theme.colors.primary }]}>{formatVND(maxCapital)}</Text>
              </View>
              <View style={styles.sliderRow}>
                <Slider
                  style={styles.slider}
                  minimumValue={1_000_000}
                  maximumValue={100_000_000}
                  step={1_000_000}
                  value={minCapital}
                  onValueChange={v => { if (v < maxCapital) setMinCapital(v); }}
                  minimumTrackTintColor={theme.colors.primary}
                  maximumTrackTintColor={theme.colors.textMuted + '30'}
                  thumbTintColor={theme.colors.primary}
                />
                <Slider
                  style={styles.slider}
                  minimumValue={1_000_000}
                  maximumValue={100_000_000}
                  step={1_000_000}
                  value={maxCapital}
                  onValueChange={v => { if (v > minCapital) setMaxCapital(v); }}
                  minimumTrackTintColor={theme.colors.primary}
                  maximumTrackTintColor={theme.colors.textMuted + '30'}
                  thumbTintColor={theme.colors.primary}
                />
              </View>
            </View>

            {/* ── Lãi suất ── */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>LÃI SUẤT (%/THÁNG)</Text>
              <View style={styles.rangeRow}>
                <Text style={[styles.rangeValue, { color: theme.colors.primary }]}>{minRate.toFixed(1)}%</Text>
                <Text style={[styles.rangeSep, { color: theme.colors.textMuted }]}>—</Text>
                <Text style={[styles.rangeValue, { color: theme.colors.primary }]}>{maxRate.toFixed(1)}%</Text>
              </View>
              <View style={styles.sliderRow}>
                <Slider
                  style={styles.slider}
                  minimumValue={0.5}
                  maximumValue={5}
                  step={0.1}
                  value={minRate}
                  onValueChange={v => { if (v < maxRate) setMinRate(v); }}
                  minimumTrackTintColor={theme.colors.primary}
                  maximumTrackTintColor={theme.colors.textMuted + '30'}
                  thumbTintColor={theme.colors.primary}
                />
                <Slider
                  style={styles.slider}
                  minimumValue={0.5}
                  maximumValue={5}
                  step={0.1}
                  value={maxRate}
                  onValueChange={v => { if (v > minRate) setMaxRate(v); }}
                  minimumTrackTintColor={theme.colors.primary}
                  maximumTrackTintColor={theme.colors.textMuted + '30'}
                  thumbTintColor={theme.colors.primary}
                />
              </View>
            </View>

            {/* ── Kỳ hạn ── */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>KỲ HẠN (THÁNG)</Text>
              <View style={styles.rangeRow}>
                <Text style={[styles.rangeValue, { color: theme.colors.primary }]}>{minPeriod} th</Text>
                <Text style={[styles.rangeSep, { color: theme.colors.textMuted }]}>—</Text>
                <Text style={[styles.rangeValue, { color: theme.colors.primary }]}>{maxPeriod} th</Text>
              </View>
              <View style={styles.sliderRow}>
                <Slider
                  style={styles.slider}
                  minimumValue={1}
                  maximumValue={36}
                  step={1}
                  value={minPeriod}
                  onValueChange={v => { if (v < maxPeriod) setMinPeriod(v); }}
                  minimumTrackTintColor={theme.colors.primary}
                  maximumTrackTintColor={theme.colors.textMuted + '30'}
                  thumbTintColor={theme.colors.primary}
                />
                <Slider
                  style={styles.slider}
                  minimumValue={1}
                  maximumValue={36}
                  step={1}
                  value={maxPeriod}
                  onValueChange={v => { if (v > minPeriod) setMaxPeriod(v); }}
                  minimumTrackTintColor={theme.colors.primary}
                  maximumTrackTintColor={theme.colors.textMuted + '30'}
                  thumbTintColor={theme.colors.primary}
                />
              </View>
            </View>

            {/* ── Mức rủi ro ── */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>MỨC RỦI RO</Text>
              <View style={styles.riskRow}>
                {RISK_OPTIONS.map(opt => {
                  const isActive = riskLevel === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key ?? 'all'}
                      style={[
                        styles.riskChip,
                        {
                          backgroundColor: isActive ? theme.colors.primary : theme.colors.surfaceLight,
                        },
                      ]}
                      onPress={() => setRiskLevel(opt.key)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={opt.icon as any}
                        size={14}
                        color={isActive ? theme.colors.onPrimary : theme.colors.textMuted}
                      />
                      <Text style={[
                        styles.riskChipText,
                        { color: isActive ? theme.colors.onPrimary : theme.colors.textSecondary },
                      ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          {/* ── Actions ── */}
          <View style={styles.actions}>
            <TouchableOpacity onPress={handleReset} style={styles.resetBtn} activeOpacity={0.7}>
              <Ionicons name="refresh-outline" size={16} color={theme.colors.error} />
              <Text style={[styles.resetText, { color: theme.colors.error }]}>Xóa bộ lọc</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.applyBtn, { backgroundColor: theme.colors.primary }]}
              onPress={handleApply}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="check-bold" size={18} color={theme.colors.onPrimary} />
              <Text style={[styles.applyText, { color: theme.colors.onPrimary }]}>Áp dụng</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    maxHeight: SCREEN_H * 0.8,
  },
  handleBar: { alignItems: 'center', paddingVertical: 12 },
  handle: { width: 40, height: 4, borderRadius: 2 },

  titleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: 0.2 },

  scrollContent: { paddingHorizontal: 20 },

  // Section
  section: { marginBottom: 22 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },

  // Range display
  rangeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 },
  rangeValue: { fontSize: 16, fontWeight: '800' },
  rangeSep: { fontSize: 14 },

  // Sliders
  sliderRow: { gap: 4 },
  slider: { width: '100%', height: 32 },

  // Risk
  riskRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  riskChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
  },
  riskChipText: { fontSize: 13, fontWeight: '700' },

  // Actions
  actions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 8 },
  resetText: { fontSize: 14, fontWeight: '600' },
  applyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16,
    shadowColor: '#CDEA2D', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  applyText: { fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
});
