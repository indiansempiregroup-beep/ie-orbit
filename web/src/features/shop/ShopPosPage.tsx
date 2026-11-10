import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useShopBooksDocumentMutations, useShopProductMutations, useShopProducts, useShopSuppliers } from './shopHooks';
import { BarcodeCameraPanel } from './BarcodeCameraPanel';
import { computePosTotals, type DiscountType } from './posPricing';
import { formatMoney } from '../../lib/currency';
import { maxRedeemablePoints, readLoyaltyPrefs, redeemDiscountAmount } from '../../lib/loyalty';
import { normalizeGstin, validateGstin } from '../../lib/gstin';
import { hasSubscribedProduct } from '../../config/products';
import { DocumentActionsSheet, type ShopDocTarget } from './DocumentActionsSheet';
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
  const { t } = useTranslation();
  const tp = useCallback(
    (key: string, options?: Record<string, unknown>) => String(t(`shop.pos.${key}`, options)),
    [t],
  );
  const [searchParams] = useSearchParams();
  const posMode = searchParams.get('mode') || 'sale';
  const isChallan = posMode === 'delivery_challan';
  const isSaleOrder = posMode === 'sale_order';
  const isPurchaseOrder = posMode === 'purchase_order';
  const isBooksDocument = isChallan || isSaleOrder || isPurchaseOrder;
  const editDocumentId = isBooksDocument ? searchParams.get('document') || '' : '';
  const currency = workspace.activeBusiness?.currency;
  const money = (amount: number) => formatMoney(amount, currency);
  const showGstFields = hasSubscribedProduct(workspace.activeBusiness?.product_subscriptions, 'shopie');
  const products = useShopProducts('', 'active');
  const { lookup, lookupBulk, createOrder } = useShopProductMutations();
  const { create: createDocument, update: updateDocument } = useShopBooksDocumentMutations();
  const editHydratedRef = useRef('');
  const [documentNotes, setDocumentNotes] = useState('');
  const suppliers = useShopSuppliers();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [partyGstin, setPartyGstin] = useState('');
  const [scan, setScan] = useState('');
  const [bulkCodes, setBulkCodes] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [billDiscountType, setBillDiscountType] = useState<DiscountType>('');
  const [billDiscountValue, setBillDiscountValue] = useState('0');
  const [automationOffers, setAutomationOffers] = useState<
    Array<{ label: string; discount_type: string; discount_value: string }>
  >([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  /** Amount collected at the till. Empty string while user is typing; defaults sync from payable. */
  const [amountReceived, setAmountReceived] = useState('');
  const [amountReceivedTouched, setAmountReceivedTouched] = useState(false);
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
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);

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
    if (!editDocumentId || products.isLoading) return;
    if (editHydratedRef.current === editDocumentId) return;
    let cancelled = false;
    void client.shop.getDocument(editDocumentId).then((response) => {
      if (cancelled || !response.data) return;
      const document = response.data;
      editHydratedRef.current = editDocumentId;
      setCustomerId(document.customer || '');
      setSupplierId(document.supplier || '');
      setDocumentNotes(document.notes || '');
      const catalog = products.data ?? [];
      const rows = Array.isArray(document.line_items) ? document.line_items : [];
      setBasket(
        rows.flatMap((raw) => {
          const line = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
          if (!line) return [];
          const productId = String(line.product_id || '').trim();
          const quantity = Number(line.quantity ?? line.qty ?? 0);
          if (!productId || !Number.isFinite(quantity) || quantity <= 0) return [];
          const catalogProduct = catalog.find((product) => product.id === productId);
          const rate = line.unit_price ?? line.rate ?? catalogProduct?.price ?? 0;
          const gst = line.tax_rate ?? line.gst_rate ?? catalogProduct?.tax_rate ?? 0;
          const product = catalogProduct
            ? { ...catalogProduct, price: String(rate), tax_rate: String(gst) }
            : ({
                id: productId,
                name: String(line.name || 'Item'),
                price: String(rate),
                tax_rate: String(gst),
                stock_on_hand: 0,
              } as ShopProduct);
          return [{ product, quantity, discountType: '' as const, discountValue: 0 }];
        }),
      );
    }).catch((error) => {
      if (!cancelled) {
        const text = error instanceof Error ? error.message : tp('couldntOpenRecord');
        setMessage(text);
        snackbar.push(text, 'error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client, editDocumentId, products.data, products.isLoading, snackbar, tp]);

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
    if (!loaded || !window.Razorpay) throw new Error(tp('razorpayLoadFailed'));
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
        modal: { ondismiss: () => reject(new Error(tp('paymentWindowClosed'))) },
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
    if (!loaded || !window.Cashfree) throw new Error(tp('cashfreeLoadFailed'));
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

  const posLineInputs = useMemo(
    () =>
      basket.map((line) => ({
        id: line.product.id,
        name: line.product.name,
        unitPrice: Number(line.product.price),
        taxRate: Number(line.product.tax_rate ?? line.product.gst_rate ?? 0),
        taxInclusive:
          typeof line.product.tax_inclusive === 'boolean'
            ? line.product.tax_inclusive
            : Boolean(
                line.product.metadata &&
                  typeof line.product.metadata === 'object' &&
                  (line.product.metadata as Record<string, unknown>).tax_inclusive === true,
              ),
        quantity: line.quantity,
        discountType: line.discountType,
        discountValue: line.discountValue,
      })),
    [basket],
  );

  const baseTotals = useMemo(
    () => computePosTotals(posLineInputs, billDiscountType, Number(billDiscountValue) || 0, 0),
    [posLineInputs, billDiscountType, billDiscountValue],
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
    if (!workspace.businessId || !customerId || isChallan) {
      setAutomationOffers([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await client.shop.eligibleOffers({
          business_id: workspace.businessId!,
          customer_id: customerId,
          fulfillment_mode: 'pos',
          lines: basket.map((line) => ({
            product_id: line.product.id,
            quantity: line.quantity,
          })),
        });
        if (cancelled) return;
        setAutomationOffers(
          (res.data.automations || [])
            .map((row) => ({
              label: String(row.label || row.name || 'Offer'),
              discount_type: String(row.discount_type || 'percent'),
              discount_value: String(row.discount_value || '0'),
            }))
            .filter((row) => Number(row.discount_value) > 0),
        );
      } catch {
        if (!cancelled) setAutomationOffers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [basket, client, customerId, isChallan, workspace.businessId]);

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
    () =>
      maxRedeemablePoints(
        baseTotals.subtotal,
        loyaltyPrefs,
        Number(selectedCustomer?.loyalty_points ?? 0),
      ),
    [baseTotals.subtotal, loyaltyPrefs, selectedCustomer?.loyalty_points],
  );
  const loyaltyDiscount = redeemDiscountAmount(
    customerId ? Math.min(pointsToRedeem, loyaltyMaxPoints) : 0,
    loyaltyPrefs,
  );
  const totals = useMemo(
    () =>
      loyaltyDiscount > 0
        ? computePosTotals(
            posLineInputs,
            billDiscountType,
            Number(billDiscountValue) || 0,
            loyaltyDiscount,
          )
        : baseTotals,
    [baseTotals, posLineInputs, billDiscountType, billDiscountValue, loyaltyDiscount],
  );
  const payableAfterLoyalty = totals.payable;
  const tillPayment =
    !isBooksDocument &&
    (paymentMethod === 'cash' ||
      paymentMethod === 'upi' ||
      paymentMethod === 'card' ||
      paymentMethod === 'borrow');
  const receivedAmount = useMemo(() => {
    if (!tillPayment) return 0;
    if (paymentMethod === 'borrow' && !amountReceivedTouched && amountReceived === '') {
      return 0;
    }
    if (!amountReceivedTouched && amountReceived === '' && paymentMethod !== 'borrow') {
      return payableAfterLoyalty;
    }
    const parsed = Number(amountReceived);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.min(payableAfterLoyalty, Math.round((parsed + Number.EPSILON) * 100) / 100);
  }, [
    tillPayment,
    paymentMethod,
    amountReceived,
    amountReceivedTouched,
    payableAfterLoyalty,
  ]);
  const balanceDue = useMemo(
    () => Math.max(0, Math.round((payableAfterLoyalty - receivedAmount + Number.EPSILON) * 100) / 100),
    [payableAfterLoyalty, receivedAmount],
  );

  useEffect(() => {
    if (!tillPayment || amountReceivedTouched) return;
    if (paymentMethod === 'borrow') {
      setAmountReceived('');
      return;
    }
    setAmountReceived(
      payableAfterLoyalty > 0
        ? String(Math.round((payableAfterLoyalty + Number.EPSILON) * 100) / 100)
        : '',
    );
  }, [tillPayment, paymentMethod, payableAfterLoyalty, amountReceivedTouched]);

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
        setMessage(error instanceof Error ? error.message : tp('barcodeNotFound'));
      }
    },
    [lookup, tp],
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
      setMessage(
        tp('bulkResolved', { found: result.found_count, total: codes.length, added }),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tp('bulkLookupFailed'));
    }
  }

  async function checkout() {
    if (!basket.length) return;
    if (!isBooksDocument && tillPayment && balanceDue > 0 && !customerId) {
      const text = tp('selectCustomerPartial');
      setMessage(text);
      snackbar.push(text, 'error');
      return;
    }
    const gstinResult = showGstFields ? validateGstin(partyGstin) : { ok: true as const, gstin: '' };
    if (gstinResult.ok === false) {
      setMessage(gstinResult.message);
      snackbar.push(gstinResult.message, 'error');
      return;
    }
    const resolvedGstin = gstinResult.gstin;
    setMessage(null);
    try {
      if (isBooksDocument) {
        if (isPurchaseOrder && !supplierId) {
          const text = tp('selectSupplierPo');
          setMessage(text);
          snackbar.push(text, 'error');
          return;
        }
        const docType = isPurchaseOrder ? 'purchase_order' : isSaleOrder ? 'sale_order' : 'delivery_challan';
        const label = isPurchaseOrder
          ? tp('labelPurchaseOrder')
          : isSaleOrder
            ? tp('labelSaleOrder')
            : tp('labelChallan');
        const documentLines = basket.map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
          unit_price: line.product.price,
          tax_rate: line.product.tax_rate,
          tax_inclusive: Boolean(
            line.product.tax_inclusive ??
              (line.product.metadata &&
                typeof line.product.metadata === 'object' &&
                (line.product.metadata as { tax_inclusive?: boolean }).tax_inclusive),
          ),
        }));
        const notes = editDocumentId
          ? documentNotes.trim()
          : [
              documentNotes.trim() || `${label} from Sale counter`,
              resolvedGstin ? `${isPurchaseOrder ? 'Supplier' : 'Customer'} GSTIN ${resolvedGstin}` : '',
            ]
              .filter(Boolean)
              .join(' · ');
        const saved = editDocumentId
          ? await updateDocument.mutateAsync({
              documentId: editDocumentId,
              body: {
                customer_id: isPurchaseOrder ? null : customerId || null,
                supplier_id: isPurchaseOrder ? supplierId || null : null,
                notes,
                lines: documentLines,
              },
            })
          : await createDocument.mutateAsync({
              doc_type: docType,
              customer_id: isPurchaseOrder ? null : customerId || null,
              supplier_id: isPurchaseOrder ? supplierId : null,
              notes,
              lines: documentLines,
            });
        setBasket([]);
        setBillDiscountType('');
        setBillDiscountValue('0');
        setPointsToRedeem(0);
        snackbar.push(
          tp(editDocumentId ? 'docUpdatedTotal' : 'docCreatedTotal', {
            label,
            number: saved.document_number,
            total: money(totals.payable),
          }),
          'success',
        );
        setMessage(
          tp(editDocumentId ? 'docUpdated' : 'docCreated', { label, number: saved.document_number }),
        );
        setDocumentNotes('');
        if (editDocumentId) {
          navigate(
            isPurchaseOrder
              ? `/shop/books/purchase-orders?document=${saved.id}`
              : isSaleOrder
                ? `/shop/books/sale-orders?document=${saved.id}`
                : `/shop/books/delivery-challans?document=${saved.id}`,
          );
          return;
        }
        if (isChallan && workspace.businessId) {
          setDocActions({
            kind: 'delivery_challan',
            id: saved.id,
            number: saved.document_number,
            businessId: workspace.businessId,
          });
        } else {
          navigate(
            isPurchaseOrder
              ? `/shop/books/purchase-orders?document=${saved.id}`
              : isSaleOrder
                ? `/shop/books/sale-orders?document=${saved.id}`
                : '/shop/books/delivery-challans',
          );
        }
        return;
      }
      const order = await createOrder.mutateAsync({
        fulfillment_mode: 'pos',
        confirm: true,
        customer_id: customerId || null,
        customer_gstin: resolvedGstin || undefined,
        payment_method: paymentMethod,
        ...(tillPayment ? { amount_paid: receivedAmount } : {}),
        bill_discount_type: billDiscountType,
        bill_discount_value: Number(billDiscountValue) || 0,
        points_to_redeem: customerId && pointsToRedeem > 0 ? pointsToRedeem : undefined,
        notes:
          paymentMethod === 'borrow'
            ? balanceDue > 0 && receivedAmount > 0
              ? `POS · PARTIAL · paid ${receivedAmount} · due ${balanceDue}`
              : 'POS · BORROW (due)'
            : paymentMethod === 'razorpay'
              ? 'POS · RAZORPAY (awaiting payment)'
              : paymentMethod === 'cashfree'
                ? 'POS · CASHFREE (awaiting payment)'
                : balanceDue > 0
                  ? `POS · ${paymentMethod.toUpperCase()} · partial · due ${balanceDue}`
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
      setAmountReceivedTouched(false);
      setAmountReceived('');
      const billSnack =
        paymentMethod === 'razorpay' || paymentMethod === 'cashfree'
          ? tp('billCreatedOnline', { number: order.order_number, total: money(totals.payable) })
          : balanceDue > 0
            ? tp('billCreatedDue', {
                number: order.order_number,
                paid: money(receivedAmount),
                due: money(balanceDue),
                total: money(totals.payable),
              })
            : tp('billCreatedTotal', { number: order.order_number, total: money(totals.payable) });
      snackbar.push(billSnack, 'success');
      setMessage(tp('billCreated', { number: order.order_number }));
      if (workspace.businessId && order.books_voucher_id) {
        setDocActions({
          kind: 'sale',
          id: order.books_voucher_id,
          number: order.books_voucher_number || order.order_number,
          businessId: workspace.businessId,
        });
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : tp('couldntCreateBill');
      setMessage(text);
      snackbar.push(text, 'error');
    }
  }

  const docTitle = isChallan
    ? tp('titleChallan')
    : isSaleOrder
      ? tp('titleSaleOrder')
      : isPurchaseOrder
        ? tp('titlePurchaseOrder')
        : tp('titleBill');

  return (
    <div className="page-stack">
      <DocumentActionsSheet
        open={Boolean(docActions)}
        onClose={() => {
          const createdId = docActions?.id;
          const kind = docActions?.kind;
          setDocActions(null);
          if (kind === 'delivery_challan' && createdId) {
            navigate(`/shop/books/delivery-challans?document=${createdId}`);
          }
        }}
        target={docActions}
        title={docActions?.kind === 'delivery_challan' ? tp('challanReady') : tp('billCreatedTitle')}
        allowNewBill={docActions?.kind === 'sale'}
        onNewBill={() => setDocActions(null)}
      />
      <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1.1fr) minmax(320px,0.9fr)' }}>
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <Card>
            <h2 style={{ marginTop: 0 }}>
              {isChallan
                ? tp('addToChallan')
                : isSaleOrder
                  ? tp('addToSaleOrder')
                  : isPurchaseOrder
                    ? tp('addToPurchaseOrder')
                    : tp('addToBill')}
            </h2>
            <form onSubmit={handleScan} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                autoFocus
                value={scan}
                onChange={(event) => setScan(event.target.value)}
                placeholder={tp('scanPlaceholder')}
                style={{ flex: 1, minWidth: 220, padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
              <Button type="submit" disabled={lookup.isPending}>
                {tp('add')}
              </Button>
              <Button type="button" onClick={() => setCameraOpen((open) => !open)}>
                {cameraOpen ? tp('hideCamera') : tp('camera')}
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
                placeholder={tp('bulkPlaceholder')}
                style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
              <div style={{ marginTop: 8 }}>
                <Button type="button" onClick={handleBulk} disabled={lookupBulk.isPending}>
                  {tp('resolveBulk')}
                </Button>
              </div>
            </div>
            {message ? <p role="status">{message}</p> : null}
          </Card>

          <Card>
            <h2 style={{ marginTop: 0 }}>{tp('catalog')}</h2>
            <input
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder={tp('searchProducts')}
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
                    {tp('productMeta', { price: money(Number(product.price)), stock: product.stock_on_hand })}
                    {product.category ? ` · ${product.category}` : ''}
                  </div>
                </button>
              ))}
              {!filteredProducts.length ? <p>{tp('noMatching')}</p> : null}
            </div>
          </Card>
        </div>

        <Card style={{ position: 'sticky', top: 16, alignSelf: 'start' }}>
          <h2 style={{ marginTop: 0 }}>
            {editDocumentId ? tp('editTitle', { title: docTitle }) : docTitle}
          </h2>
          {isPurchaseOrder ? (
            <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{tp('supplier')}</span>
              <select
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              >
                <option value="">{tp('selectSupplier')}</option>
                {(suppliers.data ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
          <>
          <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{tp('customer')}</span>
            <select
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value);
                setPointsToRedeem(0);
              }}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            >
              <option value="">{tp('walkIn')}</option>
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
              <span style={{ fontSize: 13, fontWeight: 600 }}>{tp('customerGstin')}</span>
              <input
                value={partyGstin}
                onChange={(event) => setPartyGstin(normalizeGstin(event.target.value))}
                maxLength={15}
                placeholder={tp('gstinPlaceholder')}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${partyGstin && !billGstinCheck.ok ? '#dc2626' : '#e5e7eb'}`,
                }}
              />
              <span style={{ fontSize: 12, color: partyGstin && !billGstinCheck.ok ? '#dc2626' : '#6b7280' }}>
                {partyGstin.length === 0
                  ? tp('gstinBlank')
                  : billGstinCheck.ok === false
                    ? billGstinCheck.message
                    : tp('gstinValid')}
              </span>
            </label>
          ) : null}
          </>
          )}
          {isBooksDocument ? (
            <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{tp('notes')}</span>
              <textarea
                rows={2}
                value={documentNotes}
                onChange={(event) => setDocumentNotes(event.target.value)}
                placeholder={tp('notesPlaceholder')}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', resize: 'vertical' }}
              />
            </label>
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
                        {money(Number(line.product.price))} × {line.quantity}
                        {priced && priced.discountAmount > 0
                          ? ` · ${tp('lineDiscount', { amount: money(priced.discountAmount) })}`
                          : ''}
                      </div>
                    </div>
                    <strong>
                      {money(
                        priced?.amount ??
                          Math.round(
                            (Number(line.product.price) * line.quantity + Number.EPSILON) * 100,
                          ) / 100,
                      )}
                    </strong>
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
                    {!isBooksDocument ? (
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
                      <option value="">{tp('noDiscount')}</option>
                      <option value="percent">{tp('percentOff')}</option>
                      <option value="amount">{tp('amountOff')}</option>
                    </select>
                    ) : null}
                    {!isBooksDocument && line.discountType ? (
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
                      {tp('remove')}
                    </Button>
                  </div>
                </div>
              );
            })}
            {!basket.length ? (
              <p>{isChallan ? tp('emptyChallan') : tp('emptyBill')}</p>
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: 14, marginBottom: 16 }}>
            {customerId && !isBooksDocument && loyaltyPrefs.enabled && loyaltyMaxPoints >= loyaltyPrefs.min_redeem_points ? (
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  padding: 14,
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: 'var(--primary)',
                      }}
                    >
                      {tp('customerRewards')}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{tp('rewardPoints')}</div>
                  </div>
                  <div
                    style={{
                      minWidth: 68,
                      textAlign: 'center',
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: 'color-mix(in srgb, #d97706 14%, white)',
                    }}
                  >
                    <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>
                      {selectedCustomer?.loyalty_points ?? 0}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{tp('pts')}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  {tp('redeemInfo', {
                    rate: loyaltyPrefs.points_per_currency_unit,
                    value: money(1),
                    max: loyaltyMaxPoints,
                  })}
                </div>
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
                  <div style={{ minWidth: 72, textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{pointsToRedeem}</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{tp('pts')}</div>
                  </div>
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
                  <Button type="button" onClick={() => setPointsToRedeem(loyaltyMaxPoints)}>
                    {tp('max')}
                  </Button>
                </div>
                {pointsToRedeem > 0 ? (
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: 10,
                      background: 'color-mix(in srgb, #059669 12%, white)',
                      color: '#047857',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {tp('saves', { amount: money(loyaltyDiscount) })}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, opacity: 0.7 }}>{tp('tapToRedeem')}</div>
                )}
              </div>
            ) : null}
            {customerId && !isBooksDocument && automationOffers.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  padding: 14,
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: 'var(--primary)',
                    }}
                  >
                    {tp('specialForCustomer')}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{tp('automationOffers')}</div>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {automationOffers.map((offer) => {
                    const dtype = offer.discount_type === 'amount' ? 'amount' : 'percent';
                    const active =
                      billDiscountType === dtype &&
                      String(Number(billDiscountValue) || 0) === String(Number(offer.discount_value) || 0);
                    const badge =
                      dtype === 'amount'
                        ? tp('badgeAmountOff', { value: money(Number(offer.discount_value) || 0) })
                        : tp('badgePercentOff', { value: Number(offer.discount_value) || 0 });
                    return (
                      <button
                        key={`${offer.label}-${offer.discount_value}`}
                        type="button"
                        onClick={() => {
                          setBillDiscountType(dtype);
                          setBillDiscountValue(offer.discount_value);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          width: '100%',
                          textAlign: 'left',
                          padding: 12,
                          borderRadius: 12,
                          border: active
                            ? '1px solid var(--primary)'
                            : '1px solid var(--border)',
                          background: active
                            ? 'color-mix(in srgb, var(--primary) 12%, white)'
                            : 'color-mix(in srgb, var(--primary) 6%, white)',
                          cursor: 'pointer',
                        }}
                      >
                        <span
                          style={{
                            minWidth: 78,
                            textAlign: 'center',
                            padding: '8px 10px',
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 700,
                            color: active ? 'var(--primary-foreground)' : 'var(--primary)',
                            background: active ? 'var(--primary)' : 'var(--card)',
                            border: active ? 'none' : '1px solid var(--border)',
                          }}
                        >
                          {badge}
                        </span>
                        <span style={{ flex: 1 }}>
                          <strong style={{ display: 'block', fontSize: 14 }}>{offer.label}</strong>
                          <span style={{ fontSize: 12, opacity: 0.7 }}>
                            {active ? tp('applied') : tp('tapToApply')}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div
              style={{
                display: 'grid',
                gap: 10,
                padding: 14,
                borderRadius: 14,
                border: '1px solid var(--border)',
                background: 'var(--card)',
              }}
            >
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{tp('billDiscount')}</span>
                <select
                  value={billDiscountType}
                  onChange={(event) => {
                    const next = event.target.value as DiscountType;
                    setBillDiscountType(next);
                    if (!next) setBillDiscountValue('0');
                  }}
                  style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                >
                  <option value="">{tp('none')}</option>
                  <option value="percent">{tp('percentOff')}</option>
                  <option value="amount">{tp('amountOff')}</option>
                </select>
                {billDiscountType ? (
                  <input
                    value={billDiscountValue}
                    onChange={(event) => setBillDiscountValue(event.target.value)}
                    style={{ width: 88, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'minmax(0, 1.1fr) minmax(280px, 0.9fr)',
          alignItems: 'start',
        }}
      >
        <Card>
          <h2 style={{ marginTop: 0 }}>
            {isChallan
              ? tp('challan')
              : isSaleOrder
                ? tp('titleSaleOrder')
                : isPurchaseOrder
                  ? tp('titlePurchaseOrder')
                  : tp('payment')}
          </h2>
          {!isBooksDocument ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(
                  [
                    { value: 'cash', label: tp('methodCash') },
                    { value: 'upi', label: tp('methodUpi') },
                    { value: 'card', label: tp('methodCard') },
                    { value: 'borrow', label: tp('methodBorrow') },
                    ...(razorpayConnected
                      ? [{ value: 'razorpay' as const, label: tp('methodRazorpay') }]
                      : []),
                    ...(cashfreeConnected
                      ? [{ value: 'cashfree' as const, label: tp('methodCashfree') }]
                      : []),
                  ] as const
                ).map((method) => (
                  <Button
                    key={method.value}
                    type="button"
                    variant={paymentMethod === method.value ? 'primary' : 'neutral'}
                    onClick={() => {
                      setPaymentMethod(method.value);
                      setAmountReceivedTouched(false);
                    }}
                  >
                    {method.label}
                  </Button>
                ))}
              </div>
              {tillPayment ? (
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {paymentMethod === 'borrow' ? tp('amountPaidNow') : tp('amountReceived')}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    max={payableAfterLoyalty || undefined}
                    value={
                      amountReceivedTouched || amountReceived !== ''
                        ? amountReceived
                        : paymentMethod === 'borrow'
                          ? ''
                          : payableAfterLoyalty > 0
                            ? String(Math.round((payableAfterLoyalty + Number.EPSILON) * 100) / 100)
                            : ''
                    }
                    onChange={(event) => {
                      setAmountReceivedTouched(true);
                      setAmountReceived(event.target.value);
                    }}
                    placeholder={paymentMethod === 'borrow' ? '0.00' : money(payableAfterLoyalty)}
                    style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                  />
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    {balanceDue > 0
                      ? tp('balanceDueCredit', { amount: money(balanceDue) })
                      : tp('fullyPaid')}
                  </span>
                </label>
              ) : null}
              {paymentMethod === 'borrow' ? (
                <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
                  {tp('borrowNote')}
                </p>
              ) : null}
              {paymentMethod === 'razorpay' ? (
                <p style={{ margin: 0, fontSize: 13, color: '#1d4ed8' }}>
                  {tp('razorpayNote')}
                </p>
              ) : null}
              {paymentMethod === 'cashfree' ? (
                <p style={{ margin: 0, fontSize: 13, color: '#1d4ed8' }}>
                  {tp('cashfreeNote')}
                </p>
              ) : null}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
              {isPurchaseOrder
                ? tp('noPaymentPurchaseOrder')
                : isSaleOrder
                  ? tp('noPaymentSaleOrder')
                  : tp('noPaymentChallan')}
            </p>
          )}
        </Card>

        <Card>
          <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
            <strong>{isChallan ? tp('challanSummary') : tp('billSummary')}</strong>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{tp('items')}</span>
              <span>{money(totals.merchandiseGross)}</span>
            </div>
            {totals.lineDiscountTotal > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{tp('productDiscounts')}</span>
                <span>-{money(totals.lineDiscountTotal)}</span>
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{tp('subtotal')}</span>
              <span>{money(totals.merchandiseAfterLineDiscount)}</span>
            </div>
            {totals.billDiscountAmount > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{tp('billDiscount')}</span>
                <span>-{money(totals.billDiscountAmount)}</span>
              </div>
            ) : null}
            {totals.loyaltyDiscountAmount > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{tp('rewardPoints')}</span>
                <span>-{money(totals.loyaltyDiscountAmount)}</span>
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{tp('taxable')}</span>
              <span>{money(totals.subtotal)}</span>
            </div>
            {totals.taxTotal > 0 ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{tp('cgst')}</span>
                  <span>{money(Math.round((totals.taxTotal / 2) * 100) / 100)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{tp('sgst')}</span>
                  <span>{money(totals.taxTotal - Math.round((totals.taxTotal / 2) * 100) / 100)}</span>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{tp('tax')}</span>
                <span>{money(totals.taxTotal)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18 }}>
              <span>{tp('total')}</span>
              <span>{money(payableAfterLoyalty)}</span>
            </div>
            {!isBooksDocument && tillPayment ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{tp('received')}</span>
                  <span>{money(receivedAmount)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: balanceDue > 0 ? 700 : 500,
                    color: balanceDue > 0 ? '#b45309' : undefined,
                  }}
                >
                  <span>{tp('balanceDue')}</span>
                  <span>{money(balanceDue)}</span>
                </div>
              </>
            ) : null}
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={() => void checkout()}
            disabled={!basket.length || createOrder.isPending || createDocument.isPending || updateDocument.isPending}
          >
            {createDocument.isPending || updateDocument.isPending
              ? tp('saving')
              : createOrder.isPending
                ? tp('creatingBill')
                : isChallan
                  ? tp(editDocumentId ? 'updateChallan' : 'saveChallan', { amount: money(totals.payable) })
                  : isSaleOrder
                    ? tp(editDocumentId ? 'updateSaleOrder' : 'saveSaleOrder', { amount: money(totals.payable) })
                    : isPurchaseOrder
                      ? tp(editDocumentId ? 'updatePurchaseOrder' : 'savePurchaseOrder', {
                          amount: money(totals.payable),
                        })
                      : paymentMethod === 'razorpay'
                        ? tp('payRazorpay', { amount: money(payableAfterLoyalty) })
                        : paymentMethod === 'cashfree'
                          ? tp('payCashfree', { amount: money(payableAfterLoyalty) })
                          : balanceDue > 0
                            ? tp('createBillPartial', { paid: money(receivedAmount), due: money(balanceDue) })
                            : tp('createBill', { amount: money(payableAfterLoyalty) })}
          </Button>
        </Card>
      </div>
      </div>
      {paymentSheet ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tp('onlinePaymentStatus')}
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
                ? tp('paymentReceived')
                : paymentSheet.status === 'failed'
                  ? tp('paymentFailed')
                  : tp('waitingForPayment')}
            </h2>
            <p style={{ margin: '0 0 4px', color: '#6b7280' }}>{tp('billNumber', { number: paymentSheet.orderNumber })}</p>
            <strong style={{ display: 'block', fontSize: 28, margin: '12px 0 20px' }}>
              {money(paymentSheet.amount)}
            </strong>
            {paymentSheet.status !== 'paid' ? (
              <p style={{ color: '#6b7280' }}>
                {tp('completeRazorpay')}
              </p>
            ) : null}
            <Button
              type="button"
              variant={paymentSheet.status === 'paid' ? 'primary' : 'neutral'}
              onClick={() => setPaymentSheet(null)}
            >
              {paymentSheet.status === 'paid' ? tp('done') : tp('closeKeepUnpaid')}
            </Button>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
