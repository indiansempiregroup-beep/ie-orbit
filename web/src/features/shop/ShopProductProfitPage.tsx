import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatMoney } from '../../lib/currency';

export function ShopProductProfitPage() {
  const client = useApiClient();
  const { activeBusiness } = useWorkspace();
  const businessId = activeBusiness?.id || '';
  const currency = activeBusiness?.currency || 'INR';
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const insights = useQuery({
    queryKey: ['shop-product-profit', businessId, dateFrom, dateTo],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.shop.productProfitInsights({
        business_id: businessId,
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
      });
      return response.data;
    },
  });

  const summary = insights.data?.summary;
  const catalog = insights.data?.catalog ?? [];
  const sales = insights.data?.sales ?? [];

  const topMargins = useMemo(
    () =>
      [...(insights.data?.top_margins ?? catalog)]
        .filter((row) => Number(row.avg_cost || row.purchase_price) > 0)
        .sort((a, b) => Number(b.margin_percent) - Number(a.margin_percent))
        .slice(0, 10),
    [catalog, insights.data?.top_margins],
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Product profit insights</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 14 }}>
            Owner-only. Sold profit uses cost at sale; catalog margins use avg cost. Prefer{' '}
            <Link to="/bi/profit">BI Profit</Link> for filters and trends.
          </p>
        </div>
        <Link to="/shop/products">
          <Button type="button" variant="neutral">
            Back to products
          </Button>
        </Link>
      </div>

      <Card>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            Sales from
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            Sales to
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
            />
          </label>
          <Button type="button" variant="neutral" onClick={() => void insights.refetch()}>
            Refresh
          </Button>
        </div>
      </Card>

      {insights.isLoading ? <p>Loading…</p> : null}
      {insights.error ? <p role="alert">{(insights.error as Error).message}</p> : null}

      {summary ? (
        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))',
          }}
        >
          {[
            ['Products', String(summary.product_count)],
            ['Inventory at cost', formatMoney(Number(summary.inventory_at_cost), currency)],
            ['Potential profit', formatMoney(Number(summary.potential_profit), currency)],
            ['Sales revenue', formatMoney(Number(summary.sales_revenue), currency)],
            ['Sales COGS', formatMoney(Number(summary.sales_cogs), currency)],
            ['Gross profit', formatMoney(Number(summary.gross_profit), currency)],
          ].map(([label, value]) => (
            <Card key={label}>
              <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{value}</div>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <h3 style={{ marginTop: 0 }}>Catalog margins</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Product', 'Sell', 'Avg cost', 'Last buy', 'Margin %', 'Stock', 'At cost'].map(
                  (label) => (
                    <th
                      key={label}
                      style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {(topMargins.length ? topMargins : catalog.slice(0, 25)).map((row) => (
                <tr key={row.product_id}>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>{row.name}</td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                    {formatMoney(Number(row.price), currency)}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                    {formatMoney(Number(row.avg_cost || row.purchase_price), currency)}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                    {formatMoney(Number(row.purchase_price), currency)}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                    {row.margin_percent}%
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                    {row.stock_on_hand}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                    {formatMoney(Number(row.inventory_at_cost), currency)}
                  </td>
                </tr>
              ))}
              {!catalog.length ? (
                <tr>
                  <td colSpan={7} style={{ padding: 12, color: 'var(--muted-foreground)' }}>
                    No products yet. Add purchase price on products to see margins.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Sold profit (by product)</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Product', 'Units', 'Revenue', 'COGS', 'Gross profit'].map((label) => (
                  <th
                    key={label}
                    style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sales.slice(0, 50).map((row) => (
                <tr key={row.product_id}>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>{row.name}</td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                    {row.units_sold}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                    {formatMoney(Number(row.revenue), currency)}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                    {formatMoney(Number(row.cogs), currency)}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                    {formatMoney(Number(row.gross_profit), currency)}
                  </td>
                </tr>
              ))}
              {!sales.length ? (
                <tr>
                  <td colSpan={5} style={{ padding: 12, color: 'var(--muted-foreground)' }}>
                    No sales in this period yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
