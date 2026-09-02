import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Customer, ShopCashAccount, ShopProduct, ShopSupplier } from '@ie-orbit/sdk';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { DesktopPage } from '../../components/DesktopPage';
import { DateField } from '../../components/DateField';
import { SelectField } from '../../components/SelectField';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { shopListRefreshControl } from './shopRefreshControl';
import { computePosTotals, isProductTaxInclusive, type DiscountType } from './posPricing';
import {
  clearPosBillKeepCustomer,
  readPosSession,
  takePosPendingAddCode,
  takePosPendingAddProductId,
  writePosSession,
} from './posSession';
import { normalizeGstin, validateGstin } from '../../utils/gstin';
import { getApiErrorMessage } from '../../utils/format';
import { hasShopie } from '../../utils/products';
import { maxRedeemablePoints, readLoyaltyPrefs, redeemDiscountAmount } from '../../utils/loyalty';

type BasketLine = {
  product: ShopProduct;
  quantity: number;
  barcode_scanned?: string;
  discountType: DiscountType;
  discountValue: number;
};

type PaymentMethod = 'cash' | 'upi' | 'card' | 'borrow';
type PosMode =
  | 'sale'
  | 'purchase'
  | 'quotation'
  | 'credit_note'
  | 'debit_note'
  | 'sale_order'
  | 'purchase_order'
  | 'delivery_challan';
type Props = NativeStackScreenProps<RootStackParamList, 'ShopPos'>;

function resolvePosMode(value?: string | null): PosMode {
  if (
    value === 'purchase' ||
    value === 'quotation' ||
    value === 'credit_note' ||
    value === 'debit_note' ||
    value === 'sale_order' ||
    value === 'purchase_order' ||
    value === 'delivery_challan'
  ) {
    return value;
  }
  return 'sale';
}

function modeTitle(mode: PosMode) {
  if (mode === 'purchase') return 'Purchase';
  if (mode === 'quotation') return 'New quotation';
  if (mode === 'credit_note') return 'Credit note';
  if (mode === 'debit_note') return 'Debit note';
  if (mode === 'sale_order') return 'New sale order';
  if (mode === 'purchase_order') return 'New purchase order';
  if (mode === 'delivery_challan') return 'New delivery challan';
  return 'Sale';
}

