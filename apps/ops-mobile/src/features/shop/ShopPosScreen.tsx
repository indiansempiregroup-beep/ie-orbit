import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  Customer,
  ShopCashAccount,
  ShopCouponOffer,
  ShopProduct,
  ShopSupplier,
} from '@ie-orbit/sdk';
import { SHOP_PRODUCT_CATEGORIES } from '@ie-orbit/sdk';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { SheetHandle } from '../../components/SheetHandle';
import { ExpandableSheetView, useExpandableSheet } from '../../hooks/useExpandableSheet';
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

function modeTitle(t: TFunction, mode: PosMode, editing = false) {
  if (mode === 'purchase') return t(editing ? 'shop.pos.modeTitle.editPurchase' : 'shop.pos.modeTitle.purchase');
  if (mode === 'quotation') {
    return t(editing ? 'shop.pos.modeTitle.editQuotation' : 'shop.pos.modeTitle.newQuotation');
  }
  if (mode === 'credit_note') return t('shop.pos.modeTitle.creditNote');
  if (mode === 'debit_note') return t('shop.pos.modeTitle.debitNote');
  if (mode === 'sale_order') {
    return t(editing ? 'shop.pos.modeTitle.editSaleOrder' : 'shop.pos.modeTitle.newSaleOrder');
  }
  if (mode === 'purchase_order') {
    return t(editing ? 'shop.pos.modeTitle.editPurchaseOrder' : 'shop.pos.modeTitle.newPurchaseOrder');
  }
  if (mode === 'delivery_challan') {
    return t(editing ? 'shop.pos.modeTitle.editChallan' : 'shop.pos.modeTitle.newChallan');
  }
  return t('shop.pos.modeTitle.sale');
}

