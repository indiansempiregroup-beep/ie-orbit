import React from 'react';
import { ShopVoucherList } from './ShopVoucherList';

export function ShopSaleListPage() {
  return (
    <ShopVoucherList
      voucherType="sale"
      newPath="/shop/books/sale/new"
      title="New sale"
      emptyLabel="No sales recorded yet. Create your first GST sale voucher."
    />
  );
}
