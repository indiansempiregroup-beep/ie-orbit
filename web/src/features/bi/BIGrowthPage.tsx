import type { BIGrowthReport, BIShopieGrowth } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatMoney } from '../../lib/currency';
import { StatCard } from './components/StatCard';
import { useBIGrowthQuery, useBiProductTab, useBiProductVisibility } from './biHooks';
import { BiProductTabs } from './components/BiProductTabs';

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      {subtitle ? <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>{subtitle}</p> : null}
    </div>
  );
}

function AppointieGrowth({ data, currency }: { data: BIGrowthReport; currency?: string }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading title="Orbit Appoint" subtitle="Who is booking — and who comes back." />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label="New customers" value={data.new_customers ?? 0} />
        <StatCard label="Returning" value={data.returning_customers ?? 0} />
        <StatCard label="Repeat rate" value={`${Math.round((data.repeat_rate ?? 0) * 100)}%`} />
        <StatCard label="Avg visits / customer" value={data.avg_visits_per_customer ?? 0} />
      </div>
      <Card>
        <h3 style={{ marginTop: 0 }}>Most active customers</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {(data.top_customers ?? []).length ? (
            (data.top_customers ?? []).map((row) => (
              <div key={row.customer_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.customer_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {row.bookings} bookings · {row.is_returning ? 'returning' : 'new'}
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>{formatMoney(Number(row.revenue), currency)}</div>
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--muted-foreground)' }}>No customer booking activity in this period yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function ShopieGrowth({ data, currency }: { data: BIShopieGrowth; currency?: string }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading title="Orbit Mart" subtitle="Who is buying — and who comes back to the shop." />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label="New customers" value={data.new_customers ?? 0} />
        <StatCard label="Returning" value={data.returning_customers ?? 0} />
        <StatCard label="Repeat rate" value={`${Math.round((data.repeat_rate ?? 0) * 100)}%`} />
        <StatCard label="Avg orders / customer" value={data.avg_orders_per_customer ?? 0} />
      </div>
      <Card>
        <h3 style={{ marginTop: 0 }}>Most active shoppers</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {(data.top_customers ?? []).length ? (
            (data.top_customers ?? []).map((row) => (
              <div key={row.customer_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.customer_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {row.orders} orders · {row.is_returning ? 'returning' : 'new'}
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>{formatMoney(Number(row.revenue), currency)}</div>
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--muted-foreground)' }}>No shop customer activity in this period yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

export function BIGrowthPage() {
  usePageMeta({ title: 'BI Growth — Orbit' });
  const { showAppointie, showShopie, currency } = useBiProductVisibility('growth');
  const { product, setProduct, showSwitcher } = useBiProductTab(showAppointie, showShopie);
  const growthQuery = useBIGrowthQuery();
  const data = growthQuery.data;
  const appointie = data?.appointie ?? (showAppointie && data?.new_customers != null ? (data as BIGrowthReport) : null);
  const shopie = data?.shopie ?? null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>Customer growth</h1>
        <p style={{ color: 'var(--muted-foreground)', marginBottom: showSwitcher ? 12 : undefined }}>
          New vs returning customers for the last 30 days
          {showSwitcher ? '. Switch between Orbit Appoint and Orbit Mart.' : '.'}
        </p>
        <BiProductTabs
          showAppointie={showAppointie}
          showShopie={showShopie}
          value={product}
          onChange={setProduct}
        />
      </Card>
      {growthQuery.isLoading && !data ? <Card>Loading growth…</Card> : null}
      {product === 'appointie' && showAppointie && appointie ? (
        <AppointieGrowth data={appointie} currency={currency} />
      ) : null}
      {product === 'shopie' && showShopie && shopie ? (
        <ShopieGrowth data={shopie} currency={currency} />
      ) : null}
      {!growthQuery.isLoading && !appointie && !shopie ? (
        <Card>
          <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            No growth analytics for your subscribed products in this period yet.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export default BIGrowthPage;
