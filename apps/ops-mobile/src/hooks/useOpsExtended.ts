import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AvailabilitySlot,
  BIReportsBundle,
  BIForecastReport,
  BIGrowthReport,
  BIRevenueReport,
  BillingStatus,
  Booking,
  BookingCreateInput,
  Branch,
  BranchCreateInput,
  Customer,
  CustomerCreateInput,
  CustomerUpdateInput,
  IamRole,
  OperationsSearchResult,
  ProductPlan,
  Service,
  ServiceCreateInput,
  ServiceUpdateInput,
  StaffMember,
  StaffCreateInput,
  StaffUpdateInput,
  StaffWeeklySchedule,
  StaffWeeklyScheduleInput,
  TenantMember,
  TenantSettingsResponse,
} from '@ie-platform/sdk';
import { useOpsClient } from './useOpsClient';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { buildNameMap } from '../utils/entities';
import { useCustomers, useServices, useStaffMembers } from './useOpsData';

export function useEntityMaps() {
  const { customers, reload: reloadCustomers } = useCustomers();
  const { services, reload: reloadServices } = useServices();
  const { staff, reload: reloadStaff } = useStaffMembers();

  const customerMap = useMemo(() => buildNameMap(customers), [customers]);
  const serviceMap = useMemo(() => buildNameMap(services), [services]);
  const staffMap = useMemo(() => buildNameMap(staff), [staff]);

  const reloadAll = useCallback(async () => {
    await Promise.all([reloadCustomers(), reloadServices(), reloadStaff()]);
  }, [reloadCustomers, reloadServices, reloadStaff]);

  return { customers, services, staff, customerMap, serviceMap, staffMap, reloadAll };
}

export function useAvailability(
  date: string,
  staffId?: string,
  durationMinutes = 30,
  serviceId?: string,
) {
  const client = useOpsClient();
  const { businessId, ready } = useWorkspace();
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const requestSeq = useRef(0);

  const reload = useCallback(async () => {
    if (!client || !ready || !date) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setSlots([]);
    try {
      const response = await client.bookings.availability({
        business: businessId ?? undefined,
        date,
        staff_id: staffId,
        service_id: serviceId,
        duration_minutes: durationMinutes,
        interval_minutes: 30,
      });
      if (seq !== requestSeq.current) return;
      setSlots(response.data ?? []);
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
      }
    }
  }, [client, ready, date, staffId, durationMinutes, serviceId, businessId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { slots, loading, reload };
}

export function useGlobalSearch(term: string) {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [results, setResults] = useState<OperationsSearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!client || !ready || !term.trim()) {
      setResults(null);
      return;
    }
    const handle = setTimeout(() => {
      setLoading(true);
      void client.operations
        .search({ q: term.trim() })
        .then((response) => setResults(response.data))
        .catch(() => setResults(null))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [client, ready, term]);

  return { results, loading };
}

export function useBIOverview() {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [data, setData] = useState<BIReportsBundle | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      const response = await client.bi.overview({ start_date: start, end_date: end });
      setData(response.data);
    } finally {
      setLoading(false);
    }
  }, [client, ready]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, reload };
}

export function useBIRevenue() {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [data, setData] = useState<BIRevenueReport | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      const response = await client.bi.revenue({ start_date: start, end_date: end });
      setData(response.data);
    } finally {
      setLoading(false);
    }
  }, [client, ready]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, reload };
}

export function useBIForecast() {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [data, setData] = useState<BIForecastReport | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const response = await client.bi.forecast({ horizon_days: 30 });
      setData(response.data);
    } finally {
      setLoading(false);
    }
  }, [client, ready]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, reload };
}

export function useBIGrowth() {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [data, setData] = useState<BIGrowthReport | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      const response = await client.bi.growth({ start_date: start, end_date: end });
      setData(response.data);
    } finally {
      setLoading(false);
    }
  }, [client, ready]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, reload };
}

