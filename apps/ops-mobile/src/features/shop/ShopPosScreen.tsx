import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from 'react-native-keyboard-controller';
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
import { SelectField } from '../../components/SelectField';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { StickyFooterBar } from '../../components/ui/StickyFooterBar';
import { fieldStyles, inputReset } from '../../components/ui/fieldStyles';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { DocumentActionsSheet, type ShopDocTarget } from './DocumentActionsSheet';
import { shopListRefreshControl } from './shopRefreshControl';
import { applyDiscount, computePosTotals, isProductTaxInclusive, type DiscountType } from './posPricing';
import {
  clearPosBillKeepCustomer,
  readPosSession,
  takePosPendingAddCode,
  takePosPendingAddProductId,
  writePosSession,
} from './posSession';
import { gstinStateCode, isInterstateGstin, normalizeGstin, validateGstin } from '../../utils/gstin';
import { getApiErrorMessage } from '../../utils/format';
import { hasShopie } from '../../utils/products';
import {
  earnPointsForSpend,
  maxRedeemablePoints,
  readLoyaltyPrefs,
  redeemDiscountAmount,
} from '../../utils/loyalty';
import { PlanFeature } from '../../utils/planFeatures';
import { RemoteImage } from '../../components/RemoteImage';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { primaryProductImageUrl } from './productImages';
import { formatMoney } from './shopBooksHelpers';
import { usePlanFeatures } from '../../hooks/useOpsExtended';

type BasketLine = {
  product: ShopProduct;
  quantity: number;
  barcode_scanned?: string;
  discountType: DiscountType;
  discountValue: number;
};

type PaymentMethod = 'cash' | 'upi' | 'card' | 'borrow';
type NoteSettlement = 'adjust' | 'cash';
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

  const name = String(product.name || '').trim().toLowerCase();
  const brand = String(product.brand || '').trim().toLowerCase();
  if (name === needle) return 3;
  if (name.startsWith(needle)) return 4;
  if (name.includes(needle)) return 5;
  if (brand.startsWith(needle) || brand.includes(needle)) return 6;
  return null;
}

function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if ((cleaned.match(/\./g) || []).length > 1) {
    const first = cleaned.indexOf('.');
    return cleaned.slice(0, first + 1) + cleaned.slice(first + 1).replace(/\./g, '');
  }
  return cleaned;
}

function formatDiscountNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return String(Math.round((value + Number.EPSILON) * 100) / 100);
}

