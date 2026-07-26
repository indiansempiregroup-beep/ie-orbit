import { createAuthenticatedClient } from '../../lib/apiClient';
import type {
  Business,
  BusinessCreateInput,
  BusinessUpdateInput,
  ProductPlan,
} from '@ie-platform/sdk';

export async function getBusinessProfile(
  token: string | null,
  tenantId?: string | null,
  businessId?: string | null,
) {
  const client = createAuthenticatedClient(token, tenantId, businessId);
  if (businessId) {
    const response = await client.businesses.get(businessId);
    return response.data;
  }
  const response = await client.businesses.me();
  return response.data;
}

export async function listBusinessProfiles(token: string | null, tenantId?: string | null) {
  const response = await createAuthenticatedClient(token, tenantId).businesses.list();
  return response.data;
}

export async function createBusinessProfile(
  token: string | null,
  tenantId: string | null | undefined,
  business: BusinessCreateInput,
) {
  const response = await createAuthenticatedClient(token, tenantId).businesses.create(business);
  return response.data;
}

export async function updateBusinessProfile(
  token: string | null,
  tenantId: string | null | undefined,
  businessId: string,
  business: BusinessUpdateInput,
) {
  const response = await createAuthenticatedClient(token, tenantId).businesses.patch(businessId, business);
  return response.data;
}

export async function updateActiveBusinessProfile(
  token: string | null,
  tenantId: string | null | undefined,
  business: BusinessUpdateInput,
) {
  const response = await createAuthenticatedClient(token, tenantId).businesses.patchMe(business);
  return response.data;
}

export async function subscribeBusinessProduct(
  token: string | null,
  tenantId: string | null | undefined,
  businessId: string,
  productCode: string,
  options?: { setActive?: boolean; planCode?: string },
) {
  const response = await createAuthenticatedClient(token, tenantId).businesses.subscribeProduct(businessId, {
    product_code: productCode,
    set_active: options?.setActive ?? true,
    plan_code: options?.planCode,
  });
  return response.data;
}

export async function unsubscribeBusinessProduct(
  token: string | null,
  tenantId: string | null | undefined,
  businessId: string,
  productCode: string,
) {
  const response = await createAuthenticatedClient(token, tenantId).businesses.unsubscribeProduct(
    businessId,
    productCode,
  );
  return response.data;
}

export async function changeBusinessProductPlan(
  token: string | null,
  tenantId: string | null | undefined,
  businessId: string,
  productCode: string,
  planCode: string,
) {
  const response = await createAuthenticatedClient(token, tenantId).businesses.changeProductPlan(
    businessId,
    productCode,
    { plan_code: planCode },
  );
  return response.data;
}

export async function cancelPendingBusinessProductPlan(
  token: string | null,
  tenantId: string | null | undefined,
  businessId: string,
  productCode: string,
) {
  const response = await createAuthenticatedClient(token, tenantId).businesses.cancelPendingPlanChange(
    businessId,
    productCode,
  );
  return response.data;
}

export async function listProductPlans(
  token: string | null,
  tenantId: string | null | undefined,
  productCode?: string,
) {
  const response = await createAuthenticatedClient(token, tenantId).businesses.listProductPlans(
    productCode ? { product_code: productCode } : undefined,
  );
  return response.data;
}
