import React from 'react';
import { ShopVoucherList } from './ShopVoucherList';

export function ShopSaleListPage() {
  return (
    <ShopVoucherList
      voucherType="sale"
      source="pos"
      newPath="/shop/books/sale/new"
      title="New sale"
      emptyLabel="No POS sales recorded yet. Open the Sale counter to bill a customer."
    />
  );
}
