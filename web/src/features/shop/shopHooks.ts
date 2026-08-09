import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '@ie-platform/sdk';
import type {
  ShopBooksReportSlug,
  ShopBooksVoucherCreateInput,
  ShopBooksVoucherType,
  ShopCashAccountWriteInput,
  ShopComplianceSettingsUpdateInput,
  ShopDeliveryZoneWriteInput,
  ShopEWayGenerateInput,
  ShopOrderCreateInput,
  ShopPetWriteInput,
  ShopProductWriteInput,
  ShopReturnCreateInput,
  ShopSupplierWriteInput,
} from '@ie-platform/sdk';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';

export function useShopProducts(search = '', status = '', category = '') {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  return useQuery({
    queryKey: ['shop-products', businessId, search, status, category],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.shop.listProducts({
        business_id: businessId,
        search: search || undefined,
        status: status || undefined,
        category: category || undefined,
      });
      return response.data;
    },
  });
}

export function useShopOrders(status = '') {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  return useQuery({
    queryKey: ['shop-orders', businessId, status],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.shop.listOrders({
        business_id: businessId,
        status: status || undefined,
      });
      return response.data;
    },
  });
}

export function useShopInvoices() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  return useQuery({
    queryKey: ['shop-invoices', businessId],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.shop.listInvoices({ business_id: businessId });
      return response.data;
    },
  });
}

export function useShopQuotations() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  return useQuery({
    queryKey: ['shop-quotations', businessId],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.shop.listQuotations({ business_id: businessId });
      return response.data;
    },
  });
}

export function useShopReturns(orderId?: string) {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  return useQuery({
    queryKey: ['shop-returns', businessId, orderId ?? ''],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.shop.listReturns({
        business_id: businessId,
        order_id: orderId,
      });
      return response.data;
    },
  });
}

export function useShopDeliveryZones() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  return useQuery({
    queryKey: ['shop-delivery-zones', businessId],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.shop.listDeliveryZones({ business_id: businessId });
      return response.data;
    },
  });
}

export function useShopSettings() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  return useQuery({
    queryKey: ['shop-settings', businessId],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.shop.getSettings({ business_id: businessId });
      return response.data;
    },
  });
}

export function useShopPets(customerId?: string) {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  const settings = useShopSettings();
  return useQuery({
    queryKey: ['shop-pets', businessId, customerId ?? ''],
    enabled: Boolean(businessId) && Boolean(settings.data?.pets_enabled),
    queryFn: async () => {
      const response = await client.shop.listPets({
        business_id: businessId,
        customer_id: customerId,
      });
      return response.data;
    },
  });
}

