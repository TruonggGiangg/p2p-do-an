import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StyleSheet, StatusBar, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import investService, { CreateInvestmentOrderPayload, CreateOrderResult } from '../services/invest.service';
import { loanService, LoanProduct } from '../../loan/services/loan.service';

export default function InvestmentOrderCreateScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  // Form state
  const [name, setName] = useState('');
  const [capital, setCapital] = useState('10000000');
  const [maxCapital, setMaxCapital] = useState('50000000');
  const [interestMin, setInterestMin] = useState('1');
  const [interestMax, setInterestMax] = useState('3');
  const [periodMin, setPeriodMin] = useState('3');
  const [periodMax, setPeriodMax] = useState('12');
  
  // Products
  const [loanProducts, setLoanProducts] = useState<LoanProduct[]>([]);
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>([]);

  useEffect(() => {
    loanService.getLoanProducts().then(setLoanProducts).catch(console.error);
  }, []);

  const togglePurpose = (name: string) => {
    setSelectedPurposes(prev =>
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    );
  };

  // UI state
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CreateOrderResult | null>(null);

  const validate = (): string | null => {
    if (!capital || Number(capital) < 100000) return 'Vốn đầu tư phải >= 100,000 VND';
    if (!maxCapital || Number(maxCapital) < 100000) return 'Vốn tối đa phải >= 100,000 VND';
    if (!interestMin || !interestMax) return 'Vui lòng nhập khoảng lãi suất';
    if (!periodMin || !periodMax) return 'Vui lòng nhập khoảng kỳ hạn';
    if (selectedPurposes.length === 0) return 'Vui lòng chọn ít nhất 1 sản phẩm vay';
    return null;
  };

  const handleSubmit = async () => {
    const errorMsg = validate();
    if (errorMsg) {
      Alert.alert('Thông tin chưa đầy đủ', errorMsg);
      return;
    }

    Alert.alert(
      'Xác nhận tạo lệnh',
      `Bạn muốn tạo lệnh đầu tư với vốn ${Number(capital).toLocaleString('vi-VN')} ₫?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Xác nhận', onPress: doCreate },
      ],
    );
  };

  const doCreate = async () => {
    setSaving(true);
    try {
      const payload: CreateInvestmentOrderPayload = {
        name: name.trim() || undefined,
        capital: Number(capital),
        maxCapital: Number(maxCapital),
        interestRange: { min: Number(interestMin), max: Number(interestMax) },
        periodRange: { min: Number(periodMin), max: Number(periodMax) },
        purpose: selectedPurposes,
      };

      const res = await investService.createInvestmentOrder(payload);
      setResult(res);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message || e?.message || 'Không thể tạo lệnh đầu tư');
    } finally {
      setSaving(false);
    }
  };

  // ── Result screen ───────────────────────────────────
  if (result) {
    const order = result.order;
    const isClosed = order.status === 'closed';
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />
        <View style={styles.resultContainer}>
          <View style={[styles.resultIconWrap, { backgroundColor: theme.colors.primary + '15' }]}>
            <Ionicons name="checkmark-circle" size={64} color={theme.colors.primary} />
          </View>

          <Text style={[styles.resultTitle, { color: theme.colors.text }]}>Tạo lệnh đầu tư thành công!</Text>
          <Text style={[styles.resultSubtitle, { color: theme.colors.textSecondary }]}>
            Lệnh đầu tư đã được tạo và ghép theo tiêu chí của bạn.
          </Text>

          <View style={[styles.resultCard, { backgroundColor: theme.colors.backgroundSecondary }]}>
            <View style={styles.resultRow}>
              <Ionicons name="document-text-outline" size={20} color={theme.colors.primary} />
              <Text style={[styles.resultLabel, { color: theme.colors.textSecondary }]}>Khoản đã ghép</Text>
              <Text style={[styles.resultValue, { color: theme.colors.text }]}>{result.matchCount} khoản</Text>
            </View>
            <View style={styles.resultRow}>
              <Ionicons name="cash-outline" size={20} color={theme.colors.primary} />
              <Text style={[styles.resultLabel, { color: theme.colors.textSecondary }]}>Vốn đã ghép</Text>
              <Text style={[styles.resultValue, { color: theme.colors.text }]}>
                {(order.matchedCapital || 0).toLocaleString('vi-VN')} ₫
              </Text>
            </View>
            <View style={styles.resultRow}>
              <Ionicons name={isClosed ? 'lock-closed' : 'time-outline'} size={20} color={isClosed ? '#10B981' : '#F59E0B'} />
              <Text style={[styles.resultLabel, { color: theme.colors.textSecondary }]}>Trạng thái</Text>
              <Text style={[styles.resultValue, { color: isClosed ? '#10B981' : '#F59E0B' }]}>
                {isClosed ? 'Đã đóng' : 'Đang chờ ghép'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.doneButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.doneButtonText}>Xong</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Form screen ─────────────────────────────────────
  const inputStyle = [styles.input, { backgroundColor: theme.colors.backgroundSecondary, color: theme.colors.text, borderColor: theme.colors.border || '#E5E7EB' }];

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.backgroundSecondary }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Tạo lệnh đầu tư</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled">
        {/* Name */}
        <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>Tên lệnh (tùy chọn)</Text>
        <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="VD: Lệnh tháng 3" placeholderTextColor={theme.colors.textSecondary} />

        {/* Capital */}
        <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>Vốn đầu tư (VND) *</Text>
        <TextInput style={inputStyle} value={capital} onChangeText={setCapital} keyboardType="numeric" placeholder="10,000,000" placeholderTextColor={theme.colors.textSecondary} />

        {/* Max Capital */}
        <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>Vốn tối đa/khoản vay (VND) *</Text>
        <TextInput style={inputStyle} value={maxCapital} onChangeText={setMaxCapital} keyboardType="numeric" placeholder="50,000,000" placeholderTextColor={theme.colors.textSecondary} />

        {/* Interest range */}
        <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>Lãi suất (%/tháng) *</Text>
        <View style={styles.rangeRow}>
          <TextInput style={[inputStyle, styles.rangeInput]} value={interestMin} onChangeText={setInterestMin} keyboardType="numeric" placeholder="Min" placeholderTextColor={theme.colors.textSecondary} />
          <Text style={[styles.rangeDash, { color: theme.colors.textSecondary }]}>—</Text>
          <TextInput style={[inputStyle, styles.rangeInput]} value={interestMax} onChangeText={setInterestMax} keyboardType="numeric" placeholder="Max" placeholderTextColor={theme.colors.textSecondary} />
        </View>

        {/* Period range */}
        <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>Kỳ hạn (tháng) *</Text>
        <View style={styles.rangeRow}>
          <TextInput style={[inputStyle, styles.rangeInput]} value={periodMin} onChangeText={setPeriodMin} keyboardType="numeric" placeholder="Min" placeholderTextColor={theme.colors.textSecondary} />
          <Text style={[styles.rangeDash, { color: theme.colors.textSecondary }]}>—</Text>
          <TextInput style={[inputStyle, styles.rangeInput]} value={periodMax} onChangeText={setPeriodMax} keyboardType="numeric" placeholder="Max" placeholderTextColor={theme.colors.textSecondary} />
        </View>

        {/* Purpose */}
        <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>Sản phẩm vay đầu tư *</Text>
        <View style={styles.chipContainer}>
          {loanProducts.length === 0 ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
          {loanProducts.map(p => {
            const isSelected = selectedPurposes.includes(p.name);
            return (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.chip,
                  isSelected 
                    ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                    : { borderColor: theme.colors.border || '#E5E7EB' }
                ]}
                onPress={() => togglePurpose(p.name)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.chipText,
                  isSelected ? { color: theme.colors.onPrimary || '#fff' } : { color: theme.colors.text }
                ]}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: theme.colors.primary, opacity: saving ? 0.6 : 1 }]}
          onPress={handleSubmit}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.submitButtonText}>Tạo & Ghép tự động</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  formContainer: { padding: 20, paddingBottom: 40 },
  fieldLabel: { fontSize: 13, fontWeight: '500', marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  multiline: { minHeight: 60, textAlignVertical: 'top' },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: '500' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeInput: { flex: 1 },
  rangeDash: { fontSize: 18 },
  submitButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 30,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Result
  resultContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  resultIconWrap: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  resultTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  resultSubtitle: { fontSize: 14, textAlign: 'center', marginTop: 8 },
  resultCard: { width: '100%', borderRadius: 16, padding: 16, marginTop: 24, gap: 12 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultLabel: { flex: 1, fontSize: 14 },
  resultValue: { fontSize: 14, fontWeight: '600' },
  doneButton: { width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 24 },
  doneButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