export function ShopPosScreen() {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Props['route']>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId, activeBusiness } = useWorkspace();
  const showGstFields = hasShopie(activeBusiness?.product_subscriptions);
  const mode = resolvePosMode(route.params?.mode);
  const isPurchase = mode === 'purchase';
  const isQuotation = mode === 'quotation';
  const isCreditNote = mode === 'credit_note';
  const isDebitNote = mode === 'debit_note';
  const isSaleOrder = mode === 'sale_order';
  const isPurchaseOrder = mode === 'purchase_order';
  const isChallan = mode === 'delivery_challan';
  const isNote = isCreditNote || isDebitNote;
  const isOrder = isSaleOrder || isPurchaseOrder;
  const isDocument = isQuotation || isNote || isOrder || isChallan;
  const usesSupplier = isPurchase || isDebitNote || isPurchaseOrder;
  const skipSaleSession = isDocument || isPurchase;
  const initialSession = readPosSession();
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<ShopSupplier[]>([]);
  const [cashAccounts, setCashAccounts] = useState<ShopCashAccount[]>([]);
  const [basket, setBasket] = useState<BasketLine[]>(() => (skipSaleSession ? [] : initialSession.basket));
  const [customerId, setCustomerId] = useState(
    () =>
      initialSession.customerId ||
      route.params?.selectedCustomerId ||
      route.params?.selectCustomerId ||
      '',
  );
  const [supplierId, setSupplierId] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [scan, setScan] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [billDiscountType, setBillDiscountType] = useState<DiscountType>(
    () => (skipSaleSession ? '' : initialSession.billDiscountType),
  );
  const [billDiscountValue, setBillDiscountValue] = useState(
    () => (skipSaleSession ? '0' : initialSession.billDiscountValue),
  );
  const [partyGstin, setPartyGstin] = useState(() =>
    skipSaleSession ? '' : initialSession.partyGstin ?? '',
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    () => (isPurchase ? 'borrow' : initialSession.paymentMethod),
  );
  const [validUntil, setValidUntil] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);

  const catalogLoadedRef = React.useRef(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: modeTitle(mode),
    });
  }, [navigation, mode]);

  const loadCatalog = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    try {
      const [productsRes, customersRes, suppliersRes, accountsRes] = await Promise.all([
        client.shop.listProducts({ business_id: businessId, status: 'active' }),
        client.customers.list({ business: businessId }),
        usesSupplier
          ? client.shop.listSuppliers({ business_id: businessId })
          : Promise.resolve({ data: [] as ShopSupplier[] }),
        isPurchase
          ? client.shop.listCashAccounts({ business_id: businessId })
          : Promise.resolve({ data: [] as ShopCashAccount[] }),
      ]);
      setProducts(productsRes.data);
      setCustomers(customersRes.data ?? []);
      setSuppliers(suppliersRes.data ?? []);
      const accounts = accountsRes.data ?? [];
      setCashAccounts(accounts);
      setCashAccountId((current) => current || accounts[0]?.id || '');
      catalogLoadedRef.current = true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, [businessId, client, isPurchase, usesSupplier]);

  const updateCustomerId = useCallback(
    (id: string) => {
      setCustomerId(id);
      setPointsToRedeem(0);
      const customer = customers.find((row) => row.id === id);
      const nextGstin = showGstFields ? normalizeGstin(customer?.gstin || '') : '';
      setPartyGstin(nextGstin);
      writePosSession({ customerId: id, partyGstin: nextGstin });
    },
    [customers, showGstFields],
  );

  const updateSupplierId = useCallback(
    (id: string) => {
      setSupplierId(id);
      const supplier = suppliers.find((row) => row.id === id);
      setPartyGstin(normalizeGstin(supplier?.gstin || ''));
    },
    [suppliers],
  );

  const updatePartyGstin = useCallback(
    (value: string) => {
      const next = normalizeGstin(value);
      setPartyGstin(next);
      if (!skipSaleSession) {
        writePosSession({ partyGstin: next });
      }
    },
    [skipSaleSession],
  );

  useEffect(() => {
    if (!showGstFields || !customerId || usesSupplier || !customers.length) return;
    const customer = customers.find((row) => row.id === customerId);
    const fromCustomer = normalizeGstin(customer?.gstin || '');
    if (!fromCustomer) return;
    setPartyGstin((current) => {
      if (current) return current;
      if (!skipSaleSession) writePosSession({ partyGstin: fromCustomer });
      return fromCustomer;
    });
  }, [customerId, customers, showGstFields, skipSaleSession, usesSupplier]);

  const syncBasket = useCallback(
    (next: BasketLine[] | ((current: BasketLine[]) => BasketLine[])) => {
      setBasket((current) => {
        const resolved = typeof next === 'function' ? next(current) : next;
        if (!skipSaleSession) {
          writePosSession({ basket: resolved });
        }
        return resolved;
      });
    },
    [skipSaleSession],
  );

  const resolveCode = useCallback(
    async (code: string) => {
      if (!client || !businessId) return;
      const trimmed = code.trim();
      if (!trimmed) return;
      setBusy(true);
      setMessage(null);
      try {
        const response = await client.shop.lookupBarcode({
          business_id: businessId,
          code: trimmed,
        });
        syncBasket((current) => {
          const existing = current.find((line) => line.product.id === response.data.id);
          if (existing) {
            return current.map((line) =>
              line.product.id === response.data.id
                ? {
                    ...line,
                    quantity: line.quantity + 1,
                    barcode_scanned: trimmed || line.barcode_scanned,
                  }
                : line,
            );
          }
          return [
            ...current,
            {
              product: response.data,
              quantity: 1,
              barcode_scanned: trimmed,
              discountType: '',
              discountValue: 0,
            },
          ];
        });
        setScan('');
        setMessage(`Added ${response.data.name}`);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Barcode not found');
      } finally {
        setBusy(false);
      }
    },
    [businessId, client, syncBasket],
  );

  useFocusEffect(
    useCallback(() => {
      // Pull latest session written by scanner / add-product (do not write stale local state over it).
      if (!skipSaleSession) {
        const session = readPosSession();
        setCustomerId(session.customerId);
        setBasket(session.basket);
        setBillDiscountType(session.billDiscountType);
        setBillDiscountValue(session.billDiscountValue);
        setPartyGstin(session.partyGstin ?? '');
        setPaymentMethod(session.paymentMethod);
      }

      if (!catalogLoadedRef.current) {
        void loadCatalog();
      }

      const pendingCode = takePosPendingAddCode() || route.params?.addCode;
      if (pendingCode) {
        void resolveCode(pendingCode).finally(() => {
          if (route.params?.addCode) {
            navigation.setParams({ addCode: undefined });
          }
        });
      }

      const pendingProductId = takePosPendingAddProductId() || route.params?.addProductId;
      if (pendingProductId && client) {
        void (async () => {
          try {
            const response = await client.shop.getProduct(pendingProductId);
            syncBasket((current) => {
              const existing = current.find((line) => line.product.id === response.data.id);
              if (existing) {
                return current.map((line) =>
                  line.product.id === response.data.id
                    ? { ...line, quantity: line.quantity + 1 }
                    : line,
                );
              }
              return [
                ...current,
                {
                  product: response.data,
                  quantity: 1,
                  discountType: '',
                  discountValue: 0,
                },
              ];
            });
            setMessage(`Added ${response.data.name}`);
            await loadCatalog();
          } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Unable to load new product');
          } finally {
            if (route.params?.addProductId) {
              navigation.setParams({ addProductId: undefined });
            }
          }
        })();
      }

      const selectId = route.params?.selectCustomerId;
      if (selectId && !usesSupplier) {
        updateCustomerId(selectId);
        navigation.setParams({ selectCustomerId: undefined });
        void loadCatalog();
      }
    }, [
      client,
      loadCatalog,
      navigation,
      resolveCode,
      route.params?.addCode,
      route.params?.addProductId,
      route.params?.selectCustomerId,
      skipSaleSession,
      syncBasket,
      updateCustomerId,
      usesSupplier,
    ]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(loadCatalog);

  const customerOptions = useMemo(() => {
    const options = [
      { value: '', label: isCreditNote ? 'Select customer' : 'Walk-in customer' },
      ...customers.map((customer) => ({
        value: customer.id,
        label:
          customer.full_name ||
          customer.display_name ||
          [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
          customer.email ||
          customer.phone_number ||
          customer.id,
      })),
    ];
    if (customerId && !options.some((option) => option.value === customerId)) {
      options.push({ value: customerId, label: 'Selected customer' });
    }
    return options;
  }, [customerId, customers, isCreditNote]);

  const supplierOptions = useMemo(
    () => [
      { value: '', label: isPurchase ? 'No supplier' : 'Select supplier' },
      ...suppliers.map((supplier) => ({
        value: supplier.id,
        label: supplier.name || supplier.phone || supplier.gstin || supplier.id,
      })),
    ],
    [isPurchase, suppliers],
  );

  const cashAccountOptions = useMemo(
    () =>
      cashAccounts.map((account) => ({
        value: account.id,
        label: `${account.name} (${account.account_type})`,
      })),
    [cashAccounts],
  );

  const filteredProducts = useMemo(() => {
    const term = productQuery.trim().toLowerCase();
    if (!term) return products.slice(0, 60);
    return products
      .filter((product) =>
        [product.name, product.brand ?? '', product.sku ?? '', ...(product.barcodes ?? []).map((b) => b.code)]
          .join(' ')
          .toLowerCase()
          .includes(term),
      )
      .slice(0, 60);
  }, [productQuery, products]);

  const billGstinCheck = useMemo(() => validateGstin(partyGstin), [partyGstin]);

  const totals = useMemo(
    () =>
      computePosTotals(
        basket.map((line) => ({
          id: line.product.id,
          name: line.product.name,
          unitPrice: Number(line.product.price),
          taxRate: Number(line.product.gst_rate ?? line.product.tax_rate ?? 0),
          taxInclusive: isProductTaxInclusive(line.product),
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
    () => readLoyaltyPrefs((activeBusiness?.settings ?? undefined) as Record<string, unknown> | undefined),
    [activeBusiness?.settings],
  );
  const selectedPosCustomer = useMemo(
    () => customers.find((row) => row.id === customerId) ?? null,
    [customers, customerId],
  );
  const loyaltyMaxPoints = useMemo(() => {
    if (mode !== 'sale' || !customerId) return 0;
    return maxRedeemablePoints(
      totals.subtotal,
      loyaltyPrefs,
      Number(selectedPosCustomer?.loyalty_points ?? 0),
    );
  }, [mode, customerId, totals.subtotal, loyaltyPrefs, selectedPosCustomer?.loyalty_points]);
  const loyaltyDiscount = useMemo(
    () => redeemDiscountAmount(pointsToRedeem, loyaltyPrefs),
    [pointsToRedeem, loyaltyPrefs],
  );
  const payableAfterLoyalty = Math.max(0, totals.payable - loyaltyDiscount);

  useEffect(() => {
    if (pointsToRedeem > loyaltyMaxPoints) setPointsToRedeem(loyaltyMaxPoints);
  }, [loyaltyMaxPoints, pointsToRedeem]);

  function addProduct(product: ShopProduct, barcode?: string) {
    syncBasket((current) => {
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
        {
          product,
          quantity: 1,
          barcode_scanned: barcode,
          discountType: '',
          discountValue: 0,
        },
      ];
    });
    setProductPickerOpen(false);
    setProductQuery('');
  }

  function updateLine(productId: string, patch: Partial<BasketLine>) {
    syncBasket((current) =>
      current
        .map((line) => (line.product.id === productId ? { ...line, ...patch } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  function openAddProduct() {
    setProductPickerOpen(false);
    navigation.navigate('ShopProductAdd', { returnTo: 'pos' });
  }

  function openAddCustomer() {
    navigation.navigate('CustomerForm', { returnTo: 'pos' });
  }

  async function checkout() {
    if (!client || !businessId || !basket.length) return;
    if (mode === 'sale' && paymentMethod === 'borrow' && !customerId) {
      const text = 'Select a customer for borrow / credit bills.';
      setMessage(text);
      toast.push(text, 'error');
      return;
    }
    if (isCreditNote && !customerId) {
      const text = 'Select a customer for the credit note.';
      setMessage(text);
      toast.push(text, 'error');
      return;
    }
    if (isDebitNote && !supplierId) {
      const text = 'Select a supplier for the debit note.';
      setMessage(text);
      toast.push(text, 'error');
      return;
    }
    if (isPurchaseOrder && !supplierId) {
      const text = 'Select a supplier for the purchase order.';
      setMessage(text);
      toast.push(text, 'error');
      return;
    }
    if (isPurchase && paymentMethod !== 'borrow' && !cashAccountId) {
      const text = 'Select a cash/bank account for the payment.';
      setMessage(text);
      toast.push(text, 'error');
      return;
    }
    const gstinResult = showGstFields ? validateGstin(partyGstin) : { ok: true as const, gstin: '' };
    if (!gstinResult.ok) {
      setMessage(gstinResult.message);
      toast.push(gstinResult.message, 'error');
      return;
    }
    const resolvedGstin = gstinResult.gstin;

    setBusy(true);
    setMessage(null);
    try {
      const taxLines = basket.map((line) => ({
        product_id: line.product.id,
        name: line.product.name,
        qty: line.quantity,
        rate: line.product.price,
        gst_rate: Number(line.product.gst_rate ?? line.product.tax_rate ?? 0),
        tax_inclusive: isProductTaxInclusive(line.product),
      }));
      const partyMeta = resolvedGstin
        ? usesSupplier
          ? { supplier_gstin: resolvedGstin }
          : { customer_gstin: resolvedGstin }
        : {};

      if (isOrder || isChallan) {
        const gstinNote = resolvedGstin
          ? `${usesSupplier ? 'Supplier' : 'Customer'} GSTIN ${resolvedGstin}`
          : '';
        const docType = isPurchaseOrder
          ? 'purchase_order'
          : isChallan
            ? 'delivery_challan'
            : 'sale_order';
        const sourceNote = isPurchaseOrder
          ? 'Purchase order from Sale counter'
          : isChallan
            ? 'Delivery challan from Sale counter'
            : 'Sale order from Sale counter';
        const response = await client.shop.createDocument({
          business_id: businessId,
          doc_type: docType,
          customer_id: isPurchaseOrder ? null : customerId || null,
          supplier_id: isPurchaseOrder ? supplierId : null,
          notes: [sourceNote, gstinNote].filter(Boolean).join(' · '),
          lines: basket.map((line) => ({
            product_id: line.product.id,
            quantity: line.quantity,
            unit_price: line.product.price,
            tax_rate: Number(line.product.gst_rate ?? line.product.tax_rate ?? 0),
          })),
        });
        setBasket([]);
        setBillDiscountType('');
        setBillDiscountValue('0');
        setSupplierId('');
        const label = isPurchaseOrder ? 'Purchase order' : isChallan ? 'Delivery challan' : 'Sale order';
        toast.push(
          `${label} ${response.data.document_number} created · ${totals.payable.toFixed(2)}`,
          'success',
        );
        navigation.navigate('ShopBooksDocuments', { docType });
        return;
      }

      if (isQuotation) {
        const response = await client.shop.createQuotation({
          business_id: businessId,
          customer_id: customerId || null,
          valid_until: validUntil.trim() || null,
          notes: 'Quotation from Sale counter',
          lines: basket.map((line) => ({
            product_id: line.product.id,
            quantity: line.quantity,
            unit_price: line.product.price,
            tax_rate: Number(line.product.gst_rate ?? line.product.tax_rate ?? 0),
          })),
        });
        setBasket([]);
        setBillDiscountType('');
        setBillDiscountValue('0');
        setValidUntil('');
        toast.push(
          `Quotation ${response.data.quotation_number} created · ${totals.payable.toFixed(2)}`,
          'success',
        );
        navigation.navigate('ShopBooksQuotations');
        return;
      }

      if (isNote) {
        const response = await client.shop.createVoucher({
          voucher_type: mode,
          business_id: businessId,
          customer_id: isCreditNote ? customerId : null,
          supplier_id: isDebitNote ? supplierId : null,
          lines: taxLines,
          notes: isCreditNote ? 'Credit note from Sale counter' : 'Debit note from Sale counter',
          metadata: partyMeta,
        });
        setBasket([]);
        setBillDiscountType('');
        setBillDiscountValue('0');
        setSupplierId('');
        if (isDebitNote) setPartyGstin('');
        toast.push(
          `${isCreditNote ? 'Credit' : 'Debit'} note ${response.data.voucher_number} recorded · ${totals.payable.toFixed(2)}`,
          'success',
        );
        navigation.navigate('ShopBooksNotes');
        return;
      }

      if (isPurchase) {
        const paidNow = paymentMethod !== 'borrow';
        const response = await client.shop.createVoucher({
          voucher_type: 'purchase',
          business_id: businessId,
          supplier_id: supplierId || null,
          lines: taxLines,
          amount_paid: paidNow ? totals.payable : 0,
          cash_account_id: paidNow ? cashAccountId || undefined : undefined,
          notes: paidNow
            ? `Purchase · ${paymentMethod.toUpperCase()}`
            : 'Purchase · Unpaid (due)',
          metadata: partyMeta,
        });
        setBasket([]);
        setBillDiscountType('');
        setBillDiscountValue('0');
        setSupplierId('');
        setPartyGstin('');
        toast.push(
          `Purchase ${response.data.voucher_number} recorded${paidNow ? '' : ' · Due'} · ${totals.payable.toFixed(2)}`,
          'success',
        );
        navigation.navigate('ShopBooksPurchase');
        return;
      }

      const response = await client.shop.createOrder({
        business_id: businessId,
        customer_id: customerId || null,
        ...(resolvedGstin ? { customer_gstin: resolvedGstin } : {}),
        fulfillment_mode: 'pos',
        confirm: true,
        payment_method: paymentMethod,
        bill_discount_type: billDiscountType,
        bill_discount_value: Number(billDiscountValue) || 0,
        points_to_redeem: customerId && pointsToRedeem > 0 ? pointsToRedeem : undefined,
        notes:
          paymentMethod === 'borrow'
            ? 'Sale · BORROW (due)'
            : `Sale · ${paymentMethod.toUpperCase()}`,
        lines: basket.map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
          unit_price: line.product.price,
          tax_rate: Number(line.product.gst_rate ?? line.product.tax_rate ?? 0),
          tax_inclusive: isProductTaxInclusive(line.product),
          barcode_scanned: line.barcode_scanned,
          discount_type: line.discountType,
          discount_value: line.discountValue,
        })),
      });
      setBasket([]);
      setBillDiscountType('');
      setBillDiscountValue('0');
      setPointsToRedeem(0);
      clearPosBillKeepCustomer();
      writePosSession({
        customerId,
        basket: [],
        billDiscountType: '',
        billDiscountValue: '0',
        partyGstin: resolvedGstin,
        paymentMethod,
      });
      const dueLabel = paymentMethod === 'borrow' ? ' · Due' : '';
      const gstLabel = resolvedGstin ? ' · B2B' : '';
      toast.push(
        `Sale invoice ${response.data.order_number} posted to Books${dueLabel}${gstLabel} · ${totals.payable.toFixed(2)}`,
        'success',
      );
      setMessage(`Sale invoice ${response.data.order_number} posted to Books`);
      navigation.navigate('ShopBooksSale');
    } catch (err) {
      const fallback =
        isOrder || isChallan
          ? isPurchaseOrder
            ? 'Unable to create purchase order'
            : isChallan
              ? 'Unable to create delivery challan'
              : 'Unable to create sale order'
          : isQuotation
            ? 'Unable to create quotation'
            : isNote
              ? 'Unable to record note'
              : isPurchase
                ? 'Unable to record purchase'
                : 'Unable to create bill';
      const text = getApiErrorMessage(err, fallback);
      setMessage(text);
      toast.push(text, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DesktopPage maxWidth={960}>
    <View style={[styles.screen, { paddingTop: spacing.md }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={shopListRefreshControl(refreshing, onRefresh)}
      >
        <View style={styles.customerRow}>
          {usesSupplier ? (
            <View style={styles.customerField}>
              <SelectField
                label="Supplier"
                value={supplierId}
                options={supplierOptions}
                onChange={updateSupplierId}
                searchable
                placeholder={isPurchase ? 'No supplier' : 'Select supplier'}
              />
            </View>
          ) : (
            <>
              <View style={styles.customerField}>
                <SelectField
                  label={isCreditNote ? 'Customer' : 'Customer'}
                  value={customerId}
                  options={customerOptions}
                  onChange={updateCustomerId}
                  searchable
                  placeholder={
                    isCreditNote
                      ? 'Select customer'
                      : isSaleOrder || isChallan
                        ? 'Customer (optional)'
                        : 'Walk-in customer'
                  }
                />
              </View>
              {!isDocument || isQuotation || isCreditNote || isSaleOrder || isChallan ? (
                <Pressable
                  style={styles.sideAddBtn}
                  onPress={openAddCustomer}
                  accessibilityLabel="Add customer"
                >
                  <Feather name="user-plus" size={20} color="#fff" />
                </Pressable>
              ) : null}
            </>
          )}
        </View>

        {mode === 'sale' && customerId && loyaltyPrefs.enabled && loyaltyMaxPoints >= loyaltyPrefs.min_redeem_points ? (
          <View style={styles.loyaltyBox}>
            <Text style={styles.section}>Reward points</Text>
            <Text style={styles.meta}>
              Balance {selectedPosCustomer?.loyalty_points ?? 0} pts · {loyaltyPrefs.points_per_currency_unit} pts = ₹1
            </Text>
            <View style={styles.redeemRow}>
              <Pressable
                style={styles.redeemBtn}
                onPress={() =>
                  setPointsToRedeem((current) => {
                    if (current <= 0) return 0;
                    const next = current - Math.max(1, loyaltyPrefs.min_redeem_points);
                    return next < loyaltyPrefs.min_redeem_points ? 0 : next;
                  })
                }
              >
                <Feather name="minus" size={16} color={colors.foreground} />
              </Pressable>
              <Text style={styles.redeemValue}>{pointsToRedeem} pts</Text>
              <Pressable
                style={styles.redeemBtn}
                onPress={() =>
                  setPointsToRedeem((current) => {
                    const stepAmount = Math.max(1, loyaltyPrefs.min_redeem_points);
                    if (current <= 0) return Math.min(loyaltyMaxPoints, stepAmount);
                    return Math.min(loyaltyMaxPoints, current + stepAmount);
                  })
                }
              >
                <Feather name="plus" size={16} color={colors.foreground} />
              </Pressable>
            </View>
            {pointsToRedeem > 0 ? (
              <Text style={styles.meta}>Saves ₹{loyaltyDiscount.toFixed(2)}</Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.section}>Add products</Text>
        <View style={styles.scanRow}>
          <TextInput
            style={styles.input}
            value={scan}
            onChangeText={setScan}
            onSubmitEditing={() => void resolveCode(scan)}
            placeholder="Scan / type barcode"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            returnKeyType="done"
          />
          <Pressable
            style={styles.iconBtn}
            onPress={() => void resolveCode(scan)}
            disabled={busy}
            accessibilityLabel="Add scanned barcode"
          >
            <Feather name="check" size={20} color="#fff" />
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={() => navigation.navigate('BarcodeScanner', { target: 'pos' })}
            accessibilityLabel="Scan with camera"
          >
            <Feather name="camera" size={20} color="#fff" />
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={() => setProductPickerOpen(true)}
            accessibilityLabel="Search products"
          >
            <Feather name="search" size={20} color="#fff" />
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={openAddProduct}
            accessibilityLabel="Add new product"
          >
            <Feather name="plus" size={20} color="#fff" />
          </Pressable>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}

        <Text style={styles.section}>
          {isSaleOrder
            ? `Sale order (${basket.length} items)`
            : isPurchaseOrder
              ? `Purchase order (${basket.length} items)`
              : isQuotation
                ? `Estimate (${basket.length} items)`
                : isPurchase
                  ? `Purchase (${basket.length} items)`
                  : isCreditNote
                    ? `Credit note (${basket.length} items)`
                    : isDebitNote
                      ? `Debit note (${basket.length} items)`
                      : `Bill (${basket.length} items)`}
        </Text>
        {!basket.length ? (
          <View style={styles.emptyBill}>
            <Text style={styles.meta}>
              {isSaleOrder
                ? 'Scan or search products to build the sale order. Stock and payment wait until you convert it.'
                : isPurchaseOrder
                  ? 'Scan or search products to build the purchase order. Stock waits until you convert it.'
                  : isQuotation
                    ? 'Scan or search products to build the quotation.'
                    : isPurchase
                      ? 'Scan or search products from the supplier bill.'
                      : isNote
                        ? 'Scan or search products for this adjustment note.'
                        : 'Scan or search products to start billing.'}
            </Text>
          </View>
        ) : (
          basket.map((line) => {
            const priced = totals.lines.find((row) => row.id === line.product.id);
            return (
              <View key={line.product.id} style={styles.lineCard}>
                <View style={styles.lineHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{line.product.name}</Text>
                    <Text style={styles.meta}>
                      {Number(line.product.price).toFixed(2)} · GST{' '}
                      {Number(line.product.gst_rate ?? line.product.tax_rate ?? 0)}%
                      {isProductTaxInclusive(line.product) ? ' incl.' : ' excl.'}
                      {priced && priced.discountAmount > 0
                        ? ` · disc. -${priced.discountAmount.toFixed(2)}`
                        : ''}
                    </Text>
                  </View>
                  <Pressable onPress={() => updateLine(line.product.id, { quantity: 0 })}>
                    <Feather name="trash-2" size={18} color={colors.destructive} />
                  </Pressable>
                </View>
                <View style={styles.qtyRow}>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => updateLine(line.product.id, { quantity: line.quantity - 1 })}
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.qty}>{line.quantity}</Text>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => updateLine(line.product.id, { quantity: line.quantity + 1 })}
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                  <Text style={styles.lineTotal}>{priced?.total.toFixed(2) ?? '0.00'}</Text>
                </View>
                <View style={styles.discountRow}>
                  <Pressable
                    style={[styles.chip, line.discountType === '' && styles.chipActive]}
                    onPress={() => updateLine(line.product.id, { discountType: '', discountValue: 0 })}
                  >
                    <Text style={styles.chipText}>No disc.</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.chip, line.discountType === 'percent' && styles.chipActive]}
                    onPress={() =>
                      updateLine(line.product.id, {
                        discountType: 'percent',
                        discountValue: line.discountValue || 5,
                      })
                    }
                  >
                    <Text style={styles.chipText}>%</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.chip, line.discountType === 'amount' && styles.chipActive]}
                    onPress={() =>
                      updateLine(line.product.id, {
                        discountType: 'amount',
                        discountValue: line.discountValue || 10,
                      })
                    }
                  >
                    <Text style={styles.chipText}>₹</Text>
                  </Pressable>
                  {line.discountType ? (
                    <TextInput
                      style={[styles.input, styles.discountInput]}
                      value={String(line.discountValue || '')}
                      onChangeText={(value) =>
                        updateLine(line.product.id, {
                          discountValue: Number(value.replace(/[^0-9.]/g, '')) || 0,
                        })
                      }
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.mutedForeground}
                    />
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        <Text style={styles.section}>Bill discount</Text>
        <View style={styles.discountRow}>
          {(
            [
              { value: '', label: 'None' },
              { value: 'percent', label: '%' },
              { value: 'amount', label: '₹' },
            ] as const
          ).map((option) => (
            <Pressable
              key={option.value || 'none'}
              style={[styles.chip, billDiscountType === option.value && styles.chipActive]}
              onPress={() => {
                setBillDiscountType(option.value);
                if (!option.value) setBillDiscountValue('0');
                writePosSession({
                  billDiscountType: option.value,
                  billDiscountValue: option.value ? billDiscountValue : '0',
                });
              }}
            >
              <Text style={styles.chipText}>{option.label}</Text>
            </Pressable>
          ))}
          {billDiscountType ? (
            <TextInput
              style={[styles.input, styles.discountInput]}
              value={billDiscountValue}
              onChangeText={(value) => {
                setBillDiscountValue(value);
                writePosSession({ billDiscountValue: value });
              }}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
            />
          ) : null}
        </View>

        {showGstFields ? (
          <>
            <Text style={styles.section}>{usesSupplier ? 'Supplier GSTIN' : 'Customer GSTIN'}</Text>
            <TextInput
              style={[styles.input, partyGstin.length > 0 && !billGstinCheck.ok && styles.inputError]}
              value={partyGstin}
              onChangeText={updatePartyGstin}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={15}
              placeholder="29AABCU9603R1ZJ (optional for B2C)"
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={[styles.hint, partyGstin.length > 0 && !billGstinCheck.ok && styles.hintError]}>
              {partyGstin.length === 0
                ? 'Leave blank for B2C. Enter a valid 15-character GSTIN for a proper B2B GST invoice.'
                : !billGstinCheck.ok
                  ? billGstinCheck.message
                  : 'Valid GSTIN — this bill will be posted as B2B for GSTR-1 / e-invoice.'}
            </Text>
          </>
        ) : null}

        {isDocument ? (
          isQuotation ? (
            <DateField
              label="Valid until"
              value={validUntil}
              onChange={setValidUntil}
              helperText="Optional expiry date for this quotation."
            />
          ) : isOrder || isChallan ? (
            <Text style={styles.hint}>
              {isPurchaseOrder
                ? 'No payment and no stock change yet. Convert this purchase order to a purchase bill when goods arrive.'
                : isChallan
                  ? 'No invoice and no payment. Dispatch this challan when goods leave — stock is deducted then.'
                  : 'No payment and no stock change yet. Convert this sale order to a sale invoice when you deliver.'}
            </Text>
          ) : (
            <Text style={styles.hint}>
              {isCreditNote
                ? 'Credit note reduces what the customer owes (returns / adjustments).'
                : 'Debit note reduces what you owe the supplier (returns / adjustments).'}
            </Text>
          )
        ) : (
          <>
            <Text style={styles.section}>Payment</Text>
            <View style={styles.discountRow}>
              {(
                [
                  { value: 'cash', label: 'Cash' },
                  { value: 'upi', label: 'UPI' },
                  { value: 'card', label: 'Card' },
                  { value: 'borrow', label: isPurchase ? 'Unpaid' : 'Borrow' },
                ] as const
              ).map((method) => (
                <Pressable
                  key={method.value}
                  style={[styles.chip, paymentMethod === method.value && styles.chipActive]}
                  onPress={() => {
                    setPaymentMethod(method.value);
                    if (!isPurchase) {
                      writePosSession({ paymentMethod: method.value });
                    }
                  }}
                >
                  <Text style={styles.chipText}>{method.label}</Text>
                </Pressable>
              ))}
            </View>
            {isPurchase && paymentMethod !== 'borrow' ? (
              <SelectField
                label="Paid from"
                value={cashAccountId}
                options={cashAccountOptions}
                onChange={setCashAccountId}
                placeholder="Select account"
              />
            ) : null}
            {paymentMethod === 'borrow' ? (
              <Text style={styles.hint}>
                {isPurchase
                  ? 'Unpaid: record the supplier bill now and pay later from Cash / Parties.'
                  : 'Borrow / credit: customer takes goods now and pays later. A customer is required (not Walk-in).'}
              </Text>
            ) : null}
          </>
        )}

        <View style={styles.totalsCard}>
          <Text style={styles.summaryTitle}>
            {isSaleOrder
              ? 'Sale order summary'
              : isPurchaseOrder
                ? 'Purchase order summary'
                : isChallan
                  ? 'Delivery challan summary'
                  : isQuotation
                  ? 'Estimate summary'
                  : isPurchase
                    ? 'Purchase summary'
                    : isCreditNote
                      ? 'Credit note summary'
                      : isDebitNote
                        ? 'Debit note summary'
                        : 'Bill summary'}
          </Text>
          <View style={styles.totalRow}>
            <Text style={styles.meta}>Items</Text>
            <Text style={styles.meta}>{totals.merchandiseGross.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.meta}>Product discounts</Text>
            <Text style={styles.meta}>-{totals.lineDiscountTotal.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.meta}>Bill discount</Text>
            <Text style={styles.meta}>-{totals.billDiscountAmount.toFixed(2)}</Text>
          </View>
          {loyaltyDiscount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.meta}>Reward points</Text>
              <Text style={styles.meta}>-{loyaltyDiscount.toFixed(2)}</Text>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.meta}>
              GST{partyGstin && billGstinCheck.ok ? ' · B2B' : ''}
            </Text>
            <Text style={styles.meta}>{totals.taxTotal.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.payableLabel}>
              {isQuotation || isNote || isOrder || isChallan
                ? 'Total'
                : paymentMethod === 'borrow'
                  ? 'Amount due'
                  : isPurchase
                    ? 'Amount to pay'
                    : 'Payable'}
            </Text>
            <Text style={styles.payableValue}>
              {(mode === 'sale' ? payableAfterLoyalty : totals.payable).toFixed(2)}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.chargeBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Pressable
          style={[styles.checkout, (!basket.length || busy) && styles.checkoutDisabled]}
          disabled={!basket.length || busy}
          onPress={() => void checkout()}
        >
          <Text style={styles.checkoutText}>
            {busy
              ? isSaleOrder
                ? 'Saving sale order…'
                : isPurchaseOrder
                  ? 'Saving purchase order…'
                  : isChallan
                    ? 'Saving challan…'
                    : isQuotation
                    ? 'Saving quotation…'
                    : isNote
                      ? 'Saving note…'
                      : isPurchase
                        ? 'Recording purchase…'
                        : 'Creating bill…'
              : isSaleOrder
                ? `Save sale order · ${totals.payable.toFixed(2)}`
                : isPurchaseOrder
                  ? `Save purchase order · ${totals.payable.toFixed(2)}`
                  : isChallan
                    ? `Save challan · ${totals.payable.toFixed(2)}`
                    : isQuotation
                    ? `Save quotation · ${totals.payable.toFixed(2)}`
                    : isCreditNote
                      ? `Save credit note · ${totals.payable.toFixed(2)}`
                      : isDebitNote
                        ? `Save debit note · ${totals.payable.toFixed(2)}`
                        : isPurchase
                          ? paymentMethod === 'borrow'
                            ? `Record purchase · Due ${totals.payable.toFixed(2)}`
                            : `Record purchase · ${totals.payable.toFixed(2)}`
                          : paymentMethod === 'borrow'
                            ? `Save bill · Due ${payableAfterLoyalty.toFixed(2)}`
                            : `Save & print · ${payableAfterLoyalty.toFixed(2)}`}
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={productPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setProductPickerOpen(false)}
      >
        <View style={[styles.overlay, isDesktop && styles.overlayDesktop]}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setProductPickerOpen(false)}
            accessibilityLabel="Close"
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[
              styles.sheet,
              isDesktop && styles.sheetDesktop,
              { paddingBottom: Math.max(insets.bottom, spacing.lg) },
            ]}
          >
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderCopy}>
                <Text style={styles.sheetTitle}>Find product</Text>
                <Text style={styles.sheetSubtitle}>
                  {filteredProducts.length} match{filteredProducts.length === 1 ? '' : 'es'}
                </Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => setProductPickerOpen(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={styles.searchWrap}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                value={productQuery}
                onChangeText={setProductQuery}
                placeholder="Search name, brand, SKU, barcode"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="while-editing"
                style={styles.searchInput}
              />
              {productQuery.length > 0 && Platform.OS !== 'ios' ? (
                <Pressable onPress={() => setProductQuery('')} hitSlop={8}>
                  <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
            </View>

            <FlatList
              data={filteredProducts}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              contentContainerStyle={
                filteredProducts.length === 0 ? styles.listEmptyContent : styles.listContent
              }
              renderItem={({ item }) => (
                <Pressable style={styles.productRow} onPress={() => addProduct(item)}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>
                    {item.price} · stock {item.stock_on_hand}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.emptySearch}>
                  <Text style={styles.meta}>No matching products.</Text>
                </View>
              }
            />

            <Pressable style={styles.createProductBtn} onPress={openAddProduct}>
              <Feather name="plus" size={18} color="#fff" />
              <Text style={styles.createProductText}>Add new product</Text>
            </Pressable>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  scroll: { flex: 1 },
  customerRow: {    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  customerField: { flex: 1 },
  loyaltyBox: { marginTop: spacing.sm, gap: 6 },
  redeemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  redeemBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  redeemValue: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.foreground, minWidth: 72, textAlign: 'center' },
  sideAddBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  section: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.foreground,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  scanRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: spacing.sm },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  inputError: {
    borderColor: colors.destructive,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: { color: colors.mutedForeground, marginBottom: spacing.sm },
  hint: {
    marginTop: spacing.sm,
    color: colors.mutedForeground,
    fontSize: 13,
    lineHeight: 18,
  },
  hintError: {
    color: colors.destructive,
  },
  summaryTitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.foreground,
    marginBottom: 4,
  },
  emptyBill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    backgroundColor: colors.card,
  },
  lineCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
    marginBottom: spacing.sm,
    gap: 8,
  },
  lineHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.foreground },
  meta: { marginTop: 2, color: colors.mutedForeground, fontSize: 13 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  qtyBtnText: { fontSize: 20, color: colors.primary, fontWeight: '600' },
  qty: { minWidth: 28, textAlign: 'center', color: colors.foreground, fontWeight: '600' },
  lineTotal: { marginLeft: 'auto', fontWeight: '700', color: colors.foreground },
  discountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.tint },
  chipText: { color: colors.foreground, fontSize: 13, fontWeight: '600' },
  discountInput: { flexGrow: 0, flexBasis: 90, minWidth: 90 },
  totalsCard: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.tint,
    gap: 8,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  payableLabel: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.foreground },
  payableValue: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.primary },
  chargeBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  checkout: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
  },
  checkoutDisabled: { opacity: 0.5 },
  checkoutText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  overlayDesktop: { justifyContent: 'center', alignItems: 'center', padding: spacing.xxl },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.sheet,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
    height: '72%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    shadowColor: '#142033',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
  sheetDesktop: {
    width: '100%',
    maxWidth: 520,
    height: 'auto' as unknown as number,
    maxHeight: '80%',
    borderRadius: radius.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sheetHeaderCopy: { flex: 1, gap: 2 },
  sheetTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: 18,
    color: colors.foreground,
    letterSpacing: -0.2,
  },
  sheetSubtitle: { ...typography.caption, color: colors.mutedForeground },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.foreground,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 0,
  },
  list: { flex: 1 },
  listContent: { paddingBottom: spacing.sm },
  listEmptyContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xl },
  emptySearch: { alignItems: 'center', paddingVertical: spacing.lg },
  productRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
  },
  createProductBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  createProductText: { color: '#fff', fontWeight: '700' },
});
