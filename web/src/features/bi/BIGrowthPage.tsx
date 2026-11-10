import type { BIGrowthReport, BIShopieGrowth } from '@ie-orbit/sdk';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading title={t('public.nav.appoint')} subtitle={t('bi.whoBooking')} />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label={t('bi.newCustomers')} value={data.new_customers ?? 0} />
        <StatCard label={t('bi.returning')} value={data.returning_customers ?? 0} />
        <StatCard label={t('bi.repeatRate')} value={`${Math.round((data.repeat_rate ?? 0) * 100)}%`} />
        <StatCard label={t('bi.avgVisitsPerCustomer')} value={data.avg_visits_per_customer ?? 0} />
      </div>
      <Card>
        <h3 style={{ marginTop: 0 }}>{t('bi.mostActiveCustomers')}</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {(data.top_customers ?? []).length ? (
            (data.top_customers ?? []).map((row) => (
              <div key={row.customer_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.customer_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {t('bi.bookingsStatus', {
                      n: row.bookings,
                      status: row.is_returning ? t('bi.returningLower') : t('bi.newLower'),
                    })}
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>{formatMoney(Number(row.revenue), currency)}</div>
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--muted-foreground)' }}>{t('bi.noCustomerActivity')}</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function ShopieGrowth({ data, currency }: { data: BIShopieGrowth; currency?: string }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeading title={t('public.nav.mart')} subtitle={t('bi.whoBuying')} />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label={t('bi.newCustomers')} value={data.new_customers ?? 0} />
        <StatCard label={t('bi.returning')} value={data.returning_customers ?? 0} />
        <StatCard label={t('bi.repeatRate')} value={`${Math.round((data.repeat_rate ?? 0) * 100)}%`} />
        <StatCard label={t('bi.avgOrdersPerCustomer')} value={data.avg_orders_per_customer ?? 0} />
      </div>
      <Card>
        <h3 style={{ marginTop: 0 }}>{t('bi.mostActiveShoppers')}</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {(data.top_customers ?? []).length ? (
            (data.top_customers ?? []).map((row) => (
              <div key={row.customer_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.customer_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {t('bi.ordersStatus', {
                      n: row.orders,
                      status: row.is_returning ? t('bi.returningLower') : t('bi.newLower'),
                    })}
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>{formatMoney(Number(row.revenue), currency)}</div>
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--muted-foreground)' }}>{t('bi.noShopActivity')}</p>
          )}
        </div>
      </Card>
    </div>
  );
}

export function BIGrowthPage() {
  const { t } = useTranslation();
  usePageMeta({ title: `${t('bi.title')}: ${t('bi.growth')} — Orbit` });
  const { showAppointie, showShopie, currency } = useBiProductVisibility('growth');
  const { product, setProduct, showSwitcher } = useBiProductTab(showAppointie, showShopie);
  const growthQuery = useBIGrowthQuery();
  const data = growthQuery.data;
  const appointie = data?.appointie ?? (showAppointie && data?.new_customers != null ? (data as BIGrowthReport) : null);
  const shopie = data?.shopie ?? null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>{t('bi.pageGrowth')}</h1>
        <p style={{ color: 'var(--muted-foreground)', marginBottom: showSwitcher ? 12 : undefined }}>
          {showSwitcher ? t('bi.growthIntroSwitch') : t('bi.growthIntro')}
        </p>
        <BiProductTabs
          showAppointie={showAppointie}
          showShopie={showShopie}
          value={product}
          onChange={setProduct}
        />
      </Card>
      {growthQuery.isLoading && !data ? <Card>{t('bi.loadingGrowth')}</Card> : null}
      {product === 'appointie' && showAppointie && appointie ? (
        <AppointieGrowth data={appointie} currency={currency} />
      ) : null}
      {product === 'shopie' && showShopie && shopie ? (
        <ShopieGrowth data={shopie} currency={currency} />
      ) : null}
      {!growthQuery.isLoading && !appointie && !shopie ? (
        <Card>
          <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            {t('bi.growthEmpty')}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export default BIGrowthPage;
