import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { PlatformPaymentRow } from '@ie-orbit/sdk';
import { Banknote, CheckCircle2, CircleX, Copy, Inbox, RefreshCw } from 'lucide-react';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatTimestamp } from '../../lib/datetime';
import { resolveBillingProofUrl } from '../../lib/mediaUrl';
import {
  filterBillingOrders,
  ORDER_RANGE_FILTERS,
  ORDER_STATUS_FILTERS,
  orderHistoryCounts,
  orderStatusLabel,
  type OrderHistoryRange,
  type OrderHistoryStatusFilter,
} from '../settings/subscriptionUx';
import {
  AdminDrawer,
  AdminEmpty,
  AdminField,
  AdminKpi,
  AdminListRow,
  AdminPage,
  AdminPageHeader,
  AdminSearch,
  AdminSection,
  AdminStatus,
  AdminTable,
  paymentOrderLabel,
  productLabel,
} from './AdminChrome';
import { ProofImage } from '../../components/ProofImage';
import { useInvalidatePlatform, usePlatformUpiClaimsQuery } from './adminHooks';

function formatInr(paise?: number | null) {
  return `₹${Math.round((paise ?? 0) / 100).toLocaleString('en-IN')}`;
}

function orderNumber(payment: PlatformPaymentRow) {
  return payment.order_number || payment.id.slice(0, 8).toUpperCase();
}

function productsFor(payment: PlatformPaymentRow) {
  const codes = payment.product_codes?.length
    ? payment.product_codes
    : payment.line_items?.map((item) => item.product_code) ?? [payment.product_code];
  return (codes.filter(Boolean) as string[]).map((code) => productLabel(code)).join(' + ');
}

function intentLabel(intent?: string | null) {
  if (intent === 'renew') return 'Renewal';
  if (intent === 'subscribe') return 'New subscription';
  if (intent === 'assistant_top_up' || intent === 'smart_lookup_top_up') return 'Wallet top-up';
  if (!intent) return null;
  return intent.replace(/[_-]+/g, ' ');
}

function addonSummary(payment: PlatformPaymentRow) {
  const parts: string[] = [];
  for (const item of payment.line_items ?? []) {
    if (item.extra_staff) parts.push(`+${item.extra_staff} staff`);
    if (item.extra_offices) parts.push(`+${item.extra_offices} offices`);
    if (item.pets_pack_enabled) parts.push('Pets pack');
  }
  return parts.join(' · ');
}

