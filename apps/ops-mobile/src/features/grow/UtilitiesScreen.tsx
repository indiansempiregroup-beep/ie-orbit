import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { FormScreen } from '../../components/FormScreen';
import { Chip } from '../../components/ui/Chip';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { formatMoney } from '../shop/shopBooksHelpers';

type CalcTab = 'gst' | 'margin' | 'discount' | 'emi';

function num(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function UtilitiesScreen() {
  const [tab, setTab] = useState<CalcTab>('gst');

  const [amount, setAmount] = useState('1000');
  const [gstRate, setGstRate] = useState('18');
  const [cost, setCost] = useState('800');
  const [selling, setSelling] = useState('1000');
  const [discountPct, setDiscountPct] = useState('10');
  const [principal, setPrincipal] = useState('50000');
  const [annualRate, setAnnualRate] = useState('12');
  const [months, setMonths] = useState('12');

  const gst = useMemo(() => {
    const base = num(amount);
    const rate = num(gstRate);
    const tax = (base * rate) / 100;
    return { tax, total: base + tax };
  }, [amount, gstRate]);

  const margin = useMemo(() => {
    const c = num(cost);
    const s = num(selling);
    const profit = s - c;
    const pct = c > 0 ? (profit / c) * 100 : 0;
    return { profit, pct };
  }, [cost, selling]);

  const discount = useMemo(() => {
    const base = num(amount);
    const pct = num(discountPct);
    const off = (base * pct) / 100;
    return { off, final: base - off };
  }, [amount, discountPct]);

  const emi = useMemo(() => {
    const p = num(principal);
    const n = Math.max(1, Math.round(num(months)));
    const r = num(annualRate) / 12 / 100;
    if (r <= 0) {
      const payment = p / n;
      return { payment, total: payment * n, interest: payment * n - p };
    }
    const factor = Math.pow(1 + r, n);
    const payment = (p * r * factor) / (factor - 1);
    const total = payment * n;
    return { payment, total, interest: total - p };
  }, [principal, annualRate, months]);

  return (
    <FormScreen>
      <Text style={styles.formTitle}>Utilities</Text>
      <Text style={styles.help}>Local GST, margin, discount, and EMI calculators — no API needed.</Text>

      <View style={styles.chips}>
        <Chip label="GST" active={tab === 'gst'} onPress={() => setTab('gst')} />
        <Chip label="Margin" active={tab === 'margin'} onPress={() => setTab('margin')} />
        <Chip label="Discount" active={tab === 'discount'} onPress={() => setTab('discount')} />
        <Chip label="EMI" active={tab === 'emi'} onPress={() => setTab('emi')} />
      </View>

      {tab === 'gst' ? (
        <View style={styles.block}>
          <Field label="Taxable amount" value={amount} onChange={setAmount} />
          <Field label="GST %" value={gstRate} onChange={setGstRate} />
          <ResultRow label="GST amount" value={formatMoney(gst.tax)} />
          <ResultRow label="Total with GST" value={formatMoney(gst.total)} emphasize />
        </View>
      ) : null}

      {tab === 'margin' ? (
        <View style={styles.block}>
          <Field label="Cost price" value={cost} onChange={setCost} />
          <Field label="Selling price" value={selling} onChange={setSelling} />
          <ResultRow label="Profit" value={formatMoney(margin.profit)} />
          <ResultRow label="Margin %" value={`${margin.pct.toFixed(2)}%`} emphasize />
        </View>
      ) : null}

      {tab === 'discount' ? (
        <View style={styles.block}>
          <Field label="MRP / amount" value={amount} onChange={setAmount} />
          <Field label="Discount %" value={discountPct} onChange={setDiscountPct} />
          <ResultRow label="Discount" value={formatMoney(discount.off)} />
          <ResultRow label="Payable" value={formatMoney(discount.final)} emphasize />
        </View>
      ) : null}

      {tab === 'emi' ? (
        <View style={styles.block}>
          <Field label="Principal" value={principal} onChange={setPrincipal} />
          <Field label="Annual interest %" value={annualRate} onChange={setAnnualRate} />
          <Field label="Tenure (months)" value={months} onChange={setMonths} />
          <ResultRow label="Monthly EMI" value={formatMoney(emi.payment)} emphasize />
          <ResultRow label="Total interest" value={formatMoney(emi.interest)} />
          <ResultRow label="Total payable" value={formatMoney(emi.total)} />
        </View>
      ) : null}
    </FormScreen>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(next) => onChange(next.replace(/[^0-9.]/g, ''))}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.mutedForeground}
      />
    </View>
  );
}

function ResultRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.resultRow}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={emphasize ? styles.resultValueStrong : styles.resultValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  help: { ...typography.body, color: colors.mutedForeground },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  block: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: colors.card,
    gap: spacing.md,
  },
  fieldBlock: { gap: 6 },
  label: { ...typography.label, color: colors.foreground },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  resultLabel: { ...typography.body, color: colors.mutedForeground },
  resultValue: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.foreground },
  resultValueStrong: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.primary },
});
