import type { BIRevenueReport, BIShopieRevenue } from '@ie-orbit/sdk';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatMoney } from '../../lib/currency';
import { StatCard } from './components/StatCard';
import { TrendChart } from './components/TrendChart';
import { useBIRevenueQuery, useBiProductTab, useBiProductVisibility } from './biHooks';
import { BiProductTabs } from './components/BiProductTabs';

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      {subtitle ? <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>{subtitle}</p> : null}
    </div>
  );
}

function AppointieRevenue({ data }: { data: BIRevenueReport }) {
  const { t } = useTranslation();
  const currency = data.currency;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading title={t('public.nav.appoint')} subtitle={t('bi.revenueIntroAppoint')} />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label={t('bi.estimatedRevenue')} value={formatMoney(data.estimated_revenue ?? 0, currency)} />
        <StatCard label={t('bi.completedRevenue')} value={formatMoney(data.completed_revenue ?? 0, currency)} />
        <StatCard label={t('bi.avgBookingValue')} value={formatMoney(data.avg_booking_value ?? 0, currency)} />
      </div>
      <Card>
        <h3 style={{ marginTop: 0 }}>{t('bi.revenueByService')}</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {(data.by_service ?? []).length ? (
            (data.by_service ?? []).map((row) => (
              <div key={row.service_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.service_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {t('bi.bookingsCompleted', { bookings: row.bookings ?? 0, completed: row.completed ?? 0 })}
                  </div>
                </div>
                <span>{formatMoney(row.revenue, currency)}</span>
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--muted-foreground)' }}>{t('bi.noPricedBookings')}</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function ShopieRevenue({ data }: { data: BIShopieRevenue }) {
  const { t } = useTranslation();
  const currency = data.currency ?? undefined;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading title={t('public.nav.mart')} subtitle={t('bi.martRevenueSub')} />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label={t('bi.gmv')} value={formatMoney(data.gmv ?? 0, currency)} />
        <StatCard label={t('bi.avgOrderValue')} value={formatMoney(data.avg_order_value ?? 0, currency)} />
        <StatCard label={t('bi.orders')} value={data.orders ?? 0} />
        <StatCard label={t('bi.cancelledOrders')} value={data.cancelled_orders ?? 0} />
      </div>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Card>
          <h3 style={{ marginTop: 0 }}>{t('bi.byChannel')}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {(data.by_channel ?? []).length ? (
              (data.by_channel ?? []).map((row) => (
                <div key={row.channel} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{row.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>{t('bi.ordersN', { n: row.orders })}</div>
                  </div>
                  <span>{formatMoney(row.gmv, currency)}</span>
                </div>
              ))
            ) : (
              <p style={{ color: 'var(--muted-foreground)' }}>{t('bi.noChannelSales')}</p>
            )}
          </div>
        </Card>
        <Card>
          <h3 style={{ marginTop: 0 }}>{t('bi.byCategory')}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {(data.by_category ?? []).length ? (
              (data.by_category ?? []).map((row) => (
                <div key={row.category} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{row.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>{t('bi.ordersN', { n: row.orders })}</div>
                  </div>
                  <span>{formatMoney(row.gmv, currency)}</span>
                </div>
              ))
            ) : (
              <p style={{ color: 'var(--muted-foreground)' }}>{t('bi.noCategorySales')}</p>
            )}
          </div>
        </Card>
      </div>
      {data.trend?.length ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>{t('bi.dailyGmv')}</h3>
          <TrendChart
            rows={data.trend.map((row) => ({
              day: row.day,
              total: row.gmv,
              completed: row.orders,
              cancelled: 0,
            }))}
          />
        </Card>
      ) : null}
    </div>
  );
}

export function BIRevenuePage() {
  const { t } = useTranslation();
  usePageMeta({ title: `${t('bi.pageRevenue')} — Orbit` });
  const { showAppointie, showShopie } = useBiProductVisibility('revenue');
  const { product, setProduct, showSwitcher } = useBiProductTab(showAppointie, showShopie);
  const revenueQuery = useBIRevenueQuery();
  const data = revenueQuery.data;
  const appointie =
    data?.appointie ??
    (showAppointie && data?.estimated_revenue != null ? (data as BIRevenueReport) : null);
  const shopie = data?.shopie ?? null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>{t('bi.pageRevenue')}</h1>
        <p style={{ color: 'var(--muted-foreground)', marginBottom: showSwitcher ? 12 : undefined }}>
          {showSwitcher
            ? t('bi.revenueIntroSwitch')
            : showShopie
              ? t('bi.revenueIntroMart')
              : t('bi.revenueIntroAppoint')}
        </p>
        <BiProductTabs
          showAppointie={showAppointie}
          showShopie={showShopie}
          value={product}
          onChange={setProduct}
        />
      </Card>
      {revenueQuery.isLoading && !data ? <Card>{t('bi.loadingRevenue')}</Card> : null}
      {product === 'appointie' && showAppointie && appointie ? <AppointieRevenue data={appointie} /> : null}
      {product === 'shopie' && showShopie && shopie ? <ShopieRevenue data={shopie} /> : null}
      {!revenueQuery.isLoading && !appointie && !shopie ? (
        <Card>
          <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            {t('bi.revenueEmpty')}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export default BIRevenuePage;