export function useBIReports() {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [data, setData] = useState<BIReportsBundle | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      const response = await client.bi.reports({ start_date: start, end_date: end });
      setData(response.data);
    } finally {
      setLoading(false);
    }
  }, [client, ready]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, reload };
}

export function useTenantSettings() {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [settings, setSettings] = useState<TenantSettingsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const response = await client.tenants.getSettings();
      setSettings(response.data);
    } finally {
      setLoading(false);
    }
  }, [client, ready]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { settings, loading, reload };
}

export function useBillingStatus() {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const response = await client.billing.status();
      setStatus(response.data);
    } finally {
      setLoading(false);
    }
  }, [client, ready]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { status, loading, reload };
}

export function useTeamMembers() {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const response = await client.iam.members();
      setMembers(response.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [client, ready]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { members, loading, reload };
}

export function useStaffSchedule(staffId: string) {
  const client = useOpsClient();
  const { businessId, ready } = useWorkspace();
  const [schedules, setSchedules] = useState<StaffWeeklySchedule[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready || !staffId) return;
    setLoading(true);
    try {
      const response = await client.bookings.staffWeeklySchedules.list({
        staff_id: staffId,
        business: businessId ?? undefined,
      });
      setSchedules(response.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [client, ready, staffId, businessId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { schedules, loading, reload };
}

export function useStaffScheduleMutations() {
  const client = useOpsClient();
  const { businessId } = useWorkspace();

  return {
    bulkUpsert: async (staffId: string, schedules: StaffWeeklyScheduleInput[]) => {
      if (!client) throw new Error('Not ready');
      return (
        await client.bookings.staffWeeklySchedules.bulkUpsert({
          staff_id: staffId,
          business: businessId ?? undefined,
          schedules,
        })
      ).data;
    },
  };
}

export function useIamRoles() {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [roles, setRoles] = useState<IamRole[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const response = await client.iam.roles();
      setRoles(response.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [client, ready]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { roles, loading, reload };
}

export function useIamMutations() {
  const client = useOpsClient();

  return {
    assignRole: async (userId: string, roleCode: string) => {
      if (!client) throw new Error('Not ready');
      return client.iam.assignRole(userId, { role_code: roleCode });
    },
    removeRole: async (userId: string, roleCode: string) => {
      if (!client) throw new Error('Not ready');
      return client.iam.removeRole(userId, roleCode);
    },
  };
}

export function useBranches() {
  const client = useOpsClient();
  const { businessId, ready } = useWorkspace();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready || !businessId) return;
    setLoading(true);
    try {
      const response = await client.businesses.branches.list(businessId);
      setBranches(response.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [client, ready, businessId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { branches, loading, reload };
}

export function useBranchMutations() {
  const client = useOpsClient();
  const { businessId } = useWorkspace();

  return {
    create: async (body: BranchCreateInput) => {
      if (!client || !businessId) throw new Error('Not ready');
      return (await client.businesses.branches.create(businessId, body)).data;
    },
    setPrimary: async (branchId: string) => {
      if (!client || !businessId) throw new Error('Not ready');
      return (await client.businesses.branches.patch(businessId, branchId, { is_primary: true })).data;
    },
  };
}

export function useProductPlans(productCode?: string) {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [plans, setPlans] = useState<ProductPlan[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const response = await client.businesses.listProductPlans(productCode ? { product_code: productCode } : undefined);
      setPlans(response.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [client, ready, productCode]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { plans, loading, reload };
}

export function useProductMutations() {
  const client = useOpsClient();
  const { businessId } = useWorkspace();

  return {
    setActiveProduct: async (productId: string) => {
      if (!client || !businessId) throw new Error('Not ready');
      return (await client.businesses.patch(businessId, { selected_product: productId })).data;
    },
    subscribe: async (productCode: string, planCode?: string, setActive = false) => {
      if (!client || !businessId) throw new Error('Not ready');
      return (
        await client.businesses.subscribeProduct(businessId, {
          product_code: productCode,
          plan_code: planCode,
          set_active: setActive,
        })
      ).data;
    },
    unsubscribe: async (productCode: string) => {
      if (!client || !businessId) throw new Error('Not ready');
      return (await client.businesses.unsubscribeProduct(businessId, productCode)).data;
    },
    changePlan: async (productCode: string, planCode: string) => {
      if (!client || !businessId) throw new Error('Not ready');
      return (await client.businesses.changeProductPlan(businessId, productCode, { plan_code: planCode })).data;
    },
  };
}

export function useBookingMutations() {
  const client = useOpsClient();

  return {
    create: async (body: BookingCreateInput) => {
      if (!client) throw new Error('Not ready');
      return (await client.bookings.create(body)).data;
    },
    confirm: async (id: string, reason?: string) => {
      if (!client) throw new Error('Not ready');
      return (await client.bookings.confirm(id, { reason })).data;
    },
    checkIn: async (id: string, reason?: string) => {
      if (!client) throw new Error('Not ready');
      return (await client.bookings.checkIn(id, { reason })).data;
    },
    complete: async (id: string, reason?: string) => {
      if (!client) throw new Error('Not ready');
      return (await client.bookings.complete(id, { reason })).data;
    },
    cancel: async (id: string, reason?: string) => {
      if (!client) throw new Error('Not ready');
      return (await client.bookings.cancel(id, { reason })).data;
    },
    reschedule: async (id: string, start_at: string, reason?: string) => {
      if (!client) throw new Error('Not ready');
      return (await client.bookings.reschedule(id, { start_at, reason })).data;
    },
  };
}

export function useCustomerMutations() {
  const client = useOpsClient();
  return {
    create: async (body: CustomerCreateInput) => {
      if (!client) throw new Error('Not ready');
      return (await client.customers.create(body)).data;
    },
    update: async (id: string, body: CustomerUpdateInput) => {
      if (!client) throw new Error('Not ready');
      return (await client.customers.patch(id, body)).data;
    },
    archive: async (id: string) => {
      if (!client) throw new Error('Not ready');
      return client.customers.delete(id);
    },
    restore: async (id: string) => {
      if (!client) throw new Error('Not ready');
      return (await client.customers.restore(id)).data;
    },
  };
}

export function useServiceMutations() {
  const client = useOpsClient();
  return {
    create: async (body: ServiceCreateInput) => {
      if (!client) throw new Error('Not ready');
      return (await client.services.create(body)).data;
    },
    update: async (id: string, body: ServiceUpdateInput) => {
      if (!client) throw new Error('Not ready');
      return (await client.services.patch(id, body)).data;
    },
  };
}

export function useStaffMutations() {
  const client = useOpsClient();
  return {
    create: async (body: StaffCreateInput) => {
      if (!client) throw new Error('Not ready');
      return (await client.staff.create(body)).data;
    },
    update: async (id: string, body: StaffUpdateInput) => {
      if (!client) throw new Error('Not ready');
      return (await client.staff.patch(id, body)).data;
    },
    deactivate: async (id: string) => {
      if (!client) throw new Error('Not ready');
      return (await client.staff.patch(id, { employment_status: 'inactive' })).data;
    },
    reactivate: async (id: string) => {
      if (!client) throw new Error('Not ready');
      return (await client.staff.patch(id, { employment_status: 'active' })).data;
    },
    remove: async (id: string) => {
      if (!client) throw new Error('Not ready');
      return client.staff.delete(id);
    },
  };
}

export function useService(serviceId: string) {
  const client = useOpsClient();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!client || !serviceId) return;
    setLoading(true);
    try {
      const response = await client.services.get(serviceId);
      setService(response.data);
    } finally {
      setLoading(false);
    }
  }, [client, serviceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { service, loading, reload };
}

export function useStaffMember(staffId: string) {
  const client = useOpsClient();
  const [member, setMember] = useState<StaffMember | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!client || !staffId) return;
    setLoading(true);
    try {
      const response = await client.staff.get(staffId);
      setMember(response.data);
    } finally {
      setLoading(false);
    }
  }, [client, staffId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { member, loading, reload };
}

export type { Booking, Customer, Service, StaffMember };
