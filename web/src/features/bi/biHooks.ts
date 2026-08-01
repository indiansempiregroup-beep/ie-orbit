import { useQuery } from '@tanstack/react-query';
import type {
  BIForecastReport,
  BIGrowthReport,
  BIOperationsReport,
  BIReportsBundle,
  BIRevenueReport,
  BITrendsReport,
} from '@ie-platform/sdk';
import { useApiClient } from '../../hooks/useApiClient';

function defaultRange() {
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 29).toISOString().slice(0, 10);
  return { startDate, endDate };
}

export function useBIOverviewQuery(startDate?: string, endDate?: string) {
  const client = useApiClient();
  const range = defaultRange();
  const start = startDate ?? range.startDate;
  const end = endDate ?? range.endDate;
  return useQuery({
    queryKey: ['bi', 'overview', start, end],
    queryFn: async () => (await client.bi.overview({ start_date: start, end_date: end })).data,
  });
}

export function useBIRevenueQuery(startDate?: string, endDate?: string) {
  const client = useApiClient();
  const range = defaultRange();
  const start = startDate ?? range.startDate;
  const end = endDate ?? range.endDate;
  return useQuery({
    queryKey: ['bi', 'revenue', start, end],
    queryFn: async () => (await client.bi.revenue({ start_date: start, end_date: end })).data as BIRevenueReport,
  });
}

export function useBITrendsQuery(startDate?: string, endDate?: string) {
  const client = useApiClient();
  const range = defaultRange();
  const start = startDate ?? range.startDate;
  const end = endDate ?? range.endDate;
  return useQuery({
    queryKey: ['bi', 'trends', start, end],
    queryFn: async () => (await client.bi.trends({ start_date: start, end_date: end })).data as BITrendsReport,
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
  const range = defaultRange();
  const start = startDate ?? range.startDate;
  const end = endDate ?? range.endDate;
  return useQuery({
    queryKey: ['bi', 'growth', start, end],
    queryFn: async () => (await client.bi.growth({ start_date: start, end_date: end })).data as BIGrowthReport,
  });
}

export function useBIOperationsQuery(startDate?: string, endDate?: string) {
  const client = useApiClient();
  const range = defaultRange();
  const start = startDate ?? range.startDate;
  const end = endDate ?? range.endDate;
  return useQuery({
    queryKey: ['bi', 'operations', start, end],
    queryFn: async () =>
      (await client.bi.operations({ start_date: start, end_date: end })).data as BIOperationsReport,
  });
}

export function useBIReportsQuery(startDate?: string, endDate?: string) {
  const client = useApiClient();
  const range = defaultRange();
  const start = startDate ?? range.startDate;
  const end = endDate ?? range.endDate;
  return useQuery({
    queryKey: ['bi', 'reports', start, end],
    queryFn: async () => (await client.bi.reports({ start_date: start, end_date: end })).data as BIReportsBundle,
  });
}
