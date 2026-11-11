import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { DesktopPage } from '../../components/DesktopPage';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { Card } from '../../components/ui/Card';
import { HelpModal } from '../../components/ui/HelpModal';
import { ScreenState } from '../../components/ScreenState';
import { StatTile } from '../../components/ui/StatTile';
import { TileGrid } from '../../components/ui/TileGrid';
import { BarChart } from '../../components/charts/BarChart';
import { ChartCard } from '../../components/charts/ChartCard';
import { ChartGrid } from '../../components/charts/ChartGrid';
import { DonutChart } from '../../components/charts/DonutChart';
import { LineAreaChart } from '../../components/charts/LineAreaChart';
import { fillDailySeries, formatAxisValue } from '../../components/charts/chartUtils';
import { StaffReportFilter } from '../../components/StaffReportFilter';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useStaffMembers } from '../../hooks/useOpsData';
import { useReportStaffFilter } from '../../hooks/useReportStaffFilter';
import {
  useBIForecast,
  useBIGrowth,
  useBIOverview,
  useBIReports,
  useBIRevenue,
  useBusinessBillingSnapshot,
} from '../../hooks/useOpsExtended';
import { productsWithBiFeature } from '../../utils/planFeatures';
import { getSubscribedProductIds } from '../../utils/products';
import { colors, fonts, iconTones, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { formatMoney } from '../shop/posPayment';
import { BooksInvoiceDrawer } from '../shop/BooksInvoiceDrawer';
import { InsightPanel } from './InsightPanel';
import { LoyaltyMetricTile } from './LoyaltyMetricTile';

type Tab = 'overview' | 'profit' | 'growth' | 'revenue' | 'forecast' | 'reports';
type ProductKey = 'appointie' | 'shopie';

function resolveProduct(showAppointie: boolean, showShopie: boolean, preferred: ProductKey): ProductKey {
  if (showAppointie && showShopie) return preferred;
  if (showShopie && !showAppointie) return 'shopie';
  return 'appointie';
}

const TAB_META: Record<
  Tab,
  { labelKey: string; icon: keyof typeof Feather.glyphMap; hintKey: string }
> = {
  overview: { labelKey: 'bi.overview', icon: 'pie-chart', hintKey: 'bi.mobile.hintOverview' },
  profit: { labelKey: 'bi.profit', icon: 'trending-up', hintKey: 'bi.mobile.hintProfit' },
  growth: { labelKey: 'bi.growth', icon: 'users', hintKey: 'bi.mobile.hintGrowth' },
  revenue: { labelKey: 'bi.revenue', icon: 'dollar-sign', hintKey: 'bi.mobile.hintRevenue' },
  forecast: { labelKey: 'bi.forecast', icon: 'activity', hintKey: 'bi.mobile.hintForecast' },
  reports: { labelKey: 'bi.reports', icon: 'file-text', hintKey: 'bi.mobile.hintReports' },
};

function biFeatureAllowed(allowed: Set<string>, feature: string) {
  return allowed.has(feature);
}

function BiProductSwitch({
  showAppointie,
  showShopie,
  value,
  onChange,
}: {
  showAppointie: boolean;
  showShopie: boolean;
  value: ProductKey;
  onChange: (next: ProductKey) => void;
}) {
  const { t } = useTranslation();
  if (!(showAppointie && showShopie)) return null;
  return (
    <View style={styles.productTrack}>
      {(
        [
          ['appointie', 'Orbit Appoint'],
          ['shopie', 'Orbit Mart'],
        ] as const
      ).map(([key, label]) => {
        const active = value === key;
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.productBtn, active && styles.productBtnActive]}
            onPress={() => onChange(key)}
          >
            <Text style={[styles.productBtnText, active && styles.productBtnTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function pct(value?: number | null) {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

function changeLabel(value: number | null | undefined, t: TFunction) {
  if (value == null) return undefined;
  const prefix = value > 0 ? '+' : '';
  return t('bi.changeVsPrior', { value: `${prefix}${value}` });
}

function money(amount?: number | null, currency?: string | null) {
  if (amount == null) return '—';
  return formatMoney(Number(amount), currency);
}

function appointieFromOverview(data: ReturnType<typeof useBIOverview>['data']) {
  return (
    data?.appointie ??
    (data?.summary && data?.revenue && data?.trends
      ? {
          summary: data.summary,
          revenue: data.revenue,
          trends: data.trends,
          growth: data.growth,
          operations: data.operations,
          insights: data.insights,
        }
      : null)
  );
}

export function BIScreen() {
  const { t } = useTranslation();
  const route = useRoute<RouteProp<RootStackParamList, 'BI'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { activeBusiness } = useWorkspace();
  const { billing } = useBusinessBillingSnapshot();
  const subscribedIds = useMemo(
    () => getSubscribedProductIds(activeBusiness?.product_subscriptions),
    [activeBusiness?.product_subscriptions],
  );
  const { staffId, setStaffId, canFilter } = useReportStaffFilter();
  const { staff } = useStaffMembers({ status: 'active', pageSize: 100 });
  const allowed = useMemo(
    () =>
      new Set(
        (Object.keys(TAB_META) as Tab[]).filter(
          (key) => productsWithBiFeature(billing, key, subscribedIds).length > 0,
        ),
      ),
    [billing, subscribedIds],
  );
  const visibleTabs = useMemo(
    () => (Object.keys(TAB_META) as Tab[]).filter((key) => allowed.has(key)),
    [allowed],
  );
  const showAppointieOverview = productsWithBiFeature(billing, 'overview', subscribedIds).includes('appointie');
  const showShopieOverview = productsWithBiFeature(billing, 'overview', subscribedIds).includes('shopie');
  const showAppointieProfit = productsWithBiFeature(billing, 'profit', subscribedIds).includes('appointie');
  const showShopieProfit = productsWithBiFeature(billing, 'profit', subscribedIds).includes('shopie');
  const showAppointieGrowth = productsWithBiFeature(billing, 'growth', subscribedIds).includes('appointie');
  const showShopieGrowth = productsWithBiFeature(billing, 'growth', subscribedIds).includes('shopie');
  const showAppointieRevenue = productsWithBiFeature(billing, 'revenue', subscribedIds).includes('appointie');
  const showShopieRevenue = productsWithBiFeature(billing, 'revenue', subscribedIds).includes('shopie');
  const showAppointieForecast = productsWithBiFeature(billing, 'forecast', subscribedIds).includes('appointie');
  const showShopieForecast = productsWithBiFeature(billing, 'forecast', subscribedIds).includes('shopie');
  const showAppointieReports = productsWithBiFeature(billing, 'reports', subscribedIds).includes('appointie');
  const showShopieReports = productsWithBiFeature(billing, 'reports', subscribedIds).includes('shopie');
  const [tab, setTab] = useState<Tab>(route.params?.tab ?? 'overview');
  const [product, setProduct] = useState<ProductKey>('appointie');
  const [profitRefreshTick, setProfitRefreshTick] = useState(0);
  const overview = useBIOverview(true, staffId);
  const growth = useBIGrowth(staffId);
  const revenue = useBIRevenue(staffId);
  const forecast = useBIForecast(staffId);
  const reports = useBIReports(staffId);

  useEffect(() => {
    if (
      route.params?.tab &&
      visibleTabs.includes(route.params.tab) &&
      biFeatureAllowed(allowed, route.params.tab)
    ) {
      setTab(route.params.tab);
    }
  }, [allowed, route.params?.tab, visibleTabs]);

  useEffect(() => {
    if (!visibleTabs.includes(tab)) setTab('overview');
  }, [tab, visibleTabs]);

  const reload = async () => {
    await Promise.all([
      overview.reload(),
      growth.reload(),
      revenue.reload(),
      forecast.reload(),
      reports.reload(),
    ]);
    setProfitRefreshTick((tick) => tick + 1);
  };
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const loading =
    overview.loading || growth.loading || revenue.loading || forecast.loading || reports.loading;
  const { isDesktop } = useBreakpoint();
  const tabLocked = !biFeatureAllowed(allowed, tab);

  return (
    <DesktopPage>
      <BITabBar
        tabs={visibleTabs}
        active={tab}
        allowed={allowed}
        isDesktop={isDesktop}
        onChange={(next) => {
          setTab(next);
          navigation.setParams({ tab: next });
        }}
        staffFilter={
          canFilter ? (
            <StaffReportFilter staff={staff} staffId={staffId} onChange={setStaffId} />
          ) : null
        }
      />
      <RefreshableScrollView
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        {tabLocked ? (
          <Card style={styles.lockCard}>
            <Text style={styles.lockTitle}>
              {tab === 'profit'
                ? t('bi.mobile.profitLockedTitle')
                : t('bi.mobile.proTitle', { tab: t(TAB_META[tab].labelKey) })}
            </Text>
            <Text style={styles.lockMeta}>
              {tab === 'profit' ? t('bi.mobile.profitLockedBody') : t('bi.mobile.proBody')}
            </Text>
            <Pressable style={styles.lockCta} onPress={() => navigation.navigate('ProductSettings')}>
              <Text style={styles.lockCtaText}>{t('bi.mobile.upgradePlan')}</Text>
            </Pressable>
          </Card>
        ) : null}
        {!tabLocked && tab === 'overview' ? (
          <BIOverview
            data={overview.data}
            loading={overview.loading}
            showAppointie={showAppointieOverview}
            showShopie={showShopieOverview}
            product={product}
            onProductChange={setProduct}
          />
        ) : null}
        {!tabLocked && tab === 'profit' ? (
          <BIProfitTab
            staffId={staffId}
            refreshTick={profitRefreshTick}
            showAppointie={showAppointieProfit}
            showShopie={showShopieProfit}
            product={product}
            onProductChange={setProduct}
          />
        ) : null}
        {!tabLocked && tab === 'growth' ? (
          <BIGrowth
            data={growth.data}
            loading={growth.loading}
            showAppointie={showAppointieGrowth}
            showShopie={showShopieGrowth}
            product={product}
            onProductChange={setProduct}
          />
        ) : null}
        {!tabLocked && tab === 'revenue' ? (
          <BIRevenue
            data={revenue.data}
            loading={revenue.loading}
            showAppointie={showAppointieRevenue}
            showShopie={showShopieRevenue}
            product={product}
            onProductChange={setProduct}
          />
        ) : null}
        {!tabLocked && tab === 'forecast' ? (
          <BIForecast
            data={forecast.data}
            loading={forecast.loading}
            recentBookings={appointieFromOverview(overview.data)?.summary?.bookings}
            recentOrders={overview.data?.shopie?.orders}
            showAppointie={showAppointieForecast}
            showShopie={showShopieForecast}
            product={product}
            onProductChange={setProduct}
          />
        ) : null}
        {!tabLocked && tab === 'reports' ? (
          <BIReports
            data={reports.data}
            loading={reports.loading}
            showAppointie={showAppointieReports}
            showShopie={showShopieReports}
            product={product}
            onProductChange={setProduct}
          />
        ) : null}
      </RefreshableScrollView>
    </DesktopPage>
  );
}

function BITabBar({
  tabs,
  active,
  allowed,
  isDesktop,
  onChange,
  staffFilter,
}: {
  tabs: Tab[];
  active: Tab;
  allowed: Set<string>;
  isDesktop: boolean;
  onChange: (tab: Tab) => void;
  staffFilter?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const buttons = tabs.map((key) => {
    const meta = TAB_META[key];
    const tabLabel = t(meta.labelKey);
    const locked = !biFeatureAllowed(allowed, key);
    const selected = active === key;
    return (
      <Pressable
        key={key}
        onPress={() => onChange(key)}
        accessibilityRole="tab"
        accessibilityState={{ selected, disabled: false }}
        accessibilityLabel={locked ? t('bi.mobile.tabLockedA11y', { label: tabLabel }) : tabLabel}
        style={({ pressed }) => [
          styles.tabBtn,
          isDesktop && styles.tabBtnDesktop,
          selected && styles.tabBtnActive,
          locked && !selected && styles.tabBtnLocked,
          pressed && styles.tabBtnPressed,
        ]}
      >
        <View style={[styles.tabIconWrap, selected && styles.tabIconWrapActive]}>
          <Feather name={meta.icon} size={15} color={selected ? colors.primaryForeground : colors.primary} />
        </View>
        <View style={styles.tabCopy}>
          <View style={styles.tabLabelRow}>
            <Text style={[styles.tabLabel, selected && styles.tabLabelActive]} numberOfLines={1}>
              {tabLabel}
            </Text>
            {locked ? <Feather name="lock" size={11} color={selected ? colors.primaryForeground : colors.mutedForeground} /> : null}
          </View>
          <Text style={[styles.tabHint, selected && styles.tabHintActive]} numberOfLines={1}>
            {locked ? t('bi.pro') : t(meta.hintKey)}
          </Text>
        </View>
      </Pressable>
    );
  });

  if (isDesktop) {
    return (
      <View style={styles.tabBar} accessibilityRole="tablist">
        <View style={styles.tabTrack}>{buttons}</View>
        {staffFilter ? <View style={styles.tabStaffFilter}>{staffFilter}</View> : null}
      </View>
    );
  }

  return (
    <View style={styles.tabBar} accessibilityRole="tablist">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabScroll}
      >
        {buttons}
      </ScrollView>
      {staffFilter ? <View style={styles.tabStaffFilter}>{staffFilter}</View> : null}
    </View>
  );
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function profitPresetRange(preset: '7d' | '30d' | 'mtd'): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (preset === 'mtd') {
    from.setDate(1);
  } else if (preset === '7d') {
    from.setDate(from.getDate() - 6);
  } else {
    from.setDate(from.getDate() - 29);
  }
  return { from: isoDate(from), to: isoDate(to) };
}

function loyaltyPointParts(row: {
  points_delta: number;
  record_points_earned?: number;
  record_points_redeemed?: number;
}): { earned: number; redeemed: number } {
  const earned =
    Number(row.record_points_earned) || (row.points_delta > 0 ? row.points_delta : 0);
  const redeemed =
    Number(row.record_points_redeemed) || (row.points_delta < 0 ? Math.abs(row.points_delta) : 0);
  if (earned || redeemed) return { earned, redeemed };
  if (row.points_delta > 0) return { earned: row.points_delta, redeemed: 0 };
  if (row.points_delta < 0) return { earned: 0, redeemed: Math.abs(row.points_delta) };
  return { earned: 0, redeemed: 0 };
}

const LOYALTY_PAGE_SIZES = [10, 25, 50, 100] as const;

function buildPageList(current: number, totalPages: number): Array<number | '…'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages = new Set<number>([1, totalPages, current, current - 1, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const result: Array<number | '…'> = [];
  for (const page of sorted) {
    const prev = result[result.length - 1];
    if (typeof prev === 'number' && page - prev > 1) result.push('…');
    result.push(page);
  }
  return result;
}

function LoyaltyPagination({
  total,
  offset,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  total: number;
  offset: number;
  pageSize: number;
  onPageChange: (offset: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
  const currentPage = Math.min(totalPages, Math.floor(Math.max(0, offset) / Math.max(1, pageSize)) + 1);
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, total);
  const { t } = useTranslation();
  const pages = useMemo(() => buildPageList(currentPage, totalPages), [currentPage, totalPages]);
  const go = (page: number) => onPageChange((Math.min(totalPages, Math.max(1, page)) - 1) * pageSize);

  return (
    <View style={styles.pager}>
      <View style={styles.pagerMetaRow}>
        <Text style={styles.rowMeta}>
          {t('bi.pagination.range', { from, to, total, label: t('bi.pagination.entries') })}
        </Text>
        <View style={styles.pagerSizeRow}>
          {LOYALTY_PAGE_SIZES.map((size) => (
            <Pressable
              key={size}
              style={[styles.pagerBtn, pageSize === size && styles.pagerBtnActive]}
              onPress={() => onPageSizeChange(size)}
            >
              <Text style={[styles.pagerBtnText, pageSize === size && styles.pagerBtnTextActive]}>{size}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {totalPages > 1 ? (
        <View style={styles.pagerNav}>
          <Pressable
            style={[styles.pagerBtn, currentPage <= 1 && styles.pagerBtnDisabled]}
            disabled={currentPage <= 1}
            onPress={() => go(1)}
          >
            <Text style={styles.pagerBtnText}>«</Text>
          </Pressable>
          <Pressable
            style={[styles.pagerBtn, currentPage <= 1 && styles.pagerBtnDisabled]}
            disabled={currentPage <= 1}
            onPress={() => go(currentPage - 1)}
          >
            <Text style={styles.pagerBtnText}>‹</Text>
          </Pressable>
          {pages.map((page, index) =>
            page === '…' ? (
              <Text key={`ellipsis-${index}`} style={styles.rowMeta}>
                …
              </Text>
            ) : (
              <Pressable
                key={page}
                style={[styles.pagerBtn, page === currentPage && styles.pagerBtnActive]}
                onPress={() => go(page)}
              >
                <Text style={[styles.pagerBtnText, page === currentPage && styles.pagerBtnTextActive]}>{page}</Text>
              </Pressable>
            ),
          )}
          <Pressable
            style={[styles.pagerBtn, currentPage >= totalPages && styles.pagerBtnDisabled]}
            disabled={currentPage >= totalPages}
            onPress={() => go(currentPage + 1)}
          >
            <Text style={styles.pagerBtnText}>›</Text>
          </Pressable>
          <Pressable
            style={[styles.pagerBtn, currentPage >= totalPages && styles.pagerBtnDisabled]}
            disabled={currentPage >= totalPages}
            onPress={() => go(totalPages)}
          >
            <Text style={styles.pagerBtnText}>»</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function BIProfitTab({
  staffId,
  refreshTick = 0,
  showAppointie = false,
  showShopie = true,
  product: preferredProduct = 'appointie',
  onProductChange,
}: {
  staffId?: string | null;
  refreshTick?: number;
  showAppointie?: boolean;
  showShopie?: boolean;
  product?: ProductKey;
  onProductChange?: (next: ProductKey) => void;
}) {
  const product = resolveProduct(showAppointie, showShopie, preferredProduct);
  const client = useOpsClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { businessId, activeBusiness } = useWorkspace();
  const { t } = useTranslation();
  const currency = activeBusiness?.currency || 'INR';
  const PROFIT_HELP = useMemo(
    () => ({
      kept: t('bi.profitHelp.kept'),
      paid: t('bi.profitHelp.paid'),
      discounts: t('bi.profitHelp.discounts'),
      returns: t('bi.profitHelp.returns'),
      stockCash: t('bi.profitHelp.stockCash'),
      losing: t('bi.profitHelp.losing'),
      stockCost: t('bi.profitHelp.stockCost'),
      cancels: t('bi.profitHelp.cancels'),
      potential: t('bi.profitHelp.potential'),
      gstCollected: t('bi.profitHelp.gstCollected'),
      gstRemit: t('bi.profitHelp.gstRemit'),
      bestDay: t('bi.profitHelp.bestDay'),
      bestChannel: t('bi.profitHelp.bestChannel'),
      orders: t('bi.profitHelp.orders'),
      rupeePie: t('bi.profitHelp.rupeePie'),
      profitTrend: t('bi.profitHelp.profitTrend'),
      makingMoney: t('bi.profitHelp.makingMoney'),
      channelPie: t('bi.profitHelp.channelPie'),
      categoryPie: t('bi.profitHelp.categoryPie'),
      weekdayBars: t('bi.profitHelp.weekdayBars'),
      losingList: t('bi.profitHelp.losingList'),
      priceGaps: t('bi.profitHelp.priceGaps'),
      loyalty: t('bi.profitHelp.loyalty'),
      loyaltyGiven: t('bi.profitHelp.loyaltyGiven'),
      loyaltyUsed: t('bi.profitHelp.loyaltyUsed'),
      loyaltyNet: t('bi.profitHelp.loyaltyNet'),
      loyaltyMoneyGiven: t('bi.profitHelp.loyaltyMoneyGiven'),
      loyaltyRowPoints: t('bi.profitHelp.loyaltyRowPoints'),
      loyaltyRowProfit: t('bi.profitHelp.loyaltyRowProfit'),
    }),
    [t],
  );
  const profitChannelLabel = (key: string) =>
    key === 'pos'
      ? t('bi.profitChannelPos')
      : key === 'online_pickup'
        ? t('bi.profitChannelPickup')
        : key === 'online_delivery'
          ? t('bi.profitChannelDelivery')
          : key;
  const initialRange = useMemo(() => profitPresetRange('30d'), []);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [channel, setChannel] = useState<'all' | 'pos' | 'online_pickup' | 'online_delivery'>('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loyaltyDirection, setLoyaltyDirection] = useState<'all' | 'given' | 'used'>('all');
  const [loyaltyQ, setLoyaltyQ] = useState('');
  const [loyaltySearch, setLoyaltySearch] = useState('');
  const [loyaltyOffset, setLoyaltyOffset] = useState(0);
  const [loyaltyPageSize, setLoyaltyPageSize] = useState(10);
  const loyaltyLimit = loyaltyPageSize;
  const [booksInvoiceId, setBooksInvoiceId] = useState<string | null>(null);
  const [panelHelp, setPanelHelp] = useState<{ title: string; body: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    product_count: number;
    inventory_at_cost: string;
    potential_profit: string;
    sales_revenue: string;
    sales_cogs: string;
    gross_profit: string;
    gross_margin_percent?: string;
    cogs_ratio_percent?: string;
    gst_collected?: string;
    gst_to_remit?: string;
    units_sold?: string;
    order_count?: number;
    kept_profit?: string;
    kept_rate_percent?: string;
    leakage_total?: string;
    avg_profit_per_unit?: string;
    avg_order_profit?: string;
    avg_daily_profit?: string;
    discounts_total?: string;
    discount_rate_percent?: string;
    returns_profit?: string;
    return_rate_percent?: string;
    cancels_profit?: string;
    top5_profit_share_percent?: string;
    loss_maker_count?: number;
    healthy_margin_sold_count?: number;
    missing_cost_count?: number;
    stock_risk_count?: number;
    best_channel?: string;
    best_weekday?: string;
    inventory_days_cover?: string;
  } | null>(null);
  const [rupeeComposition, setRupeeComposition] = useState<
    Array<{ key: string; label: string; value: string; color: string }>
  >([]);
  const [comparison, setComparison] = useState<{
    previous_from?: string;
    previous_to?: string;
    profit_delta_percent?: string;
    revenue_delta_percent?: string;
  } | null>(null);
  const [narrative, setNarrative] = useState<Array<{ tone: string; title: string; detail: string }>>([]);
  const [byChannel, setByChannel] = useState<
    Array<{ channel: string; gross_profit: string; units: string; margin_percent: string }>
  >([]);
  const [byCategory, setByCategory] = useState<
    Array<{ category: string; category_label?: string; gross_profit: string; units: string; margin_percent: string }>
  >([]);
  const [byWeekday, setByWeekday] = useState<
    Array<{ label: string; gross_profit: string }>
  >([]);
  const [series, setSeries] = useState<Array<{ date: string; gross_profit: string; revenue?: string }>>([]);
  const [topMargins, setTopMargins] = useState<
    Array<{
      product_id: string;
      name: string;
      margin_percent: string;
      margin: string;
      price: string;
      purchase_price: string;
      avg_cost?: string;
    }>
  >([]);
  const [topSold, setTopSold] = useState<
    Array<{
      product_id: string;
      name: string;
      units_sold: string;
      revenue: string;
      cogs: string;
      gross_profit: string;
      margin_percent?: string;
    }>
  >([]);
  const [lossMakers, setLossMakers] = useState<
    Array<{ product_id: string; name: string; units_sold: string; gross_profit: string; cogs: string }>
  >([]);
  const [loyalty, setLoyalty] = useState<{
    points_earned: number;
    points_redeemed: number;
    net_points: number;
    entry_count?: number;
    redeem_discount_total?: string;
  } | null>(null);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(true);
  const [loyaltyLedger, setLoyaltyLedger] = useState<
    Array<{
      id: string;
      customer_id?: string | null;
      customer_name?: string;
      points_delta: number;
      reason: string;
      entry_type?: string;
      order_id?: string | null;
      booking_id?: string | null;
      voucher_id?: string | null;
      order_number?: string;
      booking_number?: string;
      voucher_number?: string;
      voucher_type?: string;
      source_label?: string;
      invoice_voucher_id?: string;
      linked_order_id?: string;
      gross_profit?: string | null;
      redeem_discount_amount?: string | null;
      record_points_earned?: number;
      record_points_redeemed?: number;
      record_label?: string;
      record_kind?: string;
      created_at?: string;
    }>
  >([]);
  const [loyaltyTotal, setLoyaltyTotal] = useState(0);
  const [appointieProfit, setAppointieProfit] = useState<{
    estimated_revenue: number;
    completed_revenue?: number;
    open_revenue?: number;
    lost_total?: number;
    lost_cancelled?: number;
    lost_no_shows?: number;
    avg_booking_value?: number;
    bookings?: number;
    completed?: number;
    cancelled?: number;
    no_shows?: number;
    completion_rate?: number;
    busiest_day?: string | null;
    busiest_hour?: string | null;
    comparison?: { revenue_change_pct?: number | null; bookings_change_pct?: number | null };
    by_service?: Array<{ service_id: string; service_name: string; revenue: number; bookings?: number; completed?: number }>;
    by_staff?: Array<{
      staff_id: string;
      staff_name: string;
      bookings: number;
      completed?: number;
      cancelled?: number;
      no_shows?: number;
      revenue: number;
    }>;
    by_weekday?: Array<{ weekday_name: string; total: number; revenue?: number }>;
    series?: Array<{ date: string; estimated_revenue: number; completed_revenue: number; bookings: number }>;
    insights?: Array<{ type: string; title: string; detail: string }>;
  } | null>(null);

  const load = useCallback(async () => {
    if (!client || !businessId) return;
    setLoading(true);
    setError(null);
    try {
      const jobs: Array<Promise<void>> = [];
      if (showAppointie) {
        jobs.push(
          client.bi
            .profit({
              start_date: dateFrom,
              end_date: dateTo,
              staff_id: staffId || undefined,
            })
            .then((res) => {
              setAppointieProfit(res.data.appointie ?? null);
            }),
        );
      } else {
        setAppointieProfit(null);
      }
      if (showShopie) {
        jobs.push(
          Promise.all([
            client.shop.productProfitInsights({
              business_id: businessId,
              date_from: dateFrom,
              date_to: dateTo,
              channel: channel === 'all' ? undefined : channel,
              q: appliedSearch || undefined,
              sort: 'gross_profit',
              order: 'desc',
              limit: 20,
              include_catalog: false,
              staff_id: staffId || undefined,
            }),
            client.customers.loyaltyReport({
              business: businessId,
              date_from: dateFrom,
              date_to: dateTo,
              direction: loyaltyDirection === 'all' ? undefined : loyaltyDirection,
              q: loyaltySearch || undefined,
              record_kind: 'shop',
              limit: loyaltyLimit,
              offset: loyaltyOffset,
              staff_id: staffId || undefined,
            }),
          ]).then(([profitRes, loyaltyRes]) => {
            const profit = profitRes.data;
            setSummary(profit.summary);
            setComparison(profit.comparison ?? null);
            setNarrative((profit.insights ?? []).slice(0, 8));
            setRupeeComposition(profit.rupee_composition ?? []);
            setByChannel(profit.by_channel ?? []);
            setByCategory((profit.by_category ?? []).slice(0, 6));
            setByWeekday(profit.by_weekday ?? []);
            setSeries((profit.series ?? []).slice(-30));
            setTopMargins((profit.top_margins ?? []).slice(0, 8));
            setTopSold((profit.top_profit_products ?? profit.sales ?? []).slice(0, 12));
            setLossMakers((profit.loss_makers ?? []).slice(0, 6));
            setLoyalty(loyaltyRes.data.summary);
            setLoyaltyEnabled(loyaltyRes.data.enabled !== false);
            setLoyaltyLedger(
              (loyaltyRes.data.ledger ?? []).filter(
                (row) => row.record_kind !== 'booking' && row.source_label !== 'Booking',
              ),
            );
            setLoyaltyTotal(loyaltyRes.data.ledger_total ?? loyaltyRes.data.summary?.entry_count ?? 0);
          }),
        );
      } else {
        setSummary(null);
        setLoyalty(null);
        setLoyaltyLedger([]);
        setLoyaltyTotal(0);
      }
      await Promise.all(jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('bi.mobile.profitLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [
    appliedSearch,
    businessId,
    channel,
    client,
    dateFrom,
    dateTo,
    loyaltyDirection,
    loyaltyLimit,
    loyaltyOffset,
    loyaltySearch,
    refreshTick,
    showAppointie,
    showShopie,
    staffId,
    t,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyPreset = (preset: '7d' | '30d' | 'mtd') => {
    const range = profitPresetRange(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
  };
  const activePreset = useMemo(() => {
    for (const key of ['7d', '30d', 'mtd'] as const) {
      const range = profitPresetRange(key);
      if (range.from === dateFrom && range.to === dateTo) return key;
    }
    return null;
  }, [dateFrom, dateTo]);

  if (loading && !summary) return <ScreenState loading />;
  if (error) {
    return <ScreenState error={error} actionLabel={t('common.retry')} onAction={() => void load()} />;
  }

  const profitTrend = series.map((row) => ({
    day: row.date,
    value: Number(row.gross_profit) || 0,
  }));
  const channelDonut = byChannel
    .map((row, index) => {
      const tones = Object.values(iconTones);
      return {
        label: profitChannelLabel(row.channel),
        value: Math.max(0, Number(row.gross_profit) || 0),
        color: tones[index % tones.length].foreground,
      };
    })
    .filter((row) => row.value > 0);
  const categoryDonut = byCategory
    .map((row, index) => {
      const tones = Object.values(iconTones);
      return {
        label: row.category_label || row.category,
        value: Math.max(0, Number(row.gross_profit) || 0),
        color: tones[index % tones.length].foreground,
      };
    })
    .filter((row) => row.value > 0);
  const weekdayBars = byWeekday.map((row) => ({
    label: row.label,
    value: Math.max(0, Number(row.gross_profit) || 0),
  }));
  const topProductBars = topSold.slice(0, 6).map((row) => ({
    label: row.name.length > 14 ? `${row.name.slice(0, 13)}…` : row.name,
    value: Math.max(0, Number(row.gross_profit) || 0),
  }));
  const rupeePie = rupeeComposition
    .map((row) => ({
      label: row.label,
      value: Math.max(0, Number(row.value) || 0),
      color: row.color,
    }))
    .filter((row) => row.value > 0);
  const loyaltyMix = [
    {
      label: t('bi.mobile.pointsGiven'),
      value: Math.max(0, Number(loyalty?.points_earned) || 0),
      color: iconTones.green.foreground,
    },
    {
      label: t('bi.mobile.pointsUsed'),
      value: Math.max(0, Number(loyalty?.points_redeemed) || 0),
      color: iconTones.amber.foreground,
    },
  ].filter((row) => row.value > 0);

  return (
    <View style={styles.stack}>
      <View>
        <Text style={styles.heroTitle}>{t('bi.profit')}</Text>
        <Text style={styles.heroHint}>
          {showAppointie && showShopie
            ? t('bi.profitIntroSwitch')
            : showShopie
              ? t('bi.profitIntroMart')
              : t('bi.profitIntroAppoint')}
        </Text>
      </View>
      <BiProductSwitch
        showAppointie={showAppointie}
        showShopie={showShopie}
        value={product}
        onChange={onProductChange ?? (() => undefined)}
      />

      {showAppointie || showShopie ? (
        <View style={styles.profitChipRow}>
          {(
            [
              ['7d', t('bi.profitPreset7d')],
              ['30d', t('bi.profitPreset30d')],
              ['mtd', t('bi.profitPresetMtd')],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              style={[styles.profitChip, activePreset === key && styles.profitChipActive]}
              onPress={() => applyPreset(key)}
            >
              <Text style={[styles.profitChipText, activePreset === key && styles.profitChipTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {product === 'appointie' && showAppointie && appointieProfit ? (
        <>
          <Text style={styles.section}>Orbit Appoint</Text>
          <Text style={styles.heroHint}>{t('bi.profitAppointSub')}</Text>
          <InsightPanel title={t('bi.whatStandsOut')} insights={appointieProfit.insights ?? []} />
          <TileGrid gap={spacing.md}>
            <StatTile
              label={t('bi.profitEstEarnings')}
              value={money(appointieProfit.estimated_revenue, currency)}
              hint={
                appointieProfit.comparison?.revenue_change_pct != null
                  ? t('bi.profitVsLastPeriod', {
                      delta: `${appointieProfit.comparison.revenue_change_pct > 0 ? '+' : ''}${appointieProfit.comparison.revenue_change_pct}%`,
                    })
                  : t('bi.mobile.allBookingsPeriod')
              }
              icon="trending-up"
              iconTone="green"
            />
            <StatTile
              label={t('bi.profitCompletedEarnings')}
              value={money(appointieProfit.completed_revenue, currency)}
              hint={t('bi.mobile.visitsFinished')}
              icon="check-circle"
              iconTone="green"
            />
            <StatTile
              label={t('bi.profitStillOpen')}
              value={money(appointieProfit.open_revenue, currency)}
              hint={t('bi.mobile.notCompletedYet')}
              icon="clock"
              iconTone="blue"
            />
            <StatTile
              label={t('bi.profitLostToCancels')}
              value={money(appointieProfit.lost_total, currency)}
              hint={t('bi.profitLostSplit', {
                cancelled: money(appointieProfit.lost_cancelled ?? 0, currency),
                noShows: money(appointieProfit.lost_no_shows ?? 0, currency),
              })}
              icon="slash"
              iconTone="rose"
            />
            <StatTile
              label={t('bi.bookings')}
              value={String(appointieProfit.bookings ?? 0)}
              hint={t('bi.mobile.pctCompleted', { pct: pct(appointieProfit.completion_rate) })}
              icon="calendar"
              iconTone="blue"
            />
            <StatTile
              label={t('bi.profitAvgBooking')}
              value={money(appointieProfit.avg_booking_value, currency)}
              icon="tag"
              iconTone="amber"
            />
            <StatTile
              label={t('bi.profitBestDay')}
              value={appointieProfit.busiest_day || '—'}
              hint={
                appointieProfit.busiest_hour
                  ? t('bi.profitPeakAround', { hour: appointieProfit.busiest_hour })
                  : undefined
              }
              icon="sun"
              iconTone="amber"
            />
          </TileGrid>
          <ChartGrid>
            {(appointieProfit.series ?? []).length > 1 ? (
              <ChartCard title={t('bi.profitIsEarningsUp')} subtitle={t('bi.profitDayByDayEst')}>
                <LineAreaChart
                  data={fillDailySeries(
                    (appointieProfit.series ?? []).map((row) => ({
                      day: row.date,
                      value: Number(row.estimated_revenue) || 0,
                    })),
                  )}
                  color={iconTones.green.foreground}
                  formatValue={formatAxisValue}
                  unit={currency}
                />
              </ChartCard>
            ) : null}
            {(appointieProfit.by_service ?? []).some((row) => Number(row.revenue) > 0) ? (
              <ChartCard title={t('bi.profitEarningsByService')} subtitle={t('bi.profitEstEarnings')}>
                <DonutChart
                  data={(appointieProfit.by_service ?? []).slice(0, 6).map((row, index) => ({
                    label: row.service_name || t('bi.mobile.serviceFallback'),
                    value: Number(row.revenue) || 0,
                    color: Object.values(iconTones)[index % Object.values(iconTones).length].foreground,
                  }))}
                  centerLabel={currency}
                  formatValue={formatAxisValue}
                />
              </ChartCard>
            ) : null}
            {(appointieProfit.by_weekday ?? []).some((row) => Number(row.revenue ?? row.total) > 0) ? (
              <ChartCard title={t('bi.profitWhichWeekday')} subtitle={t('bi.mobile.hoverBarAmount')}>
                <BarChart
                  data={(appointieProfit.by_weekday ?? []).map((row) => ({
                    label: (row.weekday_name || '').slice(0, 3),
                    value: Number(row.revenue ?? row.total) || 0,
                  }))}
                  formatValue={formatAxisValue}
                  unit={currency}
                />
              </ChartCard>
            ) : null}
          </ChartGrid>
          <Card style={styles.panel}>
            <Text style={styles.panelTitle}>{t('bi.profitServicesBrought')}</Text>
            <Text style={styles.heroHint}>{t('bi.profitServiceNote')}</Text>
            {(appointieProfit.by_service ?? []).slice(0, 6).map((row) => (
              <View key={row.service_id} style={styles.rowLine}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{row.service_name}</Text>
                  <Text style={styles.rowMeta}>
                    {t('bi.profitBookedFinished', { booked: row.bookings ?? 0, finished: row.completed ?? 0 })}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.rowValue}>{money(row.revenue, currency)}</Text>
                  <Text style={styles.rowMeta}>{t('bi.profitBookedValue')}</Text>
                </View>
              </View>
            ))}
            {!(appointieProfit.by_service ?? []).length ? (
              <Text style={styles.rowMeta}>{t('bi.noPricedBookings')}</Text>
            ) : null}
          </Card>
          <Card style={styles.panel}>
            <Text style={styles.panelTitle}>{t('bi.profitWhoFinished')}</Text>
            <Text style={styles.heroHint}>{t('bi.profitStaffNote')}</Text>
            {(appointieProfit.by_staff ?? []).slice(0, 6).map((row) => (
              <View key={row.staff_id} style={styles.rowLine}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{row.staff_name}</Text>
                  <Text style={styles.rowMeta}>
                    {t('bi.profitFinishedCancelledNoShow', {
                      completed: row.completed ?? 0,
                      cancelled: row.cancelled ?? 0,
                      noShows: row.no_shows ?? 0,
                    })}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.rowValue}>{money(row.revenue, currency)}</Text>
                  <Text style={styles.rowMeta}>
                    {t('bi.profitFromFinished', { n: row.completed ?? 0 })}
                  </Text>
                </View>
              </View>
            ))}
            {!(appointieProfit.by_staff ?? []).length ? (
              <Text style={styles.rowMeta}>{t('bi.profitNoStaffActivity')}</Text>
            ) : null}
          </Card>
        </>
      ) : null}

      {product === 'shopie' && showShopie ? <Text style={styles.section}>Orbit Mart</Text> : null}
      {product === 'shopie' && showShopie ? (
        <Text style={styles.heroHint}>{t('bi.profitMartSub')}</Text>
      ) : null}

      {product === 'shopie' && showShopie ? <View style={styles.profitChipRow}>
        {(
          [
            ['all', t('common.all')],
            ['pos', t('bi.profitChannelPos')],
            ['online_pickup', t('bi.profitChannelPickup')],
            ['online_delivery', t('bi.profitChannelDelivery')],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            style={[styles.profitChip, channel === key && styles.profitChipActive]}
            onPress={() => setChannel(key)}
          >
            <Text style={[styles.profitChipText, channel === key && styles.profitChipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View> : null}

      {product === 'shopie' && showShopie ? <View style={styles.profitSearchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('bi.mobile.searchProductSku')}
          placeholderTextColor={colors.mutedForeground}
          style={styles.profitSearchInput}
          returnKeyType="search"
          onSubmitEditing={() => setAppliedSearch(search.trim())}
        />
        <Pressable style={styles.profitChip} onPress={() => setAppliedSearch(search.trim())}>
          <Text style={styles.profitChipText}>{t('common.search')}</Text>
        </Pressable>
      </View> : null}

      {product === 'shopie' && showShopie && summary ? (
        <TileGrid gap={spacing.md}>
          <StatTile
            label={t('bi.profitKeptLabel')}
            help={PROFIT_HELP.kept}
            value={money(summary.kept_profit ?? summary.gross_profit, currency)}
            hint={
              comparison?.profit_delta_percent
                ? t('bi.profitVsLastPeriod', {
                    delta: `${Number(comparison.profit_delta_percent) > 0 ? '+' : ''}${comparison.profit_delta_percent}%`,
                  })
                : t('bi.profitKeptHint')
            }
            icon="shield"
            iconTone="green"
          />
          <StatTile
            label={t('bi.profitPaidLabel')}
            help={PROFIT_HELP.paid}
            value={money(summary.sales_revenue, currency)}
            hint={
              comparison?.revenue_delta_percent
                ? t('bi.profitVsLastPeriod', {
                    delta: `${Number(comparison.revenue_delta_percent) > 0 ? '+' : ''}${comparison.revenue_delta_percent}%`,
                  })
                : t('bi.profitPaidHint')
            }
            icon="trending-up"
            iconTone="blue"
          />
          <StatTile
            label={t('bi.profitDiscountsLabel')}
            help={PROFIT_HELP.discounts}
            value={money(summary.discounts_total || '0', currency)}
            hint={t('bi.profitDiscountsHint')}
            icon="tag"
            iconTone="amber"
          />
          <StatTile
            label={t('bi.profitReturnsLabel')}
            help={PROFIT_HELP.returns}
            value={money(summary.returns_profit || '0', currency)}
            hint={t('bi.profitReturnsHint')}
            icon="rotate-ccw"
            iconTone="coral"
          />
          <StatTile
            label={t('bi.profitStockCashLabel')}
            help={PROFIT_HELP.stockCash}
            value={money(summary.inventory_at_cost, currency)}
            hint={
              summary.inventory_days_cover
                ? t('bi.profitStockCashHintDays', { days: summary.inventory_days_cover })
                : t('bi.profitStockCashHint')
            }
            icon="package"
            iconTone="navy"
          />
          <StatTile
            label={t('bi.profitLosingLabel')}
            help={PROFIT_HELP.losing}
            value={String(summary.loss_maker_count ?? 0)}
            hint={summary.loss_maker_count ? t('bi.profitLosingHintSome') : t('bi.profitLosingHintNone')}
            icon="alert-triangle"
            iconTone={summary.loss_maker_count ? 'coral' : 'green'}
          />
          <StatTile
            label={t('bi.profitStockCostLabel')}
            help={PROFIT_HELP.stockCost}
            value={money(summary.sales_cogs, currency)}
            hint={t('bi.profitStockCostHint')}
            icon="archive"
            iconTone="blue"
          />
          <StatTile
            label={t('bi.profitGstCollectedLabel')}
            help={PROFIT_HELP.gstCollected}
            value={money(summary.gst_collected || '0', currency)}
            hint={t('bi.profitGstCollectedHint')}
            icon="percent"
            iconTone="blue"
          />
          <StatTile
            label={t('bi.profitGstRemitLabel')}
            help={PROFIT_HELP.gstRemit}
            value={money(summary.gst_to_remit || summary.gst_collected || '0', currency)}
            hint={t('bi.profitGstRemitHint')}
            icon="file-text"
            iconTone="amber"
          />
          <StatTile
            label={t('bi.profitCancelledBills')}
            help={PROFIT_HELP.cancels}
            value={money(summary.cancels_profit || '0', currency)}
            hint={t('bi.profitCancelledBillsHint')}
            icon="x-circle"
            iconTone="coral"
          />
          <StatTile
            label={t('bi.profitIfAllSells')}
            help={PROFIT_HELP.potential}
            value={money(summary.potential_profit, currency)}
            hint={t('bi.profitIfAllSellsHint')}
            icon="package"
            iconTone="navy"
          />
          <StatTile
            label={t('bi.profitBestSellingDay')}
            help={PROFIT_HELP.bestDay}
            value={summary.best_weekday || '—'}
            icon="calendar"
            iconTone="amber"
          />
          <StatTile
            label={t('bi.profitBestChannel')}
            help={PROFIT_HELP.bestChannel}
            value={profitChannelLabel(summary.best_channel || '') || '—'}
            icon="shopping-bag"
            iconTone="blue"
          />
          <StatTile
            label={t('bi.orders')}
            help={PROFIT_HELP.orders}
            value={String(summary.order_count ?? 0)}
            hint={t('bi.profitProfitPerBill', { amount: money(summary.avg_order_profit || '0', currency) })}
            icon="file-text"
            iconTone="cyan"
          />
        </TileGrid>
      ) : null}

      {product === 'shopie' && showShopie ? (
      <>
      {narrative.length ? (
        <Card style={styles.panel}>
          <Text style={styles.panelTitle}>{t('bi.profitWhatToNotice')}</Text>
          {narrative.map((item) => (
            <View key={`${item.title}-${item.detail}`} style={styles.insightBlock}>
              <Text
                style={[
                  styles.insightTitle,
                  item.tone === 'warning' && styles.insightWarning,
                  item.tone === 'positive' && styles.insightPositive,
                ]}
              >
                {item.title}
              </Text>
              <Text style={styles.rowMeta}>{item.detail}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <ChartGrid>
        {rupeePie.length ? (
          <ChartCard
            title={t('bi.profitWhereMoneyWent')}
            subtitle={t('bi.profitWhereMoneySub')}
            help={PROFIT_HELP.rupeePie}
          >
            <DonutChart data={rupeePie} centerLabel={t('bi.profitCenterSplit')} formatValue={formatAxisValue} />
          </ChartCard>
        ) : null}
        {profitTrend.length > 1 ? (
          <ChartCard title={t('bi.profitIsProfitUp')} subtitle={t('bi.profitDayByDayProfit')} help={PROFIT_HELP.profitTrend}>
            <LineAreaChart
              data={profitTrend}
              color={iconTones.green.foreground}
              formatValue={formatAxisValue}
              unit={currency}
            />
          </ChartCard>
        ) : null}
        {topProductBars.some((row) => row.value > 0) ? (
          <ChartCard title={t('bi.profitProductsMaking')} subtitle={t('bi.profitStockMore')} help={PROFIT_HELP.makingMoney}>
            <BarChart
              data={topProductBars}
              color={iconTones.cyan.foreground}
              formatValue={formatAxisValue}
              unit={currency}
            />
          </ChartCard>
        ) : null}
        {channelDonut.length ? (
          <ChartCard title={t('bi.profitSalesByChannel')} subtitle={t('bi.mobile.whereProfitCame')} help={PROFIT_HELP.channelPie}>
            <DonutChart data={channelDonut} centerLabel={t('bi.profitCenterProfit')} formatValue={formatAxisValue} />
          </ChartCard>
        ) : null}
        {categoryDonut.length ? (
          <ChartCard title={t('bi.profitSalesByCategory')} subtitle={t('bi.mobile.whichCategoriesEarn')} help={PROFIT_HELP.categoryPie}>
            <DonutChart data={categoryDonut} centerLabel={t('bi.profitCenterProfit')} formatValue={formatAxisValue} />
          </ChartCard>
        ) : null}
        {weekdayBars.some((row) => row.value > 0) ? (
          <ChartCard title={t('bi.profitWhichWeekday')} subtitle={t('bi.mobile.barByDay')} help={PROFIT_HELP.weekdayBars}>
            <BarChart
              data={weekdayBars}
              color={iconTones.blue.foreground}
              formatValue={formatAxisValue}
              unit={currency}
            />
          </ChartCard>
        ) : null}
      </ChartGrid>

      <Card style={styles.panel}>
        <View style={styles.panelTitleRow}>
          <Text style={styles.panelTitle}>{t('bi.profitProductsMaking')}</Text>
          <Pressable
            hitSlop={10}
            onPress={() => setPanelHelp({ title: t('bi.profitProductsMaking'), body: PROFIT_HELP.makingMoney })}
            style={styles.panelHelpBtn}
          >
            <Text style={styles.panelHelpBtnText}>?</Text>
          </Pressable>
        </View>
        <Text style={styles.rowMeta}>{t('bi.profitStockMore')}</Text>
        {topSold.map((row) => (
          <View key={row.product_id} style={styles.rowLine}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{row.name}</Text>
              <Text style={styles.rowMeta}>
                {t('bi.profitUnitsSold', { n: row.units_sold })}
                {row.margin_percent ? ` · ${t('bi.profitYouKeepPct', { pct: row.margin_percent })}` : ''}
              </Text>
            </View>
            <Text style={styles.rowValue}>{money(row.gross_profit, currency)}</Text>
          </View>
        ))}
        {!topSold.length ? <Text style={styles.rowMeta}>{t('bi.profitNoSalesProfit')}</Text> : null}
      </Card>

      <Card style={styles.panel}>
        <View style={styles.panelTitleRow}>
          <Text style={styles.panelTitle}>{t('bi.profitLosingLabel')}</Text>
          <Pressable
            hitSlop={10}
            onPress={() => setPanelHelp({ title: t('bi.profitLosingLabel'), body: PROFIT_HELP.losingList })}
            style={styles.panelHelpBtn}
          >
            <Text style={styles.panelHelpBtnText}>?</Text>
          </Pressable>
        </View>
        <Text style={styles.rowMeta}>{t('bi.profitLosingSub')}</Text>
        {lossMakers.map((row) => (
          <View key={row.product_id} style={styles.rowLine}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{row.name}</Text>
              <Text style={styles.rowMeta}>
                {t('bi.profitSoldStockCost', { n: row.units_sold, amount: money(row.cogs, currency) })}
              </Text>
            </View>
            <Text style={[styles.rowValue, { color: colors.destructive }]}>
              {money(row.gross_profit, currency)}
            </Text>
          </View>
        ))}
        {!lossMakers.length ? <Text style={styles.rowMeta}>{t('bi.profitNoneRightNow')}</Text> : null}
      </Card>

      <Card style={styles.panel}>
        <View style={styles.panelTitleRow}>
          <Text style={styles.panelTitle}>{t('bi.profitPriceGaps')}</Text>
          <Pressable
            hitSlop={10}
            onPress={() => setPanelHelp({ title: t('bi.profitPriceGaps'), body: PROFIT_HELP.priceGaps })}
            style={styles.panelHelpBtn}
          >
            <Text style={styles.panelHelpBtnText}>?</Text>
          </Pressable>
        </View>
        <Text style={styles.rowMeta}>{t('bi.profitPriceGapsSub')}</Text>
        {topMargins.map((row) => (
          <View key={row.product_id} style={styles.rowLine}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{row.name}</Text>
              <Text style={styles.rowMeta}>
                {t('bi.profitSellCost', {
                  sell: money(row.price, currency),
                  cost: money(row.avg_cost || row.purchase_price, currency),
                })}
              </Text>
            </View>
            <Text style={styles.rowValue}>{row.margin_percent}%</Text>
          </View>
        ))}
        {!topMargins.length ? (
          <Text style={styles.rowMeta}>{t('bi.profitAddPurchasePrice')}</Text>
        ) : null}
      </Card>

      <Card style={styles.panel}>
        <View style={styles.panelTitleRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.panelTitleRow}>
              <Text style={styles.panelTitle}>{t('bi.profitRewardPoints')}</Text>
              <Pressable
                hitSlop={10}
                onPress={() => setPanelHelp({ title: t('bi.profitRewardPoints'), body: PROFIT_HELP.loyalty })}
                style={styles.panelHelpBtn}
              >
                <Text style={styles.panelHelpBtnText}>?</Text>
              </Pressable>
            </View>
            <Text style={styles.rowMeta}>{t('bi.profitRewardSub')}</Text>
          </View>
          <Pressable style={styles.profitChip} onPress={() => navigation.navigate('ShopLoyalty')}>
            <Text style={styles.profitChipText}>{t('bi.profitFullActivity')}</Text>
          </Pressable>
        </View>

        {!loyaltyEnabled ? (
          <Text style={[styles.rowMeta, { color: colors.warning }]}>
            {t('bi.profitRewardsOff')}
          </Text>
        ) : null}

        {loyalty ? (
          <>
            <TileGrid gap={spacing.sm}>
              <StatTile
                label={t('bi.profitPointsGave')}
                help={PROFIT_HELP.loyaltyGiven}
                value={String(loyalty.points_earned)}
                hint={t('bi.profitPointsGaveHint')}
                icon="gift"
                iconTone="green"
              />
              <StatTile
                label={t('bi.profitPointsUsed')}
                help={PROFIT_HELP.loyaltyUsed}
                value={String(loyalty.points_redeemed)}
                hint={t('bi.profitPointsUsedHint')}
                icon="tag"
                iconTone="amber"
              />
              <StatTile
                label={t('bi.profitStillWithCustomers')}
                help={PROFIT_HELP.loyaltyNet}
                value={String(loyalty.net_points)}
                hint={loyalty.net_points >= 0 ? t('bi.profitMoreGiven') : t('bi.profitMoreUsed')}
                icon="users"
                iconTone="cyan"
              />
              <StatTile
                label={t('bi.profitTimesMoved')}
                value={String(loyalty.entry_count ?? loyaltyLedger.length)}
                hint={t('bi.profitGiveUseEvents')}
                icon="activity"
                iconTone="blue"
              />
              <StatTile
                label={t('bi.profitMoneyAsRewards')}
                help={PROFIT_HELP.loyaltyMoneyGiven}
                value={money(Number(loyalty.redeem_discount_total || 0), currency)}
                hint={t('bi.profitMoneyAsRewardsHint')}
                icon="tag"
                iconTone="amber"
              />
            </TileGrid>

            {loyaltyMix.length ? (
              <ChartCard title={t('bi.profitGivenVsUsed')} subtitle={t('bi.mobile.pointsMovedSub')}>
                <DonutChart data={loyaltyMix} centerLabel={t('bi.profitCenterPoints')} formatValue={formatAxisValue} />
              </ChartCard>
            ) : null}

            <Text style={[styles.panelTitle, { marginTop: spacing.xs }]}>{t('bi.profitAllPointActivity')}</Text>
            <Text style={styles.rowMeta}>
              {loyaltyTotal === 1
                ? t('bi.mobile.entriesTapOne')
                : t('bi.mobile.entriesTapMany', { n: loyaltyTotal })}
            </Text>

            <View style={styles.profitChipRow}>
              {(
                [
                  ['all', t('common.all')],
                  ['given', t('bi.mobile.pointsGiven')],
                  ['used', t('bi.mobile.pointsUsed')],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  style={[styles.profitChip, loyaltyDirection === key && styles.profitChipActive]}
                  onPress={() => {
                    setLoyaltyDirection(key);
                    setLoyaltyOffset(0);
                  }}
                >
                  <Text
                    style={[
                      styles.profitChipText,
                      loyaltyDirection === key && styles.profitChipTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.profitSearchRow}>
              <TextInput
                value={loyaltyQ}
                onChangeText={setLoyaltyQ}
                placeholder={t('bi.profitCustomerOrReason')}
                placeholderTextColor={colors.mutedForeground}
                style={styles.profitSearchInput}
                returnKeyType="search"
                onSubmitEditing={() => {
                  setLoyaltySearch(loyaltyQ.trim());
                  setLoyaltyOffset(0);
                }}
              />
              <Pressable
                style={styles.profitChip}
                onPress={() => {
                  setLoyaltySearch(loyaltyQ.trim());
                  setLoyaltyOffset(0);
                }}
              >
                <Text style={styles.profitChipText}>{t('common.search')}</Text>
              </Pressable>
            </View>

            {loyaltyLedger.map((row) => {
              const sourceLabel = String(row.source_label || '').trim();
              const isOnlineOrder = sourceLabel === 'Online order' || sourceLabel.startsWith('Online order');
              const invoiceVoucherId = String(row.invoice_voucher_id || row.voucher_id || '').trim();
              const onlineOrderId = String(row.linked_order_id || row.order_id || '').trim();
              const recordLabel =
                row.record_kind === 'order'
                  ? `${sourceLabel || t('bi.profitShopInvoice')} ${row.order_number || row.record_label || ''}`.trim()
                  : row.record_kind === 'booking'
                    ? t('bi.profitBookingRecord', { ref: row.booking_number || row.record_label || '' }).trim()
                    : row.record_kind === 'voucher'
                      ? row.voucher_type === 'purchase'
                        ? t('bi.profitBooksPurchase', { ref: row.voucher_number || '' }).trim()
                        : `${sourceLabel || t('bi.profitBooksSale')} ${row.voucher_number || ''}`.trim()
                      : '';
              const canOpenRecord = Boolean(
                (isOnlineOrder && onlineOrderId) ||
                  invoiceVoucherId ||
                  (row.record_kind === 'booking' && row.booking_id) ||
                  (row.record_kind === 'order' && row.order_id),
              );
              const isBooking =
                row.record_kind === 'booking' || sourceLabel === 'Booking';
              const { earned, redeemed } = loyaltyPointParts(row);
              const bothPoints = earned > 0 && redeemed > 0;
              const profitAmount =
                !isBooking && row.gross_profit != null && row.gross_profit !== ''
                  ? Number(row.gross_profit)
                  : null;
              const profitText = profitAmount != null ? money(profitAmount, currency) : null;
              const profitPositive = profitAmount != null && profitAmount >= 0;
              return (
                <View key={row.id} style={styles.rowLine}>
                  <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                    <Pressable
                      disabled={!row.customer_id}
                      onPress={() =>
                        row.customer_id
                          ? navigation.navigate('CustomerDetail', { customerId: row.customer_id })
                          : undefined
                      }
                    >
                      <Text style={[styles.rowTitle, row.customer_id ? styles.linkText : null]}>
                        {row.customer_name || t('bi.profitColCustomer')}
                      </Text>
                    </Pressable>
                    <Text style={styles.rowMeta}>
                      {bothPoints
                        ? t('bi.profitPointsGivenAndUsed')
                        : row.reason || row.entry_type || t('bi.profitPointsUpdate')}
                      {row.created_at
                        ? ` · ${new Date(row.created_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`
                        : ''}
                    </Text>
                    {recordLabel ? (
                      <Pressable
                        disabled={!canOpenRecord}
                        onPress={() => {
                          // Online → order page. POS / Booking / Books → invoice popup.
                          if (isOnlineOrder && onlineOrderId) {
                            navigation.navigate('ShopOrderDetail', { orderId: onlineOrderId });
                            return;
                          }
                          if (invoiceVoucherId) {
                            setBooksInvoiceId(invoiceVoucherId);
                            return;
                          }
                          if (row.record_kind === 'booking' && row.booking_id) {
                            navigation.navigate('BookingDetail', { bookingId: row.booking_id });
                            return;
                          }
                          if (row.order_id) {
                            navigation.navigate('ShopOrderDetail', { orderId: row.order_id });
                          }
                        }}
                      >
                        <Text style={[styles.rowMeta, canOpenRecord ? styles.linkText : null]}>
                          {recordLabel}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.loyaltyRightCol}>
                    <LoyaltyMetricTile
                      label={t('bi.profitPoints')}
                      icon="gift"
                      iconTone={bothPoints ? 'violet' : redeemed > 0 && earned <= 0 ? 'amber' : 'green'}
                      tone={bothPoints ? 'neutral' : redeemed > 0 && earned <= 0 ? 'warning' : 'positive'}
                      help={PROFIT_HELP.loyaltyRowPoints}
                      value={
                        <Text style={styles.loyaltyPointsValue}>
                          {earned > 0 ? (
                            <Text style={{ color: colors.success }}>+{earned}</Text>
                          ) : null}
                          {earned > 0 && redeemed > 0 ? (
                            <Text style={{ color: colors.mutedForeground }}> · </Text>
                          ) : null}
                          {redeemed > 0 ? (
                            <Text style={{ color: colors.warning }}>−{redeemed}</Text>
                          ) : null}
                          {!earned && !redeemed ? (
                            <Text style={{ color: colors.mutedForeground }}>—</Text>
                          ) : null}
                        </Text>
                      }
                    />
                    {profitText ? (
                      <LoyaltyMetricTile
                        label={t('bi.profit')}
                        icon="trending-up"
                        iconTone={profitPositive ? 'green' : 'rose'}
                        tone={profitPositive ? 'positive' : 'negative'}
                        help={PROFIT_HELP.loyaltyRowProfit}
                        value={
                          <Text
                            style={[
                              styles.loyaltyProfitTileValue,
                              { color: profitPositive ? colors.success : colors.destructive },
                            ]}
                          >
                            {profitText}
                          </Text>
                        }
                      />
                    ) : null}
                  </View>
                </View>
              );
            })}
            {!loyaltyLedger.length ? (
              <Text style={styles.rowMeta}>{t('bi.profitNoMovements')}</Text>
            ) : null}

            {loyaltyTotal > 0 ? (
              <LoyaltyPagination
                total={loyaltyTotal}
                offset={loyaltyOffset}
                pageSize={loyaltyPageSize}
                onPageChange={setLoyaltyOffset}
                onPageSizeChange={(size) => {
                  setLoyaltyPageSize(size);
                  setLoyaltyOffset(0);
                }}
              />
            ) : null}
          </>
        ) : loyaltyEnabled ? (
          <Text style={styles.rowMeta}>{t('bi.profitNoRewardsYet')}</Text>
        ) : null}
      </Card>
      </>
      ) : null}

      <HelpModal
        visible={Boolean(panelHelp)}
        title={panelHelp?.title || ''}
        body={panelHelp?.body || ''}
        onClose={() => setPanelHelp(null)}
      />
      <BooksInvoiceDrawer
        voucherId={booksInvoiceId}
        visible={Boolean(booksInvoiceId)}
        onClose={() => setBooksInvoiceId(null)}
      />
    </View>
  );
}

function BIOverview({
  data,
  loading,
  showAppointie = false,
  showShopie = false,
  product: preferredProduct = 'appointie',
  onProductChange,
}: {
  data: ReturnType<typeof useBIOverview>['data'];
  loading: boolean;
  showAppointie?: boolean;
  showShopie?: boolean;
  product?: ProductKey;
  onProductChange?: (next: ProductKey) => void;
}) {
  const { t } = useTranslation();
  const product = resolveProduct(showAppointie, showShopie, preferredProduct);
  const showAppointiePane = product === 'appointie' && showAppointie;
  const showShopiePane = product === 'shopie' && showShopie;
  const appointieBundle = appointieFromOverview(data);
  const shopie = data?.shopie;
  const pets = data?.pets;
  const summary = appointieBundle?.summary;
  const comparison = summary?.comparison;
  const currency = appointieBundle?.revenue?.currency ?? shopie?.currency ?? data?.currency ?? '';

  const bookingTrend = useMemo(
    () =>
      fillDailySeries((appointieBundle?.trends?.rows ?? []).map((row) => ({ day: row.day, value: row.total }))),
    [appointieBundle?.trends?.rows],
  );
  const gmvTrend = useMemo(
    () => fillDailySeries((shopie?.trend ?? []).map((row) => ({ day: row.day, value: Number(row.gmv || 0) }))),
    [shopie?.trend],
  );
  const weekdayBars = useMemo(() => {
    const busiest = appointieBundle?.operations?.busiest_day;
    return (appointieBundle?.operations?.by_weekday ?? []).map((row) => ({
      label: row.weekday_name.slice(0, 3),
      value: row.total,
      highlight: busiest === row.weekday_name,
    }));
  }, [appointieBundle?.operations]);
  const bookingMix = useMemo(() => {
    if (!summary || !summary.bookings) return [];
    const other = Math.max(
      0,
      summary.bookings - (summary.completed ?? 0) - (summary.cancelled ?? 0) - (summary.no_shows ?? 0),
    );
    return [
      { label: t('bi.completed'), value: summary.completed ?? 0, color: iconTones.green.foreground },
      { label: t('bi.cancelled'), value: summary.cancelled ?? 0, color: iconTones.rose.foreground },
      { label: t('bi.mobile.statusNoShow'), value: summary.no_shows ?? 0, color: iconTones.coral.foreground },
      { label: t('bi.profitOpen'), value: other, color: iconTones.blue.foreground },
    ].filter((slice) => slice.value > 0);
  }, [summary, t]);
  const serviceMix = useMemo(() => {
    const palette = [
      iconTones.blue.foreground,
      iconTones.violet.foreground,
      iconTones.cyan.foreground,
      iconTones.amber.foreground,
      iconTones.coral.foreground,
    ];
    return (appointieBundle?.revenue?.by_service ?? [])
      .filter((row) => Number(row.revenue) > 0)
      .slice(0, 5)
      .map((row, index) => ({
        label: row.service_name || t('bookings.service'),
        value: Number(row.revenue),
        color: palette[index % palette.length],
      }));
  }, [appointieBundle?.revenue?.by_service, t]);
  const staffBars = useMemo(
    () =>
      (appointieBundle?.operations?.by_staff ?? []).slice(0, 7).map((row, index) => ({
        label: row.staff_name.split(' ')[0] || row.staff_name,
        value: row.bookings,
        highlight: index === 0,
      })),
    [appointieBundle?.operations?.by_staff],
  );
  const orderMix = useMemo(() => {
    if (!shopie) return [];
    return [
      { label: t('bi.orders'), value: shopie.orders, color: iconTones.green.foreground },
      { label: t('bi.cancelled'), value: shopie.cancelled_orders, color: iconTones.rose.foreground },
      { label: t('bi.returns'), value: shopie.returns, color: iconTones.coral.foreground },
    ].filter((slice) => slice.value > 0);
  }, [shopie, t]);
  const highlights = useMemo(
    () =>
      showAppointiePane
        ? appointieBundle?.insights ?? []
        : [...(shopie?.insights ?? []), ...(pets?.insights ?? [])],
    [appointieBundle?.insights, pets?.insights, shopie?.insights, showAppointiePane],
  );

  if (loading && !data) return <ScreenState loading />;

  return (
    <View style={styles.stack}>
      <View>
        <Text style={styles.heroTitle}>{t('nav.last30Days')}</Text>
        <Text style={styles.heroHint}>
          {showAppointie && showShopie
            ? t('bi.mobile.tapChartHintSwitch')
            : t('bi.mobile.tapChartHint')}
        </Text>
      </View>
      <BiProductSwitch
        showAppointie={showAppointie}
        showShopie={showShopie}
        value={product}
        onChange={onProductChange ?? (() => undefined)}
      />

      {showAppointiePane && appointieBundle ? (
        <>
          <TileGrid gap={spacing.md}>
            <StatTile
              label={t('bi.bookings')}
              value={String(summary?.bookings ?? 0)}
              hint={changeLabel(comparison?.bookings_change_pct, t)}
              icon="calendar"
              iconTone="blue"
            />
            <StatTile
              label={t('bi.mobile.estRevenue')}
              value={money(appointieBundle.revenue?.estimated_revenue, currency)}
              hint={changeLabel(comparison?.revenue_change_pct, t)}
              icon="trending-up"
              iconTone="green"
            />
            <StatTile
              label={t('bi.completed')}
              value={String(summary?.completed ?? 0)}
              hint={pct(summary?.completion_rate)}
              icon="check-circle"
              iconTone="green"
            />
            <StatTile
              label={t('bi.mobile.avgPerDay')}
              value={String(summary?.avg_bookings_per_day ?? 0)}
              hint={
                appointieBundle.operations?.busiest_day
                  ? t('bi.mobile.peakDay', { day: appointieBundle.operations.busiest_day })
                  : undefined
              }
              icon="activity"
              iconTone="violet"
            />
          </TileGrid>
        </>
      ) : null}

      {showShopiePane && shopie ? (
        <>
          {showAppointie && showShopie ? <Text style={styles.section}>Orbit Mart</Text> : null}
          <TileGrid gap={spacing.md}>
            <StatTile label={t('bi.orders')} value={String(shopie.orders)} icon="shopping-bag" iconTone="green" />
            <StatTile label={t('bi.gmv')} value={money(shopie.gmv, shopie.currency)} icon="dollar-sign" iconTone="green" />
            <StatTile
              label={t('bi.mobile.avgOrder')}
              value={money(shopie.avg_order_value, shopie.currency)}
              icon="tag"
              iconTone="amber"
            />
            <StatTile
              label={t('bi.returns')}
              value={String(shopie.returns)}
              hint={pct(shopie.return_rate)}
              icon="rotate-ccw"
              iconTone="coral"
            />
          </TileGrid>
        </>
      ) : null}

      <InsightPanel
        title={t('bi.whatStandsOut')}
        subtitle={t('bi.mobile.insightsSub')}
        insights={highlights}
      />

      {showAppointiePane && data?.forecast ? (
        <ChartCard
          title={t('bi.nextDays', { days: data.forecast.horizon_days ?? 30 })}
          subtitle={data.forecast.note || t('bi.projectedFromPace')}
        >
          <TileGrid gap={spacing.md}>
            <StatTile
              label={t('bi.projectedBookings')}
              value={String(data.forecast.projected_bookings ?? 0)}
              icon="calendar"
              iconTone="blue"
            />
            <StatTile
              label={t('bi.projectedRevenue')}
              value={money(data.forecast.projected_revenue, data.forecast.currency ?? currency)}
              icon="trending-up"
              iconTone="green"
            />
          </TileGrid>
        </ChartCard>
      ) : null}

      {showAppointiePane && appointieBundle ? (
        <>
          {bookingTrend.some((row) => row.value > 0) ? (
            <ChartCard
              title={t('bi.mobile.bookingsOverTime')}
              subtitle={t('bi.mobile.bookingsOverTimeSub')}
            >
              <LineAreaChart
                data={bookingTrend}
                color={iconTones.blue.foreground}
                unit={t('bi.mobile.unitBookings')}
              />
            </ChartCard>
          ) : null}

          <ChartGrid>
            {bookingMix.length ? (
              <ChartCard title={t('bi.mobile.bookingMix')} subtitle={t('bi.mobile.bookingMixSub')}>
                <DonutChart data={bookingMix} centerLabel={t('bi.mobile.unitBookings')} />
              </ChartCard>
            ) : null}
            {weekdayBars.some((row) => row.value > 0) ? (
              <ChartCard title={t('bi.demandByWeekday')} subtitle={t('bi.mobile.demandSub')}>
                <BarChart data={weekdayBars} unit={t('bi.mobile.unitBookings')} />
              </ChartCard>
            ) : null}
            {serviceMix.length ? (
              <ChartCard title={t('bi.revenueByService')} subtitle={t('bi.mobile.revenueByServiceSub')}>
                <DonutChart data={serviceMix} centerLabel={currency || t('bi.mobile.unitRevenueShort')} formatValue={formatAxisValue} />
              </ChartCard>
            ) : null}
            {staffBars.length ? (
              <ChartCard title={t('bi.topStaff')} subtitle={t('bi.mobile.topStaffSub')}>
                <BarChart data={staffBars} unit={t('bi.mobile.unitBookings')} />
              </ChartCard>
            ) : null}
          </ChartGrid>
        </>
      ) : null}

      {showShopiePane && shopie ? (
        <>
          {gmvTrend.some((row) => row.value > 0) ? (
            <ChartCard title={t('bi.mobile.salesGmv')} subtitle={t('bi.mobile.salesGmvSub')}>
              <LineAreaChart
                data={gmvTrend}
                color={iconTones.green.foreground}
                formatValue={(value) => Number(value).toFixed(2)}
                unit={shopie.currency ?? currency}
              />
            </ChartCard>
          ) : null}
          {orderMix.length ? (
            <ChartCard title={t('bi.mobile.orderMix')} subtitle={t('bi.mobile.orderMixSub')}>
              <DonutChart data={orderMix} centerLabel={t('bi.mobile.unitOrders')} />
            </ChartCard>
          ) : null}
        </>
      ) : null}

      {showShopiePane && pets ? (
        <ChartCard
          title={t('dashboard.petsPack')}
          subtitle={t('bi.mobile.birthdaysIn7d', { n: pets.birthdays_next_7d })}
        >
          <DonutChart
            data={[
              { label: t('bi.mobile.withPhoto'), value: pets.with_photo, color: iconTones.rose.foreground },
              { label: t('bi.mobile.noPhoto'), value: Math.max(0, pets.total - pets.with_photo), color: colors.muted },
            ]}
            centerValue={String(pets.total)}
            centerLabel={t('bi.mobile.unitPets')}
          />
        </ChartCard>
      ) : null}

      {!appointieBundle && !shopie && !pets ? (
        <Card>
          <Text style={styles.empty}>{t('bi.overviewEmpty')}</Text>
        </Card>
      ) : null}
    </View>
  );
}

function BIGrowth({
  data,
  loading,
  showAppointie,
  showShopie,
  product: preferredProduct = 'appointie',
  onProductChange,
}: {
  data: ReturnType<typeof useBIGrowth>['data'];
  loading: boolean;
  showAppointie: boolean;
  showShopie: boolean;
  product?: ProductKey;
  onProductChange?: (next: ProductKey) => void;
}) {
  const { t } = useTranslation();
  const product = resolveProduct(showAppointie, showShopie, preferredProduct);
  if (loading && !data) return <ScreenState loading />;
  const appointie = data?.appointie ?? (showAppointie && data?.new_customers != null ? data : null);
  const shopie = data?.shopie ?? null;
  const appointieMix = [
    { label: t('common.new'), value: appointie?.new_customers ?? 0, color: iconTones.cyan.foreground },
    { label: t('bi.returning'), value: appointie?.returning_customers ?? 0, color: iconTones.violet.foreground },
  ].filter((slice) => slice.value > 0);
  const appointieBars = (appointie?.top_customers ?? []).slice(0, 7).map((row, index) => ({
    label: row.customer_name.split(' ')[0] || row.customer_name,
    value: row.bookings,
    highlight: index === 0,
  }));
  const shopieMix = [
    { label: t('common.new'), value: shopie?.new_customers ?? 0, color: iconTones.cyan.foreground },
    { label: t('bi.returning'), value: shopie?.returning_customers ?? 0, color: iconTones.violet.foreground },
  ].filter((slice) => slice.value > 0);
  const shopieBars = (shopie?.top_customers ?? []).slice(0, 7).map((row, index) => ({
    label: row.customer_name.split(' ')[0] || row.customer_name,
    value: row.orders,
    highlight: index === 0,
  }));

  return (
    <View style={styles.stack}>
      <View>
        <Text style={styles.heroTitle}>{t('bi.pageGrowth')}</Text>
        <Text style={styles.heroHint}>
          {showAppointie && showShopie
            ? t('bi.mobile.growthSwitchHint')
            : t('bi.mobile.growthWhoComingBack')}
        </Text>
      </View>
      <BiProductSwitch
        showAppointie={showAppointie}
        showShopie={showShopie}
        value={product}
        onChange={onProductChange ?? (() => undefined)}
      />
      {product === 'appointie' && showAppointie && appointie ? (
        <>
          <Text style={styles.section}>Orbit Appoint</Text>
          <TileGrid gap={spacing.md}>
            <StatTile label={t('common.new')} value={String(appointie.new_customers ?? 0)} icon="user-plus" iconTone="cyan" />
            <StatTile label={t('bi.returning')} value={String(appointie.returning_customers ?? 0)} icon="refresh-cw" iconTone="violet" />
            <StatTile label={t('bi.repeatRate')} value={pct(appointie.repeat_rate)} icon="repeat" iconTone="green" />
            <StatTile label={t('bi.mobile.avgVisits')} value={String(appointie.avg_visits_per_customer ?? 0)} icon="layers" iconTone="blue" />
          </TileGrid>
          <ChartGrid>
            {appointieMix.length ? (
              <ChartCard title={t('bi.mobile.newVsReturning')} subtitle={t('bi.mobile.hoverSliceHint')}>
                <DonutChart data={appointieMix} centerLabel={t('bi.mobile.unitCustomers')} />
              </ChartCard>
            ) : null}
            {appointieBars.length ? (
              <ChartCard
                title={t('bi.mostActiveCustomers')}
                subtitle={t('bi.mobile.mostActiveBookingsSub')}
              >
                <BarChart data={appointieBars} unit={t('bi.mobile.unitBookings')} />
              </ChartCard>
            ) : null}
          </ChartGrid>
        </>
      ) : null}
      {product === 'shopie' && showShopie && shopie ? (
        <>
          <Text style={styles.section}>Orbit Mart</Text>
          <TileGrid gap={spacing.md}>
            <StatTile label={t('common.new')} value={String(shopie.new_customers ?? 0)} icon="user-plus" iconTone="cyan" />
            <StatTile label={t('bi.returning')} value={String(shopie.returning_customers ?? 0)} icon="refresh-cw" iconTone="violet" />
            <StatTile label={t('bi.repeatRate')} value={pct(shopie.repeat_rate)} icon="repeat" iconTone="green" />
            <StatTile label={t('bi.mobile.avgOrders')} value={String(shopie.avg_orders_per_customer ?? 0)} icon="layers" iconTone="blue" />
          </TileGrid>
          <ChartGrid>
            {shopieMix.length ? (
              <ChartCard title={t('bi.mobile.newVsReturning')} subtitle={t('bi.mobile.hoverSliceHint')}>
                <DonutChart data={shopieMix} centerLabel={t('bi.mobile.unitShoppers')} />
              </ChartCard>
            ) : null}
            {shopieBars.length ? (
              <ChartCard
                title={t('bi.mostActiveShoppers')}
                subtitle={t('bi.mobile.mostActiveOrdersSub')}
              >
                <BarChart data={shopieBars} unit={t('bi.mobile.unitOrders')} />
              </ChartCard>
            ) : null}
          </ChartGrid>
        </>
      ) : null}
      {!appointie && !shopie ? (
        <Card>
          <Text style={styles.empty}>{t('bi.mobile.noCustomerActivityShort')}</Text>
        </Card>
      ) : null}
    </View>
  );
}

function BIRevenue({
  data,
  loading,
  showAppointie,
  showShopie,
  product: preferredProduct = 'appointie',
  onProductChange,
}: {
  data: ReturnType<typeof useBIRevenue>['data'];
  loading: boolean;
  showAppointie: boolean;
  showShopie: boolean;
  product?: ProductKey;
  onProductChange?: (next: ProductKey) => void;
}) {
  const { t } = useTranslation();
  const product = resolveProduct(showAppointie, showShopie, preferredProduct);
  if (loading && !data) return <ScreenState loading />;
  const appointie = data?.appointie ?? (showAppointie && data?.estimated_revenue != null ? data : null);
  const shopie = data?.shopie ?? null;
  const palette = [
    iconTones.blue.foreground,
    iconTones.violet.foreground,
    iconTones.cyan.foreground,
    iconTones.amber.foreground,
    iconTones.coral.foreground,
    iconTones.green.foreground,
  ];
  const mix = (appointie?.by_service ?? [])
    .filter((row) => Number(row.revenue) > 0)
    .slice(0, 6)
    .map((row, index) => ({
      label: row.service_name || t('bi.mobile.serviceFallback'),
      value: Number(row.revenue),
      color: palette[index % palette.length],
    }));
  const bars = (appointie?.by_service ?? []).slice(0, 7).map((row, index) => ({
    label: (row.service_name || t('bi.mobile.serviceFallback')).slice(0, 10),
    value: Number(row.revenue),
    highlight: index === 0,
  }));
  const channelBars = (shopie?.by_channel ?? []).map((row, index) => ({
    label: row.label,
    value: Number(row.gmv),
    highlight: index === 0,
  }));
  const categoryMix = (shopie?.by_category ?? []).slice(0, 6).map((row, index) => ({
    label: row.label,
    value: Number(row.gmv),
    color: palette[index % palette.length],
  }));

  return (
    <View style={styles.stack}>
      <View>
        <Text style={styles.heroTitle}>{t('bi.revenue')}</Text>
        <Text style={styles.heroHint}>
          {showAppointie && showShopie
            ? t('bi.revenueIntroSwitch')
            : showShopie
              ? t('bi.revenueIntroMart')
              : t('bi.revenueIntroAppoint')}
        </Text>
      </View>
      <BiProductSwitch
        showAppointie={showAppointie}
        showShopie={showShopie}
        value={product}
        onChange={onProductChange ?? (() => undefined)}
      />
      {product === 'appointie' && showAppointie && appointie ? (
        <>
          <Text style={styles.section}>Orbit Appoint</Text>
          <TileGrid gap={spacing.md}>
            <StatTile
              label={t('bi.estimatedRevenue')}
              value={money(appointie.estimated_revenue, appointie.currency)}
              icon="dollar-sign"
              iconTone="green"
            />
            <StatTile
              label={t('bi.completedRevenue')}
              value={money(appointie.completed_revenue, appointie.currency)}
              icon="check-circle"
              iconTone="green"
            />
            <StatTile
              label={t('bi.avgBookingValue')}
              value={money(appointie.avg_booking_value, appointie.currency)}
              icon="tag"
              iconTone="amber"
            />
          </TileGrid>
          <ChartGrid>
            {mix.length ? (
              <ChartCard title={t('bi.revenueByService')} subtitle={t('bi.mobile.hoverSliceAmount')}>
                <DonutChart data={mix} centerLabel={appointie.currency || t('bi.mobile.unitRevenueShort')} formatValue={formatAxisValue} />
              </ChartCard>
            ) : null}
            {bars.length ? (
              <ChartCard title={t('bi.mobile.topServices')} subtitle={t('bi.estimatedRevenue')}>
                <BarChart data={bars} formatValue={formatAxisValue} unit={appointie.currency} />
              </ChartCard>
            ) : null}
          </ChartGrid>
        </>
      ) : null}
      {product === 'shopie' && showShopie && shopie ? (
        <>
          <Text style={styles.section}>Orbit Mart</Text>
          <TileGrid gap={spacing.md}>
            <StatTile label={t('bi.gmv')} value={money(shopie.gmv, shopie.currency)} icon="dollar-sign" iconTone="green" />
            <StatTile
              label={t('bi.mobile.avgOrder')}
              value={money(shopie.avg_order_value, shopie.currency)}
              icon="tag"
              iconTone="amber"
            />
            <StatTile label={t('bi.orders')} value={String(shopie.orders ?? 0)} icon="shopping-bag" iconTone="blue" />
          </TileGrid>
          <ChartGrid>
            {channelBars.length ? (
              <ChartCard title={t('bi.byChannel')} subtitle={t('bi.mobile.hoverBarGmv')}>
                <BarChart data={channelBars} formatValue={formatAxisValue} unit={shopie.currency ?? undefined} />
              </ChartCard>
            ) : null}
            {categoryMix.length ? (
              <ChartCard title={t('bi.byCategory')} subtitle={t('bi.mobile.hoverSliceGmv')}>
                <DonutChart
                  data={categoryMix}
                  centerLabel={shopie.currency || t('bi.gmv')}
                  formatValue={formatAxisValue}
                />
              </ChartCard>
            ) : null}
          </ChartGrid>
        </>
      ) : null}
    </View>
  );
}

function BIForecast({
  data,
  loading,
  recentBookings,
  recentOrders,
  showAppointie,
  showShopie,
  product: preferredProduct = 'appointie',
  onProductChange,
}: {
  data: ReturnType<typeof useBIForecast>['data'];
  loading: boolean;
  recentBookings?: number;
  recentOrders?: number;
  showAppointie: boolean;
  showShopie: boolean;
  product?: ProductKey;
  onProductChange?: (next: ProductKey) => void;
}) {
  const { t } = useTranslation();
  const product = resolveProduct(showAppointie, showShopie, preferredProduct);
  if (loading && !data) return <ScreenState loading />;
  const appointie = data?.appointie ?? (showAppointie && data?.projected_bookings != null ? data : null);
  const shopie = data?.shopie ?? null;
  const bookingCompare = [
    { label: t('bi.mobile.last30d'), value: recentBookings ?? appointie?.based_on_bookings ?? 0 },
    { label: t('bi.mobile.next30d'), value: appointie?.projected_bookings ?? 0, highlight: true },
  ];
  const appointieRevenue = [
    { label: t('bi.mobile.avgPerDay'), value: Number(appointie?.avg_daily_revenue ?? 0) },
    { label: t('bi.mobile.projected'), value: Number(appointie?.projected_revenue ?? 0), highlight: true },
  ];
  const orderCompare = [
    { label: t('bi.mobile.last30d'), value: recentOrders ?? shopie?.based_on_orders ?? 0 },
    { label: t('bi.mobile.next30d'), value: shopie?.projected_orders ?? 0, highlight: true },
  ];
  const shopieRevenue = [
    { label: t('bi.mobile.avgPerDay'), value: Number(shopie?.avg_daily_revenue ?? 0) },
    { label: t('bi.mobile.projected'), value: Number(shopie?.projected_revenue ?? 0), highlight: true },
  ];

  return (
    <View style={styles.stack}>
      <View>
        <Text style={styles.heroTitle}>
          {t('bi.nextDays', { days: appointie?.horizon_days ?? shopie?.horizon_days ?? 30 })}
        </Text>
        <Text style={styles.heroHint}>
          {showAppointie && showShopie
            ? t('bi.forecastIntroSwitch')
            : showShopie
              ? t('bi.forecastIntroMart')
              : t('bi.forecastIntroAppoint')}
        </Text>
      </View>
      <BiProductSwitch
        showAppointie={showAppointie}
        showShopie={showShopie}
        value={product}
        onChange={onProductChange ?? (() => undefined)}
      />
      {product === 'appointie' && showAppointie && appointie ? (
        <>
          <Text style={styles.section}>Orbit Appoint</Text>
          <Text style={styles.heroHint}>
            {appointie.note ||
              t('bi.mobile.basedOnBookings', {
                days: appointie.based_on_days ?? 30,
                n: appointie.based_on_bookings ?? 0,
              })}
          </Text>
          <TileGrid gap={spacing.md}>
            <StatTile
              label={t('bi.projectedBookings')}
              value={String(appointie.projected_bookings ?? 0)}
              icon="calendar"
              iconTone="blue"
            />
            <StatTile
              label={t('bi.projectedRevenue')}
              value={money(appointie.projected_revenue, appointie.currency)}
              icon="dollar-sign"
              iconTone="green"
            />
            <StatTile
              label={t('bi.avgDailyBookings')}
              value={String(appointie.avg_daily_bookings ?? 0)}
              icon="activity"
              iconTone="violet"
            />
            <StatTile
              label={t('bi.avgDailyRevenue')}
              value={money(appointie.avg_daily_revenue, appointie.currency)}
              icon="trending-up"
              iconTone="green"
            />
          </TileGrid>
          <ChartGrid>
            <ChartCard title={t('bi.mobile.bookingsOutlook')} subtitle={t('bi.mobile.hoverBarCount')}>
              <BarChart data={bookingCompare} unit={t('bi.mobile.unitBookings')} />
            </ChartCard>
            <ChartCard title={t('bi.mobile.revenueOutlook')} subtitle={t('bi.mobile.hoverBarAmount')}>
              <BarChart data={appointieRevenue} formatValue={formatAxisValue} unit={appointie.currency} />
            </ChartCard>
          </ChartGrid>
        </>
      ) : null}
      {product === 'shopie' && showShopie && shopie ? (
        <>
          <Text style={styles.section}>Orbit Mart</Text>
          <Text style={styles.heroHint}>
            {shopie.note ||
              t('bi.mobile.basedOnOrders', {
                days: shopie.based_on_days ?? 30,
                n: shopie.based_on_orders ?? 0,
              })}
          </Text>
          <TileGrid gap={spacing.md}>
            <StatTile
              label={t('bi.projectedOrders')}
              value={String(shopie.projected_orders ?? 0)}
              icon="shopping-bag"
              iconTone="blue"
            />
            <StatTile
              label={t('bi.projectedGmv')}
              value={money(shopie.projected_revenue, shopie.currency)}
              icon="dollar-sign"
              iconTone="green"
            />
            <StatTile
              label={t('bi.avgDailyOrders')}
              value={String(shopie.avg_daily_orders ?? 0)}
              icon="activity"
              iconTone="violet"
            />
            <StatTile
              label={t('bi.avgDailyGmv')}
              value={money(shopie.avg_daily_revenue, shopie.currency)}
              icon="trending-up"
              iconTone="green"
            />
          </TileGrid>
          <ChartGrid>
            <ChartCard title={t('bi.mobile.ordersOutlook')} subtitle={t('bi.mobile.hoverBarCount')}>
              <BarChart data={orderCompare} unit={t('bi.mobile.unitOrders')} />
            </ChartCard>
            <ChartCard title={t('bi.mobile.gmvOutlook')} subtitle={t('bi.mobile.hoverBarAmount')}>
              <BarChart data={shopieRevenue} formatValue={formatAxisValue} unit={shopie.currency} />
            </ChartCard>
          </ChartGrid>
        </>
      ) : null}
    </View>
  );
}

function BIReports({
  data,
  loading,
  showAppointie,
  showShopie,
  product: preferredProduct = 'appointie',
  onProductChange,
}: {
  data: ReturnType<typeof useBIReports>['data'];
  loading: boolean;
  showAppointie: boolean;
  showShopie: boolean;
  product?: ProductKey;
  onProductChange?: (next: ProductKey) => void;
}) {
  const { t } = useTranslation();
  const product = resolveProduct(showAppointie, showShopie, preferredProduct);
  if (loading && !data) return <ScreenState loading />;
  const appointie = data?.appointie ?? (showAppointie && data?.summary && data?.revenue ? data : null);
  const shopie = data?.shopie ?? null;
  const summary = appointie?.summary;
  const trend = fillDailySeries((appointie?.trends?.rows ?? []).map((row) => ({ day: row.day, value: row.total })));
  const mix = summary
    ? [
        { label: t('bi.completed'), value: summary.completed ?? 0, color: iconTones.green.foreground },
        { label: t('bi.cancelled'), value: summary.cancelled ?? 0, color: iconTones.rose.foreground },
        { label: t('bi.mobile.statusNoShow'), value: summary.no_shows ?? 0, color: iconTones.coral.foreground },
      ].filter((slice) => slice.value > 0)
    : [];
  const shopieTrend = fillDailySeries((shopie?.trend ?? []).map((row) => ({ day: row.day, value: row.orders })));

  return (
    <View style={styles.stack}>
      <View>
        <Text style={styles.heroTitle}>{t('bi.reports')}</Text>
        <Text style={styles.heroHint}>
          {showAppointie && showShopie
            ? t('bi.reportsIntroSwitch')
            : t('bi.reportsIntro')}
        </Text>
      </View>
      <BiProductSwitch
        showAppointie={showAppointie}
        showShopie={showShopie}
        value={product}
        onChange={onProductChange ?? (() => undefined)}
      />
      {product === 'appointie' && showAppointie && appointie ? (
        <>
          <Text style={styles.section}>Orbit Appoint</Text>
          <TileGrid gap={spacing.md}>
            <StatTile label={t('bi.bookings')} value={String(summary?.bookings ?? 0)} icon="calendar" iconTone="blue" />
            <StatTile label={t('bi.profitCompletion')} value={pct(summary?.completion_rate)} icon="check-circle" iconTone="green" />
            <StatTile
              label={t('bi.mobile.estRevenue')}
              value={money(appointie.revenue?.estimated_revenue, appointie.revenue?.currency)}
              icon="trending-up"
              iconTone="green"
            />
            <StatTile label={t('bi.repeatRate')} value={pct(appointie.growth?.repeat_rate)} icon="repeat" iconTone="violet" />
          </TileGrid>
          <InsightPanel
            title={t('bi.mobile.insightsTitle')}
            subtitle={t('bi.mobile.reportInsightsSub')}
            insights={appointie.insights ?? []}
          />
          {trend.some((row) => row.value > 0) ? (
            <ChartCard title={t('bi.mobile.dailyTrend')} subtitle={t('bi.mobile.hoverDayBookingCount')}>
              <LineAreaChart data={trend} color={iconTones.blue.foreground} unit={t('bi.mobile.unitBookings')} />
            </ChartCard>
          ) : null}
          {mix.length ? (
            <ChartCard title={t('bi.profitOutcomes')} subtitle={t('bi.mobile.hoverSliceHint')}>
              <DonutChart data={mix} centerLabel={t('bi.mobile.unitBookings')} />
            </ChartCard>
          ) : null}
        </>
      ) : null}
      {product === 'shopie' && showShopie && shopie ? (
        <>
          <Text style={styles.section}>Orbit Mart</Text>
          <TileGrid gap={spacing.md}>
            <StatTile label={t('bi.orders')} value={String(shopie.orders ?? 0)} icon="shopping-bag" iconTone="blue" />
            <StatTile label={t('bi.gmv')} value={money(shopie.gmv, shopie.currency)} icon="trending-up" iconTone="green" />
            <StatTile
              label={t('bi.mobile.avgOrder')}
              value={money(shopie.avg_order_value, shopie.currency)}
              icon="tag"
              iconTone="amber"
            />
            <StatTile label={t('bi.repeatRate')} value={pct(shopie.growth?.repeat_rate)} icon="repeat" iconTone="violet" />
          </TileGrid>
          <InsightPanel
            title={t('bi.commerceInsights')}
            subtitle={t('bi.mobile.commerceInsightsSub')}
            insights={shopie.insights ?? []}
          />
          {shopieTrend.some((row) => row.value > 0) ? (
            <ChartCard title={t('bi.orderTrend')} subtitle={t('bi.mobile.hoverDayOrderCount')}>
              <LineAreaChart data={shopieTrend} color={iconTones.green.foreground} unit={t('bi.mobile.unitOrders')} />
            </ChartCard>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  tabStaffFilter: {
    marginTop: 2,
  },
  tabTrack: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  tabScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: spacing.sm,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 132,
  },
  tabBtnDesktop: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabBtnLocked: {
    opacity: 0.78,
  },
  tabBtnPressed: {
    opacity: 0.92,
  },
  tabIconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapActive: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  tabCopy: { flex: 1, minWidth: 0, gap: 1 },
  tabLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabLabel: { ...typography.label, fontFamily: fonts.bodySemi, color: colors.foreground },
  tabLabelActive: { color: colors.primaryForeground },
  tabHint: { ...typography.tiny, color: colors.mutedForeground },
  tabHintActive: { color: 'rgba(255,255,255,0.78)' },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  lockCard: { gap: spacing.sm },
  lockTitle: { ...typography.title, fontSize: 18, color: colors.foreground },
  lockMeta: { ...typography.body, color: colors.mutedForeground },
  lockCta: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  lockCtaText: { ...typography.caption, fontWeight: '700', color: '#fff' },
  stack: { gap: spacing.md },
  heroTitle: { ...typography.title, fontSize: 20, color: colors.foreground },
  heroHint: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
  productTrack: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  productBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  productBtnActive: {
    backgroundColor: colors.primary,
  },
  productBtnText: {
    ...typography.label,
    fontFamily: fonts.bodySemi,
    color: colors.foreground,
  },
  productBtnTextActive: {
    color: colors.primaryForeground,
  },
  section: { ...typography.title, fontSize: 16, color: colors.foreground },
  empty: { ...typography.body, color: colors.mutedForeground },
  panel: { gap: spacing.sm },
  panelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground, flexShrink: 1 },
  panelHelpBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  panelHelpBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.mutedForeground,
    lineHeight: 14,
  },
  linkText: { color: colors.primary, textDecorationLine: 'underline' },
  rowLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.foreground },
  rowMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  rowValue: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.foreground },
  loyaltyRightCol: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    maxWidth: '52%',
  },
  loyaltyPointsValue: {
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  loyaltyProfitTileValue: {
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  profitChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  profitChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  profitChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  profitChipText: { ...typography.caption, color: colors.foreground, fontFamily: fonts.bodyMedium },
  profitChipTextActive: { color: colors.primaryForeground },
  pager: {
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  pagerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  pagerSizeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pagerNav: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  pagerBtn: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pagerBtnDisabled: { opacity: 0.4 },
  pagerBtnText: { ...typography.caption, color: colors.foreground, fontFamily: fonts.bodyMedium },
  pagerBtnTextActive: { color: colors.primaryForeground },
  profitSearchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  profitSearchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  sparkRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 64,
    marginTop: 4,
  },
  sparkBar: {
    flex: 1,
    minWidth: 4,
    borderRadius: 3,
  },
  insightBlock: {
    gap: 2,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  insightTitle: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.foreground },
  insightWarning: { color: colors.destructive },
  insightPositive: { color: colors.success },
});
