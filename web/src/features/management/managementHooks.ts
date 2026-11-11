import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { clampPageSize, toPagedResult, type PagedResult } from '@ie-orbit/sdk';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import { invalidateWorkspaceData } from '../../lib/workspace';
import { normalizeCustomer, normalizeService, normalizeStaff } from '../../lib/managementEntities';
import {
  archiveCustomer,
  createCustomer,
  createService,
  createStaff,
  getCustomer,
  getService,
  getStaff,
  listCustomers,
  listServices,
  listStaff,
  restoreCustomer,
  searchCustomers,
  searchServices,
  searchStaff,
  updateCustomer,
  updateService,
  updateStaff,
  type Customer,
  type Service,
  type StaffMember,
} from './managementApi';
import { businessQueryParam } from '../../lib/workspace';

type ListOptions = {
  q?: string;
  status?: string;
  pageSize?: number;
  cursor?: string | null;
  /** Set false to skip fetching (e.g. closed pickers). */
  enabled?: boolean;
};

export function useCustomerList(options?: ListOptions) {
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  const pageSize = options?.pageSize ?? 50;
  const cursor = options?.cursor || undefined;
  const q = options?.q?.trim() || undefined;
  const status = options?.status || undefined;
  return useQuery<PagedResult<Customer>, Error>({
    queryKey: ['management', 'customers', ...scopeKey, q || '', status || '', pageSize, cursor || ''],
    queryFn: async () => {
      const response = await client.customers.list({
        ...businessQueryParam(businessId),
        q,
        status,
        page_size: clampPageSize(pageSize),
        cursor,
      });
      const page = toPagedResult(response, pageSize);
      return {
        ...page,
        items: page.items.map((row) => normalizeCustomer(row as unknown as Record<string, unknown>)),
      };
    },
    enabled: workspaceReady && options?.enabled !== false,
    staleTime: 1000 * 30,
  });
}

export function useServiceList(options?: ListOptions) {
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  const pageSize = options?.pageSize ?? 25;
  const cursor = options?.cursor || undefined;
  const q = options?.q?.trim() || undefined;
  const status = options?.status || undefined;
  return useQuery<PagedResult<Service>, Error>({
    queryKey: ['management', 'services', ...scopeKey, q || '', status || '', pageSize, cursor || ''],
    queryFn: async () => {
      const response = await client.services.list({
        ...businessQueryParam(businessId),
        q,
        status,
        page_size: clampPageSize(pageSize),
        cursor,
      });
      const page = toPagedResult(response, pageSize);
      return {
        ...page,
        items: page.items.map((row) => normalizeService(row as unknown as Record<string, unknown>)),
      };
    },
    enabled: workspaceReady && options?.enabled !== false,
    staleTime: 1000 * 30,
  });
}

export function useStaffList(options?: ListOptions) {
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  const pageSize = options?.pageSize ?? 25;
  const cursor = options?.cursor || undefined;
  const q = options?.q?.trim() || undefined;
  const status = options?.status || undefined;
  return useQuery<PagedResult<StaffMember>, Error>({
    queryKey: ['management', 'staff', ...scopeKey, q || '', status || '', pageSize, cursor || ''],
    queryFn: async () => {
      const response = await client.staff.list({
        ...businessQueryParam(businessId),
        q,
        status,
        page_size: clampPageSize(pageSize),
        cursor,
      });
      const page = toPagedResult(response, pageSize);
      return {
        ...page,
        items: page.items.map((row) => normalizeStaff(row as unknown as Record<string, unknown>)),
      };
    },
    enabled: workspaceReady && options?.enabled !== false,
    staleTime: 1000 * 30,
  });
}

export function useCustomerSearch(term: string) {
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  return useQuery<Customer[], Error>({
    queryKey: ['management', 'customers', 'search', term, ...scopeKey],
    queryFn: () => searchCustomers(client, businessId, term),
    enabled: workspaceReady && Boolean(term.trim()),
    staleTime: 1000 * 10,
  });
}

export function useServiceSearch(term: string) {
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  return useQuery<Service[], Error>({
    queryKey: ['management', 'services', 'search', term, ...scopeKey],
    queryFn: () => searchServices(client, businessId, term),
    enabled: workspaceReady && Boolean(term.trim()),
    staleTime: 1000 * 10,
  });
}

export function useStaffSearch(term: string) {
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  return useQuery<StaffMember[], Error>({
    queryKey: ['management', 'staff', 'search', term, ...scopeKey],
    queryFn: () => searchStaff(client, businessId, term),
    enabled: workspaceReady && Boolean(term.trim()),
    staleTime: 1000 * 10,
  });
}

