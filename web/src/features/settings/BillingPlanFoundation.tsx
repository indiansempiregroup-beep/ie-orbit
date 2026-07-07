import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useSnackbar } from '../../hooks/useSnackbar';
import {
  useBillingCheckout,
  useBillingGoLiveCheckQuery,
  useBillingReleaseGateQuery,
  useBillingStatusQuery,
  useBillingWebhookBulkReprocess,
  useBillingWebhookEventsQuery,
  useBillingWebhookReprocess,
  useBillingWebhookSummaryQuery,
} from './billingHooks';

export function BillingPlanFoundation() {
  const [eventFilter, setEventFilter] = useState<'all' | 'failed' | 'dead_letter'>('all');
  const statusQuery = useBillingStatusQuery();
  const goLiveQuery = useBillingGoLiveCheckQuery();
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
  const goLive = goLiveQuery.data;
  const releaseGate = releaseGateQuery.data;
  const summary = summaryQuery.data;
  const isConfigured = status?.configured ?? false;
  const mockMode = status?.mock_mode ?? true;
  const launchReady = Boolean(goLive?.ready && releaseGate?.passed);

  return (
    <Card>
      <p className="public-kicker">Billing foundation</p>
      <h2 style={{ margin: '8px 0' }}>Razorpay checkout</h2>
      <p style={{ color: 'var(--muted-foreground)', marginTop: 0 }}>
        {isConfigured
          ? 'Payments are configured. You can start a Razorpay checkout for AppointIE Starter.'
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
          disabled={checkout.isPending}
          onClick={() =>
            checkout.mutate(
              { product_code: 'appointie', plan_code: 'appointie-starter' },
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
                      {event.next_retry_at ? ` · next ${new Date(event.next_retry_at).toLocaleString()}` : ''}
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
