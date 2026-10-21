import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatMoney } from '../../lib/currency';
import { MetricTile } from '../bi/components/MetricTile';
import { TablePagination } from '../bi/components/TablePagination';
import { BooksInvoiceDrawer } from './BooksInvoiceDrawer';

const LOYALTY_ROW_HELP = {
  points:
    'Reward points on this sale or booking. Green (+) means you gave points; amber (−) means the customer used points to pay less.',
  profit:
    'What you kept from this shop sale after stock cost and discounts (including reward points used). Not shown for bookings.',
} as const;

export function ShopLoyaltyReportPage() {
  const client = useApiClient();
  const { activeBusiness } = useWorkspace();
  const businessId = activeBusiness?.id || '';
  const currency = activeBusiness?.currency || 'INR';
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [direction, setDirection] = useState<'all' | 'given' | 'used'>('all');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [booksInvoiceId, setBooksInvoiceId] = useState<string | null>(null);

  const report = useQuery({
    queryKey: ['customer-loyalty-report', businessId, dateFrom, dateTo, direction, search, offset, pageSize],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.customers.loyaltyReport({
        business: businessId,
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
        direction: direction === 'all' ? undefined : direction,
        q: search || undefined,
        limit: pageSize,
        offset,
      });
      return response.data;
    },
  });

  const summary = report.data?.summary;
  const ledger = report.data?.ledger ?? [];
  const ledgerTotal = report.data?.ledger_total ?? summary?.entry_count ?? 0;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Reward points activity</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 14 }}>
            Points given and used — click a shop invoice or booking to open it, or a books sale to preview the invoice.
          </p>
        </div>
        <Link to="/customers">
          <Button type="button" variant="neutral">
            Customers
          </Button>
        </Link>
      </div>

      <Card>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setOffset(0);
              }}
              style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            To
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setOffset(0);
              }}
              style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            Show
            <select
              value={direction}
              onChange={(event) => {
                setDirection(event.target.value as 'all' | 'given' | 'used');
                setOffset(0);
              }}
              style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
            >
              <option value="all">All</option>
              <option value="given">Given only</option>
              <option value="used">Used only</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13, flex: '1 1 180px' }}>
            Search
            <input
              type="search"
              value={q}
              placeholder="Customer or reason"
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setSearch(q.trim());
                  setOffset(0);
                }
              }}
              style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
            />
          </label>
          <Button
            type="button"
            variant="neutral"
            onClick={() => {
              setSearch(q.trim());
              setOffset(0);
              void report.refetch();
            }}
          >
            Apply
          </Button>
        </div>
        {report.data && !report.data.enabled ? (
          <p style={{ margin: '12px 0 0', color: '#b45309', fontSize: 13 }}>
            Reward points program is off for this business. Turn it on in product settings.
          </p>
        ) : null}
      </Card>

      {report.isLoading ? <p>Loading…</p> : null}
      {report.error ? <p role="alert">{(report.error as Error).message}</p> : null}

      {summary ? (
        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))',
          }}
        >
          {[
            ['Points given', summary.points_earned],
            ['Points used', summary.points_redeemed],
            ['Net', summary.net_points],
            ['Entries', summary.entry_count],
            [
              'Money given as rewards',
              formatMoney(Number(summary.redeem_discount_total || 0), currency),
            ],
          ].map(([label, value]) => (
            <Card key={String(label)}>
              <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{value}</div>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <h3 style={{ marginTop: 0 }}>Ledger</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['When', 'Customer', 'What happened', 'Linked record', 'Points / profit'].map((label) => (
                  <th
                    key={label}
                    style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => {
                const sourceLabel = String(row.source_label || '').trim();
                const isOnlineOrder =
                  sourceLabel === 'Online order' || sourceLabel.startsWith('Online order');
                const invoiceVoucherId = String(row.invoice_voucher_id || row.voucher_id || '').trim();
                const onlineOrderId = String(row.linked_order_id || row.order_id || '').trim();
                const onlineHref =
                  isOnlineOrder && onlineOrderId ? `/shop/orders/${onlineOrderId}` : null;
                const bookingFallbackHref =
                  !invoiceVoucherId && row.record_kind === 'booking' && row.booking_id
                    ? `/bookings/${row.booking_id}`
                    : null;
                const recordText =
                  row.record_kind === 'order'
                    ? `${sourceLabel || 'Shop invoice'} ${row.order_number || row.record_label || ''}`.trim()
                    : row.record_kind === 'booking'
                      ? `Booking ${row.booking_number || row.record_label || ''}`.trim()
                      : row.record_kind === 'voucher'
                        ? row.voucher_type === 'purchase'
                          ? `Books purchase ${row.voucher_number || ''}`.trim()
                          : `${sourceLabel || 'Books sale'} ${row.voucher_number || ''}`.trim()
                        : '';
                const openInvoice = Boolean(invoiceVoucherId) && !(isOnlineOrder && onlineOrderId);
                const isBooking = row.record_kind === 'booking' || sourceLabel === 'Booking';
                const isReversal =
                  row.direction === 'reversed' || row.entry_type === 'earn_reversal';
                const earned =
                  Number(row.record_points_earned) ||
                  (!isReversal && row.points_delta > 0 ? row.points_delta : 0);
                const reversedPts = Math.max(
                  0,
                  Number(row.record_points_reversed) || (isReversal ? Math.abs(row.points_delta) : 0),
                );
                const redeemedPts =
                  Number(row.record_points_redeemed) ||
                  (!isReversal && row.points_delta < 0 ? Math.abs(row.points_delta) : 0);
                const bothPoints = earned > 0 && redeemedPts > 0;
                const profitAmount =
                  !isBooking && row.gross_profit != null && row.gross_profit !== ''
                    ? Number(row.gross_profit)
                    : null;
                const profitPositive = profitAmount != null && profitAmount >= 0;
                const pointsTone =
                  reversedPts > 0 && !earned && !redeemedPts
                    ? 'negative'
                    : bothPoints || (earned > 0 && reversedPts > 0)
                      ? 'neutral'
                      : redeemedPts > 0 && earned <= 0
                        ? 'warning'
                        : 'positive';
                return (
                  <tr key={row.id}>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                      {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                      {row.customer_id ? (
                        <Link to={`/customers/${row.customer_id}`}>{row.customer_name || 'Customer'}</Link>
                      ) : (
                        row.customer_name || '—'
                      )}
                    </td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                      {isReversal
                        ? row.reason || 'Points reversed'
                        : bothPoints
                          ? 'Points given and used'
                          : row.reason || row.entry_type || '—'}
                    </td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                      {onlineHref && recordText ? (
                        <Link to={onlineHref}>{recordText}</Link>
                      ) : openInvoice && recordText ? (
                        <button
                          type="button"
                          onClick={() => setBooksInvoiceId(invoiceVoucherId)}
                          style={{
                            border: 'none',
                            background: 'none',
                            padding: 0,
                            color: 'var(--primary, #0f766e)',
                            cursor: 'pointer',
                            font: 'inherit',
                            textDecoration: 'underline',
                          }}
                        >
                          {recordText}
                        </button>
                      ) : bookingFallbackHref && recordText ? (
                        <Link to={bookingFallbackHref}>{recordText}</Link>
                      ) : recordText ? (
                        recordText
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                          alignItems: 'center',
                        }}
                      >
                        <MetricTile
                          label="Points"
                          icon="gift"
                          tone={pointsTone}
                          help={LOYALTY_ROW_HELP.points}
                          title={LOYALTY_ROW_HELP.points}
                          value={
                            <>
                              {earned > 0 ? <span style={{ color: '#047857' }}>+{earned}</span> : null}
                              {earned > 0 && (redeemedPts > 0 || reversedPts > 0) ? (
                                <span style={{ color: 'var(--muted-foreground)' }}> · </span>
                              ) : null}
                              {redeemedPts > 0 ? (
                                <span style={{ color: '#b45309' }}>−{redeemedPts}</span>
                              ) : null}
                              {redeemedPts > 0 && reversedPts > 0 ? (
                                <span style={{ color: 'var(--muted-foreground)' }}> · </span>
                              ) : null}
                              {reversedPts > 0 ? (
                                <span style={{ color: '#be123c' }}>−{reversedPts} rev</span>
                              ) : null}
                              {!earned && !redeemedPts && !reversedPts ? '—' : null}
                            </>
                          }
                        />
                        {profitAmount != null ? (
                          <MetricTile
                            label="Profit"
                            icon="trending-up"
                            tone={profitPositive ? 'positive' : 'negative'}
                            help={LOYALTY_ROW_HELP.profit}
                            title={LOYALTY_ROW_HELP.profit}
                            value={formatMoney(profitAmount, currency)}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!ledger.length ? (
                <tr>
                  <td colSpan={5} style={{ padding: 12, color: 'var(--muted-foreground)' }}>
                    No loyalty ledger entries match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <TablePagination
          total={ledgerTotal}
          offset={offset}
          pageSize={pageSize}
          label="entries"
          onPageChange={setOffset}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setOffset(0);
          }}
        />
      </Card>

      <BooksInvoiceDrawer
        voucherId={booksInvoiceId}
        open={Boolean(booksInvoiceId)}
        onClose={() => setBooksInvoiceId(null)}
      />
    </div>
  );
}
