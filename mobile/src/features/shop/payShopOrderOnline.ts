import type {
  MerchantCashfreeCheckout,
  MerchantRazorpayCheckout,
  ShopOrder,
} from '@ie-orbit/sdk';
import { mobileClient } from '../../api/client';
import type { CashfreeCheckoutResult, RazorpayCheckoutResult } from './gatewayCheckout';

export async function startRazorpayCheckout(args: {
  orderId: string;
  tenantSlug: string;
  businessCode: string;
}): Promise<MerchantRazorpayCheckout> {
  const response = await mobileClient.mobile.createShopRazorpayCheckout(args.orderId, {
    tenant_slug: args.tenantSlug,
    business_code: args.businessCode,
  });
  return response.data;
}

export async function verifyRazorpayCheckout(args: {
  orderId: string;
  tenantSlug: string;
  businessCode: string;
  result: RazorpayCheckoutResult;
}): Promise<ShopOrder> {
  const response = await mobileClient.mobile.verifyShopRazorpayPayment(args.orderId, {
    tenant_slug: args.tenantSlug,
    business_code: args.businessCode,
    razorpay_payment_id: args.result.razorpay_payment_id,
    razorpay_order_id: args.result.razorpay_order_id,
    razorpay_signature: args.result.razorpay_signature,
  });
  return response.data;
}

export async function startCashfreeCheckout(args: {
  orderId: string;
  tenantSlug: string;
  businessCode: string;
}): Promise<MerchantCashfreeCheckout> {
  const response = await mobileClient.mobile.createShopCashfreeCheckout(args.orderId, {
    tenant_slug: args.tenantSlug,
    business_code: args.businessCode,
  });
  return response.data;
}

export async function verifyCashfreeCheckout(args: {
  orderId: string;
  tenantSlug: string;
  businessCode: string;
  result: CashfreeCheckoutResult;
}): Promise<ShopOrder> {
  const response = await mobileClient.mobile.verifyShopCashfreePayment(args.orderId, {
    tenant_slug: args.tenantSlug,
    business_code: args.businessCode,
    cashfree_order_id: args.result.cashfree_order_id,
    cashfree_payment_id: args.result.cashfree_payment_id,
  });
  return response.data;
}
