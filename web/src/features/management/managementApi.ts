import {
  createApiClient,
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

type QueryParams = Record<string, string | number | boolean | undefined | null>;

function buildClient(token?: string | null) {
  const client = createApiClient({ baseUrl: '/api' });
  if (token) client.setToken(token);
  return client;
}

function normalizeQuery(query?: QueryParams): QueryParams | undefined {
  if (!query) return undefined;
  return Object.entries(query).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) return acc;
    acc[key] = typeof value === 'boolean' ? (value ? 'true' : 'false') : value;
    return acc;
  }, {} as QueryParams);
}

export async function listCustomers(token: string | null, query?: QueryParams) {
  const response = await buildClient(token).customers.list(normalizeQuery(query));
  return response.data;
}

export async function getCustomer(token: string | null, customerId: string) {
  const response = await buildClient(token).customers.get(customerId);
  return response.data;
}

export async function createCustomer(token: string | null, customer: CustomerCreateInput) {
  const response = await buildClient(token).customers.create(customer);
  return response.data;
}

export async function updateCustomer(token: string | null, customerId: string, customer: CustomerUpdateInput) {
  const response = await buildClient(token).customers.patch(customerId, customer);
  return response.data;
}

export async function searchCustomers(token: string | null, term: string) {
  const customers = await listCustomers(token);
  const lower = term.trim().toLowerCase();
  if (!lower) return customers;
  return customers.filter((customer) => {
    return [customer.full_name, customer.email, customer.phone_number, customer.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(lower));
  });
}

export async function listServices(token: string | null, query?: QueryParams) {
  const response = await buildClient(token).services.list(normalizeQuery(query));
  return response.data;
}

export async function getService(token: string | null, serviceId: string) {
  const response = await buildClient(token).services.get(serviceId);
  return response.data;
}

export async function createService(token: string | null, service: ServiceCreateInput) {
  const response = await buildClient(token).services.create(service);
  return response.data;
}

export async function updateService(token: string | null, serviceId: string, service: ServiceUpdateInput) {
  const response = await buildClient(token).services.patch(serviceId, service);
  return response.data;
}

export async function searchServices(token: string | null, term: string) {
  const services = await listServices(token);
  const lower = term.trim().toLowerCase();
  if (!lower) return services;
  return services.filter((service) => {
    return [service.name, service.description, service.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(lower));
  });
}

export async function listStaff(token: string | null, query?: QueryParams) {
  const response = await buildClient(token).staff.list(normalizeQuery(query));
  return response.data;
}

export async function getStaff(token: string | null, staffId: string) {
  const response = await buildClient(token).staff.get(staffId);
  return response.data;
}

export async function createStaff(token: string | null, staff: StaffCreateInput) {
  const response = await buildClient(token).staff.create(staff);
  return response.data;
}

export async function updateStaff(token: string | null, staffId: string, staff: StaffUpdateInput) {
  const response = await buildClient(token).staff.patch(staffId, staff);
  return response.data;
}

export async function searchStaff(token: string | null, term: string) {
  const staff = await listStaff(token);
  const lower = term.trim().toLowerCase();
  if (!lower) return staff;
  return staff.filter((member) => {
    return [member.full_name, member.email, member.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(lower));
  });
}

export type { Customer, Service, StaffMember };
