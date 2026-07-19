import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useSnackbar } from '../../hooks/useSnackbar';
import { formatTimestamp } from '../../lib/datetime';
import {
  ACTIVE_BUSINESS_STORAGE_KEY,
  ACTIVE_TENANT_STORAGE_KEY,
} from '../../contexts/WorkspaceContext';
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
} from './billingHooks';

export function BillingPlanFoundation() {
  const [eventFilter, setEventFilter] = useState<'all' | 'failed' | 'dead_letter'>('all');
  const [selectedPlanCode, setSelectedPlanCode] = useState('appointie-starter');
  const [showPlatformSummary, setShowPlatformSummary] = useState(false);
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

  return (
    <Card>
      <p className="public-kicker">Billing foundation</p>
      <h2 style={{ margin: '8px 0' }}>Razorpay checkout</h2>
      <p style={{ color: 'var(--muted-foreground)', marginTop: 0 }}>
        {isConfigured
          ? 'Payments are configured. You can start a Razorpay checkout for the selected plan.'
          : 'Razorpay is not configured yet. Checkout runs in mock mode until you add API keys.'}
      </p>

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <p style={{ margin: 0 }}>
          <strong>Launch Ready:</strong>{' '}
          {launchReady ? (
            <span style={{ color: '#166534' }}>Yes</span>
          ) : (
            <span style={{ color: '#991b1b' }}>No</span>
          )}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Provider:</strong> {status?.provider ?? 'razorpay'}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Currency:</strong> {status?.currency ?? 'INR'}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Mode:</strong> {mockMode ? 'Mock (no live charges)' : 'Live'}
        </p>
      </div>

      <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
        <strong>Plan catalog:</strong>
        {plansQuery.isLoading ? (
          <p style={{ margin: '8px 0 0', color: 'var(--muted-foreground)' }}>Loading plans...</p>
        ) : plans.length === 0 ? (
          <p style={{ margin: '8px 0 0', color: 'var(--muted-foreground)' }}>No billable plans configured.</p>
        ) : (
          <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
            <select
              value={selectedPlan?.plan_code ?? selectedPlanCode}
              onChange={(event) => setSelectedPlanCode(event.target.value)}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
            >
              {plans.map((plan) => (
                <option key={plan.plan_code} value={plan.plan_code}>
                  {plan.name} ({plan.currency} {((plan.amount_paise ?? 0) / 100).toFixed(2)})
                </option>
              ))}
            </select>
            {selectedPlan ? (
              <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 14 }}>
                {selectedPlan.description} · Trial {selectedPlan.trial_days} days · {selectedPlan.billing_interval}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
        <strong>Go-live readiness:</strong>{' '}
        {goLive?.ready ? (
          <span style={{ color: '#166534' }}>Ready</span>
        ) : (
          <span style={{ color: '#991b1b' }}>Not ready</span>
        )}
        {!goLiveQuery.isLoading && goLive ? (
          <p style={{ margin: '8px 0 0', color: 'var(--muted-foreground)' }}>
            Blockers: {goLive.blockers.length} · Warnings: {goLive.warnings.length}
          </p>
        ) : null}
      </div>

      <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
        <strong>Release gate preflight:</strong>{' '}
        {releaseGate?.passed ? (
          <span style={{ color: '#166534' }}>Pass</span>
        ) : (
          <span style={{ color: '#991b1b' }}>Fail</span>
        )}
        {!releaseGateQuery.isLoading && releaseGate ? (
          <div style={{ marginTop: 8 }}>
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
              Blockers: {releaseGate.blockers.length} · Warnings: {releaseGate.warnings.length}
            </p>
            {releaseGate.failing_checks.length > 0 ? (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {releaseGate.failing_checks.slice(0, 3).map((check) => (
                  <li key={check.id} style={{ marginBottom: 6, color: 'var(--muted-foreground)' }}>
                    <strong>{check.label}:</strong> {check.remediation}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
        <strong>Operational signals (24h):</strong>
        {observabilityQuery.isLoading || !observability ? (
          <p style={{ margin: '8px 0 0', color: 'var(--muted-foreground)' }}>Loading signals...</p>
        ) : (
          <p style={{ margin: '8px 0 0', color: 'var(--muted-foreground)' }}>
            Failed events: {observability.events.billing_webhook_failed} · Dead-letter events:{' '}
            {observability.events.billing_webhook_dead_letter} · Onboarding provisions:{' '}
            {observability.events.onboarding_workspace_provisioned} · Reconciliation runs:{' '}
            {observability.audits.reconciliation_runs}
          </p>
        )}
      </div>

      <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
        <strong>Ops snapshot export:</strong>
        {!opsSnapshotQuery.isLoading && opsSnapshot ? (
          <p style={{ margin: '8px 0 0', color: 'var(--muted-foreground)' }}>
            Generated {formatTimestamp(opsSnapshot.generated_at)} · Ready:{' '}
            {opsSnapshot.ready ? 'yes' : 'no'} · Health score: {opsSnapshot.health_score}/100
          </p>
        ) : (
          <p style={{ margin: '8px 0 0', color: 'var(--muted-foreground)' }}>Preparing snapshot...</p>
        )}
        {opsSnapshot && opsSnapshot.recommendations.length > 0 ? (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--muted-foreground)' }}>
            {opsSnapshot.recommendations.slice(0, 3).map((item, index) => (
              <li key={`${item.severity}-${index}`}>
                [{item.severity}] {item.action}
              </li>
            ))}
          </ul>
        ) : null}
        {opsSnapshot ? (
          <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
            <p style={{ margin: 0, color: trendDirectionColor, fontWeight: 600 }}>
              Trend vs previous {opsSnapshot.trend.comparison_window_hours}h:{' '}
              {opsSnapshot.trend.direction === 'improving' ? '↘ Improving' : '↗ Degrading'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  padding: '4px 8px',
                  borderRadius: 999,
                  fontSize: 12,
                  border: '1px solid var(--border)',
                  color: failureDelta <= 0 ? '#166534' : '#991b1b',
                  background: failureDelta <= 0 ? '#ecfdf5' : '#fef2f2',
                }}
              >
                Failure rate {failureDelta <= 0 ? '↓' : '↑'} {(failureDelta * 100).toFixed(2)}%
              </span>
              <span
                style={{
                  padding: '4px 8px',
                  borderRadius: 999,
                  fontSize: 12,
                  border: '1px solid var(--border)',
                  color: deadLetterDelta <= 0 ? '#166534' : '#991b1b',
                  background: deadLetterDelta <= 0 ? '#ecfdf5' : '#fef2f2',
                }}
              >
                Dead-letter {deadLetterDelta <= 0 ? '↓' : '↑'} {deadLetterDelta >= 0 ? '+' : ''}
                {deadLetterDelta}
              </span>
              <span
                style={{
                  padding: '4px 8px',
                  borderRadius: 999,
                  fontSize: 12,
                  border: '1px solid var(--border)',
                  color: stuckRetryDelta <= 0 ? '#166534' : '#991b1b',
                  background: stuckRetryDelta <= 0 ? '#ecfdf5' : '#fef2f2',
                }}
              >
                Stuck retries {stuckRetryDelta <= 0 ? '↓' : '↑'} {stuckRetryDelta >= 0 ? '+' : ''}
                {stuckRetryDelta}
              </span>
            </div>
          </div>
        ) : null}
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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

      <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
        <strong>Ops handoff digest:</strong>
        {opsDigestQuery.isLoading || !opsDigest ? (
          <p style={{ margin: '8px 0 0', color: 'var(--muted-foreground)' }}>Generating digest...</p>
        ) : (
          <>
            <p style={{ margin: '8px 0 0', color: 'var(--muted-foreground)' }}>{opsDigest.digest_text}</p>
            <div style={{ marginTop: 8 }}>
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

      <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
        <strong>Platform ops summary (admin):</strong>
        <div style={{ marginTop: 8 }}>
          <Button
            variant="ghost"
            onClick={() => setShowPlatformSummary(true)}
            disabled={platformSummaryQuery.isLoading}
          >
            {platformSummaryQuery.isLoading ? 'Loading summary...' : 'Load platform summary'}
          </Button>
        </div>
        {showPlatformSummary && platformSummaryQuery.error ? (
          <p style={{ margin: '8px 0 0', color: '#991b1b' }}>
            {platformSummaryQuery.error.message || 'Platform summary is only available to platform admins.'}
          </p>
        ) : null}
        {showPlatformSummary && platformSummaryQuery.data ? (
          <p style={{ margin: '8px 0 0', color: 'var(--muted-foreground)' }}>
            Tenants: {platformSummaryQuery.data.tenant_count} · Ready: {platformSummaryQuery.data.ready_count} ·
            Not ready: {platformSummaryQuery.data.not_ready_count}
          </p>
        ) : null}
      </div>

      {summary?.stuck_retries ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#991b1b',
          }}
        >
          <strong>Retry backlog detected.</strong> {summary.stuck_retries} webhook
          {summary.stuck_retries === 1 ? '' : 's'} missed scheduled retry windows.
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
          <strong>Total (24h)</strong>
          <p style={{ margin: '4px 0 0' }}>{summary?.total ?? 0}</p>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
          <strong>Processed</strong>
          <p style={{ margin: '4px 0 0' }}>{summary?.processed ?? 0}</p>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
          <strong>Failed</strong>
          <p style={{ margin: '4px 0 0' }}>{(summary?.failed ?? 0) + (summary?.dead_letter ?? 0)}</p>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
          <strong>Failure rate</strong>
          <p style={{ margin: '4px 0 0' }}>{((summary?.failure_rate ?? 0) * 100).toFixed(1)}%</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
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

      {!isConfigured ? (
        <p style={{ marginTop: 16, color: 'var(--muted-foreground)', fontSize: 14 }}>
          When your Razorpay account is ready, set <code>RAZORPAY_KEY_ID</code>,{' '}
          <code>RAZORPAY_KEY_SECRET</code>, and <code>RAZORPAY_WEBHOOK_SECRET</code> in the backend environment.
        </p>
      ) : null}

      <div style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h3 style={{ marginBottom: 8 }}>Recent webhook events</h3>
          <select
            value={eventFilter}
            onChange={(event) => setEventFilter(event.target.value as 'all' | 'failed' | 'dead_letter')}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
          >
            <option value="all">All</option>
            <option value="failed">Failed</option>
            <option value="dead_letter">Dead letter</option>
          </select>
        </div>
        {webhookEventsQuery.isLoading ? (
          <p style={{ color: 'var(--muted-foreground)' }}>Loading webhook events…</p>
        ) : (webhookEventsQuery.data ?? []).length === 0 ? (
          <p style={{ color: 'var(--muted-foreground)' }}>No webhook events recorded yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {(webhookEventsQuery.data ?? []).slice(0, 5).map((event) => (
              <div
                key={event.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <strong>{event.event_type}</strong>
                  <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>{event.external_event_id}</p>
                  {typeof event.retry_count === 'number' ? (
                    <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
                      Retries: {event.retry_count}
                      {event.next_retry_at ? ` · next ${formatTimestamp(event.next_retry_at)}` : ''}
                    </p>
                  ) : null}
                </div>
                <div style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>
                  <span style={{ textTransform: 'capitalize' }}>{event.status}</span>
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
