import { Link } from 'react-router-dom';
import { Banknote, CreditCard, IndianRupee, RefreshCw, TimerReset } from 'lucide-react';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatTimestamp } from '../../lib/datetime';
import { useBillingPlatformRevenueQuery } from '../settings/billingHooks';
import {
  AdminEmpty,
  AdminKpi,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AdminTable,
  productLabel,
} from './AdminChrome';

function formatInr(paise?: number | null) {
  return `₹${Math.round((paise ?? 0) / 100).toLocaleString('en-IN')}`;
}

function shortDay(isoDay: string) {
  const parts = isoDay.split('-');
  if (parts.length < 3) return isoDay;
  return `${Number(parts[2])}/${Number(parts[1])}`;
}

export function PlatformRevenuePage() {
  usePageMeta({ title: 'Revenue — Platform Admin' });
  const revenueQuery = useBillingPlatformRevenueQuery(true);
  const data = revenueQuery.data;
  const maxDaily = Math.max(1, ...(data?.daily ?? []).map((row) => row.collected_paise));
  const maxProduct = Math.max(1, ...(data?.by_product ?? []).map((row) => row.collected_paise || row.mrr_paise));
  const maxPlan = Math.max(1, ...(data?.by_plan ?? []).map((row) => row.mrr_paise));

  return (
    <AdminPage>
      <AdminPageHeader
        title="Revenue"
        description="Money collected from tenant checkouts, plus recognized monthly recurring revenue from paying subscriptions."
        actions={
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={() => void revenueQuery.refetch()}
          >
            <RefreshCw size={14} />
            {revenueQuery.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      <div className="admin-kpi-grid">
        <AdminKpi
          label="Collected this month"
          value={revenueQuery.isLoading ? '…' : formatInr(data?.collected_month_paise)}
          hint="Paid checkouts since month start"
          tone="good"
          icon={<IndianRupee size={16} />}
        />
        <AdminKpi
          label="Net collected"
          value={revenueQuery.isLoading ? '…' : formatInr(data?.net_collected_paise)}
          hint={`${data?.paid_payment_count ?? 0} payments · ${formatInr(data?.refunded_all_time_paise)} refunded`}
          icon={<Banknote size={16} />}
        />
        <AdminKpi
          label="MRR"
          value={revenueQuery.isLoading ? '…' : formatInr(data?.mrr_paise)}
          hint={`${data?.paying_subscriptions ?? 0} paying · ARR ${formatInr(data?.arr_paise)}`}
          icon={<CreditCard size={16} />}
        />
        <AdminKpi
          label="Pending claims"
          value={revenueQuery.isLoading ? '…' : formatInr(data?.pending_claims_paise)}
          hint={`${data?.pending_claims_count ?? 0} awaiting · confirm in Claims`}
          tone={(data?.pending_claims_count ?? 0) > 0 ? 'warn' : 'default'}
          icon={<TimerReset size={16} />}
        />
      </div>

      <AdminSection
        title="Collections · last 14 days"
        description="Paid checkout totals by day. Complimentary grants and trials are not included."
      >
        {(data?.daily ?? []).every((row) => row.collected_paise === 0) ? (
          <AdminEmpty title="No collections yet">
            Paid UPI or Razorpay checkouts will appear here after the first confirmed payment.
          </AdminEmpty>
        ) : (
          <div className="admin-spark" aria-label="Daily collections">
            {(data?.daily ?? []).map((row) => (
              <div key={row.day} className="admin-spark__col" title={`${row.day}: ${formatInr(row.collected_paise)}`}>
                <span
                  className="admin-spark__bar"
                  style={{ height: `${Math.max(6, (row.collected_paise / maxDaily) * 100)}%` }}
                />
                <span className="admin-spark__label">{shortDay(row.day)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="admin-panel__desc" style={{ marginTop: 12 }}>
          Last 30 days {formatInr(data?.collected_last_30d_paise)} · Open unpaid checkouts{' '}
          {formatInr(data?.open_checkouts_paise)} ({data?.open_checkouts_count ?? 0})
        </p>
      </AdminSection>

      <div className="admin-split">
        <AdminSection title="By product" description="Cash collected and current MRR.">
          {(data?.by_product ?? []).length === 0 ? (
            <AdminEmpty>No product revenue yet.</AdminEmpty>
          ) : (
            <div className="admin-mix">
              {(data?.by_product ?? []).map((row) => (
                <div key={row.product_code} className="admin-mix-row">
                  <div className="admin-mix-row__head">
                    <strong>{productLabel(row.product_code)}</strong>
                    <span>
                      {formatInr(row.collected_paise)} collected · {formatInr(row.mrr_paise)} MRR
                    </span>
                  </div>
                  <div className="admin-mix-bar">
                    <i style={{ width: `${Math.max(6, ((row.collected_paise || row.mrr_paise) / maxProduct) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminSection>

        <AdminSection title="Paying plans" description="Recognized MRR. Complimentary and trial seats are excluded.">
          {(data?.by_plan ?? []).length === 0 ? (
            <AdminEmpty>No paying subscriptions yet.</AdminEmpty>
          ) : (
            <div className="admin-mix">
              {(data?.by_plan ?? []).map((row) => (
                <div key={row.plan_code} className="admin-mix-row">
                  <div className="admin-mix-row__head">
                    <strong>{row.plan_code}</strong>
                    <span>
                      {row.count} · {formatInr(row.mrr_paise)}
                    </span>
                  </div>
                  <div className="admin-mix-bar">
                    <i style={{ width: `${Math.max(6, (row.mrr_paise / maxPlan) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminSection>
      </div>

      <div className="admin-kpi-grid">
        <AdminKpi label="Trials" value={data?.trial_subscriptions ?? '…'} hint="Not billed yet" />
        <AdminKpi
          label="Complimentary"
          value={data?.complimentary_subscriptions ?? '…'}
          hint="Active grants, excluded from MRR"
        />
        <AdminKpi
          label="Soft locked"
          value={data?.soft_locked_subscriptions ?? '…'}
          hint="Past due"
          tone={(data?.soft_locked_subscriptions ?? 0) > 0 ? 'warn' : 'default'}
        />
        <AdminKpi label="Canceled" value={data?.canceled_subscriptions ?? '…'} />
      </div>

      <div className="admin-split">
        <AdminSection title="Top tenants" description="Highest lifetime collected checkout amounts.">
          {(data?.top_tenants ?? []).length === 0 ? (
            <AdminEmpty>No paid tenants yet.</AdminEmpty>
          ) : (
            <AdminTable columns={['Workspace', 'Payments', 'Collected']}>
              {(data?.top_tenants ?? []).map((row) => (
                <tr key={row.tenant_id || row.tenant_slug}>
                  <td>
                    {row.tenant_id ? (
                      <Link to={`/admin/tenants/${row.tenant_id}`}>{row.tenant_name}</Link>
                    ) : (
                      row.tenant_name
                    )}
                  </td>
                  <td>{row.payment_count}</td>
                  <td>{formatInr(row.collected_paise)}</td>
                </tr>
              ))}
            </AdminTable>
          )}
        </AdminSection>

        <AdminSection title="Recent payments" description="Latest confirmed checkouts.">
          {(data?.recent_payments ?? []).length === 0 ? (
            <AdminEmpty>No confirmed payments yet.</AdminEmpty>
          ) : (
            <AdminTable columns={['When', 'Tenant', 'Plan', 'Amount']}>
              {(data?.recent_payments ?? []).map((row) => (
                <tr key={row.id}>
                  <td className="admin-table__muted">{formatTimestamp(row.paid_at)}</td>
                  <td>
                    {row.tenant_id ? (
                      <Link to={`/admin/tenants/${row.tenant_id}`}>{row.tenant_name}</Link>
                    ) : (
                      row.tenant_name
                    )}
                  </td>
                  <td className="admin-table__muted">{row.plan_code}</td>
                  <td>{formatInr(row.amount_paise)}</td>
                </tr>
              ))}
            </AdminTable>
          )}
        </AdminSection>
      </div>
    </AdminPage>
  );
}

export default PlatformRevenuePage;
