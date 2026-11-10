import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useBusinessBillingSnapshotQuery } from '../settings/billingHooks';
import { ShopVoucherList } from './ShopVoucherList';

export function ShopPurchaseListPage() {
  const { t } = useTranslation();
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
      title={t('shop.vouchers.newPurchase')}
      emptyLabel={t('shop.vouchers.emptyPurchase')}
      scanPath={canScan ? '/shop/books/purchase/scan' : undefined}
      scanLabel={t('shop.vouchers.scanInvoice')}
    />
  );
}
