import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { PlatformPaymentRow } from '@ie-orbit/sdk';
import { Banknote, CheckCircle2, CircleX, Copy, Inbox, RefreshCw } from 'lucide-react';
import { useApiClient } from '../../hooks/useApiClient';
import { useAuth } from '../../hooks/useAuth';
import { usePageMeta } from '../../hooks/usePageMeta';
import { downloadAuthenticatedFile } from '../../lib/downloadAuthenticatedFile';
import { formatTimestamp } from '../../lib/datetime';
import { resolveBillingProofUrl } from '../../lib/mediaUrl';
import { getApiErrorMessage } from '../../lib/apiClient';
import {
  filterBillingOrders,
  ORDER_RANGE_FILTERS,
  ORDER_STATUS_FILTERS,
  orderListHistoryCounts,
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
  downloadTextFile,
  paymentOrderLabel,
  productLabel,
} from './AdminChrome';
import { ProofImage } from '../../components/ProofImage';
import { useInvalidatePlatform, usePlatformRefundRequestsQuery, usePlatformUpiClaimsQuery } from './adminHooks';

function formatInr(paise?: number | null) {
  return `₹${Math.round((paise ?? 0) / 100).toLocaleString('en-IN')}`;
}

function orderNumber(payment: PlatformPaymentRow) {
  return String(payment.order_number || payment.id.slice(0, 8)).replace(/^#/, '').toUpperCase();
}

function isPaidPayment(payment: PlatformPaymentRow) {
  return String(payment.payment_status || payment.status || '').toLowerCase() === 'paid';
}

function taxInvoiceDocId(payment: PlatformPaymentRow) {
  return payment.tax_invoice_id || payment.invoice_id || null;
}

async function downloadPaymentTaxInvoice(payment: PlatformPaymentRow, token: string | null) {
  const docId = taxInvoiceDocId(payment);
  if (docId) {
    await downloadAuthenticatedFile(
      `/api/v1/platform/invoices/${docId}/pdf`,
      token,
      `${payment.tax_invoice_number || payment.invoice_number || 'tax-invoice'}.pdf`,
    );
    return;
  }
  if (!payment.tenant_id) {
    throw new Error('Missing workspace for this payment');
  }
  await downloadAuthenticatedFile(
    `/api/v1/platform/tenants/${payment.tenant_id}/payments/${payment.id}/tax-invoice/pdf`,
    token,
    `order-${orderNumber(payment)}-invoice.pdf`,
  );
}

async function downloadCreditNote(noteId: string, noteNumber: string | undefined, token: string | null) {
  await downloadAuthenticatedFile(
    `/api/v1/platform/invoices/${noteId}/pdf`,
    token,
    `${noteNumber || 'credit-note'}.pdf`,
  );
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
  token,
  onMessage,
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
  token: string | null;
  onMessage?: (message: string, tone?: 'error' | 'success') => void;
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

      {(isPaidPayment(payment) || (payment.credit_notes && payment.credit_notes.length > 0)) ? (
        <div className="admin-action-bar" style={{ marginTop: 16 }}>
          {isPaidPayment(payment) ? (
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              onClick={() => {
                void downloadPaymentTaxInvoice(payment, token)
                  .then(() => onMessage?.('Invoice downloaded', 'success'))
                  .catch((err) => onMessage?.(getApiErrorMessage(err, 'Could not download invoice'), 'error'));
              }}
            >
              Download tax invoice
              {payment.tax_invoice_number || payment.invoice_number
                ? ` (${payment.tax_invoice_number || payment.invoice_number})`
                : ''}
            </button>
          ) : null}
          {(payment.credit_notes ?? []).map((note) => (
            <button
              key={note.id}
              type="button"
              className="admin-btn admin-btn--secondary"
              onClick={() => {
                void downloadCreditNote(note.id, note.invoice_number, token)
                  .then(() => onMessage?.('Credit note downloaded', 'success'))
                  .catch((err) => onMessage?.(getApiErrorMessage(err, 'Could not download credit note'), 'error'));
              }}
            >
              Download credit note{note.invoice_number ? ` (${note.invoice_number})` : ''}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RefundReview({
  payment,
  interactive,
  reason,
  onReasonChange,
  amountInr,
  onAmountChange,
  method,
  onMethodChange,
  reference,
  onReferenceChange,
  endAccessNow,
  onEndAccessNowChange,
  busy,
  pendingAction,
  onRequestAction,
  onCancelAction,
  onConfirmAction,
  onOpenProof,
  token,
  onMessage,
}: {
  payment: PlatformPaymentRow;
  interactive: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  amountInr: string;
  onAmountChange: (value: string) => void;
  method: 'upi_manual' | 'bank' | 'razorpay';
  onMethodChange: (value: 'upi_manual' | 'bank' | 'razorpay') => void;
  reference: string;
  onReferenceChange: (value: string) => void;
  endAccessNow: boolean;
  onEndAccessNowChange: (value: boolean) => void;
  busy: string | null;
  pendingAction: 'reject' | 'resolve' | null;
  onRequestAction: (action: 'reject' | 'resolve') => void;
  onCancelAction: () => void;
  onConfirmAction: () => void;
  onOpenProof: (url: string) => void;
  token: string | null;
  onMessage?: (message: string, tone?: 'error' | 'success') => void;
}) {
  const proofUrl = resolveBillingProofUrl(payment);
  const working = Boolean(busy);
  const availablePaise =
    payment.available_refund_paise ?? payment.suggested_refund_paise ?? payment.amount_paise ?? 0;
  const suggestedPaise = payment.suggested_refund_paise ?? availablePaise;
  const isWalletTopUp = Boolean(payment.is_wallet_top_up);
  const walletLabel =
    payment.refund_kind === 'assistant_top_up'
      ? 'Assistant wallet'
      : payment.refund_kind === 'smart_lookup_top_up'
        ? 'Smart Lookup wallet'
        : 'Wallet';

  return (
    <div className="admin-claim-review">
      <div className="admin-claim-review__hero">
        <div>
          <p className="admin-claim-review__amount">{formatInr(payment.amount_paise)}</p>
          <p className="admin-claim-review__products">{paymentOrderLabel(payment)}</p>
          <div className="admin-tag-row" style={{ marginTop: 10 }}>
            <AdminStatus status={orderStatusLabel(payment.payment_status, payment.status, payment.refund_status)} />
            <span className="admin-tag">#{orderNumber(payment)}</span>
            {payment.payment_channel ? <span className="admin-tag">{payment.payment_channel}</span> : null}
            {isWalletTopUp ? <span className="admin-tag">{walletLabel}</span> : null}
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
      </div>

      {payment.refund_request?.reason ? (
        <p className="admin-message" style={{ margin: 0 }}>
          Tenant reason: {payment.refund_request.reason}
        </p>
      ) : null}

      {interactive ? (
        <div className="admin-claim-review__decide">
          <AdminField label="Reason (audit log and owner email)">
            <input
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Why are you rejecting or resolving this refund?"
            />
          </AdminField>

          {pendingAction === 'resolve' ? (
            <div className="admin-form-grid" style={{ maxWidth: 'none' }}>
              <AdminField
                label={`Amount (₹) · max available ${formatInr(availablePaise)}`}
                hint={
                  isWalletTopUp
                    ? `${walletLabel} unused balance ${formatInr(payment.wallet_balance_paise ?? 0)}. Resolving removes this from their wallet.`
                    : `Suggested ${formatInr(suggestedPaise)}`
                }
              >
                <input
                  type="number"
                  min={0}
                  max={Math.round(availablePaise / 100)}
                  step={1}
                  value={amountInr}
                  onChange={(event) => onAmountChange(event.target.value)}
                />
              </AdminField>
              <AdminField label="Method">
                <select
                  value={method}
                  onChange={(event) => onMethodChange(event.target.value as 'upi_manual' | 'bank' | 'razorpay')}
                >
                  <option value="upi_manual">UPI manual</option>
                  <option value="bank">Bank transfer</option>
                  <option value="razorpay">Razorpay</option>
                </select>
              </AdminField>
              <AdminField label="Reference">
                <input
                  value={reference}
                  onChange={(event) => onReferenceChange(event.target.value)}
                  placeholder="UTR, bank ref, or Razorpay refund id"
                />
              </AdminField>
              {!isWalletTopUp ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={endAccessNow}
                    onChange={(event) => onEndAccessNowChange(event.target.checked)}
                  />
                  End product access immediately
                </label>
              ) : (
                <p className="admin-message" style={{ margin: '8px 0 0' }}>
                  Wallet refund automatically removes the unused balance from their account.
                </p>
              )}
            </div>
          ) : null}

          {pendingAction ? (
            <div className={`admin-confirm-card admin-confirm-card--${pendingAction === 'reject' ? 'danger' : 'good'}`}>
              <strong>{pendingAction === 'reject' ? 'Reject this refund request?' : 'Mark refund resolved?'}</strong>
              <p>
                {pendingAction === 'reject'
                  ? `The owner for ${payment.tenant_name || 'this workspace'} is emailed that the refund was declined.`
                  : `Record the refund for ${payment.tenant_name || 'this workspace'} and notify the owner.`}
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
                      : 'Resolving…'
                    : pendingAction === 'reject'
                      ? 'Reject refund'
                      : 'Resolve refund'}
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
                onClick={() => onRequestAction('resolve')}
              >
                Resolve
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
          <dt>Requested</dt>
          <dd>{formatTimestamp(payment.refund_request?.requested_at || payment.claimed_at || payment.created_at)}</dd>
        </div>
        <div>
          <dt>Suggested</dt>
          <dd>{formatInr(suggestedPaise)}</dd>
        </div>
      </dl>

      {(isPaidPayment(payment) || (payment.credit_notes && payment.credit_notes.length > 0)) ? (
        <div className="admin-action-bar" style={{ marginTop: 16 }}>
          {isPaidPayment(payment) ? (
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              onClick={() => {
                void downloadPaymentTaxInvoice(payment, token)
                  .then(() => onMessage?.('Invoice downloaded', 'success'))
                  .catch((err) => onMessage?.(getApiErrorMessage(err, 'Could not download invoice'), 'error'));
              }}
            >
              Download tax invoice
            </button>
          ) : null}
          {(payment.credit_notes ?? []).map((note) => (
            <button
              key={note.id}
              type="button"
              className="admin-btn admin-btn--secondary"
              onClick={() => {
                void downloadCreditNote(note.id, note.invoice_number, token)
                  .then(() => onMessage?.('Credit note downloaded', 'success'))
                  .catch((err) => onMessage?.(getApiErrorMessage(err, 'Could not download credit note'), 'error'));
              }}
            >
              Download credit note{note.invoice_number ? ` (${note.invoice_number})` : ''}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PlatformClaimsPage() {
  usePageMeta({ title: 'Claims — Platform Admin' });
  const client = useApiClient();
  const auth = useAuth();
  const token = auth.token;
  const claimsQuery = usePlatformUpiClaimsQuery('pending');
  const historyQuery = usePlatformUpiClaimsQuery('history');
  const refundsPendingQuery = usePlatformRefundRequestsQuery('pending');
  const refundsHistoryQuery = usePlatformRefundRequestsQuery('history');
  const invalidate = useInvalidatePlatform();
  const [reason, setReason] = useState('Platform admin action');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(false);
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('claim');
  const claims = claimsQuery.data ?? [];
  const history = historyQuery.data ?? [];
  const refundsPending = refundsPendingQuery.data ?? [];
  const refundsHistory = refundsHistoryQuery.data ?? [];
  const [tab, setTab] = useState<'inbox' | 'history' | 'refunds'>('inbox');
  const [inboxQuery, setInboxQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'confirm' | 'reject' | null>(null);
  const [refundPendingAction, setRefundPendingAction] = useState<'reject' | 'resolve' | null>(null);
  const [refundSelectedId, setRefundSelectedId] = useState<string | null>(null);
  const [refundScope, setRefundScope] = useState<'pending' | 'history'>('pending');
  const [refundAmountInr, setRefundAmountInr] = useState('');
  const [refundMethod, setRefundMethod] = useState<'upi_manual' | 'bank' | 'razorpay'>('upi_manual');
  const [refundReference, setRefundReference] = useState('');
  const [endAccessNow, setEndAccessNow] = useState(false);
  const [historyQueryText, setHistoryQueryText] = useState('');
  const [historyStatus, setHistoryStatus] = useState<OrderHistoryStatusFilter>('all');
  const [historyRange, setHistoryRange] = useState<OrderHistoryRange>('all');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyProduct, setHistoryProduct] = useState('');
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const highlightApplied = useRef<string | null>(null);

  const inbox = useMemo(() => {
    const needle = inboxQuery.trim().toLowerCase();
    return claims.filter((payment) => matchesQuery(payment, needle));
  }, [claims, inboxQuery]);

  const refundInbox = useMemo(() => {
    const list = refundScope === 'pending' ? refundsPending : refundsHistory;
    const needle = inboxQuery.trim().toLowerCase();
    return list.filter((payment) => matchesQuery(payment, needle));
  }, [refundScope, refundsPending, refundsHistory, inboxQuery]);

  const filteredHistory = useMemo(
    () =>
      filterBillingOrders(history, {
        query: historyQueryText,
        status: historyStatus,
        range: historyRange,
        dateFrom: historyDateFrom,
        dateTo: historyDateTo,
        productCode: historyProduct,
        productName: productLabel,
      }),
    [history, historyQueryText, historyStatus, historyRange, historyDateFrom, historyDateTo, historyProduct],
  );
  const historyCounts = useMemo(() => orderListHistoryCounts(history), [history]);
  const historyFiltersActive = Boolean(
    historyQueryText.trim() ||
      historyStatus !== 'all' ||
      historyRange !== 'all' ||
      historyDateFrom ||
      historyDateTo ||
      historyProduct,
  );
  const totalPaise = claims.reduce((sum, row) => sum + (row.amount_paise || 0), 0);
  const oldestClaim = claims
    .map((row) => row.claimed_at || row.created_at)
    .filter(Boolean)
    .sort()[0];
  const selected = inbox.find((row) => row.id === selectedId) ?? claims.find((row) => row.id === selectedId) ?? null;
  const selectedRefund =
    refundInbox.find((row) => row.id === refundSelectedId) ??
    refundsPending.find((row) => row.id === refundSelectedId) ??
    refundsHistory.find((row) => row.id === refundSelectedId) ??
    null;
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
      if (refundsPending.some((row) => row.id === highlightId) || refundsHistory.some((row) => row.id === highlightId)) {
        highlightApplied.current = highlightId;
        setTab('refunds');
        setRefundSelectedId(highlightId);
        setRefundScope(refundsPending.some((row) => row.id === highlightId) ? 'pending' : 'history');
        return;
      }
      if (history.some((row) => row.id === highlightId)) {
        highlightApplied.current = highlightId;
        setTab('history');
        setInspectedId(highlightId);
        return;
      }
      if (
        claimsQuery.isLoading ||
        historyQuery.isLoading ||
        refundsPendingQuery.isLoading ||
        refundsHistoryQuery.isLoading
      ) {
        return;
      }
    }

    if (selectedId && inbox.some((row) => row.id === selectedId)) return;
    setSelectedId(inbox[0]?.id ?? null);
    setPendingAction(null);
  }, [
    highlightId,
    claims,
    history,
    inbox,
    selectedId,
    claimsQuery.isLoading,
    historyQuery.isLoading,
    refundsPending,
    refundsHistory,
    refundsPendingQuery.isLoading,
    refundsHistoryQuery.isLoading,
  ]);

  useEffect(() => {
    if (refundSelectedId && refundInbox.some((row) => row.id === refundSelectedId)) return;
    setRefundSelectedId(refundInbox[0]?.id ?? null);
    setRefundPendingAction(null);
  }, [refundInbox, refundSelectedId]);

  useEffect(() => {
    if (!selectedRefund) return;
    const suggested = selectedRefund.suggested_refund_paise ?? selectedRefund.amount_paise ?? 0;
    setRefundAmountInr(String(Math.round(suggested / 100)));
    setRefundMethod(String(selectedRefund.payment_channel || '').includes('razorpay') ? 'razorpay' : 'upi_manual');
    setRefundReference('');
    setEndAccessNow(false);
  }, [selectedRefund?.id]);

  async function refresh() {
    await Promise.all([
      claimsQuery.refetch(),
      historyQuery.refetch(),
      refundsPendingQuery.refetch(),
      refundsHistoryQuery.refetch(),
    ]);
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
      await refresh();
    } catch (err) {
      setMessageOk(false);
      setMessage(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  async function actRefund(label: string, tenantId: string, paymentId: string, action: 'reject' | 'resolve') {
    setBusy(`${action}:${paymentId}`);
    setMessage(null);
    try {
      if (action === 'reject') {
        await client.platform.rejectRefundRequest(tenantId, paymentId, { reason });
      } else {
        const amountPaise = Math.round(Number(refundAmountInr || 0) * 100);
        await client.platform.resolveRefundRequest(tenantId, paymentId, {
          reason,
          amount_paise: Number.isFinite(amountPaise) && amountPaise > 0 ? amountPaise : undefined,
          method: refundMethod,
          reference: refundReference.trim() || undefined,
          end_access_now: endAccessNow,
        });
      }
      setMessageOk(true);
      setMessage(`${label} succeeded — the owner was emailed.`);
      setRefundPendingAction(null);
      invalidate();
      await refresh();
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
    setHistoryDateFrom('');
    setHistoryDateTo('');
    setHistoryProduct('');
  }

  function downloadHistoryCsv() {
    if (filteredHistory.length === 0) {
      setMessage('No filtered orders to download');
      setMessageOk(false);
      return;
    }
    const escape = (value: unknown) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = [
      'date',
      'order_number',
      'tenant',
      'business',
      'products',
      'amount_inr',
      'status',
      'refund_status',
      'utr',
      'claim_intent',
      'payment_channel',
      'invoice_number',
    ];
    const lines = [
      header.join(','),
      ...filteredHistory.map((payment) =>
        [
          String(payment.resolved_at || payment.paid_at || payment.claimed_at || payment.created_at || '').slice(0, 10),
          orderNumber(payment),
          payment.tenant_name || payment.tenant_slug || '',
          payment.business_name || '',
          paymentOrderLabel(payment),
          ((payment.amount_paise ?? 0) / 100).toFixed(2),
          orderStatusLabel(payment.payment_status, payment.status, payment.refund_status),
          payment.refund_status || '',
          payment.upi_utr || '',
          payment.claim_intent || '',
          payment.payment_channel || '',
          payment.tax_invoice_number || payment.invoice_number || '',
        ]
          .map(escape)
          .join(','),
      ),
    ];
    downloadTextFile(`ie-orbit-claims-history.csv`, `${lines.join('\n')}\n`);
    setMessage(`Downloaded ${filteredHistory.length} order${filteredHistory.length === 1 ? '' : 's'}`);
    setMessageOk(true);
  }

  const refundsFetching =
    refundsPendingQuery.isFetching || refundsHistoryQuery.isFetching || claimsQuery.isFetching || historyQuery.isFetching;

  return (
    <AdminPage>
      <AdminPageHeader
        title="Claims"
        description="Review UPI screenshots and UTRs, then confirm to activate a plan or reject with a reason. Owners are emailed either way."
        actions={
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            disabled={refundsFetching}
            onClick={() => void refresh()}
          >
            <RefreshCw size={16} />
            {refundsFetching ? 'Refreshing…' : 'Refresh'}
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
          label="Refunds"
          value={refundsPendingQuery.isLoading ? '…' : refundsPending.length}
          hint="Pending refund requests"
          tone={refundsPending.length ? 'warn' : 'good'}
          icon={<CircleX size={16} />}
        />
        <AdminKpi
          label="Confirmed"
          value={historyQuery.isLoading ? '…' : historyCounts.paid}
          hint="Paid in history"
          tone="good"
          icon={<CheckCircle2 size={16} />}
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
          aria-selected={tab === 'refunds'}
          className={`admin-editor-tab${tab === 'refunds' ? ' is-active' : ''}`}
          onClick={() => setTab('refunds')}
        >
          Refunds
          {refundsPending.length ? <span className="admin-tab-badge">{refundsPending.length}</span> : null}
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
                token={token}
                onMessage={(text, tone) => {
                  setMessage(text);
                  setMessageOk(tone !== 'error');
                }}
              />
            ) : (
              <AdminEmpty>Select a pending claim to compare the UTR and screenshot, then confirm or reject.</AdminEmpty>
            )}
          </AdminSection>
        </div>
      ) : tab === 'refunds' ? (
        <div className="admin-split admin-split--review">
          <AdminSection
            title="Refund requests"
            description={
              refundsPendingQuery.isLoading || refundsHistoryQuery.isLoading
                ? 'Loading refund requests…'
                : refundScope === 'pending'
                  ? `${refundInbox.length} pending`
                  : `${refundInbox.length} in history`
            }
            actions={
              <div className="admin-action-bar" style={{ margin: 0 }}>
                <button
                  type="button"
                  className={`admin-btn ${refundScope === 'pending' ? 'admin-btn--primary' : 'admin-btn--ghost'}`}
                  onClick={() => setRefundScope('pending')}
                >
                  Pending
                  {refundsPending.length ? ` (${refundsPending.length})` : ''}
                </button>
                <button
                  type="button"
                  className={`admin-btn ${refundScope === 'history' ? 'admin-btn--primary' : 'admin-btn--ghost'}`}
                  onClick={() => setRefundScope('history')}
                >
                  History
                </button>
                <AdminSearch value={inboxQuery} onChange={setInboxQuery} placeholder="Search tenant, UTR, or order #" />
              </div>
            }
          >
            {(refundScope === 'pending' ? refundsPendingQuery.isLoading : refundsHistoryQuery.isLoading) ? (
              <AdminEmpty>Loading refunds…</AdminEmpty>
            ) : (refundScope === 'pending' ? refundsPending : refundsHistory).length === 0 ? (
              <AdminEmpty title={refundScope === 'pending' ? 'No pending refunds' : 'No refund history yet'}>
                Tenant refund requests appear here after they submit from order history.
              </AdminEmpty>
            ) : refundInbox.length === 0 ? (
              <AdminEmpty title="No refunds match this search">Try another tenant, UTR, or order number.</AdminEmpty>
            ) : (
              <div className="admin-inbox-list">
                {refundInbox.map((payment) => (
                  <AdminListRow
                    key={payment.id}
                    selected={selectedRefund?.id === payment.id}
                    title={`${formatInr(payment.amount_paise)} · ${payment.tenant_name || 'Workspace'}`}
                    meta={`#${orderNumber(payment)} · ${paymentOrderLabel(payment)} · ${orderStatusLabel(payment.payment_status, payment.status, payment.refund_status)}`}
                    trailing={
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {isPaidPayment(payment) ? (
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              void downloadPaymentTaxInvoice(payment, token)
                                .then(() => {
                                  setMessage('Invoice downloaded');
                                  setMessageOk(true);
                                })
                                .catch((err) => {
                                  setMessage(getApiErrorMessage(err, 'Could not download invoice'));
                                  setMessageOk(false);
                                });
                            }}
                          >
                            Invoice
                          </button>
                        ) : null}
                        {(payment.credit_notes ?? []).slice(0, 1).map((note) => (
                          <button
                            key={note.id}
                            type="button"
                            className="admin-btn admin-btn--ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              void downloadCreditNote(note.id, note.invoice_number, token)
                                .then(() => {
                                  setMessage('Credit note downloaded');
                                  setMessageOk(true);
                                })
                                .catch((err) => {
                                  setMessage(getApiErrorMessage(err, 'Could not download credit note'));
                                  setMessageOk(false);
                                });
                            }}
                          >
                            Credit note
                          </button>
                        ))}
                        <AdminStatus status={orderStatusLabel(payment.payment_status, payment.status, payment.refund_status)} />
                      </div>
                    }
                    onClick={() => {
                      setRefundSelectedId(payment.id);
                      setRefundPendingAction(null);
                      setMessage(null);
                    }}
                  />
                ))}
              </div>
            )}
          </AdminSection>

          <AdminSection
            title={selectedRefund ? `Refund #${orderNumber(selectedRefund)}` : 'Review refund'}
            description={
              selectedRefund
                ? `${selectedRefund.tenant_name || 'Workspace'} · ${orderStatusLabel(selectedRefund.payment_status, selectedRefund.status, selectedRefund.refund_status)}`
                : 'Pick a refund request from the list.'
            }
          >
            {selectedRefund ? (
              <RefundReview
                payment={selectedRefund}
                interactive={
                  refundScope === 'pending' &&
                  String(selectedRefund.refund_status || '').toLowerCase() === 'requested' &&
                  Boolean(selectedRefund.tenant_id)
                }
                reason={reason}
                onReasonChange={setReason}
                amountInr={refundAmountInr}
                onAmountChange={setRefundAmountInr}
                method={refundMethod}
                onMethodChange={setRefundMethod}
                reference={refundReference}
                onReferenceChange={setRefundReference}
                endAccessNow={endAccessNow}
                onEndAccessNowChange={setEndAccessNow}
                busy={busy}
                pendingAction={refundPendingAction}
                onRequestAction={setRefundPendingAction}
                onCancelAction={() => setRefundPendingAction(null)}
                onConfirmAction={() => {
                  if (!selectedRefund.tenant_id || !refundPendingAction) return;
                  void actRefund(
                    refundPendingAction === 'reject' ? 'Reject refund request' : 'Resolve refund request',
                    selectedRefund.tenant_id,
                    selectedRefund.id,
                    refundPendingAction,
                  );
                }}
                onOpenProof={setProofPreviewUrl}
                token={token}
                onMessage={(text, tone) => {
                  setMessage(text);
                  setMessageOk(tone !== 'error');
                }}
              />
            ) : (
              <AdminEmpty>Select a refund request to reject or mark resolved after you pay the tenant back.</AdminEmpty>
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
            <>
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                disabled={filteredHistory.length === 0}
                onClick={downloadHistoryCsv}
              >
                Download CSV
              </button>
              {historyFiltersActive ? (
                <button type="button" className="admin-btn admin-btn--ghost" onClick={clearHistoryFilters}>
                  Clear filters
                </button>
              ) : null}
            </>
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
            <AdminField label="Preset">
              <select
                value={historyRange}
                disabled={Boolean(historyDateFrom || historyDateTo)}
                onChange={(event) => setHistoryRange(event.target.value as OrderHistoryRange)}
              >
                {ORDER_RANGE_FILTERS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </AdminField>
            <AdminField label="From">
              <input
                type="date"
                value={historyDateFrom}
                onChange={(event) => {
                  setHistoryDateFrom(event.target.value);
                  if (event.target.value) setHistoryRange('all');
                }}
              />
            </AdminField>
            <AdminField label="To">
              <input
                type="date"
                value={historyDateTo}
                onChange={(event) => {
                  setHistoryDateTo(event.target.value);
                  if (event.target.value) setHistoryRange('all');
                }}
              />
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
                      <AdminStatus status={orderStatusLabel(payment.payment_status, payment.status, payment.refund_status)} />
                    </td>
                    <td className="admin-table__muted">
                      {formatTimestamp(payment.resolved_at || payment.paid_at || payment.claimed_at || payment.created_at)}
                    </td>
                    <td className="admin-table__actions">
                      {isPaidPayment(payment) ? (
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost"
                          onClick={() => {
                            void downloadPaymentTaxInvoice(payment, token)
                              .then(() => {
                                setMessage('Invoice downloaded');
                                setMessageOk(true);
                              })
                              .catch((err) => {
                                setMessage(getApiErrorMessage(err, 'Could not download invoice'));
                                setMessageOk(false);
                              });
                          }}
                        >
                          Invoice
                        </button>
                      ) : null}
                      {(payment.credit_notes ?? []).slice(0, 1).map((note) => (
                        <button
                          key={note.id}
                          type="button"
                          className="admin-btn admin-btn--ghost"
                          onClick={() => {
                            void downloadCreditNote(note.id, note.invoice_number, token)
                              .then(() => {
                                setMessage('Credit note downloaded');
                                setMessageOk(true);
                              })
                              .catch((err) => {
                                setMessage(getApiErrorMessage(err, 'Could not download credit note'));
                                setMessageOk(false);
                              });
                          }}
                        >
                          Credit note
                        </button>
                      ))}
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
            token={token}
            onMessage={(text, tone) => {
              setMessage(text);
              setMessageOk(tone !== 'error');
            }}
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
