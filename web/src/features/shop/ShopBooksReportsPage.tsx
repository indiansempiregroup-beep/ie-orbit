import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ShopBooksReportSlug, ShopBooksVoucher } from '@ie-orbit/sdk';
import { Download, Eye, Printer, RefreshCw, Share2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Dialog } from '../../components/Dialog';
import { formatMoney } from '../../lib/currency';
import { useAuthContext } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApiClient } from '../../hooks/useApiClient';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { DocumentActionsSheet, type ShopDocTarget } from './DocumentActionsSheet';
import { openShopDocumentView } from './shopDocumentActions';
import { ShopFilterBar } from './ShopFilterBar';
import { useShopBooksReport } from './shopHooks';

const REPORT_TABS: Array<{ slug: ShopBooksReportSlug; label: string; description: string }> = [
  { slug: 'sales', label: 'Sales', description: 'GST sales summary for the period' },
  { slug: 'purchase', label: 'Purchase', description: 'GST purchase summary for the period' },
  { slug: 'daybook', label: 'Daybook', description: 'Every voucher, chronologically' },
  { slug: 'gstr1', label: 'GSTR-1', description: 'Outward supplies for GST return filing' },
  { slug: 'gstr3b', label: 'GSTR-3B', description: 'Summary GST return' },
  { slug: 'pnl', label: 'P&L', description: 'Profit and loss for the period' },
];

/** Voucher types that make up each report's underlying records. Undefined means every type. */
const RECORD_TYPES: Partial<Record<ShopBooksReportSlug, string[]>> = {
  sales: ['sale', 'credit_note'],
  purchase: ['purchase', 'debit_note'],
  gstr3b: ['sale', 'credit_note', 'purchase', 'debit_note'],
  pnl: ['sale', 'credit_note', 'other_income', 'purchase', 'debit_note', 'expense'],
};

const METRIC_LABELS: Record<string, string> = {
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

/** Invoice-style docs that support HTML view / PDF / share links. */
const DOCUMENT_KINDS = new Set(['sale', 'credit_note', 'debit_note']);

function docKindFor(voucherType: string): string | null {
  const kind = voucherType.toLowerCase();
  return DOCUMENT_KINDS.has(kind) ? kind : null;
}

function documentTitle(kind: string, number?: string) {
  const label = VOUCHER_TYPE_LABELS[kind] ?? 'Document';
  return number ? `${label} ${number}` : label;
}

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Highest amount' },
  { value: 'amount_asc', label: 'Lowest amount' },
];

const PAGE_SIZE = 25;

const STATUS_TONES: Record<string, { bg: string; text: string }> = {
  confirmed: { bg: '#dcfce7', text: '#166534' },
  posted: { bg: '#dcfce7', text: '#166534' },
  void: { bg: '#fee2e2', text: '#b42318' },
  draft: { bg: '#f3f4f6', text: '#374151' },
};

const PAYMENT_TONES: Record<'paid' | 'partial' | 'unpaid', string> = {
  paid: '#166534',
  partial: '#92400e',
  unpaid: '#b42318',
};

