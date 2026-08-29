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
  const isTrial = (billing.status || '').toLowerCase().includes('trial');

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Started', value: formatDate(billing.subscribed_at) },
    {
      label: isTrial ? 'Trial ends' : 'Trial ended',
      value: formatDate(billing.trial_ends_at),
    },
    { label: 'Period start', value: formatDate(billing.current_period_starts_at) },
    { label: 'Period end', value: formatDate(billing.current_period_ends_at) },
    { label: 'Renews on', value: formatDate(billing.renews_at) },
  ];

  if (billing.plan_locked_until) {
    rows.push({ label: 'Current plan locked until', value: formatDate(billing.plan_locked_until) });
  }
  if (billing.pending_plan_code) {
    rows.push({ label: 'Next plan', value: formatPlanDisplayName(undefined, billing.pending_plan_code) });
    rows.push({ label: 'Next plan starts', value: formatDate(billing.plan_change_effective_at) });
  }

  if (billing.canceled_at) {
    rows.push({ label: 'Canceled', value: formatDate(billing.canceled_at) });
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
