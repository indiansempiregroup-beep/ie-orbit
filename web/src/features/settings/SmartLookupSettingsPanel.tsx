import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Wallet } from 'lucide-react';
import type { ShopSmartLookupLedgerEntry } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useApiClient } from '../../hooks/useApiClient';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { getApiErrorMessage } from '../../lib/apiClient';
import { SmartLookupUpiPaySheet } from './SmartLookupUpiPaySheet';
import { enrichLedgerSourceLabel } from '../shop/enrichMessages';

const FALLBACK_TOP_UP_OPTIONS_PAISE = [5000, 10000, 25000, 50000];

type HistoryKind = 'money' | 'all' | 'credits' | 'debits';

function formatLedgerAmount(row: ShopSmartLookupLedgerEntry) {
  const paise = row.charged_paise ?? 0;
  if (paise > 0) return `−₹${(paise / 100).toFixed(2)}`;
  if (paise < 0) return `+₹${(Math.abs(paise) / 100).toFixed(2)}`;
  return 'Free';
}

function ledgerLabel(row: ShopSmartLookupLedgerEntry) {
  if (row.entry_type === 'credit' || row.source === 'wallet_top_up') return 'Wallet top-up';
  if (row.entry_type === 'debit' || row.charged_paise > 0) {
    return row.code ? `Smart fill · ${row.code}` : 'Smart fill';
  }
  return enrichLedgerSourceLabel(row.source);
}

