/**
 * FilterBottomSheet — Bộ lọc nâng cao cho Available Loans
 * Design: Stitch "Lendify VN" – slider + quick-select chips
 * Slider cho kiểm soát chính xác, Chips cho thao tác nhanh
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView,
  StyleSheet, Dimensions, Pressable, Platform,
} from 'react-native';
import RangeSlider from './RangeSlider';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import type { FilterState } from '../hooks/useFilterState';

/* ── Props ── */
interface FilterBottomSheetProps {
  readonly visible: boolean;
  readonly filters: FilterState;
  readonly onApply: (updates: Partial<FilterState>) => void;
  readonly onReset: () => void;
  readonly onClose: () => void;
}

const { height: SCREEN_H } = Dimensions.get('window');

/* ── Presets ── */
const CAPITAL_PRESETS = [
  { label: '< 5M', min: 1_000_000, max: 5_000_000 },
  { label: '5–20M', min: 5_000_000, max: 20_000_000 },
  { label: '20–50M', min: 20_000_000, max: 50_000_000 },
  { label: '50–100M', min: 50_000_000, max: 100_000_000 },
];

const RATE_PRESETS = [
  { label: '< 1%', min: 0.5, max: 1 },
  { label: '1–2%', min: 1, max: 2 },
  { label: '2–3%', min: 2, max: 3 },
  { label: '> 3%', min: 3, max: 5 },
];

const TERM_OPTIONS = [
  { label: 'Tất cả', value: null as number | null },
  { label: '3 th', value: 3 },
  { label: '6 th', value: 6 },
  { label: '12 th', value: 12 },
  { label: '24 th', value: 24 },
  { label: '36 th', value: 36 },
];

const RISK_OPTIONS: { key: string | undefined; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: undefined, label: 'Tất cả', icon: 'shield-outline' },
  { key: 'LOW', label: 'An toàn', icon: 'shield-checkmark-outline' },
  { key: 'MEDIUM', label: 'Trung bình', icon: 'alert-circle-outline' },
  { key: 'HIGH', label: 'Rủi ro cao', icon: 'warning-outline' },
];

const SORT_OPTIONS: { key: FilterState['sortBy']; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'createdAt', label: 'Mới nhất', icon: 'time-outline' },
  { key: 'capital', label: 'Số vốn', icon: 'cash-outline' },
  { key: 'monthlyRatePercent', label: 'Lãi suất', icon: 'trending-up-outline' },
  { key: 'periodMonth', label: 'Kỳ hạn', icon: 'calendar-outline' },
  { key: 'entirelyPay', label: 'Tổng trả', icon: 'wallet-outline' },
];

