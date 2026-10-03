import { useQuery } from '@tanstack/react-query';
import type {
  BIForecastReport,
  BIGrowthReport,
  BIOperationsReport,
  BIReportsBundle,
  BIRevenueReport,
  BITrendsReport,
} from '@ie-orbit/sdk';
import { useApiClient } from '../../hooks/useApiClient';

function rangeQuery(startDate?: string, endDate?: string) {
  return startDate && endDate ? { start_date: startDate, end_date: endDate } : undefined;
}

export function useBIOverviewQuery(startDate?: string, endDate?: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['bi', 'overview', startDate ?? 'default', endDate ?? 'default'],
    enabled,
    queryFn: async () =>
      (await client.bi.overview(rangeQuery(startDate, endDate))).data,
  });
}

export function useBIRevenueQuery(startDate?: string, endDate?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['bi', 'revenue', startDate ?? 'default', endDate ?? 'default'],
    queryFn: async () => (await client.bi.revenue(rangeQuery(startDate, endDate))).data as BIRevenueReport,
  });
}

export function useBITrendsQuery(startDate?: string, endDate?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['bi', 'trends', startDate ?? 'default', endDate ?? 'default'],
    queryFn: async () => (await client.bi.trends(rangeQuery(startDate, endDate))).data as BITrendsReport,
  });
}

export function useBIForecastQuery(horizonDays = 30) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['bi', 'forecast', horizonDays],
    queryFn: async () => (await client.bi.forecast({ horizon_days: horizonDays })).data as BIForecastReport,
  });
}

export function useBIGrowthQuery(startDate?: string, endDate?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['bi', 'growth', startDate ?? 'default', endDate ?? 'default'],
    queryFn: async () => (await client.bi.growth(rangeQuery(startDate, endDate))).data as BIGrowthReport,
  });
}

export function useBIOperationsQuery(startDate?: string, endDate?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['bi', 'operations', startDate ?? 'default', endDate ?? 'default'],
    queryFn: async () =>
      (await client.bi.operations(rangeQuery(startDate, endDate))).data as BIOperationsReport,
  });
}

export function useBIReportsQuery(startDate?: string, endDate?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['bi', 'reports', startDate ?? 'default', endDate ?? 'default'],
    queryFn: async () => (await client.bi.reports(rangeQuery(startDate, endDate))).data as BIReportsBundle,
  });
}
