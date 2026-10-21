import React, { useMemo } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useBusinessBillingSnapshotQuery } from '../settings/billingHooks';
import { ShopVoucherList } from './ShopVoucherList';

export function ShopPurchaseListPage() {
  const workspace = useWorkspace();
  const billingQuery = useBusinessBillingSnapshotQuery(workspace.businessId ?? undefined);
  const canScan = useMemo(() => {
    const features = [
      ...((billingQuery.data?.entitled_features as string[] | undefined) ?? []),
      ...((billingQuery.data?.features as string[] | undefined) ?? []),
    ];
    return features.includes('shopie_invoice_scan');
  }, [billingQuery.data]);

  return (
    <ShopVoucherList
      voucherType="purchase"
      newPath="/shop/books/purchase/new"
      title="New purchase"
      emptyLabel="No purchases recorded yet. Add your first supplier bill."
      scanPath={canScan ? '/shop/books/purchase/scan' : undefined}
      scanLabel="Scan invoice"
    />
  );
}