/* ── Helpers ── */
function fmtVND(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

/* ════════════════════════════════════════════════════════ */
export default function FilterBottomSheet({
  visible, filters, onApply, onReset, onClose,
}: FilterBottomSheetProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  // ── Local state ──
  const [minCap, setMinCap] = useState(1_000_000);
  const [maxCap, setMaxCap] = useState(100_000_000);
  const [minRate, setMinRate] = useState(0.5);
  const [maxRate, setMaxRate] = useState(5);
  const [term, setTerm] = useState<number | null>(null);
  const [risk, setRisk] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<FilterState['sortBy']>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Sync when modal opens
  useEffect(() => {
    if (!visible) return;
    setMinCap(filters.minCapital ?? 1_000_000);
    setMaxCap(filters.maxCapital ?? 100_000_000);
    setMinRate(filters.minRate ?? 0.5);
    setMaxRate(filters.maxRate ?? 5);
    if (filters.minPeriod && filters.minPeriod === filters.maxPeriod) {
      setTerm(filters.minPeriod);
    } else {
      setTerm(null);
    }
    setRisk(filters.riskLevel);
    setSortBy(filters.sortBy || 'createdAt');
    setSortOrder(filters.sortOrder || 'desc');
  }, [visible]);

  // ── Preset handlers ──
  const selectCapPreset = useCallback((p: typeof CAPITAL_PRESETS[0]) => {
    setMinCap(p.min);
    setMaxCap(p.max);
  }, []);

  const selectRatePreset = useCallback((p: typeof RATE_PRESETS[0]) => {
    setMinRate(p.min);
    setMaxRate(p.max);
  }, []);

  const isCapPresetActive = (p: typeof CAPITAL_PRESETS[0]) =>
    minCap === p.min && maxCap === p.max;

  const isRatePresetActive = (p: typeof RATE_PRESETS[0]) =>
    minRate === p.min && maxRate === p.max;

  // ── Apply & Reset ──
  const handleApply = () => {
    const u: Partial<FilterState> = {};
    u.minCapital = minCap > 1_000_000 ? minCap : undefined;
    u.maxCapital = maxCap < 100_000_000 ? maxCap : undefined;
    u.minRate = minRate > 0.5 ? minRate : undefined;
    u.maxRate = maxRate < 5 ? maxRate : undefined;
    u.minPeriod = term ?? undefined;
    u.maxPeriod = term ?? undefined;
    u.riskLevel = risk;
    u.sortBy = sortBy;
    u.sortOrder = sortOrder;
    onApply(u);
    onClose();
  };

  const handleReset = () => {
    setMinCap(1_000_000); setMaxCap(100_000_000);
    setMinRate(0.5); setMaxRate(5);
    setTerm(null); setRisk(undefined);
    setSortBy('createdAt'); setSortOrder('desc');
    onReset(); onClose();
  };

  /* ── Reusable sub-components ── */
  const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[s.chip, { backgroundColor: active ? c.primary : (c.surfaceLight || c.backgroundSecondary || '#F0F0F0') }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[s.chipTxt, { color: active ? (c.background || '#000') : (c.textSecondary || '#666') }, active && { fontWeight: '700' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={[s.sheet, { backgroundColor: c.backgroundSecondary || c.background }]} onPress={() => {}}>

          {/* Handle */}
          <View style={s.handleWrap}>
            <View style={[s.handle, { backgroundColor: (c.textMuted || '#999') + '40' }]} />
          </View>

          {/* Header */}
          <View style={s.header}>
            <View style={s.headerL}>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={c.text} />
              </TouchableOpacity>
              <Text style={[s.headerTitle, { color: c.text }]}>Bộ lọc nâng cao</Text>
            </View>
            <TouchableOpacity onPress={handleReset}>
              <Text style={[s.headerReset, { color: c.primary }]}>Đặt lại</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollInner}>

            {/* ═══ SỐ VỐN ═══ */}
            <View style={s.section}>
              <View style={s.sectionHead}>
                <Text style={[s.sectionLabel, { color: c.textSecondary }]}>SỐ VỐN</Text>
                <Text style={[s.sectionValue, { color: c.primary }]}>{fmtVND(minCap)} – {fmtVND(maxCap)}</Text>
              </View>
              <RangeSlider
                min={1_000_000} max={100_000_000} step={1_000_000}
                low={minCap} high={maxCap}
                onValueChange={(lo, hi) => { setMinCap(lo); setMaxCap(hi); }}
                trackColor={(c.textMuted || '#999') + '25'}
                activeColor={c.primary}
                thumbColor={c.primary}
                labelColor={c.textMuted || '#999'}
                formatLabel={fmtVND}
              />
              {/* Quick presets */}
              <View style={s.chipRow}>
                {CAPITAL_PRESETS.map((p, i) => (
                  <Chip key={i} label={p.label} active={isCapPresetActive(p)} onPress={() => selectCapPreset(p)} />
                ))}
              </View>
            </View>

            {/* ═══ LÃI SUẤT ═══ */}
            <View style={s.section}>
              <View style={s.sectionHead}>
                <Text style={[s.sectionLabel, { color: c.textSecondary }]}>LÃI SUẤT (%/tháng)</Text>
                <Text style={[s.sectionValue, { color: c.primary }]}>{minRate.toFixed(1)}% – {maxRate.toFixed(1)}%</Text>
              </View>
              <RangeSlider
                min={0.5} max={5} step={0.1}
                low={minRate} high={maxRate}
                onValueChange={(lo, hi) => { setMinRate(lo); setMaxRate(hi); }}
                trackColor={(c.textMuted || '#999') + '25'}
                activeColor={c.primary}
                thumbColor={c.primary}
                labelColor={c.textMuted || '#999'}
                formatLabel={v => `${v.toFixed(1)}%`}
              />
              <View style={s.chipRow}>
                {RATE_PRESETS.map((p, i) => (
                  <Chip key={i} label={p.label} active={isRatePresetActive(p)} onPress={() => selectRatePreset(p)} />
                ))}
              </View>
            </View>

            {/* ═══ KỲ HẠN ═══ */}
            <View style={s.section}>
              <Text style={[s.sectionLabel, { color: c.textSecondary }]}>KỲ HẠN</Text>
              <View style={s.chipRow}>
                {TERM_OPTIONS.map((t, i) => (
                  <Chip key={i} label={t.label} active={term === t.value} onPress={() => setTerm(t.value)} />
                ))}
              </View>
            </View>

            {/* ═══ SẮP XẾP THEO ═══ */}
            <View style={s.section}>
              <Text style={[s.sectionLabel, { color: c.textSecondary }]}>SẮP XẾP THEO</Text>
              <View style={s.chipRow}>
                {SORT_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.chip, {
                      backgroundColor: sortBy === opt.key ? c.primary : (c.surfaceLight || c.backgroundSecondary || '#F0F0F0'),
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                    }]}
                    onPress={() => setSortBy(opt.key)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={opt.icon} size={14} color={sortBy === opt.key ? (c.background || '#000') : (c.textSecondary || '#666')} />
                    <Text style={[s.chipTxt, {
                      color: sortBy === opt.key ? (c.background || '#000') : (c.textSecondary || '#666'),
                    }, sortBy === opt.key && { fontWeight: '700' }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[s.chipRow, { marginTop: 8 }]}>
                {[{ val: 'desc' as const, label: 'Giảm dần', icon: 'arrow-down' as keyof typeof Ionicons.glyphMap },
                  { val: 'asc' as const, label: 'Tăng dần', icon: 'arrow-up' as keyof typeof Ionicons.glyphMap }].map(o => (
                  <TouchableOpacity
                    key={o.val}
                    style={[s.chip, {
                      backgroundColor: sortOrder === o.val ? c.primary : (c.surfaceLight || c.backgroundSecondary || '#F0F0F0'),
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                    }]}
                    onPress={() => setSortOrder(o.val)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={o.icon} size={14} color={sortOrder === o.val ? (c.background || '#000') : (c.textSecondary || '#666')} />
                    <Text style={[s.chipTxt, {
                      color: sortOrder === o.val ? (c.background || '#000') : (c.textSecondary || '#666'),
                    }, sortOrder === o.val && { fontWeight: '700' }]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ═══ MỨC RỦI RO ═══ */}
            <View style={s.section}>
              <Text style={[s.sectionLabel, { color: c.textSecondary }]}>MỨC RỦI RO</Text>
              <View style={s.riskGrid}>
                {RISK_OPTIONS.map(opt => {
                  const active = risk === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key ?? 'all'}
                      style={[
                        s.riskChip,
                        { backgroundColor: c.surfaceLight || c.backgroundSecondary || '#F0F0F0' },
                        active && { borderWidth: 1.5, borderColor: c.primary + '60' },
                      ]}
                      onPress={() => setRisk(opt.key)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={opt.icon} size={18} color={active ? c.primary : (c.textMuted || '#999')} />
                      <Text style={[
                        s.riskTxt,
                        { color: active ? c.text : (c.textSecondary || '#666') },
                        active && { fontWeight: '700' },
                      ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

          </ScrollView>

          {/* ── Bottom Actions ── */}
          <View style={[s.footer, { borderTopColor: (c.textMuted || '#999') + '15' }]}>
            <TouchableOpacity style={[s.btnClear, { backgroundColor: c.surfaceLight || c.backgroundSecondary || '#F0F0F0' }]} onPress={handleReset} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={16} color={c.text} />
              <Text style={[s.btnClearTxt, { color: c.text }]}>Xóa bộ lọc</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.btnApply, { backgroundColor: c.primary }]} onPress={handleApply} activeOpacity={0.8}>
              <Ionicons name="checkmark-circle" size={18} color={c.background || '#000'} />
              <Text style={[s.btnApplyTxt, { color: c.background || '#000' }]}>Áp dụng</Text>
            </TouchableOpacity>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ════════════════ Styles ════════════════ */
const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    height: SCREEN_H * 0.82,
  },

  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerL: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerReset: { fontSize: 14, fontWeight: '600' },

  scrollInner: { paddingHorizontal: 20, paddingBottom: 100 },

  section: { marginBottom: 28 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  sectionValue: { fontSize: 16, fontWeight: '800' },

  slider: { width: '100%', height: 36 },
  sliderMinMax: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 2 },
  sliderLabel: { fontSize: 11, fontWeight: '500' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  chipTxt: { fontSize: 13, fontWeight: '500' },

  riskGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  riskChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14,
    width: '47%' as any, flexGrow: 1, flexBasis: '45%' as any,
  },
  riskTxt: { fontSize: 13, fontWeight: '500' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  btnClear: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 24, paddingVertical: 14,
  },
  btnClearTxt: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  btnApply: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 24, paddingVertical: 14,
  },
  btnApplyTxt: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
