import React from 'react';
import { ShopVoucherList } from './ShopVoucherList';

export function ShopPurchaseListPage() {
  return (
    <ShopVoucherList
      voucherType="purchase"
      newPath="/shop/books/purchase/new"
      title="New purchase"
      emptyLabel="No purchases recorded yet. Add your first supplier bill."
    />
  );
}
