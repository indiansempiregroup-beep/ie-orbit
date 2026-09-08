import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
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
import type { Customer, ShopCashAccount, ShopProduct, ShopSupplier } from '@ie-orbit/sdk';
import { SHOP_PRODUCT_CATEGORIES } from '@ie-orbit/sdk';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useSheetKeyboardLayout } from '../../hooks/useSheetKeyboardLayout';
import { DesktopPage } from '../../components/DesktopPage';
import { groupedListProps } from '../../components/ui/GroupedList';
import { DateField } from '../../components/DateField';
import { PickerSheet } from '../../components/PickerSheet';
import { SelectField } from '../../components/SelectField';
import { FormHero } from '../../components/FormHero';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { FormAlert } from '../../components/ui/FormAlert';
import { FormSection } from '../../components/ui/FormSection';
import { IconBadge } from '../../components/ui/IconBadge';
import { Input } from '../../components/ui/Input';
import { StickyFooterBar } from '../../components/ui/StickyFooterBar';
import { fieldStyles, inputReset } from '../../components/ui/fieldStyles';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { shopListRefreshControl } from './shopRefreshControl';
import { applyDiscount, computePosTotals, isProductTaxInclusive, type DiscountType } from './posPricing';
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
import { RemoteImage } from '../../components/RemoteImage';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { primaryProductImageUrl } from './productImages';
import { formatMoney } from './shopBooksHelpers';

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

const LINE_PERCENT_PRESETS = [5, 10, 15, 20, 25, 50];
const SCAN_SUGGESTION_LIMIT = 12;

function productScanCodes(product: ShopProduct): string[] {
  const codes: string[] = [];
  for (const row of product.barcodes ?? []) {
    const code = String(row.code || '').trim();
    if (code) codes.push(code);
  }
  const sku = String(product.sku || '').trim();
  if (sku && !codes.some((code) => cEquals(code, sku))) codes.push(sku);
  return codes;
}

