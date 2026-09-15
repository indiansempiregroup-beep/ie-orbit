import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  CalendarDays,
  Globe,
  Monitor,
  Package,
  RefreshCw,
  Store,
  Users,
} from 'lucide-react';
import type { PlatformAnalyticsCatalogItem, PlatformAnalyticsSeriesRow } from '@ie-orbit/sdk';
import { usePageMeta } from '../../hooks/usePageMeta';
import {
  AdminChip,
  AdminEmpty,
  AdminField,
  AdminKpi,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AdminTable,
  productLabel,
} from './AdminChrome';
import { usePlatformAnalyticsQuery, usePlatformTenantDetailQuery, usePlatformTenantsQuery } from './adminHooks';

const RANGES = [
  { id: 'today', label: 'Today', days: 0 },
  { id: '7d', label: '7 days', days: 6 },
  { id: '30d', label: '30 days', days: 29 },
  { id: '90d', label: '90 days', days: 89 },
  { id: '12m', label: '12 months', days: 364 },
] as const;

const GRAINS = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
] as const;

function isoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function rangeBounds(rangeId: string) {
  const preset = RANGES.find((item) => item.id === rangeId) ?? RANGES[2];
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - preset.days);
  return { start_date: isoDate(start), end_date: isoDate(end) };
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function todayIso() {
  return isoDate(new Date());
}

function resolveBounds(rangeId: string, startDate: string, endDate: string) {
  if (rangeId === 'custom' && isIsoDate(startDate) && isIsoDate(endDate)) {
    return startDate <= endDate
      ? { start_date: startDate, end_date: endDate }
      : { start_date: endDate, end_date: startDate };
  }
  return rangeBounds(rangeId === 'custom' ? '30d' : rangeId);
}

function formatMoney(value?: number | null, currency = 'INR') {
  const amount = Math.round(value ?? 0);
  if (currency === 'INR') return `₹${amount.toLocaleString('en-IN')}`;
  return `${currency} ${amount.toLocaleString()}`;
}

function formatPct(rate?: number | null) {
  return `${Math.round((rate ?? 0) * 1000) / 10}%`;
}

