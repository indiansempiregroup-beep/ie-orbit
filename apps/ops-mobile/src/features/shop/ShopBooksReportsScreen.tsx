import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { DateField } from '../../components/DateField';
import { SearchBar } from '../../components/SearchBar';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { DesktopPage } from '../../components/DesktopPage';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { colors, fonts, radius, shadows, spacing, typography } from '../../theme/tokens';
import type { ShopBooksReportSlug } from '@ie-platform/sdk';

type ReportOption = {
  value: ShopBooksReportSlug;
  label: string;
  shortLabel: string;
  hint: string;
  icon: React.ComponentProps<typeof Feather>['name'];
};

const REPORT_OPTIONS: ReportOption[] = [
  { value: 'sales', label: 'Sales register', shortLabel: 'Sales', hint: 'Sales value, GST collected and invoice totals.', icon: 'trending-up' },
  { value: 'purchase', label: 'Purchase register', shortLabel: 'Purchase', hint: 'Purchase value and available input tax.', icon: 'shopping-cart' },
  { value: 'daybook', label: 'Day book', shortLabel: 'Day book', hint: 'Every posted voucher in chronological order.', icon: 'book-open' },
  { value: 'gstr1', label: 'GSTR-1', shortLabel: 'GSTR-1', hint: 'Invoice-level outward supplies for GST filing.', icon: 'file-text' },
  { value: 'gstr3b', label: 'GSTR-3B', shortLabel: 'GSTR-3B', hint: 'Output tax, input credit and net tax payable.', icon: 'layers' },
  { value: 'pnl', label: 'Profit & loss', shortLabel: 'P&L', hint: 'Income, expenses and net profit for the period.', icon: 'pie-chart' },
];

const MONEY_LABELS: Record<string, string> = {
  taxable_value: 'Taxable value',
  cgst: 'CGST',
  sgst: 'SGST',
  igst: 'IGST',
  tax_total: 'Total GST',
  total: 'Grand total',
  sales: 'Sales',
  credit_notes: 'Less: credit notes',
  other_income: 'Other income',
  purchases: 'Purchases',
  debit_notes: 'Less: debit notes',
  operating_expenses: 'Operating expenses',
};

const VOUCHER_TYPE_LABELS: Record<string, string> = {
  sale: 'Sale',
  purchase: 'Purchase',
  credit_note: 'Credit note',
  debit_note: 'Debit note',
  payment_in: 'Payment in',
  payment_out: 'Payment out',
  expense: 'Expense',
  other_income: 'Other income',
  transfer: 'Transfer',
};

/** Voucher types that make up each report's underlying records. Undefined means every type. */
const RECORD_TYPES: Partial<Record<ShopBooksReportSlug, string[]>> = {
  sales: ['sale', 'credit_note'],
  purchase: ['purchase', 'debit_note'],
  gstr3b: ['sale', 'credit_note', 'purchase', 'debit_note'],
  pnl: ['sale', 'credit_note', 'other_income', 'purchase', 'debit_note', 'expense'],
};

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Highest amount' },
  { value: 'amount_asc', label: 'Lowest amount' },
];

type ReportRecord = {
  key: string;
  number: string;
  date: string;
  type: string;
  typeLabel: string;
  party: string;
  status: string;
  total: number;
  paid: number | null;
  taxable?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  gstin?: string;
  placeOfSupply?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDaybookRecord(row: Record<string, unknown>, index: number): ReportRecord {
  const type = String(row.voucher_type ?? '').toLowerCase();
  return {
    key: String(row.id ?? `${row.voucher_number ?? 'row'}-${index}`),
    number: String(row.voucher_number ?? '—'),
    date: String(row.voucher_date ?? ''),
    type,
    typeLabel: VOUCHER_TYPE_LABELS[type] ?? labelFor(type || 'entry'),
    party: String(row.party ?? row.cash_account ?? 'Cash / walk-in'),
    status: String(row.status ?? '').toLowerCase(),
    total: num(row.total),
    paid: row.amount_paid == null ? null : num(row.amount_paid),
    taxable: row.taxable_value == null ? undefined : num(row.taxable_value),
    cgst: row.cgst == null ? undefined : num(row.cgst),
    sgst: row.sgst == null ? undefined : num(row.sgst),
    igst: row.igst == null ? undefined : num(row.igst),
    gstin: row.party_gstin == null ? undefined : String(row.party_gstin),
    placeOfSupply: row.place_of_supply == null ? undefined : String(row.place_of_supply),
  };
}

/** Cash, transfer and payment vouchers carry no GST, so their tax block stays hidden. */
function hasGstDetail(record: ReportRecord) {
  if (record.taxable == null) return false;
  return record.taxable > 0 || (record.cgst ?? 0) + (record.sgst ?? 0) + (record.igst ?? 0) > 0;
}

function toGstr1Record(row: Record<string, unknown>, index: number): ReportRecord {
  const type = String(row.invoice_type ?? 'B2C').toUpperCase();
  return {
    key: `${String(row.voucher_number ?? 'invoice')}-${index}`,
    number: String(row.voucher_number ?? '—'),
    date: String(row.voucher_date ?? ''),
    type,
    typeLabel: type,
    party: String(row.customer_name ?? 'Walk-in / B2C'),
    status: 'confirmed',
    total: num(row.total),
    paid: null,
    taxable: num(row.taxable_value),
    cgst: num(row.cgst),
    sgst: num(row.sgst),
    igst: num(row.igst),
    gstin: String(row.customer_gstin ?? ''),
    placeOfSupply: String(row.place_of_supply ?? ''),
  };
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function flattenSummary(value: unknown, prefix = ''): Array<{ label: string; value: unknown }> {
  if (value == null) return [];
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, nested]) =>
      flattenSummary(nested, prefix ? `${prefix} · ${labelFor(key)}` : labelFor(key)),
    );
  }
  if (Array.isArray(value)) return [{ label: prefix || 'Rows', value: value.length }];
  return [{ label: prefix || 'Value', value }];
}

