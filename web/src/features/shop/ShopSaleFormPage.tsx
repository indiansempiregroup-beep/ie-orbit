import React from 'react';
import { ShopVoucherForm } from './ShopVoucherForm';

export function ShopSaleFormPage() {
  return (
    <ShopVoucherForm
      voucherType="sale"
      backTo="/shop/books/sale"
      title="New sale"
      description="GST invoice / cash memo for a customer sale. Add lines, pick a customer if on credit, and record payment."
    />
  );
}
