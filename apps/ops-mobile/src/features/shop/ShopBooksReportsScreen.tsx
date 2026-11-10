import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { DateField } from '../../components/DateField';
import { FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { SearchBar } from '../../components/SearchBar';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { DesktopPage } from '../../components/DesktopPage';
import { GroupedList } from '../../components/ui/GroupedList';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { colors, fonts, radius, shadows, spacing, typography } from '../../theme/tokens';
import { openShopDocumentHtmlView, type ShopDocTarget } from '../../utils/shopDocumentShare';
import { BooksInvoiceDrawer } from './BooksInvoiceDrawer';
import { getApiErrorMessage } from '../../utils/format';
import { DocumentActionsSheet } from './DocumentActionsSheet';
import { formatVoucherDateTime } from './shopBooksHelpers';
import { SaleInsightChips } from './SaleInsightChips';
import type { TFunction } from 'i18next';
import type { ShopBooksReportSlug } from '@ie-orbit/sdk';

type SaleSource = 'pos' | 'online' | 'booking';

function saleSourceOptions(t: TFunction): Array<{ value: string; label: string }> {
  return [
    { value: 'all', label: t('shop.reportsPage.sourceAll') },
    { value: 'pos', label: t('shop.reportsPage.sourceOptions.pos') },
    { value: 'online', label: t('shop.reportsPage.sourceOptions.online') },
    { value: 'booking', label: t('shop.reportsPage.sourceOptions.booking') },
  ];
}

function saleSourceLabel(t: TFunction, source: SaleSource) {
  return t(`shop.reportsPage.sourceLabels.${source}`);
}

function parseSaleSource(value: unknown): SaleSource | null {
  const key = String(value ?? '').trim().toLowerCase();
  if (key === 'pos' || key === 'online' || key === 'booking') return key;
  return null;
}

type ReportOption = {
  value: ShopBooksReportSlug;
  icon: React.ComponentProps<typeof Feather>['name'];
};

const REPORT_OPTIONS: ReportOption[] = [
  { value: 'sales', icon: 'trending-up' },
  { value: 'purchase', icon: 'shopping-cart' },
  { value: 'daybook', icon: 'book-open' },
  { value: 'gstr1', icon: 'file-text' },
  { value: 'gstr3b', icon: 'layers' },
  { value: 'pnl', icon: 'pie-chart' },
];

function titleCase(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function labelFor(key: string, t: TFunction) {
  return t(`shop.reportsPage.metrics.${key}`, {
    defaultValue: t(`shop.reportsPage.statuses.${key}`, { defaultValue: titleCase(key) }),
  });
}

function voucherTypeLabel(type: string, t: TFunction) {
  return t(`shop.reportsPage.voucherTypes.${type}`, { defaultValue: titleCase(type || 'entry') });
}

/** Invoice-style docs that support HTML view / PDF / share links. */
const DOCUMENT_KINDS = new Set(['sale', 'credit_note', 'debit_note']);

/** Voucher types that make up each report's underlying records. Undefined means every type. */
const RECORD_TYPES: Partial<Record<ShopBooksReportSlug, string[]>> = {
  sales: ['sale', 'credit_note'],
  purchase: ['purchase', 'debit_note'],
  gstr3b: ['sale', 'credit_note', 'purchase', 'debit_note'],
  pnl: ['sale', 'credit_note', 'other_income', 'purchase', 'debit_note', 'expense'],
};

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

function sortOptions(t: TFunction): Array<{ value: SortKey; label: string }> {
  return [
    { value: 'date_desc', label: t('shop.reportsPage.sort.date_desc') },
    { value: 'date_asc', label: t('shop.reportsPage.sort.date_asc') },
    { value: 'amount_desc', label: t('shop.reportsPage.sort.amount_desc') },
    { value: 'amount_asc', label: t('shop.reportsPage.sort.amount_asc') },
  ];
}

type ReportRecord = {
  key: string;
  id: string | null;
  number: string;
  date: string;
  createdAt?: string;
  type: string;
  typeLabel: string;
  /** Document API kind when view/share is supported (`sale`, `credit_note`, `debit_note`). */
  docKind: string | null;
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
  /** POS / online / booking when the voucher came from a shop or booking sale. */
  saleSource: SaleSource | null;
  pointsEarned: number;
  pointsRedeemed: number;
  grossProfit: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function docKindFor(voucherType: string): string | null {
  const kind = voucherType.toLowerCase();
  return DOCUMENT_KINDS.has(kind) ? kind : null;
}

function toDaybookRecord(row: Record<string, unknown>, index: number, t: TFunction): ReportRecord {
  const type = String(row.voucher_type ?? '').toLowerCase();
  const id = row.id == null || row.id === '' ? null : String(row.id);
  return {
    key: id ?? `${row.voucher_number ?? 'row'}-${index}`,
    id,
    number: String(row.voucher_number ?? '—'),
    date: String(row.voucher_date ?? ''),
    createdAt: String(row.created_at ?? ''),
    type,
    typeLabel: voucherTypeLabel(type, t),
    docKind: docKindFor(type),
    party: String(row.party ?? row.cash_account ?? t('shop.reportsPage.cashWalkIn')),
    status: String(row.status ?? '').toLowerCase(),
    total: num(row.total),
    paid: row.amount_paid == null ? null : num(row.amount_paid),
    taxable: row.taxable_value == null ? undefined : num(row.taxable_value),
    cgst: row.cgst == null ? undefined : num(row.cgst),
    sgst: row.sgst == null ? undefined : num(row.sgst),
    igst: row.igst == null ? undefined : num(row.igst),
    gstin: row.party_gstin == null ? undefined : String(row.party_gstin),
    placeOfSupply: row.place_of_supply == null ? undefined : String(row.place_of_supply),
    saleSource: parseSaleSource(row.sale_source),
    pointsEarned: Math.max(0, Math.floor(num(row.points_earned))),
    pointsRedeemed: Math.max(0, Math.floor(num(row.points_redeemed))),
    grossProfit:
      row.gross_profit == null || row.gross_profit === '' ? null : String(row.gross_profit),
  };
}

/** Cash, transfer and payment vouchers carry no GST, so their tax block stays hidden. */
function hasGstDetail(record: ReportRecord) {
  if (record.taxable == null) return false;
  return record.taxable > 0 || (record.cgst ?? 0) + (record.sgst ?? 0) + (record.igst ?? 0) > 0;
}

function toGstr1Record(row: Record<string, unknown>, index: number, t: TFunction): ReportRecord {
  const invoiceType = String(row.invoice_type ?? 'B2C').toUpperCase();
  const voucherType = String(row.voucher_type ?? 'sale').toLowerCase();
  const id = row.id == null || row.id === '' ? null : String(row.id);
  return {
    key: id ?? `${String(row.voucher_number ?? 'invoice')}-${index}`,
    id,
    number: String(row.voucher_number ?? '—'),
    date: String(row.voucher_date ?? ''),
    createdAt: String(row.created_at ?? ''),
    type: invoiceType,
    typeLabel: invoiceType,
    docKind: docKindFor(voucherType),
    party: String(row.customer_name ?? t('shop.reportsPage.walkInB2c')),
    status: 'confirmed',
    total: num(row.total),
    paid: null,
    taxable: num(row.taxable_value),
    cgst: num(row.cgst),
    sgst: num(row.sgst),
    igst: num(row.igst),
    gstin: String(row.customer_gstin ?? ''),
    placeOfSupply: String(row.place_of_supply ?? ''),
    saleSource: parseSaleSource(row.sale_source),
    pointsEarned: Math.max(0, Math.floor(num(row.points_earned))),
    pointsRedeemed: Math.max(0, Math.floor(num(row.points_redeemed))),
    grossProfit:
      row.gross_profit == null || row.gross_profit === '' ? null : String(row.gross_profit),
  };
}

function documentTitle(kind: string, t: TFunction, number?: string) {
  const label = t(`shop.reportsPage.voucherTypes.${kind}`, { defaultValue: t('shop.reportsPage.document') });
  return number ? `${label} ${number}` : label;
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function flattenSummary(
  value: unknown,
  t: TFunction,
  prefix = '',
): Array<{ label: string; value: unknown }> {
  if (value == null) return [];
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, nested]) =>
      flattenSummary(nested, t, prefix ? `${prefix} · ${labelFor(key, t)}` : labelFor(key, t)),
    );
  }
  if (Array.isArray(value)) return [{ label: prefix || t('opsApp.shop.reports.csvRows'), value: value.length }];
  return [{ label: prefix || t('opsApp.shop.reports.csvValue'), value }];
}