function recordCsvRow(record: ReportRecord) {
  return {
    date: record.date,
    number: record.number,
    type: record.typeLabel,
    party: record.party,
    status: record.status,
    total: record.total,
    amount_paid: record.paid ?? '',
    gstin: record.gstin ?? '',
    taxable: record.taxable ?? '',
    cgst: record.cgst ?? '',
    sgst: record.sgst ?? '',
    igst: record.igst ?? '',
    place_of_supply: record.placeOfSupply ?? '',
  };
}

function buildReportCsv(input: {
  report: string;
  period: string;
  summary: Array<{ label: string; value: unknown }>;
  records: ReportRecord[];
}) {
  const lines = [
    ['Report', input.report].map(csvCell).join(','),
    ['Period', input.period].map(csvCell).join(','),
    '',
    ['metric', 'value'].map(csvCell).join(','),
    ...input.summary.map((row) => [row.label, row.value].map(csvCell).join(',')),
  ];
  if (input.records.length) {
    const rows = input.records.map(recordCsvRow);
    const columns = Object.keys(rows[0]).filter((column) =>
      rows.some((row) => String(row[column as keyof typeof row] ?? '') !== ''),
    );
    lines.push(
      '',
      columns.map(csvCell).join(','),
      ...rows.map((row) => columns.map((column) => csvCell(row[column as keyof typeof row])).join(',')),
    );
  }
  return `\uFEFF${lines.join('\n')}`;
}

