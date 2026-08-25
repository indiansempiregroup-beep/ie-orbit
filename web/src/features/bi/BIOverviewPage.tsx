import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { StatCard } from './components/StatCard';
import { TrendChart } from './components/TrendChart';
import { useBIOverviewQuery } from './biHooks';
import type { BIOverviewResponse, BIReportsBundle, BIShopieOverview, DashboardPetsSummary } from '@ie-orbit/sdk';

function changeHint(value?: number | null) {
  if (value == null) return undefined;
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value}% vs prior period`;
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      {subtitle ? <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>{subtitle}</p> : null}
    </div>
  );
}

function AppointieBlock({ data }: { data: BIReportsBundle }) {
  const summary = data.summary;
  const operations = data.operations;
  const weekdayMax = Math.max(...(operations?.by_weekday ?? []).map((row) => row.total), 1);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading title="AppointIE" subtitle="Bookings, estimated revenue, and demand" />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label="Total bookings" value={summary?.bookings ?? 0} hint={changeHint(summary?.comparison?.bookings_change_pct)} />
        <StatCard
          label="Estimated revenue"
          value={`${data.revenue?.currency ?? ''} ${data.revenue?.estimated_revenue ?? 0}`}
          hint={changeHint(summary?.comparison?.revenue_change_pct)}
        />
        <StatCard
          label="Completed"
          value={summary?.completed ?? 0}
          hint={`${Math.round((summary?.completion_rate ?? 0) * 100)}% completion`}
        />
        <StatCard
          label="No-shows"
          value={summary?.no_shows ?? 0}
          hint={`${Math.round((summary?.no_show_rate ?? 0) * 100)}% of bookings`}
        />
        <StatCard
          label="Cancelled"
          value={summary?.cancelled ?? 0}
          hint={`${Math.round((summary?.cancellation_rate ?? 0) * 100)}% of bookings`}
        />
        <StatCard
          label="Avg bookings / day"
          value={summary?.avg_bookings_per_day ?? 0}
          hint={operations?.busiest_day ? `Busiest: ${operations.busiest_day}` : undefined}
        />
      </div>

      {(data.insights ?? []).length ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>What stands out</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {(data.insights ?? []).map((insight) => (
              <div key={`${insight.type}-${insight.title}`}>
                <div style={{ fontWeight: 700 }}>{insight.title}</div>
                <div style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>{insight.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Card>
          <h3 style={{ marginTop: 0 }}>Booking trend</h3>
          {data.trends?.rows?.length ? <TrendChart rows={data.trends.rows} /> : <p>No trend data yet.</p>}
        </Card>
        <Card>
          <h3 style={{ marginTop: 0 }}>Demand by weekday</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {(operations?.by_weekday ?? []).map((row) => (
              <div
                key={row.weekday}
                style={{ display: 'grid', gridTemplateColumns: '72px 1fr 40px', gap: 10, alignItems: 'center' }}
              >
                <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{row.weekday_name.slice(0, 3)}</span>
                <div style={{ background: '#e2e8f0', borderRadius: 999, height: 8, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${(row.total / weekdayMax) * 100}%`,
                      height: '100%',
                      background: 'var(--primary)',
                    }}
                  />
                </div>
                <span style={{ fontSize: 12 }}>{row.total}</span>
              </div>
            ))}
          </div>
          {operations?.busiest_hour ? (
            <p style={{ color: 'var(--muted-foreground)', marginBottom: 0 }}>Peak hour around {operations.busiest_hour}.</p>
          ) : null}
        </Card>
      </div>

      {(operations?.by_staff ?? []).length ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>Top staff</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {(operations?.by_staff ?? []).slice(0, 6).map((row) => (
              <div key={row.staff_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.staff_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {row.completed} completed · {row.no_shows} no-show
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>{row.bookings} bookings</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function ShopieBlock({ data }: { data: BIShopieOverview }) {
  const currency = data.currency ?? '';
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading title="ShopIE" subtitle="Orders, GMV, returns, and delivery fees" />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label="Orders" value={data.orders} />
        <StatCard label="GMV" value={`${currency} ${data.gmv}`} />
        <StatCard label="Avg order value" value={`${currency} ${data.avg_order_value}`} />
        <StatCard label="Returns" value={data.returns} hint={`${Math.round((data.return_rate ?? 0) * 100)}% of orders`} />
        <StatCard label="Pending returns" value={data.pending_returns} />
        <StatCard label="Refunds" value={`${currency} ${data.refund_total}`} />
        <StatCard label="Delivery fees" value={`${currency} ${data.delivery_fee_total}`} />
        <StatCard label="Cancelled orders" value={data.cancelled_orders} />
      </div>

      {(data.insights ?? []).length ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>Commerce insights</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {(data.insights ?? []).map((insight) => (
              <div key={`${insight.type}-${insight.title}`}>
                <div style={{ fontWeight: 700 }}>{insight.title}</div>
                <div style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>{insight.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {data.trend?.length ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>Order volume</h3>
          <TrendChart
            rows={data.trend.map((row) => ({
              day: row.day,
              total: row.orders,
              completed: row.orders,
              cancelled: 0,
            }))}
          />
        </Card>
      ) : null}
    </div>
  );
}

function PetsBlock({ data }: { data: DashboardPetsSummary }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading title="Pets pack" subtitle="Roster and birthday pipeline" />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label="Pets enrolled" value={data.total} />
        <StatCard label="Birthdays (7 days)" value={data.birthdays_next_7d} />
        <StatCard label="Birthdays (30 days)" value={data.birthdays_next_30d} />
        <StatCard label="With photo" value={data.with_photo} />
      </div>
    </div>
  );
}

function resolveAppointie(data?: BIOverviewResponse | null): BIReportsBundle | null {
  if (!data) return null;
  if (data.appointie) return data.appointie;
  if (data.summary && data.revenue && data.trends) {
    return {
      summary: data.summary,
      revenue: data.revenue,
      trends: data.trends,
      growth: data.growth,
      operations: data.operations,
      insights: data.insights,
    };
  }
  return null;
}

export function BIOverviewPage() {
  usePageMeta({ title: 'BI Overview — IE Orbit' });
  const overviewQuery = useBIOverviewQuery();
  const data = overviewQuery.data as BIOverviewResponse | undefined;
  const appointie = resolveAppointie(data);
  const shopie = data?.shopie;
  const pets = data?.pets;

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>BI Overview</h1>
        <p style={{ color: 'var(--muted-foreground)', marginBottom: 0 }}>
          Business intelligence snapshot for the last 30 days
          {data?.products?.length ? ` — ${data.products.join(' · ')}` : ''}.
        </p>
      </Card>

      {overviewQuery.isLoading && !data ? <Card>Loading overview…</Card> : null}

      {appointie ? <AppointieBlock data={appointie} /> : null}
      {shopie ? <ShopieBlock data={shopie} /> : null}
      {pets ? <PetsBlock data={pets} /> : null}

      {!overviewQuery.isLoading && !appointie && !shopie && !pets ? (
        <Card>
          <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            No analytics sections available for your subscribed products yet.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export default BIOverviewPage;