type ReportRecord = {
  key: string;
  id: string | null;
  number: string;
  date: string;
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
};

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: 10,
        border: '1px solid var(--border, #e5e7eb)',
        background: active ? 'var(--primary)' : 'var(--card, #fff)',
        color: active ? 'var(--primary-foreground)' : 'var(--foreground)',
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--border, #eee)' }}>
      <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function labelFor(key: string) {
  return METRIC_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Voucher dates are plain `YYYY-MM-DD`, so they are read as local days to avoid UTC drift. */
function formatVoucherDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || '—';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function toDaybookRecord(row: Record<string, unknown>, index: number): ReportRecord {
  const type = String(row.voucher_type ?? '').toLowerCase();
  const id = row.id == null || row.id === '' ? null : String(row.id);
  return {
    key: id ?? `${row.voucher_number ?? 'row'}-${index}`,
    id,
    number: String(row.voucher_number ?? '—'),
    date: String(row.voucher_date ?? ''),
    type,
    typeLabel: VOUCHER_TYPE_LABELS[type] ?? labelFor(type || 'entry'),
    docKind: docKindFor(type),
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

function toGstr1Record(row: Record<string, unknown>, index: number): ReportRecord {
  const invoiceType = String(row.invoice_type ?? 'B2C').toUpperCase();
  const voucherType = String(row.voucher_type ?? 'sale').toLowerCase();
  const id = row.id == null || row.id === '' ? null : String(row.id);
  return {
    key: id ?? `${String(row.voucher_number ?? 'invoice')}-${index}`,
    id,
    number: String(row.voucher_number ?? '—'),
    date: String(row.voucher_date ?? ''),
    type: invoiceType,
    typeLabel: invoiceType,
    docKind: docKindFor(voucherType),
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

/** Cash, transfer and payment vouchers carry no GST, so their tax columns stay empty. */
function hasGstDetail(record: ReportRecord) {
  if (record.taxable == null) return false;
  return record.taxable > 0 || (record.cgst ?? 0) + (record.sgst ?? 0) + (record.igst ?? 0) > 0;
}

function paymentState(record: ReportRecord): 'paid' | 'partial' | 'unpaid' | null {
  if (!['sale', 'purchase', 'credit_note', 'debit_note'].includes(record.type)) return null;
  if (record.paid == null || record.total <= 0) return null;
  if (record.paid >= record.total - 0.01) return 'paid';
  return record.paid > 0 ? 'partial' : 'unpaid';
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function flattenSummary(value: unknown, prefix = ''): Array<{ metric: string; value: unknown }> {
  if (value == null) return [];
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, nested]) =>
      flattenSummary(nested, prefix ? `${prefix} · ${labelFor(key)}` : labelFor(key)),
    );
  }
  if (Array.isArray(value)) return [{ metric: prefix || 'rows', value: value.length }];
  return [{ metric: prefix || 'value', value }];
}

function recordExportRow(record: ReportRecord) {
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
  summary: Array<{ metric: string; value: unknown }>;
  records: ReportRecord[];
  businessName?: string;
  businessGstin?: string;
  businessAddress?: string;
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
    ...input.summary.map((row) => [row.metric, row.value].map(csvCell).join(',')),
  );
  if (input.records.length) {
    const rows = input.records.map(recordExportRow);
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

export function ShopBooksReportsPage() {
  const workspace = useWorkspace();
  const auth = useAuthContext();
  const client = useApiClient();
  const snackbar = useSnackbar();
  const detailDialog = useDialog();
  const currency = workspace.activeBusiness?.currency;
  const businessId = workspace.businessId ?? '';
  const [slug, setSlug] = useState<ShopBooksReportSlug>('sales');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('date_desc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [caPackBusy, setCaPackBusy] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ReportRecord | null>(null);
  const [selectedVoucher, setSelectedVoucher] = useState<ShopBooksVoucher | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);

  const range = { date_from: dateFrom || undefined, date_to: dateTo || undefined };
  const report = useShopBooksReport(slug, range);
  const needsLedger = slug !== 'daybook' && slug !== 'gstr1';
  const ledger = useShopBooksReport('daybook', range, { enabled: needsLedger });
  const data = report.data;
  const invalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const activeReport = REPORT_TABS.find((item) => item.slug === slug);
  const periodLabel = dateFrom || dateTo ? `${dateFrom || 'Beginning'} – ${dateTo || 'Today'}` : 'All time';

  const rows = useMemo(() => (Array.isArray(data) ? data.filter(isRecord) : []), [data]);

  const records = useMemo<ReportRecord[]>(() => {
    if (slug === 'gstr1') return rows.map(toGstr1Record);
    if (slug === 'daybook') return rows.map(toDaybookRecord);
    if (!Array.isArray(ledger.data)) return [];
    const allowed = RECORD_TYPES[slug];
    const source = ledger.data.filter(isRecord).map(toDaybookRecord);
    return allowed ? source.filter((record) => allowed.includes(record.type)) : source;
  }, [slug, rows, ledger.data]);

  /** Daybook and GSTR-1 return plain row lists, so their headline figures are derived here. */
  const listTotals = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + num(row.total), 0);
    const settled = rows.reduce((sum, row) => sum + num(row.amount_paid), 0);
    return {
      total,
      settled,
      outstanding: Math.max(total - settled, 0),
      taxable: rows.reduce((sum, row) => sum + num(row.taxable_value), 0),
      b2b: rows.filter((row) => String(row.invoice_type ?? '') === 'B2B').length,
    };
  }, [rows]);

  const typeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    records.forEach((record) => seen.set(record.type, record.typeLabel));
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [records]);

  const statusOptions = useMemo(() => {
    const seen = new Set(records.map((record) => record.status).filter(Boolean));
    return Array.from(seen, (value) => ({ value, label: labelFor(value) }));
  }, [records]);

  const showPaymentFilter = useMemo(() => records.some((record) => paymentState(record) != null), [records]);

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = records.filter((record) => {
      if (typeFilter && record.type !== typeFilter) return false;
      if (statusFilter && record.status !== statusFilter) return false;
      if (paymentFilter && paymentState(record) !== paymentFilter) return false;
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

  const filteredTotals = useMemo(
    () =>
      filteredRecords.reduce(
        (acc, record) => {
          if (record.status === 'void') return acc;
          const adjustment =
            (slug === 'sales' && record.type === 'credit_note') ||
            (slug === 'purchase' && record.type === 'debit_note');
          const sign = adjustment ? -1 : 1;
          return {
            taxable: acc.taxable + (record.taxable ?? 0) * sign,
            gst:
              acc.gst +
              ((record.cgst ?? 0) + (record.sgst ?? 0) + (record.igst ?? 0)) * sign,
            total: acc.total + record.total * sign,
            due:
              acc.due +
              (record.paid == null ? 0 : Math.max(record.total - record.paid, 0)) * sign,
          };
        },
        { taxable: 0, gst: 0, total: 0, due: 0 },
      ),
    [filteredRecords, slug],
  );

  const activeFilterCount =
    (typeFilter ? 1 : 0) + (statusFilter ? 1 : 0) + (paymentFilter ? 1 : 0) + (search.trim() ? 1 : 0);

  const exportSummary = useMemo(
    () => flattenSummary(data).filter((row) => row.metric !== 'rows' || !records.length),
    [data, records.length],
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [slug, search, typeFilter, statusFilter, paymentFilter, sort]);

  function resetFilters() {
    setSearch('');
    setTypeFilter('');
    setStatusFilter('');
    setPaymentFilter('');
    setSort('date_desc');
  }

  const openRecord = useCallback(
    async (record: ReportRecord) => {
      if (!record.id || !client) return;
      setSelectedRecord(record);
      setSelectedVoucher(null);
      setDetailLoading(true);
      detailDialog.show();
      try {
        const response = await client.shop.getVoucher(record.id);
        setSelectedVoucher(response.data);
      } catch (error) {
        snackbar.push(getApiErrorMessage(error, 'Unable to open this record.'), 'error');
        detailDialog.hide();
        setSelectedRecord(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [client, detailDialog.hide, detailDialog.show, snackbar],
  );

  const openDocActions = useCallback(
    (record: ReportRecord, voucher?: ShopBooksVoucher | null) => {
      if (!businessId || !record.id || !record.docKind) return;
      setDocActions({
        kind: record.docKind,
        id: record.id,
        number: record.number,
        businessId,
        phone: voucher?.customer_phone || '',
        email: voucher?.customer_email || '',
      });
    },
    [businessId],
  );

  const viewDocument = useCallback(
    (record: ReportRecord) => {
      if (!businessId || !record.id || !record.docKind) return;
      void openShopDocumentView(
        {
          kind: record.docKind,
          id: record.id,
          number: record.number,
          businessId,
        },
        auth.token,
        'a4',
        workspace.tenantId,
      ).catch((error) =>
        snackbar.push(error instanceof Error ? error.message : 'View failed', 'error'),
      );
    },
    [auth.token, businessId, snackbar, workspace.tenantId],
  );

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

  function downloadCsv() {
    if (!data || invalidRange) return;
    const businessName =
      String(workspace.activeBusiness?.display_name || workspace.activeBusiness?.business_name || '').trim() ||
      'Business';
    const csv = buildReportCsv({
      report: activeReport?.label ?? slug,
      period: periodLabel,
      summary: exportSummary,
      records: filteredRecords,
      businessName,
      businessGstin: String(workspace.activeBusiness?.gst_tax_number || '').trim(),
      businessAddress: businessAddressLine(workspace.activeBusiness),
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    const biz = (
      workspace.activeBusiness?.business_code ||
      workspace.activeBusiness?.display_name ||
      businessName ||
      'business'
    )
      .toString()
      .replace(/[^\w.-]+/g, '_')
      .slice(0, 40);
    anchor.download = `${biz}_${slug}_${dateFrom || 'all'}_${dateTo || 'today'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function downloadCaPack() {
    if (invalidRange || !businessId) return;
    const packSlugs: ShopBooksReportSlug[] = ['gstr1', 'gstr3b', 'sales'];
    const businessName =
      String(workspace.activeBusiness?.display_name || workspace.activeBusiness?.business_name || '').trim() ||
      'Business';
    const businessGstin = String(workspace.activeBusiness?.gst_tax_number || '').trim();
    const businessAddress = businessAddressLine(workspace.activeBusiness);
    const biz = (
      workspace.activeBusiness?.business_code ||
      workspace.activeBusiness?.display_name ||
      businessName ||
      'business'
    )
      .toString()
      .replace(/[^\w.-]+/g, '_')
      .slice(0, 40);
    setCaPackBusy(true);
    try {
      for (const packSlug of packSlugs) {
        const response = await client.shop.booksReport(packSlug, {
          business_id: businessId,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          ...(packSlug === 'gstr1' ? { limit: 500, offset: 0 } : {}),
        });
        const payload = response.data;
        const tab = REPORT_TABS.find((item) => item.slug === packSlug);
        let summary: Array<{ metric: string; value: string }> = [];
        let records: ReportRecord[] = [];
        if (packSlug === 'gstr1' && Array.isArray(payload)) {
          const gstrRows = payload.filter(isRecord);
          records = gstrRows.map(toGstr1Record);
          const total = gstrRows.reduce((sum, row) => sum + num(row.total), 0);
          summary = [
            { metric: 'Invoices', value: String(gstrRows.length) },
            { metric: 'Taxable value', value: formatMoney(gstrRows.reduce((s, r) => s + num(r.taxable_value), 0), currency) },
            { metric: 'Grand total', value: formatMoney(total, currency) },
          ];
        } else if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          const record = payload as Record<string, unknown>;
          summary = Object.entries(METRIC_LABELS)
            .filter(([key]) => key in record)
            .map(([key, label]) => ({ metric: label, value: formatMoney(num(record[key]), currency) }));
        }
        const csv = buildReportCsv({
          report: tab?.label ?? packSlug,
          period: periodLabel,
          summary,
          records,
          businessName,
          businessGstin,
          businessAddress,
        });
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${biz}_${packSlug}_${dateFrom || 'all'}_${dateTo || 'today'}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
    } finally {
      setCaPackBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>Books reports</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 14 }}>
              Review performance, verify GST figures, and export filing-ready data.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="button" variant="neutral" onClick={() => void report.refetch()} disabled={report.isFetching || invalidRange}>
              <RefreshCw size={15} aria-hidden="true" /> {report.isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button type="button" variant="neutral" onClick={downloadCsv} disabled={!data || invalidRange}>
              <Download size={15} aria-hidden="true" /> CSV for CA
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => void downloadCaPack()}
              disabled={caPackBusy || invalidRange || !businessId}
            >
              <Download size={15} aria-hidden="true" /> {caPackBusy ? 'Preparing…' : 'CA pack (GSTR-1 · 3B · Sales)'}
            </Button>
            <Button type="button" variant="neutral" onClick={() => window.print()} disabled={!data}>
              <Printer size={15} aria-hidden="true" /> Print
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {REPORT_TABS.map((item) => (
            <TabButton
              key={item.slug}
              active={slug === item.slug}
              onClick={() => {
                setSlug(item.slug);
                resetFilters();
              }}
            >
              {item.label}
            </TabButton>
          ))}
        </div>
        <p style={{ color: 'var(--muted-foreground)', margin: '0 0 12px' }}>
          {activeReport?.description}
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <Button type="button" variant="neutral" onClick={() => setPreset('month')}>This month</Button>
          <Button type="button" variant="neutral" onClick={() => setPreset('quarter')}>This quarter</Button>
          <Button type="button" variant="neutral" onClick={() => setPreset('year')}>This financial year</Button>
          <Button type="button" variant="neutral" onClick={() => setPreset('all')}>All time</Button>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            From
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #e5e7eb' }} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            To
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #e5e7eb' }} />
          </label>
        </div>
        {invalidRange ? (
          <p role="alert" style={{ color: '#b91c1c', fontSize: 13, margin: '10px 0 0' }}>
            “From” date must be before or equal to “To” date.
          </p>
        ) : null}
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>{activeReport?.label}</h3>
            <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>{periodLabel}</span>
          </div>
          {report.isFetching && !report.isLoading ? <span style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Updating…</span> : null}
        </div>
        {report.isLoading ? <p role="status">Preparing report…</p> : null}
        {report.error ? <p role="alert">{(report.error as Error).message}</p> : null}

        {!report.isLoading && data && (slug === 'sales' || slug === 'purchase') && isRecord(data) ? (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
            <StatTile label="Vouchers" value={String(data.count ?? 0)} />
            <StatTile label="Taxable value" value={formatMoney(Number(data.taxable_value ?? 0), currency)} />
            <StatTile label="CGST" value={formatMoney(Number(data.cgst ?? 0), currency)} />
            <StatTile label="SGST" value={formatMoney(Number(data.sgst ?? 0), currency)} />
            <StatTile label="IGST" value={formatMoney(Number(data.igst ?? 0), currency)} />
            <StatTile label="Total" value={formatMoney(Number(data.total ?? 0), currency)} />
          </div>
        ) : null}

        {!report.isLoading && data && slug === 'daybook' && Array.isArray(data) ? (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
            <StatTile label="Entries" value={String(rows.length)} />
            <StatTile label="Gross value" value={formatMoney(listTotals.total, currency)} />
            <StatTile label="Settled amount" value={formatMoney(listTotals.settled, currency)} />
            <StatTile label="Outstanding" value={formatMoney(listTotals.outstanding, currency)} />
          </div>
        ) : null}

        {!report.isLoading && data && slug === 'gstr1' && Array.isArray(data) ? (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
            <StatTile label="Invoices" value={String(rows.length)} />
            <StatTile label="B2B invoices" value={String(listTotals.b2b)} />
            <StatTile label="Taxable value" value={formatMoney(listTotals.taxable, currency)} />
            <StatTile label="Invoice value" value={formatMoney(listTotals.total, currency)} />
          </div>
        ) : null}

        {!report.isLoading && data && slug === 'gstr3b' && isRecord(data) ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <h4 style={{ marginBottom: 8 }}>Outward taxable supplies</h4>
              <p style={{ margin: 0 }}>{formatMoney(Number(data.outward_taxable_supplies ?? 0), currency)}</p>
            </div>
            <div>
              <h4 style={{ marginBottom: 8 }}>Output tax</h4>
              {isRecord(data.output_tax) ? (
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))' }}>
                  {Object.entries(data.output_tax).map(([key, value]) => (
                    <StatTile key={key} label={key.toUpperCase()} value={formatMoney(Number(value ?? 0), currency)} />
                  ))}
                </div>
              ) : null}
            </div>
            <div>
              <h4 style={{ marginBottom: 8 }}>Inward supplies &amp; input tax credit</h4>
              <p style={{ margin: '0 0 8px' }}>Inward: {formatMoney(Number(data.inward_supplies ?? 0), currency)}</p>
              {isRecord(data.input_tax_credit) ? (
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))' }}>
                  {Object.entries(data.input_tax_credit).map(([key, value]) => (
                    <StatTile key={key} label={key.toUpperCase()} value={formatMoney(Number(value ?? 0), currency)} />
                  ))}
                </div>
              ) : null}
            </div>
            <div>
              <h4 style={{ marginBottom: 8 }}>Net tax payable</h4>
              {isRecord(data.net_tax_payable) ? (
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))' }}>
                  {Object.entries(data.net_tax_payable).map(([key, value]) => (
                    <StatTile key={key} label={key.toUpperCase()} value={formatMoney(Number(value ?? 0), currency)} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {!report.isLoading && data && slug === 'pnl' && isRecord(data) ? (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
            <div>
              <h4 style={{ marginBottom: 8 }}>Income</h4>
              {isRecord(data.income) ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  {Object.entries(data.income).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: key === 'total' ? 700 : 400 }}>
                      <span style={{ textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                      <span>{formatMoney(Number(value ?? 0), currency)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div>
              <h4 style={{ marginBottom: 8 }}>Expenses</h4>
              {isRecord(data.expenses) ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  {Object.entries(data.expenses).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: key === 'total' ? 700 : 400 }}>
                      <span style={{ textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                      <span>{formatMoney(Number(value ?? 0), currency)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #eee', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800 }}>
              <span>Net profit</span>
              <span>{formatMoney(Number(data.net_profit ?? 0), currency)}</span>
            </div>
          </div>
        ) : null}
      </Card>

      {!report.isLoading && data ? (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16 }}>All records</h3>
              <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
                {filteredRecords.length} of {records.length} records
                {slug === 'gstr3b' || slug === 'pnl'
                  ? ''
                  : ` · ${formatMoney(filteredTotals.total, currency)}`}
                {activeFilterCount ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} applied` : ''}
              </span>
            </div>
          </div>

          <ShopFilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search voucher number, party or GSTIN…"
            onClear={resetFilters}
            filters={[
              ...(typeOptions.length > 1
                ? [
                    {
                      id: 'type',
                      label: 'Type',
                      value: typeFilter,
                      onChange: setTypeFilter,
                      options: [{ value: '', label: 'All types' }, ...typeOptions],
                    },
                  ]
                : []),
              ...(statusOptions.length > 1
                ? [
                    {
                      id: 'status',
                      label: 'Status',
                      value: statusFilter,
                      onChange: setStatusFilter,
                      options: [{ value: '', label: 'All statuses' }, ...statusOptions],
                    },
                  ]
                : []),
              ...(showPaymentFilter
                ? [
                    {
                      id: 'payment',
                      label: 'Payment',
                      value: paymentFilter,
                      onChange: setPaymentFilter,
                      options: [
                        { value: '', label: 'Any' },
                        { value: 'paid', label: 'Paid' },
                        { value: 'partial', label: 'Partly paid' },
                        { value: 'unpaid', label: 'Unpaid' },
                      ],
                    },
                  ]
                : []),
              {
                id: 'sort',
                label: 'Sort by',
                value: sort,
                onChange: (value: string) => setSort(value as SortKey),
                options: SORT_OPTIONS,
              },
            ]}
          />

          {needsLedger && ledger.isLoading ? <p role="status">Loading underlying records…</p> : null}
          {needsLedger && ledger.error ? <p role="alert">{(ledger.error as Error).message}</p> : null}
          {records.some((record) => record.status === 'void') ? (
            <p style={{ color: 'var(--muted-foreground)', fontSize: 12, margin: '0 0 10px' }}>
              Void entries are listed here but excluded from report totals.
            </p>
          ) : null}

          {filteredRecords.length ? (
            <RecordTable
              records={filteredRecords}
              limit={visibleCount}
              totals={filteredTotals}
              currency={currency}
              onOpenRecord={(record) => void openRecord(record)}
              onView={viewDocument}
              onShare={(record) => openDocActions(record)}
            />
          ) : (
            <p>{records.length ? 'No records match the current filters.' : 'No vouchers were posted in this period.'}</p>
          )}

          {filteredRecords.length > visibleCount ? (
            <div style={{ marginTop: 12 }}>
              <Button type="button" variant="neutral" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                Show {Math.min(PAGE_SIZE, filteredRecords.length - visibleCount)} more
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Dialog
        open={detailDialog.open}
        onClose={() => {
          detailDialog.hide();
          setSelectedRecord(null);
          setSelectedVoucher(null);
        }}
        title={selectedRecord ? selectedRecord.number : 'Voucher'}
        labelledBy="report-record-detail-dialog"
        busy={detailLoading}
      >
        {selectedRecord ? (
          <div style={{ display: 'grid', gap: 14, marginTop: 12, minWidth: 320 }}>
            <div style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>
              {formatVoucherDate(selectedRecord.date)} · {selectedRecord.typeLabel} ·{' '}
              {selectedVoucher?.customer_name ||
                selectedVoucher?.supplier_name ||
                selectedVoucher?.cash_account_name ||
                selectedRecord.party}
            </div>
            {detailLoading ? (
              <p role="status">Loading record…</p>
            ) : (
              <>
                <div style={{ display: 'grid', gap: 6 }}>
                  {((selectedVoucher?.line_items as Array<Record<string, unknown>> | undefined) ?? []).map(
                    (line, index) => (
                      <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>
                          {String(line.name || line.product_name || `Item ${index + 1}`)}
                          {line.qty != null || line.quantity != null
                            ? ` × ${line.qty ?? line.quantity}`
                            : ''}
                        </span>
                        <strong>{formatMoney(Number(line.total ?? 0), currency)}</strong>
                      </div>
                    ),
                  )}
                  {selectedVoucher && !selectedVoucher.line_items?.length ? (
                    <p style={{ margin: 0 }}>No line items.</p>
                  ) : null}
                </div>
                <div style={{ display: 'grid', gap: 4, borderTop: '1px solid #eee', paddingTop: 10, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Subtotal</span>
                    <span>{formatMoney(Number(selectedVoucher?.subtotal ?? 0), currency)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Tax</span>
                    <span>{formatMoney(Number(selectedVoucher?.tax_total ?? 0), currency)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>Total</span>
                    <span>{formatMoney(Number(selectedVoucher?.total ?? selectedRecord.total), currency)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Amount paid</span>
                    <span>{formatMoney(Number(selectedVoucher?.amount_paid ?? 0), currency)}</span>
                  </div>
                </div>
                {selectedVoucher?.notes ? (
                  <p style={{ margin: 0, fontSize: 13 }}>Notes: {selectedVoucher.notes}</p>
                ) : null}
              </>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {selectedRecord.docKind && businessId ? (
                <Button
                  type="button"
                  onClick={() => openDocActions(selectedRecord, selectedVoucher)}
                >
                  View / Print / Share
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  detailDialog.hide();
                  setSelectedRecord(null);
                  setSelectedVoucher(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <DocumentActionsSheet
        open={Boolean(docActions)}
        onClose={() => setDocActions(null)}
        target={docActions}
        title={docActions ? documentTitle(String(docActions.kind), docActions.number) : 'Document'}
      />
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? STATUS_TONES.draft;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 999,
        background: tone.bg,
        color: tone.text,
        textTransform: 'capitalize',
        whiteSpace: 'nowrap',
      }}
    >
      {status || 'posted'}
    </span>
  );
}

function RecordTable({
  records,
  limit,
  totals,
  currency,
  onOpenRecord,
  onView,
  onShare,
}: {
  records: ReportRecord[];
  limit: number;
  totals: { taxable: number; gst: number; total: number; due: number };
  currency?: string | null;
  onOpenRecord: (record: ReportRecord) => void;
  onView: (record: ReportRecord) => void;
  onShare: (record: ReportRecord) => void;
}) {
  /** Column visibility is derived from the whole filtered set so paging never shifts columns. */
  const showStatus = records.some((record) => record.status);
  const showGst = records.some(hasGstDetail);
  const showGstin = records.some((record) => record.gstin);
  const showPos = records.some((record) => record.placeOfSupply);
  const showPayment = records.some((record) => paymentState(record) != null);
  const showActions = records.some((record) => Boolean(record.id && record.docKind));
  const visible = records.slice(0, limit);
  const cell: React.CSSProperties = { padding: '8px 6px', verticalAlign: 'top' };
  const numeric: React.CSSProperties = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' };
  const actionCell: React.CSSProperties = { ...cell, whiteSpace: 'nowrap' };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
            <th style={cell}>Date</th>
            <th style={cell}>Voucher</th>
            <th style={cell}>Type</th>
            <th style={cell}>Party</th>
            {showGstin ? <th style={cell}>GSTIN</th> : null}
            {showPos ? <th style={cell}>Place of supply</th> : null}
            {showStatus ? <th style={cell}>Status</th> : null}
            {showGst ? <th style={numeric}>Taxable</th> : null}
            {showGst ? <th style={numeric}>GST</th> : null}
            <th style={numeric}>Total</th>
            {showPayment ? <th style={numeric}>Due</th> : null}
            {showActions ? <th style={actionCell}>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {visible.map((record) => {
            const isVoid = record.status === 'void';
            const payment = paymentState(record);
            const due = record.paid == null ? 0 : Math.max(record.total - record.paid, 0);
            const gst = (record.cgst ?? 0) + (record.sgst ?? 0) + (record.igst ?? 0);
            const canOpen = Boolean(record.id);
            const canShare = Boolean(record.id && record.docKind);
            return (
              <tr
                key={record.key}
                onClick={canOpen ? () => onOpenRecord(record) : undefined}
                onKeyDown={
                  canOpen
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onOpenRecord(record);
                        }
                      }
                    : undefined
                }
                tabIndex={canOpen ? 0 : undefined}
                role={canOpen ? 'button' : undefined}
                style={{
                  borderBottom: '1px solid #f1f1f1',
                  color: isVoid ? 'var(--muted-foreground)' : undefined,
                  cursor: canOpen ? 'pointer' : undefined,
                }}
              >
                <td style={{ ...cell, whiteSpace: 'nowrap' }}>{formatVoucherDate(record.date)}</td>
                <td style={{ ...cell, fontWeight: 600, textDecoration: isVoid ? 'line-through' : undefined }}>
                  {record.number}
                </td>
                <td style={cell}>{record.typeLabel}</td>
                <td style={cell}>{record.party}</td>
                {showGstin ? <td style={cell}>{record.gstin || '—'}</td> : null}
                {showPos ? <td style={cell}>{record.placeOfSupply || '—'}</td> : null}
                {showStatus ? (
                  <td style={cell}>
                    <StatusPill status={record.status} />
                  </td>
                ) : null}
                {showGst ? <td style={numeric}>{record.taxable == null ? '—' : formatMoney(record.taxable, currency)}</td> : null}
                {showGst ? <td style={numeric}>{gst ? formatMoney(gst, currency) : '—'}</td> : null}
                <td style={{ ...numeric, fontWeight: 700, textDecoration: isVoid ? 'line-through' : undefined }}>
                  {formatMoney(record.total, currency)}
                </td>
                {showPayment ? (
                  <td style={{ ...numeric, color: payment ? PAYMENT_TONES[payment] : undefined }}>
                    {payment === 'paid' ? 'Paid' : payment ? formatMoney(due, currency) : '—'}
                  </td>
                ) : null}
                {showActions ? (
                  <td style={actionCell} onClick={(event) => event.stopPropagation()}>
                    {canShare ? (
                      <div style={{ display: 'inline-flex', gap: 8 }}>
                        <button
                          type="button"
                          title="View invoice"
                          aria-label={`View ${record.number}`}
                          onClick={() => onView(record)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            border: '1px solid var(--border, #e5e7eb)',
                            background: 'var(--card, #fff)',
                            borderRadius: 8,
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--primary)',
                          }}
                        >
                          <Eye size={14} aria-hidden="true" />
                          View
                        </button>
                        <button
                          type="button"
                          title="Share invoice"
                          aria-label={`Share ${record.number}`}
                          onClick={() => onShare(record)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            border: '1px solid var(--border, #e5e7eb)',
                            background: 'var(--card, #fff)',
                            borderRadius: 8,
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--primary)',
                          }}
                        >
                          <Share2 size={14} aria-hidden="true" />
                          Share
                        </button>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '1px solid var(--border, #e5e7eb)', fontWeight: 700 }}>
            <td style={cell} colSpan={4 + (showGstin ? 1 : 0) + (showPos ? 1 : 0) + (showStatus ? 1 : 0)}>
              Filtered totals · {records.length} record{records.length === 1 ? '' : 's'}
            </td>
            {showGst ? <td style={numeric}>{formatMoney(totals.taxable, currency)}</td> : null}
            {showGst ? <td style={numeric}>{formatMoney(totals.gst, currency)}</td> : null}
            <td style={numeric}>{formatMoney(totals.total, currency)}</td>
            {showPayment ? <td style={numeric}>{formatMoney(totals.due, currency)}</td> : null}
            {showActions ? <td style={actionCell} /> : null}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
