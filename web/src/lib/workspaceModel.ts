import type { Business } from '@ie-platform/sdk';
import { getProductName } from '../config/products';

/**
 * Workspace = Current Product + Current Business.
 * Tenant is an internal platform construct and must not be exposed in user-facing UI.
 */
export type WorkspaceSnapshot = {
  productCode: string | null;
  productName: string;
  businessId: string | null;
  businessName: string;
  businessStatus: string | null;
  currency: string | null;
  timezone: string | null;
  /** Internal only — never display in UI */
  tenantId: string | null;
};

export function buildWorkspaceSnapshot(args: {
  tenantId: string | null;
  business: Business | null;
  activeProduct: string | null;
}): WorkspaceSnapshot {
  const businessName =
    args.business?.display_name ?? args.business?.business_name ?? 'Your business';

  const productCode = args.activeProduct ?? args.business?.selected_product ?? 'appointie';

  return {
    tenantId: args.tenantId,
    productCode,
    productName: getProductName(productCode),
    businessId: args.business?.id ?? null,
    businessName,
    businessStatus: args.business?.status ?? null,
    currency: args.business?.currency ?? null,
    timezone: args.business?.timezone ?? null,
  };
}

/** User-facing workspace label, e.g. "AppointIE · Empire Salon" */
export function formatWorkspaceLabel(snapshot: WorkspaceSnapshot): string {
  return `${snapshot.productName} · ${snapshot.businessName}`;
}
