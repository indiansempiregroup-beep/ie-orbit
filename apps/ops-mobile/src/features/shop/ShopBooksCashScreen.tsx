import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { SelectField } from '../../components/SelectField';
import { DateField } from '../../components/DateField';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { SearchBar } from '../../components/SearchBar';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { Customer, ShopBooksVoucher, ShopCashAccount, ShopSupplier } from '@ie-orbit/sdk';
import {
  customerLabel,
  formatMoney,
  formatVoucherDateTime,
  isVoidedVoucher,
  supplierLabel,
  todayIso,
  voucherAmount,
} from './shopBooksHelpers';
import { VoucherSummaryCards } from './VoucherSummaryCards';
import { BooksDocumentRow } from './BooksDocumentRow';
import { GroupedList } from '../../components/ui/GroupedList';

type PaymentType = 'payment_in' | 'payment_out';

export function ShopBooksCashScreen() {
  const insets = useSafeAreaInsets();
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
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentType>('all');

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
  const visiblePayments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payments.filter((item) => {
      if (paymentFilter !== 'all' && item.voucher_type !== paymentFilter) return false;
      if (!term) return true;
      return [
        item.voucher_number,
        item.customer_name ?? '',
        item.supplier_name ?? '',
        item.cash_account_name ?? '',
        String(item.total),
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [payments, paymentFilter, search]);

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
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl }]}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <VoucherSummaryCards
          metrics={[
            { label: 'Cash', value: formatMoney(cashTotal) },
            { label: 'Bank', value: formatMoney(bankTotal) },
            {
              label: 'In',
              value: formatMoney(paymentInTotal),
              tone: 'paid',
              hint: `Out ${formatMoney(paymentOutTotal)}`,
            },
          ]}
        />

        {showAccountForm ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Add account</Text>
            <Input
              label="Account name"
              required
              value={accountName}
              onChangeText={setAccountName}
              placeholder="Account name"
            />
            <View style={styles.chipRow}>
              <Chip label="Cash" active={accountType === 'cash'} onPress={() => setAccountType('cash')} />
              <Chip label="Bank" active={accountType === 'bank'} onPress={() => setAccountType('bank')} />
            </View>
            <Input
              label="Opening balance"
              optional
              value={accountOpening}
              onChangeText={(value) => setAccountOpening(value.replace(/[^0-9.]/g, ''))}
              placeholder="Opening balance"
              keyboardType="decimal-pad"
            />
            <Button label={busy ? 'Saving…' : 'Save account'} loading={busy} fullWidth onPress={() => void saveAccount()} />
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Accounts</Text>
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <GroupedList>
          {accounts.map((account) => (
            <BooksDocumentRow
              key={account.id}
              title={account.name}
              amount={formatMoney(account.current_balance)}
              meta={account.account_type}
              badge={account.is_active === false ? 'Inactive' : undefined}
              icon={account.account_type === 'bank' ? 'credit-card' : 'dollar-sign'}
              iconTone={account.account_type === 'bank' ? 'navy' : 'green'}
            />
          ))}
        </GroupedList>
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
            required
            value={paymentPartyId}
            options={partyOptions}
            onChange={setPaymentPartyId}
            searchable
          />
          <SelectField label="Account" required value={paymentAccountId} options={accountOptions} onChange={setPaymentAccountId} />
          <Input
            label="Amount"
            required
            value={paymentAmount}
            onChangeText={(value) => setPaymentAmount(value.replace(/[^0-9.]/g, ''))}
            placeholder="Amount"
            keyboardType="decimal-pad"
          />
          <DateField label="Date" required value={paymentDate} onChange={setPaymentDate} allowClear={false} />
          <Input
            label="Notes"
            optional
            value={paymentNotes}
            onChangeText={setPaymentNotes}
            placeholder="Notes"
            multiline
          />
          <Button
            label={busy ? 'Saving…' : `Record ${paymentType === 'payment_in' ? 'payment in' : 'payment out'}`}
            loading={busy}
            fullWidth
            onPress={() => void submitPayment()}
          />
        </View>

        <Text style={styles.sectionTitle}>Recent payments</Text>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search payments" style={styles.search} />
        <View style={styles.chipRow}>
          <Chip label="All" active={paymentFilter === 'all'} onPress={() => setPaymentFilter('all')} />
          <Chip label="In" active={paymentFilter === 'payment_in'} onPress={() => setPaymentFilter('payment_in')} />
          <Chip label="Out" active={paymentFilter === 'payment_out'} onPress={() => setPaymentFilter('payment_out')} />
        </View>
        <GroupedList>
          {visiblePayments.slice(0, 25).map((item) => {
            const isIn = item.voucher_type === 'payment_in';
            const voided = isVoidedVoucher(item.status);
            return (
              <BooksDocumentRow
                key={item.id}
                title={item.customer_name || item.supplier_name || item.cash_account_name || (isIn ? 'Payment in' : 'Payment out')}
                amount={formatMoney(item.total)}
                amountTone={voided ? undefined : isIn ? 'paid' : 'due'}
                meta={`${item.voucher_number}${item.voucher_date || item.created_at ? ` · ${formatVoucherDateTime(item.voucher_date, item.created_at)}` : ''}`}
                badge={item.status}
                badgeKind={voided ? 'void' : isIn ? 'paid' : 'due'}
                icon={isIn ? 'arrow-down' : 'arrow-up'}
                iconTone={voided ? 'rose' : isIn ? 'green' : 'coral'}
                dimmed={voided}
                actionLabel={!voided ? 'Void' : undefined}
                onAction={!voided ? () => void onVoid(item) : undefined}
              />
            );
          })}
        </GroupedList>
        {!loading && !payments.length ? <Text style={styles.meta}>No payments recorded yet.</Text> : null}
      </RefreshableScrollView>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.sm, paddingBottom: spacing.xxxl },
  search: { marginBottom: 0 },
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
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.foreground,
    backgroundColor: colors.inputBackground,
  },
  notes: { minHeight: 64, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
});
