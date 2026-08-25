import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { SelectField } from '../../components/SelectField';
import { DateField } from '../../components/DateField';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { StatTile } from '../../components/ui/StatTile';
import { TileGrid } from '../../components/ui/TileGrid';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { Customer, ShopBooksVoucher, ShopCashAccount, ShopSupplier } from '@ie-orbit/sdk';
import {
  customerLabel,
  formatMoney,
  isVoidedVoucher,
  supplierLabel,
  todayIso,
  voucherAmount,
  voucherStatusStyle,
} from './shopBooksHelpers';

type PaymentType = 'payment_in' | 'payment_out';

export function ShopBooksCashScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [accounts, setAccounts] = useState<ShopCashAccount[]>([]);
  const [payments, setPayments] = useState<ShopBooksVoucher[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<ShopSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<'cash' | 'bank'>('cash');
  const [accountOpening, setAccountOpening] = useState('0');

  const [paymentType, setPaymentType] = useState<PaymentType>('payment_in');
  const [paymentPartyId, setPaymentPartyId] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [paymentNotes, setPaymentNotes] = useState('');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => setShowAccountForm((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel={showAccountForm ? 'Close' : 'Add account'}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showAccountForm ? 'x' : 'plus'} size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, showAccountForm]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [accountsRes, paymentsInRes, paymentsOutRes, customersRes, suppliersRes] = await Promise.all([
        client.shop.listCashAccounts({ business_id: businessId }),
        client.shop.listVouchers({ business_id: businessId, type: 'payment_in' }),
        client.shop.listVouchers({ business_id: businessId, type: 'payment_out' }),
        client.customers.list({ business: businessId }),
        client.shop.listSuppliers({ business_id: businessId }),
      ]);
      setAccounts(accountsRes.data ?? []);
      const merged = [...(paymentsInRes.data ?? []), ...(paymentsOutRes.data ?? [])].sort((a, b) =>
        (b.created_at ?? '').localeCompare(a.created_at ?? ''),
      );
      setPayments(merged);
      setCustomers(customersRes.data ?? []);
      setSuppliers(suppliersRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cash & bank');
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

  const accountOptions = useMemo(
    () => accounts.map((account) => ({ value: account.id, label: `${account.name} (${account.account_type})` })),
    [accounts],
  );

  const partyOptions = useMemo(() => {
    if (paymentType === 'payment_in') {
      return [
        { value: '', label: 'No customer' },
        ...customers.map((customer) => ({ value: customer.id, label: customerLabel(customer) })),
      ];
    }
    return [
      { value: '', label: 'No supplier' },
      ...suppliers.map((supplier) => ({ value: supplier.id, label: supplierLabel(supplier) })),
    ];
  }, [paymentType, customers, suppliers]);

  const cashTotal = useMemo(
    () => accounts.filter((a) => a.account_type === 'cash').reduce((sum, a) => sum + voucherAmount(a.current_balance), 0),
    [accounts],
  );
  const bankTotal = useMemo(
    () => accounts.filter((a) => a.account_type === 'bank').reduce((sum, a) => sum + voucherAmount(a.current_balance), 0),
    [accounts],
  );
  const paymentInTotal = useMemo(
    () =>
      payments
        .filter((p) => p.voucher_type === 'payment_in' && !isVoidedVoucher(p.status))
        .reduce((sum, p) => sum + voucherAmount(p.total), 0),
    [payments],
  );
  const paymentOutTotal = useMemo(
    () =>
      payments
        .filter((p) => p.voucher_type === 'payment_out' && !isVoidedVoucher(p.status))
        .reduce((sum, p) => sum + voucherAmount(p.total), 0),
    [payments],
  );

  async function saveAccount() {
    if (!client || !businessId || !accountName.trim()) {
      toast.push('Enter an account name', 'error');
      return;
    }
    setBusy(true);
    try {
      await client.shop.createCashAccount({
        business_id: businessId,
        name: accountName.trim(),
        account_type: accountType,
        opening_balance: accountOpening || '0',
      });
      toast.push('Account added', 'success');
      setShowAccountForm(false);
      setAccountName('');
      setAccountType('cash');
      setAccountOpening('0');
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to add account', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment() {
    if (!client || !businessId) return;
    const numeric = Number(paymentAmount);
    if (!paymentAccountId || !numeric || numeric <= 0) {
      toast.push('Choose an account and enter an amount', 'error');
      return;
    }
    setBusy(true);
    try {
      const response = await client.shop.createVoucher({
        voucher_type: paymentType,
        business_id: businessId,
        customer_id: paymentType === 'payment_in' ? paymentPartyId || null : undefined,
        supplier_id: paymentType === 'payment_out' ? paymentPartyId || null : undefined,
        cash_account_id: paymentAccountId,
        amount: numeric,
        voucher_date: paymentDate || undefined,
        notes: paymentNotes.trim() || undefined,
      });
      toast.push(`${paymentType === 'payment_in' ? 'Payment in' : 'Payment out'} ${response.data.voucher_number} recorded`, 'success');
      setPaymentPartyId('');
      setPaymentAmount('');
      setPaymentNotes('');
      setPaymentDate(todayIso());
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to record payment', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onVoid(voucher: ShopBooksVoucher) {
    if (!client) return;
    Alert.alert('Void payment', `Void ${voucher.voucher_number}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Void',
        style: 'destructive',
        onPress: async () => {
          try {
            await client.shop.voidVoucher(voucher.id);
            toast.push('Payment voided', 'success');
            await load();
          } catch (err) {
            toast.push(err instanceof Error ? err.message : 'Unable to void payment', 'error');
          }
        },
      },
    ]);
  }

  return (
    <DesktopPage>
      <RefreshableScrollView
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TileGrid>
          <StatTile label="Cash in hand" value={formatMoney(cashTotal)} />
          <StatTile label="Bank balance" value={formatMoney(bankTotal)} />
          <StatTile label="Payment in" value={formatMoney(paymentInTotal)} tone="positive" hint="Collected" />
          <StatTile label="Payment out" value={formatMoney(paymentOutTotal)} tone="negative" hint="Paid out" />
        </TileGrid>

        {showAccountForm ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Add account</Text>
            <TextInput
              style={styles.input}
              value={accountName}
              onChangeText={setAccountName}
              placeholder="Account name"
              placeholderTextColor={colors.mutedForeground}
            />
            <View style={styles.chipRow}>
              <Chip label="Cash" active={accountType === 'cash'} onPress={() => setAccountType('cash')} />
              <Chip label="Bank" active={accountType === 'bank'} onPress={() => setAccountType('bank')} />
            </View>
            <TextInput
              style={styles.input}
              value={accountOpening}
              onChangeText={(value) => setAccountOpening(value.replace(/[^0-9.]/g, ''))}
              placeholder="Opening balance"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.mutedForeground}
            />
            <Button label={busy ? 'Saving…' : 'Save account'} loading={busy} fullWidth onPress={() => void saveAccount()} />
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Accounts</Text>
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        {accounts.map((account) => (
          <View key={account.id} style={styles.accountRow}>
            <View style={styles.accountIcon}>
              <Feather name={account.account_type === 'bank' ? 'credit-card' : 'dollar-sign'} size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{account.name}</Text>
              <Text style={styles.meta}>{account.account_type}</Text>
            </View>
            <Text style={styles.balance}>{formatMoney(account.current_balance)}</Text>
          </View>
        ))}
        {!loading && !accounts.length ? (
          <EmptyState
            icon="credit-card"
            title="No accounts yet"
            message="Add a cash or bank account to record payments."
            actionLabel="Add account"
            onAction={() => setShowAccountForm(true)}
          />
        ) : null}

        <Text style={styles.sectionTitle}>Record payment</Text>
        <View style={styles.card}>
          <View style={styles.chipRow}>
            <Chip
              label="Payment in"
              active={paymentType === 'payment_in'}
              onPress={() => {
                setPaymentType('payment_in');
                setPaymentPartyId('');
              }}
            />
            <Chip
              label="Payment out"
              active={paymentType === 'payment_out'}
              onPress={() => {
                setPaymentType('payment_out');
                setPaymentPartyId('');
              }}
            />
          </View>

          <SelectField
            label={paymentType === 'payment_in' ? 'From customer' : 'To supplier'}
            value={paymentPartyId}
            options={partyOptions}
            onChange={setPaymentPartyId}
            searchable
          />
          <SelectField label="Account" value={paymentAccountId} options={accountOptions} onChange={setPaymentAccountId} />
          <TextInput
            style={styles.input}
            value={paymentAmount}
            onChangeText={(value) => setPaymentAmount(value.replace(/[^0-9.]/g, ''))}
            placeholder="Amount"
            keyboardType="decimal-pad"
            placeholderTextColor={colors.mutedForeground}
          />
          <DateField label="Date" value={paymentDate} onChange={setPaymentDate} allowClear={false} />
          <TextInput
            style={[styles.input, styles.notes]}
            value={paymentNotes}
            onChangeText={setPaymentNotes}
            placeholder="Notes (optional)"
            multiline
            placeholderTextColor={colors.mutedForeground}
          />
          <Button
            label={busy ? 'Saving…' : `Record ${paymentType === 'payment_in' ? 'payment in' : 'payment out'}`}
            loading={busy}
            fullWidth
            onPress={() => void submitPayment()}
          />
        </View>

        <Text style={styles.sectionTitle}>Recent payments</Text>
        {payments.slice(0, 25).map((item) => {
          const badge = voucherStatusStyle(item.status);
          const isIn = item.voucher_type === 'payment_in';
          const canVoid = !isVoidedVoucher(item.status);
          return (
            <View key={item.id} style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.name}>
                  {isIn ? '↓ In' : '↑ Out'} · {item.voucher_number}
                </Text>
                <Text style={[styles.total, isIn ? styles.inAmount : styles.outAmount]}>{formatMoney(item.total)}</Text>
              </View>
              <Text style={styles.meta}>
                {item.customer_name || item.supplier_name || item.cash_account_name || '—'}
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
        })}
        {!loading && !payments.length ? <Text style={styles.meta}>No payments recorded yet.</Text> : null}
      </RefreshableScrollView>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.sm, paddingBottom: spacing.xxxl },
  error: { color: colors.destructive, marginBottom: spacing.sm },
  sectionTitle: { ...typography.title, fontSize: 16, color: colors.foreground, marginTop: spacing.md },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.foreground },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  notes: { minHeight: 64, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  accountIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  balance: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: 4,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  total: { fontFamily: fonts.bodyBold, fontSize: 15 },
  inAmount: { color: colors.success },
  outAmount: { color: colors.destructive },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  voidText: { color: colors.destructive, fontSize: 13, fontWeight: '700' },
});
