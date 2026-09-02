import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useShopBooksDocumentMutations, useShopProductMutations, useShopProducts } from './shopHooks';
import { BarcodeCameraPanel } from './BarcodeCameraPanel';
import { computePosTotals, type DiscountType } from './posPricing';
import { maxRedeemablePoints, readLoyaltyPrefs, redeemDiscountAmount } from '../../lib/loyalty';
import { normalizeGstin, validateGstin } from '../../lib/gstin';
import { hasSubscribedProduct } from '../../config/products';
import type { Customer, MerchantCashfreeCheckout, MerchantRazorpayCheckout, ShopProduct } from '@ie-orbit/sdk';

type BasketLine = {
  product: ShopProduct;
  quantity: number;
  barcode_scanned?: string;
  discountType: DiscountType;
  discountValue: number;
};

type PaymentMethod = 'cash' | 'upi' | 'card' | 'borrow' | 'razorpay' | 'cashfree';

type RazorpayResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
    Cashfree?: (options: { mode: string }) => {
      checkout: (options: Record<string, unknown>) => Promise<{ paymentDetails?: { paymentId?: string } }>;
    };
  }
}

function loadCashfreeCheckout(): Promise<boolean> {
  if (window.Cashfree) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function loadRazorpayCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function ShopPosPage() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isChallan = searchParams.get('mode') === 'delivery_challan';
  const showGstFields = hasSubscribedProduct(workspace.activeBusiness?.product_subscriptions, 'shopie');
  const products = useShopProducts('', 'active');
  const { lookup, lookupBulk, createOrder } = useShopProductMutations();
  const { create: createDocument } = useShopBooksDocumentMutations();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [partyGstin, setPartyGstin] = useState('');
  const [scan, setScan] = useState('');
  const [bulkCodes, setBulkCodes] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [billDiscountType, setBillDiscountType] = useState<DiscountType>('');
  const [billDiscountValue, setBillDiscountValue] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [message, setMessage] = useState<string | null>(null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [razorpayConnected, setRazorpayConnected] = useState(false);
  const [cashfreeConnected, setCashfreeConnected] = useState(false);
  const [paymentSheet, setPaymentSheet] = useState<{
    orderId: string;
    orderNumber: string;
    amount: number;
    status: 'opening' | 'waiting' | 'paid' | 'failed';
  } | null>(null);

  useEffect(() => {
    if (!workspace.businessId) return;
    const businessId = workspace.businessId;
    void (async () => {
      try {
        const response = await client.customers.list({ business: businessId });
        setCustomers(response.data ?? []);
      } catch {
        setCustomers([]);
      }
      try {
        const response = await client.shop.getMerchantPaymentSettings({ business_id: businessId });
        setRazorpayConnected(response.data.can_accept_payments);
        setCashfreeConnected(Boolean(response.data.cashfree?.can_accept_payments));
      } catch {
        setRazorpayConnected(false);
        setCashfreeConnected(false);
      }
    })();
  }, [client, workspace.businessId]);

  useEffect(() => {
    if (!paymentSheet || !['opening', 'waiting'].includes(paymentSheet.status)) return;
    const interval = window.setInterval(() => {
      void client.shop.getOrder(paymentSheet.orderId).then((response) => {
        if (response.data.payment_status === 'paid') {
          setPaymentSheet((current) => (current ? { ...current, status: 'paid' } : current));
          setBasket([]);
          setBillDiscountType('');
          setBillDiscountValue('0');
          setPointsToRedeem(0);
        }
      });
    }, 2000);
    return () => window.clearInterval(interval);
  }, [client, paymentSheet]);

  async function openRazorpay(checkoutData: MerchantRazorpayCheckout) {
    const loaded = await loadRazorpayCheckout();
    if (!loaded || !window.Razorpay) throw new Error('Unable to load secure Razorpay Checkout.');
    setPaymentSheet({
      orderId: checkoutData.shop_order_id,
      orderNumber: checkoutData.order_number,
      amount: checkoutData.amount / 100,
      status: 'waiting',
    });
    const result = await new Promise<RazorpayResult>((resolve, reject) => {
      const checkout = new window.Razorpay!({
        key: checkoutData.key_id,
        order_id: checkoutData.razorpay_order_id,
        amount: checkoutData.amount,
        currency: checkoutData.currency,
        name: checkoutData.business_name,
        description: `Bill ${checkoutData.order_number}`,
        handler: resolve,
        modal: { ondismiss: () => reject(new Error('Payment window closed. The unpaid bill is saved.')) },
        theme: { color: '#2563eb' },
      });
      checkout.open();
    });
    const verified = await client.shop.verifyRazorpayPayment(checkoutData.shop_order_id, result);
    setPaymentSheet((current) => (current ? { ...current, status: 'paid' } : current));
    return verified.data;
  }

  async function openCashfree(checkoutData: MerchantCashfreeCheckout) {
    const loaded = await loadCashfreeCheckout();
    if (!loaded || !window.Cashfree) throw new Error('Unable to load Cashfree Checkout.');
    setPaymentSheet({
      orderId: checkoutData.shop_order_id,
      orderNumber: checkoutData.order_number,
      amount: checkoutData.amount / 100,
      status: 'waiting',
    });
    const cashfree = window.Cashfree({
      mode: checkoutData.env === 'production' ? 'production' : 'sandbox',
    });
    const result = await cashfree.checkout({
      paymentSessionId: checkoutData.payment_session_id,
      redirectTarget: '_modal',
    });
    const verified = await client.shop.verifyCashfreePayment(checkoutData.shop_order_id, {
      cashfree_order_id: checkoutData.cashfree_order_id,
      cashfree_payment_id: result?.paymentDetails?.paymentId,
    });
    setPaymentSheet((current) => (current ? { ...current, status: 'paid' } : current));
    return verified.data;
  }

  const filteredProducts = useMemo(() => {
    const rows = products.data ?? [];
    const term = productQuery.trim().toLowerCase();
    if (!term) return rows.slice(0, 80);
    return rows
      .filter((product) =>
        [product.name, product.brand ?? '', product.sku ?? '', ...(product.barcodes ?? []).map((b) => b.code)]
          .join(' ')
          .toLowerCase()
          .includes(term),
      )
      .slice(0, 80);
  }, [productQuery, products.data]);

  const totals = useMemo(
    () =>
      computePosTotals(
        basket.map((line) => ({
          id: line.product.id,
          name: line.product.name,
          unitPrice: Number(line.product.price),
          taxRate: Number(line.product.tax_rate ?? 0),
          quantity: line.quantity,
          discountType: line.discountType,
          discountValue: line.discountValue,
        })),
        billDiscountType,
        Number(billDiscountValue) || 0,
      ),
    [basket, billDiscountType, billDiscountValue],
  );

  const loyaltyPrefs = useMemo(
    () => readLoyaltyPrefs((workspace.activeBusiness?.settings ?? undefined) as Record<string, unknown> | undefined),
    [workspace.activeBusiness?.settings],
  );
  const selectedCustomer = useMemo(
    () => customers.find((row) => row.id === customerId) ?? null,
    [customers, customerId],
  );

  useEffect(() => {
    if (!showGstFields) {
      setPartyGstin('');
      return;
    }
    const nextGstin = normalizeGstin(selectedCustomer?.gstin || '');
    setPartyGstin(nextGstin);
  }, [customerId, selectedCustomer?.gstin, showGstFields]);

  const billGstinCheck = useMemo(() => validateGstin(partyGstin), [partyGstin]);
  const loyaltyMaxPoints = useMemo(
    () => maxRedeemablePoints(totals.subtotal, loyaltyPrefs, Number(selectedCustomer?.loyalty_points ?? 0)),
    [totals.subtotal, loyaltyPrefs, selectedCustomer?.loyalty_points],
  );
  const loyaltyDiscount = redeemDiscountAmount(customerId ? pointsToRedeem : 0, loyaltyPrefs);
  const payableAfterLoyalty = Math.max(0, totals.payable - loyaltyDiscount);

  function addProduct(product: ShopProduct, barcode?: string) {
    setBasket((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id
            ? {
                ...line,
                quantity: line.quantity + 1,
                barcode_scanned: barcode || line.barcode_scanned,
              }
            : line,
        );
      }
      return [
        ...current,
        { product, quantity: 1, barcode_scanned: barcode, discountType: '', discountValue: 0 },
      ];
    });
  }

  function updateLine(productId: string, patch: Partial<BasketLine>) {
    setBasket((current) =>
      current
        .map((line) => (line.product.id === productId ? { ...line, ...patch } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  const resolveCode = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      setMessage(null);
      try {
        const product = await lookup.mutateAsync(trimmed);
        addProduct(product, trimmed);
        setScan('');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Barcode not found.');
      }
    },
    [lookup],
  );

  async function handleScan(event: React.FormEvent) {
    event.preventDefault();
    await resolveCode(scan);
  }

  async function handleBulk() {
    const codes = bulkCodes
      .split(/[\n,;\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (!codes.length) return;
    setMessage(null);
    try {
      const result = await lookupBulk.mutateAsync(codes);
      let added = 0;
      for (const item of result.items) {
        if (item.found && item.product) {
          addProduct(item.product, item.code);
          added += 1;
        }
      }
      setBulkCodes('');
      setMessage(`Resolved ${result.found_count}/${codes.length} codes · added ${added}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bulk lookup failed.');
    }
  }

  async function checkout() {
    if (!basket.length) return;
    if (!isChallan && paymentMethod === 'borrow' && !customerId) {
      const text = 'Select a customer for borrow / credit bills.';
      setMessage(text);
      snackbar.push(text, 'error');
      return;
    }
    const gstinResult = showGstFields ? validateGstin(partyGstin) : { ok: true as const, gstin: '' };
    if (!gstinResult.ok) {
      setMessage(gstinResult.message);
      snackbar.push(gstinResult.message, 'error');
      return;
    }
    const resolvedGstin = gstinResult.gstin;
    setMessage(null);
    try {
      if (isChallan) {
        const challan = await createDocument.mutateAsync({
          doc_type: 'delivery_challan',
          customer_id: customerId || null,
          notes: [
            'Delivery challan from Sale counter',
            resolvedGstin ? `Customer GSTIN ${resolvedGstin}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
          lines: basket.map((line) => ({
            product_id: line.product.id,
            quantity: line.quantity,
            unit_price: line.product.price,
            tax_rate: line.product.tax_rate,
          })),
        });
        setBasket([]);
        setBillDiscountType('');
        setBillDiscountValue('0');
        setPointsToRedeem(0);
        snackbar.push(`Challan ${challan.document_number} created · ${totals.payable.toFixed(2)}`, 'success');
        setMessage(`Challan ${challan.document_number} created.`);
        navigate('/shop/books/delivery-challans');
        return;
      }
      const order = await createOrder.mutateAsync({
        fulfillment_mode: 'pos',
        confirm: true,
        customer_id: customerId || null,
        customer_gstin: resolvedGstin || undefined,
        payment_method: paymentMethod,
        bill_discount_type: billDiscountType,
        bill_discount_value: Number(billDiscountValue) || 0,
        points_to_redeem: customerId && pointsToRedeem > 0 ? pointsToRedeem : undefined,
        notes:
          paymentMethod === 'borrow'
            ? 'POS · BORROW (due)'
            : paymentMethod === 'razorpay'
              ? 'POS · RAZORPAY (awaiting payment)'
              : paymentMethod === 'cashfree'
                ? 'POS · CASHFREE (awaiting payment)'
                : `POS · ${paymentMethod.toUpperCase()}`,
        lines: basket.map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
          unit_price: line.product.price,
          tax_rate: line.product.tax_rate,
          barcode_scanned: line.barcode_scanned,
          discount_type: line.discountType,
          discount_value: line.discountValue,
        })),
      });
      if (paymentMethod === 'razorpay') {
        setPaymentSheet({
          orderId: order.id,
          orderNumber: order.order_number,
          amount: Number(order.total),
          status: 'opening',
        });
        const checkoutResponse = await client.shop.createRazorpayCheckout(order.id);
        await openRazorpay(checkoutResponse.data);
      }
      if (paymentMethod === 'cashfree') {
        setPaymentSheet({
          orderId: order.id,
          orderNumber: order.order_number,
          amount: Number(order.total),
          status: 'opening',
        });
        const checkoutResponse = await client.shop.createCashfreeCheckout(order.id);
        await openCashfree(checkoutResponse.data);
      }
      setBasket([]);
      setBillDiscountType('');
      setBillDiscountValue('0');
      setPointsToRedeem(0);
      const dueLabel =
        paymentMethod === 'borrow'
          ? ' · Due'
          : paymentMethod === 'razorpay' || paymentMethod === 'cashfree'
            ? ' · Paid online'
            : '';
      snackbar.push(
        `Bill ${order.order_number} created${dueLabel} · ${totals.payable.toFixed(2)}`,
        'success',
      );
      setMessage(`Bill ${order.order_number} created.`);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unable to create bill.';
      setMessage(text);
      snackbar.push(text, 'error');
    }
  }

  return (
    <div className="page-stack">
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1.1fr) minmax(320px,0.9fr)' }}>
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <Card>
            <h2 style={{ marginTop: 0 }}>{isChallan ? 'Add to challan' : 'Add to bill'}</h2>
            <form onSubmit={handleScan} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                autoFocus
                value={scan}
                onChange={(event) => setScan(event.target.value)}
                placeholder="Scan barcode / RFID (HID wedge, camera, or type)"
                style={{ flex: 1, minWidth: 220, padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
              <Button type="submit" disabled={lookup.isPending}>
                Add
              </Button>
              <Button type="button" onClick={() => setCameraOpen((open) => !open)}>
                {cameraOpen ? 'Hide camera' : 'Camera'}
              </Button>
            </form>
            <BarcodeCameraPanel
              active={cameraOpen}
              onClose={() => setCameraOpen(false)}
              onCode={(code) => {
                void resolveCode(code);
              }}
            />
            <div style={{ marginTop: 12 }}>
              <textarea
                value={bulkCodes}
                onChange={(event) => setBulkCodes(event.target.value)}
                rows={3}
                placeholder="Bulk barcodes / EPC (one per line)"
                style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
              <div style={{ marginTop: 8 }}>
                <Button type="button" onClick={handleBulk} disabled={lookupBulk.isPending}>
                  Resolve bulk
                </Button>
              </div>
            </div>
            {message ? <p role="status">{message}</p> : null}
          </Card>

          <Card>
            <h2 style={{ marginTop: 0 }}>Catalog</h2>
            <input
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Search products…"
              style={{ width: '100%', marginBottom: 12, padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
            <div style={{ display: 'grid', gap: 8, maxHeight: 480, overflow: 'auto' }}>
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProduct(product)}
                  style={{
                    textAlign: 'left',
                    padding: 12,
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                  }}
                >
                  <strong>{product.name}</strong>
                  <div style={{ opacity: 0.75 }}>
                    {product.price} · stock {product.stock_on_hand}
                    {product.category ? ` · ${product.category}` : ''}
                  </div>
                </button>
              ))}
              {!filteredProducts.length ? <p>No matching products.</p> : null}
            </div>
          </Card>
        </div>

        <Card style={{ position: 'sticky', top: 16, alignSelf: 'start' }}>
          <h2 style={{ marginTop: 0 }}>{isChallan ? 'Delivery challan' : 'Bill'}</h2>
          <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Customer</span>
            <select
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value);
                setPointsToRedeem(0);
              }}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            >
              <option value="">Walk-in customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.full_name ||
                    customer.display_name ||
                    [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
                    customer.email ||
                    customer.phone_number ||
                    customer.id}
                </option>
              ))}
            </select>
          </label>
          {showGstFields ? (
            <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Customer GSTIN</span>
              <input
                value={partyGstin}
                onChange={(event) => setPartyGstin(normalizeGstin(event.target.value))}
                maxLength={15}
                placeholder="29AABCU9603R1ZJ (optional for B2C)"
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${partyGstin && !billGstinCheck.ok ? '#dc2626' : '#e5e7eb'}`,
                }}
              />
              <span style={{ fontSize: 12, color: partyGstin && !billGstinCheck.ok ? '#dc2626' : '#6b7280' }}>
                {partyGstin.length === 0
                  ? 'Leave blank for B2C. Enter a valid GSTIN for B2B GST invoices.'
                  : !billGstinCheck.ok
                    ? billGstinCheck.message
                    : 'Valid GSTIN — bill will be posted as B2B for GSTR-1 / e-invoice.'}
              </span>
            </label>
          ) : null}
          {customerId && !isChallan && loyaltyPrefs.enabled && loyaltyMaxPoints >= loyaltyPrefs.min_redeem_points ? (
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Reward points</span>
              <span style={{ fontSize: 13, opacity: 0.8 }}>
                Balance {selectedCustomer?.loyalty_points ?? 0} pts · {loyaltyPrefs.points_per_currency_unit} pts = ₹1
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button
                  type="button"
                  variant="neutral"
                  onClick={() =>
                    setPointsToRedeem((current) => {
                      if (current <= 0) return 0;
                      const next = current - Math.max(1, loyaltyPrefs.min_redeem_points);
                      return next < loyaltyPrefs.min_redeem_points ? 0 : next;
                    })
                  }
                >
                  −
                </Button>
                <strong>{pointsToRedeem} pts</strong>
                <Button
                  type="button"
                  variant="neutral"
                  onClick={() =>
                    setPointsToRedeem((current) => {
                      const step = Math.max(1, loyaltyPrefs.min_redeem_points);
                      if (current <= 0) return Math.min(loyaltyMaxPoints, step);
                      return Math.min(loyaltyMaxPoints, current + step);
                    })
                  }
                >
                  +
                </Button>
              </div>
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: 10, maxHeight: 360, overflow: 'auto', marginBottom: 12 }}>
            {basket.map((line) => {
              const priced = totals.lines.find((row) => row.id === line.product.id);
              return (
                <div
                  key={line.product.id}
                  style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <strong>{line.product.name}</strong>
                      <div style={{ opacity: 0.75, fontSize: 13 }}>
                        {Number(line.product.price).toFixed(2)} × {line.quantity}
                        {priced && priced.discountAmount > 0
                          ? ` · disc. -${priced.discountAmount.toFixed(2)}`
                          : ''}
                      </div>
                    </div>
                    <strong>{priced?.total.toFixed(2) ?? '0.00'}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button
                      type="button"
                      variant="neutral"
                      onClick={() => updateLine(line.product.id, { quantity: line.quantity - 1 })}
                    >
                      −
                    </Button>
                    <span>{line.quantity}</span>
                    <Button
                      type="button"
                      variant="neutral"
                      onClick={() => updateLine(line.product.id, { quantity: line.quantity + 1 })}
                    >
                      +
                    </Button>
                    <select
                      value={line.discountType}
                      onChange={(event) =>
                        updateLine(line.product.id, {
                          discountType: event.target.value as DiscountType,
                          discountValue:
                            event.target.value === ''
                              ? 0
                              : line.discountValue || (event.target.value === 'percent' ? 5 : 10),
                        })
                      }
                      style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    >
                      <option value="">No discount</option>
                      <option value="percent">% off</option>
                      <option value="amount">₹ off</option>
                    </select>
                    {line.discountType ? (
                      <input
                        value={line.discountValue}
                        onChange={(event) =>
                          updateLine(line.product.id, {
                            discountValue: Number(event.target.value) || 0,
                          })
                        }
                        style={{ width: 88, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      />
                    ) : null}
                    <Button type="button" variant="ghost" onClick={() => updateLine(line.product.id, { quantity: 0 })}>
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
            {!basket.length ? (
              <p>{isChallan ? 'Scan or pick products to start the challan.' : 'Scan or pick products to start the bill.'}</p>
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Bill discount</span>
              <select
                value={billDiscountType}
                onChange={(event) => {
                  const next = event.target.value as DiscountType;
                  setBillDiscountType(next);
                  if (!next) setBillDiscountValue('0');
                }}
                style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              >
                <option value="">None</option>
                <option value="percent">% off</option>
                <option value="amount">₹ off</option>
              </select>
              {billDiscountType ? (
                <input
                  value={billDiscountValue}
                  onChange={(event) => setBillDiscountValue(event.target.value)}
                  style={{ width: 88, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
              ) : null}
            </div>
            {!isChallan ? (
            <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(
                [
                  { value: 'cash', label: 'Cash' },
                  { value: 'upi', label: 'UPI' },
                  { value: 'card', label: 'Card' },
                  { value: 'borrow', label: 'Borrow' },
                  ...(razorpayConnected ? [{ value: 'razorpay' as const, label: 'Pay with Razorpay' }] : []),
                  ...(cashfreeConnected ? [{ value: 'cashfree' as const, label: 'Pay with Cashfree' }] : []),
                ] as const
              ).map((method) => (
                <Button
                  key={method.value}
                  type="button"
                  variant={paymentMethod === method.value ? 'primary' : 'neutral'}
                  onClick={() => setPaymentMethod(method.value)}
                >
                  {method.label}
                </Button>
              ))}
            </div>
            {paymentMethod === 'borrow' ? (
              <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
                Borrow / credit: customer takes goods now and pays later. A customer is required (not
                Walk-in).
              </p>
            ) : null}
            {paymentMethod === 'razorpay' ? (
              <p style={{ margin: 0, fontSize: 13, color: '#1d4ed8' }}>
                Secure Razorpay Checkout opens after the bill is created. The bill stays unpaid until Razorpay confirms it.
              </p>
            ) : null}
            {paymentMethod === 'cashfree' ? (
              <p style={{ margin: 0, fontSize: 13, color: '#1d4ed8' }}>
                Cashfree Checkout opens after the bill is created. The bill stays unpaid until Cashfree confirms it.
              </p>
            ) : null}
            </>
            ) : (
              <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
                No payment now. Dispatch the challan from the list when goods leave — stock is deducted then.
              </p>
            )}
          </div>

          <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
            <strong>{isChallan ? 'Challan summary' : 'Bill summary'}</strong>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Items</span>
              <span>{totals.merchandiseGross.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Product discounts</span>
              <span>-{totals.lineDiscountTotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Bill discount</span>
              <span>-{totals.billDiscountAmount.toFixed(2)}</span>
            </div>
            {loyaltyDiscount > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Reward points</span>
                <span>-{loyaltyDiscount.toFixed(2)}</span>
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tax</span>
              <span>{totals.taxTotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18 }}>
              <span>{isChallan ? 'Total' : paymentMethod === 'borrow' ? 'Amount due' : 'Payable'}</span>
              <span>{payableAfterLoyalty.toFixed(2)}</span>
            </div>
          </div>

          <Button
            type="button"
            variant="primary"
            onClick={() => void checkout()}
            disabled={!basket.length || createOrder.isPending || createDocument.isPending}
          >
            {createDocument.isPending
              ? 'Saving challan…'
              : createOrder.isPending
              ? 'Creating bill…'
              : isChallan
                ? `Save challan · ${totals.payable.toFixed(2)}`
              : paymentMethod === 'borrow'
                ? `Create Bill · Due ${payableAfterLoyalty.toFixed(2)}`
                : paymentMethod === 'razorpay'
                  ? `Pay with Razorpay · ${payableAfterLoyalty.toFixed(2)}`
                : paymentMethod === 'cashfree'
                  ? `Pay with Cashfree · ${payableAfterLoyalty.toFixed(2)}`
                : `Create Bill · ${payableAfterLoyalty.toFixed(2)}`}
          </Button>
        </Card>
      </div>
      {paymentSheet ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Online payment status"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
        >
          <Card style={{ width: 'min(440px, 100%)', textAlign: 'center', padding: 28 }}>
            <div style={{ fontSize: 42, marginBottom: 8 }}>
              {paymentSheet.status === 'paid' ? '✓' : paymentSheet.status === 'failed' ? '!' : '◌'}
            </div>
            <h2 style={{ margin: '0 0 8px' }}>
              {paymentSheet.status === 'paid'
                ? 'Payment received'
                : paymentSheet.status === 'failed'
                  ? 'Payment failed'
                  : 'Waiting for payment'}
            </h2>
            <p style={{ margin: '0 0 4px', color: '#6b7280' }}>Bill {paymentSheet.orderNumber}</p>
            <strong style={{ display: 'block', fontSize: 28, margin: '12px 0 20px' }}>
              ₹{paymentSheet.amount.toFixed(2)}
            </strong>
            {paymentSheet.status !== 'paid' ? (
              <p style={{ color: '#6b7280' }}>
                Complete the secure Razorpay window. This status also updates automatically from the webhook.
              </p>
            ) : null}
            <Button
              type="button"
              variant={paymentSheet.status === 'paid' ? 'primary' : 'neutral'}
              onClick={() => setPaymentSheet(null)}
            >
              {paymentSheet.status === 'paid' ? 'Done' : 'Close — keep bill unpaid'}
            </Button>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
