import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, StyleSheet, StatusBar,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader, CommonInput } from '../../../components';
import investService, { CreateInvestmentOrderPayload, CreateOrderResult } from '../services/invest.service';
import { loanService, LoanProduct } from '../../loan/services/loan.service';
import RangeSlider from '../components/RangeSlider';
import { useConfirmModal } from '../../../components/common/ConfirmModal';

const CAPITAL_PRESETS = [5_000_000, 10_000_000, 20_000_000, 50_000_000];

const rawNum = (v: string) => Number(v.replace(/\D/g, '')) || 0;

export default function InvestmentOrderCreateScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const nav = useNavigation<any>();
  const modal = useConfirmModal();

  // Form state
  const [name, setName] = useState('');
  const [capitalStr, setCapitalStr] = useState('10.000.000');
  const [maxCapStr, setMaxCapStr] = useState('50.000.000');
  const [interestMin, setInterestMin] = useState(1);
  const [interestMax, setInterestMax] = useState(3);
  const [termMin, setTermMin] = useState(3);
  const [termMax, setTermMax] = useState(36);
  const [loanProducts, setLoanProducts] = useState<LoanProduct[]>([]);
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CreateOrderResult | null>(null);

  useEffect(() => {
    loanService.getLoanProducts().then(setLoanProducts).catch(console.error);
  }, []);

  const togglePurpose = (n: string) =>
    setSelectedPurposes(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);

  const onCapChange = (t: string) => {
    const digits = t.replace(/\D/g, '');
    if (digits === '') { setCapitalStr(''); return; }
    setCapitalStr(Number(digits).toLocaleString('vi-VN'));
  };
  const onMaxCapChange = (t: string) => {
    const digits = t.replace(/\D/g, '');
    if (digits === '') { setMaxCapStr(''); return; }
    setMaxCapStr(Number(digits).toLocaleString('vi-VN'));
  };

  const capital = rawNum(capitalStr);
  const maxCapital = rawNum(maxCapStr);
  const isCapPreset = (v: number) => capital === v;
  const selectCapPreset = (v: number) => setCapitalStr(v.toLocaleString('vi-VN'));

  const validate = (): string | null => {
    if (capital < 100000) return 'Vốn đầu tư phải >= 100,000 VND';
    if (maxCapital < 100000) return 'Vốn tối đa phải >= 100,000 VND';
    if (selectedPurposes.length === 0) return 'Vui lòng chọn ít nhất 1 lĩnh vực';
    return null;
  };

  const handleSubmit = () => {
    const err = validate();
    if (err) { modal.alert('Thông tin chưa đầy đủ', err); return; }
    modal.confirm({
      title: 'Xác nhận',
      message: `Tạo lệnh đầu tư với vốn ${capitalStr} ₫?`,
      cancelText: 'Huỷ',
      confirmText: 'Xác nhận',
      onConfirm: doCreate,
    });
  };

  const doCreate = async () => {
    setSaving(true);
    try {
      const payload: CreateInvestmentOrderPayload = {
        name: name.trim() || undefined,
        capital,
        maxCapital,
        interestRange: { min: interestMin, max: interestMax },
        periodRange: { min: termMin, max: termMax },
        purpose: selectedPurposes,
      };
      const res = await investService.createInvestmentOrder(payload);
      setResult(res);
    } catch (e: any) {
      modal.error('Lỗi', e?.response?.data?.message || e?.message || 'Không thể tạo lệnh');
    } finally { setSaving(false); }
  };

  // ── Result screen ──
  if (result) {
    const order = result.order;
    const isClosed = order.status === 'closed';
    return (
      <View style={[s.container, { backgroundColor: c.background }]}>
        <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />
        <View style={s.resultWrap}>
          <View style={[s.resultIcon, { backgroundColor: c.primary + '15' }]}>
            <Ionicons name="checkmark-circle" size={64} color={c.primary} />
          </View>
          <Text style={[s.resultTitle, { color: c.text }]}>Tạo lệnh thành công!</Text>
          <Text style={[s.resultSub, { color: c.textSecondary }]}>Lệnh đã được tạo và ghép theo tiêu chí.</Text>
          <View style={[s.resultCard, { backgroundColor: c.backgroundSecondary }]}>
            <RRow icon="document-text-outline" label="Khoản đã ghép" value={`${result.matchCount} khoản`} c={c} />
            <RRow icon="cash-outline" label="Vốn đã ghép" value={`${(order.matchedCapital || 0).toLocaleString('vi-VN')} ₫`} c={c} />
            <RRow icon={isClosed ? 'lock-closed' : 'time-outline'} label="Trạng thái" value={isClosed ? 'Đã đóng' : 'Đang chờ ghép'} c={c} valueColor={isClosed ? '#10B981' : '#F59E0B'} />
          </View>
          <TouchableOpacity style={[s.doneBtn, { backgroundColor: c.primary }]} onPress={() => nav.goBack()}>
            <Text style={[s.doneBtnText, { color: c.onPrimary || '#2C3400' }]}>Xong</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Form ──
  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: c.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />
      <BinanceHeader mode="standard" title="Tạo lệnh đầu tư" showBack />

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Hero */}
        <Text style={[s.heroSub, { color: c.textSecondary }]}>ĐẦU TƯ THÔNG MINH</Text>
        <Text style={[s.heroTitle, { color: c.text }]}>Cấu hình lệnh mới</Text>

        {/* ═══ BƯỚC 1 ═══ */}
        <View style={[s.section, { backgroundColor: c.backgroundSecondary }]}>
          <View style={s.stepRow}>
            <View style={[s.stepBadge, { backgroundColor: c.primary + '20' }]}>
              <Text style={[s.stepBadgeText, { color: c.primary }]}>BƯỚC 1</Text>
            </View>
            <Text style={[s.sectionTitle, { color: c.text }]}>Thông tin cơ bản</Text>
          </View>

          <CommonInput
            label="Tên lệnh" value={name} onChangeText={setName}
            placeholder="VD: Lệnh tháng 3"
          />

          <CommonInput
            label="Vốn đầu tư" variant="hero" suffix="₫"
            value={capitalStr} onChangeText={onCapChange}
            keyboardType="numeric" placeholder="0"
          />
          <View style={s.chipRow}>
            {CAPITAL_PRESETS.map(v => {
              const active = isCapPreset(v);
              const label = v >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1_000}K`;
              return (
                <TouchableOpacity
                  key={v}
                  style={[s.presetChip, { backgroundColor: active ? c.primary : c.background }]}
                  onPress={() => selectCapPreset(v)} activeOpacity={0.7}
                >
                  <Text style={[s.presetText, { color: active ? (c.onPrimary || '#2C3400') : c.text }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <CommonInput
            label="Vốn tối đa/khoản" suffix="₫"
            value={maxCapStr} onChangeText={onMaxCapChange}
            keyboardType="numeric" placeholder="50.000.000"
          />
        </View>

        {/* ═══ BƯỚC 2 ═══ */}
        <View style={[s.section, { backgroundColor: c.backgroundSecondary }]}>
          <View style={s.stepRow}>
            <View style={[s.stepBadge, { backgroundColor: c.primary + '20' }]}>
              <Text style={[s.stepBadgeText, { color: c.primary }]}>BƯỚC 2</Text>
            </View>
            <Text style={[s.sectionTitle, { color: c.text }]}>Tiêu chí đầu tư</Text>
          </View>

          {/* Lãi suất */}
          <View style={s.criteriaRow}>
            <Text style={[s.criteriaLabel, { color: c.text }]}>Lãi suất (%/tháng)</Text>
            <Text style={[s.criteriaRange, { color: c.textSecondary }]}>0.5% — 5.0%</Text>
          </View>
          <View style={s.rangeInputRow}>
            <View style={{ flex: 1 }}>
              <CommonInput
                label="TỐI THIỂU" variant="compact" suffix="%"
                value={String(interestMin)}
                onChangeText={t => { const n = parseFloat(t); if (!isNaN(n)) setInterestMin(n); else if (t === '') setInterestMin(0); }}
                keyboardType="numeric"
              />
            </View>
            <Text style={[s.rangeDash, { color: c.textSecondary }]}>—</Text>
            <View style={{ flex: 1 }}>
              <CommonInput
                label="TỐI ĐA" variant="compact" suffix="%"
                value={String(interestMax)}
                onChangeText={t => { const n = parseFloat(t); if (!isNaN(n)) setInterestMax(n); else if (t === '') setInterestMax(0); }}
                keyboardType="numeric"
              />
            </View>
          </View>
          <View style={s.sliderWrap}>
            <RangeSlider
              min={0.5} max={5} step={0.1}
              low={interestMin} high={interestMax}
              onValueChange={(low, high) => { setInterestMin(Math.round(low * 10) / 10); setInterestMax(Math.round(high * 10) / 10); }}
              activeColor={c.primary}
              trackColor={(c.textMuted || '#999') + '20'}
              thumbColor={c.primary}
              formatLabel={(v) => `${v.toFixed(1)}%`}
            />
          </View>

          {/* Kỳ hạn */}
          <View style={[s.criteriaRow, { marginTop: 20 }]}>
            <Text style={[s.criteriaLabel, { color: c.text }]}>Kỳ hạn (tháng)</Text>
            <Text style={[s.criteriaRange, { color: c.textSecondary }]}>1 — 60 tháng</Text>
          </View>
          <View style={s.rangeInputRow}>
            <View style={{ flex: 1 }}>
              <CommonInput
                label="TỐI THIỂU" variant="compact" suffix="T"
                value={String(termMin)}
                onChangeText={t => { const n = parseInt(t); if (!isNaN(n)) setTermMin(n); else if (t === '') setTermMin(0); }}
                keyboardType="numeric"
              />
            </View>
            <Text style={[s.rangeDash, { color: c.textSecondary }]}>—</Text>
            <View style={{ flex: 1 }}>
              <CommonInput
                label="TỐI ĐA" variant="compact" suffix="T"
                value={String(termMax)}
                onChangeText={t => { const n = parseInt(t); if (!isNaN(n)) setTermMax(n); else if (t === '') setTermMax(0); }}
                keyboardType="numeric"
              />
            </View>
          </View>
          <View style={s.sliderWrap}>
            <RangeSlider
              min={1} max={60} step={1}
              low={termMin} high={termMax}
              onValueChange={(low, high) => { setTermMin(Math.round(low)); setTermMax(Math.round(high)); }}
              activeColor={c.primary}
              trackColor={(c.textMuted || '#999') + '20'}
              thumbColor={c.primary}
              formatLabel={(v) => `${Math.round(v)} th`}
            />
          </View>
        </View>

        {/* ═══ BƯỚC 3 ═══ */}
        <View style={[s.section, { backgroundColor: c.backgroundSecondary }]}>
          <View style={s.stepRow}>
            <View style={[s.stepBadge, { backgroundColor: c.primary + '20' }]}>
              <Text style={[s.stepBadgeText, { color: c.primary }]}>BƯỚC 3</Text>
            </View>
            <Text style={[s.sectionTitle, { color: c.text }]}>Bạn muốn đầu tư vào{'\n'}lĩnh vực nào?</Text>
          </View>
          <Text style={[s.checklistSub, { color: c.textSecondary }]}>Chọn các mục đích vay mà bạn quan tâm</Text>

          {loanProducts.length === 0 && <ActivityIndicator size="small" color={c.primary} style={{ marginVertical: 16 }} />}
          {loanProducts.map(p => {
            const checked = selectedPurposes.includes(p.name);
            return (
              <TouchableOpacity
                key={p.id}
                style={[
                  s.checkItem,
                  { backgroundColor: c.background },
                  checked && { borderColor: c.primary, borderWidth: 1.5 },
                ]}
                onPress={() => togglePurpose(p.name)}
                activeOpacity={0.7}
              >
                {/* Checkbox circle */}
                <View style={[
                  s.checkbox,
                  { borderColor: checked ? c.primary : (c.textMuted || '#999') + '40' },
                  checked && { backgroundColor: c.primary },
                ]}>
                  {checked && <Ionicons name="checkmark" size={14} color={c.onPrimary || '#2C3400'} />}
                </View>
                {/* Label */}
                <Text style={[s.checkLabel, { color: checked ? c.text : c.textSecondary }]}>{p.name}</Text>
                {/* Arrow */}
                <Ionicons name="chevron-forward" size={16} color={(c.textMuted || '#999') + '40'} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Info banner */}
        <View style={[s.infoBanner, { backgroundColor: c.backgroundSecondary }]}>
          <Ionicons name="information-circle" size={18} color={c.primary} />
          <Text style={[s.infoText, { color: c.textSecondary }]}>
            Hệ thống sẽ tự động ghép khoản vay phù hợp với tiêu chí của bạn.
          </Text>
        </View>

      </ScrollView>

      {/* Sticky CTA */}
      <View style={[s.ctaBar, { backgroundColor: c.background }]}>
        <TouchableOpacity
          style={[s.ctaBtn, { backgroundColor: c.primary, opacity: saving ? 0.6 : 1 }]}
          onPress={handleSubmit} disabled={saving} activeOpacity={0.8}
        >
          {saving ? <ActivityIndicator color={c.onPrimary || '#2C3400'} /> : (
            <>
              <Ionicons name="flash" size={18} color={c.onPrimary || '#2C3400'} />
              <Text style={[s.ctaText, { color: c.onPrimary || '#2C3400' }]}>TẠO & GHÉP TỰ ĐỘNG</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function RRow({ icon, label, value, c, valueColor }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
      <Ionicons name={icon} size={20} color={c.primary} />
      <Text style={{ flex: 1, fontSize: 14, color: c.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: valueColor || c.text }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 140 },

  // Hero
  heroSub: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 0, marginBottom: 4 },
  heroTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },

  // Section
  section: { borderRadius: 16, padding: 18, marginBottom: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  stepBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  stepBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '700', flex: 1 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  presetChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18 },
  presetText: { fontSize: 13, fontWeight: '700' },

  // Criteria
  criteriaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  criteriaLabel: { fontSize: 14, fontWeight: '700' },
  criteriaRange: { fontSize: 11, opacity: 0.6 },

  // Range inputs
  rangeInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  rangeDash: { fontSize: 14, marginBottom: 10, opacity: 0.3 },

  // Slider
  sliderWrap: { marginTop: 12, paddingHorizontal: 4 },

  // Checklist
  checklistSub: { fontSize: 13, marginBottom: 12, marginTop: -4 },
  checkItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16,
    borderRadius: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'transparent',
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  checkLabel: { flex: 1, fontSize: 14, fontWeight: '600' },

  // Info
  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 14, marginTop: 4 },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18 },

  // CTA
  ctaBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18, borderRadius: 28 },
  ctaText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },

  // Result
  resultWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  resultIcon: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  resultTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  resultSub: { fontSize: 14, textAlign: 'center', marginTop: 8 },
  resultCard: { width: '100%', borderRadius: 16, padding: 16, marginTop: 24 },
  doneBtn: { width: '100%', paddingVertical: 16, borderRadius: 28, alignItems: 'center', marginTop: 24 },
  doneBtnText: { fontSize: 14, fontWeight: '700' },
});