function formatQty(value?: number | null) {
  const amount = value ?? 0;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

function shortPeriod(row: PlatformAnalyticsSeriesRow, grain: string) {
  if (grain === 'month') return row.period;
  if (grain === 'week') return row.period.replace(/^\d{4}-/, '');
  const parts = row.period.split('-');
  if (parts.length < 3) return row.period;
  return `${Number(parts[2])}/${Number(parts[1])}`;
}

function DatapointPills({ title, values }: { title: string; values?: Record<string, number> }) {
  const entries = Object.entries(values ?? {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  const max = Math.max(1, ...entries.map(([, count]) => count));
  return (
    <div className="admin-datapoint">
      <p className="admin-datapoint__title">{title}</p>
      <ul>
        {entries.map(([key, count]) => (
          <li key={key}>
            <span>{key.replace(/_/g, ' ')}</span>
            <span className="admin-datapoint__bar" style={{ width: `${Math.max(8, (count / max) * 100)}%` }} />
            <strong>{count}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CatalogTable({
  title,
  description,
  rows,
  empty,
}: {
  title: string;
  description: string;
  rows: PlatformAnalyticsCatalogItem[];
  empty: string;
}) {
  return (
    <AdminSection title={title} description={description}>
      {rows.length ? (
        <AdminTable columns={['Item', 'Business', 'Activity', 'Units', 'Revenue']}>
          {rows.map((row) => (
            <tr key={`${row.business_id}-${row.item_id}`}>
              <td>
                <strong>{row.item_name}</strong>
                <div className="admin-table__muted">{productLabel(row.product_code)}</div>
              </td>
              <td>
                {row.business_name}
                <div className="admin-table__muted">{row.tenant_name}</div>
              </td>
              <td>{row.activity_count}</td>
              <td>{formatQty(row.units)}</td>
              <td>{formatMoney(row.revenue, row.currency)}</td>
            </tr>
          ))}
        </AdminTable>
      ) : (
        <AdminEmpty title="No catalog activity">{empty}</AdminEmpty>
      )}
    </AdminSection>
  );
}

export function PlatformAnalyticsPage() {
  usePageMeta({ title: 'Analytics — Platform Admin' });
  const [searchParams, setSearchParams] = useSearchParams();
  const grain = GRAINS.some((item) => item.id === searchParams.get('grain'))
    ? (searchParams.get('grain') as (typeof GRAINS)[number]['id'])
    : 'day';
  const rangeParam = searchParams.get('range') || '30d';
  const range = RANGES.some((item) => item.id === rangeParam)
    ? rangeParam
    : rangeParam === 'custom'
      ? 'custom'
      : '30d';
  const product = searchParams.get('product') || '';
  const tenantId = searchParams.get('tenant_id') || '';
  const businessId = searchParams.get('business_id') || '';
  const bounds = resolveBounds(range, searchParams.get('start_date') || '', searchParams.get('end_date') || '');

  const tenantsQuery = usePlatformTenantsQuery();
  const tenantDetailQuery = usePlatformTenantDetailQuery(tenantId || undefined);
  const analyticsQuery = usePlatformAnalyticsQuery({
    ...bounds,
    grain,
    product_code: product || undefined,
    tenant_id: tenantId || undefined,
    business_id: businessId || undefined,
  });

  const data = analyticsQuery.data;
  const kpis = data?.kpis;
  const primaryCurrency = data?.by_currency?.[0]?.currency || 'INR';
  const mixedCurrency = (data?.by_currency ?? []).length > 1;
  const series = data?.series ?? [];
  const maxBookings = Math.max(1, ...series.map((row) => row.bookings));
  const maxShopGmv = Math.max(
    1,
    ...series.map((row) => Math.max(row.pos_gmv ?? 0, row.online_gmv ?? 0, row.booking_revenue ?? 0)),
  );
  const businesses = tenantDetailQuery.data?.businesses ?? [];
  const today = todayIso();

  function analyticsHref(extra: Record<string, string>) {
    const params = new URLSearchParams();
    params.set('range', range);
    params.set('grain', grain);
    if (product) params.set('product', product);
    if (range === 'custom') {
      params.set('start_date', bounds.start_date);
      params.set('end_date', bounds.end_date);
    }
    Object.entries(extra).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return `/admin/analytics?${params.toString()}`;
  }

  function setCustomDates(startDate: string, endDate: string) {
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) return;
    const nextStart = startDate > endDate ? endDate : startDate;
    const nextEnd = startDate > endDate ? startDate : endDate;
    patchParams({ range: 'custom', start_date: nextStart, end_date: nextEnd });
  }

  function patchParams(next: Record<string, string>) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        Object.entries(next).forEach(([key, value]) => {
          if (value) params.set(key, value);
          else params.delete(key);
        });
        return params;
      },
      { replace: true },
    );
  }

  const productCards = useMemo(() => data?.by_product ?? [], [data]);

  return (
    <AdminPage>
      <AdminPageHeader
        title="Analytics"
        description="Business usage across Orbit Appoint and Orbit Mart — daily through monthly, tenant and business rollups, and SKU/service ranks. Snapshots keep this history for later sales reporting."
        actions={
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={() => void analyticsQuery.refetch()}
          >
            <RefreshCw size={14} />
            {analyticsQuery.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      <AdminSection title="Filters" description={`${bounds.start_date} → ${bounds.end_date}`}>
        <div className="admin-chip-row" style={{ marginBottom: 12 }}>
          {RANGES.map((item) => (
            <AdminChip
              key={item.id}
              active={range === item.id}
              onClick={() => patchParams({ range: item.id, start_date: '', end_date: '' })}
            >
              {item.label}
            </AdminChip>
          ))}
        </div>
        <div className="admin-chip-row" style={{ marginBottom: 12 }}>
          {GRAINS.map((item) => (
            <AdminChip key={item.id} active={grain === item.id} onClick={() => patchParams({ grain: item.id })}>
              {item.label}
            </AdminChip>
          ))}
        </div>
        <div className="admin-filter-row">
          <AdminField label="From">
            <input
              type="date"
              aria-label="From date"
              value={bounds.start_date}
              max={today}
              onChange={(event) => setCustomDates(event.target.value, bounds.end_date)}
            />
          </AdminField>
          <AdminField label="To">
            <input
              type="date"
              aria-label="To date"
              value={bounds.end_date}
              min={bounds.start_date}
              max={today}
              onChange={(event) => setCustomDates(bounds.start_date, event.target.value)}
            />
          </AdminField>
          <select
            aria-label="Product"
            value={product}
            onChange={(event) => patchParams({ product: event.target.value })}
          >
            <option value="">All products</option>
            <option value="appointie">Orbit Appoint</option>
            <option value="shopie">Orbit Mart</option>
          </select>
          <select
            aria-label="Tenant"
            value={tenantId}
            onChange={(event) => patchParams({ tenant_id: event.target.value, business_id: '' })}
          >
            <option value="">All tenants</option>
            {(tenantsQuery.data ?? []).map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.display_name}
              </option>
            ))}
          </select>
          <select
            aria-label="Business"
            value={businessId}
            disabled={!tenantId}
            onChange={(event) => patchParams({ business_id: event.target.value })}
          >
            <option value="">{tenantId ? 'All businesses' : 'Select a tenant first'}</option>
            {businesses.map((business) => (
              <option key={business.id} value={business.id}>
                {business.display_name}
              </option>
            ))}
          </select>
        </div>
      </AdminSection>

      <div className="admin-kpi-grid">
        <AdminKpi
          label="Tenants"
          value={analyticsQuery.isLoading ? '…' : (kpis?.tenants ?? 0)}
          hint={`${kpis?.tenants_active ?? 0} active · ${kpis?.new_tenants ?? 0} new`}
          icon={<Building2 size={16} />}
        />
        <AdminKpi
          label="Businesses"
          value={analyticsQuery.isLoading ? '…' : (kpis?.businesses ?? 0)}
          hint={`${kpis?.new_businesses ?? 0} opened this period`}
          icon={<Store size={16} />}
        />
        <AdminKpi
          label="Customers"
          value={analyticsQuery.isLoading ? '…' : (kpis?.customers_total ?? 0)}
          hint={`${kpis?.new_customers ?? 0} new · ${kpis?.staff_active ?? 0} staff`}
          icon={<Users size={16} />}
        />
        <AdminKpi
          label="Subscriptions"
          value={analyticsQuery.isLoading ? '…' : (kpis?.subscriptions ?? 0)}
          hint={`${kpis?.subscriptions_active ?? 0} paying · ${kpis?.subscriptions_trialing ?? 0} trial`}
          icon={<Package size={16} />}
        />
      </div>

      <div className="admin-kpi-grid">
        <AdminKpi
          label="Appointments"
          value={analyticsQuery.isLoading ? '…' : (kpis?.bookings ?? 0)}
          hint={`${formatPct(kpis?.completion_rate)} completed · ${formatPct(kpis?.cancellation_rate)} cancelled`}
          tone="good"
          icon={<CalendarDays size={16} />}
        />
        <AdminKpi
          label="Booking revenue"
          value={analyticsQuery.isLoading ? '…' : formatMoney(kpis?.booking_revenue, primaryCurrency)}
          hint={
            mixedCurrency
              ? 'Mixed currencies — see breakdown'
              : `Avg ${formatMoney(kpis?.avg_booking_value, primaryCurrency)}`
          }
        />
        <AdminKpi
          label="POS orders"
          value={analyticsQuery.isLoading ? '…' : (kpis?.pos_orders ?? 0)}
          hint={`${formatMoney(kpis?.pos_gmv, primaryCurrency)} GMV · AOV ${formatMoney(kpis?.avg_pos_order_value, primaryCurrency)}`}
          icon={<Monitor size={16} />}
        />
        <AdminKpi
          label="Online orders"
          value={analyticsQuery.isLoading ? '…' : (kpis?.online_orders ?? 0)}
          hint={`${formatMoney(kpis?.online_gmv, primaryCurrency)} GMV · AOV ${formatMoney(kpis?.avg_online_order_value, primaryCurrency)}`}
          icon={<Globe size={16} />}
        />
      </div>

      <AdminSection
        title={`${GRAINS.find((item) => item.id === grain)?.label ?? 'Daily'} activity`}
        description="Bookings (Appoint), POS GMV, and online GMV on the same chart."
      >
        {series.every(
          (row) => row.bookings === 0 && (row.pos_gmv ?? 0) === 0 && (row.online_gmv ?? 0) === 0 && row.booking_revenue === 0,
        ) ? (
          <AdminEmpty title="No activity in this range">
            Bookings and shop orders in the selected window will plot here.
          </AdminEmpty>
        ) : (
          <div className="admin-series" aria-label="Usage series">
            {series.map((row) => (
              <div
                key={row.period}
                className="admin-series__col"
                title={`${row.period}: ${row.bookings} bookings, POS ${formatMoney(row.pos_gmv, primaryCurrency)}, online ${formatMoney(row.online_gmv, primaryCurrency)}`}
              >
                <span
                  className="admin-series__bar admin-series__bar--pos"
                  style={{ height: `${Math.max(4, ((row.pos_gmv ?? 0) / maxShopGmv) * 100)}%` }}
                />
                <span
                  className="admin-series__bar admin-series__bar--online"
                  style={{ height: `${Math.max(4, ((row.online_gmv ?? 0) / maxShopGmv) * 100)}%` }}
                />
                <span
                  className="admin-series__bar admin-series__bar--bookings"
                  style={{ height: `${Math.max(4, (row.bookings / maxBookings) * 100)}%` }}
                />
                <span className="admin-spark__label">{shortPeriod(row, grain)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="admin-panel__desc" style={{ marginTop: 12 }}>
          Teal is booking volume. Navy is POS GMV. Amber is online (pickup + delivery) GMV.
        </p>
      </AdminSection>

      <AdminSection title="Product mix" description="Largest grain: Orbit Appoint vs Orbit Mart across the filtered tenants.">
        <div className="admin-product-analytics">
          {productCards.map((row) => (
            <article key={row.product_code} className="admin-product-analytics__card">
              <p className="admin-eyebrow">{productLabel(row.product_code)}</p>
              <h3>{row.product_name}</h3>
              <dl>
                <div>
                  <dt>Live businesses</dt>
                  <dd>{row.businesses_active}</dd>
                </div>
                <div>
                  <dt>{row.product_code === 'shopie' ? 'POS' : 'Bookings'}</dt>
                  <dd>
                    {row.product_code === 'shopie'
                      ? `${row.pos_orders} · ${formatMoney(row.pos_gmv, primaryCurrency)}`
                      : row.bookings}
                  </dd>
                </div>
                <div>
                  <dt>{row.product_code === 'shopie' ? 'Online' : 'Revenue'}</dt>
                  <dd>
                    {row.product_code === 'shopie'
                      ? `${row.online_orders} · ${formatMoney(row.online_gmv, primaryCurrency)}`
                      : formatMoney(row.booking_revenue, primaryCurrency)}
                  </dd>
                </div>
                <div>
                  <dt>Paying / trial</dt>
                  <dd>
                    {row.paying} / {row.trialing}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </AdminSection>

      <AdminSection
        title="All datapoints"
        description="Status, channel, and fulfillment breakdowns stored with the daily snapshot so a later sales motion has the raw mix."
      >
        <div className="admin-datapoint-grid">
          <DatapointPills title="Appointment status" values={data?.datapoints?.booking_status} />
          <DatapointPills title="Booking source" values={data?.datapoints?.booking_source} />
          <DatapointPills title="Booking channel" values={data?.datapoints?.booking_channel} />
          <DatapointPills title="Order status" values={data?.datapoints?.order_status} />
          <DatapointPills title="Fulfillment" values={data?.datapoints?.fulfillment_mode} />
          <DatapointPills title="Subscriptions" values={data?.datapoints?.subscription_status} />
        </div>
        {(data?.by_currency ?? []).length > 1 ? (
          <AdminTable columns={['Currency', 'Bookings', 'Booking revenue', 'POS', 'Online']}>
            {(data?.by_currency ?? []).map((row) => (
              <tr key={row.currency}>
                <td>{row.currency}</td>
                <td>{row.bookings}</td>
                <td>{formatMoney(row.booking_revenue, row.currency)}</td>
                <td>
                  {row.pos_orders}
                  <div className="admin-table__muted">{formatMoney(row.pos_gmv, row.currency)}</div>
                </td>
                <td>
                  {row.online_orders}
                  <div className="admin-table__muted">{formatMoney(row.online_gmv, row.currency)}</div>
                </td>
              </tr>
            ))}
          </AdminTable>
        ) : null}
      </AdminSection>

      <div className="admin-split">
        <AdminSection title="Tenants" description="Highest activity first.">
          {(data?.by_tenant ?? []).length ? (
            <AdminTable columns={['Tenant', 'Biz', 'Bookings', 'POS', 'Online', 'Revenue / GMV']}>
              {(data?.by_tenant ?? []).slice(0, 20).map((row) => (
                <tr key={row.tenant_id}>
                  <td>
                    <Link to={analyticsHref({ tenant_id: row.tenant_id })}>
                      {row.tenant_name}
                    </Link>
                    <div className="admin-table__muted">{row.tenant_slug}</div>
                  </td>
                  <td>{row.businesses}</td>
                  <td>{row.bookings}</td>
                  <td>
                    {row.pos_orders}
                    <div className="admin-table__muted">{formatMoney(row.pos_gmv, primaryCurrency)}</div>
                  </td>
                  <td>
                    {row.online_orders}
                    <div className="admin-table__muted">{formatMoney(row.online_gmv, primaryCurrency)}</div>
                  </td>
                  <td>
                    {formatMoney(row.booking_revenue + row.gmv, primaryCurrency)}
                    <div className="admin-table__muted">
                      <Link to={`/admin/tenants/${row.tenant_id}`}>Open workspace</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </AdminTable>
          ) : (
            <AdminEmpty title="No tenant activity">Usage in this window will rank tenants here.</AdminEmpty>
          )}
        </AdminSection>
        <AdminSection title="Businesses" description="Each shop or salon, independent of the tenant rollup.">
          {(data?.by_business ?? []).length ? (
            <AdminTable columns={['Business', 'Bookings', 'POS', 'Online', 'Revenue / GMV']}>
              {(data?.by_business ?? []).slice(0, 20).map((row) => (
                <tr key={row.business_id}>
                  <td>
                    <Link
                      to={analyticsHref({ tenant_id: row.tenant_id, business_id: row.business_id })}
                    >
                      {row.business_name}
                    </Link>
                    <div className="admin-table__muted">{row.tenant_name}</div>
                  </td>
                  <td>{row.bookings}</td>
                  <td>
                    {row.pos_orders}
                    <div className="admin-table__muted">{formatMoney(row.pos_gmv, row.currency || primaryCurrency)}</div>
                  </td>
                  <td>
                    {row.online_orders}
                    <div className="admin-table__muted">{formatMoney(row.online_gmv, row.currency || primaryCurrency)}</div>
                  </td>
                  <td>{formatMoney(row.booking_revenue + row.gmv, row.currency || primaryCurrency)}</td>
                </tr>
              ))}
            </AdminTable>
          ) : (
            <AdminEmpty title="No business activity">Filter a tenant to inspect a single shop.</AdminEmpty>
          )}
        </AdminSection>
      </div>

      <div className="admin-split">
        <CatalogTable
          title="Largest services"
          description="Appoint catalog — highest revenue services this period."
          rows={data?.catalog?.services?.top ?? []}
          empty="No appointment line items in this range."
        />
        <CatalogTable
          title="Smallest services"
          description="Long-tail Appoint services. Useful for packaging and upsell later."
          rows={data?.catalog?.services?.bottom ?? []}
          empty="No appointment line items in this range."
        />
      </div>
      <div className="admin-split">
        <CatalogTable
          title="Largest SKUs"
          description="Mart catalog — highest GMV products this period."
          rows={data?.catalog?.skus?.top ?? []}
          empty="No shop order lines in this range."
        />
        <CatalogTable
          title="Smallest SKUs"
          description="Long-tail Mart SKUs, from mint candy up to bulk sacks."
          rows={data?.catalog?.skus?.bottom ?? []}
          empty="No shop order lines in this range."
        />
      </div>
      <p className="admin-panel__desc">
        <BarChart3 size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        {(data?.catalog?.services?.distinct ?? 0) + (data?.catalog?.skus?.distinct ?? 0)} distinct catalog items moved in
        this window · {kpis?.catalog_services ?? 0} services listed · {kpis?.catalog_skus ?? 0} active SKUs ·{' '}
        {kpis?.low_stock_skus ?? 0} low stock · {kpis?.notifications_sent ?? 0} notifications sent ·{' '}
        {kpis?.tickets_opened ?? 0} tickets opened
      </p>
    </AdminPage>
  );
}

export default PlatformAnalyticsPage;