function waitingLabel(iso?: string | null) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  if (ms < 45_000) return 'Just now';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function matchesQuery(payment: PlatformPaymentRow, needle: string) {
  if (!needle) return true;
  return [
    payment.order_number,
    payment.id,
    payment.upi_utr,
    payment.tenant_name,
    payment.tenant_slug,
    payment.business_name,
    payment.plan_code,
    payment.note,
    payment.claim_intent,
    paymentOrderLabel(payment),
    productsFor(payment),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

function ClaimReview({
  payment,
  interactive,
  reason,
  onReasonChange,
  busy,
  pendingAction,
  onRequestAction,
  onCancelAction,
  onConfirmAction,
  onOpenProof,
}: {
  payment: PlatformPaymentRow;
  interactive: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  busy: string | null;
  pendingAction: 'confirm' | 'reject' | null;
  onRequestAction: (action: 'confirm' | 'reject') => void;
  onCancelAction: () => void;
  onConfirmAction: () => void;
  onOpenProof: (url: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const proofUrl = resolveBillingProofUrl(payment);
  const addons = addonSummary(payment);
  const intent = intentLabel(payment.claim_intent);
  const submitted = payment.claimed_at || payment.created_at;
  const resolved = payment.resolved_at || payment.paid_at;
  const working = Boolean(busy);

  async function copyUtr() {
    const utr = payment.upi_utr?.trim();
    if (!utr) return;
    try {
      await navigator.clipboard.writeText(utr);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="admin-claim-review">
      <div className="admin-claim-review__hero">
        <div>
          <p className="admin-claim-review__amount">{formatInr(payment.amount_paise)}</p>
          <p className="admin-claim-review__products">{paymentOrderLabel(payment)}</p>
          <div className="admin-tag-row" style={{ marginTop: 10 }}>
            <AdminStatus status={orderStatusLabel(payment.payment_status, payment.status)} />
            {intent ? <span className="admin-tag">{intent}</span> : null}
            <span className="admin-tag">#{orderNumber(payment)}</span>
          </div>
        </div>
        {proofUrl ? (
          <button type="button" className="admin-claim-proof" onClick={() => onOpenProof(proofUrl)}>
            <img src={proofUrl} alt="Payment screenshot" />
            <span>View full screenshot</span>
          </button>
        ) : (
          <div className="admin-claim-proof-empty">No screenshot</div>
        )}
      </div>

      <div className="admin-utr">
        <span>
          <strong>UTR</strong> {payment.upi_utr || 'Not provided'}
        </span>
        {payment.upi_utr ? (
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => void copyUtr()}>
            <Copy size={14} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        ) : null}
      </div>

      {interactive ? (
        <div className="admin-claim-review__decide">
          <AdminField label="Reason (audit log and owner email)">
            <input
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Why are you confirming or rejecting this?"
            />
          </AdminField>

          {pendingAction ? (
            <div className={`admin-confirm-card admin-confirm-card--${pendingAction === 'reject' ? 'danger' : 'good'}`}>
              <strong>{pendingAction === 'reject' ? 'Reject this claim?' : 'Confirm this payment?'}</strong>
              <p>
                {pendingAction === 'reject'
                  ? `${payment.tenant_name || 'This workspace'} stays locked until they pay again. The owner is emailed.`
                  : `Mark ${formatInr(payment.amount_paise)} paid for ${payment.tenant_name || 'this workspace'}. This activates the plan and emails the owner.`}
              </p>
              <div className="admin-action-bar" style={{ marginTop: 0 }}>
                <button type="button" className="admin-btn admin-btn--ghost" disabled={working} onClick={onCancelAction}>
                  Back
                </button>
                <button
                  type="button"
                  className={`admin-btn ${pendingAction === 'reject' ? 'admin-btn--danger' : 'admin-btn--primary'}`}
                  disabled={working || !reason.trim() || !payment.tenant_id}
                  onClick={onConfirmAction}
                >
                  {working
                    ? pendingAction === 'reject'
                      ? 'Rejecting…'
                      : 'Confirming…'
                    : pendingAction === 'reject'
                      ? 'Reject claim'
                      : 'Confirm paid'}
                </button>
              </div>
            </div>
          ) : (
            <div className="admin-action-bar" style={{ marginTop: 0 }}>
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                disabled={working || !payment.tenant_id}
                onClick={() => onRequestAction('reject')}
              >
                Reject
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={working || !payment.tenant_id}
                onClick={() => onRequestAction('confirm')}
              >
                Confirm paid
              </button>
            </div>
          )}
        </div>
      ) : null}

      <dl className="admin-detail-list admin-detail-list--columns">
        <div>
          <dt>Workspace</dt>
          <dd>
            {payment.tenant_id ? (
              <Link to={`/admin/tenants/${payment.tenant_id}`}>{payment.tenant_name || payment.tenant_slug}</Link>
            ) : (
              payment.tenant_name || '—'
            )}
          </dd>
        </div>
        <div>
          <dt>Business</dt>
          <dd>{payment.business_name || '—'}</dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>
            {waitingLabel(submitted)}
            <div className="admin-table__muted">{formatTimestamp(submitted)}</div>
          </dd>
        </div>
        <div>
          <dt>{resolved ? 'Resolved' : 'Invoice'}</dt>
          <dd>{resolved ? formatTimestamp(resolved) : payment.invoice_number || '—'}</dd>
        </div>
        {addons ? (
          <div className="admin-detail-list__wide">
            <dt>Add-ons</dt>
            <dd>{addons}</dd>
          </div>
        ) : null}
        {payment.note ? (
          <div className="admin-detail-list__wide">
            <dt>Note</dt>
            <dd>{payment.note}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function PlatformClaimsPage() {
  usePageMeta({ title: 'Claims — Platform Admin' });
  const client = useApiClient();
  const claimsQuery = usePlatformUpiClaimsQuery('pending');
  const historyQuery = usePlatformUpiClaimsQuery('history');
  const invalidate = useInvalidatePlatform();
  const [reason, setReason] = useState('Platform admin action');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(false);
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('claim');
  const claims = claimsQuery.data ?? [];
  const history = historyQuery.data ?? [];
  const [tab, setTab] = useState<'inbox' | 'history'>('inbox');
  const [inboxQuery, setInboxQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'confirm' | 'reject' | null>(null);
  const [historyQueryText, setHistoryQueryText] = useState('');
  const [historyStatus, setHistoryStatus] = useState<OrderHistoryStatusFilter>('all');
  const [historyRange, setHistoryRange] = useState<OrderHistoryRange>('all');
  const [historyProduct, setHistoryProduct] = useState('');
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const highlightApplied = useRef<string | null>(null);

  const inbox = useMemo(() => {
    const needle = inboxQuery.trim().toLowerCase();
    return claims.filter((payment) => matchesQuery(payment, needle));
  }, [claims, inboxQuery]);

  const filteredHistory = useMemo(
    () =>
      filterBillingOrders(history, {
        query: historyQueryText,
        status: historyStatus,
        range: historyRange,
        productCode: historyProduct,
        productName: productLabel,
      }),
    [history, historyQueryText, historyStatus, historyRange, historyProduct],
  );
  const historyCounts = useMemo(() => orderHistoryCounts(history), [history]);
  const historyFiltersActive = Boolean(
    historyQueryText.trim() || historyStatus !== 'all' || historyRange !== 'all' || historyProduct,
  );
  const totalPaise = claims.reduce((sum, row) => sum + (row.amount_paise || 0), 0);
  const oldestClaim = claims
    .map((row) => row.claimed_at || row.created_at)
    .filter(Boolean)
    .sort()[0];
  const selected = inbox.find((row) => row.id === selectedId) ?? claims.find((row) => row.id === selectedId) ?? null;
  const inspected =
    history.find((row) => row.id === inspectedId) ?? claims.find((row) => row.id === inspectedId) ?? null;

  useEffect(() => {
    if (highlightId && highlightApplied.current !== highlightId) {
      if (claims.some((row) => row.id === highlightId)) {
        highlightApplied.current = highlightId;
        setTab('inbox');
        setSelectedId(highlightId);
        return;
      }
      if (history.some((row) => row.id === highlightId)) {
        highlightApplied.current = highlightId;
        setTab('history');
        setInspectedId(highlightId);
        return;
      }
      if (claimsQuery.isLoading || historyQuery.isLoading) return;
    }

    if (selectedId && inbox.some((row) => row.id === selectedId)) return;
    setSelectedId(inbox[0]?.id ?? null);
    setPendingAction(null);
  }, [highlightId, claims, history, inbox, selectedId, claimsQuery.isLoading, historyQuery.isLoading]);

  async function refresh() {
    await Promise.all([claimsQuery.refetch(), historyQuery.refetch()]);
  }

  async function act(label: string, tenantId: string, paymentId: string, action: 'confirm' | 'reject') {
    setBusy(`${action}:${paymentId}`);
    setMessage(null);
    try {
      await client.platform.confirmTenantUpiClaim(tenantId, paymentId, { action, reason });
      setMessageOk(true);
      setMessage(`${label} succeeded — the owner was emailed.`);
      setPendingAction(null);
      setInspectedId(null);
      invalidate();
      await Promise.all([claimsQuery.refetch(), historyQuery.refetch()]);
    } catch (err) {
      setMessageOk(false);
      setMessage(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  function clearHistoryFilters() {
    setHistoryQueryText('');
    setHistoryStatus('all');
    setHistoryRange('all');
    setHistoryProduct('');
  }

  return (
    <AdminPage>
      <AdminPageHeader
        title="Claims"
        description="Review UPI screenshots and UTRs, then confirm to activate a plan or reject with a reason. Owners are emailed either way."
        actions={
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            disabled={claimsQuery.isFetching || historyQuery.isFetching}
            onClick={() => void refresh()}
          >
            <RefreshCw size={16} />
            {claimsQuery.isFetching || historyQuery.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      <div className="admin-kpi-grid">
        <AdminKpi
          label="Awaiting"
          value={claimsQuery.isLoading ? '…' : claims.length}
          hint={claims.length ? `Oldest ${waitingLabel(oldestClaim)}` : 'Queue is clear'}
          tone={claims.length ? 'warn' : 'good'}
          icon={<Inbox size={16} />}
        />
        <AdminKpi
          label="Inbox amount"
          value={claimsQuery.isLoading ? '…' : formatInr(totalPaise)}
          hint="Across pending claims"
          icon={<Banknote size={16} />}
        />
        <AdminKpi
          label="Confirmed"
          value={historyQuery.isLoading ? '…' : historyCounts.paid}
          hint="Paid in history"
          tone="good"
          icon={<CheckCircle2 size={16} />}
        />
        <AdminKpi
          label="Rejected"
          value={historyQuery.isLoading ? '…' : historyCounts.rejected}
          hint="Declined claims"
          tone={historyCounts.rejected ? 'danger' : 'default'}
          icon={<CircleX size={16} />}
        />
      </div>

      <div className="admin-editor-tabs" role="tablist" aria-label="Claims views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'inbox'}
          className={`admin-editor-tab${tab === 'inbox' ? ' is-active' : ''}`}
          onClick={() => setTab('inbox')}
        >
          Inbox
          {claims.length ? <span className="admin-tab-badge">{claims.length}</span> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={`admin-editor-tab${tab === 'history' ? ' is-active' : ''}`}
          onClick={() => setTab('history')}
        >
          History
        </button>
      </div>

      {message ? (
        <p className={`admin-message ${messageOk ? 'admin-message--ok' : 'admin-message--error'}`} style={{ margin: 0 }}>
          {message}
        </p>
      ) : null}

      {tab === 'inbox' ? (
        <div className="admin-split admin-split--review">
          <AdminSection
            title="Inbox"
            description={
              claimsQuery.isLoading
                ? 'Loading pending payments…'
                : inboxQuery.trim()
                  ? `${inbox.length} of ${claims.length} waiting`
                  : `${claims.length} waiting for review`
            }
            actions={<AdminSearch value={inboxQuery} onChange={setInboxQuery} placeholder="Search tenant, UTR, or order #" />}
          >
            {claimsQuery.isLoading ? (
              <AdminEmpty>Loading claims…</AdminEmpty>
            ) : claimsQuery.isError ? (
              <p className="admin-message admin-message--error">
                {claimsQuery.error instanceof Error ? claimsQuery.error.message : 'Could not load claims.'}
              </p>
            ) : claims.length === 0 ? (
              <AdminEmpty title="No pending claims">Confirmed and rejected orders stay in History.</AdminEmpty>
            ) : inbox.length === 0 ? (
              <AdminEmpty
                title="No claims match this search"
                action={
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setInboxQuery('')}>
                    Clear search
                  </button>
                }
              >
                Try another tenant, UTR, or order number.
              </AdminEmpty>
            ) : (
              <div className="admin-inbox-list">
                {inbox.map((payment) => (
                  <AdminListRow
                    key={payment.id}
                    selected={selected?.id === payment.id}
                    title={`${formatInr(payment.amount_paise)} · ${payment.tenant_name || 'Workspace'}`}
                    meta={`#${orderNumber(payment)} · ${paymentOrderLabel(payment)} · UTR ${payment.upi_utr || '—'} · ${waitingLabel(payment.claimed_at || payment.created_at)}`}
                    trailing={<AdminStatus status="awaiting confirmation" />}
                    onClick={() => {
                      setSelectedId(payment.id);
                      setPendingAction(null);
                      setMessage(null);
                    }}
                  />
                ))}
              </div>
            )}
          </AdminSection>

          <AdminSection
            title={selected ? `Review #${orderNumber(selected)}` : 'Review'}
            description={selected ? `${selected.tenant_name || 'Workspace'} · ${waitingLabel(selected.claimed_at || selected.created_at)}` : 'Pick a claim from the inbox.'}
          >
            {selected ? (
              <ClaimReview
                payment={selected}
                interactive
                reason={reason}
                onReasonChange={setReason}
                busy={busy}
                pendingAction={pendingAction}
                onRequestAction={setPendingAction}
                onCancelAction={() => setPendingAction(null)}
                onConfirmAction={() => {
                  if (!selected.tenant_id || !pendingAction) return;
                  void act(
                    pendingAction === 'reject' ? 'Reject UPI claim' : 'Confirm UPI payment',
                    selected.tenant_id,
                    selected.id,
                    pendingAction,
                  );
                }}
                onOpenProof={setProofPreviewUrl}
              />
            ) : (
              <AdminEmpty>Select a pending claim to compare the UTR and screenshot, then confirm or reject.</AdminEmpty>
            )}
          </AdminSection>
        </div>
      ) : (
        <AdminSection
          title="Order history"
          description={
            historyQuery.isLoading
              ? 'Loading confirmed and rejected orders…'
              : `${filteredHistory.length} of ${history.length} orders`
          }
          actions={
            historyFiltersActive ? (
              <button type="button" className="admin-btn admin-btn--ghost" onClick={clearHistoryFilters}>
                Clear filters
              </button>
            ) : null
          }
        >
          <div className="admin-toolbar">
            <AdminSearch
              value={historyQueryText}
              onChange={setHistoryQueryText}
              placeholder="Search order #, UTR, tenant, or product"
            />
          </div>
          <div className="admin-filter-row">
            <AdminField label="Status">
              <select
                value={historyStatus}
                onChange={(event) => setHistoryStatus(event.target.value as OrderHistoryStatusFilter)}
              >
                {ORDER_STATUS_FILTERS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                    {historyCounts[item.id] ? ` (${historyCounts[item.id]})` : ''}
                  </option>
                ))}
              </select>
            </AdminField>
            <AdminField label="Date">
              <select
                value={historyRange}
                onChange={(event) => setHistoryRange(event.target.value as OrderHistoryRange)}
              >
                {ORDER_RANGE_FILTERS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </AdminField>
            <AdminField label="Product">
              <select value={historyProduct} onChange={(event) => setHistoryProduct(event.target.value)}>
                <option value="">All products</option>
                <option value="appointie">Orbit Appoint</option>
                <option value="shopie">Orbit Mart</option>
              </select>
            </AdminField>
          </div>

          {historyQuery.isLoading ? (
            <AdminEmpty>Loading history…</AdminEmpty>
          ) : historyQuery.isError ? (
            <p className="admin-message admin-message--error">
              {historyQuery.error instanceof Error ? historyQuery.error.message : 'Could not load history.'}
            </p>
          ) : history.length === 0 ? (
            <AdminEmpty title="No order history yet">Confirmed payments will list here with tenant, UTR, and screenshot.</AdminEmpty>
          ) : filteredHistory.length === 0 ? (
            <AdminEmpty
              title="No orders match these filters"
              action={
                historyFiltersActive ? (
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={clearHistoryFilters}>
                    Clear filters
                  </button>
                ) : undefined
              }
            >
              Try another order number, UTR, tenant, product, or date range.
            </AdminEmpty>
          ) : (
            <div className={historyQuery.isFetching ? 'admin-table-loading' : undefined}>
              <AdminTable columns={['Order', 'Workspace', 'For', 'Amount', 'Status', 'When', '']}>
                {filteredHistory.map((payment) => (
                  <tr key={payment.id} className={highlightId === payment.id || inspectedId === payment.id ? 'is-highlight' : undefined}>
                    <td>
                      <button type="button" className="admin-table-link" onClick={() => setInspectedId(payment.id)}>
                        #{orderNumber(payment)}
                      </button>
                      <div className="admin-table__muted">UTR {payment.upi_utr || '—'}</div>
                    </td>
                    <td>
                      {payment.tenant_id ? (
                        <Link to={`/admin/tenants/${payment.tenant_id}`}>{payment.tenant_name}</Link>
                      ) : (
                        payment.tenant_name
                      )}
                      <div className="admin-table__muted">{payment.business_name || 'Business'}</div>
                    </td>
                    <td className="admin-table__muted">{paymentOrderLabel(payment)}</td>
                    <td>
                      <strong>{formatInr(payment.amount_paise)}</strong>
                    </td>
                    <td>
                      <AdminStatus status={orderStatusLabel(payment.payment_status, payment.status)} />
                    </td>
                    <td className="admin-table__muted">
                      {formatTimestamp(payment.resolved_at || payment.paid_at || payment.claimed_at || payment.created_at)}
                    </td>
                    <td className="admin-table__actions">
                      <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setInspectedId(payment.id)}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </AdminTable>
            </div>
          )}
        </AdminSection>
      )}

      <AdminDrawer
        open={Boolean(inspected)}
        wide
        title={inspected ? `Order #${orderNumber(inspected)}` : 'Order'}
        description={inspected ? `${inspected.tenant_name || 'Workspace'} · ${formatInr(inspected.amount_paise)}` : undefined}
        onClose={() => setInspectedId(null)}
      >
        {inspected ? (
          <ClaimReview
            payment={inspected}
            interactive={Boolean(inspected.tenant_id) && String(inspected.payment_status || inspected.status).toLowerCase().includes('awaiting')}
            reason={reason}
            onReasonChange={setReason}
            busy={busy}
            pendingAction={pendingAction}
            onRequestAction={setPendingAction}
            onCancelAction={() => setPendingAction(null)}
            onConfirmAction={() => {
              if (!inspected.tenant_id || !pendingAction) return;
              void act(
                pendingAction === 'reject' ? 'Reject UPI claim' : 'Confirm UPI payment',
                inspected.tenant_id,
                inspected.id,
                pendingAction,
              );
            }}
            onOpenProof={setProofPreviewUrl}
          />
        ) : null}
      </AdminDrawer>

      <AdminDrawer
        open={Boolean(proofPreviewUrl)}
        variant="sheet"
        wide
        title="Payment screenshot"
        onClose={() => setProofPreviewUrl(null)}
      >
        {proofPreviewUrl ? (
          <div className="admin-proof-sheet">
            <ProofImage src={proofPreviewUrl} />
          </div>
        ) : null}
      </AdminDrawer>
    </AdminPage>
  );
}

export default PlatformClaimsPage;
