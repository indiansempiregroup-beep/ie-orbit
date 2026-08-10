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
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
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
import type {
  Customer,
  ShopBooksDocument,
  ShopBooksDocumentType,
  ShopProduct,
  ShopSupplier,
} from '@ie-platform/sdk';
import {
  customerLabel,
  formatMoney,
  supplierLabel,
  todayIso,
  voucherStatusStyle,
} from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';

type DocLine = {
  key: string;
  productId: string;
  name: string;
  qty: string;
  rate: string;
  gst: string;
};

const DOC_META: Record<
  ShopBooksDocumentType,
  { title: string; singular: string; convertLabel: string; usesSupplier: boolean }
> = {
  sale_order: {
    title: 'Sale orders',
    singular: 'sale order',
    convertLabel: 'Convert to sale',
    usesSupplier: false,
  },
  purchase_order: {
    title: 'Purchase orders',
    singular: 'purchase order',
    convertLabel: 'Convert to purchase',
    usesSupplier: true,
  },
  delivery_challan: {
    title: 'Delivery challans',
    singular: 'delivery challan',
    convertLabel: 'Dispatch',
    usesSupplier: false,
  },
  job_work: {
    title: 'Job work',
    singular: 'job work',
    convertLabel: 'Convert to sale',
    usesSupplier: false,
  },
};

function emptyLine(): DocLine {
  return {
    key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    productId: '',
    name: '',
    qty: '1',
    rate: '0',
    gst: '0',
  };
}

function canConvert(doc: ShopBooksDocument) {
  if (doc.converted_voucher) return false;
  const status = (doc.status || '').toLowerCase();
  return status !== 'converted' && status !== 'cancelled' && status !== 'void' && status !== 'dispatched';
}

