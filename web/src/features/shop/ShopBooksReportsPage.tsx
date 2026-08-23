import React, { useMemo, useState } from 'react';
import type { ShopBooksReportSlug } from '@ie-platform/sdk';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { formatMoney } from '../../lib/currency';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useShopBooksReport } from './shopHooks';

const REPORT_TABS: Array<{ slug: ShopBooksReportSlug; label: string; description: string }> = [
  { slug: 'sales', label: 'Sales', description: 'GST sales summary for the period' },
  { slug: 'purchase', label: 'Purchase', description: 'GST purchase summary for the period' },
  { slug: 'daybook', label: 'Daybook', description: 'Every voucher, chronologically' },
  { slug: 'gstr1', label: 'GSTR-1', description: 'Outward supplies for GST return filing' },
  { slug: 'gstr3b', label: 'GSTR-3B', description: 'Summary GST return' },
  { slug: 'pnl', label: 'P&L', description: 'Profit and loss for the period' },
];

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

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export function ShopBooksReportsPage() {
  const workspace = useWorkspace();
  const currency = workspace.activeBusiness?.currency;
  const [slug, setSlug] = useState<ShopBooksReportSlug>('sales');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const report = useShopBooksReport(slug, { date_from: dateFrom || undefined, date_to: dateTo || undefined });
  const data = report.data;
  const invalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const activeReport = REPORT_TABS.find((item) => item.slug === slug);
  const periodLabel = dateFrom || dateTo ? `${dateFrom || 'Beginning'} – ${dateTo || 'Today'}` : 'All time';

  const exportRows = useMemo<Array<Record<string, unknown>>>(() => {
    if (Array.isArray(data)) return data.filter(isRecord);
    if (isRecord(data)) {
      return Object.entries(data).map<Record<string, unknown>>(([metric, value]) => ({
        metric: metric.replace(/_/g, ' '),
        value: isRecord(value) ? JSON.stringify(value) : value,
      }));
    }
    return [];
  }, [data]);

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
    if (!exportRows.length) return;
    const columns = Array.from(new Set(exportRows.flatMap((row) => Object.keys(row))));
    const csv = [
      columns.map(csvCell).join(','),
      ...exportRows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug}-${dateFrom || 'all'}-${dateTo || 'today'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
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
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="button" variant="neutral" onClick={() => void report.refetch()} disabled={report.isFetching || invalidRange}>
              <RefreshCw size={15} aria-hidden="true" /> {report.isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button type="button" variant="neutral" onClick={downloadCsv} disabled={!exportRows.length || invalidRange}>
              <Download size={15} aria-hidden="true" /> Export CSV
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
            <TabButton key={item.slug} active={slug === item.slug} onClick={() => setSlug(item.slug)}>
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
          <div style={{ display: 'grid', gap: 8 }}>
            {(data as Array<Record<string, unknown>>).map((row, index) => (
              <div key={String(row.id ?? index)} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid #f1f1f1', paddingBottom: 6, fontSize: 13 }}>
                <span>
                  {String(row.voucher_date ?? '')} · {String(row.voucher_number ?? '')} · {String(row.voucher_type ?? '')} · {String(row.party ?? 'Cash')}
                </span>
                <strong>{formatMoney(Number(row.total ?? 0), currency)}</strong>
              </div>
            ))}
            {!data.length ? <p>No entries for this period.</p> : null}
          </div>
        ) : null}

        {!report.isLoading && data && slug === 'gstr1' && Array.isArray(data) ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: 6 }}>Invoice</th>
                  <th style={{ padding: 6 }}>Date</th>
                  <th style={{ padding: 6 }}>Type</th>
                  <th style={{ padding: 6 }}>Customer</th>
                  <th style={{ padding: 6 }}>GSTIN</th>
                  <th style={{ padding: 6 }}>Place of supply</th>
                  <th style={{ padding: 6 }}>Taxable</th>
                  <th style={{ padding: 6 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(data as Array<Record<string, unknown>>).map((row, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f1f1f1' }}>
                    <td style={{ padding: 6 }}>{String(row.voucher_number ?? '')}</td>
                    <td style={{ padding: 6 }}>{String(row.voucher_date ?? '')}</td>
                    <td style={{ padding: 6 }}>{String(row.invoice_type ?? '')}</td>
                    <td style={{ padding: 6 }}>{String(row.customer_name ?? '')}</td>
                    <td style={{ padding: 6 }}>{String(row.customer_gstin ?? '—')}</td>
                    <td style={{ padding: 6 }}>{String(row.place_of_supply ?? '—')}</td>
                    <td style={{ padding: 6 }}>{formatMoney(Number(row.taxable_value ?? 0), currency)}</td>
                    <td style={{ padding: 6 }}>{formatMoney(Number(row.total ?? 0), currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.length ? <p>No B2B/B2C sales for this period.</p> : null}
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
    </div>
  );
}
