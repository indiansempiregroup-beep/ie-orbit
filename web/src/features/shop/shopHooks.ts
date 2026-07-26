import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ShopDeliveryZoneWriteInput,
  ShopOrderCreateInput,
  ShopPetWriteInput,
  ShopProductWriteInput,
  ShopReturnCreateInput,
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

  return { createPet };
}
