import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatMoney } from '../../lib/currency';
import { MetricTile } from './components/MetricTile';
import { StatCard } from './components/StatCard';
import { TablePagination } from './components/TablePagination';
import { WidgetHelpTitle } from './components/WidgetHelpTitle';
import { BooksInvoiceDrawer } from '../shop/BooksInvoiceDrawer';
import { BarGraph, CHART_PALETTE, DonutPieChart, LineAreaChart } from './components/charts';

const PROFIT_HELP = {
  kept:
    'Sell price minus what you paid for the stock (after discounts), then net of returns and cancelled bills. GST is shown separately — it is not subtracted from this number.',
  paid:
    'Total money customers paid you in this period, after any discounts on the bill. This is sales — not yet your profit.',
  discounts:
    'How much you reduced prices for customers. Higher discounts mean customers paid less, so you keep less profit.',
  returns:
    'Profit you lost because customers returned items. Counted against the original sale day so profit history stays complete.',
  stockCash:
    'How much cash is tied up in products still sitting on your shelf, based on what you paid for them.',
  losing:
    'How many products you sold for less than what they cost you. Raise the sell price, stop selling them, or buy cheaper.',
  stockCost:
    'What you paid for the products that were sold in this period (purchase / average cost).',
  cancels:
    'Profit that disappeared when bills were cancelled before or after confirmation.',
  potential:
    'If everything currently in stock sells at list price, roughly how much profit you could make.',
  gstCollected:
    'Output GST on sales in this period (extracted from inclusive prices, or added for exclusive). This is tax you collected for the government — not your profit.',
  gstRemit:
    'Approximate GST to pay the government for this period. Currently equals GST collected; purchase input credit (ITC) is not deducted yet.',
  bestDay: 'The weekday when you earned the most profit in this period — useful for staffing and stocking.',
  bestChannel: 'Where you made the most profit: shop counter (POS), pickup, or delivery.',
  bestCategory: 'The product category that made you the most profit in this period.',
  orders: 'How many customer bills were completed (cancelled bills are excluded). The hint shows average profit per completed bill.',
  itemsSold: 'How many individual items left the shop, and how many different products that covered.',
  rupeePie:
    'Shows where sale money went: what stock cost you, what you kept as profit, discounts you gave, and returns/cancels.',
  profitTrend: 'Your daily profit over time. Rising line means you are making more; falling means less.',
  revenueTrend: 'How much customers paid each day. This is sales money in — not profit.',
  channelPie: 'Splits your profit across POS, pickup, and delivery so you can see which channel earns more.',
  categoryPie: 'Splits your profit by product category so you know which kinds of products earn more.',
  weekdayBars: 'Compares profit across Mon–Sun. Helps you plan staff and stock for busy days.',
  makingMoney: 'Products that made you the most profit. Stock more of these and promote them.',
  losingList: 'Products sold below cost. Fix the sell price or purchase cost, or stop selling them.',
  soldTable: 'Line-by-line view of each product sold: shelf sell vs stock cost and your profit.',
  priceGaps: 'Catalog sell price vs what you paid — even for items not sold yet. Bigger gap usually means better profit room.',
  thinGaps: 'Items still in stock where sell price is close to cost. Little room if you need to discount.',
  loyalty:
    'Reward points you give customers when they buy, and points they use later to pay less. This section shows activity in the selected dates.',
  loyaltyGiven: 'Points added to customer accounts in this period — usually earned on purchases.',
  loyaltyUsed: 'Points customers spent in this period to reduce their bill.',
  loyaltyNet:
    'Given minus used. Positive means customers still hold more points from this period than they spent.',
  loyaltyMoves: 'How many times points were given or used in this period.',
  loyaltyMoneyGiven:
    'Bill amount you waived because customers redeemed reward points. This money is already taken out of sale profit.',
  loyaltyRowPoints:
    'Reward points on this sale or booking. Green (+) means you gave points; amber (−) means the customer used points to pay less.',
  loyaltyRowProfit:
    'Sell price minus stock cost after discounts (including reward points used). GST is separate. Not shown for bookings.',
} as const;

type ChannelFilter = 'all' | 'pos' | 'online_pickup' | 'online_delivery';
type SortKey = 'gross_profit' | 'margin_percent' | 'revenue' | 'units' | 'name';

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function presetRange(preset: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (preset === 'today') {
    return { from: isoDate(to), to: isoDate(to) };
  }
  if (preset === '7d') {
    from.setDate(from.getDate() - 6);
    return { from: isoDate(from), to: isoDate(to) };
  }
  if (preset === 'mtd') {
    from.setDate(1);
    return { from: isoDate(from), to: isoDate(to) };
  }
  // 30d default
  from.setDate(from.getDate() - 29);
  return { from: isoDate(from), to: isoDate(to) };
}

