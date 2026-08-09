import React from 'react';
import { ShopVoucherForm } from './ShopVoucherForm';

export function ShopPurchaseFormPage() {
  return (
    <ShopVoucherForm
      voucherType="purchase"
      backTo="/shop/books/purchase"
      title="New purchase"
      description="Record a supplier bill. Add lines, pick a supplier if on credit, and record payment made."
    />
  );
}
