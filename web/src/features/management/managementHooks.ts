import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import { invalidateWorkspaceData } from '../../lib/workspace';
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

export function useCustomerList() {
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  return useQuery<Customer[], Error>({
    queryKey: ['management', 'customers', ...scopeKey],
    queryFn: () => listCustomers(client, businessId),
    enabled: workspaceReady,
    staleTime: 1000 * 60 * 5,
  });
}

export function useServiceList() {
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  return useQuery<Service[], Error>({
    queryKey: ['management', 'services', ...scopeKey],
    queryFn: () => listServices(client, businessId),
    enabled: workspaceReady,
    staleTime: 1000 * 60 * 5,
  });
}

export function useStaffList() {
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  return useQuery<StaffMember[], Error>({
    queryKey: ['management', 'staff', ...scopeKey],
    queryFn: () => listStaff(client, businessId),
    enabled: workspaceReady,
    staleTime: 1000 * 60 * 5,
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
