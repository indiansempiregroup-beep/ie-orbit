import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { SelectField } from '../../components/SelectField';
import { FormScreen } from '../../components/FormScreen';
import { FormHero } from '../../components/FormHero';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { SearchBar } from '../../components/SearchBar';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { VoucherSummaryCards } from './VoucherSummaryCards';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { DocumentActionsSheet, type ShopDocTarget } from './DocumentActionsSheet';
import { openShopDocumentHtmlView } from '../../utils/shopDocumentShare';
import { useAuth } from '../../contexts/AuthContext';
import { confirmAction } from '../../utils/confirmAction';
import { getApiErrorMessage } from '../../utils/format';
import type { Customer, ShopProduct, ShopQuotation } from '@ie-orbit/sdk';
import {
  customerLabel,
  formatMoney,
  formatVoucherDate,
  formatVoucherDateTime,
  todayIso,
} from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';
import { QuotationDetailModal } from './QuotationDetailModal';

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

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
];

function canConvert(quotation: ShopQuotation) {
  if (quotation.converted_order) return false;
  const status = (quotation.status || '').toLowerCase();
  return status !== 'converted' && status !== 'cancelled' && status !== 'void' && status !== 'rejected' && status !== 'expired';
}

function canEdit(quotation: ShopQuotation) {
  const status = (quotation.status || '').toLowerCase();
  return status !== 'converted' && !quotation.converted_order;
}

function linesFromQuotation(quote: ShopQuotation): QuoteLine[] {
  const items = Array.isArray(quote.line_items) ? quote.line_items : [];
  const mapped = items
    .map((raw) => {
      const line = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      return {
        key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        productId: String(line.product_id || line.product || ''),
        name: String(line.name || ''),
        qty: String(line.quantity ?? line.qty ?? '1'),
        rate: String(line.unit_price ?? line.rate ?? '0'),
        gst: String(line.tax_rate ?? line.gst_rate ?? '0'),
      };
    })
    .filter((line) => line.productId || line.name);
  return mapped.length ? mapped : [emptyLine()];
}

