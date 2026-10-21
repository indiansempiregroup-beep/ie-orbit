import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BiProductKey } from './components/BiProductTabs';
import type {
  BIForecastResponse,
  BIGrowthResponse,
  BIOperationsReport,
  BIReportsResponse,
  BIRevenueResponse,
  BITrendsReport,
} from '@ie-orbit/sdk';
import { productsWithBiFeature } from '../../config/planFeatures';
import { getSubscribedProductIds } from '../../config/products';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApiClient } from '../../hooks/useApiClient';
import { useReportStaffFilter } from '../../hooks/useReportStaffFilter';
import { useBusinessBillingSnapshotQuery } from '../settings/billingHooks';

function rangeQuery(startDate?: string, endDate?: string, staffId?: string | null) {
  const query: { start_date?: string; end_date?: string; staff_id?: string } = {};
  if (startDate && endDate) {
    query.start_date = startDate;
    query.end_date = endDate;
  }
  if (staffId) query.staff_id = staffId;
  return Object.keys(query).length ? query : undefined;
}

export function useBIOverviewQuery(startDate?: string, endDate?: string, enabled = true) {
  const client = useApiClient();
  const { staffId } = useReportStaffFilter();
  return useQuery({
    queryKey: ['bi', 'overview', startDate ?? 'default', endDate ?? 'default', staffId ?? 'all'],
    enabled,
    queryFn: async () =>
      (await client.bi.overview(rangeQuery(startDate, endDate, staffId))).data,
  });
}

export function useBiProductVisibility(feature: string) {
  const { activeBusiness, businessId } = useWorkspace();
  const billingQuery = useBusinessBillingSnapshotQuery(businessId ?? activeBusiness?.id);
  const subscribedIds = useMemo(
    () => getSubscribedProductIds(activeBusiness?.product_subscriptions),
    [activeBusiness?.product_subscriptions],
  );
  const products = useMemo(
    () => productsWithBiFeature(billingQuery.data, feature, subscribedIds),
    [billingQuery.data, feature, subscribedIds],
  );
  return {
    showAppointie: products.includes('appointie'),
    showShopie: products.includes('shopie'),
    currency: activeBusiness?.currency || 'INR',
  };
}

const BI_PRODUCT_TAB_KEY = 'ie-orbit.bi-product-tab';

function readStoredProduct(): BiProductKey {
  if (typeof window === 'undefined') return 'appointie';
  const saved = window.sessionStorage.getItem(BI_PRODUCT_TAB_KEY);
  return saved === 'shopie' ? 'shopie' : 'appointie';
}

export function useBiProductTab(showAppointie: boolean, showShopie: boolean) {
  const [preferred, setPreferred] = useState<BiProductKey>(readStoredProduct);
  useEffect(() => {
    if (preferred === 'appointie' && !showAppointie && showShopie) setPreferred('shopie');
    if (preferred === 'shopie' && !showShopie && showAppointie) setPreferred('appointie');
  }, [preferred, showAppointie, showShopie]);
  const product: BiProductKey =
    showAppointie && showShopie ? preferred : showShopie && !showAppointie ? 'shopie' : 'appointie';
  return {
    product,
    setProduct: (next: BiProductKey) => {
      setPreferred(next);
      if (typeof window !== 'undefined') window.sessionStorage.setItem(BI_PRODUCT_TAB_KEY, next);
    },
    showSwitcher: showAppointie && showShopie,
  };
}

export function useBIRevenueQuery(startDate?: string, endDate?: string) {
  const client = useApiClient();
  const { staffId } = useReportStaffFilter();
  return useQuery({
    queryKey: ['bi', 'revenue', startDate ?? 'default', endDate ?? 'default', staffId ?? 'all'],
    queryFn: async () =>
      (await client.bi.revenue(rangeQuery(startDate, endDate, staffId))).data as BIRevenueResponse,
  });
}

export function useBITrendsQuery(startDate?: string, endDate?: string) {
  const client = useApiClient();
  const { staffId } = useReportStaffFilter();
  return useQuery({
    queryKey: ['bi', 'trends', startDate ?? 'default', endDate ?? 'default', staffId ?? 'all'],
    queryFn: async () =>
      (await client.bi.trends(rangeQuery(startDate, endDate, staffId))).data as BITrendsReport,
  });
}

export function useBIForecastQuery(horizonDays = 30) {
  const client = useApiClient();
  const { staffId } = useReportStaffFilter();
  return useQuery({
    queryKey: ['bi', 'forecast', horizonDays, staffId ?? 'all'],
    queryFn: async () =>
      (await client.bi.forecast({
        horizon_days: horizonDays,
        ...(staffId ? { staff_id: staffId } : {}),
      })).data as BIForecastResponse,
  });
}

export function useBIGrowthQuery(startDate?: string, endDate?: string) {
  const client = useApiClient();
  const { staffId } = useReportStaffFilter();
  return useQuery({
    queryKey: ['bi', 'growth', startDate ?? 'default', endDate ?? 'default', staffId ?? 'all'],
    queryFn: async () =>
      (await client.bi.growth(rangeQuery(startDate, endDate, staffId))).data as BIGrowthResponse,
  });
}

export function useBIOperationsQuery(startDate?: string, endDate?: string) {
  const client = useApiClient();
  const { staffId } = useReportStaffFilter();
  return useQuery({
    queryKey: ['bi', 'operations', startDate ?? 'default', endDate ?? 'default', staffId ?? 'all'],
    queryFn: async () =>
      (await client.bi.operations(rangeQuery(startDate, endDate, staffId))).data as BIOperationsReport,
  });
}

export function useBIReportsQuery(startDate?: string, endDate?: string) {
  const client = useApiClient();
  const { staffId } = useReportStaffFilter();
  return useQuery({
    queryKey: ['bi', 'reports', startDate ?? 'default', endDate ?? 'default', staffId ?? 'all'],
    queryFn: async () =>
      (await client.bi.reports(rangeQuery(startDate, endDate, staffId))).data as BIReportsResponse,
  });
}
