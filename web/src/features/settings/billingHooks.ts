import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BillingCheckoutInput } from '@ie-platform/sdk';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';

export function useBillingStatusQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['billing', 'status'],
    queryFn: async () => (await client.billing.status()).data,
  });
}

export function useBillingPlansQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: async () => (await client.billing.plans()).data,
  });
}

export function useBillingWebhookSummaryQuery(windowHours = 24) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['billing', 'webhook-summary', windowHours],
    queryFn: async () => (await client.billing.webhookSummary({ window_hours: windowHours })).data,
  });
}

export function useBillingGoLiveCheckQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['billing', 'go-live-check'],
    queryFn: async () => (await client.billing.goLiveCheck()).data,
  });
}

export function useBillingReleaseGateQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['billing', 'release-gate'],
    queryFn: async () => (await client.billing.releaseGate()).data,
  });
}

export function useBillingObservabilityQuery(windowHours = 24) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['billing', 'observability', windowHours],
    queryFn: async () => (await client.billing.observability({ window_hours: windowHours })).data,
  });
}

export function useBillingOpsSnapshotQuery(windowHours = 24) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['billing', 'ops-snapshot', windowHours],
    queryFn: async () => (await client.billing.opsSnapshot({ window_hours: windowHours })).data,
  });
}

export function useBillingOpsDigestQuery(windowHours = 24) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['billing', 'ops-digest', windowHours],
    queryFn: async () => (await client.billing.opsDigest({ window_hours: windowHours })).data,
  });
}

export function useBillingPlatformOpsSummaryQuery(windowHours = 24, limit = 50, enabled = false) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['billing', 'platform-ops-summary', windowHours, limit],
    queryFn: async () => (await client.billing.platformOpsSummary({ window_hours: windowHours, limit })).data,
    enabled,
    retry: false,
  });
}

export function useBillingPlatformSubscriptionsQuery(enabled = false) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['billing', 'platform-subscriptions'],
    queryFn: async () => (await client.billing.platformSubscriptions()).data,
    enabled,
    retry: false,
  });
}

export function useBillingPlatformMonitoringQuery(windowHours = 24, enabled = false) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['billing', 'platform-monitoring', windowHours],
    queryFn: async () => (await client.billing.platformMonitoring({ window_hours: windowHours })).data,
    enabled,
    retry: false,
  });
}

export function useBillingPlatformAuditFeedQuery(limit = 50, enabled = false) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['billing', 'platform-audit-feed', limit],
    queryFn: async () => (await client.billing.platformAuditFeed({ limit })).data,
    enabled,
    retry: false,
  });
}

export function useBillingCheckout() {
  const client = useApiClient();
  const workspace = useWorkspace();
  return useMutation({
    mutationFn: async (input: Omit<BillingCheckoutInput, 'business_id'>) => {
      const response = await client.billing.checkout({
        ...input,
        business_id: workspace.businessId ?? undefined,
      });
      return response.data;
    },
  });
}

export function useBillingWebhookEventsQuery(
  status?: 'received' | 'processed' | 'failed' | 'ignored' | 'dead_letter',
  exhausted?: boolean,
) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['billing', 'webhook-events', status ?? 'all', exhausted ? 'exhausted' : 'all-retries'],
    queryFn: async () =>
      (await client.billing.webhookEvents({
        ...(status ? { status } : {}),
        ...(exhausted ? { exhausted: true } : {}),
      })).data,
  });
}

export function useBillingWebhookReprocess() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => (await client.billing.reprocessWebhookEvent(eventId)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'webhook-events'] });
    },
  });
}

export function useBillingWebhookBulkReprocess() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { scope: 'failed' | 'dead_letter'; limit?: number; confirm?: boolean }) =>
      (await client.billing.reprocessWebhookEventsBulk(input)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'webhook-events'] });
      queryClient.invalidateQueries({ queryKey: ['billing', 'webhook-summary'] });
    },
  });
}
