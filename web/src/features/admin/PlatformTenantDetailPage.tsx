import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatDate } from '../../lib/datetime';
import {
  AdminEmpty,
  AdminKpi,
  AdminListRow,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
} from './AdminChrome';
import {
  useInvalidatePlatform,
  usePlatformTenantCreditsQuery,
  usePlatformTenantDetailQuery,
  usePlatformTenantFlagsQuery,
  usePlatformTenantPaymentsQuery,
  usePlatformTenantUsersQuery,
} from './adminHooks';

function formatInrFromPaise(paise?: number | null) {
  if (paise == null) return '—';
  return `₹${(paise / 100).toFixed(0)}`;
}

export function PlatformTenantDetailPage() {
  const { tenantId } = useParams();
  const client = useApiClient();
  const invalidate = useInvalidatePlatform();
  const detailQuery = usePlatformTenantDetailQuery(tenantId);
  const usersQuery = usePlatformTenantUsersQuery(tenantId);
  const flagsQuery = usePlatformTenantFlagsQuery(tenantId);
  const paymentsQuery = usePlatformTenantPaymentsQuery(tenantId);
  const creditsQuery = usePlatformTenantCreditsQuery(tenantId);
  const [reason, setReason] = useState('Platform admin action');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeSlug, setPurgeSlug] = useState('');
  usePageMeta({ title: 'Tenant Detail — Platform Admin' });

  async function run(label: string, fn: () => Promise<unknown>) {
    if (!tenantId) return;
    setBusy(label);
    setMessage(null);
    try {
      await fn();
      setMessage(`${label} succeeded`);
      invalidate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-main">
      <AdminPageHeader
        eyebrow="Tenant"
        title={detailQuery.data?.display_name ?? 'Tenant detail'}
        description={`${detailQuery.data?.slug ?? '…'} · manage lifecycle, billing, users, and payments`}
        actions={
          <>
            <AdminStatus status={detailQuery.data?.status} />
            <Link className="admin-btn admin-btn--ghost" to="/admin/tenants">
              ← Tenants
            </Link>
          </>
        }
      />

      <AdminSection title="Actions" description="Every privileged action requires a short reason for audit.">
        <label className="admin-reason">
          <span>Reason</span>
          <input
            className="admin-inline-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="admin-action-bar">
          <button
            type="button"
            className="admin-btn admin-btn--danger"
            disabled={Boolean(busy)}
            onClick={() =>
              run('Suspend', () => client.platform.tenantAction(tenantId!, 'suspend', { reason }))
            }
          >
            Suspend
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            disabled={Boolean(busy)}
            onClick={() =>
              run('Reactivate', () => client.platform.tenantAction(tenantId!, 'reactivate', { reason }))
            }
          >
            Reactivate
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            disabled={Boolean(busy)}
            onClick={() =>
              run('Archive', () => client.platform.tenantAction(tenantId!, 'archive', { reason }))
            }
          >
            Archive
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            disabled={Boolean(busy)}
            onClick={() =>
              run('Extend trial 15d', () =>
                client.platform.tenantBillingAction(tenantId!, {
                  action: 'extend_trial',
                  days: 15,
                  reason,
                }),
              )
            }
          >
            Extend trial 15d
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={Boolean(busy)}
            onClick={() =>
              run('Set complimentary', () =>
                client.platform.tenantBillingAction(tenantId!, {
                  action: 'set_complimentary',
                  days: 30,
                  reason,
                }),
              )
            }
          >
            Complimentary 30d
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            disabled={Boolean(busy)}
            onClick={() =>
              run('Impersonate owner', async () => {
                const result = await client.platform.impersonate(tenantId!, { reason });
                sessionStorage.setItem(
                  'ie_admin_tokens_backup',
                  JSON.stringify({
                    access: localStorage.getItem('ie:auth:access'),
                    refresh: localStorage.getItem('ie:auth:refresh'),
                  }),
                );
                localStorage.setItem('ie:auth:access', result.data.access);
                localStorage.setItem('ie:auth:refresh', result.data.refresh);
                localStorage.setItem('ie:auth:impersonator_id', result.data.impersonator_id);
                window.location.href = '/';
              })
            }
          >
            Impersonate owner
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--danger"
            disabled={Boolean(busy)}
            onClick={() => {
              setPurgeSlug('');
              setPurgeOpen(true);
              setMessage(null);
            }}
          >
            GDPR purge
          </button>
        </div>

        {purgeOpen ? (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 14,
              border: '1px solid rgba(244, 63, 94, 0.35)',
              background: 'rgba(244, 63, 94, 0.06)',
              display: 'grid',
              gap: 10,
              maxWidth: 520,
            }}
          >
            <strong>Confirm GDPR purge</strong>
            <p className="admin-message" style={{ margin: 0 }}>
              This archives and deactivates the workspace. Type the tenant slug{' '}
              <code>{detailQuery.data?.slug}</code> to continue.
            </p>
            <input
              className="admin-inline-input"
              placeholder="Type tenant slug to confirm"
              value={purgeSlug}
              onChange={(e) => setPurgeSlug(e.target.value)}
              autoFocus
            />
            <div className="admin-action-bar" style={{ marginTop: 0 }}>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                disabled={Boolean(busy)}
                onClick={() => {
                  setPurgeOpen(false);
                  setPurgeSlug('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                disabled={Boolean(busy) || purgeSlug.trim() !== (detailQuery.data?.slug || '')}
                onClick={() =>
                  run('Purge', async () => {
                    await client.platform.purgeTenant(tenantId!, {
                      confirm_slug: purgeSlug.trim(),
                      reason,
                    });
                    setPurgeOpen(false);
                    setPurgeSlug('');
                  })
                }
              >
                Confirm purge
              </button>
            </div>
          </div>
        ) : null}

        {message ? <p className="admin-message admin-message--ok">{message}</p> : null}
        {busy ? <p className="admin-message">Running: {busy}…</p> : null}
      </AdminSection>

      <div className="admin-kpi-grid">
        <AdminKpi label="Businesses" value={detailQuery.data?.businesses?.length ?? '…'} />
        <AdminKpi label="Users" value={usersQuery.data?.length ?? '…'} />
        <AdminKpi label="Credits" value={formatInrFromPaise(creditsQuery.data ?? 0)} tone="good" />
        <AdminKpi label="Payments" value={paymentsQuery.data?.length ?? '…'} />
      </div>

      <AdminSection title="Businesses & billing">
        <div className="admin-list">
          {(detailQuery.data?.businesses ?? []).map((business) => {
            const billing = business.billing;
            return (
              <div key={business.id} className="admin-list-row admin-list-row--static">
                <div className="admin-list-row__main" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div className="admin-list-row__title">{business.display_name}</div>
                      <div className="admin-list-row__meta">
                        {business.business_code} · {business.selected_product || 'no product'}
                      </div>
                    </div>
                    <AdminStatus status={business.status} />
                  </div>
                  {billing ? (
                    <div className="admin-billing-grid">
                      <div>
                        <span style={{ color: 'var(--muted-foreground)' }}>Plan</span>
                        <strong>{String(billing.plan_code ?? '—')}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted-foreground)' }}>Status</span>
                        <strong style={{ textTransform: 'capitalize' }}>{String(billing.status ?? '—')}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted-foreground)' }}>Staff</span>
                        <strong>
                          {String(billing.used_staff ?? 0)} / {String(billing.effective_max_staff ?? 0)}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted-foreground)' }}>Offices</span>
                        <strong>
                          {String(billing.used_offices ?? 0)} / {String(billing.effective_max_branches ?? 0)}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted-foreground)' }}>Monthly</span>
                        <strong>
                          {formatInrFromPaise(
                            (billing.pricing as { total_amount_paise?: number } | undefined)?.total_amount_paise,
                          )}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted-foreground)' }}>Started</span>
                        <strong>{formatDate(billing.subscribed_at as string | null | undefined)}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted-foreground)' }}>
                          {String(billing.status || '').includes('trial') ? 'Trial ends' : 'Trial ended'}
                        </span>
                        <strong>{formatDate(billing.trial_ends_at as string | null | undefined)}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted-foreground)' }}>Period start</span>
                        <strong>
                          {formatDate(billing.current_period_starts_at as string | null | undefined)}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted-foreground)' }}>Period end</span>
                        <strong>
                          {formatDate(billing.current_period_ends_at as string | null | undefined)}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted-foreground)' }}>Renews on</span>
                        <strong>{formatDate(billing.renews_at as string | null | undefined)}</strong>
                      </div>
                      {billing.canceled_at ? (
                        <div>
                          <span style={{ color: 'var(--muted-foreground)' }}>Canceled</span>
                          <strong>{formatDate(billing.canceled_at as string | null | undefined)}</strong>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          {(detailQuery.data?.businesses ?? []).length === 0 ? (
            <AdminEmpty>No businesses on this tenant.</AdminEmpty>
          ) : null}
        </div>
      </AdminSection>

      <div className="admin-split">
        <AdminSection title="Users">
          <div className="admin-list">
            {(usersQuery.data ?? []).map((user) => (
              <AdminListRow
                key={user.id}
                title={user.email}
                meta={`${(user.roles ?? []).join(', ') || user.relation || 'user'} · ${
                  user.is_active ? 'active' : 'disabled'
                }`}
                trailing={
                  <div className="admin-action-bar" style={{ marginTop: 0 }}>
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        run(user.is_active ? 'Disable user' : 'Enable user', () =>
                          client.platform.userAction(user.id, user.is_active ? 'disable' : 'enable', {
                            reason,
                          }),
                        )
                      }
                    >
                      {user.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--secondary"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        run('Reset password', () =>
                          client.platform.userAction(user.id, 'reset_password', { reason }),
                        )
                      }
                    >
                      Reset
                    </button>
                  </div>
                }
              />
            ))}
            {(usersQuery.data ?? []).length === 0 ? <AdminEmpty>No users found.</AdminEmpty> : null}
          </div>
        </AdminSection>

        <AdminSection
          title="Feature flags"
          description="Toggle product modules for this tenant."
        >
          <div className="admin-list">
            {(flagsQuery.data ?? []).map((flag) => (
              <label key={flag.key} className="admin-list-row admin-list-row--static">
                <span className="admin-list-row__title">{flag.key}</span>
                <input
                  type="checkbox"
                  checked={flag.enabled}
                  disabled={Boolean(busy)}
                  onChange={(e) =>
                    run(`Flag ${flag.key}`, () =>
                      client.platform.updateTenantFlags(tenantId!, {
                        flags: { [flag.key]: e.target.checked },
                        reason,
                      }),
                    )
                  }
                />
              </label>
            ))}
          </div>
          <div className="admin-action-bar">
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={Boolean(busy)}
              onClick={() =>
                run('Grant ₹500 credit', () =>
                  client.platform.grantCredit(tenantId!, { amount_paise: 50000, reason }),
                )
              }
            >
              Grant ₹500 credit
            </button>
          </div>
        </AdminSection>
      </div>

      <AdminSection title="Payments">
        <div className="admin-list">
          {(paymentsQuery.data ?? []).map((payment) => (
            <AdminListRow
              key={payment.id}
              title={`${formatInrFromPaise(payment.amount_paise)} · ${payment.status}`}
              meta={`${payment.plan_code || '—'} · ${payment.order_id || payment.id}${
                payment.invoice_number ? ` · ${payment.invoice_number}` : ''
              }`}
              trailing={
                payment.status === 'paid' ? (
                  <button
                    type="button"
                    className="admin-btn admin-btn--danger"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      run('Refund', () =>
                        client.platform.refundPayment(tenantId!, payment.id, { reason }),
                      )
                    }
                  >
                    Refund
                  </button>
                ) : (
                  <AdminStatus status={payment.status} />
                )
              }
            />
          ))}
          {(paymentsQuery.data ?? []).length === 0 ? <AdminEmpty>No payments yet.</AdminEmpty> : null}
        </div>
      </AdminSection>
    </div>
  );
}

export default PlatformTenantDetailPage;
