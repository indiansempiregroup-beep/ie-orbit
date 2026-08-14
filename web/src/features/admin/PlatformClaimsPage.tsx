import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatTimestamp } from '../../lib/datetime';
import {
  AdminEmpty,
  AdminField,
  AdminKpi,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  productLabel,
} from './AdminChrome';
import { useInvalidatePlatform, usePlatformUpiClaimsQuery } from './adminHooks';

function formatInr(paise?: number | null) {
  return `₹${Math.round((paise ?? 0) / 100).toLocaleString('en-IN')}`;
}

export function PlatformClaimsPage() {
  usePageMeta({ title: 'UPI claims — Platform Admin' });
  const client = useApiClient();
  const claimsQuery = usePlatformUpiClaimsQuery();
  const invalidate = useInvalidatePlatform();
  const [reason, setReason] = useState('Platform admin action');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const claims = claimsQuery.data ?? [];
  const totalPaise = claims.reduce((sum, row) => sum + (row.amount_paise || 0), 0);

  async function act(label: string, tenantId: string, paymentId: string, action: 'confirm' | 'reject') {
    setBusy(`${action}:${paymentId}`);
    setMessage(null);
    try {
      await client.platform.confirmTenantUpiClaim(tenantId, paymentId, { action, reason });
      setMessage(`${label} succeeded`);
      invalidate();
      await claimsQuery.refetch();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader
        title="UPI claims"
        description="Tenants who paid by UPI and submitted a UTR or screenshot. Confirm to activate the plan."
      />

      <div className="admin-kpi-grid">
        <AdminKpi label="Awaiting" value={claimsQuery.isLoading ? '…' : claims.length} tone={claims.length ? 'warn' : 'good'} />
        <AdminKpi label="Amount" value={claimsQuery.isLoading ? '…' : formatInr(totalPaise)} />
      </div>

      <AdminSection title="Inbox" description="Confirm or reject without opening each tenant.">
        <AdminField label="Reason (audit log)">
          <input value={reason} onChange={(event) => setReason(event.target.value)} />
        </AdminField>
        {message ? <p className="admin-message">{message}</p> : null}
        {claimsQuery.isLoading ? (
          <AdminEmpty>Loading claims…</AdminEmpty>
        ) : claims.length === 0 ? (
          <AdminEmpty title="No pending claims">Confirmed payments appear on Revenue and tenant payment history.</AdminEmpty>
        ) : (
          <div className="admin-claim-grid">
            {claims.map((payment) => (
              <article key={payment.id} className="admin-claim-card">
                <div className="admin-claim-card__meta">
                  <strong>
                    {formatInr(payment.amount_paise)} · {productLabel(payment.product_code)} {payment.plan_code}
                  </strong>
                  <p>
                    {payment.tenant_id ? (
                      <Link to={`/admin/tenants/${payment.tenant_id}`}>{payment.tenant_name}</Link>
                    ) : (
                      payment.tenant_name
                    )}{' '}
                    · {payment.business_name || 'Business'}
                  </p>
                  <p>UTR {payment.upi_utr || 'not provided'} · Submitted {formatTimestamp(payment.claimed_at || payment.created_at)}</p>
                </div>
                <div className="admin-claim-card__proof">
                  {payment.payment_proof_url ? (
                    <a href={payment.payment_proof_url} target="_blank" rel="noreferrer">
                      <img src={payment.payment_proof_url} alt="Payment proof" />
                    </a>
                  ) : (
                    <p>No screenshot</p>
                  )}
                  <div className="admin-action-bar" style={{ marginTop: 0 }}>
                    <button
                      type="button"
                      className="admin-btn admin-btn--danger"
                      disabled={Boolean(busy) || !payment.tenant_id}
                      onClick={() => void act('Reject UPI claim', payment.tenant_id!, payment.id, 'reject')}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--primary"
                      disabled={Boolean(busy) || !payment.tenant_id}
                      onClick={() => void act('Confirm UPI payment', payment.tenant_id!, payment.id, 'confirm')}
                    >
                      {busy === `confirm:${payment.id}` ? 'Confirming…' : 'Confirm paid'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </AdminSection>
    </AdminPage>
  );
}

export default PlatformClaimsPage;
