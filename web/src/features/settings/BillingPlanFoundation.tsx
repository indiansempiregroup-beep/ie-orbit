import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatTimestamp } from '../../lib/datetime';
import {
  ACTIVE_BUSINESS_STORAGE_KEY,
  ACTIVE_TENANT_STORAGE_KEY,
} from '../../contexts/WorkspaceContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { BillingDates } from './BillingDates';
import {
  useBillingCheckout,
  useBillingGoLiveCheckQuery,
  useBillingOpsDigestQuery,
  useBillingPlatformOpsSummaryQuery,
  useBillingOpsSnapshotQuery,
  useBillingPlansQuery,
  useBillingObservabilityQuery,
  useBillingReleaseGateQuery,
  useBillingStatusQuery,
  useBillingWebhookBulkReprocess,
  useBillingWebhookEventsQuery,
  useBillingWebhookReprocess,
  useBillingWebhookSummaryQuery,
  useBusinessBillingSnapshotQuery,
  useUpdateBusinessAddonsMutation,
} from './billingHooks';
import { useCancelPendingProductPlanChange } from './businessSettingsHooks';

export function BillingPlanFoundation() {
  const [eventFilter, setEventFilter] = useState<'all' | 'failed' | 'dead_letter'>('all');
  const [selectedPlanCode, setSelectedPlanCode] = useState('appointie-starter');
  const [showPlatformSummary, setShowPlatformSummary] = useState(false);
  const [extraStaff, setExtraStaff] = useState(0);
  const [extraOffices, setExtraOffices] = useState(0);
  const [petsPackEnabled, setPetsPackEnabled] = useState(false);
  const { businessId } = useWorkspace();
  const billingSnapshotQuery = useBusinessBillingSnapshotQuery(businessId ?? undefined);
  const updateAddons = useUpdateBusinessAddonsMutation(businessId ?? undefined);
  const cancelPendingPlan = useCancelPendingProductPlanChange();
  const statusQuery = useBillingStatusQuery();
  const plansQuery = useBillingPlansQuery();
  const goLiveQuery = useBillingGoLiveCheckQuery();
  const observabilityQuery = useBillingObservabilityQuery(24);
  const opsDigestQuery = useBillingOpsDigestQuery(24);
  const opsSnapshotQuery = useBillingOpsSnapshotQuery(24);
  const platformSummaryQuery = useBillingPlatformOpsSummaryQuery(24, 50, showPlatformSummary);
  const releaseGateQuery = useBillingReleaseGateQuery();
  const summaryQuery = useBillingWebhookSummaryQuery(24);
  const webhookEventsQuery = useBillingWebhookEventsQuery(
    eventFilter === 'all' ? undefined : eventFilter,
    eventFilter === 'dead_letter',
  );
  const reprocessWebhook = useBillingWebhookReprocess();
  const bulkReprocessWebhook = useBillingWebhookBulkReprocess();
  const checkout = useBillingCheckout();
  const snackbar = useSnackbar();

  const status = statusQuery.data;
  const plans = plansQuery.data ?? [];
  const goLive = goLiveQuery.data;
  const observability = observabilityQuery.data;
  const releaseGate = releaseGateQuery.data;
  const opsDigest = opsDigestQuery.data;
  const summary = summaryQuery.data;
  const opsSnapshot = opsSnapshotQuery.data;
  const isConfigured = status?.configured ?? false;
  const mockMode = status?.mock_mode ?? true;
  const launchReady = Boolean(goLive?.ready && releaseGate?.passed);
  const selectedPlan = plans.find((plan) => plan.plan_code === selectedPlanCode) ?? plans[0];
  const checkoutProductCode = selectedPlan?.product_code ?? 'appointie';
  const checkoutPlanCode = selectedPlan?.plan_code ?? 'appointie-starter';
  const trendDirectionColor = opsSnapshot?.trend.direction === 'improving' ? '#166534' : '#991b1b';
  const failureDelta = opsSnapshot?.trend.failure_rate_delta ?? 0;
  const deadLetterDelta = opsSnapshot?.trend.dead_letter_delta ?? 0;
  const stuckRetryDelta = opsSnapshot?.trend.stuck_retries_delta ?? 0;

  const billing = billingSnapshotQuery.data;

  useEffect(() => {
    if (!billing) return;
    setExtraStaff(billing.extra_staff);
    setExtraOffices(billing.extra_offices);
    setPetsPackEnabled(Boolean(billing.pets_pack_enabled));
  }, [billing?.extra_staff, billing?.extra_offices, billing?.pets_pack_enabled]);

  return (
    <Card className="billing-foundation">
      <div className="billing-foundation-header">
        <p className="public-kicker">Billing foundation</p>
        <h2 style={{ margin: 0 }}>Your plan & usage</h2>
        {billing ? (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <div className="billing-foundation-chips">
              <span className="billing-chip billing-chip--ok">Plan: {billing.plan_code}</span>
              <span className="billing-chip billing-chip--muted" style={{ textTransform: 'capitalize' }}>
                {billing.status.replace('_', ' ')}
              </span>
              <span className="billing-chip billing-chip--muted">{billing.billing_interval}</span>
              {billing.soft_locked ? (
                <span className="billing-chip billing-chip--warn">Soft locked — renew required</span>
              ) : null}
              {billing.plan_locked_until ? (
                <span className="billing-chip billing-chip--muted">
                  Locked until period end
                </span>
              ) : null}
              {billing.pending_plan_code ? (
                <span className="billing-chip billing-chip--warn">
                  Next: {billing.pending_plan_code}
                </span>
              ) : null}
            </div>
            <BillingDates billing={billing} />
            {billing.pending_plan_code ? (
              <p className="billing-section-meta" style={{ margin: 0 }}>
                Downgrades take effect on the renewal date. You keep {billing.plan_code} until then.
                {businessId ? (
                  <>
                    {' '}
                    <Button
                      variant="ghost"
                      disabled={cancelPendingPlan.isPending}
                      onClick={() => {
                        cancelPendingPlan.mutate(
                          { productCode: checkoutProductCode },
                          {
                            onSuccess: () => {
                              void billingSnapshotQuery.refetch();
                              snackbar.push('Pending plan change canceled.', 'success');
                            },
                            onError: () => snackbar.push('Unable to cancel pending plan change.', 'error'),
                          },
                        );
                      }}
                    >
                      {cancelPendingPlan.isPending ? 'Canceling…' : 'Cancel pending change'}
                    </Button>
                  </>
                ) : null}
              </p>
            ) : (
              <p className="billing-section-meta" style={{ margin: 0 }}>
                Renew before period end to avoid a soft lock. There is no automatic charge.
              </p>
            )}
            <p className="billing-section-meta" style={{ margin: 0 }}>
              Staff {billing.used_staff}/{billing.effective_max_staff} · Offices {billing.used_offices}/
              {billing.effective_max_branches} · Total ₹{(billing.pricing.total_amount_paise / 100).toFixed(0)}
              {billing.billing_interval === 'yearly' ? '/year' : '/month'}
            </p>
            <p className="billing-section-meta" style={{ margin: 0 }}>
              Included {billing.included_staff} staff / {billing.included_offices} offices · Add-ons +
              {billing.extra_staff} staff (+₹{(billing.pricing.addon_staff_unit_paise / 100).toFixed(0)} each) · +
              {billing.extra_offices} offices (+₹{(billing.pricing.addon_office_unit_paise / 100).toFixed(0)} each)
              {checkoutProductCode === 'shopie'
                ? ` · Pets ${billing.pets_pack_enabled ? 'on' : 'off'} (+₹${((billing.pricing.addon_pets_unit_paise ?? 50000) / 100).toFixed(0)}/mo)`
                : ''}
            </p>
            <div className="billing-addons-row">
              <label>
                Extra staff
                <input
                  type="number"
                  min={0}
                  value={extraStaff}
                  onChange={(event) => setExtraStaff(Number(event.target.value) || 0)}
                />
              </label>
              <label>
                Extra offices
                <input
                  type="number"
                  min={0}
                  value={extraOffices}
                  onChange={(event) => setExtraOffices(Number(event.target.value) || 0)}
                />
              </label>
              {checkoutProductCode === 'shopie' ? (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={petsPackEnabled}
                    onChange={(event) => setPetsPackEnabled(event.target.checked)}
                  />
                  Pets pack (₹500/mo)
                </label>
              ) : null}
              <Button
                variant="primary"
                disabled={updateAddons.isPending || !businessId}
                onClick={() => {
                  updateAddons.mutate(
                    {
                      productCode: checkoutProductCode,
                      extra_staff: extraStaff,
                      extra_offices: extraOffices,
                      ...(checkoutProductCode === 'shopie' ? { pets_pack_enabled: petsPackEnabled } : {}),
                    },
                    {
                      onSuccess: () => snackbar.push('Add-ons updated. Billing total refreshed.', 'success'),
                      onError: (error) =>
                        snackbar.push(
                          getApiErrorMessage(error, 'Unable to update add-ons. Check usage limits.'),
                          'error',
                        ),
                    },
                  );
                }}
              >
                {updateAddons.isPending ? 'Updating…' : 'Update add-ons'}
              </Button>
            </div>
          </div>
        ) : (
          <p className="billing-section-meta">Loading current entitlements…</p>
        )}
        <h2 style={{ margin: '20px 0 0' }}>Razorpay checkout</h2>
        <p className="billing-section-meta">
          {isConfigured
            ? 'Payments are configured. You can start a Razorpay checkout for the selected plan.'
            : 'Razorpay is not configured yet. Checkout runs in mock mode until you add API keys.'}
        </p>
        <div className="billing-foundation-chips">
          <span className={`billing-chip ${launchReady ? 'billing-chip--ok' : 'billing-chip--warn'}`}>
            Launch Ready: {launchReady ? 'Yes' : 'No'}
          </span>
          <span className="billing-chip billing-chip--muted">Provider: {status?.provider ?? 'razorpay'}</span>
          <span className="billing-chip billing-chip--muted">Currency: {status?.currency ?? 'INR'}</span>
          <span className={`billing-chip ${mockMode ? 'billing-chip--muted' : 'billing-chip--ok'}`}>
            Mode: {mockMode ? 'Mock (no live charges)' : 'Live'}
          </span>
        </div>
      </div>

      <div className="billing-section">
        <p className="billing-section-title">Plan catalog</p>
        {plansQuery.isLoading ? (
          <p className="billing-section-meta">Loading plans...</p>
        ) : plans.length === 0 ? (
          <p className="billing-section-meta">No billable plans configured.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <select
              value={selectedPlan?.plan_code ?? selectedPlanCode}
              onChange={(event) => setSelectedPlanCode(event.target.value)}
            >
              {plans.map((plan) => (
                <option key={plan.plan_code} value={plan.plan_code}>
                  {plan.name} ({plan.currency} {((plan.amount_paise ?? 0) / 100).toFixed(2)})
                </option>
              ))}
            </select>
            {selectedPlan ? (
              <p className="billing-section-meta">
                {selectedPlan.description} · Trial {selectedPlan.trial_days} days · {selectedPlan.billing_interval}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className="billing-section">
        <p className="billing-section-title">
          Go-live readiness:{' '}
          {goLive?.ready ? (
            <span style={{ color: '#166534' }}>Ready</span>
          ) : (
            <span style={{ color: '#991b1b' }}>Not ready</span>
          )}
        </p>
        {!goLiveQuery.isLoading && goLive ? (
          <p className="billing-section-meta">
            Blockers: {goLive.blockers.length} · Warnings: {goLive.warnings.length}
          </p>
        ) : null}
      </div>

      <div className="billing-section">
        <p className="billing-section-title">
          Release gate preflight:{' '}
          {releaseGate?.passed ? (
            <span style={{ color: '#166534' }}>Pass</span>
          ) : (
            <span style={{ color: '#991b1b' }}>Fail</span>
          )}
        </p>
        {!releaseGateQuery.isLoading && releaseGate ? (
          <div>
            <p className="billing-section-meta">
              Blockers: {releaseGate.blockers.length} · Warnings: {releaseGate.warnings.length}
            </p>
            {releaseGate.failing_checks.length > 0 ? (
              <ul className="billing-fail-list">
                {releaseGate.failing_checks.slice(0, 3).map((check) => (
                  <li key={check.id}>
                    <strong>{check.label}:</strong> {check.remediation}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="billing-section">
        <p className="billing-section-title">Operational signals (24h)</p>
        {observabilityQuery.isLoading || !observability ? (
          <p className="billing-section-meta">Loading signals...</p>
        ) : (
          <p className="billing-section-meta">
            Failed events: {observability.events.billing_webhook_failed} · Dead-letter events:{' '}
            {observability.events.billing_webhook_dead_letter} · Onboarding provisions:{' '}
            {observability.events.onboarding_workspace_provisioned} · Reconciliation runs:{' '}
            {observability.audits.reconciliation_runs}
          </p>
        )}
      </div>

      <div className="billing-section">
        <p className="billing-section-title">Ops snapshot export</p>
        {!opsSnapshotQuery.isLoading && opsSnapshot ? (
          <p className="billing-section-meta">
            Generated {formatTimestamp(opsSnapshot.generated_at)} · Ready: {opsSnapshot.ready ? 'yes' : 'no'} ·
            Health score: {opsSnapshot.health_score}/100
          </p>
        ) : (
          <p className="billing-section-meta">Preparing snapshot...</p>
        )}
        {opsSnapshot && opsSnapshot.recommendations.length > 0 ? (
          <ul className="billing-fail-list">
            {opsSnapshot.recommendations.slice(0, 3).map((item, index) => (
              <li key={`${item.severity}-${index}`}>
                [{item.severity}] {item.action}
              </li>
            ))}
          </ul>
        ) : null}
        {opsSnapshot ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ margin: 0, color: trendDirectionColor, fontWeight: 600 }}>
              Trend vs previous {opsSnapshot.trend.comparison_window_hours}h:{' '}
              {opsSnapshot.trend.direction === 'improving' ? '↘ Improving' : '↗ Degrading'}
            </p>
            <div className="billing-trend-chips">
              <span className={`billing-trend-chip ${failureDelta <= 0 ? 'billing-trend-chip--down' : 'billing-trend-chip--up'}`}>
                Failure rate {failureDelta <= 0 ? '↓' : '↑'} {(failureDelta * 100).toFixed(2)}%
              </span>
              <span
                className={`billing-trend-chip ${deadLetterDelta <= 0 ? 'billing-trend-chip--down' : 'billing-trend-chip--up'}`}
              >
                Dead-letter {deadLetterDelta <= 0 ? '↓' : '↑'} {deadLetterDelta >= 0 ? '+' : ''}
                {deadLetterDelta}
              </span>
              <span
                className={`billing-trend-chip ${stuckRetryDelta <= 0 ? 'billing-trend-chip--down' : 'billing-trend-chip--up'}`}
              >
                Stuck retries {stuckRetryDelta <= 0 ? '↓' : '↑'} {stuckRetryDelta >= 0 ? '+' : ''}
                {stuckRetryDelta}
              </span>
            </div>
          </div>
        ) : null}
        <div className="billing-actions-ops" style={{ marginTop: 4 }}>
          <Button
            variant="ghost"
            onClick={() => {
              if (!opsSnapshot) return;
              const blob = new Blob([JSON.stringify(opsSnapshot, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement('a');
              anchor.href = url;
              anchor.download = 'billing-ops-snapshot.json';
              anchor.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download JSON snapshot
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                const accessToken = localStorage.getItem('ie:auth:access');
                const tenantId = localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
                const businessId = localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY);
                const headers = new Headers();
                if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
                if (tenantId) headers.set('X-Tenant-ID', tenantId);
                if (businessId) headers.set('X-Business-ID', businessId);
                const response = await fetch('/api/v1/billing/ops-snapshot?window_hours=24&format=csv', {
                  method: 'GET',
                  headers,
                });
                if (!response.ok) {
                  throw new Error('Snapshot export failed.');
                }
                const csv = await response.text();
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = 'billing-ops-snapshot.csv';
                anchor.click();
                URL.revokeObjectURL(url);
              } catch (error) {
                snackbar.push(error instanceof Error ? error.message : 'Snapshot export failed.', 'error');
              }
            }}
          >
            Download CSV snapshot
          </Button>
        </div>
      </div>

      <div className="billing-section">
        <p className="billing-section-title">Ops handoff digest</p>
        {opsDigestQuery.isLoading || !opsDigest ? (
          <p className="billing-section-meta">Generating digest...</p>
        ) : (
          <>
            <p className="billing-section-meta">{opsDigest.digest_text}</p>
            <div>
              <Button
                variant="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(opsDigest.digest_text);
                    snackbar.push('Ops digest copied to clipboard.', 'success');
                  } catch {
                    snackbar.push('Could not copy digest to clipboard.', 'warning');
                  }
                }}
              >
                Copy digest text
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="billing-section">
        <p className="billing-section-title">Platform ops summary (admin)</p>
        <div>
          <Button
            variant="ghost"
            onClick={() => setShowPlatformSummary(true)}
            disabled={platformSummaryQuery.isLoading}
          >
            {platformSummaryQuery.isLoading ? 'Loading summary...' : 'Load platform summary'}
          </Button>
        </div>
        {showPlatformSummary && platformSummaryQuery.error ? (
          <p style={{ margin: 0, color: '#991b1b' }}>
            {platformSummaryQuery.error.message || 'Platform summary is only available to platform admins.'}
          </p>
        ) : null}
        {showPlatformSummary && platformSummaryQuery.data ? (
          <p className="billing-section-meta">
            Tenants: {platformSummaryQuery.data.tenant_count} · Ready: {platformSummaryQuery.data.ready_count} · Not
            ready: {platformSummaryQuery.data.not_ready_count}
          </p>
        ) : null}
      </div>

      {summary?.stuck_retries ? (
        <div className="billing-alert">
          <strong>Retry backlog detected.</strong> {summary.stuck_retries} webhook
          {summary.stuck_retries === 1 ? '' : 's'} missed scheduled retry windows.
        </div>
      ) : null}

      <div className="billing-metric-strip">
        <div className="billing-metric">
          <strong>Total (24h)</strong>
          <p>{summary?.total ?? 0}</p>
        </div>
        <div className="billing-metric">
          <strong>Processed</strong>
          <p>{summary?.processed ?? 0}</p>
        </div>
        <div className="billing-metric">
          <strong>Failed</strong>
          <p>{(summary?.failed ?? 0) + (summary?.dead_letter ?? 0)}</p>
        </div>
        <div className="billing-metric">
          <strong>Failure rate</strong>
          <p>{((summary?.failure_rate ?? 0) * 100).toFixed(1)}%</p>
        </div>
      </div>

      <div className="billing-actions">
        <Button
          variant="primary"
          disabled={checkout.isPending || plansQuery.isLoading || plans.length === 0}
          onClick={() =>
            checkout.mutate(
              { product_code: checkoutProductCode, plan_code: checkoutPlanCode },
              {
                onSuccess: (session) => {
                  if (session.mock_mode) {
                    snackbar.push(
                      `Mock order ${session.order_id} created. Add Razorpay keys to enable live checkout.`,
                      'success',
                    );
                  } else {
                    snackbar.push(`Checkout order ${session.order_id} created.`, 'success');
                  }
                },
                onError: (error) => snackbar.push(error.message, 'error'),
              },
            )
          }
        >
          {checkout.isPending ? 'Creating checkout…' : mockMode ? 'Create mock checkout' : 'Upgrade with Razorpay'}
        </Button>
        <Link to="/pricing">
          <Button variant="ghost">View pricing</Button>
        </Link>
        <div className="billing-actions-ops">
          <Button
            variant="neutral"
            disabled={bulkReprocessWebhook.isPending}
            onClick={() => {
              if (!window.confirm('Reprocess up to 50 failed webhook events now?')) {
                return;
              }
              bulkReprocessWebhook.mutate(
                { scope: 'failed', limit: 50, confirm: true },
                {
                  onSuccess: (result) =>
                    snackbar.push(
                      `Bulk retry completed: ${result.processed}/${result.selected} processed.`,
                      result.failed ? 'warning' : 'success',
                    ),
                  onError: (error) => snackbar.push(error.message, 'error'),
                },
              );
            }}
          >
            Reprocess failed (bulk)
          </Button>
          <Button
            variant="neutral"
            disabled={bulkReprocessWebhook.isPending}
            onClick={() => {
              if (!window.confirm('Reprocess up to 50 dead-letter webhook events now?')) {
                return;
              }
              bulkReprocessWebhook.mutate(
                { scope: 'dead_letter', limit: 50, confirm: true },
                {
                  onSuccess: (result) =>
                    snackbar.push(
                      `Dead-letter retry: ${result.processed}/${result.selected} processed.`,
                      result.failed ? 'warning' : 'success',
                    ),
                  onError: (error) => snackbar.push(error.message, 'error'),
                },
              );
            }}
          >
            Reprocess dead-letter (bulk)
          </Button>
        </div>
      </div>

      {!isConfigured ? (
        <p className="billing-section-meta" style={{ fontSize: 14 }}>
          When your Razorpay account is ready, set <code>RAZORPAY_KEY_ID</code>, <code>RAZORPAY_KEY_SECRET</code>, and{' '}
          <code>RAZORPAY_WEBHOOK_SECRET</code> in the backend environment.
        </p>
      ) : null}

      <div>
        <div className="billing-webhook-toolbar">
          <h3>Recent webhook events</h3>
          <select
            value={eventFilter}
            onChange={(event) => setEventFilter(event.target.value as 'all' | 'failed' | 'dead_letter')}
          >
            <option value="all">All</option>
            <option value="failed">Failed</option>
            <option value="dead_letter">Dead letter</option>
          </select>
        </div>
        {webhookEventsQuery.isLoading ? (
          <p className="billing-section-meta">Loading webhook events…</p>
        ) : (webhookEventsQuery.data ?? []).length === 0 ? (
          <p className="billing-section-meta">No webhook events recorded yet.</p>
        ) : (
          <div className="billing-webhook-list">
            {(webhookEventsQuery.data ?? []).slice(0, 5).map((event) => (
              <div key={event.id} className="billing-webhook-row">
                <div>
                  <strong>{event.event_type}</strong>
                  <p>{event.external_event_id}</p>
                  {typeof event.retry_count === 'number' ? (
                    <p>
                      Retries: {event.retry_count}
                      {event.next_retry_at ? ` · next ${formatTimestamp(event.next_retry_at)}` : ''}
                    </p>
                  ) : null}
                </div>
                <div className="billing-webhook-side">
                  <span
                    className={`billing-chip ${
                      event.status === 'failed' || event.status === 'dead_letter'
                        ? 'billing-chip--warn'
                        : event.status === 'processed'
                          ? 'billing-chip--ok'
                          : 'billing-chip--muted'
                    }`}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {event.status}
                  </span>
                  {event.status === 'failed' || event.status === 'dead_letter' ? (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        reprocessWebhook.mutate(event.id, {
                          onSuccess: (result) => {
                            if (result.reprocessed) {
                              snackbar.push('Webhook event reprocessed successfully.', 'success');
                            } else {
                              snackbar.push(result.error ?? 'Webhook reprocess failed.', 'error');
                            }
                          },
                          onError: (error) => snackbar.push(error.message, 'error'),
                        })
                      }
                    >
                      Reprocess
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
