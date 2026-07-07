import type { IEPlatformClient } from '@ie-platform/sdk';
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
} from '@ie-platform/sdk';
import { businessQueryParam } from '../../lib/workspace';

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

export async function listCustomers(client: IEPlatformClient, businessId?: string | null, query?: QueryParams) {
  const response = await client.customers.list(scopedQuery(businessId, query));
  return response.data;
}

export async function getCustomer(client: IEPlatformClient, customerId: string) {
  const response = await client.customers.get(customerId);
  return response.data;
}

export async function createCustomer(client: IEPlatformClient, customer: CustomerCreateInput) {
  const response = await client.customers.create(customer);
  return response.data;
}

export async function updateCustomer(client: IEPlatformClient, customerId: string, customer: CustomerUpdateInput) {
  const response = await client.customers.patch(customerId, customer);
  return response.data;
}

export async function searchCustomers(client: IEPlatformClient, businessId: string | null | undefined, term: string) {
  const customers = await listCustomers(client, businessId);
  const lower = term.trim().toLowerCase();
  if (!lower) return customers;
  return customers.filter((customer) => {
    return [customer.full_name, customer.email, customer.phone_number, customer.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(lower));
  });
}

export async function listServices(client: IEPlatformClient, businessId?: string | null, query?: QueryParams) {
  const response = await client.services.list(scopedQuery(businessId, query));
  return response.data;
}

export async function getService(client: IEPlatformClient, serviceId: string) {
  const response = await client.services.get(serviceId);
  return response.data;
}

export async function createService(client: IEPlatformClient, service: ServiceCreateInput) {
  const response = await client.services.create(service);
  return response.data;
}

export async function updateService(client: IEPlatformClient, serviceId: string, service: ServiceUpdateInput) {
  const response = await client.services.patch(serviceId, service);
  return response.data;
}

export async function searchServices(client: IEPlatformClient, businessId: string | null | undefined, term: string) {
  const services = await listServices(client, businessId);
  const lower = term.trim().toLowerCase();
  if (!lower) return services;
  return services.filter((service) => {
    return [service.name, service.description, service.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(lower));
  });
}

export async function listStaff(client: IEPlatformClient, businessId?: string | null, query?: QueryParams) {
  const response = await client.staff.list(scopedQuery(businessId, query));
  return response.data;
}

export async function getStaff(client: IEPlatformClient, staffId: string) {
  const response = await client.staff.get(staffId);
  return response.data;
}

export async function createStaff(client: IEPlatformClient, staff: StaffCreateInput) {
  const response = await client.staff.create(staff);
  return response.data;
}

export async function updateStaff(client: IEPlatformClient, staffId: string, staff: StaffUpdateInput) {
  const response = await client.staff.patch(staffId, staff);
  return response.data;
}

export async function searchStaff(client: IEPlatformClient, businessId: string | null | undefined, term: string) {
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
