import type { IEOrbitClient } from '@ie-orbit/sdk';
import {
  type Customer,
  type CustomerCreateInput,
  type CustomerUpdateInput,
  type Service,
  type ServiceCreateInput,
  type ServiceUpdateInput,
  type StaffMember,
  type StaffCreateInput,
  type StaffUpdateInput,
} from '@ie-orbit/sdk';
import { businessQueryParam } from '../../lib/workspace';
import { normalizeCustomer, normalizeService, normalizeStaff } from '../../lib/managementEntities';

type QueryParams = Record<string, string | number | boolean | undefined | null>;

function normalizeQuery(query?: QueryParams): QueryParams | undefined {
  if (!query) return undefined;
  return Object.entries(query).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) return acc;
    acc[key] = typeof value === 'boolean' ? (value ? 'true' : 'false') : value;
    return acc;
  }, {} as QueryParams);
}

function scopedQuery(businessId: string | null | undefined, query?: QueryParams) {
  return normalizeQuery({ ...businessQueryParam(businessId), ...query });
}

export async function listCustomers(client: IEOrbitClient, businessId?: string | null, query?: QueryParams) {
  const response = await client.customers.list(scopedQuery(businessId, query));
  return response.data.map((row) => normalizeCustomer(row as Record<string, unknown>));
}

export async function getCustomer(client: IEOrbitClient, customerId: string) {
  const response = await client.customers.get(customerId);
  return normalizeCustomer(response.data as Record<string, unknown>);
}

export async function createCustomer(client: IEOrbitClient, customer: CustomerCreateInput) {
  const response = await client.customers.create(customer);
  return normalizeCustomer(response.data as Record<string, unknown>);
}

export async function updateCustomer(client: IEOrbitClient, customerId: string, customer: CustomerUpdateInput) {
  const response = await client.customers.patch(customerId, customer);
  return normalizeCustomer(response.data as Record<string, unknown>);
}

export async function archiveCustomer(client: IEOrbitClient, customerId: string) {
  await client.customers.delete(customerId);
}

export async function restoreCustomer(client: IEOrbitClient, customerId: string) {
  const response = await client.customers.restore(customerId);
  return normalizeCustomer(response.data as Record<string, unknown>);
}

export async function searchCustomers(client: IEOrbitClient, businessId: string | null | undefined, term: string) {
  const customers = await listCustomers(client, businessId);
  const lower = term.trim().toLowerCase();
  if (!lower) return customers;
  return customers.filter((customer) => {
    return [customer.full_name, customer.email, customer.phone_number, customer.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(lower));
  });
}

export async function listServices(client: IEOrbitClient, businessId?: string | null, query?: QueryParams) {
  const response = await client.services.list(scopedQuery(businessId, query));
  return response.data.map((row) => normalizeService(row as Record<string, unknown>));
}

export async function getService(client: IEOrbitClient, serviceId: string) {
  const response = await client.services.get(serviceId);
  return normalizeService(response.data as Record<string, unknown>);
}

export async function createService(client: IEOrbitClient, service: ServiceCreateInput) {
  const response = await client.services.create(service);
  return normalizeService(response.data as Record<string, unknown>);
}

export async function updateService(client: IEOrbitClient, serviceId: string, service: ServiceUpdateInput) {
  const response = await client.services.patch(serviceId, service);
  return normalizeService(response.data as Record<string, unknown>);
}

export async function searchServices(client: IEOrbitClient, businessId: string | null | undefined, term: string) {
  const services = await listServices(client, businessId);
  const lower = term.trim().toLowerCase();
  if (!lower) return services;
  return services.filter((service) => {
    return [service.name, service.description, service.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(lower));
  });
}

export async function listStaff(client: IEOrbitClient, businessId?: string | null, query?: QueryParams) {
  const response = await client.staff.list(scopedQuery(businessId, query));
  return response.data.map((row) => normalizeStaff(row as Record<string, unknown>));
}

export async function getStaff(client: IEOrbitClient, staffId: string) {
  const response = await client.staff.get(staffId);
  return normalizeStaff(response.data as Record<string, unknown>);
}

export async function createStaff(client: IEOrbitClient, staff: StaffCreateInput) {
  const response = await client.staff.create(staff);
  return normalizeStaff(response.data as Record<string, unknown>);
}

export async function updateStaff(client: IEOrbitClient, staffId: string, staff: StaffUpdateInput) {
  const response = await client.staff.patch(staffId, staff);
  return normalizeStaff(response.data as Record<string, unknown>);
}

export async function searchStaff(client: IEOrbitClient, businessId: string | null | undefined, term: string) {
  const staff = await listStaff(client, businessId);
  const lower = term.trim().toLowerCase();
  if (!lower) return staff;
  return staff.filter((member) => {
    return [member.full_name, member.email, member.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(lower));
  });
}

export type { Customer, Service, StaffMember };