export function SmartLookupSettingsPanel() {
  const client = useApiClient();
  const snackbar = useSnackbar();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.businessId ?? '';
  const shopieSub = (workspace.activeBusiness?.product_subscriptions ?? []).find(
    (row) => row.product_code === 'shopie',
  );
  const hasShopie = Boolean(
    shopieSub && ['trialing', 'active', 'past_due', 'soft_locked'].includes(shopieSub.status),
  );
  const [topUpPaise, setTopUpPaise] = useState<number | null>(null);
  const [customRupees, setCustomRupees] = useState('');
  const [historyKind, setHistoryKind] = useState<HistoryKind>('money');
  const [historyPage, setHistoryPage] = useState(1);
  const [historySource, setHistorySource] = useState('');
  const [historyQ, setHistoryQ] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyWindow, setHistoryWindow] = useState<number | ''>(30);

  const dashboardQuery = useQuery({
    queryKey: ['shop-smart-lookup', businessId],
    enabled: Boolean(businessId && hasShopie),
    queryFn: async () => {
      const response = await client.shop.getSmartLookup({ business_id: businessId });
      return response.data;
    },
  });

  const historyQuery = useQuery({
    queryKey: [
      'shop-smart-lookup-history',
      businessId,
      historyKind,
      historyPage,
      historySource,
      historyQ,
      historyDateFrom,
      historyDateTo,
      historyWindow,
    ],
    enabled: Boolean(businessId && hasShopie),
    queryFn: async () => {
      const response = await client.shop.getSmartLookupHistory({
        business_id: businessId,
        kind: historyKind,
        page: historyPage,
        page_size: 25,
        source: historySource || undefined,
        q: historyQ.trim() || undefined,
        date_from: historyDateFrom || undefined,
        date_to: historyDateTo || undefined,
        window_days: historyDateFrom || historyDateTo ? undefined : historyWindow === '' ? undefined : historyWindow,
      });
      return response.data;
    },
  });

  const update = useMutation({
    mutationFn: async (body: { enabled?: boolean }) => {
      const response = await client.shop.updateSmartLookup({ business_id: businessId, ...body });
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shop-smart-lookup', businessId] });
      void queryClient.invalidateQueries({ queryKey: ['shop-smart-lookup-history', businessId] });
    },
  });

  if (!businessId) return null;

  const data = dashboardQuery.data;
  const history = historyQuery.data;
  const platformOk = data?.platform_enabled !== false;
  const planOk = data?.plan_enabled !== false;
  const enabled = Boolean(data?.business_enabled ?? data?.smart_lookup_enabled);
  const balance = data?.balance_inr ?? 0;
  const lowBalance = enabled && platformOk && planOk && balance < 1;
  const canConfigure = hasShopie && shopieSub?.status !== 'soft_locked' && platformOk && planOk;
  const topUpOptions =
    data?.platform?.suggested_top_up_paise?.length
      ? data.platform.suggested_top_up_paise
      : FALLBACK_TOP_UP_OPTIONS_PAISE;

  function openCustomTopUp() {
    const rupees = Number(customRupees);
    if (!Number.isFinite(rupees) || rupees < 1) {
      snackbar.push('Enter at least ₹1.', 'error');
      return;
    }
    if (rupees > 100_000) {
      snackbar.push('Maximum top-up is ₹1,00,000.', 'error');
      return;
    }
    setTopUpPaise(Math.round(rupees * 100));
  }

  function setKind(next: HistoryKind) {
    setHistoryKind(next);
    setHistoryPage(1);
  }

  function clearHistoryFilters() {
    setHistorySource('');
    setHistoryQ('');
    setHistoryDateFrom('');
    setHistoryDateTo('');
    setHistoryWindow(30);
    setHistoryPage(1);
  }

  const hasHistoryFilters = Boolean(
    historySource || historyQ.trim() || historyDateFrom || historyDateTo || historyWindow !== 30,
  );

  return (
    <>
      <Card>
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div
              aria-hidden
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                display: 'grid',
                placeItems: 'center',
                background: enabled ? 'linear-gradient(145deg, #ecfdf5, #d1fae5)' : '#f3f4f6',
                color: enabled ? '#047857' : '#6b7280',
                flexShrink: 0,
              }}
            >
              <Sparkles size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Smart product lookup</h2>
              <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14, lineHeight: 1.45 }}>
                Free lookups use Open*Facts and the shared barcode catalog. When those miss, Smart lookup
                reads a pack photo with AI and debits your prepaid wallet at actual Gemini cost (~₹0.03 per
                unknown barcode) — no markup packs.
              </p>
            </div>
          </div>

          {!hasShopie ? (
            <div
              role="status"
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                color: '#9a3412',
                fontSize: 13,
              }}
            >
              Start or renew a <strong>ShopIE / Orbit Mart</strong> subscription on this page (above) to enable Smart
              lookup and the prepaid wallet.
            </div>
          ) : null}

          {hasShopie && !platformOk ? (
            <div
              role="status"
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                fontSize: 13,
              }}
            >
              Smart lookup is disabled by the platform. Contact IE support if you need pack-photo fill.
            </div>
          ) : null}

          {hasShopie && platformOk && !planOk ? (
            <div
              role="status"
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                color: '#9a3412',
                fontSize: 13,
              }}
            >
              Smart product lookup is not on your current plan. Ask your platform admin to enable it on the package
              Features tab, or upgrade to a plan that includes it.
            </div>
          ) : null}

          {hasShopie && shopieSub?.status === 'soft_locked' ? (
            <div
              role="status"
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                fontSize: 13,
              }}
            >
              ShopIE is soft-locked. Renew above before changing Smart lookup or topping up the wallet.
            </div>
          ) : null}

          <label
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              background: '#fafafa',
              cursor: !canConfigure || update.isPending || dashboardQuery.isLoading ? 'not-allowed' : 'pointer',
              opacity: canConfigure ? 1 : 0.6,
            }}
          >
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canConfigure || update.isPending || dashboardQuery.isLoading}
              onChange={(event) => {
                void update
                  .mutateAsync({ enabled: event.target.checked })
                  .then(() =>
                    snackbar.push(
                      event.target.checked ? 'Smart lookup enabled.' : 'Smart lookup disabled.',
                      'success',
                    ),
                  )
                  .catch((error) =>
                    snackbar.push(getApiErrorMessage(error, 'Unable to update smart lookup.'), 'error'),
                  );
              }}
            />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Enable pack-photo auto-fill</span>
          </label>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 10,
            }}
          >
            {[
              { label: 'Wallet', value: hasShopie ? `₹${balance.toFixed(2)}` : '—', icon: true },
              { label: 'Free this month', value: hasShopie ? String(data?.month.free_lookups ?? 0) : '—' },
              { label: 'Paid lookups', value: hasShopie ? String(data?.month.paid_lookups ?? 0) : '—' },
              { label: 'Spent', value: hasShopie ? `₹${(data?.month.spent_inr ?? 0).toFixed(2)}` : '—' },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                }}
              >
                <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {stat.icon ? <Wallet size={12} aria-hidden /> : null}
                  {stat.label}
                </div>
                <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {lowBalance ? (
            <div
              role="status"
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                color: '#9a3412',
                fontSize: 13,
              }}
            >
              Wallet is low. Top up below so pack-photo fills can continue.
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Top up with UPI</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {topUpOptions.map((paise) => (
                <Button
                  key={paise}
                  type="button"
                  variant="neutral"
                  disabled={!canConfigure}
                  onClick={() => setTopUpPaise(paise)}
                >
                  ₹{(paise / 100).toFixed(0)}
                </Button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={customRupees}
                onChange={(event) => setCustomRupees(event.target.value)}
                placeholder="Custom ₹"
                inputMode="decimal"
                disabled={!canConfigure}
                style={{
                  width: 120,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                }}
              />
              <Button
                type="button"
                variant="neutral"
                onClick={openCustomTopUp}
                disabled={!canConfigure || !customRupees.trim()}
              >
                Pay
              </Button>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>
              Pay → submit UTR/screenshot → IE confirms → wallet credits. Same claim flow as subscriptions.
            </p>
          </div>

          {hasShopie ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>Wallet history</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(
                    [
                      ['money', 'Money'],
                      ['credits', 'Credits'],
                      ['debits', 'Debits'],
                      ['all', 'All'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setKind(value)}
                      style={{
                        border: '1px solid #e5e7eb',
                        background: historyKind === value ? '#111827' : '#fff',
                        color: historyKind === value ? '#fff' : '#374151',
                        borderRadius: 999,
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 8,
                }}
              >
                <input
                  value={historyQ}
                  onChange={(event) => {
                    setHistoryPage(1);
                    setHistoryQ(event.target.value);
                  }}
                  placeholder="Search barcode or text"
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #e5e7eb' }}
                />
                <select
                  value={historySource}
                  onChange={(event) => {
                    setHistoryPage(1);
                    setHistorySource(event.target.value);
                  }}
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #e5e7eb' }}
                >
                  <option value="">All sources</option>
                  {(history?.sources ?? ['wallet_top_up', 'gemini_vision']).map((source) => (
                    <option key={source} value={source}>
                      {enrichLedgerSourceLabel(source)}
                    </option>
                  ))}
                </select>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6b7280' }}>
                  From
                  <input
                    type="date"
                    value={historyDateFrom}
                    onChange={(event) => {
                      setHistoryPage(1);
                      setHistoryDateFrom(event.target.value);
                    }}
                    style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #e5e7eb' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6b7280' }}>
                  To
                  <input
                    type="date"
                    value={historyDateTo}
                    onChange={(event) => {
                      setHistoryPage(1);
                      setHistoryDateTo(event.target.value);
                    }}
                    style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #e5e7eb' }}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {(
                  [
                    [7, '7d'],
                    [30, '30d'],
                    [90, '90d'],
                    ['', 'All time'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => {
                      setHistoryPage(1);
                      setHistoryDateFrom('');
                      setHistoryDateTo('');
                      setHistoryWindow(value);
                    }}
                    style={{
                      border: '1px solid #e5e7eb',
                      background:
                        historyWindow === value && !historyDateFrom && !historyDateTo ? '#111827' : '#fff',
                      color: historyWindow === value && !historyDateFrom && !historyDateTo ? '#fff' : '#374151',
                      borderRadius: 999,
                      padding: '4px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
                {hasHistoryFilters ? (
                  <button
                    type="button"
                    onClick={clearHistoryFilters}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#6b7280',
                      fontSize: 12,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>

              {history?.summary ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: 8,
                  }}
                >
                  <div style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff' }}>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Credits</div>
                    <div style={{ fontWeight: 700 }}>₹{history.summary.credits_inr.toFixed(2)}</div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff' }}>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Debits</div>
                    <div style={{ fontWeight: 700 }}>₹{history.summary.debits_inr.toFixed(2)}</div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff' }}>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Net</div>
                    <div style={{ fontWeight: 700 }}>₹{history.summary.net_inr.toFixed(2)}</div>
                  </div>
                </div>
              ) : null}

              {historyQuery.isLoading ? (
                <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>Loading history…</p>
              ) : history?.items?.length ? (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                          <th style={{ padding: 8 }}>When</th>
                          <th style={{ padding: 8 }}>Entry</th>
                          <th style={{ padding: 8 }}>Amount</th>
                          <th style={{ padding: 8 }}>Balance after</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.items.map((row) => (
                          <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                              {new Date(row.created_at).toLocaleString()}
                            </td>
                            <td style={{ padding: 8 }}>{ledgerLabel(row)}</td>
                            <td
                              style={{
                                padding: 8,
                                color:
                                  row.charged_paise > 0
                                    ? '#b91c1c'
                                    : row.charged_paise < 0
                                      ? '#047857'
                                      : '#6b7280',
                                fontWeight: 600,
                              }}
                            >
                              {formatLedgerAmount(row)}
                            </td>
                            <td style={{ padding: 8 }}>
                              {row.balance_after_paise == null
                                ? '—'
                                : `₹${(Number(row.balance_after_paise) / 100).toFixed(2)}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>
                      Page {history.page} of {history.total_pages ?? 1} · {history.total} entr
                      {history.total === 1 ? 'y' : 'ies'}
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        type="button"
                        variant="neutral"
                        disabled={historyPage <= 1 || historyQuery.isFetching}
                        onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="neutral"
                        disabled={!history.has_more || historyQuery.isFetching}
                        onClick={() => setHistoryPage((page) => page + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>
                  No matching wallet movements. Top-ups and paid Smart fills will appear here.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </Card>

      {topUpPaise != null ? (
        <SmartLookupUpiPaySheet
          amountPaise={topUpPaise}
          onClose={() => setTopUpPaise(null)}
          onClaimed={async () => {
            snackbar.push('Top-up submitted. Wallet credits after IE confirms payment.', 'success');
            void queryClient.invalidateQueries({ queryKey: ['shop-smart-lookup', businessId] });
            void queryClient.invalidateQueries({ queryKey: ['shop-smart-lookup-history', businessId] });
          }}
          onError={(message) => snackbar.push(message, 'error')}
        />
      ) : null}
    </>
  );
}
