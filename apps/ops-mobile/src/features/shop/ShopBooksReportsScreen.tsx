import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { SelectField } from '../../components/SelectField';
import { DateField } from '../../components/DateField';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { DesktopPage } from '../../components/DesktopPage';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { ShopBooksReportSlug } from '@ie-platform/sdk';

const REPORT_OPTIONS: Array<{ value: ShopBooksReportSlug; label: string; hint: string }> = [
  { value: 'sales', label: 'Sales register', hint: 'All sale vouchers in the period.' },
  { value: 'purchase', label: 'Purchase register', hint: 'All purchase vouchers in the period.' },
  { value: 'daybook', label: 'Day book', hint: 'Every voucher posted, in date order.' },
  { value: 'gstr1', label: 'GSTR-1', hint: 'Outward supplies for GST filing.' },
  { value: 'gstr3b', label: 'GSTR-3B', hint: 'Summary GST return.' },
  { value: 'pnl', label: 'Profit & loss', hint: 'Income vs. expenses summary.' },
];

function summarize(value: unknown, depth = 0): string {
  if (value == null) return '—';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return JSON.stringify(value, null, 2);
}

export function ShopBooksReportsScreen() {
  const { isDesktop } = useBreakpoint();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [slug, setSlug] = useState<ShopBooksReportSlug>('sales');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => REPORT_OPTIONS.map((option) => ({ value: option.value, label: option.label })), []);
  const activeOption = REPORT_OPTIONS.find((option) => option.value === slug);

  const runReport = useCallback(async () => {
    if (!client || !businessId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.booksReport(slug, {
        business_id: businessId,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setData(response.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load report';
      setError(message);
      toast.push(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [client, businessId, slug, dateFrom, dateTo, toast]);

  const summaryEntries = useMemo(() => {
    if (!data) return [];
    const summary =
      data.summary && typeof data.summary === 'object' ? (data.summary as Record<string, unknown>) : data;
    return Object.entries(summary).filter(([, value]) => typeof value !== 'object' || value === null);
  }, [data]);

  return (
    <DesktopPage>
      <RefreshableScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Books reports</Text>
        <Text style={styles.subtitle}>Pick a report and an optional date range.</Text>

        <SelectField label="Report" value={slug} options={options} onChange={(value) => setSlug(value as ShopBooksReportSlug)} />
        {activeOption ? <Text style={styles.hint}>{activeOption.hint}</Text> : null}

        <DateField label="From" value={dateFrom} onChange={setDateFrom} />
        <DateField label="To" value={dateTo} onChange={setDateTo} />

        <Pressable style={[styles.runBtn, loading && styles.runBtnDisabled]} onPress={() => void runReport()} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="bar-chart-2" size={16} color="#fff" />
              <Text style={styles.runBtnText}>Run report</Text>
            </>
          )}
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {data ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>{activeOption?.label ?? slug}</Text>
            {summaryEntries.length ? (
              <View style={styles.summaryGrid}>
                {summaryEntries.map(([key, value]) => (
                  <View key={key} style={[styles.summaryTile, isDesktop && styles.summaryTileDesktop]}>
                    <Text style={styles.summaryLabel}>{key.replace(/_/g, ' ')}</Text>
                    <Text style={styles.summaryValue} numberOfLines={2}>
                      {summarize(value)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={styles.jsonLabel}>Full response</Text>
            <View style={styles.jsonBox}>
              <Text style={styles.jsonText} selectable>
                {JSON.stringify(data, null, 2)}
              </Text>
            </View>
          </View>
        ) : !loading ? (
          <Text style={styles.meta}>Run a report to see results here.</Text>
        ) : null}
      </RefreshableScrollView>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  title: { ...typography.title, fontSize: 20, color: colors.foreground },
  subtitle: { ...typography.body, color: colors.mutedForeground },
  hint: { ...typography.caption, color: colors.mutedForeground, marginTop: -spacing.sm },
  runBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
  },
  runBtnDisabled: { opacity: 0.7 },
  runBtnText: { color: '#fff', fontWeight: '700' },
  error: { color: colors.destructive },
  meta: { color: colors.mutedForeground },
  resultCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  resultTitle: { fontFamily: fonts.displayMedium, fontSize: 17, color: colors.foreground },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summaryTile: {
    minWidth: '45%',
    flexGrow: 1,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  summaryTileDesktop: {
    minWidth: '22%',
  },
  summaryLabel: { ...typography.caption, color: colors.mutedForeground, textTransform: 'capitalize' },
  summaryValue: { ...typography.label, color: colors.foreground, marginTop: 4 },
  jsonLabel: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm },
  jsonBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  jsonText: { fontFamily: 'Courier', fontSize: 12, color: colors.foreground, lineHeight: 17 },
});
