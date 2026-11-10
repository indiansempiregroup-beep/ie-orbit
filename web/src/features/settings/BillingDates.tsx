import { useTranslation } from 'react-i18next';
import type { BusinessBillingSnapshot } from '@ie-orbit/sdk';
import { formatDate } from '../../lib/datetime';
import { formatPlanDisplayName } from '../../config/products';

type Props = {
  billing: Pick<
    BusinessBillingSnapshot,
    | 'status'
    | 'trial_ends_at'
    | 'current_period_starts_at'
    | 'current_period_ends_at'
    | 'renews_at'
    | 'subscribed_at'
    | 'canceled_at'
    | 'pending_plan_code'
    | 'plan_change_effective_at'
    | 'plan_locked_until'
  >;
  className?: string;
};

export function BillingDates({ billing, className }: Props) {
  const { t } = useTranslation();
  const isTrial = (billing.status || '').toLowerCase().includes('trial');

  const rows: Array<{ label: string; value: string }> = [
    { label: t('settings.productsPage.started'), value: formatDate(billing.subscribed_at) },
    {
      label: isTrial ? t('settings.billingPage.dates.trialEnds') : t('settings.billingPage.dates.trialEnded'),
      value: formatDate(billing.trial_ends_at),
    },
    { label: t('settings.billingPage.dates.periodStart'), value: formatDate(billing.current_period_starts_at) },
    { label: t('settings.billingPage.dates.periodEnd'), value: formatDate(billing.current_period_ends_at) },
    { label: t('settings.billingPage.dates.nextDue'), value: formatDate(billing.renews_at || billing.current_period_ends_at) },
  ];

  if (billing.plan_locked_until) {
    rows.push({ label: t('settings.billingPage.dates.lockedUntil'), value: formatDate(billing.plan_locked_until) });
  }
  if (billing.pending_plan_code) {
    rows.push({ label: t('settings.billingPage.dates.nextPlan'), value: formatPlanDisplayName(undefined, billing.pending_plan_code) });
    rows.push({ label: t('settings.billingPage.dates.nextPlanStarts'), value: formatDate(billing.plan_change_effective_at) });
  }

  if (billing.canceled_at) {
    rows.push({ label: t('settings.billingPage.dates.canceled'), value: formatDate(billing.canceled_at) });
  }

  return (
    <div className={className} style={{ display: 'grid', gap: 8 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 8,
          padding: 12,
          borderRadius: 12,
          background: 'color-mix(in srgb, var(--muted) 40%, transparent)',
          border: '1px solid var(--border)',
        }}
      >
        {rows.map((row) => (
          <div key={row.label}>
            <div style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>
              {row.label}
            </div>
            <strong style={{ fontSize: 14 }}>{row.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
