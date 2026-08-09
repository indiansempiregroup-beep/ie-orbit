import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type {
  Customer,
  ShopBooksVoucher,
  ShopCashAccount,
  ShopProduct,
  ShopSupplier,
} from '@ie-platform/sdk';
import {
  customerLabel,
  formatMoney,
  isVoidedVoucher,
  supplierLabel,
  todayIso,
  voucherPartyLabel,
  voucherStatusStyle,
} from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';

type NoteKind = 'credit_note' | 'debit_note';

type NoteLine = {
  key: string;
  productId: string;
  name: string;
  qty: string;
  rate: string;
  gst: string;
};

function emptyLine(): NoteLine {
  return {
    key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    productId: '',
    name: '',
    qty: '1',
    rate: '0',
    gst: '0',
  };
}

export function ShopBooksNotesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [noteKind, setNoteKind] = useState<NoteKind>('credit_note');
  const [vouchers, setVouchers] = useState<ShopBooksVoucher[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<ShopSupplier[]>([]);
  const [accounts, setAccounts] = useState<ShopCashAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [voucherDate, setVoucherDate] = useState(todayIso());
  const [lines, setLines] = useState<NoteLine[]>([emptyLine()]);
  const [amountPaid, setAmountPaid] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [notes, setNotes] = useState('');

  const closeForm = useCallback(() => {
    setShowForm(false);
    setCustomerId('');
    setSupplierId('');
    setVoucherDate(todayIso());
    setLines([emptyLine()]);
    setAmountPaid('');
    setCashAccountId('');
    setNotes('');
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => (showForm ? closeForm() : setShowForm(true))}
          accessibilityRole="button"
          accessibilityLabel={showForm ? 'Close' : 'New note'}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showForm ? 'x' : 'plus'} size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, showForm, closeForm]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [vouchersRes, productsRes, customersRes, suppliersRes, accountsRes] = await Promise.all([
        client.shop.listVouchers({ business_id: businessId, type: noteKind }),
        client.shop.listProducts({ business_id: businessId, status: 'active' }),
        client.customers.list({ business: businessId }),
        client.shop.listSuppliers({ business_id: businessId }),
        client.shop.listCashAccounts({ business_id: businessId }),
      ]);
      setVouchers(vouchersRes.data ?? []);
      setProducts(productsRes.data ?? []);
      setCustomers(customersRes.data ?? []);
      setSuppliers(suppliersRes.data ?? []);
      setAccounts(accountsRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [businessId, client, noteKind]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const customerOptions = useMemo(
    () => [
      { value: '', label: 'Select customer' },
      ...customers.map((customer) => ({ value: customer.id, label: customerLabel(customer) })),
    ],
    [customers],
  );

  const supplierOptions = useMemo(
    () => [
      { value: '', label: 'Select supplier' },
      ...suppliers.map((supplier) => ({ value: supplier.id, label: supplierLabel(supplier) })),
    ],
    [suppliers],
  );

  const productOptions = useMemo(
    () => products.map((product) => ({ value: product.id, label: `${product.name} · ${formatMoney(product.price)}` })),
    [products],
  );

  const accountOptions = useMemo(
    () => [
      { value: '', label: 'Not settled yet' },
      ...accounts.map((account) => ({ value: account.id, label: `${account.name} (${account.account_type})` })),
    ],
    [accounts],
  );

  function setLine(key: string, patch: Partial<NoteLine>) {
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
    if (noteKind === 'credit_note' && !customerId) {
      toast.push('Select a customer', 'error');
      return;
    }
    if (noteKind === 'debit_note' && !supplierId) {
      toast.push('Select a supplier', 'error');
      return;
    }
    setBusy(true);
    try {
      const response = await client.shop.createVoucher({
        voucher_type: noteKind,
        business_id: businessId,
        customer_id: noteKind === 'credit_note' ? customerId : null,
        supplier_id: noteKind === 'debit_note' ? supplierId : null,
        voucher_date: voucherDate || undefined,
        lines: validLines.map((line) => ({
          product_id: line.productId,
          name: line.name,
          qty: line.qty,
          rate: line.rate,
          gst_rate: line.gst,
        })),
        amount_paid: amountPaid ? Number(amountPaid) : undefined,
        cash_account_id: amountPaid ? cashAccountId || undefined : undefined,
        notes: notes.trim() || undefined,
      });
      toast.push(
        `${noteKind === 'credit_note' ? 'Credit' : 'Debit'} note ${response.data.voucher_number} recorded`,
        'success',
      );
      closeForm();
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to record note', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onVoid(voucher: ShopBooksVoucher) {
    if (!client) return;
    Alert.alert('Void note', `Void ${voucher.voucher_number}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Void',
        style: 'destructive',
        onPress: async () => {
          try {
            await client.shop.voidVoucher(voucher.id);
            toast.push('Note voided', 'success');
            await load();
          } catch (err) {
            toast.push(err instanceof Error ? err.message : 'Unable to void note', 'error');
          }
        },
      },
    ]);
  }

  if (showForm) {
    return (
      <FormScreen
        footer={
          <Button
            label={
              busy
                ? 'Saving…'
                : `Record ${noteKind === 'credit_note' ? 'credit' : 'debit'} note · ${formatMoney(totals.total)}`
            }
            loading={busy}
            fullWidth
            size="lg"
            onPress={() => void submit()}
          />
        }
      >
        <Text style={styles.formTitle}>
          {noteKind === 'credit_note' ? 'New credit note' : 'New debit note'}
        </Text>

        <View style={styles.chipRow}>
          <Chip
            label="Credit note"
            active={noteKind === 'credit_note'}
            onPress={() => {
              setNoteKind('credit_note');
              setSupplierId('');
            }}
          />
          <Chip
            label="Debit note"
            active={noteKind === 'debit_note'}
            onPress={() => {
              setNoteKind('debit_note');
              setCustomerId('');
            }}
          />
        </View>

        {noteKind === 'credit_note' ? (
          <SelectField
            label="Customer"
            value={customerId}
            options={customerOptions}
            onChange={setCustomerId}
            searchable
          />
        ) : (
          <SelectField
            label="Supplier"
            value={supplierId}
            options={supplierOptions}
            onChange={setSupplierId}
            searchable
          />
        )}

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={voucherDate}
            onChangeText={setVoucherDate}
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

        <Text style={styles.section}>Settlement (optional)</Text>
        <TextInput
          style={styles.input}
          value={amountPaid}
          onChangeText={(value) => setAmountPaid(value.replace(/[^0-9.]/g, ''))}
          placeholder="Amount settled now"
          keyboardType="decimal-pad"
          placeholderTextColor={colors.mutedForeground}
        />
        {amountPaid ? (
          <SelectField label="Cash account" value={cashAccountId} options={accountOptions} onChange={setCashAccountId} />
        ) : null}

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
    <View style={[styles.screen, { paddingTop: spacing.md }]}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
      <FlatList
        data={vouchers}
        keyExtractor={(item) => item.id}
        refreshControl={shopListRefreshControl(refreshing, onRefresh)}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
        ListHeaderComponent={
          <View style={styles.chipRow}>
            <Chip label="Credit note" active={noteKind === 'credit_note'} onPress={() => setNoteKind('credit_note')} />
            <Chip label="Debit note" active={noteKind === 'debit_note'} onPress={() => setNoteKind('debit_note')} />
          </View>
        }
        renderItem={({ item }) => {
          const badge = voucherStatusStyle(item.status);
          const canVoid = !isVoidedVoucher(item.status);
          return (
            <View style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.name}>{item.voucher_number}</Text>
                <Text style={styles.total}>{formatMoney(item.total)}</Text>
              </View>
              <Text style={styles.meta}>
                {voucherPartyLabel(item)}
                {item.voucher_date ? ` · ${item.voucher_date}` : ''}
              </Text>
              <View style={styles.rowBottom}>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.text }]}>{item.status}</Text>
                </View>
                {canVoid ? (
                  <Pressable onPress={() => void onVoid(item)} hitSlop={8}>
                    <Text style={styles.voidText}>Void</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="file-minus"
              title={noteKind === 'credit_note' ? 'No credit notes yet' : 'No debit notes yet'}
              message={
                noteKind === 'credit_note'
                  ? 'Issue credit notes against customer sales for returns or adjustments.'
                  : 'Issue debit notes against supplier purchases for returns or adjustments.'
              }
              actionLabel="Record a note"
              onAction={() => setShowForm(true)}
            />
          ) : null
        }
      />
    </View>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
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
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  voidText: { color: colors.destructive, fontSize: 13, fontWeight: '700' },
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
