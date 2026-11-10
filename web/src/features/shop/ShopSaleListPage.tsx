import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShopVoucherList } from './ShopVoucherList';

export function ShopSaleListPage() {
  const { t } = useTranslation();
  return (
    <ShopVoucherList
      voucherType="sale"
      source="pos"
      newPath="/shop/books/sale/new"
      title={t('shop.vouchers.newSale')}
      emptyLabel={t('shop.vouchers.emptySale')}
    />
  );
}
