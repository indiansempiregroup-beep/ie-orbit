import type { ShopProduct } from '@ie-platform/sdk';
import type { DiscountType } from './posPricing';

export type PosSessionBasketLine = {
  product: ShopProduct;
  quantity: number;
  barcode_scanned?: string;
  discountType: DiscountType;
  discountValue: number;
};

export type PosPaymentMethod = 'cash' | 'upi' | 'card' | 'borrow';

export type PosSessionState = {
  customerId: string;
  basket: PosSessionBasketLine[];
  billDiscountType: DiscountType;
  billDiscountValue: string;
  /** Buyer/seller GSTIN for this bill (B2B). Empty = B2C / no GSTIN on invoice. */
  partyGstin: string;
  paymentMethod: PosPaymentMethod;
  pendingAddCode?: string;
  pendingAddProductId?: string;
};

function emptySession(): PosSessionState {
  return {
    customerId: '',
    basket: [],
    billDiscountType: '',
    billDiscountValue: '0',
    partyGstin: '',
    paymentMethod: 'cash',
  };
}

let session: PosSessionState = emptySession();

export function readPosSession(): PosSessionState {
  return session;
}

export function writePosSession(patch: Partial<PosSessionState>): PosSessionState {
  session = { ...session, ...patch };
  return session;
}

export function queuePosAddCode(code: string) {
  session = { ...session, pendingAddCode: code.trim() };
}

export function addProductToPosSession(product: ShopProduct, barcode?: string): PosSessionBasketLine[] {
  const existing = session.basket.find((line) => line.product.id === product.id);
  const basket = existing
    ? session.basket.map((line) =>
        line.product.id === product.id
          ? {
              ...line,
              quantity: line.quantity + 1,
              barcode_scanned: barcode || line.barcode_scanned,
            }
          : line,
      )
    : [
        ...session.basket,
        {
          product,
          quantity: 1,
          barcode_scanned: barcode,
          discountType: '' as DiscountType,
          discountValue: 0,
        },
      ];
  session = { ...session, basket };
  return basket;
}

export function takePosPendingAddCode(): string | undefined {
  const code = session.pendingAddCode;
  if (!code) return undefined;
  session = { ...session, pendingAddCode: undefined };
  return code;
}

export function takePosPendingAddProductId(): string | undefined {
  const productId = session.pendingAddProductId;
  if (!productId) return undefined;
  session = { ...session, pendingAddProductId: undefined };
  return productId;
}

export function queuePosAddProductId(productId: string) {
  session = { ...session, pendingAddProductId: productId };
}

/** After a successful charge: keep customer for next sale, clear the bill. */
export function clearPosBillKeepCustomer() {
  session = {
    ...session,
    basket: [],
    billDiscountType: '',
    billDiscountValue: '0',
    // Keep partyGstin with the customer for the next bill.
  };
}

export function resetPosSession() {
  session = emptySession();
}