function basketFromLines(rawLines: unknown, catalog: ShopProduct[]): BasketLine[] {
  const rows = Array.isArray(rawLines) ? rawLines : [];
  return rows.flatMap((raw) => {
    const line = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    if (!line) return [];
    const productId = String(line.product_id || line.product || '').trim();
    if (!productId) return [];
    const quantity = Number(line.quantity ?? line.qty ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return [];
    const catalogProduct = catalog.find((product) => product.id === productId);
    const rate = line.unit_price ?? line.rate ?? catalogProduct?.price ?? 0;
    const gst = line.tax_rate ?? line.gst_rate ?? catalogProduct?.gst_rate ?? catalogProduct?.tax_rate ?? 0;
    const product: ShopProduct = catalogProduct
      ? { ...catalogProduct, price: String(rate), gst_rate: String(gst), tax_rate: String(gst) }
      : ({
          id: productId,
          name: String(line.name || 'Item'),
          price: String(rate),
          gst_rate: String(gst),
          tax_rate: String(gst),
          stock_on_hand: 0,
        } as ShopProduct);
    return [{ product, quantity, discountType: '' as const, discountValue: 0 }];
  });
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
  const { t } = useTranslation();
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
        accessibilityLabel={t('shop.pos.a11yDiscountPercent')}
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
        accessibilityLabel={t('shop.pos.a11yDiscountAmount')}
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
  const { t } = useTranslation();
  const { isDesktop, width: viewportWidth } = useBreakpoint();
  /** Side-by-side Payment | Bill summary on OPS web / wide desktop. */
  const checkoutSideBySide = isDesktop || viewportWidth >= 720;
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
  const editQuotationId = isQuotation ? route.params?.quotationId : undefined;
  const editDocumentId = isOrder || isChallan ? route.params?.documentId : undefined;
  const isEditing = Boolean(editQuotationId || editDocumentId);
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
  const { lift, bottomPad, keyboardOpen, onSheetLayout, sheetMotionStyle, handleProps } = useExpandableSheet(
    0.72,
    productPickerOpen,
    { fixedResting: true },
  );
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
      discount_amount?: string;
    }>
  >([]);
  const [couponOffers, setCouponOffers] = useState<ShopCouponOffer[]>([]);
  const [appliedCouponCode, setAppliedCouponCode] = useState('');
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
  const [message, setMessageState] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('error');
  const setMessage = useCallback((text: string | null, tone: 'success' | 'error' = 'error') => {
    setMessageState(text);
    setMessageTone(tone);
  }, []);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [awardLoyaltyPoints, setAwardLoyaltyPoints] = useState(true);
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);

  const catalogLoadedRef = React.useRef(false);
  const hydratedEditRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: modeTitle(t, mode, isEditing),
    });
  }, [navigation, mode, isEditing, t]);

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
      const nextProducts = productsRes.data ?? [];
      setProducts(nextProducts);
      setBasket((current) => {
        if (!current.length) return current;
        const byId = new Map(nextProducts.map((product) => [product.id, product]));
        let changed = false;
        const next = current.map((line) => {
          const fresh = byId.get(line.product.id);
          if (!fresh) return line;
          if (
            fresh.name === line.product.name &&
            String(fresh.price) === String(line.product.price) &&
            String(fresh.stock_on_hand ?? '') === String(line.product.stock_on_hand ?? '') &&
            String(fresh.image_url || '') === String(line.product.image_url || '')
          ) {
            return line;
          }
          changed = true;
          return { ...line, product: fresh };
        });
        if (!changed) return current;
        if (!skipSaleSession) writePosSession({ basket: next });
        return next;
      });
      setCustomers(customersRes.data ?? []);
      setSuppliers(suppliersRes.data ?? []);
      const accounts = accountsRes.data ?? [];
      setCashAccounts(accounts);
      setCashAccountId((current) => current || accounts[0]?.id || '');
      catalogLoadedRef.current = true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('shop.pos.loadCatalogFailed'));
    } finally {
      setLoading(false);
    }
  }, [businessId, client, isPurchase, isNote, setMessage, skipSaleSession, t, usesSupplier]);

  useEffect(() => {
    const targetId = editQuotationId || editDocumentId;
    if (!targetId || !client || loading) return;
    if (hydratedEditRef.current === targetId) return;
    let cancelled = false;
    void (async () => {
      try {
        if (editQuotationId) {
          const response = await client.shop.getQuotation(editQuotationId);
          if (cancelled || !response.data) return;
          const quote = response.data;
          hydratedEditRef.current = editQuotationId;
          setCustomerId(quote.customer || '');
          setValidUntil(quote.valid_until || '');
          setDocumentNotes(quote.notes || '');
          setBasket(basketFromLines(quote.line_items, products));
          return;
        }
        if (!editDocumentId) return;
        const response = await client.shop.getDocument(editDocumentId);
        if (cancelled || !response.data) return;
        const document = response.data;
        hydratedEditRef.current = editDocumentId;
        setCustomerId(document.customer || '');
        setSupplierId(document.supplier || '');
        setDocumentNotes(document.notes || '');
        setBasket(basketFromLines(document.line_items, products));
      } catch (err) {
        if (cancelled) return;
        const text = getApiErrorMessage(err, t('shop.pos.couldntOpenRecord'));
        setMessage(text);
        toast.push(text, 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, editDocumentId, editQuotationId, loading, products, setMessage, t, toast]);

  useEffect(() => {
    if (editQuotationId || editDocumentId || !hydratedEditRef.current) return;
    hydratedEditRef.current = null;
    setBasket([]);
    setValidUntil('');
    setDocumentNotes('');
    setSupplierId('');
  }, [editDocumentId, editQuotationId]);

  const updateCustomerId = useCallback(
    (id: string) => {
      setCustomerId(id);
      setPointsToRedeem(0);
      setAppliedCouponCode('');
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
    if (!client || !businessId || mode !== 'sale') {
      setAutomationOffers([]);
      setCouponOffers([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await client.shop.eligibleOffers({
          business_id: businessId,
          ...(customerId ? { customer_id: customerId } : {}),
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
          discount_amount: String(row.discount_amount || '0'),
          source: String(row.source || 'automation'),
        }));
        setAutomationOffers(
          customerId ? autos.filter((row) => Number(row.discount_value) > 0) : [],
        );
        setCouponOffers(
          (res.data.coupons || []).filter(
            (row) => Boolean(row.code) && (row.applicable || Number(row.remaining_to_unlock || 0) > 0),
          ),
        );
      } catch {
        if (!cancelled) {
          setAutomationOffers([]);
          setCouponOffers([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [basket, businessId, client, customerId, mode]);

  const appliedCoupon = useMemo(() => {
    if (!appliedCouponCode) return null;
    return couponOffers.find((row) => row.code === appliedCouponCode) ?? null;
  }, [appliedCouponCode, couponOffers]);

  useEffect(() => {
    if (!appliedCouponCode) return;
    if (!appliedCoupon || !appliedCoupon.applicable) {
      setAppliedCouponCode('');
    }
  }, [appliedCoupon, appliedCouponCode]);

  const clearAppliedCoupon = useCallback(() => {
    setAppliedCouponCode('');
  }, []);

  const applyCouponOffer = useCallback((offer: ShopCouponOffer) => {
    const code = String(offer.code || '').trim();
    if (!code || !offer.applicable) return;
    setAppliedCouponCode(code);
    setBillDiscountType('');
    setBillDiscountValue('');
    writePosSession({ billDiscountType: '', billDiscountValue: '' });
  }, []);

  const applyAutomationOffer = useCallback(
    (offer: { discount_type: string; discount_value: string }) => {
      const dtype = offer.discount_type === 'amount' ? 'amount' : 'percent';
      setAppliedCouponCode('');
      setBillDiscountType(dtype);
      setBillDiscountValue(offer.discount_value);
      writePosSession({
        billDiscountType: dtype,
        billDiscountValue: offer.discount_value,
      });
    },
    [],
  );

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
        setMessage(t('shop.pos.addedProduct', { name: product.name }), 'success');
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
        setMessage(t('shop.pos.addedProduct', { name: response.data.name }), 'success');
      } catch (err) {
        const localMatches = products.filter((product) => scanMatchRank(product, trimmed) != null);
        if (localMatches.length) {
          setMessage(t('shop.pos.selectMatching'));
        } else {
          setMessage(err instanceof Error ? err.message : t('shop.pos.barcodeNotFound'));
        }
      } finally {
        setBusy(false);
      }
    },
    [businessId, client, products, setMessage, syncBasket, t],
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

      void loadCatalog();

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
            setMessage(t('shop.pos.addedProduct', { name: response.data.name }), 'success');
            await loadCatalog();
          } catch (err) {
            setMessage(err instanceof Error ? err.message : t('shop.pos.unableLoadNewProduct'));
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
      { value: '', label: isCreditNote ? t('shop.pos.selectCustomer') : t('shop.pos.walkIn') },
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
      options.push({ value: customerId, label: t('shop.pos.selectedCustomer') });
    }
    return options;
  }, [customerId, customers, isCreditNote, t]);

  const supplierOptions = useMemo(
    () => [
      { value: '', label: isPurchase ? t('shop.pos.noSupplier') : t('shop.pos.selectSupplier') },
      ...suppliers.map((supplier) => ({
        value: supplier.id,
        label: supplier.name || supplier.phone || supplier.gstin || supplier.id,
      })),
    ],
    [isPurchase, suppliers, t],
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
      { value: '', label: t('common.all') },
      ...present.map((value) => ({ value, label: labels.get(value) || value })),
    ];
  }, [products, t]);

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
  /** Full bill — coupon / bill discount + loyalty applied only here (totals panel / Save). */
  const effectiveBillDiscountType: DiscountType = appliedCoupon ? 'amount' : billDiscountType;
  const effectiveBillDiscountValue = appliedCoupon
    ? Number(appliedCoupon.discount_amount) || 0
    : Number(billDiscountValue) || 0;
  const totals = useMemo(
    () =>
      computePosTotals(
        posLineInputs,
        effectiveBillDiscountType,
        effectiveBillDiscountValue,
        loyaltyDiscount,
      ),
    [posLineInputs, effectiveBillDiscountType, effectiveBillDiscountValue, loyaltyDiscount],
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

  function openProduct(productId: string) {
    if (!productId) return;
    setProductFiltersOpen(false);
    setProductPickerOpen(false);
    navigation.navigate('ShopProductAdd', { productId, returnTo: 'pos' });
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
      const text = t('shop.pos.selectCustomerPartial');
      setMessage(text);
      toast.push(text, 'error');
      return;
    }
    if (isCreditNote && !customerId) {
      const text = t('shop.pos.selectCustomerCredit');
      setMessage(text);
      toast.push(text, 'error');
      return;
    }
    if (isDebitNote && !supplierId) {
      const text = t('shop.pos.selectSupplierDebit');
      setMessage(text);
      toast.push(text, 'error');
      return;
    }
    if (isNote && noteSettlement === 'cash' && !cashAccountId) {
      const text = isCreditNote
        ? t('shop.pos.selectAccountRefund')
        : t('shop.pos.selectAccountReceipt');
      setMessage(text);
      toast.push(text, 'error');
      return;
    }
    if (isPurchaseOrder && !supplierId) {
      const text = t('shop.pos.selectSupplierPo');
      setMessage(text);
      toast.push(text, 'error');
      return;
    }
    if (isPurchase && paymentMethod !== 'borrow' && !cashAccountId) {
      const text = t('shop.pos.selectAccountPayment');
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
          const text = t('shop.pos.challanNotOnPlan');
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
        const documentLines = basket.map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
          unit_price: line.product.price,
          tax_rate: Number(line.product.gst_rate ?? line.product.tax_rate ?? 0),
          tax_inclusive: isProductTaxInclusive(line.product),
        }));
        const documentNotesText = editDocumentId
          ? documentNotes.trim()
          : [documentNotes.trim() || sourceNote, gstinNote].filter(Boolean).join(' · ');
        const response = editDocumentId
          ? await client.shop.updateDocument(editDocumentId, {
              customer_id: isPurchaseOrder ? null : customerId || null,
              supplier_id: isPurchaseOrder ? supplierId || null : null,
              notes: documentNotesText,
              lines: documentLines,
            })
          : await client.shop.createDocument({
              business_id: businessId,
              doc_type: docType,
              customer_id: isPurchaseOrder ? null : customerId || null,
              supplier_id: isPurchaseOrder ? supplierId : null,
              notes: documentNotesText,
              lines: documentLines,
            });
        setBasket([]);
        setBillDiscountType('');
        setBillDiscountValue('');
        setSupplierId('');
        setDocumentNotes('');
        const label = isPurchaseOrder
          ? t('shop.pos.labelPurchaseOrder')
          : isChallan
            ? t('shop.pos.labelChallan')
            : t('shop.pos.labelSaleOrder');
        toast.push(
          t(editDocumentId ? 'shop.pos.docUpdatedTotal' : 'shop.pos.docCreatedTotal', {
            label,
            number: response.data.document_number,
            total: formatMoney(totals.payable),
          }),
          'success',
        );
        if (editDocumentId) {
          navigation.navigate('ShopBooksDocuments', { docType, documentId: response.data.id });
          return;
        }
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
        navigation.navigate('ShopBooksDocuments', { docType, documentId: response.data.id });
        return;
      }

      if (isQuotation) {
        const quotationLines = basket.map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
          unit_price: line.product.price,
          tax_rate: Number(line.product.gst_rate ?? line.product.tax_rate ?? 0),
          tax_inclusive: isProductTaxInclusive(line.product),
        }));
        const response = editQuotationId
          ? await client.shop.updateQuotation(editQuotationId, {
              customer_id: customerId || null,
              valid_until: validUntil.trim() || null,
              notes: documentNotes.trim(),
              lines: quotationLines,
            })
          : await client.shop.createQuotation({
              business_id: businessId,
              customer_id: customerId || null,
              valid_until: validUntil.trim() || null,
              notes: documentNotes.trim() || 'Quotation from Sale counter',
              lines: quotationLines,
            });
        setBasket([]);
        setBillDiscountType('');
        setBillDiscountValue('');
        setValidUntil('');
        setDocumentNotes('');
        toast.push(
          t(editQuotationId ? 'shop.pos.quotationUpdated' : 'shop.pos.quotationCreated', {
            number: response.data.quotation_number,
            total: formatMoney(totals.payable),
          }),
          'success',
        );
        if (editQuotationId) {
          navigation.navigate('ShopBooksQuotations', { quotationId: response.data.id });
          return;
        }
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
          t(isCreditNote ? 'shop.pos.creditNoteRecorded' : 'shop.pos.debitNoteRecorded', {
            number: response.data.voucher_number,
            total: formatMoney(totals.payable),
          }),
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
          t(paidNow ? 'shop.pos.purchaseRecorded' : 'shop.pos.purchaseRecordedDue', {
            number: response.data.voucher_number,
            total: formatMoney(totals.payable),
          }),
          'success',
        );
        navigation.navigate('ShopBooksPurchase', { voucherId: response.data.id });
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
        ...(appliedCouponCode
          ? { coupon_code: appliedCouponCode }
          : {
              bill_discount_type: billDiscountType,
              bill_discount_value: Number(billDiscountValue) || 0,
            }),
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
        setAppliedCouponCode('');
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
      const toastParts = [t('shop.pos.saleInvoicePosted', { number: response.data.order_number })];
      if (dueNow > 0) {
        toastParts.push(t('shop.pos.paidDue', { paid: formatMoney(paidNow), due: formatMoney(dueNow) }));
      }
      if (resolvedGstin) toastParts.push('B2B');
      toastParts.push(formatMoney(totals.payable));
      toast.push(toastParts.join(' · '), 'success');
      setMessage(t('shop.pos.saleInvoicePosted', { number: response.data.order_number }), 'success');
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
            ? t('shop.pos.couldntCreatePurchaseOrder')
            : isChallan
              ? t('shop.pos.couldntCreateChallan')
              : t('shop.pos.couldntCreateSaleOrder')
          : isQuotation
            ? t('shop.pos.couldntCreateQuotation')
            : isNote
              ? t('shop.pos.couldntRecordNote')
              : isPurchase
                ? t('shop.pos.couldntRecordPurchase')
                : t('shop.pos.couldntCreateBill');
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
  const amountText = formatMoney(totals.payable);
  const checkoutLabel = busy
    ? isSaleOrder
      ? t('shop.pos.savingSaleOrder')
      : isPurchaseOrder
        ? t('shop.pos.savingPurchaseOrder')
        : isChallan
          ? t('shop.pos.savingChallan')
          : isQuotation
            ? t('shop.pos.savingQuotation')
            : isNote
              ? t('shop.pos.savingNote')
              : isPurchase
                ? t('shop.pos.recordingPurchase')
                : t('shop.pos.creatingBill')
    : isSaleOrder
      ? t(isEditing ? 'shop.pos.updateSaleOrder' : 'shop.pos.saveSaleOrder', { amount: amountText })
      : isPurchaseOrder
        ? t(isEditing ? 'shop.pos.updatePurchaseOrder' : 'shop.pos.savePurchaseOrder', { amount: amountText })
        : isChallan
          ? t(isEditing ? 'shop.pos.updateChallan' : 'shop.pos.saveChallan', { amount: amountText })
          : isQuotation
            ? t(isEditing ? 'shop.pos.updateQuotation' : 'shop.pos.saveQuotation', { amount: amountText })
            : isCreditNote
              ? t('shop.pos.saveCreditNote', { amount: amountText })
              : isDebitNote
                ? t('shop.pos.saveDebitNote', { amount: amountText })
                : isPurchase
                  ? paymentMethod === 'borrow'
                    ? t('shop.pos.recordPurchaseDue', { amount: amountText })
                    : t('shop.pos.recordPurchase', { amount: amountText })
                  : balanceDue > 0
                    ? t('shop.pos.savePayDue', {
                        paid: formatMoney(receivedAmount),
                        due: formatMoney(balanceDue),
                      })
                    : t('shop.pos.charge', { amount: formatMoney(payableShown) });

  return (
    <DesktopPage maxWidth={1100}>
    <DocumentActionsSheet
      visible={Boolean(docActions)}
      onClose={() => {
        const kind = docActions?.kind;
        const createdId = docActions?.id;
        setDocActions(null);
        if (kind === 'quotation') {
          navigation.navigate(
            'ShopBooksQuotations',
            createdId ? { quotationId: createdId } : undefined,
          );
        }
        else if (kind === 'delivery_challan') {
          navigation.navigate('ShopBooksDocuments', {
            docType: 'delivery_challan',
            documentId: createdId,
          });
        }
        else if (kind === 'credit_note' || kind === 'debit_note') navigation.navigate('ShopBooksNotes');
        else if (kind === 'sale') navigation.navigate('ShopBooksSale');
      }}
      target={docActions}
      title={
        docActions?.kind === 'quotation'
          ? t('shop.pos.titleQuotationCreated')
          : docActions?.kind === 'delivery_challan'
            ? t('shop.pos.titleChallanCreated')
            : docActions?.kind === 'credit_note'
              ? t('shop.pos.titleCreditNoteCreated')
              : docActions?.kind === 'debit_note'
                ? t('shop.pos.titleDebitNoteCreated')
                : t('shop.pos.billCreatedTitle')
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
                  label={t('shop.pos.supplier')}
                  required
                  value={supplierId}
                  options={supplierOptions}
                  onChange={updateSupplierId}
                  searchable
                  placeholder={isPurchase ? t('shop.pos.noSupplier') : t('shop.pos.selectSupplier')}
                />
              </View>
            </View>
          ) : (
            <View style={styles.customerRow}>
              <View style={styles.customerField}>
                <SelectField
                  label={t('shop.pos.customer')}
                  required={isCreditNote || (!isSaleOrder && !isChallan && !isQuotation)}
                  value={customerId}
                  options={customerOptions}
                  onChange={updateCustomerId}
                  searchable
                  placeholder={
                    isCreditNote
                      ? t('shop.pos.selectCustomer')
                      : isSaleOrder || isChallan
                        ? t('shop.pos.customerOptional')
                        : t('shop.pos.walkInCash')
                  }
                />
              </View>
              {!isDocument || isQuotation || isCreditNote || isSaleOrder || isChallan ? (
                <Pressable
                  style={styles.sideAddBtn}
                  onPress={openAddCustomer}
                  accessibilityLabel={t('shop.pos.a11yAddCustomer')}
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
            tone={messageTone}
          />
        ) : null}

        <View style={styles.itemSearchRow}>
          <Pressable
            style={styles.scanIconBtn}
            onPress={() => navigation.navigate('BarcodeScanner', { target: 'pos' })}
            accessibilityLabel={t('shop.pos.a11yScanBarcode')}
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
              placeholder={t('shop.pos.itemSearchPlaceholder')}
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
                <Text style={styles.meta}>{t('shop.pos.noMatchFound')}</Text>
                <View style={styles.suggestEmptyActions}>
                  <Button label={t('shop.pos.browse')} variant="soft" icon="grid" onPress={() => setProductPickerOpen(true)} />
                  <Button label={t('shop.pos.addProduct')} icon="plus" onPress={openAddProduct} />
                </View>
              </View>
            )}
          </View>
        ) : null}

        <View style={[styles.table, !isDesktop && styles.tableMobile]}>
          {isDesktop ? (
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.colItem]}>#  {t('shop.pos.thItem').toLocaleUpperCase()}</Text>
              <Text style={[styles.th, styles.colQty, styles.thCenter]}>{t('shop.pos.thQty').toLocaleUpperCase()}</Text>
              <Text style={[styles.th, styles.colPrice, styles.thRight]}>{t('shop.pos.thPrice').toLocaleUpperCase()}</Text>
              <View style={styles.colDiscPair}>
                <Text style={[styles.th, styles.thCenter, { flex: 1 }]}>{t('shop.pos.thDiscPct').toLocaleUpperCase()}</Text>
                <Text style={[styles.th, styles.thCenter, { flex: 1 }]}>{t('shop.pos.thDiscAmt').toLocaleUpperCase()}</Text>
              </View>
              <Text style={[styles.th, styles.colAmt, styles.thRight]}>{t('shop.pos.thAmount').toLocaleUpperCase()}</Text>
              <View style={styles.colAction} />
            </View>
          ) : null}

          {basket.length === 0 ? (
            <View style={styles.tableEmpty}>
              <Text style={styles.meta}>{t('shop.pos.noItemsYet')}</Text>
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
                      <Pressable
                        onPress={() => openProduct(line.product.id)}
                        accessibilityRole="link"
                        accessibilityLabel={t('shop.pos.a11yOpenProduct', { name: line.product.name })}
                        hitSlop={4}
                      >
                        <ProductThumb product={line.product} size={48} />
                      </Pressable>
                      <Pressable
                        style={styles.mobileLineCopy}
                        onPress={() => openProduct(line.product.id)}
                        accessibilityRole="link"
                        accessibilityLabel={t('shop.pos.a11yOpenProduct', { name: line.product.name })}
                      >
                        <Text style={styles.rowItemNameLink} numberOfLines={2}>
                          {line.product.name}
                        </Text>
                        <Text style={styles.meta}>{t('shop.pos.priceEach', { price: formatMoney(line.product.price) })}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => updateLine(line.product.id, { quantity: 0 })}
                        hitSlop={8}
                        accessibilityLabel={t('shop.pos.a11yRemoveItem')}
                      >
                        <Feather name="x" size={18} color={colors.mutedForeground} />
                      </Pressable>
                    </View>

                    <View style={styles.mobileFieldRow}>
                      <View style={styles.mobileColQty}>
                        <Text style={styles.mobileFieldLabel}>{t('shop.pos.thQty').toLocaleUpperCase()}</Text>
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
                        <Text style={styles.mobileFieldLabel}>{t('shop.pos.thDisc').toLocaleUpperCase()}</Text>
                        <DualDiscountFields
                          lineGross={lineGross}
                          discountType={line.discountType}
                          discountValue={line.discountValue}
                          onChange={setLineDiscount}
                        />
                      </View>

                      <View style={styles.mobileColAmt}>
                        <Text style={styles.mobileFieldLabel}>{t('shop.pos.thAmount').toLocaleUpperCase()}</Text>
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
                    <Pressable
                      onPress={() => openProduct(line.product.id)}
                      accessibilityRole="link"
                      accessibilityLabel={t('shop.pos.a11yOpenProduct', { name: line.product.name })}
                      hitSlop={4}
                    >
                      <ProductThumb product={line.product} size={40} />
                    </Pressable>
                    <Pressable
                      style={styles.rowItemCopy}
                      onPress={() => openProduct(line.product.id)}
                      accessibilityRole="link"
                      accessibilityLabel={t('shop.pos.a11yOpenProduct', { name: line.product.name })}
                    >
                      <Text style={styles.rowItemNameLink} numberOfLines={2}>
                        {line.product.name}
                      </Text>
                    </Pressable>
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
                    accessibilityLabel={t('shop.pos.a11yRemoveItem')}
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
              <Text style={styles.addRowText}>{t('shop.pos.addRow').toLocaleUpperCase()}</Text>
            </Pressable>
            {basket.length > 0 ? (
              <View style={styles.tableFoot}>
                <Text style={styles.tableFootLabel}>
                  {t('shop.pos.footQty', { n: basket.reduce((n, l) => n + l.quantity, 0) })}
                </Text>
                {lineLevelTotals.lineDiscountTotal > 0 ? (
                  <Text style={styles.tableFootLabel}>
                    {t('shop.pos.footDisc', { amount: formatMoney(lineLevelTotals.lineDiscountTotal) })}
                  </Text>
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
              {!isDocument && !isNote
                ? t('shop.pos.payment')
                : isNote
                  ? t('shop.pos.settlement')
                  : t('shop.pos.details')}
            </Text>

            {!isDocument && !isNote ? (
              <View style={styles.summaryPaymentBlock}>
                <Text style={styles.fieldLabel}>{t('shop.pos.paymentType')}</Text>
                <View style={styles.discountRow}>
                  {(
                    [
                      { value: 'cash', label: t('shop.pos.methodCash') },
                      { value: 'upi', label: t('shop.pos.methodUpi') },
                      { value: 'card', label: t('shop.pos.methodCard') },
                      {
                        value: 'borrow',
                        label: isPurchase ? t('shop.pos.methodUnpaid') : t('shop.pos.methodCredit'),
                      },
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
                    label={t('shop.pos.paidFrom')}
                    required
                    value={cashAccountId}
                    options={cashAccountOptions}
                    onChange={setCashAccountId}
                    placeholder={t('shop.pos.selectAccount')}
                  />
                ) : null}
                {tillPayment ? (
                  <View style={{ gap: 6 }}>
                    <Text style={styles.fieldLabel}>
                      {paymentMethod === 'borrow' ? t('shop.pos.amountPaidNow') : t('shop.pos.amountReceived')}
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
                        ? t('shop.pos.balanceDueCredit', { amount: formatMoney(balanceDue) })
                        : t('shop.pos.fullyPaid')}
                    </Text>
                  </View>
                ) : null}
                {(paymentMethod === 'borrow' || balanceDue > 0) && !isPurchase ? (
                  <Text style={styles.hint}>{t('shop.pos.customerRequiredDue')}</Text>
                ) : null}
              </View>
            ) : null}

            {isNote ? (
              <View style={styles.summaryPaymentBlock}>
                <View style={styles.discountRow}>
                  <Chip
                    label={isCreditNote ? t('shop.pos.adjustBalance') : t('shop.pos.adjustPayable')}
                    active={noteSettlement === 'adjust'}
                    onPress={() => setNoteSettlement('adjust')}
                  />
                  <Chip
                    label={isCreditNote ? t('shop.pos.refundCash') : t('shop.pos.receiveCash')}
                    active={noteSettlement === 'cash'}
                    onPress={() => setNoteSettlement('cash')}
                  />
                </View>
                {noteSettlement === 'cash' ? (
                  <SelectField
                    label={isCreditNote ? t('shop.pos.refundFrom') : t('shop.pos.receiveInto')}
                    required
                    value={cashAccountId}
                    options={cashAccountOptions}
                    onChange={setCashAccountId}
                    placeholder={t('shop.pos.selectAccount')}
                  />
                ) : null}
                <Input
                  label={t('shop.pos.notes')}
                  optional
                  value={documentNotes}
                  onChangeText={setDocumentNotes}
                  placeholder={isCreditNote ? t('shop.pos.notePlaceholderCredit') : t('shop.pos.notePlaceholderDebit')}
                  multiline
                />
              </View>
            ) : null}

            {isQuotation ? (
              <DateField
                label={t('shop.pos.validUntil')}
                optional
                value={validUntil}
                onChange={setValidUntil}
                helperText={t('shop.pos.validUntilHelp')}
              />
            ) : null}

            {isQuotation || isOrder || isChallan ? (
              <Input
                label={t('shop.pos.notes')}
                optional
                value={documentNotes}
                onChangeText={setDocumentNotes}
                placeholder={t('shop.pos.notesPlaceholder')}
                multiline
              />
            ) : null}

            {(isOrder || isChallan) && !isNote ? (
              <Text style={styles.hint}>
                {isPurchaseOrder
                  ? t('shop.pos.noPaymentPurchaseOrder')
                  : isChallan
                    ? t('shop.pos.noPaymentChallan')
                    : t('shop.pos.noPaymentSaleOrder')}
              </Text>
            ) : null}

            {showGstFields ? (
              <Input
                label={t('shop.pos.gstin')}
                optional
                value={partyGstin}
                onChangeText={updatePartyGstin}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={15}
                placeholder={t('shop.pos.gstinOptionalB2c')}
                error={partyGstin.length > 0 && !billGstinCheck.ok ? billGstinCheck.message : undefined}
              />
            ) : null}

            {mode === 'sale' && (automationOffers.length > 0 || couponOffers.length > 0) ? (
              <View style={styles.offerPanel}>
                <View style={styles.offerPanelHeader}>
                  <View style={styles.offerPanelIcon}>
                    <Feather name="gift" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.offerPanelEyebrow}>
                      {customerId ? t('shop.pos.specialForCustomer') : t('shop.pos.availableAtCounter')}
                    </Text>
                    <Text style={styles.offerPanelTitle}>
                      {automationOffers.length && couponOffers.length
                        ? t('shop.pos.offersAndCoupons')
                        : couponOffers.length
                          ? couponOffers.length === 1
                            ? t('shop.pos.coupon')
                            : t('shop.pos.coupons')
                          : automationOffers.length === 1
                            ? t('shop.pos.automationOffer')
                            : t('shop.pos.automationOffers')}
                    </Text>
                  </View>
                </View>
                <View style={styles.offerCards}>
                  {automationOffers.map((offer) => {
                    const dtype = offer.discount_type === 'amount' ? 'amount' : 'percent';
                    const active =
                      !appliedCouponCode &&
                      billDiscountType === dtype &&
                      String(Number(billDiscountValue) || 0) ===
                        String(Number(offer.discount_value) || 0);
                    const badge =
                      dtype === 'amount'
                        ? t('shop.pos.badgeAmountOff', { value: formatMoney(Number(offer.discount_value) || 0) })
                        : t('shop.pos.badgePercentOff', { value: Number(offer.discount_value) || 0 });
                    return (
                      <Pressable
                        key={`auto:${offer.label}-${offer.discount_value}`}
                        style={[styles.offerCard, active && styles.offerCardOn]}
                        onPress={() => {
                          if (active) {
                            setBillDiscountType('');
                            setBillDiscountValue('0');
                            writePosSession({
                              billDiscountType: '',
                              billDiscountValue: '0',
                            });
                            return;
                          }
                          applyAutomationOffer(offer);
                        }}
                      >
                        <View style={[styles.offerBadge, active && styles.offerBadgeOn]}>
                          <Text style={[styles.offerBadgeText, active && styles.offerBadgeTextOn]}>
                            {badge}
                          </Text>
                        </View>
                        <View style={styles.offerCardBody}>
                          <Text style={styles.offerKind}>{t('shop.pos.offerKindSpecial').toLocaleUpperCase()}</Text>
                          <Text style={styles.offerCardLabel} numberOfLines={2}>
                            {offer.label || t('shop.pos.specialOffer')}
                          </Text>
                          <Text style={[styles.offerCardHint, active && styles.offerCardHintOn]}>
                            {active ? t('shop.pos.appliedTapRemove') : t('shop.pos.tapToApplyOnBill')}
                          </Text>
                        </View>
                        <Feather
                          name={active ? 'check-circle' : 'plus-circle'}
                          size={20}
                          color={active ? colors.success : colors.primary}
                        />
                      </Pressable>
                    );
                  })}
                  {couponOffers.map((offer) => {
                    const code = String(offer.code || '');
                    const active = appliedCouponCode === code;
                    const locked = !offer.applicable && !active;
                    const remaining = Number(offer.remaining_to_unlock || 0);
                    const badge =
                      String(offer.discount_type) === 'amount'
                        ? t('shop.pos.badgeAmountOff', { value: formatMoney(Number(offer.discount_value) || 0) })
                        : t('shop.pos.badgePercentOff', { value: Number(offer.discount_value) || 0 });
                    const savings = Number(offer.discount_amount || 0);
                    return (
                      <Pressable
                        key={`coupon:${code}`}
                        style={[
                          styles.offerCard,
                          active && styles.offerCardOn,
                          locked && styles.offerCardLocked,
                        ]}
                        disabled={locked}
                        onPress={() => {
                          if (active) {
                            clearAppliedCoupon();
                            return;
                          }
                          applyCouponOffer(offer);
                        }}
                      >
                        <View
                          style={[
                            styles.offerBadge,
                            active && styles.offerBadgeOn,
                            locked && styles.offerBadgeLocked,
                          ]}
                        >
                          <Text
                            style={[
                              styles.offerBadgeText,
                              active && styles.offerBadgeTextOn,
                              locked && styles.offerBadgeTextLocked,
                            ]}
                          >
                            {badge}
                          </Text>
                        </View>
                        <View style={styles.offerCardBody}>
                          <Text style={styles.offerKind}>{code}</Text>
                          <Text style={styles.offerCardLabel} numberOfLines={2}>
                            {offer.name || t('shop.pos.coupon')}
                          </Text>
                          <Text
                            style={[
                              styles.offerCardHint,
                              active && styles.offerCardHintOn,
                              locked && styles.offerCardHintLocked,
                            ]}
                          >
                            {active
                              ? t('shop.pos.couponAppliedSave', { amount: formatMoney(savings) })
                              : locked
                                ? remaining > 0
                                  ? t('shop.pos.couponAddMore', { amount: formatMoney(remaining) })
                                  : offer.reason || t('shop.pos.couponNotAvailable')
                                : savings > 0
                                  ? t('shop.pos.couponTapSave', { amount: formatMoney(savings) })
                                  : t('shop.pos.tapToApplyOnBill')}
                          </Text>
                        </View>
                        <Feather
                          name={active ? 'check-circle' : locked ? 'lock' : 'tag'}
                          size={20}
                          color={
                            active
                              ? colors.success
                              : locked
                                ? colors.mutedForeground
                                : colors.primary
                          }
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>

          <View style={[styles.summaryPane, checkoutSideBySide && styles.summaryPaneDesktop]}>
            <Text style={styles.summaryHeading}>{t('shop.pos.billSummary')}</Text>

            <View style={styles.totalRow}>
              <Text style={styles.meta}>{t('shop.pos.items')}</Text>
              <Text style={styles.summaryMoney}>{formatMoney(lineLevelTotals.merchandiseGross)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.meta}>{t('shop.pos.productDiscount')}</Text>
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
              <Text style={styles.meta}>{t('shop.pos.subtotal')}</Text>
              <Text style={styles.summaryMoney}>
                {formatMoney(lineLevelTotals.merchandiseAfterLineDiscount)}
              </Text>
            </View>
            {!isChallan ? (
              <View style={styles.totalRow}>
                <Text style={styles.meta}>
                  {appliedCouponCode
                    ? t('shop.pos.couponCode', { code: appliedCouponCode })
                    : t('shop.pos.billDiscount')}
                </Text>
                <View style={styles.billDiscRight}>
                  {appliedCouponCode ? (
                    <Pressable onPress={clearAppliedCoupon} hitSlop={8}>
                      <Text style={styles.offerRemove}>{t('shop.pos.remove')}</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.billDiscTypeTrack}>
                      <Pressable
                        style={[
                          styles.billDiscTypeBtn,
                          billDiscountType === 'percent' && styles.billDiscTypeBtnOn,
                        ]}
                        onPress={() => {
                          clearAppliedCoupon();
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
                          clearAppliedCoupon();
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
                  )}
                  {appliedCouponCode ? null : (
                    <TextInput
                      style={styles.billDiscInput}
                      value={billDiscountType ? billDiscountValue : ''}
                      editable={Boolean(billDiscountType)}
                      onChangeText={(value) => {
                        clearAppliedCoupon();
                        const cleaned = sanitizeDecimalInput(value);
                        setBillDiscountValue(cleaned);
                        writePosSession({ billDiscountValue: cleaned });
                      }}
                      keyboardType="decimal-pad"
                      placeholder=""
                      placeholderTextColor={colors.mutedForeground}
                    />
                  )}
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
                  {t('shop.pos.redeemPointsBalance', { balance: selectedPosCustomer?.loyalty_points ?? 0 })}
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
                    <Text style={styles.addRowText}>{t('shop.pos.max')}</Text>
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
                  {pointsToRedeem > 0
                    ? t('shop.pos.pointsRedeemedCount', { n: pointsToRedeem })
                    : t('shop.pos.pointsRedeemed')}
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
                    <Text style={styles.meta}>{t('shop.pos.giveLoyaltyPoints')}</Text>
                    <Text style={styles.loyaltyAwardHint}>
                      {pointsToEarn > 0
                        ? t('shop.pos.earnRateHint', { rate: loyaltyPrefs.earn_points_per_100 })
                        : t('shop.pos.noPointsAmount')}
                      {paymentMethod === 'borrow' && pointsToEarn > 0
                        ? ` · ${t('shop.pos.creditedWhenPaid')}`
                        : ''}
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
              <Text style={styles.meta}>{t('shop.pos.taxable')}</Text>
              <Text style={styles.summaryMoney}>{formatMoney(totals.subtotal)}</Text>
            </View>
            {totals.taxTotal > 0 ? (
              billIsInterstate ? (
                <View style={styles.totalRow}>
                  <Text style={styles.meta}>{t('shop.pos.igst')}</Text>
                  <Text style={styles.summaryMoney}>{formatMoney(totals.taxTotal)}</Text>
                </View>
              ) : (
                <>
                  <View style={styles.totalRow}>
                    <Text style={styles.meta}>{t('shop.pos.cgst')}</Text>
                    <Text style={styles.summaryMoney}>{formatMoney(billCgst)}</Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={styles.meta}>{t('shop.pos.sgst')}</Text>
                    <Text style={styles.summaryMoney}>{formatMoney(billSgst)}</Text>
                  </View>
                </>
              )
            ) : (
              <View style={styles.totalRow}>
                <Text style={styles.meta}>{t('shop.pos.tax')}</Text>
                <Text style={styles.summaryMoney}>{formatMoney(totals.taxTotal)}</Text>
              </View>
            )}

            <View style={[styles.totalRow, styles.totalRowStrong]}>
              <Text style={styles.payableLabel}>{t('shop.pos.total')}</Text>
              <Text style={styles.payableValue}>{formatMoney(payableShown)}</Text>
            </View>
            {tillPayment ? (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.meta}>{t('shop.pos.received')}</Text>
                  <Text style={styles.summaryMoney}>{formatMoney(receivedAmount)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={[styles.meta, balanceDue > 0 && { color: colors.warning }]}>
                    {t('shop.pos.balanceDue')}
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
                    ? t('shop.pos.methodUnpaid')
                    : t('shop.pos.methodCredit')
                  : paymentMethod === 'upi'
                    ? t('shop.pos.methodUpi')
                    : paymentMethod === 'card'
                      ? t('shop.pos.methodCard')
                      : t('shop.pos.methodCash')}
              {' · '}
              {basket.length === 1
                ? t('shop.pos.itemsCountOne')
                : t('shop.pos.itemsCountLine', { n: basket.length })}
            </Text>
            <Text style={styles.chargeAmount}>{formatMoney(payableShown)}</Text>
          </View>
          <Button
            label={busy ? t('shop.pos.saving') : isDocument || isNote || isPurchase ? checkoutLabel : t('common.save')}
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
            accessibilityLabel={t('shop.pos.a11yClose')}
          />
          <ExpandableSheetView
            onLayout={isDesktop ? undefined : onSheetLayout}
            style={[
              styles.sheet,
              isDesktop && styles.sheetDesktop,
              !isDesktop && {
                marginBottom: lift,
                paddingBottom: bottomPad,
              },
              !isDesktop && sheetMotionStyle,
              isDesktop && { paddingBottom: spacing.lg },
            ]}
          >
            <View style={[styles.pickerHero, keyboardOpen && styles.pickerHeroCompact]}>
              {!isDesktop ? <SheetHandle {...handleProps} /> : null}
              <View style={styles.pickerHeroTop}>
                <Text style={styles.pickerKicker}>{t('shop.pos.catalog')}</Text>
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
              <Text style={[styles.pickerTitle, keyboardOpen && styles.pickerTitleCompact]}>
                {t('shop.pos.findProduct')}
              </Text>
              <Text style={styles.pickerSubtitle}>
                {filteredProducts.length === 1
                  ? t('shop.pos.matchOne')
                  : t('shop.pos.matchesCount', { n: filteredProducts.length })}
              </Text>
            </View>

            <View style={styles.pickerSearchRow}>
              <View style={styles.searchWrap}>
                <Feather name="search" size={16} color={colors.mutedForeground} />
                <TextInput
                  value={productQuery}
                  onChangeText={setProductQuery}
                  placeholder={t('shop.pos.searchProductsFull')}
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
                <View style={styles.productRow}>
                  <Pressable style={styles.productRowMain} onPress={() => addProduct(item)}>
                    <ProductThumb product={item} size={44} />
                    <View style={styles.productCopy}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.meta}>
                        {t('shop.pos.productMetaStock', { price: formatMoney(item.price), stock: item.stock_on_hand })}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    style={styles.productOpenBtn}
                    onPress={() => openProduct(item.id)}
                    hitSlop={8}
                    accessibilityRole="link"
                    accessibilityLabel={t('shop.pos.a11yOpenProduct', { name: item.name })}
                  >
                    <Feather name="external-link" size={16} color={colors.primary} />
                  </Pressable>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptySearch}>
                  <Text style={styles.meta}>{t('shop.pos.noMatching')}</Text>
                </View>
              }
            />

            <Pressable style={styles.createProductBtn} onPress={openAddProduct}>
              <Feather name="plus" size={18} color="#fff" />
              <Text style={styles.createProductText}>{t('shop.pos.addNewProduct')}</Text>
            </Pressable>

            <FilterSheet
              embedded
              visible={productFiltersOpen}
              title={t('shop.pos.productFilters')}
              onClose={() => setProductFiltersOpen(false)}
              onReset={() => {
                setProductCategory('');
                setProductStock('');
                setProductSort('name_asc');
              }}
            >
              <FilterChoiceGroup
                label={t('shop.pos.filterCategory')}
                value={productCategory}
                options={productCategoryOptions}
                onChange={setProductCategory}
              />
              <FilterChoiceGroup
                label={t('shop.pos.filterStock')}
                value={productStock}
                options={[
                  { value: '', label: t('shop.pos.filterAny') },
                  { value: 'in_stock', label: t('shop.pos.filterInStock') },
                  { value: 'low', label: t('shop.pos.filterLowStock') },
                ]}
                onChange={setProductStock}
              />
              <FilterChoiceGroup
                label={t('shop.pos.filterSort')}
                value={productSort}
                options={[
                  { value: 'name_asc', label: t('shop.pos.sortName') },
                  { value: 'price_desc', label: t('shop.pos.sortPrice') },
                  { value: 'stock_desc', label: t('shop.pos.sortStock') },
                ]}
                onChange={setProductSort}
              />
            </FilterSheet>
          </ExpandableSheetView>
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
  rowItemNameLink: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
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
  offerPanel: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.tintStrong,
    backgroundColor: colors.secondary,
  },
  offerPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  offerPanelIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  offerPanelEyebrow: {
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.primary,
    fontFamily: fonts.bodyBold,
  },
  offerPanelTitle: {
    ...typography.label,
    color: colors.foreground,
    fontFamily: fonts.bodySemi,
  },
  offerCards: { gap: spacing.sm },
  offerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  offerCardOn: {
    borderColor: colors.primary,
    backgroundColor: colors.tint,
  },
  offerBadge: {
    minWidth: 72,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  offerBadgeOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  offerBadgeText: {
    fontSize: 12,
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    textAlign: 'center',
  },
  offerBadgeTextOn: { color: colors.primaryForeground },
  offerCardLocked: { opacity: 0.72 },
  offerBadgeLocked: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
  },
  offerBadgeTextLocked: { color: colors.mutedForeground },
  offerCardBody: { flex: 1, minWidth: 0, gap: 2 },
  offerKind: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.primary,
    fontFamily: fonts.bodyBold,
  },
  offerCardLabel: {
    ...typography.label,
    color: colors.foreground,
    fontFamily: fonts.bodySemi,
  },
  offerCardHint: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  offerCardHintOn: {
    color: colors.success,
    fontFamily: fonts.bodySemi,
  },
  offerCardHintLocked: { color: colors.mutedForeground },
  offerRemove: {
    fontSize: 13,
    color: colors.destructive,
    fontFamily: fonts.bodySemi,
  },
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
    gap: spacing.sm,
    padding: spacing.sm,
    paddingRight: spacing.sm,
    backgroundColor: colors.card,
  },
  productRowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  productOpenBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
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