export function useShopProductMutations() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.businessId ?? '';

  const create = useMutation({
    mutationFn: async (body: Omit<ShopProductWriteInput, 'business_id'>) => {
      const response = await client.shop.createProduct({ ...body, business_id: businessId });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-products'] }),
  });

  const update = useMutation({
    mutationFn: async ({
      productId,
      body,
    }: {
      productId: string;
      body: Partial<ShopProductWriteInput>;
    }) => {
      const response = await client.shop.patchProduct(productId, body);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-products'] }),
  });

  const lookup = useMutation({
    mutationFn: async (code: string) => {
      const response = await client.shop.lookupBarcode({ business_id: businessId, code });
      return response.data;
    },
  });

  const lookupBulk = useMutation({
    mutationFn: async (codes: string[]) => {
      const response = await client.shop.lookupBarcodesBulk({ business_id: businessId, codes });
      return response.data;
    },
  });

  const enrich = useMutation({
    mutationFn: async (payload: { code?: string; query?: string; image_url?: string; hint?: string } | string) => {
      const body = typeof payload === 'string' ? { code: payload } : payload;
      const response = await client.shop.enrichBarcode(body);
      return response.data;
    },
  });

  const analyzePackaging = useMutation({
    mutationFn: async (body: {
      front_image_url?: string;
      back_image_url?: string;
      hint?: string;
      async_mode?: boolean;
    }) => {
      const response = await client.shop.analyzePackaging({
        business_id: businessId,
        ...body,
      });
      return response.data;
    },
  });

  const getPackagingAnalysis = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await client.shop.getPackagingAnalysis(jobId);
      return response.data;
    },
  });

  const createOrder = useMutation({
    mutationFn: async (body: Omit<ShopOrderCreateInput, 'business_id'>) => {
      const response = await client.shop.createOrder({ ...body, business_id: businessId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-orders'] });
      queryClient.invalidateQueries({ queryKey: ['shop-products'] });
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const response = await client.shop.setOrderStatus(orderId, { status });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-orders'] }),
  });

  const settlePayment = useMutation({
    mutationFn: async ({
      orderId,
      settled_via = 'cash',
    }: {
      orderId: string;
      settled_via?: 'cash' | 'upi' | 'card' | string;
    }) => {
      const response = await client.shop.settleOrderPayment(orderId, { settled_via });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-orders'] }),
  });

  return {
    create,
    update,
    lookup,
    lookupBulk,
    enrich,
    analyzePackaging,
    getPackagingAnalysis,
    createOrder,
    setStatus,
    settlePayment,
    businessId,
  };
}

export function useShopReturnMutations() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.businessId ?? '';

  const createReturn = useMutation({
    mutationFn: async (body: Omit<ShopReturnCreateInput, 'business_id'>) => {
      const response = await client.shop.createReturn({ ...body, business_id: businessId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-returns'] });
      queryClient.invalidateQueries({ queryKey: ['shop-orders'] });
      queryClient.invalidateQueries({ queryKey: ['shop-products'] });
    },
  });

  return { createReturn };
}

export function useShopDeliveryZoneMutations() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.businessId ?? '';

  const createZone = useMutation({
    mutationFn: async (body: Omit<ShopDeliveryZoneWriteInput, 'business_id'>) => {
      const response = await client.shop.createDeliveryZone({ ...body, business_id: businessId });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-delivery-zones'] }),
  });

  const patchZone = useMutation({
    mutationFn: async ({
      zoneId,
      body,
    }: {
      zoneId: string;
      body: Partial<ShopDeliveryZoneWriteInput>;
    }) => {
      const response = await client.shop.patchDeliveryZone(zoneId, {
        ...body,
        business_id: businessId,
      });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-delivery-zones'] }),
  });

  return { createZone, patchZone };
}

export function useShopSettingsMutations() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.businessId ?? '';

  const patchSettings = useMutation({
    mutationFn: async (body: {
      enable_pets?: boolean;
      enabled_packs?: string[];
      default_fulfillment_mode?: string;
      same_day_delivery_enabled?: boolean;
    }) => {
      const response = await client.shop.patchSettings({ ...body, business_id: businessId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-settings'] });
      queryClient.invalidateQueries({ queryKey: ['shop-pets'] });
    },
  });

  return { patchSettings };
}

export function useShopPetMutations() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.businessId ?? '';

  const createPet = useMutation({
    mutationFn: async (body: Omit<ShopPetWriteInput, 'business_id'>) => {
      const response = await client.shop.createPet({ ...body, business_id: businessId });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-pets'] }),
  });

  const notifyPetOwner = useMutation({
    mutationFn: async (args: {
      petId: string;
      subject: string;
      body: string;
      channels?: Array<'in_app' | 'email'>;
    }) => {
      const response = await client.shop.notifyPetOwner(args.petId, {
        subject: args.subject,
        body: args.body,
        channels: args.channels ?? ['in_app', 'email'],
      });
      return response.data;
    },
  });

  return { createPet, notifyPetOwner };
}

/** Customers usable as "sale" / party pickers across Books forms. */
export function useShopCustomers(search = '') {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  return useQuery({
    queryKey: ['customers', businessId, search],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.customers.list({
        business: businessId,
        search: search || undefined,
      });
      return response.data;
    },
  });
}

export function useShopBooksDashboard() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  return useQuery({
    queryKey: ['shop-books-dashboard', businessId],
    enabled: Boolean(businessId),
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await client.shop.booksDashboard({ business_id: businessId });
      return response.data;
    },
  });
}

export function useShopCashAccounts() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  return useQuery({
    queryKey: ['shop-books-accounts', businessId],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.shop.listCashAccounts({ business_id: businessId });
      return response.data;
    },
  });
}

export function useShopCashAccountMutations() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.businessId ?? '';

  const createAccount = useMutation({
    mutationFn: async (body: Omit<ShopCashAccountWriteInput, 'business_id'>) => {
      const response = await client.shop.createCashAccount({ ...body, business_id: businessId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-books-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['shop-books-dashboard'] });
    },
  });

  return { createAccount, businessId };
}

export type ShopVoucherFilters = {
  type?: ShopBooksVoucherType | string;
  status?: string;
  date_from?: string;
  date_to?: string;
  customer_id?: string;
  supplier_id?: string;
};

export function useShopVouchers(filters: ShopVoucherFilters = {}) {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  return useQuery({
    queryKey: ['shop-books-vouchers', businessId, filters],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.shop.listVouchers({ business_id: businessId, ...filters });
      return response.data;
    },
  });
}

export function useShopVoucherMutations() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.businessId ?? '';

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['shop-books-vouchers'] });
    queryClient.invalidateQueries({ queryKey: ['shop-books-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['shop-books-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['shop-books-party-statement'] });
    queryClient.invalidateQueries({ queryKey: ['shop-products'] });
  };

  const createVoucher = useMutation({
    mutationFn: async (body: Omit<ShopBooksVoucherCreateInput, 'business_id'>) => {
      const response = await client.shop.createVoucher({ ...body, business_id: businessId });
      return response.data;
    },
    onSuccess: invalidateAll,
  });

  const voidVoucher = useMutation({
    mutationFn: async (voucherId: string) => {
      const response = await client.shop.voidVoucher(voucherId);
      return response.data;
    },
    onSuccess: invalidateAll,
  });

  return { createVoucher, voidVoucher, businessId };
}