function paymentState(record: ReportRecord): 'paid' | 'partial' | 'unpaid' | null {
  if (!['sale', 'purchase', 'credit_note', 'debit_note'].includes(record.type)) return null;
  if (record.paid == null || record.total <= 0) return null;
  if (record.paid >= record.total - 0.01) return 'paid';
  return record.paid > 0 ? 'partial' : 'unpaid';
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value: unknown) {
  const iso = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '—';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function labelFor(key: string) {
  return MONEY_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function MetricTile({
  label,
  value,
  tone = 'default',
  wide,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger';
  wide?: boolean;
}) {
  return (
    <View style={[styles.metricTile, wide && styles.metricTileWide]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        style={[
          styles.metricValue,
          tone === 'success' && styles.successText,
          tone === 'danger' && styles.dangerText,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

function Breakdown({
  title,
  data,
  money,
  accent,
}: {
  title: string;
  data: Record<string, unknown>;
  money: (value: unknown) => string;
  accent?: 'success' | 'danger';
}) {
  return (
    <View style={styles.breakdown}>
      <Text style={styles.breakdownTitle}>{title}</Text>
      {Object.entries(data).map(([key, value]) => (
        <View key={key} style={[styles.breakdownRow, key === 'total' && styles.breakdownTotal]}>
          <Text style={[styles.breakdownLabel, key === 'total' && styles.breakdownTotalText]}>
            {labelFor(key)}
          </Text>
          <Text
            style={[
              styles.breakdownValue,
              key === 'total' && styles.breakdownTotalText,
              key === 'total' && accent === 'success' && styles.successText,
              key === 'total' && accent === 'danger' && styles.dangerText,
            ]}
          >
            {money(value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ShopBooksReportsScreen() {
  const { isDesktop } = useBreakpoint();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId, activeBusiness } = useWorkspace();

  const [slug, setSlug] = useState<ShopBooksReportSlug>('sales');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<unknown>(null);
  const [ledger, setLedger] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('date_desc');
  const [visibleCount, setVisibleCount] = useState(20);

  const activeOption = REPORT_OPTIONS.find((option) => option.value === slug) ?? REPORT_OPTIONS[0];
  const invalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const currency = activeBusiness?.currency || 'INR';

  const money = useCallback(
    (value: unknown) => {
      const amount = Number(value ?? 0);
      try {
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(Number.isFinite(amount) ? amount : 0);
      } catch {
        return `${currency} ${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
      }
    },
    [currency],
  );

  const runReport = useCallback(async () => {
    if (!client || !businessId || invalidRange) return;
    const query = {
      business_id: businessId,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    };
    const fetchAllRows = async (reportSlug: 'daybook' | 'gstr1') => {
      const allRows: Record<string, unknown>[] = [];
      let offset = 0;
      while (true) {
        const response = await client.shop.booksReport(reportSlug, {
          ...query,
          limit: 500,
          offset,
        });
        const page = Array.isArray(response.data)
          ? (response.data as Record<string, unknown>[])
          : [];
        allRows.push(...page);
        const nextOffset = response.meta.next_offset;
        if (typeof nextOffset !== 'number' || !page.length) break;
        offset = nextOffset;
      }
      return allRows;
    };
    setLoading(true);
    setError(null);
    try {
      // Summary-only reports still need the day book so the record list has rows to show.
      const needsLedger = slug !== 'daybook' && slug !== 'gstr1';
      const [report, daybook] = await Promise.all([
        slug === 'daybook' || slug === 'gstr1'
          ? fetchAllRows(slug).then((rows) => ({ data: rows }))
          : client.shop.booksReport(slug, query),
        needsLedger
          ? fetchAllRows('daybook').then((rows) => ({ data: rows })).catch(() => null)
          : Promise.resolve(null),
      ]);
      setData(report.data);
      setLedger(Array.isArray(daybook?.data) ? (daybook.data as Record<string, unknown>[]) : null);
      setVisibleCount(20);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load report';
      setError(message);
      toast.push(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [client, businessId, slug, dateFrom, dateTo, invalidRange, toast]);

  useEffect(() => {
    if (client && businessId) void runReport();
  }, [client, businessId, slug]); // Date changes are applied explicitly with "View report".

  const rows = useMemo(
    () => (Array.isArray(data) ? data.filter(isRecord) : []),
    [data],
  );

  const records = useMemo<ReportRecord[]>(() => {
    if (slug === 'gstr1') return rows.map(toGstr1Record);
    if (slug === 'daybook') return rows.map(toDaybookRecord);
    const allowed = RECORD_TYPES[slug];
    const source = (ledger ?? []).filter(isRecord).map(toDaybookRecord);
    return allowed ? source.filter((record) => allowed.includes(record.type)) : source;
  }, [slug, rows, ledger]);

  const typeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    records.forEach((record) => seen.set(record.type, record.typeLabel));
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [records]);

  const statusOptions = useMemo(() => {
    const seen = new Set(records.map((record) => record.status).filter(Boolean));
    return Array.from(seen, (value) => ({ value, label: labelFor(value) }));
  }, [records]);

  const showPaymentFilter = useMemo(
    () => records.some((record) => paymentState(record) != null),
    [records],
  );

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = records.filter((record) => {
      if (typeFilter !== 'all' && record.type !== typeFilter) return false;
      if (statusFilter !== 'all' && record.status !== statusFilter) return false;
      if (paymentFilter !== 'all' && paymentState(record) !== paymentFilter) return false;
      if (!term) return true;
      return (
        record.number.toLowerCase().includes(term) ||
        record.party.toLowerCase().includes(term) ||
        (record.gstin ?? '').toLowerCase().includes(term)
      );
    });
    return filtered.sort((a, b) => {
      if (sort === 'amount_desc') return b.total - a.total;
      if (sort === 'amount_asc') return a.total - b.total;
      const compared = a.date.localeCompare(b.date);
      return sort === 'date_asc' ? compared : -compared;
    });
  }, [records, search, typeFilter, statusFilter, paymentFilter, sort]);

  const filteredTotal = useMemo(
    () =>
      filteredRecords.reduce(
        (sum, record) => {
          if (record.status === 'void') return sum;
          const adjustment =
            (slug === 'sales' && record.type === 'credit_note') ||
            (slug === 'purchase' && record.type === 'debit_note');
          return sum + record.total * (adjustment ? -1 : 1);
        },
        0,
      ),
    [filteredRecords, slug],
  );

  const activeFilterCount =
    (typeFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (paymentFilter !== 'all' ? 1 : 0) +
    (search.trim() ? 1 : 0);

  function resetFilters() {
    setSearch('');
    setTypeFilter('all');
    setStatusFilter('all');
    setPaymentFilter('all');
    setSort('date_desc');
    setVisibleCount(20);
  }

  async function shareCsv() {
    if (data == null) return;
    const csv = buildReportCsv({
      report: activeOption.label,
      period: periodLabel,
      summary: flattenSummary(data),
      records: filteredRecords,
    });
    const filename = `${slug}-${dateFrom || 'all'}-${dateTo || 'today'}.csv`;
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
        toast.push('CSV downloaded', 'success');
        return;
      }
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('File sharing is not available on this device');
      }
      const file = new File(Paths.cache, filename);
      file.create({ overwrite: true, intermediates: true });
      file.write(csv);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
        dialogTitle: `Share ${activeOption.label}`,
      });
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to share CSV', 'error');
    }
  }

  const periodLabel = dateFrom || dateTo
    ? `${dateFrom ? formatDate(dateFrom) : 'Beginning'} – ${dateTo ? formatDate(dateTo) : 'Today'}`
    : 'All time';

  function setPreset(kind: 'month' | 'quarter' | 'year' | 'all') {
    if (kind === 'all') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    const today = new Date();
    const start =
      kind === 'month'
        ? new Date(today.getFullYear(), today.getMonth(), 1)
        : kind === 'quarter'
          ? new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)
          : new Date(today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear(), 3, 1);
    setDateFrom(toIsoDate(start));
    setDateTo(toIsoDate(today));
  }

  function renderReport() {
    if (loading && data == null) {
      return (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateTitle}>Preparing your report</Text>
          <Text style={styles.stateText}>Calculating totals and organising entries…</Text>
        </View>
      );
    }

    if (error && data == null) {
      return (
        <View style={styles.stateCard}>
          <View style={[styles.stateIcon, styles.errorIcon]}>
            <Feather name="alert-circle" size={22} color={colors.destructive} />
          </View>
          <Text style={styles.stateTitle}>Report could not be loaded</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void runReport()}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    if (data == null) return null;

    if ((slug === 'sales' || slug === 'purchase') && isRecord(data)) {
      return (
        <>
          <View style={styles.heroMetric}>
            <View style={[styles.heroIcon, slug === 'sales' ? styles.salesIcon : styles.purchaseIcon]}>
              <Feather name={slug === 'sales' ? 'arrow-up-right' : 'arrow-down-right'} size={22} color={slug === 'sales' ? colors.success : colors.primary} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroLabel}>{slug === 'sales' ? 'Total sales' : 'Total purchases'}</Text>
              <Text style={styles.heroValue} adjustsFontSizeToFit numberOfLines={1}>{money(data.total)}</Text>
              <Text style={styles.heroMeta}>{String(data.count ?? 0)} posted voucher{Number(data.count ?? 0) === 1 ? '' : 's'}</Text>
            </View>
          </View>
          <View style={[styles.metricGrid, isDesktop && styles.metricGridDesktop]}>
            <MetricTile label="Taxable value" value={money(data.taxable_value)} />
            <MetricTile label="Total GST" value={money(data.tax_total)} />
            <MetricTile label="CGST" value={money(data.cgst)} />
            <MetricTile label="SGST" value={money(data.sgst)} />
            <MetricTile label="IGST" value={money(data.igst)} />
          </View>
        </>
      );
    }

    if (slug === 'daybook' && Array.isArray(data)) {
      const total = rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
      const received = rows.reduce((sum, row) => sum + Number(row.amount_paid ?? 0), 0);
      return (
        <View style={[styles.metricGrid, isDesktop && styles.metricGridDesktop]}>
          <MetricTile label="Entries" value={String(rows.length)} />
          <MetricTile label="Gross value" value={money(total)} />
          <MetricTile label="Settled amount" value={money(received)} />
          <MetricTile label="Outstanding" value={money(Math.max(total - received, 0))} />
        </View>
      );
    }

    if (slug === 'gstr1' && Array.isArray(data)) {
      const taxable = rows.reduce((sum, row) => sum + Number(row.taxable_value ?? 0), 0);
      const total = rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
      const b2b = rows.filter((row) => row.invoice_type === 'B2B').length;
      return (
        <View style={[styles.metricGrid, isDesktop && styles.metricGridDesktop]}>
          <MetricTile label="Invoices" value={String(rows.length)} />
          <MetricTile label="B2B invoices" value={String(b2b)} />
          <MetricTile label="Taxable value" value={money(taxable)} />
          <MetricTile label="Invoice value" value={money(total)} />
        </View>
      );
    }

    if (slug === 'gstr3b' && isRecord(data)) {
      const outputTax = isRecord(data.output_tax) ? data.output_tax : {};
      const inputTax = isRecord(data.input_tax_credit) ? data.input_tax_credit : {};
      const netTax = isRecord(data.net_tax_payable) ? data.net_tax_payable : {};
      return (
        <>
          <View style={styles.summaryStrip}>
            <MetricTile label="Outward supplies" value={money(data.outward_taxable_supplies)} wide />
            <MetricTile label="Inward supplies" value={money(data.inward_supplies)} wide />
          </View>
          <Breakdown title="Output tax liability" data={outputTax} money={money} />
          <Breakdown title="Eligible input tax credit" data={inputTax} money={money} accent="success" />
          <View style={styles.payableCard}>
            <View style={styles.payableHeader}>
              <View style={styles.payableIcon}>
                <Feather name="dollar-sign" size={20} color={colors.warning} />
              </View>
              <View>
                <Text style={styles.payableTitle}>Estimated net tax payable</Text>
                <Text style={styles.payableHint}>Output tax less available input credit</Text>
              </View>
            </View>
            <Breakdown title="" data={netTax} money={money} accent="danger" />
          </View>
        </>
      );
    }

    if (slug === 'pnl' && isRecord(data)) {
      const income = isRecord(data.income) ? data.income : {};
      const expenses = isRecord(data.expenses) ? data.expenses : {};
      const profit = Number(data.net_profit ?? 0);
      return (
        <>
          <View style={[styles.profitCard, profit < 0 && styles.lossCard]}>
            <View style={[styles.heroIcon, profit >= 0 ? styles.salesIcon : styles.lossIcon]}>
              <Feather name={profit >= 0 ? 'trending-up' : 'trending-down'} size={22} color={profit >= 0 ? colors.success : colors.destructive} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroLabel}>{profit >= 0 ? 'Net profit' : 'Net loss'}</Text>
              <Text style={[styles.heroValue, profit >= 0 ? styles.successText : styles.dangerText]} numberOfLines={1} adjustsFontSizeToFit>
                {money(Math.abs(profit))}
              </Text>
              <Text style={styles.heroMeta}>{periodLabel}</Text>
            </View>
          </View>
          <View style={[styles.pnlGrid, isDesktop && styles.pnlGridDesktop]}>
            <Breakdown title="Income" data={income} money={money} accent="success" />
            <Breakdown title="Expenses" data={expenses} money={money} accent="danger" />
          </View>
        </>
      );
    }

    return <EmptyReport message="There is no report data for this period." />;
  }

  function renderRecords() {
    if (data == null || (loading && !records.length)) return null;

    const visible = filteredRecords.slice(0, visibleCount);
    const hasVoid = records.some((record) => record.status === 'void');

    return (
      <View style={styles.recordsSection}>
        <View style={styles.recordsHeader}>
          <View style={styles.recordsHeadingCopy}>
            <Text style={styles.recordsTitle}>All records</Text>
            <Text style={styles.recordsMeta}>
              {filteredRecords.length} of {records.length}
              {slug === 'gstr3b' || slug === 'pnl' ? '' : ` · ${money(filteredTotal)}`}
            </Text>
          </View>
          <Pressable
            style={[styles.filterToggle, filtersOpen && styles.filterToggleActive]}
            onPress={() => setFiltersOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel="Toggle record filters"
          >
            <Feather name="sliders" size={15} color={filtersOpen ? colors.primaryForeground : colors.primary} />
            <Text style={[styles.filterToggleText, filtersOpen && styles.filterToggleTextActive]}>
              Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
            </Text>
          </Pressable>
        </View>

        {filtersOpen ? (
          <View style={styles.filterPanel}>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search number, party or GSTIN" />

            {typeOptions.length > 1 ? (
              <FilterRow
                label="Type"
                value={typeFilter}
                options={[{ value: 'all', label: 'All types' }, ...typeOptions]}
                onChange={setTypeFilter}
              />
            ) : null}

            {statusOptions.length > 1 ? (
              <FilterRow
                label="Status"
                value={statusFilter}
                options={[{ value: 'all', label: 'All statuses' }, ...statusOptions]}
                onChange={setStatusFilter}
              />
            ) : null}

            {showPaymentFilter ? (
              <FilterRow
                label="Payment"
                value={paymentFilter}
                options={[
                  { value: 'all', label: 'Any' },
                  { value: 'paid', label: 'Paid' },
                  { value: 'partial', label: 'Partly paid' },
                  { value: 'unpaid', label: 'Unpaid' },
                ]}
                onChange={setPaymentFilter}
              />
            ) : null}

            <FilterRow
              label="Sort by"
              value={sort}
              options={SORT_OPTIONS}
              onChange={(value) => setSort(value as SortKey)}
            />

            {activeFilterCount ? (
              <Pressable style={styles.clearFilters} onPress={resetFilters}>
                <Feather name="x-circle" size={14} color={colors.destructive} />
                <Text style={styles.clearFiltersText}>Clear filters</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {hasVoid ? (
          <Text style={styles.recordsNote}>Void entries are listed here but excluded from report totals.</Text>
        ) : null}

        <View style={styles.list}>
          {visible.map((record) => (
            <RecordCard key={record.key} record={record} money={money} />
          ))}
        </View>

        {filteredRecords.length > visible.length ? (
          <Pressable style={styles.moreBtn} onPress={() => setVisibleCount((count) => count + 20)}>
            <Text style={styles.moreText}>
              Show {Math.min(20, filteredRecords.length - visible.length)} more
            </Text>
            <Feather name="chevron-down" size={16} color={colors.primary} />
          </Pressable>
        ) : null}

        {!filteredRecords.length ? (
          <EmptyReport
            message={
              records.length
                ? 'No records match the current filters.'
                : 'No vouchers were posted in this period.'
            }
          />
        ) : null}
      </View>
    );
  }

  return (
    <DesktopPage>
      <RefreshableScrollView
        contentContainerStyle={styles.content}
        refreshing={loading && data != null}
        onRefresh={data != null ? runReport : undefined}
      >
        <View style={styles.heading}>
          <View>
            <Text style={styles.title}>Books reports</Text>
            <Text style={styles.subtitle}>Business performance and GST insights</Text>
          </View>
          {loading && data != null ? <ActivityIndicator color={colors.primary} /> : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.hScroll}
          contentContainerStyle={styles.reportTabs}
        >
          {REPORT_OPTIONS.map((option) => {
            const active = option.value === slug;
            return (
              <Pressable
                key={option.value}
                style={[styles.reportTab, active && styles.reportTabActive]}
                onPress={() => {
                  setSlug(option.value);
                  setData(null);
                  setLedger(null);
                  setError(null);
                  resetFilters();
                }}
              >
                <Feather name={option.icon} size={15} color={active ? colors.primaryForeground : colors.mutedForeground} />
                <Text style={[styles.reportTabText, active && styles.reportTabTextActive]}>{option.shortLabel}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.filterCard}>
          <View style={styles.filterHeading}>
            <View style={styles.filterIcon}>
              <Feather name={activeOption.icon} size={18} color={colors.primary} />
            </View>
            <View style={styles.filterCopy}>
              <Text style={styles.filterTitle}>{activeOption.label}</Text>
              <Text style={styles.hint}>{activeOption.hint}</Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.hScroll}
            contentContainerStyle={styles.presets}
          >
            <PresetChip label="This month" onPress={() => setPreset('month')} />
            <PresetChip label="This quarter" onPress={() => setPreset('quarter')} />
            <PresetChip label="Financial year" onPress={() => setPreset('year')} />
            <PresetChip label="All time" onPress={() => setPreset('all')} />
          </ScrollView>

          <View style={[styles.dateGrid, isDesktop && styles.dateGridDesktop]}>
            <View style={styles.dateField}><DateField label="From date" value={dateFrom} onChange={setDateFrom} /></View>
            <View style={styles.dateField}><DateField label="To date" value={dateTo} onChange={setDateTo} /></View>
          </View>
          {invalidRange ? <Text style={styles.error}>“From date” must be before or equal to “To date”.</Text> : null}

          <Pressable
            style={[styles.runBtn, (loading || invalidRange) && styles.runBtnDisabled]}
            onPress={() => void runReport()}
            disabled={loading || invalidRange}
          >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="bar-chart-2" size={16} color="#fff" />
                <Text style={styles.runBtnText}>View report</Text>
            </>
          )}
          </Pressable>
        </View>

        {data != null ? (
          <View style={styles.resultHeader}>
            <View style={styles.resultHeadingCopy}>
              <Text style={styles.resultTitle}>{activeOption.label}</Text>
              <Text style={styles.period}>{periodLabel}</Text>
            </View>
            <View style={styles.resultActions}>
              {loading ? <Text style={styles.updating}>Updating…</Text> : null}
              <Pressable
                style={styles.shareBtn}
                onPress={() => void shareCsv()}
                accessibilityRole="button"
                accessibilityLabel="Share CSV"
              >
                <Feather name="share-2" size={15} color={colors.primary} />
                <Text style={styles.shareBtnText}>Share CSV</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {error && data != null ? <Text style={styles.error}>{error}</Text> : null}
        {renderReport()}
        {renderRecords()}
      </RefreshableScrollView>
    </DesktopPage>
  );
}

function FilterRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterRowLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.hScroll}
        contentContainerStyle={styles.chipRow}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(option.value)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function RecordCard({ record, money }: { record: ReportRecord; money: (value: unknown) => string }) {
  const isVoid = record.status === 'void';
  const payment = paymentState(record);
  const balance = record.paid == null ? 0 : Math.max(record.total - record.paid, 0);
  const hasGst = hasGstDetail(record);

  return (
    <View style={[styles.entryCard, isVoid && styles.entryCardVoid]}>
      <View style={styles.entryTop}>
        <View style={styles.entryIdentity}>
          <View style={styles.invoiceTitleRow}>
            <Text style={[styles.entryNumber, isVoid && styles.strikeText]}>{record.number}</Text>
            <View style={[styles.typeBadge, record.type === 'B2B' && styles.b2bBadge]}>
              <Text style={[styles.typeBadgeText, record.type === 'B2B' && styles.b2bBadgeText]}>
                {record.typeLabel}
              </Text>
            </View>
          </View>
          <Text style={styles.entryDate}>{formatDate(record.date)}</Text>
        </View>
        <View style={styles.entryAmountCol}>
          <Text style={[styles.entryAmount, isVoid && styles.strikeText]}>{money(record.total)}</Text>
          {payment ? (
            <Text
              style={[
                styles.paymentTag,
                payment === 'paid' && styles.successText,
                payment === 'unpaid' && styles.dangerText,
                payment === 'partial' && styles.warningText,
              ]}
            >
              {payment === 'paid' ? 'Paid' : payment === 'partial' ? `${money(balance)} due` : 'Unpaid'}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.entryBottom}>
        <Text style={styles.entryParty} numberOfLines={1}>
          {record.party}
        </Text>
        <View style={[styles.statusDot, isVoid && styles.statusDotVoid]} />
        <Text style={[styles.statusText, isVoid && styles.dangerText]}>{labelFor(record.status || 'posted')}</Text>
      </View>

      {hasGst ? (
        <>
          <View style={styles.gstMetaRow}>
            <Text style={styles.gstMeta}>GSTIN: {record.gstin || 'Unregistered'}</Text>
            <Text style={styles.gstMeta}>Taxable: {money(record.taxable)}</Text>
          </View>
          <View style={styles.taxRow}>
            <Text style={styles.taxText}>CGST {money(record.cgst)}</Text>
            <Text style={styles.taxText}>SGST {money(record.sgst)}</Text>
            <Text style={styles.taxText}>IGST {money(record.igst)}</Text>
            {record.placeOfSupply ? <Text style={styles.taxText}>PoS {record.placeOfSupply}</Text> : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

function PresetChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.presetChip} onPress={onPress}>
      <Text style={styles.presetText}>{label}</Text>
    </Pressable>
  );
}

function EmptyReport({ message }: { message: string }) {
  return (
    <View style={styles.stateCard}>
      <View style={styles.stateIcon}>
        <Feather name="inbox" size={22} color={colors.mutedForeground} />
      </View>
      <Text style={styles.stateTitle}>Nothing to show</Text>
      <Text style={styles.stateText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.heading, color: colors.foreground },
  subtitle: { ...typography.body, color: colors.mutedForeground },
  /** Horizontal strips inside a vertical scroll view stretch unless growth is pinned. */
  hScroll: { flexGrow: 0, flexShrink: 0 },
  reportTabs: { gap: spacing.sm, paddingRight: spacing.lg, alignItems: 'center' },
  reportTab: {
    height: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reportTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  reportTabText: { ...typography.label, color: colors.mutedForeground },
  reportTabTextActive: { color: colors.primaryForeground },
  filterCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadows.soft,
  },
  filterHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  filterIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  filterCopy: { flex: 1, gap: 2 },
  filterTitle: { ...typography.title, fontSize: 16, color: colors.foreground },
  hint: { ...typography.caption, color: colors.mutedForeground, lineHeight: 17 },
  presets: { gap: spacing.sm, alignItems: 'center' },
  presetChip: {
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetText: { ...typography.caption, fontFamily: fonts.bodyMedium, color: colors.foreground },
  dateGrid: { gap: spacing.md },
  dateGridDesktop: { flexDirection: 'row' },
  dateField: { flex: 1 },
  runBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
  },
  runBtnDisabled: { opacity: 0.55 },
  runBtnText: { ...typography.label, color: colors.primaryForeground },
  error: { ...typography.caption, color: colors.destructive, lineHeight: 18 },
  resultHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  resultHeadingCopy: { flex: 1 },
  resultTitle: { fontFamily: fonts.displayMedium, fontSize: 19, color: colors.foreground },
  period: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  resultActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  updating: { ...typography.caption, color: colors.primary },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  shareBtnText: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.primary },
  heroMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  salesIcon: { backgroundColor: colors.successSoft },
  purchaseIcon: { backgroundColor: colors.tint },
  lossIcon: { backgroundColor: colors.destructiveSoft },
  heroCopy: { flex: 1 },
  heroLabel: { ...typography.caption, color: colors.mutedForeground },
  heroValue: { ...typography.kpiValue, fontSize: 27, marginTop: 2 },
  heroMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricGridDesktop: {},
  metricTile: {
    minWidth: '46%',
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  metricTileWide: { minWidth: '58%' },
  metricLabel: { ...typography.caption, color: colors.mutedForeground },
  metricValue: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.foreground },
  summaryStrip: { flexDirection: 'row', gap: spacing.sm },
  recordsSection: { gap: spacing.md, marginTop: spacing.sm },
  recordsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  recordsHeadingCopy: { flex: 1 },
  recordsTitle: { ...typography.title, fontSize: 16, color: colors.foreground },
  recordsMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterToggleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterToggleText: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.primary },
  filterToggleTextActive: { color: colors.primaryForeground },
  filterPanel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  filterRow: { gap: spacing.sm },
  filterRowLabel: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.mutedForeground },
  chipRow: { gap: spacing.sm, paddingRight: spacing.sm, alignItems: 'center' },
  chip: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: { backgroundColor: colors.tint, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.mutedForeground },
  chipTextActive: { color: colors.primary, fontFamily: fonts.bodySemi },
  clearFilters: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  clearFiltersText: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.destructive },
  recordsNote: { ...typography.caption, color: colors.mutedForeground },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  moreText: { ...typography.label, color: colors.primary },
  list: { gap: spacing.sm },
  entryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  entryCardVoid: { backgroundColor: colors.background },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  entryIdentity: { flex: 1, gap: 2 },
  entryAmountCol: { alignItems: 'flex-end', gap: 2 },
  paymentTag: { ...typography.tiny, color: colors.mutedForeground },
  strikeText: { textDecorationLine: 'line-through', color: colors.mutedForeground },
  entryNumber: { ...typography.label, fontSize: 14, color: colors.foreground },
  entryDate: { ...typography.caption, color: colors.mutedForeground },
  entryAmount: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  entryBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: colors.tint },
  typeBadgeText: { ...typography.tiny, color: colors.primary },
  b2bBadge: { backgroundColor: colors.successSoft },
  b2bBadgeText: { color: colors.success },
  entryParty: { ...typography.caption, color: colors.foreground, flex: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  statusDotVoid: { backgroundColor: colors.destructive },
  statusText: { ...typography.tiny, color: colors.success, textTransform: 'capitalize' },
  invoiceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  customerName: { ...typography.body, fontFamily: fonts.bodyMedium, color: colors.foreground },
  gstMetaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  gstMeta: { ...typography.caption, color: colors.mutedForeground },
  taxRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  taxText: { ...typography.tiny, color: colors.mutedForeground },
  breakdown: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  breakdownTitle: { ...typography.title, fontSize: 15, color: colors.foreground },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  breakdownLabel: { ...typography.body, color: colors.mutedForeground, flex: 1 },
  breakdownValue: { ...typography.label, color: colors.foreground },
  breakdownTotal: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  breakdownTotalText: { fontFamily: fonts.bodyBold, color: colors.foreground },
  payableCard: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  payableHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xs },
  payableIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payableTitle: { ...typography.label, color: colors.foreground },
  payableHint: { ...typography.caption, color: colors.mutedForeground },
  profitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.successSoft,
    padding: spacing.xl,
  },
  lossCard: { backgroundColor: colors.destructiveSoft },
  pnlGrid: { gap: spacing.md },
  pnlGridDesktop: { flexDirection: 'row' },
  successText: { color: colors.success },
  dangerText: { color: colors.destructive },
  warningText: { color: colors.warning },
  stateCard: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  stateIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIcon: { backgroundColor: colors.destructiveSoft },
  stateTitle: { ...typography.title, fontSize: 16, color: colors.foreground, textAlign: 'center' },
  stateText: { ...typography.body, color: colors.mutedForeground, textAlign: 'center', lineHeight: 20 },
  retryBtn: { marginTop: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.tint },
  retryText: { ...typography.label, color: colors.primary },
});
