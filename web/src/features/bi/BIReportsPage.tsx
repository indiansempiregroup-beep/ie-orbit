import type { BIReportsBundle, BIShopieReports } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatMoney } from '../../lib/currency';
import { StatCard } from './components/StatCard';
import { TrendChart } from './components/TrendChart';
import { useBIReportsQuery, useBiProductTab, useBiProductVisibility } from './biHooks';
import { BiProductTabs } from './components/BiProductTabs';

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      {subtitle ? <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>{subtitle}</p> : null}
    </div>
  );
}

function AppointieReports({ data }: { data: BIReportsBundle }) {
  const operations = data.operations;
  const currency = data.revenue?.currency;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading title="Orbit Appoint" subtitle="Bookings, revenue, and customer reporting." />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label="Bookings" value={data.summary?.bookings ?? 0} />
        <StatCard label="Completion rate" value={`${Math.round((data.summary?.completion_rate ?? 0) * 100)}%`} />
        <StatCard label="Revenue" value={formatMoney(data.revenue?.estimated_revenue ?? 0, currency)} />
        <StatCard label="Repeat rate" value={`${Math.round((data.growth?.repeat_rate ?? 0) * 100)}%`} />
        <StatCard label="New customers" value={data.growth?.new_customers ?? 0} />
        <StatCard label="No-shows" value={data.summary?.no_shows ?? 0} />
      </div>

      {(data.insights ?? []).length ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>Insights</h3>
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

      <Card>
        <h3 style={{ marginTop: 0 }}>Trend</h3>
        {data.trends?.rows?.length ? <TrendChart rows={data.trends.rows} /> : <p>No data in range.</p>}
      </Card>

      {(operations?.by_staff ?? []).length ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>Staff performance</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {(operations?.by_staff ?? []).map((row) => (
              <div key={row.staff_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.staff_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {row.completed} completed · {row.cancelled} cancelled · {row.no_shows} no-show
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>{row.bookings} bookings</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {formatMoney(row.revenue, currency)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function ShopieReports({ data }: { data: BIShopieReports }) {
  const currency = data.currency ?? data.revenue?.currency ?? undefined;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading title="Orbit Mart" subtitle="Orders, GMV, and shopper repeat for the last 30 days." />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label="Orders" value={data.orders ?? 0} />
        <StatCard label="GMV" value={formatMoney(data.gmv ?? 0, currency)} />
        <StatCard label="Avg order value" value={formatMoney(data.avg_order_value ?? 0, currency)} />
        <StatCard label="Repeat rate" value={`${Math.round((data.growth?.repeat_rate ?? 0) * 100)}%`} />
        <StatCard label="New customers" value={data.growth?.new_customers ?? 0} />
        <StatCard label="Returns" value={data.returns ?? 0} />
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

      <Card>
        <h3 style={{ marginTop: 0 }}>Order trend</h3>
        {data.trend?.length ? (
          <TrendChart
            rows={data.trend.map((row) => ({
              day: row.day,
              total: row.orders,
              completed: row.orders,
              cancelled: 0,
            }))}
          />
        ) : (
          <p>No data in range.</p>
        )}
      </Card>
    </div>
  );
}

export function BIReportsPage() {
  usePageMeta({ title: 'BI Reports — Orbit' });
  const { showAppointie, showShopie } = useBiProductVisibility('reports');
  const { product, setProduct, showSwitcher } = useBiProductTab(showAppointie, showShopie);
  const reportsQuery = useBIReportsQuery();
  const data = reportsQuery.data;
  const appointie =
    data?.appointie ??
    (showAppointie && data?.summary && data?.revenue && data?.trends ? (data as BIReportsBundle) : null);
  const shopie = data?.shopie ?? null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>BI Reports</h1>
        <p style={{ color: 'var(--muted-foreground)', marginBottom: showSwitcher ? 12 : undefined }}>
          Combined reporting for the last 30 days
          {showSwitcher ? '. Switch between Orbit Appoint and Orbit Mart.' : '.'}
        </p>
        <BiProductTabs
          showAppointie={showAppointie}
          showShopie={showShopie}
          value={product}
          onChange={setProduct}
        />
      </Card>
      {reportsQuery.isLoading && !data ? <Card>Loading reports…</Card> : null}
      {product === 'appointie' && showAppointie && appointie ? <AppointieReports data={appointie} /> : null}
      {product === 'shopie' && showShopie && shopie ? <ShopieReports data={shopie} /> : null}
      {!reportsQuery.isLoading && !appointie && !shopie ? (
        <Card>
          <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            No reports for your subscribed products in this period yet.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export default BIReportsPage;
