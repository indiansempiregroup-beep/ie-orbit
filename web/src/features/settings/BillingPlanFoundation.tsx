import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { allowedExtraCount, formatPlanDisplayName, formatSaasFromMinor, starterAddonCapHint } from '../../config/products';
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
  const { t } = useTranslation();
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
  const billingRegion = status?.billing_region ?? 'IN';
  const saasCurrency = status?.currency ?? 'INR';
  const isIntlBilling = billingRegion === 'INTL';
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
        <p className="public-kicker">{t('settings.billingPage.kicker')}</p>
        <h2 style={{ margin: 0 }}>{t('settings.billingPage.title')}</h2>
        {billing ? (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <div className="billing-foundation-chips">
              <span className="billing-chip billing-chip--ok">{t('settings.billingPage.planChip', { plan: formatPlanDisplayName(undefined, billing.plan_code) })}</span>
              <span className="billing-chip billing-chip--muted" style={{ textTransform: 'capitalize' }}>
                {t(`settings.billingPage.billingStatus.${billing.status}`, { defaultValue: billing.status.replace('_', ' ') })}
              </span>
              <span className="billing-chip billing-chip--muted">
                {billing.billing_interval === 'yearly'
                  ? t('settings.productsPage.intervalYearly')
                  : billing.billing_interval === 'monthly'
                    ? t('settings.productsPage.intervalMonthly')
                    : billing.billing_interval}
              </span>
              {billing.soft_locked ? (
                <span className="billing-chip billing-chip--warn">{t('settings.billingPage.softLocked')}</span>
              ) : null}
              {billing.plan_locked_until ? (
                <span className="billing-chip billing-chip--muted">
                  {t('settings.billingPage.lockedUntilPeriodEnd')}
                </span>
              ) : null}
              {billing.pending_plan_code ? (
                <span className="billing-chip billing-chip--warn">
                  {t('settings.billingPage.nextChip', { plan: formatPlanDisplayName(undefined, billing.pending_plan_code) })}
                </span>
              ) : null}
            </div>
            <BillingDates billing={billing} />
            {billing.pending_plan_code ? (
              <p className="billing-section-meta" style={{ margin: 0 }}>
                {t('settings.billingPage.downgradeNote', { plan: formatPlanDisplayName(undefined, billing.plan_code) })}
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
                              snackbar.push(t('settings.billingPage.pendingCancelled'), 'success');
                            },
                            onError: () => snackbar.push(t('settings.billingPage.pendingCancelFailed'), 'error'),
                          },
                        );
                      }}
                    >
                      {cancelPendingPlan.isPending ? t('settings.billingPage.canceling') : t('settings.billingPage.cancelPendingChange')}
                    </Button>
                  </>
                ) : null}
              </p>
            ) : (
              <p className="billing-section-meta" style={{ margin: 0 }}>
                {t('settings.billingPage.renewNote')}
              </p>
            )}
            <p className="billing-section-meta" style={{ margin: 0 }}>
              {t('settings.billingPage.usageLine', {
                usedStaff: billing.used_staff,
                maxStaff: billing.effective_max_staff,
                usedOffices: billing.used_offices,
                maxOffices: billing.effective_max_branches,
                total: (billing.pricing.total_amount_paise / 100).toFixed(0),
                per: billing.billing_interval === 'yearly' ? t('settings.productsPage.perYear') : t('settings.productsPage.perMonth'),
              })}
            </p>
            <p className="billing-section-meta" style={{ margin: 0 }}>
              {t('settings.billingPage.addonsLine', {
                staff: billing.included_staff,
                offices: billing.included_offices,
                extraStaff: billing.extra_staff,
                staffUnit: (billing.pricing.addon_staff_unit_paise / 100).toFixed(0),
                extraOffices: billing.extra_offices,
                officeUnit: (billing.pricing.addon_office_unit_paise / 100).toFixed(0),
              })}
              {checkoutProductCode === 'shopie'
                ? ` · ${t('settings.billingPage.petsLine', {
                    state: billing.pets_pack_enabled ? t('settings.billingPage.stateOn') : t('settings.billingPage.stateOff'),
                    price: ((billing.pricing.addon_pets_unit_paise ?? 50000) / 100).toFixed(0),
                  })}`
                : ''}
            </p>
            {starterAddonCapHint(billing.max_extra_staff, billing.max_extra_offices) ? (
              <p className="billing-section-meta" style={{ margin: 0 }}>
                {starterAddonCapHint(billing.max_extra_staff, billing.max_extra_offices)}
              </p>
            ) : null}
            <div className="billing-addons-row">
              <label>
                {t('settings.billingPage.extraStaff')}
                <input
                  type="number"
                  min={0}
                  max={allowedExtraCount(billing.max_extra_staff, billing.extra_staff) ?? undefined}
                  value={extraStaff}
                  onChange={(event) => {
                    const next = Number(event.target.value) || 0;
                    const cap = allowedExtraCount(billing.max_extra_staff, billing.extra_staff);
                    setExtraStaff(cap == null ? next : Math.min(next, cap));
                  }}
                />
              </label>
              <label>
                {t('settings.billingPage.extraOffices')}
                <input
                  type="number"
                  min={0}
                  max={allowedExtraCount(billing.max_extra_offices, billing.extra_offices) ?? undefined}
                  value={extraOffices}
                  onChange={(event) => {
                    const next = Number(event.target.value) || 0;
                    const cap = allowedExtraCount(billing.max_extra_offices, billing.extra_offices);
                    setExtraOffices(cap == null ? next : Math.min(next, cap));
                  }}
                />
              </label>
              {checkoutProductCode === 'shopie' ? (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={petsPackEnabled}
                    onChange={(event) => setPetsPackEnabled(event.target.checked)}
                  />
                  {t('settings.billingPage.petsPack', { price: ((billing.pricing.addon_pets_unit_paise ?? 50000) / 100).toFixed(0) })}
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
                      onSuccess: () => snackbar.push(t('settings.billingPage.addonsUpdated'), 'success'),
                      onError: (error) =>
                        snackbar.push(
                          getApiErrorMessage(error, t('settings.billingPage.addonsFailed')),
                          'error',
                        ),
                    },
                  );
                }}
              >
                {updateAddons.isPending ? t('settings.billingPage.updating') : t('settings.billingPage.updateAddons')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="billing-section-meta">{t('settings.billingPage.loadingEntitlements')}</p>
        )}
        <h2 style={{ margin: '20px 0 0' }}>{t('settings.billingPage.checkoutTitle')}</h2>
        <p className="billing-section-meta">
          {isIntlBilling
            ? isConfigured
              ? t('settings.billingPage.checkoutIntlConfigured')
              : t('settings.billingPage.checkoutIntlMock')
            : isConfigured
              ? t('settings.billingPage.checkoutInConfigured')
              : t('settings.billingPage.checkoutInMock')}
        </p>
        <div className="billing-foundation-chips">
          <span className={`billing-chip ${launchReady ? 'billing-chip--ok' : 'billing-chip--warn'}`}>
            {t('settings.billingPage.chipLaunchReady', { value: launchReady ? t('common.yes') : t('common.no') })}
          </span>
          <span className="billing-chip billing-chip--muted">{t('settings.billingPage.chipRegion', { value: billingRegion })}</span>
          <span className="billing-chip billing-chip--muted">
            {t('settings.billingPage.chipProvider', { value: status?.provider ?? (isIntlBilling ? 'stripe' : 'razorpay') })}
          </span>
          <span className="billing-chip billing-chip--muted">{t('settings.billingPage.chipSaasCurrency', { value: saasCurrency })}</span>
          <span className={`billing-chip ${mockMode ? 'billing-chip--muted' : 'billing-chip--ok'}`}>
            {t('settings.billingPage.chipMode', { value: mockMode ? t('settings.billingPage.modeMock') : t('settings.billingPage.modeLive') })}
          </span>
        </div>
      </div>

      <div className="billing-section">
        <p className="billing-section-title">{t('settings.billingPage.catalogTitle')}</p>
        <p className="billing-section-meta">
          {t('settings.billingPage.catalogMeta')}
        </p>
        {plansQuery.isLoading ? (
          <p className="billing-section-meta">{t('settings.billingPage.loadingPlans')}</p>
        ) : plans.length === 0 ? (
          <p className="billing-section-meta">{t('settings.billingPage.noPlans')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <select
              value={selectedPlan?.plan_code ?? selectedPlanCode}
              onChange={(event) => setSelectedPlanCode(event.target.value)}
            >
              {plans.map((plan) => (
                <option key={plan.plan_code} value={plan.plan_code}>
                  {formatPlanDisplayName(plan.name, plan.plan_code)} (
                  {formatSaasFromMinor(plan.amount_paise, saasCurrency) ?? '—'})
                </option>
              ))}
            </select>
            {selectedPlan ? (
              <p className="billing-section-meta">
                {t('settings.billingPage.planDetails', {
                  description: selectedPlan.description,
                  days: selectedPlan.trial_days,
                  interval:
                    selectedPlan.billing_interval === 'yearly'
                      ? t('settings.productsPage.intervalYearly')
                      : selectedPlan.billing_interval === 'monthly'
                        ? t('settings.productsPage.intervalMonthly')
                        : selectedPlan.billing_interval,
                })}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className="billing-section">
        <p className="billing-section-title">
          {t('settings.billingPage.goLiveTitle')}{' '}
          {goLive?.ready ? (
            <span style={{ color: '#166534' }}>{t('settings.billingPage.ready')}</span>
          ) : (
            <span style={{ color: '#991b1b' }}>{t('settings.billingPage.notReady')}</span>
          )}
        </p>
        {!goLiveQuery.isLoading && goLive ? (
          <p className="billing-section-meta">
            {t('settings.billingPage.blockersWarnings', { blockers: goLive.blockers.length, warnings: goLive.warnings.length })}
          </p>
        ) : null}
      </div>

      <div className="billing-section">
        <p className="billing-section-title">
          {t('settings.billingPage.releaseGateTitle')}{' '}
          {releaseGate?.passed ? (
            <span style={{ color: '#166534' }}>{t('settings.billingPage.pass')}</span>
          ) : (
            <span style={{ color: '#991b1b' }}>{t('settings.billingPage.fail')}</span>
          )}
        </p>
        {!releaseGateQuery.isLoading && releaseGate ? (
          <div>
            <p className="billing-section-meta">
              {t('settings.billingPage.blockersWarnings', { blockers: releaseGate.blockers.length, warnings: releaseGate.warnings.length })}
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
        <p className="billing-section-title">{t('settings.billingPage.signalsTitle')}</p>
        {observabilityQuery.isLoading || !observability ? (
          <p className="billing-section-meta">{t('settings.billingPage.loadingSignals')}</p>
        ) : (
          <p className="billing-section-meta">
            {t('settings.billingPage.signalsLine', {
              failed: observability.events.billing_webhook_failed,
              deadLetter: observability.events.billing_webhook_dead_letter,
              onboarding: observability.events.onboarding_workspace_provisioned,
              reconciliation: observability.audits.reconciliation_runs,
            })}
          </p>
        )}
      </div>

      <div className="billing-section">
        <p className="billing-section-title">{t('settings.billingPage.snapshotTitle')}</p>
        {!opsSnapshotQuery.isLoading && opsSnapshot ? (
          <p className="billing-section-meta">
            {t('settings.billingPage.snapshotMeta', {
              time: formatTimestamp(opsSnapshot.generated_at),
              ready: opsSnapshot.ready ? t('common.yes') : t('common.no'),
              score: opsSnapshot.health_score,
            })}
          </p>
        ) : (
          <p className="billing-section-meta">{t('settings.billingPage.preparingSnapshot')}</p>
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
              {t('settings.billingPage.trendLine', {
                hours: opsSnapshot.trend.comparison_window_hours,
                direction: opsSnapshot.trend.direction === 'improving' ? t('settings.billingPage.trendImproving') : t('settings.billingPage.trendDegrading'),
              })}
            </p>
            <div className="billing-trend-chips">
              <span className={`billing-trend-chip ${failureDelta <= 0 ? 'billing-trend-chip--down' : 'billing-trend-chip--up'}`}>
                {t('settings.billingPage.trendFailureRate', { arrow: failureDelta <= 0 ? '↓' : '↑', value: (failureDelta * 100).toFixed(2) })}
              </span>
              <span
                className={`billing-trend-chip ${deadLetterDelta <= 0 ? 'billing-trend-chip--down' : 'billing-trend-chip--up'}`}
              >
                {t('settings.billingPage.trendDeadLetter', {
                  arrow: deadLetterDelta <= 0 ? '↓' : '↑',
                  value: `${deadLetterDelta >= 0 ? '+' : ''}${deadLetterDelta}`,
                })}
              </span>
              <span
                className={`billing-trend-chip ${stuckRetryDelta <= 0 ? 'billing-trend-chip--down' : 'billing-trend-chip--up'}`}
              >
                {t('settings.billingPage.trendStuckRetries', {
                  arrow: stuckRetryDelta <= 0 ? '↓' : '↑',
                  value: `${stuckRetryDelta >= 0 ? '+' : ''}${stuckRetryDelta}`,
                })}
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
            {t('settings.billingPage.downloadJson')}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                const accessToken =
                  sessionStorage.getItem('ie:auth:access') ?? localStorage.getItem('ie:auth:access');
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
                  throw new Error(t('settings.billingPage.exportFailed'));
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
                snackbar.push(error instanceof Error ? error.message : t('settings.billingPage.exportFailed'), 'error');
              }
            }}
          >
            {t('settings.billingPage.downloadCsv')}
          </Button>
        </div>
      </div>

      <div className="billing-section">
        <p className="billing-section-title">{t('settings.billingPage.digestTitle')}</p>
        {opsDigestQuery.isLoading || !opsDigest ? (
          <p className="billing-section-meta">{t('settings.billingPage.generatingDigest')}</p>
        ) : (
          <>
            <p className="billing-section-meta">{opsDigest.digest_text}</p>
            <div>
              <Button
                variant="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(opsDigest.digest_text);
                    snackbar.push(t('settings.billingPage.digestCopied'), 'success');
                  } catch {
                    snackbar.push(t('settings.billingPage.digestCopyFailed'), 'warning');
                  }
                }}
              >
                {t('settings.billingPage.copyDigest')}
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="billing-section">
        <p className="billing-section-title">{t('settings.billingPage.platformSummaryTitle')}</p>
        <div>
          <Button
            variant="ghost"
            onClick={() => setShowPlatformSummary(true)}
            disabled={platformSummaryQuery.isLoading}
          >
            {platformSummaryQuery.isLoading ? t('settings.billingPage.loadingSummary') : t('settings.billingPage.loadPlatformSummary')}
          </Button>
        </div>
        {showPlatformSummary && platformSummaryQuery.error ? (
          <p style={{ margin: 0, color: '#991b1b' }}>
            {platformSummaryQuery.error.message || t('settings.billingPage.platformAdminsOnly')}
          </p>
        ) : null}
        {showPlatformSummary && platformSummaryQuery.data ? (
          <p className="billing-section-meta">
            {t('settings.billingPage.platformSummaryLine', {
              tenants: platformSummaryQuery.data.tenant_count,
              ready: platformSummaryQuery.data.ready_count,
              notReady: platformSummaryQuery.data.not_ready_count,
            })}
          </p>
        ) : null}
      </div>

      {summary?.stuck_retries ? (
        <div className="billing-alert">
          <strong>{t('settings.billingPage.retryBacklog')}</strong>{' '}
          {t('settings.billingPage.retryBacklogBody', { count: summary.stuck_retries })}
        </div>
      ) : null}

      <div className="billing-metric-strip">
        <div className="billing-metric">
          <strong>{t('settings.billingPage.metricTotal')}</strong>
          <p>{summary?.total ?? 0}</p>
        </div>
        <div className="billing-metric">
          <strong>{t('settings.billingPage.metricProcessed')}</strong>
          <p>{summary?.processed ?? 0}</p>
        </div>
        <div className="billing-metric">
          <strong>{t('settings.billingPage.metricFailed')}</strong>
          <p>{(summary?.failed ?? 0) + (summary?.dead_letter ?? 0)}</p>
        </div>
        <div className="billing-metric">
          <strong>{t('settings.billingPage.metricFailureRate')}</strong>
          <p>{((summary?.failure_rate ?? 0) * 100).toFixed(1)}%</p>
        </div>
      </div>

      <div className="billing-actions">
        {isIntlBilling ? (
          <Button
            variant="primary"
            disabled={checkout.isPending || plansQuery.isLoading || plans.length === 0}
            onClick={() =>
              checkout.mutate(
                { product_code: checkoutProductCode, plan_code: checkoutPlanCode, provider: 'stripe' },
                {
                  onSuccess: (session) => {
                    if (session.mock_mode) {
                      snackbar.push(
                        t('settings.billingPage.toastMockStripe', { id: session.order_id }),
                        'success',
                      );
                      return;
                    }
                    if (session.checkout_url) {
                      const opened = window.open(session.checkout_url, '_blank', 'noopener,noreferrer');
                      if (!opened) window.location.assign(session.checkout_url);
                      return;
                    }
                    snackbar.push(t('settings.billingPage.toastStripeSession', { id: session.order_id }), 'success');
                  },
                  onError: (error) => snackbar.push(error.message, 'error'),
                },
              )
            }
          >
            {checkout.isPending ? t('settings.billingPage.creatingCheckout') : mockMode ? t('settings.billingPage.mockStripeCheckout') : t('settings.billingPage.stripeCheckout')}
          </Button>
        ) : (
          <>
            <Button
              variant="primary"
              disabled={checkout.isPending || plansQuery.isLoading || plans.length === 0}
              onClick={() =>
                checkout.mutate(
                  { product_code: checkoutProductCode, plan_code: checkoutPlanCode, provider: 'razorpay' },
                  {
                    onSuccess: (session) => {
                      if (session.mock_mode) {
                        snackbar.push(
                          t('settings.billingPage.toastMockOrder', { id: session.order_id }),
                          'success',
                        );
                      } else {
                        snackbar.push(t('settings.billingPage.toastRazorpayOrder', { id: session.order_id }), 'success');
                      }
                    },
                    onError: (error) => snackbar.push(error.message, 'error'),
                  },
                )
              }
            >
              {checkout.isPending ? t('settings.billingPage.creatingCheckout') : mockMode ? t('settings.billingPage.mockCheckout') : t('settings.billingPage.upgradeRazorpay')}
            </Button>
            {status?.cashfree?.configured ? (
              <Button
                variant="neutral"
                disabled={checkout.isPending || plansQuery.isLoading || plans.length === 0}
                onClick={() =>
                  checkout.mutate(
                    { product_code: checkoutProductCode, plan_code: checkoutPlanCode, provider: 'cashfree' },
                    {
                      onSuccess: async (session) => {
                        if (session.mock_mode) {
                          snackbar.push(t('settings.billingPage.toastMockCashfree', { id: session.order_id }), 'success');
                          return;
                        }
                        snackbar.push(t('settings.billingPage.toastCashfreeOrder', { id: session.order_id }), 'success');
                        if (!session.payment_session_id) return;
                        await new Promise<void>((resolve, reject) => {
                          if (window.Cashfree) {
                            resolve();
                            return;
                          }
                          const script = document.createElement('script');
                          script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
                          script.onload = () => resolve();
                          script.onerror = () => reject(new Error(t('settings.billingPage.cashfreeLoadFailed')));
                          document.body.appendChild(script);
                        });
                        const cashfree = (
                          window as unknown as {
                            Cashfree?: (options: { mode: string }) => {
                              checkout: (options: Record<string, unknown>) => Promise<unknown>;
                            };
                          }
                        ).Cashfree?.({
                          mode: session.env === 'production' ? 'production' : 'sandbox',
                        });
                        await cashfree?.checkout({
                          paymentSessionId: session.payment_session_id,
                          redirectTarget: '_modal',
                        });
                      },
                      onError: (error) => snackbar.push(error.message, 'error'),
                    },
                  )
                }
              >
                {t('settings.billingPage.upgradeCashfree')}
              </Button>
            ) : null}
          </>
        )}
        <Link to="/pricing">
          <Button variant="ghost">{t('settings.billingPage.viewPricing')}</Button>
        </Link>
        <div className="billing-actions-ops">
          <Button
            variant="neutral"
            disabled={bulkReprocessWebhook.isPending}
            onClick={() => {
              if (!window.confirm(t('settings.billingPage.confirmBulkFailed'))) {
                return;
              }
              bulkReprocessWebhook.mutate(
                { scope: 'failed', limit: 50, confirm: true },
                {
                  onSuccess: (result) =>
                    snackbar.push(
                      t('settings.billingPage.bulkRetryDone', { processed: result.processed, selected: result.selected }),
                      result.failed ? 'warning' : 'success',
                    ),
                  onError: (error) => snackbar.push(error.message, 'error'),
                },
              );
            }}
          >
            {t('settings.billingPage.reprocessFailedBulk')}
          </Button>
          <Button
            variant="neutral"
            disabled={bulkReprocessWebhook.isPending}
            onClick={() => {
              if (!window.confirm(t('settings.billingPage.confirmBulkDead'))) {
                return;
              }
              bulkReprocessWebhook.mutate(
                { scope: 'dead_letter', limit: 50, confirm: true },
                {
                  onSuccess: (result) =>
                    snackbar.push(
                      t('settings.billingPage.deadRetryDone', { processed: result.processed, selected: result.selected }),
                      result.failed ? 'warning' : 'success',
                    ),
                  onError: (error) => snackbar.push(error.message, 'error'),
                },
              );
            }}
          >
            {t('settings.billingPage.reprocessDeadBulk')}
          </Button>
        </div>
      </div>

      {!isConfigured ? (
        <p className="billing-section-meta" style={{ fontSize: 14 }}>
          <Trans i18nKey="settings.billingPage.envNote" components={{ code: <code /> }} />
        </p>
      ) : null}

      <div>
        <div className="billing-webhook-toolbar">
          <h3>{t('settings.billingPage.webhookEventsTitle')}</h3>
          <select
            value={eventFilter}
            onChange={(event) => setEventFilter(event.target.value as 'all' | 'failed' | 'dead_letter')}
          >
            <option value="all">{t('common.all')}</option>
            <option value="failed">{t('settings.billingPage.filterFailed')}</option>
            <option value="dead_letter">{t('settings.billingPage.filterDeadLetter')}</option>
          </select>
        </div>
        {webhookEventsQuery.isLoading ? (
          <p className="billing-section-meta">{t('settings.billingPage.loadingEvents')}</p>
        ) : (webhookEventsQuery.data ?? []).length === 0 ? (
          <p className="billing-section-meta">{t('settings.billingPage.noEvents')}</p>
        ) : (
          <div className="billing-webhook-list">
            {(webhookEventsQuery.data ?? []).slice(0, 5).map((event) => (
              <div key={event.id} className="billing-webhook-row">
                <div>
                  <strong>{event.event_type}</strong>
                  <p>{event.external_event_id}</p>
                  {typeof event.retry_count === 'number' ? (
                    <p>
                      {event.next_retry_at
                        ? t('settings.billingPage.retriesNext', { count: event.retry_count, time: formatTimestamp(event.next_retry_at) })
                        : t('settings.billingPage.retries', { count: event.retry_count })}
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
                    {t(`settings.billingPage.eventStatus.${event.status}`, { defaultValue: event.status })}
                  </span>
                  {event.status === 'failed' || event.status === 'dead_letter' ? (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        reprocessWebhook.mutate(event.id, {
                          onSuccess: (result) => {
                            if (result.reprocessed) {
                              snackbar.push(t('settings.billingPage.webhookReprocessed'), 'success');
                            } else {
                              snackbar.push(result.error ?? t('settings.billingPage.webhookReprocessFailed'), 'error');
                            }
                          },
                          onError: (error) => snackbar.push(error.message, 'error'),
                        })
                      }
                    >
                      {t('settings.billingPage.reprocess')}
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
