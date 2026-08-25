import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { SelectField } from '../../components/SelectField';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { Customer, ShopProduct, ShopQuotation } from '@ie-orbit/sdk';
import {
  customerLabel,
  formatMoney,
  todayIso,
  voucherStatusStyle,
} from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';

type QuoteLine = {
  key: string;
  productId: string;
  name: string;
  qty: string;
  rate: string;
  gst: string;
};

function emptyLine(): QuoteLine {
  return {
    key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    productId: '',
    name: '',
    qty: '1',
    rate: '0',
    gst: '0',
  };
}

function canConvert(quotation: ShopQuotation) {
  if (quotation.converted_order) return false;
  const status = (quotation.status || '').toLowerCase();
  return status !== 'converted' && status !== 'cancelled' && status !== 'void';
}

export function ShopBooksQuotationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [quotations, setQuotations] = useState<ShopQuotation[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [lines, setLines] = useState<QuoteLine[]>([emptyLine()]);
  const [notes, setNotes] = useState('');

  const closeForm = useCallback(() => {
    setShowForm(false);
    setCustomerId('');
    setValidUntil('');
    setLines([emptyLine()]);
    setNotes('');
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Estimates / Proforma',
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('ShopPos', { mode: 'quotation' })}
          accessibilityRole="button"
          accessibilityLabel="New quotation"
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name="plus" size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [quotationsRes, productsRes, customersRes] = await Promise.all([
        client.shop.listQuotations({ business_id: businessId }),
        client.shop.listProducts({ business_id: businessId, status: 'active' }),
        client.customers.list({ business: businessId }),
      ]);
      setQuotations(quotationsRes.data ?? []);
      setProducts(productsRes.data ?? []);
      setCustomers(customersRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quotations');
    } finally {
      setLoading(false);
    }
  }, [businessId, client]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const customerById = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const customer of customers) map.set(customer.id, customer);
    return map;
  }, [customers]);

  const customerOptions = useMemo(
    () => [
      { value: '', label: 'No customer' },
      ...customers.map((customer) => ({ value: customer.id, label: customerLabel(customer) })),
    ],
    [customers],
  );

  const productOptions = useMemo(
    () => products.map((product) => ({ value: product.id, label: `${product.name} · ${formatMoney(product.price)}` })),
    [products],
  );

  function setLine(key: string, patch: Partial<QuoteLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectProductForLine(key: string, productId: string) {
    const product = products.find((p) => p.id === productId);
    setLine(key, {
      productId,
      name: product?.name ?? '',
      rate: product ? String(product.price) : '0',
      gst: product ? String(product.gst_rate ?? product.tax_rate ?? 0) : '0',
    });
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.key !== key) : current));
  }

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        if (!line.productId) return acc;
        const qty = Number(line.qty) || 0;
        const rate = Number(line.rate) || 0;
        const gst = Number(line.gst) || 0;
        const base = qty * rate;
        const tax = base * (gst / 100);
        acc.subtotal += base;
        acc.tax += tax;
        acc.total += base + tax;
        return acc;
      },
      { subtotal: 0, tax: 0, total: 0 },
    );
  }, [lines]);

  async function submit() {
    if (!client || !businessId) return;
    const validLines = lines.filter((line) => line.productId && Number(line.qty) > 0);
    if (!validLines.length) {
      toast.push('Add at least one product line', 'error');
      return;
    }
    setBusy(true);
    try {
      const response = await client.shop.createQuotation({
        business_id: businessId,
        customer_id: customerId || null,
        valid_until: validUntil || null,
        notes: notes.trim() || undefined,
        lines: validLines.map((line) => ({
          product_id: line.productId,
          quantity: line.qty,
          unit_price: line.rate,
          tax_rate: line.gst,
        })),
      });
      toast.push(`Quotation ${response.data.quotation_number} created`, 'success');
      closeForm();
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to create quotation', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onConvert(quotation: ShopQuotation) {
    if (!client) return;
    setConvertingId(quotation.id);
    try {
      const response = await client.shop.convertQuotationToSale(quotation.id, {
        voucher_date: todayIso(),
      });
      toast.push(`Converted to sale ${response.data.voucher_number}`, 'success');
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to convert quotation', 'error');
    } finally {
      setConvertingId(null);
    }
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <Text style={styles.pageHint}>New quotations use the same Sale counter UI (scan/search products).</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          data={quotations}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => {
            const badge = voucherStatusStyle(item.status);
            const customer =
              item.customer && customerById.get(item.customer)
                ? customerLabel(customerById.get(item.customer)!)
                : item.customer
                  ? 'Customer'
                  : 'No customer';
            const converting = convertingId === item.id;
            return (
              <View style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{item.quotation_number}</Text>
                  <Text style={styles.total}>{formatMoney(item.total)}</Text>
                </View>
                <Text style={styles.meta}>
                  {customer}
                  {item.valid_until ? ` · Valid till ${item.valid_until}` : ''}
                </Text>
                <View style={styles.rowBottom}>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.text }]}>{item.status}</Text>
                  </View>
                  {canConvert(item) ? (
                    <Pressable onPress={() => void onConvert(item)} hitSlop={8} disabled={converting}>
                      <Text style={[styles.convertText, converting && styles.convertDisabled]}>
                        {converting ? 'Converting…' : 'Convert to sale'}
                      </Text>
                    </Pressable>
                  ) : item.converted_order || (item.status || '').toLowerCase() === 'converted' ? (
                    <Text style={styles.convertedMeta}>Converted</Text>
                  ) : null}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="file-text"
                title="No quotations yet"
                message="Create a quotation and convert it to a sale when the customer confirms."
                actionLabel="New quotation"
                onAction={() => navigation.navigate('ShopPos', { mode: 'quotation' })}
              />
            ) : null
          }
        />
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  pageHint: { color: colors.mutedForeground, fontSize: 12, marginBottom: spacing.sm, lineHeight: 16 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  fieldBlock: { gap: 6 },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    gap: 4,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  total: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  convertedMeta: { color: colors.mutedForeground, fontSize: 13, fontWeight: '600' },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  convertText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  convertDisabled: { opacity: 0.5 },
  error: { color: colors.destructive, marginBottom: spacing.sm },
  label: { ...typography.label, color: colors.foreground },
  smallLabel: { ...typography.caption, color: colors.mutedForeground, marginBottom: 4 },
  section: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.foreground,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  notes: { minHeight: 72, textAlignVertical: 'top' },
  lineCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: spacing.sm,
  },
  lineRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  lineField: { flex: 1 },
  removeBtn: { paddingBottom: 10 },
  addLineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  addLineText: { color: colors.primary, fontWeight: '600' },
  totalsCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: 6,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  payableLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.foreground },
  payableValue: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.foreground },
});