function recordCsvRow(record: ReportRecord, t: TFunction) {
  return {
    date: record.date,
    number: record.number,
    type: record.typeLabel,
    source: record.saleSource ? saleSourceLabel(t, record.saleSource) : '',
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

function businessAddressLine(business?: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
} | null) {
  if (!business) return '';
  return [
    business.address_line1,
    business.address_line2,
    [business.city, business.state, business.postal_code].filter(Boolean).join(', '),
    business.country,
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' · ');
}

function buildReportCsv(input: {
  report: string;
  period: string;
  summary: Array<{ label: string; value: unknown }>;
  records: ReportRecord[];
  businessName?: string;
  businessGstin?: string;
  businessAddress?: string;
  t: TFunction;
}) {
  const lines = [
    ['Business', input.businessName || '—'].map(csvCell).join(','),
    ['GSTIN', input.businessGstin || '—'].map(csvCell).join(','),
  ];
  if (input.businessAddress) {
    lines.push(['Address', input.businessAddress].map(csvCell).join(','));
  }
  lines.push(
    ['Report', input.report].map(csvCell).join(','),
    ['Period', input.period].map(csvCell).join(','),
    '',
    ['metric', 'value'].map(csvCell).join(','),
    ...input.summary.map((row) => [row.label, row.value].map(csvCell).join(',')),
  );
  if (input.records.length) {
    const rows = input.records.map((record) => recordCsvRow(record, input.t));
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

function formatDate(value: unknown, timestamp?: unknown) {
  return formatVoucherDateTime(String(value ?? ''), timestamp ? String(timestamp) : null) || '—';
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
  const { t } = useTranslation();
  return (
    <View style={styles.breakdown}>
      <Text style={styles.breakdownTitle}>{title}</Text>
      {Object.entries(data).map(([key, value]) => (
        <View key={key} style={[styles.breakdownRow, key === 'total' && styles.breakdownTotal]}>
          <Text style={[styles.breakdownLabel, key === 'total' && styles.breakdownTotalText]}>
            {labelFor(key, t)}
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
  const { t } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const client = useOpsClient();
  const auth = useAuth();
  const toast = useToast();
  const { businessId, activeBusiness, tenantId } = useWorkspace();

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
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('date_desc');
  const [visibleCount, setVisibleCount] = useState(20);
  const [booksInvoiceId, setBooksInvoiceId] = useState<string | null>(null);
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);

  const activeOptionBase = REPORT_OPTIONS.find((option) => option.value === slug) ?? REPORT_OPTIONS[0];
  const activeOption = {
    ...activeOptionBase,
    label: t(`shop.reportsPage.tabs.${activeOptionBase.value}`),
    hint: t(`shop.reportsPage.tabsDesc.${activeOptionBase.value}`),
  };
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
      const message = err instanceof Error ? err.message : t('opsApp.shop.reports.loadFailed');
      setError(message);
      toast.push(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [client, businessId, slug, dateFrom, dateTo, invalidRange, toast, t]);

  useEffect(() => {
    if (client && businessId) void runReport();
  }, [client, businessId, slug]); // Date changes are applied explicitly with "View report".

  const openDocActions = useCallback(
    (record: ReportRecord) => {
      if (!businessId || !record.id || !record.docKind) return;
      setDocActions({
        kind: record.docKind,
        id: record.id,
        number: record.number,
        businessId,
        phone: '',
        email: '',
      });
    },
    [businessId],
  );

  const viewDocument = useCallback(
    (record: ReportRecord) => {
      if (!businessId || !record.id || !record.docKind) return;
      if (!auth.token) {
        toast.push(t('opsApp.shop.common.signInAgain'), 'error');
        return;
      }
      void openShopDocumentHtmlView({
        target: {
          kind: record.docKind,
          id: record.id,
          number: record.number,
          businessId,
        },
        token: auth.token,
        tenantId,
      }).catch((err) => toast.push(getApiErrorMessage(err, t('shop.vouchers.viewFailed')), 'error'));
    },
    [auth.token, businessId, tenantId, toast, t],
  );

  const rows = useMemo(
    () => (Array.isArray(data) ? data.filter(isRecord) : []),
    [data],
  );

  const records = useMemo<ReportRecord[]>(() => {
    if (slug === 'gstr1') return rows.map((row, index) => toGstr1Record(row, index, t));
    if (slug === 'daybook') return rows.map((row, index) => toDaybookRecord(row, index, t));
    const allowed = RECORD_TYPES[slug];
    const source = (ledger ?? []).filter(isRecord).map((row, index) => toDaybookRecord(row, index, t));
    return allowed ? source.filter((record) => allowed.includes(record.type)) : source;
  }, [slug, rows, ledger, t]);

  const typeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    records.forEach((record) => seen.set(record.type, record.typeLabel));
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [records]);

  const statusOptions = useMemo(() => {
    const seen = new Set(records.map((record) => record.status).filter(Boolean));
    return Array.from(seen, (value) => ({ value, label: labelFor(value, t) }));
  }, [records, t]);

  const showPaymentFilter = useMemo(
    () => records.some((record) => paymentState(record) != null),
    [records],
  );

  const showSourceFilter = useMemo(
    () => records.some((record) => record.saleSource != null),
    [records],
  );

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = records.filter((record) => {
      if (typeFilter !== 'all' && record.type !== typeFilter) return false;
      if (statusFilter !== 'all' && record.status !== statusFilter) return false;
      if (paymentFilter !== 'all' && paymentState(record) !== paymentFilter) return false;
      if (sourceFilter !== 'all' && record.saleSource !== sourceFilter) return false;
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
  }, [records, search, typeFilter, statusFilter, paymentFilter, sourceFilter, sort]);

  const filteredTotals = useMemo(
    () =>
      filteredRecords.reduce(
        (acc, record) => {
          if (record.status === 'void') return acc;
          const adjustment =
            (slug === 'sales' && record.type === 'credit_note') ||
            (slug === 'purchase' && record.type === 'debit_note');
          const sign = adjustment ? -1 : 1;
          const paid = record.paid == null ? 0 : record.paid;
          return {
            count: acc.count + 1,
            taxable: acc.taxable + (record.taxable ?? 0) * sign,
            cgst: acc.cgst + (record.cgst ?? 0) * sign,
            sgst: acc.sgst + (record.sgst ?? 0) * sign,
            igst: acc.igst + (record.igst ?? 0) * sign,
            taxTotal: acc.taxTotal + ((record.cgst ?? 0) + (record.sgst ?? 0) + (record.igst ?? 0)) * sign,
            total: acc.total + record.total * sign,
            settled: acc.settled + Math.min(paid, record.total) * sign,
          };
        },
        { count: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, taxTotal: 0, total: 0, settled: 0 },
      ),
    [filteredRecords, slug],
  );

  const filteredTotal = filteredTotals.total;

  /** Sales/Purchase/Daybook/GSTR-1 headlines follow the same filters as the record list. */
  const headlineFromFilters =
    slug === 'daybook' ||
    slug === 'gstr1' ||
    ((slug === 'sales' || slug === 'purchase') && ledger != null);

  const activeFilterCount =
    (typeFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (paymentFilter !== 'all' ? 1 : 0) +
    (sourceFilter !== 'all' ? 1 : 0) +
    (search.trim() ? 1 : 0);

  function resetFilters() {
    setSearch('');
    setTypeFilter('all');
    setStatusFilter('all');
    setPaymentFilter('all');
    setSourceFilter('all');
    setSort('date_desc');
    setVisibleCount(20);
  }

  async function shareCsv() {
    if (data == null) return;
    const businessName =
      String(activeBusiness?.display_name || activeBusiness?.business_name || '').trim() || t('common.business');
    const csv = buildReportCsv({
      report: activeOption.label,
      period: periodLabel,
      summary: flattenSummary(data, t),
      records: filteredRecords,
      businessName,
      businessGstin: String(activeBusiness?.gst_tax_number || '').trim(),
      businessAddress: businessAddressLine(activeBusiness),
      t,
    });
    const safeBiz = businessName.replace(/[^\w.-]+/g, '_').slice(0, 40);
    const filename = `${safeBiz}_${slug}_${dateFrom || 'all'}_${dateTo || 'today'}.csv`;
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
        toast.push(t('opsApp.shop.reports.csvDownloaded'), 'success');
        return;
      }
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error(t('opsApp.shop.reports.sharingUnavailable'));
      }
      const file = new File(Paths.cache, filename);
      file.create({ overwrite: true, intermediates: true });
      file.write(csv);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
        dialogTitle: t('opsApp.shop.reports.shareTitle', { name: activeOption.label }),
      });
    } catch (err) {
      toast.push(err instanceof Error ? err.message : t('opsApp.shop.reports.shareCsvFailed'), 'error');
    }
  }

  const periodLabel = dateFrom || dateTo
    ? t('shop.reportsPage.periodRange', {
        from: dateFrom ? formatDate(dateFrom) : t('shop.reportsPage.beginning'),
        to: dateTo ? formatDate(dateTo) : t('shop.reportsPage.today'),
      })
    : t('shop.reportsPage.allTime');

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
          <Text style={styles.stateTitle}>{t('opsApp.shop.reports.preparingTitle')}</Text>
          <Text style={styles.stateText}>{t('opsApp.shop.reports.preparingText')}</Text>
        </View>
      );
    }

    if (error && data == null) {
      return (
        <View style={styles.stateCard}>
          <View style={[styles.stateIcon, styles.errorIcon]}>
            <Feather name="alert-circle" size={22} color={colors.destructive} />
          </View>
          <Text style={styles.stateTitle}>{t('opsApp.shop.reports.loadErrorTitle')}</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void runReport()}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      );
    }

    if (data == null) return null;

    if ((slug === 'sales' || slug === 'purchase') && isRecord(data)) {
      const total = headlineFromFilters ? filteredTotals.total : num(data.total);
      const count = headlineFromFilters ? filteredTotals.count : Number(data.count ?? 0);
      const taxable = headlineFromFilters ? filteredTotals.taxable : num(data.taxable_value);
      const taxTotal = headlineFromFilters ? filteredTotals.taxTotal : num(data.tax_total);
      const cgst = headlineFromFilters ? filteredTotals.cgst : num(data.cgst);
      const sgst = headlineFromFilters ? filteredTotals.sgst : num(data.sgst);
      const igst = headlineFromFilters ? filteredTotals.igst : num(data.igst);
      return (
        <>
          <View style={styles.heroMetric}>
            <View style={[styles.heroIcon, slug === 'sales' ? styles.salesIcon : styles.purchaseIcon]}>
              <Feather name={slug === 'sales' ? 'arrow-up-right' : 'arrow-down-right'} size={22} color={slug === 'sales' ? colors.success : colors.primary} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroLabel}>{slug === 'sales' ? t('opsApp.shop.reports.heroTotalSales') : t('opsApp.shop.reports.heroTotalPurchases')}</Text>
              <Text style={styles.heroValue} adjustsFontSizeToFit numberOfLines={1}>{money(total)}</Text>
              <Text style={styles.heroMeta}>{t('opsApp.shop.reports.postedVouchers', { count })}</Text>
            </View>
          </View>
          <View style={[styles.metricGrid, isDesktop && styles.metricGridDesktop]}>
            <MetricTile label={t('shop.reportsPage.metrics.taxable_value')} value={money(taxable)} />
            <MetricTile label={t('shop.reportsPage.metrics.tax_total')} value={money(taxTotal)} />
            <MetricTile label={t('shop.reportsPage.metrics.cgst')} value={money(cgst)} />
            <MetricTile label={t('shop.reportsPage.metrics.sgst')} value={money(sgst)} />
            <MetricTile label={t('shop.reportsPage.metrics.igst')} value={money(igst)} />
          </View>
        </>
      );
    }

    if (slug === 'daybook' && Array.isArray(data)) {
      return (
        <View style={[styles.metricGrid, isDesktop && styles.metricGridDesktop]}>
          <MetricTile label={t('shop.reportsPage.stat.entries')} value={String(filteredRecords.length)} />
          <MetricTile label={t('shop.reportsPage.stat.grossValue')} value={money(filteredTotals.total)} />
          <MetricTile label={t('shop.reportsPage.stat.settledAmount')} value={money(filteredTotals.settled)} />
          <MetricTile
            label={t('shop.reportsPage.stat.outstanding')}
            value={money(Math.max(filteredTotals.total - filteredTotals.settled, 0))}
          />
        </View>
      );
    }

    if (slug === 'gstr1' && Array.isArray(data)) {
      const b2b = filteredRecords.filter((record) => record.type === 'B2B').length;
      return (
        <View style={[styles.metricGrid, isDesktop && styles.metricGridDesktop]}>
          <MetricTile label={t('shop.reportsPage.stat.invoices')} value={String(filteredRecords.length)} />
          <MetricTile label={t('shop.reportsPage.stat.b2bInvoices')} value={String(b2b)} />
          <MetricTile label={t('shop.reportsPage.metrics.taxable_value')} value={money(filteredTotals.taxable)} />
          <MetricTile label={t('shop.reportsPage.stat.invoiceValue')} value={money(filteredTotals.total)} />
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
            <MetricTile label={t('shop.reportsPage.gstr3b.outwardTaxable')} value={money(data.outward_taxable_supplies)} wide />
            <MetricTile label={t('opsApp.shop.reports.inwardSupplies')} value={money(data.inward_supplies)} wide />
          </View>
          <Breakdown title={t('shop.reportsPage.gstr3b.outputTax')} data={outputTax} money={money} />
          <Breakdown title={t('opsApp.shop.reports.eligibleItc')} data={inputTax} money={money} accent="success" />
          <View style={styles.payableCard}>
            <View style={styles.payableHeader}>
              <View style={styles.payableIcon}>
                <Feather name="dollar-sign" size={20} color={colors.warning} />
              </View>
              <View>
                <Text style={styles.payableTitle}>{t('shop.reportsPage.gstr3b.netTaxPayable')}</Text>
                <Text style={styles.payableHint}>{t('opsApp.shop.reports.payableHint')}</Text>
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
              <Text style={styles.heroLabel}>{profit >= 0 ? t('shop.reportsPage.pnl.netProfit') : t('opsApp.shop.reports.netLoss')}</Text>
              <Text style={[styles.heroValue, profit >= 0 ? styles.successText : styles.dangerText]} numberOfLines={1} adjustsFontSizeToFit>
                {money(Math.abs(profit))}
              </Text>
              <Text style={styles.heroMeta}>{periodLabel}</Text>
            </View>
          </View>
          <View style={[styles.pnlGrid, isDesktop && styles.pnlGridDesktop]}>
            <Breakdown title={t('shop.reportsPage.pnl.income')} data={income} money={money} accent="success" />
            <Breakdown title={t('shop.reportsPage.pnl.expenses')} data={expenses} money={money} accent="danger" />
          </View>
        </>
      );
    }

    return <EmptyReport message={t('opsApp.shop.reports.noReportData')} />;
  }

  function renderRecords() {
    if (data == null || (loading && !records.length)) return null;

    const visible = filteredRecords.slice(0, visibleCount);
    const hasVoid = records.some((record) => record.status === 'void');

    return (
      <View style={styles.recordsSection}>
        <View style={styles.recordsHeader}>
          <View style={styles.recordsHeadingCopy}>
            <Text style={styles.recordsTitle}>{t('shop.reportsPage.allRecords')}</Text>
            <Text style={styles.recordsMeta}>
              {t('shop.reportsPage.recordsCount', { shown: filteredRecords.length, total: records.length })}
              {slug === 'gstr3b' || slug === 'pnl' ? '' : ` · ${money(filteredTotal)}`}
              {activeFilterCount ? ` · ${t('shop.reportsPage.filtersApplied', { count: activeFilterCount })}` : ''}
            </Text>
          </View>
        </View>

        <SearchBar value={search} onChangeText={setSearch} placeholder={t('shop.reportsPage.searchPlaceholder')} />

        {hasVoid ? (
          <Text style={styles.recordsNote}>{t('shop.reportsPage.voidNote')}</Text>
        ) : null}

        <GroupedList>
          {visible.map((record) => (
            <RecordCard
              key={record.key}
              record={record}
              money={money}
              onPress={record.id ? () => setBooksInvoiceId(record.id) : undefined}
              onView={
                record.id && record.docKind && businessId
                  ? () => viewDocument(record)
                  : undefined
              }
              onShare={
                record.id && record.docKind && businessId
                  ? () => openDocActions(record)
                  : undefined
              }
            />
          ))}
        </GroupedList>

        {filteredRecords.length > visible.length ? (
          <Pressable style={styles.moreBtn} onPress={() => setVisibleCount((count) => count + 20)}>
            <Text style={styles.moreText}>
              {t('shop.reportsPage.showMore', { count: Math.min(20, filteredRecords.length - visible.length) })}
            </Text>
            <Feather name="chevron-down" size={16} color={colors.primary} />
          </Pressable>
        ) : null}

        {!filteredRecords.length ? (
          <EmptyReport
            message={
              records.length
                ? t('shop.reportsPage.noMatch')
                : t('shop.reportsPage.noVouchers')
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
            <Text style={styles.subtitle}>{t('opsApp.shop.reports.subtitle')}</Text>
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
                <Text style={[styles.reportTabText, active && styles.reportTabTextActive]}>{t(`shop.reportsPage.tabs.${option.value}`)}</Text>
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
            <PresetChip label={t('shop.reportsPage.presetMonth')} onPress={() => setPreset('month')} />
            <PresetChip label={t('shop.reportsPage.presetQuarter')} onPress={() => setPreset('quarter')} />
            <PresetChip label={t('shop.reportsPage.presetYear')} onPress={() => setPreset('year')} />
            <PresetChip label={t('shop.reportsPage.presetAll')} onPress={() => setPreset('all')} />
          </ScrollView>

          <View style={[styles.dateGrid, isDesktop && styles.dateGridDesktop]}>
            <View style={styles.dateField}><DateField label={t('opsApp.shop.reports.fromDate')} value={dateFrom} onChange={setDateFrom} /></View>
            <View style={styles.dateField}><DateField label={t('opsApp.shop.reports.toDate')} value={dateTo} onChange={setDateTo} /></View>
          </View>
          {invalidRange ? <Text style={styles.error}>{t('shop.reportsPage.rangeInvalid')}</Text> : null}

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
                <Text style={styles.runBtnText}>{t('opsApp.shop.reports.viewReport')}</Text>
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
              {loading ? <Text style={styles.updating}>{t('shop.reportsPage.updating')}</Text> : null}
              <Pressable
                style={[styles.filterToggle, filtersOpen && styles.filterToggleActive]}
                onPress={() => setFiltersOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('opsApp.shop.reports.openFilters')}
              >
                <Feather
                  name="sliders"
                  size={15}
                  color={filtersOpen ? colors.primaryForeground : colors.primary}
                />
                <Text style={[styles.filterToggleText, filtersOpen && styles.filterToggleTextActive]}>
                  {activeFilterCount
                    ? t('shop.reportsPage.filtersCount', { count: activeFilterCount })
                    : t('shop.reportsPage.filters')}
                </Text>
              </Pressable>
              <Pressable
                style={styles.shareBtn}
                onPress={() => void shareCsv()}
                accessibilityRole="button"
                accessibilityLabel={t('opsApp.shop.reports.shareCsv')}
              >
                <Feather name="share-2" size={15} color={colors.primary} />
                <Text style={styles.shareBtnText}>{t('opsApp.shop.reports.shareCsv')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {error && data != null ? <Text style={styles.error}>{error}</Text> : null}
        {renderReport()}
        {renderRecords()}
      </RefreshableScrollView>

      <FilterSheet
        visible={filtersOpen}
        title={t('shop.reportsPage.recordFilters')}
        onClose={() => setFiltersOpen(false)}
        onApply={() => setFiltersOpen(false)}
        onReset={resetFilters}
      >
        {showSourceFilter ? (
          <FilterChoiceGroup
            label={t('shop.reportsPage.filterSource')}
            value={sourceFilter}
            options={saleSourceOptions(t)}
            onChange={setSourceFilter}
          />
        ) : null}

        {typeOptions.length > 1 ? (
          <FilterChoiceGroup
            label={t('shop.reportsPage.filterType')}
            value={typeFilter}
            options={[{ value: 'all', label: t('shop.reportsPage.allTypes') }, ...typeOptions]}
            onChange={setTypeFilter}
          />
        ) : null}

        {statusOptions.length > 1 ? (
          <FilterChoiceGroup
            label={t('common.status')}
            value={statusFilter}
            options={[{ value: 'all', label: t('shop.reportsPage.allStatuses') }, ...statusOptions]}
            onChange={setStatusFilter}
          />
        ) : null}

        {showPaymentFilter ? (
          <FilterChoiceGroup
            label={t('shop.reportsPage.filterPayment')}
            value={paymentFilter}
            options={[
              { value: 'all', label: t('shop.reportsPage.any') },
              { value: 'paid', label: t('shop.reportsPage.paid') },
              { value: 'partial', label: t('shop.reportsPage.partlyPaid') },
              { value: 'unpaid', label: t('shop.reportsPage.unpaid') },
            ]}
            onChange={setPaymentFilter}
          />
        ) : null}

        <FilterChoiceGroup
          label={t('shop.reportsPage.sortBy')}
          value={sort}
          options={sortOptions(t)}
          onChange={(value) => setSort(value as SortKey)}
        />
      </FilterSheet>

      <BooksInvoiceDrawer
        voucherId={booksInvoiceId}
        visible={Boolean(booksInvoiceId)}
        onClose={() => setBooksInvoiceId(null)}
      />

      <DocumentActionsSheet
        visible={Boolean(docActions)}
        onClose={() => setDocActions(null)}
        target={docActions}
        title={
          docActions
            ? documentTitle(String(docActions.kind), t, docActions.number)
            : t('shop.reportsPage.document')
        }
      />
    </DesktopPage>
  );
}

function RecordCard({
  record,
  money,
  onPress,
  onView,
  onShare,
}: {
  record: ReportRecord;
  money: (value: unknown) => string;
  onPress?: () => void;
  onView?: () => void;
  onShare?: () => void;
}) {
  const { t } = useTranslation();
  const isVoid = record.status === 'void';
  const payment = paymentState(record);
  const balance = record.paid == null ? 0 : Math.max(record.total - record.paid, 0);
  const hasGst = hasGstDetail(record);

  const body = (
    <>
      <View style={styles.entryTop}>
        <View style={styles.entryIdentity}>
          <View style={styles.invoiceTitleRow}>
            <Text style={[styles.entryNumber, isVoid && styles.strikeText]}>{record.number}</Text>
            {record.saleSource ? (
              <View
                style={[
                  styles.sourceBadge,
                  record.saleSource === 'pos' && styles.sourceBadgePos,
                  record.saleSource === 'online' && styles.sourceBadgeOnline,
                  record.saleSource === 'booking' && styles.sourceBadgeBooking,
                ]}
              >
                <Text
                  style={[
                    styles.sourceBadgeText,
                    record.saleSource === 'pos' && styles.sourceBadgeTextPos,
                    record.saleSource === 'online' && styles.sourceBadgeTextOnline,
                    record.saleSource === 'booking' && styles.sourceBadgeTextBooking,
                  ]}
                >
                  {saleSourceLabel(t, record.saleSource)}
                </Text>
              </View>
            ) : null}
            <View style={[styles.typeBadge, record.type === 'B2B' && styles.b2bBadge]}>
              <Text style={[styles.typeBadgeText, record.type === 'B2B' && styles.b2bBadgeText]}>
                {record.typeLabel}
              </Text>
            </View>
          </View>
          <Text style={styles.entryDate}>{formatDate(record.date, record.createdAt)}</Text>
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
              {payment === 'paid'
                ? t('shop.reportsPage.paid')
                : payment === 'partial'
                  ? t('shop.vouchers.dueAmount', { amount: money(balance) })
                  : t('shop.reportsPage.unpaid')}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.entryBottom}>
        <Text style={styles.entryParty} numberOfLines={1}>
          {record.party}
        </Text>
        <View style={[styles.statusDot, isVoid && styles.statusDotVoid]} />
        <Text style={[styles.statusText, isVoid && styles.dangerText]}>{labelFor(record.status || 'posted', t)}</Text>
        {onPress ? <Feather name="chevron-right" size={16} color={colors.mutedForeground} /> : null}
      </View>

      {record.type === 'sale' ||
      record.type === 'credit_note' ||
      record.type === 'B2B' ||
      record.type === 'B2C' ||
      record.pointsEarned > 0 ||
      record.pointsRedeemed > 0 ||
      record.grossProfit != null ? (
        <SaleInsightChips
          source={{
            points_earned: record.pointsEarned,
            points_redeemed: record.pointsRedeemed,
            gross_profit: record.grossProfit,
            hideProfit: record.saleSource === 'booking',
          }}
          hideWhenEmpty
        />
      ) : null}

      {hasGst ? (
        <>
          <View style={styles.gstMetaRow}>
            <Text style={styles.gstMeta}>
              {t('opsApp.shop.reports.gstinLine', {
                value: record.gstin || t('opsApp.shop.reports.unregistered'),
              })}
            </Text>
            <Text style={styles.gstMeta}>
              {t('opsApp.shop.reports.taxableLine', { amount: money(record.taxable) })}
            </Text>
          </View>
          <View style={styles.taxRow}>
            <Text style={styles.taxText}>{t('shop.reportsPage.metrics.cgst')} {money(record.cgst)}</Text>
            <Text style={styles.taxText}>{t('shop.reportsPage.metrics.sgst')} {money(record.sgst)}</Text>
            <Text style={styles.taxText}>{t('shop.reportsPage.metrics.igst')} {money(record.igst)}</Text>
            {record.placeOfSupply ? <Text style={styles.taxText}>
                {t('opsApp.shop.reports.posLine', { value: record.placeOfSupply })}
              </Text> : null}
          </View>
        </>
      ) : null}
    </>
  );

  return (
    <View style={[styles.entryCard, isVoid && styles.entryCardVoid]}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={t('opsApp.shop.reports.openAria', { number: record.number })}
          style={styles.entryMain}
        >
          {body}
        </Pressable>
      ) : (
        <View style={styles.entryMain}>{body}</View>
      )}

      {onView || onShare ? (
        <View style={styles.entryActions}>
          {onView ? (
            <Pressable
              style={styles.entryActionBtn}
              onPress={onView}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('shop.reportsPage.table.viewAria', { number: record.number })}
            >
              <Feather name="eye" size={14} color={colors.primary} />
              <Text style={styles.entryActionText}>{t('shop.reportsPage.table.view')}</Text>
            </Pressable>
          ) : null}
          {onShare ? (
            <Pressable
              style={styles.entryActionBtn}
              onPress={onShare}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('shop.reportsPage.table.shareAria', { number: record.number })}
            >
              <Feather name="share-2" size={14} color={colors.primary} />
              <Text style={styles.entryActionText}>{t('shop.reportsPage.table.share')}</Text>
            </Pressable>
          ) : null}
        </View>
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
  const { t } = useTranslation();
  return (
    <View style={styles.stateCard}>
      <View style={styles.stateIcon}>
        <Feather name="inbox" size={22} color={colors.mutedForeground} />
      </View>
      <Text style={styles.stateTitle}>{t('opsApp.shop.reports.nothingToShow')}</Text>
      <Text style={styles.stateText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  entryCard: {
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  entryCardVoid: { backgroundColor: colors.background },
  entryMain: { gap: spacing.sm },
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
  sourceBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: '#E2E8F0' },
  sourceBadgeText: { ...typography.tiny, fontFamily: fonts.bodySemi, color: '#475569' },
  sourceBadgePos: { backgroundColor: '#E0F2FE' },
  sourceBadgeTextPos: { color: '#0369A1' },
  sourceBadgeOnline: { backgroundColor: '#EDE9FE' },
  sourceBadgeTextOnline: { color: '#6D28D9' },
  sourceBadgeBooking: { backgroundColor: '#FEF3C7' },
  sourceBadgeTextBooking: { color: '#B45309' },
  entryParty: { ...typography.caption, color: colors.foreground, flex: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  statusDotVoid: { backgroundColor: colors.destructive },
  statusText: { ...typography.tiny, color: colors.success, textTransform: 'capitalize' },
  entryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  entryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  entryActionText: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.primary },
  invoiceTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
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
