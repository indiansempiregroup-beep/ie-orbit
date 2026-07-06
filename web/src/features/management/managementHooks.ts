import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import {
  createCustomer,
  createService,
  createStaff,
  getCustomer,
  getService,
  getStaff,
  listCustomers,
  listServices,
  listStaff,
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
  const auth = useAuth();
  return useQuery<Customer[], Error>({
    queryKey: ['management', 'customers'],
    queryFn: () => listCustomers(auth.token),
    enabled: Boolean(auth.token),
    staleTime: 1000 * 60 * 5,
  });
}

export function useServiceList() {
  const auth = useAuth();
  return useQuery<Service[], Error>({
    queryKey: ['management', 'services'],
    queryFn: () => listServices(auth.token),
    enabled: Boolean(auth.token),
    staleTime: 1000 * 60 * 5,
  });
}

export function useStaffList() {
  const auth = useAuth();
  return useQuery<StaffMember[], Error>({
    queryKey: ['management', 'staff'],
    queryFn: () => listStaff(auth.token),
    enabled: Boolean(auth.token),
    staleTime: 1000 * 60 * 5,
  });
}

export function useCustomerSearch(term: string) {
  const auth = useAuth();
  return useQuery<Customer[], Error>({
    queryKey: ['management', 'customers', 'search', term],
    queryFn: () => searchCustomers(auth.token, term),
    enabled: Boolean(auth.token) && Boolean(term.trim()),
    staleTime: 1000 * 10,
  });
}

export function useServiceSearch(term: string) {
  const auth = useAuth();
  return useQuery<Service[], Error>({
    queryKey: ['management', 'services', 'search', term],
    queryFn: () => searchServices(auth.token, term),
    enabled: Boolean(auth.token) && Boolean(term.trim()),
    staleTime: 1000 * 10,
  });
}

export function useStaffSearch(term: string) {
  const auth = useAuth();
  return useQuery<StaffMember[], Error>({
    queryKey: ['management', 'staff', 'search', term],
    queryFn: () => searchStaff(auth.token, term),
    enabled: Boolean(auth.token) && Boolean(term.trim()),
    staleTime: 1000 * 10,
  });
}

export function useCustomerCreate() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return useMutation<Customer, Error, Parameters<typeof createCustomer>[1]>({
    mutationFn: (customer) => createCustomer(auth.token, customer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['management', 'customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'customers'] });
    },
  });
}

export function useServiceCreate() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return useMutation<Service, Error, Parameters<typeof createService>[1]>({
    mutationFn: (service) => createService(auth.token, service),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['management', 'services'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'services'] });
    },
  });
}

export function useStaffCreate() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return useMutation<StaffMember, Error, Parameters<typeof createStaff>[1]>({
    mutationFn: (staff) => createStaff(auth.token, staff),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['management', 'staff'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'staff'] });
    },
  });
}

export function useCustomerUpdate() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return useMutation<Customer, Error, { customerId: string; customer: Parameters<typeof updateCustomer>[2] }>({
    mutationFn: ({ customerId, customer }) => updateCustomer(auth.token, customerId, customer),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['management', 'customers'] });
      queryClient.invalidateQueries({ queryKey: ['management', 'customer', variables.customerId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'customers'] });
    },
  });
}

export function useServiceUpdate() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return useMutation<Service, Error, { serviceId: string; service: Parameters<typeof updateService>[2] }>({
    mutationFn: ({ serviceId, service }) => updateService(auth.token, serviceId, service),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['management', 'services'] });
      queryClient.invalidateQueries({ queryKey: ['management', 'service', variables.serviceId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'services'] });
    },
  });
}

export function useStaffUpdate() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return useMutation<StaffMember, Error, { staffId: string; staff: Parameters<typeof updateStaff>[2] }>({
    mutationFn: ({ staffId, staff }) => updateStaff(auth.token, staffId, staff),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['management', 'staff'] });
      queryClient.invalidateQueries({ queryKey: ['management', 'staff', variables.staffId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'staff'] });
    },
  });
}

export function useCustomerDetail(customerId?: string) {
  const auth = useAuth();
  return useQuery<Customer, Error>({
    queryKey: ['management', 'customer', customerId],
    queryFn: () => getCustomer(auth.token, customerId ?? ''),
    enabled: Boolean(auth.token) && Boolean(customerId),
    staleTime: 1000 * 60 * 5,
  });
}

export function useServiceDetail(serviceId?: string) {
  const auth = useAuth();
  return useQuery<Service, Error>({
    queryKey: ['management', 'service', serviceId],
    queryFn: () => getService(auth.token, serviceId ?? ''),
    enabled: Boolean(auth.token) && Boolean(serviceId),
    staleTime: 1000 * 60 * 5,
  });
}

export function useStaffDetail(staffId?: string) {
  const auth = useAuth();
  return useQuery<StaffMember, Error>({
    queryKey: ['management', 'staff', staffId],
    queryFn: () => getStaff(auth.token, staffId ?? ''),
    enabled: Boolean(auth.token) && Boolean(staffId),
    staleTime: 1000 * 60 * 5,
  });
}