export function useShopSuppliers(search = '') {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  return useQuery({
    queryKey: ['shop-suppliers', businessId, search],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.shop.listSuppliers({
        business_id: businessId,
        search: search || undefined,
      });
      return response.data;
    },
  });
}

export function useShopSupplierMutations() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.businessId ?? '';

  const create = useMutation({
    mutationFn: async (body: Omit<ShopSupplierWriteInput, 'business_id'>) => {
      const response = await client.shop.createSupplier({ ...body, business_id: businessId });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-suppliers'] }),
  });

  const update = useMutation({
    mutationFn: async ({
      supplierId,
      body,
    }: {
      supplierId: string;
      body: Partial<ShopSupplierWriteInput>;
    }) => {
      const response = await client.shop.updateSupplier(supplierId, body);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-suppliers'] }),
  });

  const remove = useMutation({
    mutationFn: async (supplierId: string) => {
      const response = await client.shop.deleteSupplier(supplierId);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-suppliers'] }),
  });

  return { create, update, remove, businessId };
}

export function usePartyStatement(kind: 'customer' | 'supplier', id: string) {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  return useQuery({
    queryKey: ['shop-books-party-statement', businessId, kind, id],
    enabled: Boolean(businessId) && Boolean(id),
    queryFn: async () => {
      const response = await client.shop.partyStatement({ business_id: businessId, kind, id });
      return response.data;
    },
  });
}

export function useShopBooksReport(
  slug: ShopBooksReportSlug | string,
  range: { date_from?: string; date_to?: string } = {},
) {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  return useQuery({
    queryKey: ['shop-books-report', businessId, slug, range],
    enabled: Boolean(businessId) && Boolean(slug),
    queryFn: async () => {
      const response = await client.shop.booksReport(slug, { business_id: businessId, ...range });
      return response.data;
    },
  });
}

export function useShopComplianceSettings() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  return useQuery({
    queryKey: ['shop-compliance-settings', businessId],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.shop.getComplianceSettings({ business_id: businessId });
      return response.data;
    },
  });
}

export function useShopComplianceSettingsMutations() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.businessId ?? '';

  const update = useMutation({
    mutationFn: async (body: Omit<ShopComplianceSettingsUpdateInput, 'business_id'>) => {
      const response = await client.shop.updateComplianceSettings({ ...body, business_id: businessId });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-compliance-settings'] }),
  });

  return { update, businessId };
}

export function useShopEInvoice(voucherId?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['shop-einvoice', voucherId ?? ''],
    enabled: Boolean(voucherId),
    retry: false,
    queryFn: async () => {
      try {
        const response = await client.shop.getEInvoice(voucherId as string);
        return response.data;
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) return null;
        throw error;
      }
    },
  });
}

export function useShopEWayList(voucherId?: string) {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  return useQuery({
    queryKey: ['shop-eway', businessId, voucherId ?? ''],
    enabled: Boolean(businessId) && Boolean(voucherId),
    queryFn: async () => {
      const response = await client.shop.listEWay({ business_id: businessId, voucher_id: voucherId });
      return response.data;
    },
  });
}

export function useShopComplianceMutations() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  const invalidateVoucherCompliance = (voucherId: string) => {
    queryClient.invalidateQueries({ queryKey: ['shop-einvoice', voucherId] });
    queryClient.invalidateQueries({ queryKey: ['shop-eway'] });
  };

  const generateEInvoice = useMutation({
    mutationFn: async ({ voucherId, allow_b2c }: { voucherId: string; allow_b2c?: boolean }) => {
      const response = await client.shop.generateEInvoice(voucherId, { allow_b2c });
      return response.data;
    },
    onSuccess: (_data, variables) => invalidateVoucherCompliance(variables.voucherId),
  });

  const cancelEInvoice = useMutation({
    mutationFn: async ({ voucherId, reason }: { voucherId: string; reason: string }) => {
      const response = await client.shop.cancelEInvoice(voucherId, { reason });
      return response.data;
    },
    onSuccess: (_data, variables) => invalidateVoucherCompliance(variables.voucherId),
  });

  const generateEWay = useMutation({
    mutationFn: async ({ voucherId, body }: { voucherId: string; body: ShopEWayGenerateInput }) => {
      const response = await client.shop.generateEWay(voucherId, body);
      return response.data;
    },
    onSuccess: (_data, variables) => invalidateVoucherCompliance(variables.voucherId),
  });

  const cancelEWay = useMutation({
    mutationFn: async ({ ewayId, reason }: { ewayId: string; reason: string }) => {
      const response = await client.shop.cancelEWay(ewayId, { reason });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-eway'] }),
  });

  return { generateEInvoice, cancelEInvoice, generateEWay, cancelEWay };
}
