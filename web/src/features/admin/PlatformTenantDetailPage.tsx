import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PlatformPaymentRow } from '@ie-platform/sdk';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import { buildOpsMobileImpersonationUrl } from '../../lib/impersonation';
import { formatDate, formatTimestamp } from '../../lib/datetime';
import {
  AdminDrawer,
  AdminEmpty,
  AdminField,
  AdminKpi,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
  AdminTable,
  productLabel,
} from './AdminChrome';
import {
  useInvalidatePlatform,
  usePlatformPlanPackagesQuery,
  usePlatformTenantCreditsQuery,
  usePlatformTenantDetailQuery,
  usePlatformTenantFlagsQuery,
  usePlatformTenantPaymentsQuery,
  usePlatformTenantUsersQuery,
} from './adminHooks';

type TabKey = 'overview' | 'billing' | 'users' | 'payments';

function formatInrFromPaise(paise?: number | null) {
  if (paise == null) return '—';
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function isAwaitingClaim(payment: PlatformPaymentRow) {
  return (payment.payment_status || '').toLowerCase() === 'awaiting_confirmation';
}

function BillingFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
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
  const packagesQuery = usePlatformPlanPackagesQuery();
  const [tab, setTab] = useState<TabKey>('overview');
  const [reason, setReason] = useState('Platform admin action');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeSlug, setPurgeSlug] = useState('');
  const [planSelection, setPlanSelection] = useState<Record<string, string>>({});
  const [addonInputs, setAddonInputs] = useState<
    Record<string, { extra_staff: string; extra_offices: string; pets_pack_enabled: boolean }>
  >({});
  usePageMeta({ title: `${detailQuery.data?.display_name ?? 'Tenant'} — Platform Admin` });

  const payments = paymentsQuery.data ?? [];
  const pendingClaims = useMemo(() => payments.filter(isAwaitingClaim), [payments]);
  const historyPayments = useMemo(() => payments.filter((payment) => !isAwaitingClaim(payment)), [payments]);

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

  const tenant = detailQuery.data;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Tenant"
        title={tenant?.display_name ?? 'Tenant detail'}
        description={`${tenant?.slug ?? '…'} · ${tenant?.businesses?.length ?? 0} businesses · Impersonate opens Expo ops web`}
        actions={
          <>
            <AdminStatus status={tenant?.status} />
            <Link className="admin-btn admin-btn--ghost" to="/admin/tenants">
              All tenants
            </Link>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={Boolean(busy) || !tenantId}
              onClick={() =>
                run('Impersonate owner', async () => {
                  const result = await client.platform.impersonate(tenantId!, { reason });
                  window.location.assign(
                    buildOpsMobileImpersonationUrl({
                      access: result.data.access,
                      refresh: result.data.refresh,
                      impersonatorId: result.data.impersonator_id,
                      tenantId: tenantId!,
                    }),
                  );
                })
              }
            >
              Impersonate
            </button>
          </>
        }
      />

      <div className="admin-kpi-grid">
        <AdminKpi label="Businesses" value={tenant?.businesses?.length ?? '…'} />
        <AdminKpi label="Users" value={usersQuery.data?.length ?? '…'} />
        <AdminKpi label="Credits" value={formatInrFromPaise(creditsQuery.data ?? 0)} tone="good" />
        <AdminKpi
          label="Pending UPI"
          value={paymentsQuery.isLoading ? '…' : pendingClaims.length}
          hint="Awaiting confirmation"
          tone={pendingClaims.length ? 'warn' : 'good'}
        />
      </div>

      {pendingClaims.length > 0 && tab !== 'payments' ? (
        <div className="admin-banner">
          <div>
            <strong>
              {pendingClaims.length} UPI payment{pendingClaims.length === 1 ? '' : 's'} awaiting confirmation
            </strong>
            <p>The tenant submitted UTR / screenshot details. Review them on the Payments tab.</p>
          </div>
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => setTab('payments')}>
            Review payments
          </button>
        </div>
      ) : null}

      <div className="admin-reason-bar">
        <AdminField label="Audit reason" hint="Required for every privileged action.">
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </AdminField>
        {message ? (
          <p className={`admin-message ${message.includes('succeeded') ? 'admin-message--ok' : ''}`} style={{ margin: 0 }}>
            {message}
          </p>
        ) : null}
        {busy ? <p className="admin-message" style={{ margin: 0 }}>Running: {busy}…</p> : null}
      </div>

      <div className="admin-editor-tabs" role="tablist">
        {(
          [
            ['overview', 'Overview'],
            ['billing', 'Billing'],
            ['users', 'Users'],
            ['payments', 'Payments'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`admin-editor-tab${tab === key ? ' is-active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
            {key === 'payments' && pendingClaims.length ? (
              <span className="admin-tab-badge">{pendingClaims.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <>
          <AdminSection title="Businesses" description="Open Billing to change plans, trials, and add-ons.">
            <div className="admin-list">
              {(tenant?.businesses ?? []).map((business) => (
                <div key={business.id} className="admin-business-card">
                  <div className="admin-business-card__head">
                    <div>
                      <strong>{business.display_name}</strong>
                      <div className="admin-list-row__meta">
                        {business.business_code} · {business.selected_product ? productLabel(business.selected_product) : 'no product'}
                      </div>
                    </div>
                    <AdminStatus status={business.status} />
                  </div>
                  {business.billing ? (
                    <div className="admin-billing-grid">
                      <BillingFact label="Plan" value={String(business.billing.plan_code ?? '—')} />
                      <BillingFact label="Status" value={String(business.billing.status ?? '—')} />
                      <BillingFact
                        label="Period end"
                        value={formatDate(business.billing.current_period_ends_at as string | null | undefined)}
                      />
                    </div>
                  ) : (
                    <AdminEmpty>No billing snapshot yet.</AdminEmpty>
                  )}
                </div>
              ))}
              {(tenant?.businesses ?? []).length === 0 ? <AdminEmpty>No businesses on this tenant.</AdminEmpty> : null}
            </div>
          </AdminSection>

          <AdminSection title="Lifecycle" description="Suspend, restore, or permanently purge this workspace.">
            <div className="admin-action-bar">
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                disabled={Boolean(busy)}
                onClick={() => run('Suspend', () => client.platform.tenantAction(tenantId!, 'suspend', { reason }))}
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
                onClick={() => run('Archive', () => client.platform.tenantAction(tenantId!, 'archive', { reason }))}
              >
                Archive
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
          </AdminSection>
        </>
      ) : null}

      {tab === 'billing' ? (
        <AdminSection title="Plans & entitlements" description="Change plan, extend trial, or update add-ons per business.">
          <div className="admin-list">
            {(tenant?.businesses ?? []).map((business) => {
              const billing = business.billing;
              const productCode = business.selected_product || '';
              const availablePlans = (packagesQuery.data ?? []).filter(
                (pkg) => pkg.product_code === productCode && pkg.is_active,
              );
              const currentPlanCode = String(billing?.plan_code ?? '');
              const selectedPlan = planSelection[business.id] ?? currentPlanCode ?? '';
              const addonState = addonInputs[business.id] ?? {
                extra_staff: String(billing?.extra_staff ?? 0),
                extra_offices: String(billing?.extra_offices ?? 0),
                pets_pack_enabled: Boolean(billing?.pets_pack_enabled),
              };
              const isSoftLocked =
                Boolean(billing?.soft_locked) || String(billing?.status ?? '').includes('soft_locked');
              return (
                <div key={business.id} className="admin-business-card">
                  <div className="admin-business-card__head">
                    <div>
                      <strong>{business.display_name}</strong>
                      <div className="admin-list-row__meta">
                        {business.business_code} · {productCode ? productLabel(productCode) : 'no product'}
                      </div>
                    </div>
                    <AdminStatus status={String(billing?.status ?? business.status)} />
                  </div>
                  {billing ? (
                    <div className="admin-billing-grid">
                      <BillingFact label="Plan" value={currentPlanCode || '—'} />
                      <BillingFact
                        label="Staff"
                        value={`${String(billing.used_staff ?? 0)} / ${String(billing.effective_max_staff ?? 0)}`}
                      />
                      <BillingFact
                        label="Offices"
                        value={`${String(billing.used_offices ?? 0)} / ${String(billing.effective_max_branches ?? 0)}`}
                      />
                      <BillingFact
                        label="Monthly"
                        value={formatInrFromPaise(
                          (billing.pricing as { total_amount_paise?: number } | undefined)?.total_amount_paise,
                        )}
                      />
                      <BillingFact
                        label="Started"
                        value={formatDate(billing.subscribed_at as string | null | undefined)}
                      />
                      <BillingFact
                        label={String(billing.status || '').includes('trial') ? 'Trial ends' : 'Trial ended'}
                        value={formatDate(billing.trial_ends_at as string | null | undefined)}
                      />
                      <BillingFact
                        label="Period"
                        value={`${formatDate(billing.current_period_starts_at as string | null | undefined)} → ${formatDate(billing.current_period_ends_at as string | null | undefined)}`}
                      />
                      <BillingFact
                        label="Renews"
                        value={formatDate(billing.renews_at as string | null | undefined)}
                      />
                      {billing.canceled_at ? (
                        <BillingFact
                          label="Canceled"
                          value={formatDate(billing.canceled_at as string | null | undefined)}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <AdminEmpty>No billing snapshot yet.</AdminEmpty>
                  )}

                  {billing && productCode ? (
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div className="admin-action-bar" style={{ marginTop: 0, alignItems: 'center' }}>
                        <select
                          value={selectedPlan}
                          disabled={Boolean(busy) || availablePlans.length === 0}
                          onChange={(e) =>
                            setPlanSelection((prev) => ({ ...prev, [business.id]: e.target.value }))
                          }
                        >
                          <option value="" disabled>
                            {availablePlans.length === 0 ? 'No plans for this product' : 'Select plan…'}
                          </option>
                          {availablePlans.map((plan) => (
                            <option key={plan.id} value={plan.code}>
                              {plan.name} ({plan.code})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="admin-btn admin-btn--secondary"
                          disabled={Boolean(busy) || !selectedPlan || selectedPlan === currentPlanCode}
                          onClick={() =>
                            run(`Change plan (${business.business_code})`, () =>
                              client.platform.tenantBillingAction(tenantId!, {
                                action: 'change_plan',
                                business_id: business.id,
                                plan_code: selectedPlan,
                                product_code: productCode,
                                reason,
                              }),
                            )
                          }
                        >
                          Change plan
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--secondary"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            run(`Extend trial 15d (${business.business_code})`, () =>
                              client.platform.tenantBillingAction(tenantId!, {
                                action: 'extend_trial',
                                business_id: business.id,
                                product_code: productCode,
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
                            run(`Complimentary 30d (${business.business_code})`, () =>
                              client.platform.tenantBillingAction(tenantId!, {
                                action: 'set_complimentary',
                                business_id: business.id,
                                product_code: productCode,
                                days: 30,
                                reason,
                              }),
                            )
                          }
                        >
                          Complimentary 30d
                        </button>
                        {isSoftLocked ? (
                          <button
                            type="button"
                            className="admin-btn admin-btn--secondary"
                            disabled={Boolean(busy)}
                            onClick={() =>
                              run(`Clear soft-lock (${business.business_code})`, () =>
                                client.platform.tenantBillingAction(tenantId!, {
                                  action: 'clear_soft_lock',
                                  business_id: business.id,
                                  product_code: productCode,
                                  days: 30,
                                  reason,
                                }),
                              )
                            }
                          >
                            Clear soft-lock 30d
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost"
                            disabled={Boolean(busy)}
                            onClick={() =>
                              run(`Force soft-lock (${business.business_code})`, () =>
                                client.platform.tenantBillingAction(tenantId!, {
                                  action: 'force_soft_lock',
                                  business_id: business.id,
                                  product_code: productCode,
                                  reason,
                                }),
                              )
                            }
                          >
                            Force soft-lock
                          </button>
                        )}
                      </div>
                      <div className="admin-action-bar" style={{ marginTop: 0, alignItems: 'center' }}>
                        <label className="admin-field" style={{ minWidth: 120 }}>
                          <span className="admin-field__label">Extra staff</span>
                          <input
                            type="number"
                            min={0}
                            value={addonState.extra_staff}
                            onChange={(e) =>
                              setAddonInputs((prev) => ({
                                ...prev,
                                [business.id]: { ...addonState, extra_staff: e.target.value },
                              }))
                            }
                          />
                        </label>
                        <label className="admin-field" style={{ minWidth: 120 }}>
                          <span className="admin-field__label">Extra branches</span>
                          <input
                            type="number"
                            min={0}
                            value={addonState.extra_offices}
                            onChange={(e) =>
                              setAddonInputs((prev) => ({
                                ...prev,
                                [business.id]: { ...addonState, extra_offices: e.target.value },
                              }))
                            }
                          />
                        </label>
                        <label className="admin-feature-option">
                          <input
                            type="checkbox"
                            checked={addonState.pets_pack_enabled}
                            onChange={(e) =>
                              setAddonInputs((prev) => ({
                                ...prev,
                                [business.id]: { ...addonState, pets_pack_enabled: e.target.checked },
                              }))
                            }
                          />
                          Pets pack
                        </label>
                        <button
                          type="button"
                          className="admin-btn admin-btn--secondary"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            run(`Update addons (${business.business_code})`, () =>
                              client.platform.tenantBillingAction(tenantId!, {
                                action: 'update_addons',
                                business_id: business.id,
                                product_code: productCode,
                                extra_staff: Number(addonState.extra_staff) || 0,
                                extra_offices: Number(addonState.extra_offices) || 0,
                                pets_pack_enabled: addonState.pets_pack_enabled,
                                reason,
                              }),
                            )
                          }
                        >
                          Update addons
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {(tenant?.businesses ?? []).length === 0 ? <AdminEmpty>No businesses on this tenant.</AdminEmpty> : null}
          </div>
        </AdminSection>
      ) : null}

      {tab === 'users' ? (
        <div className="admin-split">
          <AdminSection title="People">
            {(usersQuery.data ?? []).length === 0 ? (
              <AdminEmpty>No users found.</AdminEmpty>
            ) : (
              <AdminTable columns={['User', 'Role', 'Status', '']}>
                {(usersQuery.data ?? []).map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.full_name || user.email}</strong>
                      {user.full_name ? <div className="admin-table__muted">{user.email}</div> : null}
                    </td>
                    <td className="admin-table__muted">
                      {(user.roles ?? []).join(', ') || user.relation || 'user'}
                    </td>
                    <td>
                      <AdminStatus status={user.is_active ? 'active' : 'disabled'} />
                    </td>
                    <td className="admin-table__actions">
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
                    </td>
                  </tr>
                ))}
              </AdminTable>
            )}
          </AdminSection>
          <div style={{ display: 'grid', gap: 16 }}>
            <AdminSection title="Feature flags" description="Toggle product modules for this tenant.">
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
                {(flagsQuery.data ?? []).length === 0 ? <AdminEmpty>No flags configured.</AdminEmpty> : null}
              </div>
            </AdminSection>
            <AdminSection title="Credits" description={`Balance ${formatInrFromPaise(creditsQuery.data ?? 0)}`}>
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
            </AdminSection>
          </div>
        </div>
      ) : null}

      {tab === 'payments' ? (
        <>
          <AdminSection
            title="Awaiting confirmation"
            description="When a tenant pays by UPI and submits UTR / screenshot, confirm it here to activate the plan."
          >
            {paymentsQuery.isLoading ? (
              <AdminEmpty>Loading claims…</AdminEmpty>
            ) : pendingClaims.length === 0 ? (
              <AdminEmpty>No UPI claims waiting. Confirmed payments appear in history below.</AdminEmpty>
            ) : (
              <div className="admin-claim-grid">
                {pendingClaims.map((payment) => (
                  <article key={payment.id} className="admin-claim-card">
                    <div className="admin-claim-card__meta">
                      <strong>
                        {formatInrFromPaise(payment.amount_paise)} · {productLabel(payment.product_code)}{' '}
                        {payment.plan_code}
                      </strong>
                      <p>{payment.business_name || 'Business'} · UTR {payment.upi_utr || 'not provided'}</p>
                      <p>Submitted {formatTimestamp(payment.claimed_at || payment.created_at)}</p>
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
                          disabled={Boolean(busy)}
                          onClick={() =>
                            run('Reject UPI claim', () =>
                              client.platform.confirmTenantUpiClaim(tenantId!, payment.id, {
                                action: 'reject',
                                reason,
                              }),
                            )
                          }
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--primary"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            run('Confirm UPI payment', () =>
                              client.platform.confirmTenantUpiClaim(tenantId!, payment.id, {
                                action: 'confirm',
                                reason,
                              }),
                            )
                          }
                        >
                          Confirm paid
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </AdminSection>

          <AdminSection title="Payment history">
            {historyPayments.length === 0 ? (
              <AdminEmpty>No confirmed payments yet.</AdminEmpty>
            ) : (
              <AdminTable columns={['Amount', 'Plan', 'Status', 'When', '']}>
                {historyPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <strong>{formatInrFromPaise(payment.amount_paise)}</strong>
                      {payment.invoice_number ? (
                        <div className="admin-table__muted">{payment.invoice_number}</div>
                      ) : null}
                    </td>
                    <td className="admin-table__muted">
                      {productLabel(payment.product_code)} · {payment.plan_code || '—'}
                    </td>
                    <td>
                      <AdminStatus status={payment.payment_status || payment.status} />
                    </td>
                    <td className="admin-table__muted">
                      {formatTimestamp(payment.paid_at || payment.created_at)}
                    </td>
                    <td className="admin-table__actions">
                      {payment.status === 'paid' ? (
                        <button
                          type="button"
                          className="admin-btn admin-btn--danger"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            run('Refund', () => client.platform.refundPayment(tenantId!, payment.id, { reason }))
                          }
                        >
                          Refund
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </AdminTable>
            )}
          </AdminSection>
        </>
      ) : null}

      <AdminDrawer
        open={purgeOpen}
        title="Confirm GDPR purge"
        description="This archives and deactivates the workspace. Type the tenant slug to continue."
        onClose={() => {
          setPurgeOpen(false);
          setPurgeSlug('');
        }}
      >
        <div className="admin-form-grid" style={{ maxWidth: 'none' }}>
          <p className="admin-message" style={{ margin: 0 }}>
            Type <code>{tenant?.slug}</code> to confirm.
          </p>
          <AdminField label="Tenant slug">
            <input
              value={purgeSlug}
              placeholder="Type tenant slug to confirm"
              onChange={(e) => setPurgeSlug(e.target.value)}
              autoFocus
            />
          </AdminField>
          <div className="admin-action-bar">
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
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
              disabled={Boolean(busy) || purgeSlug.trim() !== (tenant?.slug || '')}
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
      </AdminDrawer>
    </AdminPage>
  );
}

export default PlatformTenantDetailPage;