export function ShopBooksDocumentsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ShopBooksDocuments'>>();
  const docType = route.params.docType;
  const meta = DOC_META[docType];
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [documents, setDocuments] = useState<ShopBooksDocument[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<ShopSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const [partyId, setPartyId] = useState('');
  const [documentDate, setDocumentDate] = useState(todayIso());
  const [lines, setLines] = useState<DocLine[]>([emptyLine()]);
  const [notes, setNotes] = useState('');

  const closeForm = useCallback(() => {
    setShowForm(false);
    setPartyId('');
    setDocumentDate(todayIso());
    setLines([emptyLine()]);
    setNotes('');
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: meta.title,
      headerRight: () => (
        <Pressable
          onPress={() => (showForm ? closeForm() : setShowForm(true))}
          accessibilityRole="button"
          accessibilityLabel={showForm ? 'Close' : `New ${meta.singular}`}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showForm ? 'x' : 'plus'} size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, showForm, closeForm, meta.title, meta.singular]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [docsRes, productsRes, partiesRes] = await Promise.all([
        client.shop.listDocuments({ business_id: businessId, doc_type: docType }),
        client.shop.listProducts({ business_id: businessId, status: 'active' }),
        meta.usesSupplier
          ? client.shop.listSuppliers({ business_id: businessId })
          : client.customers.list({ business: businessId }),
      ]);
      setDocuments(docsRes.data ?? []);
      setProducts(productsRes.data ?? []);
      if (meta.usesSupplier) {
        setSuppliers((partiesRes.data as ShopSupplier[]) ?? []);
        setCustomers([]);
      } else {
        setCustomers((partiesRes.data as Customer[]) ?? []);
        setSuppliers([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [businessId, client, docType, meta.usesSupplier]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const partyOptions = useMemo(() => {
    if (meta.usesSupplier) {
      return [
        { value: '', label: 'No supplier' },
        ...suppliers.map((supplier) => ({ value: supplier.id, label: supplierLabel(supplier) })),
      ];
    }
    return [
      { value: '', label: 'No customer' },
      ...customers.map((customer) => ({ value: customer.id, label: customerLabel(customer) })),
    ];
  }, [customers, suppliers, meta.usesSupplier]);

  const productOptions = useMemo(
    () => products.map((product) => ({ value: product.id, label: `${product.name} · ${formatMoney(product.price)}` })),
    [products],
  );

  function setLine(key: string, patch: Partial<DocLine>) {
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
      const response = await client.shop.createDocument({
        business_id: businessId,
        doc_type: docType,
        customer_id: meta.usesSupplier ? null : partyId || null,
        supplier_id: meta.usesSupplier ? partyId || null : null,
        document_date: documentDate || todayIso(),
        notes: notes.trim() || undefined,
        lines: validLines.map((line) => ({
          product_id: line.productId,
          quantity: line.qty,
          unit_price: line.rate,
          tax_rate: line.gst,
        })),
      });
      toast.push(`${response.data.document_number} created`, 'success');
      closeForm();
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : `Unable to create ${meta.singular}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onConvert(doc: ShopBooksDocument) {
    if (!client) return;
    setConvertingId(doc.id);
    try {
      await client.shop.convertDocument(doc.id, {});
      toast.push(
        docType === 'delivery_challan' ? 'Dispatched' : `Converted · ${meta.convertLabel}`,
        'success',
      );
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to convert document', 'error');
    } finally {
      setConvertingId(null);
    }
  }

  if (showForm) {
    return (
      <FormScreen
        footer={
          <Button
            label={busy ? 'Saving…' : `Create ${meta.singular} · ${formatMoney(totals.total)}`}
            loading={busy}
            fullWidth
            size="lg"
            onPress={() => void submit()}
          />
        }
      >
        <Text style={styles.formTitle}>New {meta.singular}</Text>

        <SelectField
          label={meta.usesSupplier ? 'Supplier' : 'Customer'}
          value={partyId}
          options={partyOptions}
          onChange={setPartyId}
          searchable
        />

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={documentDate}
            onChangeText={setDocumentDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        <Text style={styles.section}>Items</Text>
        {lines.map((line) => (
          <View key={line.key} style={styles.lineCard}>
            <SelectField
              label="Product"
              value={line.productId}
              options={productOptions}
              onChange={(value) => selectProductForLine(line.key, value)}
              searchable
              placeholder="Choose product"
            />
            <View style={styles.lineRow}>
              <View style={styles.lineField}>
                <Text style={styles.smallLabel}>Qty</Text>
                <TextInput
                  style={styles.input}
                  value={line.qty}
                  onChangeText={(value) => setLine(line.key, { qty: value.replace(/[^0-9.]/g, '') })}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View style={styles.lineField}>
                <Text style={styles.smallLabel}>Rate</Text>
                <TextInput
                  style={styles.input}
                  value={line.rate}
                  onChangeText={(value) => setLine(line.key, { rate: value.replace(/[^0-9.]/g, '') })}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View style={styles.lineField}>
                <Text style={styles.smallLabel}>GST %</Text>
                <TextInput
                  style={styles.input}
                  value={line.gst}
                  onChangeText={(value) => setLine(line.key, { gst: value.replace(/[^0-9.]/g, '') })}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <Pressable onPress={() => removeLine(line.key)} style={styles.removeBtn} hitSlop={8}>
                <Feather name="trash-2" size={18} color={colors.destructive} />
              </Pressable>
            </View>
          </View>
        ))}
        <Pressable style={styles.addLineBtn} onPress={addLine}>
          <Feather name="plus" size={16} color={colors.primary} />
          <Text style={styles.addLineText}>Add product line</Text>
        </Pressable>

        <View style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.metaText}>Subtotal</Text>
            <Text style={styles.metaText}>{formatMoney(totals.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.metaText}>Tax</Text>
            <Text style={styles.metaText}>{formatMoney(totals.tax)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.payableLabel}>Total</Text>
            <Text style={styles.payableValue}>{formatMoney(totals.total)}</Text>
          </View>
        </View>

        <TextInput
          style={[styles.input, styles.notes]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes (optional)"
          multiline
          placeholderTextColor={colors.mutedForeground}
        />
      </FormScreen>
    );
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          data={documents}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => {
            const badge = voucherStatusStyle(item.status);
            const party =
              item.customer_name ||
              item.supplier_name ||
              (item.customer || item.supplier ? 'Party' : 'No party');
            const converting = convertingId === item.id;
            return (
              <View style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{item.document_number}</Text>
                  <Text style={styles.total}>{formatMoney(item.total)}</Text>
                </View>
                <Text style={styles.metaText}>
                  {party}
                  {item.document_date ? ` · ${item.document_date}` : ''}
                </Text>
                <View style={styles.rowBottom}>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.text }]}>{item.status}</Text>
                  </View>
                  {canConvert(item) ? (
                    <Pressable onPress={() => void onConvert(item)} hitSlop={8} disabled={converting}>
                      <Text style={[styles.convertText, converting && styles.convertDisabled]}>
                        {converting ? 'Working…' : meta.convertLabel}
                      </Text>
                    </Pressable>
                  ) : item.converted_voucher || (item.status || '').toLowerCase() === 'converted' ? (
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
                title={`No ${meta.title.toLowerCase()} yet`}
                message={`Create a ${meta.singular} and convert it when ready.`}
                actionLabel={`New ${meta.singular}`}
                onAction={() => setShowForm(true)}
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
  metaText: { color: colors.mutedForeground, fontSize: 13 },
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
