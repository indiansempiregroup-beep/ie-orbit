import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShopVoucherForm } from './ShopVoucherForm';

export function ShopSaleFormPage() {
  const { t } = useTranslation();
  return (
    <ShopVoucherForm
      voucherType="sale"
      backTo="/shop/books/sale"
      title={t('shop.voucherForm.saleTitle')}
      description={t('shop.voucherForm.saleDescription')}
    />
  );
}