const CHANNEL_LABELS: Record<string, string> = {
  pos: 'POS',
  online_pickup: 'Pickup',
  online_delivery: 'Delivery',
};

export function BIProfitPage() {
  usePageMeta({ title: 'BI Profit — Orbit Mart' });
  const client = useApiClient();
  const { activeBusiness } = useWorkspace();
  const businessId = activeBusiness?.id || '';
  const currency = activeBusiness?.currency || 'INR';

  const initial = useMemo(() => presetRange('30d'), []);
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('gross_profit');
  const [offset, setOffset] = useState(0);
  const [loyaltyDirection, setLoyaltyDirection] = useState<'all' | 'given' | 'used'>('all');
  const [loyaltyQ, setLoyaltyQ] = useState('');
  const [loyaltySearch, setLoyaltySearch] = useState('');
  const [loyaltyOffset, setLoyaltyOffset] = useState(0);
  const [loyaltyPageSize, setLoyaltyPageSize] = useState(10);
  const [pageSize, setPageSize] = useState(10);
  const [booksInvoiceId, setBooksInvoiceId] = useState<string | null>(null);
  const limit = pageSize;

  const insights = useQuery({
    queryKey: ['bi-product-profit', businessId, dateFrom, dateTo, channel, search, sort, offset, pageSize],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.shop.productProfitInsights({
        business_id: businessId,
        date_from: dateFrom,
        date_to: dateTo,
        channel: channel === 'all' ? undefined : channel,
        q: search || undefined,
        sort,
        order: sort === 'name' ? 'asc' : 'desc',
        limit,
        offset,
        include_catalog: true,
      });
      return response.data;
    },
  });

  const loyalty = useQuery({
    queryKey: [
      'bi-loyalty-report',
      businessId,
      dateFrom,
      dateTo,
      loyaltyDirection,
      loyaltySearch,
      loyaltyOffset,
      loyaltyPageSize,
    ],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.customers.loyaltyReport({
        business: businessId,
        date_from: dateFrom,
        date_to: dateTo,
        direction: loyaltyDirection === 'all' ? undefined : loyaltyDirection,
        q: loyaltySearch || undefined,
        limit: loyaltyPageSize,
        offset: loyaltyOffset,
      });
      return response.data;
    },
  });

  const summary = insights.data?.summary;
  const comparison = insights.data?.comparison;
  const narrative = insights.data?.insights ?? [];
  const sales = insights.data?.sales ?? [];
  const byChannel = insights.data?.by_channel ?? [];
  const byCategory = insights.data?.by_category ?? [];
  const byWeekday = insights.data?.by_weekday ?? [];
  const series = insights.data?.series ?? [];
  const topMargins = insights.data?.top_margins ?? [];
  const lowMargins = insights.data?.low_margins ?? [];
  const topProfitProducts = insights.data?.top_profit_products ?? [];
  const lossMakers = insights.data?.loss_makers ?? [];
  const stockRisk = insights.data?.stock_risk ?? [];
  const salesTotal = insights.data?.sales_total ?? 0;
  const loyaltySummary = loyalty.data?.summary;
  const loyaltyLedger = loyalty.data?.ledger ?? [];
  const loyaltyTotal = loyalty.data?.ledger_total ?? loyaltySummary?.entry_count ?? 0;
  const loyaltyEnabled = loyalty.data?.enabled !== false;
  const loyaltyMix = useMemo(() => {
    if (!loyaltySummary) return [];
    return [
      {
        label: 'Given to customers',
        value: Math.max(0, Number(loyaltySummary.points_earned) || 0),
        color: '#0f766e',
      },
      {
        label: 'Used by customers',
        value: Math.max(0, Number(loyaltySummary.points_redeemed) || 0),
        color: '#b45309',
      },
    ].filter((row) => row.value > 0);
  }, [loyaltySummary]);

  const channelPie = useMemo(
    () =>
      byChannel.map((row, index) => ({
        label: CHANNEL_LABELS[row.channel] || row.channel,
        value: Math.max(0, Number(row.gross_profit) || 0),
        color: CHART_PALETTE[index % CHART_PALETTE.length],
      })),
    [byChannel],
  );

  const categoryPie = useMemo(
    () =>
      byCategory.slice(0, 7).map((row, index) => ({
        label: row.category_label || row.category,
        value: Math.max(0, Number(row.gross_profit) || 0),
        color: CHART_PALETTE[index % CHART_PALETTE.length],
      })),
    [byCategory],
  );

  const profitLine = useMemo(
    () =>
      series.map((row) => ({
        label: row.date,
        value: Number(row.gross_profit) || 0,
      })),
    [series],
  );

  const revenueLine = useMemo(
    () =>
      series.map((row) => ({
        label: row.date,
        value: Number(row.revenue) || 0,
      })),
    [series],
  );

  const weekdayBars = useMemo(
    () =>
      byWeekday.map((row, index) => ({
        label: row.label,
        value: Math.max(0, Number(row.gross_profit) || 0),
        color: CHART_PALETTE[index % CHART_PALETTE.length],
      })),
    [byWeekday],
  );

  const topProductBars = useMemo(
    () =>
      topProfitProducts.slice(0, 8).map((row, index) => ({
        label: row.name,
        value: Math.max(0, Number(row.gross_profit) || 0),
        color: CHART_PALETTE[index % CHART_PALETTE.length],
      })),
    [topProfitProducts],
  );

  const rupeePie = useMemo(
    () =>
      (insights.data?.rupee_composition ?? [])
        .map((row) => ({
          label: row.label,
          value: Math.max(0, Number(row.value) || 0),
          color: row.color,
        }))
        .filter((row) => row.value > 0),
    [insights.data?.rupee_composition],
  );

  const deltaColor = (value?: string) => {
    const n = Number(value);
    if (!Number.isFinite(n) || value === '') return undefined;
    if (n > 0) return '#059669';
    if (n < 0) return '#b91c1c';
    return undefined;
  };

  const deltaLabel = (value?: string) => {
    if (value == null || value === '') return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${n > 0 ? '+' : ''}${n}%`;
  };

  const insightToneColor = (tone: string) => {
    if (tone === 'positive') return '#059669';
    if (tone === 'warning') return '#b91c1c';
    return 'var(--muted-foreground)';
  };

  const applyPreset = (preset: string) => {
    const range = presetRange(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
    setOffset(0);
    setLoyaltyOffset(0);
  };

  const exportCsv = () => {
    const header = [
      'Product',
      'SKU',
      'Sold',
      'Customers paid',
      'Discounts',
      'What you paid for stock',
      'Your profit',
      'You keep %',
    ];
    const rows = sales.map((row) =>
      [
        row.name,
        row.sku || '',
        row.units_sold,
        row.revenue,
        row.discounts || '0',
        row.cogs,
        row.gross_profit,
        row.margin_percent || '',
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `bi-profit-${dateFrom}-${dateTo}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>Profit</h1>
        <p style={{ color: 'var(--muted-foreground)', marginBottom: 12 }}>
          Simple view of what you earned, what you spent on stock, and what ate into profit. Only you can see this —
          customers never see cost.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            ['today', 'Today'],
            ['7d', '7 days'],
            ['30d', '30 days'],
            ['mtd', 'MTD'],
          ].map(([key, label]) => (
            <Button key={key} type="button" variant="neutral" onClick={() => applyPreset(key)}>
              {label}
            </Button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setOffset(0);
              }}
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            To
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setOffset(0);
              }}
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            Channel
            <select
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value as ChannelFilter);
                setOffset(0);
              }}
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', minWidth: 140 }}
            >
              <option value="all">All</option>
              <option value="pos">POS</option>
              <option value="online_pickup">Pickup</option>
              <option value="online_delivery">Delivery</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13, flex: '1 1 180px' }}>
            Search product
            <input
              type="search"
              value={q}
              placeholder="Name or SKU"
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setSearch(q.trim());
                  setOffset(0);
                }
              }}
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            Sort
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as SortKey);
                setOffset(0);
              }}
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            >
              <option value="gross_profit">Your profit</option>
              <option value="margin_percent">You keep %</option>
              <option value="revenue">Customers paid</option>
              <option value="units">Sold</option>
              <option value="name">Name</option>
            </select>
          </label>
          <Button
            type="button"
            variant="neutral"
            onClick={() => {
              setSearch(q.trim());
              setOffset(0);
              void insights.refetch();
            }}
          >
            Apply
          </Button>
          <Link to="/shop/products" style={{ fontSize: 13, alignSelf: 'center' }}>
            Manage products
          </Link>
        </div>
      </Card>

      {insights.isLoading ? <Card>Loading profit insights…</Card> : null}
      {insights.error ? (
        <Card>
          <p role="alert" style={{ margin: 0, color: '#b91c1c' }}>
            {(insights.error as Error).message}
          </p>
        </Card>
      ) : null}

      {summary ? (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))' }}>
          <StatCard
            label="Money you kept"
            help={PROFIT_HELP.kept}
            tone="profit"
            value={formatMoney(Number(summary.kept_profit ?? summary.gross_profit), currency)}
            hint="Your profit after returns and cancels"
            meter={Math.min(100, Math.max(0, Number(summary.kept_rate_percent || 0)))}
            delta={
              comparison?.profit_delta_percent
                ? `${deltaLabel(comparison.profit_delta_percent)} vs last period`
                : summary.leakage_total && Number(summary.leakage_total) > 0
                  ? `${formatMoney(Number(summary.leakage_total), currency)} lost to returns/cancels`
                  : undefined
            }
            deltaPositive={
              comparison?.profit_delta_percent
                ? Number(comparison.profit_delta_percent) >= 0
                : !(summary.leakage_total && Number(summary.leakage_total) > 0)
            }
          />
          <StatCard
            label="Money customers paid"
            help={PROFIT_HELP.paid}
            tone="revenue"
            value={formatMoney(Number(summary.sales_revenue), currency)}
            hint="Total sales after discounts"
            delta={
              comparison?.revenue_delta_percent
                ? `${deltaLabel(comparison.revenue_delta_percent)} vs last period`
                : undefined
            }
            deltaPositive={
              comparison?.revenue_delta_percent ? Number(comparison.revenue_delta_percent) >= 0 : null
            }
          />
          <StatCard
            label="Discounts you gave"
            help={PROFIT_HELP.discounts}
            tone="warning"
            value={formatMoney(Number(summary.discounts_total || 0), currency)}
            hint={
              Number(summary.discounts_total || 0) > 0
                ? 'Lowered the bill for customers'
                : 'No discounts in this period'
            }
          />
          <StatCard
            label="Money lost on returns"
            help={PROFIT_HELP.returns}
            tone="warning"
            value={formatMoney(Number(summary.returns_profit || 0), currency)}
            hint="Profit given back when customers returned items"
          />
          <StatCard
            label="Cash stuck in stock"
            help={PROFIT_HELP.stockCash}
            tone="cost"
            value={formatMoney(Number(summary.inventory_at_cost), currency)}
            hint={
              summary.inventory_days_cover
                ? `About ${summary.inventory_days_cover} days of stock left at current sales`
                : 'What you paid for items still on the shelf'
            }
          />
          <StatCard
            label="Products losing money"
            help={PROFIT_HELP.losing}
            tone={summary.loss_maker_count ? 'warning' : 'success'}
            value={summary.loss_maker_count ?? 0}
            hint={
              summary.loss_maker_count
                ? 'Raise price, stop selling, or negotiate cheaper purchase'
                : 'None — every sold product made profit'
            }
          />
          <StatCard
            label="What stock cost you"
            help={PROFIT_HELP.stockCost}
            tone="cost"
            value={formatMoney(Number(summary.sales_cogs || 0), currency)}
            hint="Purchase cost of items sold"
          />
          <StatCard
            label="GST collected"
            help={PROFIT_HELP.gstCollected}
            tone="info"
            value={formatMoney(Number(summary.gst_collected || 0), currency)}
            hint="Output tax on sales — not your profit"
          />
          <StatCard
            label="GST to remit (approx)"
            help={PROFIT_HELP.gstRemit}
            tone="warning"
            value={formatMoney(Number(summary.gst_to_remit || summary.gst_collected || 0), currency)}
            hint="Equals GST collected until purchase ITC is tracked"
          />
          <StatCard
            label="Bills cancelled"
            help={PROFIT_HELP.cancels}
            tone="warning"
            value={formatMoney(Number(summary.cancels_profit || 0), currency)}
            hint="Profit cancelled with orders"
          />
          <StatCard
            label="If all stock sells"
            help={PROFIT_HELP.potential}
            tone="profit"
            value={formatMoney(Number(summary.potential_profit || 0), currency)}
            hint="Possible profit if shelf stock sells at list price"
          />
          <StatCard
            label="Best selling day"
            help={PROFIT_HELP.bestDay}
            tone="info"
            value={summary.best_weekday || '—'}
            hint={
              summary.best_weekday_profit
                ? formatMoney(Number(summary.best_weekday_profit), currency)
                : undefined
            }
          />
          <StatCard
            label="Best channel"
            help={PROFIT_HELP.bestChannel}
            tone="revenue"
            value={CHANNEL_LABELS[summary.best_channel || ''] || summary.best_channel || '—'}
            hint={
              summary.best_channel_profit
                ? formatMoney(Number(summary.best_channel_profit), currency)
                : undefined
            }
          />
          <StatCard
            label="Best category"
            help={PROFIT_HELP.bestCategory}
            tone="success"
            value={summary.best_category || '—'}
            hint={
              summary.best_category_profit
                ? formatMoney(Number(summary.best_category_profit), currency)
                : undefined
            }
          />
          <StatCard
            label="Orders"
            help={PROFIT_HELP.orders}
            tone="info"
            value={summary.order_count ?? 0}
            hint={`About ${formatMoney(Number(summary.avg_order_profit || 0), currency)} profit per bill`}
          />
          <StatCard
            label="Items sold"
            help={PROFIT_HELP.itemsSold}
            tone="info"
            value={summary.units_sold || '0'}
            hint={`${summary.products_sold_count ?? salesTotal} different products`}
          />
        </div>
      ) : null}

      {narrative.length ? (
        <Card>
          <h2 style={{ marginTop: 0 }}>What to notice</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {narrative.map((item) => (
              <div
                key={`${item.title}-${item.detail}`}
                style={{
                  display: 'grid',
                  gap: 4,
                  paddingBottom: 10,
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ fontWeight: 700, color: insightToneColor(item.tone) }}>{item.title}</div>
                <div style={{ fontSize: 14, color: 'var(--foreground)' }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <Card>
          <WidgetHelpTitle title="Where your money went" help={PROFIT_HELP.rupeePie} />
          <p style={{ marginTop: 8, color: 'var(--muted-foreground)', fontSize: 13 }}>
            How sale money split between stock cost, your profit, discounts, and returns
          </p>
          {rupeePie.length ? (
            <DonutPieChart
              data={rupeePie}
              centerLabel="split"
              formatValue={(value) => formatMoney(value, currency)}
            />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
              Add purchase cost on products and confirm sales to see this picture.
            </p>
          )}
        </Card>

        <Card>
          <WidgetHelpTitle title="Is profit going up?" help={PROFIT_HELP.profitTrend} />
          <p style={{ marginTop: 8, color: 'var(--muted-foreground)', fontSize: 13 }}>
            Day-by-day profit in this period
          </p>
          {profitLine.length > 1 ? (
            <LineAreaChart
              data={profitLine}
              color="#0f766e"
              formatValue={(value) => formatMoney(value, currency)}
              formatLabel={(label) => label.slice(5)}
            />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
              Need sales on at least 2 days to draw this line.
            </p>
          )}
        </Card>

        <Card>
          <WidgetHelpTitle title="Money coming in (daily)" help={PROFIT_HELP.revenueTrend} />
          <p style={{ marginTop: 8, color: 'var(--muted-foreground)', fontSize: 13 }}>
            Day-by-day sales customers paid
          </p>
          {revenueLine.length > 1 ? (
            <LineAreaChart
              data={revenueLine}
              color="#1d4ed8"
              formatValue={(value) => formatMoney(value, currency)}
              formatLabel={(label) => label.slice(5)}
            />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>Need at least 2 days of sales.</p>
          )}
        </Card>

        <Card>
          <WidgetHelpTitle title="Sales by channel" help={PROFIT_HELP.channelPie} />
          <div style={{ height: 8 }} />
          {channelPie.some((row) => row.value > 0) ? (
            <DonutPieChart
              data={channelPie}
              centerLabel="profit"
              formatValue={(value) => formatMoney(value, currency)}
            />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>No channel split yet.</p>
          )}
        </Card>

        <Card>
          <WidgetHelpTitle title="Sales by category" help={PROFIT_HELP.categoryPie} />
          <div style={{ height: 8 }} />
          {categoryPie.some((row) => row.value > 0) ? (
            <DonutPieChart
              data={categoryPie}
              centerLabel="profit"
              formatValue={(value) => formatMoney(value, currency)}
            />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>No category sales yet.</p>
          )}
        </Card>

        <Card>
          <WidgetHelpTitle title="Which weekday earns more" help={PROFIT_HELP.weekdayBars} />
          <div style={{ height: 8 }} />
          {weekdayBars.some((row) => row.value > 0) ? (
            <BarGraph
              data={weekdayBars}
              color="#0369a1"
              formatValue={(value) => formatMoney(value, currency)}
            />
          ) : (
            <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>No weekday data yet.</p>
          )}
        </Card>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Card>
          <WidgetHelpTitle title="Products making you money" help={PROFIT_HELP.makingMoney} />
          <p style={{ marginTop: 8, color: 'var(--muted-foreground)', fontSize: 13 }}>
            Stock more of these / push them to customers
          </p>
          {topProductBars.some((row) => row.value > 0) ? (
            <div style={{ marginBottom: 12 }}>
              <BarGraph
                data={topProductBars}
                color="#0f766e"
                formatValue={(value) => formatMoney(value, currency)}
              />
            </div>
          ) : null}
          <div style={{ display: 'grid', gap: 10 }}>
            {topProfitProducts.slice(0, 8).map((row) => (
              <div key={row.product_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {row.units_sold} sold
                    {row.margin_percent != null ? ` · you keep ${row.margin_percent}%` : ''}
                  </div>
                </div>
                <span style={{ fontWeight: 700 }}>{formatMoney(Number(row.gross_profit), currency)}</span>
              </div>
            ))}
            {!topProfitProducts.length ? (
              <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>No sales profit yet.</p>
            ) : null}
          </div>
        </Card>

        <Card>
          <WidgetHelpTitle title="Products losing money" help={PROFIT_HELP.losingList} />
          <p style={{ marginTop: 8, color: 'var(--muted-foreground)', fontSize: 13 }}>
            Selling price is below what you paid — fix price or cost
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {lossMakers.map((row) => (
              <div key={row.product_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {row.units_sold} sold · stock cost {formatMoney(Number(row.cogs), currency)}
                  </div>
                </div>
                <span style={{ fontWeight: 700, color: '#b91c1c' }}>
                  {formatMoney(Number(row.gross_profit), currency)}
                </span>
              </div>
            ))}
            {!lossMakers.length ? (
              <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>None right now — good.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <WidgetHelpTitle title="Sold products" help={PROFIT_HELP.soldTable} />
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
              {salesTotal} product{salesTotal === 1 ? '' : 's'} sold in this period
            </p>
          </div>
          <Button type="button" variant="neutral" onClick={exportCsv} disabled={!sales.length}>
            Export CSV
          </Button>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {[
                  'Product',
                  'Sold',
                  'Customers paid',
                  'Discounts',
                  'What you paid for stock',
                  'Your profit',
                  'You keep %',
                ].map((label) => (
                  <th
                    key={label}
                    style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sales.map((row) => (
                <tr key={row.product_id}>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600 }}>{row.name}</div>
                    {row.sku ? (
                      <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{row.sku}</div>
                    ) : null}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>{row.units_sold}</td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                    {formatMoney(Number(row.revenue), currency)}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                    {formatMoney(Number(row.discounts || 0), currency)}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                    {formatMoney(Number(row.cogs), currency)}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
                    {formatMoney(Number(row.gross_profit), currency)}
                  </td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                    {row.margin_percent ?? '—'}%
                  </td>
                </tr>
              ))}
              {!sales.length ? (
                <tr>
                  <td colSpan={7} style={{ padding: 12, color: 'var(--muted-foreground)' }}>
                    No sales in this period yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <TablePagination
          total={salesTotal}
          offset={offset}
          pageSize={pageSize}
          label="products"
          onPageChange={setOffset}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setOffset(0);
          }}
        />
      </Card>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Card>
          <WidgetHelpTitle title="Best price gaps (catalog)" help={PROFIT_HELP.priceGaps} />
          <p style={{ marginTop: 8, fontSize: 13, color: 'var(--muted-foreground)' }}>
            Sell price vs what you paid — not only sold items
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {topMargins.map((row) => (
              <div key={row.product_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    Sell {formatMoney(Number(row.price), currency)} · Cost{' '}
                    {formatMoney(Number(row.avg_cost || row.purchase_price), currency)}
                  </div>
                </div>
                <span style={{ fontWeight: 700 }}>{row.margin_percent}%</span>
              </div>
            ))}
            {!topMargins.length ? (
              <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
                Add purchase price on products to unlock this.
              </p>
            ) : null}
          </div>
        </Card>
        <Card>
          <WidgetHelpTitle title="Thin price gaps on shelf" help={PROFIT_HELP.thinGaps} />
          <p style={{ marginTop: 8, fontSize: 13, color: 'var(--muted-foreground)' }}>
            In stock with little room between cost and sell price
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {(stockRisk.length ? stockRisk : lowMargins).map((row) => (
              <div key={row.product_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{row.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {stockRisk.length
                      ? `Stock ${row.stock_on_hand}`
                      : `Gap ${formatMoney(Number(row.margin), currency)}`}
                  </div>
                </div>
                <span style={{ fontWeight: 700, color: '#b91c1c' }}>{row.margin_percent}%</span>
              </div>
            ))}
            {!stockRisk.length && !lowMargins.length ? (
              <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>Nothing flagged.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'start' }}>
          <div>
            <WidgetHelpTitle title="Reward points" help={PROFIT_HELP.loyalty} />
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
              Points you give on sales, and points customers use to pay less
            </p>
          </div>
          <Link to="/shop/loyalty" style={{ fontSize: 13, alignSelf: 'center' }}>
            Full activity
          </Link>
        </div>

        {loyalty.isLoading ? (
          <p style={{ color: 'var(--muted-foreground)', marginTop: 12 }}>Loading reward points…</p>
        ) : null}

        {!loyalty.isLoading && !loyaltyEnabled ? (
          <p style={{ margin: '12px 0 0', color: '#b45309', fontSize: 13 }}>
            Reward points are turned off for this business. Turn them on in product settings to start tracking.
          </p>
        ) : null}

        {loyaltySummary ? (
          <div style={{ display: 'grid', gap: 16, marginTop: 14 }}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <StatCard
                label="Points you gave"
                help={PROFIT_HELP.loyaltyGiven}
                tone="success"
                value={loyaltySummary.points_earned}
                hint="Added to customer balances"
              />
              <StatCard
                label="Points customers used"
                help={PROFIT_HELP.loyaltyUsed}
                tone="warning"
                value={loyaltySummary.points_redeemed}
                hint="Taken off bills as rewards"
              />
              <StatCard
                label="Still with customers"
                help={PROFIT_HELP.loyaltyNet}
                tone={Number(loyaltySummary.net_points) >= 0 ? 'info' : 'warning'}
                value={loyaltySummary.net_points}
                hint={
                  Number(loyaltySummary.net_points) >= 0
                    ? 'More given than used in this period'
                    : 'Customers used more than you gave in this period'
                }
              />
              <StatCard
                label="Times points moved"
                help={PROFIT_HELP.loyaltyMoves}
                tone="info"
                value={loyaltySummary.entry_count}
                hint="Give + use events"
              />
              <StatCard
                label="Money given as rewards"
                help={PROFIT_HELP.loyaltyMoneyGiven}
                tone="warning"
                value={formatMoney(Number(loyaltySummary.redeem_discount_total || 0), currency)}
                hint="Taken off bills when points were used"
              />
            </div>

            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Given vs used</h3>
              {loyaltyMix.length ? (
                <DonutPieChart data={loyaltyMix} centerLabel="points" size={160} />
              ) : (
                <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 13 }}>
                  No points given or used in this period.
                </p>
              )}
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  alignItems: 'end',
                  marginBottom: 10,
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: 14 }}>All point activity</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>
                    {loyaltyTotal} entr{loyaltyTotal === 1 ? 'y' : 'ies'} in this period
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    Show
                    <select
                      value={loyaltyDirection}
                      onChange={(event) => {
                        setLoyaltyDirection(event.target.value as 'all' | 'given' | 'used');
                        setLoyaltyOffset(0);
                      }}
                      style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)' }}
                    >
                      <option value="all">All</option>
                      <option value="given">Given only</option>
                      <option value="used">Used only</option>
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    Search
                    <input
                      type="search"
                      value={loyaltyQ}
                      placeholder="Customer or reason"
                      onChange={(event) => setLoyaltyQ(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          setLoyaltySearch(loyaltyQ.trim());
                          setLoyaltyOffset(0);
                        }
                      }}
                      style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', minWidth: 160 }}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="neutral"
                    onClick={() => {
                      setLoyaltySearch(loyaltyQ.trim());
                      setLoyaltyOffset(0);
                    }}
                  >
                    Apply
                  </Button>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['When', 'Customer', 'What happened', 'Linked record', 'Points / profit'].map((label) => (
                        <th
                          key={label}
                          style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loyaltyLedger.map((row) => {
                      const sourceLabel = String(row.source_label || '').trim();
                      const isOnlineOrder =
                        sourceLabel === 'Online order' || sourceLabel.startsWith('Online order');
                      const invoiceVoucherId = String(row.invoice_voucher_id || row.voucher_id || '').trim();
                      const onlineOrderId = String(row.linked_order_id || row.order_id || '').trim();
                      const onlineHref =
                        isOnlineOrder && onlineOrderId ? `/shop/orders/${onlineOrderId}` : null;
                      const bookingFallbackHref =
                        !invoiceVoucherId && row.record_kind === 'booking' && row.booking_id
                          ? `/bookings/${row.booking_id}`
                          : null;
                      const recordText =
                        row.record_kind === 'order'
                          ? `${sourceLabel || 'Shop invoice'} ${row.order_number || row.record_label || ''}`.trim()
                          : row.record_kind === 'booking'
                            ? `Booking ${row.booking_number || row.record_label || ''}`.trim()
                            : row.record_kind === 'voucher'
                              ? row.voucher_type === 'purchase'
                                ? `Books purchase ${row.voucher_number || ''}`.trim()
                                : `${sourceLabel || 'Books sale'} ${row.voucher_number || ''}`.trim()
                              : '';
                      // Online → order page. POS / Booking / Books → invoice popup.
                      const openInvoice = Boolean(invoiceVoucherId) && !(isOnlineOrder && onlineOrderId);
                      const isBooking =
                        row.record_kind === 'booking' || sourceLabel === 'Booking';
                      const bothPoints =
                        Number(row.record_points_earned || 0) > 0 &&
                        Number(row.record_points_redeemed || 0) > 0;
                      const profitAmount =
                        !isBooking && row.gross_profit != null && row.gross_profit !== ''
                          ? Number(row.gross_profit)
                          : null;
                      const profitPositive = profitAmount != null && profitAmount >= 0;
                      const earnedPts =
                        Number(row.record_points_earned) ||
                        (row.points_delta > 0 ? row.points_delta : 0);
                      const redeemedPts =
                        Number(row.record_points_redeemed) ||
                        (row.points_delta < 0 ? Math.abs(row.points_delta) : 0);
                      const pointsTone =
                        bothPoints
                          ? 'neutral'
                          : redeemedPts > 0 && earnedPts <= 0
                            ? 'warning'
                            : 'positive';
                      return (
                        <tr key={row.id}>
                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                            {row.created_at
                              ? new Date(row.created_at).toLocaleString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </td>
                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                            {row.customer_id ? (
                              <Link to={`/customers/${row.customer_id}`}>{row.customer_name || 'Customer'}</Link>
                            ) : (
                              row.customer_name || '—'
                            )}
                          </td>
                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                            {bothPoints
                              ? 'Points given and used'
                              : row.reason || row.entry_type || 'Points update'}
                          </td>
                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                            {onlineHref && recordText ? (
                              <Link to={onlineHref}>{recordText}</Link>
                            ) : openInvoice && recordText ? (
                              <button
                                type="button"
                                onClick={() => setBooksInvoiceId(invoiceVoucherId)}
                                style={{
                                  border: 'none',
                                  background: 'none',
                                  padding: 0,
                                  color: 'var(--primary)',
                                  cursor: 'pointer',
                                  font: 'inherit',
                                  textDecoration: 'underline',
                                }}
                              >
                                {recordText}
                              </button>
                            ) : bookingFallbackHref && recordText ? (
                              <Link to={bookingFallbackHref}>{recordText}</Link>
                            ) : recordText ? (
                              recordText
                            ) : (
                              '—'
                            )}
                          </td>
                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 6,
                                alignItems: 'center',
                              }}
                            >
                              <MetricTile
                                label="Points"
                                icon="gift"
                                tone={pointsTone}
                                help={PROFIT_HELP.loyaltyRowPoints}
                                title={PROFIT_HELP.loyaltyRowPoints}
                                value={
                                  <>
                                    {earnedPts > 0 ? (
                                      <span style={{ color: '#0f766e' }}>+{earnedPts}</span>
                                    ) : null}
                                    {earnedPts > 0 && redeemedPts > 0 ? (
                                      <span style={{ color: 'var(--muted-foreground)' }}> · </span>
                                    ) : null}
                                    {redeemedPts > 0 ? (
                                      <span style={{ color: '#b45309' }}>−{redeemedPts}</span>
                                    ) : null}
                                    {!earnedPts && !redeemedPts ? '—' : null}
                                  </>
                                }
                              />
                              {profitAmount != null ? (
                                <MetricTile
                                  label="Profit"
                                  icon="trending-up"
                                  tone={profitPositive ? 'positive' : 'negative'}
                                  help={PROFIT_HELP.loyaltyRowProfit}
                                  title={PROFIT_HELP.loyaltyRowProfit}
                                  value={formatMoney(profitAmount, currency)}
                                />
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!loyaltyLedger.length ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 12, color: 'var(--muted-foreground)' }}>
                          No point movements match these filters.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <TablePagination
                total={loyaltyTotal}
                offset={loyaltyOffset}
                pageSize={loyaltyPageSize}
                label="entries"
                onPageChange={setLoyaltyOffset}
                onPageSizeChange={(size) => {
                  setLoyaltyPageSize(size);
                  setLoyaltyOffset(0);
                }}
              />
            </div>
          </div>
        ) : !loyalty.isLoading && loyaltyEnabled ? (
          <p style={{ color: 'var(--muted-foreground)', marginTop: 12 }}>No reward points activity yet.</p>
        ) : null}
      </Card>

      <BooksInvoiceDrawer
        voucherId={booksInvoiceId}
        open={Boolean(booksInvoiceId)}
        onClose={() => setBooksInvoiceId(null)}
      />
    </div>
  );
}

export default BIProfitPage;
