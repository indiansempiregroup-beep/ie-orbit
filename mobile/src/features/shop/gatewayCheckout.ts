import type { MerchantCashfreeCheckout, MerchantRazorpayCheckout } from '@ie-orbit/sdk';

export type RazorpayCheckoutResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export type CashfreeCheckoutResult = {
  cashfree_order_id: string;
  cashfree_payment_id?: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
    Cashfree?: (options: { mode: string }) => {
      checkout: (options: Record<string, unknown>) => Promise<{
        paymentDetails?: { paymentId?: string };
      } | null>;
    };
  }
}

function loadScript(src: string): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export async function openRazorpayCheckoutWeb(
  checkoutData: MerchantRazorpayCheckout,
): Promise<RazorpayCheckoutResult> {
  const loaded = await loadScript('https://checkout.razorpay.com/v1/checkout.js');
  if (!loaded || !window.Razorpay) {
    throw new Error('Unable to load secure Razorpay Checkout.');
  }
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: checkoutData.key_id,
      order_id: checkoutData.razorpay_order_id,
      amount: checkoutData.amount,
      currency: checkoutData.currency,
      name: checkoutData.business_name,
      description: `Order ${checkoutData.order_number}`,
      handler: (result: RazorpayCheckoutResult) => resolve(result),
      modal: {
        ondismiss: () => reject(new Error('Payment window closed. Your order is saved — you can pay from order details.')),
      },
    });
    checkout.open();
  });
}

export async function openCashfreeCheckoutWeb(
  checkoutData: MerchantCashfreeCheckout,
): Promise<CashfreeCheckoutResult> {
  const loaded = await loadScript('https://sdk.cashfree.com/js/v3/cashfree.js');
  if (!loaded || !window.Cashfree) {
    throw new Error('Unable to load Cashfree Checkout.');
  }
  const cashfree = window.Cashfree({
    mode: checkoutData.env === 'production' ? 'production' : 'sandbox',
  });
  const result = await cashfree.checkout({
    paymentSessionId: checkoutData.payment_session_id,
    redirectTarget: '_modal',
  });
  return {
    cashfree_order_id: checkoutData.cashfree_order_id,
    cashfree_payment_id: result?.paymentDetails?.paymentId,
  };
}

export function razorpayCheckoutHtml(checkoutData: MerchantRazorpayCheckout): string {
  const payload = JSON.stringify({
    key: checkoutData.key_id,
    order_id: checkoutData.razorpay_order_id,
    amount: checkoutData.amount,
    currency: checkoutData.currency,
    name: checkoutData.business_name,
    description: `Order ${checkoutData.order_number}`,
  });
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head>
<body style="font-family:sans-serif;padding:24px;background:#f8fafc;color:#0f172a">
  <p>Opening secure payment…</p>
  <script>
    (function () {
      var options = ${payload};
      options.handler = function (response) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'razorpay_success', payload: response }));
      };
      options.modal = {
        ondismiss: function () {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dismissed' }));
        }
      };
      try {
        var checkout = new Razorpay(options);
        checkout.open();
      } catch (err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error',
          message: (err && err.message) || 'Unable to open Razorpay Checkout.'
        }));
      }
    })();
  </script>
</body>
</html>`;
}

export function cashfreeCheckoutHtml(checkoutData: MerchantCashfreeCheckout): string {
  const mode = checkoutData.env === 'production' ? 'production' : 'sandbox';
  const sessionId = JSON.stringify(checkoutData.payment_session_id);
  const orderId = JSON.stringify(checkoutData.cashfree_order_id);
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
</head>
<body style="font-family:sans-serif;padding:24px;background:#f8fafc;color:#0f172a">
  <p>Opening secure payment…</p>
  <script>
    (function () {
      try {
        var cashfree = Cashfree({ mode: ${JSON.stringify(mode)} });
        cashfree.checkout({
          paymentSessionId: ${sessionId},
          redirectTarget: '_modal'
        }).then(function (result) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'cashfree_success',
            payload: {
              cashfree_order_id: ${orderId},
              cashfree_payment_id: result && result.paymentDetails && result.paymentDetails.paymentId
            }
          }));
        }).catch(function (err) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'error',
            message: (err && err.message) || 'Cashfree checkout failed.'
          }));
        });
      } catch (err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error',
          message: (err && err.message) || 'Unable to open Cashfree Checkout.'
        }));
      }
    })();
  </script>
</body>
</html>`;
}
