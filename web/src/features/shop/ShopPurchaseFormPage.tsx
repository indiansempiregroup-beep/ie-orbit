import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShopVoucherForm } from './ShopVoucherForm';

export function ShopPurchaseFormPage() {
  const { t } = useTranslation();
  return (
    <ShopVoucherForm
      voucherType="purchase"
      backTo="/shop/books/purchase"
      title={t('shop.voucherForm.purchaseTitle')}
      description={t('shop.voucherForm.purchaseDescription')}
    />
  );
}
