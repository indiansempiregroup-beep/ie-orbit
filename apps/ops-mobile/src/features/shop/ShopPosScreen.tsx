import React, { useCallback, useMemo, useState } from 'react';
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
import type { Customer, ShopProduct } from '@ie-platform/sdk';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { SelectField } from '../../components/SelectField';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { shopListRefreshControl } from './shopRefreshControl';
import { computePosTotals, type DiscountType } from './posPricing';
import {
  clearPosBillKeepCustomer,
  readPosSession,
  takePosPendingAddCode,
  takePosPendingAddProductId,
  writePosSession,
} from './posSession';

type BasketLine = {
  product: ShopProduct;
  quantity: number;
  barcode_scanned?: string;
  discountType: DiscountType;
  discountValue: number;
};

type PaymentMethod = 'cash' | 'upi' | 'card' | 'borrow';
type Props = NativeStackScreenProps<RootStackParamList, 'ShopPos'>;

export function ShopPosScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Props['route']>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();
  const initialSession = readPosSession();
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [basket, setBasket] = useState<BasketLine[]>(() => initialSession.basket);
  const [customerId, setCustomerId] = useState(
    () =>
      initialSession.customerId ||
      route.params?.selectedCustomerId ||
      route.params?.selectCustomerId ||
      '',
  );
  const [scan, setScan] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [billDiscountType, setBillDiscountType] = useState<DiscountType>(
    () => initialSession.billDiscountType,
  );
  const [billDiscountValue, setBillDiscountValue] = useState(
    () => initialSession.billDiscountValue,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    () => initialSession.paymentMethod,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const catalogLoadedRef = React.useRef(false);

  const loadCatalog = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    try {
      const [productsRes, customersRes] = await Promise.all([
        client.shop.listProducts({ business_id: businessId, status: 'active' }),
        client.customers.list({ business: businessId }),
      ]);
      setProducts(productsRes.data);
      setCustomers(customersRes.data ?? []);
      catalogLoadedRef.current = true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load POS catalog');
    } finally {
      setLoading(false);
    }
  }, [businessId, client]);

  const updateCustomerId = useCallback((id: string) => {
    setCustomerId(id);
    writePosSession({ customerId: id });
  }, []);

  const syncBasket = useCallback((next: BasketLine[] | ((current: BasketLine[]) => BasketLine[])) => {
    setBasket((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      writePosSession({ basket: resolved });
      return resolved;
    });
  }, []);

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
      const session = readPosSession();
      setCustomerId(session.customerId);
      setBasket(session.basket);
      setBillDiscountType(session.billDiscountType);
      setBillDiscountValue(session.billDiscountValue);
      setPaymentMethod(session.paymentMethod);

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
      if (selectId) {
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
      syncBasket,
      updateCustomerId,
    ]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(loadCatalog);

  const customerOptions = useMemo(() => {
    const options = [
      { value: '', label: 'Walk-in customer' },
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
  }, [customerId, customers]);

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
    if (paymentMethod === 'borrow' && !customerId) {
      const text = 'Select a customer for borrow / credit bills.';
      setMessage(text);
      toast.push(text, 'error');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await client.shop.createOrder({
        business_id: businessId,
        customer_id: customerId || null,
        fulfillment_mode: 'pos',
        confirm: true,
        payment_method: paymentMethod,
        bill_discount_type: billDiscountType,
        bill_discount_value: Number(billDiscountValue) || 0,
        notes:
          paymentMethod === 'borrow'
            ? 'POS · BORROW (due)'
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
      setBasket([]);
      setBillDiscountType('');
      setBillDiscountValue('0');
      clearPosBillKeepCustomer();
      // keep customerId in local + session
      writePosSession({
        customerId,
        basket: [],
        billDiscountType: '',
        billDiscountValue: '0',
        paymentMethod,
      });
      const dueLabel = paymentMethod === 'borrow' ? ' · Due' : '';
      toast.push(
        `Bill ${response.data.order_number} created${dueLabel} · ${totals.payable.toFixed(2)}`,
        'success',
      );
      setMessage(`Bill ${response.data.order_number} created`);
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Unable to create bill';
      setMessage(text);
      toast.push(text, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: spacing.md }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={shopListRefreshControl(refreshing, onRefresh)}
      >
        <View style={styles.customerRow}>
          <View style={styles.customerField}>
            <SelectField
              label="Customer"
              value={customerId}
              options={customerOptions}
              onChange={updateCustomerId}
              searchable
              placeholder="Walk-in customer"
            />
          </View>
          <Pressable
            style={styles.sideAddBtn}
            onPress={openAddCustomer}
            accessibilityLabel="Add customer"
          >
            <Feather name="user-plus" size={20} color="#fff" />
          </Pressable>
        </View>

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

        <Text style={styles.section}>Bill ({basket.length} items)</Text>
        {!basket.length ? (
          <View style={styles.emptyBill}>
            <Text style={styles.meta}>Scan or search products to start billing.</Text>
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
                      {Number(line.product.price).toFixed(2)} · tax {Number(line.product.tax_rate ?? 0)}%
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

        <Text style={styles.section}>Payment</Text>
        <View style={styles.discountRow}>
          {(
            [
              { value: 'cash', label: 'Cash' },
              { value: 'upi', label: 'UPI' },
              { value: 'card', label: 'Card' },
              { value: 'borrow', label: 'Borrow' },
            ] as const
          ).map((method) => (
            <Pressable
              key={method.value}
              style={[styles.chip, paymentMethod === method.value && styles.chipActive]}
              onPress={() => {
                setPaymentMethod(method.value);
                writePosSession({ paymentMethod: method.value });
              }}
            >
              <Text style={styles.chipText}>{method.label}</Text>
            </Pressable>
          ))}
        </View>
        {paymentMethod === 'borrow' ? (
          <Text style={styles.hint}>
            Borrow / credit: customer takes goods now and pays later. A customer is required (not
            Walk-in).
          </Text>
        ) : null}

        <View style={styles.totalsCard}>
          <Text style={styles.summaryTitle}>Bill summary</Text>
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
          <View style={styles.totalRow}>
            <Text style={styles.meta}>Tax</Text>
            <Text style={styles.meta}>{totals.taxTotal.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.payableLabel}>
              {paymentMethod === 'borrow' ? 'Amount due' : 'Payable'}
            </Text>
            <Text style={styles.payableValue}>{totals.payable.toFixed(2)}</Text>
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
              ? 'Creating bill…'
              : paymentMethod === 'borrow'
                ? `Create Bill · Due ${totals.payable.toFixed(2)}`
                : `Create Bill · ${totals.payable.toFixed(2)}`}
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={productPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setProductPickerOpen(false)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setProductPickerOpen(false)}
            accessibilityLabel="Close"
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
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
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  customerField: { flex: 1 },
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
  chipActive: { borderColor: colors.primary, backgroundColor: colors.muted },
  chipText: { color: colors.foreground, fontSize: 13, fontWeight: '600' },
  discountInput: { flexGrow: 0, flexBasis: 90, minWidth: 90 },
  totalsCard: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: 8,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  payableLabel: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.foreground },
  payableValue: { fontFamily: fonts.bodyMedium, fontSize: 18, color: colors.foreground },
  chargeBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  checkout: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  checkoutDisabled: { opacity: 0.5 },
  checkoutText: { color: '#fff', fontWeight: '700' },
  overlay: { flex: 1, justifyContent: 'flex-end' },
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