export function ShopBooksQuotationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ShopBooksQuotations'>>();
  const openQuotationId = route.params?.quotationId;
  const client = useOpsClient();
  const toast = useToast();
  const auth = useAuth();
  const { businessId, tenantId } = useWorkspace();

  const [quotations, setQuotations] = useState<ShopQuotation[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailQuote, setDetailQuote] = useState<ShopQuotation | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [status, setStatus] = useState('draft');
  const [lines, setLines] = useState<QuoteLine[]>([emptyLine()]);
  const [notes, setNotes] = useState('');
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setCustomerId('');
    setValidUntil('');
    setStatus('draft');
    setLines([emptyLine()]);
    setNotes('');
  }, []);

  const openEdit = useCallback((quote: ShopQuotation) => {
    if (!canEdit(quote)) {
      toast.push('Converted quotations cannot be edited', 'error');
      return;
    }
    setDetailQuote(null);
    navigation.navigate('ShopPos', { mode: 'quotation', quotationId: quote.id });
  }, [navigation, toast]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: showForm ? (editingId ? 'Edit quotation' : 'New quotation') : 'Estimates / Proforma',
      headerRight: () => (
        <Pressable
          onPress={() => {
            if (showForm) closeForm();
            else navigation.navigate('ShopPos', { mode: 'quotation' });
          }}
          accessibilityRole="button"
          accessibilityLabel={showForm ? 'Close' : 'New quotation'}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showForm ? 'x' : 'plus'} size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, showForm, editingId, closeForm]);

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

  useEffect(() => {
    if (!openQuotationId || !client) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await client.shop.getQuotation(openQuotationId);
        if (!cancelled && response.data) setDetailQuote(response.data);
      } catch (err) {
        if (!cancelled) {
          toast.push(getApiErrorMessage(err, "Couldn't open that quotation."), 'error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openQuotationId, client, toast]);

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quotations.filter((item) => {
      const status = (item.status || '').toLowerCase();
      if (statusFilter === 'open' && !canConvert(item)) return false;
      if (statusFilter === 'converted' && status !== 'converted' && !item.converted_order) return false;
      if (!term) return true;
      return [
        item.quotation_number,
        item.status,
        String(item.total),
        item.valid_until ?? '',
        item.customer_name ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [quotations, search, statusFilter]);

  const quoteSummary = useMemo(() => {
    let total = 0;
    let open = 0;
    let converted = 0;
    for (const item of filtered) {
      total += Number(item.total ?? 0);
      if (canConvert(item)) open += 1;
      else if (item.converted_order || (item.status || '').toLowerCase() === 'converted') converted += 1;
    }
    return { total, open, converted, count: filtered.length };
  }, [filtered]);

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

  function closeDetail() {
    setDetailQuote(null);
    if (route.params?.quotationId) {
      navigation.setParams({ quotationId: undefined });
    }
  }

  async function submit() {
    if (!client || !businessId) return;
    const validLines = lines.filter((line) => line.productId && Number(line.qty) > 0);
    if (!validLines.length) {
      toast.push('Add at least one product line', 'error');
      return;
    }
    const linesPayload = validLines.map((line) => ({
      product_id: line.productId,
      quantity: line.qty,
      unit_price: line.rate,
      tax_rate: line.gst,
    }));
    setBusy(true);
    try {
      if (editingId) {
        const response = await client.shop.updateQuotation(editingId, {
          customer_id: customerId || null,
          valid_until: validUntil || null,
          notes: notes.trim(),
          status,
          lines: linesPayload,
        });
        toast.push(`Quotation ${response.data.quotation_number} updated`, 'success');
        closeForm();
        setDetailQuote(response.data);
        await load();
        return;
      }
      const response = await client.shop.createQuotation({
        business_id: businessId,
        customer_id: customerId || null,
        valid_until: validUntil || null,
        notes: notes.trim() || undefined,
        lines: linesPayload,
      });
      toast.push(`Quotation ${response.data.quotation_number} created`, 'success');
      closeForm();
      setDocActions({
        kind: 'quotation',
        id: response.data.id,
        number: response.data.quotation_number,
        businessId,
        phone: response.data.customer_phone || customers.find((c) => c.id === customerId)?.phone_number || '',
        email: response.data.customer_email || customers.find((c) => c.id === customerId)?.email || '',
      });
      await load();
    } catch (err) {
      toast.push(
        getApiErrorMessage(
          err,
          editingId ? "Couldn't update this quotation. Try again." : "Couldn't create this quotation. Try again.",
        ),
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onConvert(quotation: ShopQuotation) {
    if (!client) return;
    const ok = await confirmAction({
      title: 'Convert to sale',
      message: `Convert ${quotation.quotation_number} into a sale invoice?`,
      confirmLabel: 'Convert',
    });
    if (!ok) return;
    setConvertingId(quotation.id);
    try {
      const response = await client.shop.convertQuotationToSale(quotation.id, {
        voucher_date: todayIso(),
      });
      toast.push(`Converted to sale ${response.data.voucher_number}`, 'success');
      closeDetail();
      await load();
      navigation.navigate('ShopBooksSale', { voucherId: response.data.id });
    } catch (err) {
      toast.push(getApiErrorMessage(err, "Couldn't convert this quotation. Try again."), 'error');
    } finally {
      setConvertingId(null);
    }
  }

  if (showForm) {
    return (
      <FormScreen
        footer={
          <Button
            label={busy ? 'Saving…' : editingId ? 'Save quotation' : 'Create quotation'}
            loading={busy}
            fullWidth
            size="lg"
            onPress={() => void submit()}
          />
        }
      >
        <FormHero
          subtitle={
            editingId
              ? 'Update the customer, lines, validity, or status. Converted quotations stay locked.'
              : 'Add products and send this estimate. Convert it to a sale when the customer confirms.'
          }
        />
        <SelectField
          label="Customer"
          value={customerId}
          options={customerOptions}
          onChange={setCustomerId}
          optional
        />
        {editingId ? (
          <SelectField label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        ) : null}
        <Input
          label="Valid until"
          value={validUntil}
          onChangeText={setValidUntil}
          placeholder="YYYY-MM-DD"
          optional
        />
        <Text style={styles.section}>Items</Text>
        {lines.map((line) => (
          <View key={line.key} style={styles.lineCard}>
            <SelectField
              label="Product"
              value={line.productId}
              options={productOptions}
              onChange={(value) => selectProductForLine(line.key, value)}
            />
            <View style={styles.lineRow}>
              <View style={styles.lineField}>
                <Input
                  label="Qty"
                  value={line.qty}
                  onChangeText={(value) => setLine(line.key, { qty: value.replace(/[^0-9.]/g, '') })}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.lineField}>
                <Input
                  label="Rate"
                  value={line.rate}
                  onChangeText={(value) => setLine(line.key, { rate: value.replace(/[^0-9.]/g, '') })}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.lineField}>
                <Input
                  label="GST %"
                  value={line.gst}
                  onChangeText={(value) => setLine(line.key, { gst: value.replace(/[^0-9.]/g, '') })}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <View style={styles.rowBottom}>
              <Text style={styles.meta}>
                Line {formatMoney((Number(line.qty) || 0) * (Number(line.rate) || 0) * (1 + (Number(line.gst) || 0) / 100))}
              </Text>
              {lines.length > 1 ? (
                <Pressable onPress={() => removeLine(line.key)} style={styles.removeBtn} hitSlop={8}>
                  <Text style={styles.convertText}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
        <Pressable style={styles.addLineBtn} onPress={addLine}>
          <Feather name="plus" size={16} color={colors.primary} />
          <Text style={styles.addLineText}>Add line</Text>
        </Pressable>
        <View style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.meta}>Subtotal</Text>
            <Text style={styles.meta}>{formatMoney(totals.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.meta}>Tax</Text>
            <Text style={styles.meta}>{formatMoney(totals.tax)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.payableLabel}>Total</Text>
            <Text style={styles.payableValue}>{formatMoney(totals.total)}</Text>
          </View>
        </View>
        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          optional
        />
      </FormScreen>
    );
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <VoucherSummaryCards
          summary={{
            count: quoteSummary.count,
            totalAmount: quoteSummary.total,
            paidAmount: 0,
            unpaidAmount: 0,
            paidCount: 0,
            unpaidCount: 0,
          }}
          metrics={[
            { label: 'Total', value: formatMoney(quoteSummary.total), hint: String(quoteSummary.count) },
            { label: 'Open', value: String(quoteSummary.open), tone: 'due' },
            { label: 'Converted', value: String(quoteSummary.converted), tone: 'paid' },
          ]}
        />
        <View style={styles.topBar}>
          <SearchBar style={styles.searchFlex} value={search} onChangeText={setSearch} placeholder="Search quotations" />
          <FilterButton
            count={Number(Boolean(statusFilter))}
            onPress={() => setFiltersOpen(true)}
          />
        </View>
        <FilterSheet
          visible={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          onReset={() => setStatusFilter('')}
        >
          <FilterChoiceGroup
            label="Status"
            value={statusFilter}
            options={[
              { value: '', label: 'All' },
              { value: 'open', label: 'Open' },
              { value: 'converted', label: 'Converted' },
            ]}
            onChange={setStatusFilter}
          />
        </FilterSheet>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          {...groupedListProps(filtered.length)}
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => {
            const converting = convertingId === item.id;
            const customer =
              item.customer_name?.trim() ||
              (item.customer && customerById.get(item.customer)
                ? customerLabel(customerById.get(item.customer)!)
                : item.customer
                  ? 'Customer'
                  : 'No customer');
            const open = canConvert(item);
            const converted = Boolean(item.converted_order || (item.status || '').toLowerCase() === 'converted');
            return (
              <BooksDocumentRow
                title={customer}
                amount={formatMoney(item.total)}
                meta={`${item.quotation_number}${item.created_at ? ` · ${formatVoucherDateTime(item.created_at, item.created_at)}` : ''}${item.valid_until ? ` · Valid till ${formatVoucherDate(item.valid_until)}` : ''}`}
                badge={converted ? 'Converted' : item.status}
                badgeKind={converted ? 'paid' : open ? 'due' : 'neutral'}
                icon="file-text"
                iconTone={converted ? 'green' : 'navy'}
                onPress={() => setDetailQuote(item)}
                actionLabel={open ? (converting ? 'Converting…' : 'Convert to sale') : undefined}
                onAction={open && !converting ? () => void onConvert(item) : undefined}
                extraActions={
                  businessId
                    ? [
                        {
                          label: 'View',
                          icon: 'eye',
                          onPress: () => {
                            if (!auth.token) {
                              toast.push('Sign in again to view this quotation', 'error');
                              return;
                            }
                            void openShopDocumentHtmlView({
                              target: {
                                kind: 'quotation',
                                id: item.id,
                                number: item.quotation_number,
                                businessId,
                              },
                              token: auth.token,
                              tenantId,
                            }).catch((err) =>
                              toast.push(getApiErrorMessage(err, 'View failed'), 'error'),
                            );
                          },
                        },
                        {
                          label: 'Share',
                          icon: 'share-2',
                          onPress: () => {
                            const customer =
                              item.customer && customerById.get(item.customer)
                                ? customerById.get(item.customer)!
                                : null;
                            setDocActions({
                              kind: 'quotation',
                              id: item.id,
                              number: item.quotation_number,
                              businessId,
                              phone: item.customer_phone || customer?.phone_number || '',
                              email: item.customer_email || customer?.email || '',
                            });
                          },
                        },
                      ]
                    : undefined
                }
              />
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="file-text"
                title={search || statusFilter ? 'No matching quotations' : 'No quotations yet'}
                message="Create a quotation and convert it to a sale when the customer confirms."
                actionLabel="New quotation"
                onAction={() => navigation.navigate('ShopPos', { mode: 'quotation' })}
              />
            ) : null
          }
        />
      </View>
      <QuotationDetailModal
        quotation={detailQuote}
        visible={Boolean(detailQuote)}
        converting={Boolean(detailQuote && convertingId === detailQuote.id)}
        onClose={closeDetail}
        onEdit={openEdit}
        onConvert={(quote) => void onConvert(quote)}
        onUpdated={(quote) => {
          setDetailQuote(quote);
          setQuotations((current) => current.map((item) => (item.id === quote.id ? quote : item)));
        }}
      />
      <DocumentActionsSheet
        visible={Boolean(docActions)}
        onClose={() => setDocActions(null)}
        target={docActions}
        title={docActions ? `Quotation ${docActions.number || ''}` : 'Quotation'}
      />
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  searchFlex: { flex: 1 },
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
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.foreground,
    backgroundColor: colors.inputBackground,
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