export function useCustomerCreate() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<Customer, Error, Parameters<typeof createCustomer>[1]>({
    mutationFn: (customer) => createCustomer(client, customer),
    onSuccess: () => invalidateWorkspaceData(queryClient),
  });
}

export function useServiceCreate() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<Service, Error, Parameters<typeof createService>[1]>({
    mutationFn: (service) => createService(client, service),
    onSuccess: () => invalidateWorkspaceData(queryClient),
  });
}

export function useStaffCreate() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<StaffMember, Error, Parameters<typeof createStaff>[1]>({
    mutationFn: (staff) => createStaff(client, staff),
    onSuccess: () => invalidateWorkspaceData(queryClient),
  });
}

export function useCustomerUpdate() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<Customer, Error, { customerId: string; customer: Parameters<typeof updateCustomer>[2] }>({
    mutationFn: ({ customerId, customer }) => updateCustomer(client, customerId, customer),
    onSuccess: (_, variables) => {
      invalidateWorkspaceData(queryClient);
      queryClient.invalidateQueries({ queryKey: ['management', 'customer', variables.customerId] });
    },
  });
}

export function useCustomerArchive() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (customerId) => archiveCustomer(client, customerId),
    onSuccess: () => invalidateWorkspaceData(queryClient),
  });
}

export function useCustomerRestore() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<Customer, Error, string>({
    mutationFn: (customerId) => restoreCustomer(client, customerId),
    onSuccess: () => invalidateWorkspaceData(queryClient),
  });
}

export function useServiceUpdate() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<Service, Error, { serviceId: string; service: Parameters<typeof updateService>[2] }>({
    mutationFn: ({ serviceId, service }) => updateService(client, serviceId, service),
    onSuccess: (_, variables) => {
      invalidateWorkspaceData(queryClient);
      queryClient.invalidateQueries({ queryKey: ['management', 'service', variables.serviceId] });
    },
  });
}

export function useStaffUpdate() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<StaffMember, Error, { staffId: string; staff: Parameters<typeof updateStaff>[2] }>({
    mutationFn: ({ staffId, staff }) => updateStaff(client, staffId, staff),
    onSuccess: (_, variables) => {
      invalidateWorkspaceData(queryClient);
      queryClient.invalidateQueries({ queryKey: ['management', 'staff', variables.staffId] });
    },
  });
}

export function useCustomerDetail(customerId?: string) {
  const client = useApiClient();
  const { scopeKey, workspaceReady } = useWorkspaceScope();
  return useQuery<Customer, Error>({
    queryKey: ['management', 'customer', customerId, ...scopeKey],
    queryFn: () => getCustomer(client, customerId ?? ''),
    enabled: workspaceReady && Boolean(customerId),
    staleTime: 1000 * 60 * 5,
  });
}

export function useServiceDetail(serviceId?: string) {
  const client = useApiClient();
  const { scopeKey, workspaceReady } = useWorkspaceScope();
  return useQuery<Service, Error>({
    queryKey: ['management', 'service', serviceId, ...scopeKey],
    queryFn: () => getService(client, serviceId ?? ''),
    enabled: workspaceReady && Boolean(serviceId),
    staleTime: 1000 * 60 * 5,
  });
}

export function useStaffDetail(staffId?: string) {
  const client = useApiClient();
  const { scopeKey, workspaceReady } = useWorkspaceScope();
  return useQuery<StaffMember, Error>({
    queryKey: ['management', 'staff', staffId, ...scopeKey],
    queryFn: () => getStaff(client, staffId ?? ''),
    enabled: workspaceReady && Boolean(staffId),
    staleTime: 1000 * 60 * 5,
  });
}

/** Fetch just the services referenced by a document (no full catalog dump). */
export function useServiceDetails(serviceIds: string[]) {
  const client = useApiClient();
  const { scopeKey, workspaceReady } = useWorkspaceScope();
  const ids = Array.from(new Set(serviceIds.filter(Boolean)));
  const results = useQueries({
    queries: ids.map((serviceId) => ({
      queryKey: ['management', 'service', serviceId, ...scopeKey],
      queryFn: () => getService(client, serviceId),
      enabled: workspaceReady,
      staleTime: 1000 * 60 * 5,
    })),
  });
  return { ids, services: results.map((result) => result.data).filter(Boolean) as Service[] };
}