function cEquals(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function matchedScanCode(product: ShopProduct, term: string): string | undefined {
  const needle = term.trim().toLowerCase();
  if (!needle) return undefined;
  const codes = productScanCodes(product);
  return (
    codes.find((code) => code.toLowerCase() === needle) ||
    codes.find((code) => code.toLowerCase().startsWith(needle)) ||
    codes.find((code) => code.toLowerCase().includes(needle))
  );
}

function scanMatchRank(product: ShopProduct, term: string): number | null {
  const needle = term.trim().toLowerCase();
  if (!needle) return null;
  const codes = productScanCodes(product).map((code) => code.toLowerCase());
  if (codes.some((code) => code === needle)) return 0;
  if (codes.some((code) => code.startsWith(needle))) return 1;
  if (codes.some((code) => code.includes(needle))) return 2;
  return null;
}

function ProductThumb({ product, size = 36 }: { product: ShopProduct; size?: number }) {
  const uri = resolveMediaUrl(primaryProductImageUrl(product));
  if (uri) {
    return (
      <RemoteImage
        uri={uri}
        style={{ width: size, height: size, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        backgroundColor: colors.muted,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Feather name="package" size={size > 36 ? 18 : 14} color={colors.mutedForeground} />
    </View>
  );
}

export function ShopPosScreen() {
  const { isDesktop } = useBreakpoint();
  const { lift, maxHeight, bottomPad, keyboardOpen } = useSheetKeyboardLayout(0.72);
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
  const [productCategory, setProductCategory] = useState('');
  const [productStock, setProductStock] = useState('');
  const [productSort, setProductSort] = useState('name_asc');
  const [productFiltersOpen, setProductFiltersOpen] = useState(false);
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
  const [discountLineId, setDiscountLineId] = useState<string | null>(null);
  const [draftDiscType, setDraftDiscType] = useState<DiscountType>('percent');
  const [draftDiscValue, setDraftDiscValue] = useState('');

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
      const trimmed = code.trim();
      if (!trimmed) return;
      const exact = products.filter((product) => scanMatchRank(product, trimmed) === 0);
      if (exact.length === 1) {
        const product = exact[0];
        syncBasket((current) => {
          const existing = current.find((line) => line.product.id === product.id);
          if (existing) {
            return current.map((line) =>
              line.product.id === product.id
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
              product,
              quantity: 1,
              barcode_scanned: trimmed,
              discountType: '',
              discountValue: 0,
            },
          ];
        });
        setScan('');
        setMessage(`Added ${product.name}`);
        return;
      }
      if (!client || !businessId) return;
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
        const localMatches = products.filter((product) => scanMatchRank(product, trimmed) != null);
        if (localMatches.length) {
          setMessage('Select a matching product below.');
        } else {
          setMessage(err instanceof Error ? err.message : 'Barcode not found');
        }
      } finally {
        setBusy(false);
      }
    },
    [businessId, client, products, syncBasket],
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

  const productCategoryOptions = useMemo(() => {
    const present = Array.from(
      new Set(products.map((product) => String(product.category || '').trim()).filter(Boolean)),
    );
    const labels = new Map(SHOP_PRODUCT_CATEGORIES.map((item) => [item.value, item.label]));
    return [
      { value: '', label: 'All' },
      ...present.map((value) => ({ value, label: labels.get(value) || value })),
    ];
  }, [products]);

  const scanSuggestions = useMemo(() => {
    const term = scan.trim();
    if (!term) return [];
    return products
      .map((product) => ({ product, rank: scanMatchRank(product, term) }))
      .filter((row): row is { product: ShopProduct; rank: number } => row.rank != null)
      .sort((a, b) => a.rank - b.rank || String(a.product.name).localeCompare(String(b.product.name)))
      .slice(0, SCAN_SUGGESTION_LIMIT)
      .map((row) => row.product);
  }, [products, scan]);

  const filteredProducts = useMemo(() => {
    const term = productQuery.trim().toLowerCase();
    let list = products.filter((product) => {
      if (productCategory && String(product.category || '') !== productCategory) return false;
      if (productStock === 'in_stock' && Number(product.stock_on_hand) <= 0) return false;
      if (productStock === 'low' && Number(product.stock_on_hand) > Number(product.low_stock_threshold ?? 5)) {
        return false;
      }
      if (!term) return true;
      return [product.name, product.brand ?? '', product.sku ?? '', ...(product.barcodes ?? []).map((b) => b.code)]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
    list = [...list].sort((a, b) => {
      if (productSort === 'price_desc') return Number(b.price ?? 0) - Number(a.price ?? 0);
      if (productSort === 'stock_desc') return Number(b.stock_on_hand ?? 0) - Number(a.stock_on_hand ?? 0);
      return String(a.name).localeCompare(String(b.name));
    });
    return list.slice(0, 80);
  }, [productQuery, products, productCategory, productStock, productSort]);

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

  const discountLine = basket.find((line) => line.product.id === discountLineId) ?? null;
  const discountPriced = discountLine
    ? totals.lines.find((row) => row.id === discountLine.product.id)
    : undefined;
  const draftDiscAmount = applyDiscount(
    discountPriced?.gross ?? 0,
    draftDiscType,
    Number(draftDiscValue) || 0,
  );

  useEffect(() => {
    if (!discountLineId) return;
    const line = basket.find((row) => row.product.id === discountLineId);
    if (!line) {
      setDiscountLineId(null);
      return;
    }
    setDraftDiscType(line.discountType || 'percent');
    setDraftDiscValue(line.discountValue ? String(line.discountValue) : '');
    // Sync only when the sheet opens for a line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountLineId]);

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
    setProductFiltersOpen(false);
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
    setProductFiltersOpen(false);
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

  const payableShown = mode === 'sale' ? payableAfterLoyalty : totals.payable;
  const checkoutLabel = busy
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
      ? `Save sale order · ${formatMoney(totals.payable)}`
      : isPurchaseOrder
        ? `Save purchase order · ${formatMoney(totals.payable)}`
        : isChallan
          ? `Save challan · ${formatMoney(totals.payable)}`
          : isQuotation
            ? `Save quotation · ${formatMoney(totals.payable)}`
            : isCreditNote
              ? `Save credit note · ${formatMoney(totals.payable)}`
              : isDebitNote
                ? `Save debit note · ${formatMoney(totals.payable)}`
                : isPurchase
                  ? paymentMethod === 'borrow'
                    ? `Record purchase · Due ${formatMoney(totals.payable)}`
                    : `Record purchase · ${formatMoney(totals.payable)}`
                  : paymentMethod === 'borrow'
                    ? `Save bill · Due ${formatMoney(payableShown)}`
                    : `Charge ${formatMoney(payableShown)}`;

  return (
    <DesktopPage maxWidth={960}>
    <View style={[styles.screen, { paddingTop: spacing.md }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: spacing.xl, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
        refreshControl={shopListRefreshControl(refreshing, onRefresh)}
      >
        <FormHero
          title={modeTitle(mode)}
          subtitle={
            isDocument
              ? 'Add products, then save the document.'
              : isPurchase
                ? 'Scan supplier items and record the bill.'
                : 'Scan or search products, then take payment.'
          }
        />

        <FormSection
          title={usesSupplier ? 'Supplier' : 'Customer'}
          subtitle={usesSupplier ? 'Who are you buying from?' : 'Walk-in or a saved customer'}
        >
          <View style={styles.customerRow}>
            {usesSupplier ? (
              <View style={styles.customerField}>
                <SelectField
                  label="Supplier"
                  required
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
                    label="Customer"
                    required
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
        </FormSection>

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

        <FormSection
          title="Bill"
          subtitle={`${basket.length} item${basket.length === 1 ? '' : 's'} · scan, search, or add`}
        >
        <View>
        <View style={styles.scanRow}>
          <View style={[fieldStyles.control, styles.scanField]}>
            <Feather name="maximize" size={16} color={colors.primary} />
            <TextInput
              style={[inputReset, fieldStyles.value]}
              value={scan}
              onChangeText={(value) => {
                setScan(value);
                if (value.trim()) setMessage(null);
              }}
              onSubmitEditing={() => void resolveCode(scan)}
              placeholder="Scan / type barcode"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
            />
          </View>
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
        {scan.trim() ? (
          <ScrollView
            style={styles.scanSuggestions}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {scanSuggestions.length ? (
              scanSuggestions.map((product) => {
                const matched = matchedScanCode(product, scan);
                return (
                  <Pressable
                    key={product.id}
                    style={styles.scanSuggestionRow}
                    onPress={() => {
                      addProduct(product, matched || scan.trim());
                      setScan('');
                      setMessage(`Added ${product.name}`);
                    }}
                    accessibilityLabel={`Add ${product.name}`}
                  >
                    <ProductThumb product={product} size={36} />
                    <View style={styles.productCopy}>
                      <Text style={styles.name} numberOfLines={1}>
                        {product.name}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {matched ? `${matched} · ` : ''}
                        {formatMoney(product.price)} · stock {product.stock_on_hand}
                      </Text>
                    </View>
                    <Feather name="plus" size={16} color={colors.primary} />
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.scanEmpty}>No products match this barcode. Search the catalog or add a product.</Text>
            )}
          </ScrollView>
        ) : null}
        </View>

        {message ? (
          <FormAlert
            message={message}
            tone={message.toLowerCase().includes('posted') || message.toLowerCase().includes('saved') ? 'success' : 'error'}
          />
        ) : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}

        {!basket.length ? (
          <View style={styles.emptyBill}>
            <IconBadge icon="shopping-bag" tone="navy" />
            <Text style={styles.name}>Basket is empty</Text>
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
                        : 'Scan a barcode or search the catalog to start billing.'}
            </Text>
            <Button label="Search products" variant="soft" onPress={() => setProductPickerOpen(true)} />
          </View>
        ) : (
          <View style={styles.lineList}>
          {basket.map((line) => {
            const priced = totals.lines.find((row) => row.id === line.product.id);
            const hasDiscount = Boolean(line.discountType && line.discountValue > 0);
            const discountLabel =
              line.discountType === 'percent'
                ? `−${line.discountValue}%`
                : line.discountType === 'amount'
                  ? `−₹${formatMoney(line.discountValue)}`
                  : '';
            return (
              <View key={line.product.id} style={styles.lineCard}>
                <Pressable
                  style={styles.lineHit}
                  onPress={() => setDiscountLineId(line.product.id)}
                  accessibilityLabel={`Discount for ${line.product.name}`}
                >
                  <ProductThumb product={line.product} size={36} />
                  <View style={styles.lineCopy}>
                    <Text style={styles.name} numberOfLines={1}>
                      {line.product.name}
                    </Text>
                    <Text style={hasDiscount ? styles.discBadge : styles.lineHint} numberOfLines={1}>
                      {hasDiscount ? discountLabel : 'Tap to add discount'}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() => updateLine(line.product.id, { quantity: line.quantity - 1 })}
                  accessibilityLabel="Decrease quantity"
                >
                  <Text style={styles.qtyBtnText}>−</Text>
                </Pressable>
                <Text style={styles.qty}>{line.quantity}</Text>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() => updateLine(line.product.id, { quantity: line.quantity + 1 })}
                  accessibilityLabel="Increase quantity"
                >
                  <Text style={styles.qtyBtnText}>+</Text>
                </Pressable>
                <View style={styles.lineAmount}>
                  {hasDiscount ? (
                    <Text style={styles.lineStrike}>{formatMoney(priced?.gross ?? 0)}</Text>
                  ) : null}
                  <Text style={styles.lineTotal}>{formatMoney(priced?.total ?? 0)}</Text>
                </View>
                <Pressable
                  onPress={() => updateLine(line.product.id, { quantity: 0 })}
                  hitSlop={8}
                  accessibilityLabel="Remove line"
                >
                  <Feather name="x" size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>
            );
          })}
          </View>
        )}
        </FormSection>

        <PickerSheet
          visible={Boolean(discountLine)}
          title="Item discount"
          preview={
            discountLine
              ? draftDiscAmount > 0
                ? `Saves ${formatMoney(draftDiscAmount)}`
                : discountLine.product.name
              : ''
          }
          icon="percent"
          onClose={() => setDiscountLineId(null)}
          actionLabel="Apply discount"
          onAction={() => {
            if (!discountLine) return;
            const value = Number(draftDiscValue) || 0;
            updateLine(discountLine.product.id, {
              discountType: value > 0 ? draftDiscType : '',
              discountValue: value > 0 ? value : 0,
            });
            setDiscountLineId(null);
          }}
        >
          {discountLine ? (
            <View style={styles.discSheet}>
              <Text style={styles.discProduct} numberOfLines={2}>
                {discountLine.product.name}
              </Text>
              <View style={styles.discTypeRow}>
                <Pressable
                  style={[styles.discTypeCard, draftDiscType === 'percent' && styles.discTypeCardOn]}
                  onPress={() => setDraftDiscType('percent')}
                >
                  <Text style={[styles.discTypeTitle, draftDiscType === 'percent' && styles.discTypeTitleOn]}>
                    Percent
                  </Text>
                  <Text style={[styles.discTypeMeta, draftDiscType === 'percent' && styles.discTypeMetaOn]}>
                    e.g. 10% off
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.discTypeCard, draftDiscType === 'amount' && styles.discTypeCardOn]}
                  onPress={() => setDraftDiscType('amount')}
                >
                  <Text style={[styles.discTypeTitle, draftDiscType === 'amount' && styles.discTypeTitleOn]}>
                    Amount
                  </Text>
                  <Text style={[styles.discTypeMeta, draftDiscType === 'amount' && styles.discTypeMetaOn]}>
                    e.g. ₹20 off
                  </Text>
                </Pressable>
              </View>
              {draftDiscType === 'percent' ? (
                <View style={styles.discPresetRow}>
                  {LINE_PERCENT_PRESETS.map((preset) => (
                    <Pressable
                      key={preset}
                      style={[
                        styles.discPreset,
                        draftDiscValue === String(preset) && styles.discPresetOn,
                      ]}
                      onPress={() => setDraftDiscValue(String(preset))}
                    >
                      <Text
                        style={[
                          styles.discPresetText,
                          draftDiscValue === String(preset) && styles.discPresetTextOn,
                        ]}
                      >
                        {preset}%
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Input
                label={draftDiscType === 'amount' ? 'Rupees off' : 'Percent off'}
                optional
                value={draftDiscValue}
                onChangeText={(value) => setDraftDiscValue(value.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="0"
              />
              <Button
                label="Remove discount"
                variant="ghost"
                fullWidth
                onPress={() => {
                  updateLine(discountLine.product.id, { discountType: '', discountValue: 0 });
                  setDiscountLineId(null);
                }}
              />
            </View>
          ) : null}
        </PickerSheet>

        <FormSection title="Bill discount" subtitle="Optional off the whole bill">
        <View style={styles.discountRow}>
          {(
            [
              { value: '', label: 'None' },
              { value: 'percent', label: '%' },
              { value: 'amount', label: '₹' },
            ] as const
          ).map((option) => (
            <Chip
              key={option.value || 'none'}
              label={option.label}
              active={billDiscountType === option.value}
              onPress={() => {
                setBillDiscountType(option.value);
                if (!option.value) setBillDiscountValue('0');
                writePosSession({
                  billDiscountType: option.value,
                  billDiscountValue: option.value ? billDiscountValue : '0',
                });
              }}
            />
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
        </FormSection>

        {showGstFields ? (
          <FormSection title="GST" subtitle={usesSupplier ? 'Supplier GSTIN' : 'Customer GSTIN'}>
            <Input
              label="GSTIN"
              optional
              value={partyGstin}
              onChangeText={updatePartyGstin}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={15}
              placeholder="29AABCU9603R1ZJ (optional for B2C)"
              error={partyGstin.length > 0 && !billGstinCheck.ok ? billGstinCheck.message : undefined}
              hint={
                partyGstin.length === 0
                  ? 'Leave blank for B2C. Enter a valid 15-character GSTIN for a B2B invoice.'
                  : billGstinCheck.ok
                    ? 'Valid GSTIN — this bill will be posted as B2B.'
                    : undefined
              }
            />
          </FormSection>
        ) : null}

        {isDocument ? (
          isQuotation ? (
            <DateField
              label="Valid until"
              optional
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
          <FormSection title="Payment" subtitle="How this bill is settled">
            <View style={styles.discountRow}>
              {(
                [
                  { value: 'cash', label: 'Cash' },
                  { value: 'upi', label: 'UPI' },
                  { value: 'card', label: 'Card' },
                  { value: 'borrow', label: isPurchase ? 'Unpaid' : 'Borrow' },
                ] as const
              ).map((method) => (
                <Chip
                  key={method.value}
                  label={method.label}
                  active={paymentMethod === method.value}
                  onPress={() => {
                    setPaymentMethod(method.value);
                    if (!isPurchase) {
                      writePosSession({ paymentMethod: method.value });
                    }
                  }}
                />
              ))}
            </View>
            {isPurchase && paymentMethod !== 'borrow' ? (
              <SelectField
                label="Paid from"
                required
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
          </FormSection>
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
            <Text style={styles.meta}>{formatMoney(totals.merchandiseGross)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.meta}>Product discounts</Text>
            <Text style={styles.meta}>-{formatMoney(totals.lineDiscountTotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.meta}>Bill discount</Text>
            <Text style={styles.meta}>-{formatMoney(totals.billDiscountAmount)}</Text>
          </View>
          {loyaltyDiscount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.meta}>Reward points</Text>
              <Text style={styles.meta}>-{formatMoney(loyaltyDiscount)}</Text>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.meta}>
              GST{partyGstin && billGstinCheck.ok ? ' · B2B' : ''}
            </Text>
            <Text style={styles.meta}>{formatMoney(totals.taxTotal)}</Text>
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
            <Text style={styles.payableValue}>{formatMoney(payableShown)}</Text>
          </View>
        </View>
      </ScrollView>

      <StickyFooterBar>
        <View style={styles.chargeMeta}>
          <Text style={styles.chargeHint}>{basket.length} item{basket.length === 1 ? '' : 's'}</Text>
          <Text style={styles.chargeAmount}>{formatMoney(payableShown)}</Text>
        </View>
        <Button
          label={checkoutLabel}
          size="lg"
          fullWidth
          loading={busy}
          disabled={!basket.length || busy}
          onPress={() => void checkout()}
        />
      </StickyFooterBar>

      <Modal
        visible={productPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setProductFiltersOpen(false);
          setProductPickerOpen(false);
        }}
      >
        <View style={[styles.overlay, isDesktop && styles.overlayDesktop]}>
          <Pressable
            style={styles.backdrop}
            onPress={() => {
              setProductFiltersOpen(false);
              setProductPickerOpen(false);
            }}
            accessibilityLabel="Close"
          />
          <View
            style={[
              styles.sheet,
              isDesktop && styles.sheetDesktop,
              !isDesktop && {
                marginBottom: lift,
                maxHeight,
                height: maxHeight,
                paddingBottom: bottomPad,
              },
              isDesktop && { paddingBottom: spacing.lg },
            ]}
          >
            <View style={[styles.pickerHero, keyboardOpen && styles.pickerHeroCompact]}>
              {!isDesktop ? <View style={styles.handle} /> : null}
              <View style={styles.pickerHeroTop}>
                <Text style={styles.pickerKicker}>Catalog</Text>
                <Pressable
                  style={styles.pickerClose}
                  onPress={() => {
                    setProductFiltersOpen(false);
                    setProductPickerOpen(false);
                  }}
                  hitSlop={8}
                >
                  <Feather name="x" size={18} color={colors.primaryForeground} />
                </Pressable>
              </View>
              <Text style={[styles.pickerTitle, keyboardOpen && styles.pickerTitleCompact]}>Find product</Text>
              <Text style={styles.pickerSubtitle}>
                {filteredProducts.length} match{filteredProducts.length === 1 ? '' : 'es'}
              </Text>
            </View>

            <View style={styles.pickerSearchRow}>
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
              <FilterButton
                count={
                  Number(Boolean(productCategory)) +
                  Number(Boolean(productStock)) +
                  Number(productSort !== 'name_asc')
                }
                onPress={() => {
                  Keyboard.dismiss();
                  setProductFiltersOpen(true);
                }}
              />
            </View>

            <FlatList
              {...groupedListProps(filteredProducts.length, styles.list)}
              data={filteredProducts}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              contentContainerStyle={
                filteredProducts.length === 0 ? styles.listEmptyContent : styles.listContent
              }
              renderItem={({ item }) => (
                <Pressable style={styles.productRow} onPress={() => addProduct(item)}>
                  <ProductThumb product={item} size={44} />
                  <View style={styles.productCopy}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.meta}>
                      {formatMoney(item.price)} · stock {item.stock_on_hand}
                    </Text>
                  </View>
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

            <FilterSheet
              embedded
              visible={productFiltersOpen}
              title="Product filters"
              onClose={() => setProductFiltersOpen(false)}
              onReset={() => {
                setProductCategory('');
                setProductStock('');
                setProductSort('name_asc');
              }}
            >
              <FilterChoiceGroup
                label="Category"
                value={productCategory}
                options={productCategoryOptions}
                onChange={setProductCategory}
              />
              <FilterChoiceGroup
                label="Stock"
                value={productStock}
                options={[
                  { value: '', label: 'Any' },
                  { value: 'in_stock', label: 'In stock' },
                  { value: 'low', label: 'Low stock' },
                ]}
                onChange={setProductStock}
              />
              <FilterChoiceGroup
                label="Sort"
                value={productSort}
                options={[
                  { value: 'name_asc', label: 'Name' },
                  { value: 'price_desc', label: 'Price' },
                  { value: 'stock_desc', label: 'Stock' },
                ]}
                onChange={setProductSort}
              />
            </FilterSheet>
          </View>
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
  },
  section: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.foreground,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  scanRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  scanField: { flex: 1, gap: spacing.sm },
  scanSuggestions: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    overflow: 'hidden',
    maxHeight: 260,
  },
  scanSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  scanEmpty: {
    ...typography.caption,
    color: colors.mutedForeground,
    padding: spacing.md,
    lineHeight: 18,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.foreground,
    backgroundColor: colors.inputBackground,
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
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.inputBackground,
    alignItems: 'center',
    gap: spacing.sm,
  },
  lineList: { gap: 8 },
  lineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.inputBackground,
    minHeight: 44,
  },
  lineHit: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineCopy: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.foreground },
  lineHint: { fontSize: 11, color: colors.mutedForeground },
  discBadge: { fontSize: 11, fontWeight: '700', color: '#B45309' },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  qtyBtnText: { fontSize: 16, color: colors.primary, fontWeight: '700', lineHeight: 18 },
  qty: { minWidth: 18, textAlign: 'center', color: colors.foreground, fontWeight: '700', fontSize: 14 },
  lineAmount: { alignItems: 'flex-end', minWidth: 56 },
  lineStrike: {
    fontSize: 11,
    color: colors.mutedForeground,
    textDecorationLine: 'line-through',
  },
  lineTotal: { fontWeight: '700', color: colors.foreground, fontSize: 14 },
  discSheet: { gap: spacing.md },
  discProduct: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  discTypeRow: { flexDirection: 'row', gap: spacing.sm },
  discTypeCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.inputBackground,
    gap: 4,
  },
  discTypeCardOn: { borderColor: colors.primary, backgroundColor: colors.tint },
  discTypeTitle: { fontWeight: '700', color: colors.foreground, fontSize: 15 },
  discTypeTitleOn: { color: colors.primary },
  discTypeMeta: { fontSize: 12, color: colors.mutedForeground },
  discTypeMetaOn: { color: colors.primary },
  discPresetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  discPreset: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  discPresetOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  discPresetText: { fontWeight: '700', fontSize: 13, color: colors.foreground },
  discPresetTextOn: { color: colors.primaryForeground },
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
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
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
  chargeMeta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  chargeHint: { ...typography.caption, color: colors.mutedForeground },
  chargeAmount: { fontFamily: fonts.bodyBold, fontSize: 22, color: colors.foreground, letterSpacing: -0.3 },
  pickerHero: {
    backgroundColor: colors.primary,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  pickerHeroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pickerHeroCompact: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pickerKicker: { ...typography.label, color: 'rgba(255,255,255,0.82)', flex: 1 },
  pickerTitle: { fontSize: 24, fontWeight: '700', color: colors.primaryForeground, letterSpacing: -0.3 },
  pickerTitleCompact: { fontSize: 18 },
  pickerSubtitle: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  pickerClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.45)',
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
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  pickerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    paddingRight: spacing.md,
    backgroundColor: colors.card,
  },
  productCopy: { flex: 1, minWidth: 0 },
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