/** Vyapar-style dual discount: edit % or ₹; the other field mirrors the computed value. */
function DualDiscountFields({
  lineGross,
  discountType,
  discountValue,
  onChange,
}: {
  lineGross: number;
  discountType: DiscountType;
  discountValue: number;
  onChange: (type: DiscountType, value: number) => void;
}) {
  const discAmount = applyDiscount(lineGross, discountType, discountValue);
  const discPercent =
    discountType === 'percent'
      ? Math.max(0, Number(discountValue) || 0)
      : lineGross > 0 && discAmount > 0
        ? Math.round(((discAmount / lineGross) * 100 + Number.EPSILON) * 100) / 100
        : 0;

  const [pctDraft, setPctDraft] = useState(() => formatDiscountNumber(discPercent));
  const [amtDraft, setAmtDraft] = useState(() => formatDiscountNumber(discAmount));
  const [focusField, setFocusField] = useState<'percent' | 'amount' | null>(null);

  useEffect(() => {
    if (focusField === 'percent') return;
    setPctDraft(formatDiscountNumber(discPercent));
  }, [discPercent, focusField]);

  useEffect(() => {
    if (focusField === 'amount') return;
    setAmtDraft(formatDiscountNumber(discAmount));
  }, [discAmount, focusField]);

  const percentInput = (
    <View style={[styles.dualDiscCell, styles.dualDiscCellPct]}>
      <TextInput
        style={styles.dualDiscInput}
        value={pctDraft}
        onFocus={() => setFocusField('percent')}
        onBlur={() => {
          setFocusField(null);
          const next = Number(pctDraft) || 0;
          setPctDraft(formatDiscountNumber(next));
          onChange(next > 0 ? 'percent' : '', next);
        }}
        onChangeText={(raw) => {
          const cleaned = sanitizeDecimalInput(raw);
          setPctDraft(cleaned);
          if (cleaned === '' || cleaned.endsWith('.')) {
            onChange(cleaned === '' ? '' : 'percent', cleaned === '' ? 0 : Number(cleaned) || 0);
            return;
          }
          const next = Number(cleaned) || 0;
          onChange(next > 0 ? 'percent' : '', next);
        }}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel="Discount percent"
      />
      <Text style={styles.dualDiscSuffix}>%</Text>
    </View>
  );

  const amountInput = (
    <View style={[styles.dualDiscCell, styles.dualDiscCellAmt]}>
      <Text style={styles.dualDiscPrefix}>₹</Text>
      <TextInput
        style={styles.dualDiscInput}
        value={amtDraft}
        onFocus={() => setFocusField('amount')}
        onBlur={() => {
          setFocusField(null);
          const next = Number(amtDraft) || 0;
          setAmtDraft(formatDiscountNumber(next));
          onChange(next > 0 ? 'amount' : '', next);
        }}
        onChangeText={(raw) => {
          const cleaned = sanitizeDecimalInput(raw);
          setAmtDraft(cleaned);
          if (cleaned === '' || cleaned.endsWith('.')) {
            onChange(cleaned === '' ? '' : 'amount', cleaned === '' ? 0 : Number(cleaned) || 0);
            return;
          }
          const next = Number(cleaned) || 0;
          onChange(next > 0 ? 'amount' : '', next);
        }}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel="Discount amount"
      />
    </View>
  );

  return (
    <View style={styles.dualDiscRow}>
      {percentInput}
      {amountInput}
    </View>
  );
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
  const { isDesktop, width: viewportWidth } = useBreakpoint();
  /** Side-by-side Payment | Bill summary on OPS web / wide desktop. */
  const checkoutSideBySide = isDesktop || viewportWidth >= 720;
  const { lift, maxHeight, bottomPad, keyboardOpen } = useSheetKeyboardLayout(0.72);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Props['route']>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId, activeBusiness } = useWorkspace();
  const { has: hasFeature } = usePlanFeatures();
  const showGstFields = hasShopie(activeBusiness?.product_subscriptions);
  const mode = resolvePosMode(route.params?.mode);
  const isPurchase = mode === 'purchase';
  const isQuotation = mode === 'quotation';
  const isCreditNote = mode === 'credit_note';
  const isDebitNote = mode === 'debit_note';
  const isSaleOrder = mode === 'sale_order';
  const isPurchaseOrder = mode === 'purchase_order';
  const isChallan = mode === 'delivery_challan';
  const canCreateChallan = hasFeature(PlanFeature.shopieBooksChallan);
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
  const [billDiscountValue, setBillDiscountValue] = useState(() => {
    if (skipSaleSession) return '';
    const raw = String(initialSession.billDiscountValue ?? '').trim();
    return raw === '0' ? '' : raw;
  });
  const [automationOffers, setAutomationOffers] = useState<
    Array<{
      label: string;
      discount_type: string;
      discount_value: string;
      source?: string;
    }>
  >([]);
  const [partyGstin, setPartyGstin] = useState(() =>
    skipSaleSession ? '' : initialSession.partyGstin ?? '',
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    () => (isPurchase ? 'borrow' : initialSession.paymentMethod),
  );
  /** Amount collected now (sales till). Empty = default full pay / full credit. */
  const [amountReceived, setAmountReceived] = useState('');
  const [amountReceivedTouched, setAmountReceivedTouched] = useState(false);
  const [validUntil, setValidUntil] = useState('');
  const [noteSettlement, setNoteSettlement] = useState<NoteSettlement>('adjust');
  const [documentNotes, setDocumentNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [awardLoyaltyPoints, setAwardLoyaltyPoints] = useState(true);
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);

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
        isPurchase || isNote
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
  }, [businessId, client, isPurchase, isNote, usesSupplier]);

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

  useEffect(() => {
    if (!client || !businessId || mode !== 'sale' || !customerId) {
      setAutomationOffers([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await client.shop.eligibleOffers({
          business_id: businessId,
          customer_id: customerId,
          fulfillment_mode: 'pos',
          lines: basket.map((line) => ({
            product_id: line.product.id,
            quantity: line.quantity,
          })),
        });
        if (cancelled) return;
        const autos = (res.data.automations || []).map((row) => ({
          label: String(row.label || row.name || 'Offer'),
          discount_type: String(row.discount_type || 'percent'),
          discount_value: String(row.discount_value || '0'),
          source: String(row.source || 'automation'),
        }));
        setAutomationOffers(autos.filter((row) => Number(row.discount_value) > 0));
      } catch {
        if (!cancelled) setAutomationOffers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [basket, businessId, client, customerId, mode]);

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
        {
          const raw = String(session.billDiscountValue ?? '').trim();
          setBillDiscountValue(raw === '0' ? '' : raw);
        }
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
  const sellerGstin = String(activeBusiness?.gst_tax_number || '').trim();
  const billIsInterstate =
    billGstinCheck.ok &&
    Boolean(billGstinCheck.gstin) &&
    isInterstateGstin(sellerGstin, billGstinCheck.gstin);

  const posLineInputs = useMemo(
    () =>
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
    [basket],
  );

  /** Product-level only — used for line Amount / Disc columns (bill discount must not leak into rows). */
  const lineLevelTotals = useMemo(
    () => computePosTotals(posLineInputs, '', 0, 0),
    [posLineInputs],
  );

  const loyaltyPrefs = useMemo(
    () => readLoyaltyPrefs((activeBusiness?.settings ?? undefined) as Record<string, unknown> | undefined),
    [activeBusiness?.settings],
  );
  /** Visible when the business owner turned reward points on in shop settings. */
  const loyaltyProgramOn = mode === 'sale' && loyaltyPrefs.enabled;
  const selectedPosCustomer = useMemo(
    () => customers.find((row) => row.id === customerId) ?? null,
    [customers, customerId],
  );
  const loyaltyMaxPoints = useMemo(() => {
    if (!loyaltyProgramOn || !customerId) return 0;
    return maxRedeemablePoints(
      lineLevelTotals.subtotal,
      loyaltyPrefs,
      Number(selectedPosCustomer?.loyalty_points ?? 0),
    );
  }, [
    loyaltyProgramOn,
    customerId,
    lineLevelTotals.subtotal,
    loyaltyPrefs,
    selectedPosCustomer?.loyalty_points,
  ]);
  const loyaltyDiscount = useMemo(
    () => redeemDiscountAmount(Math.min(pointsToRedeem, loyaltyMaxPoints), loyaltyPrefs),
    [pointsToRedeem, loyaltyMaxPoints, loyaltyPrefs],
  );
  /** Full bill — bill discount + loyalty applied only here (totals panel / Save). */
  const totals = useMemo(
    () =>
      computePosTotals(
        posLineInputs,
        billDiscountType,
        Number(billDiscountValue) || 0,
        loyaltyDiscount,
      ),
    [posLineInputs, billDiscountType, billDiscountValue, loyaltyDiscount],
  );

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
    const tillSale =
      mode === 'sale' &&
      !isDocument &&
      !isNote &&
      (paymentMethod === 'cash' ||
        paymentMethod === 'upi' ||
        paymentMethod === 'card' ||
        paymentMethod === 'borrow');
    const payableNow = totals.payable;
    let paidNow = payableNow;
    if (tillSale) {
      if (paymentMethod === 'borrow' && !amountReceivedTouched && amountReceived === '') {
        paidNow = 0;
      } else if (!amountReceivedTouched && amountReceived === '' && paymentMethod !== 'borrow') {
        paidNow = payableNow;
      } else {
        const parsed = Number(amountReceived);
        paidNow =
          !Number.isFinite(parsed) || parsed < 0
            ? 0
            : Math.min(payableNow, Math.round((parsed + Number.EPSILON) * 100) / 100);
      }
    }
    const dueNow = Math.max(0, Math.round((payableNow - paidNow + Number.EPSILON) * 100) / 100);
    if (mode === 'sale' && tillSale && dueNow > 0 && !customerId) {
      const text = 'Select a customer when the bill is not fully paid (partial or credit).';
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
    if (isNote && noteSettlement === 'cash' && !cashAccountId) {
      const text = isCreditNote
        ? 'Select a cash/bank account for the refund.'
        : 'Select a cash/bank account to record the receipt.';
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
        if (isChallan && !canCreateChallan) {
          const text = 'Delivery challan is not on your plan.';
          setMessage(text);
          toast.push(text, 'error');
          return;
        }
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
        setBillDiscountValue('');
        setSupplierId('');
        const label = isPurchaseOrder ? 'Purchase order' : isChallan ? 'Delivery challan' : 'Sale order';
        toast.push(
          `${label} ${response.data.document_number} created · ${formatMoney(totals.payable)}`,
          'success',
        );
        if (isChallan) {
          const selectedCustomer = customers.find((row) => row.id === customerId);
          setDocActions({
            kind: 'delivery_challan',
            id: response.data.id,
            number: response.data.document_number,
            businessId,
            phone: String(selectedCustomer?.phone_number || ''),
            email: String(selectedCustomer?.email || ''),
          });
          return;
        }
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
        setBillDiscountValue('');
        setValidUntil('');
        toast.push(
          `Quotation ${response.data.quotation_number} created · ${formatMoney(totals.payable)}`,
          'success',
        );
        setDocActions({
          kind: 'quotation',
          id: response.data.id,
          number: response.data.quotation_number,
          businessId,
        });
        return;
      }

      if (isNote) {
        const settleCash = noteSettlement === 'cash';
        const defaultNote = isCreditNote ? 'Credit note from Sale counter' : 'Debit note from Sale counter';
        const response = await client.shop.createVoucher({
          voucher_type: mode,
          business_id: businessId,
          customer_id: isCreditNote ? customerId : null,
          supplier_id: isDebitNote ? supplierId : null,
          lines: taxLines,
          amount_paid: settleCash ? totals.payable : 0,
          cash_account_id: settleCash ? cashAccountId || undefined : undefined,
          is_interstate: billIsInterstate,
          place_of_supply: resolvedGstin ? gstinStateCode(resolvedGstin) : undefined,
          notes: documentNotes.trim() || defaultNote,
          metadata: {
            ...partyMeta,
            ...(billIsInterstate ? { gst: { is_interstate: true } } : {}),
          },
        });
        setBasket([]);
        setBillDiscountType('');
        setBillDiscountValue('');
        setSupplierId('');
        setDocumentNotes('');
        setNoteSettlement('adjust');
        if (isDebitNote) setPartyGstin('');
        toast.push(
          `${isCreditNote ? 'Credit' : 'Debit'} note ${response.data.voucher_number} recorded · ${formatMoney(totals.payable)}`,
          'success',
        );
        const selectedCustomer = customers.find((row) => row.id === customerId);
        const selectedSupplier = suppliers.find((row) => row.id === supplierId);
        setDocActions({
          kind: mode,
          id: response.data.id,
          number: response.data.voucher_number,
          businessId,
          phone: isCreditNote
            ? String(selectedCustomer?.phone_number || '')
            : String(selectedSupplier?.phone || ''),
          email: isCreditNote
            ? String(selectedCustomer?.email || '')
            : String(selectedSupplier?.email || ''),
        });
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
        setBillDiscountValue('');
        setSupplierId('');
        setPartyGstin('');
        toast.push(
          `Purchase ${response.data.voucher_number} recorded${paidNow ? '' : ' · Due'} · ${formatMoney(totals.payable)}`,
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
        amount_paid: paidNow,
        bill_discount_type: billDiscountType,
        bill_discount_value: Number(billDiscountValue) || 0,
        points_to_redeem: customerId && pointsToRedeem > 0 ? pointsToRedeem : undefined,
        award_loyalty_points:
          loyaltyProgramOn && customerId ? Boolean(awardLoyaltyPoints) : true,
        notes:
          dueNow > 0 && paidNow > 0
            ? `Sale · ${paymentMethod.toUpperCase()} · partial · paid ${paidNow} · due ${dueNow}`
            : paymentMethod === 'borrow'
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
        setBillDiscountValue('');
        setPointsToRedeem(0);
      setAmountReceived('');
      setAmountReceivedTouched(false);
      clearPosBillKeepCustomer();
      writePosSession({
        customerId,
        basket: [],
        billDiscountType: '',
        billDiscountValue: '',
        partyGstin: resolvedGstin,
        paymentMethod,
      });
      const dueLabel =
        dueNow > 0
          ? ` · Paid ${formatMoney(paidNow)} · Due ${formatMoney(dueNow)}`
          : '';
      const gstLabel = resolvedGstin ? ' · B2B' : '';
      toast.push(
        `Sale invoice ${response.data.order_number} posted to Books${dueLabel}${gstLabel} · ${formatMoney(totals.payable)}`,
        'success',
      );
      setMessage(`Sale invoice ${response.data.order_number} posted to Books`);
      if (response.data.books_voucher_id) {
        setDocActions({
          kind: 'sale',
          id: response.data.books_voucher_id,
          number: response.data.books_voucher_number || response.data.order_number,
          businessId,
        });
      } else {
        navigation.navigate('ShopBooksSale');
      }
    } catch (err) {
      const fallback =
        isOrder || isChallan
          ? isPurchaseOrder
            ? "Couldn't create this purchase order. Try again."
            : isChallan
              ? "Couldn't create this delivery challan. Try again."
              : "Couldn't create this sale order. Try again."
          : isQuotation
            ? "Couldn't create this quotation. Try again."
            : isNote
              ? "Couldn't record this note. Try again."
              : isPurchase
                ? "Couldn't record this purchase. Try again."
                : "Couldn't create this bill. Try again.";
      const text = getApiErrorMessage(err, fallback);
      setMessage(text);
      toast.push(text, 'error');
    } finally {
      setBusy(false);
    }
  }

  const payableShown = totals.payable;
  const tillPayment =
    mode === 'sale' &&
    !isDocument &&
    !isNote &&
    (paymentMethod === 'cash' ||
      paymentMethod === 'upi' ||
      paymentMethod === 'card' ||
      paymentMethod === 'borrow');
  const receivedAmount = useMemo(() => {
    if (!tillPayment) return payableShown;
    if (paymentMethod === 'borrow' && !amountReceivedTouched && amountReceived === '') return 0;
    if (!amountReceivedTouched && amountReceived === '' && paymentMethod !== 'borrow') {
      return payableShown;
    }
    const parsed = Number(amountReceived);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.min(payableShown, Math.round((parsed + Number.EPSILON) * 100) / 100);
  }, [tillPayment, paymentMethod, amountReceived, amountReceivedTouched, payableShown]);
  const balanceDue = useMemo(
    () => Math.max(0, Math.round((payableShown - receivedAmount + Number.EPSILON) * 100) / 100),
    [payableShown, receivedAmount],
  );

  useEffect(() => {
    if (!tillPayment || amountReceivedTouched) return;
    if (paymentMethod === 'borrow') {
      setAmountReceived('');
      return;
    }
    setAmountReceived(
      payableShown > 0 ? String(Math.round((payableShown + Number.EPSILON) * 100) / 100) : '',
    );
  }, [tillPayment, paymentMethod, payableShown, amountReceivedTouched]);

  const billCgst = Math.round((totals.taxTotal / 2) * 100) / 100;
  const billSgst = Math.round((totals.taxTotal - billCgst) * 100) / 100;
  const pointsToEarn = useMemo(() => {
    if (!loyaltyProgramOn || !customerId) return 0;
    return earnPointsForSpend(payableShown, loyaltyPrefs);
  }, [loyaltyProgramOn, customerId, payableShown, loyaltyPrefs]);
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
                  : balanceDue > 0
                    ? `Save · Pay ${formatMoney(receivedAmount)} · Due ${formatMoney(balanceDue)}`
                    : `Charge ${formatMoney(payableShown)}`;

  return (
    <DesktopPage maxWidth={1100}>
    <DocumentActionsSheet
      visible={Boolean(docActions)}
      onClose={() => {
        const kind = docActions?.kind;
        setDocActions(null);
        if (kind === 'quotation') navigation.navigate('ShopBooksQuotations');
        else if (kind === 'delivery_challan') navigation.navigate('ShopBooksDocuments', { docType: 'delivery_challan' });
        else if (kind === 'credit_note' || kind === 'debit_note') navigation.navigate('ShopBooksNotes');
        else if (kind === 'sale') navigation.navigate('ShopBooksSale');
      }}
      target={docActions}
      title={
        docActions?.kind === 'quotation'
          ? 'Quotation created'
          : docActions?.kind === 'delivery_challan'
            ? 'Challan created'
            : docActions?.kind === 'credit_note'
              ? 'Credit note created'
              : docActions?.kind === 'debit_note'
                ? 'Debit note created'
                : 'Bill created'
      }
      allowNewBill={docActions?.kind === 'sale'}
      onNewBill={() => setDocActions(null)}
    />
    <View style={[styles.screen, !isDesktop && styles.screenMobile, { paddingTop: spacing.sm }]}>
      <View style={[styles.invoice, !isDesktop && styles.invoiceMobile]}>
      <KeyboardAwareScrollView
        style={styles.billScroll}
        contentContainerStyle={[styles.invoiceContent, !isDesktop && styles.invoiceContentMobile]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={isDesktop ? spacing.xl : 96}
        showsVerticalScrollIndicator={false}
        refreshControl={shopListRefreshControl(refreshing, onRefresh)}
      >
        <View style={styles.invoiceTop}>
          {usesSupplier ? (
            <View style={styles.customerRow}>
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
            </View>
          ) : (
            <View style={styles.customerRow}>
              <View style={styles.customerField}>
                <SelectField
                  label="Customer"
                  required={isCreditNote || (!isSaleOrder && !isChallan && !isQuotation)}
                  value={customerId}
                  options={customerOptions}
                  onChange={updateCustomerId}
                  searchable
                  placeholder={
                    isCreditNote
                      ? 'Select customer'
                      : isSaleOrder || isChallan
                        ? 'Customer (optional)'
                        : 'Walk-in / Cash sale'
                  }
                />
              </View>
              {!isDocument || isQuotation || isCreditNote || isSaleOrder || isChallan ? (
                <Pressable
                  style={styles.sideAddBtn}
                  onPress={openAddCustomer}
                  accessibilityLabel="Add customer"
                >
                  <Feather name="plus" size={18} color="#fff" />
                </Pressable>
              ) : null}
            </View>
          )}
        </View>

        {message ? (
          <FormAlert
            message={message}
            tone={message.toLowerCase().includes('posted') || message.toLowerCase().includes('saved') ? 'success' : 'error'}
          />
        ) : null}

        <View style={styles.itemSearchRow}>
          <Pressable
            style={styles.scanIconBtn}
            onPress={() => navigation.navigate('BarcodeScanner', { target: 'pos' })}
            accessibilityLabel="Scan barcode"
          >
            <Feather name="maximize" size={18} color={colors.primary} />
          </Pressable>
          <View style={[styles.itemSearchField, !isDesktop && styles.itemSearchFieldMobile]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={styles.itemSearchInput}
              value={scan}
              onChangeText={(value) => {
                setScan(value);
                setProductQuery(value);
                if (value.trim()) setMessage(null);
              }}
              onSubmitEditing={() => void resolveCode(scan)}
              placeholder="Item name or barcode"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              autoFocus={Platform.OS === 'web'}
            />
            {scan ? (
              <Pressable
                onPress={() => {
                  setScan('');
                  setProductQuery('');
                }}
                hitSlop={8}
              >
                <Feather name="x" size={14} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {scan.trim() ? (
          <View style={styles.suggestBlock}>
            {scanSuggestions.length ? (
              scanSuggestions.map((product) => {
                const inBasket = basket.find((line) => line.product.id === product.id);
                return (
                  <Pressable
                    key={product.id}
                    style={({ pressed }) => [styles.suggestRow, pressed && styles.suggestRowPressed]}
                    onPress={() => {
                      addProduct(product, matchedScanCode(product, scan));
                      setScan('');
                      setProductQuery('');
                    }}
                  >
                    <ProductThumb product={product} size={36} />
                    <View style={styles.productCopy}>
                      <Text style={styles.suggestName} numberOfLines={1}>
                        {product.name}
                      </Text>
                      <Text style={styles.meta}>{formatMoney(product.price)}</Text>
                    </View>
                    {inBasket ? (
                      <Text style={styles.inBasketPillText}>×{inBasket.quantity}</Text>
                    ) : (
                      <Feather name="plus" size={16} color={colors.primary} />
                    )}
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.suggestEmpty}>
                <Text style={styles.meta}>No match found.</Text>
                <View style={styles.suggestEmptyActions}>
                  <Button label="Browse" variant="soft" icon="grid" onPress={() => setProductPickerOpen(true)} />
                  <Button label="Add product" icon="plus" onPress={openAddProduct} />
                </View>
              </View>
            )}
          </View>
        ) : null}

        <View style={[styles.table, !isDesktop && styles.tableMobile]}>
          {isDesktop ? (
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.colItem]}>#  ITEM</Text>
              <Text style={[styles.th, styles.colQty, styles.thCenter]}>QTY</Text>
              <Text style={[styles.th, styles.colPrice, styles.thRight]}>PRICE</Text>
              <View style={styles.colDiscPair}>
                <Text style={[styles.th, styles.thCenter, { flex: 1 }]}>DISC %</Text>
                <Text style={[styles.th, styles.thCenter, { flex: 1 }]}>DISC ₹</Text>
              </View>
              <Text style={[styles.th, styles.colAmt, styles.thRight]}>AMOUNT</Text>
              <View style={styles.colAction} />
            </View>
          ) : null}

          {basket.length === 0 ? (
            <View style={styles.tableEmpty}>
              <Text style={styles.meta}>No items yet. Search or add a row.</Text>
            </View>
          ) : (
            basket.map((line, index) => {
              const priced = lineLevelTotals.lines.find((row) => row.id === line.product.id);
              const lineGross = Math.round((Number(line.product.price) * line.quantity + Number.EPSILON) * 100) / 100;
              const setLineDiscount = (type: DiscountType, value: number) => {
                updateLine(line.product.id, {
                  discountType: type === 'amount' || type === 'percent' ? type : '',
                  discountValue: Number.isFinite(value) && value > 0 ? value : 0,
                });
              };

              if (!isDesktop) {
                return (
                  <View key={line.product.id} style={styles.mobileLine}>
                    <View style={styles.mobileLineTop}>
                      <Text style={styles.rowIndex}>{index + 1}.</Text>
                      <ProductThumb product={line.product} size={48} />
                      <View style={styles.mobileLineCopy}>
                        <Text style={styles.rowItemName} numberOfLines={2}>
                          {line.product.name}
                        </Text>
                        <Text style={styles.meta}>{formatMoney(line.product.price)} each</Text>
                      </View>
                      <Pressable
                        onPress={() => updateLine(line.product.id, { quantity: 0 })}
                        hitSlop={8}
                        accessibilityLabel="Remove item"
                      >
                        <Feather name="x" size={18} color={colors.mutedForeground} />
                      </Pressable>
                    </View>

                    <View style={styles.mobileFieldRow}>
                      <View style={styles.mobileColQty}>
                        <Text style={styles.mobileFieldLabel}>QTY</Text>
                        <View style={styles.qtyCluster}>
                          <Pressable
                            style={styles.qtyBtnMobile}
                            onPress={() => updateLine(line.product.id, { quantity: line.quantity - 1 })}
                          >
                            <Text style={styles.qtyBtnText}>−</Text>
                          </Pressable>
                          <Text style={styles.qtyMobile}>{line.quantity}</Text>
                          <Pressable
                            style={styles.qtyBtnMobile}
                            onPress={() => updateLine(line.product.id, { quantity: line.quantity + 1 })}
                          >
                            <Text style={styles.qtyBtnText}>+</Text>
                          </Pressable>
                        </View>
                      </View>

                      <View style={styles.mobileColDisc}>
                        <Text style={styles.mobileFieldLabel}>DISC</Text>
                        <DualDiscountFields
                          lineGross={lineGross}
                          discountType={line.discountType}
                          discountValue={line.discountValue}
                          onChange={setLineDiscount}
                        />
                      </View>

                      <View style={styles.mobileColAmt}>
                        <Text style={styles.mobileFieldLabel}>AMOUNT</Text>
                        <Text style={styles.mobileAmountValue} numberOfLines={1}>
                          {formatMoney(priced?.amount ?? lineGross)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }

              return (
                <View key={line.product.id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                  <View style={styles.colItem}>
                    <Text style={styles.rowIndex}>{index + 1}.</Text>
                    <ProductThumb product={line.product} size={40} />
                    <View style={styles.rowItemCopy}>
                      <Text style={styles.rowItemName} numberOfLines={2}>
                        {line.product.name}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.colQty}>
                    <View style={styles.qtyCluster}>
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
                    </View>
                  </View>
                  <Text style={[styles.rowNum, styles.colPrice]} numberOfLines={1}>
                    {formatMoney(line.product.price)}
                  </Text>
                  <View style={styles.colDiscPair}>
                    <DualDiscountFields
                      lineGross={lineGross}
                      discountType={line.discountType}
                      discountValue={line.discountValue}
                      onChange={setLineDiscount}
                    />
                  </View>
                  <View style={styles.colAmt}>
                    <Text style={styles.rowAmt} numberOfLines={1}>
                      {formatMoney(priced?.amount ?? lineGross)}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.colAction}
                    onPress={() => updateLine(line.product.id, { quantity: 0 })}
                    hitSlop={6}
                    accessibilityLabel="Remove item"
                  >
                    <Feather name="x" size={14} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              );
            })
          )}

          <View style={styles.addRowBar}>
            <Pressable style={styles.addRowBtn} onPress={() => setProductPickerOpen(true)}>
              <Feather name="plus" size={14} color={colors.primary} />
              <Text style={styles.addRowText}>ADD ROW</Text>
            </Pressable>
            {basket.length > 0 ? (
              <View style={styles.tableFoot}>
                <Text style={styles.tableFootLabel}>Qty {basket.reduce((n, l) => n + l.quantity, 0)}</Text>
                {lineLevelTotals.lineDiscountTotal > 0 ? (
                  <Text style={styles.tableFootLabel}>Disc {formatMoney(lineLevelTotals.lineDiscountTotal)}</Text>
                ) : null}
                <Text style={styles.tableFootAmt}>
                  {formatMoney(lineLevelTotals.merchandiseAfterLineDiscount)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={[styles.checkoutSplit, checkoutSideBySide && styles.checkoutSplitDesktop]}>
          <View style={[styles.paymentPane, checkoutSideBySide && styles.paymentPaneDesktop]}>
            <Text style={styles.summaryHeading}>
              {!isDocument && !isNote ? 'Payment' : isNote ? 'Settlement' : 'Details'}
            </Text>

            {!isDocument && !isNote ? (
              <View style={styles.summaryPaymentBlock}>
                <Text style={styles.fieldLabel}>Payment type</Text>
                <View style={styles.discountRow}>
                  {(
                    [
                      { value: 'cash', label: 'Cash' },
                      { value: 'upi', label: 'UPI' },
                      { value: 'card', label: 'Card' },
                      { value: 'borrow', label: isPurchase ? 'Unpaid' : 'Credit' },
                    ] as const
                  ).map((method) => (
                    <Chip
                      key={method.value}
                      label={method.label}
                      active={paymentMethod === method.value}
                      onPress={() => {
                        setPaymentMethod(method.value);
                        setAmountReceivedTouched(false);
                        if (!isPurchase) writePosSession({ paymentMethod: method.value });
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
                {tillPayment ? (
                  <View style={{ gap: 6 }}>
                    <Text style={styles.fieldLabel}>
                      {paymentMethod === 'borrow' ? 'Amount paid now (optional)' : 'Amount received'}
                    </Text>
                    <TextInput
                      style={styles.billDiscInput}
                      value={
                        amountReceivedTouched || amountReceived !== ''
                          ? amountReceived
                          : paymentMethod === 'borrow'
                            ? ''
                            : payableShown > 0
                              ? String(Math.round((payableShown + Number.EPSILON) * 100) / 100)
                              : ''
                      }
                      onChangeText={(value) => {
                        setAmountReceivedTouched(true);
                        setAmountReceived(sanitizeDecimalInput(value));
                      }}
                      keyboardType="decimal-pad"
                      placeholder={paymentMethod === 'borrow' ? '0' : String(payableShown || '')}
                      placeholderTextColor={colors.mutedForeground}
                    />
                    <Text style={styles.hint}>
                      {balanceDue > 0
                        ? `Balance due ${formatMoney(balanceDue)} goes to the customer’s credit.`
                        : 'Bill will be marked fully paid.'}
                    </Text>
                  </View>
                ) : null}
                {(paymentMethod === 'borrow' || balanceDue > 0) && !isPurchase ? (
                  <Text style={styles.hint}>Customer required when any amount is due (not Walk-in).</Text>
                ) : null}
              </View>
            ) : null}

            {isNote ? (
              <View style={styles.summaryPaymentBlock}>
                <View style={styles.discountRow}>
                  <Chip
                    label={isCreditNote ? 'Adjust balance' : 'Adjust payable'}
                    active={noteSettlement === 'adjust'}
                    onPress={() => setNoteSettlement('adjust')}
                  />
                  <Chip
                    label={isCreditNote ? 'Refund cash' : 'Receive cash'}
                    active={noteSettlement === 'cash'}
                    onPress={() => setNoteSettlement('cash')}
                  />
                </View>
                {noteSettlement === 'cash' ? (
                  <SelectField
                    label={isCreditNote ? 'Refund from' : 'Receive into'}
                    required
                    value={cashAccountId}
                    options={cashAccountOptions}
                    onChange={setCashAccountId}
                    placeholder="Select account"
                  />
                ) : null}
                <Input
                  label="Notes"
                  optional
                  value={documentNotes}
                  onChangeText={setDocumentNotes}
                  placeholder={isCreditNote ? 'e.g. Return of damaged goods' : 'e.g. Rate difference'}
                  multiline
                />
              </View>
            ) : null}

            {isQuotation ? (
              <DateField
                label="Valid until"
                optional
                value={validUntil}
                onChange={setValidUntil}
                helperText="Optional expiry date for this quotation."
              />
            ) : null}

            {(isOrder || isChallan) && !isNote ? (
              <Text style={styles.hint}>
                {isPurchaseOrder
                  ? 'No payment and no stock change yet. Convert to a purchase bill when goods arrive.'
                  : isChallan
                    ? 'No invoice and no payment. Stock is deducted when dispatched.'
                    : 'No payment and no stock change yet. Convert to a sale invoice when you deliver.'}
              </Text>
            ) : null}

            {showGstFields ? (
              <Input
                label="GSTIN"
                optional
                value={partyGstin}
                onChangeText={updatePartyGstin}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={15}
                placeholder="Optional for B2C"
                error={partyGstin.length > 0 && !billGstinCheck.ok ? billGstinCheck.message : undefined}
              />
            ) : null}

            {mode === 'sale' && customerId && automationOffers.length > 0 ? (
              <View style={styles.offerList}>
                {automationOffers.map((offer) => {
                  const dtype = offer.discount_type === 'amount' ? 'amount' : 'percent';
                  const active =
                    billDiscountType === dtype &&
                    String(Number(billDiscountValue) || 0) === String(Number(offer.discount_value) || 0);
                  const badge =
                    dtype === 'amount'
                      ? `${formatMoney(Number(offer.discount_value) || 0)} off`
                      : `${Number(offer.discount_value) || 0}% off`;
                  return (
                    <Pressable
                      key={`${offer.label}-${offer.discount_value}`}
                      style={[styles.offerChip, active && styles.offerChipOn]}
                      onPress={() => {
                        setBillDiscountType(dtype);
                        setBillDiscountValue(offer.discount_value);
                        writePosSession({
                          billDiscountType: dtype,
                          billDiscountValue: offer.discount_value,
                        });
                      }}
                    >
                      <Text style={[styles.offerChipText, active && styles.offerChipTextOn]}>
                        {badge} · {offer.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          <View style={[styles.summaryPane, checkoutSideBySide && styles.summaryPaneDesktop]}>
            <Text style={styles.summaryHeading}>Bill summary</Text>

            <View style={styles.totalRow}>
              <Text style={styles.meta}>Items</Text>
              <Text style={styles.summaryMoney}>{formatMoney(lineLevelTotals.merchandiseGross)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.meta}>Product discount</Text>
              <Text
                style={[
                  styles.summaryMoney,
                  lineLevelTotals.lineDiscountTotal > 0 && styles.summaryDisc,
                ]}
              >
                {lineLevelTotals.lineDiscountTotal > 0
                  ? `-${formatMoney(lineLevelTotals.lineDiscountTotal)}`
                  : formatMoney(0)}
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.meta}>Subtotal</Text>
              <Text style={styles.summaryMoney}>
                {formatMoney(lineLevelTotals.merchandiseAfterLineDiscount)}
              </Text>
            </View>
            {!isChallan ? (
              <View style={styles.totalRow}>
                <Text style={styles.meta}>Bill discount</Text>
                <View style={styles.billDiscRight}>
                  <View style={styles.billDiscTypeTrack}>
                    <Pressable
                      style={[
                        styles.billDiscTypeBtn,
                        billDiscountType === 'percent' && styles.billDiscTypeBtnOn,
                      ]}
                      onPress={() => {
                        const next: DiscountType = billDiscountType === 'percent' ? '' : 'percent';
                        setBillDiscountType(next);
                        if (!next) setBillDiscountValue('');
                        writePosSession({
                          billDiscountType: next,
                          billDiscountValue: next ? billDiscountValue : '',
                        });
                      }}
                    >
                      <Text
                        style={[
                          styles.billDiscTypeText,
                          billDiscountType === 'percent' && styles.billDiscTypeTextOn,
                        ]}
                      >
                        %
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.billDiscTypeBtn,
                        billDiscountType === 'amount' && styles.billDiscTypeBtnOn,
                      ]}
                      onPress={() => {
                        const next: DiscountType = billDiscountType === 'amount' ? '' : 'amount';
                        setBillDiscountType(next);
                        if (!next) setBillDiscountValue('');
                        writePosSession({
                          billDiscountType: next,
                          billDiscountValue: next ? billDiscountValue : '',
                        });
                      }}
                    >
                      <Text
                        style={[
                          styles.billDiscTypeText,
                          billDiscountType === 'amount' && styles.billDiscTypeTextOn,
                        ]}
                      >
                        ₹
                      </Text>
                    </Pressable>
                  </View>
                  <TextInput
                    style={styles.billDiscInput}
                    value={billDiscountType ? billDiscountValue : ''}
                    editable={Boolean(billDiscountType)}
                    onChangeText={(value) => {
                      const cleaned = sanitizeDecimalInput(value);
                      setBillDiscountValue(cleaned);
                      writePosSession({ billDiscountValue: cleaned });
                    }}
                    keyboardType="decimal-pad"
                    placeholder=""
                    placeholderTextColor={colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.summaryMoney,
                      totals.billDiscountAmount > 0 && styles.summaryDisc,
                    ]}
                  >
                    {totals.billDiscountAmount > 0
                      ? `-${formatMoney(totals.billDiscountAmount)}`
                      : formatMoney(0)}
                  </Text>
                </View>
              </View>
            ) : null}

            {loyaltyProgramOn && customerId && loyaltyMaxPoints >= loyaltyPrefs.min_redeem_points ? (
              <View style={styles.loyaltyInline}>
                <Text style={styles.fieldLabel}>
                  Redeem points · balance {selectedPosCustomer?.loyalty_points ?? 0}
                </Text>
                <View style={styles.redeemRow}>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() =>
                      setPointsToRedeem((current) => {
                        if (current <= 0) return 0;
                        const next = current - Math.max(1, loyaltyPrefs.min_redeem_points);
                        return next < loyaltyPrefs.min_redeem_points ? 0 : next;
                      })
                    }
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.qty}>{pointsToRedeem}</Text>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() =>
                      setPointsToRedeem((current) => {
                        const stepAmount = Math.max(1, loyaltyPrefs.min_redeem_points);
                        if (current <= 0) return Math.min(loyaltyMaxPoints, stepAmount);
                        return Math.min(loyaltyMaxPoints, current + stepAmount);
                      })
                    }
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                  <Pressable onPress={() => setPointsToRedeem(loyaltyMaxPoints)}>
                    <Text style={styles.addRowText}>Max</Text>
                  </Pressable>
                  {pointsToRedeem > 0 ? (
                    <Text style={styles.meta}>−{formatMoney(loyaltyDiscount)}</Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {totals.loyaltyDiscountAmount > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.meta}>
                  Points redeemed{pointsToRedeem > 0 ? ` (${pointsToRedeem})` : ''}
                </Text>
                <Text style={[styles.summaryMoney, styles.summaryDisc]}>
                  -{formatMoney(totals.loyaltyDiscountAmount)}
                </Text>
              </View>
            ) : null}

            {loyaltyProgramOn && customerId ? (
              <View style={styles.totalRow}>
                <View style={styles.loyaltyAwardLeft}>
                  <Switch
                    value={awardLoyaltyPoints}
                    disabled={pointsToEarn <= 0}
                    onValueChange={setAwardLoyaltyPoints}
                    trackColor={{ false: colors.borderStrong, true: colors.tintStrong }}
                    thumbColor={awardLoyaltyPoints && pointsToEarn > 0 ? colors.primary : '#f4f3f4'}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.meta}>Give loyalty points</Text>
                    <Text style={styles.loyaltyAwardHint}>
                      {pointsToEarn > 0
                        ? `${loyaltyPrefs.earn_points_per_100} pt per ₹100 · based on bill total`
                        : 'No points on this bill amount'}
                      {paymentMethod === 'borrow' && pointsToEarn > 0 ? ' · credited when paid' : ''}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.summaryMoney,
                    awardLoyaltyPoints && pointsToEarn > 0 && styles.loyaltyAwardValue,
                  ]}
                >
                  {pointsToEarn > 0 ? `+${pointsToEarn}` : '0'}
                </Text>
              </View>
            ) : null}

            <View style={styles.totalRow}>
              <Text style={styles.meta}>Taxable</Text>
              <Text style={styles.summaryMoney}>{formatMoney(totals.subtotal)}</Text>
            </View>
            {totals.taxTotal > 0 ? (
              billIsInterstate ? (
                <View style={styles.totalRow}>
                  <Text style={styles.meta}>IGST</Text>
                  <Text style={styles.summaryMoney}>{formatMoney(totals.taxTotal)}</Text>
                </View>
              ) : (
                <>
                  <View style={styles.totalRow}>
                    <Text style={styles.meta}>CGST</Text>
                    <Text style={styles.summaryMoney}>{formatMoney(billCgst)}</Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={styles.meta}>SGST</Text>
                    <Text style={styles.summaryMoney}>{formatMoney(billSgst)}</Text>
                  </View>
                </>
              )
            ) : (
              <View style={styles.totalRow}>
                <Text style={styles.meta}>Tax</Text>
                <Text style={styles.summaryMoney}>{formatMoney(totals.taxTotal)}</Text>
              </View>
            )}

            <View style={[styles.totalRow, styles.totalRowStrong]}>
              <Text style={styles.payableLabel}>Total</Text>
              <Text style={styles.payableValue}>{formatMoney(payableShown)}</Text>
            </View>
            {tillPayment ? (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.meta}>Received</Text>
                  <Text style={styles.summaryMoney}>{formatMoney(receivedAmount)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={[styles.meta, balanceDue > 0 && { color: colors.warning }]}>
                    Balance due
                  </Text>
                  <Text
                    style={[
                      styles.summaryMoney,
                      balanceDue > 0 && { color: colors.warning, fontFamily: fonts.bodyBold },
                    ]}
                  >
                    {formatMoney(balanceDue)}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <StickyFooterBar style={styles.saveBar}>
          <View style={styles.chargeMeta}>
            <Text style={styles.chargeHint}>
              {isDocument || isNote
                ? checkoutLabel
                : paymentMethod === 'borrow'
                  ? isPurchase
                    ? 'Unpaid'
                    : 'Credit'
                  : paymentMethod === 'upi'
                    ? 'UPI'
                    : paymentMethod === 'card'
                      ? 'Card'
                      : 'Cash'}
              {' · '}
              {basket.length} item{basket.length === 1 ? '' : 's'}
            </Text>
            <Text style={styles.chargeAmount}>{formatMoney(payableShown)}</Text>
          </View>
          <Button
            label={busy ? 'Saving…' : isDocument || isNote || isPurchase ? checkoutLabel : 'Save'}
            icon="save"
            size="lg"
            fullWidth
            loading={busy}
            disabled={!basket.length || busy}
            onPress={() => void checkout()}
          />
        </StickyFooterBar>
      </KeyboardStickyView>
      </View>

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
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  screenMobile: { paddingHorizontal: spacing.sm },
  invoice: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  invoiceMobile: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: colors.background,
  },
  invoiceContent: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  invoiceContentMobile: { paddingHorizontal: spacing.xs, paddingTop: spacing.xs, gap: spacing.sm },
  invoiceTop: { gap: spacing.sm },
  customerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  customerField: { flex: 1 },
  sideAddBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  itemSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanIconBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  itemSearchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  itemSearchFieldMobile: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  itemSearchInput: {
    flex: 1,
    ...typography.body,
    fontSize: 15,
    color: colors.foreground,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },
  suggestBlock: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
    maxHeight: 200,
    backgroundColor: colors.card,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestRowPressed: { backgroundColor: colors.tint },
  suggestName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.foreground },
  suggestEmpty: { padding: spacing.md, gap: spacing.sm },
  suggestEmptyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  inBasketPillText: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 12 },
  table: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  tableMobile: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    gap: 8,
  },
  mobileLine: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  mobileLineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  mobileLineCopy: { flex: 1, minWidth: 0, gap: 2 },
  mobileFieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  mobileColQty: {
    gap: 4,
    flexShrink: 0,
  },
  mobileColDisc: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  mobileColAmt: {
    width: 72,
    flexShrink: 0,
    gap: 4,
    alignItems: 'flex-end',
  },
  mobileFieldLabel: {
    fontSize: 10,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
    letterSpacing: 0.4,
  },
  qtyMobile: {
    minWidth: 22,
    textAlign: 'center',
    color: colors.foreground,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  mobileAmountValue: {
    fontSize: 15,
    fontFamily: fonts.bodyBold,
    color: colors.foreground,
    letterSpacing: -0.2,
    textAlign: 'right',
    minHeight: 40,
    textAlignVertical: 'center',
    paddingTop: 10,
  },
  qtyBtnMobile: {
    width: 34,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  dualDiscRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  dualDiscCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: 6,
    gap: 2,
  },
  dualDiscCellPct: {},
  dualDiscCellAmt: {},
  dualDiscInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 38,
    paddingVertical: Platform.OS === 'web' ? 6 : 4,
    paddingHorizontal: 2,
    textAlign: 'right',
    color: colors.foreground,
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  dualDiscSuffix: { fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.bodySemi },
  dualDiscPrefix: { fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.bodySemi },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#F3F4F6',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
    gap: 8,
  },
  th: {
    fontSize: 10,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
    letterSpacing: 0.3,
  },
  thCenter: { textAlign: 'center' },
  thRight: { textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 8,
  },
  tableRowAlt: { backgroundColor: '#FAFBFC' },
  tableEmpty: { padding: spacing.lg, alignItems: 'center' },
  colItem: { flex: 1.8, minWidth: 140, flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  colQty: { width: 100, alignItems: 'center', flexShrink: 0 },
  colPrice: { width: 72, textAlign: 'right', flexShrink: 0 },
  colDiscPair: { width: 168, flexShrink: 0 },
  colAmt: { width: 88, alignItems: 'flex-end', flexShrink: 0 },
  colAction: { width: 24, alignItems: 'center', flexShrink: 0 },
  rowIndex: { fontSize: 12, color: colors.mutedForeground, width: 18 },
  rowItemCopy: { flex: 1, minWidth: 0 },
  rowItemName: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.foreground },
  rowNum: { fontSize: 13, color: colors.foreground, fontFamily: fonts.bodyMedium },
  rowAmt: { fontSize: 14, color: colors.foreground, fontFamily: fonts.bodyBold, textAlign: 'right' },
  addRowBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  addRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  addRowText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.primary, letterSpacing: 0.4 },
  tableFoot: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tableFootLabel: { fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.bodySemi },
  tableFootAmt: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.foreground },
  fieldLabel: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
  },
  summaryHeading: {
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    color: colors.foreground,
    marginBottom: 2,
  },
  checkoutSplit: {
    width: '100%',
    gap: spacing.sm,
    flexDirection: 'column-reverse',
  },
  checkoutSplitDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  paymentPane: {
    width: '100%',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  paymentPaneDesktop: {
    flex: 1.1,
    minWidth: 280,
  },
  summaryPane: {
    width: '100%',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  summaryPaneDesktop: {
    flex: 0.9,
    minWidth: 260,
  },
  summaryPaymentBlock: {
    gap: 8,
  },
  loyaltyInline: { gap: 6 },
  loyaltyAwardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  loyaltyAwardHint: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginTop: 2,
    lineHeight: 14,
  },
  loyaltyAwardValue: {
    color: colors.success,
    fontFamily: fonts.bodySemi,
  },
  offerList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  offerChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  offerChipOn: { borderColor: colors.primary, backgroundColor: colors.tint },
  offerChipText: { fontSize: 12, color: colors.foreground },
  offerChipTextOn: { color: colors.primary, fontFamily: fonts.bodySemi },
  billDiscRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  billDiscTypeTrack: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  billDiscTypeBtn: {
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billDiscTypeBtnOn: { backgroundColor: colors.primary },
  billDiscTypeText: { fontSize: 12, fontFamily: fonts.bodySemi, color: colors.mutedForeground },
  billDiscTypeTextOn: { color: colors.primaryForeground },
  billDiscInput: {
    width: 64,
    minHeight: 32,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    textAlign: 'right',
    color: colors.foreground,
    backgroundColor: colors.card,
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  summaryMoney: {
    minWidth: 72,
    textAlign: 'right',
    color: colors.mutedForeground,
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
  },
  totalRowStrong: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
  },
  summaryDisc: { color: '#B45309', fontFamily: fonts.bodySemi },
  saveBar: { borderTopWidth: 1, borderTopColor: colors.border },
  billScroll: { flex: 1 },
  qtyCluster: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  redeemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  hint: {
    marginTop: spacing.xs,
    color: colors.mutedForeground,
    fontSize: 12,
    lineHeight: 17,
  },
  name: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.foreground },
  discBadge: { fontSize: 11, fontWeight: '700', color: '#B45309' },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  qtyBtnText: { fontSize: 16, color: colors.primary, fontWeight: '700', lineHeight: 18 },
  qty: { minWidth: 20, textAlign: 'center', color: colors.foreground, fontWeight: '700', fontSize: 14 },
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
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.tint,
    gap: 10,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  payableLabel: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.foreground },
  payableValue: { fontFamily: fonts.bodyBold, fontSize: 24, color: colors.primary, letterSpacing: -0.4 },
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
